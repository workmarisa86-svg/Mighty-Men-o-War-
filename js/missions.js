// Missions: short, repeatable scenarios set up in a fresh world. War
// missions scale with the chosen difficulty (enemy numbers, squad size, time
// limits, supplies).
import * as THREE from 'three';
import { DIFFICULTIES, SEA } from './config.js';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { plantTree } from './worldgen.js';
import { mulberry32 } from './noise.js';

// which missions exist, where, and for whom
export const MISSIONS = [
  { id: 'take', mode: 'war', subs: ['alone', 'allies'] },
  { id: 'trench', mode: 'war', subs: ['alone', 'allies'] },
  { id: 'hold', mode: 'war', subs: ['alone', 'allies'] },
  { id: 'scout', mode: 'war', subs: ['alone', 'allies'] },
  { id: 'sniper', mode: 'war', subs: ['alone', 'allies'] },
  { id: 'bridge', mode: 'war', subs: ['allies'] },
  { id: 'supply', mode: 'war', subs: ['allies'] },
  { id: 'demo', mode: 'war', subs: ['alone', 'allies'] },
  { id: 'all', mode: 'war', subs: ['alone', 'allies'], minDiff: 3 },
];
export function missionsFor(mode, sub, diff) {
  const k = DIFFICULTIES.indexOf(diff);
  return MISSIONS.filter((m) => m.mode === mode && m.subs.includes(sub) && k >= (m.minDiff || 0));
}
// numbers shown on the mission screen (and used by the mission)
export function missionInfo(id, sub, diff) {
  const k = Math.max(0, DIFFICULTIES.indexOf(diff));
  const alone = sub === 'alone';
  const I = {
    take: { limit: (alone ? [20, 18, 16, 14, 12] : [25, 22, 20, 18, 15])[k] * 60 },
    trench: { limit: [4, 5, 6, 7, 8][k] * 60, wave: [80, 70, 60, 50, 42][k], size: [3, 3, 4, 5, 6][k] + (alone ? 0 : 1), prep: 90 },
    hold: { limit: [4, 5, 6, 7, 8][k] * 60, size: [6, 8, 10, 12, 14][k] },
    scout: { limit: [10, 9, 8, 7, 6][k] * 60 },
    sniper: { limit: [240, 210, 180, 150, 120][k], size: [4, 4, 5, 6, 7][k] },
    bridge: { limit: [4, 5, 6, 7, 8][k] * 60, wave: [80, 70, 60, 50, 45][k], size: [3, 4, 5, 5, 6][k] },
    supply: { limit: 0, size: [3, 4, 5, 5, 6][k] },
    demo: { limit: [8, 7, 6, 5, 4][k] * 60, tnt: [4, 3, 3, 3, 3][k], grenades: [8, 6, 5, 4, 3][k] },
    all: { limit: 0 },
  };
  return I[id] || { limit: 0 };
}

const MEDALS = ['bronze', 'silver', 'gold'];

export class Mission {
  constructor(game, id, saved = null) {
    this.game = game; this.id = id;
    this.info = missionInfo(id, game.cfg.sub, game.cfg.difficulty);
    this.k = Math.max(0, DIFFICULTIES.indexOf(game.cfg.difficulty));
    this.t = 0; this.done = false; this.result = null; this.phase = 0; this.data = {};
    this.failOnDeath = ['trench', 'hold', 'scout', 'sniper', 'bridge', 'demo'].includes(id);
    this.uiT = 0;
    if (saved) Object.assign(this, { t: saved.t, phase: saved.phase, data: saved.data || {}, done: saved.done, result: saved.result });
    // missions run their own enemy squads
    if (game.enemies && !['take', 'all'].includes(id)) game.enemies.noDispatch = true;
    if (!saved) this.setup(); else this.restore();
  }

  // --------------------------------------------------------------- set-up
  P() { return this.game.player; }
  placePlayer(x, z) {
    const w = this.game.world, y = w.surfaceY(Math.floor(x), Math.floor(z)) + 1;
    this.P().pos.set(Math.floor(x) + 0.5, y, Math.floor(z) + 0.5); this.P().vel.set(0, 0, 0);
    return { x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 };
  }
  enemyForts() { return this.game.forts.list.filter((f) => f.owner === 'enemy'); }
  nearestFort(from, owner, min = 0) {
    return this.game.forts.list.filter((f) => (!owner || f.owner === owner) && Math.hypot(f.cx - from.x, f.cz - from.z) >= min)
      .sort((a, b) => Math.hypot(a.cx - from.x, a.cz - from.z) - Math.hypot(b.cx - from.x, b.cz - from.z))[0] || null;
  }
  // a dry spot about `d` blocks from `from`, preferring the direction `away` from `ref`
  spotNear(from, d, ref = null) {
    const E = this.game.enemies, w = this.game.world;
    for (let i = 0; i < 60; i++) {
      let a = Math.random() * Math.PI * 2;
      if (ref && i < 30) a = Math.atan2(from.z - ref.z, from.x - ref.x) + (Math.random() - 0.5) * 1.4;
      const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
      if (x < 8 || z < 8 || x > w.W - 8 || z > w.D - 8) continue;
      if (this.game.forts.list.some((f) => Math.abs(f.cx - x) < 10 && Math.abs(f.cz - z) < 10)) continue;
      const y = w.surfaceY(Math.floor(x), Math.floor(z));
      if (y < SEA || w.get(Math.floor(x), y, Math.floor(z)) === B.WATER || !SOLID[w.get(Math.floor(x), y, Math.floor(z))]) continue;
      return { x, y: y + 1, z };
    }
    return null;
  }
  trimGarrison(f, keep) {
    const E = this.game.enemies;
    const g = E.list.filter((s) => s.home === f && s.role === 'garrison');
    g.sort((a, b) => (b.type === 'officer') - (a.type === 'officer'));
    for (const s of g.slice(keep)) E.remove(s);
  }
  give(id, n) { this.game.give(id, n, true); const hb = this.game.inv.hotbar; if (!hb.includes(id)) { const i = hb.indexOf(null); if (i >= 0) hb[i] = id; } }

  setup() {
    const g = this.game, E = g.enemies, F = g.forts, D = this.data, I = this.info;
    const pl = g.player.pos;
    const start = { x: pl.x, z: pl.z };
    if (this.id === 'take') {
      const f = this.nearestFort(start, 'enemy', 20) || F.list[0];
      if (f.owner !== 'enemy') F.setOwnerQuiet(f, 'enemy');
      if (g.cfg.sub === 'alone') this.trimGarrison(f, 2 + this.k);
      D.fort = f.id;
    } else if (this.id === 'trench') {
      const f = this.nearestFort(start, 'enemy') || F.list[0];
      const at = this.spotNear({ x: f.cx, z: f.cz }, 75) || start;
      D.spot = this.placePlayer(at.x, at.z); D.from = { x: f.cx, z: f.cz };
      this.give('shovel', 1); this.give('sandbag', 24); this.give('wire', 8); this.give('rifle', 1); this.give('grenade', 2 + (4 - this.k));
      D.nextWave = I.prep;
    } else if (this.id === 'hold') {
      const f = this.nearestFort(start, null) || F.list[0];
      F.setOwnerQuiet(f, 'ally');
      D.fort = f.id;
      this.P().pos.set(f.cx + 0.5, f.base, f.cz + 0.5); this.P().vel.set(0, 0, 0);
      this.give('rifle', 1); this.give('smg', 1); this.give('grenade', 4);
      D.wave = 0; D.nextWave = 30;
    } else if (this.id === 'scout') {
      const f = this.nearestFort(start, 'enemy', 70) || this.nearestFort(start, 'enemy');
      D.fort = f.id; D.home = this.placePlayer(start.x, start.z);
      D.seen = 0; D.officerT = 0; D.counted = false; D.officer = false;
    } else if (this.id === 'sniper') {
      const f = this.nearestFort(start, 'enemy', 40) || this.nearestFort(start, 'enemy');
      const door = f.doorOut, out = { x: door.x + (door.x - f.doorIn.x) * 2, z: door.z + (door.z - f.doorIn.z) * 2 };
      const y = g.world.surfaceY(Math.floor(out.x), Math.floor(out.z)) + 1;
      const sq = E.missionSquad('enemy', I.size, { x: out.x, y, z: out.z }, { x: pl.x, z: pl.z, player: true }, { mode: 'muster' });
      sq.musterMax = 1e9; sq.rally = { x: out.x, z: out.z };
      const off = sq.members[0]; off.missionTarget = true;
      D.officerIdx = off.idx;
      // a tree to climb, 70-90 blocks away
      const spot = this.spotNear(out, 80, null) || start;
      const p = this.placePlayer(spot.x, spot.z);
      const tx = Math.floor(p.x) + 2, tz = Math.floor(p.z);
      plantTree(g.world, tx, g.world.surfaceY(tx, tz) + 1, tz, mulberry32(7));
      for (let cz = (tz >> 4) - 1; cz <= (tz >> 4) + 1; cz++) for (let cx = (tx >> 4) - 1; cx <= (tx >> 4) + 1; cx++) g.world.markDirty(cx * 16 + 8, cz * 16 + 8);
      D.tree = { x: tx, z: tz };
      this.give('sniper', 1);
    } else if (this.id === 'bridge') {
      const b = this.findCrossing(start) || { a: start, b: { x: start.x + 20, z: start.z } };
      D.near = b.a; D.far = b.b;
      this.placePlayer(b.a.x, b.a.z);
      E.rallyAround(this.P().pos, 4);
      D.nextWave = 40;
      this.give('rifle', 1); this.give('sandbag', 12); this.give('grenade', 3);
    } else if (this.id === 'supply') {
      const f = this.nearestFort(start, 'ally') || F.list[0];
      if (f.owner !== 'ally') F.setOwnerQuiet(f, 'ally');
      const at = this.spotNear({ x: f.cx, z: f.cz }, 120) || this.spotNear({ x: f.cx, z: f.cz }, 80) || start;
      this.placePlayer(at.x + 3, at.z);
      E.rallyAround(this.P().pos, 3);
      D.fort = f.id; D.carriers = [];
      for (let i = 0; i < 3; i++) {
        const s = E.add('ally', 'rifleman', at.x + i * 1.5, g.world.surfaceY(Math.floor(at.x + i * 1.5), Math.floor(at.z)) + 1, at.z, E.newSquad(at, 'ally'), true);
        s.setRole('carrier'); s.dest = { x: f.cx + 0.5, z: f.cz + 0.5 }; s.name = s.name + ' ✚';
        D.carriers.push(s.idx);
      }
      D.ambush = 0;
    } else if (this.id === 'demo') {
      const f = this.nearestFort(start, 'enemy', 30) || this.nearestFort(start, 'enemy');
      D.fort = f.id;
      const at = this.spotNear({ x: f.cx, z: f.cz }, 70) || start;
      this.placePlayer(at.x, at.z);
      this.give('tnt', I.tnt); this.give('grenade', I.grenades); this.give('flint', 1);
    } else if (this.id === 'all') {
      if (g.cfg.sub === 'alone') {        // smaller version: three enemy forts
        const en = this.enemyForts().sort((a, b) => Math.hypot(a.cx - start.x, a.cz - start.z) - Math.hypot(b.cx - start.x, b.cz - start.z));
        for (const f of en.slice(3)) { this.trimGarrison(f, 0); F.setOwnerQuiet(f, 'none'); }
      }
    }
  }
  restore() {
    const g = this.game;
    // soldiers are not saved; recreate what the mission needs
    if (this.id === 'supply' && !this.done) {
      const f = this.fort(); const E = g.enemies, pl = g.player.pos;
      this.data.carriers = [];
      for (let i = 0; i < (this.data.alive ?? 3); i++) {
        const s = E.add('ally', 'rifleman', pl.x + i, pl.y, pl.z + 2, E.newSquad(pl, 'ally'), true);
        s.setRole('carrier'); s.dest = { x: f.cx + 0.5, z: f.cz + 0.5 }; this.data.carriers.push(s.idx);
      }
    }
  }
  fort() { return this.game.forts.list.find((f) => f.id === this.data.fort); }

  // A river or lake crossing for the bridge mission: two dry banks with
  // water between them, close to the start. A plank bridge spans it.
  findCrossing(from) {
    const g = this.game, w = g.world;
    let best = null;
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(from.x + (Math.random() - 0.5) * 160), z = Math.floor(from.z + (Math.random() - 0.5) * 160);
      if (x < 10 || z < 10 || x > w.W - 10 || z > w.D - 10 || w.get(x, SEA - 1, z) !== B.WATER) continue;
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const land = (sgn) => { for (let d = 1; d < 14; d++) { const X = x + dx * d * sgn, Z = z + dz * d * sgn; if (w.get(X, SEA - 1, Z) !== B.WATER && w.surfaceY(X, Z) >= SEA) return d; } return 0; };
        const a = land(-1), b = land(1);
        if (!a || !b) continue;
        const len = a + b;
        if (len >= 6 && (!best || len < best.len)) best = { len, x, z, dx, dz, a, b };
      }
      if (best && best.len < 10) break;
    }
    if (!best) return null;
    const { x, z, dx, dz, a, b } = best;
    for (let d = -a; d <= b; d++) {
      const X = x + dx * d, Z = z + dz * d;
      for (let s = -1; s <= 1; s++) {
        const bx = X + dz * s, bz = Z + dx * s;
        if (w.get(bx, SEA, bz) === B.AIR) w.set(bx, SEA, bz, B.WOOD);
      }
    }
    return { a: { x: x - dx * (a + 3) + 0.5, z: z - dz * (a + 3) + 0.5 }, b: { x: x + dx * (b + 3) + 0.5, z: z + dz * (b + 3) + 0.5 } };
  }

  // -------------------------------------------------------------- update
  update(dt) {
    if (this.done) return;
    const g = this.game, E = g.enemies, D = this.data, I = this.info, pl = g.player;
    this.t += dt;
    const left = I.limit ? I.limit - this.t : Infinity;
    const id = this.id;
    if (id === 'take') {
      if (this.fort().owner === 'ally') return this.win(left / I.limit);
      if (left <= 0) return this.fail('time');
    } else if (id === 'trench' || id === 'bridge') {
      D.nextWave -= dt;
      if (D.nextWave <= 0 && left > 20) {
        D.nextWave = I.wave;
        const target = id === 'trench' ? D.spot : D.near;
        const from = id === 'trench' ? (this.spotNear(target, 70, null) || D.from) : (this.spotNear(D.far, 30, D.near) || D.far);
        E.missionSquad('enemy', I.size, { x: from.x, y: g.world.surfaceY(Math.floor(from.x), Math.floor(from.z)) + 1, z: from.z },
          id === 'trench' ? { x: target.x, z: target.z, player: true } : { x: D.near.x, z: D.near.z, point: true });
      }
      if (id === 'bridge') {
        const across = E.list.filter((s) => s.alive && s.faction === 'enemy' && Math.hypot(s.pos.x - D.near.x, s.pos.z - D.near.z) < 7).length;
        if (across >= 3) return this.fail('crossed');
      }
      if (left <= 0) return this.win(pl.health / 100);
    } else if (id === 'hold') {
      const f = this.fort();
      if (f.owner !== 'ally') return this.fail('fortLost');
      D.nextWave -= dt;
      if (D.nextWave <= 0 && D.wave < 2) {
        D.wave++; D.nextWave = I.limit * 0.45;
        const at = this.spotNear({ x: f.cx, z: f.cz }, 55) || { x: f.cx + 50, z: f.cz };
        const sq = E.missionSquad('enemy', Math.round(I.size * (D.wave === 1 ? 1 : 0.6)), { x: at.x, y: g.world.surfaceY(Math.floor(at.x), Math.floor(at.z)) + 1, z: at.z }, { fort: f, x: f.doorOut.x, z: f.doorOut.z }, { tnt: 6 });
        sq.mode = 'march';
      }
      if (left <= 0) return this.win(f.blown ? 0.4 : 0.9);
    } else if (id === 'scout') {
      const f = this.fort();
      const sv = g.scopeView;
      if (!D.counted && sv.active && sv.kind === 'binoc') {
        const { eye, dir } = g.aim();
        const to = new THREE.Vector3(f.cx + 0.5, f.base + 3, f.cz + 0.5).sub(eye);
        const d = to.length();
        if (d < 170 && to.normalize().dot(dir) > 0.97) { D.seen += dt; if (D.seen > 4) { D.counted = true; D.count = E.list.filter((s) => s.alive && s.faction === 'enemy' && g.forts.inside(f, s.pos, 1)).length; g.hud.toast(t('ms.counted', { n: D.count })); sfx.done(); } }
      }
      if (!D.officer && sv.active) {
        const off = E.list.find((s) => s.alive && s.faction === 'enemy' && s.type === 'officer' && s.home === f) || E.list.find((s) => s.alive && s.faction === 'enemy' && s.type === 'officer' && g.forts.inside(f, s.pos, 1));
        if (off) {
          const { eye, dir } = g.aim();
          const to = new THREE.Vector3(off.pos.x, off.pos.y + 1.5, off.pos.z).sub(eye);
          if (to.length() < 170 && to.normalize().dot(dir) > 0.9985) { D.officerT += dt; if (D.officerT > 1.2) { D.officer = true; g.hud.toast(t('ms.officerFound')); sfx.done(); } }
        } else if (D.counted) { D.officer = true; }
      }
      if (D.counted && D.officer && Math.hypot(pl.pos.x - D.home.x, pl.pos.z - D.home.z) < 12) return this.win(left / I.limit);
      if (left <= 0) return this.fail('time');
    } else if (id === 'sniper') {
      const off = E.list.find((s) => s.missionTarget);
      if (!off || !off.alive) return this.win(Math.max(0, left / I.limit));
      if (left <= 0) {
        // the squad moves out with its officer alive
        if (off.squad) { off.squad.mode = 'march'; }
        return this.fail('movedOut');
      }
    } else if (id === 'supply') {
      const f = this.fort();
      const car = E.list.filter((s) => s.alive && s.role === 'carrier');
      D.alive = car.length;
      if (!car.length) return this.fail('carriers');
      if (car.some((s) => g.forts.inside(f, s.pos))) return this.win(car.length / 3);
      // ambushes on the way
      const dist = Math.hypot(car[0].pos.x - f.cx, car[0].pos.z - f.cz);
      if ((D.ambush === 0 && this.t > 25) || (D.ambush === 1 && dist < 70)) {
        D.ambush++;
        const at = this.spotNear(car[0].pos, 50) || { x: car[0].pos.x + 40, z: car[0].pos.z };
        E.missionSquad('enemy', I.size, { x: at.x, y: g.world.surfaceY(Math.floor(at.x), Math.floor(at.z)) + 1, z: at.z }, { x: car[0].pos.x, z: car[0].pos.z, player: true });
      }
    } else if (id === 'demo') {
      if (this.fort().blown) return this.win(left / I.limit);
      if (left <= 0) return this.fail('time');
    } else if (id === 'all') {
      if (!this.enemyForts().length) {
        const days = this.t / 1200;
        return this.win(days < 2 ? 0.9 : days < 4 ? 0.5 : 0.1);
      }
    }
  }
  // objective text for the HUD
  status() {
    const D = this.data, I = this.info, id = this.id;
    let s = t('ms.' + id + '.obj');
    if (id === 'scout') s = !D.counted ? t('ms.scout.s1') : !D.officer ? t('ms.scout.s2') : t('ms.scout.s3');
    if (id === 'trench' && this.t < I.prep) s = t('ms.trench.prep', { s: Math.ceil(I.prep - this.t) });
    if (id === 'supply') s += ` (${D.alive ?? 3}/3)`;
    if (id === 'take' || id === 'demo' || id === 'hold' || id === 'scout') { const f = this.fort(); if (f) s = s.replace('{fort}', f.name); }
    return s;
  }
  timeLeft() { return this.info.limit ? Math.max(0, this.info.limit - this.t) : null; }
  // where the objective is (radar, war map)
  marker() {
    const D = this.data, E = this.game.enemies, id = this.id;
    if (this.done) return null;
    if (['take', 'demo', 'hold', 'supply'].includes(id) || (id === 'scout' && !(D.counted && D.officer))) { const f = this.fort(); return f ? { x: f.cx + 0.5, z: f.cz + 0.5 } : null; }
    if (id === 'scout') return D.home;
    if (id === 'sniper') { const o = E.list.find((s) => s.missionTarget && s.alive); return o ? { x: o.pos.x, z: o.pos.z } : null; }
    if (id === 'trench') return D.spot;
    if (id === 'bridge') return D.near;
    if (id === 'all') { const f = this.nearestFort(this.game.player.pos, 'enemy'); return f ? { x: f.cx + 0.5, z: f.cz + 0.5 } : null; }
    return null;
  }
  toSave() { return { id: this.id, t: this.t, phase: this.phase, data: this.data.carriers ? { ...this.data, carriers: undefined } : this.data, done: this.done, result: this.result }; }
}
export { MEDALS };
