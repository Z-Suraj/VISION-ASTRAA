import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { AnalogSite, DatasetRecord, PlanetaryBody } from '../types/astraa.ts';

interface LeafletMapExplorerProps {
  body: PlanetaryBody;
  sites: AnalogSite[];
  datasets?: DatasetRecord[];
  selectedSiteId?: string | null;
  onSelectSite?: (site: AnalogSite) => void;
  heightClass?: string;
}

function createPlanetaryGridLayer(body: PlanetaryBody): L.GridLayer {
  const GridLayer = L.GridLayer.extend({
    createTile(coords: L.Coords) {
      const tile = document.createElement('canvas');
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;
      const ctx = tile.getContext('2d')!;

      // Base planetary palette
      if (body === 'Mars') {
        ctx.fillStyle = '#180d0a';
      } else if (body === 'Moon') {
        ctx.fillStyle = '#0d1017';
      } else {
        ctx.fillStyle = '#071124';
      }
      ctx.fillRect(0, 0, size.x, size.y);

      // Subtle latitude/longitude gridlines
      ctx.strokeStyle =
        body === 'Mars'
          ? 'rgba(249, 115, 22, 0.14)'
          : body === 'Moon'
            ? 'rgba(148, 163, 184, 0.14)'
            : 'rgba(34, 211, 238, 0.12)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, size.x, size.y);

      // Sub-grid crosshairs
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      ctx.beginPath();
      ctx.moveTo(size.x / 2, 0);
      ctx.lineTo(size.x / 2, size.y);
      ctx.moveTo(0, size.y / 2);
      ctx.lineTo(size.x, size.y / 2);
      ctx.stroke();

      // Tile coordinate watermark
      ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText(`z${coords.z}/${coords.x}/${coords.y}`, 8, 16);

      return tile;
    },
  });
  return new GridLayer();
}

export default function LeafletMapExplorer({
  body,
  sites,
  datasets = [],
  selectedSiteId,
  onSelectSite,
  heightClass = 'h-[420px]',
}: LeafletMapExplorerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    baseLayer: L.Layer | null;
    markersLayer: L.LayerGroup;
    extentsLayer: L.LayerGroup;
  } | null>(null);

  const [basemapMode, setBasemapMode] = useState<'graticule' | 'satellite'>('satellite');
  const [showExtents, setShowExtents] = useState(true);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);

  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [22, 42],
      zoom: 2,
      minZoom: 1,
      maxZoom: 12,
      worldCopyJump: true,
      attributionControl: true,
    });

    const markersLayer = L.layerGroup().addTo(map);
    const extentsLayer = L.layerGroup().addTo(map);

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({
        lat: Math.round(e.latlng.lat * 1000) / 1000,
        lon: Math.round(e.latlng.lng * 1000) / 1000,
      });
    });

    mapRef.current = map;
    layersRef.current = { baseLayer: null, markersLayer, extentsLayer };

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, []);

  // Update base layer when body or basemapMode changes
  useEffect(() => {
    const map = mapRef.current;
    const refs = layersRef.current;
    if (!map || !refs) return;

    if (refs.baseLayer) {
      map.removeLayer(refs.baseLayer);
    }

    if (body === 'Earth' && basemapMode === 'satellite') {
      // Dark ESRI World Imagery or Carto Dark with fallback grid underneath
      const gridFallback = createPlanetaryGridLayer('Earth');
      const satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Esri, NASA, USGS Earth Imagery',
          maxZoom: 14,
        }
      );
      const group = L.layerGroup([gridFallback, satLayer]);
      group.addTo(map);
      refs.baseLayer = group;
    } else {
      const grid = createPlanetaryGridLayer(body);
      grid.addTo(map);
      refs.baseLayer = grid;
    }
  }, [body, basemapMode]);

  // Update markers & dataset bounding extents
  useEffect(() => {
    const map = mapRef.current;
    const refs = layersRef.current;
    if (!map || !refs) return;

    refs.markersLayer.clearLayers();
    refs.extentsLayer.clearLayers();

    const bodySites = sites.filter((s) => s.body === body);

    bodySites.forEach((site) => {
      const isSelected = site.id === selectedSiteId;
      const color =
        site.status === 'Established Reference'
          ? '#34d399'
          : site.status === 'Candidate Region'
            ? '#f59e0b'
            : '#22d3ee';

      const marker = L.circleMarker([site.latitude, site.longitude], {
        radius: isSelected ? 10 : 7,
        color: isSelected ? '#ffffff' : color,
        weight: isSelected ? 2.5 : 1.8,
        fillColor: color,
        fillOpacity: 0.78,
      });

      marker.bindPopup(
        `<div style="min-width:190px">
          <div style="font-weight:700;font-size:13px;color:#f8fafc;margin-bottom:3px">${site.name}</div>
          <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${site.body} · ${site.category} · ${site.status}</div>
          <div style="font-family:monospace;font-size:11px;color:#cbd5e1">
            Lat ${site.latitude.toFixed(3)}°, Lon ${site.longitude.toFixed(3)}°<br/>
            Mean Slope: ${site.meanSlopeDeg !== null ? `${site.meanSlopeDeg}°` : 'N/A'}<br/>
            TRI: ${site.triMeanM !== null ? `${site.triMeanM} m` : 'N/A'}
          </div>
        </div>`
      );

      marker.on('click', () => {
        onSelectSiteRef.current?.(site);
      });

      marker.addTo(refs.markersLayer);

      if (isSelected) {
        map.panTo([site.latitude, site.longitude], { animate: true });
      }
    });

    if (showExtents) {
      datasets
        .filter((d) => (d.planet === body || d.planet === 'Multi-Planet') && d.spatialExtent)
        .forEach((d) => {
          const ext = d.spatialExtent!;
          const rect = L.rectangle(
            [
              [ext.minLat, ext.minLon],
              [ext.maxLat, ext.maxLon],
            ],
            {
              color: d.processingStatus === 'Processed' ? '#38bdf8' : '#94a3b8',
              weight: 1.5,
              dashArray: d.processingStatus === 'Processed' ? undefined : '4 4',
              fillOpacity: 0.1,
            }
          );
          rect.bindTooltip(`${d.filename} (${d.processingStatus})`);
          rect.addTo(refs.extentsLayer);
        });
    }
  }, [body, sites, datasets, selectedSiteId, showExtents]);

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#060b18] ${heightClass}`}>
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Top-Right GIS Layer Controls */}
      <div className="absolute top-3 right-3 z-[400] flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-[#070d1f]/90 px-2.5 py-1.5 text-xs">
        {body === 'Earth' && (
          <button
            type="button"
            onClick={() => setBasemapMode((m) => (m === 'satellite' ? 'graticule' : 'satellite'))}
            className="rounded px-2 py-1 font-medium text-cyan-300 hover:bg-slate-800 whitespace-nowrap"
          >
            Layer: {basemapMode === 'satellite' ? 'Satellite' : 'Graticule'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowExtents((s) => !s)}
          className={`rounded px-2 py-1 font-medium whitespace-nowrap ${
            showExtents ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400 hover:bg-slate-800'
          }`}
        >
          DEM Bounds
        </button>
      </div>

      {/* Bottom-Left Coordinate Readout & Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-wrap items-center gap-3 rounded-lg border border-slate-800/80 bg-[#070d1f]/90 px-3 py-1.5 font-mono text-[11px] text-slate-300">
        <span>
          {cursorCoords
            ? `${cursorCoords.lat.toFixed(3)}°, ${cursorCoords.lon.toFixed(3)}°`
            : `${body} Coordinate Canvas`}
        </span>
        <span className="text-slate-600">|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Reference
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Candidate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          Target
        </span>
      </div>
    </div>
  );
}
