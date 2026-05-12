// Weapons: pistol + rifle. Each is a raycast hit-scan weapon. On click,
// raycast against zombie meshes; if it hits, send `shoot` to server with
// hit zombie id and damage. Server applies the damage.

import * as THREE from 'three';
import { camera, scene } from './three-setup.js';
import { enemies } from './entities.js';
import { network } from './network.js';
import { player, keys } from './player.js';
import * as inv from './inventory.js';
import * as sfx from './sounds.js';
import { spawnTracer, spawnDamageNumber, spawnBulletHole } from './effects.js';
import { scene as worldScene } from './three-setup.js';
import * as ammoTypes from './ammo-types.js';
import { getActiveTool } from './tools.js';
import * as attachments from './attachments.js';
import * as weaponTiers from './weapon-tiers.js';
import { spawnMagDrop } from './mag-drop.js';

// Each weapon names the inventory key it consumes per shot. magazineSize
// caps the loaded round count; reload pulls from the inventory pool.
//
// shotgun fires `pellets` per shot at high spread.
// sniper has a slow cooldown but huge damage; auto-zooms when ADS held.
const WEAPONS = {
  pistol:   { dmg: 4,  cooldown: 0.5,  range: 120, auto: false, name: 'PISTOLA',     ammo: 'bullet_p',     magazineSize: 12, reloadTime: 1.2, aggroRange: 18 },
  rifle:    { dmg: 6,  cooldown: 0.12, range: 250, auto: true,  name: 'RIFLE',       ammo: 'bullet_r',     requires: 'rifle_pickup',   magazineSize: 30, reloadTime: 1.8, aggroRange: 32 },
  smg:      { dmg: 3,  cooldown: 0.07, range: 180, auto: true,  name: 'SMG',         ammo: 'bullet_smg',   requires: 'smg_pickup',     magazineSize: 35, reloadTime: 2.0, aggroRange: 24 },
  shotgun:  { dmg: 5,  cooldown: 0.85, range: 60,  auto: false, name: 'ESCOPETA',    ammo: 'shell',        requires: 'shotgun_pickup', magazineSize: 6,  reloadTime: 2.4, aggroRange: 30, pellets: 8, spread: 0.18 },
  // Sniper — sin caída de bala (noDrop). Trayectoria recta hasta 500m.
  sniper:   { dmg: 90, cooldown: 1.6,  range: 500, auto: false, name: 'SNIPER',      ammo: 'sniper_round', requires: 'sniper_pickup',  magazineSize: 5,  reloadTime: 2.8, aggroRange: 42, noDrop: true },
  // Ballesta — silenciosa por naturaleza. Caída de dardo significativa.
  crossbow: { dmg: 60, cooldown: 1.2,  range: 150, auto: false, name: 'BALLESTA',    ammo: 'bolt',         requires: 'crossbow_pickup',magazineSize: 1,  reloadTime: 1.4, aggroRange: 12, intrinsicSilence: true },
  // ====== Nuevas armas v1.2 ======
  // AK — full auto, mucha potencia, cadencia más lenta que rifle, aggroRange grande.
  ak:       { dmg: 12, cooldown: 0.16, range: 280, auto: true,  name: 'AK-47',       ammo: 'bullet_762',     requires: 'ak_pickup',      magazineSize: 30, reloadTime: 2.2, aggroRange: 40 },
  // Semi-auto — alta precisión, sin auto, daño alto.
  semi:     { dmg: 22, cooldown: 0.35, range: 320, auto: false, name: 'SEMI-AUTO',   ammo: 'bullet_marksman',requires: 'semi_pickup',    magazineSize: 10, reloadTime: 2.0, aggroRange: 36 },
  // Lanzagranadas — proyectil que explota en impacto. ammo gl_round.
  gl:       { dmg: 80, cooldown: 1.5,  range: 200, auto: false, name: 'LANZAGRANADAS', ammo: 'gl_round',     requires: 'gl_pickup',      magazineSize: 1,  reloadTime: 2.6, aggroRange: 50, explosive: true, explosionRadius: 6 },
  // Gatling — cadencia extrema, daño bajo por bala, magazín enorme.
  gatling:  { dmg: 4,  cooldown: 0.04, range: 200, auto: true,  name: 'GATLING',     ammo: 'bullet_r',       requires: 'gatling_pickup', magazineSize: 200,reloadTime: 5.0, aggroRange: 50 },
  // Nuke — 1 shot. Mata todo en 30m radio. Solo 1 ammo (de boss body).
  nuke:     { dmg: 9999, cooldown: 5,  range: 100, auto: false, name: 'CAÑON NUCLEAR', ammo: 'nuke_round',   requires: 'nuke_pickup',    magazineSize: 1,  reloadTime: 99, aggroRange: 100, explosive: true, explosionRadius: 30, isNuke: true },
};

// =====================================================================
// State — `active` arranca null: no hay arma equipada hasta que el
// jugador la asigna desde el hotbar (o presiona la tecla del slot).
// =====================================================================
let active = null;
let cooldown = 0;
let mouseDown = false;
const loaded = { pistol: 12, rifle: 0, smg: 0, shotgun: 0, sniper: 0, crossbow: 0, ak: 0, semi: 0, gl: 0, gatling: 0, nuke: 0 };
let reloading = false;
let reloadTimer = 0;
const ray = new THREE.Raycaster();
ray.camera = camera; // necesario para que raycast no rompa con Sprites en escena
const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();

// =====================================================================
// VISIBLE WEAPON MESHES — uno por tipo de arma con detalle 3D.
// Cada arma vive en su propio Group dentro de gunGroup. Solo se muestra
// el del arma activa.
// =====================================================================
import { makeWeaponMesh, makeFlashlightAttachment } from './weapon-models.js';

const gunGroup = new THREE.Group();
// Pre-build all weapon meshes (cached, hidden until selected).
const weaponMeshes = {};
const WEAPON_TYPES_LIST = ['pistol', 'rifle', 'ak', 'semi', 'smg', 'shotgun', 'sniper', 'crossbow', 'gl', 'gatling', 'nuke'];
for (const wt of WEAPON_TYPES_LIST) {
  const m = makeWeaponMesh(wt);
  m.visible = false;
  weaponMeshes[wt] = m;
  gunGroup.add(m);
  // Pre-build flashlight attachment mesh per weapon (hidden by default).
  // Posicionado al lado del cañon (rail).
  const fl = makeFlashlightAttachment();
  fl.position.set(0.020, -0.020, -0.15);   // mounted on rail near muzzle
  fl.visible = false;
  fl.userData.isFlashlightAttach = true;
  m.add(fl);
}
// Cuando los attachments cambian (equip/desequip), refresh visual.
attachments.onChange?.(() => updateGunVisual());
// gunBody alias — apunta al mesh del arma activa. Para retro-compat con
// codigo que hace gunBody.position.y etc.
let gunBody = weaponMeshes.pistol;

// Reflex sight — diseño realista CUADRADO. Se equipa por arma vía
// attachments.equip(). Cuando ADS, el dot queda en el centro de la
// pantalla porque REFLEX_X=0.18 cancela AIM_POS.x=-0.18.
const REFLEX_X = 0.18, REFLEX_Y = -0.06, REFLEX_Z = -0.40;
const REFLEX_SIZE = 0.045;        // ~4.5cm cuadrado, mucho más chico
const FRAME_THICK = 0.006;        // espesor del marco
const FRAME_DEPTH = 0.022;        // profundidad del marco
// Marco metálico oscuro — 4 barras formando un cuadrado.
const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.85 });
const reflexFrameTop = new THREE.Mesh(
  new THREE.BoxGeometry(REFLEX_SIZE + FRAME_THICK * 2, FRAME_THICK, FRAME_DEPTH), frameMat,
);
reflexFrameTop.position.set(REFLEX_X, REFLEX_Y + REFLEX_SIZE / 2 + FRAME_THICK / 2, REFLEX_Z);
const reflexFrameBot = new THREE.Mesh(
  new THREE.BoxGeometry(REFLEX_SIZE + FRAME_THICK * 2, FRAME_THICK, FRAME_DEPTH), frameMat,
);
reflexFrameBot.position.set(REFLEX_X, REFLEX_Y - REFLEX_SIZE / 2 - FRAME_THICK / 2, REFLEX_Z);
const reflexFrameL = new THREE.Mesh(
  new THREE.BoxGeometry(FRAME_THICK, REFLEX_SIZE, FRAME_DEPTH), frameMat,
);
reflexFrameL.position.set(REFLEX_X - REFLEX_SIZE / 2 - FRAME_THICK / 2, REFLEX_Y, REFLEX_Z);
const reflexFrameR = new THREE.Mesh(
  new THREE.BoxGeometry(FRAME_THICK, REFLEX_SIZE, FRAME_DEPTH), frameMat,
);
reflexFrameR.position.set(REFLEX_X + REFLEX_SIZE / 2 + FRAME_THICK / 2, REFLEX_Y, REFLEX_Z);
// Base / soporte abajo — para que se vea anclado al arma.
const reflexMount = new THREE.Mesh(
  new THREE.BoxGeometry(REFLEX_SIZE * 0.6, FRAME_THICK * 1.5, FRAME_DEPTH * 1.2), frameMat,
);
reflexMount.position.set(REFLEX_X, REFLEX_Y - REFLEX_SIZE / 2 - FRAME_THICK * 1.8, REFLEX_Z);
// Glass casi totalmente transparente con leve tinte.
const reflexGlass = new THREE.Mesh(
  new THREE.PlaneGeometry(REFLEX_SIZE, REFLEX_SIZE),
  new THREE.MeshBasicMaterial({ color: 0x6090b0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
);
reflexGlass.position.set(REFLEX_X, REFLEX_Y, REFLEX_Z);
// Dot rojo MUY pequeño — punto de mira preciso.
const reflexDot = new THREE.Mesh(
  new THREE.CircleGeometry(0.0025, 12),
  new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }),
);
reflexDot.position.set(REFLEX_X, REFLEX_Y, REFLEX_Z + 0.0005);
reflexDot.renderOrder = 999;
const reflexGroup = new THREE.Group();
reflexGroup.add(reflexFrameTop);
reflexGroup.add(reflexFrameBot);
reflexGroup.add(reflexFrameL);
reflexGroup.add(reflexFrameR);
reflexGroup.add(reflexMount);
reflexGroup.add(reflexGlass);
reflexGroup.add(reflexDot);
reflexGroup.visible = false;
gunGroup.add(reflexGroup);

const muzzle = new THREE.PointLight(0xffaa44, 0, 4);
muzzle.position.set(0.18, -0.16, -0.82);
gunGroup.add(muzzle);

// Always-on small fill light attached to the camera so weapon and nearby
// objects get a baseline read regardless of sun direction.
const camFill = new THREE.PointLight(0xfff0d8, 0.5, 6, 1.5);
camFill.position.set(0, 0, 0);
gunGroup.add(camFill);

// Posiciones HIP (default) y AIM (ADS) del gunGroup. La diferencia entre
// (0.18, -0.18, -0.45) hip de los hijos y la posición target del group
// hace que al ADS la pistola quede centrada y elevada para alinearse con
// la cruz central. _aimT es el blend (0=hip, 1=aim).
const HIP_POS = new THREE.Vector3(0, 0, 0);
const AIM_POS = new THREE.Vector3(-0.18, 0.06, 0.04);
let _aimT = 0;
let _aimTarget = 0;
export function setAimMode(on) { _aimTarget = on ? 1 : 0; }

camera.add(gunGroup);

// Mesh de granada en mano — visible solo cuando player.grenadeMode == true.
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a28, roughness: 0.85 });
const grenadeAccentMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.6 });
const grenadeMesh = new THREE.Group();
const grenadeBody = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), grenadeMat);
grenadeBody.scale.set(1, 1.2, 1);
grenadeMesh.add(grenadeBody);
const grenadePin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 6), grenadeAccentMat);
grenadePin.position.y = 0.13;
grenadeMesh.add(grenadePin);
const grenadeRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), grenadeAccentMat);
grenadeRing.position.y = 0.18;
grenadeMesh.add(grenadeRing);
grenadeMesh.position.set(0.18, -0.18, -0.45);
grenadeMesh.visible = false;
gunGroup.add(grenadeMesh);

scene.add(camera); // make sure camera is in scene so its children render

// =====================================================================
// Input
// =====================================================================
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') startReload();
  // Hotbar weapon select happens via main.js (handleHotbarSlot calls
  // selectWeaponBySlot). Direct number keys here would conflict.
});

export function selectWeapon(name) {
  const cfg = WEAPONS[name];
  if (!cfg) return;
  if (cfg.requires && !inv.has(cfg.requires, 1)) return;
  if (reloading) cancelReload();
  active = name; updateGunVisual();
}
export function getActive() { return active; }
export function getLoaded() { return active ? (loaded[active] | 0) : 0; }
export function isReloading() { return reloading; }
// Llamado al deseleccionar (drop del item del hotbar). Oculta el arma.
export function deselectWeapon() {
  active = null;
  // Hide all weapon meshes immediatamente (no esperar al proximo frame).
  for (const m of Object.values(weaponMeshes)) m.visible = false;
  reflexGroup.visible = false;
  gunGroup.visible = false;
}

function startReload() {
  if (reloading) return;
  const cfg = WEAPONS[active];
  if (!cfg) return;
  const cap = magCap();
  if ((loaded[active] | 0) >= cap) return;              // already full
  if (!inv.has(cfg.ammo, 1)) return;                    // no ammo to load
  reloading = true;
  // Perk INGENIERO acorta tiempo de recarga (reloadSpeedMult <1).
  reloadTimer = cfg.reloadTime * (player.reloadSpeedMult || 1);
  sfx.playEmpty?.(); // mechanical click stand-in
  // Visual: mag drop al iniciar.
  spawnMagDrop();
}

// Capacidad de cargador efectiva — base * tier multiplier (legendario
// +50%) * ext_mag attachment bonus (+50%).
function magCap() {
  if (!active) return 0;
  const cfg = WEAPONS[active];
  let cap = cfg.magazineSize * weaponTiers.getMagMul(active);
  if (attachments.has(active, 'ext_mag')) cap *= 1.5;
  return Math.round(cap);
}
function cancelReload() { reloading = false; reloadTimer = 0; }
function finishReload() {
  const cfg = WEAPONS[active];
  if (!cfg) return;
  // Extended-mag attachment increases capacity by 50%.
  const cap = magCap();
  const need = cap - (loaded[active] | 0);
  const got = Math.min(need, inv.get(cfg.ammo));
  if (got > 0) {
    loaded[active] = (loaded[active] | 0) + got;
    inv.remove(cfg.ammo, got);
  }
  reloading = false;
  reloadTimer = 0;
}
addEventListener('mousedown', (e) => { if (e.button === 0) { mouseDown = true; tryFire(); } });
addEventListener('mouseup',   (e) => { if (e.button === 0)   mouseDown = false; });

function updateGunVisual() {
  // Mostrar SOLO el mesh del arma activa, esconder el resto.
  for (const [type, m] of Object.entries(weaponMeshes)) {
    m.visible = (type === active);
    // Toggle visual del flashlight attachment segun attachments state.
    for (const child of m.children) {
      if (child.userData?.isFlashlightAttach) {
        child.visible = attachments.has(type, 'flashlight_attach');
      }
    }
  }
  if (active && weaponMeshes[active]) {
    gunBody = weaponMeshes[active];
  }
}

function tryFire() {
  if (!player.locked || player.hp <= 0) return;
  if (!active) return;        // sin arma equipada → no disparo
  if (cooldown > 0 || reloading) return;
  // Si hay una herramienta melee activa (cuchillo/hacha/pico) o estás en
  // modo granada, NO disparamos.
  if (getActiveTool()) return;
  if (player.grenadeMode) return;
  const cfg = WEAPONS[active];
  // Resuelve el tipo de munición activo. Si elegiste especial pero no
  // tenés stock, fallback automático a normal.
  ammoTypes.fallbackToAvailable(active);
  const ammoMeta = ammoTypes.getActiveAmmo(active) || { type: 'normal', item: cfg.ammo };
  const isSpecial = ammoMeta.type !== 'normal';

  // God mode bypasses ammo entirely — never reload, never run dry.
  if (!player.godMode) {
    if (isSpecial) {
      // Munición especial NO usa cargador — consumís directo del pool.
      if (!inv.has(ammoMeta.item, 1)) {
        sfx.playEmpty();
        cooldown = 0.25;
        mouseDown = false;
        return;
      }
      inv.remove(ammoMeta.item, 1);
    } else {
      if ((loaded[active] | 0) <= 0) {
        if (inv.has(cfg.ammo, 1)) {
          startReload();
        } else {
          sfx.playEmpty();
          cooldown = 0.25;
          mouseDown = false;
        }
        return;
      }
      loaded[active] = (loaded[active] | 0) - 1;
    }
  }
  cooldown = cfg.cooldown;
  // Sound — silencer mutes the report. La ballesta es silenciosa por
  // naturaleza (intrinsicSilence en su cfg).
  const silent = attachments.has(active, 'silencer') || cfg.intrinsicSilence;
  if (silent) sfx.playEmpty?.();
  else if (active === 'rifle' || active === 'sniper') sfx.playRifle(0);
  else sfx.playPistol(0);
  // Recoil — pitch the camera up a bit, scaled by weapon damage.
  pendingRecoil += cfg.dmg * 0.0015 + (active === 'sniper' ? 0.05 : 0);

  // Build raycast from camera center, transformed into world space.
  camera.getWorldPosition(_origin);
  camera.getWorldDirection(_dir);
  // Build candidate list: every enemy's mesh subtree.
  const candidates = [];
  const eMap = new Map();
  for (const [id, e] of enemies) {
    e.mesh.traverse(c => { if (c.isMesh) { candidates.push(c); eMap.set(c, id); } });
  }

  // BULLET DROP — armas estándar tienen caída a partir de 100m. El sniper
  // y la ballesta tienen `noDrop` o son intrínsecamente rectos (ballesta
  // tiene noDrop:false → cae más por su naturaleza). Implementación:
  //   1. Probe inicial raycast lineal para estimar distancia objetivo.
  //   2. Si pasa de 100m (y la arma tiene drop), ajustar dir.y hacia
  //      abajo proporcional al exceso de distancia, y re-raycastear.
  let probeRay = new THREE.Raycaster(_origin.clone(), _dir.clone(), 0.3, cfg.range);
  probeRay.camera = camera;
  const probeHits = probeRay.intersectObjects(candidates, false);
  let estimatedDist = cfg.range;
  if (probeHits.length > 0) estimatedDist = probeHits[0].distance;
  // Aplica drop si la arma no es noDrop y la distancia excede 100m.
  if (!cfg.noDrop && estimatedDist > 100) {
    // 4 cm de caída por metro extra después de 100m. A 200m son 4m de
    // drop — tenés que apuntar más arriba.
    const dropMeters = (estimatedDist - 100) * 0.04;
    // Convertimos drop en metros a un ángulo aproximado (drop / dist).
    const yOffset = -dropMeters / estimatedDist;
    _dir.y += yOffset;
    _dir.normalize();
  }
  ray.set(_origin, _dir);
  ray.far = cfg.range;
  const hits = ray.intersectObjects(candidates, false);
  let hitId = null;
  let isHeadshot = false;
  let hitPoint = null;
  if (hits.length > 0) {
    const hit = hits[0];
    hitPoint = hit.point;
    let obj = hit.object;
    while (obj && !eMap.has(obj)) obj = obj.parent;
    if (obj) {
      hitId = eMap.get(obj);
      const enemyEntry = enemies.get(hitId);
      if (enemyEntry) {
        const localY = hit.point.y - enemyEntry.mesh.position.y;
        isHeadshot = localY >= 1.45;
      }
    }
  } else {
    // No enemy hit — second raycast against the whole scene to place a
    // bullet hole on whatever the player shot. CRITICAL: tenemos que
    // (a) setear rs.camera = camera porque hay Sprites en la escena
    // (damage numbers) que requieren camera para raycastear, y (b)
    // filtrar Sprites/lights/cámara para que no contaminen el resultado
    // de bullet hole.
    const rs = new THREE.Raycaster(_origin.clone(), _dir.clone(), 0.2, cfg.range);
    rs.camera = camera;
    const candidates2 = [];
    for (const ch of worldScene.children) {
      if (ch === camera) continue;          // gun group + camFill cuelgan acá
      if (ch.isSprite || ch.isLight) continue;
      candidates2.push(ch);
    }
    const sceneHits = rs.intersectObjects(candidates2, true);
    if (sceneHits.length > 0) {
      const sh = sceneHits[0];
      if (sh.distance > 0.4 && sh.face && !sh.object.isSprite) {
        const normal = sh.face.normal.clone();
        normal.transformDirection(sh.object.matrixWorld);
        spawnBulletHole(sh.point, normal);
      }
    }
  }

  // Final damage. Perks: gunDamageMult (gunslinger), headshotMult (eagle_eye).
  // Munición especial: AP +30% dmg, INC marca burn al server.
  // Tier de arma: legendario +30%, raro +15%, común +0%.
  const hsMul = (player.headshotMult || 2.0);
  const gunMul = (player.gunDamageMult || 1);
  const ammoDmgMul = ammoMeta.dmgMul || 1;
  const tierMul = weaponTiers.getDmgMul(active);
  const finalDmg = Math.round((isHeadshot ? cfg.dmg * hsMul : cfg.dmg) * gunMul * ammoDmgMul * tierMul);
  // Manda flags al server: incendiary (DoT), silenced (sigilo).
  const silencedShot = silent;
  network.shoot(_origin, _dir, hitId, finalDmg, {
    incendiary: !!ammoMeta.burn,
    silenced: silencedShot,
  });
  // === NUKE === — además del raycast, mandamos un mensaje 'nuke' al
  // server con la posición de impacto. Si cae dentro del radio de Helix
  // Lab, el server destruye la ciudad y manda banner de victoria.
  if (cfg.isNuke) {
    // Punto de impacto = donde el rayo llegó (lejos si no pegó nada).
    const impact = _origin.clone().add(_dir.clone().multiplyScalar(cfg.range));
    network.fireNuke?.(impact.x, impact.z);
  }

  // Damage number floats up at impact.
  if (hitId !== null && hitPoint) {
    spawnDamageNumber(hitPoint.x, hitPoint.y - 0.5, hitPoint.z, finalDmg, isHeadshot);
    if (isHeadshot) sfx.playKill();
  }

  // Tracer from muzzle to either the hit point or a far point along ray.
  const muzzleWorld = new THREE.Vector3();
  muzzle.getWorldPosition(muzzleWorld);
  let endPoint;
  if (hits.length > 0) {
    endPoint = hits[0].point.clone();
  } else {
    endPoint = _origin.clone().add(_dir.clone().multiplyScalar(cfg.range));
  }
  spawnTracer(muzzleWorld, endPoint);

  // Local muzzle flash + hit marker. Kill upgrade happens from main.js
  // when the server confirms the entity died within a short window.
  muzzle.intensity = 6;
  flashHitMarker(hitId !== null);
  if (hitId !== null) lastShotInfo = { hitId, t: performance.now() };
}

// Exported so main.js can detect a kill arriving shortly after a hit and
// upgrade the marker to red.
let lastShotInfo = { hitId: null, t: 0 };
export function lastShotWithinKillWindow(enemyId) {
  if (lastShotInfo.hitId !== enemyId) return false;
  return (performance.now() - lastShotInfo.t) < 350;
}

// Renamed: flashHitMarker now lives in hud.js. Kept the local function as
// a thin wrapper so existing call sites keep working without touching the
// fire path. `kill` is set later by main.js when an eDead arrives within
// ~250 ms of a shot.
import { flashHitMarker as hudFlashHitMarker } from './hud.js';
function flashHitMarker(hit, isKill = false) {
  if (!hit && !isKill) return;
  hudFlashHitMarker(isKill);
}

// =====================================================================
// Per-frame
// =====================================================================
// Walk bob — el arma se mueve en figura de 8 mientras caminás. ADS
// reduce el bob a casi cero. Sway responde al mover el mouse.
let _bobPhase = 0;
let _swayX = 0, _swayY = 0;
let _lastYaw = 0, _lastPitch = 0;

export function updateWeapons(dt) {
  // Ocultar el arma de fuego cuando NO hay arma equipada, hay tool melee
  // o estás en modo granada.
  gunGroup.visible = (!!active && !getActiveTool()) || player.grenadeMode;
  // Granada visible solo en modo granada. El arma activa se oculta.
  grenadeMesh.visible = !!player.grenadeMode;
  if (player.grenadeMode) {
    // Ocultar el mesh del arma activa para que solo se vea la granada.
    for (const m of Object.values(weaponMeshes)) m.visible = false;
    reflexGroup.visible = false;
  } else if (active && weaponMeshes[active]) {
    // Mostrar solo el mesh del arma activa.
    for (const [type, m] of Object.entries(weaponMeshes)) {
      m.visible = (type === active);
    }
  } else {
    // No hay arma activa Y no hay granada → ocultar TODAS las armas.
    // Defensive: aunque gunGroup.visible=false ya las oculta, esto
    // garantiza que al re-activar el grupo nada quede colgado.
    for (const m of Object.values(weaponMeshes)) m.visible = false;
    reflexGroup.visible = false;
  }
  // Lerp ADS: muever el grupo a posición AIM (centrada) cuando _aimTarget=1.
  _aimT += (_aimTarget - _aimT) * (1 - Math.exp(-12 * dt));
  // Walk bob — figura 8, atenuado durante ADS.
  const moving = !!(keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD']);
  const sprint = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  if (moving) {
    _bobPhase += dt * (sprint ? 14 : 9);
  } else {
    _bobPhase *= 0.92;
  }
  const bobAmpX = (1 - _aimT) * (sprint ? 0.040 : 0.022) * (moving ? 1 : 0.18);
  const bobAmpY = (1 - _aimT) * (sprint ? 0.030 : 0.018) * (moving ? 1 : 0.18);
  const bobX = Math.sin(_bobPhase) * bobAmpX;
  const bobY = Math.abs(Math.cos(_bobPhase)) * bobAmpY - bobAmpY * 0.4;
  // Weapon sway — el arma reacciona ligeramente al mover el mouse (yaw/pitch).
  const yaw = player.yaw(), pitch = player.pitch();
  const dyaw = yaw - _lastYaw;
  const dpitch = pitch - _lastPitch;
  _lastYaw = yaw; _lastPitch = pitch;
  // Lerp del sway hacia 0 + add el delta del frame con factor.
  _swayX = _swayX * Math.exp(-8 * dt) + dyaw * 0.15;
  _swayY = _swayY * Math.exp(-8 * dt) + dpitch * 0.15;
  // Clamp para no romper visual.
  _swayX = Math.max(-0.05, Math.min(0.05, _swayX));
  _swayY = Math.max(-0.05, Math.min(0.05, _swayY));
  gunGroup.position.x = HIP_POS.x + (AIM_POS.x - HIP_POS.x) * _aimT + bobX + _swayX;
  gunGroup.position.y = HIP_POS.y + (AIM_POS.y - HIP_POS.y) * _aimT + bobY + _swayY;
  gunGroup.position.z = HIP_POS.z + (AIM_POS.z - HIP_POS.z) * _aimT;
  // Reflex sight visible solo si hay arma activa y tiene scope equipado.
  reflexGroup.visible = !!active && attachments.has(active, 'scope');
  if (cooldown > 0) cooldown -= dt;
  if (muzzle.intensity > 0) muzzle.intensity = Math.max(0, muzzle.intensity - dt * 30);
  // Reload progress.
  if (reloading && active) {
    reloadTimer -= dt;
    // Slight visual sag of the gun while reloading.
    if (gunBody) gunBody.position.y = -0.18 - 0.06 * Math.sin(Math.PI * (1 - reloadTimer / WEAPONS[active].reloadTime));
    if (reloadTimer <= 0) {
      finishReload();
      if (gunBody) gunBody.position.y = -0.18;
    }
  }
  // Auto-fire (rifle only) while held.
  if (active && mouseDown && WEAPONS[active].auto && cooldown <= 0 && !reloading) tryFire();
}

export function activeWeaponName() { return active ? WEAPONS[active].name : '—'; }
export function activeWeaponMeta() {
  if (!active) return { name: '—', loaded: 0, ammo: 0, cap: 0 };
  const cfg = WEAPONS[active];
  const cap = magCap();
  return { name: cfg.name, loaded: loaded[active] | 0, ammo: inv.get(cfg.ammo), cap };
}
// Allow main.js to drive weapon selection via the hotbar.
// (Legacy slot-based — main.js prefers selectWeapon(name) directly now.)
export function selectWeaponBySlot(slotIdx) {
  if (slotIdx === 0) selectWeapon('pistol');
  else if (slotIdx === 1) selectWeapon('rifle');
  else if (slotIdx === 7) selectWeapon('shotgun');
  else if (slotIdx === 8) selectWeapon('sniper');
  // Slots 2..6 reserved for non-firing tools (handled in main.js).
}

// Helper para que el HUD/UI sepa qué armas existen.
export function listWeapons() { return Object.keys(WEAPONS); }

// Recoil exposed so main.js can drain it into the camera each frame.
let pendingRecoil = 0;
export function consumeRecoil() {
  const r = pendingRecoil;
  pendingRecoil = 0;
  return r;
}
