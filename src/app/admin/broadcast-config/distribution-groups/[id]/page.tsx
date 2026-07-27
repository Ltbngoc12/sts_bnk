'use client';

// Broadcast Distribution Group — member detail page (2026-07-27, per Kyle:
// "View Members" on the Distribution Groups tab should open its own page rather
// than an in-page master/detail toggle). Follows the same nested-route pattern
// already used for Templates (admin/broadcast-config/templates/[id]/page.tsx)
// and for the Task module's own group member page
// (admin/task-configuration/groups/[id]/page.tsx) — including the same
// trade-off as the Template detail page: the "Back" link always lands on
// Broadcast Configuration's default (Template) tab rather than the
// Distribution Groups tab it was opened from, since the tab selector isn't
// query-synced (consistent with the existing Template nested route, not a
// regression specific to this page).
//
// Reads/writes exclusively /api/admin/broadcast-distribution-groups —
// Broadcast's own Mongo collection, entirely separate from the Task module's
// Distribution Groups (now the "Task Distribution" tab on
// /admin/task-configuration). Split out of the GroupMembersPanel that used to
// live inline in admin/broadcast-config/page.tsx.

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';
import { hasBroadcastPermission } from '@/lib/permissions';
import type { DistributionGroup, GroupMember } from '@/lib/groups';
import { getUsers } from '@/lib/users';
import type { UserAccount } from '@/lib/users';

// Roles that represent someone without real internal CMS access — their CMS
// account exists only to receive broadcasts. Used to default the member Type
// badge sensibly when adding via an existing user, without forcing a manual
// re-selection. (Same heuristic as the Task module's group member page.)
const EXTERNAL_ROLE_HINTS = ['Broadcast Recipient', 'Non-SDC Term Contractor'];

export default function BroadcastGroupMemberListPage() {
  const params = useParams();
  const groupId = decodeURIComponent(String(params.id));
  const { username } = useRole();

  const [groups, setGroups] = useState<DistributionGroup[]>([]);
  const [allUsers, setAllUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isEditGroupModalOpen, setIsEditGroupModalOpen] = useState(false);

  const [memberSource, setMemberSource] = useState<'existing' | 'external'>('existing');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userPickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [formMemberName, setFormMemberName] = useState('');
  const [formMemberEmail, setFormMemberEmail] = useState('');
  const [formMemberPhone, setFormMemberPhone] = useState('');
  const [formMemberRemark, setFormMemberRemark] = useState('');

  const [formGroupName, setFormGroupName] = useState('');
  const [formGroupDesc, setFormGroupDesc] = useState('');
  const [formGroupStatus, setFormGroupStatus] = useState<'Active' | 'Deactivated'>('Active');

  useEffect(() => {
    setAllUsers(getUsers());
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/admin/broadcast-distribution-groups');
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error('Failed to load broadcast distribution groups', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedGroup = groups.find((g) => g.id === groupId) || null;

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Broadcast Configuration',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `BCS-${Date.now()}`,
        }),
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const persist = async (
    updated: DistributionGroup[],
    action: string,
    before: any,
    after: any,
    details: string
  ) => {
    setGroups(updated);
    await fetch('/api/admin/broadcast-distribution-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    await logAudit(action, before, after, details);
  };

  const resetMemberForm = () => {
    setMemberSource('existing');
    setSelectedUserIds([]);
    setUserSearch('');
    setIsUserDropdownOpen(false);
    setFormMemberName('');
    setFormMemberEmail('');
    setFormMemberPhone('');
    setFormMemberRemark('');
  };

  // Users already in this group (matched by linked account or email) so the
  // picker doesn't offer duplicates.
  const isAlreadyMember = (user: UserAccount) => {
    if (!selectedGroup) return false;
    return selectedGroup.members.some(
      (m) => m.userId === user.id || m.email.toLowerCase() === user.email.toLowerCase()
    );
  };

  const selectableUsers = allUsers.filter((u) => {
    if (u.status !== 'Active') return false;
    if (isAlreadyMember(u)) return false;
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.department.toLowerCase().includes(q);
  });

  const toggleUserSelected = (id: string) => {
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openAddMember = () => {
    resetMemberForm();
    setIsMemberModalOpen(true);
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    let newMembers: GroupMember[];
    if (memberSource === 'existing') {
      if (selectedUserIds.length === 0) return;
      newMembers = selectedUserIds
        .map((id) => allUsers.find((u) => u.id === id))
        .filter((u): u is UserAccount => !!u)
        .map((user, i) => ({
          id: `mem-${Date.now()}-${i}`,
          name: user.name,
          type: EXTERNAL_ROLE_HINTS.includes(user.role) ? ('External' as const) : ('Internal' as const),
          email: user.email,
          phone: user.phone,
          userId: user.id,
        }));
    } else {
      newMembers = [
        {
          id: `mem-${Date.now()}`,
          name: formMemberName,
          type: 'External',
          email: formMemberEmail,
          phone: formMemberPhone,
          remark: formMemberRemark.trim() || undefined,
        },
      ];
    }

    const updated = groups.map((g) => (g.id === selectedGroup.id ? { ...g, members: [...g.members, ...newMembers] } : g));
    const updatedGroup = updated.find((g) => g.id === selectedGroup.id);
    const names = newMembers.map((m) => m.name).join(', ');
    await persist(
      updated,
      'Add Broadcast Group Member',
      selectedGroup,
      updatedGroup,
      `Added ${newMembers.length} member${newMembers.length !== 1 ? 's' : ''} to broadcast group ${selectedGroup.name}: ${names}`
    );
    setIsMemberModalOpen(false);
    resetMemberForm();
  };

  const openEditGroup = () => {
    if (!selectedGroup) return;
    setFormGroupName(selectedGroup.name);
    setFormGroupDesc(selectedGroup.description);
    setFormGroupStatus(selectedGroup.status);
    setIsEditGroupModalOpen(true);
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;

    const updated = groups.map((g) =>
      g.id === selectedGroup.id ? { ...g, name: formGroupName, description: formGroupDesc, status: formGroupStatus } : g
    );
    const updatedGroup = updated.find((g) => g.id === selectedGroup.id);
    await persist(
      updated,
      'Update Broadcast Group Info',
      selectedGroup,
      updatedGroup,
      `Updated metadata for broadcast distribution group: ${formGroupName}`
    );
    setIsEditGroupModalOpen(false);
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!selectedGroup) return;
    const updated = groups.map((g) => (g.id === selectedGroup.id ? { ...g, members: g.members.filter((m) => m.id !== memberId) } : g));
    const updatedGroup = updated.find((g) => g.id === selectedGroup.id);
    await persist(updated, 'Remove Broadcast Group Member', selectedGroup, updatedGroup, `Removed member ${memberName} from broadcast group ${selectedGroup.name}`);
  };

  if (loading) {
    return (
      <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading group…</div>
      </AdminGuard>
    );
  }

  if (!selectedGroup) {
    return (
      <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
        <div className="glass" style={{ padding: '40px', textAlign: 'center', color: 'var(--color-critical)' }}>
          <p>Distribution group not found.</p>
          <Link href="/admin/broadcast-config" style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: '13px' }}>← Back to Broadcast Configuration</Link>
        </div>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard pageTitle="Broadcast Configuration" permissionCheck={(r) => hasBroadcastPermission(r, 'broadcast.config')}>
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <Link href="/admin/broadcast-config" style={{ color: 'var(--text-faint)', fontSize: '12px', textDecoration: 'none' }}>
              ← Broadcast Configuration
            </Link>
            <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>/</span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Distribution Group Members</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedGroup.name}</h1>
            <span className={`badge ${selectedGroup.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
              {selectedGroup.status}
            </span>
          </div>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{selectedGroup.description}</p>
        </div>
        <button
          onClick={openEditGroup}
          className="btn btn-secondary"
          style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, flexShrink: 0 }}
        >
          Edit
        </button>
      </div>

      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--text-sub)' }}>
            Total Members: <strong>{selectedGroup.members.length}</strong>
          </span>
          <button
            onClick={openAddMember}
            disabled={selectedGroup.status !== 'Active'}
            className="btn btn-primary"
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              fontSize: '12.5px',
              fontWeight: 600,
              background: 'var(--color-primary-dark)',
              border: 'none',
              color: '#fff',
              cursor: selectedGroup.status !== 'Active' ? 'not-allowed' : 'pointer',
              opacity: selectedGroup.status !== 'Active' ? 0.5 : 1,
            }}
          >
            + Add Member
          </button>
        </div>

        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Contact Info</th>
                <th style={{ ...thStyle, width: '100px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {selectedGroup.members.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No members in this group.</td>
                </tr>
              ) : (
                selectedGroup.members.map((member) => (
                  <tr key={member.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{member.name}</td>
                    <td style={tdStyle}>
                      <span className={`badge ${member.type === 'Internal' ? 'badge-onsite' : 'badge-review'}`} style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10.5px' }}>
                        {member.type}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-sub)' }}>
                      <div>{member.email}</div>
                      <div>{member.phone}</div>
                      {member.remark && (
                        <div style={{ marginTop: '2px', fontSize: '11.5px', fontStyle: 'italic', color: 'var(--text-muted)' }}>
                          Note: {member.remark}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button
                        onClick={() => handleRemoveMember(member.id, member.name)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-critical)', cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: '12.5px' }}
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

      {/* ADD MEMBER MODAL */}
      {isMemberModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '480px', height: '600px', maxWidth: '92vw', maxHeight: '90vh', padding: '24px', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px', flexShrink: 0 }}>
              Add Member to {selectedGroup.name}
            </h2>
            <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '15px', flex: 1, minHeight: 0 }}>
              {/* Source toggle */}
              <div style={{ display: 'flex', gap: '8px', padding: '4px', background: 'var(--bg-inset)', borderRadius: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => setMemberSource('existing')}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '12.5px', fontWeight: 700,
                    background: memberSource === 'existing' ? 'var(--color-primary-dark)' : 'transparent',
                    color: memberSource === 'existing' ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  Existing CMS User
                </button>
                <button
                  type="button"
                  onClick={() => setMemberSource('external')}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                    fontSize: '12.5px', fontWeight: 700,
                    background: memberSource === 'external' ? 'var(--color-primary-dark)' : 'transparent',
                    color: memberSource === 'external' ? '#fff' : 'var(--text-muted)',
                  }}
                >
                  External Contact
                </button>
              </div>

              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                {memberSource === 'existing' ? (
                  <>
                    <div ref={userPickerRef} style={{ position: 'relative' }}>
                      <label style={labelStyle}>
                        Search &amp; Select Users {selectedUserIds.length > 0 && `(${selectedUserIds.length} selected)`}
                      </label>
                      <input
                        type="text"
                        placeholder="Search name, email, department..."
                        value={userSearch}
                        onFocus={() => setIsUserDropdownOpen(true)}
                        onChange={(e) => { setUserSearch(e.target.value); setIsUserDropdownOpen(true); }}
                        style={{ ...inputStyle, marginTop: '5px' }}
                      />
                      {isUserDropdownOpen && (
                        <div style={{
                          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                          maxHeight: '220px', overflowY: 'auto', background: 'var(--bg-card)',
                          border: '1px solid var(--border-color)', borderRadius: '6px', boxShadow: '0 6px 16px rgba(0,0,0,0.15)',
                        }}>
                          {selectableUsers.length === 0 ? (
                            <div style={{ padding: '12px', fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center' }}>No matching active users</div>
                          ) : (
                            selectableUsers.map((u) => {
                              const checked = selectedUserIds.includes(u.id);
                              return (
                                <div
                                  key={u.id}
                                  onClick={() => toggleUserSelected(u.id)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', cursor: 'pointer',
                                    background: checked ? 'var(--bg-inset)' : 'transparent',
                                    borderBottom: '1px solid var(--border-color)',
                                  }}
                                >
                                  <input type="checkbox" checked={checked} readOnly style={{ pointerEvents: 'none' }} />
                                  <div style={{ fontSize: '12.5px', lineHeight: 1.4 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{u.name}</div>
                                    <div style={{ color: 'var(--text-muted)' }}>{u.email} · {u.department}</div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>

                    {selectedUserIds.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {selectedUserIds.map((id) => {
                          const u = allUsers.find((u) => u.id === id);
                          if (!u) return null;
                          return (
                            <span
                              key={id}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px 4px 10px',
                                background: 'var(--bg-inset)', border: '1px solid var(--border-color)', borderRadius: '999px',
                                fontSize: '12px', color: 'var(--text-main)',
                              }}
                            >
                              {u.name}
                              <button
                                type="button"
                                onClick={() => toggleUserSelected(id)}
                                aria-label={`Remove ${u.name}`}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700, fontSize: '13px', lineHeight: 1, padding: '2px' }}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <FormField label="Name">
                      <input type="text" required placeholder="e.g. John Doe" value={formMemberName} onChange={(e) => setFormMemberName(e.target.value)} style={inputStyle} />
                    </FormField>
                    <FormField label="Email Address">
                      <input type="email" required placeholder="e.g. email@domain.com" value={formMemberEmail} onChange={(e) => setFormMemberEmail(e.target.value)} style={inputStyle} />
                    </FormField>
                    <FormField label="Mobile Phone">
                      <input type="text" required placeholder="e.g. +65 9123 4567" value={formMemberPhone} onChange={(e) => setFormMemberPhone(e.target.value)} style={inputStyle} />
                    </FormField>
                    <FormField label="Remark (optional)">
                      <textarea rows={2} placeholder="e.g. Cove north gate duty desk, staffed 24/7" value={formMemberRemark} onChange={(e) => setFormMemberRemark(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
                    </FormField>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px', flexShrink: 0 }}>
                <button type="button" onClick={() => setIsMemberModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button
                  type="submit"
                  disabled={memberSource === 'existing' && selectedUserIds.length === 0}
                  className="btn btn-primary"
                  style={{
                    padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff',
                    opacity: memberSource === 'existing' && selectedUserIds.length === 0 ? 0.5 : 1,
                    cursor: memberSource === 'existing' && selectedUserIds.length === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  {memberSource === 'existing' && selectedUserIds.length > 1 ? `Add ${selectedUserIds.length} Members` : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT GROUP METADATA MODAL */}
      {isEditGroupModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>Edit Group Metadata</h2>
            <form onSubmit={handleEditGroup} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <FormField label="Group Name">
                <input type="text" required value={formGroupName} onChange={(e) => setFormGroupName(e.target.value)} style={inputStyle} />
              </FormField>
              <FormField label="Description">
                <textarea rows={3} required value={formGroupDesc} onChange={(e) => setFormGroupDesc(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
              </FormField>
              <FormField label="Status">
                <select value={formGroupStatus} onChange={(e) => setFormGroupStatus(e.target.value as 'Active' | 'Deactivated')} style={selectStyle}>
                  <option value="Active">Active</option>
                  <option value="Deactivated">Deactivated</option>
                </select>
              </FormField>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsEditGroupModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ marginTop: '5px' }}>{children}</div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' };
const selectStyle: React.CSSProperties = { ...inputStyle };
const thStyle: React.CSSProperties = { padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '12px 16px', fontSize: '12.5px' };
