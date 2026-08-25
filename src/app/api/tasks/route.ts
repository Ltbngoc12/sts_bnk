import { NextResponse } from 'next/server';
import { getDb, saveDb, generateTaskId, generateCaseId, generateSeriesId, Task, TaskAssignee, TaskChecklistItem, TaskAudit, RecurrenceSeries, normalizeTaskPriority } from '@/lib/db';
import { validateRecurrence } from '@/lib/recurrence';
import { advanceSeries } from '@/lib/seriesEngine';
import { deriveLegacyAssigneeFields, sanitizeAssignees } from '@/lib/taskHelpers';

function makeAudit(operator: string, action: string, details: string): TaskAudit {
  return {
    id: `aud-${Math.random().toString(36).substring(2, 9)}`,
    timestamp: new Date().toISOString(),
    operator,
    action,
    details,
  };
}

export async function GET() {
  try {
    // List endpoint: skip the base64 attachment blobs (91% of this payload).
    // This db object must NOT be passed to saveDb() — see GetDbOptions in lib/db.
    const db = await getDb({ includeAttachments: false });
    // Hide soft-deleted occurrences (e.g. removed by a series edit) from boards/lists.
    return NextResponse.json(db.tasks.filter(t => !t.deleted));
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();
    
    const taskId = generateTaskId(db);
    const caseId = body.caseId;
    
    let targetCaseId = caseId;
    let autoCreatedCase = null;

    // Transaction-like Wrapper with Rollback Logic
    try {
      const caseExists = db.cases.some(c => c.id === targetCaseId);
      if (!caseExists || !targetCaseId) {
        targetCaseId = generateCaseId(db);
        autoCreatedCase = {
          id: targetCaseId,
          title: body.title ? `Case for Task: ${body.title}` : 'Auto-Created Case for Task',
          status: 'Active', // Active because a child task is in progress
          createdAt: new Date().toISOString(),
          closedAt: null,
          closedBy: null,
          createdBy: body.username || 'Controller',
          cmmsTickets: [],
          incident: null
        };
        db.cases.push(autoCreatedCase);
      } else {
        // If the Case exists and is not Closed, transition it to Active
        const existingCase = db.cases.find(c => c.id === targetCaseId);
        if (existingCase && existingCase.status !== 'Closed') {
          existingCase.status = 'Active';
        }
      }

      if (!body.title) {
        throw new Error('Task title is required.');
      }

      const creator = body.username || 'Controller';
      // `assignees` (array) is the current shape — falls back to the legacy
      // singular assignee/assigneeType if an older caller still sends those
      // (e.g. anything not yet migrated off the old single-select shape).
      const assignees: TaskAssignee[] = Array.isArray(body.assignees)
        ? sanitizeAssignees(body.assignees)
        : (body.assignee && body.assignee !== 'Unassigned'
          ? [{ type: body.assigneeType === 'group' ? 'group' as const : 'user' as const, id: body.assignee, name: body.assignee }]
          : []);
      const hasAssignee = assignees.length > 0;
      const legacy = deriveLegacyAssigneeFields(assignees);

      // Sanitize checklist items coming from the client
      const checklist: TaskChecklistItem[] = Array.isArray(body.checklist)
        ? body.checklist
            .filter((c: any) => c && typeof c.text === 'string' && c.text.trim())
            .map((c: any) => ({
              id: c.id || `chk-${Math.random().toString(36).substring(2, 9)}`,
              text: String(c.text).trim(),
              isCompleted: false,
            }))
        : [];

      const newTask: Task = {
        id: taskId,
        caseId: targetCaseId,
        linkedIncidentId: body.linkedIncidentId || undefined,
        sourceEDiaryId: body.sourceEDiaryId || undefined,
        title: body.title,
        description: body.description || '',
        assignee: legacy.assignee,
        assigneeType: legacy.assigneeType,
        assignees,
        priority: normalizeTaskPriority(body.priority),
        dueDate: body.dueDate || '',
        // If an assignee is provided at creation, the task starts in Assigned (FRD 7.2)
        status: hasAssignee ? 'Assigned' : 'Created',
        completed: false,
        checklist,
        comments: [],
        recurrenceSchedule: body.recurrenceSchedule || undefined,
        recurrence: body.recurrence || undefined,
        isRecurringInstance: false,
        createdBy: creator,
        createdDate: new Date().toISOString(),
        attachments: Array.isArray(body.attachments) ? body.attachments : [],
        audits: [
          makeAudit(creator, 'Created', `Task created by ${creator}.`),
          ...(hasAssignee
            ? [makeAudit(creator, 'Assigned', `Assigned to ${assignees.map(a => `${a.name} (${a.type})`).join(', ')}. Status set to Assigned.`)]
            : []),
        ],
      };

      // ── Recurrence: create the series (source of truth) and generate the
      //    first lead-time window of real occurrence tasks (Model A). ──
      if (body.recurrence) {
        const cfgErr = validateRecurrence(body.recurrence);
        if (cfgErr) throw new Error(cfgErr);

        const series: RecurrenceSeries = {
          id: generateSeriesId(db),
          caseId: targetCaseId,
          config: body.recurrence,
          status: 'Active',
          templateTaskId: newTask.id,
          createdBy: creator,
          createdDate: new Date().toISOString(),
          audits: [makeAudit(creator, 'Series created', `Recurrence series created by ${creator}.`)],
          taskTemplate: {
            title: newTask.title,
            description: newTask.description,
            priority: normalizeTaskPriority(newTask.priority),
            assignee: newTask.assignee,
            assigneeType: newTask.assigneeType,
            assignees: newTask.assignees,
            checklist,
          },
        };

        // This task holds the template card; it is not itself an occurrence.
        newTask.seriesId = series.id;
        newTask.isSeriesTemplate = true;

        if (!db.recurrenceSeries) db.recurrenceSeries = [];
        db.recurrenceSeries.push(series);
        db.tasks.push(newTask);

        // Generate occurrences from max(startDate, today) → today + leadTime.
        const today = new Date().toISOString().slice(0, 10);
        const fromISO = series.config.startDate > today ? series.config.startDate : today;
        advanceSeries(db, series, fromISO);

        await saveDb(db); // Commit transaction
        return NextResponse.json(newTask, { status: 201 });
      }

      db.tasks.push(newTask);
      await saveDb(db); // Commit transaction

      return NextResponse.json(newTask, { status: 201 });
    } catch (validationError: any) {
      // Rollback: do not save db. Any local array modifications in `db` are in-memory
      // and will be discarded/reloaded on the next getDb call since we didn't write to file.
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
