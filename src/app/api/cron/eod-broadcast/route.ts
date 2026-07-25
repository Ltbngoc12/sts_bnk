import { NextResponse } from 'next/server';
import { getDb, saveDb, BroadcastRecord } from '@/lib/db';
import { isEodEligible, resolveEodBroadcast } from '@/lib/broadcast';
import { getDistributionGroups, getBroadcastTemplates, getBroadcastMatrix, addNotification, getActivePromptRule } from '@/lib/broadcastStore';

// FSD §5.11.2 / §10.7 — End-of-Day Interim Broadcast queue builder.
// At EOD cutover, surface open incidents into the Duty Manager's review queue by
// creating a PENDING "End-of-Day" broadcast per eligible incident, pre-filled with
// recipients/content/channels resolved from the Broadcast Matrix (§10.3c), same as
// the Closure Broadcast path. Idempotent: never creates a second PENDING
// End-of-Day broadcast for the same incident.
//
// Mirrors /api/cron/generate — GET and POST both work, triggerable by a scheduler
// or manually (also exposed via the "Run End-of-Day Check Now" button on the
// Duty Manager's /broadcasts/eod-review page, since there's no real external
// scheduler wired up yet). Exact timing/eligibility criteria are TBC in FSD
// (§15.3); the eligibility predicate lives in src/lib/broadcast.ts (isEodEligible).
async function run() {
  const db = await getDb();
  if (!db.broadcasts) db.broadcasts = [];

  const [groups, templates, matrix] = await Promise.all([
    getDistributionGroups(),
    getBroadcastTemplates(),
    getBroadcastMatrix(),
  ]);

  let queued = 0;
  const created: string[] = [];

  for (const c of db.cases) {
    const incident = c.incident;
    if (!incident || !isEodEligible(incident)) continue;

    const alreadyQueued = db.broadcasts.some(
      (b) => b.incidentId === incident.id && b.type === 'End-of-Day' && b.status === 'PENDING'
    );
    if (alreadyQueued) continue;

    const resolved = resolveEodBroadcast({ incident, caseId: c.id, groups, templates, matrix });
    const seq = db.broadcasts.filter((b) => b.caseId === c.id).length + 1;
    const id = `${c.id}-BC${String(seq).padStart(3, '0')}`;
    const record: BroadcastRecord = {
      id,
      caseId: c.id,
      incidentId: incident.id,
      type: 'End-of-Day',
      recipients: resolved.recipients,
      templateUsed: resolved.templateUsed,
      contentDispatched: resolved.content,
      channels: resolved.channels,
      sentAt: null as any,
      sentBy: 'system',
      status: 'PENDING',
      deliveryAttempts: 0,
    };
    db.broadcasts.push(record);
    created.push(id);
    queued++;
  }

  if (queued > 0) {
    await saveDb(db);
    // Server-authoritative — this route has no client page open when a real
    // scheduler fires it, so the notification is written directly here rather
    // than relying on a client-side addNotification() call. Recipient role(s) are
    // config-driven (Broadcast Config → Action Prompt Rules, 2026-07-25) instead
    // of the hardcoded 'Duty Manager' this route used before — if the rule is
    // Inactive/missing, nothing is sent (no hardcoded fallback). recipientRoles is
    // multi-select (2026-07-25, Kyle) — one notification is fired per configured role.
    const eodPromptRule = await getActivePromptRule('eod_broadcast_queued');
    if (eodPromptRule) {
      for (const recipientRole of eodPromptRule.recipientRoles) {
        await addNotification({
          recipientRole,
          type: 'broadcast',
          title: '🌆 End-of-Day Broadcasts Queued',
          message: `${queued} incident(s) still open at End-of-Day cutover — review and dispatch interim broadcasts.`,
          link: '/broadcasts/eod-review',
        });
      }
    }
  }
  return NextResponse.json({ ranAt: new Date().toISOString(), queued, created });
}

export async function GET() {
  try {
    return await run();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await run();
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
