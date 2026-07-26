'use client';

// 800px overlay drawer for a single Broadcast record (fixes gap U4 — the old
// detail panel lived inline in the page grid and reflowed/shrank the whole table
// every time it opened). Deep-links via `?id=` on the parent page and offers
// "Full page" to the dedicated /broadcasts/[id] route for printing/sharing.

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { BroadcastRecordDTO, TypeBadge, StatusBadge, LevelDot, EditedTag } from './broadcastUi';
import { BroadcastReviewCore } from './BroadcastReviewCore';
import { encodeIdPath } from '@/lib/broadcast';

export function BroadcastDrawer({
  id,
  role,
  username,
  canDispatch,
  onClose,
  onChanged,
}: {
  id: string | null;
  role: string;
  username: string;
  canDispatch: boolean;
  onClose: () => void;
  onChanged: () => void; // tell the parent list to refetch after a dispatch
}) {
  const [bc, setBc] = useState<BroadcastRecordDTO | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (broadcastId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/broadcasts?id=${encodeURIComponent(broadcastId)}`);
      if (res.ok) setBc(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) load(id);
    else setBc(null);
  }, [id, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = !!id;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.18s', zIndex: 1000,
        }}
      />
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, height: '100vh', width: 800, maxWidth: '96vw',
          background: 'var(--bg-card)', borderLeft: '1px solid var(--border-color)',
          boxShadow: '-14px 0 40px -12px rgba(0,0,0,0.18)',
          transform: open ? 'none' : 'translateX(102%)', transition: 'transform 0.22s cubic-bezier(.32,.72,0,1)',
          zIndex: 1001, display: 'flex', flexDirection: 'column',
        }}
      >
        {bc && (
          <>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <TypeBadge type={bc.type} />
                  <LevelDot level={bc.crisisLevel} />
                  <StatusBadge bc={bc} />
                  <EditedTag bc={bc} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600 }}>{bc.id}</h2>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Link href={`/broadcasts/${encodeIdPath(bc.id)}`} className="btn btn-secondary btn-sm">↗ Full page</Link>
                <button type="button" onClick={onClose} className="close-btn" style={{ fontSize: 20 }}>×</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              <BroadcastReviewCore
                bc={bc}
                role={role}
                username={username}
                canDispatch={canDispatch}
                onDispatched={(updated) => { setBc(updated); onChanged(); }}
              />
            </div>
          </>
        )}
        {!bc && loading && open && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
        )}
      </aside>
    </>
  );
}
