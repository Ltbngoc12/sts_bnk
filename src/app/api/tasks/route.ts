import { NextResponse } from 'next/server';
import { getDb, saveDb, generateTaskId, generateCaseId, Task } from '@/lib/db';

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
      
      const newTask: Task = {
        id: taskId,
        caseId: targetCaseId,
        title: body.title,
        description: body.description || '',
        assignee: body.assignee || 'Unassigned',
        priority: body.priority || 'Normal',
        dueDate: body.dueDate || '',
        status: 'Created',
        createdBy: body.username || 'Controller',
        createdDate: new Date().toISOString(),
        attachments: []
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
