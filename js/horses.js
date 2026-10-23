// Town Life horses: in the stable's hitching area, on the farms and under
// the posse. Aim at a horse and tap it (or press E) to mount; tap again to
// dismount. Riding is faster than running, with a short stamina bar for the
// gallop. A horse steps up one block, is stopped by two-block walls, and
// wades shallow water; in deep water you are thrown off. Riders sit on the
// saddle (a riding pose, never inside the horse's body). Only the nearest
// horses (at most MAX_MODELS) have a 3D model; far ones are simple data.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { SEA } from './config.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

const MAX_MODELS = 12, MODEL_M = 110;
const WALK = 4.2, GALLOP = 11, SWIM = 2.6, STAM_USE = 0.22, STAM_BACK = 0.12;
const JUMP_V = 8.6, HORSE_G = 24;
// neck and head carriage (radians, each part relative to the one before):
// lower neck ~45° forward of upright, upper neck ~22° (an arched crest),
// head ~118° from upright (nose forward and a little down)
// points of the horse's body checked against blocks: [forward, side, from height, to height]
const BODY_PTS = [];
for (const f of [-0.95, -0.45, 0, 0.45, 0.9]) for (const sd of [-0.32, 0.32]) BODY_PTS.push([f, sd, 1.05, 1.95]);
for (const sd of [-0.15, 0.15]) BODY_PTS.push([1.3, sd, 1.6, 2.45]);   // the neck and head
for (const sd of [-0.12, 0.12]) BODY_PTS.push([1.8, sd, 1.55, 2.2]);   // the muzzle, out in front
BODY_PTS.push([-1.05, 0, 0.6, 1.5]);                                    // the tail
// the four legs: the hooves stand on the highest ground under any of them, so
// no leg ever sinks into a block (a step or a kerb lifts the whole horse)
const HOOVES = [[0.6, -0.22], [0.6, 0.22], [-0.6, -0.22], [-0.6, 0.22]];
for (const [f, sd] of HOOVES) BODY_PTS.push([f, sd, 0.15, 1.0]);
const NECK = { base: 0.8, upper: -0.42, head: 1.68 };         // a jump clears about a block and a half
export const SADDLE_ROOT = 0.6;          // where a rider's feet-root goes above the horse's hooves
const COATS = [0x5a3a24, 0x3a2618, 0x7a5a3a, 0x2a2420, 0x8a7a68, 0x6a4a2e];

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const m = (c) => new THREE.MeshLambertMaterial({ color: c });
  MATS = { coats: COATS.map(m), mane: m(0x1e1814), saddle: m(0x4a3020), blanket: m(0x6a3a2a), hoof: m(0x1a1814), white: m(0xd8d0c0) };
  return MATS;
}
const GEO = {};
const box = (w, h, d) => GEO[w + ':' + h + ':' + d] || (GEO[w + ':' + h + ':' + d] = new THREE.BoxGeometry(w, h, d));

class Horse {
  constructor(mgr, x, y, z, owner, home, coat) {
    this.mgr = mgr;
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = Math.random() * 6; this.speed = 0;
    this.hp = 140; this.alive = true; this.deadT = 0;
    this.owner = owner; this.home = home || { x, y, z };
    this.coat = coat ?? Math.floor(Math.random() * COATS.length);
    this.rider = null; this.mesh = null; this.phase = Math.random() * 6; this.wanderT = Math.random() * 6; this.goal = null;
  }
  // a low-poly horse: body, neck, head, mane, tail, four legs, saddle
  build() {
    const M = mats(), coat = M.coats[this.coat];
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, parent = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); parent.add(o); return o; };
    add(box(0.62, 0.62, 1.55), coat, 0, 1.12, 0);                         // barrel
    add(box(0.56, 0.5, 0.4), coat, 0, 1.2, 0.72);                         // chest
    // The neck rises forward from the shoulders (the horse faces +z) in two
    // parts: the lower neck, deep at its base, leans well forward; the upper
    // neck stands a little more upright, so the crest (the top line, with the
    // mane) arches gently. The head is carried forward of the chest, nose
    // forward and a little down. (A rotation.x > 0 tips a part forward.)
    const neck = new THREE.Group(); neck.position.set(0, 1.3, 0.78); neck.rotation.x = NECK.base; g.add(neck);
    add(box(0.32, 0.56, 0.5), coat, 0, 0.24, 0, neck);                    // lower neck (deep at the shoulders)
    add(box(0.07, 0.5, 0.12), M.mane, 0, 0.27, -0.24, neck);              // mane along the crest
    const upper = new THREE.Group(); upper.position.set(0, 0.48, -0.02); upper.rotation.x = NECK.upper; neck.add(upper);
    add(box(0.27, 0.5, 0.38), coat, 0, 0.22, 0, upper);                   // upper neck, slimmer toward the head
    add(box(0.07, 0.46, 0.11), M.mane, 0, 0.24, -0.18, upper);
    add(box(0.09, 0.14, 0.16), M.mane, 0, 0.5, -0.06, upper);             // forelock tuft at the poll
    const head = new THREE.Group(); head.position.set(0, 0.46, 0.02); head.rotation.x = NECK.head; upper.add(head);
    add(box(0.28, 0.4, 0.36), coat, 0, 0.17, -0.01, head);                // jaw and forehead
    add(box(0.22, 0.3, 0.28), coat, 0, 0.5, 0.0, head);                   // the muzzle, narrower
    add(box(0.07, 0.14, 0.07), coat, -0.08, -0.04, -0.15, head); add(box(0.07, 0.14, 0.07), coat, 0.08, -0.04, -0.15, head);   // ears, up at the poll
    if (this.coat % 2) add(box(0.1, 0.42, 0.02), M.white, 0, 0.36, -0.19, head);   // a blaze down the face
    const tail = new THREE.Group(); tail.position.set(0, 1.32, -0.78); tail.rotation.x = 0.5; g.add(tail);
    add(box(0.12, 0.7, 0.12), M.mane, 0, -0.32, 0, tail);
    add(box(0.66, 0.08, 0.6), M.blanket, 0, 1.45, 0.05);                 // saddle blanket
    add(box(0.5, 0.12, 0.44), M.saddle, 0, 1.53, 0.05);                  // saddle
    add(box(0.42, 0.18, 0.08), M.saddle, 0, 1.6, 0.3);                   // pommel
    this.legs = [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]].map(([x, z]) => {
      const leg = new THREE.Group(); leg.position.set(x, 0.86, z); g.add(leg);
      add(box(0.16, 0.86, 0.18), coat, 0, -0.43, 0, leg);
      add(box(0.17, 0.1, 0.19), M.hoof, 0, -0.86, 0.01, leg);
      return leg;
    });
    this.neck = neck; this.upper = upper; this.head = head; this.tail = tail;
    this.mesh = g; this.mgr.game.scene.add(g);
  }
  drop() { if (this.mesh) { this.mgr.game.scene.remove(this.mesh); this.mesh = null; } }
  // the rider's root (feet) position on the saddle
  saddle() { return this.mgr.tmp.set(this.pos.x, this.pos.y + SADDLE_ROOT, this.pos.z); }
  // a villager riding: the horse goes where he goes
  carry(v) {
    if (!this.alive) return;
    const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
    this.speed = Math.min(GALLOP, d / Math.max(0.016, this.mgr.dt || 0.016));
    this.pos.copy(v.pos);
    // its long body swings clear of a wall the rider brushes past (near you only)
    const M = this.mgr, P = M.game.player.pos;
    if (Math.abs(this.pos.x - P.x) + Math.abs(this.pos.z - P.z) < MODEL_M && !M.clear(this.pos.x, this.pos.y, this.pos.z, v.yaw)) {
      for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) { const ya = v.yaw + k * 0.35; if (M.clear(this.pos.x, this.pos.y, this.pos.z, ya)) { this.yaw = ya; return; } }
    }
    this.yaw = v.yaw;
  }
  unseat(v) { if (this.rider === v) this.rider = null; }
  animate(dt) {
    if (!this.mesh) return;
    // the model is built facing +z; people and the horse's own movement go
    // toward -z (yaw), so it is turned round: the head leads, the rider faces it
    this.mesh.position.copy(this.pos); this.mesh.rotation.set(0, this.yaw + Math.PI, 0);
    if (!this.alive) {
      const k = Math.min(1, this.deadT / 0.8);
      this.mesh.rotation.z = k * Math.PI / 2 * 0.92; this.mesh.position.y = this.pos.y + 0.12 * k;
      return;
    }
    const sp = this.speed;
    this.phase += dt * (sp > 6 ? 9 : 4 + sp * 0.8);
    const amp = Math.min(0.75, sp * 0.09);
    const gallop = sp > 6;
    this.legs.forEach((l, i) => {
      const off = gallop ? [0, 0.3, Math.PI, Math.PI + 0.3][i] : [0, Math.PI, Math.PI, 0][i];
      l.rotation.x = Math.sin(this.phase + off) * amp;
    });
    // head and neck: a gentle nod in step when walking; stretched out forward
    // and lower at the gallop (the neck reaches, the head opens up); a slow
    // sway standing still. Always forward of the chest, never back at the rider.
    const reach = gallop ? Math.min(1, (sp - 6) / 4) : 0;
    const nod = sp >= 0.3 ? Math.sin(this.phase * 2) * (gallop ? 0.07 : 0.045) : Math.sin(this.phase * 0.3) * 0.04;
    this.neck.rotation.x = NECK.base + reach * 0.28 + nod;
    this.upper.rotation.x = NECK.upper + reach * 0.22 - nod * 0.4;
    this.head.rotation.x = NECK.head - reach * 0.3 + nod * 0.5;
    this.tail.rotation.z = Math.sin(this.phase * 0.7) * 0.15;
  }
}

export class Horses {
  constructor(game, saved = {}) {
    this.game = game;
    this.list = [];
    this.tmp = new THREE.Vector3();
    this.box = new THREE.Box3(); this.ray = new THREE.Ray(); this.hit = new THREE.Vector3();
    this.stamina = 1;
    const v = game.world.sites.find((s) => s.type === 'village');
    // the stable's horses at the hitching rail, and a horse at each big farm
    const st = v && v.buildings.find((b) => b.type === 'stable');
    if (st && st.hitch) for (let k = 0; k < 4; k++) this.add(st.hitch.x + (k % 2) * 1.6 - 0.8, st.hitch.y, st.hitch.z + (k - 1.5) * 1.8, 'stable', null, k);
    if (v) for (const b of v.buildings) if (b.type === 'house' && b.status !== 'cottage' && b.field) {
      const f = b.field; this.add(f.gate.x, f.gate.y, f.gate.z, 'farm', { x: f.gate.x, y: f.gate.y, z: f.gate.z, home: b }, b.x0 % 6);
    }
    for (const h of saved.mine || []) this.add(h.x, h.y, h.z, 'player', null, h.coat);
    this.bar = document.createElement('div'); this.bar.id = 'stamina'; this.bar.hidden = true; this.bar.innerHTML = '<i></i>';
    document.getElementById('hud').appendChild(this.bar);
  }
  add(x, y, z, owner, home, coat) { const h = new Horse(this, x, y, z, owner, home, coat); this.list.push(h); return h; }
  // a horse for a posse rider (only so many horses at once)
  // a horse back to the stable: posse horses go away (the stable keeps its own
  // string); stable and farm horses return to their rail or yard
  stable(h) {
    if (h.owner === 'posse') { h.alive = false; h.deadT = 999; h.drop(); this.list = this.list.filter((x) => x !== h); return; }
    if (h.home) { h.pos.set(h.home.x, h.home.y, h.home.z); h.goal = null; h.settled = false; }
  }
  mountFor(v) {
    if (this.list.filter((h) => h.alive).length >= 32) return null;          // (only the nearest MAX_MODELS are drawn)
    const h = this.add(v.pos.x, v.pos.y, v.pos.z, 'posse', null);
    h.rider = v; v.horse = h; h.yaw = v.yaw;
    return h;
  }

  // ---- the player rides -------------------------------------------------------
  mount(h) {
    const g = this.game, T = g.town, p = g.player;
    if (!h.alive || h.rider) return;
    if (h.owner !== 'player') {
      // taking someone's horse: theft (if seen); it is yours from now on
      if (h.owner === 'stable' || h.owner === 'farm') T.crime('horsetheft', { pos: h.pos.clone() });
      h.owner = 'player';
    }
    h.rider = 'player'; h.settled = false; p.riding = h; p.vel.set(0, 0, 0); p.crouch = false;
    g.hud.toast(t('horse.mounted'));
    sfx.thump();
  }
  dismount(quiet = false) {
    const g = this.game, p = g.player, h = p.riding;
    if (!h) return;
    h.rider = null; p.riding = null;
    const w = g.world, side = [[Math.cos(h.yaw), -Math.sin(h.yaw)], [-Math.cos(h.yaw), Math.sin(h.yaw)], [Math.sin(h.yaw), Math.cos(h.yaw)], [-Math.sin(h.yaw), -Math.cos(h.yaw)]];
    for (const [dx, dz] of side) {
      const x = h.pos.x + dx * 1.2, z = h.pos.z + dz * 1.2, y = Math.floor(h.pos.y);
      for (const yy of [y, y + 1, y - 1]) if (!SOLID[w.get(Math.floor(x), yy, Math.floor(z))] && !SOLID[w.get(Math.floor(x), yy + 1, Math.floor(z))] && SOLID[w.get(Math.floor(x), yy - 1, Math.floor(z))]) { p.pos.set(x, yy, z); p.vel.set(0, 0, 0); this.bar.hidden = true; if (!quiet) sfx.thump(); return; }
    }
    p.pos.set(h.pos.x, h.pos.y + 0.1, h.pos.z); this.bar.hidden = true;
  }
  // ground under a horse at (x, z), near height y (null: no footing)
  ground(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 2 || bz < 2 || bx >= w.W - 2 || bz >= w.D - 2) return null;
    for (let yy = Math.floor(y) + 1; yy >= Math.floor(y) - 3; yy--) {
      const b = w.get(bx, yy, bz);
      if (SOLID[b] && !SOLID[w.get(bx, yy + 1, bz)] && !SOLID[w.get(bx, yy + 2, bz)] && !SOLID[w.get(bx, yy + 3, bz)]) return yy + 1;
    }
    return null;
  }
  waterDepth(x, y, z) {
    const w = this.game.world; let n = 0;
    for (let yy = Math.floor(y); yy < Math.floor(y) + 3; yy++) if (w.get(Math.floor(x), yy, Math.floor(z)) === B.WATER) n++;
    return n;
  }
  // the first floor at or below y (any depth), or null; water is not a floor
  floorUnder(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 2 || bz < 2 || bx >= w.W - 2 || bz >= w.D - 2) return null;
    for (let yy = Math.floor(y); yy > 1; yy--) if (SOLID[w.get(bx, yy, bz)]) return yy + 1;
    return null;
  }
  // the floor under the whole horse: the highest under its four hooves and its
  // middle (null: no footing under its middle)
  footFloor(x, z, y, yaw) {
    const c = this.floorUnder(x, z, y);
    if (c == null) return null;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw); let best = c;
    for (const [f, sd] of HOOVES) { const v = this.floorUnder(x + fx * f - fz * sd, z + fz * f + fx * sd, y); if (v != null && v > best) best = v; }
    return best;
  }
  // a free place for a horse near (x, z): standing there no part of it is in a
  // block (turned whichever way fits); null if there is none within r
  freeSpot(x, y, z, yaw = 0, r = 5) {
    for (let d = 0; d <= r; d += 0.5) {
      const n = d ? Math.max(6, Math.round(d * 8)) : 1;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        for (let j = 0; j < 8; j++) {
          const ya = yaw + j * Math.PI / 4, gy = this.footFloor(px, pz, y + 1.5, ya);
          if (gy != null && Math.abs(gy - y) <= 2 && this.clear(px, gy, pz, ya)) return { x: px, y: gy, z: pz, yaw: ya };
        }
      }
    }
    return null;
  }
  // the top of the water in this column (null: no water at the horse)
  waterTop(x, y, z) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    let yy = Math.floor(y + 0.4);
    if (w.get(bx, yy, bz) !== B.WATER && w.get(bx, yy + 1, bz) !== B.WATER) return null;
    while (w.get(bx, yy + 1, bz) === B.WATER) yy++;
    return yy + 1;
  }
  // You ride the horse like your own feet: it walks, gallops (run), jumps
  // (jump), steps up a block, goes down slopes and drops off ledges, and
  // swims in deep water (slowly, its head above the surface).
  ride(dt, it) {
    const g = this.game, p = g.player, h = p.riding;
    if (!h || !h.alive) { this.dismount(true); return; }
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let wx = -sy * it.fwd + cy * it.strafe * 0.5, wz = -cy * it.fwd - sy * it.strafe * 0.5;
    const wl = Math.hypot(wx, wz); if (wl > 1) { wx /= wl; wz /= wl; }
    const wTop = this.waterTop(h.pos.x, h.pos.y, h.pos.z);
    const bottom = this.floorUnder(h.pos.x, h.pos.z, h.pos.y + 0.3);
    const swimming = wTop != null && (bottom == null || wTop - bottom >= 1.6);
    const gallop = it.run && it.fwd > 0 && this.stamina > 0.05 && !swimming;
    if (gallop) this.stamina = Math.max(0, this.stamina - STAM_USE * dt); else this.stamina = Math.min(1, this.stamina + STAM_BACK * dt);
    let target = (swimming ? SWIM : gallop ? GALLOP : WALK) * Math.min(1, wl);
    if (!swimming && wTop != null) target *= 0.55;                     // wading
    h.speed += (target - h.speed) * Math.min(1, dt * (target > h.speed ? 2.5 : 4));
    if (wl > 0.05) { const ny = turnTo(h.yaw, Math.atan2(-wx, -wz), dt * 5); if (this.clear(h.pos.x, h.pos.y, h.pos.z, ny) || !this.clear(h.pos.x, h.pos.y, h.pos.z, h.yaw)) h.yaw = ny; }   // no turning its head into a wall
    // the ground under the horse now, and whether it stands on it
    h.vy = h.vy || 0;
    const floorHere = bottom ?? -99;
    const onGround = !swimming && h.pos.y <= floorHere + 0.05 && h.vy <= 0;
    if (onGround && it.jump && !h.jumpHeld) { h.vy = JUMP_V; sfx.thump(); }
    h.jumpHeld = !!it.jump;
    // horizontal: one block up while walking (two in a jump), a two-block wall stops it
    const st = h.speed * dt, nx = h.pos.x - Math.sin(h.yaw) * st, nz = h.pos.z - Math.cos(h.yaw) * st;
    const ok = (x, z) => {
      const climb = swimming ? 1.7 : 1.05;                                  // out of the water onto a bank
      const gy = this.footFloor(x, z, h.pos.y + climb, h.yaw);
      if (gy == null || gy > h.pos.y + climb) return null;                  // the edge of the world, or a wall too high (jump it)
      return this.clear(x, Math.max(gy, h.pos.y + (swimming ? 1 : 0)), z, h.yaw) ? true : null;   // swimming, its legs hang below the bank's edge
    };
    if (ok(nx, nz)) { h.pos.x = nx; h.pos.z = nz; }
    else if (Math.abs(nx - h.pos.x) > 0.002 && ok(nx, h.pos.z)) h.pos.x = nx;
    else if (Math.abs(nz - h.pos.z) > 0.002 && ok(h.pos.x, nz)) h.pos.z = nz;
    else h.speed *= 0.3;
    // vertical: step up, fall with gravity, float when swimming
    const floor = this.footFloor(h.pos.x, h.pos.z, h.pos.y + 1.05, h.yaw);
    if (swimming || (wTop != null && floor != null && wTop - floor >= 1.6)) {
      const want = wTop - 1.35;                                             // body under water, head and rider above
      h.vy = 0; h.pos.y += (want - h.pos.y) * Math.min(1, dt * 4);
      if (floor != null && floor > h.pos.y) h.pos.y = floor;
      if (it.jump && floor != null && floor - h.pos.y <= 1.05) h.pos.y += dt * 3;   // climbing out onto the bank
    } else if (floor != null && floor > h.pos.y && h.vy <= 0) {
      if (floor - h.pos.y <= 1.05) h.pos.y += (floor - h.pos.y) * Math.min(1, dt * 12);   // a step up
    } else {
      h.vy -= HORSE_G * dt; h.pos.y += h.vy * dt;
      if (floor != null && h.pos.y <= floor) {
        if (h.vy < -14) g.damage(Math.round((-h.vy - 14) * 4), 'fall');      // a long drop hurts the rider
        h.pos.y = floor; h.vy = 0;
      }
    }
    if (h.pos.y < 2) h.pos.y = 2;
    h.swimming = swimming;
    // the rider sits on the saddle (eye height set by the player)
    p.pos.set(h.pos.x, h.pos.y + SADDLE_ROOT + 0.35, h.pos.z); p.vel.set(0, 0, 0); p.onGround = true;
    p.running = gallop;
    this.bar.hidden = false;
    this.bar.firstChild.style.width = Math.round(this.stamina * 100) + '%';
    if (h.speed > 1 && (h.stepAcc = (h.stepAcc || 0) + h.speed * dt) > 2.4) { h.stepAcc = 0; sfx.step('dirt'); }
  }
  // the whole horse is free of blocks: its long body from rump to chest, and
  // its neck and head reaching forward and up (from y + 1.05 up: the legs may
  // straddle a one-block step, up or down). Turned by its heading, so neither
  // the head nor the rump can sink into a wall.
  clear(x, y, z, yaw = 0) {
    const w = this.game.world, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    for (const [f, s, y0, y1] of BODY_PTS) {
      const px = x + fx * f - fz * s, pz = z + fz * f + fx * s;
      for (let yy = Math.floor(y + y0); yy <= Math.floor(y + y1); yy++) if (SOLID[w.get(Math.floor(px), yy, Math.floor(pz))]) return false;
    }
    return true;
  }

  // ---- shots and damage --------------------------------------------------------
  raycast(origin, dir, maxDist) {
    let best = null, bd = maxDist;
    this.ray.set(origin, dir);
    for (const h of this.list) {
      if (!h.alive || h.rider === 'player') continue;
      if (Math.abs(h.pos.x - origin.x) > maxDist + 2 || Math.abs(h.pos.z - origin.z) > maxDist + 2) continue;
      this.box.min.set(h.pos.x - 0.6, h.pos.y + 0.1, h.pos.z - 0.6); this.box.max.set(h.pos.x + 0.6, h.pos.y + 1.7, h.pos.z + 0.6);
      if (this.ray.intersectBox(this.box, this.hit)) { const d = this.hit.distanceTo(origin); if (d < bd) { bd = d; best = { horse: h, dist: d, point: this.hit.clone() }; } }
    }
    return best;
  }
  near(pos, r = 3.2) {
    let best = null, bd = r;
    for (const h of this.list) { if (!h.alive) continue; const d = Math.hypot(h.pos.x - pos.x, h.pos.z - pos.z); if (d < bd && Math.abs(h.pos.y - pos.y) < 2.5) { bd = d; best = h; } }
    return best;
  }
  hurt(h, dmg, by) {
    if (!h.alive) return;
    const g = this.game;
    h.hp -= dmg;
    g.particles.burst(h.pos.x, h.pos.y + 1.1, h.pos.z, g.settings.blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3], 3, 1, 0.5, 14);
    if (h.hp > 0) return;
    h.alive = false; h.deadT = 0; h.speed = 0;
    // the rider falls and the horse is lost
    if (h.rider === 'player') { this.dismount(true); g.damage(8, 'fall'); }
    else if (h.rider) { const v = h.rider; v.horse = null; h.rider = null; }
    if (by === 'player' && (h.owner === 'stable' || h.owner === 'farm')) g.town.crime('livestock', { pos: h.pos.clone() });
  }

  fall(h, dt) {
    const wt = this.waterTop(h.pos.x, h.pos.y, h.pos.z), fy = this.footFloor(h.pos.x, h.pos.z, h.pos.y + 0.5, h.yaw);
    if (wt != null && (fy == null || wt - fy >= 1.6)) { h.vy = 0; h.pos.y += (wt - 1.35 - h.pos.y) * Math.min(1, dt * 3); return; }
    if (fy == null) return;
    if (h.pos.y > fy + 0.03) { h.vy = Math.max(-25, (h.vy || 0) - 22 * dt); h.pos.y = Math.max(fy, h.pos.y + h.vy * dt); if (h.pos.y <= fy) h.vy = 0; }
    else if (h.pos.y < fy - 0.03 && fy - h.pos.y < 1.1) h.pos.y = fy;
  }
  // ---- per frame -------------------------------------------------------------------
  update(dt) {
    const g = this.game, P = g.player.pos;
    this.dt = dt;
    for (const h of this.list) {
      if (!h.alive) { h.deadT += dt; this.fall(h, dt); continue; }
      if (h.rider) continue;
      // standing horses obey gravity too: one left on a ledge, on a bridge
      // that was dug away or after a jump comes down (or floats in water)
      this.fall(h, dt);
      // a loose posse horse far from you goes back; so do stable and farm horses that strayed
      const dP = Math.hypot(h.pos.x - P.x, h.pos.z - P.z);
      if (dP > 90 && ((h.owner === 'posse' && !h.rider) || ((h.owner === 'stable' || h.owner === 'farm') && h.home && Math.hypot(h.pos.x - h.home.x, h.pos.z - h.home.z) > 12))) { this.stable(h); continue; }
      // a horse placed (or left) with its head or rump in a wall turns to a free heading
      // (or, if no heading fits there, steps out to the nearest place it fits)
      if (!h.settled) { h.settled = true; if (!this.clear(h.pos.x, h.pos.y, h.pos.z, h.yaw)) { const f = this.freeSpot(h.pos.x, h.pos.y, h.pos.z, h.yaw); if (f) { h.pos.set(f.x, f.y, f.z); h.yaw = f.yaw; } } }
      // grazing and ambling around home; a lost posse horse stays where it is
      h.wanderT -= dt;
      if (h.wanderT <= 0) { h.wanderT = 5 + Math.random() * 8; const a = Math.random() * 6.28, r = Math.random() * (h.owner === 'stable' ? 1.5 : 4); h.goal = h.owner === 'posse' ? null : { x: h.home.x + Math.cos(a) * r, z: h.home.z + Math.sin(a) * r }; }
      if (h.goal && Math.hypot(h.goal.x - h.pos.x, h.goal.z - h.pos.z) > 0.4 && Math.hypot(h.pos.x - P.x, h.pos.z - P.z) < MODEL_M) {
        const a = Math.atan2(-(h.goal.x - h.pos.x), -(h.goal.z - h.pos.z));
        { const ny = turnTo(h.yaw, a, dt * 2); if (this.clear(h.pos.x, h.pos.y, h.pos.z, ny)) h.yaw = ny; else h.goal = null; }
        const nx = h.pos.x - Math.sin(h.yaw) * 1.1 * dt, nz = h.pos.z - Math.cos(h.yaw) * 1.1 * dt, gy = this.ground(nx, nz, h.pos.y + 1) != null ? this.footFloor(nx, nz, h.pos.y + 1, h.yaw) : null;
        if (gy != null && Math.abs(gy - h.pos.y) <= 1 && this.clear(nx, gy, nz, h.yaw)) { h.pos.x = nx; h.pos.z = nz; h.pos.y = gy; h.speed = 1.1; } else { h.goal = null; h.speed = 0; }
      } else h.speed = Math.max(0, h.speed - dt * 3);
    }
    // bodies are taken away after a while
    this.list = this.list.filter((h) => { if (!h.alive && h.deadT > 60) { h.drop(); return false; } return true; });
    // only the nearest horses have a model
    const order = this.list.map((h) => [h, Math.hypot(h.pos.x - P.x, h.pos.z - P.z)]).sort((a, b) => a[1] - b[1]);
    order.forEach(([h, d], k) => {
      if (k < MAX_MODELS && d < MODEL_M) { if (!h.mesh) h.build(); h.animate(d < 50 ? dt : dt); } else h.drop();
    });
  }
  toSave() { return { mine: this.list.filter((h) => h.alive && h.owner === 'player').map((h) => ({ x: +h.pos.x.toFixed(1), y: +h.pos.y.toFixed(1), z: +h.pos.z.toFixed(1), coat: h.coat })) }; }
  dispose() { for (const h of this.list) h.drop(); this.bar.remove(); }
}

function turnTo(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * Math.min(1, k);
}
