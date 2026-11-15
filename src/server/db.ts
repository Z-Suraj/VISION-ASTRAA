import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type {
  ActivityLog,
  AnalogSite,
  DatasetRecord,
  OverviewStats,
  ResearchReportRecord,
} from '../types/astraa.ts';
import { INITIAL_ANALOG_SITES, INITIAL_DATASETS } from './seedData.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'astraa.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS analog_sites (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    format TEXT NOT NULL,
    processing_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    module TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function seedIfEmpty() {
  const siteCount = (db.prepare('SELECT COUNT(*) as c FROM analog_sites').get() as { c: number }).c;
  if (siteCount === 0) {
    const insertSite = db.prepare(
      'INSERT INTO analog_sites (id, name, body, status, payload) VALUES (?, ?, ?, ?, ?)'
    );
    const tx = db.transaction((sites: AnalogSite[]) => {
      for (const s of sites) {
        insertSite.run(s.id, s.name, s.body, s.status, JSON.stringify(s));
      }
    });
    tx(INITIAL_ANALOG_SITES);
  }

  const dsCount = (db.prepare('SELECT COUNT(*) as c FROM datasets').get() as { c: number }).c;
  if (dsCount === 0) {
    const insertDs = db.prepare(
      'INSERT INTO datasets (id, filename, format, processing_status, created_at, payload) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const tx = db.transaction((datasets: DatasetRecord[]) => {
      for (const d of datasets) {
        insertDs.run(d.id, d.filename, d.format, d.processingStatus, d.createdAt, JSON.stringify(d));
      }
    });
    tx(INITIAL_DATASETS);
  }

  const actCount = (db.prepare('SELECT COUNT(*) as c FROM activity_logs').get() as { c: number }).c;
  if (actCount === 0) {
    logActivity(
      'Initialized Repository Baseline',
      'Data Center',
      'Loaded 15 literature reference regions (9 Earth sites + 6 Moon/Mars targets) and 2 mathematical DEM calibration grids.'
    );
    logActivity(
      'Dataset Audit Completed',
      'Data Center',
      'Flagged 4 externally referenced datasets (@VISION_ASTRAA_Unified_Terrestrial_Analogs.csv, @N34E077.SRTMGL1.hgt(3).zip, @VISION_ASTRAA_N34E077_Elevation_Grid.csv, @space_agency_terrestrial_analogs-v2(3).zip) as Pending Upload.'
    );
  }
}

export function logActivity(action: string, module: string, detail: string) {
  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    'INSERT INTO activity_logs (id, action, module, detail, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, action, module, detail, createdAt);
}

function syncBaselineVisuals() {
  const selectRow = db.prepare('SELECT payload FROM analog_sites WHERE id = ?');
  const updateRow = db.prepare('UPDATE analog_sites SET payload = ? WHERE id = ?');
  const tx = db.transaction((sites: AnalogSite[]) => {
    for (const s of sites) {
      const existing = selectRow.get(s.id) as { payload: string } | undefined;
      if (!existing) continue;
      const parsed = JSON.parse(existing.payload) as AnalogSite;
      if (parsed.imageUrl !== s.imageUrl || parsed.imageAttribution !== s.imageAttribution) {
        parsed.imageUrl = s.imageUrl;
        parsed.imageAttribution = s.imageAttribution;
        updateRow.run(JSON.stringify(parsed), s.id);
      }
    }
  });
  tx(INITIAL_ANALOG_SITES);
}

seedIfEmpty();
syncBaselineVisuals();

export function getAllSites(): AnalogSite[] {
  const rows = db.prepare('SELECT payload FROM analog_sites').all() as { payload: string }[];
  return rows.map((r) => JSON.parse(r.payload) as AnalogSite);
}

export function upsertSite(site: AnalogSite) {
  db.prepare(
    `INSERT INTO analog_sites (id, name, body, status, payload)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name, body=excluded.body, status=excluded.status, payload=excluded.payload`
  ).run(site.id, site.name, site.body, site.status, JSON.stringify(site));
}

export function getAllDatasets(): DatasetRecord[] {
  const rows = db
    .prepare('SELECT payload FROM datasets ORDER BY created_at DESC')
    .all() as { payload: string }[];
  return rows.map((r) => JSON.parse(r.payload) as DatasetRecord);
}

export function getDatasetById(id: string): DatasetRecord | null {
  const row = db
    .prepare('SELECT payload FROM datasets WHERE id = ?')
    .get(id) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as DatasetRecord) : null;
}

export function saveDataset(ds: DatasetRecord) {
  db.prepare(
    `INSERT INTO datasets (id, filename, format, processing_status, created_at, payload)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET filename=excluded.filename, processing_status=excluded.processing_status, payload=excluded.payload`
  ).run(ds.id, ds.filename, ds.format, ds.processingStatus, ds.createdAt, JSON.stringify(ds));
}

export function deleteDataset(id: string) {
  db.prepare('DELETE FROM datasets WHERE id = ?').run(id);
}

export function getAllReports(): ResearchReportRecord[] {
  const rows = db
    .prepare('SELECT payload FROM reports ORDER BY created_at DESC')
    .all() as { payload: string }[];
  return rows.map((r) => JSON.parse(r.payload) as ResearchReportRecord);
}

export function saveReport(report: ResearchReportRecord) {
  db.prepare(
    'INSERT INTO reports (id, title, created_at, payload) VALUES (?, ?, ?, ?)'
  ).run(report.id, report.title, report.createdAt, JSON.stringify(report));
}

export function deleteReport(id: string) {
  db.prepare('DELETE FROM reports WHERE id = ?').run(id);
}

export function getOverviewStats(): OverviewStats {
  const sites = getAllSites();
  const datasets = getAllDatasets();
  const reports = getAllReports();
  const recentActivity = db
    .prepare(
      'SELECT id, action, module, detail, created_at as createdAt FROM activity_logs ORDER BY created_at DESC LIMIT 8'
    )
    .all() as ActivityLog[];

  const earthSites = sites.filter((s) => s.body === 'Earth');
  return {
    totalEarthAnalogs: earthSites.length,
    establishedAnalogs: earthSites.filter((s) => s.status === 'Established Reference').length,
    candidateAnalogs: earthSites.filter((s) => s.status === 'Candidate Region').length,
    planetaryTargets: sites.filter((s) => s.body !== 'Earth').length,
    processedDatasets: datasets.filter((d) => d.processingStatus === 'Processed').length,
    pendingDatasets: datasets.filter((d) => d.processingStatus === 'Pending Upload (Not Mounted)').length,
    savedReports: reports.length,
    recentActivity,
  };
}
