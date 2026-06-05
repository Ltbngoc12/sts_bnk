import { NextResponse } from 'next/server';
import { getDb, saveDb, generateTaskId, Task } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    return NextResponse.json(db.tasks);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    
    const taskId = generateTaskId(db);
    const caseId = body.caseId;
    
    // Ensure case exists
    const caseExists = db.cases.some(c => c.id === caseId);
    if (!caseExists) {
      return NextResponse.json({ error: 'Linked Case not found' }, { status: 400 });
    }
    
    const newTask: Task = {
      id: taskId,
      caseId: caseId,
      title: body.title || 'Routine Task',
      description: body.description || '',
      assignee: body.assignee || 'Unassigned',
      priority: body.priority || 'Medium',
      dueDate: body.dueDate || '',
      status: 'Created',
      createdBy: body.username || 'Controller',
      createdDate: new Date().toISOString(),
      attachments: []
    };
    
    db.tasks.push(newTask);
    saveDb(db);
    
    return NextResponse.json(newTask, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
