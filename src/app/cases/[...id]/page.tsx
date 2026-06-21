'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Case, Task, Fault } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getIncidentTaxonomy, getFaultTaxonomy } from '@/lib/taxonomy';

// ─── Helper: case status → badge class ───────────────────────────────────────
function caseBadgeClass(status: string) {
  return status === 'Active'         ? 'badge badge-onsite' :
         status === 'Pending Triage' ? 'badge badge-ack'    : 'badge badge-closed';
}

function incBadgeClass(status: string) {
  switch (status) {
    case 'Live': return 'badge badge-live';
    case 'Live (Acknowledged)': return 'badge badge-ack';
    case 'Live (Incomplete)': return 'badge badge-ack';
    case 'Live (On-Site)': return 'badge badge-onsite';
    case 'Live (Completed)': return 'badge badge-completed';
    case 'Pending Endorsement': return 'badge badge-review';
    case 'Returned': return 'badge badge-live';
    case 'Closed': return 'badge badge-closed';
    default: return 'badge badge-closed';
  }
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
  const params = useParams();
  const { role, username } = useRole();

  const idArray = params?.id as string[] || [];
  const caseId = idArray.join('/');

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Case Title editing states
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState('');

  // Attach Incident Report Modal States
  const [showAttachIncidentModal, setShowAttachIncidentModal] = useState(false);
  const [attachCategory, setAttachCategory] = useState('Standard Incident');
  const [attachType, setAttachType] = useState('');
  const [attachSubType, setAttachSubType] = useState('');
  const [attachPriority, setAttachPriority] = useState('Normal');
  const [attachLocation, setAttachLocation] = useState('');
  const [attachSummary, setAttachSummary] = useState('');
  const [attachReporter, setAttachReporter] = useState('');
  const [attachRequestedBy, setAttachRequestedBy] = useState('IIOC Controller');

  // e-Diary log modal state
  const [showEdiaryModal, setShowEdiaryModal] = useState(false);

  // Active tabs
  const [ediaryLogs, setEdiaryLogs] = useState<any[]>([]);
  const [ediaryTopic, setEdiaryTopic] = useState('');
  const [ediaryContent, setEdiaryContent] = useState('');

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Task create form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Ranger John');
  const [taskPriority, setTaskPriority] = useState('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Task manage
  const [newAssignee, setNewAssignee] = useState('');

  // Faults
  const [caseFaults, setCaseFaults] = useState<Fault[]>([]);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [faultFormType, setFaultFormType] = useState('');
  const [faultFormSubType, setFaultFormSubType] = useState('');
  const [faultFormLocation, setFaultFormLocation] = useState('');
  const [faultFormDesc, setFaultFormDesc] = useState('');
  const [faultSubmitting, setFaultSubmitting] = useState(false);
  const [faultSubmitResult, setFaultSubmitResult] = useState<{ faultId?: string } | null>(null);
  const [faultTaxonomy, setFaultTaxonomy] = useState<Record<string, string[]>>({});
  const [cmmsStatusMap, setCmmsStatusMap] = useState<Record<string, string>>({});

  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setTaxonomy(getIncidentTaxonomy());
    setFaultTaxonomy(getFaultTaxonomy());
  }, []);

  useEffect(() => {
    setAttachSubType('');
  }, [attachType]);

  // ─── Data fetching ──────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    try {
      const [caseRes, taskRes, ediaryRes, faultsRes] = await Promise.all([
        fetch(`/api/cases/${caseId}`),
        fetch('/api/tasks'),
        fetch('/api/occurrences'),
        fetch(`/api/faults?caseId=${encodeURIComponent(caseId)}`),
      ]);
      if (caseRes.ok) {
        const c: Case = await caseRes.json();
        setCaseData(c);
        setEditTitleText(c.title);
      }
      if (taskRes.ok) {
        const all: Task[] = await taskRes.json();
        setTasks(all.filter(t => t.caseId === caseId));
      }
      if (ediaryRes.ok) {
        const all: any[] = await ediaryRes.json();
        setEdiaryLogs(all.filter(o => o.caseId === caseId));
      }
      if (faultsRes.ok) {
        const data = await faultsRes.json();
        setCaseFaults(data.faults || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { if (caseId) refresh(); }, [caseId, refresh]);

  /** PUT /api/cases/[caseId] */
  async function caseUpdate(payload: Record<string, any>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        await refresh();
      } else {
        const err = await res.json();
        alert(`Failed to update Case: ${err.error}`);
      }
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  // ─── Event handlers ─────────────────────────────────────────────────────────

  const handleCreateEDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ediaryTopic.trim() || !ediaryContent.trim()) return;
    try {
      const res = await fetch('/api/occurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          topic: ediaryTopic,
          content: ediaryContent,
          username
        })
      });
      if (res.ok) {
        setEdiaryTopic('');
        setEdiaryContent('');
        setShowEdiaryModal(false);
        await refresh();
      }
    } catch (e) {
      console.error('Error creating e-Diary entry:', e);
    }
  };

  const handleRaiseFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!faultFormType || !faultFormSubType || !faultFormDesc.trim() || faultSubmitting) return;
    setFaultSubmitting(true);
    setFaultSubmitResult(null);
    try {
      const res = await fetch('/api/faults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faultType: faultFormType,
          faultSubType: faultFormSubType,
          location: {
            commonName: faultFormLocation || caseData?.incident?.location?.commonName || 'Sentosa Island',
          },
          description: faultFormDesc,
          caseId,
          linkedIncidentId: caseData?.incident?.id || undefined,
          username,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setFaultSubmitResult({ faultId: data.fault?.id });
        setTimeout(() => {
          setShowFaultModal(false);
          setFaultSubmitResult(null);
          setFaultFormType(''); setFaultFormSubType(''); setFaultFormLocation(''); setFaultFormDesc('');
          refresh();
        }, 2500);
      } else {
        const err = await res.json();
        alert(`Failed to raise fault: ${err.error}`);
      }
    } catch (err) { console.error(err); }
    finally { setFaultSubmitting(false); }
  };

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

  const handleAttachIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachType) {
      alert('Incident Type is required.');
      return;
    }
    if (!attachSubType) {
      alert('Incident Sub-Type is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident: {
            category: attachCategory,
            type: attachType,
            subType: attachSubType,
            priority: attachPriority,
            summary: attachSummary,
            reporterName: attachReporter || 'Anonymous Guest',
            requestedBy: attachRequestedBy,
            location: {
              commonName: attachLocation
            }
          },
          username
        })
      });
      if (res.ok) {
        setShowAttachIncidentModal(false);
        setAttachLocation('');
        setAttachSummary('');
        setAttachReporter('');
        await refresh();
      } else {
        const err = await res.json();
        alert(`Failed to attach incident: ${err.error}`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-container glass"><div className="spinner" /><span>Loading Case Details…</span></div>;
  if (!caseData) return <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--color-critical)' }}>Case not found.</div>;

  const inc = caseData.incident;
  const isRanger = role === 'Responder (Ranger)';
  const isCtrl = role === 'Controller' || role === 'System Administrator';
  const isMgr = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';
  const isClosed = caseData.status === 'Closed';

  return (
    <>
      {/* ── MASTER CASE HUB VIEW ────────────────────────────────────────── */}
      <div className="glass" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Link href="/cases" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>← Case Log</Link>
            <span className="mono-id">{caseData.id}</span>
            <span className={caseBadgeClass(caseData.status)}>{caseData.status}</span>
            {caseData.linkedIncidentId && (
              <Link href={`/incidents/${caseData.linkedIncidentId}`} style={{ color: 'var(--color-primary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                🔗 Raised from Incident: {caseData.linkedIncidentId}
              </Link>
            )}
            {saving && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Saving…</span>}
          </div>

          {isEditingTitle ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input
                type="text"
                className="form-control"
                value={editTitleText}
                onChange={e => setEditTitleText(e.target.value)}
                style={{ fontSize: 16, fontWeight: 700, height: 36, width: '320px', padding: '0 8px' }}
                autoFocus
              />
              <button className="btn btn-success btn-xs" onClick={async () => {
                if (editTitleText.trim()) {
                  await caseUpdate({ title: editTitleText.trim() });
                  setIsEditingTitle(false);
                }
              }}>Save</button>
              <button className="btn btn-secondary btn-xs" onClick={() => {
                setEditTitleText(caseData.title);
                setIsEditingTitle(false);
              }}>Cancel</button>
            </div>
          ) : (
            <h1 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              {caseData.title}
              {!isClosed && (
                <button 
                  onClick={() => setIsEditingTitle(true)} 
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', padding: 4, borderRadius: 4, color: 'var(--text-muted)' }}
                  title="Rename Case"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
            </h1>
          )}

          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Logged {new Date(caseData.createdAt).toLocaleString('en-SG')} &bull; Creator: {caseData.createdBy}
            {caseData.closedAt ? ` • Closed ${new Date(caseData.closedAt).toLocaleString('en-SG')} — System` : ''}
          </p>
        </div>

        {/* Case Actions — closure is system-managed; only manual activation is permitted */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isCtrl && caseData.status === 'Pending Triage' && (
            <button className="btn btn-success btn-sm" onClick={() => caseUpdate({ status: 'Active' })}>Activate Case</button>
          )}
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="case-content-grid" style={{ marginTop: '1rem' }}>
        
        {/* Left Main Dashboard Cards */}
        <div className="case-main-col">
          <div className="component-card-grid">
            
            {/* 1. Incident Summary Card */}
            <div className="glass comp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--color-critical)' }}>🚨 SECURITY & SAFETY INCIDENT</h3>
                {inc ? <span className={incBadgeClass(inc.status)}>{inc.status}</span> : <span className="badge badge-closed">Not Attached</span>}
              </div>
              
              <div className="comp-card-body">
                {inc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{inc.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <div><strong>Incident ID:</strong> <span className="mono-id" style={{ fontSize: '10px', padding: '1px 5px' }}>{inc.id}</span></div>
                      <div><strong>Priority:</strong> {inc.priority}</div>
                      <div><strong>Classification:</strong> {inc.type} &bull; {inc.subType}</div>
                      <div><strong>Location:</strong> {inc.location.commonName || inc.location.road || 'TBD'}</div>
                      <div><strong>Assigned Ranger:</strong> {inc.assignedTo || <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>}</div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-comp-state" style={{ padding: '20px 0', minHeight: '120px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No security or safety incident report is linked to this case container.</p>
                  </div>
                )}
              </div>

              <div className="action-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: 0 }}>
                {inc ? (
                  <Link href={`/incidents/${inc.id}`} className="btn btn-primary btn-sm" style={{ width: '100%' }}>
                    Manage Incident Details
                  </Link>
                ) : (
                  !isClosed && (
                    <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => setShowAttachIncidentModal(true)}>
                      + Attach Incident Report
                    </button>
                  )
                )}
              </div>
            </div>

            {/* 2. Tasks Card */}
            <div className="glass comp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--color-active)' }}>🔧 RANGER DISPATCH TASKS</h3>
                <span className="count-badge">{tasks.length}</span>
              </div>

              <div className="comp-card-body" style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.length === 0 ? (
                  <div className="empty-comp-state" style={{ padding: '24px 0', minHeight: '100px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No operational tasks have been dispatched.</p>
                  </div>
                ) : (
                  tasks.map(t => (
                    <div key={t.id} className="active-case-item" style={{ padding: '6px 10px', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-inset)' }}
                      onClick={() => { setSelectedTask(t); setNewAssignee(t.assignee); }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        <span className={t.status === 'Closed' ? 'badge badge-closed' : t.status === 'In Progress' ? 'badge badge-onsite' : 'badge badge-ack'} style={{ fontSize: '9px', padding: '1px 6px' }}>{t.status}</span>
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                        <span>👤 {t.assignee}</span>
                        <span>Priority: {t.priority}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="action-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: 0, justifyContent: 'space-between' }}>
                {!isClosed ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowTaskModal(true)}>+ Dispatch Task</button>
                    <Link href="/tasks" className="view-all-link">Go to Task Board →</Link>
                  </>
                ) : (
                  <Link href="/tasks" className="view-all-link" style={{ marginLeft: 'auto' }}>View Task Board →</Link>
                )}
              </div>
            </div>

            {/* 3. CMMS Infrastructure Faults Card */}
            <div className="glass comp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--color-high)' }}>🛠 IFM MAINTENANCE FAULTS</h3>
                <span className="count-badge">{caseFaults.length}</span>
              </div>

              <div className="comp-card-body" style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {caseFaults.length === 0 ? (
                  <div className="empty-comp-state" style={{ padding: '24px 0', minHeight: '100px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No infrastructure faults logged for this case.</p>
                  </div>
                ) : (
                  caseFaults.map(f => (
                    <div key={f.id} style={{ padding: '6px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 5 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <Link href={`/faults/${f.id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--color-primary)', textDecoration: 'none' }}>{f.id}</Link>
                        <span className={`badge ${f.status === 'Closed' ? 'badge-closed' : f.status === 'Pending Submission' ? 'badge-ack' : 'badge-live'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                          {f.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.faultType} — {f.faultSubType}</div>
                      {f.cmmsTicketId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-info)' }}>{f.cmmsTicketId}</code>
                          <button
                            style={{ fontSize: 9, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            onClick={() => fetchCmmsStatus(f.cmmsTicketId!)}
                          >
                            {cmmsStatusMap[f.cmmsTicketId] ? `CMMS: ${cmmsStatusMap[f.cmmsTicketId]}` : '↻ Check CMMS'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="action-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: 0, justifyContent: 'space-between' }}>
                {!isClosed ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setShowFaultModal(true); setFaultSubmitResult(null); }}>
                      + Log Infrastructure Fault
                    </button>
                    <Link href="/faults" className="view-all-link">Go to Fault Log →</Link>
                  </>
                ) : (
                  <Link href="/faults" className="view-all-link" style={{ marginLeft: 'auto' }}>View Fault Log →</Link>
                )}
              </div>
            </div>

            {/* 4. e-Diary Logs Card */}
            <div className="glass comp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--color-review)' }}>📝 E-DIARY OCCURRENCE LOGS</h3>
                <span className="count-badge">{ediaryLogs.length}</span>
              </div>

              <div className="comp-card-body" style={{ maxHeight: '130px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ediaryLogs.length === 0 ? (
                  <div className="empty-comp-state" style={{ padding: '24px 0', minHeight: '100px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No occurrence diary entries logged for this case.</p>
                  </div>
                ) : (
                  ediaryLogs.slice(-2).reverse().map(log => (
                    <div key={log.id} style={{ padding: '6px 10px', border: '1px solid var(--border-color)', borderRadius: '4px', background: 'var(--bg-inset)', fontSize: '11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: '2px', color: 'var(--color-active)' }}>
                        <span>{log.topic}</span>
                        <span style={{ fontSize: '9.5px', color: 'var(--text-faint)' }}>{new Date(log.dateTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                      </div>
                      <p style={{ color: 'var(--text-sub)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: 0 }}>{log.content}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="action-row" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '10px', marginTop: 0, justifyContent: 'space-between' }}>
                {!isClosed ? (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowEdiaryModal(true)}>+ Log Occurrence</button>
                    <Link href="/occurrences" className="view-all-link">Go to e-Diary →</Link>
                  </>
                ) : (
                  <Link href="/occurrences" className="view-all-link" style={{ marginLeft: 'auto' }}>View e-Diary →</Link>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Right Sidebar */}
        <div className="case-side-col">
          {/* Case Audit Trail */}
          <div className="glass" style={{ padding: '14px 16px' }}>
            <h3 className="section-title">Case Audit Trail</h3>
            <div className="timeline" style={{ maxHeight: 480, overflowY: 'auto' }}>
              {caseData.closedAt && (
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ background: 'var(--color-closed)' }} />
                  <div className="timeline-header"><span>{new Date(caseData.closedAt).toLocaleDateString('en-SG')}</span></div>
                  <div className="timeline-desc" style={{ fontSize: 11, padding: '6px 10px' }}>
                    {caseData.status === 'No Action Required'
                      ? 'Case closed — No Action Required (System).'
                      : 'Case container closed automatically by System.'}
                  </div>
                </div>
              )}
              {inc?.log && [...inc.log].reverse().slice(0, 5).map(entry => (
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

      {/* Attach Incident Report Modal */}
      {showAttachIncidentModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            <div className="modal-title">Attach Security/Safety Incident Report</div>
            <form onSubmit={handleAttachIncident}>
              <div className="form-grid">


                <div className="form-group">
                  <label>Incident Type *</label>
                  <select value={attachType} onChange={(e) => setAttachType(e.target.value)} className="form-control select-dark" required>
                    <option value="">-- Select Type --</option>
                    {Object.keys(taxonomy).sort().map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Incident Sub-Type *</label>
                  <select value={attachSubType} onChange={(e) => setAttachSubType(e.target.value)} disabled={!attachType} className="form-control select-dark" required>
                    <option value="">-- Select Sub-Type --</option>
                    {attachType && taxonomy[attachType]?.sort().map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select value={attachPriority} onChange={(e) => setAttachPriority(e.target.value)} className="form-control select-dark">
                    <option value="High">High</option>
                    <option value="Normal">Normal</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Requested By</label>
                  <select value={attachRequestedBy} onChange={(e) => setAttachRequestedBy(e.target.value)} className="form-control select-dark">
                    <option value="IIOC Controller">IIOC Controller</option>
                    <option value="Guest Call-in">Guest Call-in (Hotline)</option>
                    <option value="Ranger Field Patrol">Ranger Field Patrol</option>
                    <option value="State Agency (SCDF/SPF)">State Agency (SCDF/SPF)</option>
                  </select>
                </div>

                <div className="form-group colspan-2">
                  <label>Reporter Details</label>
                  <input
                    type="text"
                    placeholder="Reporter Name / Contact Details"
                    value={attachReporter}
                    onChange={(e) => setAttachReporter(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group colspan-2">
                  <label>Location Common Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Siloso Lifeguard Post 2"
                    value={attachLocation}
                    onChange={(e) => setAttachLocation(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 10 }}>
                <label>Incident Summary Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide details on the incident..."
                  value={attachSummary}
                  onChange={(e) => setAttachSummary(e.target.value)}
                  className="form-control"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAttachIncidentModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>Attach Report</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
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
                    {['High','Normal'].map(p => <option key={p}>{p}</option>)}
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

      {/* Task Detail Modal */}
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

      {/* Log Infrastructure Fault Modal */}
      {showFaultModal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 520 }}>
            {faultSubmitResult ? (
              <>
                <div className="modal-title">✓ Fault Saved as Draft</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 16px' }}>
           