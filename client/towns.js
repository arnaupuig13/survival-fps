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
const DOOR_WIDTH = 1.6;
const DOOR_HEIGHT = 2.2;

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
// Build a single building. Returns { group, colliders }.
//
// The building is a hollow box: 4 walls + roof + floor sill. One wall has
// a door-shaped hole (subtractive — we use 2 wall slabs flanking the gap,
// plus a lintel above).
// =====================================================================
function buildBuilding(b, type, isLootBuilding) {
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

  // Loot crate inside if this is the looted building.
  if (isLootBuilding) {
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.65, 0.65), MATS.lootCrate,
    );
    crate.position.set(0, 0.32, -halfH * 0.4);
    g.add(crate);
    // Glowing trim band so it reads from the doorway.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.08, 0.67), MATS.lootBand,
    );
    band.position.set(0, 0.5, -halfH * 0.4);
    g.add(band);
  }

  // Apply rotation, then world position.
  g.rotation.y = b.ry || 0;
  g.position.set(b.wx, groundY, b.wz);

  // Compute building world-space bounding circle for collider list. Player
  // collision uses circle-sweep, so a single radius covering most of the
  // footprint is fine — it's slightly conservative (player can't hug the
  // wall corners) but predictable and cheap.
  const rad = Math.max(w, h) * 0.55;
  return { group: g, collider: { x: b.wx, z: b.wz, r: rad } };
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
    // Pick one random building per town to hold the loot crate. Deterministic
    // by town id + cx so all clients agree.
    const seedSeed = (t.cx | 0) * 73856093 ^ (t.cz | 0) * 19349663;
    const lootIdx = Math.abs(seedSeed) % t.buildings.length;

    for (let i = 0; i < t.buildings.length; i++) {
      const b = t.buildings[i];
      const { group, collider } = buildBuilding(b, t.type, i === lootIdx);
      scene.add(group);
      obstacles.push(collider);
    }
    scene.add(buildSign(t));
  }
}
