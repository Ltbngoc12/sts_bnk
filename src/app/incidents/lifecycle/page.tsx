'use client';

import React, { useState } from 'react';
import Link from 'next/link';

interface StatusDetail {
  name: string;
  badgeClass: string;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
  whoCanTransition: string[];
  actionTriggers: string[];
  operationalImpacts: string[];
  actionPanelState: string;
  relatedElements: string[];
}

const statusDetails: Record<string, StatusDetail> = {
  'Live': {
    name: 'Live',
    badgeClass: 'badge-live',
    color: '#DC2626',
    bgColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.25)',
    description: 'The incident has been registered in the system (either logged manually by a Controller or auto-triggered by a VA/UCS sensor) and is currently active but not yet dispatched to a field responder.',
    whoCanTransition: ['System Administrator', 'Controller', 'Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Creating a new incident via the Incident Log creation page.',
      'Auto-triggering of a Video Analytics (VA) sensor or UCS fire alarm.',
      'Administrator reopening a Closed incident.',
      'A Pending Endorsement incident being Returned by DM/DO and then updated by ground team.'
    ],
    operationalImpacts: [
      'Creates a new unique Case & Incident ID.',
      'Adds a Chronological Timeline entry: "Incident Created".',
      'Alerts Controllers on the dashboard with a flashing priority card.'
    ],
    actionPanelState: 'Assignable: Displays list of available Rangers/Responders for dispatch.',
    relatedElements: ['Incident log record', 'UCS alarm feed', 'Case Detail header']
  },
  'Live (Assigned)': {
    name: 'Live (Assigned)',
    badgeClass: 'badge-ack',
    color: '#EA580C',
    bgColor: 'rgba(234, 88, 12, 0.08)',
    borderColor: 'rgba(234, 88, 12, 0.25)',
    description: 'One or more ground Responders (Rangers) have been selected and dispatched to resolve the incident.',
    whoCanTransition: ['Controller', 'Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Controller/DM selects one or more Responders from the active Ranger list and dispatches them.'
    ],
    operationalImpacts: [
      'Sends a high-priority push notification to each assigned Responder\'s mobile app.',
      'Logs a Chronological Timeline entry: "Responder [Name] assigned".',
      'Updates Incident assignment metadata (plural) in Case Log.'
    ],
    actionPanelState: 'Manage Responders: Controller can add additional Responders or remove existing ones (enforcing that at least one remains assigned).',
    relatedElements: ['Ranger Mobile Dispatch Queue', 'Timeline: Dispatched']
  },
  'Live (Acknowledged)': {
    name: 'Live (Acknowledged)',
    badgeClass: 'badge-ack',
    color: '#EA580C',
    bgColor: 'rgba(234, 88, 12, 0.08)',
    borderColor: 'rgba(234, 88, 12, 0.25)',
    description: 'The dispatched Ranger has received the incident alert and confirmed they are en route to the site.',
    whoCanTransition: ['Responder (Ranger)', 'Controller (on behalf of Ranger)'],
    actionTriggers: [
      'Ranger taps the "Acknowledge Dispatch" button on their mobile device.',
      'Controller manually registers acknowledgement if Ranger experiences communication issues.'
    ],
    operationalImpacts: [
      'Logs a Chronological Timeline entry: "Responder [Name] acknowledged dispatch".',
      'Stops dispatch response SLA timer.'
    ],
    actionPanelState: 'In-Transit: Action panel shows ranger is en route with ETA.',
    relatedElements: ['SLA tracking database', 'Timeline: Acknowledged']
  },
  'Live (On-Site)': {
    name: 'Live (On-Site)',
    badgeClass: 'badge-onsite',
    color: '#008C95',
    bgColor: 'rgba(0, 140, 149, 0.08)',
    borderColor: 'rgba(0, 140, 149, 0.25)',
    description: 'The dispatched Ranger has arrived physically at the incident coordinate. On-site investigations and mitigation activities are actively underway.',
    whoCanTransition: ['Responder (Ranger)', 'Controller (on behalf of Ranger)'],
    actionTriggers: [
      'Ranger taps the "Arrived On-Site" button on their mobile device.',
      'Controller manually updates status to On-Site from the dashboard.'
    ],
    operationalImpacts: [
      'Unlocks ground incident editing and image upload capabilities on the incident record.',
      'Logs a Chronological Timeline entry: "Arrival on-site confirmed".',
      'Allows live updates, photos addition, and e-Diary entries.'
    ],
    actionPanelState: 'On-Site Management: Ranger can post live updates and upload case photos directly.',
    relatedElements: ['Base64 Photo Uploads', 'Incident Updates timeline', 'e-Diary record']
  },
  'Live (Completed)': {
    name: 'Live (Completed)',
    badgeClass: 'badge-completed',
    color: '#10B981',
    bgColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.25)',
    description: 'Ground resolution activities are completed. All required checklists have been checked, and a final summary has been logged.',
    whoCanTransition: ['Responder (Ranger)', 'Controller', 'Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Ranger completes all checklists, adds resolution remarks, and taps "Submit Report".',
      'Controller clicks "Mark Completed" on behalf of the ranger.'
    ],
    operationalImpacts: [
      'Triggers automatic state transition to "Pending Endorsement" for supervisor review.',
      'Logs a Chronological Timeline entry: "Ranger marked ground activities completed".'
    ],
    actionPanelState: 'Review-Ready: Readies the file for official submission.',
    relatedElements: ['Resolution checklist', 'Closure timeline events']
  },
  'Live (Incomplete)': {
    name: 'Live (Incomplete)',
    badgeClass: 'badge-live',
    color: '#DC2626',
    bgColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.25)',
    description: 'Ground activities could not be completed successfully (e.g. false alarm, incident site could not be located, or situation escalated beyond Ranger capability).',
    whoCanTransition: ['Responder (Ranger)', 'Controller', 'Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Ranger selects "Unable to Complete" on their app, enters justification, and submits.',
      'Controller changes status to Incomplete with explanation.'
    ],
    operationalImpacts: [
      'Triggers immediate submission to "Pending Endorsement" with special warning tag.',
      'Logs a Chronological Timeline entry: "Ranger marked ground activities incomplete".'
    ],
    actionPanelState: 'Review-Ready (Aborted): Requires supervisor review of unfinished tasks.',
    relatedElements: ['Rework details', 'Escalation tags']
  },
  'Pending Endorsement': {
    name: 'Pending Endorsement',
    badgeClass: 'badge-review',
    color: '#4A148C',
    bgColor: 'rgba(74, 20, 140, 0.08)',
    borderColor: 'rgba(74, 20, 140, 0.25)',
    description: 'The incident ground work is finished and is awaiting audit and validation by a supervisor (Duty Manager or Duty Officer).',
    whoCanTransition: ['Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Automatically transitioned upon a Ranger setting status to Completed or Incomplete.'
    ],
    operationalImpacts: [
      'Locks ground edits for general users.',
      'Displays the Approve/Return action panel for authorized supervisors.',
      'Highlights incident in the supervisor review queue.'
    ],
    actionPanelState: 'Endorsement Action Panel: Displays "Approve" (close case) and "Return" (send back to ground for correction) buttons.',
    relatedElements: ['Duty Manager review dashboard', 'Approve/Return action panel']
  },
  'Returned': {
    name: 'Returned',
    badgeClass: 'badge-live',
    color: '#DC2626',
    bgColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.25)',
    description: 'The supervisor rejected the incident report due to insufficient resolution details, missing photos, or required follow-ups. The incident is returned back to active status.',
    whoCanTransition: ['Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Duty Manager or Duty Officer clicks "Return" button on a Pending Endorsement incident and inputs return justification notes.'
    ],
    operationalImpacts: [
      'Unlocks the incident details page for editing by Ranger or Controller.',
      'Sends a correction alert/push notification back to the ground responder.',
      'Logs a Chronological Timeline entry: "Incident returned by supervisor. Reason: [Notes]".'
    ],
    actionPanelState: 'Rework Mode: Displays return remarks and allows ground team to update information and photos.',
    relatedElements: ['Ranger App inbox alert', 'Return comments log']
  },
  'Closed': {
    name: 'Closed',
    badgeClass: 'badge-closed',
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.08)',
    borderColor: 'rgba(107, 114, 128, 0.20)',
    description: 'The incident has been approved and endorsed. It is officially archived and closed.',
    whoCanTransition: ['Duty Officer', 'Duty Manager'],
    actionTriggers: [
      'Duty Manager or Duty Officer clicks "Approve" on a Pending Endorsement incident.'
    ],
    operationalImpacts: [
      'Sets incident status to Closed and Case status to Closed.',
      'Makes the entire incident record strictly read-only for all roles (except System Administrator reopen capability).',
      'Generates automated operational logs (Related Tasks, Faults, Broadcasts, and e-Diary logs are shown).'
    ],
    actionPanelState: 'Read-Only Panel: Displays related items list (tasks, faults, broadcasts, and e-Diary entries). No state modifications allowed.',
    relatedElements: ['Related Tasks', 'Related Faults', 'Related Broadcasts', 'Related e-Diary']
  },
  'Reopened by Administrator': {
    name: 'Reopened by Administrator',
    badgeClass: 'badge-live',
    color: '#DC2626',
    bgColor: 'rgba(220, 38, 38, 0.08)',
    borderColor: 'rgba(220, 38, 38, 0.25)',
    description: 'An administrative action that allows a closed incident to be reopened for audit or corrective logging.',
    whoCanTransition: ['System Administrator'],
    actionTriggers: [
      'System Administrator clicks "Reopen" button on a Closed incident detail page and logs justification.'
    ],
    operationalImpacts: [
      'Reverts incident status back to "Live".',
      'Re-enables editing permissions.',
      'Logs a Chronological Timeline entry: "Incident Reopened by Administrator".'
    ],
    actionPanelState: 'Reopened Status: Sets incident back to Live, allowing re-assignment or editing.',
    relatedElements: ['Admin audit log', 'Timeline: Reopened']
  }
};

type Pathway = 'all' | 'happy' | 'returned' | 'reopened';

export default function IncidentLifecyclePage() {
  const [selectedPath, setSelectedPath] = useState<Pathway>('all');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Helper to check if a node is part of the selected path
  const isNodeInPath = (nodeName: string) => {
    if (selectedPath === 'all') return true;

    const happyNodes = ['Live', 'Live (Assigned)', 'Live (Acknowledged)', 'Live (On-Site)', 'Live (Completed)', 'Live (Incomplete)', 'Pending Endorsement', 'Closed'];
    const returnedNodes = ['Pending Endorsement', 'Returned', 'Live', 'Live (Assigned)', 'Live (Acknowledged)', 'Live (On-Site)', 'Live (Completed)', 'Live (Incomplete)', 'Closed'];
    const reopenedNodes = ['Closed', 'Reopened by Administrator', 'Live', 'Live (Assigned)', 'Live (Acknowledged)', 'Live (On-Site)', 'Live (Completed)', 'Live (Incomplete)', 'Pending Endorsement'];

    if (selectedPath === 'happy') return happyNodes.includes(nodeName);
    if (selectedPath === 'returned') return returnedNodes.includes(nodeName);
    if (selectedPath === 'reopened') return reopenedNodes.includes(nodeName);
    return true;
  };

  // Helper to check if an edge (transition arrow) is part of the selected path
  const isEdgeInPath = (fromNode: string, toNode: string) => {
    if (selectedPath === 'all') return true;

    // Happy Path transitions
    const happyEdges = [
      ['Live', 'Live (Assigned)'],
      ['Live (Assigned)', 'Live (Acknowledged)'],
      ['Live (Acknowledged)', 'Live (On-Site)'],
      ['Live (On-Site)', 'Live (Completed)'],
      ['Live (On-Site)', 'Live (Incomplete)'],
      ['Live (Completed)', 'Pending Endorsement'],
      ['Live (Incomplete)', 'Pending Endorsement'],
      ['Pending Endorsement', 'Closed']
    ];

    if (selectedPath === 'happy') {
      return happyEdges.some(e => e[0] === fromNode && e[1] === toNode);
    }

    if (selectedPath === 'returned') {
      // Returned Path includes the return transitions + happy path segments afterwards
      const returnedEdges = [
        ['Pending Endorsement', 'Returned'],
        ['Returned', 'Live'],
        ...happyEdges
      ];
      return returnedEdges.some(e => e[0] === fromNode && e[1] === toNode);
    }

    if (selectedPath === 'reopened') {
      // Reopened Path includes the reopen transitions + happy path segments afterwards
      const reopenedEdges = [
        ['Closed', 'Reopened by Administrator'],
        ['Reopened by Administrator', 'Live'],
        ...happyEdges
      ];
      return reopenedEdges.some(e => e[0] === fromNode && e[1] === toNode);
    }

    return true;
  };

  const activeNodeDetails = selectedNode ? statusDetails[selectedNode] : null;

  return (
    <>
      <style jsx global>{`
        .lifecycle-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          margin-bottom: 4px;
        }
        
        .lifecycle-header h1 {
          font-family: var(--font-headline);
          font-size: 18px;
          font-weight: 700;
          color: var(--text-main);
          letter-spacing: -0.01em;
        }

        .lifecycle-container {
          display: grid;
          grid-template-columns: 1fr;
          gap: 20px;
        }

        @media (min-width: 1100px) {
          .lifecycle-container {
            grid-template-columns: 1fr 360px;
          }
        }

        /* Path Selector Tabs */
        .path-selectors {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
          background: var(--bg-inset);
          padding: 6px;
          border-radius: var(--radius-lg);
          border: 1px solid var(--border-color);
        }

        .path-btn {
          padding: 8px 16px;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: var(--radius-md);
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .path-btn:hover {
          color: var(--text-main);
          background: rgba(255, 130, 0, 0.05);
        }

        .path-btn.active {
          background: var(--bg-card);
          color: var(--color-primary);
          box-shadow: 0 2px 6px rgba(43, 31, 29, 0.06);
          border: 1px solid var(--border-color);
        }

        .flowchart-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 24px;
          min-height: 480px;
          display: flex;
          flex-direction: column;
          position: relative;
        }

        .flowchart-scroll-wrapper {
          width: 100%;
          overflow-x: auto;
          scrollbar-width: thin;
          scrollbar-color: var(--border-color) transparent;
          padding-bottom: 10px;
        }

        /* Interactive SVG Nodes Styling */
        .svg-node {
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .svg-node rect {
          transition: all 0.25s ease;
        }

        .svg-node:hover rect {
          transform: translateY(-2px);
          filter: drop-shadow(0 4px 10px rgba(0,0,0,0.08));
        }

        .svg-node.selected rect {
          stroke-width: 3px;
          filter: drop-shadow(0 0 8px currentColor);
        }

        .transition-arrow {
          transition: stroke 0.3s, stroke-width 0.3s, stroke-dasharray 0.3s, opacity 0.3s;
        }

        /* Pulsing indicator for active arrows */
        .arrow-active {
          stroke-dasharray: 6;
          animation: dash 20s linear infinite;
        }

        @keyframes dash {
          to {
            stroke-dashoffset: -1000;
          }
        }

        /* Inspector Details panel */
        .inspector-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          display: flex;
          flex-direction: column;
          height: fit-content;
          position: sticky;
          top: 20px;
        }

        .inspector-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .inspector-body {
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .section-label {
          font-size: 10.5px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          margin-bottom: 6px;
        }

        .badge-live { background: rgba(220, 38, 38, 0.08); color: #DC2626; border: 1px solid rgba(220, 38, 38, 0.15); }
        .badge-ack { background: rgba(234, 88, 12, 0.08); color: #EA580C; border: 1px solid rgba(234, 88, 12, 0.15); }
        .badge-onsite { background: rgba(0, 140, 149, 0.08); color: #008C95; border: 1px solid rgba(0, 140, 149, 0.15); }
        .badge-completed { background: rgba(16, 185, 129, 0.08); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.15); }
        .badge-review { background: rgba(74, 20, 140, 0.08); color: #4A148C; border: 1px solid rgba(74, 20, 140, 0.15); }
        .badge-closed { background: rgba(107, 114, 128, 0.08); color: #6B7280; border: 1px solid rgba(107, 114, 128, 0.15); }
      `}</style>

      {/* Header bar */}
      <div className="lifecycle-header glass">
        <div className="title-section">
          <h1>INCIDENT LIFECYCLE SHOWCASE</h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Interactive blueprint visualizing standard SOP status transitions, workflow branching, and role permissions.
          </p>
        </div>
        
        <div>
          <Link href="/incidents" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            ← Back to Incidents
          </Link>
        </div>
      </div>

      {/* Path Selector Tabs */}
      <div className="path-selectors glass">
        <button 
          className={`path-btn ${selectedPath === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedPath('all')}
        >
          🌐 Show All Pathways
        </button>
        <button 
          className={`path-btn ${selectedPath === 'happy' ? 'active' : ''}`}
          onClick={() => setSelectedPath('happy')}
        >
          🟢 Main Happy Path
        </button>
        <button 
          className={`path-btn ${selectedPath === 'returned' ? 'active' : ''}`}
          onClick={() => setSelectedPath('returned')}
        >
          🔄 Returned Path
        </button>
        <button 
          className={`path-btn ${selectedPath === 'reopened' ? 'active' : ''}`}
          onClick={() => setSelectedPath('reopened')}
        >
          🔓 Reopened Path
        </button>
      </div>

      <div className="lifecycle-container">
        
        {/* Left Column: Interactive SVG Flowchart */}
        <div className="flowchart-card glass">
          <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
              Interactive Workflow Diagram
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-faint)' }}>
              💡 Click status nodes to inspect properties
            </span>
          </div>

          <div className="flowchart-scroll-wrapper">
            <svg 
              viewBox="0 0 1480 430" 
              style={{ width: '100%', minWidth: '1400px', height: 'auto', display: 'block' }}
            >
              <defs>
                {/* Standard Arrow Marker */}
                <marker 
                  id="arrow-default" 
                  viewBox="0 0 10 10" 
                  refX="8" 
                  refY="5" 
                  markerWidth="5" 
                  markerHeight="5" 
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#D9D0C4" />
                </marker>
                
                {/* Highlight Arrow Marker */}
                <marker 
                  id="arrow-highlight" 
                  viewBox="0 0 10 10" 
                  refX="8" 
                  refY="5" 
                  markerWidth="6" 
                  markerHeight="6" 
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#FF8200" />
                </marker>

                {/* Return path Arrow Marker (Red-ish or secondary color) */}
                <marker 
                  id="arrow-returned" 
                  viewBox="0 0 10 10" 
                  refX="8" 
                  refY="5" 
                  markerWidth="6" 
                  markerHeight="6" 
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#DC2626" />
                </marker>

                {/* Reopen path Arrow Marker (Teal or Blue) */}
                <marker 
                  id="arrow-reopened" 
                  viewBox="0 0 10 10" 
                  refX="8" 
                  refY="5" 
                  markerWidth="6" 
                  markerHeight="6" 
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#008C95" />
                </marker>
              </defs>

              {/* TRANSITION PATHS (EDGES) */}
              
              {/* 1. Live -> Live (Assigned) */}
              <path 
                d="M 180 185 H 200" 
                stroke={isEdgeInPath('Live', 'Live (Assigned)') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live', 'Live (Assigned)') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live', 'Live (Assigned)') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live', 'Live (Assigned)') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live', 'Live (Assigned)') ? '1' : '0.2'}
              />

              {/* 2. Live (Assigned) -> Live (Acknowledged) */}
              <path 
                d="M 360 185 H 400" 
                stroke={isEdgeInPath('Live (Assigned)', 'Live (Acknowledged)') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live (Assigned)', 'Live (Acknowledged)') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live (Assigned)', 'Live (Acknowledged)') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live (Assigned)', 'Live (Acknowledged)') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live (Assigned)', 'Live (Acknowledged)') ? '1' : '0.2'}
              />

              {/* 3. Live (Acknowledged) -> Live (On-Site) */}
              <path 
                d="M 560 185 H 600" 
                stroke={isEdgeInPath('Live (Acknowledged)', 'Live (On-Site)') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live (Acknowledged)', 'Live (On-Site)') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live (Acknowledged)', 'Live (On-Site)') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live (Acknowledged)', 'Live (On-Site)') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live (Acknowledged)', 'Live (On-Site)') ? '1' : '0.2'}
              />

              {/* 4. Live (On-Site) -> Live (Completed) */}
              <path 
                d="M 760 185 C 780 185, 780 115, 800 115" 
                fill="none"
                stroke={isEdgeInPath('Live (On-Site)', 'Live (Completed)') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live (On-Site)', 'Live (Completed)') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live (On-Site)', 'Live (Completed)') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live (On-Site)', 'Live (Completed)') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live (On-Site)', 'Live (Completed)') ? '1' : '0.2'}
              />

              {/* 5. Live (On-Site) -> Live (Incomplete) */}
              <path 
                d="M 760 185 C 780 185, 780 255, 800 255" 
                fill="none"
                stroke={isEdgeInPath('Live (On-Site)', 'Live (Incomplete)') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live (On-Site)', 'Live (Incomplete)') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live (On-Site)', 'Live (Incomplete)') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live (On-Site)', 'Live (Incomplete)') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live (On-Site)', 'Live (Incomplete)') ? '1' : '0.2'}
              />

              {/* 6. Live (Completed) -> Pending Endorsement */}
              <path 
                d="M 960 115 C 980 115, 980 185, 1000 185" 
                fill="none"
                stroke={isEdgeInPath('Live (Completed)', 'Pending Endorsement') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live (Completed)', 'Pending Endorsement') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live (Completed)', 'Pending Endorsement') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live (Completed)', 'Pending Endorsement') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live (Completed)', 'Pending Endorsement') ? '1' : '0.2'}
              />

              {/* 7. Live (Incomplete) -> Pending Endorsement */}
              <path 
                d="M 960 255 C 980 255, 980 185, 1000 185" 
                fill="none"
                stroke={isEdgeInPath('Live (Incomplete)', 'Pending Endorsement') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Live (Incomplete)', 'Pending Endorsement') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Live (Incomplete)', 'Pending Endorsement') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Live (Incomplete)', 'Pending Endorsement') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Live (Incomplete)', 'Pending Endorsement') ? '1' : '0.2'}
              />

              {/* 8. Pending Endorsement -> Closed */}
              <path 
                d="M 1160 185 H 1200" 
                stroke={isEdgeInPath('Pending Endorsement', 'Closed') ? '#FF8200' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Pending Endorsement', 'Closed') ? '3' : '1.5'} 
                markerEnd={isEdgeInPath('Pending Endorsement', 'Closed') ? 'url(#arrow-highlight)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Pending Endorsement', 'Closed') ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Pending Endorsement', 'Closed') ? '1' : '0.2'}
              />

              {/* RETURNED PATH EDGES */}
              {/* 9. Pending Endorsement -> Returned */}
              <path 
                d="M 1080 210 C 1080 285, 620 285, 540 310" 
                fill="none"
                stroke={isEdgeInPath('Pending Endorsement', 'Returned') ? '#DC2626' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Pending Endorsement', 'Returned') ? '2.5' : '1.5'} 
                markerEnd={isEdgeInPath('Pending Endorsement', 'Returned') ? 'url(#arrow-returned)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Pending Endorsement', 'Returned') && selectedPath === 'returned' ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Pending Endorsement', 'Returned') ? '1' : '0.1'}
              />

              {/* 10. Returned -> Live */}
              <path 
                d="M 460 335 C 250 335, 100 265, 100 210" 
                fill="none"
                stroke={isEdgeInPath('Returned', 'Live') ? '#DC2626' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Returned', 'Live') ? '2.5' : '1.5'} 
                markerEnd={isEdgeInPath('Returned', 'Live') ? 'url(#arrow-returned)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Returned', 'Live') && selectedPath === 'returned' ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Returned', 'Live') ? '1' : '0.1'}
              />

              {/* REOPENED PATH EDGES */}
              {/* 11. Closed -> Reopened Action */}
              <path 
                d="M 1280 160 C 1280 85, 950 45, 780 45" 
                fill="none"
                stroke={isEdgeInPath('Closed', 'Reopened by Administrator') ? '#008C95' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Closed', 'Reopened by Administrator') ? '2.5' : '1.5'} 
                markerEnd={isEdgeInPath('Closed', 'Reopened by Administrator') ? 'url(#arrow-reopened)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Closed', 'Reopened by Administrator') && selectedPath === 'reopened' ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Closed', 'Reopened by Administrator') ? '1' : '0.1'}
              />

              {/* 12. Reopened Action -> Live */}
              <path 
                d="M 580 45 C 350 45, 100 85, 100 160" 
                fill="none"
                stroke={isEdgeInPath('Reopened by Administrator', 'Live') ? '#008C95' : '#E8E3D8'} 
                strokeWidth={isEdgeInPath('Reopened by Administrator', 'Live') ? '2.5' : '1.5'} 
                markerEnd={isEdgeInPath('Reopened by Administrator', 'Live') ? 'url(#arrow-reopened)' : 'url(#arrow-default)'}
                className={`transition-arrow ${isEdgeInPath('Reopened by Administrator', 'Live') && selectedPath === 'reopened' ? 'arrow-active' : ''}`}
                opacity={isEdgeInPath('Reopened by Administrator', 'Live') ? '1' : '0.1'}
              />


              {/* STATUS NODES */}
              
              {/* 1. Live */}
              <g 
                className={`svg-node ${selectedNode === 'Live' ? 'selected' : ''}`} 
                style={{ color: '#DC2626' }}
                onClick={() => setSelectedNode('Live')}
                opacity={isNodeInPath('Live') ? '1' : '0.2'}
              >
                <rect x="20" y="160" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live' ? '#DC2626' : '#DC2626'} strokeWidth={selectedNode === 'Live' ? '2.5' : '1.5'} />
                <circle cx="40" cy="185" r="12" fill="rgba(220, 38, 38, 0.08)" />
                <text x="40" y="189" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#DC2626">🚨</text>
                <text x="64" y="190" fontFamily="var(--font-body)" fontSize="12.5" fontWeight="600" fill="var(--text-main)">Live</text>
              </g>

              {/* 2. Live (Assigned) */}
              <g 
                className={`svg-node ${selectedNode === 'Live (Assigned)' ? 'selected' : ''}`} 
                style={{ color: '#EA580C' }}
                onClick={() => setSelectedNode('Live (Assigned)')}
                opacity={isNodeInPath('Live (Assigned)') ? '1' : '0.2'}
              >
                <rect x="200" y="160" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (Assigned)' ? '#EA580C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (Assigned)' ? '2.5' : '1'} />
                <circle cx="220" cy="185" r="12" fill="rgba(234, 88, 12, 0.08)" />
                <text x="220" y="189" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#EA580C">👤</text>
                <text x="244" y="190" fontFamily="var(--font-body)" fontSize="11.5" fontWeight="600" fill="var(--text-main)">Live (Assigned)</text>
              </g>

              {/* 3. Live (Acknowledged) */}
              <g 
                className={`svg-node ${selectedNode === 'Live (Acknowledged)' ? 'selected' : ''}`} 
                style={{ color: '#EA580C' }}
                onClick={() => setSelectedNode('Live (Acknowledged)')}
                opacity={isNodeInPath('Live (Acknowledged)') ? '1' : '0.2'}
              >
                <rect x="400" y="160" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (Acknowledged)' ? '#EA580C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (Acknowledged)' ? '2.5' : '1'} />
                <circle cx="420" cy="185" r="12" fill="rgba(234, 88, 12, 0.08)" />
                <text x="420" y="189" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#EA580C">✉️</text>
                <text x="444" y="190" fontFamily="var(--font-body)" fontSize="11" fontWeight="600" fill="var(--text-main)">Live (Ack)</text>
              </g>

              {/* 4. Live (On-Site) */}
              <g 
                className={`svg-node ${selectedNode === 'Live (On-Site)' ? 'selected' : ''}`} 
                style={{ color: '#008C95' }}
                onClick={() => setSelectedNode('Live (On-Site)')}
                opacity={isNodeInPath('Live (On-Site)') ? '1' : '0.2'}
              >
                <rect x="600" y="160" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (On-Site)' ? '#008C95' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (On-Site)' ? '2.5' : '1'} />
                <circle cx="620" cy="185" r="12" fill="rgba(0, 140, 149, 0.08)" />
                <text x="620" y="189" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#008C95">📍</text>
                <text x="644" y="190" fontFamily="var(--font-body)" fontSize="11.5" fontWeight="600" fill="var(--text-main)">Live (On-Site)</text>
              </g>

              {/* 5. Live (Completed) */}
              <g 
                className={`svg-node ${selectedNode === 'Live (Completed)' ? 'selected' : ''}`} 
                style={{ color: '#10B981' }}
                onClick={() => setSelectedNode('Live (Completed)')}
                opacity={isNodeInPath('Live (Completed)') ? '1' : '0.2'}
              >
                <rect x="800" y="90" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (Completed)' ? '#10B981' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (Completed)' ? '2.5' : '1'} />
                <circle cx="820" cy="115" r="12" fill="rgba(16, 185, 129, 0.08)" />
                <text x="820" y="119" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#10B981">✓</text>
                <text x="844" y="120" fontFamily="var(--font-body)" fontSize="11" fontWeight="600" fill="var(--text-main)">Live (Completed)</text>
              </g>

              {/* 6. Live (Incomplete) */}
              <g 
                className={`svg-node ${selectedNode === 'Live (Incomplete)' ? 'selected' : ''}`} 
                style={{ color: '#DC2626' }}
                onClick={() => setSelectedNode('Live (Incomplete)')}
                opacity={isNodeInPath('Live (Incomplete)') ? '1' : '0.2'}
              >
                <rect x="800" y="230" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Live (Incomplete)' ? '#DC2626' : 'var(--border-color)'} strokeWidth={selectedNode === 'Live (Incomplete)' ? '2.5' : '1'} />
                <circle cx="820" cy="255" r="12" fill="rgba(220, 38, 38, 0.08)" />
                <text x="820" y="259" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#DC2626">✗</text>
                <text x="844" y="260" fontFamily="var(--font-body)" fontSize="11" fontWeight="600" fill="var(--text-main)">Live (Incomplete)</text>
              </g>

              {/* 7. Pending Endorsement */}
              <g 
                className={`svg-node ${selectedNode === 'Pending Endorsement' ? 'selected' : ''}`} 
                style={{ color: '#4A148C' }}
                onClick={() => setSelectedNode('Pending Endorsement')}
                opacity={isNodeInPath('Pending Endorsement') ? '1' : '0.2'}
              >
                <rect x="1000" y="160" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Pending Endorsement' ? '#4A148C' : 'var(--border-color)'} strokeWidth={selectedNode === 'Pending Endorsement' ? '2.5' : '1'} />
                <circle cx="1020" cy="185" r="12" fill="rgba(74, 20, 140, 0.08)" />
                <text x="1020" y="189" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#4A148C">📝</text>
                <text x="1044" y="190" fontFamily="var(--font-body)" fontSize="11.5" fontWeight="600" fill="var(--text-main)">Pending Endors.</text>
              </g>

              {/* 8. Closed */}
              <g 
                className={`svg-node ${selectedNode === 'Closed' ? 'selected' : ''}`} 
                style={{ color: '#6B7280' }}
                onClick={() => setSelectedNode('Closed')}
                opacity={isNodeInPath('Closed') ? '1' : '0.2'}
              >
                <rect x="1200" y="160" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Closed' ? '#6B7280' : 'var(--border-color)'} strokeWidth={selectedNode === 'Closed' ? '2.5' : '1'} />
                <circle cx="1220" cy="185" r="12" fill="rgba(107, 114, 128, 0.08)" />
                <text x="1220" y="189" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#6B7280">🔒</text>
                <text x="1244" y="190" fontFamily="var(--font-body)" fontSize="12.5" fontWeight="600" fill="var(--text-main)">Closed</text>
              </g>

              {/* 9. Returned */}
              <g 
                className={`svg-node ${selectedNode === 'Returned' ? 'selected' : ''}`} 
                style={{ color: '#DC2626' }}
                onClick={() => setSelectedNode('Returned')}
                opacity={isNodeInPath('Returned') ? '1' : '0.2'}
              >
                <rect x="460" y="310" width="160" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Returned' ? '#DC2626' : 'var(--border-color)'} strokeWidth={selectedNode === 'Returned' ? '2.5' : '1'} />
                <circle cx="480" cy="335" r="12" fill="rgba(220, 38, 38, 0.08)" />
                <text x="480" y="339" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#DC2626">🔄</text>
                <text x="504" y="340" fontFamily="var(--font-body)" fontSize="12" fontWeight="600" fill="var(--text-main)">Returned</text>
              </g>

              {/* 10. Reopened by Administrator (Administrative action transition node) */}
              <g 
                className={`svg-node ${selectedNode === 'Reopened by Administrator' ? 'selected' : ''}`} 
                style={{ color: '#008C95' }}
                onClick={() => setSelectedNode('Reopened by Administrator')}
                opacity={isNodeInPath('Reopened by Administrator') ? '1' : '0.2'}
              >
                <rect x="580" y="20" width="200" height="50" rx="8" fill="#FDFCF8" stroke={selectedNode === 'Reopened by Administrator' ? '#008C95' : 'var(--border-color)'} strokeWidth={selectedNode === 'Reopened by Administrator' ? '2.5' : '1'} strokeDasharray="4 2" />
                <circle cx="600" cy="45" r="12" fill="rgba(0, 140, 149, 0.08)" />
                <text x="600" y="49" fontFamily="var(--font-body)" fontSize="12" fontWeight="700" textAnchor="middle" fill="#008C95">🔓</text>
                <text x="624" y="50" fontFamily="var(--font-body)" fontSize="11" fontWeight="600" fill="var(--text-main)">Reopened by Admin</text>
              </g>
            </svg>
          </div>

          {/* Color Key Guide */}
          <div style={{ marginTop: 'auto', paddingTop: '18px', borderTop: '1px solid var(--border-color)', display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#DC2626' }} /> Active / Escalated
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#EA580C' }} /> Assigned / Dispatched
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#008C95' }} /> Ground Work / On-Site
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10B981' }} /> Completed
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#4A148C' }} /> Pending Audit
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#6B7280' }} /> Closed (Locked)
            </div>
          </div>
        </div>

        {/* Right Column: Status Details Inspector */}
        <div className="inspector-card glass">
          <div className="inspector-header">
            <h2 style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
              Status Inspector
            </h2>
            {activeNodeDetails && (
              <span className={`badge ${activeNodeDetails.badgeClass}`} style={{ fontSize: '10.5px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}>
                {activeNodeDetails.name}
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
                  Click on any status node in the workflow diagram on the left to inspect its permissions, transitions, triggers, and impact details.
                </p>
                <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '8px', paddingTop: '12px', textAlign: 'left' }}>
                  <h4 style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.04em' }}>
                    Standard Rules
                  </h4>
                  <ul style={{ fontSize: '11px', paddingLeft: '14px', listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Incidents are logged active as <strong>Live</strong>.</li>
                    <li>Rangers manage mobile dispatch queue.</li>
                    <li>Only DMs and DOs have endorsement authority.</li>
                    <li><strong>Closed</strong> incidents are locked read-only.</li>
                  </ul>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="section-label">Operational Description</div>
                  <p style={{ fontSize: '12.5px', color: 'var(--text-main)', lineHeight: '1.45' }}>
                    {activeNodeDetails.description}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div className="section-label">Authorized Transitions</div>
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
                    {activeNodeDetails.actionTriggers.map((trig, idx) => (
                      <li key={idx}>{trig}</li>
                    ))}
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
                    {activeNodeDetails.operationalImpacts.map((imp, idx) => (
                      <li key={idx}>{imp}</li>
                    ))}
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
