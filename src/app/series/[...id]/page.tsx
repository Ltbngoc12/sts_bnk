'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Task, RecurrenceConfig, RecurrenceSeries } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { taskBadgeClass, isControllerPlus } from '@/lib/taskHelpers';
import { RecurrenceScheduleField, recurrenceSummary } from '@/components/RecurrenceScheduleField';

interface SeriesResponse {
  series: RecurrenceSeries;
  occurrences: Task[];
  summary?: string;
}

const fmtDate = (d?: string) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default function SeriesDetailPage() {
  const params = useParams();
  const idArray = (params?.id as string[]) || [];
  const seriesId = idArray.join('/');

  const { role, username } = useRole();
  const canControl = isControllerPlus(role);

  const [data, setData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RecurrenceConfig | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/series/${seriesId}`);
      if (res.ok) setData(await res.json());
      else setError('Series not found.');
    } catch {
      setError('Failed to load series.');
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  const series = data?.series;
  const isActive = series?.status === 'Active';

  const startEdit = () => { if (series) { setDraft({ ...series.config }); setEditing(true); setToast(''); } };
  const cancelEdit = () => { setEditing(false); setDraft(null); };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/series/${seriesId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'edit-series', config: draft, actor: username, role }),
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || 'Failed to save.'); return; }
      setData({ series: body.series, occurrences: body.occurrences });
      const r = body.reconcile;
      setToast(`Saved. Effective ${r.effectiveDate}: ${r.generated} generated, ${r.softDeleted} removed, ${r.kept} kept.`);
      setEditing(false);
      setDraft(null);
    } catch {
      setError('Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="series-page"><div className="glass" style={{ padding: 24 }}>Loading…</div></div>;
  if (error && !series) return <div className="series-page"><div className="glass" style={{ padding: 24 }}>{error}</div></div>;
  if (!series) return null;

  const cfg = series.config;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="series-page">
      {/* Header */}
      <div className="glass" style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link href="/case-management?tab=tasks" style={{ color: 'var(--text-faint)', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>← BACK TO TASK BOARD</Link>
            <span style={{ color: 'var(--text-faint)' }}>&bull;</span>
            <span className="mono-id" style={{ fontSize: 11, padding: '1px 6px' }}>Series: {series.id}</span>
            <Link href={`/cases/${series.caseId}`} className="mono-id" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)', borderColor: 'var(--color-info-border)', fontSize: 11, padding: '1px 6px', textDecoration: 'none' }}>Case: {series.caseId}</Link>
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>🔁 {series.taskTemplate.title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${series.status === 'Active' ? 'badge-onsite' : series.status === 'Cancelled' ? 'badge-closed' : 'badge-info'}`}>{series.status}</span>
          {!editing && canControl && isActive && (
            <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit template</button>
          )}
        </div>
      </div>

      {toast && <div className="series-toast">{toast}</div>}
      {error && <div className="series-err">{error}</div>}

      <div className="series-grid">
        {/* Template / edit */}
        <div className="glass sr-card">
          <div className="sr-head"><h3>🔁 RECURRENCE TEMPLATE</h3></div>
          <p className="sr-note">Each planned date becomes a separate task with its own lifecycle. Editing takes effect from tomorrow onward — occurrences already worked on are kept.</p>

          {editing ? (
            <>
              <RecurrenceScheduleField value={draft} onChange={(v) => setDraft(v || draft)} />
              <div className="sr-actions">
                <button className="btn btn-secondary" onClick={cancelEdit} disabled={busy}>Cancel</button>
                <button className="btn btn-primary" onClick={save} disabled={busy}>Save changes</button>
              </div>
            </>
          ) : (
            <div className="sr-meta">
              <div className="sr-item"><span>Summary</span><strong>{recurrenceSummary(cfg)}</strong></div>
              <div className="sr-item"><span>Frequency</span><strong>{cfg.frequency}</strong></div>
              {cfg.frequency === 'Weekly' && <div className="sr-item"><span>Repeat on</span><strong>{(cfg.weekdays || []).join(', ') || '—'}</strong></div>}
              {cfg.frequency === 'Monthly' && <div className="sr-item"><span>Day of month</span><strong>{cfg.monthlyDay}</strong></div>}
              <div className="sr-item"><span>Start</span><strong>{cfg.startDate}{cfg.dueTime ? ` ${cfg.dueTime}` : ''}</strong></div>
              <div className="sr-item"><span>Ends</span><strong>
                {cfg.endType === 'never' && 'Never'}
                {cfg.endType === 'onDate' && `On ${cfg.endDate}`}
                {cfg.endType === 'afterCount' && `After ${cfg.occurrenceCount} occurrences`}
              </strong></div>
              <div className="sr-item"><span>Lead time</span><strong>{cfg.leadTimeDays} days</strong></div>
              <div className="sr-item"><span>Assignee</span><strong>{series.taskTemplate.assignee}{series.taskTemplate.assigneeType === 'group' ? ' (group)' : ''}</strong></div>
            </div>
          )}
        </div>

        {/* Occurrences */}
        <div className="glass sr-card">
          <div className="sr-head"><h3>📅 OCCURRENCES <span className="sr-count">{data?.occurrences.length || 0}</span></h3></div>
          {(!data || data.occurrences.length === 0) ? (
            <p className="sr-note">No occurrences generated yet.</p>
          ) : (
            <div className="sr-occ-list">
              {data.occurrences.map(o => {
                const isPast = !!o.occurrenceDate && o.occurrenceDate < today;
                const isFrozen = !!o.occurrenceDate && o.occurrenceDate <= today;
                return (
                  <Link key={o.id} href={`/tasks/${o.id}`} className="sr-occ-row">
                    <span className={`sr-occ-dot ${isPast ? 'past' : ''}`} />
                    <span className="sr-occ-date">{fmtDate(o.occurrenceDate)}</span>
                    <span className={`badge ${taskBadgeClass(o.status)} sr-occ-badge`}>{o.status}</span>
                    {o.detachedFromSeries && <span className="sr-occ-tag">Detached</span>}
                    {isFrozen && <span className="sr-occ-frozen" title="On/before today — frozen from template edits">frozen</span>}
                    <span className="sr-occ-id">{o.id.split('/').pop()}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .series-page { display: flex; flex-direction: column; gap: 16px; padding: 16px 20px; }
        .series-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        @media (max-width: 900px) { .series-grid { grid-template-columns: 1fr; } }
        .sr-card { padding: 18px 20px; }
        .sr-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .sr-head h3 { font-size: 12px; font-weight: 700; letter-spacing: .05em; color: var(--color-primary-dark, #b45309); margin: 0; display: flex; align-items: center; gap: 8px; }
        .sr-count { background: var(--color-primary-bg); color: var(--color-primary-dark); border-radius: 10px; padding: 1px 8px; font-size: 11px; }
        .sr-note { font-size: 12px; color: var(--text-muted); margin: 0 0 14px; line-height: 1.5; }
        .sr-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
        .sr-item { display: flex; flex-direction: column; gap: 2px; }
        .sr-item span { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); }
        .sr-item strong { font-size: 13.5px; color: var(--text-main); font-weight: 600; }
        .sr-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
        .sr-occ-list { display: flex; flex-direction: column; }
        .sr-occ-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid var(--border-color); text-decoration: none; color: inherit; }
        .sr-occ-row:hover { background: var(--color-primary-bg); }
        .sr-occ-row:last-child { border-bottom: none; }
        .sr-occ-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-primary); flex: none; }
        .sr-occ-dot.past { background: var(--border-color-hover); }
        .sr-occ-date { font-size: 13px; font-weight: 600; color: var(--text-main); min-width: 165px; font-variant-numeric: tabular-nums; }
        .sr-occ-badge { font-size: 10.5px; }
        .sr-occ-tag { font-size: 10px; font-weight: 700; color: var(--color-critical); background: var(--color-critical-bg); border-radius: 8px; padding: 1px 6px; }
        .sr-occ-frozen { font-size: 10px; font-weight: 600; color: var(--text-muted); border: 1px dashed var(--border-color-hover); border-radius: 8px; padding: 0 6px; }
        .sr-occ-id { margin-left: auto; font-size: 11px; color: var(--text-faint); font-family: var(--font-mono, monospace); }
        .series-toast { background: var(--color-success-bg, #ecfdf5); color: var(--color-success, #047857); border: 1px solid var(--color-success-border, #a7f3d0); border-radius: 8px; padding: 10px 14px; font-size: 13px; font-weight: 500; }
        .series-err { background: var(--color-critical-bg); color: var(--color-critical); border: 1px solid var(--color-critical-border); border-radius: 8px; padding: 10px 14px; font-size: 13px; }
      `}</style>
    </div>
  );
}
