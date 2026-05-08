// POI — Points of Interest. Server sends layouts in welcome; this module
// builds 3D meshes per kind (helicopter, gas station, cabin) and hooks up
// colliders so the player can't walk through them.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt, obstacles } from './world.js';

const M = {
  metal:    new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.5, metalness: 0.7 }),
  metalBlack: new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.55, metalness: 0.7 }),
  rotor:    new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.4, metalness: 0.85 }),
  glass:    new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.05, metalness: 0.95, emissive: 0x102030, emissiveIntensity: 0.2 }),
  rust:     new THREE.MeshStandardMaterial({ color: 0x6a3018, roughness: 0.95 }),
  wood:     new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.9 }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x3a2410, roughness: 0.9 }),
  roof:     new THREE.MeshStandardMaterial({ color: 0x4d2c1a, roughness: 0.85 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.7 }),
  yellow:   new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.6, emissive: 0x402810, emissiveIntensity: 0.3 }),
  red:      new THREE.MeshStandardMaterial({ color: 0xb02828, roughness: 0.5, emissive: 0x300808, emissiveIntensity: 0.3 }),
};

// =====================================================================
// Crashed military helicopter — body + tail boom + main rotor (broken) +
// cockpit glass + smoke pillar emitter.
// =====================================================================
function buildHelicopter(p) {
  const g = new THREE.Group();
  // Body — stretched cylinder + tapered tail.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.6, 4.0), M.metal);
  body.position.set(0, 0.9, 0); g.add(body);
  // Camo top.
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.2, 4.0), M.metalBlack);
  top.position.set(0, 1.7, 0); g.add(top);
  // Cockpit glass at the front.
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.9), M.glass);
  cockpit.position.set(0, 1.3, 1.7); g.add(cockpit);
  // Tail boom.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 2.4), M.metal);
  tail.position.set(0, 1.05, -3.0); g.add(tail);
  // Tail rotor (vertical disc).
  const tRotor = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), M.rotor);
  tRotor.position.set(0, 1.05, -4.1); g.add(tRotor);
  // Broken main rotor — 2 blades crossed, tilted.
  const rotorMast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 6), M.metalBlack);
  rotorMast.position.set(0, 1.95, 0); g.add(rotorMast);
  for (let i = 0; i < 2; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 4.5), M.rotor);
    blade.position.set(0, 2.05, 0);
    blade.rotation.y = (i * Math.PI / 2);
    blade.rotation.z = -0.15;
    g.add(blade);
  }
  // Rust streaks + dark scorching on body.
  const scorch = new THREE.Mesh(new THREE.BoxGeometry(2.05, 1.2, 1.5), M.metalBlack);
  scorch.position.set(0, 0.9, -0.5); g.add(scorch);
  // Skids — landing rails.
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.5, 6), M.metalBlack);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx * 0.95, 0.05, 0);
    g.add(skid);
  }
  // Smoke pillar — gray cone with reduced opacity, animated by main loop.
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x707074, transparent: true, opacity: 0.45 });
  const smoke = new THREE.Mesh(new THREE.ConeGeometry(1.0, 5.0, 8), smokeMat);
  smoke.position.set(0, 4.2, 0);
  g.add(smoke);
  g.userData.smoke = smoke;
  return { group: g, colliders: [
    { x: p.cx, z: p.cz, r: 2.2 },
    { x: p.cx + Math.cos(p.ry || 0) * -3, z: p.cz + Math.sin(p.ry || 0) * -3, r: 1.0 },
  ]};
}

// =====================================================================
// Gas station — rectangular building + canopy + 2 pumps.
// =====================================================================
function buildGasStation(p) {
  const g = new THREE.Group();
  // Main shop building.
  const shopW = 6, shopD = 4, shopH = 3;
  const shop = new THREE.Mesh(new THREE.BoxGeometry(shopW, shopH, shopD), M.concrete);
  shop.position.set(0, shopH / 2, 0); g.add(shop);
  // Storefront window strip.
  const window = new THREE.Mesh(new THREE.BoxGeometry(shopW * 0.85, 1.2, 0.05), M.glass);
  window.position.set(0, 1.6, shopD / 2 + 0.03); g.add(window);
  // Roof slab.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(shopW + 0.4, 0.18, shopD + 0.4), M.metalBlack);
  roof.position.set(0, shopH + 0.09, 0); g.add(roof);
  // Canopy — 4 posts + flat roof shading the pumps in front of the shop.
  const canopyDepth = 5;
  const canopyW = shopW;
  for (const sx of [-1, 1]) {
    for (const sz of [shopD / 2 + 0.5, shopD / 2 + canopyDepth - 0.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.4, 0.18), M.metalBlack);
      post.position.set(sx * (canopyW / 2 - 0.5), 1.7, sz);
      g.add(post);
    }
  }
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(canopyW, 0.2, canopyDepth), M.concrete);
  canopy.position.set(0, 3.4, shopD / 2 + canopyDepth / 2); g.add(canopy);
  // Yellow signage strip on canopy.
  const sign = new THREE.Mesh(new THREE.BoxGeometry(canopyW + 0.1, 0.4, 0.1), M.yellow);
  sign.position.set(0, 3.5, shopD / 2 + canopyDepth - 0.3); g.add(sign);
  // 2 pumps under the canopy.
  for (const sx of [-1, 1]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5), M.red);
    pump.position.set(sx * 1.5, 0.65, shopD / 2 + 2);
    g.add(pump);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.3, 0.55), M.metalBlack);
    head.position.set(sx * 1.5, 1.45, shopD / 2 + 2);
    g.add(head);
  }
  return { group: g, colliders: [
    { type: 'box', cx: p.cx, cz: p.cz, hw: shopW / 2, hh: shopD / 2, ry: p.ry || 0 },
    { x: p.cx + Math.cos((p.ry || 0) + Math.PI / 2) * 1.5, z: p.cz - Math.sin((p.ry || 0) + Math.PI / 2) * 1.5, r: 0.5 },
    { x: p.cx - Math.cos((p.ry || 0) + Math.PI / 2) * 1.5, z: p.cz + Math.sin((p.ry || 0) + Math.PI / 2) * 1.5, r: 0.5 },
  ]};
}

// =====================================================================
// Lone cabin — a single-room wood building with a pitched roof.
// =====================================================================
function buildCabin(p) {
  const g = new THREE.Group();
  const w = 5.5, h = 5.5;
  const wallH = 2.8;
  // Walls (open back, 2 side, partial front for door).
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.2), M.wood);
  back.position.set(0, wallH / 2, -h / 2); g.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, wallH, h), M.wood);
    side.position.set(sx * (w / 2), wallH / 2, 0); g.add(side);
  }
  // Front — left + right slabs leaving doorway.
  const slabW = (w - 1.4) / 2;
  for (const sx of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, wallH, 0.2), M.wood);
    slab.position.set(sx * (w / 2 - slabW / 2), wallH / 2, h / 2);
    g.add(slab);
  }
  // Pitched roof — same prism style as town cabins.
  const roofGeom = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -w/2 - 0.3, 0, -h/2 - 0.3,
     w/2 + 0.3, 0, -h/2 - 0.3,
     w/2 + 0.3, 0,  h/2 + 0.3,
    -w/2 - 0.3, 0,  h/2 + 0.3,
     0,        1.4, 0,
  ]);
  const idx = new Uint16Array([
    0,1,4, 1,2,4, 2,3,4, 3,0,4, 0,3,1, 1,3,2,
  ]);
  roofGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  roofGeom.setIndex(new THREE.BufferAttribute(idx, 1));
  roofGeom.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeom, M.roof);
  roof.position.set(0, wallH, 0);
  g.add(roof);
  // Build wall colliders.
  const colliders = [];
  const cos = Math.cos(p.ry || 0), sin = Math.sin(p.ry || 0);
  function addBoxCollider(lx, lz, hw, hh) {
    colliders.push({
      type: 'box',
      cx: p.cx + cos * lx - sin * lz,
      cz: p.cz + sin * lx + cos * lz,
      hw, hh, ry: p.ry || 0,
    });
  }
  addBoxCollider(0, -h / 2, w / 2, 0.1);                                // back
  addBoxCollider(-w / 2, 0, 0.1, h / 2);                                 // left
  addBoxCollider(w / 2, 0, 0.1, h / 2);                                  // right
  addBoxCollider(-(w / 2 - slabW / 2), h / 2, slabW / 2, 0.1);          // front-left slab
  addBoxCollider(  w / 2 - slabW / 2,  h / 2, slabW / 2, 0.1);          // front-right slab
  return { group: g, colliders };
}

// =====================================================================
// BUNKER — fortaleza militar de hormigón con paredes altas, techo bajo
// y puerta amplia. Crates boss-tier adentro custodiados por 4 scientists.
// =====================================================================
function buildBunker(p) {
  const g = new THREE.Group();
  const w = 8.0, h = 8.0;     // 8x8m footprint
  const wallH = 3.6;
  const wallThick = 0.4;
  // Material concreto gris-verdoso oscuro.
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x4a4e44, roughness: 0.92, metalness: 0.05 });
  const accentMat   = new THREE.MeshStandardMaterial({ color: 0x2a2c28, roughness: 0.6, metalness: 0.3 });
  const lightMat    = new THREE.MeshStandardMaterial({ color: 0xff5040, emissive: 0xff3030, emissiveIntensity: 1.4 });
  // Paredes — back, left, right + dos slabs frontales con doorway.
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallThick), concreteMat);
  back.position.set(0, wallH / 2, -h / 2); g.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, h), concreteMat);
    side.position.set(sx * (w / 2), wallH / 2, 0); g.add(side);
  }
  // Front con doorway de 2.0m.
  const doorW = 2.0;
  const slabW = (w - doorW) / 2;
  for (const sx of [-1, 1]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, wallH, wallThick), concreteMat);
    slab.position.set(sx * (w / 2 - slabW / 2), wallH / 2, h / 2);
    g.add(slab);
  }
  // Dintel sobre la puerta.
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(doorW + 0.2, 0.5, wallThick + 0.1), accentMat);
  lintel.position.set(0, wallH - 0.25, h / 2); g.add(lintel);
  // Techo plano grueso.
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.4, h + 0.6), accentMat);
  roof.position.set(0, wallH + 0.2, 0); g.add(roof);
  // Lámpara roja parpadeante sobre el dintel (afuera).
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), lightMat);
  lamp.position.set(0, wallH + 0.5, h / 2 + 0.3); g.add(lamp);
  // Luz interior para que se vea oscuro pero visible adentro.
  const interiorLight = new THREE.PointLight(0xff4030, 1.6, 14, 2);
  interiorLight.position.set(0, wallH - 0.6, 0); g.add(interiorLight);
  // Stencil "BUNKER" arriba de la puerta usando un panel emisivo amarillo.
  const stencil = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xfff080, emissive: 0xc0a020, emissiveIntensity: 0.8 }));
  stencil.position.set(0, wallH * 0.7, h / 2 + 0.22); g.add(stencil);
  // Rampa de hormigón al frente — escalones descendentes simulando que
  // el bunker continúa bajo tierra (visual). 4 escalones cada vez más
  // bajos, sumando profundidad detrás de la puerta.
  const stepMat = concreteMat;
  for (let s = 0; s < 4; s++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.4, 0.6), stepMat,
    );
    step.position.set(0, -0.15 - s * 0.3, h / 2 + 1.0 + s * 0.6);
    g.add(step);
  }
  // Sacos terreros laterales a la entrada — props militares que
  // refuerzan el feel de fortaleza.
  const sandMat = new THREE.MeshStandardMaterial({ color: 0x8a7a4a, roughness: 0.95 });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.7), sandMat);
      bag.position.set(sx * (w / 2 + 0.5), 0.16 + i * 0.32, h / 2 + 0.6 - i * 0.2);
      bag.rotation.y = Math.random() * 0.2;
      g.add(bag);
    }
  }
  // Crates pre-renderizados via loot.js — el server los spawnea con
  // posiciones cerca de p.cx, p.cz. Acá no agregamos nada extra.
  // Colliders de las paredes.
  const colliders = [];
  const cos = Math.cos(p.ry || 0), sin = Math.sin(p.ry || 0);
  function addBoxCollider(lx, lz, hw, hh) {
    colliders.push({
      type: 'box',
      cx: p.cx + cos * lx - sin * lz,
      cz: p.cz + sin * lx + cos * lz,
      hw, hh, ry: p.ry || 0,
    });
  }
  addBoxCollider(0, -h / 2, w / 2, wallThick);                                  // back
  addBoxCollider(-w / 2, 0, wallThick, h / 2);                                   // left
  addBoxCollider(w / 2, 0, wallThick, h / 2);                                    // right
  addBoxCollider(-(w / 2 - slabW / 2), h / 2, slabW / 2, wallThick);            // front-left slab
  addBoxCollider(  w / 2 - slabW / 2,  h / 2, slabW / 2, wallThick);            // front-right slab
  // Pulse animation handle para que la lampara parpadee.
  g.userData.lamp = lamp;
  return { group: g, colliders };
}

// =====================================================================
// Public — main.js calls setPoiLayouts after welcome.
// =====================================================================
const _poiSmokes = [];
const _bunkerLamps = [];
let _smokePhase = 0;
export function setPoiLayouts(pois) {
  for (const p of pois) {
    let built = null;
    if (p.kind === 'helicopter') built = buildHelicopter(p);
    else if (p.kind === 'gas') built = buildGasStation(p);
    else if (p.kind === 'cabin') built = buildCabin(p);
    else if (p.kind === 'bunker') built = buildBunker(p);
    if (!built) continue;
    built.group.position.set(p.cx, heightAt(p.cx, p.cz), p.cz);
    built.group.rotation.y = p.ry || 0;
    scene.add(built.group);
    if (built.group.userData.smoke) _poiSmokes.push(built.group.userData.smoke);
    if (built.group.userData.lamp) _bunkerLamps.push(built.group.userData.lamp);
    for (const c of built.colliders) obstacles.push(c);
  }
}

export function updatePoi(dt) {
  // Lazy bob the smoke meshes for a touch of life.
  _smokePhase += dt * 1.6;
  for (const s of _poiSmokes) {
    s.scale.y = 1.0 + Math.sin(_smokePhase) * 0.05;
    s.rotation.y += dt * 0.4;
  }
  // Lámparas de búnker parpadean rojo (alerta).
  for (const lamp of _bunkerLamps) {
    if (lamp.material) {
      lamp.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(_smokePhase * 2)) * 1.4;
    }
  }
}
