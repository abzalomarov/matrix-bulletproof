import * as THREE from 'three';

// Characters are built facing +z, with their feet at y = 0.

const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
const sphere = (r, mat, ws = 16, hs = 12) => new THREE.Mesh(new THREE.SphereGeometry(r, ws, hs), mat);

function shadow(obj) {
  obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return obj;
}

// A limb that hangs from a pivot point, so rotating the pivot swings the whole limb.
function limb(w, h, d, mat, pivotY, x) {
  const pivot = new THREE.Group();
  pivot.position.set(x, pivotY, 0);
  const m = box(w, h, d, mat);
  m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}

// ---------- NEO ----------
// Hierarchy: model → pelvis (hips) → thighs → shins, coat skirt panels
//                           └→ upper (torso pivoting at the waist) → head, arms → forearms.
// The pelvis/upper split lets him do the famous lean-back dodge: knees forward, torso back.

const HIP_Y = 0.95;
const THIGH = 0.45;
const SHIN = 0.5; // knee to sole
const SKIRT_PANELS = 10;

// Dodge pose: thighs rotated forward, shins tilted back, with the feet staying planted.
const DODGE_THIGH = -1.2;
const DODGE_SHIN_WORLD = 0.15;
const DODGE_HIP_Y = THIGH * Math.cos(DODGE_THIGH) + SHIN * Math.cos(DODGE_SHIN_WORLD);
const DODGE_HIP_Z = THIGH * Math.sin(DODGE_THIGH) + SHIN * Math.sin(DODGE_SHIN_WORLD);

const capsule = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), mat);
const lerp = THREE.MathUtils.lerp;

// A coat panel shaped as a trapezoid that hangs down from its top edge, wider at the hem.
function panelGeometry(wTop, wBottom, h) {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    -wTop / 2, 0, 0, wTop / 2, 0, 0, -wBottom / 2, -h, 0, wBottom / 2, -h, 0,
  ]);
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  g.computeVertexNormals();
  return g;
}

export function buildNeo() {
  const coatMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.25, side: THREE.DoubleSide });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.75 });
  const shoeMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15, metalness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd6b29a, roughness: 0.6 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 0.5, metalness: 0.1 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 0.02, metalness: 1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.3, metalness: 0.9 });

  const model = new THREE.Group();
  const pelvis = new THREE.Group();
  pelvis.position.y = HIP_Y;
  model.add(pelvis);

  const hips = sphere(0.16, pantsMat);
  hips.scale.set(1.05, 0.55, 0.75);
  pelvis.add(hips);

  // Legs
  const legs = [-1, 1].map((s) => {
    const thigh = new THREE.Group();
    thigh.position.x = s * 0.1;
    const tm = capsule(0.075, THIGH - 0.12, pantsMat);
    tm.position.y = -THIGH / 2;
    thigh.add(tm);

    const shin = new THREE.Group();
    shin.position.y = -THIGH;
    const sm = capsule(0.06, SHIN - 0.17, pantsMat);
    sm.position.y = -(SHIN - 0.06) / 2;
    shin.add(sm);

    const shoe = capsule(0.05, 0.17, shoeMat);
    shoe.rotation.x = Math.PI / 2;
    shoe.scale.set(1.1, 1, 0.75);
    shoe.position.set(0, -SHIN + 0.04, 0.06);
    shin.add(shoe);

    thigh.add(shin);
    pelvis.add(thigh);
    return { thigh, shin };
  });

  // The coat skirt: hinged panels round the waist. Each one flares outward independently.
  const panels = [];
  for (let i = 0; i < SKIRT_PANELS; i++) {
    const a = ((i + 0.5) / SKIRT_PANELS) * Math.PI * 2; // 0 = front (+z)
    const front = Math.max(0, Math.cos(a)); // 1 at the front flaps, 0 at the sides and back
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * 0.2, 0.06, Math.cos(a) * 0.15);
    pivot.rotation.y = a;
    const flare = new THREE.Group();
    pivot.add(flare);
    const h = 0.84 - front * 0.04;
    flare.add(new THREE.Mesh(panelGeometry(0.13 - front * 0.02, 0.22, h), coatMat));
    pelvis.add(pivot);
    panels.push({ flare, a, front, back: Math.max(0, -Math.cos(a)), phase: Math.random() * Math.PI * 2 });
  }

  // Upper body
  const upper = new THREE.Group();
  upper.position.y = 0.02;
  pelvis.add(upper);

  const torsoProfile = [
    [0.15, 0], [0.165, 0.1], [0.185, 0.25], [0.205, 0.4], [0.205, 0.47], [0.17, 0.53], [0.09, 0.57], [0.05, 0.58],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(torsoProfile, 24), coatMat);
  torso.scale.set(1.2, 1, 0.72);
  upper.add(torso);

  for (const s of [-1, 1]) {
    const shoulder = sphere(0.075, coatMat);
    shoulder.position.set(s * 0.215, 0.475, 0);
    shoulder.scale.set(1, 0.8, 0.9);
    upper.add(shoulder);
  }

  // A stand-up mandarin collar, open at the front.
  const gap = 0.9;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.085, 0.11, 20, 1, true, gap / 2, Math.PI * 2 - gap), coatMat);
  collar.position.y = 0.61;
  upper.add(collar);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.13, 12), skinMat);
  neck.position.y = 0.63;
  upper.add(neck);

  // Head
  const head = new THREE.Group();
  head.position.y = 0.76;
  upper.add(head);

  const skull = sphere(0.1, skinMat, 24, 18);
  skull.scale.set(0.78, 1.15, 0.95);
  head.add(skull);
  const jaw = sphere(0.068, skinMat, 16, 12);
  jaw.scale.set(1, 0.85, 1);
  jaw.position.set(0, -0.06, 0.022);
  head.add(jaw);
  for (const s of [-1, 1]) {
    const ear = sphere(0.022, skinMat, 10, 8);
    ear.scale.set(0.45, 1, 0.75);
    ear.position.set(s * 0.079, -0.005, -0.005);
    head.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 8), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.012, 0.1);
  head.add(nose);

  // Short slicked-back hair: a cap on the skull, tilted so it sits low at the back.
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.104, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), hairMat);
  hair.scale.set(0.8, 1.13, 0.98);
  hair.position.set(0, 0.012, -0.006);
  hair.rotation.x = -0.4;
  head.add(hair);

  // Sunglasses: small oval lenses, a bridge, and arms running back to the ears.
  for (const s of [-1, 1]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.006, 18), lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.scale.set(1.2, 1, 0.8);
    lens.position.set(s * 0.033, 0.014, 0.093);
    head.add(lens);
    const arm = box(0.004, 0.005, 0.095, frameMat);
    arm.position.set(s * 0.074, 0.018, 0.048);
    head.add(arm);
  }
  const bridge = box(0.022, 0.004, 0.004, frameMat);
  bridge.position.set(0, 0.022, 0.097);
  head.add(bridge);

  // Arms: coat sleeves with an elbow joint, and bare hands.
  const arms = [-1, 1].map((s) => {
    const arm = new THREE.Group();
    arm.position.set(s * 0.25, 0.47, 0);
    const um = capsule(0.055, 0.2, coatMat);
    um.position.y = -0.15;
    arm.add(um);
    const fore = new THREE.Group();
    fore.position.y = -0.3;
    const fm = capsule(0.048, 0.19, coatMat);
    fm.position.y = -0.13;
    fore.add(fm);
    // The wrist bends the hand back for the open-palm STOP gesture.
    const wrist = new THREE.Group();
    wrist.position.y = -0.25;
    fore.add(wrist);
    const palm = sphere(0.04, skinMat, 12, 10);
    palm.scale.set(0.85, 1.1, 0.42);
    palm.position.y = -0.045;
    wrist.add(palm);
    for (let f = 0; f < 4; f++) {
      const finger = capsule(0.0085, 0.045, skinMat);
      finger.position.set((f - 1.5) * 0.017, -0.105 + Math.abs(f - 1.5) * 0.006, 0);
      wrist.add(finger);
    }
    const thumb = capsule(0.009, 0.035, skinMat);
    thumb.position.set(-s * 0.04, -0.05, 0.01);
    thumb.rotation.z = s * 0.7;
    wrist.add(thumb);
    arm.add(fore);
    upper.add(arm);
    return { arm, fore, wrist };
  });

  shadow(model);
  return { model, pelvis, upper, head, legs, arms, panels };
}

// Poses NEO every frame. pose is 0 when standing and 1 in the full lean-back dodge.
// stop runs from 0 to 1 as he raises his right hand, palm out, to halt the bullets.
// vx/vz is his velocity in his own local frame (+z = forward), as a fraction of max speed.
export function animateNeo(neo, { t, runPhase, speed, vx, vz, pose, stop = 0 }) {
  const run = speed * (1 - pose);
  const swing = Math.sin(runPhase) * 0.75 * run;

  neo.legs.forEach(({ thigh, shin }, i) => {
    const sw = i === 0 ? swing : -swing;
    const runShin = Math.max(0, sw) * 1.3 + 0.12 * run;
    thigh.rotation.x = lerp(sw, DODGE_THIGH, pose);
    shin.rotation.x = lerp(runShin, DODGE_SHIN_WORLD - DODGE_THIGH, pose);
  });

  neo.pelvis.position.y = lerp(HIP_Y - Math.abs(Math.cos(runPhase)) * 0.035 * run, DODGE_HIP_Y, pose);
  neo.pelvis.position.z = lerp(0, DODGE_HIP_Z, pose);

  neo.upper.rotation.x = lerp(0.08 * run, -1.15, pose);
  neo.upper.rotation.y = Math.sin(runPhase) * 0.08 * run;
  neo.head.rotation.x = pose * 0.55; // keep his eyes on the bullets while leaning back

  neo.arms.forEach(({ arm, fore, wrist }, i) => {
    const s = i === 0 ? -1 : 1;
    const sw = i === 0 ? -swing : swing;
    const flail = Math.sin(t * 2.2 + i * 1.7) * 0.15;
    arm.rotation.x = lerp(sw * 0.9, 0.15 + flail, pose);
    arm.rotation.z = lerp(s * 0.06, s * (0.7 + flail), pose);
    fore.rotation.x = lerp(-0.25 - 0.55 * run, -0.5, pose);
    wrist.rotation.x = 0;

    // STOP: the right arm comes up straight toward the Agents, with the hand bent back and the palm facing out.
    // arms[0] sits at -x, which is NEO's right side because the model is built facing +z.
    // Angled a little outward so the raised hand shows beside his head from the camera behind.
    if (i === 0 && stop > 0) {
      arm.rotation.x = lerp(arm.rotation.x, -1.75, stop);
      arm.rotation.z = lerp(arm.rotation.z, -0.3, stop);
      fore.rotation.x = lerp(fore.rotation.x, -0.08, stop);
      wrist.rotation.x = -1.45 * stop;
    }
  });
  neo.upper.rotation.y = lerp(neo.upper.rotation.y, 0.15, stop); // bring the right shoulder forward into the gesture

  // The coat flares outward. Panels on the trailing side drag behind,
  // and during the dodge the front flaps open to clear his knees while the rest hangs down.
  for (const p of neo.panels) {
    const outward = Math.sin(p.a) * vx + Math.cos(p.a) * vz;
    const drag = Math.max(0, -outward);
    const flutter = Math.sin(t * 9 + p.phase) * 0.07 * (speed + pose) + Math.sin(t * 2.3 + p.phase) * 0.02;
    const flare = 0.12
      + drag * 0.55
      + p.front * 0.45 * run
      + pose * (0.1 + 0.95 * p.front)
      + flutter;
    p.flare.rotation.x = -flare;
  }
}

// ---------- Agents ----------

export function buildAgent() {
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.55 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
  const tieMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xcfa98c, roughness: 0.7 });
  const hairMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.05, metalness: 1 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });

  const group = new THREE.Group();

  group.add(limb(0.18, 0.9, 0.2, suitMat, 0.92, -0.12));
  group.add(limb(0.18, 0.9, 0.2, suitMat, 0.92, 0.12));

  const torso = box(0.54, 0.7, 0.3, suitMat);
  torso.position.y = 1.25;
  group.add(torso);

  const shirt = box(0.14, 0.5, 0.02, shirtMat);
  shirt.position.set(0, 1.33, 0.155);
  group.add(shirt);

  const tie = box(0.05, 0.42, 0.02, tieMat);
  tie.position.set(0, 1.3, 0.17);
  group.add(tie);

  const head = sphere(0.145, skinMat);
  head.scale.set(1, 1.15, 1);
  head.position.y = 1.8;
  group.add(head);

  const hair = sphere(0.15, hairMat, 16, 6);
  hair.scale.set(1, 0.6, 1);
  hair.position.set(0, 1.88, -0.01);
  group.add(hair);

  const glasses = box(0.24, 0.05, 0.04, glassMat);
  glasses.position.set(0, 1.81, 0.135);
  group.add(glasses);

  const earpiece = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12), shirtMat);
  earpiece.position.set(0.15, 1.78, 0);
  earpiece.rotation.y = Math.PI / 2;
  group.add(earpiece);

  group.add(limb(0.13, 0.64, 0.15, suitMat, 1.55, -0.34));

  // The gun arm points down at rest. At rotation.x = -PI/2 it points forward along +z.
  const gunArm = limb(0.13, 0.64, 0.15, suitMat, 1.55, 0.34);
  const gun = box(0.07, 0.3, 0.12, gunMat);
  gun.position.set(0, -0.72, 0.03);
  gunArm.add(gun);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.9, 0.03);
  gunArm.add(muzzle);

  // A muzzle flash, plus a red "about to fire" glint that telegraphs each shot.
  const flash = sphere(0.14, new THREE.MeshBasicMaterial({ color: 0xffcc55, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 10, 8);
  flash.visible = false;
  muzzle.add(flash);
  const glint = sphere(0.05, new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 8, 6);
  glint.visible = false;
  muzzle.add(glint);

  group.add(gunArm);
  shadow(group);
  flash.castShadow = glint.castShadow = false;

  return { group, gunArm, muzzle, flash, glint };
}
