import { useState } from 'react';
import type {
  FeatureContribution,
  HistogramBin,
  HypsometricPoint,
} from '../types/astraa.ts';

export const SLOPE_CATEGORY_COLORS: Array<{
  min: number;
  max: number;
  hex: string;
  barClass: string;
  descriptor: string;
}> = [
  { min: 0, max: 2, hex: '#0284c7', barClass: 'bg-sky-500', descriptor: 'Level Plains' },
  { min: 2, max: 5, hex: '#06b6d4', barClass: 'bg-cyan-400', descriptor: 'Gentle Apron' },
  { min: 5, max: 10, hex: '#14b8a6', barClass: 'bg-teal-400', descriptor: 'Moderate Undulation' },
  { min: 10, max: 15, hex: '#10b981', barClass: 'bg-emerald-400', descriptor: 'Rolling Slopes' },
  { min: 15, max: 25, hex: '#84cc16', barClass: 'bg-lime-400', descriptor: 'Steep Flanks' },
  { min: 25, max: 35, hex: '#eab308', barClass: 'bg-amber-400', descriptor: 'Crater Wall' },
  { min: 35, max: 45, hex: '#f97316', barClass: 'bg-orange-500', descriptor: 'Angle of Repose' },
  { min: 45, max: 90, hex: '#ef4444', barClass: 'bg-rose-500', descriptor: 'Cliff / Escarpment' },
];

export function getSlopeCategoryStyle(minDeg: number) {
  return (
    SLOPE_CATEGORY_COLORS.find((c) => minDeg >= c.min && minDeg < c.max) ??
    SLOPE_CATEGORY_COLORS[SLOPE_CATEGORY_COLORS.length - 1]
  );
}

export function ElevationHistogramChart({
  bins,
  meanElevationM,
  title = 'Elevation Distribution',
}: {
  bins: HistogramBin[];
  meanElevationM?: number;
  title?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!bins || bins.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800/80 bg-[#080f22] text-xs text-slate-400">
        No elevation grid processed for histogram.
      </div>
    );
  }

  const maxPct = Math.max(...bins.map((b) => b.pct), 1);
  const yCeiling = Math.ceil(maxPct / 5) * 5 || 10;
  const globalMin = bins[0].min;
  const globalMax = bins[bins.length - 1].max;
  const elevSpan = Math.max(1e-6, globalMax - globalMin);
  const meanPctAlongX =
    typeof meanElevationM === 'number' && Number.isFinite(meanElevationM)
      ? Math.max(0, Math.min(100, ((meanElevationM - globalMin) / elevSpan) * 100))
      : null;

  const activeBin = hoveredIdx !== null ? bins[hoveredIdx] ?? null : null;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
          <p className="text-[11px] text-slate-400">
            Cell elevation frequency across {bins.length} equal-width bins
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tabular-nums">
          <span className="rounded border border-slate-800 bg-slate-900/90 px-2 py-0.5 text-slate-300">
            Min {globalMin.toFixed(1)} m
          </span>
          {typeof meanElevationM === 'number' && (
            <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
              Mean {meanElevationM.toFixed(1)} m
            </span>
          )}
          <span className="rounded border border-slate-800 bg-slate-900/90 px-2 py-0.5 text-slate-300">
            Max {globalMax.toFixed(1)} m
          </span>
        </div>
      </div>

      {/* Hover Status Readout */}
      <div className="flex min-h-[26px] items-center justify-between rounded-lg border border-slate-800/80 bg-[#050916] px-3 py-1 font-mono text-[11px] tabular-nums">
        {activeBin ? (
          <>
            <span className="text-cyan-300 font-semibold">
              Bin: {activeBin.min.toFixed(1)} to {activeBin.max.toFixed(1)} m
            </span>
            <span className="text-slate-200">
              {activeBin.pct.toFixed(1)}% ({activeBin.count.toLocaleString()} cells)
            </span>
          </>
        ) : (
          <span className="text-slate-500">Hover or tap any elevation bar for bin boundaries &amp; count</span>
        )}
      </div>

      {/* Chart Area with Y-axis + Plot + Mean Marker */}
      <div className="flex gap-2">
        {/* Y-Axis Ticks */}
        <div className="flex h-44 flex-col justify-between pb-6 pr-1 text-right font-mono text-[10px] text-slate-500 tabular-nums select-none">
          <span>{yCeiling}%</span>
          <span>{Math.round(yCeiling * 0.5)}%</span>
          <span>0%</span>
        </div>

        {/* Bars Plot */}
        <div className="relative flex-1">
          <div className="relative h-[152px] border-b border-l border-slate-700/80 bg-[#050916]/60 px-1.5 pt-2">
            {/* Horizontal Gridlines */}
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-slate-800/80" />
            <div className="pointer-events-none absolute inset-x-0 top-2 border-t border-dashed border-slate-800/50" />

            {/* Mean Elevation Reference Line */}
            {meanPctAlongX !== null && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-amber-400/85"
                style={{ left: `${meanPctAlongX}%` }}
                title={`Mean Elevation: ${meanElevationM?.toFixed(1)} m`}
              >
                <span className="absolute top-1 left-1 rounded bg-[#050916]/90 px-1 font-mono text-[9px] text-amber-300 whitespace-nowrap">
                  μ
                </span>
              </div>
            )}

            <div className="relative z-0 flex h-full items-end gap-1.5">
              {bins.map((bin, idx) => {
                const hPct = bin.pct > 0 ? Math.max(4, (bin.pct / yCeiling) * 100) : 0;
                const isHovered = hoveredIdx === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
                    onFocus={() => setHoveredIdx(idx)}
                    onBlur={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
                    onClick={() => setHoveredIdx((prev) => (prev === idx ? null : idx))}
                    aria-label={`${bin.label}: ${bin.pct.toFixed(1)}% (${bin.count} cells)`}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end focus-visible:outline-none"
                  >
                    <span
                      className={`mb-1 font-mono text-[9px] tabular-nums transition-opacity ${
                        isHovered ? 'text-white opacity-100' : 'text-slate-400 opacity-80'
                      }`}
                    >
                      {bin.pct.toFixed(1)}%
                    </span>
                    <div
                      className={`w-full rounded-t transition-all duration-150 ${
                        isHovered
                          ? 'bg-gradient-to-t from-cyan-400 to-white ring-1 ring-cyan-200'
                          : 'bg-gradient-to-t from-cyan-700/85 to-cyan-400/90 hover:from-cyan-500 hover:to-cyan-200'
                      }`}
                      style={{ height: `${Math.min(92, hPct)}%` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bin Boundary Lower Labels */}
          <div className="mt-1.5 flex gap-1.5 px-1.5">
            {bins.map((bin, idx) => (
              <div
                key={idx}
                className="flex-1 text-center font-mono text-[9.5px] text-slate-400 truncate tabular-nums"
                title={bin.label}
              >
                {Math.round(bin.min)}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-0.5">
        <span>Y-Axis: Share of Cells (%)</span>
        <span>X-Axis: Elevation Bin Lower Bound (m) · Upper Bound {Math.round(globalMax)} m</span>
      </div>
    </div>
  );
}

export function SlopeDistributionChart({
  bins,
  title = 'Slope Angle Distribution (Horn 3×3)',
}: {
  bins: HistogramBin[];
  title?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!bins || bins.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800/80 bg-[#080f22] text-xs text-slate-400">
        No slope distribution computed.
      </div>
    );
  }

  const maxPct = Math.max(...bins.map((b) => b.pct), 1);
  const activeBin = hoveredIdx !== null ? bins[hoveredIdx] ?? null : null;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
          <p className="text-[11px] text-slate-400">
            8 standardized slope classes (0–90°) using a 3×3 finite-difference Horn kernel
          </p>
        </div>
        <span className="font-mono text-[11px] text-cyan-300">Share (%)</span>
      </div>

      {/* Interactive Tooltip Bar */}
      <div className="flex min-h-[26px] items-center justify-between rounded-lg border border-slate-800/80 bg-[#050916] px-3 py-1 font-mono text-[11px] tabular-nums">
        {activeBin ? (
          <>
            <span className="text-slate-100 font-semibold">
              {activeBin.label} ({getSlopeCategoryStyle(activeBin.min).descriptor})
            </span>
            <span className="text-cyan-300">
              {activeBin.pct.toFixed(1)}% · {activeBin.count.toLocaleString()} cells
            </span>
          </>
        ) : (
          <span className="text-slate-500">Hover or select any slope category for cell count</span>
        )}
      </div>

      <div className="space-y-2">
        {bins.map((bin, idx) => {
          const style = getSlopeCategoryStyle(bin.min);
          const isHovered = hoveredIdx === idx;
          const widthPct = bin.pct > 0 ? Math.max(2.5, (bin.pct / maxPct) * 100) : 0;
          return (
            <button
              key={idx}
              type="button"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
              onClick={() => setHoveredIdx((prev) => (prev === idx ? null : idx))}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 ${
                isHovered ? 'bg-slate-800/70' : 'hover:bg-slate-900/70'
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: style.hex }}
                aria-hidden="true"
              />
              <span className="w-14 shrink-0 font-mono text-[11px] font-semibold text-slate-200 tabular-nums">
                {bin.label}
              </span>
              <span className="hidden sm:inline w-28 shrink-0 text-[10px] text-slate-400 truncate">
                {style.descriptor}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-slate-900/95">
                <div
                  className="h-full rounded-sm transition-all duration-200"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: style.hex,
                    opacity: isHovered ? 1 : 0.88,
                  }}
                />
              </div>
              <span className="w-12 shrink-0 text-right font-mono text-[11px] font-semibold text-slate-200 tabular-nums">
                {bin.pct.toFixed(1)}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function HypsometricCurveChart({
  points,
  integral,
  title = 'Hypsometric Curve',
}: {
  points: HypsometricPoint[];
  integral: number;
  title?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!points || points.length === 0) return null;

  const w = 420;
  const h = 215;
  const padL = 46;
  const padR = 18;
  const padT = 18;
  const padB = 38;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const toX = (areaPct: number) => padL + (areaPct / 100) * plotW;
  const toY = (elevPct: number) => padT + (1 - elevPct / 100) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.relativeAreaPct).toFixed(1)} ${toY(p.relativeElevationPct).toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${toX(100).toFixed(1)} ${toY(0).toFixed(1)} L ${toX(0).toFixed(1)} ${toY(0).toFixed(1)} Z`;
  const activePt = hoveredIdx !== null ? points[hoveredIdx] ?? null : null;

  const summitElev = points[0]?.elevationM;
  const basinElev = points[points.length - 1]?.elevationM;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
          <p className="text-[11px] text-slate-400">
            Normalized elevation vs. cumulative basin area
          </p>
        </div>
        <div className="rounded border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-cyan-300 tabular-nums">
          HI = {integral.toFixed(3)}
        </div>
      </div>

      {/* Hover / Reference Telemetry Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-[#050916] px-3 py-1 font-mono text-[11px] tabular-nums">
        {activePt ? (
          <>
            <span className="text-cyan-300 font-semibold">
              Area {activePt.relativeAreaPct}% · Rel. Height {activePt.relativeElevationPct.toFixed(1)}%
            </span>
            <span className="text-slate-200">Elevation: {activePt.elevationM.toFixed(1)} m</span>
          </>
        ) : (
          <>
            <span className="text-slate-400">Summit: {summitElev?.toFixed(1)} m</span>
            <span className="text-slate-400">Basin: {basinElev?.toFixed(1)} m</span>
          </>
        )}
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-52 select-none">
        <defs>
          <linearGradient id="hypsoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Plot Frame */}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="#040814" stroke="#1e293b" />

        {/* Horizontal & Vertical Gridlines + Ticks */}
        {[0, 25, 50, 75, 100].map((val) => {
          const y = toY(val);
          const x = toX(val);
          return (
            <g key={val}>
              <line x1={padL} x2={padL + plotW} y1={y} y2={y} stroke="#162138" strokeWidth="1" />
              <text
                x={padL - 7}
                y={y + 3}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {val}%
              </text>
              <line x1={x} x2={x} y1={padT} y2={padT + plotH} stroke="#162138" strokeWidth="1" />
              <text
                x={x}
                y={padT + plotH + 14}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9.5"
                fontFamily="JetBrains Mono, monospace"
              >
                {val}%
              </text>
            </g>
          );
        })}

        {/* Neutral Equilibrium Diagonal Reference (HI = 0.50) */}
        <line
          x1={toX(0)}
          y1={toY(100)}
          x2={toX(100)}
          y2={toY(0)}
          stroke="#475569"
          strokeWidth="1"
          strokeDasharray="4 4"
        />

        {/* Axes */}
        <line x1={padL} x2={padL} y1={padT} y2={padT + plotH} stroke="#64748b" strokeWidth="1.2" />
        <line
          x1={padL}
          x2={padL + plotW}
          y1={padT + plotH}
          y2={padT + plotH}
          stroke="#64748b"
          strokeWidth="1.2"
        />

        {/* Hypsometric Area & Curve */}
        <path d={areaD} fill="url(#hypsoFill)" />
        <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="2.4" />

        {/* Interactive Crosshair */}
        {activePt && (
          <g pointerEvents="none">
            <line
              x1={toX(activePt.relativeAreaPct)}
              x2={toX(activePt.relativeAreaPct)}
              y1={padT}
              y2={padT + plotH}
              stroke="#38bdf8"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <line
              x1={padL}
              x2={padL + plotW}
              y1={toY(activePt.relativeElevationPct)}
              y2={toY(activePt.relativeElevationPct)}
              stroke="#38bdf8"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          </g>
        )}

        {/* Curve Sample Points */}
        {points.map((p, idx) => {
          const x = toX(p.relativeAreaPct);
          const y = toY(p.relativeElevationPct);
          const isActive = hoveredIdx === idx;
          return (
            <g
              key={idx}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
              onClick={() => setHoveredIdx((prev) => (prev === idx ? null : idx))}
            >
              <circle cx={x} cy={y} r="10" fill="transparent" />
              <circle
                cx={x}
                cy={y}
                r={isActive ? '5' : '3.1'}
                fill={isActive ? '#ffffff' : '#e0f2fe'}
                stroke="#0ea5e9"
                strokeWidth={isActive ? '2' : '1.2'}
              />
            </g>
          );
        })}

        {/* Axis Titles */}
        <text
          x={padL + plotW / 2}
          y={h - 6}
          textAnchor="middle"
          fill="#cbd5e1"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          Cumulative Area (%) · 0% Summit → 100% Basin
        </text>
        <text
          x={13}
          y={padT + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 13 ${padT + plotH / 2})`}
          fill="#cbd5e1"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          Normalized Elev. (%)
        </text>
      </svg>
    </div>
  );
}

export function CrossSectionProfileChart({
  grid,
  title = 'Transect Elevation Profile (Mid-Latitude)',
}: {
  grid: number[][];
  title?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!grid || grid.length === 0) return null;
  const midRow = grid[Math.floor(grid.length / 2)] ?? [];
  if (midRow.length < 2) return null;

  const min = Math.min(...midRow);
  const max = Math.max(...midRow);
  const span = Math.max(1, max - min);
  const w = 420;
  const h = 175;
  const padL = 48;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const pw = w - padL - padR;
  const ph = h - padT - padB;

  const toX = (i: number) => padL + (i / (midRow.length - 1)) * pw;
  const toY = (v: number) => padT + (1 - (v - min) / span) * ph;

  const pts = midRow
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(v).toFixed(1)}`)
    .join(' ');
  const areaPts = `${pts} L ${toX(midRow.length - 1).toFixed(1)} ${(padT + ph).toFixed(1)} L ${toX(0).toFixed(1)} ${(padT + ph).toFixed(1)} Z`;

  const activeVal = hoveredIdx !== null ? midRow[hoveredIdx] : null;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
        <span className="font-mono text-[11px] text-cyan-300 tabular-nums">
          {activeVal !== null && hoveredIdx !== null
            ? `Col ${hoveredIdx + 1}/${midRow.length}: ${activeVal.toFixed(1)} m`
            : `${Math.round(min)}–${Math.round(max)} m`}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40 select-none">
        <defs>
          <linearGradient id="transectFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect x={padL} y={padT} width={pw} height={ph} fill="#040814" stroke="#1e293b" />
        {[0, 0.5, 1].map((t, i) => {
          const y = padT + t * ph;
          const elevVal = max - t * span;
          return (
            <g key={i}>
              <line x1={padL} x2={padL + pw} y1={y} y2={y} stroke="#162138" strokeDasharray="3 3" />
              <text
                x={padL - 6}
                y={y + 3}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="9"
                fontFamily="JetBrains Mono, monospace"
              >
                {Math.round(elevVal)}m
              </text>
            </g>
          );
        })}
        <path d={areaPts} fill="url(#transectFill)" />
        <path d={pts} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
        {hoveredIdx !== null && activeVal !== null && (
          <g pointerEvents="none">
            <line
              x1={toX(hoveredIdx)}
              x2={toX(hoveredIdx)}
              y1={padT}
              y2={padT + ph}
              stroke="#e0f2fe"
              strokeDasharray="2 2"
            />
            <circle cx={toX(hoveredIdx)} cy={toY(activeVal)} r="4" fill="#ffffff" stroke="#0ea5e9" strokeWidth="1.5" />
          </g>
        )}
        {/* Transparent column hover strips */}
        {midRow.map((_, idx) => {
          const colW = pw / midRow.length;
          return (
            <rect
              key={idx}
              x={toX(idx) - colW / 2}
              y={padT}
              width={Math.max(4, colW)}
              height={ph}
              fill="transparent"
              className="cursor-crosshair"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx((prev) => (prev === idx ? null : prev))}
            />
          );
        })}
        <text x={padL} y={h - 6} fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace">
          West Edge
        </text>
        <text x={padL + pw / 2} y={h - 6} textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="JetBrains Mono, monospace">
          Mid-Row Cross Section ({midRow.length} samples)
        </text>
        <text x={padL + pw} y={h - 6} textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="JetBrains Mono, monospace">
          East Edge
        </text>
      </svg>
    </div>
  );
}

export function RadarFeatureChart({
  contributions,
  title = 'Multi-Parameter Similarity Profile',
}: {
  contributions: FeatureContribution[];
  title?: string;
}) {
  const n = contributions.length;
  if (n < 3) return null;
  const cx = 135;
  const cy = 120;
  const radius = 80;

  const getPoint = (idx: number, frac: number) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * radius * frac,
      y: cy + Math.sin(angle) * radius * frac,
    };
  };

  const polyPoints = contributions
    .map((c, idx) => {
      const p = getPoint(idx, (c.available ? c.contributionScore : 0) / 100);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
        <span className="font-mono text-[11px] text-slate-400">0–100% Fit</span>
      </div>
      <svg viewBox="0 0 270 240" className="mx-auto w-full max-w-[270px] h-56">
        {[0.25, 0.5, 0.75, 1].map((ring, rIdx) => {
          const pts = contributions
            .map((_, idx) => {
              const p = getPoint(idx, ring);
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
            })
            .join(' ');
          return (
            <polygon
              key={rIdx}
              points={pts}
              fill="none"
              stroke="#1e293b"
              strokeWidth="1"
            />
          );
        })}
        {contributions.map((_, idx) => {
          const p = getPoint(idx, 1);
          return <line key={idx} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#1e293b" strokeWidth="1" />;
        })}
        <polygon
          points={polyPoints}
          fill="rgba(34, 211, 238, 0.22)"
          stroke="#22d3ee"
          strokeWidth="2"
        />
        {contributions.map((c, idx) => {
          const p = getPoint(idx, 1.2);
          const shortName = c.feature
            .replace('Mean Surface ', '')
            .replace('Terrain ', '')
            .replace('Relative ', '')
            .replace('Thermal Envelope (Cold Extremes)', 'Thermal')
            .replace('Water / Ice Indicator', 'Water/Ice')
            .replace('Geology & Mineralogy Class', 'Mineralogy');
          return (
            <text
              key={idx}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={c.available ? '#cbd5e1' : '#64748b'}
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              {shortName}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
