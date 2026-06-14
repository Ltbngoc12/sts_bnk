import React, { useState, useEffect, useRef } from 'react';

export interface LocationNode {
  id: string;
  name: string;
  type: 'Road' | 'Building' | 'Level' | 'Space';
  parentId: string | null;
  lat?: number;
  lng?: number;
  tags?: string[];
  status: 'Active' | 'Inactive';
}

export interface LocationSelectorProps {
  onLocationSelect: (details: {
    road: string;
    building: string;
    levelSpace: string;
    commonName: string;
    lat: number;
    lng: number;
    tags: string[];
  }) => void;
  initialRoad?: string;
  initialBuilding?: string;
  initialLevelSpace?: string;
  initialCommonName?: string;
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

export default function LocationSelector({
  onLocationSelect,
  initialRoad = '',
  initialBuilding = '',
  initialLevelSpace = '',
  initialCommonName = ''
}: LocationSelectorProps) {
  const [nodes, setNodes] = useState<LocationNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ space: LocationNode; path: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  // Selector IDs
  const [roadId, setRoadId] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [levelId, setLevelId] = useState('');
  const [spaceId, setSpaceId] = useState('');

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load from local storage or fallback
  useEffect(() => {
    const stored = localStorage.getItem('admin_location_hierarchy');
    const activeNodes = stored ? JSON.parse(stored) : DEFAULT_NODES;
    setNodes(activeNodes);

    // If initial values are passed, try to pre-populate selection IDs
    if (initialRoad) {
      const roadNode = activeNodes.find((n: LocationNode) => n.type === 'Road' && n.name === initialRoad);
      if (roadNode) {
        setRoadId(roadNode.id);
        if (initialBuilding) {
          const bldNode = activeNodes.find((n: LocationNode) => n.type === 'Building' && n.name === initialBuilding && n.parentId === roadNode.id);
          if (bldNode) {
            setBuildingId(bldNode.id);
            if (initialLevelSpace) {
              // Level Name is usually the first part of LevelSpace, e.g. "Level 1"
              const levelName = initialLevelSpace.split(' - ')[0] || initialLevelSpace;
              const lvlNode = activeNodes.find((n: LocationNode) => n.type === 'Level' && n.name === levelName && n.parentId === bldNode.id);
              if (lvlNode) {
                setLevelId(lvlNode.id);
                if (initialCommonName) {
                  const spcNode = activeNodes.find((n: LocationNode) => n.type === 'Space' && n.name === initialCommonName && n.parentId === lvlNode.id);
                  if (spcNode) {
                    setSpaceId(spcNode.id);
                  }
                }
              }
            }
          }
        }
      }
    }
  }, [initialRoad, initialBuilding, initialLevelSpace, initialCommonName]);

  // Click outside listener for search autocomplete
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options based on selection tree
  const roads = nodes.filter(n => n.type === 'Road' && n.status === 'Active');
  const buildings = nodes.filter(n => n.parentId === roadId && n.type === 'Building' && n.status === 'Active');
  const levels = nodes.filter(n => n.parentId === buildingId && n.type === 'Level' && n.status === 'Active');
  const spaces = nodes.filter(n => n.parentId === levelId && n.type === 'Space' && n.status === 'Active');

  // Trigger search logic
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }

    const matches: { space: LocationNode; path: string }[] = [];
    const activeSpaces = nodes.filter(n => n.type === 'Space' && n.status === 'Active');

    activeSpaces.forEach(space => {
      // Perform keyword matching on space name or its tags
      const matchSpaceName = space.name.toLowerCase().includes(query.toLowerCase());
      const matchTags = space.tags?.some(tag => tag.toLowerCase().includes(query.toLowerCase())) || false;

      if (matchSpaceName || matchTags) {
        // Resolve full path
        const lvl = nodes.find(n => n.id === space.parentId);
        const bld = lvl ? nodes.find(n => n.id === lvl.parentId) : null;
        const rd = bld ? nodes.find(n => n.id === bld.parentId) : null;

        const pathSegments = [
          rd?.name || 'Unknown Road',
          bld?.name || 'Unknown Building',
          lvl?.name || 'Unknown Level',
          space.name
        ];

        matches.push({
          space,
          path: pathSegments.join(' └─ ')
        });
      }
    });

    setSearchResults(matches);
    setShowDropdown(true);
  };

  // Select location from autocomplete search result
  const handleSelectSearchResult = (space: LocationNode) => {
    const lvl = nodes.find(n => n.id === space.parentId);
    const bld = lvl ? nodes.find(n => n.id === lvl.parentId) : null;
    const rd = bld ? nodes.find(n => n.id === bld.parentId) : null;

    if (rd) setRoadId(rd.id);
    if (bld) setBuildingId(bld.id);
    if (lvl) setLevelId(lvl.id);
    setSpaceId(space.id);

    setSearchQuery('');
    setSearchResults([]);
    setShowDropdown(false);

    // Trigger callback
    onLocationSelect({
      road: rd?.name || '',
      building: bld?.name || '',
      levelSpace: lvl ? `${lvl.name} - ${space.name}` : space.name,
      commonName: space.name,
      lat: space.lat || 1.2500,
      lng: space.lng || 103.8300,
      tags: space.tags || []
    });
  };

  // Trigger callback when manually selecting dropdowns
  const handleDropdownChange = (type: 'Road' | 'Building' | 'Level' | 'Space', value: string) => {
    let resolvedRoadId = roadId;
    let resolvedBuildingId = buildingId;
    let resolvedLevelId = levelId;
    let resolvedSpaceId = spaceId;

    if (type === 'Road') {
      resolvedRoadId = value;
      resolvedBuildingId = '';
      resolvedLevelId = '';
      resolvedSpaceId = '';
      setRoadId(value);
      setBuildingId('');
      setLevelId('');
      setSpaceId('');
    } else if (type === 'Building') {
      resolvedBuildingId = value;
      resolvedLevelId = '';
      resolvedSpaceId = '';
      setBuildingId(value);
      setLevelId('');
      setSpaceId('');
    } else if (type === 'Level') {
      resolvedLevelId = value;
      resolvedSpaceId = '';
      setLevelId(value);
      setSpaceId('');
    } else if (type === 'Space') {
      resolvedSpaceId = value;
      setSpaceId(value);
    }

    // Resolve node names
    const rdNode = nodes.find(n => n.id === resolvedRoadId);
    const bldNode = nodes.find(n => n.id === resolvedBuildingId);
    const lvlNode = nodes.find(n => n.id === resolvedLevelId);
    const spcNode = nodes.find(n => n.id === resolvedSpaceId);

    // Call callback with current resolution
    onLocationSelect({
      road: rdNode?.name || '',
      building: bldNode?.name || '',
      levelSpace: lvlNode && spcNode ? `${lvlNode.name} - ${spcNode.name}` : (lvlNode?.name || spcNode?.name || ''),
      commonName: spcNode?.name || bldNode?.name || rdNode?.name || '',
      lat: spcNode?.lat || bldNode?.lat || rdNode?.lat || 1.2500,
      lng: spcNode?.lng || bldNode?.lng || rdNode?.lng || 103.8300,
      tags: spcNode?.tags || []
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
      {/* 1. Global Autocomplete Search Input */}
      <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }} className="form-group colspan-2">
        <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          🔍 Search Location Hierarchy (Road/Building/Space/Tags)
        </label>
        <input
          type="text"
          placeholder="Type keywords (e.g. 'Ticket', 'Control Room', 'Siloso')..."
          value={searchQuery}
          onChange={e => handleSearchChange(e.target.value)}
          className="form-control"
          style={{ width: '100%' }}
        />
        
        {showDropdown && searchResults.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(43, 31, 29, 0.15)',
            zIndex: 999,
            maxHeight: '240px',
            overflowY: 'auto',
            marginTop: '4px'
          }}>
            {searchResults.map(({ space, path }) => (
              <div
                key={space.id}
                onClick={() => handleSelectSearchResult(space)}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  borderBottom: '1px solid var(--border-color)',
                  color: 'var(--text-main)',
                  transition: 'background 0.15s ease'
                }}
                className="search-item-hover"
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-inset)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600 }}>{space.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{path}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Hierarchical Dropdowns (Grid layout) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%' }}>
        {/* Road Dropdown */}
        <div className="form-group">
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Road Name</label>
          <select
            value={roadId}
            onChange={e => handleDropdownChange('Road', e.target.value)}
            className="form-control select-dark"
          >
            <option value="">-- Select Road --</option>
            {roads.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>

        {/* Building Dropdown */}
        <div className="form-group">
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Building Name</label>
          <select
            value={buildingId}
            onChange={e => handleDropdownChange('Building', e.target.value)}
            disabled={!roadId}
            className="form-control select-dark"
          >
            <option value="">-- Select Building --</option>
            {buildings.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* Level Dropdown */}
        <div className="form-group">
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Level</label>
          <select
            value={levelId}
            onChange={e => handleDropdownChange('Level', e.target.value)}
            disabled={!buildingId}
            className="form-control select-dark"
          >
            <option value="">-- Select Level --</option>
            {levels.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        {/* Space Dropdown */}
        <div className="form-group">
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '5px', textTransform: 'uppercase' }}>Space / Venue</label>
          <select
            value={spaceId}
            onChange={e => handleDropdownChange('Space', e.target.value)}
            disabled={!levelId}
            className="form-control select-dark"
          >
            <option value="">-- Select Space --</option>
            {spaces.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
