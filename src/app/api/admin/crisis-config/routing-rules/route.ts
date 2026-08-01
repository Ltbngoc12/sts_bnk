import { NextResponse } from 'next/server';
import {
  getRecallRoutingRules,
  saveRecallRoutingRules,
  getRecallGroups,
  getRecallTemplates,
  resolveRouting,
} from '@/lib/crisisStore';

// Recall Routing Rules — build plan Epic 1 story 5.
export async function GET() {
  try {
    return NextResponse.json(await getRecallRoutingRules());
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ── "Test rule" function (build plan §6.1, Recall Routing Rules screen) ──
    // POST { action: 'test', input: { crisisLevel, incidentType, zone, timeOfDay } }
    // Runs the SAME resolveRouting() that Epic 2 story 10 will use to build the
    // crisis snapshot. Deliberately shared: what an admin tests here must be
    // provably identical to what fires in a real crisis, otherwise the test button
    // is worse than useless — it manufactures false confidence.
    if (!Array.isArray(body) && body.action === 'test') {
      const [rules, groups, templates] = await Promise.all([
        getRecallRoutingRules(),
        getRecallGroups(),
        getRecallTemplates(),
      ]);
      const input = body.input || {};
      if (!input.crisisLevel || !input.incidentType) {
        return NextResponse.json(
          { error: 'Test requires at least crisisLevel and incidentType.' },
          { status: 400 }
        );
      }
      const result = resolveRouting(input, rules, groups, templates);
      const template = templates.find((t) => t.id === result.templateId);
      return NextResponse.json({
        ...result,
        matchedRules: result.matchedRules.map((r) => ({ id: r.id, name: r.name, priority: r.priority })),
        groups: result.groups.map((g) => ({ id: g.id, name: g.name, status: g.status })),
        template: template ? { id: template.id, name: template.name, channel: template.channel } : null,
      });
    }

    const rules = Array.isArray(body) ? body : body.rules;
    if (!Array.isArray(rules)) {
      return NextResponse.json({ error: 'Expected an array of routing rules.' }, { status: 400 });
    }
    await saveRecallRoutingRules(rules);
    return NextResponse.json({ ok: true, count: rules.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
