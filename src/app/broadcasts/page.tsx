'use client';

// Broadcasts — merged 1 page / 2 tab layout (BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md
// §6, decision D1, 2026-07-26). Previously /broadcasts and /broadcasts/eod-review
// were two separate pages that both rendered the exact same underlying
// BroadcastRecord data split by `type`, which meant a PENDING Closure broadcast
// had no equivalent "worklist" the way EOD did. Tab 1 is record-centric (log +
// search/filter across every broadcast, incl. the Closure worklist via the
// "Pending" sub-tab); Tab 2 is day-centric (night-by-night review, End-of-Day only).
//
// Tab state lives on `?tab=` (mirrors case-management/page.tsx's pattern) so a
// link/bookmark/back-button lands on the right tab, and RBAC-gates Tab 2 by
// hiding it entirely for a role without broadcast.eod_review (fixes M1 — e.g.
// Controller has broadcast.dispatch but not eod_review) instead of rendering it
// and then showing a 403.

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';
import { BroadcastRecordsTab } from '@/components/tabs/BroadcastRecordsTab';
import { BroadcastEodTab } from '@/components/tabs/BroadcastEodTab';

type TabKey = 'records' | 'eod';

function BroadcastsPageInner() {
  const { role } = useRole();
  const searchParams = useSearchParams();
  const router = useRouter();
  const canReviewEod = hasBroadcastPermission(role, 'broadcast.eod_review');

  const requestedTab = (searchParams.get('tab') as TabKey) || 'records';
  const activeTab: TabKey = requestedTab === 'eod' && !canReviewEod ? 'records' : requestedTab;

  const setTab = (key: TabKey) => {
    router.replace(`/broadcasts?tab=${key}`);
  };

  return (
    <>
      <div className="page-header-bar glass">
        <div className="title-section">
          <h1 style={{ fontSize: 15, textTransform: 'uppercase' }}>Broadcasts</h1>
          <p>Broadcast records &amp; end-of-day review queue (FSD §10.9)</p>
        </div>
      </div>

      <div className="glass" style={{ padding: '0 20px', display: 'flex', alignItems: 'flex-end', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setTab('records')}
          style={{
            background: 'transparent', border: 'none',
            borderBottom: activeTab === 'records' ? '2px solid var(--color-primary)' : '2px solid transparent',
            color: activeTab === 'records' ? 'var(--color-primary)' : 'var(--text-muted)',
            padding: '14px 20px', fontSize: 13, fontWeight: activeTab === 'records' ? 700 : 500,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 14 }}>📡</span> Broadcast Records
        </button>
        {canReviewEod && (
          <button
            onClick={() => setTab('eod')}
            style={{
              background: 'transparent', border: 'none',
              borderBottom: activeTab === 'eod' ? '2px solid var(--color-primary)' : '2px solid transparent',
              color: activeTab === 'eod' ? 'var(--color-primary)' : 'var(--text-muted)',
              padding: '14px 20px', fontSize: 13, fontWeight: activeTab === 'eod' ? 700 : 500,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 14 }}>🌆</span> End-of-Day Interim
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {activeTab === 'records' && <BroadcastRecordsTab />}
        {activeTab === 'eod' && canReviewEod && <BroadcastEodTab />}
      </div>
    </>
  );
}

export default function BroadcastsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <BroadcastsPageInner />
    </Suspense>
  );
}
