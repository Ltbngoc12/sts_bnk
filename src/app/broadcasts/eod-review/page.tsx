'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';

// FSD §5.11.2 / §10.7 — End-of-Day Interim Broadcast review queue (Duty Manager).
// Lists PENDING "End-of-Day" broadcast records queued by /api/cron/eod-broadcast
// for incidents still open at EOD cutover. The Duty Manager reviews the
// pre-filled recipients/content per incident and confirms dispatch, or rejects
// (no interim broadcast needed for that incident today).
interface BroadcastRecord {
  id: string;
  caseId: string;
  incidentId: string;
  type: string;
  recipients: string[];
  templateUsed: string;
  contentDispatched: string;
  status: string;
  channels?: string[];
  sensitiveFields?: string[];
  sensitiveFieldsIncluded?: boolean;
}

export default function EodReviewPage() {
  const { role, username } = useRole();
  const canReview = hasBroadcastPermission(role, 'broadcast.eod_review');

  const [items, setItems] = useState<BroadcastRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { recipients: string; content: string; includeSensitive: boolean }>>({});
  const [lastRun, setLastRun] = useState<{ queued: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/broadcasts?type=End-of-Day&status=PENDING');
      const data = await res.json();
      const list: BroadcastRecord[] = Array.isArray(data) ? data : [];
      setItems(list);
      setDrafts((prev) => {
        const next = { ...prev };
        list.forEach((b) => {
          if (!next[b.id]) {
            next[b.id] = { recipients: (b.recipients || []).join(', '), content: b.contentDispatched, includeSensitive: false };
          }
        });
        return next;
      });
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (canReview) load(); }, [canReview]);

  const runCheckNow = async () => {
    setRunning(true);
    try {
      const res = await fetch('/api/cron/eod-broadcast');
      const data = await res.json();
      setLastRun({ queued: data.queued ?? 0 });
      await load();
    } finally {
      setRunning(false);
    }
  };

  const act = async (b: BroadcastRecord, action: 'dispatch' | 'reject') => {
    const draft = drafts[b.id];
    const recipients = (draft?.recipients || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (action === 'dispatch' && recipients.length === 0) { alert('Recipient list cannot be empty.'); return; }
    const hasSensitive = (b.sensitiveFields || []).length > 0;
    if (action === 'dispatch' && hasSensitive && draft?.includeSensitive === undefined) {
      // no-op guard: default is false, handled below
    }
    setBusyId(b.id);
    try {
      const res = await fetch(`/api/broadcasts/${b.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          recipients,
          content: draft?.content,
          role,
          user: username,
          includeSensitive: draft?.includeSensitive || false,
          confirmSensitive: draft?.includeSensitive || false,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        alert(`Failed: ${e.error}`);
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (!canReview) {
    return (
      <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px', color: 'var(--text-main)' }}>Access Restricted</div>
        <div style={{ fontSize: '13px' }}>Your role ({role}) does not have End-of-Day review access.</div>
      </div>
    );
  }

  return (
    <>
      <div className="page-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="title-section">
          <h1 style={{ fontSize: '15px', textTransform: 'uppercase' }}>End-of-Day Review</h1>
          <p>Incidents still open at End-of-Day cutover — review and dispatch interim broadcasts (FSD §5.11.2 / §10.7)</p>
        </div>
        <button type="button" onClick={runCheckNow} disabled={running} className="btn btn-primary" style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', fontWeight: 600 }}>
          {running ? 'Checking…' : 'Run End-of-Day Check Now'}
        </button>
      </div>

      {lastRun && (
        <div className="glass" style={{ padding: '10px 16px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
          Last check: {lastRun.queued} new incident(s) queued.
        </div>
      )}

      {loading ? (
        <div className="glass" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading queue…</div>
      ) : items.length === 0 ? (
        <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
          Nothing pending. Every open incident has been reviewed, or the End-of-Day check hasn't run yet today.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {items.map((b) => {
            const draft = drafts[b.id] || { recipients: '', content: b.contentDispatched, includeSensitive: false };
            const hasSensitive = (b.sensitiveFields || []).length > 0;
            const busy = busyId === b.id;
            return (
              <div key={b.id} className="glass" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span className="mono-id">{b.id}</span>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Incident <Link href={`/incidents/${b.incidentId}`} className="link">{b.incidentId}</Link> · Case {b.caseId} · Template: {b.templateUsed}
                      {b.channels?.length ? ` · Channels: ${b.channels.join(', ')}` : ''}
                    </div>
                  </div>
                  <span className="badge badge-pending-ctrl">PENDING</span>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Recipients (comma-separated)</label>
                  <textarea
                    value={draft.recipients}
                    onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...draft, recipients: e.target.value } }))}
                    rows={2}
                    className="form-control"
                  />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Content</label>
                  <textarea
                    value={draft.content}
                    onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...draft, content: e.target.value } }))}
                    rows={6}
                    className="form-control"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  />
                </div>

                {hasSensitive && (
                  <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--color-high)', marginBottom: '4px' }}>
                      Excluded by default (§10.4c): {b.sensitiveFields!.join(', ')}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={draft.includeSensitive}
                        onChange={(e) => setDrafts((p) => ({ ...p, [b.id]: { ...draft, includeSensitive: e.target.checked } }))}
                      />
                      I confirm (Duty Manager) this dispatch knowingly includes sensitive field content added to the text above.
                    </label>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => act(b, 'reject')} disabled={busy} className="btn btn-secondary btn-sm">
                    {busy ? 'Working…' : 'Reject (not needed)'}
                  </button>
                  <button type="button" onClick={() => act(b, 'dispatch')} disabled={busy} className="btn btn-primary btn-sm">
                    {busy ? 'Working…' : 'Dispatch'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
