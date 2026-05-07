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

// Lights — minimal but readable. One sun + ambient + hemisphere.
const sun = new THREE.DirectionalLight(0xffefd0, 1.4);
sun.position.set(80, 110, 60);
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x554433, 0.45);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);

// Resize handling.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Disable right-click menu so right-click can be used for ADS / aim later.
document.addEventListener('contextmenu', (e) => e.preventDefault());
