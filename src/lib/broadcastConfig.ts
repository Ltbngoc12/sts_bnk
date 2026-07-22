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
// Templates define the default set of incident fields per incident type, sub-type
// and crisis level, and must exclude sensitive content by default (§10.4c).
export interface BroadcastTemplate {
  id: string;
  category: string;            // BroadcastType (kept as string for forward-compat)
  name: string;
  subject: string;
  body: string;
  incidentType?: string;       // §10.4a — mapped determinant
  incidentSubType?: string;    // §10.1e / §13.3 — added in v0.5
  crisisLevel?: string;        // §10.4a — mapped determinant
  // §10.4c-d — fields excluded from the default template; may only be added at
  // dispatch with explicit Duty Manager confirmation.
  sensitiveFields?: string[];
}

// ── Broadcast Matrix Rule (FSD §10.6 / §13.3) ──────────────────────────────────
// Maps incident type + sub-type + crisis level → distribution group + channels.
export interface BroadcastMatrixRule {
  id: string;
  crisisLevel: string;
  broadcastType: string;
  recipientGroup: string;      // DistributionGroup.name
  deliveryChannels: string[];
  incidentType?: string;       // §13.3 — added in v0.5
  incidentSubType?: string;    // §13.3 — added in v0.5
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
}

export const DEFAULT_BROADCAST_CONFIG: BroadcastConfig = {
  id: 'singleton',
  endOfDayTime: '20:00',
  // FSD §5.1.2: Operational incidents carry broadcast handling; Informational/Exercise
  // "do not require … broadcast handling by default"; Backdated makes no mention of a
  // broadcast (already-concluded incident) → excluded by default, pending BA confirmation.
  closureRequiredCategories: ['Operational Incident'],
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
    incidentType: 'Any',
    crisisLevel: 'Any',
    // Excluded by default per §10.4c — operationally sensitive fields.
    sensitiveFields: ['emergency_services', 'casualty_details', 'investigation_notes', 'media_involvement'],
  },
  {
    id: 'tpl-eod',
    category: 'End-of-Day Interim Broadcast',
    name: 'End-of-Day Interim Broadcast',
    subject: '[SDC] End-of-Day Interim Update: {incident_title}',
    body:
      'END-OF-DAY INTERIM UPDATE\n\nCase ID: {case_id}\nIncident ID: {incident_id}\nTitle: {incident_title}\nClassification: {incident_type} — {incident_subtype}\nLocation: {location}\nCrisis Level: {crisis_level}\nCurrent Status: {status}\n\nSummary of progress to date: {summary}\n\nThis incident remains open and under management. Issued by the Duty Manager on duty.',
    incidentType: 'Any',
    crisisLevel: 'Any',
    sensitiveFields: ['emergency_services', 'casualty_details', 'investigation_notes'],
  },
  {
    id: 'tpl-weather',
    category: 'Weather Advisory Broadcast',
    name: 'Weather Advisory Broadcast',
    subject: '[SDC] Weather Advisory: {incident_title}',
    body:
      'WEATHER ADVISORY\n\n{summary}\n\nLocation(s) affected: {location}\nIssued At: {time}\n\nPlease take appropriate precautions. Issued by the authorised Duty Officer.',
    incidentType: 'Weather',
    crisisLevel: 'Any',
    sensitiveFields: [],
  },
];

// Matrix seed keyed by crisis level → recipient group + channels (§10.6, TBC in FSD;
// this is a working draft using the seeded distribution groups from groups.ts).
export const DEFAULT_BROADCAST_MATRIX: BroadcastMatrixRule[] = [
  { id: 'mat-l1', crisisLevel: 'Level 1', broadcastType: 'Closure Broadcast', incidentType: 'Any', recipientGroup: 'SDC Crisis Command', deliveryChannels: ['Email', 'Push Notification'] },
  { id: 'mat-l2', crisisLevel: 'Level 2', broadcastType: 'Closure Broadcast', incidentType: 'Any', recipientGroup: 'SDC Crisis Command', deliveryChannels: ['Email', 'Push Notification'] },
  { id: 'mat-l3', crisisLevel: 'Level 3', broadcastType: 'Closure Broadcast', incidentType: 'Any', recipientGroup: 'SDC Crisis Command', deliveryChannels: ['Email', 'Push Notification'] },
  { id: 'mat-l4', crisisLevel: 'Level 4', broadcastType: 'Closure Broadcast', incidentType: 'Any', recipientGroup: 'Beach Operators & F&B Tenants', deliveryChannels: ['Email'] },
  { id: 'mat-l5', crisisLevel: 'Level 5', broadcastType: 'Closure Broadcast', incidentType: 'Any', recipientGroup: 'Beach Operators & F&B Tenants', deliveryChannels: ['Email'] },
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

export type { DistributionGroup };
