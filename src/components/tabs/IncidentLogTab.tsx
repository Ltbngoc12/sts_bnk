'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case, Incident } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getIncidentTaxonomy } from '@/lib/taxonomy';
import { INCIDENT_CATEGORIES, DEFAULT_INCIDENT_CATEGORY } from '@/lib/incidentCategory';

function CrisisIcon({ level }: { level: string | number }) {
  const lvl = String(level);
  if (lvl === '1') {
    return (
      <span style={{ color: '#EF4444', marginRight: '6px', display: 'inline-flex', alignSelf: 'center' }} title="Crisis Level 1 (Severe)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 11 12 6 7 11" />
          <polyline points="17 18 12 13 7 18" />
        </svg>
      </span>
    );
  }
  if (lvl === '2') {
    return (
      <span style={{ color: '#F97316', marginRight: '6px', display: 'inline-flex', alignSelf: 'center' }} title="Crisis Level 2 (High)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 11 12 6 7 11" />
          <polyline points="17 18 12 13 7 18" />
        </svg>
      </span>
    );
  }
  if (lvl === '3') {
    return (
      <span style={{ color: '#CA8A04', marginRight: '6px', display: 'inline-flex', alignSelf: 'center' }} title="Crisis Level 3 (Medium)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="9" x2="19" y2="9" />
          <line x1="5" y1="15" x2="19" y2="15" />
        </svg>
      </span>
    );
  }
  if (lvl === '4') {
    return (
      <span style={{ color: '#F97316', marginRight: '6px', display: 'inline-flex', alignSelf: 'center', opacity: 0.6 }} title="Crisis Level 4 (Default)">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="17 11 12 6 7 11" />
          <polyline points="17 18 12 13 7 18" />
        </svg>
      </span>
    );
  }
  return (
    <span style={{ color: '#9CA3AF', marginRight: '6px', display: 'inline-flex', alignSelf: 'center' }} title={`Crisis Level ${lvl}`}>
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 11 12 6 7 11" />
        <polyline points="17 18 12 13 7 18" />
      </svg>
    </span>
  );
}

function RespondersAvatars({ names }: { names: string | string[] }) {
  const list = Array.isArray(names) ? names : [names].filter(Boolean);
  if (list.length === 0) {
    return <span style={{ color: 'var(--text-faint)' }}>—</span>;
  }

  const getAvatarColor = (name: string) => {
    const charCode = name.charCodeAt(0) || 65;
    const colors = [
      '#10B981', // Teal/green
      '#3B82F6', // Blue
      '#EC4899', // Pink
      '#8B5CF6', // Purple
      '#F97316', // Orange
      '#0D9488', // Dark teal
      '#6366F1', // Indigo
    ];
    return colors[charCode % colors.length];
  };

  if (list.length === 1) {
    const name = list[0];
    const letter = name.trim().charAt(0).toUpperCase();
    const color = getAvatarColor(name);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: color,
          color: '#FFF',
          fontSize: '10px',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1.5px solid #FFF',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
        }}>
          {letter}
        </span>
        <span style={{ fontSize: '13px', color: 'var(--text-main)' }}>{name}</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', marginRight: '6px' }}>
        {list.map((name, idx) => {
          const letter = name.trim().charAt(0).toUpperCase();
          const color = getAvatarColor(name);
          return (
            <span
              key={idx}
              title={name}
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: color,
                color: '#FFF',
                fontSize: '10px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #FFF',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                marginLeft: idx > 0 ? '-6px' : '0',
                zIndex: 10 - idx
              }}
            >
              {letter}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function IncidentLogTab() {
  const { role } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Filter States
  const [activeTab, setActiveTab] = useState<string>('Pending Endorsement');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterSubType, setFilterSubType] = useState<string>('All');
  const [filterCategory, setFilterCategory] = useState<string>('All'); // Incident Category (Operational/Backdated/Informational) — distinct from filterType (Incident Type taxonomy)
  const [filterCrisisLevel, setFilterCrisisLevel] = useState<string>('All');
  const [filterSource, setFilterSource] = useState<string>('All');
  const [filterController, setFilterController] = useState<string>('All');
  const [filterDateStart, setFilterDateStart] = useState<string>('');
  const [filterDateEnd, setFilterDateEnd] = useState<string>('');

  // Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  const fetchCases = async () => {
    try {
      const res = await fetch('/api/cases');
      if (res.ok) {
        setCases(await res.json());
      }
    } catch (err) {
      console.error('Error fetching cases:', err);
    } finally {
      setLoading(false);
    }
  };

  const [taxonomy, setTaxonomy] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetchCases();
    setTaxonomy(getIncidentTaxonomy());
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterType, filterSubType, filterCategory, filterCrisisLevel, filterSource, filterController, filterDateStart, filterDateEnd, activeTab]);

  // Reset Filters
  const resetFilters = () => {
    setSearchTerm('');
    setFilterStatus('All');
    setFilterType('All');
    setFilterSubType('All');
    setFilterCategory('All');
    setFilterCrisisLevel('All');
    setFilterSource('All');
    setFilterController('All');
    setFilterDateStart('');
    setFilterDateEnd('');
    setActiveTab('Pending Endorsement');
  };

  // Filter only cases containing incidents
  const incidentCases = cases.filter(c => c.incident !== null);

  // Dynamic list of controllers (creators) from data
  const uniqueControllers = Array.from(
    new Set(
      incidentCases
        .map(c => c.incident?.createdBy)
        .filter((val): val is string => !!val)
    )
  ).sort();


  // Helper to match Incident Source dropdown options to database requestedBy values
  const matchesSource = (incidentSourceFilter: string, incident: any) => {
    if (incidentSourceFilter === 'All') return true;
    // Prefer reportingSource (new field), fall back to requestedBy for legacy records
    const src = ((incident.reportingSource || incident.requestedBy) ?? '').toLowerCase();
    const filter = incidentSourceFilter.toLowerCase();

    if (filter === 'public phone') {
      return src.includes('phone') || src.includes('call-in') || src.includes('public');
    }
    if (filter === 'email') {
      return src.includes('email');
    }
    if (filter === 'ucs') {
      return src.includes('ucs');
    }
    if (filter === 'va') {
      return src.includes('va');
    }
    if (filter === 'state agency') {
      return src.includes('state agency') || src.includes('state');
    }
    if (filter === 'government agency') {
      return src.includes('agency') || src.includes('scdf') || src.includes('spf') || src.includes('mpa') || src.includes('government');
    }
    return src.includes(filter);
  };

  // Helper to match tab category or status pre-filters
  const matchesTab = (tab: string, inc: Incident) => {
    if (tab === 'All') return true;
    const status = inc.status;

    if (tab === 'Active') {
      return ['Live', 'Live (Assigned)', 'Live (Acknowledged)', 'Live (On-Site)', 'Live (Pending Controller Review)', 'Live (Completed)', 'Live (Incomplete)'].includes(status);
    }
    if (tab === 'Pending Endorsement') {
      return status === 'Pending Endorsement';
    }
    if (tab === 'Returned') {
      return status === 'Returned';
    }
    if (tab === 'Closed') {
      return status === 'Closed';
    }
    return true;
  };

  // Helper to filter by Date Range
  const matchesDateRange = (incDateStr: string) => {
    if (!filterDateStart && !filterDateEnd) return true;
    const incDate = new Date(incDateStr);
    if (isNaN(incDate.getTime())) return true;
    
    if (filterDateStart) {
      const start = new Date(filterDateStart + 'T00:00:00');
      if (incDate < start) return false;
    }
    if (filterDateEnd) {
      const end = new Date(filterDateEnd + 'T23:59:59');
      if (incDate > end) return false;
    }
    return true;
  };

  // Calculate Summary Metrics (filtered by date range only per FSD specifications)
  const dateFilteredIncidents = incidentCases.map(c => c.incident).filter((i): i is Incident => !!i).filter(inc => {
    return matchesDateRange(inc.dateTime);
  });

  const totalIncidentsCount = dateFilteredIncidents.length;
  const activeIncidentsCount = dateFilteredIncidents.filter(inc =>
    ['Live', 'Live (Assigned)', 'Live (Acknowledged)', 'Live (On-Site)', 'Live (Completed)', 'Live (Incomplete)'].includes(inc.status)
  ).length;
  const pendingReviewCount = dateFilteredIncidents.filter(inc => inc.status === 'Pending Endorsement').length;


  // Apply all filter rules to line items
  const matchingIncidentsWithoutTab = incidentCases.filter(c => {
    const inc = c.incident!;
    
    const matchesSearch = 
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
      inc.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (inc.summary && inc.summary.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (Array.isArray(inc.assignedTo)
        ? inc.assignedTo.some(r => r.toLowerCase().includes(searchTerm.toLowerCase()))
        : (inc.assignedTo && (inc.assignedTo as unknown as string).toLowerCase().includes(searchTerm.toLowerCase())));
    
    if (!matchesSearch) return false;
    if (filterStatus !== 'All' && inc.status !== filterStatus) return false;
    if (filterType !== 'All' && inc.type !== filterType) return false;
    if (filterSubType !== 'All' && inc.subType !== filterSubType) return false;
    if (filterCategory !== 'All' && (inc.category || DEFAULT_INCIDENT_CATEGORY) !== filterCategory) return false;
    if (filterCrisisLevel !== 'All' && String(inc.crisisLevel) !== filterCrisisLevel) return false;
    if (!matchesSource(filterSource, inc)) return false;
    if (filterController !== 'All' && inc.createdBy !== filterController) return false;
    if (!matchesDateRange(inc.dateTime)) return false;
    

    return true;
  });

  const allReportsCount = matchingIncidentsWithoutTab.length;
  const pendingReportsCount = matchingIncidentsWithoutTab.filter(c => c.incident?.status === 'Pending Endorsement').length;

  const filteredIncidents = matchingIncidentsWithoutTab.filter(c => {
    const inc = c.incident!;
    if (!matchesTab(activeTab, inc)) return false;
    return true;
  });

  // Default sort: Date Logged descending (latest on top)
  const sortedIncidents = [...filteredIncidents].sort((a, b) => {
    const da = a.incident?.dateTime ? new Date(a.incident.dateTime).getTime() : 0;
    const db = b.incident?.dateTime ? new Date(b.incident.dateTime).getTime() : 0;
    return db - da;
  });

  // Pagination Calculations
  const totalPages = Math.ceil(sortedIncidents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedIncidents = sortedIncidents.slice(startIndex, startIndex + itemsPerPage);

  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator' || role === 'Current Ops Administrator';

  // Helper for Status Badge styling classes
  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Live':
      case 'Returned':
        return 'badge-live';
      case 'Live (Assigned)':
        return 'badge-assigned';
      case 'Live (Acknowledged)':
        return 'badge-ack';
      case 'Live (Incomplete)':
      case 'Incomplete':
        return 'badge-incomplete';
      case 'Live (On-Site)':
        return 'badge-onsite';
      case 'Live (Pending Controller Review)':
        return 'badge-pending-ctrl';
      case 'Live (Completed)':
        return 'badge-completed';
      case 'Pending Endorsement':
        return 'badge-review';
      case 'Closed':
        return 'badge-closed';
      default:
        return 'badge-closed';
    }
  };

  return (
    <>
      <style jsx global>{`
        /* Metric borders using design system palette colors */
        .metric-card.total-incidents::before { background: var(--color-info); }
        .metric-card.active-incidents::before { background: var(--color-critical); }
        .metric-card.pending-endorsement::before { background: var(--color-review); }
        .metric-card.closed-today::before { background: var(--color-closed); }
        .metric-card.ongoing-incidents::before { background: var(--color-active); }

        /* View Toggle Styling */
        .view-toggle-container {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--bg-inset);
          padding: 4px;
          border-radius: 8px;
          border: 1px solid var(--border-color);
        }
        .toggle-btn {
          padding: 6px 12px;
          font-size: 12.5px;
          font-weight: 600;
          border-radius: 6px;
          border: none;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .toggle-btn:hover {
          color: var(--text-main);
        }
        .toggle-btn.active {
          background: var(--bg-card);
          color: var(--text-main);
          box-shadow: 0 1px 3px rgba(43, 31, 29, 0.08);
        }

        /* Filter Panel Styles */
        .filters-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        /* Card View Styles */
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        .incident-card {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          height: 100%;
          cursor: pointer;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(43, 31, 29, 0.02);
        }
        .incident-card:hover {
          border-color: var(--border-color-hover);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(43, 31, 29, 0.05);
        }
        .card-header-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          margin-bottom: 8px;
        }
        .card-title-text {
          font-size: 14.5px;
          font-weight: 600;
          color: var(--text-main);
          margin-bottom: 6px;
          line-height: 1.4;
        }
        .card-id-text {
          font-family: var(--font-mono);
          font-size: 10.5px;
          color: var(--text-muted);
        }
        .card-location-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-sub);
          margin-bottom: 12px;
        }
        .card-metadata-section {
          border-top: 1px solid var(--border-color);
          padding-top: 10px;
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 12.5px;
        }
        .card-meta-item {
          display: flex;
          justify-content: space-between;
        }
        .card-meta-label {
          color: var(--text-muted);
          font-weight: 500;
        }
        .card-meta-value {
          color: var(--text-main);
          font-weight: 600;
        }
        .card-footer-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border-color);
          padding-top: 12px;
          margin-top: 12px;
        }
        .card-date {
          font-size: 11.5px;
          color: var(--text-muted);
        }
        .btn-card-action {
          padding: 4px 10px;
          font-size: 11.5px;
          font-weight: 600;
        }

        /* Scenario Demo Library Playground Styling */
        .scenario-library-container {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          transition: all 0.2s ease;
        }
        .scenarios-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 12px;
          margin-top: 8px;
        }
        .scenario-card {
          background: var(--bg-base);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 14px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(43,31,29,0.03);
        }
        .scenario-card:hover {
          border-color: var(--border-focus);
          background: var(--bg-card);
          box-shadow: 0 4px 12px rgba(255, 130, 0, 0.08);
          transform: translateY(-2px);
        }
        .scenario-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .scenario-card-body {
          flex-grow: 1;
        }
        .scenario-card-footer {
          margin-top: 10px;
          font-size: 9.5px;
          font-weight: 700;
          color: var(--color-primary);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: transform 0.2s ease;
        }
        .scenario-card:hover .scenario-card-footer {
          transform: translateX(4px);
        }
      `}</style>

      {/* Metrics Bar */}
      <div className="metrics-grid mb-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
        <div className="metric-card glass total-incidents" style={{ padding: '10px 16px' }}>
          <div className="metric-info">
            <h3>Total Incidents</h3>
            <div className="metric-value text-info" style={{ fontSize: '20px' }}>{totalIncidentsCount}</div>
          </div>
          <div className="metric-icon" style={{ width: '28px', height: '28px', fontSize: '15px' }}>📊</div>
        </div>

        <div className="metric-card glass active-incidents" style={{ padding: '10px 16px' }}>
          <div className="metric-info">
            <h3>Active Incidents</h3>
            <div className="metric-value text-danger" style={{ fontSize: '20px' }}>{activeIncidentsCount}</div>
          </div>
          <div className="metric-icon" style={{ width: '28px', height: '28px', fontSize: '15px' }}>🚨</div>
        </div>

        <div className="metric-card glass pending-endorsement" style={{ padding: '10px 16px' }}>
          <div className="metric-info">
            <h3>Pending Endorsement</h3>
            <div className="metric-value text-warning" style={{ fontSize: '20px' }}>{pendingReviewCount}</div>
          </div>
          <div className="metric-icon" style={{ width: '28px', height: '28px', fontSize: '15px' }}>📝</div>
        </div>

      </div>

      {/* Advanced Filter Panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-card)' }}>
        
        {/* Main Filters Row (Search, Type, Status, Actions) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          
          {/* Left Side: Tabs */}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={() => { setActiveTab('Pending Endorsement'); setCurrentPage(1); }}
              className={`tab-btn ${activeTab === 'Pending Endorsement' ? 'active' : ''}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'Pending Endorsement' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'Pending Endorsement' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              Pending Incidents
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: activeTab === 'Pending Endorsement' ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                color: activeTab === 'Pending Endorsement' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center'
              }}>
                {pendingReportsCount}
              </span>
            </button>
            <button
              onClick={() => { setActiveTab('All'); setCurrentPage(1); setShowAdvancedFilters(true); }}
              className={`tab-btn ${activeTab === 'All' ? 'active' : ''}`}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'All' ? '2px solid var(--color-primary)' : '2px solid transparent',
                color: activeTab === 'All' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              All Incidents
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                background: activeTab === 'All' ? 'var(--color-primary-bg)' : 'var(--bg-inset)',
                color: activeTab === 'All' ? 'var(--color-primary)' : 'var(--text-muted)',
                padding: '2px 8px',
                borderRadius: '10px',
                minWidth: '20px',
                textAlign: 'center'
              }}>
                {allReportsCount}
              </span>
            </button>
          </div>

          {/* Right Side: Search & Filter toggle */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flexGrow: 1, justifyContent: 'flex-end' }}>

            {/* Filters toggle button — icon only, left of search */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`btn ${showAdvancedFilters ? 'btn-info' : 'btn-secondary'}`}
              aria-label="Toggle filters"
              style={{
                padding: '0 10px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-md)'
              }}
            >
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>

            {/* Search Input with Magnifying Glass SVG */}
            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', display: 'flex', alignItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Search form no., title, site, name..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="form-control"
                style={{ width: '100%', paddingLeft: '36px', height: '36px', fontSize: '13px' }}
              />
            </div>

            {isController && (
              <Link href="/incidents/new" className="btn btn-primary" style={{ fontSize: '12.5px', height: '36px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', fontWeight: 600, textDecoration: 'none' }}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '13px', height: '13px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                LOG NEW INCIDENT
              </Link>
            )}

          </div>
        </div>

        {/* Collapsible Advanced Filters Row */}
        {showAdvancedFilters && (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
              gap: '16px', 
              paddingTop: '4px'
            }}
          >
            {/* Status dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Status:</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Statuses</option>
                <option value="Live">Live</option>
                <option value="Live (Assigned)">Assigned</option>
                <option value="Live (Acknowledged)">Live (Acknowledged)</option>
                <option value="Live (On-Site)">Live (On-Site)</option>
                <option value="Live (Completed)">Live (Completed)</option>
                <option value="Live (Incomplete)">Live (Incomplete)</option>
                <option value="Pending Endorsement">Pending Endorsement</option>
                <option value="Returned">Returned</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            {/* Incident Type dropdown — NOTE: this used to be mislabeled "Category:" even though it
                filters by Incident Type (Security/Safety/Transport/...) taxonomy, not the real
                Incident Category (Operational/Backdated/Informational) below. Renamed for clarity. */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Incident Type:</label>
              <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterSubType('All'); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Types</option>
                {Object.keys(taxonomy).sort().map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {/* Incident Category dropdown (FSD v0.5 §5.1.2) — Operational / Backdated / Informational-Exercise */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Incident Category:</label>
              <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Categories</option>
                {INCIDENT_CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Sub-type dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Sub-Type:</label>
              <select 
                value={filterSubType} 
                onChange={(e) => { setFilterSubType(e.target.value); setCurrentPage(1); }} 
                className="form-control select-dark"
                disabled={filterType === 'All'}
                style={{ width: '100%' }}
              >
                <option value="All">All Sub-types</option>
                {filterType !== 'All' && taxonomy[filterType]?.sort().map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* Crisis Level (Severity) dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Severity:</label>
              <select value={filterCrisisLevel} onChange={(e) => { setFilterCrisisLevel(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Levels</option>
                <option value="1">Level 1 (Crisis)</option>
                <option value="2">Level 2</option>
                <option value="3">Level 3</option>
                <option value="4">Level 4 (Default)</option>
                <option value="5">Level 5 (Low)</option>
              </select>
            </div>

            {/* Source dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Submitted By:</label>
              <select value={filterSource} onChange={(e) => { setFilterSource(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Sources</option>
                <option value="Public Phone">Public Phone</option>
                <option value="Email">Email</option>
                <option value="UCS">UCS</option>
                <option value="VA">VA</option>
                <option value="State Agency">State Agency</option>
                <option value="Government Agency">Government Agency</option>
              </select>
            </div>

            {/* Controller dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Controller:</label>
              <select value={filterController} onChange={(e) => { setFilterController(e.target.value); setCurrentPage(1); }} className="form-control select-dark" style={{ width: '100%' }}>
                <option value="All">All Controllers</option>
                {uniqueControllers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Date Picker Start */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date From:</label>
              <input 
                type="date" 
                value={filterDateStart} 
                onChange={(e) => { setFilterDateStart(e.target.value); setCurrentPage(1); }} 
                className="form-control" 
                style={{ width: '100%', height: '36px' }}
              />
            </div>

            {/* Date Picker End */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>Date To:</label>
              <input 
                type="date" 
                value={filterDateEnd} 
                onChange={(e) => { setFilterDateEnd(e.target.value); setCurrentPage(1); }} 
                className="form-control" 
                style={{ width: '100%', height: '36px' }}
              />
            </div>


            {/* Clear Filters — inside panel */}
            {(searchTerm || filterStatus !== 'All' || filterType !== 'All' || filterSubType !== 'All' || filterCategory !== 'All' || filterCrisisLevel !== 'All' || filterSource !== 'All' || filterController !== 'All' || filterDateStart || filterDateEnd || activeTab !== 'Pending Endorsement') && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={resetFilters}
                  className="btn btn-secondary"
                  style={{ padding: '0 12px', fontSize: '12.5px', height: '34px', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="cases-list-container glass" style={{ marginTop: '20px', padding: '20px' }}>
        {loading ? (
          <div className="cases-loading">Loading incident registry...</div>
        ) : filteredIncidents.length === 0 ? (
          <div className="empty-cases">No incidents logged matching selected filters.</div>
        ) : (
          /* TABLE VIEW */
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Date Logged</th>
                  <th>Incident ID</th>
                  <th>Incident Title</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Subtype</th>
                  <th>Crisis Level</th>
                  <th>Location (Common Name)</th>
                  <th>Assigned Responder</th>
                  <th>Incident Status</th>
                </tr>
              </thead>
              <tbody>
                {paginatedIncidents.map((c) => {
                  const inc = c.incident!;
                  return (
                    <tr key={c.id} onClick={() => {
                      window.location.href = `/incidents/${inc.id}`;
                    }}>
                      <td className="date-cell">
                        {new Date(inc.dateTime).toLocaleDateString('en-US')} {new Date(inc.dateTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td>
                        <span className="mono-id" style={{ color: 'var(--color-critical)', background: 'var(--color-critical-bg)', borderColor: 'var(--color-critical-border)' }}>
                          {inc.id}
                        </span>
                      </td>
                      <td className="case-title-cell" style={{ fontWeight: 500, maxWidth: '260px', minWidth: '200px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                          {inc.priority === 'High' ? (
                            /* Double chevron up — High */
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="High">
                              <path d="M3 10L8 5L13 10" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M3 14L8 9L13 14" stroke="#E53E3E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          ) : (
                            /* Equals sign — Normal */
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Normal">
                              <rect x="2" y="5.5" width="12" height="2" rx="1" fill="#F6AD55"/>
                              <rect x="2" y="9.5" width="12" height="2" rx="1" fill="#F6AD55"/>
                            </svg>
                          )}
                          <span
                            title={c.title.length > 59 ? c.title : undefined}
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '210px',
                              display: 'block',
                            }}
                          >
                            {c.title}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="badge" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {inc.category || DEFAULT_INCIDENT_CATEGORY}
                        </span>
                      </td>
                      <td>{inc.type}</td>
                      <td>{inc.subType}</td>
                      <td>
                        <span className="badge" style={{
                          background: inc.crisisLevel <= 2 ? 'var(--color-critical-bg)' : inc.crisisLevel === 3 ? '#FFF7ED' : '#F7FAFC',
                          color: inc.crisisLevel <= 2 ? 'var(--color-critical)' : inc.crisisLevel === 3 ? '#C05621' : 'var(--text-muted)',
                          borderColor: inc.crisisLevel <= 2 ? 'var(--color-critical-border)' : inc.crisisLevel === 3 ? '#FBD38D' : 'var(--border-color)',
                          fontWeight: 600,
                          fontSize: '12px',
                        }}>
                          {inc.crisisLevel}
                        </span>
                      </td>
                      <td>{inc.location.commonName || inc.location.road}</td>
                      <td>
                        <RespondersAvatars names={inc.assignedTo} />
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(inc.status)}`}>
                          {inc.status === 'Live (Assigned)' ? 'Assigned' : inc.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + itemsPerPage, filteredIncidents.length)}</strong> of <strong>{filteredIncidents.length}</strong> incidents
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="btn btn-secondary btn-xs"
                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', opacity: currentPage === 1 ? 0.5 : 1, cursor: currentPage === 1 ? 'default' : 'pointer' }}
                  >
                    Previous
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                    const isCurrent = p === currentPage;
                    return (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p)}
                        className={`btn ${isCurrent ? 'btn-primary' : 'btn-secondary'} btn-xs`}
                        style={{
                          padding: '6px 10px',
                          fontSize: '11px',
                          borderRadius: '6px',
                          fontWeight: isCurrent ? 'bold' : 'normal',
                          cursor: 'pointer'
                        }}
                      >
                        {p}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="btn btn-secondary btn-xs"
                    style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '6px', opacity: currentPage === totalPages ? 0.5 : 1, cursor: currentPage === totalPages ? 'default' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
           )}
      </div>
    </>
  );
}
