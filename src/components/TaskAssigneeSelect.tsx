'use client';

// Shared multi-select Assignee picker (2026-07-27, per Kyle feedback on the
// Create/Reassign Task Assignee field):
//   1. No more separate "Assign To: Individual User / Group" type filter —
//      one control offers both.
//   2. Multi-select, not single-select — a Task can go to several people
//      and/or groups at once and stays ONE shared task (FRD 7.2).
//   3. Each option in the dropdown is tagged so it's clear whether it's a
//      User or a (Task Distribution) Group.
//
// Dedup: selecting a Group hides its internal members from the individual
// User list (already covered) and auto-drops any of them that were picked
// individually first, so nobody is double-counted on the same Task.

import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { TaskAssignee } from '@/lib/db';
import { getAssignableUsers, getAssignableGroups, internalGroupMembers } from '@/lib/taskHelpers';

interface TaskAssigneeSelectProps {
  value: TaskAssignee[];
  onChange: (updated: TaskAssignee[]) => void;
  disabled?: boolean;
  label?: string;
}

export default function TaskAssigneeSelect({
  value = [],
  onChange,
  disabled = false,
  label = 'Assignee',
}: TaskAssigneeSelectProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allUsers = useMemo(() => getAssignableUsers(), [isOpen]);
  const allGroups = useMemo(() => getAssignableGroups(), [isOpen]);

  const selectedGroupNames = value.filter(a => a.type === 'group').map(a => a.name);
  const selectedUserNames = value.filter(a => a.type === 'user').map(a => a.name);

  // Users already covered by a selected group — hidden from the individual
  // User options so the same person can't be double-picked.
  const coveredByGroup = useMemo(() => {
    const set = new Set<string>();
    selectedGroupNames.forEach(gName => {
      internalGroupMembers(gName).forEach(name => set.add(name));
    });
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupNames.join('|')]);

  // If a group covering an already-individually-picked user gets selected,
  // drop the redundant individual chip (keep the group chip).
  useEffect(() => {
    if (coveredByGroup.size === 0) return;
    const stillNeeded = value.filter(a => !(a.type === 'user' && coveredByGroup.has(a.name)));
    if (stillNeeded.length !== value.length) onChange(stillNeeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coveredByGroup]);

  const q = search.trim().toLowerCase();

  const userOptions = allUsers.filter(u => {
    if (selectedUserNames.includes(u.name)) return false;
    if (coveredByGroup.has(u.name)) return false;
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const groupOptions = allGroups.filter(g => {
    if (selectedGroupNames.includes(g.name)) return false;
    if (!q) return true;
    return g.name.toLowerCase().includes(q);
  });

  const handleSelectUser = (u: { id: string; name: string }) => {
    if (disabled) return;
    onChange([...value, { type: 'user', id: u.id, name: u.name }]);
    setSearch('');
    inputRef.current?.focus();
  };

  const handleSelectGroup = (g: { id: string; name: string }) => {
    if (disabled) return;
    onChange([...value, { type: 'group', id: g.id, name: g.name }]);
    setSearch('');
    inputRef.current?.focus();
  };

  const handleRemove = (target: TaskAssignee, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(value.filter(a => !(a.type === target.type && a.id === target.id)));
  };

  return (
    <div className="form-group" ref={containerRef} style={{ position: 'relative', width: '100%', marginBottom: 0 }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '11.5px', color: 'var(--text-muted, #7A6555)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </label>
      )}

      {/* Selector box */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        className="form-control select-dark"
        style={{
          minHeight: '40px',
          padding: '4px 10px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
          boxShadow: isOpen ? '0 0 0 3px rgba(255, 130, 0, 0.12)' : 'none',
        }}
      >
        {value.map(a => (
          <span
            key={`${a.type}-${a.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: a.type === 'group' ? 'var(--color-info-bg, #E8F1FC)' : 'var(--bg-inset, #EEEADE)',
              border: `1px solid ${a.type === 'group' ? 'var(--color-info-border, #B9D6F5)' : 'var(--border-color, #D9D0C4)'}`,
              borderRadius: 'var(--radius-sm, 4px)',
              padding: '2px 8px',
              fontSize: '12.5px',
              color: 'var(--text-main, #2C1A0E)',
              fontWeight: 500,
              gap: '6px',
            }}
          >
            <span
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: a.type === 'group' ? 'var(--color-info, #2563EB)' : 'var(--text-muted, #7A6555)',
              }}
            >
              {a.type === 'group' ? 'Group' : 'User'}
            </span>
            <span>{a.name}</span>
            <button
              type="button"
              disabled={disabled}
              onClick={e => handleRemove(a, e)}
              title={`Remove ${a.name}`}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: disabled ? 'not-allowed' : 'pointer',
                color: 'var(--color-critical, #DC2626)',
                fontSize: '11px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
              }}
            >
              ✕
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={search}
          disabled={disabled}
          onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={value.length === 0 ? 'Search users or groups...' : ''}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-main, #2C1A0E)',
            fontSize: '13px',
            flexGrow: 1,
            minWidth: '120px',
            padding: '2px 0',
          }}
        />
      </div>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '4px',
            background: 'var(--bg-card, #FDFCF8)',
            border: '1px solid var(--border-color, #D9D0C4)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            zIndex: 999,
            maxHeight: '260px',
            overflowY: 'auto',
          }}
        >
          {groupOptions.length === 0 && userOptions.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '12.5px', color: 'var(--text-faint, #A89080)', fontStyle: 'italic' }}>
              {q ? 'No matching users or groups' : 'All available users and groups selected'}
            </div>
          )}

          {groupOptions.length > 0 && (
            <>
              <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-inset)' }}>
                Groups
              </div>
              {groupOptions.map(g => (
                <div
                  key={g.id}
                  onClick={() => handleSelectGroup(g)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                    padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-main)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover, #F3EEE3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span style={{ fontWeight: 500 }}>{g.name}</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: 'var(--color-info, #2563EB)', background: 'var(--color-info-bg, #E8F1FC)',
                    border: '1px solid var(--color-info-border, #B9D6F5)', borderRadius: '999px', padding: '1px 7px',
                  }}>
                    Group · {g.members.filter(m => m.type === 'Internal').length}
                  </span>
                </div>
              ))}
            </>
          )}

          {userOptions.length > 0 && (
            <>
              <div style={{ padding: '6px 12px', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', background: 'var(--bg-inset)' }}>
                Users
              </div>
              {userOptions.map(u => (
                <div
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
                    padding: '8px 12px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-main)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover, #F3EEE3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                  <span style={{ fontWeight: 500 }}>{u.name}</span>
                  <span style={{
                    fontSize: '9px', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: 'var(--text-muted)', background: 'var(--bg-inset)',
                    border: '1px solid var(--border-color)', borderRadius: '999px', padding: '1px 7px',
                  }}>
                    User · {u.role}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
