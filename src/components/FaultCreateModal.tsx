'use client';

import React, { useState, useEffect, useRef } from 'react';
import LocationSelector from '@/components/LocationSelector';
import { getFaultTaxonomy } from '@/lib/taxonomy';
import { Case } from '@/lib/db';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';

interface PrefillLocation {
  road?: string;
  building?: string;
  levelSpace?: string;
  nearAt?: string;
  commonName?: string;
  postalCode?: string;
  tags?: string[];
  lat?: number;
  lng?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  linkedIncidentId?: string;
  linkedCaseId?: string;
  prefillLocation?: PrefillLocation;
  /** Set when creating a Fault from an e-Diary entry — reference is retained on the Fault record. */
  sourceEDiaryId?: string;
  prefillDescription?: string;
  username: string;
}

export default function FaultCreateModal({
  isOpen,
  onClose,
  onSuccess,
  linkedIncidentId,
  linkedCaseId,
  prefillLocation,
  sourceEDiaryId,
  prefillDescription,
  username,
}: Props) {
  const [faultTaxonomy, setFaultTaxonomy] = useState<Record<string, string[]>>({});
  const [formFaultType, setFormFaultType] = useState('');
  const [formFaultSubType, setFormFaultSubType] = useState('');
  const [locRoad, setLocRoad] = useState('');
  const [locBuilding, setLocBuilding] = useState('');
  const [locLevelSpace, setLocLevelSpace] = useState('');
  const [locCommonName, setLocCommonName] = useState('');
  const [locNearAt, setLocNearAt] = useState('');
  const [locPostalCode, setLocPostalCode] = useState('098001');
  const [locTagsStr, setLocTagsStr] = useState('');
  const [locLat, setLocLat] = useState(1.25);
  const [locLng, setLocLng] = useState(103.83);
  const [locManualPin, setLocManualPin] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ faultId?: string } | null>(null);
  // locationReady ensures LocationSelector only mounts after location state is populated
  const [locationReady, setLocationReady] = useState(false);

  // Link-to-case dropdown (standalone faults only — linked faults already know their case)
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('new-case');
  const [selectedCase, setSelectedCase] = useState<{ id: string; title: string }>({ id: 'NEW CASE', title: 'Auto-create new case' });
  const [caseSearchText, setCaseSearchText] = useState('');
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const { setDirty, requestLeave } = useUnsavedChanges();

  useEffect(() => {
    setFaultTaxonomy(getFaultTaxonomy());
  }, []);

  useEffect(() => {
    if (!isOpen || linkedIncidentId || linkedCaseId) return;
    fetch('/api/cases')
      .then(res => (res.ok ? res.json() : []))
      .then((data: Case[]) => setCases(data))
      .catch(() => {});
  }, [isOpen, linkedIncidentId, linkedCaseId]);

  useEffect(() => {
    setFormFaultSubType('');
  }, [formFaultType]);

  useEffect(() => {
    if (!isOpen) {
      setLocationReady(false);
      return;
    }
    resetForm();
    setDirty(false);
    if (prefillDescription) setFormDescription(prefillDescription);
    if (prefillLocation) {
      setLocRoad(prefillLocation.road || '');
      setLocBuilding(prefillLocation.building || '');
      setLocLevelSpace(prefillLocation.levelSpace || '');
      setLocCommonName(prefillLocation.commonName || '');
      setLocNearAt(prefillLocation.nearAt || '');
      setLocPostalCode(prefillLocation.postalCode || '098001');
      if (prefillLocation.tags?.length) setLocTagsStr(prefillLocation.tags.join(', '));
      if (prefillLocation.lat) setLocLat(prefillLocation.lat);
      if (prefillLocation.lng) setLocLng(prefillLocation.lng);
    }
    setLocationReady(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

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
    setLocLat(1.25);
    setLocLng(103.83);
    setLocManualPin(false);
    setAttachments([]);
    setFormDescription('');
    setSubmitResult(null);
    setSelectedCaseId('new-case');
    setSelectedCase({ id: 'NEW CASE', title: 'Auto-create new case' });
    setCaseSearchText('');
    setShowCaseDropdown(false);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFaultType || !formFaultSubType || !formDescription.trim() || submitting) return;
    setSubmitting(true);
    const resolvedCaseId = linkedCaseId || (selectedCaseId !== 'new-case' ? selectedCaseId : undefined);
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
          ...(linkedIncidentId && { linkedIncidentId }),
          ...(resolvedCaseId && { caseId: resolvedCaseId }),
          ...(sourceEDiaryId && { sourceEDiaryId }),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setDirty(false);
        setSubmitResult({ faultId: data.fault?.id });
        setTimeout(() => {
          onSuccess();
          onClose();
          resetForm();
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

  if (!isOpen) return null;

  const isLinked = !!(linkedIncidentId || linkedCaseId);
  const secCaseLink = isLinked ? 0 : 1;
  const secClassification = secCaseLink + 1;
  const secLocation = secClassification + 1;
  const secDescription = secLocation + 1;
  const secAttachments = secDescription + 1;

  const activeCases = cases.filter(c => c.status !== 'Closed');
  const filteredCases = activeCases.filter(c => {
    if (!caseSearchText.trim()) return true;
    const q = caseSearchText.toLowerCase();
    return c.id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q);
  });

  return (
    <div className="modal-backdrop">
      <style jsx global>{`
        .search-select-option:hover { background: var(--bg-hover) !important; }
        .create-new-opt:hover { background: var(--color-primary-bg) !important; color: var(--color-primary-dark) !important; }
      `}</style>
      <div className="create-case-modal glass" style={{ maxWidth: 700, width: '100%' }}>

        {/* Header */}
        <div className="modal-header" style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-main)' }}>
              {isLinked ? 'RAISE LINKED INFRASTRUCTURE FAULT' : 'LOG STANDALONE INFRASTRUCTURE FAULT'}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
              {sourceEDiaryId
                ? `Created from e-Diary entry ${sourceEDiaryId} — reference will be retained. Fault saved as draft — submit to IFM CMMS from the fault list or fault detail page.`
                : linkedIncidentId
                ? 'Location pre-filled from incident. Fault saved as draft — submit to IFM CMMS from the fault list or fault detail page.'
                : 'Fault saved as draft. Submit to IFM CMMS separately from the fault list.'}
            </p>
          </div>
          <button className="close-btn" onClick={() => requestLeave(() => { onClose(); resetForm(); })}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {submitResult ? (
          <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--color-active-bg, #E6F9F0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="24" height="24" fill="none" stroke="var(--color-active)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div style={{ color: 'var(--color-active)', fontWeight: 700, fontSize: 15 }}>Fault logged successfully</div>
            {submitResult.faultId && (
              <div style={{ fontSize: 13, color: 'var(--text-sub)' }}>
                Fault ID: <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', fontWeight: 700 }}>{submitResult.faultId}</code>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              Status: Pending Submission. Click <strong>Submit to CMMS</strong> from the fault list or fault detail page to send to IFM.
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form" onChangeCapture={() => setDirty(true)}>
            <div className="modal-scroll-area" style={{ gap: 0, padding: 0 }}>

              {/* Section: Link to Case (standalone faults only) */}
              {!isLinked && (
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                    {secCaseLink} — Link to Case
                  </div>
                  <div className="form-group" style={{ margin: 0, position: 'relative' }}>
                    <label>Link to Parent Case *</label>

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
                        fontSize: '13px',
                      }}
                    >
                      <span>{selectedCase.id} - {selectedCase.title}</span>
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
                          overflow: 'hidden',
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
                            style={{ fontSize: '12px', height: '30px', padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
                            autoFocus
                          />
                        </div>

                        {/* Options list */}
                        <div style={{ overflowY: 'auto', flex: 1, maxHeight: '200px' }}>
                          {/* Option: Auto-create new case */}
                          <div
                            onClick={() => {
                              setDirty(true);
                              setSelectedCaseId('new-case');
                              setSelectedCase({ id: 'NEW CASE', title: 'Auto-create new case' });
                              setShowCaseDropdown(false);
                              setCaseSearchText('');
                            }}
                            className="search-select-option create-new-opt"
                            style={{
                              padding: '8px 12px',
                              cursor: 'pointer',
                              fontSize: '12.5px',
                              color: 'var(--color-primary)',
                              fontWeight: 600,
                              borderBottom: '1px solid var(--border-color)',
                              background: selectedCaseId === 'new-case' ? 'var(--bg-hover)' : 'transparent',
                            }}
                          >
                            ➕ Auto-create new case
                          </div>

                          {/* Filtered Active Cases */}
                          {filteredCases.map(c => {
                            const isSelected = selectedCaseId === c.id;
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  setDirty(true);
                                  setSelectedCaseId(c.id);
                                  setSelectedCase(c);
                                  setShowCaseDropdown(false);
                                  setCaseSearchText('');
                                }}
                                className="search-select-option"
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  fontSize: '12.5px',
                                  color: isSelected ? 'var(--color-primary)' : 'var(--text-main)',
                                  background: isSelected ? 'var(--bg-hover)' : 'transparent',
                                }}
                              >
                                {c.id} - {c.title}
                              </div>
                            );
                          })}

                          {/* Empty results */}
                          {filteredCases.length === 0 && (
                            <div style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                              No cases found
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section: Fault Classification */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  {secClassification} — Fault Classification
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

              {/* Section: Location */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  {secLocation} — Location
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
                      if (details.lat !== 1.25 || details.lng !== 103.83) {
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
                )}
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

                {/* Minimap */}
                <div style={{ marginTop: 14 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                    Interactive Minimap (Pin Drop)
                  </label>
                  <div style={{ height: 180, background: '#EAF2E6', border: '1px solid var(--border-color)', borderRadius: 8, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundSize: '20px 20px', backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: '#FFEAA7', borderTop: '2px dashed #E5BA73' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 28, background: '#74B9FF' }} />
                    <div style={{ position: 'absolute', fontSize: 22, left: locManualPin ? '60%' : '38%', top: locManualPin ? '28%' : '42%', marginTop: -22, marginLeft: -11, zIndex: 10, animation: 'bounce 1s infinite alternate' }}>📍</div>
                    <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,0.95)', padding: '4px 9px', borderRadius: 4, fontSize: 11, border: '1px solid var(--border-color)', pointerEvents: 'none' }}>
                      <strong>Pin:</strong> {locLat.toFixed(4)}, {locLng.toFixed(4)} {locManualPin ? '(Manual)' : '(Resolved)'}
                    </div>
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => {
                        setDirty(true);
                        if (!locManualPin) {
                          setLocManualPin(true);
                          setLocLat(1.2562);
                          setLocLng(103.8124);
                        } else {
                          setLocManualPin(false);
                          setLocLat(1.25);
                          setLocLng(103.83);
                        }
                      }}
                    >
                      {locManualPin ? 'Clear Pin Drop' : 'Place Pin Manually'}
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Manual pin placement overrides postal code coordinates.</span>
                  </div>
                </div>
              </div>

              {/* Section: Description */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  {secDescription} — Fault Description
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Description *</label>
                  <textarea
                    placeholder="Describe the defect, its impact and location specifics..."
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    required
                    className="form-control"
                    rows={4}
                  />
                </div>
              </div>

              {/* Section: Attachments */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                  {secAttachments} — Attachments <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 10, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                </div>
                <div
                  style={{ border: '2px dashed var(--border-color)', borderRadius: 8, padding: '20px 16px', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-inset)', transition: 'border-color 0.15s, background 0.15s' }}
                  onClick={() => attachInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--color-primary)'; }}
                  onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                  onDrop={e => {
                    e.preventDefault();
                    (e.currentTarget as HTMLElement).style.borderColor = '';
                    setDirty(true);
                    setAttachments(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
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
                      setAttachments(prev => [...prev, ...Array.from(e.target.files || [])]);
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
                        <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 14, padding: '0 4px', lineHeight: 1 }} onClick={() => { setDirty(true); setAttachments(prev => prev.filter((_, idx) => idx !== i)); }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info note */}
              <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-faint)', flexShrink: 0, marginTop: 1 }}>
                  <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
                  <path strokeLinecap="round" strokeWidth="1.5" d="M12 8v4m0 4h.01"/>
                </svg>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
                  {linkedIncidentId
                    ? <>Fault will be linked to incident <strong>{linkedIncidentId}</strong>. After saving, use <strong>Submit to CMMS</strong> in the fault list to send to IFM CMMS.</>
                    : linkedCaseId
                      ? <>Fault will be linked to case <strong>{linkedCaseId}</strong>{sourceEDiaryId ? <> (from e-Diary entry <strong>{sourceEDiaryId}</strong>)</> : null}. After saving, use the <strong>Submit to CMMS</strong> action in the fault list or fault detail page to send it to IFM CMMS.</>
                      : selectedCaseId !== 'new-case'
                        ? <>Fault will be linked to case <strong>{selectedCaseId}</strong>. After saving, use the <strong>Submit to CMMS</strong> action in the fault list or fault detail page to send it to IFM CMMS.</>
                        : <>A new Case will be auto-created to house this fault. After saving, use the <strong>Submit to CMMS</strong> action in the fault list or fault detail page to send it to IFM CMMS.</>
                  }
                </span>
              </div>
            </div>

            {/* Sticky footer */}
            <div className="modal-actions-bar">
              <button type="button" className="btn btn-secondary" onClick={() => requestLeave(() => { onClose(); resetForm(); })}>Cancel</button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || !formFaultType || !formFaultSubType}
                style={{ minWidth: 160 }}
              >
                {submitting ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/>
                    </svg>
                    Saving...
                  </span>
                ) : 'SAVE FAULT'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
