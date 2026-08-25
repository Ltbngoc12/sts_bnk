// Shared recurrence logic (FRD 7.1.2 + Shin Feng clarifications).
// This is the single source of truth for occurrence-date computation, used by
// both the Create/Edit form preview and the server-side generation engine.
// Keeping it here (not in the React component) avoids the two drifting apart.

import { RecurrenceConfig, Weekday } from './db';

const JS_DAY: Record<Weekday, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => iso(new Date());

// Add N days to a YYYY-MM-DD string and return a YYYY-MM-DD string.
export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return iso(d);
}

export function defaultRecurrence(): RecurrenceConfig {
  return { frequency: 'Daily', weekdays: [], monthlyDay: 15, startDate: todayStr(), dueTime: '09:00', endType: 'afterCount', occurrenceCount: 10, leadTimeDays: 14 };
}

// Every occurrence date-string the series would ever produce, from its start
// until the end-condition stops it. Bounded by a 5-year horizon and a hard cap
// so an open-ended ("never") series can't loop forever. `afterCount` is counted
// from the start (not from any window), so windowing never corrupts the count.
export function allOccurrenceDates(cfg: RecurrenceConfig, hardCap = 2000): string[] {
  if (!cfg.startDate) return [];
  const start = new Date(cfg.startDate + 'T00:00:00');
  if (isNaN(start.getTime())) return [];
  const wdSet = new Set((cfg.weekdays || []).map(w => JS_DAY[w]));
  const horizon = new Date(start);
  horizon.setFullYear(horizon.getFullYear() + 5);

  const out: string[] = [];
  const cursor = new Date(start);
  let count = 0;
  let guard = 0;
  while (guard < 100000) {
    guard++;
    if (cursor > horizon) break;
    let hit = false;
    if (cfg.frequency === 'Daily') hit = true;
    else if (cfg.frequency === 'Weekly') hit = wdSet.has(cursor.getDay());
    else if (cfg.frequency === 'Monthly') {
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      hit = cursor.getDate() === Math.min(cfg.monthlyDay || 1, lastDay);
    }
    if (hit) {
      if (cfg.endType === 'onDate' && cfg.endDate && iso(cursor) > cfg.endDate) break;
      if (cfg.endType === 'afterCount' && count >= (cfg.occurrenceCount || 0)) break;
      out.push(iso(cursor));
      count++;
      if (out.length >= hardCap) break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// Dates that should be materialised as tasks now: occurrence dates that fall
// inside [fromISO, toISO] inclusive. No backfill happens because callers pass
// fromISO = max(start, today) (or the effective date on edit).
export function occurrenceDatesToGenerate(cfg: RecurrenceConfig, fromISO: string, toISO: string): string[] {
  return allOccurrenceDates(cfg).filter(d => d >= fromISO && d <= toISO);
}

// Preview shown in the form: occurrences within the lead-time window from today.
export function previewOccurrences(cfg: RecurrenceConfig, maxShow = 60): Date[] {
  const today = todayStr();
  const toISO = addDaysISO(today, cfg.leadTimeDays || 0);
  return occurrenceDatesToGenerate(cfg, today, toISO)
    .slice(0, maxShow)
    .map(s => new Date(s + 'T00:00:00'));
}

// Human-readable summary stored on the task/series for list & detail display.
export function recurrenceSummary(cfg: RecurrenceConfig): string {
  let base = '';
  if (cfg.frequency === 'Daily') base = 'Daily';
  else if (cfg.frequency === 'Weekly') base = `Weekly on ${(cfg.weekdays || []).join('/')}`;
  else base = `Monthly on day ${cfg.monthlyDay}`;
  if (cfg.dueTime) base += ` at ${cfg.dueTime}`;
  if (cfg.endType === 'onDate' && cfg.endDate) base += ` until ${cfg.endDate}`;
  else if (cfg.endType === 'afterCount') base += ` × ${cfg.occurrenceCount}`;
  return base;
}

// Validate a config before persisting. Returns an error string, or null if OK.
export function validateRecurrence(cfg: RecurrenceConfig): string | null {
  if (!cfg || !cfg.frequency) return 'Recurrence frequency is required.';
  if (!cfg.startDate) return 'Start date is required.';
  if (cfg.frequency === 'Weekly' && (!cfg.weekdays || cfg.weekdays.length === 0)) {
    return 'Weekly recurrence needs at least one weekday.';
  }
  if (cfg.frequency === 'Monthly' && (!cfg.monthlyDay || cfg.monthlyDay < 1 || cfg.monthlyDay > 31)) {
    return 'Monthly day must be between 1 and 31.';
  }
  if (cfg.endType === 'onDate') {
    if (!cfg.endDate) return 'End date is required when ending on a date.';
    if (cfg.endDate < cfg.startDate) return 'End date cannot be before the start date.';
  }
  if (cfg.endType === 'afterCount' && (!cfg.occurrenceCount || cfg.occurrenceCount < 1)) {
    return 'Occurrence count must be at least 1.';
  }
  if ((cfg.leadTimeDays ?? -1) < 0) return 'Lead time cannot be negative.';
  return null;
}

// Whether a config's end-condition has been fully consumed as of `todayISO`
// (so the series can be marked Ended after an edit).
export function isSeriesExhausted(cfg: RecurrenceConfig, todayISO: string): boolean {
  if (cfg.endType === 'onDate' && cfg.endDate) return cfg.endDate < todayISO;
  if (cfg.endType === 'afterCount') {
    const all = allOccurrenceDates(cfg);
    const last = all[all.length - 1];
    return !!last && last < todayISO;
  }
  return false;
}
