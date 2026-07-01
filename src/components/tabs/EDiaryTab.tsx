'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Occurrence } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// Roles allowed to access e-Diary per FRD §8.3
const ALLOWED_ROLES = ['Controller', 'Duty Officer', 'Duty Manager', 'System Administrator', 'Current Ops Administrator'];

// Predefined occurrence topics
const TOPICS = [
  'VIP Visit Advisory',
  'Dignitary Visit Notification',
  'Routine Siren Testing',
  'Ranger Shift Handover',
  'General Public Interaction',
  'Coordinated Drill / Exercise',
  'Information Dissemination',
  'Lost and Found Report',
  'Contractor Access Granted',
  'Others',
];

const ITEMS_PER_PAGE = 10;

export function EDiaryTab() {
  const { role, username } = useRole();
  const router = useRouter();

  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm]   = useState('');
  const [userFilter, setUserFilter]   = useState('All');
  const [dateStart, setDateStart]     = useState('');
  const [dateEnd, setDateEnd]         = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Create entry states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [topic, setTopic]       = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [content, setContent]   = useState('');
  const [dateTime, setDateTime] = useState('');
  const [caseIdInput, setCaseIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Escalate to Incident
  const [escalatingEntry, setEscalatingEntry] = useState<Occurrence | null>(null);

  const canEdit = ALLOWED_ROLES.includes(role);

  const fetchOccurrences = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateStart) params.set('dateStart', dateStart);
      if (dateEnd)   params.set('dateEnd', dateEnd);
      if (userFilter !== 'All') params.set('user', userFilter);
      const res = await fetch(`/api/occurrences${params.size ? '?' + params.toString() : ''}`);
      if (res.ok) setOccurrences(await res.json());
    } catch (err) {
      console.error('Error fetching occurrences:', err);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, userFilter]);

  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateStart, dateEnd, userFilter]);

  // Guard: roles without access see nothing
  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '13px' }}>The e-Diary module is accessible to Controllers, Duty Officers, Duty Managers, Current Ops Administrators, and System Administrators only.</div>
      </div>
    );
  }

  const uniqueUsers = Array.from(new Set(occurrences.map(o => o.user)));

  const filtered = occurrences.filter(o => {
    const q = searchTerm.toLowerCase();
    return o.topic.toLowerCase().includes(q) || o.content.toLowerCase().includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const resetFilters = () => {
    setSearchTerm('');
    setDateStart('');
    setDateEnd('');
    setUserFilter('All');
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTopic = topic === 'Others' ? customTopic.trim() : topic;
    if (!finalTopic || !content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/occurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          topic: finalTopic,
          content: content.trim(),
          dateTime: dateTime ? new Date(dateTime).toISOString() : undefined,
          caseId: caseIdInput.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setTopic(''); setCustomTopic(''); setContent(''); setDateTime(''); setCaseIdInput('');
        await fetchOccurrences();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Escalate to Incident ─────────────────────────────────────────────────────
  const handleEscalate = () => {
    if (!escalatingEntry) return;
    // Navigate to new incident page pre-filled via query params
    const params = new URLSearchParams({
      caseId: escalatingEntry.caseId || '',
      fromEDiary: escalatingEntry.id,
      summary: `Escalated from e-Diary entry ${escalatingEntry.id}: ${escalatingEntry.topic}`,
    });
    router.push(`/incidents/new?${params.toString()}`);
  };

  const filtersActive = !!(searchTerm || dateStart || dateEnd || userFilter !== 'All');

  return (
    <>
      {/* Filter panel — matches Case Log / Incident Log / Fault Log / Task Board pattern */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>

          {/* Left: entry count */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <span
              className="tab-btn active"
              style={{
                background: 'transparent',
                borderBottom: '2px solid var(--color-primary)',
                color: 'var(--color-primary)',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              All Entries
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: 'var(--color-primary-bg)',
                color: 'var(--color-primary)',
                padding: '2px 8px',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center',
              }}>
                {occurrences.length}
              </span>
            </span>
          </div>

          {/* Right: filter toggle, search, new entry */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1, justifyContent: 'flex-end' }}>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`btn ${showAdvancedFilters ? 'btn-info' : 'btn-secondary'}`}
              aria-label="Toggle filters"
              style={{ padding: '0 10px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)' }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>

            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search topic or content…"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="form-control"
                style={{ width: '100%', paddingLeft: '36px', height: '36px', fontSize: '13px' }}
              />
            </div>

            {canEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateForm(true)}
                style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 600 }}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                NEW ENTRY
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvancedFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', paddingTop: '4px' }}>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date From:</label>
              <input type="date" value={dateStart} max={dateEnd || undefined}
                onChange={e => setDateStart(e.target.value)} className="form-control" style={{ width: '100%', height: '36px' }} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date To:</label>
              <input type="date" value={dateEnd} min={dateStart || undefined}
                onChange={e => setDateEnd(e.target.value)} className="form-control" style={{ width: '100%', height: '36px' }} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Logged By:</label>
              <select value={userFilter} onChange={e => setUserFilter(e.target.value)} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Operators</option>
                {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {filtersActive && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={resetFilters}
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
      <div className="glass" style={{ marginTop: '20px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loading ? (
          <div className="loading-container" style={{ padding: '40px' }}>
            <div className="spinner" />
            <span>Loading diary entries…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ padding: '60px', textAlign: 'center' }}>
            No entries found matching your filters.
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Occurrence ID</th>
                    <th>Date &amp; Time</th>
                    <th>Topic</th>
                    <th>Narrative</th>
                    <th>Logged By</th>
                    <th>Linked Case</th>
                    {canEdit && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(o => (
                    <tr
                      key={o.id}
                      onClick={() => { if (o.caseId) window.location.href = `/cases/${o.caseId}`; }}
                      style={{ cursor: o.caseId ? 'pointer' : 'default' }}
                    >
                      <td><span className="mono-id">{o.id}</span></td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(o.dateTime).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                        {new Date(o.dateTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{o.topic}</td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-sub)' }} title={o.content}>
                        {o.content}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{o.user}</td>
                      <td>
                        {o.caseId ? <span className="mono-id">{o.caseId}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      {canEdit && (
                        <td onClick={e => e.stopPropagation()}>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)', whiteSpace: 'nowrap' }}
                            onClick={() => setEscalatingEntry(o)}
                          >
                            🔺 Escalate
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Showing <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{startIndex + 1}</span> to <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)}</span> of <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{filtered.length}</span> entries
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  style={{ height: '28px', padding: '0 8px', fontSize: '12px', minWidth: '40px' }}
                >
                  Prev
                </button>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  style={{ height: '28px', padding: '0 8px', fontSize: '12px', minWidth: '40px' }}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Immutability note */}
      <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-sub)' }}>FRD §8.2 —</strong> Once submitted, an entry is immutable and cannot be edited or deleted. To correct a mistake, log a new entry referencing this Occurrence ID.
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────────── */}
      {showCreateForm && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>NEW E-DIARY ENTRY</h2>
              <button className="close-btn" onClick={() => setShowCreateForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-form">
              <div className="modal-scroll-area">

                <div className="form-group">
                  <label>Topic / Subject *</label>
                  <select value={topic} onChange={e => setTopic(e.target.value)} required className="form-control select-dark">
                    <option value="">— Select topic —</option>
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {topic === 'Others' && (
                  <div className="form-group">
                    <label>Custom Topic *</label>
                    <input type="text" placeholder="e.g. Unusual weather advisory"
                      value={customTopic} onChange={e => setCustomTopic(e.target.value)}
                      required className="form-control" />
                  </div>
                )}

                <div className="form-group">
                  <label>Date &amp; Time of Occurrence</label>
                  <input type="datetime-local" value={dateTime}
                    onChange={e => setDateTime(e.target.value)} className="form-control" />
                  <p className="sub-desc">Defaults to now. Backdating is permitted.</p>
                </div>

                <div className="form-group">
                  <label>Link to Existing Case ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input type="text" placeholder="e.g. SEN/CI/20260621/001 — leave blank to auto-create"
                    value={caseIdInput} onChange={e => setCaseIdInput(e.target.value)} className="form-control" />
                  <p className="sub-desc">If left blank, a Case will be auto-created and linked to this entry.</p>
                </div>

                <div className="form-group">
                  <label>Narrative *</label>
                  <textarea placeholder="Describe the occurrence, interaction, or advisory…"
                    value={content} onChange={e => setContent(e.target.value)}
                    required className="form-control" rows={5} />
                </div>

              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'SUBMIT ENTRY'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Escalate Confirm Modal ──────────────────────────────────────────────── */}
      {escalatingEntry && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>ESCALATE TO INCIDENT</h2>
              <button className="close-btn" onClick={() => setEscalatingEntry(null)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="modal-scroll-area">
                <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  You are about to create a new <strong>Incident</strong> within the same Case as this e-Diary entry.
                </p>
                <div style={{ margin: '12px 0', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>e-Diary Entry</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{escalatingEntry.id} · {escalatingEntry.topic}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Case: {escalatingEntry.caseId || 'auto-assign'}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  The e-Diary entry will be <strong>retained</strong> as a journal record. The new Incident will be linked to the same Case.
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleEscalate} style={{ background: '#EF4444', borderColor: '#EF4444' }}>
                  🔺 CREATE INCIDENT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
