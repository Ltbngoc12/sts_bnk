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
