// War: army cars. Each side drives its own light car: the Willys jeep (US,
// Britain, Canada, Australia, India, China), the GAZ-67 (Soviet Union), the
// Kübelwagen (Germany and occupied Axis countries), the Fiat staff car
// (Italy) and the Kurogane (Japan). Original low-poly models with national
// markings only (stars, roundels, the plain black cross, the red disc).
//  - Headquarters keep a car parked outside the door; a car can also be
//    built at a campfire (the longest job there is, and lots of iron).
//  - Aim at a car of your side and tap it (or press E) to drive. Inside you
//    only drive and shoot the gun in your hands; a small bar offers Exit and
//    Lights (E and L on a computer). Up to three followers ride along.
//  - Fast and simple handling: it climbs one-block steps, is stopped by
//    two-block walls, never enters a headquarters, wades one block of water
//    slowly and is lost (with you) in water two blocks deep.
//  - Loud: enemies hear the engine from far away; headlights at night are
//    seen from further still. Shots and blasts wear a car down; at 0 it is
//    wrecked and everyone inside is thrown out.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { COUNTRY } from './countries.js';
import { t } from './i18n.js';
import { sfx, engineLoop } from './audio.js';
import { metal, marking } from './travel.js';

export const MAX_CARS = 12;               // cars in a country at once (wrecks aside)
const MAX_MODELS = 8, MODEL_M = 150;
const TOP = 15, BACK = 4.5, ACCEL = 6, BRAKE = 11, DRAG = 1.6, STEER = 1.7;
const KIND = { us: 'jeep', uk: 'jeep', ca: 'jeep', au: 'jeep', in: 'jeep', cn: 'jeep', su: 'gaz', de: 'kubel', it: 'fiat', jp: 'kurogane' };
// size (length, width, wheel radius), paint and hit points per model
const SPEC = {
  jeep: { L: 3.35, W: 1.58, r: 0.36, paint: '#4e5434', hp: 160 },
  gaz: { L: 3.4, W: 1.62, r: 0.37, paint: '#4a5236', hp: 160 },
  kubel: { L: 3.75, W: 1.6, r: 0.38, paint: '#5a5c52', hp: 170 },
  fiat: { L: 4.0, W: 1.62, r: 0.38, paint: '#8a7c58', hp: 170 },
  kurogane: { L: 3.4, W: 1.5, r: 0.35, paint: '#6a6444', hp: 150 },
};
// where people sit (car-local x, z; feet root height above the car's ground)
const SEATS = [[-0.36, -0.05], [0.36, -0.05], [-0.36, 0.8], [0.36, 0.8]];
const SEAT_Y = 0.32, EYE_SEATED = 1.32;

// the nation whose car a side drives in this country
export function carNation(cfg, side) {
  const c = COUNTRY[cfg.country];
  if (c && c.side === side && !c.occupied && KIND[c.id]) return c.id;
  if (side === 'allies') return c && c.id === 'su' ? 'su' : 'us';
  if (c && ['cn', 'au', 'in', 'us'].includes(c.id)) return 'jp';
  return c && (c.id === 'gr' || c.id === 'it') ? 'it' : 'de';
}

// ------------------------------------------------------------------ models
const GEO = {}, MATS = {};
const box = (w, h, d) => GEO['b' + w + h + d] || (GEO['b' + w + h + d] = new THREE.BoxGeometry(w, h, d));
const cyl = (r1, r2, h, n = 12) => GEO['c' + r1 + r2 + h + n] || (GEO['c' + r1 + r2 + h + n] = new THREE.CylinderGeometry(r1, r2, h, n));
function mats(kind, nat) {
  const k = kind + nat;
  if (MATS[k]) return MATS[k];
  const lam = (o) => new THREE.MeshLambertMaterial(o);
  return (MATS[k] = {
    body: lam({ map: metal('car-' + kind, SPEC[kind].paint) }),
    dark: lam({ color: 0x24251f }), rubber: lam({ color: 0x1a1a18 }), seat: lam({ color: 0x3e3426 }),
    canvas: lam({ color: kind === 'kubel' ? 0x4a4a40 : 0x5e5a44 }), glass: lam({ color: 0x8aa0a8, transparent: true, opacity: 0.35 }),
    chrome: lam({ color: 0x9a9a90 }),
    mark: new THREE.MeshBasicMaterial({ map: marking(nat), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    wreck: lam({ color: 0x1e1c1a }),
  });
}
function build(car) {
  const S = SPEC[car.kind], M = mats(car.kind, car.nat), L = S.L, W = S.W, r = S.r;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const add = (geo, mat, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const k = car.kind;
  // the tub: floor, sides, rear; open on top (you look out over the hood)
  add(box(W, 0.12, L * 0.9), M.body, 0, r + 0.12, 0);
  for (const s of [-1, 1]) add(box(0.06, 0.5, L * 0.6), M.body, s * (W / 2 - 0.03), r + 0.42, L * 0.12);
  add(box(W, 0.5, 0.06), M.body, 0, r + 0.42, L * 0.42);
  add(box(W, 0.5, 0.06), M.body, 0, r + 0.42, -L * 0.18);                                           // the firewall
  // the hood and the nose
  if (k === 'kubel') {
    const nose = add(box(W * 0.96, 0.5, 1.1), M.body, 0, r + 0.42, -L * 0.36); nose.rotation.x = 0.32;   // sloped, flat-panelled front
    for (let i = 0; i < 5; i++) add(box(W + 0.02, 0.03, L * 0.55), M.body, 0, r + 0.25 + i * 0.09, L * 0.12);   // ribbed side panels
    add(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.18, 12), M.rubber, 0, r + 0.75, -L * 0.33).rotation.x = 0.32 + Math.PI / 2;   // spare on the nose
  } else {
    const hoodL = k === 'fiat' ? L * 0.36 : L * 0.3;
    add(box(W * (k === 'fiat' ? 0.62 : 0.74), 0.34, hoodL), M.body, 0, r + 0.5, -L * 0.18 - hoodL / 2);
    // the grille: jeep slots, GAZ and Kurogane plain, Fiat a tall chrome one
    const gz = -L * 0.18 - hoodL - 0.02;
    add(box(W * (k === 'fiat' ? 0.5 : 0.72), 0.42, 0.06), k === 'fiat' ? M.chrome : M.body, 0, r + 0.48, gz);
    if (k === 'jeep') for (let i = 0; i < 9; i++) add(box(0.04, 0.3, 0.02), M.dark, -0.32 + i * 0.08, r + 0.48, gz - 0.035);
    else for (let i = 0; i < 4; i++) add(box(W * 0.6, 0.025, 0.02), M.dark, 0, r + 0.36 + i * 0.08, gz - 0.035);
    // fenders over the front wheels (flat on the jeep, rounded on the others)
    for (const s of [-1, 1]) {
      if (k === 'jeep') add(box(0.32, 0.05, 0.9), M.body, s * (W / 2 - 0.12), r + 0.42, -L * 0.3);
      else { const f = add(GEO.fender || (GEO.fender = new THREE.CylinderGeometry(r + 0.1, r + 0.1, 0.3, 10, 1, true, 0, Math.PI)), M.body, s * (W / 2 - 0.13), r, -L * 0.31); f.rotation.set(Math.PI / 2, 0, Math.PI / 2); f.material.side = THREE.DoubleSide; }
    }
    if (k === 'fiat') for (const s of [-1, 1]) add(box(0.22, 0.04, L * 0.45), M.dark, s * (W / 2 + 0.05), r * 0.75, L * 0.02);   // running boards
  }
  // windscreen (a thin frame and pale glass) and the steering wheel on the left
  add(box(W * 0.94, 0.04, 0.05), M.dark, 0, r + 0.98, -L * 0.17);
  for (const s of [-1, 1]) add(box(0.04, 0.32, 0.05), M.dark, s * W * 0.46, r + 0.82, -L * 0.17);
  add(box(W * 0.9, 0.28, 0.02), M.glass, 0, r + 0.82, -L * 0.17);
  const wheel = add(new THREE.TorusGeometry(0.17, 0.02, 4, 12), M.dark, SEATS[0][0], r + 0.78, SEATS[0][1] - 0.48); wheel.rotation.x = -0.9;
  // seats; a folded canvas top behind the rear seat; a spare at the back
  for (const [sx, sz] of SEATS) { add(box(0.44, 0.12, 0.44), M.seat, sx, r + 0.3, sz); add(box(0.44, 0.42, 0.08), M.seat, sx, r + 0.52, sz + 0.24); }
  add(box(W * 0.9, 0.16, 0.36), M.canvas, 0, r + 0.75, L * 0.38);
  if (k !== 'kubel') add(new THREE.CylinderGeometry(r * 0.9, r * 0.9, 0.18, 12), M.rubber, k === 'fiat' ? -W / 2 - 0.1 : 0, r + 0.45, k === 'fiat' ? -L * 0.1 : L * 0.47).rotation.set(k === 'fiat' ? 0 : Math.PI / 2, 0, k === 'fiat' ? Math.PI / 2 : 0);
  // headlights (their glass lights up)
  const lampOn = new THREE.MeshBasicMaterial({ color: 0x3a3a30 });
  const lampZ = k === 'kubel' ? -L * 0.42 : -L * 0.18 - (k === 'fiat' ? L * 0.36 : L * 0.3) + 0.05;
  for (const s of [-1, 1]) { const l = add(cyl(0.1, 0.1, 0.12, 10), lampOn, s * (k === 'jeep' ? 0.3 : W / 2 - 0.16), r + (k === 'jeep' ? 0.55 : 0.68), lampZ - 0.05); l.rotation.x = Math.PI / 2; }
  // the four wheels
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wg = new THREE.Group(); wg.position.set(sx * (W / 2 - 0.08), r, sz * L * 0.32); g.add(wg);
    const tyre = new THREE.Mesh(cyl(r, r, 0.24, 12), M.rubber); tyre.rotation.z = Math.PI / 2; wg.add(tyre);
    const hub = new THREE.Mesh(cyl(r * 0.5, r * 0.5, 0.26, 8), M.body); hub.rotation.z = Math.PI / 2; wg.add(hub);
    wheels.push(wg);
  }
  // national markings: both sides, and the hood for the Allies' star
  for (const s of [-1, 1]) { const d = add(new THREE.PlaneGeometry(0.42, 0.42), M.mark, s * (W / 2 + 0.01), r + 0.45, L * 0.18); d.rotation.y = s * Math.PI / 2; }
  if (car.nat !== 'de' && car.nat !== 'jp' && car.nat !== 'it') { const d = add(new THREE.PlaneGeometry(0.55, 0.55), M.mark, 0, r + 0.68, -L * 0.33); d.rotation.x = -Math.PI / 2; }
  car.mesh = g; car.body = body; car.wheels = wheels; car.lampMat = lampOn;
  if (!car.alive) car.wreckLook();
  return g;
}

class Car {
  constructor(mgr, o) {
    this.mgr = mgr;
    this.nat = o.n; this.kind = KIND[o.n] || 'jeep'; this.side = o.s;
    this.pos = new THREE.Vector3(o.x, o.y, o.z); this.yaw = o.yaw || 0; this.speed = 0;
    this.hp = o.hp ?? SPEC[this.kind].hp; this.alive = this.hp > 0; this.mine = !!o.m; this.home = o.h ?? null;
    this.mesh = null; this.lights = false; this.roll = 0; this.wreckT = 0; this.spin = 0;
  }
  get S() { return SPEC[this.kind]; }
  wreckLook() {
    if (!this.mesh) return;
    this.mesh.traverse((m) => { if (m.isMesh && m.material !== this.lampMat) m.material = mats(this.kind, this.nat).wreck; });
  }
  // a point in car-local coordinates (x right, z back) to world
  local(x, z, out) { const c = Math.cos(this.yaw), s = Math.sin(this.yaw); return out.set(this.pos.x + x * c + z * s, this.pos.y, this.pos.z - x * s + z * c); }
}

export class Vehicles {
  constructor(game, saved) {
    this.game = game; this.list = [];
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
    this.ray = new THREE.Ray(); this.box3 = new THREE.Box3(); this.hitP = new THREE.Vector3(); this.m4 = new THREE.Matrix4();
    this.warnT = 0; this.noiseT = 0; this.blockT = 0; this.engine = null;
    if (Array.isArray(saved)) for (const o of saved) this.list.push(new Car(this, o));
    else this.parkAtHQs();
    // the driven car's headlights: one spotlight, always in the scene (off by day)
    this.beam = new THREE.SpotLight(0xfff0d0, 0, 70, 0.55, 0.5, 1);
    this.beam.target = new THREE.Object3D(); game.scene.add(this.beam, this.beam.target);
    // the bar while driving: Exit and Lights (kept clear of the other buttons)
    const bar = this.bar = document.createElement('div'); bar.id = 'carbar'; bar.hidden = true;
    bar.innerHTML = `<button class="btn small" data-car="exit"></button><button class="btn small" data-car="lights"></button>`;
    document.getElementById('hud').appendChild(bar);
    let last = 0;
    const go = (e) => {
      const b = e.target.closest('[data-car]'); if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const now = performance.now(); if (now - last < 350) return; last = now;
      if (b.dataset.car === 'exit') this.exit(); else this.toggleLights();
    };
    bar.addEventListener('pointerdown', go); bar.addEventListener('touchstart', go, { passive: false });
    bar.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.labels();
  }
  labels() {
    const pc = !this.game.app.input.touch, kb = (k) => pc ? `<kbd>${k}</kbd>` : '';
    this.bar.children[0].innerHTML = kb('E') + t('car.exit');
    this.bar.children[1].innerHTML = kb('L') + t(this.game.player.car && this.game.player.car.lights ? 'car.lightsOff' : 'car.lightsOn');
  }
  sideOf(owner) { const me = this.game.cfg.side; return owner === 'ally' ? me : owner === 'enemy' ? (me === 'allies' ? 'axis' : 'allies') : null; }
  alive() { return this.list.filter((c) => c.alive); }
  add(o) { const c = new Car(this, o); this.list.push(c); return c; }
  canAdd() { return this.alive().length < MAX_CARS; }

  // one car parked outside each headquarters' door
  parkAtHQs() {
    const g = this.game, F = g.forts;
    if (!F || g.townMode) return;
    F.list.forEach((f, i) => {
      if (!this.canAdd() || !f.doorOut) return;
      const side = this.sideOf(f.owner); if (!side) return;
      const ox = f.doorOut.x - (f.cx + 0.5), oz = f.doorOut.z - (f.cz + 0.5), ol = Math.hypot(ox, oz) || 1;
      const nx = ox / ol, nz = oz / ol;
      // beside the door first, then anywhere around the walls
      const spots = [];
      for (const off of [4.5, -4.5, 6.5, -6.5]) spots.push([f.doorOut.x + nx * 2.5 - nz * off, f.doorOut.z + nz * 2.5 + nx * off, Math.atan2(nx, nz)]);
      const a0 = Math.atan2(nx, nz);
      for (let k = 1; k < 18; k++) { const a = a0 + k * Math.PI / 9; for (const d of [14.5, 17]) spots.push([f.cx + 0.5 + Math.sin(a) * d, f.cz + 0.5 + Math.cos(a) * d, a + Math.PI / 2]); }
      for (const [x, z, yaw] of spots) {
        const y = this.groundDown(x, z, f.base + 9);
        if (y == null || this.waterDepth(x, y, z)) continue;
        const c = new Car(this, { n: carNation(g.cfg, side), s: side, x, y, z, yaw, h: i });
        const fy = this.fits(c, x, y, z, yaw);
        if (fy !== null) { c.pos.y = fy; this.list.push(c); break; }
      }
    });
  }
  // the first ground below y (any depth)
  groundDown(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    for (let yy = Math.floor(y); yy > 2; yy--) if (SOLID[w.get(bx, yy, bz)]) return SOLID[w.get(bx, yy + 1, bz)] || SOLID[w.get(bx, yy + 2, bz)] ? null : yy + 1;
    return null;
  }
  // a car built at a campfire appears beside the fire
  spawnAt(at) {
    const g = this.game;
    if (!this.canAdd()) return false;
    for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, d = 3.2 + (k % 2) * 1.2, x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
      const y = this.ground(x, z, at.y + 1.5);
      if (y == null || Math.abs(y - at.y) > 1.5) continue;
      const c = new Car(this, { n: carNation(g.cfg, g.cfg.side), s: g.cfg.side, x, y, z, yaw: a + Math.PI / 2, m: true });
      if (this.fits(c, x, y, z, c.yaw) === null) continue;
      this.list.push(c); return c;
    }
    return false;
  }

  // ---- terrain -------------------------------------------------------------------
  ground(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 2 || bz < 2 || bx >= w.W - 2 || bz >= w.D - 2) return null;
    for (let yy = Math.floor(y) + 1; yy >= Math.floor(y) - 3; yy--) {
      if (SOLID[w.get(bx, yy, bz)] && !SOLID[w.get(bx, yy + 1, bz)] && !SOLID[w.get(bx, yy + 2, bz)]) return yy + 1;
    }
    return null;
  }
  waterDepth(x, y, z) {
    const w = this.game.world; let n = 0;
    for (let yy = Math.floor(y); yy < Math.floor(y) + 3; yy++) if (w.get(Math.floor(x), yy, Math.floor(z)) === B.WATER) n++;
    return n;
  }
  // driving here means going into deep water: two or more blocks of water just below or around the wheels' level
  deepAt(x, y, z) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z); let n = 0;
    for (let yy = Math.floor(y + 0.5); yy >= Math.floor(y) - 3; yy--) { const b = w.get(bx, yy, bz); if (b === B.WATER) n++; else if (SOLID[b]) break; }
    return n >= 2;
  }
  inHQ(x, y, z) { const F = this.game.forts; return !!F && F.list.some((f) => F.inside(f, { x, y, z }, 1.6)); }
  // can the car stand here? Returns its ground height, or null. Each corner
  // finds its own ground: one block up at most; at least three wheels must
  // have ground under them (a bridge of planks has to be two blocks wide)
  fits(car, x, z0, z, yaw, fromY = z0) {
    const S = car.S, hw = S.W / 2 - 0.1, hl = S.L / 2 - 0.15, c = Math.cos(yaw), s = Math.sin(yaw), w = this.game.world;
    const gc = this.ground(x, z, fromY + 1.2);
    if (gc == null || gc - fromY > 1.05) return null;
    let top = gc, wheels = 0;
    for (const [lx, lz] of [[-hw, -hl], [hw, -hl], [-hw, hl], [hw, hl]]) {
      const px = x + lx * c + lz * s, pz = z - lx * s + lz * c;
      const gy = this.ground(px, pz, fromY + 1.2);
      if (gy != null && gy - fromY > 1.05) return null;                       // a wall at this corner
      if (gy != null && gy > gc - 1.6) { wheels++; top = Math.max(top, gy); }
      // the body: nothing solid at its height
      for (const dy of [0.3, 1.1]) if (SOLID[w.get(Math.floor(px), Math.floor(Math.max(gc, gy ?? gc) + dy), Math.floor(pz))]) return null;
    }
    if (wheels < 3) return null;
    if (this.inHQ(x, top, z)) return null;
    return top;
  }

  // ---- aim and use ---------------------------------------------------------------
  aimTarget(eye, dir, blockD) {
    const h = this.raycast(eye, dir, Math.min(blockD, 4), true);
    if (!h) return null;
    const car = h.car, g = this.game;
    if (car.side !== g.cfg.side) return { a: 'car', label: t('car.enemy'), run: () => { g.hud.toast(t('car.notYours'), 'warn'); sfx.error(); } };
    return { a: 'drive', label: t('car.drive', { name: t('car.kind.' + car.kind) }), run: () => this.enter(car) };
  }
  raycast(origin, dir, maxD, all = false) {
    let best = null, bd = maxD;
    this.ray.set(origin, dir);
    for (const c of this.list) {
      if (!c.alive || c === this.game.player.car) continue;
      if (!all && c.side === this.game.cfg.side) continue;                   // you don't shoot your own cars
      if (Math.abs(c.pos.x - origin.x) > maxD + 3 || Math.abs(c.pos.z - origin.z) > maxD + 3) continue;
      // test in the car's own frame (an oriented box)
      const S = c.S; this.m4.makeRotationY(c.yaw).setPosition(c.pos); const inv = this.m4.clone().invert();
      const r = this.ray.clone().applyMatrix4(inv);
      this.box3.min.set(-S.W / 2, 0.1, -S.L / 2); this.box3.max.set(S.W / 2, S.r + 1.0, S.L / 2);
      if (r.intersectBox(this.box3, this.hitP)) { const d = this.hitP.applyMatrix4(this.m4).distanceTo(origin); if (d < bd) { bd = d; best = { car: c, dist: d, point: this.hitP.clone() }; } }
    }
    return best;
  }

  // ---- getting in and out ---------------------------------------------------------
  enter(car) {
    const g = this.game, p = g.player;
    if (!car.alive || p.car || car.side !== g.cfg.side) return;
    if (g.craft) { g.hud.toast(t('car.busyCraft'), 'warn'); return; }
    g.scopeView.close();
    this.enteredAt = performance.now();
    p.car = car; p.crouch = false; p.vel.set(0, 0, 0); car.mine = true; car.home = null;
    this.lookOff = p.yaw - car.yaw;
    // up to three followers climb in
    const E = g.enemies, fol = E.followers().filter((s) => !s.raft && !s.chute && !s.swimming && !s.car && s.pos.distanceTo(car.pos) < 16)
      .sort((a, b) => a.pos.distanceTo(car.pos) - b.pos.distanceTo(car.pos)).slice(0, 3);
    car.riders = fol;
    fol.forEach((s, i) => { s.car = car; s.carSeat = i + 1; s.target = null; });
    document.body.classList.add('driving'); this.bar.hidden = false; this.labels(); this.hint(true);
    if (!this.engine) this.engine = engineLoop();
    sfx.thump();
    g.hud.toast(t(fol.length > 1 ? 'car.inWith' : fol.length ? 'car.inWith1' : 'car.in', { n: fol.length }));
  }
  exit(quiet = false) {
    const g = this.game, p = g.player, car = p.car;
    if (!car) return;
    if (!quiet && performance.now() - (this.enteredAt || 0) < 400) return;     // a double tap or click must not drop you straight out
    p.car = null; car.speed = 0;
    if (car.lights) this.toggleLights(car, true);
    if (this.engine) { this.engine.stop(); this.engine = null; }
    document.body.classList.remove('driving'); this.bar.hidden = true; this.hint(false);
    // you step out on the driver's side (or wherever there is room)
    p.pos.copy(this.outSpot(car, 0) || car.pos.clone().setY(car.pos.y + 1.3)); p.vel.set(0, 0, 0);
    for (const s of car.riders || []) this.unseat(s, car);
    car.riders = [];
    // the rest of the squad catches up: anyone left far behind turns up just behind you, out of sight
    const E = g.enemies, back = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
    let k = 0;
    for (const s of E.followers()) {
      if (s.car || s.pos.distanceTo(p.pos) < 35) continue;
      for (let tries = 0; tries < 6; tries++) {
        const side = ((k % 5) - 2) * 1.6, d = 7 + (k % 3) * 2 + tries;
        const x = p.pos.x + back.x * d + back.z * side, z = p.pos.z + back.z * d - back.x * side, y = this.ground(x, z, p.pos.y + 2);
        if (y != null && Math.abs(y - p.pos.y) < 3 && this.waterDepth(x, y, z) === 0) { s.pos.set(x, y, z); s.rejoin = false; break; }
      }
      k++;
    }
    if (!quiet) sfx.thump();
  }
  // a free spot beside the car (seat index decides the side)
  outSpot(car, seat) {
    const g = this.game, p = g.player, S = car.S, sides = SEATS[seat][0] < 0 ? [-1, 1] : [1, -1];
    for (const sd of sides) for (const along of [SEATS[seat][1], -1.2, 1.4]) {
      const v = car.local(sd * (S.W / 2 + 0.6), along, new THREE.Vector3());
      const y = this.ground(v.x, v.z, car.pos.y + 1.5);
      if (y == null || Math.abs(y - car.pos.y) > 2) continue;
      if (!p.collides(g.world, [], v.x, y, v.z, 1.9)) return v.setY(y);
    }
    return null;
  }
  unseat(s, car) {
    const v = this.outSpot(car, Math.max(1, Math.min(3, s.carSeat || 1))) || car.pos.clone();
    s.car = null; s.carSeat = null;
    s.pos.copy(v); s.rejoin = false;
  }
  // the key hint under the crosshair (computers): the car's keys while driving
  hint(on) {
    const H = this.game.hud; if (!H || !H.keyhint || this.game.app.input.touch) return;
    H.keyhint.textContent = t(on ? 'help.carKeys' : 'help.keys'); H.keyhint.classList.remove('fade');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => H.keyhint.classList.add('fade'), 8000);
  }
  toggleLights(car = this.game.player.car, quiet = false) {
    if (!car) return;
    car.lights = !car.lights;
    if (!quiet) { sfx.toggle(); this.game.hud.toast(t(car.lights ? 'car.lightsOnMsg' : 'car.lightsOffMsg')); }
    this.labels();
  }
  // a passenger keeps his seat (called by soldiers.js instead of his own moving)
  seat(s) {
    const car = s.car;
    if (!car || !car.alive || !(car.riders || []).includes(s)) { if (car) this.unseat(s, car); return; }
    const [x, z] = SEATS[s.carSeat || 1];
    car.local(x, z, s.pos); s.pos.y = car.pos.y + SEAT_Y;
    s.yaw = car.yaw; s.speed = 0; s.crouch = false; s.swimming = false;
  }

  // ---- driving (called instead of the player's own movement) -------------------
  drive(dt, it) {
    const g = this.game, p = g.player, car = p.car;
    if (!car || !car.alive) { this.exit(true); return; }
    const wet = this.waterDepth(car.pos.x, car.pos.y + 0.1, car.pos.z);
    const top = TOP * (wet >= 1 ? 0.3 : 1);
    // throttle, brake and reverse; steering turns harder at low speed and reverses backwards
    if (it.fwd > 0.05) car.speed += (car.speed < 0 ? BRAKE : ACCEL) * it.fwd * dt;
    else if (it.fwd < -0.05) car.speed += (car.speed > 0 ? -BRAKE : -ACCEL * 0.7) * -it.fwd * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), DRAG * dt * (wet ? 3 : 1));
    car.speed = Math.max(-BACK, Math.min(top, car.speed));
    const turn = -it.strafe * STEER * Math.min(1, Math.abs(car.speed) / 3.5) * Math.sign(car.speed || 1) * dt;
    const oldYaw = car.yaw;
    car.yaw += turn;
    const st = car.speed * dt, nx = car.pos.x - Math.sin(car.yaw) * st, nz = car.pos.z - Math.cos(car.yaw) * st;
    // over the edge into deep water (off a bank or a bridge): the car goes in
    if (Math.abs(st) > 1e-4) {
      const nose = car.local(0, (car.speed > 0 ? -1 : 1) * (car.S.L / 2 - 0.4), this.tmp);
      if (this.deepAt(nx, car.pos.y, nz) || this.deepAt(nose.x - Math.sin(car.yaw) * st, car.pos.y, nose.z - Math.cos(car.yaw) * st)) { car.pos.x = nx; car.pos.z = nz; this.sink(car); return; }
    }
    let gy = Math.abs(st) > 1e-4 || turn ? this.fits(car, nx, car.pos.y, nz, car.yaw) : car.pos.y;
    if (gy != null) { car.pos.x = nx; car.pos.z = nz; }
    else {
      // slide along walls; a hard knock stops the car
      const mx = Math.abs(nx - car.pos.x) > 0.002, mz = Math.abs(nz - car.pos.z) > 0.002;
      const ax = mx ? this.fits(car, nx, car.pos.y, car.pos.z, car.yaw) : null, az = ax == null && mz ? this.fits(car, car.pos.x, car.pos.y, nz, car.yaw) : null;
      if (ax != null || az != null) car.speed *= 1 - Math.min(1, dt * 3);           // scraping along slows you
      if (ax != null) { car.pos.x = nx; gy = ax; } else if (az != null) { car.pos.z = nz; gy = az; }
      else {
        if (this.fits(car, car.pos.x, car.pos.y, car.pos.z, car.yaw) == null) car.yaw = oldYaw;
        if (Math.abs(car.speed) > 5) { sfx.thump(); g.shake = Math.max(g.shake || 0, 0.25); }
        car.speed *= -0.15; gy = car.pos.y;
        if (this.inHQ(nx, car.pos.y, nz) && this.blockT <= 0) { this.blockT = 3; g.hud.toast(t('car.noHQ'), 'warn'); }
      }
    }
    car.pos.y += (gy - car.pos.y) * Math.min(1, dt * (gy > car.pos.y ? 12 : 8));
    // water two blocks deep: the car is lost and so are you
    if (this.waterDepth(car.pos.x, car.pos.y + 0.1, car.pos.z) >= 2) { this.sink(car); return; }
    // the camera turns with the car; you keep looking where you were looking
    p.yaw += car.yaw - oldYaw;
    car.local(SEATS[0][0], SEATS[0][1], p.pos); p.pos.y = car.pos.y + SEAT_Y + EYE_SEATED - p.eyeOffset;
    p.vel.set(0, 0, 0); p.onGround = true; p.running = false; p.crouch = false; p.swimming = false; p.inWater = false;
    // a warning near deep water
    this.warnT -= dt; this.blockT -= dt;
    if (this.warnT <= 0 && Math.abs(car.speed) > 1) {
      const dir = Math.sign(car.speed);
      for (const d of [2, 4, 7, 10]) {
        const x = car.pos.x - Math.sin(car.yaw) * d * dir, z = car.pos.z - Math.cos(car.yaw) * d * dir, y = this.ground(x, z, car.pos.y + 1);
        if (this.deepAt(x, car.pos.y, z) || (y != null && this.waterDepth(x, y, z) >= 2)) { this.warnT = 3; g.hud.alert(t('car.deepAhead')); sfx.warn(); break; }
      }
    }
    // the engine is loud
    this.noiseT -= dt;
    if (this.noiseT <= 0) { this.noiseT = 0.8; g.enemies.hear(car.pos, 35 + Math.abs(car.speed) * 3, 'enemy'); g.animals.noise(car.pos, 40); }
    if (this.engine) this.engine.set(Math.min(1, Math.abs(car.speed) / TOP));
  }
  sink(car) {
    const g = this.game;
    car.alive = false; car.hp = 0; car.sunk = true; car.wreckLook();
    this.exit(true);
    g.particles.burst(car.pos.x, car.pos.y + 1, car.pos.z, [0.6, 0.7, 0.75], 30, 6, 1.2);
    sfx.splash();
    g.hud.toast(t('car.sank'), 'warn');
    g.damage(1000, 'drown');
  }

  // ---- damage --------------------------------------------------------------------------
  hurt(car, dmg) {
    if (!car.alive) return;
    car.hp -= dmg;
    const g = this.game;
    g.particles.burst(car.pos.x, car.pos.y + car.S.r + 0.6, car.pos.z, [0.3, 0.28, 0.25], 3, 2, 0.4, 10);
    if (car === g.player.car && car.hp < car.S.hp * 0.3 && !car.warned) { car.warned = true; g.hud.toast(t('car.badlyHit'), 'warn'); }
    if (car.hp > 0) return;
    car.alive = false; car.wreckT = 0; car.wreckLook();
    g.particles.burst(car.pos.x, car.pos.y + 1, car.pos.z, [0.9, 0.5, 0.2], 26, 7, 1.4);
    sfx.explosion(0.6, false);
    // everyone inside is thrown out
    if (car === g.player.car) { this.exit(true); g.player.vel.y += 4; g.hud.toast(t('car.wrecked'), 'warn'); g.damage(18, 'combat'); }
    for (const s of car.riders || []) { this.unseat(s, car); g.enemies.hurt(s, 20, { silent: true }); }
    car.riders = [];
  }
  // shots at the player in a car: most of it hits the car
  absorb(n) { const car = this.game.player.car; if (!car || !car.alive) return n; this.hurt(car, n * 0.8); return n * 0.3; }
  blast(center, reach, falloff) {
    for (const c of this.list) { if (!c.alive) continue; const d = c.pos.distanceTo(center); if (d < reach) this.hurt(c, falloff(d) * 1.4); }
  }

  // ---- per frame ----------------------------------------------------------------------
  update(dt) {
    const g = this.game, P = g.player.pos, mine = g.player.car;
    for (const c of this.list) {
      if (c.home != null && !c.mine && g.forts.list[c.home]) { const s = this.sideOf(g.forts.list[c.home].owner); if (s) c.side = s; }
      if (!c.alive) { c.wreckT += dt; if (!c.sunk && c.wreckT < 40 && Math.random() < dt * 4 && c.pos.distanceTo(P) < 120) g.particles.burst(c.pos.x, c.pos.y + 1.2, c.pos.z, [0.16, 0.15, 0.14], 1, 1.4, 2.5, 30); continue; }
      if (c !== mine) {
        c.speed *= Math.max(0, 1 - dt * 3);
        // parked: settle on the ground (someone may have dug under it)
        c.settleT = (c.settleT || 0) - dt;
        if (c.settleT <= 0) { c.settleT = 1; const y = this.ground(c.pos.x, c.pos.z, c.pos.y + 0.5); if (y != null && y < c.pos.y - 0.2) c.pos.y = y; }
        if (c.riders && c.riders.length) { for (const s of c.riders) this.unseat(s, c); c.riders = []; }
      }
      if (c.riders) c.riders = c.riders.filter((s) => s.alive && s.car === c);
    }
    // wrecks are towed away after a while
    this.list = this.list.filter((c) => { if (!c.alive && c.wreckT > 90 && c !== mine) { this.drop(c); return false; } return true; });
    // you can't walk through a parked car
    if (!mine && !g.dead) this.pushPlayer();
    // only the nearest cars have a model
    const order = this.list.map((c) => [c, Math.hypot(c.pos.x - P.x, c.pos.z - P.z)]).sort((a, b) => a[1] - b[1]);
    order.forEach(([c, d], k) => {
      if (k < MAX_MODELS && d < MODEL_M) { if (!c.mesh) g.scene.add(build(c)); this.pose(c, dt); } else this.drop(c);
    });
    // headlights: the lamps glow and the beam lights the road
    const lit = mine && mine.lights;
    this.beam.intensity = lit ? 2.6 : 0;
    if (mine) {
      mine.lampMat.color.setHex(lit ? 0xfff2c8 : 0x3a3a30);
      const f = mine.local(0, -mine.S.L / 2, this.tmp); this.beam.position.set(f.x, mine.pos.y + 0.95, f.z);
      const a = mine.local(0, -mine.S.L / 2 - 12, this.tmp2); this.beam.target.position.set(a.x, mine.pos.y - 0.5, a.z);
    }
    if (g.app.input.touch !== this.wasTouch) { this.wasTouch = g.app.input.touch; this.labels(); }
  }
  pose(c, dt) {
    const m = c.mesh; m.position.copy(c.pos);
    const sp = c.alive ? c.speed : 0;
    c.spin += sp * dt / c.S.r;
    for (const w of c.wheels) w.rotation.x = -c.spin;
    // a little body roll and pitch on the move
    c.roll += ((c === this.game.player.car ? Math.sin(performance.now() / 90) * Math.min(1, Math.abs(sp) / 8) * 0.012 : 0) - c.roll) * Math.min(1, dt * 8);
    m.rotation.set(0, c.yaw, 0); c.body.rotation.set(c.roll * 0.6, 0, c.roll);
    if (!c.alive) { m.rotation.z = 0.06; if (c.sunk) m.position.y = c.pos.y - 1.2; }
  }
  pushPlayer() {
    const g = this.game, p = g.player;
    for (const c of this.list) {
      if (Math.abs(c.pos.x - p.pos.x) > 4 || Math.abs(c.pos.z - p.pos.z) > 4 || p.pos.y > c.pos.y + 1.4 || p.pos.y < c.pos.y - 1.5) continue;
      const S = c.S, cs = Math.cos(c.yaw), sn = Math.sin(c.yaw), dx = p.pos.x - c.pos.x, dz = p.pos.z - c.pos.z;
      const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs, hw = S.W / 2 + 0.34, hl = S.L / 2 + 0.34;
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hl) continue;
      const ox = hw - Math.abs(lx), oz = hl - Math.abs(lz);
      const nlx = ox < oz ? Math.sign(lx || 1) * hw : lx, nlz = ox < oz ? lz : Math.sign(lz || 1) * hl;
      const x = c.pos.x + nlx * cs + nlz * sn, z = c.pos.z - nlx * sn + nlz * cs;
      if (!p.collides(g.world, g.obstacles(), x, p.pos.y, z)) { p.pos.x = x; p.pos.z = z; }
    }
  }
  drop(c) { if (c.mesh) { this.game.scene.remove(c.mesh); c.mesh = null; } }
  toSave() {
    return this.list.filter((c) => c.alive).map((c) => ({ n: c.nat, s: c.side, x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), yaw: +c.yaw.toFixed(3), hp: Math.round(c.hp), m: c.mine ? 1 : 0, h: c.home }));
  }
  dispose() {
    if (this.game.player.car) this.exit(true);
    for (const c of this.list) this.drop(c);
    this.game.scene.remove(this.beam, this.beam.target);
    this.bar.remove();
    document.body.classList.remove('driving');
  }
}
