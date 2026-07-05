'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Task, TaskChecklistItem } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { useNotifications } from '@/context/NotificationContext';
import {
  taskBadgeClass,
  isControllerPlus,
  getAssignableUsers,
  getAssignableGroups,
} from '@/lib/taskHelpers';
import { getUsers } from '@/lib/users';

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
  const [assignTarget, setAssignTarget] = useState('');
  const [assignType, setAssignType] = useState<'user' | 'group'>('user');

  // Comment
  const [commentText, setCommentText] = useState('');

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [eTitle, setETitle] = useState('');
  const [eDesc, setEDesc] = useState('');
  const [ePriority, setEPriority] = useState('Normal');
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

  const canControl = isControllerPlus(role);
  const isAssignee =
    !!task &&
    (username === task.assignee ||
      (task.assigneeType === 'group' && role === 'Responder (Ranger)'));
  const isRanger = role === 'Responder (Ranger)';

  // A ranger who is not the assignee has no access (per spec decision).
  const noAccess = !!task && isRanger && !isAssignee;

  function notifyAssignee(targetName: string, targetType: 'user' | 'group', verb: string) {
    if (targetType === 'group') {
      addNotification({
        title: `Task ${verb}`,
        message: `Task "${task?.title}" ${verb.toLowerCase()} to group ${targetName}.`,
        role: 'Responder (Ranger)',
        type: 'task',
        link: `/tasks/${taskId}`,
      });
    } else {
      const u = getUsers().find(x => x.name === targetName);
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
    if (!assignTarget) return;
    const verb = task?.assignee && task.assignee !== 'Unassigned' ? 'Reassigned' : 'Assigned';
    const ok = await performAction(task?.assignee && task.assignee !== 'Unassigned' ? 'reassign' : 'assign', {
      assignee: assignTarget,
      assigneeType: assignType,
    });
    if (ok) {
      notifyAssignee(assignTarget, assignType, verb);
      setAssignTarget('');
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
    if (!commentText.trim()) return;
    const ok = await performAction('add-comment', { text: commentText });
    if (ok) setCommentText('');
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
      if (task?.assignee && task.assignee !== 'Unassigned') {
        notifyAssignee(task.assignee, task.assigneeType === 'group' ? 'group' : 'user', 'Returned');
      }
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
  const sameAssignee = assignType === 'user' && !!assignTarget && assignTarget === task.assignee;

  // Activity Log = system audit trail only (reverse-chronological)
  const auditFeed = (task.audits || [])
    .map(a => ({ ts: a.timestamp, operator: a.operator, title: a.action, body: a.details }))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  // Comments = user discussion, separate from the audit trail
  const commentFeed = (task.comments || [])
    .map(c => ({ ts: c.timestamp, operator: c.user, body: c.text }))
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const assignableUsers = getAssignableUsers();
  const assignableGroups = getAssignableGroups();

  return (
    <div className="task-detail-page">
      <div className="td-topbar">
        <Link href="/case-management?tab=tasks" className="td-back">← Task Board</Link>
      </div>

      {/* Header */}
      <div className="glass td-header">
        <div className="td-header-main">
          <div>
            <div className="td-id-row">
              <span className="td-id">{task.id}</span>
              <span className={`badge ${taskBadgeClass(task.status)}`}>{task.status}</span>
              <span className={`badge ${task.priority === 'High' ? 'badge-live' : 'badge-info'}`}>{task.priority} Priority</span>
            </div>
            <h1 className="td-title">{task.title}</h1>
            <div className="td-links">
              <span>Case: <Link href={`/cases/${task.caseId}`} className="link">{task.caseId}</Link></span>
              {task.linkedIncidentId && (
                <span> · Incident: <Link href={`/incidents/${task.linkedIncidentId}`} className="link">{task.linkedIncidentId}</Link></span>
              )}
            </div>
          </div>

          {/* Contextual action bar (role × status) */}
          {!editing && (
            <div className="td-header-actions">
              {canControl && task.status !== 'Closed' && (
                <button className="btn btn-secondary" onClick={startEditing} disabled={busy}>Edit</button>
              )}
              {isAssignee && (task.status === 'Assigned' || task.status === 'Returned') && (
                <button className="btn btn-primary" disabled={busy} onClick={() => performAction('acknowledge')}>Acknowledge</button>
              )}
              {isAssignee && task.status === 'Acknowledged' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => performAction('begin')}>Begin Task</button>
              )}
              {isAssignee && task.status === 'In Progress' && (
                <>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => setShowFlag(true)}>Cannot Complete</button>
                  <button className="btn btn-success" disabled={busy || !checklistComplete} title={!checklistComplete ? 'Complete all checklist items first' : ''} onClick={() => performAction('mark-complete')}>Mark Complete</button>
                </>
              )}
              {/* Controller reviews the completion (Fig 7-1) */}
              {canControl && task.status === 'Pending Closure' && (
                <>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => setShowReject(true)}>Return to Assignee</button>
                  <button className="btn btn-success" disabled={busy} onClick={handleAcceptCompletion}>Accept &amp; Close</button>
                </>
              )}
              {isAssignee && !canControl && task.status === 'Pending Closure' && (
                <span className="td-await">Awaiting Controller review…</span>
              )}
              {/* Drop is only offered from Pending Further Action (Fig 7-1 "Continue or drop?") */}
              {canControl && task.status === 'Pending Further Action' && (
                <button className="btn btn-danger" disabled={busy} onClick={() => setShowClose(true)}>Drop Task</button>
              )}
              {canControl && task.status === 'Closed' && (
                <button className="btn btn-secondary" disabled={busy} onClick={() => performAction('reopen')}>Reopen Task</button>
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
              <h3>DETAILS</h3>
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
                      <option value="Normal">Normal</option>
                      <option value="High">High</option>
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
                  <p className="td-desc">{task.description || 'No description provided.'}</p>
                </div>
                <div className="td-meta">
                  <div><span>Assignee</span><strong>{task.assignee}{task.assigneeType === 'group' ? ' (group)' : ''}</strong></div>
                  <div><span>Priority</span><strong>{task.priority}</strong></div>
                  <div><span>Due</span><strong className={overdue ? 'td-overdue' : ''}>{task.dueDate ? new Date(task.dueDate).toLocaleString() : '—'}{overdue ? ' · Overdue' : ''}</strong></div>
                  <div><span>Created by</span><strong>{task.createdBy}</strong></div>
                  <div><span>Created</span><strong>{new Date(task.createdDate).toLocaleString()}</strong></div>
                  {task.recurrenceSchedule && !task.recurrence && <div><span>Recurrence</span><strong>{task.recurrenceSchedule}</strong></div>}
                  {task.completedBy && <div><span>Completed by</span><strong>{task.completedBy}</strong></div>}
                  {task.closedBy && <div><span>Closed by</span><strong>{task.closedBy}</strong></div>}
                  {task.closeReason && <div className="td-meta-wide"><span>Close reason</span><strong>{task.closeReason}</strong></div>}
                  {task.reviewNote && <div className="td-meta-wide"><span>Controller review note</span><strong>{task.reviewNote}</strong></div>}
                </div>
              </>
            )}
          </div>

          {/* Checklist */}
          <div className="glass td-card">
            <div className="td-card-head">
              <h3>CHECKLIST</h3>
              {checklistTotal > 0 && <span className="td-count">{checklistDone}/{checklistTotal}</span>}
            </div>
            {checklistTotal === 0 ? (
              <p className="td-empty">No checklist items. Assignee may mark complete freely.</p>
            ) : (
              <ul className="td-checklist">
                {task.checklist!.map(item => (
                  <li key={item.id}>
                    <label className={item.isCompleted ? 'done' : ''}>
                      <input
                        type="checkbox"
                        checked={item.isCompleted}
                        disabled={busy || task.status !== 'In Progress' || !isAssignee}
                        onChange={() => handleToggleChecklist(item.id)}
                      />
                      <span>{item.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {task.status === 'In Progress' && isAssignee && checklistTotal > 0 && !checklistComplete && (
              <p className="td-hint">Tick all items to enable “Mark Complete”.</p>
            )}
          </div>

          {/* Comments — user discussion (separate from audit trail) */}
          <div className="glass td-card">
            <div className="td-card-head"><h3>COMMENTS</h3></div>
            {(isAssignee || canControl) && task.status !== 'Closed' && (
              <div className="td-comment-box">
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Add a comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <button className="btn btn-secondary btn-sm" disabled={busy || !commentText.trim()} onClick={handleAddComment}>Post</button>
              </div>
            )}
            <ul className="td-feed">
              {commentFeed.length === 0 && <li className="td-empty">No comments yet.</li>}
              {commentFeed.map((c, i) => (
                <li key={i} className="td-feed-item comment">
                  <div className="td-feed-dot" />
                  <div className="td-feed-content">
                    <div className="td-feed-head">
                      <strong>{c.operator}</strong>
                      <span>{new Date(c.ts).toLocaleString()}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Attachments */}
          {task.attachments && task.attachments.length > 0 && (
            <div className="glass td-card">
              <div className="td-card-head"><h3>ATTACHMENTS</h3></div>
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
            <div className="td-card-head"><h3>ASSIGNEE</h3></div>
            <p className="td-assignee-name">{task.assignee}{task.assigneeType === 'group' ? ' (group)' : ''}</p>
            {canControl && task.status !== 'Closed' && task.status !== 'Pending Closure' && (
              <div className="td-reassign">
                <h4>{task.assignee && task.assignee !== 'Unassigned' ? 'REASSIGN' : 'ASSIGN'}</h4>
                <div className="td-reassign-row">
                  <select className="form-control select-dark" value={assignType} onChange={e => { setAssignType(e.target.value as any); setAssignTarget(''); }}>
                    <option value="user">User</option>
                    <option value="group">Group</option>
                  </select>
                  <select className="form-control select-dark" value={assignTarget} onChange={e => setAssignTarget(e.target.value)}>
                    <option value="">-- Select {assignType} --</option>
                    {assignType === 'user'
                      ? assignableUsers.map(u => <option key={u.id} value={u.name}>{u.name} ({u.role})</option>)
                      : assignableGroups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" disabled={busy || !assignTarget || sameAssignee} onClick={handleAssign}>Go</button>
                </div>
                {sameAssignee && <p className="td-hint" style={{ marginTop: 8 }}>Already assigned to {task.assignee} — choose a different assignee.</p>}
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
                <h3>RECURRENCE TEMPLATE</h3>
                {task.recurrenceCancelled && <span className="td-series-tag cancelled">Cancelled</span>}
              </div>
              <div className="td-series-banner" style={{ marginBottom: 12 }}>
                <span className="td-series-icon">🔁</span>
                <span>Recurrence template — each planned date becomes a <strong>separate task</strong>. This task itself does not repeat.</span>
                {task.detachedFromSeries && <span className="td-series-tag detached">Detached (this only)</span>}
                {task.recurrenceCancelled && <span className="td-series-tag cancelled">Series cancelled</span>}
              </div>
              <p className="td-empty" style={{ marginBottom: 12 }}>
                Defines how future tasks are scheduled. Each planned date will be created as its own separate task with its own lifecycle — the status of <em>this</em> task is unaffected.
              </p>
              <div className="td-meta">
                <div><span>Frequency</span><strong>{task.recurrence.frequency}</strong></div>
                {task.recurrence.frequency === 'Weekly' && (
                  <div><span>Repeat on</span><strong>{(task.recurrence.weekdays || []).join(', ') || '—'}</strong></div>
                )}
                {task.recurrence.frequency === 'Monthly' && (
                  <div><span>Day of month</span><strong>{task.recurrence.monthlyDay}</strong></div>
                )}
                <div><span>Start</span><strong>{task.recurrence.startDate}{task.recurrence.dueTime ? ` ${task.recurrence.dueTime}` : ''}</strong></div>
                <div><span>Ends</span><strong>
                  {task.recurrence.endType === 'never' && 'Never'}
                  {task.recurrence.endType === 'onDate' && `On ${task.recurrence.endDate}`}
                  {task.recurrence.endType === 'afterCount' && `After ${task.recurrence.occurrenceCount} occurrences`}
                </strong></div>
                <div><span>Lead time</span><strong>{task.recurrence.leadTimeDays} days</strong></div>
              </div>
              {!task.recurrenceCancelled && (
                <div className="td-next">
                  <span className="td-next-note">Occurrence generation is a later phase — no separate task records are created from this template yet.</span>
                </div>
              )}
            </div>
          )}

          {/* Activity Log — system audit trail */}
          <div className="glass td-card">
            <div className="td-card-head"><h3>ACTIVITY LOG</h3></div>
            <ul className="td-feed">
              {auditFeed.length === 0 && <li className="td-empty">No activity yet.</li>}
              {auditFeed.map((f, i) => (
                <li key={i} className="td-feed-item audit">
                  <div className="td-feed-dot" />
                  <div className="td-feed-content">
                    <div className="td-feed-head">
                      <strong>{f.title}</strong>
                      <span>{new Date(f.ts).toLocaleString()}</span>
                    </div>
                    <p>{f.body}</p>
                    <span className="td-feed-op">— {f.operator}</span>
                  </div>
                </li>
              ))}
            </ul>
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
        .task-detail-page { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
        .td-topbar { display: flex; }
        .td-back { font-size: 12px; color: var(--text-muted); font-weight: 600; }
        .td-back:hover { color: var(--color-primary); }
        .td-header { padding: 18px 20px; }
        .td-header-main { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .td-header-actions { display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; justify-content: flex-end; align-items: center; }
        .td-await { font-size: 12px; font-weight: 600; color: #4338CA; background: #EEF2FF; border: 1px solid #C7D2FE; padding: 6px 12px; border-radius: 8px; }
        .td-assignee-name { font-size: 14px; font-weight: 600; color: var(--text-main); margin-bottom: 4px; }
        .td-id-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
        .td-id { font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--text-main); }
        .td-title { font-size: 20px; font-weight: 700; color: var(--text-main); margin: 4px 0; }
        .td-links { font-size: 12px; color: var(--text-muted); }
        .td-error { padding: 10px 16px; color: var(--color-critical); font-size: 13px; }
        .td-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 14px; align-items: start; }
        .td-col { display: flex; flex-direction: column; gap: 14px; }
        .td-card { padding: 16px 18px; }
        .td-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .td-card-head h3 { font-size: 11.5px; font-weight: 700; letter-spacing: 0.05em; color: var(--text-muted); text-transform: uppercase; }
        .td-count { font-size: 11px; font-weight: 700; color: var(--text-muted); background: var(--bg-inset); border: 1px solid var(--border-color); border-radius: 99px; padding: 2px 8px; }
        .td-desc-block { margin-bottom: 14px; }
        .td-desc-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); display: block; margin-bottom: 4px; }
        .td-desc { font-size: 13px; color: var(--text-sub); line-height: 1.5; margin-bottom: 0; }
        .td-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 18px; }
        .td-meta > div { display: flex; flex-direction: column; gap: 2px; }
        .td-meta-wide { grid-column: 1 / -1; }
        .td-meta span { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
        .td-meta strong { font-size: 13px; color: var(--text-main); font-weight: 600; }
        .td-checklist { display: flex; flex-direction: column; gap: 8px; }
        .td-checklist label { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--text-sub); cursor: pointer; }
        .td-checklist label.done span { text-decoration: line-through; color: var(--text-faint); }
        .td-checklist input { width: 16px; height: 16px; accent-color: var(--color-active); }
        .td-empty, .td-hint { font-size: 12px; color: var(--text-faint); }
        .td-hint { margin-top: 10px; color: var(--color-high); }
        .td-attach { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-sub); }
        .td-actions-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
        .td-reassign { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--border-color); }
        .td-reassign h4 { font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px; }
        .td-reassign-row { display: flex; gap: 8px; align-items: center; }
        .td-reassign-row select { font-size: 12px; height: 34px; padding: 4px 8px; }
        .td-edit-form { display: flex; flex-direction: column; gap: 8px; }
        .td-edit-form label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); }
        .td-edit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .td-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
        .btn-sm { padding: 5px 12px; font-size: 12px; height: auto; }
        .td-comment-box { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
        .td-comment-box button { align-self: flex-end; }
        .td-feed { display: flex; flex-direction: column; gap: 2px; }
        .td-feed-item { display: flex; gap: 10px; padding: 8px 0; border-left: none; }
        .td-feed-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; background: var(--border-color); }
        .td-feed-item.comment .td-feed-dot { background: var(--color-info); }
        .td-feed-content { flex: 1; }
        .td-feed-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .td-feed-head strong { font-size: 12.5px; color: var(--text-main); }
        .td-feed-head span { font-size: 10.5px; color: var(--text-faint); }
        .td-feed-content p { font-size: 12px; color: var(--text-sub); line-height: 1.4; margin: 2px 0; }
        .td-feed-op { font-size: 10.5px; color: var(--text-faint); }
        .td-series-banner { display: flex; align-items: center; gap: 10px; padding: 10px 16px; font-size: 12.5px; color: var(--color-primary-dark); background: var(--color-primary-bg); border: 1px solid var(--color-primary-border); border-radius: var(--radius-md); flex-wrap: wrap; }
        .td-series-icon { font-size: 15px; }
        .td-series-tag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 99px; margin-left: 4px; }
        .td-series-tag.detached { background: var(--bg-inset); color: var(--text-muted); border: 1px solid var(--border-color); }
        .td-series-tag.cancelled { background: var(--color-critical-bg); color: var(--color-critical); border: 1px solid var(--color-critical-border); }
        .td-overdue { color: var(--color-critical) !important; }
        .td-next { margin-top: 14px; border-top: 1px dashed var(--border-color); padding-top: 12px; }
        .td-next-label { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-faint); display: block; margin-bottom: 8px; }
        .td-next-pill { display: inline-block; background: var(--bg-inset); border: 1px solid var(--border-color); border-radius: 99px; padding: 3px 10px; font-size: 11.5px; color: var(--text-sub); margin: 0 5px 5px 0; font-variant-numeric: tabular-nums; }
        .td-next-note { display: block; margin-top: 6px; font-size: 11px; color: var(--text-faint); font-style: italic; }
        .td-chk-builder { display: flex; gap: 8px; margin-bottom: 8px; }
        .td-chk-builder input { flex: 1; }
        .td-chk-edit { display: flex; flex-direction: column; gap: 5px; margin-bottom: 4px; }
        .td-chk-edit li { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-sub); background: var(--bg-inset); padding: 5px 10px; border-radius: var(--radius-sm); }
        .td-chk-edit button { background: none; border: none; color: var(--color-critical); cursor: pointer; font-size: 12px; }
        .td-scope { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--color-primary-bg); border: 1px solid var(--color-primary-border); border-radius: var(--radius-md); }
        .td-scope > label:first-child { font-size: 11.5px; font-weight: 700; color: var(--color-primary-dark); }
        .td-scope-opt { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-main); cursor: pointer; }
        .td-scope-opt input { accent-color: var(--color-primary); }
        .td-scope-card { display: flex; flex-direction: column; gap: 3px; text-align: left; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: var(--radius-md); background: #fff; cursor: pointer; transition: 0.15s; }
        .td-scope-card:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-bg); }
        .td-scope-card strong { font-size: 13.5px; color: var(--text-main); }
        .td-scope-card span { font-size: 11.5px; color: var(--text-muted); }
        @media (max-width: 900px) { .td-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
