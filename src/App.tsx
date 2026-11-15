import { useCallback, useEffect, useState } from 'react';
import AppShell from './components/AppShell.tsx';
import MissionVideoModal from './components/MissionVideoModal.tsx';
import type {
  AnalogSite,
  DatasetRecord,
  OverviewStats,
  ResearchReportRecord,
  SimilarityEvaluation,
  SimilarityWeights,
} from './types/astraa.ts';
import type { AppRoute, NavRoute } from './types/navigation.ts';
import AnalogFinderView from './views/AnalogFinderView.tsx';
import AssistantView from './views/AssistantView.tsx';
import ComparisonView from './views/ComparisonView.tsx';
import DashboardView from './views/DashboardView.tsx';
import DataCenterView from './views/DataCenterView.tsx';
import ExplorerView from './views/ExplorerView.tsx';
import HelpView from './views/HelpView.tsx';
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

export default function App() {
  const [route, setRoute] = useState<AppRoute>('landing');
  const [missionVideoOpen, setMissionVideoOpen] = useState(false);

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

  const navigateTo = useCallback((next: AppRoute) => {
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
    navigateTo('reports');
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

  const activeNavRoute: NavRoute = route;

  const explorerBodyProp =
    activeNavRoute === 'explorer-earth'
      ? 'Earth'
      : activeNavRoute === 'explorer-moon'
        ? 'Moon'
        : activeNavRoute === 'explorer-mars'
          ? 'Mars'
          : undefined;

  return (
    <>
      <AppShell
        activeRoute={activeNavRoute}
        sites={sites}
        loading={loading}
        onNavigate={navigateTo}
        onNavigateLanding={() => navigateTo('landing')}
        onSelectSite={(siteId) => {
          setSelectedExplorerSiteId(siteId);
          navigateTo('explorer');
        }}
        onOpenMissionVideo={() => setMissionVideoOpen(true)}
      >
        {activeNavRoute === 'dashboard' && (
          <DashboardView
            overview={overview}
            sites={sites}
            datasets={datasets}
            topMatches={topMatches}
            onNavigate={navigateTo}
            onOpenMissionVideo={() => setMissionVideoOpen(true)}
          />
        )}

        {(activeNavRoute === 'explorer' ||
          activeNavRoute === 'explorer-earth' ||
          activeNavRoute === 'explorer-moon' ||
          activeNavRoute === 'explorer-mars') && (
          <ExplorerView
            sites={sites}
            datasets={datasets}
            initialSelectedSiteId={selectedExplorerSiteId}
            initialBody={explorerBodyProp}
          />
        )}

        {(activeNavRoute === 'comparison' || activeNavRoute === 'similarity-results') && (
          <ComparisonView
            sites={sites}
            datasets={datasets}
            weights={weights}
            onCreateReportFromComparison={handleCreateReportFromComparison}
            focusMode={activeNavRoute === 'similarity-results' ? 'matrix' : 'studio'}
          />
        )}

        {activeNavRoute === 'analogs' && (
          <AnalogFinderView
            sites={sites}
            weights={weights}
            onChangeWeights={setWeights}
            onResetWeights={() => setWeights(DEFAULT_WEIGHTS)}
            onCreateReportFromComparison={handleCreateReportFromComparison}
          />
        )}

        {activeNavRoute === 'datacenter' && (
          <DataCenterView datasets={datasets} onRefresh={loadAllData} />
        )}

        {(activeNavRoute === 'vizlab' || activeNavRoute === 'morphometrics') && (
          <VisualizationLabView
            datasets={datasets}
            sites={sites}
            focusMode={activeNavRoute === 'morphometrics' ? 'morphometrics' : 'full'}
          />
        )}

        {activeNavRoute === 'reports' && (
          <ReportsView
            reports={reports}
            sites={sites}
            datasets={datasets}
            weights={weights}
            onRefreshReports={loadAllData}
          />
        )}

        {activeNavRoute === 'assistant' && <AssistantView sites={sites} />}

        {activeNavRoute === 'settings' && (
          <SettingsView
            weights={weights}
            onChangeWeights={setWeights}
            onResetWeights={() => setWeights(DEFAULT_WEIGHTS)}
            datasets={datasets}
          />
        )}

        {activeNavRoute === 'help' && <HelpView onNavigate={navigateTo} />}
      </AppShell>

      <MissionVideoModal
        open={missionVideoOpen}
        onClose={() => setMissionVideoOpen(false)}
      />
    </>
  );
}
