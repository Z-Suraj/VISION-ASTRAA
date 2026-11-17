import JSZip from 'jszip';
import type {
  AnalogSite,
  DatasetRecord,
  PlanetaryBody,
  SpatialExtent,
  TerrainCategory,
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

export { evaluateSimilarity, computeMorphometricClusters, buildSimilarityMatrix } from '../shared/legacyMath.ts';
