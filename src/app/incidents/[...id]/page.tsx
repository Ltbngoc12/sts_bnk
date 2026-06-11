'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Incident, Case, PersonalInjury, PersonInvolved } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

type IncidentTab = 'log' | 'services' | 'media' | 'property' | 'persons' | 'duplicates';

// Helper: incident status → badge class
function incBadgeClass(status: string) {
  switch (status) {
    case 'Live':
      return 'badge badge-live';
    case 'Live (Assigned)':
      return 'badge badge-ack';
    case 'Live (Acknowledged)':
      return 'badge badge-ack';
    case 'Live (On-Site)':
      return 'badge badge-onsite';
    case 'Live (Incomplete)':
      return 'badge badge-live';
    case 'Live (Completed)':
      return 'badge badge-completed';
    case 'Pending Endorsement':
      return 'badge badge-review';
    case 'Returned':
      return 'badge badge-live';
    case 'Closed':
      return 'badge badge-closed';
    default:
      return 'badge badge-closed';
  }
}

export default function IncidentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { role, username } = useRole();

  const idArray = params?.id as string[] || [];
  const incidentId = idArray.join('/');

  const [incident, setIncident] = useState<Incident | null>(null);
  const [parentCase, setParentCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [incTab, setIncTab] = useState<IncidentTab>('log');
  const [newLogText, setNewLogText] = useState('');
  const [rangerActivityText, setRangerActivity] = useState('');

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [assigneeInput, setAssigneeInput] = useState('');
  const [completionRemarks, setCompletionRemarks] = useState('');

  // Persons / Injuries Forms
  const [injName, setInjName] = useState('');
  const [injAge, setInjAge] = useState('');
  const [injContact, setInjContact] = useState('');
  const [injHospital, setInjHospital] = useState('');
  const [injU16, setInjU16] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentTel, setParentTel] = useState('');

  const [pType, setPType] = useState('Guest');
  const [pName, setPName] = useState('');
  const [pContact, setPContact] = useState('');
  const [pRole, setPRole] = useState('Witness');

  // Slave Incident Form
  const [slaveTitle, setSlaveTitle] = useState('');
  const [slaveReporter, setSlaveReporter] = useState('');
  const [slaveSummary, setSlaveSummary] = useState('');

  // Timers/Age calculations
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [elapsedDays, setElapsedDays] = useState(0);

  const fetchIncidentData = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (res.ok) {
        const incData: Incident = await res.json();
        setIncident(incData);

        // Fetch parent Case details too
        const caseRes = await fetch(`/api/cases/${incData.caseId}`);
        if (caseRes.ok) {
          setParentCase(await caseRes.json());
        }
      }
    } catch (err) {
      console.error('Failed to load incident details:', err);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (incidentId) fetchIncidentData();
  }, [incidentId, fetchIncidentData]);

  // Track elapsed time since incident occurred
  useEffect(() => {
    if (!incident) return;
    const calculateTime = () => {
      const occurrenceTime = new Date(incident.dateTime).getTime();
      const diffMs = Date.now() - occurrenceTime;
      setElapsedMinutes(Math.floor(diffMs / (60 * 1000)));
      setElapsedDays(Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    };
    calculateTime();
    const timer = setInterval(calculateTime, 15000); // Update every 15s
    return () => clearInterval(timer);
  }, [incident]);

  // Action POST handlers
  async function performAction(actionName: string, payload: Record<string, any> = {}) {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/${actionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Action failed: ${err.error}`);
        return false;
      }
      await fetchIncidentData();
      return true;
    } catch (err: any) {
      alert(`Request error: ${err.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Legacy field PUT updates
  async function updateFields(payload: Record<string, any>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username }),
      });
      if (res.ok) {
        await fetchIncidentData();
      }
    } catch (err) {
      console.error('Failed to update fields:', err);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-container glass">
        <div className="spinner" />
        <span>Loading Incident Details…</span>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--color-critical)' }}>
        Incident not found.
      </div>
    );
  }

  const isRanger = role === 'Responder (Ranger)';
  const isCtrl = role === 'Controller' || role === 'System Administrator';
  const isMgr = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';
  const isAdmin = role === 'System Administrator';
  const isClosed = incident.status === 'Closed';

  // Warnings / Reminder Triggers
  const showCrisisReviewReminder = elapsedMinutes >= 45 && incident.status !== 'Closed';
  const showAgeingWarning = elapsedDays >= 12 && elapsedDays < 14 && incident.status !== 'Closed';
  const showAgeingEscalation = elapsedDays >= 14 && incident.status !== 'Closed';

  const handleAssign = async () => {
    if (!assigneeInput.trim()) return;
    const ok = await performAction('assign', { assignedTo: assigneeInput });
    if (ok) {
      setAssigneeInput('');
      setShowAssignModal(false);
    }
  };

  const handleComplete = async () => {
    if (!completionRemarks.trim()) return;
    const ok = await performAction('complete', { completionRemarks });
    if (ok) {
      setCompletionRemarks('');
      setShowCompleteModal(false);
    }
  };

  return (
    <div className="page-content">
      {/* Ageing & Warning Alerts */}
      {showAgeingWarning && (
        <div className="alert-banner warning-banner glass">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span><strong>Day 12 Warning:</strong> This incident has remained open for {elapsedDays} days. Please expedite review.</span>
        </div>
      )}
      {showAgeingEscalation && (
        <div className="alert-banner escalation-banner glass">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <span><strong>Day 14 Escalation:</strong> Critical status. Incident has been open for {elapsedDays} days. Escalated to Management.</span>
        </div>
      )}
      {showCrisisReviewReminder && (
        <div className="alert-banner info-banner glass">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
          </svg>
          <span><strong>Crisis Review Reminder:</strong> Review crisis level (Level {incident.crisisLevel}) as 45 minutes have elapsed since logging ({elapsedMinutes} mins elapsed).</span>
        </div>
      )}
      {incident.mediaInvolvement.mediaAtScene && (
        <div className="alert-banner media-banner glass">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span><strong>Media Alert:</strong> Media outlet &quot;{incident.mediaInvolvement.mediaName || 'TBD'}&quot; is at scene. SDC Communications Team has been notified.</span>
        </div>
      )}

      {/* Main Header Card */}
      <div className="glass" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Link href={parentCase ? `/cases/${parentCase.id}` : '/cases'} style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>
              ← Back to Case Hub
            </Link>
            <span className="mono-id" style={{ background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderColor: 'var(--color-critical-border)' }}>
              Incident: {incident.id}
            </span>
            <span className={incBadgeClass(incident.status)}>{incident.status}</span>
            {saving && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Saving…</span>}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{incident.title}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Category: <strong>{incident.category || 'Standard Incident'}</strong> &bull; Priority: <strong>{incident.priority}</strong> &bull; Logged {new Date(incident.dateTime).toLocaleString('en-SG')}
          </p>
        </div>

        {/* Workflow Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {!isClosed ? (
            <>
              {/* Responder (Ranger) Actions */}
              {isRanger && (incident.status === 'Live' || incident.status === 'Live (Assigned)') && (
                <button className="btn btn-primary btn-sm" onClick={() => performAction('acknowledge')}>Acknowledge Dispatch</button>
              )}
              {isRanger && incident.status === 'Live (Acknowledged)' && (
                <button className="btn btn-success btn-sm" onClick={() => performAction('on-site')}>Arrive On-Site</button>
              )}
              {isRanger && ['Live (On-Site)', 'Live (Acknowledged)', 'Live (Assigned)', 'Live'].includes(incident.status) && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={() => {
                    const r = prompt('Reason for marking incomplete:');
                    if (r) performAction('mark-incomplete', { remarks: r });
                  }}>Mark Incomplete</button>
                  <button className="btn btn-success btn-sm" onClick={() => setShowCompleteModal(true)}>Notify Completion</button>
                </>
              )}

              {/* Controller Actions */}
              {isCtrl && incident.status !== 'Pending Endorsement' && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAssignModal(true)}>
                  {incident.assignedTo ? 'Re-Assign Ranger' : 'Assign Ranger'}
                </button>
              )}
              {isCtrl && ['Live (Completed)', 'Live (Incomplete)', 'Returned', 'Live'].includes(incident.status) && (
                <button className="btn btn-primary btn-sm" onClick={() => performAction('submit-endorsement')}>Submit for Endorsement</button>
              )}

              {/* Duty Manager Actions */}
              {isMgr && incident.status === 'Pending Endorsement' && (
                <>
                  <button className="btn btn-danger btn-sm" onClick={() => {
                    const reason = prompt('Reason for returning:');
                    if (reason !== null) performAction('return', { returnRemarks: reason });
                  }}>Return to Controller</button>
                  <button className="btn btn-success btn-sm" onClick={() => {
                    const remarks = prompt('Closure remarks (optional):') || '';
                    performAction('close', { closureRemarks: remarks });
                  }}>Approve Endorsement</button>
                </>
              )}
            </>
          ) : (
            <>
              {/* System Admin Reopening Action */}
              {isAdmin && (
                <button className="btn btn-brand btn-sm" onClick={() => performAction('reopen')}>
                  Reopen Incident
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sub-tabs Panel */}
      <div className="tabs-bar glass" style={{ marginTop: '1rem' }}>
        {(['log', 'services', 'media', 'property', 'persons', 'duplicates'] as IncidentTab[]).map(t => {
          const label: Record<IncidentTab, string> = {
            log: 'Incident Log',
            services: 'Emergency Services',
            media: 'Media',
            property: 'Damage & Vehicles',
            persons: 'Persons Involved',
            duplicates: `Slave Incidents (${incident.slaveIncidents?.length ?? 0})`,
          };
          return (
            <button key={t} className={`tab-btn ${incTab === t ? 'active' : ''}`} onClick={() => setIncTab(t)}>
              {label[t]}
            </button>
          );
        })}
      </div>

      {/* Content Layout Grid */}
      <div className="dashboard-layout-grid" style={{ marginTop: '1rem' }}>
        <div className="case-main-col">
          <div className="glass" style={{ padding: '18px 20px' }}>
            
            {/* ── INCIDENT LOG TAB ──────────────────────────────────── */}
            {incTab === 'log' && (
              <div>
                {!isClosed && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border-color)' }}>
                    {/* Controller Log Form */}
                    {isCtrl && (
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (!newLogText.trim()) return;
                        performAction('log', { description: newLogText });
                        setNewLogText('');
                      }}>
                        <div className="form-group">
                          <label>New Log Entry (Controller)</label>
                          <textarea
                            className="form-control"
                            placeholder="Add chronological log entry…"
                            value={newLogText}
                            onChange={e => setNewLogText(e.target.value)}
                            rows={2}
                          />
                        </div>
                        <button type="submit" className="btn btn-primary btn-xs" disabled={saving}>Add Log Entry</button>
                      </form>
                    )}

                    {/* Ranger Activity Form */}
                    {isRanger && (
                      <form onSubmit={(e) => {
                        e.preventDefault();
                        if (!rangerActivityText.trim()) return;
                        performAction('log', { description: `[Ranger Log] ${rangerActivityText}` });
                        setRangerActivity('');
                      }}>
                        <div className="form-group">
                          <label>Log Activity Update (Ranger)</label>
                          <input
                            className="form-control"
                            type="text"
                            placeholder="e.g. Cordon established aroundSilso."
                            value={rangerActivityText}
                            onChange={e => setRangerActivity(e.target.value)}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '8px' }}>
                          {['Cordon established.', 'First aid administered.', 'Search operations commenced.', 'Area cleared.'].map(q => (
                            <button key={q} type="button" onClick={() => setRangerActivity(q)} className="btn btn-secondary btn-xs">
                              {q}
                            </button>
                          ))}
                        </div>
                        <button type="submit" className="btn btn-secondary btn-xs" disabled={saving}>Log Activity Update</button>
                      </form>
                    )}
                  </div>
                )}

                <h3 style={{ marginBottom: 14 }}>Chronological Log</h3>
                <div className="timeline">
                  {[...incident.log].reverse().map(entry => (
                    <div className="timeline-item" key={entry.eventNumber}>
                      <div className="timeline-dot" />
                      <div className="timeline-header">
                        <span>Event #{entry.eventNumber}</span>
                        <span>&bull;</span>
                        <span>{entry.date} {entry.time}</span>
                      </div>
                      <div className="timeline-desc">{entry.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── EMERGENCY SERVICES TAB ─────────────────────────────── */}
            {incTab === 'services' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Police */}
                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ color: 'var(--color-critical)', marginBottom: 12 }}>Police Dispatch</h3>
                  <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                    <input type="checkbox" checked={incident.emergencyServices.policeAtScene}
                      onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, policeAtScene: e.target.checked } })}
                      disabled={isClosed} />
                    Police present at scene
                  </label>
                  {incident.emergencyServices.policeAtScene && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Officer Name & Rank</label>
                        <input className="form-control" type="text" value={incident.emergencyServices.officerNameRank}
                          onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, officerNameRank: e.target.value } })}
                          disabled={isClosed} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Police Report ID</label>
                        <input className="form-control" type="text" value={incident.emergencyServices.policeIncidentNo}
                          onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, policeIncidentNo: e.target.value } })}
                          disabled={isClosed} />
                      </div>
                    </div>
                  )}
                </div>

                {/* SCDF / Ambulance */}
                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ color: 'var(--color-active)', marginBottom: 12 }}>Ambulance & SCDF</h3>
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label>Responder Type</label>
                    <select className="form-control" value={incident.emergencyServices.ambulanceScdfType}
                      onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceScdfType: e.target.value } })}
                      disabled={isClosed}>
                      <option value="">None</option>
                      <option value="Ambulance">Ambulance</option>
                      <option value="SCDF">SCDF Fire/Hazmat</option>
                    </select>
                  </div>
                  {incident.emergencyServices.ambulanceScdfType && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Officer Name</label>
                        <input className="form-control" type="text" value={incident.emergencyServices.ambulanceOfficerName}
                          onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceOfficerName: e.target.value } })}
                          disabled={isClosed} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Call Sign</label>
                        <input className="form-control" type="text" value={incident.emergencyServices.ambulanceCallSign}
                          onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceCallSign: e.target.value } })}
                          disabled={isClosed} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Hospital Conveyed To</label>
                        <input className="form-control" type="text" value={incident.emergencyServices.hospitalConveyedTo}
                          onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, hospitalConveyedTo: e.target.value } })}
                          disabled={isClosed} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── MEDIA TAB ─────────────────────────────────────────── */}
            {incTab === 'media' && (
              <div className="inset-panel" style={{ margin: 0 }}>
                <h3 style={{ color: 'var(--color-review)', marginBottom: 12 }}>Media Involvement Trigger</h3>
                <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                  <input type="checkbox" checked={incident.mediaInvolvement.mediaAtScene}
                    onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, mediaAtScene: e.target.checked } })}
                    disabled={isClosed} />
                  Press/Media present at scene (SDC Communications Trigger)
                </label>
                {incident.mediaInvolvement.mediaAtScene && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label>Media Outlet Name</label>
                      <input className="form-control" type="text" value={incident.mediaInvolvement.mediaName}
                        onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, mediaName: e.target.value } })}
                        disabled={isClosed} />
                    </div>
                    <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 6, padding: '12px 14px', fontSize: 12, color: 'var(--color-high)' }}>
                      <strong>⚠ COMMUNICATIONS ACTION REQUIRED:</strong> Media presence flags an automatic trigger. Notify SDC Communications team.
                      <label className="checkbox-row" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={incident.mediaInvolvement.commsNotified}
                          onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, commsNotified: e.target.checked } })}
                          disabled={isClosed} />
                        SDC Communications Team Notified &bull; logged
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DAMAGE & VEHICLES TAB ──────────────────────────────── */}
            {incTab === 'property' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ marginBottom: 12 }}>SDC Property Damage</h3>
                  <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                    <input type="checkbox" checked={incident.propertyDamage.sdcPropertyDamaged}
                      onChange={e => updateFields({ propertyDamage: { ...incident.propertyDamage, sdcPropertyDamaged: e.target.checked } })}
                      disabled={isClosed} />
                    SDC Property Damaged
                  </label>
                  {incident.propertyDamage.sdcPropertyDamaged && (
                    <div className="form-group">
                      <label>Description of Damage</label>
                      <textarea className="form-control" rows={3} value={incident.propertyDamage.description}
                        onChange={e => updateFields({ propertyDamage: { ...incident.propertyDamage, description: e.target.value } })}
                        disabled={isClosed} />
                    </div>
                  )}
                </div>

                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ marginBottom: 12 }}>Vehicles Involved</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Particulars of vehicles linked to incident response.</p>
                  {/* Vehicle specifications can be edited or customized here */}
                </div>
              </div>
            )}

            {/* ── PERSONS INVOLVED TAB ────────────────────────────────── */}
            {incTab === 'persons' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Injuries */}
                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ marginBottom: 12 }}>Personal Injuries Log</h3>
                  {!isClosed && (
                    <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Full Name</label><input className="form-control" value={injName} onChange={e => setInjName(e.target.value)} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Age</label><input className="form-control" type="number" value={injAge} onChange={e => setInjAge(e.target.value)} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Contact Number</label><input className="form-control" value={injContact} onChange={e => setInjContact(e.target.value)} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Hospital / Clinic</label><input className="form-control" value={injHospital} onChange={e => setInjHospital(e.target.value)} /></div>
                      <label className="checkbox-row" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="checkbox" checked={injU16} onChange={e => setInjU16(e.target.checked)} />
                        Under 16 years old
                      </label>
                      {injU16 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 5 }}>
                          <div className="form-group" style={{ marginBottom: 0 }}><label>Guardian Name</label><input className="form-control" value={parentName} onChange={e => setParentName(e.target.value)} /></div>
                          <div className="form-group" style={{ marginBottom: 0 }}><label>Guardian Contact</label><input className="form-control" value={parentTel} onChange={e => setParentTel(e.target.value)} /></div>
                        </div>
                      )}
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                        if (!injName) return;
                        const updated = [...incident.personalInjuries, {
                          name: injName, address: 'TBD', age: parseInt(injAge, 10) || 0, gender: 'TBD', contactNumber: injContact, clinicHospitalAttended: injHospital, msigFormIssued: false, under16: injU16, parentGuardianName: parentName, parentGuardianContact: parentTel
                        }];
                        updateFields({ personalInjuries: updated });
                        setInjName(''); setInjAge(''); setInjContact(''); setInjHospital(''); setInjU16(false); setParentName(''); setParentTel('');
                      }}>Add Entry</button>
                    </div>
                  )}
                  {incident.personalInjuries.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No injuries recorded.</p>
                  ) : incident.personalInjuries.map((inj, i) => (
                    <div key={i} className="glass" style={{ padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {inj.name} (Age: {inj.age})
                        {inj.under16 && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--color-critical-bg)', color: 'var(--color-critical)', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>UNDER-16</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Hospital: {inj.clinicHospitalAttended || '—'} &bull; Tel: {inj.contactNumber}</div>
                      {inj.under16 && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Guardian: {inj.parentGuardianName} ({inj.parentGuardianContact})</div>}
                    </div>
                  ))}
                </div>

                {/* Other Persons */}
                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ marginBottom: 12 }}>Other Persons Involved</h3>
                  {!isClosed && (
                    <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Person Type</label>
                        <select className="form-control" value={pType} onChange={e => setPType(e.target.value)}>
                          {['Guest','Staff','Island Partner','Contractor'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Full Name</label><input className="form-control" value={pName} onChange={e => setPName(e.target.value)} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Contact Number</label><input className="form-control" value={pContact} onChange={e => setPContact(e.target.value)} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Role / Involvement</label>
                        <select className="form-control" value={pRole} onChange={e => setPRole(e.target.value)}>
                          {['Witness','Bystander','Subject','Other'].map(o => <option key={o}>{o}</option>)}
                        </select>
                      </div>
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => {
                        if (!pName) return;
                        const updated = [...incident.personsInvolved, {
                          guestOrNonGuest: pType === 'Guest' ? 'Guest' : 'Non-Guest', type: pType, name: pName, address: 'TBD', age: 0, gender: 'TBD', contactNumber: pContact, roleInvolvement: pRole, injuryDetails: ''
                        }];
                        updateFields({ personsInvolved: updated });
                        setPName(''); setPContact(''); setPRole('Witness');
                      }}>Add Person</button>
                    </div>
                  )}
                  {incident.personsInvolved.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No other persons recorded.</p>
                  ) : incident.personsInvolved.map((p, i) => (
                    <div key={i} className="glass" style={{ padding: '10px 14px', marginBottom: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name} ({p.type})</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Role: {p.roleInvolvement} &bull; Tel: {p.contactNumber}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── DUPLICATES / SLAVE INCIDENTS TAB ───────────────────── */}
            {incTab === 'duplicates' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ marginBottom: 8 }}>Link Duplicate (Slave) Incident</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                    Flagged duplicates are linked under this Master Incident report to avoid double ranger deployment.
                  </p>
                  {!isClosed ? (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!slaveTitle.trim()) return;
                      const slave = {
                        id: `DUP-${String((incident.slaveIncidents?.length ?? 0) + 1).padStart(3, '0')}`,
                        title: slaveTitle, dateTime: new Date().toISOString(), reporterName: slaveReporter || 'Anonymous Guest', summary: slaveSummary, status: incident.status === 'Closed' ? 'Closed' : 'Open'
                      };
                      const updated = [...(incident.slaveIncidents ?? []), slave];
                      await updateFields({
                        slaveIncidents: updated,
                        newLogEntry: `[Duplicate] Linked slave incident ${slave.id}: "${slaveTitle}" to this report.`
                      });
                      setSlaveTitle(''); setSlaveReporter(''); setSlaveSummary('');
                    }} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Report Title *</label><input className="form-control" required value={slaveTitle} onChange={e => setSlaveTitle(e.target.value)} placeholder="e.g. Call regarding exact same black bag" /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Reporter Details</label><input className="form-control" value={slaveReporter} onChange={e => setSlaveReporter(e.target.value)} /></div>
                      <div className="form-group" style={{ marginBottom: 0 }}><label>Summary Remarks</label><textarea className="form-control" rows={2} value={slaveSummary} onChange={e => setSlaveSummary(e.target.value)} /></div>
                      <button type="submit" className="btn btn-primary btn-sm">Link Duplicate Record</button>
                    </form>
                  ) : <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Incident is Closed. Duplicates cannot be linked.</p>}
                </div>

                <div className="inset-panel" style={{ margin: 0 }}>
                  <h3 style={{ marginBottom: 12 }}>Linked Slave Reports</h3>
                  {!incident.slaveIncidents?.length ? (
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No duplicate reports linked.</p>
                  ) : incident.slaveIncidents.map((s: any, i: number) => (
                    <div key={i} className="glass" style={{ padding: '12px 14px', marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-info)' }}>{s.id}: {s.title}</span>
                        <span className={s.status === 'Closed' ? 'badge badge-closed' : 'badge badge-live'}>{s.status}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reporter: <strong>{s.reporterName}</strong> &bull; {new Date(s.dateTime).toLocaleString('en-SG')}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Sidebar Info column */}
        <div className="case-side-col">
          {/* General particulars */}
          <div className="glass" style={{ padding: '14px 16px' }}>
            <h3 className="section-title">Incident Particulars</h3>
            <div className="cd-info-row"><span className="cd-info-label">Status</span><span className="cd-info-value"><span className={incBadgeClass(incident.status)}>{incident.status}</span></span></div>
            <div className="cd-info-row"><span className="cd-info-label">Category</span><span className="cd-info-value">{incident.category || 'Standard Incident'}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Priority</span><span className="cd-info-value"><strong>{incident.priority}</strong></span></div>
            <div className="cd-info-row"><span className="cd-info-label">Type</span><span className="cd-info-value">{incident.type} / {incident.subType}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Assigned Responder</span><span className="cd-info-value">{incident.assignedTo ? <strong style={{ color: 'var(--color-info)' }}>{incident.assignedTo}</strong> : <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Reporter Name</span><span className="cd-info-value">{incident.reporterName || 'TBD'}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Created By</span><span className="cd-info-value">{incident.createdBy}</span></div>
          </div>

          {/* Location particulars */}
          <div className="glass" style={{ padding: '14px 16px', marginTop: '1rem' }}>
            <h3 className="section-title">Location Info</h3>
            <div className="cd-info-row"><span className="cd-info-label">Common Name</span><span className="cd-info-value"><strong>{incident.location.commonName || '—'}</strong></span></div>
            <div className="cd-info-row"><span className="cd-info-label">Road</span><span className="cd-info-value">{incident.location.road || '—'}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Building</span><span className="cd-info-value">{incident.location.building || '—'}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Level & Space</span><span className="cd-info-value">{incident.location.levelSpace || '—'}</span></div>
            <div className="cd-info-row"><span className="cd-info-label">Postal Code</span><span className="cd-info-value">{incident.location.postalCode}</span></div>
          </div>

          {/* CCTV & BWC References */}
          {incident.cctvBwc && incident.cctvBwc.length > 0 && (
            <div className="glass" style={{ padding: '14px 16px', marginTop: '1rem' }}>
              <h3 className="section-title">Camera References</h3>
              {incident.cctvBwc.map((cam, idx) => (
                <div key={idx} style={{ padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 5, marginBottom: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>CCTV: {cam.cameraNumber || '—'}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>Bookmark: {cam.vmsBookmark || '—'}</div>
                  <div style={{ color: 'var(--text-muted)' }}>BWC: {cam.bwcNumber || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assign Ranger Modal */}
      {showAssignModal && (
        <div className="modal-overlay">
          <div className="modal-box glass">
            <h2 className="modal-title">Assign Responder (Ranger)</h2>
            <div className="form-group">
              <label>Select Responder</label>
              <select className="form-control select-dark" value={assigneeInput} onChange={e => setAssigneeInput(e.target.value)}>
                <option value="">-- Choose Ranger --</option>
                <option value="Ranger John">Ranger John</option>
                <option value="Ranger Dave">Ranger Dave</option>
                <option value="Ranger Sarah">Ranger Sarah</option>
                <option value="Ranger Mike">Ranger Mike</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAssign} disabled={!assigneeInput}>Assign</button>
            </div>
          </div>
        </div>
      )}

      {/* Notify Completion Remarks Modal */}
      {showCompleteModal && (
        <div className="modal-overlay">
          <div className="modal-box glass">
            <h2 className="modal-title">Notify Completion Remarks</h2>
            <div className="form-group">
              <label>Completion Remarks *</label>
              <textarea className="form-control" rows={3} value={completionRemarks} onChange={e => setCompletionRemarks(e.target.value)} placeholder="Provide summary of final actions taken on ground..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCompleteModal(false)}>Cancel</button>
              <button className="btn btn-success btn-sm" onClick={handleComplete} disabled={!completionRemarks.trim()}>Submit Completion</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
