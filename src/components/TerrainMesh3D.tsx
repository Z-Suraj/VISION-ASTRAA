import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Layers, RotateCcw } from 'lucide-react';
import type { TerrainGridStats } from '../types/astraa.ts';

interface TerrainMesh3DProps {
  stats: TerrainGridStats;
  title: string;
  colorMode?: 'elevation' | 'slope';
  heightClass?: string;
}

function elevationColor(t: number): THREE.Color {
  // Scientific Viridis-inspired hypsometric ramp: deep indigo -> cyan -> emerald -> amber -> peak coral
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
  return new THREE.Color(
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac
  );
}

function slopeColor(deg: number): THREE.Color {
  const t = Math.max(0, Math.min(1, deg / 45));
  return new THREE.Color().setHSL(0.55 - t * 0.52, 0.85, 0.48);
}

export default function TerrainMesh3D({
  stats,
  title,
  colorMode: initialColorMode = 'elevation',
  heightClass = 'h-[340px]',
}: TerrainMesh3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [colorMode, setColorMode] = useState<'elevation' | 'slope'>(initialColorMode);
  const [wireframe, setWireframe] = useState(false);
  const [exaggeration, setExaggeration] = useState(1.25);

  const resetCamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container || stats.previewGrid.length === 0) return;

    let isSoftwareGl = false;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const gpu = gl ? String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)) : '';
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
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    const w = container.clientWidth || 480;
    const h = container.clientHeight || 320;
    renderer.setSize(w, h);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
    camera.position.set(2.4, 1.9, 2.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.6;
    controls.maxDistance = 6.5;

    const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
    key.position.set(4, 6, 3);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0x7dd3fc, 0x0f172a, 0.75));

    const grid = stats.previewGrid;
    const sGrid = stats.slopeGrid;
    const rows = grid.length;
    const cols = grid[0].length;
    const minE = stats.elevationMinM;
    const relief = Math.max(1, stats.reliefM);

    const geo = new THREE.PlaneGeometry(2.8, 2.8, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const elev = grid[r][c];
        const norm = (elev - minE) / relief;
        posAttr.setY(idx, norm * 0.75 * exaggeration);
        const col =
          colorMode === 'slope'
            ? slopeColor(sGrid[r]?.[c] ?? 0)
            : elevationColor(norm);
        colors[idx * 3] = col.r;
        colors[idx * 3 + 1] = col.g;
        colors[idx * 3 + 2] = col.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.08,
      wireframe,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.28;
    scene.add(mesh);

    const gridHelper = new THREE.GridHelper(3.2, 16, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.32;
    scene.add(gridHelper);

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;

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

    controls.addEventListener('change', requestRender);
    resetCamRef.current = () => {
      camera.position.set(2.4, 1.9, 2.5);
      controls.target.set(0, 0, 0);
      requestRender();
    };

    const ro = new ResizeObserver(() => {
      if (!container || disposed) return;
      const nw = container.clientWidth || 480;
      const nh = container.clientHeight || 320;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
      requestRender();
    });
    ro.observe(container);

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      geo.dispose();
      mat.dispose();
      gridHelper.dispose();
      renderer.dispose();
    };
  }, [stats, colorMode, wireframe, exaggeration]);

  return (
    <div className={`relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#050916] ${heightClass}`}>
      <div ref={mountRef} className="h-full w-full" />

      {/* Top-Left Title */}
      <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-[#050916]/85 px-2.5 py-1.5 border border-slate-800/80">
        <div className="text-xs font-semibold text-slate-100">{title}</div>
        <div className="font-mono text-[11px] text-slate-400">
          {stats.rows}×{stats.cols} DEM · Relief {stats.reliefM} m · Mean Slope {stats.meanSlopeDeg}°
        </div>
      </div>

      {/* Right-side Elevation Scale Bar */}
      <div className="pointer-events-none absolute top-14 right-3 flex items-center gap-2 rounded-lg bg-[#050916]/85 px-2 py-2 border border-slate-800/80">
        <div
          className="h-24 w-2.5 rounded-full"
          style={{
            background:
              colorMode === 'slope'
                ? 'linear-gradient(to top, #0284c7, #22c55e, #eab308, #ef4444)'
                : 'linear-gradient(to top, #21368a, #0d94b8, #29c27a, #ebc730, #f55738)',
          }}
        />
        <div className="flex h-24 flex-col justify-between font-mono text-[10px] text-slate-300">
          <span>{colorMode === 'slope' ? '45°+' : `${stats.elevationMaxM} m`}</span>
          <span>{colorMode === 'slope' ? '22°' : `${Math.round(stats.elevationMeanM)} m`}</span>
          <span>{colorMode === 'slope' ? '0°' : `${stats.elevationMinM} m`}</span>
        </div>
      </div>

      {/* Bottom Compact Control Dock */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-slate-700/70 bg-[#080f24]/90 px-3 py-1.5 text-xs">
        <button
          type="button"
          onClick={() => setColorMode((m) => (m === 'elevation' ? 'slope' : 'elevation'))}
          className="rounded-md bg-slate-800/90 px-2 py-1 font-medium text-cyan-300 hover:bg-slate-700 whitespace-nowrap"
        >
          Mode: {colorMode === 'elevation' ? 'Elevation' : 'Slope'}
        </button>
        <button
          type="button"
          onClick={() => setWireframe((w) => !w)}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium whitespace-nowrap ${
            wireframe ? 'bg-cyan-500/20 text-cyan-300' : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          Mesh
        </button>
        <label className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-300 whitespace-nowrap">
          <span>Z-Scale</span>
          <input
            type="range"
            min="0.5"
            max="2.5"
            step="0.25"
            value={exaggeration}
            onChange={(e) => setExaggeration(Number(e.target.value))}
            className="w-16 accent-cyan-400"
          />
        </label>
        <button
          type="button"
          onClick={() => resetCamRef.current?.()}
          className="rounded-md p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Reset Terrain Camera"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
