// Herds of pigs and cows, flocks of birds (on the ground and in the air).
// They notice the player by sight and sound, flee when alarmed, and the
// whole group scatters at a gunshot. A silent knife kill on an unaware
// animal leaves the rest of the group undisturbed.
import * as THREE from 'three';
import { SEA, DIFF } from './config.js';
import { B, SOLID } from './blocks.js';
import { sfx } from './audio.js';

export const TYPES = {
  pig:  { hp: 40, meat: 2, walk: 1.1, flee: 5.4, group: [3, 6], sense: 1.0, half: 0.5, height: 0.9 },
  cow:  { hp: 70, meat: 3, walk: 0.9, flee: 4.8, group: [3, 5], sense: 0.9, half: 0.75, height: 1.5 },
  bird: { hp: 10, meat: 1, walk: 0.9, flee: 8, group: [5, 9], sense: 1.4, half: 0.28, height: 0.4 },
};

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const MATS = {};
function m(c) { return MATS[c] || (MATS[c] = mat(c)); }
function box(w, h, d, color, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color));
  b.position.set(x, y, z);
  return b;
}
// legs pivot at the hip so they can swing
function leg(w, h, color, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const b = box(w, h, w, color, 0, -h / 2, 0); g.add(b);
  return g;
}

function makePig(r) {
  const g = new THREE.Group(), legs = [];
  g.add(box(0.6, 0.52, 0.95, 0xa07a68, 0, 0.6, 0));
  for (let i = 0; i < 3; i++) g.add(box(0.2 + r() * 0.15, 0.06, 0.2 + r() * 0.2, 0x5e4636, (r() - 0.5) * 0.4, 0.87, (r() - 0.5) * 0.6)); // dried mud
  g.add(box(0.44, 0.4, 0.36, 0xa88272, 0, 0.66, -0.6));
  g.add(box(0.22, 0.16, 0.08, 0x8a6052, 0, 0.6, -0.82));
  g.add(box(0.1, 0.12, 0.06, 0x8a6052, -0.15, 0.9, -0.55), box(0.1, 0.12, 0.06, 0x8a6052, 0.15, 0.9, -0.55));
  g.add(box(0.05, 0.05, 0.02, 0x1a1410, -0.12, 0.74, -0.79), box(0.05, 0.05, 0.02, 0x1a1410, 0.12, 0.74, -0.79));
  for (const [x, z] of [[-0.18, -0.3], [0.18, -0.3], [-0.18, 0.3], [0.18, 0.3]]) { const l = leg(0.15, 0.36, 0x7e5e50, x, 0.36, z); legs.push(l); g.add(l); }
  return { g, legs };
}
function makeCow(r) {
  const g = new THREE.Group(), legs = [];
  g.add(box(0.8, 0.72, 1.5, 0x5e4a3a, 0, 0.98, 0));
  for (let i = 0; i < 4; i++) g.add(box(0.3 + r() * 0.2, 0.05, 0.3 + r() * 0.3, 0xbab2a0, (r() > 0.5 ? 1 : -1) * 0.41, 0.98 + (r() - 0.5) * 0.3, (r() - 0.5) * 0.9));
  g.add(box(0.44, 0.48, 0.5, 0x5e4a3a, 0, 1.2, -0.95));
  g.add(box(0.36, 0.22, 0.12, 0xb8a898, 0, 1.08, -1.22));
  g.add(box(0.06, 0.14, 0.06, 0xd0c8b4, -0.2, 1.48, -0.95), box(0.06, 0.14, 0.06, 0xd0c8b4, 0.2, 1.48, -0.95));
  g.add(box(0.06, 0.06, 0.02, 0x14100c, -0.14, 1.28, -1.21), box(0.06, 0.06, 0.02, 0x14100c, 0.14, 1.28, -1.21));
  g.add(box(0.06, 0.5, 0.06, 0x4a3a2c, 0, 0.82, 0.77));
  for (const [x, z] of [[-0.26, -0.55], [0.26, -0.55], [-0.26, 0.55], [0.26, 0.55]]) { const l = leg(0.2, 0.62, 0x4e3e30, x, 0.62, z); legs.push(l); g.add(l); }
  return { g, legs };
}
function makeBird(r) {
  const g = new THREE.Group(), wings = [], legs = [];
  const c = r() < 0.5 ? 0x2e2f32 : 0x4a4640;
  g.add(box(0.18, 0.16, 0.34, c, 0, 0.2, 0));
  g.add(box(0.13, 0.13, 0.13, c, 0, 0.3, -0.2));
  g.add(box(0.05, 0.04, 0.1, 0x8a7040, 0, 0.29, -0.31));
  g.add(box(0.1, 0.03, 0.14, c, 0, 0.24, 0.22));
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.09, 0.24, 0);
    w.add(box(0.32, 0.03, 0.2, 0x55575a, s * 0.16, 0, 0));
    wings.push(w); g.add(w);
  }
  for (const s of [-1, 1]) { const l = leg(0.03, 0.12, 0x6a5a3a, s * 0.05, 0.12, 0); legs.push(l); g.add(l); }
  return { g, legs, wings };
}
const MAKERS = { pig: makePig, cow: makeCow, bird: makeBird };

export class Animals {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.list = [];
    this.herds = [];
    const w = game.world;
    const mul = game.peace ? 1.3 : DIFF[game.cfg.difficulty].animals;
    this.target = Math.max(4, Math.round(w.W * w.D / 9000 * mul));
    this.respawnEvery = game.peace ? 60 : DIFF[game.cfg.difficulty].animalRespawn;
    this.respawnTimer = this.respawnEvery;
    this.r = Math.random;
    for (let i = 0; i < this.target; i++) this.spawnHerd(false);
    this.box = new THREE.Box3(); this.ray = new THREE.Ray(); this.tmp = new THREE.Vector3();
  }

  pickType() {
    const v = this.r();
    return v < 0.38 ? 'pig' : v < 0.68 ? 'cow' : 'bird';
  }

  // standing height at column (x,z) near y, or null if unwalkable/water
  ground(x, z, y) {
    const w = this.game.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 1 || bz < 1 || bx >= w.W - 1 || bz >= w.D - 1) return null;
    for (let yy = Math.floor(y) + 1; yy >= Math.floor(y) - 2; yy--) {
      const b = w.get(bx, yy, bz);
      if (b === B.WATER) return null;
      if (SOLID[b] && !SOLID[w.get(bx, yy + 1, bz)] && !SOLID[w.get(bx, yy + 2, bz)]) {
        if (w.get(bx, yy + 1, bz) === B.WATER) return null;
        return yy + 1;
      }
    }
    return null;
  }

  spawnHerd(awayFromPlayer = true) {
    const w = this.game.world, p = this.game.player.pos;
    for (let tries = 0; tries < 40; tries++) {
      const x = 8 + this.r() * (w.W - 16), z = 8 + this.r() * (w.D - 16);
      if (awayFromPlayer && Math.hypot(x - p.x, z - p.z) < 50) continue;
      const sy = w.surfaceY(Math.floor(x), Math.floor(z));
      if (sy < SEA || w.get(Math.floor(x), sy + 1, Math.floor(z)) === B.WATER) continue;
      const type = this.pickType();
      const T = TYPES[type];
      const herd = { type, cx: x, cz: z, moveT: 20 + this.r() * 20, members: [], airborne: type === 'bird' && this.r() < 0.4 };
      herd.cy = sy + 14 + this.r() * 6;
      const n = T.group[0] + Math.floor(this.r() * (T.group[1] - T.group[0] + 1));
      for (let i = 0; i < n; i++) {
        const ax = x + (this.r() - 0.5) * 6, az = z + (this.r() - 0.5) * 6;
        const gy = this.ground(ax, az, sy + 1);
        if (gy == null && !herd.airborne) continue;
        this.add(type, herd, ax, herd.airborne ? herd.cy + this.r() * 3 : gy, az);
      }
      if (herd.members.length) { this.herds.push(herd); return herd; }
    }
    return null;
  }

  add(type, herd, x, y, z) {
    const model = MAKERS[type](this.r);
    this.scene.add(model.g);
    const a = {
      type, T: TYPES[type], herd, pos: new THREE.Vector3(x, y, z), yaw: this.r() * Math.PI * 2,
      hp: TYPES[type].hp, state: herd.airborne ? 'circle' : 'calm', alarmed: false,
      target: null, timer: this.r() * 3, phase: this.r() * 10, speed: 0,
      mesh: model.g, legs: model.legs, wings: model.wings || [], callT: 5 + this.r() * 20,
      flyVel: new THREE.Vector3(), ang: this.r() * Math.PI * 2, dead: 0,
    };
    herd.members.push(a);
    this.list.push(a);
    return a;
  }

  remove(a) {
    this.scene.remove(a.mesh);
    a.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.list = this.list.filter((x) => x !== a);
    a.herd.members = a.herd.members.filter((x) => x !== a);
    if (!a.herd.members.length) this.herds = this.herds.filter((h) => h !== a.herd);
  }

  // How far away this animal notices the player (sneaking from behind is best)
  senseRange(a) {
    const pl = this.game.player;
    const moving = Math.hypot(pl.vel.x, pl.vel.z) > 0.5;
    let r = pl.crouch ? (moving ? 2.0 : 1.2) : pl.running ? 18 : moving ? 9 : 4.5;
    r *= a.T.sense;
    const dx = pl.pos.x - a.pos.x, dz = pl.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const facing = (-Math.sin(a.yaw) * dx - Math.cos(a.yaw) * dz) / d; // 1 = looking at player
    if (facing < -0.2) r *= 0.5;
    if (this.game.player.flying) r *= 1.5;
    return r;
  }

  alarm(herd, from, fly = false) {
    for (const a of herd.members) this.scare(a, from, fly);
  }
  scare(a, from, fly = false) {
    if (a.state === 'dead') return;
    a.alarmed = true;
    if (a.type === 'bird') {
      if (a.state !== 'leave') {
        a.state = fly ? 'leave' : 'flyoff';
        a.timer = fly ? 30 : 5 + this.r() * 3;
        const dx = a.pos.x - from.x, dz = a.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
        a.flyVel.set(dx / d * a.T.flee, 4 + this.r() * 2, dz / d * a.T.flee);
      }
      return;
    }
    a.state = 'flee'; a.timer = 5 + this.r() * 3;
    a.from = from.clone();
  }

  // A loud noise (gunshot): every animal in range scatters, birds leave.
  noise(pos, radius) {
    let played = false;
    for (const a of this.list) {
      if (a.state === 'dead') continue;
      const d = a.pos.distanceTo(pos);
      if (d < radius) {
        this.scare(a, pos, a.type === 'bird');
        if (!played && d < 30) { played = true; if (a.type === 'bird') sfx.flap(1 - d / 30); }
      }
    }
  }

  // Ray test against animal bodies; returns nearest {animal, dist, point}
  raycast(origin, dir, maxDist) {
    this.ray.set(origin, dir);
    let best = null, bd = maxDist;
    for (const a of this.list) {
      if (a.state === 'dead') continue;
      const h = a.T.half, p = a.pos;
      if (Math.abs(p.x - origin.x) > maxDist + 2 || Math.abs(p.z - origin.z) > maxDist + 2) continue;
      this.box.min.set(p.x - h, p.y, p.z - h);
      this.box.max.set(p.x + h, p.y + a.T.height, p.z + h);
      const hit = this.ray.intersectBox(this.box, this.tmp);
      if (hit) { const d = hit.distanceTo(origin); if (d < bd) { bd = d; best = { animal: a, dist: d, point: hit.clone() }; } }
    }
    return best;
  }

  // returns true if the animal died
  hurt(a, dmg, silent) {
    if (a.state === 'dead') return false;
    const unaware = !a.alarmed && a.state !== 'flee';
    if (silent && unaware) dmg *= 4;        // silent sneak attack
    a.hp -= dmg;
    const g = this.game;
    const col = g.settings.blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3];
    g.particles.burst(a.pos.x, a.pos.y + a.T.height * 0.6, a.pos.z, col, g.settings.blood ? 6 : 4, 1.2, 0.6, 14);
    if (a.hp <= 0) {
      a.state = 'dead'; a.dead = 0;
      if (a.type === 'pig') sfx.squeal(0.8);
      // a silent kill on an unaware animal doesn't alarm the rest of the herd
      if (!(silent && unaware)) this.alarm(a.herd, g.player.pos);
      return true;
    }
    if (a.type === 'pig') sfx.squeal(0.7);
    this.alarm(a.herd, g.player.pos);
    return false;
  }

  update(dt) {
    const g = this.game, pl = g.player;
    const viewR = (g.settings.renderDist + 1) * 16;
    for (const herd of this.herds) {
      herd.moveT -= dt;
      if (herd.moveT <= 0 && !herd.airborne) {
        herd.moveT = 25 + this.r() * 25;
        const nx = herd.cx + (this.r() - 0.5) * 30, nz = herd.cz + (this.r() - 0.5) * 30;
        if (this.ground(nx, nz, g.world.surfaceY(Math.floor(nx), Math.floor(nz)) + 0.5) != null) { herd.cx = nx; herd.cz = nz; }
      }
    }
    for (const a of this.list.slice()) {
      const d = Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z);
      a.mesh.visible = d < viewR;
      if (d > 90 && a.state !== 'leave') continue; // distant animals idle
      if (a.state === 'dead') { this.updateDead(a, dt); continue; }
      // awareness
      if (!a.alarmed && a.state !== 'flee' && d < this.senseRange(a) && !g.paused) {
        this.alarm(a.herd, pl.pos);
        if (a.type === 'pig') sfx.pig(1 - d / 25); else if (a.type === 'cow') sfx.cow(1 - d / 30); else sfx.flap(1 - d / 25);
      }
      if (a.type === 'bird' && (a.state !== 'calm')) this.updateFlying(a, dt, d);
      else this.updateWalker(a, dt);
      // calls
      a.callT -= dt;
      if (a.callT <= 0) {
        a.callT = 8 + this.r() * 20;
        if (d < 28) { const v = 1 - d / 28; if (a.type === 'pig') sfx.pig(v); else if (a.type === 'cow') sfx.cow(v); else sfx.bird(v); }
      }
      a.mesh.position.copy(a.pos);
      a.mesh.rotation.y = a.yaw;
    }
    // respawning (slower at higher difficulty)
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = this.respawnEvery;
      if (this.herds.length < this.target) this.spawnHerd(true);
    }
  }

  updateWalker(a, dt) {
    a.timer -= dt;
    let speed = 0, tx, tz;
    if (a.state === 'flee') {
      speed = a.T.flee;
      const dx = a.pos.x - a.from.x, dz = a.pos.z - a.from.z, dd = Math.hypot(dx, dz) || 1;
      tx = a.pos.x + dx / dd * 4 + (this.r() - 0.5); tz = a.pos.z + dz / dd * 4 + (this.r() - 0.5);
      if (a.timer <= 0) { a.state = 'calm'; a.alarmed = false; a.herd.cx = a.pos.x; a.herd.cz = a.pos.z; a.target = null; }
    } else {
      if (!a.target || a.timer <= 0) {
        a.timer = 3 + this.r() * 6;
        a.target = this.r() < 0.45 ? null : { x: a.herd.cx + (this.r() - 0.5) * 10, z: a.herd.cz + (this.r() - 0.5) * 10 };
        if (!a.target) a.timer = 2 + this.r() * 4; // graze / peck
      }
      if (a.target) {
        tx = a.target.x; tz = a.target.z; speed = a.T.walk;
        if (Math.hypot(tx - a.pos.x, tz - a.pos.z) < 0.4) a.target = null;
      }
    }
    if (speed > 0) {
      const dx = tx - a.pos.x, dz = tz - a.pos.z, dd = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(-dx, -dz);
      let diff = ((want - a.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      a.yaw += diff * Math.min(1, dt * 6);
      const nx = a.pos.x + dx / dd * speed * dt, nz = a.pos.z + dz / dd * speed * dt;
      const gy = this.ground(nx, nz, a.pos.y);
      if (gy != null && Math.abs(gy - a.pos.y) <= 1.05) { a.pos.x = nx; a.pos.z = nz; a.pos.y += (gy - a.pos.y) * Math.min(1, dt * 10); }
      else { a.target = null; if (a.state === 'flee') a.from.set(nx * 2 - a.from.x, 0, nz * 2 - a.from.z); }
    } else {
      const gy = this.ground(a.pos.x, a.pos.z, a.pos.y);
      if (gy != null) a.pos.y += (gy - a.pos.y) * Math.min(1, dt * 10);
    }
    a.speed = speed;
    a.phase += dt * speed * (a.type === 'bird' ? 14 : 6);
    const s = speed > 0 ? Math.sin(a.phase) * 0.6 : 0;
    a.legs.forEach((l, i) => { l.rotation.x = (i % 2 === (i < 2 ? 0 : 1)) ? s : -s; });
    for (const w of a.wings) w.rotation.z = 0;
    // pecking / grazing head bob is implied by idle pauses
  }

  updateFlying(a, dt, dist) {
    const w = this.game.world;
    a.phase += dt * 22;
    a.wings.forEach((wg, i) => { wg.rotation.z = Math.sin(a.phase) * 0.9 * (i ? -1 : 1); });
    a.legs.forEach((l) => { l.rotation.x = 1.2; });
    if (a.state === 'circle') {
      // airborne flock circling over its area
      a.ang += dt * 0.5;
      const R = 10;
      const tx = a.herd.cx + Math.cos(a.ang + a.phase * 0.0) * R, tz = a.herd.cz + Math.sin(a.ang) * R;
      const ty = a.herd.cy + Math.sin(a.ang * 2) * 1.5;
      const dx = tx - a.pos.x, dy = ty - a.pos.y, dz = tz - a.pos.z;
      a.pos.x += dx * Math.min(1, dt * 1.5); a.pos.y += dy * Math.min(1, dt * 1.5); a.pos.z += dz * Math.min(1, dt * 1.5);
      a.yaw = Math.atan2(-dx, -dz);
      return;
    }
    a.timer -= dt;
    a.pos.addScaledVector(a.flyVel, dt);
    a.flyVel.y = Math.max(a.flyVel.y - dt * 1.5, 0.2);
    a.yaw = Math.atan2(-a.flyVel.x, -a.flyVel.z);
    if (a.state === 'leave') {
      if (a.timer <= 0 || dist > 120 || a.pos.x < 0 || a.pos.z < 0 || a.pos.x > w.W || a.pos.z > w.D) this.remove(a);
      return;
    }
    if (a.timer <= 0) {
      // land again somewhere nearby
      const gy = this.ground(a.pos.x, a.pos.z, w.surfaceY(Math.floor(a.pos.x), Math.floor(a.pos.z)) + 0.5);
      if (gy != null) {
        a.flyVel.y = -3;
        if (a.pos.y <= gy + 0.2) { a.pos.y = gy; a.state = 'calm'; a.alarmed = false; a.herd.cx = a.pos.x; a.herd.cz = a.pos.z; a.target = null; }
      } else a.timer = 2;
    }
  }

  updateDead(a, dt) {
    a.dead += dt;
    a.mesh.rotation.z = Math.min(Math.PI / 2, a.dead * 5);
    if (a.type === 'bird' && a.pos.y > 0) {
      const gy = this.ground(a.pos.x, a.pos.z, a.pos.y);
      if (gy == null || a.pos.y > gy + 0.05) a.pos.y -= dt * 8;
      if (gy != null && a.pos.y < gy) a.pos.y = gy;
      if (a.pos.y < SEA - 1 && this.game.world.get(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z)) === B.WATER) a.pos.y = SEA - 0.3;
    }
    a.mesh.position.copy(a.pos);
    if (a.dead > 1.2 && !a.dropped) {
      a.dropped = true;
      this.game.pickups.spawn('meat_raw', a.T.meat, a.pos.x, a.pos.y + 0.5, a.pos.z);
      this.game.stats.animals = (this.game.stats.animals || 0) + 1;
    }
    if (a.dead > 2.5) this.remove(a);
  }

  dispose() { for (const a of this.list.slice()) this.remove(a); }
}
