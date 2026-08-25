'use client';

// Crisis detail — Review (M3), Live Dashboard (M4) and Closure / After-Action (M5).
// Build plan §6.2. Stories 13–16, 19–27.
//
// One route, three faces, chosen by crisis status. This is deliberate: during a
// real recall the DM should never have to work out which page they need. The URL
// in the notification is the URL for the whole crisis, from review to report.
//
// ── THE TWO DESIGN RULES THAT SHAPE THIS FILE ─────────────────────────────────
//
// 1. REVIEW MUST BE FAST — two clicks to dispatch (build plan §6.3). Everything
//    configurable was configured in advance in Crisis Configuration. There is no
//    long form here, and the Dispatch button is never more than a scroll away.
//    Any future request to "just add one more required field to review" should be
//    pushed back on: a form that is tedious at 3am is a form that doesn't get used.
//
// 2. THE DASHBOARD MUST ANSWER THREE QUESTIONS IN FIVE SECONDS — how many have
//    acknowledged, who is silent and what is being done about them, and whether
//    there are enough responders. That is why the counters are enormous, why
//    delivery and acknowledgement are separate columns, and why row actions appear
//    only on rows that need action.

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRole } from '@/context/RoleContext';
import { hasCrisisPermission } from '@/lib/permissions';
import { formatDuration, claimIsStale, activeMembers } from '@/lib/crisis';
import { isValidSgMobile } from '@/lib/crisisConfig';
import type { Crisis, CrisisCounters, DispatchRecipient, Dispatch, CrisisAuditEntry, StandDownReason } from '@/lib/crisis';
import { usePolling } from '@/hooks/usePolling';

interface Payload {
  crisis: Crisis;
  recipients: DispatchRecipient[];
  dispatches: Dispatch[];
  audit: CrisisAuditEntry[];
  preview: string;
  templateName: string | null;
  counters: CrisisCounters;
  medianAckSeconds: number | null;
  ackWindowMinutes: number;
}

const label: React.CSSProperties = { display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-sub)', marginBottom: '4px' };
const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  fontSize: '13px',
  background: 'var(--bg-inset)',
  color: 'var(--text-main)',
};
const card: React.CSSProperties = { padding: '20px', background: 'var(--bg-card)', marginTop: '12px' };

function Pill({ text, tone }: { text: string; tone: 'ok' | 'warn' | 'muted' | 'live' }) {
  const map = {
    ok: { bg: '#e8f5e9', fg: '#2e7d32' },
    warn: { bg: 'var(--color-critical-bg)', fg: 'var(--color-critical)' },
    muted: { bg: 'var(--bg-inset)', fg: 'var(--text-muted)' },
    live: { bg: '#fff4e5', fg: '#b26a00' },
  }[tone];
  return (
    <span style={{ background: map.bg, color: map.fg, padding: '2px 9px', borderRadius: '10px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  );
}

function Counter({ n, caption, tone }: { n: number | string; caption: string; tone?: 'ok' | 'warn' | 'muted' }) {
  const color = tone === 'ok' ? '#2e7d32' : tone === 'warn' ? 'var(--color-critical)' : 'var(--text-main)';
  return (
    <div style={{ minWidth: '110px' }}>
      <div style={{ fontSize: '34px', fontWeight: 800, lineHeight: 1, color }}>{n}</div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>{caption}</div>
    </div>
  );
}

export default function CrisisDetailPage() {
  const params = useParams();
  const crisisId = decodeURIComponent(String(params.id));
  const { role, username } = useRole();

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [, setNow] = useState(Date.now());

  const [showAdd, setShowAdd] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', mobile: '', email: '', roleInGroup: '' });
  const [showStandDown, setShowStandDown] = useState(false);
  const [standDown, setStandDown] = useState<{ reason: StandDownReason; notes: string; sendMessage: boolean }>({
    reason: 'Resolved',
    notes: '',
    sendMessage: true,
  });
  const [showAudit, setShowAudit] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/crises/${crisisId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      console.error('Failed to load crisis', e);
    } finally {
      setLoading(false);
    }
  }, [crisisId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live dashboard auto-refresh (story 21). The same poll drives the escalation
  // tick — see the note on evaluateEscalation() in crisisRuntime.ts about this
  // standing in for a real scheduler.
  // NOTE: this poll doubles as the escalation scheduler (see evaluateEscalation()
  // in crisisRuntime.ts). Gating it on tab visibility means escalation only advances
  // while someone has the crisis open — acceptable for the prototype, and it catches
  // up on the next tick when the tab regains focus. Revisit if/when a real scheduler
  // (Vercel cron) takes over the tick.
  const isActiveCrisis = !!data && data.crisis.status === 'ACTIVE';

  usePolling(
    async () => {
      await fetch(`/api/crises/${crisisId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'tick', actor: username, role }),
      }).catch(() => {});
      await load();
    },
    10_000,
    { enabled: isActiveCrisis, immediate: false },
  );

  usePolling(() => setNow(Date.now()), 1_000, { enabled: isActiveCrisis, immediate: false });

  const act = async (payload: any, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return null;
    setBusy(true);
    try {
      const res = await fetch(`/api/crises/${crisisId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, actor: username, role }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Action failed.');
        await load();
        return null;
      }
      await load();
      return json;
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading crisis…</div>;
  }
  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Crisis not found.</p>
        <Link href="/crisis" className="link">
          ← Crisis Queue
        </Link>
      </div>
    );
  }

  const { crisis, recipients, counters, preview, templateName, audit, dispatches, medianAckSeconds, ackWindowMinutes } = data;
  const members = activeMembers(crisis);
  const canDispatch = hasCrisisPermission(role, 'crisis.dispatch');
  const canEditMembers = hasCrisisPermission(role, 'crisis.members_edit');
  const canContact = hasCrisisPermission(role, 'crisis.contact');
  const canClose = hasCrisisPermission(role, 'crisis.close');

  // Soft claim (build plan §10 concurrency (b)). Read-only for a second DM, with an
  // explicit, audited take-over — never a hard lock.
  const claimedByOther = !!crisis.claimedBy && crisis.claimedBy !== username && !claimIsStale(crisis.claimedAt);
  const reviewLocked = crisis.status === 'PENDING_REVIEW' && claimedByOther;

  const unreachable = members.filter((m) => !isValidSgMobile(m.mobile));

  return (
    <div>
      {/* Header */}
      <div
        className="admin-header-bar glass"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}
      >
        <div>
          <Link href="/crisis" className="link" style={{ fontSize: '12px' }}>
            ← Crisis Queue
          </Link>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
            CRISIS L{crisis.crisisLevel} — {crisis.incidentType.toUpperCase()}
          </h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {crisis.incidentTitle} · {crisis.locationSummary} ·{' '}
            <Link href={`/incidents/${encodeURIComponent(crisis.sourceIncidentId)}`} className="link">
              {crisis.sourceIncidentId}
            </Link>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Pill text={crisis.status.replace('_', ' ')} tone={crisis.status === 'PENDING_REVIEW' ? 'warn' : crisis.status === 'ACTIVE' ? 'live' : 'muted'} />
          <button onClick={() => setShowAudit(true)} className="btn btn-secondary" style={{ padding: '7px 14px', borderRadius: '6px', fontSize: '12px' }}>
            Audit Trail
          </button>
        </div>
      </div>

      {/* Linkage banner — build plan §5.1. Post-dispatch level changes never act
          automatically; the DM decides. */}
      {crisis.linkageNote && !['CLOSED', 'CANCELLED', 'SUPERSEDED'].includes(crisis.status) && (
        <div className="glass" style={{ padding: '12px 18px', marginTop: '12px', background: 'var(--color-critical-bg)', borderLeft: '4px solid var(--color-critical)', fontSize: '12.5px', color: 'var(--text-sub)' }}>
          <strong>Source incident changed:</strong> {crisis.linkageNote}
        </div>
      )}

      {reviewLocked && (
        <div className="glass" style={{ padding: '12px 18px', marginTop: '12px', background: 'var(--bg-inset)', borderLeft: '4px solid var(--color-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>
            <strong>Under review by {crisis.claimedBy}</strong> since {new Date(crisis.claimedAt as string).toLocaleTimeString()}. This screen is
            read-only to avoid two people editing the same recipient list.
          </span>
          <button
            onClick={() => act({ action: 'claim', takeOver: true }, `Take over review from ${crisis.claimedBy}? This is recorded in the audit trail.`)}
            disabled={busy}
            className="btn btn-secondary"
            style={{ padding: '6px 14px', borderRadius: '6px', fontSize: '12px' }}
          >
            Take Over
          </button>
        </div>
      )}

      {/* ══ REVIEW (PENDING_REVIEW) ══ */}
      {crisis.status === 'PENDING_REVIEW' && (
        <>
          <div className="glass" style={{ ...card, display: 'flex', gap: '32px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Counter n={formatDuration(crisis.createdAt)} caption="Awaiting review" tone="warn" />
            <Counter n={members.length} caption="Recipients resolved" />
            <Counter n={unreachable.length} caption="Cannot be reached by SMS" tone={unreachable.length ? 'warn' : 'ok'} />
            <div style={{ flex: 1, minWidth: '260px' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Resolved from</div>
              <div style={{ fontSize: '12.5px' }}>{crisis.resolvedGroupNames.join(', ') || '—'}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '6px' }}>Matched rules</div>
              <div style={{ fontSize: '12.5px' }}>{crisis.matchedRuleNames.join(', ') || 'none'}</div>
            </div>
          </div>

          {crisis.routingWarnings.length > 0 && (
            <div className="glass" style={{ padding: '12px 18px', marginTop: '12px', background: 'var(--color-critical-bg)', borderLeft: '4px solid var(--color-critical)' }}>
              {crisis.routingWarnings.map((w, i) => (
                <p key={i} style={{ fontSize: '12.5px', color: 'var(--text-sub)', margin: i ? '6px 0 0' : 0 }}>
                  {w}
                </p>
              ))}
            </div>
          )}

          {/* Fully rendered preview — never the raw template (build plan §6.3). */}
          <div className="glass" style={card}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', margin: '0 0 4px' }}>MESSAGE PREVIEW</h2>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>
              Exactly what each recipient will read. Template: {templateName || <em>none resolved</em>}.
            </p>
            <div
              style={{
                background: 'var(--bg-inset)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '16px',
                fontSize: '14px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
              }}
            >
              {preview || <span style={{ color: 'var(--color-critical)' }}>No template resolved — configure one in Crisis Configuration before dispatching.</span>}
            </div>
          </div>

          {/* Recipients with contact-validity flags surfaced BEFORE dispatch */}
          <div className="glass" style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', margin: 0 }}>RECIPIENTS ({members.length})</h2>
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Changes here affect <strong>this crisis only</strong>. The master recall groups are never modified.
                </p>
              </div>
              {/* Permission-gated per build plan §3 / FSD §11.5.e. When the action
                  is unavailable we say WHY rather than hiding the control silently
                  — a missing button is indistinguishable from an unbuilt feature,
                  and the DM has no way to tell which. Same treatment as Dispatch. */}
              {canEditMembers && !reviewLocked ? (
                <button onClick={() => setShowAdd(true)} className="btn btn-secondary" style={{ padding: '7px 14px', borderRadius: '6px', fontSize: '12px' }}>
                  + Add Recipient
                </button>
              ) : (
                <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', maxWidth: '320px', textAlign: 'right' }}>
                  {reviewLocked
                    ? `Read-only while ${crisis.claimedBy} is reviewing.`
                    : `Your role (${role}) cannot edit recipients on a crisis. This is held by the Duty Manager and the assigned OR Analyst (FSD §11.5.e).`}
                </span>
              )}
            </div>

            {unreachable.length > 0 && (
              <div style={{ background: 'var(--color-critical-bg)', borderLeft: '4px solid var(--color-critical)', padding: '10px 14px', borderRadius: '6px', fontSize: '12.5px', color: 'var(--text-sub)', marginBottom: '12px' }}>
                <strong>{unreachable.length} recipient(s) have no usable mobile number</strong> and will not receive the SMS. They are dispatched as
                failed rows so they appear on the dashboard as people to phone — not as silent gaps.
              </div>
            )}

            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Tier</th>
                  <th>Mobile</th>
                  <th>From</th>
                  {canEditMembers && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {members.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '18px', fontSize: '13px', color: 'var(--color-critical)' }}>
                      No recipients. Dispatch is blocked until at least one is added.
                    </td>
                  </tr>
                )}
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '13px', fontWeight: 600 }}>
                      {m.name} {m.addedDuringCrisis && <Pill text="added by DM" tone="muted" />}
                    </td>
                    <td style={{ fontSize: '12px' }}>{m.tier}</td>
                    <td style={{ fontSize: '12.5px' }}>
                      {m.mobile || '—'} {!isValidSgMobile(m.mobile) && <Pill text="unreachable" tone="warn" />}
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.sourceGroups.join(', ') || 'ad hoc'}</td>
                    {canEditMembers && (
                      <td style={{ textAlign: 'right' }}>
                        <button
                          onClick={() => {
                            const reason = prompt(`Remove ${m.name} from this crisis?\n\nReason (recorded in the audit trail):`);
                            if (reason === null) return;
                            act({ action: 'remove-member', memberId: m.id, reason });
                          }}
                          disabled={busy || reviewLocked}
                          className="btn btn-secondary"
                          style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '12px' }}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Two clicks to dispatch. */}
          <div className="glass" style={{ ...card, display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() =>
                act(
                  { action: 'dispatch' },
                  `Dispatch this recall to ${members.length} recipient(s)?\n\nThis sends immediately and cannot be undone — a false alarm after dispatch must be stood down, not cancelled.`
                )
              }
              disabled={busy || !canDispatch || reviewLocked || members.length === 0}
              className="btn btn-primary"
              style={{ padding: '14px 40px', borderRadius: '8px', fontSize: '15px', fontWeight: 700 }}
            >
              {busy ? 'Dispatching…' : `DISPATCH RECALL (${members.length})`}
            </button>
            <button
              onClick={() => {
                const reason = prompt('Cancel this crisis as a false alarm?\n\nReason (recorded in the audit trail):');
                if (reason === null) return;
                act({ action: 'cancel', reason });
              }}
              disabled={busy || !canDispatch || reviewLocked}
              className="btn btn-secondary"
              style={{ padding: '14px 28px', borderRadius: '8px', fontSize: '13.5px' }}
            >
              Cancel — False Alarm
            </button>
            {!canDispatch && (
              <span style={{ fontSize: '12.5px', color: 'var(--color-critical)' }}>
                Your role ({role}) cannot dispatch a recall. Switch to Duty Manager.
              </span>
            )}
          </div>
        </>
      )}

      {/* ══ LIVE DASHBOARD (DISPATCHED / ACTIVE) ══ */}
      {(crisis.status === 'ACTIVE' || crisis.status === 'DISPATCHED') && (
        <>
          <div className="glass" style={{ ...card, display: 'flex', gap: '36px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Counter n={counters.acknowledged} caption="Acknowledged" tone="ok" />
            <Counter n={counters.declined} caption="Declined" tone="warn" />
            <Counter n={counters.awaiting + counters.noResponse + counters.escalated} caption="No response yet" tone={counters.noResponse ? 'warn' : undefined} />
            <Counter n={counters.failed} caption="Failed to send" tone={counters.failed ? 'warn' : undefined} />
            <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '28px' }}>
              <Counter n={formatDuration(crisis.dispatchedAt || crisis.createdAt)} caption="Elapsed since dispatch" />
            </div>
          </div>


          <div className="glass" style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', margin: 0 }}>RESPONDERS</h2>
                <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Delivery and acknowledgement are tracked separately — a delivered message says nothing about whether anyone is coming. Acknowledgement
                  window: {ackWindowMinutes} minutes.
                </p>
              </div>
              {canClose && (
                <button onClick={() => setShowStandDown(true)} className="btn btn-primary" style={{ padding: '9px 20px', borderRadius: '6px', fontSize: '13px' }}>
                  Stand Down
                </button>
              )}
            </div>

            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Delivery</th>
                  <th>Acknowledgement</th>
                  <th>ETA</th>
                  <th>Reminders</th>
                  <th>Escalation</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => {
                  const needsCall = r.ackStatus === 'NO_RESPONSE' || r.ackStatus === 'ESCALATED';
                  const failed = r.deliveryStatus === 'FAILED' || r.deliveryStatus === 'EXHAUSTED';
                  return (
                    <tr key={r.id} style={{ background: needsCall || failed ? 'var(--color-critical-bg)' : undefined }}>
                      <td style={{ fontSize: '13px', fontWeight: 600 }}>
                        {r.name}
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontWeight: 400 }}>{r.mobile || 'no mobile'}</div>
                      </td>
                      <td>
                        <Pill
                          text={r.deliveryStatus}
                          tone={r.deliveryStatus === 'DELIVERED' ? 'ok' : failed ? 'warn' : 'muted'}
                        />
                        {r.failureReason && <div style={{ fontSize: '11px', color: 'var(--color-critical)', marginTop: '3px' }}>{r.failureReason}</div>}
                      </td>
                      <td>
                        <Pill
                          text={r.ackStatus.replace('_', ' ')}
                          tone={r.ackStatus === 'ACKNOWLEDGED' ? 'ok' : r.ackStatus === 'AWAITING' ? 'muted' : 'warn'}
                        />
                        {r.ackAt && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                            {new Date(r.ackAt).toLocaleTimeString()} · {r.ackMethod}
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: '12.5px' }}>{r.eta || '—'}</td>
                      <td style={{ fontSize: '12.5px' }}>{r.remindersSent ? `${r.remindersSent} sent` : '—'}</td>
                      <td style={{ fontSize: '12.5px' }}>{r.escalationLevel > 0 ? `Step ${r.escalationLevel}` : '—'}</td>
                      {/* Row-level actions appear ONLY on rows that need action
                          (build plan §6.3). A dashboard where every row has three
                          buttons is a dashboard nobody can scan under pressure. */}
                      <td style={{ textAlign: 'right' }}>
                        {canContact && needsCall && (
                          <button
                            onClick={() => act({ action: 'mark-contacted', recipientId: r.id }, `Mark ${r.name} as contacted and responding?\n\nUse this only after speaking to them directly.`)}
                            disabled={busy}
                            className="btn btn-secondary"
                            style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11.5px', marginRight: '5px' }}
                          >
                            Mark Contacted
                          </button>
                        )}
                        {canContact && failed && r.mobile && (
                          <button
                            onClick={() => act({ action: 'resend', recipientId: r.id })}
                            disabled={busy}
                            className="btn btn-secondary"
                            style={{ padding: '4px 12px', borderRadius: '6px', fontSize: '11.5px' }}
                          >
                            Resend
                          </button>
                        )}
                        {/* Stands in for the provider's delivery webhook, which the
                            prototype gateway does not have. */}
                        {r.deliveryStatus === 'SENT' && (
                          <button
                            onClick={() => act({ action: 'simulate-delivery', recipientId: r.id, status: 'DELIVERED' })}
                            disabled={busy}
                            className="btn btn-secondary"
                            style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '11px', opacity: 0.7 }}
                            title="Prototype only — simulates the provider delivery receipt"
                          >
                            ✓ receipt
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ══ AFTER-ACTION (STOOD_DOWN / CLOSED) ══ */}
      {(crisis.status === 'STOOD_DOWN' || crisis.status === 'CLOSED') && (
        <>
          <div className="glass" style={{ ...card, display: 'flex', gap: '36px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Counter n={`${counters.responseRatePct}%`} caption="Response rate" tone={counters.responseRatePct >= 80 ? 'ok' : 'warn'} />
            <Counter n={counters.acknowledged} caption="Acknowledged" tone="ok" />
            <Counter n={counters.declined} caption="Declined" />
            <Counter n={counters.noResponse + counters.escalated + counters.awaiting} caption="Never responded" tone="warn" />
            <Counter
              n={medianAckSeconds === null ? '—' : `${Math.floor(medianAckSeconds / 60)}m ${medianAckSeconds % 60}s`}
              caption="Median acknowledgement"
            />
            <Counter n={formatDuration(crisis.dispatchedAt || crisis.createdAt, crisis.standDownAt)} caption="Recall duration" />
          </div>

          <div className="glass" style={card}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', margin: '0 0 10px' }}>AFTER-ACTION REPORT</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: '12.5px', marginBottom: '16px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Stood down by</span> {crisis.standDownBy || '—'}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Reason</span> {crisis.standDownReason || '—'}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Dispatched by</span> {crisis.dispatchedBy || '—'}
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Recall groups</span> {crisis.resolvedGroupNames.join(', ') || '—'}
              </div>
              {crisis.closureNotes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Closure notes</span> {crisis.closureNotes}
                </div>
              )}
            </div>

            <h3 style={{ fontSize: '12.5px', fontWeight: 700, margin: '0 0 8px' }}>Non-responders</h3>
            {recipients.filter((r) => r.ackStatus !== 'ACKNOWLEDGED' && r.ackStatus !== 'DECLINED').length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Everyone responded.</p>
            ) : (
              <ul style={{ fontSize: '12.5px', marginLeft: '18px' }}>
                {recipients
                  .filter((r) => r.ackStatus !== 'ACKNOWLEDGED' && r.ackStatus !== 'DECLINED')
                  .map((r) => (
                    <li key={r.id}>
                      {r.name} — {r.mobile || 'no mobile'} ({r.deliveryStatus}
                      {r.failureReason ? `: ${r.failureReason}` : ''})
                    </li>
                  ))}
              </ul>
            )}

            <h3 style={{ fontSize: '12.5px', fontWeight: 700, margin: '16px 0 8px' }}>Member changes during the crisis</h3>
            {crisis.members.filter((m) => m.addedDuringCrisis || m.removed).length === 0 ? (
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>None — the dispatched list matched the resolved recall groups exactly.</p>
            ) : (
              <ul style={{ fontSize: '12.5px', marginLeft: '18px' }}>
                {crisis.members
                  .filter((m) => m.addedDuringCrisis || m.removed)
                  .map((m) => (
                    <li key={m.id}>
                      {m.removed
                        ? `${m.name} removed by ${m.removedBy} (${m.removalReason || 'no reason given'})`
                        : `${m.name} added by ${m.addedBy} — not a member of any recall group`}
                    </li>
                  ))}
              </ul>
            )}

            <h3 style={{ fontSize: '12.5px', fontWeight: 700, margin: '16px 0 8px' }}>Dispatch timeline</h3>
            <ul style={{ fontSize: '12.5px', marginLeft: '18px' }}>
              {dispatches.map((d) => (
                <li key={d.id}>
                  {new Date(d.triggeredAt).toLocaleString()} — {d.sequence} to {d.recipientCount} recipient(s) by {d.triggeredBy}
                </li>
              ))}
            </ul>

            {crisis.status === 'STOOD_DOWN' && canClose && (
              <button
                onClick={() => act({ action: 'close' }, 'Close this crisis record? The after-action report stays available.')}
                disabled={busy}
                className="btn btn-primary"
                style={{ padding: '9px 20px', borderRadius: '6px', fontSize: '13px', marginTop: '18px' }}
              >
                Close Crisis Record
              </button>
            )}
          </div>
        </>
      )}

      {/* Cancelled / superseded */}
      {(crisis.status === 'CANCELLED' || crisis.status === 'SUPERSEDED') && (
        <div className="glass" style={card}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', margin: '0 0 8px' }}>
            {crisis.status === 'CANCELLED' ? 'CANCELLED — FALSE ALARM' : 'SUPERSEDED'}
          </h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>
            {crisis.status === 'CANCELLED'
              ? `Cancelled by ${crisis.cancelledBy} at ${crisis.cancelledAt ? new Date(crisis.cancelledAt).toLocaleString() : '—'}. ${crisis.cancelReason || ''} No message was dispatched.`
              : crisis.linkageNote || 'The source incident no longer meets the crisis threshold.'}
          </p>
        </div>
      )}

      {/* Add recipient modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '520px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '17px', margin: '0 0 6px' }}>Add Recipient to This Crisis</h2>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Added to this crisis only. The master recall group is not modified, and this addition is flagged in the after-action report.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={label}>Name</label>
                <input style={input} value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
              </div>
              <div>
                <label style={label}>Mobile</label>
                <input style={input} value={newMember.mobile} onChange={(e) => setNewMember({ ...newMember, mobile: e.target.value })} placeholder="+6591234567" />
              </div>
              <div>
                <label style={label}>Role in this crisis (optional)</label>
                <input style={input} value={newMember.roleInGroup} onChange={(e) => setNewMember({ ...newMember, roleInGroup: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button onClick={() => setShowAdd(false)} className="btn btn-secondary" style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newMember.name.trim()) return alert('Name is required.');
                  await act({ action: 'add-member', ...newMember });
                  setNewMember({ name: '', mobile: '', email: '', roleInGroup: '' });
                  setShowAdd(false);
                }}
                disabled={busy}
                className="btn btn-primary"
                style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stand down modal */}
      {showStandDown && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '540px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '17px', margin: '0 0 6px' }}>Stand Down Crisis</h2>
            <p style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Everyone who was contacted should be told the recall is over — including people who declined, and people who never responded but may
              still be travelling in.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={label}>Reason</label>
                <select style={input} value={standDown.reason} onChange={(e) => setStandDown({ ...standDown, reason: e.target.value as StandDownReason })}>
                  <option value="Resolved">Resolved</option>
                  <option value="False alarm">False alarm</option>
                  <option value="Duplicate">Duplicate</option>
                </select>
              </div>
              <div>
                <label style={label}>Closure notes</label>
                <textarea style={{ ...input, minHeight: '80px' }} value={standDown.notes} onChange={(e) => setStandDown({ ...standDown, notes: e.target.value })} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                <input type="checkbox" checked={standDown.sendMessage} onChange={(e) => setStandDown({ ...standDown, sendMessage: e.target.checked })} />
                Send a stand-down message to all recipients
              </label>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button onClick={() => setShowStandDown(false)} className="btn btn-secondary" style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}>
                Cancel
              </button>
              <button
                onClick={async () => {
                  await act({ action: 'stand-down', ...standDown });
                  setShowStandDown(false);
                }}
                disabled={busy}
                className="btn btn-primary"
                style={{ padding: '8px 18px', borderRadius: '6px', fontSize: '12.5px' }}
              >
                Stand Down
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit trail */}
      {showAudit && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '740px', maxHeight: '80vh', overflowY: 'auto', padding: '24px', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '17px', margin: 0 }}>Crisis Audit Trail</h2>
              <button onClick={() => setShowAudit(false)} className="btn btn-secondary" style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px' }}>
                Close
              </button>
            </div>
            {audit.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No entries.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {audit.map((a) => (
                  <div key={a.id} style={{ padding: '10px 12px', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                      <span>{new Date(a.at).toLocaleString()}</span>
                      <span>{a.actor}</span>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '3px' }}>{a.action}</div>
                    <div style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>{a.details}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
