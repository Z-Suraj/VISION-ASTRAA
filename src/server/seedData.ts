import type { AnalogSite, DatasetRecord, TerrainGridStats } from '../types/astraa.ts';

function buildBenchmarkStats(
  seedOffset: number,
  baseElev: number,
  reliefScale: number,
  craterMode: boolean
): TerrainGridStats {
  const size = 40;
  const grid: number[][] = [];
  const allVals: number[] = [];

  for (let r = 0; r < size; r++) {
    const row: number[] = [];
    const ny = (r / (size - 1)) * 2 - 1;
    for (let c = 0; c < size; c++) {
      const nx = (c / (size - 1)) * 2 - 1;
      const dist = Math.sqrt(nx * nx + ny * ny);
      let h = 0;
      if (craterMode) {
        // Synthetic crater bowl + raised rim + terraced wall for calibration benchmarking
        const rim = Math.exp(-Math.pow((dist - 0.56) * 5.2, 2)) * 0.42;
        const bowl = dist < 0.56 ? -0.58 * (1 - Math.pow(dist / 0.56, 2.2)) : 0.08 * Math.exp(-(dist - 0.56) * 2.5);
        const ridge = 0.09 * Math.sin(nx * 6.5 + seedOffset) * Math.cos(ny * 5.1);
        h = (0.55 + rim + bowl + ridge) * reliefScale + baseElev;
      } else {
        // Synthetic fluvial-glacial valley + ridge benchmark
        const valley = Math.abs(ny + 0.18 * Math.sin(nx * 2.8)) * 0.72;
        const ridges = 0.16 * Math.sin(nx * 5.2 + seedOffset) * Math.cos(ny * 4.7) + 0.09 * Math.cos((nx - ny) * 8.1);
        h = (valley + ridges + 0.15) * reliefScale + baseElev;
      }
      const val = Math.round(h * 10) / 10;
      row.push(val);
      allVals.push(val);
    }
    grid.push(row);
  }

  return computeStatsFromMatrix(grid, 90);
}

export function computeStatsFromMatrix(grid: number[][], cellSizeM = 90): TerrainGridStats {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const flat: number[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = grid[r][c];
      if (Number.isFinite(v)) flat.push(v);
    }
  }
  if (flat.length === 0) {
    return {
      rows: 0,
      cols: 0,
      elevationMinM: 0,
      elevationMaxM: 0,
      elevationMeanM: 0,
      elevationStdM: 0,
      reliefM: 0,
      meanSlopeDeg: 0,
      maxSlopeDeg: 0,
      triMeanM: 0,
      hypsometricIntegral: 0,
      elevationHistogram: [],
      slopeDistribution: [],
      hypsometricCurve: [],
      previewGrid: [],
      slopeGrid: [],
    };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const v of flat) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / flat.length;
  let sqDiff = 0;
  for (const v of flat) {
    sqDiff += (v - mean) * (v - mean);
  }
  const std = Math.sqrt(sqDiff / flat.length);
  const relief = max - min;
  const hypsometricIntegral = relief > 0 ? (mean - min) / relief : 0.5;

  // Horn 3x3 slope & Riley TRI
  const slopeGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  const slopes: number[] = [];
  const tris: number[] = [];

  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      const z1 = grid[r - 1][c - 1];
      const z2 = grid[r - 1][c];
      const z3 = grid[r - 1][c + 1];
      const z4 = grid[r][c - 1];
      const z5 = grid[r][c];
      const z6 = grid[r][c + 1];
      const z7 = grid[r + 1][c - 1];
      const z8 = grid[r + 1][c];
      const z9 = grid[r + 1][c + 1];
      if (
        ![z1, z2, z3, z4, z5, z6, z7, z8, z9].every((val) => Number.isFinite(val))
      ) {
        continue;
      }
      const dzdx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) / (8 * cellSizeM);
      const dzdy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) / (8 * cellSizeM);
      const slopeDeg = (Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy)) * 180) / Math.PI;
      slopeGrid[r][c] = Math.round(slopeDeg * 100) / 100;
      slopes.push(slopeDeg);

      const neighbors = [z1, z2, z3, z4, z6, z7, z8, z9];
      let triSq = 0;
      for (const n of neighbors) {
        triSq += (n - z5) * (n - z5);
      }
      tris.push(Math.sqrt(triSq / 8));
    }
  }

  const meanSlopeDeg = slopes.length > 0 ? slopes.reduce((a, b) => a + b, 0) / slopes.length : 0;
  const maxSlopeDeg = slopes.length > 0 ? Math.max(...slopes) : 0;
  const triMeanM = tris.length > 0 ? tris.reduce((a, b) => a + b, 0) / tris.length : 0;

  // Elevation histogram (10 bins)
  const binCount = 10;
  const binWidth = relief > 0 ? relief / binCount : 1;
  const elevationHistogram = Array.from({ length: binCount }, (_, idx) => {
    const bMin = min + idx * binWidth;
    const bMax = idx === binCount - 1 ? max : min + (idx + 1) * binWidth;
    return {
      label: `${Math.round(bMin)}–${Math.round(bMax)} m`,
      min: Math.round(bMin * 10) / 10,
      max: Math.round(bMax * 10) / 10,
      count: 0,
      pct: 0,
    };
  });
  for (const v of flat) {
    const idx = relief > 0 ? Math.min(binCount - 1, Math.floor((v - min) / binWidth)) : 0;
    elevationHistogram[idx].count += 1;
  }
  for (const bin of elevationHistogram) {
    bin.pct = Math.round((bin.count / flat.length) * 1000) / 10;
  }

  // Slope distribution (8 bins)
  const slopeBounds = [0, 2, 5, 10, 15, 25, 35, 45, 90];
  const slopeDistribution = slopeBounds.slice(0, -1).map((bMin, idx) => ({
    label: `${bMin}–${slopeBounds[idx + 1]}°`,
    min: bMin,
    max: slopeBounds[idx + 1],
    count: 0,
    pct: 0,
  }));
  for (const s of slopes) {
    const idx = slopeDistribution.findIndex((b) => s >= b.min && s <= b.max);
    if (idx >= 0) slopeDistribution[idx].count += 1;
  }
  for (const bin of slopeDistribution) {
    bin.pct = slopes.length > 0 ? Math.round((bin.count / slopes.length) * 1000) / 10 : 0;
  }

  // Hypsometric curve (11 points)
  const sorted = [...flat].sort((a, b) => b - a);
  const hypsometricCurve = Array.from({ length: 11 }, (_, i) => {
    const frac = i / 10;
    const idx = Math.min(sorted.length - 1, Math.floor(frac * (sorted.length - 1)));
    const elev = sorted[idx];
    return {
      relativeAreaPct: Math.round(frac * 100),
      relativeElevationPct: relief > 0 ? Math.round(((elev - min) / relief) * 1000) / 10 : 50,
      elevationM: Math.round(elev * 10) / 10,
    };
  });

  // Downsample preview grids to max 40x40
  const maxDim = 40;
  const rStep = Math.max(1, Math.floor(rows / maxDim));
  const cStep = Math.max(1, Math.floor(cols / maxDim));
  const previewGrid: number[][] = [];
  const previewSlope: number[][] = [];
  for (let r = 0; r < rows; r += rStep) {
    const pRow: number[] = [];
    const sRow: number[] = [];
    for (let c = 0; c < cols; c += cStep) {
      pRow.push(Math.round(grid[r][c] * 10) / 10);
      sRow.push(slopeGrid[r]?.[c] ?? 0);
    }
    previewGrid.push(pRow);
    previewSlope.push(sRow);
  }

  return {
    rows,
    cols,
    elevationMinM: Math.round(min * 10) / 10,
    elevationMaxM: Math.round(max * 10) / 10,
    elevationMeanM: Math.round(mean * 10) / 10,
    elevationStdM: Math.round(std * 10) / 10,
    reliefM: Math.round(relief * 10) / 10,
    meanSlopeDeg: Math.round(meanSlopeDeg * 100) / 100,
    maxSlopeDeg: Math.round(maxSlopeDeg * 100) / 100,
    triMeanM: Math.round(triMeanM * 100) / 100,
    hypsometricIntegral: Math.round(hypsometricIntegral * 1000) / 1000,
    elevationHistogram,
    slopeDistribution,
    hypsometricCurve,
    previewGrid,
    slopeGrid: previewSlope,
  };
}

export const INITIAL_ANALOG_SITES: AnalogSite[] = [
  // ESTABLISHED EARTH ANALOGUES
  {
    id: 'earth-atacama',
    name: 'Atacama Desert (Yungay Sector)',
    region: 'Antofagasta Region',
    countryOrSector: 'Chile',
    body: 'Earth',
    latitude: -24.083,
    longitude: -69.917,
    category: 'Desert',
    status: 'Established Reference',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA Ames / Navarro-Gonzalez et al. (Science); USGS Planetary Analogs',
    elevationMinM: 940,
    elevationMaxM: 1680,
    elevationMeanM: 1185,
    reliefM: 740,
    meanSlopeDeg: 6.4,
    maxSlopeDeg: 28.5,
    triMeanM: 9.8,
    surfaceMaterial: 'Hyper-arid nitrate/perchlorate-bearing regolith, alluvial gravels, evaporite crusts',
    geologySummary: 'Ancient hyper-arid desert pavement with sulfate and perchlorate salts, minimal organic carbon, and UV-oxidized surface soils.',
    waterIceIndicator: 'Hyper-arid (<2 mm/yr precip); hygroscopic deliquescent salt traces',
    waterIceScore: 0.18,
    mineralogyClass: 'Sulfates / Chlorides / Nitrates / Fe-Oxides',
    tempMinC: -2,
    tempMaxC: 36,
    resourceIndicators: 'Nitrate-sulfate crusts, trace hygroscopic brines',
    recommendedTargetId: 'mars-gale',
    dataCompletenessPct: 100,
    limitations: {
      gravityRatio: '1.00 g vs. Mars 0.38 g / Moon 0.165 g',
      atmosphereNote: 'Sea-level-like ~890 hPa O₂/N₂ vs. Mars ~6 hPa CO₂',
      radiationNote: 'High UV insolation (~3000+ hrs/yr), yet shielded from GCR/SPE by magnetosphere',
      weatheringCaveat: 'Rare El Niño rain events still permit sporadic microbial & fluvial remodeling',
    },
    imageUrl: '/assets/landscapes/atacama_hyperarid_basin.webp',
    imageAttribution: 'Atacama Hyper-Arid Salt Crust Visual (Metrics: NASA Ames / USGS)',
  },
  {
    id: 'earth-haughton',
    name: 'Haughton Impact Structure',
    region: 'Devon Island, Nunavut',
    countryOrSector: 'Canada',
    body: 'Earth',
    latitude: 75.383,
    longitude: -89.65,
    category: 'Impact Crater',
    status: 'Established Reference',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA Haughton-Mars Project (HMP); Lee & Osinski (Meteoritics & Planetary Science)',
    elevationMinM: 95,
    elevationMaxM: 410,
    elevationMeanM: 228,
    reliefM: 315,
    meanSlopeDeg: 9.2,
    maxSlopeDeg: 34.1,
    triMeanM: 14.5,
    surfaceMaterial: 'Polymict impact breccia, fractured Ordovician carbonates, ice-cemented permafrost',
    geologySummary: '23-km Miocene impact crater in polar desert hosting impact melt breccias, hydrothermal alteration pipes, and patterned ground.',
    waterIceIndicator: 'Continuous subsurface permafrost & ground ice lenses',
    waterIceScore: 0.78,
    mineralogyClass: 'Carbonates / Impact Breccia / Permafrost Ice',
    tempMinC: -42,
    tempMaxC: 11,
    resourceIndicators: 'Subsurface ground ice, impact-fractured bedrock for drilling tests',
    recommendedTargetId: 'moon-shackleton',
    dataCompletenessPct: 100,
    limitations: {
      gravityRatio: '1.00 g vs. Moon 0.165 g / Mars 0.38 g',
      atmosphereNote: 'Polar maritime/continental troposphere (~1010 hPa) vs. vacuum/thin CO₂',
      radiationNote: 'Polar summer 24h daylight useful for solar operations testing; shielded from cosmic rays',
      weatheringCaveat: 'Active summer meltwater erosion and carbonate dissolution unlike anhydrous lunar craters',
    },
    imageUrl: '/assets/geological/impact_crater_basalt.webp',
    imageAttribution: 'Terrestrial Impact Crater Morphology Visual (Metrics: NASA HMP)',
  },
  {
    id: 'earth-death-valley',
    name: 'Death Valley (Badwater & Ubehebe)',
    region: 'Mojave / Great Basin',
    countryOrSector: 'USA',
    body: 'Earth',
    latitude: 36.242,
    longitude: -116.825,
    category: 'Evaporite Basin',
    status: 'Established Reference',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA JPL Mars Rover Field Tests; USGS Mojave-Mars Analog Studies',
    elevationMinM: -86,
    elevationMaxM: 1660,
    elevationMeanM: 390,
    reliefM: 1746,
    meanSlopeDeg: 11.4,
    maxSlopeDeg: 41.2,
    triMeanM: 21.3,
    surfaceMaterial: 'Halite/gypsum evaporite pans, basaltic maar tephra (Ubehebe), coarse alluvial fans',
    geologySummary: 'Steep fault-bounded basin featuring expansive evaporite salt flats adjacent to basaltic hydrovolcanic craters and debris-flow fans.',
    waterIceIndicator: 'Playa seasonal brines; extreme evaporation gradient',
    waterIceScore: 0.24,
    mineralogyClass: 'Evaporites (Halite/Gypsum) / Basalt Tephra',
    tempMinC: 0,
    tempMaxC: 51,
    resourceIndicators: 'Hydrous sulfate evaporites, basaltic regolith simulant beds',
    recommendedTargetId: 'mars-jezero',
    dataCompletenessPct: 100,
    limitations: {
      gravityRatio: '1.00 g vs. Mars 0.38 g',
      atmosphereNote: 'Dense ~1020 hPa desert air vs. Mars 6 hPa CO₂',
      radiationNote: 'Terrestrial ozone/magnetospheric shielding',
      weatheringCaveat: 'High summer temperatures exceed typical Martian equatorial daytime maxima',
    },
    imageUrl: '/assets/landscapes/atacama_hyperarid_basin.webp',
    imageAttribution: 'Hyper-Arid Evaporite Pan Visual (Metrics: NASA JPL / USGS Mojave)',
  },

  // CANDIDATE TERRESTRIAL ANALOGUE REGIONS
  {
    id: 'earth-ladakh',
    name: 'Ladakh (Leh–Nubra Cold Desert)',
    region: 'Trans-Himalayan Plateau (N34° E077°)',
    countryOrSector: 'India',
    body: 'Earth',
    latitude: 34.1526,
    longitude: 77.5771,
    category: 'High-Altitude Arid',
    status: 'Candidate Region',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA Spaceward Bound India (2016); ISRO/BSIP Ladakh Astrobiology Surveys',
    elevationMinM: 3150,
    elevationMaxM: 5620,
    elevationMeanM: 4180,
    reliefM: 2470,
    meanSlopeDeg: 18.6,
    maxSlopeDeg: 52.4,
    triMeanM: 36.2,
    surfaceMaterial: 'Granitic-metamorphic talus, glacial-fluvial gravel fans, borax/soda hot-spring deposits',
    geologySummary: 'High-altitude cold arid rain-shadow basin with strong freeze-thaw weathering, permafrost patches, saline lakes (Tso Kar), and alluvial fan networks.',
    waterIceIndicator: 'High-altitude permafrost, glacial meltwater channels, saline paleolake terraces',
    waterIceScore: 0.64,
    mineralogyClass: 'Silicates / Borates / Carbonates / Glacial Till',
    tempMinC: -28,
    tempMaxC: 24,
    resourceIndicators: 'High-elevation UV flux, permafrost pockets, paleolake evaporites (detailed SRTM N34E077 awaiting upload)',
    recommendedTargetId: 'mars-jezero',
    dataCompletenessPct: 92,
    limitations: {
      gravityRatio: '1.00 g vs. Mars 0.38 g',
      atmosphereNote: 'Reduced pressure (~650 hPa at 3500–4500 m), still ~100× denser than Mars surface',
      radiationNote: 'Elevated solar UV compared to sea level, but protected from GCR flux',
      weatheringCaveat: 'Active alpine snowmelt and tectonic uplift rates far exceed Noachian/Hesperian Mars',
    },
    imageUrl: '/assets/earth/ladakh_valley.webp',
    imageAttribution: 'Ladakh High-Altitude Cold Desert Visual (N34° E077° Candidate)',
  },
  {
    id: 'earth-spiti',
    name: 'Spiti Valley Cold Desert',
    region: 'Himachal Pradesh Himalayas',
    countryOrSector: 'India',
    body: 'Earth',
    latitude: 32.246,
    longitude: 78.034,
    category: 'Canyon / Valley',
    status: 'Candidate Region',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'Wadia Institute / ISRO Planetary Analog Reconnaissance Literature',
    elevationMinM: 3350,
    elevationMaxM: 5480,
    elevationMeanM: 4290,
    reliefM: 2130,
    meanSlopeDeg: 21.3,
    maxSlopeDeg: 56.8,
    triMeanM: 42.1,
    surfaceMaterial: 'Tethyan sedimentary shales/limestones, incised canyon walls, scree slopes',
    geologySummary: 'Deeply incised cold-desert sedimentary canyon system exposing stratified bedding and permafrost-affected scree aprons.',
    waterIceIndicator: 'Seasonal snowpack, rock glaciers, high-elevation ground ice',
    waterIceScore: 0.58,
    mineralogyClass: 'Layered Sedimentary Carbonates & Shales',
    tempMinC: -26,
    tempMaxC: 22,
    resourceIndicators: 'Layered sedimentary outcrops analogous to orbital stratigraphy testing',
    recommendedTargetId: 'mars-valles',
    dataCompletenessPct: 86,
    limitations: {
      gravityRatio: '1.00 g vs. Mars 0.38 g',
      atmosphereNote: 'High-altitude ~600 hPa air vs. Mars ~6 hPa CO₂',
      radiationNote: 'Moderate UV elevation enhancement; terrestrial magnetic shielding',
      weatheringCaveat: 'Fluvial river incision active today unlike relict Martian canyons',
    },
    imageUrl: '/assets/earth/ladakh_valley.webp',
    imageAttribution: 'Trans-Himalayan Incised Canyon Visual (Metrics: Wadia / ISRO)',
  },
  {
    id: 'earth-rann-kutch',
    name: 'Rann of Kutch (Matanomadh / Salt Marsh)',
    region: 'Gujarat',
    countryOrSector: 'India',
    body: 'Earth',
    latitude: 23.545,
    longitude: 68.948,
    category: 'Evaporite Basin',
    status: 'Candidate Region',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'Mitra et al. (JGR Planets) — Matanomadh Jarosite-Phyllosilicate Mars Analog',
    elevationMinM: 0,
    elevationMaxM: 185,
    elevationMeanM: 14,
    reliefM: 185,
    meanSlopeDeg: 1.8,
    maxSlopeDeg: 14.2,
    triMeanM: 2.4,
    surfaceMaterial: 'Jarosite, alunite, phyllosilicates (kaolinite/montmorillonite) over Deccan basalt',
    geologySummary: 'Low-relief evaporitic salt flat adjacent to Matanomadh hydrothermally altered basalts containing jarosite and hydrated sulfates.',
    waterIceIndicator: 'Seasonal monsoonal inundation -> hyper-saline desiccation crust',
    waterIceScore: 0.31,
    mineralogyClass: 'Jarosite / Sulfates / Phyllosilicates / Altered Basalt',
    tempMinC: 10,
    tempMaxC: 45,
    resourceIndicators: 'Hydrous sulfate/jarosite mineralogical benchmark for Mars spectral calibration',
    recommendedTargetId: 'mars-gale',
    dataCompletenessPct: 88,
    limitations: {
      gravityRatio: '1.00 g vs. Mars 0.38 g',
      atmosphereNote: 'Sea-level coastal humid-arid monsoon regime',
      radiationNote: 'Standard low-elevation terrestrial shielding',
      weatheringCaveat: 'Annual monsoon flooding produces biological activity absent on modern Mars',
    },
    imageUrl: '/assets/landscapes/atacama_hyperarid_basin.webp',
    imageAttribution: 'Evaporite Salt Basin Visual (Metrics: Mitra et al. JGR Planets)',
  },
  {
    id: 'earth-lonar',
    name: 'Lonar Impact Crater',
    region: 'Buldhana District, Maharashtra',
    countryOrSector: 'India',
    body: 'Earth',
    latitude: 19.9758,
    longitude: 76.5069,
    category: 'Impact Crater',
    status: 'Candidate Region',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'Fredriksson et al.; Maloof et al. — Rare terrestrial crater excavated in flood basalt',
    elevationMinM: 468,
    elevationMaxM: 615,
    elevationMeanM: 540,
    reliefM: 147,
    meanSlopeDeg: 14.8,
    maxSlopeDeg: 38.4,
    triMeanM: 16.9,
    surfaceMaterial: 'Deccan Trap tholeiitic flood basalt, shock-metamorphosed maskelynite, ejecta blanket',
    geologySummary: '1.88-km near-circular Pleistocene impact crater excavated wholly into tholeiitic basalt flows, mirroring small lunar mare and Martian basaltic craters.',
    waterIceIndicator: 'Alkaline crater lake (saline/soda); non-icy tropical climate',
    waterIceScore: 0.22,
    mineralogyClass: 'Tholeiitic Basalt / Shocked Plagioclase / Impact Melt',
    tempMinC: 14,
    tempMaxC: 42,
    resourceIndicators: 'Basaltic ejecta & crater wall morphometry benchmark',
    recommendedTargetId: 'moon-mare-tranq',
    dataCompletenessPct: 90,
    limitations: {
      gravityRatio: '1.00 g vs. Moon 0.165 g / Mars 0.38 g (crater rim-to-depth scaling differs)',
      atmosphereNote: 'Tropical continental atmosphere (~950 hPa)',
      radiationNote: 'Terrestrial shielding',
      weatheringCaveat: 'Crater floor hosts a vegetated/alkaline lake due to tropical rainfall',
    },
    imageUrl: '/assets/geological/impact_crater_basalt.webp',
    imageAttribution: 'Basalt Impact Crater Visual (Metrics: Deccan Flood Basalt Survey)',
  },
  {
    id: 'earth-dry-valleys',
    name: 'McMurdo Dry Valleys (Beacon Valley)',
    region: 'Victoria Land',
    countryOrSector: 'Antarctica',
    body: 'Earth',
    latitude: -77.83,
    longitude: 160.65,
    category: 'Polar',
    status: 'Candidate Region',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA Antarctic Polar Analog Studies; Marchant & Head (Icarus)',
    elevationMinM: 120,
    elevationMaxM: 2150,
    elevationMeanM: 1120,
    reliefM: 2030,
    meanSlopeDeg: 15.2,
    maxSlopeDeg: 47.0,
    triMeanM: 28.4,
    surfaceMaterial: 'Sublimation polygons over buried Miocene glacier ice, dolerite/sandstone regolith',
    geologySummary: 'Hyper-arid polar desert with katabatic winds, sublimation-driven polygonal ground, and ancient ice preserved beneath thin lithic lag.',
    waterIceIndicator: 'Massive buried sublimation-protected ice beneath dry overburden',
    waterIceScore: 0.92,
    mineralogyClass: 'Dolerite / Quartz Sandstone / Subsurface Glacial Ice',
    tempMinC: -52,
    tempMaxC: -2,
    resourceIndicators: 'Cryogenic ice-overburden stability & rover thermal survival testing',
    recommendedTargetId: 'moon-shackleton',
    dataCompletenessPct: 96,
    limitations: {
      gravityRatio: '1.00 g vs. Moon 0.165 g / Mars 0.38 g',
      atmosphereNote: 'Cold ~860 hPa katabatic air (convective cooling still present unlike lunar vacuum)',
      radiationNote: 'Extreme seasonal solar angle replicates polar illumination, without lunar micrometeorites',
      weatheringCaveat: 'Sublimation rates regulated by terrestrial atmospheric pressure',
    },
    imageUrl: '/assets/landscapes/antarctic_dry_valleys.webp',
    imageAttribution: 'Antarctic Dry Valleys Sublimation Polygons Visual (Metrics: NASA Polar Studies)',
  },
  {
    id: 'earth-iceland',
    name: 'Krafla & Askja Volcanic Highlands',
    region: 'Northeast Volcanic Zone',
    countryOrSector: 'Iceland',
    body: 'Earth',
    latitude: 65.047,
    longitude: -16.75,
    category: 'Volcanic',
    status: 'Candidate Region',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA SAND-E / ESA PANGAEA / Apollo Astronaut Basalt Field Training',
    elevationMinM: 420,
    elevationMaxM: 1380,
    elevationMeanM: 760,
    reliefM: 960,
    meanSlopeDeg: 12.1,
    maxSlopeDeg: 39.5,
    triMeanM: 22.8,
    surfaceMaterial: 'Unweathered basaltic tephra, vesicular lava flows, hyaloclastite ridges, lava tubes',
    geologySummary: 'Sub-arctic basaltic sandar and caldera fields with intact lava tubes and glacio-volcanic palagonite ridges.',
    waterIceIndicator: 'Sub-arctic glacial meltwater & seasonal ice caves in lava tubes',
    waterIceScore: 0.54,
    mineralogyClass: 'Olivine Basalt / Palagonite / Volcanic Glass',
    tempMinC: -18,
    tempMaxC: 16,
    resourceIndicators: 'Fresh basaltic regolith simulant, lava tube shelter analog testing',
    recommendedTargetId: 'moon-aristarchus',
    dataCompletenessPct: 94,
    limitations: {
      gravityRatio: '1.00 g vs. Moon 0.165 g / Mars 0.38 g',
      atmosphereNote: 'Sub-arctic maritime weather (~1000 hPa) with precipitation',
      radiationNote: 'High-latitude auroral exposure, full magnetospheric protection',
      weatheringCaveat: 'Rapid aqueous alteration and moss colonization in lowland zones',
    },
    imageUrl: '/assets/geological/volcanic_iceland_basalt.webp',
    imageAttribution: 'Iceland Basaltic Highlands Field Visual (Metrics: NASA SAND-E / ESA PANGAEA)',
  },

  // PLANETARY TARGETS — MARS & MOON
  {
    id: 'mars-jezero',
    name: 'Jezero Crater (Western Fan Delta)',
    region: 'Isidis Planitia Rim',
    countryOrSector: 'Mars · 18.38° N, 77.58° E',
    body: 'Mars',
    latitude: 18.38,
    longitude: 77.58,
    category: 'Impact Crater',
    status: 'Planetary Target',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA MRO/HiRISE, CRISM & Mars 2020 Perseverance Landing Site Characterization',
    elevationMinM: -2750,
    elevationMaxM: -1920,
    elevationMeanM: -2460,
    reliefM: 830,
    meanSlopeDeg: 8.9,
    maxSlopeDeg: 33.6,
    triMeanM: 15.2,
    surfaceMaterial: 'Olivine-carbonate-bearing lacustrine mudstones, basaltic sand dunes, deltaic conglomerates',
    geologySummary: '45-km Noachian impact crater preserving an ancient river-delta complex, Mg-rich carbonates, and phyllosilicates.',
    waterIceIndicator: 'Paleolake hydrated clays/carbonates; trace atmospheric frost',
    waterIceScore: 0.42,
    mineralogyClass: 'Olivine / Mg-Carbonates / Fe-Mg Smectites',
    tempMinC: -95,
    tempMaxC: -5,
    resourceIndicators: 'Hydrated phyllosilicates & carbonate mineral targets',
    recommendedTargetId: null,
    dataCompletenessPct: 100,
    limitations: {
      gravityRatio: '0.38 g Martian gravity',
      atmosphereNote: '~6.1 hPa CO₂ thin atmosphere with global dust storms',
      radiationNote: 'High GCR/SPE flux (~200+ mSv/yr); intense UV-C surface sterilization',
      weatheringCaveat: 'Datum referenced to MOLA Mars aeroid (not comparable to Earth sea level)',
    },
    imageUrl: '/assets/mars/mars_jezero_crater.webp',
    imageAttribution: 'Mars Jezero Crater Orbital Delta Visual (Metrics: NASA MRO/MOLA)',
  },
  {
    id: 'mars-valles',
    name: 'Valles Marineris (Melas Chasma)',
    region: 'Equatorial Canyon System',
    countryOrSector: 'Mars · 10.6° S, 70.5° W',
    body: 'Mars',
    latitude: -10.6,
    longitude: -70.5,
    category: 'Canyon / Valley',
    status: 'Planetary Target',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA MOLA / ESA Mars Express HRSC / CRISM Sulfate Stratigraphy',
    elevationMinM: -4800,
    elevationMaxM: 3200,
    elevationMeanM: -1850,
    reliefM: 8000,
    meanSlopeDeg: 22.4,
    maxSlopeDeg: 58.0,
    triMeanM: 48.5,
    surfaceMaterial: 'Layered polyhydrated sulfates, basaltic wallrock scarps, landslide talus aprons',
    geologySummary: 'Tectonic rift canyon exposing kilometers of layered volcanic/sedimentary strata and interior layered deposits.',
    waterIceIndicator: 'Hydrated sulfate beds & equatorial subsurface hydrogen anomalies (FREND)',
    waterIceScore: 0.46,
    mineralogyClass: 'Polyhydrated Sulfates / Layered Basalt',
    tempMinC: -88,
    tempMaxC: 4,
    resourceIndicators: 'Deep canyon atmospheric pressure boost (~10–12 hPa) & hydrated sulfates',
    recommendedTargetId: null,
    dataCompletenessPct: 95,
    limitations: {
      gravityRatio: '0.38 g Martian gravity',
      atmosphereNote: 'Slightly elevated canyon floor pressure (~10–12 hPa CO₂)',
      radiationNote: 'High unshielded cosmic radiation; partial horizon shielding along canyon walls',
      weatheringCaveat: '8-km canyon relief scale far exceeds terrestrial subaerial canyons',
    },
    imageUrl: '/assets/mars/mars_valles_canyon.webp',
    imageAttribution: 'Mars Valles Marineris Layered Canyon Visual (Metrics: NASA MOLA/HRSC)',
  },
  {
    id: 'mars-gale',
    name: 'Gale Crater (Aeolis Mons / Mount Sharp)',
    region: 'Aeolis Quadrangle',
    countryOrSector: 'Mars · 5.4° S, 137.8° E',
    body: 'Mars',
    latitude: -5.4,
    longitude: 137.8,
    category: 'Evaporite Basin',
    status: 'Planetary Target',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA MSL Curiosity / MOLA / HiRISE Datasets',
    elevationMinM: -4520,
    elevationMaxM: 820,
    elevationMeanM: -3100,
    reliefM: 5340,
    meanSlopeDeg: 10.6,
    maxSlopeDeg: 36.4,
    triMeanM: 18.7,
    surfaceMaterial: 'Sulfate-bearing sandstones, clay-rich mudstones, basaltic aeolian ripples',
    geologySummary: '154-km crater featuring a 5.5-km central sedimentary mound recording Mars transition from clay-forming lacustrine to sulfate-evaporite aridity.',
    waterIceIndicator: 'Hydrated calcium/magnesium sulfates, perchlorate brines (transient)',
    waterIceScore: 0.35,
    mineralogyClass: 'Sulfates / Phyllosilicates / Basaltic Sand',
    tempMinC: -92,
    tempMaxC: 2,
    resourceIndicators: 'Evaporite-to-clay stratigraphic transitions',
    recommendedTargetId: null,
    dataCompletenessPct: 100,
    limitations: {
      gravityRatio: '0.38 g Martian gravity',
      atmosphereNote: '~7–9 hPa CO₂ surface pressure',
      radiationNote: 'MSL RAD measured ~0.67 mSv/day surface GCR dose',
      weatheringCaveat: 'Aeolian deflation over billions of years without liquid surface water',
    },
    imageUrl: '/assets/mars/mars_valles_canyon.webp',
    imageAttribution: 'Mars Gale Crater Layered Strata Visual (Metrics: NASA MSL/MOLA)',
  },
  {
    id: 'moon-shackleton',
    name: 'Shackleton Crater Rim (Lunar South Pole)',
    region: 'South Pole–Aitken Margin',
    countryOrSector: 'Moon · 89.67° S, 129.78° E',
    body: 'Moon',
    latitude: -89.67,
    longitude: 129.78,
    category: 'Polar',
    status: 'Planetary Target',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA LRO LOLA / LROC NAC Artemis III Candidate Region Literature',
    elevationMinM: -2850,
    elevationMaxM: 1380,
    elevationMeanM: -410,
    reliefM: 4230,
    meanSlopeDeg: 16.4,
    maxSlopeDeg: 34.5,
    triMeanM: 29.1,
    surfaceMaterial: 'Anorthositic highland regolith, impact ejecta blocks, cryogenic volatile-bearing PSR floor',
    geologySummary: '21-km polar impact crater with near-continuous solar illumination along ridge crests bordering permanently shadowed cold traps (~40 K).',
    waterIceIndicator: 'Confirmed surface/subsurface water-ice signatures in adjacent PSRs (LRO/M3/LCROSS)',
    waterIceScore: 0.89,
    mineralogyClass: 'Anorthosite / Highland Regolith / Cryogenic Ice',
    tempMinC: -233,
    tempMaxC: -50,
    resourceIndicators: 'Polar water-ice ISRU potential + peak-of-eternal-light solar ridges',
    recommendedTargetId: null,
    dataCompletenessPct: 100,
    limitations: {
      gravityRatio: '0.165 g Lunar gravity',
      atmosphereNote: 'Hard vacuum exosphere (<10⁻¹² hPa)',
      radiationNote: 'Unshielded GCR & solar particle events; electrostatic regolith charging',
      weatheringCaveat: 'Space weathering & micrometeorite gardening only — zero fluvial/aeolian sorting',
    },
    imageUrl: '/assets/moon/lunar_south_pole.webp',
    imageAttribution: 'Lunar South Pole Crater Rim Visual (Metrics: NASA LRO LOLA)',
  },
  {
    id: 'moon-mare-tranq',
    name: 'Mare Tranquillitatis (Basalt & Skylight)',
    region: 'Eastern Nearside Mare',
    countryOrSector: 'Moon · 8.33° N, 33.22° E',
    body: 'Moon',
    latitude: 8.33,
    longitude: 33.22,
    category: 'Impact Crater',
    status: 'Planetary Target',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA LROC / Apollo 11 & Mare Pit Characterization (Wagner & Robinson)',
    elevationMinM: -2050,
    elevationMaxM: -1480,
    elevationMeanM: -1820,
    reliefM: 570,
    meanSlopeDeg: 4.8,
    maxSlopeDeg: 32.0,
    triMeanM: 7.4,
    surfaceMaterial: 'High-Ti mare basalt regolith, agglutinates, sub-surface lava tube pit walls',
    geologySummary: 'Smooth flood-basalt plains punctuated by fresh impact craters and steep-walled collapse pits leading to subsurface lava conduits.',
    waterIceIndicator: 'Anhydrous equatorial regolith (<100 ppm OH/H₂O bound)',
    waterIceScore: 0.08,
    mineralogyClass: 'High-Ti Ilmenite Basalt / Glass Agglutinates',
    tempMinC: -175,
    tempMaxC: 120,
    resourceIndicators: 'Ilmenite (FeTiO₃) oxygen extraction + natural lava tube radiation shelter',
    recommendedTargetId: null,
    dataCompletenessPct: 98,
    limitations: {
      gravityRatio: '0.165 g Lunar gravity',
      atmosphereNote: 'Hard vacuum exosphere',
      radiationNote: 'Extreme 295°C diurnal thermal swing on exposed surface; shielded inside pits',
      weatheringCaveat: 'Zero aqueous alteration; sharp unweathered glass/mineral grains',
    },
    imageUrl: '/assets/geological/impact_crater_basalt.webp',
    imageAttribution: 'Basalt Impact & Skylight Morphology Visual (Metrics: NASA LROC)',
  },
  {
    id: 'moon-aristarchus',
    name: 'Aristarchus Plateau & Vallis Schröteri',
    region: 'Oceanus Procellarum Margin',
    countryOrSector: 'Moon · 23.73° N, 47.49° W',
    body: 'Moon',
    latitude: 23.73,
    longitude: -47.49,
    category: 'Volcanic',
    status: 'Planetary Target',
    provenance: 'Published Reference Baseline (NASA/USGS/ESA Literature)',
    sourceCitation: 'NASA LRO / Chandrayaan-1 M³ Pyroclastic Deposit Mapping',
    elevationMinM: -2600,
    elevationMaxM: 1200,
    elevationMeanM: -420,
    reliefM: 3800,
    meanSlopeDeg: 11.7,
    maxSlopeDeg: 37.2,
    triMeanM: 20.6,
    surfaceMaterial: 'Fe-rich pyroclastic volcanic glass beads, sinuous rille basalts, impact ejecta',
    geologySummary: 'Elevated volcanic crustal block hosting dark pyroclastic mantling deposits and the largest sinuous lunar lava channel.',
    waterIceIndicator: 'Interior pyroclastic OH/H₂O signatures detected by M³ spectroscopy',
    waterIceScore: 0.28,
    mineralogyClass: 'Volcanic Pyroclastic Glass / Low-Ca Pyroxene / Basalt',
    tempMinC: -165,
    tempMaxC: 115,
    resourceIndicators: 'Pyroclastic glass beads for water/metal ISRU & volcanic stratigraphy',
    recommendedTargetId: null,
    dataCompletenessPct: 95,
    limitations: {
      gravityRatio: '0.165 g Lunar gravity',
      atmosphereNote: 'Hard vacuum exosphere',
      radiationNote: 'Unshielded solar & cosmic radiation',
      weatheringCaveat: 'Explosive vacuum pyroclastic dispersal lacks terrestrial atmospheric sorting',
    },
    imageUrl: '/assets/moon/lunar_south_pole.webp',
    imageAttribution: 'Lunar Pyroclastic Volcanic Plateau Visual (Metrics: NASA LRO/M³)',
  },
];

export const INITIAL_DATASETS: DatasetRecord[] = [
  // The 4 user-referenced files — transparently marked as Pending Upload because they were not mounted in container
  {
    id: 'ds-pending-unified-analogs',
    filename: 'VISION_ASTRAA_Unified_Terrestrial_Analogs.csv',
    format: 'CSV',
    fileSizeBytes: 0,
    source: 'User Referenced Dataset (External Attachment)',
    planet: 'Earth',
    region: 'Global Terrestrial Analogs',
    crs: 'Unavailable (awaiting upload)',
    spatialExtent: null,
    resolution: 'Unavailable',
    units: 'Unavailable',
    noDataValue: 'Unavailable',
    missingValueCount: 0,
    totalRecords: 0,
    qualityScore: 0,
    processingStatus: 'Pending Upload (Not Mounted)',
    summaryStats: null,
    previewRows: [],
    columns: [],
    notes: 'Referenced in prompt (@VISION_ASTRAA_Unified_Terrestrial_Analogs.csv) but not mounted in runtime workspace. Upload the CSV in Data Center to parse, validate, and ingest rows into SQLite.',
    createdAt: '2026-11-14T00:00:00Z',
  },
  {
    id: 'ds-pending-srtm-zip',
    filename: 'N34E077.SRTMGL1.hgt(3).zip',
    format: 'ZIP',
    fileSizeBytes: 0,
    source: 'NASA SRTMGL1 v3 (External Attachment)',
    planet: 'Earth',
    region: 'N34°–35°, E077°–078° (Leh / Ladakh)',
    crs: 'Expected WGS84 / EGM96 (awaiting file verification)',
    spatialExtent: { minLat: 34, maxLat: 35, minLon: 77, maxLon: 78 },
    resolution: 'Expected 1 arcsec (~30 m)',
    units: 'Expected meters',
    noDataValue: 'Expected -32768',
    missingValueCount: 0,
    totalRecords: 0,
    qualityScore: 0,
    processingStatus: 'Pending Upload (Not Mounted)',
    summaryStats: null,
    previewRows: [],
    columns: [],
    notes: 'Referenced in prompt (@N34E077.SRTMGL1.hgt(3).zip) but not mounted in runtime workspace. Drop this .zip directly in Data Center to extract .hgt, compute Horn slope, Riley TRI, and 3D terrain mesh.',
    createdAt: '2026-11-14T00:00:00Z',
  },
  {
    id: 'ds-pending-n34e077-csv',
    filename: 'VISION_ASTRAA_N34E077_Elevation_Grid.csv',
    format: 'CSV',
    fileSizeBytes: 0,
    source: 'User Referenced Dataset (External Attachment)',
    planet: 'Earth',
    region: 'N34° E077° Derived Grid',
    crs: 'Unavailable (awaiting upload)',
    spatialExtent: null,
    resolution: 'Unavailable',
    units: 'Unavailable',
    noDataValue: 'Unavailable',
    missingValueCount: 0,
    totalRecords: 0,
    qualityScore: 0,
    processingStatus: 'Pending Upload (Not Mounted)',
    summaryStats: null,
    previewRows: [],
    columns: [],
    notes: 'Referenced in prompt (@VISION_ASTRAA_N34E077_Elevation_Grid.csv) but not mounted in runtime workspace. Upload to validate grid dimensions and render 3D Digital Twin.',
    createdAt: '2026-11-14T00:00:00Z',
  },
  {
    id: 'ds-pending-space-agency-zip',
    filename: 'space_agency_terrestrial_analogs-v2(3).zip',
    format: 'ZIP',
    fileSizeBytes: 0,
    source: 'Multi-Agency Catalog (External Attachment)',
    planet: 'Multi-Planet',
    region: 'Multi-Agency Terrestrial Analogs',
    crs: 'Unavailable (awaiting upload)',
    spatialExtent: null,
    resolution: 'Unavailable',
    units: 'Unavailable',
    noDataValue: 'Unavailable',
    missingValueCount: 0,
    totalRecords: 0,
    qualityScore: 0,
    processingStatus: 'Pending Upload (Not Mounted)',
    summaryStats: null,
    previewRows: [],
    columns: [],
    notes: 'Referenced in prompt (@space_agency_terrestrial_analogs-v2(3).zip) but not mounted in runtime workspace. Upload the archive to extract and index its tabular/geospatial contents.',
    createdAt: '2026-11-14T00:00:00Z',
  },
  // Two explicitly labeled procedural algorithm calibration grids so 3D DEM & Lab charts work immediately
  {
    id: 'ds-calib-ladakh-ridge',
    filename: 'CALIBRATION_Ladakh_Ridge_Benchmark.asc',
    format: 'ASC',
    fileSizeBytes: 18420,
    source: 'Procedural Calibration Grid (Synthetic Valley-Ridge Model)',
    planet: 'Earth',
    region: 'Trans-Himalayan Calibration Tile',
    crs: 'WGS84 / EPSG:4326 (90 m nominal grid)',
    spatialExtent: { minLat: 34.05, maxLat: 34.25, minLon: 77.45, maxLon: 77.68 },
    resolution: '90 m/cell (40×40 benchmark)',
    units: 'meters',
    noDataValue: '-9999',
    missingValueCount: 0,
    totalRecords: 1600,
    qualityScore: 100,
    processingStatus: 'Processed',
    summaryStats: buildBenchmarkStats(1.2, 3380, 1850, false),
    previewRows: [
      { row: 0, col: 0, elevation_m: 4482.5, slope_deg: 17.4, zone: 'North Ridge' },
      { row: 20, col: 20, elevation_m: 3684.2, slope_deg: 6.2, zone: 'Alluvial Floor' },
      { row: 39, col: 39, elevation_m: 4721.8, slope_deg: 21.8, zone: 'South Escarpment' },
    ],
    columns: ['row', 'col', 'elevation_m', 'slope_deg', 'zone'],
    notes: 'Mathematical valley-ridge terrain calibration surface used to verify Horn 3×3 slope, Riley TRI, and hypsometry pipelines prior to uploading N34E077.SRTMGL1.hgt.',
    createdAt: '2026-11-14T01:00:00Z',
  },
  {
    id: 'ds-calib-jezero-crater',
    filename: 'CALIBRATION_Crater_Basin_Benchmark.asc',
    format: 'ASC',
    fileSizeBytes: 18940,
    source: 'Procedural Calibration Grid (Synthetic Crater Rim-Bowl Model)',
    planet: 'Mars',
    region: 'Isidis Rim Calibration Sector',
    crs: 'Mars 2000 IAU Sphere (R = 3396.19 km)',
    spatialExtent: { minLat: 18.2, maxLat: 18.55, minLon: 77.4, maxLon: 77.75 },
    resolution: '90 m/cell (40×40 benchmark)',
    units: 'meters (MOLA datum ref)',
    noDataValue: '-9999',
    missingValueCount: 0,
    totalRecords: 1600,
    qualityScore: 100,
    processingStatus: 'Processed',
    summaryStats: buildBenchmarkStats(2.7, -2720, 910, true),
    previewRows: [
      { row: 0, col: 0, elevation_m: -2140.4, slope_deg: 5.1, zone: 'Outer Ejecta' },
      { row: 20, col: 20, elevation_m: -2748.0, slope_deg: 2.3, zone: 'Crater Floor' },
      { row: 11, col: 20, elevation_m: -1874.6, slope_deg: 26.4, zone: 'Rim Crest' },
    ],
    columns: ['row', 'col', 'elevation_m', 'slope_deg', 'zone'],
    notes: 'Mathematical crater rim-and-bowl terrain calibration surface used to demonstrate cross-planet relative relief & slope distributions alongside Earth DEMs.',
    createdAt: '2026-11-14T01:05:00Z',
  },
];
