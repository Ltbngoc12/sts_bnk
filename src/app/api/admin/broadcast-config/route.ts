import { NextResponse } from 'next/server';
import { getBroadcastConfig, saveBroadcastConfig } from '@/lib/broadcastStore';
import { DEFAULT_BROADCAST_CONFIG } from '@/lib/broadcastConfig';

// FSD §13.3 — broadcast-level config: End-of-Day timing + closure-required categories.
export async function GET() {
  try {
    return NextResponse.json(await getBroadcastConfig());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const cfg = {
      ...DEFAULT_BROADCAST_CONFIG,
      ...body,
      id: 'singleton' as const,
    };
    await saveBroadcastConfig(cfg);
    return NextResponse.json({ ok: true, config: cfg });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
