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
    description: 'SDC executive leaders, duty managers and emergency operational response units.',
    status: 'Active',
    members: [
      { id: 'm-1', name: 'DM Gan', type: 'Internal', email: 'gan.sh@sdc.gov.sg', phone: '+65 9876 5432' },
      { id: 'm-2', name: 'DO Shin Feng', type: 'Internal', email: 'shin.feng@sdc.gov.sg', phone: '+65 9123 4567' },
      { id: 'm-3', name: 'Police Liaison Officer (SPF)', type: 'External', email: 'spf_liaison@spf.gov.sg', phone: '+65 9991 1111' },
      { id: 'm-4', name: 'SCDF 1st Division Commander', type: 'External', email: 'scdf_command@scdf.gov.sg', phone: '+65 8888 9999' }
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
      { id: 'm-7', name: 'Security South Gate Desk', type: 'External', email: 'cove_sec_south@cove.com.sg', phone: '+65 6789 0125' },
      { id: 'm-8', name: 'Liaison Officer', type: 'Internal', email: 'liaison@sdc.gov.sg', phone: '+65 9111 2222' }
    ]
  },
  {
    id: 'grp-3',
    name: 'Beach Operators & F&B Tenants',
    description: 'Siloso and Palawan beach attraction managers, lifeguards and F&B owners.',
    status: 'Active',
    members: [
      { id: 'm-9', name: 'Siloso Beach Cafe Manager', type: 'External', email: 'silosocafe@food.com.sg', phone: '+65 9222 3333' },
      { id: 'm-10', name: 'Ola Beach Club Desk', type: 'External', email: 'ops@olabeach.com.sg', phone: '+65 6123 4567' },
      { id: 'm-11', name: 'Trapizza Pavilion Ops', type: 'External', email: 'manager@trapizza.com.sg', phone: '+65 6277 7490' },
      { id: 'm-12', name: 'Tanjong Beach Club Duty Desk', type: 'External', email: 'duty@tanjongbeachclub.com', phone: '+65 6270 7998' }
    ]
  },
  {
    id: 'grp-4',
    name: 'Ground Ranger Team',
    description: 'Frontline rangers available for operational task assignment, patrol and perimeter control.',
    status: 'Active',
    members: [
      { id: 'm-13', name: 'Ranger John', type: 'Internal', email: 'john.doe@ranger.com.sg', phone: '+65 9333 4444' },
      { id: 'm-14', name: 'Ranger Sarah', type: 'Internal', email: 'sarah.doe@ranger.com.sg', phone: '+65 9333 5555' },
      { id: 'm-15', name: 'Ranger Alex', type: 'Internal', email: 'alex.doe@ranger.com.sg', phone: '+65 9333 6666' },
      { id: 'm-16', name: 'Ranger Tommy', type: 'Internal', email: 'tommy.doe@ranger.com.sg', phone: '+65 9333 7777' },
      { id: 'm-17', name: 'Ranger Dave', type: 'Internal', email: 'dave.doe@ranger.com.sg', phone: '+65 9333 8888' },
      { id: 'm-18', name: 'Ranger Mike', type: 'Internal', email: 'mike.doe@ranger.com.sg', phone: '+65 9333 9999' }
    ]
  },
  {
    id: 'grp-5',
    name: 'Sentosa Beach Lifeguards & Water Rescue',
    description: 'Certified lifeguards and coastal rescue team monitoring all 3 beaches (Siloso, Palawan, Tanjong).',
    status: 'Active',
    members: [
      { id: 'm-19', name: 'Lifeguard Supervisor Tan', type: 'Internal', email: 'tan.lifeguard@sdc.gov.sg', phone: '+65 9644 5566' },
      { id: 'm-20', name: 'Siloso Beach Patrol Lead', type: 'Internal', email: 'siloso.rescue@sdc.gov.sg', phone: '+65 9655 6677' },
      { id: 'm-21', name: 'Palawan Water Rescue Unit', type: 'Internal', email: 'palawan.rescue@sdc.gov.sg', phone: '+65 9666 7788' },
      { id: 'm-22', name: 'Tanjong First Responder Desk', type: 'Internal', email: 'tanjong.rescue@sdc.gov.sg', phone: '+65 9677 8899' }
    ]
  },
  {
    id: 'grp-6',
    name: 'Transport & Infrastructure Operators',
    description: 'Sentosa Express monorail, Singapore Cable Car, Shuttle buses and Carpark control.',
    status: 'Active',
    members: [
      { id: 'm-23', name: 'Singapore Cable Car Ops Desk', type: 'External', email: 'cablecar.ops@mountfaber.com.sg', phone: '+65 6377 9688' },
      { id: 'm-24', name: 'Sentosa Express Tram Duty Manager', type: 'Internal', email: 'express.duty@sdc.gov.sg', phone: '+65 6279 1155' },
      { id: 'm-25', name: 'Island Bus Shuttle Dispatcher', type: 'External', email: 'busops@comfortdelgro.com.sg', phone: '+65 6833 8811' },
      { id: 'm-26', name: 'Sentosa Gateway Carpark Control', type: 'Internal', email: 'carpark.ops@sdc.gov.sg', phone: '+65 6279 3300' }
    ]
  },
  {
    id: 'grp-7',
    name: 'Facilities & CMMS Engineering Team',
    description: 'Mechanical, electrical, structural, landscape and sanitation maintenance responders.',
    status: 'Active',
    members: [
      { id: 'm-27', name: 'Contractor Bob (Engie)', type: 'Internal', email: 'bob.builder@coporate.com', phone: '+65 9111 0009' },
      { id: 'm-28', name: 'Electrical Engineering Lead', type: 'External', email: 'electrical.lead@spgroup.com.sg', phone: '+65 9122 3344' },
      { id: 'm-29', name: 'Landscape & Tree Safety Officer', type: 'Internal', email: 'horticulture@sdc.gov.sg', phone: '+65 9133 4455' },
      { id: 'm-30', name: 'Sanitation & Cleaning Duty Lead', type: 'External', email: 'cleaning.lead@veolia.com.sg', phone: '+65 9144 5566' }
    ]
  },
  {
    id: 'grp-8',
    name: 'Corporate Communications & Media Team',
    description: 'SDC Corporate Communications, Press Liaison and Social Media Response Officers.',
    status: 'Active',
    members: [
      { id: 'm-31', name: 'Comms Duty Lead', type: 'Internal', email: 'comms.duty@sdc.gov.sg', phone: '+65 9155 6677' },
      { id: 'm-32', name: 'Media Relations Specialist', type: 'Internal', email: 'media@sdc.gov.sg', phone: '+65 9166 7788' },
      { id: 'm-33', name: 'SDC Social Media Desk', type: 'Internal', email: 'social@sdc.gov.sg', phone: '+65 9177 8899' }
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
