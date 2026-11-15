import { RotateCcw, Settings as SettingsIcon } from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import type { DatasetRecord, SimilarityWeights } from '../types/astraa.ts';

interface SettingsViewProps {
  weights: SimilarityWeights;
  onChangeWeights: (w: SimilarityWeights) => void;
  onResetWeights: () => void;
  datasets: DatasetRecord[];
}

export default function SettingsView({
  weights,
  onChangeWeights,
  onResetWeights,
  datasets,
}: SettingsViewProps) {
  const pendingCount = datasets.filter(
    (d) => d.processingStatus === 'Pending Upload (Not Mounted)'
  ).length;
  const processedCount = datasets.filter(
    (d) => d.processingStatus === 'Processed'
  ).length;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md">
        <CinematicBackdrop
          src="/assets/planets/earth_orbit_horizon.webp"
          alt="Earth atmospheric horizon from low Earth orbit"
          eager
          opacityClass="opacity-35"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/65"
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-cyan-400" />
            <h1 className="font-display text-xl font-bold text-white">
              Platform Calibration &amp; Scientific Settings
            </h1>
          </div>
          <p className="mt-1 text-xs text-slate-300">
            Configure global similarity model weights, inspect planetary datum conventions, and review
            dataset ingestion integrity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Default Weights */}
        <div className="space-y-4 rounded-xl border border-slate-800/80 bg-[#080f23]/88 p-5 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="font-display text-sm font-semibold text-white">
              Default Analogue Weighting Profile
            </h2>
            <button
              type="button"
              onClick={onResetWeights}
              className="inline-flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore Defaults
            </button>
          </div>
          <div className="space-y-3">
            {(Object.keys(weights) as (keyof SimilarityWeights)[]).map((key) => (
              <div key={key} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="capitalize text-slate-200">{key}</span>
                  <span className="font-mono text-cyan-300">{weights[key]}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  step="5"
                  value={weights[key]}
                  onChange={(e) =>
                    onChangeWeights({ ...weights, [key]: Number(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Scientific Integrity & Datum Policy */}
        <div className="space-y-4 rounded-xl border border-slate-800/80 bg-[#080f23]/88 p-5 text-xs backdrop-blur-md">
          <h2 className="font-display text-sm font-semibold text-white border-b border-slate-800 pb-3">
            Coordinate Systems, Datums &amp; Data Integrity
          </h2>
          <div className="space-y-3 text-slate-300 leading-relaxed">
            <div>
              <span className="font-semibold text-white">Earth Reference Datum:</span> WGS84 /
              EGM96 Geoid (SRTMGL1 1-arcsecond / SRTM3 3-arcsecond).
            </div>
            <div>
              <span className="font-semibold text-white">Moon Reference Datum:</span> LRO LOLA
              1,737.4 km spherical equipotential radius.
            </div>
            <div>
              <span className="font-semibold text-white">Mars Reference Datum:</span> MOLA Mars
              Aeroid (3,396.19 km equatorial radius).
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 font-mono text-[11px]">
              Processed Datasets in SQLite: {processedCount}
              <br />
              Pending Unmounted Uploads: {pendingCount}
              <br />
              Conceptual Visuals: Labeled explicitly — excluded from numerical calculations.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
