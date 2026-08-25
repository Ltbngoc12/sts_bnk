'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { EventRecord } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getEventTaxonomy } from '@/lib/taxonomy';
import EventCreateModal from '@/components/EventCreateModal';
import EventScheduleUploadModal from '@/components/EventScheduleUploadModal';
import { EventTimelineView } from '@/components/EventTimelineView';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false, loading: () => <div style={{height:'100%', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading Map...</div> });

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

  const [view, setView] = useState<'timeline' | 'list'>('timeline');
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

  const [timelineDate, setTimelineDate] = useState(() => new Date());

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
    setSearchTerm(''); setFilterType(''); setDateStart(''); setDateEnd(''); setTimelineDate(new Date());
  };
  const filtersActive = !!(searchTerm || filterType || dateStart || dateEnd);

  const openEvent = (ev: EventRecord) => {
    setEditingEvent(ev);
    setShowCreateModal(true);
  };

  return (
    <>
      <div className="page-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="title-section">
          <h1 style={{ fontSize: '15px', textTransform: 'uppercase' }}>Event Management</h1>
          <p>Master list of all island events, schedules, and spatial boundaries</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', paddingRight: '20px' }}>
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
              style={{ fontSize: '13px', height: '36px', padding: '0 16px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, borderRadius: 'var(--radius-md)', boxShadow: '0 2px 8px rgba(255,130,0,0.25)' }}
            >
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              NEW EVENT
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>

      {/* ── Top Action Bar (Glassmorphic) ── */}
      <div className="glass" style={{
        padding: '20px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-card)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', flex: 1 }}>
          <div className="form-group" style={{ margin: 0, width: '200px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Event Type</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control select-dark" style={{ width: '100%', height: '40px' }}>
              <option value="">All Types</option>
              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {view === 'timeline' && (
            <div className="form-group" style={{ margin: 0, width: '200px' }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Timeline Date</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button className="btn btn-secondary" style={{ padding: '0 8px', height: '40px' }} onClick={() => { const d = new Date(timelineDate); d.setDate(d.getDate() - 1); setTimelineDate(d); }}>‹</button>
                <input type="date" value={timelineDate.toISOString().split('T')[0]} onChange={e => setTimelineDate(new Date(e.target.value))} className="form-control" style={{ flex: 1, height: '40px', padding: '0 8px' }} />
                <button className="btn btn-secondary" style={{ padding: '0 8px', height: '40px' }} onClick={() => { const d = new Date(timelineDate); d.setDate(d.getDate() + 1); setTimelineDate(d); }}>›</button>
              </div>
            </div>
          )}

          {view === 'list' && (
             <>
               <div className="form-group" style={{ margin: 0, width: '150px' }}>
                 <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date From</label>
                 <input type="date" value={dateStart} max={dateEnd || undefined} onChange={e => setDateStart(e.target.value)} className="form-control" style={{ width: '100%', height: '40px' }} />
               </div>
               <div className="form-group" style={{ margin: 0, width: '150px' }}>
                 <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date To</label>
                 <input type="date" value={dateEnd} min={dateStart || undefined} onChange={e => setDateEnd(e.target.value)} className="form-control" style={{ width: '100%', height: '40px' }} />
               </div>
             </>
          )}

          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>Search</label>
            <input type="text" placeholder="Search events..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="form-control" style={{ width: '100%', height: '40px' }} />
          </div>

          {filtersActive && (
            <button onClick={resetFilters} className="btn btn-secondary" style={{ height: '40px', border: 'none', background: 'transparent', textDecoration: 'underline' }}>
              Clear
            </button>
          )}
        </div>

        {/* Switch Mode Segmented Control */}
        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-inset)', padding: '6px', borderRadius: '12px', height: '48px', alignItems: 'center', border: '1px solid var(--border-color)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
          <button
            type="button"
            onClick={() => setView('timeline')}
            className="btn"
            style={{ padding: '0 20px', fontSize: 13.5, fontWeight: 700, borderRadius: '8px', border: 'none', background: view === 'timeline' ? 'var(--color-primary)' : 'transparent', color: view === 'timeline' ? '#FFF' : 'var(--text-muted)', boxShadow: view === 'timeline' ? '0 4px 12px rgba(255, 130, 0, 0.3)' : 'none', transition: 'all 0.25s ease', height: '100%', display: 'flex', alignItems: 'center', gap: '8px', opacity: view === 'timeline' ? 1 : 0.8 }}
          >
            <span style={{ filter: view === 'timeline' ? 'none' : 'grayscale(100%) opacity(0.7)' }}>⏱️</span> Timeline
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className="btn"
            style={{ padding: '0 20px', fontSize: 13.5, fontWeight: 700, borderRadius: '8px', border: 'none', background: view === 'list' ? 'var(--color-primary)' : 'transparent', color: view === 'list' ? '#FFF' : 'var(--text-muted)', boxShadow: view === 'list' ? '0 4px 12px rgba(255, 130, 0, 0.3)' : 'none', transition: 'all 0.25s ease', height: '100%', display: 'flex', alignItems: 'center', gap: '8px', opacity: view === 'list' ? 1 : 0.8 }}
          >
            <span style={{ filter: view === 'list' ? 'none' : 'grayscale(100%) opacity(0.7)' }}>📋</span> List
          </button>
        </div>
      </div>

      {/* ── Split Layout Content ── */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: '600px', alignItems: 'stretch' }}>

        {/* Left Side: Map */}
        {view === 'timeline' && (
          <div style={{
            flex: '0 0 35%',
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-inset)', fontWeight: 600, fontSize: '14px', color: 'var(--text-main)' }}>
              📍 Event Locations
            </div>
            <div style={{ flex: 1, position: 'relative' }}>
               {/* MapComponent takes 100% of its container usually */}
               <MapComponent cases={[]} events={filtered} allowedCategories={['events']} />
            </div>
          </div>
        )}

        {/* Right Side: Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {view === 'timeline' && (
             <EventTimelineView
                events={filtered}
                currentDate={timelineDate}
                onEventClick={openEvent}
             />
          )}

          {view === 'list' && (
            <div className="glass" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              {loading ? (
                <div className="loading-container" style={{ padding: '40px', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
              ) : filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: '60px', textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>No events found matching your filters.</div>
              ) : (
                <>
                  <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
                        <tr>
                          <th>Event ID</th>
                          <th>Name</th>
                          <th>Start</th>
                          <th>End</th>
                          <th>Location</th>
                          <th>Type</th>
                          <th>Linked e-Diary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginated.map(ev => (
                          <tr key={ev.id} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }} onClick={() => openEvent(ev)} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <td style={{ padding: '14px 16px' }}><span className="mono-id" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary-border)', fontSize: '12px' }}>{ev.id}</span></td>
                            <td style={{ padding: '14px 16px', fontWeight: 600, fontSize: '13px' }}>{ev.name}</td>
                            <td style={{ padding: '14px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtDateTime(ev.startDateTime)}</td>
                            <td style={{ padding: '14px 16px', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtDateTime(ev.endDateTime)}</td>
                            <td style={{ padding: '14px 16px', fontSize: '12px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location.commonName || ev.location.road || '—'}</td>
                            <td style={{ padding: '14px 16px' }}>
                               <span className="badge" style={{ fontSize: '11px', background: ev.type === 'Emergency' ? 'var(--color-critical-bg)' : 'var(--color-info-bg)', color: ev.type === 'Emergency' ? 'var(--color-critical)' : 'var(--color-info)' }}>{ev.type}</span>
                            </td>
                            <td style={{ padding: '14px 16px', fontSize: '11px', color: 'var(--text-muted)' }}>{ev.sourceEDiaryId || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pagination-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderTop: '1px solid var(--border-color)', background: 'var(--bg-inset)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + ITEMS_PER_PAGE, filtered.length)}</strong> of <strong>{filtered.length}</strong> events
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ height: '28px', padding: '0 12px', fontSize: '12px' }}>Prev</button>
                      <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 600, display: 'flex', alignItems: 'center', padding: '0 12px' }}>Page {currentPage} of {totalPages}</span>
                      <button className="btn btn-secondary" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} style={{ height: '28px', padding: '0 12px', fontSize: '12px' }}>Next</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <EventCreateModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingEvent(null); }}
        onSuccess={fetchEvents}
        username={username}
        editingEvent={editingEvent}
        canEdit={canCreateEdit}
        canDelete={canDelete}
      />

      <EventScheduleUploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={fetchEvents}
        username={username}
      />
    </div>
    </>
  );
}
