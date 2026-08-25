'use client';

// Tab 1 of the merged Broadcasts page — "Broadcasts" (record-centric log +
// worklist). Rewritten 2026-07-26 per BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md
// §6.4/§6.7: filter card copied structurally from CaseLogTab.tsx (status
// sub-tabs with count pills instead of the old 3 KPI cards — decisions D2/D10),
// server-side pagination/filtering (was client-filtered with no pagination at
// all), crisis level + recipient group + delivery result columns, and a drawer
// instead of the old inline detail panel that reflowed the table (gap U4).

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';
import {
  BroadcastRecordDTO, StatusBadge, TypeBadge, LevelDot, ChannelIcons, EditedTag,
  fmtRelative, fmtDateTime, deliverySummary, typeAccentColor,
} from '@/components/broadcasts/broadcastUi';
import { BroadcastDrawer } from '@/components/broadcasts/BroadcastDrawer';

const LEVELS_UI = ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'];
const TYPES_UI = ['End-of-Day', 'Closure', 'Manual', 'Weather Advisory'];

export function BroadcastRecordsTab() {
  const { role, username } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();

  const canView = hasBroadcastPermission(role, 'broadcast.view');
  const canCompose = hasBroadcastPermission(role, 'broadcast.compose');
  const canDispatch = hasBroadcastPermission(role, 'broadcast.dispatch');

  const [data, setData] = useState<BroadcastRecordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, totalPages: 1, totalItems: 0 });
  const [stats, setStats] = useState({ pending: 0, sent: 0, total: 0 });

  const [statusTab, setStatusTab] = useState<'PENDING' | 'SENT' | 'All'>('PENDING');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [levels, setLevels] = useState<string[]>([]);
  const [showLevelDropdown, setShowLevelDropdown] = useState(false);
  const [types, setTypes] = useState<string[]>(['Closure']);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  const levelDropdownRef = useRef<HTMLDivElement>(null);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);
  const [newForm, setNewForm] = useState({ type: 'Manual', caseId: '', incidentId: '', recipients: '', content: '', location: '' });

  const drawerId = searchParams.get('id');
  const setDrawerId = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set('id', id); else params.delete('id');
    router.replace(`/broadcasts?${params.toString()}`, { scroll: false });
  };

  // Remember the advanced-filter open state across visits (small nicety, mirrors
  // the "advanced grid closed by default, open/close state remembered via localStorage" note in §6.7).
  useEffect(() => {
    const saved = typeof window !== 'undefined' && localStorage.getItem('broadcasts_showAdvanced');
    if (saved) setShowAdvanced(saved === 'true');
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('broadcasts_showAdvanced', String(showAdvanced));
  }, [showAdvanced]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(e.target as Node)) {
        setShowLevelDropdown(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('paged', 'true');
      params.set('page', String(page));
      params.set('limit', String(pagination.limit));
      if (statusTab !== 'All') params.set('status', statusTab);
      if (debouncedSearch) params.set('search', debouncedSearch);
      // No dateBasis param — From/To now matches a broadcast CREATED or SENT/dispatched
      // within the window (server defaults to that OR-match when dateBasis is omitted).
      if (startDate) params.set('startDate', new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        params.set('endDate', end.toISOString());
      }
      if (levels.length > 0) params.set('level', levels.join(','));
      if (types.length > 0) params.set('type', types.join(','));

      const res = await fetch(`/api/broadcasts?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        setData(result.data || []);
        setPagination(result.pagination || { page: 1, limit: 25, totalPages: 1, totalItems: 0 });
        setStats(result.stats || { pending: 0, sent: 0, total: 0 });
      }
    } finally {
      setLoading(false);
    }
  }, [page, pagination.limit, statusTab, debouncedSearch, startDate, endDate, levels, types]);

  useEffect(() => { if (canView) load(); }, [canView, load]);

  const clearFilters = () => {
    setStartDate(''); setEndDate(''); setLevels([]); setTypes(['Closure']); setPage(1);
  };
  const hasActiveFilters = !!(startDate || endDate || levels.length || types.length !== 1 || types[0] !== 'Closure');

  const exportCsv = () => {
    const header = ['Broadcast ID', 'Type', 'Level', 'Case ID', 'Incident ID', 'Incident', 'Status', 'Recipient Count', 'Group', 'Channel', 'Template', 'Content Edited', 'Sent By', 'Created At', 'Sent At'];
    const rows = data.map((b) => [
      b.id, b.type, b.crisisLevel || '', b.caseId, b.incidentId, b.incidentTitle || '', b.status,
      String(b.recipients?.length ?? 0), (b.recipientGroups || []).join('; '), (b.channels || []).join('; '),
      b.templateUsed, b.contentEditConfirmed ? 'Yes' : 'No', b.dispatchedBy || b.sentBy || '',
      b.createdAt || '', b.dispatchedAt || b.sentAt || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `broadcasts-page${page}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const createManual = async () => {
    setBusy(true);
    setNewError(null);
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: newForm.caseId.trim() || undefined,
          incidentId: newForm.incidentId.trim() || undefined,
          type: newForm.type,
          recipients: newForm.recipients.split(',').map((s) => s.trim()).filter(Boolean),
          content: newForm.content,
          location: newForm.location,
          summary: newForm.content,
          user: username,
        }),
      });
      const created = await res.json();
      if (!res.ok) { setNewError(created.error || 'Creation failed.'); return; }
      setShowNew(false);
      setNewForm({ type: 'Manual', caseId: '', incidentId: '', recipients: '', content: '', location: '' });
      await load();
      setDrawerId(created.id);
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return (
      <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: 'var(--text-main)' }}>Access Restricted</div>
        <div style={{ fontSize: 13 }}>Your role ({role}) does not have access to the Broadcasts module.</div>
      </div>
    );
  }

  const startIdx = pagination.totalItems === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const endIdx = Math.min(pagination.page * pagination.limit, pagination.totalItems);

  return (
    <>
      {/* Filter card — structure copied from CaseLogTab.tsx (D12) */}
      <div className="glass" style={{ padding: 20, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([
              ['PENDING', 'Pending', stats.pending],
              ['SENT', 'Sent', stats.sent],
              ['All', 'All', stats.total],
            ] as const).map(([key, label, count]) => (
              <button
                key={key}
                onClick={() => { setStatusTab(key); setPage(1); }}
                className={`tab-btn ${statusTab === key ? 'active' : ''}`}
                style={{
                  background: 'transparent', border: 'none',
                  borderBottom: statusTab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
                  color: statusTab === key ? 'var(--color-primary)' : 'var(--text-muted)',
                  padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s ease',
                }}
              >
                {label}
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: statusTab === key ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                  color: statusTab === key ? 'var(--color-primary)' : 'var(--text-muted)',
                  padding: '2px 8px', borderRadius: 10, minWidth: 20, textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', flexGrow: 1, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`btn ${showAdvanced ? 'btn-info' : 'btn-secondary'}`}
              aria-label="Toggle filters"
              style={{ padding: '0 10px', height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)' }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
            <div style={{ position: 'relative', width: '100%', maxWidth: 300 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text" placeholder="Search broadcast ID, incident, case, recipient…"
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="form-control" style={{ width: '100%', paddingLeft: 36, height: 36, fontSize: 13 }}
              />
            </div>
            <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm">Export CSV</button>
            {canCompose && (
              <button type="button" onClick={() => setShowNew(true)} className="btn btn-primary" style={{ fontSize: 12.5, height: 36, padding: '0 14px', fontWeight: 600 }}>
                + New Broadcast
              </button>
            )}
          </div>
        </div>

        {showAdvanced && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, paddingTop: 4 }}>
            <FormGroup label="From (created or sent):">
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="form-control" style={{ height: 36 }} />
            </FormGroup>
            <FormGroup label="To (created or sent):">
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="form-control" style={{ height: 36 }} />
            </FormGroup>
            <div ref={levelDropdownRef} style={{ position: 'relative' }}>
              <FormGroup label="Crisis level:">
                <button type="button" onClick={() => { setShowLevelDropdown((v) => !v); setShowTypeDropdown(false); }} className="form-control"
                  style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', background: 'var(--bg-inset)' }}>
                  <span style={{ fontSize: 13, color: levels.length ? 'var(--text-main)' : 'var(--text-faint)' }}>
                    {levels.length ? levels.join(', ') : 'All Levels'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: showLevelDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {showLevelDropdown && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, minWidth: 160, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 0' }}>
                    {LEVELS_UI.map((lv) => (
                      <label key={lv} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox" checked={levels.includes(lv)}
                          onChange={(e) => {
                            setLevels((prev) => e.target.checked ? [...prev, lv] : prev.filter((x) => x !== lv));
                            setPage(1);
                          }}
                          style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }}
                        />
                        {lv}
                      </label>
                    ))}
                  </div>
                )}
              </FormGroup>
            </div>
            <div ref={typeDropdownRef} style={{ position: 'relative' }}>
              <FormGroup label="Type:">
                <button type="button" onClick={() => { setShowTypeDropdown((v) => !v); setShowLevelDropdown(false); }} className="form-control"
                  style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left', background: 'var(--bg-inset)' }}>
                  <span style={{ fontSize: 13, color: types.length ? 'var(--text-main)' : 'var(--text-faint)' }}>
                    {types.length ? types.join(', ') : 'All Types'}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, transform: showTypeDropdown ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {showTypeDropdown && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50, minWidth: 200, background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '6px 0' }}>
                    {TYPES_UI.map((tp) => (
                      <label key={tp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', fontSize: 13, cursor: 'pointer' }}>
                        <input
                          type="checkbox" checked={types.includes(tp)}
                          onChange={(e) => {
                            setTypes((prev) => e.target.checked ? [...prev, tp] : prev.filter((x) => x !== tp));
                            setPage(1);
                          }}
                          style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }}
                        />
                        {tp}
                      </label>
                    ))}
                  </div>
                )}
              </FormGroup>
            </div>
            {hasActiveFilters && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={clearFilters} className="btn btn-secondary" style={{ padding: '0 12px', fontSize: 12.5, height: 34, border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="glass" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="loading-container" style={{ padding: 40 }}>
            <div className="spinner" />
            <span>Loading broadcast records…</span>
          </div>
        ) : data.length === 0 ? (
          <div className="empty-state" style={{ padding: 60, textAlign: 'center', color: 'var(--text-faint)' }}>
            {hasActiveFilters || debouncedSearch ? 'No broadcasts match the current filters.' : 'No broadcasts yet.'}
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th style={{ width: 4, padding: 0 }}></th>
                    <th style={{ width: 200 }}>Broadcast ID</th>
                    <th style={{ width: 110 }}>Type</th>
                    <th style={{ width: 64, textAlign: 'center' }}>Level</th>
                    <th style={{ minWidth: 180 }}>Incident / Case</th>
                    <th style={{ width: 320 }}>Recipients</th>
                    <th style={{ width: 70, textAlign: 'center' }}>Channel</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th style={{ width: 100, textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((b) => {
                    const delivery = deliverySummary(b);
                    return (
                      <tr key={b.id} onClick={() => setDrawerId(b.id)} style={{ cursor: 'pointer' }}>
                        <td style={{ padding: 0 }}><span style={{ display: 'block', width: 4, minHeight: 54, background: typeAccentColor(b.type) }} /></td>
                        <td>
                          <span className="mono-id">{b.id}</span>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {b.status === 'PENDING' ? `created ${fmtRelative(b.createdAt)}` : `sent ${fmtDateTime(b.dispatchedAt || b.sentAt)}`}
                            {' · '}{b.queuedBy || b.sentBy}
                            <EditedTag bc={b} />
                          </div>
                        </td>
                        <td><TypeBadge type={b.type} /></td>
                        <td style={{ textAlign: 'center' }}><LevelDot level={b.crisisLevel} /></td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{b.incidentTitle || <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>No case attached</span>}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{b.incidentId || b.caseId || '—'}{b.incidentType ? ` · ${b.incidentType}` : ''}</div>
                        </td>
                        <td>
                          {b.resolutionWarning ? (
                            <>
                              <span className="badge badge-live" style={{ textTransform: 'none', letterSpacing: 0 }}>⚠ 0 recipients</span>
                              <div style={{ fontSize: 11, color: 'var(--color-critical)', marginTop: 4 }}>no rule matched</div>
                            </>
                          ) : (
                            <>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{b.recipients?.length ?? 0} recipient{(b.recipients?.length ?? 0) === 1 ? '' : 's'}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{b.recipientGroups?.join(', ') || '—'}</div>
                            </>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}><ChannelIcons channels={b.channels} /></td>
                        <td>
                          <StatusBadge bc={b} />
                          {delivery && (
                            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 700, color: delivery.bad ? 'var(--color-critical)' : 'var(--color-active)' }}>
                              {delivery.text}
                            </div>
                          )}
                          {b.status === 'PENDING' && !b.resolutionWarning && (
                            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>waiting {fmtRelative(b.createdAt)}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          {b.status === 'PENDING' && canDispatch && !b.resolutionWarning && (
                            <button type="button" onClick={() => setDrawerId(b.id)} className="btn btn-secondary btn-sm">Review →</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Showing <b>{startIdx}</b>–<b>{endIdx}</b> of <b>{pagination.totalItems}</b> records · sorted: <b>{statusTab === 'All' ? 'Pending first' : 'Newest first'}</b>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ height: 28, padding: '0 8px', fontSize: 12 }}>‹</button>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>Page {pagination.page} / {pagination.totalPages}</span>
                <button type="button" className="btn btn-secondary" onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))} disabled={page === pagination.totalPages} style={{ height: 28, padding: '0 8px', fontSize: 12 }}>›</button>
              </div>
            </div>
          </>
        )}
      </div>

      <BroadcastDrawer
        id={drawerId}
        role={role}
        username={username}
        canDispatch={canDispatch}
        onClose={() => setDrawerId(null)}
        onChanged={load}
      />

      {showNew && (
        <div className="modal-overlay" onClick={() => { setShowNew(false); setNewError(null); }}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 17, fontWeight: 700, color: 'var(--text-main)', marginBottom: 4 }}>New Broadcast</h2>
            <p className="sub-desc" style={{ marginBottom: 18 }}>
              Manually create a broadcast for a confirmed operational need (FSD §10.1d). Created as PENDING for review &amp; dispatch.
            </p>
            {newError && (
              <div style={{ background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', color: '#991B1B', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 12.5, marginBottom: 14 }}>
                {newError}
              </div>
            )}
            <div className="form-group">
              <label>Type</label>
              <select value={newForm.type} onChange={(e) => setNewForm({ ...newForm, type: e.target.value })} className="form-control select-dark">
                <option>Manual</option>
                <option>Weather Advisory</option>
              </select>
            </div>
            {newForm.type === 'Weather Advisory' ? (
              <div className="form-group">
                <label>Affected area</label>
                <input value={newForm.location} onChange={(e) => setNewForm({ ...newForm, location: e.target.value })} className="form-control" placeholder="e.g. Whole of Sentosa Island" />
              </div>
            ) : (
              <>
                <div className="form-group">
                  <label>Case ID (optional)</label>
                  <input value={newForm.caseId} onChange={(e) => setNewForm({ ...newForm, caseId: e.target.value })} className="form-control" placeholder="SEN/CI/20260722/001" />
                </div>
                <div className="form-group">
                  <label>Incident ID (optional)</label>
                  <input value={newForm.incidentId} onChange={(e) => setNewForm({ ...newForm, incidentId: e.target.value })} className="form-control" />
                </div>
              </>
            )}
            <div className="form-group">
              <label>Recipients (comma-separated emails — leave blank to auto-fill from the Broadcast Matrix for Weather Advisory)</label>
              <textarea value={newForm.recipients} onChange={(e) => setNewForm({ ...newForm, recipients: e.target.value })} rows={2} className="form-control" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>{newForm.type === 'Weather Advisory' ? 'Advisory content' : 'Content'}</label>
              <textarea value={newForm.content} onChange={(e) => setNewForm({ ...newForm, content: e.target.value })} rows={6} className="form-control" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => { setShowNew(false); setNewError(null); }} disabled={busy} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={createManual} disabled={busy} className="btn btn-primary">{busy ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FormGroup({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="form-group" style={{ margin: 0, ...style }}>
      <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>{label}</label>
      {children}
    </div>
  );
}
