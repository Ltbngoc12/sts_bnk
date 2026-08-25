import { NextResponse } from 'next/server';
import { getBroadcastMatrix, saveBroadcastMatrix } from '@/lib/broadcastStore';

// FSD §10.6 / §13.3 — server-backed Broadcast Matrix (routing rules).
export async function GET() {
  try {
    return NextResponse.json(await getBroadcastMatrix());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rules = Array.isArray(body) ? body : body.rules;
    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: 'Expected an array of matrix rules.' }, { status: 400 });
    }
    await saveBroadcastMatrix(rules);
    return NextResponse.json({ ok: true, count: rules.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
