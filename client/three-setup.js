// Three.js renderer + scene + camera + lights + sky.
// Single source of these objects so other modules import what they need
// without each one creating its own copy.

import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = false; // skip — heavy on Render free
document.body.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bb6c8); // sky-ish
scene.fog = new THREE.Fog(0x9bb6c8, 80, 220);

export const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 600);

// Lights — sun + hemi + ambient. Tinted/intensified by setTimeOfDay() to
// drive the day/night cycle. Default values are noon (used until welcome
// arrives with the actual server hour).
export const sun = new THREE.DirectionalLight(0xffefd0, 1.4);
sun.position.set(80, 110, 60);
scene.add(sun);
export const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x554433, 0.45);
scene.add(hemi);
export const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);

// Day-cycle palette helper. `hour` is 0..24. Smooth interpolation from
// dusk → night → dawn so the screen doesn't snap when the sun crosses
// the horizon.
const _skyDay     = new THREE.Color(0x9bb6c8);
const _skyDusk    = new THREE.Color(0xbf6a3a);
const _skyNight   = new THREE.Color(0x040608);    // mucho mas oscuro
const _sunDay     = new THREE.Color(0xffefd0);
const _sunDusk    = new THREE.Color(0xff8040);
const _sunNight   = new THREE.Color(0x304060);    // luna fria pero tenue
function _smooth01(t) { return t * t * (3 - 2 * t); }
const _tmpColor = new THREE.Color();
export function setTimeOfDay(hour) {
  // Map hour to a continuous sun angle: 0h = midnight (sun below), 12h = noon (high).
  const sunAngle = ((hour - 6) / 24) * Math.PI * 2; // 6h => 0, 12h => +PI/4 etc.
  const sx = Math.cos(sunAngle) * 120;
  const sy = Math.sin(sunAngle) * 120;
  sun.position.set(sx, Math.max(8, sy), 60);

  // Daylight intensity: full when sun > 20° above horizon, ramps down to
  // 0 when below. Night has only a moonlight remnant.
  const sunHeight = Math.sin(sunAngle); // -1..1
  const dayFactor = _smooth01(THREE.MathUtils.clamp((sunHeight + 0.05) / 0.4, 0, 1));
  const duskFactor = _smooth01(THREE.MathUtils.clamp(1 - Math.abs(sunHeight) / 0.25, 0, 1));

  // Sun color: dawn/dusk warm, day pale gold, night cold blue moon.
  if (dayFactor > 0.5) {
    _tmpColor.copy(_sunDusk).lerp(_sunDay, (dayFactor - 0.5) * 2);
  } else {
    _tmpColor.copy(_sunNight).lerp(_sunDusk, dayFactor * 2);
  }
  sun.color.copy(_tmpColor);
  // Night = casi negro (0.04 minimo). Antes era 0.15 → todavia se veia
  // demasiado claro. Ahora si la noche se siente NOCHE.
  sun.intensity = 0.04 + dayFactor * 1.30;

  // Sky / fog tint.
  const skyOut = new THREE.Color();
  if (dayFactor > 0.5) {
    skyOut.copy(_skyDusk).lerp(_skyDay, (dayFactor - 0.5) * 2);
  } else {
    skyOut.copy(_skyNight).lerp(_skyDusk, dayFactor * 2);
  }
  scene.background = skyOut;
  if (scene.fog) {
    scene.fog.color.copy(skyOut);
    // Fog mas cercano de noche para visibilidad limitada (zombies salen
    // de la oscuridad). Dia: 220m. Noche: 90m.
    scene.fog.far = 90 + dayFactor * 130;
    scene.fog.near = 30 + dayFactor * 50;
  }

  // Hemisphere + ambient: night casi cero.
  hemi.intensity = 0.04 + dayFactor * 0.50;
  ambient.intensity = 0.06 + dayFactor * 0.45;
}

// Resize handling.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Disable right-click menu so right-click can be used for ADS / aim later.
document.addEventListener('contextmenu', (e) => e.preventDefault());
