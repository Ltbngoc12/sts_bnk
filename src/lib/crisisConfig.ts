// Crisis Management & Emergency Recall — configuration types + default seeds.
// FSD §11.5 (Recall Groups). Implements Module M1 / Epic 1 of
// Crisis-Management-Emergency-Recall-Build-Plan.md (v1.1) at repo root.
//
// This module is CLIENT-SAFE (pure types + constant seed data, no server imports),
// so it can be imported by both the admin config page and the server-side crisis
// store / API routes. Same convention as broadcastConfig.ts.
//
// ── D3, THE MOST IMPORTANT RULE IN THIS FILE ──────────────────────────────────
// A RecallGroup is NOT a broadcast DistributionGroup. FSD §11.5.d states recall
// groups are a separate entity. The UI pattern below is deliberately modelled on
// the Broadcast "Distribution Groups" tab because admins already know it, but the
// DATA MODEL AND THE MONGO COLLECTION ARE SEPARATE. Do not "consolidate" these two
// into a shared store — a recall group carries tier/priority, a role-in-group and
// a per-member ack expectation that a broadcast recipient list has no concept of,
// and editing a broadcast group must never change who gets recalled in a crisis.
// See also DEFAULT_BROADCAST_DISTRIBUTION_GROUPS in broadcastConfig.ts, which is
// the same decision taken one module earlier (2026-07-27).

import { CRISIS_LEVELS } from './broadcastConfig';
export { CRISIS_LEVELS };
export type { CrisisLevel } from './broadcastConfig';

// Crisis levels that can trigger an emergency recall. Build plan §2 / story 9:
// an incident submitted at "level 4+" auto-creates a Crisis record. Note the FSD
// numbers severity DOWNWARD (§5.2: 1 = most severe … 5 = least severe), so
// "level 4+" in the plan means Level 1–2 in FSD numbering. Kept explicit here
// rather than computed, and raised as Q8/Q12 — see note below.
export const CRISIS_TRIGGER_LEVELS = ['Level 1', 'Level 2'] as const;

// ⚠ OPEN ITEM (Q12, added during M1 build — not in build plan v1.1).
// The build plan says a crisis is triggered at "level 4+", i.e. treating 4 and 5
// as the severe end. FSD §5.2 defines the opposite: Level 1 is most severe and
// Level 5 is an occurrence. broadcastConfig.ts already implements the FSD
// direction. One of the two is wrong and it inverts the entire trigger condition
// — a system built the plan's way would recall responders for the LEAST severe
// incidents and stay silent for the most severe. Seeded here per the FSD.
// MUST be confirmed with Shin Feng before Epic 2 (story 9) is built.
export const CRISIS_LEVEL_DIRECTION_NOTE =
  'Crisis levels follow FSD §5.2: Level 1 = most severe. Recall triggers on Level 1–2.';

export const RECALL_CHANNELS = ['SMS'] as const;
export type RecallChannel = (typeof RECALL_CHANNELS)[number];

// Member tier is INFORMATIONAL ONLY — does not drive dispatch or escalation logic (decision 2026-08-02).
export const MEMBER_TIERS = ['Tier 1 — Primary', 'Tier 2 — Secondary', 'Tier 3 — Standby'] as const;
export type MemberTier = (typeof MEMBER_TIERS)[number];

// ── Contact validity (build plan §10, "Contact validity") ─────────────────────
// Singapore mobile: +65 followed by 8 digits beginning 8 or 9. Spaces, dashes and
// a missing +65 prefix are tolerated on input and normalised — the point of this
// rule is to catch landlines, foreign numbers and truncated entries, not to fight
// the admin over formatting.
//
// Q6 is answered here in code: WARN, NEVER BLOCK. An invalid number must not stop
// an admin saving a member, because during a crisis an incomplete recall group is
// far more dangerous than an imperfect one. The flag surfaces again at Crisis
// Review before dispatch (build plan §6.3), which is where it actually matters.
export function normalizeMobile(raw: string): string {
  const digits = (raw || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+65')) return digits;
  if (digits.startsWith('65') && digits.length === 10) return `+${digits}`;
  if (/^[89]\d{7}$/.test(digits)) return `+65${digits}`;
  return digits;
}

export function isValidSgMobile(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return /^\+65[89]\d{7}$/.test(normalizeMobile(raw));
}

export function mobileWarning(raw: string | undefined | null): string | null {
  if (!raw || !raw.trim()) return 'No mobile number — this member cannot be reached by SMS recall.';
  if (!isValidSgMobile(raw)) return 'Not a valid Singapore mobile (+65 8xxxxxxx / 9xxxxxxx). SMS delivery will likely fail.';
  return null;
}

// ── SMS segmentation (build plan §6.1, Message Templates screen) ──────────────
// GSM-7 splits at 160 chars single / 153 per part when concatenated. Any character
// outside the GSM-7 set forces UCS-2: 70 chars single / 67 per part. This matters
// commercially (each segment is billed) and operationally (a 4-segment crisis SMS
// can arrive out of order on some handsets).
const GSM7_CHARS =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = '^{}\\[~]|€';

export interface SmsSegmentInfo {
  encoding: 'GSM-7' | 'UCS-2';
  length: number;
  segments: number;
  perSegment: number;
  remaining: number;
}

export function smsSegmentInfo(text: string): SmsSegmentInfo {
  const body = text || '';
  let unicode = false;
  let length = 0;
  for (const ch of body) {
    if (GSM7_EXT.includes(ch)) length += 2;
    else if (GSM7_CHARS.includes(ch)) length += 1;
    else {
      unicode = true;
      length += 1;
    }
  }
  if (unicode) length = [...body].length;

  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  const segments = length === 0 ? 1 : length <= single ? 1 : Math.ceil(length / multi);
  const perSegment = segments <= 1 ? single : multi;
  return {
    encoding: unicode ? 'UCS-2' : 'GSM-7',
    length,
    segments,
    perSegment,
    remaining: segments * perSegment - length,
  };
}

// ── Template placeholders ─────────────────────────────────────────────────────
// Build plan §6.3: the DM must see the FULLY RENDERED message at review time, not
// a template with unresolved tokens. The preview on the admin page renders these
// against sample values so the admin can see the real character count, which is
// the whole point of the counter — a template that fits in one segment empty can
// spill to three once {{location}} is substituted.
export interface PlaceholderDef {
  token: string;
  label: string;
  sample: string;
}

export const RECALL_PLACEHOLDERS: PlaceholderDef[] = [
  { token: '{{crisis_level}}', label: 'Crisis level', sample: 'L1' },
  { token: '{{incident_type}}', label: 'Incident type', sample: 'Fire' },
  { token: '{{location}}', label: 'Location', sample: 'Tower B' },
  { token: '{{reporting_point}}', label: 'Reporting point', sample: 'Command Centre L1' },
  { token: '{{incident_no}}', label: 'Incident number', sample: 'INC-2026-0417' },
  { token: '{{recipient_name}}', label: 'Recipient name', sample: 'DM Gan' },
  { token: '{{ack_link}}', label: 'Acknowledgement link', sample: 'https://sts.sg/a/7Kq2' },
  { token: '{{dispatched_at}}', label: 'Dispatch time', sample: '14:32' },
  { token: '{{reminder_no}}', label: 'Reminder count', sample: '1' },
  { token: '{{minutes_remaining}}', label: 'Minutes remaining', sample: '5' },
];

export function renderPlaceholders(body: string, values?: Record<string, string>): string {
  let out = body || '';
  for (const p of RECALL_PLACEHOLDERS) {
    const v = values?.[p.token] ?? p.sample;
    out = out.split(p.token).join(v);
  }
  return out;
}

// ── Entities ──────────────────────────────────────────────────────────────────

export interface RecallGroupMember {
  id: string;
  name: string;
  roleInGroup: string;
  mobile: string;
  email: string;
  tier: string;              // MemberTier
  membershipStatus: 'Active' | 'Inactive';
  // Set when the member was added by picking an existing CMS user account
  // (src/lib/users.ts) rather than typed in as an external contact. Copied at
  // add-time, no live sync — same convention as groups.ts GroupMember.userId.
  userId?: string;
  remark?: string;
}

export interface RecallGroup {
  id: string;
  name: string;
  description: string;
  status: 'Active' | 'Inactive';
  members: RecallGroupMember[];
  // Audit fields (build plan §4.1). Written by the API route, displayed read-only.
  updatedAt?: string;
  updatedBy?: string;
}

export interface RecallMessageTemplate {
  id: string;
  name: string;
  channel: string;           // RecallChannel
  subject: string;           // Email only; ignored for SMS
  body: string;
  applicableLevels: string[]; // CrisisLevel[]; empty = any
  status: 'Active' | 'Inactive';
}

// ── Routing rule (build plan §4.5) ────────────────────────────────────────────
// ACCUMULATE-ALL, not first-match-wins. Every Active rule whose conditions match
// contributes its target groups; the resolved recipient list is the union,
// de-duplicated per person. `priority` does NOT select a winning rule — it only
// breaks template conflicts when two matched rules name different templates for
// the same channel (lowest number wins).
//
// This is spelled out in the type, in the admin UI copy and in §4.5 of the build
// plan because it is the single easiest thing on this module for a developer to
// get backwards, and getting it backwards means people don't get recalled.
export interface RecallRoutingRule {
  id: string;
  name: string;
  crisisLevels: string[];    // empty = any
  incidentTypes: string[];   // empty = any
  incidentSubTypes?: string[]; // empty = any
  zones: string[];           // empty = any
  timeOfDay?: 'Any' | 'Office hours' | 'After hours';
  targetGroupIds: string[];
  templateId?: string;
  priority?: number;         // template-conflict tiebreak only
  status: 'Active' | 'Inactive';
}

export interface MessagingServiceConfig {
  id: 'singleton';
  provider: string;
  senderId: string;
  // Credentials are NEVER returned in full by the API — see crisisStore.ts
  // maskMessagingConfig(). The admin page shows a masked value and only sends a
  // new one when it is actually changed.
  apiKeyRef: string;
  failoverProvider: string;
  retryAttempts: number;
  retryIntervalSeconds: number;
  rateLimitPerMinute: number;
  // Crisis recall overrides quiet hours by design — a recall that respects Do Not
  // Disturb is not a recall. Exposed as a flag anyway so it is a recorded decision
  // rather than an undocumented behaviour.
  quietHoursOverride: boolean;
  // Build plan §10, Testability: simulation mode routes every dispatch to the
  // test numbers below instead of real members. Crisis features are otherwise
  // untestable outside a real incident.
  simulationMode: boolean;
  testNumbers: string;
}

// ── Acknowledgement + escalation (build plan §4.1 / Appendix A) ───────────────
export interface EscalationStep {
  id: string;
  afterMinutes: number;
  action: 'Resend SMS' | 'Notify Duty Manager';
  note?: string;
}

export interface AckEscalationRule {
  id: 'singleton';

  // ── Acknowledgement ──
  // Áp dụng cho MỌI crisis level. Chỉ có hiệu lực với dispatch tin recall
  // (sequence: initial | re-send | escalation). Tin stand_down không yêu cầu ack.
  ackWindowMinutes: number;
  ackKeywords: string;       // comma-separated, matched case-insensitively
  ackMethodKeyword: boolean;

  // ── Escalation ──
  ladder: EscalationStep[];
}

// ── Default seeds ─────────────────────────────────────────────────────────────
// Seeded on first read of an empty collection (crisisStore.readOrSeed). Values are
// illustrative prototype data, NOT confirmed Ops business rules — every number in
// AckEscalationRule below is a placeholder pending the Ops workshop (build plan
// §9). Do not present these to stakeholders as agreed values.

export const DEFAULT_RECALL_GROUPS: RecallGroup[] = [
  {
    id: 'rg-1',
    name: 'Crisis Command Team',
    description: 'Senior duty leadership recalled for any Level 1 or Level 2 incident.',
    status: 'Active',
    members: [
      { id: 'rgm-1', name: 'DM Gan', roleInGroup: 'Incident Commander', mobile: '+6598765432', email: 'gan.sh@sdc.gov.sg', tier: 'Tier 1 — Primary', membershipStatus: 'Active' },
      { id: 'rgm-2', name: 'DO Shin Feng', roleInGroup: 'Deputy Commander', mobile: '+6591234567', email: 'shin.feng@sdc.gov.sg', tier: 'Tier 1 — Primary', membershipStatus: 'Active' },
      { id: 'rgm-3', name: 'Ops Resilience Analyst', roleInGroup: 'Recall Coordinator', mobile: '+6598112233', email: 'or.analyst@sdc.gov.sg', tier: 'Tier 2 — Secondary', membershipStatus: 'Active' },
      { id: 'rgm-4', name: 'Comms Duty Officer', roleInGroup: 'Media Liaison', mobile: '', email: 'comms.duty@sdc.gov.sg', tier: 'Tier 3 — Standby', membershipStatus: 'Active', remark: 'Email-only contact — no mobile on record. Flagged intentionally to demonstrate the contact-validity warning.' },
    ],
  },
  {
    id: 'rg-2',
    name: 'Fire & Rescue Response',
    description: 'First-response team recalled for fire and hazmat incidents island-wide.',
    status: 'Active',
    members: [
      { id: 'rgm-5', name: 'Fire Safety Manager', roleInGroup: 'Response Lead', mobile: '+6597001122', email: 'fsm@sdc.gov.sg', tier: 'Tier 1 — Primary', membershipStatus: 'Active' },
      { id: 'rgm-6', name: 'Duty Ranger — North', roleInGroup: 'Responder', mobile: '+6598223344', email: 'ranger.north@sdc.gov.sg', tier: 'Tier 2 — Secondary', membershipStatus: 'Active' },
      { id: 'rgm-7', name: 'Duty Ranger — South', roleInGroup: 'Responder', mobile: '+6598334455', email: 'ranger.south@sdc.gov.sg', tier: 'Tier 2 — Secondary', membershipStatus: 'Active' },
    ],
  },
  {
    id: 'rg-3',
    name: 'Beach & Water Rescue',
    description: 'Recalled for drowning, water-related and beach mass-casualty incidents.',
    status: 'Active',
    members: [
      { id: 'rgm-8', name: 'Lifeguard Supervisor', roleInGroup: 'Response Lead', mobile: '+6596445566', email: 'lifeguard.sup@sdc.gov.sg', tier: 'Tier 1 — Primary', membershipStatus: 'Active' },
      { id: 'rgm-9', name: 'Beach Patrol Lead', roleInGroup: 'Responder', mobile: '+6596556677', email: 'beach.patrol@sdc.gov.sg', tier: 'Tier 2 — Secondary', membershipStatus: 'Active' },
    ],
  },
];

export const DEFAULT_RECALL_TEMPLATES: RecallMessageTemplate[] = [
  {
    id: 'rt-1',
    name: 'Standard SMS Recall',
    channel: 'SMS',
    subject: '',
    // Build plan §6.3: readable in three seconds, no prose.
    body: '[CRISIS {{crisis_level}}] {{incident_type}} - {{location}}. Report to {{reporting_point}}. Ack: {{ack_link}}',
    applicableLevels: ['Level 1', 'Level 2'],
    status: 'Active',
  },
  {
    id: 'rt-2',
    name: 'Detailed SMS Recall',
    channel: 'SMS',
    subject: '',
    body: '[CRISIS {{crisis_level}}] {{incident_no}} - {{incident_type}} at {{location}}. Report to {{reporting_point}}. Ack: {{ack_link}}',
    applicableLevels: ['Level 1', 'Level 2'],
    status: 'Active',
  },
  {
    id: 'rt-3',
    name: 'Stand-Down SMS',
    channel: 'SMS',
    subject: '',
    body: '[STAND DOWN] {{incident_no}} {{incident_type}} at {{location}} is resolved. No further action required.',
    applicableLevels: [],
    status: 'Active',
  },
];

export const DEFAULT_RECALL_ROUTING_RULES: RecallRoutingRule[] = [
  {
    id: 'rr-1',
    name: 'Level 1 — recall Crisis Command (all incident types)',
    crisisLevels: ['Level 1'],
    incidentTypes: [],
    incidentSubTypes: [],
    zones: [],
    timeOfDay: 'Any',
    targetGroupIds: ['rg-1'],
    templateId: 'rt-1',
    priority: 10,
    status: 'Active',
  },
  {
    id: 'rr-2',
    name: 'Fire / hazmat — recall Fire & Rescue',
    crisisLevels: ['Level 1', 'Level 2'],
    incidentTypes: ['Fire'],
    incidentSubTypes: [],
    zones: [],
    timeOfDay: 'Any',
    targetGroupIds: ['rg-2'],
    templateId: 'rt-1',
    priority: 20,
    status: 'Active',
  },
  {
    id: 'rr-3',
    name: 'Water incident — recall Beach & Water Rescue',
    crisisLevels: ['Level 1', 'Level 2'],
    incidentTypes: ['Drowning'],
    incidentSubTypes: [],
    zones: [],
    timeOfDay: 'Any',
    targetGroupIds: ['rg-3'],
    templateId: 'rt-1',
    priority: 20,
    status: 'Active',
  },
];

export const DEFAULT_MESSAGING_SERVICE_CONFIG: MessagingServiceConfig = {
  id: 'singleton',
  provider: 'Not selected',
  senderId: 'SENTOSA',
  apiKeyRef: '',
  failoverProvider: 'None',
  retryAttempts: 2,
  retryIntervalSeconds: 30,
  rateLimitPerMinute: 600,
  quietHoursOverride: true,
  simulationMode: true,
  testNumbers: '',
};

export const DEFAULT_ACK_ESCALATION_RULE: AckEscalationRule = {
  id: 'singleton',
  ackWindowMinutes: 10,
  ackKeywords: 'YES, Y, ACK, OK',
  ackMethodKeyword: true,
  ladder: [
    { id: 'esc-1', afterMinutes: 5, action: 'Resend SMS', note: 'Second SMS to anyone still silent.' },
    { id: 'esc-2', afterMinutes: 12, action: 'Notify Duty Manager', note: 'DM to phone the remaining non-responders directly.' },
  ],
};

// Sender IDs that cannot receive inbound SMS (Appendix A, note 1). An alphanumeric
// sender ID is send-only — enabling reply-keyword acknowledgement against one
// silently drops every reply. Surfaced as a warning on the Messaging Service tab
// rather than left for someone to discover during a live recall.
export function senderIdIsAlphanumeric(senderId: string | undefined | null): boolean {
  if (!senderId) return false;
  return /[A-Za-z]/.test(senderId);
}
