// Town buildings + signage. Server sends town layouts in `welcome`; this
// module receives them via setTownLayouts() and builds the 3D meshes.
//
// Two visual variants:
//   town  → rustic wooden cabin (brown walls, sloped wood roof)
//   city  → concrete lab (gray walls, flat roof, glass strips)
//
// Each building leaves an open door on its +Z face (or +X if rotated 90°)
// so the player can walk in. A 4-wall + roof box; one wall has a hole.

import * as THREE from 'three';
import { scene } from './three-setup.js';
import { heightAt, obstacles } from './world.js';

const WALL_THICK = 0.25;
const WALL_HEIGHT = 3.0;
const DOOR_WIDTH = 3.0;          // ampliado para evitar atascos en doorway
const DOOR_HEIGHT = 2.4;

// Cached materials so we don't allocate one per wall.
const MATS = {
  townWall:    new THREE.MeshStandardMaterial({ color: 0x6a4f31, roughness: 0.9 }),
  townTrim:    new THREE.MeshStandardMaterial({ color: 0x42301a, roughness: 0.85 }),
  townRoof:    new THREE.MeshStandardMaterial({ color: 0x4d2c1a, roughness: 0.85 }),
  cityWall:    new THREE.MeshStandardMaterial({ color: 0x9a9aa0, roughness: 0.7, metalness: 0.1 }),
  cityTrim:    new THREE.MeshStandardMaterial({ color: 0x444448, roughness: 0.45, metalness: 0.6 }),
  cityRoof:    new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.55, metalness: 0.4 }),
  cityGlass:   new THREE.MeshStandardMaterial({ color: 0x2a4a6e, roughness: 0.05, metalness: 0.7, emissive: 0x103040, emissiveIntensity: 0.4 }),
  signMat:     new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.4 }),
  signPostMat: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }),
  lootCrate:   new THREE.MeshStandardMaterial({ color: 0x6a4a22, roughness: 0.8 }),
  lootBand:    new THREE.MeshStandardMaterial({ color: 0xf0c060, roughness: 0.55, metalness: 0.5, emissive: 0x402810, emissiveIntensity: 0.6 }),
};

// =====================================================================
// Build a single building. Returns { group, collider }.
//
// The building is a hollow box: 4 walls + roof + floor sill. One wall has
// a door-shaped hole (subtractive — we use 2 wall slabs flanking the gap,
// plus a lintel above).
// =====================================================================
function buildBuilding(b, type) {
  const g = new THREE.Group();
  const mats = (type === 'city')
    ? { wall: MATS.cityWall, trim: MATS.cityTrim, roof: MATS.cityRoof, glass: MATS.cityGlass }
    : { wall: MATS.townWall, trim: MATS.townTrim, roof: MATS.townRoof };

  const w = b.w, h = b.h;
  const halfW = w / 2, halfH = h / 2;
  const groundY = heightAt(b.wx, b.wz);

  // Build walls in local coords (door faces +Z by convention).
  // Back wall (-Z) — solid.
  const back = new THREE.Mesh(
    new THREE.BoxGeometry(w, WALL_HEIGHT, WALL_THICK), mats.wall,
  );
  back.position.set(0, WALL_HEIGHT / 2, -halfH + WALL_THICK / 2);
  g.add(back);

  // Side walls (-X and +X) — solid.
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICK, WALL_HEIGHT, h), mats.wall,
    );
    side.position.set(sx * (halfW - WALL_THICK / 2), WALL_HEIGHT / 2, 0);
    g.add(side);
  }

  // Front wall (+Z) — split into two slabs flanking the door + lintel above.
  const slabW = (w - DOOR_WIDTH) / 2;
  for (const sx of [-1, 1]) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, WALL_HEIGHT, WALL_THICK), mats.wall,
    );
    slab.position.set(sx * (halfW - slabW / 2), WALL_HEIGHT / 2, halfH - WALL_THICK / 2);
    g.add(slab);
  }
  // Lintel above the door.
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_WIDTH, WALL_HEIGHT - DOOR_HEIGHT, WALL_THICK), mats.trim,
  );
  lintel.position.set(0, DOOR_HEIGHT + (WALL_HEIGHT - DOOR_HEIGHT) / 2, halfH - WALL_THICK / 2);
  g.add(lintel);

  // Roof.
  if (type === 'city') {
    // Flat roof slab + glass strip skylight.
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.2, 0.18, h + 0.2), mats.roof,
    );
    roof.position.set(0, WALL_HEIGHT + 0.09, 0);
    g.add(roof);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.5, 0.05, h * 0.3), mats.glass,
    );
    glass.position.set(0, WALL_HEIGHT + 0.18, 0);
    g.add(glass);
  } else {
    // Pitched wood roof (simple two-tri prism).
    const roofGeom = new THREE.BufferGeometry();
    const verts = new Float32Array([
      -halfW - 0.3, 0, -halfH - 0.3,
       halfW + 0.3, 0, -halfH - 0.3,
       halfW + 0.3, 0,  halfH + 0.3,
      -halfW - 0.3, 0,  halfH + 0.3,
       0,           1.4, 0,
    ]);
    const idx = new Uint16Array([
      0, 1, 4,
      1, 2, 4,
      2, 3, 4,
      3, 0, 4,
      0, 3, 1, 1, 3, 2, // floor of roof closes it
    ]);
    roofGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    roofGeom.setIndex(new THREE.BufferAttribute(idx, 1));
    roofGeom.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeom, mats.roof);
    roof.position.set(0, WALL_HEIGHT, 0);
    g.add(roof);
  }

  // (Loot crates are spawned by the server now and managed by loot.js so
  // they can be opened, looted and removed across all clients.)

  // Apply rotation, then world position.
  g.rotation.y = b.ry || 0;
  g.position.set(b.wx, groundY, b.wz);

  // Build per-wall colliders (boxes) so the player can walk through the
  // doorway. The single circular collider used in v1.0 closed off the
  // building entirely — the user couldn't enter their own loot houses.
  // Each wall is a thin rotated AABB; player.js does closest-point
  // collision against them.
  // (slabW was computed above for the front-wall mesh slabs.)
  const wallLocals = [
    { lx: 0,                        lz: -halfH + WALL_THICK / 2, w: w,                          h: WALL_THICK },               // back
    { lx: -halfW + WALL_THICK / 2,  lz: 0,                       w: WALL_THICK,                  h: h },                        // left
    { lx:  halfW - WALL_THICK / 2,  lz: 0,                       w: WALL_THICK,                  h: h },                        // right
    { lx: -halfW + slabW / 2,       lz:  halfH - WALL_THICK / 2, w: slabW,                       h: WALL_THICK },               // front-left slab
    { lx:  halfW - slabW / 2,       lz:  halfH - WALL_THICK / 2, w: slabW,                       h: WALL_THICK },               // front-right slab
  ];
  const cos = Math.cos(b.ry || 0), sin = Math.sin(b.ry || 0);
  const colliders = wallLocals.map(s => ({
    type: 'box',
    cx: b.wx + cos * s.lx - sin * s.lz,
    cz: b.wz + sin * s.lx + cos * s.lz,
    hw: s.w / 2,
    hh: s.h / 2,
    ry: b.ry || 0,
  }));
  return { group: g, colliders };
}

// =====================================================================
// Build a town sign — yellow plate on a black post, placed at the center.
// =====================================================================
function buildSign(town) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6), MATS.signPostMat,
  );
  post.position.set(0, 1.4, 0);
  g.add(post);
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.55, 0.06), MATS.signMat,
  );
  plate.position.set(0, 2.4, 0);
  g.add(plate);

  // Render the label as a canvas texture stretched across the plate.
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f0c060'; ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(town.label.toUpperCase(), 256, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
  const label = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.07), labelMat);
  label.position.set(0, 2.4, 0.02);
  g.add(label);

  const groundY = heightAt(town.cx, town.cz);
  // Place sign at the south edge of the town footprint so it's visible
  // walking in from a path.
  const signZ = town.cz + 18;
  g.position.set(town.cx, heightAt(town.cx, signZ), signZ);
  return g;
}

// =====================================================================
// City fortifications — perimeter wall + corner watchtowers + props.
// Only built for the Helix Lab so the science town reads as dangerous.
// Returns { group, colliders } so the world can drop them in scene + obstacles.
// =====================================================================

const CITY_HALF = 60; // wall extends ±60 m from town center → 120x120 m walled compound
const WALL_H = 4.5;
const WALL_T = 0.55;
const GATE_WIDTH = 7;

const CITY_MATS = {
  wall:    new THREE.MeshStandardMaterial({ color: 0x6c6c70, roughness: 0.85 }),
  trim:    new THREE.MeshStandardMaterial({ color: 0x3c3c40, roughness: 0.6, metalness: 0.4 }),
  rust:    new THREE.MeshStandardMaterial({ color: 0x8a4020, roughness: 0.9 }),
  sandbag: new THREE.MeshStandardMaterial({ color: 0x6e5a3a, roughness: 0.95 }),
  alert:   new THREE.MeshStandardMaterial({ color: 0xff2020, roughness: 0.4, emissive: 0xff2020, emissiveIntensity: 0.85 }),
  barrel:  new THREE.MeshStandardMaterial({ color: 0x4a3020, roughness: 0.8, metalness: 0.3 }),
  metal:   new THREE.MeshStandardMaterial({ color: 0x404448, roughness: 0.5, metalness: 0.7 }),
};

function buildCityFortifications(town) {
  const g = new THREE.Group();
  const colliders = [];
  const { cx, cz } = town;

  // ---- Perimeter walls. Two gates: one south (+Z, facing the player's
  //      typical approach), one east (+X). Walls are split into segments
  //      around each gate so we can render the gap clearly.
  const wallY = heightAt(cx, cz);
  const segments = [
    // North wall (full)
    { x1: -CITY_HALF, z1: -CITY_HALF, x2:  CITY_HALF, z2: -CITY_HALF },
    // South wall split around the south gate (centered on +Z)
    { x1: -CITY_HALF, z1:  CITY_HALF, x2: -GATE_WIDTH / 2, z2: CITY_HALF },
    { x1:  GATE_WIDTH / 2, z1: CITY_HALF, x2: CITY_HALF, z2:  CITY_HALF },
    // West wall (full)
    { x1: -CITY_HALF, z1: -CITY_HALF, x2: -CITY_HALF, z2: CITY_HALF },
    // East wall split around the east gate (centered on +X)
    { x1:  CITY_HALF, z1: -CITY_HALF, x2: CITY_HALF, z2: -GATE_WIDTH / 2 },
    { x1:  CITY_HALF, z1:  GATE_WIDTH / 2, x2: CITY_HALF, z2: CITY_HALF },
  ];
  for (const s of segments) {
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    if (len < 0.1) continue;
    const ang = Math.atan2(s.x2 - s.x1, s.z2 - s.z1);
    const mx = (s.x1 + s.x2) / 2, mz = (s.z1 + s.z2) / 2;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(WALL_T, WALL_H, len), CITY_MATS.wall);
    wall.position.set(cx + mx, wallY + WALL_H / 2, cz + mz);
    wall.rotation.y = ang;
    g.add(wall);
    // Top trim — darker cap slab so the wall reads silhouetted at night.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(WALL_T + 0.2, 0.18, len), CITY_MATS.trim);
    cap.position.set(cx + mx, wallY + WALL_H + 0.09, cz + mz);
    cap.rotation.y = ang;
    g.add(cap);
    // Rust streak strip — vertical thin plate for industrial decay.
    if (len > 8) {
      const rustOffset = (len / 4) * (Math.random() < 0.5 ? -1 : 1);
      const rust = new THREE.Mesh(new THREE.BoxGeometry(WALL_T + 0.05, WALL_H * 0.6, 0.6), CITY_MATS.rust);
      rust.position.set(
        cx + mx + Math.cos(ang) * rustOffset,
        wallY + WALL_H * 0.45,
        cz + mz - Math.sin(ang) * rustOffset,
      );
      rust.rotation.y = ang;
      g.add(rust);
    }
    // Collider for player.js (box).
    colliders.push({
      type: 'box',
      cx: cx + mx, cz: cz + mz,
      hw: WALL_T / 2, hh: len / 2,
      ry: ang,
    });
  }

  // ---- Watchtowers in each corner. Pyramidal base with a railed platform.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tx = cx + sx * (CITY_HALF - 2.5);
    const tz = cz + sz * (CITY_HALF - 2.5);
    const ty = heightAt(tx, tz);
    // Base — 4 vertical posts.
    for (const [ox, oz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.32, 7.0, 0.32), CITY_MATS.metal);
      post.position.set(tx + ox, ty + 3.5, tz + oz);
      g.add(post);
    }
    // Cross bracing.
    for (const sign of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 0.16), CITY_MATS.metal);
      brace.position.set(tx, ty + 2.0, tz + sign * 1.4);
      g.add(brace);
      const brace2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.4), CITY_MATS.metal);
      brace2.position.set(tx + sign * 1.4, ty + 2.0, tz);
      g.add(brace2);
    }
    // Platform deck on top.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.2, 3.6), CITY_MATS.wall);
    deck.position.set(tx, ty + 7.05, tz);
    g.add(deck);
    // Railing — 4 sides, bar at ~1m above deck.
    for (const sign of [-1, 1]) {
      const rail1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 0.08), CITY_MATS.metal);
      rail1.position.set(tx, ty + 8.05, tz + sign * 1.8);
      g.add(rail1);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.6), CITY_MATS.metal);
      rail2.position.set(tx + sign * 1.8, ty + 8.05, tz);
      g.add(rail2);
    }
    // Roof slab — covers half the deck, tilted.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 4.0), CITY_MATS.trim);
    roof.position.set(tx, ty + 8.7, tz);
    roof.rotation.x = -0.2;
    g.add(roof);
    // Red blinking emergency light on top.
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), CITY_MATS.alert);
    light.position.set(tx, ty + 9.0, tz);
    light.userData.isAlertLight = true;
    g.add(light);
    // Tower base collider (cylinder approx — circle is enough at this scale).
    colliders.push({ x: tx, z: tz, r: 2.0 });
  }

  // ---- Sandbag piles flanking each gate.
  function placeSandbags(gx, gz, axis) {
    // Two stacks, one on each side of the gate. axis 'x' or 'z' tells us which way the gate runs.
    const sandbagGeom = new THREE.BoxGeometry(0.8, 0.32, 0.5);
    for (const side of [-1, 1]) {
      const off = side * (GATE_WIDTH / 2 + 1.2);
      const ox = axis === 'z' ? off : 0;
      const oz = axis === 'x' ? off : 0;
      const baseX = gx + ox, baseZ = gz + oz;
      const baseY = heightAt(baseX, baseZ);
      // 3 rows of 4 bags, pyramidal.
      for (let row = 0; row < 3; row++) {
        const count = 4 - row;
        for (let i = 0; i < count; i++) {
          const bag = new THREE.Mesh(sandbagGeom, CITY_MATS.sandbag);
          // Stagger lengthwise along the wall axis.
          const lateral = (i - (count - 1) / 2) * 0.85;
          const bx = axis === 'x' ? baseX + lateral : baseX;
          const bz = axis === 'z' ? baseZ + lateral : baseZ;
          bag.position.set(bx, baseY + 0.16 + row * 0.3, bz);
          bag.rotation.y = (Math.random() - 0.5) * 0.25;
          if (axis === 'x') bag.rotation.y += Math.PI / 2;
          g.add(bag);
        }
      }
      colliders.push({ x: baseX, z: baseZ, r: 1.4 });
    }
  }
  placeSandbags(cx, cz + CITY_HALF, 'x');         // south gate
  placeSandbags(cx + CITY_HALF, cz, 'z');         // east gate

  // ---- Industrial props inside the compound — rusted barrels + a couple
  //      of shipping containers acting as cover/blocks.
  let rng = town.cx * 73856093 ^ town.cz * 19349663;
  function rand() { rng = (rng * 9301 + 49297) % 233280; return rng / 233280; }
  for (let i = 0; i < 8; i++) {
    const bx = cx + (rand() * 2 - 1) * (CITY_HALF - 6);
    const bz = cz + (rand() * 2 - 1) * (CITY_HALF - 6);
    const by = heightAt(bx, bz);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.0, 12), CITY_MATS.barrel);
    barrel.position.set(bx, by + 0.5, bz);
    g.add(barrel);
    // Top stripe — yellow-orange band.
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 12), CITY_MATS.alert);
    band.position.set(bx, by + 0.85, bz);
    g.add(band);
    colliders.push({ x: bx, z: bz, r: 0.55 });
  }
  // Two shipping containers — used as additional visual blocking.
  for (let i = 0; i < 2; i++) {
    const bx = cx + (rand() * 2 - 1) * (CITY_HALF - 10);
    const bz = cz + (rand() * 2 - 1) * (CITY_HALF - 10);
    const by = heightAt(bx, bz);
    const containerColor = i === 0 ? 0x3a5a78 : 0x6a3018;
    const cmat = new THREE.MeshStandardMaterial({ color: containerColor, roughness: 0.7, metalness: 0.3 });
    const cmesh = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 2.4), cmat);
    cmesh.position.set(bx, by + 1.3, bz);
    cmesh.rotation.y = rand() * Math.PI;
    g.add(cmesh);
    // Ribs — vertical detail strips.
    for (let r = 0; r < 5; r++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 2.4), CITY_MATS.trim);
      rib.position.copy(cmesh.position);
      rib.position.x = cmesh.position.x + (r - 2) * 1.3;
      rib.rotation.y = cmesh.rotation.y;
      g.add(rib);
    }
    colliders.push({ x: bx, z: bz, r: 3.4 });
  }

  // ---- Centered radio mast for visibility from far away.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 14, 6), CITY_MATS.metal);
  mast.position.set(cx + 18, heightAt(cx + 18, cz - 12) + 7, cz - 12);
  g.add(mast);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), CITY_MATS.alert);
  tip.position.set(mast.position.x, mast.position.y + 7.2, mast.position.z);
  tip.userData.isAlertLight = true;
  g.add(tip);

  // Track all alert lights so updateCityLights() can pulse their emission.
  cityAlertLights.push(...g.children.filter(c => c.userData?.isAlertLight));

  return { group: g, colliders };
}

// =====================================================================
// Collider debug visualizer (tecla K). Renders every obstacle as a
// wireframe so we can confirm doorway gaps line up with the meshes.
// =====================================================================
let _debugGroup = null;
export function toggleColliderDebug() {
  if (_debugGroup) {
    scene.remove(_debugGroup);
    _debugGroup.traverse(o => { if (o.geometry) o.geometry.dispose?.(); if (o.material) o.material.dispose?.(); });
    _debugGroup = null;
    return false;
  }
  _debugGroup = new THREE.Group();
  const boxMat = new THREE.LineBasicMaterial({ color: 0xffea00 });
  const circleMat = new THREE.LineBasicMaterial({ color: 0x40c0ff });
  for (const o of obstacles) {
    if (o.type === 'box') {
      const geom = new THREE.BoxGeometry(o.hw * 2, 0.6, o.hh * 2);
      const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geom), boxMat);
      wire.position.set(o.cx, heightAt(o.cx, o.cz) + 0.3, o.cz);
      wire.rotation.y = o.ry || 0;
      _debugGroup.add(wire);
    } else {
      const geom = new THREE.RingGeometry((o.r || 0.5) - 0.05, (o.r || 0.5) + 0.05, 16);
      geom.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: 0x40c0ff, side: THREE.DoubleSide }));
      ring.position.set(o.x, heightAt(o.x, o.z) + 0.05, o.z);
      _debugGroup.add(ring);
    }
  }
  scene.add(_debugGroup);
  return true;
}

// Pulse all alert lights on a sine wave so the city looks alive at night.
const cityAlertLights = [];
let _lightPhase = 0;
export function updateCityLights(dt) {
  _lightPhase += dt * 2.5;
  const k = 0.55 + 0.45 * (Math.sin(_lightPhase) * 0.5 + 0.5);
  for (const m of cityAlertLights) {
    if (m.material) m.material.emissiveIntensity = k * 1.1;
  }
}

// =====================================================================
// Public API — main.js calls setTownLayouts() once welcome arrives.
// =====================================================================
export function setTownLayouts(towns) {
  for (const t of towns) {
    // Place absolute coords on each building (server already includes wx/wz
    // on its side, but in welcome we serialise dx/dz for compactness).
    for (const b of t.buildings) {
      b.wx = t.cx + b.dx;
      b.wz = t.cz + b.dz;
    }
    for (let i = 0; i < t.buildings.length; i++) {
      const { group, colliders } = buildBuilding(t.buildings[i], t.type);
      scene.add(group);
      for (const c of colliders) obstacles.push(c);
    }
    scene.add(buildSign(t));
    // Cities (Helix Lab) get a perimeter wall + watchtowers + props for
    // a Rust-like dangerous-base feel.
    if (t.type === 'city') {
      const cityExtras = buildCityFortifications(t);
      scene.add(cityExtras.group);
      for (const c of cityExtras.colliders) obstacles.push(c);
    }
  }
}
