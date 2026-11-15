import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Database,
  Info,
  Layers,
  Maximize2,
  Pin,
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
  normalization?: MorphometricNormalization;
  onNormalizationChange?: (norm: MorphometricNormalization) => void;
  clusterCount?: number;
  onClusterCountChange?: (k: number) => void;
  planetFilter?: 'All' | PlanetaryBody;
  onPlanetFilterChange?: (planet: 'All' | PlanetaryBody) => void;
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
    badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    markerName: 'Circle',
  },
  Mars: {
    color: '#fb923c',
    stroke: '#9a3412',
    badgeBg: 'bg-orange-500/15 text-orange-300 border-orange-500/35',
    markerName: 'Diamond',
  },
  Moon: {
    color: '#38bdf8',
    stroke: '#075985',
    badgeBg: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
    markerName: 'Triangle',
  },
};

const CLUSTER_COLORS: Record<
  number,
  {
    color: string;
    bg: string;
    border: string;
    headerBg: string;
    text: string;
    accentLine: string;
  }
> = {
  1: {
    color: '#22d3ee',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/40',
    headerBg: 'bg-cyan-500/10',
    text: 'text-cyan-300',
    accentLine: 'bg-cyan-400',
  },
  2: {
    color: '#a78bfa',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/40',
    headerBg: 'bg-violet-500/10',
    text: 'text-violet-300',
    accentLine: 'bg-violet-400',
  },
  3: {
    color: '#fbbf24',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/40',
    headerBg: 'bg-amber-500/10',
    text: 'text-amber-300',
    accentLine: 'bg-amber-400',
  },
  4: {
    color: '#f43f5e',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/40',
    headerBg: 'bg-rose-500/10',
    text: 'text-rose-300',
    accentLine: 'bg-rose-400',
  },
};

const SVG_W = 940;
const SVG_H = 460;
const MARGIN = { top: 26, right: 32, bottom: 56, left: 78 };
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
  items: Array<{ id: string; text: string; px: number; py: number }>,
  forceAll: boolean
): Map<string, PlacedLabel> {
  const result = new Map<string, PlacedLabel>();
  const placedBoxes: LabelBox[] = [];

  const markerObstacles: LabelBox[] = items.map((it) => ({
    x1: it.px - 10,
    y1: it.py - 10,
    x2: it.px + 10,
    y2: it.py + 10,
  }));

  // Sort densely clustered regions stably
  const sorted = [...items].sort((a, b) => a.px - b.px || a.py - b.py);

  // Expanded radial & staggered offset candidates for collision-free placement
  const offsets: Array<{
    dx: number;
    dy: number;
    anchor: 'start' | 'middle' | 'end';
  }> = [
    { dx: 11, dy: 4, anchor: 'start' },
    { dx: -11, dy: 4, anchor: 'end' },
    { dx: 0, dy: -14, anchor: 'middle' },
    { dx: 0, dy: 20, anchor: 'middle' },
    { dx: 13, dy: -12, anchor: 'start' },
    { dx: -13, dy: -12, anchor: 'end' },
    { dx: 13, dy: 19, anchor: 'start' },
    { dx: -13, dy: 19, anchor: 'end' },
    { dx: 26, dy: -22, anchor: 'start' },
    { dx: -26, dy: -22, anchor: 'end' },
    { dx: 26, dy: 28, anchor: 'start' },
    { dx: -26, dy: 28, anchor: 'end' },
    { dx: 0, dy: -30, anchor: 'middle' },
    { dx: 0, dy: 36, anchor: 'middle' },
    { dx: 42, dy: -4, anchor: 'start' },
    { dx: -42, dy: -4, anchor: 'end' },
    { dx: 40, dy: -34, anchor: 'start' },
    { dx: -40, dy: -34, anchor: 'end' },
    { dx: 40, dy: 38, anchor: 'start' },
    { dx: -40, dy: 38, anchor: 'end' },
    { dx: 0, dy: -48, anchor: 'middle' },
    { dx: 0, dy: 52, anchor: 'middle' },
    { dx: 64, dy: -18, anchor: 'start' },
    { dx: -64, dy: -18, anchor: 'end' },
    { dx: 64, dy: 24, anchor: 'start' },
    { dx: -64, dy: 24, anchor: 'end' },
    { dx: 56, dy: -52, anchor: 'start' },
    { dx: -56, dy: -52, anchor: 'end' },
    { dx: 56, dy: 56, anchor: 'start' },
    { dx: -56, dy: 56, anchor: 'end' },
  ];

  const minX = MARGIN.left + 6;
  const maxX = MARGIN.left + PLOT_W - 6;
  const minY = MARGIN.top + 13;
  const maxY = MARGIN.top + PLOT_H - 7;

  for (const item of sorted) {
    if (
      item.px < MARGIN.left - 4 ||
      item.px > MARGIN.left + PLOT_W + 4 ||
      item.py < MARGIN.top - 4 ||
      item.py > MARGIN.top + PLOT_H + 4
    ) {
      continue;
    }

    const estWidth = Math.max(48, Math.min(220, item.text.length * 5.8 + 10));
    const estHeight = 14;

    let bestCandidate: PlacedLabel | null = null;
    let bestBox: LabelBox | null = null;
    let bestScore = Infinity;

    for (const off of offsets) {
      let lx = item.px + off.dx;
      let ly = item.py + off.dy;

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
        x1: x1 - 3,
        y1: ly - estHeight + 2,
        x2: x1 + estWidth + 3,
        y2: ly + 4,
      };

      let overlapPenalty = 0;
      for (const mBox of markerObstacles) {
        overlapPenalty += boxesOverlapArea(box, mBox) * 5;
      }
      for (const pBox of placedBoxes) {
        overlapPenalty += boxesOverlapArea(box, pBox) * 6;
      }

      const dist = Math.hypot(lx - item.px, ly - item.py);
      const score = overlapPenalty + dist * 0.28;

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
          showLeader: dist > 18,
        };
      }

      if (overlapPenalty === 0 && dist <= 18) {
        break;
      }
    }

    // In 'auto' mode, if even the best candidate severely collides (>140px² overlap), omit unless hovered;
    // in 'all' mode, always place every single label.
    if (bestCandidate && bestBox && (forceAll || bestScore < 140)) {
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
  size = 6.8,
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
  const r = highlighted ? size + 2.2 : size;
  if (body === 'Earth') {
    return (
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fill}
        fillOpacity={0.92}
        stroke={highlighted ? '#ffffff' : stroke}
        strokeWidth={highlighted ? 2.2 : 1.5}
      />
    );
  }
  if (body === 'Mars') {
    const pts = `${cx},${cy - r * 1.2} ${cx + r * 1.2},${cy} ${cx},${cy + r * 1.2} ${cx - r * 1.2},${cy}`;
    return (
      <polygon
        points={pts}
        fill={fill}
        fillOpacity={0.94}
        stroke={highlighted ? '#ffffff' : stroke}
        strokeWidth={highlighted ? 2.2 : 1.5}
      />
    );
  }
  const h = r * 1.28;
  const w = r * 1.18;
  const pts = `${cx},${cy - h} ${cx + w},${cy + h * 0.78} ${cx - w},${cy + h * 0.78}`;
  return (
    <polygon
      points={pts}
      fill={fill}
      fillOpacity={0.94}
      stroke={highlighted ? '#ffffff' : stroke}
      strokeWidth={highlighted ? 2.2 : 1.5}
    />
  );
}

export default function MorphometricScatterChart({
  sites,
  datasets,
  normalization: controlledNormalization,
  onNormalizationChange,
  clusterCount: controlledClusterCount,
  onClusterCountChange,
  planetFilter: controlledPlanetFilter,
  onPlanetFilterChange,
}: MorphometricScatterChartProps) {
  const [localNormalization, setLocalNormalization] =
    useState<MorphometricNormalization>('zscore');
  const [localClusterCount, setLocalClusterCount] = useState<number>(3);
  const [localPlanetFilter, setLocalPlanetFilter] = useState<PlanetFilter>('All');

  const normalization = controlledNormalization ?? localNormalization;
  const clusterCount = controlledClusterCount ?? localClusterCount;
  const planetFilter = controlledPlanetFilter ?? localPlanetFilter;

  const setNormalization = (next: MorphometricNormalization) => {
    if (onNormalizationChange) onNormalizationChange(next);
    else setLocalNormalization(next);
  };
  const setClusterCount = (next: number) => {
    if (onClusterCountChange) onClusterCountChange(next);
    else setLocalClusterCount(next);
  };
  const setPlanetFilter = (next: PlanetFilter) => {
    if (onPlanetFilterChange) onPlanetFilterChange(next);
    else setLocalPlanetFilter(next);
  };

  const [colorBy, setColorBy] = useState<ColorMode>('planet');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hiddenPlanets, setHiddenPlanets] = useState<Set<PlanetaryBody>>(() => new Set());
  const [hiddenClusters, setHiddenClusters] = useState<Set<number>>(() => new Set());
  const [labelMode, setLabelMode] = useState<LabelMode>('auto');
  const [methodologyOpen, setMethodologyOpen] = useState<boolean>(true);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
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

  // Non-passive wheel listener to prevent console passive-event warnings while zooming plot
  useEffect(() => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.2 : 0.84;
      setZoom((prev) => {
        const next = Math.max(1, Math.min(6, Math.round(prev * factor * 100) / 100));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    svgEl.addEventListener('wheel', onWheel, { passive: false });
    return () => svgEl.removeEventListener('wheel', onWheel);
  }, [loading, error]);

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
        !p.body.toLowerCase().includes(q) &&
        !p.category.toLowerCase().includes(q)
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

  const baseDomain = useMemo(() => {
    const allPts = clustering?.points ?? [];
    if (allPts.length === 0) {
      return { xMin: 0, xMax: 25, yMin: -2, yMax: 3 };
    }
    const xs = allPts.map((p) => p.meanSlopeDeg);
    const ys = allPts.map((p) => getYValue(p));
    const rawXMin = Math.min(0, Math.min(...xs));
    const rawXMax = Math.max(...xs);
    const xPad = Math.max(1.8, (rawXMax - rawXMin) * 0.12);

    const rawYMin = Math.min(...ys);
    const rawYMax = Math.max(...ys);
    const ySpan = Math.max(0.5, rawYMax - rawYMin);
    const yPad = ySpan * 0.16;

    return {
      xMin: Math.max(0, Math.floor((rawXMin - xPad * 0.2) * 10) / 10),
      xMax: Math.ceil((rawXMax + xPad) * 10) / 10,
      yMin:
        normalization === 'raw' || normalization === 'minmax'
          ? Math.max(0, rawYMin - yPad * 0.5)
          : rawYMin - yPad,
      yMax: normalization === 'minmax' ? Math.min(1.14, rawYMax + yPad) : rawYMax + yPad,
    };
  }, [clustering, getYValue, normalization]);

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
      })),
      labelMode === 'all'
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
    setLabelMode('auto');
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

  const focusOnlyCluster = (clusterId: number) => {
    if (!clustering) return;
    const allIds = clustering.clusters.map((c) => c.clusterId);
    const others = allIds.filter((id) => id !== clusterId);
    const currentlyFocused =
      hiddenClusters.size === others.length && !hiddenClusters.has(clusterId);
    if (currentlyFocused) {
      setHiddenClusters(new Set());
    } else {
      setHiddenClusters(new Set(others));
    }
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
      ? 'Riley TRI — Min-Max Normalized [0–1]'
      : normalization === 'raw'
        ? 'Raw Riley TRI (m) [Scale-Dependent]'
        : 'Riley TRI — Z-Score Standardized (σ)';

  const hasActiveFilters =
    planetFilter !== 'All' ||
    searchQuery.trim() !== '' ||
    hiddenPlanets.size > 0 ||
    hiddenClusters.size > 0 ||
    pinnedId !== null ||
    labelMode !== 'auto' ||
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
            <span className="rounded border border-cyan-500/35 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] text-cyan-300 tabular-nums">
              {filteredPoints.length} / {clustering?.points.length ?? 0} Regions Visible
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Datum-independent roughness clustering across indexed Earth analogues (9), Moon targets
            (3), and Mars targets (3).
          </p>
        </div>

        {/* Sectioned Clustering & Color Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Normalization Selector */}
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

          {/* Color Mode Selector */}
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

          {/* Cluster Count Selector */}
          <div className="flex items-center gap-1 rounded-lg border border-slate-700/80 bg-slate-900/90 px-2.5 py-1">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-400 whitespace-nowrap mr-0.5">Clusters k =</span>
            {[2, 3, 4].map((kVal) => (
              <button
                key={kVal}
                type="button"
                onClick={() => {
                  setClusterCount(kVal);
                  setHiddenClusters(new Set());
                }}
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

      {/* Filter, Search, Labels & Zoom Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-[#060b18] px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Planet Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
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

          {/* Search Region Input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search region..."
              aria-label="Search morphometric region"
              className="w-44 sm:w-52 rounded-md border border-slate-800 bg-slate-900/90 py-1 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Label Visibility, Zoom & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-slate-800 bg-slate-900/80 p-0.5">
            {(
              [
                { id: 'auto', label: 'Labels: Auto' },
                { id: 'all', label: 'All' },
                { id: 'hover', label: 'Hover Only' },
              ] as const
            ).map((lm) => (
              <button
                key={lm.id}
                type="button"
                onClick={() => setLabelMode(lm.id)}
                className={`whitespace-nowrap shrink-0 rounded px-2 py-0.5 text-[11px] transition-colors ${
                  labelMode === lm.id
                    ? 'bg-slate-800 text-cyan-200 font-medium'
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
              title="Zoom in scatter plot"
              aria-label="Zoom in scatter plot"
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
              title="Zoom out scatter plot"
              aria-label="Zoom out scatter plot"
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
                title="Reset scatter zoom"
                aria-label="Reset scatter zoom"
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

      {/* Cross-Planet Raw Scale Caution Banner */}
      {normalization === 'raw' && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <span className="font-semibold">Raw TRI Scale Caution:</span> Raw Riley TRI (m)
            depends directly on DEM cell spacing (Earth SRTM ~30–90 m vs. Moon LOLA ~60–118 m vs.
            Mars MOLA/HiRISE ~1–463 m). Cluster assignments remain computed in Z-score space.
          </div>
        </div>
      )}

      {/* Clean Dedicated Legend Bar (Outside Plot Area) */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/60 bg-[#050916]/80 px-3.5 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mr-1">
            Planet Shapes:
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
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mr-1">
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
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-all ${
                    hidden
                      ? 'border-slate-800 bg-slate-900/40 text-slate-500 opacity-55 line-through'
                      : `${style.bg} ${style.border} ${style.text}`
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: style.color }}
                  />
                  C{c.clusterId}: {c.count}
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
              ref={svgRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className={`w-full h-auto select-none ${
                zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
              }`}
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

              {/* Gridlines, Zero Reference, Centroids, Leaders, Markers & Labels */}
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

                {/* Cluster Centroids */}
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
                        <g key={`cent-${c.clusterId}`} opacity={0.7} pointerEvents="none">
                          <circle
                            cx={cx}
                            cy={cy}
                            r={15}
                            fill={col}
                            fillOpacity={0.08}
                            stroke={col}
                            strokeDasharray="3 3"
                            strokeWidth={1.2}
                          />
                          <line x1={cx - 5} x2={cx + 5} y1={cy} y2={cy} stroke={col} strokeWidth={1.3} />
                          <line x1={cx} x2={cx} y1={cy - 5} y2={cy + 5} stroke={col} strokeWidth={1.3} />
                        </g>
                      );
                    })}

                {/* Leader Lines */}
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

                {/* Markers */}
                {screenPoints.map((sp) => {
                  const p = sp.point;
                  const isActive = activePoint?.id === p.id;
                  const isPinned = pinnedId === p.id;
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
                      <circle cx={sp.px} cy={sp.py} r={13} fill="transparent" />
                      {(isActive || isPinned) && (
                        <circle
                          cx={sp.px}
                          cy={sp.py}
                          r={12.5}
                          fill={fill}
                          fillOpacity={0.22}
                          stroke={isPinned ? '#ffffff' : fill}
                          strokeWidth={1.4}
                          strokeDasharray={isPinned ? '2 2' : undefined}
                        />
                      )}
                      <PlanetGlyph
                        body={p.body}
                        cx={sp.px}
                        cy={sp.py}
                        fill={fill}
                        stroke={stroke}
                        size={6.8}
                        highlighted={isActive || isPinned}
                      />
                    </g>
                  );
                })}

                {/* Collision-Avoided Labels */}
                {screenPoints.map((sp) => {
                  const p = sp.point;
                  const lbl = placedLabels.get(p.id);
                  const isActive = activePoint?.id === p.id;
                  if (!lbl && !isActive) return null;

                  const lx = lbl ? lbl.x : Math.min(MARGIN.left + PLOT_W - 12, sp.px + 11);
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
                        strokeWidth: '3.2px',
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

              {/* X Ticks */}
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

              {/* Y Ticks */}
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
                y={SVG_H - 14}
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
                  No regions match the active planet, cluster, or search filters.
                </div>
              </div>
            )}

            {/* Desktop Floating Hover / Pinned Scientific Tooltip */}
            {activePoint && activeScreenPoint && (
              <div
                className="pointer-events-none absolute z-20 hidden w-[340px] rounded-xl border border-cyan-500/45 bg-[#050b19]/96 p-3.5 shadow-2xl md:block"
                style={{
                  left:
                    activeScreenPoint.px > SVG_W * 0.54
                      ? `max(12px, calc(${(activeScreenPoint.px / SVG_W) * 100}% - 22rem))`
                      : `min(calc(100% - 22rem), calc(${(activeScreenPoint.px / SVG_W) * 100}% + 1rem))`,
                  top:
                    activeScreenPoint.py > SVG_H * 0.52
                      ? `max(12px, calc(${(activeScreenPoint.py / SVG_H) * 100}% - 13.5rem))`
                      : `calc(${(activeScreenPoint.py / SVG_H) * 100}% + 0.5rem)`,
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                      <span>{activePoint.name}</span>
                      {pinnedId === activePoint.id && (
                        <Pin className="h-3 w-3 text-cyan-300 shrink-0" />
                      )}
                    </div>
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

                <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-900/80 p-2 font-mono text-[11px] tabular-nums">
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

                <div className="mt-2.5 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Cluster:</span>
                    <span className="font-mono font-semibold text-violet-300">
                      C{activePoint.clusterId} · {activePoint.clusterLabel}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Provenance:</span>
                    <span className="text-right text-slate-200">{activePoint.datasetName}</span>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Source:</span>
                    <span className="text-right text-slate-300">{activePoint.dataSource}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">Normalization:</span>
                    <span className="font-mono text-[10px] text-cyan-300">
                      {clustering?.normalizationMethod ?? 'Z-Score'}
                    </span>
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

        {/* Pinned / Mobile Detail Bar */}
        {activePoint && (
          <div className="mt-3 rounded-lg border border-cyan-500/35 bg-[#050b19] p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">{activePoint.name}</span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    PLANET_META[activePoint.body].badgeBg
                  }`}
                >
                  {activePoint.body}
                </span>
                <span className="font-mono text-[11px] text-violet-300">
                  C{activePoint.clusterId} ({activePoint.clusterLabel})
                </span>
              </div>
              {pinnedId && (
                <button
                  type="button"
                  onClick={() => setPinnedId(null)}
                  className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:border-cyan-400 hover:text-white"
                >
                  Unpin
                </button>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-slate-300 tabular-nums">
              <span>Slope: {activePoint.meanSlopeDeg.toFixed(1)}°</span>
              <span>
                TRI: {activePoint.triMeanM.toFixed(1)} m ({activePoint.triZ >= 0 ? '+' : ''}
                {activePoint.triZ.toFixed(2)}σ)
              </span>
              <span>Provenance: {activePoint.dataSource}</span>
              <span>Norm: {clustering?.normalizationMethod}</span>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Hover any marker for provenance &amp; metrics · Click to pin · Scroll wheel to zoom
            {zoom > 1 ? ' · Drag plot to pan' : ''}
          </span>
          <span className="font-mono">
            {clustering?.normalizationMethod ?? 'Z-Score Standardization'}
          </span>
        </div>
      </div>

      {/* Visually Distinct Cluster Summary Panels */}
      {clustering && clustering.clusters.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-semibold text-white">
              Morphometric Cluster Summaries ({clustering.k} Clusters)
            </h3>
            <span className="font-mono text-[11px] text-slate-400">
              {clustering.clusteringMethod} · {clustering.clusteringSpace}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {clustering.clusters.map((cluster) => {
              const style = CLUSTER_COLORS[cluster.clusterId] ?? CLUSTER_COLORS[1];
              const members = clustering.points.filter((p) => p.clusterId === cluster.clusterId);
              const earthCnt = members.filter((m) => m.body === 'Earth').length;
              const marsCnt = members.filter((m) => m.body === 'Mars').length;
              const moonCnt = members.filter((m) => m.body === 'Moon').length;
              const isFocused =
                hiddenClusters.size === clustering.clusters.length - 1 &&
                !hiddenClusters.has(cluster.clusterId);

              return (
                <div
                  key={cluster.clusterId}
                  className={`relative overflow-hidden rounded-xl border ${style.border} bg-[#060b18] flex flex-col justify-between`}
                >
                  {/* Distinct Top Color Accent Strip */}
                  <div className={`h-1 w-full ${style.accentLine}`} />

                  <div className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: style.color }}
                          />
                          <span className={`font-display text-xs font-bold ${style.text}`}>
                            Cluster {cluster.clusterId}: {cluster.label}
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-slate-400">
                          {cluster.count} {cluster.count === 1 ? 'region' : 'regions'} · Centroid (
                          {cluster.centroidSlopeZ >= 0 ? '+' : ''}
                          {cluster.centroidSlopeZ.toFixed(2)}σ,{' '}
                          {cluster.centroidTriZ >= 0 ? '+' : ''}
                          {cluster.centroidTriZ.toFixed(2)}σ)
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => focusOnlyCluster(cluster.clusterId)}
                        className={`shrink-0 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors ${
                          isFocused
                            ? `${style.bg} ${style.border} ${style.text}`
                            : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {isFocused ? 'Show All' : 'Isolate'}
                      </button>
                    </div>

                    {/* Feature Ranges */}
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800/90 bg-slate-900/60 p-2.5 font-mono text-[11px] tabular-nums">
                      <div>
                        <div className="text-[10px] text-slate-500">Slope Range</div>
                        <div className="font-semibold text-slate-100">
                          {cluster.slopeMinDeg.toFixed(1)}°–{cluster.slopeMaxDeg.toFixed(1)}°
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Mean {cluster.meanSlopeDeg.toFixed(1)}°
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Riley TRI Range</div>
                        <div className="font-semibold text-cyan-300">
                          {cluster.triMinM.toFixed(1)}–{cluster.triMaxM.toFixed(1)} m
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Mean {cluster.meanTriM.toFixed(1)} m
                        </div>
                      </div>
                    </div>

                    {/* Planet Membership Breakdown */}
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-400">
                      <span>Planets:</span>
                      {earthCnt > 0 && <span className="text-emerald-300">Earth {earthCnt}</span>}
                      {moonCnt > 0 && <span className="text-sky-300">Moon {moonCnt}</span>}
                      {marsCnt > 0 && <span className="text-orange-300">Mars {marsCnt}</span>}
                    </div>

                    {/* Clickable Member Regions */}
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => {
                        const isMemberPinned = pinnedId === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              setPinnedId((prev) => (prev === m.id ? null : m.id))
                            }
                            className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                              isMemberPinned
                                ? 'border-cyan-400 bg-cyan-500/20 text-white'
                                : 'border-slate-800 bg-slate-900/80 text-slate-300 hover:border-slate-700 hover:text-white'
                            }`}
                          >
                            {m.shortName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dedicated Expandable Scientific Methodology, Provenance & Missing-Measurement Audit Panel */}
      {clustering && (
        <div className="rounded-xl border border-slate-800/90 bg-[#060b18] overflow-hidden">
          <button
            type="button"
            onClick={() => setMethodologyOpen((o) => !o)}
            aria-expanded={methodologyOpen}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <Info className="h-4 w-4 text-cyan-400 shrink-0" />
              <span className="font-display text-xs font-semibold text-white">
                Scientific Methodology, Cross-Planet Scale Limitations &amp; Data Provenance Audit
              </span>
              <span className="font-mono text-[10px] text-slate-400">
                {clustering.points.length} Indexed · {clustering.unavailableRegions.length} Excluded ·{' '}
                {clustering.pendingExternalDatasets.length} Pending Uploads
              </span>
            </div>
            {methodologyOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
            )}
          </button>

          {methodologyOpen && (
            <div className="grid grid-cols-1 gap-4 border-t border-slate-800/80 p-4 lg:grid-cols-2">
              <div className="space-y-2.5 text-[11px] leading-relaxed">
                <div className="font-semibold text-slate-200">
                  Cross-Planet Scale &amp; Clustering Methodology
                </div>
                <p className="text-slate-400">{clustering.scaleCaveat}</p>
                <p className="text-amber-200/90">{clustering.limitationNote}</p>
                <div className="rounded-lg border border-slate-800 bg-[#040814] p-2.5 font-mono text-[10px] text-slate-300 space-y-1">
                  <div>
                    <span className="text-cyan-300">Z-Score Standardization:</span> z = (x − μ) / σ
                    across all valid regions
                  </div>
                  <div>
                    <span className="text-cyan-300">Clustering:</span> Deterministic K-Means++
                    (Euclidean distance in 2D normalized Slope/TRI space)
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-200">
                    <Database className="h-3.5 w-3.5 text-emerald-400" />
                    Data Provenance &amp; Missing-Measurement Audit
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 tabular-nums">
                    {clustering.unavailableRegions.length} Excluded
                  </span>
                </div>

                {clustering.unavailableRegions.length > 0 ? (
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {clustering.unavailableRegions.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5"
                      >
                        <div className="font-medium text-amber-200">
                          {u.name} ({u.body})
                        </div>
                        <div className="text-slate-400">{u.reason}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 leading-relaxed">
                    All {clustering.points.length} indexed sites (9 Earth, 3 Mars, 3 Moon) have
                    non-null published literature slope &amp; Riley TRI baselines. Uploaded records
                    missing slope or TRI are explicitly excluded rather than coerced to zero.
                  </p>
                )}

                <div className="rounded-lg border border-slate-800 bg-[#040814] p-2.5 text-[10px] text-slate-400 space-y-1">
                  <div>
                    <span className="font-semibold text-amber-300">Synthetic Calibration Grids:</span>{' '}
                    Used strictly for DEM visualization &amp; Horn/Riley benchmark checks — never
                    mixed into the 15 planetary scatter coordinates.
                  </div>
                  {clustering.pendingExternalDatasets.length > 0 && (
                    <div>
                      <span className="font-semibold text-slate-300">Pending External Files:</span>{' '}
                      {clustering.pendingExternalDatasets.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
