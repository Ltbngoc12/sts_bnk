import { NextResponse } from 'next/server';
import { getBroadcastChannels, saveBroadcastChannels } from '@/lib/broadcastStore';

// FSD §10.2 / §13.3 — server-backed Delivery Channel config.
export async function GET() {
  try {
    return NextResponse.json(await getBroadcastChannels());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const channels = Array.isArray(body) ? body : body.channels;
    if (!Array.isArray(channels)) {
      return NextResponse.json({ error: 'Expected an array of channels.' }, { status: 400 });
    }
    await saveBroadcastChannels(channels);
    return NextResponse.json({ ok: true, count: channels.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
