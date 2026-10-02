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
const ALLY_ACC = { beginner: 0.42, easy: 0.38, medium: 0.34, hard: 0.3, impossible: 0.27 };
const NAMES = ['Alder', 'Brandt', 'Corley', 'Dace', 'Ellery', 'Finch', 'Garrow', 'Hale', 'Ivers', 'Joss', 'Keane', 'Lark',
  'Moss', 'Nolan', 'Orme', 'Pike', 'Quill', 'Rook', 'Sorrel', 'Tolley', 'Vance', 'Wren', 'Yarrow', 'Zeller'];
const RANKS = { rifleman: 'Pvt.', grenadier: 'Pvt.', gunner: 'Cpl.', sniper: 'Cpl.', officer: 'Lt.', commander: 'Cpt.' };
const SEATS = [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]];
let markerTex = {};
function marker(kind) {
  if (markerTex[kind]) return markerTex[kind];
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = kind === 'follow' ? '#a8dcff' : '#4a96e8'; x.strokeStyle = '#0c1620'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(6, 8); x.lineTo(16, 22); x.lineTo(26, 8); x.lineTo(16, 13); x.closePath(); x.stroke(); x.fill();
  markerTex[kind] = new THREE.CanvasTexture(c);
  return markerTex[kind];
}

class Soldier {
  constructor(mgr, faction, type, x, y, z, squad, armed) {
    this.mgr = mgr; this.faction = faction; this.type = type; this.T = SOLDIER_TYPES[type];
    this.pos = new THREE.Vector3(x, y, z);
    this.yaw = Math.random() * Math.PI * 2;
    this.hp = this.T.hp; this.alive = true; this.deadT = 0;
    this.squad = squad; this.role = 'squad';
    this.weapon = armed ? this.T.weapon : null;
    this.grenades = armed ? (this.T.grenades || 0) : 0;
    this.tnt = armed ? (this.T.tnt || 0) : 0;
    this.iron = Math.floor(Math.random() * 5);
    this.hasKnife = true;
    this.cool = 1 + Math.random() * 2; this.gcool = 5; this.burstLeft = 0; this.burstT = 0;
    this.senseT = Math.random() * 0.3; this.sees = false; this.alerted = false; this.target = null;
    this.strafe = 1; this.strafeT = 0; this.stuckT = 0; this.phase = 0; this.fleeT = 0; this.fleeFrom = null;
    this.craft = null; this.speed = 0; this.post = null; this.raft = null; this.surrender = false;
    this.name = (RANKS[type] || 'Pvt.') + ' ' + NAMES[Math.floor(Math.random() * NAMES.length)];
    this.parts = makeSoldier(faction, type);
    setGun(this.parts, this.weapon || 'knife');
    if (faction === 'ally') {
      this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: marker('squad'), depthTest: false, transparent: true }));
      this.mark.position.y = 2.35; this.mark.scale.setScalar(0.38); this.mark.renderOrder = 5;
      this.parts.g.add(this.mark);
    }
    mgr.game.scene.add(this.parts.g);
  }
  get armed() { return !!this.weapon; }
  get follow() { return this.role === 'follow'; }
  arm(weapon) { this.weapon = weapon; setGun(this.parts, weapon || (this.hasKnife ? 'knife' : null)); }
  setRole(role) {
    this.role = role;
    if (this.mark) this.mark.material.map = marker(role === 'follow' ? 'follow' : 'squad');
  }
}

export class Enemies {
  constructor(game, saved = {}) {
    this.game = game;
    this.list = [];
    this.squads = [];
    this.pending = [];       // defeated soldiers waiting to come back (numbers stay constant)
    this.fires = [];         // campfires lit by soldiers for crafting
    this.tank = null;
    this.tankT = 60;
    this.huntT = 20;
    this.callT = 0; this.callCd = {};
    this.enabled = !game.peace;
    this.diff = game.cfg.difficulty || 'medium';
    this.allies = game.cfg.sub === 'allies';
    this.tmpBox = new THREE.Box3(); this.ray = new THREE.Ray(); this.v = new THREE.Vector3();
    this.tracers = [];
    for (let i = 0; i < 20; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff7a40, transparent: true, opacity: 0.8 }));
      l.visible = false; l.frustumCulled = false; game.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.tracerI = 0;
    if (!this.enabled) return;
    this.populate('enemy', DIFF[this.diff].enemies);
    if (this.allies) this.populate('ally', DIFF[this.diff].allies, saved.followers ?? 4);
  }

  // Garrisons for the side's forts, then roaming squads (and followers for allies).
  populate(faction, total, followers = 0) {
    const forts = this.game.forts ? this.game.forts.list.filter((f) => f.owner === faction) : [];
    let left = total;
    const per = forts.length ? Math.max(2, Math.min(faction === 'enemy' ? 6 : 3, Math.floor(total * (faction === 'enemy' ? 0.55 : 0.4) / forts.length))) : 0;
    for (const f of forts) {
      if (left < 2) break;
      const n = Math.min(per, left);
      this.garrison(f, faction, n);
      left -= n;
    }
    if (followers && left > 0) {
      const p = this.game.player.pos;
      const sq = this.newSquad(p);
      for (let i = 0; i < Math.min(followers, left); i++) {
        const s = this.add(faction, i === 0 ? 'gunner' : 'rifleman', p.x + (i % 2 ? 1.5 : -1.5), p.y, p.z + 2 + i * 0.8, sq, true);
        s.setRole('follow');
      }
      left -= Math.min(followers, left);
    }
    while (left > 0) {
      const size = Math.min(left, 3 + Math.floor(Math.random() * 3));
      this.spawnSquad(faction, size, true);
      left -= size;
    }
  }
  garrison(f, faction, n) {
    const sq = this.newSquad({ x: f.cx, z: f.cz });
    sq.fort = f;
    for (let i = 0; i < n; i++) {
      const post = f.posts[i % f.posts.length];
      const type = i === 0 ? 'officer' : i === 1 ? 'gunner' : i === 2 && faction === 'enemy' ? 'sniper' : 'rifleman';
      const s = this.add(faction, type, post.x, post.y, post.z, sq, true);
      s.setRole('garrison'); s.post = { fort: f, ...post };
    }
  }

  // ------------------------------------------------------------ spawning
  farSpot(minDist, faction = 'enemy') {
    const w = this.game.world, p = this.game.player.pos;
    for (let i = 0; i < 80; i++) {
      const x = 6 + Math.random() * (w.W - 12), z = 6 + Math.random() * (w.D - 12);
      if (Math.hypot(x - p.x, z - p.z) < minDist) continue;
      if (this.game.forts && this.game.forts.list.some((f) => Math.abs(f.cx - x) < 10 && Math.abs(f.cz - z) < 10)) continue;
      const y = w.surfaceY(Math.floor(x), Math.floor(z));
      if (y < SEA || w.get(Math.floor(x), y + 1, Math.floor(z)) === B.WATER) continue;
      if (this.ground(x, z, y + 1) == null) continue;
      return { x, y: y + 1, z };
    }
    return null;
  }
  newSquad(at) {
    const sq = { members: [], mode: 'patrol', wp: { x: at.x, z: at.z }, alert: null, alertT: 0, hunt: null, fort: null, tnt: 0 };
    this.squads.push(sq);
    return sq;
  }
  spawnSquad(faction, size, armed, near = null) {
    const at = near || this.farSpot(faction === 'enemy' ? 60 : 30, faction);
    if (!at) return null;
    const sq = this.newSquad(at);
    const types = [];
    if (Math.random() < 0.35) types.push('officer');
    if (Math.random() < 0.5) types.push('gunner');
    if (Math.random() < 0.3) types.push('sniper');
    if (Math.random() < 0.6) types.push('grenadier');
    while (types.length < size) types.push('rifleman');
    types.length = size;
    for (const type of types) {
      const x = at.x + (Math.random() - 0.5) * 6, z = at.z + (Math.random() - 0.5) * 6;
      const y = this.ground(x, z, at.y) ?? at.y;
      this.add(faction, type, x, y, z, sq, armed);
    }
    return sq;
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

  // ---------------------------------------------------------- hostility
  dmgScale() { return DMG[this.diff] || 1; }
  isNight() { const tod = this.game.time % 1; return tod < 0.22 || tod > 0.8; }
  hostiles(s) {
    const out = [];
    const g = this.game;
    if (s.faction === 'enemy' && !g.dead) out.push({ kind: 'player', pos: g.player.pos, ref: null });
    for (const o of this.list) if (o.alive && !o.surrender && o.faction !== s.faction) out.push({ kind: 'soldier', pos: o.pos, ref: o });
    if (s.faction === 'ally' && this.tank && this.tank.alive) out.push({ kind: 'tank', pos: this.tank.pos, ref: this.tank });
    return out;
  }
  // nearest hostile this soldier can actually see
  findTarget(s) {
    const g = this.game, pl = g.player;
    const night = this.isNight();
    const eye = new THREE.Vector3(s.pos.x, s.pos.y + 1.65, s.pos.z);
    const cands = this.hostiles(s).map((h) => ({ h, d: Math.hypot(h.pos.x - s.pos.x, h.pos.z - s.pos.z) }))
      .filter((c) => c.d < s.T.range + 20).sort((a, b) => a.d - b.d).slice(0, 4);
    for (const { h, d } of cands) {
      let sight = 75;
      if (h.kind === 'player') {
        if (night && !g.lightOn) sight = 22;
        if (pl.crouch && Math.hypot(pl.vel.x, pl.vel.z) < 0.5) sight *= 0.6;
      } else if (night) sight = 28;
      if (d > sight) continue;
      // unaware soldiers only look ahead; up close they hear footsteps (not sneaking)
      const footsteps = h.kind !== 'player' ? d < 5 : (d < 4 && !pl.crouch && Math.hypot(pl.vel.x, pl.vel.z) > 0.5);
      if (!s.alerted && !footsteps) {
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        if (((h.pos.x - s.pos.x) * fx + (h.pos.z - s.pos.z) * fz) / (d || 1) < 0.3) continue;
      }
      const tgt = h.kind === 'player' ? pl.eye() : new THREE.Vector3(h.pos.x, h.pos.y + (h.kind === 'tank' ? 1.4 : 1.5), h.pos.z);
      if (g.explosives.smokeBlocks(eye, tgt)) continue;
      const low = new THREE.Vector3(tgt.x, h.pos.y + 0.9, tgt.z);
      if (this.clearLine(eye, tgt, 'sight') || this.clearLine(eye, low, 'sight')) return h;
    }
    return null;
  }
  // kept for tests / older callers: can this soldier see the player?
  canSee(s) { const h = this.findTarget(s); return !!h && h.kind === 'player'; }
  clearLine(a, b, mode) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length(); dir.divideScalar(len);
    return !this.game.world.raycast(a.x, a.y, a.z, dir.x, dir.y, dir.z, len, false, mode);
  }
  hear(pos, radius, faction = 'enemy') {
    for (const sq of this.squads) {
      const m = sq.members.find((s) => s.alive && s.faction === faction && s.role === 'squad' && s.pos.distanceTo(pos) < radius);
      if (m) this.alertSquad(sq, pos);
    }
  }
  alertSquad(sq, pos) {
    sq.mode = sq.mode === 'assault' ? 'assault' : 'engage';
    sq.alert = pos.clone(); sq.alertT = 0;
    for (const m of sq.members) m.alerted = true;
  }

  // ------------------------------------------------------------- callouts
  callout(s, key, pos = null) {
    const g = this.game;
    if (!this.allies) { if (!s && ['doorDown', 'fortOurs'].includes(key)) g.hud.radio(t('call.hq'), t('call.' + key), 'ally'); return; }
    const now = performance.now() / 1000;
    if (now < this.callT || (this.callCd[key] || 0) > now) return;
    let who = s;
    if (!who) {
      const at = pos || g.player.pos;
      who = this.list.filter((o) => o.alive && o.faction === 'ally' && o.pos.distanceTo(at) < 40).sort((a, b) => a.pos.distanceTo(at) - b.pos.distanceTo(at))[0];
    }
    if (who && who.pos.distanceTo(g.player.pos) > 70) return;
    this.callT = now + 2.2; this.callCd[key] = now + (key.startsWith('ack') || key.startsWith('iron') || key.startsWith('item') ? 0 : 8);
    g.hud.radio(who ? who.name : t('call.hq'), t('call.' + key), ['grenade', 'tnt', 'manDown'].includes(key) ? 'warn' : 'ally');
  }

  // --------------------------------------------------------------- orders
  followers() { return this.list.filter((s) => s.alive && s.role === 'follow'); }
  order(s, cmd) {
    if (!s || !s.alive || s.faction !== 'ally') return;
    if (cmd === 'follow') {
      if (s.role !== 'follow' && this.followers().length >= 8) { this.game.hud.toast(t('order.full')); return; }
      this.detach(s); s.setRole('follow'); this.callout(s, 'ackFollow');
    } else if (cmd === 'hold') { this.detach(s); s.setRole('hold'); s.holdPos = s.pos.clone(); this.callout(s, 'ackHold'); }
    else if (cmd === 'defend') { this.detach(s); s.setRole('defend'); s.post = null; this.callout(s, 'ackDefend'); }
  }
  orderAll(cmd) {
    const p = this.game.player.pos;
    let group = this.followers();
    if (cmd === 'follow') {
      group = this.list.filter((s) => s.alive && s.faction === 'ally' && s.role !== 'garrison' && s.pos.distanceTo(p) < 30)
        .sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p));
    }
    let n = 0;
    for (const s of group) {
      if (cmd === 'follow' && this.followers().length >= 8 && s.role !== 'follow') break;
      this.order(s, cmd); n++;
    }
    return n;
  }
  detach(s) {
    if (s.squad && s.role !== 'follow') {
      s.squad.members = s.squad.members.filter((m) => m !== s);
      s.squad = this.newSquad(s.pos);
      s.squad.members.push(s);
    }
    s.post = null;
  }
  // allies decide whether they can spare iron (they keep some to craft their own weapon)
  askIron(s) {
    const keep = s.armed ? 1 : 3;
    const spare = Math.max(0, s.iron - keep);
    if (spare > 0) { s.iron -= spare; this.game.give('iron', spare); this.callout(s, 'ironYes'); return spare; }
    this.callout(s, 'ironNo'); return 0;
  }
  // ask for one of the soldier's items; he no longer has it afterwards
  askItem(s, item) {
    const g = this.game;
    if (item === 'grenade' && s.grenades > 0) { g.give('grenade', s.grenades); s.grenades = 0; this.callout(s, 'itemYes'); return true; }
    if (item === 'knife' && s.hasKnife) { s.hasKnife = false; g.give('knife', 1); if (!s.weapon) s.arm(null); this.callout(s, 'itemYes'); return true; }
    if (item === 'rifle' && s.weapon && ['rifle', 'sniper', 'smg', 'pistol'].includes(s.weapon)) {
      const w = s.weapon; g.give(w, 1); s.arm(null); s.craft = null; this.callout(s, 'itemYes'); return w;
    }
    this.callout(s, 'itemNo'); return false;
  }

  // -------------------------------------------------------------- routing
  // Units move between the inside and outside of forts only through the door.
  fortXZ(x, z) {
    const F = this.game.forts;
    if (!F) return null;
    return F.list.find((f) => Math.abs(x - (f.cx + 0.5)) <= 5.6 && Math.abs(z - (f.cz + 0.5)) <= 5.6) || null;
  }
  route(s, gx, gz) {
    const inS = this.fortXZ(s.pos.x, s.pos.z), inG = this.fortXZ(gx, gz);
    if (inS === inG) { s.routing = null; return { x: gx, z: gz }; }
    if (inS) {
      if (s.routing !== 'out' && Math.hypot(s.pos.x - inS.doorIn.x, s.pos.z - inS.doorIn.z) < 1.3) s.routing = 'out';
      return s.routing === 'out' ? inS.doorOut : inS.doorIn;
    }
    if (s.routing !== 'in' && Math.hypot(s.pos.x - inG.doorOut.x, s.pos.z - inG.doorOut.z) < 1.3) s.routing = 'in';
    return s.routing === 'in' ? inG.doorIn : inG.doorOut;
  }
  goTo(s, gx, gz, speed, dt) {
    const r = this.route(s, gx, gz);
    return this.moveToward(s, r.x, r.z, speed, dt);
  }

  // -------------------------------------------------------------- update
  update(dt) {
    if (!this.enabled) return;
    const g = this.game;
    const night = this.isNight();
    this.huntT -= dt;
    if (this.huntT <= 0) {
      this.huntT = 40;
      const chance = night ? HUNT[this.diff] : DAY_HUNT[this.diff];
      const allyForts = g.forts ? g.forts.list.filter((f) => f.owner === 'ally') : [];
      const enemyForts = g.forts ? g.forts.list.filter((f) => f.owner === 'enemy') : [];
      for (const sq of this.squads) {
        const lead = sq.members.find((m) => m.alive);
        if (!lead || lead.faction !== 'enemy' || lead.role !== 'squad' || sq.mode !== 'patrol') continue;
        // with no forts left the enemy regroups and counterattacks
        const c = enemyForts.length === 0 ? 0.6 : chance;
        if (Math.random() > c) continue;
        if (allyForts.length && Math.random() < (enemyForts.length === 0 ? 0.8 : 0.4)) {
          sq.mode = 'assault';
          sq.fort = allyForts.sort((a, b) => Math.hypot(a.cx - lead.pos.x, a.cz - lead.pos.z) - Math.hypot(b.cx - lead.pos.x, b.cz - lead.pos.z))[0];
          sq.tnt = 3;
        } else {
          sq.mode = 'hunt';
          sq.hunt = { x: g.player.pos.x + (Math.random() - 0.5) * 30, z: g.player.pos.z + (Math.random() - 0.5) * 30 };
        }
      }
    }
    for (const sq of this.squads) {
      sq.members = sq.members.filter((m) => this.list.includes(m));
      if (sq.mode === 'engage') {
        sq.alertT += dt;
        if (sq.alertT > 30) { sq.mode = 'patrol'; for (const m of sq.members) m.alerted = false; }
      }
      if (sq.mode === 'assault' && (!sq.fort || sq.fort.owner === 'enemy')) { sq.mode = 'patrol'; sq.fort = null; }
      const lead = sq.members.find((m) => m.alive && m.armed && m.role === 'squad');
      if (lead && sq.mode === 'patrol' && Math.hypot(lead.pos.x - sq.wp.x, lead.pos.z - sq.wp.z) < 3) {
        const w = g.world;
        let nx = lead.pos.x + (Math.random() - 0.5) * 120, nz = lead.pos.z + (Math.random() - 0.5) * 120;
        // allied squads patrol between their own forts
        if (lead.faction === 'ally' && g.forts) {
          const own = g.forts.list.filter((f) => f.owner === 'ally');
          if (own.length && Math.random() < 0.7) { const f = own[Math.floor(Math.random() * own.length)]; nx = f.doorOut.x + (Math.random() - 0.5) * 20; nz = f.doorOut.z + (Math.random() - 0.5) * 20; }
        }
        sq.wp = { x: Math.max(8, Math.min(w.W - 8, nx)), z: Math.max(8, Math.min(w.D - 8, nz)) };
      }
      if (lead && sq.mode === 'hunt' && sq.hunt && Math.hypot(lead.pos.x - sq.hunt.x, lead.pos.z - sq.hunt.z) < 4) {
        sq.hunt = { x: g.player.pos.x + (Math.random() - 0.5) * 24, z: g.player.pos.z + (Math.random() - 0.5) * 24 };
      }
    }
    this.squads = this.squads.filter((sq) => sq.members.length);
    // incoming enemy grenades: allies shout a warning
    for (const p of g.explosives.projectiles) {
      if (p.owner !== 'enemy' || p.kind !== 'grenade' || p.called) continue;
      const near = this.list.find((s) => s.alive && s.faction === 'ally' && s.pos.distanceTo(p.pos) < 8);
      if (near) { p.called = true; this.callout(near, 'grenade'); }
    }
    for (const s of this.list.slice()) this.updateSoldier(s, dt);
    // the fallen return elsewhere, unarmed (they must loot or craft); allies leave the player's squad
    for (const p of this.pending) p.t -= dt;
    for (const p of this.pending.filter((q) => q.t <= 0)) {
      const at = this.farSpot(p.faction === 'enemy' ? 70 : 40, p.faction);
      if (!at) continue;
      this.pending.splice(this.pending.indexOf(p), 1);
      let sq = this.squads.filter((q) => !q.fort && q.members.length < 5 && q.members[0] && q.members[0].faction === p.faction && q.members[0].role === 'squad')
        .sort((a, b) => Math.hypot(a.wp.x - at.x, a.wp.z - at.z) - Math.hypot(b.wp.x - at.x, b.wp.z - at.z))[0];
      if (!sq) sq = this.newSquad(at);
      this.add(p.faction, p.type, at.x, at.y, at.z, sq, false);
    }
    for (const f of this.fires) { f.t -= dt; if (f.t <= 0 && g.world.get(f.x, f.y, f.z) === B.CAMPFIRE) g.world.set(f.x, f.y, f.z, B.AIR); }
    this.fires = this.fires.filter((f) => f.t > 0);
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
    if (s.surrender) { this.updateSurrender(s, dt); return; }
    const pdx = pl.pos.x - s.pos.x, pdz = pl.pos.z - s.pos.z;
    const pdist = Math.hypot(pdx, pdz);
    const far = pdist > 140 && s.role !== 'follow';
    // senses (staggered)
    s.senseT -= dt;
    if (s.senseT <= 0 && !far) {
      s.senseT = 0.35;
      const had = !!s.target;
      s.target = (s.armed || pdist < 20) ? this.findTarget(s) : null;
      s.sees = !!s.target;
      if (s.target) {
        s.alerted = true;
        if (s.role === 'squad') this.alertSquad(s.squad, s.target.pos);
        if (!had && s.faction === 'ally') this.callout(s, s.target.kind === 'tank' ? 'tankSpotted' : 'enemySpotted');
      }
    } else if (far) { s.sees = false; s.target = null; }
    // barbed wire slows everyone; it cuts enemies
    const wire = [0.2, 1.0].some((h) => g.world.get(Math.floor(s.pos.x), Math.floor(s.pos.y + h), Math.floor(s.pos.z)) === B.WIRE);
    if (wire && s.faction === 'enemy') { s.hp -= 5 * dt; if (s.hp <= 0) { this.kill(s, 'wire'); return; } }
    const slow = wire ? 0.35 : 1;
    const nade = g.explosives.projectiles.find((p) => p.kind === 'grenade' && p.owner !== s.faction && (p.owner === 'player' ? s.faction === 'enemy' : true) && p.pos.distanceTo(s.pos) < 5);
    if (nade && !s.raft) { s.fleeT = 2; s.fleeFrom = nade.pos.clone(); }
    s.cool -= dt; s.gcool -= dt;
    // riding a raft with the player
    if (s.raft) { this.rideRaft(s, dt); if (s.raft) { this.combat(s, dt); this.animate(s, dt, s.sees); return; } }
    let goal = null, speed = 0, face = null;
    const tgt = s.target;
    const tdist = tgt ? Math.hypot(tgt.pos.x - s.pos.x, tgt.pos.z - s.pos.z) : 0;
    if (s.fleeT > 0) {
      s.fleeT -= dt;
      const fx = s.pos.x - s.fleeFrom.x, fz = s.pos.z - s.fleeFrom.z, fl = Math.hypot(fx, fz) || 1;
      goal = { x: s.pos.x + fx / fl * 5, z: s.pos.z + fz / fl * 5 }; speed = 5;
    } else if (!s.armed && s.role !== 'follow') {
      this.unarmedBehaviour(s, dt, pdist);
      return;
    } else if (s.role === 'garrison' && s.post) {
      // hold the post; engage from there
      const d = Math.hypot(s.pos.x - s.post.x, s.pos.z - s.post.z);
      if (s.post.y > s.post.fort.base + 1 && d < 2.6 && s.pos.y < s.post.y - 1) s.pos.set(s.post.x, s.post.y, s.post.z); // up the ladder
      if (d > 0.8) { goal = s.post; speed = tgt ? 3.6 : 2.2; }
      if (tgt) face = tgt.pos;
    } else if (s.role === 'follow') {
      const i = this.followers().indexOf(s);
      const back = 2.6 + Math.floor(i / 2) * 1.6, side = (i % 2 ? 1 : -1) * 1.6;
      const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
      const fpos = { x: pl.pos.x - fx * back + (-fz) * side, z: pl.pos.z - fz * back + fx * side };
      const dp = Math.hypot(s.pos.x - fpos.x, s.pos.z - fpos.z);
      if (pl.raft && pl.raft.box && pl.raft.t !== undefined && pdist < 7) this.boardRaft(s, pl.raft);
      if (tgt && pdist < 14 && tdist < s.T.range) { face = tgt.pos; if (dp > 6) { goal = fpos; speed = 5; } }
      else if (dp > 1.2) { goal = fpos; speed = pdist > 10 ? 6 : dp > 4 ? 4.5 : 2.6; }
      if (pdist > 60) { const at = this.ground(fpos.x, fpos.z, pl.pos.y + 1); if (at != null) s.pos.set(fpos.x, at, fpos.z); }
    } else if (s.role === 'hold') {
      if (s.holdPos && Math.hypot(s.pos.x - s.holdPos.x, s.pos.z - s.holdPos.z) > 1) { goal = s.holdPos; speed = 3; }
      if (tgt) face = tgt.pos;
    } else if (s.role === 'defend') {
      const f = g.forts && g.forts.nearest(s.pos, s.faction);
      if (!f) { s.setRole('squad'); }
      else if (g.forts.inside(f, s.pos)) {
        const used = new Set(this.list.filter((o) => o.post && o.post.fort === f).map((o) => o.post.x + ',' + o.post.z));
        const post = f.posts.find((q) => !used.has(q.x + ',' + q.z)) || f.posts[f.posts.length - 1];
        s.setRole('garrison'); s.post = { fort: f, ...post };
      } else { goal = f.doorIn; speed = 4.2; }
      if (tgt) face = tgt.pos;
    } else if (tgt) {
      face = tgt.pos;
      const pref = s.T.pref;
      if (tdist > pref + 6) { goal = { x: tgt.pos.x, z: tgt.pos.z }; speed = 4.6; }
      else if (tdist < pref - 8 && s.type !== 'commander') { goal = { x: s.pos.x - (tgt.pos.x - s.pos.x) / tdist * 4, z: s.pos.z - (tgt.pos.z - s.pos.z) / tdist * 4 }; speed = 3; }
      else if (s.type !== 'sniper') {
        s.strafeT -= dt;
        if (s.strafeT <= 0) { s.strafeT = 1.5 + Math.random() * 2.5; s.strafe = Math.random() < 0.5 ? -1 : 1; }
        const nx = -(tgt.pos.z - s.pos.z) / tdist, nz = (tgt.pos.x - s.pos.x) / tdist;
        goal = { x: s.pos.x + nx * s.strafe * 3, z: s.pos.z + nz * s.strafe * 3 }; speed = 1.6;
      }
    } else {
      const sq = s.squad;
      const i = sq.members.indexOf(s);
      if (sq.mode === 'assault' && sq.fort) {
        const f = sq.fort;
        if (!f.blown && !f.doorOpen) {
          const dd = Math.hypot(s.pos.x - f.doorOut.x, s.pos.z - f.doorOut.z);
          goal = { x: f.doorOut.x + (i % 3 - 1) * 2.5, z: f.doorOut.z + Math.floor(i / 3) * 2 }; speed = 4;
          if (dd < 4 && sq.tnt > 0 && !g.explosives.litNear(new THREE.Vector3(f.doorCenter.x, f.base, f.doorCenter.z), 4)) this.plantAtDoor(s, f);
        } else { goal = { x: f.cx + 0.5 + (i % 3 - 1) * 2, z: f.cz + 0.5 + (Math.floor(i / 3) - 1) * 2 }; speed = 4.4; }
      } else if (sq.mode === 'engage' && sq.alert) {
        goal = { x: sq.alert.x, z: sq.alert.z }; speed = 4.2;
        face = goal;
        if (s.tnt > 0 && pdist < 18 && s.faction === 'enemy' && (s.stuckT > 1.2 || Math.hypot(s.pos.x - sq.alert.x, s.pos.z - sq.alert.z) < 3)) this.plantTNT(s);
        if (Math.hypot(s.pos.x - sq.alert.x, s.pos.z - sq.alert.z) < 2.5) sq.alert = null;
      } else if (sq.mode === 'hunt' && sq.hunt) {
        goal = { x: sq.hunt.x + (i % 3 - 1) * 3, z: sq.hunt.z + Math.floor(i / 3) * 3 }; speed = 3.6;
      } else {
        goal = { x: sq.wp.x + (i % 3 - 1) * 2.5, z: sq.wp.z + Math.floor(i / 3) * 2.5 }; speed = 2.4;
      }
    }
    if (goal && speed > 0) this.goTo(s, goal.x, goal.z, speed * slow, dt);
    else { s.speed = 0; this.settle(s, dt); }
    if (face) s.yaw = this.turn(s.yaw, Math.atan2(-(face.x - s.pos.x), -(face.z - s.pos.z)), dt * 8);
    this.combat(s, dt);
    this.animate(s, dt, s.sees);
  }

  combat(s, dt) {
    const tgt = s.target;
    if (!tgt || !s.armed) return;
    if (s.raft) s.yaw = this.turn(s.yaw, Math.atan2(-(tgt.pos.x - s.pos.x), -(tgt.pos.z - s.pos.z)), dt * 8);
    const d = Math.hypot(tgt.pos.x - s.pos.x, tgt.pos.z - s.pos.z);
    this.tryFire(s, dt, d);
    if (s.grenades > 0 && s.gcool <= 0 && d > 8 && d < 30 && !s.raft && (s.faction === 'enemy' || Math.random() < 0.3)) this.throwGrenade(s, tgt.pos);
    if (d < 1.9 && s.cool <= 0 && tgt.pos.y - s.pos.y < 1.5) { s.cool = 1.2; sfx.swish(); this.hitTarget(s, tgt, 16); }
  }
  hitTarget(s, tgt, dmg) {
    const g = this.game;
    if (tgt.kind === 'player') g.damage(dmg * DMG[this.diff], 'combat', s.pos);
    else if (tgt.kind === 'soldier') this.hurt(tgt.ref, dmg, { by: s.faction });
    else if (tgt.kind === 'tank') tgt.ref.hurt(dmg, false);
  }

  unarmedBehaviour(s, dt, dist) {
    const g = this.game;
    const loot = g.pickups.list.find((it) => ['rifle', 'smg', 'pistol', 'sniper'].includes(it.id) && it.pos.distanceTo(s.pos) < 30);
    if (loot) {
      this.goTo(s, loot.pos.x, loot.pos.z, 4, dt);
      if (Math.hypot(loot.pos.x - s.pos.x, loot.pos.z - s.pos.z) < 1.3) { s.arm(loot.id); g.pickups.removeItem(loot); }
    } else if (!s.craft) {
      const x = Math.floor(s.pos.x + 1), z = Math.floor(s.pos.z), y = Math.floor(s.pos.y);
      if (g.world.get(x, y, z) === B.AIR && SOLID[g.world.get(x, y - 1, z)] && dist > 25 && !this.fortXZ(x, z)) {
        g.world.set(x, y, z, B.CAMPFIRE);
        this.fires.push({ x, y, z, t: 90 });
      }
      s.craft = { t: 22 + Math.random() * 10 };
      s.speed = 0;
    } else {
      s.craft.t -= dt; s.speed = 0; this.settle(s, dt);
      if (s.craft.t <= 0) { s.arm(s.T.weapon); s.grenades = s.T.grenades || 0; s.tnt = s.T.tnt || 0; s.craft = null; }
    }
    if (s.target && s.target.kind !== 'tank' && Math.hypot(s.target.pos.x - s.pos.x, s.target.pos.z - s.pos.z) < 1.9 && s.cool <= 0 && s.hasKnife) {
      s.cool = 1.2; sfx.swish(); this.hitTarget(s, s.target, 12);
    }
    this.animate(s, dt, false);
  }

  // ------------------------------------------------------------ surrender
  surrender(s, f) {
    if (s.surrender || !s.alive) return;
    s.surrender = true; s.surrenderFort = f; s.target = null; s.sees = false;
    s.arm(null); s.post = null; s.role = 'squad';
    if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
  }
  updateSurrender(s, dt) {
    const f = s.surrenderFort;
    s.parts.arms.forEach((a) => { a.rotation.x = -Math.PI + 0.2; a.rotation.z = 0; });
    let goal;
    if (f && this.fortXZ(s.pos.x, s.pos.z) === f) goal = f.doorIn;
    if (f && goal && Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 1.2) {
      if (f.doorOpen) goal = f.doorOut; else { this.vanish(s); return; }
    }
    if (!goal && f) { goal = { x: f.doorOut.x + (f.doorOut.x - f.doorIn.x) * 2, z: f.doorOut.z + (f.doorOut.z - f.doorIn.z) * 2 }; }
    if (!f || Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 1.2 || (s.surT = (s.surT || 0) + dt) > 25) { this.vanish(s); return; }
    this.moveToward(s, goal.x, goal.z, 2.4, dt);
    s.parts.g.position.copy(s.pos); s.parts.g.rotation.y = s.yaw;
    s.phase += dt * s.speed * 3.2;
    const sw = s.speed > 0 ? Math.sin(s.phase) * 0.6 : 0;
    s.parts.legs[0].rotation.x = sw; s.parts.legs[1].rotation.x = -sw;
  }
  vanish(s) {
    this.pending.push({ type: s.type === 'commander' ? 'officer' : s.type, faction: s.faction, t: 30 + Math.random() * 30 });
    this.remove(s);
  }

  // ------------------------------------------------------------- rafts
  boardRaft(s, raft) {
    const taken = new Set(this.list.filter((o) => o.raft === raft).map((o) => o.seat));
    const seat = [0, 1, 2, 3].find((i) => !taken.has(i));
    if (seat == null) return;
    s.raft = raft; s.seat = seat;
  }
  rideRaft(s, dt) {
    const g = this.game, raft = s.raft;
    if (!g.rafts.includes(raft)) { s.raft = null; return; }
    const pl = g.player;
    if (pl.raft !== raft && !g.player.swimming && Math.hypot(pl.pos.x - raft.x, pl.pos.z - raft.z) > 2.5) {
      // the player stepped ashore: hop off next to them
      const gy = this.ground(pl.pos.x + (Math.random() - 0.5) * 2, pl.pos.z + (Math.random() - 0.5) * 2, pl.pos.y + 1);
      if (gy != null) { s.pos.set(pl.pos.x + (Math.random() - 0.5) * 2, gy, pl.pos.z + (Math.random() - 0.5) * 2); s.raft = null; return; }
    }
    const [ox, oz] = SEATS[s.seat];
    s.pos.set(raft.x + ox, SEA + 0.18, raft.z + oz);
    s.speed = 0;
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
    const dist = Math.hypot(s.pos.x - this.game.player.pos.x, s.pos.z - this.game.player.pos.z);
    s.parts.g.visible = dist < (this.game.settings.renderDist + 1) * 16;
    if (s.mark) s.mark.visible = dist < 70 && dist > 2;
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
    if (s.faction === 'ally' && s.T.burst > 1 && Math.random() < 0.25) { s.cool += 1.5; this.callout(s, 'reloading'); }
    s.burstLeft = (s.T.burst || 1) - 1; s.burstT = s.T.burstGap || 0.1;
    this.shoot(s, dist);
  }
  shoot(s, dist) {
    const g = this.game, pl = g.player, tgt = s.target;
    if (!tgt) return;
    const muzzle = new THREE.Vector3(s.pos.x - Math.sin(s.yaw) * 0.6, s.pos.y + 1.45, s.pos.z - Math.cos(s.yaw) * 0.6);
    const target = tgt.kind === 'player' ? new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.crouch ? 0.9 : 1.2), pl.pos.z)
      : new THREE.Vector3(tgt.pos.x, tgt.pos.y + (tgt.kind === 'tank' ? 1.2 : 1.2), tgt.pos.z);
    const acc = s.faction === 'ally' ? ALLY_ACC[this.diff] : ACC[this.diff];
    let p = acc * (s.T.acc || 1) * Math.max(0.2, Math.min(1, 1.15 - dist / s.T.range));
    if (tgt.kind === 'player') {
      if (Math.hypot(pl.vel.x, pl.vel.z) > 3) p *= 0.7;
      if (pl.crouch) p *= 0.8;
      if (this.isNight() && !g.lightOn) p *= 0.6;
    } else if (this.isNight()) p *= 0.75;
    if (tgt.kind === 'tank') p = 0.9;
    let end;
    const dir = new THREE.Vector3().subVectors(target, muzzle).normalize();
    const block = g.world.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, muzzle.distanceTo(target), true, 'bullet');
    if (block) {
      end = muzzle.clone().addScaledVector(dir, block.dist);
      if (block.id === B.TNT) g.explosives.shootTNT(block.x, block.y, block.z);
    } else if (Math.random() < p) {
      end = target;
      if (tgt.kind === 'player') g.damage(s.T.dmg * DMG[this.diff], 'combat', s.pos);
      else if (tgt.kind === 'soldier') this.hurt(tgt.ref, s.T.dmg * (s.faction === 'enemy' ? DMG[this.diff] : 1.6), { by: s.faction });
      else tgt.ref.hurt(s.T.dmg * 1.6, false);
    } else {
      end = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.3) * 2, (Math.random() - 0.5) * 3));
      if (tgt.kind === 'player' && dist < 40 && Math.random() < 0.4) sfx.ricochet();
    }
    this.tracer(muzzle, end, FACTIONS[s.faction].tracer);
    sfx.shot(s.T.sound, Math.max(0, 1 - g.camera.position.distanceTo(muzzle) / 110) * 0.8);
    g.animals.noise(s.pos, 35);
    if (s.faction === 'ally') this.hear(s.pos, 50, 'enemy');
  }
  tracer(a, b, color) {
    const tr = this.tracers[this.tracerI++ % this.tracers.length];
    const pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, b.x, b.y, b.z); pos.needsUpdate = true;
    tr.l.geometry.computeBoundingSphere();
    tr.l.material.color.setHex(color);
    tr.l.visible = true; tr.t = 0.08;
  }
  throwGrenade(s, at) {
    const g = this.game;
    s.grenades--; s.gcool = 9 + Math.random() * 4;
    const from = new THREE.Vector3(s.pos.x, s.pos.y + 1.6, s.pos.z);
    const to = new THREE.Vector3(at.x + (Math.random() - 0.5) * 3, at.y + 0.3, at.z + (Math.random() - 0.5) * 3);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const T = Math.max(0.7, Math.min(1.8, d / 13));
    const vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y + 0.5 * 20 * T * T) / T, (to.z - from.z) / T);
    g.explosives.throw('grenade', from, vel, s.faction);
    s.parts.arms[1].rotation.x = -2.5;
  }
  plantTNT(s) {
    const g = this.game, w = g.world;
    const eye = new THREE.Vector3(s.pos.x, s.pos.y + 0.5, s.pos.z);
    const tgt = new THREE.Vector3(g.player.pos.x, g.player.pos.y + 0.5, g.player.pos.z);
    const dir = new THREE.Vector3().subVectors(tgt, eye); const len = dir.length(); dir.normalize();
    const hit = w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, Math.min(len, 3.5), false, 'bullet');
    if (!hit || w.isLocked(hit.x, hit.y, hit.z)) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (w.get(x, y, z) !== B.AIR || !SOLID[w.get(x, y - 1, z)]) return;
    w.set(x, y, z, B.TNT);
    g.explosives.igniteTNT(x, y, z, 11, 'enemy');
    s.tnt--;
    s.fleeT = 7; s.fleeFrom = new THREE.Vector3(x, y, z);
  }
  // sappers set a charge right outside a fort's door (3 are needed)
  plantAtDoor(s, f) {
    const g = this.game, w = g.world;
    const ox = Math.sign(Math.round(f.doorOut.x - f.doorIn.x)), oz = Math.sign(Math.round(f.doorOut.z - f.doorIn.z));
    const [cx, cy, cz] = f.doorCells[Math.floor(Math.random() * 2) * 3];
    const x = cx + ox, y = cy, z = cz + oz;
    if (w.get(x, y, z) !== B.AIR) return;
    w.set(x, y, z, B.TNT);
    g.explosives.igniteTNT(x, y, z, 8, 'enemy');
    s.squad.tnt--;
    for (const m of s.squad.members) { m.fleeT = 6; m.fleeFrom = new THREE.Vector3(x, y, z); }
  }

  // Player shots: nearest ENEMY soldier (or the tank). Allies are never hit.
  raycast(origin, dir, maxDist, faction = 'enemy') {
    this.ray.set(origin, dir);
    let best = null, bd = maxDist;
    for (const s of this.list) {
      if (!s.alive || s.faction !== faction) continue;
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
    if (faction === 'enemy' && this.tank && this.tank.alive) {
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
  hurt(s, dmg, { silent = false, head = false, by = 'player' } = {}) {
    if (!s.alive) return false;
    const unaware = !s.alerted && !s.sees;
    if (silent && unaware) dmg *= 4;
    if (head) dmg *= 2.5;
    s.hp -= dmg;
    const g = this.game;
    const col = g.settings.blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3];
    g.particles.burst(s.pos.x, s.pos.y + (head ? 1.65 : 1.2), s.pos.z, col, g.settings.blood ? 6 : 4, 1.2, 0.6, 14);
    if (s.hp <= 0) { this.kill(s, by, silent && unaware); return true; }
    if (s.role === 'squad') this.alertSquad(s.squad, by === 'player' ? g.player.pos : s.pos);
    s.alerted = true;
    s.cool = Math.min(s.cool, 0.6);
    return false;
  }
  kill(s, by, silent = false) {
    s.alive = false; s.deadT = 0; s.speed = 0; s.raft = null;
    s.parts.arms.forEach((a) => { a.rotation.x = 0; });
    if (s.mark) s.mark.visible = false;
    const g = this.game;
    if (by === 'player' && s.faction === 'enemy') { g.stats.enemies = (g.stats.enemies || 0) + 1; g.hud.killNote(); }
    if (s.faction === 'ally') this.callout(null, 'manDown', s.pos);
    if (!silent && s.role === 'squad' && s.squad) this.alertSquad(s.squad, g.player.pos);
    if (s.post && s.type === 'officer') s.post.fort.officerDead = true;
    this.pending.push({ type: s.type === 'commander' ? 'officer' : s.type, faction: s.faction, t: 25 + Math.random() * 20 });
  }
  blast(center, reach, falloff) {
    for (const s of this.list) {
      if (!s.alive) continue;
      const d = this.v.set(s.pos.x, s.pos.y + 0.9, s.pos.z).distanceTo(center);
      if (d < reach) this.hurt(s, falloff(d), { by: 'blast' });
    }
    if (this.tank && this.tank.alive) {
      const d = this.tank.pos.distanceTo(center);
      if (d < reach + 1.5) this.tank.hurt(falloff(Math.max(0, d - 1.5)), true);
    }
  }
  grenadeAt() {}

  // A fort changed hands: attackers inside become its new garrison.
  fortChanged(f, prev, owner) {
    const F = this.game.forts;
    let i = 0;
    for (const s of this.list) {
      if (s.post && s.post.fort === f && s.faction !== owner) { s.post = null; s.setRole('squad'); }
      if (!s.alive || s.faction !== owner || s.role === 'follow' || !F.inside(f, s.pos)) continue;
      const post = f.posts[(6 + i++) % f.posts.length];
      this.detach(s); s.setRole('garrison'); s.post = { fort: f, ...post };
    }
  }

  // Defeated enemies drop everything they carried.
  dropLoot(s) {
    if (s.faction !== 'enemy') return;
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
    if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
  }

  spawnTank() {
    const at = this.farSpot(90);
    if (!at) return;
    this.tank = new Tank(this, at.x, at.y, at.z);
    this.game.hud.toast(t('hud.tankSpotted'), 'warn');
  }

  // Player died: enemies lose track. In Play with Allies, if the player has no
  // forts left they respawn with 4-5 allies around them.
  playerDied() {
    for (const sq of this.squads) {
      if (sq.mode === 'engage' || sq.mode === 'hunt') { sq.mode = 'patrol'; sq.alert = null; for (const m of sq.members) m.alerted = false; }
    }
    for (const s of this.list) if (s.target && s.target.kind === 'player') s.target = null;
  }
  rallyAround(pos, n) {
    const allies = this.list.filter((s) => s.alive && s.faction === 'ally' && s.role !== 'garrison' && !s.surrender)
      .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos));
    let k = 0;
    for (const s of allies) {
      if (k >= n) break;
      const x = pos.x + (Math.random() - 0.5) * 4, z = pos.z + (Math.random() - 0.5) * 4;
      const y = this.ground(x, z, pos.y + 1);
      if (y == null) continue;
      s.pos.set(x, y, z); s.raft = null; this.detach(s); s.setRole('follow'); k++;
    }
    const sq = this.newSquad(pos);
    while (k < n) { // not enough allies alive: some come back early
      const s = this.add('ally', k === 0 ? 'gunner' : 'rifleman', pos.x + (Math.random() - 0.5) * 3, pos.y, pos.z + (Math.random() - 0.5) * 3, sq, true);
      s.setRole('follow');
      const pi = this.pending.findIndex((q) => q.faction === 'ally');
      if (pi >= 0) this.pending.splice(pi, 1);
      k++;
    }
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
