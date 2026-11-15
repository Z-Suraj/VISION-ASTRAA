import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Maximize2, Minimize2, Pause, Play, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { AnalogSite, PlanetaryBody } from '../types/astraa.ts';

interface PlanetaryGlobe3DProps {
  body: PlanetaryBody;
  sites: AnalogSite[];
  selectedSiteId?: string | null;
  onSelectSite?: (site: AnalogSite) => void;
  heightClass?: string;
  compact?: boolean;
}

function detectSoftwareGl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

// Deterministic pseudo-noise for crisp procedural planetary textures
function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    const xi = Math.floor(x * freq);
    const yi = Math.floor(y * freq);
    const xf = x * freq - xi;
    const yf = y * freq - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash2(xi, yi, seed);
    const b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed);
    const d = hash2(xi + 1, yi + 1, seed);
    val += amp * (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v);
    freq *= 2.05;
    amp *= 0.5;
  }
  return val;
}

function createPlanetTextures(
  body: PlanetaryBody,
  maxAniso: number
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const w = 512;
  const h = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = w;
  colorCanvas.height = h;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext('2d')!;

  const cImg = cCtx.createImageData(w, h);
  const bImg = bCtx.createImageData(w, h);

  for (let y = 0; y < h; y++) {
    const lat = 0.5 - y / h; // -0.5 to 0.5
    const absLat = Math.abs(lat) * 2; // 0 equator, 1 pole
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 6.0;
      const v = (y / h) * 3.0;
      const idx = (y * w + x) * 4;

      if (body === 'Earth') {
        const n = fbm(u, v, 11, 5);
        const detail = fbm(u * 2.5, v * 2.5, 29, 3);
        const polar = absLat > 0.84 - n * 0.08;
        let r = 10;
        let g = 36;
        let b = 88;
        let elev = 40;

        if (polar) {
          r = 225;
          g = 236;
          b = 248;
          elev = 160;
        } else if (n > 0.51) {
          // Landmass
          const landFactor = Math.min(1, (n - 0.51) / 0.35);
          const arid = detail > 0.48 && absLat < 0.55;
          if (arid) {
            r = Math.round(145 + landFactor * 65);
            g = Math.round(118 + landFactor * 42);
            b = Math.round(78 + landFactor * 26);
          } else {
            r = Math.round(42 + landFactor * 88);
            g = Math.round(86 + landFactor * 62);
            b = Math.round(52 + landFactor * 36);
          }
          elev = Math.round(120 + landFactor * 130);
        } else {
          // Ocean bathymetry
          const depth = n / 0.51;
          r = Math.round(8 + depth * 18);
          g = Math.round(28 + depth * 54);
          b = Math.round(74 + depth * 82);
          elev = Math.round(depth * 60);
        }

        cImg.data[idx] = r;
        cImg.data[idx + 1] = g;
        cImg.data[idx + 2] = b;
        cImg.data[idx + 3] = 255;

        bImg.data[idx] = elev;
        bImg.data[idx + 1] = elev;
        bImg.data[idx + 2] = elev;
        bImg.data[idx + 3] = 255;
      } else if (body === 'Mars') {
        const n = fbm(u * 1.15, v * 1.15, 43, 5);
        const fine = fbm(u * 3.8, v * 3.8, 71, 3);
        const polarCap = absLat > 0.89 - n * 0.05;
        let r = 178;
        let g = 86;
        let b = 46;
        let elev = Math.round(n * 210);

        if (polarCap) {
          r = 238;
          g = 228;
          b = 218;
          elev = 210;
        } else {
          const darkBasalt = n < 0.44 ? (0.44 - n) * 1.4 : 0;
          r = Math.round(188 - darkBasalt * 85 + fine * 38);
          g = Math.round(92 - darkBasalt * 42 + fine * 24);
          b = Math.round(48 - darkBasalt * 18 + fine * 14);
        }

        cImg.data[idx] = Math.max(0, Math.min(255, r));
        cImg.data[idx + 1] = Math.max(0, Math.min(255, g));
        cImg.data[idx + 2] = Math.max(0, Math.min(255, b));
        cImg.data[idx + 3] = 255;

        bImg.data[idx] = elev;
        bImg.data[idx + 1] = elev;
        bImg.data[idx + 2] = elev;
        bImg.data[idx + 3] = 255;
      } else {
        // Moon: Maria darks + highland regolith + craters
        const n = fbm(u * 1.3, v * 1.3, 91, 5);
        const micro = fbm(u * 5.0, v * 5.0, 107, 3);
        const mare = n < 0.46;
        const base = mare ? 72 + n * 70 : 128 + n * 85;
        const val = Math.max(25, Math.min(240, Math.round(base + (micro - 0.5) * 44)));
        const elev = Math.max(0, Math.min(255, Math.round(n * 195 + micro * 50)));

        cImg.data[idx] = val;
        cImg.data[idx + 1] = val;
        cImg.data[idx + 2] = Math.min(255, val + 4);
        cImg.data[idx + 3] = 255;

        bImg.data[idx] = elev;
        bImg.data[idx + 1] = elev;
        bImg.data[idx + 2] = elev;
        bImg.data[idx + 3] = 255;
      }
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  // Add subtle crater rings for Moon and Mars
  if (body !== 'Earth') {
    const count = body === 'Moon' ? 58 : 26;
    for (let i = 0; i < count; i++) {
      const cx = hash2(i, 1, 13) * w;
      const cy = (0.12 + hash2(i, 2, 17) * 0.76) * h;
      const rad = 3 + hash2(i, 3, 23) * (body === 'Moon' ? 14 : 10);
      cCtx.strokeStyle =
        body === 'Moon' ? 'rgba(220, 226, 235, 0.25)' : 'rgba(235, 160, 115, 0.2)';
      cCtx.lineWidth = 1.2;
      cCtx.beginPath();
      cCtx.arc(cx, cy, rad, 0, Math.PI * 2);
      cCtx.stroke();

      cCtx.fillStyle =
        body === 'Moon' ? 'rgba(30, 34, 42, 0.28)' : 'rgba(95, 38, 22, 0.22)';
      cCtx.beginPath();
      cCtx.arc(cx, cy, rad * 0.85, 0, Math.PI * 2);
      cCtx.fill();

      bCtx.strokeStyle = 'rgba(255,255,255,0.45)';
      bCtx.lineWidth = 1.5;
      bCtx.beginPath();
      bCtx.arc(cx, cy, rad, 0, Math.PI * 2);
      bCtx.stroke();
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

function latLonToVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

export default function PlanetaryGlobe3D({
  body,
  sites,
  selectedSiteId,
  onSelectSite,
  heightClass = 'h-[420px]',
  compact = false,
}: PlanetaryGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;

  const sitesRef = useRef(sites);
  sitesRef.current = sites;

  const bodyRef = useRef(body);
  bodyRef.current = body;

  const controlsApiRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
  } | null>(null);

  const sceneStateRef = useRef<{
    planetMesh: THREE.Mesh;
    atmoMesh: THREE.Mesh;
    markerGroup: THREE.Group;
    renderer: THREE.WebGLRenderer;
    textures: { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    requestRender: () => void;
  } | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    const width = container.clientWidth || 560;
    const height = container.clientHeight || 400;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.7, 3.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.9;
    controls.maxDistance = 6.2;

    // 3-point space lighting rig
    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.4);
    keyLight.position.set(5, 2.8, 4.2);
    scene.add(keyLight);

    const hemiLight = new THREE.HemisphereLight(0x60a5fa, 0x0b1224, 0.65);
    scene.add(hemiLight);

    const rimLight = new THREE.DirectionalLight(0x22d3ee, 0.85);
    rimLight.position.set(-4.5, -1.5, -3.5);
    scene.add(rimLight);

    // Subtle procedural starfield backdrop
    const starPositions = new Float32Array(450 * 3);
    for (let i = 0; i < 450; i++) {
      const r = 18 + Math.random() * 14;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.09,
      transparent: true,
      opacity: 0.72,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Planetary Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const sphereGeo = new THREE.SphereGeometry(1.15, 64, 48);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const initialTex = createPlanetTextures(bodyRef.current, maxAniso);

    const planetMat = new THREE.MeshStandardMaterial({
      map: initialTex.map,
      bumpMap: initialTex.bumpMap,
      bumpScale: 0.032,
      roughness: bodyRef.current === 'Earth' ? 0.58 : 0.86,
      metalness: 0.05,
    });
    const planetMesh = new THREE.Mesh(sphereGeo, planetMat);
    globeGroup.add(planetMesh);

    // Atmospheric halo rim
    const atmoGeo = new THREE.SphereGeometry(1.195, 48, 36);
    const atmoMat = new THREE.MeshBasicMaterial({
      color: bodyRef.current === 'Mars' ? 0xf97316 : bodyRef.current === 'Earth' ? 0x38bdf8 : 0x94a3b8,
      transparent: true,
      opacity: bodyRef.current === 'Moon' ? 0.05 : 0.14,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    globeGroup.add(atmoMesh);

    // Equator & orbital ring accent
    const ringGeo = new THREE.RingGeometry(1.42, 1.432, 96);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.24,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2 - 0.14;
    scene.add(ringMesh);

    // Clickable surface site markers attached to planetMesh so they rotate together
    const markerGroup = new THREE.Group();
    planetMesh.add(markerGroup);

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
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
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

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerGroup.children, false);
      if (hits.length > 0) {
        const site = hits[0].object.userData.site as AnalogSite | undefined;
        if (site) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredInfo(`${site.name} (${site.latitude.toFixed(2)}°, ${site.longitude.toFixed(2)}°)`);
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
      setHoveredInfo(null);
    };

    const onClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerGroup.children, false);
      if (hits.length > 0) {
        const site = hits[0].object.userData.site as AnalogSite | undefined;
        if (site && onSelectSiteRef.current) {
          onSelectSiteRef.current(site);
        }
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('click', onClick);

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 560;
      const h = container.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    controlsApiRef.current = {
      zoomIn: () => {
        camera.position.multiplyScalar(0.84);
        if (camera.position.length() < 1.9) camera.position.setLength(1.9);
        requestRender();
      },
      zoomOut: () => {
        camera.position.multiplyScalar(1.18);
        if (camera.position.length() > 6.2) camera.position.setLength(6.2);
        requestRender();
      },
      resetView: () => {
        camera.position.set(0, 0.7, 3.6);
        controls.target.set(0, 0, 0);
        controls.update();
        requestRender();
      },
    };

    sceneStateRef.current = {
      planetMesh,
      atmoMesh,
      markerGroup,
      renderer,
      textures: initialTex,
      camera,
      controls,
      requestRender,
    };

    // Continuous smooth rotation loop (respects software GL pacing!)
    let lastTime = performance.now();
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (autoRotateRef.current && !isSoftwareGl) {
        planetMesh.rotation.y += dt * 0.16;
      } else if (autoRotateRef.current && isSoftwareGl) {
        planetMesh.rotation.y += dt * 0.12;
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('click', onClick);
      controls.dispose();
      sphereGeo.dispose();
      planetMat.dispose();
      atmoGeo.dispose();
      atmoMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      if (sceneStateRef.current?.textures) {
        sceneStateRef.current.textures.map.dispose();
        sceneStateRef.current.textures.bumpMap.dispose();
      }
      renderer.dispose();
      sceneStateRef.current = null;
    };
  }, []);

  // Update texture and markers when body / sites / selectedSiteId changes
  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;

    const maxAniso = state.renderer.capabilities.getMaxAnisotropy();
    const nextTex = createPlanetTextures(body, maxAniso);
    const mat = state.planetMesh.material as THREE.MeshStandardMaterial;

    if (state.textures) {
      state.textures.map.dispose();
      state.textures.bumpMap.dispose();
    }
    state.textures = nextTex;
    mat.map = nextTex.map;
    mat.bumpMap = nextTex.bumpMap;
    mat.roughness = body === 'Earth' ? 0.56 : 0.88;
    mat.needsUpdate = true;

    const atmoMat = state.atmoMesh.material as THREE.MeshBasicMaterial;
    atmoMat.color.setHex(body === 'Mars' ? 0xf97316 : body === 'Earth' ? 0x38bdf8 : 0x94a3b8);
    atmoMat.opacity = body === 'Moon' ? 0.05 : 0.14;
    atmoMat.needsUpdate = true;

    // Rebuild surface markers for current planetary body
    while (state.markerGroup.children.length > 0) {
      const child = state.markerGroup.children[0] as THREE.Mesh;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      state.markerGroup.remove(child);
    }

    const bodySites = sites.filter((s) => s.body === body);
    bodySites.forEach((site) => {
      const pos = latLonToVec3(site.latitude, site.longitude, 1.18);
      const isSelected = site.id === selectedSiteId;
      const geo = new THREE.SphereGeometry(isSelected ? 0.044 : 0.028, 16, 12);
      const colorHex = isSelected
        ? 0x22d3ee
        : site.status === 'Established Reference'
          ? 0x34d399
          : site.status === 'Candidate Region'
            ? 0xf59e0b
            : 0x38bdf8;
      const mMat = new THREE.MeshBasicMaterial({ color: colorHex });
      const pin = new THREE.Mesh(geo, mMat);
      pin.position.copy(pos);
      pin.userData.site = site;
      state.markerGroup.add(pin);
    });

    state.requestRender();
  }, [body, sites, selectedSiteId]);

  const bodyMeta =
    body === 'Earth'
      ? { radius: '6,371 km', gravity: '9.81 m/s² (1.00 g)', datum: 'WGS84 / EGM96' }
      : body === 'Moon'
        ? { radius: '1,737.4 km', gravity: '1.62 m/s² (0.165 g)', datum: 'LOLA Reference Sphere' }
        : { radius: '3,389.5 km', gravity: '3.72 m/s² (0.38 g)', datum: 'MOLA Mars Aeroid' };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#050916] ${
        isExpanded ? 'fixed inset-4 z-50 h-auto' : heightClass
      }`}
    >
      {webglError ? (
        <div className="flex h-full w-full flex-col items-center justify-center p-6 text-center">
          <p className="text-sm font-medium text-slate-200">
            3D WebGL viewport unavailable in this browser context.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Switch to 2D GIS Map Explorer to inspect planetary coordinates.
          </p>
        </div>
      ) : (
        <div ref={mountRef} className="h-full w-full" />
      )}

      {/* Minimal Top-Left Body Telemetry Label (Non-Occluding) */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-0.5 rounded-lg bg-[#050916]/85 px-3 py-2 border border-slate-800/80">
        <span className="font-display text-xs font-semibold tracking-wide text-cyan-300">
          {body} 3D Reference Globe
        </span>
        {!compact && (
          <span className="font-mono text-[11px] text-slate-400">
            R = {bodyMeta.radius} · {bodyMeta.gravity} · {bodyMeta.datum}
          </span>
        )}
        {hoveredInfo && (
          <span className="font-mono text-[11px] text-emerald-300">{hoveredInfo}</span>
        )}
      </div>

      {/* Unified Bottom Control Dock (Zero Center Occlusion) */}
      <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-xl border border-slate-700/70 bg-[#080f24]/90 px-2.5 py-1.5">
        <button
          type="button"
          onClick={() => setAutoRotate((v) => !v)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
          title={autoRotate ? 'Pause Rotation' : 'Resume Rotation'}
        >
          {autoRotate ? <Pause className="h-3.5 w-3.5 text-cyan-400" /> : <Play className="h-3.5 w-3.5 text-cyan-400" />}
          {!compact && <span>{autoRotate ? 'Pause' : 'Rotate'}</span>}
        </button>
        <button
          type="button"
          onClick={() => controlsApiRef.current?.zoomIn()}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Zoom In"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => controlsApiRef.current?.zoomOut()}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Zoom Out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => controlsApiRef.current?.resetView()}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
          title="Reset Camera"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        {!compact && (
          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title={isExpanded ? 'Exit Fullscreen' : 'Expand 3D Globe'}
          >
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}
