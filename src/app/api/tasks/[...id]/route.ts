import { NextResponse } from 'next/server';
import { getDb, saveDb, Task, TaskAudit, TaskChecklistItem, TaskComment, TASK_PRIORITIES } from '@/lib/db';
import { tryAutoCloseCase } from '@/lib/autoclose';
import { getTaskAssignees, deriveLegacyAssigneeFields, sanitizeAssignees } from '@/lib/taskHelpers';
import { isTaskAssigneeServer } from '@/lib/taskAssigneeServer';

const CONTROLLER_PLUS = [
  'Controller',
  'Duty Officer',
  'Duty Manager',
  'System Administrator',
  'Current Ops Administrator',
];

function isControllerPlus(role?: string): boolean {
  return !!role && CONTROLLER_PLUS.includes(role);
}

function makeAudit(operator: string, action: string, details: string): TaskAudit {
  return {
    id: `aud-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    operator,
    action,
    details,
  };
}

function pushAudit(task: Task, operator: string, action: string, details: string) {
  if (!task.audits) task.audits = [];
  task.audits.push(makeAudit(operator, action, details));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const taskId = id.join('/');
    const db = await getDb();
    const task = db.tasks.find(t => t.id === taskId);
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    return NextResponse.json(task);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const taskId = id.join('/');
    const body = await request.json();
    const db = await getDb();

    const taskIndex = db.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const task = db.tasks[taskIndex];
    const action: string = body.action || '';
    const actor: string = body.actor || body.username || 'Unknown';
    const role: string = body.role || '';

    const canControl = isControllerPlus(role);
    // Real membership check (Mongo-backed), not a role heuristic — any of the
    // task's assignees, including any internal member of an assigned group,
    // counts (FRD 7.2 — one shared task, multiple possible assignees).
    const isAssignee = await isTaskAssigneeServer(getTaskAssignees(task), actor);

    const deny = (msg: string) =>
      NextResponse.json({ error: msg }, { status: 403 });
    const invalid = (msg: string) =>
      NextResponse.json({ error: msg }, { status: 400 });

    switch (action) {
      // ─── Controller+ : assign / reassign ──────────────────────────────
      case 'assign':
      case 'reassign': {
        if (!canControl) return deny('Only a Controller or higher may assign tasks.');
        if (task.status === 'Closed') return invalid('Cannot reassign a closed task. Reopen it first.');
        // `assignees` (array) is the current shape — falls back to the legacy
        // singular assignee/assigneeType if an older caller still sends those.
        const nextAssignees = Array.isArray(body.assignees)
          ? sanitizeAssignees(body.assignees)
          : (body.assignee
            ? [{ type: (body.assigneeType === 'group' ? 'group' : 'user') as 'user' | 'group', id: body.assignee, name: body.assignee }]
            : []);
        if (nextAssignees.length === 0) return invalid('At least one assignee is required.');
        const prevAssignees = getTaskAssignees(task);
        const prevNames = prevAssignees.map(a => a.name).join(', ');
        const legacy = deriveLegacyAssigneeFields(nextAssignees);
        task.assignees = nextAssignees;
        task.assignee = legacy.assignee;
        task.assigneeType = legacy.assigneeType;
        // FRD 7.2: reassignment returns status to Assigned
        task.status = 'Assigned';
        task.completed = false;
        task.acknowledgedAt = undefined;
        task.startedAt = undefined;
        task.completedAt = undefined;
        task.completedBy = undefined;
        pushAudit(
          task,
          actor,
          action === 'assign' ? 'Assigned' : 'Reassigned',
          `${action === 'assign' ? 'Assigned' : 'Reassigned'} to ${nextAssignees.map(a => `${a.name} (${a.type})`).join(', ')}${prevNames && prevNames !== 'Unassigned' ? ` from ${prevNames}` : ''} by ${actor}. Status set to Assigned.`
        );
        break;
      }

      // ─── Assignee : acknowledge ───────────────────────────────────────
      case 'acknowledge': {
        if (!isAssignee) return deny('Only the assignee may acknowledge this task.');
        // 'Returned' is functionally equivalent to 'Assigned' — re-acknowledge allowed.
        if (task.status !== 'Assigned' && task.status !== 'Returned') return invalid('Task can only be acknowledged from the Assigned or Returned state.');
        task.status = 'Acknowledged';
        task.acknowledgedAt = new Date().toISOString();
        pushAudit(task, actor, 'Acknowledged', `${actor} acknowledged receipt of the task.`);
        break;
      }

      // ─── Assignee : begin task ────────────────────────────────────────
      case 'begin': {
        if (!isAssignee) return deny('Only the assignee may begin this task.');
        if (task.status !== 'Acknowledged') return invalid('Task can only be started from the Acknowledged state.');
        task.status = 'In Progress';
        task.startedAt = new Date().toISOString();
        pushAudit(task, actor, 'Started', `${actor} started the task (arrived on-site / commenced work).`);
        break;
      }

      // ─── Assignee : mark complete → Pending Closure (Fig 7-1) ─────────
      // Completing does NOT close the task. It moves to Pending Closure and
      // awaits a Controller review (Accept → Closed, Reject → back to work).
      case 'mark-complete': {
        if (!isAssignee) return deny('Only the assignee may complete this task.');
        if (task.status !== 'In Progress') return invalid('Task can only be completed from the In Progress state.');
        const items = task.checklist || [];
        if (items.length > 0 && !items.every(i => i.isCompleted)) {
          return invalid('All checklist items must be ticked before marking the task complete.');
        }
        task.status = 'Pending Closure';
        task.completed = true;
        task.completedAt = new Date().toISOString();
        task.completedBy = actor;
        pushAudit(task, actor, 'Completed', `${actor} marked the task complete. Status set to Pending Closure — awaiting Controller review.`);
        break;
      }

      // ─── Controller+ : accept completion → Closed (Fig 7-1 "Accept") ──
      case 'accept-completion': {
        if (!canControl) return deny('Only a Controller or higher may review a completion.');
        if (task.status !== 'Pending Closure') return invalid('Only a task pending closure can be accepted.');
        task.status = 'Closed';
        task.completed = true;
        task.closedAt = new Date().toISOString();
        task.closedBy = actor;
        const note = (body.reviewNote || '').trim();
        if (note) task.reviewNote = note;
        pushAudit(
          task,
          actor,
          'Completion Accepted',
          `${actor} accepted the completion${note ? ` — note: ${note}` : ''}. Status set to Closed.`
        );
        break;
      }

      // ─── Controller+ : reject completion → Returned (Fig 7-1 "Reject") ──
      // Returns the task to the Assignee. 'Returned' behaves like 'Assigned':
      // the assignee re-acknowledges and works it again. Reason mandatory.
      case 'reject-completion': {
        if (!canControl) return deny('Only a Controller or higher may review a completion.');
        if (task.status !== 'Pending Closure') return invalid('Only a task pending closure can be rejected.');
        const note = (body.reviewNote || '').trim();
        if (!note) return invalid('A reason is required when returning the task to the assignee.');
        task.status = 'Returned';
        task.completed = false;
        task.completedAt = undefined;
        task.completedBy = undefined;
        task.acknowledgedAt = undefined;
        task.startedAt = undefined;
        task.reviewNote = note;
        pushAudit(
          task,
          actor,
          'Returned to Assignee',
          `${actor} rejected the completion and returned the task to the assignee — reason: ${note}. Status set to Returned.`
        );
        break;
      }

      // ─── Assignee : flag cannot complete → Pending Further Action ──────
      case 'flag-cannot-complete': {
        if (!isAssignee) return deny('Only the assignee may flag this task.');
        if (task.status !== 'In Progress') return invalid('Only an in-progress task can be flagged.');
        task.status = 'Pending Further Action';
        const reason = (body.reason || '').trim();
        pushAudit(
          task,
          actor,
          'Cannot Complete',
          `${actor} flagged the task as cannot-complete${reason ? `: ${reason}` : ''}. Status set to Pending Further Action.`
        );
        break;
      }

      // ─── Controller+ : close / drop task ──────────────────────────────
      case 'close': {
        if (!canControl) return deny('Only a Controller or higher may close a task.');
        if (task.status === 'Closed') return invalid('Task is already closed.');
        // FRD 7.3: close reason mandatory if closing before Assignee completion
        const reason = (body.closeReason || '').trim();
        if (!task.completed && !reason) {
          return invalid('A Close Reason is required when closing a task that has not been completed.');
        }
        task.status = 'Closed';
        task.closedAt = new Date().toISOString();
        task.closedBy = actor;
        if (reason) task.closeReason = reason;
        // Recurrence cancel scope (W12): 'future' stops the series generating further occurrences
        let closeScopeNote = '';
        if ((task.recurrence || task.seriesId) && body.scope === 'future') {
          task.recurrenceCancelled = true;
          closeScopeNote = ' Recurrence series cancelled — no further occurrences will be generated.';
        }
        pushAudit(
          task,
          actor,
          'Closed',
          `${actor} closed the task${reason ? ` — reason: ${reason}` : ' (completed)'}.${closeScopeNote}`
        );
        break;
      }

      // ─── Controller+ : reopen ─────────────────────────────────────────
      case 'reopen': {
        if (!canControl) return deny('Only a Controller or higher may reopen a task.');
        if (task.status !== 'Closed') return invalid('Only a closed task can be reopened.');
        task.status = 'Created';
        task.completed = false;
        task.closedAt = undefined;
        task.closedBy = undefined;
        task.closeReason = undefined;
        task.acknowledgedAt = undefined;
        task.startedAt = undefined;
        task.completedAt = undefined;
        task.completedBy = undefined;
        pushAudit(task, actor, 'Reopened', `${actor} reopened the task. Status reset to Created.`);
        break;
      }

      // ─── Assignee/Controller : update checklist ───────────────────────
      case 'update-checklist': {
        if (!isAssignee && !canControl) return deny('Not permitted to update the checklist.');
        if (!Array.isArray(body.checklist)) return invalid('checklist array required.');
        const cleaned: TaskChecklistItem[] = body.checklist
          .filter((c: any) => c && typeof c.text === 'string' && c.text.trim())
          .map((c: any) => ({
            id: c.id || `chk-${Math.random().toString(36).substring(2, 9)}`,
            text: String(c.text).trim(),
            isCompleted: !!c.isCompleted,
          }));
        task.checklist = cleaned;
        pushAudit(task, actor, 'Checklist Updated', `${actor} updated the checklist.`);
        break;
      }

      // ─── Assignee/Controller : add comment / log activity ─────────────
      case 'add-comment': {
        if (!isAssignee && !canControl) return deny('Not permitted to comment on this task.');
        const text = (body.text || '').trim();
        if (!text) return invalid('Comment text is required.');
        if (!task.comments) task.comments = [];
        const comment: TaskComment = {
          id: `cmt-${Math.random().toString(36).substring(2, 9)}`,
          user: actor,
          timestamp: new Date().toISOString(),
          text,
          images: Array.isArray(body.images) ? body.images : undefined,
        };
        task.comments.push(comment);
        pushAudit(task, actor, 'Comment', `${actor} logged an activity / comment.`);
        break;
      }

      // ─── Controller+ : edit task fields ───────────────────────────────
      case 'edit-fields': {
        if (!canControl) return deny('Only a Controller or higher may edit task details.');
        if (task.status === 'Closed') return invalid('Cannot edit a closed task.');
        if (typeof body.title === 'string' && body.title.trim()) task.title = body.title.trim();
        if (typeof body.description === 'string') task.description = body.description;
        if ((TASK_PRIORITIES as readonly string[]).includes(body.priority)) task.priority = body.priority;
        if (typeof body.dueDate === 'string') task.dueDate = body.dueDate;
        // FRD 7.1.2: checklist may be (re)defined by Controller during editing
        if (Array.isArray(body.checklist)) {
          task.checklist = body.checklist
            .filter((c: any) => c && typeof c.text === 'string' && c.text.trim())
            .map((c: any) => ({
              id: c.id || `chk-${Math.random().toString(36).substring(2, 9)}`,
              text: String(c.text).trim(),
              isCompleted: !!c.isCompleted,
            }));
        }
        // Recurrence edit scope (W11): 'thisOnly' detaches this occurrence; 'future' updates the series template
        let scopeNote = '';
        if (task.recurrence || task.seriesId) {
          if (body.scope === 'thisOnly') {
            task.detachedFromSeries = true;
            scopeNote = ' (this occurrence only — detached from series)';
          } else if (body.scope === 'future') {
            scopeNote = ' (this and all following occurrences)';
          }
        }
        pushAudit(task, actor, 'Edited', `${actor} updated task details${scopeNote}.`);
        break;
      }

      default:
        return invalid('Unknown or missing action.');
    }

    db.tasks[taskIndex] = task;

    // Attempt automated Case closure when a task closes (FRD 6 / autoclose)
    if (task.status === 'Closed' && task.caseId) {
      tryAutoCloseCase(db, task.caseId);
    }

    await saveDb(db);
    return NextResponse.json(task);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
