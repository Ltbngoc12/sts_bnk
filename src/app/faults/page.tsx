'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Fault } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getFaultTaxonomy } from '@/lib/taxonomy';
import LocationSelector from '@/components/LocationSelector';

interface FaultStats {
  total: number;
  created: number;
  pendingSubmission: number;
  closed: number;
}

function faultStatusBadge(status: string) {
  switch (status) {
    case 'Closed':           return 'badge badge-closed';
    case 'Pending Submission': return 'badge badge-ack';
    case 'Created':          return 'badge badge-live';
    default:                 return 'badge badge-closed';
  }
}

export default function FaultsPage() {
  const { role, username } = useRole();

  const [faults, setFaults] = useState<Fault[]>([]);
  const [stats, setStats] = useState<FaultStats>({ total: 0, created: 0, pendingSubmission: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [faultTaxonomy, setFaultTaxonomy] = useState<Record<string, string[]>>({});

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create Fault Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formFaultType, setFormFaultType] = useState('');
  const [formFaultSubType, setFormFaultSubType] = useState('');
  // Location hierarchy fields (mirrors incident location)
  const [locRoad, setLocRoad] = useState('');
  const [locBuilding, setLocBuilding] = useState('');
  const [locLevelSpace, setLocLevelSpace] = useState('');
  const [locCommonName, setLocCommonName] = useState('');
  const [locNearAt, setLocNearAt] = useState('');
  const [locPostalCode, setLocPostalCode] = useState('098001');
  const [locTagsStr, setLocTagsStr] = useState('');
  const [locLat, setLocLat] = useState(1.2500);
  const [locLng, setLocLng] = useState(103.8300);
  const [locManualPin, setLocManualPin] = useState(false);
  // Attachments
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ faultId?: string } | null>(null);
  const [submittingFaultId, setSubmittingFaultId] = useState<string | null>(null);

  // CMMS status lookup
  const [cmmsStatusMap, setCmmsStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setFaultTaxonomy(getFaultTaxonomy());
  }, []);

  const fetchFaults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('faultType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/faults?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFaults(data.faults || []);
        setStats(data.stats || { total: 0, created: 0, pendingSubmission: 0, closed: 0 });
      }
    } catch (err) {
      console.error('Error fetching faults:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchFaults();
  }, [fetchFaults]);

  // Reset sub-type when type changes
  useEffect(() => {
    setFormFaultSubType('');
  }, [formFaultType]);

  const handleCreateFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFaultType || !formFaultSubType || !formDescription.trim() || submitting) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch('/api/faults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faultType: formFaultType,
          faultSubType: formFaultSubType,
          location: {
            road: locRoad,
            building: locBuilding,
            levelSpace: locLevelSpace,
            nearAt: locNearAt,
            commonName: locCommonName || locBuilding || locRoad || 'Sentosa Island',
            postalCode: locPostalCode || '098001',
            tags: locTagsStr.split(',').map(t => t.trim()).filter(Boolean),
            lat: locLat,
            lng: locLng,
          },
          description: formDescription,
          attachments: attachments.map(f => f.name),
          username,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubmitResult({ faultId: data.fault?.id });
        setTimeout(() => {
          setShowCreateModal(false);
          setSubmitResult(null);
          resetForm();
          fetchFaults();
        }, 2500);
      } else {
        const err = await res.json();
        alert(`Failed to save fault: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to create fault:', err);
    } finally {
      setSubmitting(false);
    }
  };

  function resetForm() {
    setFormFaultType('');
    setFormFaultSubType('');
    setLocRoad('');
    setLocBuilding('');
    setLocLevelSpace('');
    setLocCommonName('');
    setLocNearAt('');
    setLocPostalCode('098001');
    setLocTagsStr('');
    setLocLat(1.2500);
    setLocLng(103.8300);
    setLocManualPin(false);
    setAttachments([]);
    setFormDescription('');
  }

  async function fetchCmmsStatus(ticketId: string) {
    if (cmmsStatusMap[ticketId] || !ticketId) return;
    try {
      const res = await fetch(`/api/cmms-mock?ticketId=${encodeURIComponent(ticketId)}`);
      if (res.ok) {
        const data = await res.json();
        setCmmsStatusMap(prev => ({ ...prev, [ticketId]: data.status }));
      }
    } catch (_) { /* silent */ }
  }

  async function handleSubmitFault(faultId: string) {
    if (submittingFaultId) return;
    setSubmittingFaultId(faultId);
    try {
      const encodedId = faultId.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/faults/${encodedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', username }),
      });
      if (res.ok) {
        await fetchFaults();
      } else {
        const err = await res.json();
        alert(`Failed to submit fault: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to submit fault:', err);
    } finally {
      setSubmittingFaultId(null);
    }
  }

  const filteredFaults = faults.filter(f => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      f.id.toLowerCase().includes(term) ||
      f.caseId.toLowerCase().includes(term) ||
      f.faultType.toLowerCase().includes(term) ||
      f.faultSubType.toLowerCase().includes(term) ||
      f.description.toLowerCase().includes(term) ||
      (f.cmmsTicketId || '').toLowerCase().includes(term) ||
      f.location.commonName.toLowerCase().includes(term)
    );
  });

  const isController = ['Controller', 'Duty Manager', 'Duty Officer', 'System Administrator'].includes(role);

  return (
    <>
      {/* Header */}
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>FAULT REPORTING LOG</h1>
          <p>Infrastructure defects submitted to IFM CMMS &bull; CMS captures entry point and stores Fault ID reference</p>
        </div>
        {isController && (
          <button className="btn btn-primary" onClick={() => { setShowCreateModal(true); setSubmitResult(null); }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            LOG NEW FAULT
          </button>
        )}
      </div>

      {/* Stats strip */}
      <div className="glass" style={{ display: 'flex', gap: 24, padding: '10px 20px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--text-main)' }}>{stats.total}</strong></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Created: <strong style={{ color: 'var(--color-critical)' }}>{stats.created}</strong></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending Submission: <strong style={{ color: 'var(--color-high)' }}>{stats.pendingSubmission}</strong></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Closed (CMMS received): <strong style={{ color: 'var(--color-active)' }}>{stats.closed}</strong></div>
      </div>

      {/* Filter panel */}
      <div className="filter-panel glass">
        <div className="search-group" style={{ flex: 2 }}>
          <input
            type="text"
            placeholder="Search by Fault ID, Case ID, Type, CMMS Ticket, Location..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control select-dark" style={{ flex: 1 }}>
          <option value="">All Types</option>
          {Object.keys(faultTaxonomy).sort().map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-control select-dark" style={{ flex: 1 }}>
          <option value="">All Statuses</option>
          <option value="Created">Created</option>
          <option value="Pending Submission">Pending Submission</option>
          <option value="Closed">Closed</option>
        </select>
      </div>

      {/* Fault list */}
      <div className="cases-list-container glass">
        {loading ? (
          <div className="cases-loading">Loading fault register...</div>
        ) : filteredFaults.length === 0 ? (
          <div className="empty-cases">No infrastructure faults match the current filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Fault ID</th>
                  <th>Fault Type / Sub-type</th>
                  <th>Location</th>
                  <th>Description</th>
                  <th>CMMS Ticket</th>
                  <th>Status</th>
                  <th>Linked Case</th>
                  <th>Logged By</th>
                  <th>Date Logged</th>
                  {isController && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filteredFaults.map(f => (
                  <tr key={f.id} onClick={() => window.location.href = `/faults/${f.id}`} style={{ cursor: 'pointer' }}>
                    <td className="case-id-cell">
                      <Link
                        href={`/faults/${f.id}`}
                        onClick={e => e.stopPropagation()}
                        style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 11, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
                      >
                        {f.id}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12 }}>{f.faultType}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.faultSubType}</div>
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.location.commonName || f.location.road || '—'}
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.description}
                    </td>
                    <td onClick={e => { e.stopPropagation(); if (f.cmmsTicketId) fetchCmmsStatus(f.cmmsTicketId); }}>
                      {f.cmmsTicketId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span className="cmms-pill" style={{ cursor: 'pointer' }}>{f.cmmsTicketId}</span>
                          {cmmsStatusMap[f.cmmsTicketId] && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>CMMS: {cmmsStatusMap[f.cmmsTicketId]}</span>
                          )}
                          {!cmmsStatusMap[f.cmmsTicketId] && (
                            <span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }}>↻ Check CMMS</span>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Not submitted</span>
                      )}
                    </td>
                    <td>
                      <span className={faultStatusBadge(f.status)}>{f.status}</span>
                    </td>
                    <td>
                      <Link
                        href={`/cases/${f.caseId}`}
                        onClick={e => e.stopPropagation()}
                        style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: 11, textDecoration: 'none' }}
                      >
                        {f.caseId}
                      </Link>
                      {f.linkedIncidentId && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          via {f.linkedIncidentId}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.createdBy}</td>
                    <td className="date-cell">
                      {new Date(f.createdAt).toLocaleDateString('en-SG')}{' '}
                      {new Date(f.createdAt).toLocaleTimeString('en-SG', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                    </td>
                    {isController && (
                      <td onClick={e => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                        {f.status === 'Created' && (
                          <button
                            className="btn btn-primary btn-xs"
                            disabled={submittingFaultId === f.id}
                            onClick={() => handleSubmitFault(f.id)}
                            style={{ fontSize: 10, padding: '4px 10px', whiteSpace: 'nowrap' }}
                          >
                            {submittingFaultId === f.id ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
                                Submitting
                              </span>
                            ) : 'Submit to CMMS'}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Fault Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 700, width: '100%' }}>

            {/* Header */}
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-main)' }}>
                  LOG STANDALONE INFRASTRUCTURE FAULT
                </h2>
                <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
                  Fault saved as draft (Created). Submit to IFM CMMS separately from the fault list.
                </p>
              </div>
              <button className="close-btn" onClick={() => { setShowCreateModal(false); resetForm(); setSubmitResult(null); }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {submitResult ? (
              <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-active-bg, #E6F9F0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="24" height="24" fill="none" stroke="var(--color-active)" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                </div>
                <div style={{ color: 'var(--color-active)', fontWeight: 700, fontSize: 15 }}>Fault saved as draft</div>
                {submitResult.faultId && (
                  <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
                    Fault ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 700 }}>{submitResult.faultId}</code>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                  Status: Created. Click <strong>Submit to CMMS</strong> in the fault list when ready to send to IFM.
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateFault} className="modal-form">
                <div className="modal-scroll-area" style={{ gap: 0, padding: 0 }}>

                  {/* Section 1: Fault Classification */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                      1 — Fault Classification
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Fault Type *</label>
                        <select
                          value={formFaultType}
                          onChange={e => setFormFaultType(e.target.value)}
                          required
                          className="form-control select-dark"
                        >
                          <option value="">-- Select Type --</option>
                          {Object.keys(faultTaxonomy).sort().map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Fault Sub-type *</label>
                        <select
                          value={formFaultSubType}
                          onChange={e => setFormFaultSubType(e.target.value)}
                          required
                          disabled={!formFaultType}
                          className="form-control select-dark"
                        >
                          <option value="">-- Select Sub-type --</option>
                          {formFaultType && faultTaxonomy[formFaultType]?.map(st => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Location */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                      2 — Location
                    </div>
                    <LocationSelector
                      onLocationSelect={details => {
                        setLocRoad(details.road);
                        setLocBuilding(details.building);
                        setLocLevelSpace(details.levelSpace);
                        if (details.commonName) setLocCommonName(details.commonName);
                        if (details.postalCode) setLocPostalCode(details.postalCode);
                        if (details.lat !== 1.2500 || details.lng !== 103.8300) {
                          setLocLat(details.lat);
                          setLocLng(details.lng);
                        }
                        if (details.tags.length > 0) setLocTagsStr(details.tags.join(', '));
                      }}
                      initialRoad={locRoad}
                      initialBuilding={locBuilding}
                      initialLevelSpace={locLevelSpace}
                      initialCommonName={locCommonName}
                      initialPostalCode={locPostalCode}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Common Name / Landmark</label>
                        <input
                          type="text"
                          placeholder="e.g. Siloso Beach Station Carpark Entrance"
                          value={locCommonName}
                          onChange={e => setLocCommonName(e.target.value)}
                          className="form-control"
                        />
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label>Beside / Near To / At</label>
                        <input
                          type="text"
                          placeholder="e.g. Near public shower block"
                          value={locNearAt}
                          onChange={e => setLocNearAt(e.target.value)}
                          className="form-control"
                        />
                      </div>
                    </div>

                    {/* Minimap pin drop */}
                    <div style={{ marginTop: 14 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                        Interactive Minimap (Pin Drop)
                      </label>
                      <div style={{ height: 180, background: '#EAF2E6', border: '1px solid var(--border-color)', borderRadius: 8, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* Grid bg */}
                        <div style={{ position: 'absolute', inset: 0, backgroundSize: '20px 20px', backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px)' }} />
                        {/* Beach */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: '#FFEAA7', borderTop: '2px dashed #E5BA73' }} />
                        {/* Sea */}
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: '#74B9FF' }} />
                        {/* Pin */}
                        <div style={{ position: 'absolute', fontSize: 22, left: locManualPin ? '60%' : '38%', top: locManualPin ? '28%' : '42%', marginTop: -22, marginLeft: -11, zIndex: 10, animation: 'bounce 1s infinite alternate' }}>📍</div>
                        {/* Coords overlay */}
                        <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,0.95)', padding: '4px 9px', borderRadius: 4, fontSize: 11, border: '1px solid var(--border-color)', pointerEvents: 'none' }}>
                          <strong>Pin:</strong> {locLat.toFixed(4)}, {locLng.toFixed(4)} {locManualPin ? '(Manual)' : '(Resolved)'}
                        </div>
                      </div>
                      <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => {
                            if (!locManualPin) {
                              setLocManualPin(true);
                              setLocLat(1.2562);
                              setLocLng(103.8124);
                            } else {
                              setLocManualPin(false);
                              setLocLat(1.2500);
                              setLocLng(103.8300);
                            }
                          }}
                        >
                          {locManualPin ? 'Clear Pin Drop' : 'Place Pin Manually'}
                        </button>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Manual pin placement overrides postal code coordinates.</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Description */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                      4 — Fault Description
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Description *</label>
                      <textarea
                        placeholder="Describe the defect, dimensions, and impact on visitor flow..."
                        value={formDescription}
                        onChange={e => setFormDescription(e.target.value)}
                        required
                        className="form-control"
                        rows={4}
                      />
                    </div>
                  </div>

                  {/* Section 4: Attachments */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                      5 — Attachments <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </div>
                    <div
                      style={{ border: '2px dashed var(--border-color)', borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-inset)', transition: 'border-color 0.15s, background 0.15s' }}
                      onClick={() => attachInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'; }}
                      onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                      onDrop={e => {
                        e.preventDefault();
                        (e.currentTarget as HTMLElement).style.borderColor = '';
                        const dropped = Array.from(e.dataTransfer.files);
                        setAttachments(prev => [...prev, ...dropped]);
                      }}
                    >
                      <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 6px' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Click to upload or drag & drop</div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 2 }}>Photos, PDF, Word documents</div>
                      <input
                        ref={attachInputRef}
                        type="file"
                        multiple
                        accept="image/*,.pdf,.doc,.docx"
                        style={{ display: 'none' }}
                        onChange={e => {
                          const picked = Array.from(e.target.files || []);
                          setAttachments(prev => [...prev, ...picked]);
                          e.target.value = '';
                        }}
                      />
                    </div>
                    {attachments.length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {attachments.map((f, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '6px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%', color: 'var(--text-sub)' }}>
                              📎 {f.name} <span style={{ color: 'var(--text-faint)', marginLeft: 4 }}>({(f.size / 1024).toFixed(0)} KB)</span>
                            </span>
                            <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, padding: '0 4px', lineHeight: 1 }} onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Info note */}
                  <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" strokeWidth="1.5"/><path strokeLinecap="round" strokeWidth="1.5" d="M12 8v4m0 4h.01"/></svg>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                      A new Case will be auto-created to house this fault. After saving, use the <strong>Submit to CMMS</strong> action in the fault list or fault detail page to send it to IFM CMMS.
                    </span>
                  </div>

                </div>

                {/* Sticky footer actions */}
                <div className="modal-actions-bar">
                  <button type="button" className="btn btn-secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>Cancel</button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || !formFaultType || !formFaultSubType}
                    style={{ minWidth: 160 }}
                  >
                    {submitting ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
                        Saving...
                      </span>
                    ) : 'SAVE FAULT'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
