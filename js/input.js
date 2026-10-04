// Unified input: keyboard (WASD/arrows) + virtual joystick -> movement vector {x, z} in [-1, 1].

export const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

const keys = new Set();
const joy = { x: 0, z: 0 };

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function initInput() {
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) { keys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys.delete(k);
  });
  window.addEventListener('blur', () => keys.clear());

  if (isTouch) initJoystick();
}

function initJoystick() {
  const base = document.getElementById('joy-base');
  const thumb = document.getElementById('joy-thumb');
  let activeId = null;

  const update = (e) => {
    const r = base.getBoundingClientRect();
    const max = r.width / 2;
    let dx = e.clientX - (r.left + max);
    let dy = e.clientY - (r.top + max);
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    thumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joy.x = dx / max;
    joy.z = dy / max;
  };
  const reset = () => {
    activeId = null;
    joy.x = joy.z = 0;
    thumb.style.transform = 'translate(-50%, -50%)';
  };

  base.addEventListener('pointerdown', (e) => {
    activeId = e.pointerId;
    base.setPointerCapture(e.pointerId);
    update(e);
    e.preventDefault();
  });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === activeId) update(e); });
  base.addEventListener('pointerup', reset);
  base.addEventListener('pointercancel', reset);
}

export function getMove() {
  let x = joy.x, z = joy.z;
  if (keys.has('left')) x -= 1;
  if (keys.has('right')) x += 1;
  if (keys.has('up')) z -= 1;
  if (keys.has('down')) z += 1;
  const len = Math.hypot(x, z);
  if (len > 1) { x /= len; z /= len; }
  return { x, z };
}

export function clearInput() { keys.clear(); joy.x = joy.z = 0; }
