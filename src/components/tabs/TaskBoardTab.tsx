'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Task } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import {
  taskBadgeClass,
  TASK_STATUSES,
  isControllerPlus,
  getTaskAssignees,
  isTaskAssignee,
} from '@/lib/taskHelpers';
import { getTaskPriorityTaxonomy } from '@/lib/taxonomy';
import TaskCreateModal from '@/components/TaskCreateModal';

const ITEMS_PER_PAGE = 10;

export function TaskBoardTab() {
  const router = useRouter();
  const { role, username } = useRole();

  const canControl = isControllerPlus(role);
  const isRanger = role === 'Responder (Ranger)';

  const [tasks, setTasks] = useState<Task[]>([]);
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
  const [priorityOptions, setPriorityOptions] = useState<string[]>(['Normal', 'High']);

  // Create task modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => { setPriorityOptions(getTaskPriorityTaxonomy()); }, []);

  const fetchTasks = async () => {
    try {
      const tasksRes = await fetch('/api/tasks');
      if (tasksRes.ok) setTasks(await tasksRes.json());
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTasks(); }, []);
  useEffect(() => { if (isRanger) setTab('mine'); }, [isRanger]);

  const isMine = (t: Task) => isTaskAssignee(getTaskAssignees(t), username);

  // ─── Derived data ─────────────────────────────────────────────────
  const now = Date.now();
  const isOverdue = (t: Task) => !!t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'Closed' && t.status !== 'Pending Closure';

  // Base set respecting tab / role visibility
  const baseTasks = (isRanger || tab === 'mine') ? tasks.filter(isMine) : tasks;

  const uniqueAssignees = Array.from(
    new Set(tasks.flatMap(t => getTaskAssignees(t).map(a => a.name)))
  ).sort();

  const filteredTasks = baseTasks.filter(t => {
    const taskAssignees = getTaskAssignees(t);
    if (filterStatus !== 'All' && t.status !== filterStatus) return false;
    if (filterPriority !== 'All' && t.priority !== filterPriority) return false;
    if (filterAssignee !== 'All' && !taskAssignees.some(a => a.name === filterAssignee)) return false;
    if (filterCase !== 'All' && t.caseId !== filterCase) return false;
    if (filterDateStart && (!t.dueDate || new Date(t.dueDate) < new Date(filterDateStart))) return false;
    if (filterDateEnd && (!t.dueDate || new Date(t.dueDate) > new Date(filterDateEnd + 'T23:59:59'))) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const assigneeNames = taskAssignees.map(a => a.name).join(' ');
      const hay = `${t.id} ${t.title} ${t.description} ${assigneeNames} ${t.caseId}`.toLowerCase();
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

  const labelStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' };

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
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)} style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 600 }}>
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
                      <RespondersAvatars names={getTaskAssignees(t).map(a => a.name)} />
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

      <TaskCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => fetchTasks()}
        username={username}
      />
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
