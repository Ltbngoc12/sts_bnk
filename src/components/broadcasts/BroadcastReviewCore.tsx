'use client';

// Shared review/dispatch core — used by the Tab 1 drawer, the full-page
// /broadcasts/[id] route, and the Tab 2 End-of-Day panel. Renders: routing info,
// recipient chips, content tabs, delivery table (once SENT) and the
// dispatch/read-only footer. The three call sites differ only in the chrome
// wrapped AROUND this (drawer header vs incident-context header vs page header)
// — keeping the actual review/dispatch logic in one place means a fix here
// (e.g. the content-diff gate, or the dispatch request shape) can't drift
// between the two tabs the way the old two separate pages did.

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BroadcastRecordDTO, StatusBadge, LevelDot, EditedTag,
  fmtDateTime, effectiveStatusLabel,
} from './broadcastUi';
import { RecipientChips } from './RecipientChips';
import { CarryForwardSummaryField } from './CarryForwardSummaryField';
import { ContentTabs } from './ContentTabs';
import { DeliveryTable } from './DeliveryTable';
import { encodeIdPath, applyCarryForwardSummary } from '@/lib/broadcast';

export function RoutingInfo({ bc }: { bc: BroadcastRecordDTO }) {
  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
        Routing
      </h3>
      <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr 96px 1fr', gap: '8px 12px', fontSize: 12.5, alignItems: 'baseline', margin: 0 }}>
        <dt style={dtStyle}>Matched rule</dt>
        <dd style={ddStyle}>{bc.matrixRuleId || <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>—</span>}</dd>
        <dt style={dtStyle}>Template</dt>
        <dd style={ddStyle}>{bc.templateUsed}</dd>
        <dt style={dtStyle}>Recipient group</dt>
        <dd style={ddStyle}>{bc.recipientGroups?.length ? bc.recipientGroups.join(', ') : <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>group unknown</span>}</dd>
        <dt style={dtStyle}>Channel</dt>
        <dd style={ddStyle}>{bc.channels?.join(', ')}</dd>
        {bc.incidentId && (
          <>
            <dt style={dtStyle}>Incident</dt>
            <dd style={ddStyle}><Link href={`/incidents/${bc.incidentId}`} className="link">{bc.incidentId}</Link>{bc.incidentTitle ? ` — ${bc.incidentTitle}` : ''}</dd>
          </>
        )}
        <dt style={dtStyle}>Created</dt>
        <dd style={ddStyle}>{fmtDateTime(bc.createdAt)} · {bc.queuedBy || bc.sentBy}</dd>
      </dl>
    </div>
  );
}
const dtStyle: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' };
const ddStyle: React.CSSProperties = { fontWeight: 600, margin: 0 };

export function ResolutionWarningBox({ bc }: { bc: BroadcastRecordDTO }) {
  if (!bc.resolutionWarning) return null;
  return (
    <div style={{ background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 12, marginBottom: 16 }}>
      <b style={{ color: '#991B1B', display: 'block', marginBottom: 4, fontSize: 11.5 }}>⚠ No recipients — no routing rule matched</b>
      {bc.resolutionWarning}
      <div style={{ marginTop: 8 }}>
        → This record <b>cannot be dispatched</b> until the Broadcast Matrix is fixed or recipients are added manually.{' '}
        <Link href="/admin/broadcast-config?tab=Matrix" className="link">Open Broadcast Matrix ↗</Link>
      </div>
    </div>
  );
}

// Dispatch audit trail block for an already-SENT record (fixes part of gap G5/G6:
// dispatchedBy/At plus whether content was edited from default are now visible
// together instead of scattered across separate DetailField rows).
export function RecordAuditBlock({ bc }: { bc: BroadcastRecordDTO }) {
  if (bc.status !== 'SENT') return null;
  return (
    <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-color)', marginTop: 16 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
        Record
      </h3>
      <dl style={{ display: 'grid', gridTemplateColumns: '110px 1fr 96px 1fr', gap: '8px 12px', fontSize: 12.5, alignItems: 'baseline', margin: 0 }}>
        <dt style={dtStyle}>Approved &amp; sent</dt>
        <dd style={ddStyle}>{bc.dispatchedBy || bc.sentBy} · {fmtDateTime(bc.dispatchedAt || bc.sentAt)}</dd>
        <dt style={dtStyle}>Content</dt>
        <dd style={{ ...ddStyle, color: bc.contentEditConfirmed ? '#7C3AED' : undefined }}>
          {bc.contentEditConfirmed ? 'Edited from default — confirmed' : 'Original template'}
        </dd>
      </dl>
    </div>
  );
}

export function BroadcastReviewCore({
  bc,
  role,
  username,
  canDispatch,
  onDispatched,
  editTabLabel,
}: {
  bc: BroadcastRecordDTO;
  role: string;
  username: string;
  canDispatch: boolean;
  onDispatched: (updated: BroadcastRecordDTO) => void;
  editTabLabel?: string;
}) {
  const isPending = bc.status === 'PENDING';
  // A PENDING EOD record whose night has passed is treated as "not sent" (D6) —
  // no dispatch UI should be offered for it even though status is still PENDING.
  const { label: effLabel } = effectiveStatusLabel(bc);
  const isEditable = isPending && canDispatch && effLabel !== 'Not Sent';

  const [recipients, setRecipients] = useState<string[]>(bc.recipients || []);
  const [content, setContent] = useState(bc.contentDispatched || '');
  const [confirmChange, setConfirmChange] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // We don't have the *group's* raw member list client-side (only the snapshot
  // that became bc.recipients at queue time) — so "default" for diff purposes is
  // the snapshot as first loaded, before any local edits in this session.
  const [initialRecipients] = useState<string[]>(bc.recipients || []);

  // US-BC-01 — Carry-Forward Summary. Like recipients/content, this only lives in
  // local state until dispatch() sends it — there is no separate draft-save path
  // on this screen (see BroadcastRecord.carryForwardSummary comment in db.ts).
  const [carryForwardSummary, setCarryForwardSummary] = useState(bc.carryForwardSummary || '');
  // Whether the Duty Manager has directly typed into the Edit tab THIS session.
  // Once true, the summary box no longer auto-updates `content` — an Edit-tab
  // edit is authoritative over the guided summary substitution (US-BC-01 EC1).
  const [contentTouched, setContentTouched] = useState(false);

  // The baseline BOTH the Preview tab and the "content edited from default"
  // confirmation gate treat as "unedited" — the queue-time default with the
  // Carry-Forward Summary merged in, if any (BR4/BR5: typing in that box must
  // never by itself require the confirmation checkbox). Recomputed on every
  // keystroke in the summary box; `content` (the Edit tab's live value) is kept
  // in sync with it below UNLESS the Duty Manager has edited the Edit tab
  // directly, at which point their edit wins (EC1).
  const effectiveDefault = applyCarryForwardSummary(bc.contentDefault ?? bc.contentDispatched ?? '', carryForwardSummary);
  useEffect(() => {
    if (isEditable && !contentTouched) setContent(effectiveDefault);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDefault, contentTouched, isEditable]);

  const dispatch = async () => {
    if (recipients.length === 0) { setError('Recipient list cannot be empty.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/broadcasts/${encodeIdPath(bc.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'dispatch', recipients, content, role, user: username,
          confirmContentChange: confirmChange,
          carryForwardSummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Dispatch failed.');
        return;
      }
      onDispatched(data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ResolutionWarningBox bc={bc} />
      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <RoutingInfo bc={bc} />
      </div>

      {/* US-BC-01 — End-of-Day Interim only (BR7); Closure/Weather/Manual records
          never render this block. */}
      {bc.type === 'End-of-Day' && (
        <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
          <CarryForwardSummaryField value={carryForwardSummary} editable={isEditable} onChange={setCarryForwardSummary} />
        </div>
      )}

      {error && (
        <div style={{ background: 'var(--color-critical-bg)', border: '1px solid var(--color-critical-border)', color: '#991B1B', borderRadius: 'var(--radius-md)', padding: '10px 12px', fontSize: 12.5, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {isEditable && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button type="button" onClick={dispatch} disabled={busy || recipients.length === 0} className="btn btn-primary">
            {busy ? 'Sending…' : 'Approve & Send →'}
          </button>
        </div>
      )}

      <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border-color)', marginBottom: 16 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Recipients ({recipients.length})
        </h3>
        <RecipientChips value={recipients} defaultValue={initialRecipients} editable={isEditable} onChange={setRecipients} />
      </div>
      <div>
        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          Content &amp; Delivery
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: bc.status === 'SENT' ? '1fr 250px' : '1fr', gap: 16, alignItems: 'start' }}>
          <ContentTabs
            subject={bc.subject}
            // Fall back to contentDispatched (the ORIGINAL value as loaded, before
            // any edit in this session) for records queued before contentDefault
            // existed — NOT to the live `value` state. ContentTabs' `changed` check
            // is `value !== baseline`; if baseline fell back to the live `value`
            // prop itself it would always equal value and the edit-confirmation
            // checkbox would never appear, while the server (which diffs against
            // bc.contentDispatched as stored in the DB) would still correctly see
            // the edit and reject the dispatch with "explicit confirmation is
            // required" — a dead end with no checkbox to satisfy it. Bug found by
            // Kyle 2026-07-26 on a legacy record with no contentDefault.
            //
            // US-BC-01: also merged with the Carry-Forward Summary (effectiveDefault
            // instead of the raw contentDefault/contentDispatched) so that typing in
            // that box alone never trips the "edited from default" gate — only an
            // Edit-tab change ON TOP of the summary substitution does (BR5/EC1).
            defaultContent={effectiveDefault}
            value={content}
            editable={isEditable}
            onChange={(v) => { setContentTouched(true); setContent(v); }}
            confirmChecked={confirmChange}
            onConfirmChange={setConfirmChange}
            editTabLabel={editTabLabel}
          />
          {bc.status === 'SENT' && <DeliveryTable broadcastId={bc.id} recipients={bc.recipients} />}
        </div>
      </div>

      <RecordAuditBlock bc={bc} />
    </>
  );
}
