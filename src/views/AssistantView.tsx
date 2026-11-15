import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Compass, Send, Sparkles } from 'lucide-react';
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
}

interface ConversationItem {
  id: string;
  question: string;
  earthSiteName?: string;
  targetSiteName?: string;
  response?: AiStructuredResponse;
  error?: string;
}

const PRESET_QUESTIONS = [
  'Compare Ladakh (N34° E077°) and Atacama Desert as partial analogues for Jezero Crater on Mars, separating verified database metrics from hypotheses.',
  'Which terrestrial regions in our database best support Lunar South Pole (Shackleton Crater) cryogenic and slope testing, and what are their physical limitations?',
  'Explain why raw Earth EGM96 elevations cannot be directly compared to Mars MOLA or Moon LOLA datums, and how Data Center uploads refine this analysis.',
];

export default function AssistantView({ sites }: AssistantViewProps) {
  const earthSites = useMemo(() => sites.filter((s) => s.body === 'Earth'), [sites]);
  const targetSites = useMemo(() => sites.filter((s) => s.body !== 'Earth'), [sites]);

  const [earthSiteId, setEarthSiteId] = useState<string>('earth-ladakh');
  const [targetSiteId, setTargetSiteId] = useState<string>('mars-jezero');
  const [question, setQuestion] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ConversationItem[]>([]);

  const handleAsk = async (qText?: string) => {
    const query = (qText ?? question).trim();
    if (!query || loading) return;
    setLoading(true);
    if (!qText) setQuestion('');

    const earthSite = earthSites.find((s) => s.id === earthSiteId);
    const targetSite = targetSites.find((s) => s.id === targetSiteId);
    const itemId = `q-${Date.now()}`;

    try {
      const res = await fetch('/api/ai/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query, earthSiteId, targetSiteId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setHistory((prev) => [
          {
            id: itemId,
            question: query,
            earthSiteName: earthSite?.name,
            targetSiteName: targetSite?.name,
            error: data.error || 'Failed to query AI Research Assistant.',
          },
          ...prev,
        ]);
      } else {
        setHistory((prev) => [
          {
            id: itemId,
            question: query,
            earthSiteName: earthSite?.name,
            targetSiteName: targetSite?.name,
            response: data as AiStructuredResponse,
          },
          ...prev,
        ]);
      }
    } catch (err) {
      setHistory((prev) => [
        {
          id: itemId,
          question: query,
          error: err instanceof Error ? err.message : 'Network error.',
        },
        ...prev,
      ]);
    } finally {
      setLoading(false);
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

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={earthSiteId}
                onChange={(e) => setEarthSiteId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100"
              >
                {earthSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    Earth: {s.name}
                  </option>
                ))}
              </select>
              <select
                value={targetSiteId}
                onChange={(e) => setTargetSiteId(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 text-xs text-slate-100"
              >
                {targetSites.map((s) => (
                  <option key={s.id} value={s.id}>
                    Target: [{s.body}] {s.name}
                  </option>
                ))}
              </select>
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
              <Send className="h-4 w-4" />
              {loading ? 'Analyzing...' : 'Run Inquiry'}
            </button>
          </form>

          {/* Preset Prompts */}
          <div className="mt-4 flex flex-wrap gap-2">
            {PRESET_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={() => handleAsk(q)}
                className="rounded-lg border border-slate-700/80 bg-slate-900/75 px-3 py-1.5 text-left text-[11px] text-slate-200 hover:border-cyan-500/40 hover:text-cyan-200"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Responses */}
      <div className="space-y-4">
        {history.length === 0 && (
          <div className="rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-8 text-center text-xs text-slate-400 backdrop-blur-md">
            Select a preset scientific prompt above or ask a custom question to inspect database-grounded
            facts and hypotheses.
          </div>
        )}

        {history.map((item) => (
          <div
            key={item.id}
            className="space-y-4 rounded-xl border border-slate-800/80 bg-[#080f23]/90 p-5 backdrop-blur-md"
          >
            <div className="border-b border-slate-800 pb-3">
              <div className="font-mono text-[11px] text-cyan-300">
                Context: {item.earthSiteName ?? 'All Earth'} vs. {item.targetSiteName ?? 'Targets'}
              </div>
              <h2 className="mt-1 font-display text-base font-semibold text-white">
                {item.question}
              </h2>
            </div>

            {item.error && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
                {item.error}
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
                    {item.response.retrievedFacts.map((fact, idx) => (
                      <li key={idx}>• {fact}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-cyan-300">
                    <Compass className="h-4 w-4" />
                    Scientific Interpretation &amp; Hypotheses
                  </div>
                  <p className="text-xs leading-relaxed text-slate-200">
                    {item.response.scientificInterpretation}
                  </p>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wider text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    Physical Limitations &amp; Caveats
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-200">
                    {item.response.limitationsAndCaveats.map((lim, idx) => (
                      <li key={idx}>• {lim}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4 space-y-2">
                  <div className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Recommended Verification Steps
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {item.response.recommendedNextSteps.map((step, idx) => (
                      <li key={idx}>• {step}</li>
                    ))}
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
