import { BookOpen, Compass, Database, Layers, ShieldAlert } from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import AstraaLogo from '../components/AstraaLogo.tsx';
import type { NavRoute } from '../types/navigation.ts';

interface HelpViewProps {
  onNavigate: (route: NavRoute) => void;
}

export default function HelpView({ onNavigate }: HelpViewProps) {
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-6 backdrop-blur-md">
        <CinematicBackdrop
          src="/assets/missions/observatory_horizon.webp"
          alt="Deep space observatory documentation backdrop"
          eager
          opacityClass="opacity-35"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/65"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <AstraaLogo variant="compact" tone="dark" size="sm" />
            <div className="flex items-center gap-2 pt-1">
              <BookOpen className="h-5 w-5 text-cyan-400" />
              <h1 className="font-display text-xl font-bold text-white">
                Scientific Methodology &amp; Platform Documentation
              </h1>
            </div>
            <p className="text-xs leading-relaxed text-slate-300">
              Reference guide for VISION ASTRAA morphometric algorithms, planetary vertical datums,
              supported geospatial ingestion formats, and terrestrial analogue constraints.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('datacenter')}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
          >
            <Database className="h-4 w-4 text-cyan-400" />
            Open Data Center
          </button>
        </div>
      </div>

      {/* Methodology & Datums Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800/80 bg-[#080f23]/88 p-5 space-y-3 backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Layers className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-sm font-semibold text-white">
              1. Terrain Morphometry Equations
            </h2>
          </div>
          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div>
              <div className="font-semibold text-white">Horn 3×3 Surface Slope (°)</div>
              <p className="mt-0.5 text-slate-400">
                Computed from central-difference partial derivatives across a 3×3 kernel weighted by
                latitude-corrected geodesic grid spacing (Δx, Δy) in meters:
              </p>
              <code className="mt-1 block rounded-lg border border-slate-800 bg-[#050814] px-3 py-2 font-mono text-[11px] text-cyan-300">
                slope = atan(sqrt((∂z/∂x)² + (∂z/∂y)²)) × (180 / π)
              </code>
            </div>
            <div>
              <div className="font-semibold text-white">Riley Terrain Ruggedness Index (TRI, m)</div>
              <p className="mt-0.5 text-slate-400">
                Root-mean-square elevation difference between each center pixel and its 8 immediate
                neighbors across the local DEM window.
              </p>
            </div>
            <div>
              <div className="font-semibold text-white">Hypsometric Integral (HI)</div>
              <p className="mt-0.5 text-slate-400">
                Dimensionless relief maturity index <span className="font-mono text-slate-200">(mean − min) / (max − min)</span> bounded in [0, 1].
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-[#080f23]/88 p-5 space-y-3 backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Compass className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-sm font-semibold text-white">
              2. Cross-Planet Vertical Datum Discipline
            </h2>
          </div>
          <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
            <p>
              Raw elevations are <strong className="text-white">never</strong> compared across planets
              because each body uses an independent zero-elevation reference:
            </p>
            <ul className="space-y-2 rounded-lg border border-slate-800 bg-[#050814]/80 p-3 font-mono text-[11px]">
              <li>
                <span className="text-emerald-300 font-semibold">Earth:</span> WGS84 / EGM96 Geoid
                (mean sea level equipotential)
              </li>
              <li>
                <span className="text-slate-200 font-semibold">Moon:</span> LRO LOLA 1,737.4 km
                reference sphere
              </li>
              <li>
                <span className="text-orange-300 font-semibold">Mars:</span> MOLA Aeroid
                (3,396.19 km equatorial radius)
              </li>
            </ul>
            <p className="text-slate-400">
              Instead, VISION ASTRAA evaluates datum-independent <strong className="text-slate-200">Relative Topographic Relief</strong>{' '}
              (local elevation span), surface slope distributions, and Z-score/Min-Max standardized Riley TRI.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-slate-800/80 bg-[#080f23]/88 p-5 space-y-3 backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
            <Database className="h-4 w-4 text-cyan-400" />
            <h2 className="font-display text-sm font-semibold text-white">
              3. Supported Geospatial File Formats
            </h2>
          </div>
          <ul className="space-y-2 text-xs text-slate-300">
            <li>
              <span className="font-mono font-semibold text-cyan-300">.HGT / .ZIP (SRTMGL1)</span> —
              Big-endian 16-bit signed elevation tiles (3601×3601 or 1201×1201) with automatic -32768 void handling.
            </li>
            <li>
              <span className="font-mono font-semibold text-cyan-300">.ASC (ESRI ASCII Grid)</span> —
              Header-driven gridded raster elevations (NCOLS, NROWS, CELLSIZE, NODATA_VALUE).
            </li>
            <li>
              <span className="font-mono font-semibold text-cyan-300">.CSV / .TSV</span> —
              Gridded elevation matrices (<code className="text-slate-200">row, col, elevation_m</code>) or tabular planetary analogue catalogs.
            </li>
            <li>
              <span className="font-mono font-semibold text-cyan-300">.GeoJSON</span> —
              FeatureCollections containing regional analogue coordinates and terrain properties.
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3 backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-amber-500/20 pb-3">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            <h2 className="font-display text-sm font-semibold text-amber-200">
              4. Analogue Limitations &amp; Data Provenance
            </h2>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            No Earth site replicates lunar or Martian gravity (0.165g / 0.38g), vacuum or low-pressure CO₂
            atmospheres, or unshielded ionizing radiation. Missing parameters are explicitly flagged
            and excluded from weighted averages — never imputed as zero.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => onNavigate('similarity-results')}
              className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
            >
              Inspect Similarity Results Table
            </button>
            <button
              type="button"
              onClick={() => onNavigate('morphometrics')}
              className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400/50 hover:text-cyan-200"
            >
              Open Morphometric Clustering
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
