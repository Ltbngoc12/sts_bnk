'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Task, TaskChecklistItem, TaskAssignee } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { useNotifications } from '@/context/NotificationContext';
import {
  taskBadgeClass,
  isControllerPlus,
  getTaskAssignees,
  isTaskAssignee,
} from '@/lib/taskHelpers';
import { getUsers } from '@/lib/users';
import { getTaskPriorityTaxonomy } from '@/lib/taxonomy';
import TaskAssigneeSelect from '@/components/TaskAssigneeSelect';
import { uploadAttachments } from '@/lib/uploadAttachment';

export default function TaskDetailPage() {
  const params = useParams();
  const idArray = (params?.id as string[]) || [];
  const taskId = idArray.join('/');

  const { role, username } = useRole();
  const { addNotification } = useNotifications();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reassign / assign
  const [assignTargets, setAssignTargets] = useState<TaskAssignee[]>([]);
  const [reassigning, setReassigning] = useState(false);

  // Comment
  const [commentText, setCommentText] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<string[]>([]);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [ePriority, setEPriority] = useState('Normal');
  const [priorityOptions, setPriorityOptions] = useState<string[]>(['Normal', 'High']);
  const [eDue, setEDue] = useState('');
  const [eChecklist, setEChecklist] = useState<TaskChecklistItem[]>([]);
  const [eChkInput, setEChkInput] = useState('');

  // Edit scope prompt (recurring — W11)
  const [showEditScope, setShowEditScope] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<Record<string, any> | null>(null);

  // Close modal
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');
  const [closeScope, setCloseScope] = useState<'thisOnly' | 'future'>('thisOnly');

  // Flag-cannot-complete
  const [showFlag, setShowFlag] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  // Controller review of a completion (Pending Closure → Accept / Reject)
  const [showReject, setShowReject] = useState(false);
  const [reviewNote, setReviewNote] = useState('');

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        setTask(await res.json());
      } else {
        setError('Task not found.');
      }
    } catch {
      setError('Failed to load task.');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => { fetchTask(); }, [fetchTask]);

  useEffect(() => {
    setPriorityOptions(getTaskPriorityTaxonomy());
  }, []);

  const canControl = isControllerPlus(role);
  const isAssignee = !!task && isTaskAssignee(getTaskAssignees(task), username);
  const isRanger = role === 'Responder (Ranger)';

  // A ranger who is not the assignee has no access (per spec decision).
  const noAccess = !!task && isRanger && !isAssignee;

  function notifyAssignees(targets: TaskAssignee[], verb: string) {
    const notifiedUsers = new Set<string>();
    targets.forEach(t => {
      if (t.type === 'group') {
        addNotification({
          title: `Task ${verb}`,
          message: `Task "${task?.title}" ${verb.toLowerCase()} to group ${t.name}.`,
          role: 'Responder (Ranger)',
          type: 'task',
          link: `/tasks/${taskId}`,
        });
      } else {
        if (notifiedUsers.has(t.name)) return;
        notifiedUsers.add(t.name);
        const u = getUsers().find(x => x.name === t.name);
        const targetRole =
          u?.role === 'Responder' ? 'Responder (Ranger)' :
          (u?.role as any) || 'Responder (Ranger)';
        addNotification({
          title: `Task ${verb}`,
          message: `Task "${task?.title}" ${verb.toLowerCase()} to you.`,
          role: targetRole,
          type: 'task',
          link: `/tasks/${taskId}`,
        });
      }
    });
  }

  async function performAction(action: string, payload: Record<string, any> = {}) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actor: username, role, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Action failed.');
        return false;
      }
      setTask(data);
      return true;
    } catch {
      setError('Network error.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ─── Action handlers ──────────────────────────────────────────────
  const handleAssign = async () => {
    if (assignTargets.length === 0) return;
    const hadAssignee = !!task && getTaskAssignees(task).length > 0;
    const verb = hadAssignee ? 'Reassigned' : 'Assigned';
    const ok = await performAction(hadAssignee ? 'reassign' : 'assign', {
      assignees: assignTargets,
    });
    if (ok) {
      notifyAssignees(assignTargets, verb);
      setAssignTargets([]);
      setReassigning(false);
    }
  };

  const handleToggleChecklist = async (itemId: string) => {
    if (!task?.checklist) return;
    const updated = task.checklist.map(i =>
      i.id === itemId ? { ...i, isCompleted: !i.isCompleted } : i
    );
    await performAction('update-checklist', { checklist: updated });
  };

  const handleAddComment = async () => {
    if (!commentText.trim() && commentAttachments.length === 0) return;
    const ok = await performAction('add-comment', { text: commentText, images: commentAttachments });
    if (ok) {
      setCommentText('');
      setCommentAttachments([]);
    }
  };

  // Uploads to Vercel Blob and stores the URL — see src/lib/attachments.ts.
  const handleCommentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    e.target.value = '';
    void (async () => {
      const errors = await uploadAttachments(filesArray, 'tasks', (url) =>
        setCommentAttachments(prev => [...prev, url]),
      );
      if (errors.length > 0) alert(errors.join('\n'));
    })();
  };

  const startEditing = () => {
    if (!task) return;
    setETitle(task.title);
    setEDesc(task.description || '');
    setEPriority(task.priority);
    setEDue(task.dueDate ? task.dueDate.slice(0, 16) : '');
    setEChecklist((task.checklist || []).map(i => ({ ...i })));
    setEChkInput('');
    setEditing(true);
  };

  const addEditChecklistItem = () => {
    const text = eChkInput.trim();
    if (!text) return;
    setEChecklist(prev => [...prev, { id: `chk-${Math.random().toString(36).slice(2, 9)}`, text, isCompleted: false }]);
    setEChkInput('');
  };

  const doSaveEdit = async (scope?: 'thisOnly' | 'future') => {
    const ok = await performAction('edit-fields', {
      title: eTitle, description: eDesc, priority: ePriority, dueDate: eDue,
      checklist: eChecklist, ...(scope ? { scope } : {}),
    });
    if (ok) { setEditing(false); setShowEditScope(false); setPendingEdit(null); }
  };

  const handleSaveEdit = async () => {
    // Recurring & still tied to the series → ask scope first (W11)
    if (task && (task.recurrence || task.seriesId) && !task.detachedFromSeries) {
      setPendingEdit({});
      setShowEditScope(true);
      return;
    }
    await doSaveEdit();
  };

  const handleClose = async () => {
    const isRecurring = !!task && (!!task.recurrence || !!task.seriesId);
    const ok = await performAction('close', {
      closeReason,
      ...(isRecurring ? { scope: closeScope } : {}),
    });
    if (ok) { setShowClose(false); setCloseReason(''); setCloseScope('thisOnly'); }
  };

  const handleFlag = async () => {
    if (!flagReason.trim()) return; // reason mandatory (E8.1)
    const ok = await performAction('flag-cannot-complete', { reason: flagReason });
    if (ok) { setShowFlag(false); setFlagReason(''); }
  };

  // Controller accepts a completion → task Closed (Fig 7-1 "Accept")
  const handleAcceptCompletion = async () => {
    await performAction('accept-completion');
  };

  // Controller rejects a completion → back to In Progress (Fig 7-1 "Reject")
  const handleRejectCompletion = async () => {
    if (!reviewNote.trim()) return; // reason mandatory — assignee needs to know what to fix
    const ok = await performAction('reject-completion', { reviewNote });
    if (ok) {
      if (task) notifyAssignees(getTaskAssignees(task), 'Returned');
      setShowReject(false);
      setReviewNote('');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────
  if (loading) return <div className="glass" style={{ padding: 24, margin: 16 }}>Loading task…</div>;
  if (error && !task) return <div className="glass" style={{ padding: 24, margin: 16 }}>{error}</div>;
  if (!task) return null;

  if (noAccess) {
    return (
      <div className="glass" style={{ padding: 32, margin: 16, textAlign: 'center' }}>
        <h2 style={{ marginBottom: 8 }}>No access</h2>
        <p style={{ color: 'var(--text-muted)' }}>This task is not assigned to you.</p>
        <Link href="/case-management?tab=tasks" className="btn btn-secondary" style={{ marginTop: 16, display: 'inline-block' }}>← Back to Task Board</Link>
      </div>
    );
  }

  const checklistDone = (task.checklist || []).filter(i => i.isCompleted).length;
  const checklistTotal = (task.checklist || []).length;
  const checklistComplete = checklistTotal === 0 || checklistDone === checklistTotal;

  // Recurrence / edge-case computed state
  const isRecurring = !!task.recurrence || !!task.seriesId;
  const overdue = !!task.dueDate && task.status !== 'Closed' && task.status !== 'Pending Closure' && new Date(task.dueDate).getTime() < Date.now();
  const currentAssignees = getTaskAssignees(task);
  const sameAssigneeKey = (list: TaskAssignee[]) => list.map(a => `${a.type}:${a.name}`).sort().join('|');
  const sameAssignees = assignTargets.length > 0 && sameAssigneeKey(assignTargets) === sameAssigneeKey(currentAssignees);

  // Activity Log = system audit trail only (reverse-chronological)
  const auditFeed = (task.audits || [])
    .map(a => ({ ts: a.timestamp, operator: a.operator, title: a.action, body: a.details }))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Comments = user discussion, separate from the audit trail
  const commentFeed = (task.comments || [])
    .map(c => ({ ts: c.timestamp, operator: c.user, body: c.text, images: c.images || [] }))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const getInitials = (name: string) => {
    if (!name || name === 'Unassigned') return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };
  const checklistProgress = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  return (
    <div className="task-detail-page">
      {/* 1. Header Card (Compact & High Density) - Matching Incident Detail Header */}
      <div className="glass" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/case-management?tab=tasks" style={{ color: 'var(--text-faint)', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
              ← BACK TO TASK BOARD
            </Link>
            <span style={{ color: 'var(--text-faint)' }}>&bull;</span>
            <span className="mono-id" style={{ background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderColor: 'var(--color-critical-border)', fontSize: '11px', padding: '1px 6px' }}>
              Task: {task.id}
            </span>
            <Link
              href={`/cases/${task.caseId}`}
              className="mono-id"
              style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)', borderColor: 'var(--color-info-border)', fontSize: '11px', padding: '1px 6px', textDecoration: 'none' }}
            >
              Case: {task.caseId}
            </Link>
            {task.linkedIncidentId && (
              <>
                <span style={{ color: 'var(--text-faint)' }}>&bull;</span>
                <Link
                  href={`/incidents/${task.linkedIncidentId}`}
                  className="mono-id"
                  style={{ background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderColor: 'var(--color-critical-border)', fontSize: '11px', padding: '1px 6px', textDecoration: 'none' }}
                >
                  Incident: {task.linkedIncidentId}
                </Link>
              </>
            )}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{task.title}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge ${taskBadgeClass(task.status)}`} style={{ marginRight: 8 }}>{task.status}</span>
          
          {/* Contextual action bar (role × status) */}
          {!editing && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {canControl && task.status !== 'Closed' && (
                <button className="btn btn-secondary btn-sm" onClick={startEditing} disabled={busy}>Edit</button>
              )}
              {isAssignee && (task.status === 'Assigned' || task.status === 'Returned') && (
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => performAction('acknowledge')}>Acknowledge</button>
              )}
              {isAssignee && task.status === 'Acknowledged' && (
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => performAction('begin')}>Begin Task</button>
              )}
              {isAssignee && task.status === 'In Progress' && (
                <>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setShowFlag(true)}>Cannot Complete</button>
                  <button className="btn btn-success btn-sm" disabled={busy || !checklistComplete} title={!checklistComplete ? 'Complete all checklist items first' : ''} onClick={() => performAction('mark-complete')}>Mark Complete</button>
                </>
              )}
              {/* Controller reviews the completion (Fig 7-1) */}
              {canControl && task.status === 'Pending Closure' && (
                <>
                  <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setShowReject(true)}>Return to Assignee</button>
                  <button className="btn btn-success btn-sm" disabled={busy} onClick={handleAcceptCompletion}>Accept &amp; Close</button>
                </>
              )}
              {/* Drop is only offered from Pending Further Action (Fig 7-1 "Continue or drop?") */}
              {canControl && task.status === 'Pending Further Action' && (
                <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => setShowClose(true)}>Drop Task</button>
              )}
              {canControl && task.status === 'Closed' && (
                <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => performAction('reopen')}>Reopen Task</button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recurring occurrence banner (W11/§7.3) — templates show their banner inside the RECURRENCE TEMPLATE card instead */}
      {isRecurring && !task.recurrence && (
        <div className="td-series-banner">
          <span className="td-series-icon">🔁</span>
          <span>
            Occurrence of recurring series <strong>{task.seriesId}</strong>{task.occurrenceDate ? <> · {task.occurrenceDate}</> : null}
          </span>
          {task.detachedFromSeries && <span className="td-series-tag detached">Detached (this only)</span>}
          {task.recurrenceCancelled && <span className="td-series-tag cancelled">Series cancelled</span>}
        </div>
      )}

      {error && <div className="td-error glass">{error}</div>}

      <div className="td-grid">
        {/* LEFT: details */}
        <div className="td-col">
          <div className="glass td-card">
            <div className="td-card-head">
              <h3>📋 TASK DETAILS</h3>
            </div>

            {editing ? (
              <div className="td-edit-form">
                <label>Title</label>
                <input className="form-control" value={eTitle} onChange={e => setETitle(e.target.value)} />
                <label>Description</label>
                <textarea className="form-control" rows={3} value={eDesc} onChange={e => setEDesc(e.target.value)} />
                <div className="td-edit-grid">
                  <div>
                    <label>Priority</label>
                    <select className="form-control select-dark" value={ePriority} onChange={e => setEPriority(e.target.value)}>
                      {priorityOptions.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Due Date</label>
                    <input type="datetime-local" className="form-control" value={eDue} onChange={e => setEDue(e.target.value)} />
                  </div>
                </div>

                <label>Checklist</label>
                <div className="td-chk-builder">
                  <input
                    className="form-control"
                    placeholder="Add a checklist item and press Add"
                    value={eChkInput}
                    onChange={e => setEChkInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEditChecklistItem(); } }}
                  />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addEditChecklistItem}>Add</button>
                </div>
                {eChecklist.length > 0 && (
                  <ul className="td-chk-edit">
                    {eChecklist.map(c => (
                      <li key={c.id}>
                        <span>{c.isCompleted ? '☑' : '☐'} {c.text}</span>
                        <button type="button" onClick={() => setEChecklist(prev => prev.filter(x => x.id !== c.id))}>✕</button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="td-actions">
                  <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveEdit} disabled={busy}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <div className="td-desc-block">
                  <span className="td-desc-label">Task Description</span>
                  <div className="td-desc-wrapper">
                    <p className="td-desc">{task.description || 'No description provided.'}</p>
                  </div>
                </div>
                <div className="td-meta">
                  <div className="td-meta-item">
                    <span>Assignee</span>
                    <strong>
                      {currentAssignees.length === 0
                        ? 'Unassigned'
                        : currentAssignees.map(a => `${a.name}${a.type === 'group' ? ' (group)' : ''}`).join(', ')}
                    </strong>
                  </div>
                  <div className="td-meta-item">
                    <span>Priority</span>
                    <strong>{task.priority}</strong>
                  </div>
                  <div className="td-meta-item">
                    <span>Due Date</span>
                    <strong className={overdue ? 'td-overdue' : ''}>
                      {task.dueDate ? new Date(task.dueDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                      {overdue ? ' · Overdue' : ''}
                    </strong>
                  </div>
                  <div className="td-meta-item">
                    <span>Created by</span>
                    <strong>{task.createdBy}</strong>
                  </div>
                  <div className="td-meta-item">
                    <span>Created Date</span>
                    <strong>{new Date(task.createdDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</strong>
                  </div>
                  {task.recurrenceSchedule && !task.recurrence && (
                    <div className="td-meta-item">
                      <span>Recurrence</span>
                      <strong>{task.recurrenceSchedule}</strong>
                    </div>
                  )}
                  {task.completedBy && (
                    <div className="td-meta-item">
                      <span>Completed by</span>
                      <strong>{task.completedBy}</strong>
                    </div>
                  )}
                  {task.closedBy && (
                    <div className="td-meta-item">
                      <span>Closed by</span>
                      <strong>{task.closedBy}</strong>
                    </div>
                  )}
                  {task.closeReason && (
                    <div className="td-meta-item td-meta-wide">
                      <span>Close reason</span>
                      <strong>{task.closeReason}</strong>
                    </div>
                  )}
                  {task.reviewNote && (
                    <div className="td-meta-item td-meta-wide">
                      <span>Controller review note</span>
                      <strong>{task.reviewNote}</strong>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Checklist */}
          <div className="glass td-card">
            <div className="td-card-head" style={{ marginBottom: checklistTotal > 0 ? '8px' : '12px' }}>
              <h3>✅ CHECKLIST</h3>
              {checklistTotal > 0 && <span className="td-count">{checklistDone}/{checklistTotal} ({checklistProgress}%)</span>}
            </div>

            {checklistTotal > 0 && (
              <div className="checklist-progress-container">
                <div className="checklist-progress-bar">
                  <div className="checklist-progress-fill" style={{ width: `${checklistProgress}%` }} />
                </div>
              </div>
            )}

            {checklistTotal === 0 ? (
              <p className="td-empty">No checklist items. Assignee may mark complete freely.</p>
            ) : (
              <ul className="td-checklist">
                {task.checklist!.map(item => (
                  <li key={item.id} className={`td-checklist-item ${item.isCompleted ? 'is-completed' : ''}`}>
                    <label className={item.isCompleted ? 'done' : ''}>
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        disabled={busy || task.status !== 'In Progress' || !isAssignee}
                        onChange={() => handleToggleChecklist(item.id)}
                      />
                      <span className="td-checklist-text">{item.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {task.status === 'In Progress' && isAssignee && checklistTotal > 0 && !checklistComplete && (
              <p className="td-hint">Tick all items to enable “Mark Complete”.</p>
            )}
          </div>

          <div className="glass td-card">
            <div className="td-card-head"><h3>💬 COMMENTS</h3></div>
            {(isAssignee || canControl) && task.status !== 'Closed' && (
              <div className="td-comment-box" style={{ display: 'flex', flexDirection: 'column' }}>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                
                {commentAttachments.length > 0 && (
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '8px 0' }}>
                    {commentAttachments.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative', width: 60, height: 60, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                        <img src={img} alt="attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          type="button"
                          onClick={() => setCommentAttachments(prev => prev.filter((_, i) => i !== idx))}
                          style={{
                            position: 'absolute',
                            top: 2,
                            right: 2,
                            background: 'rgba(0,0,0,0.6)',
                            color: '#FFF',
                            border: 'none',
                            borderRadius: '50%',
                            width: 16,
                            height: 16,
                            fontSize: 10,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  id="comment-image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleCommentFileChange}
                  style={{ display: 'none' }}
                />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <label htmlFor="comment-image-upload" className="btn btn-secondary btn-xs" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '3px 8px', fontSize: '11px', fontWeight: 600 }}>
                    📷 Attach Image
                  </label>
                  <button className="btn btn-secondary btn-sm" disabled={busy || (!commentText.trim() && commentAttachments.length === 0)} onClick={handleAddComment}>Post</button>
                </div>
              </div>
            )}
            <ul className="td-feed comments-feed">
              {commentFeed.length === 0 && <li className="td-empty">No comments yet.</li>}
              {commentFeed.map((c, i) => {
                const commentInitials = getInitials(c.operator);
                return (
                  <li key={i} className="comment-item">
                    <div className="comment-avatar">{commentInitials}</div>
                    <div className="comment-bubble">
                      <div className="comment-header">
                        <strong className="comment-author">{c.operator}</strong>
                        <span className="comment-time">
                          {new Date(c.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      <p className="comment-body">{c.body}</p>
                      {c.images && c.images.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                          {c.images.map((img: string, idx: number) => (
                            <img
                              key={idx}
                              src={img}
                              alt="comment attachment"
                              style={{
                                maxWidth: '200px',
                                maxHeight: '150px',
                                borderRadius: 4,
                                border: '1px solid var(--border-color)',
                                cursor: 'pointer',
                              }}
                              onClick={() => window.open(img, '_blank')}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Attachments */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="glass td-card">
              <div className="td-card-head"><h3>📎 ATTACHMENTS</h3></div>
              <ul className="td-attach">
                {task.attachments.map((a, i) => (<li key={i}>📎 {a}</li>))}
              </ul>
            </div>
          )}
        </div>

        {/* RIGHT: actions + activity */}
        <div className="td-col">
          {/* Assignee (display + Controller reassign) */}
          <div className="glass td-card">
            <div className="td-card-head"><h3>👤 ASSIGNEE</h3></div>

            {currentAssignees.length === 0 ? (
              <div className="assignee-profile-card">
                <div className="assignee-avatar-large">?</div>
                <div className="assignee-info">
                  <p className="td-assignee-name">Unassigned</p>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {currentAssignees.map(a => (
                  <div className="assignee-profile-card" key={`${a.type}-${a.id}`} style={{ marginBottom: 0 }}>
                    <div className="assignee-avatar-large">{getInitials(a.name)}</div>
                    <div className="assignee-info">
                      <p className="td-assignee-name">{a.name}</p>
                      <span className="td-assignee-badge">
                        {a.type === 'group' ? 'Distribution Group' : 'Assigned Staff'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canControl && task.status !== 'Closed' && task.status !== 'Pending Closure' && (
              <div className="td-reassign">
                {!reassigning ? (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ width: '100%', marginTop: '12px' }}
                    onClick={() => { setAssignTargets(currentAssignees); setReassigning(true); }}
                  >
                    {currentAssignees.length > 0 ? 'Reassign' : 'Assign'}
                  </button>
                ) : (
                  <>
                    <h4>{currentAssignees.length > 0 ? 'REASSIGN TASK' : 'ASSIGN TASK'}</h4>
                    <div style={{ marginTop: '8px' }}>
                      <TaskAssigneeSelect value={assignTargets} onChange={setAssignTargets} label="" />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', justifyContent: 'flex-end' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => { setReassigning(false); setAssignTargets([]); }}>Cancel</button>
                      <button className="btn btn-primary btn-sm" disabled={busy || assignTargets.length === 0 || sameAssignees} onClick={handleAssign}>Apply</button>
                    </div>
                    {sameAssignees && <p className="td-hint" style={{ marginTop: 8 }}>Already assigned to this same set — choose different assignees.</p>}
                  </>
                )}
              </div>
            )}
            {!isAssignee && !canControl && (
              <p className="td-empty" style={{ marginTop: 10 }}>You have view-only access to this task.</p>
            )}
            {isAssignee && task.status === 'Pending Closure' && (
              <p className="td-empty" style={{ marginTop: 10 }}>You marked this complete. Awaiting Controller review before it closes.</p>
            )}
            {isAssignee && (task.status === 'Pending Further Action' || task.status === 'Closed') && (
              <p className="td-empty" style={{ marginTop: 10 }}>No actions available in this state.</p>
            )}
          </div>

          {/* Recurrence panel (structured — §7.3) */}
          {task.recurrence && (
            <div className="glass td-card">
              <div className="td-card-head">
                <h3>🔁 RECURRENCE TEMPLATE</h3>
                {task.recurrenceCancelled && <span className="td-series-tag cancelled">Cancelled</span>}
              </div>
              <div className="td-series-banner" style={{ marginBottom: 12 }}>
                <span className="td-series-icon">🔁</span>
                <span>Recurrence template — each planned date becomes a <strong>separate task</strong>. This task itself does not repeat.</span>
                {task.detachedFromSeries && <span className="td-series-tag detached">Detached (this only)</span>}
                {task.recurrenceCancelled && <span className="td-series-tag cancelled">Series cancelled</span>}
              </div>
              <p className="td-empty" style={{ marginBottom: 12 }}>
                Defines how future tasks are scheduled. Each planned date is created as its own separate task with its own lifecycle — the status of <em>this</em> task is unaffected.
              </p>
              <div className="td-meta">
                <div className="td-meta-item"><span>Frequency</span><strong>{task.recurrence.frequency}</strong></div>
                {task.recurrence.frequency === 'Weekly' && (
                  <div className="td-meta-item"><span>Repeat on</span><strong>{(task.recurrence.weekdays || []).join(', ') || '—'}</strong></div>
                )}
                {task.recurrence.frequency === 'Monthly' && (
                  <div className="td-meta-item"><span>Day of month</span><strong>{task.recurrence.monthlyDay}</strong></div>
                )}
                <div className="td-meta-item"><span>Start</span><strong>{task.recurrence.startDate}{task.recurrence.dueTime ? ` ${task.recurrence.dueTime}` : ''}</strong></div>
                <div className="td-meta-item"><span>Ends</span><strong>
                  {task.recurrence.endType === 'never' && 'Never'}
                  {task.recurrence.endType === 'onDate' && `On ${task.recurrence.endDate}`}
                  {task.recurrence.endType === 'afterCount' && `After ${task.recurrence.occurrenceCount} occurrences`}
                </strong></div>
                <div className="td-meta-item"><span>Lead time</span><strong>{task.recurrence.leadTimeDays} days</strong></div>
              </div>
            </div>
          )}

          {/* Activity Log — system audit trail */}
          <div className="glass td-card">
            <div className="td-card-head"><h3>📜 ACTIVITY LOG</h3></div>
            <div className="timeline-container">
              {auditFeed.length === 0 ? (
                <p className="td-empty">No activity yet.</p>
              ) : (
                <ul className="timeline-feed">
                  {auditFeed.map((f, i) => (
                    <li key={i} className="timeline-item">
                      <div className="timeline-badge" />
                      <div className="timeline-content">
                        <div className="timeline-header">
                          <strong className="timeline-title">{f.title}</strong>
                          <span className="timeline-time">
                            {new Date(f.ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                        {f.body && <p className="timeline-body">{f.body}</p>}
                        <span className="timeline-operator">By {f.operator}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Close modal */}
      {showClose && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>DROP TASK</h2>
              <button className="close-btn" onClick={() => setShowClose(false)}>Close</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--color-high)' }}>
                Dropping abandons the task and sets it to <strong>Closed</strong>. A reason is mandatory.
              </p>
              <label>Drop Reason *</label>
              <textarea className="form-control" rows={3} value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Reason for dropping this task…" />

              {isRecurring && (
                <div className="td-scope">
                  <label>This task repeats — apply to:</label>
                  <label className="td-scope-opt"><input type="radio" name="close-scope" checked={closeScope === 'thisOnly'} onChange={() => setCloseScope('thisOnly')} /> This occurrence only</label>
                  <label className="td-scope-opt"><input type="radio" name="close-scope" checked={closeScope === 'future'} onChange={() => setCloseScope('future')} /> This and all following (cancel series)</label>
                </div>
              )}

              <div className="td-actions">
                <button className="btn btn-secondary" onClick={() => setShowClose(false)} disabled={busy}>Cancel</button>
                <button className="btn btn-danger" onClick={handleClose} disabled={busy || !closeReason.trim()}>Confirm Drop</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Flag cannot complete modal */}
      {showFlag && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>CANNOT COMPLETE</h2>
              <button className="close-btn" onClick={() => setShowFlag(false)}>Close</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                The task will move to <strong>Pending Further Action</strong> for Controller follow-up.
              </p>
              <label>Reason *</label>
              <textarea className="form-control" rows={3} value={flagReason} onChange={e => setFlagReason(e.target.value)} placeholder="Why can't this task be completed?" />
              <div className="td-actions">
                <button className="btn btn-secondary" onClick={() => setShowFlag(false)} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={handleFlag} disabled={busy || !flagReason.trim()}>Submit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Return-to-assignee (reject completion) modal — Fig 7-1 "Reject" */}
      {showReject && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>RETURN TO ASSIGNEE</h2>
              <button className="close-btn" onClick={() => setShowReject(false)}>Close</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Rejecting the completion sends the task back to <strong>In Progress</strong> so the assignee can address the issue.
              </p>
              <label>Reason *</label>
              <textarea className="form-control" rows={3} value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="What still needs to be done?" />
              <div className="td-actions">
                <button className="btn btn-secondary" onClick={() => setShowReject(false)} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={handleRejectCompletion} disabled={busy || !reviewNote.trim()}>Return to Assignee</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit scope prompt (recurring — W11) */}
      {showEditScope && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2>EDIT RECURRING TASK</h2>
              <button className="close-btn" onClick={() => { setShowEditScope(false); setPendingEdit(null); }}>Close</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>This task repeats. Apply your changes to:</p>
              <button className="td-scope-card" disabled={busy} onClick={() => doSaveEdit('thisOnly')}>
                <strong>This occurrence only</strong>
                <span>Detaches this task from the series. Other occurrences unchanged.</span>
              </button>
              <button className="td-scope-card" disabled={busy} onClick={() => doSaveEdit('future')}>
                <strong>This and all following occurrences</strong>
                <span>Updates the series template. Past occurrences stay as they were.</span>
              </button>
              <div className="td-actions">
                <button className="btn btn-secondary" onClick={() => { setShowEditScope(false); setPendingEdit(null); }} disabled={busy}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .task-detail-page {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .td-topbar {
          display: flex;
          align-items: center;
        }
        .td-back {
          font-size: 13px;
          color: var(--text-muted);
          font-weight: 600;
          display: flex;
          align-items: center;
          text-decoration: none;
          transition: color 0.15s ease, transform 0.15s ease;
        }
        .td-back:hover {
          color: var(--color-primary);
          transform: translateX(-2px);
        }
        .td-header {
          padding: 24px;
          background: var(--bg-card);
        }
        .td-header-main {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        .td-header-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          flex-shrink: 0;
          justify-content: flex-end;
          align-items: center;
        }
        .td-id-row {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .td-title {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-main);
          margin: 6px 0 10px;
          line-height: 1.25;
        }
        .td-links {
          font-size: 12.5px;
          color: var(--text-muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .td-error {
          padding: 12px 18px;
          color: var(--color-critical);
          background: var(--color-critical-bg);
          border: 1px solid var(--color-critical-border);
          border-radius: var(--radius-md);
          font-size: 13px;
        }
        .td-grid {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 20px;
          align-items: start;
        }
        .td-col {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .td-card {
          padding: 24px;
          background: var(--bg-card);
        }
        .td-card-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .td-card-head h3 {
          font-size: 12.5px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: var(--color-active);
          text-transform: uppercase;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .td-count {
          font-size: 11px;
          font-weight: 700;
          color: var(--color-primary-dark);
          background: var(--color-primary-bg);
          border: 1px solid var(--color-primary-border);
          border-radius: 99px;
          padding: 2px 10px;
        }
        
        /* Details & Inset Panel */
        .td-desc-block {
          margin-bottom: 20px;
        }
        .td-desc-label {
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-weight: 600;
          display: block;
          margin-bottom: 6px;
        }
        .td-desc-wrapper {
          padding: 2px 0 12px;
          border-bottom: 1px solid var(--border-color);
          margin-bottom: 16px;
        }
        .td-desc {
          font-size: 13.5px;
          color: var(--text-main);
          line-height: 1.55;
          margin: 0;
        }
        .td-meta {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px 24px;
        }
        .td-meta-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 0 0 10px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .td-meta-wide {
          grid-column: 1 / -1;
        }
        .td-meta span {
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-weight: 600;
        }
        .td-meta strong {
          font-size: 13.5px;
          color: var(--text-main);
          font-weight: 600;
        }
        
        /* Checklist styles */
        .checklist-progress-container {
          background: var(--border-color);
          height: 6px;
          border-radius: 99px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .checklist-progress-bar {
          width: 100%;
          height: 100%;
          background: transparent;
        }
        .checklist-progress-fill {
          height: 100%;
          background: var(--color-primary);
          border-radius: 99px;
          transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .td-checklist {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .td-checklist-item {
          display: flex;
          align-items: center;
          padding: 10px 14px;
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          transition: border-color 0.15s ease, background 0.15s ease;
        }
        .td-checklist-item:hover {
          border-color: var(--border-color-hover);
          background: var(--bg-hover);
        }
        .td-checklist-item.is-completed {
          opacity: 0.75;
          border-color: var(--border-color);
        }
        .td-checklist label {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13.5px;
          color: var(--text-main);
          cursor: pointer;
          width: 100%;
        }
        .td-checklist label.done span.td-checklist-text {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        .td-checklist input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: var(--color-primary);
          cursor: pointer;
        }
        .td-empty, .td-hint {
          font-size: 12.5px;
          color: var(--text-muted);
          margin: 0;
        }
        .td-hint {
          margin-top: 12px;
          color: var(--color-high);
          font-weight: 500;
        }
        
        /* Comments thread */
        .td-comment-box {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }
        .td-comment-box button {
          align-self: flex-end;
        }
        .comments-feed {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .comment-item {
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }
        .comment-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--color-primary-bg);
          border: 1px solid var(--color-primary-border);
          color: var(--color-primary-dark);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .comment-bubble {
          flex: 1;
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: 0 var(--radius-md) var(--radius-md) var(--radius-md);
          padding: 12px 16px;
          position: relative;
        }
        .comment-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 6px;
          gap: 8px;
        }
        .comment-author {
          font-size: 13px;
          color: var(--text-main);
          font-weight: 700;
        }
        .comment-time {
          font-size: 11px;
          color: var(--text-muted);
        }
        .comment-body {
          font-size: 13px;
          color: var(--text-main);
          line-height: 1.45;
          margin: 0;
          word-break: break-word;
        }
        
        /* Assignee Profile */
        .assignee-profile-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          margin-bottom: 16px;
        }
        .assignee-avatar-large {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--color-primary-bg);
          border: 2px solid var(--color-primary-border);
          color: var(--color-primary-dark);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 700;
          box-shadow: 0 2px 6px rgba(109,53,0,0.08);
        }
        .assignee-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .assignee-info .td-assignee-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-main);
          margin: 0;
        }
        .td-assignee-badge {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .td-reassign {
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px dashed var(--border-color);
        }
        .td-reassign h4 {
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .td-reassign-row {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .td-reassign-row select {
          font-size: 12.5px;
          height: 36px;
          padding: 6px 12px;
          border-radius: var(--radius-md);
        }
        
        /* System Activity Timeline */
        .timeline-container {
          position: relative;
          max-height: 380px;
          overflow-y: auto;
          padding-right: 4px;
        }
        .timeline-feed {
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: relative;
          padding-left: 18px;
          margin: 0;
          list-style: none;
        }
        .timeline-feed::before {
          content: '';
          position: absolute;
          left: 4px;
          top: 8px;
          bottom: 8px;
          width: 2px;
          background: var(--border-color);
        }
        .timeline-item {
          position: relative;
        }
        .timeline-badge {
          position: absolute;
          left: -18px;
          top: 6px;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--bg-card);
          border: 2px solid var(--color-primary);
          z-index: 1;
        }
        .timeline-content {
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 10px 14px;
        }
        .timeline-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 4px;
          gap: 8px;
        }
        .timeline-title {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text-main);
        }
        .timeline-time {
          font-size: 10.5px;
          color: var(--text-muted);
        }
        .timeline-body {
          font-size: 12.5px;
          color: var(--text-sub);
          line-height: 1.4;
          margin: 4px 0;
        }
        .timeline-operator {
          font-size: 10.5px;
          color: var(--text-muted);
          font-weight: 600;
          display: block;
          margin-top: 2px;
        }
        
        /* Series and Recurrence templates */
        .td-series-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 18px;
          font-size: 13px;
          color: var(--color-primary-dark);
          background: var(--color-primary-bg);
          border: 1px solid var(--color-primary-border);
          border-radius: var(--radius-md);
          flex-wrap: wrap;
        }
        .td-series-icon {
          font-size: 16px;
        }
        .td-series-tag {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          padding: 2px 8px;
          border-radius: 99px;
          margin-left: auto;
        }
        .td-series-tag.detached {
          background: var(--bg-card);
          color: var(--text-muted);
          border: 1px solid var(--border-color);
        }
        .td-series-tag.cancelled {
          background: var(--color-critical-bg);
          color: var(--color-critical);
          border: 1px solid var(--color-critical-border);
        }
        .td-overdue {
          color: var(--color-critical) !important;
        }
        .td-next {
          margin-top: 16px;
          border-top: 1px dashed var(--border-color);
          padding-top: 14px;
        }
        .td-next-note {
          display: block;
          font-size: 11.5px;
          color: var(--text-muted);
          font-style: italic;
        }
        
        /* Recurrence and scope styles */
        .td-scope {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          background: var(--color-primary-bg);
          border: 1px solid var(--color-primary-border);
          border-radius: var(--radius-md);
        }
        .td-scope > label:first-child {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--color-primary-dark);
        }
        .td-scope-opt {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-main);
          cursor: pointer;
        }
        .td-scope-opt input {
          accent-color: var(--color-primary);
        }
        .td-scope-card {
          display: flex;
          flex-direction: column;
          gap: 3px;
          text-align: left;
          padding: 14px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          background: #fff;
          cursor: pointer;
          transition: border-color 0.15s ease, background 0.15s ease;
          width: 100%;
        }
        .td-scope-card:hover:not(:disabled) {
          border-color: var(--color-primary);
          background: var(--color-primary-bg);
        }
        .td-scope-card strong {
          font-size: 13.5px;
          color: var(--text-main);
        }
        .td-scope-card span {
          font-size: 11.5px;
          color: var(--text-muted);
        }
        
        /* Forms, inputs, selections */
        .td-edit-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .td-edit-form label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-weight: 600;
        }
        .td-edit-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .td-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 12px;
        }
        .td-chk-builder {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }
        .td-chk-builder input {
          flex: 1;
        }
        .td-chk-edit {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 8px;
        }
        .td-chk-edit li {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          color: var(--text-main);
          background: var(--bg-inset);
          padding: 8px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-color);
        }
        .td-chk-edit button {
          background: none;
          border: none;
          color: var(--color-critical);
          cursor: pointer;
          font-size: 13px;
          padding: 0 4px;
        }
        .td-attach {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
          color: var(--text-sub);
        }
        @media (max-width: 900px) {
          .td-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
