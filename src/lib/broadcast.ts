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
// it (added 2026-07-25, Option B): without it, a Closure rule's `templateId`
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
// Rule names an exact templateId — Option B, 2026-07-25).
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

// US-BC-01 — merges a Duty Manager's Carry-Forward Summary (BroadcastRecord.
// carryForwardSummary) into ALREADY-RENDERED End-of-Day broadcast content.
//
// Records only persist rendered text, not the pre-substitution template (see
// contentDefault comment in db.ts), so this can't re-run renderTemplate with a
// new `summary` var — instead it targets the exact label the default tpl-eod
// template renders ("Summary of progress to date: ") and replaces just that ONE
// line up to the next blank line, leaving the rest of the content (and any
// manual Edit-tab changes elsewhere in it) untouched.
//
// A custom admin-authored EOD template that doesn't render this exact label has
// nothing for this to substitute into — the summary is still saved on the
// record, it just has no visible effect on the dispatched content. Accepted gap,
// not a bug — see US-BC-01 Edge Case EC6.
//
// Called identically on the client (live Preview) and the server (dispatch's
// content-diff gate) so both sides agree on what "unedited" means once a summary
// is present — see the route.ts comment on the dispatch POST handler for why
// that agreement matters (BR5: this substitution must never, by itself, require
// the "content edited from default" confirmation).
const EOD_SUMMARY_LABEL = 'Summary of progress to date:';

export function applyCarryForwardSummary(content: string, carryForwardSummary?: string): string {
  const text = (carryForwardSummary || '').trim();
  if (!text) return content; // nothing entered — leave today's rendered content untouched (BR4)
  const idx = content.indexOf(EOD_SUMMARY_LABEL);
  if (idx === -1) return content; // EC6 — template doesn't render this line, no-op
  const lineStart = idx + EOD_SUMMARY_LABEL.length;
  const rest = content.slice(lineStart);
  const blankLineIdx = rest.indexOf('\n\n');
  const after = blankLineIdx === -1 ? '' : rest.slice(blankLineIdx);
  return `${content.slice(0, lineStart)} ${text}${after}`;
}

// Resolve the full default recipient list + template + rendered content for a
// closure broadcast, given the incident and the current config. Recipients are a
// SNAPSHOT (never a live group reference) per §10.3d.
export interface ResolvedBroadcast {
  recipients: string[];
  templateUsed: string;
  templateId?: string;
  matrixRuleId?: string;
  content: string;
  subject: string;
  recipientGroups: string[];
  channels: string[];
  // Set when NOTHING matched — no rule, or the matched rule's group(s) resolved to
  // 0 active members. Populated with a human-readable "what was tried" string so
  // the record (and its UI badge) can explain the gap instead of silently showing
  // "0 recipients" (fixes G15).
  resolutionWarning?: string;
}

// Shared by resolveClosureBroadcast/resolveEodBroadcast/resolveWeatherBroadcast —
// builds the resolutionWarning message when recipients come back empty (G15).
function buildResolutionWarning(opts: {
  broadcastType: string;
  incidentType?: string;
  crisisLevel: string;
  rule?: BroadcastMatrixRule;
}): string {
  const { broadcastType, incidentType, crisisLevel, rule } = opts;
  if (!rule) {
    return `No Broadcast Matrix rule matched (type "${broadcastType}", incident type "${incidentType || 'N/A'}", ${crisisLevel}). Add or activate a matching rule in Broadcast Matrix.`;
  }
  return `Matrix rule "${rule.id}" matched but resolved to 0 active recipients — its recipient group(s) (${(rule.recipientGroups || []).join(', ') || 'none configured'}) may be empty or Deactivated.`;
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
  // Option B (2026-07-25): a Matrix Rule may name an exact template. Prefer
  // that over the category+incidentType guess when the rule sets one.
  const template =
    resolveTemplateById(templates, rule?.templateId) ||
    resolveTemplate(templates, { category: 'Closure Broadcast' });

  const vars: Record<string, string | undefined> = {
    case_id: caseId,
    incident_id: incident?.id,
    incident_title: incident?.title,
    incident_datetime: incident?.dateTime,
    incident_type: incident?.type,
    incident_subtype: incident?.subType,
    priority: incident?.priority,
    location: incident?.location?.commonName || 'N/A',
    crisis_level: levelKey,
    reporting_source: incident?.reportingSource || 'N/A',
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
  // §10.4b/G4 — template.subject was defined but never rendered/used; dispatch
  // hardcoded "[SDC] {type} Broadcast — {id}" instead, so recipients saw a subject
  // line unrelated to the configured template. Render it the same way as the body.
  const subject = template
    ? renderTemplate(template.subject, vars)
    : `[SDC] Incident Closed: ${incident?.title || caseId}`;

  return {
    recipients,
    templateUsed: template?.name || 'Closure Broadcast Template',
    templateId: template?.id,
    matrixRuleId: rule?.id,
    content,
    subject,
    recipientGroups: rule?.recipientGroups || [],
    channels: rule?.deliveryChannels || ['Email'],
    resolutionWarning: recipients.length === 0
      ? buildResolutionWarning({ broadcastType: 'Closure Broadcast', incidentType: incident?.type, crisisLevel: levelKey, rule })
      : undefined,
  };
}

// Default per-status delivery counts for a freshly dispatched broadcast (§10.9d).
// The mock email gateway marks everything "sent"; a real gateway would update these.
export function initialDeliveryCounts(recipientCount: number) {
  return { sent: recipientCount, delivered: 0, failed: 0, pending: 0 };
}

// Roll BroadcastRecord.recipientStatus (real per-recipient state, written back
// from emailMock's lifecycle — see /api/broadcasts/[...id]/delivery) up into the
// same {sent, delivered, failed, pending} shape the UI already reads. Replaces
// the old behaviour of freezing deliveryCounts at dispatch time and never
// touching it again (fixes G11 — "delivered 0" forever).
export function rollupDeliveryCounts(
  recipientStatus: { status: 'Queued' | 'Sent' | 'Delivered' | 'Failed' }[] | undefined
): { sent: number; delivered: number; failed: number; pending: number } {
  const list = recipientStatus || [];
  return list.reduce(
    (acc, r) => {
      if (r.status === 'Delivered') acc.delivered++;
      else if (r.status === 'Failed') acc.failed++;
      else if (r.status === 'Sent') acc.sent++;
      else acc.pending++;
      return acc;
    },
    { sent: 0, delivered: 0, failed: 0, pending: 0 }
  );
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
  // Option B (2026-07-25): prefer the Matrix Rule's exact template if set.
  const template =
    resolveTemplateById(templates, rule?.templateId) ||
    resolveTemplate(templates, { category: 'End-of-Day Interim Broadcast' });

  const vars: Record<string, string | undefined> = {
    case_id: caseId,
    incident_id: incident?.id,
    incident_title: incident?.title,
    incident_datetime: incident?.dateTime,
    incident_type: incident?.type,
    incident_subtype: incident?.subType,
    priority: incident?.priority,
    location: incident?.location?.commonName || 'N/A',
    crisis_level: levelKey,
    reporting_source: incident?.reportingSource || 'N/A',
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
  const subject = template
    ? renderTemplate(template.subject, vars)
    : `[SDC] End-of-Day Interim Update: ${incident?.title || caseId}`;

  return {
    recipients,
    templateUsed: template?.name || 'End-of-Day Interim Broadcast',
    templateId: template?.id,
    matrixRuleId: rule?.id,
    content,
    subject,
    recipientGroups: rule?.recipientGroups || [],
    channels: rule?.deliveryChannels || ['Email'],
    resolutionWarning: recipients.length === 0
      ? buildResolutionWarning({ broadcastType: 'End-of-Day Interim Broadcast', incidentType: incident?.type, crisisLevel: levelKey, rule })
      : undefined,
  };
}

// Resolve the default recipient list + template + rendered content for a Weather
// Advisory Broadcast (§10.1). Unlike Closure/EOD this isn't tied to one incident's
// crisis level — it's an island-wide advisory a Duty Officer initiates manually
// (§10.1d), so callers pass free-form vars (location/summary/time) instead of an
// incident object, and crisisLevel defaults to a wildcard match (2026-07-26,
// Phase 3, fixes gap G1 — previously there was no resolver for this broadcast type
// at all, so "Weather Advisory" in the New Broadcast modal produced an empty shell
// that ignored the configured template/matrix entirely).
export function resolveWeatherBroadcast(input: {
  vars: { location?: string; summary?: string; time?: string };
  groups: DistributionGroup[];
  templates: BroadcastTemplate[];
  matrix: BroadcastMatrixRule[];
}): ResolvedBroadcast {
  const { vars: inputVars, groups, templates, matrix } = input;

  const rule = resolveMatrixRule(matrix, {
    crisisLevel: 'Any',
    broadcastType: 'Weather Advisory Broadcast',
  });
  const recipients = resolveGroupEmails(groups, rule?.recipientGroups);
  const template =
    resolveTemplateById(templates, rule?.templateId) ||
    resolveTemplate(templates, { category: 'Weather Advisory Broadcast' });

  const vars: Record<string, string | undefined> = {
    location: inputVars.location || 'Sentosa Island',
    summary: inputVars.summary || 'N/A',
    time: inputVars.time || new Date().toISOString(),
    incident_title: 'Weather Advisory',
  };

  const content = template
    ? renderTemplate(template.body, vars)
    : ['WEATHER ADVISORY', '', vars.summary].join('\n');
  const subject = template ? renderTemplate(template.subject, vars) : '[SDC] Weather Advisory';

  return {
    recipients,
    templateUsed: template?.name || 'Weather Advisory Broadcast',
    templateId: template?.id,
    matrixRuleId: rule?.id,
    content,
    subject,
    recipientGroups: rule?.recipientGroups || [],
    channels: rule?.deliveryChannels || ['Email'],
    resolutionWarning: recipients.length === 0
      ? buildResolutionWarning({ broadcastType: 'Weather Advisory Broadcast', crisisLevel: 'Any', rule })
      : undefined,
  };
}

// ── End-of-Day queue (FSD §5.11.2 / §10.7) ─────────────────────────────────────
// An incident is eligible for the interim broadcast queue if it is still open at
// EOD cutover. "Open" = not Closed and not already Pending Endorsement/awaiting
// endorsement. Exact criteria are TBC in FSD (§15.3) — kept behind this predicate.
//
// 2026-07-26 (Phase 0, gap G9): previously ONLY checked status, with the excluded
// list hardcoded here — every Informational/Exercise incident and every Level 5
// false alarm queued right alongside genuine open incidents, because the C1 gate
// used for Closure broadcasts (isClosureBroadcastRequired, driven by category) was
// never applied to the EOD path. Now takes the same BroadcastConfig the Closure
// gate uses, so both paths agree on what actually needs broadcast handling.
// `config` is optional (defaults to DEFAULT_BROADCAST_CONFIG) so existing callers
// that don't pass one keep working, but every real call site should pass the
// live config from broadcastStore.
export function isEodEligible(incident: any, config?: BroadcastConfig): boolean {
  if (!incident) return false;
  const cfg = config || DEFAULT_BROADCAST_CONFIG;
  if (cfg.eodExcludedStatuses.includes(incident.status)) return false;
  if (cfg.eodExcludedCategories.includes(incident.category)) return false;
  const level = typeof incident.crisisLevel === 'number' ? incident.crisisLevel : 4; // §5.2d default
  if (level > cfg.eodMinCrisisLevel) return false; // level 5 excluded when eodMinCrisisLevel=4, etc.
  return true;
}

export function buildEodCandidates(incidents: any[], config?: BroadcastConfig): any[] {
  return (incidents || []).filter((i) => isEodEligible(i, config));
}

// ── Broadcast ID generation (fixes bug B4) ─────────────────────────────────────
// The old `db.broadcasts.filter(b => b.caseId === caseId).length + 1` pattern used
// at all 3 creation call sites breaks in two ways: (1) deleting any broadcast for
// that case shifts every subsequent ID down, producing a collision with an ID that
// already exists; (2) two near-simultaneous creations (e.g. the EOD cron firing
// while a Controller manually creates a broadcast) can both read the same `length`
// and both produce the same next ID. Parsing the max sequence actually present is
// not a full fix for true concurrent writes (that needs a DB-level unique index /
// transaction, which this prototype's Mongo layer doesn't set up for any
// collection), but it removes the far more common "gap from a deleted record"
// failure mode and is at least stable across repeated calls in the same tick.
export function nextBroadcastId(broadcasts: { id: string; caseId: string }[], caseId: string): string {
  const prefix = `${caseId}-BC`;
  let maxSeq = 0;
  for (const b of broadcasts) {
    if (b.caseId !== caseId || !b.id.startsWith(prefix)) continue;
    const seq = parseInt(b.id.slice(prefix.length), 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// Standalone (caseless) broadcast ID — Weather Advisory and any other manual
// broadcast not tied to a Case (§10.1d, fixes bug B6: manual broadcast creation
// used to hard-require caseId). Sequenced per calendar day: SEN/BC/YYYYMMDD/###.
export function nextStandaloneBroadcastId(broadcasts: { id: string }[], date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = `SEN/BC/${ymd}/`;
  let maxSeq = 0;
  for (const b of broadcasts) {
    if (!b.id.startsWith(prefix)) continue;
    const seq = parseInt(b.id.slice(prefix.length), 10);
    if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

// The calendar-day key (Duty Manager's "today") an End-of-Day broadcast belongs
// to — used as BroadcastRecord.eodDate, the idempotency key for the cron (fixes
// bug B1) and the axis the EOD review tab's day navigator runs on.
export function todayDateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// Broadcast IDs contain literal `/` (e.g. SEN/CI/20260621/002-BC001) since they're
// derived from Case IDs. When building a PATH to a catch-all route
// (/broadcasts/[...id], /api/broadcasts/[...id]) each segment must be encoded
// individually and rejoined with literal slashes — encoding the whole ID at once
// (encodeURIComponent(id)) turns the separators into %2F, which Next's router
// treats as part of a single segment instead of a path boundary, so the catch-all
// route never recombines it back to the original ID. This mirrors the existing
// `fault.id.split('/').map(encodeURIComponent).join('/')` pattern already used in
// FaultLogTab.tsx/faults/[...id]/page.tsx for the same reason. NOT for query
// string values (`?id=...`) — encodeURIComponent(id) there is correct as-is.
export function encodeIdPath(id: string): string {
  return id.split('/').map(encodeURIComponent).join('/');
}
