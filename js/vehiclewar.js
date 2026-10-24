// War: Tank battles and Dogfights (chosen after your side, instead of the
// infantry war). Never saved, like a battle; waves of enemies come in and
// you win when the last wave is beaten.
//   Tank battle: you command a light tank (the same tank that hunts you in
//   the infantry war): W/S drive, A/D turn the hull, the mouse turns the
//   turret and raises the gun, click fires the main gun (it reloads), right
//   click (held) the machine gun; V switches between the view behind the
//   turret and the gunner's sight. Friendly tanks fight beside you.
//   Dogfight: you fly a fighter in the cockpit: the mouse steers the nose,
//   W/S open and close the throttle, A/D roll into a turn, click (held)
//   fires the guns. Wingmen fly with you. Stay above the ground and inside
//   the map. Enemy fighters come in waves.
// Only what is near is drawn and steered in detail; shells, planes and
// bullets are plain math (no physics engine), so phones stay smooth.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx, engineLoop } from './audio.js';
import { tankModel } from './soldiers.js';

const WAVES = { beginner: 3, easy: 3, medium: 4, hard: 5, impossible: 6 };
const AIM = { beginner: 0.05, easy: 0.04, medium: 0.03, hard: 0.022, impossible: 0.016 };   // AI gun spread
const RELOAD = 3.2, SHELL_V = 70, G = 9;
const PLANE_MIN = 34, PLANE_MAX = 78, PLANE_HP = 100;
const HULL = { allies: 0x4a5534, axis: 0x4a5058 };

export class VehicleWar {
  constructor(game) {
    this.game = game;
    this.mode = game.cfg.gameType === 'air' ? 'air' : 'tank';
    this.diff = game.cfg.difficulty || 'medium';
    this.maxWaves = WAVES[this.diff] || 4;
    this.wave = 0; this.waveT = 4; this.kills = 0; this.done = false; this.started = false;
    this.tanks = []; this.planes = []; this.shells = []; this.view = 'third';
    this.tracers = [];
    const lm = new THREE.LineBasicMaterial({ color: 0xffd860, transparent: true, opacity: 0.9 });
    for (let i = 0; i < 40; i++) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), lm); l.frustumCulled = false; l.visible = false; game.scene.add(l); this.tracers.push({ l, t: 0 }); }
    this.trI = 0;
    this.hud = document.createElement('div'); this.hud.id = 'vwar'; this.hud.className = 'vwar ' + this.mode;
    document.getElementById('hud').appendChild(this.hud);
    this.hudHtml = '';
    document.body.classList.add('vwar-on');
  }
  get active() { return this.started && !!this.me && !this.over; }
  side(f) { const s = this.game.cfg.side; return f === 'ally' ? s : (s === 'allies' ? 'axis' : 'allies'); }

  // ---- the ground ----
  groundAt(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 2 || bz < 2 || bx >= w.W - 2 || bz >= w.D - 2) return null;
    for (let yy = Math.floor(y) + 1; yy >= Math.floor(y) - 4; yy--) {
      const b = w.get(bx, yy, bz);
      if (b === B.WATER) return null;
      if (SOLID[b] && !SOLID[w.get(bx, yy + 1, bz)] && !SOLID[w.get(bx, yy + 2, bz)]) return yy + 1;
    }
    return null;
  }
  surface(x, z) { const w = this.game.world; return w.surfaceY(Math.max(0, Math.min(w.W - 1, Math.floor(x))), Math.max(0, Math.min(w.D - 1, Math.floor(z)))) + 1; }
  // a dry spot for a tank near (x, z)
  spot(x, z) {
    const w = this.game.world, FORT = new Set([B.FORT_WALL, B.FORT_DOOR, B.FORT_LAMP, B.SUPPLY, B.MEDICAL, B.ARMORY, B.MAPTABLE]);
    for (let k = 0; k < 160; k++) {
      const a = Math.random() * 6.28, r = k * 0.7;
      const px = Math.max(10, Math.min(w.W - 10, x + Math.cos(a) * r)), pz = Math.max(10, Math.min(w.D - 10, z + Math.sin(a) * r));
      const y = this.surface(px, pz), top = w.get(Math.floor(px), y - 1, Math.floor(pz));
      if (top === B.WATER || FORT.has(top) || w.isLocked(Math.floor(px), y - 1, Math.floor(pz)) || !SOLID[top]) continue;
      // open, fairly flat ground all round (room to drive off)
      let ok = this.groundAt(px, pz, y) === y;
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const gy = this.groundAt(px + dx, pz + dz, y); if (gy == null || Math.abs(gy - y) > 1) ok = false; }
      if (ok) return { x: px, y, z: pz };
    }
    return { x, y: this.surface(x, z), z };
  }
  // ---- start ----
  start() {
    const g = this.game, p = g.player, w = g.world;
    this.started = true;
    const cx = w.W / 2, cz = w.D / 2;
    if (this.mode === 'tank') {
      const s = this.spot(p.pos.x, p.pos.z);
      this.me = this.addTank('ally', s.x, s.z, true);
      this.me.yaw = Math.atan2(-(cx - s.x), -(cz - s.z)); p.yaw = this.me.yaw; p.pitch = 0;
      for (let k = 0; k < 2; k++) { const a = this.me.yaw + Math.PI / 2 * (k ? 1 : -1); const q = this.spot(s.x + Math.cos(a) * 9, s.z - Math.sin(a) * 9); this.addTank('ally', q.x, q.z).yaw = this.me.yaw; }
    } else {
      // over your side's half of the map, flying in toward the middle
      const a = Math.atan2(p.pos.z - cz, p.pos.x - cx), sx = cx + Math.cos(a) * w.W * 0.3, sz = cz + Math.sin(a) * w.D * 0.3;
      this.me = this.addPlane('ally', sx, this.surface(sx, sz) + 70, sz, true);
      this.me.yaw = Math.atan2(-(cx - sx), -(cz - sz));
      p.yaw = this.me.yaw; p.pitch = 0;
      for (let k = 0; k < 2; k++) { const wm = this.addPlane('ally', this.me.pos.x + (k ? 14 : -14), this.me.pos.y - 4, this.me.pos.z + 10); wm.yaw = this.me.yaw; }
      this.cockpit();
    }
    this.engine = engineLoop();
    g.vm.hidden = true;
    g.time = Math.floor(g.time) + 0.36;             // a fight by daylight
    g.hud.bigMessage(t(this.mode === 'tank' ? 'vw.tankTitle' : 'vw.airTitle'), t(g.app.input.touch ? (this.mode === 'tank' ? 'vw.tankSubTouch' : 'vw.airSubTouch') : (this.mode === 'tank' ? 'vw.tankSub' : 'vw.airSub'), { n: this.maxWaves }));
  }
  nextWave() {
    const g = this.game, w = g.world, P = this.me.pos;
    this.wave++;
    const n = 1 + this.wave + (this.diff === 'hard' || this.diff === 'impossible' ? 1 : 0);
    const cx = w.W / 2, cz = w.D / 2;
    // from the far side of the map
    const a = Math.atan2(cz - P.z, cx - P.x) + (Math.random() - 0.5) * 0.9;
    const R = this.mode === 'tank' ? 95 : 150;
    for (let k = 0; k < n; k++) {
      const x = Math.max(16, Math.min(w.W - 16, P.x + Math.cos(a + (k - n / 2) * 0.18) * R)), z = Math.max(16, Math.min(w.D - 16, P.z + Math.sin(a + (k - n / 2) * 0.18) * R));
      if (this.mode === 'tank') { const s = this.spot(x, z); this.addTank('enemy', s.x, s.z); }
      else this.addPlane('enemy', x, this.surface(x, z) + 55 + Math.random() * 40, z);
    }
    // a friend joins every other wave
    if (this.wave % 2 === 0) {
      if (this.mode === 'tank') { const s = this.spot(P.x - 10, P.z + 10); this.addTank('ally', s.x, s.z); }
      else this.addPlane('ally', P.x + 20, P.y, P.z + 20);
    }
    g.hud.bigMessage(t('vw.wave', { n: this.wave, of: this.maxWaves }), t(this.mode === 'tank' ? 'vw.waveTanks' : 'vw.wavePlanes', { n }));
    sfx.siren ? sfx.siren() : sfx.alert();
  }

  // ---- tanks ----
  addTank(faction, x, z, player = false) {
    const g = this.game, m = tankModel(faction, HULL[this.side(faction)]);
    g.scene.add(m.group);
    const T = { kind: 'tank', faction, player, mesh: m.group, turretObj: m.turret, gunObj: m.gun, pos: new THREE.Vector3(x, this.surface(x, z), z), yaw: 0, turret: 0, elev: 0, hp: player ? 520 : 300, maxHp: player ? 520 : 300, alive: true, cool: 2 + Math.random() * 3, mgCool: 0, deadT: 0, wp: null, speed: 0 };
    if (player) m.group.visible = this.view !== 'sight';
    this.tanks.push(T);
    return T;
  }
  tankBox(T) { return { minX: T.pos.x - 1.6, maxX: T.pos.x + 1.6, minZ: T.pos.z - 1.6, maxZ: T.pos.z + 1.6, minY: T.pos.y, maxY: T.pos.y + 2.2 }; }
  moveTank(T, fwd, dt) {
    const sp = fwd * dt, nx = T.pos.x - Math.sin(T.yaw) * sp, nz = T.pos.z - Math.cos(T.yaw) * sp;
    const gy = this.groundAt(nx, nz, T.pos.y);
    if (gy == null || Math.abs(gy - T.pos.y) > 1.05) return false;
    // never through another tank
    for (const o of this.tanks) if (o !== T && o.alive !== undefined && Math.hypot(o.pos.x - nx, o.pos.z - nz) < 3.6 && Math.hypot(o.pos.x - nx, o.pos.z - nz) < Math.hypot(o.pos.x - T.pos.x, o.pos.z - T.pos.z)) return false;
    T.pos.x = nx; T.pos.z = nz; T.pos.y += (gy - T.pos.y) * Math.min(1, dt * 6);
    return true;
  }
  muzzle(T) {
    const a = T.yaw + T.turret, ce = Math.cos(T.elev);
    const dir = new THREE.Vector3(-Math.sin(a) * ce, Math.sin(T.elev), -Math.cos(a) * ce);
    return { pos: new THREE.Vector3(T.pos.x, T.pos.y + 1.85, T.pos.z).addScaledVector(dir, 3.3), dir };
  }
  fire(T) {
    const g = this.game, M = this.muzzle(T);
    if (!T.player) M.dir.x += (Math.random() - 0.5) * AIM[this.diff] * 2, M.dir.y += (Math.random() - 0.5) * AIM[this.diff], M.dir.z += (Math.random() - 0.5) * AIM[this.diff] * 2;
    this.shells.push({ pos: M.pos.clone(), vel: M.dir.normalize().multiplyScalar(SHELL_V), owner: T, faction: T.faction, t: 0 });
    T.cool = T.player ? RELOAD : 4.5 + Math.random() * 3;
    sfx.cannon(Math.max(0.15, 1 - g.camera.position.distanceTo(M.pos) / 160));
    g.particles.burst(M.pos.x, M.pos.y, M.pos.z, [0.85, 0.82, 0.75], 12, 3, 1.2, -1);
    if (T.player) g.shake = Math.max(g.shake, 0.35);
  }
  hurtTank(T, dmg) {
    if (!T.alive) return;
    const g = this.game;
    T.hp -= dmg;
    g.particles.burst(T.pos.x, T.pos.y + 1.6, T.pos.z, [0.4, 0.38, 0.34], 8, 3, 0.6);
    if (T.hp > 0) return;
    T.alive = false; T.deadT = 0;
    T.mesh.traverse((o) => { if (o.material && o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(0x1c1c1c); } });
    g.explosives.explode(T.pos.x, T.pos.y + 1, T.pos.z, { radius: 2.5, power: 40, destroy: false, owner: 'tank' });
    if (T.faction === 'enemy') { this.kills++; g.stats.enemies = (g.stats.enemies || 0) + 1; g.hud.toast(t('vw.tankKill'), 'pick'); }
    if (T.player) this.lose();
  }
  // where the shell lands: a blast (craters the ground a little, hurts men)
  blast(S, at) {
    const g = this.game;
    for (const T of this.tanks) {
      if (!T.alive || T.player) continue;           // (your own tank is hurt through the game's damage: see absorb)
      const d = Math.hypot(T.pos.x - at.x, T.pos.y + 1 - at.y, T.pos.z - at.z);
      if (d < 3.4) this.hurtTank(T, (d < 2 ? 130 : 70) * (S.faction === T.faction ? 0.2 : 1));
    }
    g.explosives.explode(at.x, at.y, at.z, { radius: 2.2, power: 60, destroy: true, destroyRadius: 1.4, owner: S.faction === 'ally' ? 'player' : 'tank' });
  }
  updateShells(dt) {
    const g = this.game, w = g.world;
    for (const S of this.shells) {
      S.t += dt; S.vel.y -= G * dt;
      const step = S.vel.length() * dt, d = S.vel.clone().normalize();
      const hit = w.raycast(S.pos.x, S.pos.y, S.pos.z, d.x, d.y, d.z, step, false, 'bullet');
      // a tank in the way
      let tk = null, td = hit ? hit.dist : step;
      const ray = new THREE.Ray(S.pos, d), box = new THREE.Box3(), pt = new THREE.Vector3();
      for (const T of this.tanks) {
        if (!T.alive || T === S.owner) continue;
        const b = this.tankBox(T); box.min.set(b.minX, b.minY, b.minZ); box.max.set(b.maxX, b.maxY, b.maxZ);
        if (ray.intersectBox(box, pt)) { const dd = pt.distanceTo(S.pos); if (dd <= td) { td = dd; tk = T; } }
      }
      if (tk) {
        S.dead = true;
        const at = S.pos.clone().addScaledVector(d, td);
        if (tk.player) this.game.damage(70, 'blast', at); else this.hurtTank(tk, S.faction === tk.faction ? 20 : 150);
        this.blast(S, at);
      } else if (hit) { S.dead = true; this.blast(S, S.pos.clone().addScaledVector(d, hit.dist)); }
      else S.pos.addScaledVector(d, step);
      if (S.t > 6) S.dead = true;
      // a bright streak behind it
      if (!S.dead) this.tracer(S.pos.clone().addScaledVector(d, -Math.min(6, step * 2)), S.pos.clone(), 0.05);
    }
    this.shells = this.shells.filter((s) => !s.dead);
  }
  tankAi(T, dt) {
    let best = null, bd = 1e9;
    for (const o of this.tanks) if (o.alive && o.faction !== T.faction) { const d = o.pos.distanceTo(T.pos); if (d < bd) { bd = d; best = o; } }
    if (!best) { T.speed = 0; return; }
    const to = Math.atan2(-(best.pos.x - T.pos.x), -(best.pos.z - T.pos.z));
    // close in to about 40 m, then hold and fight (and keep moving a little)
    T.reT = (T.reT || 0) - dt;
    // can it see its target? (a hill or a house in the way: drive closer)
    T.losT = (T.losT || 0) - dt;
    if (T.losT <= 0) {
      T.losT = 0.6;
      const M = this.muzzle(T);
      T.blocked = !!this.game.world.raycast(M.pos.x, M.pos.y, M.pos.z, best.pos.x - M.pos.x, best.pos.y + 1.2 - M.pos.y, best.pos.z - M.pos.z, bd * 0.92, false, 'bullet');
      // the way to go: toward the target, or the nearest heading round water, walls and steep ground
      T.head = this.wayAround(T, to);
    }
    const range = T.blocked ? 10 : 45;
    if (bd > range) { T.yaw = turn(T.yaw, T.head ?? to, dt * 0.9); if (!this.moveTank(T, 4.2, dt)) T.losT = 0; }
    else if (T.reT > 0) this.moveTank(T, -2, dt);
    else if (Math.random() < dt * 0.15) T.reT = 1.5;
    // the turret tracks; fire when on target with a clear line
    const want = to - T.yaw;
    T.turret = turn(T.turret, want, dt * 1.3);
    const dy = best.pos.y - T.pos.y;
    T.elev = Math.max(-0.1, Math.min(0.3, Math.atan2(dy, bd) + bd * 0.0009));
    T.cool -= dt;
    if (T.cool <= 0 && Math.abs(angDiff(T.turret, want)) < 0.06 && bd < 110) { if (!T.blocked) this.fire(T); else T.cool = 0.8; }
  }
  // where a shell from this gun would come down (the ground, a wall or a tank), at most 2.5 s out
  impact(T) {
    const w = this.game.world, M = this.muzzle(T), pos = M.pos.clone(), vel = M.dir.multiplyScalar(SHELL_V), dt = 0.05;
    for (let i = 0; i < 50; i++) {
      vel.y -= G * dt;
      const step = vel.length() * dt, d = vel.clone().normalize();
      const hit = w.raycast(pos.x, pos.y, pos.z, d.x, d.y, d.z, step, false, 'bullet');
      if (hit) return pos.addScaledVector(d, hit.dist);
      for (const o of this.tanks) if (o !== T && o.alive && Math.abs(o.pos.x - pos.x) < 1.6 && Math.abs(o.pos.z - pos.z) < 1.6 && pos.y > o.pos.y && pos.y < o.pos.y + 2.2) return pos;
      pos.addScaledVector(d, step);
    }
    return pos;
  }
  // a heading near `want` with drivable ground for the next few metres
  clearAhead(T, h) {
    let y = T.pos.y;
    for (const d of [2, 4, 6]) { const gy = this.groundAt(T.pos.x - Math.sin(h) * d, T.pos.z - Math.cos(h) * d, y); if (gy == null || Math.abs(gy - y) > 1) return false; y = gy; }
    return true;
  }
  wayAround(T, want) {
    for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8]) { const h = want + k * 0.35 * (T.pref || 1); if (this.clearAhead(T, h)) return h; }
    T.pref = -(T.pref || 1);
    return want + Math.PI;
  }
  driveTank(dt, it, input) {
    const g = this.game, T = this.me, p = g.player;
    // hull: W/S, A/D; the turret follows the mouse
    const want = it.fwd * (it.fwd > 0 ? 7 : 3);
    T.speed += (want - T.speed) * Math.min(1, dt * 2);
    T.yaw -= it.strafe * dt * 0.9;
    if (Math.abs(T.speed) > 0.05 && !this.moveTank(T, T.speed, dt)) T.speed *= 0.3;
    T.turret = turn(T.turret, p.yaw - T.yaw, dt * 1.6);
    T.elev = Math.max(-0.12, Math.min(0.35, p.pitch));
    T.cool -= dt; T.mgCool -= dt;
    if ((input.mouse.leftPressed || input.thit('dig')) && T.cool <= 0) this.fire(T);
    else if ((input.mouse.leftPressed || input.thit('dig')) && T.cool > 0) sfx.dryFire && sfx.dryFire();
    // the machine gun (right mouse held; on phones the PLACE button)
    if ((input.mouse.right || input.tdown('place')) && T.mgCool <= 0) {
      T.mgCool = 0.11;
      const M = this.muzzle(T), dir = M.dir.clone(); dir.x += (Math.random() - 0.5) * 0.03; dir.y += (Math.random() - 0.5) * 0.02; dir.z += (Math.random() - 0.5) * 0.03; dir.normalize();
      const from = new THREE.Vector3(T.pos.x + 0.4, T.pos.y + 1.9, T.pos.z);
      const blk = g.world.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, 120, false, 'bullet');
      const hit = g.combat.target(from, dir, blk ? blk.dist : 120);
      if (hit && !hit.tank) g.combat.applyHit(hit, 18, {});
      this.tracer(from.clone().addScaledVector(dir, 2), from.clone().addScaledVector(dir, hit ? hit.dist || 40 : blk ? blk.dist : 60), 0.06);
      sfx.shot('rifle', 0.5);
    }
    if (input.hit('KeyV') || input.thit('zoom')) { this.view = this.view === 'third' ? 'sight' : 'third'; T.mesh.visible = this.view !== 'sight'; }
    p.pos.set(T.pos.x, T.pos.y + 1.6, T.pos.z); p.vel.set(0, 0, 0); p.onGround = true;
    if (this.engine) this.engine.set(Math.min(1, Math.abs(T.speed) / 7));
  }

  // ---- planes ----
  planeModel(faction) {
    const side = this.side(faction), g = new THREE.Group();
    const M = (c) => new THREE.MeshLambertMaterial({ color: c });
    const body = side === 'allies' ? 0x4a5a3a : 0x5e6458, wing = side === 'allies' ? 0x56664a : 0x6a7064, nose = side === 'allies' ? 0x2a2a2a : 0xd8c040;
    const add = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.position.set(x, y, z); g.add(m); return m; };
    add(1.2, 1.2, 8, body, 0, 0, 0); add(1.0, 1.0, 1, nose, 0, 0, -4.4);
    add(11, 0.2, 2.0, wing, 0, -0.2, -0.8); add(4, 0.15, 1.2, wing, 0, 0.1, 3.6); add(0.15, 1.6, 1.2, wing, 0, 0.9, 3.6);
    add(0.8, 0.5, 1.6, 0x9ab8c8, 0, 0.75, -0.6);
    const prop = add(3.2, 0.1, 0.25, 0x1a1a1a, 0, 0, -5.0);
    // markings: a white star on a blue disc (Allies), a plain black cross on white (Axis)
    for (const x of [-4.2, 4.2]) {
      if (side === 'allies') { add(1.3, 0.22, 1.3, 0x2a3a6a, x, -0.08, -0.8); add(0.8, 0.24, 0.8, 0xeeeeee, x, -0.07, -0.8); }
      else { add(1.2, 0.22, 1.2, 0xeeeeee, x, -0.08, -0.8); add(0.8, 0.24, 0.3, 0x111111, x, -0.07, -0.8); add(0.3, 0.24, 0.8, 0x111111, x, -0.07, -0.8); }
    }
    g.rotation.order = 'YXZ';
    return { g, prop };
  }
  addPlane(faction, x, y, z, player = false) {
    const g = this.game;
    const P = { kind: 'plane', faction, player, pos: new THREE.Vector3(x, y, z), yaw: 0, pitch: 0, roll: 0, speed: 52, hp: player ? 160 : PLANE_HP, maxHp: player ? 160 : PLANE_HP, alive: true, cool: 1, burst: 0, ammo: 1500, vy: 0, deadT: 0 };
    if (!player) { const m = this.planeModel(faction); P.mesh = m.g; P.prop = m.prop; g.scene.add(m.g); }
    this.planes.push(P);
    return P;
  }
  fwd(P) { const cp = Math.cos(P.pitch); return new THREE.Vector3(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp); }
  steer(P, wantYaw, wantPitch, rate, dt) {
    const dy = angDiff(P.yaw, wantYaw), dp = wantPitch - P.pitch;
    const ty = Math.max(-rate * dt, Math.min(rate * dt, dy)), tp = Math.max(-rate * dt, Math.min(rate * dt, dp));
    P.yaw += ty; P.pitch = Math.max(-1.2, Math.min(1.2, P.pitch + tp));
    P.roll += ((-ty / Math.max(1e-4, dt)) * 0.9 - P.roll) * Math.min(1, dt * 3);       // bank into the turn
    P.roll = Math.max(-1.3, Math.min(1.3, P.roll));
  }
  flyPlane(P, dt) {
    const f = this.fwd(P);
    P.pos.addScaledVector(f, P.speed * dt);
    const w = this.game.world;
    P.pos.y = Math.min(P.pos.y, 230);
    return f;
  }
  // a burst of the guns: hits are worked out along the line of fire
  guns(P, dt) {
    const g = this.game, f = this.fwd(P);
    P.ammo--;
    const dir = f.clone(); dir.x += (Math.random() - 0.5) * 0.012; dir.y += (Math.random() - 0.5) * 0.012; dir.z += (Math.random() - 0.5) * 0.012; dir.normalize();
    const side = (P.gunSide = -(P.gunSide || 1)) * 2.4;
    const right = new THREE.Vector3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const from = P.pos.clone().addScaledVector(right, side).addScaledVector(f, 3);
    let best = null, bd = 420;
    for (const o of this.planes) {
      if (!o.alive || o.faction === P.faction) continue;
      const v = o.pos.clone().sub(from), along = v.dot(dir);
      if (along < 0 || along > bd) continue;
      if (v.addScaledVector(dir, -along).length() < (o.player ? 2.6 : 3.4)) { bd = along; best = o; }
    }
    this.tracer(from.clone().addScaledVector(dir, Math.min(bd, 30) * 0.2), from.clone().addScaledVector(dir, Math.min(bd, 60)), 0.05);
    if (P.player || from.distanceTo(g.camera.position) < 120) sfx.shot('smg', P.player ? 0.45 : 0.25);
    if (best) this.hurtPlane(best, P.player ? 7 : 5, P);
  }
  hurtPlane(P, dmg, by) {
    const g = this.game;
    if (!P.alive) return;
    if (P.player) { g.damage(dmg, 'shot', by ? by.pos : null); return; }
    P.hp -= dmg;
    if (P.mesh && Math.random() < 0.4) g.particles.burst(P.pos.x, P.pos.y, P.pos.z, [0.35, 0.33, 0.3], 3, 2, 0.4);
    if (by && by.player) g.hud.hitMarker && g.hud.hitMarker(false);
    if (P.hp <= 0) {
      P.alive = false; P.deadT = 0; P.vy = -4;
      if (P.faction === 'enemy') { this.kills++; g.stats.enemies = (g.stats.enemies || 0) + 1; g.hud.toast(t(by && by.player ? 'vw.planeKill' : 'vw.planeDown'), 'pick'); }
      else g.hud.toast(t('vw.wingmanDown'), 'warn');
    }
  }
  planeAi(P, dt) {
    const g = this.game, w = g.world;
    // the nearest enemy plane; keep off the ground and inside the map
    let best = null, bd = 1e9;
    for (const o of this.planes) if (o.alive && o.faction !== P.faction) { const d = o.pos.distanceTo(P.pos) * (o.player ? 0.6 : 1); if (d < bd) { bd = d; best = o; } }     // (you are the one they want)
    if (best) bd = best.pos.distanceTo(P.pos);
    let wy = P.yaw, wp = 0;
    const ground = this.surface(P.pos.x, P.pos.z);
    if (best) {
      const lead = best.pos.clone().addScaledVector(this.fwd(best), best.speed * Math.min(1.2, bd / 300));
      const v = lead.sub(P.pos);
      wy = Math.atan2(-v.x, -v.z); wp = Math.atan2(v.y, Math.hypot(v.x, v.z));
      if (bd < 35) { wy += Math.PI * 0.6; wp = 0.4; }                    // too close: break off and come round again
    }
    const m = 30;
    if (P.pos.x < m || P.pos.z < m || P.pos.x > w.W - m || P.pos.z > w.D - m) { wy = Math.atan2(-(w.W / 2 - P.pos.x), -(w.D / 2 - P.pos.z)); }
    if (P.pos.y < ground + 30) wp = Math.max(wp, 0.45);
    if (P.pos.y > ground + 140) wp = Math.min(wp, -0.2);
    this.steer(P, wy, wp, { beginner: 0.55, easy: 0.65, medium: 0.8, hard: 0.95, impossible: 1.1 }[this.diff] || 0.8, dt);
    P.speed += ((bd < 80 ? 46 : 62) - P.speed) * Math.min(1, dt);
    this.flyPlane(P, dt);
    // fire when the target is in front
    P.cool -= dt;
    if (best && bd < 300) {
      const v = best.pos.clone().sub(P.pos).normalize(), ang = Math.acos(Math.max(-1, Math.min(1, v.dot(this.fwd(P)))));
      if (ang < 0.09 && P.cool <= 0) { P.burst = 0.6 + Math.random() * 0.6; P.cool = 1.6 + Math.random() * 1.6; }
    }
    if (P.burst > 0) { P.burst -= dt; P.gunT = (P.gunT || 0) - dt; if (P.gunT <= 0) { P.gunT = 0.09; this.guns(P, dt); } }
  }
  fallPlane(P, dt) {
    const g = this.game;
    P.deadT += dt; P.vy -= 12 * dt; P.roll += dt * 3; P.pitch = Math.max(-1.2, P.pitch - dt * 0.6);
    const f = this.fwd(P);
    P.pos.addScaledVector(f, P.speed * 0.7 * dt); P.pos.y += P.vy * dt;
    if (Math.random() < dt * 12) g.particles.burst(P.pos.x, P.pos.y, P.pos.z, [0.18, 0.18, 0.18], 2, 1, 2.5, -0.5);
    if (P.pos.y <= this.surface(P.pos.x, P.pos.z) || P.deadT > 25) {
      g.explosives.explode(P.pos.x, Math.max(P.pos.y, this.surface(P.pos.x, P.pos.z)), P.pos.z, { radius: 2.5, power: 50, destroy: true, destroyRadius: 1.6, owner: 'tank' });
      P.gone = true; if (P.mesh) g.scene.remove(P.mesh);
    }
  }
  flyMe(dt, it, input) {
    const g = this.game, P = this.me, p = g.player, w = g.world;
    // the mouse sets where the nose goes; A/D roll it round harder
    p.yaw -= it.strafe * dt * 0.8;
    p.pitch = Math.max(-1.1, Math.min(1.1, p.pitch));
    this.steer(P, p.yaw, p.pitch, 1.15, dt);
    const thr = it.fwd;
    P.speed = Math.max(PLANE_MIN, Math.min(PLANE_MAX, P.speed + thr * 14 * dt - (thr === 0 ? (P.speed - 55) * 0.2 * dt : 0) - Math.sin(P.pitch) * 9 * dt));
    this.flyPlane(P, dt);
    // the map's edge: the controls turn you back
    const m = 12;
    if (P.pos.x < m || P.pos.z < m || P.pos.x > w.W - m || P.pos.z > w.D - m) { p.yaw = Math.atan2(-(w.W / 2 - P.pos.x), -(w.D / 2 - P.pos.z)); this.edgeT = 2; }
    this.edgeT = Math.max(0, (this.edgeT || 0) - dt);
    P.pos.x = Math.max(4, Math.min(w.W - 4, P.pos.x)); P.pos.z = Math.max(4, Math.min(w.D - 4, P.pos.z));      // never off the map
    // the ground
    const ground = this.surface(P.pos.x, P.pos.z);
    this.low = P.pos.y < ground + 18;
    if (P.pos.y < ground + 1.2) { g.explosives.explode(P.pos.x, ground, P.pos.z, { radius: 2.5, power: 0, destroy: true, destroyRadius: 1.6, owner: 'tank' }); this.lose('crash'); return; }
    // guns
    P.cool -= dt;
    if ((input.mouse.left || input.tdown('dig')) && P.ammo > 0 && P.cool <= 0) { P.cool = 0.075; this.guns(P, dt); }
    p.pos.copy(P.pos); p.vel.set(0, 0, 0); p.onGround = false;
    if (this.engine) this.engine.set(0.3 + (P.speed - PLANE_MIN) / (PLANE_MAX - PLANE_MIN) * 0.7);
  }
  // the cockpit: canopy frame, the nose and the instrument panel, fixed to the camera
  cockpit() {
    const g = this.game, cam = g.camera, C = new THREE.Group();
    if (!cam.parent) g.scene.add(cam);
    const frame = new THREE.MeshLambertMaterial({ color: 0x2a2c26 }), panelM = new THREE.MeshLambertMaterial({ color: 0x1c1e1a });
    const bar = (w, h, d, x, y, z, rz = 0, m = frame) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.z = rz; C.add(b); return b; };
    bar(0.05, 1.6, 0.05, -0.62, 0.15, -0.9, -0.35); bar(0.05, 1.6, 0.05, 0.62, 0.15, -0.9, 0.35); bar(1.6, 0.05, 0.05, 0, 0.62, -0.95);
    bar(0.04, 0.9, 0.04, -0.98, 0.05, -0.6, -0.15); bar(0.04, 0.9, 0.04, 0.98, 0.05, -0.6, 0.15);
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; this.panelCv = cv;
    this.panelTex = new THREE.CanvasTexture(cv);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.05), new THREE.MeshBasicMaterial({ map: this.panelTex })); panel.position.set(0, -0.6, -0.9); panel.rotation.x = -0.2; C.add(panel);
    bar(2.4, 0.06, 0.3, 0, -0.33, -0.95, 0, panelM);
    const prop = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.12 })); prop.position.set(0, -0.62, -3.75); C.add(prop);
    C.traverse((o) => { o.renderOrder = 10; if (o.material) { o.material.depthTest = false; o.material.fog = false; } });
    cam.add(C); this.cockpitObj = C;
    this.drawPanel();
  }
  drawPanel() {
    const c = this.panelCv.getContext('2d'), P = this.me;
    c.setTransform(0.5, 0, 0, 0.5, 0, 0);          // (drawn at half size: lighter to send to the GPU)
    c.fillStyle = '#23251f'; c.fillRect(0, 0, 1024, 256);
    const gauge = (x, y, r, lbl, v) => { c.fillStyle = '#0c0c0a'; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.strokeStyle = '#8a8a7a'; c.lineWidth = 4; c.stroke(); c.strokeStyle = '#d8d0b0'; c.lineWidth = 2; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; c.beginPath(); c.moveTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8); c.lineTo(x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95); c.stroke(); } c.strokeStyle = '#f0e090'; c.lineWidth = 4; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(v) * r * 0.75, y + Math.sin(v) * r * 0.75); c.stroke(); c.fillStyle = '#c8c0a0'; c.font = '20px Arial'; c.textAlign = 'center'; c.fillText(lbl, x, y + r + 26); };
    const ground = this.surface(P.pos.x, P.pos.z);
    gauge(150, 110, 70, t('vw.g.speed'), -2.2 + (P.speed / PLANE_MAX) * 4.4);
    gauge(330, 110, 70, t('vw.g.alt'), -1.57 + ((P.pos.y - ground) / 150) * 6.28);
    // the artificial horizon
    c.save(); c.beginPath(); c.arc(512, 100, 80, 0, 7); c.clip(); c.translate(512, 100 + P.pitch * 60); c.rotate(-P.roll);
    c.fillStyle = '#4a7aa8'; c.fillRect(-120, -200, 240, 200); c.fillStyle = '#6a4a2a'; c.fillRect(-120, 0, 240, 200); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(-90, 0); c.lineTo(90, 0); c.stroke(); c.restore();
    c.strokeStyle = '#f0e090'; c.lineWidth = 4; c.beginPath(); c.moveTo(470, 100); c.lineTo(500, 100); c.moveTo(524, 100); c.lineTo(554, 100); c.stroke();
    c.fillStyle = '#c8c0a0'; c.font = '20px Arial'; c.textAlign = 'center'; c.fillText(t('vw.g.horizon'), 512, 206);
    gauge(694, 110, 70, t('vw.g.ammo'), -2.2 + (P.ammo / 1500) * 4.4);
    gauge(874, 110, 70, t('vw.g.damage'), -2.2 + (1 - this.game.player.health / 100) * 4.4);
    this.panelTex.needsUpdate = true;
  }

  // ---- the game's hooks ----
  // the player's controls while in a tank or a plane (game.update)
  drive(dt, it, input) {
    if (!this.active) return;
    if (this.mode === 'tank') this.driveTank(dt, it, input); else this.flyMe(dt, it, input);
  }
  // damage to you is damage to your tank or plane (armor takes most of it in a tank)
  absorb(n, cause) {
    if (this.mode === 'tank') return n * (cause === 'blast' ? 0.45 : 0.06);
    return cause === 'combat' ? 0 : n * 0.6;          // (riflemen on the ground can't reach a fighter)
  }
  camera() {
    if (!this.active) return;
    const g = this.game, cam = g.camera, p = g.player;
    if (g.thirdPerson && g.thirdPerson.rig) g.thirdPerson.rig.root.visible = false;    // (you are inside)
    g.vm.hidden = true;                                                                 // (no hand-held weapon in a tank or a plane)
    if (this.mode === 'tank') {
      const T = this.me, a = T.yaw + T.turret;
      if (this.view === 'sight') {
        cam.position.set(T.pos.x, T.pos.y + 2.3, T.pos.z);
        cam.rotation.set(T.elev, a, 0, 'YXZ');
        if (cam.fov !== 32) { cam.fov = 32; cam.updateProjectionMatrix(); }
      } else {
        const back = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
        cam.position.set(T.pos.x + back.x * 9, T.pos.y + 4.6, T.pos.z + back.z * 9);
        const w = g.world; for (let k = 0; k < 6 && SOLID[w.get(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z))]; k++) cam.position.y += 1;
        cam.rotation.set(-0.16 + p.pitch * 0.6, a, 0, 'YXZ');
        if (cam.fov !== 70) { cam.fov = 70; cam.updateProjectionMatrix(); }
      }
    } else {
      const P = this.me;
      cam.position.copy(P.pos);
      cam.rotation.set(P.pitch, P.yaw, -P.roll, 'YXZ');
      if (cam.fov !== 72) { cam.fov = 72; cam.updateProjectionMatrix(); }
      if (this.shakeT) { cam.position.x += (Math.random() - 0.5) * 0.08; cam.position.y += (Math.random() - 0.5) * 0.08; }
    }
  }
  tracer(a, b, life) {
    const tr = this.tracers[this.trI++ % this.tracers.length], pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
    tr.l.visible = true; tr.t = life;
  }
  update(dt) {
    const g = this.game;
    if (!this.started) { this.start(); return; }
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; if (tr.t <= 0) tr.l.visible = false; }
    if (this.over) return;
    // waves: the next when this one is beaten
    const foes = this.mode === 'tank' ? this.tanks.filter((T) => T.faction === 'enemy' && T.alive).length : this.planes.filter((P) => P.faction === 'enemy' && P.alive).length;
    if (!foes) {
      if (this.wave >= this.maxWaves) { this.win(); return; }
      this.waveT -= dt;
      if (this.waveT <= 0) { this.waveT = 6; this.nextWave(); if (this.mode === 'air') this.me.ammo = 1500; }
    }
    if (this.mode === 'tank') {
      for (const T of this.tanks) {
        if (!T.alive) { T.deadT += dt; if (Math.random() < dt * 4) g.particles.burst(T.pos.x, T.pos.y + 2, T.pos.z, [0.15, 0.15, 0.15], 2, 1, 3, -1.5); }
        else if (!T.player) this.tankAi(T, dt);
        T.mesh.position.copy(T.pos); T.mesh.rotation.y = T.yaw; T.turretObj.rotation.y = T.turret; T.gunObj.rotation.x = T.elev;
      }
      // wrecks are cleared after a while
      for (const T of this.tanks) if (!T.alive && !T.player && T.deadT > 60) { g.scene.remove(T.mesh); T.gone = true; }
      this.tanks = this.tanks.filter((T) => !T.gone);
      this.updateShells(dt);
    } else {
      for (const P of this.planes) {
        if (P.player) continue;
        if (P.alive) this.planeAi(P, dt); else this.fallPlane(P, dt);
        if (P.mesh) { P.mesh.position.copy(P.pos); P.mesh.rotation.set(P.pitch, P.yaw, -P.roll); if (P.prop) P.prop.rotation.z += dt * 40; }
      }
      this.planes = this.planes.filter((P) => !P.gone);
      if ((this.panelT = (this.panelT || 0) - dt) <= 0) { this.panelT = 0.25; this.drawPanel(); }
    }
    if ((this.hudT = (this.hudT || 0) - dt) <= 0) { this.hudT = 0.1; this.drawHud(); }     // (ten times a second is plenty)
  }
  // the screen: your vehicle's state, the wave, kills; a gunsight and lead
  // marks on enemies in the air
  drawHud() {
    const g = this.game, P = this.me, hp = Math.round(g.player.health);
    let html = '';
    if (this.mode === 'tank') {
      const T = this.me;
      html = `<div class="vw-box"><div>${t('vw.hull')} <span class="vw-bar"><i style="width:${hp}%;background:${hp > 40 ? '#7ac860' : '#e0603a'}"></i></span></div>
        <div>${t('vw.gun')} ${T.cool > 0 ? `<span class="vw-bar"><i style="width:${Math.round((1 - T.cool / RELOAD) * 100)}%"></i></span>` : `<b>${t('vw.ready')}</b>`}</div>
        <div>${t('vw.waveN', { n: this.wave, of: this.maxWaves })} · ${t('vw.kills', { n: this.kills })}</div>
        <div>${t('vw.speed', { n: Math.round(Math.abs(T.speed) * 3.6) })}</div></div>
        ${this.view === 'sight' ? '<div class="vw-sight"></div>' : ''}`;
      // where a shell fired now would land (a ring on the screen)
      if ((this.aimT = (this.aimT || 0) - 1) <= 0 || !this.aimAt) { this.aimT = 3; this.aimAt = this.impact(T); }
      const v = this.aimAt.clone().project(g.camera);
      if (v.z < 1) html += `<div class="vw-cross" style="left:${((v.x + 1) / 2 * 100).toFixed(1)}%;top:${((1 - v.y) / 2 * 100).toFixed(1)}%"></div>`;
    } else {
      const ground = this.surface(P.pos.x, P.pos.z);
      html = `<div class="vw-box"><div>${t('vw.speed', { n: Math.round(P.speed * 3.6) })} · ${t('vw.alt', { n: Math.round(P.pos.y - ground) })}</div>
        <div>${t('vw.airframe')} <span class="vw-bar"><i style="width:${hp}%;background:${hp > 40 ? '#7ac860' : '#e0603a'}"></i></span></div>
        <div>${t('vw.ammo', { n: P.ammo })}</div><div>${t('vw.waveN', { n: this.wave, of: this.maxWaves })} · ${t('vw.kills', { n: this.kills })}</div></div>
        <div class="vw-ring"><i></i></div>${this.low ? `<div class="vw-warn">${t('vw.pullUp')}</div>` : this.edgeT ? `<div class="vw-warn">${t('vw.edge')}</div>` : ''}`;
      // a red ring on each enemy in front of you
      const cam = g.camera, v = new THREE.Vector3();
      for (const o of this.planes) {
        if (!o.alive || o.faction !== 'enemy') continue;
        v.copy(o.pos).project(cam);
        if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
        const d = Math.round(o.pos.distanceTo(P.pos));
        html += `<div class="vw-mark" style="left:${((v.x + 1) / 2 * 100).toFixed(1)}%;top:${((1 - v.y) / 2 * 100).toFixed(1)}%"><span>${d} m</span></div>`;
      }
    }
    if (html !== this.hudHtml) { this.hudHtml = html; this.hud.innerHTML = html; }
  }
  win() {
    if (this.over) return;
    this.over = true;
    const g = this.game;
    g.stats.vwWins = (g.stats.vwWins || 0) + 1; g.flushStats();
    sfx.done();
    g.app.openPanel('vwarEnd', { win: true, kills: this.kills, mode: this.mode });
  }
  lose(why = 'destroyed') {
    if (this.over) return;
    this.over = true;
    const g = this.game;
    sfx.explosion(1, false);
    if (this.mode === 'tank') { this.me.alive = false; this.me.mesh.visible = true; }
    g.flushStats();
    setTimeout(() => g.app.openPanel('vwarEnd', { win: false, kills: this.kills, mode: this.mode, why }), 1200);
  }
  dispose() {
    const g = this.game;
    for (const T of this.tanks) g.scene.remove(T.mesh);
    for (const P of this.planes) if (P.mesh) g.scene.remove(P.mesh);
    for (const tr of this.tracers) { g.scene.remove(tr.l); tr.l.geometry.dispose(); }
    if (this.cockpitObj) g.camera.remove(this.cockpitObj);
    if (this.engine) this.engine.stop();
    this.hud.remove();
    document.body.classList.remove('vwar-on');
  }
}

function angDiff(a, b) { return ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
function turn(a, b, k) { const d = angDiff(a, b); return a + Math.max(-k, Math.min(k, d)); }
