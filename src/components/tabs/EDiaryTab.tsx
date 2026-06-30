'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Occurrence } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

// Roles allowed to access e-Diary per FRD §8.3
const ALLOWED_ROLES = ['Controller', 'Duty Officer', 'Duty Manager', 'System Administrator', 'Current Ops Administrator'];

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

// TEMPORARY: Show "Upcoming" placeholder — remove this block when ready to demo
const SHOW_UPCOMING = true;

function UpcomingPlaceholder({ title }: { title: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px', color: 'var(--text-muted)' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-faint)' }}>
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>{title}</p>
        <p style={{ fontSize: '12px', color: 'var(--text-faint)' }}>This module is currently under review and will be available soon.</p>
      </div>
      <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', padding: '4px 12px', borderRadius: '99px', border: '1px solid var(--border-color)', color: 'var(--text-faint)', background: 'var(--bg-inset)' }}>Upcoming</span>
    </div>
  );
}

export function EDiaryTab() {
  const { role, username } = useRole();
  const router = useRouter();

  if (SHOW_UPCOMING) return <UpcomingPlaceholder title="e-Diary" />;

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
        <div style={{ fontSize: '13px' }}>The e-Diary module is accessible to Controllers, Duty Officers, Duty Managers, Current Ops Administrators, and System Administrators only.</div>
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

          {canEdit && (
            <button className="btn btn-primary" onClick={() => setShowCreateForm(true)} style={{ width: '100%', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 600 }}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 13, height: 13 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              NEW ENTRY
            </button>
          )}

          <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-sub)' }}>FRD §8.2 —</strong> Entries may be amended after submission. All amendments are tracked and timestamped. Deletion requires System Administrator access.
          </div>
        </div>

        {/* Right: Entries */}
        <div className="occ-list-pane">
          {loading ? (
            <div className="occ-loading glass">Loading diary entries…</div>
          ) : filtered.length === 0 ? (
            <div className="occ-empty glass">No entries found matching your filters.</div>
          ) : (
            <div className="occ-entries-timeline">
              {filtered.map(o => (
                <div className="occ-card glass" key={o.id}>
                  {/* Header row */}
                  <div className="occ-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span className="occ-id">{o.id}</span>
                      {o.caseId && (
                        <Link href={`/cases/${o.caseId}`} style={{ textDecoration: 'none' }}>
                          <span className="badge badge-ack" style={{ fontSize: 10, padding: '1px 6px', cursor: 'pointer' }}>
                            Case: {o.caseId}
                          </span>
                        </Link>
                      )}
                      {o.amendments && o.amendments.length > 0 && (
                        <span
                          className="badge"
                          style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)', cursor: 'pointer' }}
                          onClick={() => setViewingAmendments(o)}
                          title="View amendment history"
                        >
                          ✏ {o.amendments.length} amendment{o.amendments.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <span className="occ-time">
                      {new Date(o.dateTime).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {' · '}
                      {new Date(o.dateTime).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </span>
                  </div>

                  <h2 className="occ-topic">{o.topic}</h2>
                  <p className="occ-content">{o.content}</p>

                  <div className="occ-card-footer">
                    <span>Logged by: <strong>{o.user}</strong></span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {canEdit && (
                        <>
                          {/* Edit / Amend */}
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: 11, padding: '3px 10px' }}
                            onClick={() => { setEditingEntry(o); setEditContent(o.content); }}
                          >
                            ✏ Amend
                          </button>
                          {/* Escalate to Incident */}
                          <button
                            className="btn"
                            style={{ fontSize: 11, padding: '3px 10px', background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
                            onClick={() => setEscalatingEntry(o)}
                          >
                            🔺 Escalate to Incident
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────────── */}
      {showCreateForm && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>NEW E-DIARY ENTRY</h2>
              <button className="close-btn" onClick={() => setShowCreateForm(false)}>✕</button>
            </div>
            <form onSubmit={handleCreate} className="modal-form">
              <div className="modal-scroll-area">

                <div className="form-group">
                  <label>Topic / Subject *</label>
                  <select value={topic} onChange={e => setTopic(e.target.value)} required className="form-control select-dark">
                    <option value="">— Select topic —</option>
                    {TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {topic === 'Others' && (
                  <div className="form-group">
                    <label>Custom Topic *</label>
                    <input type="text" placeholder="e.g. Unusual weather advisory"
                      value={customTopic} onChange={e => setCustomTopic(e.target.value)}
                      required className="form-control" />
                  </div>
                )}

                <div className="form-group">
                  <label>Date &amp; Time of Occurrence</label>
                  <input type="datetime-local" value={dateTime}
                    onChange={e => setDateTime(e.target.value)} className="form-control" />
                  <p className="sub-desc">Defaults to now. Backdating is permitted.</p>
                </div>

                <div className="form-group">
                  <label>Link to Existing Case ID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <input type="text" placeholder="e.g. SEN/CI/20260621/001 — leave blank to auto-create"
                    value={caseIdInput} onChange={e => setCaseIdInput(e.target.value)} className="form-control" />
                  <p className="sub-desc">If left blank, a Case will be auto-created and linked to this entry.</p>
                </div>

                <div className="form-group">
                  <label>Narrative *</label>
                  <textarea placeholder="Describe the occurrence, interaction, or advisory…"
                    value={content} onChange={e => setContent(e.target.value)}
                    required className="form-control" rows={5} />
                </div>

              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Submitting…' : 'SUBMIT ENTRY'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Amend Modal ────────────────────────────────────────────────────────── */}
      {editingEntry && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>AMEND ENTRY · {editingEntry.id}</h2>
              <button className="close-btn" onClick={() => { setEditingEntry(null); setEditContent(''); }}>✕</button>
            </div>
            <form onSubmit={handleAmend} className="modal-form">
              <div className="modal-scroll-area">
                <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, fontSize: 12, color: '#F59E0B', marginBottom: 16 }}>
                  ⚠ The original text will be preserved in the amendment history. All amendments are timestamped and attributed.
                </div>
                <div className="form-group">
                  <label>Original Text</label>
                  <div style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    {editingEntry.content}
                  </div>
                </div>
                <div className="form-group">
                  <label>Amended Text *</label>
                  <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                    required className="form-control" rows={5} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setEditingEntry(null); setEditContent(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'SAVE AMENDMENT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Amendment History Modal ─────────────────────────────────────────────── */}
      {viewingAmendments && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>AMENDMENT HISTORY · {viewingAmendments.id}</h2>
              <button className="close-btn" onClick={() => setViewingAmendments(null)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="modal-scroll-area">
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  {viewingAmendments.amendments?.length || 0} amendment(s) recorded. Showing original text before each amendment.
                </p>
                {(viewingAmendments.amendments || []).map((am, idx) => (
                  <div key={idx} style={{ marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Amendment #{idx + 1} · {new Date(am.timestamp).toLocaleString('en-SG')} · by <strong>{am.amendedBy}</strong>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-sub)', fontStyle: 'italic' }}>
                      Original: "{am.originalText}"
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Current text:</div>
                  <div style={{ fontSize: 13, color: 'var(--text-main)' }}>{viewingAmendments.content}</div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => setViewingAmendments(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Escalate Confirm Modal ──────────────────────────────────────────────── */}
      {escalatingEntry && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>ESCALATE TO INCIDENT</h2>
              <button className="close-btn" onClick={() => setEscalatingEntry(null)}>✕</button>
            </div>
            <div className="modal-form">
              <div className="modal-scroll-area">
                <p style={{ fontSize: 13, color: 'var(--text-sub)', lineHeight: 1.7 }}>
                  You are about to create a new <strong>Incident</strong> within the same Case as this e-Diary entry.
                </p>
                <div style={{ margin: '12px 0', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>e-Diary Entry</div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{escalatingEntry.id} · {escalatingEntry.topic}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Case: {escalatingEntry.caseId || 'auto-assign'}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  The e-Diary entry will be <strong>retained</strong> as a journal record. The new Incident will be linked to the same Case.
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn btn-primary" onClick={handleEscalate} style={{ background: '#EF4444', borderColor: '#EF4444' }}>
                  🔺 CREATE INCIDENT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
