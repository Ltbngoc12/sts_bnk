'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Incident, 
  Case, 
  PersonalInjury, 
  PersonInvolved, 
  Task, 
  Fault, 
  BroadcastRecord, 
  Occurrence 
} from '@/lib/db';
import { useRole } from '@/context/RoleContext';

interface HydratedIncident extends Incident {
  relatedTasks?: Task[];
  relatedFaults?: Fault[];
  relatedBroadcasts?: BroadcastRecord[];
  relatedOccurrences?: Occurrence[];
}

// Helper: incident status → badge class
function incBadgeClass(status: string) {
  switch (status) {
    case 'Live':
      return 'badge badge-live';
    case 'Live (Assigned)':
      return 'badge badge-ack';
    case 'Live (Acknowledged)':
      return 'badge badge-ack';
    case 'Live (On-Site)':
      return 'badge badge-onsite';
    case 'Live (Incomplete)':
      return 'badge badge-live';
    case 'Live (Completed)':
      return 'badge badge-completed';
    case 'Pending Endorsement':
      return 'badge badge-review';
    case 'Returned':
      return 'badge badge-live';
    case 'Closed':
      return 'badge badge-closed';
    default:
      return 'badge badge-closed';
  }
}

export default function IncidentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { role, username } = useRole();

  const idArray = params?.id as string[] || [];
  const incidentId = idArray.join('/');

  const [incident, setIncident] = useState<HydratedIncident | null>(null);
  const [parentCase, setParentCase] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [newLogText, setNewLogText] = useState('');
  const [rangerActivityText, setRangerActivity] = useState('');
  const [composerAttachments, setComposerAttachments] = useState<string[]>([]);

  // Modals & Inline Inputs
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [assigneeInput, setAssigneeInput] = useState('');
  const [completionRemarks, setCompletionRemarks] = useState('');
  const [reviewRemarks, setReviewRemarks] = useState('');

  // Persons / Injuries Forms
  const [injName, setInjName] = useState('');
  const [injAge, setInjAge] = useState('');
  const [injContact, setInjContact] = useState('');
  const [injHospital, setInjHospital] = useState('');
  const [injU16, setInjU16] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentTel, setParentTel] = useState('');

  const [pType, setPType] = useState('Guest');
  const [pName, setPName] = useState('');
  const [pContact, setPContact] = useState('');
  const [pRole, setPRole] = useState('Witness');

  // Slave Incident Form
  const [slaveTitle, setSlaveTitle] = useState('');
  const [slaveReporter, setSlaveReporter] = useState('');
  const [slaveSummary, setSlaveSummary] = useState('');

  // Collapsible Left Panel sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    cctv: false,
    emergency: false,
    media: false,
    property: false,
    persons: false,
    duplicates: false,
  });

  // Timers/Age calculations
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [elapsedDays, setElapsedDays] = useState(0);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      filesArray.forEach(file => {
        if (file.size > 1.5 * 1024 * 1024) {
          alert('Image size exceeds 1.5MB. Please choose a smaller image.');
          return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setComposerAttachments(prev => [...prev, event.target!.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const fetchIncidentData = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (res.ok) {
        const incData: HydratedIncident = await res.json();
        setIncident(incData);

        // Fetch parent Case details
        const caseRes = await fetch(`/api/cases/${incData.caseId}`);
        if (caseRes.ok) {
          setParentCase(await caseRes.json());
        }
      }
    } catch (err) {
      console.error('Failed to load incident details:', err);
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (incidentId) fetchIncidentData();
  }, [incidentId, fetchIncidentData]);

  // Track elapsed time since incident occurred
  useEffect(() => {
    if (!incident) return;
    const calculateTime = () => {
      const occurrenceTime = new Date(incident.dateTime).getTime();
      const diffMs = Date.now() - occurrenceTime;
      setElapsedMinutes(Math.floor(diffMs / (60 * 1000)));
      setElapsedDays(Math.floor(diffMs / (24 * 60 * 60 * 1000)));
    };
    calculateTime();
    const timer = setInterval(calculateTime, 15000); // Update every 15s
    return () => clearInterval(timer);
  }, [incident]);

  // Action POST handlers
  async function performAction(actionName: string, payload: Record<string, any> = {}) {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/${actionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username, role }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(`Action failed: ${err.error}`);
        return false;
      }
      await fetchIncidentData();
      return true;
    } catch (err: any) {
      alert(`Request error: ${err.message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  // Ancillary field PUT updates
  async function updateFields(payload: Record<string, any>) {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, username }),
      });
      if (res.ok) {
        await fetchIncidentData();
      }
    } catch (err) {
      console.error('Failed to update fields:', err);
    } finally {
      setSaving(false);
    }
  }

  const handleAssign = async () => {
    if (!assigneeInput.trim()) return;
    const ok = await performAction('assign', { assignedTo: assigneeInput });
    if (ok) {
      setAssigneeInput('');
    }
  };

  const handleComplete = async () => {
    if (!completionRemarks.trim()) return;
    const ok = await performAction('complete', { completionRemarks });
    if (ok) {
      setCompletionRemarks('');
      setShowCompleteModal(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container glass">
        <div className="spinner" />
        <span>Loading Incident Details…</span>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--color-critical)' }}>
        Incident not found.
      </div>
    );
  }

  const isRanger = role === 'Responder (Ranger)';
  const isCtrl = role === 'Controller' || role === 'System Administrator';
  const isMgr = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';
  const isAdmin = role === 'System Administrator';
  const isClosed = incident.status === 'Closed';

  // Warnings / Reminder Triggers
  const showCrisisReviewReminder = elapsedMinutes >= 45 && incident.status !== 'Closed';
  const showAgeingWarning = elapsedDays >= 12 && elapsedDays < 14 && incident.status !== 'Closed';
  const showAgeingEscalation = elapsedDays >= 14 && incident.status !== 'Closed';

  // Helper styles for timeline events
  const getEventIcon = (type: string) => {
    switch (type) {
      case 'creation': return '🛠';
      case 'assignment': return '👤';
      case 'acknowledgement': return '🔔';
      case 'onsite': return '📍';
      case 'update': return '📝';
      case 'broadcast': return '📡';
      case 'closure': return '🔒';
      default: return '•';
    }
  };

  const getEventBgColor = (type: string) => {
    switch (type) {
      case 'creation': return 'var(--color-info-bg)';
      case 'assignment': return 'var(--color-high-bg)';
      case 'acknowledgement': return 'var(--color-high-bg)';
      case 'onsite': return 'var(--color-active-bg)';
      case 'update': return 'var(--bg-inset)';
      case 'broadcast': return 'var(--color-review-bg)';
      case 'closure': return 'var(--color-active-bg)';
      default: return 'var(--bg-inset)';
    }
  };

  const getEventBorderColor = (type: string) => {
    switch (type) {
      case 'creation': return 'var(--color-info-border)';
      case 'assignment': return 'var(--color-high-border)';
      case 'acknowledgement': return 'var(--color-high-border)';
      case 'onsite': return 'var(--color-active-border)';
      case 'update': return 'var(--border-color)';
      case 'broadcast': return 'var(--color-review-border)';
      case 'closure': return 'var(--color-active-border)';
      default: return 'var(--border-color)';
    }
  };

  const getEventTextColor = (type: string) => {
    switch (type) {
      case 'creation': return 'var(--color-info)';
      case 'assignment': return 'var(--color-high)';
      case 'acknowledgement': return 'var(--color-high)';
      case 'onsite': return 'var(--color-active)';
      case 'update': return 'var(--text-muted)';
      case 'broadcast': return 'var(--color-review)';
      case 'closure': return 'var(--color-active)';
      default: return 'var(--text-main)';
    }
  };

  // Compile unified operational timeline events
  const getTimelineEvents = () => {
    const events: {
      type: 'creation' | 'assignment' | 'acknowledgement' | 'onsite' | 'update' | 'broadcast' | 'closure';
      timestamp: string;
      title: string;
      description: string;
      actor?: string;
      attachments?: string[];
    }[] = [];

    // 1. Creation
    if (incident.dateTime) {
      events.push({
        type: 'creation',
        timestamp: incident.dateTime,
        title: 'Incident Created',
        description: `Incident logged under ID ${incident.id} (Case ID ${incident.caseId}). Title: "${incident.title}"`,
        actor: incident.createdBy,
        attachments: []
      });
    }

    // 2. Incident logs
    incident.log.forEach(entry => {
      const entryTimeStr = `${entry.date}T${entry.time}`;
      const desc = entry.description;
      const lowerDesc = desc.toLowerCase();
      const attachments = (entry as any).attachments || [];

      if (lowerDesc.includes('responder assigned:')) {
        events.push({
          type: 'assignment',
          timestamp: entryTimeStr,
          title: 'Responder Assigned',
          description: desc,
          actor: entry.recordedBy || 'System',
          attachments
        });
      } else if (lowerDesc.includes('acknowledged dispatch')) {
        events.push({
          type: 'acknowledgement',
          timestamp: incident.acknowledgedAt || entryTimeStr,
          title: 'Dispatch Acknowledged',
          description: desc,
          actor: incident.assignedTo || entry.recordedBy,
          attachments
        });
      } else if (lowerDesc.includes('confirmed arrival on-site')) {
        events.push({
          type: 'onsite',
          timestamp: incident.onSiteAt || entryTimeStr,
          title: 'Arrived On-Site',
          description: desc,
          actor: incident.assignedTo || entry.recordedBy,
          attachments
        });
      } else if (lowerDesc.includes('approved and closed')) {
        events.push({
          type: 'closure',
          timestamp: incident.closedAt || entryTimeStr,
          title: 'Incident Closed & Endorsed',
          description: desc,
          actor: entry.recordedBy,
          attachments
        });
      } else {
        events.push({
          type: 'update',
          timestamp: entryTimeStr,
          title: desc.startsWith('[Ranger Log]') ? 'Ranger Activity Update' : desc.startsWith('[MANUAL]') ? 'Chronological Log Entry' : 'Workflow Milestone',
          description: desc,
          actor: entry.recordedBy || 'System',
          attachments
        });
      }
    });

    // 3. Broadcast Activities
    if (incident.relatedBroadcasts) {
      incident.relatedBroadcasts.forEach(b => {
        events.push({
          type: 'broadcast',
          timestamp: b.sentAt,
          title: `Broadcast Dispatched (${b.type || 'Notice'})`,
          description: `Template: ${b.templateUsed || (b as any).templateName || 'Standard'} | Recipients: ${(Array.isArray(b.recipients) ? b.recipients : [(b as any).recipientGroup || '']).filter(Boolean).join(', ')} | Status: ${b.status} ${b.lastErrorMessage ? `(Err: ${b.lastErrorMessage})` : ''}`,
          actor: b.sentBy
        });
      });
    }

    // Sort: newest first
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const timelineEvents = getTimelineEvents();

  // Collapsible accordion badge helper calculations
  const getCctvBadge = () => {
    return incident.cctvBwc && incident.cctvBwc.length > 0 ? `${incident.cctvBwc.length} Cam` : 'None';
  };

  const getEmergencyBadge = () => {
    let details = [];
    if (incident.emergencyServices.policeAtScene) details.push('Police');
    if (incident.emergencyServices.ambulanceScdfType) details.push(incident.emergencyServices.ambulanceScdfType);
    return details.length > 0 ? details.join(' + ') : 'None';
  };

  const getMediaBadge = () => {
    return incident.mediaInvolvement.mediaAtScene ? 'Media Scene' : 'None';
  };

  const getPropertyBadge = () => {
    return incident.propertyDamage.sdcPropertyDamaged ? 'Damaged' : 'None';
  };

  const getPersonsBadge = () => {
    const inj = incident.personalInjuries?.length || 0;
    const oth = incident.personsInvolved?.length || 0;
    if (inj > 0 || oth > 0) {
      return `${inj} Inj / ${oth} Ppl`;
    }
    return 'None';
  };

  const getDuplicatesBadge = () => {
    return incident.slaveIncidents && incident.slaveIncidents.length > 0 ? `${incident.slaveIncidents.length} DUP` : 'None';
  };

  return (
    <div className="page-content">
      {/* CSS overrides specific to this 3-column layout */}
      <style>{`
        .incident-detail-grid {
          display: grid;
          grid-template-columns: 390px 1fr 345px;
          gap: 20px;
          align-items: start;
          margin-top: 1rem;
        }
        @media (max-width: 1250px) {
          .incident-detail-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 850px) {
          .incident-detail-grid {
            grid-template-columns: 1fr;
          }
        }
        
        /* Overview Panel */
        .overview-card {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .overview-section-title {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
          border-bottom: 1px dashed var(--border-color);
          padding-bottom: 4px;
        }

        /* Collapsible accordion */
        .accordion-container {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          overflow: hidden;
          background: var(--bg-card);
        }
        .accordion-item {
          border-bottom: 1px solid var(--border-color);
        }
        .accordion-item:last-child {
          border-bottom: none;
        }
        .accordion-header {
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          background-color: var(--bg-card);
          transition: background-color 0.15s ease;
          user-select: none;
        }
        .accordion-header:hover {
          background-color: var(--bg-hover);
        }
        .accordion-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .accordion-title {
          margin: 0;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-main);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .accordion-badge {
          padding: 2px 7px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          border: 1px solid transparent;
        }
        .accordion-badge.none {
          background-color: var(--bg-inset);
          color: var(--text-muted);
          border-color: var(--border-color);
        }
        .accordion-badge.active {
          background-color: var(--color-info-bg);
          color: var(--color-info);
          border-color: var(--color-info-border);
        }
        .accordion-badge.warning {
          background-color: var(--color-high-bg);
          color: var(--color-high);
          border-color: var(--color-high-border);
        }
        .accordion-badge.critical {
          background-color: var(--color-critical-bg);
          color: var(--color-critical);
          border-color: var(--color-critical-border);
        }
        .accordion-content {
          padding: 16px;
          background-color: var(--bg-card);
          border-top: 1px solid var(--border-color);
        }

        /* Timeline Feed */
        .timeline-feed-card {
          padding: 20px;
        }
        .timeline-container {
          display: flex;
          flex-direction: column;
          padding-left: 10px;
        }
        .timeline-node {
          display: flex;
          gap: 16px;
          margin-bottom: 22px;
          position: relative;
        }
        .timeline-node:last-child {
          margin-bottom: 0;
        }
        .timeline-line {
          position: absolute;
          left: 17px;
          top: 36px;
          bottom: -22px;
          width: 2px;
          background: var(--border-color);
        }
        .timeline-icon-container {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
          flex-shrink: 0;
          font-size: 14px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        .timeline-content-card {
          flex-grow: 1;
          min-width: 0;
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 12px 16px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
          position: relative;
          transition: border-color 0.15s ease;
        }
        .timeline-content-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          border-radius: var(--radius-md) 0 0 var(--radius-md);
        }
        .timeline-content-card.creation::before { background-color: var(--color-info); }
        .timeline-content-card.assignment::before { background-color: var(--color-high); }
        .timeline-content-card.acknowledgement::before { background-color: var(--color-high); }
        .timeline-content-card.onsite::before { background-color: var(--color-active); }
        .timeline-content-card.update::before { background-color: var(--color-closed); }
        .timeline-content-card.broadcast::before { background-color: var(--color-review); }
        .timeline-content-card.closure::before { background-color: #10B981; }

        .timeline-content-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 4px;
        }
        .timeline-title {
          font-weight: 700;
          font-size: 13px;
          color: var(--text-main);
        }
        .timeline-timestamp {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-faint);
        }
        .timeline-body {
          font-size: 12.5px;
          color: var(--text-sub);
          line-height: 1.45;
          word-break: break-word;
        }
        .timeline-footer {
          font-size: 10px;
          color: var(--text-faint);
          margin-top: 4px;
          text-align: right;
        }

        /* Feed Composer Card */
        .composer-card {
          padding: 16px;
        }
        .composer-textarea {
          min-height: 60px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 8px 12px;
          font-size: 13px;
          resize: vertical;
          background: var(--bg-card);
          color: var(--text-main);
          outline: none;
          width: 100%;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .composer-textarea:focus {
          border-color: var(--border-focus);
          box-shadow: 0 0 0 3px rgba(255, 130, 0, 0.1);
        }

        /* Right Console Layout */
        .console-card {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .console-section-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        .related-list-section {
          margin-top: 16px;
          border-top: 1px solid var(--border-color);
          padding-top: 16px;
        }
        .related-list-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .related-count-badge {
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: 4px;
          padding: 1px 6px;
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .related-item-row {
          display: flex;
          flex-direction: column;
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 8px 10px;
          margin-bottom: 6px;
          font-size: 12px;
          text-decoration: none;
          color: inherit;
          transition: border-color 0.15s ease, background-color 0.15s ease;
        }
        .related-item-row:hover {
          border-color: var(--border-color-hover);
          background-color: var(--bg-hover);
        }
        .related-item-row-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 3px;
        }
      `}</style>

      {/* Ageing & Warning Alerts */}
      {showAgeingWarning && (
        <div className="alert-banner warning-banner glass" style={{ marginBottom: '10px' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span><strong>Day 12 Warning:</strong> Incident has been open for {elapsedDays} days. Please expedite review.</span>
        </div>
      )}
      {showAgeingEscalation && (
        <div className="alert-banner escalation-banner glass" style={{ marginBottom: '10px' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <span><strong>Day 14 Escalation:</strong> Critical status. Incident has been open for {elapsedDays} days. Escalated to Management.</span>
        </div>
      )}
      {showCrisisReviewReminder && (
        <div className="alert-banner info-banner glass" style={{ marginBottom: '10px' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
          </svg>
          <span><strong>Crisis Review Reminder:</strong> Review crisis level (Level {incident.crisisLevel}) as 45 minutes have elapsed since logging ({elapsedMinutes} mins elapsed).</span>
        </div>
      )}
      {incident.mediaInvolvement.mediaAtScene && (
        <div className="alert-banner media-banner glass" style={{ marginBottom: '10px' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span><strong>Media Alert:</strong> Press/media present at scene. SDC Communications notified.</span>
        </div>
      )}

      {/* 1. Header Card (Compact & High Density) */}
      <div className="glass" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href={parentCase ? `/cases/${parentCase.id}` : '/cases'} style={{ color: 'var(--text-faint)', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
              ← BACK TO CASE HUB
            </Link>
            <span style={{ color: 'var(--text-faint)' }}>&bull;</span>
            <span className="mono-id" style={{ background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderColor: 'var(--color-critical-border)', fontSize: '11px', padding: '1px 6px' }}>
              Incident: {incident.id}
            </span>
            <span className="mono-id" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)', borderColor: 'var(--color-info-border)', fontSize: '11px', padding: '1px 6px' }}>
              Case: {incident.caseId}
            </span>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{incident.title}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-info">{incident.type} / {incident.subType}</span>
          <span className="badge badge-ack" style={{ background: 'var(--color-high-bg)', color: 'var(--color-high)', borderColor: 'var(--color-high-border)' }}>
            Lvl {incident.crisisLevel} Crisis
          </span>
          <span className={incBadgeClass(incident.status)}>{incident.status}</span>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="incident-detail-grid">
        
        {/* 2. Left Information Panel */}
        <div className="left-info-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Always Visible Core Overview Card */}
          <div className="glass overview-card">
            <div>
              <div className="overview-section-title">Core Particulars</div>
              <div className="cd-info-row"><span className="cd-info-label">Priority</span><span className="cd-info-value"><strong>{incident.priority}</strong></span></div>
              <div className="cd-info-row"><span className="cd-info-label">Reporter Name</span><span className="cd-info-value">{incident.reporterName || 'TBD'}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Requested By</span><span className="cd-info-value">{incident.requestedBy}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Created By</span><span className="cd-info-value">{incident.createdBy}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Assigned Ranger</span><span className="cd-info-value">{incident.assignedTo ? <strong style={{ color: 'var(--color-info)' }}>{incident.assignedTo}</strong> : <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Time Logged</span><span className="cd-info-value">{new Date(incident.dateTime).toLocaleString('en-SG')}</span></div>
            </div>

            <div style={{ marginTop: 8 }}>
              <div className="overview-section-title">Location Info</div>
              <div className="cd-info-row"><span className="cd-info-label">Common Name</span><span className="cd-info-value"><strong>{incident.location.commonName || '—'}</strong></span></div>
              <div className="cd-info-row"><span className="cd-info-label">Road</span><span className="cd-info-value">{incident.location.road || '—'}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Building</span><span className="cd-info-value">{incident.location.building || '—'}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Level & Space</span><span className="cd-info-value">{incident.location.levelSpace || '—'}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Postal Code</span><span className="cd-info-value">{incident.location.postalCode}</span></div>
              <div className="cd-info-row"><span className="cd-info-label">Coordinates</span><span className="cd-info-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{incident.location.lat.toFixed(5)}, {incident.location.lng.toFixed(5)}</span></div>
            </div>
          </div>

          {/* Cohesive Accordion for Modules */}
          <div className="accordion-container">
            
            {/* Accordion: CCTV */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('cctv')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">CCTV & BWC Cameras</h3>
                  <span className={`accordion-badge ${incident.cctvBwc && incident.cctvBwc.length > 0 ? 'active' : 'none'}`}>
                    {getCctvBadge()}
                  </span>
                </div>
                <span>{openSections.cctv ? '▼' : '▶'}</span>
              </div>
              {openSections.cctv && (
                <div className="accordion-content">
                  {incident.cctvBwc && incident.cctvBwc.length > 0 ? (
                    incident.cctvBwc.map((cam, idx) => (
                      <div key={idx} style={{ padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 5, marginBottom: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>CCTV: {cam.cameraNumber || '—'}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: 3 }}>Bookmark: {cam.vmsBookmark || '—'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>BWC: {cam.bwcNumber || '—'}</div>
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', textAlign: 'center', margin: 0 }}>No cameras referenced.</p>
                  )}
                </div>
              )}
            </div>

            {/* Accordion: Emergency Services */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('emergency')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">Emergency Services</h3>
                  <span className={`accordion-badge ${getEmergencyBadge() !== 'None' ? 'critical' : 'none'}`}>
                    {getEmergencyBadge()}
                  </span>
                </div>
                <span>{openSections.emergency ? '▼' : '▶'}</span>
              </div>
              {openSections.emergency && (
                <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Police */}
                  <div className="inset-panel" style={{ margin: 0, padding: 12 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-critical)', textTransform: 'uppercase', marginBottom: 8 }}>Police dispatch</h4>
                    <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={incident.emergencyServices.policeAtScene}
                        onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, policeAtScene: e.target.checked } })}
                        disabled={isClosed} />
                      Police present at scene
                    </label>
                    {incident.emergencyServices.policeAtScene && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Officer Name & Rank</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.officerNameRank}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, officerNameRank: e.target.value } })}
                            disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Police Report ID</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.policeIncidentNo}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, policeIncidentNo: e.target.value } })}
                            disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SCDF */}
                  <div className="inset-panel" style={{ margin: 0, padding: 12 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-active)', textTransform: 'uppercase', marginBottom: 8 }}>Ambulance & SCDF</h4>
                    <div className="form-group" style={{ marginBottom: 8 }}>
                      <label>Responder Type</label>
                      <select className="form-control select-dark" value={incident.emergencyServices.ambulanceScdfType}
                        onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceScdfType: e.target.value } })}
                        disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }}>
                        <option value="">None</option>
                        <option value="Ambulance">Ambulance</option>
                        <option value="SCDF">SCDF Fire/Hazmat</option>
                      </select>
                    </div>
                    {incident.emergencyServices.ambulanceScdfType && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Officer Name</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.ambulanceOfficerName}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceOfficerName: e.target.value } })}
                            disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Call Sign</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.ambulanceCallSign}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceCallSign: e.target.value } })}
                            disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Hospital Conveyed To</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.hospitalConveyedTo}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, hospitalConveyedTo: e.target.value } })}
                            disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion: Media */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('media')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">Media & Press</h3>
                  <span className={`accordion-badge ${getMediaBadge() !== 'None' ? 'warning' : 'none'}`}>
                    {getMediaBadge()}
                  </span>
                </div>
                <span>{openSections.media ? '▼' : '▶'}</span>
              </div>
              {openSections.media && (
                <div className="accordion-content">
                  <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 12 }}>
                    <input type="checkbox" checked={incident.mediaInvolvement.mediaAtScene}
                      onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, mediaAtScene: e.target.checked } })}
                      disabled={isClosed} />
                    Press/Media present at scene
                  </label>
                  {incident.mediaInvolvement.mediaAtScene && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Media Outlet Name</label>
                        <input className="form-control" type="text" value={incident.mediaInvolvement.mediaName}
                          onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, mediaName: e.target.value } })}
                          disabled={isClosed} style={{ padding: '4px 8px', fontSize: 12 }} />
                      </div>
                      <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: 'var(--color-high)' }}>
                        <strong>⚠ COMMUNICATIONS ACTION:</strong> Media presence flags an automatic trigger. Notify SDC Communications team.
                        <label className="checkbox-row" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={incident.mediaInvolvement.commsNotified}
                            onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, commsNotified: e.target.checked } })}
                            disabled={isClosed} />
                          Communications Team Notified
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Accordion: Property Damage */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('property')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">Property & Vehicles</h3>
                  <span className={`accordion-badge ${getPropertyBadge() !== 'None' ? 'warning' : 'none'}`}>
                    {getPropertyBadge()}
                  </span>
                </div>
                <span>{openSections.property ? '▼' : '▶'}</span>
              </div>
              {openSections.property && (
                <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <label className="checkbox-row" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                      <input type="checkbox" checked={incident.propertyDamage.sdcPropertyDamaged}
                        onChange={e => updateFields({ propertyDamage: { ...incident.propertyDamage, sdcPropertyDamaged: e.target.checked } })}
                        disabled={isClosed} />
                      SDC Property Damaged
                    </label>
                    {incident.propertyDamage.sdcPropertyDamaged && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Description of Damage</label>
                        <textarea className="form-control" rows={2} value={incident.propertyDamage.description}
                          onChange={e => updateFields({ propertyDamage: { ...incident.propertyDamage, description: e.target.value } })}
                          disabled={isClosed} style={{ fontSize: 12 }} />
                      </div>
                    )}
                  </div>
                  <div className="section-separator" style={{ margin: '8px 0' }} />
                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Vehicles Involved</h4>
                    {incident.vehiclesInvolved && incident.vehiclesInvolved.length > 0 ? (
                      incident.vehiclesInvolved.map((v, i) => (
                        <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 11 }}>
                          <div style={{ fontWeight: 600 }}>{v.vehicleModel} ({v.vehicleNumber})</div>
                          <div style={{ color: 'var(--text-muted)' }}>Driver: {v.driverName} &bull; Tel: {v.driverContact}</div>
                          {v.remarks && <div style={{ fontStyle: 'italic', marginTop: 4 }}>{v.remarks}</div>}
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>No vehicles recorded.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion: Persons Involved */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('persons')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">Persons Involved</h3>
                  <span className={`accordion-badge ${getPersonsBadge() !== 'None' ? 'active' : 'none'}`}>
                    {getPersonsBadge()}
                  </span>
                </div>
                <span>{openSections.persons ? '▼' : '▶'}</span>
              </div>
              {openSections.persons && (
                <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Injuries list */}
                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Personal Injuries Log</h4>
                    {!isClosed && (
                      <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <input className="form-control" placeholder="Full Name" value={injName} onChange={e => setInjName(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="form-control" type="number" placeholder="Age" value={injAge} onChange={e => setInjAge(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                          <input className="form-control" placeholder="Contact No" value={injContact} onChange={e => setInjContact(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <input className="form-control" placeholder="Hospital / Clinic Attended" value={injHospital} onChange={e => setInjHospital(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <label className="checkbox-row" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={injU16} onChange={e => setInjU16(e.target.checked)} />
                          Under 16 years old
                        </label>
                        {injU16 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--bg-inset)', borderRadius: 5 }}>
                            <input className="form-control" placeholder="Parent/Guardian Name" value={parentName} onChange={e => setParentName(e.target.value)} style={{ padding: '4px 8px', fontSize: 11 }} />
                            <input className="form-control" placeholder="Parent/Guardian Contact" value={parentTel} onChange={e => setParentTel(e.target.value)} style={{ padding: '4px 8px', fontSize: 11 }} />
                          </div>
                        )}
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => {
                          if (!injName) return;
                          const updated = [...incident.personalInjuries, {
                            name: injName, address: 'TBD', age: parseInt(injAge, 10) || 0, gender: 'TBD', contactNumber: injContact, clinicHospitalAttended: injHospital, msigFormIssued: false, under16: injU16, parentGuardianName: parentName, parentGuardianContact: parentTel
                          }];
                          updateFields({ personalInjuries: updated });
                          setInjName(''); setInjAge(''); setInjContact(''); setInjHospital(''); setInjU16(false); setParentName(''); setParentTel('');
                        }}>Add Injury</button>
                      </div>
                    )}
                    {incident.personalInjuries.length === 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', margin: '4px 0 12px 0' }}>No injuries recorded.</p>
                    ) : incident.personalInjuries.map((inj, i) => (
                      <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>
                          {inj.name} (Age: {inj.age})
                          {inj.under16 && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--color-critical-bg)', color: 'var(--color-critical)', padding: '2px 4px', borderRadius: 3, fontWeight: 700 }}>U-16</span>}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Hospital: {inj.clinicHospitalAttended || '—'} &bull; Tel: {inj.contactNumber}</div>
                        {inj.under16 && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>Guardian: {inj.parentGuardianName} ({inj.parentGuardianContact})</div>}
                      </div>
                    ))}
                  </div>

                  <div className="section-separator" style={{ margin: '8px 0' }} />

                  {/* Other persons */}
                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Other Persons</h4>
                    {!isClosed && (
                      <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <select className="form-control select-dark" value={pType} onChange={e => setPType(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                          {['Guest','Staff','Island Partner','Contractor'].map(o => <option key={o}>{o}</option>)}
                        </select>
                        <input className="form-control" placeholder="Full Name" value={pName} onChange={e => setPName(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <input className="form-control" placeholder="Contact No" value={pContact} onChange={e => setPContact(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <select className="form-control select-dark" value={pRole} onChange={e => setPRole(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                          {['Witness','Bystander','Subject','Other'].map(o => <option key={o}>{o}</option>)}
                        </select>
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => {
                          if (!pName) return;
                          const updated = [...incident.personsInvolved, {
                            guestOrNonGuest: pType === 'Guest' ? 'Guest' : 'Non-Guest', type: pType, name: pName, address: 'TBD', age: 0, gender: 'TBD', contactNumber: pContact, roleInvolvement: pRole, injuryDetails: ''
                          }];
                          updateFields({ personsInvolved: updated });
                          setPName(''); setPContact(''); setPRole('Witness');
                        }}>Add Person</button>
                      </div>
                    )}
                    {incident.personsInvolved.length === 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>No other persons recorded.</p>
                    ) : incident.personsInvolved.map((p, i) => (
                      <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }}>{p.name} ({p.type})</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Role: {p.roleInvolvement} &bull; Tel: {p.contactNumber}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion: Duplicates */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('duplicates')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">Linked duplicate reports</h3>
                  <span className={`accordion-badge ${getDuplicatesBadge() !== 'None' ? 'active' : 'none'}`}>
                    {getDuplicatesBadge()}
                  </span>
                </div>
                <span>{openSections.duplicates ? '▼' : '▶'}</span>
              </div>
              {openSections.duplicates && (
                <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {!isClosed ? (
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      if (!slaveTitle.trim()) return;
                      const slave = {
                        id: `DUP-${String((incident.slaveIncidents?.length ?? 0) + 1).padStart(3, '0')}`,
                        title: slaveTitle, dateTime: new Date().toISOString(), reporterName: slaveReporter || 'Anonymous Guest', summary: slaveSummary, status: incident.status === 'Closed' ? 'Closed' : 'Open'
                      };
                      const updated = [...(incident.slaveIncidents ?? []), slave];
                      await updateFields({
                        slaveIncidents: updated,
                        newLogEntry: `[Duplicate] Linked duplicate report ${slave.id}: "${slaveTitle}" to this incident.`
                      });
                      setSlaveTitle(''); setSlaveReporter(''); setSlaveSummary('');
                    }} style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="form-control" required placeholder="Report Title *" value={slaveTitle} onChange={e => setSlaveTitle(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      <input className="form-control" placeholder="Reporter Details" value={slaveReporter} onChange={e => setSlaveReporter(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      <textarea className="form-control" rows={2} placeholder="Summary Remarks" value={slaveSummary} onChange={e => setSlaveSummary(e.target.value)} style={{ fontSize: 12 }} />
                      <button type="submit" className="btn btn-primary btn-xs">Link Duplicate</button>
                    </form>
                  ) : <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>Incident is Closed. Duplicates cannot be linked.</p>}

                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Linked Duplicates</h4>
                    {!incident.slaveIncidents?.length ? (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>No duplicate reports linked.</p>
                    ) : incident.slaveIncidents.map((s: any, i: number) => (
                      <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, color: 'var(--color-info)' }}>{s.id}</span>
                          <span className={s.status === 'Closed' ? 'badge badge-closed' : 'badge badge-live'} style={{ scale: '0.85', transformOrigin: 'right center' }}>{s.status}</span>
                        </div>
                        <div style={{ fontWeight: 600 }}>{s.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Reporter: {s.reporterName}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>

        </div>

        {/* 3. Center Operational Timeline */}
        <div className="center-timeline-panel" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Streamlined Log Composer */}
          {!isClosed && (
            <div className="glass composer-card">
              <h3 className="accordion-title" style={{ marginBottom: 12 }}>Log Operational Update</h3>
              
              <input
                id="composer-file-upload"
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />

              {/* Controller Log Form */}
              {isCtrl && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!newLogText.trim()) return;
                  performAction('log', { description: newLogText, attachments: composerAttachments });
                  setNewLogText('');
                  setComposerAttachments([]);
                }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <textarea
                      className="composer-textarea"
                      placeholder="Add chronological log update (Controller)..."
                      value={newLogText}
                      onChange={e => setNewLogText(e.target.value)}
                      rows={2}
                    />
                  </div>
                  
                  {composerAttachments.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '5px 0' }}>
                      {composerAttachments.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', width: 50, height: 50, borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                          <img src={img} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => setComposerAttachments(prev => prev.filter((_, i) => i !== idx))}
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              background: 'rgba(0,0,0,0.6)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 14,
                              height: 14,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: 8,
                              fontWeight: 'bold'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="composer-file-upload" className="btn btn-secondary btn-xs" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '3px 8px' }}>
                      📷 Attach Image
                    </label>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !newLogText.trim()}>
                      Post Log Entry
                    </button>
                  </div>
                </form>
              )}

              {/* Ranger Activity Form */}
              {isRanger && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (!rangerActivityText.trim()) return;
                  performAction('log', { description: `[Ranger Log] ${rangerActivityText}`, attachments: composerAttachments });
                  setRangerActivity('');
                  setComposerAttachments([]);
                }} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: isCtrl ? 12 : 0 }}>
                  {isCtrl && <div className="section-separator" style={{ margin: '8px 0' }} />}
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>Ranger Ground Update</label>
                    <input
                      className="form-control"
                      type="text"
                      placeholder="e.g. Cordons set up around scene."
                      value={rangerActivityText}
                      onChange={e => setRangerActivity(e.target.value)}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  
                  {composerAttachments.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '5px 0' }}>
                      {composerAttachments.map((img, idx) => (
                        <div key={idx} style={{ position: 'relative', width: 50, height: 50, borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                          <img src={img} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            type="button"
                            onClick={() => setComposerAttachments(prev => prev.filter((_, i) => i !== idx))}
                            style={{
                              position: 'absolute',
                              top: 2,
                              right: 2,
                              background: 'rgba(0,0,0,0.6)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '50%',
                              width: 14,
                              height: 14,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              fontSize: 8,
                              fontWeight: 'bold'
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['Cordon established.', 'First aid administered.', 'Search operations commenced.', 'Area cleared.'].map(q => (
                      <button key={q} type="button" onClick={() => setRangerActivity(q)} className="btn btn-secondary btn-xs" style={{ fontSize: 10 }}>
                        {q}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label htmlFor="composer-file-upload" className="btn btn-secondary btn-xs" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '3px 8px' }}>
                      📷 Attach Image
                    </label>
                    <button type="submit" className="btn btn-secondary btn-sm" disabled={saving || !rangerActivityText.trim()}>
                      Log Ranger Update
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Timeline Feed Panel */}
          <div className="glass timeline-feed-card">
            <h2 className="panel-title" style={{ marginBottom: 20 }}>Operational Activity Log</h2>
            
            <div className="timeline-container">
              {timelineEvents.map((evt, idx) => (
                <div key={idx} className="timeline-node">
                  
                  {/* Vertical Line Connector */}
                  {idx < timelineEvents.length - 1 && (
                    <div className="timeline-line" />
                  )}
                  
                  {/* Dot / Icon */}
                  <div className="timeline-icon-container" style={{
                    background: getEventBgColor(evt.type),
                    border: `2px solid ${getEventBorderColor(evt.type)}`,
                    color: getEventTextColor(evt.type),
                  }}>
                    {getEventIcon(evt.type)}
                  </div>
                  
                  {/* Sleek chat-bubble style card */}
                  <div className={`timeline-content-card ${evt.type}`}>
                    <div className="timeline-content-header">
                      <span className="timeline-title">{evt.title}</span>
                      <span className="timeline-timestamp">
                        {new Date(evt.timestamp).toLocaleString('en-SG', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: false
                        })}
                      </span>
                    </div>
                    <div className="timeline-body">{evt.description}</div>
                    {evt.attachments && evt.attachments.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                        {evt.attachments.map((img, imgIdx) => (
                          <div key={imgIdx} style={{ border: '1px solid var(--border-color)', borderRadius: 6, overflow: 'hidden', cursor: 'zoom-in', width: 70, height: 70 }}
                            onClick={() => {
                              const w = window.open();
                              if (w) w.document.write(`<img src="${img}" style="max-width:100%; max-height:100%; display:block; margin:auto;" />`);
                            }}
                          >
                            <img src={img} alt="timeline attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          </div>
                        ))}
                      </div>
                    )}
                    {evt.actor && (
                      <div className="timeline-footer">
                        Recorded by: <strong>{evt.actor}</strong>
                      </div>
                    )}
                  </div>

                </div>
              ))}
            </div>
          </div>

        </div>

        {/* 4. Right Action Panel (Control Console) */}
        <div className="right-action-panel-container">
          
          <div className="glass console-card">
            <h2 className="panel-title" style={{ margin: 0 }}>Workflow Console</h2>
            
            {/* Status Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-inset)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Current Status</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className={incBadgeClass(incident.status)} style={{ padding: '4px 10px', fontSize: '11px' }}>{incident.status}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Crisis Level {incident.crisisLevel}</span>
              </div>
            </div>

            {/* Workflow Actions Based on Status */}
            
            {/* Status: Pending Endorsement */}
            {incident.status === 'Pending Endorsement' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 10, fontWeight: 700 }}>Review / Endorsement Remarks</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Provide remarks for approving or reason for returning to controller..."
                    value={reviewRemarks}
                    onChange={e => setReviewRemarks(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                </div>
                
                {isMgr ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button 
                      className="btn btn-success" 
                      onClick={async () => {
                        const ok = await performAction('close', { closureRemarks: reviewRemarks });
                        if (ok) setReviewRemarks('');
                      }}
                      disabled={saving}
                      style={{ fontSize: 13 }}
                    >
                      Approve & Close Incident
                    </button>
                    <button 
                      className="btn btn-danger" 
                      onClick={async () => {
                        if (!reviewRemarks.trim()) {
                          alert('Review remarks are required when returning an incident.');
                          return;
                        }
                        const ok = await performAction('return', { returnRemarks: reviewRemarks });
                        if (ok) setReviewRemarks('');
                      }}
                      disabled={saving}
                      style={{ fontSize: 13 }}
                    >
                      Return to Controller
                    </button>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', margin: '8px 0 0 0' }}>
                    Awaiting Duty Manager action. (Your role: {role})
                  </p>
                )}
              </div>
            )}

            {/* Status: Closed */}
            {incident.status === 'Closed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'var(--color-closed-bg)', border: '1px solid var(--color-closed-border)', borderRadius: 6, padding: '10px 12px', fontSize: 12, color: 'var(--color-closed)' }}>
                  <strong>🔒 Read Only:</strong> This incident report has been fully closed and approved. It is locked for modifications.
                </div>
                
                {isAdmin && (
                  <button className="btn btn-brand btn-sm" onClick={() => performAction('reopen')} disabled={saving}>
                    Reopen Incident
                  </button>
                )}

                {/* Closed Status Related Lists Display */}
                <div className="section-separator" style={{ margin: '8px 0' }} />
                
                {/* Related Tasks */}
                <div className="related-list-section" style={{ marginTop: 0 }}>
                  <div className="related-list-header">
                    <span className="related-list-title">Related Tasks</span>
                    <span className="related-count-badge">{incident.relatedTasks?.length || 0}</span>
                  </div>
                  {(!incident.relatedTasks || incident.relatedTasks.length === 0) ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic', paddingLeft: 4 }}>No linked tasks found.</div>
                  ) : (
                    incident.relatedTasks.map(t => (
                      <div key={t.id} className="related-item-row">
                        <div className="related-item-row-header">
                          <span className="case-id" style={{ color: 'var(--color-info)' }}>{t.id}</span>
                          <span className={`badge ${t.status === 'Closed' ? 'badge-closed' : 'badge-live'}`} style={{ scale: '0.8', transformOrigin: 'right center' }}>{t.status}</span>
                        </div>
                        <div style={{ fontWeight: 600, margin: '2px 0', wordBreak: 'break-word' }}>{t.title}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)' }}>
                          <span>Assignee: {t.assignee}</span>
                          <span>Due: {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-SG') : '—'}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Related Faults */}
                <div className="related-list-section">
                  <div className="related-list-header">
                    <span className="related-list-title">Related Faults</span>
                    <span className="related-count-badge">{incident.relatedFaults?.length || 0}</span>
                  </div>
                  {(!incident.relatedFaults || incident.relatedFaults.length === 0) ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic', paddingLeft: 4 }}>No linked faults.</div>
                  ) : (
                    incident.relatedFaults.map(f => (
                      <div key={f.id} className="related-item-row">
                        <div className="related-item-row-header">
                          <span className="case-id" style={{ color: 'var(--color-info)' }}>{f.id}</span>
                          <span className="badge badge-onsite" style={{ fontSize: '9px', scale: '0.8', transformOrigin: 'right center' }}>Sync'd</span>
                        </div>
                        <div style={{ fontWeight: 600, margin: '2px 0', wordBreak: 'break-word' }}>{f.description || f.faultType}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-faint)' }}>
                          <span>Ticket: {f.cmmsTicketId || '—'}</span>
                          <span>Status: {f.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Related Broadcasts */}
                <div className="related-list-section">
                  <div className="related-list-header">
                    <span className="related-list-title">Related Broadcasts</span>
                    <span className="related-count-badge">{incident.relatedBroadcasts?.length || 0}</span>
                  </div>
                  {(!incident.relatedBroadcasts || incident.relatedBroadcasts.length === 0) ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic', paddingLeft: 4 }}>No broadcasts dispatched.</div>
                  ) : (
                    incident.relatedBroadcasts.map(b => (
                      <div key={b.id} className="related-item-row">
                        <div className="related-item-row-header">
                          <span className="case-id" style={{ color: 'var(--color-info)' }}>{b.id}</span>
                          <span className={`badge ${b.status === 'SENT' ? 'badge-onsite' : 'badge-live'}`} style={{ scale: '0.8', transformOrigin: 'right center' }}>{b.status}</span>
                        </div>
                        <div style={{ fontWeight: 500, margin: '2px 0', fontStyle: 'italic' }}>{b.templateUsed || (b as any).templateName || 'Standard Broadcast'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-faint)', wordBreak: 'break-word' }}>
                          To: {(Array.isArray(b.recipients) ? b.recipients : [(b as any).recipientGroup || '']).filter(Boolean).join(', ')}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Related e-Diary */}
                <div className="related-list-section">
                  <div className="related-list-header">
                    <span className="related-list-title">Related e-Diary</span>
                    <span className="related-count-badge">{incident.relatedOccurrences?.length || 0}</span>
                  </div>
                  {(!incident.relatedOccurrences || incident.relatedOccurrences.length === 0) ? (
                    <div style={{ fontSize: '11px', color: 'var(--text-faint)', fontStyle: 'italic', paddingLeft: 4 }}>No linked occurrences.</div>
                  ) : (
                    incident.relatedOccurrences.map(o => (
                      <div key={o.id} className="related-item-row">
                        <div className="related-item-row-header">
                          <span className="case-id" style={{ color: 'var(--color-info)' }}>{o.id}</span>
                          <span>{new Date(o.dateTime).toLocaleDateString('en-SG')}</span>
                        </div>
                        <div style={{ fontWeight: 600, margin: '2px 0' }}>{o.topic}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {o.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>

              </div>
            )}

            {/* Status: Other Active Statuses */}
            {incident.status !== 'Pending Endorsement' && incident.status !== 'Closed' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                
                {/* Controller Assignment Control */}
                {isCtrl && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-inset)', padding: 10, borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assign responder (ranger)</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select 
                        className="form-control select-dark" 
                        value={assigneeInput} 
                        onChange={e => setAssigneeInput(e.target.value)}
                        style={{ fontSize: '12px', padding: '5px 8px' }}
                      >
                        <option value="">-- Choose Ranger --</option>
                        <option value="Ranger John">Ranger John</option>
                        <option value="Ranger Dave">Ranger Dave</option>
                        <option value="Ranger Sarah">Ranger Sarah</option>
                        <option value="Ranger Mike">Ranger Mike</option>
                      </select>
                      <button 
                        className="btn btn-primary btn-sm" 
                        onClick={handleAssign}
                        disabled={!assigneeInput || saving}
                      >
                        Assign
                      </button>
                    </div>
                  </div>
                )}

                {/* Workflow Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  
                  {/* Ranger Actions */}
                  {isRanger && (
                    <>
                      {(incident.status === 'Live' || incident.status === 'Live (Assigned)') && (
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => performAction('acknowledge')} disabled={saving}>
                          Acknowledge Dispatch
                        </button>
                      )}
                      
                      {incident.status === 'Live (Acknowledged)' && (
                        <button className="btn btn-success" style={{ width: '100%' }} onClick={() => performAction('on-site')} disabled={saving}>
                          Arrive On-Site
                        </button>
                      )}
                      
                      {['Live (On-Site)', 'Live (Acknowledged)', 'Live (Assigned)', 'Live', 'Live (Incomplete)'].includes(incident.status) && (
                        <button className="btn btn-success" style={{ width: '100%' }} onClick={() => setShowCompleteModal(true)} disabled={saving}>
                          Notify Completion
                        </button>
                      )}
                      
                      {['Live (On-Site)', 'Live (Acknowledged)', 'Live (Assigned)', 'Live'].includes(incident.status) && (
                        <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => {
                          const r = prompt('Reason for marking incomplete:');
                          if (r) performAction('mark-incomplete', { remarks: r });
                        }} disabled={saving}>
                          Mark Incomplete
                        </button>
                      )}
                    </>
                  )}

                  {/* Controller Actions */}
                  {isCtrl && ['Live (Completed)', 'Live (Incomplete)', 'Returned', 'Live'].includes(incident.status) && (
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => performAction('submit-endorsement')} disabled={saving}>
                      Submit for Endorsement
                    </button>
                  )}

                  {/* Message for non-matching role context */}
                  {!isRanger && !isCtrl && !isMgr && (
                    <p style={{ fontSize: '12px', color: 'var(--text-faint)', fontStyle: 'italic', textAlign: 'center', margin: 0 }}>
                      No actions available for role: {role}
                    </p>
                  )}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* Notify Completion Remarks Modal */}
      {showCompleteModal && (
        <div className="modal-overlay">
          <div className="modal-box glass">
            <h2 className="modal-title">Notify Completion Remarks</h2>
            <div className="form-group">
              <label>Completion Remarks *</label>
              <textarea className="form-control" rows={3} value={completionRemarks} onChange={e => setCompletionRemarks(e.target.value)} placeholder="Provide summary of final actions taken on ground..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setShowCompleteModal(false)}>Cancel</button>
              <button className="btn btn-success btn-sm" onClick={handleComplete} disabled={!completionRemarks.trim() || saving}>Submit Completion</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
