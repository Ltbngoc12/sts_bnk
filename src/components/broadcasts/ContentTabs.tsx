'use client';

// Content viewer/editor — Preview / Source(or Edit) / Diff tabs.
//
// Fixes the typography half of gap U4/U6/U17: the old panel rendered content as
// `<pre style={{fontFamily: monospace, fontSize: 11.5px}}>` regardless of context
// — a reviewer diffing "does this email look right" was reading raw template
// source, not what the recipient would see. Preview now renders as an actual
// email-style card (Inter 13.5px, ~70ch measure, line-height 1.6, real Subject
// line) — Source/Edit keeps the monospace view since that IS an editing surface
// where exact whitespace matters.
//
// Diff (fixes gap G6 — the old confirmation checkbox had nothing to diff
// against because contentDispatched was overwritten at dispatch time and the
// original default was lost) compares contentDefault (queue-time snapshot,
// preserved forever) against the current draft with a small LCS line diff.

import React, { useState } from 'react';

type Line = { type: 'same' | 'del' | 'add'; text: string };

function diffLines(a: string[], b: string[]): Line[] {
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: Line[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { result.push({ type: 'same', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { result.push({ type: 'del', text: a[i] }); i++; }
    else { result.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { result.push({ type: 'del', text: a[i] }); i++; }
  while (j < m) { result.push({ type: 'add', text: b[j] }); j++; }
  return result;
}

export function ContentTabs({
  subject,
  defaultContent,
  value,
  editable,
  onChange,
  confirmChecked,
  onConfirmChange,
  editTabLabel = 'Edit',
}: {
  subject?: string;
  defaultContent?: string;
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  confirmChecked: boolean;
  onConfirmChange: (v: boolean) => void;
  editTabLabel?: string;
}) {
  const [tab, setTab] = useState<'preview' | 'edit' | 'diff'>('preview');
  const baseline = defaultContent ?? value;
  const changed = value.trim() !== baseline.trim();
  const diff = tab === 'diff' ? diffLines(baseline.split('\n'), value.split('\n')) : [];

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      style={{
        background: 'transparent', border: 'none',
        borderBottom: tab === key ? '2px solid var(--color-primary)' : '2px solid transparent',
        color: tab === key ? 'var(--color-primary)' : 'var(--text-muted)',
        padding: '7px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
        fontFamily: 'var(--font-body, inherit)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border-color)' }}>
        {tabBtn('preview', 'Preview')}
        {tabBtn('edit', editable ? editTabLabel : 'Source')}
        {tabBtn('diff', changed ? 'Diff (edited)' : 'Diff')}
      </div>

      {tab === 'preview' && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#fff' }}>
          {subject && (
            <div style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)', padding: '10px 14px', fontSize: 12.5, fontWeight: 700 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>
                Subject
              </div>
              {subject}
            </div>
          )}
          <div style={{ padding: 14, fontSize: 13.5, lineHeight: 1.62, maxWidth: '70ch', whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>
            {value}
          </div>
        </div>
      )}

      {tab === 'edit' && (
        editable ? (
          <div>
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={10}
              className="form-control"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            {changed && (
              <div style={{ background: 'var(--color-high-bg)', border: '1px solid var(--color-high-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', marginTop: 10 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#9A3412', marginBottom: 4 }}>
                  Content edited from default (§10.4d)
                </div>
                <label style={{ display: 'flex', gap: 7, alignItems: 'flex-start', cursor: 'pointer', lineHeight: 1.45, fontSize: 12 }}>
                  <input type="checkbox" checked={confirmChecked} onChange={(e) => onConfirmChange(e.target.checked)} style={{ marginTop: 2 }} />
                  I confirm this edited content does not include operationally sensitive, under-investigation, or restricted information beyond the standard template — or I am authorised to include it.
                </label>
              </div>
            )}
          </div>
        ) : (
          <pre style={{
            whiteSpace: 'pre-wrap', fontSize: 11.5, fontFamily: 'var(--font-mono)',
            background: 'var(--bg-inset)', border: '1px solid var(--border-color)',
            padding: 12, borderRadius: 'var(--radius-md)', margin: 0, lineHeight: 1.5, color: 'var(--text-main)',
          }}>
            {value}
          </pre>
        )
      )}

      {tab === 'diff' && (
        <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: 12, background: '#fff' }}>
          {!changed ? (
            <div style={{ color: 'var(--text-faint)', fontSize: 12.5 }}>No changes from the default.</div>
          ) : (
            diff.map((l, idx) => (
              <div
                key={idx}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.7,
                  padding: '1px 6px', borderRadius: 3,
                  background: l.type === 'del' ? 'var(--color-critical-bg)' : l.type === 'add' ? 'var(--color-active-bg)' : 'transparent',
                  color: l.type === 'del' ? '#991B1B' : l.type === 'add' ? '#065F46' : 'var(--text-main)',
                  textDecoration: l.type === 'del' ? 'line-through' : 'none',
                }}
              >
                {l.type === 'del' ? '− ' : l.type === 'add' ? '+ ' : '  '}{l.text || ' '}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
