import { useMemo, useState } from 'react'
import {
  evaluateOriginalSimilarity, getOriginalClusters, originalSites,
} from '../legacyScience'

type BenchmarkSite = typeof originalSites[number]
type Normalization = NonNullable<Parameters<typeof getOriginalClusters>[1]>

const standardClusters = getOriginalClusters()
const clustersByRegion = new Map(standardClusters.points.map(point => [point.id, point]))
const number = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
const clusterColors = ['#8ad5f6', '#f6a988', '#c0d69b', '#cdbcfc', '#f3d184', '#e6a5c8']
const values = [
  { key: 'elevationMinM', label: 'Minimum elevation', unit: ' m' },
  { key: 'elevationMaxM', label: 'Maximum elevation', unit: ' m' },
  { key: 'elevationMeanM', label: 'Mean elevation', unit: ' m' },
  { key: 'reliefM', label: 'Relief', unit: ' m' },
  { key: 'meanSlopeDeg', label: 'Mean surface slope', unit: '°' },
  { key: 'triMeanM', label: 'Catalogued ruggedness (TRI)', unit: ' m' },
] as const

function originalSite(id: string | undefined) {
  return originalSites.find(site => site.id === id)
}

function catalogValue(site: BenchmarkSite | undefined, metric: typeof values[number]) {
  const value = site?.[metric.key]
  return value == null ? 'Unavailable' : `${number.format(value)}${metric.unit}`
}

function ReferenceProvenance({ site }: { site: BenchmarkSite }) {
  const cluster = clustersByRegion.get(site.id)
  return (
    <dl className="science-provenance">
      <div><dt>Region</dt><dd>{site.region} · {site.countryOrSector}</dd></div>
      <div><dt>Catalogue source</dt><dd>{site.sourceCitation}</dd></div>
      <div><dt>Data type</dt><dd>{site.provenance}</dd></div>
      <div><dt>Original cluster</dt><dd>{cluster?.clusterLabel ?? 'Unavailable'}</dd></div>
    </dl>
  )
}

export function BenchmarkTerrainRecord({ regionId }: { regionId?: string }) {
  const site = originalSite(regionId)
  if (!site) return null
  return (
    <details className="science-details">
      <summary>Original benchmark record</summary>
      <ReferenceProvenance site={site} />
      <table className="science-table">
        <thead><tr><th scope="col">Metric</th><th scope="col">Original catalogue</th></tr></thead>
        <tbody>{values.map(value => <tr key={value.key}><th scope="row">{value.label}</th><td>{catalogValue(site, value)}</td></tr>)}</tbody>
      </table>
      <p className="science-subtle">Catalogue values describe the original reference site. The sampled DEM above uses an independently sourced window and grid spacing.</p>
    </details>
  )
}

export function BenchmarkComparison({ earthId, targetId }: { earthId?: string; targetId?: string }) {
  const evaluation = useMemo(() => earthId && targetId ? evaluateOriginalSimilarity(earthId, targetId) : null, [earthId, targetId])
  if (!evaluation) return null
  const { earthSite, targetSite, overallScore, featureContributions, missingVariables } = evaluation
  return (
    <details className="science-details science-benchmark-comparison">
      <summary><span>Original benchmark evaluation</span><strong>{number.format(overallScore)} / 100</strong></summary>
      <p className="science-subtle">The original project’s weighted index uses catalogued slope, ruggedness, relief, temperature, hydration and geology. Features without a paired value are excluded. This index is a heuristic, and the source measurements may have different resolutions.</p>
      <div className="science-two-col science-benchmark-information">
        <div><h4>{earthSite.name}</h4><ReferenceProvenance site={earthSite} /></div>
        <div><h4>{targetSite.name}</h4><ReferenceProvenance site={targetSite} /></div>
      </div>
      <div className="science-table-scroll" tabIndex={0} role="region" aria-label="Original comparison feature contributions">
        <table className="science-table">
          <thead><tr><th scope="col">Original feature</th><th scope="col">Weight</th><th scope="col">Earth</th><th scope="col">{targetSite.body}</th><th scope="col">Index / 100</th></tr></thead>
          <tbody>{featureContributions.map(feature => (
            <tr key={feature.feature}>
              <th scope="row" title={feature.note}>{feature.feature}</th>
              <td>{number.format(feature.weightPct)}%</td>
              <td>{feature.earthValue}</td>
              <td>{feature.targetValue}</td>
              <td>{feature.available ? number.format(feature.contributionScore) : 'Unavailable'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {missingVariables.length > 0 && <p className="science-subtle">Excluded variables · {missingVariables.join(', ')}</p>}
    </details>
  )
}

export function BenchmarkClusters({ regionId }: { regionId?: string }) {
  const [count, setCount] = useState(3)
  const [normalization, setNormalization] = useState<Normalization>('zscore')
  const [pointId, setPointId] = useState<string>()
  const result = useMemo(() => getOriginalClusters(count, normalization), [count, normalization])
  const active = result.points.find(point => point.id === (pointId ?? regionId)) ?? result.points[0]
  const width = 430
  const height = 180
  const left = 38
  const right = width - 16
  const top = 16
  const bottom = height - 26
  const plotted = result.points.map(point => ({
    point,
    x: normalization === 'raw' ? point.meanSlopeDeg : normalization === 'minmax' ? point.slopeMinMax : point.slopeZ,
    y: normalization === 'raw' ? point.triMeanM : normalization === 'minmax' ? point.triMinMax : point.triZ,
  }))
  const maxSlope = Math.max(1, ...plotted.map(entry => entry.x))
  const maxTri = Math.max(1, ...plotted.map(entry => entry.y))
  const minSlope = Math.min(0, ...plotted.map(entry => entry.x))
  const minTri = Math.min(0, ...plotted.map(entry => entry.y))
  const slopeRange = maxSlope - minSlope
  const triRange = maxTri - minTri
  const normalizedLabel = normalization === 'minmax' ? 'min–max' : 'z-score'
  const slopeUnit = normalization === 'raw' ? '°' : normalizedLabel
  const triUnit = normalization === 'raw' ? 'm' : normalizedLabel
  return (
    <div className="science-benchmark-clusters">
      <div className="science-select-pair">
        <label className="science-select">
          <span>Clusters</span>
          <select value={count} onChange={event => setCount(Number(event.target.value))}>
            {[2, 3, 4, 5, 6].map(option => <option key={option}>{option}</option>)}
          </select>
        </label>
        <label className="science-select">
          <span>Clustering normalization</span>
          <select value={normalization} onChange={event => setNormalization(event.target.value as Normalization)}>
            <option value="zscore">Z-score</option><option value="minmax">Min–max</option><option value="raw">Raw display</option>
          </select>
        </label>
      </div>
      <p className="science-chart-axis">Catalogued ruggedness ({triUnit})</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="science-plot science-cluster-plot" role="group" aria-label="Original benchmark slope and ruggedness scatter plot">
        {[0, .25, .5, .75, 1].map(tick => {
          const y = bottom - tick * (bottom - top)
          const x = left + tick * (right - left)
          return <g key={tick}>
            <line x1={left} x2={right} y1={y} y2={y} />
            <text x={left - 5} y={y + 3} textAnchor="end">{number.format(minTri + tick * triRange)}</text>
            <text x={x} y={bottom + 14} textAnchor="middle">{number.format(minSlope + tick * slopeRange)}</text>
          </g>
        })}
        {plotted.map(({ point, x, y }) => (
          <circle key={point.id}
            cx={left + (x - minSlope) / slopeRange * (right - left)}
            cy={bottom - (y - minTri) / triRange * (bottom - top)}
            r={point.id === active?.id ? 6 : 4.4}
            className={point.id === active?.id ? 'is-active' : undefined}
            fill={clusterColors[(point.clusterId - 1) % clusterColors.length]}
            role="button" tabIndex={0} aria-label={`${point.name}, cluster ${point.clusterId}`} aria-pressed={point.id === active?.id}
            onFocus={() => setPointId(point.id)} onPointerEnter={() => setPointId(point.id)} onClick={() => setPointId(point.id)}
            onKeyDown={event => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                setPointId(point.id)
              }
            }} />
        ))}
      </svg>
      <p className="science-chart-axis science-chart-cursor-label">Mean surface slope ({slopeUnit})</p>
      {active && <p className="science-figure-stat">{active.shortName} · {active.clusterLabel}<br />{number.format(active.meanSlopeDeg)}° · {number.format(active.triMeanM)} m ruggedness</p>}
      <p className="science-subtle">{result.points.length} eligible benchmarks · {result.k} clusters · {result.clusteringMethod}. {normalization === 'raw' ? 'Raw axes show the catalogue values. The project fits clusters in standardized coordinates.' : 'The selected normalization applies to the axes and cluster fitting.'}</p>
    </div>
  )
}
