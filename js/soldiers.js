// Soldiers of the fictional enemy army (and, in Stage 4, the player's allies).
// Original uniforms and insignia; no real-world flags or emblems.
import * as THREE from 'three';
import { DIFF, SEA } from './config.js';
import { B, SOLID } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

export const FACTIONS = {
  // the enemy army: slate-grey tunics, rust armband, pale diamond insignia
  enemy: { tunic: 0x4b5662, trousers: 0x3a424a, helmet: 0x3c423e, band: 0x8a3a2a, insignia: 0xd8c070, tracer: 0xff7a40 },
  // allies (used from Stage 4): khaki-olive tunics, sand armband, slate-blue roundel
  ally: { tunic: 0x6e6448, trousers: 0x5a5238, helmet: 0x55583a, band: 0xc8b890, insignia: 0x2a4a6a, tracer: 0xd8f0c8 },
};

export const SOLDIER_TYPES = {
  rifleman:  { hp: 100, weapon: 'rifle', range: 60, pref: 24, dmg: 14, rate: 1.8, burst: 1, sound: 'rifle' },
  grenadier: { hp: 100, weapon: 'pistol', range: 35, pref: 16, dmg: 9, rate: 1.0, burst: 1, grenades: 3, tnt: 1, sound: 'pistol' },
  gunner:    { hp: 130, weapon: 'smg', range: 50, pref: 26, dmg: 6, rate: 2.8, burst: 6, burstGap: 0.11, sound: 'smg', acc: 0.6 },
  sniper:    { hp: 90, weapon: 'sniper', range: 110, pref: 60, dmg: 38, rate: 4.8, burst: 1, acc: 1.7, sound: 'sniper' },
  officer:   { hp: 120, weapon: 'pistol', range: 35, pref: 20, dmg: 9, rate: 1.1, burst: 1, sound: 'pistol' },
  commander: { hp: 220, weapon: 'smg', range: 45, pref: 14, dmg: 7, rate: 1.9, burst: 5, burstGap: 0.1, grenades: 4, sound: 'smg', acc: 0.8 },
};
const ACC = { beginner: 0.16, easy: 0.24, medium: 0.32, hard: 0.42, impossible: 0.52 };
const DMG = { beginner: 0.55, easy: 0.75, medium: 1, hard: 1.2, impossible: 1.4 };
const HUNT = { beginner: 0.25, easy: 0.35, medium: 0.5, hard: 0.65, impossible: 0.8 };     // night hunt chance
const DAY_HUNT = { beginner: 0.03, easy: 0.05, medium: 0.08, hard: 0.12, impossible: 0.16 };
const TANK_CHANCE = { beginner: 0.04, easy: 0.07, medium: 0.1, hard: 0.15, impossible: 0.22 };

const MATS = {};
const mat = (c) => MATS[c] || (MATS[c] = new THREE.MeshLambertMaterial({ color: c }));
function bx(w, h, d, c, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); return m; }

const GUN_LEN = { rifle: 0.95, sniper: 1.05, smg: 0.6, pistol: 0.26, knife: 0.25 };

export function makeSoldier(faction, type) {
  const F = FACTIONS[faction];
  const officer = type === 'officer', commander = type === 'commander';
  const tunic = commander ? 0x262626 : officer ? (faction === 'enemy' ? 0x2f363d : 0x5a5038) : F.tunic;
  const g = new THREE.Group();
  const skin = 0xb49a82;
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.12, 0.85, 0);
    leg.add(bx(0.22, 0.7, 0.24, F.trousers, 0, -0.35, 0));
    leg.add(bx(0.24, 0.16, 0.3, 0x2a2420, 0, -0.77, -0.03));
    g.add(leg); legs.push(leg);
  }
  const body = new THREE.Group(); g.add(body);
  body.add(bx(0.52, 0.62, 0.3, tunic, 0, 1.16, 0));
  body.add(bx(0.54, 0.07, 0.32, 0x2e261c, 0, 0.9, 0));                 // belt
  if (type === 'gunner') { const belt = bx(0.08, 0.7, 0.33, 0x8a7440, 0, 1.18, 0); belt.rotation.z = 0.6; body.add(belt); }
  if (type === 'grenadier') for (const s of [-1, 1]) body.add(bx(0.12, 0.12, 0.08, 0x3c3a2a, s * 0.16, 0.95, -0.18));
  if (type === 'sniper') { body.add(bx(0.56, 0.4, 0.34, 0x5a5a40, 0, 1.28, 0)); body.add(bx(0.2, 0.2, 0.35, 0x4a4a32, 0.12, 1.1, 0)); }
  if (officer || commander) for (const s of [-1, 1]) body.add(bx(0.07, 0.05, 0.02, faction === 'enemy' ? 0x9a3a2a : 0x8a7a40, s * 0.1, 1.42, -0.16));
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); g.add(head);
  head.add(bx(0.28, 0.28, 0.28, skin, 0, 0, 0));
  head.add(bx(0.05, 0.04, 0.02, 0x1c1814, -0.06, 0.02, -0.145), bx(0.05, 0.04, 0.02, 0x1c1814, 0.06, 0.02, -0.145));
  if (officer) { head.add(bx(0.34, 0.1, 0.36, tunic, 0, 0.18, 0)); head.add(bx(0.3, 0.03, 0.1, 0x1a1a1a, 0, 0.13, -0.2)); head.add(bx(0.06, 0.06, 0.02, F.insignia, 0, 0.2, -0.19)); }
  else if (commander) { head.add(bx(0.34, 0.13, 0.34, 0x1e1e1e, 0, 0.16, 0)); head.add(bx(0.12, 0.06, 0.04, 0x6a6a60, 0, 0.18, -0.18)); }
  else if (faction === 'enemy') {
    // crested helmet with a short brim
    head.add(bx(0.36, 0.14, 0.38, F.helmet, 0, 0.19, 0));
    head.add(bx(0.06, 0.06, 0.36, F.helmet, 0, 0.29, 0));
    head.add(bx(0.42, 0.03, 0.44, F.helmet, 0, 0.12, 0));
    const ins = bx(0.07, 0.07, 0.02, F.insignia, 0, 0.19, -0.2); ins.rotation.z = Math.PI / 4; head.add(ins);
  } else {
    // ally: shallow, wide-brimmed helmet with a roundel
    head.add(bx(0.32, 0.11, 0.32, F.helmet, 0, 0.19, 0));
    head.add(bx(0.52, 0.03, 0.52, F.helmet, 0, 0.13, 0));
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.02, 10), mat(F.insignia));
    r.rotation.x = Math.PI / 2; r.position.set(0, 0.19, -0.17); head.add(r);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.34, 1.43, 0);
    arm.add(bx(0.16, 0.58, 0.18, tunic, 0, -0.28, 0));
    arm.add(bx(0.13, 0.1, 0.13, skin, 0, -0.6, 0));
    if (s === -1) arm.add(bx(0.17, 0.1, 0.19, F.band, 0, -0.12, 0));      // armband
    g.add(arm); arms.push(arm);
  }
  const gun = new THREE.Group();
  arms[1].add(gun); gun.position.set(0, -0.6, -0.05);
  return { g, legs, arms, head, body, gun };
}
function setGun(parts, weapon) {
  parts.gun.clear();
  if (!weapon) return;
  const L = GUN_LEN[weapon] || 0.6;
  const c = weapon === 'knife' ? 0xb4b8b0 : 0x2a2c28;
  parts.gun.add(bx(0.06, 0.08, L, c, 0, 0, -L / 2 + 0.1));
  if (weapon === 'rifle' || weapon === 'sniper') parts.gun.add(bx(0.07, 0.1, 0.35, 0x5a4028, 0, -0.02, 0.15));
  if (weapon === 'sniper') parts.gun.add(bx(0.05, 0.05, 0.25, 0x1a1a1a, 0, 0.07, -0.1));
  if (weapon === 'smg') parts.gun.add(bx(0.04, 0.16, 0.05, 0x1a1a1a, 0, -0.1, -0.1));
}

// ---------------------------------------------------------------------------
class Soldier {
  constructor(mgr, faction, type, x, y, z, squad, armed) {
    this.mgr = mgr; this.faction = faction; this.type = type; this.T = SOLDIER_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = this.T.hp; this.alive = true; this.deadT = 0;
    this.squad = squad;
    this.weapon = armed ? this.T.weapon : null;
    this.grenades = armed ? (this.T.grenades || 0) : 0;
    this.tnt = armed ? (this.T.tnt || 0) : 0;
    this.cool = 1 + Math.random() * 2; this.gcool = 5; this.burstLeft = 0; this.burstT = 0;
    this.senseT = Math.random() * 0.3; this.sees = false; this.alerted = false;
    this.strafe = 1; this.strafeT = 0; this.stuckT = 0; this.phase = 0; this.fleeT = 0; this.fleeFrom = null;
    this.craft = null; this.speed = 0;
    this.parts = makeSoldier(faction, type);
    setGun(this.parts, this.weapon || 'knife');
    mgr.game.scene.add(this.parts.g);
  }
  get armed() { return !!this.weapon; }
  arm(weapon) { this.weapon = weapon; setGun(this.parts, weapon); }
}

export class Enemies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.squads = [];
    this.pending = [];       // defeated soldiers waiting to come back (numbers stay constant)
    this.fires = [];         // campfires lit by enemies for crafting
    this.tank = null;
    this.tankT = 60;
    this.huntT = 20;
    this.enabled = !game.peace;
    this.diff = game.cfg.difficulty || 'medium';
    this.tmpBox = new THREE.Box3(); this.ray = new THREE.Ray(); this.v = new THREE.Vector3();
    // tracer pool
    this.tracers = [];
    for (let i = 0; i < 16; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff7a40, transparent: true, opacity: 0.8 }));
      l.visible = false; l.frustumCulled = false; game.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.tracerI = 0;
    if (!this.enabled) return;
    let n = DIFF[this.diff].enemies;
    while (n > 0) {
      const size = Math.min(n, 3 + Math.floor(Math.random() * 3));
      this.spawnSquad(size, true);
      n -= size;
    }
  }

  // ------------------------------------------------------------ spawning
  farSpot(minDist) {
    const w = this.game.world, p = this.game.player.pos;
    for (let i = 0; i < 60; i++) {
      const x = 6 + Math.random() * (w.W - 12), z = 6 + Math.random() * (w.D - 12);
      if (Math.hypot(x - p.x, z - p.z) < minDist) continue;
      const y = w.surfaceY(Math.floor(x), Math.floor(z));
      if (y < SEA || w.get(Math.floor(x), y + 1, Math.floor(z)) === B.WATER) continue;
      if (this.ground(x, z, y + 1) == null) continue;
      return { x, y: y + 1, z };
    }
    return null;
  }
  newSquad(at) {
    const sq = { members: [], mode: 'patrol', wp: { x: at.x, z: at.z }, alert: null, alertT: 0, hunt: null };
    this.squads.push(sq);
    return sq;
  }
  spawnSquad(size, armed) {
    const at = this.farSpot(60);
    if (!at) return;
    const sq = this.newSquad(at);
    const types = [];
    if (Math.random() < 0.35) types.push('officer');
    if (Math.random() < 0.5) types.push('gunner');
    if (Math.random() < 0.35) types.push('sniper');
    if (Math.random() < 0.6) types.push('grenadier');
    while (types.length < size) types.push('rifleman');
    types.length = size;
    for (const type of types) {
      const x = at.x + (Math.random() - 0.5) * 6, z = at.z + (Math.random() - 0.5) * 6;
      const y = this.ground(x, z, at.y) ?? at.y;
      this.add('enemy', type, x, y, z, sq, armed);
    }
  }
  add(faction, type, x, y, z, sq, armed) {
    const s = new Soldier(this, faction, type, x, y, z, sq, armed);
    sq.members.push(s); this.list.push(s);
    return s;
  }

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

  dmgScale() { return DMG[this.diff] || 1; }

  // ------------------------------------------------------------- senses
  isNight() { const tod = this.game.time % 1; return tod < 0.22 || tod > 0.8; }
  canSee(s) {
    const g = this.game, pl = g.player;
    if (g.dead) return false;
    const eye = this.v.set(s.pos.x, s.pos.y + 1.65, s.pos.z);
    const tgt = pl.eye();
    const d = eye.distanceTo(tgt);
    let sight = 75;
    if (this.isNight() && !g.lightOn) sight = 22;
    if (pl.crouch && Math.hypot(pl.vel.x, pl.vel.z) < 0.5) sight *= 0.6;
    if (d > Math.min(sight, s.T.range + 20)) return false;
    // unaware soldiers only look ahead; up close they hear footsteps (not sneaking)
    const footsteps = d < 4 && !pl.crouch && Math.hypot(pl.vel.x, pl.vel.z) > 0.5;
    if (!s.alerted && !footsteps) {
      const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
      const dot = ((tgt.x - eye.x) * fx + (tgt.z - eye.z) * fz) / (Math.hypot(tgt.x - eye.x, tgt.z - eye.z) || 1);
      if (dot < 0.3) return false;            // not looking that way
    }
    if (g.explosives.smokeBlocks(eye, tgt)) return false;
    return this.clearLine(eye, tgt, 'sight') || this.clearLine(eye, new THREE.Vector3(tgt.x, pl.pos.y + 0.9, tgt.z), 'sight');
  }
  clearLine(a, b, mode) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length(); dir.divideScalar(len);
    const hit = this.game.world.raycast(a.x, a.y, a.z, dir.x, dir.y, dir.z, len, false, mode);
    return !hit;
  }
  hear(pos, radius) {
    for (const sq of this.squads) {
      const m = sq.members.find((s) => s.alive && s.pos.distanceTo(pos) < radius);
      if (m) this.alertSquad(sq, this.game.player.pos, false);
    }
  }
  alertSquad(sq, pos, seen) {
    if (sq.mode !== 'engage') sq.engagedAt = performance.now();
    sq.mode = 'engage';
    sq.alert = pos.clone(); sq.alertT = 0;
    for (const m of sq.members) m.alerted = true;
    if (seen) sq.seenT = 0;
  }

  // -------------------------------------------------------------- update
  update(dt) {
    if (!this.enabled) return;
    const g = this.game;
    const night = this.isNight();
    // squads decide: patrol, engage, or hunt the player (much more often at night)
    this.huntT -= dt;
    if (this.huntT <= 0) {
      this.huntT = 40;
      const chance = night ? HUNT[this.diff] : DAY_HUNT[this.diff];
      for (const sq of this.squads) if (sq.mode === 'patrol' && Math.random() < chance) {
        sq.mode = 'hunt';
        sq.hunt = { x: g.player.pos.x + (Math.random() - 0.5) * 30, z: g.player.pos.z + (Math.random() - 0.5) * 30 };
      }
    }
    for (const sq of this.squads) {
      sq.members = sq.members.filter((m) => this.list.includes(m));
      if (sq.mode === 'engage') {
        sq.alertT += dt;
        if (sq.alertT > 30) { sq.mode = night ? 'hunt' : 'patrol'; sq.hunt = sq.alert ? { x: sq.alert.x, z: sq.alert.z } : null; for (const m of sq.members) m.alerted = false; }
      }
      const lead = sq.members.find((m) => m.alive && m.armed);
      if (lead && sq.mode === 'patrol' && Math.hypot(lead.pos.x - sq.wp.x, lead.pos.z - sq.wp.z) < 3) {
        const w = g.world;
        sq.wp = { x: Math.max(8, Math.min(w.W - 8, lead.pos.x + (Math.random() - 0.5) * 120)), z: Math.max(8, Math.min(w.D - 8, lead.pos.z + (Math.random() - 0.5) * 120)) };
      }
      if (lead && sq.mode === 'hunt' && sq.hunt && Math.hypot(lead.pos.x - sq.hunt.x, lead.pos.z - sq.hunt.z) < 4) {
        sq.hunt = { x: g.player.pos.x + (Math.random() - 0.5) * 24, z: g.player.pos.z + (Math.random() - 0.5) * 24 };
      }
    }
    this.squads = this.squads.filter((sq) => sq.members.length);
    for (const s of this.list.slice()) this.updateSoldier(s, dt);
    // defeated soldiers return elsewhere, unarmed (they must loot or craft)
    for (const p of this.pending) p.t -= dt;
    for (const p of this.pending.filter((q) => q.t <= 0)) {
      const at = this.farSpot(70);
      if (!at) continue;
      this.pending.splice(this.pending.indexOf(p), 1);
      let sq = this.squads.filter((q) => q.members.length < 5).sort((a, b) => Math.hypot(a.wp.x - at.x, a.wp.z - at.z) - Math.hypot(b.wp.x - at.x, b.wp.z - at.z))[0];
      if (!sq) sq = this.newSquad(at);
      this.add('enemy', p.type, at.x, at.y, at.z, sq, false);
    }
    for (const f of this.fires) { f.t -= dt; if (f.t <= 0 && g.world.get(f.x, f.y, f.z) === B.CAMPFIRE) g.world.set(f.x, f.y, f.z, B.AIR); }
    this.fires = this.fires.filter((f) => f.t > 0);
    // the rare boss: a tank commander in a light tank
    this.tankT -= dt;
    if (this.tankT <= 0) {
      this.tankT = 150;
      if (!this.tank && Math.random() < TANK_CHANCE[this.diff]) this.spawnTank();
    }
    if (this.tank) this.tank.update(dt);
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.08) * 0.8; if (tr.t <= 0) tr.l.visible = false; }
  }

  updateSoldier(s, dt) {
    const g = this.game, pl = g.player;
    if (!s.alive) {
      s.deadT += dt;
      s.parts.g.rotation.x = -Math.min(Math.PI / 2, s.deadT * 4);
      s.parts.g.position.copy(s.pos);
      if (s.deadT > 0.8 && !s.looted) { s.looted = true; this.dropLoot(s); }
      if (s.deadT > 12) this.remove(s);
      return;
    }
    const dx = pl.pos.x - s.pos.x, dz = pl.pos.z - s.pos.z;
    const dist = Math.hypot(dx, dz);
    const far = dist > 130;
    // senses (staggered)
    s.senseT -= dt;
    if (s.senseT <= 0 && !far) {
      s.senseT = 0.3;
      s.sees = s.armed || dist < 20 ? this.canSee(s) : false;
      if (s.sees) this.alertSquad(s.squad, pl.pos, true);
    } else if (far) s.sees = false;
    // barbed wire slows and cuts
    const wire = [0.2, 1.0].some((h) => g.world.get(Math.floor(s.pos.x), Math.floor(s.pos.y + h), Math.floor(s.pos.z)) === B.WIRE);
    if (wire) { s.hp -= 5 * dt; if (s.hp <= 0) { this.kill(s, 'wire'); return; } }
    const slow = wire ? 0.35 : 1;
    // nearby grenade from the player: scatter
    const nade = g.explosives.projectiles.find((p) => p.owner === 'player' && p.kind === 'grenade' && p.pos.distanceTo(s.pos) < 5);
    if (nade) { s.fleeT = 2; s.fleeFrom = nade.pos.clone(); }
    const sq = s.squad;
    let goal = null, speed = 0, face = null;
    s.cool -= dt; s.gcool -= dt;
    if (s.fleeT > 0) {
      s.fleeT -= dt;
      const fx = s.pos.x - s.fleeFrom.x, fz = s.pos.z - s.fleeFrom.z, fl = Math.hypot(fx, fz) || 1;
      goal = { x: s.pos.x + fx / fl * 5, z: s.pos.z + fz / fl * 5 }; speed = 5;
    } else if (!s.armed) {
      this.unarmedBehaviour(s, dt, dist);
      return;
    } else if (s.sees) {
      face = { x: pl.pos.x, z: pl.pos.z };
      const pref = s.T.pref;
      if (dist > pref + 6) { goal = { x: pl.pos.x, z: pl.pos.z }; speed = 4.6; }
      else if (dist < pref - 8 && s.type !== 'commander') { goal = { x: s.pos.x - dx / dist * 4, z: s.pos.z - dz / dist * 4 }; speed = 3; }
      else if (s.type !== 'sniper') {
        s.strafeT -= dt;
        if (s.strafeT <= 0) { s.strafeT = 1.5 + Math.random() * 2.5; s.strafe = Math.random() < 0.5 ? -1 : 1; }
        goal = { x: s.pos.x + (-dz / dist) * s.strafe * 3, z: s.pos.z + (dx / dist) * s.strafe * 3 }; speed = 1.6;
      }
      this.tryFire(s, dt, dist);
      if (s.grenades > 0 && s.gcool <= 0 && dist > 8 && dist < 30) this.throwGrenade(s);
      if (dist < 1.9 && s.cool <= 0) { s.cool = 1.2; sfx.swish(); g.damage(16 * DMG[this.diff], 'combat', s.pos); }
    } else if (sq.mode === 'engage' && sq.alert) {
      goal = { x: sq.alert.x, z: sq.alert.z }; speed = 4.2;
      face = goal;
      // blocked by the player's walls: plant TNT against them
      if (s.tnt > 0 && dist < 18 && (s.stuckT > 1.2 || Math.hypot(s.pos.x - sq.alert.x, s.pos.z - sq.alert.z) < 3)) this.plantTNT(s);
      if (Math.hypot(s.pos.x - sq.alert.x, s.pos.z - sq.alert.z) < 2.5) sq.alert = pl.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
    } else if (sq.mode === 'hunt' && sq.hunt) {
      const i = sq.members.indexOf(s);
      goal = { x: sq.hunt.x + (i % 3 - 1) * 3, z: sq.hunt.z + Math.floor(i / 3) * 3 }; speed = 3.6;
    } else {
      const i = sq.members.indexOf(s);
      goal = { x: sq.wp.x + (i % 3 - 1) * 2.5, z: sq.wp.z + Math.floor(i / 3) * 2.5 }; speed = 2.4;
    }
    if (goal && speed > 0) this.moveToward(s, goal.x, goal.z, speed * slow, dt);
    else { s.speed = 0; this.settle(s, dt); }
    if (face) s.yaw = this.turn(s.yaw, Math.atan2(-(face.x - s.pos.x), -(face.z - s.pos.z)), dt * 8);
    this.animate(s, dt, s.sees || sq.mode === 'engage');
  }

  unarmedBehaviour(s, dt, dist) {
    const g = this.game;
    // loot a weapon lying nearby, otherwise light a campfire and craft one
    const loot = g.pickups.list.find((it) => ['rifle', 'smg', 'pistol', 'sniper'].includes(it.id) && it.pos.distanceTo(s.pos) < 30);
    if (loot) {
      this.moveToward(s, loot.pos.x, loot.pos.z, 4, dt);
      if (Math.hypot(loot.pos.x - s.pos.x, loot.pos.z - s.pos.z) < 1.3) { s.arm(loot.id); g.pickups.removeItem(loot); }
    } else if (!s.craft) {
      const x = Math.floor(s.pos.x + 1), z = Math.floor(s.pos.z), y = Math.floor(s.pos.y);
      if (g.world.get(x, y, z) === B.AIR && SOLID[g.world.get(x, y - 1, z)] && dist > 25) {
        g.world.set(x, y, z, B.CAMPFIRE);
        this.fires.push({ x, y, z, t: 90 });
      }
      s.craft = { t: 22 + Math.random() * 10 };
      s.speed = 0;
    } else {
      s.craft.t -= dt; s.speed = 0; this.settle(s, dt);
      if (s.craft.t <= 0) { s.arm(s.T.weapon); s.grenades = s.T.grenades || 0; s.tnt = s.T.tnt || 0; s.craft = null; }
    }
    // defend themselves with a knife if the player comes close
    if (dist < 1.9 && s.cool <= 0) { s.cool = 1.2; sfx.swish(); g.damage(12 * DMG[this.diff], 'combat', s.pos); }
    this.animate(s, dt, false);
  }

  turn(a, b, k) {
    const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * Math.min(1, k);
  }
  settle(s, dt) {
    const gy = this.ground(s.pos.x, s.pos.z, s.pos.y);
    if (gy != null) s.pos.y += (gy - s.pos.y) * Math.min(1, dt * 10);
  }
  moveToward(s, tx, tz, speed, dt) {
    const dx = tx - s.pos.x, dz = tz - s.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { s.speed = 0; this.settle(s, dt); return true; }
    const base = Math.atan2(-dx, -dz);
    const step = Math.min(d, speed * dt);
    for (const o of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
      const a = base + o;
      const nx = s.pos.x - Math.sin(a) * step, nz = s.pos.z - Math.cos(a) * step;
      const gy = this.ground(nx, nz, s.pos.y);
      if (gy != null && gy - s.pos.y <= 1.05 && gy - s.pos.y > -3) {
        s.pos.x = nx; s.pos.z = nz; s.pos.y += (gy - s.pos.y) * Math.min(1, dt * 12);
        s.yaw = this.turn(s.yaw, a, dt * 6);
        s.speed = speed; s.stuckT = o === 0 ? 0 : s.stuckT + dt * 0.5;
        return false;
      }
    }
    s.stuckT += dt; s.speed = 0;
    return false;
  }
  animate(s, dt, aiming) {
    s.phase += dt * s.speed * 3.2;
    const sw = s.speed > 0 ? Math.sin(s.phase) * 0.7 : 0;
    s.parts.legs[0].rotation.x = sw; s.parts.legs[1].rotation.x = -sw;
    const armUp = aiming && s.armed ? -Math.PI / 2 + 0.1 : 0;
    s.parts.arms[1].rotation.x = armUp || -sw * 0.5;
    s.parts.arms[0].rotation.x = aiming && s.armed ? -Math.PI / 2 + 0.3 : sw * 0.5;
    s.parts.arms[0].rotation.z = aiming && s.armed ? -0.5 : 0;
    s.parts.g.position.copy(s.pos);
    s.parts.g.rotation.y = s.yaw;
    s.parts.g.visible = Math.hypot(s.pos.x - this.game.player.pos.x, s.pos.z - this.game.player.pos.z) < (this.game.settings.renderDist + 1) * 16;
  }

  // -------------------------------------------------------------- combat
  tryFire(s, dt, dist) {
    if (!s.armed || s.weapon === 'knife' || dist > s.T.range) return;
    if (s.burstLeft > 0) {
      s.burstT -= dt;
      if (s.burstT <= 0) { s.burstT = s.T.burstGap || 0.1; s.burstLeft--; this.shoot(s, dist); }
      return;
    }
    if (s.cool > 0) return;
    s.cool = s.T.rate * (0.8 + Math.random() * 0.5);
    s.burstLeft = (s.T.burst || 1) - 1; s.burstT = s.T.burstGap || 0.1;
    this.shoot(s, dist);
  }
  shoot(s, dist) {
    const g = this.game, pl = g.player;
    const muzzle = new THREE.Vector3(s.pos.x - Math.sin(s.yaw) * 0.6, s.pos.y + 1.45, s.pos.z - Math.cos(s.yaw) * 0.6);
    const target = new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.crouch ? 0.9 : 1.2), pl.pos.z);
    let p = ACC[this.diff] * (s.T.acc || 1) * Math.max(0.2, Math.min(1, 1.15 - dist / s.T.range));
    if (Math.hypot(pl.vel.x, pl.vel.z) > 3) p *= 0.7;
    if (pl.crouch) p *= 0.8;
    if (this.isNight() && !g.lightOn) p *= 0.6;
    let end;
    const dir = new THREE.Vector3().subVectors(target, muzzle).normalize();
    const block = g.world.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, muzzle.distanceTo(target), true, 'bullet');
    if (block) {
      end = muzzle.clone().addScaledVector(dir, block.dist);
      if (block.id === B.TNT) g.explosives.shootTNT(block.x, block.y, block.z);
    } else if (Math.random() < p) {
      end = target;
      g.damage(s.T.dmg * DMG[this.diff], 'combat', s.pos);
    } else {
      end = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
      if (dist < 40 && Math.random() < 0.4) sfx.ricochet();
    }
    this.tracer(muzzle, end, FACTIONS[s.faction].tracer);
    sfx.shot(s.T.sound, Math.max(0, 1 - g.camera.position.distanceTo(muzzle) / 110) * 0.8);
    g.animals.noise(s.pos, 35);
  }
  tracer(a, b, color) {
    const tr = this.tracers[this.tracerI++ % this.tracers.length];
    const pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
    tr.l.geometry.computeBoundingSphere();
    tr.l.material.color.setHex(color);
    tr.l.visible = true; tr.t = 0.08;
  }
  throwGrenade(s) {
    const g = this.game, pl = g.player;
    s.grenades--; s.gcool = 9 + Math.random() * 4;
    const from = new THREE.Vector3(s.pos.x, s.pos.y + 1.6, s.pos.z);
    const to = new THREE.Vector3(pl.pos.x + (Math.random() - 0.5) * 3, pl.pos.y + 0.3, pl.pos.z + (Math.random() - 0.5) * 3);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const T = Math.max(0.7, Math.min(1.8, d / 13));
    const vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y + 0.5 * 20 * T * T) / T, (to.z - from.z) / T);
    g.explosives.throw('grenade', from, vel, 'enemy');
    s.parts.arms[1].rotation.x = -2.5;
  }
  plantTNT(s) {
    const g = this.game, w = g.world;
    const eye = new THREE.Vector3(s.pos.x, s.pos.y + 0.5, s.pos.z);
    const tgt = new THREE.Vector3(g.player.pos.x, g.player.pos.y + 0.5, g.player.pos.z);
    const dir = new THREE.Vector3().subVectors(tgt, eye); const len = dir.length(); dir.normalize();
    const hit = w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, Math.min(len, 3.5), false, 'bullet');
    if (!hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (w.get(x, y, z) !== B.AIR || !SOLID[w.get(x, y - 1, z)]) return;
    w.set(x, y, z, B.TNT);
    g.explosives.igniteTNT(x, y, z, 11, 'enemy');
    s.tnt--;
    s.fleeT = 7; s.fleeFrom = new THREE.Vector3(x, y, z);
  }

  // Player hits: nearest soldier (or the tank) along a ray.
  raycast(origin, dir, maxDist) {
    this.ray.set(origin, dir);
    let best = null, bd = maxDist;
    for (const s of this.list) {
      if (!s.alive) continue;
      const p = s.pos;
      if (Math.abs(p.x - origin.x) > maxDist + 2 || Math.abs(p.z - origin.z) > maxDist + 2) continue;
      this.tmpBox.min.set(p.x - 0.32, p.y, p.z - 0.32);
      this.tmpBox.max.set(p.x + 0.32, p.y + 1.88, p.z + 0.32);
      const hit = this.ray.intersectBox(this.tmpBox, this.v);
      if (hit) {
        const d = hit.distanceTo(origin);
        if (d < bd) { bd = d; best = { soldier: s, dist: d, point: hit.clone(), head: hit.y > p.y + 1.48 }; }
      }
    }
    if (this.tank && this.tank.alive) {
      const b = this.tank.box();
      this.tmpBox.min.set(b.minX, b.minY, b.minZ); this.tmpBox.max.set(b.maxX, b.maxY, b.maxZ);
      const hit = this.ray.intersectBox(this.tmpBox, this.v);
      if (hit && hit.distanceTo(origin) < bd) best = { tank: this.tank, dist: hit.distanceTo(origin), point: hit.clone() };
    }
    return best;
  }
  bodyAt(pos, shooterFaction) {
    return this.list.some((s) => s.alive && s.faction !== shooterFaction && Math.abs(s.pos.x - pos.x) < 0.4 && Math.abs(s.pos.z - pos.z) < 0.4 && pos.y > s.pos.y && pos.y < s.pos.y + 1.9);
  }

  // returns true if killed
  hurt(s, dmg, { silent = false, head = false } = {}) {
    if (!s.alive) return false;
    const unaware = !s.alerted && !s.sees;
    if (silent && unaware) dmg *= 4;
    if (head) dmg *= 2.5;
    s.hp -= dmg;
    const g = this.game;
    const col = g.settings.blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3];
    g.particles.burst(s.pos.x, s.pos.y + (head ? 1.65 : 1.2), s.pos.z, col, g.settings.blood ? 6 : 4, 1.2, 0.6, 14);
    if (s.hp <= 0) { this.kill(s, 'player', silent && unaware); return true; }
    this.alertSquad(s.squad, g.player.pos, true);
    s.cool = Math.min(s.cool, 0.6);
    return false;
  }
  kill(s, by, silent = false) {
    s.alive = false; s.deadT = 0; s.speed = 0;
    s.parts.arms.forEach((a) => { a.rotation.x = 0; });
    const g = this.game;
    if (by === 'player') { g.stats.enemies = (g.stats.enemies || 0) + 1; g.hud.killNote(); }
    if (!silent) this.alertSquad(s.squad, g.player.pos, false);
    this.pending.push({ type: s.type === 'commander' ? 'officer' : s.type, t: 25 + Math.random() * 20 });
  }
  blast(center, reach, falloff, owner) {
    for (const s of this.list) {
      if (!s.alive) continue;
      const d = this.v.set(s.pos.x, s.pos.y + 0.9, s.pos.z).distanceTo(center);
      if (d < reach) this.hurt(s, falloff(d));
    }
    if (this.tank && this.tank.alive) {
      const d = this.tank.pos.distanceTo(center);
      if (d < reach + 1.5) this.tank.hurt(falloff(Math.max(0, d - 1.5)), true);
    }
  }
  grenadeAt() { /* allies call out "Grenade!" from Stage 4 */ }

  // Defeated enemies drop everything they carried.
  dropLoot(s) {
    const g = this.game, p = s.pos;
    const items = [];
    items.push([s.weapon || 'knife', 1]);
    if (s.grenades > 0) items.push(['grenade', s.grenades]);
    if (s.tnt > 0) items.push(['tnt', s.tnt]);
    if (Math.random() < 0.5) items.push(['iron', 1 + Math.floor(Math.random() * 2)]);
    if (Math.random() < 0.35) items.push(['meat_cooked', 1]);
    if (s.type === 'officer' || s.type === 'commander' || Math.random() < 0.12) items.push(['medkit', 1]);
    if (s.type === 'commander') items.push(['iron', 5], ['tnt', 2]);
    items.forEach(([id, n], i) => {
      const a = i / items.length * Math.PI * 2;
      g.pickups.spawn(id, n, p.x + Math.cos(a) * 0.5, p.y + 0.6, p.z + Math.sin(a) * 0.5);
    });
  }

  remove(s) {
    this.game.scene.remove(s.parts.g);
    s.parts.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.list = this.list.filter((x) => x !== s);
  }

  // ---------------------------------------------------------------- tank
  spawnTank() {
    const at = this.farSpot(90);
    if (!at) return;
    this.tank = new Tank(this, at.x, at.y, at.z);
    this.game.hud.toast(t('hud.tankSpotted'), 'warn');
  }

  // when the player dies, squads lose track of them for a while
  playerDied() {
    for (const sq of this.squads) { sq.mode = 'patrol'; sq.alert = null; for (const m of sq.members) m.alerted = false; }
  }

  dispose() {
    for (const s of this.list.slice()) this.remove(s);
    if (this.tank) this.tank.dispose();
    for (const tr of this.tracers) { this.game.scene.remove(tr.l); tr.l.geometry.dispose(); }
  }
}

// ---------------------------------------------------------------------------
// Rare boss: a light tank. Bullets barely scratch it; grenades and TNT work.
class Tank {
  constructor(mgr, x, y, z) {
    this.mgr = mgr; this.game = mgr.game;
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = 0; this.turret = 0; this.hp = 380; this.alive = true; this.cool = 6; this.deadT = 0;
    this.engineT = 0; this.wp = { x, z };
    const F = FACTIONS.enemy;
    const g = new THREE.Group();
    const hull = 0x3e4650, dark = 0x22262a;
    g.add(bx(2.6, 0.9, 4.2, hull, 0, 0.75, 0));
    g.add(bx(2.2, 0.35, 3.4, hull, 0, 1.3, 0.1));
    for (const s of [-1, 1]) { g.add(bx(0.55, 0.8, 4.4, dark, s * 1.4, 0.45, 0)); for (let i = 0; i < 5; i++) g.add(bx(0.58, 0.3, 0.3, 0x30343a, s * 1.4, 0.3, -1.7 + i * 0.85)); }
    const turret = new THREE.Group(); turret.position.set(0, 1.5, 0.3);
    turret.add(bx(1.6, 0.65, 1.8, hull, 0, 0.32, 0));
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 8), mat(dark));
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.35, -2.0); turret.add(barrel);
    const ins = bx(0.3, 0.3, 0.04, F.insignia, 0.81, 0.35, 0); ins.rotation.y = Math.PI / 2; ins.rotation.x = Math.PI / 4; turret.add(ins);
    turret.add(bx(0.5, 0.15, 0.5, dark, 0.3, 0.7, 0.3));
    g.add(turret);
    this.turretObj = turret; this.mesh = g;
    this.game.scene.add(g);
  }
  box() { return { minX: this.pos.x - 1.6, maxX: this.pos.x + 1.6, minZ: this.pos.z - 1.6, maxZ: this.pos.z + 1.6, minY: this.pos.y, maxY: this.pos.y + 2.2 }; }
  tryMove() { return false; }
  hurt(dmg, explosive) {
    if (!this.alive) return;
    this.hp -= explosive ? dmg : dmg * 0.08;
    const g = this.game;
    g.particles.burst(this.pos.x, this.pos.y + 1.4, this.pos.z, [0.6, 0.6, 0.55], 4, 3, 0.3);
    if (!explosive) sfx.ricochet();
    if (this.hp <= 0) this.destroy();
  }
  destroy() {
    this.alive = false;
    const g = this.game;
    g.explosives.explode(this.pos.x, this.pos.y + 1, this.pos.z, { radius: 3, power: 90, destroy: false, owner: 'tank' });
    this.mesh.traverse((o) => { if (o.material) o.material = mat(0x1c1c1c); });
    g.stats.enemies = (g.stats.enemies || 0) + 1;
    g.hud.toast(t('hud.tankDestroyed'));
    // the commander bails out and fights on
    const sq = this.mgr.newSquad(this.pos);
    const c = this.mgr.add('enemy', 'commander', this.pos.x + 2.2, this.pos.y, this.pos.z, sq, true);
    this.mgr.alertSquad(sq, g.player.pos, true);
    c.yaw = this.yaw;
  }
  update(dt) {
    const g = this.game, pl = g.player;
    if (!this.alive) {
      this.deadT += dt;
      if (Math.random() < dt * 5) g.particles.burst(this.pos.x, this.pos.y + 2, this.pos.z, [0.15, 0.15, 0.15], 2, 1, 3, -1.5);
      if (this.deadT > 90) { this.dispose(); this.mgr.tank = null; }
      return;
    }
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, dist = Math.hypot(dx, dz);
    // hunt the player when within reach, otherwise roam
    let goal = dist < 160 ? { x: pl.pos.x, z: pl.pos.z } : this.wp;
    if (dist < 160 && dist < 24) goal = null;
    if (!goal || Math.hypot(this.wp.x - this.pos.x, this.wp.z - this.pos.z) < 4) {
      this.wp = { x: this.pos.x + (Math.random() - 0.5) * 80, z: this.pos.z + (Math.random() - 0.5) * 80 };
    }
    if (goal) {
      const want = Math.atan2(-(goal.x - this.pos.x), -(goal.z - this.pos.z));
      this.yaw = this.mgr.turn(this.yaw, want, dt * 0.8);
      const sp = 2.2 * dt;
      const nx = this.pos.x - Math.sin(this.yaw) * sp, nz = this.pos.z - Math.cos(this.yaw) * sp;
      const gy = this.mgr.ground(nx, nz, this.pos.y);
      if (gy != null && Math.abs(gy - this.pos.y) <= 1.05) { this.pos.x = nx; this.pos.z = nz; this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 4); }
      else this.wp = { x: this.pos.x + (Math.random() - 0.5) * 60, z: this.pos.z + (Math.random() - 0.5) * 60 };
    }
    // turret tracks the player; fire explosive shells with line of sight
    const tw = Math.atan2(-dx, -dz) - this.yaw;
    this.turret = this.mgr.turn(this.turret, tw, dt * 1.5);
    this.cool -= dt;
    const muzzle = new THREE.Vector3(this.pos.x, this.pos.y + 1.85, this.pos.z);
    if (this.cool <= 0 && dist < 70 && !g.dead) {
      const tgt = pl.pos.clone(); tgt.y += 1.0;   // aim at the body
      if (this.mgr.clearLine(muzzle, pl.eye(), 'bullet')) {
        this.cool = 5 + Math.random() * 3;
        const a = this.yaw + this.turret;
        const dir = new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a));
        const start = muzzle.clone().addScaledVector(dir, 3.2);
        const flight = start.distanceTo(tgt) / 40;
        const v = new THREE.Vector3().subVectors(tgt, start).divideScalar(flight);
        v.y += 0.5 * 4 * flight;
        v.x += (Math.random() - 0.5) * 2; v.z += (Math.random() - 0.5) * 2;
        g.explosives.fireShell(start, v);
        sfx.cannon(Math.max(0, 1 - g.camera.position.distanceTo(start) / 150));
        g.particles.burst(start.x, start.y, start.z, [0.3, 0.3, 0.3], 14, 3, 1.5, -1);
      }
    }
    this.engineT -= dt;
    if (this.engineT <= 0) { this.engineT = 0.45; sfx.engine(Math.max(0, 1 - dist / 60)); }
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    this.turretObj.rotation.y = this.turret;
  }
  dispose() { this.game.scene.remove(this.mesh); }
}
