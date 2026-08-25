import { NextResponse } from 'next/server';
import { getCrises, getCrisisRecipients, evaluateCrisisTrigger } from '@/lib/crisisRuntime';
import { getDb } from '@/lib/db';
import { computeCounters } from '@/lib/crisis';

// Crisis Queue (story 12) + manual trigger.
//
// GET /api/crises          → all crises with live counters, newest first
// POST /api/crises {action:'trigger', incidentId} → re-evaluate the trigger for an
//   incident. Exists because the automatic hook fires on incident level change; a
//   DM demonstrating the module needs a way to raise a crisis from an incident that
//   was already at a triggering level before this module existed.
export async function GET() {
  try {
    const crises = await getCrises();
    // Counters are attached here rather than computed per-row in the UI so the queue
    // and the dashboard cannot drift apart in how they count an acknowledgement.
    const withCounts = await Promise.all(
      crises.map(async (c) => {
        const recipients = c.status === 'PENDING_REVIEW' ? [] : await getCrisisRecipients(c.id);
        return { ...c, counters: computeCounters(recipients) };
      })
    );
    withCounts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json(withCounts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body.action !== 'trigger') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    // Incidents are nested under their Case (DbSchema has no top-level incidents
    // array) — resolve by either Incident ID or Case ID, the same way the incident
    // route does.
    const db = await getDb();
    const match = db.cases.find((c: any) => c.incident && (c.incident.id === body.incidentId || c.id === body.incidentId));
    const incident = match?.incident;
    if (!incident) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });

    const crisis = await evaluateCrisisTrigger(incident, body.actor || 'Manual trigger');
    if (!crisis) {
      return NextResponse.json({
        ok: false,
        reason:
          'No crisis created. Either the incident is not at a triggering crisis level (Level 1–2 per FSD §5.2), or an open crisis already exists for it.',
      });
    }
    return NextResponse.json({ ok: true, crisis });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
