import { NextResponse } from 'next/server';
import { getDb, saveDb, generateOccurrenceId, generateCaseId, Occurrence } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStart = searchParams.get('dateStart');
    const dateEnd   = searchParams.get('dateEnd');
    const user      = searchParams.get('user');
    const topic     = searchParams.get('topic');
    const caseId    = searchParams.get('caseId');

    // List endpoint: skip the base64 attachment blobs (91% of this payload).
    // This db object must NOT be passed to saveDb() — see GetDbOptions in lib/db.
    const db = await getDb({ includeAttachments: false });
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
    if (topic && topic !== 'All') {
      results = results.filter(o => o.topic === topic);
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

    // NOTE: FRD Section 8 states occurrences are standalone and not linked to Case;
    // auto-linking a Case here is a confirmed, deliberate deviation (see EDIARY_MODULE_UPDATE_PLAN.md §3).
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
      // refNo now stores another entry's e-Diary ID, picked via the link picker in Quick log entry
      ...(body.refNo?.trim() && { refNo: body.refNo.trim() }),
    };

    db.occurrences.push(newOccurrence);
    await saveDb(db);

    return NextResponse.json(newOccurrence, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// NOTE: No PATCH/DELETE endpoint by design. Per FRD §8.2, an occurrence entry is
// immutable once submitted — it cannot be edited or deleted. To correct a mistake,
// log a new entry referencing the original Occurrence ID.
