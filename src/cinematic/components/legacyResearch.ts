import { useEffect, useState } from 'react';

export type LegacyResearchView = 'datacenter' | 'reports' | 'assistant';

export type LegacyResearchStatus = {
  available: boolean;
  gemini: boolean;
};

export type LegacyDataset = {
  id: string;
  filename: string;
  source: string;
  region: string;
  planet: string;
  crs: string;
  resolution: string;
  processingStatus: string;
};

export type LegacyReport = {
  id: string;
  title: string;
  createdAt: string;
  methodology: string;
  findings: string;
  limitations: string;
};

type LegacyAiResult = {
  retrievedFacts: string[];
  scientificInterpretation: string;
  limitationsAndCaveats: string[];
  recommendedNextSteps: string[];
};

const useOriginalBackend = import.meta.env.VITE_ENABLE_LEGACY_API === 'true';
const unavailable: LegacyResearchStatus = { available: false, gemini: false };

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`Research workspace request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function useLegacyResearch() {
  const [status, setStatus] = useState(unavailable);
  useEffect(() => {
    if (!useOriginalBackend) return;
    const controller = new AbortController();
    json<{ status?: string; service?: string; researchCopilot?: boolean }>('/api/health', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    }).then(health => {
      if (health.status === 'ok' && health.service === 'VISION ASTRAA') {
        setStatus({ available: true, gemini: health.researchCopilot === true });
      }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  return status;
}

export function loadLegacyDatasets() {
  return json<LegacyDataset[]>('/api/datasets');
}

export function loadLegacyReports() {
  return json<LegacyReport[]>('/api/reports');
}

export async function askLegacyResearch(
  question: string,
  earthSiteId: string | undefined,
  targetSiteId: string | undefined,
  referenceRegionIds: string[],
  history: { question: string; scientificInterpretation: string }[],
) {
  const result = await json<LegacyAiResult>('/api/ai/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(35_000),
    body: JSON.stringify({ question, earthSiteId, targetSiteId, referenceRegionIds, history }),
  });
  const formatSection = (title: string, items: string[]) => items.length ? `${title}\n${items.join('\n')}` : '';
  return [
    formatSection('Retrieved facts', result.retrievedFacts),
    result.scientificInterpretation,
    formatSection('Limitations', result.limitationsAndCaveats),
    formatSection('Next steps', result.recommendedNextSteps),
  ].filter(Boolean).join('\n\n');
}
