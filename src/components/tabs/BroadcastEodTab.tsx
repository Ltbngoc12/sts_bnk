'use client';

// Tab 2 of the merged Broadcasts page — "End-of-Day Interim" (day-centric
// night-by-night review). Rewritten 2026-07-26 per BROADCAST_MODULE_FSD_GAP_AND_UIUX_PLAN.md
// §6.6/§8 Phase 2:
//   - Day navigator (was a live "PENDING only" queue with no concept of night —
//     dispatch/left-pending items just vanished or blurred into the next batch).
//   - Shows EVERY record for the selected night (sent / not-sent-yet / not-sent —
//     no Reject action exists, decision D6: a PENDING record whose night has
//     passed reads as "not sent" on its own via BroadcastRecord.eodDate).
//   - Master–detail list (compact rows) instead of one ~450px card per item with
//     a permanently-open textarea (fixes U10 — 43 items used to mean ~19 screens
//     of scrolling).
//   - Bulk select + bulk dispatch with a confirmation modal.
//   - Header shows the configured cutover + last actual run for this specific
//     night (persisted via BroadcastConfig.lastEodRunPerDate — fixes G8's "dead
//     config" problem) and lazy-triggers the check once per day past cutover
//     instead of only running when someone remembers to click a button.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';
import {
  BroadcastRecordDTO, LevelDot, fmtDateTime, todayStr,
} from '@/components/broadcasts/broadcastUi';
import { BroadcastReviewCore } from '@/components/broadcasts/BroadcastReviewCore';
import { encodeIdPath } from '@/lib/broadcast';

interface IncidentLite {
  id: string;
  title: string;
  type: string;
  subType?: string;
  status: string;
  crisisLevel?: number;
  dateTime?: string;
  responders?: { status: string }[];
  log?: { date: string; time: string }[];
}

interface BroadcastConfigLite {
  endOfDayTime: string;
  lastEodRunAt?: string;
  lastEodRunPerDate?: Record<string, string>;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDdMm(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}`;
}

function openDurationLabel(dateTime?: string): string {
  if (!dateTime) return '—';
  const ms = Date.now() - new Date(dateTime).getTime();
  if (ms < 0) return '—';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function BroadcastEodTab() {
  const { role, username } = useRole();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canDispatch = hasBroadcastPermission(role, 'broadcast.dispatch');

  const date = searchParams.get('date') || todayStr();
  const setDate = (d: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'eod');
    params.set('date', d);
    router.replace(`/broadcasts?${params.toString()}`, { scroll: false });
  };

  const [items, setItems] = useState<BroadcastRecordDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [incidentMap, setIncidentMap] = useState<Record<string, IncidentLite>>({});
  const [config, setConfig] = useState<BroadcastConfigLite | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const lazyTriggeredRef = useRef<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/broadcast-config');
      if (res.ok) setConfig(await res.json());
    } catch { /* ignore */ }
  }, []);

  const loadItems = useCallback(async (forDate: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ paged: 'true', type: 'End-of-Day', eodDate: forDate, limit: '200' });
      const res = await fetch(`/api/broadcasts?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        const list: BroadcastRecordDTO[] = result.data || [];
        // Sort by crisis level ascending (Level 1 most severe first — T2.5).
        list.sort((a, b) => {
          const la = parseInt((a.crisisLevel || 'Level 5').replace(/\D/g, ''), 10) || 5;
          const lb = parseInt((b.crisisLevel || 'Level 5').replace(/\D/g, ''), 10) || 5;
          return la - lb;
        });
        setItems(list);
        setSelectedId((prev) => (prev && list.some((i) => i.id === prev)) ? prev : (list.find((i) => i.status === 'PENDING')?.id || list[0]?.id || null));

        const ids = Array.from(new Set(list.map((i) => i.incidentId).filter(Boolean)));
        const results = await Promise.all(ids.map(async (id) => {
          try {
            const r = await fetch(`/api/incidents/${encodeIdPath(id)}`);
            return r.ok ? await r.json() : null;
          } catch { return null; }
        }));
        const map: Record<string, IncidentLite> = {};
        ids.forEach((id, idx) => { if (results[idx]) map[id] = results[idx]; });
        setIncidentMap(map);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);
  useEffect(() => { loadItems(date); setChecked(new Set()); }, [date, loadItems]);

  const runCheck = useCallback(async () => {
    setRunning(true);
    try {
      await fetch('/api/cron/eod-broadcast');
      await Promise.all([loadItems(date), loadConfig()]);
    } finally {
      setRunning(false);
    }
  }, [date, loadItems, loadConfig]);

  // Lazy-trigger (fixes gap G8 — this deployment has no external scheduler).
  // Runs once per browser session per date: if viewing today, cutover has
  // passed, and the config shows no run yet for today, kick off the check
  // automatically instead of waiting for someone to remember the button.
  useEffect(() => {
    if (!config || date !== todayStr()) return;
    if (lazyTriggeredRef.current === date) return;
    const alreadyRan = !!config.lastEodRunPerDate?.[date];
    if (alreadyRan) { lazyTriggeredRef.current = date; return; }
    const [h, m] = (config.endOfDayTime || '20:00').split(':').map((x) => parseInt(x, 10));
    const cutover = new Date();
    cutover.setHours(h || 20, m || 0, 0, 0);
    if (Date.now() >= cutover.getTime()) {
      lazyTriggeredRef.current = date;
      runCheck();
    }
  }, [config, date, runCheck]);

  const selected = items.find((i) => i.id === selectedId) || null;
  const incident = selected ? incidentMap[selected.incidentId] : undefined;

  const sentCount = items.filter((i) => i.status === 'SENT').length;
  const notSentYetCount = items.filter((i) => i.status === 'PENDING' && date >= todayStr()).length;
  const notSentCount = items.filter((i) => i.status === 'PENDING' && date < todayStr()).length;
  const total = items.length || 1;

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearChecked = () => setChecked(new Set());

  const checkedItems = items.filter((i) => checked.has(i.id));

  const bulkDispatch = async () => {
    setBulkBusy(true);
    try {
      await Promise.all(checkedItems.map((i) =>
        fetch(`/api/broadcasts/${encodeIdPath(i.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dispatch', recipients: i.recipients, content: i.contentDispatched, role, user: username }),
        })
      ));
      setShowBulkConfirm(false);
      clearChecked();
      await loadItems(date);
    } finally {
      setBulkBusy(false);
    }
  };

  const lastRun = config?.lastEodRunPerDate?.[date];
  const cutover = config?.endOfDayTime || '20:00';
  const isToday = date === todayStr();
  const isPast = date < todayStr();

  return (
    <>
      {/* Day navigator */}
      <div className="glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button type="button" onClick={() => setDate(shiftDate(date, -1))} className="btn btn-secondary btn-sm" style={{ padding: '0 10px' }}>‹</button>
          {[-1, 0, 1].map((offset) => {
            const d = shiftDate(date, offset);
            const isSel = d === date;
            const isFuture = d > todayStr();
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className="btn"
                style={{
                  height: 32, padding: '0 14px', fontSize: 12.5, fontWeight: 600, borderRadius: 'var(--radius-md)',
                  background: isSel ? 'var(--color-primary)' : 'transparent',
                  color: isSel ? '#fff' : (isFuture ? 'var(--text-faint)' : 'var(--text-sub, var(--text-main))'),
                  border: '1px solid transparent',
                }}
              >
                {fmtDdMm(d)}{d === todayStr() ? ' · Today' : ''}
              </button>
            );
          })}
          <button type="button" onClick={() => setDate(shiftDate(date, 1))} className="btn btn-secondary btn-sm" style={{ padding: '0 10px' }}>›</button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-control" style={{ width: 'auto', height: 32, fontSize: 12.5, marginLeft: 6 }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Cutover <b style={{ color: 'var(--text-main)' }}>{cutover}</b>
          {lastRun && <> · last ran <b style={{ color: 'var(--text-main)' }}>{fmtDdMm(lastRun.slice(0, 10))} {fmtDateTime(lastRun).slice(11)}</b></>}
        </div>
        {canDispatch && (
          <button type="button" onClick={runCheck} disabled={running} className="btn btn-secondary btn-sm">
            {running ? 'Running…' : '⟳ Re-run check'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div className="glass" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, height: 9, borderRadius: 20, background: 'var(--color-closed-bg)', overflow: 'hidden', display: 'flex' }}>
            <span style={{ display: 'block', height: '100%', width: `${(sentCount / total) * 100}%`, background: 'var(--color-active)' }} />
            <span style={{ display: 'block', height: '100%', width: `${(notSentYetCount / total) * 100}%`, background: 'var(--color-high)' }} />
          </div>
          <div style={{ display: 'flex', gap: 14, fontSize: 12, fontWeight: 600, flexWrap: 'wrap' }}>
            <span><i style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: 'var(--color-active)', marginRight: 5 }} />{sentCount} sent</span>
            {notSentYetCount > 0 && <span><i style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: 'var(--color-high)', marginRight: 5 }} />{notSentYetCount} not sent yet <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>(night still open)</span></span>}
            {notSentCount > 0 && <span><i style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: 'var(--color-closed)', marginRight: 5 }} />{notSentCount} not sent</span>}
          </div>
        </div>
      )}

      {/* Bulk bar */}
      {checked.size > 0 && (
        <div className="glass" style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-primary-dark)', color: '#fff' }}>
          <span>☑ <b>{checked.size}</b> selected</span>
          <button type="button" onClick={() => setShowBulkConfirm(true)} className="btn btn-primary btn-sm">Send {checked.size} selected →</button>
          <span onClick={clearChecked} style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.72)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textDecoration: 'underline' }}>Deselect all</span>
        </div>
      )}

      {loading ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="glass" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{lastRun ? '✅' : '🕒'}</div>
          {lastRun
            ? `End-of-day check ran at ${fmtDateTime(lastRun).slice(11)} — no incidents needed review for the night of ${fmtDdMm(date)}.`
            : (isPast ? `The end-of-day check never ran for the night of ${fmtDdMm(date)}.` : `End-of-day check hasn't run yet — cutover at ${cutover}.`)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '344px 1fr', gap: 16, alignItems: 'start' }}>
          <div className="glass" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-inset)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <span>Sort: Level ↓</span>
            </div>
            {items.map((b) => {
              const inc = incidentMap[b.incidentId];
              const isSent = b.status === 'SENT';
              const isExpired = !isSent && date < todayStr(); // D6 — lapsed night, "not sent"
              const isSelected = b.id === selectedId;
              const canCheck = !isSent && !isExpired && b.status === 'PENDING';
              const iconColor = isSent ? 'var(--color-active)' : isExpired ? 'var(--text-faint)' : 'var(--color-high)';
              const icon = isSent ? '✓' : isExpired ? '○' : '⊙';
              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedId(b.id)}
                  style={{
                    display: 'flex', gap: 10, padding: '11px 12px', borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer', alignItems: 'flex-start',
                    background: isSelected ? 'var(--color-primary-bg)' : undefined,
                    boxShadow: isSelected ? 'inset 3px 0 0 var(--color-primary)' : undefined,
                    opacity: (isSent || isExpired) ? 0.55 : 1,
                  }}
                >
                  {canCheck ? (
                    <input type="checkbox" checked={checked.has(b.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(b.id)} style={{ marginTop: 3, accentColor: 'var(--color-primary)', width: 14, height: 14 }} />
                  ) : (
                    <span style={{ width: 14 }} />
                  )}
                  <span style={{ fontSize: 13, width: 14, flex: '0 0 14px', textAlign: 'center', paddingTop: 2, color: iconColor }}>
                    {icon}
                  </span>
                  <LevelDot level={b.crisisLevel} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5, lineHeight: 1.35 }}>{b.incidentTitle || b.incidentId}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.45 }}>
                      {b.incidentType || ''}{inc ? ` · ${inc.status}` : ''}
                      {isSent
                        ? <><br />Sent <b>{fmtDateTime(b.dispatchedAt || b.sentAt).slice(11)}</b> · {b.dispatchedBy || b.sentBy}</>
                        : isExpired
                        ? <><br />Not sent — night has passed</>
                        : <><br />Open <b>{openDurationLabel(inc?.dateTime)}</b> · {b.recipients?.length ?? 0} recipients · {b.recipientGroups?.[0] || ''}</>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="glass" style={{ padding: 0 }}>
            {!selected ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Select an item from the list on the left.</div>
            ) : (
              <>
                <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{selected.id} · {selected.incidentId}</div>
                  <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{selected.incidentTitle || selected.incidentId}</h2>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: 'var(--text-sub, var(--text-main))', fontWeight: 500 }}>
                    <LevelDot level={selected.crisisLevel} />
                    <span>{selected.incidentType}{selected.incidentSubType ? ` — ${selected.incidentSubType}` : ''}</span>
                    {incident && <><span style={{ color: 'var(--border-color)' }}>|</span><span className="badge badge-onsite">{incident.status}</span></>}
                    {incident && <><span style={{ color: 'var(--border-color)' }}>|</span><span>Open <b>{openDurationLabel(incident.dateTime)}</b></span></>}
                    {incident?.responders && <><span style={{ color: 'var(--border-color)' }}>|</span><span>{incident.responders.filter((r) => r.status === 'Active').length} Responder active</span></>}
                  </div>
                </div>
                <div style={{ padding: '16px 18px', maxHeight: 520, overflow: 'auto' }}>
                  <BroadcastReviewCore
                    bc={selected}
                    role={role}
                    username={username}
                    canDispatch={canDispatch}
                    onDispatched={() => loadItems(date)}
                    editTabLabel="Edit"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showBulkConfirm && (
        <div className="modal-overlay" onClick={() => !bulkBusy && setShowBulkConfirm(false)}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Send {checkedItems.length} broadcast{checkedItems.length === 1 ? '' : 's'}?</h2>
            <ul style={{ maxHeight: 220, overflow: 'auto', margin: '0 0 16px', padding: 0, listStyle: 'none' }}>
              {checkedItems.map((i) => (
                <li key={i.id} style={{ fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <b>{i.incidentTitle || i.incidentId}</b> · {i.recipients?.length ?? 0} recipients
                </li>
              ))}
            </ul>
            <div className="modal-actions">
              <button type="button" onClick={() => setShowBulkConfirm(false)} disabled={bulkBusy} className="btn btn-secondary">Cancel</button>
              <button type="button" onClick={bulkDispatch} disabled={bulkBusy} className="btn btn-primary">{bulkBusy ? 'Sending…' : `Send ${checkedItems.length} →`}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
