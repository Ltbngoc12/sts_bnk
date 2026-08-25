'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Fault, Case, Incident } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CmmsTicketData {
  ticketId: string;
  location: string;
  description: string;
  severity: string;
  status: string;
  assignedTo: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function faultStatusBadge(status: string) {
  switch (status) {
    case 'Closed':             return 'badge badge-closed';
    case 'Pending Submission': return 'badge badge-ack';
    default:                   return 'badge badge-closed';
  }
}

function cmmsStatusColor(status: string) {
  switch (status) {
    case 'Open':              return 'var(--color-critical)';
    case 'Assigned':          return 'var(--color-high)';
    case 'In Progress':       return 'var(--color-active)';
    case 'Pending Materials': return 'var(--color-review)';
    case 'Completed':         return 'var(--color-active)';
    case 'Closed':            return 'var(--color-closed)';
    default:                  return 'var(--text-muted)';
  }
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
      padding: '9px 0', borderBottom: '1px solid var(--border-color)',
      fontSize: 13, gap: 12,
    }}>
      <span style={{ color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0, minWidth: 140 }}>{label}</span>
      <span style={{ color: 'var(--text-main)', fontWeight: 500, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function LocationField({ label, value, right }: { label: string; value?: string; right?: boolean }) {
  return (
    <div style={{
      padding: '10px 14px',
      borderBottom: '1px solid var(--border-color)',
      borderLeft: right ? '1px solid var(--border-color)' : undefined,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: value ? 'var(--text-main)' : 'var(--text-faint)', fontStyle: value ? 'normal' : 'italic' }}>
        {value || '—'}
      </div>
    </div>
  );
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext)) return '🖼';
  if (ext === 'pdf') return '📄';
  if (['doc', 'docx'].includes(ext)) return '📝';
  return '📎';
}

function AttachmentRow({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 6 }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{getFileIcon(name)}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span>
      <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{name.split('.').pop()?.toUpperCase()}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FaultDetailPage() {
  const params = useParams();
  const idArray = (params?.id as string[]) || [];
  const faultId = idArray.join('/');
  const { role, username } = useRole();

  const [fault, setFault] = useState<Fault | null>(null);
  const [parentCase, setParentCase] = useState<Case | null>(null);
  const [linkedIncident, setLinkedIncident] = useState<Incident | null>(null);
  const [cmmsData, setCmmsData] = useState<CmmsTicketData | null>(null);
  const [cmmsLoading, setCmmsLoading] = useState(false);
  const [cmmsError, setCmmsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submittingToCmms, setSubmittingToCmms] = useState(false);

  const loadFault = useCallback(async () => {
    if (!faultId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/faults/${faultId}`);
      if (!res.ok) throw new Error('Fault not found');
      const f: Fault = await res.json();
      setFault(f);

      // Load parent case and linked incident in parallel
      const [caseRes, incRes] = await Promise.all([
        fetch(`/api/cases/${f.caseId}`),
        f.linkedIncidentId
          ? fetch(`/api/incidents/${f.linkedIncidentId}`)
          : Promise.resolve(null),
      ]);

      if (caseRes.ok) setParentCase(await caseRes.json());
      if (incRes && incRes.ok) setLinkedIncident(await incRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [faultId]);

  useEffect(() => { loadFault(); }, [loadFault]);

  const fetchCmmsStatus = async () => {
    if (!fault?.cmmsTicketId) return;
    setCmmsLoading(true);
    setCmmsError(null);
    try {
      const res = await fetch(`/api/cmms-mock?ticketId=${encodeURIComponent(fault.cmmsTicketId)}`);
      if (res.ok) {
        setCmmsData(await res.json());
      } else {
        const err = await res.json();
        setCmmsError(err.error || 'Unable to retrieve CMMS data');
      }
    } catch (_) {
      setCmmsError('CMMS API unreachable in this session');
    } finally {
      setCmmsLoading(false);
    }
  };

  const handleSubmitToCmms = async () => {
    if (!fault || submittingToCmms) return;
    setSubmittingToCmms(true);
    try {
      const encodedId = fault.id.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/faults/${encodedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', username }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadFault();
        if (!data.cmmsTicketId) {
          alert(`IFM CMMS did not confirm a ticket${data.cmmsError ? ` (${data.cmmsError})` : ''}. The fault remains "Pending Submission" — please try submitting again.`);
        }
      } else {
        const err = await res.json();
        alert(`Failed to submit to CMMS: ${err.error}`);
      }
    } catch (err) {
      console.error('Submit to CMMS failed:', err);
      alert('Failed to submit to CMMS: network error. Please try again.');
    } finally {
      setSubmittingToCmms(false);
    }
  };

  const isController = ['Controller', 'Duty Manager', 'Duty Officer', 'System Administrator', 'Current Ops Administrator'].includes(role);

  // ── Render states ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="loading-container glass">
        <div className="spinner" />
        <span>Loading Fault Record…</span>
      </div>
    );
  }

  if (!fault) {
    return (
      <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--color-critical)' }}>
        <p>Fault record not found.</p>
        <Link href="/case-management?tab=faults" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: 13 }}>← Back to Fault Log</Link>
      </div>
    );
  }

  const timeline = buildTimeline(fault);

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="glass" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <Link href="/case-management?tab=faults" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>
              ← Fault Log
            </Link>
            <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>/</span>
            <span className="mono-id">{fault.id}</span>
            <span className={faultStatusBadge(fault.status)}>{fault.status}</span>
          </div>

          <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: 'var(--text-main)' }}>
            {fault.faultType} — {fault.faultSubType}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Logged {new Date(fault.createdAt).toLocaleString('en-SG')}
            &nbsp;&bull;&nbsp;By: {fault.createdBy}
            {fault.closedAt && ` • Closed ${new Date(fault.closedAt).toLocaleString('en-SG')}`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
          {isController && fault.status === 'Pending Submission' && (
            <button
              className="btn btn-primary btn-sm"
              disabled={submittingToCmms}
              onClick={handleSubmitToCmms}
            >
              {submittingToCmms ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ animation: 'spin 1s linear infinite' }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
                  Submitting…
                </span>
              ) : 'SUBMIT TO IFM CMMS'}
            </button>
          )}
          {fault.linkedIncidentId && (
            <Link href={`/incidents/${fault.linkedIncidentId}`} className="btn btn-secondary btn-sm">
              View Linked Incident
            </Link>
          )}
        </div>
      </div>

      {/* ── Main layout ────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginTop: 16, alignItems: 'start' }}>

        {/* ── Left — main content ────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Fault Details card */}
          <div className="glass" style={{ padding: '16px 20px' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-high)', marginBottom: 12 }}>
              🛠 Fault Details
            </h3>
            <InfoRow label="Fault ID" value={<span className="mono-id" style={{ fontSize: 11 }}>{fault.id}</span>} />
            <InfoRow label="Fault Type" value={fault.faultType} />
            <InfoRow label="Fault Sub-type" value={fault.faultSubType} />
            <InfoRow label="Description" value={
              <span style={{ whiteSpace: 'pre-wrap', textAlign: 'left', display: 'block' }}>{fault.description}</span>
            } />
            <InfoRow label="Created By" value={fault.createdBy} />
            <InfoRow label="Created At" value={new Date(fault.createdAt).toLocaleString('en-SG')} />
            {fault.submittedAt && (
              <InfoRow label="Submitted to CMMS" value={new Date(fault.submittedAt).toLocaleString('en-SG')} />
            )}
            {fault.closedAt && (
              <InfoRow label="Closed At" value={new Date(fault.closedAt).toLocaleString('en-SG')} />
            )}
            {fault.closedBy && (
              <InfoRow label="Closed By" value={fault.closedBy} />
            )}
          </div>

          {/* Location card */}
          <div className="glass" style={{ padding: '16px 20px' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary)', marginBottom: 14 }}>
              📍 Location
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border-color)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-inset)' }}>
              <LocationField label="Road Name" value={fault.location.road} />
              <LocationField label="Building Name" value={fault.location.building} right />
              <LocationField label="Level / Space" value={fault.location.levelSpace} />
              <LocationField label="Common Name / Landmark" value={fault.location.commonName} right />
              <LocationField label="Beside / Near To / At" value={fault.location.nearAt} />
              <LocationField label="Postal Code" value={fault.location.postalCode && fault.location.postalCode !== '000000' ? fault.location.postalCode : undefined} right />
            </div>
            {fault.location.tags && fault.location.tags.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 6 }}>Location Tags</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {fault.location.tags.map(tag => (
                    <span key={tag} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--color-primary-bg)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-border)', borderRadius: 12, fontWeight: 500 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(fault.location.lat !== 1.2500 || fault.location.lng !== 103.8300) && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-faint)', flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6.5a2.5 2.5 0 010 5z"/></svg>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                  {fault.location.lat.toFixed(4)}, {fault.location.lng.toFixed(4)}
                </span>
              </div>
            )}
          </div>

          {/* Attachments card */}
          <div className="glass" style={{ padding: '16px 20px' }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
              📎 Attachments
            </h3>
            {!fault.attachments || fault.attachments.length === 0 ? (
              <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                No attachments were submitted with this fault record.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fault.attachments.map((name, i) => (
                  <AttachmentRow key={i} name={name} />
                ))}
              </div>
            )}
          </div>

          {/* IFM CMMS Ticket card */}
          <div className="glass" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-info)' }}>
                📋 IFM CMMS Work Order
              </h3>
              {fault.cmmsTicketId && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={fetchCmmsStatus}
                  disabled={cmmsLoading}
                  style={{ fontSize: 11 }}
                >
                  {cmmsLoading ? 'Fetching…' : '↻ Refresh CMMS Status'}
                </button>
              )}
            </div>

            {!fault.cmmsTicketId ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 13 }}>
                No CMMS ticket has been issued for this fault record.
              </div>
            ) : (
              <>
                <InfoRow
                  label="CMMS Ticket ID"
                  value={
                    <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-info)' }}>
                      {fault.cmmsTicketId}
                    </code>
                  }
                />

                {cmmsData ? (
                  <>
                    <InfoRow
                      label="CMMS Status"
                      value={
                        <span style={{ fontWeight: 700, color: cmmsStatusColor(cmmsData.status) }}>
                          ● {cmmsData.status}
                        </span>
                      }
                    />
                    <InfoRow label="Assigned Contractor" value={cmmsData.assignedTo} />
                    <InfoRow label="CMMS Location" value={cmmsData.location} />
                    <InfoRow label="CMMS Description" value={cmmsData.description} />
                    <InfoRow label="Last Updated (CMMS)" value={new Date(cmmsData.updatedAt).toLocaleString('en-SG')} />
                  </>
                ) : cmmsError ? (
                  <div style={{ padding: '12px 0', color: 'var(--color-high)', fontSize: 12 }}>
                    ⚠ {cmmsError}
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                      CMMS data is only available for tickets raised in the current server session. The CMMS Ticket ID is stored permanently on this record for reference.
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: '14px 0', textAlign: 'center', color: 'var(--text-faint)', fontSize: 12 }}>
                    Click <strong>↻ Refresh CMMS Status</strong> to retrieve live work order data from IFM CMMS.
                    <br />
                    <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                      The CMS stores the Fault ID reference only. IFM CMMS manages the full work order lifecycle independently.
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Linked Incident card */}
          {fault.linkedIncidentId && (
            <div className="glass" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-critical)', marginBottom: 12 }}>
                🚨 Linked Incident
              </h3>
              {linkedIncident ? (
                <>
                  <InfoRow label="Incident ID" value={
                    <Link href={`/incidents/${linkedIncident.id}`} style={{ color: 'var(--color-primary)', fontWeight: 700, textDecoration: 'none', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                      {linkedIncident.id}
                    </Link>
                  } />
                  <InfoRow label="Classification" value={`${linkedIncident.type} — ${linkedIncident.subType}`} />
                  <InfoRow label="Status" value={<span className="badge badge-closed" style={{ fontSize: 10 }}>{linkedIncident.status === 'Live (Assigned)' ? 'Assigned' : linkedIncident.status}</span>} />
                  <InfoRow label="Priority" value={linkedIncident.priority} />
                  <InfoRow label="Location" value={linkedIncident.location?.commonName || linkedIncident.location?.road || '—'} />
                  {linkedIncident.summary && (
                    <InfoRow label="Summary" value={
                      <span style={{ whiteSpace: 'pre-wrap', textAlign: 'left', display: 'block', fontSize: 12 }}>{linkedIncident.summary}</span>
                    } />
                  )}
                  <div style={{ marginTop: 12 }}>
                    <Link href={`/incidents/${linkedIncident.id}`} className="btn btn-secondary btn-sm">
                      Open Incident Record →
                    </Link>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  Linked Incident: <span className="mono-id" style={{ fontSize: 11, color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>{fault.linkedIncidentId}</span>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>Incident data unavailable.</p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── Right sidebar ──────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Case Reference card */}
          <div className="glass" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 10 }}>
              Parent Case
            </h3>
            {parentCase ? (
              <>
                <div style={{ marginBottom: 8 }}>
                  <Link href={`/cases/${parentCase.id}`} style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none', marginBottom: 4 }}>
                    {parentCase.id}
                  </Link>
                  <p style={{ fontSize: 12, color: 'var(--text-sub)', margin: 0, lineHeight: 1.4 }}>{parentCase.title}</p>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${parentCase.status === 'Active' ? 'badge-onsite' : 'badge-closed'}`} style={{ fontSize: 10 }}>
                    {parentCase.status}
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <Link href={`/cases/${parentCase.id}`} className="btn btn-secondary btn-sm" style={{ width: '100%', textAlign: 'center' }}>
                    Open Case →
                  </Link>
                </div>
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>Case {fault.caseId}</p>
            )}
          </div>

          {/* FRD Scope note */}
          <div className="glass" style={{ padding: '12px 14px', background: 'var(--color-info-bg)', border: '1px solid var(--color-info-border)', borderRadius: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--color-info)', lineHeight: 1.5, margin: 0 }}>
              <strong>CMS Role:</strong> Data capture &amp; CMMS Fault ID storage only.<br /><br />
              The CMS does not replicate or manage the work order lifecycle. Triage, routing, and resolution are handled entirely by IFM on the CMMS.
            </p>
          </div>

          {/* Fault Lifecycle Timeline */}
          <div className="glass" style={{ padding: '14px 16px' }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
              Fault Lifecycle
            </h3>
            <div className="timeline">
              {timeline.map((entry, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-dot" style={{ background: entry.dotColor }} />
                  <div className="timeline-header">
                    <span style={{ fontSize: 11 }}>{entry.time}</span>
                  </div>
                  <div className="timeline-desc" style={{ fontSize: 11, padding: '5px 10px' }}>
                    <strong>{entry.status}</strong>
                    {entry.detail && <span style={{ color: 'var(--text-muted)' }}> — {entry.detail}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ── Timeline builder ──────────────────────────────────────────────────────────

function buildTimeline(fault: Fault) {
  const entries: { time: string; status: string; detail?: string; dotColor: string }[] = [];

  if (fault.closedAt) {
    entries.push({
      time: new Date(fault.closedAt).toLocaleString('en-SG'),
      status: 'Closed',
      detail: fault.cmmsTicketId
        ? `CMMS Ticket ID ${fault.cmmsTicketId} confirmed`
        : 'Auto-closed by CMS',
      dotColor: 'var(--color-closed)',
    });
  }

  if (fault.submittedAt) {
    entries.push({
      time: new Date(fault.submittedAt).toLocaleString('en-SG'),
      status: 'Pending Submission',
      detail: 'Submitted to IFM CMMS',
      dotColor: 'var(--color-high)',
    });
  }

  entries.push({
    time: new Date(fault.createdAt).toLocaleString('en-SG'),
    status: 'Created',
    detail: `By ${fault.createdBy}`,
    dotColor: 'var(--color-primary)',
  });

  return entries;
}
