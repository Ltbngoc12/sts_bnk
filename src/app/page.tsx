'use client';

import React, { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Case, Task, Fault, EventRecord, NOPRecord } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { usePolling } from '@/hooks/usePolling';
import { MetricCard } from '@/components/MetricCard';
import { EventTimelineView } from '@/components/EventTimelineView';
import EventCreateModal from '@/components/EventCreateModal';
import {
  DashboardPeriod,
  DEFAULT_PERIOD,
  getPeriodRange,
  isDashboardPeriod,
  isWithinPeriod,
  periodSubLabel,
} from '@/lib/dashboardPeriod';

const MapComponent = dynamic(
  () => import('@/components/MapComponent'),
  { ssr: false }
);

/**
 * Operational Dashboard — FRD v0.5 §2.4.
 *
 * Layout per Dashboard Enhancement Plan v2 (2026-08-17, mockup-driven):
 *   header → 5 grouped KPI cards → Today Event timeline + 2D Island Map.
 *
 * All 9 mandated §2.4.2 metrics are still represented: 7 inside the KPI cards,
 * "Events Today" as the badge on the Today Event panel, and "Active NOPs" as a
 * TBD placeholder card pending the NOP module.
 *
 * Superseded from v1 of the plan: the "Pending Action" spotlight card, the
 * two-tier Current Load / Today's Tally split, the 09:00 report-reset window, and
 * the three bottom lists (Active Cases, Active Tasks, Recent Occurrences).
 */

const PERIOD_STORAGE_KEYS = {
  incident: 'dashboard_incident_period',
  fault: 'dashboard_fault_period',
} as const;

function readStoredPeriod(key: string): DashboardPeriod {
  if (typeof window === 'undefined') return DEFAULT_PERIOD;
  try {
    const raw = window.localStorage.getItem(key);
    return isDashboardPeriod(raw) ? raw : DEFAULT_PERIOD;
  } catch {
    return DEFAULT_PERIOD;
  }
}

// ── Retained, currently unused ────────────────────────────────────────────────
// "Pending Action" was built in plan v1 then removed from the UI by client
// decision (plan v2 §0.1). The rules below were reviewed against Incident.status
// and ResponderLifecycleStatus and are kept verbatim so the metric can be brought
// back — or reused by Operational Statistics / alerting — without re-deriving it.
//
// function isIncidentPending(incident: NonNullable<Case['incident']>): boolean {
//   if (incident.status === 'Live') return true;
//   if (incident.status === 'Live (Assigned)') {
//     const active = (incident.responders ?? []).filter(r => r.status === 'Active');
//     if (active.length === 0) return true;
//     return active.every(r => r.lifecycleStatus === 'Assigned');
//   }
//   return false;
// }
// pendingFaults = faults.filter(f => f.status === 'Pending Submission').length
// pendingTasks  = tasks.filter(t => t.status === 'Created' || t.status === 'Assigned').length

export default function DashboardPage() {
  const { username } = useRole();

  const [cases, setCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventsToday, setEventsToday] = useState(0);
  const [nops, setNops] = useState<NOPRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastDataAt, setLastDataAt] = useState<Date | null>(null);

  // Independent per-card periods, persisted
  const [incidentPeriod, setIncidentPeriod] = useState<DashboardPeriod>(() =>
    readStoredPeriod(PERIOD_STORAGE_KEYS.incident));
  const [faultPeriod, setFaultPeriod] = useState<DashboardPeriod>(() =>
    readStoredPeriod(PERIOD_STORAGE_KEYS.fault));

  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);

  const health = useSystemHealth();

  const fetchDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const [casesRes, tasksRes, faultsRes, eventsRes, nopsRes] = await Promise.all([
        fetch('/api/cases'),
        fetch('/api/tasks'),
        fetch('/api/faults'),
        fetch('/api/events'),
        fetch('/api/nops').catch(() => null),
      ]);

      if (casesRes.ok) setCases(await casesRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (faultsRes.ok) {
        const data = await faultsRes.json();
        setFaults(data.faults ?? []);
      }
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(data.events ?? []);
        setEventsToday(data.stats?.today ?? 0);
      }
      if (nopsRes && nopsRes.ok) {
        const data = await nopsRes.json();
        setNops(data.nops ?? []);
      }
      setLastDataAt(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      if (isManualRefresh) {
        setTimeout(() => setRefreshing(false), 500);
      }
    }
  }, []);

  // Auto-refresh on 30s cadence. Each tick fans out to 5 APIs, so it only runs
  // while the dashboard is the visible tab; returning to the tab refetches at once.
  usePolling(() => fetchDashboardData(false), 30_000);

  const changeIncidentPeriod = useCallback((p: DashboardPeriod) => {
    setIncidentPeriod(p);
    try { window.localStorage.setItem(PERIOD_STORAGE_KEYS.incident, p); } catch { /* private mode */ }
  }, []);

  const changeFaultPeriod = useCallback((p: DashboardPeriod) => {
    setFaultPeriod(p);
    try { window.localStorage.setItem(PERIOD_STORAGE_KEYS.fault, p); } catch { /* private mode */ }
  }, []);

  // FRD §2.4.2 metrics
  const metrics = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const incidentRange = getPeriodRange(incidentPeriod, now);
    const faultRange = getPeriodRange(faultPeriod, now);

    return {
      activeCases: cases.filter(c => c.status === 'Active').length,
      incidentsReported: cases.filter(c => c.incident && isWithinPeriod(c.incident.dateTime, incidentRange)).length,
      unclosedIncidents: cases.filter(c => c.incident && c.incident.status !== 'Closed').length,
      faultsReported: faults.filter(f => isWithinPeriod(f.createdAt, faultRange)).length,
      unclosedFaults: faults.filter(f => f.status !== 'Closed').length,
      activeTasks: tasks.filter(t => t.status !== 'Closed').length,
      overdueTasks: tasks.filter(t => t.status !== 'Closed' && new Date(t.dueDate) < startOfToday).length,
    };
  }, [cases, faults, tasks, incidentPeriod, faultPeriod]);

  const healthLabel =
    health.state === 'healthy' ? 'SYSTEM MONITORING ACTIVE'
    : health.state === 'degraded' ? 'RECONNECTING…'
    : 'CONNECTION LOST';

  const staleStamp = health.state === 'down' && lastDataAt
    ? `Data as of ${lastDataAt.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const today = new Date();

  return (
    <div className="dashboard-page-container">
      {/* Header bar */}
      <div className="dashboard-header-bar glass">
        <div className="header-title-sec">
          <div className="header-badge-row">
            <h1>OPERATIONAL DASHBOARD</h1>
          </div>
        </div>

        <div className="header-status-sec">
          {/* 3-state connection pill */}
          <div className={`live-pulse health-${health.state}`} title={staleStamp ?? undefined}>
            <span className={`pulse-dot health-dot-${health.state}`} />
            <span>{healthLabel}</span>
          </div>

          {staleStamp && <div className="header-stale-stamp">{staleStamp}</div>}

          <div className="header-datetime">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-1px', marginRight: '5px', opacity: 0.7 }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            {today.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="dashboard-skeleton-wrapper">
          <div className="metrics-grid-v2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="metric-skeleton glass" />
            ))}
          </div>
          <div className="dashboard-main-grid" style={{ marginTop: '16px' }}>
            <div className="main-skeleton-left glass" />
            <div className="main-skeleton-right glass" />
          </div>
        </div>
      ) : (
        <>
          {/* ── KPI cards — 5 groups ───────────────────────── */}
          <div className="metrics-grid-v2">

            <MetricCard
              title="Active Cases"
              iconType="cases"
              accent="info"
              cardHref="/case-management?tab=cases"
              metrics={[{
                label: 'Active Cases',
                value: metrics.activeCases,
                qualifier: 'as of now',
                tone: 'info',
                href: '/case-management?tab=cases',
                title: 'Total case records in Active status',
              }]}
            />

            <MetricCard
              title="Total Incident"
              iconType="incidents"
              accent="critical"
              period={incidentPeriod}
              onPeriodChange={changeIncidentPeriod}
              cardHref="/case-management?tab=incidents"
              metrics={[
                {
                  label: 'Active Incidents',
                  value: metrics.unclosedIncidents,
                  qualifier: 'as of now',
                  tone: 'danger',
                  alertWhenPositive: true,
                  href: '/case-management?tab=incidents',
                  title: 'Incidents not yet in Closed status',
                },
                {
                  label: 'Reported',
                  value: metrics.incidentsReported,
                  qualifier: periodSubLabel(incidentPeriod),
                  href: '/case-management?tab=incidents',
                  title: `Total incidents reported (${periodSubLabel(incidentPeriod)})`,
                },
              ]}
            />

            <MetricCard
              title="Total Fault"
              iconType="faults"
              accent="high"
              period={faultPeriod}
              onPeriodChange={changeFaultPeriod}
              cardHref="/case-management?tab=faults"
              metrics={[
                {
                  label: 'Active Faults',
                  value: metrics.unclosedFaults,
                  qualifier: 'as of now',
                  tone: 'warning',
                  alertWhenPositive: true,
                  href: '/case-management?tab=faults',
                  title: 'Faults not yet in Closed status',
                },
                {
                  label: 'Reported',
                  value: metrics.faultsReported,
                  qualifier: periodSubLabel(faultPeriod),
                  href: '/case-management?tab=faults',
                  title: `Total faults reported (${periodSubLabel(faultPeriod)})`,
                },
              ]}
            />

            <MetricCard
              title="Active Tasks"
              iconType="tasks"
              accent="review"
              cardHref="/case-management?tab=tasks"
              metrics={[
                {
                  label: 'Overdue',
                  value: metrics.overdueTasks,
                  qualifier: 'needs action',
                  tone: 'danger',
                  alertWhenPositive: true,
                  href: '/case-management?tab=tasks',
                  title: 'Count of active tasks past due date',
                },
                {
                  label: 'Active Tasks',
                  value: metrics.activeTasks,
                  qualifier: 'in progress',
                  tone: 'success',
                  href: '/case-management?tab=tasks',
                  title: 'Count of tasks currently active',
                },
              ]}
            />

            <MetricCard
              title="Active NOPs"
              iconType="nops"
              accent="primary"
              disabled
              disabledNote="NOP module planned for v2.0 release"
              metrics={[{
                label: 'Active NOPs',
                value: '—',
                qualifier: 'v2.0 preview',
                title: 'Notice of Permit module is under planned development',
              }]}
            />

          </div>

          {/* ── Today Event + 2D Island Map ─────────────── */}
          <div className="dashboard-main-grid">

            <div className="today-event-card glass">
              <div className="card-header today-event-header">
                <div className="today-event-title-group">
                  <span className="today-event-header-icon">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <h2>TODAY&apos;S EVENTS</h2>
                  <span className="today-event-count" title="Events overlapping today">
                    {eventsToday}
                  </span>
                </div>

                <div className="today-event-actions">
                  <Link href="/events" className="today-event-nav-btn" title="Go to Events Master List">
                    <span>Events</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
              <div className="today-event-body">
                {eventsToday === 0 ? (
                  <div className="today-empty-state">
                    <div className="today-empty-icon-circle">
                      <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
                      </svg>
                    </div>
                    <div className="today-empty-title">No events scheduled today</div>
                    <p className="today-empty-desc">
                      Island operations are running under standard schedule with no planned public or private events today.
                    </p>
                    <a href="/events" className="today-empty-link">
                      <span>View Event Calendar</span>
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </a>
                  </div>
                ) : (
                  <EventTimelineView
                    events={events}
                    currentDate={today}
                    compact
                    onEventClick={setSelectedEvent}
                  />
                )}
              </div>
            </div>

            <div className="map-card glass">
              <div className="map-wrapper">
                <MapComponent
                  cases={cases}
                  tasks={tasks}
                  faults={faults}
                  events={events}
                  nops={nops}
                />
              </div>
            </div>

          </div>

          {/* Event detail popup */}
          <EventCreateModal
            isOpen={!!selectedEvent}
            onClose={() => setSelectedEvent(null)}
            onSuccess={fetchDashboardData}
            username={username}
            editingEvent={selectedEvent}
            canEdit={false}
            canDelete={false}
          />
        </>
      )}
    </div>
  );
}
