'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Occurrence } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// Roles allowed to access e-Diary per FRD §8.3
const ALLOWED_ROLES = ['Controller', 'Duty Officer', 'Duty Manager', 'System Administrator'];

// Predefined occurrence topics
const TOPICS = [
  'VIP Visit Advisory',
  'Dignitary Visit Notification',
  'Routine Siren Testing',
  'Ranger Shift Handover',
  'General Public Interaction',
  'Coordinated Drill / Exercise',
  'Information Dissemination',
  'Lost and Found Report',
  'Contractor Access Granted',
  'Others',
];

export default function OccurrencesPage() {
  const { role, username } = useRole();
  const router = useRouter();

  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm]   = useState('');
  const [userFilter, setUserFilter]   = useState('All');
  const [dateStart, setDateStart]     = useState('');
  const [dateEnd, setDateEnd]         = useState('');

  // Create entry states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [topic, setTopic]       = useState('');
  const [customTopic, setCustomTopic] = useState('');
  const [content, setContent]   = useState('');
  const [dateTime, setDateTime] = useState('');
  const [caseIdInput, setCaseIdInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit / amend entry states
  const [editingEntry, setEditingEntry] = useState<Occurrence | null>(null);
  const [editContent, setEditContent]   = useState('');
  const [saving, setSaving] = useState(false);

  // View amendment history
  const [viewingAmendments, setViewingAmendments] = useState<Occurrence | null>(null);

  // Escalate to Incident
  const [escalatingEntry, setEscalatingEntry] = useState<Occurrence | null>(null);

  const canEdit = ALLOWED_ROLES.includes(role);

  const fetchOccurrences = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (dateStart) params.set('dateStart', dateStart);
      if (dateEnd)   params.set('dateEnd', dateEnd);
      if (userFilter !== 'All') params.set('user', userFilter);
      const res = await fetch(`/api/occurrences${params.size ? '?' + params.toString() : ''}`);
      if (res.ok) setOccurrences(await res.json());
    } catch (err) {
      console.error('Error fetching occurrences:', err);
    } finally {
      setLoading(false);
    }
  }, [dateStart, dateEnd, userFilter]);

  useEffect(() => { fetchOccurrences(); }, [fetchOccurrences]);

  // Guard: roles without access see nothing
  if (!ALLOWED_ROLES.includes(role)) {
    return (
      <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '13px' }}>The e-Diary module is accessible to Controllers, Duty Officers, Duty Managers, and System Administrators only.</div>
      </div>
    );
  }

  const uniqueUsers = Array.from(new Set(occurrences.map(o => o.user)));

  const filtered = occurrences.filter(o => {
    const q = searchTerm.toLowerCase();
    return o.topic.toLowerCase().includes(q) || o.content.toLowerCase().includes(q);
  });

  // ── Create ──────────────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTopic = topic === 'Others' ? customTopic.trim() : topic;
    if (!finalTopic || !content.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/occurrences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          topic: finalTopic,
          content: content.trim(),
          dateTime: dateTime ? new Date(dateTime).toISOString() : undefined,
          caseId: caseIdInput.trim() || undefined,
        }),
      });
      if (res.ok) {
        setShowCreateForm(false);
        setTopic(''); setCustomTopic(''); setContent(''); setDateTime(''); setCaseIdInput('');
        await fetchOccurrences();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Amend ────────────────────────────────────────────────────────────────────
  const handleAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEntry || !editContent.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/occurrences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingEntry.id, newContent: editContent, username }),
      });
      if (res.ok) {
        setEditingEntry(null);
        setEditContent('');
        await fetchOccurrences();
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Escalate to Incident ─────────────────────────────────────────────────────
  const handleEscalate = () => {
    if (!escalatingEntry) return;
    // Navigate to new incident page pre-filled via query params
    const params = new URLSearchParams({
      caseId: escalatingEntry.caseId || '',
      fromEDiary: escalatingEntry.id,
      summary: `Escalated from e-Diary entry ${escalatingEntry.id}: ${escalatingEntry.topic}`,
    });
    router.push(`/incidents/new?${params.toString()}`);
  };

  return (
    <>
      {/* Header */}
      <div className="occ-header-bar glass">
        <div className="title-section">
          <h1>E-DIARY</h1>
          <p>Electronic occurrence logbook · Entries are mutable and amendments are tracked</p>
        </div>
        {canEdit && (
          <button className="btn btn-primary" onClick={() => setShowCreateForm(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            NEW ENTRY
          </button>
        )}
      </div>

      <div className="occ-body-layout">
        {/* Left: Filters */}
        <div className="occ-filters-pane glass">
          <h3>FILTERS</h3>

          <div className="form-group">
            <label>Search</label>
            <input type="text" placeholder="Topic or content…" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)} className="form-control" />
          </div>

          <div className="form-group">
            <label>Date From</label>
            <input type="date" value={dateStart} max={dateEnd || undefined}
              onChange={e => setDateStart(e.target.value)} className="form-control" />
          </div>

          <div className="form-group">
            <label>Date To</label>
            <input type="date" value={dateEnd} min={dateStart || undefined}
              onChange={e => setDateEnd(e.target.value)} className="form-control" />
          </div>

          <div className="form-group">
            <label>Logged By</label>
            <select value={userFilter} onChange={e => setUserFilter(e.target.value)}
              className="form-control select-dark">
              <option value="All">All Operators</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {(dateStart || dateEnd || userFilter !== 'All') && (
            <button className="btn btn-secondary" style={{ width: '100%', marginTop: 4 }}
              onClick={() => { setDateStart(''); setDateEnd(''); setUserFilter('All'); }}>
              Clear Filters
            </button>
          )}

          <div className="filter-stats glass" style={{ marginTop: 16 }}>
            <div className="stat-row"><span className="lbl">Total entries:</span><span className="val">{occurrences.length}</span></div>
            <div className="stat-row" style={{ marginTop: 8 }}><span className="lbl">Showing:</span><span className="val text-primary">{filtered.length}</span></div>
          </div>

          <div style={{ marginTop: 16, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-sub)' }}>FRD §8.2 —</strong> Entries may be amended after submission. All amendments are tracked and timestamped. Deletion requires System Administrator access.
          </div>
        </div>

        {/* Right: Entries */}
        <div className="occ-list-pane">
          {loading ? (
            <div className="occ-loading glass">Loading diary entries…</div>
          ) : filtered.length === 0 ? (
            <div className="occ-empty glass">No entries found matc