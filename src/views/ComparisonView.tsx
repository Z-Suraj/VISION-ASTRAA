import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, FilePlus2 } from 'lucide-react';
import {
  CrossSectionProfileChart,
  RadarFeatureChart,
} from '../components/ScientificCharts.tsx';
import TerrainMesh3D from '../components/TerrainMesh3D.tsx';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import SiteImage from '../components/SiteImage.tsx';
import TerrainSimilarityTable from '../components/TerrainSimilarityTable.tsx';
import type {
  AnalogSite,
  DatasetRecord,
  SimilarityEvaluation,
  SimilarityMatrixResponse,
  SimilarityWeights,
} from '../types/astraa.ts';

interface ComparisonViewProps {
  sites: AnalogSite[];
  datasets: DatasetRecord[];
  weights: SimilarityWeights;
  onCreateReportFromComparison: (evaluation: SimilarityEvaluation) => Promise<void>;
  focusMode?: 'studio' | 'matrix';
}

export default function ComparisonView({
  sites,
  datasets,
  weights,
  onCreateReportFromComparison,
  focusMode = 'studio',
}: ComparisonViewProps) {
  const earthSites = useMemo(() => sites.filter((s) => s.body === 'Earth'), [sites]);
  const targetSites = useMemo(() => sites.filter((s) => s.body !== 'Earth'), [sites]);

  const [earthId, setEarthId] = useState<string>('earth-ladakh');
  const [targetId, setTargetId] = useState<string>('mars-jezero');
  const [evaluation, setEvaluation] = useState<SimilarityEvaluation | null>(null);
  const [matrix, setMatrix] = useState<SimilarityMatrixResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/similarity/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ earthSiteId: earthId, targetId, weights }),
    })
      .then((r) => r.json())
      .then((data: SimilarityEvaluation) => {
        if (active) setEvaluation(data);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [earthId, targetId, weights]);

  useEffect(() => {
    let active = true;
    setMatrixLoading(true);
    fetch('/api/similarity/matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights }),
    })
      .then((r) => r.json())
      .then((data: SimilarityMatrixResponse) => {
        if (active) setMatrix(data);
      })
      .finally(() => {
        if (active) setMatrixLoading(false);
      });
    return () => {
      active = false;
    };
  }, [weights, sites, datasets]);

  const earthDem = useMemo(
    () =>
      datasets.find((d) => d.processingStatus === 'Processed' && d.planet === 'Earth' && d.summaryStats) ??
      null,
    [datasets]
  );
  const planetaryDem = useMemo(
    () =>
      datasets.find(
        (d) =>
          d.processingStatus === 'Processed' &&
          d.planet !== 'Earth' &&
          d.summaryStats
      ) ?? null,
    [datasets]
  );

  const handleSaveReport = async () => {
    if (!evaluation) return;
    setSavingReport(true);
    setSavedNotice(null);
    try {
      await onCreateReportFromComparison(evaluation);
      setSavedNotice('Comparison saved to Reports module.');
    } finally {
      setSavingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector Header with Geological & Planetary Horizon */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23] p-5">
        <CinematicBackdrop
          src="/assets/geological/volcanic_iceland_basalt.webp"
          alt="Terrestrial basaltic geological formation backdrop"
          eager
          opacityClass="opacity-35"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/75"
        />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <h1 className="font-display text-xl font-bold text-white">
              {focusMode === 'matrix'
                ? 'Planetary Similarity Results'
                : 'Terrain Comparison Studio'}
            </h1>
            <p className="text-xs text-slate-300">
              {focusMode === 'matrix'
                ? 'Cross-planet similarity rankings across all 54 Earth analogue and Moon/Mars region pairs, separating demonstration baselines from processed DEM runs.'
                : 'Cross-planet morphometric and environmental comparison using datum-independent relative relief, Horn slope, Riley TRI, and explicit physical limitations.'}
            </p>
          </div>

        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Earth Analogue Region</label>
            <select
              value={earthId}
              onChange={(e) => setEarthId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              {earthSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.status})
                </option>
              ))}
            </select>
          </div>

          <ArrowLeftRight className="mt-5 h-4 w-4 text-cyan-400 hidden sm:block" />

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Moon / Mars Target</label>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              {targetSites.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.body}] {s.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!evaluation || savingReport}
            onClick={handleSaveReport}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 whitespace-nowrap"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            {savingReport ? 'Saving...' : 'Save to Reports'}
          </button>
        </div>
        </div>
      </div>

      {savedNotice && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {savedNotice}
        </div>
      )}

      {/* Signature Interactive Planetary Terrain Similarity Comparison Table */}
      <TerrainSimilarityTable
        matrix={matrix}
        loading={matrixLoading}
        selectedEarthId={earthId}
        selectedTargetId={targetId}
        onSelectPair={(newEarthId, newTargetId) => {
          setEarthId(newEarthId);
          setTargetId(newTargetId);
        }}
      />

      {/* Side-by-side Site Summary & Visual Comparison */}
      {evaluation && (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {[evaluation.earthSite, evaluation.targetSite].map((site) => (
              <div
                key={site.id}
                className="rounded-xl border border-slate-800/80 bg-[#080f23]/85 backdrop-blur-md p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-[11px] text-cyan-300">
                      {site.body} · {site.status} · {site.category}
                    </div>
                    <h2 className="font-display text-lg font-bold text-white">{site.name}</h2>
                    <div className="text-xs text-slate-400">
                      {site.latitude.toFixed(3)}°, {site.longitude.toFixed(3)}° · {site.countryOrSector}
                    </div>
                  </div>
                  <span className="font-mono text-xs text-slate-400">
                    Completeness {site.dataCompletenessPct}%
                  </span>
                </div>

                <div className="relative overflow-hidden rounded-lg border border-slate-800">
                  <SiteImage
                    src={site.imageUrl}
                    alt={site.name}
                    className="h-44 w-full object-cover"
                  />
                  <div className="bg-[#050814]/90 px-3 py-1 text-[10px] text-slate-400">
                    {site.imageAttribution}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 font-mono text-xs">
                  <div className="rounded-lg bg-slate-900/70 p-2.5">
                    <div className="text-[10px] text-slate-400">Slope</div>
                    <div className="font-semibold text-white">
                      {site.meanSlopeDeg !== null ? `${site.meanSlopeDeg}°` : 'N/A'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900/70 p-2.5">
                    <div className="text-[10px] text-slate-400">TRI</div>
                    <div className="font-semibold text-white">
                      {site.triMeanM !== null ? `${site.triMeanM} m` : 'N/A'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900/70 p-2.5">
                    <div className="text-[10px] text-slate-400">Relief</div>
                    <div className="font-semibold text-white">
                      {site.reliefM !== null ? `${site.reliefM} m` : 'N/A'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900/70 p-2.5">
                    <div className="text-[10px] text-slate-400">Temp Min</div>
                    <div className="font-semibold text-white">
                      {site.tempMinC !== null ? `${site.tempMinC}°C` : 'N/A'}
                    </div>
                  </div>
                </div>

                <p className="text-xs leading-relaxed text-slate-300">{site.geologySummary}</p>
              </div>
            ))}
          </div>

          {/* 3D Terrain Mesh Comparison (using processed calibration / uploaded DEMs) */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {earthDem?.summaryStats && (
              <div className="space-y-3">
                <TerrainMesh3D
                  stats={earthDem.summaryStats}
                  title={`Earth DEM: ${earthDem.filename}`}
                  heightClass="h-[300px]"
                />
                <CrossSectionProfileChart
                  grid={earthDem.summaryStats.previewGrid}
                  title={`Earth Elevation Transect (${earthDem.filename})`}
                />
              </div>
            )}
            {planetaryDem?.summaryStats && (
              <div className="space-y-3">
                <TerrainMesh3D
                  stats={planetaryDem.summaryStats}
                  title={`Planetary DEM: ${planetaryDem.filename}`}
                  heightClass="h-[300px]"
                />
                <CrossSectionProfileChart
                  grid={planetaryDem.summaryStats.previewGrid}
                  title={`Planetary Elevation Transect (${planetaryDem.filename})`}
                />
              </div>
            )}
          </div>

          {/* Feature-Level Explainability & Radar Profile */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/85 backdrop-blur-md p-5 lg:col-span-7">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="font-display text-base font-semibold text-white">
                    Weighted Similarity Breakdown
                  </h3>
                  <p className="text-xs text-slate-400">
                    {loading ? 'Recalculating...' : evaluation.explanation}
                  </p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-2xl font-bold text-cyan-300">
                    {evaluation.overallScore.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Confidence {evaluation.confidencePct}%
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {evaluation.featureContributions.map((fc) => (
                  <div
                    key={fc.feature}
                    className="rounded-lg border border-slate-800/70 bg-slate-900/50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-100">
                        {fc.feature}{' '}
                        <span className="font-mono text-[11px] text-slate-400">
                          (weight {fc.weightPct}%)
                        </span>
                      </span>
                      <span className="font-mono font-semibold text-cyan-300">
                        {fc.available ? `${fc.contributionScore.toFixed(1)}%` : 'Missing'}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-400"
                        style={{ width: `${fc.available ? fc.contributionScore : 0}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex flex-wrap justify-between gap-2 font-mono text-[11px] text-slate-400">
                      <span>Earth: {fc.earthValue}</span>
                      <span>
                        {evaluation.targetSite.body}: {fc.targetValue}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">{fc.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5 lg:col-span-5">
              <RadarFeatureChart contributions={evaluation.featureContributions} />

              {/* Mandatory Physical Limitations Card */}
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-2.5 text-xs">
                <div className="flex items-center gap-2 font-display text-sm font-semibold text-amber-200">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Analogue Limitations &amp; Datum Warning
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Terrestrial analogues replicate only partial environmental or morphological traits
                  and are never physical replacements for lunar or Martian conditions.
                </p>
                <ul className="space-y-1.5 text-slate-300">
                  <li>
                    <span className="font-semibold text-slate-100">Gravity:</span>{' '}
                    {evaluation.earthSite.limitations.gravityRatio}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">Atmosphere:</span>{' '}
                    {evaluation.earthSite.limitations.atmosphereNote}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">Radiation:</span>{' '}
                    {evaluation.earthSite.limitations.radiationNote}
                  </li>
                  <li>
                    <span className="font-semibold text-slate-100">Datum Discipline:</span> Raw
                    elevations are not compared across Earth EGM96, Moon LOLA, and Mars MOLA
                    datums; local relief span and slope distributions are used instead.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
