'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Active'         ? 'badge badge-onsite' :
    status === 'Pending Triage' ? 'badge badge-ack'    : 'badge badge-closed';
  return <span className={cls}>{status}</span>;
}

export default function CaseLogPage() {
  const { role } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => { fetchCases(); }, []);

  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) setCases(await res.json());
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = cases.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchSearch = c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
    const matchStatus = filterStatus === 'All' || c.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: cases.length,
    active: cases.filter(c => c.status === 'Active').length,
    triage: cases.filter(c => c.status === 'Pending Triage').length,
    closed: cases.filter(c => c.status === 'Closed').length,
  };

  return (
    <>
      {/* Page header */}
      <div className="page-header glass">
        <div className="page-header-left">
          <h1>Case Registry Log</h1>
          <p>Master index of all operational cases — Incidents, Tasks, and CMMS Tickets</p>
        </div>
        <div className="page-header-stats">
          <div className="stat-chip">
            <span className="stat-val">{stats.total}</span>
            <span className="stat-lbl">Total</span>
          </div>
          <div className="stat-chip stat-chip-active">
            <span className="stat-val">{stats.active}</span>
            <span className="stat-lbl">Active</span>
          </div>
          <div className="stat-chip stat-chip-warn">
            <span className="stat-val">{stats.triage}</span>
            <span className="stat-lbl">Triage</span>
          </div>
          <div className="stat-chip stat-chip-muted">
            <span className="stat-val">{stats.closed}</span>
            <span className="stat-lbl">Closed</span>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="filter-bar glass">
        <div className="filter-search">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" style={{ color: 'var(--text-faint)', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search Case ID or title…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="filter-search-input"
            id="case-search"
          />
        </div>
        <div className="filter-selects">
          <label htmlFor="status-filter" className="filter-label">Status:</label>
          <select
            id="status-filter"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="form-control"
            style={{ width: 'auto', height: '36px', fontSize: '13px', padding: '0 10px' }}
          >
            <option value="All">All Statuses</option>
            <option value="Pending Triage">Pending Triage</option>
            <option value="Active">Active</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <span>Loading case registry…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">No cases match the current filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Case Title</th>
                  <th>Status</th>
                  <th>Components</th>
                  <th>CMMS Tickets</th>
                  <th>Incident Status</th>
                  <th>Date Logged</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td>
                      <span className="mono-id">{c.id}</span>
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {c.incident && (
                          <span className="badge badge-live" style={{ fontSize: '10px' }}>Incident</span>
                        )}
                        {(c.cmmsTickets?.length ?? 0) > 0 && (
                          <span className="badge badge-ack" style={{ fontSize: '10px' }}>Fault ({c.cmmsTickets.length})</span>
                        )}
                        {!c.incident && (c.cmmsTickets?.length ?? 0) === 0 && (
                          <span className="badge badge-closed" style={{ fontSize: '10px' }}>General</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {(c.cmmsTickets?.length ?? 0) > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {c.cmmsTickets.slice(0, 2).map(t => (
                            <code key={t} style={{ fontSize: '11px', color: 'var(--color-info)', background: 'var(--color-info-bg)', padding: '1px 6px', borderRadius: 3 }}>{t}</code>
                          ))}
                          {c.cmmsTickets.length > 2 && (
                            <span style={{ fontSize: '10px', color: 'var(--text-faint)' }}>+{c.cmmsTickets.length - 2} more</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td>
                      {c.incident ? (
                        <span className={`badge ${
                          c.incident.status === 'Live'                ? 'badge-live'      :
                          c.incident.status === 'Live (Acknowledged)' ? 'badge-ack'       :
                          c.incident.status === 'Live (On-Site)'      ? 'badge-onsite'    :
                          c.incident.status === 'Live (Completed)'    ? 'badge-completed' :
                          c.incident.status === 'Pending Review'      ? 'badge-review'    : 'badge-closed'
                        }`}>
                          {c.incident.status}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                      {new Date(c.createdAt).toLocaleDateString('en-SG')}{' '}
                      {new Date(c.createdAt).toLocaleTimeString('en-SG', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .page-header {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .page-header-left h1 { font-size: 15px; font-weight: 700; }
        .page-header-left p  { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

        .page-header-stats {
          display: flex; gap: 10px;
        }
        .stat-chip {
          display: flex; flex-direction: column; align-items: center;
          padding: 6px 14px; border-radius: var(--radius-md);
          background: var(--bg-inset); border: 1px solid var(--border-color);
          min-width: 56px;
        }
        .stat-chip.stat-chip-active { border-color: var(--color-active-border); background: var(--color-active-bg); }
        .stat-chip.stat-chip-warn   { border-color: var(--color-high-border);   background: var(--color-high-bg); }
        .stat-chip.stat-chip-muted  { border-color: var(--border-color); }

        .stat-val { font-family: var(--font-mono); font-size: 18px; font-weight: 600; line-height: 1; color: var(--text-main); }
        .stat-lbl { font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }

        .filter-bar {
          padding: 12px 16px;
          display: flex; align-items: center; gap: 16px;
        }
        .filter-search {
          display: flex; align-items: center; gap: 8px;
          flex: 1; max-width: 400px;
          background: var(--bg-inset); border: 1px solid var(--border-color);
          border-radius: var(--radius-md); padding: 0 12px; height: 36px;
        }
        .filter-search-input {
          border: none; background: none; outline: none;
          font-family: var(--font-body); font-size: 13px; color: var(--text-main);
          width: 100%;
        }
        .filter-search-input::placeholder { color: var(--text-faint); }
        .filter-selects { display: flex; align-items: center; gap: 8px; margin-left: auto; }
        .filter-label   { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
      `}</style>
    </>
  );
}
