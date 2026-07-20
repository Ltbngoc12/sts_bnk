'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Task, Case, RecurrenceConfig } from '@/lib/db';
import { RecurrenceScheduleField, recurrenceSummary } from '@/components/RecurrenceScheduleField';
import { useRole } from '@/context/RoleContext';
import { useNotifications } from '@/context/NotificationContext';
import {
  taskBadgeClass,
  TASK_STATUSES,
  isControllerPlus,
  getAssignableUsers,
  getAssignableGroups,
  internalGroupMembers,
} from '@/lib/taskHelpers';
import { getUsers } from '@/lib/users';
import { getTaskPriorityTaxonomy } from '@/lib/taxonomy';
import { ChecklistTemplate, getActiveChecklistTemplates } from '@/lib/checklistTemplates';

interface ChecklistDraft { id: string; text: string; }

const ITEMS_PER_PAGE = 10;

export function TaskBoardTab() {
  const router = useRouter();
  const { role, username } = useRole();
  const { addNotification } = useNotifications();

  const canControl = isControllerPlus(role);
  const isRanger = role === 'Responder (Ranger)';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'all' | 'mine'>('mine');

  // Search & filters
  const [searchTerm, setSearchTerm] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterAssignee, setFilterAssignee] = useState('All');
  const [filterCase, setFilterCase] = useState('All');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Create task states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCaseId, setTaskCaseId] = useState('new-case');
  const [assignType, setAssignType] = useState<'user' | 'group'>('user');
  const [taskAssignee, setTaskAssignee] = useState('');
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

  // Searchable case dropdown states
  const [caseSearchText, setCaseSearchText] = useState('');
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);
  const [selectedCase, setSelectedCase] = useState<any>({ id: 'NEW CASE', title: 'Auto-create new case' });

  const fetchTasksAndCases = async () => {
    try {
      const [tasksRes, casesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/cases'),
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (casesRes.ok) {
        const casesList = (await casesRes.json()) as Case[];
        setCases(casesList);
        setTaskCaseId('new-case');
        setSelectedCase({ id: 'NEW CASE', title: 'Auto-create new case' });
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasksAndCases(); }, []);
  useEffect(() => { if (isRanger) setTab('mine'); }, [isRanger]);
  useEffect(() => { setPriorityOptions(getTaskPriorityTaxonomy()); }, []);
  useEffect(() => { setTemplates(getActiveChecklistTemplates()); }, []);

  const isMine = (t: Task) =>
    t.assignee === username ||
    (t.assigneeType === 'group' && internalGroupMembers(t.assignee).includes(username));

  // ─── Derived data ─────────────────────────────────────────────────
  const now = Date.now();
  const isOverdue = (t: Task) => !!t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'Closed' && t.status !== 'Pending Closure';

  // Base set respecting tab / role visibility
  const baseTasks = (isRanger || tab === 'mine') ? tasks.filter(isMine) : tasks;

  const uniqueAssignees = Array.from(new Set(tasks.map(t => t.assignee).filter(a => a && a !== 'Unassigned'))).sort();

  const filteredTasks = baseTasks.filter(t => {
    if (filterStatus !== 'All' && t.status !== filterStatus) return false;
    if (filterPriority !== 'All' && t.priority !== filterPriority) return false;
    if (filterAssignee !== 'All' && t.assignee !== filterAssignee) return false;
    if (filterCase !== 'All' && t.caseId !== filterCase) return false;
    if (filterDateStart && (!t.dueDate || new Date(t.dueDate) < new Date(filterDateStart))) return false;
    if (filterDateEnd && (!t.dueDate || new Date(t.dueDate) > new Date(filterDateEnd + 'T23:59:59'))) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const hay = `${t.id} ${t.title} ${t.description} ${t.assignee} ${t.caseId}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Sort tasks by createdDate in descending order (Z-A / newest first)
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const da = a.createdDate ? new Date(a.createdDate).getTime() : 0;
    const db = b.createdDate ? new Date(b.createdDate).getTime() : 0;
    return db - da;
  });

  const totalPages = Math.ceil(sortedTasks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedTasks = sortedTasks.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Metric counts (over the visible base set)
  const totalCount = baseTasks.length;
  const activeCount = baseTasks.filter(t => t.status !== 'Closed').length;
  const overdueCount = baseTasks.filter(isOverdue).length;

  const resetFilters = () => {
    setSearchTerm(''); setFilterStatus('All'); setFilterPriority('All');
    setFilterAssignee('All'); setFilterCase('All'); setFilterDateStart('');
    setFilterDateEnd(''); setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm || filterStatus !== 'All' || filterPriority !== 'All' ||
    filterAssignee !== 'All' || filterCase !== 'All' || filterDateStart || filterDateEnd;

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

  const resetForm = () => {
    setTaskTitle(''); setTaskDesc(''); setTaskDueDate('');
    setRecurrence(null); setChecklist([]); setChecklistInput('');
    setAttachments([]); setTaskAssignee(''); setAssignType('user');
    setTaskPriority('Normal'); setCreateError(''); setSelectedTemplateId('');

    // Default to create new case for List screen
    setTaskCaseId('new-case');
    setSelectedCase({ id: 'NEW CASE', title: 'Auto-create new case' });
    setCaseSearchText('');
    setShowCaseDropdown(false);
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

  const notifyNewAssignee = (name: string, type: 'user' | 'group', title: string) => {
    if (type === 'group') {
      addNotification({ title: 'Task Assigned', message: `New task "${title}" assigned to group ${name}.`, role: 'Responder (Ranger)', type: 'task', link: '/tasks' });
    } else {
      const u = getUsers().find(x => x.name === name);
      const targetRole = u?.role === 'Responder' ? 'Responder (Ranger)' : ((u?.role as any) || 'Responder (Ranger)');
      addNotification({ title: 'Task Assigned', message: `New task "${title}" assigned to you.`, role: targetRole, type: 'task', link: '/tasks' });
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (!taskTitle.trim() || !taskCaseId) return;

    let targetCaseId = taskCaseId;

    try {
      if (taskCaseId === 'new-case') {
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
          return;
        }
        const newCaseObj = await caseRes.json();
        targetCaseId = newCaseObj.id;
      }

      const payload = {
        caseId: targetCaseId,
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

      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        if (taskAssignee) notifyNewAssignee(taskAssignee, assignType, taskTitle);
        setShowCreateModal(false);
        resetForm();
        fetchTasksAndCases();
      } else {
        const data = await res.json();
        setCreateError(data.error || 'Failed to create task.');
      }
    } catch (err) {
      setCreateError('Network error.');
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' };

  const assignableUsers = getAssignableUsers();
  const assignableGroups = getAssignableGroups();

  return (
    <>
      <style jsx global>{`
        .metric-card.tasks-total::before { background: var(--color-info); }
        .metric-card.tasks-active::before { background: var(--color-active); }
        .metric-card.tasks-overdue::before { background: var(--color-critical); }
      `}</style>

      {/* Metrics Bar */}
      <div className="metrics-grid mb-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div className="metric-card glass tasks-total" style={{ padding: '10px 16px' }}>
          <div className="metric-info">
            <h3>Total Tasks</h3>
            <div className="metric-value text-info" style={{ fontSize: '20px' }}>{totalCount}</div>
          </div>
          <div className="metric-icon" style={{ width: '28px', height: '28px', fontSize: '15px' }}>📋</div>
        </div>
        <div className="metric-card glass tasks-active" style={{ padding: '10px 16px' }}>
          <div className="metric-info">
            <h3>Active Tasks</h3>
            <div className="metric-value" style={{ color: 'var(--color-active)', fontSize: '20px' }}>{activeCount}</div>
          </div>
          <div className="metric-icon" style={{ width: '28px', height: '28px', fontSize: '15px' }}>⚙️</div>
        </div>
        <div className="metric-card glass tasks-overdue" style={{ padding: '10px 16px' }}>
          <div className="metric-info">
            <h3>Overdue Tasks</h3>
            <div className="metric-value text-danger" style={{ fontSize: '20px' }}>{overdueCount}</div>
          </div>
          <div className="metric-icon" style={{ width: '28px', height: '28px', fontSize: '15px' }}>⏰</div>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>

          {/* Tabs */}
          {!isRanger ? (
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['mine', 'all'] as const).map(tk => (
                <button
                  key={tk}
                  onClick={() => { setTab(tk); setCurrentPage(1); if (tk === 'all') setShowAdvancedFilters(true); }}
                  className={`tab-btn ${tab === tk ? 'active' : ''}`}
                  style={{
                    background: 'transparent', border: 'none',
                    borderBottom: tab === tk ? '2px solid var(--color-primary)' : '2px solid transparent',
                    color: tab === tk ? 'var(--color-primary)' : 'var(--text-muted)',
                    padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.15s ease',
                  }}
                >
                  {tk === 'all' ? 'All Tasks' : 'My Tasks'}
                  <span style={{
                    fontSize: '11px', fontWeight: 700,
                    background: tab === tk ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                    color: tab === tk ? 'var(--color-primary)' : 'var(--text-muted)',
                    padding: '2px 8px', borderRadius: '10px', minWidth: '20px', textAlign: 'center',
                  }}>
                    {tk === 'all' ? tasks.length : tasks.filter(isMine).length}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-primary)', padding: '8px 4px' }}>
              My Tasks <span style={{ fontSize: '11px', fontWeight: 700, background: 'var(--color-primary-bg)', color: 'var(--color-primary)', padding: '2px 8px', borderRadius: '10px' }}>{tasks.filter(isMine).length}</span>
            </div>
          )}

          {/* Search & Filter toggle */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1, justifyContent: 'flex-end' }}>

            {/* Filters toggle — icon only, left of search */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`btn ${showAdvancedFilters ? 'btn-info' : 'btn-secondary'}`}
              aria-label="Toggle filters"
              style={{ padding: '0 10px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)' }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>

            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search task ID, title, assignee, case..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="form-control"
                style={{ width: '100%', paddingLeft: '36px', height: '36px', fontSize: '13px' }}
              />
            </div>

            {canControl && (
              <button className="btn btn-primary" onClick={() => { resetForm(); setShowCreateModal(true); }} style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '13px', height: '13px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                CREATE NEW TASK
              </button>
            )}

            {hasActiveFilters && (
              <button onClick={resetFilters} className="btn btn-secondary" style={{ padding: '0 10px', fontSize: '12.5px', height: '36px', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}>
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvancedFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', paddingTop: '4px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label style={labelStyle}>Status:</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Statuses</option>
                {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={labelStyle}>Priority:</label>
              <select value={filterPriority} onChange={(e) => { setFilterPriority(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Priorities</option>
                {priorityOptions.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={labelStyle}>Assignee:</label>
              <select value={filterAssignee} onChange={(e) => { setFilterAssignee(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Assignees</option>
                {uniqueAssignees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={labelStyle}>Case:</label>
              <select value={filterCase} onChange={(e) => { setFilterCase(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Cases</option>
                {Array.from(new Set(tasks.map(t => t.caseId))).map(cid => <option key={cid} value={cid}>{cid}</option>)}
              </select>
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={labelStyle}>Due From:</label>
              <input type="date" value={filterDateStart} onChange={(e) => { setFilterDateStart(e.target.value); setCurrentPage(1); }} className="form-control" style={{ width: '100%', height: '36px' }} />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label style={labelStyle}>Due To:</label>
              <input type="date" value={filterDateEnd} onChange={(e) => { setFilterDateEnd(e.target.value); setCurrentPage(1); }} className="form-control" style={{ width: '100%', height: '36px' }} />
            </div>
          </div>
        )}
      </div>

      {/* Main content: list table */}
      <div className="cases-list-container glass" style={{ marginTop: '20px', padding: '20px' }}>
        {loading ? (
          <div className="cases-loading">Loading task registry...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="empty-cases">No tasks matching selected filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date Logged</th>
                  <th>Task ID</th>
                  <th>Task Title</th>
                  <th>Assignee</th>
                  <th>Status</th>
                  <th>Due Date</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTasks.map((t) => (
                  <tr key={t.id} onClick={() => router.push(`/tasks/${t.id}`)}>
                    <td className="date-cell">
                      {t.createdDate ? `${new Date(t.createdDate).toLocaleDateString('en-US')} ${new Date(t.createdDate).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` : '—'}
                    </td>
                    <td>
                      <span className="mono-id" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>
                        {t.id}
                      </span>
                    </td>
                    <td className="case-title-cell" style={{ fontWeight: 500 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                        {t.priority === 'Critical' ? (
                          /* Triple chevron up — Critical */
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Critical" style={{ flexShrink: 0 }}>
                            <path d="M3 6L8 1L13 6" stroke="#C53030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M3 10L8 5L13 10" stroke="#C53030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M3 14L8 9L13 14" stroke="#C53030" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : t.priority === 'High' ? (
                          /* Double chevron up — High */
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="High" style={{ flexShrink: 0 }}>
                            <path d="M3 10L8 5L13 10" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M3 14L8 9L13 14" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : t.priority === 'Low' ? (
                          /* Single chevron down — Low */
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Low" style={{ flexShrink: 0 }}>
                            <path d="M3 6L8 11L13 6" stroke="#718096" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : (
                          /* Equals sign — Normal */
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Normal" style={{ flexShrink: 0 }}>
                            <rect x="2" y="5.5" width="12" height="2" rx="1" fill="#F6AD55"/>
                            <rect x="2" y="9.5" width="12" height="2" rx="1" fill="#F6AD55"/>
                          </svg>
                        )}
                        <span>{t.title}</span>
                      </span>
                    </td>
                    <td>
                      <RespondersAvatars names={t.assignee} />
                    </td>
                    <td>
                      <span className={`badge ${taskBadgeClass(t.status)}`}>{t.status}</span>
                    </td>
                    <td className="date-cell" style={{ color: isOverdue(t) ? 'var(--color-critical)' : undefined, fontWeight: isOverdue(t) ? 600 : undefined }}>
                      {t.dueDate ? `${new Date(t.dueDate).toLocaleDateString('en-US')} ${new Date(t.dueDate).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + ITEMS_PER_PAGE, sortedTasks.length)}</strong> of <strong>{sortedTasks.length}</strong> tasks
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="btn btn-secondary btn-xs" style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'default' : 'pointer' }}>Previous</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setCurrentPage(p)} className={`btn ${p === currentPage ? 'btn-primary' : 'btn-secondary'} btn-xs`} style={{ padding: '6px 10px', fontSize: '11px', borderRadius: '6px', fontWeight: p === currentPage ? 'bold' : 'normal', cursor: 'pointer' }}>{p}</button>
                  ))}
                  <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="btn btn-secondary btn-xs" style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'default' : 'pointer' }}>Next</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass">
            <div className="modal-header">
              <h2>CREATE NEW OPERATIONAL TASK</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>Close</button>
            </div>

            <form onSubmit={handleCreateTask} className="modal-form">
              <div className="modal-scroll-area">
                {createError && <div className="td-create-error">{createError}</div>}

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
                        {cases
                          .filter(c => c.status !== 'Closed')
                          .filter(c => {
                            if (!caseSearchText.trim()) return true;
                            const query = caseSearchText.toLowerCase();
                            return (
                              c.id.toLowerCase().includes(query) ||
                              c.title.toLowerCase().includes(query)
                            );
                          })
                          .map(c => {
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
                        {cases
                          .filter(c => c.status !== 'Closed')
                          .filter(c => {
                            if (!caseSearchText.trim()) return true;
                            const query = caseSearchText.toLowerCase();
                            return (
                              c.id.toLowerCase().includes(query) ||
                              c.title.toLowerCase().includes(query)
                            );
                          }).length === 0 && (
                          <div style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            No cases found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

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
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">DISPATCH TASK</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .checklist-builder { display: flex; gap: 8px; }
        .checklist-builder input { flex: 1; }
        .btn-sm { padding: 6px 12px; font-size: 12px; height: auto; white-space: nowrap; }
        .checklist-draft { margin-top: 8px; display: flex; flex-direction: column; gap: 5px; }
        .checklist-draft li { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-sub); background: var(--bg-inset); padding: 5px 10px; border-radius: var(--radius-sm); }
        .checklist-draft button { background: none; border: none; color: var(--color-critical); cursor: pointer; font-size: 12px; }
        .td-create-error { background: var(--color-critical-bg); color: var(--color-critical); border: 1px solid var(--color-critical-border); padding: 8px 12px; border-radius: var(--radius-sm); font-size: 12.5px; margin-bottom: 12px; }
        .search-select-option:hover { background: var(--bg-hover) !important; }
        .create-new-opt:hover { background: var(--color-primary-bg) !important; color: var(--color-primary-dark) !important; }
      `}</style>
    </>
  );
}

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: color,
          color: '#FFF',
          fontSize: '10px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1.5px solid #FFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
        }}>
          {letter}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>{name}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', marginRight: '6px' }}>
        {list.map((name, idx) => {
          const letter = name.trim().charAt(0).toUpperCase();
          const color = getAvatarColor(name);
          return (
            <span
              key={idx}
              title={name}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: color,
                color: '#FFF',
                fontSize: '10px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #FFF',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                marginLeft: idx > 0 ? '-6px' : '0',
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
