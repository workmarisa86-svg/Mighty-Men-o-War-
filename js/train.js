// Town Life (2.7): the railroad. A line runs across the country, well away
// from the town (on a trestle over water and low ground, through cuttings in
// the hills). The train comes through twice a day: eastbound in the morning
// (8 to 10), westbound in the afternoon (15 to 17), and it stops at the water
// tower halfway for twenty minutes each way.
//
// Stopped at the tower, it can be held up (aim at it with a gun): three
// express guards climb down and fight. With them down (or giving up), rob
// the express car: a fortune, a big bounty, and the law after you. Once a day.
// Don't stand on the line when it's coming.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

const RUNS = [{ from: 8, to: 10, dir: 1 }, { from: 15, to: 17, dir: -1 }];
const STOP = 20 / 60;                 // hours at the water tower

export class Train {
  constructor(town, saved = {}) {
    this.T = town; this.game = town.game;
    this.robbedDay = saved.robbedDay ?? null;
    this.line = saved.line || null;
    if (!this.line) this.line = this.layLine();
    this.relay();
    this.mesh = null; this.guards = null; this.held = false;
  }
  hour() { return (this.game.time % 1) * 24; }
  day() { return Math.floor(this.game.time); }
  // a straight line east-west, away from the town, the lots, the homes and the camps
  layLine() {
    const g = this.game, w = g.world, V = this.T.village;
    for (const off of [110, -110, 150, -150, 80, -80, 190, -190]) {
      const z = Math.floor(V.cz + off);
      if (z < 20 || z >= w.D - 20) continue;
      const x0 = 12, x1 = w.W - 13;
      let bad = false;
      for (let x = x0; x <= x1 && !bad; x++) for (let dz = -3; dz <= 3 && !bad; dz++) for (let y = 2; y < (w.H || 64); y += 2) if (w.isLocked(x, y, z + dz)) { bad = true; break; }
      if (bad) continue;
      // the line's level: a little above the usual ground
      const hs = []; for (let x = x0; x <= x1; x += 8) hs.push(w.surfaceY(x, z)); hs.sort((a, b) => a - b);
      const y = Math.max(hs[Math.floor(hs.length / 2)] + 1, 6);
      return { x0, x1, z, y, mid: Math.floor((x0 + x1) / 2), built: false };
    }
    return null;
  }
  // (re)build the track: a bed of planks with iron rails, trestle legs down to the
  // ground, the way cleared above; a water tower halfway
  relay() {
    const L = this.line, w = this.game.world;
    if (!L || L.built) return;
    const { x0, x1, z, y } = L;
    for (let x = x0; x <= x1; x++) {
      for (let dz = -2; dz <= 2; dz++) for (let h = 0; h <= 5; h++) { const id = w.get(x, y + h, z + dz); if (id !== B.AIR && !w.isLocked(x, y + h, z + dz)) w.set(x, y + h, z + dz, B.AIR); }
      for (let dz = -1; dz <= 1; dz++) w.set(x, y - 1, z + dz, dz ? B.IRON : B.WOOD);
      if (x % 6 === 0) for (const dz of [-1, 1]) for (let yy = y - 2; yy > 1 && !SOLID[w.get(x, yy, z + dz)]; yy--) w.set(x, yy, z + dz, B.LOG);
    }
    // the water tower beside the line
    const tx = L.mid, tz = z + 4;
    for (let yy = y - 1; yy > 1 && !SOLID[w.get(tx, yy, tz)]; yy--) w.set(tx, yy, tz, B.LOG);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let h = 0; h < 4; h++) w.set(tx + dx, y + h, tz + dz, B.LOG);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let h = 4; h < 7; h++) w.set(tx + dx, y + h, tz + dz, h === 6 ? B.THATCH : B.WOOD);
    L.built = true;
  }
  // where the train is now (null: not running)
  where() {
    const L = this.line, h = this.hour();
    if (!L) return null;
    for (const R of RUNS) {
      if (h < R.from || h >= R.to) continue;
      const half = (R.to - R.from - STOP) / 2, k = h - R.from;
      let f;            // 0..1 along the line, in the direction of travel
      if (k < half) f = 0.5 * (k / half);
      else if (k < half + STOP) f = 0.5;
      else f = 0.5 + 0.5 * ((k - half - STOP) / half);
      const x = R.dir > 0 ? L.x0 + (L.x1 - L.x0) * f : L.x1 - (L.x1 - L.x0) * f;
      return { x, dir: R.dir, stopped: k >= half && k < half + STOP };
    }
    return null;
  }
  build() {
    const g = new THREE.Group(), lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d, c, x, y, z, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); parent.add(m); return m; };
    const cyl = (r, l, c, x, y, z, rot = true) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 14), lam(c)); if (rot) m.rotation.z = Math.PI / 2; m.position.set(x, y, z); g.add(m); return m; };
    // the locomotive (front toward +x): boiler, smokestack, cab, cowcatcher
    cyl(0.85, 4.2, 0x22201e, 1.2, 1.9, 0); box(1.9, 0.3, 2.4, 0x3a2a20, 1.2, 0.85, 0);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 1.3, 12), lam(0x1a1816)); st.position.set(2.7, 3.2, 0); g.add(st);
    box(0.5, 0.5, 0.5, 0xc8a040, 1.6, 2.85, 0);                     // the bell
    box(1.8, 2.2, 2.3, 0x7a1e18, -1.5, 2.2, 0); box(2.0, 0.2, 2.5, 0x2a1c14, -1.5, 3.4, 0);
    const cc = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.1, 4), lam(0x9a2a1e)); cc.rotation.z = -Math.PI / 2; cc.rotation.x = Math.PI / 4; cc.position.set(3.7, 0.75, 0); g.add(cc);
    for (const x of [2.4, 0.6]) for (const z of [-1, 1]) cyl(0.75, 0.15, 0xb8401e, x, 0.75, z * 1.05, false).rotation.x = Math.PI / 2;
    // the tender, the express car (in red) and a passenger car
    const car = (x, len, col, roof) => {
      box(len, 2.2, 2.4, col, x, 1.95, 0); box(len + 0.2, 0.18, 2.6, roof, x, 3.15, 0); box(len, 0.25, 2.2, 0x2a2420, x, 0.8, 0);
      for (const dx of [-len / 2 + 0.7, len / 2 - 0.7]) for (const z of [-1, 1]) cyl(0.45, 0.14, 0x1a1816, x + dx, 0.55, z * 1.05, false).rotation.x = Math.PI / 2;
    };
    car(-4.1, 2.8, 0x2a2622, 0x1e1a18);
    car(-7.7, 5.4, 0x8a2a1c, 0x3a2a20);
    car(-13.5, 5.4, 0x3e5a3a, 0x2a2420);
    for (let k = 0; k < 4; k++) box(0.06, 0.6, 0.7, 0xe8d8a0, -15.7 + k * 1.4, 2.3, 1.22);    // windows
    return g;
  }
  update(dt) {
    const g = this.game, L = this.line, P = g.player.pos;
    if (!L) return;
    const at = this.where(), near = at && Math.abs(at.x - P.x) < 220 && Math.abs(L.z - P.z) < 220;
    if (!near) { if (this.mesh) { g.scene.remove(this.mesh); this.mesh = null; } this.endGuards(); return; }
    if (!this.mesh) { this.mesh = this.build(); g.scene.add(this.mesh); }
    const held = this.held && at.stopped;
    if (!at.stopped) this.held = false;
    this.mesh.position.set(at.x, L.y, L.z + 0.5);
    this.mesh.rotation.y = at.dir > 0 ? 0 : Math.PI;
    // the whistle as it comes in and leaves, smoke from the stack
    this.puffT = (this.puffT || 0) - dt;
    if (this.puffT <= 0) { this.puffT = at.stopped ? 1.4 : 0.35; g.particles.burst(at.x + at.dir * 2.7, L.y + 4, L.z + 0.5, [0.55, 0.55, 0.55], 4, 1.4, 1.6, -2); }
    const d = Math.hypot(at.x - P.x, L.z - P.z);
    if (at.stopped !== this.wasStopped) { this.wasStopped = at.stopped; if (d < 160) sfx.whistle && sfx.whistle(Math.max(0.2, 1 - d / 160)); }
    // anyone on the line in front of it is hit
    if (!at.stopped && !held && Math.abs(P.z - (L.z + 0.5)) < 1.6 && Math.abs(P.y - L.y) < 2 && (P.x - at.x) * at.dir > -1 && (P.x - at.x) * at.dir < 4.5 && !g.dying) {
      g.damage(70, 'train', new THREE.Vector3(at.x, L.y + 1, L.z));
      g.player.vel.z += P.z > L.z + 0.5 ? 9 : -9; g.player.vel.y += 5;
    }
    if (this.guards) this.updateGuards();
  }
  // the hold-up: aim at the stopped train with a gun
  aimTarget(eye, dir, gun) {
    const g = this.game, L = this.line, at = this.where(), P = g.player.pos;
    if (!L || !at || !at.stopped) return null;
    const d = Math.hypot(at.x - 6 * at.dir - P.x, L.z - P.z);
    if (d > 14) return null;
    if (!this.held && gun) {
      if (this.robbedDay === this.day()) return null;
      return { a: 'train', label: t('train.holdup'), run: () => this.holdUp() };
    }
    if (this.held && d < 9) return { a: 'trainrob', label: t('train.rob'), run: () => this.rob() };
    return null;
  }
  holdUp() {
    const g = this.game, T = this.T, F = T.folk, L = this.line, at = this.where();
    this.held = true;
    this.guards = [];
    for (let k = 0; k < 3; k++) {
      const look = { shirt: 0x3a4a5a, trousers: 0x262420, vest: 0x2a2018, hat: 'felt', hatColor: 0x1e1a16, hair: 0x2a1c12, moustache: k !== 1, gunbelt: true };
      const x = at.x - at.dir * (5 + k * 2.4), z = L.z + 0.5 + (k % 2 ? 2.5 : -2.5), y = F.ground(x, z, L.y + 2) ?? L.y;
      const v = T.trades.makeMan(t('train.guard'), 8300 + k, look, { x, y, z });
      Object.assign(v, { outlaw: true, guns: k === 1 ? ['shotgun', 'revolver'] : ['lever', 'revolver'], money: 15, goods: [], brave: 0.95, trainGuard: true });
      v.fight = { armed: F.bestGun(v) }; F.armed(v, v.fight.armed); v.cool = T.duels.reaction(v);
      v.ai = () => false; v.onKill = () => {};
      F.extra.push(v); this.guards.push(v);
    }
    T.crime('holdup', { pos: g.player.pos.clone() }); T.addBounty(50, 'holdup');
    g.hud.alert(t('train.held')); sfx.alert();
  }
  updateGuards() {
    if (this.guards.every((v) => !v.alive || v.surrendered > 0)) this.guardsDown = true;
  }
  rob() {
    const g = this.game, T = this.T;
    if (this.robbedDay === this.day()) { g.hud.toast(t('train.empty')); return; }
    if (this.guards && this.guards.some((v) => v.alive && !(v.surrendered > 0))) { g.hud.toast(t('train.guards')); sfx.error(); return; }
    this.robbedDay = this.day();
    const n = 500 + Math.floor(Math.random() * 450);
    T.money += n; T.st.earned += n;
    T.addBounty(120, 'robbery'); T.crime('robbery', { value: n, pos: g.player.pos.clone() }); T.trades.rep('outlaws', 10); T.addHonor(-10);
    g.hud.bigMessage(t('train.robbed'), t('train.robbedSub', { n })); sfx.coins();
    if (!T.posse) T.formPosse(g.player.pos.clone());
  }
  endGuards() {
    if (!this.guards) return;
    const F = this.T.folk;
    for (const v of this.guards) if (v.alive) { F.dropRig(v); v.away = true; v.alive = false; }
    this.guards = null; this.held = false;
  }
  mapMarks() {
    const L = this.line, at = this.where(), out = [];
    if (!L) return out;
    out.push({ x: L.mid, z: L.z + 4, kind: 'station', label: t('train.tower') });
    if (at) out.push({ x: at.x, z: L.z, kind: 'coach', label: t('train.name') });
    return out;
  }
  toSave() { return { robbedDay: this.robbedDay, line: this.line }; }
}
