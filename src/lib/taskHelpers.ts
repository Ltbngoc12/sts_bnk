import { getUsers, UserAccount } from './users';
import { getActiveGroups, DistributionGroup } from './groups';

// Canonical ordered statuses (FRD 7.3.2)
export const TASK_STATUSES = [
  'Created',
  'Assigned',
  'Acknowledged',
  'In Progress',
  'Pending Further Action',
  'Pending Closure',
  'Returned',
  'Closed',
] as const;

export type TaskStatusName = (typeof TASK_STATUSES)[number];

// Map a task status to an existing badge utility class (globals.css)
export function taskBadgeClass(status: string): string {
  switch (status) {
    case 'Created': return 'badge-info';
    case 'Assigned': return 'badge-assigned';
    case 'Acknowledged': return 'badge-ack';
    case 'In Progress': return 'badge-onsite';
    case 'Pending Further Action': return 'badge-pending-ctrl';
    case 'Pending Closure': return 'badge-pending-closure';
    case 'Returned': return 'badge-returned';
    case 'Closed': return 'badge-closed';
    default: return 'badge-info';
  }
}

// Kanban column grouping for the board
export type TaskColumn = 'created' | 'active' | 'pending' | 'closed';

export function columnForStatus(status: string): TaskColumn {
  if (status === 'Created' || status === 'Assigned' || status === 'Returned') return 'created';
  if (status === 'Acknowledged' || status === 'In Progress') return 'active';
  if (status === 'Pending Further Action' || status === 'Pending Closure') return 'pending';
  return 'closed';
}

const CONTROLLER_PLUS = [
  'Controller',
  'Duty Officer',
  'Duty Manager',
  'System Administrator',
  'Current Ops Administrator',
];

export function isControllerPlus(role?: string): boolean {
  return !!role && CONTROLLER_PLUS.includes(role);
}

// Any CMS-registered, active staff member may be assigned (FRD 7.1.2).
// Exclude pure external broadcast recipients.
export function getAssignableUsers(): UserAccount[] {
  return getUsers().filter(
    u => u.status === 'Active' && u.role !== 'Broadcast Recipient'
  );
}

export function getAssignableGroups(): DistributionGroup[] {
  return getActiveGroups();
}

// Internal (CMS) members of a group — the actual notifiable assignees.
export function internalGroupMembers(groupName: string): string[] {
  const grp = getActiveGroups().find(g => g.name === groupName);
  if (!grp) return [];
  return grp.members.filter(m => m.type === 'Internal').map(m => m.name);
}
