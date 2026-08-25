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

export function CaseLogTab() {
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
  const [activeTab, setActiveTab] = useState<'All' | 'Active'>('Active');
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
  const [showLinkedDropdown, setShowLinkedDropdown] = useState(false);

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
  }, [page, limit, sortBy, sortOrder, filterStatus, startDate, endDate, createdBy, hasIncident, hasTasks, hasFaults, hasEDiary, debouncedSearch, activeTab]);

  const fetchCases = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', limit.toString());
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);
      
      if (debouncedSearch) params.append('search', debouncedSearch);
      if (activeTab === 'Active') {
        if (filterStatus === 'All') {
          params.append('status', 'Active,Pending Triage,No Action Required');
        } else {
          params.append('status', filterStatus);
        }
      } else {
        if (filterStatus !== 'All') {
          params.append('status', filterStatus);
        }
      }
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
    setShowLinkedDropdown(false);
    setActiveTab('Active');
    setPage(1);
  };

  const handleCreateCase = () => {
    window.location.href = '/cases/new';
  };

  const startIdx = (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, totalItems);

  return (
    <>
      {/* Filter panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)' }}>

        {/* Main Filters Row: Left (Tabs) & Right (Search & Filters button) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          
          {/* Left Side: Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => { setActiveTab('Active'); setPage(1); }}
              className={`tab-btn ${activeTab === 'Active' ? 'active' : ''}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'Active' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'Active' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              Active Cases
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: activeTab === 'Active' ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                color: activeTab === 'Active' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center'
              }}>
                {stats.active}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab('All'); setPage(1); }}
              className={`tab-btn ${activeTab === 'All' ? 'active' : ''}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'All' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'All' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              All Cases
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: activeTab === 'All' ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                color: activeTab === 'All' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center'
              }}>
                {stats.total}
              </span>
            </button>
          </div>

          {/* Right Side: Search & Filter toggle */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1, justifyContent: 'flex-end' }}>

            {/* Filters toggle — icon only, left of search */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`btn ${showAdvanced ? 'btn-info' : 'btn-secondary'}`}
              aria-label="Toggle filters"
              style={{ padding: '0 10px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)' }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>

            {/* Search Input with Magnifying Glass SVG */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search case ID, title, status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-control"
                style={{ width: '100%', paddingLeft: '36px', height: '36px', fontSize: '13px' }}
              />
            </div>

            {(['Controller', 'Duty Officer', 'Duty Manager', 'System Administrator', 'Current Ops Administrator'].includes(role)) && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateCase}
                style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', fontWeight: 600 }}
              >
                + Create Case
              </button>
            )}

          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvanced && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', paddingTop: '4px' }}>
            
            {/* Status */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Status:</label>
              <select
                value={filterStatus}
                onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                className="form-control select-dark"
                style={{ width: '100%' }}
              >
                <option value="All">All Statuses</option>
                <option value="Pending Triage">Pending Triage</option>
                <option value="Active">Active</option>
                <option value="No Action Required">No Action Required</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {/* Created By */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Created By:</label>
              <input
                type="text"
                placeholder="Creator name..."
                value={createdBy}
                onChange={e => { setCreatedBy(e.target.value); setPage(1); }}
                className="form-control"
                style={{ width: '100%', height: '36px' }}
              />
            </div>

            {/* Date From */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date From:</label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); setPage(1); }}
                className="form-control"
                style={{ width: '100%', height: '36px' }}
              />
            </div>

            {/* Date To */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date To:</label>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); setPage(1); }}
                className="form-control"
                style={{ width: '100%', height: '36px' }}
              />
            </div>

            {/* Linked Records dropdown */}
            <div className="form-group" style={{ margin: 0, position: 'relative' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Linked Records:</label>
              <button
                type="button"
                onClick={() => setShowLinkedDropdown(v => !v)}
                className="form-control"
                style={{ width: '100%', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', background: 'var(--bg-inset)' }}
              >
                <span style={{ fontSize: '13px', color: [hasIncident, hasTasks, hasFaults, hasEDiary].some(Boolean) ? 'var(--text-main)' : 'var(--text-faint)' }}>
                  {[hasIncident && 'Incident', hasTasks && 'Tasks', hasFaults && 'Faults', hasEDiary && 'e-Diary'].filter(Boolean).join(', ') || 'All Types'}
                </span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: showLinkedDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              
              {showLinkedDropdown && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, minWidth: '160px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 0' }}>
                  {[
                    { label: 'Incident', checked: hasIncident, set: setHasIncident },
                    { label: 'Tasks',    checked: hasTasks,    set: setHasTasks    },
                    { label: 'Faults',   checked: hasFaults,   set: setHasFaults   },
                    { label: 'e-Diary',  checked: hasEDiary,   set: setHasEDiary   },
                  ].map(({ label, checked, set }) => (
                    <label
                      key={label}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 14px', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-inset)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => { set(e.target.checked); setPage(1); }}
                        style={{ accentColor: 'var(--color-accent)', width: '14px', height: '14px' }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}
            </div>


            {/* Clear Filters — inside panel */}
            {(searchTerm || filterStatus !== 'All' || startDate || endDate || createdBy || hasIncident || hasTasks || hasFaults || hasEDiary || activeTab !== 'Active') && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleResetFilters}
                  className="btn btn-secondary"
                  style={{ padding: '0 12px', fontSize: '12.5px', height: '34px', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  Clear Filters
                </button>
              </div>
            )}
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
                    <th onClick={() => handleSort('createdAt')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Date Logged {sortBy === 'createdAt' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
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
                    <th onClick={() => handleSort('closedAt')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Closed At {sortBy === 'closedAt' && (sortOrder === 'asc' ? '▲' : '▼')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`} style={{ cursor: 'pointer' }}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(c.createdAt).toLocaleDateString('en-SG')}{' '}
                        {new Date(c.createdAt).toLocaleTimeString('en-SG', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </td>
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
                          {((c.faultCount ?? c.cmmsTickets?.length ?? 0) > 0) && (
                            <span className="badge badge-ack" style={{ fontSize: '10px' }}>
                              🛠 Fault ({c.faultCount ?? c.cmmsTickets?.length ?? 0})
                            </span>
                          )}
                          {((c.taskCount ?? 0) > 0) && (
                            <span className="badge badge-onsite" style={{ fontSize: '10px' }}>
                              🔧 Task ({c.taskCount})
                            </span>
                          )}
                          {((c.occurrenceCount ?? 0) > 0) && (
                            <span className="badge badge-incomplete" style={{ fontSize: '10px' }}>
                              📝 e-Diary ({c.occurrenceCount})
                            </span>
                          )}
                          {!c.incident &&
                           !(c.faultCount ?? c.cmmsTickets?.length ?? 0) &&
                           !(c.taskCount ?? 0) &&
                           !(c.occurrenceCount ?? 0) && (
                            <span style={{ color: 'var(--text-faint)' }}>—</span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {c.createdBy}
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
        .filter-label   { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }
      `}</style>
    </>
  );
}
