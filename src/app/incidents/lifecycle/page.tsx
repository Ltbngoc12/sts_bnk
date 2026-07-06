'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface StatusDetail {
  name: string;
  lane: 'incident' | 'responder';
  badgeClass: string;
  color: string;
  description: string;
  whoCanTransition: string[];
  actionTriggers: string[];
  operationalImpacts: string[];
  actionPanelState: string;
}

// ─── Incident-level status (Controller-driven) ──────────────────────────────
// Reduced to 5 values. Per-Responder progress no longer lives here — see the
// Responder lane below. Per Incident_Status_Model_Design_Updated.docx.
const incidentStatusDetails: Record<string, StatusDetail> = {
  'Live': {
    name: 'Live',
    lane: 'incident',
    badgeClass: 'badge-live',
    color: '#DC2626',
    description: 'The incident has been registered in the system and is currently active with no Responder assigned yet.',
    whoCanTransition: ['System Administrator', 'Controller', 'Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Creating a new incident via the Incident Log creation page.',
      'Auto-triggering of a Video Analytics (VA) sensor or UCS fire alarm.',
      'Administrator reopening a Closed incident.'
    ],
    operationalImpacts: [
      'Creates a new unique Case & Incident ID.',
      'Alerts Controllers on the dashboard with a flashing priority card.'
    ],
    actionPanelState: 'Assignable: Displays list of available Rangers/Responders for dispatch.'
  },
  'Live (Assigned)': {
    name: 'Live (Assigned)',
    lane: 'incident',
    badgeClass: 'badge-assigned',
    color: '#EA580C',
    description: 'One or more Responders are assigned and actively working. This label stays constant for the entire duration of ground work — it does NOT change as individual Responders progress through Acknowledged / On-Site / Pending Controller Review / Completed. That per-Responder progress is tracked separately below.',
    whoCanTransition: ['Controller', 'Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Controller assigns one or more Responders from the Incident Log dashboard.',
      'Controller adds/removes Responders while ground work is in progress.'
    ],
    operationalImpacts: [
      'Sends a dispatch notification to each assigned Responder.',
      'Each Responder begins progressing through their own lifecycleStatus, in parallel.'
    ],
    actionPanelState: 'Dispatched: Controller can submit/Force Submit for endorsement, or return specific Responder(s) for rework, at any time while in this status.'
  },
  'Pending Endorsement': {
    name: 'Pending Endorsement',
    lane: 'incident',
    badgeClass: 'badge-review',
    color: '#4A148C',
    description: 'Submitted by the Controller for Duty Manager approval to close. Every assigned Responder has just been set to Completed at the moment of submission — including via Force Submit, regardless of how far each had individually progressed.',
    whoCanTransition: ['Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Controller submits (standard — every Responder already at Pending Controller Review).',
      'Controller Force Submits (at least one Responder still Assigned/Acknowledged/On-Site) — confirmation popup only, no justification text required.'
    ],
    operationalImpacts: [
      'Locks the record — assigned Responders lose further input access.',
      'Every active Responder is set to Completed.',
      'Displays the Approve / Return to Controller action panel for Duty Manager.'
    ],
    actionPanelState: 'DM Review Panel: Approve & Close, or Return to Controller.'
  },
  'Returned': {
    name: 'Returned',
    lane: 'incident',
    badgeClass: 'badge-live',
    color: '#DC2626',
    description: 'Duty Manager has returned the incident to the Controller for amendment.',
    whoCanTransition: ['Duty Officer', 'Duty Manager'],
    actionTriggers: ['Duty Manager clicks "Return to Controller" on a Pending Endorsement incident and inputs return justification notes.'],
    operationalImpacts: [
      'Unlocks the incident for editing by the Controller.',
      'Controller may amend and resubmit, or return specific Responder(s) for further ground work (drops back to Live (Assigned)).'
    ],
    actionPanelState: 'Rework Mode: Controller can edit, return Responder(s), or resubmit for endorsement.'
  },
  'Closed': {
    name: 'Closed',
    lane: 'incident',
    badgeClass: 'badge-closed',
    color: '#6B7280',
    description: 'Approved and endorsed by the Duty Manager. The entire record is read-only.',
    whoCanTransition: ['Duty Officer', 'Duty Manager'],
    actionTriggers: ['Duty Manager or Duty Officer clicks "Approve & Close" on a Pending Endorsement incident.'],
    operationalImpacts: ['Case status set to Closed.', 'Record becomes strictly read-only (except System Administrator reopen).'],
    actionPanelState: 'Read-Only Panel.'
  }
};

// ─── Responder-level status (per assignment, runs in parallel for every assigned Responder) ──
const responderStatusDetails: Record<string, StatusDetail> = {
  'Assigned': {
    name: 'Assigned',
    lane: 'responder',
    badgeClass: 'badge-assigned',
    color: '#EA580C',
    description: 'This Responder has been assigned and is awaiting their own acknowledgement of the dispatch.',
    whoCanTransition: ['Controller (assigns)', 'Responder (acknowledges)'],
    actionTriggers: ['Controller assigns this Responder to the Incident.'],
    operationalImpacts: ['Push notification sent to this Responder.'],
    actionPanelState: 'Awaiting this Responder’s acknowledgement. Controller may act on their behalf if needed.'
  },
  'Acknowledged': {
    name: 'Acknowledged',
    lane: 'responder',
    badgeClass: 'badge-ack',
    color: '#EA580C',
    description: 'This Responder has acknowledged the assignment and is en route.',
    whoCanTransition: ['Responder', 'Controller (on behalf of Responder)'],
    actionTriggers: ['Responder taps "Acknowledge Dispatch".'],
    operationalImpacts: ['Timeline entry logged for this Responder.'],
    actionPanelState: 'In-Transit — Responder can mark Arrived On-Site.'
  },
  'On-Site': {
    name: 'On-Site',
    lane: 'responder',
    badgeClass: 'badge-onsite',
    color: '#008C95',
    description: 'This Responder has arrived and ground activities are underway.',
    whoCanTransition: ['Responder', 'Controller (on behalf of Responder)'],
    actionTriggers: ['Responder taps "Arrived On-Site".'],
    operationalImpacts: ['Unlocks ground editing/uploads for this Responder.'],
    actionPanelState: 'On-Site Management — Responder can Notify Completion when ground activities are done.'
  },
  'Pending Controller Review': {
    name: 'Pending Controller Review',
    lane: 'responder',
    badgeClass: 'badge-pending-ctrl',
    color: '#C2410C',
    description: 'This Responder has notified completion of ground activities and is awaiting Controller verification. Locked for this Responder until the Controller either includes them in a submission or returns them for rework.',
    whoCanTransition: ['Responder (arrives here)', 'Controller (reviews)'],
    actionTriggers: ['Responder clicks "Notify Completion".'],
    operationalImpacts: ['This Responder’s record is locked pending Controller action.'],
    actionPanelState: 'Awaiting Controller: included in the next Submit/Force Submit → Completed, or returned individually → Live (Incomplete).'
  },
  'Live (Incomplete)': {
    name: 'Live (Incomplete)',
    lane: 'responder',
    badgeClass: 'badge-ack',
    color: '#EA580C',
    description: 'Updated per client review: the Controller returns SPECIFIC Responder(s) via multi-select — not the full assigned set. Each returned Responder gets its own Completion Remarks (not one shared remark).',
    whoCanTransition: ['Controller'],
    actionTriggers: ['Controller selects this Responder (among possibly several) in the Return to Responder dialog and enters remarks for them.'],
    operationalImpacts: ['Notifies this Responder with their own return reason.', 'Unlocks ground activity for this Responder only — other Responders are unaffected.'],
    actionPanelState: 'Ground Activity Mode (this Responder only) — must re-submit via Notify Completion.'
  },
  'Completed': {
    name: 'Completed',
    lane: 'responder',
    badgeClass: 'badge-completed',
    color: '#10B981',
    description: 'New status added per client review. Set when the Controller submits or resubmits the Incident for endorsement — applied to EVERY assigned Responder at that moment, regardless of individual stage. Includes Responders still at Assigned/Acknowledged/On-Site if the record is locked via Force Submit.',
    whoCanTransition: ['Controller (via Submit / Force Submit)'],
    actionTriggers: ['Controller submits for endorsement (standard or Force Submit).'],
    operationalImpacts: ['This Responder loses further input access for the remainder of this submission cycle.'],
    actionPanelState: 'Locked — no further Responder action until/unless returned again.'
  }
};

type Lane = 'both' | 'incident' | 'responder';

export default function IncidentLifecyclePage() {
  const [lane, setLane] = useState<Lane>('both');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const activeNodeDetails = selectedNode
    ? (incidentStatusDetails[selectedNode] || responderStatusDetails[selectedNode])
    : null;

  const showIncident = lane === 'both' || lane === 'incident';
  const showResponder = lane === 'both' || lane === 'responder';

  return (
    <>
      <style jsx global>{`
        .lifecycle-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; margin-bottom: 4px; }
        .lifecycle-header h1 { font-family: var(--font-headline); font-size: 18px; font-weight: 700; color: var(--text-main); letter-spacing: -0.01em; }
        .lifecycle-container { display: grid; grid-template-columns: 1fr; gap: 20px; }
        @media (min-width: 1100px) { .lifecycle-container { grid-template-columns: 1fr 360px; } }
        .path-selectors { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; background: var(--bg-inset); padding: 6px; border-radius: var(--radius-lg); border: 1px solid var(--border-color); }
        .path-btn { padding: 8px 16px; font-size: 12.5px; font-weight: 600; border-radius: var(--radius-md); border: none; background: transparent; color: var(--text-muted); cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; gap: 6px; }
        .path-btn:hover { color: var(--text-main); background: rgba(255, 130, 0, 0.05); }
        .path-btn.active { background: var(--bg-card); color: var(--color-primary); box-shadow: 0 2px 6px rgba(43, 31, 29, 0.06); border: 1px solid var(--border-color); }
        .flowchart-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); padding: 24px; min-height: 480px; display: flex; flex-direction: column; position: relative; }
        .flowchart-scroll-wrapper { width: 100%; overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--border-color) transparent; padding-bottom: 10px; }
        .svg-node { cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
        .svg-node rect { transition: all 0.25s ease; }
        .svg-node:hover rect { transform: translateY(-2px); filter: drop-shadow(0 4px 10px rgba(0,0,0,0.08)); }
        .svg-node.selected rect { stroke-width: 3px; filter: drop-shadow(0 0 8px currentColor); }
        .lane-label { font-family: var(--font-body); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; fill: var(--text-muted); }
        .inspector-card { background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-lg); display: flex; flex-direction: column; height: fit-content; position: sticky; top: 20px; }
        .inspector-header { padding: 16px 20px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; }
        .inspector-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
        .section-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.08em; margin-bottom: 6px; }
        .badge-live { background: rgba(220, 38, 38, 0.08); color: #DC2626; border: 1px solid rgba(220, 38, 38, 0.15); }
        .badge-assigned { background: rgba(234, 88, 12, 0.08); color: #EA580C; border: 1px solid rgba(234, 88, 12, 0.15); }
        .badge-ack { background: rgba(234, 88, 12, 0.08); color: #EA580C; border: 1px solid rgba(234, 88, 12, 0.15); }
        .badge-onsite { background: rgba(0, 140, 149, 0.08); color: #008C95; border: 1px solid rgba(0, 140, 149, 0.15); }
        .badge-pending-ctrl { background: rgba(194, 65, 12, 0.08); color: #C2410C; border: 1px solid rgba(194, 65, 12, 0.15); }
        .badge-completed { background: rgba(16, 185, 129, 0.08); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.15); }
        .badge-review { background: rgba(74, 20, 140, 0.08); color: #4A148C; border: 1px solid rgba(74, 20, 140, 0.15); }
        .badge-closed { background: rgba(107, 114, 128, 0.08); color: #6B7280; border: 1px solid rgba(107, 114, 128, 0.15); }
      `}</style>

      <div className="lifecycle-header glass">
        <div className="title-section">
          <h1>INCIDENT / RESPONDER STATUS MODEL</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Two parallel status lanes: Incident-level (Controller-driven) and Responder-level (per assignment, runs in parallel for every assigned Responder).
          </p>
        </div>
        <div>
          <Link href="/case-management?tab=incidents" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← Back to Incidents
          </Link>
        </div>
      </div>

      <div className="path-selectors glass">
        <button className={`path-btn ${lane === 'both' ? 'active' : ''}`} onClick={() => setLane('both')}>🌐 Both Lanes</button>
        <button className={`path-btn ${lane === 'incident' ? 'active' : ''}`} onClick={() => setLane('incident')}>🧭 Incident Lane Only</button>
        <button className={`path-btn ${lane === 'responder' ? 'active' : ''}`} onClick={() => setLane('responder')}>🧑‍🚒 Responder Lane Only</button>
      </div>

      <div className="lifecycle-container">
        <div className="flowchart-card glass">
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              Two-Lane Workflow Diagram
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>💡 Click a status node to inspect it</span>
          </div>

          <div className="flowchart-scroll-wrapper">
            <svg viewBox="0 0 1400 520" style={{ width: '100%', minWidth: '1200px', height: 'auto', display: 'block' }}>
              <defs>
                <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#D9D0C4" />
                </marker>
                <marker id="arrow-incident" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#EA580C" />
                </marker>
                <marker id="arrow-responder" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#008C95" />
                </marker>
                <marker id="arrow-link" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#4A148C" />
                </marker>
              </defs>

              {/* ── LANE LABELS ── */}
              {showIncident && <text x="10" y="60" className="lane-label">Incident-level status (Controller-driven)</text>}
              {showResponder && <text x="10" y="320" className="lane-label">Responder-level status (per assignment — runs in parallel)</text>}

              {/* ── INCIDENT LANE (y ≈ 90–160) ── */}
              {showIncident && (
                <>
                  <path d="M 150 125 H 210" stroke="#EA580C" strokeWidth="2.5" markerEnd="url(#arrow-incident)" />
                  <path d="M 400 125 H 460" stroke="#EA580C" strokeWidth="2.5" markerEnd="url(#arrow-incident)" />
                  <path d="M 650 125 H 710" stroke="#EA580C" strokeWidth="2.5" markerEnd="url(#arrow-incident)" />
                  {/* Pending Endorsement -> Returned (down) and Returned -> Live (Assigned) (back up) */}
                  <path d="M 780 155 C 780 200, 300 200, 300 155" fill="none" stroke="#DC2626" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#arrow-incident)" />
                  <path d="M 250 95 C 250 40, 750 40, 780 95" fill="none" stroke="#DC2626" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#arrow-incident)" />

                  <g className={`svg-node ${selectedNode === 'Live' ? 'selected' : ''}`} style={{ color: '#DC2626' }} onClick={() => setSelectedNode('Live')}>
                    <rect x="20" y="100" width="130" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live' ? '#DC2626' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live' ? '2.5' : '1'} />
                    <text x="85" y="130" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--text-main)">Live</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Live (Assigned)' ? 'selected' : ''}`} style={{ color: '#EA580C' }} onClick={() => setSelectedNode('Live (Assigned)')}>
                    <rect x="210" y="100" width="190" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (Assigned)' ? '#EA580C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (Assigned)' ? '2.5' : '1'} />
                    <text x="305" y="130" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-main)">Live (Assigned)</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Pending Endorsement' ? 'selected' : ''}`} style={{ color: '#4A148C' }} onClick={() => setSelectedNode('Pending Endorsement')}>
                    <rect x="460" y="100" width="190" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Pending Endorsement' ? '#4A148C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Pending Endorsement' ? '2.5' : '1'} />
                    <text x="555" y="130" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-main)">Pending Endorsement</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Closed' ? 'selected' : ''}`} style={{ color: '#6B7280' }} onClick={() => setSelectedNode('Closed')}>
                    <rect x="710" y="100" width="130" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Closed' ? '#6B7280' : 'var(--border-color)'} strokeWidth={selectedNode === 'Closed' ? '2.5' : '1'} />
                    <text x="775" y="130" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--text-main)">Closed</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Returned' ? 'selected' : ''}`} style={{ color: '#DC2626' }} onClick={() => setSelectedNode('Returned')}>
                    <rect x="235" y="160" width="130" height="45" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Returned' ? '#DC2626' : 'var(--border-color)'} strokeWidth={selectedNode === 'Returned' ? '2.5' : '1'} />
                    <text x="300" y="188" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-main)">Returned</text>
                  </g>
                </>
              )}

              {/* ── LINK between lanes: Live (Assigned) runs in parallel with Responder lane; Responder Completed -> Pending Endorsement ── */}
              {showIncident && showResponder && (
                <>
                  <path d="M 305 150 V 330" fill="none" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3 4" />
                  <path d="M 1020 390 C 1100 390, 1100 150, 850 125" fill="none" stroke="#4A148C" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#arrow-link)" />
                  <text x="900" y="250" fontSize="10.5" fill="#4A148C" fontWeight="700">Controller submits / Force Submit</text>
                </>
              )}

              {/* ── RESPONDER LANE (y ≈ 360–430) ── */}
              {showResponder && (
                <>
                  <path d="M 150 385 H 210" stroke="#008C95" strokeWidth="2.5" markerEnd="url(#arrow-responder)" />
                  <path d="M 350 385 H 410" stroke="#008C95" strokeWidth="2.5" markerEnd="url(#arrow-responder)" />
                  <path d="M 550 385 H 610" stroke="#008C95" strokeWidth="2.5" markerEnd="url(#arrow-responder)" />
                  <path d="M 850 385 H 910" stroke="#008C95" strokeWidth="2.5" markerEnd="url(#arrow-responder)" />
                  {/* Pending Controller Review -> Live (Incomplete) (down) and back up */}
                  <path d="M 780 415 C 780 460, 650 460, 650 415" fill="none" stroke="#EA580C" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#arrow-responder)" />
                  <path d="M 610 385 C 570 385, 570 355, 700 355 C 780 355, 780 355, 750 385" fill="none" stroke="#EA580C" strokeWidth="2" strokeDasharray="5 3" markerEnd="url(#arrow-responder)" />

                  <g className={`svg-node ${selectedNode === 'Assigned' ? 'selected' : ''}`} style={{ color: '#EA580C' }} onClick={() => setSelectedNode('Assigned')}>
                    <rect x="20" y="360" width="130" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Assigned' ? '#EA580C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Assigned' ? '2.5' : '1'} />
                    <text x="85" y="390" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--text-main)">Assigned</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Acknowledged' ? 'selected' : ''}`} style={{ color: '#EA580C' }} onClick={() => setSelectedNode('Acknowledged')}>
                    <rect x="210" y="360" width="140" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Acknowledged' ? '#EA580C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Acknowledged' ? '2.5' : '1'} />
                    <text x="280" y="390" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-main)">Acknowledged</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'On-Site' ? 'selected' : ''}`} style={{ color: '#008C95' }} onClick={() => setSelectedNode('On-Site')}>
                    <rect x="410" y="360" width="140" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'On-Site' ? '#008C95' : 'var(--border-color)'} strokeWidth={selectedNode === 'On-Site' ? '2.5' : '1'} />
                    <text x="480" y="390" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--text-main)">On-Site</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Pending Controller Review' ? 'selected' : ''}`} style={{ color: '#C2410C' }} onClick={() => setSelectedNode('Pending Controller Review')}>
                    <rect x="610" y="360" width="240" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Pending Controller Review' ? '#C2410C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Pending Controller Review' ? '2.5' : '1'} />
                    <text x="730" y="390" textAnchor="middle" fontSize="11.5" fontWeight="600" fill="var(--text-main)">Pending Controller Review</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Completed' ? 'selected' : ''}`} style={{ color: '#10B981' }} onClick={() => setSelectedNode('Completed')}>
                    <rect x="910" y="360" width="130" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Completed' ? '#10B981' : 'var(--border-color)'} strokeWidth={selectedNode === 'Completed' ? '2.5' : '1'} />
                    <text x="975" y="390" textAnchor="middle" fontSize="12.5" fontWeight="600" fill="var(--text-main)">Completed</text>
                  </g>
                  <g className={`svg-node ${selectedNode === 'Live (Incomplete)' ? 'selected' : ''}`} style={{ color: '#EA580C' }} onClick={() => setSelectedNode('Live (Incomplete)')}>
                    <rect x="585" y="420" width="200" height="45" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (Incomplete)' ? '#EA580C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (Incomplete)' ? '2.5' : '1'} strokeDasharray="4 2" />
                    <text x="685" y="448" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--text-main)">Live (Incomplete)</text>
                  </g>
                </>
              )}
            </svg>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: '18px', borderTop: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '3px', background: '#EA580C', display: 'inline-block' }} /> Incident-lane transition</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '3px', background: '#008C95', display: 'inline-block' }} /> Responder-lane transition</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '3px', background: '#4A148C', display: 'inline-block' }} /> Cross-lane link (submit / Force Submit)</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10B981' }} /> Completed / Closed</div>
          </div>
        </div>

        <div className="inspector-card glass">
          <div className="inspector-header">
            <h2 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              Status Inspector
            </h2>
            {activeNodeDetails && (
              <span className={`badge ${activeNodeDetails.badgeClass}`} style={{ fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}>
                {activeNodeDetails.lane === 'incident' ? 'Incident' : 'Responder'}
              </span>
            )}
          </div>

          <div className="inspector-body">
            {!activeNodeDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '10px', paddingBottom: '10px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '28px' }}>🔍</div>
                <h3 style={{ textTransform: 'none', letterSpacing: 'normal', fontSize: '13px', color: 'var(--text-main)', fontWeight: '600' }}>
                  No Status Selected
                </h3>
                <p style={{ fontSize: '12px', lineHeight: '1.5' }}>
                  Click any status node in either lane to inspect its permissions, triggers, and impact.
                </p>
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '8px', paddingTop: '12px', textAlign: 'left' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.04em' }}>
                    Key rules
                  </h4>
                  <ul style={{ fontSize: '11px', paddingLeft: '14px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Incident-level status never reflects any single Responder&rsquo;s progress.</li>
                    <li>Each assigned Responder progresses through the bottom lane independently and in parallel.</li>
                    <li>Return (Live (Incomplete)) is per-Responder, multi-select, each with its own remarks.</li>
                    <li>Completed is set for every active Responder the moment the Controller submits/Force Submits.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="section-label">{activeNodeDetails.name}</div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-main)', lineHeight: '1.45' }}>
                    {activeNodeDetails.description}
                  </p>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div className="section-label">Who Can Transition</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {activeNodeDetails.whoCanTransition.map((role) => (
                      <span key={role} style={{ fontSize: '11px', fontWeight: '600', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-inset)', border: '1px solid var(--border-color)', color: 'var(--text-sub)' }}>
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div className="section-label">Action Triggers</div>
                  <ul style={{ paddingLeft: '14px', listStyleType: 'disc', fontSize: '11.5px', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {activeNodeDetails.actionTriggers.map((trig, idx) => (<li key={idx}>{trig}</li>))}
                  </ul>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div className="section-label">Action Panel Representation</div>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '11.5px', color: 'var(--text-sub)', fontWeight: '500' }}>
                    {activeNodeDetails.actionPanelState}
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div className="section-label">Operational Impacts</div>
                  <ul style={{ paddingLeft: '14px', listStyleType: 'disc', fontSize: '11.5px', color: 'var(--text-sub)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {activeNodeDetails.operationalImpacts.map((imp, idx) => (<li key={idx}>{imp}</li>))}
                  </ul>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
