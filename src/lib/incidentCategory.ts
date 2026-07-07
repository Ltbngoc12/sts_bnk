// Incident Category — FSD v0.5 §5.1.2.
//
// v0.5 rewrites this field's meaning: it now DRIVES default response/assignment/
// closure/broadcast behavior (not "for-info only" as in v0.4), and collapses the old
// 5-value taxonomy (Standard/Proactive/Backdated/Ongoing/Informational-Exercise) down
// to 3 values.
//
// Some behavior below is a temporary best-guess default pending BA (Shin Feng) sign-off
// — see QnA_FSD_v0.5_IncidentCategory.md and INCIDENT_CATEGORY_IMPLEMENTATION_PLAN.md at
// the repo root for the open questions. Search this repo for "TODO: confirm with BA" to
// find every place that will need revisiting once she replies.
export const INCIDENT_CATEGORIES = [
  'Operational Incident',
  'Backdated Incident',
  'Informational / Exercise Records',
] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];

export const DEFAULT_INCIDENT_CATEGORY: IncidentCategory = 'Operational Incident';

export function isValidIncidentCategory(value: unknown): value is IncidentCategory {
  return typeof value === 'string' && (INCIDENT_CATEGORIES as readonly string[]).includes(value);
}

// Short helper copy shown under the category selector on Create/Edit/Attach forms.
export const INCIDENT_CATEGORY_HELP: Record<IncidentCategory, string> = {
  'Operational Incident':
    'Default category. Full live response flow applies — assignment, ground response, closure endorsement and broadcast where relevant.',
  'Backdated Incident':
    'The event already happened and ended. Ground-response steps do not apply; record the known details and submit — still requires Duty Manager endorsement before Closed.',
  'Informational / Exercise Records':
    'Does not require Responder assignment, ground response or broadcast by default. Exercise records may still include Responder assignment and milestone tracking where needed.',
};

// Legacy v0.4 category values (still present in older seed/mock data) mapped onto the
// 3 new v0.5 values. Used by src/lib/db.ts hydrateDb() to normalize records on read, the
// same way legacy status aliases are normalized there.
const LEGACY_CATEGORY_MAP: Record<string, IncidentCategory> = {
  'Standard Incident': 'Operational Incident',
  'Proactive Incident': 'Operational Incident',
  'Ongoing Incident': 'Operational Incident',
  'Backdated Incident': 'Backdated Incident',
  'Informational / Exercise Records': 'Informational / Exercise Records',
  'Informational/Exercise Records': 'Informational / Exercise Records',
  // "Operational Record" shows up in some seed data as a stand-in for the old
  // "Informational / Exercise Records" v0.4 entry — treated as such here.
  'Operational Record': 'Informational / Exercise Records',
};

export function normalizeIncidentCategory(value: string | undefined | null): IncidentCategory {
  if (!value) return DEFAULT_INCIDENT_CATEGORY;
  if (isValidIncidentCategory(value)) return value;
  return LEGACY_CATEGORY_MAP[value] || DEFAULT_INCIDENT_CATEGORY;
}
