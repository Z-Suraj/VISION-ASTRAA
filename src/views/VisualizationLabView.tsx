import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  CrossSectionProfileChart,
  ElevationHistogramChart,
  HypsometricCurveChart,
  SlopeDistributionChart,
} from '../components/ScientificCharts.tsx';
import TerrainMesh3D from '../components/TerrainMesh3D.tsx';
import MorphometricScatterChart from '../components/MorphometricScatterChart.tsx';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import type { AnalogSite, DatasetRecord } from '../types/astraa.ts';

interface VisualizationLabViewProps {
  datasets: DatasetRecord[];
  sites: AnalogSite[];
  focusMode?: 'full' | 'morphometrics';
}

export default function VisualizationLabView({
  datasets,
  sites,
  focusMode = 'full',
}: VisualizationLabViewProps) {
  const terrainDatasets = useMemo(
    () => datasets.filter((d) => d.processingStatus === 'Processed' && d.summaryStats),
    [datasets]
  );

  const [selectedDsId, setSelectedDsId] = useState<string>(terrainDatasets[0]?.id ?? '');
  const activeDs =
    terrainDatasets.find((d) => d.id === selectedDsId) ?? terrainDatasets[0] ?? null;

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
                <h1 className="font-display text-xl font-bold text-white">Morphometric Analysis</h1>
                <p className="text-xs text-slate-300">
                  Datum-independent Mean Surface Slope vs. Riley Terrain Ruggedness Index (TRI)
                  clustering across Earth analogues, Moon targets, and Mars targets.
                </p>
              </div>
            </div>
          </div>
        </div>
        <MorphometricScatterChart sites={sites} datasets={datasets} />
      </div>
    );
  }

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
                Elevation histograms, hypsometric curves, Horn slope distributions, 3D Digital Twin
                meshes, and cross-planet morphometric clustering from processed datasets.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-slate-300">Active DEM Dataset</label>
            <select
              value={activeDs?.id ?? ''}
              onChange={(e) => setSelectedDsId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              {terrainDatasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename} ({d.planet})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {activeDs?.summaryStats ? (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5 font-mono">
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
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <TerrainMesh3D
                stats={activeDs.summaryStats}
                title={`${activeDs.filename} — ${activeDs.source}`}
                heightClass="h-[360px]"
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

          {/* Histograms & Slope Distribution */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <ElevationHistogramChart bins={activeDs.summaryStats.elevationHistogram} />
            <SlopeDistributionChart bins={activeDs.summaryStats.slopeDistribution} />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-[#080f23] p-8 text-center text-sm text-slate-400">
          No processed elevation grid found. Upload a .hgt, .asc, or gridded .csv in Data Center.
        </div>
      )}

      {/* Cross-Planet Morphometric Clustering Scatter Plot */}
      <MorphometricScatterChart sites={sites} datasets={datasets} />
    </div>
  );
}
