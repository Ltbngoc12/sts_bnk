import { DbSchema } from './db';

/**
 * Attempts automatic closure of a Case after any sub-record status change.
 * Case closure is ALWAYS attributed to 'System', not the acting user.
 *
 * Auto-close conditions:
 * - Incident (if linked):  status must be 'Closed'
 * - Tasks (if any):        all must be 'Closed'
 * - CMMS tickets:          receipt of a ticket ID = satisfied — never blocks closure
 * - e-Diary entries:       never block closure
 *
 * Terminal status assigned:
 * - e-Diary-only case (no incident, no tasks, no CMMS) → 'No Action Required'
 * - All other resolved cases                           → 'Closed'
 *
 * Caller must call saveDb(db) after this function returns.
 */
export function tryAutoCloseCase(db: DbSchema, caseId: string): void {
  const caseIndex = db.cases.findIndex(c => c.id === caseId);
  if (caseIndex === -1) return;

  const caseObj = db.cases[caseIndex];
  if (caseObj.status === 'Closed') return;

  const incident = caseObj.incident;
  const tasks = db.tasks.filter(t => t.caseId === caseId);
  const cmmsTickets = caseObj.cmmsTickets ?? [];

  const incidentDone = !incident || incident.status === 'Closed';
  const tasksDone = tasks.length === 0 || tasks.every(t => t.status === 'Closed');

  if (!incidentDone || !tasksDone) return;

  const isEdiaryOnly = !incident && tasks.length === 0 && cmmsTickets.length === 0;

  db.cases[caseIndex] = {
    ...caseObj,
    status: isEdiaryOnly ? 'No Action Required' : 'Closed',
    closedAt: new Date().toISOString(),
    closedBy: 'System',
  };
}
