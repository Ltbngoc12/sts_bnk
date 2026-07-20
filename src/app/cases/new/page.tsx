'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';

import { getIncidentTaxonomy, getTaskPriorityTaxonomy } from '@/lib/taxonomy';

const NEW_CASE_CANCEL_HREF = '/case-management?tab=cases';

export default function NewCasePage() {
  const router = useRouter();
  const { username } = useRole();
  const { setDirty, setHideNav, setLeaveHref, requestLeave } = useUnsavedChanges();

  useEffect(() => {
    setHideNav(true);
    setLeaveHref(NEW_CASE_CANCEL_HREF);
    return () => {
      setHideNav(false);
      setLeaveHref(null);
      setDirty(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // General Case Metadata
  const [caseTitle, setCaseTitle] = useState('');
  const [caseStatus, setCaseStatus] = useState('Pending Triage');
  const [componentType, setComponentType] = useState('none'); // none | incident | task | fault | ediary
  const [submitting, setSubmitting] = useState(false);

  // Dynamic Incident Form States
  const [incType, setIncType] = useState('');
  const [incSubType, setIncSubType] = useState('');
  const [incPriority, setIncPriority] = useState('Normal');
  const [incReporter, setIncReporter] = useState('');
  const [incRequestedBy, setIncRequestedBy] = useState('IIOC Controller');
  const [incSummary, setIncSummary] = useState('');
  const [incRoad, setIncRoad] = useState('');
  const [incBuilding, setIncBuilding] = useState('');
  const [incLevelSpace, setIncLevelSpace] = useState('');
  const [incNearAt, setIncNearAt] = useState('');
  const [incCommonName, setIncCommonName] = useState('');
  const [incPostalCode, setIncPostalCode] = useState('');
  const [incTagsStr, setIncTagsStr] = useState('Beachfront');

  // Dynamic Task Form States
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskAssignee, setTaskAssignee] = useState('Ranger John');
  const [taskPriority, setTaskPriority] = useState('Normal');
  const [taskDueDate, setTaskDueDate] = useState('');

  // Dynamic Fault Form States
  const [faultTitle, setFaultTitle] = useState('');
  const [faultLocation, setFaultLocation] = useState('');
  const [faultSeverity, setFaultSeverity] = useState('Medium');
  const [faultDesc, setFaultDesc] = useState('');

  // Dynamic e-Diary Form States
  const [ediaryTopic, setEdiaryTopic] = useState('');
  const [ediarySpecifyTopic, setEdiarySpecifyTopic] = useState('');
  const [ediaryContent, setEdiaryContent] = useState('');

  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});
  const [taskPriorityOptions, setTaskPriorityOptions] = useState<string[]>(['Normal', 'High']);

  useEffect(() => {
    setTaxonomy(getIncidentTaxonomy());
    setTaskPriorityOptions(getTaskPriorityTaxonomy());
  }, []);

  useEffect(() => {
    setIncSubType('');
  }, [incType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseTitle.trim()) return;
    setSubmitting(true);

    try {
      let payload: any = {
        title: caseTitle,
        status: caseStatus,
        username
      };

      // If we are attaching an Incident, we embed it in the initial POST request
      if (componentType === 'incident') {
        if (!incType) {
          alert('Incident Type is required.');
          setSubmitting(false);
          return;
        }
        if (!incSubType) {
          alert('Incident Sub-Type is required.');
          setSubmitting(false);
          return;
        }
        if (!incCommonName.trim()) {
          alert('Location Common Name is required for Incident Reports.');
          setSubmitting(false);
          return;
        }

        let lat = 1.2500, lng = 103.8300;
        if (incCommonName.toLowerCase().includes('siloso')) { lat = 1.2562; lng = 103.8124; }
        else if (incCommonName.toLowerCase().includes('palawan')) { lat = 1.2520; lng = 103.8210; }
        else if (incCommonName.toLowerCase().includes('cove')) { lat = 1.2464; lng = 103.8440; }
        else if (incCommonName.toLowerCase().includes('rws') || incCommonName.toLowerCase().includes('resorts')) { lat = 1.2585; lng = 103.8210; }

        payload.status = 'Active'; // Escalated to Active on incident log
        payload.incident = {
          dateTime: new Date().toISOString(),
          type: incType,
          subType: incSubType,
          priority: incPriority,
          reporterName: incReporter || 'Anonymous Guest',
          requestedBy: incRequestedBy,
          status: 'Live',
          summary: incSummary,
          location: {
            road: incRoad,
            building: incBuilding,
            levelSpace: incLevelSpace,
            nearAt: incNearAt,
            commonName: incCommonName,
            postalCode: incPostalCode || '000000',
            tags: incTagsStr.split(',').map(t => t.trim()).filter(Boolean),
            lat,
            lng
          }
        };
      }

      // 1. Create the Case
      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!caseRes.ok) {
        const errBody = await caseRes.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to create Case container. (HTTP ${caseRes.status})`);
      }

      const newCase = await caseRes.json();
      if (!newCase) {
        throw new Error('Invalid case response.');
      }

      const caseId = newCase.id;

      // 2. Client-side orchestration for other components
      if (componentType === 'task') {
        const taskRes = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId,
            title: taskTitle || `Task: ${caseTitle}`,
            description: taskDesc,
            assignee: taskAssignee,
            priority: taskPriority,
            dueDate: taskDueDate,
            username
          })
        });
        if (!taskRes.ok) {
          console.error('Failed to attach task.');
        }
      } else if (componentType === 'fault') {
        const cmmsRes = await fetch('/api/cmms-mock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: faultLocation || 'Sentosa Island',
            description: faultDesc || faultTitle || caseTitle,
            severity: faultSeverity
          })
        });

        if (cmmsRes.ok) {
          const cmmsData = await cmmsRes.json();
          await fetch(`/api/cases/${caseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmmsTicketId: cmmsData.ticketId })
          });
        }
      } else if (componentType === 'ediary') {
        const finalTopic = ediaryTopic === 'Others' ? ediarySpecifyTopic : ediaryTopic;
        const occRes = await fetch('/api/occurrences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: finalTopic || 'General Interaction',
            content: ediaryContent,
            username
          })
        });
        if (!occRes.ok) {
          console.error('Failed to attach e-Diary log.');
        }
      }

      // 3. Redirect back to Cases Registry Log
      setDirty(false);
      router.push(`/cases/${caseId}`);

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'An error occurred during case creation.');
      setSubmitting(false);
    }
  };

  return (
    <div className="page-content">
      <div className="page-header-bar glass">
        <div className="title-section">
          <h1>CREATE NEW CASE CONTAINER</h1>
          <p>Initialize a master operational case and dynamically log an associated operational workflow</p>
        </div>
      </div>

      <div className="glass" style={{ padding: '2rem', marginTop: '1rem' }}>
        <form onSubmit={handleSubmit} className="modal-form" onChangeCapture={() => setDirty(true)}>
          <h3 className="section-title">Case Metadata</h3>
          <div className="form-grid">
            <div className="form-group colspan-2">
              <label>Case Title *</label>
              <input
                type="text"
                placeholder="e.g. Siloso Beach Security Incident Log"
                value={caseTitle}
                onChange={(e) => setCaseTitle(e.target.value)}
                required
                className="form-control"
              />
            </div>

            <div className="form-group colspan-2">
              <label>Link Component on Creation</label>
              <select
                value={componentType}
                onChange={(e) => {
                  const val = e.target.value;
                  setComponentType(val);
                  if (val === 'incident' || val === 'fault' || val === 'task') {
                    setCaseStatus('Active');
                  } else {
                    setCaseStatus('Pending Triage');
                  }
                }}
                className="form-control select-dark"
              >
                <option value="none">None (General Case Container)</option>
                <option value="incident">🚨 Security/Safety Incident Report</option>
                <option value="task">🔧 Operational Task Dispatch</option>
                <option value="fault">🛠 IFM Infrastructure Fault (CMMS)</option>
                <option value="ediary">📝 e-Diary Occurrence Log</option>
              </select>
            </div>
          </div>

          {/* DYNAMIC COMPONENT SUB-FORMS */}
          {componentType === 'incident' && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h3 className="section-title" style={{ color: 'var(--color-critical)' }}>Incident Details</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Incident Type *</label>
                  <select value={incType} onChange={(e) => setIncType(e.target.value)} className="form-control select-dark" required>
                    <option value="">-- Select Type --</option>
                    {Object.keys(taxonomy).sort().map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Incident Sub-Type *</label>
                  <select value={incSubType} onChange={(e) => setIncSubType(e.target.value)} disabled={!incType} className="form-control select-dark" required>
                    <option value="">-- Select Sub-Type --</option>
                    {incType && taxonomy[incType]?.sort().map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Priority</label>
                  <select value={incPriority} onChange={(e) => setIncPriority(e.target.value)} className="form-control select-dark">
                    <option value="High">High</option>
                    <option value="Normal">Normal</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Requested By</label>
                  <select value={incRequestedBy} onChange={(e) => setIncRequestedBy(e.target.value)} className="form-control select-dark">
                    <option value="IIOC Controller">IIOC Controller</option>
                    <option value="Guest Call-in">Guest Call-in (Hotline)</option>
                    <option value="Ranger Field Patrol">Ranger Field Patrol</option>
                    <option value="State Agency (SCDF/SPF)">State Agency (SCDF/SPF)</option>
                  </select>
                </div>

                <div className="form-group colspan-2">
                  <label>Reporter Details</label>
                  <input
                    type="text"
                    placeholder="Reporter Name / Contact Details"
                    value={incReporter}
                    onChange={(e) => setIncReporter(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <h3 className="section-title" style={{ marginTop: '20px' }}>Incident Location</h3>
              <div className="form-grid">
                <div className="form-group">
                  <label>Common Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Siloso Lifeguard Post 2"
                    value={incCommonName}
                    onChange={(e) => setIncCommonName(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Road Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. Siloso Beach Walk"
                    value={incRoad}
                    onChange={(e) => setIncRoad(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Building Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Emerald Pavilion"
                    value={incBuilding}
                    onChange={(e) => setIncBuilding(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Level & Space</label>
                  <input
                    type="text"
                    placeholder="e.g. Near public shower block"
                    value={incLevelSpace}
                    onChange={(e) => setIncLevelSpace(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Postal Code</label>
                  <input
                    type="text"
                    placeholder="e.g. 098997"
                    value={incPostalCode}
                    onChange={(e) => setIncPostalCode(e.target.value)}
                    maxLength={6}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Beside / Near Qualifier</label>
                  <input
                    type="text"
                    placeholder="e.g. Beside the main beach bench"
                    value={incNearAt}
                    onChange={(e) => setIncNearAt(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group colspan-2">
                  <label>Location Tags (Comma separated)</label>
                  <input
                    type="text"
                    placeholder="Beachfront, Siloso Zone"
                    value={incTagsStr}
                    onChange={(e) => setIncTagsStr(e.target.value)}
                    className="form-control"
                  />
                </div>
              </div>

              <h3 className="section-title" style={{ marginTop: '20px' }}>Incident Details</h3>
              <div className="form-group">
                <label>Initial Description</label>
                <textarea
                  rows={3}
                  placeholder="Provide details on the security or safety incident..."
                  value={incSummary}
                  onChange={(e) => setIncSummary(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>
          )}

          {componentType === 'task' && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h3 className="section-title" style={{ color: 'var(--color-active)' }}>Task Dispatch Details</h3>
              <div className="form-group">
                <label>Task Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Escort contractor to Siloso substation"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  required
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label>Task Description</label>
                <textarea
                  placeholder="Provide details on ground activities needed..."
                  value={taskDesc}
                  onChange={(e) => setTaskDesc(e.target.value)}
                  className="form-control"
                  rows={3}
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Assignee (Ranger / Staff)</label>
                  <select
                    value={taskAssignee}
                    onChange={(e) => setTaskAssignee(e.target.value)}
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
                    onChange={(e) => setTaskPriority(e.target.value)}
                    className="form-control select-dark"
                  >
                    {taskPriorityOptions.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Due Date & Time (Target completion)</label>
                <input
                  type="datetime-local"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="form-control"
                />
              </div>
            </div>
          )}

          {componentType === 'fault' && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h3 className="section-title" style={{ color: 'var(--color-high)' }}>IFM Infrastructure Fault details</h3>
              <div className="form-group">
                <label>Fault Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Broken wooden deck step near Siloso Walk"
                  value={faultTitle}
                  onChange={(e) => setFaultTitle(e.target.value)}
                  required
                  className="form-control"
                />
              </div>

              <div className="form-group">
                <label>Location Specifics *</label>
                <input
                  type="text"
                  placeholder="e.g. Near Siloso Lifeguard Post 1, beach walkway"
                  value={faultLocation}
                  onChange={(e) => setFaultLocation(e.target.value)}
                  required
                  className="form-control"
                />
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label>Severity Level</label>
                  <select
                    value={faultSeverity}
                    onChange={(e) => setFaultSeverity(e.target.value)}
                    className="form-control select-dark"
                  >
                    <option value="High">High (Immediate Response)</option>
                    <option value="Medium">Medium (Routine)</option>
                    <option value="Low">Low (Advisory)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Fault Narrative / Details</label>
                <textarea
                  placeholder="Describe the defect, impact, and immediate safety mitigation taken..."
                  value={faultDesc}
                  onChange={(e) => setFaultDesc(e.target.value)}
                  className="form-control"
                  rows={3}
                />
              </div>
            </div>
          )}

          {componentType === 'ediary' && (
            <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
              <h3 className="section-title" style={{ color: 'var(--color-review)' }}>e-Diary Occurrence log details</h3>
              <div className="form-group">
                <label>Occurrence Topic/Subject *</label>
                <select
                  value={ediaryTopic}
                  onChange={(e) => setEdiaryTopic(e.target.value)}
                  required
                  className="form-control select-dark"
                >
                  <option value="">-- Select Topic --</option>
                  <option value="VIP Visit Advisory">VIP Visit Advisory</option>
                  <option value="Routine Siren Testing">Routine Siren Testing</option>
                  <option value="Ranger Shift Handover">Ranger Shift Handover</option>
                  <option value="General Public Interaction">General Public Interaction</option>
                  <option value="Coordinated Drill/Exercise">Coordinated Drill/Exercise</option>
                  <option value="Lost and Found Report">Lost and Found Report</option>
                  <option value="Contractor Access Granted">Contractor Access Granted</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              {ediaryTopic === 'Others' && (
                <div className="form-group">
                  <label>Specify Custom Topic *</label>
                  <input
                    type="text"
                    placeholder="e.g. Unusual weather advisory"
                    value={ediarySpecifyTopic}
                    onChange={(e) => setEdiarySpecifyTopic(e.target.value)}
                    required
                    className="form-control"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Content / Narrative Log *</label>
                <textarea
                  placeholder="Describe the routine check, advisory, or interaction details here..."
                  value={ediaryContent}
                  onChange={(e) => setEdiaryContent(e.target.value)}
                  required
                  className="form-control"
                  rows={5}
                />
              </div>
            </div>
          )}

          <div className="modal-actions" style={{ marginTop: '2rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => requestLeave(() => router.push(NEW_CASE_CANCEL_HREF))}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating Case...' : 'CREATE CASE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
