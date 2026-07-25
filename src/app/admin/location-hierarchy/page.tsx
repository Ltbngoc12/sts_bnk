'use client';

import React, { useState, useEffect } from 'react';
import { AdminGuard } from '@/components/AdminGuard';
import { useRole } from '@/context/RoleContext';

interface LocationNode {
  id: string;
  name: string;
  type: 'Road' | 'Building' | 'Level' | 'Space';
  parentId: string | null;
  lat?: number;
  lng?: number;
  tags?: string[];
  status: 'Active' | 'Deactivated';
}

const DEFAULT_NODES: LocationNode[] = [
  // Roads
  { id: 'road-siloso', name: 'Siloso Beach Walk', type: 'Road', parentId: null, status: 'Active' },
  { id: 'road-palawan', name: 'Palawan Beach Walk', type: 'Road', parentId: null, status: 'Active' },
  { id: 'road-imbiah', name: 'Imbiah Road', type: 'Road', parentId: null, status: 'Active' },

  // Buildings
  { id: 'bld-siloso-station', name: 'Siloso Beach Station', type: 'Building', parentId: 'road-siloso', status: 'Active' },
  { id: 'bld-costa-sands', name: 'Costa Sands Resort', type: 'Building', parentId: 'road-siloso', status: 'Active' },
  { id: 'bld-palawan-court', name: 'Palawan Food Court', type: 'Building', parentId: 'road-palawan', status: 'Active' },
  { id: 'bld-cable-station', name: 'Cable Car Station', type: 'Building', parentId: 'road-imbiah', status: 'Active' },

  // Levels
  { id: 'lvl-siloso-st-1', name: 'Level 1', type: 'Level', parentId: 'bld-siloso-station', status: 'Active' },
  { id: 'lvl-siloso-st-2', name: 'Level 2', type: 'Level', parentId: 'bld-siloso-station', status: 'Active' },
  { id: 'lvl-costa-ground', name: 'Ground Floor', type: 'Level', parentId: 'bld-costa-sands', status: 'Active' },
  { id: 'lvl-palawan-court-1', name: 'Level 1', type: 'Level', parentId: 'bld-palawan-court', status: 'Active' },
  { id: 'lvl-cable-ground', name: 'Ground Level', type: 'Level', parentId: 'bld-cable-station', status: 'Active' },

  // Spaces
  { id: 'spc-siloso-ticket', name: 'Ticket Counter', type: 'Space', parentId: 'lvl-siloso-st-1', lat: 1.2512, lng: 103.8180, tags: ['Ticket', 'IOH-Cam'], status: 'Active' },
  { id: 'spc-siloso-ctrl', name: 'Control Room', type: 'Space', parentId: 'lvl-siloso-st-1', lat: 1.2514, lng: 103.8182, tags: ['Operational', 'Restricted'], status: 'Active' },
  { id: 'spc-siloso-cafe', name: 'Rooftop Cafe', type: 'Space', parentId: 'lvl-siloso-st-2', lat: 1.2515, lng: 103.8185, tags: ['F&B', 'Public'], status: 'Active' },
  { id: 'spc-costa-lobby', name: 'Hotel Lobby', type: 'Space', parentId: 'lvl-costa-ground', lat: 1.2505, lng: 103.8150, tags: ['Resort', 'Public'], status: 'Active' },
  { id: 'spc-palawan-stall1', name: 'Stall 1 (Drinks)', type: 'Space', parentId: 'lvl-palawan-court-1', lat: 1.2501, lng: 103.8242, tags: ['F&B', 'Public'], status: 'Active' },
  { id: 'spc-cable-gate', name: 'Entrance Gate', type: 'Space', parentId: 'lvl-cable-ground', lat: 1.2541, lng: 103.8190, tags: ['Entrance', 'Transit'], status: 'Active' }
];

export default function LocationHierarchyPage() {
  const { username } = useRole();
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  
  // Drawer & Form states
  const [selectedNode, setSelectedNode] = useState<LocationNode | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [isAddRootMode, setIsAddRootMode] = useState(false);
  const [addChildType, setAddChildType] = useState<'Building' | 'Level' | 'Space'>('Building');
  
  // Form fields
  const [formName, setFormName] = useState('');
  const [formLat, setFormLat] = useState('1.25');
  const [formLng, setFormLng] = useState('103.83');
  const [tagInput, setTagInput] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('admin_location_hierarchy');
    if (stored) {
      setNodes(JSON.parse(stored));
    } else {
      setNodes(DEFAULT_NODES);
      localStorage.setItem('admin_location_hierarchy', JSON.stringify(DEFAULT_NODES));
    }
    // Expand top roads by default
    setExpandedNodes({
      'road-siloso': true,
      'road-palawan': true,
      'road-imbiah': true,
      'bld-siloso-station': true
    });
  }, []);

  const saveLocationState = (updated: LocationNode[]) => {
    setNodes(updated);
    localStorage.setItem('admin_location_hierarchy', JSON.stringify(updated));
  };

  const logAudit = async (action: string, before: any, after: any, details: string) => {
    try {
      await fetch('/api/admin/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: username,
          module: 'Location Hierarchy',
          action,
          details,
          beforeSnapshot: JSON.stringify(before),
          afterSnapshot: JSON.stringify(after),
          correlationId: `LOC-${Date.now()}`
        })
      });
    } catch (e) {
      console.error('Audit logging failed:', e);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectNode = (node: LocationNode) => {
    setSelectedNode(node);
    setIsAddMode(false);
    setIsAddRootMode(false);
    setIsEditMode(false);
    setFormName(node.name);
    setFormLat(String(node.lat || '1.25'));
    setFormLng(String(node.lng || '103.83'));
    setFormTags(node.tags || []);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;

    const updated = nodes.map(n => {
      if (n.id === selectedNode.id) {
        return {
          ...n,
          name: formName,
          lat: n.type === 'Space' ? parseFloat(formLat) : undefined,
          lng: n.type === 'Space' ? parseFloat(formLng) : undefined,
          tags: n.type === 'Space' ? formTags : undefined
        };
      }
      return n;
    });

    const updatedNode = updated.find(n => n.id === selectedNode.id);
    logAudit('Edit Location', selectedNode, updatedNode, `Updated location details for ${selectedNode.type}: ${formName}`);
    saveLocationState(updated);
    setSelectedNode(updatedNode || null);
    setIsEditMode(false);
  };

  const handleAddChild = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;

    const newChild: LocationNode = {
      id: `node-${Date.now()}`,
      name: formName,
      type: addChildType,
      parentId: selectedNode.id,
      lat: addChildType === 'Space' ? parseFloat(formLat) : undefined,
      lng: addChildType === 'Space' ? parseFloat(formLng) : undefined,
      tags: addChildType === 'Space' ? formTags : undefined,
      status: 'Active'
    };

    logAudit('Add Location', null, newChild, `Added child location ${addChildType} to parent ${selectedNode.name}: ${formName}`);
    saveLocationState([...nodes, newChild]);
    
    // Autoexpand parent
    setExpandedNodes(prev => ({ ...prev, [selectedNode.id]: true }));
    setIsAddMode(false);
    setSelectedNode(newChild);
  };

  const handleAddRoot = (e: React.FormEvent) => {
    e.preventDefault();

    const newRoad: LocationNode = {
      id: `node-${Date.now()}`,
      name: formName,
      type: 'Road',
      parentId: null,
      status: 'Active'
    };

    logAudit('Add Location', null, newRoad, `Added new root Walk/Road: ${formName}`);
    saveLocationState([...nodes, newRoad]);

    setIsAddRootMode(false);
    setSelectedNode(newRoad);
  };

  const handleToggleStatus = (node: LocationNode) => {
    const newStatus = node.status === 'Active' ? 'Deactivated' : 'Active';
    const updated = nodes.map(n => {
      if (n.id === node.id) {
        return { ...n, status: newStatus as 'Active' | 'Deactivated' };
      }
      return n;
    });
    
    logAudit(
      newStatus === 'Active' ? 'Reactivate Location' : 'Deactivate Location',
      node,
      { ...node, status: newStatus },
      `${newStatus === 'Active' ? 'Reactivated' : 'Deactivated'} location: ${node.name} (${node.type})`
    );
    saveLocationState(updated);
    setSelectedNode({ ...node, status: newStatus });
  };

  const resetForm = () => {
    setFormName('');
    setFormLat('1.25');
    setFormLng('103.83');
    setFormTags([]);
    setTagInput('');
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formTags.includes(tagInput.trim())) {
      setFormTags([...formTags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormTags(formTags.filter(t => t !== tag));
  };

  const renderTree = (parentId: string | null, depth = 0) => {
    const children = nodes.filter(n => n.parentId === parentId);
    const filtered = children.filter(child => {
      if (!searchTerm) return true;
      // Search matches this node name, or any of its descendants
      const matchesSelf = child.name.toLowerCase().includes(searchTerm.toLowerCase());
      const hasMatchingDescendant = (nodeId: string): boolean => {
        const direct = nodes.filter(n => n.parentId === nodeId);
        return direct.some(d => d.name.toLowerCase().includes(searchTerm.toLowerCase()) || hasMatchingDescendant(d.id));
      };
      return matchesSelf || hasMatchingDescendant(child.id);
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filtered.map(node => {
          const isExpanded = expandedNodes[node.id];
          const hasChildren = nodes.some(n => n.parentId === node.id);
          const isSelected = selectedNode?.id === node.id;
          
          return (
            <div key={node.id} style={{ marginLeft: depth > 0 ? '20px' : 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--color-primary-bg)' : 'transparent',
                  border: '1px solid ' + (isSelected ? 'var(--color-primary-border)' : 'transparent'),
                  transition: 'all 0.12s'
                }}
                onClick={() => handleSelectNode(node)}
              >
                {/* Expand/Collapse arrow */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(node.id); }}
                  style={{
                    border: 'none',
                    background: 'none',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    visibility: hasChildren ? 'visible' : 'hidden',
                    transform: isExpanded ? 'rotate(90deg)' : 'none',
                    transition: 'transform 0.15s',
                    marginRight: '4px',
                    color: 'var(--text-muted)'
                  }}
                >
                  ▶
                </button>

                {/* Node icon & label */}
                <span style={{ fontSize: '14px', marginRight: '8px' }}>
                  {node.type === 'Road' && '🛣️'}
                  {node.type === 'Building' && '🏢'}
                  {node.type === 'Level' && '🥞'}
                  {node.type === 'Space' && '📍'}
                </span>

                <span style={{ fontWeight: isSelected ? 700 : 500, color: node.status === 'Active' ? 'var(--text-main)' : 'var(--text-faint)', textDecoration: node.status === 'Active' ? 'none' : 'line-through', fontSize: '13.5px' }}>
                  {node.name}
                </span>

                {node.type === 'Space' && node.lat && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '10px' }}>
                    ({node.lat.toFixed(4)}, {node.lng?.toFixed(4)})
                  </span>
                )}
              </div>

              {hasChildren && isExpanded && (
                <div style={{ borderLeft: '1px dashed var(--border-color)', marginLeft: '16px', marginTop: '2px', paddingLeft: '4px' }}>
                  {renderTree(node.id, depth + 1)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <AdminGuard pageTitle="Location Hierarchy">
      <div className="admin-header-bar glass" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
        <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', fontWeight: 700, color: 'var(--text-main)' }}>LOCATION HIERARCHY</h1>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Configure the spatial mapping tree. Coordinates dictate 2D map locations on the main Operations dashboard.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginTop: '20px', minHeight: '520px', alignItems: 'start' }}>
        {/* Tree Card */}
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <input
              type="text"
              placeholder="Search locations..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', outline: 'none' }}
            />
            <button
              onClick={() => {
                setSelectedNode(null);
                setIsEditMode(false);
                setIsAddMode(false);
                setIsAddRootMode(true);
                resetForm();
              }}
              className="btn btn-primary"
              style={{ padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', background: 'var(--color-primary-dark)', border: 'none', color: '#fff', cursor: 'pointer' }}
            >
              + Add Walk/Road
            </button>
          </div>
          
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', paddingRight: '8px' }}>
            {renderTree(null)}
          </div>
        </div>

        {/* Detail drawer / Panel */}
        <div className="glass" style={{ padding: '20px', background: 'var(--bg-card)', minHeight: '500px', position: 'relative' }}>
          {selectedNode ? (
            <div>
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--color-primary-dark)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {selectedNode.type} Specifications
                  </span>
                  <h2 style={{ fontFamily: 'var(--font-headline)', fontSize: '20px', color: 'var(--text-main)', marginTop: '2px' }}>{selectedNode.name}</h2>
                </div>
                <span className={`badge ${selectedNode.status === 'Active' ? 'badge-completed' : 'badge-live'}`} style={{ padding: '4px 10px', borderRadius: '4px', fontSize: '12px' }}>
                  {selectedNode.status}
                </span>
              </div>

              {!isEditMode && !isAddMode && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {selectedNode.type === 'Space' && (
                    <>
                      <div>
                        <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Coordinates (lat, lng)</strong>
                        <p style={{ fontSize: '14px', fontFamily: 'var(--font-mono)', color: 'var(--text-main)' }}>
                          {selectedNode.lat}, {selectedNode.lng}
                        </p>
                      </div>

                      <div>
                        <strong style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Meta Tags</strong>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {selectedNode.tags?.map(t => (
                            <span key={t} className="badge badge-closed" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px' }}>{t}</span>
                          ))}
                          {(!selectedNode.tags || selectedNode.tags.length === 0) && <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>No tags configured</span>}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Actions buttons */}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
                    <button onClick={() => setIsEditMode(true)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Edit Location</button>
                    
                    {selectedNode.type !== 'Space' && (
                      <button
                        onClick={() => {
                          setIsAddMode(true);
                          const nextType = selectedNode.type === 'Road' ? 'Building' : selectedNode.type === 'Building' ? 'Level' : 'Space';
                          setAddChildType(nextType);
                          resetForm();
                        }}
                        className="btn btn-primary"
                        style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}
                      >
                        Add {selectedNode.type === 'Road' ? 'Building' : selectedNode.type === 'Building' ? 'Level' : 'Space'}
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleToggleStatus(selectedNode)}
                      className={`btn ${selectedNode.status === 'Active' ? 'btn-danger' : 'btn-success'}`}
                      style={{ padding: '8px 16px', borderRadius: '6px' }}
                    >
                      {selectedNode.status === 'Active' ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </div>
                </div>
              )}

              {/* Edit Mode */}
              {isEditMode && (
                <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Name</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                    />
                  </div>

                  {selectedNode.type === 'Space' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Latitude</label>
                          <input
                            type="number"
                            step="0.000001"
                            required
                            value={formLat}
                            onChange={e => setFormLat(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Longitude</label>
                          <input
                            type="number"
                            step="0.000001"
                            required
                            value={formLng}
                            onChange={e => setFormLng(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Tags</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="Add tag..."
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                          />
                          <button type="button" onClick={handleAddTag} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '13px' }}>Add</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          {formTags.map(t => (
                            <span key={t} className="badge badge-closed" style={{ padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                              {t}
                              <button type="button" onClick={() => handleRemoveTag(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-critical)', padding: 0, fontWeight: 700 }}>×</button>
                            </span>
                          ))}
                          {formTags.length === 0 && <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>No tags.</span>}
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                    <button type="button" onClick={() => setIsEditMode(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Save Details</button>
                  </div>
                </form>
              )}

              {/* Add Mode */}
              {isAddMode && (
                <form onSubmit={handleAddChild} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '12px', color: 'var(--color-primary-dark)' }}>Add new Child Node under {selectedNode.name}</strong>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Node Type</label>
                    <input
                      type="text"
                      disabled
                      value={addChildType}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px', background: 'var(--bg-inset)', color: 'var(--text-muted)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Name</label>
                    <input
                      type="text"
                      required
                      placeholder={`e.g. ${addChildType === 'Space' ? 'Office Room' : 'Floor 3'}`}
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                    />
                  </div>

                  {addChildType === 'Space' && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Latitude</label>
                          <input
                            type="number"
                            step="0.000001"
                            required
                            value={formLat}
                            onChange={e => setFormLat(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Longitude</label>
                          <input
                            type="number"
                            step="0.000001"
                            required
                            value={formLng}
                            onChange={e => setFormLng(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Tags</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                          <input
                            type="text"
                            placeholder="Add tag..."
                            value={tagInput}
                            onChange={e => setTagInput(e.target.value)}
                            style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                          />
                          <button type="button" onClick={handleAddTag} className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '13px' }}>Add</button>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '8px', background: 'var(--bg-inset)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          {formTags.map(t => (
                            <span key={t} className="badge badge-closed" style={{ padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                              {t}
                              <button type="button" onClick={() => handleRemoveTag(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-critical)', padding: 0, fontWeight: 700 }}>×</button>
                            </span>
                          ))}
                          {formTags.length === 0 && <span style={{ color: 'var(--text-faint)', fontSize: '12px' }}>No tags.</span>}
                        </div>
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                    <button type="button" onClick={() => setIsAddMode(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                    <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Add Location</button>
                  </div>
                </form>
              )}
            </div>
          ) : isAddRootMode ? (
            <form onSubmit={handleAddRoot} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', marginBottom: '8px' }}>
                <strong style={{ fontSize: '12px', color: 'var(--color-primary-dark)' }}>Add new Walk/Road (top-level)</strong>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tanjong Beach Walk"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                <button type="button" onClick={() => setIsAddRootMode(false)} className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '6px' }}>Cancel</button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', borderRadius: '6px', background: 'var(--color-primary-dark)', border: 'none', color: '#fff' }}>Add Walk/Road</button>
              </div>
            </form>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
              <span style={{ fontSize: '36px', marginBottom: '10px' }}>🌲</span>
              <h3>No Location Selected</h3>
              <p style={{ fontSize: '12.5px', marginTop: '6px' }}>Select any element in the hierarchy tree on the left to see coordinates details, edit parameters, or add sub-locations.</p>
            </div>
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
