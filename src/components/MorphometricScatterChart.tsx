import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import {
  AlertTriangle,
  Database,
  Info,
  Layers,
  Maximize2,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  AnalogSite,
  DatasetRecord,
  MorphometricClusteringResult,
  MorphometricNormalization,
  MorphometricPoint,
  PlanetaryBody,
} from '../types/astraa.ts';

interface MorphometricScatterChartProps {
  sites: AnalogSite[];
  datasets: DatasetRecord[];
}

type PlanetFilter = 'All' | PlanetaryBody;
type ColorMode = 'planet' | 'cluster';
type LabelMode = 'auto' | 'all' | 'hover';

const PLANET_META: Record<
  PlanetaryBody,
  { color: string; stroke: string; badgeBg: string; markerName: string }
> = {
  Earth: {
    color: '#34d399',
    stroke: '#065f46',
    badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    markerName: 'Circle',
  },
  Mars: {
    color: '#fb923c',
    stroke: '#9a3412',
    badgeBg: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
    markerName: 'Diamond',
  },
  Moon: {
    color: '#38bdf8',
    stroke: '#075985',
    badgeBg: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    markerName: 'Triangle',
  },
};

const CLUSTER_COLORS: Record<number, { color: string; bg: string; border: string; text: string }> = {
  1: {
    color: '#22d3ee',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/35',
    text: 'text-cyan-300',
  },
  2: {
    color: '#a78bfa',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/35',
    text: 'text-violet-300',
  },
  3: {
    color: '#fbbf24',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/35',
    text: 'text-amber-300',
  },
  4: {
    color: '#f43f5e',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/35',
    text: 'text-rose-300',
  },
};

const SVG_W = 920;
const SVG_H = 440;
const MARGIN = { top: 24, right: 28, bottom: 54, left: 74 };
const PLOT_W = SVG_W - MARGIN.left - MARGIN.right;
const PLOT_H = SVG_H - MARGIN.top - MARGIN.bottom;

interface PlacedLabel {
  id: string;
  x: number;
  y: number;
  textAnchor: 'start' | 'middle' | 'end';
  leaderX: number;
  leaderY: number;
  showLeader: boolean;
}

interface LabelBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function boxesOverlapArea(a: LabelBox, b: LabelBox): number {
  const ix = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
  const iy = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
  return ix * iy;
}

function computeNonOverlappingLabels(
  items: Array<{ id: string; text: string; px: number; py: number }>
): Map<string, PlacedLabel> {
  const result = new Map<string, PlacedLabel>();
  const placedBoxes: LabelBox[] = [];

  // Pre-seed point marker obstacle boxes so labels never cover dots
  const markerObstacles: LabelBox[] = items.map((it) => ({
    x1: it.px - 9,
    y1: it.py - 9,
    x2: it.px + 9,
    y2: it.py + 9,
  }));

  // Place outer/extreme points first, then dense interior ones
  const sorted = [...items].sort((a, b) => a.px - b.px || a.py - b.py);

  const offsets: Array<{
    dx: number;
    dy: number;
    anchor: 'start' | 'middle' | 'end';
  }> = [
    { dx: 11, dy: 4, anchor: 'start' },
    { dx: -11, dy: 4, anchor: 'end' },
    { dx: 0, dy: -13, anchor: 'middle' },
    { dx: 0, dy: 19, anchor: 'middle' },
    { dx: 12, dy: -11, anchor: 'start' },
    { dx: -12, dy: -11, anchor: 'end' },
    { dx: 12, dy: 18, anchor: 'start' },
    { dx: -12, dy: 18, anchor: 'end' },
    { dx: 24, dy: -20, anchor: 'start' },
    { dx: -24, dy: -20, anchor: 'end' },
    { dx: 24, dy: 26, anchor: 'start' },
    { dx: -24, dy: 26, anchor: 'end' },
    { dx: 0, dy: -28, anchor: 'middle' },
    { dx: 0, dy: 34, anchor: 'middle' },
    { dx: 36, dy: -4, anchor: 'start' },
    { dx: -36, dy: -4, anchor: 'end' },
    { dx: 34, dy: -32, anchor: 'start' },
    { dx: -34, dy: -32, anchor: 'end' },
    { dx: 34, dy: 36, anchor: 'start' },
    { dx: -34, dy: 36, anchor: 'end' },
    { dx: 0, dy: -44, anchor: 'middle' },
    { dx: 0, dy: 48, anchor: 'middle' },
  ];

  const minX = MARGIN.left + 4;
  const maxX = MARGIN.left + PLOT_W - 4;
  const minY = MARGIN.top + 12;
  const maxY = MARGIN.top + PLOT_H - 6;

  for (const item of sorted) {
    // Only lay out labels whose point lies inside visible plot area
    if (
      item.px < MARGIN.left - 4 ||
      item.px > MARGIN.left + PLOT_W + 4 ||
      item.py < MARGIN.top - 4 ||
      item.py > MARGIN.top + PLOT_H + 4
    ) {
      continue;
    }

    const estWidth = Math.max(46, Math.min(220, item.text.length * 5.8 + 8));
    const estHeight = 14;

    let bestCandidate: PlacedLabel | null = null;
    let bestBox: LabelBox | null = null;
    let bestScore = Infinity;

    for (const off of offsets) {
      let lx = item.px + off.dx;
      let ly = item.py + off.dy;

      // Clamp within plot boundaries so no label is ever clipped
      if (off.anchor === 'start') {
        lx = Math.max(minX, Math.min(maxX - estWidth, lx));
      } else if (off.anchor === 'end') {
        lx = Math.max(minX + estWidth, Math.min(maxX, lx));
      } else {
        lx = Math.max(minX + estWidth / 2, Math.min(maxX - estWidth / 2, lx));
      }
      ly = Math.max(minY, Math.min(maxY, ly));

      const x1 =
        off.anchor === 'start'
          ? lx
          : off.anchor === 'end'
            ? lx - estWidth
            : lx - estWidth / 2;
      const box: LabelBox = {
        x1: x1 - 2,
        y1: ly - estHeight + 2,
        x2: x1 + estWidth + 2,
        y2: ly + 3,
      };

      let overlapPenalty = 0;
      for (const mBox of markerObstacles) {
        overlapPenalty += boxesOverlapArea(box, mBox) * 3;
      }
      for (const pBox of placedBoxes) {
        overlapPenalty += boxesOverlapArea(box, pBox) * 4;
      }

      const dist = Math.hypot(lx - item.px, ly - item.py);
      const score = overlapPenalty + dist * 0.35;

      if (score < bestScore) {
        bestScore = score;
        const leaderX =
          off.anchor === 'start'
            ? box.x1
            : off.anchor === 'end'
              ? box.x2
              : (box.x1 + box.x2) / 2;
        const leaderY = ly - 3;
        bestBox = box;
        bestCandidate = {
          id: item.id,
          x: lx,
          y: ly,
          textAnchor: off.anchor,
          leaderX,
          leaderY,
          showLeader: dist > 19,
        };
      }

      if (overlapPenalty === 0 && dist <= 18) {
        break;
      }
    }

    if (bestCandidate && bestBox) {
      placedBoxes.push(bestBox);
      result.set(item.id, bestCandidate);
    }
  }

  return result;
}

function buildTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [0];
  const step = (max - min) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, i) => min + i * step);
}

function PlanetGlyph({
  body,
  cx,
  cy,
  fill,
  stroke,
  size = 6.5,
  highlighted = false,
}: {
  body: PlanetaryBody;
  cx: number;
  cy: number;
  fill: string;
  stroke: string;
  size?: number;
  highlighted?: boolean;
}) {
  const r = highlighted ? size + 2 : size;
  if (body === 'Earth') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        fillOpacity={0.9}
        stroke={highlighted ? '#ffffff' : stroke}
        strokeWidth={highlighted ? 2 : 1.5}
      />
    );
  }
  if (body === 'Mars') {
    const pts = `${cx},${cy - r * 1.18} ${cx + r * 1.18},${cy} ${cx},${cy + r * 1.18} ${cx - r * 1.18},${cy}`;
    return (
      <polygon
        points={pts}
        fill={fill}
        fillOpacity={0.92}
        stroke={highlighted ? '#ffffff' : stroke}
        strokeWidth={highlighted ? 2 : 1.5}
      />
    );
  }
  // Moon: upward triangle
  const h = r * 1.25;
  const w = r * 1.15;
  const pts = `${cx},${cy - h} ${cx + w},${cy + h * 0.78} ${cx - w},${cy + h * 0.78}`;
  return (
    <polygon
      points={pts}
      fill={fill}
      fillOpacity={0.92}
      stroke={highlighted ? '#ffffff' : stroke}
      strokeWidth={highlighted ? 2 : 1.5}
    />
  );
}

export default function MorphometricScatterChart({
  sites,
  datasets,
}: MorphometricScatterChartProps) {
  const [normalization, setNormalization] = useState<MorphometricNormalization>('zscore');
  const [clusterCount, setClusterCount] = useState<number>(3);
  const [colorBy, setColorBy] = useState<ColorMode>('planet');
  const [planetFilter, setPlanetFilter] = useState<PlanetFilter>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hiddenPlanets, setHiddenPlanets] = useState<Set<PlanetaryBody>>(() => new Set());
  const [hiddenClusters, setHiddenClusters] = useState<Set<number>>(() => new Set());
  const [labelMode, setLabelMode] = useState<LabelMode>('auto');

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  }>({ active: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0, moved: false });

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const [clustering, setClustering] = useState<MorphometricClusteringResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClustering = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clustering?k=${clusterCount}&normalization=${encodeURIComponent(normalization)}`
      );
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as MorphometricClusteringResult;
      setClustering(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to compute morphometric clustering.'
      );
    } finally {
      setLoading(false);
    }
  }, [clusterCount, normalization]);

  useEffect(() => {
    fetchClustering();
  }, [fetchClustering, sites.length, datasets.length]);

  const planetCounts = useMemo(() => {
    const pts = clustering?.points ?? [];
    return {
      All: pts.length,
      Earth: pts.filter((p) => p.body === 'Earth').length,
      Moon: pts.filter((p) => p.body === 'Moon').length,
      Mars: pts.filter((p) => p.body === 'Mars').length,
    };
  }, [clustering]);

  const filteredPoints = useMemo(() => {
    const pts = clustering?.points ?? [];
    const q = searchQuery.trim().toLowerCase();
    return pts.filter((p) => {
      if (planetFilter !== 'All' && p.body !== planetFilter) return false;
      if (hiddenPlanets.has(p.body)) return false;
      if (hiddenClusters.has(p.clusterId)) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !p.region.toLowerCase().includes(q) &&
        !p.body.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [clustering, planetFilter, hiddenPlanets, hiddenClusters, searchQuery]);

  const getYValue = useCallback(
    (p: MorphometricPoint) => {
      if (normalization === 'minmax') return p.triMinMax;
      if (normalization === 'raw') return p.triMeanM;
      return p.triZ;
    },
    [normalization]
  );

  // Base domain computed over ALL valid points so axes stay stable when toggling filters
  const baseDomain = useMemo(() => {
    const allPts = clustering?.points ?? [];
    if (allPts.length === 0) {
      return { xMin: 0, xMax: 25, yMin: -2, yMax: 3 };
    }
    const xs = allPts.map((p) => p.meanSlopeDeg);
    const ys = allPts.map((p) => getYValue(p));
    const rawXMin = Math.min(0, Math.min(...xs));
    const rawXMax = Math.max(...xs);
    const xPad = Math.max(1.5, (rawXMax - rawXMin) * 0.1);

    const rawYMin = Math.min(...ys);
    const rawYMax = Math.max(...ys);
    const ySpan = Math.max(0.5, rawYMax - rawYMin);
    const yPad = ySpan * 0.14;

    return {
      xMin: Math.max(0, Math.floor((rawXMin - xPad * 0.2) * 10) / 10),
      xMax: Math.ceil((rawXMax + xPad) * 10) / 10,
      yMin:
        normalization === 'raw' || normalization === 'minmax'
          ? Math.max(0, rawYMin - yPad * 0.5)
          : rawYMin - yPad,
      yMax: normalization === 'minmax' ? Math.min(1.12, rawYMax + yPad) : rawYMax + yPad,
    };
  }, [clustering, getYValue, normalization]);

  // Visible zoomed/panned domain
  const visibleDomain = useMemo(() => {
    const fullSpanX = baseDomain.xMax - baseDomain.xMin;
    const fullSpanY = baseDomain.yMax - baseDomain.yMin;
    const visSpanX = fullSpanX / zoom;
    const visSpanY = fullSpanY / zoom;

    const maxPanX = Math.max(0, fullSpanX - visSpanX);
    const maxPanY = Math.max(0, fullSpanY - visSpanY);
    const clampedPanX = Math.max(-maxPanX / 2, Math.min(maxPanX / 2, pan.x));
    const clampedPanY = Math.max(-maxPanY / 2, Math.min(maxPanY / 2, pan.y));

    const centerX = (baseDomain.xMin + baseDomain.xMax) / 2 + clampedPanX;
    const centerY = (baseDomain.yMin + baseDomain.yMax) / 2 + clampedPanY;

    return {
      xMin: centerX - visSpanX / 2,
      xMax: centerX + visSpanX / 2,
      yMin: centerY - visSpanY / 2,
      yMax: centerY + visSpanY / 2,
    };
  }, [baseDomain, zoom, pan]);

  const toPxX = useCallback(
    (slope: number) =>
      MARGIN.left +
      ((slope - visibleDomain.xMin) / Math.max(1e-6, visibleDomain.xMax - visibleDomain.xMin)) *
        PLOT_W,
    [visibleDomain]
  );

  const toPxY = useCallback(
    (yVal: number) =>
      MARGIN.top +
      PLOT_H -
      ((yVal - visibleDomain.yMin) / Math.max(1e-6, visibleDomain.yMax - visibleDomain.yMin)) *
        PLOT_H,
    [visibleDomain]
  );

  const screenPoints = useMemo(() => {
    return filteredPoints.map((p) => ({
      point: p,
      px: toPxX(p.meanSlopeDeg),
      py: toPxY(getYValue(p)),
    }));
  }, [filteredPoints, toPxX, toPxY, getYValue]);

  const placedLabels = useMemo(() => {
    if (labelMode === 'hover') return new Map<string, PlacedLabel>();
    return computeNonOverlappingLabels(
      screenPoints.map((sp) => ({
        id: sp.point.id,
        text: sp.point.shortName,
        px: sp.px,
        py: sp.py,
      }))
    );
  }, [screenPoints, labelMode]);

  const xTicks = useMemo(
    () => buildTicks(visibleDomain.xMin, visibleDomain.xMax, 6),
    [visibleDomain]
  );
  const yTicks = useMemo(
    () => buildTicks(visibleDomain.yMin, visibleDomain.yMax, 6),
    [visibleDomain]
  );

  const activePoint = useMemo(() => {
    const id = hoveredId ?? pinnedId;
    if (!id) return null;
    return filteredPoints.find((p) => p.id === id) ?? null;
  }, [hoveredId, pinnedId, filteredPoints]);

  const activeScreenPoint = useMemo(() => {
    if (!activePoint) return null;
    return screenPoints.find((sp) => sp.point.id === activePoint.id) ?? null;
  }, [activePoint, screenPoints]);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const resetAllFilters = () => {
    setPlanetFilter('All');
    setSearchQuery('');
    setHiddenPlanets(new Set());
    setHiddenClusters(new Set());
    setPinnedId(null);
    resetView();
  };

  const togglePlanet = (body: PlanetaryBody) => {
    setHiddenPlanets((prev) => {
      const next = new Set(prev);
      if (next.has(body)) next.delete(body);
      else next.add(body);
      return next;
    });
  };

  const toggleCluster = (clusterId: number) => {
    setHiddenClusters((prev) => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else next.add(clusterId);
      return next;
    });
  };

  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.2 : 0.84;
    setZoom((prev) => Math.max(1, Math.min(6, Math.round(prev * factor * 100) / 100)));
  };

  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 4) {
      dragRef.current.moved = true;
    }
    const visSpanX = visibleDomain.xMax - visibleDomain.xMin;
    const visSpanY = visibleDomain.yMax - visibleDomain.yMin;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = visSpanX / Math.max(1, rect.width * (PLOT_W / SVG_W));
    const scaleY = visSpanY / Math.max(1, rect.height * (PLOT_H / SVG_H));

    setPan({
      x: dragRef.current.startPanX - dx * scaleX,
      y: dragRef.current.startPanY + dy * scaleY,
    });
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const yAxisTitle =
    normalization === 'minmax'
      ? 'Riley TRI — Normalized [0–1]'
      : normalization === 'raw'
        ? 'Raw Riley TRI (m) [Scale-Dependent]'
        : 'Riley TRI — Z-Score Standardized (σ)';

  const hasActiveFilters =
    planetFilter !== 'All' ||
    searchQuery.trim() !== '' ||
    hiddenPlanets.size > 0 ||
    hiddenClusters.size > 0 ||
    zoom > 1;

  return (
    <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-5 space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-base font-semibold text-white">
              Cross-Planet Morphometric Clustering (Mean Slope vs. Riley TRI)
            </h2>
            <span className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-300 tabular-nums">
              {filteredPoints.length} / {clustering?.points.length ?? 0} Regions Shown
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Datum-independent roughness clustering across indexed Earth analogues and Moon/Mars
            targets.
          </p>
        </div>

        {/* Normalization & Cluster Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-700/80 bg-slate-900/90 p-0.5">
            {(
              [
                { id: 'zscore', label: 'Z-Score TRI' },
                { id: 'minmax', label: 'Min-Max [0–1]' },
                { id: 'raw', label: 'Raw TRI (m)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setNormalization(opt.id);
                  resetView();
                }}
                className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  normalization === opt.id
                    ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-lg border border-slate-700/80 bg-slate-900/90 p-0.5">
            <button
              type="button"
              onClick={() => setColorBy('planet')}
              className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                colorBy === 'planet'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Color: Planet
            </button>
            <button
              type="button"
              onClick={() => setColorBy('cluster')}
              className={`whitespace-nowrap shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                colorBy === 'cluster'
                  ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Color: Cluster
            </button>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2.5 py-1">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400 whitespace-nowrap">k =</span>
            {[2, 3, 4].map((kVal) => (
              <button
                key={kVal}
                type="button"
                onClick={() => setClusterCount(kVal)}
                className={`rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums transition-colors ${
                  clusterCount === kVal
                    ? 'bg-violet-500/30 text-violet-200 font-semibold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {kVal}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filter, Search, and Zoom Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-[#060b18] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Planet Filters */}
          <div className="flex items-center gap-1.5">
            {(['All', 'Earth', 'Moon', 'Mars'] as const).map((body) => {
              const active = planetFilter === body;
              return (
                <button
                  key={body}
                  type="button"
                  onClick={() => setPlanetFilter(body)}
                  className={`whitespace-nowrap shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                      : 'border-slate-800 bg-slate-900/70 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {body}{' '}
                  <span className="ml-0.5 font-mono text-[10px] opacity-80 tabular-nums">
                    ({planetCounts[body]})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search region name..."
              className="w-48 sm:w-56 rounded-md border border-slate-800 bg-slate-900/90 py-1 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Zoom, Labels, and Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-800 bg-slate-900/80 p-0.5">
            {(
              [
                { id: 'auto', label: 'Labels: Auto' },
                { id: 'hover', label: 'Hover Only' },
              ] as const
            ).map((lm) => (
              <button
                key={lm.id}
                type="button"
                onClick={() => setLabelMode(lm.id)}
                className={`whitespace-nowrap shrink-0 rounded px-2 py-0.5 text-[11px] transition-colors ${
                  labelMode === lm.id
                    ? 'bg-slate-800 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lm.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900/80 px-1.5 py-0.5">
            <button
              type="button"
              title="Zoom in"
              onClick={() =>
                setZoom((z) => Math.min(6, Math.round(z * 1.35 * 100) / 100))
              }
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-[38px] text-center font-mono text-[11px] text-slate-300 tabular-nums">
              {zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              title="Zoom out"
              onClick={() => {
                setZoom((z) => {
                  const next = Math.max(1, Math.round((z / 1.35) * 100) / 100);
                  if (next === 1) setPan({ x: 0, y: 0 });
                  return next;
                });
              }}
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            {zoom > 1 && (
              <button
                type="button"
                title="Reset zoom"
                onClick={resetView}
                className="rounded p-1 text-cyan-300 hover:bg-slate-800"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={resetAllFilters}
            disabled={!hasActiveFilters}
            className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 rounded-md border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors hover:border-cyan-400/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Filters
          </button>
        </div>
      </div>

      {/* Cross-Planet Raw Scale Caveat Banner when raw mode is active */}
      {normalization === 'raw' && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">Raw TRI Scale Caution:</span> Raw Riley TRI (m)
            depends directly on DEM cell spacing and elevation window (Earth SRTM ~30–90 m vs.
            Moon LOLA ~60–118 m vs. Mars MOLA/HiRISE ~1–463 m). Cluster boundaries are still
            computed in Z-score standardized space rather than raw meter units.
          </div>
        </div>
      )}

      {/* Interactive Legend (Toggleable Planets & Clusters) */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-1">
            Bodies (click to toggle):
          </span>
          {(['Earth', 'Moon', 'Mars'] as const).map((body) => {
            const hidden = hiddenPlanets.has(body);
            const meta = PLANET_META[body];
            return (
              <button
                key={body}
                type="button"
                onClick={() => togglePlanet(body)}
                className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-all ${
                  hidden
                    ? 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-55 line-through'
                    : 'border-slate-700/80 bg-slate-900/90 text-slate-200 hover:border-slate-600'
                }`}
              >
                <svg width="14" height="14" viewBox="-8 -8 16 16" className="shrink-0">
                  <PlanetGlyph
                    body={body}
                    cx={0}
                    cy={0}
                    fill={meta.color}
                    stroke={meta.stroke}
                    size={5.2}
                  />
                </svg>
                <span>
                  {body} ({meta.markerName})
                </span>
              </button>
            );
          })}
        </div>

        {clustering && clustering.clusters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-slate-500 mr-1">
              Clusters:
            </span>
            {clustering.clusters.map((c) => {
              const hidden = hiddenClusters.has(c.clusterId);
              const style = CLUSTER_COLORS[c.clusterId] ?? CLUSTER_COLORS[1];
              return (
                <button
                  key={c.clusterId}
                  type="button"
                  onClick={() => toggleCluster(c.clusterId)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] transition-all ${
                    hidden
                      ? 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-55 line-through'
                      : `${style.bg} ${style.border} ${style.text}`
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                  C{c.clusterId} ({c.count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Scatter Plot Canvas + Inspector */}
      <div className="relative rounded-xl border border-slate-800/90 bg-[#060b18] p-2 sm:p-3">
        {error ? (
          <div className="flex h-80 items-center justify-center text-sm text-rose-300">
            Failed to load morphometric clustering: {error}
          </div>
        ) : loading && !clustering ? (
          <div className="flex h-80 items-center justify-center font-mono text-xs text-slate-400">
            Computing deterministic K-Means++ morphometric clusters...
          </div>
        ) : (
          <div className="relative">
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className={`w-full h-auto select-none ${
                zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
              }`}
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={() => {
                handlePointerUp();
                setHoveredId(null);
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget && !dragRef.current.moved) {
                  setPinnedId(null);
                }
              }}
            >
              <defs>
                <clipPath id="morpho-plot-clip">
                  <rect x={MARGIN.left} y={MARGIN.top} width={PLOT_W} height={PLOT_H} />
                </clipPath>
              </defs>

              {/* Plot Backdrop */}
              <rect
                x={MARGIN.left}
                y={MARGIN.top}
                width={PLOT_W}
                height={PLOT_H}
                fill="#040814"
                stroke="#1e293b"
                strokeWidth="1"
              />

              {/* Subtle Horizontal & Vertical Gridlines */}
              <g clipPath="url(#morpho-plot-clip)">
                {yTicks.map((tv, i) => {
                  const py = toPxY(tv);
                  return (
                    <line
                      key={`yg-${i}`}
                      x1={MARGIN.left}
                      x2={MARGIN.left + PLOT_W}
                      y1={py}
                      y2={py}
                      stroke="#172238"
                      strokeWidth="1"
                    />
                  );
                })}
                {xTicks.map((tv, i) => {
                  const px = toPxX(tv);
                  return (
                    <line
                      key={`xg-${i}`}
                      x1={px}
                      x2={px}
                      y1={MARGIN.top}
                      y2={MARGIN.top + PLOT_H}
                      stroke="#172238"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* Mean Reference Line (Z=0) in Z-Score mode */}
                {normalization === 'zscore' &&
                  visibleDomain.yMin < 0 &&
                  visibleDomain.yMax > 0 && (
                    <line
                      x1={MARGIN.left}
                      x2={MARGIN.left + PLOT_W}
                      y1={toPxY(0)}
                      y2={toPxY(0)}
                      stroke="#334155"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  )}

                {/* Cluster Centroids when colored by Cluster */}
                {colorBy === 'cluster' &&
                  clustering?.clusters
                    .filter((c) => !hiddenClusters.has(c.clusterId))
                    .map((c) => {
                      const cyVal =
                        normalization === 'minmax'
                          ? (c.meanTriM -
                              Math.min(...clustering.points.map((p) => p.triMeanM))) /
                            Math.max(
                              1e-6,
                              Math.max(...clustering.points.map((p) => p.triMeanM)) -
                                Math.min(...clustering.points.map((p) => p.triMeanM))
                            )
                          : normalization === 'raw'
                            ? c.meanTriM
                            : c.centroidTriZ;
                      const cx = toPxX(c.meanSlopeDeg);
                      const cy = toPxY(cyVal);
                      const col = (CLUSTER_COLORS[c.clusterId] ?? CLUSTER_COLORS[1]).color;
                      return (
                        <g key={`cent-${c.clusterId}`} opacity={0.65} pointerEvents="none">
                          <circle
                            cx={cx}
                            cy={cy}
                            r={14}
                            fill={col}
                            fillOpacity={0.08}
                            stroke={col}
                            strokeDasharray="3 3"
                            strokeWidth={1}
                          />
                          <line
                            x1={cx - 5}
                            x2={cx + 5}
                            y1={cy}
                            y2={cy}
                            stroke={col}
                            strokeWidth={1.2}
                          />
                          <line
                            x1={cx}
                            x2={cx}
                            y1={cy - 5}
                            y2={cy + 5}
                            stroke={col}
                            strokeWidth={1.2}
                          />
                        </g>
                      );
                    })}

                {/* Leader lines for offset labels */}
                {screenPoints.map((sp) => {
                  const lbl = placedLabels.get(sp.point.id);
                  if (!lbl || !lbl.showLeader) return null;
                  return (
                    <line
                      key={`ldr-${sp.point.id}`}
                      x1={sp.px}
                      y1={sp.py}
                      x2={lbl.leaderX}
                      y2={lbl.leaderY}
                      stroke="#475569"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                      pointerEvents="none"
                    />
                  );
                })}

                {/* Scatter Data Points */}
                {screenPoints.map((sp) => {
                  const p = sp.point;
                  const isActive = activePoint?.id === p.id;
                  const meta = PLANET_META[p.body];
                  const clusterCol =
                    (CLUSTER_COLORS[p.clusterId] ?? CLUSTER_COLORS[1]).color;
                  const fill = colorBy === 'cluster' ? clusterCol : meta.color;
                  const stroke = colorBy === 'cluster' ? '#050814' : meta.stroke;

                  return (
                    <g
                      key={p.id}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredId(p.id)}
                      onMouseLeave={() => setHoveredId((prev) => (prev === p.id ? null : prev))}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPinnedId((prev) => (prev === p.id ? null : p.id));
                      }}
                    >
                      {/* Invisible enlarged hit target for effortless hovering */}
                      <circle cx={sp.px} cy={sp.py} r={12} fill="transparent" />
                      {isActive && (
                        <circle
                          cx={sp.px}
                          cy={sp.py}
                          r={12}
                          fill={fill}
                          fillOpacity={0.2}
                          stroke={fill}
                          strokeWidth={1.2}
                        />
                      )}
                      <PlanetGlyph
                        body={p.body}
                        cx={sp.px}
                        cy={sp.py}
                        fill={fill}
                        stroke={stroke}
                        size={6.5}
                        highlighted={isActive}
                      />
                    </g>
                  );
                })}

                {/* Collision-Avoided Region Labels */}
                {screenPoints.map((sp) => {
                  const p = sp.point;
                  const lbl = placedLabels.get(p.id);
                  const isActive = activePoint?.id === p.id;
                  if (!lbl && !isActive) return null;

                  const lx = lbl ? lbl.x : Math.min(MARGIN.left + PLOT_W - 10, sp.px + 10);
                  const ly = lbl ? lbl.y : Math.max(MARGIN.top + 14, sp.py - 8);
                  const anchor = lbl ? lbl.textAnchor : 'start';

                  return (
                    <text
                      key={`txt-${p.id}`}
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      fill={isActive ? '#ffffff' : '#cbd5e1'}
                      fontSize={isActive ? '10.5' : '9.5'}
                      fontWeight={isActive ? '600' : '400'}
                      fontFamily="JetBrains Mono, monospace"
                      className="pointer-events-none"
                      style={{
                        paintOrder: 'stroke',
                        stroke: '#040814',
                        strokeWidth: '3px',
                        strokeLinejoin: 'round',
                      }}
                    >
                      {p.shortName}
                    </text>
                  );
                })}
              </g>

              {/* Axis Lines */}
              <line
                x1={MARGIN.left}
                x2={MARGIN.left}
                y1={MARGIN.top}
                y2={MARGIN.top + PLOT_H}
                stroke="#475569"
                strokeWidth="1.2"
              />
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + PLOT_W}
                y1={MARGIN.top + PLOT_H}
                y2={MARGIN.top + PLOT_H}
                stroke="#475569"
                strokeWidth="1.2"
              />

              {/* X-axis Ticks */}
              {xTicks.map((tv, i) => {
                const px = toPxX(tv);
                return (
                  <g key={`xt-${i}`}>
                    <line
                      x1={px}
                      x2={px}
                      y1={MARGIN.top + PLOT_H}
                      y2={MARGIN.top + PLOT_H + 5}
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                    <text
                      x={px}
                      y={MARGIN.top + PLOT_H + 18}
                      textAnchor="middle"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {tv.toFixed(1)}°
                    </text>
                  </g>
                );
              })}

              {/* Y-axis Ticks */}
              {yTicks.map((tv, i) => {
                const py = toPxY(tv);
                const formatted =
                  normalization === 'raw'
                    ? `${Math.round(tv)}`
                    : normalization === 'minmax'
                      ? tv.toFixed(2)
                      : `${tv >= 0 ? '+' : ''}${tv.toFixed(1)}σ`;
                return (
                  <g key={`yt-${i}`}>
                    <line
                      x1={MARGIN.left - 5}
                      x2={MARGIN.left}
                      y1={py}
                      y2={py}
                      stroke="#64748b"
                      strokeWidth="1"
                    />
                    <text
                      x={MARGIN.left - 9}
                      y={py + 3.5}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {formatted}
                    </text>
                  </g>
                );
              })}

              {/* Axis Titles */}
              <text
                x={MARGIN.left + PLOT_W / 2}
                y={SVG_H - 12}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="11.5"
                fontWeight="500"
                fontFamily="JetBrains Mono, monospace"
              >
                Mean Surface Slope (°)
              </text>
              <text
                x={18}
                y={MARGIN.top + PLOT_H / 2}
                textAnchor="middle"
                transform={`rotate(-90 18 ${MARGIN.top + PLOT_H / 2})`}
                fill="#cbd5e1"
                fontSize="11.5"
                fontWeight="500"
                fontFamily="JetBrains Mono, monospace"
              >
                {yAxisTitle}
              </text>
            </svg>

            {/* Empty Filter State */}
            {filteredPoints.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto rounded-lg border border-slate-700 bg-slate-900/95 px-4 py-3 text-center text-xs text-slate-300">
                  No regions match the active planet/cluster/search filters.
                </div>
              </div>
            )}

            {/* Floating Hover / Pinned Scientific Tooltip */}
            {activePoint && activeScreenPoint && (
              <div
                className="pointer-events-none absolute z-20 hidden w-80 rounded-xl border border-cyan-500/40 bg-[#050b19]/95 p-3.5 shadow-2xl backdrop-blur-md md:block"
                style={{
                  left:
                    activeScreenPoint.px > SVG_W * 0.56
                      ? `calc(${(activeScreenPoint.px / SVG_W) * 100}% - 21rem)`
                      : `calc(${(activeScreenPoint.px / SVG_W) * 100}% + 1rem)`,
                  top:
                    activeScreenPoint.py > SVG_H * 0.55
                      ? `calc(${(activeScreenPoint.py / SVG_H) * 100}% - 12.5rem)`
                      : `calc(${(activeScreenPoint.py / SVG_H) * 100}% + 0.5rem)`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-white">{activePoint.name}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {activePoint.region} · {activePoint.category}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                      PLANET_META[activePoint.body].badgeBg
                    }`}
                  >
                    {activePoint.body}
                  </span>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900/75 p-2 font-mono text-[11px] tabular-nums">
                  <div>
                    <div className="text-[10px] text-slate-500">Mean Slope</div>
                    <div className="font-semibold text-slate-100">
                      {activePoint.meanSlopeDeg.toFixed(1)}°{' '}
                      <span className="text-[10px] text-slate-400">
                        ({activePoint.slopeZ >= 0 ? '+' : ''}
                        {activePoint.slopeZ.toFixed(2)}σ)
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">Riley TRI</div>
                    <div className="font-semibold text-cyan-300">
                      {activePoint.triMeanM.toFixed(1)} m{' '}
                      <span className="text-[10px] text-slate-400">
                        ({activePoint.triZ >= 0 ? '+' : ''}
                        {activePoint.triZ.toFixed(2)}σ)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-2 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Cluster:</span>
                    <span className="font-mono text-violet-300">
                      C{activePoint.clusterId} · {activePoint.clusterLabel}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Dataset:</span>
                    <span className="text-right text-slate-200">{activePoint.datasetName}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Source:</span>
                    <span className="text-right text-slate-300">{activePoint.dataSource}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Status:</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                      {activePoint.processingStatus}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5">
                    Scale: {activePoint.resolutionNote}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile / Pinned Inspector Card */}
        {activePoint && (
          <div className="mt-3 rounded-lg border border-cyan-500/30 bg-slate-900/90 p-3 text-xs md:hidden">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-white">{activePoint.name}</span>
              <span
                className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                  PLANET_META[activePoint.body].badgeBg
                }`}
              >
                {activePoint.body}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px] tabular-nums">
              <div>Slope: {activePoint.meanSlopeDeg.toFixed(1)}°</div>
              <div>
                TRI: {activePoint.triMeanM.toFixed(1)} m ({activePoint.triZ >= 0 ? '+' : ''}
                {activePoint.triZ.toFixed(2)}σ)
              </div>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-300">
              Dataset: {activePoint.datasetName} · {activePoint.processingStatus}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400">{activePoint.dataSource}</div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Tip: Hover any marker for provenance & metrics, click to pin, scroll wheel to zoom
            {zoom > 1 ? ', drag plot to pan.' : '.'}
          </span>
          <span className="font-mono">
            {clustering?.normalizationMethod ?? 'Z-Score Standardization'}
          </span>
        </div>
      </div>

      {/* Cluster Summary Cards */}
      {clustering && clustering.clusters.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-white">
              Morphometric Cluster Summaries ({clustering.k} Clusters)
            </h3>
            <span className="font-mono text-[11px] text-slate-400">
              Method: {clustering.clusteringMethod} · Space: {clustering.clusteringSpace}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {clustering.clusters.map((cluster) => {
              const style = CLUSTER_COLORS[cluster.clusterId] ?? CLUSTER_COLORS[1];
              return (
                <div
                  key={cluster.clusterId}
                  className={`rounded-xl border ${style.border} bg-[#060b18] p-3.5 space-y-2`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: style.color }}
                      />
                      <span className={`font-mono text-xs font-semibold ${style.text}`}>
                        Cluster {cluster.clusterId}: {cluster.label}
                      </span>
                    </div>
                    <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-[11px] text-slate-200 tabular-nums">
                      {cluster.count} {cluster.count === 1 ? 'region' : 'regions'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2 font-mono text-[11px] tabular-nums">
                    <div>
                      <div className="text-[10px] text-slate-500">Slope Range</div>
                      <div className="text-slate-200">
                        {cluster.slopeMinDeg.toFixed(1)}° – {cluster.slopeMaxDeg.toFixed(1)}°
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500">Riley TRI Range</div>
                      <div className="text-cyan-300">
                        {cluster.triMinM.toFixed(1)} – {cluster.triMaxM.toFixed(1)} m
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 leading-relaxed">
                    <span className="text-slate-500">Regions: </span>
                    {cluster.regionNames.join(', ')}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-slate-500 font-mono">
                    <span>Bodies: {cluster.planetsRepresented.join(' · ')}</span>
                    <span>
                      Centroid: ({cluster.centroidSlopeZ >= 0 ? '+' : ''}
                      {cluster.centroidSlopeZ.toFixed(2)}σ,{' '}
                      {cluster.centroidTriZ >= 0 ? '+' : ''}
                      {cluster.centroidTriZ.toFixed(2)}σ)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scientific Data Integrity, Unavailable Regions & Scale Provenance Footer */}
      {clustering && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800/80 bg-[#060b18] p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Info className="h-4 w-4 text-cyan-400 shrink-0" />
              Cross-Planet Scale & Clustering Limitations
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              {clustering.scaleCaveat}
            </p>
            <p className="text-[11px] leading-relaxed text-amber-200/85">
              {clustering.limitationNote}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800/80 bg-[#060b18] p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <Database className="h-4 w-4 text-emerald-400 shrink-0" />
                Data Provenance & Missing-Measurement Audit
              </div>
              <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                {clustering.unavailableRegions.length} Excluded
              </span>
            </div>

            {clustering.unavailableRegions.length > 0 ? (
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {clustering.unavailableRegions.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5 text-[11px]"
                  >
                    <div className="font-medium text-amber-200">
                      {u.name} ({u.body})
                    </div>
                    <div className="text-slate-400">{u.reason}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] leading-relaxed text-slate-400">
                All {clustering.points.length} indexed sites (9 Earth, 3 Mars, 3 Moon) have
                non-null published reference slope & Riley TRI baselines. Any newly uploaded CSV or
                GeoJSON records missing slope or TRI are automatically excluded here rather than
                coerced to zero.
              </p>
            )}

            {clustering.pendingExternalDatasets.length > 0 && (
              <p className="text-[10px] text-slate-500 pt-1">
                Pending unmounted local files awaiting upload in Data Center:{' '}
                {clustering.pendingExternalDatasets.join(', ')}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
