import { NextResponse } from 'next/server';
import { getBroadcastPromptRules, saveBroadcastPromptRules } from '@/lib/broadcastStore';

// Broadcast Action Prompt Rules — admin config redesign (2026-07-25). Maps a
// fixed trigger event (see BroadcastPromptTrigger in broadcastConfig.ts) to a
// recipient role. Consumed by incidents/[...id] `close` action and
// cron/eod-broadcast via getActivePromptRule() in broadcastStore.ts.
export async function GET() {
  try {
    return NextResponse.json(await getBroadcastPromptRules());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rules = Array.isArray(body) ? body : body.rules;
    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: 'Expected an array of prompt rules.' }, { status: 400 });
    }
    await saveBroadcastPromptRules(rules);
    return NextResponse.json({ ok: true, count: rules.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
