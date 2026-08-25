// Source for Task Distribution Groups (group assignment per FRD 7.2), managed at
// /admin/task-configuration ("Task Configuration" in the sidebar — "Task
// Distribution" tab, since 2026-07-27 when it merged with the Template tab).
// Persisted client-side in localStorage so admin edits are reflected wherever
// groups are consumed.
//
// 2026-07-27 (Kyle, confirmed with client) — Broadcast used to read this exact
// store too, but Broadcast's recipient groups are now a SEPARATE dataset: see
// DEFAULT_BROADCAST_DISTRIBUTION_GROUPS in broadcastConfig.ts, managed from the
// "Distribution Groups" tab on /admin/broadcast-config (its own Mongo collection,
// no localStorage). Editing a group here no longer has any effect on Broadcast
// routing, and vice versa.

export interface GroupMember {
  id: string;
  name: string;
  type: 'Internal' | 'External';
  email: string;
  phone: string;
  // Present when this member was added by selecting an existing CMS user
  // account (src/lib/users.ts) rather than entered as a free-text external
  // contact. Values are copied in at add-time (no live sync back to the
  // user record) since groups.ts and users.ts are independent stores.
  userId?: string;
  // Free-text note, only used for External Contact members (no Member Type
  // picker for that path — the admin can jot context here instead, e.g.
  // "Cove north gate duty desk, staffed 24/7").
  remark?: string;
}

export interface DistributionGroup {
  id: string;
  name: string;
  description: string;
  members: GroupMember[];
  status: 'Active' | 'Deactivated';
}

export const GROUPS_STORAGE_KEY = 'admin_dist_groups';

export const DEFAULT_GROUPS: DistributionGroup[] = [
  {
    id: 'grp-1',
    name: 'SDC Crisis Command',
    description: 'SDC executive leaders and emergency operational response units.',
    status: 'Active',
    members: [
      { id: 'm-1', name: 'DM Gan', type: 'Internal', email: 'gan.sh@sdc.gov.sg', phone: '+65 9876 5432' },
      { id: 'm-2', name: 'DO Shin Feng', type: 'Internal', email: 'shin.feng@sdc.gov.sg', phone: '+65 9123 4567' },
      { id: 'm-3', name: 'Police Liaison Officer', type: 'External', email: 'spf_liaison@spf.gov.sg', phone: '+65 9991 1111' },
      { id: 'm-4', name: 'SCDF Commander', type: 'External', email: 'scdf_command@scdf.gov.sg', phone: '+65 8888 9999' }
    ]
  },
  {
    id: 'grp-2',
    name: 'Sentosa Cove Residents',
    description: 'Sentosa Cove joint committee, security gates and community liaison representatives.',
    status: 'Active',
    members: [
      { id: 'm-5', name: 'Cove Management Office', type: 'External', email: 'cove_mgr@cove.com.sg', phone: '+65 6789 0123' },
      { id: 'm-6', name: 'Security North Gate', type: 'External', email: 'cove_sec_north@cove.com.sg', phone: '+65 6789 0124' },
      { id: 'm-7', name: 'Liaison Officer', type: 'Internal', email: 'liaison@sdc.gov.sg', phone: '+65 9111 2222' }
    ]
  },
  {
    id: 'grp-3',
    name: 'Beach Operators & F&B Tenants',
    description: 'Siloso and Palawan beach attraction managers, lifeguards and F&B owners.',
    status: 'Active',
    members: [
      { id: 'm-8', name: 'Siloso Beach Cafe Manager', type: 'External', email: 'silosocafe@food.com.sg', phone: '+65 9222 3333' },
      { id: 'm-9', name: 'Ola Beach Club Desk', type: 'External', email: 'ops@olabeach.com.sg', phone: '+65 6123 4567' },
      { id: 'm-10', name: 'Ranger John', type: 'Internal', email: 'john.doe@ranger.com.sg', phone: '+65 9333 4444' }
    ]
  },
  {
    id: 'grp-4',
    name: 'Ground Ranger Team',
    description: 'Frontline rangers available for operational task assignment across the island.',
    status: 'Active',
    members: [
      { id: 'm-11', name: 'Ranger John', type: 'Internal', email: 'john.doe@ranger.com.sg', phone: '+65 9333 4444' },
      { id: 'm-12', name: 'Ranger Sarah', type: 'Internal', email: 'sarah.doe@ranger.com.sg', phone: '+65 9333 5555' },
      { id: 'm-13', name: 'Ranger Alex', type: 'Internal', email: 'alex.doe@ranger.com.sg', phone: '+65 9333 6666' },
      { id: 'm-14', name: 'Ranger Tommy', type: 'Internal', email: 'tommy.doe@ranger.com.sg', phone: '+65 9333 7777' }
    ]
  }
];

export function getGroups(): DistributionGroup[] {
  if (typeof window === 'undefined') {
    return DEFAULT_GROUPS;
  }
  const stored = localStorage.getItem(GROUPS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_GROUPS;
    }
  }
  localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(DEFAULT_GROUPS));
  return DEFAULT_GROUPS;
}

export function saveGroups(groups: DistributionGroup[]): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  }
}

// Active groups only — used for assignment pickers.
export function getActiveGroups(): DistributionGroup[] {
  return getGroups().filter(g => g.status === 'Active');
}
