'use client';

import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Case, Task, Occurrence, Fault } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

const MapComponent = dynamic(
  () => import('@/components/MapComponent'),
  { ssr: false }
);

export default function DashboardPage() {
  const { role, username } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [faults, setFaults] = useState<Fault[]>([]);
  const [eventsToday, setEventsToday] = useState(0);
  const [activeNops, setActiveNops] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const fetchFaults = useCallback(async (start: string, end: string) => {
    const params = new URLSearchParams();
    if (start) params.set('startDate', start);
    if (end) params.set('endDate', end);
    const res = await fetch(`/api/faults${params.size ? '?' + params.toString() : ''}`);
    if (res.ok) {
      const data = await res.json();
      setFaults(data.faults ?? []);
    }
  }, []);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [casesRes, tasksRes, occRes, faultsRes, eventsRes, nopsRes] = await Promise.all([
          fetch('/api/cases'),
          fetch('/api/tasks'),
          fetch('/api/occurrences'),
          fetch('/api/faults'),
          fetch('/api/events'),
          fetch('/api/nops'),
        ]);

        if (casesRes.ok) setCases(await casesRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (occRes.ok) setOccurrences(await occRes.json());
        if (faultsRes.ok) {
          const data = await faultsRes.json();
          setFaults(data.faults ?? []);
        }
        if (eventsRes.ok) {
          const data = await eventsRes.json();
          setEventsToday(data.stats?.today ?? 0);
        }
        if (nopsRes.ok) {
          const data = await nopsRes.json();
          setActiveNops(data.stats?.active ?? 0);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // Re-fetch faults when date range changes
  useEffect(() => {
    if (!loading) {
      fetchFaults(dateStart, dateEnd);
    }
  }, [dateStart, dateEnd, loading, fetchFaults]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const inRange = (dateStr: string) => {
    if (!dateStart && !dateEnd) return true;
    const d = new Date(dateStr).getTime();
    if (dateStart && d < new Date(dateStart).getTime()) return false;
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      if (d > end.getTime()) return false;
    }
    return true;
  };

  // FRD 2.4.2 metrics
  const activeCases       = cases.filter(c => c.status === 'Active').length;
  const totalIncidents    = cases.filter(c => c.incident && inRange(c.incident.dateTime)).length;
  const unclosedIncidents = cases.filter(c => c.incident && c.incident.status !== 'Closed').length;
  const totalFaults       = faults.length;
  const unclosedFaults    = faults.filter(f => f.status !== 'Closed').length;
  const activeTasks       = tasks.filter(t => t.status !== 'Closed').length;
  const overdueTasks      = tasks.filter(t => t.status !== 'Closed' && new Date(t.dueDate) < today).length;

  const handleClearFilter = () => {
    setDateStart('');
    setDateEnd('');
  };

  return (
    <>
      {/* Header bar */}
      <div className="dashboard-header-bar glass">
        <div className="header-title-sec">
          <h1>OPERATIONAL DASHBOARD <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'0.55em',fontWeight:600,letterSpacing:'0.08em',background:'#fff7ed',color:'#ea580c',border:'1.5px solid #fdba74',borderRadius:'6px',padding:'3px 10px',verticalAlign:'middle',marginLeft:'8px'}}><span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#ea580c',display:'inline-block',animation:'pulse 1.5s infinite'}}/>IN PROCESS</span></h1>
          <p>Island Integrated Operations Centre (IIOC) &bull; Live Feed</p>
        </div>
        <div className="header-status-sec">
          <div className="live-pulse">
            <span className="pulse-dot" />
            <span>SYSTEM MONITORING ACTIVE</span>
          </div>
          <div className="header-datetime">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-container glass">
          <div className="spinner" />
          <span>LOADING OPERATIONAL DATA...</span>
        </div>
      ) : (
        <>
          {/* Date range filter (FRD 2.4.2 — each metric filterable by date/time range) */}
          <div className="metrics-filter-bar glass">
            <label>Filter by Date Range:</label>
            <input
              type="date"
              value={dateStart}
              max={dateEnd || undefined}
              onChange={e => setDateStart(e.target.value)}
              title="Start date"
            />
            <span className="filter-sep">to</span>
            <input
              type="date"
              value={dateEnd}
              min={dateStart || undefined}
              onChange={e => setDateEnd(e.target.value)}
              title="End date"
            />
            {(dateStart || dateEnd) && (
              <button className="filter-clear-btn" onClick={handleClearFilter}>
                Clear
              </button>
            )}
            {(dateStart || dateEnd) && (
              <span className="filter-sep" style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 600 }}>
                Affects: Incidents Reported, Faults Reported
              </span>
            )}
          </div>

          {/* Summary counters grid — FRD 2.4.2 (9 metrics in FSD order) */}
          <div className="metrics-grid">

            {/* 1. Active Cases */}
            <div className="metric-card glass active-cases">
              <div className="metric-info">
                <h3>Active Cases</h3>
                <div className="metric-value text-info">{activeCases}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
              </div>
            </div>

            {/* 2. Incidents Reported */}
            <div className="metric-card glass incidents-reported">
              <div className="metric-info">
                <h3>Incidents Reported</h3>
                <div className="metric-value">{totalIncidents}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* 3. Unclosed Incidents */}
            <div className="metric-card glass unclosed-incidents">
              <div className="metric-info">
                <h3>Unclosed Incidents</h3>
                <div className="metric-value text-danger">{unclosedIncidents}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* 4. Faults Reported */}
            <div className="metric-card glass faults-reported">
              <div className="metric-info">
                <h3>Faults Reported</h3>
                <div className="metric-value">{totalFaults}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

            {/* 5. Unclosed Faults */}
            <div className="metric-card glass unclosed-faults">
              <div className="metric-info">
                <h3>Unclosed Faults</h3>
                <div className="metric-value text-warning">{unclosedFaults}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* 6. Active Tasks */}
            <div className="metric-card glass active-tasks">
              <div className="metric-info">
                <h3>Active Tasks</h3>
                <div className="metric-value text-success">{activeTasks}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>

            {/* 7. Overdue Tasks */}
            <div className="metric-card glass overdue-tasks">
              <div className="metric-info">
                <h3>Overdue Tasks</h3>
                <div className="metric-value text-danger">{overdueTasks}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* 8. Events Today (mock) */}
            <div className="metric-card glass events-today">
              <div className="metric-info">
                <h3>Events Today</h3>
                <div className="metric-value" style={{ color: 'var(--color-active)' }}>{eventsToday}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            {/* 9. Active NOPs (mock) */}
            <div className="metric-card glass active-nops">
              <div className="metric-info">
                <h3>Active NOPs</h3>
                <div className="metric-value" style={{ color: 'var(--color-primary)' }}>{activeNops}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </div>

          </div>

          {/* Map & Active Cases Layout */}
          <div className="dashboard-layout-grid">
            {/* Embedded 2D Map (FRD 2.4.3) */}
            <div className="map-card glass">
              <div className="card-header">
                <h2>2D ISLAND MAP (SENTOSA)</h2>
                <span className="live-dot" />
              </div>
              <div className="map-wrapper">
                <MapComponent cases={cases} />
              </div>
            </div>

            {/* Active Operations List */}
            <div className="active-cases-card glass">
              <div className="card-header">
                <h2>ACTIVE CASES & INCIDENTS</h2>
                <Link href="/case-management?tab=cases" className="view-all-link">View All</Link>
              </div>
              <div className="active-cases-list">
                {cases.filter(c => c.status !== 'Closed').length === 0 ? (
                  <div className="empty-state">No active incidents or cases.</div>
                ) : (
                  cases
                    .filter(c => c.status !== 'Closed')
                    .slice(0, 5)
                    .map(c => (
                      <div key={c.id} className="active-case-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.12s ease', borderBottom: '1px solid var(--border-color)', padding: '12px 18px' }}>
                        <Link href={`/cases/${c.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                          <span className="case-id">{c.id}</span>
                          <span className="case-title" style={{ fontWeight: 600, color: 'var(--text-main)' }}>{c.title}</span>
                          <span className="case-meta" style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                            {c.incident ? `${c.incident.category} · ${c.incident.type}` : 'No attached incident'} &bull; {c.incident?.location.commonName || c.incident?.location.road || 'TBD'}
                          </span>
                        </Link>
                        {c.incident && (
                          <Link href={`/incidents/${c.incident.id}`} className="active-case-status" style={{ textDecoration: 'none' }}>
                            <span className={`badge ${
                              c.incident.status === 'Live' ? 'badge-live' :
                              c.incident.status === 'Live (Acknowledged)' ? 'badge-ack' :
                              c.incident.status === 'Live (Incomplete)' ? 'badge-ack' :
                              c.incident.status === 'Live (On-Site)' ? 'badge-onsite' :
                              c.incident.status === 'Live (Completed)' ? 'badge-completed' :
                              c.incident.status === 'Pending Endorsement' ? 'badge-review' :
                              c.incident.status === 'Returned' ? 'badge-live' :
                              'badge-closed'
                            }`}>
                              {c.incident.status}
                            </span>
                          </Link>
                        )}
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* Tasks & Occurrences split list */}
          <div className="bottom-split-grid">
            {/* Tasks list */}
            <div className="split-card glass">
              <div className="card-header">
                <h2>ACTIVE TASKS</h2>
                <Link href="/case-management?tab=tasks" className="view-all-link">Manage Tasks</Link>
              </div>
              <div className="split-list">
                {tasks.filter(t => t.status !== 'Closed').length === 0 ? (
                  <div className="empty-state">No active tasks.</div>
                ) : (
                  tasks
                    .filter(t => t.status !== 'Closed')
                    .slice(0, 4)
                    .map(t => (
                      <div className="split-list-item" key={t.id}>
                        <div className="item-details">
                          <div className="item-title">{t.title}</div>
                          <div className="item-sub">
                            Assigned to: <strong>{t.assignee}</strong> &bull; Priority: {t.priority}
                          </div>
                        </div>
                        <span className="badge badge-ack">{t.status}</span>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Occurrences (e-Diary) */}
            <div className="split-card glass">
              <div className="card-header">
                <h2>RECENT OCCURRENCES (E-DIARY)</h2>
                <Link href="/case-management?tab=ediary" className="view-all-link">Open Log</Link>
              </div>
              <div className="split-list">
                {occurrences.length === 0 ? (
                  <div className="empty-state">No occurrences logged today.</div>
                ) : (
                  occurrences.slice(0, 4).map(o => (
                    <div className="split-list-item" key={o.id}>
                      <div className="item-details">
                        <div className="item-title">{o.topic}</div>
                        <div className="item-desc">{o.content}</div>
                        <div className="item-sub">
                          Logged by: <strong>{o.user}</strong> &bull; {new Date(o.dateTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
