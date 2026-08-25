'use client';

import React, { useEffect, useRef } from 'react';

interface IncidentMapProps {
  lat: number;
  lng: number;
  commonName?: string;
  road?: string;
  priority?: string;
  type?: string;
}

const IncidentMap: React.FC<IncidentMapProps> = ({ lat, lng, commonName, road, priority, type }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!lat || !lng) return;

    let isMounted = true;
    let L: any;

    const initMap = async () => {
      L = await import('leaflet');
      if (!isMounted) return;

      // Sentosa bounds: roughly 1.23 to 1.27 Lat, 103.79 to 103.86 Lng
      const southWest = L.latLng(1.2300, 103.7900);
      const northEast = L.latLng(1.2700, 103.8600);
      const bounds = L.latLngBounds(southWest, northEast);

      // Create map centered on the pin
      mapInstance.current = L.map(mapRef.current, {
        center: [lat, lng],
        zoom: 16,
        minZoom: 13,
        maxZoom: 18,
        maxBounds: bounds,
        maxBoundsViscosity: 0.8,
        zoomControl: true,
        attributionControl: false
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
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

      let color = '#008c95'; // Ocean Teal
      if (priority === 'High') {
        color = '#ff8200'; // Orange
      }

      const marker = L.marker([lat, lng], {
        icon: createSVGIcon(color)
      });

      const popupContent = `
        <div style="font-family: var(--font-body); padding: 2px; font-size: 12px; color: var(--text-main);">
          <strong style="font-size: 13px; display: block; margin-bottom: 2px;">${commonName || road || 'Incident Location'}</strong>
          <span>${type || ''} (${priority || 'Normal'} Priority)</span>
        </div>
      `;

      marker.bindPopup(popupContent).addTo(mapInstance.current);
      marker.openPopup();
      markerRef.current = marker;
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [lat, lng, commonName, road, priority, type]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default IncidentMap;
