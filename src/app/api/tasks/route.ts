import { NextResponse } from 'next/server';
import { getDb, saveDb, generateTaskId, generateCaseId, Task, TaskChecklistItem, TaskAudit } from '@/lib/db';

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
    const db = await getDb();
    return NextResponse.json(db.tasks);
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
      const hasAssignee = !!body.assignee && body.assignee !== 'Unassigned';

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
        title: body.title,
        description: body.description || '',
        assignee: hasAssignee ? body.assignee : 'Unassigned',
        assigneeType: body.assigneeType === 'group' ? 'group' : 'user',
        priority: body.priority === 'High' ? 'High' : 'Normal',
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
            ? [makeAudit(creator, 'Assigned', `Assigned to ${body.assignee} (${body.assigneeType === 'group' ? 'group' : 'user'}). Status set to Assigned.`)]
            : []),
        ],
      };

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
