'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';

// FSD §10.9 — Broadcast Record list / history + detail. Reads /api/broadcasts.
interface BroadcastRecord {
  id: string;
  caseId: string;
  incidentId: string;
  type: string;
  recipients: string[];
  templateUsed: string;
  contentDispatched: string;
  sentAt: string | null;
  sentBy: string;
  status: string;
  deliveryAttempts: number;
  deliveryCounts?: { sent: number; delivered: number; failed: number; pending: number };
  acknowledgedCount?: number;
  dispatchedBy?: string;
  dispatchedAt?: string;
  channels?: string[];
  sensitiveFields?: string[];
  sensitiveFieldsIncluded?: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'badge-pending-ctrl',
  SENT: 'badge-onsite',
  FAILED: 'badge-live',
  REJECTED: 'badge-closed',
};

export default function BroadcastsPage() {
  const { role, username } = useRole();
  const canView = hasBroadcastPermission(role, 'broadcast.view');
  const canCompose = hasBroadcastPermission(role, 'broadcast.compose');
  const canDispatch = hasBroadcastPermission(role, 'broadcast.dispatch');

  const [broadcasts, setBroadcasts] = useState<BroadcastRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BroadcastRecord | null>(null);
  const [filter, setFilter] = useState<'All' | 'PENDING' | 'SENT'>('All');
  const [busy, setBusy] = useState(false);

  // Detail panel editable recipients (for dispatching a PENDING record).
  const [drawerRecipients, setDrawerRecipients] = useState('');
  const [drawerContent, setDrawerContent] = useState('');
  const [drawerIncludeSensitive, setDrawerIncludeSensitive] = useState(false);

  // New (manual) broadcast modal — FSD §10.1(d).
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ caseId: '', incidentId: '', type: 'Manual', recipients: '', content: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/broadcasts');
      const data = await res.json();
      setBroadcasts(Array.isArray(data) ? data : []);
    } catch {
      setBroadcasts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canView) load(); }, [canView]);

  const openDetail = (b: BroadcastRecord) => {
    setSelected(b);
    setDrawerRecipients((b.recipients || []).join(', '));
    setDrawerContent(b.contentDispatched || '');
    setDrawerIncludeSensitive(false);
  };

  const shown = broadcasts.filter((b) => (filter === 'All' ? true : b.status === filter));

  const exportCsv = () => {
    const header = ['Broadcast ID', 'Case ID', 'Incident ID', 'Type', 'Status', 'Recipients', 'Template', 'Dispatched By', 'Dispatched At'];
    const rows = shown.map((b) => [
      b.id, b.caseId, b.incidentId, b.type, b.status,
      String(b.recipients?.length ?? 0), b.templateUsed,
      b.dispatchedBy || b.sentBy || '', b.dispatchedAt || b.sentAt || '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `broadcasts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const dispatchSelected = async (action: 'dispatch' | 'reject') => {
    if (!selected) return;
    const recipients = drawerRecipients.split(',').map((s) => s.trim()).filter(Boolean);
    if (action === 'dispatch' && recipients.length === 0) { alert('Recipient list cannot be empty.'); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/broadcasts/${selected.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, recipients, role, user: username,
          content: drawerContent,
          includeSensitive: drawerIncludeSensitive,
          confirmSensitive: drawerIncludeSensitive,
        }),
      });
      if (!res.ok) { const e = await res.json(); alert(`Failed: ${e.error}`); return; }
      setSelected(null);
      await load();
    } finally { setBusy(false); }
  };

  const createManual = async () => {
    if (!newForm.caseId.trim()) { alert('Case ID is required.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/broadcasts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: newForm.caseId.trim(),
          incidentId: newForm.incidentId.trim(),
          type: newForm.type,
          recipients: newForm.recipients.split(',').map((s) => s.trim()).filter(Boolean),
          content: newForm.content,
          user: username,
        }),
      });
      if (!res.ok) { const e = await res.json(); alert(`Failed: ${e.error}`); return; }
      setShowNew(false);
      setNewForm({ caseId: '', incidentId: '', type: 'Manual', recipients: '', content: '' });
      await load();
    } finally { setBusy(false); }
  };

  if (!canView) {
    return (
      <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px', color: 'var(--text-main)' }}>Access Restricted</div>
        <div style={{ fontSize: '13px' }}>Your role ({role}) does not have access to the Broadcasts module.</div>
      </div>
    );
  }

  const totalCount = broadcasts.length;
  const pendingCount = broadcasts.filter((b) => b.status === 'PENDING').length;
  const sentCount = broadcasts.filter((b) => b.status === 'SENT').length;

  return (
    <>
      <style jsx global>{`
        .metric-card.total-broadcasts::before { background: var(--color-info); }
        .metric-card.pending-broadcasts::before { background: var(--color-high); }
        .metric-card.sent-broadcasts::before { background: var(--color-active); }
      `}</style>

      {/* Page Header */}
      <div className="page-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="title-section">
          <h1 style={{ fontSize: '15px', textTransform: 'uppercase' }}>Broadcasts</h1>
          <p>Dispatched broadcast records and pending queue (FSD §10.9)</p>
        </div>
        {canCompose && (
          <button type="button" onClick={() => setShowNew(true)} className="btn btn-primary" style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', fontWeight: 600 }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '13px', height: '13px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Broadcast
          </button>
        )}
      </div>

      {/* Metrics */}
      <div className="metrics-grid">
        <div className="metric-card glass total-broadcasts">
          <div className="metric-info">
            <h3>Total Broadcasts</h3>
            <div className="metric-value text-info">{totalCount}</div>
          </div>
          <div className="metric-icon">📡</div>
        </div>
        <div className="metric-card glass pending-broadcasts">
          <div className="metric-info">
            <h3>Pending Dispatch</h3>
            <div className="metric-value text-warning">{pendingCount}</div>
          </div>
          <div className="metric-icon">⏳</div>
        </div>
        <div className="metric-card glass sent-broadcasts">
          <div className="metric-info">
            <h3>Sent</h3>
            <div className="metric-value text-success">{sentCount}</div>
          </div>
          <div className="metric-icon">✅</div>
        </div>
      </div>

      {/* Filter tabs + actions */}
      <div className="glass" style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['All', 'PENDING', 'SENT'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`tab-btn ${filter === f ? 'active' : ''}`}>
              {f === 'All' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={exportCsv} className="btn btn-secondary btn-sm">Export CSV</button>
          <button type="button" onClick={load} className="btn btn-secondary btn-sm">Reload</button>
        </div>
      </div>

      {/* Table + detail panel */}
      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1.3fr 1fr' : '1fr', gap: '20px', alignItems: 'start', transition: 'all 0.2s' }}>
        <div className="cases-list-container glass" style={{ padding: '20px' }}>
          {loading ? (
            <div className="cases-loading">Loading broadcast records…</div>
          ) : shown.length === 0 ? (
            <div className="empty-cases">
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📡</div>
              No broadcast records yet. Closure broadcasts appear here once an incident requiring a broadcast is closed.
            </div>
          ) : (
            <div className="table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Broadcast ID</th>
                    <th>Type</th>
                    <th>Incident</th>
                    <th>Recipients</th>
                    <th>Status</th>
                    <th>Dispatched</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((b) => {
                    const isSelected = selected?.id === b.id;
                    return (
                      <tr key={b.id} onClick={() => openDetail(b)} style={{ background: isSelected ? 'var(--color-primary-bg)' : undefined }}>
                        <td><span className="mono-id">{b.id}</span></td>
                        <td><span className="badge">{b.type}</span></td>
                        <td style={{ color: 'var(--text-muted)' }}>{b.incidentId || '—'}</td>
                        <td>{b.recipients?.length ?? 0}</td>
                        <td><span className={`badge ${STATUS_BADGE[b.status] || 'badge-closed'}`}>{b.status}</span></td>
                        <td className="date-cell">{(b.dispatchedAt || b.sentAt || '').replace('T', ' ').slice(0, 16) || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && (
          <div className="glass" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Broadcast Record</span>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '17px', color: 'var(--text-main)', marginTop: '2px' }}>{selected.id}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="close-btn" style={{ fontSize: '20px' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <DetailField label="Type" value={selected.type} />
              <DetailField label="Status" value={<span className={`badge ${STATUS_BADGE[selected.status] || 'badge-closed'}`}>{selected.status}</span>} />
              <DetailField label="Case" value={<Link href={`/incidents/${selected.incidentId}`} className="link">{selected.caseId}</Link>} />
              <DetailField label="Template" value={selected.templateUsed} />
              <DetailField label="Dispatched By" value={selected.dispatchedBy || selected.sentBy || '—'} />
              <DetailField label="Dispatched At" value={(selected.dispatchedAt || selected.sentAt || '—').toString().replace('T', ' ').slice(0, 19)} />
            </div>

            {selected.deliveryCounts && (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <DetailField label="Delivery" value={`sent ${selected.deliveryCounts.sent} · delivered ${selected.deliveryCounts.delivered} · failed ${selected.deliveryCounts.failed} · pending ${selected.deliveryCounts.pending}`} />
              </div>
            )}

            {selected.status === 'PENDING' && canDispatch ? (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Recipients (comma-separated)</label>
                  <textarea value={drawerRecipients} onChange={(e) => setDrawerRecipients(e.target.value)} rows={3} className="form-control" />
                </div>
                <div className="form-group" style={{ marginBottom: '10px' }}>
                  <label>Content</label>
                  <textarea value={drawerContent} onChange={(e) => setDrawerContent(e.target.value)} rows={6} className="form-control" style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }} />
                </div>
                {(selected.sensitiveFields || []).length > 0 && (
                  <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-high)', marginBottom: '4px' }}>
                      Excluded by default (§10.4c): {selected.sensitiveFields!.join(', ')}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={drawerIncludeSensitive} onChange={(e) => setDrawerIncludeSensitive(e.target.checked)} />
                      I confirm (Duty Manager) this dispatch knowingly includes sensitive field content added above.
                    </label>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => dispatchSelected('dispatch')} disabled={busy} className="btn btn-primary btn-sm">{busy ? 'Working…' : 'Dispatch'}</button>
                  <button type="button" onClick={() => dispatchSelected('reject')} disabled={busy} className="btn btn-secondary btn-sm">Reject</button>
                </div>
              </div>
            ) : (
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <DetailField label={`Recipients (${selected.recipients?.length ?? 0})`} value={<span style={{ wordBreak: 'break-all', fontWeight: 400 }}>{selected.recipients?.join(', ') || '—'}</span>} />
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Content</strong>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11.5px', fontFamily: 'var(--font-mono)', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', padding: '12px', borderRadius: 'var(--radius-md)', margin: 0, lineHeight: 1.4, color: 'var(--text-main)' }}>{selected.contentDispatched}</pre>
            </div>
          </div>
        )}
      </div>

      {/* New Broadcast modal */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal-box" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>New Broadcast</h2>
            <p className="sub-desc" style={{ marginBottom: '18px' }}>Manually initiate a broadcast for a confirmed operational need (FSD §10.1d). Created as PENDING for review &amp; dispatch.</p>

            <div className="form-group">
              <label>Case ID</label>
              <input value={newForm.caseId} onChange={(e) => setNewForm({ ...newForm, caseId: e.target.value })} className="form-control" placeholder="SEN/CI/20260722/001" />
            </div>
            <div className="form-group">
              <label>Incident ID (optional)</label>
              <input value={newForm.incidentId} onChange={(e) => setNewForm({ ...newForm, incidentId: e.target.value })} className="form-control" />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select value={newForm.type} onChange={(e) => setNewForm({ ...newForm, type: e.target.value })} className="form-control select-dark">
                <option>Manual</option>
                <option>Weather Advisory</option>
              </select>
            </div>
            <div className="form-group">
              <label>Recipients (comma-separated emails)</label>
              <textarea value={newForm.recipients} onChange={(e) => setNewForm({ ...newForm, recipients: e.target.value })} rows={2} className="form-control" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Content</label>
              <textarea value={newForm.content} onChange={(e) => setNewForm({ ...newForm, content: e.target.value })} rows={6} className="form-control" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>

            <div className="modal-actions">
              <button type="button" onClick={() => setShowNew(false)} disabled={busy} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={createManual} disabled={busy} className="btn btn-primary">{busy ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>{label}</strong>
      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-main)' }}>{value}</div>
    </div>
  );
}
