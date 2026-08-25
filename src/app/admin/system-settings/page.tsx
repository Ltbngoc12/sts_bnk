'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';

interface SystemSettings {
  autoSaveInterval: number; // in seconds
  recordLockTimeout: number; // in minutes
}

// `dashboardReportResetTime` was removed here (Dashboard Enhancement Plan v2 §7.1).
// It existed to shift the "Incidents/Faults Reported" counters off midnight onto a
// 09:00 operational-day boundary, but the client subsequently defined "Today" on
// the Dashboard as the plain calendar day, leaving the setting with no consumer.
// Stale values in existing localStorage payloads are simply ignored.
const DEFAULT_SETTINGS: SystemSettings = {
  autoSaveInterval: 60, // 60 seconds default
  recordLockTimeout: 10, // 10 minutes default
};

export default function SystemSettingsPage() {
  const { username } = useRole();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  
  // Fields state
  const [autoSave, setAutoSave] = useState(60);
  const [lockTimeout, setLockTimeout] = useState(10);

  useEffect(() => {
    const stored = localStorage.getItem('admin_system_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      const hydrated: SystemSettings = {
        autoSaveInterval: parsed?.autoSaveInterval ?? DEFAULT_SETTINGS.autoSaveInterval,
        recordLockTimeout: parsed?.recordLockTimeout ?? DEFAULT_SETTINGS.recordLockTimeout,
      };
      setSettings(hydrated);
      setAutoSave(hydrated.autoSaveInterval);
      setLockTimeout(hydrated.recordLockTimeout);
    } else {
      setSettings(DEFAULT_SETTINGS);
      setAutoSave(DEFAULT_SETTINGS.autoSaveInterval);
      setLockTimeout(DEFAULT_SETTINGS.recordLockTimeout);
      localStorage.setItem('admin_system_settings', JSON.stringify(DEFAULT_SETTINGS));
    }
  }, []);

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'System Settings',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `SET-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    const newSettings: SystemSettings = {
      autoSaveInterval: autoSave,
      recordLockTimeout: lockTimeout,
    };

    logAudit('Update System Settings', settings, newSettings, `Updated Auto-Save: ${autoSave}s, Record Lock Timeout: ${lockTimeout}m`);
    setSettings(newSettings);
    localStorage.setItem('admin_system_settings', JSON.stringify(newSettings));
    alert('System Settings saved successfully and recorded in the audit log!');
  };

  if (!settings) return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <AdminGuard pageTitle="System Settings">
      <div className="admin-header-bar glass" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>SYSTEM TIMEOUT CONFIGURATIONS</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Configure operational timers for autosave triggers and active editing record locks.</p>
      </div>

      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px', maxWidth: '600px' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Auto Save Interval */}
          <div style={{ paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px', textTransform: 'uppercase' }}>Auto Save Interval</label>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>Frequency of automatic record saving during active editing to prevent loss of data.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="number"
                min="5"
                max="300"
                required
                value={autoSave}
                onChange={e => setAutoSave(parseInt(e.target.value) || 60)}
                style={{ width: '100px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-sub)', fontWeight: 500 }}>seconds (e.g. 30s, 60s)</span>
            </div>
          </div>

          {/* Record Lock Timeout */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px', textTransform: 'uppercase' }}>Record Lock Timeout</label>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>Duration before an inactive editing session lock is released to let other operators access the file.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="number"
                min="1"
                max="120"
                required
                value={lockTimeout}
                onChange={e => setLockTimeout(parseInt(e.target.value) || 10)}
                style={{ width: '100px', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
              />
              <span style={{ fontSize: '13px', color: 'var(--text-sub)', fontWeight: 500 }}>minutes (e.g. 10m, 15m)</span>
            </div>
          </div>

          {/* Save Action */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '15px', marginTop: '10px' }}>
            <button type="submit" className="btn btn-primary" style={{ padding: '8px 20px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', fontSize: '13px', fontWeight: 600 }}>
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </AdminGuard>
  );
}
