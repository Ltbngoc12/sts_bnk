'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Polls /api/health and exposes a 3-state connection status for the Dashboard
 * header pill (Dashboard Enhancement Plan v2 §2).
 *
 * Why 3 states and not a boolean: the previous implementation flipped a single
 * `systemHealthy` flag on the first data fetch and never re-checked, so the pill
 * stayed green indefinitely after the backend died. A single transient blip
 * shouldn't scream "CONNECTION LOST" either, hence the intermediate
 * 'degraded' state before escalating.
 */
export type SystemHealthState = 'healthy' | 'degraded' | 'down';

export interface SystemHealth {
  state: SystemHealthState;
  /** Timestamp of the last successful health check — used for the staleness label. */
  lastOkAt: Date | null;
  /** Consecutive failed checks. Escalates to 'down' at FAILURES_BEFORE_DOWN. */
  consecutiveFailures: number;
  /** Force an immediate check (e.g. after a manual data refresh). */
  checkNow: () => void;
}

const POLL_INTERVAL_MS = 30_000;
const FAILURES_BEFORE_DOWN = 3;
const REQUEST_TIMEOUT_MS = 8_000;

export function useSystemHealth(enabled = true): SystemHealth {
  const [state, setState] = useState<SystemHealthState>('healthy');
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);

  // Ref mirror of the failure count so the polling callback stays referentially
  // stable — otherwise every failure would tear down and recreate the interval.
  const failuresRef = useRef(0);
  const mountedRef = useRef(true);

  const runCheck = useCallback(async () => {
    // AbortSignal.timeout would be cleaner but a hung connection must not leave
    // the poll silently stalled, and this pattern works on every target browser.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!mountedRef.current) return;

      if (res.ok && body?.ok) {
        failuresRef.current = 0;
        setConsecutiveFailures(0);
        setState('healthy');
        setLastOkAt(new Date());
      } else {
        failuresRef.current += 1;
        setConsecutiveFailures(failuresRef.current);
        setState(failuresRef.current >= FAILURES_BEFORE_DOWN ? 'down' : 'degraded');
      }
    } catch {
      if (!mountedRef.current) return;
      failuresRef.current += 1;
      setConsecutiveFailures(failuresRef.current);
      setState(failuresRef.current >= FAILURES_BEFORE_DOWN ? 'down' : 'degraded');
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;

    runCheck();
    let id: ReturnType<typeof setInterval> | null = setInterval(runCheck, POLL_INTERVAL_MS);

    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const start = () => { stop(); id = setInterval(runCheck, POLL_INTERVAL_MS); };

    // A laptop returning from sleep should re-check immediately rather than wait
    // out the remainder of the interval showing a stale green pill. A hidden tab
    // should not be pinging Atlas at all — nobody is looking at the pill.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        runCheck();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mountedRef.current = false;
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, runCheck]);

  return { state, lastOkAt, consecutiveFailures, checkNow: runCheck };
}
