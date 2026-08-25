// Crisis Management & Emergency Recall — transactional entities, state machines
// and pure helpers. Modules M2–M5 of Crisis-Management-Emergency-Recall-Build-Plan.md
// (v1.1) at repo root. FSD §11.5.
//
// CLIENT-SAFE: pure types + pure functions, no server imports. The Mongo-backed
// runtime lives in crisisRuntime.ts.
//
// ══════════════════════════════════════════════════════════════════════════════
// THE TWO RULES THAT MATTER MOST IN THIS FILE
// ══════════════════════════════════════════════════════════════════════════════
//
// 1. SNAPSHOT ON TRIGGER (build plan §4.3). When a Crisis is created, the routing
//    rules resolve the recall group(s) and the member list is COPIED into
//    CrisisRecallMember. Every action a DM or OR Analyst takes during the crisis
//    operates on that copy. The master RecallGroup/RecallGroupMember records in
//    crisisConfig.ts are NEVER modified by crisis operations. Without this, a DM
//    removing an unreachable member from tonight's fire would permanently delete
//    them from the master recall group, and nobody would notice until the next
//    crisis. This is the single most expensive decision to retrofit later.
//
// 2. DELIVERY ≠ ACKNOWLEDGEMENT (build plan §4.4, §5.2). deliveryStatus and
//    ackStatus are two independent fields tracking two independent state machines
//    on the same recipient row. The gateway confirms a message reached a handset;
//    only the recipient can confirm they are coming. An ack is accepted from any
//    delivery state at or after SENT — including FAILED — because link-based acks
//    routinely arrive before the delivery receipt and many providers never send a
//    receipt at all. Do not merge these into one status column.

export type CrisisStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'DISPATCHED'
  | 'ACTIVE'
  | 'STOOD_DOWN'
  | 'CLOSED'
  | 'CANCELLED'
  | 'SUPERSEDED';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'EXHAUSTED';
export type AckStatus = 'AWAITING' | 'ACKNOWLEDGED' | 'DECLINED' | 'NO_RESPONSE' | 'ESCALATED';

export type StandDownReason = 'Resolved' | 'False alarm' | 'Duplicate';

// ── State machine guards ──────────────────────────────────────────────────────
// Centralised so the API route, the UI button gating and any future automation
// all agree on what is legal. A transition that is not listed here does not exist.

const CRISIS_TRANSITIONS: Record<CrisisStatus, CrisisStatus[]> = {
  DRAFT: ['PENDING_REVIEW', 'SUPERSEDED'],
  // CANCELLED is reachable ONLY pre-dispatch. Once messages are out, responders are
  // mobilising and must be told to stand down — see standDown(), not cancel().
  PENDING_REVIEW: ['DISPATCHED', 'CANCELLED', 'SUPERSEDED'],
  DISPATCHED: ['ACTIVE', 'STOOD_DOWN'],
  ACTIVE: ['STOOD_DOWN'],
  STOOD_DOWN: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

export function canTransition(from: CrisisStatus, to: CrisisStatus): boolean {
  return (CRISIS_TRANSITIONS[from] || []).includes(to);
}

export function assertTransition(from: CrisisStatus, to: CrisisStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal crisis transition ${from} → ${to}.`);
  }
}

// A crisis that has gone out to recipients. Used to decide cancel-vs-stand-down
// and to lock the recipient snapshot against further pre-dispatch editing.
export function isDispatched(status: CrisisStatus): boolean {
  return status === 'DISPATCHED' || status === 'ACTIVE' || status === 'STOOD_DOWN' || status === 'CLOSED';
}

export function isTerminal(status: CrisisStatus): boolean {
  return status === 'CLOSED' || status === 'CANCELLED' || status === 'SUPERSEDED';
}

// Acknowledgement is accepted from any delivery state at or after SENT, including
// FAILED. See rule 2 at the top of this file — this function is the reason valid
// acknowledgements don't get discarded.
export function canAcknowledge(delivery: DeliveryStatus, ack: AckStatus): boolean {
  if (delivery === 'PENDING') return false;
  return ack !== 'ACKNOWLEDGED' && ack !== 'DECLINED';
}

// ── Entities ──────────────────────────────────────────────────────────────────

// Snapshot member row (build plan §4.3). This is the entity edited under FSD
// §11.5.e — never the master.
export interface CrisisRecallMember {
  id: string;
  // Provenance back to the master record, for the after-action report only. This
  // is a reference, NOT a live link: editing this row must never write back.
  masterMemberId?: string;
  name: string;
  roleInGroup: string;
  mobile: string;
  email: string;
  tier: string;
  sourceGroups: string[];
  // Members added by a DM/OR Analyst during the crisis rather than resolved from a
  // recall group. Surfaced separately in the after-action report so an auditor can
  // see who was pulled in ad hoc (Q9).
  addedDuringCrisis?: boolean;
  addedBy?: string;
  addedAt?: string;
  removed?: boolean;
  removedBy?: string;
  removedAt?: string;
  removalReason?: string;
}

export interface Crisis {
  id: string;
  sourceIncidentId: string;
  sourceCaseId?: string;
  incidentTitle: string;
  incidentType: string;
  incidentSubType?: string;
  locationSummary: string;
  crisisLevel: number;            // FSD §5.2 numbering: 1 = most severe
  status: CrisisStatus;
  createdAt: string;
  // Soft claim (build plan §10, Concurrency (b)). NOT a hard lock: a DM who walks
  // away must never be able to block a crisis dispatch, so any other DM can take
  // over, and the claim goes stale on its own.
  claimedBy?: string;
  claimedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  dispatchedAt?: string;
  dispatchedBy?: string;
  standDownAt?: string;
  standDownBy?: string;
  standDownReason?: StandDownReason;
  closureNotes?: string;
  closedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  // Resolution result captured at trigger time (§4.5), retained so the report can
  // explain why this recipient list exists.
  matchedRuleNames: string[];
  resolvedGroupNames: string[];
  templateId?: string;
  routingWarnings: string[];
  members: CrisisRecallMember[];
  // Set when the source incident changed level after the crisis was created and a
  // DM has not yet acted on it (build plan §5.1 linkage table).
  incidentDowngraded?: boolean;
  incidentEscalated?: boolean;
  linkageNote?: string;
}

export interface DispatchRecipient {
  id: string;
  crisisId: string;
  dispatchId: string;
  memberId: string;
  name: string;
  mobile: string;
  channel: string;
  // ── Track 1: delivery, driven by the provider ──
  deliveryStatus: DeliveryStatus;
  firstSentAt?: string;    // Set ONCE at initial dispatch, never overwritten.
  sentAt?: string;
  deliveredAt?: string;
  failureReason?: string;
  attempts: number;
  // ── Track 2: acknowledgement, driven by the recipient. Independent of track 1 ──
  ackStatus: AckStatus;
  ackAt?: string;
  ackMethod?: 'Link' | 'Keyword' | 'Manual';
  eta?: string;
  remindersSent?: number;  // Default 0
  lastReminderAt?: string;
  escalationLevel: number;
  // Tokenised acknowledgement link (Appendix A method 2 — the default, since it
  // has no telco dependency). Opaque, single-crisis scoped.
  ackToken: string;
  // Manual "I phoned them and they're coming" from the DM. Recorded with the actor
  // because it is the one ack the system did not observe itself.
  markedContactedBy?: string;
  markedContactedAt?: string;
}

export interface Dispatch {
  id: string;
  crisisId: string;
  templateId?: string;
  templateName?: string;
  channel: string;
  renderedMessage: string;
  triggeredBy: string;
  triggeredAt: string;
  sequence: 'initial' | 're-send' | 'escalation' | 'stand_down';
  recipientCount: number;
}

export interface CrisisAuditEntry {
  id: string;
  crisisId: string;
  at: string;
  actor: string;
  action: string;
  details: string;
}

// ── Trigger evaluation (story 9) ──────────────────────────────────────────────
//
// ⚠ DIRECTION WARNING — read before changing this function.
// The build plan says a crisis triggers at "level 4+". FSD §5.2 defines Level 1 as
// the MOST severe and Level 5 as an occurrence, and broadcastConfig.ts already
// implements the FSD direction. Implementing the plan's wording literally would
// recall responders for the least severe incidents and stay silent for the most
// severe — an inverted trigger that would look like it worked in every demo using
// the default crisisLevel of 4.
//
// Built the FSD way. Raised as Q12. If Shin Feng confirms the plan's numbering is
// correct, change ONLY this constant.
export const CRISIS_TRIGGER_AT_OR_BELOW_LEVEL = 2;

export function shouldTriggerCrisis(crisisLevel: number | undefined | null): boolean {
  if (typeof crisisLevel !== 'number' || Number.isNaN(crisisLevel)) return false;
  return crisisLevel <= CRISIS_TRIGGER_AT_OR_BELOW_LEVEL;
}

export function crisisLevelLabel(level: number): string {
  return `Level ${level}`;
}

// ── Derived dashboard figures (stories 21, 23, 26) ────────────────────────────
// The live dashboard has to answer three questions in five seconds (build plan
// §6.3): how many have acknowledged, who is silent and what is being done about
// them, and whether there are enough responders.

export interface CrisisCounters {
  total: number;
  acknowledged: number;
  declined: number;
  awaiting: number;
  noResponse: number;
  delivered: number;
  failed: number;
  escalated: number;
  responseRatePct: number;
}

export function computeCounters(recipients: DispatchRecipient[]): CrisisCounters {
  const total = recipients.length;
  const acknowledged = recipients.filter((r) => r.ackStatus === 'ACKNOWLEDGED').length;
  const declined = recipients.filter((r) => r.ackStatus === 'DECLINED').length;
  const noResponse = recipients.filter((r) => r.ackStatus === 'NO_RESPONSE').length;
  const escalated = recipients.filter((r) => r.ackStatus === 'ESCALATED').length;
  const awaiting = recipients.filter((r) => r.ackStatus === 'AWAITING').length;
  return {
    total,
    acknowledged,
    declined,
    awaiting,
    noResponse,
    escalated,
    delivered: recipients.filter((r) => r.deliveryStatus === 'DELIVERED').length,
    failed: recipients.filter((r) => r.deliveryStatus === 'FAILED' || r.deliveryStatus === 'EXHAUSTED').length,
    responseRatePct: total === 0 ? 0 : Math.round(((acknowledged + declined) / total) * 100),
  };
}

// Median, not mean. One responder who acknowledges four hours later after leaving
// their phone in a locker would drag a mean acknowledgement time into uselessness.
export function medianAckSeconds(recipients: DispatchRecipient[]): number | null {
  const deltas = recipients
    .filter((r) => r.ackStatus === 'ACKNOWLEDGED' && r.ackAt && r.sentAt)
    .map((r) => (new Date(r.ackAt as string).getTime() - new Date(r.sentAt as string).getTime()) / 1000)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  if (deltas.length === 0) return null;
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 ? deltas[mid] : Math.round((deltas[mid - 1] + deltas[mid]) / 2);
}



export function formatDuration(fromIso: string, toIso?: string): string {
  const ms = (toIso ? new Date(toIso).getTime() : Date.now()) - new Date(fromIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

// A claim older than this is treated as abandoned and no longer shows another DM a
// read-only screen. Deliberately short: the cost of two DMs briefly both editing is
// a merge conflict, while the cost of a stale claim is a recall nobody can dispatch.
export const CLAIM_STALE_MINUTES = 10;

export function claimIsStale(claimedAt?: string): boolean {
  if (!claimedAt) return true;
  return Date.now() - new Date(claimedAt).getTime() > CLAIM_STALE_MINUTES * 60_000;
}

export function activeMembers(c: Crisis): CrisisRecallMember[] {
  return c.members.filter((m) => !m.removed);
}
