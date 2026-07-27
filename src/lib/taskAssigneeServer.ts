// Server-side (Mongo-backed) counterpart to the assignee helpers in
// taskHelpers.ts. API routes run server-side and must not trust the client's
// localStorage mirror of Task Distribution Groups (lib/groups.ts's
// getActiveGroups() returns only DEFAULT_GROUPS when called server-side, since
// there's no window/localStorage there) — they read the real, persisted store
// in broadcastStore.ts instead (same collection the /api/admin/distribution-groups
// route reads/writes).
//
// Also fixes a pre-existing gap: the old group-assignee permission check was
// role-based ("any Responder (Ranger) counts as the assignee of a group task")
// rather than actual group-membership-based. This checks real membership.

import { getDistributionGroups } from './broadcastStore';
import type { TaskAssignee } from './db';

export async function isTaskAssigneeServer(assignees: TaskAssignee[] | undefined, username: string): Promise<boolean> {
  if (!assignees || assignees.length === 0 || !username) return false;
  const needsGroups = assignees.some(a => a.type === 'group');
  const groups = needsGroups ? await getDistributionGroups() : [];
  return assignees.some(a => {
    if (a.type === 'user') return a.name === username;
    const grp = groups.find(g => g.id === a.id || g.name === a.name);
    if (!grp) return false;
    return grp.members.some(m => m.type === 'Internal' && m.name === username);
  });
}
