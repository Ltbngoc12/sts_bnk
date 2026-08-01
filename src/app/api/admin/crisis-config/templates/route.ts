import { NextResponse } from 'next/server';
import { getRecallTemplates, saveRecallTemplates } from '@/lib/crisisStore';

// Crisis Message Templates — build plan Epic 1 story 4.
// Separate collection from broadcastTemplates: a recall SMS is a different artefact
// from a closure broadcast (see D3 note in src/lib/crisisConfig.ts).
export async function GET() {
  try {
    return NextResponse.json(await getRecallTemplates());
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
    for (const t of templates) {
      const isStandDown = t.sequence === 'stand_down' || /stand[- ]?down/i.test(t.name || '');
      if (isStandDown && t.body && t.body.includes('{{ack_link}}')) {
        return NextResponse.json(
          { error: `Stand-down template "${t.name}" cannot contain {{ack_link}} because stand-down messages do not require acknowledgement.` },
          { status: 400 }
        );
      }
    }
    await saveRecallTemplates(templates);
    return NextResponse.json({ ok: true, count: templates.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
