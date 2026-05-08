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
  const isCity = type === 'city';
  const floors = b.floors | 0 || 1;
  const kind = b.kind || 'normal';
  // Ruined: top floor parcialmente derrumbado, no roof, paredes rotas.
  // Visual decay para contrastar con bloques intactos controlados por cientificos.
  const isRuined = kind === 'ruined';
  const isHighLoot = kind === 'high_loot';
  const isBossTower = kind === 'boss_tower';
  // Materiales — police azul, hospital blanco, ruined gris quemado,
  // high_loot acero limpio (intact zone), boss_tower acero rojizo intimidante.
  const mats = isCity
    ? { wall: MATS.cityWall, trim: MATS.cityTrim, roof: MATS.cityRoof, glass: MATS.cityGlass }
    : { wall: MATS.townWall, trim: MATS.townTrim, roof: MATS.townRoof };
  // Override por kind especial.
  let wallMat = mats.wall;
  if (kind === 'police') {
    wallMat = new THREE.MeshStandardMaterial({ color: 0x3a4a78, roughness: 0.7 });
  } else if (kind === 'hospital') {
    wallMat = new THREE.MeshStandardMaterial({ color: 0xe8e8ec, roughness: 0.7 });
  } else if (isRuined) {
    // Hormigon viejo, ennegrecido, oxidado por explosiones pasadas.
    wallMat = new THREE.MeshStandardMaterial({ color: 0x5a5450, roughness: 0.95 });
  } else if (isHighLoot) {
    // Acero limpio + emisivo dorado tenue para indicar zona "viva".
    wallMat = new THREE.MeshStandardMaterial({ color: 0x8a8e96, roughness: 0.55, metalness: 0.45, emissive: 0x402810, emissiveIntensity: 0.18 });
  } else if (isBossTower) {
    // Acero industrial muy oscuro con tinte rojizo emisivo — torre del jefe.
    wallMat = new THREE.MeshStandardMaterial({ color: 0x2c2025, roughness: 0.5, metalness: 0.6, emissive: 0x401010, emissiveIntensity: 0.25 });
  }

  const w = b.w, h = b.h;
  const halfW = w / 2, halfH = h / 2;
  const groundY = heightAt(b.wx, b.wz);
  // Ruined: el ultimo piso esta colapsado (mitad de altura, sin techo).
  const totalH = isRuined && floors > 1
    ? WALL_HEIGHT * (floors - 1) + WALL_HEIGHT * 0.5
    : WALL_HEIGHT * floors;
  const fullH = WALL_HEIGHT * floors;

  // Building con N pisos = paredes apiladas verticalmente.
  // Back wall (-Z) — solid, alta. Ruined: silueta dentada.
  if (isRuined) {
    // Back wall en 3 segmentos de altura desigual (silueta de pared rota).
    const segs = [
      { x: -halfW * 0.6, w: w * 0.35, h: totalH * 0.95 },
      { x:  0,             w: w * 0.30, h: totalH * 0.65 },
      { x:  halfW * 0.6, w: w * 0.30, h: totalH * 0.85 },
    ];
    for (const s of segs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, WALL_THICK), wallMat);
      m.position.set(s.x, s.h / 2, -halfH + WALL_THICK / 2);
      g.add(m);
    }
  } else {
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(w, totalH, WALL_THICK), wallMat,
    );
    back.position.set(0, totalH / 2, -halfH + WALL_THICK / 2);
    g.add(back);
  }
  for (const sx of [-1, 1]) {
    const sideH = isRuined ? totalH * (0.6 + Math.random() * 0.35) : totalH;
    const side = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICK, sideH, h), wallMat,
    );
    side.position.set(sx * (halfW - WALL_THICK / 2), sideH / 2, 0);
    g.add(side);
  }
  // Front: doorway en planta baja + slabs frontales en pisos superiores.
  const slabW = (w - DOOR_WIDTH) / 2;
  // Planta baja frontal (con doorway).
  for (const sx of [-1, 1]) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(slabW, WALL_HEIGHT, WALL_THICK), wallMat,
    );
    slab.position.set(sx * (halfW - slabW / 2), WALL_HEIGHT / 2, halfH - WALL_THICK / 2);
    g.add(slab);
  }
  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_WIDTH, WALL_HEIGHT - DOOR_HEIGHT, WALL_THICK), mats.trim,
  );
  lintel.position.set(0, DOOR_HEIGHT + (WALL_HEIGHT - DOOR_HEIGHT) / 2, halfH - WALL_THICK / 2);
  g.add(lintel);
  // Pisos superiores: pared frontal sólida + ventanas.
  if (floors > 1) {
    for (let f = 1; f < floors; f++) {
      const yBase = WALL_HEIGHT * f;
      const upperFront = new THREE.Mesh(
        new THREE.BoxGeometry(w, WALL_HEIGHT, WALL_THICK), wallMat,
      );
      upperFront.position.set(0, yBase + WALL_HEIGHT / 2, halfH - WALL_THICK / 2);
      g.add(upperFront);
    }
    // Ventanas: 2-3 cuadrados de glass por piso por pared (front + sides).
    const windowMat = MATS.cityGlass;
    const winW = Math.min(0.9, w / 6);
    const winH = 1.0;
    for (let f = 0; f < floors; f++) {
      const yBase = WALL_HEIGHT * f;
      const winY = yBase + WALL_HEIGHT * 0.55;
      // Ventanas frontales (saltando la planta baja en la columna central).
      const winsPerSide = 2;
      for (let i = 0; i < winsPerSide; i++) {
        const offset = (i - (winsPerSide - 1) / 2) * (w / (winsPerSide + 1));
        // Front (excluye doorway en piso 0).
        if (f > 0 || Math.abs(offset) > DOOR_WIDTH / 2 + 0.4) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.06), windowMat);
          win.position.set(offset, winY, halfH - WALL_THICK / 2 - 0.04);
          g.add(win);
        }
        // Side walls.
        const winSide = new THREE.Mesh(new THREE.BoxGeometry(0.06, winH, winW), windowMat);
        for (const sx of [-1, 1]) {
          const ws = winSide.clone();
          ws.position.set(sx * (halfW - WALL_THICK / 2 - 0.04), winY, offset);
          g.add(ws);
        }
      }
    }
  }

  // Roof — flat para multipisos + city, pitched para town 1 piso.
  // Ruined: NO roof (cielo abierto, escombros caidos).
  if (isRuined) {
    // Escombros al borde del techo: 5 boxes pequenos esparcidos.
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const dx = (Math.random() - 0.5) * w * 0.7;
      const dz = (Math.random() - 0.5) * h * 0.7;
      const ds = 0.4 + Math.random() * 0.7;
      const debris = new THREE.Mesh(new THREE.BoxGeometry(ds, ds * 0.5, ds), debrisMat);
      debris.position.set(dx, totalH * 0.5 + Math.random() * 1.5, dz);
      debris.rotation.set(Math.random(), Math.random(), Math.random());
      g.add(debris);
    }
    // Una viga colgando del techo roto.
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.18, 0.18), debrisMat);
    beam.position.set(0, totalH * 0.85, halfH * 0.3);
    beam.rotation.z = 0.35;
    g.add(beam);
  } else if (isCity || floors > 1 || kind === 'police' || kind === 'hospital') {
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.4, 0.30, h + 0.4), mats.roof,
    );
    roof.position.set(0, totalH + 0.15, 0);
    g.add(roof);
    if (isCity && floors === 1) {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 0.05, h * 0.3), mats.glass);
      glass.position.set(0, totalH + 0.30, 0);
      g.add(glass);
    }
    // High-loot rooftop: pilar emisivo dorado para flaggear desde lejos.
    if (isHighLoot) {
      const beaconMat = new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xffa030, emissiveIntensity: 1.4 });
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.45), beaconMat);
      beacon.position.set(0, totalH + 0.85, 0);
      g.add(beacon);
      // Cuatro luces de alerta en las esquinas del techo.
      const alertMat = new THREE.MeshStandardMaterial({ color: 0xff4020, emissive: 0xff4020, emissiveIntensity: 1.1 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const al = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), alertMat);
        al.position.set(sx * (halfW - 0.5), totalH + 0.4, sz * (halfH - 0.5));
        al.userData.isAlertLight = true;
        g.add(al);
        cityAlertLights.push(al);
      }
    }
    // BOSS TOWER rooftop: antena masiva + faro rojo pulsante visible desde
    // todo el mapa. Marca el edificio del boss desde lejos.
    if (isBossTower) {
      // Antena central (masiva).
      const antMat = new THREE.MeshStandardMaterial({ color: 0x404044, roughness: 0.5, metalness: 0.8 });
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 18, 8), antMat);
      antenna.position.set(0, totalH + 9, 0);
      g.add(antenna);
      // Punta emisiva roja parpadeante.
      const tipMat = new THREE.MeshStandardMaterial({ color: 0xff2010, emissive: 0xff2010, emissiveIntensity: 2.0 });
      const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), tipMat);
      tip.position.set(0, totalH + 18.5, 0);
      tip.userData.isAlertLight = true;
      g.add(tip);
      cityAlertLights.push(tip);
      // 4 reflectores rojos en las esquinas del techo.
      const spotMat = new THREE.MeshStandardMaterial({ color: 0xff3020, emissive: 0xff3020, emissiveIntensity: 1.6 });
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), spotMat);
        sp.position.set(sx * (halfW - 1.2), totalH + 0.5, sz * (halfH - 1.2));
        sp.userData.isAlertLight = true;
        g.add(sp);
        cityAlertLights.push(sp);
      }
      // Letrero gigante "HELIX" sobre la fachada principal.
      const labelMat = new THREE.MeshStandardMaterial({ color: 0xff4020, emissive: 0xff4020, emissiveIntensity: 1.4 });
      const label = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 1.5, 0.15), labelMat);
      label.position.set(0, totalH * 0.85, halfH + 0.1);
      g.add(label);
    }
  } else {
    // Pitched wood roof (1 piso town).
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
      0, 3, 1, 1, 3, 2,
    ]);
    roofGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    roofGeom.setIndex(new THREE.BufferAttribute(idx, 1));
    roofGeom.computeVertexNormals();
    const roof = new THREE.Mesh(roofGeom, mats.roof);
    roof.position.set(0, totalH, 0);
    g.add(roof);
  }

  // Emblems para police/hospital — sobre el dintel, exterior.
  if (kind === 'police') {
    const starMat = new THREE.MeshStandardMaterial({ color: 0x4080ff, emissive: 0x2050c0, emissiveIntensity: 1.2 });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), starMat);
    star.position.set(0, WALL_HEIGHT + 0.5, halfH + 0.05);
    star.scale.set(1, 1, 0.3);
    g.add(star);
    // Letras "POLICÍA" como caja amarilla.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xfff080, emissive: 0xc0a020, emissiveIntensity: 0.7 }));
    sign.position.set(0, WALL_HEIGHT - 0.1, halfH + 0.06);
    g.add(sign);
  } else if (kind === 'hospital') {
    const crossMat = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xc02020, emissiveIntensity: 1.2 });
    // Cruz médica = 2 boxes perpendiculares.
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 0.06), crossMat);
    v.position.set(0, WALL_HEIGHT + 0.5, halfH + 0.05);
    g.add(v);
    const hor = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.06), crossMat);
    hor.position.set(0, WALL_HEIGHT + 0.5, halfH + 0.05);
    g.add(hor);
    // Sign blanco con letras.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x808080, emissiveIntensity: 0.4 }));
    sign.position.set(0, WALL_HEIGHT - 0.1, halfH + 0.06);
    g.add(sign);
  } else if (isHighLoot) {
    // Emblema dorado romboide sobre la puerta: zona "viva" del laboratorio.
    const emblemMat = new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xffa040, emissiveIntensity: 1.1, metalness: 0.6, roughness: 0.35 });
    const emblem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), emblemMat);
    emblem.position.set(0, WALL_HEIGHT + 0.55, halfH + 0.05);
    emblem.scale.set(1, 1, 0.25);
    g.add(emblem);
    // Sign dorado bajo el emblema.
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xffd060, emissive: 0xc09020, emissiveIntensity: 0.8 }));
    sign.position.set(0, WALL_HEIGHT - 0.05, halfH + 0.06);
    g.add(sign);
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

// Helix Lab ahora tiene 80 edificios (9x9 grid x 10.5m = ~94m de span).
// El muro perimetral se expande de ±60 a ±70 para envolver la ciudad densa
// con margen visual entre las torres y la valla.
const CITY_HALF = 70; // wall extends ±70 m from town center → 140x140 m walled compound
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
const _townGroups = new Map();   // townId → THREE.Group con todos los edificios

export function setTownLayouts(towns) {
  for (const t of towns) {
    // Place absolute coords on each building (server already includes wx/wz
    // on its side, but in welcome we serialise dx/dz for compactness).
    for (const b of t.buildings) {
      b.wx = t.cx + b.dx;
      b.wz = t.cz + b.dz;
    }
    const townGroup = new THREE.Group();
    townGroup.userData.townId = t.id;
    for (let i = 0; i < t.buildings.length; i++) {
      const { group, colliders } = buildBuilding(t.buildings[i], t.type);
      townGroup.add(group);
      for (const c of colliders) obstacles.push(c);
    }
    scene.add(townGroup);
    _townGroups.set(t.id, townGroup);
    scene.add(buildSign(t));
    // Cities (Helix Lab) get a perimeter wall + watchtowers + props for
    // a Rust-like dangerous-base feel.
    if (t.type === 'city') {
      const cityExtras = buildCityFortifications(t);
      townGroup.add(cityExtras.group);
      for (const c of cityExtras.colliders) obstacles.push(c);
    }
  }
}

// =====================================================================
// markCityDestroyed — el jugador disparó el cañón nuclear contra Helix
// Lab. Bajamos los edificios al suelo (escombro) o los hundimos parcial-
// mente para visualizar la destrucción. Versión simple: tinta a gris
// quemado + escala vertical 0.4 + offset hacia abajo.
// =====================================================================
const _destroyedTowns = new Set();
export function isCityDestroyed(townId) { return _destroyedTowns.has(townId); }
export function markCityDestroyed(townId) {
  if (_destroyedTowns.has(townId)) return;
  _destroyedTowns.add(townId);
  const tg = _townGroups.get(townId);
  if (!tg) return;
  // Para cada building del grupo, lo aplastamos al ~30% de altura y lo
  // ennegrecemos (override material a uno común "ash").
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x2a2825, roughness: 1.0 });
  tg.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = ashMat;
    }
  });
  // Aplastá el grupo entero — escala Y 0.3, ligero hundimiento.
  tg.scale.y = 0.3;
  tg.position.y -= 0.5;
  // Quitá las luces de alerta (la ciudad está muerta).
  for (let i = cityAlertLights.length - 1; i >= 0; i--) {
    const al = cityAlertLights[i];
    if (al.material) {
      al.material.emissiveIntensity = 0;
      al.material.color = new THREE.Color(0x222222);
    }
  }
}
