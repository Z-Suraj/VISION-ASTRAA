import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { analyzeTerrain, compareTerrain, loadDem, methodology, regions } from '../science';
import type { DemGrid, Region, TerrainMetrics } from '../science';
import { askLegacyResearch, loadLegacyDatasets, loadLegacyReports, useLegacyResearch } from './legacyResearch';
import type { LegacyDataset, LegacyReport, LegacyResearchStatus, LegacyResearchView } from './legacyResearch';
import './research.css';

type Tab = 'data-center' | 'copilot' | 'reports';

type ResearchProps = {
  earth?: Region;
  moon?: Region;
  mars?: Region;
};

type AnalysisRecord = {
  region: Region;
  grid?: DemGrid;
  metrics?: TerrainMetrics;
};

type Comparison = ReturnType<typeof compareTerrain> & {
  left: string;
  right: string;
};

type Reply = {
  question: string;
  answer: string;
  method: string;
  sources: Region[];
};

type OpenLegacy = (view: LegacyResearchView) => void;

const tabs: { id: Tab; label: string }[] = [
  { id: 'data-center', label: 'Data Center' },
  { id: 'copilot', label: 'Research Copilot' },
  { id: 'reports', label: 'Reports' },
];

const suggestedQuestions = [
  'Summarize the selected terrain.',
  'How is Riley TRI calculated?',
  'What are the limits of these comparisons?',
];

const endpoint = (import.meta as ImportMeta & {
  env?: { VITE_GEMINI_RESEARCH_ENDPOINT?: string };
}).env?.VITE_GEMINI_RESEARCH_ENDPOINT?.trim();

const numberFormat = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });

const limitations = [
  'Metrics are derived from the bundled elevation samples. Coarse sampling smooths small features and changes slope and ruggedness.',
  'Absolute elevations are referenced to each world’s dataset datum. Cross-world elevation values do not share a common zero.',
  'Morphometric resemblance alone does not establish common geology, process, landing safety, or exploration suitability.',
  'The original benchmark clustering assignments and validated similarity scores are unavailable in this workspace.',
];

function selectedTab(): Tab {
  const id = window.location.hash.slice(1);
  return tabs.find(tab => tab.id === id)?.id ?? 'data-center';
}

function measure(value: number | null | undefined, unit = '') {
  return value != null && Number.isFinite(value) ? `${numberFormat.format(value)}${unit}` : 'Unavailable';
}

function fraction(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? value.toFixed(3) : 'Unavailable';
}

function coordinates(region: Region) {
  const latitude = `${Math.abs(region.lat).toFixed(2)}° ${region.lat < 0 ? 'S' : 'N'}`;
  const longitude = ((region.lon + 540) % 360) - 180;
  return `${latitude}, ${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
}

function readMeasurements(metrics?: TerrainMetrics) {
  return [
    ['Minimum elevation', measure(metrics?.minimum, ' m')],
    ['Maximum elevation', measure(metrics?.maximum, ' m')],
    ['Mean elevation', measure(metrics?.meanElevation, ' m')],
    ['Relief', measure(metrics?.relief, ' m')],
    ['Mean Horn slope', measure(metrics?.meanSlope, '°')],
    ['Mean Riley TRI', measure(metrics?.meanTri, ' m')],
    ['Hypsometric integral', fraction(metrics?.hypsometricIntegral)],
  ];
}

function comparisonNote(comparison: Comparison) {
  const details = comparison.compatible && comparison.distance != null
    ? `Exploratory dimensionless distance ${fraction(comparison.distance)}. `
    : '';
  return `${comparison.left} / ${comparison.right}. ${details}${comparison.explanation}`;
}

function useAnalysis(selected: Region[]) {
  const [result, setResult] = useState<{ selection: Region[]; records: AnalysisRecord[] }>();
  useEffect(() => {
    let active = true;
    Promise.all(selected.map(async (region): Promise<AnalysisRecord> => {
      try {
        const grid = await loadDem(region);
        return { region, grid, metrics: analyzeTerrain(grid) };
      } catch {
        return { region };
      }
    })).then(records => {
      if (active) setResult({ selection: selected, records });
    });
    return () => { active = false; };
  }, [selected]);

  const pending = selected.length > 0 && result?.selection !== selected;
  const records = result?.selection === selected ? result.records : [];
  const comparisons = useMemo(() => {
    const earth = records.find(record => record.region.planet === 'Earth');
    if (!earth) return [];
    return records.filter(record => record.region.planet !== 'Earth').map(record => {
      const names = { left: earth.region.name, right: record.region.name };
      if (!earth.grid || !record.grid) return {
        ...names,
        compatible: false,
        distance: null,
        explanation: 'Terrain comparison is unavailable because one or both elevation grids could not be loaded.',
      };
      return { ...names, ...compareTerrain(earth.grid, record.grid) };
    });
  }, [records]);

  return { pending, records, comparisons };
}

function makeReport(records: AnalysisRecord[], comparisons: Comparison[]) {
  const writeRegion = ({ region, grid, metrics }: AnalysisRecord) => [
    `### ${region.name} · ${region.planet}`,
    '',
    `- **Sample center** ${coordinates(region)}`,
    `- **Dataset** [${region.source}](${region.sourceUrl})`,
    `- **Source identifier** ${region.sourceId}`,
    `- **Datum** ${region.datum}`,
    `- **Native source resolution** ${region.nativeResolution}`,
    `- **Analyzed sample spacing** ${region.resolution}`,
    `- **Sample dimensions** ${grid ? `${grid.width} × ${grid.height} cells` : 'Unavailable'}`,
    `- **Attribution** ${region.attribution}`,
    `- [Sampled elevation grid](${new URL(region.demUrl, window.location.origin).href})`,
    '',
    '| Derived measurement | Value |',
    '| --- | --- |',
    ...readMeasurements(metrics).map(([name, value]) => `| ${name} | ${value} |`),
    '',
  ].join('\n');

  return [
    '# Vision Astraa — Terrain research report',
    '',
    `Generated ${new Date().toISOString()}`,
    '',
    '## Selected terrain',
    '',
    records.length ? records.map(writeRegion).join('\n') : 'No benchmark regions are selected.',
    `[Source inputs and processing provenance](${new URL('/data/provenance.json', window.location.origin).href})`,
    '',
    '## Comparisons',
    '',
    ...(comparisons.length ? comparisons.map(result => `- ${comparisonNote(result)}`) : ['- Select an Earth region and a Moon or Mars region for comparison.']),
    '',
    '## Methods and limitations',
    '',
    ...[
      methodology.sampling,
      'Relief is the sampled maximum minus the sampled minimum.',
      methodology.slope,
      methodology.ruggedness,
      methodology.hypsometry,
      methodology.comparison,
      ...limitations,
    ].map(item => `- ${item}`),
    '',
  ].join('\n');
}

function downloadReport(records: AnalysisRecord[], comparisons: Comparison[]) {
  const report = new Blob([makeReport(records, comparisons)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(report);
  const link = document.createElement('a');
  link.href = url;
  link.download = `vision-astraa-terrain-${new Date().toISOString().slice(0, 10)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function localAnswer(question: string, records: AnalysisRecord[], comparisons: Comparison[]) {
  const query = question.toLowerCase();
  if (/limit|uncertain|suitab|safety|geolog|accuracy|bias/.test(query)) {
    return limitations.join('\n\n');
  }

  if (/compare|similar|analogu|cluster|score/.test(query)) {
    return [
      comparisons.map(comparisonNote).join('\n\n') || 'Select an Earth region and another world to run a terrain comparison.',
      limitations[2],
      limitations[3],
    ].join('\n\n');
  }

  if (/source|data set|dataset|datum|resolut|provenance|download/.test(query)) {
    return records.map(({ region }) =>
      `${region.name} uses ${region.source} (${region.sourceId}). Its datum is ${region.datum}. The native source resolution is ${region.nativeResolution}. The analysis uses a ${region.resolution}.`,
    ).join('\n\n') || 'Select a region to look up its elevation source and sampling details.';
  }

  if (/\btri\b|rugged/.test(query)) {
    return [
      `${methodology.ruggedness} The mean summarizes interior cells and depends on sample spacing.`,
      ...records.map(({ region, metrics }) => `${region.name} · mean Riley TRI ${measure(metrics?.meanTri, ' m')}.`),
    ].join('\n\n');
  }

  if (/slope|horn/.test(query)) {
    return [
      methodology.slope,
      ...records.map(({ region, metrics }) => `${region.name} · mean Horn slope ${measure(metrics?.meanSlope, '°')}.`),
    ].join('\n\n');
  }

  if (/hyps/.test(query)) {
    return [
      methodology.hypsometry,
      ...records.map(({ region, metrics }) => `${region.name} · hypsometric integral ${fraction(metrics?.hypsometricIntegral)}.`),
    ].join('\n\n');
  }

  if (/elevat|relief|height/.test(query)) {
    return [
      'Relief is the difference between the maximum and minimum elevation in a sample. Elevation zero is defined by the source datum of each grid.',
      ...records.map(({ region, metrics }) => `${region.name} · minimum ${measure(metrics?.minimum, ' m')}, maximum ${measure(metrics?.maximum, ' m')}, mean ${measure(metrics?.meanElevation, ' m')}, and relief ${measure(metrics?.relief, ' m')}.`),
    ].join('\n\n');
  }

  return records.map(({ region, metrics }) => metrics
    ? `${region.name} · relief ${measure(metrics.relief, ' m')}, mean slope ${measure(metrics.meanSlope, '°')}, mean Riley TRI ${measure(metrics.meanTri, ' m')}, and hypsometric integral ${fraction(metrics.hypsometricIntegral)}. The elevation grid is sampled at ${region.resolution}.`
    : `${region.name} · elevation-derived measurements are currently unavailable.`,
  ).join('\n\n') || 'Select a region to summarize its terrain. Local analysis covers elevation, slope, Riley TRI, hypsometry, comparisons, and provenance.';
}

async function geminiAnswer(question: string, records: AnalysisRecord[], comparisons: Comparison[]) {
  if (!endpoint) throw new Error('Gemini endpoint is unavailable.');
  const response = await fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      question,
      records: records.map(({ region, metrics }) => ({
        region: region.name,
        body: region.planet,
        source: region.source,
        sourceId: region.sourceId,
        sourceUrl: region.sourceUrl,
        datum: region.datum,
        nativeResolution: region.nativeResolution,
        sampleSpacing: region.resolution,
        measurements: Object.fromEntries(readMeasurements(metrics)),
      })),
      comparisons: comparisons.map(comparisonNote),
      limitations,
    }),
  });
  if (!response.ok) throw new Error('Gemini research request failed.');
  const result = await response.json();
  if (typeof result.answer !== 'string' || !result.answer.trim()) throw new Error('Gemini returned an empty answer.');
  return result.answer;
}

function LegacyRecords({ view, onOpen }: { view: 'datacenter' | 'reports'; onOpen: OpenLegacy }) {
  const [records, setRecords] = useState<LegacyDataset[] | LegacyReport[]>();
  const [error, setError] = useState(false);

  async function load(open: boolean) {
    if (!open) return;
    setError(false);
    try {
      setRecords(view === 'datacenter' ? await loadLegacyDatasets() : await loadLegacyReports());
    } catch {
      setError(true);
    }
  }

  return (
    <details className="research-legacy-records" onToggle={event => void load(event.currentTarget.open)}>
      <summary>{view === 'datacenter' ? 'Original dataset archive' : 'Saved research reports'}</summary>
      {error && <p role="status">This archive could not be loaded.</p>}
      {!error && !records && <p role="status">Loading records…</p>}
      {!error && records && !records.length && <p>No records are currently saved.</p>}
      {!error && !!records?.length && <ul>
        {records.map(record => 'filename' in record
          ? <li key={record.id}>
              <div>
                <strong>{record.filename}</strong>
                <p>{record.planet} · {record.region} · {record.processingStatus}</p>
                <p>{record.source} · {record.resolution} · {record.crs}</p>
              </div>
              {record.processingStatus === 'Processed' && (
                <a className="research-link" href={`/api/datasets/${encodeURIComponent(record.id)}/download`} download>
                  Download record <span aria-hidden="true">↓</span>
                </a>
              )}
            </li>
          : <li key={record.id}>
              <div><strong>{record.title}</strong><p>{record.methodology}</p></div>
            </li>)}
      </ul>}
      <button className="research-button" type="button" onClick={() => onOpen(view)}>
        {view === 'datacenter' ? 'Open dataset tools' : 'Open saved report tools'} <span aria-hidden="true">↗</span>
      </button>
    </details>
  );
}

function DataCenter({ earth }: Pick<ResearchProps, 'earth'>) {
  const [filter, setFilter] = useState<Region['planet'] | 'All'>('All');
  const [selection, setSelection] = useState<string>();
  const visible = regions.filter(region => filter === 'All' || region.planet === filter);
  const dataset = visible.find(region => region.id === (selection ?? earth?.id)) ?? visible[0];

  return (
    <div className="research-data">
      <div className="research-catalog">
        <div className="research-subheading">
          <div>
            <h3>Elevation catalog</h3>
            <p>Browse the DEM samples and their source products.</p>
          </div>
          <label className="research-filter">
            <span className="research-visually-hidden">Filter datasets by world</span>
            <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
              <option value="All">All worlds</option>
              <option>Earth</option>
              <option>Moon</option>
              <option>Mars</option>
            </select>
          </label>
        </div>
        <div className="research-datasets">
          {visible.map(region => (
            <button
              type="button"
              key={region.id}
              className="research-dataset"
              aria-pressed={dataset?.id === region.id}
              onClick={() => setSelection(region.id)}
            >
              <span className="research-world" data-world={region.planet} aria-hidden="true" />
              <span><strong>{region.name}</strong><small>{region.planet}</small></span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
          {!visible.length && <p className="research-empty">No elevation datasets are available for this world.</p>}
        </div>
      </div>

      {dataset && <div className="research-details" aria-live="polite">
        <div className="research-details-heading">
          <div>
            <p className="research-eyebrow">Source metadata</p>
            <h3>{dataset.name}</h3>
            <p>{dataset.summary}</p>
          </div>
          {dataset.image && <img src={dataset.image} alt="" loading="lazy" width="72" height="72" />}
        </div>
        <dl className="research-metadata">
          <div><dt>Sample center</dt><dd>{coordinates(dataset)}</dd></div>
          <div><dt>Source dataset</dt><dd>{dataset.source}</dd></div>
          <div><dt>Product ID</dt><dd>{dataset.sourceId}</dd></div>
          <div><dt>Source resolution</dt><dd>{dataset.nativeResolution}</dd></div>
          <div><dt>Sample spacing</dt><dd>{dataset.resolution}</dd></div>
          <div><dt>Datum</dt><dd>{dataset.datum}</dd></div>
        </dl>
        <div className="research-actions">
          <a className="research-button" href={dataset.demUrl} download={`${dataset.id}-dem.json`}>Download DEM sample <span aria-hidden="true">↓</span></a>
          <a className="research-link" href={dataset.sourceUrl} target="_blank" rel="noreferrer">View source <span aria-hidden="true">↗</span></a>
          <a className="research-link" href="/data/provenance.json" download>Provenance <span aria-hidden="true">↓</span></a>
        </div>
        <p className="research-notice">{dataset.attribution}</p>
      </div>}
    </div>
  );
}

function Copilot({ analysis, legacy, onOpenLegacy }: {
  analysis: ReturnType<typeof useAnalysis>;
  legacy: LegacyResearchStatus;
  onOpenLegacy: OpenLegacy;
}) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Reply[]>([]);
  const [requesting, setRequesting] = useState(false);
  const [requestStatus, setRequestStatus] = useState('');
  const { records, comparisons, pending } = analysis;
  const geminiEnabled = Boolean(endpoint) || legacy.gemini;

  async function ask(prompt: string) {
    const value = prompt.trim();
    if (!value || requesting || pending) return;
    setQuestion('');
    setRequestStatus('');
    setRequesting(true);
    let method = 'Local dataset analysis';
    let answer: string;

    try {
      if (endpoint) {
        answer = await geminiAnswer(value, records, comparisons);
        method = 'Gemini · selected dataset context';
      } else if (legacy.gemini) {
        const earth = records.find(record => record.region.planet === 'Earth');
        const targetPlanet = /moon|lunar/i.test(value) ? 'Moon' : 'Mars';
        const target = records.find(record => record.region.planet === targetPlanet);
        const previousQueries = history.filter(reply => reply.method.startsWith('Gemini')).slice(-3).reverse();
        answer = await askLegacyResearch(
          value,
          earth?.region.id,
          target?.region.id,
          records.map(record => record.region.id),
          previousQueries.map(reply => ({ question: reply.question, scientificInterpretation: reply.answer })),
        );
        method = 'Gemini · observed samples and original research database';
      } else {
        answer = localAnswer(value, records, comparisons);
      }
    } catch {
      setRequestStatus('Gemini is currently unreachable. Local dataset analysis answered this question.');
      answer = localAnswer(value, records, comparisons);
    }

    setHistory(previous => [...previous, { question: value, answer, method, sources: records.map(record => record.region) }]);
    setRequesting(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="research-copilot">
      <div className="research-subheading">
        <div>
          <h3>Ask about the selected terrain</h3>
          <p>Use the active regions to explore terrain metrics, compare samples, and trace the elevation data to its source.</p>
        </div>
        <span className="research-mode"><i aria-hidden="true" />{geminiEnabled ? 'Gemini configured' : 'Local dataset analysis'}</span>
      </div>

      <div className="research-suggestions" aria-label="Suggested questions">
        {suggestedQuestions.map(prompt => (
          <button key={prompt} type="button" disabled={requesting || pending} onClick={() => void ask(prompt)}>{prompt}</button>
        ))}
      </div>

      <div className="research-replies" aria-live="polite" aria-busy={requesting}>
        {history.map((reply, index) => (
          <article key={index} className="research-reply">
            <h4>{reply.question}</h4>
            <p className="research-eyebrow">{reply.method}</p>
            {reply.answer.split(/\n\s*\n/).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
            <ul className="research-citations" aria-label="Dataset sources">
              {reply.sources.map(region => <li key={region.id}><a href={region.sourceUrl} target="_blank" rel="noreferrer">{region.name} source ↗</a></li>)}
            </ul>
          </article>
        ))}
      </div>

      {requestStatus && <p className="research-notice" role="status">{requestStatus}</p>}
      <form className="research-question" onSubmit={handleSubmit}>
        <label className="research-visually-hidden" htmlFor="research-question">Research question</label>
        <input id="research-question" value={question} maxLength={500} onChange={event => setQuestion(event.target.value)} placeholder="Ask a terrain question…" />
        <button className="research-button" disabled={!question.trim() || requesting || pending} type="submit">
          {requesting ? 'Analyzing…' : 'Ask'} <span aria-hidden="true">↗</span>
        </button>
      </form>
      <p className="research-notice" role="status">
        {pending ? 'Loading the selected elevation samples…' : geminiEnabled
          ? 'Submitting sends your question and the selected terrain context to the configured Gemini service.'
          : 'Gemini unavailable. Local answers use the bundled DEM samples and their provenance.'}
      </p>
      {legacy.available && <button type="button" className="research-legacy-link" onClick={() => onOpenLegacy('assistant')}>
        Open original research assistant <span aria-hidden="true">↗</span>
      </button>}
    </div>
  );
}

function Reports({ analysis }: { analysis: ReturnType<typeof useAnalysis> }) {
  const { records, comparisons, pending } = analysis;
  const [downloaded, setDownloaded] = useState(false);

  return (
    <div className="research-reports">
      <div className="research-subheading">
        <div>
          <h3>Terrain research report</h3>
          <p>Export the current selection with derived measurements, comparison results, and source metadata.</p>
        </div>
        <button className="research-button" type="button" disabled={pending || !records.length} onClick={() => {
          downloadReport(records, comparisons);
          setDownloaded(true);
        }}>Download report <span aria-hidden="true">↓</span></button>
      </div>
      {pending && <p role="status">Loading elevation samples for the report…</p>}
      {!pending && !records.length && <p>Select benchmark regions to prepare the report.</p>}
      {!!records.length && <div className="research-report-table" tabIndex={0} role="region" aria-label="Report measurement preview">
        <table>
          <caption className="research-visually-hidden">Derived measurements for the selected benchmark regions</caption>
          <thead><tr><th scope="col">Derived measurement</th>{records.map(({ region }) => <th key={region.id} scope="col">{region.name}</th>)}</tr></thead>
          <tbody>{readMeasurements().map(([name], index) => (
            <tr key={name}><th scope="row">{name}</th>{records.map(({ region, metrics }) => <td key={region.id}>{readMeasurements(metrics)[index][1]}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>}
      {!!comparisons.length && <ul className="research-comparison-notes">
        {comparisons.map(result => <li key={result.right}>{comparisonNote(result)}</li>)}
      </ul>}
      {downloaded && <p className="research-notice" role="status">Report download requested.</p>}
    </div>
  );
}

export function Research({ earth, moon, mars }: ResearchProps) {
  const [tab, setTab] = useState<Tab>(selectedTab);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const legacyDialog = useRef<HTMLDialogElement>(null);
  const [legacyView, setLegacyView] = useState<LegacyResearchView>();
  const legacy = useLegacyResearch();
  const selected = useMemo(() => [earth, moon, mars].filter((region): region is Region => Boolean(region)), [earth, moon, mars]);
  const analysis = useAnalysis(selected);

  function openLegacy(view: LegacyResearchView) {
    setLegacyView(view);
    legacyDialog.current?.showModal();
  }

  function closeLegacy() {
    legacyDialog.current?.close();
  }

  useEffect(() => {
    function updateFromHash() {
      const id = window.location.hash.slice(1);
      if (tabs.some(item => item.id === id)) setTab(id as Tab);
    }
    window.addEventListener('hashchange', updateFromHash);
    return () => window.removeEventListener('hashchange', updateFromHash);
  }, []);

  function selectTab(id: Tab) {
    setTab(id);
    window.history.replaceState(window.history.state, '', `#${id}`);
  }

  function handleTabKeys(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowLeft: (index - 1 + tabs.length) % tabs.length,
      ArrowRight: (index + 1) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectTab(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="research-workspace">
      <div className="research-tabs" role="tablist" aria-label="Research intelligence tools">
        {tabs.map((item, index) => (
          <button
            type="button"
            key={item.id}
            id={item.id}
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`${item.id}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            ref={element => { tabRefs.current[index] = element; }}
            onFocus={() => setTab(item.id)}
            onClick={() => selectTab(item.id)}
            onKeyDown={event => handleTabKeys(event, index)}
          >{item.label}</button>
        ))}
      </div>
      <div role="tabpanel" id="data-center-panel" aria-labelledby="data-center" tabIndex={0} hidden={tab !== 'data-center'}>
        <DataCenter earth={earth} />
        {legacy.available && <LegacyRecords view="datacenter" onOpen={openLegacy} />}
      </div>
      <div role="tabpanel" id="copilot-panel" aria-labelledby="copilot" tabIndex={0} hidden={tab !== 'copilot'}>
        <Copilot analysis={analysis} legacy={legacy} onOpenLegacy={openLegacy} />
      </div>
      <div role="tabpanel" id="reports-panel" aria-labelledby="reports" tabIndex={0} hidden={tab !== 'reports'}>
        <Reports analysis={analysis} />
        {legacy.available && <LegacyRecords view="reports" onOpen={openLegacy} />}
      </div>
      {legacy.available && <dialog className="research-legacy-dialog" ref={legacyDialog} onClose={() => setLegacyView(undefined)} aria-labelledby="research-legacy-title">
        <header>
          <h3 id="research-legacy-title">Original research tools</h3>
          <button className="research-button" type="button" onClick={closeLegacy}>Close</button>
        </header>
        {legacyView && <iframe
          title="Original Vision Astraa research workspace"
          src={`/legacy.html?view=${legacyView}`}
          onLoad={event => event.currentTarget.contentWindow?.addEventListener('keydown', key => {
            if (key.key === 'Escape') closeLegacy();
          })}
        />}
      </dialog>}
    </div>
  );
}

export default Research;
