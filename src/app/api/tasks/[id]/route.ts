import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDb();
    const task = db.tasks.find(t => t.id === id);
    
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const db = await getDb();
    
    const taskIndex = db.tasks.findIndex(t => t.id === id);
    if (taskIndex === -1) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    const task = db.tasks[taskIndex];
    
    // 1. Reassignment handler
    if (body.assignee && body.assignee !== task.assignee) {
      task.assignee = body.assignee;
      task.status = 'Re-Assigned';
    }
    
    // 2. Status updater
    if (body.status) {
      task.status = body.status;
    }
    
    // 3. Update description/title if provided
    if (body.title) task.title = body.title;
    if (body.description) task.description = body.description;
    if (body.priority) task.priority = body.priority;
    if (body.dueDate) task.dueDate = body.dueDate;
    
    db.tasks[taskIndex] = task;
    await saveDb(db);
    
    return NextResponse.json(task);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
