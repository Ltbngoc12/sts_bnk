'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { BroadcastTemplate } from '@/lib/broadcastConfig';
import { DistributionGroup, GroupMember } from '@/lib/groups';
import { Case, Incident } from '@/lib/db';
import { renderTemplate, crisisLevelKey } from '@/lib/broadcast';

interface IncidentOption {
  incident: Incident;
  caseId: string;
  caseTitle: string;
}

interface NewBroadcastModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (createdBroadcast: any) => void;
  username: string;
}

export const BROADCAST_TYPE_OPTIONS = [
  { value: 'Closure', label: 'Closure', category: 'Closure Broadcast' },
  { value: 'END_OF_DAY', label: 'END_OF_DAY', category: 'End-of-Day Interim Broadcast' },
  { value: 'Weather Advisory', label: 'Weather Advisory', category: 'Weather Advisory Broadcast' },
] as const;

export function NewBroadcastModal({
  isOpen,
  onClose,
  onCreated,
  username,
}: NewBroadcastModalProps) {
  // Config & data
  const [incidents, setIncidents] = useState<IncidentOption[]>([]);
  const [existingBroadcasts, setExistingBroadcasts] = useState<any[]>([]);
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [distributionGroups, setDistributionGroups] = useState<DistributionGroup[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Form Selections
  const [selectedBroadcastType, setSelectedBroadcastType] = useState<string>('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['Email']);

  // Recipient list management
  const [activeGroupMembers, setActiveGroupMembers] = useState<GroupMember[]>([]);
  const [customEmails, setCustomEmails] = useState<string[]>([]);
  const [newEmailInput, setNewEmailInput] = useState<string>('');

  // Subject & Content
  const [subject, setSubject] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [contentTab, setContentTab] = useState<'preview' | 'edit'>('preview');

  // Submission & Validation state
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all prerequisites on modal open (fetch all available incidents on the system)
  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSubmitted(false);
    setLoadingData(true);

    Promise.all([
      fetch('/api/cases').then((r) => (r.ok ? r.json() : { data: [] })),
      fetch('/api/broadcasts').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/admin/broadcast-templates').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/admin/broadcast-distribution-groups').then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([casesRes, broadcastsRes, templatesRes, groupsRes]) => {
        // Extract all cases with incident currently available on the system
        const caseList: Case[] = Array.isArray(casesRes) ? casesRes : casesRes?.data || [];
        const incOpts: IncidentOption[] = [];
        caseList.forEach((c) => {
          if (c.incident) {
            incOpts.push({
              incident: c.incident,
              caseId: c.id,
              caseTitle: c.title,
            });
          }
        });
        // Sort: newest incidents first
        incOpts.sort((a, b) => (b.incident.dateTime || '').localeCompare(a.incident.dateTime || ''));
        setIncidents(incOpts);

        // Existing broadcasts
        const bcs = Array.isArray(broadcastsRes) ? broadcastsRes : broadcastsRes?.data || [];
        setExistingBroadcasts(bcs);

        // Active templates only
        const tpls: BroadcastTemplate[] = Array.isArray(templatesRes) ? templatesRes : [];
        const activeTpls = tpls.filter((t) => t.status === 'Active');
        setTemplates(activeTpls);

        // Active distribution groups only
        const grps: DistributionGroup[] = Array.isArray(groupsRes) ? groupsRes : [];
        const activeGrps = grps.filter((g) => g.status === 'Active');
        setDistributionGroups(activeGrps);
      })
      .catch((err) => {
        console.error('Failed to load broadcast modal prerequisites:', err);
        setError('Failed to load incident, template, or group configurations.');
      })
      .finally(() => {
        setLoadingData(false);
      });
  }, [isOpen]);

  // Reset form when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setSelectedBroadcastType('');
      setSelectedIncidentId('');
      setSelectedTemplateId('');
      setSelectedGroupId('');
      setSelectedChannels(['Email']);
      setActiveGroupMembers([]);
      setCustomEmails([]);
      setNewEmailInput('');
      setSubject('');
      setContent('');
      setContentTab('preview');
      setError(null);
      setSubmitted(false);
    }
  }, [isOpen]);

  // Filter templates matching selected Broadcast Type (if selected)
  const filteredTemplates = useMemo(() => {
    if (!selectedBroadcastType) return templates;
    const typeObj = BROADCAST_TYPE_OPTIONS.find((t) => t.value === selectedBroadcastType);
    if (!typeObj) return templates;
    const matching = templates.filter((t) => t.category === typeObj.category);
    return matching.length > 0 ? matching : templates;
  }, [templates, selectedBroadcastType]);

  // Filter incidents: For 'Closure', only show incidents that are status 'Closed' AND do not have a closure broadcast created yet
  const filteredIncidents = useMemo(() => {
    if (selectedBroadcastType === 'Closure') {
      return incidents.filter((opt) => {
        const inc = opt.incident;
        // 1. Status must be Closed
        const isClosed = inc.status?.toLowerCase() === 'closed';
        if (!isClosed) return false;

        // 2. Must NOT have had a closure broadcast created yet
        if (inc.closureBroadcastId) return false;
        if (inc.closureBroadcastStatus === 'pending' || inc.closureBroadcastStatus === 'dispatched') return false;

        const hasClosure = existingBroadcasts.some(
          (b) =>
            (b.incidentId === inc.id || (b.caseId && b.caseId === opt.caseId)) &&
            (b.type === 'Closure' || b.type === 'Closure Broadcast' || b.type?.toLowerCase().includes('closure'))
        );
        return !hasClosure;
      });
    }
    return incidents;
  }, [incidents, selectedBroadcastType, existingBroadcasts]);

  // Find currently selected incident
  const currentIncidentOpt = useMemo(() => {
    return incidents.find((opt) => opt.incident.id === selectedIncidentId) || null;
  }, [incidents, selectedIncidentId]);

  // Find currently selected template
  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Find currently selected distribution group
  const currentGroup = useMemo(() => {
    return distributionGroups.find((g) => g.id === selectedGroupId) || null;
  }, [distributionGroups, selectedGroupId]);

  // Helper: Build vars object for variable substitution
  const buildVars = (incidentOpt: IncidentOption | null): Record<string, string | undefined> => {
    const nowIso = new Date().toISOString();
    const inc = incidentOpt?.incident;
    const caseId = incidentOpt?.caseId || inc?.caseId || '';

    if (!inc) {
      return {
        case_id: 'N/A',
        incident_id: 'N/A',
        incident_title: 'Manual Broadcast Notice',
        incident_datetime: nowIso,
        incident_type: 'Operational',
        incident_subtype: 'General',
        priority: 'Normal',
        location: 'Sentosa Island',
        crisis_level: 'Level 4',
        reporting_source: 'Duty Manager',
        status: 'Live',
        closed_at: nowIso,
        closed_by: username || 'Duty Manager',
        time: nowIso,
        summary: 'Operational broadcast notice issued manually.',
      };
    }

    return {
      case_id: caseId,
      incident_id: inc.id || '',
      incident_title: inc.title || '',
      incident_datetime: inc.dateTime || '',
      incident_type: inc.type || '',
      incident_subtype: inc.subType || '',
      priority: inc.priority || '',
      location:
        typeof inc.location === 'string'
          ? inc.location
          : inc.location?.commonName || inc.location?.road || inc.location?.building || 'Sentosa Island',
      crisis_level: inc.crisisLevel ? crisisLevelKey(inc.crisisLevel) : 'Level 4',
      reporting_source: inc.reportingSource || 'N/A',
      status: inc.status || 'Live',
      closed_at: inc.closedAt || nowIso,
      closed_by: inc.closedBy || username || 'Duty Manager',
      time: nowIso,
      summary: inc.summary || inc.completionRemarks || 'N/A',
    };
  };

  // Re-render template content when Template or Incident changes
  const applyTemplateToContent = (tpl: BroadcastTemplate | null, incOpt: IncidentOption | null) => {
    if (!tpl) {
      setSubject('');
      setContent('');
      return;
    }
    const vars = buildVars(incOpt);
    const renderedSubj = renderTemplate(tpl.subject, vars);
    const renderedBody = renderTemplate(tpl.body, vars);
    setSubject(renderedSubj);
    setContent(renderedBody);
  };

  // Handle Broadcast Type change
  const handleBroadcastTypeChange = (typeVal: string) => {
    setSelectedBroadcastType(typeVal);

    // Channel constraint: Closure and END_OF_DAY are ALWAYS Email only
    if (typeVal === 'Closure' || typeVal === 'END_OF_DAY') {
      setSelectedChannels(['Email']);
    }

    const typeObj = BROADCAST_TYPE_OPTIONS.find((t) => t.value === typeVal);
    let matchedTpl: BroadcastTemplate | null = null;
    if (typeObj) {
      // Find matching template in this category
      const t = templates.find((tpl) => tpl.category === typeObj.category);
      if (t) {
        matchedTpl = t;
        setSelectedTemplateId(t.id);
      } else {
        setSelectedTemplateId('');
      }
    }

    // If switching to Closure, check if current selected incident is eligible
    if (typeVal === 'Closure') {
      const currentIsEligible = filteredIncidents.some((opt) => opt.incident.id === selectedIncidentId);
      if (!currentIsEligible) {
        setSelectedIncidentId('');
        applyTemplateToContent(matchedTpl, null);
        return;
      }
    }

    applyTemplateToContent(matchedTpl, currentIncidentOpt);
  };

  // Handle template selection change
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find((t) => t.id === templateId) || null;
    if (tpl) {
      // If broadcast type isn't set yet or doesn't match, sync it
      const matchedType = BROADCAST_TYPE_OPTIONS.find((t) => t.category === tpl.category);
      if (matchedType && selectedBroadcastType !== matchedType.value) {
        setSelectedBroadcastType(matchedType.value);
        if (matchedType.value === 'Closure' || matchedType.value === 'END_OF_DAY') {
          setSelectedChannels(['Email']);
        }
      }
    }
    applyTemplateToContent(tpl, currentIncidentOpt);
  };

  // Handle incident selection change
  const handleIncidentChange = (incidentId: string) => {
    setSelectedIncidentId(incidentId);
    const incOpt = incidents.find((opt) => opt.incident.id === incidentId) || null;
    if (currentTemplate) {
      applyTemplateToContent(currentTemplate, incOpt);
    }
  };

  // Handle distribution group selection change
  const handleGroupChange = (groupId: string) => {
    setSelectedGroupId(groupId);
    const grp = distributionGroups.find((g) => g.id === groupId);
    if (grp) {
      setActiveGroupMembers([...grp.members]);
    } else {
      setActiveGroupMembers([]);
    }
  };

  // Channel toggle handler (for Weather Advisory)
  const toggleChannel = (channel: string) => {
    if (selectedBroadcastType === 'Closure' || selectedBroadcastType === 'END_OF_DAY') {
      return; // Locked to Email only
    }
    setSelectedChannels((prev) => {
      if (prev.includes(channel)) {
        const next = prev.filter((c) => c !== channel);
        return next.length === 0 ? [channel] : next; // Keep at least one
      } else {
        return [...prev, channel];
      }
    });
  };

  // Recipient management actions
  const removeGroupMember = (memberId: string) => {
    setActiveGroupMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const removeCustomEmail = (email: string) => {
    setCustomEmails((prev) => prev.filter((e) => e !== email));
  };

  const addCustomEmail = () => {
    if (!newEmailInput.trim()) return;

    // Support comma/space/semicolon-separated emails
    const rawTokens = newEmailInput
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validTokens = rawTokens.filter((token) => emailRegex.test(token));

    if (validTokens.length === 0) {
      setError('Please enter a valid email address (e.g. user@domain.com).');
      return;
    }

    setError(null);
    setCustomEmails((prev) => {
      const combined = [...prev];
      validTokens.forEach((token) => {
        if (!combined.includes(token) && !activeGroupMembers.some((m) => m.email.toLowerCase() === token.toLowerCase())) {
          combined.push(token);
        }
      });
      return combined;
    });
    setNewEmailInput('');
  };

  const restoreGroupDefaults = () => {
    if (currentGroup) {
      setActiveGroupMembers([...currentGroup.members]);
    }
  };

  // Combined recipient emails
  const allRecipientEmails = useMemo(() => {
    const groupEmails = activeGroupMembers.map((m) => m.email).filter(Boolean);
    const unique = Array.from(new Set([...groupEmails, ...customEmails]));
    return unique;
  }, [activeGroupMembers, customEmails]);

  // Validation checks
  const validationErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!selectedBroadcastType) errs.broadcastType = 'Broadcast Type is required.';
    if (!selectedIncidentId) errs.incidentId = 'Incident ID is required.';
    if (!selectedTemplateId) errs.templateId = 'Template is required.';
    if (!selectedGroupId && allRecipientEmails.length === 0) {
      errs.distributionGroup = 'Distribution Group or at least one recipient is required.';
    }
    if (selectedChannels.length === 0) {
      errs.channels = 'At least one delivery channel is required.';
    }
    if (!subject.trim()) errs.subject = 'Subject is required.';
    if (!content.trim()) errs.content = 'Content body is required.';
    return errs;
  }, [selectedBroadcastType, selectedIncidentId, selectedTemplateId, selectedGroupId, selectedChannels, allRecipientEmails, subject, content]);

  // Submit and send manual broadcast
  const handleCreateAndSend = async () => {
    setSubmitted(true);
    setError(null);

    const missingFields: string[] = [];
    if (!selectedBroadcastType) missingFields.push('Broadcast Type');
    if (!selectedIncidentId) missingFields.push('Incident ID');
    if (!selectedTemplateId) missingFields.push('Template');
    if (!selectedGroupId && allRecipientEmails.length === 0) missingFields.push('Distribution Group / Recipients');
    if (selectedChannels.length === 0) missingFields.push('Delivery Channel');
    if (!subject.trim()) missingFields.push('Subject');
    if (!content.trim()) missingFields.push('Content');

    if (missingFields.length > 0) {
      setError(`Please fill in all required fields: ${missingFields.join(', ')}.`);
      return;
    }

    setSubmitting(true);
    try {
      const inc = currentIncidentOpt?.incident;
      const tpl = currentTemplate;
      const grp = currentGroup;

      let canonicalType = selectedBroadcastType;
      if (selectedBroadcastType === 'END_OF_DAY') canonicalType = 'End-of-Day';

      const payload = {
        type: canonicalType,
        caseId: currentIncidentOpt?.caseId || inc?.caseId || undefined,
        incidentId: inc?.id || undefined,
        incidentTitle: inc?.title || undefined,
        incidentType: inc?.type || undefined,
        incidentSubType: inc?.subType || undefined,
        crisisLevel: inc?.crisisLevel ? crisisLevelKey(inc.crisisLevel) : undefined,
        templateUsed: tpl?.name || 'Manual Broadcast',
        templateId: tpl?.id || undefined,
        recipientGroups: grp ? [grp.name] : [],
        recipients: allRecipientEmails,
        channels: selectedChannels,
        subject: subject.trim() || undefined,
        content: content.trim(),
        contentDefault: tpl ? renderTemplate(tpl.body, buildVars(currentIncidentOpt)) : content.trim(),
        user: username,
        status: 'SENT',
        sendNow: true,
      };

      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const created = await res.json();
      if (!res.ok) {
        setError(created.error || 'Failed to create and send broadcast.');
        return;
      }

      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while creating broadcast.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div
        className="modal-box glass"
        style={{
          maxWidth: 840,
          width: '95%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 14,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--text-main)',
              margin: 0,
            }}
          >
            New Broadcast
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 22,
              cursor: 'pointer',
              color: 'var(--text-muted)',
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body (Scrollable) */}
        <div
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Top Error Alert Banner if required fields are missing */}
          {error && (
            <div
              style={{
                background: 'var(--color-critical-bg, #FEF2F2)',
                border: '1px solid var(--color-critical-border, #FCA5A5)',
                color: '#991B1B',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '10px 14px',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 15 }}>⚠</span>
              <span style={{ fontWeight: 500 }}>{error}</span>
            </div>
          )}

          {loadingData ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 10px auto' }} />
              <span>Loading incident, template, and group configurations…</span>
            </div>
          ) : (
            <>
              {/* Row 1: Broadcast Type & Incident ID Pickers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Broadcast Type Field (Required) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Broadcast Type <span style={{ color: 'var(--color-primary)' }}>*</span>
                  </label>
                  <select
                    value={selectedBroadcastType}
                    onChange={(e) => handleBroadcastTypeChange(e.target.value)}
                    className="form-control select-dark"
                    style={{
                      height: 38,
                      fontSize: 13,
                      borderColor: submitted && validationErrors.broadcastType ? 'var(--color-critical, #DC2626)' : undefined,
                    }}
                  >
                    <option value="">-- Select Broadcast Type --</option>
                    {BROADCAST_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {submitted && validationErrors.broadcastType && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {validationErrors.broadcastType}
                    </div>
                  )}
                </div>

                {/* Incident ID Field (Required) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      Incident ID <span style={{ color: 'var(--color-primary)' }}>*</span>
                    </span>
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        color: selectedBroadcastType === 'Closure' ? 'var(--color-primary)' : 'var(--text-faint)',
                      }}
                    >
                      {selectedBroadcastType === 'Closure'
                        ? `Closed without broadcast (${filteredIncidents.length})`
                        : `${filteredIncidents.length} available`}
                    </span>
                  </label>
                  <select
                    value={selectedIncidentId}
                    onChange={(e) => handleIncidentChange(e.target.value)}
                    className="form-control select-dark"
                    style={{
                      height: 38,
                      fontSize: 13,
                      borderColor: submitted && validationErrors.incidentId ? 'var(--color-critical, #DC2626)' : undefined,
                    }}
                  >
                    <option value="">
                      {selectedBroadcastType === 'Closure' && filteredIncidents.length === 0
                        ? '-- No Closed incidents without broadcast available --'
                        : '-- Select Incident --'}
                    </option>
                    {filteredIncidents.map((opt) => (
                      <option key={opt.incident.id} value={opt.incident.id}>
                        {opt.incident.id} — {opt.incident.title} (Level {opt.incident.crisisLevel || 4} · {opt.incident.status || 'Live'})
                      </option>
                    ))}
                  </select>
                  {submitted && validationErrors.incidentId && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {validationErrors.incidentId}
                    </div>
                  )}
                  {selectedBroadcastType === 'Closure' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>
                      {filteredIncidents.length === 0
                        ? '⚠ All closed incidents currently have broadcasts, or no incidents are in Closed status.'
                        : 'ℹ Showing closed incidents that have not had a closure broadcast created yet.'}
                    </div>
                  )}
                  {currentIncidentOpt && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-inset)',
                        padding: '6px 10px',
                        borderRadius: 6,
                        display: 'flex',
                        gap: 8,
                        flexWrap: 'wrap',
                        alignItems: 'center',
                      }}
                    >
                      <span>
                        <b>Case:</b> {currentIncidentOpt.caseId}
                      </span>
                      <span>•</span>
                      <span>
                        <b>Type:</b> {currentIncidentOpt.incident.type || 'N/A'}
                      </span>
                      <span>•</span>
                      <span>
                        <b>Crisis:</b> Level {currentIncidentOpt.incident.crisisLevel || 4}
                      </span>
                      <span>•</span>
                      <span>
                        <b>Status:</b> {currentIncidentOpt.incident.status || 'Live'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Template & Delivery Channel Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Template Field (Required) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>
                      Template Field <span style={{ color: 'var(--color-primary)' }}>*</span>
                    </span>
                    {selectedBroadcastType && (
                      <span style={{ fontSize: 11, color: 'var(--color-primary)', fontWeight: 600 }}>
                        Filtered by {selectedBroadcastType}
                      </span>
                    )}
                  </label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="form-control select-dark"
                    style={{
                      height: 38,
                      fontSize: 13,
                      borderColor: submitted && validationErrors.templateId ? 'var(--color-critical, #DC2626)' : undefined,
                    }}
                  >
                    <option value="">-- Select Configured Template --</option>
                    {filteredTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.category})
                      </option>
                    ))}
                  </select>
                  {submitted && validationErrors.templateId && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {validationErrors.templateId}
                    </div>
                  )}
                  {currentTemplate && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        background: 'var(--bg-inset)',
                        padding: '6px 10px',
                        borderRadius: 6,
                      }}
                    >
                      <b>Category:</b> {currentTemplate.category}
                    </div>
                  )}
                </div>

                {/* Delivery Channel Section (Required) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Delivery Channel <span style={{ color: 'var(--color-primary)' }}>*</span>
                  </label>
                  <div
                    style={{
                      height: 38,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 20,
                      padding: '0 12px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md, 8px)',
                      borderColor: submitted && validationErrors.channels ? 'var(--color-critical, #DC2626)' : undefined,
                    }}
                  >
                    {/* Email Option */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: selectedBroadcastType === 'Closure' || selectedBroadcastType === 'END_OF_DAY' ? 'default' : 'pointer',
                        color: 'var(--text-main)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes('Email')}
                        disabled={selectedBroadcastType === 'Closure' || selectedBroadcastType === 'END_OF_DAY'}
                        onChange={() => toggleChannel('Email')}
                        style={{ accentColor: 'var(--color-primary)', width: 15, height: 15 }}
                      />
                      <span>Email</span>
                    </label>

                    {/* SMS Option */}
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 7,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: selectedBroadcastType === 'Closure' || selectedBroadcastType === 'END_OF_DAY' ? 'not-allowed' : 'pointer',
                        color: selectedBroadcastType === 'Closure' || selectedBroadcastType === 'END_OF_DAY' ? 'var(--text-faint)' : 'var(--text-main)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes('SMS')}
                        disabled={selectedBroadcastType === 'Closure' || selectedBroadcastType === 'END_OF_DAY'}
                        onChange={() => toggleChannel('SMS')}
                        style={{ accentColor: 'var(--color-primary)', width: 15, height: 15 }}
                      />
                      <span>SMS</span>
                    </label>
                  </div>
                  {submitted && validationErrors.channels && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {validationErrors.channels}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: Distribution Group Selector & Recipient List */}
              <div
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: 14,
                  background: 'var(--bg-card)',
                  borderColor: submitted && validationErrors.distributionGroup ? 'var(--color-critical, #DC2626)' : undefined,
                }}
              >
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Distribution Group Field <span style={{ color: 'var(--color-primary)' }}>*</span>
                  </label>
                  <select
                    value={selectedGroupId}
                    onChange={(e) => handleGroupChange(e.target.value)}
                    className="form-control select-dark"
                    style={{ height: 38, fontSize: 13 }}
                  >
                    <option value="">-- Select Distribution Group --</option>
                    {distributionGroups.map((grp) => (
                      <option key={grp.id} value={grp.id}>
                        {grp.name} ({grp.members.length} members)
                      </option>
                    ))}
                  </select>
                  {submitted && validationErrors.distributionGroup && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {validationErrors.distributionGroup}
                    </div>
                  )}
                  {currentGroup && (
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                      {currentGroup.description}
                    </div>
                  )}
                </div>

                {/* Group Members List & Custom Email Management */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
                      Recipients ({allRecipientEmails.length})
                    </span>
                    {currentGroup &&
                      activeGroupMembers.length < currentGroup.members.length && (
                        <button
                          type="button"
                          onClick={restoreGroupDefaults}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-primary)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: 0,
                            textDecoration: 'underline',
                          }}
                        >
                          ↺ Restore group members ({currentGroup.members.length})
                        </button>
                      )}
                  </div>

                  {/* Members Chips */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      minHeight: 38,
                      maxHeight: 120,
                      overflowY: 'auto',
                      padding: 8,
                      background: 'var(--bg-inset)',
                      borderRadius: 6,
                      border: '1px solid var(--border-color)',
                      marginBottom: 10,
                    }}
                  >
                    {allRecipientEmails.length === 0 ? (
                      <span style={{ color: 'var(--text-faint)', fontSize: 12, fontStyle: 'italic' }}>
                        No recipients selected yet. Choose a distribution group above or add custom emails below.
                      </span>
                    ) : (
                      <>
                        {/* Group members */}
                        {activeGroupMembers.map((member) => (
                          <span
                            key={member.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: '#fff',
                              border: '1px solid var(--border-color)',
                              borderRadius: 16,
                              padding: '3px 10px',
                              fontSize: 12,
                              fontWeight: 500,
                              color: 'var(--text-main)',
                            }}
                          >
                            <span>
                              <b>{member.name}</b> ({member.email})
                            </span>
                            <span
                              style={{
                                fontSize: 10,
                                padding: '1px 5px',
                                borderRadius: 8,
                                background: member.type === 'Internal' ? 'var(--color-primary-bg, #FFF7ED)' : '#F3F4F6',
                                color: member.type === 'Internal' ? 'var(--color-primary-dark, #C2410C)' : '#4B5563',
                              }}
                            >
                              {member.type}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeGroupMember(member.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                                fontWeight: 700,
                                fontSize: 13,
                                padding: '0 2px',
                                lineHeight: 1,
                              }}
                              title={`Remove ${member.name}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}

                        {/* Custom added emails */}
                        {customEmails.map((email) => (
                          <span
                            key={email}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              background: 'var(--color-primary-bg, #FFF7ED)',
                              border: '1px solid var(--color-primary-border, #FED7AA)',
                              color: 'var(--color-primary-dark, #C2410C)',
                              borderRadius: 16,
                              padding: '3px 10px',
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            <span>{email}</span>
                            <span
                              style={{
                                fontSize: 9.5,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                background: 'rgba(255,130,0,0.15)',
                                padding: '1px 5px',
                                borderRadius: 8,
                              }}
                            >
                              Manual
                            </span>
                            <button
                              type="button"
                              onClick={() => removeCustomEmail(email)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--color-primary-dark)',
                                fontWeight: 700,
                                fontSize: 13,
                                padding: '0 2px',
                                lineHeight: 1,
                              }}
                              title={`Remove ${email}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Add separate email input */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      value={newEmailInput}
                      onChange={(e) => setNewEmailInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addCustomEmail();
                        }
                      }}
                      placeholder="Add recipient email (e.g. officer@sdc.gov.sg or comma-separated)"
                      className="form-control"
                      style={{ height: 34, fontSize: 12.5, flexGrow: 1 }}
                    />
                    <button
                      type="button"
                      onClick={addCustomEmail}
                      className="btn btn-secondary"
                      style={{ height: 34, padding: '0 14px', fontSize: 12.5, whiteSpace: 'nowrap' }}
                    >
                      + Add Recipient
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 4: Subject and Content (Preview & Edit Tabs) */}
              <div
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: 14,
                  background: 'var(--bg-card)',
                }}
              >
                {/* Subject field (Required) */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      fontSize: 11.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      letterSpacing: '0.04em',
                      marginBottom: 6,
                      display: 'block',
                    }}
                  >
                    Email Subject <span style={{ color: 'var(--color-primary)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Broadcast Subject Line"
                    className="form-control"
                    style={{
                      height: 36,
                      fontSize: 13,
                      fontWeight: 600,
                      borderColor: submitted && validationErrors.subject ? 'var(--color-critical, #DC2626)' : undefined,
                    }}
                  />
                  {submitted && validationErrors.subject && (
                    <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                      {validationErrors.subject}
                    </div>
                  )}
                </div>

                {/* Tab selector between Preview & Edit */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border-color)',
                    marginBottom: 12,
                    paddingBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => setContentTab('preview')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom:
                          contentTab === 'preview'
                            ? '2px solid var(--color-primary)'
                            : '2px solid transparent',
                        color:
                          contentTab === 'preview'
                            ? 'var(--color-primary)'
                            : 'var(--text-muted)',
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: contentTab === 'preview' ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      ✉ Content Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTab('edit')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom:
                          contentTab === 'edit'
                            ? '2px solid var(--color-primary)'
                            : '2px solid transparent',
                        color:
                          contentTab === 'edit'
                            ? 'var(--color-primary)'
                            : 'var(--text-muted)',
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: contentTab === 'edit' ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      ✎ Edit Content
                    </button>
                  </div>

                  {currentTemplate && (
                    <button
                      type="button"
                      onClick={() => applyTemplateToContent(currentTemplate, currentIncidentOpt)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: 11.5,
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                      }}
                    >
                      ↺ Reset to Template Default
                    </button>
                  )}
                </div>

                {/* Preview Mode */}
                {contentTab === 'preview' && (
                  <div
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      borderColor: submitted && validationErrors.content ? 'var(--color-critical, #DC2626)' : undefined,
                    }}
                  >
                    <div
                      style={{
                        background: 'var(--bg-inset)',
                        padding: '10px 14px',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: 12.5,
                      }}
                    >
                      <div style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 2 }}>
                        <b>SUBJECT:</b> {subject || <span style={{ color: 'var(--text-faint)' }}>(No Subject)</span>}
                      </div>
                      <div style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                        <b>TO ({selectedChannels.join(', ')}):</b> {allRecipientEmails.length ? allRecipientEmails.join(', ') : '(No recipients)'}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '16px',
                        fontSize: 13,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-main)',
                        minHeight: 160,
                        maxHeight: 280,
                        overflowY: 'auto',
                      }}
                    >
                      {content || (
                        <span style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>
                          Select a broadcast type and template above to generate broadcast content preview.
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Edit Mode */}
                {contentTab === 'edit' && (
                  <div>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={9}
                      placeholder="Type broadcast message content here..."
                      className="form-control"
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: 12.5,
                        lineHeight: 1.5,
                        width: '100%',
                        borderColor: submitted && validationErrors.content ? 'var(--color-critical, #DC2626)' : undefined,
                      }}
                    />
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--text-muted)',
                        marginTop: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>Variables from incident are already substituted into text.</span>
                      <span>{content.length} characters</span>
                    </div>
                  </div>
                )}
                {submitted && validationErrors.content && (
                  <div style={{ color: '#DC2626', fontSize: 11, marginTop: 4, fontWeight: 500 }}>
                    {validationErrors.content}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--bg-card)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="btn btn-secondary"
            style={{ minWidth: 90 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreateAndSend}
            disabled={submitting || loadingData}
            className="btn btn-primary"
            style={{
              minWidth: 170,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {submitting ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                <span>Sending…</span>
              </>
            ) : (
              <span>Create &amp; Sent Broadcast</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
