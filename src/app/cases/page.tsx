'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'Active'             ? 'badge badge-onsite' :
    status === 'Pending Triage'     ? 'badge badge-review' :
    status === 'No Action Required' ? 'badge badge-ack'    : 'badge badge-closed';
  return <span className={cls}>{status}</span>;
}

export default function CaseLogPage() {
  const { role, username } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Sorting State
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filter States
  const [filterStatus, setFilterStatus] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  
  // Linked Record Filters
  const [hasIncident, setHasIncident] = useState(false);
  const [hasTasks, setHasTasks] = useState(false);
  const [hasFaults, setHasFaults] = useState(false);
  const [hasEDiary, setHasEDiary] = useState(false);

  // Advanced Filters toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Global stats metadata
  const [stats, setStats] = useState({ total: 0, active: 0, triage: 0, closed: 0 });

  // Debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1); // Reset page to 1 on new search
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // Fetch Cases when filters, sort, page, or limit changes
  useEffect(() => {
    fetchCases();
  }, [page, limit, sortBy, sortOrder, filterStatus, startDate, endDate, createdBy, hasIncident, hasTasks, hasFaults, hasEDiary, debouncedSearch]);

  const fetchCases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (filterStatus !== 'All') params.append('status', filterStatus);
      if (startDate) params.append('startDate', new Date(startDate).toISOString());
      if (endDate) {
        // Include the whole end day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.append('endDate', end.toISOString());
      }
      if (createdBy) params.append('createdBy', createdBy);
      if (hasIncident) params.append('hasIncident', 'true');
      if (hasTasks) params.append('hasTasks', 'true');
      if (hasFaults) params.append('hasFaults', 'true');
      if (hasEDiary) params.append('hasEDiary', 'true');

      const res = await fetch(`/api/cases?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setCases(result.data || []);
        setTotalPages(result.pagination?.totalPages || 1);
        setTotalItems(result.pagination?.totalItems || 0);
        if (result.stats) {
          setStats(result.stats);
        }
      }
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1); // Reset page on sort change
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilterStatus('All');
    setStartDate('');
    setEndDate('');
    setCreatedBy('');
    setHasIncident(false);
    setHasTasks(false);
    setHasFaults(false);
    setHasEDiary(false);
    setPage(1);
  };

  const handleCreateCase = () => {
    window.location.href = '/cases/new';
  };

  const startIdx = (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, totalItems);

  return (
    <>
      {/* Page header */}
      <div className="page-header glass">
        <div className="page-header-left">
          <h1>Case Registry Log</h1>
          <p>Master index of all operational cases — Incidents, Tasks, e-Diary occurrences, and Faults</p>
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
      <div className="filter-bar glass" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div className="filter-search" style={{ flex: '1', minWidth: '280px' }}>
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
          <div className="filter-selects" style={{ marginLeft: '0' }}>
            <label htmlFor="status-filter" className="filter-label">Status:</label>
            <select
              id="status-filter"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="form-control"
              style={{ width: '160px', height: '36px', fontSize: '13px', padding: '0 10px' }}
            >
              <option value="All">All Statuses</option>
              <option value="Pending Triage">Pending Triage</option>
              <option value="Active">Active</option>
              <option value="No Action Required">No Action Required</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ fontSize: '12px', height: '36px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            {showAdvanced ? 'Hide Filters' : 'Advanced Filters'}
          </button>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleResetFilters}
            style={{ fontSize: '12px', height: '36px' }}
          >
            Reset
          </button>
          
          {(role === 'Controller' || role === 'Duty Officer' || role === 'Duty Manager' || role === 'System Administrator') && (
            <button 
              type="button" 
              className="btn btn-primary"
              onClick={handleCreateCase}
              style={{ fontSize: '12px', height: '36px', marginLeft: 'auto' }}
            >
              + Create Case
            </button>
          )}
        </div>

        {/* Advanced Filters Panel */}
        {showAdvanced && (
          <div className="advanced-filters-panel" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '4px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              <div>
                <label className="filter-label" style={{ display: 'block', marginBottom: '4px' }}>Start Date</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => { setStartDate(e.target.value); setPage(1); }}
                  className="form-control" 
                  style={{ width: '100%', height: '36px' }}
                />
              </div>
              <div>
                <label className="filter-label" style={{ display: 'block', marginBottom: '4px' }}>End Date</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => { setEndDate(e.target.value); setPage(1); }}
                  className="form-control" 
                  style={{ width: '100%', height: '36px' }}
                />
              </div>
              <div>
                <label className="filter-label" style={{ display: 'block', marginBottom: '4px' }}>Created By</label>
                <input 
                  type="text" 
                  placeholder="Creator name..." 
                  value={createdBy} 
                  onChange={e => { setCreatedBy(e.target.value); setPage(1); }}
                  className="form-control" 
                  style={{ width: '100%', height: '36px', padding: '0 10px', fontSize: '13px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '6px' }}>
                <span className="filter-label" style={{ display: 'block', marginBottom: '2px' }}>Contains Linked Records:</span>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hasIncident} onChange={e => { setHasIncident(e.target.checked); setPage(1); }} />
                    Incident
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hasTasks} onChange={e => { setHasTasks(e.target.checked); setPage(1); }} />
                    Tasks
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hasFaults} onChange={e => { setHasFaults(e.target.checked); setPage(1); }} />
                    Faults
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={hasEDiary} onChange={e => { setHasEDiary(e.target.checked); setPage(1); }} />
                    e-Diary
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Table & Content */}
      <div className="glass" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="loading-container" style={{ padding: '40px' }}>
            <div className="spinner" />
            <span>Loading case registry…</span>
          </div>
        ) : cases.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-faint)' }}>
            No cases match the current filters or search query.
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('id')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Case ID {sortBy === 'id' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => handleSort('title')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Case Title {sortBy === 'title' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => handleSort('status')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Status {sortBy === 'status' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th>Linked Items</th>
                    <th onClick={() => handleSort('createdBy')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Created By {sortBy === 'createdBy' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Date Logged {sortBy === 'createdAt' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                    <th onClick={() => handleSort('closedAt')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Closed At {sortBy === 'closedAt' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`} style={{ cursor: 'pointer' }}>
                      <td>
                        <span className="mono-id">{c.id}</span>
                      </td>
                      <td style={{ fontWeight: 600, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.title}
                      </td>
                      <td><StatusBadge status={c.status} /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {c.incident && (
                            <span className="badge badge-live" style={{ fontSize: '10px' }} title={c.incident.title}>🚨 Incident</span>
                          )}
                          {(c.cmmsTickets?.length ?? 0) > 0 && (
                            <span className="badge badge-ack" style={{ fontSize: '10px' }}>🔧 Fault ({c.cmmsTickets.length})</span>
                          )}
                          {/* Checked elements for tasks and occurrences via state flags or subjoins in data */}
                          <span className="badge-elements-summary"></span>
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {c.createdBy}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(c.createdAt).toLocaleDateString('en-SG')}{' '}
                        {new Date(c.createdAt).toLocaleTimeString('en-SG', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {c.closedAt ? (
                          <>
                            {new Date(c.closedAt).toLocaleDateString('en-SG')}{' '}
                            {new Date(c.closedAt).toLocaleTimeString('en-SG', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-faint)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Showing <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{startIdx}</span> to <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{endIdx}</span> of <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{totalItems}</span> cases
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Show:</span>
                  <select
                    value={limit}
                    onChange={e => { setLimit(parseInt(e.target.value, 10)); setPage(1); }}
                    className="form-control"
                    style={{ width: '70px', height: '28px', padding: '0 4px', fontSize: '12px' }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    style={{ height: '28px', padding: '0 8px', fontSize: '12px', minWidth: '40px' }}
                  >
                    Prev
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    style={{ height: '28px', padding: '0 8px', fontSize: '12px', minWidth: '40px' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </>
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
