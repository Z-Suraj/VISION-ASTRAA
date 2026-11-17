import { referenceRegions } from './catalog.ts'

export type Planet = 'Earth' | 'Moon' | 'Mars'

export interface Region {
  id: string
  name: string
  planet: Planet
  lat: number
  lon: number
  summary: string
  source: string
  sourceId: string
  sourceUrl: string
  datum: string
  attribution: string
  resolution: string
  nativeResolution: string
  cellSizeMeters: number
  demUrl: string
  image?: string
  inputs: readonly string[]
  contributors: readonly string[]
}

export interface DemGrid {
  width: number
  height: number
  cellSizeMeters: number
  elevations: number[]
}

export interface HistogramBin {
  minimum: number
  maximum: number
  count: number
}

export interface TerrainMetrics {
  minimum: number
  maximum: number
  relief: number
  meanElevation: number
  meanSlope: number
  meanTri: number
  hypsometricIntegral: number
  slope: number[]
  ruggedness: number[]
  elevationProfile: number[]
  hypsometricCurve: number[]
  slopeHistogram: HistogramBin[]
  ruggednessHistogram: HistogramBin[]
}

export interface TerrainComparison {
  compatible: boolean
  distance: number | null
  explanation: string
}

export const regions: Region[] = [...referenceRegions]

export const methodology = {
  sampling: 'Each local DEM has 109 × 109 cells on a 1,000 m grid. A cell averages 16 bilinearly interpolated samples from public elevation products. Native data spacing, datums and coverage vary.',
  slope: 'Horn’s 3 × 3 weighted horizontal derivatives give local slope in degrees. The mean includes interior cells with a complete neighborhood.',
  ruggedness: 'Riley TRI is the square root of the sum of the eight squared elevation differences around an interior cell, in meters.',
  hypsometry: 'The hypsometric integral is (mean elevation − minimum elevation) ÷ relief. The curve plots normalized elevation against cumulative area above that elevation.',
  comparison: 'The exploratory distance is the root-mean-square of four differences. Relief, mean slope and mean TRI use the absolute pairwise difference divided by the sum. The hypsometric integral uses its absolute difference.',
  limitation: 'A lower distance indicates closer values on these four metrics at this scale. Different sensors, vertical references and source processing can influence results. The distance has no geological or mission-suitability interpretation.',
} as const

const demRequests = new Map<string, Promise<DemGrid>>()
const measurements = new WeakMap<DemGrid, TerrainMetrics>()

async function fetchDem(region: Region): Promise<DemGrid> {
  const response = await fetch(region.demUrl)
  if (!response.ok) throw new Error(`Elevation data for ${region.name} could not be loaded (${response.status}).`)
  const grid: Partial<DemGrid> | null = await response.json()
  if (!grid || typeof grid.width !== 'number' || typeof grid.height !== 'number' ||
      !Number.isInteger(grid.width) || !Number.isInteger(grid.height) || grid.width < 3 || grid.height < 3 ||
      grid.cellSizeMeters !== region.cellSizeMeters || !Array.isArray(grid.elevations) ||
      grid.elevations.length !== grid.width * grid.height || !grid.elevations.every(Number.isFinite)) {
    throw new Error(`Elevation data for ${region.name} are incomplete or use an unexpected grid format.`)
  }
  return { width: grid.width, height: grid.height, cellSizeMeters: grid.cellSizeMeters, elevations: grid.elevations }
}

export function loadDem(region: Region): Promise<DemGrid> {
  const cached = demRequests.get(region.demUrl)
  if (cached) return cached
  const request = fetchDem(region).catch((error: unknown) => {
    demRequests.delete(region.demUrl)
    throw error
  })
  demRequests.set(region.demUrl, request)
  return request
}

function histogram(values: number[], edges: readonly number[]): HistogramBin[] {
  const bins = edges.slice(1).map((maximum, index) => ({ minimum: edges[index], maximum, count: 0 }))
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    const index = bins.findIndex((bin) => value < bin.maximum)
    bins[index < 0 ? bins.length - 1 : index].count++
  }
  return bins
}

export function analyzeTerrain(grid: DemGrid): TerrainMetrics {
  const cached = measurements.get(grid)
  if (cached) return cached

  const { width, height, cellSizeMeters, elevations } = grid
  let minimum = Infinity
  let maximum = -Infinity
  let elevationTotal = 0
  for (const elevation of elevations) {
    minimum = Math.min(elevation, minimum)
    maximum = Math.max(elevation, maximum)
    elevationTotal += elevation
  }
  const meanElevation = elevationTotal / elevations.length
  const relief = maximum - minimum
  const slope = new Array<number>(elevations.length).fill(NaN)
  const ruggedness = new Array<number>(elevations.length).fill(NaN)
  let slopeTotal = 0
  let triTotal = 0
  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col < width - 1; col++) {
      const center = row * width + col
      const nw = elevations[center - width - 1]
      const n = elevations[center - width]
      const ne = elevations[center - width + 1]
      const w = elevations[center - 1]
      const e = elevations[center + 1]
      const sw = elevations[center + width - 1]
      const s = elevations[center + width]
      const se = elevations[center + width + 1]
      const z = elevations[center]

      const xGradient = (ne + 2 * e + se - nw - 2 * w - sw) / (8 * cellSizeMeters)
      const yGradient = (sw + 2 * s + se - nw - 2 * n - ne) / (8 * cellSizeMeters)
      const cellSlope = Math.atan(Math.hypot(xGradient, yGradient)) * 180 / Math.PI
      const cellTri = Math.hypot(nw - z, n - z, ne - z, w - z, e - z, sw - z, s - z, se - z)
      slope[center] = cellSlope
      ruggedness[center] = cellTri
      slopeTotal += cellSlope
      triTotal += cellTri
    }
  }

  const interiorCells = (width - 2) * (height - 2)
  const centerRowStart = Math.floor(height / 2) * width
  const descending = elevations.slice().sort((a, b) => b - a)
  const hypsometricCurve = relief > 0 ? Array.from({ length: 101 }, (_, step) => {
    const position = step / 100 * (descending.length - 1)
    const first = Math.floor(position)
    const fraction = position - first
    const elevation = descending[first] * (1 - fraction) + descending[Math.ceil(position)] * fraction
    return (elevation - minimum) / relief
  }) : []
  const result: TerrainMetrics = {
    minimum,
    maximum,
    relief,
    meanElevation,
    meanSlope: slopeTotal / interiorCells,
    meanTri: triTotal / interiorCells,
    hypsometricIntegral: relief > 0 ? (meanElevation - minimum) / relief : NaN,
    slope,
    ruggedness,
    elevationProfile: elevations.slice(centerRowStart, centerRowStart + width),
    hypsometricCurve,
    slopeHistogram: histogram(slope, [0, 2, 5, 10, 15, 20, 30, 45, 60, 90]),
    ruggednessHistogram: histogram(ruggedness, [0, 50, 100, 200, 400, 800, 1600, 3200, 6400, 12800]),
  }
  measurements.set(grid, result)
  return result
}

function relativeDifference(left: number, right: number): number {
  const total = left + right
  return total === 0 ? 0 : Math.abs(left - right) / total
}

export function compareTerrain(left: DemGrid, right: DemGrid): TerrainComparison {
  if (left.cellSizeMeters !== right.cellSizeMeters || left.width !== right.width || left.height !== right.height) {
    return { compatible: false, distance: null, explanation: 'Use grids with the same sample spacing and area to compute a distance.' }
  }
  const a = analyzeTerrain(left)
  const b = analyzeTerrain(right)
  if (!Number.isFinite(a.hypsometricIntegral) || !Number.isFinite(b.hypsometricIntegral)) {
    return { compatible: false, distance: null, explanation: 'A hypsometric integral requires an elevation range in each window.' }
  }
  const distance = Math.hypot(
    relativeDifference(a.relief, b.relief),
    relativeDifference(a.meanSlope, b.meanSlope),
    relativeDifference(a.meanTri, b.meanTri),
    a.hypsometricIntegral - b.hypsometricIntegral,
  ) / 2
  return { compatible: true, distance, explanation: methodology.limitation }
}
