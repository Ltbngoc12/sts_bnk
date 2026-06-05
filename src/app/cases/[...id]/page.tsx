'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  const [activeTab, setActiveTab] = useState<'log' | 'services' | 'media' | 'property' | 'persons'>('log');
  
  // Interactive action states
  const [newLogText, setNewLogText] = useState('');
  const [rangerActivityText, setRangerActivityText] = useState('');
  const [assigneeInput, setAssigneeInput] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [cmmsLoading, setCmmsLoading] = useState(false);
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  // Sub-form additions
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

  useEffect(() => {
    if (caseId) {
      fetchCaseDetails();
    }
  }, [caseId]);

  const fetchCaseDetails = async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}`);
      if (res.ok) {
        setCaseData(await res.json());
      } else {
        console.error('Case not found');
      }
    } catch (err) {
      console.error('Error fetching case:', err);
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
          location: caseData.incident?.location.commonName || caseData.incident?.location.road,
          description: caseData.incident?.summary
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
          // Log CMMS event
          await updateIncident({
            newLogEntry: `CMMS Ticket raised in external IFM system: ID ${data.ticketId}. Linkage established on Case.`
          });
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

  if (loading) {
    return <div className="loading-state glass">Loading Case Details...</div>;
  }

  if (!caseData || !caseData.incident) {
    return <div className="loading-state glass text-danger">Case registry not found or does not contain an active incident.</div>;
  }

  const inc = caseData.incident;

  // Determine button displays based on the FRD Role and Status action matrix (FRD 3.4.1)
  const isRanger = role === 'Responder (Ranger)';
  const isController = role === 'Controller' || role === 'System Administrator';
  const isManager = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';

  return (
    <>
      {/* Top Header Grid */}
      <div className="case-detail-header-card glass">
        <div className="case-detail-title-sec">
          <div className="case-id-badge">CASE ID: {caseData.id}</div>
          <h1>{caseData.title}</h1>
          <p className="case-timestamp">
            Logged At: {new Date(caseData.createdAt).toLocaleString()} &bull; Created By: {inc.createdBy}
          </p>
        </div>

        <div className="case-status-sec">
          <div className="status-label-group">
            <span className="label">Workflow State:</span>
            <span className={`badge ${
              inc.status === 'Live' ? 'badge-live' :
              inc.status === 'Live (Acknowledged)' ? 'badge-ack' :
              inc.status === 'Live (On-Site)' ? 'badge-onsite' :
              inc.status === 'Live (Completed)' ? 'badge-completed' :
              inc.status === 'Pending Review' ? 'badge-review' : 'badge-closed'
            }`}>
              {inc.status}
            </span>
          </div>

          {/* Interactive State transitions */}
          <div className="action-button-row">
            
            {/* RANGER FLOW (FRD 3.4.1) */}
            {isRanger && inc.status === 'Live' && (
              <button className="btn btn-primary" onClick={() => handleStatusTransition('Live (Acknowledged)')}>
                ACKNOWLEDGE ASSIGNMENT
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
            {role === 'System Administrator' && inc.status === 'Closed' && (
              <button className="btn btn-secondary" onClick={handleReopen}>
                REOPEN INCIDENT
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main split grid */}
      <div className="case-content-grid">
        
        {/* Left column: Logs & details tabs */}
        <div className="case-main-column">
          
          <div className="tab-header glass">
            <button className={`tab-btn ${activeTab === 'log' ? 'active' : ''}`} onClick={() => setActiveTab('log')}>INCIDENT LOG</button>
            <button className={`tab-btn ${activeTab === 'services' ? 'active' : ''}`} onClick={() => setActiveTab('services')}>EMERGENCY SERVICES</button>
            <button className={`tab-btn ${activeTab === 'media' ? 'active' : ''}`} onClick={() => setActiveTab('media')}>MEDIA</button>
            <button className={`tab-btn ${activeTab === 'property' ? 'active' : ''}`} onClick={() => setActiveTab('property')}>DAMAGE & VEHICLES</button>
            <button className={`tab-btn ${activeTab === 'persons' ? 'active' : ''}`} onClick={() => setActiveTab('persons')}>PERSONS INVOLVED</button>
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
                      
                      {/* SDC Comms prompt (FRD 5.3.5) */}
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
                    {/* Simplified vehicle entry representation */}
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

          </div>

          {/* Ranger specific Activity updates section (FRD 5.6.3) */}
          {inc.status !== 'Closed' && (
            <div className="ranger-activity-card glass">
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
                  
                  {/* Quick-select helper options */}
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

        </div>

        {/* Right column: Attributes, CMMS link, CCTV references */}
        <div className="case-sidebar-column">
          
          {/* Metadata Card */}
          <div className="side-card glass">
            <h3>CASE INFORMATION</h3>
            <div className="info-list">
              <div className="info-item">
                <span className="label">Priority:</span>
                <span className="value font-title font-semibold">{inc.priority}</span>
              </div>
              <div className="info-item">
                <span className="label">Category:</span>
                <span className="value">{inc.type} &bull; {inc.subType}</span>
              </div>
              <div className="info-item">
                <span className="label">Assigned Ranger:</span>
                <span className="value font-semibold text-primary">{inc.assignedTo || 'Unassigned'}</span>
              </div>
              <div className="info-item">
                <span className="label">Reporter:</span>
                <span className="value">{inc.reporterName}</span>
              </div>
            </div>
          </div>

          {/* Location details card */}
          <div className="side-card glass">
            <h3>LOCATION GEOGRAPHY</h3>
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
          </div>

          {/* CCTV & BWC card */}
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

          {/* Linked Fault / CMMS ticket (FRD 5.9 & 6.2) */}
          <div className="side-card glass">
            <h3>LINKED CMMS FAULT</h3>
            <div className="cmms-card-content">
              {caseData.cmmsTickets.length === 0 ? (
                <div className="no-faults-state">
                  <p>No active infrastructure faults linked to this case.</p>
                  {inc.status !== 'Closed' && (
                    <button 
                      type="button" 
                      onClick={handleCMMSCreation} 
                      disabled={cmmsLoading}
                      className="btn btn-primary btn-full"
                      style={{ marginTop: '10px', width: '100%' }}
                    >
                      {cmmsLoading ? 'LINKING...' : 'RAISE LINKED CMMS FAULT'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="linked-tickets-list">
                  <p className="success-txt">Linked CMMS Tickets:</p>
                  {caseData.cmmsTickets.map((t, idx) => (
                    <div className="cmms-ticket-pill" key={idx}>
                      <span className="dot dot-warning" />
                      <strong>{t}</strong>
                      <span className="status-lbl">(Active in CMMS)</span>
                    </div>
                  ))}
                  <p className="ticket-desc-meta">Fault status updates are fetched via API. You may close this Case without waiting for CMMS resolution.</p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Assign Responder Dialog */}
      {showAssignModal && (
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
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
        }

        .action-button-row {
          display: flex;
          gap: 8px;
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

        /* Tabs */
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
        .cmms-card-content {
          font-size: 13px;
          color: var(--text-muted);
        }

        .no-faults-state p {
          margin-bottom: 10px;
        }

        .linked-tickets-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .success-txt {
          color: var(--color-accent);
          font-weight: 600;
        }

        .cmms-ticket-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255, 184, 0, 0.08);
          border: 1px solid rgba(255, 184, 0, 0.2);
          border-radius: 6px;
          color: var(--text-main);
          font-family: var(--font-title);
        }

        .dot-warning {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--color-warning);
          box-shadow: 0 0 6px var(--color-warning);
        }

        .status-lbl {
          font-size: 10px;
          color: var(--text-muted);
          margin-left: auto;
        }

        .ticket-desc-meta {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 6px;
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
          max-width: 500px;
          max-height: 400px;
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
          padding: 20px;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          margin-top: 16px;
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
