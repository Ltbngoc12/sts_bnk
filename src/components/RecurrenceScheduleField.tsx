'use client';

import React, { useMemo } from 'react';
import { RecurrenceConfig, RecurrenceFrequency, Weekday } from '@/lib/db';
import { defaultRecurrence, previewOccurrences, recurrenceSummary, pad } from '@/lib/recurrence';

// Re-export shared logic so existing imports from this component keep working.
export { defaultRecurrence, previewOccurrences, recurrenceSummary } from '@/lib/recurrence';

const WEEKDAYS: Weekday[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WD_SHORT: Record<Weekday, string> = { Mon: 'Mo', Tue: 'Tu', Wed: 'We', Thu: 'Th', Fri: 'Fr', Sat: 'Sa', Sun: 'Su' };
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  value: RecurrenceConfig | null;
  onChange: (v: RecurrenceConfig | null) => void;
}

export function RecurrenceScheduleField({ value, onChange }: Props) {
  const enabled = value != null;
  const cfg = value;

  const set = (patch: Partial<RecurrenceConfig>) => { if (cfg) onChange({ ...cfg, ...patch }); };
  const toggle = () => onChange(enabled ? null : defaultRecurrence());

  const weeklyInvalid = !!cfg && cfg.frequency === 'Weekly' && (cfg.weekdays || []).length === 0;
  const occ = useMemo(() => (cfg && !weeklyInvalid ? previewOccurrences(cfg) : []), [cfg, weeklyInvalid]);

  return (
    <div className="recur-field">
      <div className={`recur-toggle ${enabled ? 'on' : ''}`} onClick={toggle} role="switch" aria-checked={enabled}>
        <span className="recur-switch" />
        <strong>Repeat this task</strong>
        <span className="recur-hint-inline">Create recurring occurrences (FRD 7.1.2)</span>
      </div>

      {enabled && cfg && (
        <div className="recur-box">
          {/* Frequency */}
          <div className="form-group">
            <label>Frequency</label>
            <div className="recur-seg">
              {(['Daily', 'Weekly', 'Monthly'] as RecurrenceFrequency[]).map(f => (
                <button type="button" key={f} className={cfg.frequency === f ? 'active' : ''} onClick={() => set({ frequency: f })}>{f}</button>
              ))}
            </div>
          </div>

          {/* Weekly weekday picker */}
          {cfg.frequency === 'Weekly' && (
            <div className="form-group">
              <label>Repeat on</label>
              <div className="recur-chips">
                {WEEKDAYS.map(w => {
                  const active = (cfg.weekdays || []).includes(w);
                  return (
                    <button type="button" key={w} className={`recur-chip ${active ? 'active' : ''}`}
                      onClick={() => {
                        const cur = new Set(cfg.weekdays || []);
                        if (cur.has(w)) cur.delete(w); else cur.add(w);
                        set({ weekdays: WEEKDAYS.filter(x => cur.has(x)) });
                      }}>{WD_SHORT[w]}</button>
                  );
                })}
              </div>
              {weeklyInvalid && <div className="recur-err">Select at least one day.</div>}
            </div>
          )}

          {/* Monthly day-of-month */}
          {cfg.frequency === 'Monthly' && (
            <div className="form-group">
              <label>Day of month</label>
              <input type="number" min={1} max={31} value={cfg.monthlyDay ?? 1}
                onChange={e => set({ monthlyDay: Math.min(31, Math.max(1, parseInt(e.target.value || '1', 10))) })}
                className="form-control" style={{ maxWidth: 100 }} />
              <div className="recur-note">Day 29–31 falls back to the last day in shorter months.</div>
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label>Start Date</label>
              <input type="date" value={cfg.startDate} onChange={e => set({ startDate: e.target.value })} className="form-control" />
            </div>
            <div className="form-group">
              <label>Time</label>
              <input type="time" value={cfg.dueTime || ''} onChange={e => set({ dueTime: e.target.value })} className="form-control" />
            </div>
          </div>

          {/* End condition */}
          <div className="form-group">
            <label>Ends</label>
            <div className="recur-radio">
              <label><input type="radio" name="recur-end" checked={cfg.endType === 'onDate'} onChange={() => set({ endType: 'onDate' })} /> On date</label>
              <input type="date" value={cfg.endDate || ''} disabled={cfg.endType !== 'onDate'}
                onChange={e => set({ endDate: e.target.value })} className="form-control" style={{ maxWidth: 170 }} />
            </div>
            <div className="recur-radio">
              <label><input type="radio" name="recur-end" checked={cfg.endType === 'afterCount'} onChange={() => set({ endType: 'afterCount' })} /> After</label>
              <input type="number" min={1} value={cfg.occurrenceCount ?? 1} disabled={cfg.endType !== 'afterCount'}
                onChange={e => set({ occurrenceCount: Math.max(1, parseInt(e.target.value || '1', 10)) })} className="form-control" style={{ width: 80 }} />
              <span className="recur-suffix">occurrences</span>
            </div>
          </div>

          {/* Lead time */}
          <div className="form-group">
            <label>Generate Ahead (Lead Time)</label>
            <div className="recur-inline">
              <input type="number" min={0} value={cfg.leadTimeDays}
                onChange={e => set({ leadTimeDays: Math.max(0, parseInt(e.target.value || '0', 10)) })} className="form-control" style={{ width: 80 }} />
              <span className="recur-suffix">days</span>
            </div>
            <div className="recur-note">Only occurrences within this window are created now; the rest stay as a template.</div>
          </div>

          {/* Live preview */}
          <div className="recur-preview">
            <div className="recur-preview-head">
              <span>Will generate now</span>
              <span>{weeklyInvalid ? '' : `${occ.length} task${occ.length !== 1 ? 's' : ''}${cfg.endType === 'never' ? ' · ongoing' : ''}`}</span>
            </div>
            {weeklyInvalid
              ? <span className="recur-note">Select a day to preview.</span>
              : (
                <div>
                  {occ.slice(0, 8).map((d, i) => (
                    <span className="recur-pill" key={i}>{pad(d.getDate())}/{pad(d.getMonth() + 1)} ({DAY_NAME[d.getDay()]})</span>
                  ))}
                  {occ.length > 8 && <span className="recur-pill more">+{occ.length - 8} more…</span>}
                  {occ.length === 0 && <span className="recur-note">No occurrences in window.</span>}
                </div>
              )}
          </div>
        </div>
      )}

      <style jsx>{`
        .recur-field { margin-bottom: 4px; }
        .recur-toggle { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 4px 0; }
        .recur-toggle strong { font-size: 13.5px; font-weight: 600; color: var(--text-main); }
        .recur-hint-inline { font-size: 11.5px; color: var(--text-muted); }
        .recur-switch { position: relative; width: 40px; height: 22px; background: var(--border-color-hover); border-radius: 11px; transition: background .2s; flex: none; }
        .recur-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; background: #fff; border-radius: 50%; transition: transform .2s; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
        .recur-toggle.on .recur-switch { background: var(--color-primary); }
        .recur-toggle.on .recur-switch::after { transform: translateX(18px); }
        .recur-box { border: 1px dashed var(--color-primary-border); background: var(--color-primary-bg); border-radius: var(--radius-md); padding: 16px; margin-top: 8px; }
        .recur-seg { display: inline-flex; border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; background: #fff; }
        .recur-seg button { border: none; background: #fff; padding: 8px 16px; font-family: inherit; font-size: 13px; font-weight: 600; color: var(--text-sub); cursor: pointer; border-right: 1px solid var(--border-color); transition: .15s; }
        .recur-seg button:last-child { border-right: none; }
        .recur-seg button.active { background: var(--color-primary-bg); color: var(--color-primary-dark); }
        .recur-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .recur-chip { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--border-color); background: #fff; font-family: inherit; font-size: 12px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: .15s; }
        .recur-chip.active { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
        .recur-radio { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-size: 13.5px; color: var(--text-main); }
        .recur-radio label { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13.5px; font-weight: 500; text-transform: none; color: var(--text-main); cursor: pointer; }
        .recur-radio input[type=radio] { accent-color: var(--color-primary); }
        .recur-inline { display: flex; align-items: center; gap: 8px; }
        .recur-suffix { font-size: 12.5px; color: var(--text-sub); }
        .recur-note { font-size: 11.5px; color: var(--text-muted); margin-top: 4px; display: block; }
        .recur-err { color: var(--color-critical); font-size: 11.5px; margin-top: 5px; }
        .recur-preview { margin-top: 14px; border-top: 1px solid var(--color-primary-border); padding-top: 12px; }
        .recur-preview-head { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--text-sub); margin-bottom: 8px; }
        .recur-pill { display: inline-block; background: #fff; border: 1px solid var(--color-primary-border); border-radius: 20px; padding: 3px 10px; font-size: 11.5px; color: var(--text-main); margin: 0 5px 5px 0; font-variant-numeric: tabular-nums; }
        .recur-pill.more { color: var(--text-muted); border-style: dashed; }
      `}</style>
    </div>
  );
}
