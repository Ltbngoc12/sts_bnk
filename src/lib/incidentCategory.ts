// Incident Category — FSD v0.5 §5.1.2.
//
// v0.5 rewrites this field's meaning: it now DRIVES default response/assignment/
// closure/broadcast behavior (not "for-info only" as in v0.4), and collapses the old
// 5-value taxonomy (Standard/Proactive/Backdated/Ongoing/Informational-Exercise) down
// to 3 values. "Ongoing" was folded into the default (Operational) category — it just
// meant an incident carrying over into the next day, now handled by the interim
// broadcast instead of a separate flag. "Proactive" (occurrences not yet serious
// enough to be an incident) is now covered by e-Diary instead.
//
// Confirmed with BA (Shin Feng) — see QnA_FSD_v0.5_IncidentCategory.md at the repo root:
// all 3 categories share the exact same standard incident lifecycle end-to-end. The
// category is a classification of use case at creation time, not a different workflow.
// The only real behavioral differences are:
//   - Responder assignment is optional for every category (not just Backdated/Informational).
//   - If no Responder is assigned, the Controller fills in the record themselves and
//     submits it straight for Duty Manager endorsement (incident stays at status "Live"
//     until submitted — see the submit-review/submit-endorsement handler in
//     src/app/api/incidents/[...id]/route.ts).
//   - If a Responder IS assigned (any category, including Backdated), the normal
//     ground-response cycle (acknowledge → on-site → notify-complete) applies.
//   - Every incident, regardless of category, still requires Duty Manager endorsement
//     before it can be Closed — there is no shortcut/direct-close path for any category.
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
    'Default category for active incidents. Full live response flow applies — Responder assignment, ground response, closure endorsement and broadcast where relevant.',
  'Backdated Incident':
    'The event already happened and ended. Responder assignment is optional — if no ground/post-action input is needed, fill in the known details yourself and submit straight for Duty Manager endorsement. If a Responder is assigned (e.g. for follow-up log updates), the normal response cycle applies.',
  'Informational / Exercise Records':
    'Same standard lifecycle. Responder assignment is optional and only tracked through the response cycle when someone is actually assigned. Still requires Duty Manager endorsement before Closed.',
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
