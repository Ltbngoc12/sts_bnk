'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';

interface BroadcastTemplate {
  id: string;
  category: 'Incident Broadcast' | 'Crisis Broadcast' | 'End-of-Day Interim Broadcast';
  name: string;
  subject: string;
  body: string;
}

interface MatrixRule {
  id: string;
  crisisLevel: string;
  broadcastType: string;
  recipientGroup: string;
  deliveryChannels: string[];
}

interface DeliveryChannel {
  name: string;
  details: string;
  status: 'Active' | 'Inactive';
}

const DEFAULT_TEMPLATES: BroadcastTemplate[] = [
  {
    id: 'tpl-1',
    category: 'Incident Broadcast',
    name: 'Standard Incident Notification',
    subject: '[ALERT] SDC Operational Alert: {incident_title}',
    body: 'Incident ID: {incident_id}\nClassification: {incident_type}\nLocation: {location}\nTime Logged: {time}\nSeverity Level: {crisis_level}\nStatus: {status}\n\nDescription: {summary}\n\nThis is an automated dispatch from Sentosa. Responders have been deployed.'
  },
  {
    id: 'tpl-2',
    category: 'Crisis Broadcast',
    name: 'Major Crisis Alert',
    subject: '[URGENT] Emergency Crisis Escalation: {incident_title}',
    body: 'CRITICAL EMERGENCY WARNING:\nA major crisis event (Level {crisis_level}) has been declared at Sentosa Island.\nEvent: {incident_title}\nLocation: {location}\nTime: {time}\n\nOperational Action: Emergency agencies SCDF/SPF have been alerted and are conveying to scene. All precinct managers please prepare to coordinate evacuation.'
  },
  {
    id: 'tpl-3',
    category: 'End-of-Day Interim Broadcast',
    name: 'End-of-Day Operational Summary',
    subject: '[SUMMARY] Sentosa End-of-Day Interim Broadcast - {time}',
    body: 'Sentosa Daily Briefing Summary:\nDate: {time}\n\nToday\'s Operations Overview:\n- Total Active Cases: {total_incidents}\n- Unclosed Safety/Security Events: {open_incidents}\n- Closed Logs: {closed_incidents}\n- CMMS Fault Tickets Raised: {active_tasks}\n\nThis interim broadcast summary was audited and dispatched by the Duty Manager on duty.'
  }
];

const DEFAULT_MATRIX: MatrixRule[] = [
  { id: 'mat-1', crisisLevel: 'Level 1 & 2 (Emergency)', broadcastType: 'Crisis Broadcast', recipientGroup: 'SDC Crisis Command', deliveryChannels: ['Email', 'SMS', 'System Notification'] },
  { id: 'mat-2', crisisLevel: 'Level 3 (Alert)', broadcastType: 'Incident Broadcast', recipientGroup: 'SDC Crisis Command', deliveryChannels: ['Email', 'System Notification'] },
  { id: 'mat-3', crisisLevel: 'Level 4 & 5 (Routine)', broadcastType: 'Incident Broadcast', recipientGroup: 'Beach Operators & F&B Tenants', deliveryChannels: ['Email'] }
];

const DEFAULT_CHANNELS: DeliveryChannel[] = [
  { name: 'Email Gateway', details: 'Host: smtp.sdc.gov.sg | Encryption: STARTTLS | Port: 587', status: 'Active' },
  { name: 'SMS Gateway', details: 'On-premises HTTP Gateway | API: sms-gate.sdc.local', status: 'Active' },
  { name: 'System Notification', details: 'Real-time WebSocket Broadcast Server | Port: 8082', status: 'Active' }
];

const MOCK_VARS = {
  incident_id: 'SEN/IR/20260613/0014',
  incident_title: 'Water Pipe Burst near Beach Station',
  incident_type: 'Facilities',
  location: 'Siloso Beach Walk - Siloso Beach Station Level 1 Space ticket-counter',
  time: '2026-06-13 22:45:00',
  crisis_level: '3',
  status: 'Live (On-Site)',
  summary: 'Major water leakage detected under ticketing kiosk. Tram lines flooded.',
  total_incidents: '12',
  open_incidents: '4',
  closed_incidents: '8',
  active_tasks: '3'
};

export default function BroadcastConfigPage() {
  const { username } = useRole();
  const [activeSec, setActiveSec] = useState<'Templates' | 'Matrix' | 'Channels'>('Templates');
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [matrix, setMatrix] = useState<MatrixRule[]>([]);
  const [channels, setChannels] = useState<DeliveryChannel[]>([]);

  // Selected Template state
  const [selectedTemplate, setSelectedTemplate] = useState<BroadcastTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formBody, setFormBody] = useState('');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Selected Matrix state
  const [isMatrixModalOpen, setIsMatrixModalOpen] = useState(false);
  const [selectedMatrixRule, setSelectedMatrixRule] = useState<MatrixRule | null>(null);
  const [formCrisis, setFormCrisis] = useState('');
  const [formBType, setFormBType] = useState('');
  const [formGroup, setFormGroup] = useState('');
  const [formChannels, setFormChannels] = useState<string[]>([]);

  useEffect(() => {
    const tStored = localStorage.getItem('admin_bc_templates');
    const mStored = localStorage.getItem('admin_bc_matrix');
    const cStored = localStorage.getItem('admin_bc_channels');

    if (tStored) setTemplates(JSON.parse(tStored));
    else { setTemplates(DEFAULT_TEMPLATES); localStorage.setItem('admin_bc_templates', JSON.stringify(DEFAULT_TEMPLATES)); }

    if (mStored) setMatrix(JSON.parse(mStored));
    else { setMatrix(DEFAULT_MATRIX); localStorage.setItem('admin_bc_matrix', JSON.stringify(DEFAULT_MATRIX)); }

    if (cStored) setChannels(JSON.parse(cStored));
    else { setChannels(DEFAULT_CHANNELS); localStorage.setItem('admin_bc_channels', JSON.stringify(DEFAULT_CHANNELS)); }
  }, []);

  const saveTemplates = (updated: BroadcastTemplate[]) => {
    setTemplates(updated);
    localStorage.setItem('admin_bc_templates', JSON.stringify(updated));
  };

  const saveMatrix = (updated: MatrixRule[]) => {
    setMatrix(updated);
    localStorage.setItem('admin_bc_matrix', JSON.stringify(updated));
  };

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
          correlationId: `BCS-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplate) return;

    const updated = templates.map(t => {
      if (t.id === selectedTemplate.id) {
        return {
          ...t,
          name: formName,
          subject: formSubject,
          body: formBody
        };
      }
      return t;
    });

    const updatedTemplate = updated.find(t => t.id === selectedTemplate.id);
    logAudit('Update Template', selectedTemplate, updatedTemplate, `Updated broadcast template: ${formName}`);
    saveTemplates(updated);
    setSelectedTemplate(updatedTemplate || null);
    alert('Template saved successfully!');
  };

  const handleSaveMatrixRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMatrixRule) {
      // Edit
      const updated = matrix.map(m => {
        if (m.id === selectedMatrixRule.id) {
          return {
            ...m,
            crisisLevel: formCrisis,
            broadcastType: formBType,
            recipientGroup: formGroup,
            deliveryChannels: formChannels
          };
        }
        return m;
      });
      const updatedRule = updated.find(m => m.id === selectedMatrixRule.id);
      logAudit('Update Matrix Rule', selectedMatrixRule, updatedRule, `Updated broadcast matrix rule for: ${formCrisis}`);
      saveMatrix(updated);
    } else {
      // Create
      const newRule: MatrixRule = {
        id: `mat-${Date.now()}`,
        crisisLevel: formCrisis,
        broadcastType: formBType,
        recipientGroup: formGroup,
        deliveryChannels: formChannels
      };
      logAudit('Create Matrix Rule', null, newRule, `Created new broadcast matrix rule for: ${formCrisis}`);
      saveMatrix([...matrix, newRule]);
    }
    setIsMatrixModalOpen(false);
  };

  const openEditMatrixRule = (rule: MatrixRule | null) => {
    setSelectedMatrixRule(rule);
    if (rule) {
      setFormCrisis(rule.crisisLevel);
      setFormBType(rule.broadcastType);
      setFormGroup(rule.recipientGroup);
      setFormChannels(rule.deliveryChannels);
    } else {
      setFormCrisis('Level 4 & 5 (Routine)');
      setFormBType('Incident Broadcast');
      setFormGroup('Beach Operators & F&B Tenants');
      setFormChannels(['Email']);
    }
    setIsMatrixModalOpen(true);
  };

  const handleToggleChannelStatus = (chName: string) => {
    const updated = channels.map(c => {
      if (c.name === chName) {
        const nextStatus: 'Active' | 'Inactive' = c.status === 'Active' ? 'Inactive' : 'Active';
        logAudit('Toggle Channel Status', c, { ...c, status: nextStatus }, `Toggled gateway channel ${chName} to ${nextStatus}`);
        return { ...c, status: nextStatus };
      }
      return c;
    });
    setChannels(updated);
    localStorage.setItem('admin_bc_channels', JSON.stringify(updated));
  };

  const renderVarsPreview = (subjectOrBody: string) => {
    let output = subjectOrBody;
    Object.entries(MOCK_VARS).forEach(([key, val]) => {
      output = output.replace(new RegExp(`{${key}}`, 'g'), val);
    });
    return output;
  };

  return (
    <AdminGuard pageTitle="Broadcast Configuration">
      <div className="admin-header-bar glass" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>BROADCAST CONFIGURATION</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Configure notification layouts, crisis routing matrix rules, and delivery channels gateways.</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '2px' }}>
        {(['Templates', 'Matrix', 'Channels'] as const).map(sec => (
          <button
            key={sec}
            onClick={() => setActiveSec(sec)}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              borderBottom: activeSec === sec ? '3px solid var(--color-primary)' : '3px solid transparent',
              color: activeSec === sec ? 'var(--color-primary-dark)' : 'var(--text-muted)',
              fontWeight: activeSec === sec ? 700 : 500,
              fontSize: '13.5px',
              cursor: 'pointer',
              outline: 'none',
              transition: 'all 0.15s'
            }}
          >
            {sec === 'Templates' && 'Broadcast Templates'}
            {sec === 'Matrix' && 'Broadcast Matrix'}
            {sec === 'Channels' && 'Delivery Channels Gateways'}
          </button>
        ))}
      </div>

      {/* SECTION: TEMPLATES */}
      {activeSec === 'Templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '20px', marginTop: '20px' }}>
          {/* Left: Templates List */}
          <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', height: 'fit-content' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', marginBottom: '15px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>AVAILABLE TEMPLATES</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {templates.map(tpl => (
                <button
                  key={tpl.id}
                  onClick={() => {
                    setSelectedTemplate(tpl);
                    setFormName(tpl.name);
                    setFormSubject(tpl.subject);
                    setFormBody(tpl.body);
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid ' + (selectedTemplate?.id === tpl.id ? 'var(--color-primary-border)' : 'var(--border-color)'),
                    background: selectedTemplate?.id === tpl.id ? 'var(--color-primary-bg)' : 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)' }}>{tpl.category}</div>
                  <div style={{ fontWeight: 600, color: selectedTemplate?.id === tpl.id ? 'var(--color-primary-dark)' : 'var(--text-main)', fontSize: '13px', marginTop: '2px' }}>{tpl.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Right: Template Editor */}
          {selectedTemplate ? (
            <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)' }}>
              <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>
                Template: {selectedTemplate.category}
              </h2>
              <form onSubmit={handleSaveTemplate} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Template Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Subject Header</label>
                  <input
                    type="text"
                    required
                    value={formSubject}
                    onChange={e => setFormSubject(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Message Body</label>
                  <textarea
                    rows={8}
                    required
                    value={formBody}
                    onChange={e => setFormBody(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12.5px', fontFamily: 'var(--font-mono)', resize: 'vertical', lineHeight: '1.4' }}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="button" onClick={() => setIsPreviewOpen(true)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>
                    Preview variables
                  </button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
                    Save changes
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px', background: 'var(--bg-card)' }}>
              <span>✉️</span>
              <h3>No Template Selected</h3>
              <p style={{ fontSize: '12.5px', marginTop: '6px' }}>Select a broadcast template from the left menu to view, modify text structures or preview output variables.</p>
            </div>
          )}
        </div>
      )}

      {/* SECTION: MATRIX */}
      {activeSec === 'Matrix' && (
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', color: 'var(--text-main)', margin: 0 }}>CRISIS BROADCAST MATRIX</h2>
            <button onClick={() => openEditMatrixRule(null)} className="btn btn-primary" style={{ padding: '6px 12px', borderRadius: '4px', fontSize: '12.5px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>
              + Add Rule
            </button>
          </div>
          <div className="table-container" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
            <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Crisis Level</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Broadcast Type</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Recipient Group</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Delivery Channel</th>
                  <th style={{ padding: '12px 16px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', width: '120px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{rule.crisisLevel}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px' }}>{rule.broadcastType}</td>
                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: 'var(--color-primary-dark)' }}>{rule.recipientGroup}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {rule.deliveryChannels.map(ch => (
                          <span key={ch} className="badge badge-onsite" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                            {ch}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button onClick={() => openEditMatrixRule(rule)} className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', borderRadius: '4px' }}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION: CHANNELS */}
      {activeSec === 'Channels' && (
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', marginTop: '20px' }}>
          <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '14px', marginBottom: '15px', color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
            DELIVERY GATEWAY CONFIGURATIONS
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {channels.map(ch => (
              <div key={ch.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', border: '1px solid var(--border-color)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)' }}>{ch.name}</h3>
                  <p style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: '4px' }}>{ch.details}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <span className={`badge ${ch.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px' }}>
                    {ch.status}
                  </span>
                  <button
                    onClick={() => handleToggleChannelStatus(ch.name)}
                    className={`btn ${ch.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                    style={{ padding: '6px 12px', fontSize: '12.5px', borderRadius: '4px' }}
                  >
                    {ch.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TEMPLATE VARIABLES PREVIEW MODAL */}
      {isPreviewOpen && selectedTemplate && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '600px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
              Variables Preview - {selectedTemplate.name}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Subject Preview</strong>
                <div style={{ padding: '10px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                  {renderVarsPreview(formSubject)}
                </div>
              </div>
              <div>
                <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Body Message Preview</strong>
                <div style={{ padding: '12px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)', fontFamily: 'var(--font-mono)', fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                  {renderVarsPreview(formBody)}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setIsPreviewOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Close Preview</button>
            </div>
          </div>
        </div>
      )}

      {/* MATRIX RULE CREATE / EDIT MODAL */}
      {isMatrixModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-box glass" style={{ width: '100%', maxWidth: '480px', padding: '24px', background: 'var(--bg-card)' }}>
            <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '18px', marginBottom: '20px' }}>
              {selectedMatrixRule ? 'Edit Matrix Rule' : 'Add Matrix Rule'}
            </h2>
            <form onSubmit={handleSaveMatrixRule} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Crisis Level</label>
                <select
                  value={formCrisis}
                  onChange={e => setFormCrisis(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                >
                  <option value="Level 1 & 2 (Emergency)">Level 1 & 2 (Emergency)</option>
                  <option value="Level 3 (Alert)">Level 3 (Alert)</option>
                  <option value="Level 4 & 5 (Routine)">Level 4 & 5 (Routine)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Broadcast Type</label>
                <select
                  value={formBType}
                  onChange={e => setFormBType(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                >
                  <option value="Incident Broadcast">Incident Broadcast</option>
                  <option value="Crisis Broadcast">Crisis Broadcast</option>
                  <option value="End-of-Day Interim Broadcast">End-of-Day Interim Broadcast</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Recipient Group</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SDC Crisis Command"
                  value={formGroup}
                  onChange={e => setFormGroup(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Delivery Channels (comma-separated)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Email, SMS, System Notification"
                  value={formChannels.join(', ')}
                  onChange={e => setFormChannels(e.target.value.split(',').map(s => s.trim()))}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button type="button" onClick={() => setIsMatrixModalOpen(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminGuard>
  );
}
