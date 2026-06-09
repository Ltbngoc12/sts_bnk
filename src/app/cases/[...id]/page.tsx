'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Case, Task, PersonalInjury, PersonInvolved } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// ─── Types ────────────────────────────────────────────────────────────────────
type ComponentTab = 'incident' | 'tasks' | 'faults';
type IncidentTab  = 'log' | 'services' | 'media' | 'property' | 'persons' | 'duplicates';

// ─── Helper: incident status → badge class ────────────────────────────────────
function incBadgeClass(status: string) {
  return status === 'Live'                ? 'badge badge-live'      :
         status === 'Live (Acknowledged)' ? 'badge badge-ack'       :
         status === 'Live (On-Site)'      ? 'badge badge-onsite'    :
         status === 'Live (Completed)'    ? 'badge badge-completed' :
         status === 'Pending Review'      ? 'badge badge-review'    : 'badge badge-closed';
}

// ─── Helper: case status → badge class ───────────────────────────────────────
function caseBadgeClass(status: string) {
  return status === 'Active'         ? 'badge badge-onsite' :
         status === 'Pending Triage' ? 'badge badge-ack'    : 'badge badge-closed';
}

// ─── SideInfoItem ─────────────────────────────────────────────────────────────
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cd-info-row">
      <span className="cd-info-label">{label}</span>
      <span className="cd-info-value">{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CaseDetailsPage() {
  const params  = useParams();
  const { role, username } = useRole();

  const idArray = params?.id as string[];
  const caseId  = idArray ? idArray.join('/') : '';

  const [caseData, setCaseData]             = useState<Case | null>(null);
  const [tasks,    setTasks]                = useState<Task[]>([]);
  const [loading,  setLoading]              = useState(true);
  const [saving,   setSaving]               = useState(false);

  // Active tabs
  const [compTab,  setCompTab]  = useState<ComponentTab>('incident');
  const [incTab,   setIncTab]   = useState<IncidentTab>('log');

  // Log input
  const [newLogText,       setNewLogText]       = useState('');
  const [rangerActivityText, setRangerActivity] = useState('');

  // Modals
  const [showAssignModal,    setShowAssignModal]    = useState(false);
  const [showCompleteModal,  setShowCompleteModal]  = useState(false);
  const [showTaskModal,      setShowTaskModal]      = useState(false);
  const [selectedTask,       setSelectedTask]       = useState<Task | null>(null);

  // Assign modal
  const [assigneeInput, setAssigneeInput] = useState('');

  // Complete modal
  const [completionRemarks, setCompletionRemarks] = useState('');

  // Task create form
  const [taskTitle,   setTaskTitle]   = useState('');
  const [taskDesc,    setTaskDesc]    = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Ranger John');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [taskDueDate,  setTaskDueDate]  = useState('');

  // Task manage
  const [newAssignee, setNewAssignee] = useState('');

  // Injury form
  const [injName,    setInjName]    = useState('');
  const [injAge,     setInjAge]     = useState('');
  const [injContact, setInjContact] = useState('');
  const [injHospital,setInjHospital]= useState('');
  const [injU16,     setInjU16]     = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentTel,  setParentTel]  = useState('');

  // Person form
  const [pType,    setPType]    = useState('Guest');
  const [pName,    setPName]    = useState('');
  const [pContact, setPContact] = useState('');
  const [pRole,    setPRole]    = useState('Witness');

  // Slave incident form
  const [slaveTitle,    setSlaveTitle]    = useState('');
  const [slaveReporter, setSlaveReporter] = useState('');
  const [slaveSummary,  setSlaveSummary]  = useState('');

  // CMMS
  const [cmmsLoading, setCmmsLoading] = useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [caseRes, taskRes] = await Promise.all([
        fetch(`/api/cases/${caseId}`),
        fetch('/api/tasks'),
      ]);
      if (caseRes.ok) {
        const c: Case = await caseRes.json();
        setCaseData(c);
        if      (c.incident)                   setCompTab('incident');
        else if ((c.cmmsTickets?.length ?? 0) > 0) setCompTab('faults');
        else                                   setCompTab('tasks');
      }
      if (taskRes.ok) {
        const all: Task[] = await taskRes.json();
        setTasks(all.filter(t => t.caseId === caseId));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { if (caseId) refresh(); }, [caseId, refresh]);

  // ─── Action-oriented API helpers ────────────────────────────────────────────

  /** POST /api/incidents/[caseId]/[action] */
  async function incAction(action: string, payload: Record<string, any> = {}) {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${caseId}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Action failed: ${err.error}`);
        return false;
      }
      await refresh();
      return true;
    } catch (e: any) {
      alert(`Request error: ${e.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  /** PUT /api/incidents/[caseId] — legacy field update */
  async function incFieldUpdate(payload: Record<string, any>) {
    setSaving(true);
    try {
      await fetch(`/api/incidents/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username }),
      });
      await refresh();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  /** PUT /api/cases/[caseId] */
  async function caseUpdate(payload: Record<string, any>) {
    setSaving(true);
    try {
      await fetch(`/api/cases/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await refresh();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  // ─── Event handlers ─────────────────────────────────────────────────────────

  const handleAssign = async () => {
    if (!assigneeInput.trim()) return;
    const ok = await incAction('assign', { assignedTo: assigneeInput });
    if (ok) { setAssigneeInput(''); setShowAssignModal(false); }
  };

  const handleAcknowledge  = () => incAction('acknowledge');
  const handleOnSite        = () => incAction('on-site');
  const handleSubmitReview  = () => incAction('submit-review');
  const handleReturn        = () => incAction('return');
  const handleReopen        = async () => {
    await incAction('acknowledge'); // resets to Live via legacy PUT
    // For reopen we use the legacy PUT directly
    await incFieldUpdate({ status: 'Live' });
    await caseUpdate({ status: 'Active' });
  };

  const handleComplete = async () => {
    if (!completionRemarks.trim()) return;
    const ok = await incAction('complete', { completionRemarks });
    if (ok) { setCompletionRemarks(''); setShowCompleteModal(false); }
  };

  const handleClose = () => incAction('close');

  const handleAppendLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogText.trim()) return;
    await incAction('log', { description: newLogText });
    setNewLogText('');
  };

  const handleRangerActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangerActivityText.trim()) return;
    await incAction('log', { description: `[Ranger Log] ${rangerActivityText}` });
    setRangerActivity('');
  };

  const handleAddInjury = async () => {
    if (!injName || !caseData) return;
    const injury: PersonalInjury = {
      name: injName, address: '',
      age: parseInt(injAge, 10) || 30,
      gender: 'Other', contactNumber: injContact,
      clinicHospitalAttended: injHospital,
      msigFormIssued: false, under16: injU16,
      parentGuardianName: injU16 ? parentName : undefined,
      parentGuardianContact: injU16 ? parentTel : undefined,
    };
    const updated = [...(caseData.incident?.personalInjuries ?? []), injury];
    await incFieldUpdate({ personalInjuries: updated });
    setInjName(''); setInjAge(''); setInjContact(''); setInjHospital(''); setInjU16(false);
  };

  const handleAddPerson = async () => {
    if (!pName || !caseData) return;
    const person: PersonInvolved = {
      guestOrNonGuest: pType === 'Guest' ? 'Guest' : 'Non-Guest',
      type: pType, name: pName, address: '', age: 30,
      gender: 'Other', contactNumber: pContact,
      roleInvolvement: pRole, injuryDetails: '',
    };
    const updated = [...(caseData.incident?.personsInvolved ?? []), person];
    await incFieldUpdate({ personsInvolved: updated });
    setPName(''); setPContact(''); setPRole('Witness');
  };

  const handleAddSlave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slaveTitle.trim() || !caseData?.incident) return;
    const slave: any = {
      id: `DUP-${String((caseData.incident.slaveIncidents?.length ?? 0) + 1).padStart(3, '0')}`,
      title: slaveTitle, dateTime: new Date().toISOString(),
      reporterName: slaveReporter || 'Anonymous',
      summary: slaveSummary,
      status: caseData.incident.status === 'Closed' ? 'Closed' : 'Open',
    };
    const updated = [...(caseData.incident.slaveIncidents ?? []), slave];
    await incFieldUpdate({
      slaveIncidents: updated,
      newLogEntry: `[Duplicate] Slave Incident ${slave.id}: "${slaveTitle}" linked to this Master.`,
    });
    setSlaveTitle(''); setSlaveReporter(''); setSlaveSummary('');
  };

  const handleCMMS = async () => {
    if (!caseData || cmmsLoading) return;
    setCmmsLoading(true);
    try {
      const res = await fetch('/api/cmms-mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: caseData.incident?.location.commonName || caseData.incident?.location.road || 'Sentosa Ground',
          description: caseData.incident?.summary || caseData.title,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await caseUpdate({ cmmsTicketId: data.ticketId });
        if (caseData.incident) {
          await incAction('log', { description: `CMMS Ticket raised: ${data.ticketId}. Linkage established.` });
        }
      }
    } catch (e) { console.error(e); }
    finally { setCmmsLoading(false); }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, title: taskTitle, description: taskDesc, assignee: taskAssignee, priority: taskPriority, dueDate: taskDueDate, username }),
      });
      if (res.ok) {
        setShowTaskModal(false);
        setTaskTitle(''); setTaskDesc(''); setTaskDueDate('');
        await refresh();
      }
    } catch (e) { console.error(e); }
  };

  const handleUpdateTask = async (taskId: string, status: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setSelectedTask(null);
    await refresh();
  };

  const handleReassignTask = async (taskId: string) => {
    if (!newAssignee) return;
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignee: newAssignee }),
    });
    setSelectedTask(null); setNewAssignee('');
    await refresh();
  };

  // ─── Role checks ─────────────────────────────────────────────────────────────
  if (loading) return <div className="loading-container glass"><div className="spinner" /><span>Loading Case Details…</span></div>;
  if (!caseData) return <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--color-critical)' }}>Case not found.</div>;

  const inc        = caseData.incident;
  const isRanger   = role === 'Responder (Ranger)';
  const isCtrl     = role === 'Controller' || role === 'System Administrator';
  const isMgr      = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';
  const isClosed   = caseData.status === 'Closed';
  const incClosed  = inc?.status === 'Closed';

  return (
    <>
      {/* ── Case Header ────────────────────────────────────────────────────── */}
      <div className="glass" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Link href="/cases" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>← Case Log</Link>
            <span className="mono-id">{caseData.id}</span>
            <span className={caseBadgeClass(caseData.status)}>{caseData.status}</span>
            {inc && <span className={incBadgeClass(inc.status)}>{inc.status}</span>}
            {saving && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Saving…</span>}
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{caseData.title}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Logged {new Date(caseData.createdAt).toLocaleString('en-SG')}
            {inc ? ` · Created by ${inc.createdBy}` : ''}
            {caseData.closedAt ? ` · Closed ${new Date(caseData.closedAt).toLocaleString('en-SG')}` : ''}
          </p>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Case-level transitions */}
          {isCtrl && caseData.status === 'Pending Triage' && (
            <button className="btn btn-success btn-sm" onClick={() => caseUpdate({ status: 'Active' })}>Activate Case</button>
          )}
          {role === 'System Administrator' && isClosed && (
            <button className="btn btn-secondary btn-sm" onClick={() => caseUpdate({ status: 'Active' })}>Reopen Case</button>
          )}

          {/* Incident workflow buttons */}
          {inc && !incClosed && (
            <>
              {/* Ranger flow */}
              {isRanger && inc.status === 'Live' && (
                <button className="btn btn-primary btn-sm" onClick={handleAcknowledge}>Acknowledge</button>
              )}
              {isRanger && inc.status === 'Live (Acknowledged)' && (
                <button className="btn btn-success btn-sm" onClick={handleOnSite}>Arrived On-Site</button>
              )}
              {isRanger && ['Live (On-Site)', 'Live (Acknowledged)'].includes(inc.status) && (
                <button className="btn btn-success btn-sm" onClick={() => setShowCompleteModal(true)}>Notify Completion</button>
              )}

              {/* Controller flow */}
              {isCtrl && inc.status !== 'Pending Review' && (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAssignModal(true)}>
                  {inc.assignedTo ? 'Re-Assign Ranger' : 'Assign Ranger'}
                </button>
              )}
              {isCtrl && !['Pending Review', 'Live (Completed)'].includes(inc.status) && (
                <button className="btn btn-info btn-sm" onClick={handleSubmitReview}>Submit for Review</button>
              )}
              {isCtrl && inc.status === 'Live (Completed)' && (
                <button className="btn btn-info btn-sm" onClick={handleSubmitReview}>Submit for Review</button>
              )}

              {/* DM/DO flow */}
              {isMgr && inc.status === 'Pending Review' && (
                <>
                  <button className="btn btn-danger btn-sm" onClick={handleReturn}>Return to Controller</button>
                  <button className="btn btn-success btn-sm" onClick={handleClose}>Approve Closure</button>
                </>
              )}
            </>
          )}

          {/* System Admin reopen */}
          {role === 'System Administrator' && incClosed && isClosed && (
            <button className="btn btn-secondary btn-sm" onClick={handleReopen}>Reopen Incident</button>
          )}
        </div>
      </div>

      {/* ── Component selector tabs ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10 }}>
        {(['incident', 'tasks', 'faults'] as ComponentTab[]).map(tab => {
          const labels: Record<ComponentTab, string> = {
            incident: `Incident Report${!inc ? ' (None)' : ''}`,
            tasks:    `Ranger Tasks (${tasks.length})`,
            faults:   `IFM Faults (${caseData.cmmsTickets?.length ?? 0})`,
          };
          return (
            <button
              key={tab}
              className={`comp-tab-btn ${compTab === tab ? 'active' : ''}`}
              onClick={() => setCompTab(tab)}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* ── Main content grid ────────────────────────────────────────────────── */}
      <div className="case-content-grid">

        {/* ─── Left: Main column ───────────────────────────────────────────── */}
        <div className="case-main-col">

          {/* ── INCIDENT TAB ────────────────────────────────────────────────── */}
          {compTab === 'incident' && (
            <>
              {!inc ? (
                <div className="glass empty-comp-state">
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🚨</div>
                  <h3 style={{ marginBottom: 6 }}>No Incident Report Attached</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 360 }}>
                    This case folder was logged as a general tracking case and has no security or safety incident attached.
                  </p>
                </div>
              ) : (
                <>
                  {/* Sub-tabs bar */}
                  <div className="tabs-bar glass">
                    {(['log', 'services', 'media', 'property', 'persons', 'duplicates'] as IncidentTab[]).map(t => {
                      const label: Record<IncidentTab, string> = {
                        log: 'Incident Log', services: 'Emergency Services',
                        media: 'Media', property: 'Damage & Vehicles',
                        persons: 'Persons Involved',
                        duplicates: `Slave Incidents (${inc.slaveIncidents?.length ?? 0})`,
                      };
                      return (
                        <button key={t} className={`tab-btn ${incTab === t ? 'active' : ''}`} onClick={() => setIncTab(t)}>
                          {label[t]}
                        </button>
                      );
                    })}
                  </div>

                  <div className="glass" style={{ padding: '18px 20px' }}>

                    {/* ── LOG TAB ──────────────────────────────────────────── */}
                    {incTab === 'log' && (
                      <div>
                        {!incClosed && (
                          <form onSubmit={handleAppendLog} style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border-color)' }}>
                            <textarea
                              className="form-control"
                              placeholder="Add chronological log entry…"
                              value={newLogText}
                              onChange={e => setNewLogText(e.target.value)}
                              rows={2}
                              style={{ marginBottom: 8 }}
                            />
                            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>Add Log Entry</button>
                          </form>
                        )}
                        <h3 style={{ marginBottom: 14 }}>Chronological Log</h3>
                        <div className="timeline">
                          {[...inc.log].reverse().map(entry => (
                            <div className="timeline-item" key={entry.eventNumber}>
                              <div className="timeline-dot" />
                              <div className="timeline-header">
                                <span>Event #{entry.eventNumber}</span>
                                <span>·</span>
                                <span>{entry.date} {entry.time}</span>
                              </div>
                              <div className="timeline-desc">{entry.description}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── SERVICES TAB ─────────────────────────────────────── */}
                    {incTab === 'services' && (
                      <div className="subform-grid">
                        {/* Police */}
                        <div className="subform-card">
                          <h3 style={{ color: 'var(--color-critical)', marginBottom: 12 }}>Police Dispatch</h3>
                          <label className="checkbox-row">
                            <input type="checkbox" checked={inc.emergencyServices.policeAtScene}
                              onChange={e => incFieldUpdate({ emergencyServices: { policeAtScene: e.target.checked } })}
                              disabled={incClosed} />
                            Police present at scene
                          </label>
                          {inc.emergencyServices.policeAtScene && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Officer Name & Rank</label>
                                <input className="form-control" type="text" value={inc.emergencyServices.officerNameRank}
                                  onChange={e => incFieldUpdate({ emergencyServices: { officerNameRank: e.target.value } })}
                                  disabled={incClosed} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Police Report ID</label>
                                <input className="form-control" type="text" value={inc.emergencyServices.policeIncidentNo}
                                  onChange={e => incFieldUpdate({ emergencyServices: { policeIncidentNo: e.target.value } })}
                                  disabled={incClosed} />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Ambulance */}
                        <div className="subform-card">
                          <h3 style={{ color: 'var(--color-active)', marginBottom: 12 }}>Ambulance / SCDF</h3>
                          <div className="form-group" style={{ marginBottom: 10 }}>
                            <label>Responder Type</label>
                            <select className="form-control" value={inc.emergencyServices.ambulanceScdfType}
                              onChange={e => incFieldUpdate({ emergencyServices: { ambulanceScdfType: e.target.value } })}
                              disabled={incClosed}>
                              <option value="">None</option>
                              <option value="SCDF">SCDF Ambulance</option>
                              <option value="Private">Private Ambulance</option>
                            </select>
                          </div>
                          {inc.emergencyServices.ambulanceScdfType && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Call Sign</label>
                                <input className="form-control" type="text" value={inc.emergencyServices.ambulanceCallSign}
                                  onChange={e => incFieldUpdate({ emergencyServices: { ambulanceCallSign: e.target.value } })}
                                  disabled={incClosed} />
                              </div>
                              <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Hospital Conveyed To</label>
                                <input className="form-control" type="text" value={inc.emergencyServices.hospitalConveyedTo}
                                  onChange={e => incFieldUpdate({ emergencyServices: { hospitalConveyedTo: e.target.value } })}
                                  disabled={incClosed} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── MEDIA TAB ────────────────────────────────────────── */}
                    {incTab === 'media' && (
                      <div className="subform-card">
                        <h3 style={{ color: 'var(--color-review)', marginBottom: 12 }}>Media Presence at Scene</h3>
                        <label className="checkbox-row">
                          <input type="checkbox" checked={inc.mediaInvolvement.mediaAtScene}
                            onChange={e => incFieldUpdate({ mediaInvolvement: { mediaAtScene: e.target.checked } })}
                            disabled={incClosed} />
                          Press/Media present at the scene
                        </label>
                        {inc.mediaInvolvement.mediaAtScene && (
                          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                              <label>Media Outlet Name</label>
                              <input className="form-control" type="text" value={inc.mediaInvolvement.mediaName}
                                onChange={e => incFieldUpdate({ mediaInvolvement: { mediaName: e.target.value } })}
                                disabled={incClosed} />
                            </div>
                            <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 6, padding: '10px 14px', fontSize: 12, color: 'var(--color-high)' }}>
                              <strong>⚠ CRITICAL:</strong> Media presence flagged. Notify SDC Communications Team immediately.
                              <label className="checkbox-row" style={{ marginTop: 8 }}>
                                <input type="checkbox" id="comms-notified" checked={inc.mediaInvolvement.commsNotified}
                                  onChange={e => incFieldUpdate({ mediaInvolvement: { commsNotified: e.target.checked } })}
                                  disabled={incClosed} />
                                SDC Comms Team Notified
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── PROPERTY TAB ─────────────────────────────────────── */}
                    {incTab === 'property' && (
                      <div className="subform-grid">
                        <div className="subform-card">
                          <h3 style={{ marginBottom: 12 }}>SDC Property Damage</h3>
                          <label className="checkbox-row">
                            <input type="checkbox" id="prop-damage" checked={inc.propertyDamage.sdcPropertyDamaged}
                              onChange={e => incFieldUpdate({ propertyDamage: { sdcPropertyDamaged: e.target.checked } })}
                              disabled={incClosed} />
                            SDC Property Damaged
                          </label>
                          {inc.propertyDamage.sdcPropertyDamaged && (
                            <div className="form-group" style={{ marginTop: 12, marginBottom: 0 }}>
                              <label>Damage Description</label>
                              <textarea className="form-control" rows={3} value={inc.propertyDamage.description}
                                onChange={e => incFieldUpdate({ propertyDamage: { description: e.target.value } })}
                                disabled={incClosed} />
                            </div>
                          )}
                        </div>
                        <div className="subform-card">
                          <h3 style={{ marginBottom: 12 }}>Vehicles Involved</h3>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vehicle particulars recording — coming soon.</p>
                        </div>
                      </div>
                    )}

                    {/* ── PERSONS TAB ──────────────────────────────────────── */}
                    {incTab === 'persons' && (
                      <div className="subform-grid">
                        {/* Injuries */}
                        <div className="subform-card">
                          <h3 style={{ marginBottom: 12 }}>Personal Injuries Log</h3>
                          {!incClosed && (
                            <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Full Name</label><input className="form-control" value={injName} onChange={e => setInjName(e.target.value)} /></div>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Age</label><input className="form-control" type="number" value={injAge} onChange={e => setInjAge(e.target.value)} /></div>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Contact Number</label><input className="form-control" value={injContact} onChange={e => setInjContact(e.target.value)} /></div>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Hospital / Clinic</label><input className="form-control" value={injHospital} onChange={e => setInjHospital(e.target.value)} /></div>
                              <label className="checkbox-row" style={{ fontSize: 12 }}>
                                <input type="checkbox" checked={injU16} onChange={e => setInjU16(e.target.checked)} />
                                Under 16 years old
                              </label>
                              {injU16 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: 5 }}>
                                  <div className="form-group" style={{ marginBottom: 0 }}><label>Guardian Name</label><input className="form-control" value={parentName} onChange={e => setParentName(e.target.value)} /></div>
                                  <div className="form-group" style={{ marginBottom: 0 }}><label>Guardian Contact</label><input className="form-control" value={parentTel} onChange={e => setParentTel(e.target.value)} /></div>
                                </div>
                              )}
                              <button type="button" className="btn btn-primary btn-sm" onClick={handleAddInjury}>Add Entry</button>
                            </div>
                          )}
                          {inc.personalInjuries.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No injuries recorded.</p>
                          ) : inc.personalInjuries.map((inj, i) => (
                            <div key={i} className="glass" style={{ padding: '10px 14px', marginBottom: 8 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>
                                {inj.name} (Age: {inj.age})
                                {inj.under16 && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--color-critical-bg)', color: 'var(--color-critical)', padding: '2px 6px', borderRadius: 3, fontWeight: 700 }}>UNDER-16</span>}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Hospital: {inj.clinicHospitalAttended || '—'} · Tel: {inj.contactNumber}</div>
                              {inj.under16 && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>Guardian: {inj.parentGuardianName} ({inj.parentGuardianContact})</div>}
                            </div>
                          ))}
                        </div>

                        {/* Other persons */}
                        <div className="subform-card">
                          <h3 style={{ marginBottom: 12 }}>Other Persons Involved</h3>
                          {!incClosed && (
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
                              <button type="button" className="btn btn-primary btn-sm" onClick={handleAddPerson}>Add Person</button>
                            </div>
                          )}
                          {inc.personsInvolved.length === 0 ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>No persons recorded.</p>
                          ) : inc.personsInvolved.map((p, i) => (
                            <div key={i} className="glass" style={{ padding: '10px 14px', marginBottom: 8 }}>
                              <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name} ({p.type})</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Role: {p.roleInvolvement} · Tel: {p.contactNumber}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── SLAVE/DUPLICATES TAB ─────────────────────────────── */}
                    {incTab === 'duplicates' && (
                      <div className="subform-grid">
                        <div className="subform-card">
                          <h3 style={{ marginBottom: 8 }}>Link Duplicate (Slave) Incident</h3>
                          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                            Duplicate reports are linked as slaves and do not trigger separate ranger deployments.
                          </p>
                          {!incClosed ? (
                            <form onSubmit={handleAddSlave} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Report Title *</label><input className="form-control" required value={slaveTitle} onChange={e => setSlaveTitle(e.target.value)} placeholder="e.g. Another caller reporting the same bag" /></div>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Reporter Name</label><input className="form-control" value={slaveReporter} onChange={e => setSlaveReporter(e.target.value)} /></div>
                              <div className="form-group" style={{ marginBottom: 0 }}><label>Summary</label><textarea className="form-control" rows={2} value={slaveSummary} onChange={e => setSlaveSummary(e.target.value)} /></div>
                              <button type="submit" className="btn btn-primary btn-sm">Link Duplicate</button>
                            </form>
                          ) : <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Incident is Closed. No new duplicates can be linked.</p>}
                        </div>

                        <div className="subform-card">
                          <h3 style={{ marginBottom: 12 }}>Linked Slave Incidents</h3>
                          {!inc.slaveIncidents?.length ? (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No duplicate records linked.</p>
                          ) : inc.slaveIncidents.map((s: any, i: number) => (
                            <div key={i} className="glass" style={{ padding: '12px 14px', marginBottom: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-info)' }}>{s.id}: {s.title}</span>
                                <span className={s.status === 'Closed' ? 'badge badge-closed' : 'badge badge-live'}>{s.status}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reporter: <strong>{s.reporterName}</strong> · {new Date(s.dateTime).toLocaleString('en-SG')}</div>
                              {s.summary && <p style={{ marginTop: 6, fontSize: 11, color: 'var(--text-sub)', background: 'var(--bg-inset)', padding: '6px 8px', borderRadius: 4 }}>{s.summary}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ranger Activity Updater */}
                  {!incClosed && (
                    <div className="glass" style={{ padding: '14px 18px' }}>
                      <div className="card-header" style={{ paddingLeft: 0, paddingRight: 0, paddingTop: 0 }}>
                        <h2>Responder Activity Updates</h2>
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Rangers log immediate on-scene updates.</p>
                      <form onSubmit={handleRangerActivity} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="form-control" type="text" placeholder="e.g. Medical team is stabilizing the subject."
                          value={rangerActivityText} onChange={e => setRangerActivity(e.target.value)} />
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {['Cordon established.', 'Search operations commenced.', 'First aid administered.', 'Area cleared and normal.'].map(q => (
                            <button key={q} type="button" onClick={() => setRangerActivity(q)}
                              className="btn btn-secondary btn-xs">{q.slice(0, 20)}…</button>
                          ))}
                        </div>
                        <button type="submit" className="btn btn-secondary btn-sm" disabled={saving}>Log Activity Update</button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── TASKS TAB ───────────────────────────────────────────────────── */}
          {compTab === 'tasks' && (
            <div className="glass" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <h2>Ground Tasks ({tasks.length})</h2>
                {isCtrl && !isClosed && (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowTaskModal(true)}>+ Dispatch Task</button>
                )}
              </div>
              {tasks.length === 0 ? (
                <div className="empty-state">
                  No tasks dispatched for this case.
                  {isCtrl && !isClosed && <button className="btn btn-secondary btn-sm" style={{ marginTop: 10, display: 'block' }} onClick={() => setShowTaskModal(true)}>Dispatch First Task</button>}
                </div>
              ) : (
                <div>
                  {tasks.map(t => (
                    <div key={t.id} className="active-case-item" onClick={() => { setSelectedTask(t); setNewAssignee(t.assignee); }}>
                      <div className="active-case-info">
                        <span className="case-id">{t.id}</span>
                        <span className="case-title">{t.title}</span>
                        <span className="case-meta">Assignee: {t.assignee} · Priority: {t.priority}{t.dueDate ? ` · Due: ${new Date(t.dueDate).toLocaleString('en-SG')}` : ''}</span>
                      </div>
                      <div className="active-case-status">
                        <span className={t.status === 'Closed' ? 'badge badge-closed' : t.status === 'In Progress' ? 'badge badge-onsite' : t.status === 'Acknowledged' ? 'badge badge-ack' : 'badge badge-live'}>{t.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── FAULTS TAB ──────────────────────────────────────────────────── */}
          {compTab === 'faults' && (
            <div className="glass" style={{ overflow: 'hidden' }}>
              <div className="card-header">
                <h2>IFM Infrastructure Faults</h2>
                {(caseData.cmmsTickets?.length ?? 0) === 0 && !isClosed && (
                  <button className="btn btn-info btn-sm" onClick={handleCMMS} disabled={cmmsLoading}>
                    {cmmsLoading ? 'Raising…' : 'Raise CMMS Ticket'}
                  </button>
                )}
              </div>
              {(caseData.cmmsTickets?.length ?? 0) === 0 ? (
                <div className="empty-state">
                  No CMMS tickets linked to this case.
                  {!isClosed && (
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 10, display: 'block' }} onClick={handleCMMS} disabled={cmmsLoading}>
                      {cmmsLoading ? 'Raising…' : 'Raise Maintenance Ticket'}
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {caseData.cmmsTickets.map((t, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-info-bg)', border: '1px solid var(--color-info-border)', borderRadius: 6 }}>
                      <code style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--color-info)' }}>{t}</code>
                      <span className="badge badge-info">Active in CMMS</span>
                    </div>
                  ))}
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Fault status updates are fetched via API callback. You may close this case without waiting for CMMS resolution.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Right: Sidebar ──────────────────────────────────────────────── */}
        <div className="case-side-col">

          {/* Case Components overview */}
          <div className="glass" style={{ padding: '14px 16px' }}>
            <h3 className="section-title">Case Components</h3>
            <InfoRow label="Incident Report" value={inc ? <span className="badge badge-live">Attached</span> : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Not Attached</span>} />
            <InfoRow label="Ground Tasks"    value={tasks.length > 0 ? <span className="badge badge-onsite">{tasks.length} Tasks</span> : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>None</span>} />
            <InfoRow label="CMMS Faults"     value={(caseData.cmmsTickets?.length ?? 0) > 0 ? <span className="badge badge-ack">{caseData.cmmsTickets.length} Linked</span> : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>None</span>} />
          </div>

          {/* Incident Info */}
          {inc && (
            <div className="glass" style={{ padding: '14px 16px' }}>
              <h3 className="section-title">Incident Details</h3>
              <InfoRow label="Priority"  value={<strong>{inc.priority}</strong>} />
              <InfoRow label="Type"      value={`${inc.type} · ${inc.subType}`} />
              <InfoRow label="Reporter"  value={inc.reporterName} />
              <InfoRow label="Requested by" value={inc.requestedBy} />
              <InfoRow label="Responder" value={inc.assignedTo ? <strong style={{ color: 'var(--color-info)' }}>{inc.assignedTo}</strong> : <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>Unassigned</span>} />
            </div>
          )}

          {/* Location */}
          {inc && (
            <div className="glass" style={{ padding: '14px 16px' }}>
              <h3 className="section-title">Location</h3>
              <InfoRow label="Common Name" value={<strong>{inc.location.commonName || '—'}</strong>} />
              <InfoRow label="Road"        value={inc.location.road || '—'} />
              {inc.location.building   && <InfoRow label="Building"   value={inc.location.building} />}
              {inc.location.levelSpace && <InfoRow label="Level/Space" value={inc.location.levelSpace} />}
              <InfoRow label="Postal Code" value={inc.location.postalCode} />
              <InfoRow label="Coordinates" value={<code style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>{inc.location.lat.toFixed(4)}, {inc.location.lng.toFixed(4)}</code>} />
            </div>
          )}

          {/* CCTV / BWC */}
          {inc && inc.cctvBwc.length > 0 && (
            <div className="glass" style={{ padding: '14px 16px' }}>
              <h3 className="section-title">CCTV & Camera References</h3>
              {inc.cctvBwc.map((cam, i) => (
                <div key={i} style={{ padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 5, marginBottom: 8, fontSize: 12 }}>
                  <div style={{ fontWeight: 600 }}>Camera: {cam.cameraNumber || '—'}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>{cam.vmsTimestamp} · Bookmark: {cam.vmsBookmark || '—'}</div>
                  <div style={{ color: 'var(--text-muted)' }}>BWC: {cam.bwcNumber || '—'}</div>
                </div>
              ))}
            </div>
          )}

          {/* Audit trail */}
          <div className="glass" style={{ padding: '14px 16px' }}>
            <h3 className="section-title">Case Audit Trail</h3>
            <div className="timeline" style={{ maxHeight: 280, overflowY: 'auto' }}>
              {caseData.closedAt && (
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ background: 'var(--color-closed)' }} />
                  <div className="timeline-header"><span>{new Date(caseData.closedAt).toLocaleDateString('en-SG')}</span></div>
                  <div className="timeline-desc" style={{ fontSize: 11, padding: '6px 10px' }}>Case container closed.</div>
                </div>
              )}
              {inc?.log && [...inc.log].reverse().map(entry => (
                <div className="timeline-item" key={entry.eventNumber}>
                  <div className="timeline-dot" />
                  <div className="timeline-header"><span>{entry.date} {entry.time}</span></div>
                  <div className="timeline-desc" style={{ fontSize: 11, padding: '6px 10px' }}>{entry.description}</div>
                </div>
              ))}
              <div className="timeline-item">
                <div className="timeline-dot" style={{ background: 'var(--color-primary)' }} />
                <div className="timeline-header"><span>{new Date(caseData.createdAt).toLocaleDateString('en-SG')}</span></div>
                <div className="timeline-desc" style={{ fontSize: 11, padding: '6px 10px' }}>Case container established.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── MODALS ──────────────────────────────────────────────────────────── */}

      {/* Assign Ranger */}
      {showAssignModal && inc && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Assign Field Responder (Ranger)</div>
            <div className="form-group">
              <label>Select Ranger</label>
              <select className="form-control" value={assigneeInput} onChange={e => setAssigneeInput(e.target.value)}>
                <option value="">— Choose Ranger —</option>
                {['Ranger John (Siloso Zone)', 'Ranger Sarah (RWS Zone)', 'Ranger Alex (Imbiah Zone)', 'Ranger Tommy (Cove Zone)'].map(r => (
                  <option key={r} value={r.split(' (')[0]}>{r}</option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAssign} disabled={!assigneeInput || saving}>Confirm Assignment</button>
            </div>
          </div>
        </div>
      )}

      {/* Completion Remarks */}
      {showCompleteModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">Notify Ground Completion</div>
            <div className="form-group">
              <label>Ground Completion Remarks *</label>
              <textarea className="form-control" rows={3} value={completionRemarks}
                onChange={e => setCompletionRemarks(e.target.value)}
                placeholder="Summarize actions taken on ground…" required />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>Cancel</button>
              <button className="btn btn-success" onClick={handleComplete} disabled={!completionRemarks.trim() || saving}>Submit Completion</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task */}
      {showTaskModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 560 }}>
            <div className="modal-title">Dispatch New Task — {caseId}</div>
            <form onSubmit={handleCreateTask}>
              <div className="form-group"><label>Task Title *</label><input className="form-control" required value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Escort contractor to substation" /></div>
              <div className="form-group"><label>Description</label><textarea className="form-control" rows={2} value={taskDesc} onChange={e => setTaskDesc(e.target.value)} placeholder="Ground activities needed…" /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Assignee</label>
                  <select className="form-control" value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)}>
                    {['Ranger John','Ranger Sarah','Ranger Alex','Ranger Tommy'].map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Priority</label>
                  <select className="form-control" value={taskPriority} onChange={e => setTaskPriority(e.target.value)}>
                    {['High','Medium','Low'].map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Due Date & Time</label><input className="form-control" type="datetime-local" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} /></div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Dispatch Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail */}
      {selectedTask && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-title">
              <span className="mono-id" style={{ fontSize: 11 }}>{selectedTask.id}</span>
              {' '}— {selectedTask.title}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, display: 'flex', gap: 12 }}>
              <span>Parent: <strong>{selectedTask.caseId}</strong></span>
              <span>Priority: <strong>{selectedTask.priority}</strong></span>
              {selectedTask.dueDate && <span>Due: <strong>{new Date(selectedTask.dueDate).toLocaleString('en-SG')}</strong></span>}
            </div>
            {selectedTask.description && <p style={{ fontSize: 13, color: 'var(--text-sub)', marginBottom: 14 }}>{selectedTask.description}</p>}

            {/* Assignee row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 6, marginBottom: 14 }}>
              <span style={{ fontSize: 13 }}>Assigned to: <strong>{selectedTask.assignee}</strong></span>
              {isCtrl && !isClosed && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select className="form-control" style={{ width: 'auto', height: 32, fontSize: 12, padding: '0 8px' }}
                    value={newAssignee} onChange={e => setNewAssignee(e.target.value)}>
                    {['Ranger John','Ranger Sarah','Ranger Alex','Ranger Tommy'].map(r => <option key={r}>{r}</option>)}
                  </select>
                  <button className="btn btn-secondary btn-xs" onClick={() => handleReassignTask(selectedTask.id)}>Reassign</button>
                </div>
              )}
            </div>

            {/* State transitions */}
            <div>
              <h3 style={{ marginBottom: 10 }}>Update Task State</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedTask.status !== 'Closed' && !isClosed && (
                  <>
                    {(isRanger || isCtrl) && ['Created','Re-Assigned'].includes(selectedTask.status) && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateTask(selectedTask.id, 'Acknowledged')}>Acknowledge</button>
                    )}
                    {(isRanger || isCtrl) && ['Acknowledged','Created'].includes(selectedTask.status) && (
                      <button className="btn btn-primary btn-sm" onClick={() => handleUpdateTask(selectedTask.id, 'In Progress')}>Start Work</button>
                    )}
                    {(isRanger || isCtrl) && selectedTask.status === 'In Progress' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleUpdateTask(selectedTask.id, 'Pending')}>Set to Pending</button>
                    )}
                    {(isRanger || isCtrl) && (
                      <button className="btn btn-success btn-sm" onClick={() => handleUpdateTask(selectedTask.id, 'Closed')}>Close Task</button>
                    )}
                  </>
                )}
                {selectedTask.status === 'Closed' && isCtrl && !isClosed && (
                  <button className="btn btn-danger btn-sm" onClick={() => handleUpdateTask(selectedTask.id, 'Created')}>Reopen Task</button>
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setSelectedTask(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        /* ── Component tab buttons ────────────────────────────────────── */
        .comp-tab-btn {
          flex: 1;
          padding: 12px 14px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          color: var(--text-muted);
          font-family: var(--font-body);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          text-align: center;
        }
        .comp-tab-btn:hover  { color: var(--text-main); border-color: var(--border-color-hover); background: var(--bg-hover); }
        .comp-tab-btn.active { color: var(--color-info); border-color: var(--color-info-border); background: var(--color-info-bg); }

        /* ── Case detail layout ───────────────────────────────────────── */
        .case-content-grid {
          display: grid;
          grid-template-columns: 1fr 280px;
          gap: 16px;
          align-items: start;
        }
        .case-main-col { display: flex; flex-direction: column; gap: 14px; }
        .case-side-col { display: flex; flex-direction: column; gap: 12px; }

        /* ── Empty component state ────────────────────────────────────── */
        .empty-comp-state {
          padding: 48px 32px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-style: dashed;
        }

        /* ── Subform layout ──────────────────────────────────────────── */
        .subform-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .subform-card {
          padding: 14px 16px;
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* ── Checkbox rows ───────────────────────────────────────────── */
        .checkbox-row {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; cursor: pointer;
        }
        .checkbox-row input { width: 15px; height: 15px; cursor: pointer; }

        /* ── Side info rows ──────────────────────────────────────────── */
        .cd-info-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 12.5px; padding: 6px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .cd-info-row:last-child { border-bottom: none; }
        .cd-info-label { color: var(--text-muted); font-weight: 500; }
        .cd-info-value { text-align: right; color: var(--text-main); font-weight: 500; }
      `}</style>
    </>
  );
}
