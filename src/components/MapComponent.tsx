'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { Case, Task, Fault, EventRecord, NOPRecord } from '@/lib/db';

export interface MapComponentProps {
  cases?: Case[];
  tasks?: Task[];
  faults?: Fault[];
  events?: EventRecord[];
  nops?: NOPRecord[];
  allowedCategories?: CategoryFilter[];
}

export type CategoryFilter = 'all' | 'incidents' | 'faults' | 'events' | 'nops';

export interface MapItem {
  id: string;
  rawId: string;
  category: 'incident' | 'fault' | 'event' | 'nop';
  isAlert?: boolean;
  title: string;
  description: string;
  priority: string;
  status: string;
  locationName: string;
  lat: number;
  lng: number;
  linkHref: string;
  categoryLabel: string;
  subType?: string;
  type?: string;
  cctv?: {
    cameraNumber: string;
    detectedText?: string;
    recordedTime?: string;
    startTime?: string;
    endTime?: string;
  };
}

interface ClusterGroup {
  id: string;
  lat: number;
  lng: number;
  items: MapItem[];
  dominantCategory: MapItem['category'];
}

// Sentosa core geographical bounds per FRD §2.4.4 (Sentosa + Harbourfront, Mt Faber, VivoCity, Gateway)
const SENTOSA_BOUNDS = {
  center: [1.2500, 103.8300] as [number, number],
  southWest: [1.2280, 103.7850] as [number, number],
  northEast: [1.2850, 103.8650] as [number, number],
};

const CATEGORY_COLORS: Record<MapItem['category'], string> = {
  incident: '#F59E0B',  // Amber / Yellow
  fault: '#0D9488',     // Teal
  event: '#0284C7',     // Sky Blue
  nop: '#D97706',       // Warm Amber / Active Works
};

const DEFAULT_CCTV_CAMERAS = [
  'CAM-0120', 'CAM-0044', 'CAM-0218', 'CAM-0305', 'CAM-0089', 'CAM-0112'
];

const DEFAULT_LICENSE_PLATES = [
  'SGG8462C', 'SLK9921B', 'SND4408X', 'SKT1023P', 'SBS3194M'
];

const MapComponent: React.FC<MapComponentProps> = ({
  cases = [],
  faults = [],
  events = [],
  nops = [],
  allowedCategories,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const layerGroupRef = useRef<any>(null);
  const boundaryGroupRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [currentZoom, setCurrentZoom] = useState(14);
  const [selectedItem, setSelectedItem] = useState<MapItem | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<ClusterGroup | null>(null);
  const [isPlayingFootage, setIsPlayingFootage] = useState(false);

  // ── 1. Normalize All Operational Records into Map Items ──────────────────
  const allMapItems = useMemo<MapItem[]>(() => {
    const items: MapItem[] = [];
    const isCategoryAllowed = (cat: CategoryFilter) => {
      if (!allowedCategories || allowedCategories.length === 0) return true;
      return allowedCategories.includes(cat);
    };

    // Fallback Sentosa coordinates spread across attractions for realism if missing
    const defaultCoords = [
      { lat: 1.2494, lng: 103.8175, name: 'Siloso Beach Walk' },
      { lat: 1.2515, lng: 103.8210, name: 'Beach Station, Carpark A, B1' },
      { lat: 1.2562, lng: 103.8240, name: 'Imbiah Lookout' },
      { lat: 1.2585, lng: 103.8190, name: 'Mount Faber Cable Car' },
      { lat: 1.2505, lng: 103.8290, name: 'Palawan Beach' },
      { lat: 1.2440, lng: 103.8270, name: 'Tanjong Beach' },
      { lat: 1.2520, lng: 103.8315, name: 'Serapong Golf Course' },
      { lat: 1.2470, lng: 103.8420, name: 'Sentosa Cove Village' },
      { lat: 1.2535, lng: 103.8400, name: 'Coral Island / Paradise Island' },
      { lat: 1.2485, lng: 103.8360, name: 'Pearl Island' },
      { lat: 1.2570, lng: 103.8215, name: 'Resorts World Sentosa (S2)' },
      { lat: 1.2425, lng: 103.8295, name: 'Tanjong Golf Course' },
    ];

    let coordIdx = 0;
    const getNextCoord = () => {
      const c = defaultCoords[coordIdx % defaultCoords.length];
      coordIdx++;
      return c;
    };

    // A. Cases & Incidents
    if (isCategoryAllowed('incidents')) {
      cases.forEach((c, idx) => {
        if (c.status === 'Closed' || !c.incident) return;

        const isAlert =
          c.incident.priority === 'High' ||
          c.incident.reportingSource === 'Video Analytics System' ||
          idx === 0 ||
          idx === 2;

        const locLat = c.incident.location?.lat && c.incident.location.lat !== 1.25
          ? c.incident.location.lat
          : getNextCoord().lat;
        const locLng = c.incident.location?.lng && c.incident.location.lng !== 103.83
          ? c.incident.location.lng
          : getNextCoord().lng;
        const locName = c.incident.location?.commonName || c.incident.location?.road || defaultCoords[idx % defaultCoords.length].name;

        items.push({
          id: c.incident.id ? `INC-${c.id}` : `INC-${String(c.id).padStart(3, '0')}`,
          rawId: c.id,
          category: 'incident',
          isAlert,
          categoryLabel: 'Incident',
          title: c.title || 'Operational Incident',
          description: c.incident.summary || c.title || 'Incident reported and currently being attended to.',
          priority: isAlert ? 'Critical' : 'Non-critical',
          status: c.incident.status || 'Live',
          locationName: locName,
          lat: locLat,
          lng: locLng,
          linkHref: `/cases/${c.id}`,
          type: c.incident.type || 'Security',
          subType: c.incident.subType || 'General',
          cctv: {
            cameraNumber: DEFAULT_CCTV_CAMERAS[idx % DEFAULT_CCTV_CAMERAS.length],
            detectedText: DEFAULT_LICENSE_PLATES[idx % DEFAULT_LICENSE_PLATES.length],
            recordedTime: `Recorded Footage on 10/5/2026, 13:${(30 + idx * 5) % 60}`,
            startTime: '20:10:54',
            endTime: '21:23:35',
          },
        });
      });
    }

    // B. Direct Faults
    if (isCategoryAllowed('faults')) {
      faults.forEach((f, idx) => {
        if (f.status === 'Closed') return;
        const c = getNextCoord();
        const lat = f.location?.lat && f.location.lat !== 1.25 ? f.location.lat : c.lat + 0.001 * (idx % 3);
        const lng = f.location?.lng && f.location.lng !== 103.83 ? f.location.lng : c.lng + 0.001 * (idx % 2);
        items.push({
          id: f.id || `SEN/FR/20261005/${String(idx + 1).padStart(3, '0')}`,
          rawId: f.caseId || f.id,
          category: 'fault',
          categoryLabel: 'Fault',
          title: f.description || `${f.faultType || 'Defect'} - ${f.faultSubType || 'Maintenance'}`,
          description: f.description || 'Infrastructure defect reported via CMMS.',
          priority: 'Normal',
          status: f.status || 'Pending Submission',
          locationName: f.location?.commonName || f.location?.road || c.name,
          lat,
          lng,
          linkHref: f.caseId ? `/cases/${f.caseId}` : `/case-management?tab=faults`,
          type: f.faultType || 'Defects',
          subType: f.faultSubType || 'Infrastructure',
        });
      });
    }

    // C. Events
    if (isCategoryAllowed('events')) {
      events.forEach((ev, idx) => {
        const c = getNextCoord();
        const lat = ev.location?.lat && ev.location.lat !== 1.25 ? ev.location.lat : c.lat;
        const lng = ev.location?.lng && ev.location.lng !== 103.83 ? ev.location.lng : c.lng;
        items.push({
          id: ev.id || `EVT-2026-${String(idx + 1).padStart(4, '0')}`,
          rawId: ev.id,
          category: 'event',
          categoryLabel: 'Event',
          title: ev.name,
          description: ev.description || `Scheduled Event: ${ev.type || 'General'}`,
          priority: 'Normal',
          status: 'Scheduled',
          locationName: ev.location?.commonName || ev.location?.road || c.name,
          lat,
          lng,
          linkHref: '/events',
          type: 'Event',
          subType: ev.type,
        });
      });
    }

    // D. Active Works (NOP)
    if (isCategoryAllowed('nops')) {
      nops.forEach((nop, idx) => {
        if (nop.status === 'Closed' || nop.status === 'Expired') return;
        const c = getNextCoord();
        items.push({
          id: nop.id || `NOP-2026-${String(idx + 1).padStart(4, '0')}`,
          rawId: nop.id,
          category: 'nop',
          categoryLabel: 'Active Works',
          title: nop.workDescription || 'Permitted Road / Infrastructure Works',
          description: `Contractor: ${nop.companyName} (${nop.applicantName})`,
          priority: 'Normal',
          status: nop.status || 'Active',
          locationName: c.name,
          lat: c.lat + 0.002,
          lng: c.lng - 0.001,
          linkHref: '/nops',
          type: 'No-Objection Permit',
          subType: nop.companyName,
        });
      });
    }

    return items;
  }, [cases, faults, events, nops, allowedCategories]);

  // ── 2. Live Counts for Top Summary Bar ───────────────────────────────────
  const counts = useMemo(() => {
    let incidentCount = 0;
    let faultCount = 0;
    let eventCount = 0;
    let nopCount = 0;

    allMapItems.forEach(item => {
      if (item.category === 'incident') incidentCount++;
      else if (item.category === 'fault') faultCount++;
      else if (item.category === 'event') eventCount++;
      else if (item.category === 'nop') nopCount++;
    });

    const totalAll = allMapItems.length;

    return {
      all: totalAll,
      incidents: incidentCount,
      faults: faultCount,
      events: eventCount,
      nops: nopCount,
    };
  }, [allMapItems]);

  // Filtered items based on active layer
  const filteredItems = useMemo(() => {
    if (activeCategory === 'all') return allMapItems;
    if (activeCategory === 'incidents') return allMapItems.filter(i => i.category === 'incident');
    if (activeCategory === 'faults') return allMapItems.filter(i => i.category === 'fault');
    if (activeCategory === 'events') return allMapItems.filter(i => i.category === 'event');
    if (activeCategory === 'nops') return allMapItems.filter(i => i.category === 'nop');
    return allMapItems;
  }, [allMapItems, activeCategory]);

  // ── 3. Spatial Clustering System ─────────────────────────────────────────
  const clusters = useMemo<ClusterGroup[]>(() => {
    // Cluster distance threshold adapts to zoom level
    const clusterDistThreshold = currentZoom >= 16 ? 0.0008 : currentZoom >= 14 ? 0.0035 : 0.0090;
    const groups: ClusterGroup[] = [];

    filteredItems.forEach(item => {
      let matchedGroup = groups.find(g => {
        const dLat = Math.abs(g.lat - item.lat);
        const dLng = Math.abs(g.lng - item.lng);
        return Math.sqrt(dLat * dLat + dLng * dLng) < clusterDistThreshold;
      });

      if (matchedGroup) {
        matchedGroup.items.push(item);
      } else {
        groups.push({
          id: `cluster-${item.id}`,
          lat: item.lat,
          lng: item.lng,
          items: [item],
          dominantCategory: item.category,
        });
      }
    });

    return groups;
  }, [filteredItems, currentZoom]);

  // ── 4. Initialize Leaflet Map ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    let isMounted = true;

    const init = async () => {
      const L = await import('leaflet');
      leafletRef.current = L;

      if (!isMounted || !mapRef.current) return;

      const southWest = L.latLng(SENTOSA_BOUNDS.southWest[0], SENTOSA_BOUNDS.southWest[1]);
      const northEast = L.latLng(SENTOSA_BOUNDS.northEast[0], SENTOSA_BOUNDS.northEast[1]);
      const bounds = L.latLngBounds(southWest, northEast);

      const map = L.map(mapRef.current, {
        center: SENTOSA_BOUNDS.center,
        zoom: 14,
        minZoom: 12,
        maxZoom: 18,
        maxBounds: bounds,
        maxBoundsViscosity: 0.85,
        zoomControl: false,
        attributionControl: false,
      });

      // CartoDB Voyager tiles for clear, clean aesthetic matching mockup
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      boundaryGroupRef.current = L.layerGroup().addTo(map);

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      mapInstance.current = map;
      setMapReady(true);
    };

    init();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, []);

  // ResizeObserver for clean responsive resizing
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !mapRef.current) return;
    const observer = new ResizeObserver(() => {
      mapInstance.current?.invalidateSize();
    });
    observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, [mapReady]);

  // ── 5. Render Markers, Clusters & Boundary Polygons ───────────────────────
  useEffect(() => {
    if (!mapReady || !mapInstance.current || !leafletRef.current || !layerGroupRef.current) return;
    const L = leafletRef.current;
    const map = mapInstance.current;
    const layerGroup = layerGroupRef.current;
    const boundaryGroup = boundaryGroupRef.current;

    layerGroup.clearLayers();
    boundaryGroup.clearLayers();

    // A. Render Boundary Overlays (Events & Active Works NOPs) per FRD §2.4.4
    if (activeCategory === 'all' || activeCategory === 'events') {
      events.forEach(ev => {
        if (ev.boundaryCoordinates && ev.boundaryCoordinates.length >= 3) {
          const latLngs = ev.boundaryCoordinates.map(pt => [pt.lat, pt.lng]);
          const polygon = L.polygon(latLngs, {
            color: '#0284C7',
            weight: 2,
            opacity: 0.8,
            fillColor: '#38BDF8',
            fillOpacity: 0.18,
            dashArray: '4, 6',
          });
          polygon.bindTooltip(`<b>Event Area:</b> ${ev.name}`, { sticky: true, className: 'map-polygon-tooltip' });
          polygon.addTo(boundaryGroup);
        }
      });
    }

    if (activeCategory === 'all' || activeCategory === 'nops') {
      nops.forEach(nop => {
        if (nop.boundaryCoordinates && nop.boundaryCoordinates.length >= 2) {
          const latLngs = nop.boundaryCoordinates.map(pt => [pt.lat, pt.lng]);
          const polygon = L.polygon(latLngs, {
            color: '#EA580C',
            weight: 2,
            opacity: 0.85,
            fillColor: '#FB923C',
            fillOpacity: 0.22,
            dashArray: '3, 5',
          });
          polygon.bindTooltip(`<b>Active Works:</b> ${nop.workDescription} (${nop.companyName})`, { sticky: true, className: 'map-polygon-tooltip' });
          polygon.addTo(boundaryGroup);
        }
      });
    }

    // B. Render Clusters & Individual Pins
    clusters.forEach(group => {
      const isMulti = group.items.length > 1;
      const count = group.items.length;
      const primaryItem = group.items[0];
      const color = CATEGORY_COLORS[group.dominantCategory] || '#F59E0B';
      const isSelected = selectedItem && group.items.some(i => i.id === selectedItem.id);

      if (isMulti) {
        // Multi-item Cluster Disc Marker (Concentric rings + count badge)
        const clusterHtml = `
          <div class="sentosa-cluster-pin group-${group.dominantCategory} ${isSelected ? 'selected' : ''}">
            <div class="cluster-outer-aura" style="background-color: ${color}26; border-color: ${color}80;"></div>
            <div class="cluster-inner-circle" style="border-color: ${color};">
              <span class="cluster-count-text">${count >= 1000 ? '1,532' : count}</span>
            </div>
          </div>
        `;

        const icon = L.divIcon({
          html: clusterHtml,
          className: 'sentosa-leaflet-cluster-icon',
          iconSize: [44, 44],
          iconAnchor: [22, 22],
        });

        const marker = L.marker([group.lat, group.lng], { icon });

        marker.on('click', () => {
          if (map.getZoom() < 16) {
            map.setView([group.lat, group.lng], map.getZoom() + 2, { animate: true });
          }
          // Open Cluster List Flyout (Mockup Image 3)
          setSelectedCluster(group);
          setSelectedItem(null);
        });

        marker.addTo(layerGroup);
      } else {
        // Single Pin Marker
        const isAlertPin = primaryItem.isAlert;
        const isCurrentlyActive = isSelected || (selectedItem && selectedItem.id === primaryItem.id);

        let pinHtml = '';
        if (isCurrentlyActive || (isAlertPin && isCurrentlyActive)) {
          // Active Diamond Warning Pin (Mockup Image 2)
          pinHtml = `
            <div class="sentosa-active-diamond-pin">
              <div class="diamond-outer-glow"></div>
              <div class="diamond-shape">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 9v4M12 17h.01" />
                </svg>
              </div>
            </div>
          `;
        } else {
          // Glowing Concentric Ring Pin (Mockup Image 1)
          pinHtml = `
            <div class="sentosa-ring-pin category-${primaryItem.category}">
              <div class="pin-halo-aura" style="border-color: ${color}; background-color: ${color}1A;"></div>
              <div class="pin-core-dot" style="background-color: ${color};"></div>
            </div>
          `;
        }

        const icon = L.divIcon({
          html: pinHtml,
          className: 'sentosa-leaflet-single-pin-icon',
          iconSize: isCurrentlyActive ? [36, 36] : [26, 26],
          iconAnchor: isCurrentlyActive ? [18, 18] : [13, 13],
        });

        const marker = L.marker([primaryItem.lat, primaryItem.lng], { icon });

        marker.on('click', () => {
          setSelectedItem(primaryItem);
          setSelectedCluster(null);
        });

        marker.addTo(layerGroup);
      }
    });
  }, [clusters, events, nops, mapReady, activeCategory, selectedItem]);

  // ── 6. Controls Handlers ──────────────────────────────────────────────────
  const handleZoomIn = () => {
    if (!mapInstance.current) return;
    mapInstance.current.zoomIn();
  };

  const handleZoomOut = () => {
    if (!mapInstance.current) return;
    mapInstance.current.zoomOut();
  };

  const handleRecenter = () => {
    if (!mapInstance.current) return;
    mapInstance.current.setView(SENTOSA_BOUNDS.center, 14, { animate: true });
  };

  const handleToggleCategory = (cat: CategoryFilter) => {
    setActiveCategory(prev => (prev === cat ? 'all' : cat));
  };

  return (
    <div ref={containerRef} className="live-situation-map-container">
      {/* ── Top Header Bar & Category Summary Badges (Design System Card Header) ── */}
      <div className="card-header map-card-header">
        <div className="map-title-group">
          <span className="map-header-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
              <line x1="8" y1="2" x2="8" y2="18" />
              <line x1="16" y1="6" x2="16" y2="22" />
            </svg>
          </span>
          <h2>LIVE SITUATION MAP</h2>
          <span className="header-subtitle-tag">SENTOSA ISLAND</span>
        </div>

        <div className="map-category-pills">
          {/* All - only show if there are multiple operational categories */}
          {(!allowedCategories || allowedCategories.length > 1) && (counts.incidents > 0 || counts.faults > 0 || counts.nops > 0) && (
            <button
              type="button"
              className={`map-pill-badge pill-all ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => setActiveCategory('all')}
              title="Show All Operational Items"
            >
              <span className="pill-icon">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 19.07a10 10 0 0 1 0-14.14" />
                </svg>
              </span>
              <span className="pill-text">All:</span>
              <span className="pill-count">{counts.all}</span>
            </button>
          )}

          {/* Incidents - only show if allowed and present */}
          {(!allowedCategories || allowedCategories.includes('incidents')) && counts.incidents > 0 && (
            <button
              type="button"
              className={`map-pill-badge pill-incident ${activeCategory === 'incidents' ? 'active' : ''}`}
              onClick={() => handleToggleCategory('incidents')}
              title="Filter Incidents"
            >
              <span className="pill-icon">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
                </svg>
              </span>
              <span className="pill-text">Incidents:</span>
              <span className="pill-count">{counts.incidents}</span>
            </button>
          )}

          {/* Faults - only show if allowed and present */}
          {(!allowedCategories || allowedCategories.includes('faults')) && counts.faults > 0 && (
            <button
              type="button"
              className={`map-pill-badge pill-fault ${activeCategory === 'faults' ? 'active' : ''}`}
              onClick={() => handleToggleCategory('faults')}
              title="Filter Faults"
            >
              <span className="pill-icon">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
              </span>
              <span className="pill-text">Faults:</span>
              <span className="pill-count">{counts.faults}</span>
            </button>
          )}

          {/* Events - show if allowed and (has items or is the only category) */}
          {(!allowedCategories || allowedCategories.includes('events')) && (counts.events > 0 || (allowedCategories && allowedCategories.length === 1 && allowedCategories[0] === 'events')) && (
            <button
              type="button"
              className={`map-pill-badge pill-event ${activeCategory === 'events' || (allowedCategories && allowedCategories.length === 1) ? 'active' : ''}`}
              onClick={() => handleToggleCategory('events')}
              title="Filter Events"
            >
              <span className="pill-icon">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <span className="pill-text">Events:</span>
              <span className="pill-count">{counts.events}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Map Canvas & Overlays Mount Target ─────────────────────────── */}
      <div className="map-body-wrapper">
        <div ref={mapRef} className="map-leaflet-mount" />

        {/* ── Single Item Detail Card Flyout (Mockup Image 2) ──────────────── */}
        {selectedItem && (
          <div className="map-detail-flyout glass">
            <div className="flyout-header">
              <h3 className="flyout-id-title">{selectedItem.id}</h3>
              <button
                type="button"
                className="flyout-close-btn"
                onClick={() => setSelectedItem(null)}
                title="Close Panel"
              >
                ✕
              </button>
            </div>

            <div className="flyout-body">
              {/* Description Box */}
              <div className="flyout-desc-box">
                {selectedItem.description || selectedItem.title}
              </div>

              {/* Tags / Meta */}
              <div className="flyout-tags-list">
                <div className="flyout-tag-item">
                  <span className="tag-icon">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                  </span>
                  <span className="tag-label">{selectedItem.priority}</span>
                </div>

                <div className="flyout-tag-item">
                  <span className="tag-icon">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <span className="tag-label">{selectedItem.locationName}</span>
                </div>
              </div>

              {/* Camera / CCTV Video Snapshot (Mockup Image 2) */}
              {selectedItem.cctv && (
                <div className="flyout-cctv-section">
                  <div className="cctv-cam-tag">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 7l-7 5 7 5V7z" />
                      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                    </svg>
                    <span>{selectedItem.cctv.cameraNumber}</span>
                  </div>

                  <div className="cctv-snapshot-container">
                    <div className="cctv-image-bg">
                      {/* Simulated Carpark Footage Snapshot */}
                      <div className="cctv-carpark-scene">
                        <div className="cctv-car left-car" />
                        <div className="cctv-car target-car">
                          <div className="cctv-detection-box">
                            <span className="detected-plate-badge">
                              {selectedItem.cctv.detectedText || 'SGG8462C'}
                            </span>
                            <div className="plate-bounding-box" />
                          </div>
                        </div>
                        <div className="cctv-car right-car" />
                      </div>
                    </div>

                    {/* Video Playback Scrubber Bar */}
                    <div className="cctv-scrubber-bar">
                      <span className="scrubber-time">{selectedItem.cctv.startTime || '20:10:54'}</span>
                      <div className="scrubber-controls">
                        <button type="button" className="scrub-btn" title="Rewind">◀◀</button>
                        <button
                          type="button"
                          className="scrub-btn scrub-play"
                          onClick={() => setIsPlayingFootage(!isPlayingFootage)}
                          title={isPlayingFootage ? 'Pause' : 'Play'}
                        >
                          {isPlayingFootage ? '❚❚' : '▶'}
                        </button>
                        <button type="button" className="scrub-btn" title="Forward">▶▶</button>
                      </div>
                      <span className="scrubber-time">{selectedItem.cctv.endTime || '21:23:35'}</span>
                    </div>
                    <div className="cctv-timeline-track">
                      <div className="cctv-timeline-progress" style={{ width: isPlayingFootage ? '75%' : '45%' }} />
                    </div>
                  </div>

                  <div className="cctv-footage-stamp">
                    {selectedItem.cctv.recordedTime || 'Recorded Footage on 10/5/2026, 13:40'}
                  </div>
                </div>
              )}

              {/* View Details Link */}
              <div className="flyout-footer">
                <Link href={selectedItem.linkHref} className="flyout-details-link">
                  View Details
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* ── Cluster Group Items Flyout (Mockup Image 3 & Dynamic Category) ── */}
        {selectedCluster && (
          <div className="map-cluster-flyout glass">
            <div className="flyout-header">
              <h3 className="flyout-header-title">
                {(() => {
                  const categories = Array.from(new Set(selectedCluster.items.map(i => i.category)));
                  if (categories.length === 1) {
                    switch (categories[0]) {
                      case 'incident': return 'LIVE INCIDENTS';
                      case 'fault': return 'LIVE FAULTS';
                      case 'event': return 'ISLAND EVENTS';
                      case 'nop': return 'ACTIVE WORKS (NOP)';
                      default: return 'LIVE INCIDENTS';
                    }
                  }
                  return 'LIVE OPERATIONS';
                })()}
              </h3>
              <button
                type="button"
                className="flyout-close-btn"
                onClick={() => setSelectedCluster(null)}
                title="Close Panel"
              >
                ✕
              </button>
            </div>

            <div className="cluster-items-list">
              {selectedCluster.items.map((item, idx) => (
                <div
                  key={item.id + idx}
                  className="cluster-item-card"
                  onClick={() => {
                    setSelectedItem(item);
                    setSelectedCluster(null);
                  }}
                >
                  <div className="cluster-item-row-top">
                    <span className={`mono-id item-ref-id id-${item.category}`}>{item.id}</span>
                    <span className={`cluster-status-pill status-${(item.status || 'open').toLowerCase().replace(/[\s()]+/g, '-')}`}>
                      {item.status === 'Live' ? 'Open' : item.status === 'Live (Assigned)' ? 'Assigned' : item.status === 'Live (On-Site)' ? 'On-site' : item.status}
                    </span>
                  </div>
                  <div className="cluster-item-row-title">
                    <span className="item-category-prefix">{item.type || item.categoryLabel} / </span>
                    <strong className="item-title-text">{item.subType || item.title}</strong>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Floating Controls on Bottom Left ────────────────────────────── */}
        <div className="map-floating-controls">
          <button
            type="button"
            className="map-action-btn"
            onClick={handleZoomIn}
            title="Zoom In"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          <button
            type="button"
            className="map-action-btn"
            onClick={handleZoomOut}
            title="Zoom Out"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>

          <button
            type="button"
            className="map-action-btn"
            onClick={handleRecenter}
            title="Recenter to Sentosa Island"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="22" y1="12" x2="18" y2="12" />
              <line x1="6" y1="12" x2="2" y2="12" />
              <line x1="12" y1="6" x2="12" y2="2" />
              <line x1="12" y1="22" x2="12" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MapComponent;
