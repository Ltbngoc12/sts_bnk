'use client';

import React, { useState, useRef, useEffect } from 'react';
import { getUsers } from '@/lib/users';

interface MultiResponderSelectProps {
  value: string[];
  onChange: (updated: string[]) => void;
  disabled?: boolean;
  label?: string;
  allowEmpty?: boolean; // If false, will disable removing the last chip
}

export default function MultiResponderSelect({
  value = [],
  onChange,
  disabled = false,
  label,
  allowEmpty = true
}: MultiResponderSelectProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [responders, setResponders] = useState<{ name: string; email: string }[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync available responders dynamically when dropdown is toggled
  useEffect(() => {
    const allUsers = getUsers();
    const activeResponders = allUsers
      .filter(u => u.status === 'Active' && u.role === 'Responder')
      .map(u => ({ name: u.name, email: u.email }));
    setResponders(activeResponders);
  }, [isOpen]);

  // Filter responders that are not already selected and match the search term (Name or Email)
  const filteredResponders = responders.filter(user => {
    const isAlreadySelected = value.includes(user.name);
    const matchesSearch =
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase());
    return !isAlreadySelected && matchesSearch;
  });

  const handleSelect = (name: string) => {
    if (disabled) return;
    const updated = [...value, name];
    onChange(updated);
    setSearch('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleRemove = (nameToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    
    // Last responder guard
    if (!allowEmpty && value.length <= 1) {
      return;
    }

    const updated = value.filter(name => name !== nameToRemove);
    onChange(updated);
  };

  const isRemoveDisabled = !allowEmpty && value.length <= 1;

  return (
    <div className="form-group" ref={containerRef} style={{ position: 'relative', width: '100%', marginBottom: 0 }}>
      {label && <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '11.5px', color: 'var(--text-muted, #7A6555)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</label>}
      
      {/* Selector Box */}
      <div
        onClick={() => !disabled && setIsOpen(true)}
        style={{
          minHeight: '40px',
          padding: '4px 10px',
          background: 'var(--bg-card, #FDFCF8)',
          border: '1px solid var(--border-color, #D9D0C4)',
          borderRadius: 'var(--radius-md, 8px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '6px',
          cursor: disabled ? 'not-allowed' : 'text',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: isOpen ? '0 0 0 3px rgba(255, 130, 0, 0.12)' : 'none',
        }}
      >
        {/* Selected Responders as Chips */}
        {value.map(user => {
          const disabledChip = isRemoveDisabled;
          return (
            <span
              key={user}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--bg-inset, #EEEADE)',
                border: '1px solid var(--border-color, #D9D0C4)',
                borderRadius: 'var(--radius-sm, 4px)',
                padding: '2px 8px',
                fontSize: '12.5px',
                color: 'var(--text-main, #2C1A0E)',
                fontWeight: 500,
                gap: '6px'
              }}
            >
              <span>{user}</span>
              <button
                type="button"
                disabled={disabled || disabledChip}
                onClick={(e) => handleRemove(user, e)}
                title={disabledChip ? "At least one Responder must remain assigned." : `Remove ${user}`}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: (disabled || disabledChip) ? 'not-allowed' : 'pointer',
                  color: disabledChip ? 'var(--text-faint, #A89080)' : 'var(--color-critical, #DC2626)',
                  fontSize: '11px',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!disabledChip && !disabled) {
                    e.currentTarget.style.background = 'rgba(220, 38, 38, 0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                ✕
              </button>
            </span>
          );
        })}

        {/* Text Input */}
        <input
          ref={inputRef}
          type="text"
          value={search}
          disabled={disabled}
          onChange={(e) => {
            setSearch(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={value.length === 0 ? "Select responders..." : ""}
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

      {/* Dropdown Options */}
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
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.06)',
            zIndex: 999,
            maxHeight: '200px',
            overflowY: 'auto',
          }}
        >
          {filteredResponders.length > 0 ? (
            filteredResponders.map(user => (
              <div
                key={user.name}
                onClick={() => handleSelect(user.name)}
                style={{
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: 'var(--text-main, #2C1A0E)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-inset, #EEEADE)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <span style={{ fontWeight: 500 }}>{user.name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #7A6555)' }}>{user.email}</span>
              </div>
            ))
          ) : (
            <div style={{ padding: '8px 12px', fontSize: '12.5px', color: 'var(--text-faint, #A89080)', fontStyle: 'italic' }}>
              {search ? 'No matching responders found' : 'All available responders selected'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
