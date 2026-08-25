'use client';

// Shared small UI pieces for the Broadcast module (Phase 1/2 redesign,
// BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md §6). Kept separate from the tab/page
// components so BroadcastRecordsTab, BroadcastEodTab, the drawer and the
// full-page /broadcasts/[id] route all render status/level/type/time exactly
// the same way instead of drifting.

import React from 'react';

export interface BroadcastRecordDTO {
  id: string;
  caseId: string;
  incidentId: string;
  type: string;
  recipients: string[];
  templateUsed: string;
  templateId?: string;
  matrixRuleId?: string;
  recipientGroups?: string[];
  subject?: string;
  contentDispatched: string;
  contentDefault?: string;
  carryForwardSummary?: string; // US-BC-01 — see BroadcastRecord.carryForwardSummary comment in db.ts
  sentAt: string | null;
  sentBy: string;
  status: string;
  deliveryAttempts: number;
  deliveryCounts?: { sent: number; delivered: number; failed: number; pending: number };
  acknowledgedCount?: number;
  dispatchedBy?: string;
  dispatchedAt?: string;
  channels?: string[];
  contentEditConfirmed?: boolean;
  crisisLevel?: string;
  incidentType?: string;
  incidentSubType?: string;
  incidentTitle?: string;
  createdAt?: string;
  queuedBy?: string;
  eodDate?: string;
  resolutionWarning?: string;
  recipientStatus?: { email: string; status: string; at?: string; error?: string }[];
}

export const STATUS_BADGE_CLASS: Record<string, string> = {
  PENDING: 'badge-pending-ctrl',
  SENT: 'badge-onsite',
  FAILED: 'badge-live',
  REJECTED: 'badge-closed',
};

export const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  SENT: 'Sent',
  FAILED: 'Failed',
  REJECTED: 'Rejected (legacy)',
};

// A PENDING End-of-Day record whose night has passed reads as "not sent" rather
// than a separate status (Kyle, 2026-07-26, decision D6 — see BroadcastRecord.eodDate
// comment in db.ts). This derives that label without ever writing a new status.
export function effectiveStatusLabel(bc: BroadcastRecordDTO): { label: string; cls: string } {
  if (bc.status === 'PENDING' && bc.type === 'End-of-Day' && bc.eodDate && bc.eodDate < todayStr()) {
    return { label: 'Not Sent', cls: 'badge-closed' };
  }
  return { label: STATUS_LABEL[bc.status] || bc.status, cls: STATUS_BADGE_CLASS[bc.status] || 'badge-closed' };
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function StatusBadge({ bc }: { bc: BroadcastRecordDTO }) {
  const { label, cls } = effectiveStatusLabel(bc);
  return <span className={`badge ${cls}`}>{label}</span>;
}

const TYPE_ACCENT: Record<string, string> = {
  'Closure': 'var(--color-review)',
  'End-of-Day': 'var(--color-primary)',
  'Weather Advisory': '#7C3AED',
  'Manual': 'var(--color-closed)',
};
export function typeAccentColor(type: string): string {
  return TYPE_ACCENT[type] || 'var(--color-closed)';
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className="badge"
      style={{
        background: 'var(--bg-inset)',
        color: 'var(--text-sub, var(--text-main))',
        borderColor: 'var(--border-color)',
        textTransform: 'none',
        letterSpacing: 0,
        fontWeight: 700,
      }}
    >
      {type}
    </span>
  );
}

// Crisis level chip — level 1-2 critical, 3-4 high, 5 neutral (mirrors the
// severity grouping used in the mockup and IncidentLogTab's existing coloring).
export function LevelDot({ level }: { level?: string }) {
  if (!level) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  const n = parseInt(level.replace(/\D/g, ''), 10) || 0;
  const bg = n <= 2 ? 'var(--color-critical)' : n <= 4 ? 'var(--color-high)' : 'var(--color-closed)';
  return (
    <span
      title={level}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, borderRadius: '50%', fontSize: 11, fontWeight: 800,
        color: '#fff', background: bg,
      }}
    >
      {n || '—'}
    </span>
  );
}

export function ChannelIcons({ channels }: { channels?: string[] }) {
  if (!channels || channels.length === 0) return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  return (
    <span style={{ fontSize: 13, letterSpacing: 2 }}>
      {channels.includes('Email') ? '✉' : ''}
      {channels.includes('Push Notification') ? '📱' : ''}
    </span>
  );
}

export function EditedTag({ bc }: { bc: BroadcastRecordDTO }) {
  if (!bc.contentEditConfirmed) return null;
  return (
    <span
      className="badge badge-incomplete"
      style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 700 }}
      title="Content edited from the default template (§10.4d)"
    >
      ✎ edited
    </span>
  );
}

export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return iso.replace('T', ' ').slice(0, 16);
}

export function fmtRelative(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

// Recipient delivery result summary shown in the table's compact column, e.g.
// "✓3 / 3" or "✓2 / ⚠1 failed". Falls back to nothing for PENDING/never-dispatched.
export function deliverySummary(bc: BroadcastRecordDTO): { text: string; bad: boolean } | null {
  if (!bc.deliveryCounts) return null;
  const { sent, delivered, failed } = bc.deliveryCounts;
  const total = bc.recipients?.length ?? sent + delivered + failed;
  const ok = delivered + sent; // sent-but-not-yet-confirmed-delivered still counts as "went out"
  if (failed > 0) return { text: `✓${ok} / ⚠${failed} failed`, bad: true };
  return { text: `✓${ok} / ${total}`, bad: false };
}
