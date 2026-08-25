'use client';

// Per-recipient delivery table (§10.9d-e). Polls GET /api/broadcasts/[id]/delivery
// once on mount for a SENT broadcast (fixes G11 — deliveryCounts used to freeze at
// dispatch time and never update, so this was always "delivered 0" before). Offers
// a per-recipient "Resend" retry for Failed rows via POST to the same endpoint.

import React, { useEffect, useState } from 'react';
import { encodeIdPath } from '@/lib/broadcast';

interface RecipientStatus { email: string; status: string; at?: string; error?: string }

const STATUS_STYLE: Record<string, { color: string; icon: string }> = {
  Delivered: { color: 'var(--color-active)', icon: '✓' },
  Sent: { color: 'var(--color-info)', icon: '➤' },
  Queued: { color: 'var(--text-muted)', icon: '…' },
  Failed: { color: 'var(--color-critical)', icon: '⚠' },
};

export function DeliveryTable({ broadcastId, recipients }: { broadcastId: string; recipients: string[] }) {
  const [rows, setRows] = useState<RecipientStatus[]>(recipients.map((email) => ({ email, status: 'Queued' })));
  const [loading, setLoading] = useState(true);
  const [resendingAll, setResendingAll] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`/api/broadcasts/${encodeIdPath(broadcastId)}/delivery`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.recipientStatus) && data.recipientStatus.length > 0) {
          setRows(data.recipientStatus);
        }
      }
    } catch { /* keep last known */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    // Short poll — the mock gateway's Sent→Delivered transition lands ~800ms
    // after dispatch, so a couple of refreshes right after opening the panel is
    // enough to catch it settle; no need for a long-lived interval.
    const t1 = setTimeout(load, 1200);
    const t2 = setTimeout(load, 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [broadcastId]);

  const resend = async (emails: string[]) => {
    setResendingAll(true);
    try {
      const res = await fetch(`/api/broadcasts/${encodeIdPath(broadcastId)}/delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.recipientStatus)) setRows(data.recipientStatus);
      }
    } finally { setResendingAll(false); }
  };

  const okCount = rows.filter((r) => r.status === 'Delivered' || r.status === 'Sent').length;
  const failedEmails = rows.filter((r) => r.status === 'Failed').map((r) => r.email);

  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
        Delivery ({rows.length})
      </h3>
      <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse' }}>
        <tbody>
          {rows.map((r) => {
            const style = STATUS_STYLE[r.status] || STATUS_STYLE.Queued;
            return (
              <tr key={r.email}>
                <td style={{ padding: '7px 4px', borderBottom: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-sub, var(--text-main))', wordBreak: 'break-all' }}>
                  {r.email}
                  {r.status === 'Failed' && r.error && (
                    <div style={{ color: 'var(--color-critical)', fontFamily: 'var(--font-body, inherit)', fontSize: 11, marginTop: 3 }}>{r.error}</div>
                  )}
                </td>
                <td style={{ padding: '7px 4px', borderBottom: '1px solid var(--border-color)', color: style.color, fontWeight: 700, whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                  {style.icon} {r.status}{r.at ? ` · ${r.at.slice(11, 16)}` : ''}
                  {r.status === 'Failed' && (
                    <div style={{ marginTop: 5 }}>
                      <button type="button" onClick={() => resend([r.email])} disabled={resendingAll} className="btn btn-secondary btn-sm" style={{ height: 24, fontSize: 10.5, padding: '0 8px' }}>
                        Resend
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
        <b>{okCount} / {rows.length}</b> succeeded{loading ? ' · loading…' : ''}
        {failedEmails.length > 1 && (
          <button type="button" onClick={() => resend(failedEmails)} disabled={resendingAll} className="btn btn-secondary btn-sm" style={{ marginLeft: 8, height: 24, fontSize: 10.5 }}>
            Resend all failed ({failedEmails.length})
          </button>
        )}
      </div>
    </div>
  );
}
