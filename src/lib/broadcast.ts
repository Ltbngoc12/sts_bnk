// Broadcast domain logic — FSD v0.5 §5.11 / §10.
//
// Pure functions (no DB / no network): callers fetch config from broadcastStore and
// pass it in. Mirrors how seriesEngine.ts keeps logic separate from persistence, so
// this can be unit-tested and reused by server actions, the EOD cron and the UI.

import type { DistributionGroup } from './groups';
import type { BroadcastTemplate, BroadcastMatrixRule, BroadcastConfig } from './broadcastConfig';
import { DEFAULT_BROADCAST_CONFIG } from './broadcastConfig';

// Normalize an incident's numeric crisis level (1–5) to the matrix's "Level N" key.
export function crisisLevelKey(level: number | undefined | null): string {
  const n = typeof level === 'number' && level >= 1 && level <= 5 ? level : 4; // §5.2d default
  return `Level ${n}`;
}

// ── C1 gate (FSD §5.11.1a + §5.1.2) ────────────────────────────────────────────
// A closure broadcast is only auto-queued where "required under the configured
// broadcast rules". Driven by incident Category: Operational requires it by default;
// Informational/Exercise explicitly do not; Backdated is excluded by default.
export function isClosureBroadcastRequired(
  category: string | undefined | null,
  config?: BroadcastConfig
): boolean {
  const cfg = config || DEFAULT_BROADCAST_CONFIG;
  const cat = category || 'Operational Incident';
  return cfg.closureRequiredCategories.includes(cat);
}

// True if a multi-select field (crisisLevels/incidentTypes/incidentSubTypes) is a
// wildcard — either explicitly containing 'Any', or empty/undefined (fail-open,
// same semantics the old singular-string fields had for a missing value).
function isWildcard(values: string[] | undefined): boolean {
  return !values || values.length === 0 || values.includes('Any');
}

// Pick the most specific matrix rule for an incident (broadcast type + incident
// type + sub-type + crisis level), falling back to less specific matches, then
// any rule at that crisis level. Deactivated rules (status !== 'Active') are
// never resolved — toggling a rule off in the admin UI takes effect immediately
// without deleting it.
//
// crisisLevels/incidentTypes/incidentSubTypes are multi-select (2026-07-25, Kyle) —
// a rule matches if the incident's value is IN the rule's list, or the list is a
// wildcard (see isWildcard above).
//
// `broadcastType` is optional for backward compatibility with any existing caller
// that doesn't pass one, but resolveClosureBroadcast/resolveEodBroadcast both pass
// it (added 2026-07-25, Phương án B): without it, a Closure rule's `templateId`
// could otherwise leak into an End-of-Day resolution just because both share the
// same crisis-level/incident-type shape — recipients/channels were already scoped
// this way in intent (§10.6), this just makes template selection safe too.
export function resolveMatrixRule(
  matrix: BroadcastMatrixRule[],
  opts: { incidentType?: string; incidentSubType?: string; crisisLevel: string; broadcastType?: string }
): BroadcastMatrixRule | undefined {
  const { incidentType, incidentSubType, crisisLevel, broadcastType } = opts;
  const activeOnly = matrix.filter((r) => r.status !== 'Inactive');
  const scoped = broadcastType ? activeOnly.filter((r) => r.broadcastType === broadcastType) : activeOnly;
  const atLevel = scoped.filter((r) => isWildcard(r.crisisLevels) || r.crisisLevels.includes(crisisLevel));
  const typeMatch = (r: BroadcastMatrixRule) =>
    isWildcard(r.incidentTypes) || (!!incidentType && r.incidentTypes!.includes(incidentType));
  const subMatch = (r: BroadcastMatrixRule) =>
    isWildcard(r.incidentSubTypes) || (!!incidentSubType && r.incidentSubTypes!.includes(incidentSubType));
  const isSpecificType = (r: BroadcastMatrixRule) => !isWildcard(r.incidentTypes);

  return (
    atLevel.find((r) => typeMatch(r) && subMatch(r) && isSpecificType(r)) ||
    atLevel.find((r) => typeMatch(r) && subMatch(r)) ||
    atLevel[0]
  );
}

// Expand one or more distribution groups (by name) into a de-duplicated list of
// member emails. Multi-select (2026-07-25, Kyle) — a rule can fan out to several
// recipient groups at once; emails are unioned and de-duplicated across all of them.
export function resolveGroupEmails(groups: DistributionGroup[], groupNames?: string[]): string[] {
  if (!groupNames || groupNames.length === 0) return [];
  const emails = groups
    .filter((g) => groupNames.includes(g.name) && g.status === 'Active')
    .flatMap((g) => g.members.map((m) => m.email))
    .filter(Boolean);
  return Array.from(new Set(emails));
}

// Defensive fallback ONLY — every Matrix Rule created/edited via the admin UI now
// names an exact templateId (mandatory as of 2026-07-25, Kyle; see BroadcastTemplate
// comment in broadcastConfig.ts for why templates no longer carry their own
// incident type/sub-type/crisis level). This just picks the first Active template
// in the right category, for the edge case of a legacy Mongo row that predates
// templateId and hasn't been re-saved yet. Not exposed anywhere in the admin UI.
export function resolveTemplate(
  templates: BroadcastTemplate[],
  opts: { category: string }
): BroadcastTemplate | undefined {
  return templates.find((t) => t.category === opts.category && t.status !== 'Inactive');
}

// Look up a template by id, honouring the Active-only rule (used when a Matrix
// Rule names an exact templateId — Phương án B, 2026-07-25).
export function resolveTemplateById(
  templates: BroadcastTemplate[],
  templateId: string | undefined
): BroadcastTemplate | undefined {
  if (!templateId) return undefined;
  return templates.find((t) => t.id === templateId && t.status !== 'Inactive');
}

// {variable} substitution — unmatched tokens are left blank.
export function renderTemplate(body: string, vars: Record<string, string | undefined>): string {
  return body.replace(/\{(\w+)\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ''));
}

// Resolve the full default recipient list + template + rendered content for a
// closure broadcast, given the incident and the current config. Recipients are a
// SNAPSHOT (never a live group reference) per §10.3d.
export interface ResolvedBroadcast {
  recipients: string[];
  templateUsed: string;
  templateId?: string;
  content: string;
  recipientGroups: string[];
  channels: string[];
  sensitiveFields: string[];
}

export function resolveClosureBroadcast(input: {
  incident: any;
  caseId: string;
  groups: DistributionGroup[];
  templates: BroadcastTemplate[];
  matrix: BroadcastMatrixRule[];
}): ResolvedBroadcast {
  const { incident, caseId, groups, templates, matrix } = input;
  const levelKey = crisisLevelKey(incident?.crisisLevel);

  const rule = resolveMatrixRule(matrix, {
    incidentType: incident?.type,
    incidentSubType: incident?.subType,
    crisisLevel: levelKey,
    broadcastType: 'Closure Broadcast',
  });
  const recipients = resolveGroupEmails(groups, rule?.recipientGroups);
  // Phương án B (2026-07-25): a Matrix Rule may name an exact template. Prefer
  // that over the category+incidentType guess when the rule sets one.
  const template =
    resolveTemplateById(templates, rule?.templateId) ||
    resolveTemplate(templates, { category: 'Closure Broadcast' });

  const vars: Record<string, string | undefined> = {
    case_id: caseId,
    incident_id: incident?.id,
    incident_title: incident?.title,
    incident_type: incident?.type,
    incident_subtype: incident?.subType,
    location: incident?.location?.commonName || 'N/A',
    crisis_level: levelKey,
    status: incident?.status,
    closed_at: incident?.closedAt,
    closed_by: incident?.closedBy,
    time: new Date().toISOString(),
    summary: incident?.summary || incident?.completionRemarks || 'N/A',
  };

  const content = template
    ? renderTemplate(template.body, vars)
    : [
        'INCIDENT CLOSURE NOTICE',
        `Case ID: ${caseId}`,
        `Incident ID: ${incident?.id}`,
        `Title: ${incident?.title}`,
      ].join('\n');

  return {
    recipients,
    templateUsed: template?.name || 'Closure Broadcast Template',
    templateId: template?.id,
    content,
    recipientGroups: rule?.recipientGroups || [],
    channels: rule?.deliveryChannels || ['Email'],
    sensitiveFields: template?.sensitiveFields || [],
  };
}

// Default per-status delivery counts for a freshly dispatched broadcast (§10.9d).
// The mock email gateway marks everything "sent"; a real gateway would update these.
export function initialDeliveryCounts(recipientCount: number) {
  return { sent: recipientCount, delivered: 0, failed: 0, pending: 0 };
}

// Resolve the default recipient list + template + rendered content for an
// End-of-Day Interim Broadcast candidate (FSD §5.11.2 / §10.7), mirroring
// resolveClosureBroadcast so the Duty Manager's review queue arrives pre-filled
// instead of empty (§10.3c — auto-fill by incident type + crisis level).
export function resolveEodBroadcast(input: {
  incident: any;
  caseId: string;
  groups: DistributionGroup[];
  templates: BroadcastTemplate[];
  matrix: BroadcastMatrixRule[];
}): ResolvedBroadcast {
  const { incident, caseId, groups, templates, matrix } = input;
  const levelKey = crisisLevelKey(incident?.crisisLevel);

  const rule = resolveMatrixRule(matrix, {
    incidentType: incident?.type,
    incidentSubType: incident?.subType,
    crisisLevel: levelKey,
    broadcastType: 'End-of-Day Interim Broadcast',
  });
  const recipients = resolveGroupEmails(groups, rule?.recipientGroups);
  // Phương án B (2026-07-25): prefer the Matrix Rule's exact template if set.
  const template =
    resolveTemplateById(templates, rule?.templateId) ||
    resolveTemplate(templates, { category: 'End-of-Day Interim Broadcast' });

  const vars: Record<string, string | undefined> = {
    case_id: caseId,
    incident_id: incident?.id,
    incident_title: incident?.title,
    incident_type: incident?.type,
    incident_subtype: incident?.subType,
    location: incident?.location?.commonName || 'N/A',
    crisis_level: levelKey,
    status: incident?.status,
    time: new Date().toISOString(),
    summary: incident?.summary || 'N/A',
  };

  const content = template
    ? renderTemplate(template.body, vars)
    : [
        'END-OF-DAY INTERIM UPDATE',
        `Case ID: ${caseId}`,
        `Incident ID: ${incident?.id}`,
        `Title: ${incident?.title}`,
        `Status: ${incident?.status}`,
      ].join('\n');

  return {
    recipients,
    templateUsed: template?.name || 'End-of-Day Interim Broadcast',
    templateId: template?.id,
    content,
    recipientGroups: rule?.recipientGroups || [],
    channels: rule?.deliveryChannels || ['Email'],
    sensitiveFields: template?.sensitiveFields || [],
  };
}

// ── End-of-Day queue (FSD §5.11.2 / §10.7) ─────────────────────────────────────
// An incident is eligible for the interim broadcast queue if it is still open at
// EOD cutover. "Open" = not Closed and not already Pending Endorsement/awaiting
// endorsement. Exact criteria are TBC in FSD (§15.3) — kept behind this predicate.
const OPEN_STATUSES_EXCLUDED = ['Closed', 'Pending Endorsement'];
export function isEodEligible(incident: any): boolean {
  if (!incident) return false;
  return !OPEN_STATUSES_EXCLUDED.includes(incident.status);
}

export function buildEodCandidates(incidents: any[]): any[] {
  return (incidents || []).filter(isEodEligible);
}
