'use client';

// Content viewer/editor — Preview / Source(or Edit) tabs.
//
// Fixes the typography half of gap U4/U6/U17: the old panel rendered content as
// `<pre style={{fontFamily: monospace, fontSize: 11.5px}}>` regardless of context
// — a reviewer diffing "does this email look right" was reading raw template
// source, not what the recipient would see. Preview now renders as an actual
// email-style card (Inter 13.5px, ~70ch measure, line-height 1.6, real Subject
// line) — Source/Edit keeps the monospace view since that IS an editing surface
// where exact whitespace matters.
//
// The Diff tab (queue-time snapshot vs. current draft) was removed 2026-07-27
// per Kyle's request — the "Content edited from default" callout in the Edit
// tab already surfaces the confirmation checkbox (§10.4d), so the separate
// diff view was redundant.

import React, { useState } from 'react';

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
  const [tab, setTab] = useState<'preview' | 'edit'>('preview');
  const baseline = defaultContent ?? value;
  const changed = value.trim() !== baseline.trim();

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
    </div>
  );
}
