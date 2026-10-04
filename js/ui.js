import { isTouch } from './input.js';
import { SCENE_NAMES } from './scenes.js';

const $ = (id) => document.getElementById(id);
const OVERLAYS = ['menu', 'complete', 'gameover', 'paused', 'win'];
const STORE_KEY = 'matrixBulletproof.unlocked';

export function getUnlocked() {
  try { return Math.max(1, Math.min(10, parseInt(localStorage.getItem(STORE_KEY), 10) || 1)); }
  catch { return 1; }
}

export function setUnlocked(n) {
  try {
    if (n > getUnlocked()) localStorage.setItem(STORE_KEY, String(Math.min(10, n)));
  } catch { /* storage unavailable */ }
}

export function showOverlay(name) {
  for (const o of OVERLAYS) $(o).hidden = o !== name;
}

export function showHUD(on) {
  $('hud').hidden = !on;
  $('joystick').hidden = !(on && isTouch);
  $('btn-dodge').hidden = !(on && isTouch);
  $('btn-stop').hidden = !(on && isTouch);
}

export function setLevelLabel(n) {
  $('hud-level').textContent = `LEVEL ${n}`;
  $('complete-level').textContent = n;
}

export function setLives(lives, max = 3) {
  const el = $('hud-lives');
  el.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'life' + (i >= lives ? ' lost' : '');
    el.appendChild(d);
  }
}

export function setDodges(left, max = 2) {
  const el = $('hud-dodge');
  el.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'dodge-pip' + (i >= left ? ' used' : '');
    el.appendChild(d);
  }
  $('dodge-count').textContent = left;
  $('btn-dodge').disabled = left <= 0;
}

export function setStops(left, max = 1) {
  const el = $('hud-stop');
  el.innerHTML = '';
  for (let i = 0; i < max; i++) {
    const d = document.createElement('div');
    d.className = 'stop-pip' + (i >= left ? ' used' : '');
    d.textContent = '✋';
    el.appendChild(d);
  }
  $('btn-stop').disabled = left <= 0;
}

let btOn = false;
export function bulletTime(on) {
  if (on === btOn) return;
  btOn = on;
  $('bullet-time').classList.toggle('on', on);
}

export function setMuted(muted) {
  $('btn-mute').classList.toggle('muted', muted);
  $('btn-music').textContent = muted ? 'SOUND: OFF' : 'SOUND: ON';
}

export function setTimer(frac) {
  $('timer-fill').style.width = `${Math.min(100, frac * 100)}%`;
}

let onScenePick = null;
export function buildSceneSelect(current, onPick) {
  if (onPick) onScenePick = onPick;
  const el = $('scene-select');
  el.innerHTML = '';
  for (const [key, label] of Object.entries(SCENE_NAMES)) {
    const b = document.createElement('button');
    b.className = 'scene-btn' + (key === current ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => onScenePick(key));
    el.appendChild(b);
  }
}

export function buildLevelGrid(onPick) {
  const grid = $('level-grid');
  grid.innerHTML = '';
  const unlocked = getUnlocked();
  for (let i = 1; i <= 10; i++) {
    const b = document.createElement('button');
    b.className = 'lvl' + (i < unlocked ? ' done' : '');
    b.textContent = i;
    b.disabled = i > unlocked;
    b.addEventListener('click', () => onPick(i));
    grid.appendChild(b);
  }
  $('controls-hint').textContent = isTouch
    ? 'Joystick moves NEO. DODGE = bullet-time lean (2 per level). STOP = freeze every bullet (1 per level).'
    : 'Move: W A S D or arrows · Dodge: SPACE or ENTER (2 per level) · Stop bullets: P (1 per level) · Pause: Esc · Sound: M';
}
