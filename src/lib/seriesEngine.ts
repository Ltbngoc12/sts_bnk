// Server-side recurrence generation engine. Mutates a hydrated DbSchema in
// place; callers are responsible for saveDb() afterwards. Kept separate from
// db.ts so the pure date math (recurrence.ts) and the persistence layer stay
// decoupled.

import { DbSchema, RecurrenceSeries, Task, TaskAudit, TaskChecklistItem, generateTaskId, generateCaseId, normalizeTaskPriority } from './db';
import { occurrenceDatesToGenerate, addDaysISO, todayStr, isSeriesExhausted } from './recurrence';

const rid = () => Math.random().toString(36).substring(2, 9);

function audit(operator: string, action: string, details: string): TaskAudit {
  return { id: `aud-${rid()}`, timestamp: new Date().toISOString(), operator, action, details };
}

function cloneChecklist(items?: TaskChecklistItem[]): TaskChecklistItem[] {
  return (items || []).map(c => ({ id: `chk-${rid()}`, text: c.text, isCompleted: false }));
}

// Occurrence dates that already have a live (non-deleted) task for this series.
function existingDates(db: DbSchema, seriesId: string): Set<string> {
  return new Set(
    db.tasks
      .filter(t => t.seriesId === seriesId && !t.isSeriesTemplate && t.occurrenceDate && !t.deleted)
      .map(t => t.occurrenceDate as string)
  );
}

// Materialise missing occurrence tasks for a series within [fromISO, toISO].
// Idempotent — never creates a second task for a date that already has one.
export function generateOccurrencesForSeries(
  db: DbSchema,
  series: RecurrenceSeries,
  fromISO: string,
  toISO: string
): Task[] {
  if (series.status !== 'Active') return [];
  const cfg = series.config;
  const wanted = occurrenceDatesToGenerate(cfg, fromISO, toISO);
  const existing = existingDates(db, series.id);
  const tmpl = series.taskTemplate;
  const dueTime = cfg.dueTime || '09:00';
  const hasAssignee = !!tmpl.assignee && tmpl.assignee !== 'Unassigned';
  const created: Task[] = [];

  for (const date of wanted) {
    if (existing.has(date)) continue;

    // Feedback: occurrences should not pile up under one shared Case — every
    // generated occurrence gets its own fresh Case (Model A, taken literally).
    const occCaseId = generateCaseId(db);
    db.cases.push({
      id: occCaseId,
      title: `Case for Task: ${tmpl.title} (${date})`,
      status: 'Active',
      createdAt: new Date().toISOString(),
      closedAt: null,
      closedBy: null,
      createdBy: series.createdBy,
      cmmsTickets: [],
      incident: null,
    });

    const task: Task = {
      id: generateTaskId(db),
      caseId: occCaseId,
      title: tmpl.title,
      description: tmpl.description || '',
      assignee: hasAssignee ? tmpl.assignee : 'Unassigned',
      assigneeType: tmpl.assigneeType === 'group' ? 'group' : 'user',
      assignees: tmpl.assignees && tmpl.assignees.length > 0 ? tmpl.assignees : undefined,
      priority: normalizeTaskPriority(tmpl.priority),
      dueDate: `${date}T${dueTime}`,
      status: hasAssignee ? 'Assigned' : 'Created',
      completed: false,
      checklist: cloneChecklist(tmpl.checklist),
      comments: [],
      seriesId: series.id,
      occurrenceDate: date,
      isRecurringInstance: true,
      attachments: [],
      createdBy: series.createdBy,
      createdDate: new Date().toISOString(),
      audits: [audit('System', 'Generated', `Occurrence for ${date} generated from recurrence series ${series.id} under new Case ${occCaseId}.`)],
    };
    db.tasks.push(task);
    existing.add(date);
    created.push(task);
  }

  series.lastGeneratedDate = toISO;
  if (isSeriesExhausted(cfg, todayStr())) series.status = 'Ended';
  return created;
}

// Convenience: advance a single series' lead-window up to (today + leadTime).
// fromISO defaults to today (no backfill of missed days before today).
export function advanceSeries(db: DbSchema, series: RecurrenceSeries, fromISO?: string): Task[] {
  const today = todayStr();
  const from = fromISO || today;
  const to = addDaysISO(today, series.config.leadTimeDays || 0);
  return generateOccurrencesForSeries(db, series, from, to);
}

// Advance every Active series (used by the daily cron).
export function advanceAllSeries(db: DbSchema): { seriesId: string; created: number }[] {
  const out: { seriesId: string; created: number }[] = [];
  for (const s of db.recurrenceSeries || []) {
    if (s.status !== 'Active') continue;
    const created = advanceSeries(db, s);
    out.push({ seriesId: s.id, created: created.length });
  }
  return out;
}
