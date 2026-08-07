'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Occurrence, EventRecord } from '@/lib/db';
import { getEDiaryTaxonomy } from '@/lib/taxonomy';
import { useRole } from '@/context/RoleContext';
import EventCreateModal from '@/components/EventCreateModal';
import FaultCreateModal from '@/components/FaultCreateModal';
import TaskCreateModal from '@/components/TaskCreateModal';

// Roles allowed to access e-Diary per FRD §8.3
const ALLOWED_ROLES = ['Controller', 'Duty Officer', 'Duty Manager', 'System Administrator', 'Current Ops Administrator'];

// Occurrence topics — the 5 physical logbooks the client digitised (2026-07-21 feedback),
// see EDIARY_MODULE_UPDATE_PLAN.md §8. "Others" kept as an escape hatch for anything
// that doesn't fit those 5 categories.
export const TOPICS = [
  'General Occurrence',
  'Carpark Barrier',
  'Asset Book — Radio/BWC',
  'Asset Book — Keys',
  'Lost & Found',
  'Others',
];

const ITEMS_PER_PAGE = 10;

const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', display: 'block', marginBottom: 4 };

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
  // Search & filter panel — collapsed by default, client feedback 2026-07-21 (was an always-open
  // box that felt empty/disconnected from the table); toggled via the "Search & filter" button.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // Quick-add bar — replaces the old "New Entry" modal (client feedback: no more
  // pop-up/case-picker, just Type + narrative inline above the list). Every quick-add
  // always auto-creates its own dedicated Case (client feedback: never merge).
  const [quickTopic, setQuickTopic] = useState('');
  const [quickContent, setQuickContent] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [quickSubmitting, setQuickSubmitting] = useState(false);

  // e-Diary ID link picker — replaces the old free-text Ref No field (client feedback
  // 2026-07-21: link straight to an existing entry's real e-Diary ID instead of typing
  // a Ref No by hand). Same search+select UX as the "Link Existing Event" picker below.
  const [quickLinkedId, setQuickLinkedId] = useState('');
  const [quickLinkSearchText, setQuickLinkSearchText] = useState('');
  const [quickLinkDropdownOpen, setQuickLinkDropdownOpen] = useState(false);
  const quickLinkBoxRef = useRef<HTMLDivElement>(null);

  // Topic combobox — fuzzy-search against Taxonomy's "eDiary" category, free text if it
  // doesn't exist there (client feedback 2026-07-21: Topic managed in Taxonomy admin now).
  const [topicOptions, setTopicOptions] = useState<string[]>([]);
  const [topicDropdownOpen, setTopicDropdownOpen] = useState(false);
  const topicBoxRef = useRef<HTMLDivElement>(null);

  // View popup — replaces navigating straight to the Case detail page on row click.
  const [viewingEntry, setViewingEntry] = useState<Occurrence | null>(null);

  // Escalate to Incident
  const [escalatingEntry, setEscalatingEntry] = useState<Occurrence | null>(null);

  // Create or Link Event — FRD §9.1.3
  const [eventLinkingEntry, setEventLinkingEntry] = useState<Occurrence | null>(null);
  const [showEventCreateModal, setShowEventCreateModal] = useState(false);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [eventSearchText, setEventSearchText] = useState('');
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const [linkingEventId, setLinkingEventId] = useState<string | null>(null);

  // Create Fault / Task from a combined Actions menu (client feedback: gộp Incident/Fault/Task/Event)
  const [faultLinkingEntry, setFaultLinkingEntry] = useState<Occurrence | null>(null);
  const [taskLinkingEntry, setTaskLinkingEntry] = useState<Occurrence | null>(null);

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
  useEffect(() => { setTopicOptions(getEDiaryTaxonomy()); }, []);

  // Close Topic dropdown on genuine outside clicks only — a full-screen click-catcher
  // (used elsewhere for menus) doesn't work here because it would sit on top of the
  // input itself and swallow clicks meant to reposition the cursor / retype.
  useEffect(() => {
    if (!topicDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (topicBoxRef.current && !topicBoxRef.current.contains(e.target as Node)) {
        setTopicDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [topicDropdownOpen]);

  // Close the e-Diary ID link-picker dropdown on outside clicks — same pattern as Topic above.
  useEffect(() => {
    if (!quickLinkDropdownOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (quickLinkBoxRef.current && !quickLinkBoxRef.current.contains(e.target as Node)) {
        setQuickLinkDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [quickLinkDropdownOpen]);

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

  const activeFilterCount = [
    searchTerm.trim() !== '',
    dateStart !== '',
    dateEnd !== '',
    topicFilter !== 'All',
  ].filter(Boolean).length;

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const resetFilters = () => {
    setSearchTerm('');
    setDateStart('');
    setDateEnd('');
    setTopicFilter('All');
  };

  // ── Quick-add ──────────────────────────────────────────────────────────────
  const handleQuickLog = async () => {
    const finalTopic = quickTopic.trim();
    if (!finalTopic || !quickContent.trim() || quickSubmitting) return;
    setQuickSubmitting(true);
    try {
      const res = await fetch('/api/occurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          topic: finalTopic,
          content: quickContent.trim(),
          refNo: quickLinkedId || undefined,
        }),
      });
      if (res.ok) {
        setQuickTopic(''); setQuickContent('');
        setQuickLinkedId(''); setQuickLinkSearchText(''); setShowMore(false);
        await fetchOccurrences();
      }
    } finally {
      setQuickSubmitting(false);
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

  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;

  return (
    <>
      {/* Quick-add bar — Type + narrative, one click to log. "More" reveals the e-Diary ID
          link picker / backdating. Header strip added for visual hierarchy (client feedback
          2026-07-21: felt too plain/floating without it) — no entry count shown per client's call. */}
      {canEdit && (
        <div className="glass" style={{ borderRadius: '0 12px 12px 0', borderLeft: '3px solid var(--color-primary)' }}>
          {/* No overflow:hidden here — it was clipping the Topic dropdown below, since the
              dropdown renders past this header's bottom edge. borderTopRightRadius on the
              header instead handles the corner (header has its own bg fill, unlike the plain
              content area below which inherits the card's own rounded white background). */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--border-color)', background: 'var(--color-primary-bg)', borderTopRightRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>📝</span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-main)' }}>Quick log entry</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-faint)' }}>— logs straight into the diary below</span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
              <strong style={{ color: 'var(--text-sub)' }}>FRD §8.2 —</strong> Once submitted, an entry is immutable and cannot be edited or deleted. To correct a mistake, log a new entry referencing this Occurrence ID.
            </span>
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                <label style={labelStyle}>Topic</label>
                <div ref={topicBoxRef} style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-faint)', pointerEvents: 'none' }}>🏷</span>
                  <input
                    type="text"
                    value={quickTopic}
                    onChange={e => { setQuickTopic(e.target.value); setTopicDropdownOpen(true); }}
                    onFocus={() => setTopicDropdownOpen(true)}
                    placeholder="Type or pick a topic…"
                    className="form-control"
                    autoComplete="off"
                    style={{ width: 210, height: 36, fontSize: 13, paddingLeft: 26 }}
                  />
                  {topicDropdownOpen && (() => {
                    const q = quickTopic.trim().toLowerCase();
                    const matches = topicOptions.filter(t => !q || t.toLowerCase().includes(q));
                    const exactMatch = topicOptions.some(t => t.toLowerCase() === q);
                    return (
                      <div className="glass search-select-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: 210, zIndex: 100, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
                          {matches.map(t => (
                            <div
                              key={t}
                              onClick={() => { setQuickTopic(t); setTopicDropdownOpen(false); }}
                              className="search-select-option"
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5 }}
                            >
                              {t}
                            </div>
                          ))}
                          {q && !exactMatch && (
                            <div
                              onClick={() => setTopicDropdownOpen(false)}
                              className="search-select-option"
                              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, color: 'var(--color-primary)', fontWeight: 600, borderTop: matches.length ? '1px solid var(--border-color)' : 'none' }}
                            >
                              Use "{quickTopic.trim()}" as new topic
                            </div>
                          )}
                          {matches.length === 0 && !q && (
                            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)' }}>Type to add a topic…</div>
                          )}
                        </div>
                    );
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 280px' }}>
                <label style={labelStyle}>Narrative <span style={{ fontWeight: 400, textTransform: 'none' }}>(Ctrl+Enter to log)</span></label>
                <textarea
                  placeholder="What happened…"
                  value={quickContent}
                  onChange={e => setQuickContent(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleQuickLog(); } }}
                  className="form-control"
                  rows={1}
                  style={{ width: '100%', minHeight: 36, fontSize: 13, resize: 'vertical', lineHeight: 1.4, paddingTop: 8, paddingBottom: 8, fontFamily: 'inherit' }}
                />
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowMore(m => !m)}
                style={{ height: 36, padding: '0 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}
              >
                More <span style={{ fontSize: 9, display: 'inline-block', transform: showMore ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleQuickLog}
                disabled={!quickTopic.trim() || !quickContent.trim() || quickSubmitting}
                style={{ height: 36, padding: '0 18px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                {quickSubmitting ? 'Logging…' : '+ Log'}
              </button>
            </div>

            {showMore && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border-color)' }}>
                <div style={{ flex: '0 1 260px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>e-Diary ID <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional — link to a related entry)</span></label>
                  <div ref={quickLinkBoxRef} style={{ position: 'relative' }}>
                    <div
                      onClick={() => setQuickLinkDropdownOpen(o => !o)}
                      className="form-control select-dark search-select-trigger"
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', height: 34, padding: '0 10px', fontSize: 13 }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: quickLinkedId ? 'var(--text-main)' : 'var(--text-faint)' }}>
                        {quickLinkedId || 'Search e-Diary ID or topic…'}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        {quickLinkedId && (
                          <span
                            onClick={e => { e.stopPropagation(); setQuickLinkedId(''); setQuickLinkSearchText(''); }}
                            style={{ fontSize: 11, color: 'var(--text-faint)' }}
                            title="Clear link"
                          >
                            ✕
                          </span>
                        )}
                        <span style={{ fontSize: 10, opacity: 0.7 }}>▼</span>
                      </span>
                    </div>
                    {quickLinkDropdownOpen && (() => {
                      const q = quickLinkSearchText.trim().toLowerCase();
                      const matches = occurrences
                        .filter(o => !q || o.id.toLowerCase().includes(q) || o.topic.toLowerCase().includes(q))
                        .slice(0, 30);
                      return (
                        <div className="glass search-select-dropdown" style={{ position: 'absolute', top: '100%', left: 0, width: 280, zIndex: 100, marginTop: 4, border: '1px solid var(--border-color)', borderRadius: 8, maxHeight: 220, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div style={{ padding: 8, borderBottom: '1px solid var(--border-color)' }}>
                            <input
                              type="text"
                              placeholder="Search e-Diary ID or topic…"
                              value={quickLinkSearchText}
                              onChange={e => setQuickLinkSearchText(e.target.value)}
                              onClick={e => e.stopPropagation()}
                              className="form-control"
                              style={{ fontSize: 12, height: 30, width: '100%', boxSizing: 'border-box' }}
                              autoFocus
                            />
                          </div>
                          <div style={{ overflowY: 'auto', flex: 1 }}>
                            {matches.map(o => (
                              <div
                                key={o.id}
                                onClick={() => { setQuickLinkedId(o.id); setQuickLinkDropdownOpen(false); setQuickLinkSearchText(''); }}
                                className="search-select-option"
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5 }}
                              >
                                <div style={{ fontWeight: 600 }}>{o.id}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.topic}</div>
                              </div>
                            ))}
                            {matches.length === 0 && (
                              <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>No matching entries.</div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Table & Content — search/filter lives as a collapsed toggle in the header row now
          (client feedback 2026-07-21: standalone box felt empty/disconnected from the table) */}
      <div className="glass" style={{ marginTop: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-main)' }}>
            Entries <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>({filtered.length})</span>
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setFiltersOpen(o => !o)}
            style={{ height: 32, padding: '0 12px', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          >
            Search &amp; filter
            {activeFilterCount > 0 && (
              <span style={{ background: 'var(--color-primary)', color: '#FFF', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 6px', lineHeight: 1.4 }}>
                {activeFilterCount}
              </span>
            )}
            <span style={{ fontSize: 9, display: 'inline-block', transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
          </button>
        </div>

        {filtersOpen && (
          <div style={{ padding: '16px 20px', background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

              {/* Search */}
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Search Entries:</label>
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
                <label style={labelStyle}>Date From:</label>
                <input type="date" value={dateStart} max={dateEnd || undefined}
                  onChange={e => setDateStart(e.target.value)} className="form-control" style={{ width: '100%', height: '36px' }} />
              </div>

              {/* Date To */}
              <div style={{ flex: '0 1 150px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Date To:</label>
                <input type="date" value={dateEnd} min={dateStart || undefined}
                  onChange={e => setDateEnd(e.target.value)} className="form-control" style={{ width: '100%', height: '36px' }} />
              </div>

              {/* Topic / Subject */}
              <div style={{ flex: '0 1 200px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={labelStyle}>Topic / Subject:</label>
                <select value={topicFilter} onChange={e => setTopicFilter(e.target.value)} className="form-control select-dark" style={{ width: '100%', height: '36px' }}>
                  <option value="All">All Topics</option>
                  {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Clear */}
              <div style={{ display: 'flex', gap: '10px', height: '36px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn btn-secondary"
                  style={{ padding: '0 10px', fontSize: '12px', height: '100%', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  Clear
                </button>
              </div>

            </div>
          </div>
        )}

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
              <table className="custom-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>Date &amp; Time</th>
                    <th style={{ width: 168 }}>e-Diary ID</th>
                    <th style={{ width: 160 }}>Topic</th>
                    <th style={{ width: 384 }}>Narrative</th>
                    <th style={{ width: 96 }}>Logged By</th>
                    {canEdit && <th style={{ width: 90 }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(o => (
                    <tr
                      key={o.id}
                      onClick={() => setViewingEntry(o)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td style={{ verticalAlign: 'top', paddingTop: 20, paddingBottom: 20, fontSize: '11px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.4 }}>
                        <div style={{ whiteSpace: 'nowrap' }}>{fmtDate(o.dateTime)}</div>
                        <div style={{ whiteSpace: 'nowrap', opacity: 0.8 }}>{fmtTime(o.dateTime)}</div>
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: 20, paddingBottom: 20, whiteSpace: 'nowrap' }} title={o.id}>
                        <span className="mono-id" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)', fontSize: 10.5 }}>
                          {o.id}
                        </span>
                        {o.refNo && <div style={{ fontSize: 9.5, fontWeight: 500, color: 'var(--text-faint)', marginTop: 3 }} title={`Refers to ${o.refNo}`}>🔗 {o.refNo}</div>}
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: 20, paddingBottom: 20, fontWeight: 600, whiteSpace: 'normal', minWidth: 130 }}>{o.topic}</td>
                      <td style={{ verticalAlign: 'top', paddingTop: 20, paddingBottom: 20, color: 'var(--text-sub)' }} title={o.content}>
                        <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {o.content}
                        </div>
                      </td>
                      <td style={{ verticalAlign: 'top', paddingTop: 20, paddingBottom: 20, fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <UserAvatar name={o.user} />
                          {o.user}
                        </div>
                      </td>
                      {canEdit && (
                        <td onClick={e => e.stopPropagation()} style={{ verticalAlign: 'top', paddingTop: 16, paddingBottom: 16, whiteSpace: 'nowrap' }}>
                          <EDiaryActionsMenu
                            onIncident={() => setEscalatingEntry(o)}
                            onFault={() => setFaultLinkingEntry(o)}
                            onTask={() => setTaskLinkingEntry(o)}
                            onEvent={() => setEventLinkingEntry(o)}
                          />
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

      {/* ── View Entry Popup — Date Time, e-Diary ID, Ref, Case ID, Topic, Narrative, Logged By, Actions ── */}
      {viewingEntry && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>E-DIARY ENTRY</h2>
              <button className="close-btn" onClick={() => setViewingEntry(null)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="modal-scroll-area">

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Date &amp; Time</label>
                    <p style={{ fontSize: 13, margin: 0, color: 'var(--text-main)', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(viewingEntry.dateTime)}</p>
                  </div>
                  <div>
                    <label style={labelStyle}>Logged By</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <UserAvatar name={viewingEntry.user} />
                      <p style={{ fontSize: 13, margin: 0, color: 'var(--text-main)' }}>{viewingEntry.user}</p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border-color)' }}>
                  <span className="mono-id" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>
                    {viewingEntry.id}
                  </span>
                  {viewingEntry.refNo && (
                    <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-faint)' }} title={`Refers to ${viewingEntry.refNo}`}>
                      🔗 {viewingEntry.refNo}
                    </span>
                  )}
                  {viewingEntry.caseId && (
                    <span
                      className="mono-id"
                      style={{ cursor: 'pointer', color: 'var(--color-primary)', background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary-border)' }}
                      onClick={() => { window.location.href = `/cases/${viewingEntry.caseId}`; }}
                      title="Open Case detail"
                    >
                      {viewingEntry.caseId} ↗
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Topic</label>
                  <p style={{ fontSize: 15.5, fontWeight: 700, margin: '3px 0 0', color: 'var(--text-main)' }}>{viewingEntry.topic}</p>
                </div>

                <div style={{ marginBottom: canEdit ? 16 : 0, padding: '12px 14px', background: 'var(--bg-inset)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                  <label style={labelStyle}>Narrative</label>
                  <p style={{ fontSize: 13.5, margin: '5px 0 0', color: 'var(--text-sub)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{viewingEntry.content}</p>
                </div>

                {canEdit && (
                  <div>
                    <label style={labelStyle}>Actions</label>
                    <div style={{ marginTop: 4 }}>
                      <EDiaryActionsMenu
                        onIncident={() => { setEscalatingEntry(viewingEntry); setViewingEntry(null); }}
                        onFault={() => { setFaultLinkingEntry(viewingEntry); setViewingEntry(null); }}
                        onTask={() => { setTaskLinkingEntry(viewingEntry); setViewingEntry(null); }}
                        onEvent={() => { setEventLinkingEntry(viewingEntry); setViewingEntry(null); }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-actions-bar">
                <button className="btn btn-secondary" onClick={() => setViewingEntry(null)}>Close</button>
              </div>
            </div>
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

      {/* ── Create Fault from e-Diary — combined Actions menu ───────────────────── */}
      <FaultCreateModal
        isOpen={!!faultLinkingEntry}
        onClose={() => setFaultLinkingEntry(null)}
        onSuccess={() => setFaultLinkingEntry(null)}
        linkedCaseId={faultLinkingEntry?.caseId}
        sourceEDiaryId={faultLinkingEntry?.id}
        prefillDescription={faultLinkingEntry?.content}
        username={username}
      />

      {/* ── Create Task from e-Diary — combined Actions menu ────────────────────── */}
      <TaskCreateModal
        isOpen={!!taskLinkingEntry}
        onClose={() => setTaskLinkingEntry(null)}
        onSuccess={() => setTaskLinkingEntry(null)}
        caseId={taskLinkingEntry?.caseId}
        sourceEDiaryId={taskLinkingEntry?.id}
        prefillTitle={taskLinkingEntry?.topic}
        prefillDescription={taskLinkingEntry?.content}
        username={username}
      />
    </>
  );
}

// Logged-by avatar — same 20px initials-circle + color-hash convention as RespondersAvatars
// in TaskBoardTab.tsx, duplicated here (not extracted to a shared component per Kyle's call)
// so it must be kept visually in sync with that file if the color list ever changes there.
function UserAvatar({ name }: { name?: string }) {
  if (!name) return null;
  const colors = ['#10B981', '#3B82F6', '#EC4899', '#8B5CF6', '#F97316', '#0D9488', '#6366F1'];
  const color = colors[(name.charCodeAt(0) || 65) % colors.length];
  return (
    <span
      title={name}
      style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
        background: color, color: '#FFF', fontSize: 10, fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1.5px solid #FFF', boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

// Combined "+ Create" button — client feedback 2026-07-21: one button, opens a small
// menu to choose Incident / Fault / Task / Event instead of separate buttons per type.
function EDiaryActionsMenu({
  onIncident,
  onFault,
  onTask,
  onEvent,
}: {
  onIncident: () => void;
  onFault: () => void;
  onTask: () => void;
  onEvent: () => void;
}) {
  const [open, setOpen] = useState(false);

  const items: { label: string; action: () => void }[] = [
    { label: '🔺 Incident', action: onIncident },
    { label: '🔧 Fault', action: onFault },
    { label: '✅ Task', action: onTask },
    { label: '📅 Event', action: onEvent },
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn"
        style={{ fontSize: 11, padding: '3px 10px', background: 'var(--color-primary-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-border)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
        onClick={() => setOpen(o => !o)}
      >
        + Create <span style={{ fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div
            className="glass eda-actions-menu"
            style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 100, border: '1px solid var(--border-color)', borderRadius: 6, minWidth: 130, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.15)' }}
          >
            {items.map(item => (
              <div
                key={item.label}
                onClick={() => { item.action(); setOpen(false); }}
                className="eda-actions-item"
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 12.5, whiteSpace: 'nowrap' }}
              >
                {item.label}
              </div>
            ))}
          </div>
        </>
      )}
      <style jsx>{`
        .eda-actions-item:hover { background: var(--bg-hover); }
      `}</style>
    </div>
  );
}
