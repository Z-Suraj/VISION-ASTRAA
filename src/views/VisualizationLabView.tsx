import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Box,
  Database,
  Grid,
  Layers,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  CrossSectionProfileChart,
  ElevationHistogramChart,
  HypsometricCurveChart,
  SlopeDistributionChart,
} from '../components/ScientificCharts.tsx';
import TerrainMesh3D from '../components/TerrainMesh3D.tsx';
import MorphometricScatterChart from '../components/MorphometricScatterChart.tsx';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import type {
  AnalogSite,
  DatasetRecord,
  MorphometricNormalization,
  PlanetaryBody,
} from '../types/astraa.ts';

interface VisualizationLabViewProps {
  datasets: DatasetRecord[];
  sites: AnalogSite[];
  focusMode?: 'full' | 'morphometrics';
}

type LabViewMode = 'full' | '3d' | 'distributions' | 'clustering';
type PlanetSelection = 'All' | PlanetaryBody;

const PLANET_OPTIONS: PlanetSelection[] = ['All', 'Earth', 'Mars', 'Moon'];

const VIEW_MODES: Array<{ id: LabViewMode; label: string }> = [
  { id: 'full', label: 'Full Lab' },
  { id: '3d', label: '3D & Profiles' },
  { id: 'distributions', label: 'Distributions' },
  { id: 'clustering', label: 'Morphometrics' },
];

export default function VisualizationLabView({
  datasets,
  sites,
  focusMode = 'full',
}: VisualizationLabViewProps) {
  const terrainDatasets = useMemo(
    () => datasets.filter((d) => d.processingStatus === 'Processed' && d.summaryStats),
    [datasets]
  );

  // Global Toolbar State
  const [planetFilter, setPlanetFilter] = useState<PlanetSelection>('All');
  const [viewMode, setViewMode] = useState<LabViewMode>('full');
  const [selectedDsId, setSelectedDsId] = useState<string>(terrainDatasets[0]?.id ?? '');

  // Shared 3D Digital Twin Controls
  const [terrainColorMode, setTerrainColorMode] = useState<'elevation' | 'slope'>('elevation');
  const [terrainWireframe, setTerrainWireframe] = useState<boolean>(false);
  const [terrainExaggeration, setTerrainExaggeration] = useState<number>(1.25);

  // Shared Morphometric Clustering Controls
  const [normalization, setNormalization] = useState<MorphometricNormalization>('zscore');
  const [clusterCount, setClusterCount] = useState<number>(3);

  const filteredDatasets = useMemo(() => {
    if (planetFilter === 'All') return terrainDatasets;
    return terrainDatasets.filter((d) => d.planet === planetFilter);
  }, [terrainDatasets, planetFilter]);

  useEffect(() => {
    if (filteredDatasets.length === 0) return;
    const stillValid = filteredDatasets.some((d) => d.id === selectedDsId);
    if (!stillValid) {
      setSelectedDsId(filteredDatasets[0].id);
    }
  }, [filteredDatasets, selectedDsId]);

  const activeDs =
    filteredDatasets.find((d) => d.id === selectedDsId) ?? filteredDatasets[0] ?? null;

  const isSyntheticCalibration = Boolean(
    activeDs &&
      (activeDs.id.startsWith('ds-calib-') ||
        activeDs.filename.startsWith('CALIBRATION_') ||
        activeDs.source.toLowerCase().includes('procedural calibration'))
  );

  const handleResetAll = () => {
    setPlanetFilter('All');
    setViewMode('full');
    if (terrainDatasets[0]) setSelectedDsId(terrainDatasets[0].id);
    setTerrainColorMode('elevation');
    setTerrainWireframe(false);
    setTerrainExaggeration(1.25);
    setNormalization('zscore');
    setClusterCount(3);
  };

  if (focusMode === 'morphometrics') {
    return (
      <div className="space-y-6">
        <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md">
          <CinematicBackdrop
            src="/assets/geological/impact_crater_basalt.webp"
            alt="Cross-planet morphometric terrain clustering backdrop"
            eager
            opacityClass="opacity-35"
            scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/65"
          />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <BarChart3 className="h-5 w-5 text-cyan-400" />
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  Morphometric Analysis
                </h1>
                <p className="text-xs text-slate-300">
                  Datum-independent Mean Surface Slope vs. Riley Terrain Ruggedness Index (TRI)
                  clustering across Earth analogues, Moon targets, and Mars targets.
                </p>
              </div>
            </div>
          </div>
        </div>

        <MorphometricScatterChart
          sites={sites}
          datasets={datasets}
          normalization={normalization}
          onNormalizationChange={setNormalization}
          clusterCount={clusterCount}
          onClusterCountChange={setClusterCount}
          planetFilter={planetFilter}
          onPlanetFilterChange={setPlanetFilter}
        />
      </div>
    );
  }

  const show3DSection = viewMode === 'full' || viewMode === '3d';
  const showDistributions = viewMode === 'full' || viewMode === 'distributions';
  const showClustering = viewMode === 'full' || viewMode === 'clustering';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md">
        <CinematicBackdrop
          src="/assets/geological/impact_crater_basalt.webp"
          alt="Terrestrial impact crater orbital morphology"
          eager
          opacityClass="opacity-35"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/65"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-5 w-5 text-cyan-400" />
            <div>
              <h1 className="font-display text-xl font-bold text-white">Visualization Lab</h1>
              <p className="text-xs text-slate-300">
                Elevation histograms, hypsometric curves, Horn 3×3 slope distributions, 3D Digital
                Twin meshes, and cross-planet morphometric clustering from processed datasets.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums">
            <span className="rounded-lg border border-slate-700/80 bg-slate-900/90 px-2.5 py-1.5 text-slate-300 whitespace-nowrap">
              {terrainDatasets.length} Processed DEM{terrainDatasets.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/60 hover:text-white transition-colors whitespace-nowrap"
            >
              <RotateCcw className="h-3.5 w-3.5 text-cyan-400" />
              Reset Lab
            </button>
          </div>
        </div>
      </div>

      {/* Global Visualization Toolbar */}
      <section
        aria-label="Global Visualization Toolbar"
        className="rounded-xl border border-slate-800/90 bg-[#080f23]/95 p-4 shadow-lg shadow-black/20"
      >
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:items-end">
          {/* Group 1: Planet & Dataset Selection */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 xl:col-span-6">
            <div className="sm:col-span-5">
              <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                <Database className="h-3.5 w-3.5 text-cyan-400" />
                Planet Filter
              </span>
              <div
                role="group"
                aria-label="Filter datasets and clustering by planet"
                className="flex items-center rounded-lg border border-slate-700/90 bg-[#050814] p-0.5"
              >
                {PLANET_OPTIONS.map((p) => {
                  const active = planetFilter === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPlanetFilter(p)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="sm:col-span-7">
              <label
                htmlFor="lab-dataset-select"
                className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-slate-400"
              >
                <span>Active DEM Dataset</span>
                <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                  {filteredDatasets.length} match{filteredDatasets.length === 1 ? '' : 'es'}
                </span>
              </label>
              <select
                id="lab-dataset-select"
                value={activeDs?.id ?? ''}
                disabled={filteredDatasets.length === 0}
                onChange={(e) => setSelectedDsId(e.target.value)}
                className="w-full rounded-lg border border-slate-700/90 bg-[#050814] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none disabled:opacity-50"
              >
                {filteredDatasets.length === 0 ? (
                  <option value="">No processed DEM for {planetFilter}</option>
                ) : (
                  filteredDatasets.map((d) => {
                    const synth =
                      d.id.startsWith('ds-calib-') || d.filename.startsWith('CALIBRATION_');
                    return (
                      <option key={d.id} value={d.id}>
                        {d.filename} ({d.planet}
                        {synth ? ' · Synthetic Calibration' : ' · Processed DEM'})
                      </option>
                    );
                  })
                )}
              </select>
            </div>
          </div>

          {/* Group 2: Visualization Mode */}
          <div className="xl:col-span-3">
            <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <Layers className="h-3.5 w-3.5 text-cyan-400" />
              Visualization Mode
            </span>
            <div
              role="group"
              aria-label="Visualization mode selector"
              className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-1 rounded-lg border border-slate-700/90 bg-[#050814] p-1"
            >
              {VIEW_MODES.map((m) => {
                const active = viewMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setViewMode(m.id)}
                    className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Group 3: 3D Mesh + Clustering Sync Controls */}
          <div className="xl:col-span-3 space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
              <SlidersHorizontal className="h-3.5 w-3.5 text-cyan-400" />
              3D Surface &amp; Cluster Controls
            </span>
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700/90 bg-[#050814] px-2.5 py-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTerrainColorMode('elevation')}
                  disabled={!activeDs || !show3DSection}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap disabled:opacity-40 ${
                    terrainColorMode === 'elevation'
                      ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Elev
                </button>
                <button
                  type="button"
                  onClick={() => setTerrainColorMode('slope')}
                  disabled={!activeDs || !show3DSection}
                  className={`rounded px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap disabled:opacity-40 ${
                    terrainColorMode === 'slope'
                      ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Slope
                </button>
              </div>

              <button
                type="button"
                aria-pressed={terrainWireframe}
                onClick={() => setTerrainWireframe((w) => !w)}
                disabled={!activeDs || !show3DSection}
                className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap disabled:opacity-40 ${
                  terrainWireframe
                    ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Grid className="h-3 w-3" />
                Mesh
              </button>

              <label className="flex flex-1 min-w-[115px] items-center gap-1.5 text-[11px] text-slate-300">
                <span className="font-mono text-[10px] text-slate-400 whitespace-nowrap">
                  Z {terrainExaggeration.toFixed(2)}×
                </span>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={terrainExaggeration}
                  disabled={!activeDs || !show3DSection}
                  aria-label="Global 3D Z-Scale Exaggeration"
                  onChange={(e) => setTerrainExaggeration(Number(e.target.value))}
                  className="w-full accent-cyan-400 disabled:opacity-40"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Secondary Sync Bar for Clustering Parameters */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3 text-[11px]">
          <div className="flex flex-wrap items-center gap-2 text-slate-400">
            <Box className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <span>
              Active Target:{' '}
              <strong className="font-mono text-slate-200">
                {activeDs ? activeDs.filename : `No ${planetFilter} DEM uploaded`}
              </strong>
            </span>
            {activeDs && (
              <span className="font-mono text-slate-500 tabular-nums">
                ({activeDs.summaryStats?.rows}×{activeDs.summaryStats?.cols} · {activeDs.resolution})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Normalization:</span>
              <select
                aria-label="Global Clustering Normalization"
                value={normalization}
                onChange={(e) => setNormalization(e.target.value as MorphometricNormalization)}
                className="rounded border border-slate-700 bg-[#050814] px-2 py-1 font-mono text-[11px] text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                <option value="zscore">Z-Score TRI</option>
                <option value="minmax">Min-Max [0–1]</option>
                <option value="raw">Raw TRI (m)</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-slate-400">Clusters:</span>
              {[2, 3, 4].map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setClusterCount(k)}
                  className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                    clusterCount === k
                      ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40'
                      : 'border border-slate-800 bg-[#050814] text-slate-400 hover:text-white'
                  }`}
                >
                  k={k}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* DEM & 3D & Distribution Sections */}
      {(show3DSection || showDistributions) && (
        <>
          {activeDs?.summaryStats ? (
            <>
              {/* Synthetic Calibration vs Real Processed DEM Provenance Banner */}
              {isSyntheticCalibration ? (
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-amber-200">
                        Synthetic Calibration Grid — Not an Actual {activeDs.planet} Orbital
                        Observation
                      </div>
                      <p className="text-[11px] leading-relaxed text-amber-100/80">
                        <span className="font-mono text-amber-200">{activeDs.filename}</span> (
                        {activeDs.source}) is a procedural mathematical benchmark used to verify Horn
                        3×3 slope kernels, Riley TRI, and hypsometric integration inside the browser
                        pipeline.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-amber-200 tabular-nums">
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 whitespace-nowrap">
                      {activeDs.summaryStats.rows} × {activeDs.summaryStats.cols} DEM
                    </span>
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 whitespace-nowrap">
                      Relief: {activeDs.summaryStats.reliefM} m
                    </span>
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 whitespace-nowrap">
                      Mean Slope: {activeDs.summaryStats.meanSlopeDeg}°
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/15 px-4 py-2.5 text-xs">
                  <div className="flex items-center gap-2 text-emerald-200">
                    <span className="font-semibold">Processed Observational DEM:</span>
                    <span className="font-mono">{activeDs.filename}</span>
                    <span className="text-slate-400">· {activeDs.source}</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-300 tabular-nums">
                    {activeDs.crs} · {activeDs.resolution}
                  </div>
                </div>
              )}

              {/* KPI Summary Strip */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 font-mono tabular-nums">
                <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
                  <div className="text-[11px] text-slate-400">Elevation Mean</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {activeDs.summaryStats.elevationMeanM} m
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
                  <div className="text-[11px] text-slate-400">Local Relief Span</div>
                  <div className="mt-1 text-lg font-bold text-cyan-300">
                    {activeDs.summaryStats.reliefM} m
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
                  <div className="text-[11px] text-slate-400">Mean Slope</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {activeDs.summaryStats.meanSlopeDeg}°
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
                  <div className="text-[11px] text-slate-400">Mean TRI</div>
                  <div className="mt-1 text-lg font-bold text-emerald-300">
                    {activeDs.summaryStats.triMeanM} m
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
                  <div className="text-[11px] text-slate-400">Hypsometric Integral</div>
                  <div className="mt-1 text-lg font-bold text-amber-300">
                    {activeDs.summaryStats.hypsometricIntegral}
                  </div>
                </div>
              </div>

              {/* 3D Terrain Mesh + Transect Profile */}
              {show3DSection && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  <div className="lg:col-span-7">
                    <TerrainMesh3D
                      stats={activeDs.summaryStats}
                      title={activeDs.filename}
                      subtitle={activeDs.source}
                      isSyntheticCalibration={isSyntheticCalibration}
                      colorMode={terrainColorMode}
                      onColorModeChange={setTerrainColorMode}
                      wireframe={terrainWireframe}
                      onWireframeChange={setTerrainWireframe}
                      exaggeration={terrainExaggeration}
                      onExaggerationChange={setTerrainExaggeration}
                      heightClass="h-[380px]"
                    />
                  </div>
                  <div className="space-y-5 lg:col-span-5">
                    <HypsometricCurveChart
                      points={activeDs.summaryStats.hypsometricCurve}
                      integral={activeDs.summaryStats.hypsometricIntegral}
                    />
                    <CrossSectionProfileChart grid={activeDs.summaryStats.previewGrid} />
                  </div>
                </div>
              )}

              {/* Histograms & Slope Distribution */}
              {showDistributions && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <ElevationHistogramChart
                      bins={activeDs.summaryStats.elevationHistogram}
                      meanElevationM={activeDs.summaryStats.elevationMeanM}
                    />
                    <SlopeDistributionChart bins={activeDs.summaryStats.slopeDistribution} />
                  </div>
                  {!show3DSection && (
                    <HypsometricCurveChart
                      points={activeDs.summaryStats.hypsometricCurve}
                      integral={activeDs.summaryStats.hypsometricIntegral}
                    />
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-[#080f23] p-8 text-center space-y-3">
              <div className="text-sm font-medium text-slate-200">
                No processed elevation grid mounted for <span className="text-cyan-300">{planetFilter}</span>.
              </div>
              <p className="mx-auto max-w-xl text-xs text-slate-400">
                Lunar orbital DTMs (such as LOLA / Kaguya LALT grids) are catalogued as pending
                uploads in Data Center. Cross-planet morphometric clustering below remains active
                using published reference baselines for all 15 indexed regions.
              </p>
              <button
                type="button"
                onClick={() => setPlanetFilter('All')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/25 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Show All Processed DEMs
              </button>
            </div>
          )}
        </>
      )}

      {/* Cross-Planet Morphometric Clustering Scatter Plot */}
      {showClustering && (
        <MorphometricScatterChart
          sites={sites}
          datasets={datasets}
          normalization={normalization}
          onNormalizationChange={setNormalization}
          clusterCount={clusterCount}
          onClusterCountChange={setClusterCount}
          planetFilter={planetFilter}
          onPlanetFilterChange={setPlanetFilter}
        />
      )}
    </div>
  );
}
