import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { initialDeliveryCounts } from '@/lib/broadcast';
import { hasBroadcastPermission } from '@/lib/permissions';
import { sendEmailMockBatch } from '@/lib/emailMock';

// FSD §10.1 / §10.9 — operate on a single Broadcast record by ID.
// Broadcast IDs contain slashes (e.g. SEN/CI/20260722/001-BC001), hence the catch-all.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string[] }> }) {
  try {
    const { id } = await params;
    const broadcastId = id.join('/');
    const db = await getDb();
    const bc = (db.broadcasts || []).find(b => b.id === broadcastId);
    return bc ? NextResponse.json(bc) : NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST { action: 'dispatch' | 'reject', recipients?, content?, role?, user? }
// Generic dispatch/reject for manual, End-of-Day and any PENDING broadcast. Closure
// broadcasts tied to an incident also update that incident's closureBroadcastStatus.
export async function POST(request: Request, { params }: { params: Promise<{ id: string[] }> }) {
  try {
    const { id } = await params;
    const broadcastId = id.join('/');
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'dispatch';

    if (body.role && !hasBroadcastPermission(body.role, action === 'reject' ? 'broadcast.eod_review' : 'broadcast.dispatch')) {
      return NextResponse.json({ error: `You do not have permission to ${action} broadcasts.` }, { status: 403 });
    }

    const db = await getDb();
    const bc = (db.broadcasts || []).find(b => b.id === broadcastId);
    if (!bc) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    if (bc.status !== 'PENDING') {
      return NextResponse.json({ error: `Broadcast ${bc.id} is already ${bc.status}.` }, { status: 409 });
    }

    const now = new Date().toISOString();
    const actor = body.user || 'system';

    // Locate the linked incident (if any) to keep closure status in sync.
    const linkedCase = db.cases.find(c => c.incident && c.incident.id === bc.incidentId);

    if (action === 'reject') {
      bc.status = 'REJECTED';
      bc.dispatchedBy = actor;
      bc.dispatchedAt = now;
      if (bc.type === 'Closure' && linkedCase?.incident) {
        (linkedCase.incident as any).closureBroadcastStatus = 'not_required';
      }
      await saveDb(db);
      return NextResponse.json(bc);
    }

    // dispatch
    const recipients: string[] = Array.isArray(body.recipients) ? body.recipients : bc.recipients;
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'Cannot dispatch: recipient list is empty.' }, { status: 400 });
    }
    // §10.4d — including fields beyond the default (sensitive) needs explicit confirmation.
    if (body.includeSensitive && !body.confirmSensitive) {
      return NextResponse.json({
        error: 'Including sensitive fields requires explicit Duty Manager confirmation.',
        requiresSensitiveConfirmation: true,
      }, { status: 409 });
    }
    bc.recipients = recipients;
    if (typeof body.content === 'string' && body.content.length > 0) bc.contentDispatched = body.content;
    bc.status = 'SENT';
    bc.sentAt = now;
    bc.sentBy = actor;
    bc.dispatchedBy = actor;
    bc.dispatchedAt = now;
    bc.deliveryAttempts = (bc.deliveryAttempts || 0) + 1;
    bc.deliveryCounts = initialDeliveryCounts(recipients.length);
    if (body.includeSensitive && body.confirmSensitive) bc.sensitiveFieldsIncluded = true;
    if (bc.type === 'Closure' && linkedCase?.incident) {
      (linkedCase.incident as any).closureBroadcastStatus = 'dispatched';
      (linkedCase.incident as any).closureBroadcastId = bc.id;
    }

    // Mock Email gateway — fire the actual send for the Email channel (§10.1a/§10.2).
    if (!bc.channels || bc.channels.includes('Email')) {
      sendEmailMockBatch({
        recipients,
        subject: `[SDC] ${bc.type} Broadcast — ${bc.id}`,
        body: bc.contentDispatched,
        caseId: bc.caseId,
        broadcastId: bc.id,
      }).catch(() => {});
    }

    if (!db.auditLogs) db.auditLogs = [];
    db.auditLogs.push({
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      user: actor,
      module: 'Broadcast',
      action: 'Dispatch Broadcast',
      details: `Dispatched ${bc.type} broadcast ${bc.id} to ${recipients.length} recipient(s).`
        + (bc.sensitiveFieldsIncluded ? ' Includes sensitive fields — confirmed.' : ''),
      beforeSnapshot: JSON.stringify({ status: 'PENDING' }),
      afterSnapshot: JSON.stringify({ status: 'SENT', recipients: recipients.length }),
      correlationId: `CORR-${Date.now()}`,
      ipAddress: '127.0.0.1',
    });

    await saveDb(db);
    return NextResponse.json(bc);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
