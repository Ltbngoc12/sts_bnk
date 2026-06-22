'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Task, Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// TEMPORARY: Show "Upcoming" placeholder — remove this block when ready to demo
const SHOW_UPCOMING = true;

function UpcomingPlaceholder({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px', color: 'var(--text-muted)' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-faint)' }}>
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{title}</p>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>This module is currently under review and will be available soon.</p>
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px', borderRadius: '99px', border: '1px solid var(--border-color)', color: 'var(--text-faint)', background: 'var(--bg-inset)' }}>Upcoming</span>
    </div>
  );
}

export default function TasksPage() {
  const { role, username } = useRole();

  if (SHOW_UPCOMING) return <UpcomingPlaceholder title="Task Management Board" />;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create task states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCaseId, setTaskCaseId] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Ranger John');
  const [taskPriority, setTaskPriority] = useState('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Selected task detail popup states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newAssignee, setNewAssignee] = useState('');

  const fetchTasksAndCases = async () => {
    try {
      const [tasksRes, casesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/cases')
      ]);
      if (tasksRes.ok) setTasks(await tasksRes.json());
      if (casesRes.ok) {
        const casesList = await casesRes.json() as Case[];
        setCases(casesList);
        // Default to the first active case in list for form ease
        const active = casesList.find(c => c.status !== 'Closed');
        if (active) setTaskCaseId(active.id);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasksAndCases();
  }, []);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskCaseId) return;

    const payload = {
      caseId: taskCaseId,
      title: taskTitle,
      description: taskDesc,
      assignee: taskAssignee,
      priority: taskPriority,
      dueDate: taskDueDate,
      username
    };

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setShowCreateModal(false);
        // Reset form
        setTaskTitle('');
        setTaskDesc('');
        setTaskDueDate('');
        fetchTasksAndCases();
      }
    } catch (err) {
      console.error('Error creating task:', err);
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, status: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        setSelectedTask(null);
        fetchTasksAndCases();
      }
    } catch (err) {
      console.error('Error updating task status:', err);
    }
  };

  const handleReassignTask = async (taskId: string) => {
    if (!newAssignee) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignee: newAssignee })
      });
      if (res.ok) {
        setSelectedTask(null);
        setNewAssignee('');
        fetchTasksAndCases();
      }
    } catch (err) {
      console.error('Error reassigning task:', err);
    }
  };

  // Group tasks into columns
  const getTasksByStatusGroup = (statusGroup: 'todo' | 'progress' | 'pending' | 'closed') => {
    return tasks.filter(t => {
      if (statusGroup === 'todo') return t.status === 'Created' || t.status === 'Re-Assigned';
      if (statusGroup === 'progress') return t.status === 'Acknowledged' || t.status === 'In Progress';
      if (statusGroup === 'pending') return t.status === 'Pending' || t.status === 'Further Action';
      if (statusGroup === 'closed') return t.status === 'Closed';
      return false;
    });
  };

  // Render cards in column
  const renderColumn = (title: string, group: 'todo' | 'progress' | 'pending' | 'closed', borderClass: string) => {
    const list = getTasksByStatusGroup(group);
    return (
      <div className="kanban-column glass">
        <div className={`column-header ${borderClass}`}>
          <h3>{title}</h3>
          <span className="count-badge">{list.length}</span>
        </div>
        <div className="column-cards-container">
          {list.length === 0 ? (
            <div className="empty-column">No tasks in this state.</div>
          ) : (
            list.map(t => (
              <div key={t.id} className="task-card glass" onClick={() => { setSelectedTask(t); setNewAssignee(t.assignee); }}>
                <div className="task-priority-tag">
                  <span className={`priority-indicator ${
                    t.priority === 'High' ? 'p-high' : 'p-normal'
                  }`} />
                  <span>{t.priority} Priority</span>
                </div>
                <div className="task-card-title">{t.title}</div>
                <div className="task-card-desc">{t.description}</div>
                <div className="task-card-meta">
                  <span className="case-ref">Case: {t.caseId}</span>
                  <span className="assignee">👤 {t.assignee}</span>
                </div>
                {t.dueDate && (
                  <div className="task-due-date">
                    📅 Due: {new Date(t.dueDate).toLocaleString()}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Check role-based permission
  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator' || role === 'Current Ops Administrator';
  const isRanger = role === 'Responder (Ranger)';

  return (
    <>
      <div className="tasks-header-bar glass">
        <div className="title-section">
          <h1>TASK MANAGEMENT BOARD</h1>
          <p>Operational ground task assignments linked to IIOC Cases</p>
        </div>
        {isController && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            CREATE NEW TASK
          </button>
        )}
      </div>

      {loading ? (
        <div className="tasks-loading glass">Loading task board...</div>
      ) : (
        <div className="kanban-board-container">
          {renderColumn('Created / Re-assigned', 'todo', 'hdr-todo')}
          {renderColumn('Acknowledged / In Progress', 'progress', 'hdr-progress')}
          {renderColumn('Pending / Further Action', 'pending', 'hdr-pending')}
          {renderColumn('Closed / Resolved', 'closed', 'hdr-closed')}
        </div>
      )}

      {/* Task detail popup */}
      {selectedTask && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxHeight: '480px' }}>
            <div className="modal-header">
              <h2>TASK ID: {selectedTask.id} ({selectedTask.status})</h2>
              <button className="close-btn" onClick={() => setSelectedTask(null)}>Close</button>
            </div>
            
            <div className="task-detail-body">
              <div className="detail-meta-row">
                <div><strong>Parent Case:</strong> <Link href={`/cases/${selectedTask.caseId}`} className="link">{selectedTask.caseId}</Link></div>
                <div><strong>Priority:</strong> {selectedTask.priority}</div>
              </div>
              <div className="detail-title">{selectedTask.title}</div>
              <p className="detail-desc">{selectedTask.description || 'No description provided.'}</p>
              
              <div className="assignee-row glass">
                <div className="curr-assignee">Assigned to: <strong>{selectedTask.assignee}</strong></div>
                {/* Controller Reassign (FRD 3.4.2) */}
                {isController && (
                  <div className="reassign-inputs">
                    <select 
                      value={newAssignee} 
                      onChange={(e) => setNewAssignee(e.target.value)}
                      className="form-control select-dark"
                      style={{ padding: '6px', height: '34px', fontSize: '12px' }}
                    >
                      <option value="Ranger John">Ranger John</option>
                      <option value="Ranger Sarah">Ranger Sarah</option>
                      <option value="Ranger Alex">Ranger Alex</option>
                      <option value="Ranger Tommy">Ranger Tommy</option>
                    </select>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => handleReassignTask(selectedTask.id)}
                      style={{ padding: '6px 12px' }}
                    >
                      Reassign
                    </button>
                  </div>
                )}
              </div>

              {/* Status transition controls (FRD 3.4.2 Action Matrix) */}
              <div className="modal-actions-wrapper">
                <h4>UPDATE TASK STATE</h4>
                <div className="state-btns">
                  {selectedTask.status !== 'Closed' && (
                    <>
                      {/* Assignee / Ranger flows */}
                      {(isRanger || isController) && (selectedTask.status === 'Created' || selectedTask.status === 'Re-Assigned') && (
                        <button className="btn btn-secondary" onClick={() => handleUpdateTaskStatus(selectedTask.id, 'Acknowledged')}>
                          Acknowledge Receipt
                        </button>
                      )}
                      
                      {(isRanger || isController) && (selectedTask.status === 'Acknowledged' || selectedTask.status === 'Created') && (
                        <button className="btn btn-primary" onClick={() => handleUpdateTaskStatus(selectedTask.id, 'In Progress')}>
                          Start Work (In Progress)
                        </button>
                      )}
                      
                      {(isRanger || isController) && selectedTask.status === 'In Progress' && (
                        <button className="btn btn-secondary" onClick={() => handleUpdateTaskStatus(selectedTask.id, 'Pending')}>
                          Set to Pending/Hold
                        </button>
                      )}

                      {/* Any assigned user can close directly (FRD 7.2 & 7.3) */}
                      {(isRanger || isController) && (
                        <button className="btn btn-success" onClick={() => handleUpdateTaskStatus(selectedTask.id, 'Closed')}>
                          Close Task (Completed)
                        </button>
                      )}
                    </>
                  )}
                  {selectedTask.status === 'Closed' && isController && (
                    <button className="btn btn-danger" onClick={() => handleUpdateTaskStatus(selectedTask.id, 'Created')}>
                      Reopen Task
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                
                <div className="form-group">
                  <label>Link to Parent Case *</label>
                  <select 
                    value={taskCaseId} 
                    onChange={(e) => setTaskCaseId(e.target.value)} 
                    required 
                    className="form-control select-dark"
                  >
                    <option value="">-- Choose Case --</option>
                    {cases.filter(c => c.status !== 'Closed').map(c => (
                      <option key={c.id} value={c.id}>{c.id} - {c.title}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Task Title *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Escort contractor to substation" 
                    value={taskTitle} 
                    onChange={e => setTaskTitle(e.target.value)} 
                    required 
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Task Description</label>
                  <textarea 
                    placeholder="Provide details on ground activities needed..." 
                    value={taskDesc} 
                    onChange={e => setTaskDesc(e.target.value)} 
                    className="form-control"
                    rows={3}
                  />
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label>Assignee (Ranger / Staff)</label>
                    <select 
                      value={taskAssignee} 
                      onChange={e => setTaskAssignee(e.target.value)} 
                      className="form-control select-dark"
                    >
                      <option value="Ranger John">Ranger John</option>
                      <option value="Ranger Sarah">Ranger Sarah</option>
                      <option value="Ranger Alex">Ranger Alex</option>
                      <option value="Ranger Tommy">Ranger Tommy</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Priority</label>
                    <select 
                      value={taskPriority} 
                      onChange={e => setTaskPriority(e.target.value)} 
                      className="form-control select-dark"
                    >
                      <option value="High">High</option>
                      <option value="Normal">Normal</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Due Date & Time (Target completion)</label>
                  <input 
                    type="datetime-local" 
                    value={taskDueDate} 
                    onChange={e => setTaskDueDate(e.target.value)} 
                    className="form-control"
                  />
                </div>

              </div>
              
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">DISPATCH TASK</button>
              </div>
            </form>
          </div>
        </div>
      )}


    </>
  );
}
