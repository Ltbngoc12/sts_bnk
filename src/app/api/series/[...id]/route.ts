import { NextResponse } from 'next/server';
import { getDb, saveDb, Task, TaskAudit, RecurrenceSeries } from '@/lib/db';
import { validateRecurrence, planReconcile, recurrenceSummary, todayStr, addDaysISO } from '@/lib/recurrence';
import { generateOccurrencesForSeries } from '@/lib/seriesEngine';

const CONTROLLER_PLUS = [
  'Controller',
  'Duty Officer',
  'Duty Manager',
  'System Administrator',
  'Current Ops Administrator',
];
const isControllerPlus = (role?: string) => !!role && CONTROLLER_PLUS.includes(role);

function makeAudit(operator: string, action: string, details: string): TaskAudit {
  return { id: `aud-${Math.random().toString(36).substring(2, 9)}`, timestamp: new Date().toISOString(), operator, action, details };
}

// Occurrences of a series, newest-date first, excluding soft-deleted + the template.
function occurrencesOf(db: Awaited<ReturnType<typeof getDb>>, seriesId: string, includeDeleted = false): Task[] {
  return db.tasks
    .filter(t => t.seriesId === seriesId && !t.isSeriesTemplate && (includeDeleted || !t.deleted))
    .sort((a, b) => (a.occurrenceDate || '').localeCompare(b.occurrenceDate || ''));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const seriesId = id.join('/');
    const db = await getDb();
    const series = (db.recurrenceSeries || []).find(s => s.id === seriesId);
    if (!series) return NextResponse.json({ error: 'Series not found' }, { status: 404 });
    return NextResponse.json({
      series,
      occurrences: occurrencesOf(db, seriesId),
      summary: recurrenceSummary(series.config),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string[] }> }
) {
  try {
    const { id } = await params;
    const seriesId = id.join('/');
    const body = await request.json();
    const db = await getDb();

    const series = (db.recurrenceSeries || []).find(s => s.id === seriesId);
    if (!series) return NextResponse.json({ error: 'Series not found' }, { status: 404 });

    const action: string = body.action || 'edit-series';
    const actor: string = body.actor || body.username || 'Unknown';
    const role: string = body.role || '';

    if (action !== 'edit-series') {
      return NextResponse.json({ error: 'Unknown or missing action.' }, { status: 400 });
    }

    // ── Guards (Decision #3): Controller+ only, series must be Active. ──
    if (!isControllerPlus(role)) {
      return NextResponse.json({ error: 'Only a Controller or higher may edit a recurrence series.' }, { status: 403 });
    }
    if (series.status !== 'Active') {
      return NextResponse.json({ error: `Cannot edit a ${series.status.toLowerCase()} series.` }, { status: 400 });
    }

    const newCfg = body.config;
    const cfgErr = validateRecurrence(newCfg);
    if (cfgErr) return NextResponse.json({ error: cfgErr }, { status: 400 });

    const oldSummary = recurrenceSummary(series.config);
    const today = todayStr();

    // ── Reconcile (Decision #2/#4-#9): plan around Effective Date = today + 1. ──
    const occ = occurrencesOf(db, seriesId).map(t => ({
      id: t.id,
      occurrenceDate: t.occurrenceDate,
      status: t.status,
      deleted: t.deleted,
    }));
    const plan = planReconcile(newCfg, occ, today);

    // Soft-delete the future Assigned/Returned occurrences (Decision: soft-delete).
    const deleteSet = new Set(plan.toSoftDelete);
    let softDeleted = 0;
    for (const t of db.tasks) {
      if (!deleteSet.has(t.id)) continue;
      t.deleted = true;
      t.deletedAt = new Date().toISOString();
      t.deletedBy = actor;
      t.deletedReason = 'Recurrence template updated — occurrence regenerated.';
      if (!t.audits) t.audits = [];
      t.audits.push(makeAudit(actor, 'Removed', `Occurrence removed because the recurrence template was updated (effective ${plan.effectiveDate}).`));
      softDeleted++;
    }

    // Apply the new config, then regenerate the future window from Effective Date.
    series.config = newCfg;
    if (!series.audits) series.audits = [];
    series.audits.push(makeAudit(
      actor,
      'Template edited',
      `Recurrence changed from "${oldSummary}" to "${recurrenceSummary(newCfg)}". Effective ${plan.effectiveDate}: ${softDeleted} occurrence(s) regenerated, ${plan.keptDates.length} kept.`
    ));

    const to = addDaysISO(today, newCfg.leadTimeDays || 0);
    const created = generateOccurrencesForSeries(db, series, plan.effectiveDate, to);

    // Keep the template task's inline card in sync so the detail page reflects the edit.
    const tmplTask = db.tasks.find(t => t.seriesId === seriesId && t.isSeriesTemplate);
    if (tmplTask) {
      tmplTask.recurrence = newCfg;
      tmplTask.recurrenceSchedule = recurrenceSummary(newCfg);
      series.taskTemplate = {
        title: tmplTask.title,
        description: tmplTask.description,
        priority: tmplTask.priority === 'High' ? 'High' : 'Normal',
        assignee: tmplTask.assignee,
        assigneeType: tmplTask.assigneeType,
        checklist: series.taskTemplate.checklist,
      };
    }

    await saveDb(db);

    return NextResponse.json({
      series,
      occurrences: occurrencesOf(db, seriesId),
      reconcile: {
        effectiveDate: plan.effectiveDate,
        softDeleted,
        generated: created.length,
        kept: plan.keptDates.length,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
