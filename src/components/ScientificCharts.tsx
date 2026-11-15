import type {
  FeatureContribution,
  HistogramBin,
  HypsometricPoint,
} from '../types/astraa.ts';

export function ElevationHistogramChart({
  bins,
  title = 'Elevation Distribution',
}: {
  bins: HistogramBin[];
  title?: string;
}) {
  if (!bins || bins.length === 0) {
    return (
      <div className="flex h-52 items-center justify-center rounded-xl border border-slate-800/80 bg-[#080f22] text-xs text-slate-400">
        No elevation grid processed for histogram.
      </div>
    );
  }
  const maxPct = Math.max(...bins.map((b) => b.pct), 1);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
        <span className="font-mono text-[11px] text-slate-400">Share of Cells (%)</span>
      </div>
      <div className="flex h-40 items-end gap-1.5 pt-2">
        {bins.map((bin, idx) => {
          const hPct = Math.max(4, (bin.pct / maxPct) * 100);
          return (
            <div key={idx} className="group relative flex flex-1 flex-col items-center justify-end h-full">
              <div
                className="w-full rounded-t bg-gradient-to-t from-cyan-600/80 to-cyan-300/90 transition-all group-hover:from-cyan-500 group-hover:to-white"
                style={{ height: `${hPct}%` }}
                title={`${bin.label}: ${bin.pct}% (${bin.count} samples)`}
              />
              <span className="mt-1.5 font-mono text-[10px] text-slate-400 truncate max-w-full">
                {Math.round(bin.min)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>Min: {bins[0].min} m</span>
        <span>Max: {bins[bins.length - 1].max} m</span>
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
  if (!bins || bins.length === 0) return null;
  const maxPct = Math.max(...bins.map((b) => b.pct), 1);

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
        <span className="font-mono text-[11px] text-slate-400">Degrees (°)</span>
      </div>
      <div className="space-y-2">
        {bins.map((bin, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <span className="w-14 shrink-0 font-mono text-[11px] text-slate-400">{bin.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-900">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400"
                style={{ width: `${(bin.pct / maxPct) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right font-mono text-[11px] text-slate-300">
              {bin.pct.toFixed(1)}%
            </span>
          </div>
        ))}
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
  if (!points || points.length === 0) return null;

  const w = 320;
  const h = 160;
  const pad = 26;
  const plotW = w - pad * 2;
  const plotH = h - pad * 2;

  const pathD = points
    .map((p, i) => {
      const x = pad + (p.relativeAreaPct / 100) * plotW;
      const y = pad + (1 - p.relativeElevationPct / 100) * plotH;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const areaD = `${pathD} L ${(pad + plotW).toFixed(1)} ${(pad + plotH).toFixed(1)} L ${pad} ${(pad + plotH).toFixed(1)} Z`;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
        <span className="font-mono text-xs text-cyan-300">HI = {integral.toFixed(3)}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
        <defs>
          <linearGradient id="hypsoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
          <line
            key={i}
            x1={pad}
            x2={pad + plotW}
            y1={pad + t * plotH}
            y2={pad + t * plotH}
            stroke="#1e293b"
            strokeWidth="1"
          />
        ))}
        {/* Axes */}
        <line x1={pad} x2={pad} y1={pad} y2={pad + plotH} stroke="#475569" strokeWidth="1" />
        <line
          x1={pad}
          x2={pad + plotW}
          y1={pad + plotH}
          y2={pad + plotH}
          stroke="#475569"
          strokeWidth="1"
        />
        <path d={areaD} fill="url(#hypsoFill)" />
        <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="2.2" />
        {points.map((p, idx) => {
          const x = pad + (p.relativeAreaPct / 100) * plotW;
          const y = pad + (1 - p.relativeElevationPct / 100) * plotH;
          return <circle key={idx} cx={x} cy={y} r="2.6" fill="#e0f2fe" />;
        })}
        <text x={pad} y={h - 6} fill="#94a3b8" fontSize="9" fontFamily="monospace">
          0% Area (Summit)
        </text>
        <text
          x={pad + plotW}
          y={h - 6}
          textAnchor="end"
          fill="#94a3b8"
          fontSize="9"
          fontFamily="monospace"
        >
          100% Area (Basin)
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
  if (!grid || grid.length === 0) return null;
  const midRow = grid[Math.floor(grid.length / 2)] ?? [];
  if (midRow.length < 2) return null;

  const min = Math.min(...midRow);
  const max = Math.max(...midRow);
  const span = Math.max(1, max - min);
  const w = 360;
  const h = 150;
  const pad = 22;
  const pw = w - pad * 2;
  const ph = h - pad * 2;

  const pts = midRow
    .map((v, i) => {
      const x = pad + (i / (midRow.length - 1)) * pw;
      const y = pad + (1 - (v - min) / span) * ph;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f22] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="font-display text-sm font-semibold text-slate-100">{title}</h4>
        <span className="font-mono text-[11px] text-slate-400">
          {Math.round(min)}–{Math.round(max)} m
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-36">
        <line x1={pad} x2={pad + pw} y1={pad + ph} y2={pad + ph} stroke="#334155" strokeWidth="1" />
        <line x1={pad} x2={pad + pw} y1={pad + ph / 2} y2={pad + ph / 2} stroke="#1e293b" strokeDasharray="3 3" />
        <path d={pts} fill="none" stroke="#38bdf8" strokeWidth="2.2" />
        <text x={pad} y={14} fill="#94a3b8" fontSize="9" fontFamily="monospace">
          Peak {Math.round(max)} m
        </text>
        <text x={pad} y={h - 4} fill="#94a3b8" fontSize="9" fontFamily="monospace">
          West Edge
        </text>
        <text x={pad + pw} y={h - 4} textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="monospace">
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
