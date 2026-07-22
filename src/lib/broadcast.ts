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

// Pick the most specific matrix rule for an incident (type + sub-type + crisis level),
// falling back to less specific matches, then any rule at that crisis level.
export function resolveMatrixRule(
  matrix: BroadcastMatrixRule[],
  opts: { incidentType?: string; incidentSubType?: string; crisisLevel: string }
): BroadcastMatrixRule | undefined {
  const { incidentType, incidentSubType, crisisLevel } = opts;
  const atLevel = matrix.filter((r) => r.crisisLevel === crisisLevel || r.crisisLevel === 'Any');
  const typeMatch = (r: BroadcastMatrixRule) =>
    !r.incidentType || r.incidentType === 'Any' || r.incidentType === incidentType;
  const subMatch = (r: BroadcastMatrixRule) =>
    !r.incidentSubType || r.incidentSubType === 'Any' || r.incidentSubType === incidentSubType;

  return (
    atLevel.find((r) => typeMatch(r) && subMatch(r) && r.incidentType && r.incidentType !== 'Any') ||
    atLevel.find((r) => typeMatch(r) && subMatch(r)) ||
    atLevel[0]
  );
}

// Expand a distribution group (by name) into a de-duplicated list of member emails.
export function resolveGroupEmails(groups: DistributionGroup[], groupName?: string): string[] {
  if (!groupName) return [];
  const group = groups.find((g) => g.name === groupName && g.status === 'Active');
  if (!group) return [];
  return Array.from(new Set(group.members.map((m) => m.email).filter(Boolean)));
}

// Choose the template for a broadcast type (+ optional incident type match).
export function resolveTemplate(
  templates: BroadcastTemplate[],
  opts: { category: string; incidentType?: string }
): BroadcastTemplate | undefined {
  const byCat = templates.filter((t) => t.category === opts.category);
  return (
    byCat.find((t) => t.incidentType && t.incidentType !== 'Any' && t.incidentType === opts.incidentType) ||
    byCat.find((t) => !t.incidentType || t.incidentType === 'Any') ||
    byCat[0]
  );
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
  recipientGroup?: string;
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
  });
  const recipients = resolveGroupEmails(groups, rule?.recipientGroup);
  const template = resolveTemplate(templates, {
    category: 'Closure Broadcast',
    incidentType: incident?.type,
  });

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
    recipientGroup: rule?.recipientGroup,
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
  });
  const recipients = resolveGroupEmails(groups, rule?.recipientGroup);
  const template = resolveTemplate(templates, {
    category: 'End-of-Day Interim Broadcast',
    incidentType: incident?.type,
  });

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
    recipientGroup: rule?.recipientGroup,
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
