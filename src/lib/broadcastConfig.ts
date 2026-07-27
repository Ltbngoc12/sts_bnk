// Broadcast configuration types + default seeds — FSD v0.5 §10.1/§10.4/§10.6/§13.3.
//
// This module is CLIENT-SAFE (pure types + constant seed data, no server imports),
// so it can be imported by both the admin config pages and the server-side
// broadcast store / API routes.
//
// Taxonomy is aligned to the FSD (fixes the previous non-canonical "Incident/Crisis
// Broadcast" seed): the three broadcast types are Closure, End-of-Day Interim and
// Weather Advisory (§10.1); routing matrix and templates key off incident type,
// incident sub-type and crisis level (§10.4a / §13.3); crisis levels run 1–5 with
// Level 4 the creation default (§5.2d).

import type { DistributionGroup } from './groups';
import { DEFAULT_GROUPS } from './groups';

export const BROADCAST_TYPES = [
  'Closure Broadcast',
  'End-of-Day Interim Broadcast',
  'Weather Advisory Broadcast',
] as const;
export type BroadcastType = (typeof BROADCAST_TYPES)[number];

// Crisis levels per FSD §5.2 (1 = most severe … 5 = least severe / occurrence).
export const CRISIS_LEVELS = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'] as const;
export type CrisisLevel = (typeof CRISIS_LEVELS)[number];

// ── Broadcast Template (FSD §10.4 / §13.3) ─────────────────────────────────────
// Templates are pure content, scoped only to a Broadcast Type. Multiple templates
// per Broadcast Type are expected and supported (e.g. two different Closure
// Broadcast templates) — the admin UI lists them all and a Routing Matrix Rule
// picks the exact one to use.
//
// incidentType/incidentSubType/crisisLevel were REMOVED from this model
// (2026-07-25, Kyle — see BROADCAST_CONFIG_PAGE_REDESIGN_PLAN.md discussion log).
// Reasoning: a Routing Matrix Rule already carries its own Incident Type/Sub-type/
// Crisis Level selection and now always names an exact `templateId` (see
// BroadcastMatrixRule.templateId, mandatory as of this change) — resolveTemplateById()
// only ever checked template.status, never these fields, so keeping them on the
// Template editor implied a second, unused source of truth that could visually
// contradict the Matrix Rule it was actually used by. The Matrix Rule is now the
// SOLE place that decides when a template applies; the Template itself just holds
// content. (This also removes the old category+incidentType "auto-select" fallback
// — see resolveTemplate() in broadcast.ts.)
//
// `sensitiveFields` (a per-field checklist) was ALSO removed (2026-07-25, Kyle —
// simplification pass). §10.4c-d only requires: (a) default templates exclude
// sensitive content, (b) including anything BEYOND the default needs explicit Duty
// Manager confirmation at dispatch. The checklist implementation satisfied this by
// flagging a static, template-level list of field names — which triggered the
// confirmation banner regardless of whether that field's token was actually present
// in the rendered content (a real false-positive risk, and arguably not what §10.4d
// asks for — it says "fields beyond the default", i.e. an actual deviation).
// Replaced by a content-diff gate: the confirmation is now required exactly when
// the reviewer's submitted content differs from the auto-filled default (see
// resolveClosureBroadcast/resolveEodBroadcast's `content`, and the dispatch-time
// diff against Broadcast.contentDispatched in incidents/[...id]/route.ts and
// broadcasts/[...id]/route.ts). Admin's remaining responsibility: don't write
// sensitive detail into a default template body in the first place — same as
// before, this was never content-enforced either way.
export interface BroadcastTemplate {
  id: string;
  category: string;            // BroadcastType (kept as string for forward-compat)
  name: string;
  subject: string;
  body: string;
  // Admin config redesign (2026-07-25): multiple templates per broadcast type are
  // supported; status lets an admin retire/reinstate a template WITHOUT deleting
  // it. resolveTemplateById() filters to 'Active' only.
  status: 'Active' | 'Inactive';
}

// ── Broadcast Matrix Rule (FSD §10.6 / §13.3) ──────────────────────────────────
// Maps incident type + sub-type + crisis level → distribution group + channels.
//
// crisisLevels / recipientGroups / incidentTypes / incidentSubTypes are all
// multi-select (2026-07-25, Kyle) — one rule can cover several incident types,
// sub-types, crisis levels and/or fan out to several recipient groups at once,
// instead of needing a separate row per value. 'Any' inside crisisLevels/
// incidentTypes/incidentSubTypes is a wildcard and is mutually exclusive with
// specific values in the UI (see CheckboxMultiSelect in the admin page). An
// empty/undefined array also behaves as a wildcard for those three (fail-open,
// consistent with how a missing field was treated before this was an array).
// recipientGroups has no wildcard — it's always the explicit list to notify.
export interface BroadcastMatrixRule {
  id: string;
  crisisLevels: string[];
  broadcastType: string;
  recipientGroups: string[];   // DistributionGroup.name[]
  deliveryChannels: string[];
  incidentTypes?: string[];    // §13.3 — added in v0.5
  incidentSubTypes?: string[]; // §13.3 — added in v0.5
  // Admin config redesign (2026-07-25, Kyle — Option B, made MANDATORY same
  // day): every rule names the exact BroadcastTemplate to use. The admin UI no
  // longer offers a "auto-select best match" option — Save is blocked until a
  // template is chosen. Optional only for legacy Mongo rows saved before this
  // change; resolveClosureBroadcast/resolveEodBroadcast fall back to the first
  // Active template in the rule's broadcastType category if a rule somehow still
  // lacks one (see resolveTemplate() in broadcast.ts).
  templateId?: string;
  // Routing Matrix rules are never deleted from the admin UI — only deactivated.
  // resolveMatrixRule() filters to 'Active' only.
  status: 'Active' | 'Inactive';
}

// ── Delivery Channel config (FSD §10.2) ────────────────────────────────────────
export interface BroadcastChannel {
  id: string;
  name: string;
  details: string;
  status: 'Active' | 'Inactive';
}

// ── Broadcast-level config: EOD timing + prompt rules (FSD §13.3) ───────────────
export interface BroadcastConfig {
  id: 'singleton';
  // §13.3 "End-of-day broadcast timing" — 24h HH:mm at which open incidents are
  // surfaced in the Duty Manager's interim broadcast queue.
  endOfDayTime: string;
  // §5.1.2 / §5.11.1a — which incident categories require a closure broadcast by
  // default. Drives the C1 gate in the incident `close` action.
  closureRequiredCategories: string[];

  // ── Added 2026-07-26 (Phase 0, gap G9) ─────────────────────────────────────────
  // isEodEligible() previously only excluded status Closed/Pending Endorsement —
  // every other open incident queued into the EOD review, including Informational/
  // Exercise incidents (§5.1.2 explicitly says these "do not require ... broadcast
  // handling by default") and Level 5 false alarms. That produced a queue of mostly
  // junk (43 pending records observed 2026-07-26) that no Duty Manager could
  // realistically triage at end of shift. These three settings make the EOD gate
  // symmetric with the Closure gate instead of hardcoding the exclusion list.
  eodExcludedCategories: string[];   // Incident.category values that never queue for EOD
  eodMinCrisisLevel: number;         // only crisisLevel <= this queues (1 = most severe); 5 = no level filter
  eodExcludedStatuses: string[];     // Incident.status values that never queue (was OPEN_STATUSES_EXCLUDED, hardcoded)

  // ── Added 2026-07-26 (Phase 3, gap G8) ─────────────────────────────────────────
  // This deployment has no external scheduler (plain `next dev`/`next start`, no
  // vercel.json/Vercel Cron in this repo) — endOfDayTime was previously "dead"
  // config that nothing ever read. lastEodRunAt/lastEodRunPerDate back a
  // lazy-trigger: the EOD tab checks on load whether today's cutover has passed
  // and the job hasn't run yet today, and if so runs it automatically, instead of
  // relying on someone remembering to click "Run Check Now".
  eodSchedulerEnabled: boolean;
  lastEodRunAt?: string;                      // ISO — most recent run, any night
  lastEodRunPerDate?: Record<string, string>; // eodDate (YYYY-MM-DD) -> ISO run timestamp
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  id: 'singleton',
  endOfDayTime: '20:00',
  // FSD §5.1.2: Operational incidents carry broadcast handling; Informational/Exercise
  // "do not require … broadcast handling by default"; Backdated makes no mention of a
  // broadcast (already-concluded incident) → excluded by default, pending BA confirmation.
  closureRequiredCategories: ['Operational Incident'],
  // Mirrors closureRequiredCategories' reasoning for the EOD gate (G9): Informational/
  // Exercise incidents don't get broadcast handling by default, and Backdated incidents
  // are already-concluded records that shouldn't resurface at end of shift. Values must
  // match INCIDENT_CATEGORIES in incidentCategory.ts.
  eodExcludedCategories: ['Informational / Exercise Records', 'Backdated Incident'],
  // Level 5 = occurrence/false-alarm severity (§5.2) — excluded from EOD noise by
  // default; set to 5 to stop filtering by level.
  eodMinCrisisLevel: 4,
  eodExcludedStatuses: ['Closed', 'Pending Endorsement'],
  eodSchedulerEnabled: true,
};

// ── Default seed data (FSD-aligned) ────────────────────────────────────────────

export const DEFAULT_BROADCAST_TEMPLATES: BroadcastTemplate[] = [
  {
    id: 'tpl-closure',
    category: 'Closure Broadcast',
    name: 'Standard Closure Broadcast',
    subject: '[SDC] Incident Closed: {incident_title}',
    body:
      'INCIDENT CLOSURE NOTICE\n\nCase ID: {case_id}\nIncident ID: {incident_id}\nTitle: {incident_title}\nClassification: {incident_type} — {incident_subtype}\nLocation: {location}\nCrisis Level: {crisis_level}\nClosed At: {closed_at}\nClosed By: {closed_by}\n\nSummary: {summary}\n\nThis is an automated closure dispatch from the Sentosa CMS.',
    status: 'Active',
  },
  {
    id: 'tpl-eod',
    category: 'End-of-Day Interim Broadcast',
    name: 'End-of-Day Interim Broadcast',
    subject: '[SDC] End-of-Day Interim Update: {incident_title}',
    body:
      'END-OF-DAY INTERIM UPDATE\n\nCase ID: {case_id}\nIncident ID: {incident_id}\nTitle: {incident_title}\nClassification: {incident_type} — {incident_subtype}\nLocation: {location}\nCrisis Level: {crisis_level}\nCurrent Status: {status}\n\nSummary of progress to date: {summary}\n\nThis incident remains open and under management. Issued by the Duty Manager on duty.',
    status: 'Active',
  },
  {
    id: 'tpl-weather',
    category: 'Weather Advisory Broadcast',
    name: 'Weather Advisory Broadcast',
    subject: '[SDC] Weather Advisory: {incident_title}',
    body:
      'WEATHER ADVISORY\n\n{summary}\n\nLocation(s) affected: {location}\nIssued At: {time}\n\nPlease take appropriate precautions. Issued by the authorised Duty Officer.',
    status: 'Active',
  },
];

// Matrix seed keyed by crisis level → recipient group + channels (§10.6, TBC in FSD;
// this is a working draft using the seeded distribution groups from groups.ts).
// templateId points at the seeded template for that broadcast type. Every rule
// (seed and admin-created) now names one explicitly — the old category+incidentType
// "auto-select" fallback was removed the same day templateId became mandatory in
// the admin UI (Option B → mandatory, 2026-07-25).
//
// NOTE: resolveMatrixRule() now scopes by `broadcastType` (2026-07-25 fix — see
// comment on resolveMatrixRule in broadcast.ts) so that a Closure rule's templateId
// can never leak into an End-of-Day resolution. Previously the same 5 rows were
// silently reused for both Closure and End-of-Day since nothing filtered on
// broadcastType — this seed now has an explicit End-of-Day set (same recipient/
// channel mapping, tpl-eod instead of tpl-closure) so EOD keeps resolving a
// recipient group exactly as it did before this fix.
export const DEFAULT_BROADCAST_MATRIX: BroadcastMatrixRule[] = [
  { id: 'mat-l1', crisisLevels: ['Level 1'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l2', crisisLevels: ['Level 2'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l3', crisisLevels: ['Level 3'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l4', crisisLevels: ['Level 4'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-l5', crisisLevels: ['Level 5'], broadcastType: 'Closure Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-closure', status: 'Active' },
  { id: 'mat-eod-l1', crisisLevels: ['Level 1'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l2', crisisLevels: ['Level 2'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l3', crisisLevels: ['Level 3'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['SDC Crisis Command'], deliveryChannels: ['Email', 'Push Notification'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l4', crisisLevels: ['Level 4'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-eod', status: 'Active' },
  { id: 'mat-eod-l5', crisisLevels: ['Level 5'], broadcastType: 'End-of-Day Interim Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants'], deliveryChannels: ['Email'], templateId: 'tpl-eod', status: 'Active' },
  // Weather Advisory Broadcast (2026-07-26, Phase 3 gap G1) — previously had NO
  // matrix rule at all, so resolveMatrixRule() always returned undefined and every
  // "Weather Advisory" broadcast went out with 0 pre-filled recipients regardless
  // of what was configured in Admin. Island-wide notice, not tied to a single
  // incident's crisis level/type, so this rule is scoped 'Any'/'Any' and fires
  // for any crisisLevel resolveWeatherBroadcast() is called with.
  { id: 'mat-weather-1', crisisLevels: ['Any'], broadcastType: 'Weather Advisory Broadcast', incidentTypes: ['Any'], recipientGroups: ['Beach Operators & F&B Tenants', 'Sentosa Cove Residents'], deliveryChannels: ['Email'], templateId: 'tpl-weather', status: 'Active' },
];

// FSD §10.2 delivery channels: Email + Push Notification. (SMS is reserved for
// Crisis Recall §11, out of scope for this framework.)
export const DEFAULT_BROADCAST_CHANNELS: BroadcastChannel[] = [
  { id: 'ch-email', name: 'Email', details: 'Host: smtp.sdc.gov.sg | Encryption: STARTTLS | Port: 587 (mock gateway)', status: 'Active' },
  { id: 'ch-push', name: 'Push Notification', details: 'In-app System Notifications (CMS / UCS / Staff App)', status: 'Active' },
];

// ── Notification record (server-side mailbox; FSD §10.5) ────────────────────────
export interface NotificationRecord {
  id: string;
  // Either a specific user (username) or a role broadcast; mirrors the current
  // client NotificationItem shape so the widget can be migrated with no UI change.
  userId?: string;
  recipientRole: string; // UserRole | 'All'
  type: string;          // 'incident' | 'task' | 'nop' | 'broadcast' | 'system' | ...
  title: string;
  message: string;
  link?: string;
  read: boolean;
  timestamp: string;
}

// ── Broadcast Action Prompt Rules (admin config redesign, 2026-07-25) ──────────
// Config-drivable version of the two in-app "prompt" notifications tied to the
// broadcast lifecycle. Each rule maps a fixed, code-defined trigger event to a
// recipient role. Previously: the Closure prompt to the Controller didn't exist
// at all in code, and the EOD prompt to the Duty Manager was hardcoded inline in
// /api/cron/eod-broadcast/route.ts. Both call sites now look up the Active rule
// for their trigger event instead (see incidents/[...id]/route.ts `close` action
// and cron/eod-broadcast/route.ts).
//
// triggerEvent is a closed enum, NOT free text — each value corresponds to one
// real code hook point. Adding a new trigger always requires a developer to wire
// a new call site; it can't be created purely through this admin UI. Scoped to
// exactly these 2 values for v1 (Kyle, 2026-07-25) — Weather Advisory has no
// dispatch trigger yet, and Crisis Recall (§11) is a separate module out of scope.
//
// 'media_present_confirmed' added 2026-07-26 (Phase 3, gap G10) — §10.8 requires
// the system to "prompt the Controller to notify the SDC Communications team by
// broadcast" when media presence is confirmed at scene. Previously this only
// appended a plain incident.log line with no in-app signal to anyone. Scoped to a
// PROMPT only (not a full auto-queued broadcast type/template/matrix — that would
// need a 4th BroadcastType wired through broadcastFields.ts's per-type field
// catalog and a new distribution group, which is more admin-config surface than
// this pass covers) — the Controller still creates the actual SDC Communications
// broadcast manually via New Broadcast, same as any other ad-hoc broadcast.
export type BroadcastPromptTrigger =
  | 'closure_broadcast_queued'   // incidents/[...id] action `close`, when the C1 gate is required
  | 'eod_broadcast_queued'       // cron/eod-broadcast, when >=1 incident is queued into the EOD review
  | 'media_present_confirmed';   // incidents/[...id] PUT/`update-fields`, when mediaInvolvement.commsNotified flips to true

export interface BroadcastActionPromptRule {
  id: string;
  name: string;
  triggerEvent: BroadcastPromptTrigger;
  // Multi-select (2026-07-25, Kyle) — a single prompt can notify several roles at
  // once (e.g. both Controller and Duty Manager) instead of needing a separate
  // rule per role. Each role in the list gets its own NotificationRecord.
  recipientRoles: string[]; // UserRole from RoleContext / role registry in admin/roles
  description?: string;
  status: 'Active' | 'Inactive';
}

// Seeded to match current/intended behaviour exactly (no behaviour change on migrate):
// Closure -> Controller was a gap (never notified); EOD -> Duty Manager was hardcoded.
export const DEFAULT_BROADCAST_PROMPT_RULES: BroadcastActionPromptRule[] = [
  {
    id: 'prompt-closure',
    name: 'Closure Broadcast Prompt',
    triggerEvent: 'closure_broadcast_queued',
    recipientRoles: ['Controller'],
    description: 'Fires when a Duty Manager approves and closes an Incident that requires a closure broadcast (FSD §5.11.1a / §5.1.2). Notifies the Controller to review and dispatch the queued broadcast.',
    status: 'Active',
  },
  {
    id: 'prompt-eod',
    name: 'End-of-Day Interim Broadcast Prompt',
    triggerEvent: 'eod_broadcast_queued',
    recipientRoles: ['Duty Manager'],
    description: 'Fires when the End-of-Day cutover job queues one or more open incidents into the interim broadcast review queue (FSD §5.11.2 / §10.7). Notifies the Duty Manager to review and dispatch.',
    status: 'Active',
  },
  {
    id: 'prompt-media',
    name: 'SDC Communications Notification Prompt',
    triggerEvent: 'media_present_confirmed',
    recipientRoles: ['Controller'],
    description: 'Fires when media presence at scene is confirmed (FSD §10.8). Prompts the Controller to notify the SDC Communications team by broadcast, including the incident and the media organisation present.',
    status: 'Active',
  },
];

export type { DistributionGroup };

// ── Broadcast Distribution Groups (2026-07-27, Kyle — confirmed with client) ────
// Broadcast's recipient groups are now a SEPARATE dataset from the Task module's
// Distribution Groups (lib/groups.ts, managed at /admin/task-configuration's
// "Task Distribution" tab). They share the same DistributionGroup/GroupMember
// shape but live in their own Mongo collection (broadcastStore.ts ->
// broadcastDistributionGroups, via /api/admin/broadcast-distribution-groups) and
// are managed from the "Distribution Groups" tab on /admin/broadcast-config — no
// localStorage, consistent with the rest of that page. Seeded once from the same
// starting data as a convenience default (a deep copy, so neither list mutates the
// other); from this point on the two are fully independent — editing one never
// touches the other.
export const DEFAULT_BROADCAST_DISTRIBUTION_GROUPS: DistributionGroup[] = DEFAULT_GROUPS.map((g) => ({
  ...g,
  members: g.members.map((m) => ({ ...m })),
}));
