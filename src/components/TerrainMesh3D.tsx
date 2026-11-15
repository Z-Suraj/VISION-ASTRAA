import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Grid, Layers, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { TerrainGridStats } from '../types/astraa.ts';
import { SLOPE_CATEGORY_COLORS } from './ScientificCharts.tsx';

interface TerrainMesh3DProps {
  stats: TerrainGridStats;
  title: string;
  subtitle?: string;
  isSyntheticCalibration?: boolean;
  colorMode?: 'elevation' | 'slope';
  onColorModeChange?: (mode: 'elevation' | 'slope') => void;
  wireframe?: boolean;
  onWireframeChange?: (wireframe: boolean) => void;
  exaggeration?: number;
  onExaggerationChange?: (zScale: number) => void;
  heightClass?: string;
}

const DEFAULT_CAMERA_POS = new THREE.Vector3(2.55, 2.05, 2.65);

function elevationColor(t: number, target: THREE.Color): THREE.Color {
  const stops: [number, number, number][] = [
    [0.13, 0.21, 0.54],
    [0.05, 0.58, 0.72],
    [0.16, 0.76, 0.48],
    [0.92, 0.78, 0.19],
    [0.96, 0.34, 0.22],
  ];
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = stops[idx];
  const b = stops[idx + 1];
  return target.setRGB(
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac
  );
}

function slopeColor(deg: number, target: THREE.Color): THREE.Color {
  const bucket =
    SLOPE_CATEGORY_COLORS.find((c) => deg >= c.min && deg < c.max) ??
    SLOPE_CATEGORY_COLORS[SLOPE_CATEGORY_COLORS.length - 1];
  return target.set(bucket.hex);
}

export default function TerrainMesh3D({
  stats,
  title,
  subtitle,
  isSyntheticCalibration = false,
  colorMode: controlledColorMode,
  onColorModeChange,
  wireframe: controlledWireframe,
  onWireframeChange,
  exaggeration: controlledExaggeration,
  onExaggerationChange,
  heightClass = 'h-[400px]',
}: TerrainMesh3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [localColorMode, setLocalColorMode] = useState<'elevation' | 'slope'>('elevation');
  const [localWireframe, setLocalWireframe] = useState<boolean>(false);
  const [localExaggeration, setLocalExaggeration] = useState<number>(1.25);
  const [showAxes, setShowAxes] = useState<boolean>(true);
  const [probe, setProbe] = useState<{
    row: number;
    col: number;
    elevationM: number;
    slopeDeg: number;
  } | null>(null);

  const colorMode = controlledColorMode ?? localColorMode;
  const wireframe = controlledWireframe ?? localWireframe;
  const exaggeration = controlledExaggeration ?? localExaggeration;

  const setColorMode = (next: 'elevation' | 'slope') => {
    if (onColorModeChange) onColorModeChange(next);
    else setLocalColorMode(next);
  };
  const setWireframe = (next: boolean) => {
    if (onWireframeChange) onWireframeChange(next);
    else setLocalWireframe(next);
  };
  const setExaggeration = (next: number) => {
    if (onExaggerationChange) onExaggerationChange(next);
    else setLocalExaggeration(next);
  };

  // Persistent scene object refs so prop/control changes NEVER destroy WebGL or reset camera
  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    terrainMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> | null;
    wireOverlay: THREE.LineSegments | null;
    axesGroup: THREE.Group;
    gridHelper: THREE.GridHelper;
    requestRender: () => void;
    zoomCamera: (factor: number) => void;
    resetCamera: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  const latestStatsRef = useRef(stats);
  latestStatsRef.current = stats;

  // 1. Initialize WebGLRenderer, Scene, RoomEnvironment, OrbitControls ONCE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let isSoftwareGl = false;
    try {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const gpu = gl
        ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER))
        : '';
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      isSoftwareGl = !gl || /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      isSoftwareGl = true;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    const w = Math.max(container.clientWidth, 320);
    const h = Math.max(container.clientHeight, 260);
    renderer.setSize(w, h, false);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.copy(DEFAULT_CAMERA_POS);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.minDistance = 1.65;
    controls.maxDistance = 7.5;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.9);
    keyLight.position.set(4.5, 6.5, 3.5);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-4, 3, -4);
    scene.add(rimLight);

    scene.add(new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.72));

    const gridHelper = new THREE.GridHelper(3.2, 16, 0x334155, 0x0f172a);
    gridHelper.position.y = -0.35;
    scene.add(gridHelper);

    const axesGroup = new THREE.Group();
    const axesHelper = new THREE.AxesHelper(0.65);
    axesHelper.position.set(-1.55, -0.34, 1.55);
    axesGroup.add(axesHelper);
    scene.add(axesGroup);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

    let animCamPosTarget: THREE.Vector3 | null = null;
    let animLookTarget: THREE.Vector3 | null = null;
    const _v = new THREE.Vector3();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    };

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;

        if (animCamPosTarget && animLookTarget) {
          if (isSoftwareGl) {
            camera.position.copy(animCamPosTarget);
            controls.target.copy(animLookTarget);
            animCamPosTarget = null;
            animLookTarget = null;
          } else {
            camera.position.lerp(animCamPosTarget, 0.16);
            controls.target.lerp(animLookTarget, 0.16);
            if (
              camera.position.distanceTo(animCamPosTarget) < 0.015 &&
              controls.target.distanceTo(animLookTarget) < 0.015
            ) {
              camera.position.copy(animCamPosTarget);
              controls.target.copy(animLookTarget);
              animCamPosTarget = null;
              animLookTarget = null;
            } else {
              renderDirty = true;
            }
          }
        }

        controls.update();
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const cancelCameraAnim = () => {
      animCamPosTarget = null;
      animLookTarget = null;
    };

    controls.addEventListener('start', cancelCameraAnim);
    controls.addEventListener('change', requestRender);

    // Raycast hover probe on terrain surface
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let lastProbeAt = 0;

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastProbeAt < 32) return;
      lastProbeAt = now;

      const refs = sceneRefs.current;
      if (!refs?.terrainMesh) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObject(refs.terrainMesh, false);
      if (hits.length === 0) {
        setProbe(null);
        return;
      }

      const pt = hits[0].point;
      const curStats = latestStatsRef.current;
      const rows = curStats.previewGrid.length;
      const cols = rows > 0 ? curStats.previewGrid[0].length : 0;
      if (rows === 0 || cols === 0) return;

      const u = THREE.MathUtils.clamp((pt.x + 1.4) / 2.8, 0, 1);
      const v = THREE.MathUtils.clamp((pt.z + 1.4) / 2.8, 0, 1);
      const c = Math.min(cols - 1, Math.round(u * (cols - 1)));
      const r = Math.min(rows - 1, Math.round(v * (rows - 1)));

      setProbe({
        row: r,
        col: c,
        elevationM: curStats.previewGrid[r]?.[c] ?? curStats.elevationMeanM,
        slopeDeg: curStats.slopeGrid[r]?.[c] ?? curStats.meanSlopeDeg,
      });
    };

    const handlePointerLeave = () => setProbe(null);

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    const ro = new ResizeObserver(() => {
      if (!container || disposed) return;
      const nw = Math.max(container.clientWidth, 240);
      const nh = Math.max(container.clientHeight, 220);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh, false);
      requestRender();
    });
    ro.observe(container);

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      controls,
      terrainMesh: null,
      wireOverlay: null,
      axesGroup,
      gridHelper,
      requestRender,
      zoomCamera: (factor: number) => {
        cancelCameraAnim();
        _v.copy(camera.position).sub(controls.target);
        const newLen = THREE.MathUtils.clamp(
          _v.length() * factor,
          controls.minDistance,
          controls.maxDistance
        );
        _v.setLength(newLen);
        camera.position.copy(controls.target).add(_v);
        requestRender();
      },
      resetCamera: () => {
        animCamPosTarget = DEFAULT_CAMERA_POS.clone();
        animLookTarget = new THREE.Vector3(0, 0, 0);
        requestRender();
      },
      isSoftwareGl,
    };

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('start', cancelCameraAnim);
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      controls.dispose();
      if (sceneRefs.current?.terrainMesh) {
        sceneRefs.current.terrainMesh.geometry.dispose();
        sceneRefs.current.terrainMesh.material.dispose();
      }
      if (sceneRefs.current?.wireOverlay) {
        sceneRefs.current.wireOverlay.geometry.dispose();
        (sceneRefs.current.wireOverlay.material as THREE.Material).dispose();
      }
      gridHelper.dispose();
      axesHelper.dispose();
      envTarget.dispose();
      renderer.dispose();
      sceneRefs.current = null;
    };
  }, []);

  // 2. Rebuild / Update Terrain Mesh Geometry ONLY when stats, colorMode, wireframe, or exaggeration change
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || stats.previewGrid.length === 0) return;

    const { scene, requestRender } = refs;
    const grid = stats.previewGrid;
    const sGrid = stats.slopeGrid;
    const rows = grid.length;
    const cols = grid[0].length;
    const minE = stats.elevationMinM;
    const relief = Math.max(1, stats.reliefM);

    // Cleanly dispose previous terrain mesh if grid dimensions changed or rebuild in place
    if (refs.terrainMesh) {
      scene.remove(refs.terrainMesh);
      refs.terrainMesh.geometry.dispose();
      refs.terrainMesh.material.dispose();
      refs.terrainMesh = null;
    }
    if (refs.wireOverlay) {
      scene.remove(refs.wireOverlay);
      refs.wireOverlay.geometry.dispose();
      (refs.wireOverlay.material as THREE.Material).dispose();
      refs.wireOverlay = null;
    }

    const geo = new THREE.PlaneGeometry(2.8, 2.8, Math.max(1, cols - 1), Math.max(1, rows - 1));
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    const tmpCol = new THREE.Color();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const elev = grid[r][c];
        const norm = (elev - minE) / relief;
        posAttr.setY(idx, norm * 0.72 * exaggeration);
        if (colorMode === 'slope') {
          slopeColor(sGrid[r]?.[c] ?? 0, tmpCol);
        } else {
          elevationColor(norm, tmpCol);
        }
        colors[idx * 3] = tmpCol.r;
        colors[idx * 3 + 1] = tmpCol.g;
        colors[idx * 3 + 2] = tmpCol.b;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.76,
      metalness: 0.06,
      wireframe: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    const baseOffsetY = -0.34;
    mesh.position.y = baseOffsetY;
    scene.add(mesh);
    refs.terrainMesh = mesh;

    // Optional crisp contour/mesh wireframe overlay on top of solid shaded terrain
    if (wireframe) {
      const wireGeo = new THREE.WireframeGeometry(geo);
      const wireMat = new THREE.LineBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.34,
      });
      const wireLines = new THREE.LineSegments(wireGeo, wireMat);
      wireLines.position.y = baseOffsetY + 0.002;
      scene.add(wireLines);
      refs.wireOverlay = wireLines;
    }

    refs.axesGroup.visible = showAxes;
    refs.gridHelper.visible = showAxes;

    requestRender();
  }, [stats, colorMode, wireframe, exaggeration, showAxes]);

  return (
    <div className="rounded-xl border border-slate-800/90 bg-[#050916] overflow-hidden flex flex-col">
      {/* Top Info & Calibration Bar (Outside WebGL Viewport so it never overlaps 3D terrain) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 bg-[#080f23] px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-display text-sm font-semibold text-white">{title}</h3>
            {isSyntheticCalibration && (
              <span className="rounded border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-amber-200 whitespace-nowrap">
                Synthetic Calibration Grid
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-400 tabular-nums">
            {subtitle ? `${subtitle} · ` : ''}
            {stats.rows} × {stats.cols} DEM · Relief: {stats.reliefM} m · Mean Slope: {stats.meanSlopeDeg}°
          </div>
        </div>

        {/* Live Cursor Probe */}
        <div className="rounded-lg border border-slate-800 bg-[#050916] px-2.5 py-1 font-mono text-[11px] tabular-nums">
          {probe ? (
            <span className="text-cyan-300">
              [{probe.row},{probe.col}] Elev {probe.elevationM.toFixed(1)} m · Slope {probe.slopeDeg.toFixed(1)}°
            </span>
          ) : (
            <span className="text-slate-500">Drag to orbit · Scroll/pinch to zoom · Hover DEM to probe</span>
          )}
        </div>
      </div>

      {/* Unobstructed 3D WebGL Viewport */}
      <div className={`relative w-full bg-[#040814] ${heightClass}`}>
        <div ref={mountRef} className="h-full w-full cursor-grab active:cursor-grabbing" />

        {/* Right-Side Calibrated Color Scale Bar */}
        <div className="pointer-events-none absolute top-3 right-3 flex items-center gap-2 rounded-lg border border-slate-800 bg-[#050916]/90 px-2.5 py-2">
          <div
            className="h-28 w-2.5 rounded-sm"
            style={{
              background:
                colorMode === 'slope'
                  ? 'linear-gradient(to top, #0284c7, #06b6d4, #10b981, #eab308, #f97316, #ef4444)'
                  : 'linear-gradient(to top, #21368a, #0d94b8, #29c27a, #ebc730, #f55738)',
            }}
          />
          <div className="flex h-28 flex-col justify-between font-mono text-[10px] text-slate-300 tabular-nums">
            <span>{colorMode === 'slope' ? '45°+' : `${stats.elevationMaxM} m`}</span>
            <span>{colorMode === 'slope' ? '22°' : `${Math.round(stats.elevationMeanM)} m`}</span>
            <span>{colorMode === 'slope' ? '0°' : `${stats.elevationMinM} m`}</span>
          </div>
        </div>

        {/* Bottom-Left Subtle Axis Orientation Legend */}
        {showAxes && (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-slate-800/80 bg-[#050916]/90 px-2.5 py-1 font-mono text-[10px] text-slate-400">
            Axes: <span className="text-rose-400">X East</span> · <span className="text-emerald-400">Y Elev ({exaggeration.toFixed(2)}×)</span> · <span className="text-sky-400">Z South</span>
          </div>
        )}
      </div>

      {/* Clean Bottom Control Strip (Never overlaps the 3D terrain) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 bg-[#080f23] px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Color Mode */}
          <div className="inline-flex rounded-lg border border-slate-800 bg-[#050916] p-0.5">
            <button
              type="button"
              onClick={() => setColorMode('elevation')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                colorMode === 'elevation'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Elevation
            </button>
            <button
              type="button"
              onClick={() => setColorMode('slope')}
              className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                colorMode === 'slope'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Horn Slope
            </button>
          </div>

          {/* Wireframe Mesh Toggle */}
          <button
            type="button"
            onClick={() => setWireframe(!wireframe)}
            aria-pressed={wireframe}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              wireframe
                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-800 bg-[#050916] text-slate-300 hover:border-slate-700'
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Mesh Overlay
          </button>

          {/* Axes & Grid Toggle */}
          <button
            type="button"
            onClick={() => setShowAxes((a) => !a)}
            aria-pressed={showAxes}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
              showAxes
                ? 'border-slate-700 bg-slate-800/80 text-slate-200'
                : 'border-slate-800 bg-[#050916] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            Axes
          </button>
        </div>

        {/* Z-Scale + Camera Zoom / Reset */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="font-mono text-slate-400">Z-Scale</span>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.25"
              value={exaggeration}
              onChange={(e) => setExaggeration(Number(e.target.value))}
              className="w-20 accent-cyan-400"
            />
            <span className="w-9 font-mono text-[11px] text-cyan-300 tabular-nums">
              {exaggeration.toFixed(2)}×
            </span>
          </label>

          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#050916] p-0.5">
            <button
              type="button"
              onClick={() => sceneRefs.current?.zoomCamera(0.82)}
              title="Zoom in 3D terrain"
              aria-label="Zoom in 3D terrain"
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => sceneRefs.current?.zoomCamera(1.22)}
              title="Zoom out 3D terrain"
              aria-label="Zoom out 3D terrain"
              className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => sceneRefs.current?.resetCamera()}
              title="Reset 3D camera position"
              aria-label="Reset 3D camera position"
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-cyan-300 hover:bg-slate-800"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
