import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb, EventRecord, generateEventId } from '@/lib/db';

// FSD v0.5 §8 Events Master List Module.
// GET  — list + filter (date range, event type) per §8.4(b); also backs the
//        Dashboard "Events Today" metric (§2.4.2) — response shape kept as
//        { events, stats: { today } } so src/app/page.tsx doesn't need changes.
// POST — create (§8.1), from either the standalone create form or an e-Diary
//        "Create or Link Event" action (§9.1.3), in which case sourceEDiaryId is set.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStart = searchParams.get('dateStart');
    const dateEnd = searchParams.get('dateEnd');
    const eventType = searchParams.get('eventType');
    const sourceEDiaryId = searchParams.get('sourceEDiaryId');

    const db = await getDb();
    let events = [...(db.events || [])];

    if (eventType) {
      events = events.filter(e => e.type === eventType);
    }
    if (sourceEDiaryId) {
      events = events.filter(e => e.sourceEDiaryId === sourceEDiaryId);
    }
    if (dateStart) {
      const start = new Date(dateStart).getTime();
      events = events.filter(e => new Date(e.endDateTime).getTime() >= start);
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      events = events.filter(e => new Date(e.startDateTime).getTime() <= end.getTime());
    }

    events.sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime());

    const now = new Date();
    const eventsToday = (db.events || []).filter(e => {
      const start = new Date(e.startDateTime);
      const end = new Date(e.endDateTime);
      return start <= now && now <= end;
    });

    return NextResponse.json({
      events,
      stats: { today: eventsToday.length },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, startDateTime, endDateTime, location, boundaryCoordinates, type, description, sourceEDiaryId, username } = body;

    if (!name || !startDateTime || !endDateTime || !type) {
      return NextResponse.json(
        { error: 'name, startDateTime, endDateTime, and type are required' },
        { status: 400 }
      );
    }

    // §8.2(a)/(b) — location must reference the location hierarchy, not free text.
    // (Full hierarchy-match validation happens client-side against LocationSelector's
    // data, same limitation as Fault/Incident — the hierarchy itself is only available
    // via localStorage on the client, not the server. See EVENTS_MASTER_LIST_MODULE_PLAN.md §6.)
    const locationName = location?.commonName || location?.road || location?.building;
    if (!locationName) {
      return NextResponse.json(
        { error: 'location is required — provide at least a common name, road, or building from the location hierarchy' },
        { status: 400 }
      );
    }

    if (new Date(endDateTime).getTime() < new Date(startDateTime).getTime()) {
      return NextResponse.json({ error: 'endDateTime cannot be before startDateTime' }, { status: 400 });
    }

    const db = await getDb();
    const now = new Date().toISOString();

    const newEvent: EventRecord = {
      id: generateEventId(db),
      name,
      startDateTime,
      endDateTime,
      location: {
        road: location?.road || '',
        building: location?.building || '',
        levelSpace: location?.levelSpace || '',
        nearAt: location?.nearAt || '',
        commonName: location?.commonName || '',
        postalCode: location?.postalCode || '',
        tags: location?.tags || [],
        lat: location?.lat ?? 1.2500,
        lng: location?.lng ?? 103.8300,
      },
      boundaryCoordinates: Array.isArray(boundaryCoordinates) && boundaryCoordinates.length > 0 ? boundaryCoordinates : undefined,
      type,
      description: description || undefined,
      sourceEDiaryId: sourceEDiaryId || undefined,
      createdBy: username || 'system',
      createdAt: now,
    };

    if (!db.events) db.events = [];
    db.events.push(newEvent);

    await saveDb(db);

    return NextResponse.json({ event: newEvent }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
