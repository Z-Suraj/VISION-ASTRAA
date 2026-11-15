import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import CinematicBackdrop from '../components/CinematicBackdrop.tsx';
import type { AnalogSite } from '../types/astraa.ts';

interface AssistantViewProps {
  sites: AnalogSite[];
}

interface AiStructuredResponse {
  retrievedFacts: string[];
  scientificInterpretation: string;
  limitationsAndCaveats: string[];
  recommendedNextSteps: string[];
  model?: string;
  groundedSiteCount?: number;
  groundedDatasetCount?: number;
  generatedAt?: string;
}

interface ConversationItem {
  id: string;
  question: string;
  earthSiteId: string;
  targetSiteId: string;
  earthSiteName: string;
  targetSiteName: string;
  pending?: boolean;
  response?: AiStructuredResponse;
  error?: string;
}

const PRESET_QUESTIONS: Array<{
  label: string;
  earthSiteId: string;
  targetSiteId: string;
}> = [
  {
    label:
      'Compare Ladakh (N34° E077°) and Atacama Desert as partial analogues for Jezero Crater on Mars, separating verified database metrics from hypotheses.',
    earthSiteId: 'earth-ladakh',
    targetSiteId: 'mars-jezero',
  },
  {
    label:
      'Which terrestrial regions in our database best support Lunar South Pole (Shackleton Crater) cryogenic and slope testing, and what are their physical limitations?',
    earthSiteId: '',
    targetSiteId: 'moon-shackleton',
  },
  {
    label:
      'Explain why raw Earth EGM96 elevations cannot be directly compared to Mars MOLA or Moon LOLA datums, and how Data Center uploads refine this analysis.',
    earthSiteId: '',
    targetSiteId: '',
  },
];

function normalizeResponsePayload(raw: unknown): AiStructuredResponse {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const toStringArray = (val: unknown): string[] =>
    Array.isArray(val)
      ? val.map((v) => String(v ?? '').trim()).filter(Boolean)
      : [];

  return {
    retrievedFacts: toStringArray(obj.retrievedFacts),
    scientificInterpretation:
      typeof obj.scientificInterpretation === 'string' && obj.scientificInterpretation.trim()
        ? obj.scientificInterpretation.trim()
        : 'No scientific interpretation was returned for this query.',
    limitationsAndCaveats: toStringArray(obj.limitationsAndCaveats),
    recommendedNextSteps: toStringArray(obj.recommendedNextSteps),
    model: typeof obj.model === 'string' ? obj.model : undefined,
    groundedSiteCount:
      typeof obj.groundedSiteCount === 'number' ? obj.groundedSiteCount : undefined,
    groundedDatasetCount:
      typeof obj.groundedDatasetCount === 'number' ? obj.groundedDatasetCount : undefined,
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : undefined,
  };
}

export default function AssistantView({ sites }: AssistantViewProps) {
  const earthSites = useMemo(() => sites.filter((s) => s.body === 'Earth'), [sites]);
  const targetSites = useMemo(() => sites.filter((s) => s.body !== 'Earth'), [sites]);

  const [earthSiteId, setEarthSiteId] = useState<string>('earth-ladakh');
  const [targetSiteId, setTargetSiteId] = useState<string>('mars-jezero');
  const [question, setQuestion] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConversationItem[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (earthSiteId && earthSites.length > 0 && !earthSites.some((s) => s.id === earthSiteId)) {
      setEarthSiteId(earthSites[0].id);
    }
  }, [earthSiteId, earthSites]);

  useEffect(() => {
    if (targetSiteId && targetSites.length > 0 && !targetSites.some((s) => s.id === targetSiteId)) {
      setTargetSiteId(targetSites[0].id);
    }
  }, [targetSiteId, targetSites]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleAsk = async (
    qText?: string,
    overrideEarthId?: string,
    overrideTargetId?: string
  ) => {
    const query = (qText ?? question).trim();
    if (!query || loading) return;

    const activeEarthId = overrideEarthId !== undefined ? overrideEarthId : earthSiteId;
    const activeTargetId = overrideTargetId !== undefined ? overrideTargetId : targetSiteId;

    if (overrideEarthId !== undefined) setEarthSiteId(overrideEarthId);
    if (overrideTargetId !== undefined) setTargetSiteId(overrideTargetId);
    if (!qText) setQuestion('');

    const earthSite = earthSites.find((s) => s.id === activeEarthId);
    const targetSite = targetSites.find((s) => s.id === activeTargetId);
    const earthLabel = earthSite?.name ?? 'All Earth Analogues';
    const targetLabel = targetSite ? `[${targetSite.body}] ${targetSite.name}` : 'All Moon & Mars Targets';
    const itemId = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const recentCompletedHistory = history
      .filter((h) => h.response && !h.pending)
      .slice(0, 3)
      .map((h) => ({
        question: h.question,
        retrievedFacts: h.response?.retrievedFacts,
        scientificInterpretation: h.response?.scientificInterpretation,
      }));

    setLoading(true);
    setHistory((prev) => [
      {
        id: itemId,
        question: query,
        earthSiteId: activeEarthId,
        targetSiteId: activeTargetId,
        earthSiteName: earthLabel,
        targetSiteName: targetLabel,
        pending: true,
      },
      ...prev,
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: query,
          earthSiteId: activeEarthId || undefined,
          targetSiteId: activeTargetId || undefined,
          history: recentCompletedHistory,
        }),
        signal: controller.signal,
      });

      const rawText = await res.text();
      let parsedBody: Record<string, unknown> = {};
      if (rawText) {
        try {
          parsedBody = JSON.parse(rawText) as Record<string, unknown>;
        } catch {
          parsedBody = {};
        }
      }

      if (!res.ok) {
        const errMessage =
          typeof parsedBody.error === 'string' && parsedBody.error.trim()
            ? parsedBody.error
            : `AI Research service returned HTTP ${res.status}. Please retry.`;
        setHistory((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, pending: false, error: errMessage } : item
          )
        );
      } else {
        const normalized = normalizeResponsePayload(parsedBody);
        setHistory((prev) =>
          prev.map((item) =>
            item.id === itemId ? { ...item, pending: false, response: normalized } : item
          )
        );
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setHistory((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? {
                ...item,
                pending: false,
                error:
                  err instanceof Error
                    ? err.message
                    : 'Network error while contacting AI Research Assistant.',
              }
            : item
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopyItem = async (item: ConversationItem) => {
    if (!item.response) return;
    const text = [
      `VISION ASTRAA Research Inquiry: ${item.question}`,
      `Context: ${item.earthSiteName} vs. ${item.targetSiteName}`,
      '',
      'RETRIEVED DATABASE FACTS:',
      ...item.response.retrievedFacts.map((f) => `- ${f}`),
      '',
      'SCIENTIFIC INTERPRETATION & HYPOTHESES:',
      item.response.scientificInterpretation,
      '',
      'PHYSICAL LIMITATIONS & CAVEATS:',
      ...item.response.limitationsAndCaveats.map((l) => `- ${l}`),
      '',
      'RECOMMENDED VERIFICATION STEPS:',
      ...item.response.recommendedNextSteps.map((s) => `- ${s}`),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === item.id ? null : prev));
      }, 2000);
    } catch {
      // Clipboard API may be blocked in restricted iframe policies
    }
  };

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md">
        <CinematicBackdrop
          src="/assets/textures/deep_space_nebula_research.webp"
          alt="Deep space astronomical starfield research atmosphere"
          eager
          opacityClass="opacity-45"
          scrimClass="bg-gradient-to-b from-[#050814]/90 via-[#050814]/78 to-[#050814]/90"
        />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-cyan-400" />
              <div>
                <h1 className="font-display text-xl font-bold text-white">
                  AI Research Assistant
                </h1>
                <p className="text-xs text-slate-300">
                  Grounded in live SQLite datasets and site records. Explicitly separates retrieved
                  factual metrics from generated scientific hypotheses and planetary caveats.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <select
                aria-label="Focus Earth Analogue Site"
                value={earthSiteId}
                onChange={(e) => setEarthSiteId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                <option value="">All Earth Analogues (Portfolio)</option>
                {earthSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    Earth: {s.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Focus Planetary Target"
                value={targetSiteId}
                onChange={(e) => setTargetSiteId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              >
                <option value="">All Moon &amp; Mars Targets</option>
                {targetSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    Target: [{s.body}] {s.name}
                  </option>
                ))}
              </select>
              {history.length > 0 && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => setHistory([])}
                  title="Clear research thread"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-2 text-xs text-slate-300 hover:border-slate-600 hover:text-white disabled:opacity-40 whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAsk();
            }}
            className="mt-4 flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a research question about available datasets, slopes, or planetary analogue suitability..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading || !question.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {loading ? 'Analyzing...' : 'Run Inquiry'}
            </button>
          </form>

          {/* Preset Prompts */}
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESET_QUESTIONS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleAsk(preset.label, preset.earthSiteId, preset.targetSiteId)}
                className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Responses */}
      <div className="space-y-4">
        {history.length === 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-8 text-center text-xs text-slate-400 backdrop-blur-md">
            Select a preset scientific prompt above or ask a custom question to inspect
            database-grounded facts and hypotheses.
          </div>
        )}

        {history.map((item) => (
          <div
            key={item.id}
            className="space-y-4 rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="font-mono text-[11px] text-cyan-300">
                  Context: {item.earthSiteName} vs. {item.targetSiteName}
                </div>
                <h2 className="mt-1 font-display text-base font-semibold text-white">
                  {item.question}
                </h2>
              </div>

              {item.response && (
                <div className="flex items-center gap-2">
                  {typeof item.response.groundedSiteCount === 'number' && (
                    <span className="rounded border border-slate-700/80 bg-slate-900/80 px-2 py-1 font-mono text-[10px] text-slate-400 tabular-nums">
                      {item.response.groundedSiteCount} Sites · {item.response.groundedDatasetCount ?? 0}{' '}
                      DEMs
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyItem(item)}
                    className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-300 hover:border-cyan-500/50 hover:text-white"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {item.pending && (
              <div className="flex items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-xs text-cyan-200">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400 shrink-0" />
                <span>
                  Querying SQLite terrain baselines &amp; generating structured scientific synthesis...
                </span>
              </div>
            )}

            {item.error && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                <span>{item.error}</span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    handleAsk(item.question, item.earthSiteId, item.targetSiteId)
                  }
                  className="inline-flex items-center gap-1.5 rounded border border-rose-400/50 bg-rose-500/20 px-2.5 py-1 font-mono text-[11px] font-semibold text-rose-100 hover:bg-rose-500/30 disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
              </div>
            )}

            {item.response && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    Retrieved Database Facts
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {item.response.retrievedFacts.length > 0 ? (
                      item.response.retrievedFacts.map((fact, idx) => (
                        <li key={idx}>• {fact}</li>
                      ))
                    ) : (
                      <li className="text-slate-400">
                        • No discrete fact bullets returned; inspect summary interpretation.
                      </li>
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-cyan-300">
                    <Compass className="h-4 w-4" />
                    Scientific Interpretation &amp; Hypotheses
                  </div>
                  <p className="text-xs leading-relaxed text-slate-200 whitespace-pre-line">
                    {item.response.scientificInterpretation}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Physical Limitations &amp; Caveats
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {item.response.limitationsAndCaveats.length > 0 ? (
                      item.response.limitationsAndCaveats.map((lim, idx) => (
                        <li key={idx}>• {lim}</li>
                      ))
                    ) : (
                      <li className="text-slate-400">
                        • Apply standard planetary gravity, pressure, radiation, and datum caveats.
                      </li>
                    )}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4 space-y-2">
                  <div className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Recommended Verification Steps
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {item.response.recommendedNextSteps.length > 0 ? (
                      item.response.recommendedNextSteps.map((step, idx) => (
                        <li key={idx}>• {step}</li>
                      ))
                    ) : (
                      <li className="text-slate-400">
                        • Upload high-resolution DEMs in Data Center to refine local morphometrics.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
