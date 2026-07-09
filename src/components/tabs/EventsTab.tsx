'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { EventRecord } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getEventTaxonomy } from '@/lib/taxonomy';
import EventCreateModal from '@/components/EventCreateModal';
import EventScheduleUploadModal from '@/components/EventScheduleUploadModal';

// FRD §3.3.4 Events Management role matrix is blank in the FRD itself — using the
// placeholder from QnA_FSD_v0.5_EventsMasterList.md item 1 (mirrors e-Diary §3.3.3)
// pending Shin Feng's confirmation.
const CREATE_EDIT_ROLES = ['System Administrator', 'Current Ops Administrator', 'Duty Manager', 'Duty Officer', 'Controller'];
const DELETE_ROLES = ['System Administrator'];

const ITEMS_PER_PAGE = 10;

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

export function EventsTab() {
  const { role, username } = useRole();
  const canCreateEdit = CREATE_EDIT_ROLES.includes(role);
  const canDelete = DELETE_ROLES.includes(role);

  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  // Filters — §8.4(b) list view filterable by date range and event type
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [deletingEvent, setDeletingEvent] = useState<EventRecord | null>(null);

  // Calendar state — §8.4(a)
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; });

  useEffect(() => {
    setEventTypes(getEventTaxonomy());
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('eventType', filterType);
      if (view === 'list' && dateStart) params.set('dateStart', dateStart);
      if (view === 'list' && dateEnd) params.set('dateEnd', dateEnd);
      const res = await fetch(`/api/events?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, dateStart, dateEnd, view]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterType, dateStart, dateEnd]);

  const filtered = events.filter(e => {
    const q = searchTerm.toLowerCase();
    if (!q) return true;
    return (
      e.id.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      (e.location.commonName || '').toLowerCase().includes(q) ||
      (e.location.road || '').toLowerCase().includes(q)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const resetFilters = () => {
    setSearchTerm(''); setFilterType(''); setDateStart(''); setDateEnd('');
  };
  const filtersActive = !!(searchTerm || filterType || dateStart || dateEnd);

  const handleDelete = async () => {
    if (!deletingEvent) return;
    try {
      const res = await fetch(`/api/events/${deletingEvent.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingEvent(null);
        await fetchEvents();
      } else {
        const err = await res.json();
        alert(`Failed to delete event: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  // ── Calendar grid computation ────────────────────────────────────────────────
  const calendarCells = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startOffset = firstOfMonth.getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthStart = new Date(year, month, 1, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    const monthEvents = events.filter(e => {
      if (filterType && e.type !== filterType) return false;
      const s = new Date(e.startDateTime);
      const en = new Date(e.endDateTime);
      return s <= monthEnd && en >= monthStart;
    });

    const cells: { date: Date | null; events: EventRecord[] }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ date: null, events: [] });
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayEnd = new Date(year, month, day, 23, 59, 59);
      const dayEvents = monthEvents.filter(e => new Date(e.startDateTime) <= dayEnd && new Date(e.endDateTime) >= date);
      cells.push({ date, events: dayEvents });
    }
    return cells;
  }, [calendarMonth, events, filterType]);

  const today = new Date();
  const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <>
      {/* Filter panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-inset)', padding: 3, borderRadius: 8 }}>
            <button
              type="button"
              onClick={() => setView('list')}
              className="btn"
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: view === 'list' ? 'var(--bg-card)' : 'transparent', color: view === 'list' ? 'var(--color-primary)' : 'var(--text-muted)', boxShadow: view === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
            >
              📋 List
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className="btn"
              style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: view === 'calendar' ? 'var(--bg-card)' : 'transparent', color: view === 'calendar' ? 'var(--color-primary)' : 'var(--text-muted)', boxShadow: view === 'calendar' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}
            >
              📅 Calendar
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {canCreateEdit && (
              <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(true)} style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', fontWeight: 600 }}>
                ⬆ Bulk Import
              </button>
            )}
            {canCreateEdit && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { setEditingEvent(null); setShowCreateModal(true); }}
                style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                NEW EVENT
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Search:</label>
            <input type="text" placeholder="Event ID, name, location…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-control" style={{ width: '100%' }} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Event Type:</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control select-dark" style={{ width: '100%' }}>
              <option value="">All Types</option>
              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {view === 'list' && (
            <>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date From:</label>
                <input type="date" value={dateStart} max={dateEnd || undefined} onChange={e => setDateStart(e.target.value)} className="form-control" style={{ width: '100%' }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date To:</label>
                <input type="date" value={dateEnd} min={dateStart || undefined} onChange={e => setDateEnd(e.target.value)} className="form-control" style={{ width: '100%' }} />
              </div>
            </>
          )}
          {filtersActive && (
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={resetFilters} className="btn btn-secondary" style={{ padding: '0 12px', fontSize: '12.5px', height: '34px', border: 'none', background: 'transparent', textDecoration: 'underline' }}>
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── List View ─────────────────────────────────────────────────────────── */}
      {view === 'list' && (
        <div className="glass" style={{ marginTop: '10px', overflow: 'hidden' }}>
          {loading ? (
            <div className="loading-container" style={{ padding: '40px' }}><div className="spinner" /><span>Loading events…</span></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '60px', textAlign: 'center' }}>No events found matching your filters.</div>
          ) : (
            <>
              <div className="table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Event ID</th>
                      <th>Name</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Location</th>
                      <th>Type</th>
                      <th>Linked e-Diary</th>
                      <th>Created By</th>
                      {canCreateEdit && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map(ev => (
                      <tr key={ev.id} style={{ cursor: canCreateEdit ? 'pointer' : 'default' }} onClick={() => canCreateEdit && (setEditingEvent(ev), setShowCreateModal(true))}>
                        <td><span className="mono-id" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary-border)' }}>{ev.id}</span></td>
                        <td style={{ fontWeight: 600 }}>{ev.name}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(ev.startDateTime)}</td>
                        <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(ev.endDateTime)}</td>
                        <td style={{ fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location.commonName || ev.location.road || '—'}</td>
                        <td><span className="badge badge-closed" style={{ fontSize: 11 }}>{ev.type}</span></td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.sourceEDiaryId || '—'}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.createdBy}</td>
                        {canCreateEdit && (
                          <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn btn-secondary btn-xs" style={{ fontSize: 10.5, padding: '3px 8px', marginRight: 6 }} onClick={() => { setEditingEvent(ev); setShowCreateModal(true); }}>Edit</button>
                            {canDelete && (
                              <button className="btn" style={{ fontSize: 10.5, padding: '3px 8px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }} onClick={() => setDeletingEvent(ev)}>Delete</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)}</strong> of <strong>{filtered.length}</strong> events
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}>Prev</button>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '0 8px' }}>Page {currentPage} of {totalPages}</span>
                  <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ height: '28px', padding: '0 8px', fontSize: '12px' }}>Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Calendar View — FRD §8.4(a) ──────────────────────────────────────── */}
      {view === 'calendar' && (
        <div className="glass" style={{ marginTop: '10px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button className="btn btn-secondary btn-xs" onClick={() => setCalendarMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}>‹ Prev</button>
            <h3 style={{ fontFamily: 'var(--font-headline)', fontSize: 16, fontWeight: 700 }}>
              {calendarMonth.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}
            </h3>
            <button className="btn btn-secondary btn-xs" onClick={() => setCalendarMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}>Next ›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: 'var(--border-color)', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} style={{ background: 'var(--bg-inset)', padding: '8px', fontSize: 11, fontWeight: 700, textAlign: 'center', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</div>
            ))}
            {calendarCells.map((cell, i) => (
              <div key={i} style={{ background: 'var(--bg-card)', minHeight: 90, padding: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {cell.date && (
                  <>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isSameDay(cell.date, today) ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                      {cell.date.getDate()}
                    </span>
                    {cell.events.slice(0, 3).map(ev => (
                      <div
                        key={ev.id}
                        onClick={() => canCreateEdit && (setEditingEvent(ev), setShowCreateModal(true))}
                        title={`${ev.name} · ${ev.type}`}
                        style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, background: 'var(--color-primary-bg)', color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: canCreateEdit ? 'pointer' : 'default' }}
                      >
                        {ev.name}
                      </div>
                    ))}
                    {cell.events.length > 3 && (
                      <span style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>+{cell.events.length - 3} more</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <EventCreateModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingEvent(null); }}
        onSuccess={fetchEvents}
        username={username}
        editingEvent={editingEvent}
      />

      <EventScheduleUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={fetchEvents}
        username={username}
      />

      {/* Delete confirm */}
      {deletingEvent && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 420 }}>
            <div className="modal-header"><h2>DELETE EVENT</h2><button className="close-btn" onClick={() => setDeletingEvent(null)}>✕</button></div>
            <div className="modal-form">
              <div className="modal-scroll-area">
                <p style={{ fontSize: 13, color: 'var(--text-sub)' }}>
                  Delete <strong>{deletingEvent.id} — {deletingEvent.name}</strong>? This cannot be undone.
                </p>
              </div>
              <div className="modal-actions-bar">
                <button className="btn btn-secondary" onClick={() => setDeletingEvent(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={handleDelete} style={{ background: '#EF4444', borderColor: '#EF4444' }}>Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
