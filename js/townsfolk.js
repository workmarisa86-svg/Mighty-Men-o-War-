// Townspeople: shopkeepers who stay at their shops, the sheriff, farmers and
// villagers who walk the village roads by day and go home at night. They
// greet you (warmly or coldly, depending on your honor), notice crimes they
// can see, run to the sheriff to report them, and form the posse.
// Far-away townspeople sleep: they are not animated and skip ahead along
// their route.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { Character, civLook } from './characters.js';
import { findPath } from './path.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';
import { mulberry32 } from './noise.js';

const FIRST_M = ['Albert', 'Walter', 'Harold', 'Ernest', 'Frank', 'Percy', 'Arthur', 'Cecil', 'Leonard', 'Stanley', 'Wilfred', 'Herbert', 'Clarence', 'Edgar'];
const FIRST_F = ['Edith', 'Mabel', 'Dorothy', 'Florence', 'Winifred', 'Ada', 'Hazel', 'Ivy', 'Mildred', 'Gladys', 'Irene', 'Violet', 'Agnes', 'Beatrice'];
const LAST = ['Penrose', 'Marlow', 'Hartley', 'Ashby', 'Fenwick', 'Thistle', 'Combe', 'Wetherby', 'Barlow', 'Kettering', 'Ransome', 'Holloway', 'Pickering', 'Dunmore', 'Ellery', 'Brackett'];
const SHIRTS = [0xc8bca0, 0xb0b8c0, 0xd8d0c0, 0x9aa4a8, 0xc0a888, 0xe0d8c8];
const DARK = [0x4a4038, 0x3a3e44, 0x5a4a38, 0x2e3236, 0x4e4a3e];
const DRESSES = [0x6a7a8a, 0x8a5a4a, 0x5a6a4a, 0x7a6a8a, 0x9a8a6a, 0x4a5a6a];
const HAIR = [0x2a1c12, 0x5a3a20, 0x8a6a3a, 0x3a2a1c, 0x9a9488, 0x1a1410];

export const ROLE_SPOT = { general: 'general', butcher: 'butcher', hunting: 'hunting', market: 'market' };
const WALK = 2.2, RUN = 5.2;

export class Townsfolk {
  constructor(game, saved = {}) {
    this.game = game;
    this.village = game.world.sites.find((s) => s.type === 'village');
    this.list = [];
    this.tracers = [];
    this.gens = saved.gens || {};
    this.dead = saved.dead || {};
    const v = this.village;
    const homes = v.buildings.filter((b) => b.type === 'house');
    const roles = [
      ['keeper', 'general'], ['keeper', 'butcher'], ['keeper', 'hunting'], ['keeper', 'market'], ['sheriff', 'hall'],
      ['farmer'], ['farmer'], ['farmer'], ['villager'], ['villager'], ['villager'], ['villager'], ['villager'],
    ];
    roles.forEach(([role, shop], i) => this.spawn(i, role, shop, homes[i % homes.length]));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, this.lineMat.clone()); l.visible = false; l.frustumCulled = false;
      game.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.trI = 0; this.lodT = 0;
  }

  // the same people every time (from the world seed); a newcomer replaces
  // someone who died (generation counter)
  spawn(i, role, shop, home) {
    const g = this.game, gen = this.gens[i] || 0;
    const r = mulberry32(g.cfg.seed * 31 + i * 977 + gen * 7919);
    const female = role === 'keeper' && shop === 'market' ? true : role === 'sheriff' ? false : r() < 0.45;
    const name = (female ? FIRST_F : FIRST_M)[Math.floor(r() * 14)] + ' ' + LAST[Math.floor(r() * LAST.length)];
    const look = female
      ? { dress: DRESSES[Math.floor(r() * DRESSES.length)], shirt: 0xe0d8c8, hair: HAIR[Math.floor(r() * HAIR.length)], long: true, hat: r() < 0.4 ? 'scarf' : 'none', hatColor: [0x8a3a3a, 0x3a5a7a, 0x6a6a3a][Math.floor(r() * 3)] }
      : { shirt: SHIRTS[Math.floor(r() * SHIRTS.length)], trousers: DARK[Math.floor(r() * DARK.length)], hair: HAIR[Math.floor(r() * HAIR.length)], vest: r() < 0.45 ? DARK[Math.floor(r() * DARK.length)] : null, hat: r() < 0.5 ? 'cap' : r() < 0.6 ? 'felt' : 'none', moustache: r() < 0.35, rolled: r() < 0.4, braces: r() < 0.3 ? 0x3a2a1c : null };
    if (shop === 'butcher') look.apron = 0xe8e4dc;
    if (shop === 'general') look.apron = 0x7a5a3a;
    if (shop === 'hunting') { look.vest = 0x4a5a3a; look.hat = 'felt'; }
    if (role === 'sheriff') { look.vest = 0x2a2a2e; look.hat = 'felt'; look.hatColor = 0x2a2420; }
    if (role === 'farmer') { look.hat = r() < 0.5 ? 'felt' : 'cap'; look.hatColor = 0x8a7a50; look.rolled = true; }
    const key = 'v' + i + '_' + gen;
    civLook(key, look);
    const rig = new Character('civ', key, Math.floor(r() * 5));
    g.scene.add(rig.root);
    const b = this.village.buildings;
    const work = shop ? b.find((x) => x.type === shop) : null;
    const p = (work && (work.keeper || work.inside)) || home.inside;
    const v = {
      i, role, shop, home, work, name, female, pitch: female ? 1.35 + r() * 0.15 : 0.85 + r() * 0.25,
      rig, pos: new THREE.Vector3(p.x, p.y, p.z), yaw: r() * 6, speed: 0, crouch: false,
      hp: 100, alive: true, deadT: 0, state: 'idle', idleT: r() * 10, route: [], goal: null, greetT: 0, actT: 0,
      armed: null, posse: false, hostile: false, cool: 0, reportTo: null, crime: null, scaredT: 0, seenT: 0, stuckT: 0, faceT: 0,
    };
    if (this.dead[i] && this.dead[i] > g.time) { v.alive = false; v.away = true; rig.root.visible = false; }
    this.list[i] = v;
    return v;
  }

  hour() { return (this.game.time % 1) * 24; }
  night() { const h = this.hour(); return h >= 21 || h < 6; }

  // ---- routes along the village roads ---------------------------------
  roadPoint(b) {
    const v = this.village;
    if (!b) return null;
    if (b.type === 'market') return { x: v.cx + 4.5, y: v.y, z: v.cz + 0.5, axis: 'x' };
    if (b.side === 'n' || b.side === 's') return { x: b.door.x, y: v.y, z: v.cz + 0.5, axis: 'x' };
    return { x: v.cx + 0.5, y: v.y, z: b.door.z, axis: 'z' };
  }
  // a place: { pos, b (building, entered through its door), road: point on a road }
  routeTo(v, place) {
    const vi = this.village, out = [];
    const cur = v.place;
    if (cur && cur.b && cur.b !== place.b) { if (cur.b.doorIn) out.push(cur.b.doorIn); out.push(cur.b.door); }
    const a = cur ? (cur.b ? this.roadPoint(cur.b) : cur.road) : null;
    const z = place.b ? this.roadPoint(place.b) : place.road;
    if (a && z && !(cur && cur.b === place.b)) {
      out.push(a);
      if (a.axis !== z.axis) out.push({ x: vi.cx + 0.5, y: vi.y, z: vi.cz + 0.5 });
      out.push(z);
    }
    if (place.b && !(cur && cur.b === place.b)) { out.push(place.b.door); if (place.b.doorIn) out.push(place.b.doorIn); }
    out.push(place.pos);
    v.route = out.map((q) => ({ x: q.x, y: q.y ?? vi.y, z: q.z }));
    v.place = place; v.goal = place.pos;
  }
  // somewhere to spend the day
  pickPlace(v) {
    const vi = this.village, r = Math.random;
    const at = (b, pos) => ({ b, pos: pos || b.inside });
    if (v.role === 'keeper') return at(v.work, v.work.keeper);
    if (this.night()) return at(v.role === 'sheriff' ? v.work : v.home, (v.role === 'sheriff' ? v.work : v.home).inside);
    if (v.role === 'sheriff') {
      const pts = [{ x: vi.cx + 0.5 + (r() - 0.5) * 8, z: vi.cz + 0.5 + (r() - 0.5) * 8 }, { x: v.work.door.x, z: v.work.door.z }, { x: vi.cx + 0.5 + (r() < 0.5 ? -36 : 36), z: vi.cz + 0.5 }];
      const p = pts[Math.floor(r() * pts.length)];
      return { road: { x: p.x, y: vi.y, z: vi.cz + 0.5, axis: 'x' }, pos: { x: p.x, y: vi.y, z: p.z } };
    }
    if (v.role === 'farmer' && r() < 0.75) {
      const f = vi.fields[v.i % vi.fields.length];
      const x = f.x0 + 1 + Math.floor(r() * (f.x1 - f.x0 - 1)) + 0.5, z = (f.gate.z > f.z1 ? f.z1 + 1.4 : f.z0 - 1.4);
      v.work = f;
      return { road: { x: f.gate.x, y: vi.y, z: vi.cz + 0.5, axis: 'x' }, pos: { x, y: vi.y, z }, work: 'field' };
    }
    const shops = vi.buildings.filter((b) => b.type !== 'house');
    const k = r();
    if (k < 0.35) { const x = vi.cx + 0.5 + (r() - 0.5) * 10, z = vi.cz + 0.5 + (r() - 0.5) * 10; return { road: { x: vi.cx + 0.5, y: vi.y, z: vi.cz + 0.5, axis: 'x' }, pos: { x, y: vi.y, z } }; }
    if (k < 0.7) { const s = shops[Math.floor(r() * shops.length)]; return s.type === 'market' ? at(s, s.door) : at(s, s.counter || s.inside); }
    return at(v.home, v.home.inside);
  }

  // ---- movement ----------------------------------------------------------
  ground(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 1 || bz < 1 || bx >= w.W - 1 || bz >= w.D - 1) return null;
    for (let yy = Math.floor(y) + 1; yy >= Math.floor(y) - 3; yy--) {
      const b = w.get(bx, yy, bz);
      if (SOLID[b] && !SOLID[w.get(bx, yy + 1, bz)] && !SOLID[w.get(bx, yy + 2, bz)]) return w.get(bx, yy + 1, bz) === B.WATER ? null : yy + 1;
    }
    return null;
  }
  free(x, y, z, r = 0.26) {
    const w = this.game.world;
    for (let yy = Math.floor(y + 0.15); yy <= Math.floor(y + 1.7); yy++) for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (SOLID[w.get(Math.floor(x + ox), yy, Math.floor(z + oz))]) return false;
    return true;
  }
  // one step toward (tx, tz); ty: the height of where he is going (he only
  // steps up a block when the way really goes up, never onto counters)
  step(v, tx, tz, speed, dt, ty = null) {
    const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { v.speed = 0; return true; }
    const base = Math.atan2(-dx, -dz), st = Math.min(d, speed * dt);
    const up = ty == null || ty > v.pos.y + 0.5 ? 1.05 : 0.55;
    for (const o of [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8]) {
      const a = base + o, nx = v.pos.x - Math.sin(a) * st, nz = v.pos.z - Math.cos(a) * st;
      let gy = this.ground(nx, nz, v.pos.y);
      if (gy == null || gy - v.pos.y > up || gy - v.pos.y < -3) continue;
      // stepping up onto a block: the body rises as it moves onto it
      if (!this.free(nx, gy, nz)) { if (up > 1 && Math.abs(gy - v.pos.y) < 0.2 && this.free(nx, gy + 1, nz) && this.free(v.pos.x, v.pos.y + 1, v.pos.z)) gy += 1; else continue; }
      v.pos.x = nx; v.pos.z = nz; v.pos.y += (gy - v.pos.y) * Math.min(1, dt * 12);
      v.yaw = turn(v.yaw, a, dt * 7); v.speed = speed;
      if (o === 0) v.stuckT = Math.max(0, v.stuckT - dt); else v.stuckT += dt * 0.4;
      return false;
    }
    // slide along a wall on one axis
    for (const [sx, sz] of [[Math.sign(dx) * st, 0], [0, Math.sign(dz) * st]]) {
      if (!sx && !sz) continue;
      const nx = v.pos.x + sx, nz = v.pos.z + sz, gy = this.ground(nx, nz, v.pos.y);
      if (gy == null || gy - v.pos.y > up || gy - v.pos.y < -3 || !this.free(nx, gy, nz)) continue;
      v.pos.x = nx; v.pos.z = nz; v.pos.y += (gy - v.pos.y) * Math.min(1, dt * 12); v.speed = speed * 0.7; v.stuckT += dt * 0.3;
      return false;
    }
    v.stuckT += dt; v.speed = 0;
    return false;
  }
  // follow the route; returns true when the last point is reached
  walk(v, dt, speed) {
    if (!v.route.length) return true;
    const q = v.route[0];
    if (this.step(v, q.x, q.z, speed, dt, q.y) || (Math.hypot(q.x - v.pos.x, q.z - v.pos.z) < 0.6 && Math.abs(q.y - v.pos.y) < 1.6)) {
      v.route.shift(); v.replans = 0;
      return !v.route.length;
    }
    if (v.stuckT > 3) {
      v.stuckT = 0; v.replans = (v.replans || 0) + 1;
      // blocked (something was built in the way): plan around it; after a few
      // tries (or when nobody is looking) slip on to the next point
      const p = v.replans < 3 ? findPath(this.game.world, v.pos, v.route[v.route.length - 1], 1500, true) : null;
      if (p && p.length && v.replans < 3) v.route = p;
      if (v.replans >= 3 || !this.visible(v)) { const nx = v.route.shift(); if (nx) v.pos.set(nx.x, nx.y, nx.z); v.replans = 0; }
    }
    return false;
  }
  // chase or approach something away from the roads (A*, refreshed now and then)
  goDirect(v, target, speed, dt, near = 1.2) {
    v.planT = (v.planT || 0) - dt;
    if (v.planT <= 0 || !v.route.length) {
      v.planT = 2.5 + Math.random();
      const d = Math.hypot(target.x - v.pos.x, target.z - v.pos.z);
      v.route = d < 8 ? [{ x: target.x, y: target.y, z: target.z }] : (findPath(this.game.world, v.pos, target, 2200, true) || [{ x: target.x, y: target.y, z: target.z }]);
      v.place = null;
    }
    if (Math.hypot(target.x - v.pos.x, target.z - v.pos.z) < near) { v.speed = 0; return true; }
    this.walk(v, dt, speed);
    return false;
  }
  visible(v) {
    const cam = this.game.camera.position, d = v.pos.distanceTo(cam);
    if (d > 70) return false;
    const fx = -Math.sin(this.game.player.yaw), fz = -Math.cos(this.game.player.yaw);
    return ((v.pos.x - cam.x) * fx + (v.pos.z - cam.z) * fz) / (d || 1) > 0.2;
  }

  // ---- senses -------------------------------------------------------------
  // can this person see the player? (range shrinks at night, crouching helps)
  sees(v, range = 30) {
    if (!v.alive) return false;
    const g = this.game, p = g.player.pos;
    const dx = p.x - v.pos.x, dz = p.z - v.pos.z, d = Math.hypot(dx, dz);
    let R = range * (0.45 + 0.55 * g.sky.daylight) * (g.player.crouch ? 0.6 : 1);
    if (g.lightOn) R = Math.max(R, range * 0.9);
    if (d > R || Math.abs(p.y - v.pos.y) > 12) return false;
    const facing = (-Math.sin(v.yaw) * dx - Math.cos(v.yaw) * dz) / (d || 1);
    if (facing < -0.3 && d > 5) return false;                    // behind his back
    const eye = new THREE.Vector3(v.pos.x, v.pos.y + 1.65, v.pos.z);
    const dir = new THREE.Vector3(p.x - eye.x, p.y + 1.2 - eye.y, p.z - eye.z);
    const L = dir.length(); dir.divideScalar(L);
    return !g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, L - 0.5, false, 'sight');
  }
  nearest(pos, r = 3.5, pred = () => true) {
    let best = null, bd = r;
    for (const v of this.list) if (v.alive && pred(v)) { const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z); if (d < bd && Math.abs(v.pos.y - pos.y) < 2.5) { bd = d; best = v; } }
    return best;
  }

  // ray test for shots and blows (head = top 0.35 m)
  raycast(origin, dir, maxDist) {
    let best = null, bd = maxDist;
    const box = new THREE.Box3(), ray = new THREE.Ray(origin, dir), hit = new THREE.Vector3();
    for (const v of this.list) {
      if (!v.alive || v.away) continue;
      if (Math.abs(v.pos.x - origin.x) > maxDist + 2 || Math.abs(v.pos.z - origin.z) > maxDist + 2) continue;
      const h = v.crouch ? 1.4 : 1.85;
      box.min.set(v.pos.x - 0.3, v.pos.y, v.pos.z - 0.3); box.max.set(v.pos.x + 0.3, v.pos.y + h, v.pos.z + 0.3);
      if (ray.intersectBox(box, hit)) { const d = hit.distanceTo(origin); if (d < bd) { bd = d; best = { villager: v, dist: d, point: hit.clone(), head: hit.y > v.pos.y + h - 0.35 }; } }
    }
    return best;
  }

  // ---- shooting (posse) ----------------------------------------------------
  shootAt(v, dt) {
    const g = this.game, p = g.player.pos;
    v.cool -= dt;
    if (v.cool > 0 || !this.sees(v, 50)) return;
    const d = Math.hypot(p.x - v.pos.x, p.z - v.pos.z);
    if (d > 45) return;
    v.cool = 1.6 + Math.random() * 1.2;
    v.fired = true;
    const moving = Math.hypot(g.player.vel.x, g.player.vel.z) > 1;
    const hitP = Math.max(0.12, Math.min(0.7, 0.78 - d / 55)) * (g.player.crouch ? 0.7 : 1) * (moving ? 0.75 : 1);
    sfx.shot(v.armed === 'pistol' ? 'pistol' : 'rifle', Math.max(0.2, 1 - d / 60));
    const a = new THREE.Vector3(v.pos.x, v.pos.y + 1.45, v.pos.z);
    const b = new THREE.Vector3(p.x + (Math.random() - 0.5) * (Math.random() < hitP ? 0.2 : 2.5), p.y + 1.2, p.z + (Math.random() - 0.5) * 1.5);
    const tr = this.tracers[this.trI++ % this.tracers.length];
    const pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true; tr.l.geometry.computeBoundingSphere();
    tr.l.visible = true; tr.t = 0.07;
    if (Math.random() < hitP) g.damage(v.armed === 'pistol' ? 9 : 13, 'shot', v.pos);
  }
  // cover from the player: a nearby spot with a block between
  coverSpot(v) {
    const g = this.game, p = g.player.pos;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 6;
      const x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r, y = this.ground(x, z, v.pos.y + 1);
      if (y == null || Math.abs(y - v.pos.y) > 2 || !this.free(x, y, z)) continue;
      const dir = new THREE.Vector3(p.x - x, p.y + 1.2 - (y + 0.9), p.z - z); const L = dir.length(); dir.divideScalar(L);
      if (g.world.raycast(x, y + 0.9, z, dir.x, dir.y, dir.z, Math.min(3, L - 1), false, 'bullet')) return { x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 };
    }
    return null;
  }

  say(v, key, vars, kind = '') {
    if (!v.alive) return;
    this.game.bubbles.say(v, t(key, vars), { name: v.name, pitch: v.pitch, kind });
  }

  // ---- per frame ------------------------------------------------------------
  update(dt) {
    const g = this.game, P = g.player.pos, T = g.town;
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07) * 0.8; if (tr.t <= 0) tr.l.visible = false; }
    this.lodT -= dt;
    const relod = this.lodT <= 0; if (relod) this.lodT = 0.5;
    for (const v of this.list) {
      if (!v.alive) {
        if (v.away) { if (!this.dead[v.i] || this.dead[v.i] <= g.time) this.replace(v); continue; }
        v.deadT += dt;
        v.rig.pose({ dead: v.deadT, fallDir: v.fallDir || 1 }, dt);
        if (v.deadT > 40) { v.away = true; v.rig.root.visible = false; }
        continue;
      }
      const d = Math.hypot(v.pos.x - P.x, v.pos.z - P.z);
      v.far = d > 90;
      v.fired = false;
      v.greetT -= dt; v.faceT -= dt; v.scaredT -= dt;
      if (v.posse) T.posseBehaviour(v, dt, d);
      else if (v.reportTo) this.reportBehaviour(v, dt);
      else this.dailyBehaviour(v, dt, d);
      // greetings when the player comes close
      if (!v.posse && !v.reportTo && d < 4.5 && v.greetT <= 0 && !g.overlay && v.scaredT <= 0) {
        v.greetT = 70 + Math.random() * 40; v.faceT = 3;
        this.say(v, T.greetingKey(v));
      }
      if (v.faceT > 0 && !v.posse) { v.speed = 0; v.yaw = turn(v.yaw, Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z)), dt * 6); }
      // drawing: only close, on-screen people are animated every frame
      const show = d < (g.settings.renderDist + 1) * 16;
      v.rig.root.visible = show;
      if (!show) continue;
      if (relod) v.rig.setLod(d < 30 ? 0 : 1);
      if (d < 50 || this.visible(v) || ((v.animN = (v.animN || 0) + 1) % 4 === 0)) {
        const aim = v.posse && v.hostile;
        v.rig.pose({ speed: v.speed, crouch: v.crouch, run: v.speed > 3.5, aim, fired: v.fired, look: 0, pitch: 0 }, d < 50 ? dt : dt * 4);
      }
      const gy = this.ground(v.pos.x, v.pos.z, v.pos.y + 0.5);
      v.rig.place(v.pos, v.yaw, gy ?? v.pos.y);
    }
  }

  dailyBehaviour(v, dt, d) {
    const g = this.game;
    if (v.scaredT > 0 && v.role !== 'keeper') {
      // gunfire close by: hurry home
      if (!v.fleeing) { v.fleeing = true; this.routeTo(v, { b: v.home, pos: v.home.inside }); }
      this.walk(v, dt, RUN); v.crouch = false; return;
    }
    v.fleeing = false;
    if (v.far && v.goal) {
      // asleep: skip ahead along the route now and then
      v.actT -= dt;
      if (v.route.length && v.actT <= 0) { v.actT = 3; const q = v.route.shift(); v.pos.set(q.x, q.y, q.z); }
      if (!v.route.length && v.actT <= 0) { v.actT = 20 + Math.random() * 30; this.routeTo(v, this.pickPlace(v)); }
      return;
    }
    const nightNow = this.night();
    if (v.wasNight !== nightNow) { v.wasNight = nightNow; v.idleT = 0; v.route = []; }
    if (v.route.length) { v.crouch = false; this.walk(v, dt, WALK); return; }
    v.speed = 0;
    v.idleT -= dt;
    v.crouch = v.place && v.place.work === 'field' && !nightNow;
    if (v.role === 'keeper') {
      // behind the counter, facing the customers
      const b = v.work, k = b.keeper;
      if (Math.hypot(v.pos.x - k.x, v.pos.z - k.z) > 0.6) { if (!v.route.length) this.routeTo(v, { b, pos: k }); return; }
      if (v.faceT <= 0) v.yaw = turn(v.yaw, Math.atan2(-(b.door.x - k.x), -(b.door.z - k.z)), dt * 3);
      return;
    }
    if (v.idleT <= 0) {
      v.idleT = 25 + Math.random() * 45;
      this.routeTo(v, this.pickPlace(v));
    }
  }

  // a witness on the way to the sheriff
  reportBehaviour(v, dt) {
    const g = this.game, hall = this.village.buildings.find((b) => b.type === 'hall');
    const sheriff = this.list.find((s) => s.role === 'sheriff' && s.alive);
    const goal = sheriff && !sheriff.posse ? sheriff.pos : hall.door;
    if (!v.route.length || (v.planT = (v.planT || 0) - dt) <= 0) { v.planT = 3; v.route = findPath(g.world, v.pos, goal, 2500, true) || [{ x: goal.x, y: goal.y, z: goal.z }]; }
    this.walk(v, dt, RUN);
    if (v.far && v.route.length) { v.actT = (v.actT || 0) - dt; if (v.actT <= 0) { v.actT = 2; const q = v.route.shift(); v.pos.set(q.x, q.y, q.z); } }
    if (Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z) < 2.5) {
      const c = v.reportTo; v.reportTo = null; v.route = [];
      g.town.reported(v, c);
    }
  }

  hurt(v, dmg, { silent = false, head = false } = {}) {
    if (!v.alive) return false;
    const g = this.game;
    if (head) dmg *= 2.5;
    if (silent && !this.sees(v, 40)) dmg *= 3;
    v.hp -= dmg;
    const blood = g.settings.blood;
    g.particles.burst(v.pos.x, v.pos.y + (head ? 1.65 : 1.15), v.pos.z, blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3], blood ? 4 : 3, 1, 0.5, 14);
    if (v.hp <= 0) { this.kill(v); return true; }
    v.scaredT = 12;
    return false;
  }
  kill(v) {
    const g = this.game;
    v.alive = false; v.deadT = 0; v.speed = 0; v.route = []; v.reportTo = null;
    v.fallDir = Math.random() < 0.5 ? 1 : -1;
    g.bubbles.clearFor(v);
    this.dead[v.i] = g.time + (v.role === 'keeper' || v.role === 'sheriff' ? 1 : 2);   // a newcomer arrives in a day or two
    if (v.posse) g.town.posseLost(v);
  }
  replace(v) {
    v.rig.dispose();
    this.gens[v.i] = (this.gens[v.i] || 0) + 1;
    delete this.dead[v.i];
    const n = this.spawn(v.i, v.role, v.shop, v.home);
    n.place = { b: n.work || n.home, pos: n.pos };
  }
  armed(v, weapon) { v.armed = weapon; v.rig.setWeapon(weapon); }
  toSave() { return { gens: this.gens, dead: this.dead }; }
  dispose() {
    for (const v of this.list) v.rig.dispose();
    for (const tr of this.tracers) { this.game.scene.remove(tr.l); tr.l.geometry.dispose(); }
  }
}

function turn(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
}
