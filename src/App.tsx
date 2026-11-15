import { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Compass,
  Database,
  FileText,
  Globe2,
  Home,
  Layers,
  Menu,
  Play,
  Search,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import MissionVideoModal from './components/MissionVideoModal.tsx';
import CinematicBackdrop from './components/CinematicBackdrop.tsx';
import SiteImage from './components/SiteImage.tsx';
import type {
  AnalogSite,
  DatasetRecord,
  OverviewStats,
  ResearchReportRecord,
  SimilarityEvaluation,
  SimilarityWeights,
} from './types/astraa.ts';
import AnalogFinderView from './views/AnalogFinderView.tsx';
import AssistantView from './views/AssistantView.tsx';
import ComparisonView from './views/ComparisonView.tsx';
import DashboardView, { type NavRoute } from './views/DashboardView.tsx';
import DataCenterView from './views/DataCenterView.tsx';
import ExplorerView from './views/ExplorerView.tsx';
import LandingView from './views/LandingView.tsx';
import ReportsView from './views/ReportsView.tsx';
import SettingsView from './views/SettingsView.tsx';
import VisualizationLabView from './views/VisualizationLabView.tsx';

const DEFAULT_WEIGHTS: SimilarityWeights = {
  slope: 25,
  ruggedness: 20,
  relief: 15,
  thermal: 15,
  waterIce: 15,
  mineralogy: 10,
};

type AppRoute = 'landing' | NavRoute;

const NAV_ITEMS: { id: NavRoute; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Mission Control', icon: Home },
  { id: 'explorer', label: 'Planetary Explorer', icon: Globe2 },
  { id: 'analogs', label: 'Earth Analog Finder', icon: Compass },
  { id: 'comparison', label: 'Comparison Studio', icon: Layers },
  { id: 'datacenter', label: 'Data Center', icon: Database },
  { id: 'vizlab', label: 'Visualization Lab', icon: BarChart3 },
  { id: 'assistant', label: 'AI Assistant', icon: Sparkles },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [route, setRoute] = useState<AppRoute>('landing');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [missionVideoOpen, setMissionVideoOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [sites, setSites] = useState<AnalogSite[]>([]);
  const [datasets, setDatasets] = useState<DatasetRecord[]>([]);
  const [reports, setReports] = useState<ResearchReportRecord[]>([]);
  const [topMatches, setTopMatches] = useState<SimilarityEvaluation[]>([]);
  const [weights, setWeights] = useState<SimilarityWeights>(DEFAULT_WEIGHTS);
  const [loading, setLoading] = useState(true);
  const [selectedExplorerSiteId, setSelectedExplorerSiteId] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      const [ovRes, sitesRes, dsRes, repRes, rankRes] = await Promise.all([
        fetch('/api/overview'),
        fetch('/api/sites'),
        fetch('/api/datasets'),
        fetch('/api/reports'),
        fetch('/api/similarity/rank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetId: 'mars-jezero', weights: DEFAULT_WEIGHTS }),
        }),
      ]);
      const [ov, s, ds, rep, rank] = await Promise.all([
        ovRes.json(),
        sitesRes.json(),
        dsRes.json(),
        repRes.json(),
        rankRes.json(),
      ]);
      setOverview(ov);
      setSites(s);
      setDatasets(ds);
      setReports(rep);
      setTopMatches(rank.results ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handleCreateReportFromComparison = async (ev: SimilarityEvaluation) => {
    const processedIds = datasets
      .filter((d) => d.processingStatus === 'Processed')
      .map((d) => d.id);
    await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Analogue Report: ${ev.earthSite.name} vs. ${ev.targetSite.name}`,
        earthSiteId: ev.earthSite.id,
        targetSiteId: ev.targetSite.id,
        similarityScore: ev.overallScore,
        confidencePct: ev.confidencePct,
        methodology: `Configurable multi-parameter scoring (Slope ${weights.slope}, TRI ${weights.ruggedness}, Relief ${weights.relief}, Thermal ${weights.thermal}, Water/Ice ${weights.waterIce}, Mineralogy ${weights.mineralogy}).`,
        findings: ev.explanation,
        limitations: `${ev.limitationsSummary} Weathering caveat: ${ev.earthSite.limitations.weatheringCaveat}.`,
        datasetIds: processedIds,
      }),
    });
    await loadAllData();
    setRoute('reports');
  };

  const filteredSearchSites = searchQuery.trim()
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.region.toLowerCase().includes(searchQuery.toLowerCase()) ||
          s.category.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const navigateTo = (next: AppRoute) => {
    setRoute(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (route === 'landing') {
    return (
      <>
        <LandingView
          overview={overview}
          sites={sites}
          datasets={datasets}
          onEnterApp={(target, siteId) => {
            if (siteId) setSelectedExplorerSiteId(siteId);
            navigateTo(target);
          }}
          onOpenDemo={() => setMissionVideoOpen(true)}
        />
        <MissionVideoModal
          open={missionVideoOpen}
          onClose={() => setMissionVideoOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#050814] text-slate-100 flex">
      {/* Persistent Mission Control Sidebar — Inspired by Reference Images 2, 7, 8, 11 */}
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col justify-between border-r border-slate-800/80 bg-[#060b1a] transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Mark */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
            <button
              type="button"
              onClick={() => navigateTo('landing')}
              className="flex items-center gap-3 text-left"
              title="Return to VISION ASTRAA Landing Page"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 font-display font-extrabold text-sm">
                VA
              </div>
              <div>
                <div className="font-display text-base font-extrabold tracking-wide text-white whitespace-nowrap">
                  VISION <span className="text-cyan-400">ASTRAA</span>
                </div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap">
                  Earth · Moon · Mars Twin
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:text-white lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 p-3">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = route === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setRoute(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-200 border border-cyan-500/40'
                      : 'text-slate-300 hover:bg-slate-900/80 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Atmospheric Observatory Horizon Panel — Matches Reference Images 7, 8, 11 */}
        <div className="p-3">
          <div className="relative overflow-hidden rounded-xl border border-slate-800/80">
            <SiteImage
              src="/assets/missions/observatory_horizon.webp"
              alt="Deep space observatory horizon concept"
              className="h-28 w-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050814] via-[#050814]/50 to-transparent" />
            <div className="relative z-10 -mt-12 p-3">
              <div className="font-display text-xs font-semibold text-white">
                NASA Space Apps
              </div>
              <div className="text-[11px] text-slate-300">
                Analogue Characterization Lab
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Shell with Route-Aware Layered Atmospheric Backdrop */}
      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-[#050814]">
        <CinematicBackdrop
          className="no-print"
          src={
            route === 'dashboard'
              ? '/assets/planets/earth_orbit_horizon.webp'
              : route === 'explorer'
                ? '/assets/textures/deep_space_nebula_research.webp'
                : route === 'comparison'
                  ? '/assets/geological/volcanic_iceland_basalt.webp'
                  : route === 'analogs'
                    ? '/assets/landscapes/atacama_hyperarid_basin.webp'
                    : route === 'datacenter'
                      ? '/assets/satellite/satellite_swath_telemetry.webp'
                      : route === 'vizlab'
                        ? '/assets/satellite/satellite_swath_telemetry.webp'
                        : route === 'assistant'
                          ? '/assets/textures/deep_space_nebula_research.webp'
                          : route === 'reports'
                            ? '/assets/geological/impact_crater_basalt.webp'
                            : '/assets/missions/observatory_horizon.webp'
          }
          alt="Module planetary atmospheric backdrop"
          opacityClass={
            route === 'vizlab'
              ? 'opacity-[0.12]'
              : route === 'datacenter' || route === 'reports'
                ? 'opacity-[0.16]'
                : route === 'assistant'
                  ? 'opacity-30'
                  : 'opacity-[0.20]'
          }
          scrimClass="bg-gradient-to-b from-[#050814]/90 via-[#050814]/82 to-[#050814]/95"
        />

        {/* 3-Zone Top Bar */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-800/80 bg-[#050814]/80 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg border border-slate-800 p-2 text-slate-300 hover:text-white lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="truncate font-display text-sm font-semibold text-white">
              {NAV_ITEMS.find((i) => i.id === route)?.label}
            </div>
          </div>

          {/* Search Across Sites */}
          <div className="relative hidden md:block w-full max-w-sm">
            <Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Ladakh, Jezero, Shackleton, Atacama..."
              className="w-full rounded-xl border border-slate-800 bg-[#091024] py-2 pr-3 pl-9 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            {filteredSearchSites.length > 0 && (
              <div className="absolute right-0 left-0 mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-slate-700 bg-[#081024] p-1.5 shadow-xl">
                {filteredSearchSites.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedExplorerSiteId(s.id);
                      setRoute('explorer');
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-800"
                  >
                    <span className="font-medium text-slate-100">{s.name}</span>
                    <span className="font-mono text-[11px] text-cyan-300">{s.body}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateTo('landing')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 whitespace-nowrap"
            >
              Landing Home
            </button>
            <button
              type="button"
              onClick={() => setMissionVideoOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20 whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 text-cyan-400" />
              Mission Brief
            </button>
          </div>
        </header>

        {/* Active Module Viewport */}
        <main className="relative z-10 mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-slate-800 bg-[#080f23] text-sm text-slate-400">
              Loading VISION ASTRAA scientific repository...
            </div>
          ) : (
            <>
              {route === 'dashboard' && (
                <DashboardView
                  overview={overview}
                  sites={sites}
                  datasets={datasets}
                  topMatches={topMatches}
                  onNavigate={setRoute}
                  onOpenMissionVideo={() => setMissionVideoOpen(true)}
                />
              )}
              {route === 'explorer' && (
                <ExplorerView
                  sites={sites}
                  datasets={datasets}
                  initialSelectedSiteId={selectedExplorerSiteId}
                />
              )}
              {route === 'comparison' && (
                <ComparisonView
                  sites={sites}
                  datasets={datasets}
                  weights={weights}
                  onCreateReportFromComparison={handleCreateReportFromComparison}
                />
              )}
              {route === 'analogs' && (
                <AnalogFinderView
                  sites={sites}
                  weights={weights}
                  onChangeWeights={setWeights}
                  onResetWeights={() => setWeights(DEFAULT_WEIGHTS)}
                  onCreateReportFromComparison={handleCreateReportFromComparison}
                />
              )}
              {route === 'datacenter' && (
                <DataCenterView datasets={datasets} onRefresh={loadAllData} />
              )}
              {route === 'vizlab' && (
                <VisualizationLabView datasets={datasets} sites={sites} />
              )}
              {route === 'assistant' && <AssistantView sites={sites} />}
              {route === 'reports' && (
                <ReportsView
                  reports={reports}
                  sites={sites}
                  datasets={datasets}
                  weights={weights}
                  onRefreshReports={loadAllData}
                />
              )}
              {route === 'settings' && (
                <SettingsView
                  weights={weights}
                  onChangeWeights={setWeights}
                  onResetWeights={() => setWeights(DEFAULT_WEIGHTS)}
                  datasets={datasets}
                />
              )}
            </>
          )}
        </main>
      </div>

      <MissionVideoModal
        open={missionVideoOpen}
        onClose={() => setMissionVideoOpen(false)}
      />
    </div>
  );
}
