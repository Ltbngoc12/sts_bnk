import { NextResponse } from 'next/server';
import { getBroadcastTemplates, saveBroadcastTemplates } from '@/lib/broadcastStore';

// FSD §10.4 / §13.3 — server-backed Broadcast Templates.
export async function GET() {
  try {
    return NextResponse.json(await getBroadcastTemplates());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const templates = Array.isArray(body) ? body : body.templates;
    if (!Array.isArray(templates)) {
      return NextResponse.json({ error: 'Expected an array of templates.' }, { status: 400 });
    }
    await saveBroadcastTemplates(templates);
    return NextResponse.json({ ok: true, count: templates.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
