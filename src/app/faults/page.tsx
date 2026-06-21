'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Fault } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getFaultTaxonomy } from '@/lib/taxonomy';
import LocationSelector from '@/components/LocationSelector';

interface FaultStats {
  total: number;
  created: number;
  pendingSubmission: number;
  closed: number;
}

function faultStatusBadge(status: string) {
  switch (status) {
    case 'Closed':           return 'badge badge-closed';
    case 'Pending Submission': return 'badge badge-ack';
    case 'Created':          return 'badge badge-live';
    default:                 return 'badge badge-closed';
  }
}

export default function FaultsPage() {
  const { role, username } = useRole();

  const [faults, setFaults] = useState<Fault[]>([]);
  const [stats, setStats] = useState<FaultStats>({ total: 0, created: 0, pendingSubmission: 0, closed: 0 });
  const [loading, setLoading] = useState(true);
  const [faultTaxonomy, setFaultTaxonomy] = useState<Record<string, string[]>>({});

  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Create Fault Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formFaultType, setFormFaultType] = useState('');
  const [formFaultSubType, setFormFaultSubType] = useState('');
  // Location hierarchy fields (mirrors incident location)
  const [locRoad, setLocRoad] = useState('');
  const [locBuilding, setLocBuilding] = useState('');
  const [locLevelSpace, setLocLevelSpace] = useState('');
  const [locCommonName, setLocCommonName] = useState('');
  const [locNearAt, setLocNearAt] = useState('');
  const [locPostalCode, setLocPostalCode] = useState('098001');
  const [locTagsStr, setLocTagsStr] = useState('');
  const [locLat, setLocLat] = useState(1.2500);
  const [locLng, setLocLng] = useState(103.8300);
  const [locManualPin, setLocManualPin] = useState(false);
  // Attachments
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ faultId?: string } | null>(null);
  const [submittingFaultId, setSubmittingFaultId] = useState<string | null>(null);

  // CMMS status lookup
  const [cmmsStatusMap, setCmmsStatusMap] = useState<Record<string, string>>({});

  useEffect(() => {
    setFaultTaxonomy(getFaultTaxonomy());
  }, []);

  const fetchFaults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('faultType', filterType);
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/faults?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFaults(data.faults || []);
        setStats(data.stats || { total: 0, created: 0, pendingSubmission: 0, closed: 0 });
      }
    } catch (err) {
      console.error('Error fetching faults:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchFaults();
  }, [fetchFaults]);

  // Reset sub-type when type changes
  useEffect(() => {
    setFormFaultSubType('');
  }, [formFaultType]);

  const handleCreateFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFaultType || !formFaultSubType || !formDescription.trim() || submitting) return;
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch('/api/faults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          faultType: formFaultType,
          faultSubType: formFaultSubType,
          location: {
            road: locRoad,
            building: locBuilding,
            levelSpace: locLevelSpace,
            nearAt: locNearAt,
            commonName: locCommonName || locBuilding || locRoad || 'Sentosa Island',
            postalCode: locPostalCode || '098001',
            tags: locTagsStr.split(',').map(t => t.trim()).filter(Boolean),
            lat: locLat,
            lng: locLng,
          },
          description: formDescription,
          attachments: attachments.map(f => f.name),
          username,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSubmitResult({ faultId: data.fault?.id });
        setTimeout(() => {
          setShowCreateModal(false);
          setSubmitResult(null);
          resetForm();
          fetchFaults();
        }, 2500);
      } else {
        const err = await res.json();
        alert(`Failed to save fault: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to create fault:', err);
    } finally {
      setSubmitting(false);
    }
  };

  function resetForm() {
    setFormFaultType('');
    setFormFaultSubType('');
    setLocRoad('');
    setLocBuilding('');
    setLocLevelSpace('');
    setLocCommonName('');
    setLocNearAt('');
    setLocPostalCode('098001');
    setLocTagsStr('');
    setLocLat(1.2500);
    setLocLng(103.8300);
    setLocManualPin(false);
    setAttachments([]);
    setFormDescription('');
  }

  async function fetchCmmsStatus(ticketId: string) {
    if (cmmsStatusMap[ticketId] || !ticketId) return;
    try {
      const res = await fetch(`/api/cmms-mock?ticketId=${encodeURIComponent(ticketId)}`);
      if (res.ok) {
        const data = await res.json();
        setCmmsStatusMap(prev => ({ ...prev, [ticketId]: data.status }));
      }
    } catch (_) { /* silent */ }
  }

  async function handleSubmitFault(faultId: string) {
    if (submittingFaultId) return;
    setSubmittingFaultId(faultId);
    try {
      const encodedId = faultId.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(`/api/faults/${encodedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', username }),
      });
      if (res.ok) {
        await fetchFaults();
      } else {
        const err = await res.json();
        alert(`Failed to submit fault: ${err.error}`);
      }
    } catch (err) {
      console.error('Failed to submit fault:', err);
    } finally {
      setSubmittingFaultId(null);
    }
  }

  const filteredFaults = faults.filter(f => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      f.id.toLowerCase().includes(term) ||
      f.caseId.toLowerCase().includes(term) ||
      f.faultType.toLowerCase().includes(term) ||
      f.faultSubType.toLowerCase().includes(term) ||
      f.description.toLowerCase().includes(term) ||
      (f.cmmsTicketId || '').toLowerCase().includes(term) ||
      f.location.commonName.toLowerCase().includes(term)
    );
  });

  const isController = ['Controller', 'Duty Manager', 'Duty Officer', 'System Administrator'].includes(role);

  return (
    <>
      {/* Header */}
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>FAULT REPORTING LOG</h1>
          <p>Infrastructure defects submitted to IFM CMMS &bull; CMS captures entry point and stores Fault ID reference</p>
        </div>
        {isController && (
          <button className="btn btn-primary" onClick={() => { setShowCreateModal(true); setSubmitResult(null); }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            LOG NEW FAULT
          </button>
        )}
      </div>

      {/* Stats strip */}
      <div className="glass" style={{ display: 'flex', gap: 24, padding: '10px 20px', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total: <strong style={{ color: 'var(--text-main)' }}>{stats.total}</strong></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Created: <strong style={{ color: 'var(--color-critical)' }}>{stats.created}</strong></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pending Submission: <strong style={{ color: 'var(--color-high)' }}>{stats.pendingSubmission}</strong></div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Closed (CMMS received): <strong style={{ color: 'var(--color-active)' }}>{stats.closed}</strong></div>
      </div>

      {/* Filter panel */}
      <div className="filter-panel glass">
        <div className="search-group" style={{ flex: 2 }}>
          <input
            type="text"
            placeholder="Search by Fault ID, Case ID, Type, CMMS Ticket, Location..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="form-control select-dark" style={{ flex: 1 }}>
          <option value="">All Types</option>
          {Object.keys(faultTaxonomy).sort().map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-control select-dark" style={{ flex: 1 }}>
          <option value="">All Statuses</option>
          <option value="Created">Created</option>
          <option value="Pending Submission">Pending Submission</option>
          <op