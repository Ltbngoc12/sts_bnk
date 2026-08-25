'use client';

import React, { useState, useEffect } from 'react';
import { Task, Case, RecurrenceConfig, TaskAssignee } from '@/lib/db';
import { RecurrenceScheduleField, recurrenceSummary } from '@/components/RecurrenceScheduleField';
import { useNotifications } from '@/context/NotificationContext';
import { getUsers } from '@/lib/users';
import { getTaskPriorityTaxonomy } from '@/lib/taxonomy';
import { ChecklistTemplate, getActiveChecklistTemplates } from '@/lib/checklistTemplates';
import TaskAssigneeSelect from '@/components/TaskAssigneeSelect';

interface ChecklistDraft { id: string; text: string; }

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (task?: Task) => void;
  username: string;
  /** Fixed parent Case (e.g. from an e-Diary entry) — hides the case picker and always uses this id. */
  caseId?: string;
  /** Set when creating a Task from an e-Diary entry — reference is retained on the Task record. */
  sourceEDiaryId?: string;
  prefillTitle?: string;
  prefillDescription?: string;
}

// FRD 7.1/7.2 — Operational Task creation. Extracted from TaskBoardTab so it can also
// be launched from e-Diary's combined Actions menu (EDIARY_MODULE_UPDATE_PLAN.md §8).
export default function TaskCreateModal({
  isOpen,
  onClose,
  onSuccess,
  username,
  caseId,
  sourceEDiaryId,
  prefillTitle,
  prefillDescription,
}: Props) {
  const isLinked = !!caseId;
  const { addNotification } = useNotifications();

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCaseId, setTaskCaseId] = useState('new-case');
  const [taskAssignees, setTaskAssignees] = useState<TaskAssignee[]>([]);
  const [taskPriority, setTaskPriority] = useState('Normal');
  const [priorityOptions, setPriorityOptions] = useState<string[]>(['Normal', 'High']);
  const [taskDueDate, setTaskDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<RecurrenceConfig | null>(null);
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [createError, setCreateError] = useState('');
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Searchable case dropdown (standalone mode only)
  const [cases, setCases] = useState<Case[]>([]);
  const [caseSearchText, setCaseSearchText] = useState('');
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const [selectedCase, setSelectedCase] = useState<{ id: string; title: string }>({ id: 'NEW CASE', title: 'Auto-create new case' });

  useEffect(() => { setPriorityOptions(getTaskPriorityTaxonomy()); }, []);
  useEffect(() => { setTemplates(getActiveChecklistTemplates()); }, []);

  useEffect(() => {
    if (!isOpen || isLinked) return;
    fetch('/api/cases')
      .then(res => (res.ok ? res.json() : []))
      .then((data: Case[]) => setCases(data))
      .catch(() => {});
  }, [isOpen, isLinked]);

  function resetForm() {
    setTaskTitle(''); setTaskDesc(''); setTaskDueDate('');
    setRecurrence(null); setChecklist([]); setChecklistInput('');
    setAttachments([]); setTaskAssignees([]);
    setTaskPriority('Normal'); setCreateError(''); setSelectedTemplateId('');
    setTaskCaseId(isLinked ? (caseId as string) : 'new-case');
    setSelectedCase(isLinked ? { id: caseId as string, title: caseId as string } : { id: 'NEW CASE', title: 'Auto-create new case' });
    setCaseSearchText('');
    setShowCaseDropdown(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    if (prefillTitle) setTaskTitle(prefillTitle);
    if (prefillDescription) setTaskDesc(prefillDescription);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ─── Create form helpers ──────────────────────────────────────────
  const addChecklistItem = () => {
    if (!checklistInput.trim()) return;
    setChecklist([...checklist, { id: `chk-${Date.now()}`, text: checklistInput.trim() }]);
    setChecklistInput('');
  };

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).map(f => f.name);
    setAttachments(prev => [...prev, ...files]);
  };

  // FRD 13.2 — applying a template prefills Description/Priority/Checklist only.
  // Title, Due Date and Assignee stay manual, and every prefilled field remains
  // editable afterwards (this just sets initial state, nothing is locked).
  const applyTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    setTaskDesc(tpl.description || '');
    setTaskPriority(tpl.priority || 'Normal');
    setChecklist(tpl.checklist.map((c, i) => ({ id: `chk-${Date.now()}-${i}`, text: c.text })));
  };

  const notifyNewAssignees = (assignees: TaskAssignee[], title: string) => {
    const notifiedUsers = new Set<string>();
    assignees.forEach(a => {
      if (a.type === 'group') {
        addNotification({ title: 'Task Assigned', message: `New task "${title}" assigned to group ${a.name}.`, role: 'Responder (Ranger)', type: 'task', link: '/tasks' });
      } else {
        if (notifiedUsers.has(a.name)) return; // avoid duplicate pings if picked twice somehow
        notifiedUsers.add(a.name);
        const u = getUsers().find(x => x.name === a.name);
        const targetRole = u?.role === 'Responder' ? 'Responder (Ranger)' : ((u?.role as any) || 'Responder (Ranger)');
        addNotification({ title: 'Task Assigned', message: `New task "${title}" assigned to you.`, role: targetRole, type: 'task', link: '/tasks' });
      }
    });
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    const effectiveCaseId = isLinked ? (caseId as string) : taskCaseId;
    if (!taskTitle.trim() || !effectiveCaseId || submitting) return;

    let targetCaseId = effectiveCaseId;
    setSubmitting(true);

    try {
      if (!isLinked && taskCaseId === 'new-case') {
        const caseRes = await fetch('/api/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: `Case for Task: ${taskTitle}`,
            status: 'Active',
            username,
          }),
        });
        if (!caseRes.ok) {
          const errData = await caseRes.json();
          setCreateError(errData.error || 'Failed to create new case.');
          setSubmitting(false);
          return;
        }
        const newCaseObj = await caseRes.json();
        targetCaseId = newCaseObj.id;
      }

      const payload = {
        caseId: targetCaseId,
        title: taskTitle,
        description: taskDesc,
        assignees: taskAssignees,
        priority: taskPriority,
        dueDate: taskDueDate,
        recurrence: recurrence || undefined,
        recurrenceSchedule: recurrence ? recurrenceSummary(recurrence) : '',
        checklist,
        attachments,
        username,
        ...(sourceEDiaryId && { sourceEDiaryId }),
      };

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const newTask = await res.json();
        if (taskAssignees.length > 0) notifyNewAssignees(taskAssignees, taskTitle);
        resetForm();
        onSuccess(newTask);
        onClose();
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create task.');
      }
    } catch (err) {
      setCreateError('Network error.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const activeCases = cases.filter(c => c.status !== 'Closed');
  const filteredCases = activeCases.filter(c => {
    if (!caseSearchText.trim()) return true;
    const query = caseSearchText.toLowerCase();
    return c.id.toLowerCase().includes(query) || c.title.toLowerCase().includes(query);
  });

  return (
    <div className="modal-backdrop">
      <div className="create-case-modal glass">
        <div className="modal-header">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h2>CREATE NEW OPERATIONAL TASK</h2>
            {sourceEDiaryId && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: 0 }}>
                Created from e-Diary entry <strong>{sourceEDiaryId}</strong> — reference will be retained.
              </p>
            )}
          </div>
          <button className="close-btn" onClick={onClose}>Close</button>
        </div>

        <form onSubmit={handleCreateTask} className="modal-form">
          <div className="modal-scroll-area">
            {createError && <div className="td-create-error">{createError}</div>}

            {isLinked ? (
              <div className="form-group">
                <label>Case</label>
                <span className="mono-id" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>
                  {caseId}
                </span>
              </div>
            ) : (
              <div className="form-group" style={{ position: 'relative' }}>
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
                    fontSize: '13px'
                  }}
                >
                  <span>
                    {selectedCase
                      ? `${selectedCase.id} - ${selectedCase.title}`
                      : '-- Choose Case --'}
                  </span>
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
                      overflow: 'hidden'
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
                        style={{
                          fontSize: '12px',
                          height: '30px',
                          padding: '4px 8px',
                          width: '100%',
                          boxSizing: 'border-box'
                        }}
                        autoFocus
                      />
                    </div>

                    {/* Options list */}
                    <div style={{ overflowY: 'auto', flex: 1, maxHeight: '200px' }}>
                      {/* Option: Create New Case */}
                      <div
                        onClick={() => {
                          setTaskCaseId('new-case');
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
                          fontWeight: '600',
                          borderBottom: '1px solid var(--border-color)',
                          background: taskCaseId === 'new-case' ? 'var(--bg-hover)' : 'transparent'
                        }}
                      >
                        ➕ Create New Case
                      </div>

                      {/* Filtered Active Cases */}
                      {filteredCases.map(c => {
                        const isSelected = taskCaseId === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setTaskCaseId(c.id);
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
                              background: isSelected ? 'var(--bg-hover)' : 'transparent'
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
            )}

            {templates.length > 0 && (
              <div className="form-group">
                <label>Use Template (optional)</label>
                <select
                  value={selectedTemplateId}
                  onChange={e => applyTemplate(e.target.value)}
                  className="form-control select-dark"
                >
                  <option value="">-- No template --</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Prefills Description, Priority and Checklist below — still editable before you dispatch.
                </p>
              </div>
            )}

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

            <TaskAssigneeSelect value={taskAssignees} onChange={setTaskAssignees} />

            <div className="form-grid">
              <div className="form-group">
                <label>Priority</label>
                <select value={taskPriority} onChange={e => setTaskPriority(e.target.value)} className="form-control select-dark">
                  {priorityOptions.map(p => (
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
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Dispatching…' : 'DISPATCH TASK'}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        .checklist-builder { display: flex; gap: 8px; }
        .checklist-builder input { flex: 1; }
        .btn-sm { padding: 6px 12px; font-size: 12px; height: auto; white-space: nowrap; }
        .checklist-draft { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
        .checklist-draft li { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-sub); background: var(--bg-inset); padding: 5px 10px; border-radius: var(--radius-sm); }
        .checklist-draft button { background: none; border: none; color: var(--color-critical); cursor: pointer; font-size: 12px; }
        .td-create-error { background: var(--color-critical-bg); color: var(--color-critical); border: 1px solid var(--color-critical-border); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12.5px; margin-bottom: 12px; }
      `}</style>
      <style jsx global>{`
        .search-select-option:hover { background: var(--bg-hover) !important; }
        .create-new-opt:hover { background: var(--color-primary-bg) !important; color: var(--color-primary-dark) !important; }
      `}</style>
    </div>
  );
}
