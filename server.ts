import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import {
  deleteDataset,
  deleteReport,
  getAllDatasets,
  getAllReports,
  getAllSites,
  getDatasetById,
  getOverviewStats,
  logActivity,
  saveDataset,
  saveReport,
  upsertSite,
} from './src/server/db.ts';
import {
  buildSimilarityMatrix,
  computeMorphometricClusters,
  evaluateSimilarity,
  ingestUploadedBuffer,
} from './src/server/geospatial.ts';
import type {
  AnalogSite,
  MorphometricNormalization,
  ResearchReportRecord,
  SimilarityWeights,
} from './src/types/astraa.ts';

const PORT = 3000;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 64 * 1024 * 1024 },
});

const DEFAULT_WEIGHTS: SimilarityWeights = {
  slope: 25,
  ruggedness: 20,
  relief: 15,
  thermal: 15,
  waterIce: 15,
  mineralogy: 10,
};

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'VISION ASTRAA', timestamp: new Date().toISOString() });
  });

  app.get('/api/overview', (_req, res) => {
    res.json(getOverviewStats());
  });

  app.get('/api/sites', (_req, res) => {
    res.json(getAllSites());
  });

  app.post('/api/sites', (req, res) => {
    const site = req.body as AnalogSite;
    if (!site?.id || !site?.name || !site?.body) {
      res.status(400).json({ error: 'Site id, name, and body are required.' });
      return;
    }
    upsertSite(site);
    logActivity('Updated Site Record', 'Earth Analog Finder', `Saved site ${site.name} (${site.body}).`);
    res.json(site);
  });

  app.post('/api/similarity/rank', (req, res) => {
    const { targetId, weights, category } = req.body as {
      targetId?: string;
      weights?: Partial<SimilarityWeights>;
      category?: string;
    };
    const sites = getAllSites();
    const target = sites.find((s) => s.id === targetId) ?? sites.find((s) => s.body !== 'Earth');
    if (!target) {
      res.status(404).json({ error: 'Planetary target not found.' });
      return;
    }
    const mergedWeights: SimilarityWeights = {
      slope: Number(weights?.slope ?? DEFAULT_WEIGHTS.slope),
      ruggedness: Number(weights?.ruggedness ?? DEFAULT_WEIGHTS.ruggedness),
      relief: Number(weights?.relief ?? DEFAULT_WEIGHTS.relief),
      thermal: Number(weights?.thermal ?? DEFAULT_WEIGHTS.thermal),
      waterIce: Number(weights?.waterIce ?? DEFAULT_WEIGHTS.waterIce),
      mineralogy: Number(weights?.mineralogy ?? DEFAULT_WEIGHTS.mineralogy),
    };

    const earthSites = sites.filter(
      (s) => s.body === 'Earth' && (!category || category === 'All' || s.category === category)
    );
    const ranked = earthSites
      .map((earth) => evaluateSimilarity(earth, target, mergedWeights))
      .sort((a, b) => b.overallScore - a.overallScore);

    res.json({ target, weights: mergedWeights, results: ranked });
  });

  app.post('/api/similarity/compare', (req, res) => {
    const { earthSiteId, targetId, weights } = req.body as {
      earthSiteId?: string;
      targetId?: string;
      weights?: Partial<SimilarityWeights>;
    };
    const sites = getAllSites();
    const earth = sites.find((s) => s.id === earthSiteId) ?? sites.find((s) => s.body === 'Earth');
    const target = sites.find((s) => s.id === targetId) ?? sites.find((s) => s.body !== 'Earth');
    if (!earth || !target) {
      res.status(404).json({ error: 'Requested Earth or planetary target site not found.' });
      return;
    }
    const mergedWeights: SimilarityWeights = {
      slope: Number(weights?.slope ?? DEFAULT_WEIGHTS.slope),
      ruggedness: Number(weights?.ruggedness ?? DEFAULT_WEIGHTS.ruggedness),
      relief: Number(weights?.relief ?? DEFAULT_WEIGHTS.relief),
      thermal: Number(weights?.thermal ?? DEFAULT_WEIGHTS.thermal),
      waterIce: Number(weights?.waterIce ?? DEFAULT_WEIGHTS.waterIce),
      mineralogy: Number(weights?.mineralogy ?? DEFAULT_WEIGHTS.mineralogy),
    };
    res.json(evaluateSimilarity(earth, target, mergedWeights));
  });

  app.post('/api/similarity/matrix', (req, res) => {
    const { weights } = (req.body ?? {}) as {
      weights?: Partial<SimilarityWeights>;
    };
    const mergedWeights: SimilarityWeights = {
      slope: Number(weights?.slope ?? DEFAULT_WEIGHTS.slope),
      ruggedness: Number(weights?.ruggedness ?? DEFAULT_WEIGHTS.ruggedness),
      relief: Number(weights?.relief ?? DEFAULT_WEIGHTS.relief),
      thermal: Number(weights?.thermal ?? DEFAULT_WEIGHTS.thermal),
      waterIce: Number(weights?.waterIce ?? DEFAULT_WEIGHTS.waterIce),
      mineralogy: Number(weights?.mineralogy ?? DEFAULT_WEIGHTS.mineralogy),
    };
    res.json(buildSimilarityMatrix(getAllSites(), getAllDatasets(), mergedWeights));
  });

  app.get('/api/similarity/matrix', (_req, res) => {
    res.json(buildSimilarityMatrix(getAllSites(), getAllDatasets(), DEFAULT_WEIGHTS));
  });

  app.get('/api/clustering', (req, res) => {
    const kParam = Number(req.query.k ?? 3);
    const normParam = String(req.query.normalization ?? 'zscore') as MorphometricNormalization;
    const result = computeMorphometricClusters(getAllSites(), getAllDatasets(), {
      k: Number.isFinite(kParam) ? kParam : 3,
      normalization: normParam,
    });
    res.json(result);
  });

  app.post('/api/clustering', (req, res) => {
    const { k, normalization } = (req.body ?? {}) as {
      k?: number;
      normalization?: MorphometricNormalization;
    };
    const result = computeMorphometricClusters(getAllSites(), getAllDatasets(), {
      k: typeof k === 'number' && Number.isFinite(k) ? k : 3,
      normalization: normalization ?? 'zscore',
    });
    res.json(result);
  });

  app.get('/api/datasets', (_req, res) => {
    res.json(getAllDatasets());
  });

  app.post('/api/datasets/upload', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file attached in multipart field "file".' });
        return;
      }
      const result = await ingestUploadedBuffer(req.file.buffer, req.file.originalname);

      // Replace pending placeholder if same filename was uploaded
      const existing = getAllDatasets().find(
        (d) =>
          d.processingStatus === 'Pending Upload (Not Mounted)' &&
          (d.filename.toLowerCase() === req.file!.originalname.toLowerCase() ||
            req.file!.originalname.toLowerCase().includes(d.filename.replace('(3)', '').toLowerCase()))
      );
      if (existing) {
        deleteDataset(existing.id);
      }

      saveDataset(result.dataset);
      for (const s of result.extractedSites) {
        upsertSite(s);
      }

      logActivity(
        'Processed Geospatial Dataset',
        'Data Center',
        `Ingested ${result.dataset.filename} (${result.dataset.format}, ${result.dataset.totalRecords} records, quality ${result.dataset.qualityScore}%).`
      );

      res.json({
        dataset: result.dataset,
        extractedSitesCount: result.extractedSites.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse geospatial file.';
      res.status(400).json({ error: message });
    }
  });

  app.get('/api/datasets/:id/download', (req, res) => {
    const ds = getDatasetById(req.params.id);
    if (!ds) {
      res.status(404).json({ error: 'Dataset not found.' });
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ds.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}.processed.json"`
    );
    res.send(JSON.stringify(ds, null, 2));
  });

  app.delete('/api/datasets/:id', (req, res) => {
    deleteDataset(req.params.id);
    logActivity('Removed Dataset', 'Data Center', `Deleted dataset ${req.params.id}.`);
    res.json({ deleted: true });
  });

  app.get('/api/reports', (_req, res) => {
    res.json(getAllReports());
  });

  app.post('/api/reports', (req, res) => {
    const body = req.body as Omit<ResearchReportRecord, 'id' | 'createdAt'>;
    if (!body?.title || !body?.earthSiteId || !body?.targetSiteId) {
      res.status(400).json({ error: 'Report title, earthSiteId, and targetSiteId are required.' });
      return;
    }
    const report: ResearchReportRecord = {
      ...body,
      id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    saveReport(report);
    logActivity('Generated Research Report', 'Reports', `Saved report "${report.title}".`);
    res.json(report);
  });

  app.delete('/api/reports/:id', (req, res) => {
    deleteReport(req.params.id);
    res.json({ deleted: true });
  });

  app.post('/api/ai/research', async (req, res) => {
    const { question, earthSiteId, targetSiteId } = req.body as {
      question?: string;
      earthSiteId?: string;
      targetSiteId?: string;
    };
    if (!question?.trim()) {
      res.status(400).json({ error: 'A research question is required.' });
      return;
    }

    const sites = getAllSites();
    const datasets = getAllDatasets();
    const focusEarth = sites.find((s) => s.id === earthSiteId);
    const focusTarget = sites.find((s) => s.id === targetSiteId);

    const dbContext = {
      processedDatasets: datasets
        .filter((d) => d.processingStatus === 'Processed')
        .map((d) => ({
          filename: d.filename,
          format: d.format,
          planet: d.planet,
          region: d.region,
          crs: d.crs,
          resolution: d.resolution,
          qualityScore: d.qualityScore,
          elevationMinM: d.summaryStats?.elevationMinM ?? null,
          elevationMaxM: d.summaryStats?.elevationMaxM ?? null,
          meanSlopeDeg: d.summaryStats?.meanSlopeDeg ?? null,
          triMeanM: d.summaryStats?.triMeanM ?? null,
        })),
      pendingUnmountedDatasets: datasets
        .filter((d) => d.processingStatus === 'Pending Upload (Not Mounted)')
        .map((d) => d.filename),
      focusEarthSite: focusEarth ?? null,
      focusPlanetaryTarget: focusTarget ?? null,
      availableEarthSites: sites
        .filter((s) => s.body === 'Earth')
        .map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          category: s.category,
          meanSlopeDeg: s.meanSlopeDeg,
          triMeanM: s.triMeanM,
          reliefM: s.reliefM,
          waterIceScore: s.waterIceScore,
          mineralogyClass: s.mineralogyClass,
        })),
      availableTargets: sites
        .filter((s) => s.body !== 'Earth')
        .map((s) => ({
          id: s.id,
          name: s.name,
          body: s.body,
          meanSlopeDeg: s.meanSlopeDeg,
          triMeanM: s.triMeanM,
          reliefM: s.reliefM,
          waterIceScore: s.waterIceScore,
          mineralogyClass: s.mineralogyClass,
        })),
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not configured in the server environment. Configure it in Settings > Secrets to enable the AI Research Assistant.',
      });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Researcher Question: ${question}\n\nDatabase Grounding Context:\n${JSON.stringify(dbContext, null, 2)}`,
        config: {
          systemInstruction:
            'You are the VISION ASTRAA Planetary Geomorphology Research Assistant. Strictly separate verified facts retrieved from the provided Database Grounding Context from your scientific interpretations/hypotheses. Never fabricate dataset rows or pretend pending unmounted files have been read. Always remind the researcher of physical limitations (gravity, atmospheric pressure, radiation, planetary datum differences) when comparing Earth analogs with Moon or Mars.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              retrievedFacts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Exact verifiable facts, metrics, and dataset availability directly observed in the Database Grounding Context.',
              },
              scientificInterpretation: {
                type: Type.STRING,
                description:
                  'Analytical interpretation and testable hypotheses grounded in planetary geology principles.',
              },
              limitationsAndCaveats: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description:
                  'Physical differences (gravity, atmosphere, radiation, missing data, datum differences) that restrict the analogy.',
              },
              recommendedNextSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Concrete data validation or terrain comparison actions inside VISION ASTRAA.',
              },
            },
            required: [
              'retrievedFacts',
              'scientificInterpretation',
              'limitationsAndCaveats',
              'recommendedNextSteps',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      logActivity(
        'AI Research Query',
        'AI Assistant',
        `Analyzed query: "${question.slice(0, 72)}${question.length > 72 ? '...' : ''}"`
      );
      res.json(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini API request failed.';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VISION ASTRAA server listening on http://localhost:${PORT}`);
  });
}

startServer();
