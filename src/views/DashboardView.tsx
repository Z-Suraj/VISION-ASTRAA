import { useState } from 'react';
import {
  ArrowRight,
  Compass,
  Database,
  FileText,
  Globe2,
  Layers,
  Mountain,
  Play,
  Sparkles,
} from 'lucide-react';
import PlanetaryGlobe3D from '../components/PlanetaryGlobe3D.tsx';
import TerrainMesh3D from '../components/TerrainMesh3D.tsx';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import SiteImage from '../components/SiteImage.tsx';
import type {
  AnalogSite,
  DatasetRecord,
  OverviewStats,
  PlanetaryBody,
  SimilarityEvaluation,
} from '../types/astraa.ts';

export type NavRoute =
  | 'dashboard'
  | 'explorer'
  | 'comparison'
  | 'analogs'
  | 'datacenter'
  | 'vizlab'
  | 'assistant'
  | 'reports'
  | 'settings';

interface DashboardViewProps {
  overview: OverviewStats | null;
  sites: AnalogSite[];
  datasets: DatasetRecord[];
  topMatches: SimilarityEvaluation[];
  onNavigate: (route: NavRoute) => void;
  onOpenMissionVideo: () => void;
}

export default function DashboardView({
  overview,
  sites,
  datasets,
  topMatches,
  onNavigate,
  onOpenMissionVideo,
}: DashboardViewProps) {
  const [heroBody, setHeroBody] = useState<PlanetaryBody>('Earth');
  const [selectedGlobeSite, setSelectedGlobeSite] = useState<AnalogSite | null>(null);

  const processedTerrainDs =
    datasets.find((d) => d.processingStatus === 'Processed' && d.summaryStats) ?? null;

  return (
    <div className="space-y-6">
      {/* Cinematic Planetary Hero — Inspired by Reference Images 3, 6, 9, 10 */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#070d1e]">
        <div className="relative min-h-[340px] lg:min-h-[370px] flex flex-col justify-between p-6 md:p-8 lg:flex-row lg:items-center lg:gap-8">
          <CinematicBackdrop
            src="/assets/backgrounds/hero_cosmos_panorama.webp"
            alt="Conceptual Earth, Moon, and Mars mission panorama"
            eager
            opacityClass="opacity-55"
            scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/75 to-[#050814]/45"
          />

          {/* Left Hero Copy */}
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="text-xs font-medium tracking-wide text-cyan-300">
              NASA Space Apps Challenge · Conceptual Mission Visualization
            </div>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-white sm:text-5xl text-balance">
              VISION <span className="text-cyan-400">ASTRAA</span>
            </h1>
            <p className="text-base font-medium text-slate-200 sm:text-lg">
              Earth, Moon &amp; Mars Terrain Intelligence and Digital Twin Platform
            </p>
            <p className="max-w-xl text-sm leading-relaxed text-slate-300">
              Characterize candidate terrestrial analogues across deserts, polar regions, impact
              craters, and volcanic highlands using verifiable morphometric, thermal, and
              mineralogical indicators before planetary deployment.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('analogs')}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-300 whitespace-nowrap"
              >
                <Compass className="h-4 w-4" />
                Start Analog Discovery
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenMissionVideo}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-600/80 bg-[#0b1329]/80 px-4 py-2.5 text-sm font-medium text-slate-100 transition-colors hover:border-cyan-400/60 hover:text-cyan-200 whitespace-nowrap"
              >
                <Play className="h-4 w-4 text-cyan-400" />
                Watch Mission Loop
              </button>
            </div>
          </div>

          {/* Right Floating Mission Overview Card — Matches Reference Image 9 & 11 */}
          <div className="relative z-10 mt-6 w-full max-w-sm rounded-xl border border-slate-700/70 bg-[#070e22]/90 p-5 lg:mt-0">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                Mission Repository Status
              </span>
              <span className="font-mono text-[11px] text-cyan-300">SQLite Live</span>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Earth Analogue Regions</span>
                <span className="font-mono font-semibold text-white">
                  {overview?.totalEarthAnalogs ?? 9} ({overview?.establishedAnalogs ?? 3} ref ·{' '}
                  {overview?.candidateAnalogs ?? 6} cand)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Moon &amp; Mars Targets</span>
                <span className="font-mono font-semibold text-white">
                  {overview?.planetaryTargets ?? 6} regions
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Processed Datasets</span>
                <span className="font-mono font-semibold text-emerald-300">
                  {overview?.processedDatasets ?? 2} ready
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Unmounted Uploads</span>
                <span className="font-mono font-semibold text-amber-300">
                  {overview?.pendingDatasets ?? 4} awaiting file
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('datacenter')}
              className="mt-4 flex w-full items-center justify-between rounded-lg border border-slate-700/80 bg-slate-900/70 px-3.5 py-2 text-xs font-medium text-cyan-300 hover:border-cyan-500/50 hover:bg-slate-800/80"
            >
              <span>Inspect &amp; Upload Datasets</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* 4-Column Interactive Bento — Directly inspired by Reference Image 9 */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Earth Analogs Discovery */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080f23]/82 backdrop-blur-md p-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe2 className="h-4 w-4 text-cyan-400" />
                <h2 className="font-display text-sm font-semibold text-white">
                  Earth Analog Discovery
                </h2>
              </div>
              <span className="font-mono text-[11px] text-emerald-400">Active</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Evaluate reference &amp; candidate terrestrial environments
            </p>
            <div className="relative mt-3 overflow-hidden rounded-lg border border-slate-800">
              <SiteImage
                src="/assets/earth/ladakh_valley.webp"
                alt="Ladakh cold desert candidate landscape"
                className="h-36 w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 py-2 text-[11px] text-slate-200">
                Leh–Nubra · Spiti · Atacama · Haughton
              </div>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
              <li>• Configurable multi-variable weighting</li>
              <li>• Transparent missing-data handling</li>
              <li>• Explicit gravity &amp; atmosphere caveats</li>
            </ul>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('analogs')}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
          >
            <span>Open Analog Finder</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Card 2: Interactive 3D Planetary Globe */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-white">
                3D Planetary Explorer
              </h2>
              <div className="flex items-center gap-1 rounded-lg bg-slate-900 p-0.5 text-[11px]">
                {(['Earth', 'Moon', 'Mars'] as PlanetaryBody[]).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => {
                      setHeroBody(b);
                      setSelectedGlobeSite(null);
                    }}
                    className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                      heroBody === b
                        ? 'bg-cyan-400 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Click surface markers to inspect coordinates
            </p>
            <div className="mt-3">
              <PlanetaryGlobe3D
                body={heroBody}
                sites={sites}
                selectedSiteId={selectedGlobeSite?.id}
                onSelectSite={(s) => setSelectedGlobeSite(s)}
                heightClass="h-[220px]"
                compact
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="truncate text-slate-300">
              {selectedGlobeSite
                ? `${selectedGlobeSite.name}`
                : `${sites.filter((s) => s.body === heroBody).length} mapped ${heroBody} sites`}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('explorer')}
              className="inline-flex items-center gap-1 font-semibold text-cyan-300 hover:text-cyan-200 whitespace-nowrap"
            >
              <span>Full Explorer</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Card 3: Terrain Intelligence 3D DEM */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080f23] p-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mountain className="h-4 w-4 text-cyan-400" />
                <h2 className="font-display text-sm font-semibold text-white">
                  Terrain Intelligence
                </h2>
              </div>
              <span className="font-mono text-[11px] text-slate-400">Horn + TRI</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Interactive 3D DEM heightfield &amp; slope model
            </p>
            <div className="mt-3">
              {processedTerrainDs?.summaryStats ? (
                <TerrainMesh3D
                  stats={processedTerrainDs.summaryStats}
                  title={processedTerrainDs.filename}
                  heightClass="h-[220px]"
                />
              ) : (
                <div className="flex h-[220px] items-center justify-center rounded-xl border border-slate-800 bg-[#050916] text-xs text-slate-400">
                  Upload a DEM grid in Data Center
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('vizlab')}
            className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200"
          >
            <span>Open Visualization Lab</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Card 4: Scientific Comparison Studio */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080f23]/82 backdrop-blur-md p-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                <h2 className="font-display text-sm font-semibold text-white">
                  Scientific Comparison
                </h2>
              </div>
              <span className="font-mono text-[11px] text-slate-400">Cross-Planet</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Side-by-side Earth vs. Moon &amp; Mars morphometry
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden rounded-lg border border-slate-800">
              <div className="relative h-36">
                <SiteImage
                  src="/assets/geological/volcanic_iceland_basalt.webp"
                  alt="Iceland basaltic volcanic terrain"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1.5 left-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300">
                  Earth
                </span>
              </div>
              <div className="relative h-36">
                <SiteImage
                  src="/assets/mars/mars_valles_canyon.webp"
                  alt="Mars Valles Marineris layered canyon terrain"
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">
                  Mars
                </span>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
              <div className="rounded-lg bg-slate-900/80 py-2">
                <div className="text-slate-400">Slope</div>
                <div className="font-semibold text-white">Horn 3×3</div>
              </div>
              <div className="rounded-lg bg-slate-900/80 py-2">
                <div className="text-slate-400">Texture</div>
                <div className="font-semibold text-white">Riley TRI</div>
              </div>
              <div className="rounded-lg bg-slate-900/80 py-2">
                <div className="text-slate-400">Datum</div>
                <div className="font-semibold text-cyan-300">Normalized</div>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('comparison')}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200"
          >
            <span>Open Comparison Studio</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* Bottom 3-Column Mission Control Row — Matches Reference Images 9 & 11 */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Dataset Ingestion & Coverage */}
        <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-cyan-400" />
              <h3 className="font-display text-sm font-semibold text-white">
                Dataset Pipeline Status
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('datacenter')}
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
            >
              Manage →
            </button>
          </div>
          <div className="mt-4 space-y-2.5">
            {datasets.slice(0, 5).map((ds) => (
              <div
                key={ds.id}
                className="flex items-center justify-between rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <div className="truncate font-mono text-slate-200">{ds.filename}</div>
                  <div className="text-[11px] text-slate-400">
                    {ds.format} · {ds.planet}
                  </div>
                </div>
                <span
                  className={`shrink-0 font-mono text-[11px] font-medium ${
                    ds.processingStatus === 'Processed'
                      ? 'text-emerald-300'
                      : ds.processingStatus === 'Pending Upload (Not Mounted)'
                        ? 'text-amber-300'
                        : 'text-rose-300'
                  }`}
                >
                  {ds.processingStatus === 'Processed' ? 'Processed' : 'Awaiting Upload'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Ranked Analog Candidates (Live vs Jezero Crater) */}
        <div className="rounded-xl border border-slate-800/80 bg-[#080f23] p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-white">
              Ranked Analogs vs. Jezero Crater
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('analogs')}
              className="text-xs font-medium text-cyan-300 hover:text-cyan-200"
            >
              Configure →
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Default multi-parameter fit (adjustable weights in Analog Finder)
          </p>
          <div className="mt-3 space-y-2.5">
            {topMatches.slice(0, 4).map((m, idx) => (
              <div
                key={m.earthSite.id}
                className="rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-100">
                    {idx + 1}. {m.earthSite.name}
                  </span>
                  <span className="font-mono font-semibold text-cyan-300">
                    {m.overallScore.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400"
                    style={{ width: `${m.overallScore}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-400">
                  <span>{m.earthSite.status}</span>
                  <span>Confidence {m.confidencePct}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Research Activity & Quick Tools */}
        <div className="flex flex-col justify-between rounded-xl border border-slate-800/80 bg-[#080f23] p-5">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-semibold text-white">
                Recent Research Activity
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('reports')}
                className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200"
              >
                <FileText className="h-3.5 w-3.5" />
                Reports
              </button>
            </div>
            <div className="mt-3 space-y-2.5">
              {(overview?.recentActivity ?? []).slice(0, 4).map((act) => (
                <div
                  key={act.id}
                  className="border-b border-slate-800/70 pb-2 last:border-b-0 last:pb-0"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-200">{act.action}</span>
                    <span className="font-mono text-[10px] text-slate-500">{act.module}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2">{act.detail}</p>
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('assistant')}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800/90 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-slate-700"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            Ask AI Research Assistant
          </button>
        </div>
      </section>

      {/* Trusted Agency & Attribution Footer — Matches Reference Image 9 */}
      <footer className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800/80 bg-[#070d1f] px-5 py-3.5 text-xs text-slate-400">
        <div>
          Reference Baselines: <span className="text-slate-200">NASA (SRTM, LRO/LOLA, MRO/HiRISE/MOLA) · USGS Astrogeology · ESA Planetary Analogs · ISRO Reconnaissance Literature</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          Conceptual hero visuals attributed separately from measured datasets
        </div>
      </footer>
    </div>
  );
}
