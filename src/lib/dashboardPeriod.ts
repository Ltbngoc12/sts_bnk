/**
 * Dashboard period ranges — Dashboard Enhancement Plan v2 §3.3.
 *
 * Backs the per-card period selector on the "Total Incident" / "Total Fault" KPI
 * cards (FRD §2.4.2 "Incidents Reported" / "Faults Reported" — the only 2 of the
 * 9 dashboard metrics that are period-based; the other 7 are status snapshots).
 *
 * Decision log (Kyle, 2026-08-17):
 *  - "Today" = calendar day 00:00–23:59.59.999, NOT the 09:00 shift window that
 *    v1 of the plan used. `isWithinReportWindow()` / `dashboardReportResetTime`
 *    are retired as a result.
 *  - Week boundary = Monday–Sunday (SG convention). Flagged as open item §7.3 —
 *    change WEEK_STARTS_ON to 0 if the client wants Sunday-first.
 *
 * Kept in `lib/` rather than inline in the Dashboard page so the Operational
 * Statistics module (FRD §2.4.1) can reuse the exact same boundaries — the two
 * screens disagreeing on what "This Month" means would be a reporting defect.
 */

export type DashboardPeriod =
  | 'today'
  | 'thisWeek'
  | 'lastWeek'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'lastYear';

/** 1 = Monday-first (SG/ISO). Set to 0 for Sunday-first. */
const WEEK_STARTS_ON = 1;

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Today',
  thisWeek: 'This Week',
  lastWeek: 'Last Week',
  thisMonth: 'This Month',
  lastMonth: 'Last Month',
  thisYear: 'This Year',
  lastYear: 'Last Year',
};

/** Dropdown order — matches the order the client listed in the mockup brief. */
export const PERIOD_OPTIONS: DashboardPeriod[] = [
  'today',
  'thisWeek',
  'lastWeek',
  'thisMonth',
  'lastMonth',
  'thisYear',
  'lastYear',
];

export const DEFAULT_PERIOD: DashboardPeriod = 'today';

export interface PeriodRange {
  /** Inclusive lower bound, local time, at 00:00:00.000. */
  start: Date;
  /** Inclusive upper bound, local time, at 23:59:59.999. */
  end: Date;
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

/**
 * Start of the week containing `d`. Uses setDate() with a possibly-negative day
 * number, which JS normalises across month/year boundaries — so the last week of
 * December correctly rolls back into the previous year.
 */
function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const day = out.getDay(); // 0=Sun … 6=Sat
  const diff = (day - WEEK_STARTS_ON + 7) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

/**
 * Resolve a period to a concrete local-time [start, end] range relative to `now`.
 * `now` is injected rather than read from the clock so this is unit-testable and
 * so a single render pass uses one consistent "now" across both KPI cards.
 */
export function getPeriodRange(period: DashboardPeriod, now: Date = new Date()): PeriodRange {
  switch (period) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };

    case 'thisWeek': {
      const start = startOfWeek(now);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return { start, end: endOfDay(end) };
    }

    case 'lastWeek': {
      const thisWeekStart = startOfWeek(now);
      const start = new Date(thisWeekStart);
      start.setDate(start.getDate() - 7);
      const end = new Date(thisWeekStart);
      end.setDate(end.getDate() - 1);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    case 'thisMonth': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      // Day 0 of the next month = last day of this month (handles 28/29/30/31).
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    case 'thisYear': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    case 'lastYear': {
      const start = new Date(now.getFullYear() - 1, 0, 1);
      const end = new Date(now.getFullYear() - 1, 11, 31);
      return { start: startOfDay(start), end: endOfDay(end) };
    }

    default: {
      // Exhaustiveness guard — a new DashboardPeriod member fails the build here
      // rather than silently falling through to an empty range at runtime.
      const exhaustive: never = period;
      void exhaustive;
      return { start: startOfDay(now), end: endOfDay(now) };
    }
  }
}

/**
 * True when the ISO timestamp `dateStr` falls inside `range`.
 * Unparseable/empty timestamps return false rather than throwing — seed and
 * legacy records occasionally carry malformed dates and a bad row must not take
 * down the whole dashboard.
 */
export function isWithinPeriod(dateStr: string | undefined | null, range: PeriodRange): boolean {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return false;
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/** Short suffix rendered under a period-based metric, e.g. "(Today)". */
export function periodSubLabel(period: DashboardPeriod): string {
  return `(${PERIOD_LABELS[period]})`;
}

/** Narrows an untrusted value (localStorage, query string) to a DashboardPeriod. */
export function isDashboardPeriod(value: unknown): value is DashboardPeriod {
  return typeof value === 'string' && (PERIOD_OPTIONS as string[]).includes(value);
}
