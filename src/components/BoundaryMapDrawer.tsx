'use client';

import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
// Events Master List §8.2 — boundary drawing toolbar.
import 'leaflet-draw/dist/leaflet.draw.css';

export interface BoundaryPoint {
  lat: number;
  lng: number;
}

interface BoundaryMapDrawerProps {
  /** Center of the allowed drawing area — the selected location hierarchy node's coordinates. */
  center: BoundaryPoint;
  initialBoundary?: BoundaryPoint[];
  onBoundaryChange: (points: BoundaryPoint[] | undefined) => void;
  /**
   * Radius (metres) around `center` that a drawn boundary must stay within — FRD §8.2(d):
   * "prevent Event areas that fall outside the selected Location Hierarchy area."
   * The location hierarchy in this app only stores a point per node (no polygon area,
   * see EVENTS_MASTER_LIST_MODULE_PLAN.md §6), so this radius is a pragmatic stand-in
   * for "the selected Location Hierarchy area" until SDC defines actual map-drawing rules.
   */
  maxRadiusMeters?: number;
  disabled?: boolean;
  /** Read-only preview — renders the map + drawn polygon (if any) with no draw toolbar, no editing. Used in the Event detail View mode. */
  readOnly?: boolean;
}

// FRD §8.2 — mark an Event's boundary on the 2D island map, constrained to the
// selected location hierarchy area. Reusable — NOP (src/app/nops/page.tsx) has an
// identical unbuilt requirement and can adopt this same component later
// (EVENTS_MASTER_LIST_MODULE_PLAN.md §1.5 / Phase 3).
export default function BoundaryMapDrawer({
  center,
  initialBoundary,
  onBoundaryChange,
  maxRadiusMeters = 300,
  disabled = false,
  readOnly = false,
}: BoundaryMapDrawerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const drawnItemsRef = useRef<any>(null);
  const allowedCircleRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasShape, setHasShape] = useState(false);

  useEffect(() => {
    if (!mapRef.current || disabled) return;
    let isMounted = true;

    const init = async () => {
      const L = await import('leaflet');
      // leaflet-draw (last released for Leaflet <1.8) still calls the renamed
      // L.LineUtil._flat internally — shim it so the draw toolbar doesn't throw
      // on Leaflet 1.9.x. Widely-documented compatibility fix for this combo.
      (L as any).LineUtil.isFlat = (L as any).LineUtil.isFlat || (L as any).LineUtil._flat;
      (L as any).LineUtil._flat = (L as any).LineUtil._flat || (L as any).LineUtil.isFlat;
      await import('leaflet-draw');
      if (!isMounted || !mapRef.current) return;

      LRef.current = L;

      const map = L.map(mapRef.current, {
        center: [center.lat, center.lng],
        zoom: 17,
        minZoom: 13,
        maxZoom: 19,
      });
      mapInstance.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      const drawnItems = new (L as any).FeatureGroup();
      drawnItemsRef.current = drawnItems;
      map.addLayer(drawnItems);

      if (initialBoundary && initialBoundary.length >= 3) {
        const poly = L.polygon(initialBoundary.map(p => [p.lat, p.lng] as [number, number]), {
          color: '#ff8200',
        });
        drawnItems.addLayer(poly);
        setHasShape(true);
      }

      if (readOnly) {
        // View mode — just frame the drawn shape (or the center point if there's none), no draw toolbar.
        if (initialBoundary && initialBoundary.length >= 3) {
          map.fitBounds(L.polygon(initialBoundary.map(p => [p.lat, p.lng] as [number, number])).getBounds(), { padding: [20, 20] });
        } else {
          map.setView([center.lat, center.lng], 17);
        }
        return;
      }

      // Allowed-area indicator (§8.2d) — dashed circle standing in for "the
      // selected Location Hierarchy area" (see prop doc above for why a radius).
      allowedCircleRef.current = L.circle([center.lat, center.lng], {
        radius: maxRadiusMeters,
        color: '#008c95',
        weight: 1.5,
        dashArray: '6,6',
        fillOpacity: 0.05,
      }).addTo(map);
      map.fitBounds(allowedCircleRef.current.getBounds(), { padding: [20, 20] });

      const drawControl = new (L as any).Control.Draw({
        draw: {
          polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#ff8200' } },
          polyline: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
        edit: {
          featureGroup: drawnItems,
          remove: true,
        },
      });
      map.addControl(drawControl);

      const isWithinAllowedArea = (layer: any): boolean => {
        const latlngs: any[] = layer.getLatLngs()[0];
        const centerLatLng = L.latLng(center.lat, center.lng);
        return latlngs.every(pt => centerLatLng.distanceTo(pt) <= maxRadiusMeters);
      };

      const emitBoundary = () => {
        const layers = drawnItems.getLayers();
        if (layers.length === 0) {
          onBoundaryChange(undefined);
          setHasShape(false);
          return;
        }
        const layer = layers[0] as any;
        const latlngs: any[] = layer.getLatLngs()[0];
        onBoundaryChange(latlngs.map(p => ({ lat: p.lat, lng: p.lng })));
        setHasShape(true);
      };

      map.on((L as any).Draw.Event.CREATED, (e: any) => {
        const layer = e.layer;
        if (!isWithinAllowedArea(layer)) {
          setError('Boundary falls outside the selected location’s area — draw within the dashed circle.');
          return;
        }
        setError(null);
        // Only one boundary shape per Event — replace any existing shape.
        drawnItems.clearLayers();
        drawnItems.addLayer(layer);
        emitBoundary();
      });

      map.on((L as any).Draw.Event.EDITED, (e: any) => {
        let allValid = true;
        e.layers.eachLayer((layer: any) => {
          if (!isWithinAllowedArea(layer)) allValid = false;
        });
        if (!allValid) {
          setError('Boundary falls outside the selected location’s area — edit stayed within the dashed circle.');
          return;
        }
        setError(null);
        emitBoundary();
      });

      map.on((L as any).Draw.Event.DELETED, () => {
        setError(null);
        emitBoundary();
      });
    };

    init();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, readOnly, center.lat, center.lng]);

  const handleClear = () => {
    if (drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
    setError(null);
    setHasShape(false);
    onBoundaryChange(undefined);
  };

  if (disabled) {
    return (
      <div style={{ padding: 16, background: 'var(--bg-inset)', border: '1px dashed var(--border-color)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
        Select an Event Location above to enable boundary drawing.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Event Area Boundary {!readOnly && <span style={{ fontWeight: 400, textTransform: 'none', color: 'var(--text-faint)' }}>(optional — §8.2)</span>}
        </label>
        {!readOnly && hasShape && (
          <button type="button" onClick={handleClear} className="btn btn-secondary btn-xs" style={{ fontSize: 11, padding: '2px 8px' }}>
            Clear boundary
          </button>
        )}
      </div>
      <div ref={mapRef} style={{ height: readOnly ? 200 : 260, borderRadius: 8, border: '1px solid var(--border-color)', overflow: 'hidden' }} />
      {!readOnly && (
        <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 6, lineHeight: 1.5 }}>
          Use the polygon tool (top-right of the map) to draw the event area within the dashed circle. Leave blank if the event doesn&apos;t cover a specific area.
        </p>
      )}
      {error && (
        <p style={{ fontSize: 11.5, color: '#EF4444', marginTop: 4, fontWeight: 600 }}>{error}</p>
      )}
    </div>
  );
}
