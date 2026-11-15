import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FilePlus2, RotateCcw, SlidersHorizontal } from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import SiteImage from '../components/SiteImage.tsx';
import type {
  AnalogSite,
  SimilarityEvaluation,
  SimilarityWeights,
} from '../types/astraa.ts';

interface AnalogFinderViewProps {
  sites: AnalogSite[];
  weights: SimilarityWeights;
  onChangeWeights: (w: SimilarityWeights) => void;
  onResetWeights: () => void;
  onCreateReportFromComparison: (evaluation: SimilarityEvaluation) => Promise<void>;
}

const CATEGORIES = [
  'All',
  'Desert',
  'Polar',
  'Volcanic',
  'Impact Crater',
  'Canyon / Valley',
  'Evaporite Basin',
  'High-Altitude Arid',
];

export default function AnalogFinderView({
  sites,
  weights,
  onChangeWeights,
  onResetWeights,
  onCreateReportFromComparison,
}: AnalogFinderViewProps) {
  const targetSites = useMemo(() => sites.filter((s) => s.body !== 'Earth'), [sites]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('mars-jezero');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Established Reference' | 'Candidate Region'>('All');
  const [ranked, setRanked] = useState<SimilarityEvaluation[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch('/api/similarity/rank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetId: selectedTargetId,
        weights,
        category: categoryFilter,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && Array.isArray(data.results)) {
          setRanked(data.results);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTargetId, weights, categoryFilter]);

  const filteredRanked = useMemo(() => {
    if (statusFilter === 'All') return ranked;
    return ranked.filter((r) => r.earthSite.status === statusFilter);
  }, [ranked, statusFilter]);

  const updateWeight = (key: keyof SimilarityWeights, value: number) => {
    onChangeWeights({ ...weights, [key]: value });
  };

  const handleSave = async (ev: SimilarityEvaluation) => {
    setSavingId(ev.earthSite.id);
    try {
      await onCreateReportFromComparison(ev);
    } finally {
      setSavingId(null);
    }
  };

  const categoryBackdrop =
    categoryFilter === 'Polar'
      ? '/assets/landscapes/antarctic_dry_valleys.webp'
      : categoryFilter === 'Volcanic'
        ? '/assets/geological/volcanic_iceland_basalt.webp'
        : categoryFilter === 'Impact Crater'
          ? '/assets/geological/impact_crater_basalt.webp'
          : categoryFilter === 'High-Altitude Arid' || categoryFilter === 'Canyon / Valley'
            ? '/assets/earth/ladakh_valley.webp'
            : '/assets/landscapes/atacama_hyperarid_basin.webp';

  return (
    <div className="space-y-6">
      {/* Header & Target Controls with Terrestrial Analog Panorama */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23] p-5">
        <CinematicBackdrop
          src={categoryBackdrop}
          alt="Terrestrial analogue geological landscape"
          eager
          opacityClass="opacity-42"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/60"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl">
            <h1 className="font-display text-xl font-bold text-white">Earth Analog Finder</h1>
            <p className="mt-1 text-xs text-slate-300">
              Rank established references (Atacama, Haughton, Death Valley) and candidate regions
              (Ladakh, Spiti Valley, Rann of Kutch, Lonar Crater, Dry Valleys, Iceland) using
              configurable weights and transparent uncertainty indicators.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Target Moon / Mars Region
              </label>
              <select
                value={selectedTargetId}
                onChange={(e) => setSelectedTargetId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                {targetSites.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.body}] {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Terrain Category</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Classification</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                <option value="All">All Earth Regions</option>
                <option value="Established Reference">Established References</option>
                <option value="Candidate Region">Candidate Regions</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Configurable Weights (4 cols) + Ranked Results (8 cols) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Configurable Weight Sliders */}
        <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/85 backdrop-blur-md p-5 lg:col-span-4 space-y-4 h-fit">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
              <h2 className="font-display text-sm font-semibold text-white">
                Configurable Similarity Weights
              </h2>
            </div>
            <button
              type="button"
              onClick={onResetWeights}
              className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Weights are researcher-configured preferences, not universal constants. Totals normalize
            automatically over available non-missing variables.
          </p>

          {(
            [
              ['slope', 'Mean Surface Slope (°)'],
              ['ruggedness', 'Terrain Ruggedness (TRI)'],
              ['relief', 'Relative Relief Span (m)'],
              ['thermal', 'Thermal Cold Extremes (°C)'],
              ['waterIce', 'Water / Ice Indicator'],
              ['mineralogy', 'Geology & Mineralogy Class'],
            ] as [keyof SimilarityWeights, string][]
          ).map(([key, label]) => (
            <div key={key} className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-slate-200">{label}</span>
                <span className="font-mono font-semibold text-cyan-300">{weights[key]}</span>
              </div>
              <input
                type="range"
                min="0"
                max="50"
                step="5"
                value={weights[key]}
                onChange={(e) => updateWeight(key, Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          ))}
        </div>

        {/* Right: Ranked Earth Analog Candidates */}
        <div className="space-y-4 lg:col-span-8">
          {loading && (
            <div className="rounded-xl border border-slate-800 bg-[#080f23] p-4 text-xs text-slate-400">
              Computing weighted cross-planet rankings...
            </div>
          )}

          {filteredRanked.map((item, idx) => {
            const isExpanded = expandedId === item.earthSite.id;
            return (
              <div
                key={item.earthSite.id}
                className="rounded-xl border border-slate-800/80 bg-[#080f23]/85 backdrop-blur-md p-5 transition-colors hover:border-slate-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 max-w-xl">
                    <div className="hidden sm:block h-16 w-24 shrink-0 overflow-hidden rounded-lg border border-slate-700/70">
                      <SiteImage
                        src={item.earthSite.imageUrl}
                        alt={item.earthSite.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                        <span className="text-cyan-300 font-semibold">Rank #{idx + 1}</span>
                        <span className="text-slate-600">·</span>
                        <span
                          className={
                            item.earthSite.status === 'Established Reference'
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                          }
                        >
                          {item.earthSite.status}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="text-slate-400">{item.earthSite.category}</span>
                      </div>
                      <h3 className="font-display text-base font-bold text-white">
                        {item.earthSite.name}
                      </h3>
                      <p className="text-xs text-slate-400">
                        {item.earthSite.region} ({item.earthSite.countryOrSector}) ·{' '}
                        {item.earthSite.latitude.toFixed(2)}°, {item.earthSite.longitude.toFixed(2)}°
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-2xl font-bold text-cyan-300">
                      {item.overallScore.toFixed(1)}%
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Data Confidence: {item.confidencePct}%
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-900">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                    style={{ width: `${item.overallScore}%` }}
                  />
                </div>

                {/* Explanation & Missing Data */}
                <p className="mt-3 text-xs leading-relaxed text-slate-300">{item.explanation}</p>

                {item.missingVariables.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Missing variables excluded from score: {item.missingVariables.join(', ')}
                    </span>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : item.earthSite.id)
                    }
                    className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
                  >
                    {isExpanded ? 'Hide Feature Breakdown & Limitations ▲' : 'Inspect Feature Breakdown & Limitations ▼'}
                  </button>

                  <button
                    type="button"
                    disabled={savingId === item.earthSite.id}
                    onClick={() => handleSave(item)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500/50 hover:text-cyan-200"
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    {savingId === item.earthSite.id ? 'Saving...' : 'Save to Report'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {item.featureContributions.map((fc) => (
                        <div
                          key={fc.feature}
                          className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-slate-200">{fc.feature}</span>
                            <span className="font-mono text-cyan-300">
                              {fc.available ? `${fc.contributionScore.toFixed(1)}%` : 'N/A'}
                            </span>
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-slate-400">
                            Earth: {fc.earthValue} · {item.targetSite.body}: {fc.targetValue}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5 font-semibold text-amber-200">
                        <CheckCircle2 className="h-3.5 w-3.5 text-amber-400" />
                        Analogue Limitations (Non-Replicable Planetary Conditions)
                      </div>
                      <p className="mt-1">{item.limitationsSummary}</p>
                      <p className="mt-1 text-slate-400">
                        Weathering caveat: {item.earthSite.limitations.weatheringCaveat}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
