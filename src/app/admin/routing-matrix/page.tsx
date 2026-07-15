'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';

interface RoutingRule {
  id: string;
  category: 'Incident' | 'Fault' | 'Escalation';
  condition: string;
  destinationTeam: string;
  priority: 'Low' | 'Normal' | 'High' | 'Critical';
  status: 'Active' | 'Disabled';
}

const DEFAULT_RULES: RoutingRule[] = [
  // Incident Routing
  { id: 'rule-inc-1', category: 'Incident', condition: 'Incident Type = "Security" AND Zone = "Siloso Beach Walk"', destinationTeam: 'Ranger Team Alpha (Siloso)', priority: 'High', status: 'Active' },
  { id: 'rule-inc-2', category: 'Incident', condition: 'Incident Type = "Safety" AND Incident Sub-Type = "Medical Emergency"', destinationTeam: 'Medical Response Unit (Palawan)', priority: 'Critical', status: 'Active' },
  { id: 'rule-inc-3', category: 'Incident', condition: 'Incident Type = "Environmental"', destinationTeam: 'Horticulture & Wildlife Team', priority: 'Normal', status: 'Active' },

  // Fault Routing
  { id: 'rule-flt-1', category: 'Fault', condition: 'Fault Type = "Mechanical" AND Location = "Cable Car Station"', destinationTeam: 'Lift & Cable Maint. Team', priority: 'High', status: 'Active' },
  { id: 'rule-flt-2', category: 'Fault', condition: 'Fault Type = "Electrical"', destinationTeam: 'SDC Power Grid Contractor', priority: 'Normal', status: 'Active' },
  { id: 'rule-flt-3', category: 'Fault', condition: 'Fault Type = "Structural" AND Severity = "High"', destinationTeam: 'Civil Works Express Crew', priority: 'High', status: 'Disabled' },

  // Escalation Routing
  { id: 'rule-esc-1', category: 'Escalation', condition: 'Incident Status = "Live (Unassigned)" FOR > 15 mins', destinationTeam: 'IOH Duty Officer', priority: 'High', status: 'Active' },
  { id: 'rule-esc-2', category: 'Escalation', condition: 'Crisis Level <= 2 OR Incident Type = "Crisis"', destinationTeam: 'IOH Duty Manager (Shift Commander)', priority: 'Critical', status: 'Active' },
  { id: 'rule-esc-3', category: 'Escalation', condition: 'Task Priority = "High" AND SLA On-Site Breach > 30 mins', destinationTeam: 'Head of SDC Security Ops', priority: 'High', status: 'Active' }
];

export default function RoutingMatrixPage() {
  const { username } = useRole();
  const [activeTab, setActiveTab] = useState<'Incident' | 'Fault' | 'Escalation'>('Incident');
  const [rules, setRules] = useState<RoutingRule[]>([]);
  
  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedRule, setSelectedRule] = useState<RoutingRule | null>(null);

  // Form fields
  const [formCondition, setFormCondition] = useState('');
  const [formDest, setFormDest] = useState('');
  const [formPriority, setFormPriority] = useState<'Low' | 'Normal' | 'High' | 'Critical'>('Normal');
  const [formStatus, setFormStatus] = useState<'Active' | 'Disabled'>('Active');

  useEffect(() => {
    const stored = localStorage.getItem('admin_routing_rules');
    if (stored) {
      setRules(JSON.parse(stored));
    } else {
      setRules(DEFAULT_RULES);
      localStorage.setItem('admin_routing_rules', JSON.stringify(DEFAULT_RULES));
    }
  }, []);

  const saveRulesState = (updated: RoutingRule[]) => {
    setRules(updated);
    localStorage.setItem('admin_routing_rules', JSON.stringify(updated));
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Routing Matrix',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `RTE-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const handleCreateOrEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedRule) {
      // Edit
      const updated = rules.map(r => {
        if (r.id === selectedRule.id) {
          return {
            ...r,
            condition: formCondition,
            destinationTeam: formDest,
            priority: formPriority,
            status: formStatus
          };
        }
        return r;
      });
      const updatedRule = updated.find(r => r.id === selectedRule.id);
      logAudit('Update Routing Rule', selectedRule, updatedRule, `Updated ${activeTab} routing rule: ${formDest}`);
      saveRulesState(updated);
    } else {
      // Create
      const newRule: RoutingRule = {
        id: `rule-${Date.now()}`,
        category: activeTab,
        condition: formCondition,
        destinationTeam: formDest,
        priority: formPriority,
        status: formStatus
      };
      logAudit('Create Routing Rule', null, newRule, `Created new ${activeTab} routing rule targeting: ${formDest}`);
      saveRulesState([...rules, newRule]);
    }
    setIsModalOpen(false);
    resetForm();
  };

  const openCreate = () => {
    setSelectedRule(null);
    resetForm();
    setIsModalOpen(true);
  };

  const openEdit = (rule: RoutingRule) => {
    setSelectedRule(rule);
    setFormCondition(rule.condition);
    setFormDest(rule.destinationTeam);
    setFormPriority(rule.priority);
    setFormStatus(rule.status);
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setFormCondition('');
    setFormDest('');
    setFormPriority('Normal');
    setFormStatus('Active');
  };

  const activeRules = rules.filter(r => r.category === activeTab);

  return (
    <AdminGuard pageTitle="Routing Matrix">
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>OPERATIONAL ROUTING MATRIX</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Configure automated dispatcher routing rules for cases, CMMS maintenance tickets, and alert escalations.</p>
        </div>
        <button onClick={openCreate} className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}>
          <span>+</span> Create Rule
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {(['Incident', 'Fault', 'Escalation'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); resetForm(); }}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeTab === tab ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeTab === tab ? 'var(--color-primary-dark)' : 'var(--text-muted)',
              fontWeight: activeTab === tab ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s'
            }}
          >
            {tab === 'Incident' && 'Incident Routing Rules'}
            {tab === 'Fault' && 'Fault (CMMS) Routing'}
            {tab === 'Escalation' && 'Escalation Workflows'}
          </button>
        ))}
      </div>

      {/* Rules list */}
      <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
        <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Conditional logic</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Destination Responder / Team</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px' }}>Priority</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '130px' }}>Status</th>
                <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '180px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeRules.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>No routing rules configured.</td>
                </tr>
              ) : (
                activeRules.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: 'var(--text-main)', fontSize: '13px', fontFamily: 'var(--font-mono)' }}>{rule.condition}</td>
                    <td style={{ padding: '14px 16px', fontSize: '13.5px' }}>{rule.destinationTeam}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`badge ${
                        rule.priority === 'Critical' ? 'badge-live' :
                        rule.priority === 'High' ? 'badge-ack' :
                        rule.priority === 'Normal' ? 'badge-onsite' :
                        'badge-closed'
                      }`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                        {rule.priority}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span className={`badge ${rule.status === 'Active' ? 'badge-completed' : 'badge-closed'}`} style={{ padding: '2px 8px', borderRadius: '4px' }}>
                        {rule.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => openEdit(rule)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '520px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              {selectedRule ? `Edit ${activeTab} Routing Rule` : `Create ${activeTab} Routing Rule`}
            </h2>
            <form onSubmit={handleCreateOrEdit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Conditional Query (SQL/Text logic)</label>
                <textarea
                  rows={2}
                  required
                  placeholder='e.g. Incident Type = "Security" AND Location = "Siloso"'
                  value={formCondition}
                  onChange={e => setFormCondition(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', fontFamily: 'var(--font-mono)', resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Destination Target Team</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ranger Team Alpha"
                  value={formDest}
                  onChange={e => setFormDest(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Priority Flag</label>
                  <select
                    value={formPriority}
                    onChange={e => setFormPriority(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Status</label>
                  <select
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value as any)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  >
                    <option value="Active">Active</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
