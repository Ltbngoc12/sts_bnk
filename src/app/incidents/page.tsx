'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Case } from '@/lib/db';
import { useRole } from '@/context/RoleContext';

export default function IncidentsPage() {
  const { role, username } = useRole();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [incType, setIncType] = useState('Security');
  const [incSubType, setIncSubType] = useState('Unattended Property');
  const [priority, setPriority] = useState('Medium');
  const [reporter, setReporter] = useState('');
  const [requestedBy, setRequestedBy] = useState('IIOC Controller');
  const [summary, setSummary] = useState('');
  
  // Location form state
  const [road, setRoad] = useState('');
  const [building, setBuilding] = useState('');
  const [levelSpace, setLevelSpace] = useState('');
  const [nearAt, setNearAt] = useState('');
  const [commonName, setCommonName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [tagsStr, setTagsStr] = useState('Beachfront');

  // Taxonomy mapping
  const taxonomy: Record<string, string[]> = {
    'Security': ['Unattended Property', 'Suspicious Person', 'Intruder', 'Trespass', 'Theft', 'Vandalism', 'Others'],
    'Safety / Medical': ['Fainting/Giddiness', 'Slip & Fall', 'Heat Stroke', 'Drowning Alert', 'Cardiac Arrest', 'Others'],
    'Fire Alarm': ['Smoke Detector', 'Manual Call Point', 'Actual Fire', 'False Trigger', 'Others'],
    'Infrastructure': ['Power Outage', 'Water Pipe Leak', 'Lift Fault', 'Barrier Malfunction', 'Lighting Fault', 'Others']
  };

  useEffect(() => {
    fetchCases();
  }, []);

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

  useEffect(() => {
    const list = taxonomy[incType];
    if (list && list.length > 0) {
      setIncSubType(list[0]);
    }
  }, [incType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let lat = 1.2500;
    let lng = 103.8300;
    if (commonName.toLowerCase().includes('siloso')) {
      lat = 1.2562; lng = 103.8124;
    } else if (commonName.toLowerCase().includes('palawan')) {
      lat = 1.2520; lng = 103.8210;
    } else if (commonName.toLowerCase().includes('cove')) {
      lat = 1.2464; lng = 103.8440;
    } else if (commonName.toLowerCase().includes('rws') || commonName.toLowerCase().includes('resorts')) {
      lat = 1.2585; lng = 103.8210;
    }

    const payload = {
      title,
      username,
      status: 'Active',
      incident: {
        dateTime: new Date().toISOString(),
        type: incType,
        subType: incSubType,
        priority,
        reporterName: reporter || 'Anonymous Guest',
        requestedBy,
        status: 'Live',
        summary,
        location: {
          road,
          building,
          levelSpace,
          nearAt,
          commonName,
          postalCode: postalCode || '000000',
          tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
          lat,
          lng
        }
      }
    };

    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowCreateModal(false);
        setTitle('');
        setRoad('');
        setBuilding('');
        setLevelSpace('');
        setNearAt('');
        setCommonName('');
        setPostalCode('');
        setSummary('');
        fetchCases();
      } else {
        alert('Failed to log incident.');
      }
    } catch (err) {
      console.error('Error creating incident:', err);
    }
  };

  // Filter only cases containing incidents
  const incidentCases = cases.filter(c => c.incident !== null);

  const filteredIncidents = incidentCases.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.incident?.assignedTo && c.incident.assignedTo.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesPriority = filterPriority === 'All' || (c.incident && c.incident.priority === filterPriority);
    return matchesSearch && matchesPriority;
  });

  const isController = role === 'Controller' || role === 'Duty Manager' || role === 'Duty Officer' || role === 'System Administrator';

  return (
    <>
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>INCIDENT REGISTRY LOG</h1>
          <p>Security, Safety, Fire, and Ground Incidents requiring Ranger response</p>
        </div>
        
        {isController && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            LOG NEW INCIDENT
          </button>
        )}
      </div>

      {/* Filter panel */}
      <div className="filter-panel glass">
        <div className="search-group">
          <input 
            type="text" 
            placeholder="Search by Case ID, Title, or Ranger..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="select-filters">
          <div className="filter-select-group">
            <label>Priority:</label>
            <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="form-control select-dark">
              <option value="All">All Priorities</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="cases-list-container glass">
        {loading ? (
          <div className="cases-loading">Loading incident registry...</div>
        ) : filteredIncidents.length === 0 ? (
          <div className="empty-cases">No incidents logged matching filters.</div>
        ) : (
          <div className="table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Incident Title</th>
                  <th>Classification</th>
                  <th>Priority</th>
                  <th>Location (Common Name)</th>
                  <th>Assigned Ranger</th>
                  <th>Incident Status</th>
                  <th>Date Logged</th>
                </tr>
              </thead>
              <tbody>
                {filteredIncidents.map((c) => (
                  <tr key={c.id} onClick={() => window.location.href = `/cases/${c.id}`}>
                    <td className="case-id-cell">{c.id}</td>
                    <td className="case-title-cell">{c.title}</td>
                    <td>{c.incident?.type} - {c.incident?.subType}</td>
                    <td>
                      <span className={`badge ${
                        c.incident?.priority === 'High' ? 'badge-live' :
                        c.incident?.priority === 'Medium' ? 'badge-ack' : 'badge-closed'
                      }`}>
                        {c.incident?.priority}
                      </span>
                    </td>
                    <td>{c.incident?.location.commonName || c.incident?.location.road}</td>
                    <td>{c.incident?.assignedTo || 'Unassigned'}</td>
                    <td>
                      <span className={`badge ${
                        c.incident?.status === 'Live' ? 'badge-live' :
                        c.incident?.status === 'Live (Acknowledged)' ? 'badge-ack' :
                        c.incident?.status === 'Live (On-Site)' ? 'badge-onsite' :
                        c.incident?.status === 'Live (Completed)' ? 'badge-completed' :
                        c.incident?.status === 'Pending Review' ? 'badge-review' : 'badge-closed'
                      }`}>
                        {c.incident?.status || c.status}
                      </span>
                    </td>
                    <td className="date-cell">{new Date(c.createdAt).toLocaleDateString('en-US')} {new Date(c.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-in Creation Dialog */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="create-case-modal glass">
            <div className="modal-header">
              <h2>LOG NEW INCIDENT</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>Close</button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-scroll-area">
                
                <h3 className="section-title">General Information</h3>
                <div className="form-grid">
                  <div className="form-group colspan-2">
                    <label>Incident Title *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Unattended backpack near beach tram station" 
                      value={title} 
                      onChange={(e) => setTitle(e.target.value)} 
                      required 
                      className="form-control"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Incident Type *</label>
                    <select value={incType} onChange={(e) => setIncType(e.target.value)} className="form-control select-dark">
                      {Object.keys(taxonomy).map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Incident Sub-Type *</label>
                    <select value={incSubType} onChange={(e) => setIncSubType(e.target.value)} className="form-control select-dark">
                      {taxonomy[incType]?.map(st => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Priority</label>
                    <select value={priority} onChange={(e) => setPriority(e.target.value)} className="form-control select-dark">
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Requested By</label>
                    <select value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} className="form-control select-dark">
                      <option value="IIOC Controller">IIOC Controller</option>
                      <option value="Guest Call-in">Guest Call-in (Hotline)</option>
                      <option value="Ranger Field Patrol">Ranger Field Patrol</option>
                      <option value="State Agency (SCDF/SPF)">State Agency (SCDF/SPF)</option>
                    </select>
                  </div>

                  <div className="form-group colspan-2">
                    <label>Reporter Details</label>
                    <input 
                      type="text" 
                      placeholder="Reporter Name / Contact Details" 
                      value={reporter} 
                      onChange={(e) => setReporter(e.target.value)} 
                      className="form-control"
                    />
                  </div>
                </div>

                <h3 className="section-title">Incident Location</h3>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Common Name *</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Siloso Lifeguard Post 2" 
                      value={commonName} 
                      onChange={(e) => setCommonName(e.target.value)} 
                      required
                      className="form-control"
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>Road Reference</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Siloso Beach Walk" 
                      value={road} 
                      onChange={(e) => setRoad(e.target.value)} 
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Building Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Emerald Pavilion" 
                      value={building} 
                      onChange={(e) => setBuilding(e.target.value)} 
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Level & Space</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Near public shower block" 
                      value={levelSpace} 
                      onChange={(e) => setLevelSpace(e.target.value)} 
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Postal Code</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 098997" 
                      value={postalCode} 
                      onChange={(e) => setPostalCode(e.target.value)} 
                      maxLength={6}
                      className="form-control"
                    />
                  </div>

                  <div className="form-group">
                    <label>Beside / Near To Qualifier</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Beside the main bench" 
                      value={nearAt} 
                      onChange={(e) => setNearAt(e.target.value)} 
                      className="form-control"
                    />
                  </div>

                  <div className="form-group colspan-2">
                    <label>Location Tags (Comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="Beachfront, Siloso Zone" 
                      value={tagsStr} 
                      onChange={(e) => setTagsStr(e.target.value)} 
                      className="form-control"
                    />
                  </div>
                </div>

                <h3 className="section-title">Incident Details</h3>
                <div className="form-group">
                  <label>Initial Description</label>
                  <textarea 
                    rows={3} 
                    placeholder="Provide details on the incident..." 
                    value={summary} 
                    onChange={(e) => setSummary(e.target.value)} 
                    className="form-control"
                  />
                </div>

              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">LOG INCIDENT</button>
              </div>
            </form>
          </div>
        </div>
      )}


    </>
  );
}
