'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { DistributionGroup, DEFAULT_GROUPS, GROUPS_STORAGE_KEY } from '@/lib/groups';

export default function DistributionGroupsPage() {
  const router = useRouter();
  const { username } = useRole();
  const [groups, setGroups] = useState<DistributionGroup[]>([]);

  // Create Group modal state
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');

  // Load from the server-backed store (FSD §10.3 / §13.3). Falls back to localStorage
  // then seeded defaults if the API is unavailable. Mirrors the result into
  // localStorage so the Task module's synchronous group picker stays in sync.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/distribution-groups');
        if (res.ok) {
          const data = await res.json();
          const groups: DistributionGroup[] = Array.isArray(data) && data.length > 0 ? data : DEFAULT_GROUPS;
          setGroups(groups);
          localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
          return;
        }
      } catch { /* fall through to local cache */ }
      const stored = localStorage.getItem(GROUPS_STORAGE_KEY);
      if (stored) setGroups(JSON.parse(stored));
      else { setGroups(DEFAULT_GROUPS); localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(DEFAULT_GROUPS)); }
    })();
  }, []);

  // Persist to the server (source of truth for broadcast dispatch) and mirror to
  // localStorage for the Task module's synchronous consumers.
  const saveGroupsState = (updated: DistributionGroup[]) => {
    setGroups(updated);
    localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(updated));
    fetch('/api/admin/distribution-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => { /* offline — localStorage mirror retains the edit */ });
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Distribution Groups',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `DST-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const newGroup: DistributionGroup = {
      id: `grp-${Date.now()}`,
      name: formGroupName,
      description: formGroupDesc,
      members: [],
      status: 'Active'
    };
    logAudit('Create Distribution Group', null, newGroup, `Created new distribution group: ${formGroupName}`);
    saveGroupsState([...groups, newGroup]);
    setIsGroupModalOpen(false);
    resetGroupForm();
  };

  const openCreateGroup = () => {
    resetGroupForm();
    setIsGroupModalOpen(true);
  };

  const resetGroupForm = () => {
    setFormGroupName('');
    setFormGroupDesc('');
  };

  const openMemberList = (group: DistributionGroup) => {
    router.push(`/admin/distribution-groups/${encodeURIComponent(group.id)}`);
  };

  return (
    <AdminGuard pageTitle="Distribution Groups">
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>DISTRIBUTION GROUP SETTING</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Provision and configure distribution list matrices, grouping internal operational teams and external partners.</p>
        </div>
        <button onClick={openCreateGroup} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span>+</span> Create Group
        </button>
      </div>

      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Group Name</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px' }}>Member Count</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '140px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No distribution groups configured.</td>
                </tr>
              ) : (
                groups.map(group => (
                  <tr
                    key={group.id}
                    onClick={() => openMemberList(group)}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: 'var(--bg-card)',
                      cursor: 'pointer',
                      transition: 'all 0.12s'
                    }}
                  >
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-main)' }}>{group.name}</td>
                    <td style={{ padding: '12px 16px', fontSize: '12.5px', color: 'var(--text-sub)' }}>{group.description}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600 }}>{group.members.length}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span className={`badge ${group.status === 'Active' ? 'badge-completed' : 'badge-closed'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                        {group.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openMemberList(group)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
                        View Members
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE GROUP MODAL */}
      {isGroupModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Create Distribution Group</h2>
            <form onSubmit={handleCreateGroup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Group Name</label>
                <input
                  type="text"
                  required
                  value={formGroupName}
                  onChange={e => setFormGroupName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Description</label>
                <textarea
                  rows={3}
                  required
                  value={formGroupDesc}
                  onChange={e => setFormGroupDesc(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
