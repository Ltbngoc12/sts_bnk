import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface LocationNode {
  id: string;
  name: string;
  type: 'Road' | 'Building' | 'Level' | 'Space';
  parentId: string | null;
  lat?: number;
  lng?: number;
  tags?: string[];
  postalCode?: string;
  commonName?: string;
  status: 'Active' | 'Inactive';
}

export const DEFAULT_NODES: LocationNode[] = [
  // Roads
  { id: 'road-siloso', name: 'Siloso Beach Walk', type: 'Road', parentId: null, status: 'Active' },
  { id: 'road-palawan', name: 'Palawan Beach Walk', type: 'Road', parentId: null, status: 'Active' },
  { id: 'road-imbiah', name: 'Imbiah Road', type: 'Road', parentId: null, status: 'Active' },

  // Buildings (with postalCode and commonName for auto-populate)
  { id: 'bld-siloso-station', name: 'Siloso Beach Station', type: 'Building', parentId: 'road-siloso', postalCode: '098991', commonName: 'Siloso Beach Station', status: 'Active' },
  { id: 'bld-costa-sands', name: 'Costa Sands Resort', type: 'Building', parentId: 'road-siloso', postalCode: '099982', commonName: 'Costa Sands Resort', status: 'Active' },
  { id: 'bld-palawan-court', name: 'Palawan Food Court', type: 'Building', parentId: 'road-palawan', postalCode: '098500', commonName: 'Palawan Food Court', status: 'Active' },
  { id: 'bld-cable-station', name: 'Cable Car Station', type: 'Building', parentId: 'road-imbiah', postalCode: '099238', commonName: 'Cable Car Station', status: 'Active' },

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
  { id: 'spc-cable-gate', name: 'Entrance Gate', type: 'Space', parentId: 'lvl-cable-ground', lat: 1.2541, lng: 103.8190, tags: ['Entrance', 'Transit'], status: 'Active' },
];

export interface LocationSelectorProps {
  onLocationSelect: (details: {
    road: string;
    building: string;
    levelSpace: string;
    commonName: string;
    postalCode: string;
    lat: number;
    lng: number;
    tags: string[];
  }) => void;
  initialRoad?: string;
  initialBuilding?: string;
  initialLevelSpace?: string;
  initialCommonName?: string;
  initialPostalCode?: string;
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-muted)',
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const DROP_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 2px)',
  left: 0,
  right: 0,
  background: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '6px',
  boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
  zIndex: 1000,
  maxHeight: '200px',
  overflowY: 'auto',
};

function SuggestionItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <div
      onMouseDown={onSelect}
      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '12.5px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-inset)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </div>
  );
}

export default function LocationSelector({
  onLocationSelect,
  initialRoad = '',
  initialBuilding = '',
  initialLevelSpace = '',
}: LocationSelectorProps) {
  const [nodes, setNodes] = useState<LocationNode[]>([]);

  // Free-text field values
  const [roadText, setRoadText] = useState(initialRoad);
  const [buildingText, setBuildingText] = useState(initialBuilding);
  const [levelText, setLevelText] = useState(() => {
    if (!initialLevelSpace) return '';
    return initialLevelSpace.split(' - ')[0] || '';
  });
  const [spaceText, setSpaceText] = useState(() => {
    if (!initialLevelSpace) return '';
    const parts = initialLevelSpace.split(' - ');
    return parts.length > 1 ? parts.slice(1).join(' - ') : '';
  });

  // Which combo dropdown is open: 'road' | 'building' | 'level' | 'space' | null
  const [openField, setOpenField] = useState<'road' | 'building' | 'level' | 'space' | null>(null);

  // Global search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ space: LocationNode; path: string }[]>([]);
  const [showSearchDrop, setShowSearchDrop] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('admin_location_hierarchy');
    setNodes(stored ? JSON.parse(stored) : DEFAULT_NODES);
  }, []);

  // Click-outside closes all dropdowns
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpenField(null);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchDrop(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Resolve hierarchy matches for filtering suggestions
  const matchedRoad = nodes.find(n => n.type === 'Road' && n.status === 'Active' && n.name.toLowerCase() === roadText.trim().toLowerCase());
  const matchedBuilding = nodes.find(n =>
    n.type === 'Building' && n.status === 'Active' &&
    n.name.toLowerCase() === buildingText.trim().toLowerCase() &&
    (!matchedRoad || n.parentId === matchedRoad.id)
  );
  const matchedLevel = nodes.find(n =>
    n.type === 'Level' && n.status === 'Active' &&
    n.name.toLowerCase() === levelText.trim().toLowerCase() &&
    (!matchedBuilding || n.parentId === matchedBuilding.id)
  );

  const roadSuggestions = nodes.filter(n =>
    n.type === 'Road' && n.status === 'Active' &&
    (!roadText || n.name.toLowerCase().includes(roadText.toLowerCase()))
  );

  // Building suggestions: filter by road if road matches a known node
  const buildingSuggestions = nodes.filter(n =>
    n.type === 'Building' && n.status === 'Active' &&
    (!matchedRoad || n.parentId === matchedRoad.id) &&
    (!buildingText || n.name.toLowerCase().includes(buildingText.toLowerCase()))
  );

  const levelSuggestions = nodes.filter(n =>
    n.type === 'Level' && n.status === 'Active' &&
    (!matchedBuilding || n.parentId === matchedBuilding.id) &&
    (!levelText || n.name.toLowerCase().includes(levelText.toLowerCase()))
  );

  const spaceSuggestions = nodes.filter(n =>
    n.type === 'Space' && n.status === 'Active' &&
    (!matchedLevel || n.parentId === matchedLevel.id) &&
    (!spaceText || n.name.toLowerCase().includes(spaceText.toLowerCase()))
  );

  const emit = useCallback((
    road: string, building: string, level: string, space: string,
    extras?: { commonName?: string; postalCode?: string; lat?: number; lng?: number; tags?: string[] }
  ) => {
    const levelSpace = level && space ? `${level} - ${space}` : (level || space || '');
    onLocationSelect({
      road,
      building,
      levelSpace,
      commonName: extras?.commonName ?? '',
      postalCode: extras?.postalCode ?? '',
      lat: extras?.lat ?? 1.2500,
      lng: extras?.lng ?? 103.8300,
      tags: extras?.tags ?? [],
    });
  }, [onLocationSelect]);

  // Road: selecting suggestion only fills Road field; does NOT auto-populate Building etc.
  const selectRoad = (name: string) => {
    setRoadText(name);
    setOpenField(null);
    emit(name, buildingText, levelText, spaceText);
  };

  // Building: auto-populate Road, Common Name, Postal Code from matched node
  const selectBuilding = (bld: LocationNode) => {
    const rdNode = nodes.find(n => n.id === bld.parentId && n.type === 'Road');
    const newRoad = rdNode?.name || roadText;
    setBuildingText(bld.name);
    setRoadText(newRoad);
    setLevelText('');
    setSpaceText('');
    setOpenField(null);
    emit(newRoad, bld.name, '', '', {
      commonName: bld.commonName || bld.name,
      postalCode: bld.postalCode || '',
    });
  };

  const selectLevel = (name: string) => {
    setLevelText(name);
    setSpaceText('');
    setOpenField(null);
    emit(roadText, buildingText, name, '');
  };

  // Space: auto-populate Common Name, lat/lng, tags
  const selectSpace = (spc: LocationNode) => {
    setSpaceText(spc.name);
    setOpenField(null);
    emit(roadText, buildingText, levelText, spc.name, {
      commonName: spc.name,
      lat: spc.lat,
      lng: spc.lng,
      tags: spc.tags || [],
    });
  };

  // Global keyword search (unchanged behaviour)
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) { setSearchResults([]); setShowSearchDrop(false); return; }
    const matches: { space: LocationNode; path: string }[] = [];
    nodes.filter(n => n.type === 'Space' && n.status === 'Active').forEach(spc => {
      const nameMatch = spc.name.toLowerCase().includes(query.toLowerCase());
      const tagMatch = spc.tags?.some(t => t.toLowerCase().includes(query.toLowerCase())) ?? false;
      if (!nameMatch && !tagMatch) return;
      const lvl = nodes.find(n => n.id === spc.parentId);
      const bld = lvl ? nodes.find(n => n.id === lvl.parentId) : null;
      const rd = bld ? nodes.find(n => n.id === bld.parentId) : null;
      matches.push({ space: spc, path: [rd?.name, bld?.name, lvl?.name, spc.name].filter(Boolean).join(' └─ ') });
    });
    setSearchResults(matches);
    setShowSearchDrop(true);
  };

  const handleSelectSearchResult = (spc: LocationNode) => {
    const lvl = nodes.find(n => n.id === spc.parentId);
    const bld = lvl ? nodes.find(n => n.id === lvl.parentId) : null;
    const rd = bld ? nodes.find(n => n.id === bld.parentId) : null;
    setRoadText(rd?.name || '');
    setBuildingText(bld?.name || '');
    setLevelText(lvl?.name || '');
    setSpaceText(spc.name);
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchDrop(false);
    emit(rd?.name || '', bld?.name || '', lvl?.name || '', spc.name, {
      commonName: spc.name,
      postalCode: bld?.postalCode || '',
      lat: spc.lat,
      lng: spc.lng,
      tags: spc.tags || [],
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>

      {/* Global Keyword Search */}
      <div ref={searchRef} style={{ position: 'relative', width: '100%' }} className="form-group colspan-2">
        <label style={{ ...LABEL_STYLE, fontSize: '11.5px' }}>
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
        {showSearchDrop && searchResults.length > 0 && (
          <div style={DROP_STYLE}>
            {searchResults.map(({ space, path }) => (
              <SuggestionItem key={space.id} onSelect={() => handleSelectSearchResult(space)}>
                <div style={{ fontWeight: 600 }}>{space.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{path}</div>
              </SuggestionItem>
            ))}
          </div>
        )}
      </div>

      {/* 4 Combobox Fields */}
      <div ref={wrapperRef} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%' }}>

        {/* Road — suggestions only; no auto-populate of other fields */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label style={LABEL_STYLE}>Road Name</label>
          <input
            type="text"
            value={roadText}
            onChange={e => { setRoadText(e.target.value); setOpenField('road'); emit(e.target.value, buildingText, levelText, spaceText); }}
            onFocus={() => setOpenField('road')}
            placeholder="Type or select a road..."
            className="form-control"
          />
          {openField === 'road' && roadSuggestions.length > 0 && (
            <div style={DROP_STYLE}>
              {roadSuggestions.map(r => (
                <SuggestionItem key={r.id} onSelect={() => selectRoad(r.name)}>
                  {r.name}
                </SuggestionItem>
              ))}
            </div>
          )}
        </div>

        {/* Building — selecting auto-populates Road, Common Name, Postal Code */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label style={LABEL_STYLE}>Building Name</label>
          <input
            type="text"
            value={buildingText}
            onChange={e => { setBuildingText(e.target.value); setOpenField('building'); emit(roadText, e.target.value, levelText, spaceText); }}
            onFocus={() => setOpenField('building')}
            placeholder="Type or select a building..."
            className="form-control"
          />
          {openField === 'building' && buildingSuggestions.length > 0 && (
            <div style={DROP_STYLE}>
              {buildingSuggestions.map(b => {
                const rd = nodes.find(n => n.id === b.parentId);
                return (
                  <SuggestionItem key={b.id} onSelect={() => selectBuilding(b)}>
                    <div style={{ fontWeight: 600 }}>{b.name}</div>
                    {rd && <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>{rd.name}</div>}
                  </SuggestionItem>
                );
              })}
            </div>
          )}
        </div>

        {/* Level — suggestions filtered by matched building */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label style={LABEL_STYLE}>Level</label>
          <input
            type="text"
            value={levelText}
            onChange={e => { setLevelText(e.target.value); setOpenField('level'); emit(roadText, buildingText, e.target.value, spaceText); }}
            onFocus={() => setOpenField('level')}
            placeholder="Type or select a level..."
            className="form-control"
          />
          {openField === 'level' && levelSuggestions.length > 0 && (
            <div style={DROP_STYLE}>
              {levelSuggestions.map(l => (
                <SuggestionItem key={l.id} onSelect={() => selectLevel(l.name)}>
                  {l.name}
                </SuggestionItem>
              ))}
            </div>
          )}
        </div>

        {/* Space — selecting auto-populates Common Name, lat/lng, tags */}
        <div className="form-group" style={{ position: 'relative' }}>
          <label style={LABEL_STYLE}>Space / Venue</label>
          <input
            type="text"
            value={spaceText}
            onChange={e => { setSpaceText(e.target.value); setOpenField('space'); emit(roadText, buildingText, levelText, e.target.value); }}
            onFocus={() => setOpenField('space')}
            placeholder="Type or select a space..."
            className="form-control"
          />
          {openField === 'space' && spaceSuggestions.length > 0 && (
            <div style={DROP_STYLE}>
              {spaceSuggestions.map(s => (
                <SuggestionItem key={s.id} onSelect={() => selectSpace(s)}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  {s.tags && s.tags.length > 0 && (
                    <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '6px' }}>{s.tags.join(', ')}</span>
                  )}
                </SuggestionItem>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
