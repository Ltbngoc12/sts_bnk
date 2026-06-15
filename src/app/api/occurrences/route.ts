import { NextResponse } from 'next/server';
import { getDb, saveDb, generateOccurrenceId, generateCaseId, Occurrence } from '@/lib/db';

export async function GET() {
  try {
    const db = await getDb();
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
    const db = await getDb();
    
    const occurrenceId = generateOccurrenceId(db);
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
          title: body.topic ? `Case for e-Diary: ${body.topic}` : 'Auto-Created Case for e-Diary',
          status: 'No Action Required', // e-Diary starts with No Action Required per FRD
          createdAt: new Date().toISOString(),
          closedAt: null,
          closedBy: null,
          createdBy: body.username || 'Controller',
          cmmsTickets: [],
          incident: null
        };
        db.cases.push(autoCreatedCase);
      }

      if (!body.content) {
        throw new Error('e-Diary entry narrative/content is required.');
      }

      const newOccurrence: Occurrence = {
        id: occurrenceId,
        caseId: targetCaseId,
        user: body.username || 'Controller',
        dateTime: body.dateTime || new Date().toISOString(),
        topic: body.topic || 'General Notice',
        content: body.content
      };
      
      db.occurrences.push(newOccurrence);
      await saveDb(db); // Commit transaction
      
      return NextResponse.json(newOccurrence, { status: 201 });
    } catch (validationError: any) {
      // Rollback: do not save db.
      return NextResponse.json({ error: validationError.message }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
