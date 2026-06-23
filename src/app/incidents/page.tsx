'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case, Incident } from '@/lib/db';
import { useRole } from '@/context/RoleContext';
import { getIncidentTaxonomy } from '@/lib/taxonomy';

export default function IncidentsPage() {
  const { role } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Filter States
  const [activeTab, setActiveTab] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterType, setFilterType] = useState<string>('All');
  const [filterSubType, setFilterSubType] = useState<string>('All');
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
  }, [searchTerm, filterStatus, filterType, filterSubType, filterCrisisLevel, filterSource, filterController, filterDateStart, filterDateEnd, activeTab]);

  // Reset Filters
  const resetFilters = () => {
    setSearchTerm('');
    setFilterStatus('All');
    setFilterType('All');
    setFilterSubType('All');
    setFilterCrisisLevel('All');
    setFilterSource('All');
    setFilterController('All');
    setFilterDateStart('');
    setFilterDateEnd('');
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
      return ['Live', 'Live (Assigned)', 'Live (Acknowledged)', 'Live (On-Site)', 'Live (Completed)', 'Live (Incomplete)'].includes(status);
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
  const filteredIncidents = incidentCases.filter(c => {
    const inc = c.incident!;
    
    if (!matchesTab(activeTab, inc)) return false;
    
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
    if (filterCrisisLevel !== 'All' && String(inc.crisisLevel) !== filterCrisisLevel) return false;
    if (!matchesSource(filterSource, inc)) return false;
    if (filterController !== 'All' && inc.createdBy !== filterController) return false;
    if (!matchesDateRange(inc.dateTime)) return false;

    return true;
  });

  // Pagination Calculations
  const totalPages = Math.ceil(filteredIncidents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedIncidents = filteredIncidents.slice(startIndex, startIndex + itemsPerPage);

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
      case 'Live (Incomplete)':
        return 'badge-ack';
      case 'Live (On-Site)':
        return 'badge-onsite';
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

      {/* Header bar */}
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1 style={{ textTransform: 'uppercase' }}>Incident Management Dashboard</h1>
          <p>Security, Safety, Fire, and Ground Incidents requiring ground response</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/incidents/lifecycle" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 12L5 9M12 12l7-3M12 12v10" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <circle cx="5" cy="9" r="2" />
              <circle cx="19" cy="9" r="2" />
            </svg>
            VIEW LIFECYCLE
          </Link>

          {isController && (
            <Link href="/incidents/new" className="btn btn-primary">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              LOG NEW INCIDENT
            </Link>
          )}
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="metric-card glass total-incidents">
          <div className="metric-info">
            <h3>Total Incidents</h3>
            <div className="metric-value text-info">{totalIncidentsCount}</div>
          </div>
          <div className="metric-icon" style={{ fontSize: '20px' }}>📊</div>
        </div>
        
        <div className="metric-card glass active-incidents">
          <div className="metric-info">
            <h3>Active Incidents</h3>
            <div className="metric-value text-danger">{activeIncidentsCount}</div>
          </div>
          <div className="metric-icon" style={{ fontSize: '20px' }}>🚨</div>
        </div>
        
        <div className="metric-card glass pending-endorsement">
          <div className="metric-info">
            <h3>Pending Endorsement</h3>
            <div className="metric-value text-warning">{pendingReviewCount}</div>
          </div>
          <div className="metric-icon" style={{ fontSize: '20px' }}>📝</div>
        </div>

      </div>

      {/* Advanced Filter Panel */}
      <div className="glass" style={{ padding: '20px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        
        {/* Main Filters Row (Search, Type, Status, Actions) */}
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          {/* Search bar */}
          <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Search Registry:</label>
            <input 
              type="text" 
              placeholder="Search by Case ID, Title, or Responder..." 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ width: '100%' }}
            />
          </div>

          {/* Type dropdown */}
          <div style={{ flex: '0 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Incident Type:</label>
            <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setFilterSubType('All'); }} className="form-control select-dark" style={{ width: '100%' }}>
              <option value="All">All Types</option>
              {Object.keys(taxonomy).sort().map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Status dropdown */}
          <div style={{ flex: '0 1 180px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>Status:</label>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="form-control select-dark" style={{ width: '100%' }}>
              <option value="All">All Statuses</option>
              <option value="Live">Live</option>
              <option value="Live (Assigned)">Live (Assigned)</option>
              <option value="Live (Acknowledged)">Live (Acknowledged)</option>
              <option value="Live (On-Site)">Live (On-Site)</option>
              <option value="Live (Completed)">Live (Completed)</option>
              <option value="Live (Incomplete)">Live (Incomplete)</option>
              <option value="Pending Endorsement">Pending Endorsement</option>
              <option value="Returned">Returned</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', height: '36px', alignItems: 'center' }}>
            <button 
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} 
              className="btn btn-secondary"
              style={{ padding: '0 14px', fontSize: '12px', height: '100%', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              ⚙️ {showAdvancedFilters ? 'Hide Options' : 'More Options'}
            </button>
            
            <button 
              onClick={resetFilters} 
              className="btn btn-secondary"
              style={{ padding: '0 10px', fontSize: '12px', height: '100%', border: 'none', background: 'transparent', textDecoration: 'underline', whiteSpace: 'nowrap' }}
            >
              Clear
            </button>
          </div>

        </div>

        {/* Collapsible Advanced Filters Row */}
        {showAdvancedFilters && (
          <div 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', 
              gap: '12px', 
              paddingTop: '16px', 
              borderTop: '1px solid var(--border-color)' 
            }}
          >
            {/* Sub-type dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Incident Sub-Type:</label>
              <select 
                value={filterSubType} 
                onChange={(e) => setFilterSubType(e.target.value)} 
                className="form-control select-dark"
                disabled={filterType === 'All'}
              >
                <option value="All">All Sub-types</option>
                {filterType !== 'All' && taxonomy[filterType]?.sort().map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>

            {/* Crisis Level dropdown */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Crisis Level:</label>
              <select value={filterCrisisLevel} onChange={(e) => setFilterCrisisLevel(e.target.value)} className="form-control select-dark">
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
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Incident Source:</label>
              <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="form-control select-dark">
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
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Controller:</label>
              <select value={filterController} onChange={(e) => setFilterController(e.target.value)} className="form-control select-dark">
                <option value="All">All Controllers</option>
                {uniqueControllers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Date Picker Start */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Date From:</label>
              <input 
                type="date" 
                value={filterDateStart} 
                onChange={(e) => setFilterDateStart(e.target.value)} 
                className="form-control" 
              />
            </div>

            {/* Date Picker End */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Date To:</label>
              <input 
                type="date" 
                value={filterDateEnd} 
                onChange={(e) => setFilterDateEnd(e.target.value)} 
                className="form-control" 
              />
            </div>
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
                  <th>Case ID</th>
                  <th>Incident ID</th>
                  <th>Incident Title</th>
                  <th>Type</th>
                  <th>Subtype</th>
                  <th>Priority</th>
                  <th>Location (Common Name)</th>
                  <th>Assigned Responder</th>
                  <th>Incident Status</th>
                  <th>Date Logged</th>
                </tr>
              </thead>
              <tbody>
                {paginatedIncidents.map((c) => {
                  const inc = c.incident!;
                  return (
                    <tr key={c.id} onClick={() => {
                      window.location.href = `/incidents/${inc.id}`;
                    }}>
                      <td className="case-id-cell">{c.id}</td>
                      <td className="case-id-cell" style={{ fontFamily: 'monospace' }}>{inc.id}</td>
                      <td className="case-title-cell">{c.title}</td>
                      <td>{inc.type}</td>
                      <td>{inc.subType}</td>
                      <td>
                        <span className={`badge ${
                          inc.priority === 'High' ? 'badge-live' : 'badge-closed'
                        }`}>
                          {inc.priority}
                        </span>
                      </td>
                      <td>{inc.location.commonName || inc.location.road}</td>
                      <td>
                        {Array.isArray(inc.assignedTo) ? (
                          inc.assignedTo.length > 0 ? (
                            inc.assignedTo.join(', ')
                          ) : (
                            <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>
                          )
                        ) : (
                          inc.assignedTo || <span style={{ color: 'var(--text-faint)' }}>Unassigned</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(inc.status)}`}>
                          {inc.status}
                        </span>
                      </td>
                      <td className="date-cell">
                        {new Date(inc.dateTime).toLocaleDateString('en-US')} {new Date(inc.dateTime).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}
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
