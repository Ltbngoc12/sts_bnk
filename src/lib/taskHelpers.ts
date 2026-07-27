import { getUsers, UserAccount } from './users';
import { getActiveGroups, DistributionGroup } from './groups';
import type { TaskAssignee } from './db';

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

// Whether `username` may act as an assignee on a task carrying this
// `assignees` set — matches an individually-assigned user directly, or
// membership in any assigned group's internal roster. Used wherever a task
// gates an action (Acknowledge/Begin/Comment/Mark Complete/...) to "the
// assignee": with multi-assignee tasks, ANY of the assigned users or any
// internal member of an assigned group counts (FRD 7.2 — one shared task).
export function isTaskAssignee(assignees: TaskAssignee[] | undefined, username: string): boolean {
  if (!assignees || assignees.length === 0 || !username) return false;
  return assignees.some(a =>
    a.type === 'user' ? a.name === username : internalGroupMembers(a.name).includes(username)
  );
}

// Resolves the effective assignees for a task record: prefers the new
// `assignees` array, and falls back to reconstructing a single-entry array
// from the legacy `assignee`/`assigneeType` fields for any task written before
// this change (or by a path that hasn't been migrated yet). Pure/sync — safe
// to call from both client and server code.
export function getTaskAssignees(task: { assignee: string; assigneeType?: 'user' | 'group'; assignees?: TaskAssignee[] }): TaskAssignee[] {
  if (task.assignees && task.assignees.length > 0) return task.assignees;
  if (task.assignee && task.assignee !== 'Unassigned') {
    return [{ type: task.assigneeType === 'group' ? 'group' : 'user', id: task.assignee, name: task.assignee }];
  }
  return [];
}

// Sanitizes a client-submitted assignees payload into a valid TaskAssignee[] —
// each entry must carry a real type ('user'|'group') and a non-empty name.
// Shared between POST /api/tasks and the assign/reassign action on
// PUT /api/tasks/[id] so both accept the same shape the same way.
export function sanitizeAssignees(input: unknown): TaskAssignee[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((a: any) => a && (a.type === 'user' || a.type === 'group') && typeof a.name === 'string' && a.name.trim())
    .map((a: any) => ({ type: a.type as 'user' | 'group', id: String(a.id || a.name), name: String(a.name).trim() }));
}

// Derives the back-compat single-value display fields from an assignees set —
// used wherever a Task is created/updated so `assignee`/`assigneeType` stay a
// reasonable summary for any UI not yet reading `assignees` directly.
export function deriveLegacyAssigneeFields(assignees: TaskAssignee[]): { assignee: string; assigneeType?: 'user' | 'group' } {
  if (assignees.length === 0) return { assignee: 'Unassigned', assigneeType: undefined };
  return {
    assignee: assignees.map(a => a.name).join(', '),
    assigneeType: assignees.length === 1 ? assignees[0].type : undefined,
  };
}
