// Broadcast permission codes + role→permission seed (FSD v0.5 §3 / §13.1).
//
// This is the atomic permission-code model that RBAC_Redesign_Incident_Module.md
// specifies, scoped here to the Broadcast module (broadcast.*). It is CLIENT-SAFE
// (pure data + function) so both UI (button gating) and server routes can call it.
//
// Identity note: there is no auth/session yet, so enforcement is keyed on the active
// RoleContext role (Kyle confirmed the mock-identity approach). Swap `role` for a real
// resolved user identity once authentication + Duty Manager elevation land.

export type BroadcastPermission =
  | 'broadcast.view'
  | 'broadcast.compose'
  | 'broadcast.dispatch'
  | 'broadcast.eod_review'
  | 'broadcast.config';

// Seeded to match current default behaviour + FSD §5.11.1b (the Controller reviews
// and DISPATCHES the closure broadcast). System / Current Ops Admin configure (§13.3).
const BROADCAST_ROLE_PERMISSIONS: Record<string, BroadcastPermission[]> = {
  'System Administrator': ['broadcast.view', 'broadcast.compose', 'broadcast.dispatch', 'broadcast.eod_review', 'broadcast.config'],
  'Current Ops Administrator': ['broadcast.view', 'broadcast.compose', 'broadcast.dispatch', 'broadcast.eod_review', 'broadcast.config'],
  'Duty Manager': ['broadcast.view', 'broadcast.compose', 'broadcast.dispatch', 'broadcast.eod_review'],
  'Duty Officer': ['broadcast.view', 'broadcast.compose', 'broadcast.dispatch', 'broadcast.eod_review'],
  'Controller': ['broadcast.view', 'broadcast.compose', 'broadcast.dispatch'],
  'Responder (Ranger)': [],
  'Stakeholder': [],
  // Non-switchable roles that appear in the admin role matrix — receive-only.
  'Broadcast Recipient': [],
  'Operational Resilience Analyst': ['broadcast.view'],
};

export function hasBroadcastPermission(role: string | undefined | null, code: BroadcastPermission): boolean {
  if (!role) return false;
  return (BROADCAST_ROLE_PERMISSIONS[role] || []).includes(code);
}

export function broadcastPermissionsForRole(role: string | undefined | null): BroadcastPermission[] {
  if (!role) return [];
  return BROADCAST_ROLE_PERMISSIONS[role] || [];
}

// ── Crisis Management & Emergency Recall (FSD §11.5) ──────────────────────────
// Build plan §3 carries an explicit DESIGN INSTRUCTION: implement crisis
// permissions as FLAGS, not hardcoded role checks. The reason is Q1 — FSD §11.5.e
// names the "OR Analyst assigned to recall group operations" as the holder of the
// active-crisis member-edit permission, and whether the Duty Manager also holds it
// is unconfirmed with Shin Feng. Modelling it as a permission code means the
// answer to Q1 changes one line in the map below instead of rewriting call sites.
//
// DO NOT replace `hasCrisisPermission(role, 'crisis.members_edit')` at a call site
// with `role === 'Duty Manager'`. That is the rework this design exists to avoid.
export type CrisisPermission =
  | 'crisis.view'          // see the crisis queue
  | 'crisis.config'        // M1 — recall groups, templates, routing, provider, ack rules
  | 'crisis.dispatch'      // review and dispatch a recall (DM only, build plan §3)
  | 'crisis.members_edit'  // FSD §11.5.e — edit members on an ACTIVE crisis (Q1)
  | 'crisis.contact'       // manual re-send / mark-contacted a non-responder
  | 'crisis.close'         // stand down / close a crisis
  | 'crisis.report';       // after-action report

const CRISIS_ROLE_PERMISSIONS: Record<string, CrisisPermission[]> = {
  // Config is Sys Admin territory (build plan §3, row 1–2: DM and OR Analyst are
  // explicitly "No" on master recall group and template/routing configuration).
  //
  // 'crisis.members_edit' granted to both admin roles on 2026-08-02 (Kyle) —
  // build plan v1.0 §3 had Sys Admin as "No" on FSD §11.5.e. Overridden so an
  // administrator can repair a recipient list mid-crisis; in practice the admin is
  // often the only person who can fix a contact record at 3am, and a crisis where
  // nobody can add the one person who is actually reachable is a worse failure than
  // an over-broad permission. §3 of the build plan updated to match.
  'System Administrator': ['crisis.view', 'crisis.config', 'crisis.members_edit', 'crisis.report'],
  'Current Ops Administrator': ['crisis.view', 'crisis.config', 'crisis.members_edit', 'crisis.report'],
  // Q1 UNRESOLVED — 'crisis.members_edit' is granted to the Duty Manager here
  // provisionally, marked TBC in build plan §3. If Shin Feng confirms the
  // permission sits with the OR Analyst alone, delete it from this line only.
  'Duty Manager': ['crisis.view', 'crisis.dispatch', 'crisis.members_edit', 'crisis.contact', 'crisis.close', 'crisis.report'],
  'Operational Resilience Analyst': ['crisis.view', 'crisis.members_edit', 'crisis.contact', 'crisis.report'],
  'Duty Officer': ['crisis.view'],
  'Controller': ['crisis.view'],
  'Responder (Ranger)': [],
  'Stakeholder': [],
  'Broadcast Recipient': [],
};

export function hasCrisisPermission(role: string | undefined | null, code: CrisisPermission): boolean {
  if (!role) return false;
  return (CRISIS_ROLE_PERMISSIONS[role] || []).includes(code);
}

export function crisisPermissionsForRole(role: string | undefined | null): CrisisPermission[] {
  if (!role) return [];
  return CRISIS_ROLE_PERMISSIONS[role] || [];
}

// Role names that participate in the Broadcast module at all — used to populate
// the "Recipient Role" dropdown on the Action Prompt Rules tab (admin config
// redesign, 2026-07-25) so admins pick from a real, maintained list instead of
// typing a role name that doesn't exist anywhere in the system.
export const BROADCAST_RECIPIENT_ROLE_OPTIONS = Object.keys(BROADCAST_ROLE_PERMISSIONS);
