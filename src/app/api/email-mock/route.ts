import { NextResponse } from 'next/server';
import { sendEmailMock, getEmailQueue } from '@/lib/emailMock';

// Mock Email gateway route — FSD §10.1a/§10.2, Phase 5 stretch item.
// Mirrors /api/sms-mock's shape (used by Crisis Recall §11). Broadcast dispatch
// calls src/lib/emailMock.ts directly in-process; this route exists for direct
// testing/inspection of the mock queue, same as sms-mock.

/** POST /api/email-mock — send a single mock email */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, subject, body: message, caseId, broadcastId } = body;

    if (!to || !subject || !message) {
      return NextResponse.json({ error: 'to, subject, and body are required' }, { status: 400 });
    }

    const record = await sendEmailMock({ to, subject, body: message, caseId, broadcastId });

    return NextResponse.json({
      success: true,
      emailId: record.emailId,
      status: record.status,
      sentAt: record.sentAt,
      message: `Email dispatched to ${to}.`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/email-mock — retrieve the mock email queue (optionally filter) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId') || undefined;
    const broadcastId = searchParams.get('broadcastId') || undefined;
    const emailId = searchParams.get('emailId') || undefined;

    if (emailId) {
      const [record] = getEmailQueue({ emailId });
      if (!record) return NextResponse.json({ error: `${emailId} not found` }, { status: 404 });
      return NextResponse.json(record);
    }

    return NextResponse.json(getEmailQueue({ caseId, broadcastId }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
