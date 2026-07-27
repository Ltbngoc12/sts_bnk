import { NextResponse } from 'next/server';
import { getDb, saveDb, BroadcastRecord } from '@/lib/db';
import { isEodEligible, resolveEodBroadcast, nextBroadcastId, crisisLevelKey, todayDateStr } from '@/lib/broadcast';
import {
  getDistributionGroups,
  getBroadcastTemplates,
  getBroadcastMatrix,
  getBroadcastConfig,
  addNotification,
  getActivePromptRule,
  recordEodRun,
} from '@/lib/broadcastStore';

// FSD §5.11.2 / §10.7 — End-of-Day Interim Broadcast queue builder.
// At EOD cutover, surface open incidents into the Duty Manager's review queue by
// creating a PENDING "End-of-Day" broadcast per eligible incident, pre-filled with
// recipients/content/channels resolved from the Broadcast Matrix (§10.3c), same as
// the Closure Broadcast path.
//
// Mirrors /api/cron/generate — GET and POST both work. This deployment has no
// external scheduler (plain `next dev`/`next start`, no vercel.json in this repo —
// confirmed 2026-07-26), so this is triggered either manually ("Run Check Now" on
// the End-of-Day Interim tab) or by that tab's lazy-trigger on load once cutover
// has passed for today and lastEodRunPerDate shows it hasn't run yet (see
// recordEodRun in broadcastStore.ts). Eligibility is now config-driven
// (isEodEligible + BroadcastConfig.eodExcludedCategories/eodMinCrisisLevel/
// eodExcludedStatuses — fixes gap G9, previously every non-Closed incident queued
// regardless of category or crisis level).
//
// Idempotent per (incidentId, eodDate) regardless of status (fixes bug B1 — the
// old guard only checked status==='PENDING', so re-running the check after a
// broadcast had already been dispatched OR left un-dispatched created a SECOND
// record for the same incident/night). eodDate is also what lets a PENDING record
// whose night has passed read as "not sent" without a separate REJECTED status
// (Kyle, 2026-07-26, decision D6 — see BroadcastRecord.eodDate comment in db.ts).
async function run() {
  const db = await getDb();
  if (!db.broadcasts) db.broadcasts = [];

  const [groups, templates, matrix, bcConfig] = await Promise.all([
    getDistributionGroups(),
    getBroadcastTemplates(),
    getBroadcastMatrix(),
    getBroadcastConfig(),
  ]);

  const eodDate = todayDateStr();
  let queued = 0;
  let warned = 0;
  const created: string[] = [];

  for (const c of db.cases) {
    const incident = c.incident;
    if (!incident || !isEodEligible(incident, bcConfig)) continue;

    const alreadyQueued = db.broadcasts.some(
      (b) => b.incidentId === incident.id && b.type === 'End-of-Day' && b.eodDate === eodDate
    );
    if (alreadyQueued) continue;

    const resolved = resolveEodBroadcast({ incident, caseId: c.id, groups, templates, matrix });
    const id = nextBroadcastId(db.broadcasts, c.id);
    const nowIso = new Date().toISOString();
    const record: BroadcastRecord = {
      id,
      caseId: c.id,
      incidentId: incident.id,
      type: 'End-of-Day',
      recipients: resolved.recipients,
      templateUsed: resolved.templateUsed,
      templateId: resolved.templateId,
      matrixRuleId: resolved.matrixRuleId,
      recipientGroups: resolved.recipientGroups,
      subject: resolved.subject,
      contentDispatched: resolved.content,
      contentDefault: resolved.content,
      channels: resolved.channels,
      crisisLevel: crisisLevelKey(incident.crisisLevel),
      incidentType: incident.type,
      incidentSubType: incident.subType,
      incidentTitle: incident.title,
      createdAt: nowIso,
      queuedBy: 'system',
      eodDate,
      resolutionWarning: resolved.resolutionWarning,
      sentAt: null as any,
      sentBy: 'system',
      status: 'PENDING',
      deliveryAttempts: 0,
    };
    db.broadcasts.push(record);
    created.push(id);
    queued++;
    if (resolved.resolutionWarning) warned++;

    // Audit trail — entityId lets the broadcast detail page's Audit Log section
    // filter the shared /api/admin/audit log to this record only.
    if (!db.auditLogs) db.auditLogs = [];
    db.auditLogs.push({
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      user: 'system',
      module: 'Broadcast',
      action: 'Queue EOD Broadcast',
      details: `Queued End-of-Day broadcast ${id} for ${resolved.recipients.length} recipient(s) — ${eodDate}.`,
      correlationId: `CORR-${Date.now()}`,
      ipAddress: '127.0.0.1',
      entityId: id,
    });
  }

  await saveDb(db);
  await recordEodRun(eodDate);

  if (queued > 0) {
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
          link: `/broadcasts?tab=eod&date=${eodDate}`,
        });
      }
    }
  }
  if (warned > 0) {
    await addNotification({
      recipientRole: 'System Administrator',
      type: 'broadcast',
      title: '⚠ End-of-Day broadcast(s) queued with 0 recipients',
      message: `${warned} of tonight's ${queued} queued End-of-Day broadcast(s) matched no Broadcast Matrix rule or resolved to an empty group.`,
      link: `/broadcasts?tab=eod&date=${eodDate}`,
    });
  }
  return NextResponse.json({ ranAt: new Date().toISOString(), eodDate, queued, warned, created });
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
