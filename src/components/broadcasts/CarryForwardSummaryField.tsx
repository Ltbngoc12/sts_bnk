'use client';

// US-BC-01 — small free-text box on the End-of-Day Interim review screen for the
// Duty Manager to note why an incident is carrying forward to the next day,
// without opening the full Edit tab. Mirrors RecipientChips' controlled-field
// pattern (value/editable/onChange from the parent) rather than owning its own
// persistence — like Recipients and Content, this is only actually saved when
// BroadcastReviewCore's dispatch() call goes out (see its carryForwardSummary
// state comment).

import React from 'react';

const MAX_LENGTH = 400;

export function CarryForwardSummaryField({
  value,
  editable,
  onChange,
}: {
  value: string;
  editable: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
          Carry-Forward Summary
        </h3>
        {editable && (
          <span style={{ fontSize: 11, color: value.length >= MAX_LENGTH ? 'var(--color-high)' : 'var(--text-faint)' }}>
            {value.length} / {MAX_LENGTH}
          </span>
        )}
      </div>

      {editable ? (
        <>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, MAX_LENGTH))}
            maxLength={MAX_LENGTH}
            rows={2}
            placeholder="Why is this incident still open going into tomorrow? (optional)"
            className="form-control"
            style={{ fontSize: 12.5, resize: 'vertical' }}
          />
          <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Optional. Feeds the &quot;Summary of progress to date&quot; line in the broadcast content below — leaving it blank keeps today&apos;s default.
          </p>
        </>
      ) : (
        <p style={{ fontSize: 12.5, margin: 0, color: value ? 'var(--text-main)' : 'var(--text-faint)', fontWeight: value ? 500 : 400 }}>
          {value || '—'}
        </p>
      )}
    </div>
  );
}
