'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Task } from '@/lib/db';
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
  const rawId = params?.id;
  const taskId = decodeURIComponent(Array.isArray(rawId) ? rawId[0] : (rawId || ''));

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

  // Close modal
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState('');

  // Flag-cannot-complete
  const [showFlag, setShowFlag] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`);
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
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
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
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    const ok = await performAction('edit-fields', {
      title: eTitle, description: eDesc, priority: ePriority, dueDate: eDue,
    });
    if (ok) setEditing(false);
  };

  const handleClose = async () => {
    const ok = await performAction('close', { closeReason });
    if (ok) { setShowClose(false); setCloseReason(''); }
  };

  const handleFlag = async () => {
    const ok = await performAction('flag-cannot-complete', { reason: flagReason });
    if (ok) { setShowFlag(false); setFlagReason(''); }
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
        <Link href="/tasks" className="btn btn-secondary" style={{ marginTop: 16, display: 'inline-block' }}>← Back to Task Board</Link>
      </div>
    );
  }

  const checklistDone = (task.checklist || []).filter(i => i.isCompleted).length;
  const checklistTotal = (task.checklist || []).length;
  const checklistComplete = checklistTotal === 0 || checklistDone === checklistTotal;

  // Build a unified, reverse-chronological activity feed from audits + comments
  const feed = [
    ...(task.audits || []).map(a => ({ kind: 'audit' as const, ts: a.timestamp, operator: a.operator, title: a.action, body: a.details })),
    ...(task.comments || []).map(c => ({ kind: 'comment' as const, ts: c.timestamp, operator: c.user, title: 'Comment', body: c.text })),
  ].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  const assignableUsers = getAssignableUsers();
  const assignableGroups = getAssignableGroups();

  return (
    <div className="task-detail-page">
      <div className="td-topbar">
        <Link href="/tasks" className="td-back">← Task Board</Link>
      </div>

      {/* Header */}
      <div className="glass td-header">
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
      </div>

      {error && <div className="td-error glass">{error}</div>}

      <div className="td-grid">
        {/* LEFT: details */}
        <div className="td-col">
          <div className="glass td-card">
            <div className="td-card-head">
              <h3>DETAILS</h3>
              {canControl && task.status !== 'Closed' && !editing && (
                <button className="btn btn-secondary btn-sm" onClick={startEditing}>Edit</button>
              )}
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
                <div className="td-actions">
                  <button className="btn btn-secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSaveEdit} disabled={busy}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <p className="td-desc">{task.description || 'No description provided.'}</p>
                <div className="td-meta">
                  <div><span>Assignee</span><strong>{task.assignee}{task.assigneeType === 'group' ? ' (group)' : ''}</strong></div>
                  <div><span>Priority</span><strong>{task.priority}</strong></div>
                  <div><span>Due</span><strong>{task.dueDate ? new Date(task.dueDate).toLocaleString() : '—'}</strong></div>
                  <div><span>Created by</span><strong>{task.createdBy}</strong></div>
                  <div><span>Created</span><strong>{new Date(task.createdDate).toLocaleString()}</strong></div>
                  {task.recurrenceSchedule && <div><span>Recurrence</span><strong>{task.recurrenceSchedule}</strong></div>}
                  {task.closedBy && <div><span>Closed by</span><strong>{task.closedBy}</strong></div>}
                  {task.closeReason && <div className="td-meta-wide"><span>Close reason</span><strong>{task.closeReason}</strong></div>}
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
          {/* Action panel */}
          <div className="glass td-card">
            <div className="td-card-head"><h3>ACTIONS</h3></div>
            <div className="td-actions-wrap">
              {/* Assignee actions */}
              {isAssignee && task.status === 'Assigned' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => performAction('acknowledge')}>Acknowledge</button>
              )}
              {isAssignee && task.status === 'Acknowledged' && (
                <button className="btn btn-primary" disabled={busy} onClick={() => performAction('begin')}>Begin Task</button>
              )}
              {isAssignee && task.status === 'In Progress' && (
                <>
                  <button
                    className="btn btn-success"
                    disabled={busy || !checklistComplete}
                    title={!checklistComplete ? 'Complete all checklist items first' : ''}
                    onClick={() => performAction('mark-complete')}
                  >Mark Complete</button>
                  <button className="btn btn-secondary" disabled={busy} onClick={() => setShowFlag(true)}>Flag: Cannot Complete</button>
                </>
              )}

              {/* Controller+ actions */}
              {canControl && task.status !== 'Closed' && (
                <button className="btn btn-danger" disabled={busy} onClick={() => setShowClose(true)}>Close Task</button>
              )}
              {canControl && task.status === 'Closed' && (
                <button className="btn btn-secondary" disabled={busy} onClick={() => performAction('reopen')}>Reopen Task</button>
              )}

              {/* No-op hint */}
              {!isAssignee && !canControl && (
                <p className="td-empty">You have view-only access to this task.</p>
              )}
              {isAssignee && (task.status === 'Pending Further Action' || task.status === 'Closed') && (
                <p className="td-empty">No assignee actions available in this state.</p>
              )}
            </div>

            {/* Reassign (Controller+) */}
            {canControl && task.status !== 'Closed' && (
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
                  <button className="btn btn-primary btn-sm" disabled={busy || !assignTarget} onClick={handleAssign}>Go</button>
                </div>
              </div>
            )}
          </div>

          {/* Activity / comments */}
          <div className="glass td-card">
            <div className="td-card-head"><h3>ACTIVITY LOG</h3></div>
            {(isAssignee || canControl) && task.status !== 'Closed' && (
              <div className="td-comment-box">
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Log an activity or add a comment…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                />
                <button className="btn btn-secondary btn-sm" disabled={busy || !commentText.trim()} onClick={handleAddComment}>Post</button>
              </div>
            )}
            <ul className="td-feed">
              {feed.length === 0 && <li className="td-empty">No activity yet.</li>}
              {feed.map((f, i) => (
                <li key={i} className={`td-feed-item ${f.kind}`}>
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
              <h2>CLOSE TASK</h2>
              <button className="close-btn" onClick={() => setShowClose(false)}>Close</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!task.completed && (
                <p style={{ fontSize: 12, color: 'var(--color-high)' }}>
                  This task has not been completed by the assignee — a Close Reason is mandatory.
                </p>
              )}
              <label>Close Reason {task.completed ? '(optional)' : '*'}</label>
              <textarea className="form-control" rows={3} value={closeReason} onChange={e => setCloseReason(e.target.value)} placeholder="Reason for closing…" />
              <div className="td-actions">
                <button className="btn btn-secondary" onClick={() => setShowClose(false)} disabled={busy}>Cancel</button>
                <button className="btn btn-danger" onClick={handleClose} disabled={busy || (!task.completed && !closeReason.trim())}>Confirm Close</button>
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
              <label>Reason</label>
              <textarea className="form-control" rows={3} value={flagReason} onChange={e => setFlagReason(e.target.value)} placeholder="Why can't this task be completed?" />
              <div className="td-actions">
                <button className="btn btn-secondary" onClick={() => setShowFlag(false)} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={handleFlag} disabled={busy}>Submit</button>
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
        .td-desc { font-size: 13px; color: var(--text-sub); line-height: 1.5; margin-bottom: 14px; }
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
        @media (max-width: 900px) { .td-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
