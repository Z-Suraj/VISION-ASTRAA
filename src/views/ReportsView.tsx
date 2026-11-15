import { useMemo, useState } from 'react';
import { Download, FileText, Plus, Printer, Trash2 } from 'lucide-react';
import AstraaLogo from '../components/AstraaLogo.tsx';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import type {
  AnalogSite,
  DatasetRecord,
  ResearchReportRecord,
  SimilarityWeights,
} from '../types/astraa.ts';

interface ReportsViewProps {
  reports: ResearchReportRecord[];
  sites: AnalogSite[];
  datasets: DatasetRecord[];
  weights: SimilarityWeights;
  onRefreshReports: () => Promise<void>;
}

export default function ReportsView({
  reports,
  sites,
  datasets,
  weights,
  onRefreshReports,
}: ReportsViewProps) {
  const earthSites = useMemo(() => sites.filter((s) => s.body === 'Earth'), [sites]);
  const targetSites = useMemo(() => sites.filter((s) => s.body !== 'Earth'), [sites]);

  const [earthId, setEarthId] = useState<string>('earth-ladakh');
  const [targetId, setTargetId] = useState<string>('mars-jezero');
  const [selectedReportId, setSelectedReportId] = useState<string>(reports[0]?.id ?? '');
  const [creating, setCreating] = useState(false);

  const activeReport =
    reports.find((r) => r.id === selectedReportId) ?? reports[0] ?? null;

  const handleGenerate = async () => {
    setCreating(true);
    try {
      const compRes = await fetch('/api/similarity/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ earthSiteId: earthId, targetId, weights }),
      });
      const ev = await compRes.json();

      const processedIds = datasets
        .filter((d) => d.processingStatus === 'Processed')
        .map((d) => d.id);

      const repRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Terrestrial Analogue Assessment: ${ev.earthSite.name} vs. ${ev.targetSite.name}`,
          earthSiteId: ev.earthSite.id,
          targetSiteId: ev.targetSite.id,
          similarityScore: ev.overallScore,
          confidencePct: ev.confidencePct,
          methodology: `Weighted multi-parameter evaluation (Slope ${weights.slope}, TRI ${weights.ruggedness}, Relief ${weights.relief}, Thermal ${weights.thermal}, Water/Ice ${weights.waterIce}, Mineralogy ${weights.mineralogy}) normalized over non-missing attributes. Raw planetary datums (WGS84/EGM96 vs. LOLA/MOLA) are never compared directly.`,
          findings: ev.explanation,
          limitations: `${ev.limitationsSummary} Weathering caveat: ${ev.earthSite.limitations.weatheringCaveat}.`,
          datasetIds: processedIds,
        }),
      });
      const created = (await repRes.json()) as ResearchReportRecord;
      await onRefreshReports();
      setSelectedReportId(created.id);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    await onRefreshReports();
  };

  const handleDownloadMarkdown = (rep: ResearchReportRecord) => {
    const earth = sites.find((s) => s.id === rep.earthSiteId);
    const target = sites.find((s) => s.id === rep.targetSiteId);
    const md = `**VISION ASTRAA** — *Explore Worlds. Discover Analogues. Advance Exploration.*

# ${rep.title}

Generated: ${rep.createdAt}
Weighted Similarity Score: ${rep.similarityScore}% (Data Confidence: ${rep.confidencePct}%)

## Target Pair
- Earth Region: ${earth?.name ?? rep.earthSiteId} (${earth?.status ?? ''})
- Planetary Target: ${target?.name ?? rep.targetSiteId} (${target?.body ?? ''})

## Methodology
${rep.methodology}

## Findings
${rep.findings}

## Physical & Data Limitations
${rep.limitations}

## Source Attribution
- Earth Baseline: ${earth?.sourceCitation ?? 'NASA/USGS/ESA Literature'}
- Planetary Target: ${target?.sourceCitation ?? 'NASA/USGS/ESA Literature'}
`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rep.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Report Generator Header */}
      <div className="no-print relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md">
        <CinematicBackdrop
          className="no-print"
          src="/assets/missions/observatory_horizon.webp"
          alt="Planetary observatory horizon"
          eager
          opacityClass="opacity-35"
          scrimClass="bg-gradient-to-r from-[#050814]/95 via-[#050814]/82 to-[#050814]/65"
        />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-cyan-400" />
              <h1 className="font-display text-xl font-bold text-white">Research Reports</h1>
            </div>
            <p className="mt-1 text-xs text-slate-300">
              Generate citation-ready scientific analogue assessments with methodology, dataset
              provenance, limitations, and Markdown/print export.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={earthId}
              onChange={(e) => setEarthId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100"
            >
              {earthSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100"
            >
              {targetSites.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.body}] {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={creating}
              onClick={handleGenerate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 whitespace-nowrap"
            >
              <Plus className="h-4 w-4" />
              {creating ? 'Generating...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Reports Split View */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <div className="no-print h-fit space-y-2.5 rounded-xl border border-slate-800/80 bg-[#080f23]/88 p-4 backdrop-blur-md lg:col-span-4">
          <h2 className="font-display text-sm font-semibold text-white">
            Saved Reports ({reports.length})
          </h2>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-400">
              No saved reports yet. Generate one above or save directly from Analog Finder /
              Comparison Studio.
            </p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                onClick={() => setSelectedReportId(r.id)}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  activeReport?.id === r.id
                    ? 'border-cyan-400/70 bg-cyan-500/10'
                    : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-100">{r.title}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(r.id);
                    }}
                    className="text-slate-500 hover:text-rose-400"
                    title="Delete report"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-1 font-mono text-[11px] text-cyan-300">
                  Score {r.similarityScore.toFixed(1)}% · Confidence {r.confidencePct}%
                </div>
              </div>
            ))
          )}
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/95 p-6 backdrop-blur-md lg:col-span-8">
          {activeReport ? (
            <article className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 print:border-slate-300 pb-4">
                <div className="space-y-2">
                  <div className="print:hidden">
                    <AstraaLogo variant="full" tone="dark" size="sm" />
                  </div>
                  <div className="hidden print:inline-flex">
                    <AstraaLogo variant="full" tone="light" size="sm" />
                  </div>
                  <div className="font-mono text-[11px] text-cyan-300 print:text-sky-700 pt-1">
                    SCIENTIFIC ANALOGUE REPORT · {activeReport.id}
                  </div>
                  <h2 className="mt-1 font-display text-xl font-bold text-white print:text-slate-900">
                    {activeReport.title}
                  </h2>
                  <p className="mt-1 font-mono text-xs text-slate-400 print:text-slate-600">
                    Generated {new Date(activeReport.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="no-print flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDownloadMarkdown(activeReport)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export .MD
                  </button>
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-500"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Print
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 font-mono">
                <div className="rounded-lg bg-slate-900/70 p-3">
                  <div className="text-[11px] text-slate-400">Weighted Similarity</div>
                  <div className="text-2xl font-bold text-cyan-300">
                    {activeReport.similarityScore.toFixed(1)}%
                  </div>
                </div>
                <div className="rounded-lg bg-slate-900/70 p-3">
                  <div className="text-[11px] text-slate-400">Data Confidence</div>
                  <div className="text-2xl font-bold text-emerald-300">
                    {activeReport.confidencePct}%
                  </div>
                </div>
              </div>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-white">
                  1. Scientific Methodology &amp; Datum Normalization
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">{activeReport.methodology}</p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-display text-sm font-semibold text-white">
                  2. Comparative Findings
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">{activeReport.findings}</p>
              </section>

              <section className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="font-display text-sm font-semibold text-amber-200">
                  3. Physical Limitations &amp; Source Attribution
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">{activeReport.limitations}</p>
                <p className="pt-1 font-mono text-[11px] text-slate-400">
                  Linked Processed Datasets: {activeReport.datasetIds.join(', ') || 'Literature baseline only'}
                </p>
              </section>
            </article>
          ) : (
            <div className="py-16 text-center text-sm text-slate-400">
              Generate a scientific report to inspect its methodology, comparison scores, and
              source attribution.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
