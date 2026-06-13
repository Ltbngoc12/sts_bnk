'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';

interface GroupMember {
  id: string;
  name: string;
  type: 'Internal' | 'External';
  email: string;
  phone: string;
}

interface DistributionGroup {
  id: string;
  name: string;
  description: string;
  members: GroupMember[];
  status: 'Active' | 'Deactivated';
}

const DEFAULT_GROUPS: DistributionGroup[] = [
  {
    id: 'grp-1',
    name: 'SDC Crisis Command',
    description: 'SDC executive leaders and emergency operational response units.',
    status: 'Active',
    members: [
      { id: 'm-1', name: 'DM Gan', type: 'Internal', email: 'gan.sh@sdc.gov.sg', phone: '+65 9876 5432' },
      { id: 'm-2', name: 'DO Shin Feng', type: 'Internal', email: 'shin.feng@sdc.gov.sg', phone: '+65 9123 4567' },
      { id: 'm-3', name: 'Police Liaison Officer', type: 'External', email: 'spf_liaison@spf.gov.sg', phone: '+65 9991 1111' },
      { id: 'm-4', name: 'SCDF Commander', type: 'External', email: 'scdf_command@scdf.gov.sg', phone: '+65 8888 9999' }
    ]
  },
  {
    id: 'grp-2',
    name: 'Sentosa Cove Residents',
    description: 'Sentosa Cove joint committee, security gates and community liaison representatives.',
    status: 'Active',
    members: [
      { id: 'm-5', name: 'Cove Management Office', type: 'External', email: 'cove_mgr@cove.com.sg', phone: '+65 6789 0123' },
      { id: 'm-6', name: 'Security North Gate', type: 'External', email: 'cove_sec_north@cove.com.sg', phone: '+65 6789 0124' },
      { id: 'm-7', name: 'Liaison Officer', type: 'Internal', email: 'liaison@sdc.gov.sg', phone: '+65 9111 2222' }
    ]
  },
  {
    id: 'grp-3',
    name: 'Beach Operators & F&B Tenants',
    description: 'Siloso and Palawan beach attraction managers, lifeguards and F&B owners.',
    status: 'Active',
    members: [
      { id: 'm-8', name: 'Siloso Beach Cafe Manager', type: 'External', email: 'silosocafe@food.com.sg', phone: '+65 9222 3333' },
      { id: 'm-9', name: 'Ola Beach Club Desk', type: 'External', email: 'ops@olabeach.com.sg', phone: '+65 6123 4567' },
      { id: 'm-10', name: 'Ranger John', type: 'Internal', email: 'john.doe@ranger.com.sg', phone: '+65 9333 4444' }
    ]
  }
];

export default function DistributionGroupsPage() {
  const { username } = useRole();
  const [groups, setGroups] = useState<DistributionGroup[]>([]);
  
  // Modal / Drawer state
  const [selectedGroup, setSelectedGroup] = useState<DistributionGroup | null>(null);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);

  // Group Form fields
  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');
  const [formGroupStatus, setFormGroupStatus] = useState<'Active' | 'Deactivated'>('Active');

  // Member Form fields
  const [formMemberName, setFormMemberName] = useState('');
  const [formMemberType, setFormMemberType] = useState<'Internal' | 'External'>('Internal');
  const [formMemberEmail, setFormMemberEmail] = useState('');
  const [formMemberPhone, setFormMemberPhone] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('admin_dist_groups');
    if (stored) {
      setGroups(JSON.parse(stored));
    } else {
      setGroups(DEFAULT_GROUPS);
      localStorage.setItem('admin_dist_groups', JSON.stringify(DEFAULT_GROUPS));
    }
  }, []);

  const saveGroupsState = (updated: DistributionGroup[]) => {
    setGroups(updated);
    localStorage.setItem('admin_dist_groups', JSON.stringify(updated));
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

  const handleCreateOrEditGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGroup) {
      // Edit Group Metadata
      const updated = groups.map(g => {
        if (g.id === selectedGroup.id) {
          return {
            ...g,
            name: formGroupName,
            description: formGroupDesc,
            status: formGroupStatus
          };
        }
        return g;
      });
      const updatedGroup = updated.find(g => g.id === selectedGroup.id);
      logAudit('Update Group Info', selectedGroup, updatedGroup, `Updated metadata for distribution group: ${formGroupName}`);
      saveGroupsState(updated);
      setSelectedGroup(updatedGroup || null);
    } else {
      // Create Group
      const newGroup: DistributionGroup = {
        id: `grp-${Date.now()}`,
        name: formGroupName,
        description: formGroupDesc,
        members: [],
        status: formGroupStatus
      };
      logAudit('Create Distribution Group', null, newGroup, `Created new distribution group: ${formGroupName}`);
      saveGroupsState([...groups, newGroup]);
    }
    setIsGroupModalOpen(false);
    resetGroupForm();
  };

  const handleToggleStatus = (group: DistributionGroup) => {
    const newStatus = group.status === 'Active' ? 'Deactivated' : 'Active';
    const updated = groups.map(g => {
      if (g.id === group.id) {
        return { ...g, status: newStatus as 'Active' | 'Deactivated' };
      }
      return g;
    });
    logAudit(
      newStatus === 'Active' ? 'Reactivate Group' : 'Deactivate Group',
      group,
      { ...group, status: newStatus },
      `${newStatus === 'Active' ? 'Reactivated' : 'Deactivated'} distribution group: ${group.name}`
    );
    saveGroupsState(updated);
    if (selectedGroup?.id === group.id) {
      setSelectedGroup({ ...selectedGroup, status: newStatus });
    }
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    const newMember: GroupMember = {
      id: `mem-${Date.now()}`,
      name: formMemberName,
      type: formMemberType,
      email: formMemberEmail,
      phone: formMemberPhone
    };

    const updated = groups.map(g => {
      if (g.id === selectedGroup.id) {
        return {
          ...g,
          members: [...g.members, newMember]
        };
      }
      return g;
    });

    const updatedGroup = updated.find(g => g.id === selectedGroup.id);
    logAudit('Add Group Member', selectedGroup, updatedGroup, `Added member ${formMemberName} to group ${selectedGroup.name}`);
    saveGroupsState(updated);
    setSelectedGroup(updatedGroup || null);
    setIsMemberModalOpen(false);
    resetMemberForm();
  };

  const handleRemoveMember = (memberId: string, memberName: string) => {
    if (!selectedGroup) return;

    const updated = groups.map(g => {
      if (g.id === selectedGroup.id) {
        return {
          ...g,
          members: g.members.filter(m => m.id !== memberId)
        };
      }
      return g;
    });

    const updatedGroup = updated.find(g => g.id === selectedGroup.id);
    logAudit('Remove Group Member', selectedGroup, updatedGroup, `Removed member ${memberName} from group ${selectedGroup.name}`);
    saveGroupsState(updated);
    setSelectedGroup(updatedGroup || null);
  };

  const openCreateGroup = () => {
    setSelectedGroup(null);
    resetGroupForm();
    setIsGroupModalOpen(true);
  };

  const openEditGroup = (group: DistributionGroup) => {
    setSelectedGroup(group);
    setFormGroupName(group.name);
    setFormGroupDesc(group.description);
    setFormGroupStatus(group.status);
    setIsGroupModalOpen(true);
  };

  const resetGroupForm = () => {
    setFormGroupName('');
    setFormGroupDesc('');
    setFormGroupStatus('Active');
  };

  const resetMemberForm = () => {
    setFormMemberName('');
    setFormMemberType('Internal');
    setFormMemberEmail('');
    setFormMemberPhone('');
  };

  return (
    <AdminGuard pageTitle="Distribution Groups">
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>BROADCAST RECIPIENT GROUPS</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Provision and configure distribution list matrices, grouping internal operational teams and external partners.</p>
        </div>
        <button onClick={openCreateGroup} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span>+</span> Create Group
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedGroup ? '1.1fr 1fr' : '1fr', gap: '20px', marginTop: '20px', alignItems: 'start', transition: 'all 0.2s' }}>
        {/* Groups List Table Card */}
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)' }}>
          <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Group Name</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px' }}>Member Count</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px' }}>Status</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '160px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No distribution groups configured.</td>
                  </tr>
                ) : (
                  groups.map(group => {
                    const isSelected = selectedGroup?.id === group.id;
                    return (
                      <tr
                        key={group.id}
                        onClick={() => setSelectedGroup(group)}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          background: isSelected ? 'var(--color-primary-bg)' : 'var(--bg-card)',
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
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => openEditGroup(group)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
                              Edit
                            </button>
                            <button
                              onClick={() => handleToggleStatus(group)}
                              className={`btn ${group.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                              style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}
                            >
                              {group.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Group Detail drawer */}
        {selectedGroup && (
          <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', minHeight: '400px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Group Member List</span>
                <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', color: 'var(--text-main)', marginTop: '2px' }}>{selectedGroup.name}</h2>
              </div>
              <button onClick={() => setSelectedGroup(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '20px', color: 'var(--text-muted)' }}>×</button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>
                Total Members: <strong>{selectedGroup.members.length}</strong>
              </span>
              <button
                onClick={() => setIsMemberModalOpen(true)}
                disabled={selectedGroup.status !== 'Active'}
                className="btn btn-primary"
                style={{
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  background: 'var(--color-primary-dark)',
                  border: 'none',
                  color: '#fff',
                  opacity: selectedGroup.status !== 'Active' ? 0.5 : 1
                }}
              >
                + Add Member
              </button>
            </div>

            <div style={{ flex: 1, maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '8px 12px', fontSize: '10.5px', fontWeight: 700 }}>Name</th>
                    <th style={{ padding: '8px 12px', fontSize: '10.5px', fontWeight: 700 }}>Type</th>
                    <th style={{ padding: '8px 12px', fontSize: '10.5px', fontWeight: 700 }}>Contact Info</th>
                    <th style={{ padding: '8px 12px', fontSize: '10.5px', fontWeight: 700, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.members.length === 0 ? (
                    <tr>
                      <td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>No members in this group.</td>
                    </tr>
                  ) : (
                    selectedGroup.members.map(member => (
                      <tr key={member.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{member.name}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <span className={`badge ${member.type === 'Internal' ? 'badge-onsite' : 'badge-review'}`} style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '10px' }}>
                            {member.type}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontSize: '11.5px', color: 'var(--text-sub)' }}>
                          <div>{member.email}</div>
                          <div>{member.phone}</div>
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRemoveMember(member.id, member.name)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT GROUP MODAL */}
      {isGroupModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              {selectedGroup ? 'Edit Group Metadata' : 'Create Distribution Group'}
            </h2>
            <form onSubmit={handleCreateOrEditGroup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
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

              {selectedGroup && (
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Status</label>
                  <select
                    value={formGroupStatus}
                    onChange={e => setFormGroupStatus(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Deactivated">Deactivated</option>
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsGroupModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Group</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {isMemberModalOpen && selectedGroup && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '440px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              Add Member to {selectedGroup.name}
            </h2>
            <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={formMemberName}
                    onChange={e => setFormMemberName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Member Type</label>
                  <select
                    value={formMemberType}
                    onChange={e => setFormMemberType(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="Internal">Internal (WOG)</option>
                    <option value="External">External Partner</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. email@domain.com"
                  value={formMemberEmail}
                  onChange={e => setFormMemberEmail(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Mobile Phone</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +65 9123 4567"
                  value={formMemberPhone}
                  onChange={e => setFormMemberPhone(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsMemberModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Add Member</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
