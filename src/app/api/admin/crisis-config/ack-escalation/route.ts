import { NextResponse } from 'next/server';
import { getAckEscalationRule, saveAckEscalationRule } from '@/lib/crisisStore';

// Acknowledgement and Escalation Rules — build plan Epic 1 story 8.
//
// NOTE FOR THE OPS WORKSHOP: every numeric value behind this endpoint is a
// placeholder. Ack window, ladder timings and quorum have not been agreed by Ops
// (build plan §9 dependency, Q3). Do not present the seeded values as confirmed
// business rules.
export async function GET() {
  try {
    return NextResponse.json(await getAckEscalationRule());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Expected an ack/escalation rule object.' }, { status: 400 });
    }

    // 1. Validation for Acknowledgement methods
    if (!body.ackMethodKeyword) {
      return NextResponse.json(
        { error: 'The SMS reply keyword acknowledgement method must be enabled.' },
        { status: 400 }
      );
    }

    // 2. Validation for Ack Window
    const ackWindowMinutes = Number(body.ackWindowMinutes);
    if (!Number.isInteger(ackWindowMinutes) || ackWindowMinutes < 1) {
      return NextResponse.json({ error: 'Acknowledgement window must be an integer greater than or equal to 1 minute.' }, { status: 400 });
    }

    // 3. Validation for Escalation Ladder
    const rawLadder = Array.isArray(body.ladder) ? body.ladder : [];
    const minutesSeen = new Set<number>();
    for (const step of rawLadder) {
      const min = Number(step.afterMinutes);
      if (!Number.isInteger(min) || min < 1) {
        return NextResponse.json({ error: 'Escalation step timing must be an integer greater than or equal to 1 minute.' }, { status: 400 });
      }
      if (minutesSeen.has(min)) {
        return NextResponse.json({ error: `Duplicate escalation step timing at +${min} minutes.` }, { status: 400 });
      }
      minutesSeen.add(min);
    }

    const ladder = [...rawLadder].sort((a: any, b: any) => (a.afterMinutes || 0) - (b.afterMinutes || 0));

    await saveAckEscalationRule({
      ...body,
      ackWindowMinutes,
      ladder,
      id: 'singleton',
    });

    return NextResponse.json({ ok: true, rule: await getAckEscalationRule() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
