'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';
import { getIncidentTaxonomy } from '@/lib/taxonomy';
import { INCIDENT_CATEGORIES, DEFAULT_INCIDENT_CATEGORY } from '@/lib/incidentCategory';
import { hasBroadcastPermission } from '@/lib/permissions';
import dynamic from 'next/dynamic';
import MultiResponderSelect from '@/components/MultiResponderSelect';
const IncidentMap = dynamic(() => import('@/components/IncidentMap'), { ssr: false });
import { useNotifications } from '@/context/NotificationContext';
import FaultCreateModal from '@/components/FaultCreateModal';
import { uploadAttachments } from '@/lib/uploadAttachment';

interface HydratedIncident extends Incident {
  relatedTasks?: Task[];
  relatedFaults?: Fault[];
  relatedBroadcasts?: BroadcastRecord[];
  relatedOccurrences?: Occurrence[];
}

// Helper: incident status → badge class
// (Incident-level status is now just Live / Live (Assigned) / Pending Endorsement /
// Returned / Closed — per-Responder progress lives on IncidentResponder.lifecycleStatus,
// see responderBadgeClass below. Old cases kept harmlessly for legacy data in transit.)
function incBadgeClass(status: string) {
  switch (status) {
    case 'Live':
    case 'Returned':
      return 'badge badge-live';
    case 'Live (Assigned)':
      return 'badge badge-assigned';
    case 'Live (Acknowledged)':
    case 'Live (Incomplete)':
      return 'badge badge-ack';
    case 'Live (On-Site)':
      return 'badge badge-onsite';
    case 'Live (Pending Controller Review)':
      return 'badge badge-pending-ctrl';
    case 'Live (Completed)':
      return 'badge badge-completed';
    case 'Pending Endorsement':
      return 'badge badge-review';
    case 'Closed':
      return 'badge badge-closed';
    default:
      return 'badge badge-closed';
  }
}

// Helper: per-Responder lifecycle status → badge class
function responderBadgeClass(status?: string) {
  switch (status) {
    case 'Assigned':
      return 'badge badge-assigned';
    case 'Acknowledged':
      return 'badge badge-ack';
    case 'On-Site':
      return 'badge badge-onsite';
    case 'Pending Controller Review':
      return 'badge badge-pending-ctrl';
    case 'Live (Incomplete)':
      return 'badge badge-ack';
    case 'Completed':
      return 'badge badge-completed';
    default:
      return 'badge badge-closed';
  }
}

// Statuses the Controller can jump a Responder directly between via the status dropdown in
// the Responder Assignment card (forward-skip or backward-correct, both directions).
// Deliberately excludes 'Live (Incomplete)' (kept behind the existing "Notify Completion"
// resubmission button) and 'Completed' (kept behind bulk Submit for Endorsement) — see
// RESPONDER_STATUS_DROPDOWN_PLAN.md §2 (confirmed with Kyle, 2026-07-20).
const RESPONDER_STATUS_DROPDOWN_ORDER: string[] = ['Assigned', 'Acknowledged', 'On-Site', 'Pending Controller Review'];

// Helper: lifecycle status → dropdown tone modifier class (see .responder-status-select--*
// in globals.css). Tints the select to match the badge next to it instead of rendering as
// a plain native dropdown.
function responderSelectTone(status?: string): string {
  switch (status) {
    case 'Assigned': return 'assigned';
    case 'Acknowledged': return 'acknowledged';
    case 'On-Site': return 'onsite';
    case 'Pending Controller Review': return 'pending-review';
    default: return 'assigned';
  }
}

// Helper: display-only "Responder Progress" aggregation (e.g. "2/3 On-Site").
// UI aggregation only — does not participate in the workflow state machine or gating.
function computeResponderProgress(responders?: { status: string; lifecycleStatus?: string }[]): string | null {
  const active = (responders || []).filter(r => r.status === 'Active');
  if (active.length === 0) return null;
  const total = active.length;
  const counts: Record<string, number> = {};
  active.forEach(r => {
    const key = r.lifecycleStatus || 'Assigned';
    counts[key] = (counts[key] || 0) + 1;
  });
  const [topStage, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return `${topCount}/${total} ${topStage}`;
}

export default function IncidentDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { role, username } = useRole();
  const { setDirty, setHideNav, requestLeave } = useUnsavedChanges();

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

  // Log event date/time (Controller-specified when the event occurred)
  const getNowDate = () => new Date().toISOString().split('T')[0];
  const getNowTime = () => new Date().toTimeString().slice(0, 5); // HH:MM
  const [logTimeIsCustom, setLogTimeIsCustom] = useState(false);
  const [logEventDate, setLogEventDate] = useState<string>(getNowDate());
  const [logEventTime, setLogEventTime] = useState<string>(getNowTime());

  // Modals & Inline Inputs
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showReturnToResponderModal, setShowReturnToResponderModal] = useState(false);
  // Per-Responder, multi-select Return: which Responders are selected, and each one's own remark.
  const [returnResponderIds, setReturnResponderIds] = useState<string[]>([]);
  const [returnRemarksByResponder, setReturnRemarksByResponder] = useState<Record<string, string>>({});
  const [modalRemarks, setModalRemarks] = useState('');
  const [assignmentError, setAssignmentError] = useState('');
  const [pendingResponders, setPendingResponders] = useState<string[] | null>(null);
  // Manage Responders now lives in its own card (Incident Details tab), decoupled from
  // the "Edit Incident Details" toggle — assigning/reassigning Responders is a dispatch
  // action, not an edit to the incident's static particulars.
  const [showResponderManager, setShowResponderManager] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [reviewRemarks, setReviewRemarks] = useState('');

  // Closure Broadcast compose/dispatch (FSD §5.11.1b / §10.1)
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastRecipients, setBroadcastRecipients] = useState('');
  const [broadcastRecipientGroups, setBroadcastRecipientGroups] = useState<string[]>([]);
  const [showRecipientEmails, setShowRecipientEmails] = useState(false);
  const [broadcastContent, setBroadcastContent] = useState('');
  // Auto-filled default content at the time the modal was opened — diffed against
  // the (possibly edited) broadcastContent to decide whether the "content edited
  // beyond default" confirmation is required (2026-07-25 content-diff gate,
  // replaces the old per-field sensitiveFields checklist).
  const [broadcastOriginalContent, setBroadcastOriginalContent] = useState('');
  const [broadcastConfirmContentChange, setBroadcastConfirmContentChange] = useState(false);

  // Timeline & Refactoring States
  const [activeTimelineTab, setActiveTimelineTab] = useState<'log' | 'system' | 'faults' | 'duplicates'>('log'); // 'faults' = Faults & e-Diary tab
  const [editingLogEventNumber, setEditingLogEventNumber] = useState<number | null>(null);
  const [editingLogText, setEditingLogText] = useState('');
  const [editingLogDate, setEditingLogDate] = useState('');
  const [editingLogTime, setEditingLogTime] = useState('');
  const [editingLogAttachments, setEditingLogAttachments] = useState<string[]>([]);

  // Linked e-Diary entries (fetched by caseId)
  const [linkedEDiaryEntries, setLinkedEDiaryEntries] = useState<any[]>([]);

  // Linked Fault Form States
  const [showRaiseFaultModal, setShowRaiseFaultModal] = useState(false);

  // Persons / Injuries Forms
  const [injHospital, setInjHospital] = useState('');
  const [injU16, setInjU16] = useState(false);
  const [parentName, setParentName] = useState('');
  const [parentTel, setParentTel] = useState('');
  const [injMsig, setInjMsig] = useState(false);
  const [injMsigSerial, setInjMsigSerial] = useState('');

  const [pType, setPType] = useState('Guest');
  const [pName, setPName] = useState('');
  const [pContact, setPContact] = useState('');
  const [pRole, setPRole] = useState('Witness');
  const [pGuestOrNon, setPGuestOrNon] = useState('Guest');
  const [pAge, setPAge] = useState('');
  const [pGender, setPGender] = useState('Male');
  const [pAddress, setPAddress] = useState('');
  const [pInjured, setPInjured] = useState(false);
  const [pInjuryDetails, setPInjuryDetails] = useState('');

  // Vehicles Form State
  const [vehSdc, setVehSdc] = useState(false);
  const [vehModel, setVehModel] = useState('');
  const [vehPlate, setVehPlate] = useState('');
  const [vehDriverName, setVehDriverName] = useState('');
  const [vehDriverContact, setVehDriverContact] = useState('');
  const [vehLicence, setVehLicence] = useState('');
  const [vehAddress, setVehAddress] = useState('');
  const [vehRemarks, setVehRemarks] = useState('');

  // CCTV & BWC Form State
  const [cctvCameraNo, setCctvCameraNo] = useState('');
  const [cctvVmsTimestamp, setCctvVmsTimestamp] = useState('');
  const [cctvBookmark, setCctvBookmark] = useState('');
  const [cctvBwcNo, setCctvBwcNo] = useState('');
  const [cctvBwcTimestamp, setCctvBwcTimestamp] = useState('');

  // Link Duplicate Form
  const [linkDupId, setLinkDupId] = useState('');
  const [linkDupError, setLinkDupError] = useState('');

  // Collapsible Left Panel sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    cctv: false,
    emergency: false,
    media: false,
    property: false,
    injuries: false,
    persons: false,
    duplicates: false,
    attachments: false,
    summaryClosure: false,
  });

  // Timers/Age calculations
  const [elapsedMinutes, setElapsedMinutes] = useState(0);
  const [elapsedDays, setElapsedDays] = useState(0);

  // Notification system + one-shot guards for crisis reminder and ageing alerts
  const { addNotification } = useNotifications();
  const crisisReminderFiredRef = useRef(false);
  const ageing12FiredRef = useRef(false);
  const ageing14FiredRef = useRef(false);

  // Auto-save wiring for the summary field (FSD §5.7.1)
  const [summaryDraft, setSummaryDraft] = useState('');
  const summaryDirtyRef = useRef(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Unified Edit Info State
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState<string>(DEFAULT_INCIDENT_CATEGORY);
  const [editType, setEditType] = useState('');
  const [editSubType, setEditSubType] = useState('');
  const [editPriority, setEditPriority] = useState('Normal');
  const [editCrisisLevel, setEditCrisisLevel] = useState('4');
  const [editRequestedBy, setEditRequestedBy] = useState('');
  const [editReportingSource, setEditReportingSource] = useState('Public Phone');
  const [editReporterName, setEditReporterName] = useState('');
  const [editDateTime, setEditDateTime] = useState('');

  // Location Info Edit Form State
  const [editRoad, setEditRoad] = useState('');
  const [editBuilding, setEditBuilding] = useState('');
  const [editLevelSpace, setEditLevelSpace] = useState('');
  const [editNearAt, setEditNearAt] = useState('');
  const [editCommonName, setEditCommonName] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('000000');
  const [editTagsStr, setEditTagsStr] = useState('');
  const [editLat, setEditLat] = useState(1.25);
  const [editLng, setEditLng] = useState(103.83);

  // Reference Taxonomy Data
  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});
  
  useEffect(() => {
    setTaxonomy(getIncidentTaxonomy());
  }, []);

  const handleStartEditingAll = () => {
    if (!incident) return;
    setEditTitle(incident.title);
    setEditCategory(incident.category || DEFAULT_INCIDENT_CATEGORY);
    setEditType(incident.type);
    setEditSubType(incident.subType);
    setEditPriority(incident.priority);
    setEditCrisisLevel(String(incident.crisisLevel));
    setEditRequestedBy(incident.requestedBy);
    setEditReportingSource(incident.reportingSource || 'Public Phone');
    setEditReporterName(incident.reporterName);
    
    if (incident.dateTime) {
      const dateObj = new Date(incident.dateTime);
      const offsetMs = dateObj.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(dateObj.getTime() - offsetMs)).toISOString().slice(0, 16);
      setEditDateTime(localISOTime);
    } else {
      setEditDateTime('');
    }
    
    if (incident.location) {
      setEditRoad(incident.location.road || '');
      setEditBuilding(incident.location.building || '');
      setEditLevelSpace(incident.location.levelSpace || '');
      setEditNearAt(incident.location.nearAt || '');
      setEditCommonName(incident.location.commonName || '');
      setEditPostalCode(incident.location.postalCode || '000000');
      setEditTagsStr((incident.location.tags || []).join(', '));
      setEditLat(incident.location.lat);
      setEditLng(incident.location.lng);
    }

    setPendingResponders(Array.isArray(incident.assignedTo) ? incident.assignedTo : []);
    setIsEditingInfo(true);
  };

  // Hide the left nav while the inline "Edit Incident Details" panel is
  // open, and clear the dirty flag whenever it closes (Cancel/Save both
  // route through here eventually via setIsEditingInfo(false)).
  useEffect(() => {
    setHideNav(isEditingInfo);
    if (!isEditingInfo) setDirty(false);
    return () => setHideNav(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditingInfo]);

  const handleCancelAll = () => {
    requestLeave(() => {
      setPendingResponders(null);
      setAssignmentError('');
      setIsEditingInfo(false);
    });
  };

  const handleSaveAll = async () => {
    if (!incident) return;
    if (!editTitle.trim()) { alert('Title is required.'); return; }
    if (!editType) { alert('Type is required.'); return; }
    if (!editSubType) { alert('Sub-type is required.'); return; }
    
    setSaving(true);
    setAssignmentError('');
    try {
      const isoDateTime = editDateTime ? new Date(editDateTime).toISOString() : new Date().toISOString();
      const tags = editTagsStr.split(',').map(t => t.trim()).filter(Boolean);
      
      const updatePayload = {
        title: editTitle,
        category: editCategory,
        type: editType,
        subType: editSubType,
        priority: editPriority,
        crisisLevel: Number(editCrisisLevel),
        requestedBy: editRequestedBy,
        reportingSource: editReportingSource,
        reporterName: editReporterName,
        dateTime: isoDateTime,
        location: {
          road: editRoad,
          building: editBuilding,
          levelSpace: editLevelSpace,
          nearAt: editNearAt,
          commonName: editCommonName,
          postalCode: editPostalCode,
          tags,
          lat: editLat,
          lng: editLng
        }
      };

      const updateRes = await fetch(`/api/incidents/${incidentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatePayload, username }),
      });
      if (!updateRes.ok) {
        const err = await updateRes.json();
        alert(`Failed to save details: ${err.error}`);
        setSaving(false);
        return;
      }

      const currentList = Array.isArray(incident.assignedTo) ? incident.assignedTo : [];
      const pending = pendingResponders ?? currentList;
      const toAdd = pending.filter(r => !currentList.includes(r));
      const toRemove = currentList.filter(r => !pending.includes(r));

      if (toAdd.length > 0 || toRemove.length > 0) {
        for (const name of toAdd) {
          const res = await fetch(`/api/incidents/${incidentId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ addResponder: name, username, role }),
          });
          if (!res.ok) {
            const err = await res.json();
            setAssignmentError(err.error || 'Failed to add responder.');
            setSaving(false);
            return;
          }
        }
        for (const name of toRemove) {
          const res = await fetch(`/api/incidents/${incidentId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ removeResponder: name, username, role }),
          });
          if (!res.ok) {
            const err = await res.json();
            setAssignmentError(err.error || 'Failed to remove responder.');
            setSaving(false);
            return;
          }
        }
      }

      setPendingResponders(null);
      await fetchIncidentData();
      setIsEditingInfo(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error occurred while saving.');
    } finally {
      setSaving(false);
    }
  };

  // Standalone Responder assign/reassign save — split out of handleSaveAll so managing
  // Responders doesn't require going through (or validating) the Edit Incident Details form.
  const handleSaveResponders = async () => {
    if (!incident) return;
    setSaving(true);
    setAssignmentError('');
    try {
      const currentList = Array.isArray(incident.assignedTo) ? incident.assignedTo : [];
      const pending = pendingResponders ?? currentList;
      const toAdd = pending.filter(r => !currentList.includes(r));
      const toRemove = currentList.filter(r => !pending.includes(r));

      for (const name of toAdd) {
        const res = await fetch(`/api/incidents/${incidentId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addResponder: name, username, role }),
        });
        if (!res.ok) {
          const err = await res.json();
          setAssignmentError(err.error || 'Failed to add responder.');
          setSaving(false);
          return;
        }
      }
      for (const name of toRemove) {
        const res = await fetch(`/api/incidents/${incidentId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeResponder: name, username, role }),
        });
        if (!res.ok) {
          const err = await res.json();
          setAssignmentError(err.error || 'Failed to remove responder.');
          setSaving(false);
          return;
        }
      }

      setPendingResponders(null);
      await fetchIncidentData();
      setShowResponderManager(false);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error occurred while saving responders.');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Uploads to Vercel Blob and stores the URL. Previously this read the file as a
  // base64 data URL and stored the whole image inside the Mongo document — see the
  // note at the top of src/lib/attachments.ts for why that had to stop.
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const filesArray = Array.from(e.target.files);
    e.target.value = '';
    void (async () => {
      const errors = await uploadAttachments(filesArray, 'incidents', (url) =>
        setComposerAttachments(prev => [...prev, url]),
      );
      if (errors.length > 0) alert(errors.join('\n'));
    })();
  };

  const fetchIncidentData = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (res.ok) {
        const incData: HydratedIncident = await res.json();
        setIncident(incData);
        // Sync summary draft with loaded data (only if not currently dirty)
        if (!summaryDirtyRef.current) {
          setSummaryDraft(incData.summary || '');
        }

        // Fetch parent Case details
        const caseRes = await fetch(`/api/cases/${incData.caseId}`);
        if (caseRes.ok) {
          setParentCase(await caseRes.json());
        }

        // Fetch linked e-Diary entries for this case (FSD §5.3.1)
        const ediaryRes = await fetch(`/api/occurrences?caseId=${encodeURIComponent(incData.caseId)}`);
        if (ediaryRes.ok) {
          const allEntries: any[] = await ediaryRes.json();
          setLinkedEDiaryEntries(allEntries);
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

  // Auto-save: read interval from admin settings, flush summary when dirty (FSD §5.7.1)
  useEffect(() => {
    if (!incident || incident.status === 'Closed') return;

    const stored = typeof window !== 'undefined' ? localStorage.getItem('admin_system_settings') : null;
    const intervalSec: number = stored ? (JSON.parse(stored).autoSaveInterval ?? 60) : 60;

    if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setInterval(async () => {
      if (summaryDirtyRef.current) {
        summaryDirtyRef.current = false;
        await updateFields({ summary: summaryDraft });
      }
    }, intervalSec * 1000);

    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incident?.id, summaryDraft]);

  // Track elapsed time since incident occurred + fire 45-min crisis reminder once
  useEffect(() => {
    if (!incident) return;
    // Reset the one-shot guards whenever a different incident is loaded
    crisisReminderFiredRef.current = false;
    ageing12FiredRef.current = false;
    ageing14FiredRef.current = false;

    const calculateTime = () => {
      const occurrenceTime = new Date(incident.dateTime).getTime();
      const diffMs = Date.now() - occurrenceTime;
      const mins = Math.floor(diffMs / (60 * 1000));
      const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      setElapsedMinutes(mins);
      setElapsedDays(days);

      // FSD §5.2: fire notification once when 45-min threshold is crossed for live incidents
      if (
        mins >= 45 &&
        !crisisReminderFiredRef.current &&
        incident.status !== 'Closed' &&
        incident.status !== 'Pending Endorsement'
      ) {
        crisisReminderFiredRef.current = true;
        addNotification({
          title: '⏱ Crisis Level Review Required',
          message: `Incident ${incident.id} has been active for ${mins} min. Review and confirm crisis level (currently Level ${incident.crisisLevel}).`,
          role: 'Controller',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
        addNotification({
          title: '⏱ Crisis Level Review Required',
          message: `Incident ${incident.id} has been active for ${mins} min. Review and confirm crisis level (currently Level ${incident.crisisLevel}).`,
          role: 'Duty Officer',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
      }

      // FSD §5.8: Incident Ageing Alerts — 12-day warning, 14-day escalation
      const isOpen = !['Closed', 'Pending Endorsement'].includes(incident.status);
      if (days >= 12 && !ageing12FiredRef.current && isOpen) {
        ageing12FiredRef.current = true;
        addNotification({
          title: '⚠️ Incident Ageing Warning (12 Days)',
          message: `Incident ${incident.id} has been open for ${days} days. Please review and take closure action.`,
          role: 'Duty Manager',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
        addNotification({
          title: '⚠️ Incident Ageing Warning (12 Days)',
          message: `Incident ${incident.id} has been open for ${days} days. Please review and take closure action.`,
          role: 'Controller',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
      }
      if (days >= 14 && !ageing14FiredRef.current && isOpen) {
        ageing14FiredRef.current = true;
        addNotification({
          title: '🚨 Incident Ageing Escalation (14 Days)',
          message: `Incident ${incident.id} has exceeded 14 days without closure. Immediate escalation required.`,
          role: 'Duty Manager',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
        addNotification({
          title: '🚨 Incident Ageing Escalation (14 Days)',
          message: `Incident ${incident.id} has exceeded 14 days without closure. Immediate escalation required.`,
          role: 'Controller',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
        addNotification({
          title: '🚨 Incident Ageing Escalation (14 Days)',
          message: `Incident ${incident.id} has exceeded 14 days without closure. Immediate escalation required.`,
          role: 'Duty Officer',
          type: 'incident',
          link: `/incidents/${incident.id}`,
        });
      }
    };
    calculateTime();
    const timer = setInterval(calculateTime, 15000); // Update every 15s
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ── Closure Broadcast: open compose modal pre-filled from the PENDING record ───
  function openClosureBroadcastModal() {
    const list = incident?.relatedBroadcasts || [];
    const bc = list.find(b => b.id === (incident as any)?.closureBroadcastId)
      || list.find(b => b.status === 'PENDING');
    setBroadcastRecipients((bc?.recipients || []).join(', '));
    setBroadcastRecipientGroups(bc?.recipientGroups || []);
    setShowRecipientEmails(false);
    setBroadcastContent(bc?.contentDispatched || '');
    setBroadcastOriginalContent(bc?.contentDispatched || '');
    setBroadcastConfirmContentChange(false);
    setShowBroadcastModal(true);
  }

  async function submitClosureBroadcast() {
    const recipients = broadcastRecipients.split(',').map(s => s.trim()).filter(Boolean);
    if (recipients.length === 0) { alert('Recipient list cannot be empty.'); return; }
    const ok = await performAction('dispatch-broadcast', {
      broadcastId: (incident as any)?.closureBroadcastId,
      recipients,
      content: broadcastContent,
      confirmContentChange: broadcastConfirmContentChange,
    });
    if (ok) setShowBroadcastModal(false);
  }

  const handleSaveEdit = async (eventNumber: number, description: string, date: string, time: string, attachments: string[]) => {
    const ok = await performAction('edit-log', { eventNumber, description, eventDate: date, eventTime: time, attachments });
    if (ok) {
      setEditingLogEventNumber(null);
      setEditingLogText('');
      setEditingLogDate('');
      setEditingLogTime('');
      setEditingLogAttachments([]);
    }
  };

  const handleDeleteLog = async (eventNumber: number) => {
    if (confirm('Are you sure you want to delete this log entry?')) {
      await performAction('delete-log', { eventNumber });
    }
  };

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

  const startMockUpload = async () => {
    if (!incident) return;
    const demoFiles = [
      { name: 'photo_scene_1.jpg', size: 1258291, type: 'image/jpeg' },
      { name: 'bwc_recording_clip.mp4', size: 16148070, type: 'video/mp4' },
      { name: 'incident_witness_statement.pdf', size: 245760, type: 'application/pdf' }
    ];
    const nextFile = demoFiles[(incident.attachments?.length || 0) % demoFiles.length];
    const newAttachment = {
      id: `ATT-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      incidentId: incident.id,
      fileName: nextFile.name,
      fileUrl: `/mock/uploads/${nextFile.name}`,
      fileType: nextFile.type,
      fileSize: nextFile.size,
      uploadedBy: username || 'Controller Steve',
      uploadedAt: new Date().toISOString()
    };
    const updated = [...(incident.attachments || []), newAttachment];
    await updateFields({ attachments: updated });
  };

  const deleteAttachment = async (attId: string) => {
    if (!incident) return;
    const updated = (incident.attachments || []).filter(a => a.id !== attId);
    await updateFields({ attachments: updated });
  };

  const handleResponderChange = (updatedList: string[]) => {
    if (updatedList.length === 0) {
      setAssignmentError('At least one Responder must remain assigned to the Incident.');
      return;
    }
    setAssignmentError('');
    setPendingResponders(updatedList);
  };

  // Removed handleAssignResponders in favor of unified handleSaveAll

  // Submit for Endorsement — standard submit if every active Responder has already
  // reached Pending Controller Review; otherwise offers Force Submit (confirm only,
  // no justification text) which locks every active Responder to Completed regardless
  // of their current stage.
  const handleSubmitEndorsement = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/submit-endorsement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role }),
      });
      if (res.ok) {
        await fetchIncidentData();
        return;
      }
      const err = await res.json();
      if (err.requiresForce) {
        const names = (err.outstandingResponders || []).join(', ');
        const confirmed = confirm(
          `The following Responder(s) have not yet reached Pending Controller Review: ${names}.\n\n` +
          `Force Submit will lock the Incident for endorsement now and mark every assigned Responder as Completed regardless of progress. Continue?`
        );
        if (confirmed) {
          const res2 = await fetch(`/api/incidents/${incidentId}/submit-endorsement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, role, force: true }),
          });
          if (res2.ok) {
            await fetchIncidentData();
          } else {
            const err2 = await res2.json();
            alert(`Force Submit failed: ${err2.error}`);
          }
        }
      } else {
        alert(`Action failed: ${err.error}`);
      }
    } catch (err: any) {
      alert(`Request error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsDuplicate = async (e: React.FormEvent) => {
    e.preventDefault();
    const masterId = linkDupId.trim();
    if (!masterId) return;
    setLinkDupError('');
    const ok = await performAction('link-duplicate', { masterIncidentId: masterId });
    if (ok) {
      setLinkDupId('');
    } else {
      setLinkDupError('Failed to link. Check that the master Incident ID exists and is not closed.');
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
  const isMgr = role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator' || role === 'Current Ops Administrator';
  const isAdmin = role === 'System Administrator';
  const isClosed = incident.status === 'Closed';

  // Per-Responder status split: each assigned Responder now has its own lifecycleStatus
  // running in parallel, instead of one shared incident.status.
  const activeResponders = (incident.responders || []).filter(r => r.status === 'Active');
  const myResponderRecord = activeResponders.find(r => r.responderId === username);
  const responderProgressLabel = computeResponderProgress(incident.responders);
  // Only Responders who actually submitted something can be returned — nothing to
  // reject yet if they're still Assigned/Acknowledged/On-Site. "Completed" only
  // counts while the Incident itself was bounced back by the Duty Manager (Returned);
  // Return-to-Responder is blocked entirely while Pending Endorsement (Controller
  // can't silently pull back a submission before the Duty Manager has acted on it).
  const returnEligibleResponders = activeResponders.filter(r =>
    r.lifecycleStatus === 'Pending Controller Review' ||
    (r.lifecycleStatus === 'Completed' && incident.status === 'Returned')
  );
  const isRangerLocked = isRanger && !!myResponderRecord && ['Pending Controller Review', 'Completed'].includes(myResponderRecord.lifecycleStatus);

  const isLocked = isClosed || (incident.status === 'Pending Endorsement' && !isMgr) || isRangerLocked;

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
      case 'completed': return '✅';
      case 'update': return '📝';
      case 'broadcast': return '📡';
      case 'closure': return '🔒';
      case 'attachment': return '📎';
      case 'submission': return '📤';
      case 'return': return '↩️';
      case 'reopen': return '🔓';
      case 'incomplete': return '⚠️';
      case 'deleted': return '🗑️';
      case 'audit': return '⚙️';
      default: return '•';
    }
  };

  const getEventBgColor = (type: string) => {
    switch (type) {
      case 'creation': return 'var(--color-info-bg)';
      case 'assignment': return 'var(--color-high-bg)';
      case 'acknowledgement': return 'var(--color-high-bg)';
      case 'onsite': return 'var(--color-active-bg)';
      case 'completed': return 'var(--color-active-bg)';
      case 'update': return 'var(--bg-inset)';
      case 'broadcast': return 'var(--color-review-bg)';
      case 'closure': return 'var(--color-active-bg)';
      case 'attachment': return 'var(--color-info-bg)';
      case 'submission': return 'var(--color-review-bg)';
      case 'return': return 'var(--color-high-bg)';
      case 'reopen': return 'var(--color-high-bg)';
      case 'incomplete': return 'var(--color-critical-bg)';
      case 'deleted': return 'var(--bg-inset)';
      case 'audit': return 'var(--bg-inset)';
      default: return 'var(--bg-inset)';
    }
  };

  const getEventBorderColor = (type: string) => {
    switch (type) {
      case 'creation': return 'var(--color-info-border)';
      case 'assignment': return 'var(--color-high-border)';
      case 'acknowledgement': return 'var(--color-high-border)';
      case 'onsite': return 'var(--color-active-border)';
      case 'completed': return 'var(--color-active-border)';
      case 'update': return 'var(--border-color)';
      case 'broadcast': return 'var(--color-review-border)';
      case 'closure': return 'var(--color-active-border)';
      case 'attachment': return 'var(--color-info-border)';
      case 'submission': return 'var(--color-review-border)';
      case 'return': return 'var(--color-high-border)';
      case 'reopen': return 'var(--color-high-border)';
      case 'incomplete': return 'var(--color-critical-border)';
      case 'deleted': return 'var(--border-color)';
      case 'audit': return 'var(--border-color)';
      default: return 'var(--border-color)';
    }
  };

  const getEventTextColor = (type: string) => {
    switch (type) {
      case 'creation': return 'var(--color-info)';
      case 'assignment': return 'var(--color-high)';
      case 'acknowledgement': return 'var(--color-high)';
      case 'onsite': return 'var(--color-active)';
      case 'completed': return 'var(--color-active)';
      case 'update': return 'var(--text-muted)';
      case 'broadcast': return 'var(--color-review)';
      case 'closure': return 'var(--color-active)';
      case 'attachment': return 'var(--color-info)';
      case 'submission': return 'var(--color-review)';
      case 'return': return 'var(--color-high)';
      case 'reopen': return 'var(--color-high)';
      case 'incomplete': return 'var(--color-critical)';
      case 'deleted': return 'var(--text-faint)';
      case 'audit': return 'var(--text-muted)';
      default: return 'var(--text-main)';
    }
  };

  // Compile unified operational timeline events
  const getTimelineEvents = () => {
    const events: {
      type: 'creation' | 'assignment' | 'acknowledgement' | 'onsite' | 'completed' | 'update' | 'broadcast' | 'closure' | 'attachment' | 'submission' | 'return' | 'incomplete' | 'reopen' | 'audit' | 'deleted';
      timestamp: string;
      title: string;
      description: string;
      actor?: string;
      attachments?: string[];
      eventNumber?: number;
      rawDescription?: string;
      isOperational: boolean;
      edited?: boolean;
      editedBy?: string;
      editedAt?: string;
      deleted?: boolean;
      deletedBy?: string;
      deletedAt?: string;
    }[] = [];

    // 1. Creation
    if (incident.dateTime) {
      events.push({
        type: 'creation',
        timestamp: incident.dateTime,
        title: 'Incident Created',
        description: `Incident logged under ID ${incident.id} (Case ID ${incident.caseId}). Title: "${incident.title}"`,
        actor: incident.createdBy,
        attachments: [],
        isOperational: false
      });
    }

    // 2. Incident logs
    incident.log.forEach(entry => {
      const entryTimeStr = `${entry.date}T${entry.time}`;
      const desc = entry.description;
      const lowerDesc = desc.toLowerCase();
      const attachments = (entry as any).attachments || [];

      if (entry.deleted) {
        events.push({
          type: 'deleted',
          timestamp: entry.deletedAt || entryTimeStr,
          title: 'Log Entry Removed',
          description: `Removed by ${entry.deletedBy}`,
          actor: entry.deletedBy,
          attachments: [],
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: true,
          deleted: true,
          deletedBy: entry.deletedBy,
          deletedAt: entry.deletedAt
        });
      } else if (lowerDesc.includes('responder assigned:') || lowerDesc.includes('responder added:') || lowerDesc.includes('responder assignment updated')) {
        events.push({
          type: 'assignment',
          timestamp: entryTimeStr,
          title: 'Responder Assigned',
          description: desc,
          actor: entry.recordedBy || 'System',
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('responder removed:')) {
        events.push({
          type: 'assignment',
          timestamp: entryTimeStr,
          title: 'Responder Removed',
          description: desc,
          actor: entry.recordedBy || 'System',
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('acknowledged dispatch')) {
        events.push({
          type: 'acknowledgement',
          timestamp: incident.acknowledgedAt || entryTimeStr,
          title: 'Dispatch Acknowledged',
          description: desc,
          actor: Array.isArray(incident.assignedTo) && incident.assignedTo.length > 0 ? incident.assignedTo.join(', ') : entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false,
          edited: entry.edited,
          editedBy: entry.editedBy,
          editedAt: entry.editedAt
        });
      } else if (lowerDesc.includes('confirmed arrival on-site')) {
        events.push({
          type: 'onsite',
          timestamp: incident.onSiteAt || entryTimeStr,
          title: 'Arrived On-Site',
          description: desc,
          actor: Array.isArray(incident.assignedTo) && incident.assignedTo.length > 0 ? incident.assignedTo.join(', ') : entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false,
          edited: entry.edited,
          editedBy: entry.editedBy,
          editedAt: entry.editedAt
        });
      } else if (lowerDesc.includes('marked ground activities completed')) {
        events.push({
          type: 'completed',
          timestamp: incident.completedAt || entryTimeStr,
          title: 'Ground Activities Completed',
          description: desc,
          actor: Array.isArray(incident.assignedTo) && incident.assignedTo.length > 0 ? incident.assignedTo.join(', ') : entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false,
          edited: entry.edited,
          editedBy: entry.editedBy,
          editedAt: entry.editedAt
        });
      } else if (lowerDesc.includes('approved and closed')) {
        events.push({
          type: 'closure',
          timestamp: incident.closedAt || entryTimeStr,
          title: 'Incident Closed & Endorsed',
          description: desc,
          actor: entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('submitted for duty manager endorsement') || lowerDesc.includes('submitted for review') || lowerDesc.includes('submitted for endorsement')) {
        events.push({
          type: 'submission',
          timestamp: entryTimeStr,
          title: 'Closure Submitted',
          description: desc,
          actor: entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('returned to controller')) {
        events.push({
          type: 'return',
          timestamp: entryTimeStr,
          title: 'Incident Returned',
          description: desc,
          actor: entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('reopened by')) {
        events.push({
          type: 'reopen',
          timestamp: entryTimeStr,
          title: 'Incident Reopened',
          description: desc,
          actor: entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('marked as incomplete')) {
        events.push({
          type: 'incomplete',
          timestamp: entryTimeStr,
          title: 'Marked Incomplete',
          description: desc,
          actor: entry.recordedBy,
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else if (lowerDesc.includes('ancillary fields updated') || lowerDesc.includes('media presence detected') || lowerDesc.includes('sdc communications team notified')) {
        events.push({
          type: 'audit',
          timestamp: entryTimeStr,
          title: lowerDesc.includes('media presence') ? 'Media Presence Detected' : lowerDesc.includes('sdc communications') ? 'Communications Team Notified' : 'Incident Details Updated',
          description: desc,
          actor: entry.recordedBy || 'System',
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: false
        });
      } else {
        const isOp = desc.startsWith('[Ranger Log]') || desc.startsWith('[MANUAL]');
        events.push({
          type: isOp ? 'update' : 'audit',
          timestamp: entryTimeStr,
          title: desc.startsWith('[Ranger Log]') ? 'Ranger Activity Update' : desc.startsWith('[MANUAL]') ? 'Chronological Log Entry' : 'Workflow Milestone',
          description: desc,
          actor: entry.recordedBy || 'System',
          attachments,
          eventNumber: entry.eventNumber,
          rawDescription: entry.description,
          isOperational: isOp,
          edited: entry.edited,
          editedBy: entry.editedBy,
          editedAt: entry.editedAt
        });
      }
    });

    // 3. Virtual Attachment Upload events
    if (incident.attachments) {
      incident.attachments.forEach(att => {
        events.push({
          type: 'attachment',
          timestamp: att.uploadedAt,
          title: 'Attachment Uploaded',
          description: `File "${att.fileName}" (${(att.fileSize / (1024 * 1024)).toFixed(2)} MB) uploaded.`,
          actor: att.uploadedBy,
          attachments: [att.fileUrl],
          isOperational: false
        });
      });
    }

    // 4. Broadcast Activities
    if (incident.relatedBroadcasts) {
      incident.relatedBroadcasts.forEach(b => {
        events.push({
          type: 'broadcast',
          timestamp: b.sentAt,
          title: `Broadcast Dispatched (${b.type || 'Notice'})`,
          description: `Template: ${b.templateUsed || (b as any).templateName || 'Standard'} | Recipients: ${(Array.isArray(b.recipients) ? b.recipients : [(b as any).recipientGroup || '']).filter(Boolean).join(', ')} | Status: ${b.status} ${b.lastErrorMessage ? `(Err: ${b.lastErrorMessage})` : ''}`,
          actor: b.sentBy,
          isOperational: false
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

  const getInjuriesBadge = () => {
    const count = incident.personalInjuries?.length || 0;
    return count > 0 ? `${count} Injured` : 'None';
  };

  const getPersonsBadge = () => {
    const count = incident.personsInvolved?.length || 0;
    return count > 0 ? `${count} Persons` : 'None';
  };

  const getDuplicatesBadge = () => {
    return incident.slaveIncidents && incident.slaveIncidents.length > 0 ? `${incident.slaveIncidents.length} DUP` : 'None';
  };

  return (
    <div className="page-content">
      {/* CSS overrides specific to this layout */}
      <style>{`
        .incident-layout-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 1rem;
        }

        /* Section A: Top Grid — two independent cards side by side (Incident
           Particulars & Location, and Responder Assignment). align-items: start
           on both levels stops one card/column from stretching to match a
           taller sibling (e.g. when the Incident Map is expanded), which was
           causing uneven column heights / broken-looking whitespace. */
        .incident-top-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
          margin-top: 20px;
          margin-bottom: 20px;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .incident-top-grid {
            grid-template-columns: 1fr;
          }
        }
        .incident-particulars-card {
          display: flex;
          flex-direction: column;
          height: 440px;
          padding: 16px 20px;
          overflow: hidden;
        }
        .incident-particulars-body {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          align-items: start;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding-right: 6px;
        }
        @media (max-width: 650px) {
          .incident-particulars-body {
            grid-template-columns: 1fr;
          }
        }
        .responder-assignment-card {
          display: flex;
          flex-direction: column;
          height: 440px;
          padding: 16px 20px;
          overflow: hidden;
        }
        .responder-assignment-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 6px;
        }
        .info-panel-col {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .info-panel-title {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-bottom: 1px dashed var(--border-color);
          padding-bottom: 4px;
          margin-bottom: 4px;
        }

        /* Section B: Operational Workspace Split */
        .workspace-split {
          display: grid;
          grid-template-columns: 4fr 6fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 1200px) {
          .workspace-split {
            grid-template-columns: 1fr;
          }
          .workspace-split > .sticky-left-col {
            order: 2;
          }
          .workspace-split > div:nth-child(2) {
            order: 1;
          }
        }

        /* Left Column — scrolls naturally with the page */
        .sticky-left-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
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
        .cd-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12.5px;
          padding: 6px 0;
          border-bottom: 1px solid var(--border-color);
        }
        .cd-info-row:last-child {
          border-bottom: none;
        }
        .cd-info-label {
          color: var(--text-muted);
          font-weight: 500;
        }
        .cd-info-value {
          text-align: right;
          color: var(--text-main);
          font-weight: 500;
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
          color: var(--color-primary-dark);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-left: 3px solid var(--color-primary);
          padding-left: 8px;
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
        .timeline-content-card.completed::before { background-color: var(--color-active); }
        .timeline-content-card.update::before { background-color: var(--color-closed); }
        .timeline-content-card.broadcast::before { background-color: var(--color-review); }
        .timeline-content-card.closure::before { background-color: #10B981; }
        .timeline-content-card.submission::before { background-color: var(--color-review); }
        .timeline-content-card.return::before { background-color: var(--color-high); }
        .timeline-content-card.reopen::before { background-color: var(--color-high); }
        .timeline-content-card.incomplete::before { background-color: var(--color-critical); }
        .timeline-content-card.audit::before { background-color: var(--border-color); }
        .timeline-content-card.attachment::before { background-color: var(--color-info); }
        
        .timeline-content-card.deleted {
          background-color: var(--bg-inset) !important;
          border: 1px dashed var(--border-color) !important;
          opacity: 0.7;
        }
        .timeline-content-card.deleted::before {
          background-color: var(--text-faint) !important;
        }
        .timeline-content-card.deleted .timeline-title {
          text-decoration: line-through;
          color: var(--text-muted);
        }
        .timeline-content-card.deleted .timeline-body {
          font-style: italic;
          color: var(--text-faint);
        }

        /* Compact Audit Timeline */
        .timeline-node.audit-node {
          gap: 12px;
          margin-bottom: 12px;
        }
        .timeline-node.audit-node .timeline-line {
          left: 13px;
          top: 28px;
          bottom: -12px;
          width: 1.5px;
        }
        .audit-icon-container {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
          flex-shrink: 0;
          font-size: 11px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.02);
          margin-left: 4px;
        }
        .audit-card {
          flex-grow: 1;
          min-width: 0;
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
          padding: 6px 12px;
          box-shadow: none;
          position: relative;
        }
        .audit-card::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          border-radius: var(--radius-sm) 0 0 var(--radius-sm);
        }
        .audit-card.creation::before { background-color: var(--color-info); }
        .audit-card.assignment::before { background-color: var(--color-high); }
        .audit-card.closure::before { background-color: #10B981; }
        .audit-card.broadcast::before { background-color: var(--color-review); }
        .audit-card.attachment::before { background-color: var(--color-info); }
        .audit-card.submission::before { background-color: var(--color-review); }
        .audit-card.return::before { background-color: var(--color-high); }
        .audit-card.reopen::before { background-color: var(--color-high); }
        .audit-card.incomplete::before { background-color: var(--color-critical); }
        .audit-card.audit::before { background-color: var(--border-color); }
        
        .audit-card .timeline-content-header {
          margin-bottom: 2px;
        }
        .audit-card .timeline-title {
          font-size: 12px;
          font-weight: 600;
        }
        .audit-card .timeline-timestamp {
          font-size: 10px;
        }
        .audit-card .timeline-body {
          font-size: 11.5px;
          color: var(--text-muted);
        }
        .audit-card .timeline-footer {
          margin-top: 2px;
          font-size: 9.5px;
        }

        /* Action Buttons on Timeline Cards */
        .timeline-card-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        .timeline-action-btn {
          background: none;
          border: none;
          padding: 0;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          cursor: pointer;
          transition: color 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .timeline-action-btn:hover {
          color: var(--color-primary);
        }
        .timeline-action-btn.delete:hover {
          color: var(--color-critical);
        }

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
          overflow: visible !important;
        }
        .right-action-panel-container {
          overflow: visible !important;
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

        .data-table {
          width: 100%;
          border-collapse: collapse;
        }
        .data-table th, .data-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
        }
        .data-table th {
          background: var(--bg-inset);
          font-weight: 600;
          color: var(--text-muted);
        }
        .data-table tr:hover td {
          background: var(--bg-hover);
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
        <div
          className="alert-banner glass"
          style={{
            marginBottom: '10px',
            background: 'rgba(239,68,68,0.10)',
            border: '1.5px solid rgba(239,68,68,0.40)',
            animation: 'crisisPulse 2s ease-in-out infinite',
            color: '#FCA5A5',
          }}
        >
          <style>{`
            @keyframes crisisPulse {
              0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.20); }
              50%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
            }
          `}</style>
          <svg width="18" height="18" fill="none" stroke="#EF4444" strokeWidth="2.2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3" />
          </svg>
          <span>
            <strong style={{ color: '#EF4444' }}>⏱ Crisis Level Review Required</strong>
            {' — '}
            {elapsedMinutes} min elapsed since incident was logged. Please review and confirm crisis level
            {' '}
            <span style={{ fontWeight: 700, color: '#EF4444' }}>Level {incident.crisisLevel}</span>.
            {' '}This reminder does not escalate the level automatically.
          </span>
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
      {incident.isDuplicate && incident.masterIncidentId && (
        <div className="alert-banner info-banner glass" style={{ marginBottom: '10px', borderColor: 'var(--color-info-border)' }}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 14.828a4 4 0 015.656 0l.868.868" />
          </svg>
          <span>
            <strong>Duplicate Record:</strong> This incident was linked as a duplicate of master incident{' '}
            <Link href={`/incidents/${incident.masterIncidentId}`} style={{ color: 'var(--color-info)', fontWeight: 700, textDecoration: 'underline' }}>
              {incident.masterIncidentId}
            </Link>
            {' — '}
            <Link href={`/cases/${incident.caseId}`} style={{ color: 'var(--color-info)', fontWeight: 700, textDecoration: 'underline' }}>
              View Case {incident.caseId}
            </Link>
          </span>
        </div>
      )}

      {/* 1. Header Card (Compact & High Density) */}
      <div className="glass" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/case-management?tab=incidents" style={{ color: 'var(--text-faint)', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
              ← BACK TO INCIDENT LOG
            </Link>
            <span style={{ color: 'var(--text-faint)' }}>&bull;</span>
            <span className="mono-id" style={{ background: 'var(--color-critical-bg)', color: 'var(--color-critical)', borderColor: 'var(--color-critical-border)', fontSize: '11px', padding: '1px 6px' }}>
              Incident: {incident.id}
            </span>
            <Link
              href={`/cases/${incident.caseId}`}
              className="mono-id"
              style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)', borderColor: 'var(--color-info-border)', fontSize: '11px', padding: '1px 6px', textDecoration: 'none' }}
            >
              Case: {incident.caseId}
            </Link>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{incident.title}</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span className={incBadgeClass(incident.status)} style={{ marginRight: 8 }}>{incident.status === 'Live (Assigned)' ? 'Assigned' : incident.status}</span>
          
          {/* Ranger Actions — gated on MY OWN Responder record's lifecycleStatus, not the shared Incident status.
              Applies to every category: confirmed with BA that an assigned Responder on a
              Backdated Incident still goes through the normal cycle if ground/post-action input is needed. */}
          {isRanger && !isClosed && myResponderRecord && (
            <>
              {myResponderRecord.lifecycleStatus === 'Assigned' && (
                <button className="btn btn-primary btn-sm" onClick={() => performAction('acknowledge', { responderId: username })} disabled={saving}>
                  Acknowledge Dispatch
                </button>
              )}
              {myResponderRecord.lifecycleStatus === 'Acknowledged' && (
                <button className="btn btn-success btn-sm" onClick={() => performAction('on-site', { responderId: username })} disabled={saving}>
                  Arrive On-Site
                </button>
              )}
              {['On-Site', 'Live (Incomplete)'].includes(myResponderRecord.lifecycleStatus) && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={async () => {
                    if (confirm('Notify Controller that your ground activities are complete?')) {
                      const ok = await performAction('notify-complete', { responderId: username });
                      // FSD §10.5 — Responder marks Incident input complete → Controller.
                      if (ok) {
                        addNotification({
                          title: '✅ Responder Marked Input Complete',
                          message: `${username} has notified completion of ground activities on Incident ${incident?.id} — awaiting your review.`,
                          role: 'Controller',
                          type: 'incident',
                          link: `/incidents/${incident?.id}`,
                        });
                      }
                    }
                  }}
                  disabled={saving}
                >
                  Notify Completion
                </button>
              )}
            </>
          )}

          {/* Controller/Admin Actions — per-Responder acknowledge/on-site/notify-complete now live in the
              Responder Assignment panel below (each Responder progresses independently). This bar keeps
              only the Incident-level actions: Return to Responder (multi-select), Submit/Force Submit for
              Endorsement, and Mark False Alarm. */}
          {isCtrl && !isClosed && (
            <>
              {['Live (Assigned)', 'Returned'].includes(incident.status) && returnEligibleResponders.length > 0 && (
                <button
                  className="btn btn-warning btn-sm"
                  onClick={() => { setReturnResponderIds([]); setReturnRemarksByResponder({}); setShowReturnToResponderModal(true); }}
                  disabled={saving}
                >
                  Return to Responder
                </button>
              )}
              {['Live (Assigned)', 'Returned'].includes(incident.status) && (
                <button className="btn btn-primary btn-sm" onClick={handleSubmitEndorsement} disabled={saving}>
                  Submit for Endorsement
                </button>
              )}
              {incident.status === 'Live' && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={async () => {
                    if (confirm('Are you sure you want to close this incident report as a FALSE ALARM?')) {
                      await performAction('mark-false-alarm', { remarks: 'Closed as False Alarm. No further action required.' });
                    }
                  }}
                  disabled={saving}
                >
                  Mark False Alarm
                </button>
              )}
            </>
          )}

          {/* Duty Manager Actions — Pending Endorsement */}
          {isMgr && incident.status === 'Pending Endorsement' && (
            <>
              <button
                className="btn btn-success btn-sm"
                onClick={() => {
                  setModalRemarks('');
                  setShowApproveModal(true);
                }}
                disabled={saving}
              >
                Approve & Close
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  setModalRemarks('');
                  setShowReturnModal(true);
                }}
                disabled={saving}
              >
                Return to Controller
              </button>
            </>
          )}

          {/* Duty Manager Actions — Returned (isCtrl already covers this for System Administrator,
              which satisfies both isCtrl and isMgr — skip here to avoid a duplicate button). */}
          {isMgr && !isCtrl && incident.status === 'Returned' && returnEligibleResponders.length > 0 && (
            <button
              className="btn btn-warning btn-sm"
              onClick={() => { setReturnResponderIds([]); setReturnRemarksByResponder({}); setShowReturnToResponderModal(true); }}
              disabled={saving}
            >
              Return to Responder
            </button>
          )}

          {/* Admin Reopen Action */}
          {isAdmin && isClosed && (
            <button className="btn btn-secondary btn-sm" onClick={() => performAction('reopen')} disabled={saving}>
              Reopen Incident
            </button>
          )}
        </div>
      </div>

      {/* Section A: Top Grid — split into two independent cards for easier
          management: Card A (Incident Particulars & Location) and Card B
          (Responder Assignment), each with its own header and edit action. */}
      <div className="incident-top-grid">
      {/* Card A: Incident Particulars & Location */}
      <div className="glass incident-particulars-card" onChangeCapture={() => isEditingInfo && setDirty(true)}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '13px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary-dark)', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>Incident Particulars & Location</h2>
          {isCtrl && !isLocked && (
            isEditingInfo ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-success btn-xs" onClick={handleSaveAll} disabled={saving} style={{ padding: '3px 12px', fontSize: 11 }}>Save Changes</button>
                <button className="btn btn-secondary btn-xs" onClick={handleCancelAll} disabled={saving} style={{ padding: '3px 12px', fontSize: 11 }}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-secondary btn-xs" onClick={handleStartEditingAll} style={{ padding: '3px 12px', fontSize: 11 }}>✏️ Edit Incident Details</button>
            )
          )}
        </div>

        {/* Scrollable body — fixed-height card, content scrolls instead of pushing the card taller */}
        <div className="incident-particulars-body">
        {/* Core Particulars */}
        <div className="info-panel-col">
          <div className="info-panel-title">General Information</div>
          {isEditingInfo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Incident Title *</label>
                <input className="form-control" type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Incident Category *</label>
                <select className="form-control select-dark" value={editCategory} onChange={e => setEditCategory(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  {INCIDENT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Incident Type *</label>
                <select className="form-control select-dark" value={editType} onChange={e => {
                  const nextType = e.target.value;
                  setEditType(nextType);
                  if (taxonomy[nextType] && taxonomy[nextType].length > 0) {
                    setEditSubType(taxonomy[nextType][0]);
                  } else {
                    setEditSubType('');
                  }
                }} style={{ padding: '4px 8px', fontSize: 12 }}>
                  <option value="">-- Select Type --</option>
                  {Object.keys(taxonomy).sort().map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Incident Sub-Type *</label>
                <select className="form-control select-dark" value={editSubType} onChange={e => setEditSubType(e.target.value)} disabled={!editType} style={{ padding: '4px 8px', fontSize: 12 }}>
                  <option value="">-- Select Sub-Type --</option>
                  {editType && taxonomy[editType]?.sort().map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Priority *</label>
                <select className="form-control select-dark" value={editPriority} onChange={e => setEditPriority(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Crisis Level *</label>
                <select className="form-control select-dark" value={editCrisisLevel} onChange={e => setEditCrisisLevel(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  <option value="1">Level 1 (Crisis)</option>
                  <option value="2">Level 2</option>
                  <option value="3">Level 3</option>
                  <option value="4">Level 4 (Default)</option>
                  <option value="5">Level 5 (Low)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reporting Source</label>
                <select className="form-control select-dark" value={editReportingSource} onChange={e => setEditReportingSource(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                  {['Public Phone', 'Email', 'UCS', 'VA', 'State Agency', 'Government Agency', 'Others'].map(source => (
                    <option key={source} value={source}>{source}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Requested By</label>
                <input className="form-control" type="text" value={editRequestedBy} onChange={e => setEditRequestedBy(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Reporter Name</label>
                <input className="form-control" type="text" value={editReporterName} onChange={e => setEditReporterName(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Date & Time of Occurrence *</label>
                <input className="form-control" type="datetime-local" value={editDateTime} onChange={e => setEditDateTime(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Category</span><span className="cd-info-value"><strong>{incident.category || DEFAULT_INCIDENT_CATEGORY}</strong></span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Incident Type</span><span className="cd-info-value"><strong>{incident.type}</strong></span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Sub-Type</span><span className="cd-info-value"><strong>{incident.subType}</strong></span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Crisis Level</span><span className="cd-info-value"><span className="badge badge-ack" style={{ background: 'var(--color-high-bg)', color: 'var(--color-high)', borderColor: 'var(--color-high-border)', fontSize: '11px', padding: '1px 6px' }}>Level {incident.crisisLevel}</span></span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Priority</span><span className="cd-info-value"><strong>{incident.priority}</strong></span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Reporting Source</span><span className="cd-info-value">{incident.reportingSource || incident.requestedBy || '—'}</span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Requested By</span><span className="cd-info-value">{incident.requestedBy || '—'}</span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Reporter Name</span><span className="cd-info-value">{incident.reporterName || 'TBD'}</span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Created By</span><span className="cd-info-value">{incident.createdBy}</span></div>
              <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Occurred</span><span className="cd-info-value">{new Date(incident.dateTime).toLocaleString('en-SG')}</span></div>
            </div>
          )}
        </div>

        {/* Column 2: Location Info & Responder Assignment (stacked) */}
        <div className="info-panel-col" style={{ gap: '20px' }}>
          {/* Location Info */}
          <div>
            <div className="info-panel-title">Location</div>
            {isEditingInfo ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Common Name</label>
                  <input className="form-control" type="text" value={editCommonName} onChange={e => setEditCommonName(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Road</label>
                  <input className="form-control" type="text" value={editRoad} onChange={e => setEditRoad(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Building</label>
                  <input className="form-control" type="text" value={editBuilding} onChange={e => setEditBuilding(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Level & Space</label>
                  <input className="form-control" type="text" value={editLevelSpace} onChange={e => setEditLevelSpace(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Beside / Near To / At</label>
                  <input className="form-control" type="text" value={editNearAt} onChange={e => setEditNearAt(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Postal Code</label>
                  <input className="form-control" type="text" value={editPostalCode} onChange={e => setEditPostalCode(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Location Tags (Comma separated)</label>
                  <input className="form-control" type="text" value={editTagsStr} onChange={e => setEditTagsStr(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} placeholder="e.g. Siloso, Beachfront" />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Common Name</span><span className="cd-info-value"><strong>{incident.location.commonName || '—'}</strong></span></div>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Road</span><span className="cd-info-value">{incident.location.road || '—'}</span></div>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Building</span><span className="cd-info-value">{incident.location.building || '—'}</span></div>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Level & Space</span><span className="cd-info-value">{incident.location.levelSpace || '—'}</span></div>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Beside/Near/At</span><span className="cd-info-value">{incident.location.nearAt || '—'}</span></div>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Postal Code</span><span className="cd-info-value">{incident.location.postalCode}</span></div>
                <div className="cd-info-row" style={{ height: 'auto', minHeight: '34px', padding: '4px 0' }}>
                  <span className="cd-info-label">Location Tags</span>
                  <span className="cd-info-value" style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 4, marginBottom: 4 }}>
                    {incident.location.tags && incident.location.tags.length > 0 ? (
                      incident.location.tags.map((t, idx) => (
                        <span key={idx} style={{ background: '#F4F1EA', color: '#2B1F1D', border: '1px solid #E6DFD5', borderRadius: '4px', padding: '1px 6px', fontSize: '10.5px', fontWeight: '500' }}>{t}</span>
                      ))
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>None</span>
                    )}
                  </span>
                </div>
                <div className="cd-info-row" style={{ padding: '4px 0' }}><span className="cd-info-label">Coordinates</span><span className="cd-info-value" style={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}>{incident.location.lat.toFixed(5)}, {incident.location.lng.toFixed(5)}</span></div>
              </div>
            )}
          </div>

          {/* Incident Map — moved here below Location, collapsible so it doesn't push the
              rest of the page down when the Responder Assignment column needs more room. */}
          <div style={{ marginTop: '12px' }}>
            <div
              className="info-panel-title"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              onClick={() => setMapExpanded(v => !v)}
            >
              <span>Incident Map</span>
              <span style={{ fontSize: 10 }}>{mapExpanded ? '▼' : '▶'}</span>
            </div>
            {mapExpanded && (
              <div style={{ height: '220px', minHeight: '220px', overflow: 'hidden' }}>
                {incident.location.lat && incident.location.lng ? (
                  <IncidentMap
                    lat={incident.location.lat}
                    lng={incident.location.lng}
                    commonName={incident.location.commonName}
                    road={incident.location.road}
                    priority={incident.priority}
                    type={incident.type}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-inset)', color: 'var(--text-faint)', fontSize: '12px' }}>
                    Coordinates unavailable
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      {/* Card B: Responder Assignment — its own fully independent card, same
          level as Card A, with its own Edit Assignee action (decoupled from
          "Edit Incident Details") and full per-Responder status tracking. */}
      <div className="glass responder-assignment-card">
        <div className="info-panel-col" style={{ height: '100%', minHeight: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: '10px', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '13px', fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary-dark)', borderLeft: '3px solid var(--color-primary)', paddingLeft: '8px' }}>Responder Assignment</h2>
            {isCtrl && !isLocked && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                style={{ padding: '3px 10px', fontSize: 11 }}
                onClick={() => setShowResponderManager(v => !v)}
              >
                {showResponderManager ? 'Close' : '✏️ Edit Assignee'}
              </button>
            )}
          </div>
          {responderProgressLabel && (
            <div style={{ textAlign: 'right', fontSize: '10.5px', fontWeight: 700, color: 'var(--text-muted)' }}
              title="Display-only aggregation — does not affect workflow or permissions">
              {responderProgressLabel}
            </div>
          )}
          {/* Scrollable body — fixed-height card, content scrolls instead of pushing the card taller */}
          <div className="responder-assignment-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeResponders.length > 0 ? (
              activeResponders.map(r => {
                const isMe = r.responderId === username;
                return (
                  <div
                    key={r.responderId}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 4,
                      padding: '6px 8px', borderRadius: '6px',
                      background: isMe ? 'var(--bg-inset)' : 'transparent',
                      border: '1px solid var(--border-color)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '12px', fontWeight: isMe ? 700 : 500 }}>{r.responderId}</span>
                        <span className={responderBadgeClass(r.lifecycleStatus)} style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {r.lifecycleStatus}
                        </span>
                      </div>
                      {/* Controller can advance (or correct) any Responder's lifecycle on their
                          behalf — applies to every category (confirmed with BA, same standard
                          lifecycle throughout). Status dropdown lets the Controller jump straight
                          to a target state instead of clicking through one step at a time; see
                          RESPONDER_STATUS_DROPDOWN_PLAN.md. */}
                      {isCtrl && !isLocked && (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          {RESPONDER_STATUS_DROPDOWN_ORDER.includes(r.lifecycleStatus) && (
                            <select
                              className={`responder-status-select responder-status-select--${responderSelectTone(r.lifecycleStatus)}`}
                              value={r.lifecycleStatus}
                              disabled={saving}
                              onChange={(e) => {
                                const newStatus = e.target.value;
                                if (newStatus === r.lifecycleStatus) return;
                                const fromIdx = RESPONDER_STATUS_DROPDOWN_ORDER.indexOf(r.lifecycleStatus);
                                const toIdx = RESPONDER_STATUS_DROPDOWN_ORDER.indexOf(newStatus);
                                const skipped = RESPONDER_STATUS_DROPDOWN_ORDER.slice(
                                  Math.min(fromIdx, toIdx) + 1, Math.max(fromIdx, toIdx)
                                );
                                const isSingleForwardStep = toIdx === fromIdx + 1;
                                if (!isSingleForwardStep) {
                                  const direction = toIdx > fromIdx ? 'forward' : 'backward';
                                  const skipNote = skipped.length ? ` This will skip: ${skipped.join(', ')}.` : '';
                                  const confirmed = confirm(
                                    `Move ${r.responderId} ${direction} from "${r.lifecycleStatus}" to "${newStatus}"?${skipNote}`
                                  );
                                  if (!confirmed) return;
                                }
                                performAction('set-responder-status', { responderId: r.responderId, status: newStatus });
                              }}
                            >
                              {RESPONDER_STATUS_DROPDOWN_ORDER.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          )}
                          {r.lifecycleStatus === 'Live (Incomplete)' && (
                            <button className="btn btn-secondary btn-sm" style={{ fontSize: '10.5px', padding: '2px 6px' }}
                              onClick={async () => {
                                const ok = await performAction('notify-complete', { responderId: r.responderId });
                                // FSD §10.5 — Responder marks Incident input complete → Controller.
                                if (ok) {
                                  addNotification({
                                    title: '✅ Responder Marked Input Complete',
                                    message: `${r.responderId} has notified completion of ground activities on Incident ${incident?.id} — awaiting your review.`,
                                    role: 'Controller',
                                    type: 'incident',
                                    link: `/incidents/${incident?.id}`,
                                  });
                                }
                              }}
                              disabled={saving}>
                              Notify Completion
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Surfaces the Controller's Completion Remarks back to whoever is looking —
                        this Responder included — instead of the remark being write-only. */}
                    {r.lifecycleStatus === 'Live (Incomplete)' && r.completionRemarks && (
                      <div style={{
                        fontSize: '11px', color: '#C05621', background: 'rgba(234, 88, 12, 0.08)',
                        border: '1px solid rgba(234, 88, 12, 0.25)', borderRadius: '4px', padding: '4px 6px'
                      }}>
                        <strong>Return reason:</strong> {r.completionRemarks}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <span style={{ color: 'var(--text-faint)', fontSize: '12px', fontStyle: 'italic' }}>Unassigned</span>
            )}
          </div>

          {isCtrl && !isLocked && showResponderManager && (
            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 10, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)' }}>ASSIGN / REASSIGN RESPONDERS</label>
                {pendingResponders !== null && JSON.stringify(pendingResponders) !== JSON.stringify(Array.isArray(incident.assignedTo) ? incident.assignedTo : []) && (
                  <span style={{ fontSize: 10, color: 'var(--color-warning)', fontWeight: 600 }}>● Unsaved</span>
                )}
              </div>
              <MultiResponderSelect
                value={pendingResponders ?? (Array.isArray(incident.assignedTo) ? incident.assignedTo : [])}
                onChange={handleResponderChange}
                disabled={saving}
                allowEmpty={false}
              />
              {assignmentError && (
                <div style={{ marginTop: 6, color: 'var(--color-critical)', fontSize: 11 }}>
                  ⚠️ {assignmentError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setPendingResponders(null); setAssignmentError(''); setShowResponderManager(false); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success btn-sm"
                  onClick={handleSaveResponders}
                  disabled={saving}
                >
                  Save Responders
                </button>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
      </div>

      {/* Section B: Operational Workspace Tabs */}
      <div className="workspace-tabs-container">
        <div className="tabs-bar" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 10 }}>
          <button
            type="button"
            className={`tab-btn ${activeTimelineTab === 'log' ? 'active' : ''}`}
            onClick={() => {
              setActiveTimelineTab('log');
              setEditingLogEventNumber(null);
            }}
          >
            Incident Details
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTimelineTab === 'system' ? 'active' : ''}`}
            onClick={() => {
              setActiveTimelineTab('system');
              setEditingLogEventNumber(null);
            }}
          >
            System Activity
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTimelineTab === 'faults' ? 'active' : ''}`}
            onClick={() => {
              setActiveTimelineTab('faults');
              setEditingLogEventNumber(null);
            }}
          >
            Linked Records ({(incident.relatedFaults?.length || 0) + linkedEDiaryEntries.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTimelineTab === 'duplicates' ? 'active' : ''}`}
            onClick={() => {
              setActiveTimelineTab('duplicates');
              setEditingLogEventNumber(null);
            }}
          >
            Duplicate Reports ({incident.slaveIncidents?.length || 0})
          </button>
        </div>

        {/* Tab 1: Incident Details Split Layout */}
        {activeTimelineTab === 'log' && (
          <div className="workspace-split">
            {/* Left Column (40% - Sticky Reference Accordions) */}
            <div className="sticky-left-col">
              <div className="accordion-container">
            
            {/* Accordion: Summary & Closure */}
            <div className="accordion-item">
              <div className="accordion-header" style={{ cursor: 'default' }}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">Summary & Closure</h3>
                  <span className={`accordion-badge ${incident.summary ? 'active' : 'none'}`}>
                    {incident.summary ? 'Ready' : 'Pending'}
                  </span>
                </div>
              </div>
              <div className="accordion-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Incident Summary</h4>
                  {!isLocked ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={summaryDraft}
                        placeholder="Provide a detailed operational summary of the incident..."
                        onChange={e => {
                          setSummaryDraft(e.target.value);
                          summaryDirtyRef.current = true;
                        }}
                        onBlur={() => {
                          if (summaryDirtyRef.current) {
                            summaryDirtyRef.current = false;
                            updateFields({ summary: summaryDraft });
                          }
                        }}
                        style={{ fontSize: 12.5 }}
                      />
                    </div>
                  ) : (
                    <div className="inset-panel" style={{ padding: 12, fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                      {incident.summary || <span style={{ fontStyle: 'italic', color: 'var(--text-faint)' }}>No summary recorded.</span>}
                    </div>
                  )}
                </div>
                
                {incident.completionRemarks && (
                  <div>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Completion Remarks</h4>
                    <div className="inset-panel" style={{ padding: 10, fontSize: 12, fontStyle: 'italic', background: 'var(--bg-inset)' }}>
                      {incident.completionRemarks}
                    </div>
                  </div>
                )}

                {isClosed && (
                  <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Closure Metadata</h4>
                    <div className="cd-info-row">
                      <span className="cd-info-label">Closed By</span>
                      <span className="cd-info-value">{incident.closedBy || 'System/Duty Manager'}</span>
                    </div>
                    <div className="cd-info-row">
                      <span className="cd-info-label">Closed At</span>
                      <span className="cd-info-value">{incident.closedAt ? new Date(incident.closedAt).toLocaleString('en-SG') : '—'}</span>
                    </div>
                    <div className="cd-info-row">
                      <span className="cd-info-label">Closure Broadcast</span>
                      <span className="cd-info-value">
                        {(incident as any).closureBroadcastStatus === 'pending' && (
                          <>
                            <span className="badge" style={{ background: 'var(--color-high-bg)', color: 'var(--color-high)', borderColor: 'var(--color-high-border)', fontSize: 10 }}>⏳ Pending Broadcast</span>
                            {hasBroadcastPermission(role, 'broadcast.dispatch') && (
                              <button className="btn btn-primary btn-sm" style={{ marginLeft: 8 }} onClick={openClosureBroadcastModal} disabled={saving}>Review &amp; Dispatch</button>
                            )}
                          </>
                        )}
                        {(incident as any).closureBroadcastStatus === 'dispatched' && (
                          <span className="badge badge-closed" style={{ fontSize: 10 }}>✓ Dispatched</span>
                        )}
                        {(incident as any).closureBroadcastStatus === 'not_required' && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Not required</span>
                        )}
                        {!(incident as any).closureBroadcastStatus && (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Closure Broadcast compose/dispatch modal (FSD §5.11.1b / §10.1) */}
            {showBroadcastModal && (
              <div onClick={() => setShowBroadcastModal(false)}
                style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
                <div onClick={(e) => e.stopPropagation()} className="glass"
                  style={{ width: 'min(560px, 94vw)', maxHeight: '88vh', overflowY: 'auto', padding: 24 }}>
                  <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700 }}>Perform Closure Broadcast</h3>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                    Review the pre-filled recipients and content, then dispatch. Broadcast ID: {(incident as any)?.closureBroadcastId || '—'}
                  </div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Recipients</label>
                  <div style={{ margin: '4px 0 14px' }}>
                    {broadcastRecipientGroups.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                        {broadcastRecipientGroups.map((g) => (
                          <span key={g} style={{
                            padding: '3px 9px', borderRadius: 5, fontSize: 11.5, fontWeight: 600,
                            background: 'var(--sidebar-active-bg, #FFF7ED)', color: 'var(--color-primary-dark, #C2410C)',
                            border: '1px solid rgba(255, 130, 0, 0.25)', display: 'inline-flex', alignItems: 'center', lineHeight: 1.2,
                          }}>{g}</span>
                        ))}
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {broadcastRecipients.split(',').map(s => s.trim()).filter(Boolean).length} recipient(s)
                        </span>
                        <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }}
                          onClick={() => setShowRecipientEmails(v => !v)}>
                          {showRecipientEmails ? 'Hide emails' : 'Edit emails'}
                        </button>
                      </div>
                    ) : null}
                    {(showRecipientEmails || broadcastRecipientGroups.length === 0) && (
                      <textarea value={broadcastRecipients} onChange={(e) => setBroadcastRecipients(e.target.value)}
                        rows={3} placeholder="comma-separated emails"
                        style={{ width: '100%', marginTop: broadcastRecipientGroups.length > 0 ? 8 : 0, padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'inherit' }} />
                    )}
                  </div>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Content</label>
                  <textarea value={broadcastContent} onChange={(e) => setBroadcastContent(e.target.value)}
                    rows={10} style={{ width: '100%', margin: '4px 0 16px', padding: 10, borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontFamily: 'monospace' }} />
                  {broadcastContent !== broadcastOriginalContent && (
                    <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-high)', marginBottom: 4 }}>
                        Content edited beyond the auto-filled default (§10.4d)
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                        <input type="checkbox" checked={broadcastConfirmContentChange}
                          onChange={(e) => setBroadcastConfirmContentChange(e.target.checked)} />
                        I confirm (Duty Manager) this edited content does not include operationally sensitive, under-investigation, or restricted information beyond the standard template — or I am authorised to include it.
                      </label>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowBroadcastModal(false)} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={submitClosureBroadcast} disabled={saving}>
                      {saving ? 'Dispatching…' : 'Dispatch Broadcast'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Accordion: Emergency Services */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('emergency')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">4. Emergency Services</h3>
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
                        disabled={isLocked} />
                      Police present at scene
                    </label>
                    {incident.emergencyServices.policeAtScene && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Officer Name & Rank</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.officerNameRank}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, officerNameRank: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Police Report ID</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.policeIncidentNo}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, policeIncidentNo: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Classification</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.classification || ''}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, classification: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Responding Unit</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.respondingUnit || ''}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, respondingUnit: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
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
                        disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }}>
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
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Call Sign</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.ambulanceCallSign}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceCallSign: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Responding Unit</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.ambulanceRespondingUnit || ''}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceRespondingUnit: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Arrival Time</label>
                          <input className="form-control" type="time" value={incident.emergencyServices.ambulanceArrivalTime || ''}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, ambulanceArrivalTime: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Hospital Conveyed To</label>
                          <input className="form-control" type="text" value={incident.emergencyServices.hospitalConveyedTo}
                            onChange={e => updateFields({ emergencyServices: { ...incident.emergencyServices, hospitalConveyedTo: e.target.value } })}
                            disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
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
                  <h3 className="accordion-title">5. Media Involvement</h3>
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
                      onChange={async e => {
                        const flaggedNow = e.target.checked && !incident.mediaInvolvement.mediaAtScene;
                        await updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, mediaAtScene: e.target.checked } });
                        // FSD §10.8 — media presence at scene triggers an SDC Communications
                        // Team notification; Duty Manager reviews and assigns to Controller.
                        if (flaggedNow) {
                          addNotification({
                            title: '📷 Media Presence — Communications Action Required',
                            message: `Media reported at scene for Incident ${incident.id}. Notify the SDC Communications Team and assign follow-up.`,
                            role: 'Duty Manager',
                            type: 'incident',
                            link: `/incidents/${incident.id}`,
                          });
                          addNotification({
                            title: '📷 Media Presence — Communications Action Required',
                            message: `Media reported at scene for Incident ${incident.id}. Coordinate with the SDC Communications Team.`,
                            role: 'Controller',
                            type: 'incident',
                            link: `/incidents/${incident.id}`,
                          });
                        }
                      }}
                      disabled={isLocked} />
                    Press/Media present at scene
                  </label>
                  {incident.mediaInvolvement.mediaAtScene && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Media Outlet Name</label>
                        <input className="form-control" type="text" value={incident.mediaInvolvement.mediaName}
                          onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, mediaName: e.target.value } })}
                          disabled={isLocked} style={{ padding: '4px 8px', fontSize: 12 }} />
                      </div>
                      <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: 'var(--color-high)' }}>
                        <strong>⚠ COMMUNICATIONS ACTION:</strong> Media presence flags an automatic trigger. Notify SDC Communications team.
                        <label className="checkbox-row" style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input type="checkbox" checked={incident.mediaInvolvement.commsNotified}
                            onChange={e => updateFields({ mediaInvolvement: { ...incident.mediaInvolvement, commsNotified: e.target.checked } })}
                            disabled={isLocked} />
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
                  <h3 className="accordion-title">6. Property & Vehicles</h3>
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
                        disabled={isLocked} />
                      SDC Property Damaged
                    </label>
                    {incident.propertyDamage.sdcPropertyDamaged && (
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Description of Damage</label>
                        <textarea className="form-control" rows={2} value={incident.propertyDamage.description}
                          onChange={e => updateFields({ propertyDamage: { ...incident.propertyDamage, description: e.target.value } })}
                          disabled={isLocked} style={{ fontSize: 12 }} />
                      </div>
                    )}
                  </div>
                  <div className="section-separator" style={{ margin: '8px 0' }} />
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>Vehicles Involved</h4>
                    </div>

                    {!isLocked && (
                      <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input type="checkbox" id="veh-sdc-checkbox" checked={vehSdc} onChange={e => setVehSdc(e.target.checked)} />
                          <label htmlFor="veh-sdc-checkbox" style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>SDC Vehicle Involved</label>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="form-control" placeholder="Model *" value={vehModel} onChange={e => setVehModel(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                          <input className="form-control" placeholder="Plate Number *" value={vehPlate} onChange={e => setVehPlate(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="form-control" placeholder="Driver Name" value={vehDriverName} onChange={e => setVehDriverName(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                          <input className="form-control" placeholder="Driver Contact" value={vehDriverContact} onChange={e => setVehDriverContact(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <input className="form-control" placeholder="Driving Licence No" value={vehLicence} onChange={e => setVehLicence(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <input className="form-control" placeholder="Driver Address" value={vehAddress} onChange={e => setVehAddress(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <input className="form-control" placeholder="Remarks" value={vehRemarks} onChange={e => setVehRemarks(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <button type="button" className="btn btn-primary btn-xs" onClick={async () => {
                          if (!vehModel.trim() || !vehPlate.trim()) {
                            alert('Vehicle Model and Plate Number are required.');
                            return;
                          }
                          const updated = [...(incident.vehiclesInvolved || []), {
                            sdcVehicleInvolved: vehSdc,
                            vehicleModel: vehModel,
                            vehicleNumber: vehPlate,
                            driverName: vehDriverName,
                            driverContact: vehDriverContact,
                            drivingLicenceNo: vehLicence,
                            driverAddress: vehAddress,
                            remarks: vehRemarks
                          }];
                          await updateFields({ vehiclesInvolved: updated });
                          setVehSdc(false); setVehModel(''); setVehPlate(''); setVehDriverName(''); setVehDriverContact(''); setVehLicence(''); setVehAddress(''); setVehRemarks('');
                        }}>Add Vehicle</button>
                      </div>
                    )}

                    {incident.vehiclesInvolved && incident.vehiclesInvolved.length > 0 ? (
                      incident.vehiclesInvolved.map((v, i) => (
                        <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 11, position: 'relative' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 600 }}>
                              {v.vehicleModel} ({v.vehicleNumber})
                              {v.sdcVehicleInvolved && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '2px 4px', borderRadius: 3, fontWeight: 700 }}>SDC VEH</span>}
                            </div>
                            {!isLocked && (
                              <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={async () => {
                                const updated = incident.vehiclesInvolved.filter((_, idx) => idx !== i);
                                await updateFields({ vehiclesInvolved: updated });
                              }}>✕</button>
                            )}
                          </div>
                          <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>Driver: {v.driverName || '—'} &bull; Tel: {v.driverContact || '—'}</div>
                          {v.drivingLicenceNo && <div style={{ color: 'var(--text-muted)' }}>Licence No: {v.drivingLicenceNo}</div>}
                          {v.driverAddress && <div style={{ color: 'var(--text-muted)' }}>Address: {v.driverAddress}</div>}
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

            {/* Accordion: Personal Injuries */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('injuries')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">7. Personal Injuries</h3>
                  <span className={`accordion-badge ${getInjuriesBadge() !== 'None' ? 'active' : 'none'}`}>
                    {getInjuriesBadge()}
                  </span>
                </div>
                <span>{openSections.injuries ? '▼' : '▶'}</span>
              </div>
              {openSections.injuries && (
                <div className="accordion-content">
                  {!isLocked && (
                    <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input className="form-control" placeholder="Clinic or Hospital Attended" value={injHospital} onChange={e => setInjHospital(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" id="inj-msig-checkbox" checked={injMsig} onChange={e => setInjMsig(e.target.checked)} />
                        <label htmlFor="inj-msig-checkbox" style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>MSIG Form Issued</label>
                      </div>
                      {injMsig && (
                        <input className="form-control" placeholder="MSIG Serial Number" value={injMsigSerial} onChange={e => setInjMsigSerial(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      )}
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" id="inj-u16-checkbox" checked={injU16} onChange={e => setInjU16(e.target.checked)} />
                        <label htmlFor="inj-u16-checkbox" style={{ fontSize: 11, cursor: 'pointer', userSelect: 'none' }}>Under-16 Indicator</label>
                      </div>
                      {injU16 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, background: 'var(--bg-inset)', borderRadius: 5 }}>
                          <input className="form-control" placeholder="Parent or Guardian Name" value={parentName} onChange={e => setParentName(e.target.value)} style={{ padding: '4px 8px', fontSize: 11 }} />
                          <input className="form-control" placeholder="Parent or Guardian Contact" value={parentTel} onChange={e => setParentTel(e.target.value)} style={{ padding: '4px 8px', fontSize: 11 }} />
                        </div>
                      )}
                      <button type="button" className="btn btn-primary btn-xs" onClick={() => {
                        const updated = [...incident.personalInjuries, {
                          clinicHospitalAttended: injHospital,
                          msigFormIssued: injMsig,
                          msigSerialNo: injMsig ? injMsigSerial : '',
                          under16: injU16,
                          parentGuardianName: parentName,
                          parentGuardianContact: parentTel
                        }];
                        updateFields({ personalInjuries: updated });
                        setInjHospital(''); setInjU16(false); setParentName(''); setParentTel(''); setInjMsig(false); setInjMsigSerial('');
                      }}>Add Injury</button>
                    </div>
                  )}
                  {incident.personalInjuries.length === 0 ? (
                    <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', margin: '4px 0' }}>No injuries recorded.</p>
                  ) : incident.personalInjuries.map((inj, i) => (
                    <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 12, position: 'relative' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600 }}>
                          {inj.clinicHospitalAttended || 'Injury Record'}
                          {inj.under16 && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--color-critical-bg)', color: 'var(--color-critical)', padding: '2px 4px', borderRadius: 3, fontWeight: 700 }}>U-16</span>}
                          {inj.msigFormIssued && <span style={{ marginLeft: 6, fontSize: 9, background: 'var(--color-info-bg)', color: 'var(--color-info)', padding: '2px 4px', borderRadius: 3, fontWeight: 700 }}>MSIG</span>}
                        </div>
                        {!isLocked && (
                          <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={async () => {
                            const updated = incident.personalInjuries.filter((_, idx) => idx !== i);
                            await updateFields({ personalInjuries: updated });
                          }}>✕</button>
                        )}
                      </div>
                      {inj.msigFormIssued && inj.msigSerialNo && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>MSIG Serial No: {inj.msigSerialNo}</div>}
                      {inj.under16 && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>Guardian: {inj.parentGuardianName} ({inj.parentGuardianContact})</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Accordion: Persons Involved */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('persons')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">8. Persons Involved</h3>
                  <span className={`accordion-badge ${getPersonsBadge() !== 'None' ? 'active' : 'none'}`}>
                    {getPersonsBadge()}
                  </span>
                </div>
                <span>{openSections.persons ? '▼' : '▶'}</span>
              </div>
              {openSections.persons && (
                <div className="accordion-content">
                  {!isLocked && (
                      <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <select className="form-control select-dark" value={pGuestOrNon} onChange={e => setPGuestOrNon(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                            <option value="Guest">Guest</option>
                            <option value="Non-Guest">Non-Guest</option>
                          </select>
                          <select className="form-control select-dark" value={pType} onChange={e => setPType(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                            {['Guest','Staff','Island Partner','Contractor','Resident','Others'].map(o => <option key={o}>{o}</option>)}
                          </select>
                        </div>
                        <input className="form-control" placeholder="Full Name *" value={pName} onChange={e => setPName(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input className="form-control" type="number" placeholder="Age" value={pAge} onChange={e => setPAge(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                          <select className="form-control select-dark" value={pGender} onChange={e => setPGender(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                          </select>
                          <input className="form-control" placeholder="Contact No" value={pContact} onChange={e => setPContact(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        </div>
                        <input className="form-control" placeholder="Address" value={pAddress} onChange={e => setPAddress(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <select className="form-control select-dark" value={pRole} onChange={e => setPRole(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                          {['Witness','Bystander','Subject','Other'].map(o => <option key={o}>{o}</option>)}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="checkbox"
                            id="p-injured"
                            checked={pInjured}
                            onChange={e => { setPInjured(e.target.checked); if (!e.target.checked) setPInjuryDetails(''); }}
                            style={{ width: 14, height: 14, cursor: 'pointer' }}
                          />
                          <label htmlFor="p-injured" style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer', fontSize: 12 }}>Injured</label>
                        </div>
                        {pInjured && (
                          <textarea className="form-control" rows={2} placeholder="Describe injury details..." value={pInjuryDetails} onChange={e => setPInjuryDetails(e.target.value)} style={{ padding: '4px 8px', fontSize: 12, marginTop: 4 }} />
                        )}
                        <button type="button" className="btn btn-primary btn-xs" onClick={() => {
                          if (!pName) return;
                          const updated = [...incident.personsInvolved, {
                            guestOrNonGuest: pGuestOrNon,
                            type: pType,
                            name: pName,
                            address: pAddress,
                            age: parseInt(pAge, 10) || 0,
                            gender: pGender,
                            contactNumber: pContact,
                            roleInvolvement: pRole,
                            injuryDetails: pInjuryDetails
                          }];
                          updateFields({ personsInvolved: updated });
                          setPName(''); setPContact(''); setPRole('Witness'); setPGuestOrNon('Guest'); setPAge(''); setPGender('Male'); setPAddress(''); setPInjured(false); setPInjuryDetails('');
                        }}>Add Person</button>
                      </div>
                    )}
                    {incident.personsInvolved.length === 0 ? (
                      <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>No other persons recorded.</p>
                    ) : incident.personsInvolved.map((p, i) => (
                      <div key={i} className="inset-panel" style={{ padding: 10, marginBottom: 8, fontSize: 12, position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 600 }}>{p.name} ({p.type} &bull; {p.guestOrNonGuest})</div>
                          {!isLocked && (
                            <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={async () => {
                              const updated = incident.personsInvolved.filter((_, idx) => idx !== i);
                              await updateFields({ personsInvolved: updated });
                            }}>✕</button>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Role: {p.roleInvolvement} &bull; Tel: {p.contactNumber || '—'}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Age: {p.age || '—'} &bull; Gender: {p.gender || '—'}</div>
                        {p.address && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Address: {p.address}</div>}
                        {p.injuryDetails ? (
                          <div style={{ fontSize: 11, color: 'var(--color-critical)', fontStyle: 'italic', marginTop: 4 }}>⚠ Injured: {p.injuryDetails}</div>
                        ) : null}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Accordion: CCTV */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('cctv')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">9. CCTV & Body Worn Camera</h3>
                  <span className={`accordion-badge ${incident.cctvBwc && incident.cctvBwc.length > 0 ? 'active' : 'none'}`}>
                    {getCctvBadge()}
                  </span>
                </div>
                <span>{openSections.cctv ? '▼' : '▶'}</span>
              </div>
              {openSections.cctv && (
                <div className="accordion-content">
                  {!isLocked && (
                    <div style={{ border: '1px dashed var(--border-color)', borderRadius: 6, padding: 10, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input className="form-control" placeholder="CCTV Camera No" value={cctvCameraNo} onChange={e => setCctvCameraNo(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <input className="form-control" type="time" placeholder="VMS Timestamp" value={cctvVmsTimestamp} onChange={e => setCctvVmsTimestamp(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      </div>
                      <input className="form-control" placeholder="VMS Bookmark Name" value={cctvBookmark} onChange={e => setCctvBookmark(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input className="form-control" placeholder="BWC Camera No" value={cctvBwcNo} onChange={e => setCctvBwcNo(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                        <input className="form-control" type="time" placeholder="BWC Timestamp" value={cctvBwcTimestamp} onChange={e => setCctvBwcTimestamp(e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }} />
                      </div>
                      <button type="button" className="btn btn-primary btn-xs" onClick={() => {
                        const updated = [...(incident.cctvBwc || []), {
                          cameraNumber: cctvCameraNo,
                          vmsTimestamp: cctvVmsTimestamp,
                          vmsBookmark: cctvBookmark,
                          bwcNumber: cctvBwcNo,
                          bwcTimestamp: cctvBwcTimestamp
                        }];
                        updateFields({ cctvBwc: updated });
                        setCctvCameraNo(''); setCctvVmsTimestamp(''); setCctvBookmark(''); setCctvBwcNo(''); setCctvBwcTimestamp('');
                      }}>Add Camera Reference</button>
                    </div>
                  )}

                  {incident.cctvBwc && incident.cctvBwc.length > 0 ? (
                    incident.cctvBwc.map((cam, idx) => (
                      <div key={idx} style={{ padding: '8px 10px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 5, marginBottom: 8, fontSize: 12, position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ fontWeight: 600 }}>CCTV: {cam.cameraNumber || '—'}</div>
                          {!isLocked && (
                            <button type="button" style={{ background: 'transparent', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontSize: 13, padding: 0 }} onClick={async () => {
                              const updated = incident.cctvBwc.filter((_, i) => i !== idx);
                              await updateFields({ cctvBwc: updated });
                            }}>✕</button>
                          )}
                        </div>
                        {cam.vmsTimestamp && <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>VMS Time: {cam.vmsTimestamp}</div>}
                        {cam.vmsBookmark && <div style={{ color: 'var(--text-muted)' }}>Bookmark: {cam.vmsBookmark}</div>}
                        {cam.bwcNumber && <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>BWC: {cam.bwcNumber} {cam.bwcTimestamp ? `@ ${cam.bwcTimestamp}` : ''}</div>}
                      </div>
                    ))
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', textAlign: 'center', margin: 0 }}>No cameras referenced.</p>
                  )}
                </div>
              )}
            </div>

            {/* Duplicate Accordion removed (promoted to Tab 4) */}


            {/* Accordion: Attachments */}
            <div className="accordion-item">
              <div className="accordion-header" onClick={() => toggleSection('attachments')}>
                <div className="accordion-header-left">
                  <h3 className="accordion-title">10. Attachments</h3>
                  <span className={`accordion-badge ${(incident.attachments && incident.attachments.length > 0) ? 'active' : 'none'}`}>
                    {incident.attachments && incident.attachments.length > 0 ? `${incident.attachments.length} files` : 'None'}
                  </span>
                </div>
                <span>{openSections.attachments ? '▼' : '▶'}</span>
              </div>
              {openSections.attachments && (
                <div className="accordion-content">
                  {!isLocked && (
                    <div 
                      className="mock-dropzone"
                      onClick={startMockUpload}
                      style={{
                        border: '2px dashed var(--border-color)',
                        borderRadius: '8px',
                        padding: '20px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'var(--bg-inset)',
                        transition: 'border-color 0.2s'
                      }}
                    >
                      <span style={{ fontSize: '24px' }}>📁</span>
                      <div style={{ marginTop: '8px', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>Click here to simulate file upload</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '4px' }}>
                        Accepted formats: Photos, Videos, and Document files.
                      </div>
                    </div>
                  )}

                  {(incident.attachments && incident.attachments.length > 0) ? (
                    <div style={{ marginTop: '12px' }}>
                      <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>Uploaded Files</h4>
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {incident.attachments.map((f) => (
                          <li key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '6px', fontSize: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 600 }}>📄 {f.fileName}</span>
                              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                                {(f.fileSize / (1024 * 1024)).toFixed(2)} MB &bull; Uploaded by {f.uploadedBy}
                              </span>
                            </div>
                            {!isLocked && (
                              <button type="button" onClick={(e) => { e.stopPropagation(); deleteAttachment(f.id); }} style={{ border: 'none', background: 'transparent', color: 'var(--color-critical)', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}>✕</button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', textAlign: 'center', margin: '12px 0 0 0' }}>No attachments uploaded.</p>
                  )}
                  
                  <div style={{ background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', color: 'var(--color-critical)', padding: '10px 14px', borderRadius: '6px', marginTop: '14px', fontSize: '12px', fontWeight: '500' }}>
                    ⚠️ <strong>Security Disclaimer:</strong> Police reports shall NOT be attached in this section.
                  </div>
                </div>
              )}
            </div>


          </div>

        </div>

        {/* Right Column (60% - Main Operational Feed) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          
          {/* Streamlined Log Composer */}
          {!isLocked && (
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
                  // If user hasn't set a custom time, snapshot current time at submit moment
                  const payload: Record<string, any> = { description: newLogText, attachments: composerAttachments };
                  if (logTimeIsCustom) {
                    payload.eventDate = logEventDate;
                    payload.eventTime = logEventTime;
                  }
                  performAction('log', payload);
                  setNewLogText('');
                  setComposerAttachments([]);
                  setLogTimeIsCustom(false);
                  setLogEventDate(getNowDate());
                  setLogEventTime(getNowTime());
                }} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Event Date & Time row */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    {logTimeIsCustom ? (
                      <>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Event Date</label>
                          <input
                            type="date"
                            className="form-control"
                            value={logEventDate}
                            onChange={e => setLogEventDate(e.target.value)}
                            required
                            style={{ fontSize: 13, height: 36 }}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Event Time</label>
                          <input
                            type="time"
                            className="form-control"
                            value={logEventTime}
                            onChange={e => setLogEventTime(e.target.value)}
                            required
                            style={{ fontSize: 13, height: 36 }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { setLogTimeIsCustom(false); setLogEventDate(getNowDate()); setLogEventTime(getNowTime()); }}
                          className="btn btn-secondary btn-xs"
                          style={{ height: 36, padding: '0 10px', whiteSpace: 'nowrap', marginBottom: 0 }}
                        >
                          ↺ Use current time
                        </button>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', flex: 1 }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Event time will be captured automatically when you post
                        </span>
                        <button
                          type="button"
                          onClick={() => { setLogEventDate(getNowDate()); setLogEventTime(getNowTime()); setLogTimeIsCustom(true); }}
                          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}
                        >
                          Set custom time
                        </button>
                      </div>
                    )}
                  </div>
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
                  const payload: Record<string, any> = { description: `[Ranger Log] ${rangerActivityText}`, attachments: composerAttachments };
                  if (logTimeIsCustom) {
                    payload.eventDate = logEventDate;
                    payload.eventTime = logEventTime;
                  }
                  performAction('log', payload);
                  setRangerActivity('');
                  setComposerAttachments([]);
                  setLogTimeIsCustom(false);
                  setLogEventDate(getNowDate());
                  setLogEventTime(getNowTime());
                }} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: isCtrl ? 12 : 0 }}>
                  {isCtrl && <div className="section-separator" style={{ margin: '8px 0' }} />}
                  {/* Event Date & Time row */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                    {logTimeIsCustom ? (
                      <>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Event Date</label>
                          <input
                            type="date"
                            className="form-control"
                            value={logEventDate}
                            onChange={e => setLogEventDate(e.target.value)}
                            required
                            style={{ fontSize: 13, height: 36 }}
                          />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Event Time</label>
                          <input
                            type="time"
                            className="form-control"
                            value={logEventTime}
                            onChange={e => setLogEventTime(e.target.value)}
                            required
                            style={{ fontSize: 13, height: 36 }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { setLogTimeIsCustom(false); setLogEventDate(getNowDate()); setLogEventTime(getNowTime()); }}
                          className="btn btn-secondary btn-xs"
                          style={{ height: 36, padding: '0 10px', whiteSpace: 'nowrap', marginBottom: 0 }}
                        >
                          ↺ Use current time
                        </button>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', flex: 1 }}>
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Event time will be captured automatically when you post
                        </span>
                        <button
                          type="button"
                          onClick={() => { setLogEventDate(getNowDate()); setLogEventTime(getNowTime()); setLogTimeIsCustom(true); }}
                          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', whiteSpace: 'nowrap' }}
                        >
                          Set custom time
                        </button>
                      </div>
                    )}
                  </div>
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

          {/* Timeline Feed Panel — Operational logs only (System Activity is in its own top-level tab) */}
          <div className="glass timeline-feed-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 className="panel-title" style={{ margin: 0 }}>Incident Log</h2>
            </div>

            <div className="timeline-container">
              {(() => {
                const operationalEvents = timelineEvents.filter(evt => evt.isOperational);

                if (operationalEvents.length === 0) {
                  return (
                    <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px', fontStyle: 'italic' }}>
                      No operational log entries yet.
                    </div>
                  );
                }

                return operationalEvents.map((evt, idx) => {
                  const filteredEvents = operationalEvents;

                  // Render large visual timeline layout
                  return (
                    <div key={idx} className="timeline-node">
                      {idx < filteredEvents.length - 1 && (
                        <div className="timeline-line" />
                      )}
                      <div className="timeline-icon-container" style={{
                        background: getEventBgColor(evt.type),
                        border: `2px solid ${getEventBorderColor(evt.type)}`,
                        color: getEventTextColor(evt.type),
                      }}>
                        {getEventIcon(evt.type)}
                      </div>
                      
                      <div className={`timeline-content-card ${evt.type}`}>
                        <div className="timeline-content-header">
                          <span className="timeline-title">{evt.title}</span>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                            
                            {incident.status !== 'Pending Endorsement' && incident.status !== 'Closed' &&
                             evt.eventNumber && 
                             !evt.deleted && 
                             (evt.rawDescription?.startsWith('[MANUAL]') || evt.rawDescription?.startsWith('[Ranger Log]')) && (
                              <div className="timeline-card-actions">
                                <button
                                  type="button"
                                  className="timeline-action-btn"
                                  onClick={() => {
                                    setEditingLogEventNumber(evt.eventNumber!);
                                    let cleanText = evt.rawDescription || '';
                                    if (cleanText.startsWith('[Ranger Log] ')) {
                                      cleanText = cleanText.slice('[Ranger Log] '.length);
                                    } else if (cleanText.startsWith('[MANUAL] ')) {
                                      const suffixIndex = cleanText.lastIndexOf(' — by ');
                                      if (suffixIndex !== -1) {
                                        cleanText = cleanText.slice('[MANUAL] '.length, suffixIndex);
                                      } else {
                                        cleanText = cleanText.slice('[MANUAL] '.length);
                                      }
                                    }
                                    setEditingLogText(cleanText);
                                    // Pre-fill date/time from entry timestamp
                                    const ts = evt.timestamp || '';
                                    setEditingLogDate(ts.split('T')[0] || getNowDate());
                                    setEditingLogTime(ts.split('T')[1]?.slice(0, 5) || getNowTime());
                                    setEditingLogAttachments([...(evt.attachments || [])]);
                                  }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  className="timeline-action-btn delete"
                                  onClick={() => handleDeleteLog(evt.eventNumber!)}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {editingLogEventNumber === evt.eventNumber ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!editingLogText.trim()) return;
                              handleSaveEdit(evt.eventNumber!, editingLogText, editingLogDate, editingLogTime, editingLogAttachments);
                            }}
                            style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8, padding: '12px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
                          >
                            {/* Date + Time row */}
                            <div style={{ display: 'flex', gap: 10 }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Event Date</label>
                                <input
                                  type="date"
                                  className="form-control"
                                  value={editingLogDate}
                                  onChange={e => setEditingLogDate(e.target.value)}
                                  required
                                  style={{ fontSize: 12.5, height: 32 }}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3, display: 'block' }}>Event Time</label>
                                <input
                                  type="time"
                                  className="form-control"
                                  value={editingLogTime}
                                  onChange={e => setEditingLogTime(e.target.value)}
                                  required
                                  style={{ fontSize: 12.5, height: 32 }}
                                />
                              </div>
                            </div>

                            {/* Description */}
                            <textarea
                              className="form-control"
                              rows={2}
                              value={editingLogText}
                              onChange={(e) => setEditingLogText(e.target.value)}
                              style={{ fontSize: '12.5px', padding: '6px 10px', background: 'var(--bg-card)', width: '100%' }}
                              autoFocus
                            />

                            {/* Attachments manager */}
                            {editingLogAttachments.length > 0 && (
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {editingLogAttachments.map((img, imgIdx) => (
                                  <div key={imgIdx} style={{ position: 'relative', width: 56, height: 56, borderRadius: 6, border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                    <img src={img} alt="attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <button
                                      type="button"
                                      onClick={() => setEditingLogAttachments(prev => prev.filter((_, i) => i !== imgIdx))}
                                      style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 9, fontWeight: 'bold' }}
                                      title="Remove image"
                                    >✕</button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Actions row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <label
                                htmlFor={`edit-file-upload-${evt.eventNumber}`}
                                className="btn btn-secondary btn-xs"
                                style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, height: 26, padding: '3px 8px' }}
                              >
                                📷 Add Image
                                <input
                                  id={`edit-file-upload-${evt.eventNumber}`}
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  style={{ display: 'none' }}
                                  onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    e.target.value = '';
                                    void (async () => {
                                      const errors = await uploadAttachments(files, 'incidents', (url) =>
                                        setEditingLogAttachments(prev => [...prev, url]),
                                      );
                                      if (errors.length > 0) alert(errors.join('\n'));
                                    })();
                                  }}
                                />
                              </label>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-xs"
                                  onClick={() => {
                                    setEditingLogEventNumber(null);
                                    setEditingLogText('');
                                    setEditingLogDate('');
                                    setEditingLogTime('');
                                    setEditingLogAttachments([]);
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  className="btn btn-primary btn-xs"
                                  disabled={saving || !editingLogText.trim()}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="timeline-body">
                              {evt.description.startsWith('[MANUAL] ') 
                                ? evt.description.slice('[MANUAL] '.length) 
                                : evt.description.startsWith('[Ranger Log] ') 
                                ? evt.description.slice('[Ranger Log] '.length) 
                                : evt.description}
                            </div>
                            
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
                            
                            {evt.edited && !evt.deleted && (
                              <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontStyle: 'italic', marginTop: 4 }}>
                                Edited by {evt.editedBy} at {new Date(evt.editedAt!).toLocaleTimeString('en-SG', { hour12: false })}
                              </div>
                            )}
                            
                            {evt.deleted && (
                              <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontStyle: 'italic', marginTop: 4 }}>
                                Removed at: <strong>{new Date(evt.deletedAt!).toLocaleString('en-SG')}</strong>
                              </div>
                            )}

                            {evt.actor && !evt.deleted && (
                              <div className="timeline-footer">
                                Recorded by: <strong>{evt.actor}</strong>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              })()}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Tab 2: System Activity */}
    {activeTimelineTab === 'system' && (
      <div className="glass timeline-feed-card" style={{ padding: 20 }}>
        <h2 className="panel-title" style={{ marginBottom: 16 }}>System Activity (Audit Trail)</h2>
        <div className="timeline-container">
          {(() => {
            const systemEvents = timelineEvents.filter(evt => !evt.isOperational);
            if (systemEvents.length === 0) {
              return (
                <div style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-faint)', fontSize: '13px', fontStyle: 'italic' }}>
                  No system activity logs found.
                </div>
              );
            }
            return systemEvents.map((evt, idx) => (
              <div key={idx} className="timeline-node audit-node">
                {idx < systemEvents.length - 1 && (
                  <div className="timeline-line" />
                )}
                <div className="audit-icon-container" style={{
                  background: getEventBgColor(evt.type),
                  border: `1.5px solid ${getEventBorderColor(evt.type)}`,
                  color: getEventTextColor(evt.type),
                }}>
                  {getEventIcon(evt.type)}
                </div>
                <div className={`audit-card ${evt.type}`}>
                  <div className="timeline-content-header">
                    <span className="timeline-title">{evt.title}</span>
                    <span className="timeline-timestamp">
                      {new Date(evt.timestamp).toLocaleString('en-SG', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })}
                    </span>
                  </div>
                  <div className="timeline-body">{evt.description}</div>
                  {evt.actor && (
                    <div className="timeline-footer">
                      Recorded by: <strong>{evt.actor}</strong>
                    </div>
                  )}
                </div>
              </div>
            ));
          })()}
        </div>
      </div>
    )}

    {/* Tab 3: Linked Faults */}
    {activeTimelineTab === 'faults' && (
      <div className="glass console-card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>
          <h2 className="panel-title" style={{ margin: 0 }}>Linked Faults</h2>
          {!isLocked && (
            <button
              className="btn btn-brand btn-sm"
              onClick={() => setShowRaiseFaultModal(true)}
            >
              + Raise Fault
            </button>
          )}
        </div>

        <FaultCreateModal
          isOpen={showRaiseFaultModal}
          onClose={() => setShowRaiseFaultModal(false)}
          onSuccess={() => fetchIncidentData()}
          linkedIncidentId={incident?.id}
          linkedCaseId={parentCase?.id}
          prefillLocation={incident?.location}
          username={username}
        />

        <div style={{ overflowX: 'auto' }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Infrastructure Faults ({incident.relatedFaults?.length || 0})
          </h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Fault ID</th>
                <th>Type</th>
                <th>Description</th>
                <th>CMMS Ticket</th>
                <th>Status</th>
                <th>Date Logged</th>
              </tr>
            </thead>
            <tbody>
              {(!incident.relatedFaults || incident.relatedFaults.length === 0) ? (
                <tr>
                  <td colSpan={6} style={{ padding: '20px 10px', textAlign: 'center', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                    No linked faults found.
                  </td>
                </tr>
              ) : (
                incident.relatedFaults.map(f => (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/faults/${f.id}`} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        {f.id}
                      </Link>
                    </td>
                    <td>{f.faultType}</td>
                    <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.description}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{f.cmmsTicketId || '—'}</td>
                    <td>
                      <span className={`badge ${
                        f.status === 'Closed' ? 'badge-closed' :
                        f.status === 'Pending Submission' ? 'badge-ack' :
                        'badge-live'
                      }`}>
                        {f.status}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {new Date(f.createdAt).toLocaleDateString('en-SG')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Linked e-Diary Entries (FSD §5.3.1) ── */}
        <div style={{ marginTop: 28, borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
            Linked e-Diary Entries ({linkedEDiaryEntries.length})
          </h3>
          {linkedEDiaryEntries.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>
              No linked e-Diary entries for this case.
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Entry ID</th>
                    <th>Topic</th>
                    <th>Content</th>
                    <th>Logged By</th>
                    <th>Date / Time</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedEDiaryEntries.map((entry: any) => (
                    <tr key={entry.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                        <Link href={`/occurrences`} style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 600 }}>
                          {entry.id}
                        </Link>
                      </td>
                      <td>{entry.topic || '—'}</td>
                      <td style={{ maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.content}
                      </td>
                      <td>{entry.user || '—'}</td>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(entry.dateTime).toLocaleDateString('en-SG')}{' '}
                        {new Date(entry.dateTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    )}

    {/* Tab 4: Duplicate Reports */}
    {activeTimelineTab === 'duplicates' && (
      <div className="glass console-card" style={{ padding: 20 }}>
        <h2 className="panel-title" style={{ marginBottom: 16, borderBottom: '1px solid var(--border-color)', paddingBottom: 10 }}>Duplicate Detection & Reports</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: 24 }}>
          {/* Link Form */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Mark This Incident as Duplicate</h3>
            {incident.isDuplicate ? (
              <div style={{ background: 'var(--color-info-bg)', border: '1px solid var(--color-info-border)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                <p style={{ fontSize: 12, color: 'var(--color-info)', margin: 0, fontWeight: 600 }}>Already linked as duplicate</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>
                  This incident is a duplicate of{' '}
                  <Link href={`/incidents/${incident.masterIncidentId}`} style={{ color: 'var(--color-info)', fontWeight: 700, textDecoration: 'underline', fontFamily: 'monospace' }}>
                    {incident.masterIncidentId}
                  </Link>.
                </p>
              </div>
            ) : isCtrl && !isLocked ? (
              <form onSubmit={handleMarkAsDuplicate} style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-inset)', border: '1px solid var(--border-color)', padding: 16, borderRadius: 'var(--radius-md)' }}>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  If this incident is a duplicate of an earlier report, enter the <strong>original</strong> Incident ID below. <strong>This record will be closed</strong> and linked to the master.
                </p>
                <div className="form-group">
                  <label style={{ fontSize: 12 }}>Original (Master) Incident ID *</label>
                  <input
                    className="form-control"
                    required
                    placeholder="e.g. SEN/IR/20260617/0001"
                    value={linkDupId}
                    onChange={e => { setLinkDupId(e.target.value); setLinkDupError(''); }}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>
                {linkDupError && <p style={{ fontSize: 11, color: 'var(--color-critical)', margin: 0 }}>{linkDupError}</p>}
                <button type="submit" className="btn btn-danger btn-sm" disabled={saving || !linkDupId.trim()}>
                  {saving ? 'Linking…' : 'Close & Link as Duplicate'}
                </button>
              </form>
            ) : isClosed && !incident.isDuplicate ? (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>Incident is Closed.</p>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>Only Controllers can link duplicate incidents.</p>
            )}
          </div>

          {/* Linked List */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Linked Duplicate Incidents ({incident.slaveIncidents?.length || 0})</h3>
            {!incident.slaveIncidents?.length ? (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', fontStyle: 'italic', margin: 0 }}>No duplicate incidents linked.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incident.slaveIncidents.map((s: any, i: number) => (
                  <div key={i} className="inset-panel" style={{ padding: 12, background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Link href={`/incidents/${s.id}`} style={{ fontWeight: 700, color: 'var(--color-info)', fontFamily: 'monospace', fontSize: 12, textDecoration: 'underline' }}>
                          {s.id}
                        </Link>
                        {s.caseId && (
                          <Link href={`/cases/${s.caseId}`} style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline' }}>
                            {s.caseId}
                          </Link>
                        )}
                      </div>
                      <span className={s.status === 'Closed' ? 'badge badge-closed' : 'badge badge-live'} style={{ scale: '0.9', transformOrigin: 'right center' }}>{s.status === 'Live (Assigned)' ? 'Assigned' : s.status}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Reporter: {s.reporterName}
                      {s.dateTime && <span style={{ marginLeft: 10 }}>{new Date(s.dateTime).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}</span>}
                    </div>
                    {s.summary && <div style={{ fontSize: 12, color: 'var(--text-sub)', marginTop: 6, fontStyle: 'italic', borderTop: '1px dashed var(--border-color)', paddingTop: 6 }}>{s.summary}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
      </div>

      {/* Return to Responder Modal — per-Responder, multi-select. The Controller picks one
          or more specific assigned Responders to return for rework; each selected Responder
          gets its own Completion Remarks (not a single shared remark). */}
      {showReturnToResponderModal && (
        <div className="modal-overlay">
          <div className="modal-box glass">
            <h2 className="modal-title">Return to Responder</h2>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                Select Responder(s) to Return *
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {returnEligibleResponders.map(r => {
                  const checked = returnResponderIds.includes(r.responderId);
                  return (
                    <div key={r.responderId} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setReturnResponderIds([...returnResponderIds, r.responderId]);
                            } else {
                              setReturnResponderIds(returnResponderIds.filter(id => id !== r.responderId));
                              const rest = { ...returnRemarksByResponder };
                              delete rest[r.responderId];
                              setReturnRemarksByResponder(rest);
                            }
                          }}
                        />
                        {r.responderId}
                        <span className={responderBadgeClass(r.lifecycleStatus)} style={{ fontSize: '10px', padding: '1px 6px' }}>
                          {r.lifecycleStatus}
                        </span>
                      </label>
                      {checked && (
                        <textarea
                          className="form-control"
                          rows={3}
                          value={returnRemarksByResponder[r.responderId] || ''}
                          onChange={(e) => setReturnRemarksByResponder({ ...returnRemarksByResponder, [r.responderId]: e.target.value })}
                          placeholder={`Completion Remarks for ${r.responderId} — what they need to address...`}
                          style={{ width: '100%', padding: '8px', fontSize: '13px', marginTop: '8px' }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReturnToResponderModal(false)}>Cancel</button>
              <button
                className="btn btn-warning btn-sm"
                onClick={async () => {
                  const ok = await performAction('return-to-responder', {
                    responderIds: returnResponderIds,
                    remarksByResponder: returnRemarksByResponder
                  });
                  if (ok) setShowReturnToResponderModal(false);
                }}
                disabled={
                  saving ||
                  returnResponderIds.length === 0 ||
                  returnResponderIds.some(id => !(returnRemarksByResponder[id] || '').trim())
                }
              >
                Return to Responder ({returnResponderIds.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Incident to Controller Modal */}
      {showReturnModal && (
        <div className="modal-overlay">
          <div className="modal-box glass">
            <h2 className="modal-title">Return Incident to Controller</h2>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Completion Remarks *</label>
              <textarea
                className="form-control"
                rows={4}
                value={modalRemarks}
                onChange={(e) => setModalRemarks(e.target.value)}
                placeholder="Specify the revision required by the Controller..."
                style={{ width: '100%', padding: '8px', fontSize: '13px' }}
                required
              />
            </div>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowReturnModal(false)}>Cancel</button>
              <button 
                className="btn btn-danger btn-sm" 
                onClick={async () => {
                  if (!modalRemarks.trim()) return;
                  const ok = await performAction('return', { returnRemarks: modalRemarks.trim() });
                  if (ok) {
                    setShowReturnModal(false);
                  }
                }}
                disabled={saving || !modalRemarks.trim()}
              >
                Return to Controller
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Incident Closure Modal */}
      {showApproveModal && (
        <div className="modal-overlay">
          <div className="modal-box glass">
            <h2 className="modal-title">Approve Incident Closure</h2>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Completion Remarks (Optional)</label>
              <textarea
                className="form-control"
                rows={4}
                value={modalRemarks}
                onChange={(e) => setModalRemarks(e.target.value)}
                placeholder="Enter approval notes or remarks..."
                style={{ width: '100%', padding: '8px', fontSize: '13px' }}
              />
            </div>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowApproveModal(false)}>Cancel</button>
              <button 
                className="btn btn-success btn-sm" 
                onClick={async () => {
                  const ok = await performAction('close', { closureRemarks: modalRemarks.trim() });
                  if (ok) {
                    setShowApproveModal(false);
                    // FSD §10.5 — prompt the Controller to perform the closure broadcast.
                    // performAction() re-fetches the incident on success, so read the
                    // server-computed C1 gate result directly instead of guessing from
                    // category client-side (fixes a prior proxy that missed config changes).
                    const res = await fetch(`/api/incidents/${incidentId}`);
                    const fresh = await res.json().catch(() => null);
                    if (fresh?.closureBroadcastStatus === 'pending') {
                      addNotification({
                        title: '📡 Closure Broadcast Pending',
                        message: `Incident ${incident?.id} was closed and requires a closure broadcast. Review and dispatch it.`,
                        role: 'Controller',
                        type: 'broadcast',
                        link: `/incidents/${incident?.id}`,
                      });
                    }
                  }
                }}
                disabled={saving}
              >
                Approve & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
