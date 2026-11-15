import { useEffect, useMemo, useState } from 'react';
import { Database, Globe2, Layers, Map as MapIcon, Mountain, Thermometer } from 'lucide-react';
import LeafletMapExplorer from '../components/LeafletMapExplorer.tsx';
import PlanetaryGlobe3D from '../components/PlanetaryGlobe3D.tsx';
import TerrainMesh3D from '../components/TerrainMesh3D.tsx';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import SiteImage from '../components/SiteImage.tsx';
import { formatLatLon, getAvailableDatasetsForSite } from '../utils/siteDatasets.ts';
import type { AnalogSite, DatasetRecord, PlanetaryBody } from '../types/astraa.ts';

interface ExplorerViewProps {
  sites: AnalogSite[];
  datasets: DatasetRecord[];
  initialSelectedSiteId?: string | null;
  initialBody?: PlanetaryBody;
}

export default function ExplorerView({
  sites,
  datasets,
  initialSelectedSiteId,
  initialBody,
}: ExplorerViewProps) {
  const [body, setBody] = useState<PlanetaryBody>(initialBody ?? 'Earth');
  const [viewMode, setViewMode] = useState<'split' | '3d' | '2d'>('3d');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(
    initialSelectedSiteId ?? 'earth-ladakh'
  );

  useEffect(() => {
    if (initialBody) {
      setBody(initialBody);
      const matchingSelected = sites.find(
        (s) => s.id === selectedSiteId && s.body === initialBody
      );
      if (!matchingSelected) {
        const firstForBody = sites.find((s) => s.body === initialBody);
        setSelectedSiteId(firstForBody?.id ?? null);
      }
    }
  }, [initialBody, sites]);

  useEffect(() => {
    if (initialSelectedSiteId) {
      const target = sites.find((s) => s.id === initialSelectedSiteId);
      if (target) {
        setBody(target.body);
        setSelectedSiteId(target.id);
      }
    }
  }, [initialSelectedSiteId, sites]);

  const bodySites = useMemo(() => sites.filter((s) => s.body === body), [sites, body]);
  const activeSite =
    bodySites.find((s) => s.id === selectedSiteId) ?? bodySites[0] ?? null;
  const activeSiteDatasets = useMemo(
    () => (activeSite ? getAvailableDatasetsForSite(activeSite, datasets) : []),
    [activeSite, datasets]
  );

  const matchingTerrainDataset = useMemo(
    () =>
      datasets.find(
        (d) =>
          d.processingStatus === 'Processed' &&
          d.summaryStats &&
          (d.planet === body || (body === 'Earth' && d.planet === 'Earth'))
      ) ?? null,
    [datasets, body]
  );

  const handleBodySwitch = (next: PlanetaryBody) => {
    setBody(next);
    const first = sites.find((s) => s.body === next);
    setSelectedSiteId(first?.id ?? null);
  };

  const bodyBackdrop =
    body === 'Mars'
      ? '/assets/mars/mars_valles_canyon.webp'
      : body === 'Moon'
        ? '/assets/moon/lunar_south_pole.webp'
        : '/assets/planets/earth_orbit_horizon.webp';

  return (
    <div className="space-y-6">
      {/* Header & Mode Controls with Planet-Specific Atmospheric Layer */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23] p-5">
        <CinematicBackdrop
          src={bodyBackdrop}
          alt={`${body} planetary horizon backdrop`}
          eager
          opacityClass="opacity-45"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/80 to-[#050814]/55"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-white">Planetary Explorer</h1>
            <p className="mt-1 text-xs text-slate-300">
              Inspect 3D planetary globes, 2D GIS spatial coordinates, DEM terrain meshes, slope,
              ruggedness (TRI), and thermal envelopes across Earth, Moon, and Mars.
            </p>
          </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Body Switch */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-xs">
            {(['Earth', 'Moon', 'Mars'] as PlanetaryBody[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => handleBodySwitch(b)}
                className={`rounded-lg px-3 py-1.5 font-semibold transition-colors whitespace-nowrap ${
                  body === b
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {b}
              </button>
            ))}
          </div>

          {/* Viewport Switch */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('split')}
              className={`rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap ${
                viewMode === 'split' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              Split 3D + 2D
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap ${
                viewMode === '3d' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Globe2 className="h-3.5 w-3.5" />
              3D
            </button>
            <button
              type="button"
              onClick={() => setViewMode('2d')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-medium whitespace-nowrap ${
                viewMode === '2d' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapIcon className="h-3.5 w-3.5" />
              2D GIS
            </button>
          </div>
        </div>
        </div>
      </div>

      {/* Main Spatial Viewports + Site Directory */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left Spatial Stage (8 cols) */}
        <div className="space-y-5 xl:col-span-8">
          <div
            className={`grid gap-5 ${
              viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            {(viewMode === 'split' || viewMode === '3d') && (
              <PlanetaryGlobe3D
                body={body}
                sites={sites}
                selectedSiteId={activeSite?.id}
                onSelectSite={(s) => setSelectedSiteId(s.id)}
                heightClass={viewMode === '3d' ? 'h-[500px] lg:h-[580px]' : 'h-[420px]'}
              />
            )}
            {(viewMode === 'split' || viewMode === '2d') && (
              <LeafletMapExplorer
                body={body}
                sites={sites}
                datasets={datasets}
                selectedSiteId={activeSite?.id}
                onSelectSite={(s) => setSelectedSiteId(s.id)}
                heightClass={viewMode === '2d' ? 'h-[500px] lg:h-[580px]' : 'h-[420px]'}
              />
            )}
          </div>

          {/* 3D Local Terrain DEM Digital Twin for active planetary body */}
          {matchingTerrainDataset?.summaryStats && (
            <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mountain className="h-4 w-4 text-cyan-400" />
                  <h2 className="font-display text-sm font-semibold text-white">
                    Local 3D Terrain Digital Twin — {matchingTerrainDataset.filename}
                  </h2>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                  {matchingTerrainDataset.source} · {matchingTerrainDataset.crs}
                </span>
              </div>
              <TerrainMesh3D
                stats={matchingTerrainDataset.summaryStats}
                title={matchingTerrainDataset.region}
                heightClass="h-[310px]"
              />
            </div>
          )}
        </div>

        {/* Right Inspector & Site Selector (4 cols) */}
        <div className="space-y-5 xl:col-span-4">
          {/* Site List */}
          <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/85 backdrop-blur-md p-4">
            <h2 className="font-display text-sm font-semibold text-white">
              {body} Indexed Regions ({bodySites.length})
            </h2>
            <div className="mt-3 max-h-60 space-y-2 overflow-y-auto pr-1">
              {bodySites.map((s) => {
                const selected = s.id === activeSite?.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSiteId(s.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected
                        ? 'border-cyan-400/70 bg-cyan-500/10'
                        : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-100">{s.name}</span>
                      <span className="font-mono text-[10px] text-cyan-300">{s.category}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                      {s.latitude.toFixed(2)}°, {s.longitude.toFixed(2)}° · {s.status}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Region Scientific Metadata */}
          {activeSite && (
            <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/85 backdrop-blur-md p-4 space-y-4">
              <div className="relative overflow-hidden rounded-lg border border-slate-800">
                <SiteImage
                  src={activeSite.imageUrl}
                  alt={activeSite.name}
                  className="h-36 w-full object-cover"
                />
                <div className="bg-[#050814]/90 px-2.5 py-1 text-[10px] text-slate-400">
                  {activeSite.imageAttribution}
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base font-bold text-white">{activeSite.name}</h3>
                  <span className="rounded bg-cyan-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-cyan-300">
                    {activeSite.category}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-300">
                  {activeSite.region} · {activeSite.countryOrSector}
                </p>
                <p className="mt-1 font-mono text-[11px] text-cyan-200">
                  {formatLatLon(activeSite.latitude, activeSite.longitude)} · {activeSite.status}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div className="rounded-lg bg-slate-900/70 p-2.5">
                  <div className="text-[10px] text-slate-400">Mean Slope</div>
                  <div className="mt-0.5 font-semibold text-white">
                    {activeSite.meanSlopeDeg !== null ? `${activeSite.meanSlopeDeg}°` : 'Unavailable'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 p-2.5">
                  <div className="text-[10px] text-slate-400">Ruggedness (TRI)</div>
                  <div className="mt-0.5 font-semibold text-white">
                    {activeSite.triMeanM !== null ? `${activeSite.triMeanM} m` : 'Unavailable'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 p-2.5">
                  <div className="text-[10px] text-slate-400">Local Relief Span</div>
                  <div className="mt-0.5 font-semibold text-white">
                    {activeSite.reliefM !== null ? `${activeSite.reliefM} m` : 'Unavailable'}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 p-2.5">
                  <div className="text-[10px] text-slate-400">Thermal Range</div>
                  <div className="mt-0.5 flex items-center gap-1 font-semibold text-white">
                    <Thermometer className="h-3 w-3 text-amber-400" />
                    {activeSite.tempMinC !== null && activeSite.tempMaxC !== null
                      ? `${activeSite.tempMinC}..${activeSite.tempMaxC}°C`
                      : 'Unavailable'}
                  </div>
                </div>
              </div>

              {/* Available Dataset Information from SQLite */}
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-display text-xs font-semibold text-white">
                  <Database className="h-3.5 w-3.5 text-cyan-400" />
                  Available Dataset Information
                </div>
                {activeSiteDatasets.length > 0 ? (
                  <div className="space-y-1.5">
                    {activeSiteDatasets.map(({ dataset, matchReason }) => (
                      <div
                        key={dataset.id}
                        className="rounded border border-slate-800/80 bg-[#050916]/80 px-2.5 py-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-slate-200">
                            {dataset.filename}
                          </span>
                          <span
                            className={`shrink-0 font-mono text-[10px] ${
                              dataset.processingStatus === 'Processed'
                                ? 'text-emerald-300'
                                : 'text-amber-300'
                            }`}
                          >
                            {dataset.processingStatus === 'Processed'
                              ? 'Processed'
                              : 'Awaiting Upload'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{matchReason}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400">
                    Literature baseline only ({activeSite.dataCompletenessPct}% metadata completeness).
                    Upload regional DEM tiles in Data Center to attach gridded measurements.
                  </div>
                )}
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <span className="font-semibold text-slate-200">Surface &amp; Mineralogy: </span>
                  <span className="text-slate-300">{activeSite.surfaceMaterial}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-200">Water / Ice Signal: </span>
                  <span className="text-slate-300">{activeSite.waterIceIndicator}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-200">Resource Indicators: </span>
                  <span className="text-slate-300">{activeSite.resourceIndicators}</span>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-[11px] text-slate-400">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <Layers className="h-3.5 w-3.5 text-cyan-400" />
                    Provenance &amp; Datum
                  </div>
                  <p className="mt-1">{activeSite.provenance}</p>
                  <p className="mt-0.5 text-slate-500">Citation: {activeSite.sourceCitation}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
