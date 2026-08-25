'use client';

import React, { useState, useEffect } from 'react';
import LocationSelector from '@/components/LocationSelector';
import BoundaryMapDrawer, { BoundaryPoint } from '@/components/BoundaryMapDrawer';
import { getEventTaxonomy } from '@/lib/taxonomy';
import { EventRecord } from '@/lib/db';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  username: string;
  /** Edit an existing event. Omit to create a new one. */
  editingEvent?: EventRecord | null;
  /** FRD §9.1.3(c) — set when creating an Event from an e-Diary entry. */
  sourceEDiaryId?: string;
  prefillName?: string;
  prefillDescription?: string;
  /** Whether the current user may switch from View to Edit mode. Default true. */
  canEdit?: boolean;
  /** Whether the current user may delete this event from within the modal. Default false. */
  canDelete?: boolean;
}

// FRD §8.1 Events Creation + §8.1.2 Event Field Design.
export default function EventCreateModal({
  isOpen,
  onClose,
  onSuccess,
  username,
  editingEvent,
  sourceEDiaryId,
  prefillName,
  prefillDescription,
  canEdit = true,
  canDelete = false,
}: Props) {
  const isEdit = !!editingEvent;
  const { setDirty, requestLeave } = useUnsavedChanges();

  // Opening an existing event defaults to a read-only View; opening for create goes
  // straight to the form. "Edit" in View mode switches this to 'form'.
  const [mode, setMode] = useState<'view' | 'form'>(isEdit ? 'view' : 'form');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [startDateTime, setStartDateTime] = useState('');
  const [endDateTime, setEndDateTime] = useState('');

  const [locRoad, setLocRoad] = useState('');
  const [locBuilding, setLocBuilding] = useState('');
  const [locLevelSpace, setLocLevelSpace] = useState('');
  const [locCommonName, setLocCommonName] = useState('');
  const [locPostalCode, setLocPostalCode] = useState('');
  const [locTagsStr, setLocTagsStr] = useState('');
  const [locLat, setLocLat] = useState(1.2500);
  const [locLng, setLocLng] = useState(103.8300);
  const [locationSelected, setLocationSelected] = useState(false);

  const [boundary, setBoundary] = useState<BoundaryPoint[] | undefined>(undefined);
  const [locationReady, setLocationReady] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEventTypes(getEventTaxonomy());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setLocationReady(false);
      return;
    }
    setError(null);
    setConfirmDeleteOpen(false);
    setDeleting(false);
    setDirty(false);
    setMode(editingEvent ? 'view' : 'form');
    if (editingEvent) {
      setName(editingEvent.name);
      setType(editingEvent.type);
      setDescription(editingEvent.description || '');
      setStartDateTime(toLocalInput(editingEvent.startDateTime));
      setEndDateTime(toLocalInput(editingEvent.endDateTime));
      setLocRoad(editingEvent.location.road || '');
      setLocBuilding(editingEvent.location.building || '');
      setLocLevelSpace(editingEvent.location.levelSpace || '');
      setLocCommonName(editingEvent.location.commonName || '');
      setLocPostalCode(editingEvent.location.postalCode || '');
      setLocTagsStr((editingEvent.location.tags || []).join(', '));
      setLocLat(editingEvent.location.lat);
      setLocLng(editingEvent.location.lng);
      setLocationSelected(!!(editingEvent.location.commonName || editingEvent.location.building || editingEvent.location.road));
      setBoundary(editingEvent.boundaryCoordinates);
    } else {
      resetForm();
      if (prefillName) setName(prefillName);
      if (prefillDescription) setDescription(prefillDescription);
    }
    setLocationReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingEvent]);

  function toLocalInput(iso: string) {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fmtDisplay(localOrIso: string) {
    if (!localOrIso) return '—';
    const d = new Date(localOrIso);
    if (isNaN(d.getTime())) return '—';
    return `${d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }

  function resetForm() {
    setName('');
    setType('');
    setDescription('');
    setStartDateTime('');
    setEndDateTime('');
    setLocRoad('');
    setLocBuilding('');
    setLocLevelSpace('');
    setLocCommonName('');
    setLocPostalCode('');
    setLocTagsStr('');
    setLocLat(1.2500);
    setLocLng(103.8300);
    setLocationSelected(false);
    setBoundary(undefined);
    setError(null);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !type || !startDateTime || !endDateTime || submitting) return;
    if (!locCommonName && !locBuilding && !locRoad) {
      setError('Select an Event Location from the location hierarchy.');
      return;
    }
    if (new Date(endDateTime).getTime() < new Date(startDateTime).getTime()) {
      setError('End date/time cannot be before start date/time.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        type,
        description: description.trim() || undefined,
        startDateTime: new Date(startDateTime).toISOString(),
        endDateTime: new Date(endDateTime).toISOString(),
        location: {
          road: locRoad,
          building: locBuilding,
          levelSpace: locLevelSpace,
          commonName: locCommonName || locBuilding || locRoad,
          postalCode: locPostalCode,
          tags: locTagsStr.split(',').map(t => t.trim()).filter(Boolean),
          lat: locLat,
          lng: locLng,
        },
        boundaryCoordinates: boundary,
        username,
        ...(sourceEDiaryId && { sourceEDiaryId }),
      };

      const res = isEdit
        ? await fetch(`/api/events/${editingEvent!.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

      if (res.ok) {
        setDirty(false);
        onSuccess();
        onClose();
        resetForm();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to save event.');
      }
    } catch (err) {
      console.error('Failed to save event:', err);
      setError('Failed to save event.');
    } finally {
      setSubmitting(false);
    }
  };

  // Cancel out of the form: if we got here by pressing Edit from View mode, go back
  // to View instead of closing outright. Creating fresh (no editingEvent) still closes.
  const handleCancelForm = () => {
    requestLeave(() => {
      if (editingEvent) {
        setMode('view');
        setError(null);
        setDirty(false);
      } else {
        onClose();
        resetForm();
      }
    });
  };

  const handleDelete = async () => {
    if (!editingEvent || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${editingEvent.id}`, { method: 'DELETE' });
      if (res.ok) {
        onSuccess();
        onClose();
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to delete event.');
        setConfirmDeleteOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete event:', err);
      setError('Failed to delete event.');
      setConfirmDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop">
      <div className="create-case-modal glass" style={{ maxWidth: 700, width: '100%' }}>
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-main)' }}>
              {mode === 'view' ? 'EVENT DETAILS' : isEdit ? 'EDIT EVENT' : 'NEW EVENT'}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
              {sourceEDiaryId ? `Created from e-Diary entry ${sourceEDiaryId} — reference will be retained (§9.1.3c).` : 'FRD §8.1 — Events Master List record. Does not affect Case status or closure.'}
            </p>
          </div>
          <button className="close-btn" onClick={() => requestLeave(() => { onClose(); resetForm(); })}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {mode === 'view' && editingEvent ? (
          <div className="modal-form">
            <div className="modal-scroll-area" style={{ gap: 0, padding: 0 }}>

              {/* Section 1: Event Details */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Event Details
                </div>
                <ViewField label="Event ID" value={editingEvent.id} mono />
                <ViewField label="Event Name" value={editingEvent.name} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <ViewField label="Start Date & Time" value={fmtDisplay(editingEvent.startDateTime)} />
                  <ViewField label="End Date & Time" value={fmtDisplay(editingEvent.endDateTime)} />
                </div>
                <ViewField label="Event Type" value={editingEvent.type} />
              </div>

              {/* Section 2: Location */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  Event Location
                </div>
                <ViewField
                  label="Location"
                  value={[editingEvent.location.commonName, editingEvent.location.building, editingEvent.location.road, editingEvent.location.levelSpace].filter(Boolean).join(' — ') || '—'}
                />
                {editingEvent.boundaryCoordinates && editingEvent.boundaryCoordinates.length >= 3 ? (
                  <div style={{ marginTop: 14 }}>
                    <BoundaryMapDrawer
                      center={{ lat: editingEvent.location.lat, lng: editingEvent.location.lng }}
                      initialBoundary={editingEvent.boundaryCoordinates}
                      onBoundaryChange={() => {}}
                      readOnly
                    />
                  </div>
                ) : (
                  <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 10 }}>No boundary drawn for this event.</p>
                )}
              </div>

              {/* Section 3: Description */}
              {editingEvent.description && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    Description
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-sub)', margin: 0, whiteSpace: 'pre-wrap' }}>{editingEvent.description}</p>
                </div>
              )}

              {editingEvent.sourceEDiaryId && (
                <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Linked e-Diary: <strong className="mono-id" style={{ marginLeft: 4 }}>{editingEvent.sourceEDiaryId}</strong>
                  </span>
                </div>
              )}

              <div style={{ padding: '12px 20px', fontSize: 11, color: 'var(--text-faint)' }}>
                Created by {editingEvent.createdBy} on {fmtDisplay(editingEvent.createdAt)}
              </div>

              {error && (
                <div style={{ padding: '10px 20px', fontSize: 12, color: '#EF4444', fontWeight: 600 }}>{error}</div>
              )}
            </div>

            <div className="modal-actions-bar">
              {confirmDeleteOpen ? (
                <>
                  <span style={{ fontSize: 12, color: '#EF4444', fontWeight: 600, flex: 1 }}>Delete this event? This cannot be undone.</span>
                  <button type="button" className="btn btn-secondary" onClick={() => setConfirmDeleteOpen(false)} disabled={deleting}>Cancel</button>
                  <button type="button" className="btn btn-primary" onClick={handleDelete} disabled={deleting} style={{ background: '#EF4444', borderColor: '#EF4444' }}>
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                </>
              ) : (
                <>
                  {canDelete && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setConfirmDeleteOpen(true)}
                      style={{ marginRight: 'auto', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      Delete
                    </button>
                  )}
                  <button type="button" className="btn btn-secondary" onClick={() => { onClose(); resetForm(); }}>Close</button>
                  {canEdit && (
                    <button type="button" className="btn btn-primary" onClick={() => setMode('form')} style={{ minWidth: 100 }}>Edit</button>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="modal-form" onChangeCapture={() => setDirty(true)}>
          <div className="modal-scroll-area" style={{ gap: 0, padding: 0 }}>

            {/* Section 1: Event Details */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                1 — Event Details
              </div>
              <div className="form-group" style={{ margin: 0, marginBottom: 12 }}>
                <label>Event Name *</label>
                <input type="text" placeholder="e.g. Beach Volleyball Open" value={name} onChange={e => setName(e.target.value)} required className="form-control" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Start Date &amp; Time *</label>
                  <input type="datetime-local" value={startDateTime} onChange={e => setStartDateTime(e.target.value)} required className="form-control" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>End Date &amp; Time *</label>
                  <input type="datetime-local" value={endDateTime} min={startDateTime || undefined} onChange={e => setEndDateTime(e.target.value)} required className="form-control" />
                </div>
              </div>
              <div className="form-group" style={{ margin: 0, marginTop: 12 }}>
                <label>Event Type *</label>
                <select value={type} onChange={e => setType(e.target.value)} required className="form-control select-dark">
                  <option value="">-- Select Event Type --</option>
                  {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Section 2: Location */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                2 — Event Location *
              </div>
              {locationReady && (
                <LocationSelector
                  onLocationSelect={details => {
                    setDirty(true);
                    setLocRoad(details.road);
                    setLocBuilding(details.building);
                    setLocLevelSpace(details.levelSpace);
                    if (details.commonName) setLocCommonName(details.commonName);
                    if (details.postalCode) setLocPostalCode(details.postalCode);
                    setLocLat(details.lat);
                    setLocLng(details.lng);
                    if (details.tags.length > 0) setLocTagsStr(details.tags.join(', '));
                    setLocationSelected(!!(details.building || details.road || details.commonName));
                  }}
                  initialRoad={locRoad}
                  initialBuilding={locBuilding}
                  initialLevelSpace={locLevelSpace}
                  initialCommonName={locCommonName}
                  initialPostalCode={locPostalCode}
                />
              )}

              <div style={{ marginTop: 14 }}>
                <BoundaryMapDrawer
                  center={{ lat: locLat, lng: locLng }}
                  initialBoundary={editingEvent?.boundaryCoordinates}
                  onBoundaryChange={(pts) => { setDirty(true); setBoundary(pts); }}
                  disabled={!locationSelected}
                />
              </div>
            </div>

            {/* Section 3: Description */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                3 — Description <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </div>
              <textarea placeholder="Free text event details..." value={description} onChange={e => setDescription(e.target.value)} className="form-control" rows={3} />
            </div>

            {(sourceEDiaryId || editingEvent?.sourceEDiaryId) && (
              <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Linked e-Diary: <strong className="mono-id" style={{ marginLeft: 4 }}>{sourceEDiaryId || editingEvent?.sourceEDiaryId}</strong>
                </span>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 20px', fontSize: 12, color: '#EF4444', fontWeight: 600 }}>{error}</div>
            )}
          </div>

          <div className="modal-actions-bar">
            <button type="button" className="btn btn-secondary" onClick={handleCancelForm}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !type} style={{ minWidth: 140 }}>
              {submitting ? 'Saving…' : isEdit ? 'SAVE CHANGES' : 'CREATE EVENT'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

function ViewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="form-group" style={{ margin: 0, marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>{label}</label>
      {mono ? (
        <span className="mono-id" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-bg)', borderColor: 'var(--color-primary-border)', fontSize: 12 }}>{value}</span>
      ) : (
        <p style={{ fontSize: 13.5, color: 'var(--text-main)', fontWeight: 500, margin: 0 }}>{value}</p>
      )}
    </div>
  );
}
