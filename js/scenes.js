import * as THREE from 'three';

// Game environments. Each builder returns its geometry plus the look it needs:
// background, fog, light colours and whether the digital-rain backdrop shows.

export const SCENE_NAMES = { lobby: 'LOBBY', rooftop: 'ROOFTOP' };
const STORE_KEY = 'matrixBulletproof.scene';

// Small seeded RNG so the skyline comes out the same every time.
function rng(seed) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------- Lobby ----------
function buildLobby() {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ color: 0x030805, roughness: 0.85, metalness: 0.1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -12;
  floor.receiveShadow = true;
  group.add(floor);

  const grid = new THREE.GridHelper(90, 90, 0x00ff41, 0x00802a);
  grid.material.transparent = true;
  grid.material.opacity = 0.28;
  grid.position.set(0, 0.01, -12);
  group.add(grid);

  // Pillars along both sides, for a sense of depth.
  const pillarGeo = new THREE.BoxGeometry(1.1, 9, 1.1);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x0a120d, roughness: 0.6 });
  const edgeGeo = new THREE.EdgesGeometry(pillarGeo);
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x00ff41, transparent: true, opacity: 0.5 });
  for (let z = 4; z >= -40; z -= 7) {
    for (const x of [-11, 11]) {
      const p = new THREE.Mesh(pillarGeo, pillarMat);
      p.position.set(x, 4.5, z);
      p.castShadow = p.receiveShadow = true;
      p.add(new THREE.LineSegments(edgeGeo, edgeMat));
      group.add(p);
    }
  }

  return {
    group,
    look: {
      background: null,
      fog: [0x000000, 20, 48],
      hemi: [0x99ffbb, 0x001a08, 0.7],
      ambient: [0x113322, 0.6],
      sun: [0xffffff, 1.3],
      rim: [0x00ff66, 0.6],
      border: 0x00ff41,
      rain: true,
    },
  };
}

// ---------- Rooftop ----------
// The skyscraper roof where Neo first dodges Agent Jones's bullets. The film's palette is
// washed-out green-grey daylight, with a concrete roof, AC units, a water tower and a skyline all around.

const FACADES = [
  ['#5e6b62', '#2a3833'],
  ['#78807a', '#394845'],
  ['#4a5650', '#1f2a27'],
  ['#8a9289', '#4a5956'],
];
const FACADE_TILE = 16; // metres covered by one facade texture tile (8 × 8 windows)

function facadeTexture([wall, glass], seed) {
  const r = rng(seed);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, w, h);
    const n = 8, cw = w / n, ch = h / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Windows vary a little in brightness, the way daylight reflects off glass.
        const k = 0.75 + r() * 0.5;
        ctx.fillStyle = glass;
        ctx.globalAlpha = 1;
        ctx.fillRect(i * cw + 4, j * ch + 5, cw - 8, ch - 9);
        ctx.fillStyle = `rgba(200,225,210,${(k - 0.75) * 0.35})`;
        ctx.fillRect(i * cw + 4, j * ch + 5, cw - 8, ch - 9);
      }
    }
    ctx.globalAlpha = 1;
  });
}

function concreteTexture(seed, base = [122, 132, 121]) {
  const r = rng(seed);
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = `rgb(${base.join(',')})`;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = (r() - 0.5) * 34;
      ctx.fillStyle = `rgba(${base.map((c) => Math.round(c + v)).join(',')},0.6)`;
      ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3);
    }
    // Slab joints
    ctx.strokeStyle = 'rgba(40,48,40,0.55)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= w; p += 128) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
    }
  });
}

// Builds many boxes into two merged meshes per facade (walls and roofs), which keeps draw calls low.
// Each box face gets UVs scaled to its size, so the windows stay the same size on every building.
function mergeBuildings(boxes, sideMat, topMat) {
  const sides = { pos: [], nrm: [], uv: [] };
  const tops = { pos: [], nrm: [], uv: [] };
  for (const b of boxes) {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
    const pos = g.attributes.position.array, nrm = g.attributes.normal.array, uv = g.attributes.uv.array;
    for (let face = 0; face < 6; face++) {
      const top = face === 2 || face === 3;
      const out = top ? tops : sides;
      const su = top ? b.w / 8 : (face < 2 ? b.d : b.w) / FACADE_TILE;
      const sv = top ? b.d / 8 : b.h / FACADE_TILE;
      for (let v = face * 6; v < face * 6 + 6; v++) {
        out.pos.push(pos[v * 3] + b.x, pos[v * 3 + 1] + b.y, pos[v * 3 + 2] + b.z);
        out.nrm.push(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]);
        out.uv.push(uv[v * 2] * su + b.uo, uv[v * 2 + 1] * sv);
      }
    }
    g.dispose();
  }
  const make = (d, mat) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
    return new THREE.Mesh(g, mat);
  };
  return [make(sides, sideMat), make(tops, topMat)];
}

function buildRooftop() {
  const group = new THREE.Group();
  const rand = rng(1999);

  const roofTex = concreteTexture(7);
  roofTex.repeat.set(9, 15);
  const concrete = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95 });
  const ledgeTex = concreteTexture(11, [150, 158, 146]);
  const ledgeMat = new THREE.MeshStandardMaterial({ map: ledgeTex, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x8b938d, roughness: 0.55, metalness: 0.5 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2b302d, roughness: 0.6, metalness: 0.6 });
  const roofTopMat = new THREE.MeshStandardMaterial({ color: 0x5d665d, roughness: 1 });

  // Roof surface: x from -17 to 17, z from 18 to -42.
  const RX = 17, RZ0 = 18, RZ1 = -42;
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(RX * 2, RZ0 - RZ1), concrete);
  roof.rotation.x = -Math.PI / 2;
  roof.position.z = (RZ0 + RZ1) / 2;
  roof.receiveShadow = true;
  group.add(roof);

  // A knee-high parapet wall round the edge of the roof.
  const parapet = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), ledgeMat);
    m.position.set(x, 0.45, z);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  };
  parapet(RX * 2 + 0.7, 0.35, 0, RZ1);
  parapet(RX * 2 + 0.7, 0.35, 0, RZ0);
  parapet(0.35, RZ0 - RZ1, -RX, (RZ0 + RZ1) / 2);
  parapet(0.35, RZ0 - RZ1, RX, (RZ0 + RZ1) / 2);

  // Painted helipad between NEO and the Agents.
  const padTex = canvasTexture(512, 512, (ctx, w) => {
    ctx.strokeStyle = 'rgba(225,215,140,0.85)';
    ctx.lineWidth = 18;
    ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 20, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(235,235,225,0.85)';
    const s = w / 512;
    ctx.fillRect(170 * s, 140 * s, 40 * s, 232 * s);
    ctx.fillRect(302 * s, 140 * s, 40 * s, 232 * s);
    ctx.fillRect(210 * s, 236 * s, 92 * s, 40 * s);
  });
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ map: padTex, transparent: true, roughness: 0.9, depthWrite: false })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.015, -10);
  pad.receiveShadow = true;
  group.add(pad);

  // Rooftop clutter, kept outside the line of fire (|x| > 8).
  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const acUnit = (x, z, ry = 0) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 1.8), metal);
    body.position.y = 0.75;
    g.add(body);
    for (const fx of [-0.6, 0.6]) {
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.12, 20), darkMetal);
      fan.position.set(fx, 1.56, 0);
      g.add(fan);
    }
    const grille = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.04), darkMetal);
    grille.position.set(0, 0.7, 0.92);
    g.add(grille);
    g.rotation.y = ry;
    g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
    add(g, x, 0, z);
  };
  acUnit(-10.5, -4, 0.2);
  acUnit(11, -9, -0.15);
  acUnit(-12, -15, Math.PI / 2);
  acUnit(10, 6, 0);

  // A long air duct on stubby supports.
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 16), metal);
  duct.rotation.x = Math.PI / 2;
  add(duct, -14.5, 0.9, -8);
  for (let z = -14; z <= -2; z += 4) add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.3), darkMetal), -14.5, 0.25, z);

  // A wooden water tower, the classic New York rooftop silhouette.
  const wood = new THREE.MeshStandardMaterial({ color: 0x5f5346, roughness: 0.9 });
  const tower = new THREE.Group();
  for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.22), darkMetal);
    leg.position.set(lx, 1.6, lz);
    tower.add(leg);
  }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 3.4, 24), wood);
  tank.position.y = 4.9;
  tower.add(tank);
  for (const hy of [3.6, 4.9, 6.2]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.93, 0.04, 6, 32), darkMetal);
    hoop.rotation.x = Math.PI / 2;
    hoop.position.y = hy;
    tower.add(hoop);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.05, 1.3, 24), wood);
  cap.position.y = 7.25;
  tower.add(cap);
  tower.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  add(tower, 12, 0, -27);

  // The stairwell housing, with a door.
  const stair = add(new THREE.Mesh(new THREE.BoxGeometry(4, 3.3, 4.5), ledgeMat), -12, 1.65, -27);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), darkMetal);
  door.position.set(2.01, -0.6, 0.6);
  door.rotation.y = Math.PI / 2;
  stair.add(door);

  // A radio mast with a red warning light.
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 14, 8), darkMetal), -14, 7, -37);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  beacon.position.set(-14, 14.1, -37);
  group.add(beacon);

  // Small exhaust vents dotted about.
  for (const [x, z] of [[9, -16], [-9, 8], [14, -20], [-10, -35], [9, -38], [15, 12]]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.9, 10), metal), x, 0.45, z);
  }

  // The skyline: this building's own walls dropping away below, plus a ring of towers around it.
  const facadeMats = FACADES.map((f, i) => new THREE.MeshStandardMaterial({ map: facadeTexture(f, 100 + i), roughness: 0.75, metalness: 0.15 }));
  const sets = FACADES.map(() => []);
  sets[0].push({ w: RX * 2 + 0.7, h: 300, d: RZ0 - RZ1, x: 0, y: -150.05, z: (RZ0 + RZ1) / 2, uo: 0 });

  const cz = (RZ0 + RZ1) / 2;
  for (let i = 0; i < 90; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = 58 + rand() * 150;
    const x = Math.sin(ang) * dist;
    const z = cz + Math.cos(ang) * dist;
    const w = 12 + rand() * 18, d = 12 + rand() * 18;
    // Most towers stand near roof height, and a few soar well above it.
    const top = rand() < 0.2 ? 30 + rand() * 70 : -35 + rand() * 50;
    const h = top + 300;
    sets[(rand() * FACADES.length) | 0].push({ w, h, d, x, y: top - h / 2, z, uo: rand() });
    // Some towers get a narrower stepped crown on top.
    if (top > 10 && rand() < 0.5) {
      const cw = w * 0.6, cd = d * 0.6, ch = 6 + rand() * 12;
      sets[(rand() * FACADES.length) | 0].push({ w: cw, h: ch, d: cd, x, y: top + ch / 2, z, uo: rand() });
    }
  }
  sets.forEach((boxes, i) => {
    for (const m of mergeBuildings(boxes, facadeMats[i], roofTopMat)) group.add(m);
  });

  // The sky: an overcast gradient, a little green, as in the film.
  const sky = canvasTexture(4, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#7f9688');
    g.addColorStop(0.55, '#b4c4b2');
    g.addColorStop(1, '#c9d4c2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping;

  return {
    group,
    look: {
      background: sky,
      fog: [0xb9c7b5, 40, 230],
      hemi: [0xe2eee0, 0x4a5548, 1.15],
      ambient: [0x334433, 0.35],
      sun: [0xf4f8ef, 1.6],
      rim: [0x000000, 0],
      border: 0xe8dc8c,
      rain: false,
    },
  };
}

const BUILDERS = { lobby: buildLobby, rooftop: buildRooftop };

export class SceneManager {
  constructor(scene, lights, { rainCanvas, borderMat }) {
    this.scene = scene;
    this.lights = lights;
    this.rainCanvas = rainCanvas;
    this.borderMat = borderMat;
    this.built = {};
    this.current = null;
  }

  static saved() {
    try {
      const s = localStorage.getItem(STORE_KEY);
      return s in BUILDERS ? s : 'lobby';
    } catch { return 'lobby'; }
  }

  get showsRain() { return this.built[this.current]?.look.rain ?? true; }

  set(name) {
    if (!(name in BUILDERS) || name === this.current) return;
    for (const k in this.built) this.built[k].group.visible = false;
    if (!this.built[name]) {
      this.built[name] = BUILDERS[name]();
      this.scene.add(this.built[name].group);
    }
    const { group, look } = this.built[name];
    group.visible = true;
    this.current = name;
    try { localStorage.setItem(STORE_KEY, name); } catch { /* storage unavailable */ }

    const { hemi, ambient, sun, rim } = this.lights;
    this.scene.background = look.background;
    this.scene.fog.color.set(look.fog[0]);
    this.scene.fog.near = look.fog[1];
    this.scene.fog.far = look.fog[2];
    hemi.color.set(look.hemi[0]); hemi.groundColor.set(look.hemi[1]); hemi.intensity = look.hemi[2];
    ambient.color.set(look.ambient[0]); ambient.intensity = look.ambient[1];
    sun.color.set(look.sun[0]); sun.intensity = look.sun[1];
    rim.color.set(look.rim[0]); rim.intensity = look.rim[1];
    rim.visible = look.rim[1] > 0;
    this.borderMat.color.set(look.border);
    this.rainCanvas.hidden = !look.rain;
  }
}
