import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { initInput, getMove, clearInput } from './input.js';
import { buildNeo, animateNeo, buildAgent } from './characters.js';
import { BulletSystem } from './bullets.js';
import { DigitalRain, hitFlash } from './effects.js';
import * as UI from './ui.js';
import { Sfx } from './sfx.js';
import { SceneManager } from './scenes.js';

// ---------- Constants ----------
const ARENA = { minX: -6, maxX: 6, minZ: -2, maxZ: 3 };
const NEO_SPEED = 6.5;
const MAX_LIVES = 3;
const INVULN_TIME = 1.5;
const SLOWMO_SCALE = 0.35;
const DODGE_SCALE = 0.18;
const DODGE_TIME = 2.2;   // real seconds of bullet time per dodge
const DODGE_CHARGES = 2;  // dodges per level
const STOP_TIME = 3.4;    // real seconds the STOP move freezes the world
const STOP_DROP_AT = 1.5; // seconds into STOP when the frozen bullets fall
const STOP_CHARGES = 1;   // STOP moves per level
const NEO_HEIGHT = 1.9;
const TELEGRAPH = 0.35;

// ---------- Renderer / scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x000000, 20, 48);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 260);
camera.position.set(0, 3.3, 6.8);

// Light colours and strengths are set per scene by SceneManager.
const hemi = new THREE.HemisphereLight(0x99ffbb, 0x001a08, 0.7);
const ambient = new THREE.AmbientLight(0x113322, 0.6);
scene.add(hemi, ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.3);
sun.position.set(5, 12, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 20, bottom: -20, near: 1, far: 50 });
sun.target.position.set(0, 0, -10);
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x00ff66, 0.6);
rim.position.set(0, 4, -20);
scene.add(rim);

// ---------- Environment ----------
// Glowing lines that mark NEO's movement area. Every scene has them; the colour changes per scene.
const borderMat = new THREE.MeshBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.6 });
for (const x of [ARENA.minX - 0.3, ARENA.maxX + 0.3]) {
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, ARENA.maxZ - ARENA.minZ + 0.6), borderMat);
  strip.position.set(x, 0.02, (ARENA.minZ + ARENA.maxZ) / 2);
  scene.add(strip);
}

const scenes = new SceneManager(scene, { hemi, ambient, sun, rim }, {
  rainCanvas: document.getElementById('rain'),
  borderMat,
});
scenes.set(SceneManager.saved());

// ---------- Actors ----------
const neo = buildNeo();
const neoRoot = new THREE.Group();
neo.model.rotation.y = Math.PI; // face the agents (-z)
neoRoot.add(neo.model);
scene.add(neoRoot);

// A shockwave that ripples out from NEO's palm when he uses STOP.
const shockwave = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.5, 64),
  new THREE.MeshBasicMaterial({ color: 0xd8ffe4, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
shockwave.visible = false;
shockwave.userData.life = 0;
scene.add(shockwave);

const bullets = new BulletSystem(scene);
const sfx = new Sfx();
let whizCd = 0; // stops a burst of passing bullets from turning into one long hiss
const rain = new DigitalRain(document.getElementById('rain'));
let agents = [];

function setupAgents(n) {
  for (const a of agents) scene.remove(a.group);
  agents = [];
  for (let i = 0; i < n; i++) {
    const parts = buildAgent();
    const x = n === 1 ? 0 : -5 + (10 * i) / (n - 1);
    const z = -20 - (i % 2) * 1.5;
    parts.group.position.set(x, 0, z);
    scene.add(parts.group);
    agents.push({
      ...parts,
      baseX: x,
      timer: 1.2 + i * 0.45 + Math.random() * 0.4,
      sinceShot: 99,
      raise: 0,
      phase: Math.random() * Math.PI * 2,
    });
  }
}

// ---------- Game state ----------
let state = 'menu'; // menu | playing | paused | dying | complete | gameover | win
let level = 1;
let cfg = LEVELS[0];
let lives = MAX_LIVES;
let elapsed = 0;
let invuln = 0;
let slowmoTimer = 0;
let nearMissCd = 0;
let timeScale = 1;
let shake = 0;
let dyingTimer = 0;
let runPhase = 0;
let dodgeTimer = 0;
let dodgesLeft = DODGE_CHARGES;
let pose = 0; // 0 = standing, 1 = full lean-back dodge
let stopTimer = 0;
let stopsLeft = STOP_CHARGES;
let stopAmt = 0; // 0..1, how far NEO's hand is raised
let stopDropped = false;
let worldTime = 0;
const vel = new THREE.Vector3();

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const camTarget = new THREE.Vector3();

function startLevel(n) {
  level = n;
  cfg = LEVELS[n - 1];
  lives = MAX_LIVES;
  elapsed = 0;
  invuln = 0;
  slowmoTimer = 0;
  nearMissCd = 0;
  timeScale = 1;
  shake = 0;
  dodgeTimer = 0;
  dodgesLeft = DODGE_CHARGES;
  pose = 0;
  stopTimer = 0;
  stopsLeft = STOP_CHARGES;
  stopAmt = 0;
  vel.set(0, 0, 0);
  neoRoot.position.set(0, 0, 0);
  neoRoot.rotation.set(0, 0, 0);
  neo.model.visible = true;
  bullets.clear();
  setupAgents(cfg.agents);
  clearInput();

  UI.setLevelLabel(n);
  UI.setLives(lives, MAX_LIVES);
  UI.setDodges(dodgesLeft, DODGE_CHARGES);
  UI.setStops(stopsLeft, STOP_CHARGES);
  UI.setTimer(0);
  UI.showOverlay(null);
  UI.showHUD(true);
  state = 'playing';
}

function goMenu() {
  state = 'menu';
  bullets.clear();
  neoRoot.position.set(0, 0, 0);
  neoRoot.rotation.set(0, 0, 0);
  neo.model.visible = true;
  timeScale = 1;
  dodgeTimer = 0;
  stopTimer = 0;
  setupAgents(3);
  UI.showHUD(false);
  UI.buildLevelGrid(startLevel);
  UI.buildSceneSelect(scenes.current, (name) => { scenes.set(name); UI.buildSceneSelect(scenes.current); });
  UI.showOverlay('menu');
}

function levelComplete() {
  bullets.clear();
  dodgeTimer = 0;
  stopTimer = 0;
  UI.setUnlocked(level + 1);
  UI.showHUD(false);
  if (level >= LEVELS.length) {
    state = 'win';
    UI.showOverlay('win');
  } else {
    state = 'complete';
    UI.showOverlay('complete');
  }
}

function onHit() {
  lives--;
  UI.setLives(lives, MAX_LIVES);
  hitFlash();
  shake = 0.6;
  invuln = INVULN_TIME;
  sfx.hit();
  if (navigator.vibrate) navigator.vibrate(120);
  if (lives <= 0) {
    state = 'dying';
    dodgeTimer = 0;
    dyingTimer = 1.2;
    slowmoTimer = 1.2;
  }
}

// SPACE / DODGE button: NEO leans back and the world drops into deep bullet time.
function tryDodge() {
  if (state !== 'playing' || dodgesLeft <= 0 || dodgeTimer > 0) return;
  dodgesLeft--;
  dodgeTimer = DODGE_TIME;
  UI.setDodges(dodgesLeft, DODGE_CHARGES);
  sfx.dodgeStart();
}

// P / STOP button: NEO raises his palm. Every bullet stops dead, the world freezes,
// and then the bullets drop to the ground.
function tryStop() {
  if (state !== 'playing' || stopsLeft <= 0 || stopTimer > 0) return;
  stopsLeft--;
  stopTimer = STOP_TIME;
  stopDropped = false;
  dodgeTimer = 0;
  slowmoTimer = 0;
  bullets.freezeAll();
  shockwave.userData.life = 1;
  shockwave.position.set(neoRoot.position.x + 0.15, 1.5, neoRoot.position.z - 0.6);
  shake = 0.2;
  UI.setStops(stopsLeft, STOP_CHARGES);
  sfx.stopPalm();
}

function setPaused(on) {
  if (on && state === 'playing') {
    state = 'paused';
    clearInput();
    sfx.hold(true);
    UI.showOverlay('paused');
  } else if (!on && state === 'paused') {
    state = 'playing';
    UI.showOverlay(null);
    sfx.hold(false);
    clock.getDelta(); // discard the time spent paused
  }
}

// ---------- Shooting ----------
function fire(a) {
  const from = a.muzzle.getWorldPosition(tmpA);
  const target = tmpB.copy(neoRoot.position);
  target.y = 1.05 + Math.random() * 0.6; // chest to head height

  // Leading shots aim where NEO will be when the bullet arrives.
  if (Math.random() < cfg.leadChance) {
    const travel = from.distanceTo(target) / cfg.bulletSpeed;
    target.x = THREE.MathUtils.clamp(target.x + vel.x * travel, ARENA.minX - 0.5, ARENA.maxX + 0.5);
    target.z = THREE.MathUtils.clamp(target.z + vel.z * travel, ARENA.minZ - 0.5, ARENA.maxZ + 0.5);
  }

  const dir = new THREE.Vector3().subVectors(target, from).normalize();
  const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
  const side = Math.random() < 0.5 ? 1 : -1;
  const offsets = [0, side * cfg.spread, -side * cfg.spread].slice(0, cfg.burst);

  for (const o of offsets) {
    const t = target.clone().addScaledVector(perp, o + (Math.random() - 0.5) * 0.3);
    bullets.spawn(from, t.sub(from).normalize(), cfg.bulletSpeed);
  }
  sfx.gunshot({ pan: (from.x - neoRoot.position.x) / 8, rate: timeScale, count: offsets.length });
  a.sinceShot = 0;
}

function updateAgents(dt) {
  const armed = state === 'playing';
  for (const a of agents) {
    if (cfg.strafe && armed) {
      a.group.position.x = a.baseX + Math.sin(worldTime * 0.8 + a.phase) * 1.6;
    }
    a.group.lookAt(neoRoot.position.x, 0, neoRoot.position.z);

    if (armed) {
      a.timer -= dt;
      if (a.timer <= 0) {
        fire(a);
        a.timer = cfg.fireInterval * (0.8 + Math.random() * 0.4);
      }
    }
    a.sinceShot += dt;

    // Telegraph: the agent raises the gun and a red glint appears just before each shot.
    const telegraph = armed && a.timer < TELEGRAPH;
    a.glint.visible = telegraph;
    if (telegraph) a.glint.scale.setScalar(0.7 + Math.sin(worldTime * 40) * 0.3);
    const raiseTarget = telegraph || a.sinceShot < 0.3 ? 1 : 0;
    a.raise += (raiseTarget - a.raise) * Math.min(1, dt * 12);
    a.gunArm.rotation.x = (-Math.PI / 2) * a.raise - (a.sinceShot < 0.08 ? 0.25 : 0); // recoil kick

    a.flash.visible = a.sinceShot < 0.06;
    if (a.flash.visible && dt > 0) a.flash.scale.setScalar(0.8 + Math.random() * 0.8);
  }
}

// ---------- NEO ----------
function updateNeo(rawDt, dt) {
  const p = neoRoot.position;

  if (state === 'playing') {
    // In bullet time NEO keeps nearly all his speed while the world crawls. That's his edge.
    const neoDt = rawDt * (0.85 + 0.15 * timeScale);
    const m = getMove();
    // Slightly slower while leaning back. Rooted to the spot while holding the bullets with STOP.
    const speed = NEO_SPEED * (1 - pose * 0.1) * (1 - stopAmt);
    tmpA.set(m.x * speed, 0, m.z * speed);
    vel.lerp(tmpA, Math.min(1, neoDt * 14));
    p.addScaledVector(vel, neoDt);
    if (p.x < ARENA.minX) { p.x = ARENA.minX; vel.x = 0; }
    if (p.x > ARENA.maxX) { p.x = ARENA.maxX; vel.x = 0; }
    if (p.z < ARENA.minZ) { p.z = ARENA.minZ; vel.z = 0; }
    if (p.z > ARENA.maxZ) { p.z = ARENA.maxZ; vel.z = 0; }

    const speedFrac = Math.min(1, vel.length() / NEO_SPEED);
    runPhase += neoDt * (4 + speedFrac * 10);
    // The model is turned to face -z, so its local axes are the world's, flipped.
    animateNeo(neo, { t: worldTime, runPhase, speed: speedFrac, vx: -vel.x / NEO_SPEED, vz: -vel.z / NEO_SPEED, pose, stop: stopAmt });

    // Lean into sideways movement (less so while in the dodge pose).
    const leanZ = (-vel.x / NEO_SPEED) * 0.22 * (1 - pose);
    const leanX = (vel.z / NEO_SPEED) * 0.1 * (1 - pose);
    neoRoot.rotation.z += (leanZ - neoRoot.rotation.z) * Math.min(1, rawDt * 10);
    neoRoot.rotation.x += (leanX - neoRoot.rotation.x) * Math.min(1, rawDt * 8);

    invuln = Math.max(0, invuln - dt);
    // Blink while invulnerable. Not during STOP, though: the frozen clock would leave him stuck mid-blink.
    neo.model.visible = invuln > 0 && stopAmt < 0.05 ? Math.floor(invuln * 12) % 2 === 0 : true;
  } else if (state === 'dying') {
    neo.model.visible = true;
    neoRoot.rotation.x += (1.45 - neoRoot.rotation.x) * Math.min(1, rawDt * 3);
    neoRoot.rotation.z *= 0.9;
    animateNeo(neo, { t: worldTime, runPhase, speed: 0, vx: 0, vz: 0, pose });
  } else {
    animateNeo(neo, { t: worldTime, runPhase: 0, speed: 0, vx: 0, vz: 0, pose: 0 });
  }
}

// ---------- Camera ----------
const lerp = THREE.MathUtils.lerp;

function updateCamera(rawDt, slowFactor) {
  const p = neoRoot.position;
  if (state === 'menu') {
    const t = worldTime * 0.25;
    camTarget.set(Math.sin(t) * 3, 2.6 + Math.sin(t * 0.7) * 0.4, 6.5);
  } else {
    // Narrow (portrait) screens pull the camera back and up so the arena still fits.
    const narrow = Math.max(0, 1 - camera.aspect);
    camTarget.set(p.x * (0.65 + narrow * 0.3), 3.3 + narrow * 2.5, p.z + 6.8 + narrow * 6);
    // During the dodge the camera swings round to the side, so you can see the lean.
    if (pose > 0.01) {
      const ang = pose * 0.75 * (1 - narrow * 0.8); // portrait screens get a smaller swing
      const dx = camTarget.x - p.x, dz = camTarget.z - p.z;
      camTarget.x = p.x + dx * Math.cos(ang) + dz * Math.sin(ang);
      camTarget.z = p.z - dx * Math.sin(ang) + dz * Math.cos(ang);
      camTarget.y -= pose * 1.2;
    }
  }
  camera.position.lerp(camTarget, 1 - Math.exp(-6 * rawDt));

  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.35;
    camera.position.y += (Math.random() - 0.5) * shake * 0.35;
    shake = Math.max(0, shake - rawDt * 1.8);
  }
  // Normally look past NEO toward the Agents. During the dodge, turn toward NEO so the swing keeps him framed.
  const lk = state === 'menu' ? 0 : pose * (0.65 + 0.3 * Math.max(0, 1 - camera.aspect));
  camera.lookAt(lerp(p.x * 0.35, p.x, lk), lerp(1.3, 0.8, lk), lerp(p.z - 10, p.z - 2, lk));

  const fov = 60 - slowFactor * 10;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov += (fov - camera.fov) * Math.min(1, rawDt * 8);
    camera.updateProjectionMatrix();
  }
}

// ---------- Main loop ----------
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(clock.getDelta(), 0.05);

  if (state === 'paused') {
    renderer.render(scene, camera);
    return;
  }

  slowmoTimer = Math.max(0, slowmoTimer - rawDt);
  nearMissCd = Math.max(0, nearMissCd - rawDt);
  const wasDodging = dodgeTimer > 0;
  dodgeTimer = Math.max(0, dodgeTimer - rawDt);
  if (wasDodging && dodgeTimer === 0 && state === 'playing') sfx.dodgeEnd();
  stopTimer = Math.max(0, stopTimer - rawDt);
  const dodging = dodgeTimer > 0;
  const stopping = stopTimer > 0;
  UI.bulletTime(dodging || stopping);
  if (stopping && !stopDropped && stopTimer < STOP_TIME - STOP_DROP_AT) {
    bullets.dropAll();
    stopDropped = true;
  }
  // Raise the hand quickly, hold it, and lower it in the last moments of the move.
  stopAmt += ((stopping && stopTimer > 0.4 ? 1 : 0) - stopAmt) * Math.min(1, rawDt * 10);

  const targetScale = dodging ? DODGE_SCALE : slowmoTimer > 0 ? SLOWMO_SCALE : 1;
  timeScale += (targetScale - timeScale) * Math.min(1, rawDt * 12);
  const slowFactor = Math.min(1, (1 - timeScale) / (1 - DODGE_SCALE));

  // A near-miss gives a small flinch back. The dodge gives the full lean, held until the last 0.3 s.
  const poseTarget = state !== 'playing' ? 0 : dodging && dodgeTimer > 0.3 ? 1 : slowmoTimer > 0 ? 0.3 : 0;
  pose += (poseTarget - pose) * Math.min(1, rawDt * 7);
  // During STOP the world's clock stands still: Agents, the level timer and the rain all freeze.
  const dt = stopping ? 0 : rawDt * timeScale;
  worldTime += dt;

  if (scenes.showsRain) rain.update(rawDt, stopping ? 0 : timeScale);
  sfx.setSlowmo(Math.max(slowFactor, stopAmt));

  if (state === 'playing') {
    elapsed += dt;
    UI.setTimer(elapsed / cfg.duration);
    if (elapsed >= cfg.duration) levelComplete();
  }

  updateAgents(dt);
  updateNeo(rawDt, dt);

  // Leaning back drops his hitbox under the bullets, which fly at chest height or above.
  // Frozen and falling bullets keep moving in real time, even while the rest of the world is still.
  const res = bullets.update(stopping ? rawDt : dt, neoRoot.position, state === 'playing' && invuln <= 0 && !stopping, NEO_HEIGHT - pose * 0.95);

  whizCd = Math.max(0, whizCd - rawDt);
  for (const e of bullets.events) {
    const pan = (e.x - neoRoot.position.x) / 4;
    if (e.type === 'clink') sfx.clink({ pan, strength: e.strength });
    else if (e.type === 'whiz' && whizCd === 0 && state === 'playing') {
      sfx.whiz({ pan, rate: timeScale, close: e.close });
      whizCd = 0.07;
    }
  }

  if (shockwave.userData.life > 0) {
    const life = (shockwave.userData.life = Math.max(0, shockwave.userData.life - rawDt * 1.3));
    shockwave.visible = life > 0;
    shockwave.scale.setScalar(1 + (1 - life) * 30);
    shockwave.material.opacity = life * 0.6;
  }
  if (state === 'playing') {
    if (res.hit) onHit();
    else if (res.nearMiss && nearMissCd <= 0 && !dodging) {
      slowmoTimer = 0.4;
      nearMissCd = 2.5;
    }
  }

  if (state === 'dying') {
    dyingTimer -= rawDt;
    if (dyingTimer <= 0) {
      state = 'gameover';
      bullets.clear();
      UI.showHUD(false);
      UI.showOverlay('gameover');
    }
  }

  updateCamera(rawDt, Math.max(slowFactor, stopAmt * 0.6));
  renderer.render(scene, camera);
}

// ---------- Wiring ----------
initInput();

document.getElementById('btn-play').addEventListener('click', () => startLevel(UI.getUnlocked()));
document.getElementById('btn-next').addEventListener('click', () => startLevel(Math.min(level + 1, LEVELS.length)));
document.getElementById('btn-retry').addEventListener('click', () => startLevel(level));
document.getElementById('btn-resume').addEventListener('click', () => setPaused(false));
document.getElementById('btn-pause').addEventListener('click', () => setPaused(state === 'playing'));
for (const b of document.querySelectorAll('.btn-menu')) b.addEventListener('click', goMenu);
document.getElementById('btn-dodge').addEventListener('pointerdown', (e) => { e.preventDefault(); tryDodge(); });
document.getElementById('btn-stop').addEventListener('pointerdown', (e) => { e.preventDefault(); tryStop(); });

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') UI.setMuted(sfx.toggleMute());
  else if (e.code === 'Escape') setPaused(state === 'playing');
  else if (e.code === 'KeyP') { if (!e.repeat) tryStop(); }
  else if ((e.code === 'Space' || e.code === 'Enter') && state === 'playing') {
    e.preventDefault();
    if (!e.repeat) tryDodge();
  } else if (e.code === 'Enter' || e.code === 'Space') {
    if (state === 'complete') startLevel(level + 1);
    else if (state === 'gameover') startLevel(level);
    else if (state === 'paused') setPaused(false);
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
  sfx.hold(document.hidden || state === 'paused');
});

// Browsers block audio until the player interacts, so start the sound on the first tap or key press.
const unlockAudio = () => sfx.unlock();
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });
for (const id of ['btn-mute', 'btn-music']) {
  document.getElementById(id).addEventListener('click', () => UI.setMuted(sfx.toggleMute()));
}
UI.setMuted(sfx.muted);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Debug: ?level=N unlocks every level up to N.
const qLevel = parseInt(new URLSearchParams(location.search).get('level'), 10);
if (qLevel >= 1 && qLevel <= 10) UI.setUnlocked(qLevel);

goMenu();
frame();

// Drop focus after a click, so Space/Enter doesn't re-trigger a hidden button.
document.addEventListener('click', (e) => { if (e.target instanceof HTMLButtonElement) e.target.blur(); });
