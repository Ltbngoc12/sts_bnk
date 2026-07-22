import { NextResponse } from 'next/server';
import { getDb, saveDb, BroadcastRecord } from '@/lib/db';

// FSD §10.9 — Broadcast Record list / detail, and §10.1(d) manual broadcast creation.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const incidentId = searchParams.get('incidentId');
    const caseId = searchParams.get('caseId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const db = await getDb();
    let broadcasts = db.broadcasts || [];

    if (id) {
      const one = broadcasts.find((b) => b.id === id);
      return one
        ? NextResponse.json(one)
        : NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }
    if (incidentId) broadcasts = broadcasts.filter((b) => b.incidentId === incidentId);
    if (caseId) broadcasts = broadcasts.filter((b) => b.caseId === caseId);
    if (type) broadcasts = broadcasts.filter((b) => b.type === type);
    if (status) broadcasts = broadcasts.filter((b) => b.status === status);

    const sorted = [...broadcasts].sort((a, b) => {
      const ta = a.sentAt || a.dispatchedAt || '';
      const tb = b.sentAt || b.dispatchedAt || '';
      return tb.localeCompare(ta);
    });
    return NextResponse.json(sorted);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Manually initiate a broadcast (FSD §10.1d — authorised user, confirmed need).
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.caseId) {
      return NextResponse.json({ error: 'caseId is required.' }, { status: 400 });
    }
    const db = await getDb();
    if (!db.broadcasts) db.broadcasts = [];

    const seq = db.broadcasts.filter((b) => b.caseId === body.caseId).length + 1;
    const id = `${body.caseId}-BC${String(seq).padStart(3, '0')}`;

    const record: BroadcastRecord = {
      id,
      caseId: body.caseId,
      incidentId: body.incidentId || '',
      type: body.type || 'Manual',
      recipients: Array.isArray(body.recipients) ? body.recipients : [],
      templateUsed: body.templateUsed || 'Manual Broadcast',
      contentDispatched: body.content || body.contentDispatched || '',
      sentAt: null as any,
      sentBy: body.user || 'system',
      status: 'PENDING',
      deliveryAttempts: 0,
    };
    db.broadcasts.push(record);
    await saveDb(db);
    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
