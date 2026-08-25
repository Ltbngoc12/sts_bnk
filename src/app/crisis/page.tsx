'use client';

// Crisis Queue — story 12. Build plan §6.2.
//
// Visible to every user holding the DM role, not to a single named DM. That is one
// of the two low-cost mitigations in build plan §1 for the accepted risk that a
// crisis stalls if no Duty Manager is online: a crisis addressed to one absent
// person is a crisis nobody sees.
//
// The other mitigation is the live pending-duration timer below. Neither adds
// escalation logic — both are visibility only, which is the whole point: they do
// not quietly re-open the auto-dispatch decision (D1) that was deliberately
// deferred.

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { hasCrisisPermission } from '@/lib/permissions';
import { formatDuration, isTerminal } from '@/lib/crisis';
import type { Crisis, CrisisCounters, CrisisStatus } from '@/lib/crisis';
import { usePolling } from '@/hooks/usePolling';

type QueueRow = Crisis & { counters: CrisisCounters };

const STATUS_TONE: Record<CrisisStatus, { bg: string; fg: string }> = {
  DRAFT: { bg: 'var(--bg-inset)', fg: 'var(--text-muted)' },
  PENDING_REVIEW: { bg: 'var(--color-critical-bg)', fg: 'var(--color-critical)' },
  DISPATCHED: { bg: '#fff4e5', fg: '#b26a00' },
  ACTIVE: { bg: '#fff4e5', fg: '#b26a00' },
  STOOD_DOWN: { bg: 'var(--bg-inset)', fg: 'var(--text-sub)' },
  CLOSED: { bg: 'var(--bg-inset)', fg: 'var(--text-muted)' },
  CANCELLED: { bg: 'var(--bg-inset)', fg: 'var(--text-muted)' },
  SUPERSEDED: { bg: 'var(--bg-inset)', fg: 'var(--text-muted)' },
};

function StatusChip({ status }: { status: CrisisStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span style={{ background: t.bg, color: t.fg, padding: '3px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {status.replace('_', ' ')}
    </span>
  );
}

export default function CrisisQueuePage() {
  const router = useRouter();
  const { role } = useRole();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClosed, setShowClosed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Re-render tick so the pending-duration timers count up without refetching.
  const [, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const data = await fetch('/api/crises').then((r) => r.json());
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load crisis queue', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Network poll and the 1s duration ticker both pause with the tab: an idle
  // background tab was refetching the crisis queue 4x/min and re-rendering 60x/min.
  usePolling(load, 15_000);
  usePolling(() => setNow(Date.now()), 1_000, { immediate: false });

  if (!hasCrisisPermission(role, 'crisis.view')) {
    return (
      <div className="glass" style={{ margin: '40px auto', maxWidth: '620px', padding: '40px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px' }}>Access Restricted</h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-sub)', marginTop: '10px' }}>
          The Crisis Queue is restricted to Duty Managers, Operational Resilience Analysts and administrators. Switch role from the sidebar to view it.
        </p>
      </div>
    );
  }

  const uniqueTypes = Array.from(new Set(rows.map((r) => r.incidentType).filter(Boolean))).sort();

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    levelFilter !== 'All' ||
    typeFilter !== 'All' ||
    statusFilter !== 'All' ||
    startDate !== '' ||
    endDate !== '';

  const clearFilters = () => {
    setSearchQuery('');
    setLevelFilter('All');
    setTypeFilter('All');
    setStatusFilter('All');
    setStartDate('');
    setEndDate('');
  };

  // Sorted by urgency, not by time: anything awaiting a human decision comes first,
  // then live recalls, then everything already resolved.
  const rank = (c: QueueRow) => (c.status === 'PENDING_REVIEW' ? 0 : c.status === 'ACTIVE' || c.status === 'DISPATCHED' ? 1 : 2);

  const filteredRows = rows.filter((c) => {
    // Free text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchId = c.id?.toLowerCase().includes(q);
      const matchIncId = c.sourceIncidentId?.toLowerCase().includes(q);
      const matchTitle = c.incidentTitle?.toLowerCase().includes(q);
      const matchType = c.incidentType?.toLowerCase().includes(q);
      const matchLoc = c.locationSummary?.toLowerCase().includes(q);
      if (!matchId && !matchIncId && !matchTitle && !matchType && !matchLoc) {
        return false;
      }
    }

    // Level filter
    if (levelFilter !== 'All' && String(c.crisisLevel) !== levelFilter) {
      return false;
    }

    // Type filter
    if (typeFilter !== 'All' && c.incidentType !== typeFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'All') {
      if (c.status !== statusFilter) return false;
    } else {
      if (!showClosed && isTerminal(c.status) && c.status !== 'STOOD_DOWN' && !hasActiveFilters) {
        return false;
      }
    }

    // Date range filter (Date From)
    if (startDate) {
      const itemMs = new Date(c.createdAt).getTime();
      const startMs = new Date(startDate + 'T00:00:00').getTime();
      if (isNaN(itemMs) || itemMs < startMs) return false;
    }

    // Date range filter (Date To)
    if (endDate) {
      const itemMs = new Date(c.createdAt).getTime();
      const endMs = new Date(endDate + 'T23:59:59').getTime();
      if (isNaN(itemMs) || itemMs > endMs) return false;
    }

    return true;
  });

  const visible = filteredRows.sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
  const pending = rows.filter((c) => c.status === 'PENDING_REVIEW');

  return (
    <div>
      <div
        className="admin-header-bar glass"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
      >
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>CRISIS QUEUE</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Emergency recalls awaiting review, live recalls in progress, and recent closures. Visible to all Duty Managers.
          </p>
        </div>
        <label style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-sub)', cursor: 'pointer' }}>
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show closed and cancelled
        </label>
      </div>

      {pending.length > 0 && (
        <div
          className="glass"
          style={{ padding: '14px 20px', marginTop: '12px', background: 'var(--color-critical-bg)', borderLeft: '4px solid var(--color-critical)' }}
        >
          <strong style={{ fontSize: '13.5px', color: 'var(--color-critical)' }}>
            {pending.length} crisis {pending.length === 1 ? 'recall is' : 'recalls are'} waiting for a Duty Manager.
          </strong>
          <p style={{ fontSize: '12.5px', color: 'var(--text-sub)', margin: '4px 0 0' }}>
            Nothing has been sent. A recall only goes out when a Duty Manager reviews and dispatches it — there is no automatic dispatch and no timeout.
          </p>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="glass" style={{ padding: '16px 20px', background: 'var(--bg-card)', marginTop: '12px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Filter & Search
            </span>
            {hasActiveFilters && (
              <span style={{ fontSize: '11px', background: 'var(--sidebar-active-bg, #fff7ed)', color: 'var(--color-primary, #ff8200)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600, border: '1px solid rgba(255,130,0,0.2)' }}>
                {visible.length} of {rows.length} matched
              </span>
            )}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="btn btn-secondary"
              style={{ padding: '4px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer' }}
            >
              Clear Filters
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', alignItems: 'end' }}>
          {/* Search Box */}
          <div style={{ minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, title, location..."
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--bg-inset)', color: 'var(--text-main)', outline: 'none' }}
            />
          </div>

          {/* Crisis Level */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Crisis Level</label>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--bg-inset)', color: 'var(--text-main)' }}
            >
              <option value="All">All Levels</option>
              <option value="1">Level 1 (L1)</option>
              <option value="2">Level 2 (L2)</option>
              <option value="3">Level 3 (L3)</option>
              <option value="4">Level 4 (L4)</option>
              <option value="5">Level 5 (L5)</option>
            </select>
          </div>

          {/* Incident Type */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Incident Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--bg-inset)', color: 'var(--text-main)' }}
            >
              <option value="All">All Types</option>
              {uniqueTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--bg-inset)', color: 'var(--text-main)' }}
            >
              <option value="All">All Statuses</option>
              <option value="PENDING_REVIEW">Pending Review</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="ACTIVE">Active</option>
              <option value="STOOD_DOWN">Stood Down</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="SUPERSEDED">Superseded</option>
            </select>
          </div>

          {/* Date From */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Date From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '7.5px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--bg-inset)', color: 'var(--text-main)' }}
            />
          </div>

          {/* Date To */}
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' }}>Date To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '7.5px 10px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', background: 'var(--bg-inset)', color: 'var(--text-main)' }}
            />
          </div>
        </div>
      </div>

      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '12px' }}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '20px', textAlign: 'center' }}>Loading crisis queue…</p>
        ) : visible.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0 }}>
              {hasActiveFilters
                ? 'No crisis recalls found matching your filter criteria.'
                : 'No crises. A crisis is raised automatically when an incident reaches Level 1 or Level 2.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="btn btn-secondary"
                style={{ marginTop: '12px', padding: '6px 16px', fontSize: '12px', borderRadius: '6px' }}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr>
                <th>Status</th>
                <th>Incident</th>
                <th>Level</th>
                <th>Location</th>
                <th>Waiting / Elapsed</th>
                <th>Response</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const waitingFrom = c.status === 'PENDING_REVIEW' ? c.createdAt : c.dispatchedAt || c.createdAt;
                const waitingTo = isTerminal(c.status) ? c.closedAt || c.standDownAt || c.cancelledAt : undefined;
                const stale = c.status === 'PENDING_REVIEW' && Date.now() - new Date(c.createdAt).getTime() > 5 * 60_000;
                return (
                  <tr key={c.id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/crisis/${c.id}`)}>
                    <td>
                      <StatusChip status={c.status} />
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{c.incidentTitle}</div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {c.sourceIncidentId} · {c.incidentType}
                      </div>
                    </td>
                    <td style={{ fontSize: '13px', fontWeight: 700, color: c.crisisLevel <= 1 ? 'var(--color-critical)' : 'var(--text-main)' }}>L{c.crisisLevel}</td>
                    <td style={{ fontSize: '12.5px' }}>{c.locationSummary}</td>
                    <td>
                      {/* Live pending duration — build plan §1 mitigation 2. */}
                      <span style={{ fontSize: '13px', fontWeight: stale ? 700 : 500, color: stale ? 'var(--color-critical)' : 'var(--text-main)' }}>
                        {formatDuration(waitingFrom, waitingTo)}
                      </span>
                      {stale && <div style={{ fontSize: '11px', color: 'var(--color-critical)' }}>unreviewed</div>}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      {c.status === 'PENDING_REVIEW' ? (
                        <span style={{ color: 'var(--text-muted)' }}>not dispatched</span>
                      ) : c.counters.total === 0 ? (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      ) : (
                        <>
                          <strong>{c.counters.acknowledged}</strong> / {c.counters.total} acknowledged
                          {c.counters.declined > 0 && <span style={{ color: 'var(--text-muted)' }}> · {c.counters.declined} declined</span>}
                        </>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        href={`/crisis/${c.id}`}
                        className="btn btn-secondary"
                        style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', textDecoration: 'none' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.status === 'PENDING_REVIEW' ? 'Review' : c.status === 'ACTIVE' || c.status === 'DISPATCHED' ? 'Open dashboard' : 'View'}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
