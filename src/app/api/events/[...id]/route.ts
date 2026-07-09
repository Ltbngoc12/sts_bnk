import { NextRequest, NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';

// FSD v0.5 §8.1(a) — "Authorised users shall be able to create, edit, and manage
// event records." Role gating (who counts as "authorised") is enforced client-side
// per the placeholder matrix in QnA_FSD_v0.5_EventsMasterList.md item 1, pending
// Shin Feng's confirmation of the blank §3.3.4 table.

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const eventId = id.join('/');
    const db = await getDb();
    const event = (db.events || []).find(e => e.id === eventId);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(event);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const eventId = id.join('/');
    const body = await request.json();
    const db = await getDb();

    const idx = (db.events || []).findIndex(e => e.id === eventId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = db.events![idx];

    if (body.name !== undefined) event.name = body.name;
    if (body.startDateTime !== undefined) event.startDateTime = body.startDateTime;
    if (body.endDateTime !== undefined) event.endDateTime = body.endDateTime;
    if (body.type !== undefined) event.type = body.type;
    if (body.description !== undefined) event.description = body.description;
    // FRD §9.1.3 — "Link Existing Event" from an e-Diary entry
    if (body.sourceEDiaryId !== undefined) event.sourceEDiaryId = body.sourceEDiaryId || undefined;
    if (body.location !== undefined) {
      event.location = {
        road: body.location?.road || '',
        building: body.location?.building || '',
        levelSpace: body.location?.levelSpace || '',
        nearAt: body.location?.nearAt || '',
        commonName: body.location?.commonName || '',
        postalCode: body.location?.postalCode || '',
        tags: body.location?.tags || [],
        lat: body.location?.lat ?? event.location.lat,
        lng: body.location?.lng ?? event.location.lng,
      };
    }
    if (body.boundaryCoordinates !== undefined) {
      event.boundaryCoordinates = Array.isArray(body.boundaryCoordinates) && body.boundaryCoordinates.length > 0
        ? body.boundaryCoordinates
        : undefined;
    }

    if (new Date(event.endDateTime).getTime() < new Date(event.startDateTime).getTime()) {
      return NextResponse.json({ error: 'endDateTime cannot be before startDateTime' }, { status: 400 });
    }

    db.events![idx] = event;
    await saveDb(db);

    return NextResponse.json(event);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const eventId = id.join('/');
    const db = await getDb();

    const idx = (db.events || []).findIndex(e => e.id === eventId);
    if (idx === -1) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const [removed] = db.events!.splice(idx, 1);
    await saveDb(db);

    return NextResponse.json({ deleted: removed.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
