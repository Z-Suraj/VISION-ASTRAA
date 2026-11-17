// Pure analogue evaluation and clustering from the original Vision Astraa repository.
// Source revision 9a69e929f62a07bf5ec6a55995ba763d672df524, src/server/geospatial.ts.
import type {
  AnalogSite, DatasetRecord, FeatureContribution, MorphometricClusterSummary,
  MorphometricClusteringResult, MorphometricDataCategory, MorphometricNormalization,
  MorphometricPoint, PlanetaryBody, SimilarityAnalysisStatus, SimilarityEvaluation,
  SimilarityMatrixResponse, SimilarityMatrixRow, SimilarityWeights, UnavailableMorphometricRegion,
} from '../types/astraa.ts';

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

const CURATED_DEMONSTRATION_PAIRS = new Set<string>([
  'earth-ladakh::mars-jezero',
  'earth-atacama::mars-gale',
  'earth-atacama::mars-jezero',
  'earth-haughton::mars-jezero',
  'earth-haughton::moon-shackleton',
  'earth-dry-valleys::moon-shackleton',
  'earth-dry-valleys::mars-gale',
  'earth-iceland::moon-mare-tranq',
  'earth-iceland::moon-aristarchus',
  'earth-lonar::mars-jezero',
  'earth-spiti::mars-valles',
  'earth-death-valley::mars-valles',
  'earth-rann-kutch::mars-gale',
]);

export function buildSimilarityMatrix(
  sites: AnalogSite[],
  datasets: DatasetRecord[],
  weights: SimilarityWeights
): SimilarityMatrixResponse {
  const earthSites = sites.filter((s) => s.body === 'Earth');
  const targetSites = sites.filter((s) => s.body !== 'Earth');
  const processedRealDatasets = datasets.filter(
    (d) => d.processingStatus === 'Processed' && !d.id.startsWith('ds-calib-')
  );

  const rows: SimilarityMatrixRow[] = [];

  for (const earth of earthSites) {
    const earthProv = matchSiteProvenance(earth, processedRealDatasets);
    for (const target of targetSites) {
      const targetProv = matchSiteProvenance(target, processedRealDatasets);
      const evalResult = evaluateSimilarity(earth, target, weights);

      const findFeature = (prefix: string) =>
        evalResult.featureContributions.find((c) => c.feature.startsWith(prefix));

      const slopeFc = findFeature('Mean Surface Slope');
      const triFc = findFeature('Terrain Ruggedness');
      const reliefFc = findFeature('Relative Topographic Relief');
      const thermalFc = findFeature('Thermal Envelope');
      const waterFc = findFeature('Water / Ice');
      const geoFc = findFeature('Geology & Mineralogy');

      // Environmental Similarity combines available Thermal Envelope and Water/Ice indicators
      const envComponents: number[] = [];
      if (thermalFc?.available) envComponents.push(thermalFc.contributionScore);
      if (waterFc?.available) envComponents.push(waterFc.contributionScore);
      const environmentalSim =
        envComponents.length > 0
          ? Math.round((envComponents.reduce((a, b) => a + b, 0) / envComponents.length) * 10) / 10
          : null;

      const pairId = `${earth.id}::${target.id}`;
      const bothDem =
        earthProv.dataCategory === 'Measured / Processed DEM' &&
        targetProv.dataCategory === 'Measured / Processed DEM';
      const partialDem =
        earthProv.dataCategory === 'Measured / Processed DEM' ||
        targetProv.dataCategory === 'Measured / Processed DEM' ||
        earthProv.dataCategory === 'Uploaded Local Dataset' ||
        targetProv.dataCategory === 'Uploaded Local Dataset';

      const isCuratedDemo = CURATED_DEMONSTRATION_PAIRS.has(pairId);

      let analysisStatus: SimilarityAnalysisStatus;
      if (bothDem) {
        analysisStatus = 'DEM-Grounded (Measured)';
      } else if (isCuratedDemo) {
        analysisStatus = 'DEMONSTRATION / SIMULATED';
      } else if (partialDem) {
        analysisStatus = 'Partial DEM + Baseline';
      } else {
        analysisStatus = 'Simulated Baseline';
      }

      const dataQualityLabel: SimilarityMatrixRow['dataQualityLabel'] =
        evalResult.confidencePct >= 90
          ? 'High'
          : evalResult.confidencePct >= 80
            ? 'Good'
            : evalResult.confidencePct >= 65
              ? 'Moderate'
              : 'Partial';

      rows.push({
        pairId,
        earthSiteId: earth.id,
        earthSiteName: earth.name,
        earthShortName: earth.name.split('(')[0].trim(),
        earthStatus: earth.status,
        earthCategory: earth.category,
        targetId: target.id,
        targetBody: target.body,
        targetName: target.name,
        targetShortName: target.name.split('(')[0].trim(),
        targetCategory: target.category,
        meanSlopeSim: slopeFc?.available ? slopeFc.contributionScore : null,
        triSim: triFc?.available ? triFc.contributionScore : null,
        elevationSim: reliefFc?.available ? reliefFc.contributionScore : null,
        geomorphologicalSim: geoFc?.available ? geoFc.contributionScore : 0,
        environmentalSim,
        overallSimilarityPct: evalResult.overallScore,
        confidencePct: evalResult.confidencePct,
        dataQualityLabel,
        missingCount: evalResult.missingVariables.length,
        missingVariables: evalResult.missingVariables,
        analysisStatus,
        isDemonstration: analysisStatus === 'DEMONSTRATION / SIMULATED' || analysisStatus === 'Simulated Baseline',
        earthValueSlope: slopeFc?.earthValue ?? 'Unavailable',
        targetValueSlope: slopeFc?.targetValue ?? 'Unavailable',
        earthValueTri: triFc?.earthValue ?? 'Unavailable',
        targetValueTri: triFc?.targetValue ?? 'Unavailable',
        earthValueRelief: reliefFc?.earthValue ?? 'Unavailable',
        targetValueRelief: reliefFc?.targetValue ?? 'Unavailable',
        earthProvenance: earthProv.processingStatus,
        targetProvenance: targetProv.processingStatus,
        explanation: evalResult.explanation,
      });
    }
  }

  // Sort Demonstration flagship pairs first by default, then highest overall similarity
  rows.sort((a, b) => {
    if (a.analysisStatus === 'DEMONSTRATION / SIMULATED' && b.analysisStatus !== 'DEMONSTRATION / SIMULATED') {
      return -1;
    }
    if (b.analysisStatus === 'DEMONSTRATION / SIMULATED' && a.analysisStatus !== 'DEMONSTRATION / SIMULATED') {
      return 1;
    }
    return b.overallSimilarityPct - a.overallSimilarityPct;
  });

  return {
    rows,
    weights,
    totalPairs: rows.length,
    demonstrationCount: rows.filter((r) => r.analysisStatus === 'DEMONSTRATION / SIMULATED').length,
    demGroundedCount: rows.filter((r) => r.analysisStatus === 'DEM-Grounded (Measured)').length,
    datumNote:
      'Elevation Similarity compares datum-independent Relative Topographic Relief spans (never raw EGM96 vs. LOLA/MOLA zero-datums).',
    simulationNotice:
      'Rows labelled DEMONSTRATION / SIMULATED or Simulated Baseline compute multi-factor scores across published literature parameters and partial Earth DEMs pending co-registered Moon/Mars orbital DEM uploads.',
    generatedAt: new Date().toISOString(),
  };
}
