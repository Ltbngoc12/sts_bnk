'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  details: string;
  beforeSnapshot?: string;
  afterSnapshot?: string;
  correlationId: string;
  ipAddress?: string;
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [userFilter, setUserFilter] = useState('All');
  const [moduleFilter, setModuleFilter] = useState('All');
  const [actionFilter, setActionFilter] = useState('All');
  
  // Detail drawer
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/admin/audit');
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    } finally {
      setLoading(false);
    }
  };

  // Extract unique values for filter dropdowns
  const uniqueUsers = Array.from(new Set(logs.map(l => l.user)));
  const uniqueModules = Array.from(new Set(logs.map(l => l.module)));
  const uniqueActions = Array.from(new Set(logs.map(l => l.action)));

  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp).getTime();
    const start = startDate ? new Date(startDate + 'T00:00:00').getTime() : 0;
    const end = endDate ? new Date(endDate + 'T23:59:59').getTime() : Infinity;
    
    const matchesDate = logDate >= start && logDate <= end;
    const matchesUser = userFilter === 'All' || log.user === userFilter;
    const matchesModule = moduleFilter === 'All' || log.module === moduleFilter;
    const matchesAction = actionFilter === 'All' || log.action === actionFilter;

    return matchesDate && matchesUser && matchesModule && matchesAction;
  });

  const renderJsonDiff = (jsonStr: string | undefined) => {
    if (!jsonStr) return <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>(Empty)</span>;
    try {
      const parsed = JSON.parse(jsonStr);
      return (
        <pre style={{ margin: 0, padding: '12px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '11.5px', fontFamily: 'var(--font-mono)', overflowX: 'auto', lineHeight: '1.4', color: 'var(--text-main)' }}>
          {JSON.stringify(parsed, null, 2)}
        </pre>
      );
    } catch {
      return <pre style={{ margin: 0, padding: '10px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>{jsonStr}</pre>;
    }
  };

  return (
    <AdminGuard pageTitle="Audit Log">
      <div className="admin-header-bar glass" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>ENTERPRISE AUDIT MONITOR</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Immutable ledger capturing administrative creations, role overrides, routing adjustments, and system modifications.</p>
      </div>

      {/* Filters grid */}
      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>User</label>
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All Users</option>
              {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Module</label>
            <select
              value={moduleFilter}
              onChange={e => setModuleFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All Modules</option>
              {uniqueModules.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px' }}>Action Type</label>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            >
              <option value="All">All Actions</option>
              {uniqueActions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedLog ? '1.2fr 1fr' : '1fr', gap: '20px', marginTop: '20px', alignItems: 'start', transition: 'all 0.2s' }}>
        {/* Logs Table Card */}
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)' }}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading audit records...</div>
          ) : (
            <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
              <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '170px' }}>Timestamp</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Operator</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Module</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Action</th>
                    <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit events found.</td>
                    </tr>
                  ) : (
                    filteredLogs.map(log => {
                      const isSelected = selectedLog?.id === log.id;
                      return (
                        <tr
                          key={log.id}
                          onClick={() => setSelectedLog(log)}
                          style={{
                            borderBottom: '1px solid var(--border-color)',
                            background: isSelected ? 'var(--color-primary-bg)' : 'var(--bg-card)',
                            cursor: 'pointer',
                            transition: 'all 0.12s'
                          }}
                        >
                          <td style={{ padding: '12px 16px', color: 'var(--text-sub)' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px 16px', fontWeight: 600 }}>{log.user}</td>
                          <td style={{ padding: '12px 16px', color: 'var(--color-primary-dark)' }}>{log.module}</td>
                          <td style={{ padding: '12px 16px', fontWeight: 500 }}>{log.action}</td>
                          <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                            {log.ipAddress || '127.0.0.1'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Selected Log Drawer */}
        {selectedLog && (
          <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: '15px', minHeight: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Change History Details</span>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', color: 'var(--text-main)', marginTop: '2px' }}>{selectedLog.action}</h2>
              </div>
              <button onClick={() => setSelectedLog(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>Correlation ID</strong>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{selectedLog.correlationId}</span>
                </div>
                <div>
                  <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>IP Address</strong>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{selectedLog.ipAddress || '127.0.0.1'}</span>
                </div>
              </div>

              <div>
                <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Summary Narrative</strong>
                <p style={{ background: 'var(--bg-inset)', padding: '10px 12px', borderRadius: '6px', fontSize: '13px', lineHeight: '1.5', margin: 0 }}>
                  {selectedLog.details}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Snapshot Before Value</strong>
                {renderJsonDiff(selectedLog.beforeSnapshot)}
              </div>

              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <strong style={{ fontSize: '10.5px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Snapshot After Value</strong>
                {renderJsonDiff(selectedLog.afterSnapshot)}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
