'use client';

// Full-page Broadcast detail (fixes gap U4/C2 — the drawer is for quick review
// while scanning the list; this route is for careful review, sharing a link, or
// printing a hard copy for a hand-off file). IDs contain slashes (e.g.
// SEN/CI/20260621/002-BC001) so this is a catch-all like the API route.

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';
import { BroadcastRecordDTO, TypeBadge, StatusBadge, LevelDot, EditedTag, fmtDateTime } from '@/components/broadcasts/broadcastUi';
import { BroadcastReviewCore } from '@/components/broadcasts/BroadcastReviewCore';
import type { AuditLog } from '@/lib/db';

// One row in the Audit Log section's timeline. Built by merging real entries from
// the shared /api/admin/audit log (filtered to this broadcast's entityId — same
// per-entity history pattern as the Broadcast Template detail page) with
// synthesized entries from fields already on the record (createdAt/queuedBy,
// contentEditConfirmed, sentAt/dispatchedAt) for legacy records that predate
// audit logging on the create/dispatch endpoints, or for the "content edited"
// fact that isn't (yet) its own separately-timestamped audit action.
interface AuditTimelineEntry {
  ts: string;
  user: string;
  action: string;
  details?: string;
}

function buildAuditTimeline(bc: BroadcastRecordDTO, logs: AuditLog[]): AuditTimelineEntry[] {
  const matched = logs.filter((l) => l.module === 'Broadcast' && l.entityId === bc.id);
  const entries: AuditTimelineEntry[] = matched.map((l) => ({
    ts: l.timestamp, user: l.user, action: l.action, details: l.details,
  }));

  const hasCreateEntry = matched.some((l) => /queue|create/i.test(l.action));
  const hasSendEntry = matched.some((l) => /dispatch|send/i.test(l.action));

  if (!hasCreateEntry && bc.createdAt) {
    entries.push({
      ts: bc.createdAt,
      user: bc.queuedBy || 'system',
      action: 'Created',
      details: `${bc.type} broadcast queued${bc.recipientGroups?.length ? ` for ${bc.recipientGroups.join(', ')}` : ''}.`,
    });
  }
  if (bc.contentEditConfirmed) {
    entries.push({
      ts: bc.dispatchedAt || bc.sentAt || bc.createdAt || '',
      user: bc.dispatchedBy || bc.sentBy,
      action: 'Content Edited',
      details: 'Message content edited from the default template before dispatch — confirmed.',
    });
  }
  if (!hasSendEntry && bc.status === 'SENT' && (bc.sentAt || bc.dispatchedAt)) {
    entries.push({
      ts: bc.dispatchedAt || bc.sentAt || '',
      user: bc.dispatchedBy || bc.sentBy,
      action: 'Sent',
      details: `Dispatched to ${bc.recipients?.length ?? 0} recipient(s).`,
    });
  }

  return entries
    .filter((e) => !!e.ts)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const { role, username } = useRole();
  const canDispatch = hasBroadcastPermission(role, 'broadcast.dispatch');
  const canView = hasBroadcastPermission(role, 'broadcast.view');

  const idParts = Array.isArray(params.id) ? params.id : [params.id];
  const broadcastId = idParts.join('/');

  const [bc, setBc] = useState<BroadcastRecordDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broadcasts?id=${encodeURIComponent(broadcastId)}`);
      if (res.ok) setBc(await res.json());
      else setBc(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [broadcastId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/audit');
        const data = await res.json();
        setAuditLogs(Array.isArray(data) ? data : []);
      } catch {
        setAuditLogs([]);
      }
    })();
  }, [broadcastId]);

  if (!canView) {
    return (
      <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Access Restricted</div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .sidebar-container, .page-header-bar, .no-print { display: none !important; }
          .main-content { margin: 0 !important; padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="page-header-bar glass no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="title-section">
          <Link href="/broadcasts" style={{ color: 'var(--text-faint)', fontSize: 12, textDecoration: 'none' }}>← Broadcasts</Link>
          <h1 style={{ fontSize: 15, textTransform: 'uppercase', marginTop: 4 }}>Broadcast Detail</h1>
        </div>
      </div>

      {loading ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : !bc ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Broadcast {broadcastId} not found.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginTop: 16, alignItems: 'start', maxWidth: 1200, margin: '16px auto 0' }}>
          <div className="glass" style={{ padding: 20 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <TypeBadge type={bc.type} />
              <LevelDot level={bc.crisisLevel} />
              <StatusBadge bc={bc} />
              <EditedTag bc={bc} />
            </div>
            <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 600, marginBottom: 20 }}>{bc.id}</h2>
            <BroadcastReviewCore
              bc={bc}
              role={role}
              username={username}
              canDispatch={canDispatch}
              onDispatched={(updated) => { setBc(updated); }}
            />
          </div>

          <div className="glass" style={{ padding: 16 }}>
            <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
              Audit Log
            </h3>
            {(() => {
              const timeline = buildAuditTimeline(bc, auditLogs);
              if (timeline.length === 0) {
                return <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: 0 }}>No activity recorded for this broadcast.</p>;
              }
              return (
                <div className="timeline">
                  {timeline.map((entry, i) => (
                    <div className="timeline-item" key={`${entry.ts}-${entry.action}-${i}`}>
                      <div className="timeline-dot" />
                      <div className="timeline-header" style={{ flexWrap: 'wrap' }}>
                        <span>{fmtDateTime(entry.ts)}</span>
                        <span>&bull;</span>
                        <span>{entry.user}</span>
                      </div>
                      <div className="timeline-desc">
                        <b>{entry.action}</b>{entry.details ? ` — ${entry.details}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}
