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
import { BroadcastRecordDTO, TypeBadge, StatusBadge, LevelDot, EditedTag } from '@/components/broadcasts/broadcastUi';
import { BroadcastReviewCore } from '@/components/broadcasts/BroadcastReviewCore';

export default function BroadcastDetailPage() {
  const params = useParams();
  const { role, username } = useRole();
  const canDispatch = hasBroadcastPermission(role, 'broadcast.dispatch');
  const canView = hasBroadcastPermission(role, 'broadcast.view');

  const idParts = Array.isArray(params.id) ? params.id : [params.id];
  const broadcastId = idParts.join('/');

  const [bc, setBc] = useState<BroadcastRecordDTO | null>(null);
  const [loading, setLoading] = useState(true);

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
          <Link href="/broadcasts" className="link" style={{ fontSize: 12 }}>← Back to Broadcasts</Link>
          <h1 style={{ fontSize: 15, textTransform: 'uppercase', marginTop: 4 }}>Broadcast Detail</h1>
        </div>
        <button type="button" onClick={() => window.print()} className="btn btn-secondary btn-sm">🖨 Print</button>
      </div>

      {loading ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : !bc ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Broadcast {broadcastId} not found.</div>
      ) : (
        <div className="glass" style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
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
      )}
    </>
  );
}
