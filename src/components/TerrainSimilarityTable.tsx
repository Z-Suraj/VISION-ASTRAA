import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Download,
  FlaskConical,
  Info,
  Layers,
  Search,
  Sparkles,
} from 'lucide-react';
import type {
  PlanetaryBody,
  SimilarityMatrixResponse,
  SimilarityMatrixRow,
  SiteStatus,
} from '../types/astraa.ts';

interface TerrainSimilarityTableProps {
  matrix: SimilarityMatrixResponse | null;
  loading: boolean;
  selectedEarthId: string;
  selectedTargetId: string;
  onSelectPair: (earthSiteId: string, targetId: string) => void;
}

type SortKey =
  | 'earthShortName'
  | 'targetBody'
  | 'targetShortName'
  | 'meanSlopeSim'
  | 'triSim'
  | 'elevationSim'
  | 'geomorphologicalSim'
  | 'environmentalSim'
  | 'overallSimilarityPct'
  | 'confidencePct'
  | 'analysisStatus';

type ViewScope = 'demo' | 'all' | 'dem';

function ScoreBarCell({
  value,
  sublabel,
}: {
  value: number | null;
  sublabel?: string;
}) {
  if (value === null) {
    return (
      <div className="min-w-[88px]">
        <span className="font-mono text-[11px] text-slate-500">Unavailable</span>
      </div>
    );
  }

  const barColor =
    value >= 80
      ? 'bg-emerald-400'
      : value >= 65
        ? 'bg-cyan-400'
        : value >= 45
          ? 'bg-amber-400'
          : 'bg-rose-400';

  const textColor =
    value >= 80
      ? 'text-emerald-300'
      : value >= 65
        ? 'text-cyan-300'
        : value >= 45
          ? 'text-amber-300'
          : 'text-rose-300';

  return (
    <div className="min-w-[92px] space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`font-mono text-xs font-semibold tabular-nums ${textColor}`}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-slate-800/90">
        <div
          className={`h-full rounded-sm transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.max(4, Math.min(100, value))}%` }}
        />
      </div>
      {sublabel && (
        <div className="truncate font-mono text-[10px] text-slate-400" title={sublabel}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  sub,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'left',
}: {
  label: string;
  sub?: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const isActive = activeKey === sortKey;
  return (
    <th
      scope="col"
      className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-300 select-none ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex items-center gap-1 hover:text-cyan-300 transition-colors ${
          align === 'right' ? 'flex-row-reverse' : ''
        }`}
      >
        <span>
          <span className="block leading-tight">{label}</span>
          {sub && (
            <span className="block font-mono text-[9px] font-normal normal-case tracking-normal text-slate-500">
              {sub}
            </span>
          )}
        </span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp className="h-3 w-3 shrink-0 text-cyan-400" />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0 text-cyan-400" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 text-slate-600 group-hover:text-slate-400" />
        )}
      </button>
    </th>
  );
}

export default function TerrainSimilarityTable({
  matrix,
  loading,
  selectedEarthId,
  selectedTargetId,
  onSelectPair,
}: TerrainSimilarityTableProps) {
  const [scope, setScope] = useState<ViewScope>('demo');
  const [planetFilter, setPlanetFilter] = useState<'All' | 'Mars' | 'Moon'>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | SiteStatus>('All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('overallSimilarityPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir(
        key === 'earthShortName' || key === 'targetShortName' || key === 'targetBody'
          ? 'asc'
          : 'desc'
      );
    }
  };

  const filteredRows = useMemo(() => {
    if (!matrix) return [];
    const q = search.trim().toLowerCase();

    return matrix.rows
      .filter((row) => {
        if (scope === 'demo' && row.analysisStatus !== 'DEMONSTRATION / SIMULATED') return false;
        if (
          scope === 'dem' &&
          row.analysisStatus !== 'DEM-Grounded (Measured)' &&
          row.analysisStatus !== 'Partial DEM + Baseline'
        ) {
          return false;
        }
        if (planetFilter !== 'All' && row.targetBody !== planetFilter) return false;
        if (statusFilter !== 'All' && row.earthStatus !== statusFilter) return false;
        if (q) {
          const hay = `${row.earthSiteName} ${row.targetName} ${row.targetBody} ${row.earthCategory} ${row.targetCategory} ${row.analysisStatus}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        const valA = a[sortKey];
        const valB = b[sortKey];

        if (valA === null && valB === null) return 0;
        if (valA === null) return 1;
        if (valB === null) return -1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return (valA - valB) * dir;
        }
        return String(valA).localeCompare(String(valB)) * dir;
      });
  }, [matrix, scope, planetFilter, statusFilter, search, sortKey, sortDir]);

  const summary = useMemo(() => {
    if (filteredRows.length === 0) {
      return {
        topMatch: null as SimilarityMatrixRow | null,
        avgOverall: 0,
        avgConfidence: 0,
        demoShown: 0,
      };
    }
    const sortedByOverall = [...filteredRows].sort(
      (a, b) => b.overallSimilarityPct - a.overallSimilarityPct
    );
    const avgOverall =
      filteredRows.reduce((acc, r) => acc + r.overallSimilarityPct, 0) / filteredRows.length;
    const avgConfidence =
      filteredRows.reduce((acc, r) => acc + r.confidencePct, 0) / filteredRows.length;
    const demoShown = filteredRows.filter(
      (r) => r.analysisStatus === 'DEMONSTRATION / SIMULATED'
    ).length;
    return {
      topMatch: sortedByOverall[0],
      avgOverall,
      avgConfidence,
      demoShown,
    };
  }, [filteredRows]);

  const handleExportCsv = () => {
    if (filteredRows.length === 0) return;
    const headers = [
      'Earth Analogue Region',
      'Earth Status',
      'Target Planet',
      'Target Region',
      'Mean Slope Similarity (%)',
      'Terrain Ruggedness TRI Similarity (%)',
      'Elevation Similarity (Relative Relief %)',
      'Geomorphological Similarity (%)',
      'Environmental Similarity (%)',
      'Overall Similarity (%)',
      'Confidence (%)',
      'Data Quality',
      'Analysis Status',
      'Datum Note',
    ];
    const escapeCsv = (v: string | number | null) => {
      const s = v === null ? 'Unavailable' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...filteredRows.map((r) =>
        [
          r.earthSiteName,
          r.earthStatus,
          r.targetBody,
          r.targetName,
          r.meanSlopeSim !== null ? r.meanSlopeSim.toFixed(1) : 'Unavailable',
          r.triSim !== null ? r.triSim.toFixed(1) : 'Unavailable',
          r.elevationSim !== null ? r.elevationSim.toFixed(1) : 'Unavailable',
          r.geomorphologicalSim.toFixed(1),
          r.environmentalSim !== null ? r.environmentalSim.toFixed(1) : 'Unavailable',
          r.overallSimilarityPct.toFixed(1),
          r.confidencePct,
          r.dataQualityLabel,
          r.analysisStatus,
          'Relative relief span normalized; raw datums not equated',
        ]
          .map(escapeCsv)
          .join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vision_astraa_terrain_similarity_${scope}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderPlanetBadge = (body: PlanetaryBody) => {
    if (body === 'Mars') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-orange-300">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          Mars
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-200">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
        Moon
      </span>
    );
  };

  const renderAnalysisStatusBadge = (row: SimilarityMatrixRow) => {
    if (row.analysisStatus === 'DEMONSTRATION / SIMULATED') {
      return (
        <span
          title="Curated demonstration pairing evaluated from published literature parameters pending co-registered orbital DEM pairs"
          className="inline-flex items-center gap-1 rounded border border-amber-400/50 bg-amber-500/15 px-2 py-1 font-mono text-[10px] font-bold tracking-wide text-amber-200 whitespace-nowrap"
        >
          <FlaskConical className="h-3 w-3 text-amber-300 shrink-0" />
          DEMONSTRATION / SIMULATED
        </span>
      );
    }
    if (row.analysisStatus === 'DEM-Grounded (Measured)') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
          DEM-Grounded (Measured)
        </span>
      );
    }
    if (row.analysisStatus === 'Partial DEM + Baseline') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-cyan-500/40 bg-cyan-500/15 px-2 py-1 font-mono text-[10px] font-semibold text-cyan-200 whitespace-nowrap">
          <Layers className="h-3 w-3 text-cyan-300 shrink-0" />
          Partial DEM + Baseline
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-violet-500/35 bg-violet-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-violet-200 whitespace-nowrap">
        <Sparkles className="h-3 w-3 text-violet-300 shrink-0" />
        Simulated Baseline
      </span>
    );
  };

  return (
    <section className="rounded-xl border border-slate-800/90 bg-[#080f23]/90 backdrop-blur-md shadow-2xl overflow-hidden">
      {/* Header Banner */}
      <div className="border-b border-slate-800/80 bg-gradient-to-r from-[#0b1633]/90 via-[#080f23]/95 to-[#0b132b]/90 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold text-white">
                Planetary Terrain Similarity Comparison Table
              </h2>
              <span className="rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-200">
                Includes Demonstration / Simulated Baselines
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Multi-factor morphometric and environmental resemblance across Earth analogues and
              Moon/Mars mission targets. Click any row to load that pair into the 3D terrain &amp;
              radar breakdown below.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={filteredRows.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-400/60 hover:text-cyan-200 disabled:opacity-40 transition-colors"
          >
            <Download className="h-3.5 w-3.5 text-cyan-400" />
            Export CSV ({filteredRows.length})
          </button>
        </div>

        {/* Summary KPI Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-slate-800/80 bg-[#050814]/70 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pairs Displayed
            </div>
            <div className="mt-0.5 font-mono text-base font-bold text-white tabular-nums">
              {filteredRows.length}
              <span className="ml-1.5 text-xs font-normal text-slate-400">
                / {matrix?.totalPairs ?? 54} total
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-[#050814]/70 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Top Match in View
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 truncate">
              <span className="font-mono text-base font-bold text-emerald-300 tabular-nums">
                {summary.topMatch ? `${summary.topMatch.overallSimilarityPct.toFixed(1)}%` : '—'}
              </span>
              <span className="truncate text-[11px] text-slate-300">
                {summary.topMatch
                  ? `${summary.topMatch.earthShortName} ↔ ${summary.topMatch.targetShortName}`
                  : 'No matches'}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-[#050814]/70 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Mean Confidence
            </div>
            <div className="mt-0.5 font-mono text-base font-bold text-cyan-300 tabular-nums">
              {filteredRows.length > 0 ? `${summary.avgConfidence.toFixed(0)}%` : '—'}
              <span className="ml-1.5 text-[11px] font-normal text-slate-400">
                (avg {summary.avgOverall.toFixed(1)}% sim)
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800/80 bg-[#050814]/70 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Data Provenance Mode
            </div>
            <div className="mt-0.5 font-mono text-xs font-semibold text-amber-200">
              {summary.demoShown} Demo · {matrix?.demGroundedCount ?? 0} Full DEM
            </div>
          </div>
        </div>

        {/* Interactive Filters */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Scope Toggle */}
            <div className="inline-flex rounded-lg border border-slate-800 bg-[#050814]/90 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setScope('demo')}
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                  scope === 'demo'
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Demonstration Showcase ({matrix?.demonstrationCount ?? 13})
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                  scope === 'all'
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Full Cross-Matrix ({matrix?.totalPairs ?? 54})
              </button>
              <button
                type="button"
                onClick={() => setScope('dem')}
                className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                  scope === 'dem'
                    ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                DEM-Involved
              </button>
            </div>

            {/* Planet Filter */}
            <div className="inline-flex rounded-lg border border-slate-800 bg-[#050814]/90 p-0.5 text-xs">
              {(['All', 'Mars', 'Moon'] as const).map((body) => (
                <button
                  key={body}
                  type="button"
                  onClick={() => setPlanetFilter(body)}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                    planetFilter === body
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {body === 'All' ? 'All Planets' : body}
                </button>
              ))}
            </div>

            {/* Earth Site Status */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'All' | SiteStatus)}
              aria-label="Filter by Earth site status"
              className="rounded-lg border border-slate-800 bg-[#050814]/90 px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Earth Regions</option>
              <option value="Established Reference">Established References Only</option>
              <option value="Candidate Region">Candidate Regions Only</option>
            </select>
          </div>

          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter Earth or Moon/Mars region..."
              className="w-full rounded-lg border border-slate-800 bg-[#050814]/90 py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Scientific Integrity & Datum Notice */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#050814]/80 px-5 py-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
          <span>
            <strong className="text-slate-200">Method &amp; Datum Discipline:</strong>{' '}
            {matrix?.datumNote ??
              'Elevation Similarity uses datum-independent relative relief span ratios (never raw EGM96 vs. LOLA/MOLA altitudes).'}{' '}
            {matrix?.simulationNotice}
          </span>
        </div>
        {loading && (
          <span className="font-mono text-[11px] text-cyan-300">Recalculating matrix...</span>
        )}
      </div>

      {/* Responsive Comparison Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-slate-800 bg-[#050814]/90">
            <tr>
              <SortHeader
                label="Earth Analogue Region"
                sub="Status & Class"
                sortKey="earthShortName"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Target Planet"
                sub="Body"
                sortKey="targetBody"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Target Region"
                sub="Landing / Study Site"
                sortKey="targetShortName"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Mean Slope"
                sub="Gradient Sim."
                sortKey="meanSlopeSim"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Ruggedness (TRI)"
                sub="Riley Index Sim."
                sortKey="triSim"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Elevation"
                sub="Rel. Relief Span"
                sortKey="elevationSim"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Geomorphology"
                sub="Lithology / Class"
                sortKey="geomorphologicalSim"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Environment"
                sub="Thermal & Ice"
                sortKey="environmentalSim"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Overall (%)"
                sub="Weighted Score"
                sortKey="overallSimilarityPct"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
                align="right"
              />
              <SortHeader
                label="Confidence"
                sub="Data Quality"
                sortKey="confidencePct"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Analysis Status"
                sub="Provenance Mode"
                sortKey="analysisStatus"
                activeKey={sortKey}
                direction={sortDir}
                onSort={handleSort}
              />
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-800/60 text-xs">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-10 text-center text-slate-400">
                  No planetary comparison pairs match the active filter selection. Try switching to{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setScope('all');
                      setPlanetFilter('All');
                      setStatusFilter('All');
                      setSearch('');
                    }}
                    className="text-cyan-300 underline hover:text-cyan-200"
                  >
                    Full Cross-Matrix
                  </button>
                  .
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const isSelected =
                  row.earthSiteId === selectedEarthId && row.targetId === selectedTargetId;

                const overallColor =
                  row.overallSimilarityPct >= 75
                    ? 'text-emerald-300'
                    : row.overallSimilarityPct >= 60
                      ? 'text-cyan-300'
                      : 'text-amber-300';

                const qualityColor =
                  row.dataQualityLabel === 'High'
                    ? 'text-emerald-300'
                    : row.dataQualityLabel === 'Good'
                      ? 'text-cyan-300'
                      : 'text-amber-300';

                return (
                  <tr
                    key={row.pairId}
                    onClick={() => onSelectPair(row.earthSiteId, row.targetId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-cyan-500/12 ring-1 ring-inset ring-cyan-400/50'
                        : 'hover:bg-slate-800/45'
                    }`}
                  >
                    {/* 1. Earth Analogue Region */}
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <div className="min-w-[160px]">
                          <div className="font-semibold text-white leading-snug flex items-center gap-1.5">
                            <span>{row.earthShortName}</span>
                            {isSelected && (
                              <span className="rounded bg-cyan-400/20 border border-cyan-400/50 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-cyan-200">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {row.earthCategory} ·{' '}
                            <span
                              className={
                                row.earthStatus === 'Candidate Region'
                                  ? 'text-violet-300'
                                  : 'text-slate-400'
                              }
                            >
                              {row.earthStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* 2. Target Planet */}
                    <td className="px-3 py-3 align-top">{renderPlanetBadge(row.targetBody)}</td>

                    {/* 3. Target Region */}
                    <td className="px-3 py-3 align-top min-w-[155px]">
                      <div className="font-semibold text-slate-100 leading-snug">
                        {row.targetShortName}
                      </div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{row.targetCategory}</div>
                    </td>

                    {/* 4. Mean Slope Similarity */}
                    <td className="px-3 py-3 align-top">
                      <ScoreBarCell
                        value={row.meanSlopeSim}
                        sublabel={`${row.earthValueSlope} vs ${row.targetValueSlope}`}
                      />
                    </td>

                    {/* 5. Terrain Ruggedness Similarity (TRI) */}
                    <td className="px-3 py-3 align-top">
                      <ScoreBarCell
                        value={row.triSim}
                        sublabel={`${row.earthValueTri} vs ${row.targetValueTri}`}
                      />
                    </td>

                    {/* 6. Elevation Similarity (Normalized Relief) */}
                    <td className="px-3 py-3 align-top">
                      <ScoreBarCell
                        value={row.elevationSim}
                        sublabel={`${row.earthValueRelief.replace(' span', '')} vs ${row.targetValueRelief.replace(' span', '')}`}
                      />
                    </td>

                    {/* 7. Geomorphological Similarity */}
                    <td className="px-3 py-3 align-top">
                      <ScoreBarCell value={row.geomorphologicalSim} />
                    </td>

                    {/* 8. Environmental Similarity */}
                    <td className="px-3 py-3 align-top">
                      <ScoreBarCell value={row.environmentalSim} />
                    </td>

                    {/* 9. Overall Similarity (%) */}
                    <td className="px-3 py-3 align-top text-right">
                      <div className={`font-mono text-sm font-bold tabular-nums ${overallColor}`}>
                        {row.overallSimilarityPct.toFixed(1)}%
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-500">
                        {6 - row.missingCount}/6 metrics
                      </div>
                    </td>

                    {/* 10. Confidence / Data Quality */}
                    <td className="px-3 py-3 align-top min-w-[110px]">
                      <div className={`font-mono text-xs font-semibold ${qualityColor}`}>
                        {row.dataQualityLabel} ({row.confidencePct}%)
                      </div>
                      <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                        {row.missingCount === 0
                          ? 'Complete vector'
                          : `${row.missingCount} var${row.missingCount > 1 ? 's' : ''} missing`}
                      </div>
                    </td>

                    {/* 11. Analysis Status */}
                    <td className="px-3 py-3 align-top">{renderAnalysisStatusBadge(row)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
