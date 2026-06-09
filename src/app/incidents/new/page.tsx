'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/context/RoleContext';

const taxonomy: Record<string, string[]> = {
  'Security': ['Unattended Property', 'Suspicious Person', 'Intruder', 'Trespass', 'Theft', 'Vandalism', 'Others'],
  'Safety / Medical': ['Fainting/Giddiness', 'Slip & Fall', 'Heat Stroke', 'Drowning Alert', 'Cardiac Arrest', 'Others'],
  'Fire Alarm': ['Smoke Detector', 'Manual Call Point', 'Actual Fire', 'False Trigger', 'Others'],
  'Infrastructure': ['Power Outage', 'Water Pipe Leak', 'Lift Fault', 'Barrier Malfunction', 'Lighting Fault', 'Others']
};

export default function NewIncidentPage() {
  const router = useRouter();
  const { username } = useRole();

  const [title, setTitle] = useState('');
  const [incType, setIncType] = useState('Security');
  const [incSubType, setIncSubType] = useState('Unattended Property');
  const [priority, setPriority] = useState('Medium');
  const [reporter, setReporter] = useState('');
  const [requestedBy, setRequestedBy] = useState('IIOC Controller');
  const [summary, setSummary] = useState('');
  const [road, setRoad] = useState('');
  const [building, setBuilding] = useState('');
  const [levelSpace, setLevelSpace] = useState('');
  const [nearAt, setNearAt] = useState('');
  const [commonName, setCommonName] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [tagsStr, setTagsStr] = useState('Beachfront');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const list = taxonomy[incType];
    if (list && list.length > 0) setIncSubType(list[0]);
  }, [incType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);

    let lat = 1.2500, lng = 103.8300;
    if (commonName.toLowerCase().includes('siloso')) { lat = 1.2562; lng = 103.8124; }
    else if (commonName.toLowerCase().includes('palawan')) { lat = 1.2520; lng = 103.8210; }
    else if (commonName.toLowerCase().includes('cove')) { lat = 1.2464; lng = 103.8440; }
    else if (commonName.toLowerCase().includes('rws') || commonName.toLowerCase().includes('resorts')) { lat = 1.2585; lng = 103.8210; }

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
          road, building, levelSpace, nearAt, commonName,
          postalCode: postalCode || '000000',
          tags: tagsStr.split(',').map(t => t.trim()).filter(Boolean),
          lat, lng
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
        router.push('/incidents');
      } else {
        alert('Failed to log incident.');
        setSubmitting(false);
      }
    } catch (err) {
      console.error('Error creating incident:', err);
      setSubmitting(false);
    }
  };

  return (
    <div className="page-content">
      <div className="cases-header-bar glass">
        <div className="title-section">
          <h1>LOG NEW INCIDENT</h1>
          <p>Complete the form below to log a new incident into the registry</p>
        </div>
      </div>

      <div className="glass" style={{ padding: '2rem', marginTop: '1rem' }}>
        <form onSubmit={handleSubmit} className="modal-form">

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

          <div className="modal-actions" style={{ marginTop: '2rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => router.push('/incidents')}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Logging...' : 'LOG INCIDENT'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
