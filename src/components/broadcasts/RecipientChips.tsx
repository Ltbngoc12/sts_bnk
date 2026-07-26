'use client';

// Recipient editor — chips instead of a raw comma-separated <textarea> (fixes
// UX gap U5). Tracks which emails were added beyond the resolved default and
// which were removed from it, and offers "restore default" to undo both in one
// click, per FSD §10.3d (Controller/DM may add/remove recipients before dispatch
// without changing the underlying group configuration).

import React, { useState } from 'react';

export function RecipientChips({
  value,
  defaultValue,
  editable,
  onChange,
}: {
  value: string[];
  defaultValue: string[];
  editable: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const added = value.filter((e) => !defaultValue.includes(e));
  const removed = defaultValue.filter((e) => !value.includes(e));

  const addEmail = () => {
    const email = draft.trim();
    if (!email) return;
    if (!value.includes(email)) onChange([...value, email]);
    setDraft('');
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((e) => e !== email));
  };

  const restoreDefault = () => onChange([...defaultValue]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0' }}>
        {value.length === 0 ? (
          <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>No recipients yet.</span>
        ) : (
          value.map((email) => {
            const isAdded = !defaultValue.includes(email);
            return (
              <span
                key={email}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: isAdded ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                  border: `1px solid ${isAdded ? 'var(--color-primary-border)' : 'var(--border-color)'}`,
                  color: isAdded ? 'var(--color-primary-dark)' : 'var(--text-main)',
                  borderRadius: 20, padding: '4px 10px', fontSize: 12, fontWeight: 500,
                  margin: '0 6px 6px 0',
                }}
              >
                {email}
                {editable && (
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontWeight: 700, fontSize: 13, lineHeight: 1, padding: 0 }}
                    aria-label={`Remove ${email}`}
                  >
                    ×
                  </button>
                )}
              </span>
            );
          })
        )}
      </div>
      {editable && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            placeholder="add-email@domain.com"
            className="form-control"
            style={{ maxWidth: 240, height: 32, fontSize: 12.5 }}
          />
          <button type="button" onClick={addEmail} className="btn btn-secondary btn-sm">+ Add</button>
          {(added.length > 0 || removed.length > 0) && (
            <button type="button" onClick={restoreDefault} className="btn btn-secondary btn-sm">↺ Restore default</button>
          )}
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            {added.length > 0 && <><b>+{added.length}</b> added manually</>}
            {added.length > 0 && removed.length > 0 && ' · '}
            {removed.length > 0 && <><b>{removed.length}</b> removed from default group</>}
          </span>
        </div>
      )}
    </div>
  );
}
