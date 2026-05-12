// Modelos 3D detallados de armas. Cada arma es un THREE.Group con:
//   - Origin (0,0,0) en la culata/grip (referencia)
//   - Apunta a -Z (forward).
//   - Hip position: posicionado a la derecha (offset por weapons.js).
//   - Iron sights alineados para que al hacer ADS el centro de pantalla
//     muestre la mira.
//
// Todos los meshes son combinaciones de BoxGeometry + CylinderGeometry
// para ser ligeros pero reconocibles.

import * as THREE from 'three';

// =====================================================================
// MATERIALES compartidos
// =====================================================================
const MATS = {
  metalDark:  new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.4, metalness: 0.85 }),
  metalMid:   new THREE.MeshStandardMaterial({ color: 0x4a4a4e, roughness: 0.5, metalness: 0.7 }),
  metalLight: new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.55, metalness: 0.4 }),
  wood:       new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.85, metalness: 0.0 }),
  woodLight:  new THREE.MeshStandardMaterial({ color: 0x8a5028, roughness: 0.8, metalness: 0.0 }),
  polymer:    new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.2 }),
  rubber:     new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.9, metalness: 0.0 }),
  brass:      new THREE.MeshStandardMaterial({ color: 0xc09040, roughness: 0.5, metalness: 0.7 }),
  ironSight:  new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.3, metalness: 0.9 }),
  glass:      new THREE.MeshStandardMaterial({ color: 0x3070a0, roughness: 0.05, metalness: 0.8, opacity: 0.4, transparent: true }),
  redDot:     new THREE.MeshBasicMaterial({ color: 0xff2020 }),
};

// =====================================================================
// Helper para crear mesh + position + parent
// =====================================================================
function box(w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}
function cyl(rTop, rBot, h, segs, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  return m;
}

// =====================================================================
// PISTOL — Glock-style. Compacto. Slide + frame + grip.
// =====================================================================
function makePistol() {
  const g = new THREE.Group();
  // Slide (parte superior).
  g.add(box(0.045, 0.05, 0.18, MATS.metalDark, 0, 0, -0.06));
  // Frame (debajo del slide).
  g.add(box(0.040, 0.025, 0.14, MATS.polymer, 0, -0.038, -0.04));
  // Barrel (cañon visible al frente).
  g.add(cyl(0.011, 0.011, 0.04, 8, MATS.metalDark, 0, -0.005, -0.17, Math.PI / 2));
  // Grip — angulada hacia atras como una pistola real.
  g.add(box(0.035, 0.10, 0.045, MATS.polymer, 0, -0.10, 0.02, -0.20));
  // Texturas del grip (lineas).
  for (let i = 0; i < 3; i++) {
    g.add(box(0.037, 0.005, 0.04, MATS.metalDark, 0, -0.07 - i * 0.025, 0.025));
  }
  // Trigger guard.
  g.add(box(0.005, 0.025, 0.04, MATS.polymer, 0, -0.045, -0.01));
  g.add(box(0.005, 0.025, 0.04, MATS.polymer, 0.018, -0.045, -0.01));
  g.add(box(0.035, 0.005, 0.005, MATS.polymer, 0, -0.06, -0.025));
  // Trigger.
  g.add(box(0.008, 0.018, 0.005, MATS.metalDark, 0, -0.055, -0.005));
  // Mag base.
  g.add(box(0.038, 0.012, 0.05, MATS.metalDark, 0, -0.14, 0.02));
  // Sights.
  g.add(box(0.005, 0.012, 0.005, MATS.ironSight, 0, 0.030, -0.14));    // front
  g.add(box(0.030, 0.012, 0.008, MATS.ironSight, 0, 0.030,  0.018));   // rear
  // Slide serrations (texturizadas).
  for (let i = 0; i < 5; i++) {
    g.add(box(0.046, 0.003, 0.002, MATS.metalLight, 0, 0.020, 0.015 + i * 0.006));
  }
  return g;
}

// =====================================================================
// RIFLE — M4-style. Modular, mas largo, pistol grip + carry handle.
// =====================================================================
function makeRifle() {
  const g = new THREE.Group();
  // Upper receiver.
  g.add(box(0.045, 0.045, 0.18, MATS.polymer, 0, 0, -0.05));
  // Lower receiver + magwell.
  g.add(box(0.040, 0.040, 0.10, MATS.polymer, 0, -0.040, -0.02));
  // Barrel.
  g.add(cyl(0.013, 0.013, 0.20, 8, MATS.metalDark, 0, 0, -0.24, Math.PI / 2));
  // Flash hider.
  g.add(cyl(0.015, 0.013, 0.03, 6, MATS.metalDark, 0, 0, -0.36, Math.PI / 2));
  // Handguard (free-float quad rail).
  g.add(box(0.038, 0.038, 0.16, MATS.metalMid, 0, 0, -0.20));
  // Rail slots (texture detail).
  for (let i = 0; i < 6; i++) {
    g.add(box(0.040, 0.003, 0.003, MATS.metalDark, 0, 0.020, -0.14 - i * 0.025));
    g.add(box(0.003, 0.003, 0.040, MATS.metalDark, 0.020, 0, -0.14 - i * 0.025, 0, Math.PI / 2));
  }
  // Grip pistol.
  g.add(box(0.030, 0.075, 0.030, MATS.polymer, 0, -0.090, 0.030, -0.15));
  // Stock fixed.
  g.add(box(0.038, 0.045, 0.10, MATS.polymer, 0, 0, 0.075));
  // Stock pad.
  g.add(box(0.038, 0.055, 0.012, MATS.rubber, 0, 0, 0.130));
  // Magazine STANAG.
  g.add(box(0.030, 0.080, 0.030, MATS.metalDark, 0, -0.080, -0.015, 0.10));
  // Trigger guard.
  g.add(box(0.005, 0.025, 0.035, MATS.polymer, 0, -0.038, 0.005));
  g.add(box(0.005, 0.025, 0.035, MATS.polymer, 0.020, -0.038, 0.005));
  // Charging handle.
  g.add(box(0.012, 0.008, 0.030, MATS.metalDark, 0, 0.022, 0.045));
  // Iron sights — front post + rear aperture.
  g.add(box(0.008, 0.025, 0.005, MATS.ironSight, 0, 0.038, -0.31));
  g.add(box(0.025, 0.020, 0.012, MATS.ironSight, 0, 0.038, 0.025));   // rear A2
  // Magpul-style angle on front of mag.
  g.add(box(0.022, 0.005, 0.030, MATS.polymer, 0, -0.123, -0.020));
  return g;
}

// =====================================================================
// AK-47 — Curved mag, wood furniture, gas tube on top.
// =====================================================================
function makeAk() {
  const g = new THREE.Group();
  // Receiver.
  g.add(box(0.048, 0.048, 0.16, MATS.metalMid, 0, 0, -0.04));
  // Wooden handguard (madera clara).
  g.add(box(0.045, 0.042, 0.14, MATS.woodLight, 0, -0.012, -0.18));
  // Gas tube (encima del barrel).
  g.add(box(0.025, 0.020, 0.14, MATS.wood, 0, 0.030, -0.18));
  // Barrel (cañon largo).
  g.add(cyl(0.013, 0.013, 0.30, 8, MATS.metalDark, 0, 0, -0.32, Math.PI / 2));
  // Front sight post tower.
  g.add(box(0.025, 0.035, 0.020, MATS.metalDark, 0, 0.024, -0.42));
  g.add(box(0.005, 0.025, 0.005, MATS.ironSight, 0, 0.040, -0.42));
  // Curved magazine — la firma del AK.
  const mag1 = box(0.030, 0.040, 0.030, MATS.metalDark, 0, -0.060, -0.030);
  g.add(mag1);
  const mag2 = box(0.030, 0.045, 0.035, MATS.metalDark, 0, -0.100, -0.005, 0.30);   // curva
  g.add(mag2);
  const mag3 = box(0.030, 0.035, 0.030, MATS.metalDark, 0, -0.135, 0.030, 0.50);
  g.add(mag3);
  // Pistol grip (madera).
  g.add(box(0.030, 0.080, 0.030, MATS.wood, 0, -0.090, 0.045, -0.10));
  // Stock (madera larga).
  g.add(box(0.040, 0.055, 0.13, MATS.wood, 0, 0, 0.100));
  // Stock pad.
  g.add(box(0.040, 0.060, 0.010, MATS.rubber, 0, 0, 0.170));
  // Rear sight.
  g.add(box(0.025, 0.015, 0.012, MATS.ironSight, 0, 0.030, 0.040));
  // Charging handle (lateral).
  g.add(box(0.025, 0.010, 0.018, MATS.metalDark, 0.024, 0.012, 0.020));
  // Trigger guard.
  g.add(box(0.005, 0.025, 0.040, MATS.metalDark, 0, -0.040, 0.005));
  g.add(box(0.005, 0.025, 0.040, MATS.metalDark, 0.022, -0.040, 0.005));
  return g;
}

// =====================================================================
// SMG — MP5-style. Compacto, vertical mag, retractable stock.
// =====================================================================
function makeSmg() {
  const g = new THREE.Group();
  // Receiver tubular.
  g.add(cyl(0.025, 0.025, 0.18, 8, MATS.polymer, 0, 0, -0.06, Math.PI / 2));
  // Lower group.
  g.add(box(0.035, 0.030, 0.090, MATS.polymer, 0, -0.030, -0.02));
  // Barrel corto.
  g.add(cyl(0.011, 0.011, 0.12, 8, MATS.metalDark, 0, 0, -0.21, Math.PI / 2));
  // Handguard.
  g.add(cyl(0.024, 0.024, 0.10, 8, MATS.polymer, 0, 0, -0.20, Math.PI / 2));
  // Magazine vertical.
  g.add(box(0.030, 0.090, 0.025, MATS.metalDark, 0, -0.090, -0.025));
  // Pistol grip.
  g.add(box(0.028, 0.065, 0.025, MATS.polymer, 0, -0.075, 0.045, -0.20));
  // Stock retractado (no extendido).
  g.add(box(0.025, 0.025, 0.06, MATS.metalDark, 0, 0, 0.060));
  // Trigger guard + trigger.
  g.add(box(0.005, 0.022, 0.035, MATS.polymer, 0, -0.030, 0.010));
  g.add(box(0.005, 0.022, 0.035, MATS.polymer, 0.020, -0.030, 0.010));
  // Drum sight rear + diopter front.
  g.add(cyl(0.012, 0.012, 0.014, 6, MATS.ironSight, 0, 0.028, 0.020, 0, 0, Math.PI / 2));
  g.add(cyl(0.012, 0.012, 0.014, 6, MATS.ironSight, 0, 0.028, -0.16, 0, 0, Math.PI / 2));
  return g;
}

// =====================================================================
// SHOTGUN — Pump action. Long barrel + tube + wood stock.
// =====================================================================
function makeShotgun() {
  const g = new THREE.Group();
  // Receiver.
  g.add(box(0.040, 0.045, 0.14, MATS.metalDark, 0, 0, -0.02));
  // Barrel.
  g.add(cyl(0.014, 0.014, 0.36, 8, MATS.metalDark, 0, 0.005, -0.27, Math.PI / 2));
  // Mag tube (bajo cañon).
  g.add(cyl(0.013, 0.013, 0.32, 8, MATS.metalDark, 0, -0.022, -0.25, Math.PI / 2));
  // Pump (foregrip).
  g.add(box(0.030, 0.034, 0.06, MATS.wood, 0, -0.022, -0.18));
  // Pump grooves.
  for (let i = 0; i < 4; i++) {
    g.add(box(0.032, 0.003, 0.005, MATS.woodLight, 0, -0.008, -0.21 + i * 0.012));
  }
  // Wood stock (largo).
  g.add(box(0.040, 0.050, 0.16, MATS.wood, 0, 0, 0.110));
  // Stock pad.
  g.add(box(0.040, 0.055, 0.014, MATS.rubber, 0, 0, 0.200));
  // Trigger.
  g.add(box(0.005, 0.022, 0.04, MATS.polymer, 0, -0.030, 0.005));
  g.add(box(0.005, 0.022, 0.04, MATS.polymer, 0.018, -0.030, 0.005));
  // Bead front sight.
  g.add(cyl(0.005, 0.005, 0.008, 6, MATS.brass, 0, 0.024, -0.44));
  // Ejection port (lateral detail).
  g.add(box(0.005, 0.015, 0.040, MATS.metalDark, 0.022, 0.005, 0));
  return g;
}

// =====================================================================
// SNIPER — Bolt-action. Long barrel + big scope + bipod.
// =====================================================================
function makeSniper() {
  const g = new THREE.Group();
  // Receiver.
  g.add(box(0.040, 0.040, 0.18, MATS.metalDark, 0, 0, -0.04));
  // Bolt handle.
  g.add(cyl(0.006, 0.006, 0.04, 6, MATS.metalDark, 0.025, 0.015, 0.020, 0, 0, Math.PI / 2.5));
  g.add(cyl(0.012, 0.012, 0.008, 8, MATS.metalDark, 0.045, 0.025, 0.020, 0, 0, Math.PI / 2));
  // Barrel (largo).
  g.add(cyl(0.013, 0.013, 0.42, 8, MATS.metalDark, 0, 0, -0.34, Math.PI / 2));
  // Muzzle brake.
  g.add(cyl(0.020, 0.018, 0.045, 8, MATS.metalDark, 0, 0, -0.57, Math.PI / 2));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.022, 0.006, 0.004, MATS.metalLight, 0, 0.005, -0.56 + i * 0.012));
  }
  // SCOPE — la firma del sniper.
  g.add(cyl(0.024, 0.024, 0.10, 12, MATS.metalDark, 0, 0.045, -0.08, 0, 0, Math.PI / 2));
  g.add(cyl(0.022, 0.022, 0.05, 12, MATS.metalDark, 0, 0.045, -0.16, 0, 0, Math.PI / 2));   // ocular
  g.add(cyl(0.022, 0.022, 0.05, 12, MATS.metalDark, 0, 0.045, 0.00, 0, 0, Math.PI / 2));    // objective
  // Glass lens del scope.
  g.add(cyl(0.020, 0.020, 0.005, 12, MATS.glass, 0, 0.045, -0.19, 0, 0, Math.PI / 2));
  g.add(cyl(0.020, 0.020, 0.005, 12, MATS.glass, 0, 0.045, 0.03, 0, 0, Math.PI / 2));
  // Scope rings.
  g.add(box(0.030, 0.030, 0.018, MATS.metalDark, 0, 0.025, -0.12));
  g.add(box(0.030, 0.030, 0.018, MATS.metalDark, 0, 0.025, -0.03));
  // Stock cheek riser.
  g.add(box(0.038, 0.025, 0.10, MATS.polymer, 0, 0.030, 0.080));
  // Stock body.
  g.add(box(0.040, 0.050, 0.16, MATS.polymer, 0, 0, 0.100));
  // Stock pad.
  g.add(box(0.040, 0.060, 0.014, MATS.rubber, 0, -0.005, 0.190));
  // Magazine.
  g.add(box(0.028, 0.030, 0.040, MATS.metalDark, 0, -0.050, -0.020));
  // Pistol grip + trigger.
  g.add(box(0.028, 0.060, 0.028, MATS.polymer, 0, -0.075, 0.035, -0.15));
  g.add(box(0.005, 0.022, 0.04, MATS.metalDark, 0, -0.030, 0.005));
  g.add(box(0.005, 0.022, 0.04, MATS.metalDark, 0.018, -0.030, 0.005));
  // Bipod (front).
  g.add(box(0.005, 0.06, 0.005, MATS.metalDark, -0.020, -0.040, -0.36, 0, 0, 0.30));
  g.add(box(0.005, 0.06, 0.005, MATS.metalDark,  0.020, -0.040, -0.36, 0, 0, -0.30));
  return g;
}

// =====================================================================
// SEMI-AUTO MARKSMAN — Like rifle but longer barrel + dedicated scope.
// =====================================================================
function makeSemi() {
  const g = new THREE.Group();
  // Receiver.
  g.add(box(0.042, 0.042, 0.20, MATS.polymer, 0, 0, -0.06));
  // Lower.
  g.add(box(0.038, 0.040, 0.10, MATS.polymer, 0, -0.038, -0.025));
  // Long barrel.
  g.add(cyl(0.014, 0.014, 0.32, 8, MATS.metalDark, 0, 0, -0.32, Math.PI / 2));
  // Muzzle.
  g.add(cyl(0.018, 0.016, 0.030, 8, MATS.metalDark, 0, 0, -0.495, Math.PI / 2));
  // Handguard.
  g.add(box(0.036, 0.036, 0.20, MATS.metalMid, 0, 0, -0.22));
  // Compact scope.
  g.add(cyl(0.022, 0.022, 0.08, 10, MATS.metalDark, 0, 0.038, -0.10, 0, 0, Math.PI / 2));
  g.add(cyl(0.018, 0.018, 0.025, 10, MATS.metalDark, 0, 0.038, -0.14, 0, 0, Math.PI / 2));
  g.add(cyl(0.018, 0.018, 0.025, 10, MATS.metalDark, 0, 0.038, -0.05, 0, 0, Math.PI / 2));
  g.add(cyl(0.016, 0.016, 0.005, 10, MATS.glass, 0, 0.038, -0.025, 0, 0, Math.PI / 2));
  // Scope rings.
  g.add(box(0.026, 0.024, 0.015, MATS.metalDark, 0, 0.022, -0.13));
  g.add(box(0.026, 0.024, 0.015, MATS.metalDark, 0, 0.022, -0.07));
  // Stock.
  g.add(box(0.040, 0.048, 0.13, MATS.polymer, 0, 0, 0.080));
  g.add(box(0.040, 0.055, 0.012, MATS.rubber, 0, 0, 0.150));
  // Pistol grip + trigger.
  g.add(box(0.028, 0.070, 0.030, MATS.polymer, 0, -0.084, 0.020, -0.15));
  g.add(box(0.005, 0.025, 0.040, MATS.polymer, 0, -0.040, 0.000));
  g.add(box(0.005, 0.025, 0.040, MATS.polymer, 0.020, -0.040, 0.000));
  // Mag.
  g.add(box(0.030, 0.060, 0.025, MATS.metalDark, 0, -0.075, -0.020));
  return g;
}

// =====================================================================
// CROSSBOW — Cross-shaped bow + stock.
// =====================================================================
function makeCrossbow() {
  const g = new THREE.Group();
  // Stock (madera).
  g.add(box(0.040, 0.050, 0.30, MATS.wood, 0, 0, 0.040));
  // Riser donde se monta el arco.
  g.add(box(0.045, 0.060, 0.06, MATS.metalDark, 0, 0, -0.140));
  // Limbs del arco (a los lados, en V).
  const limbL = box(0.005, 0.030, 0.18, MATS.metalMid, -0.025, 0.005, -0.150, 0, 0.5, 0);
  const limbR = box(0.005, 0.030, 0.18, MATS.metalMid,  0.025, 0.005, -0.150, 0, -0.5, 0);
  g.add(limbL);
  g.add(limbR);
  // Cuerda — linea fina entre los limbs.
  g.add(box(0.20, 0.002, 0.002, MATS.metalLight, 0, 0.005, -0.030));
  // Riel del bolt (encima del stock).
  g.add(box(0.012, 0.005, 0.20, MATS.polymer, 0, 0.030, 0.050));
  // Bolt cargado.
  g.add(cyl(0.004, 0.004, 0.20, 6, MATS.metalDark, 0, 0.040, 0.060, Math.PI / 2));
  // Plumas del bolt.
  g.add(box(0.020, 0.015, 0.020, MATS.metalLight, 0, 0.040, 0.158));
  // Punta del bolt.
  g.add(cyl(0.000, 0.006, 0.020, 6, MATS.metalDark, 0, 0.040, -0.060, Math.PI / 2));
  // Pistol grip.
  g.add(box(0.030, 0.070, 0.030, MATS.wood, 0, -0.080, 0.020, -0.15));
  // Trigger guard.
  g.add(box(0.005, 0.022, 0.040, MATS.metalDark, 0, -0.035, 0.000));
  g.add(box(0.005, 0.022, 0.040, MATS.metalDark, 0.020, -0.035, 0.000));
  // Front sight.
  g.add(box(0.004, 0.025, 0.005, MATS.ironSight, 0, 0.045, -0.130));
  return g;
}

// =====================================================================
// GRENADE LAUNCHER — Big 40mm bore + short stock.
// =====================================================================
function makeGl() {
  const g = new THREE.Group();
  // Body / receiver.
  g.add(box(0.060, 0.060, 0.10, MATS.polymer, 0, 0, -0.02));
  // Barrel grande (40mm).
  g.add(cyl(0.030, 0.030, 0.20, 10, MATS.metalDark, 0, 0, -0.18, Math.PI / 2));
  // Muzzle thick.
  g.add(cyl(0.034, 0.030, 0.020, 10, MATS.metalDark, 0, 0, -0.288, Math.PI / 2));
  // Mouth black (hueco).
  g.add(cyl(0.024, 0.024, 0.010, 10, MATS.ironSight, 0, 0, -0.293, Math.PI / 2));
  // Top rail.
  g.add(box(0.040, 0.010, 0.10, MATS.metalDark, 0, 0.038, -0.04));
  // Ladder sight (folding) — varilla larga.
  g.add(box(0.005, 0.040, 0.005, MATS.metalDark, 0, 0.062, -0.10));
  // Pistol grip.
  g.add(box(0.030, 0.075, 0.030, MATS.polymer, 0, -0.085, 0.030, -0.15));
  // Trigger.
  g.add(box(0.005, 0.022, 0.040, MATS.polymer, 0, -0.038, 0.005));
  g.add(box(0.005, 0.022, 0.040, MATS.polymer, 0.020, -0.038, 0.005));
  // Short stock.
  g.add(box(0.040, 0.045, 0.10, MATS.polymer, 0, 0, 0.080));
  g.add(box(0.040, 0.052, 0.012, MATS.rubber, 0, 0, 0.140));
  // Front sight.
  g.add(box(0.005, 0.020, 0.005, MATS.ironSight, 0, 0.045, -0.27));
  return g;
}

// =====================================================================
// GATLING — Mini-gun rotativo, 6 cañones giratorios.
// =====================================================================
function makeGatling() {
  const g = new THREE.Group();
  // Body principal.
  g.add(box(0.080, 0.080, 0.20, MATS.metalMid, 0, 0, -0.05));
  // Drum mag enorme.
  g.add(cyl(0.060, 0.060, 0.06, 16, MATS.metalDark, 0.090, -0.020, -0.04, 0, 0, Math.PI / 2));
  // 6 cañones en circulo.
  const barrelGroup = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const bx = Math.cos(ang) * 0.024;
    const by = Math.sin(ang) * 0.024;
    barrelGroup.add(cyl(0.008, 0.008, 0.32, 6, MATS.metalDark, bx, by, -0.32, Math.PI / 2));
  }
  // Cañon central (hub).
  barrelGroup.add(cyl(0.012, 0.012, 0.34, 8, MATS.metalLight, 0, 0, -0.31, Math.PI / 2));
  g.add(barrelGroup);
  // Ring frontal (donde rotan).
  g.add(cyl(0.038, 0.038, 0.020, 12, MATS.metalDark, 0, 0, -0.165, 0, 0, Math.PI / 2));
  g.add(cyl(0.038, 0.038, 0.020, 12, MATS.metalDark, 0, 0, -0.460, 0, 0, Math.PI / 2));
  // Handle de carga (encima).
  g.add(box(0.020, 0.025, 0.080, MATS.metalDark, 0, 0.052, -0.05));
  // Pistol grip + trigger.
  g.add(box(0.035, 0.090, 0.035, MATS.polymer, 0, -0.095, 0.020, -0.10));
  // Belt feed visual (lateral).
  g.add(box(0.020, 0.030, 0.060, MATS.brass, 0.045, -0.020, -0.04));
  // Trigger.
  g.add(box(0.008, 0.020, 0.020, MATS.metalDark, 0, -0.050, 0.005));
  return g;
}

// =====================================================================
// NUKE LAUNCHER — Tubo grande tipo bazooka + ojiva visible + backpack.
// =====================================================================
function makeNuke() {
  const g = new THREE.Group();
  // Tubo principal.
  g.add(cyl(0.060, 0.060, 0.55, 16, MATS.metalLight, 0, 0, -0.12, Math.PI / 2));
  // Boca del tubo (negro hueco).
  g.add(cyl(0.054, 0.054, 0.010, 12, MATS.ironSight, 0, 0, -0.392, Math.PI / 2));
  // Cono delantero (deflector).
  g.add(cyl(0.078, 0.060, 0.030, 12, MATS.metalDark, 0, 0, -0.40, Math.PI / 2));
  // Mira óptica grande encima.
  g.add(cyl(0.024, 0.024, 0.10, 10, MATS.metalDark, 0, 0.080, -0.10, 0, 0, Math.PI / 2));
  g.add(cyl(0.020, 0.020, 0.025, 10, MATS.metalDark, 0, 0.080, -0.04, 0, 0, Math.PI / 2));
  g.add(cyl(0.020, 0.020, 0.025, 10, MATS.glass, 0, 0.080, -0.03, 0, 0, Math.PI / 2));
  // Soporte de mira.
  g.add(box(0.020, 0.040, 0.060, MATS.metalDark, 0, 0.050, -0.08));
  // Grip pistol.
  g.add(box(0.030, 0.080, 0.030, MATS.polymer, 0, -0.080, 0.020, -0.20));
  // Trigger guard.
  g.add(box(0.005, 0.025, 0.040, MATS.metalDark, 0, -0.035, 0.000));
  g.add(box(0.005, 0.025, 0.040, MATS.metalDark, 0.020, -0.035, 0.000));
  // Backpack with warhead (visible).
  g.add(box(0.085, 0.090, 0.060, MATS.metalMid, 0, -0.020, 0.180));
  // Warning sticker amarillo.
  g.add(box(0.060, 0.060, 0.002, MATS.brass, 0, -0.020, 0.211));
  // Sticker rojo radiacion (un triangulito).
  g.add(box(0.020, 0.020, 0.001, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 0, -0.020, 0.212));
  // Cables visibles entre body y backpack.
  g.add(cyl(0.005, 0.005, 0.10, 6, MATS.rubber, 0.020, -0.020, 0.080, Math.PI / 2));
  g.add(cyl(0.005, 0.005, 0.10, 6, MATS.rubber, -0.020, -0.020, 0.080, Math.PI / 2));
  return g;
}

// =====================================================================
// FLASHLIGHT ATTACHMENT — mesh chico montable en el rail de cualquier arma.
// Se agrega al weapon group cuando attachments.has(weapon, 'flashlight_attach').
// =====================================================================
export function makeFlashlightAttachment() {
  const g = new THREE.Group();
  g.name = 'flashlight_attach_mesh';
  // Cuerpo cilindrico negro.
  g.add(cyl(0.012, 0.012, 0.045, 8, MATS.metalDark, 0, 0, 0, Math.PI / 2));
  // Cabezal con lente brillante.
  g.add(cyl(0.014, 0.014, 0.010, 10, MATS.metalDark, 0, 0, -0.027, Math.PI / 2));
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.010, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff8c0 }),
  );
  lens.position.set(0, 0, -0.034);
  lens.rotation.y = Math.PI;
  g.add(lens);
  // Switch botoncito atras.
  g.add(box(0.006, 0.008, 0.005, MATS.rubber, 0, 0.008, 0.022));
  return g;
}

// =====================================================================
// API publica
// =====================================================================
export function makeWeaponMesh(type) {
  let g;
  switch (type) {
    case 'pistol':   g = makePistol(); break;
    case 'rifle':    g = makeRifle(); break;
    case 'ak':       g = makeAk(); break;
    case 'semi':     g = makeSemi(); break;
    case 'smg':      g = makeSmg(); break;
    case 'shotgun':  g = makeShotgun(); break;
    case 'sniper':   g = makeSniper(); break;
    case 'crossbow': g = makeCrossbow(); break;
    case 'gl':       g = makeGl(); break;
    case 'gatling':  g = makeGatling(); break;
    case 'nuke':     g = makeNuke(); break;
    default:         g = makePistol();
  }
  // Posicionar a la altura del hip por defecto. El weapons.js puede
  // moverlo para ADS.
  g.position.set(0.18, -0.18, -0.30);
  return g;
}

// Para que weapons.js sepa donde estan los iron sights de cada arma —
// usado para apuntar (ADS). Por ahora la mira siempre esta encima del
// arma alineada al frente, asi que el aim offset es uniforme: x=-0.18 y=+0.10.
export function getAimOffset(type) {
  // Negar el offset hip de la x para que la mira quede centrada en pantalla.
  // Y subir levemente para que coincida con la altura del rear sight.
  return { x: -0.18, y: 0.06, z: 0 };
}
