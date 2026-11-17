import { OrbitControls } from '@react-three/drei'
import { Canvas, type ThreeEvent, useThree } from '@react-three/fiber'
import {
  Component, type ComponentRef, type KeyboardEvent, type ReactNode, type Ref,
  useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState,
} from 'react'
import { BufferAttribute, BufferGeometry, Color, MathUtils, Spherical, Vector3 } from 'three'
import { analyzeTerrain, loadDem, regions, type DemGrid, type Region } from '../science'
import './DigitalTwin.css'

type Planet = Region['planet']
type ColorMode = 'elevation' | 'slope' | 'ruggedness'
type CameraActions = {
  zoom: (factor: number) => void
  move: (horizontal: number, vertical: number, pan: boolean) => void
  reset: () => void
}

type Props = {
  regionId?: string
  onRegionChange?: (regionId: string) => void
  comparisonRegionId?: string
  compareByDefault?: boolean
}

const planets: Planet[] = ['Earth', 'Moon', 'Mars']
const modes: { value: ColorMode; label: string; unit: string }[] = [
  { value: 'elevation', label: 'Elevation', unit: 'm' },
  { value: 'slope', label: 'Slope', unit: '°' },
  { value: 'ruggedness', label: 'Riley TRI', unit: 'm' },
]
const palettes: Record<Planet | 'slope' | 'ruggedness', [string, string, string]> = {
  Earth: ['#17314b', '#579a8c', '#e9e4ce'],
  Moon: ['#24283a', '#747e91', '#e4e8f0'],
  Mars: ['#372335', '#b47155', '#f8d2aa'],
  slope: ['#213855', '#65a8ad', '#ffe2a2'],
  ruggedness: ['#262647', '#8c639c', '#ffbd87'],
}
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const format = (value: number) => Number.isFinite(value) ? numberFormat.format(value) : 'Unavailable'

const firstForPlanet = (planet: Planet) => regions.find(region => region.planet === planet)
const findRegion = (id?: string) => regions.find(region => region.id === id)

function RegionFields({
  region, onChange, label,
}: {
  region?: Region
  onChange: (id: string) => void
  label: string
}) {
  return (
    <fieldset className="twin-region">
      <legend>{label}</legend>
      <label>
        <span>World</span>
        <select
          value={region?.planet ?? ''}
          onChange={event => {
            const next = firstForPlanet(event.target.value as Planet)
            if (next) onChange(next.id)
          }}
        >
          {!region && <option value="">Choose a world</option>}
          {planets.map(planet => (
            <option key={planet} value={planet} disabled={!firstForPlanet(planet)}>{planet}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Region</span>
        <select value={region?.id ?? ''} onChange={event => onChange(event.target.value)}>
          {!region && <option value="">No regions available</option>}
          {regions.filter(item => item.planet === region?.planet).map(item => (
            <option value={item.id} key={item.id}>{item.name}</option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}

function TerrainCamera({ actionsRef }: { actionsRef: Ref<CameraActions> }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, invalidate } = useThree()

  useImperativeHandle(actionsRef, () => ({
    zoom(factor) {
      const orbit = controls.current
      if (!orbit) return
      const offset = camera.position.clone().sub(orbit.target)
      const distance = MathUtils.clamp(offset.length() * factor, orbit.minDistance, orbit.maxDistance)
      camera.position.copy(orbit.target).add(offset.setLength(distance))
      orbit.update()
      invalidate()
    },
    move(horizontal, vertical, pan) {
      const orbit = controls.current
      if (!orbit) return
      const offset = camera.position.clone().sub(orbit.target)
      if (pan) {
        const amount = offset.length() * 0.045
        const delta = new Vector3().setFromMatrixColumn(camera.matrix, 0).multiplyScalar(horizontal * amount)
        delta.add(new Vector3().setFromMatrixColumn(camera.matrix, 1).multiplyScalar(vertical * amount))
        camera.position.add(delta)
        orbit.target.add(delta)
      } else {
        const spherical = new Spherical().setFromVector3(offset)
        spherical.theta += horizontal * 0.14
        spherical.phi = MathUtils.clamp(spherical.phi - vertical * 0.14, orbit.minPolarAngle, orbit.maxPolarAngle)
        camera.position.copy(orbit.target).add(offset.setFromSpherical(spherical))
      }
      orbit.update()
      invalidate()
    },
    reset() {
      controls.current?.reset()
      invalidate()
    },
  }), [camera, invalidate])

  return <OrbitControls ref={controls} minDistance={2} maxDistance={40} maxPolarAngle={Math.PI * 0.54} />
}

type TerrainData = {
  grid: DemGrid
  slope: readonly number[]
  ruggedness: readonly number[]
  minimumElevation: number
  maximumElevation: number
  widthMeters: number
  lengthMeters: number
}

function prepareTerrain(grid: DemGrid): TerrainData {
  const { slope, ruggedness, minimum, maximum } = analyzeTerrain(grid)
  return {
    grid,
    slope,
    ruggedness,
    minimumElevation: minimum,
    maximumElevation: maximum,
    widthMeters: (grid.width - 1) * grid.cellSizeMeters,
    lengthMeters: (grid.height - 1) * grid.cellSizeMeters,
  }
}

function rangeForMode(data: TerrainData, mode: ColorMode): [number, number] {
  switch (mode) {
    case 'elevation':
      return [data.minimumElevation, data.maximumElevation]
    case 'slope':
      return [0, 90]
    case 'ruggedness': {
      let maximum = 0
      for (const value of data.ruggedness) {
        if (Number.isFinite(value)) maximum = Math.max(maximum, value)
      }
      return [0, maximum]
    }
  }
}

function TerrainMesh({
  data, mode, palette, colorRange, exaggeration, wireframe, point, setPoint,
}: {
  data: TerrainData
  mode: ColorMode
  palette: [string, string, string]
  colorRange: [number, number]
  exaggeration: number
  wireframe: boolean
  point: number | null
  setPoint: (index: number) => void
}) {
  const { width, height, cellSizeMeters, elevations } = data.grid
  const scale = 6 / Math.max(data.widthMeters, data.lengthMeters)
  const midElevation = (data.minimumElevation + data.maximumElevation) / 2
  const geometry = useMemo(() => {
    const mesh = new BufferGeometry()
    const positions = new Float32Array(width * height * 3)
    const indices: number[] = []
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const index = row * width + col
        const elevation = elevations[index]
        positions[3 * index] = (col - (width - 1) / 2) * cellSizeMeters * scale
        positions[3 * index + 1] = (elevation - midElevation) * scale
        positions[3 * index + 2] = (row - (height - 1) / 2) * cellSizeMeters * scale
        if (col === width - 1 || row === height - 1) continue
        const east = index + 1
        const south = index + width
        const southeast = south + 1
        indices.push(index, south, east, east, south, southeast)
      }
    }
    mesh.setAttribute('position', new BufferAttribute(positions, 3))
    mesh.setIndex(indices)
    mesh.computeVertexNormals()
    return mesh
  }, [width, height, elevations, cellSizeMeters, scale, midElevation])

  const colors = useMemo(() => {
    const values = mode === 'elevation' ? elevations : data[mode]
    const output = new Float32Array(width * height * 3)
    const [low, mid, high] = palette.map(color => new Color(color))
    const missing = new Color('#283244')
    const working = new Color()
    const [minimum, maximum] = colorRange
    for (let index = 0; index < values.length; index++) {
      const value = values[index]
      if (!Number.isFinite(value)) {
        working.copy(missing)
      } else {
        const position = MathUtils.clamp((value - minimum) / (maximum - minimum || 1), 0, 1)
        if (position < 0.5) working.copy(low).lerp(mid, position * 2)
        else working.copy(mid).lerp(high, position * 2 - 1)
      }
      output.set([working.r, working.g, working.b], index * 3)
    }
    return new BufferAttribute(output, 3)
  }, [mode, elevations, data, width, height, palette, colorRange])

  const positions = geometry.getAttribute('position')
  const invalidate = useThree(state => state.invalidate)
  useLayoutEffect(() => {
    geometry.setAttribute('color', colors)
    invalidate()
  }, [geometry, colors, invalidate])
  useEffect(() => () => geometry.dispose(), [geometry])

  function inspect(event: ThreeEvent<MouseEvent>) {
    if (!event.face || event.delta > 5) return
    event.stopPropagation()
    const hit = event.object.worldToLocal(event.point.clone())
    const vertices = [event.face.a, event.face.b, event.face.c]
    const position = new Vector3()
    const nearest = vertices.reduce((best, vertex) => {
      const distance = position.fromBufferAttribute(positions, vertex).distanceToSquared(hit)
      return distance < best.distance ? { distance, vertex } : best
    }, { distance: Infinity, vertex: event.face.a })
    setPoint(nearest.vertex)
  }

  return (
    <>
      <mesh geometry={geometry} scale={[1, exaggeration, 1]} onClick={inspect}>
        <meshStandardMaterial vertexColors wireframe={wireframe} roughness={0.95} />
      </mesh>
      {point !== null && (
        <mesh position={[positions.getX(point), positions.getY(point) * exaggeration + 0.04, positions.getZ(point)]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <meshBasicMaterial color="#fff2ae" />
        </mesh>
      )}
    </>
  )
}

class TerrainErrorBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onFailure()
  }
  render() {
    return this.state.failed
      ? <div className="twin-empty" role="status">3D rendering is unavailable on this device. The elevation data is still available from the linked source.</div>
      : this.props.children
  }
}

function TerrainPane({
  region, mode, exaggeration, wireframe,
}: {
  region?: Region
  mode: ColorMode
  exaggeration: number
  wireframe: boolean
}) {
  const [data, setData] = useState<TerrainData>()
  const [error, setError] = useState('')
  const [interactive, setInteractive] = useState(false)
  const [point, setPoint] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const camera = useRef<CameraActions>(null)
  const colorRange = useMemo(() => data ? rangeForMode(data, mode) : null, [data, mode])
  const palette = palettes[mode === 'elevation' ? (region?.planet ?? 'Earth') : mode]
  const unit = modes.find(item => item.value === mode)?.unit

  useEffect(() => {
    let current = true
    if (region?.demUrl) {
      loadDem(region).then(prepareTerrain).then(result => {
        if (current) setData(result)
      }).catch(() => {
        if (current) setError('The elevation grid could not be loaded.')
      })
    }
    return () => { current = false }
  }, [region, attempt])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !camera.current) return
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
    }
    const offset = offsets[event.key]
    if (event.altKey && offset && data) {
      event.preventDefault()
      const { width, height, elevations } = data.grid
      const start = point ?? Math.floor(height / 2) * width + Math.floor(width / 2)
      const col = MathUtils.clamp(start % width + offset[0], 0, width - 1)
      const row = MathUtils.clamp(Math.floor(start / width) - offset[1], 0, height - 1)
      if (Number.isFinite(elevations[row * width + col])) setPoint(row * width + col)
    } else if (offset) {
      event.preventDefault()
      camera.current.move(...offset, event.shiftKey)
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault()
      camera.current.zoom(0.79)
    } else if (event.key === '-') {
      event.preventDefault()
      camera.current.zoom(1.26)
    } else if (event.key.toLowerCase() === 'r') {
      camera.current.reset()
    }
  }

  return (
    <article className="twin-pane">
      <header className="twin-pane-head">
        <h3>{region?.name ?? 'No region selected'}</h3>
        {region && <span>{region.planet}</span>}
      </header>
      {!region?.demUrl && <div className="twin-empty" role="status">An observational elevation grid is unavailable for this benchmark.</div>}
      {region?.demUrl && !data && !error && <div className="twin-empty" role="status">Loading elevation grid…</div>}
      {error && (
        <div className="twin-empty" role="status">
          <p>{error}</p>
          <button type="button" onClick={() => { setError(''); setAttempt(value => value + 1) }}>Retry</button>
        </div>
      )}
      {data && colorRange && (
        <>
          <div
            className="twin-viewport" role="group" aria-label={`${region?.name} 3D terrain`}
            tabIndex={0} onKeyDown={onKeyDown}
            onWheelCapture={event => {
              if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
            }}
          >
            <TerrainErrorBoundary onFailure={() => setInteractive(false)}>
              <Canvas
                frameloop="demand"
                camera={{ position: [5.3, 4.6, 6.7], fov: 44, near: 0.04, far: 100 }}
                dpr={[1, 1.5]}
                fallback={<div className="twin-empty">WebGL is unavailable in this browser.</div>}
                onCreated={() => setInteractive(true)}
              >
                <ambientLight intensity={1.25} />
                <directionalLight position={[-3, 6, -4]} intensity={2.4} />
                <directionalLight position={[5, 3, 1]} intensity={0.35} />
                <TerrainMesh {...{ data, mode, palette, colorRange, exaggeration, wireframe, point, setPoint }} />
                <TerrainCamera actionsRef={camera} />
              </Canvas>
            </TerrainErrorBoundary>
            {interactive && (
              <div className="twin-camera" aria-label="Camera controls">
                <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => camera.current?.zoom(0.79)}>+</button>
                <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => camera.current?.zoom(1.26)}>−</button>
                <button type="button" aria-label="Reset camera" title="Reset camera" onClick={() => camera.current?.reset()}>↺</button>
              </div>
            )}
            <div className="twin-extent">{format(data.widthMeters / 1_000)} × {format(data.lengthMeters / 1_000)} km</div>
          </div>
          <div className="twin-legend" aria-label={`Color scale from ${format(colorRange[0])} to ${format(colorRange[1])} ${unit}`}>
            <span>{format(colorRange[0])} {unit}</span>
            <span className="twin-color-ramp" style={{ background: `linear-gradient(90deg, ${palette.join(', ')})` }} />
            <span>{format(colorRange[1])} {unit}</span>
          </div>
          {interactive && <div className="twin-inspection" aria-live="polite">
            {point === null ? 'Select a point on the terrain to inspect its measurements.' : (
              <dl>
                <div><dt>Grid sample</dt><dd>{Math.floor(point / data.grid.width) + 1}, {point % data.grid.width + 1}</dd></div>
                <div><dt>Elevation</dt><dd>{format(data.grid.elevations[point])} m</dd></div>
                <div><dt>Slope</dt><dd>{Number.isFinite(data.slope[point]) ? `${format(data.slope[point])}°` : 'Unavailable'}</dd></div>
                <div><dt>Riley TRI</dt><dd>{Number.isFinite(data.ruggedness[point]) ? `${format(data.ruggedness[point])} m` : 'Unavailable'}</dd></div>
              </dl>
            )}
          </div>}
        </>
      )}
      {region?.demUrl && (
        <div className="twin-provenance">
          <a href={region.sourceUrl} target="_blank" rel="noreferrer">{region.source} ↗</a>
          <span>{region.resolution}</span>
          <span>{region.datum}</span>
        </div>
      )}
    </article>
  )
}

export default function DigitalTwin({ regionId, onRegionChange, comparisonRegionId, compareByDefault = false }: Props) {
  const [selected, setSelected] = useState(regionId ?? firstForPlanet('Earth')?.id)
  const [second, setSecond] = useState(comparisonRegionId)
  const [compare, setCompare] = useState(compareByDefault)
  const [mode, setMode] = useState<ColorMode>('elevation')
  const [exaggeration, setExaggeration] = useState(3)
  const [wireframe, setWireframe] = useState(false)
  const region = findRegion(regionId) ?? findRegion(selected)
  const counterpart = findRegion(second) ?? regions.find(item => item.planet !== region?.planet)

  useEffect(() => {
    setSecond(comparisonRegionId)
  }, [comparisonRegionId])
  useEffect(() => {
    setCompare(compareByDefault)
  }, [compareByDefault])

  function changeRegion(id: string) {
    setSelected(id)
    onRegionChange?.(id)
  }

  return (
    <div className="digital-twin">
      <div className="twin-toolbar">
        <div className="twin-regions">
          <RegionFields label={compare ? 'Primary terrain' : 'Select terrain'} region={region} onChange={changeRegion} />
          {compare && <RegionFields label="Comparison terrain" region={counterpart} onChange={setSecond} />}
        </div>
        <div className="twin-visual">
          <label>
            <span>Surface color</span>
            <select value={mode} onChange={event => setMode(event.target.value as ColorMode)}>
              {modes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="twin-range">
            <span>Vertical exaggeration <output>{exaggeration.toFixed(2)}×</output></span>
            <input type="range" min="0.5" max="6" step="0.25" value={exaggeration} onChange={event => setExaggeration(Number(event.target.value))} />
          </label>
          <label className="twin-check"><input type="checkbox" checked={wireframe} onChange={event => setWireframe(event.target.checked)} /> Wireframe</label>
          <label className="twin-check"><input type="checkbox" checked={compare} onChange={event => setCompare(event.target.checked)} /> Side by side</label>
        </div>
      </div>
      <div className={compare ? 'twin-panes twin-panes--compare' : 'twin-panes'}>
        <TerrainPane region={region} {...{ mode, exaggeration, wireframe }} key={region?.id ?? 'primary-unavailable'} />
        {compare && <TerrainPane region={counterpart} {...{ mode, exaggeration, wireframe }} key={`compare-${counterpart?.id}`} />}
      </div>
      <p className="twin-instructions">Drag to orbit, right-drag or move two fingers to pan, and pinch or use Ctrl/⌘ + scroll to zoom. With the viewport focused, use arrow keys to orbit, Shift + arrows to pan, Alt + arrows to inspect, + or − to zoom, and R to reset.</p>
      {compare && <p className="twin-instructions">Each panel fits its own geographic extent and color scale. Elevations are relative to the datum listed for each terrain.</p>}
    </div>
  )
}
