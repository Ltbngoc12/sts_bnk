import { NextResponse } from 'next/server';
import { getDb, saveDb, generateOccurrenceId, generateCaseId, Occurrence } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStart = searchParams.get('dateStart');
    const dateEnd   = searchParams.get('dateEnd');
    const user      = searchParams.get('user');
    const caseId    = searchParams.get('caseId');

    const db = await getDb();
    let results = [...db.occurrences];

    if (caseId) {
      results = results.filter(o => o.caseId === caseId);
    }
    if (dateStart) {
      const start = new Date(dateStart).getTime();
      results = results.filter(o => new Date(o.dateTime).getTime() >= start);
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      results = results.filter(o => new Date(o.dateTime).getTime() <= end.getTime());
    }
    if (user && user !== 'All') {
      results = results.filter(o => o.user === user);
    }

    results.sort((a, b) => new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime());
    return NextResponse.json(results);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();

    if (!body.content) {
      return NextResponse.json({ error: 'e-Diary entry content is required.' }, { status: 400 });
    }

    // Auto-create a Case if no caseId provided (FRD §8.2)
    let caseId: string = body.caseId || '';
    if (!caseId) {
      const newCaseId = generateCaseId(db);
      db.cases.push({
        id: newCaseId,
        title: `e-Diary: ${body.topic || 'General Notice'}`,
        status: 'No Action Required',
        createdAt: new Date().toISOString(),
        createdBy: body.username || 'System',
        closedAt: null,
        closedBy: null,
        cmmsTickets: [],
        incident: null,
      });
      caseId = newCaseId;
    }

    const occurrenceId = generateOccurrenceId(db);

    const newOccurrence: Occurrence = {
      id: occurrenceId,
      caseId,
      user: body.username || 'Controller',
      dateTime: body.dateTime || new Date().toISOString(),
      topic: body.topic || 'General Notice',
      content: body.content,
      attachments: [],
      amendments: [],
    };

    db.occurrences.push(newOccurrence);
    await saveDb(db);

    return NextResponse.json(newOccurrence, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — amend an existing e-Diary entry (FRD §8.2: mutable, amendments tracked)
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, newContent, username } = body;

    if (!id || !newContent?.trim()) {
      return NextResponse.json({ error: 'id and newContent are required.' }, { status: 400 });
    }

    const db = await getDb();
    const idx = db.occurrences.findIndex(o => o.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    const entry = db.occurrences[idx];

    // Record the amendment with the original text
    const amendment = {
      timestamp: new Date().toISOString(),
      amendedBy: username || 'System',
      originalText: entry.content,
    };

    db.occurrences[idx] = {
      ...entry,
      content: newContent.trim(),
      amendments: [...(entry.amendments || []), amendment],
    };

    await saveDb(db);
    return NextResponse.json(db.occurrences[idx]);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
