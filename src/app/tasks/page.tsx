'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Task, Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function TasksPage() {
  const { role, username } = useRole();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create task states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskCaseId, setTaskCaseId] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Ranger John');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Selected task detail popup states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newAssignee, setNewAssignee] = useState('');

  useEffect(() => {
    fetchTasksAndCases();
  }, []);

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
                    t.priority === 'High' ? 'p-high' :
                    t.priority === 'Medium' ? 'p-med' : 'p-low'
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
  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';
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
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
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

      <style jsx>{`
        .tasks-header-bar {
          padding: 20px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .title-section h1 {
          font-family: var(--font-title);
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.03em;
        }

        .title-section p {
          font-size: 12px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .tasks-loading {
          padding: 80px;
          text-align: center;
          font-weight: 600;
          color: var(--text-muted);
        }

        /* Kanban Board columns */
        .kanban-board-container {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          align-items: start;
          flex-grow: 1;
        }

        .kanban-column {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-height: 80vh;
        }

        .column-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 10px;
          border-bottom: 2px solid transparent;
        }

        .hdr-todo { border-bottom-color: var(--color-primary); }
        .hdr-progress { border-bottom-color: var(--color-accent); }
        .hdr-pending { border-bottom-color: var(--color-warning); }
        .hdr-closed { border-bottom-color: var(--text-muted); }

        .column-header h3 {
          font-family: var(--font-title);
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .count-badge {
          background: rgba(255,255,255,0.05);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 700;
        }

        .column-cards-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
          overflow-y: auto;
          flex-grow: 1;
        }

        .empty-column {
          padding: 20px 0;
          text-align: center;
          color: var(--text-muted);
          font-size: 11px;
          border: 1px dashed var(--border-color);
          border-radius: 8px;
        }

        /* Task Cards */
        .task-card {
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          cursor: pointer;
        }

        .task-card:hover {
          transform: translateY(-2px);
          border-color: rgba(255, 255, 255, 0.15);
        }

        .task-priority-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10px;
          font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
        }

        .priority-indicator {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }

        .p-high { background: var(--color-danger); box-shadow: 0 0 6px var(--color-danger); }
        .p-med { background: var(--color-warning); box-shadow: 0 0 6px var(--color-warning); }
        .p-low { background: var(--text-muted); }

        .task-card-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
        }

        .task-card-desc {
          font-size: 12px;
          color: var(--text-muted);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .task-card-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: var(--text-muted);
          padding-top: 8px;
          border-top: 1px dashed var(--border-color);
        }

        .case-ref {
          color: var(--color-primary);
          font-family: var(--font-title);
          font-weight: 600;
        }

        .task-due-date {
          font-size: 10px;
          color: var(--color-danger);
          font-weight: 500;
        }

        /* Task Detail Modal layout */
        .task-detail-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .detail-meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: var(--text-muted);
        }

        .link {
          color: var(--color-primary);
          text-decoration: none;
          font-weight: 600;
        }

        .link:hover {
          text-decoration: underline;
        }

        .detail-title {
          font-family: var(--font-title);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-main);
        }

        .detail-desc {
          font-size: 13px;
          color: var(--text-muted);
          line-height: 1.5;
        }

        .assignee-row {
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .curr-assignee {
          font-size: 13px;
        }

        .reassign-inputs {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .modal-actions-wrapper h4 {
          font-family: var(--font-title);
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 10px;
        }

        .state-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        /* Modal specific layouts */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(8px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 10000;
        }

        .create-case-modal {
          width: 100%;
          max-width: 600px;
          height: 80vh;
          max-height: 520px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          overflow: hidden;
          background: #0f1420;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .modal-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .modal-header h2 {
          font-family: var(--font-title);
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--text-muted);
          cursor: pointer;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          height: calc(100% - 50px);
        }

        .modal-scroll-area {
          padding: 20px;
          overflow-y: auto;
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .modal-actions {
          padding: 16px 20px;
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          background: rgba(0,0,0,0.15);
        }
      `}</style>
    </>
  );
}
