import { NextResponse } from 'next/server';
import { getDb, saveDb } from '@/lib/db';
import { initialDeliveryCounts, rollupDeliveryCounts, encodeIdPath, applyCarryForwardSummary } from '@/lib/broadcast';
import { hasBroadcastPermission } from '@/lib/permissions';
import { getEmailQueue, sendEmailMockBatch } from '@/lib/emailMock';
import { addNotification } from '@/lib/broadcastStore';

// FSD §10.1 / §10.9 — operate on a single Broadcast record by ID.
// Broadcast IDs contain slashes (e.g. SEN/CI/20260722/001-BC001), hence the catch-all.
//
// Turbopack does not allow a static segment (e.g. `delivery`) nested under a
// catch-all — the catch-all must be the terminal path segment. Since broadcast
// IDs can themselves contain slashes, `/api/broadcasts/{id}/delivery` (FSD
// §10.9d-e, see lib/broadcast.ts) is handled here by peeling a trailing
// `delivery` segment off the catch-all rather than as its own nested route.
function splitDeliverySuffix(id: string[]): { broadcastId: string; isDelivery: boolean } {
  const isDelivery = id.length > 1 && id[id.length - 1] === 'delivery';
  const idParts = isDelivery ? id.slice(0, -1) : id;
  return { broadcastId: idParts.join('/'), isDelivery };
}

// FSD §10.9d-e — per-recipient delivery status + rollup counts.
//
// Fixes gap G11: dispatch used to set `deliveryCounts = { sent: n, delivered: 0,
// failed: 0, pending: 0 }` once and never touch it again, even though emailMock.ts
// has a full Queued→Sent→Delivered lifecycle — a broadcast sent 3 days ago would
// show "delivered 0" forever. This route reads the CURRENT state of the mock
// email gateway's in-memory queue for this broadcastId and writes it back onto
// the BroadcastRecord, so opening a broadcast's detail (or its drawer polling
// while freshly dispatched) refreshes real numbers instead of a frozen snapshot.
//
// Known limitation (documented, not silently hidden): emailMock's queue is a
// module-level in-memory array — it resets on server restart/cold start. If this
// route finds NO matching emails for a broadcastId (e.g. the server restarted
// since dispatch), it deliberately falls back to whatever was already persisted
// on the record rather than resetting good data back to "pending" — a real SMTP
// gateway would replace this endpoint's data source, not its contract.
async function getDelivery(broadcastId: string) {
  const db = await getDb();
  const bc = (db.broadcasts || []).find((b) => b.id === broadcastId);
  if (!bc) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });

  if (bc.status !== 'SENT') {
    return NextResponse.json({ deliveryCounts: bc.deliveryCounts, recipientStatus: bc.recipientStatus || [] });
  }

  const emails = getEmailQueue({ broadcastId });
  if (emails.length > 0) {
    const byRecipient = new Map(emails.map((e) => [e.to, e]));
    const recipientStatus = (bc.recipients || []).map((email) => {
      const rec = byRecipient.get(email);
      if (rec) {
        return { email, status: rec.status, at: rec.deliveredAt || rec.sentAt };
      }
      // No live record for this recipient in this process (server restarted
      // since dispatch, or channel wasn't Email) — keep whatever was last known.
      return (bc.recipientStatus || []).find((r) => r.email === email) || { email, status: 'Queued' as const };
    });
    bc.recipientStatus = recipientStatus;
    bc.deliveryCounts = rollupDeliveryCounts(recipientStatus);
    await saveDb(db);
  }

  return NextResponse.json({ deliveryCounts: bc.deliveryCounts, recipientStatus: bc.recipientStatus || [] });
}

// POST { emails: string[] } — resend to specific recipients (the drawer's "Resend"
// action next to a Failed row). Re-uses the same subject/body already on
// the record so a resend can't drift from what everyone else received.
async function postDelivery(broadcastId: string, request: Request) {
  const body = await request.json().catch(() => ({}));
  const emails: string[] = Array.isArray(body.emails) ? body.emails : [];
  if (emails.length === 0) {
    return NextResponse.json({ error: 'emails is required.' }, { status: 400 });
  }

  const db = await getDb();
  const bc = (db.broadcasts || []).find((b) => b.id === broadcastId);
  if (!bc) return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  if (bc.status !== 'SENT') {
    return NextResponse.json({ error: 'Can only resend a broadcast that has already been dispatched.' }, { status: 409 });
  }

  await sendEmailMockBatch({
    recipients: emails,
    subject: bc.subject || `[SDC] ${bc.type} Broadcast — ${bc.id}`,
    body: bc.contentDispatched,
    caseId: bc.caseId,
    broadcastId: bc.id,
  });

  const emailRecords = getEmailQueue({ broadcastId });
  const byRecipient = new Map(emailRecords.map((e) => [e.to, e]));
  const recipientStatus = (bc.recipients || []).map((email) => {
    const rec = byRecipient.get(email);
    return rec
      ? { email, status: rec.status, at: rec.deliveredAt || rec.sentAt }
      : (bc.recipientStatus || []).find((r) => r.email === email) || { email, status: 'Queued' as const };
  });
  bc.recipientStatus = recipientStatus;
  bc.deliveryCounts = rollupDeliveryCounts(recipientStatus);
  bc.deliveryAttempts = (bc.deliveryAttempts || 0) + 1;
  await saveDb(db);

  return NextResponse.json({ deliveryCounts: bc.deliveryCounts, recipientStatus: bc.recipientStatus });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string[] }> }) {
  try {
    const { id } = await params;
    const { broadcastId, isDelivery } = splitDeliverySuffix(id);
    if (isDelivery) return getDelivery(broadcastId);
    const db = await getDb();
    const bc = (db.broadcasts || []).find(b => b.id === broadcastId);
    return bc ? NextResponse.json(bc) : NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST { action: 'dispatch', recipients?, content?, role, user? }
// Generic dispatch for manual, Weather Advisory, End-of-Day and any PENDING
// broadcast not tied to the incidents/[...id] `dispatch-broadcast` action.
//
// 2026-07-26 (Kyle, decision D6): the 'reject' action has been REMOVED, not just
// disabled. Reasoning: a PENDING End-of-Day record whose eodDate has passed reads
// as "not sent that night" on its own (see BroadcastRecord.eodDate) — there's no
// need for a separate REJECTED status, a reason field, or a permission check for
// an action that added no information a Duty Manager couldn't already see. This
// also deletes 3 bugs that lived entirely inside the reject branch: B2 (REJECTED
// records were stamped into dispatchedBy/dispatchedAt, displaying under a
// "Dispatched By" label for something that was explicitly NOT dispatched), B3
// (rejecting a Closure broadcast reset incident.closureBroadcastStatus to
// 'not_required', erasing the fact a human had actually queued and then declined
// it), and B7 (the reject button required broadcast.eod_review, which Controller
// doesn't have, producing a raw 403 alert() for a button their own page showed
// them). `status: 'REJECTED'` remains a valid value on old Mongo records so
// existing history still reads/filters correctly — it just can't be created here
// anymore. Kept as an explicit 410 (not silently falling through to "unknown
// action") so any stale client code calling this still gets a clear, testable
// response instead of a confusing 400/500.
export async function POST(request: Request, { params }: { params: Promise<{ id: string[] }> }) {
  try {
    const { id } = await params;
    const { broadcastId, isDelivery } = splitDeliverySuffix(id);
    if (isDelivery) return postDelivery(broadcastId, request);
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'dispatch';

    if (action === 'reject') {
      return NextResponse.json({
        error: 'Rejecting a broadcast is no longer supported. Leave End-of-Day records PENDING — once their night has passed they are treated as "not sent" automatically. For a Closure broadcast that genuinely should not go out, contact a System Administrator.',
      }, { status: 410 });
    }
    if (action !== 'dispatch') {
      return NextResponse.json({ error: `Unknown action: "${action}"` }, { status: 400 });
    }

    // RBAC (FSD §3 / §13.1) — broadcast.dispatch required. Fixes bug B5: role used
    // to be optional (`if (body.role && ...)`), so a request that simply omitted it
    // skipped the permission check entirely.
    if (!body.role) {
      return NextResponse.json({ error: 'role is required.' }, { status: 400 });
    }
    if (!hasBroadcastPermission(body.role, 'broadcast.dispatch')) {
      return NextResponse.json({ error: 'You do not have permission to dispatch broadcasts.' }, { status: 403 });
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

    const recipients: string[] = Array.isArray(body.recipients) ? body.recipients : bc.recipients;
    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'Cannot dispatch: recipient list is empty.' }, { status: 400 });
    }
    // US-BC-01 — Carry-Forward Summary (End-of-Day Interim only, BR7). Persisted
    // here because, like recipients/content, this screen has no separate
    // draft-save path — everything sits in the client's local state until
    // Approve & Send actually fires.
    const carryForwardSummary: string | undefined =
      bc.type === 'End-of-Day' && typeof body.carryForwardSummary === 'string'
        ? body.carryForwardSummary
        : bc.carryForwardSummary;

    // §10.4d — content edited BEYOND the auto-filled default needs explicit
    // confirmation (2026-07-25: content-diff gate, replaces the old per-field
    // sensitiveFields checklist — see BroadcastTemplate comment in
    // broadcastConfig.ts). Diff BEFORE contentDispatched gets overwritten below.
    // Diffs against contentDefault (the untouched auto-fill snapshot, gap G6) when
    // present, falling back to contentDispatched for records queued before that
    // field existed. US-BC-01: also merged with carryForwardSummary so a Duty
    // Manager who only used that box (never touched the Edit tab) never trips
    // this gate — mirrors the identical merge the client does before computing
    // its own "changed" state (BR5/EC1); if the two sides disagreed here, a
    // summary-only submission would pass the client's check and still bounce off
    // this 409 with no checkbox visible to satisfy it.
    const rawBaseline = bc.contentDefault ?? bc.contentDispatched ?? '';
    const baseline = applyCarryForwardSummary(rawBaseline, carryForwardSummary);
    const contentChanged = typeof body.content === 'string' && body.content.trim() !== baseline.trim();
    if (contentChanged && !body.confirmContentChange) {
      return NextResponse.json({
        error: 'Content has been edited from the auto-filled default — explicit confirmation is required before dispatch.',
        requiresContentConfirmation: true,
      }, { status: 409 });
    }
    bc.recipients = recipients;
    if (typeof body.content === 'string' && body.content.length > 0) bc.contentDispatched = body.content;
    bc.carryForwardSummary = carryForwardSummary;
    bc.status = 'SENT';
    bc.sentAt = now;
    bc.sentBy = actor;
    bc.dispatchedBy = actor;
    bc.dispatchedAt = now;
    bc.deliveryAttempts = (bc.deliveryAttempts || 0) + 1;
    bc.deliveryCounts = initialDeliveryCounts(recipients.length);
    if (contentChanged && body.confirmContentChange) bc.contentEditConfirmed = true;
    if (bc.type === 'Closure' && linkedCase?.incident) {
      (linkedCase.incident as any).closureBroadcastStatus = 'dispatched';
      (linkedCase.incident as any).closureBroadcastId = bc.id;
    }

    // Mock Email gateway — fire the actual send for the Email channel (§10.1a/§10.2).
    // Uses bc.subject (rendered from BroadcastTemplate.subject — fixes G4) with a
    // fallback for legacy records queued before that field existed.
    if (!bc.channels || bc.channels.includes('Email')) {
      sendEmailMockBatch({
        recipients,
        subject: bc.subject || `[SDC] ${bc.type} Broadcast — ${bc.id}`,
        body: bc.contentDispatched,
        caseId: bc.caseId,
        broadcastId: bc.id,
      }).catch(() => {});
    }
    // In-app "Push Notification" channel (§10.2, fixes G2) — see matching comment
    // in incidents/[...id]/route.ts `dispatch-broadcast`. Role-level signal via the
    // receive-only 'Broadcast Recipient' role since there's no email→user-account
    // resolution wired into the notification mailbox yet.
    if (bc.channels?.includes('Push Notification')) {
      addNotification({
        recipientRole: 'Broadcast Recipient',
        type: 'broadcast',
        title: bc.subject || `${bc.type} Broadcast`,
        message: bc.contentDispatched.slice(0, 240),
        link: `/broadcasts/${encodeIdPath(bc.id)}`,
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
        + (bc.contentEditConfirmed ? ' Content edited from default — confirmed.' : ''),
      beforeSnapshot: JSON.stringify({ status: 'PENDING' }),
      afterSnapshot: JSON.stringify({ status: 'SENT', recipients: recipients.length }),
      correlationId: `CORR-${Date.now()}`,
      ipAddress: '127.0.0.1',
      entityId: bc.id,
    });

    await saveDb(db);
    return NextResponse.json(bc);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
