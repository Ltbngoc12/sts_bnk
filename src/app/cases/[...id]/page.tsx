'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Case, Task, Fault, RecurrenceConfig } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getIncidentTaxonomy, getTaskPriorityTaxonomy } from '@/lib/taxonomy';
import { INCIDENT_CATEGORIES, DEFAULT_INCIDENT_CATEGORY } from '@/lib/incidentCategory';
import FaultCreateModal from '@/components/FaultCreateModal';
import { RecurrenceScheduleField, recurrenceSummary } from '@/components/RecurrenceScheduleField';
import { getAssignableUsers, getAssignableGroups } from '@/lib/taskHelpers';
import { getUsers } from '@/lib/users';
import { useNotifications } from '@/context/NotificationContext';
import { TOPICS as EDIARY_TOPICS } from '@/components/tabs/EDiaryTab';

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

// ─── RespondersAvatars Helper Component (Assignee Circles) ──────────────────
function RespondersAvatars({ names }: { names: string | string[] }) {
  const list = (Array.isArray(names) ? names : [names])
    .filter(Boolean)
    .filter(name => name !== 'Unassigned');
    
  if (list.length === 0) {
    return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  }

  const getAvatarColor = (name: string) => {
    const charCode = name.charCodeAt(0) || 65;
    const colors = [
      '#10B981', // Teal/green
      '#3B82F6', // Blue
      '#EC4899', // Pink
      '#8B5CF6', // Purple
      '#F97316', // Orange
      '#0D9488', // Dark teal
      '#6366F1', // Indigo
    ];
    return colors[charCode % colors.length];
  };

  if (list.length === 1) {
    const name = list[0];
    const letter = name.trim().charAt(0).toUpperCase();
    const color = getAvatarColor(name);
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: color,
          color: '#FFF',
          fontSize: '9px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #FFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
        }}>
          {letter}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-sub)' }}>{name}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', marginRight: '6px' }}>
        {list.map((name, idx) => {
          const letter = name.trim().charAt(0).toUpperCase();
          const color = getAvatarColor(name);
          return (
            <span
              key={idx}
              title={name}
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: color,
                color: '#FFF',
                fontSize: '9px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid #FFF',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                marginLeft: idx > 0 ? '-4px' : '0',
                zIndex: 10 - idx
              }}
            >
              {letter}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CaseDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { role, username } = useRole();
  const { addNotification } = useNotifications();

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
  const [attachCategory, setAttachCategory] = useState<string>(DEFAULT_INCIDENT_CATEGORY);
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
  const [ediaryCustomTopic, setEdiaryCustomTopic] = useState('');
  const [ediaryContent, setEdiaryContent] = useState('');
  const [ediaryDateTime, setEdiaryDateTime] = useState('');

  // Modals
  const [showTaskModal, setShowTaskModal] = useState(false);

  // Task create form
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [assignType, setAssignType] = useState<'user' | 'group'>('user');
  const [taskAssignee, setTaskAssignee] = useState('');
  const [taskPriority, setTaskPriority] = useState('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceConfig | null>(null);
  interface ChecklistDraft { id: string; text: string; isCompleted: boolean; }
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');

  const assignableUsers = getAssignableUsers();
  const assignableGroups = getAssignableGroups();

  const notifyNewAssignee = (name: string, type: 'user' | 'group', title: string) => {
    if (type === 'group') {
      addNotification({ title: 'Task Assigned', message: `New task "${title}" assigned to group ${name}.`, role: 'Responder (Ranger)', type: 'task', link: '/tasks' });
    } else {
      const u = getUsers().find(x => x.name === name);
      const targetRole = u?.role === 'Responder' ? 'Responder (Ranger)' : ((u?.role as any) || 'Responder (Ranger)');
      addNotification({ title: 'Task Assigned', message: `New task "${title}" assigned to you.`, role: targetRole, type: 'task', link: '/tasks' });
    }
  };

  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setChecklist([...checklist, { id: `chk-${Date.now()}`, text: checklistInput.trim(), isCompleted: false }]);
    setChecklistInput('');
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).map(f => f.name);
    setAttachments(prev => [...prev, ...files]);
  };

  const resetForm = () => {
    setTaskTitle(''); setTaskDesc(''); setTaskDueDate('');
    setRecurrence(null); setChecklist([]); setChecklistInput('');
    setAttachments([]); setTaskAssignee(''); setAssignType('user');
    setTaskPriority('Normal'); setCreateError('');
  };

  // Faults
  const [caseFaults, setCaseFaults] = useState<Fault[]>([]);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [cmmsStatusMap, setCmmsStatusMap] = useState<Record<string, string>>({});

  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});
  const [taskPriorityOptions, setTaskPriorityOptions] = useState<string[]>(['Normal', 'High']);

  useEffect(() => {
    setTaxonomy(getIncidentTaxonomy());
    setTaskPriorityOptions(getTaskPriorityTaxonomy());
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
    const finalTopic = ediaryTopic === 'Others' ? ediaryCustomTopic.trim() : ediaryTopic;
    if (!finalTopic || !ediaryContent.trim()) return;
    try {
      const res = await fetch('/api/occurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          topic: finalTopic,
          content: ediaryContent.trim(),
          dateTime: ediaryDateTime ? new Date(ediaryDateTime).toISOString() : undefined,
          username
        })
      });
      if (res.ok) {
        setEdiaryTopic('');
        setEdiaryCustomTopic('');
        setEdiaryContent('');
        setEdiaryDateTime('');
        setShowEdiaryModal(false);
        await refresh();
      }
    } catch (e) {
      console.error('Error creating e-Diary entry:', e);
    }
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
    setCreateError('');
    if (!taskTitle.trim()) return;

    const payload = {
      caseId,
      title: taskTitle,
      description: taskDesc,
      assignee: taskAssignee || 'Unassigned',
      assigneeType: assignType,
      priority: taskPriority,
      dueDate: taskDueDate,
      recurrence: recurrence || undefined,
      recurrenceSchedule: recurrence ? recurrenceSummary(recurrence) : '',
      checklist,
      attachments,
      username,
    };

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (taskAssignee) notifyNewAssignee(taskAssignee, assignType, taskTitle);
        setShowTaskModal(false);
        resetForm();
        await refresh();
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create task.');
      }
    } catch (e) {
      console.error(e);
      setCreateError('Network error.');
    }
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
  const isMgr = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator' || role === 'Current Ops Administrator';
  const isClosed = caseData.status === 'Closed';

  return (
    <>
      {/* ── MASTER CASE HUB VIEW ────────────────────────────────────────── */}
      <div className="glass" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <Link href="/case-management?tab=cases" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>← Case Log</Link>
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
                style={{ fontFamily: 'var(--font-title), serif', fontSize: 16, fontWeight: 700, height: 36, width: '320px', padding: '0 8px' }}
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
            <h1 style={{ fontFamily: 'var(--font-title), serif', fontSize: 18, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
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

        </div>

        {/* Case Actions — closure is system-managed; manual status update to No Action Required is permitted for controller */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {isCtrl && caseData.status === 'Pending Triage' && (
            <button className="btn btn-warning btn-sm" onClick={() => caseUpdate({ status: 'No Action Required' })}>No Action Required</button>
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
                {inc ? <span className={incBadgeClass(inc.status)}>{inc.status === 'Live (Assigned)' ? 'Assigned' : inc.status}</span> : <span className="badge badge-closed">Not Attached</span>}
              </div>
              
              <div className="comp-card-body">
                {inc ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-main)' }}>{inc.title}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <div><strong>Incident ID:</strong> <span className="mono-id" style={{ fontSize: '10px', padding: '1px 5px', color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>{inc.id}</span></div>
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

              <div className="comp-card-body" style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tasks.length === 0 ? (
                  <div className="empty-comp-state" style={{ padding: '24px 0', minHeight: '100px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>No operational tasks have been dispatched.</p>
                  </div>
                ) : (
                  tasks.map(t => (
                    <div key={t.id} className="active-case-item" style={{ padding: '6px 10px', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-inset)' }}
                      onClick={() => router.push(`/tasks/${t.id}`)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                        <span className={t.status === 'Closed' ? 'badge badge-closed' : t.status === 'In Progress' ? 'badge badge-onsite' : 'badge badge-ack'} style={{ fontSize: '9px', padding: '1px 6px' }}>{t.status}</span>
                      </div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <RespondersAvatars names={t.assignee} />
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
                    <Link href="/case-management?tab=tasks" className="view-all-link">Go to Task Board →</Link>
                  </>
                ) : (
                  <Link href="/case-management?tab=tasks" className="view-all-link" style={{ marginLeft: 'auto' }}>View Task Board →</Link>
                )}
              </div>
            </div>

            {/* 3. CMMS Infrastructure Faults Card */}
            <div className="glass comp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--color-high)' }}>🛠 IFM MAINTENANCE FAULTS</h3>
                <span className="count-badge">{caseFaults.length}</span>
              </div>

              <div className="comp-card-body" style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowFaultModal(true)}>
                      + Log Infrastructure Fault
                    </button>
                    <Link href="/case-management?tab=faults" className="view-all-link">Go to Fault Log →</Link>
                  </>
                ) : (
                  <Link href="/case-management?tab=faults" className="view-all-link" style={{ marginLeft: 'auto' }}>View Fault Log →</Link>
                )}
              </div>
            </div>

            {/* 4. e-Diary Logs Card */}
            <div className="glass comp-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ color: 'var(--color-review)' }}>📝 E-DIARY OCCURRENCE LOGS</h3>
                <span className="count-badge">{ediaryLogs.length}</span>
              </div>

              <div className="comp-card-body" style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                    <Link href="/case-management?tab=ediary" className="view-all-link">Go to e-Diary →</Link>
                  </>
                ) : (
                  <Link href="/case-management?tab=ediary" className="view-all-link" style={{ marginLeft: 'auto' }}>View e-Diary →</Link>
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
                  <label>Incident Category *</label>
                  <select value={attachCategory} onChange={(e) => setAttachCategory(e.target.value)} className="form-control select-dark" required>
                    {INCIDENT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

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
        <div className="modal-backdrop">
          <div className="create-case-modal glass">
            <div className="modal-header">
              <h2>CREATE NEW OPERATIONAL TASK</h2>
              <button className="close-btn" onClick={() => setShowTaskModal(false)}>Close</button>
            </div>

            <form onSubmit={handleCreateTask} className="modal-form">
              <div className="modal-scroll-area">
                {createError && <div className="td-create-error">{createError}</div>}

                <div className="form-group">
                  <label>Link to Parent Case *</label>
                  <input className="form-control" value={caseId} disabled style={{ opacity: 0.8, cursor: 'not-allowed', background: 'var(--bg-inset)' }} />
                </div>

                <div className="form-group">
                  <label>Task Title *</label>
                  <input type="text" placeholder="e.g. Escort contractor to substation" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required className="form-control" />
                </div>

                <div className="form-group">
                  <label>Task Description</label>
                  <textarea placeholder="Provide details on ground activities needed..." value={taskDesc} onChange={e => setTaskDesc(e.target.value)} className="form-control" rows={2} />
                </div>

                <div className="form-group">
                  <label>Checklist (optional)</label>
                  <div className="checklist-builder">
                    <input
                      type="text"
                      placeholder="Add a checklist item and press Add"
                      value={checklistInput}
                      onChange={e => setChecklistInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                      className="form-control"
                    />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addChecklistItem}>Add</button>
                  </div>
                  {checklist.length > 0 && (
                    <ul className="checklist-draft">
                      {checklist.map(c => (
                        <li key={c.id}>
                          <span>☐ {c.text}</span>
                          <button type="button" onClick={() => setChecklist(checklist.filter(x => x.id !== c.id))}>✕</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Assign To</label>
                    <select value={assignType} onChange={e => { setAssignType(e.target.value as any); setTaskAssignee(''); }} className="form-control select-dark">
                      <option value="user">Individual User</option>
                      <option value="group">Group</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>{assignType === 'user' ? 'Assignee' : 'Group'}</label>
                    <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} className="form-control select-dark">
                      <option value="">-- Unassigned --</option>
                      {assignType === 'user'
                        ? assignableUsers.map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)
                        : assignableGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Priority</label>
                    <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)} className="form-control select-dark">
                      {taskPriorityOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Due Date & Time</label>
                    <input type="datetime-local" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} className="form-control" />
                  </div>
                </div>

                <div className="form-group">
                  <RecurrenceScheduleField value={recurrence} onChange={setRecurrence} />
                </div>

                <div className="form-group">
                  <label>Attachments</label>
                  <input type="file" multiple onChange={handleFiles} className="form-control" />
                </div>
                {attachments.length > 0 && (
                  <div className="attach-draft">{attachments.map((a, i) => <span key={i}>📎 {a}</span>)}</div>
                )}
              </div>

              <div className="modal-actions-bar">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTaskModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">DISPATCH TASK</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task actions now live in the centralized Task detail view (/tasks/[id]) */}

      {/* Log Infrastructure Fault Modal */}
      <FaultCreateModal
        isOpen={showFaultModal}
        onClose={() => setShowFaultModal(false)}
        onSuccess={() => refresh()}
        linkedCaseId={caseId}
        linkedIncidentId={caseData?.incident?.id}
        prefillLocation={caseData?.incident?.location}
        username={username}
      />

      {/* Log e-Diary Occurrence Modal */}
      {showEdiaryModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>NEW E-DIARY ENTRY</h2>
              <button className="close-btn" onClick={() => setShowEdiaryModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateEDiary} className="modal-form">
              <div className="modal-scroll-area">

                <div className="form-group">
                  <label>Topic / Subject *</label>
                  <select
                    value={ediaryTopic}
                    onChange={e => setEdiaryTopic(e.target.value)}
                    required
                    className="form-control select-dark"
                  >
                    <option value="">— Select topic —</option>
                    {EDIARY_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {ediaryTopic === 'Others' && (
                  <div className="form-group">
                    <label>Custom Topic *</label>
                    <input type="text" placeholder="e.g. Unusual weather advisory"
                      value={ediaryCustomTopic} onChange={e => setEdiaryCustomTopic(e.target.value)}
                      required className="form-control" />
                  </div>
                )}

                <div className="form-group">
                  <label>Date &amp; Time of Occurrence</label>
                  <input type="datetime-local" value={ediaryDateTime}
                    onChange={e => setEdiaryDateTime(e.target.value)} className="form-control" />
                  <p className="sub-desc">Defaults to now. Backdating is permitted.</p>
                </div>

                <div className="form-group">
                  <label>Narrative *</label>
                  <textarea placeholder="Describe the occurrence, interaction, or advisory…"
                    value={ediaryContent} onChange={e => setEdiaryContent(e.target.value)}
                    required className="form-control" rows={5} />
                </div>

              </div>
              <div className="modal-actions-bar">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEdiaryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">SUBMIT ENTRY</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        /* ── Case detail layout ───────────────────────────────────────── */
        .case-content-grid {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 16px;
          align-items: start;
        }
        .case-main-col { display: flex; flex-direction: column; gap: 14px; }
        .case-side-col { display: flex; flex-direction: column; gap: 12px; }

        /* ── Component Cards grid ────────────────────────────────────── */
        .component-card-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .comp-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 24px;
          min-height: 360px;
        }
        .comp-card h3 {
          font-family: var(--font-headline);
          font-size: 13.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .comp-card-body {
          flex: 1;
          margin-top: 12px;
          margin-bottom: 14px;
        }
        .comp-card-body::-webkit-scrollbar {
          width: 5px;
        }
        .comp-card-body::-webkit-scrollbar-track {
          background: transparent;
        }
        .comp-card-body::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 10px;
        }
        .comp-card-body::-webkit-scrollbar-thumb:hover {
          background: var(--border-color-hover);
        }
        .section-title {
          font-family: var(--font-headline);
          font-size: 14px;
          font-weight: 700;
          text-transform: none;
          letter-spacing: 0.02em;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 10px;
          margin-bottom: 16px;
          color: var(--text-main);
        }

        /* ── Empty component state ────────────────────────────────────── */
        .empty-comp-state {
          padding: 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        /* ── Side info rows ──────────────────────────────────────────── */
        .cd-info-row {
          display: flex; justify-content: space-between; align-items: center;
          font-size: 12.5px; padding: 6px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .cd-info-row:last-child { border-bottom: none; }
        .cd-info-label { color: var(--text-muted); font-weight: 500; }
        .cd-info-value { text-align: right; color: var(--text-main); font-weight: 500; }

        .checklist-builder { display: flex; gap: 8px; }
        .checklist-builder input { flex: 1; }
        .btn-sm { padding: 6px 12px; font-size: 12px; height: auto; white-space: nowrap; }
        .checklist-draft { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
        .checklist-draft li { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-sub); background: var(--bg-inset); padding: 5px 10px; border-radius: var(--radius-sm); }
        .checklist-draft button { background: none; border: none; color: var(--color-critical); cursor: pointer; font-size: 12px; }
        .td-create-error { background: var(--color-critical-bg); color: var(--color-critical); border: 1px solid var(--color-critical-border); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12.5px; margin-bottom: 12px; }
      `}</style>
    </>
  );
}

