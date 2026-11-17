import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { analyzeTerrain, compareTerrain, loadDem, regions } from '../science'
import type { DemGrid, Region, TerrainMetrics } from '../science'
import { evaluateOriginalSimilarity } from '../legacyScience'
import { BenchmarkClusters, BenchmarkComparison, BenchmarkTerrainRecord } from './BenchmarkScience'
import './terrain-science.css'

type Planet = Region['planet']
type Target = 'Moon' | 'Mars'

export interface TerrainScienceProps {
  selection: Record<Planet, string>
  onSelect: (planet: Planet, regionId: string) => void
  onOpenTerrain: (planet: Planet, regionId: string) => void
  onOpenComparison?: (planet: Target) => void
}

type TerrainData = { grid: DemGrid; metrics: TerrainMetrics }
type TerrainResult = { id: string; data?: TerrainData; error?: boolean }
type TerrainState = { data?: TerrainData; error?: boolean; loading?: boolean }

const displayNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
const preciseNumber = new Intl.NumberFormat('en', { maximumFractionDigits: 3 })
const formatNumber = (value: number) => Number.isFinite(value) ? displayNumber.format(value) : 'Unavailable'

async function loadAnalysis(region: Region): Promise<TerrainData> {
  const grid = await loadDem(region)
  return { grid, metrics: analyzeTerrain(grid) }
}

function useTerrainData(region: Region | undefined, enabled: boolean): TerrainState {
  const [result, setResult] = useState<TerrainResult>()
  useEffect(() => {
    if (!region?.demUrl || !enabled) return
    let current = true
    loadAnalysis(region).then(data => {
      if (current) setResult({ id: region.id, data })
    }).catch(() => {
      if (current) setResult({ id: region.id, error: true })
    })
    return () => { current = false }
  }, [region, enabled])

  if (!region?.demUrl) return {}
  return result?.id === region.id ? result : { loading: enabled }
}

function useNearPanel<T extends HTMLElement>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    if (!ref.current) return
    if (!('IntersectionObserver' in window)) {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNear(true)
        observer.disconnect()
      }
    }, { rootMargin: '320px 0px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, near]
}

function selectedRegion(selection: TerrainScienceProps['selection'], planet: Planet) {
  return regions.find(region => region.planet === planet && region.id === selection[planet])
    ?? regions.find(region => region.planet === planet)
}

function coordinates(region: Region) {
  return `${Math.abs(region.lat).toFixed(3)}° ${region.lat >= 0 ? 'N' : 'S'} · ${Math.abs(region.lon).toFixed(3)}° ${region.lon >= 0 ? 'E' : 'W'}`
}

function RegionSelect({ planet, region, onSelect }: {
  planet: Planet
  region?: Region
  onSelect: TerrainScienceProps['onSelect']
}) {
  const available = regions.filter(item => item.planet === planet)
  return (
    <label className="science-select">
      <span><i className={`science-planet-dot science-planet-dot--${planet.toLowerCase()}`} />{planet} region</span>
      <select value={region?.id ?? ''} onChange={event => onSelect(planet, event.target.value)} disabled={!available.length}>
        {!available.length && <option value="">No catalogued regions</option>}
        {available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
  )
}

function Provenance({ region, grid }: { region?: Region; grid?: DemGrid }) {
  if (!region) return <p className="science-muted">Dataset details are unavailable.</p>
  return (
    <dl className="science-provenance">
      <div><dt>Location</dt><dd>{coordinates(region)}</dd></div>
      <div><dt>Source</dt><dd><a href={region.sourceUrl} target="_blank" rel="noreferrer">{region.source} <span aria-hidden="true">↗</span></a></dd></div>
      <div><dt>Product ID</dt><dd>{region.sourceId}</dd></div>
      <div><dt>Native resolution</dt><dd>{region.nativeResolution || 'Unavailable'}</dd></div>
      <div><dt>Analysis resolution</dt><dd>{region.resolution || 'Unavailable'}{grid && <> · {grid.width} × {grid.height} samples</>}</dd></div>
      <div><dt>Datum</dt><dd>{region.datum}</dd></div>
    </dl>
  )
}

const scalarMetrics = [
  { key: 'minimum', label: 'Minimum elevation', unit: 'm' },
  { key: 'maximum', label: 'Maximum elevation', unit: 'm' },
  { key: 'meanElevation', label: 'Mean elevation', unit: 'm' },
  { key: 'relief', label: 'Relief', unit: 'm' },
  { key: 'meanSlope', label: 'Mean Horn slope', unit: '°' },
  { key: 'meanTri', label: 'Mean Riley TRI', unit: 'm' },
  { key: 'hypsometricIntegral', label: 'Hypsometric integral', unit: '' },
] as const

function metricValue(metrics: TerrainMetrics | undefined, metric: typeof scalarMetrics[number]) {
  if (!metrics || !Number.isFinite(metrics[metric.key])) return 'Unavailable'
  const value = metric.key === 'hypsometricIntegral'
    ? preciseNumber.format(metrics[metric.key])
    : formatNumber(metrics[metric.key])
  return `${value}${metric.unit && (metric.unit === '°' ? '°' : ` ${metric.unit}`)}`
}

function TerrainMetricsPanel({ earth, target, paired = false }: {
  earth?: TerrainMetrics
  target?: TerrainMetrics
  paired?: boolean
}) {
  return (
    <table className="science-table">
      <thead>
        <tr><th scope="col">Metric</th><th scope="col">{paired ? 'Earth' : 'Derived value'}</th>{paired && <th scope="col">Target</th>}</tr>
      </thead>
      <tbody>
        {scalarMetrics.map(metric => (
          <tr key={metric.key}>
            <th scope="row">{metric.label}</th>
            <td>{metricValue(earth, metric)}</td>
            {paired && <td>{metricValue(target, metric)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function TerrainPreview({ grid, mode = 'elevation', values }: {
  grid: DemGrid
  mode?: 'elevation' | 'slope' | 'ruggedness'
  values?: number[]
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const samples = values ?? grid.elevations
  const valid = samples.filter(Number.isFinite)
  const low = valid.length ? Math.min(...valid) : 0
  const high = valid.length ? Math.max(...valid) : 0
  const names = { elevation: 'Elevation', slope: 'Slope', ruggedness: 'Riley TRI' }
  const unit = mode === 'slope' ? '°' : ' m'

  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const image = context.createImageData(grid.width, grid.height)
    const range = high - low || 1
    const palette = mode === 'elevation' ? [[14, 31, 52], [49, 111, 116], [218, 188, 135]] :
      mode === 'slope' ? [[16, 31, 57], [46, 117, 150], [166, 224, 224]] :
        [[28, 23, 45], [133, 72, 75], [240, 177, 115]]

    for (let index = 0; index < grid.width * grid.height; index += 1) {
      const value = samples[index]
      const output = index * 4
      if (!Number.isFinite(value)) {
        image.data.set([13, 22, 34, 255], output)
        continue
      }
      const normalized = (value - low) / range
      const start = normalized < 0.5 ? palette[0] : palette[1]
      const end = normalized < 0.5 ? palette[1] : palette[2]
      const fraction = normalized < 0.5 ? normalized * 2 : (normalized - 0.5) * 2
      const left = index % grid.width ? samples[index - 1] : value
      const top = index >= grid.width ? samples[index - grid.width] : value
      const gradient = mode === 'elevation' && Number.isFinite(left) && Number.isFinite(top)
        ? Math.max(-33, Math.min(33, (value - (left + top) / 2) / range * 175))
        : 0
      for (let channel = 0; channel < 3; channel += 1) {
        image.data[output + channel] = start[channel] + (end[channel] - start[channel]) * fraction + gradient
      }
      image.data[output + 3] = 255
    }
    context.putImageData(image, 0, 0)
  }, [grid, high, low, mode, samples])

  if (!valid.length) return <p className="science-status">The analysis grid contains no valid {names[mode].toLowerCase()} samples.</p>
  return (
    <figure className={`science-terrain-image science-terrain-image--${mode}`}>
      <div className="science-terrain-map">
        <canvas ref={canvas} width={grid.width} height={grid.height} role="img" aria-label={`${names[mode]} raster. North at top.`} />
        <span className="science-north" aria-hidden="true">N<br />↑</span>
      </div>
      <figcaption>
        <span>{names[mode]} · derived raster</span><span>{formatNumber(low)}{unit} <i /> {formatNumber(high)}{unit}</span>
      </figcaption>
    </figure>
  )
}

function DataState({ terrain }: { terrain: TerrainState }) {
  if (terrain.data) return null
  return <p className="science-status" role="status">{terrain.loading ? 'Loading elevation samples…' : terrain.error ? 'The elevation grid couldn’t be loaded.' : 'Elevation samples are unavailable.'}</p>
}

export function EarthRegionExplorer({ selection, onSelect, onOpenTerrain }: TerrainScienceProps) {
  const [panel, near] = useNearPanel<HTMLElement>()
  const region = selectedRegion(selection, 'Earth')
  const terrain = useTerrainData(region, near)
  return (
    <section ref={panel} className="science-shell science-explorer" aria-label="Earth region explorer">
      <div className="science-panel-header">
        <div><h3>Earth region explorer</h3><p>Inspect a geographic sample and the terrain measurements derived from it.</p></div>
        <RegionSelect planet="Earth" region={region} onSelect={onSelect} />
      </div>
      <div className="science-two-col">
        <div className="science-visual-panel">
          {region?.image ? <figure className="science-terrain-image">
            <div className="science-terrain-map">
              <img src={region.image} alt={`Shaded relief of ${region.name} derived from its elevation grid`} loading="lazy" />
              <span className="science-north" aria-hidden="true">N<br />↑</span>
            </div>
            <figcaption>Shaded relief · derived from the source DEM</figcaption>
          </figure> : terrain.data && <TerrainPreview grid={terrain.data.grid} />}
          <DataState terrain={terrain} />
          {region && <p className="science-subtle">{region.summary}</p>}
          <Provenance region={region} grid={terrain.data?.grid} />
          {region && <button className="science-action" type="button" onClick={() => onOpenTerrain('Earth', region.id)}>Open terrain viewer <span aria-hidden="true">↗</span></button>}
        </div>
        <div className="science-results-panel">
          <h4>Terrain measurements</h4>
          <TerrainMetricsPanel earth={terrain.data?.metrics} />
          <p className="science-subtle">Statistics describe the displayed crop. Elevations are relative to the listed vertical datum.</p>
        </div>
      </div>
      <BenchmarkTerrainRecord regionId={region?.id} />
    </section>
  )
}

type PlotMode = 'profile' | 'slope' | 'tri'
type PlotSeries = { name: string; color: string; values: number[] }

const plotTabs: { id: PlotMode; label: string }[] = [
  { id: 'profile', label: 'Elevation profile' },
  { id: 'slope', label: 'Slope distribution' },
  { id: 'tri', label: 'Riley TRI distribution' },
]
const distributionBinCount = 16

function histogram(samples: number[], binCount: number, minimum: number, maximum: number) {
  const valid = samples.filter(Number.isFinite)
  if (!valid.length) return []
  const bins = Array<number>(binCount).fill(0)
  const binWidth = (maximum - minimum) / binCount || 1
  for (const value of valid) {
    const index = Math.max(0, Math.min(binCount - 1, Math.floor((value - minimum) / binWidth)))
    bins[index] += 1
  }
  return bins.map(count => 100 * count / valid.length)
}

function getPlotSeries(items: { region?: Region; data?: TerrainData; color: string }[], mode: PlotMode) {
  const available = items.flatMap(({ region, data, color }) => {
    if (!region || !data) return []
    const { metrics } = data
    const values = mode === 'profile' ? metrics.elevationProfile : mode === 'slope' ? metrics.slope : metrics.ruggedness
    return [{ name: region.name, color, values }]
  })
  if (mode === 'profile') return { series: available, binMaximum: 100 }
  const finite = available.flatMap(item => item.values.filter(Number.isFinite))
  const maximum = finite.length ? Math.max(...finite) : 0
  const binMaximum = Math.max(1, Math.ceil(maximum * 10) / 10)
  return { series: available.map(item => ({ ...item, values: histogram(item.values, distributionBinCount, 0, binMaximum) })), binMaximum }
}

function LinePlot({ series, minimum, maximum, position, label, binned = false }: {
  series: PlotSeries[]
  minimum: number
  maximum: number
  position?: number
  label: string
  binned?: boolean
}) {
  const width = 584
  const height = 156
  const left = 48
  const top = 12
  const plotWidth = width - left - 14
  const plotHeight = height - top - 12
  const low = Number.isFinite(minimum) ? minimum : 0
  const high = Number.isFinite(maximum) && maximum > low ? maximum : low + 1
  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="science-plot">
      {[0, 0.25, 0.5, 0.75, 1].map(tick => {
        const y = top + plotHeight * tick
        return <g key={tick}><line x1={left} x2={width - 14} y1={y} y2={y} /><text x={left - 7} y={y + 3} textAnchor="end">{formatNumber(high - (high - low) * tick)}</text></g>
      })}
      {position !== undefined && <line className="science-cursor" x1={left + plotWidth * position} x2={left + plotWidth * position} y1={top} y2={height - 12} />}
      {series.map(item => {
        let penDown = false
        const path = item.values.map((value, index) => {
          if (!Number.isFinite(value)) {
            penDown = false
            return ''
          }
          const fraction = binned ? (index + 0.5) / item.values.length : index / Math.max(1, item.values.length - 1)
          const x = left + plotWidth * fraction
          const y = top + plotHeight * (high - value) / (high - low)
          const segment = `${penDown ? 'L' : 'M'} ${x} ${y}`
          penDown = true
          return segment
        }).join(' ')
        return <path key={item.name} d={path} stroke={item.color} />
      })}
    </svg>
  )
}

function ComparisonPlots({ earth, target, left, right }: {
  earth?: Region
  target?: Region
  left: TerrainState
  right: TerrainState
}) {
  const [mode, setMode] = useState<PlotMode>('profile')
  const [position, setPosition] = useState(50)
  const { series, binMaximum } = useMemo(() => getPlotSeries([
    { region: earth, data: left.data, color: '#8ad5f6' },
    { region: target, data: right.data, color: target?.planet === 'Mars' ? '#f69c77' : '#d3d7e3' },
  ], mode), [earth, left.data, mode, right.data, target])
  const finite = series.flatMap(item => item.values.filter(Number.isFinite))
  const low = finite.length && mode === 'profile' ? Math.min(...finite) : 0
  const high = finite.length ? Math.max(...finite) : 1
  const unit = mode === 'profile' ? 'm' : mode === 'slope' ? '°' : 'm'
  const binCount = distributionBinCount
  const binIndex = Math.min(binCount - 1, position)
  const cursor = mode === 'profile' ? position / 100 : (binIndex + 0.5) / binCount
  const cursorLabel = mode === 'profile' ? `${position}% of the transect` :
    `${formatNumber(binIndex * binMaximum / binCount)}–${formatNumber((binIndex + 1) * binMaximum / binCount)} ${unit} bin`
  return (
    <section className="science-charts" aria-label="Terrain charts">
      <div className="science-tabs" role="group" aria-label="Chart view">
        {plotTabs.map(tab => (
          <button key={tab.id} type="button" aria-pressed={mode === tab.id} onClick={() => {
            setMode(tab.id)
            setPosition(tab.id === 'profile' ? 50 : Math.floor(binCount / 2))
          }}>{tab.label}</button>
        ))}
      </div>
      {finite.length ? <>
        <div className="science-chart-axis">{mode === 'profile' ? 'Elevation (m)' : 'Valid samples (%)'}</div>
        <LinePlot series={series} minimum={low} maximum={high} position={cursor} label={plotTabs.find(tab => tab.id === mode)?.label ?? 'Terrain plot'} binned={mode !== 'profile'} />
        <div className="science-chart-labels">
          <span>{mode === 'profile' ? 'West edge' : `0 ${unit}`}</span>
          <span>{mode === 'profile' ? 'Relative transect position' : mode === 'slope' ? 'Slope bin' : 'Riley TRI bin'}</span>
          <span>{mode === 'profile' ? 'East edge' : `${formatNumber(binMaximum)} ${unit}`}</span>
        </div>
        <label className="science-chart-scrubber">
          <span>{mode === 'profile' ? 'Inspect transect' : 'Inspect distribution'}</span>
          <input type="range" min="0" max={mode === 'profile' ? 100 : binCount - 1} step="1" value={position} aria-valuetext={cursorLabel} onChange={event => setPosition(Number(event.target.value))} />
        </label>
        <p className="science-chart-cursor-label">{cursorLabel}</p>
        <ul className="science-plot-legend">
          {series.map(item => {
            const index = mode === 'profile' ? Math.round(position / 100 * (item.values.length - 1)) : binIndex
            const value = item.values[index]
            return <li key={item.name}><i style={{ background: item.color }} />{item.name} <strong>{Number.isFinite(value) ? `${formatNumber(value)} ${mode === 'profile' ? 'm' : '%'}` : 'Unavailable'}</strong></li>
          })}
        </ul>
        <p className="science-subtle">{mode === 'profile' ? 'The middle row of each DEM runs west to east. Elevations use each source’s own vertical datum.' : 'Both curves use the same bin boundaries. Percentages describe the distribution of samples within each region.'}</p>
      </> : <p className="science-status" role="status">{left.loading || right.loading ? 'Loading terrain plots…' : 'Terrain plots are unavailable.'}</p>}
    </section>
  )
}

function TerrainComparison({ targetPlanet, selection, onSelect, onOpenTerrain }: TerrainScienceProps & { targetPlanet: Target }) {
  const [panel, near] = useNearPanel<HTMLElement>()
  const earth = selectedRegion(selection, 'Earth')
  const target = selectedRegion(selection, targetPlanet)
  const left = useTerrainData(earth, near)
  const right = useTerrainData(target, near)
  const comparison = left.data && right.data ? compareTerrain(left.data.grid, right.data.grid) : undefined
  return (
    <section ref={panel} className={`science-shell science-comparison science-comparison--${targetPlanet.toLowerCase()}`} aria-label={`Earth and ${targetPlanet} comparison`}>
      <div className="science-panel-header">
        <div><h3>Earth / {targetPlanet} comparison</h3><p>Compare terrain samples across worlds.</p></div>
        <div className="science-select-pair">
          <RegionSelect planet="Earth" region={earth} onSelect={onSelect} />
          <RegionSelect planet={targetPlanet} region={target} onSelect={onSelect} />
        </div>
      </div>
      <div className="science-two-col">
        <div className="science-results-panel">
          <h4>Morphometry</h4>
          <TerrainMetricsPanel earth={left.data?.metrics} target={right.data?.metrics} paired />
          <div className="science-comparison-result" role="status">
            <span>Exploratory morphology distance</span>
            <strong>{comparison?.compatible && comparison.distance !== null ? preciseNumber.format(comparison.distance) : 'Unavailable'}</strong>
            <p>{comparison?.explanation ?? (left.loading || right.loading ? 'Waiting for both elevation grids.' : 'Two elevation grids are required.')}</p>
          </div>
        </div>
        <ComparisonPlots earth={earth} target={target} left={left} right={right} />
      </div>
      <details className="science-details">
        <summary>Dataset provenance and comparison limits</summary>
        <div className="science-two-col">
          <div><h4>{earth?.name ?? 'Earth'}</h4><Provenance region={earth} grid={left.data?.grid} /></div>
          <div><h4>{target?.name ?? targetPlanet}</h4><Provenance region={target} grid={right.data?.grid} /></div>
        </div>
        <p className="science-subtle">Morphology distance uses the root mean square of four differences. For relief, mean Horn slope, and mean Riley TRI, the absolute difference is divided by the sum of the paired values. Hypsometric integrals use their absolute difference. The distance requires equal cell spacing and grid dimensions.</p>
        <p className="science-subtle">Morphological similarity alone cannot establish a shared geological origin, surface composition, or suitability for an exploration mission. Source resolution and datum affect interpretation.</p>
      </details>
      <BenchmarkComparison earthId={earth?.id} targetId={target?.id} />
      <div className="science-actions">
        {target && <button className="science-action" type="button" onClick={() => onOpenTerrain(targetPlanet, target.id)}>Explore this terrain in 3D <span aria-hidden="true">↗</span></button>}
        {earth && <button className="science-action science-action--secondary" type="button" onClick={() => onOpenTerrain('Earth', earth.id)}>Open Earth terrain <span aria-hidden="true">↗</span></button>}
      </div>
    </section>
  )
}

export function EarthMoonComparison(props: TerrainScienceProps) {
  return <TerrainComparison {...props} targetPlanet="Moon" />
}

export function EarthMarsComparison(props: TerrainScienceProps) {
  return <TerrainComparison {...props} targetPlanet="Mars" />
}

const methods = [
  { title: 'Digital elevation models', explanation: 'A DEM stores one elevation per sampled cell. These grids use a local projected coordinate system so that cell spacing is expressed in metres.', tool: 'Open the digital twin', href: '#digital-twin' },
  { title: 'Elevation and relief', explanation: 'Elevation is measured relative to a named datum. Relief is the difference between the highest and lowest valid elevations within the crop.', tool: 'Inspect an Earth region', href: '#earth' },
  { title: 'Horn 3×3 slope', explanation: 'Horn’s method combines eight neighbours into weighted east–west and north–south gradients. Their combined inclination is expressed in degrees.', tool: 'Open the terrain charts', href: '#earth-moon' },
  { title: 'Riley terrain ruggedness', explanation: 'Riley’s index takes the square root of the sum of squared elevation differences between each centre cell and its eight neighbours.', tool: 'Explore ruggedness in 3D', href: '#digital-twin' },
  { title: 'Hypsometric analysis', explanation: 'The curve pairs normalized elevation with the fraction of the sample area above it. The integral locates mean elevation between the minimum and maximum.', tool: 'Inspect Earth hypsometry', href: '#earth' },
  { title: 'Morphology clustering', explanation: 'The original deterministic clustering method groups benchmark sites by catalogued slope and ruggedness. The cluster memberships depend on the selected normalization and number of groups.', tool: 'Inspect original benchmark comparisons', href: '#earth-mars' },
  { title: 'Terrain comparison', explanation: 'This workspace computes an exploratory morphology distance for compatible DEM samples. Lower values indicate closer values for the selected terrain metrics.', tool: 'Compare Earth and Mars', href: '#earth-mars' },
]

function MethodsGraphic({ stage, earth, mars, earthId }: { stage: number; earth: TerrainState; mars: TerrainState; earthId?: string }) {
  if (stage === 5) return <BenchmarkClusters regionId={earthId} />
  if (!earth.data) return <DataState terrain={earth} />
  const { grid, metrics } = earth.data
  switch (stage) {
    case 0:
      return <><TerrainPreview grid={grid} /><p className="science-figure-stat">{grid.width} × {grid.height} samples · {formatNumber(grid.cellSizeMeters)} m grid spacing</p></>
    case 1:
      return <>
        <LinePlot series={[{ name: 'Central elevation profile', color: '#8ad5f6', values: metrics.elevationProfile }]} minimum={metrics.minimum} maximum={metrics.maximum} label="West-to-east elevation profile in metres" />
        <p className="science-figure-stat">{formatNumber(metrics.minimum)} to {formatNumber(metrics.maximum)} m · {formatNumber(metrics.relief)} m relief</p>
      </>
    case 2:
      return <><TerrainPreview grid={grid} mode="slope" values={metrics.slope} /><p className="science-figure-stat">Mean slope {formatNumber(metrics.meanSlope)}°</p></>
    case 3:
      return <><TerrainPreview grid={grid} mode="ruggedness" values={metrics.ruggedness} /><p className="science-figure-stat">Mean Riley TRI {formatNumber(metrics.meanTri)} m</p></>
    case 4:
      return <>
        {metrics.hypsometricCurve.length ? <div>
          <p className="science-chart-axis">Normalized elevation</p>
          <LinePlot series={[{ name: 'Normalized elevation', color: '#8ad5f6', values: metrics.hypsometricCurve }]} minimum={0} maximum={1} label="Hypsometric curve of normalized elevation across ranked sample area" />
          <div className="science-chart-labels"><span>0%</span><span>Area above elevation</span><span>100%</span></div>
        </div> : <p className="science-status">A hypsometric curve is unavailable for this sample.</p>}
        <p className="science-figure-stat">Hypsometric integral {metricValue(metrics, scalarMetrics[6])}</p>
      </>
    default: {
      const result = mars.data && compareTerrain(grid, mars.data.grid)
      return <>
        <TerrainMetricsPanel earth={metrics} target={mars.data?.metrics} paired />
        <p className="science-figure-stat">Exploratory distance {result?.compatible && result.distance !== null ? preciseNumber.format(result.distance) : 'unavailable'}</p>
      </>
    }
  }
}

export function TerrainIntelligence({ selection }: Pick<TerrainScienceProps, 'selection'>) {
  const [panel, near] = useNearPanel<HTMLElement>()
  const [active, setActive] = useState(0)
  const steps = useRef<(HTMLElement | null)[]>([])
  const manualSelectionPosition = useRef<number>(-Infinity)
  const earth = selectedRegion(selection, 'Earth')
  const mars = selectedRegion(selection, 'Mars')
  const earthData = useTerrainData(earth, near)
  const marsData = useTerrainData(mars, near && active === methods.length - 1)
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      if (Math.abs(manualSelectionPosition.current - window.scrollY) < 8) return
      const best = entries.filter(entry => entry.isIntersecting).sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0]
      if (best) setActive(Number((best.target as HTMLElement).dataset.stage))
    }, { rootMargin: '-43% 0px -37% 0px' })
    steps.current.forEach(step => { if (step) observer.observe(step) })
    return () => observer.disconnect()
  }, [])
  return (
    <section ref={panel} className="science-methods" aria-label="Terrain methods">
      <div className="science-method-steps">
        {methods.map((method, index) => (
          <article className={`science-method-step${index === active ? ' is-active' : ''}`} data-stage={index} ref={element => { steps.current[index] = element }} key={method.title}>
            <button className="science-method-title" type="button" aria-pressed={index === active} aria-controls="science-method-visualization" onClick={() => {
              manualSelectionPosition.current = window.scrollY
              setActive(index)
            }}>
              <span>{String(index + 1).padStart(2, '0')}</span><strong>{method.title}</strong>
            </button>
            <p>{method.explanation}</p>
            <a href={method.href}>{method.tool} <span aria-hidden="true">↗</span></a>
          </article>
        ))}
      </div>
      <div id="science-method-visualization" className="science-shell science-method-graphic" aria-label={`Visualization for ${methods[active].title}`}>
        <div className="science-panel-header"><div><h3>{methods[active].title}</h3><p>{earth?.name ?? 'Earth sample'}{active === 6 && mars ? ` / ${mars.name}` : ''}</p></div></div>
        <div className="science-method-output"><MethodsGraphic stage={active} earth={earthData} mars={marsData} earthId={earth?.id} /></div>
      </div>
    </section>
  )
}

type FinderMode = 'benchmark' | 'sample'
type AnalogueResult = { region: Region; value: number }
type FinderResult = { target: string; mode: FinderMode; matches: AnalogueResult[]; unavailable: number; error?: true }

export function EarthAnalogueFinder({ selection, onSelect, onOpenComparison }: TerrainScienceProps) {
  const [targetPlanet, setTargetPlanet] = useState<Target>('Mars')
  const [mode, setMode] = useState<FinderMode>('benchmark')
  const [result, setResult] = useState<FinderResult>()
  const [working, setWorking] = useState(false)
  const generation = useRef(0)
  const target = selectedRegion(selection, targetPlanet)
  const comparisonHref = targetPlanet === 'Moon' ? '#earth-moon' : '#earth-mars'
  const clearSearch = () => {
    generation.current += 1
    setResult(undefined)
    setWorking(false)
  }
  const changeTarget = (planet: Target, regionId?: string) => {
    clearSearch()
    setTargetPlanet(planet)
    if (regionId) onSelect(planet, regionId)
  }

  async function findAnalogues() {
    if (!target) return
    const run = ++generation.current
    setWorking(true)
    setResult(undefined)
    const candidateRegions = regions.filter(region => region.planet === 'Earth')
    if (mode === 'benchmark') {
      const matches = candidateRegions.flatMap(region => {
        const evaluation = evaluateOriginalSimilarity(region.id, target.id)
        return evaluation ? [{ region, value: evaluation.overallScore }] : []
      }).sort((left, right) => right.value - left.value)
      setResult({ target: target.id, mode, matches, unavailable: candidateRegions.length - matches.length })
      setWorking(false)
      return
    }
    try {
      const targetGrid = (await loadAnalysis(target)).grid
      const candidates = await Promise.allSettled(candidateRegions.map(async region => {
        if (!region.demUrl) return null
        const { grid } = await loadAnalysis(region)
        const match = compareTerrain(grid, targetGrid)
        return match.compatible && match.distance !== null ? { region, value: match.distance } : null
      }))
      if (run !== generation.current) return
      const matches = candidates.flatMap(candidate => candidate.status === 'fulfilled' && candidate.value ? [candidate.value] : [])
      matches.sort((left, right) => left.value - right.value)
      setResult({ target: target.id, mode, matches, unavailable: candidates.length - matches.length })
      setWorking(false)
    } catch {
      if (run !== generation.current) return
      setResult({ target: target.id, mode, matches: [], unavailable: 0, error: true })
      setWorking(false)
    }
  }

  function openMatch(regionId: string) {
    onSelect('Earth', regionId)
    if (onOpenComparison) onOpenComparison(targetPlanet)
    else window.location.hash = comparisonHref
  }

  const current = result?.target === target?.id && result?.mode === mode ? result : undefined
  return (
    <section className="science-shell science-finder" aria-label="Earth analogue finder">
      <div className="science-panel-header">
        <div><h3>Earth analogue finder</h3><p>Rank Earth terrain against a lunar or Martian target using the original benchmark index or the independently sourced DEMs.</p></div>
        <div className="science-select-pair">
          <label className="science-select"><span>Target world</span><select value={targetPlanet} onChange={event => changeTarget(event.target.value as Target)}><option value="Moon">Moon</option><option value="Mars">Mars</option></select></label>
          <RegionSelect planet={targetPlanet} region={target} onSelect={(planet, id) => changeTarget(planet as Target, id)} />
        </div>
      </div>
      <div className="science-actions">
        <label className="science-select science-finder-method">
          <span>Ranking method</span>
          <select value={mode} onChange={event => { clearSearch(); setMode(event.target.value as FinderMode) }}>
            <option value="benchmark">Original benchmark index</option>
            <option value="sample">Sampled DEM distance</option>
          </select>
        </label>
        <button className="science-action" type="button" onClick={findAnalogues} disabled={!target || working || (mode === 'sample' && !target.demUrl)}>{working ? 'Comparing samples…' : 'Find Earth analogues'} <span aria-hidden="true">↗</span></button>
      </div>
      <div className="science-finder-results" aria-live="polite">
        {current?.error && <p className="science-status">The target elevation grid couldn’t be loaded.</p>}
        {current && !current.error && <>
          {current.matches.length ? <ol>{current.matches.map(match => (
            <li key={match.region.id}>
              <button type="button" onClick={() => openMatch(match.region.id)}><span>{match.region.name}</span><strong>{preciseNumber.format(match.value)}{mode === 'benchmark' ? ' / 100' : ''}</strong><span aria-hidden="true">↗</span></button>
            </li>
          ))}</ol> : <p className="science-status">No comparable Earth regions are available for this target.</p>}
          {current.unavailable > 0 && <p className="science-subtle">{current.unavailable} Earth {current.unavailable === 1 ? 'region was' : 'regions were'} unavailable or incompatible.</p>}
        </>}
      </div>
      {mode === 'benchmark' ? <p className="science-subtle">The original index is a weighted heuristic on a 0–100 scale. Higher values rank first.</p> :
        <p className="science-subtle">{target?.demUrl ? 'The dimensionless distance describes differences between four terrain metrics at the same grid spacing. Smaller distances rank first.' : 'An independently sourced elevation grid is unavailable for this target.'}</p>}
    </section>
  )
}
