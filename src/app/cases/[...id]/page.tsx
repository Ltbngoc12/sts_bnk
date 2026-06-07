'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Case, Task, LogEntry, PersonalInjury, PersonInvolved, VehicleInvolved } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function CaseDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { role, username } = useRole();
  
  // Reconstruct Case ID from catch-all path params
  const idArray = params?.id as string[];
  const caseId = idArray ? idArray.join('/') : '';
  
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeComponent, setActiveComponent] = useState<'incident' | 'tasks' | 'faults'>('incident');
  const [activeTab, setActiveTab] = useState<'log' | 'services' | 'media' | 'property' | 'persons' | 'duplicates'>('log');
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Slave incident addition states
  const [slaveTitle, setSlaveTitle] = useState('');
  const [slaveReporter, setSlaveReporter] = useState('');
  const [slaveSummary, setSlaveSummary] = useState('');
  
  // Interactive action states for Incident
  const [newLogText, setNewLogText] = useState('');
  const [rangerActivityText, setRangerActivityText] = useState('');
  const [assigneeInput, setAssigneeInput] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [cmmsLoading, setCmmsLoading] = useState(false);
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  // Sub-form additions for Incident
  const [injuryName, setInjuryName] = useState('');
  const [injuryAge, setInjuryAge] = useState('');
  const [injuryContact, setInjuryContact] = useState('');
  const [injuryHospital, setInjuryHospital] = useState('');
  const [injuryUnder16, setInjuryUnder16] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentContact, setParentContact] = useState('');

  const [personType, setPersonType] = useState('Guest');
  const [personName, setPersonName] = useState('');
  const [personContact, setPersonContact] = useState('');
  const [personRole, setPersonRole] = useState('Witness');

  // Task creation states inside Case Detail
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Ranger John');
  const [taskPriority, setTaskPriority] = useState('Medium');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Selected task detail view states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newAssignee, setNewAssignee] = useState('');

  useEffect(() => {
    if (caseId) {
      fetchCaseDetails();
    }
  }, [caseId]);

  // Once case data is loaded, determine active component default
  useEffect(() => {
    if (caseData) {
      if (caseData.incident) {
        setActiveComponent('incident');
      } else if (caseData.cmmsTickets?.length > 0) {
        setActiveComponent('faults');
      } else {
        setActiveComponent('tasks');
      }
    }
  }, [caseData]);

  const fetchCaseDetails = async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}`);
      if (res.ok) {
        setCaseData(await res.json());
      } else {
        console.error('Case not found');
      }

      // Fetch tasks for this case
      const tasksRes = await fetch('/api/tasks');
      if (tasksRes.ok) {
        const allTasks = await tasksRes.json() as Task[];
        setTasks(allTasks.filter(t => t.caseId === caseId));
      }
    } catch (err) {
      console.error('Error fetching case details:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateIncident = async (payload: any) => {
    try {
      const res = await fetch(`/api/incidents/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username })
      });
      if (res.ok) {
        fetchCaseDetails();
      }
    } catch (err) {
      console.error('Failed to update incident:', err);
    }
  };

  const handleCaseStatusTransition = async (status: string) => {
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchCaseDetails();
      }
    } catch (err) {
      console.error('Failed to transition case status:', err);
    }
  };

  const handleAppendLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogText.trim()) return;
    await updateIncident({ newLogEntry: newLogText });
    setNewLogText('');
  };

  const handleAppendRangerActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangerActivityText.trim()) return;
    await updateIncident({ newLogEntry: `[Ranger Log] ${rangerActivityText}` });
    setRangerActivityText('');
  };

  const handleAssignResponder = async () => {
    if (!assigneeInput.trim()) return;
    await updateIncident({ assignedTo: assigneeInput });
    setAssigneeInput('');
    setShowAssignModal(false);
  };

  const handleCMMSCreation = async () => {
    if (!caseData || cmmsLoading) return;
    setCmmsLoading(true);
    
    try {
      // Mock CMMS call
      const res = await fetch('/api/cmms-mock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: caseData.incident?.location.commonName || caseData.incident?.location.road || 'Sentosa Ground',
          description: caseData.incident?.summary || caseData.title
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Link CMMS Ticket ID back to Case
        const caseRes = await fetch(`/api/cases/${caseId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmmsTicketId: data.ticketId })
        });
        
        if (caseRes.ok) {
          // Log CMMS event if incident is present, otherwise just fetch case details
          if (caseData.incident) {
            await updateIncident({
              newLogEntry: `CMMS Ticket raised in external IFM system: ID ${data.ticketId}. Linkage established on Case.`
            });
          } else {
            fetchCaseDetails();
          }
        }
      }
    } catch (err) {
      console.error('Failed to raise CMMS ticket:', err);
    } finally {
      setCmmsLoading(false);
    }
  };

  const handleStatusTransition = async (status: string) => {
    const payload: any = { status };
    if (status === 'Live (Completed)') {
      payload.completionRemarks = completionRemarks;
      setShowCompleteModal(false);
    }
    await updateIncident(payload);
  };

  const handleAddInjury = async () => {
    if (!injuryName || !caseData) return;
    const newInjury: PersonalInjury = {
      name: injuryName,
      address: '',
      age: parseInt(injuryAge, 10) || 30,
      gender: 'Other',
      contactNumber: injuryContact,
      clinicHospitalAttended: injuryHospital,
      msigFormIssued: false,
      under16: injuryUnder16,
      parentGuardianName: injuryUnder16 ? parentName : undefined,
      parentGuardianContact: injuryUnder16 ? parentContact : undefined
    };
    const updatedInjuries = [...(caseData.incident?.personalInjuries || []), newInjury];
    await updateIncident({ personalInjuries: updatedInjuries });
    
    // Reset inputs
    setInjuryName('');
    setInjuryAge('');
    setInjuryContact('');
    setInjuryHospital('');
    setInjuryUnder16(false);
  };

  const handleAddPerson = async () => {
    if (!personName || !caseData) return;
    const newPerson: PersonInvolved = {
      guestOrNonGuest: personType === 'Guest' ? 'Guest' : 'Non-Guest',
      type: personType,
      name: personName,
      address: '',
      age: 30,
      gender: 'Other',
      contactNumber: personContact,
      roleInvolvement: personRole,
      injuryDetails: ''
    };
    const updatedPersons = [...(caseData.incident?.personsInvolved || []), newPerson];
    await updateIncident({ personsInvolved: updatedPersons });
    
    // Reset inputs
    setPersonName('');
    setPersonContact('');
    setPersonRole('Witness');
  };

  const handleAddSlaveIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slaveTitle.trim() || !caseData || !caseData.incident) return;
    
    const newSlave: any = {
      id: `DUP-${String((caseData.incident.slaveIncidents?.length || 0) + 1).padStart(3, '0')}`,
      title: slaveTitle,
      dateTime: new Date().toISOString(),
      reporterName: slaveReporter || 'Anonymous Guest',
      summary: slaveSummary,
      status: caseData.incident.status === 'Closed' ? 'Closed' : 'Open'
    };
    
    const updatedSlaves = [...(caseData.incident.slaveIncidents || []), newSlave];
    
    await updateIncident({ 
      slaveIncidents: updatedSlaves,
      newLogEntry: `[Duplicate Detection] Linked duplicate (Slave) Incident ${newSlave.id}: "${slaveTitle}" was added to this Master Incident.`
    });
    
    // Reset form
    setSlaveTitle('');
    setSlaveReporter('');
    setSlaveSummary('');
  };

  const handleAddCopsDetails = async (policeAtScene: boolean) => {
    await updateIncident({ emergencyServices: { policeAtScene } });
  };

  const handleAddMediaDetails = async (mediaAtScene: boolean) => {
    await updateIncident({ mediaInvolvement: { mediaAtScene } });
  };

  const handleReopen = async () => {
    // Only System Administrator can revert closed incidents (FRD 5.4.1)
    if (role !== 'System Administrator') return;
    await updateIncident({ status: 'Live' });
    
    // Update Case status back to Active
    await fetch(`/api/cases/${caseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Active' })
    });
    
    fetchCaseDetails();
  };

  // Task Handlers
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !caseId) return;

    const payload = {
      caseId: caseId,
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
        setShowCreateTaskModal(false);
        setTaskTitle('');
        setTaskDesc('');
        setTaskDueDate('');
        fetchCaseDetails();
      } else {
        alert('Failed to dispatch task.');
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
        fetchCaseDetails();
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
        fetchCaseDetails();
      }
    } catch (err) {
      console.error('Error reassigning task:', err);
    }
  };

  if (loading) {
    return <div className="loading-state glass">Loading Case Details...</div>;
  }

  if (!caseData) {
    return <div className="loading-state glass text-danger">Case registry not found.</div>;
  }

  const inc = caseData.incident;

  // Determine button displays based on the FRD Role and Status action matrix
  const isRanger = role === 'Responder (Ranger)';
  const isController = role === 'Controller' || role === 'System Administrator';
  const isManager = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';

  return (
    <>
      {/* Top Header Grid */}
      <div className="case-detail-header-card glass">
        <div className="case-detail-title-sec">
          <div className="case-id-badge">CASE CONTAINER ID: {caseData.id}</div>
          <h1>{caseData.title}</h1>
          <p className="case-timestamp">
            Logged At: {new Date(caseData.createdAt).toLocaleString()} {inc ? `• Incident Created By: ${inc.createdBy}` : ''}
          </p>
        </div>

        <div className="case-status-sec">
          <div className="status-label-group">
            <span className="label">Case State:</span>
            <span className={`badge ${
              caseData.status === 'Pending Triage' ? 'badge-ack' :
              caseData.status === 'Active' ? 'badge-onsite' : 'badge-closed'
            }`}>
              {caseData.status}
            </span>

            {inc && (
              <>
                <span className="label" style={{ marginLeft: '12px' }}>Incident Workflow:</span>
                <span className={`badge ${
                  inc.status === 'Live' ? 'badge-live' :
                  inc.status === 'Live (Acknowledged)' ? 'badge-ack' :
                  inc.status === 'Live (On-Site)' ? 'badge-onsite' :
                  inc.status === 'Live (Completed)' ? 'badge-completed' :
                  inc.status === 'Pending Review' ? 'badge-review' : 'badge-closed'
                }`}>
                  {inc.status}
                </span>
              </>
            )}
          </div>

          {/* Interactive State transitions */}
          <div className="action-button-row">
            
            {/* Case Level Status Transitions */}
            {isController && caseData.status === 'Pending Triage' && (
              <button className="btn btn-success" onClick={() => handleCaseStatusTransition('Active')}>
                ACTIVATE CASE
              </button>
            )}
            {isController && caseData.status === 'Active' && (
              <button className="btn btn-danger" onClick={() => handleCaseStatusTransition('Closed')}>
                CLOSE CASE CONTAINER
              </button>
            )}
            {role === 'System Administrator' && caseData.status === 'Closed' && (
              <button className="btn btn-secondary" onClick={() => handleCaseStatusTransition('Active')}>
                REOPEN CASE CONTAINER
              </button>
            )}

            {/* INCIDENT FLOW TRANSITIONS (Only if incident is attached) */}
            {inc && (
              <>
                {/* RANGER FLOW (FRD 3.4.1) */}
                {isRanger && inc.status === 'Live' && (
                  <button className="btn btn-primary" onClick={() => handleStatusTransition('Live (Acknowledged)')}>
                    ACKNOWLEDGE INCIDENT
                  </button>
                )}

                {isRanger && inc.status === 'Live (Acknowledged)' && (
                  <button className="btn btn-success" onClick={() => handleStatusTransition('Live (On-Site)')}>
                    NOTIFY ARRIVED ON-SITE
                  </button>
                )}

                {isRanger && (inc.status === 'Live (On-Site)' || inc.status === 'Live (Returned to Responder)') && (
                  <button className="btn btn-success" onClick={() => setShowCompleteModal(true)}>
                    NOTIFY COMPLETION
                  </button>
                )}

                {/* CONTROLLER FLOW (FRD 3.4.1) */}
                {isController && inc.status !== 'Closed' && inc.status !== 'Pending Review' && (
                  <button className="btn btn-secondary" onClick={() => setShowAssignModal(true)}>
                    {inc.assignedTo ? 'RE-ASSIGN RANGER' : 'ASSIGN RANGER'}
                  </button>
                )}

                {isController && inc.status !== 'Closed' && inc.status !== 'Pending Review' && (
                  <button className="btn btn-primary" onClick={() => handleStatusTransition('Pending Review')}>
                    SUBMIT FOR REVIEW
                  </button>
                )}

                {/* MANAGER FLOW (FRD 3.4.1) */}
                {isManager && inc.status === 'Pending Review' && (
                  <>
                    <button className="btn btn-danger" onClick={() => handleStatusTransition('Returned')}>
                      RETURN TO CONTROLLER
                    </button>
                    <button className="btn btn-secondary" onClick={() => handleStatusTransition('Live (Returned to Responder)')}>
                      RETURN TO RANGER
                    </button>
                    <button className="btn btn-success" onClick={() => handleStatusTransition('Closed')}>
                      APPROVE CLOSURE
                    </button>
                  </>
                )}

                {/* SYSTEM ADMIN FLOW */}
                {role === 'System Administrator' && inc.status === 'Closed' && caseData.status === 'Closed' && (
                  <button className="btn btn-secondary" onClick={handleReopen}>
                    REOPEN INCIDENT
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Component Tabs Bar */}
      <div className="component-tabs">
        <button 
          className={`comp-tab-btn ${activeComponent === 'incident' ? 'active' : ''}`}
          onClick={() => setActiveComponent('incident')}
        >
          🚨 Incident Report {inc ? '' : '(Not Attached)'}
        </button>
        <button 
          className={`comp-tab-btn ${activeComponent === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveComponent('tasks')}
        >
          📋 Ranger Tasks ({tasks.length})
        </button>
        <button 
          className={`comp-tab-btn ${activeComponent === 'faults' ? 'active' : ''}`}
          onClick={() => setActiveComponent('faults')}
        >
          🔧 IFM Faults ({caseData.cmmsTickets?.length || 0})
        </button>
      </div>

      {/* Main split grid */}
      <div className="case-content-grid">
        
        {/* Left column: Render chosen component tab */}
        <div className="case-main-column">
          
          {/* Tab 1: Incident Report */}
          {activeComponent === 'incident' && (
            <>
              {!inc ? (
                <div className="empty-component-card glass">
                  <div className="icon">🚨</div>
                  <h3>No Incident Report Attached</h3>
                  <p>This case folder was logged as a general operational tracking case and does not contain a specific security or safety incident report details.</p>
                </div>
              ) : (
                <>
                  <div className="tab-header glass">
                    <button className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>INCIDENT LOG</button>
                    <button className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>EMERGENCY SERVICES</button>
                    <button className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>MEDIA</button>
                    <button className={`tab-btn ${activeTab === 'property' ? 'active' : ''}`} onClick={() => setActiveTab('property')}>DAMAGE & VEHICLES</button>
                    <button className={`tab-btn ${activeTab === 'persons' ? 'active' : ''}`} onClick={() => setActiveTab('persons')}>PERSONS INVOLVED</button>
                    <button className={`tab-btn ${activeTab === 'duplicates' ? 'active' : ''}`} onClick={() => setActiveTab('duplicates')}>SLAVE INCIDENTS ({inc.slaveIncidents?.length || 0})</button>
                  </div>

                  <div className="tab-body glass">
                    
                    {/* 1. Log tab */}
                    {activeTab === 'log' && (
                      <div className="log-tab-content">
                        {/* Event logging form */}
                        {inc.status !== 'Closed' && (
                          <form onSubmit={handleAppendLog} className="log-input-form">
                            <textarea 
                              placeholder="Add chronological log entry or update..." 
                              value={newLogText} 
                              onChange={(e) => setNewLogText(e.target.value)} 
                              className="form-control"
                              rows={2}
                            />
                            <button type="submit" className="btn btn-primary">ADD LOG ENTRY</button>
                          </form>
                        )}

                        {/* Timeline */}
                        <div className="timeline-section">
                          <h3>CHRONOLOGICAL LOG</h3>
                          <div className="timeline">
                            {[...inc.log].reverse().map((entry) => (
                              <div className="timeline-item" key={entry.eventNumber}>
                                <div className="timeline-dot" />
                                <div className="timeline-header">
                                  <span>Event #{entry.eventNumber}</span>
                                  <span>&bull;</span>
                                  <span>{entry.date} {entry.time}</span>
                                </div>
                                <div className="timeline-desc">{entry.description}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. Emergency Services tab */}
                    {activeTab === 'services' && (
                      <div className="services-tab-content">
                        <div className="subform-grid">
                          <div className="subform-card">
                            <h3>POLICE DISPATCH</h3>
                            <div className="checkbox-row">
                              <input 
                                type="checkbox" 
                                id="cops-scene" 
                                checked={inc.emergencyServices.policeAtScene} 
                                onChange={(e) => handleAddCopsDetails(e.target.checked)}
                                disabled={inc.status === 'Closed'}
                              />
                              <label htmlFor="cops-scene">Police present at scene</label>
                            </div>
                            {inc.emergencyServices.policeAtScene && (
                              <div className="fields">
                                <div className="form-group">
                                  <label>Officer Name & Rank</label>
                                  <input 
                                    type="text" 
                                    value={inc.emergencyServices.officerNameRank} 
                                    onChange={(e) => updateIncident({ emergencyServices: { officerNameRank: e.target.value } })}
                                    disabled={inc.status === 'Closed'}
                                    className="form-control"
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Police Incident Report ID</label>
                                  <input 
                                    type="text" 
                                    value={inc.emergencyServices.policeIncidentNo} 
                                    onChange={(e) => updateIncident({ emergencyServices: { policeIncidentNo: e.target.value } })}
                                    disabled={inc.status === 'Closed'}
                                    className="form-control"
                                  />
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="subform-card">
                            <h3>AMBULANCE & SCDF</h3>
                            <div className="form-group">
                              <label>Responder Type</label>
                              <select 
                                value={inc.emergencyServices.ambulanceScdfType} 
                                onChange={(e) => updateIncident({ emergencyServices: { ambulanceScdfType: e.target.value } })}
                                disabled={inc.status === 'Closed'}
                                className="form-control select-dark"
                              >
                                <option value="">None</option>
                                <option value="SCDF">SCDF Ambulance</option>
                                <option value="Private">Private Ambulance</option>
                              </select>
                            </div>
                            {inc.emergencyServices.ambulanceScdfType && (
                              <div className="fields">
                                <div className="form-group">
                                  <label>Call Sign</label>
                                  <input 
                                    type="text" 
                                    value={inc.emergencyServices.ambulanceCallSign} 
                                    onChange={(e) => updateIncident({ emergencyServices: { ambulanceCallSign: e.target.value } })}
                                    disabled={inc.status === 'Closed'}
                                    className="form-control"
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Hospital Conveyed To</label>
                                  <input 
                                    type="text" 
                                    value={inc.emergencyServices.hospitalConveyedTo} 
                                    onChange={(e) => updateIncident({ emergencyServices: { hospitalConveyedTo: e.target.value } })}
                                    disabled={inc.status === 'Closed'}
                                    className="form-control"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. Media tab */}
                    {activeTab === 'media' && (
                      <div className="media-tab-content">
                        <div className="subform-card">
                          <h3>MEDIA PRESENCE AT SCENE</h3>
                          <div className="checkbox-row">
                            <input 
                              type="checkbox" 
                              id="media-present" 
                              checked={inc.mediaInvolvement.mediaAtScene} 
                              onChange={(e) => handleAddMediaDetails(e.target.checked)}
                              disabled={inc.status === 'Closed'}
                            />
                            <label htmlFor="media-present">Press/Media present at the scene</label>
                          </div>
                          
                          {inc.mediaInvolvement.mediaAtScene && (
                            <div className="fields">
                              <div className="form-group">
                                <label>Media Outlet Name</label>
                                <input 
                                  type="text" 
                                  value={inc.mediaInvolvement.mediaName} 
                                  onChange={(e) => updateIncident({ mediaInvolvement: { mediaName: e.target.value } })}
                                  disabled={inc.status === 'Closed'}
                                  className="form-control"
                                />
                              </div>
                              
                              <div className="sdc-comms-prompt glass warning-prompt">
                                <p>⚠️ <strong>CRITICAL PROMPT:</strong> Media presence has been flagged. Please ensure you notify the SDC Communications Team immediately.</p>
                                <div className="checkbox-row" style={{ marginTop: '10px' }}>
                                  <input 
                                    type="checkbox" 
                                    id="comms-notified" 
                                    checked={inc.mediaInvolvement.commsNotified} 
                                    onChange={(e) => updateIncident({ mediaInvolvement: { commsNotified: e.target.checked } })}
                                    disabled={inc.status === 'Closed'}
                                  />
                                  <label htmlFor="comms-notified">Confirm SDC Comms Team Notified</label>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 4. Damage & Vehicles tab */}
                    {activeTab === 'property' && (
                      <div className="property-tab-content">
                        <div className="subform-grid">
                          <div className="subform-card">
                            <h3>SDC PROPERTY DAMAGE</h3>
                            <div className="checkbox-row">
                              <input 
                                type="checkbox" 
                                id="prop-damage" 
                                checked={inc.propertyDamage.sdcPropertyDamaged} 
                                onChange={(e) => updateIncident({ propertyDamage: { sdcPropertyDamaged: e.target.checked } })}
                                disabled={inc.status === 'Closed'}
                              />
                              <label htmlFor="prop-damage">SDC Property Damaged</label>
                            </div>
                            {inc.propertyDamage.sdcPropertyDamaged && (
                              <div className="form-group">
                                <label>Damage Description</label>
                                <textarea 
                                  value={inc.propertyDamage.description} 
                                  onChange={(e) => updateIncident({ propertyDamage: { description: e.target.value } })}
                                  disabled={inc.status === 'Closed'}
                                  className="form-control"
                                  rows={3}
                                />
                              </div>
                            )}
                          </div>
                          
                          <div className="subform-card">
                            <h3>VEHICLES INVOLVED</h3>
                            <p className="sub-desc">SDC or private guest vehicle particulars details.</p>
                            <div className="checkbox-row">
                              <input type="checkbox" id="sdc-veh" disabled />
                              <label htmlFor="sdc-veh">SDC Vehicle Involved</label>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 5. Persons Involved tab */}
                    {activeTab === 'persons' && (
                      <div className="persons-tab-content">
                        <div className="subform-grid">
                          
                          {/* Injuries Logger */}
                          <div className="subform-card">
                            <h3>PERSONAL INJURIES LOG</h3>
                            
                            {inc.status !== 'Closed' && (
                              <div className="add-log-box">
                                <div className="form-group">
                                  <label>Full Name</label>
                                  <input type="text" value={injuryName} onChange={e => setInjuryName(e.target.value)} className="form-control" />
                                </div>
                                <div className="form-group">
                                  <label>Age</label>
                                  <input type="number" value={injuryAge} onChange={e => setInjuryAge(e.target.value)} className="form-control" />
                                </div>
                                <div className="form-group">
                                  <label>Contact Number</label>
                                  <input type="text" value={injuryContact} onChange={e => setInjuryContact(e.target.value)} className="form-control" />
                                </div>
                                <div className="form-group">
                                  <label>Hospital/Clinic Conveyed</label>
                                  <input type="text" value={injuryHospital} onChange={e => setInjuryHospital(e.target.value)} className="form-control" />
                                </div>
                                
                                <div className="checkbox-row">
                                  <input type="checkbox" id="under-16" checked={injuryUnder16} onChange={e => setInjuryUnder16(e.target.checked)} />
                                  <label htmlFor="under-16">Injured person is Under 16 years old</label>
                                </div>

                                {injuryUnder16 && (
                                  <div className="under-16-fields glass">
                                    <div className="form-group">
                                      <label>Parent/Guardian Name</label>
                                      <input type="text" value={parentName} onChange={e => setParentName(e.target.value)} className="form-control" />
                                    </div>
                                    <div className="form-group">
                                      <label>Parent/Guardian Contact</label>
                                      <input type="text" value={parentContact} onChange={e => setParentContact(e.target.value)} className="form-control" />
                                    </div>
                                  </div>
                                )}
                                <button type="button" onClick={handleAddInjury} className="btn btn-primary" style={{ marginTop: '10px' }}>
                                  ADD INJURY ENTRY
                                </button>
                              </div>
                            )}

                            <div className="logged-items-list" style={{ marginTop: '20px' }}>
                              <h4>RECORDED INJURIES</h4>
                              {inc.personalInjuries.length === 0 ? (
                                <p className="empty">No injuries recorded.</p>
                              ) : (
                                inc.personalInjuries.map((inj, i) => (
                                  <div className="logged-item glass" key={i}>
                                    <div className="name">{inj.name} (Age: {inj.age}) {inj.under16 && <span className="under-16-indicator">[Under-16]</span>}</div>
                                    <div className="details">Hospital: {inj.clinicHospitalAttended || 'None'} &bull; Tel: {inj.contactNumber}</div>
                                    {inj.under16 && (
                                      <div className="guardian">Guardian: {inj.parentGuardianName} ({inj.parentGuardianContact})</div>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* General Persons Involved */}
                          <div className="subform-card">
                            <h3>OTHER PERSONS INVOLVED</h3>
                            
                            {inc.status !== 'Closed' && (
                              <div className="add-log-box">
                                <div className="form-group">
                                  <label>Person Type</label>
                                  <select value={personType} onChange={e => setPersonType(e.target.value)} className="form-control select-dark">
                                    <option value="Guest">Guest</option>
                                    <option value="Staff">Staff</option>
                                    <option value="Island Partner">Island Partner</option>
                                    <option value="Contractor">Contractor</option>
                                  </select>
                                </div>
                                <div className="form-group">
                                  <label>Full Name</label>
                                  <input type="text" value={personName} onChange={e => setPersonName(e.target.value)} className="form-control" />
                                </div>
                                <div className="form-group">
                                  <label>Contact Number</label>
                                  <input type="text" value={personContact} onChange={e => setPersonContact(e.target.value)} className="form-control" />
                                </div>
                                <div className="form-group">
                                  <label>Role/Involvement</label>
                                  <select value={personRole} onChange={e => setPersonRole(e.target.value)} className="form-control select-dark">
                                    <option value="Witness">Witness</option>
                                    <option value="Bystander">Bystander</option>
                                    <option value="Subject">Subject/Actor</option>
                                    <option value="Other">Other</option>
                                  </select>
                                </div>
                                <button type="button" onClick={handleAddPerson} className="btn btn-primary" style={{ marginTop: '10px' }}>
                                  ADD PERSON ENTRY
                                </button>
                              </div>
                            )}

                            <div className="logged-items-list" style={{ marginTop: '20px' }}>
                              <h4>RECORDED INDIVIDUALS</h4>
                              {inc.personsInvolved.length === 0 ? (
                                <p className="empty">No other persons recorded.</p>
                              ) : (
                                inc.personsInvolved.map((p, i) => (
                                  <div className="logged-item glass" key={i}>
                                    <div className="name">{p.name} ({p.type})</div>
                                    <div className="details">Role: {p.roleInvolvement} &bull; Tel: {p.contactNumber}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 6. Slave Incidents / Duplicates tab */}
                    {activeTab === 'duplicates' && (
                      <div className="duplicates-tab-content">
                        <div className="subform-grid">
                          
                          {/* Logger */}
                          <div className="subform-card">
                            <h3>LINK DUPLICATE INCIDENT (SLAVE)</h3>
                            <p className="sub-desc">Log a duplicate report for this incident. Duplicate reports are linked as slaves and do not trigger separate ranger deployments.</p>
                            
                            {inc.status !== 'Closed' ? (
                              <form onSubmit={handleAddSlaveIncident} className="add-log-box" style={{ borderStyle: 'solid', borderWidth: '1px' }}>
                                <div className="form-group">
                                  <label>Duplicate Report Title *</label>
                                  <input 
                                    type="text" 
                                    value={slaveTitle} 
                                    onChange={e => setSlaveTitle(e.target.value)} 
                                    placeholder="e.g. Another caller reporting the same bag" 
                                    required 
                                    className="form-control" 
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Reporter Name</label>
                                  <input 
                                    type="text" 
                                    value={slaveReporter} 
                                    onChange={e => setSlaveReporter(e.target.value)} 
                                    placeholder="Reporter's name or contact number" 
                                    className="form-control" 
                                  />
                                </div>
                                <div className="form-group">
                                  <label>Duplicate Incident Summary</label>
                                  <textarea 
                                    value={slaveSummary} 
                                    onChange={e => setSlaveSummary(e.target.value)} 
                                    placeholder="Brief notes from caller..." 
                                    className="form-control" 
                                    rows={3} 
                                  />
                                </div>
                                <button type="submit" className="btn btn-primary" style={{ marginTop: '10px' }}>
                                  LINK DUPLICATE REPORT
                                </button>
                              </form>
                            ) : (
                              <p className="empty">This Master Incident is Closed. No new duplicates can be linked.</p>
                            )}
                          </div>

                          {/* Records */}
                          <div className="subform-card">
                            <h3>LINKED SLAVE INCIDENTS</h3>
                            <div className="logged-items-list" style={{ marginTop: '0px' }}>
                              {!inc.slaveIncidents || inc.slaveIncidents.length === 0 ? (
                                <p className="empty">No duplicate records linked to this incident.</p>
                              ) : (
                                inc.slaveIncidents.map((s, i) => (
                                  <div className="logged-item glass" key={i} style={{ marginBottom: '12px', padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <span className="name" style={{ color: 'var(--color-primary-dark)', fontWeight: 'bold' }}>{s.id}: {s.title}</span>
                                      <span className={`badge ${s.status === 'Closed' ? 'badge-closed' : 'badge-live'}`}>
                                        {s.status}
                                      </span>
                                    </div>
                                    <div className="details" style={{ margin: '6px 0 8px 0', fontSize: '11px', color: 'var(--text-muted)' }}>
                                      Reporter: <strong>{s.reporterName}</strong> &bull; Logged: {new Date(s.dateTime).toLocaleString()}
                                    </div>
                                    {s.summary && (
                                      <p className="sub-desc" style={{ padding: '8px', background: 'var(--bg-base)', borderRadius: '4px', fontSize: '11px' }}>
                                        {s.summary}
                                      </p>
                                    )}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                        </div>
                      </div>
                    )}

                  </div>

                  {/* Ground Ranger Updates */}
                  {inc.status !== 'Closed' && (
                    <div className="ranger-activity-card glass" style={{ marginTop: '20px' }}>
                      <div className="card-header">
                        <h2>RESPONDER ACTIVITY UPDATES</h2>
                      </div>
                      <div className="ranger-activity-body">
                        <p className="activity-desc">Rangers log immediate updates on-scene (e.g. cordon established, area cleared).</p>
                        <form onSubmit={handleAppendRangerActivity} className="activity-form">
                          <input 
                            type="text" 
                            placeholder="e.g. Medical team is currently stabilizing the subject." 
                            value={rangerActivityText} 
                            onChange={(e) => setRangerActivityText(e.target.value)} 
                            className="form-control"
                          />
                          
                          <div className="quick-selects">
                            <button type="button" className="quick-btn" onClick={() => setRangerActivityText('Cordon established around the site.')}>Cordon set</button>
                            <button type="button" className="quick-btn" onClick={() => setRangerActivityText('Commenced search operations in the immediate vicinity.')}>Search started</button>
                            <button type="button" className="quick-btn" onClick={() => setRangerActivityText('First-aid administered. Subject responsive.')}>First aid done</button>
                            <button type="button" className="quick-btn" onClick={() => setRangerActivityText('Area cleared and returned to standard operational state.')}>Area cleared</button>
                          </div>
                          
                          <button type="submit" className="btn btn-secondary" style={{ marginTop: '10px' }}>
                            LOG ACTIVITY UPDATE
                          </button>
                        </form>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Tab 2: Ground Tasks */}
          {activeComponent === 'tasks' && (
            <div className="tasks-tab-content">
              <div className="tasks-list-header">
                <div>
                  <h3>Linked Ground Tasks</h3>
                  <p className="sub-desc" style={{ marginTop: '2px' }}>{tasks.length} task(s) dispatched for this Case</p>
                </div>
                {isController && caseData.status !== 'Closed' && (
                  <button className="btn btn-primary" onClick={() => setShowCreateTaskModal(true)}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '14px', height: '14px' }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    DISPATCH NEW TASK
                  </button>
                )}
              </div>

              {tasks.length === 0 ? (
                <div className="empty-component-card glass">
                  <div className="icon">📋</div>
                  <h3>No Tasks Dispatched</h3>
                  <p>No ground responder tasks are currently linked to this case folder.</p>
                  {isController && caseData.status !== 'Closed' && (
                    <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={() => setShowCreateTaskModal(true)}>
                      Dispatch First Task
                    </button>
                  )}
                </div>
              ) : (
                <div className="task-list-cards">
                  {tasks.map((t) => (
                    <div key={t.id} className="task-list-card glass" onClick={() => { setSelectedTask(t); setNewAssignee(t.assignee); }}>
                      <div className="task-info-main">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="task-title-text">{t.title}</span>
                          <span className={`badge ${
                            t.status === 'Closed' ? 'badge-closed' :
                            t.status === 'In Progress' ? 'badge-onsite' :
                            t.status === 'Acknowledged' ? 'badge-ack' : 'badge-live'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        <p className="sub-desc" style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '4px 0' }}>
                          {t.description || 'No description provided.'}
                        </p>
                        <div className="task-meta-text">
                          <span>ID: <strong>{t.id}</strong></span>
                          <span>Assignee: <strong>👤 {t.assignee}</strong></span>
                          <span>Priority: <strong>⚡ {t.priority}</strong></span>
                          {t.dueDate && (
                            <span>Due: <strong>📅 {new Date(t.dueDate).toLocaleString()}</strong></span>
                          )}
                        </div>
                      </div>
                      <div className="btn btn-secondary btn-sm" style={{ padding: '6px 12px', fontSize: '11px' }}>
                        Manage Task
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: IFM CMMS Faults */}
          {activeComponent === 'faults' && (
            <div className="faults-tab-content">
              <div className="tasks-list-header">
                <div>
                  <h3>IFM Infrastructure Faults</h3>
                  <p className="sub-desc" style={{ marginTop: '2px' }}>Linked CMMS maintenance tickets</p>
                </div>
                {caseData.cmmsTickets.length === 0 && caseData.status !== 'Closed' && (
                  <button 
                    type="button" 
                    onClick={handleCMMSCreation} 
                    disabled={cmmsLoading}
                    className="btn btn-primary"
                  >
                    {cmmsLoading ? 'LINKING...' : 'RAISE LINKED CMMS FAULT'}
                  </button>
                )}
              </div>

              {caseData.cmmsTickets.length === 0 ? (
                <div className="empty-component-card glass">
                  <div className="icon">🔧</div>
                  <h3>No Infrastructure Faults Linked</h3>
                  <p>No active CMMS tickets are raised or linked to this case folder.</p>
                  {caseData.status !== 'Closed' && (
                    <button 
                      type="button" 
                      onClick={handleCMMSCreation} 
                      disabled={cmmsLoading}
                      className="btn btn-secondary"
                      style={{ marginTop: '12px' }}
                    >
                      {cmmsLoading ? 'Raising Ticket...' : 'Raise CMMS Maintenance Ticket'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="linked-tickets-list glass" style={{ padding: '20px' }}>
                  <p className="success-txt" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="dot dot-warning" />
                    Active CMMS Tickets Linked:
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {caseData.cmmsTickets.map((t, idx) => (
                      <div className="cmms-ticket-pill" key={idx}>
                        <div>
                          <strong>{t}</strong>
                          <span className="status-lbl" style={{ marginLeft: '12px', fontSize: '11px' }}>(Active in CMMS)</span>
                        </div>
                        <span className="badge badge-ack">Active</span>
                      </div>
                    ))}
                  </div>
                  <p className="ticket-desc-meta" style={{ marginTop: '16px' }}>
                    Fault status updates are fetched via API. You may close this Case without waiting for CMMS resolution.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right column: Case Overview sidebar */}
        <div className="case-sidebar-column">
          
          {/* Active Components Overview */}
          <div className="side-card glass">
            <h3>Case Components</h3>
            <div className="info-list">
              <div className="info-item">
                <span className="label">🚨 Incident Report:</span>
                <span className="value font-semibold">
                  {inc ? (
                    <span className="badge badge-live">Active</span>
                  ) : (
                    <span className="text-muted">Not Attached</span>
                  )}
                </span>
              </div>
              <div className="info-item">
                <span className="label">📋 Ground Tasks:</span>
                <span className="value font-semibold">
                  {tasks.length > 0 ? (
                    <span className="badge badge-onsite">{tasks.length} Tasks</span>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </span>
              </div>
              <div className="info-item">
                <span className="label">🔧 CMMS Faults:</span>
                <span className="value font-semibold">
                  {caseData.cmmsTickets?.length > 0 ? (
                    <span className="badge badge-ack">{caseData.cmmsTickets.length} Linked</span>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* General Case Info */}
          <div className="side-card glass">
            <h3>CASE INFORMATION</h3>
            <div className="info-list">
              <div className="info-item">
                <span className="label">Priority:</span>
                <span className="value font-title font-semibold">{inc?.priority || 'Medium'}</span>
              </div>
              <div className="info-item">
                <span className="label">Category:</span>
                <span className="value">{inc ? `${inc.type} • ${inc.subType}` : 'General Case Folder'}</span>
              </div>
              <div className="info-item">
                <span className="label">Assigned Responder:</span>
                <span className="value font-semibold text-primary">{inc?.assignedTo || 'None'}</span>
              </div>
              {inc && (
                <div className="info-item">
                  <span className="label">Reporter:</span>
                  <span className="value">{inc.reporterName}</span>
                </div>
              )}
              {caseData.closedAt && (
                <div className="info-item">
                  <span className="label">Closed Date:</span>
                  <span className="value text-muted" style={{ fontSize: '11px' }}>{new Date(caseData.closedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Location details card */}
          <div className="side-card glass">
            <h3>LOCATION GEOGRAPHY</h3>
            {inc ? (
              <div className="info-list">
                <div className="info-item">
                  <span className="label">Common Name:</span>
                  <span className="value font-semibold">{inc.location.commonName}</span>
                </div>
                <div className="info-item">
                  <span className="label">Road:</span>
                  <span className="value">{inc.location.road}</span>
                </div>
                {inc.location.building && (
                  <div className="info-item">
                    <span className="label">Building:</span>
                    <span className="value">{inc.location.building}</span>
                  </div>
                )}
                {inc.location.levelSpace && (
                  <div className="info-item">
                    <span className="label">Level & Space:</span>
                    <span className="value">{inc.location.levelSpace}</span>
                  </div>
                )}
                <div className="info-item">
                  <span className="label">Postal Code:</span>
                  <span className="value">{inc.location.postalCode}</span>
                </div>
                <div className="info-item">
                  <span className="label">Coordinates:</span>
                  <span className="value font-mono text-muted">{inc.location.lat.toFixed(4)}, {inc.location.lng.toFixed(4)}</span>
                </div>
              </div>
            ) : (
              <div className="sidebar-empty-location text-muted" style={{ fontSize: '12px', textAlign: 'center', padding: '16px 0' }}>
                <p>General Case Container</p>
                <span style={{ fontSize: '11px', display: 'block', marginTop: '6px' }}>No geolocated incident report is linked. Location is inherited from linked tasks.</span>
              </div>
            )}
          </div>

          {/* CCTV references (only if incident is present) */}
          {inc && (
            <div className="side-card glass">
              <h3>CCTV & CAMERA REFERENCES</h3>
              <div className="camera-list">
                {inc.cctvBwc.length === 0 ? (
                  <p className="empty">No camera bookmarks logged.</p>
                ) : (
                  inc.cctvBwc.map((cam, i) => (
                    <div className="camera-item" key={i}>
                      <div className="label">Camera: {cam.cameraNumber || 'None'}</div>
                      <div className="val">Timestamp: {cam.vmsTimestamp} &bull; Bookmark: {cam.vmsBookmark || '-'}</div>
                      <div className="label" style={{ marginTop: '4px' }}>BWC (Body Cam): {cam.bwcNumber || '-'}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Combined Audit timeline */}
          <div className="side-card glass">
            <h3>CASE AUDIT TRAIL</h3>
            <div className="timeline-section" style={{ marginTop: '8px' }}>
              <div className="timeline">
                {caseData.closedAt && (
                  <div className="timeline-item">
                    <div className="timeline-dot" style={{ backgroundColor: 'var(--text-muted)' }} />
                    <div className="timeline-header">
                      <span>{new Date(caseData.closedAt).toLocaleDateString()}</span>
                    </div>
                    <div className="timeline-desc" style={{ fontSize: '11px', padding: '6px 10px' }}>Case container marked Closed.</div>
                  </div>
                )}
                {inc?.log && [...inc.log].reverse().map((entry) => (
                  <div className="timeline-item" key={entry.eventNumber}>
                    <div className="timeline-dot" />
                    <div className="timeline-header">
                      <span>{entry.date} {entry.time}</span>
                    </div>
                    <div className="timeline-desc" style={{ fontSize: '11px', padding: '6px 10px' }}>{entry.description}</div>
                  </div>
                ))}
                <div className="timeline-item">
                  <div className="timeline-dot" style={{ backgroundColor: 'var(--color-primary)' }} />
                  <div className="timeline-header">
                    <span>{new Date(caseData.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="timeline-desc" style={{ fontSize: '11px', padding: '6px 10px' }}>Case container established.</div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* MODALS */}

      {/* Assign Responder Dialog */}
      {showAssignModal && inc && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxHeight: '300px' }}>
            <div className="modal-header">
              <h2>ASSIGN FIELD RESPONDER (RANGER)</h2>
              <button className="close-btn" onClick={() => setShowAssignModal(false)}>Close</button>
            </div>
            <div className="modal-form" style={{ padding: '20px' }}>
              <div className="form-group">
                <label>Select Responder / Ranger Name</label>
                <select 
                  value={assigneeInput} 
                  onChange={(e) => setAssigneeInput(e.target.value)} 
                  className="form-control select-dark"
                >
                  <option value="">-- Choose Ranger --</option>
                  <option value="Ranger John">Ranger John (Siloso Zone)</option>
                  <option value="Ranger Sarah">Ranger Sarah (RWS Zone)</option>
                  <option value="Ranger Alex">Ranger Alex (Imbiah Zone)</option>
                  <option value="Ranger Tommy">Ranger Tommy (Cove Zone)</option>
                </select>
              </div>
              <div className="modal-actions" style={{ padding: '10px 0 0 0', background: 'none' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAssignModal(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleAssignResponder}>CONFIRM ASSIGNMENT</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Complete Ground Activities Dialog */}
      {showCompleteModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxHeight: '350px' }}>
            <div className="modal-header">
              <h2>NOTIFY GROUND COMPLETION</h2>
              <button className="close-btn" onClick={() => setShowCompleteModal(false)}>Close</button>
            </div>
            <div className="modal-form" style={{ padding: '20px' }}>
              <div className="form-group">
                <label>Ground Completion Remarks *</label>
                <textarea 
                  value={completionRemarks} 
                  onChange={(e) => setCompletionRemarks(e.target.value)} 
                  className="form-control"
                  rows={3}
                  required
                  placeholder="Summarize actions taken on ground..."
                />
              </div>
              <div className="modal-actions" style={{ padding: '10px 0 0 0', background: 'none' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCompleteModal(false)}>Cancel</button>
                <button 
                  type="button" 
                  className="btn btn-success" 
                  onClick={() => handleStatusTransition('Live (Completed)')}
                  disabled={!completionRemarks.trim()}
                >
                  SUBMIT COMPLETION
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTaskModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass">
            <div className="modal-header">
              <h2>CREATE TASK FOR CASE {caseId}</h2>
              <button className="close-btn" onClick={() => setShowCreateTaskModal(false)}>Close</button>
            </div>
            
            <form onSubmit={handleCreateTask} className="modal-form">
              <div className="modal-scroll-area">
                
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
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateTaskModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">DISPATCH TASK</button>
              </div>
            </form>
          </div>
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
                <div><strong>Parent Case:</strong> {selectedTask.caseId}</div>
                <div><strong>Priority:</strong> {selectedTask.priority}</div>
              </div>
              <div className="detail-title">{selectedTask.title}</div>
              <p className="detail-desc">{selectedTask.description || 'No description provided.'}</p>
              
              <div className="assignee-row glass">
                <div className="curr-assignee">Assigned to: <strong>{selectedTask.assignee}</strong></div>
                {/* Controller Reassign */}
                {isController && caseData.status !== 'Closed' && (
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

              {/* Status transition controls */}
              <div className="modal-actions-wrapper">
                <h4>UPDATE TASK STATE</h4>
                <div className="state-btns">
                  {selectedTask.status !== 'Closed' && caseData.status !== 'Closed' && (
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

                      {(isRanger || isController) && (
                        <button className="btn btn-success" onClick={() => handleUpdateTaskStatus(selectedTask.id, 'Closed')}>
                          Close Task (Completed)
                        </button>
                      )}
                    </>
                  )}
                  {selectedTask.status === 'Closed' && isController && caseData.status !== 'Closed' && (
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

      <style jsx>{`
        .case-detail-header-card {
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .case-detail-title-sec {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .case-id-badge {
          font-family: var(--font-title);
          font-size: 11px;
          font-weight: 800;
          color: var(--color-primary);
          letter-spacing: 0.05em;
        }

        .case-detail-title-sec h1 {
          font-family: var(--font-title);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-main);
        }

        .case-timestamp {
          font-size: 12px;
          color: var(--text-muted);
        }

        .case-status-sec {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 12px;
        }

        .status-label-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-label-group .label {
          font-size: 11px;
          color: var(--text-muted);
          font-weight: 700;
          text-transform: uppercase;
        }

        .action-button-row {
          display: flex;
          gap: 8px;
        }

        /* Component Tab Selector */
        .component-tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .comp-tab-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          color: var(--text-muted);
          font-family: var(--font-title);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s ease;
        }

        .comp-tab-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: var(--text-main);
          border-color: var(--border-color-hover);
        }

        .comp-tab-btn.active {
          background: var(--color-primary-glow);
          color: var(--color-primary-dark);
          border-color: var(--color-primary);
          box-shadow: 0 0 12px var(--color-primary-glow);
        }

        /* Split grid */
        .case-content-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
        }

        .case-main-column {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* Tabs inside Incident Tab */
        .tab-header {
          display: flex;
          border-bottom: 1px solid var(--border-color);
          padding: 0 10px;
          height: 50px;
        }

        .tab-btn {
          padding: 0 20px;
          background: none;
          border: none;
          color: var(--text-muted);
          font-family: var(--font-title);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s ease;
        }

        .tab-btn:hover {
          color: var(--text-main);
        }

        .tab-btn.active {
          color: var(--color-primary);
          border-bottom-color: var(--color-primary);
        }

        .tab-body {
          padding: 24px;
        }

        /* Empty states */
        .empty-component-card {
          padding: 60px 40px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: var(--bg-card);
          border: 1px dashed var(--border-color);
          border-radius: 12px;
        }

        .empty-component-card .icon {
          font-size: 44px;
        }

        .empty-component-card h3 {
          font-size: 16px;
          font-weight: 800;
          color: var(--text-main);
        }

        .empty-component-card p {
          font-size: 13px;
          color: var(--text-muted);
          max-width: 400px;
          line-height: 1.5;
        }

        /* Tasks specific style */
        .tasks-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          padding: 16px 20px;
          border-radius: 12px;
        }

        .tasks-list-header h3 {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }

        .task-list-cards {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .task-list-card {
          padding: 16px 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .task-list-card:hover {
          transform: translateY(-2px);
          border-color: var(--color-primary);
          box-shadow: 0 4px 12px rgba(255, 130, 0, 0.05);
        }

        .task-info-main {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex-grow: 1;
        }

        .task-title-text {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-main);
        }

        .task-meta-text {
          display: flex;
          gap: 16px;
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 4px;
          border-top: 1px dashed var(--border-color);
          padding-top: 4px;
        }

        .log-input-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 24px;
          padding-bottom: 24px;
          border-bottom: 1px solid var(--border-color);
        }

        .timeline-section h3 {
          font-size: 13px;
          color: var(--text-muted);
          margin-bottom: 16px;
          letter-spacing: 0.05em;
        }

        /* Emergency services subforms */
        .subform-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
        }

        .subform-card {
          padding: 16px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .subform-card h3 {
          font-family: var(--font-title);
          font-size: 13px;
          color: var(--color-primary);
          text-transform: uppercase;
        }

        .checkbox-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
        }

        .checkbox-row input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .warning-prompt {
          padding: 12px;
          background: rgba(255, 184, 0, 0.1) !important;
          border: 1px solid rgba(255, 184, 0, 0.3) !important;
          border-radius: 8px;
          color: var(--text-main);
          font-size: 12px;
        }

        .sub-desc {
          font-size: 12px;
          color: var(--text-muted);
        }

        /* Injuries details */
        .add-log-box {
          padding: 12px;
          border: 1px dashed var(--border-color);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .under-16-fields {
          padding: 12px;
          border-radius: 6px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .logged-items-list h4 {
          font-size: 11px;
          color: var(--text-muted);
          margin-bottom: 10px;
          letter-spacing: 0.05em;
        }

        .logged-item {
          padding: 10px 14px;
          border-radius: 8px;
          margin-bottom: 8px;
        }

        .logged-item .name {
          font-size: 13px;
          font-weight: 700;
        }

        .logged-item .details {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .under-16-indicator {
          font-size: 9px;
          background: var(--color-danger-glow);
          color: var(--color-danger);
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 6px;
        }

        .guardian {
          font-size: 10px;
          color: var(--text-muted);
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px dashed var(--border-color);
        }

        .empty {
          font-size: 12px;
          color: var(--text-muted);
          text-align: center;
          padding: 20px 0;
        }

        /* Ranger activity updater */
        .ranger-activity-card {
          padding: 20px;
        }

        .activity-desc {
          font-size: 12px;
          color: var(--text-muted);
          margin-bottom: 12px;
        }

        .activity-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .quick-selects {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .quick-btn {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-color);
          padding: 4px 10px;
          border-radius: 6px;
          color: var(--text-muted);
          font-size: 11px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .quick-btn:hover {
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255,255,255,0.2);
        }

        /* Right sidebar column */
        .case-sidebar-column {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .side-card {
          padding: 20px;
        }

        .side-card h3 {
          font-family: var(--font-title);
          font-size: 12px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 14px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 6px;
        }

        .info-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
        }

        .info-item .label {
          color: var(--text-muted);
        }

        .info-item .value {
          text-align: right;
          color: var(--text-main);
        }

        .font-semibold { font-weight: 600; }
        .font-mono { font-family: monospace; }

        .camera-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .camera-item {
          padding: 10px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-color);
          border-radius: 6px;
        }

        .camera-item .label {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-main);
        }

        .camera-item .val {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        /* CMMS Linked Fault */
        .cmms-ticket-pill {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: rgba(255, 130, 0, 0.05);
          border: 1px solid rgba(255, 130, 0, 0.15);
          border-radius: 6px;
          color: var(--text-main);
          font-family: var(--font-title);
        }

        .ticket-desc-meta {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* Modal specific overrides */
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
          max-width: 550px;
          max-height: 520px;
          display: flex;
          flex-direction: column;
          border-radius: 12px;
          overflow: hidden;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          box-shadow: 0 12px 30px rgba(0,0,0,0.15);
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
          font-weight: 700;
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
          background: var(--bg-base);
        }

        /* Task Details dialog styles */
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

        .loading-state {
          padding: 80px;
          text-align: center;
          font-weight: 600;
          color: var(--text-muted);
        }
      `}</style>
    </>
  );
}
