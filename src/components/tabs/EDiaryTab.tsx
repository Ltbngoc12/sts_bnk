'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Case, Occurrence, EventRecord } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import EventCreateModal from '@/components/EventCreateModal';

// Roles allowed to access e-Diary per FRD §8.3
const ALLOWED_ROLES = ['Controller', 'Duty Officer', 'Duty Manager', 'System Administrator', 'Current Ops Administrator'];

// Predefined occurrence topics
export const TOPICS = [
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


  // Filters
  const [searchTerm, setSearchTerm]   = useState('');
  const [topicFilter, setTopicFilter] = useState('All');
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

  // Link to Existing Case — searchable dropdown (mirrors the Task Board's case selector)
  const [cases, setCases] = useState<Case[]>([]);
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const [caseSearchText, setCaseSearchText] = useState('');

  // Escalate to Incident
  const [escalatingEntry, setEscalatingEntry] = useState<Occurrence | null>(null);

  // Create or Link Event — FRD §9.1.3
  const [eventLinkingEntry, setEventLinkingEntry] = useState<Occurrence | null>(null);
  const [showEventCreateModal, setShowEventCreateModal] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventSearchText, setEventSearchText] = useState('');
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);

  const canEdit = ALLOWED_ROLES.includes(role);

  const fetchOccurrences = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateStart) params.set('dateStart', dateStart);
      if (dateEnd)   params.set('dateEnd', dateEnd);
      if (topicFilter !== 'All') params.set('topic', topicFilter);
      const res = await fetch(`/api/occurrences${params.size ? '?' + params.toString() : ''}`);
      if (res.ok) setOccurrences(await res.json());
    } catch (err) {
      console.error('Error fetching occurrences:', err);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, topicFilter]);

  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, dateStart, dateEnd, topicFilter]);

  useEffect(() => {
    fetch('/api/cases')
      .then(res => res.ok ? res.json() : [])
      .then(setCases)
      .catch(err => console.error('Error fetching cases:', err));
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    }
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

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
    setTopicFilter('All');
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
        setCaseSearchText(''); setShowCaseDropdown(false);
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

  // ── Link Existing Event — FRD §9.1.3(a)/(c) ─────────────────────────────────
  const handleLinkExistingEvent = async () => {
    if (!eventLinkingEntry || !linkingEventId) return;
    try {
      const res = await fetch(`/api/events/${linkingEventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceEDiaryId: eventLinkingEntry.id }),
      });
      if (res.ok) {
        setEventLinkingEntry(null);
        setLinkingEventId(null);
        setEventSearchText('');
        await fetchEvents();
      } else {
        const err = await res.json();
        alert(`Failed to link event: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to link event:', err);
    }
  };


  return (
    <>
      {/* Filter panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Search Entries:</label>
            <input
              type="text"
              placeholder="Search topic or content…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ width: '100%' }}
            />
          </div>

          {/* Date From */}
          <div style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Date From:</label>
            <input type="date" value={dateStart} max={dateEnd || undefined}
              onChange={e => setDateStart(e.target.value)} className="form-control" style={{ width: '100%', height: '36px' }} />
          </div>

          {/* Date To */}
          <div style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Date To:</label>
            <input type="date" value={dateEnd} min={dateStart || undefined}
              onChange={e => setDateEnd(e.target.value)} className="form-control" style={{ width: '100%', height: '36px' }} />
          </div>

          {/* Topic / Subject */}
          <div style={{ flex: '0 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Topic / Subject:</label>
            <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)} className="form-control select-dark" style={{ width: '100%', height: '36px' }}>
              <option value="All">All Topics</option>
              {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Clear + Create */}
          <div style={{ display: 'flex', gap: '10px', height: '36px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={resetFilters}
              className="btn btn-secondary"
              style={{ padding: '0 10px', fontSize: '12px', height: '100%', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}
            >
              Clear
            </button>
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
      </div>

      {/* Immutability note */}
      <div style={{ marginTop: 10, padding: '6px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text-sub)' }}>FRD §8.2 —</strong> Once submitted, an entry is immutable and cannot be edited or deleted. To correct a mistake, log a new entry referencing this Occurrence ID.
      </div>

      {/* Table & Content */}
      <div className="glass" style={{ marginTop: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                    <th>Case ID</th>
                    <th>e-Diary ID</th>
                    <th>Topic</th>
                    <th>Date &amp; Time</th>
                    <th>Narrative</th>
                    <th>Logged By</th>
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
                      <td>
                        {o.caseId ? <span className="mono-id">{o.caseId}</span> : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                      </td>
                      <td>
                        <span className="mono-id" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>
                          {o.id}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{o.topic}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                        {new Date(o.dateTime).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}{' '}
                        {new Date(o.dateTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-sub)' }} title={o.content}>
                        {o.content}
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{o.user}</td>
                      {canEdit && (
                        <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)', whiteSpace: 'nowrap', marginRight: 6 }}
                            onClick={() => setEscalatingEntry(o)}
                          >
                            🔺 Escalate
                          </button>
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: '3px 10px', background: 'var(--color-primary-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-border)', whiteSpace: 'nowrap' }}
                            onClick={() => setEventLinkingEntry(o)}
                          >
                            📅 Event
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

                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Link to Existing Case ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>

                  {/* Select Trigger Box */}
                  <div
                    onClick={() => setShowCaseDropdown(!showCaseDropdown)}
                    className="form-control select-dark search-select-trigger"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '13px'
                    }}
                  >
                    <span>
                      {caseIdInput
                        ? `${caseIdInput}${cases.find(c => c.id === caseIdInput) ? ' - ' + cases.find(c => c.id === caseIdInput)!.title : ''}`
                        : 'Auto-create new case'}
                    </span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
                  </div>

                  {/* Dropdown Menu */}
                  {showCaseDropdown && (
                    <div
                      className="glass search-select-dropdown"
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 100,
                        marginTop: '4px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
                        maxHeight: '260px',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                      }}
                    >
                      {/* Search Input field */}
                      <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-inset)' }}>
                        <input
                          type="text"
                          placeholder="Search case ID or title..."
                          value={caseSearchText}
                          onChange={e => setCaseSearchText(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="form-control"
                          style={{
                            fontSize: '12px',
                            height: '30px',
                            padding: '4px 8px',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                          autoFocus
                        />
                      </div>

                      {/* Options list */}
                      <div style={{ overflowY: 'auto', flex: 1, maxHeight: '200px' }}>
                        {/* Option: Auto-create new case */}
                        <div
                          onClick={() => {
                            setCaseIdInput('');
                            setShowCaseDropdown(false);
                            setCaseSearchText('');
                          }}
                          className="search-select-option create-new-opt"
                          style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '12.5px',
                            color: 'var(--color-primary)',
                            fontWeight: '600',
                            borderBottom: '1px solid var(--border-color)',
                            background: !caseIdInput ? 'var(--bg-hover)' : 'transparent'
                          }}
                        >
                          ➕ Auto-create new case
                        </div>

                        {/* Filtered Active Cases */}
                        {cases
                          .filter(c => c.status !== 'Closed')
                          .filter(c => {
                            if (!caseSearchText.trim()) return true;
                            const query = caseSearchText.toLowerCase();
                            return (
                              c.id.toLowerCase().includes(query) ||
                              c.title.toLowerCase().includes(query)
                            );
                          })
                          .map(c => {
                            const isSelected = caseIdInput === c.id;
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  setCaseIdInput(c.id);
                                  setShowCaseDropdown(false);
                                  setCaseSearchText('');
                                }}
                                className="search-select-option"
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  fontSize: '12.5px',
                                  color: isSelected ? 'var(--color-primary)' : 'var(--text-main)',
                                  background: isSelected ? 'var(--bg-hover)' : 'transparent'
                                }}
                              >
                                {c.id} - {c.title}
                              </div>
                            );
                          })}

                        {/* Empty results */}
                        {cases
                          .filter(c => c.status !== 'Closed')
                          .filter(c => {
                            if (!caseSearchText.trim()) return true;
                            const query = caseSearchText.toLowerCase();
                            return (
                              c.id.toLowerCase().includes(query) ||
                              c.title.toLowerCase().includes(query)
                            );
                          }).length === 0 && (
                          <div style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            No cases found
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="sub-desc">If left blank, a Case will be auto-created and linked to this entry.</p>
                </div>

                <div className="form-group">
                  <label>Narrative *</label>
                  <textarea placeholder="Describe the occurrence, interaction, or advisory…"
                    value={content} onChange={e => setContent(e.target.value)}
                    required className="form-control" rows={5} />
                </div>

              </div>
              <div className="modal-actions-bar">
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
              <div className="modal-actions-bar">
                <button className="btn btn-primary" onClick={handleEscalate} style={{ background: '#EF4444', borderColor: '#EF4444' }}>
                  🔺 CREATE INCIDENT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Create or Link Event Modal — FRD §9.1.3 ─────────────────────────────── */}
      {eventLinkingEntry && !showEventCreateModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>CREATE OR LINK EVENT</h2>
              <button className="close-btn" onClick={() => { setEventLinkingEntry(null); setLinkingEventId(null); setEventSearchText(''); }}>✕</button>
            </div>
            <div className="modal-form">
              <div className="modal-scroll-area">
                <p style={{ fontSize: 12.5, color: 'var(--text-sub)', lineHeight: 1.6 }}>
                  e-Diary entry <strong>{eventLinkingEntry.id}</strong> — create a new Event in the Events Master List, or link this entry to an existing one. The reference is retained per §8.1.1(c)/§9.1.3(c); this e-Diary entry stays unchanged.
                </p>

                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: 14, fontWeight: 600 }}
                  onClick={() => setShowEventCreateModal(true)}
                >
                  ＋ Create New Event
                </button>

                <div style={{ margin: '18px 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Or link an existing event
                </div>
                <div style={{ position: 'relative' }}>
                  <div
                    onClick={() => setShowEventDropdown(!showEventDropdown)}
                    className="form-control select-dark search-select-trigger"
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: '8px 12px', fontSize: 13 }}
                  >
                    <span>
                      {linkingEventId
                        ? events.find(e => e.id === linkingEventId)?.name || linkingEventId
                        : 'Select an event…'}
                    </span>
                    <span style={{ fontSize: 10, opacity: 0.7 }}>▼</span>
                  </div>
                  {showEventDropdown && (
                    <div className="glass search-select-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 6, maxHeight: 220, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <div style={{ padding: 8, borderBottom: '1px solid var(--border-color)' }}>
                        <input
                          type="text"
                          placeholder="Search events…"
                          value={eventSearchText}
                          onChange={e => setEventSearchText(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="form-control"
                          style={{ fontSize: 12, height: 30, width: '100%', boxSizing: 'border-box' }}
                          autoFocus
                        />
                      </div>
                      <div style={{ overflowY: 'auto', flex: 1 }}>
                        {events
                          .filter(e => !e.sourceEDiaryId)
                          .filter(e => !eventSearchText.trim() || e.name.toLowerCase().includes(eventSearchText.toLowerCase()) || e.id.toLowerCase().includes(eventSearchText.toLowerCase()))
                          .map(e => (
                            <div
                              key={e.id}
                              onClick={() => { setLinkingEventId(e.id); setShowEventDropdown(false); setEventSearchText(''); }}
                              className="search-select-option"
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5 }}
                            >
                              {e.id} - {e.name}
                            </div>
                          ))}
                        {events.filter(e => !e.sourceEDiaryId).length === 0 && (
                          <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No unlinked events available.</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-actions-bar">
                <button className="btn btn-secondary" onClick={() => { setEventLinkingEntry(null); setLinkingEventId(null); setEventSearchText(''); }}>Cancel</button>
                <button className="btn btn-primary" disabled={!linkingEventId} onClick={handleLinkExistingEvent}>Link Event</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <EventCreateModal
        isOpen={!!eventLinkingEntry && showEventCreateModal}
        onClose={() => setShowEventCreateModal(false)}
        onSuccess={() => { setEventLinkingEntry(null); setShowEventCreateModal(false); fetchEvents(); }}
        username={username}
        sourceEDiaryId={eventLinkingEntry?.id}
        prefillName={eventLinkingEntry?.topic}
        prefillDescription={eventLinkingEntry?.content}
      />
    </>
  );
}
