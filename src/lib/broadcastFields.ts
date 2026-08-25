// Broadcast template field catalog — admin config redesign (2026-07-25).
//
// Single source of truth for: (a) the "insert field" picker in the Template tab
// (drag/click to insert a {key} token instead of the admin typing it from memory),
// (b) sample values used by the Preview panel, and (c) documentation of which keys
// broadcast.ts's resolvers actually populate at dispatch time.
//
// IMPORTANT: keep these key lists in sync with the `vars` objects built in
// resolveClosureBroadcast() and resolveEodBroadcast() (src/lib/broadcast.ts). Before
// this file existed, the old admin page's MOCK_VARS had already drifted from the
// real resolver vars (missing case_id/closed_at/closed_by/incident_subtype; had
// stale total_incidents/open_incidents/... that no resolver ever populated) — this
// catalog exists specifically to stop that drift from recurring. If you add a key
// to a resolver's `vars`, add it here too (and vice versa).

import type { BroadcastType } from './broadcastConfig';

export interface BroadcastFieldDef {
  key: string;          // token name — inserted into templates as {key}
  label: string;        // shown in the field picker
  sampleValue: string;  // used to render the Preview panel
}

// Mirrors resolveClosureBroadcast()'s `vars` object exactly (broadcast.ts).
export const CLOSURE_BROADCAST_FIELDS: BroadcastFieldDef[] = [
  { key: 'case_id', label: 'Case ID', sampleValue: '2002/01/0004' },
  { key: 'incident_id', label: 'Incident ID', sampleValue: 'SEN/IR/20260613/0014' },
  { key: 'incident_title', label: 'Incident Title', sampleValue: 'Water Pipe Burst near Beach Station' },
  // Incident's actual occurrence date/time (FSD §5.4.1 "Date and Time of Incident",
  // backdating permitted) — distinct from `time` below, which is the broadcast's
  // own dispatch/generation timestamp, not when the incident happened.
  { key: 'incident_datetime', label: 'Date and Time of Incident', sampleValue: '2026-06-13T07:45:00.000Z' },
  { key: 'incident_type', label: 'Incident Type', sampleValue: 'Security' },
  { key: 'incident_subtype', label: 'Incident Sub-type', sampleValue: 'Trespassing' },
  { key: 'priority', label: 'Priority', sampleValue: 'High' },
  { key: 'location', label: 'Location', sampleValue: 'Siloso Beach Walk - Siloso Beach Station' },
  { key: 'crisis_level', label: 'Crisis Level', sampleValue: 'Level 4' },
  // FSD §5.4.4 — channel the report came in on (Public Phone, Email, UCS, VA, ...).
  { key: 'reporting_source', label: 'Reporting Source', sampleValue: 'VA' },
  { key: 'status', label: 'Status', sampleValue: 'Closed' },
  { key: 'closed_at', label: 'Closed At', sampleValue: '2026-07-25T20:00:00.000Z' },
  { key: 'closed_by', label: 'Closed By', sampleValue: 'DM Gan' },
  { key: 'time', label: 'Time (now)', sampleValue: '2026-07-25T20:05:00.000Z' },
  { key: 'summary', label: 'Summary', sampleValue: 'Major water leakage detected under ticketing kiosk.' },
];

// Mirrors resolveEodBroadcast()'s `vars` object exactly — same as Closure minus
// closed_at/closed_by (the incident is still open, not yet closed).
export const EOD_BROADCAST_FIELDS: BroadcastFieldDef[] = CLOSURE_BROADCAST_FIELDS.filter(
  (f) => f.key !== 'closed_at' && f.key !== 'closed_by'
);

// Weather Advisory has no resolver in broadcast.ts yet (config-only until a
// weather-feed trigger exists — see plan doc §2.4). Field set mirrors the tokens
// already used by the DEFAULT_BROADCAST_TEMPLATES 'tpl-weather' seed body.
export const WEATHER_ADVISORY_FIELDS: BroadcastFieldDef[] = [
  { key: 'summary', label: 'Summary', sampleValue: 'Heavy thunderstorm warning for the next 3 hours.' },
  { key: 'location', label: 'Location(s) affected', sampleValue: 'Siloso Beach, Palawan Beach' },
  { key: 'time', label: 'Issued At', sampleValue: '2026-07-25T20:05:00.000Z' },
];

// Broadcast Type -> field catalog, keyed the same way BROADCAST_TYPES/category is
// stored on BroadcastTemplate.
export const BROADCAST_FIELDS_BY_TYPE: Record<BroadcastType, BroadcastFieldDef[]> = {
  'Closure Broadcast': CLOSURE_BROADCAST_FIELDS,
  'End-of-Day Interim Broadcast': EOD_BROADCAST_FIELDS,
  'Weather Advisory Broadcast': WEATHER_ADVISORY_FIELDS,
};

export function getFieldsForBroadcastType(category: string | undefined | null): BroadcastFieldDef[] {
  if (!category) return CLOSURE_BROADCAST_FIELDS;
  return BROADCAST_FIELDS_BY_TYPE[category as BroadcastType] || CLOSURE_BROADCAST_FIELDS;
}

// Build a { key: sampleValue } map for the Preview panel's {variable} substitution.
export function sampleVarsForBroadcastType(category: string | undefined | null): Record<string, string> {
  const fields = getFieldsForBroadcastType(category);
  return Object.fromEntries(fields.map((f) => [f.key, f.sampleValue]));
}
