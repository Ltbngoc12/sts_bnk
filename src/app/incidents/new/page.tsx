'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { useUnsavedChanges } from '@/context/UnsavedChangesContext';
import LocationSelector, { DEFAULT_NODES, type LocationNode } from '@/components/LocationSelector';
import MultiResponderSelect from '@/components/MultiResponderSelect';

import { getIncidentTaxonomy } from '@/lib/taxonomy';
import { INCIDENT_CATEGORIES, DEFAULT_INCIDENT_CATEGORY, INCIDENT_CATEGORY_HELP } from '@/lib/incidentCategory';
import { Case } from '@/lib/db';

const INCIDENTS_CANCEL_HREF = '/case-management?tab=incidents';

export default function NewIncidentPage() {
  const router = useRouter();
  const { username } = useRole();
  const { setDirty, setHideNav, setLeaveHref, requestLeave } = useUnsavedChanges();

  // Hide the left nav for the duration this full-page form is mounted, and
  // register where Cancel / the browser Back guard should send the user.
  // Cleanup restores normal nav + clears any dirty flag if the user
  // navigates away via an unguarded path (e.g. hot reload in dev).
  useEffect(() => {
    setHideNav(true);
    setLeaveHref(INCIDENTS_CANCEL_HREF);
    return () => {
      setHideNav(false);
      setLeaveHref(null);
      setDirty(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  // Accordion Expand States (1 to 12)
  const [expandedSections, setExpandedSections] = useState<Record<number, boolean>>({
    1: true, // open first by default
  });

  // Success Modal State
  const [successModal, setSuccessModal] = useState(false);
  const [generatedCaseId, setGeneratedCaseId] = useState('');
  const [generatedIncidentId, setGeneratedIncidentId] = useState('');

  // Duplicate Detection State
  const [duplicateCandidates, setDuplicateCandidates] = useState<any[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<any>(null);

  // Link to Parent Case State — pick an existing case with no incident yet, or auto-create one
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState('new-case');
  const [caseSearchText, setCaseSearchText] = useState('');
  const [showCaseDropdown, setShowCaseDropdown] = useState(false);

  useEffect(() => {
    fetch('/api/cases')
      .then(res => (res.ok ? res.json() : []))
      .then((data: Case[]) => setCases(data.filter(c => !c.incident && c.status !== 'Closed')))
      .catch(() => {});
  }, []);

  // 1. General Information State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(DEFAULT_INCIDENT_CATEGORY);
  const [incType, setIncType] = useState('');
  const [incSubType, setIncSubType] = useState('');
  const [priority, setPriority] = useState('Normal');
  const [crisisLevel, setCrisisLevel] = useState('4');
  const [reporterName, setReporterName] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [reportingSource, setReportingSource] = useState('Public Phone');
  const [incidentDateTime, setIncidentDateTime] = useState('');
  const [createdBy, setCreatedBy] = useState(username || 'Controller Steve');

  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setTaxonomy(getIncidentTaxonomy());
  }, []);

  useEffect(() => {
    if (username) {
      setCreatedBy(username);
    }
  }, [username]);

  // 2. Location State
  const [road, setRoad] = useState('');
  const [building, setBuilding] = useState('');
  const [levelSpace, setLevelSpace] = useState('');
  const [nearAt, setNearAt] = useState('');
  const [commonName, setCommonName] = useState('');
  const [postalCode, setPostalCode] = useState('000000');
  const [tagsStr, setTagsStr] = useState('Beachfront');
  const [manualPin, setManualPin] = useState(false);
  const [pinCoords, setPinCoords] = useState({ lat: 1.2500, lng: 103.8300 });

  // 3. Incident Log State
  const [logs, setLogs] = useState<{ id: number; date: string; time: string; description: string }[]>([
    { id: 1, date: new Date().toISOString().split('T')[0], time: '12:00', description: 'Incident logged. Dispatch pending.' }
  ]);

  // 4. Emergency Services State
  const [policeAtScene, setPoliceAtScene] = useState(false);
  const [policeOfficer, setPoliceOfficer] = useState('');
  const [policeIncidentNo, setPoliceIncidentNo] = useState('');
  const [policeClassification, setPoliceClassification] = useState('');
  const [policeUnit, setPoliceUnit] = useState('');
  
  const [scdfType, setScdfType] = useState('None'); // None | Ambulance | SCDF
  const [scdfOfficer, setScdfOfficer] = useState('');
  const [scdfCallSign, setScdfCallSign] = useState('');
  const [scdfUnit, setScdfUnit] = useState('');
  const [scdfArrivalTime, setScdfArrivalTime] = useState('');
  const [scdfHospital, setScdfHospital] = useState('');

  // 5. Media Involvement State
  const [mediaAtScene, setMediaAtScene] = useState(false);
  const [mediaName, setMediaName] = useState('');
  const [mediaCommsNotified, setMediaCommsNotified] = useState(false);

  // 6. Property & Vehicles State
  const [propertyDamaged, setPropertyDamaged] = useState(false);
  const [propertyDamageDesc, setPropertyDamageDesc] = useState('');
  const [vehicles, setVehicles] = useState<{ id: number; sdcVehicle: boolean; model: string; plate: string; driverName: string; driverContact: string; licence: string; address: string; remarks: string }[]>([]);

  // 7. Personal Injuries State
  const [injuries, setInjuries] = useState<{ id: number; hospital: string; msigIssued: boolean; msigSerial: string; under16: boolean; parentName: string; parentContact: string }[]>([]);

  // 8. Persons Involved State
  const [persons, setPersons] = useState<{ id: number; guestOrNon: string; type: string; name: string; address: string; age: string; gender: string; contact: string; role: string; injured: boolean; injuryDetails: string }[]>([]);

  // 9. CCTV & Body Worn Camera State
  const [cctvFootages, setCctvFootages] = useState<{ id: number; cameraNo: string; timestamp: string; bookmark: string; bwcNo: string; bwcTimestamp: string }[]>([]);

  // 10. Attachments State (mock list of files)
  const [mockFiles, setMockFiles] = useState<{ name: string; size: string }[]>([]);

  // 11. Responder Assignment State
  const [assignedResponders, setAssignedResponders] = useState<string[]>([]);

  // 12. Summary & Closure State
  const [summary, setSummary] = useState('');

  const handleLocationChange = (details: {
    road: string;
    building: string;
    levelSpace: string;
    commonName: string;
    postalCode: string;
    lat: number;
    lng: number;
    tags: string[];
  }) => {
    setDirty(true);
    setRoad(details.road);
    setBuilding(details.building);
    setLevelSpace(details.levelSpace);
    // Only overwrite free-text fields when the selector provides a value from the hierarchy
    if (details.commonName) setCommonName(details.commonName);
    if (details.postalCode) setPostalCode(details.postalCode);
    if (details.lat !== 1.2500 || details.lng !== 103.8300) setPinCoords({ lat: details.lat, lng: details.lng });
    if (details.tags.length > 0) setTagsStr(details.tags.join(', '));
  };

  // Postal code → unique building lookup: auto-populate Road, Building, Common Name
  useEffect(() => {
    const trimmed = postalCode.trim();
    if (!trimmed || trimmed === '000000' || trimmed.length < 6) return;
    const stored = localStorage.getItem('admin_location_hierarchy');
    const allNodes: LocationNode[] = stored ? JSON.parse(stored) : DEFAULT_NODES;
    const matches = allNodes.filter(n => n.type === 'Building' && n.status === 'Active' && n.postalCode === trimmed);
    if (matches.length === 1) {
      const bld = matches[0];
      const rdNode = allNodes.find(n => n.id === bld.parentId && n.type === 'Road');
      setBuilding(bld.name);
      if (rdNode) setRoad(rdNode.name);
      if (bld.commonName) setCommonName(prev => prev || bld.commonName!);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postalCode]);



  // Handle Type -> Sub-Type resets
  useEffect(() => {
    setIncSubType('');
  }, [incType]);


  // Warning Banners triggers
  const now = new Date();
  const incidentDateObj = new Date(incidentDateTime || now.toISOString());
  const elapsedMs = now.getTime() - incidentDateObj.getTime();
  const elapsedMinutes = elapsedMs / (60 * 1000);
  const elapsedDays = elapsedMs / (24 * 60 * 60 * 1000);


  const showReviewWarningBanner = elapsedDays >= 12 && elapsedDays < 14;
  const showEscalationWarningBanner = elapsedDays >= 14;
  const showMediaBanner = mediaAtScene;

  // Accordion Toggle handlers
  const toggleSection = (index: number) => {
    setExpandedSections(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const expandAll = () => {
    const allExpanded: Record<number, boolean> = {};
    for (let i = 1; i <= 12; i++) allExpanded[i] = true;
    setExpandedSections(allExpanded);
  };

  const collapseAll = () => {
    setExpandedSections({});
  };

  const [activeSection, setActiveSection] = useState<number>(1);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 120;
      let currentActive = 1;
      for (let i = 1; i <= 12; i++) {
        const el = document.getElementById(`incident-section-${i}`);
        if (el) {
          const top = el.getBoundingClientRect().top + window.scrollY;
          if (scrollPosition >= top) {
            currentActive = i;
          }
        }
      }
      setActiveSection(currentActive);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (id: number) => {
    setExpandedSections(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      const element = document.getElementById(`incident-section-${id}`);
      if (element) {
        const elementPosition = element.getBoundingClientRect().top + window.scrollY;
        const offsetPosition = elementPosition - 112;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    }, 60);
  };

  // Form Submit Handler (Saves to Database)
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('General Information: Incident Title is required.');
      toggleSection(1);
      return;
    }

    if (!incType) {
      alert('General Information: Incident Type is required.');
      toggleSection(1);
      return;
    }
    if (!incSubType) {
      alert('General Information: Incident Sub-Type is required.');
      toggleSection(1);
      return;
    }

    // NOTE — Category status handling (FSD v0.5 §5.1.2 / §5.10.1):
    // Backdated Incident used to be force-set to "Closed" the instant it was created,
    // which skipped Duty Manager endorsement entirely. That contradicted FSD §5.10 (every
    // incident, including Backdated, requires DM review before Closed) and was inconsistent
    // with our own read of the spec — see QnA_FSD_v0.5_IncidentCategory.md Q2. Every category
    // now creates the same way (status "Live"); the Controller submits it for endorsement via
    // the normal "submit-endorsement" action, which routes to Pending Endorsement regardless of
    // whether a Responder was ever assigned (see the /api/incidents/[...id]/route.ts fix that
    // accompanies this change).
    // TODO: confirm with BA — Backdated/Informational-Exercise status flow is still a TBC point
    // pending Shin Feng's reply (see INCIDENT_CATEGORY_IMPLEMENTATION_PLAN.md §3.2/§3.3).
    const payload: any = {
      title: title || `Incident: ${incType} - ${incSubType}`,
      status: 'Active',
      username: createdBy || username || 'admin',
      incident: {
        dateTime: new Date(incidentDateTime).toISOString(),
        type: incType,
        subType: incSubType,
        priority: priority,
        crisisLevel: parseInt(crisisLevel, 10) || 4,
        reporterName: reporterName || 'Anonymous Guest',
        requestedBy: requestedBy || '',
        reportingSource: reportingSource,
        category: category,
        status: 'Live',
        assignedTo: assignedResponders,
        location: {
          road: road,
          building: building,
          levelSpace: levelSpace,
          nearAt: nearAt,
          commonName: commonName,
          postalCode: postalCode || '000000',
          tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
          lat: pinCoords.lat,
          lng: pinCoords.lng
        },
        log: logs.map(l => ({
          eventNumber: l.id,
          date: l.date,
          time: l.time,
          description: l.description
        })),
        emergencyServices: {
          policeAtScene: policeAtScene,
          officerNameRank: policeOfficer,
          policeIncidentNo: policeIncidentNo,
          classification: policeClassification,
          respondingUnit: policeUnit,
          ambulanceScdfType: scdfType,
          ambulanceOfficerName: scdfOfficer,
          ambulanceCallSign: scdfCallSign,
          ambulanceRespondingUnit: scdfUnit,
          ambulanceArrivalTime: scdfArrivalTime,
          hospitalConveyedTo: scdfHospital
        },
        mediaInvolvement: {
          mediaAtScene: mediaAtScene,
          mediaName: mediaName,
          commsNotified: mediaCommsNotified
        },
        propertyDamage: {
          sdcPropertyDamaged: propertyDamaged,
          description: propertyDamageDesc
        },
        vehiclesInvolved: vehicles.map(v => ({
          sdcVehicleInvolved: v.sdcVehicle,
          vehicleModel: v.model,
          vehicleNumber: v.plate,
          driverName: v.driverName,
          driverContact: v.driverContact,
          drivingLicenceNo: v.licence,
          driverAddress: v.address,
          remarks: v.remarks
        })),
        personalInjuries: injuries.map(inj => ({
          clinicHospitalAttended: inj.hospital,
          msigFormIssued: inj.msigIssued,
          msigSerialNo: inj.msigSerial,
          under16: inj.under16,
          parentGuardianName: inj.parentName,
          parentGuardianContact: inj.parentContact
        })),
        personsInvolved: persons.map(p => ({
          guestOrNonGuest: p.guestOrNon,
          type: p.type,
          name: p.name,
          address: p.address,
          age: parseInt(p.age, 10) || 0,
          gender: p.gender,
          contactNumber: p.contact,
          roleInvolvement: p.role,
          injuryDetails: p.injuryDetails
        })),
        cctvBwc: cctvFootages.map(f => ({
          cameraNumber: f.cameraNo,
          vmsTimestamp: f.timestamp,
          vmsBookmark: f.bookmark,
          bwcNumber: f.bwcNo,
          bwcTimestamp: f.bwcTimestamp
        })),
        summary: summary,
        completionRemarks: ''
      }
    };

    // Check for potential duplicates (FRD 5.7) before submitting.
    // Skipped for Backdated Incident — it documents something already over, so it
    // can't be a live duplicate of an active incident.
    if (incType && incidentDateTime && category !== 'Backdated Incident') {
      try {
        const params = new URLSearchParams({ type: incType, date: new Date(incidentDateTime).toISOString() });
        if (incSubType) params.set('subType', incSubType);
        const dupRes = await fetch(`/api/incidents/check-duplicates?${params}`);
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          if (dupData.count > 0) {
            setDuplicateCandidates(dupData.candidates);
            setPendingPayload(payload);
            setShowDuplicateModal(true);
            return;
          }
        }
      } catch {
        // If duplicate check fails, proceed normally
      }
    }

    await submitIncident(payload);
  };

  const submitIncident = async (payload: any) => {
    try {
      const res = selectedCaseId === 'new-case'
        ? await fetch('/api/cases', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          })
        : await fetch(`/api/cases/${selectedCaseId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incident: payload.incident, username: payload.username })
          });

      if (res.ok) {
        const data = await res.json();
        setDirty(false); // saved — no longer at risk of losing changes
        setGeneratedCaseId(data.id);
        setGeneratedIncidentId(data.incident.id);
        setSuccessModal(true);
      } else {
        const err = await res.json();
        alert(`Failed to log incident: ${err.error || 'Server error'}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to log incident: ${err.message}`);
    }
  };

  return (
    <div className="page-content" style={{ maxWidth: '100%', padding: '0 0 60px 0' }}>
      
      <style jsx global>{`
        /* Simulator Panel */
        .simulator-panel {
          background: #FFFDF5;
          border: 1px dashed #E6C280;
          border-radius: 10px;
          padding: 14px 18px;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .simulator-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #B27C24;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .simulator-options {
          display: flex;
          gap: 8px;
        }
        .sim-btn {
          padding: 5px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 6px;
          border: 1px solid #E6D0A8;
          background: #FFF;
          color: #7D5C28;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sim-btn.active {
          background: #F2C94C;
          border-color: #F2C94C;
          color: #2B1F1D;
        }

        /* Warning Banners styling */
        .banner-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 20px;
        }
        .warning-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
        }
        .warning-banner.info {
          background: var(--color-info-bg);
          border: 1px solid var(--color-info-border);
          color: var(--color-info);
        }
        .warning-banner.warning {
          background: var(--color-high-bg);
          border: 1px solid var(--color-high-border);
          color: var(--color-high);
        }
        .warning-banner.danger {
          background: var(--color-critical-bg);
          border: 1px solid var(--color-critical-border);
          color: var(--color-critical);
        }
        .banner-icon { font-size: 18px; }

        /* Accordion Wizard styling */
        .accordion-item {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          margin-bottom: 12px;
          overflow: visible;
          box-shadow: 0 2px 8px rgba(43, 31, 29, 0.01);
          transition: border-color 0.15s ease;
        }
        .accordion-item.expanded {
          border-color: var(--border-color-hover);
        }
        .accordion-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          background: var(--bg-card);
          cursor: pointer;
          user-select: none;
          transition: background 0.12s ease;
          border-radius: 8px;
        }
        .accordion-item.expanded .accordion-header {
          border-radius: 8px 8px 0 0;
        }
        .accordion-header:hover {
          background: var(--bg-inset);
        }
        .accordion-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .accordion-num {
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text-muted);
        }
        .accordion-item.expanded .accordion-num {
          background: var(--color-primary-bg);
          border-color: var(--color-primary-border);
          color: var(--color-primary);
        }
        .accordion-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--color-primary-dark);
        }
        .accordion-header-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .accordion-content {
          padding: 20px 24px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-card);
        }

        /* Dynamic Grid Sub-forms */
        .sub-form-card {
          background: var(--bg-inset);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
          position: relative;
        }
        .sub-form-card:last-child {
          margin-bottom: 0;
        }
        .remove-card-btn {
          position: absolute;
          top: 14px;
          right: 14px;
        }

        /* Mock Map */
        .mock-map-canvas {
          height: 200px;
          background: #EAF2E6;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          position: relative;
          overflow: hidden;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .map-grid-bg {
          position: absolute; inset: 0;
          background-size: 20px 20px;
          background-image: linear-gradient(to right, rgba(0,0,0,0.02) 1px, transparent 1px),
                            linear-gradient(to bottom, rgba(0,0,0,0.02) 1px, transparent 1px);
        }
        .map-beach-line {
          position: absolute;
          bottom: 0; left: 0; right: 0; height: 70px;
          background: #FFEAA7;
          border-top: 2px dashed #E5BA73;
        }
        .map-sea-line {
          position: absolute;
          bottom: 0; left: 0; right: 0; height: 35px;
          background: #74B9FF;
        }
        .map-pin {
          position: absolute;
          font-size: 24px;
          margin-top: -24px;
          margin-left: -12px;
          z-index: 10;
          animation: bounce 1s infinite alternate;
        }
        @keyframes bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-6px); }
        }

        /* Mock File Drop Area */
        .mock-dropzone {
          border: 2px dashed var(--border-color);
          border-radius: 8px;
          padding: 30px;
          text-align: center;
          cursor: pointer;
          background: var(--bg-inset);
          transition: all 0.15s ease;
        }
        .mock-dropzone:hover {
          border-color: var(--color-primary);
          background: var(--bg-card);
        }

        /* Sticky Navigator styling */
        .sticky-navigator-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 18px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
        }
        .navigator-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-main);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 12px;
          border-bottom: 1px solid var(--border-color);
          padding-bottom: 8px;
        }
        .navigator-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .navigator-item {
          cursor: pointer;
          padding: 8px 12px;
          font-size: 12.5px;
          font-weight: 500;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s ease;
          color: var(--text-sub);
          border-left: 3px solid transparent;
        }
        .navigator-item:hover {
          background: var(--bg-hover);
          color: var(--text-main);
        }
        .navigator-item.active {
          border-left-color: var(--color-primary);
          background: var(--color-primary-bg);
          color: var(--color-primary);
          font-weight: 600;
        }

        @media (max-width: 1024px) {
          .form-columns-container {
            flex-direction: column;
          }
          .sticky-navigator {
            display: none !important;
          }
        }
      `}</style>

      {/* Header Panel */}
      <div 
        className="cases-header-bar glass" 
        style={{ 
          position: 'sticky', 
          top: '12px', 
          zIndex: 1000, 
          marginBottom: '20px',
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
        }}
      >
        <div className="title-section">
          <h1>Log New Incident Report</h1>
          <p>Complete the required sections below to log the incident — remaining details can be updated from the incident detail page later.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', height: '32px' }}
            onClick={() => requestLeave(() => router.push(INCIDENTS_CANCEL_HREF))}
          >
            Cancel
          </button>
          <button type="submit" form="new-incident-form" className="btn btn-info" style={{ color: '#FFF', padding: '8px 18px', fontSize: '13px', height: '38px' }}>
            Log Incident
          </button>
        </div>
      </div>



      {/* Warning Banners area */}
      <div className="banner-container">
        {showMediaBanner && (
          <div className="warning-banner warning">
            <span className="banner-icon">📢</span>
            <div><strong>SDC Comms Notification:</strong> Press/Media present at scene. SDC Communications team must be notified immediately.</div>
          </div>
        )}

        {showReviewWarningBanner && (
          <div className="warning-banner warning">
            <span className="banner-icon">⚠️</span>
            <div><strong>Incident Ageing Alert:</strong> This incident has remained active for 12 consecutive days. Please review and update status.</div>
          </div>
        )}

        {showEscalationWarningBanner && (
          <div className="warning-banner danger">
            <span className="banner-icon">🚨</span>
            <div><strong>Incident Ageing Escalation:</strong> This incident has remained active for 14 consecutive days. Immediate action toward closure is required.</div>
          </div>
        )}
      </div>

      {/* Accordion Form */}
      <form
        id="new-incident-form"
        onSubmit={handleFormSubmit}
        onChangeCapture={() => setDirty(true)}
      >
        <div className="form-columns-container" style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Left Column: Form Sections */}
          <div style={{ flex: 1, minWidth: 0 }}>
        
        {/* 1. GENERAL INFORMATION */}
        <div id="incident-section-1" className={`accordion-item ${expandedSections[1] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(1)}>
            <div className="accordion-header-left">
              <span className="accordion-num">1</span>
              <span className="accordion-title">General Information</span>
            </div>
            <div className="accordion-header-right">
              {title && <span className="badge badge-completed">Valid</span>}
              <span>{expandedSections[1] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[1] && (
            <div className="accordion-content">
              <div className="form-grid">
                <div className="form-group colspan-2">
                  <label>Incident Title *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Unattended black bag left near Lifeguard Post 2"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Case ID {selectedCaseId === 'new-case' ? '(Auto)' : ''}</label>

                  <div style={{ position: 'relative' }}>
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
                    <span style={selectedCaseId === 'new-case' ? { fontStyle: 'italic', color: 'var(--text-muted)' } : undefined}>
                      {selectedCaseId === 'new-case'
                        ? 'SEN/CI/YYYYMMDD/NNN — Auto-create new case'
                        : `${selectedCaseId} - ${cases.find(c => c.id === selectedCaseId)?.title || ''}`}
                    </span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
                  </div>

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
                      <div style={{ padding: '8px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-inset)' }}>
                        <input
                          type="text"
                          placeholder="Search case ID or title..."
                          value={caseSearchText}
                          onChange={e => setCaseSearchText(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          className="form-control"
                          style={{ fontSize: '12px', height: '30px', padding: '4px 8px', width: '100%', boxSizing: 'border-box' }}
                          autoFocus
                        />
                      </div>

                      <div style={{ overflowY: 'auto', flex: 1, maxHeight: '200px' }}>
                        <div
                          onClick={() => {
                            setSelectedCaseId('new-case');
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
                            background: selectedCaseId === 'new-case' ? 'var(--bg-hover)' : 'transparent'
                          }}
                        >
                          ➕ Auto-create New Case
                        </div>

                        {cases
                          .filter(c => {
                            if (!caseSearchText.trim()) return true;
                            const query = caseSearchText.toLowerCase();
                            return c.id.toLowerCase().includes(query) || c.title.toLowerCase().includes(query);
                          })
                          .map(c => {
                            const isSelected = selectedCaseId === c.id;
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  setSelectedCaseId(c.id);
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

                        {cases.filter(c => {
                          if (!caseSearchText.trim()) return true;
                          const query = caseSearchText.toLowerCase();
                          return c.id.toLowerCase().includes(query) || c.title.toLowerCase().includes(query);
                        }).length === 0 && (
                          <div style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            No eligible cases found
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </div>


                <div className="form-group">
                  <label>Incident Category *</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="form-control select-dark" required>
                    {INCIDENT_CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
                    {INCIDENT_CATEGORY_HELP[category as keyof typeof INCIDENT_CATEGORY_HELP]}
                  </p>
                </div>

                <div className="form-group">
                  <label>Incident Type *</label>
                  <select value={incType} onChange={(e) => setIncType(e.target.value)} className="form-control select-dark" required>
                    <option value="">-- Select Type --</option>
                    {Object.keys(taxonomy).sort().map(type => (
                      <option key={type} value={type}>{type}</option>
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
                  <label>Priority *</label>
                  <select value={priority} onChange={(e) => setPriority(e.target.value)} className="form-control select-dark">
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Crisis Level *</label>
                  <select value={crisisLevel} onChange={(e) => setCrisisLevel(e.target.value)} className="form-control select-dark">
                    <option value="1">Level 1 (Crisis)</option>
                    <option value="2">Level 2</option>
                    <option value="3">Level 3</option>
                    <option value="4">Level 4 (Default)</option>
                    <option value="5">Level 5 (Low)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Reporting Source</label>
                  <select value={reportingSource} onChange={(e) => setReportingSource(e.target.value)} className="form-control select-dark">
                    <option value="Public Phone">Public Phone</option>
                    <option value="Email">Email</option>
                    <option value="UCS">UCS</option>
                    <option value="VA">VA</option>
                    <option value="State Agency">State Agency</option>
                    <option value="Government Agency">Government Agency</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Requested By</label>
                  <input
                    type="text"
                    placeholder="Person or team who requested the response"
                    value={requestedBy}
                    onChange={e => setRequestedBy(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Reporter's Name</label>
                  <input
                    type="text"
                    placeholder="Enter reporter details if any"
                    value={reporterName}
                    onChange={e => setReporterName(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Created By</label>
                  <input type="text" value={createdBy} disabled className="form-control" style={{ background: 'var(--bg-inset)' }} />
                </div>

                <div className="form-group">
                  <label>Date and Time of Incident *</label>
                  <input 
                    type="datetime-local" 
                    value={incidentDateTime} 
                    onChange={(e) => setIncidentDateTime(e.target.value)}
                    required
                    className="form-control"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. LOCATION */}
        <div id="incident-section-2" className={`accordion-item ${expandedSections[2] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(2)}>
            <div className="accordion-header-left">
              <span className="accordion-num">2</span>
              <span className="accordion-title">Location</span>
            </div>
            <div className="accordion-header-right">
              {commonName && <span className="badge badge-onsite">Mapped</span>}
              <span>{expandedSections[2] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[2] && (
            <div className="accordion-content">
              <div className="form-grid">
                <div style={{ gridColumn: 'span 2' }}>
                  <LocationSelector
                    onLocationSelect={handleLocationChange}
                    initialRoad={road}
                    initialBuilding={building}
                    initialLevelSpace={levelSpace}
                    initialCommonName={commonName}
                    initialPostalCode={postalCode}
                  />
                </div>

                <div className="form-group">
                  <label>Common Name Reference</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Siloso Lifeguard Post 2"
                    value={commonName}
                    onChange={(e) => setCommonName(e.target.value)}
                    className="form-control"
                  />
                </div>

                <div className="form-group">
                  <label>Beside / Near To / At Qualifier</label>
                  <input type="text" placeholder="e.g. Near public shower block" value={nearAt} onChange={(e) => setNearAt(e.target.value)} className="form-control" />
                </div>

                <div className="form-group colspan-2" style={{ display: 'none' }}>
                  {/* Keep hidden levelSpace to ensure it doesn't break any validation or legacy refs */}
                  <input type="text" value={levelSpace} readOnly />
                </div>

                <div className="form-group">
                  <label>Postal Code</label>
                  <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="form-control" />
                </div>

                <div className="form-group">
                  <label>Location Tags (Comma separated)</label>
                  <input type="text" value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} className="form-control" />
                </div>

                {/* Minimap Widget Mock */}
                <div className="form-group colspan-2">
                  <label>Interactive Minimap (OneMap API Layout)</label>
                  <div className="mock-map-canvas">
                    <div className="map-grid-bg" />
                    <div className="map-beach-line" />
                    <div className="map-sea-line" />
                    <div className="map-pin" style={{ left: manualPin ? '60%' : '38%', top: manualPin ? '30%' : '45%' }}>📍</div>
                    
                    <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(255,255,255,0.95)', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', border: '1px solid var(--border-color)', pointerEvents: 'none' }}>
                      <strong>Pin Position:</strong> {pinCoords.lat.toFixed(4)}, {pinCoords.lng.toFixed(4)} {manualPin ? '(Manual Drop)' : '(Resolved Address)'}
                    </div>
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', gap: '10px' }}>
                    <button 
                      type="button" 
                      onClick={() => {
                        setManualPin(!manualPin);
                        if (!manualPin) {
                          setPinCoords({ lat: 1.2562, lng: 103.8124 });
                        } else {
                          setPinCoords({ lat: 1.2500, lng: 103.8300 });
                        }
                      }} 
                      className="btn btn-secondary btn-xs"
                    >
                      {manualPin ? 'Clear Pin Drop' : 'Place Pin Manually'}
                    </button>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                      Manual pin placement overrides postal code coordinates.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. INCIDENT LOG */}
        <div id="incident-section-3" className={`accordion-item ${expandedSections[3] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(3)}>
            <div className="accordion-header-left">
              <span className="accordion-num">3</span>
              <span className="accordion-title">Incident Log ({logs.length} entries)</span>
            </div>
            <div className="accordion-header-right">
              <span>{expandedSections[3] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[3] && (
            <div className="accordion-content">
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Chronological sequence of events logging. Each row represents a timestamped operational activity entry.
              </p>
              
              <div className="table-container mb-4">
                <table className="custom-table" style={{ background: 'var(--bg-inset)' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '8%' }}>No.</th>
                      <th style={{ width: '15%' }}>Date</th>
                      <th style={{ width: '15%' }}>Time</th>
                      <th>Log Description</th>
                      <th style={{ width: '10%' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, idx) => (
                      <tr key={log.id}>
                        <td>{idx + 1}</td>
                        <td>
                          <input 
                            type="date" 
                            value={log.date} 
                            onChange={(e) => {
                              const newVal = e.target.value;
                              setLogs(prev => prev.map(l => l.id === log.id ? { ...l, date: newVal } : l));
                            }} 
                            className="form-control"
                            style={{ padding: '4px 6px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <input 
                            type="time" 
                            value={log.time} 
                            onChange={(e) => {
                              const newVal = e.target.value;
                              setLogs(prev => prev.map(l => l.id === log.id ? { ...l, time: newVal } : l));
                            }} 
                            className="form-control"
                            style={{ padding: '4px 6px', fontSize: '12px' }}
                          />
                        </td>
                        <td>
                          <textarea 
                            value={log.description} 
                            onChange={(e) => {
                              const newVal = e.target.value;
                              setLogs(prev => prev.map(l => l.id === log.id ? { ...l, description: newVal } : l));
                            }} 
                            placeholder="Enter timeline detail..."
                            className="form-control"
                            rows={2}
                            style={{ padding: '6px 8px', fontSize: '12.5px', resize: 'vertical', minHeight: '40px', lineHeight: '1.4' }}
                          />
                        </td>
                        <td>
                          <button 
                            type="button" 
                            onClick={() => setLogs(prev => prev.filter(l => l.id !== log.id))}
                            className="btn btn-danger btn-xs"
                            disabled={logs.length === 1}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button 
                type="button" 
                onClick={() => {
                  const maxId = logs.length > 0 ? Math.max(...logs.map(l => l.id)) : 0;
                  const nowStr = new Date();
                  setLogs(prev => [...prev, {
                    id: maxId + 1,
                    date: nowStr.toISOString().split('T')[0],
                    time: nowStr.toTimeString().slice(0, 5),
                    description: ''
                  }]);
                }} 
                className="btn btn-secondary btn-sm"
              >
                + Add Log Entry
              </button>
            </div>
          )}
        </div>

        {/* 4. EMERGENCY SERVICES */}
        <div id="incident-section-4" className={`accordion-item ${expandedSections[4] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(4)}>
            <div className="accordion-header-left">
              <span className="accordion-num">4</span>
              <span className="accordion-title">Emergency Services</span>
            </div>
            <div className="accordion-header-right">
              {(policeAtScene || scdfType !== 'None') && <span className="badge badge-ack">Active</span>}
              <span>{expandedSections[4] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[4] && (
            <div className="accordion-content">
              {/* Police */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <input 
                    type="checkbox" 
                    id="policeAtScene" 
                    checked={policeAtScene} 
                    onChange={e => setPoliceAtScene(e.target.checked)} 
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="policeAtScene" style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}>
                    🚨 Police Attending Scene
                  </label>
                </div>

                {policeAtScene && (
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Attending Officer & Rank</label>
                      <input type="text" placeholder="e.g. Sgt. Tan" value={policeOfficer} onChange={e => setPoliceOfficer(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Police Incident Number</label>
                      <input type="text" placeholder="e.g. SPF-10928A" value={policeIncidentNo} onChange={e => setPoliceIncidentNo(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Police Classification</label>
                      <input type="text" placeholder="e.g. Theft / Mischief" value={policeClassification} onChange={e => setPoliceClassification(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Responding Unit / Station</label>
                      <input type="text" placeholder="e.g. Marina Bay NPP" value={policeUnit} onChange={e => setPoliceUnit(e.target.value)} className="form-control" />
                    </div>
                  </div>
                )}
              </div>

              {/* SCDF / Ambulance */}
              <div>
                <div className="form-group" style={{ maxWidth: '300px' }}>
                  <label>Ambulance / SCDF Attending</label>
                  <select value={scdfType} onChange={(e) => setScdfType(e.target.value)} className="form-control select-dark">
                    <option value="None">None</option>
                    <option value="Ambulance">Ambulance</option>
                    <option value="SCDF">SCDF Fire Service</option>
                  </select>
                </div>

                {scdfType !== 'None' && (
                  <div className="form-grid" style={{ marginTop: '12px' }}>
                    <div className="form-group">
                      <label>Attending Officer Name</label>
                      <input type="text" placeholder="e.g. Officer Roslan" value={scdfOfficer} onChange={e => setScdfOfficer(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Vehicle / Call Sign</label>
                      <input type="text" placeholder="e.g. Alpha 12" value={scdfCallSign} onChange={e => setScdfCallSign(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Responding Station</label>
                      <input type="text" placeholder="e.g. Bukit Merah Fire Stn" value={scdfUnit} onChange={e => setScdfUnit(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group">
                      <label>Arrival Time at Scene</label>
                      <input type="time" value={scdfArrivalTime} onChange={e => setScdfArrivalTime(e.target.value)} className="form-control" />
                    </div>
                    <div className="form-group colspan-2">
                      <label>Hospital Patient Conveyed To</label>
                      <input type="text" placeholder="e.g. Singapore General Hospital (A&E)" value={scdfHospital} onChange={e => setScdfHospital(e.target.value)} className="form-control" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 5. MEDIA INVOLVEMENT */}
        <div id="incident-section-5" className={`accordion-item ${expandedSections[5] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(5)}>
            <div className="accordion-header-left">
              <span className="accordion-num">5</span>
              <span className="accordion-title">Media Involvement</span>
            </div>
            <div className="accordion-header-right">
              {mediaAtScene && <span className="badge badge-live">Media Present</span>}
              <span>{expandedSections[5] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[5] && (
            <div className="accordion-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <input 
                  type="checkbox" 
                  id="mediaAtScene" 
                  checked={mediaAtScene} 
                  onChange={e => setMediaAtScene(e.target.checked)} 
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="mediaAtScene" style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}>
                  🎥 Press / Media Present at Scene
                </label>
              </div>

              {mediaAtScene && (
                <div className="form-grid">
                  <div className="form-group colspan-2">
                    <label>Media / Outlet Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Channel NewsAsia / Straits Times"
                      value={mediaName} 
                      onChange={e => setMediaName(e.target.value)} 
                      className="form-control" 
                    />
                  </div>
                  <div className="form-group colspan-2">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <input 
                        type="checkbox" 
                        id="mediaCommsNotified" 
                        checked={mediaCommsNotified} 
                        onChange={e => setMediaCommsNotified(e.target.checked)} 
                        style={{ width: '14px', height: '14px', cursor: 'pointer' }}
                      />
                      <label htmlFor="mediaCommsNotified" style={{ fontSize: '12.5px', color: 'var(--text-sub)', cursor: 'pointer' }}>
                        Confirmed SDC Corporate Communications Team notified.
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 6. PROPERTY & VEHICLES */}
        <div id="incident-section-6" className={`accordion-item ${expandedSections[6] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(6)}>
            <div className="accordion-header-left">
              <span className="accordion-num">6</span>
              <span className="accordion-title">Property & Vehicles ({vehicles.length} vehicles)</span>
            </div>
            <div className="accordion-header-right">
              {(propertyDamaged || vehicles.length > 0) && <span className="badge badge-onsite">Logged</span>}
              <span>{expandedSections[6] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[6] && (
            <div className="accordion-content">
              {/* SDC Property damage */}
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <input 
                    type="checkbox" 
                    id="propertyDamaged" 
                    checked={propertyDamaged} 
                    onChange={e => setPropertyDamaged(e.target.checked)} 
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="propertyDamaged" style={{ fontWeight: '600', fontSize: '13px', color: 'var(--text-main)', cursor: 'pointer' }}>
                    🏢 SDC Property Damaged
                  </label>
                </div>
                {propertyDamaged && (
                  <div className="form-group">
                    <label>Description of Damage</label>
                    <textarea 
                      placeholder="e.g. Scratched paintwork on gantry barriers, broken post rails."
                      value={propertyDamageDesc} 
                      onChange={e => setPropertyDamageDesc(e.target.value)} 
                      className="form-control"
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* Vehicles */}
              <div>
                <label style={{ display: 'block', fontWeight: '700', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Vehicles Involved
                </label>
                
                {vehicles.length === 0 ? (
                  <div style={{ background: 'var(--bg-inset)', padding: '14px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
                    No vehicle records added. Click the button below to add.
                  </div>
                ) : (
                  vehicles.map((v, index) => (
                    <div key={v.id} className="sub-form-card">
                      <div className="remove-card-btn">
                        <button 
                          type="button" 
                          onClick={() => setVehicles(prev => prev.filter(item => item.id !== v.id))}
                          className="btn btn-danger btn-xs"
                        >
                          Remove Vehicle #{index + 1}
                        </button>
                      </div>

                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', display: 'block', marginBottom: '12px' }}>
                        Vehicle Details #{index + 1}
                      </span>

                      <div className="form-grid">
                        <div className="form-group colspan-2">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                              type="checkbox" 
                              id={`sdcVehicle-${v.id}`} 
                              checked={v.sdcVehicle} 
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, sdcVehicle: checked } : item));
                              }}
                            />
                            <label htmlFor={`sdcVehicle-${v.id}`} style={{ fontWeight: '500', fontSize: '12.5px' }}>
                              SDC Owned Vehicle
                            </label>
                          </div>
                        </div>

                        <div className="form-group">
                          <label>Vehicle Model</label>
                          <input 
                            type="text" 
                            placeholder="e.g. Toyota Hiace"
                            value={v.model} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, model: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>

                        <div className="form-group">
                          <label>Vehicle License Plate</label>
                          <input 
                            type="text" 
                            placeholder="e.g. GBA1234Z"
                            value={v.plate} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, plate: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>

                        <div className="form-group">
                          <label>Driver Name</label>
                          <input 
                            type="text" 
                            value={v.driverName} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, driverName: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>

                        <div className="form-group">
                          <label>Driver Contact</label>
                          <input 
                            type="text" 
                            value={v.driverContact} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, driverContact: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>

                        <div className="form-group">
                          <label>Driving License No.</label>
                          <input 
                            type="text" 
                            value={v.licence} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, licence: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>

                        <div className="form-group">
                          <label>Driver Address</label>
                          <input 
                            type="text" 
                            value={v.address} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, address: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>

                        <div className="form-group colspan-2">
                          <label>Remarks / Insurer Details</label>
                          <input 
                            type="text" 
                            value={v.remarks} 
                            onChange={(e) => {
                              const val = e.target.value;
                              setVehicles(prev => prev.map(item => item.id === v.id ? { ...item, remarks: val } : item));
                            }} 
                            className="form-control" 
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}

                <button 
                  type="button" 
                  onClick={() => {
                    const maxId = vehicles.length > 0 ? Math.max(...vehicles.map(item => item.id)) : 0;
                    setVehicles(prev => [...prev, {
                      id: maxId + 1, sdcVehicle: false, model: '', plate: '', driverName: '', driverContact: '', licence: '', address: '', remarks: ''
                    }]);
                  }} 
                  className="btn btn-secondary btn-sm"
                >
                  + Add Vehicle Record
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 7. PERSONAL INJURIES */}
        <div id="incident-section-7" className={`accordion-item ${expandedSections[7] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(7)}>
            <div className="accordion-header-left">
              <span className="accordion-num">7</span>
              <span className="accordion-title">Personal Injuries ({injuries.length} persons)</span>
            </div>
            <div className="accordion-header-right">
              {injuries.length > 0 && <span className="badge badge-live">Injuries Logged</span>}
              <span>{expandedSections[7] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[7] && (
            <div className="accordion-content">
              {injuries.length === 0 ? (
                <div style={{ background: 'var(--bg-inset)', padding: '14px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
                  No injury records added. Click below to add if an individual sustained bodily injury.
                </div>
              ) : (
                injuries.map((inj, index) => (
                  <div key={inj.id} className="sub-form-card">
                    <div className="remove-card-btn">
                      <button 
                        type="button" 
                        onClick={() => setInjuries(prev => prev.filter(item => item.id !== inj.id))}
                        className="btn btn-danger btn-xs"
                      >
                        Remove Record #{index + 1}
                      </button>
                    </div>

                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', display: 'block', marginBottom: '12px' }}>
                      Injured Individual Details #{index + 1}
                    </span>

                    <div className="form-grid">
                      <div className="form-group colspan-2">
                        <label>Clinic or Hospital Attended</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Singapore General Hospital"
                          value={inj.hospital} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setInjuries(prev => prev.map(item => item.id === inj.id ? { ...item, hospital: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      {/* MSIG Insurance block */}
                      <div className="form-group colspan-2" style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px', marginTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: inj.msigIssued ? '8px' : 0 }}>
                          <input
                            type="checkbox"
                            id={`msigIssued-${inj.id}`}
                            checked={inj.msigIssued}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setInjuries(prev => prev.map(item => item.id === inj.id ? { ...item, msigIssued: checked, msigSerial: checked ? item.msigSerial : '' } : item));
                            }}
                          />
                          <label htmlFor={`msigIssued-${inj.id}`} style={{ fontWeight: '500', fontSize: '12.5px', cursor: 'pointer', margin: 0 }}>
                            MSIG Form Issued
                          </label>
                        </div>
                        {inj.msigIssued && (
                          <div className="form-grid">
                            <div className="form-group">
                              <label>MSIG Serial Number</label>
                              <input
                                type="text"
                                placeholder="e.g. MSIG-90218"
                                value={inj.msigSerial}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setInjuries(prev => prev.map(item => item.id === inj.id ? { ...item, msigSerial: val } : item));
                                }}
                                className="form-control"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Under-16 conditional fields */}
                      <div className="form-group colspan-2" style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px', marginTop: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="checkbox"
                            id={`under16-${inj.id}`}
                            checked={inj.under16}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setInjuries(prev => prev.map(item => item.id === inj.id ? { ...item, under16: checked } : item));
                            }}
                          />
                          <label htmlFor={`under16-${inj.id}`} style={{ fontWeight: '600', fontSize: '12.5px', color: 'var(--text-main)', cursor: 'pointer', margin: 0 }}>
                            Under-16 Indicator
                          </label>
                        </div>

                        {inj.under16 && (
                          <div className="form-grid" style={{ background: '#FFFDF5', padding: '12px', borderRadius: '6px', border: '1px solid #E6D8B3' }}>
                            <div className="form-group">
                              <label>Parent or Guardian Name</label>
                              <input 
                                type="text" 
                                value={inj.parentName} 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setInjuries(prev => prev.map(item => item.id === inj.id ? { ...item, parentName: val } : item));
                                }} 
                                className="form-control" 
                              />
                            </div>
                            <div className="form-group">
                              <label>Parent or Guardian Contact</label>
                              <input 
                                type="text" 
                                value={inj.parentContact} 
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setInjuries(prev => prev.map(item => item.id === inj.id ? { ...item, parentContact: val } : item));
                                }} 
                                className="form-control" 
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}

              <button 
                type="button" 
                onClick={() => {
                  const maxId = injuries.length > 0 ? Math.max(...injuries.map(item => item.id)) : 0;
                  setInjuries(prev => [...prev, {
                    id: maxId + 1, hospital: '', msigIssued: false, msigSerial: '', under16: false, parentName: '', parentContact: ''
                  }]);
                }} 
                className="btn btn-secondary btn-sm"
              >
                + Add Injury Record
              </button>
            </div>
          )}
        </div>

        {/* 8. PERSONS INVOLVED */}
        <div id="incident-section-8" className={`accordion-item ${expandedSections[8] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(8)}>
            <div className="accordion-header-left">
              <span className="accordion-num">8</span>
              <span className="accordion-title">Persons Involved ({persons.length} persons)</span>
            </div>
            <div className="accordion-header-right">
              {persons.length > 0 && <span className="badge badge-review">Logged</span>}
              <span>{expandedSections[8] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[8] && (
            <div className="accordion-content">
              {persons.length === 0 ? (
                <div style={{ background: 'var(--bg-inset)', padding: '14px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
                  No additional persons involved (witnesses, staff, partners) logged. Click below to add.
                </div>
              ) : (
                persons.map((p, index) => (
                  <div key={p.id} className="sub-form-card">
                    <div className="remove-card-btn">
                      <button 
                        type="button" 
                        onClick={() => setPersons(prev => prev.filter(item => item.id !== p.id))}
                        className="btn btn-danger btn-xs"
                      >
                        Remove Person #{index + 1}
                      </button>
                    </div>

                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', display: 'block', marginBottom: '12px' }}>
                      Individual Record #{index + 1}
                    </span>

                    <div className="form-grid">
                      <div className="form-group">
                        <label>Guest / non-Guest Status</label>
                        <select 
                          value={p.guestOrNon} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, guestOrNon: val } : item));
                          }} 
                          className="form-control select-dark"
                        >
                          <option value="Guest">Guest</option>
                          <option value="Non-Guest">Non-Guest</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Personnel Category</label>
                        <select 
                          value={p.type} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, type: val } : item));
                          }} 
                          className="form-control select-dark"
                        >
                          <option value="Guest">Guest</option>
                          <option value="Staff">Staff</option>
                          <option value="Island Partner">Island Partner</option>
                          <option value="Contractor">Contractor</option>
                          <option value="Resident">Resident</option>
                          <option value="Others">Others</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>Name</label>
                        <input 
                          type="text" 
                          value={p.name} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, name: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>Contact Number</label>
                        <input 
                          type="text" 
                          value={p.contact} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, contact: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>Age</label>
                        <input 
                          type="number" 
                          value={p.age} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, age: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>Gender</label>
                        <select 
                          value={p.gender} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, gender: val } : item));
                          }} 
                          className="form-control select-dark"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div className="form-group colspan-2">
                        <label>Address</label>
                        <input 
                          type="text" 
                          value={p.address} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, address: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>Role / Involvement</label>
                        <input 
                          type="text" 
                          placeholder="e.g. Witness / Informant"
                          value={p.role} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setPersons(prev => prev.map(item => item.id === p.id ? { ...item, role: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>Injury Details (If injured)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: p.injured ? 8 : 0 }}>
                          <input
                            type="checkbox"
                            id={`injured-${p.id}`}
                            checked={p.injured}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setPersons(prev => prev.map(item => item.id === p.id ? { ...item, injured: checked, injuryDetails: checked ? item.injuryDetails : '' } : item));
                            }}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                          />
                          <label htmlFor={`injured-${p.id}`} style={{ margin: 0, fontWeight: 'normal', cursor: 'pointer', fontSize: '12.5px' }}>Injured</label>
                        </div>
                        {p.injured && (
                          <textarea
                            placeholder="Describe injury details..."
                            value={p.injuryDetails}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPersons(prev => prev.map(item => item.id === p.id ? { ...item, injuryDetails: val } : item));
                            }}
                            className="form-control"
                            rows={2}
                            style={{ padding: '6px 8px', fontSize: '12.5px', resize: 'vertical', minHeight: '40px', lineHeight: '1.4' }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}

              <button 
                type="button" 
                onClick={() => {
                  const maxId = persons.length > 0 ? Math.max(...persons.map(item => item.id)) : 0;
                  setPersons(prev => [...prev, {
                    id: maxId + 1, guestOrNon: 'Guest', type: 'Guest', name: '', address: '', age: '', gender: 'Male', contact: '', role: '', injured: false, injuryDetails: ''
                  }]);
                }} 
                className="btn btn-secondary btn-sm"
              >
                + Add Person Record
              </button>
            </div>
          )}
        </div>

        {/* 9. CCTV & BODY WORN CAMERA */}
        <div id="incident-section-9" className={`accordion-item ${expandedSections[9] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(9)}>
            <div className="accordion-header-left">
              <span className="accordion-num">9</span>
              <span className="accordion-title">CCTV & Body Worn Camera ({cctvFootages.length} references)</span>
            </div>
            <div className="accordion-header-right">
              {cctvFootages.length > 0 && <span className="badge badge-onsite">Logged</span>}
              <span>{expandedSections[9] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[9] && (
            <div className="accordion-content">
              {cctvFootages.length === 0 ? (
                <div style={{ background: 'var(--bg-inset)', padding: '14px', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center', marginBottom: '12px' }}>
                  No CCTV / BWC references logged. Click below to add a footage reference descriptor.
                </div>
              ) : (
                cctvFootages.map((cctv, index) => (
                  <div key={cctv.id} className="sub-form-card">
                    <div className="remove-card-btn">
                      <button 
                        type="button" 
                        onClick={() => setCctvFootages(prev => prev.filter(item => item.id !== cctv.id))}
                        className="btn btn-danger btn-xs"
                      >
                        Remove Reference #{index + 1}
                      </button>
                    </div>

                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-primary)', display: 'block', marginBottom: '12px' }}>
                      Footage Descriptor #{index + 1}
                    </span>

                    <div className="form-grid">
                      <div className="form-group">
                        <label>Camera Number / Reference ID</label>
                        <input 
                          type="text" 
                          placeholder="e.g. CAM-SIL-08"
                          value={cctv.cameraNo} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCctvFootages(prev => prev.map(item => item.id === cctv.id ? { ...item, cameraNo: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>VMS Footage Timestamp</label>
                        <input 
                          type="time" 
                          value={cctv.timestamp} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCctvFootages(prev => prev.map(item => item.id === cctv.id ? { ...item, timestamp: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group colspan-2">
                        <label>VMS Footage Bookmark Reference</label>
                        <input 
                          type="text" 
                          placeholder="e.g. VA-ABANDON-08"
                          value={cctv.bookmark} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCctvFootages(prev => prev.map(item => item.id === cctv.id ? { ...item, bookmark: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>BWC Device Number</label>
                        <input 
                          type="text" 
                          placeholder="e.g. BWC-R12"
                          value={cctv.bwcNo} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCctvFootages(prev => prev.map(item => item.id === cctv.id ? { ...item, bwcNo: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>

                      <div className="form-group">
                        <label>BWC Incident Footage Timestamp</label>
                        <input 
                          type="time" 
                          value={cctv.bwcTimestamp} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCctvFootages(prev => prev.map(item => item.id === cctv.id ? { ...item, bwcTimestamp: val } : item));
                          }} 
                          className="form-control" 
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}

              <button 
                type="button" 
                onClick={() => {
                  const maxId = cctvFootages.length > 0 ? Math.max(...cctvFootages.map(item => item.id)) : 0;
                  setCctvFootages(prev => [...prev, {
                    id: maxId + 1, cameraNo: '', timestamp: '', bookmark: '', bwcNo: '', bwcTimestamp: ''
                  }]);
                }} 
                className="btn btn-secondary btn-sm"
              >
                + Add Footage Reference
              </button>
            </div>
          )}
        </div>

        {/* 10. ATTACHMENTS */}
        <div id="incident-section-10" className={`accordion-item ${expandedSections[10] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(10)}>
            <div className="accordion-header-left">
              <span className="accordion-num">10</span>
              <span className="accordion-title">Attachments</span>
            </div>
            <div className="accordion-header-right">
              {mockFiles.length > 0 && <span className="badge badge-completed">{mockFiles.length} files</span>}
              <span>{expandedSections[10] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[10] && (
            <div className="accordion-content">
              <div 
                className="mock-dropzone"
                onClick={() => {
                  const demoFiles = [
                    { name: 'photo_scene_1.jpg', size: '1.2 MB' },
                    { name: 'bwc_recording_clip.mp4', size: '15.4 MB' },
                    { name: 'incident_witness_statement.pdf', size: '240 KB' }
                  ];
                  const nextFile = demoFiles[mockFiles.length % demoFiles.length];
                  setMockFiles(prev => [...prev, nextFile]);
                }}
              >
                <span>📁</span>
                <div style={{ marginTop: '8px', fontSize: '13.5px', fontWeight: '600' }}>Click here to simulate drag-and-drop file upload</div>
                <div style={{ fontSize: '12px', color: 'var(--text-faint)', marginTop: '4px' }}>
                  Accepted formats: Photos, Videos, and Document files.
                </div>
              </div>

              {mockFiles.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    Uploaded Files
                  </label>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {mockFiles.map((f, idx) => (
                      <li key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: '6px', marginBottom: '6px', fontSize: '12.5px' }}>
                        <span>📄 {f.name} ({f.size})</span>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setMockFiles(prev => prev.filter((_, i) => i !== idx)); }} style={{ border: 'none', background: 'transparent', color: 'var(--color-critical)', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', color: 'var(--color-critical)', padding: '10px 14px', borderRadius: '6px', marginTop: '14px', fontSize: '12px', fontWeight: '500' }}>
                ⚠️ <strong>Security Disclaimer:</strong> Police reports shall NOT be attached in this section.
              </div>
            </div>
          )}
        </div>

        {/* 11. RESPONDER ASSIGNMENT */}
        <div id="incident-section-11" className={`accordion-item ${expandedSections[11] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(11)}>
            <div className="accordion-header-left">
              <span className="accordion-num">11</span>
              <span className="accordion-title">Responder Assignment</span>
            </div>
            <div className="accordion-header-right">
              {assignedResponders.length > 0 && <span className="badge badge-ack">{assignedResponders.length} Assigned</span>}
              <span>{expandedSections[11] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[11] && (
            <div className="accordion-content">
              <div style={{ maxWidth: '450px' }}>
                <MultiResponderSelect
                  value={assignedResponders}
                  onChange={(updated) => { setDirty(true); setAssignedResponders(updated); }}
                  label="Select Responder(s) (Responder / Ranger Staff)"
                />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                * Note: Assigning a Responder is optional. Controllers can log and process the incident without assigning a responder to the ground.
                {category !== DEFAULT_INCIDENT_CATEGORY && (
                  <> {category === 'Backdated Incident'
                    ? 'For Backdated Incidents, if no ground/post-action input is needed you can fill in the record yourself and submit straight for endorsement. Only assign a Responder if someone needs to update the incident log or other operational details.'
                    : 'Informational / Exercise Records do not require a Responder by default — assign one only if response milestone tracking is actually needed for this record.'}</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* 12. SUMMARY & CLOSURE */}
        <div id="incident-section-12" className={`accordion-item ${expandedSections[12] ? 'expanded' : ''}`}>
          <div className="accordion-header" onClick={() => toggleSection(12)}>
            <div className="accordion-header-left">
              <span className="accordion-num">12</span>
              <span className="accordion-title">Summary & Closure</span>
            </div>
            <div className="accordion-header-right">
              {summary && <span className="badge badge-completed">Ready</span>}
              <span>{expandedSections[12] ? '▲' : '▼'}</span>
            </div>
          </div>
          {expandedSections[12] && (
            <div className="accordion-content">
              <div className="form-group">
                <label>Incident Summary (Rich-Text Editor Mock) *</label>
                <textarea
                  placeholder="Provide a detailed operational summary of the incident..."
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="form-control"
                  rows={4}
                  required
                />
              </div>
            </div>
          )}
        </div>
        </div>

          {/* Right Column: Sticky Navigation Panel */}
          <aside className="sticky-navigator" style={{ width: '250px', flexShrink: 0, position: 'sticky', top: '96px' }}>
            <div className="sticky-navigator-card">
              <div className="navigator-title">Incident Sections</div>
              <ul className="navigator-list">
                {[
                  { id: 1, label: '1. General Information' },
                  { id: 2, label: '2. Location' },
                  { id: 3, label: '3. Incident Log' },
                  { id: 4, label: '4. Emergency Services' },
                  { id: 5, label: '5. Media Involvement' },
                  { id: 6, label: '6. Property & Vehicles' },
                  { id: 7, label: '7. Personal Injuries' },
                  { id: 8, label: '8. Persons Involved' },
                  { id: 9, label: '9. CCTV & Body Worn Camera' },
                  { id: 10, label: '10. Attachments' },
                  { id: 11, label: '11. Responder Assignment' },
                  { id: 12, label: '12. Summary & Closure' }
                ].map(sec => (
                  <li 
                    key={sec.id} 
                    onClick={() => scrollToSection(sec.id)}
                    className={`navigator-item ${activeSection === sec.id ? 'active' : ''}`}
                    style={{ paddingLeft: activeSection === sec.id ? '9px' : '12px' }}
                  >
                    <span style={{ width: '12px', display: 'inline-block', flexShrink: 0, color: 'var(--color-primary)', fontSize: '10px' }}>
                      {activeSection === sec.id ? '▶' : ''}
                    </span>
                    {sec.label}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </form>

      {/* Duplicate Detection Modal (FRD 5.7) */}
      {showDuplicateModal && (
        <div className="modal-overlay">
          <div className="modal-content glass" style={{ maxWidth: '560px', width: '100%', padding: '28px', borderTop: '4px solid #EA580C' }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '22px', marginBottom: '8px' }}>⚠️</div>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '6px' }}>
                Possible Duplicate Detected
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-sub)', lineHeight: '1.5' }}>
                {duplicateCandidates.length} open incident{duplicateCandidates.length > 1 ? 's' : ''} of the same type were logged within 2 hours. Please review before proceeding.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', maxHeight: '220px', overflowY: 'auto' }}>
              {duplicateCandidates.map(c => (
                <div key={c.incidentId} style={{ padding: '12px 14px', background: 'var(--bg-inset)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{c.incidentId}</span>
                    <span className="badge badge-live" style={{ fontSize: '10px' }}>{c.status}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', marginBottom: '2px' }}>{c.type} — {c.subType}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-sub)' }}>
                    {c.location?.commonName || c.location?.road || 'Unknown location'} &bull; {new Date(c.dateTime).toLocaleString('en-SG', { hour12: false })}
                  </div>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: '8px', fontSize: '11px' }}
                    onClick={async () => {
                      // Link this new incident as duplicate of the candidate, then submit
                      setShowDuplicateModal(false);
                      try {
                        const newRes = await fetch('/api/cases', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(pendingPayload)
                        });
                        if (newRes.ok) {
                          const newCase = await newRes.json();
                          // Link as duplicate
                          await fetch(`/api/incidents/${newCase.incident.id}/link-duplicate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ masterIncidentId: c.incidentId, username: pendingPayload.username })
                          });
                          setGeneratedCaseId(newCase.id);
                          setGeneratedIncidentId(newCase.incident.id);
                          setSuccessModal(true);
                        } else {
                          const err = await newRes.json();
                          alert(`Failed to log incident: ${err.error || 'Server error'}`);
                        }
                      } catch (err: any) {
                        alert(`Failed to log incident: ${err.message}`);
                      }
                    }}
                  >
                    Link as Duplicate of {c.incidentId}
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setShowDuplicateModal(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setShowDuplicateModal(false);
                  if (pendingPayload) submitIncident(pendingPayload);
                }}
              >
                Proceed as New Incident
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Confirmation Modal */}
      {successModal && (
        <div className="modal-overlay">
          <div className="modal-content glass" style={{ maxWidth: '480px', width: '100%', padding: '28px', borderTop: '4px solid var(--color-primary)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '42px' }}>✅</span>
              <h2 style={{ fontFamily: 'var(--font-title)', fontSize: '20px', fontWeight: '700', color: 'var(--text-main)', marginTop: '12px' }}>
                Incident Successfully Logged!
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
                The new incident record and parent case have been successfully generated in the CMS database.
              </p>
            </div>

            <div style={{ background: 'var(--bg-inset)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Generated Case ID:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--color-info)' }}>{generatedCaseId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: '500' }}>Generated Incident ID:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: '700', color: 'var(--color-info)' }}>{generatedIncidentId}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  // Hard redirect to the newly generated mock incident detail page
                  // We simulate opening details using the ID we just generated.
                  router.push(`/incidents/${generatedIncidentId}`);
                }}
                className="btn btn-primary"
                style={{ width: '100%', padding: '10px' }}
              >
                🔍 Open Incident Details
              </button>
              <button
                type="button"
                onClick={() => {
                  router.push('/case-management?tab=incidents');
                }}
                className="btn btn-secondary"
                style={{ width: '100%', padding: '10px' }}
              >
                🗂️ Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
   