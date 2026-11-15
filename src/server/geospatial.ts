import JSZip from 'jszip';
import type {
  AnalogSite,
  DatasetRecord,
  FeatureContribution,
  MorphometricClusterSummary,
  MorphometricClusteringResult,
  MorphometricDataCategory,
  MorphometricNormalization,
  MorphometricPoint,
  PlanetaryBody,
  SimilarityEvaluation,
  SimilarityWeights,
  SpatialExtent,
  TerrainCategory,
  UnavailableMorphometricRegion,
} from '../types/astraa.ts';
import { computeStatsFromMatrix } from './seedData.ts';

export interface ParsedIngestionResult {
  dataset: DatasetRecord;
  extractedSites: AnalogSite[];
}

function parseSrtmTileBounds(filename: string): SpatialExtent | null {
  const m = filename.toUpperCase().match(/([NS])(\d{2})([EW])(\d{3})/);
  if (!m) return null;
  const latSign = m[1] === 'S' ? -1 : 1;
  const lonSign = m[3] === 'W' ? -1 : 1;
  const minLat = latSign * parseInt(m[2], 10);
  const minLon = lonSign * parseInt(m[4], 10);
  return {
    minLat,
    maxLat: minLat + 1,
    minLon,
    maxLon: minLon + 1,
  };
}

function parseHgtBuffer(
  buffer: Buffer,
  filename: string,
  fileSizeBytes: number
): DatasetRecord {
  const bytesPerSample = 2;
  const totalSamples = Math.floor(buffer.length / bytesPerSample);
  let dim = 0;
  let resolution = 'Unknown';
  let cellSizeM = 30;

  if (totalSamples === 3601 * 3601) {
    dim = 3601;
    resolution = '1 arcsecond (~30 m · SRTMGL1)';
    cellSizeM = 30;
  } else if (totalSamples === 1201 * 1201) {
    dim = 1201;
    resolution = '3 arcseconds (~90 m · SRTM3)';
    cellSizeM = 90;
  } else {
    const inferred = Math.round(Math.sqrt(totalSamples));
    if (inferred * inferred === totalSamples && inferred >= 10) {
      dim = inferred;
      resolution = `${inferred}×${inferred} binary DEM`;
      cellSizeM = 90;
    } else {
      throw new Error(
        `Unsupported .hgt byte length (${buffer.length} bytes). Expected 3601×3601 (25,934,402 bytes) or 1201×1201 (2,884,802 bytes).`
      );
    }
  }

  // Downsample to 96x96 for fast accurate morphometric analysis
  const sampleDim = Math.min(96, dim);
  const step = Math.max(1, Math.floor((dim - 1) / (sampleDim - 1)));
  const matrix: number[][] = [];
  let missingCount = 0;

  // First pass on sampled grid, plus void check
  const rawSampleVals: number[] = [];
  for (let r = 0; r < dim; r += step) {
    const row: number[] = [];
    for (let c = 0; c < dim; c += step) {
      const offset = (r * dim + c) * 2;
      const val = buffer.readInt16BE(offset);
      if (val === -32768 || val < -11000) {
        missingCount++;
        row.push(Number.NaN);
      } else {
        row.push(val);
        rawSampleVals.push(val);
      }
    }
    matrix.push(row);
  }

  // Fill occasional voids using local row mean so matrix computation stays clean while counting voids
  const fallbackMean =
    rawSampleVals.length > 0
      ? rawSampleVals.reduce((a, b) => a + b, 0) / rawSampleVals.length
      : 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!Number.isFinite(matrix[r][c])) matrix[r][c] = fallbackMean;
    }
  }

  const effectiveCellM = cellSizeM * step;
  const stats = computeStatsFromMatrix(matrix, effectiveCellM);
  const bounds = parseSrtmTileBounds(filename);
  const totalSampled = matrix.length * (matrix[0]?.length ?? 0);
  const qualityScore = Math.max(
    0,
    Math.round((1 - missingCount / Math.max(1, totalSampled)) * 1000) / 10
  );

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    format: 'SRTM-HGT',
    fileSizeBytes,
    source: 'Uploaded NASA SRTM Binary Elevation Tile',
    planet: 'Earth',
    region: bounds
      ? `${bounds.minLat}°..${bounds.maxLat}° Lat, ${bounds.minLon}°..${bounds.maxLon}° Lon`
      : 'Uploaded SRTM Tile',
    crs: 'WGS84 / EGM96 Geoid (EPSG:4326)',
    spatialExtent: bounds,
    resolution,
    units: 'meters',
    noDataValue: '-32768',
    missingValueCount: missingCount,
    totalRecords: totalSamples,
    qualityScore,
    processingStatus: 'Processed',
    summaryStats: stats,
    previewRows: [
      { metric: 'Grid Dimension', value: `${dim} × ${dim}` },
      { metric: 'Sampled Analysis Grid', value: `${matrix.length} × ${matrix[0]?.length ?? 0}` },
      { metric: 'Min / Max Elevation', value: `${stats.elevationMinM} m / ${stats.elevationMaxM} m` },
      { metric: 'Mean Slope (Horn)', value: `${stats.meanSlopeDeg}°` },
      { metric: 'Terrain Ruggedness (TRI)', value: `${stats.triMeanM} m` },
    ],
    columns: ['metric', 'value'],
    notes: `Parsed big-endian signed 16-bit SRTM elevation grid (${dim}×${dim}). Void pixels (-32768) in sampled matrix: ${missingCount}.`,
    createdAt: new Date().toISOString(),
  };
}

function parseAsciiGrid(
  text: string,
  filename: string,
  fileSizeBytes: number
): DatasetRecord {
  const lines = text.trim().split(/\r?\n/);
  const headers: Record<string, number> = {};
  let dataStartIdx = 0;

  for (let i = 0; i < Math.min(12, lines.length); i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length === 2 && Number.isFinite(Number(parts[1]))) {
      headers[parts[0].toLowerCase()] = Number(parts[1]);
      dataStartIdx = i + 1;
    } else {
      break;
    }
  }

  const ncols = headers['ncols'] ?? 0;
  const nrows = headers['nrows'] ?? 0;
  const cellsize = headers['cellsize'] ?? 90;
  const nodata = headers['nodata_value'] ?? -9999;

  if (ncols <= 0 || nrows <= 0) {
    throw new Error('Invalid Esri ASCII Grid: missing NCOLS or NROWS header.');
  }

  const rawTokens = lines.slice(dataStartIdx).join(' ').trim().split(/\s+/);
  const matrix: number[][] = [];
  let missingCount = 0;
  const validVals: number[] = [];

  for (let r = 0; r < nrows; r++) {
    const row: number[] = [];
    for (let c = 0; c < ncols; c++) {
      const tok = rawTokens[r * ncols + c];
      const val = Number(tok);
      if (!Number.isFinite(val) || val === nodata) {
        missingCount++;
        row.push(Number.NaN);
      } else {
        row.push(val);
        validVals.push(val);
      }
    }
    matrix.push(row);
  }

  const fallback =
    validVals.length > 0 ? validVals.reduce((a, b) => a + b, 0) / validVals.length : 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (!Number.isFinite(matrix[r][c])) matrix[r][c] = fallback;
    }
  }

  const stats = computeStatsFromMatrix(matrix, cellsize > 1 ? cellsize : 90);
  const xll = headers['xllcorner'] ?? headers['xllcenter'];
  const yll = headers['yllcorner'] ?? headers['yllcenter'];
  const extent: SpatialExtent | null =
    Number.isFinite(xll) && Number.isFinite(yll)
      ? {
          minLon: xll,
          maxLon: xll + ncols * cellsize,
          minLat: yll,
          maxLat: yll + nrows * cellsize,
        }
      : null;

  return {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    format: 'ASC',
    fileSizeBytes,
    source: 'Uploaded Esri ASCII Grid',
    planet: 'Earth',
    region: filename.replace(/\.asc$/i, ''),
    crs: 'Header-derived (check .prj if projected)',
    spatialExtent: extent,
    resolution: `${cellsize} units/cell (${ncols}×${nrows})`,
    units: 'meters (assumed)',
    noDataValue: String(nodata),
    missingValueCount: missingCount,
    totalRecords: ncols * nrows,
    qualityScore: Math.max(0, Math.round((1 - missingCount / Math.max(1, ncols * nrows)) * 1000) / 10),
    processingStatus: 'Processed',
    summaryStats: stats,
    previewRows: [
      { metric: 'Dimensions', value: `${ncols} cols × ${nrows} rows` },
      { metric: 'Elevation Range', value: `${stats.elevationMinM} m to ${stats.elevationMaxM} m` },
      { metric: 'Mean Slope', value: `${stats.meanSlopeDeg}°` },
    ],
    columns: ['metric', 'value'],
    notes: `Parsed Esri ASCII Grid (${ncols}×${nrows}, cellsize=${cellsize}).`,
    createdAt: new Date().toISOString(),
  };
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t').map((s) => s.trim());
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseDelimitedText(
  text: string,
  filename: string,
  fileSizeBytes: number,
  isTsv: boolean
): ParsedIngestionResult {
  const delimiter = isTsv ? '\t' : ',';
  const lines = text
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV/TSV file contains fewer than 2 lines.');
  }

  const headers = splitDelimitedLine(lines[0], delimiter);
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  const rows: Record<string, string | number | null>[] = [];
  let missingCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitDelimitedLine(lines[i], delimiter);
    const obj: Record<string, string | number | null> = {};
    headers.forEach((h, idx) => {
      const raw = cells[idx] ?? '';
      if (raw === '' || raw.toLowerCase() === 'na' || raw.toLowerCase() === 'nan' || raw === 'null') {
        obj[h] = null;
        missingCount++;
      } else {
        const num = Number(raw);
        obj[h] = Number.isFinite(num) && raw !== '' ? num : raw;
      }
    });
    rows.push(obj);
  }

  // Check if this is an elevation grid CSV (either wide numeric matrix OR row/col/elev or lat/lon/elev)
  const elevCol = headers.find((h) => /elev|alt|height|dem|z_m|elevation_m/i.test(h));
  const latCol = headers.find((h) => /^lat|latitude$/i.test(h));
  const lonCol = headers.find((h) => /^lon|lng|longitude$/i.test(h));
  const nameCol = headers.find((h) => /name|site|region|location|title/i.test(h));

  let summaryStats = null;
  let extent: SpatialExtent | null = null;

  if (latCol && lonCol) {
    const lats = rows.map((r) => Number(r[latCol])).filter((v) => Number.isFinite(v));
    const lons = rows.map((r) => Number(r[lonCol])).filter((v) => Number.isFinite(v));
    if (lats.length > 0 && lons.length > 0) {
      extent = {
        minLat: Math.min(...lats),
        maxLat: Math.max(...lats),
        minLon: Math.min(...lons),
        maxLon: Math.max(...lons),
      };
    }
  }

  // Attempt raster reconstruction if rows represent a grid (row/col/elev or lat/lon/elev or wide numeric table)
  const rowCol = headers.find((h) => /^row|y_idx|i$/i.test(h));
  const colCol = headers.find((h) => /^col|x_idx|j$/i.test(h));

  if (rowCol && colCol && elevCol) {
    const rowSet = Array.from(new Set(rows.map((r) => Number(r[rowCol])).filter(Number.isFinite))).sort((a, b) => a - b);
    const colSet = Array.from(new Set(rows.map((r) => Number(r[colCol])).filter(Number.isFinite))).sort((a, b) => a - b);
    if (rowSet.length >= 4 && colSet.length >= 4 && rowSet.length <= 400 && colSet.length <= 400) {
      const rMap = new Map(rowSet.map((v, i) => [v, i]));
      const cMap = new Map(colSet.map((v, i) => [v, i]));
      const matrix: number[][] = Array.from({ length: rowSet.length }, () =>
        Array(colSet.length).fill(Number.NaN)
      );
      for (const r of rows) {
        const ri = rMap.get(Number(r[rowCol]));
        const ci = cMap.get(Number(r[colCol]));
        const val = Number(r[elevCol]);
        if (ri !== undefined && ci !== undefined && Number.isFinite(val)) {
          matrix[ri][ci] = val;
        }
      }
      const valid = rows.map((r) => Number(r[elevCol])).filter(Number.isFinite);
      const mean = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!Number.isFinite(matrix[r][c])) matrix[r][c] = mean;
        }
      }
      summaryStats = computeStatsFromMatrix(matrix, 90);
    }
  } else if (latCol && lonCol && elevCol && rows.length >= 25 && !nameCol) {
    // Gridded lat/lon/elevation CSV
    const uniqLats = Array.from(new Set(rows.map((r) => Number(r[latCol])).filter(Number.isFinite))).sort((a, b) => b - a);
    const uniqLons = Array.from(new Set(rows.map((r) => Number(r[lonCol])).filter(Number.isFinite))).sort((a, b) => a - b);
    if (uniqLats.length >= 5 && uniqLons.length >= 5) {
      const rMap = new Map(uniqLats.map((v, i) => [v, i]));
      const cMap = new Map(uniqLons.map((v, i) => [v, i]));
      const matrix: number[][] = Array.from({ length: uniqLats.length }, () =>
        Array(uniqLons.length).fill(Number.NaN)
      );
      for (const r of rows) {
        const ri = rMap.get(Number(r[latCol]));
        const ci = cMap.get(Number(r[lonCol]));
        const val = Number(r[elevCol]);
        if (ri !== undefined && ci !== undefined && Number.isFinite(val)) {
          matrix[ri][ci] = val;
        }
      }
      const valid = rows.map((r) => Number(r[elevCol])).filter(Number.isFinite);
      const mean = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (!Number.isFinite(matrix[r][c])) matrix[r][c] = mean;
        }
      }
      summaryStats = computeStatsFromMatrix(matrix, 90);
    }
  } else if (headers.length >= 8 && headers.every((h) => /^-?\d+(\.\d+)?$|^col_|^x\d+/i.test(h) || Number.isFinite(Number(rows[0]?.[h])))) {
    // Wide elevation matrix CSV
    const matrix: number[][] = [];
    for (const r of rows.slice(0, 300)) {
      const mRow: number[] = [];
      for (const h of headers) {
        const v = Number(r[h]);
        mRow.push(Number.isFinite(v) ? v : 0);
      }
      matrix.push(mRow);
    }
    if (matrix.length >= 4) {
      summaryStats = computeStatsFromMatrix(matrix, 90);
    }
  }

  // Extract analog sites if this is a tabular terrestrial analog catalog
  const extractedSites: AnalogSite[] = [];
  if (nameCol && latCol && lonCol) {
    const slopeCol = headers.find((h) => /slope/i.test(h));
    const triCol = headers.find((h) => /tri|rugged/i.test(h));
    const bodyCol = headers.find((h) => /body|planet|target_body/i.test(h));
    const catCol = headers.find((h) => /cat|type|env|terrain/i.test(h));
    const matCol = headers.find((h) => /material|geolog|mineral|litho/i.test(h));
    const countryCol = headers.find((h) => /country|sector|region/i.test(h));

    rows.slice(0, 100).forEach((row, idx) => {
      const siteName = String(row[nameCol] ?? '').trim();
      const lat = Number(row[latCol]);
      const lon = Number(row[lonCol]);
      if (!siteName || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

      const rawBody = String(bodyCol ? row[bodyCol] ?? 'Earth' : 'Earth').toLowerCase();
      const body: PlanetaryBody = rawBody.includes('mars')
        ? 'Mars'
        : rawBody.includes('moon') || rawBody.includes('lunar')
          ? 'Moon'
          : 'Earth';

      const elevMean = elevCol && Number.isFinite(Number(row[elevCol])) ? Number(row[elevCol]) : null;
      const slopeVal = slopeCol && Number.isFinite(Number(row[slopeCol])) ? Number(row[slopeCol]) : null;
      const triVal = triCol && Number.isFinite(Number(row[triCol])) ? Number(row[triCol]) : null;

      const rawCat = String(catCol ? row[catCol] ?? '' : '').toLowerCase();
      let category: TerrainCategory = 'Desert';
      if (rawCat.includes('polar') || rawCat.includes('ice') || rawCat.includes('arctic')) category = 'Polar';
      else if (rawCat.includes('volcan') || rawCat.includes('basalt') || rawCat.includes('lava')) category = 'Volcanic';
      else if (rawCat.includes('crater') || rawCat.includes('impact')) category = 'Impact Crater';
      else if (rawCat.includes('canyon') || rawCat.includes('valley')) category = 'Canyon / Valley';
      else if (rawCat.includes('evapor') || rawCat.includes('salt') || rawCat.includes('playa')) category = 'Evaporite Basin';
      else if (rawCat.includes('high') || rawCat.includes('alpin')) category = 'High-Altitude Arid';

      const nonNullMetrics = [elevMean, slopeVal, triVal].filter((x) => x !== null).length;

      extractedSites.push({
        id: `uploaded-${Date.now()}-${idx}`,
        name: siteName,
        region: String(countryCol ? row[countryCol] ?? filename : filename),
        countryOrSector: String(countryCol ? row[countryCol] ?? 'Uploaded Dataset' : 'Uploaded Dataset'),
        body,
        latitude: lat,
        longitude: lon,
        category,
        status: body === 'Earth' ? 'Candidate Region' : 'Planetary Target',
        provenance: 'Uploaded Local Dataset',
        sourceCitation: `User Uploaded File: ${filename}`,
        elevationMinM: elevMean !== null ? elevMean - 100 : null,
        elevationMaxM: elevMean !== null ? elevMean + 100 : null,
        elevationMeanM: elevMean,
        reliefM: null,
        meanSlopeDeg: slopeVal,
        maxSlopeDeg: null,
        triMeanM: triVal,
        surfaceMaterial: String(matCol && row[matCol] ? row[matCol] : 'Unspecified in uploaded file'),
        geologySummary: `Ingested directly from ${filename}. Fields unavailable in source CSV are left null rather than interpolated.`,
        waterIceIndicator: 'Inspect source dataset attributes',
        waterIceScore: null,
        mineralogyClass: String(matCol && row[matCol] ? row[matCol] : 'Not specified'),
        tempMinC: null,
        tempMaxC: null,
        resourceIndicators: 'Derived from uploaded attributes',
        recommendedTargetId: null,
        dataCompletenessPct: Math.round(((nonNullMetrics + 2) / 6) * 100),
        limitations: {
          gravityRatio: '1.00 g Earth vs. Moon 0.165 g / Mars 0.38 g',
          atmosphereNote: 'Terrestrial ambient pressure unless planetary target',
          radiationNote: 'Magnetospheric shielding on Earth',
          weatheringCaveat: 'Imported row metadata — verify primary sensor CRS and units',
        },
        imageUrl:
          body === 'Mars'
            ? '/assets/mars/mars_jezero_crater.jpg'
            : body === 'Moon'
              ? '/assets/moon/lunar_south_pole.jpg'
              : '/assets/earth/ladakh_valley.jpg',
        imageAttribution: `Uploaded Record Visual (${filename})`,
      });
    });
  }

  const totalCells = rows.length * headers.length;
  const qualityScore = Math.max(
    0,
    Math.round((1 - missingCount / Math.max(1, totalCells)) * 1000) / 10
  );

  const dataset: DatasetRecord = {
    id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename,
    format: isTsv ? 'TSV' : 'CSV',
    fileSizeBytes,
    source: 'Uploaded Tabular Geospatial File',
    planet: lowerHeaders.some((h) => h.includes('mars') || h.includes('moon')) ? 'Multi-Planet' : 'Earth',
    region: filename.replace(/\.(csv|tsv)$/i, ''),
    crs: latCol && lonCol ? 'Geographic Lat/Lon (assumed WGS84)' : 'Tabular / Grid Index',
    spatialExtent: extent,
    resolution: summaryStats ? `${summaryStats.rows}×${summaryStats.cols} grid` : `${rows.length} rows`,
    units: elevCol ? 'meters (column-derived)' : 'mixed attributes',
    noDataValue: 'null / NaN / empty',
    missingValueCount: missingCount,
    totalRecords: rows.length,
    qualityScore,
    processingStatus: 'Processed',
    summaryStats,
    previewRows: rows.slice(0, 12),
    columns: headers,
    notes:
      extractedSites.length > 0
        ? `Parsed ${rows.length} rows and indexed ${extractedSites.length} geospatial site records into Analog Finder.`
        : `Parsed ${rows.length} rows (${headers.length} columns). Missing cells: ${missingCount}.`,
    createdAt: new Date().toISOString(),
  };

  return { dataset, extractedSites };
}

function parseGeoJson(
  text: string,
  filename: string,
  fileSizeBytes: number
): ParsedIngestionResult {
  const json = JSON.parse(text);
  const features = Array.isArray(json.features)
    ? json.features
    : json.type === 'Feature'
      ? [json]
      : [];

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  const previewRows: Record<string, string | number | null>[] = [];
  const extractedSites: AnalogSite[] = [];
  const colSet = new Set<string>(['geometry_type', 'longitude', 'latitude']);

  const scanCoord = (coord: unknown) => {
    if (Array.isArray(coord) && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
      minLon = Math.min(minLon, coord[0]);
      maxLon = Math.max(maxLon, coord[0]);
      minLat = Math.min(minLat, coord[1]);
      maxLat = Math.max(maxLat, coord[1]);
    } else if (Array.isArray(coord)) {
      coord.forEach(scanCoord);
    }
  };

  features.forEach((f: any, idx: number) => {
    if (f?.geometry?.coordinates) scanCoord(f.geometry.coordinates);
    const props = f?.properties ?? {};
    Object.keys(props).forEach((k) => colSet.add(k));
    const coords =
      f?.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)
        ? f.geometry.coordinates
        : null;
    if (idx < 12) {
      previewRows.push({
        geometry_type: f?.geometry?.type ?? 'Unknown',
        longitude: coords ? coords[0] : null,
        latitude: coords ? coords[1] : null,
        ...props,
      });
    }
    if (coords && (props.name || props.site_name || props.title)) {
      extractedSites.push({
        id: `geojson-${Date.now()}-${idx}`,
        name: String(props.name ?? props.site_name ?? props.title),
        region: String(props.region ?? filename),
        countryOrSector: String(props.country ?? 'GeoJSON Feature'),
        body: 'Earth',
        latitude: Number(coords[1]),
        longitude: Number(coords[0]),
        category: 'Desert',
        status: 'Candidate Region',
        provenance: 'Uploaded Local Dataset',
        sourceCitation: `Uploaded GeoJSON: ${filename}`,
        elevationMinM: null,
        elevationMaxM: null,
        elevationMeanM: Number.isFinite(Number(props.elevation_m)) ? Number(props.elevation_m) : null,
        reliefM: null,
        meanSlopeDeg: Number.isFinite(Number(props.slope_deg)) ? Number(props.slope_deg) : null,
        maxSlopeDeg: null,
        triMeanM: null,
        surfaceMaterial: String(props.material ?? 'Unspecified in GeoJSON'),
        geologySummary: String(props.description ?? `Imported from ${filename}`),
        waterIceIndicator: 'Unspecified',
        waterIceScore: null,
        mineralogyClass: String(props.mineralogy ?? 'Unspecified'),
        tempMinC: null,
        tempMaxC: null,
        resourceIndicators: 'See feature properties',
        recommendedTargetId: null,
        dataCompletenessPct: 55,
        limitations: {
          gravityRatio: '1.00 g Earth',
          atmosphereNote: 'Terrestrial environment',
          radiationNote: 'Terrestrial shielding',
          weatheringCaveat: 'Imported GeoJSON feature',
        },
        imageUrl: '/assets/earth/ladakh_valley.jpg',
        imageAttribution: `Uploaded GeoJSON Feature (${filename})`,
      });
    }
  });

  const extent =
    Number.isFinite(minLat) && Number.isFinite(minLon)
      ? { minLat, maxLat, minLon, maxLon }
      : null;

  return {
    dataset: {
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filename,
      format: 'GeoJSON',
      fileSizeBytes,
      source: 'Uploaded GeoJSON Vector Dataset',
      planet: 'Earth',
      region: filename.replace(/\.(geojson|json)$/i, ''),
      crs: 'RFC 7946 WGS84 (EPSG:4326)',
      spatialExtent: extent,
      resolution: `${features.length} vector features`,
      units: 'degrees',
      noDataValue: 'null',
      missingValueCount: 0,
      totalRecords: features.length,
      qualityScore: features.length > 0 ? 100 : 0,
      processingStatus: 'Processed',
      summaryStats: null,
      previewRows,
      columns: Array.from(colSet),
      notes: `Validated GeoJSON containing ${features.length} features.`,
      createdAt: new Date().toISOString(),
    },
    extractedSites,
  };
}

export async function ingestUploadedBuffer(
  buffer: Buffer,
  filename: string
): Promise<ParsedIngestionResult> {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(buffer);
    const entries = Object.values(zip.files).filter((f) => !f.dir);
    // Prioritize .hgt, then .asc, then .csv, then .tsv, then .geojson
    const preferred =
      entries.find((e) => e.name.toLowerCase().endsWith('.hgt')) ??
      entries.find((e) => e.name.toLowerCase().endsWith('.asc')) ??
      entries.find((e) => e.name.toLowerCase().endsWith('.csv')) ??
      entries.find((e) => e.name.toLowerCase().endsWith('.tsv')) ??
      entries.find((e) => e.name.toLowerCase().endsWith('.geojson')) ??
      entries.find((e) => e.name.toLowerCase().endsWith('.json'));

    if (!preferred) {
      throw new Error(
        `ZIP archive "${filename}" does not contain a supported .hgt, .asc, .csv, .tsv, or .geojson file.`
      );
    }
    const innerBuf = await preferred.async('nodebuffer');
    const result = await ingestUploadedBuffer(innerBuf, preferred.name);
    result.dataset.notes = `Extracted "${preferred.name}" from ZIP archive "${filename}". ${result.dataset.notes}`;
    result.dataset.fileSizeBytes = buffer.length;
    return result;
  }

  if (lower.endsWith('.hgt')) {
    return {
      dataset: parseHgtBuffer(buffer, filename, buffer.length),
      extractedSites: [],
    };
  }

  const text = buffer.toString('utf8');

  if (lower.endsWith('.asc')) {
    return {
      dataset: parseAsciiGrid(text, filename, buffer.length),
      extractedSites: [],
    };
  }

  if (lower.endsWith('.csv')) {
    return parseDelimitedText(text, filename, buffer.length, false);
  }

  if (lower.endsWith('.tsv')) {
    return parseDelimitedText(text, filename, buffer.length, true);
  }

  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    return parseGeoJson(text, filename, buffer.length);
  }

  throw new Error(
    `Unsupported file extension for "${filename}". Supported formats: .hgt, .zip, .asc, .csv, .tsv, .geojson, .json.`
  );
}

export function evaluateSimilarity(
  earthSite: AnalogSite,
  targetSite: AnalogSite,
  weights: SimilarityWeights
): SimilarityEvaluation {
  const missingVariables: string[] = [];
  const contributions: FeatureContribution[] = [];

  const totalWeightRaw =
    weights.slope +
    weights.ruggedness +
    weights.relief +
    weights.thermal +
    weights.waterIce +
    weights.mineralogy;
  const safeDenom = totalWeightRaw > 0 ? totalWeightRaw : 1;

  const normWeight = (w: number) => Math.round((w / safeDenom) * 1000) / 10;

  // 1. Slope similarity
  if (earthSite.meanSlopeDeg !== null && targetSite.meanSlopeDeg !== null) {
    const diff = Math.abs(earthSite.meanSlopeDeg - targetSite.meanSlopeDeg);
    const score = Math.max(0, Math.round((1 - Math.min(diff / 25, 1)) * 1000) / 10);
    contributions.push({
      feature: 'Mean Surface Slope',
      weightPct: normWeight(weights.slope),
      contributionScore: score,
      earthValue: `${earthSite.meanSlopeDeg.toFixed(1)}°`,
      targetValue: `${targetSite.meanSlopeDeg.toFixed(1)}°`,
      available: true,
      note: `Δ = ${diff.toFixed(1)}° local gradient difference`,
    });
  } else {
    missingVariables.push('Mean Surface Slope');
    contributions.push({
      feature: 'Mean Surface Slope',
      weightPct: normWeight(weights.slope),
      contributionScore: 0,
      earthValue: earthSite.meanSlopeDeg !== null ? `${earthSite.meanSlopeDeg}°` : 'Unavailable',
      targetValue: targetSite.meanSlopeDeg !== null ? `${targetSite.meanSlopeDeg}°` : 'Unavailable',
      available: false,
      note: 'Excluded from weighted average due to missing data',
    });
  }

  // 2. Terrain Ruggedness Index (TRI)
  if (earthSite.triMeanM !== null && targetSite.triMeanM !== null) {
    const diff = Math.abs(earthSite.triMeanM - targetSite.triMeanM);
    const maxRef = Math.max(earthSite.triMeanM, targetSite.triMeanM, 10);
    const score = Math.max(0, Math.round((1 - Math.min(diff / maxRef, 1)) * 1000) / 10);
    contributions.push({
      feature: 'Terrain Ruggedness (TRI)',
      weightPct: normWeight(weights.ruggedness),
      contributionScore: score,
      earthValue: `${earthSite.triMeanM.toFixed(1)} m`,
      targetValue: `${targetSite.triMeanM.toFixed(1)} m`,
      available: true,
      note: 'Local neighborhood elevation variance (Riley TRI)',
    });
  } else {
    missingVariables.push('Terrain Ruggedness Index');
    contributions.push({
      feature: 'Terrain Ruggedness (TRI)',
      weightPct: normWeight(weights.ruggedness),
      contributionScore: 0,
      earthValue: earthSite.triMeanM !== null ? `${earthSite.triMeanM} m` : 'Unavailable',
      targetValue: targetSite.triMeanM !== null ? `${targetSite.triMeanM} m` : 'Unavailable',
      available: false,
      note: 'Excluded from weighted average due to missing data',
    });
  }

  // 3. Dimensionless Relative Relief (never raw planetary datum comparison!)
  if (earthSite.reliefM !== null && targetSite.reliefM !== null) {
    const ratio =
      Math.min(earthSite.reliefM, targetSite.reliefM) /
      Math.max(earthSite.reliefM, targetSite.reliefM, 1);
    const score = Math.round(Math.pow(ratio, 0.7) * 1000) / 10;
    contributions.push({
      feature: 'Relative Topographic Relief',
      weightPct: normWeight(weights.relief),
      contributionScore: score,
      earthValue: `${earthSite.reliefM} m span`,
      targetValue: `${targetSite.reliefM} m span`,
      available: true,
      note: 'Datum-independent local relief span ratio (avoids comparing EGM96 vs MOLA/LOLA zero-datums)',
    });
  } else {
    missingVariables.push('Relative Topographic Relief');
    contributions.push({
      feature: 'Relative Topographic Relief',
      weightPct: normWeight(weights.relief),
      contributionScore: 0,
      earthValue: earthSite.reliefM !== null ? `${earthSite.reliefM} m` : 'Unavailable',
      targetValue: targetSite.reliefM !== null ? `${targetSite.reliefM} m` : 'Unavailable',
      available: false,
      note: 'Excluded due to incomplete DEM bounds',
    });
  }

  // 4. Thermal Regime Alignment (cold-end overlap for Mars/Moon analogs)
  if (
    earthSite.tempMinC !== null &&
    earthSite.tempMaxC !== null &&
    targetSite.tempMinC !== null &&
    targetSite.tempMaxC !== null
  ) {
    const minDiff = Math.abs(earthSite.tempMinC - targetSite.tempMinC);
    const score = Math.max(0, Math.round((1 - Math.min(minDiff / 190, 1)) * 1000) / 10);
    contributions.push({
      feature: 'Thermal Envelope (Cold Extremes)',
      weightPct: normWeight(weights.thermal),
      contributionScore: score,
      earthValue: `${earthSite.tempMinC}°C to ${earthSite.tempMaxC}°C`,
      targetValue: `${targetSite.tempMinC}°C to ${targetSite.tempMaxC}°C`,
      available: true,
      note: 'Evaluates freeze-thaw / cryogenic minimum temperature overlap',
    });
  } else {
    missingVariables.push('Thermal Envelope');
    contributions.push({
      feature: 'Thermal Envelope (Cold Extremes)',
      weightPct: normWeight(weights.thermal),
      contributionScore: 0,
      earthValue: earthSite.tempMinC !== null ? `${earthSite.tempMinC}°C` : 'Unavailable',
      targetValue: targetSite.tempMinC !== null ? `${targetSite.tempMinC}°C` : 'Unavailable',
      available: false,
      note: 'Missing seasonal thermal range in dataset',
    });
  }

  // 5. Water / Ice Stability Indicator
  if (earthSite.waterIceScore !== null && targetSite.waterIceScore !== null) {
    const diff = Math.abs(earthSite.waterIceScore - targetSite.waterIceScore);
    const score = Math.max(0, Math.round((1 - diff) * 1000) / 10);
    contributions.push({
      feature: 'Water / Ice Indicator',
      weightPct: normWeight(weights.waterIce),
      contributionScore: score,
      earthValue: `Index ${earthSite.waterIceScore.toFixed(2)}`,
      targetValue: `Index ${targetSite.waterIceScore.toFixed(2)}`,
      available: true,
      note: `${earthSite.waterIceIndicator} vs. ${targetSite.waterIceIndicator}`,
    });
  } else {
    missingVariables.push('Water / Ice Indicator');
    contributions.push({
      feature: 'Water / Ice Indicator',
      weightPct: normWeight(weights.waterIce),
      contributionScore: 0,
      earthValue: earthSite.waterIceIndicator,
      targetValue: targetSite.waterIceIndicator,
      available: false,
      note: 'Quantitative hydration index unavailable for one or both sites',
    });
  }

  // 6. Mineralogical & Morphological Class Compatibility
  const eTokens = new Set(
    `${earthSite.mineralogyClass} ${earthSite.category}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
  const tTokens = new Set(
    `${targetSite.mineralogyClass} ${targetSite.category}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2)
  );
  let matches = 0;
  for (const tok of eTokens) {
    if (tTokens.has(tok)) matches++;
  }
  const minScore =
    earthSite.category === targetSite.category
      ? Math.min(96, 68 + matches * 10)
      : Math.min(88, 34 + matches * 16);
  contributions.push({
    feature: 'Geology & Mineralogy Class',
    weightPct: normWeight(weights.mineralogy),
    contributionScore: minScore,
    earthValue: earthSite.mineralogyClass,
    targetValue: targetSite.mineralogyClass,
    available: true,
    note:
      earthSite.category === targetSite.category
        ? `Matching geomorphological class (${earthSite.category})`
        : `Cross-class lithologic comparison (${earthSite.category} vs. ${targetSite.category})`,
  });

  // Compute weighted score ONLY over available features
  let weightedSum = 0;
  let availableWeightSum = 0;
  for (const c of contributions) {
    if (c.available) {
      weightedSum += c.contributionScore * c.weightPct;
      availableWeightSum += c.weightPct;
    }
  }
  const overallScore =
    availableWeightSum > 0 ? Math.round((weightedSum / availableWeightSum) * 10) / 10 : 0;

  const availableRatio =
    contributions.filter((c) => c.available).length / contributions.length;
  const confidencePct = Math.round(
    availableRatio * ((earthSite.dataCompletenessPct + targetSite.dataCompletenessPct) / 2)
  );

  const topDrivers = contributions
    .filter((c) => c.available)
    .sort((a, b) => b.contributionScore - a.contributionScore)
    .slice(0, 2)
    .map((c) => `${c.feature} (${c.contributionScore}%)`)
    .join(' and ');

  return {
    earthSite,
    targetSite,
    overallScore,
    confidencePct,
    missingVariables,
    featureContributions: contributions,
    explanation: `${earthSite.name} scores ${overallScore.toFixed(1)}% weighted similarity against ${targetSite.name} (${targetSite.body}) under the active user-configured feature weights, driven primarily by ${topDrivers}. Confidence is ${confidencePct}% (${missingVariables.length} missing variable${missingVariables.length === 1 ? '' : 's'}).`,
    limitationsSummary: `Partial analogue only: ${earthSite.limitations.gravityRatio}; ${earthSite.limitations.atmosphereNote}; ${earthSite.limitations.radiationNote}.`,
  };
}

function getDefaultPlanetScaleNote(body: PlanetaryBody): string {
  if (body === 'Earth') {
    return 'SRTM / ASTER GDEM (~30–90 m terrestrial reference scale)';
  }
  if (body === 'Mars') {
    return 'MOLA / HRSC / HiRISE (~1–463 m mixed orbital reference scale)';
  }
  return 'LRO LOLA / LROC NAC (~2–118 m lunar polar/equatorial scale)';
}

function matchSiteProvenance(
  site: AnalogSite,
  processedRealDatasets: DatasetRecord[]
): {
  datasetName: string;
  dataSource: string;
  processingStatus: string;
  resolutionNote: string;
  dataCategory: MorphometricDataCategory;
} {
  // Check if a real processed DEM / tabular dataset covers this site's coordinates or source citation
  const matchingDs = processedRealDatasets.find((ds) => {
    if (site.provenance === 'Uploaded Local Dataset') {
      return site.sourceCitation.includes(ds.filename);
    }
    if (
      ds.planet === site.body &&
      ds.spatialExtent &&
      site.latitude >= ds.spatialExtent.minLat &&
      site.latitude <= ds.spatialExtent.maxLat &&
      site.longitude >= ds.spatialExtent.minLon &&
      site.longitude <= ds.spatialExtent.maxLon
    ) {
      return true;
    }
    const lowerSite = site.name.toLowerCase();
    const lowerRegion = ds.region.toLowerCase();
    return lowerRegion.length > 3 && lowerSite.includes(lowerRegion);
  });

  if (site.provenance === 'Uploaded Local Dataset') {
    return {
      datasetName: matchingDs ? matchingDs.filename : site.sourceCitation,
      dataSource: matchingDs ? matchingDs.source : site.sourceCitation,
      processingStatus: matchingDs ? matchingDs.processingStatus : 'Processed Upload',
      resolutionNote: matchingDs
        ? `${matchingDs.resolution} (${matchingDs.crs})`
        : 'User-uploaded tabular record (verify source DEM cell spacing)',
      dataCategory: 'Uploaded Local Dataset',
    };
  }

  if (matchingDs && matchingDs.summaryStats) {
    return {
      datasetName: `${matchingDs.filename} + Reference Baseline`,
      dataSource: `${matchingDs.source}; ${site.sourceCitation}`,
      processingStatus: 'Processed DEM + Reference Baseline',
      resolutionNote: `${matchingDs.resolution} (${matchingDs.crs})`,
      dataCategory: 'Measured / Processed DEM',
    };
  }

  return {
    datasetName: `${site.body} Literature Reference Catalog`,
    dataSource: site.sourceCitation,
    processingStatus: 'Published Literature Baseline',
    resolutionNote: getDefaultPlanetScaleNote(site.body),
    dataCategory: 'Literature Reference Baseline',
  };
}

function getClusterSemanticLabel(index: number, totalClusters: number): string {
  if (totalClusters === 2) {
    return index === 0 ? 'Low-to-Moderate Relief' : 'High-Slope / Rugged Terrain';
  }
  if (totalClusters === 3) {
    if (index === 0) return 'Low-Relief / Gentle Plains';
    if (index === 1) return 'Moderate-Slope Basins & Craters';
    return 'Steep / High-Ruggedness Terrain';
  }
  if (totalClusters === 4) {
    if (index === 0) return 'Flat / Low-Relief Basin';
    if (index === 1) return 'Gentle-to-Moderate Slope';
    if (index === 2) return 'Moderately Rugged Highlands';
    return 'Steep Escarpment / Canyon';
  }
  return `Morphometric Regime ${index + 1}`;
}

export function computeMorphometricClusters(
  sites: AnalogSite[],
  datasets: DatasetRecord[],
  options?: {
    k?: number;
    normalization?: MorphometricNormalization;
  }
): MorphometricClusteringResult {
  const normalization: MorphometricNormalization =
    options?.normalization === 'minmax' || options?.normalization === 'raw'
      ? options.normalization
      : 'zscore';

  const processedRealDatasets = datasets.filter(
    (d) => d.processingStatus === 'Processed' && !d.id.startsWith('ds-calib-')
  );

  const pendingExternalDatasets = datasets
    .filter((d) => d.processingStatus === 'Pending Upload (Not Mounted)')
    .map((d) => d.filename);

  const validEntries: Array<{
    site: AnalogSite;
    meanSlopeDeg: number;
    triMeanM: number;
    prov: ReturnType<typeof matchSiteProvenance>;
  }> = [];

  const unavailableRegions: UnavailableMorphometricRegion[] = [];

  for (const site of sites) {
    const prov = matchSiteProvenance(site, processedRealDatasets);
    const hasSlope =
      typeof site.meanSlopeDeg === 'number' && Number.isFinite(site.meanSlopeDeg);
    const hasTri = typeof site.triMeanM === 'number' && Number.isFinite(site.triMeanM);

    if (!hasSlope || !hasTri) {
      const missingFields: string[] = [];
      if (!hasSlope) missingFields.push('Mean Surface Slope (°)');
      if (!hasTri) missingFields.push('Riley TRI (m)');
      unavailableRegions.push({
        id: site.id,
        name: site.name,
        body: site.body,
        status: site.status,
        meanSlopeDeg: hasSlope ? site.meanSlopeDeg : null,
        triMeanM: hasTri ? site.triMeanM : null,
        datasetName: prov.datasetName,
        processingStatus: prov.processingStatus,
        reason: `Excluded from clustering: missing ${missingFields.join(' and ')} in source dataset (null values are never treated as zero).`,
      });
      continue;
    }

    validEntries.push({
      site,
      meanSlopeDeg: site.meanSlopeDeg as number,
      triMeanM: site.triMeanM as number,
      prov,
    });
  }

  const requestedK = Math.round(Number(options?.k ?? 3));
  const k = Math.max(1, Math.min(requestedK || 3, Math.min(6, Math.max(1, validEntries.length))));

  if (validEntries.length === 0) {
    return {
      points: [],
      unavailableRegions,
      clusters: [],
      k: 0,
      normalization,
      clusteringSpace: 'None (no complete morphometric pairs)',
      clusteringMethod: 'Deterministic K-Means++',
      normalizationMethod:
        normalization === 'minmax'
          ? 'Min-Max [0, 1] Scaling'
          : 'Z-Score Standardization (μ = 0, σ = 1)',
      scaleCaveat:
        'Cross-planet Riley TRI values depend on DEM grid spacing (Earth ~30–90 m SRTM vs. Moon ~60–118 m LOLA vs. Mars ~1–463 m HiRISE/MOLA). Standardized scores normalize statistical spread but do not erase native sensor resolution differences.',
      limitationNote:
        'Clusters reflect 2D morphometric similarity under selected normalization and baseline scale assumptions — not validated geological or environmental equivalence.',
      pendingExternalDatasets,
      generatedAt: new Date().toISOString(),
    };
  }

  // Compute global descriptive statistics across valid entries for exact Z-score & Min-Max normalization
  const slopes = validEntries.map((e) => e.meanSlopeDeg);
  const tris = validEntries.map((e) => e.triMeanM);

  const meanSlope = slopes.reduce((a, b) => a + b, 0) / slopes.length;
  const meanTri = tris.reduce((a, b) => a + b, 0) / tris.length;

  const stdSlope =
    Math.sqrt(slopes.reduce((acc, v) => acc + (v - meanSlope) ** 2, 0) / slopes.length) || 1;
  const stdTri =
    Math.sqrt(tris.reduce((acc, v) => acc + (v - meanTri) ** 2, 0) / tris.length) || 1;

  const minSlope = Math.min(...slopes);
  const maxSlope = Math.max(...slopes);
  const slopeSpan = maxSlope - minSlope || 1;

  const minTri = Math.min(...tris);
  const maxTri = Math.max(...tris);
  const triSpan = maxTri - minTri || 1;

  const normalizedVectors = validEntries.map((entry) => {
    const slopeZ = (entry.meanSlopeDeg - meanSlope) / stdSlope;
    const triZ = (entry.triMeanM - meanTri) / stdTri;
    const slopeMinMax = (entry.meanSlopeDeg - minSlope) / slopeSpan;
    const triMinMax = (entry.triMeanM - minTri) / triSpan;

    // Raw mode still clusters in Z-score space so meter-scale TRI doesn't overwhelm degree-scale slope
    const featX = normalization === 'minmax' ? slopeMinMax : slopeZ;
    const featY = normalization === 'minmax' ? triMinMax : triZ;

    return {
      entry,
      slopeZ,
      triZ,
      slopeMinMax,
      triMinMax,
      featX,
      featY,
    };
  });

  // Deterministic K-Means++ initialization (sorted anchor + farthest-point selection)
  const seedIndices: number[] = [];
  let firstIdx = 0;
  let bestAnchorScore = Infinity;
  normalizedVectors.forEach((v, idx) => {
    const score = v.featX + v.featY;
    if (
      score < bestAnchorScore - 1e-12 ||
      (Math.abs(score - bestAnchorScore) <= 1e-12 && v.entry.site.id < normalizedVectors[firstIdx].entry.site.id)
    ) {
      bestAnchorScore = score;
      firstIdx = idx;
    }
  });
  seedIndices.push(firstIdx);

  while (seedIndices.length < k) {
    let farthestIdx = 0;
    let maxMinDist = -1;
    for (let i = 0; i < normalizedVectors.length; i++) {
      if (seedIndices.includes(i)) continue;
      let minDist = Infinity;
      for (const sIdx of seedIndices) {
        const dx = normalizedVectors[i].featX - normalizedVectors[sIdx].featX;
        const dy = normalizedVectors[i].featY - normalizedVectors[sIdx].featY;
        const d2 = dx * dx + dy * dy;
        if (d2 < minDist) minDist = d2;
      }
      if (
        minDist > maxMinDist + 1e-12 ||
        (Math.abs(minDist - maxMinDist) <= 1e-12 &&
          normalizedVectors[i].entry.site.id < normalizedVectors[farthestIdx].entry.site.id)
      ) {
        maxMinDist = minDist;
        farthestIdx = i;
      }
    }
    seedIndices.push(farthestIdx);
  }

  const centroids = seedIndices.map((idx) => ({
    x: normalizedVectors[idx].featX,
    y: normalizedVectors[idx].featY,
  }));

  const assignments = new Array<number>(normalizedVectors.length).fill(0);
  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    for (let i = 0; i < normalizedVectors.length; i++) {
      let bestCluster = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const dx = normalizedVectors[i].featX - centroids[c].x;
        const dy = normalizedVectors[i].featY - centroids[c].y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist - 1e-12) {
          bestDist = d2;
          bestCluster = c;
        }
      }
      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed && iter > 0) break;

    for (let c = 0; c < k; c++) {
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      for (let i = 0; i < normalizedVectors.length; i++) {
        if (assignments[i] === c) {
          sumX += normalizedVectors[i].featX;
          sumY += normalizedVectors[i].featY;
          count++;
        }
      }
      if (count > 0) {
        centroids[c] = { x: sumX / count, y: sumY / count };
      }
    }
  }

  // Order clusters deterministically from lowest to highest roughness centroid
  const clusterOrder = Array.from({ length: k }, (_, c) => c)
    .filter((c) => assignments.some((a) => a === c))
    .sort((a, b) => centroids[a].x + centroids[a].y - (centroids[b].x + centroids[b].y));

  const clusterRemap = new Map<number, number>();
  clusterOrder.forEach((rawIdx, orderedIdx) => {
    clusterRemap.set(rawIdx, orderedIdx + 1);
  });

  const effectiveK = clusterOrder.length;

  const points: MorphometricPoint[] = normalizedVectors.map((v, i) => {
    const finalClusterId = clusterRemap.get(assignments[i]) ?? 1;
    return {
      id: v.entry.site.id,
      name: v.entry.site.name,
      shortName: v.entry.site.name.split('(')[0].trim(),
      body: v.entry.site.body,
      region: v.entry.site.region,
      category: v.entry.site.category,
      status: v.entry.site.status,
      meanSlopeDeg: Math.round(v.entry.meanSlopeDeg * 100) / 100,
      triMeanM: Math.round(v.entry.triMeanM * 100) / 100,
      slopeZ: Math.round(v.slopeZ * 1000) / 1000,
      triZ: Math.round(v.triZ * 1000) / 1000,
      slopeMinMax: Math.round(v.slopeMinMax * 1000) / 1000,
      triMinMax: Math.round(v.triMinMax * 1000) / 1000,
      clusterId: finalClusterId,
      clusterLabel: getClusterSemanticLabel(finalClusterId - 1, effectiveK),
      datasetName: v.entry.prov.datasetName,
      dataSource: v.entry.prov.dataSource,
      processingStatus: v.entry.prov.processingStatus,
      resolutionNote: v.entry.prov.resolutionNote,
      dataCategory: v.entry.prov.dataCategory,
      provenance: v.entry.site.provenance,
    };
  });

  const clusters: MorphometricClusterSummary[] = Array.from({ length: effectiveK }, (_, idx) => {
    const cid = idx + 1;
    const members = points.filter((p) => p.clusterId === cid);
    const mSlopes = members.map((m) => m.meanSlopeDeg);
    const mTris = members.map((m) => m.triMeanM);
    const bodyOrder: PlanetaryBody[] = ['Earth', 'Mars', 'Moon'];
    const planetsRepresented = bodyOrder.filter((b) => members.some((m) => m.body === b));
    return {
      clusterId: cid,
      label: getClusterSemanticLabel(idx, effectiveK),
      count: members.length,
      planetsRepresented,
      regionNames: members.map((m) => m.shortName),
      slopeMinDeg: Math.min(...mSlopes),
      slopeMaxDeg: Math.max(...mSlopes),
      triMinM: Math.min(...mTris),
      triMaxM: Math.max(...mTris),
      meanSlopeDeg: Math.round((mSlopes.reduce((a, b) => a + b, 0) / members.length) * 100) / 100,
      meanTriM: Math.round((mTris.reduce((a, b) => a + b, 0) / members.length) * 100) / 100,
      centroidSlopeZ:
        Math.round((members.reduce((a, b) => a + b.slopeZ, 0) / members.length) * 100) / 100,
      centroidTriZ:
        Math.round((members.reduce((a, b) => a + b.triZ, 0) / members.length) * 100) / 100,
    };
  });

  return {
    points,
    unavailableRegions,
    clusters,
    k: effectiveK,
    normalization,
    clusteringSpace:
      normalization === 'minmax'
        ? 'Min-Max Normalized [0, 1] (Slope, Riley TRI)'
        : 'Z-Score Standardized (Slope_z, TRI_z)',
    clusteringMethod: 'Deterministic K-Means++ (Euclidean Distance, Ordered Centroids)',
    normalizationMethod:
      normalization === 'minmax'
        ? 'Min-Max Feature Scaling [0–1]'
        : normalization === 'raw'
          ? 'Clustered in Z-Score Space; Plotted in Raw Units (m vs °)'
          : 'Z-Score Standardization (x − μ) / σ',
    scaleCaveat:
      'Cross-planet Riley TRI depends on raster resolution and spatial window (Earth SRTM ~30–90 m vs. Moon LOLA ~60–118 m vs. Mars MOLA/HiRISE ~1–463 m). Standardized axes align relative statistical dispersion but do not imply raw meter-scale equivalence.',
    limitationNote:
      'Clusters represent statistical morphometric grouping on 2D roughness features under active normalization/scale assumptions — not validated geological, mineralogical, or environmental equivalence.',
    pendingExternalDatasets,
    generatedAt: new Date().toISOString(),
  };
}

