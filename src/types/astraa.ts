export type PlanetaryBody = 'Earth' | 'Moon' | 'Mars';

export type TerrainCategory =
  | 'Desert'
  | 'Polar'
  | 'Volcanic'
  | 'Impact Crater'
  | 'Canyon / Valley'
  | 'Evaporite Basin'
  | 'High-Altitude Arid';

export type SiteStatus = 'Established Reference' | 'Candidate Region' | 'Planetary Target';

export type SiteProvenance =
  | 'Published Reference Baseline (NASA/USGS/ESA Literature)'
  | 'Uploaded Local Dataset';

export interface SiteLimitations {
  gravityRatio: string;
  atmosphereNote: string;
  radiationNote: string;
  weatheringCaveat: string;
}

export interface AnalogSite {
  id: string;
  name: string;
  region: string;
  countryOrSector: string;
  body: PlanetaryBody;
  latitude: number;
  longitude: number;
  category: TerrainCategory;
  status: SiteStatus;
  provenance: SiteProvenance;
  sourceCitation: string;
  elevationMinM: number | null;
  elevationMaxM: number | null;
  elevationMeanM: number | null;
  reliefM: number | null;
  meanSlopeDeg: number | null;
  maxSlopeDeg: number | null;
  triMeanM: number | null;
  surfaceMaterial: string;
  geologySummary: string;
  waterIceIndicator: string;
  waterIceScore: number | null; // 0-1 normalized index if characterized
  mineralogyClass: string;
  tempMinC: number | null;
  tempMaxC: number | null;
  resourceIndicators: string;
  recommendedTargetId: string | null;
  dataCompletenessPct: number;
  limitations: SiteLimitations;
  imageUrl: string;
  imageAttribution: string;
}

export interface HistogramBin {
  label: string;
  min: number;
  max: number;
  count: number;
  pct: number;
}

export interface HypsometricPoint {
  relativeAreaPct: number;
  relativeElevationPct: number;
  elevationM: number;
}

export interface TerrainGridStats {
  rows: number;
  cols: number;
  elevationMinM: number;
  elevationMaxM: number;
  elevationMeanM: number;
  elevationStdM: number;
  reliefM: number;
  meanSlopeDeg: number;
  maxSlopeDeg: number;
  triMeanM: number;
  hypsometricIntegral: number;
  elevationHistogram: HistogramBin[];
  slopeDistribution: HistogramBin[];
  hypsometricCurve: HypsometricPoint[];
  previewGrid: number[][]; // downsampled matrix for 3D terrain mesh & 2D contour
  slopeGrid: number[][]; // matching slope matrix in degrees
}

export interface SpatialExtent {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface DatasetRecord {
  id: string;
  filename: string;
  format: 'CSV' | 'TSV' | 'ASC' | 'GeoJSON' | 'SRTM-HGT' | 'ZIP' | 'JSON';
  fileSizeBytes: number;
  source: string;
  planet: PlanetaryBody | 'Multi-Planet';
  region: string;
  crs: string;
  spatialExtent: SpatialExtent | null;
  resolution: string;
  units: string;
  noDataValue: string;
  missingValueCount: number;
  totalRecords: number;
  qualityScore: number;
  processingStatus: 'Processed' | 'Validated' | 'Pending Upload (Not Mounted)' | 'Error';
  summaryStats: TerrainGridStats | null;
  previewRows: Record<string, string | number | null>[];
  columns: string[];
  notes: string;
  createdAt: string;
}

export interface SimilarityWeights {
  slope: number;
  ruggedness: number;
  relief: number;
  thermal: number;
  waterIce: number;
  mineralogy: number;
}

export interface FeatureContribution {
  feature: string;
  weightPct: number;
  contributionScore: number; // 0-100
  earthValue: string;
  targetValue: string;
  available: boolean;
  note: string;
}

export interface SimilarityEvaluation {
  earthSite: AnalogSite;
  targetSite: AnalogSite;
  overallScore: number;
  confidencePct: number;
  missingVariables: string[];
  featureContributions: FeatureContribution[];
  explanation: string;
  limitationsSummary: string;
}

export interface ResearchReportRecord {
  id: string;
  title: string;
  earthSiteId: string;
  targetSiteId: string;
  similarityScore: number;
  confidencePct: number;
  methodology: string;
  findings: string;
  limitations: string;
  datasetIds: string[];
  createdAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  module: string;
  detail: string;
  createdAt: string;
}

export interface OverviewStats {
  totalEarthAnalogs: number;
  establishedAnalogs: number;
  candidateAnalogs: number;
  planetaryTargets: number;
  processedDatasets: number;
  pendingDatasets: number;
  savedReports: number;
  recentActivity: ActivityLog[];
}

export type MorphometricNormalization = 'zscore' | 'minmax' | 'raw';

export type MorphometricDataCategory =
  | 'Measured / Processed DEM'
  | 'Literature Reference Baseline'
  | 'Uploaded Local Dataset'
  | 'Synthetic Calibration Grid';

export interface MorphometricPoint {
  id: string;
  name: string;
  shortName: string;
  body: PlanetaryBody;
  region: string;
  category: TerrainCategory;
  status: SiteStatus;
  meanSlopeDeg: number;
  triMeanM: number;
  slopeZ: number;
  triZ: number;
  slopeMinMax: number;
  triMinMax: number;
  clusterId: number;
  clusterLabel: string;
  datasetName: string;
  dataSource: string;
  processingStatus: string;
  resolutionNote: string;
  dataCategory: MorphometricDataCategory;
  provenance: SiteProvenance;
}

export interface UnavailableMorphometricRegion {
  id: string;
  name: string;
  body: PlanetaryBody;
  status: SiteStatus;
  meanSlopeDeg: number | null;
  triMeanM: number | null;
  datasetName: string;
  processingStatus: string;
  reason: string;
}

export interface MorphometricClusterSummary {
  clusterId: number;
  label: string;
  count: number;
  planetsRepresented: PlanetaryBody[];
  regionNames: string[];
  slopeMinDeg: number;
  slopeMaxDeg: number;
  triMinM: number;
  triMaxM: number;
  meanSlopeDeg: number;
  meanTriM: number;
  centroidSlopeZ: number;
  centroidTriZ: number;
}

export interface MorphometricClusteringResult {
  points: MorphometricPoint[];
  unavailableRegions: UnavailableMorphometricRegion[];
  clusters: MorphometricClusterSummary[];
  k: number;
  normalization: MorphometricNormalization;
  clusteringSpace: string;
  clusteringMethod: string;
  normalizationMethod: string;
  scaleCaveat: string;
  limitationNote: string;
  pendingExternalDatasets: string[];
  generatedAt: string;
}

export type SimilarityAnalysisStatus =
  | 'DEMONSTRATION / SIMULATED'
  | 'DEM-Grounded (Measured)'
  | 'Partial DEM + Baseline'
  | 'Simulated Baseline';

export interface SimilarityMatrixRow {
  pairId: string;
  earthSiteId: string;
  earthSiteName: string;
  earthShortName: string;
  earthStatus: SiteStatus;
  earthCategory: TerrainCategory;
  targetId: string;
  targetBody: PlanetaryBody;
  targetName: string;
  targetShortName: string;
  targetCategory: TerrainCategory;
  meanSlopeSim: number | null;
  triSim: number | null;
  elevationSim: number | null;
  geomorphologicalSim: number;
  environmentalSim: number | null;
  overallSimilarityPct: number;
  confidencePct: number;
  dataQualityLabel: 'High' | 'Good' | 'Moderate' | 'Partial';
  missingCount: number;
  missingVariables: string[];
  analysisStatus: SimilarityAnalysisStatus;
  isDemonstration: boolean;
  earthValueSlope: string;
  targetValueSlope: string;
  earthValueTri: string;
  targetValueTri: string;
  earthValueRelief: string;
  targetValueRelief: string;
  earthProvenance: string;
  targetProvenance: string;
  explanation: string;
}

export interface SimilarityMatrixResponse {
  rows: SimilarityMatrixRow[];
  weights: SimilarityWeights;
  totalPairs: number;
  demonstrationCount: number;
  demGroundedCount: number;
  datumNote: string;
  simulationNotice: string;
  generatedAt: string;
}


