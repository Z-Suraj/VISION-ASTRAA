import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Cloud,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AnalogSite, PlanetaryBody } from '../types/astraa.ts';

interface PlanetaryGlobe3DProps {
  body: PlanetaryBody;
  sites: AnalogSite[];
  selectedSiteId?: string | null;
  onSelectSite?: (site: AnalogSite) => void;
  heightClass?: string;
  compact?: boolean;
  focusOnSelect?: boolean;
}

const GLOBE_RADIUS = 1.18;
const DEFAULT_CAM_LAT = 22;
const DEFAULT_CAM_LON = 52;
const DEFAULT_CAM_DIST = 3.35;
const SUN_DIRECTION = new THREE.Vector3(0.76, 0.34, -0.55).normalize();

// Pre-allocated scratch math helpers (zero GC inside tick loop)
const _camGoal = new THREE.Vector3();
const _worldPos = new THREE.Vector3();
const _camDir = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
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

function latLonToVec3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = radius * Math.sin(phi) * Math.sin(theta);
  const y = radius * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
}

// Deterministic pseudo-noise for Mars fallback texture
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

function createMarsTextures(maxAniso: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
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
    const absLat = Math.abs(0.5 - y / h) * 2;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 6.0;
      const v = (y / h) * 3.0;
      const idx = (y * w + x) * 4;

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
    }
  }

  cCtx.putImageData(cImg, 0, 0);
  bCtx.putImageData(bImg, 0, 0);

  for (let i = 0; i < 28; i++) {
    const cx = hash2(i, 1, 13) * w;
    const cy = (0.12 + hash2(i, 2, 17) * 0.76) * h;
    const rad = 3 + hash2(i, 3, 23) * 10;
    cCtx.strokeStyle = 'rgba(235, 160, 115, 0.2)';
    cCtx.lineWidth = 1.2;
    cCtx.beginPath();
    cCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    cCtx.stroke();

    cCtx.fillStyle = 'rgba(95, 38, 22, 0.22)';
    cCtx.beginPath();
    cCtx.arc(cx, cy, rad * 0.85, 0, Math.PI * 2);
    cCtx.fill();

    bCtx.strokeStyle = 'rgba(255,255,255,0.45)';
    bCtx.lineWidth = 1.5;
    bCtx.beginPath();
    bCtx.arc(cx, cy, rad, 0, Math.PI * 2);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAniso;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.anisotropy = maxAniso;

  return { map, bumpMap };
}

function createInnerAtmosphereShader(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uGlowColor: { value: new THREE.Color(0x4cc9ff) },
      uDayBoost: { value: 0.92 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uGlowColor;
      uniform float uDayBoost;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPosition);
        float fresnel = pow(1.0 - clamp(dot(V, N), 0.0, 1.0), 3.3);
        float sunLit = smoothstep(-0.35, 0.55, dot(N, normalize(uSunDir)));
        float intensity = fresnel * (0.14 + 0.86 * sunLit) * uDayBoost;
        gl_FragColor = vec4(uGlowColor, clamp(intensity, 0.0, 0.72));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
    depthWrite: false,
  });
}

function createOuterAtmosphereShader(sunDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: sunDir.clone() },
      uHaloColor: { value: new THREE.Color(0x2d8cff) },
      uIntensity: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uHaloColor;
      uniform float uIntensity;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;
      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPosition);
        float horizonDot = max(0.0, dot(V, -N));
        float rim = pow(smoothstep(0.0, 0.42, horizonDot), 1.85);
        float sunTerm = smoothstep(-0.42, 0.52, dot(N, normalize(uSunDir)));
        float alpha = rim * (0.14 + 0.86 * sunTerm) * uIntensity;
        gl_FragColor = vec4(uHaloColor, clamp(alpha, 0.0, 0.62));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

export default function PlanetaryGlobe3D({
  body,
  sites,
  selectedSiteId,
  onSelectSite,
  heightClass = 'h-[480px]',
  compact = false,
  focusOnSelect = true,
}: PlanetaryGlobe3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showClouds, setShowClouds] = useState(true);
  const [showNightLights, setShowNightLights] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<string | null>(null);
  const [webglError, setWebglError] = useState(false);
  const [texturesReady, setTexturesReady] = useState(body !== 'Earth');

  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const showCloudsRef = useRef(showClouds);
  showCloudsRef.current = showClouds;

  const showNightLightsRef = useRef(showNightLights);
  showNightLightsRef.current = showNightLights;

  const onSelectSiteRef = useRef(onSelectSite);
  onSelectSiteRef.current = onSelectSite;

  const bodyRef = useRef(body);
  bodyRef.current = body;

  const focusOnSelectRef = useRef(focusOnSelect);
  focusOnSelectRef.current = focusOnSelect;

  const controlsApiRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    resetView: () => void;
    flyToLatLon: (lat: number, lon: number, dist?: number) => void;
  } | null>(null);

  const sceneStateRef = useRef<{
    planetMesh: THREE.Mesh;
    cloudMesh: THREE.Mesh;
    innerAtmoMesh: THREE.Mesh;
    outerAtmoMesh: THREE.Mesh;
    markerGroup: THREE.Group;
    markerMeshes: THREE.Object3D[];
    earthMaterial: THREE.MeshPhysicalMaterial;
    otherMaterial: THREE.MeshStandardMaterial;
    renderer: THREE.WebGLRenderer;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    requestRender: () => void;
    syncBodyVisuals: (nextBody: PlanetaryBody) => void;
    syncLayerVisibility: () => void;
  } | null>(null);

  // One-time WebGL scene mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    const isMobile =
      /iPhone|iPad|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x030612, 1);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 460;
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.25;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 140);
    const initialCamPos = latLonToVec3(DEFAULT_CAM_LAT, DEFAULT_CAM_LON, DEFAULT_CAM_DIST);
    camera.position.copy(initialCamPos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.055;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 1.62;
    controls.maxDistance = 5.8;

    // Realistic solar key light + subtle cold deep-space fill + rim
    const sunLight = new THREE.DirectionalLight(0xfff8ed, 3.15);
    sunLight.position.copy(SUN_DIRECTION).multiplyScalar(12);
    scene.add(sunLight);

    const spaceHemi = new THREE.HemisphereLight(0x5ea9ff, 0x050914, 0.34);
    scene.add(spaceHemi);

    const rimFill = new THREE.DirectionalLight(0x1e40af, 0.38);
    rimFill.position.copy(SUN_DIRECTION).multiplyScalar(-8);
    scene.add(rimFill);

    // Dual-depth subtle starfield
    const starCount = 1100;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const cTemp = new THREE.Color();
    for (let i = 0; i < starCount; i++) {
      const r = 24 + hash2(i, 1, 7) * 38;
      const theta = hash2(i, 2, 19) * Math.PI * 2;
      const phi = Math.acos(2 * hash2(i, 3, 31) - 1);
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPos[i * 3 + 2] = r * Math.cos(phi);

      const tint = hash2(i, 4, 43);
      if (tint > 0.82) cTemp.setHex(0xbfdbfe);
      else if (tint < 0.16) cTemp.setHex(0xfde68a);
      else cTemp.setHex(0xe2e8f0);
      const brightness = 0.55 + hash2(i, 5, 59) * 0.45;
      starColors[i * 3] = cTemp.r * brightness;
      starColors[i * 3 + 1] = cTemp.g * brightness;
      starColors[i * 3 + 2] = cTemp.b * brightness;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Globe assembly
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const sphereSegW = isMobile || isSoftwareGl ? 64 : 96;
    const sphereSegH = isMobile || isSoftwareGl ? 48 : 64;
    const planetGeo = new THREE.SphereGeometry(GLOBE_RADIUS, sphereSegW, sphereSegH);
    const cloudGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.013, sphereSegW, sphereSegH);
    const innerAtmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.007, 64, 48);
    const outerAtmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.058, 64, 48);

    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const disposableTextures: THREE.Texture[] = [];

    // Load authentic NASA Blue Marble, Black Marble, Normal, Specular & Cloud textures
    const loader = new THREE.TextureLoader();
    const resTag = isMobile || isSoftwareGl ? '2048' : '4096';

    const earthShaderUniforms = {
      uSunDir: { value: SUN_DIRECTION.clone() },
      uNightEnabled: { value: 1.0 },
    };

    const earthMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0xffffff),
      roughness: 0.82,
      metalness: 0.02,
      specularIntensity: 0.88,
      emissive: new THREE.Color(0xffdca8),
      emissiveIntensity: 1.45,
      normalScale: new THREE.Vector2(0.55, 0.55),
    });

    earthMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.uSunDir = earthShaderUniforms.uSunDir;
      shader.uniforms.uNightEnabled = earthShaderUniforms.uNightEnabled;
      earthMaterial.userData.shader = shader;

      shader.vertexShader =
        'varying vec3 vEarthWorldNormal;\n' +
        shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
           vEarthWorldNormal = normalize(mat3(modelMatrix) * normal);`
        );

      shader.fragmentShader =
        'uniform vec3 uSunDir;\nuniform float uNightEnabled;\nvarying vec3 vEarthWorldNormal;\n' +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
           float earthSunFacing = dot(normalize(vEarthWorldNormal), normalize(uSunDir));
           float nightSideMask = smoothstep(0.14, -0.24, earthSunFacing);
           totalEmissiveRadiance *= nightSideMask * uNightEnabled;`
        );
    };

    const cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      roughness: 0.96,
      metalness: 0.0,
      depthWrite: false,
    });

    const otherMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.04,
      bumpScale: 0.032,
    });

    let marsTextures: { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } | null = null;
    let moonTexture: THREE.Texture | null = null;

    const loadTex = (
      url: string,
      colorSpace: THREE.ColorSpace,
      onDone: (tex: THREE.Texture) => void
    ) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = colorSpace;
          tex.anisotropy = maxAniso;
          tex.wrapS = THREE.RepeatWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          disposableTextures.push(tex);
          onDone(tex);
        },
        undefined,
        () => {
          // Non-fatal fallback handled gracefully
        }
      );
    };

    let dayLoaded = false;
    loadTex(`/assets/textures/earth/earth_day_${resTag}.jpg`, THREE.SRGBColorSpace, (tex) => {
      earthMaterial.map = tex;
      earthMaterial.needsUpdate = true;
      dayLoaded = true;
      if (bodyRef.current === 'Earth') setTexturesReady(true);
      requestRender();
    });

    loadTex(`/assets/textures/earth/earth_night_${resTag}.jpg`, THREE.SRGBColorSpace, (tex) => {
      earthMaterial.emissiveMap = tex;
      earthMaterial.needsUpdate = true;
      requestRender();
    });

    loadTex('/assets/textures/earth/earth_normal_2048.jpg', THREE.NoColorSpace, (tex) => {
      earthMaterial.normalMap = tex;
      earthMaterial.needsUpdate = true;
      requestRender();
    });

    loadTex('/assets/textures/earth/earth_specular_2048.jpg', THREE.NoColorSpace, (tex) => {
      earthMaterial.specularIntensityMap = tex;
      earthMaterial.needsUpdate = true;
      requestRender();
    });

    loadTex('/assets/textures/earth/earth_clouds_1024.png', THREE.SRGBColorSpace, (tex) => {
      cloudMaterial.alphaMap = tex;
      cloudMaterial.needsUpdate = true;
      requestRender();
    });

    const planetMesh = new THREE.Mesh(
      planetGeo,
      bodyRef.current === 'Earth' ? earthMaterial : otherMaterial
    );
    globeGroup.add(planetMesh);

    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMaterial);
    cloudMesh.visible = bodyRef.current === 'Earth' && showCloudsRef.current;
    globeGroup.add(cloudMesh);

    const innerAtmoMat = createInnerAtmosphereShader(SUN_DIRECTION);
    const innerAtmoMesh = new THREE.Mesh(innerAtmoGeo, innerAtmoMat);
    globeGroup.add(innerAtmoMesh);

    const outerAtmoMat = createOuterAtmosphereShader(SUN_DIRECTION);
    const outerAtmoMesh = new THREE.Mesh(outerAtmoGeo, outerAtmoMat);
    globeGroup.add(outerAtmoMesh);

    // Interactive site markers parented to planetMesh so they stay locked to exact lat/lon
    const markerGroup = new THREE.Group();
    planetMesh.add(markerGroup);

    const syncBodyVisuals = (nextBody: PlanetaryBody) => {
      if (nextBody === 'Earth') {
        planetMesh.material = earthMaterial;
        cloudMesh.visible = showCloudsRef.current;
        innerAtmoMesh.visible = true;
        outerAtmoMesh.visible = true;
        innerAtmoMat.uniforms.uGlowColor.value.setHex(0x4cc9ff);
        innerAtmoMat.uniforms.uDayBoost.value = 0.92;
        outerAtmoMat.uniforms.uHaloColor.value.setHex(0x2d8cff);
        outerAtmoMat.uniforms.uIntensity.value = 0.72;
        setTexturesReady(dayLoaded);
      } else if (nextBody === 'Moon') {
        cloudMesh.visible = false;
        innerAtmoMesh.visible = false;
        outerAtmoMesh.visible = true;
        outerAtmoMat.uniforms.uHaloColor.value.setHex(0x94a3b8);
        outerAtmoMat.uniforms.uIntensity.value = 0.16;
        if (!moonTexture) {
          loadTex('/assets/textures/earth/moon_1024.jpg', THREE.SRGBColorSpace, (tex) => {
            moonTexture = tex;
            otherMaterial.map = tex;
            otherMaterial.bumpMap = tex;
            otherMaterial.bumpScale = 0.022;
            otherMaterial.roughness = 0.92;
            otherMaterial.needsUpdate = true;
            requestRender();
          });
        } else {
          otherMaterial.map = moonTexture;
          otherMaterial.bumpMap = moonTexture;
          otherMaterial.bumpScale = 0.022;
          otherMaterial.roughness = 0.92;
          otherMaterial.needsUpdate = true;
        }
        planetMesh.material = otherMaterial;
        setTexturesReady(true);
      } else {
        cloudMesh.visible = false;
        innerAtmoMesh.visible = true;
        outerAtmoMesh.visible = true;
        innerAtmoMat.uniforms.uGlowColor.value.setHex(0xf97316);
        innerAtmoMat.uniforms.uDayBoost.value = 0.45;
        outerAtmoMat.uniforms.uHaloColor.value.setHex(0xea580c);
        outerAtmoMat.uniforms.uIntensity.value = 0.34;
        if (!marsTextures) {
          marsTextures = createMarsTextures(maxAniso);
          disposableTextures.push(marsTextures.map, marsTextures.bumpMap);
        }
        otherMaterial.map = marsTextures.map;
        otherMaterial.bumpMap = marsTextures.bumpMap;
        otherMaterial.bumpScale = 0.032;
        otherMaterial.roughness = 0.88;
        otherMaterial.needsUpdate = true;
        planetMesh.material = otherMaterial;
        setTexturesReady(true);
      }
      requestRender();
    };

    const syncLayerVisibility = () => {
      cloudMesh.visible = bodyRef.current === 'Earth' && showCloudsRef.current;
      earthShaderUniforms.uNightEnabled.value = showNightLightsRef.current ? 1.0 : 0.0;
      if (earthMaterial.userData.shader) {
        earthMaterial.userData.shader.uniforms.uNightEnabled.value =
          earthShaderUniforms.uNightEnabled.value;
      }
      requestRender();
    };

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let userInteracting = false;
    let idleResumeTimer: number | null = null;
    let flyToActive = false;
    const flyToTargetPos = new THREE.Vector3();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
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

    const onControlStart = () => {
      userInteracting = true;
      flyToActive = false;
      if (idleResumeTimer !== null) {
        window.clearTimeout(idleResumeTimer);
        idleResumeTimer = null;
      }
    };

    const onControlEnd = () => {
      if (idleResumeTimer !== null) window.clearTimeout(idleResumeTimer);
      idleResumeTimer = window.setTimeout(() => {
        userInteracting = false;
      }, 3600);
    };

    controls.addEventListener('start', onControlStart);
    controls.addEventListener('end', onControlEnd);
    controls.addEventListener('change', requestRender);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };

    const getVisibleHit = (clientX: number, clientY: number): AnalogSite | null => {
      const state = sceneStateRef.current;
      if (!state || state.markerMeshes.length === 0) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(state.markerMeshes, false);
      if (hits.length === 0) return null;

      _camDir.copy(camera.position).normalize();
      for (const hit of hits) {
        hit.object.getWorldPosition(_worldPos);
        _worldPos.normalize();
        if (_worldPos.dot(_camDir) > -0.05) {
          const site = hit.object.userData.site as AnalogSite | undefined;
          if (site) return site;
        }
      }
      return null;
    };

    let lastHoverCheck = 0;
    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 35) return;
      lastHoverCheck = now;

      const site = getVisibleHit(e.clientX, e.clientY);
      if (site) {
        renderer.domElement.style.cursor = 'pointer';
        const latStr = `${Math.abs(site.latitude).toFixed(2)}°${site.latitude >= 0 ? 'N' : 'S'}`;
        const lonStr = `${Math.abs(site.longitude).toFixed(2)}°${site.longitude >= 0 ? 'E' : 'W'}`;
        setHoveredInfo(`${site.name} · ${latStr}, ${lonStr}`);
      } else {
        renderer.domElement.style.cursor = userInteracting ? 'grabbing' : 'grab';
        setHoveredInfo(null);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 36) return; // Ignore drag release

      const site = getVisibleHit(e.clientX, e.clientY);
      if (site && onSelectSiteRef.current) {
        onSelectSiteRef.current(site);
      }
    };

    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container || disposed) return;
      const w = container.clientWidth || 640;
      const h = container.clientHeight || 460;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    const flyToLatLon = (lat: number, lon: number, dist?: number) => {
      const targetRadius = dist ?? Math.min(3.45, Math.max(2.25, camera.position.length()));
      const localDir = latLonToVec3(lat, lon, 1).normalize();
      localDir.applyQuaternion(planetMesh.quaternion);
      flyToTargetPos.copy(localDir).multiplyScalar(targetRadius);
      flyToActive = true;
    };

    controlsApiRef.current = {
      zoomIn: () => {
        flyToActive = false;
        const nextLen = Math.max(1.62, camera.position.length() * 0.82);
        camera.position.setLength(nextLen);
        requestRender();
      },
      zoomOut: () => {
        flyToActive = false;
        const nextLen = Math.min(5.8, camera.position.length() * 1.2);
        camera.position.setLength(nextLen);
        requestRender();
      },
      resetView: () => {
        const localDir = latLonToVec3(DEFAULT_CAM_LAT, DEFAULT_CAM_LON, 1).normalize();
        localDir.applyQuaternion(planetMesh.quaternion);
        flyToTargetPos.copy(localDir).multiplyScalar(DEFAULT_CAM_DIST);
        controls.target.set(0, 0, 0);
        flyToActive = true;
        userInteracting = false;
        requestRender();
      },
      flyToLatLon,
    };

    sceneStateRef.current = {
      planetMesh,
      cloudMesh,
      innerAtmoMesh,
      outerAtmoMesh,
      markerGroup,
      markerMeshes: [],
      earthMaterial,
      otherMaterial,
      renderer,
      camera,
      controls,
      requestRender,
      syncBodyVisuals,
      syncLayerVisibility,
    };

    syncBodyVisuals(bodyRef.current);

    let lastTime = performance.now();
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      // Smooth idle auto-rotation (pauses immediately when user interacts)
      if (autoRotateRef.current && !userInteracting && !flyToActive) {
        planetMesh.rotation.y += dt * 0.068;
      }

      // Independent atmospheric cloud drift on Earth
      if (bodyRef.current === 'Earth' && cloudMesh.visible) {
        cloudMesh.rotation.y += dt * 0.092;
      }

      // Smooth damped camera flight toward selected site or reset position
      if (flyToActive) {
        const currentDist = camera.position.length();
        const targetDist = flyToTargetPos.length();
        const nextDist = THREE.MathUtils.damp(currentDist, targetDist, 5.2, dt);

        _camGoal.copy(camera.position).normalize();
        const goalNorm = _worldPos.copy(flyToTargetPos).normalize();
        const alpha = 1 - Math.exp(-4.8 * dt);
        _camGoal.lerp(goalNorm, alpha).normalize().multiplyScalar(nextDist);
        camera.position.copy(_camGoal);

        if (camera.position.distanceTo(flyToTargetPos) < 0.018) {
          camera.position.copy(flyToTargetPos);
          flyToActive = false;
        }
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
      if (idleResumeTimer !== null) window.clearTimeout(idleResumeTimer);
      resizeObserver.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('end', onControlEnd);
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();

      // Dispose markers
      while (markerGroup.children.length > 0) {
        const grp = markerGroup.children[0];
        grp.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
        markerGroup.remove(grp);
      }

      planetGeo.dispose();
      cloudGeo.dispose();
      innerAtmoGeo.dispose();
      outerAtmoGeo.dispose();
      starGeo.dispose();

      earthMaterial.dispose();
      cloudMaterial.dispose();
      otherMaterial.dispose();
      innerAtmoMat.dispose();
      outerAtmoMat.dispose();
      starMat.dispose();

      disposableTextures.forEach((t) => t.dispose());
      renderer.dispose();
      sceneStateRef.current = null;
    };
  }, []);

  // Sync body switching
  useEffect(() => {
    sceneStateRef.current?.syncBodyVisuals(body);
  }, [body]);

  // Sync cloud / night-lights toggles
  useEffect(() => {
    sceneStateRef.current?.syncLayerVisibility();
  }, [showClouds, showNightLights, body]);

  // Rebuild 3D markers whenever body, sites, or selectedSiteId changes
  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state) return;

    while (state.markerGroup.children.length > 0) {
      const grp = state.markerGroup.children[0];
      grp.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      state.markerGroup.remove(grp);
    }
    state.markerMeshes = [];

    const bodySites = sites.filter((s) => s.body === body);
    const upVec = new THREE.Vector3(0, 0, 1);

    bodySites.forEach((site) => {
      const surfacePos = latLonToVec3(site.latitude, site.longitude, GLOBE_RADIUS + 0.008);
      const normalDir = surfacePos.clone().normalize();
      const isSelected = site.id === selectedSiteId;

      const markerRoot = new THREE.Group();
      markerRoot.position.copy(surfacePos);
      markerRoot.quaternion.setFromUnitVectors(upVec, normalDir);

      const baseColor = isSelected
        ? 0x22d3ee
        : site.status === 'Established Reference'
          ? 0x34d399
          : site.status === 'Candidate Region'
            ? 0xfbbf24
            : 0x38bdf8;

      // Tangent surface target ring
      const ringGeo = new THREE.RingGeometry(
        isSelected ? 0.032 : 0.021,
        isSelected ? 0.044 : 0.029,
        28
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      markerRoot.add(ring);

      // Pin stem + beacon head
      const stemHeight = isSelected ? 0.046 : 0.026;
      const stemGeo = new THREE.CylinderGeometry(0.003, 0.003, stemHeight, 8);
      stemGeo.rotateX(Math.PI / 2);
      const stemMat = new THREE.MeshBasicMaterial({ color: baseColor });
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.z = stemHeight * 0.5;
      markerRoot.add(stem);

      const headGeo = new THREE.SphereGeometry(isSelected ? 0.022 : 0.015, 16, 12);
      const headMat = new THREE.MeshBasicMaterial({ color: baseColor });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.z = stemHeight;
      markerRoot.add(head);

      // Invisible generous hit-proxy for effortless desktop click & mobile tap
      const hitGeo = new THREE.SphereGeometry(compact ? 0.068 : 0.056, 12, 10);
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const hitMesh = new THREE.Mesh(hitGeo, hitMat);
      hitMesh.position.z = stemHeight * 0.6;
      hitMesh.userData.site = site;
      markerRoot.add(hitMesh);
      state.markerMeshes.push(hitMesh);

      state.markerGroup.add(markerRoot);
    });

    if (focusOnSelectRef.current && selectedSiteId) {
      const targetSite = bodySites.find((s) => s.id === selectedSiteId);
      if (targetSite) {
        controlsApiRef.current?.flyToLatLon(targetSite.latitude, targetSite.longitude);
      }
    }

    state.requestRender();
  }, [body, sites, selectedSiteId, compact]);

  const bodyMeta =
    body === 'Earth'
      ? { radius: '6,371 km', gravity: '9.81 m/s²', datum: 'WGS84 / EGM96' }
      : body === 'Moon'
        ? { radius: '1,737.4 km', gravity: '1.62 m/s²', datum: 'LOLA Sphere' }
        : { radius: '3,389.5 km', gravity: '3.72 m/s²', datum: 'MOLA Aeroid' };

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-slate-800/80 bg-[#030612] ${
        isExpanded ? 'fixed inset-4 z-50 h-auto' : heightClass
      }`}
    >
      {webglError ? (
        <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden p-6 text-center">
          <picture>
            <source srcSet="/assets/planets/earth_orbit_horizon.webp" type="image/webp" />
            <img
              src="/assets/planets/earth_orbit_horizon.jpg"
              alt="Earth orbital horizon fallback"
              className="absolute inset-0 h-full w-full object-cover opacity-35"
            />
          </picture>
          <div className="absolute inset-0 bg-[#030612]/75" />
          <div className="relative z-10 max-w-md space-y-2">
            <p className="font-display text-sm font-semibold text-white">
              3D WebGL Earth Viewport Unavailable
            </p>
            <p className="text-xs text-slate-300">
              Hardware or WebGL rendering is disabled in this browser environment. Select a site
              from the region list or switch to the 2D GIS Map Explorer to inspect exact coordinates.
            </p>
          </div>
        </div>
      ) : (
        <div ref={mountRef} className="h-full w-full touch-none select-none" />
      )}

      {/* Subtle Loading Scrim until NASA Blue Marble completes first upload */}
      {!webglError && !texturesReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#030612]/60">
          <span className="font-mono text-xs text-cyan-300">
            Loading NASA Blue Marble Earth textures...
          </span>
        </div>
      )}

      {/* Minimal Top-Left Body Telemetry Label (Zero Center Occlusion) */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-0.5 rounded-lg border border-slate-800/80 bg-[#040918]/88 px-3 py-2">
        <span className="font-display text-xs font-semibold tracking-wide text-cyan-300">
          {body === 'Earth' ? 'Earth 3D Globe · NASA Blue Marble' : `${body} 3D Reference Globe`}
        </span>
        {!compact && (
          <span className="font-mono text-[11px] text-slate-300">
            R = {bodyMeta.radius} · {bodyMeta.gravity} · {bodyMeta.datum}
          </span>
        )}
        {hoveredInfo && (
          <span className="font-mono text-[11px] text-emerald-300">{hoveredInfo}</span>
        )}
      </div>

      {/* Scientific Imagery vs Visual Simulation Distinction Note */}
      {!compact && body === 'Earth' && !webglError && (
        <div className="pointer-events-none absolute bottom-14 left-3 hidden max-w-sm rounded-md bg-[#040918]/80 px-2.5 py-1 text-[10px] text-slate-400 sm:block">
          Surface: NASA Blue &amp; Black Marble · Clouds, atmosphere &amp; terminator lighting are
          simulated visual layers, not live observations.
        </div>
      )}

      {/* Unified Bottom Control Dock */}
      {!webglError && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-700/80 bg-[#060d20]/92 px-2 py-1.5">
          <button
            type="button"
            onClick={() => setAutoRotate((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap"
            title={autoRotate ? 'Pause Auto-Rotation' : 'Resume Auto-Rotation'}
          >
            {autoRotate ? (
              <Pause className="h-3.5 w-3.5 text-cyan-400" />
            ) : (
              <Play className="h-3.5 w-3.5 text-cyan-400" />
            )}
            {!compact && <span>{autoRotate ? 'Pause' : 'Rotate'}</span>}
          </button>

          {body === 'Earth' && !compact && (
            <>
              <button
                type="button"
                onClick={() => setShowClouds((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap ${
                  showClouds
                    ? 'bg-cyan-500/15 text-cyan-200'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="Toggle simulated cloud layer"
              >
                <Cloud className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Clouds</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNightLights((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap ${
                  showNightLights
                    ? 'bg-amber-500/15 text-amber-200'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title="Toggle NASA Black Marble night-side city lights"
              >
                <Moon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Night Lights</span>
              </button>
            </>
          )}

          <div className="mx-0.5 h-4 w-px bg-slate-700/70" />

          <button
            type="button"
            onClick={() => controlsApiRef.current?.zoomIn()}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Zoom In"
            aria-label="Zoom In"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => controlsApiRef.current?.zoomOut()}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
            title="Zoom Out"
            aria-label="Zoom Out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => controlsApiRef.current?.resetView()}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 hover:text-white whitespace-nowrap"
            title="Reset Camera Position"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {!compact && <span className="hidden sm:inline">Reset</span>}
          </button>
          {!compact && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 hover:text-white"
              title={isExpanded ? 'Exit Fullscreen' : 'Expand 3D Globe'}
              aria-label={isExpanded ? 'Exit Fullscreen' : 'Expand 3D Globe'}
            >
              {isExpanded ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
