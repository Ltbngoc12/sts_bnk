import { NextResponse } from 'next/server';
import { getDb, saveDb, generateOccurrenceId, Occurrence } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    // Sort occurrences by date descending
    const sortedOccurrences = [...db.occurrences].sort(
      (a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime()
    );
    return NextResponse.json(sortedOccurrences);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = getDb();
    
    const occurrenceId = generateOccurrenceId(db);
    
    const newOccurrence: Occurrence = {
      id: occurrenceId,
      caseId: body.caseId || '',
      user: body.username || 'Controller',
      dateTime: body.dateTime || new Date().toISOString(),
      topic: body.topic || 'General Notice',
      content: body.content || ''
    };
    
    db.occurrences.push(newOccurrence);
    saveDb(db);
    
    return NextResponse.json(newOccurrence, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
