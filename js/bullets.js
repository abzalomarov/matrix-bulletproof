import * as THREE from 'three';

const Z = new THREE.Vector3(0, 0, 1);
const NEO_RADIUS = 0.3;
const BULLET_RADIUS = 0.05;
const NEO_TOP = 1.9;
const NEAR_MISS = 1.0;
const WHIZ_RANGE = 1.8; // bullets passing this close to NEO make a whiz sound
const DESPAWN_Z = 14;
const GRAVITY = 9.8;
const FLOOR_Y = 0.05; // the bullet's radius, so a fallen bullet rests on the ground

// Bullet states:
//   flying  – normal flight, can hit NEO
//   frozen  – stopped dead in mid-air by NEO's STOP move
//   falling – dropping to the ground, tumbling as it goes
//   resting – lying on the floor; moved to this.resting so it costs nothing per frame
export class BulletSystem {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.resting = [];
    this.events = []; // sound cues from the last update: { type: 'whiz' | 'clink', x, ... }
    this.free = [];
    this.rings = [];

    this.coreGeo = new THREE.CapsuleGeometry(0.05, 0.16, 4, 8).rotateX(Math.PI / 2);
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0xd4a640, metalness: 1, roughness: 0.25, emissive: 0x3a2a00 });

    // The trail is a cone stretched out behind the bullet: thick at the bullet, tapering away.
    this.trailGeo = new THREE.CylinderGeometry(0.045, 0.0, 2.2, 8, 1, true).rotateX(Math.PI / 2).translate(0, 0, -1.1);
    this.trailMat = new THREE.MeshBasicMaterial({ color: 0xc8ffd8, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });

    // Air-ripple rings, kept in a shared pool.
    const ringGeo = new THREE.RingGeometry(0.07, 0.1, 24);
    for (let i = 0; i < 140; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xaaffcc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.userData.life = 0;
      scene.add(m);
      this.rings.push(m);
    }
    this.ringIdx = 0;
    this._prev = new THREE.Vector3();
    this._euler = new THREE.Euler();
  }

  spawn(from, dir, speed) {
    let b = this.free.pop();
    if (!b) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(this.coreGeo, this.coreMat));
      const trail = new THREE.Mesh(this.trailGeo, this.trailMat);
      group.add(trail);
      b = { group, trail, vel: new THREE.Vector3(), spin: 0 };
    }
    b.state = 'flying';
    b.trail.visible = true;
    b.group.position.copy(from);
    b.group.quaternion.setFromUnitVectors(Z, dir);
    b.vel.copy(dir).multiplyScalar(speed);
    b.minDist = Infinity;
    b.passed = false;
    b.ringTimer = 0;
    this.scene.add(b.group);
    this.active.push(b);
  }

  spawnRing(b) {
    const r = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % this.rings.length;
    r.position.copy(b.group.position);
    r.quaternion.copy(b.group.quaternion);
    r.scale.setScalar(1);
    r.userData.life = 1;
    r.visible = true;
  }

  // STOP move, step 1: every bullet in the air brakes hard and hangs there.
  freezeAll() {
    for (const b of this.active) {
      if (b.state !== 'flying') continue;
      b.state = 'frozen';
      b.trail.visible = false;
    }
  }

  // STOP move, step 2: the frozen bullets drop to the floor, tumbling end over end.
  dropAll() {
    for (const b of this.active) {
      if (b.state !== 'frozen') continue;
      b.state = 'falling';
      b.vel.set((Math.random() - 0.5) * 0.6, Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
      b.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
    }
  }

  // Moves the bullets and checks them against NEO.
  // neoTop is the top of his hitbox, which drops while he leans back to dodge.
  // Returns { hit: boolean, nearMiss: boolean }. Sound cues are left in this.events.
  update(dt, neoPos, canBeHit, neoTop = NEO_TOP) {
    let hit = false, nearMiss = false;
    this.events.length = 0;
    const prev = this._prev;

    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      const p = b.group.position;

      if (b.state === 'frozen') {
        // Stop within a few centimetres of where it was when NEO raised his hand.
        b.vel.multiplyScalar(Math.exp(-dt * 25));
        p.addScaledVector(b.vel, dt);
        continue;
      }

      if (b.state === 'falling') {
        b.vel.y -= GRAVITY * dt;
        p.addScaledVector(b.vel, dt);
        b.group.rotateX(b.spin * dt);
        if (p.y <= FLOOR_Y) {
          p.y = FLOOR_Y;
          if (b.vel.y < -1.6) {
            this.events.push({ type: 'clink', x: p.x, strength: Math.min(1, -b.vel.y / 5) });
            // Bounce once or twice off the concrete before it settles.
            b.vel.y *= -0.3;
            b.vel.x *= 0.5;
            b.vel.z *= 0.5;
            b.spin *= 0.5;
          } else {
            this.events.push({ type: 'clink', x: p.x, strength: 0.35 });
            // Lie flat, pointing in a random direction.
            b.state = 'resting';
            b.group.quaternion.setFromEuler(this._euler.set(0, Math.random() * Math.PI * 2, 0));
            this.active.splice(i, 1);
            this.resting.push(b);
          }
        }
        continue;
      }

      prev.copy(p);
      p.addScaledVector(b.vel, dt);

      // Find the closest point on this frame's path segment to NEO's vertical axis, in XZ.
      // Testing the whole segment stops fast bullets from tunnelling through NEO.
      const sx = p.x - prev.x, sz = p.z - prev.z;
      const lenSq = sx * sx + sz * sz || 1e-6;
      let t = ((neoPos.x - prev.x) * sx + (neoPos.z - prev.z) * sz) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = prev.x + sx * t, cz = prev.z + sz * t;
      const cy = prev.y + (p.y - prev.y) * t;
      const dist = Math.hypot(cx - neoPos.x, cz - neoPos.z);
      b.minDist = Math.min(b.minDist, dist);

      if (canBeHit && !hit && dist < NEO_RADIUS + BULLET_RADIUS && cy > 0.05 && cy < neoTop) {
        hit = true;
        this.release(this.active, i);
        continue;
      }

      if (!b.passed && p.z > neoPos.z + 0.6) {
        b.passed = true;
        if (b.minDist < NEAR_MISS) nearMiss = true;
        if (b.minDist < WHIZ_RANGE) this.events.push({ type: 'whiz', x: p.x, close: 1 - b.minDist / WHIZ_RANGE });
      }

      b.ringTimer -= dt;
      if (b.ringTimer <= 0) { b.ringTimer = 0.09; this.spawnRing(b); }

      if (p.z > DESPAWN_Z || p.y < -0.5 || Math.abs(p.x) > 40) this.release(this.active, i);
    }

    for (const r of this.rings) {
      if (!r.visible) continue;
      r.userData.life -= dt * 2.4;
      if (r.userData.life <= 0) { r.visible = false; continue; }
      r.scale.setScalar(1 + (1 - r.userData.life) * 2.5);
      r.material.opacity = r.userData.life * 0.22;
    }

    return { hit, nearMiss };
  }

  release(list, i) {
    const b = list[i];
    this.scene.remove(b.group);
    list.splice(i, 1);
    this.free.push(b);
  }

  clear() {
    while (this.active.length) this.release(this.active, this.active.length - 1);
    while (this.resting.length) this.release(this.resting, this.resting.length - 1);
    for (const r of this.rings) r.visible = false;
  }
}
