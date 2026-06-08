import { NextResponse } from 'next/server';

// In-memory queue for prototype — tracks outbound SMS dispatches
type SmsRecord = {
  smsId: string;
  recipient: string;       // name or phone number
  phoneNumber: string;
  message: string;
  status: 'Queued' | 'Sent' | 'Delivered' | 'Failed';
  sentAt: string;
  deliveredAt?: string;
  caseId?: string;
};

const smsQueue: SmsRecord[] = [];
let smsCounter = 1;

/** POST /api/sms-mock — Dispatch an SMS recall or alert */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recipient, phoneNumber, message, caseId } = body;

    if (!recipient || !phoneNumber || !message) {
      return NextResponse.json(
        { error: 'recipient, phoneNumber, and message are required' },
        { status: 400 }
      );
    }

    const smsId = `SMS-${String(smsCounter++).padStart(4, '0')}`;
    const sentAt = new Date().toISOString();

    const record: SmsRecord = {
      smsId,
      recipient,
      phoneNumber,
      message,
      status: 'Queued',
      sentAt,
      caseId,
    };

    // Simulate 400ms transmission latency, then mark as Sent
    await new Promise(resolve => setTimeout(resolve, 400));
    record.status = 'Sent';

    // Simulate delivery acknowledgement after a further 1s
    setTimeout(() => {
      record.status = 'Delivered';
      record.deliveredAt = new Date().toISOString();
    }, 1000);

    smsQueue.push(record);

    return NextResponse.json({
      success: true,
      smsId,
      status: 'Sent',
      sentAt,
      message: `SMS dispatched to ${recipient} (${phoneNumber}).`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** GET /api/sms-mock — Retrieve SMS queue (optionally filter by caseId) */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get('caseId');
    const smsId = searchParams.get('smsId');

    if (smsId) {
      const record = smsQueue.find(s => s.smsId === smsId);
      if (!record) return NextResponse.json({ error: `${smsId} not found` }, { status: 404 });
      return NextResponse.json(record);
    }

    if (caseId) {
      return NextResponse.json(smsQueue.filter(s => s.caseId === caseId));
    }

    return NextResponse.json(smsQueue);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
