'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Case, Task, Occurrence } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// Dynamically import map component to disable SSR
const MapComponent = dynamic(
  () => import('@/components/MapComponent'),
  { ssr: false }
);

export default function DashboardPage() {
  const { role, username } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [casesRes, tasksRes, occRes] = await Promise.all([
          fetch('/api/cases'),
          fetch('/api/tasks'),
          fetch('/api/occurrences')
        ]);
        
        if (casesRes.ok) setCases(await casesRes.json());
        if (tasksRes.ok) setTasks(await tasksRes.json());
        if (occRes.ok) setOccurrences(await occRes.json());
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  // Compute metrics based on FRD 2.4.2
  const totalIncidents = cases.filter(c => c.incident).length;
  const unclosedIncidents = cases.filter(c => c.incident && c.status !== 'Closed').length;
  
  // CMMS fault tickets raised
  const totalFaults = cases.reduce((acc, c) => acc + (c.cmmsTickets?.length || 0), 0);
  // Unclosed faults: faults in cases that are not Closed yet
  const unclosedFaults = cases.filter(c => c.status !== 'Closed').reduce((acc, c) => acc + (c.cmmsTickets?.length || 0), 0);
  
  const activeTasks = tasks.filter(t => t.status !== 'Closed').length;

  return (
    <>
      {/* Header bar */}
      <div className="dashboard-header-bar glass">
        <div className="header-title-sec">
          <h1>OPERATIONAL DASHBOARD</h1>
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
          {/* Summary counters grid (FRD 2.4.2) */}
          <div className="metrics-grid">
            <div className="metric-card glass incidents-reported">
              <div className="metric-info">
                <h3>Incidents Reported</h3>
                <div className="metric-value">{totalIncidents}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            
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

            <div className="metric-card glass faults-reported">
              <div className="metric-info">
                <h3>Faults Reported</h3>
                <div className="metric-value">{totalFaults}</div>
              </div>
              <div className="metric-icon">
                <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>

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
                <Link href="/cases" className="view-all-link">View All</Link>
              </div>
              <div className="active-cases-list">
                {cases.filter(c => c.status !== 'Closed').length === 0 ? (
                  <div className="empty-state">No active incidents or cases.</div>
                ) : (
                  cases
                    .filter(c => c.status !== 'Closed')
                    .slice(0, 5)
                    .map(c => (
                      <Link href={`/cases/${c.id}`} key={c.id} className="active-case-item">
                        <div className="active-case-info">
                          <span className="case-id">{c.id}</span>
                          <span className="case-title">{c.title}</span>
                          <span className="case-meta">
                            {c.incident?.type} &bull; {c.incident?.location.commonName || c.incident?.location.road}
                          </span>
                        </div>
                        <div className="active-case-status">
                          <span className={`badge ${
                            c.incident?.status === 'Live' ? 'badge-live' :
                            c.incident?.status === 'Live (Acknowledged)' ? 'badge-ack' :
                            c.incident?.status === 'Live (On-Site)' ? 'badge-onsite' :
                            c.incident?.status === 'Live (Completed)' ? 'badge-completed' :
                            c.incident?.status === 'Pending Review' ? 'badge-review' : 'badge-closed'
                          }`}>
                            {c.incident?.status || c.status}
                          </span>
                        </div>
                      </Link>
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
                <Link href="/tasks" className="view-all-link">Manage Tasks</Link>
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
                <Link href="/occurrences" className="view-all-link">Open Log</Link>
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

      <style jsx>{`
        .dashboard-header-bar {
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .header-title-sec h1 {
          font-family: var(--font-title);
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .header-title-sec p {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .header-status-sec {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
        }

        .live-pulse {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
          color: var(--color-accent);
          letter-spacing: 0.05em;
        }

        .pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-accent);
          box-shadow: 0 0 8px var(--color-accent);
          animation: pulse-animation 2s infinite;
        }

        @keyframes pulse-animation {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }

        .header-datetime {
          font-size: 12px;
          color: var(--text-muted);
        }

        .loading-container {
          padding: 60px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          font-family: var(--font-title);
          font-weight: 600;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255, 255, 255, 0.05);
          border-top-color: var(--color-primary);
          border-radius: 50%;
          animation: spin 1s infinite linear;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .text-danger { color: var(--color-danger); }
        .text-warning { color: var(--color-warning); }
        .text-success { color: var(--color-accent); }

        /* Dashboard Grid Layout */
        .dashboard-layout-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
        }

        .map-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }

        .card-header h2 {
          font-family: var(--font-title);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.05em;
        }

        .live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--color-danger);
          box-shadow: 0 0 8px var(--color-danger);
          animation: pulse-animation 1.5s infinite;
        }

        .map-wrapper {
          position: relative;
          height: 380px;
          border-radius: 8px;
          overflow: hidden;
        }

        .active-cases-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .view-all-link {
          font-size: 12px;
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 600;
        }

        .view-all-link:hover {
          text-decoration: underline;
        }

        .active-cases-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          flex-grow: 1;
          overflow-y: auto;
          max-height: 380px;
        }

        .active-case-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          text-decoration: none;
          transition: all 0.2s ease;
        }

        .active-case-item:hover {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.12);
          transform: translateX(2px);
        }

        .active-case-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .case-id {
          font-family: var(--font-title);
          font-size: 10px;
          font-weight: 700;
          color: var(--color-primary);
        }

        .case-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }

        .case-meta {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* Bottom split layout */
        .bottom-split-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }

        .split-card {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .split-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .split-list-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 12px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-color);
          border-radius: 8px;
        }

        .item-details {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-grow: 1;
          padding-right: 12px;
        }

        .item-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-main);
        }

        .item-desc {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .item-sub {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
        }

        .empty-state {
          padding: 30px;
          text-align: center;
          font-size: 13px;
          color: var(--text-muted);
          background: rgba(255, 255, 255, 0.01);
          border: 1px dashed var(--border-color);
          border-radius: 8px;
        }
      `}</style>
    </>
  );
}
