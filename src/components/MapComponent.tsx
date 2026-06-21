'use client';

import React, { useEffect, useRef } from 'react';
import { Case } from '@/lib/db';

interface MapComponentProps {
  cases: Case[];
}

const MapComponent: React.FC<MapComponentProps> = ({ cases }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;

    // Load Leaflet dynamically to avoid SSR error
    let isMounted = true;
    let L: any;

    const initMap = async () => {
      L = await import('leaflet');
      
      if (!isMounted) return;

      // Sentosa bounds: roughly 1.23 to 1.27 Lat, 103.79 to 103.86 Lng
      const southWest = L.latLng(1.2300, 103.7900);
      const northEast = L.latLng(1.2700, 103.8600);
      const bounds = L.latLngBounds(southWest, northEast);

      // Create map centered on Sentosa
      mapInstance.current = L.map(mapRef.current, {
        center: [1.2500, 103.8300],
        zoom: 14,
        minZoom: 13,
        maxZoom: 18,
        maxBounds: bounds,
        maxBoundsViscosity: 0.8
      });

      // CartoDB Voyager tiles — crisp, neutral style that contrasts well with warm UI
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19
      }).addTo(mapInstance.current);

      // Custom SVG markers function
      const createSVGIcon = (color: string) => {
        return L.divIcon({
          html: `
            <svg width="30" height="42" viewBox="0 0 30 42" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M15 0C6.71573 0 0 6.71573 0 15C0 26.25 15 42 15 42C15 42 30 26.25 30 15C30 6.71573 23.2843 0 15 0Z" fill="${color}"/>
              <circle cx="15" cy="15" r="6" fill="#ffffff" />
            </svg>
          `,
          iconSize: [30, 42],
          iconAnchor: [15, 42],
          popupAnchor: [0, -40],
          className: 'custom-map-marker'
        });
      };

      // Plot active incidents and faults
      updateMarkers(L, createSVGIcon);
    };

    const updateMarkers = (leafletLib: any, iconFactory: (color: string) => any) => {
      if (!mapInstance.current) return;

      // Clear existing markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      cases.forEach(c => {
        if (!c.incident || c.status === 'Closed') return;
        
        const { lat, lng, commonName } = c.incident.location;
        if (!lat || !lng) return;

        // Color based on priority or type matching the Resort-Luxury style
        let color = '#008c95'; // Ocean Teal for standard incidents
        if (c.incident.priority === 'High') {
          color = '#ff8200'; // Radiant Orange for high-priority incidents
        }
        
        // If it's a fault linkage or a fault case, change color
        const isFault = c.cmmsTickets.length > 0;
        if (isFault) {
          color = '#6d3500'; // Chestnut Brown for infrastructure faults
        }

        const marker = leafletLib.marker([lat, lng], {
          icon: iconFactory(color)
        });

        const popupContent = `
          <div style="font-family: var(--font-body); padding: 5px;">
            <div style="font-family: var(--font-title); font-weight: 700; font-size: 15px; margin-bottom: 5px; color: var(--text-main);">${c.title}</div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 8px;">Case ID: ${c.id}</div>
            <div style="display: flex; gap: 5px; margin-bottom: 8px;">
              <span class="badge" style="font-size: 9px; padding: 2px 6px; background: rgba(0,140,149,0.08); color: #008c95; border-radius: 4px; border: 1px solid rgba(0,140,149,0.15); font-weight: 700;">
                ${c.incident.type}
              </span>
              <span class="badge" style="font-size: 9px; padding: 2px 6px; background: ${c.incident.priority === 'High' ? 'rgba(255,130,0,0.08)' : 'rgba(0,140,149,0.08)'}; color: ${c.incident.priority === 'High' ? '#ff8200' : '#008c95'}; border-radius: 4px; border: 1px solid ${c.incident.priority === 'High' ? 'rgba(255,130,0,0.15)' : 'rgba(0,140,149,0.15)'}; font-weight: 700;">
                ${c.incident.priority}
              </span>
            </div>
            <div style="font-size: 12px; color: var(--text-main); margin-bottom: 10px;">
              <strong>Location:</strong> ${commonName || c.incident.location.road}
            </div>
            <a href="/cases/${c.id}" style="
              display: block; 
              text-align: center; 
              background: var(--color-primary); 
              color: #ffffff; 
              padding: 8px 12px; 
              border-radius: 6px; 
              text-decoration: none; 
              font-weight: 600; 
              font-size: 12px;
              transition: opacity 0.2s;
            " onmouseover="this.style.opacity=0.8" onmouseout="this.style.opacity=1">
              Open Case Details
            </a>
          </div>
        `;

        marker.bindPopup(popupContent).addTo(mapInstance.current);
        markersRef.current.push(marker);
      });
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [cases]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '380px' }} />
      <div className="map-legend glass">
        <h4>MAP LEGEND</h4>
        <div className="legend-items">
          <div className="legend-item">
            <span className="dot dot-danger" />
            <span>High Priority Incident</span>
          </div>
          <div className="legend-item">
            <span className="dot dot-info" />
            <span>Standard Incident</span>
          </div>
          <div className="legend-item">
            <span className="dot dot-warning" />
            <span>Infrastructure Fault</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .map-legend {
          position: absolute;
          bottom: 16px;
          right: 16px;
          z-index: 1000;
          padding: 12px;
          border-radius: 8px;
          pointer-events: auto;
          background: #ffffff !important;
          border: 1px solid var(--border-color);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
        }

        .map-legend h4 {
          font-family: var(--font-title);
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }

        .legend-items {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          color: var(--text-main);
        }

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .dot-danger  { background: var(--color-primary);       box-shadow: 0 0 6px var(--color-primary); }       /* High Priority — Orange */
        .dot-info    { background: var(--color-active);        box-shadow: 0 0 6px var(--color-active); }        /* Standard Incident — Teal */
        .dot-warning { background: var(--color-primary-hover); box-shadow: 0 0 6px var(--color-primary-hover); } /* Infrastructure Fault — Amber */
      `}</style>
    </div>
  );
};

export default MapComponent;
