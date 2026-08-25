import { NextResponse } from 'next/server';
import { getDb, saveDb, BroadcastRecord } from '@/lib/db';
import {
  nextBroadcastId,
  nextStandaloneBroadcastId,
  resolveWeatherBroadcast,
  crisisLevelKey,
  encodeIdPath,
} from '@/lib/broadcast';
import { getDistributionGroups, getBroadcastTemplates, getBroadcastMatrix, addNotification } from '@/lib/broadcastStore';

// FSD §10.9 — Broadcast Record list / detail, and §10.1(d) manual broadcast creation.
//
// Rewritten 2026-07-26 (Phase 1 prerequisite) to match the server-side filter +
// pagination + stats contract CaseLogTab.tsx already uses for /api/cases (page,
// limit, stats in the response) instead of fetching every record and filtering
// client-side — the old version had no pagination at all and would not hold up
// past a few hundred records. Also fixes gap G14: the previous fixed sort
// (`(a.sentAt || a.dispatchedAt || '').localeCompare(...)`) put every PENDING
// record (which has neither field) at the BOTTOM of the list, under every already-
// sent record — exactly backwards from what a reviewer needs.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // List endpoint: skip the base64 attachment blobs (91% of this payload).
    // This db object must NOT be passed to saveDb() — see GetDbOptions in lib/db.
    const db = await getDb({ includeAttachments: false });
    let broadcasts = db.broadcasts || [];

    if (id) {
      const one = broadcasts.find((b) => b.id === id);
      return one
        ? NextResponse.json(one)
        : NextResponse.json({ error: 'Broadcast not found' }, { status: 404 });
    }

    // ── Direct passthrough filters (unchanged contract for existing callers) ────
    const incidentId = searchParams.get('incidentId');
    const caseId = searchParams.get('caseId');
    if (incidentId) broadcasts = broadcasts.filter((b) => b.incidentId === incidentId);
    if (caseId) broadcasts = broadcasts.filter((b) => b.caseId === caseId);

    // ── New filters (Phase 1 filter card, §6.7 of the plan) ─────────────────────
    const typeParam = searchParams.get('type'); // comma-separated, matches BroadcastRecord.type
    const statusParam = searchParams.get('status'); // comma-separated
    const levelParam = searchParams.get('level'); // comma-separated "Level 1,Level 2"
    const eodDate = searchParams.get('eodDate'); // exact match — used by the EOD day navigator
    const group = searchParams.get('group');
    const dispatchedBy = searchParams.get('dispatchedBy');
    const channel = searchParams.get('channel');
    const deliveryResult = searchParams.get('deliveryResult'); // 'success' | 'error' | 'none'
    const contentEdited = searchParams.get('contentEdited'); // 'true' | 'false'
    const incidentType = searchParams.get('incidentType');
    const search = searchParams.get('search')?.trim().toLowerCase();
    // dateBasis is legacy/optional now — the Broadcast Records filter card (redesigned
    // 2026-07-27 per Kyle) dropped the "Filter date by" picker entirely: From/To now
    // matches a record that was either CREATED or SENT/dispatched within the window,
    // instead of forcing the user to pick one basis up front. A caller that still
    // passes dateBasis explicitly keeps the old single-basis behavior.
    const dateBasis = searchParams.get('dateBasis') as 'createdAt' | 'sentAt' | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (typeParam) {
      const types = typeParam.split(',').filter(Boolean);
      broadcasts = broadcasts.filter((b) => types.includes(b.type));
    }
    if (statusParam) {
      const statuses = statusParam.split(',').filter(Boolean);
      broadcasts = broadcasts.filter((b) => statuses.includes(b.status));
    }
    if (levelParam) {
      const levels = levelParam.split(',').filter(Boolean);
      broadcasts = broadcasts.filter((b) => b.crisisLevel && levels.includes(b.crisisLevel));
    }
    if (eodDate) broadcasts = broadcasts.filter((b) => b.eodDate === eodDate);
    if (group) broadcasts = broadcasts.filter((b) => (b.recipientGroups || []).includes(group));
    if (dispatchedBy) {
      const needle = dispatchedBy.toLowerCase();
      broadcasts = broadcasts.filter((b) => (b.dispatchedBy || b.sentBy || '').toLowerCase().includes(needle));
    }
    if (channel) broadcasts = broadcasts.filter((b) => (b.channels || []).includes(channel));
    if (deliveryResult === 'none') broadcasts = broadcasts.filter((b) => b.status !== 'SENT');
    if (deliveryResult === 'error') broadcasts = broadcasts.filter((b) => b.status === 'SENT' && (b.deliveryCounts?.failed || 0) > 0);
    if (deliveryResult === 'success') broadcasts = broadcasts.filter((b) => b.status === 'SENT' && (b.deliveryCounts?.failed || 0) === 0);
    if (contentEdited === 'true') broadcasts = broadcasts.filter((b) => !!b.contentEditConfirmed);
    if (contentEdited === 'false') broadcasts = broadcasts.filter((b) => !b.contentEditConfirmed);
    if (incidentType) broadcasts = broadcasts.filter((b) => b.incidentType === incidentType);
    if (startDate || endDate) {
      const inRange = (v?: string | null) => {
        if (!v) return false;
        if (startDate && v < startDate) return false;
        if (endDate && v > endDate) return false;
        return true;
      };
      broadcasts = broadcasts.filter((b) => {
        if (dateBasis === 'createdAt') return inRange(b.createdAt);
        if (dateBasis === 'sentAt') return inRange(b.sentAt) || inRange(b.dispatchedAt);
        // No basis specified — match a record CREATED or SENT/dispatched within the window.
        return inRange(b.createdAt) || inRange(b.sentAt) || inRange(b.dispatchedAt);
      });
    }
    if (search) {
      broadcasts = broadcasts.filter((b) => {
        const haystack = [
          b.id, b.caseId, b.incidentId, b.incidentTitle, b.templateUsed,
          ...(b.recipients || []),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(search);
      });
    }

    // ── Stats (drives the 3 status sub-tab count pills — computed on the
    // post-filter-but-pre-status-filter set would be more "live", but matching
    // CaseLogTab's convention: stats reflect the CURRENT tab's filters minus its
    // own status/tab selector, computed here from the full incidentId/caseId/date/
    // search-scoped set before the statusParam filter narrows further down. Simplest
    // correct approach: compute from `db.broadcasts` scoped only by caseId/incidentId
    // (the "record family" a page like /incidents/[id] cares about), since the
    // module-wide table always shows all 3 counts regardless of its own filters. ──
    const statsScope = (db.broadcasts || []).filter((b) =>
      (!incidentId || b.incidentId === incidentId) && (!caseId || b.caseId === caseId)
    );
    const stats = {
      pending: statsScope.filter((b) => b.status === 'PENDING').length,
      sent: statsScope.filter((b) => b.status === 'SENT').length,
      total: statsScope.length,
    };

    // ── Sort: PENDING first (oldest-waiting first, so the longest-neglected item
    // is the most visible), then everything else most-recent-first. Fixes G14 —
    // the old fixed sort buried every PENDING record (no sentAt/dispatchedAt) at
    // the bottom of the list, under all already-sent records. ──
    const sorted = [...broadcasts].sort((a, b) => {
      const aPending = a.status === 'PENDING' ? 0 : 1;
      const bPending = b.status === 'PENDING' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      if (aPending === 0) {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      const ta = a.sentAt || a.dispatchedAt || a.createdAt || '';
      const tb = b.sentAt || b.dispatchedAt || b.createdAt || '';
      return tb.localeCompare(ta);
    });

    // ── Pagination ───────────────────────────────────────────────────────────
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.max(1, parseInt(searchParams.get('limit') || '25', 10) || 25);
    const totalItems = sorted.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const startIdx = (page - 1) * limit;
    const pageItems = sorted.slice(startIdx, startIdx + limit);

    // Back-compat: callers that don't pass `page`/`limit` at all (e.g. any script
    // still expecting a bare array) get the OLD shape — a bare array — so this
    // rewrite doesn't silently break anything not yet migrated to the new contract.
    if (!searchParams.has('page') && !searchParams.has('limit') && !searchParams.has('paged')) {
      return NextResponse.json(sorted);
    }

    return NextResponse.json({
      data: pageItems,
      pagination: { page, limit, totalPages, totalItems },
      stats,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Manually initiate a broadcast (FSD §10.1d — authorised user, confirmed need).
// 2026-07-26 (Phase 3, fixes bug B6): caseId is no longer required — a Weather
// Advisory is an island-wide notice with no single Case to attach to. When caseId
// is omitted, the record gets a caseless ID (SEN/BC/YYYYMMDD/### — see
// nextStandaloneBroadcastId) instead of being rejected outright.
// Also fixes gap G1: when type is 'Weather Advisory', this now actually resolves
// recipients/template/content from the Broadcast Matrix + Templates (via
// resolveWeatherBroadcast) instead of creating an empty shell that ignores admin
// config entirely — the caller can still override recipients/content manually.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const db = await getDb();
    if (!db.broadcasts) db.broadcasts = [];

    const nowIso = new Date().toISOString();
    const isWeather = body.type === 'Weather Advisory';
    const id = body.caseId
      ? nextBroadcastId(db.broadcasts, body.caseId)
      : nextStandaloneBroadcastId(db.broadcasts);

    let recipients: string[] = Array.isArray(body.recipients) ? body.recipients : [];
    let templateUsed = body.templateUsed || 'Manual Broadcast';
    let templateId: string | undefined;
    let matrixRuleId: string | undefined;
    let recipientGroups: string[] | undefined;
    let subject: string | undefined = body.subject;
    let content = body.content || body.contentDispatched || '';
    let channels: string[] | undefined = Array.isArray(body.channels) ? body.channels : undefined;
    let resolutionWarning: string | undefined;

    if (isWeather && recipients.length === 0) {
      // Auto-fill from config unless the caller already supplied recipients/content
      // manually (an Duty Officer overriding the default for this specific advisory).
      const [groups, templates, matrix] = await Promise.all([
        getDistributionGroups(),
        getBroadcastTemplates(),
        getBroadcastMatrix(),
      ]);
      const resolved = resolveWeatherBroadcast({
        vars: { location: body.location, summary: body.summary || body.content, time: nowIso },
        groups,
        templates,
        matrix,
      });
      recipients = resolved.recipients;
      templateUsed = resolved.templateUsed;
      templateId = resolved.templateId;
      matrixRuleId = resolved.matrixRuleId;
      recipientGroups = resolved.recipientGroups;
      subject = subject || resolved.subject;
      content = content || resolved.content;
      channels = channels || resolved.channels;
      resolutionWarning = resolved.resolutionWarning;
    }

    const record: BroadcastRecord = {
      id,
      caseId: body.caseId || '',
      incidentId: body.incidentId || '',
      type: body.type || 'Manual',
      recipients,
      templateUsed,
      templateId,
      matrixRuleId,
      recipientGroups,
      subject,
      contentDispatched: content,
      contentDefault: content,
      channels,
      crisisLevel: body.crisisLevel ? crisisLevelKey(parseInt(body.crisisLevel, 10)) : undefined,
      incidentType: body.incidentType,
      incidentTitle: body.incidentTitle,
      createdAt: nowIso,
      queuedBy: body.user || 'system',
      resolutionWarning,
      sentAt: null as any,
      sentBy: body.user || 'system',
      status: 'PENDING',
      deliveryAttempts: 0,
    };
    db.broadcasts.push(record);

    // Audit trail — entityId lets the broadcast detail page's Audit Log section
    // (added 2026-07-27) filter the shared /api/admin/audit log down to just this
    // record's history, same pattern as the Broadcast Template detail page.
    if (!db.auditLogs) db.auditLogs = [];
    db.auditLogs.push({
      id: `AUD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: nowIso,
      user: record.queuedBy || 'system',
      module: 'Broadcast',
      action: 'Queue Broadcast',
      details: `Queued ${record.type} broadcast ${id} for ${recipients.length} recipient(s).`,
      correlationId: `CORR-${Date.now()}`,
      ipAddress: '127.0.0.1',
      entityId: id,
    });

    await saveDb(db);

    if (resolutionWarning) {
      await addNotification({
        recipientRole: 'System Administrator',
        type: 'broadcast',
        title: '⚠ Broadcast queued with 0 recipients',
        message: `${id}: ${resolutionWarning}`,
        link: `/broadcasts/${encodeIdPath(id)}`,
      });
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
