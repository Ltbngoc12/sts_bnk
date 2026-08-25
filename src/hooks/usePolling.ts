'use client';

import { useEffect, useRef } from 'react';

/**
 * Interval polling that stops while the tab is hidden.
 *
 * Why this exists: every polling screen in the app used a bare setInterval, so
 * a Controller with four tabs open kept hitting the API all night with nobody
 * watching (runtime logs showed /api/notifications at ~4 req/min around the
 * clock, cache=MISS every time). Atlas is the shared resource being burned, so
 * the fix belongs in one place rather than in six copies of the same effect.
 *
 * Behaviour:
 *  - runs once on mount (even if the tab starts hidden, so a background tab
 *    still renders real data when the user switches to it);
 *  - only ticks on the interval while document.visibilityState === 'visible';
 *  - refetches on return to the tab so the user never stares at stale data;
 *  - never overlaps: a run that is still in flight suppresses the next tick.
 */
export interface UsePollingOptions {
  /** Set false to suspend polling entirely (e.g. permission denied, no id yet). */
  enabled?: boolean;
  /** Run the callback immediately on mount. Default true. */
  immediate?: boolean;
  /** Pause the interval while the tab is hidden. Default true. */
  pauseWhenHidden?: boolean;
  /** Throttle for focus-triggered refetches, so rapid alt-tabbing is not a burst. */
  minIntervalMs?: number;
}

export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  options: UsePollingOptions = {},
): void {
  const {
    enabled = true,
    immediate = true,
    pauseWhenHidden = true,
    minIntervalMs = 2_000,
  } = options;

  // Keep the latest callback in a ref so callers do not have to memoise it —
  // an unstable fn would otherwise tear down and recreate the interval on
  // every render.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const inFlightRef = useRef(false);
  const lastRunRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const run = async (force: boolean) => {
      if (cancelled || inFlightRef.current) return;
      const now = Date.now();
      if (!force && now - lastRunRef.current < minIntervalMs) return;
      inFlightRef.current = true;
      lastRunRef.current = now;
      try {
        await fnRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    const stopTimer = () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };

    const startTimer = () => {
      stopTimer();
      timerRef.current = setInterval(() => { void run(true); }, intervalMs);
    };

    const isHidden = () =>
      pauseWhenHidden && typeof document !== 'undefined' && document.visibilityState === 'hidden';

    // Always do the first run, even in a hidden tab — otherwise a background tab
    // shows an empty skeleton until the user focuses it.
    if (immediate) void run(true);
    if (!isHidden()) startTimer();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void run(false);
        startTimer();
      } else {
        stopTimer();
      }
    };

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      cancelled = true;
      stopTimer();
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [enabled, immediate, intervalMs, pauseWhenHidden, minIntervalMs]);
}
