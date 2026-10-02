// Soldiers of the fictional enemy army and the player's allies.
// Original uniforms and insignia; no real-world flags or emblems.
//
// Nobody wanders aimlessly. Every soldier is either part of a fort garrison
// or of a squad with a purpose: squads of 5-6 leave their forts to attack the
// other side's forts (or, in Play Alone, besiege the cabin). The defeated come
// back near one of their own forts and walk home, so head counts stay
// constant. Only a side that has lost every fort scatters, regroups, crafts
// weapons and counterattacks.
import * as THREE from 'three';
import { DIFF, SEA } from './config.js';
import { B, SOLID } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';
import { Character, FACTIONS } from './characters.js';

export { FACTIONS };

export const SOLDIER_TYPES = {
  rifleman:  { hp: 100, weapon: 'rifle', range: 60, pref: 24, dmg: 14, rate: 1.8, burst: 1, mag: 5, reload: 2.2, sound: 'rifle' },
  grenadier: { hp: 100, weapon: 'pistol', range: 35, pref: 16, dmg: 9, rate: 1.0, burst: 1, mag: 8, reload: 1.6, grenades: 3, tnt: 1, sound: 'pistol' },
  gunner:    { hp: 130, weapon: 'smg', range: 50, pref: 26, dmg: 6, rate: 2.8, burst: 6, burstGap: 0.11, mag: 30, reload: 2.6, sound: 'smg', acc: 0.6 },
  sniper:    { hp: 90, weapon: 'sniper', range: 110, pref: 60, dmg: 38, rate: 4.8, burst: 1, mag: 5, reload: 2.4, acc: 1.7, sound: 'sniper' },
  officer:   { hp: 120, weapon: 'pistol', range: 35, pref: 20, dmg: 9, rate: 1.1, burst: 1, mag: 8, reload: 1.6, sound: 'pistol' },
  commander: { hp: 220, weapon: 'smg', range: 45, pref: 14, dmg: 7, rate: 1.9, burst: 5, burstGap: 0.1, mag: 30, reload: 2.6, grenades: 4, sound: 'smg', acc: 0.8 },
};
const ACC = { beginner: 0.16, easy: 0.24, medium: 0.32, hard: 0.42, impossible: 0.52 };
const DMG = { beginner: 0.55, easy: 0.75, medium: 1, hard: 1.2, impossible: 1.4 };
const TANK_CHANCE = { beginner: 0.04, easy: 0.07, medium: 0.1, hard: 0.15, impossible: 0.22 };
// attack squads: seconds between departures (at night), size, how many at once
const DISPATCH = { beginner: 270, easy: 200, medium: 150, hard: 110, impossible: 80 };
const SQUAD_SIZE = { beginner: [4, 4], easy: [4, 5], medium: [5, 6], hard: [5, 6], impossible: [6, 7] };
const MAX_SQUADS = { beginner: 1, easy: 1, medium: 2, hard: 2, impossible: 3 };
// patrols kept outside at all times (per side), and their size
const PATROLS = { beginner: 1, easy: 2, medium: 2, hard: 3, impossible: 3 };
const PATROL_SIZE = { beginner: [3, 4], easy: [4, 4], medium: [4, 5], hard: [5, 6], impossible: [5, 6] };
const GUARDS = { beginner: 2, easy: 2, medium: 2, hard: 3, impossible: 3 };   // never leave their fort
// roles that belong to the player's own squad
export const PSQ = new Set(['follow', 'hold', 'defend', 'cover', 'advance', 'attack']);
export const FORMATIONS = ['loose', 'line', 'column'];

const MATS = {};
const mat = (c) => MATS[c] || (MATS[c] = new THREE.MeshLambertMaterial({ color: c }));
function bx(w, h, d, c, x, y, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); return m; }

// ---------------------------------------------------------------------------
const ALLY_ACC = { beginner: 0.42, easy: 0.38, medium: 0.34, hard: 0.3, impossible: 0.27 };
const NAMES = ['Alder', 'Brandt', 'Corley', 'Dace', 'Ellery', 'Finch', 'Garrow', 'Hale', 'Ivers', 'Joss', 'Keane', 'Lark',
  'Moss', 'Nolan', 'Orme', 'Pike', 'Quill', 'Rook', 'Sorrel', 'Tolley', 'Vance', 'Wren', 'Yarrow', 'Zeller'];
const RANKS = { rifleman: 'Pvt.', grenadier: 'Pvt.', gunner: 'Cpl.', sniper: 'Cpl.', officer: 'Lt.', commander: 'Cpt.' };
const SEATS = [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]];

// Order markers over allies' heads (one small icon per order).
export const ORDER_COLORS = { follow: '#a8dcff', hold: '#ffd060', defend: '#7ad07a', cover: '#c8a0ff', advance: '#ffa050', attack: '#ff6a5a', squad: '#4a96e8', garrison: '#4a96e8', rejoin: '#4a96e8', scatter: '#4a96e8' };
const markerTex = {};
function marker(kind, selected) {
  const key = kind + (selected ? '*' : '');
  if (markerTex[key]) return markerTex[key];
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const x = c.getContext('2d');
  x.lineJoin = 'round';
  if (selected) { x.strokeStyle = '#ffe040'; x.lineWidth = 3; x.beginPath(); x.arc(24, 24, 21, 0, Math.PI * 2); x.stroke(); }
  x.fillStyle = ORDER_COLORS[kind] || ORDER_COLORS.squad; x.strokeStyle = '#0c1620'; x.lineWidth = 3;
  x.beginPath();
  if (kind === 'hold') x.rect(14, 14, 20, 20);
  else if (kind === 'defend') { x.moveTo(24, 10); x.lineTo(36, 15); x.lineTo(34, 30); x.lineTo(24, 38); x.lineTo(14, 30); x.lineTo(12, 15); x.closePath(); }
  else if (kind === 'cover') { x.arc(24, 30, 12, Math.PI, 0); x.closePath(); }
  else if (kind === 'advance') { x.moveTo(24, 9); x.lineTo(37, 26); x.lineTo(29, 26); x.lineTo(29, 38); x.lineTo(19, 38); x.lineTo(19, 26); x.lineTo(11, 26); x.closePath(); }
  else if (kind === 'attack') { x.arc(24, 24, 11, 0, Math.PI * 2); x.moveTo(24, 8); x.lineTo(24, 40); x.moveTo(8, 24); x.lineTo(40, 24); }
  else { x.moveTo(12, 14); x.lineTo(24, 33); x.lineTo(36, 14); x.lineTo(24, 20); x.closePath(); }
  x.stroke(); if (kind !== 'attack') x.fill(); else { x.strokeStyle = ORDER_COLORS.attack; x.lineWidth = 2; x.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  markerTex[key] = tex;
  return tex;
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
    this.ammo = this.T.mag;
    this.iron = Math.floor(Math.random() * 5);
    this.hasKnife = true;
    this.cool = 1 + Math.random() * 2; this.gcool = 5; this.burstLeft = 0; this.burstT = 0;
    this.senseT = Math.random() * 0.3; this.sees = false; this.alerted = false; this.target = null;
    this.stuckT = 0; this.fleeT = 0; this.fleeFrom = null;
    this.craft = null; this.speed = 0; this.post = null; this.raft = null; this.surrender = false;
    this.cover = null; this.coverT = 0; this.peeking = true; this.peekT = 0; this.crouch = false;
    this.reloadT = 0; this.throwT = 0; this.fired = false; this.climbT = 0; this.swimming = false; this.hurtT = 99;
    this.home = null; this.slot = null; this.spread = false; this.selected = false; this.markPop = 0;
    this.animAcc = 0; this.full = true;
    this.idx = Soldier.count = (Soldier.count || 0) + 1; this.jit = Math.random() * 1.5;
    this.name = (RANKS[type] || 'Pvt.') + ' ' + NAMES[Math.floor(Math.random() * NAMES.length)];
    this.rig = new Character(faction, type);
    this.rig.setWeapon(this.weapon || 'knife');
    if (faction === 'ally') {
      this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: marker('squad'), depthTest: false, transparent: true }));
      this.mark.position.y = 2.3; this.mark.scale.setScalar(0.42); this.mark.renderOrder = 5;
      this.rig.root.add(this.mark);
    }
    mgr.game.scene.add(this.rig.root);
  }
  get armed() { return !!this.weapon; }
  get follow() { return this.role === 'follow'; }
  get inSquad() { return PSQ.has(this.role); }
  arm(weapon) { this.weapon = weapon; this.ammo = this.T.mag; this.rig.setWeapon(weapon || (this.hasKnife ? 'knife' : null)); }
  setRole(role) { this.role = role; this.cover = null; this.refreshMark(); }
  refreshMark() { if (this.mark) this.mark.material.map = marker(PSQ.has(this.role) ? this.role : 'squad', this.selected); }
}

export class Enemies {
  constructor(game, saved = {}) {
    this.game = game;
    this.list = [];
    this.squads = [];
    this.pending = [];       // defeated soldiers waiting to come back (numbers stay constant)
    this.fires = [];         // campfires lit by soldiers for crafting
    this.acks = [];          // queued order acknowledgements
    this.tank = null;
    this.tankT = 60;
    this.callT = 0; this.callCd = {};
    this.enabled = !game.peace;
    this.diff = game.cfg.difficulty || 'medium';
    this.allies = game.cfg.sub === 'allies';
    this.dispatchT = { enemy: 40 + Math.random() * 30, ally: 60 + Math.random() * 40 };
    this.patrolT = { enemy: 4 + Math.random() * 6, ally: 8 + Math.random() * 8 };
    this.lodT = 0; this.slotT = 0; this.contactT = 99; this.contactPos = null;
    this.trail = [];         // player's recent path, for column formation
    this.formYaw = 0;
    this.tmpBox = new THREE.Box3(); this.ray = new THREE.Ray(); this.v = new THREE.Vector3();
    this.tracers = [];
    for (let i = 0; i < 20; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff7a40, transparent: true, opacity: 0.8 }));
      l.visible = false; l.frustumCulled = false; game.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.tracerI = 0;
    this.psq = this.newSquad(game.player.pos, 'ally');   // the player's own squad
    this.psq.player = true;
    if (!this.enabled) return;
    this.populate('enemy', DIFF[this.diff].enemies);
    if (this.allies) this.populate('ally', DIFF[this.diff].allies, saved.followers ?? 4);
  }

  // Every soldier starts in one of his side's forts (plus the player's squad).
  populate(faction, total, followers = 0) {
    const forts = this.ownForts(faction);
    let left = total;
    if (followers) {
      const p = this.game.player.pos;
      const n = Math.min(followers, left);
      for (let i = 0; i < n; i++) {
        const s = this.add(faction, i === 0 ? 'gunner' : 'rifleman', p.x + (i % 2 ? 1.5 : -1.5), p.y, p.z + 2 + i * 0.8, this.psq, true);
        s.setRole('follow');
      }
      left -= n;
    }
    if (!forts.length) {        // no forts at all: they start scattered
      while (left > 0) { const n = Math.min(left, 5); this.spawnScattered(faction, n, true); left -= n; }
      return;
    }
    forts.forEach((f, i) => {
      const n = Math.floor(left / (forts.length - i));
      this.garrison(f, faction, n);
      left -= n;
    });
  }
  garrison(f, faction, n) {
    const sq = this.garrisonSquad(f, faction);
    for (let i = 0; i < n; i++) {
      const k = sq.members.length;
      const type = k === 0 ? 'officer' : k === 1 ? 'gunner' : k === 2 && faction === 'enemy' ? 'sniper' : k % 4 === 3 ? 'grenadier' : 'rifleman';
      const post = this.postFor(f, k);
      const s = this.add(faction, type, post.x, post.y, post.z, sq, true);
      s.setRole('garrison'); s.post = post; s.home = f;
    }
  }
  garrisonSquad(f, faction) {
    let sq = this.squads.find((q) => q.garrison === f && q.faction === faction);
    if (!sq) { sq = this.newSquad({ x: f.cx, z: f.cz }, faction); sq.garrison = f; sq.mode = 'garrison'; }
    return sq;
  }
  // posts beyond the fort's ten are shared, slightly apart
  postFor(f, k) {
    const p = f.posts[k % f.posts.length], ring = Math.floor(k / f.posts.length);
    const a = k * 2.4;
    return { fort: f, x: p.x + (ring ? Math.cos(a) * 0.9 : 0), y: p.y, z: p.z + (ring ? Math.sin(a) * 0.9 : 0) };
  }
  joinGarrison(s, f) {
    if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
    const sq = this.garrisonSquad(f, s.faction);
    sq.members.push(s); s.squad = sq;
    s.setRole('garrison'); s.home = f; s.post = this.postFor(f, sq.members.length - 1);
    s.alerted = false;
  }
  ownForts(faction) { return this.game.forts ? this.game.forts.list.filter((f) => f.owner === faction) : []; }

  // ------------------------------------------------------------ spawning
  farSpot(minDist, faction = 'enemy', near = null, nearR = 0) {
    const w = this.game.world, p = this.game.player.pos;
    for (let i = 0; i < 80; i++) {
      let x, z;
      if (near) { const a = Math.random() * Math.PI * 2, r = nearR * (0.6 + Math.random() * 0.4); x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { x = 6 + Math.random() * (w.W - 12); z = 6 + Math.random() * (w.D - 12); }
      if (x < 6 || z < 6 || x > w.W - 6 || z > w.D - 6) continue;
      if (Math.hypot(x - p.x, z - p.z) < minDist) continue;
      if (this.game.forts && this.game.forts.list.some((f) => Math.abs(f.cx - x) < 10 && Math.abs(f.cz - z) < 10)) continue;
      const y = w.surfaceY(Math.floor(x), Math.floor(z));
      if (y < SEA || w.get(Math.floor(x), y + 1, Math.floor(z)) === B.WATER) continue;
      if (this.ground(x, z, y + 1) == null) continue;
      return { x, y: y + 1, z };
    }
    return null;
  }
  newSquad(at, faction) {
    const sq = { faction, members: [], mode: 'patrol', wp: { x: at.x, z: at.z }, alert: null, alertT: 0, fort: null, tnt: 0, t: 0 };
    this.squads.push(sq);
    return sq;
  }
  spawnScattered(faction, n, armed) {
    const at = this.farSpot(faction === 'enemy' ? 70 : 40, faction);
    if (!at) return false;
    let sq = this.squads.find((q) => q.faction === faction && q.mode === 'regroup');
    if (!sq) { sq = this.newSquad(at, faction); sq.mode = 'regroup'; sq.wp = { x: at.x, z: at.z }; }
    for (let i = 0; i < n; i++) {
      let x = at.x + (Math.random() - 0.5) * 12, z = at.z + (Math.random() - 0.5) * 12;
      let y = this.ground(x, z, at.y + 2);
      if (y == null) { x = at.x; z = at.z; y = at.y; }
      const s = this.add(faction, ['rifleman', 'gunner', 'grenadier', 'rifleman', 'officer'][i % 5], x, y, z, sq, armed);
      s.setRole('scatter');
    }
    return true;
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
  // Water a soldier can cross: shallow water is waded (feet on the bottom),
  // deeper water is swum at the surface. Returns { y, swim } or null.
  water(x, z) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 1 || bz < 1 || bx >= w.W - 1 || bz >= w.D - 1) return null;
    if (w.get(bx, SEA - 1, bz) !== B.WATER || SOLID[w.get(bx, SEA, bz)]) return null;
    if (SOLID[w.get(bx, SEA - 2, bz)]) return { y: SEA - 1, swim: false };
    return { y: SEA - 1.25, swim: true };
  }
  // dry (or shallow) footing along a straight line?
  dryLine(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 1.5);
    for (let i = 1; i <= n; i++) {
      const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
      if (this.groundAny(x, z) == null) { const wv = this.water(x, z); if (!wv || wv.swim) return false; }
    }
    return true;
  }
  // any walkable top surface in this column (bridges over water included)
  groundAny(x, z) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    const top = w.surfaceY(bx, bz);
    if (top < SEA - 1 || w.get(bx, top, bz) === B.WATER) return null;
    return SOLID[w.get(bx, top, bz)] ? top + 1 : null;
  }
  // About to swim? Look once for a bridge, raft-free shallow ford or dry
  // land route within ~30 blocks to either side and walk that way instead.
  findCrossing(s, gx, gz) {
    const dx = gx - s.pos.x, dz = gz - s.pos.z, d = Math.hypot(dx, dz) || 1;
    const px = -dz / d, pz = dx / d, reach = Math.min(d, 60);
    for (const off of [6, -6, 12, -12, 18, -18, 24, -24, 30, -30]) {
      const mx = s.pos.x + dx / d * reach * 0.5 + px * off, mz = s.pos.z + dz / d * reach * 0.5 + pz * off;
      if (this.dryLine(s.pos.x, s.pos.z, mx, mz) && this.dryLine(mx, mz, s.pos.x + dx / d * reach, s.pos.z + dz / d * reach)) return { x: mx, z: mz };
    }
    return null;
  }
  // in a hole or pit he cannot simply walk out of?
  inHole(s) {
    if (this.fortXZ(s.pos.x, s.pos.z) || s.swimming) return false;
    const w = this.game.world;
    let walls = 0;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, x = Math.floor(s.pos.x + Math.cos(a) * 2.5), z = Math.floor(s.pos.z + Math.sin(a) * 2.5);
      if (SOLID[w.get(x, Math.floor(s.pos.y) + 1, z)] && SOLID[w.get(x, Math.floor(s.pos.y) + 2, z)]) walls++;
    }
    return walls >= 6;
  }
  // stuck for good: counts as a defeat; he comes back near one of his forts
  trapped(s) {
    this.pending.push({ type: s.type === 'commander' ? 'officer' : s.type, faction: s.faction, t: 3 + Math.random() * 4 });
    this.remove(s);
  }

  // ---------------------------------------------------------- hostility
  dmgScale() { return DMG[this.diff] || 1; }
  isNight() { const tod = this.game.time % 1; return tod < 0.22 || tod > 0.8; }
  // attack pressure: day-only worlds always fight at night strength
  nightPressure() { return this.game.dayOnly || this.isNight(); }
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
    const night = this.isNight() && !g.dayOnly;
    const eye = new THREE.Vector3(s.pos.x, s.pos.y + (s.crouch && !s.peeking ? 1.2 : 1.65), s.pos.z);
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
  canSee(s) { const h = this.findTarget(s); return !!h && h.kind === 'player'; }
  clearLine(a, b, mode) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length(); dir.divideScalar(len);
    return !this.game.world.raycast(a.x, a.y, a.z, dir.x, dir.y, dir.z, len, false, mode);
  }
  hear(pos, radius, faction = 'enemy') {
    for (const sq of this.squads) {
      if (sq.faction !== faction || sq.garrison) continue;
      const m = sq.members.find((s) => s.alive && s.pos.distanceTo(pos) < radius);
      if (m) this.alertSquad(sq, pos);
    }
  }
  alertSquad(sq, pos) {
    if (!sq || sq.garrison || sq.player) return;
    if (!['engage', 'assault'].includes(sq.mode)) { sq.resume = sq.mode; sq.mode = 'engage'; }
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
  // The player's squad: any number of allies, from one soldier to everyone.
  followers() { return this.list.filter((s) => s.alive && s.role === 'follow'); }
  squadMembers() { return this.list.filter((s) => s.alive && s.faction === 'ally' && !s.surrender && s.inSquad); }
  selection() { return this.list.filter((s) => s.alive && s.selected && s.faction === 'ally'); }
  select(s, on) { s.selected = on; s.refreshMark(); }
  clearSelection() { for (const s of this.list) if (s.selected) this.select(s, false); }
  // who an order goes to: the selected group, else one aimed soldier, else the whole squad
  recipients(aimed, cmd) {
    const sel = this.selection();
    if (sel.length) return sel;
    if (aimed && aimed.alive && aimed.faction === 'ally') return [aimed];
    let group = this.squadMembers();
    if (cmd === 'follow') {
      // "everyone, on me": nearby allies who are not guarding a fort join in
      const p = this.game.player.pos;
      const near = this.list.filter((s) => s.alive && s.faction === 'ally' && !s.surrender && !s.inSquad && s.role !== 'garrison' && s.pos.distanceTo(p) < 30);
      group = group.concat(near);
    }
    return group;
  }
  // cmd: follow | hold | defend | cover | spread | advance | attack; at = { point, fort }
  issue(cmd, group, at = {}) {
    const g = this.game, F = g.forts;
    if (!group.length) { g.hud.toast(t('order.nobody')); return 0; }
    let fort = null;
    if (cmd === 'attack') {
      fort = at.fort && at.fort.owner !== 'ally' ? at.fort
        : F.list.filter((f) => f.owner === 'enemy' || f.owner === 'none').sort((a, b) => this.d2(a.center, at.point || g.player.pos) - this.d2(b.center, at.point || g.player.pos))[0];
      if (!fort) { g.hud.toast(t('order.noFort')); return 0; }
      this.psq.tnt = 3; this.psq.fort = fort;
    }
    if (cmd === 'defend') {
      fort = at.fort && at.fort.owner === 'ally' ? at.fort : F.nearest(at.point || g.player.pos, 'ally');
      if (!fort) { g.hud.toast(t('order.noBase')); return 0; }
    }
    const point = at.point || g.player.pos.clone();
    const spreadOn = !group.every((m) => m.spread);
    let i = 0;
    for (const s of group) {
      if (!s.alive) continue;
      if (cmd === 'spread') { s.spread = spreadOn; if (s.role === 'hold' && s.holdPos) s.holdPos = this.spreadAround(s.holdPos, i, group.length, 4); }
      else {
        this.toPlayerSquad(s);
        s.spread = false;
        if (cmd === 'follow') s.setRole('follow');
        else if (cmd === 'hold') { s.setRole('hold'); s.holdPos = s.pos.clone(); }
        else if (cmd === 'defend') { s.setRole('defend'); s.defendFort = fort; s.patrolT = 0; }
        else if (cmd === 'cover') { s.setRole('cover'); s.anchor = s.pos.clone(); s.threat = this.contactPos ? this.contactPos.clone() : this.aheadOfPlayer(25); }
        else if (cmd === 'advance') { s.setRole('advance'); s.dest = this.spreadAround(point, i, group.length, 2.6); }
        else if (cmd === 'attack') { s.setRole('attack'); s.attackFort = fort; }
      }
      s.markPop = 1;
      if (i < 3) this.acks.push({ s, key: 'ack' + cmd[0].toUpperCase() + cmd.slice(1), t: 0.25 + i * 0.7 });
      i++;
    }
    sfx.toggle();
    return i;
  }
  // old single-soldier / whole-squad entry points (orders panel)
  order(s, cmd) { if (s && s.alive && s.faction === 'ally') this.issue(cmd, [s]); }
  orderAll(cmd) { return this.issue(cmd, this.recipients(null, cmd)); }
  toPlayerSquad(s) {
    if (s.squad === this.psq) return;
    if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
    s.squad = this.psq; this.psq.members.push(s);
    s.post = null; s.home = null;
  }
  detach(s) { this.toPlayerSquad(s); }
  spreadAround(p, i, n, gap) {
    if (n <= 1) return { x: p.x, y: p.y, z: p.z };
    const a = i * 2.39996, r = gap * Math.sqrt(i + 0.5);   // sunflower spiral: even spacing
    return { x: p.x + Math.cos(a) * r, y: p.y, z: p.z + Math.sin(a) * r };
  }
  aheadOfPlayer(d) { const p = this.game.player; return new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * d, p.pos.y, p.pos.z - Math.cos(p.yaw) * d); }
  d2(a, b) { return (a.x - b.x) ** 2 + (a.z - b.z) ** 2; }
  // markers for the radar: advance points and attack / defend forts
  orderMarks() {
    const out = [], seen = new Set();
    for (const s of this.squadMembers()) {
      if (s.role === 'advance' && s.dest) { const k = 'a' + Math.round(s.dest.x / 4) + ',' + Math.round(s.dest.z / 4); if (!seen.has(k)) { seen.add(k); out.push({ kind: 'advance', x: s.dest.x, z: s.dest.z }); } }
      if (s.role === 'attack' && s.attackFort && !seen.has('f' + s.attackFort.id)) { seen.add('f' + s.attackFort.id); out.push({ kind: 'attack', x: s.attackFort.cx + 0.5, z: s.attackFort.cz + 0.5 }); }
      if (s.role === 'defend' && s.defendFort && !seen.has('d' + s.defendFort.id)) { seen.add('d' + s.defendFort.id); out.push({ kind: 'defend', x: s.defendFort.cx + 0.5, z: s.defendFort.cz + 0.5 }); }
      if (s.role === 'hold' && s.holdPos) { const k = 'h' + Math.round(s.holdPos.x / 6) + ',' + Math.round(s.holdPos.z / 6); if (!seen.has(k)) { seen.add(k); out.push({ kind: 'hold', x: s.holdPos.x, z: s.holdPos.z }); } }
    }
    return out;
  }
  // allies decide whether they can spare iron (they keep some to craft their own weapon)
  askIron(s) {
    const keep = s.armed ? 1 : 3;
    const spare = Math.max(0, s.iron - keep);
    if (spare > 0) { s.iron -= spare; this.game.give('iron', spare); this.callout(s, 'ironYes'); return spare; }
    this.callout(s, 'ironNo'); return 0;
  }
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
  // Fort-aware routing. A fort is entered and left only through its door:
  //  - on the rampart and heading elsewhere: walk to a ladder and climb down;
  //  - heading up to a rampart post: climb a ladder from the courtyard;
  //  - inside, going out: door (inside) -> door (outside);
  //  - outside, going in: walk around the walls to the door, queue if the
  //    doorway is busy, then go through.
  route(s, gx, gz, gy) {
    const inS = this.fortXZ(s.pos.x, s.pos.z), inG = this.fortXZ(gx, gz);
    if (inS && s.pos.y > inS.base + 1.5) {
      const up = inG === inS && gy != null && gy > inS.base + 1.5;
      if (up) return { x: gx, z: gz };
      const L = this.nearestLadder(inS, s.pos, 'top');
      if (Math.hypot(s.pos.x - L.top.x, s.pos.z - L.top.z) < 0.9) { this.climbTo(s, L.bottom); return L.bottom; }
      return L.top;
    }
    if (inS && inS === inG) {
      if (gy != null && gy > inS.base + 1.5) {             // up to a rampart post
        const L = this.nearestLadder(inS, { x: gx, z: gz }, 'top');
        if (Math.hypot(s.pos.x - L.bottom.x, s.pos.z - L.bottom.z) < 0.9) { this.climbTo(s, L.top); return { x: gx, z: gz }; }
        return L.bottom;
      }
      s.routing = null; return { x: gx, z: gz };
    }
    if (inS === inG) { s.routing = null; return { x: gx, z: gz }; }
    if (inS) {
      if (s.routing !== 'out' && Math.hypot(s.pos.x - inS.doorIn.x, s.pos.z - inS.doorIn.z) < 1.3) s.routing = 'out';
      return s.routing === 'out' ? inS.doorOut : inS.doorIn;
    }
    if (s.routing !== 'in' && Math.hypot(s.pos.x - inG.doorOut.x, s.pos.z - inG.doorOut.z) < 1.3) s.routing = 'in';
    if (s.routing === 'in') return inG.doorIn;
    // around the walls to the door, then wait your turn if the doorway is busy
    const w = this.aroundFort(s, inG);
    if (w === inG.doorOut && Math.hypot(s.pos.x - w.x, s.pos.z - w.z) < 4 && this.doorBusy(inG, s)) {
      const u = this.fortAxes(inG), k = (s.idx % 3) - 1;
      s.queued = true;
      return { x: inG.doorOut.x + u.ux * 2.2 + u.vx * k * 1.6, z: inG.doorOut.z + u.uz * 2.2 + u.vz * k * 1.6 };
    }
    s.queued = false;
    return w;
  }
  fortAxes(f) {
    if (f.axes) return f.axes;
    const ux = f.doorOut.x - (f.cx + 0.5), uz = f.doorOut.z - (f.cz + 0.5), L = Math.hypot(ux, uz);
    f.axes = { ux: ux / L, uz: uz / L, vx: -uz / L, vz: ux / L };
    return f.axes;
  }
  // next waypoint around a fort's walls toward its door (cached axes, no search)
  aroundFort(s, f) {
    const A = this.fortAxes(f), cx = f.cx + 0.5, cz = f.cz + 0.5;
    const dx = s.pos.x - cx, dz = s.pos.z - cz;
    const pu = dx * A.ux + dz * A.uz, pv = dx * A.vx + dz * A.vz;
    if (pu >= 6.9) return f.doorOut;                             // already on the door side
    if (s.navFort !== f || Math.abs(pv) > 2) { s.navFort = f; s.navSide = pv >= 0 ? 1 : -1; }   // pick a side, keep it
    const sg = s.navSide, C = 9;
    const at = (u, v) => ({ x: cx + A.ux * u + A.vx * v, z: cz + A.uz * u + A.vz * v });
    if (pu < -6.9 && Math.abs(pv) < C - 0.6) return at(-C, sg * C);   // behind: to the back corner first
    return at(C, sg * C);                                              // alongside: to the front corner
  }
  doorBusy(f, me) {
    return this.list.some((o) => o !== me && o.alive && Math.hypot(o.pos.x - f.doorCenter.x, o.pos.z - f.doorCenter.z) < 1.6);
  }
  nearestLadder(f, p, end) {
    return f.ladders.reduce((a, b) => (Math.hypot(a[end].x - p.x, a[end].z - p.z) <= Math.hypot(b[end].x - p.x, b[end].z - p.z) ? a : b));
  }
  // up or down a ladder (a quick climb)
  climbTo(s, p) { s.pos.set(p.x, p.y, p.z); s.climbT = 0.8; s.steerO = 0; }
  goTo(s, gx, gz, speed, dt, gy) {
    let r = this.route(s, gx, gz, gy);
    if (s.queued) { const d = Math.hypot(r.x - s.pos.x, r.z - s.pos.z); if (d < 0.8) { s.speed = 0; this.settle(s, dt); return false; } }
    this.watchProgress(s, gx, gz, gy, dt);
    // water ahead: prefer a bridge / ford nearby, swim only if there is none
    if (!s.swimming && Math.hypot(r.x - s.pos.x, r.z - s.pos.z) > 6) {
      s.crossT = (s.crossT || 0) - dt;
      if (s.crossT <= 0) {
        s.crossT = 8;
        const ax = s.pos.x + (r.x - s.pos.x) * Math.min(1, 8 / Math.hypot(r.x - s.pos.x, r.z - s.pos.z)), az = s.pos.z + (r.z - s.pos.z) * Math.min(1, 8 / Math.hypot(r.x - s.pos.x, r.z - s.pos.z));
        s.detour = this.dryLine(s.pos.x, s.pos.z, ax, az) ? null : this.findCrossing(s, r.x, r.z);
      }
      if (s.detour) { if (Math.hypot(s.detour.x - s.pos.x, s.detour.z - s.pos.z) < 2) s.detour = null; else r = s.detour; }
    }
    return this.moveToward(s, r.x, r.z, speed, dt);
  }
  // No progress toward the goal for a few seconds: re-plan (other side of
  // the fort, fresh detour). Still stuck: put him on the ground at the
  // nearest fort door (inside if he is heading in), never left shaking.
  watchProgress(s, gx, gz, gy, dt) {
    s.progT = (s.progT || 0) + dt;
    if (s.progT < 1) return;
    s.progT = 0;
    const d = Math.hypot(gx - s.pos.x, gz - s.pos.z) + (gy != null ? Math.abs(gy - s.pos.y) : 0);
    const went = s.progP ? Math.hypot(s.pos.x - s.progP.x, s.pos.z - s.progP.z) : 9;
    const moved = s.progD == null || s.progD - d > 0.4 || went > 1.2 || d < 1.5 || s.queued;
    s.progD = d; s.progP = { x: s.pos.x, z: s.pos.z };
    s.noProg = moved ? 0 : (s.noProg || 0) + 1;
    if (s.noProg === 3 || s.noProg === 5) { s.navSide = -(s.navSide || 1); s.detour = null; s.crossT = 0; s.steerO = 0; s.routing = null; }
    if (s.noProg >= 7) {
      const inS = this.fortXZ(s.pos.x, s.pos.z), inG = this.fortXZ(gx, gz), f = inG || inS || this.game.forts.nearest(s.pos);
      if (!f || Math.hypot(f.cx - s.pos.x, f.cz - s.pos.z) > 30) return;    // open ground: the hole rule handles it
      const p = inG ? f.doorIn : f.doorOut;
      const y = inG ? f.base : (this.ground(p.x, p.z, f.base + 2) ?? f.base);
      s.pos.set(p.x, y, p.z); s.noProg = 0; s.progD = null; s.routing = inG ? 'in' : null; s.swimming = false;
    }
  }
  // the doorway of a fort (inside and out): nobody should stand there
  inDoorway(x, z) {
    const F = this.game.forts;
    if (!F) return null;
    for (const f of F.list) {
      if (Math.abs(x - f.doorCenter.x) > 4 || Math.abs(z - f.doorCenter.z) > 4) continue;
      const ox = f.doorOut.x - f.doorIn.x, oz = f.doorOut.z - f.doorIn.z, L = Math.hypot(ox, oz);
      const ux = ox / L, uz = oz / L;
      const along = (x - f.doorCenter.x) * ux + (z - f.doorCenter.z) * uz;
      const side = (x - f.doorCenter.x) * -uz + (z - f.doorCenter.z) * ux;
      if (Math.abs(along) < 2.8 && Math.abs(side) < 2.2) return { f, ux, uz, along, side };
    }
    return null;
  }
  // move a spot out of any doorway, staying on the same side of the wall
  clearOfDoor(p) {
    const d = this.inDoorway(p.x, p.z);
    if (!d) return p;
    const sgn = d.side >= 0 ? 1 : -1;
    return { x: p.x + -d.uz * sgn * (2.6 - Math.abs(d.side)), y: p.y, z: p.z + d.ux * sgn * (2.6 - Math.abs(d.side)) };
  }

  // -------------------------------------------------------------- update
  update(dt) {
    if (!this.enabled) return;
    const g = this.game;
    this.dispatch(dt);
    for (const sq of this.squads) this.updateSquad(sq, dt);
    this.squads = this.squads.filter((sq) => sq.members.length || sq === this.psq);
    this.updateFormation(dt);
    // incoming enemy grenades: allies shout a warning
    for (const p of g.explosives.projectiles) {
      if (p.owner !== 'enemy' || p.kind !== 'grenade' || p.called) continue;
      const near = this.list.find((s) => s.alive && s.faction === 'ally' && s.pos.distanceTo(p.pos) < 8);
      if (near) { p.called = true; this.callout(near, 'grenade'); }
    }
    this.updateLod(dt);
    for (const s of this.list.slice()) this.updateSoldier(s, dt);
    this.separate(dt);
    // order acknowledgements, one after another
    for (const a of this.acks) a.t -= dt;
    for (const a of this.acks.filter((q) => q.t <= 0)) {
      if (a.s.alive) g.hud.radio(a.s.name, t('call.' + a.key), 'ally');
    }
    this.acks = this.acks.filter((a) => a.t > 0);
    this.respawnPending(dt);
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

  // ------------------------------------------------------------ dispatch
  // Forts send out attack squads. No warning: they only show up on the radar
  // once they are close.
  dispatch(dt) {
    if (this.noDispatch) return;
    for (const faction of this.allies ? ['enemy', 'ally'] : ['enemy']) {
      // patrols: always a few out in the field, by day and by night
      this.patrolT[faction] -= dt;
      if (this.patrolT[faction] <= 0) {
        this.patrolT[faction] = 12;
        const want = Math.max(1, PATROLS[this.diff] - (faction === 'ally' ? 1 : 0));
        if (this.squads.filter((q) => q.faction === faction && q.patrol && q.members.some((m) => m.alive)).length < want) {
          const [lo, hi] = PATROL_SIZE[this.diff];
          this.launchPatrol(faction, lo + Math.floor(Math.random() * (hi - lo + 1)));
        }
      }
      this.dispatchT[faction] -= dt;
      if (this.dispatchT[faction] > 0) continue;
      const night = this.nightPressure();
      const base = DISPATCH[this.diff] * (faction === 'ally' ? 1.25 : 1);
      this.dispatchT[faction] = base * (night ? 1 : 2) * (0.75 + Math.random() * 0.5);
      const active = this.squads.filter((q) => q.faction === faction && q.attack).length;
      const max = Math.max(1, MAX_SQUADS[this.diff] - (night ? 0 : 1));
      if (active >= max) continue;
      const [lo, hi] = SQUAD_SIZE[this.diff];
      const size = Math.max(3, lo + Math.floor(Math.random() * (hi - lo + 1)) - (night ? 0 : 1));
      this.launchSquad(faction, size);
    }
  }
  // the objectives a side can attack, nearest first from `from`
  objectives(faction, from) {
    const g = this.game;
    const other = faction === 'enemy' ? 'ally' : 'enemy';
    const list = this.ownForts(other).map((f) => ({ fort: f, x: f.doorOut.x, z: f.doorOut.z }));
    if (faction === 'enemy' && !this.allies) {
      const cabin = g.world.sites.find((st) => st.type === 'cabin');
      if (cabin) list.push({ cabin, x: cabin.x + 0.5, z: cabin.z + 0.5 });
    }
    if (faction === 'enemy' && this.allies && !list.length && !g.dead) list.push({ player: true, x: g.player.pos.x, z: g.player.pos.z });
    return list.sort((a, b) => this.d2(a, from) - this.d2(b, from));
  }
  // Mission squads: fresh soldiers that appear at `at` and go for `obj`
  // ({ fort } | { x, z, player: true } | { x, z, point: true }).
  missionSquad(faction, n, at, obj, { tnt = 3, mode = 'march', types = null } = {}) {
    const sq = this.newSquad(at, faction);
    sq.attack = true; sq.mission = true; sq.obj = obj; sq.tnt = tnt; sq.mode = mode; sq.wp = { x: at.x, z: at.z };
    sq.rally = { x: at.x, z: at.z };
    const T = types || ['officer', 'gunner', 'grenadier', 'rifleman', 'rifleman', 'sniper', 'rifleman', 'gunner'];
    for (let i = 0; i < n; i++) {
      const x = at.x + (Math.random() - 0.5) * 8, z = at.z + (Math.random() - 0.5) * 8;
      const y = this.ground(x, z, at.y + 2) ?? at.y;
      const s = this.add(faction, T[i % T.length], x, y, z, sq, true);
      s.setRole('squad');
    }
    return sq;
  }

  // A squad forms at one fort; spare soldiers from nearby forts of the same
  // side walk over to join it. Guards always stay behind.
  // Purposeful patrol: out from a fort along a short route (toward another
  // fort, a river crossing, the area around the other side's fort or the
  // cabin), then back home. No warning when it leaves.
  launchPatrol(faction, size) {
    const pick = this.pickSoldiers(faction, size, true);
    if (!pick) return null;
    const { src, picked } = pick;
    const g = this.game, here = { x: src.cx + 0.5, z: src.cz + 0.5 };
    const toward = (p, d) => { const dx = here.x - p.x, dz = here.z - p.z, L = Math.hypot(dx, dz) || 1; return { x: p.x + dx / L * d, z: p.z + dz / L * d }; };
    const opts = [];
    const other = g.forts.list.filter((f) => f !== src).sort((a, b) => this.d2(a.center, here) - this.d2(b.center, here))[0];
    if (other) opts.push(toward({ x: other.cx + 0.5, z: other.cz + 0.5 }, other.owner === faction ? 12 : 30));
    const foe = faction === 'enemy' ? 'ally' : 'enemy';
    const theirs = this.ownForts(foe).sort((a, b) => this.d2(a.center, here) - this.d2(b.center, here))[0];
    if (theirs) opts.push(toward({ x: theirs.cx + 0.5, z: theirs.cz + 0.5 }, 42));
    const cabin = faction === 'enemy' && g.world.sites.find((st) => st.type === 'cabin');
    if (cabin) opts.push(toward({ x: cabin.x + 0.5, z: cabin.z + 0.5 }, 35));
    const ford = this.riverSpot(here);
    if (ford) opts.push(ford);
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    const W = g.world, clamp = (p) => ({ x: Math.max(8, Math.min(W.W - 8, p.x)), z: Math.max(8, Math.min(W.D - 8, p.z)), patrol: true });
    const route = opts.slice(0, 2).map(clamp);
    if (!route.length) route.push(clamp({ x: here.x + (Math.random() - 0.5) * 80, z: here.z + (Math.random() - 0.5) * 80 }));
    const sq = this.formSquad(faction, src, picked);
    sq.patrol = true; sq.attack = false; sq.route = route; sq.obj = route[0]; sq.tnt = 0;
    return sq;
  }
  // a dry spot at a river or lake edge within reach (a crossing to watch)
  riverSpot(from) {
    const W = this.game.world;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = 25 + Math.random() * 55;
      const x = Math.floor(from.x + Math.cos(a) * r), z = Math.floor(from.z + Math.sin(a) * r);
      if (x < 8 || z < 8 || x > W.W - 8 || z > W.D - 8 || W.get(x, SEA - 1, z) !== B.WATER) continue;
      for (let d = 1; d < 8; d++) {
        const bx = Math.floor(x - Math.cos(a) * d), bz = Math.floor(z - Math.sin(a) * d);
        if (this.groundAny(bx, bz) != null) return { x: bx + 0.5, z: bz + 0.5 };
      }
    }
    return null;
  }
  // spare soldiers (never the guards) from one fort, topped up from its neighbours
  pickSoldiers(faction, size, near = false) {
    const guards = GUARDS[this.diff];
    const spare = (f) => {
      const sq = this.squads.find((q) => q.garrison === f && q.faction === faction);
      if (!sq) return [];
      const ok = sq.members.filter((m) => m.alive && m.armed && !m.surrender).sort((a, b) => (a.type === 'officer') - (b.type === 'officer'));
      return ok.slice(0, Math.max(0, ok.length - guards));
    };
    const forts = this.ownForts(faction).map((f) => ({ f, spare: spare(f) })).filter((c) => c.spare.length);
    if (!forts.length) return null;
    forts.sort((a, b) => b.spare.length - a.spare.length);
    const src = near ? forts[Math.floor(Math.random() * Math.min(3, forts.length))].f : forts[0].f;
    const pool = forts.sort((a, b) => this.d2(a.f.center, src.center) - this.d2(b.f.center, src.center))
      .filter((c) => !near || this.d2(c.f.center, src.center) < 110 * 110).flatMap((c) => c.spare);
    const picked = pool.slice(0, size);
    if (picked.length < 3) return null;
    return { src, picked };
  }
  formSquad(faction, src, picked) {
    const sq = this.newSquad(src.doorOut, faction);
    sq.home = src; sq.mode = 'muster';
    sq.musterMax = picked.some((m) => m.home !== src) ? 120 : 30;
    const A = this.fortAxes(src);
    const out = { x: src.doorOut.x + A.ux * 4, z: src.doorOut.z + A.uz * 4 };
    sq.rally = out; sq.wp = { ...out };
    for (const s of picked) {
      if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
      sq.members.push(s); s.squad = sq; s.setRole('squad'); s.post = null;
    }
    return sq;
  }
  launchSquad(faction, size) {
    const guards = GUARDS[this.diff];
    const spare = (f) => {
      const sq = this.squads.find((q) => q.garrison === f && q.faction === faction);
      if (!sq) return [];
      const ok = sq.members.filter((m) => m.alive && m.armed && !m.surrender).sort((a, b) => (a.type === 'officer') - (b.type === 'officer'));
      return ok.slice(0, Math.max(0, ok.length - guards));
    };
    const forts = this.ownForts(faction).map((f) => ({ f, spare: spare(f) })).filter((c) => c.spare.length);
    if (!forts.length) return null;
    forts.sort((a, b) => b.spare.length - a.spare.length);
    const src = forts[0].f;
    const objs = this.objectives(faction, src.center);
    if (!objs.length) return null;
    // Play Alone: captured forts and the cabin are both targets
    const obj = objs.length > 1 && Math.random() < 0.4 ? objs[1] : objs[0];
    const pool = forts.sort((a, b) => this.d2(a.f.center, src.center) - this.d2(b.f.center, src.center)).flatMap((c) => c.spare);
    const picked = pool.slice(0, size);
    if (picked.length < 3) return null;
    const sq = this.newSquad(src.doorOut, faction);
    sq.attack = true; sq.home = src; sq.obj = obj; sq.tnt = 3; sq.mode = 'muster';
    sq.musterMax = picked.some((m) => m.home !== src) ? 120 : 25;
    const out = { x: src.doorOut.x + (src.doorOut.x - src.doorIn.x) * 1.5, z: src.doorOut.z + (src.doorOut.z - src.doorIn.z) * 1.5 };
    sq.rally = out; sq.wp = { ...out };
    for (const s of picked) {
      if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
      sq.members.push(s); s.squad = sq; s.setRole('squad'); s.post = null;
    }
    return sq;
  }

  updateSquad(sq, dt) {
    const g = this.game;
    sq.members = sq.members.filter((m) => this.list.includes(m));
    if (sq.garrison || sq.player) return;
    sq.t += dt;
    const alive = sq.members.filter((m) => m.alive && !m.surrender);
    if (!alive.length) return;
    const cx = alive.reduce((a, m) => a + m.pos.x, 0) / alive.length, cz = alive.reduce((a, m) => a + m.pos.z, 0) / alive.length;
    sq.c = { x: cx, z: cz };
    if (sq.mode === 'engage') {
      sq.alertT += dt;
      if (alive.some((m) => m.target)) sq.alertT = Math.min(sq.alertT, 5);
      if (sq.alertT > 20) { sq.mode = sq.resume || 'march'; sq.alert = null; for (const m of alive) m.alerted = false; }
      return;
    }
    if (sq.mode === 'muster') {
      if (sq.t > (sq.musterMax || 25) || alive.every((m) => Math.hypot(m.pos.x - sq.rally.x, m.pos.z - sq.rally.z) < 6)) { sq.mode = 'march'; sq.wp = { x: cx, z: cz }; }
      return;
    }
    if (sq.mode === 'regroup') { this.regroupSquad(sq, alive, cx, cz); return; }
    // objective still valid?
    const o = sq.obj;
    if (o && o.fort && o.fort.owner === sq.faction) {
      // taken: those inside became its garrison; the rest join them
      for (const m of alive) this.joinGarrison(m, o.fort);
      return;
    }
    if (!o || (o.fort && o.fort.owner === 'none' && sq.faction === 'ally')) {
      sq.mode = 'return';
    }
    if (o && o.player) { o.x = g.player.pos.x; o.z = g.player.pos.z; }
    if (sq.mode === 'march') {
      const d = Math.hypot(o.x - cx, o.z - cz);
      if (o.patrol && d < 9) {
        sq.route.shift();
        if (sq.route.length) { sq.obj = sq.route[0]; } else { sq.obj = null; sq.mode = 'return'; }
        return;
      }
      if (o.fort && d < 26) { sq.mode = 'assault'; sq.fort = o.fort; return; }
      if (o.cabin && d < 26) { sq.mode = 'siege'; sq.t = 0; return; }
      if ((o.player || o.point) && d < 20) { sq.mode = 'engage'; sq.resume = 'march'; sq.alert = new THREE.Vector3(o.x, 0, o.z); sq.alertT = 0; return; }
      // a moving waypoint keeps the squad together on the way
      if (Math.hypot(sq.wp.x - cx, sq.wp.z - cz) < 7) {
        const step = Math.min(14, d);
        sq.wp = { x: cx + (o.x - cx) / d * step, z: cz + (o.z - cz) / d * step };
        sq.dir = Math.atan2(o.x - cx, o.z - cz);
      }
    } else if (sq.mode === 'assault') {
      if (sq.t > 600) sq.mode = 'return';
    } else if (sq.mode === 'siege') {
      // wait around the cabin for the player to come out; give up after a while
      if (sq.t > 420 && !alive.some((m) => m.target)) sq.mode = 'return';
    } else if (sq.mode === 'return') {
      const home = sq.home && sq.home.owner === sq.faction ? sq.home : this.game.forts && this.game.forts.nearest({ x: cx, z: cz }, sq.faction);
      if (!home) { sq.mode = 'regroup'; sq.attack = false; return; }
      sq.home = home;
      for (const m of alive) if (this.game.forts.inside(home, m.pos)) this.joinGarrison(m, home);
    }
  }
  // fortless survivors: gather, arm themselves, then counterattack together
  regroupSquad(sq, alive, cx, cz) {
    const forts = this.ownForts(sq.faction);
    if (forts.length) {       // they have a fort again: go home
      sq.mode = 'return'; sq.home = forts[0]; sq.attack = true;
      for (const m of alive) m.setRole('squad');
      return;
    }
    const armed = alive.filter((m) => m.armed);
    const gathered = alive.filter((m) => Math.hypot(m.pos.x - sq.wp.x, m.pos.z - sq.wp.z) < 10).length;
    if (armed.length >= Math.min(4, alive.length) && gathered >= Math.min(4, alive.length) && sq.t > 40) {
      const objs = this.objectives(sq.faction, { x: cx, z: cz });
      if (objs.length) {
        sq.obj = objs[0]; sq.mode = 'march'; sq.attack = true; sq.tnt = 3; sq.wp = { x: cx, z: cz };
        for (const m of alive) m.setRole('squad');
      }
    }
  }

  // ------------------------------------------------- the player's squad
  // Formation slots around the player, recomputed a few times a second.
  updateFormation(dt) {
    const g = this.game, pl = g.player;
    // breadcrumb trail for the column
    const last = this.trail[0];
    if (!last || Math.hypot(last.x - pl.pos.x, last.z - pl.pos.z) > 1.2) { this.trail.unshift({ x: pl.pos.x, y: pl.pos.y, z: pl.pos.z }); if (this.trail.length > 160) this.trail.pop(); }
    const mv = Math.hypot(pl.vel.x, pl.vel.z);
    const heading = mv > 1 ? Math.atan2(-pl.vel.x, -pl.vel.z) : pl.yaw;
    this.formYaw = this.turn(this.formYaw, heading, dt * (mv > 1 ? 2.5 : 0.8));
    this.contactT += dt;
    this.slotT -= dt;
    if (this.slotT > 0) return;
    this.slotT = 0.4;
    const fol = this.followers();
    // under fire: anyone in the squad sees an enemy or was just hit
    for (const s of fol) if (s.target || s.hurtT < 3) { this.contactT = 0; this.contactPos = s.target ? s.target.pos.clone() : this.contactPos; }
    const narrow = this.narrowAt(pl.pos);
    const mode = narrow ? 'column' : (g.settings.formation || 'loose');
    this.formMode = mode; this.narrow = narrow;
    const fx = -Math.sin(this.formYaw), fz = -Math.cos(this.formYaw), rx = -fz, rz = fx;
    fol.sort((a, b) => a.idx - b.idx);
    fol.forEach((s, i) => {
      const k = s.spread ? 1.6 : 1;
      let back, side;
      if (mode === 'column') {
        // single file along the player's own path
        const want = (8 + i * 2.6) * k;
        let acc = 0, prev = pl.pos, pt = null;
        for (const q of this.trail) { acc += Math.hypot(q.x - prev.x, q.z - prev.z); prev = q; if (acc >= want) { pt = q; break; } }
        if (pt) { s.slot = this.clearOfDoor({ x: pt.x, y: pt.y, z: pt.z }); return; }
        back = want; side = 0;
      } else if (mode === 'line') {
        const sgn = i % 2 ? 1 : -1;
        back = 9 + Math.floor(i / 12) * 3.5; side = sgn * (2.5 + Math.floor(i / 2) % 6 * 3.2) * k;
      } else {
        const sgn = i % 2 ? 1 : -1, j = Math.floor(i / 2);
        back = (8 + (j % 4) * 2.3 + (s.jit || 0)) * k; side = sgn * (3 + (j % 2) * 2 + Math.floor(j / 4) * 3.5) * k;
      }
      back = Math.min(back, 15 * k + Math.floor(i / 12) * 3);
      let x = pl.pos.x - fx * back + rx * side, z = pl.pos.z - fz * back + rz * side;
      // never stand in the player's line of fire
      const lx = -Math.sin(pl.yaw), lz = -Math.cos(pl.yaw);
      const dx = x - pl.pos.x, dz = z - pl.pos.z, dl = Math.hypot(dx, dz) || 1;
      if ((dx * lx + dz * lz) / dl > 0.82) { x += -lz * 6 * (side >= 0 ? 1 : -1); z += lx * 6 * (side >= 0 ? 1 : -1); }
      s.slot = this.clearOfDoor({ x, y: pl.pos.y, z });
    });
  }
  // walls or water close on both sides of the player: go single file
  narrowAt(p) {
    const w = this.game.world, F = this.game.forts;
    if (F && F.fortAt && F.fortAt(p)) return true;
    const yaw = this.formYaw, rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const blocked = (sgn) => {
      for (let d = 1; d <= 3; d++) {
        const x = Math.floor(p.x + rx * d * sgn), z = Math.floor(p.z + rz * d * sgn), y = Math.floor(p.y + 0.5);
        if (SOLID[w.get(x, y, z)] || SOLID[w.get(x, y + 1, z)] || w.get(x, y - 1, z) === B.WATER) return true;
      }
      return false;
    };
    return blocked(1) && blocked(-1);
  }

  // ----------------------------------------------------------- per soldier
  updateSoldier(s, dt) {
    const g = this.game, pl = g.player;
    s.fired = false;
    if (!s.alive) {
      s.deadT += dt;
      this.animate(s, dt);
      if (s.deadT > 0.8 && !s.looted) { s.looted = true; this.dropLoot(s); }
      if (s.deadT > 12) this.remove(s);
      return;
    }
    s.hurtT += dt; s.reloadT = Math.max(0, s.reloadT - dt); s.throwT = Math.max(0, s.throwT - dt); s.climbT = Math.max(0, s.climbT - dt);
    s.markPop = Math.max(0, s.markPop - dt * 2);
    if (s.reloadT === 0 && s.ammo <= 0) s.ammo = s.T.mag;
    if (s.surrender) { this.updateSurrender(s, dt); return; }
    const pdist = Math.hypot(pl.pos.x - s.pos.x, pl.pos.z - s.pos.z);
    const far = pdist > 150 && !s.inSquad;
    // senses (staggered)
    s.senseT -= dt;
    if (s.senseT <= 0 && !far) {
      s.senseT = 0.35;
      const had = !!s.target;
      s.target = (s.armed || pdist < 20) ? this.findTarget(s) : null;
      s.sees = !!s.target;
      if (s.target) {
        s.alerted = true;
        this.alertSquad(s.squad, s.target.pos);
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
    if (s.raft) { this.rideRaft(s, dt); if (s.raft) { this.combat(s, dt); this.animate(s, dt); return; } }
    s.plan = { goal: null, speed: 0, face: null, crouch: false };
    if (s.fleeT > 0) {
      s.fleeT -= dt;
      const fx = s.pos.x - s.fleeFrom.x, fz = s.pos.z - s.fleeFrom.z, fl = Math.hypot(fx, fz) || 1;
      s.plan.goal = { x: s.pos.x + fx / fl * 5, z: s.pos.z + fz / fl * 5 }; s.plan.speed = 5;
    } else if (!s.armed && !s.inSquad) {
      this.unarmedBehaviour(s, dt, pdist);
      return;
    } else if (s.role === 'garrison') this.garrisonBehaviour(s, dt);
    else if (s.role === 'carrier') {
      // mission: carry supplies to a fort, fighting back only when needed
      const P = s.plan;
      if (s.target && s.target.pos.distanceTo(s.pos) < 25) this.fieldCombat(s, dt, s.pos, 5);
      else if (s.dest) { P.goal = s.dest; P.speed = 3.4; }
    }
    else if (s.inSquad) this.squadOrderBehaviour(s, dt, pdist);
    else this.squadBehaviour(s, dt);
    const P = s.plan;
    // nobody idles in a doorway
    if (!P.goal && !s.routing) { const d = this.inDoorway(s.pos.x, s.pos.z); if (d) { P.goal = this.clearOfDoor(s.pos); P.speed = 2.5; } }
    if (P.goal && P.speed > 0) {
      const arrived = this.goTo(s, P.goal.x, P.goal.z, P.speed * slow, dt, P.goal.y);
      if (arrived) s.speed = 0;
    } else { s.speed = 0; this.settle(s, dt); }
    // stuck in a hole: try to scramble out; after ~10 s it counts as a defeat
    s.holeT = (s.holeT || 0) - dt;
    if (s.holeT <= 0) {
      s.holeT = 1;
      const wants = P.goal && P.speed > 0 && Math.hypot(P.goal.x - s.pos.x, P.goal.z - s.pos.z) > 3;
      s.trapT = wants && s.stuckT > 0.5 || (wants && this.inHole(s)) ? (s.trapT || 0) + 1 : 0;
      if (s.trapT >= 10 && this.inHole(s)) { this.trapped(s); return; }
      if (s.trapT >= 14 && !s.inSquad) { this.trapped(s); return; }      // wedged somewhere else for good
    }
    s.crouch = P.crouch && s.speed < 2;
    const face = P.face || (s.target ? s.target.pos : null);
    if (face && s.speed < 0.5) s.yaw = this.turn(s.yaw, Math.atan2(-(face.x - s.pos.x), -(face.z - s.pos.z)), dt * 6);
    this.combat(s, dt);
    this.animate(s, dt);
  }

  garrisonBehaviour(s, dt) {
    const P = s.plan, tgt = s.target;
    if (!s.post) {
      const f = s.home || this.fortXZ(s.pos.x, s.pos.z);
      if (!f) { s.setRole('squad'); return; }
      s.post = this.postFor(f, 0);
    }
    const d = Math.hypot(s.pos.x - s.post.x, s.pos.z - s.post.z);
    if (d > 0.8) { P.goal = s.post; P.speed = tgt ? 3.6 : 2.2; }
    if (tgt) P.face = tgt.pos;
    // ramparts give cover: duck between shots
    if (tgt && s.post.y > s.post.fort.base + 1) { this.peek(s, dt); P.crouch = !s.peeking; }
  }

  // attack / siege / return / regroup squads (both sides)
  squadBehaviour(s, dt) {
    const g = this.game, P = s.plan, sq = s.squad, tgt = s.target;
    const i = sq.members.indexOf(s), n = sq.members.length;
    if (s.role === 'scatter' && sq.mode === 'regroup') {
      P.goal = this.spreadAround(sq.wp, i, n, 3); P.speed = 3;
      if (tgt) this.fieldCombat(s, dt, sq.wp, 20);
      return;
    }
    if (tgt && sq.mode !== 'assault') { this.fieldCombat(s, dt, sq.c || s.pos, 30); return; }
    if (sq.mode === 'muster') { P.goal = this.spreadAround(sq.rally, i, n, 2.2); P.speed = 3; return; }
    if (sq.mode === 'march') {
      // spread out in a loose line across the direction of travel
      const a = sq.dir || 0, sgn = i % 2 ? 1 : -1, off = sgn * Math.ceil(i / 2) * 4.5;
      P.goal = { x: sq.wp.x + Math.cos(a) * off, z: sq.wp.z - Math.sin(a) * off }; P.speed = 3.4;
      return;
    }
    if (sq.mode === 'engage' && sq.alert) {
      P.goal = this.spreadAround(sq.alert, i, n, 4); P.speed = 4.2; P.face = sq.alert;
      if (s.tnt > 0 && s.faction === 'enemy' && Math.hypot(g.player.pos.x - s.pos.x, g.player.pos.z - s.pos.z) < 18 && (s.stuckT > 1.2 || Math.hypot(s.pos.x - sq.alert.x, s.pos.z - sq.alert.z) < 3)) this.plantTNT(s);
      return;
    }
    if (sq.mode === 'assault' && sq.fort) {
      const f = sq.fort;
      if (tgt && Math.hypot(s.pos.x - f.doorOut.x, s.pos.z - f.doorOut.z) > 6) { this.fieldCombat(s, dt, f.doorOut, 14); return; }
      if (!f.blown && !f.doorOpen) {
        const dd = Math.hypot(s.pos.x - f.doorOut.x, s.pos.z - f.doorOut.z);
        // stack up beside the door, not in front of it
        const ox = f.doorOut.x - f.doorIn.x, oz = f.doorOut.z - f.doorIn.z, L = Math.hypot(ox, oz);
        const sgn = i % 2 ? 1 : -1, row = Math.floor(i / 2);
        P.goal = { x: f.doorOut.x + (-oz / L) * sgn * (3 + row * 1.6) + ox / L * row, z: f.doorOut.z + (ox / L) * sgn * (3 + row * 1.6) + oz / L * row }; P.speed = 4;
        P.crouch = true;
        if (i === 0) { P.goal = f.doorOut; P.crouch = false; }
        if (dd < 4 && sq.tnt > 0 && !g.explosives.litNear(new THREE.Vector3(f.doorCenter.x, f.base, f.doorCenter.z), 4)) this.plantAtDoor(s, f);
        if (tgt) P.face = tgt.pos;
      } else { P.goal = { x: f.cx + 0.5 + (i % 3 - 1) * 2, z: f.cz + 0.5 + (Math.floor(i / 3) - 1) * 2 }; P.speed = 4.4; }
      return;
    }
    if (sq.mode === 'siege') {
      const c = sq.obj, a = (i / n) * Math.PI * 2 + (sq.angle || (sq.angle = Math.random() * 6));
      const spot = { x: c.x + Math.cos(a) * 17, z: c.z + Math.sin(a) * 17 };
      if (!s.cover || s.coverT <= 0) { s.cover = this.findCover(s, new THREE.Vector3(c.x, s.pos.y + 1, c.z), spot, 6) || spot; s.coverT = 30; }
      s.coverT -= dt;
      P.goal = s.cover; P.speed = 3; P.crouch = true; P.face = c;
      return;
    }
    if (sq.mode === 'return') {
      const f = sq.home;
      if (f) { P.goal = { x: f.cx + 0.5, z: f.cz + 0.5 }; P.speed = 3; }
    }
  }

  // Orders from the player.
  squadOrderBehaviour(s, dt, pdist) {
    const g = this.game, pl = g.player, P = s.plan, tgt = s.target;
    s.idx = s.idx ?? this.list.indexOf(s);
    const role = s.role;
    if (role === 'follow') {
      const slot = s.slot || { x: pl.pos.x, z: pl.pos.z + 8 };
      if (pl.raft && pl.raft.box && pl.raft.t !== undefined && pdist < 7) this.boardRaft(s, pl.raft);
      const contact = this.contactT < 10;
      if (tgt) { this.fieldCombat(s, dt, slot, 12); return; }
      if (contact && this.contactPos) {
        // disperse to cover near our slot and keep our heads down
        if (!s.cover || s.coverT <= 0) { s.cover = this.findCover(s, this.contactPos, slot, 9) || slot; s.coverT = 6; }
        s.coverT -= dt;
        P.goal = s.cover; P.speed = 4.6; P.crouch = true; P.face = this.contactPos;
        return;
      }
      s.cover = null;
      const dp = Math.hypot(s.pos.x - slot.x, s.pos.z - slot.z);
      if (dp > 1.5) { P.goal = slot; P.speed = pdist > 22 ? 7 : dp > 5 ? 4.8 : 2.6; }
      if (pdist > 90) { const at = this.ground(slot.x, slot.z, pl.pos.y + 1); if (at != null) s.pos.set(slot.x, at, slot.z); }
      return;
    }
    if (role === 'hold') {
      const hp = s.holdPos || (s.holdPos = s.pos.clone());
      if (tgt) { this.fieldCombat(s, dt, hp, 5); return; }
      if (Math.hypot(s.pos.x - hp.x, s.pos.z - hp.z) > 1) { P.goal = hp; P.speed = 3; }
      P.crouch = this.contactT < 10 && s.pos.distanceTo(pl.pos) < 40;
      return;
    }
    if (role === 'cover') {
      const anchor = s.anchor || (s.anchor = s.pos.clone());
      const threat = tgt ? tgt.pos : s.threat || this.aheadOfPlayer(25);
      if (!s.cover || s.coverT <= 0) { s.cover = this.findCover(s, threat, anchor, 8) || anchor; s.coverT = tgt ? 5 : 20; }
      s.coverT -= dt;
      P.goal = s.cover; P.speed = 4.6;
      if (tgt) { this.peek(s, dt); P.crouch = !s.peeking; P.face = tgt.pos; } else { P.crouch = true; P.face = threat; }
      return;
    }
    if (role === 'advance') {
      const d = s.dest;
      if (tgt) { this.fieldCombat(s, dt, d, 10); return; }
      if (Math.hypot(s.pos.x - d.x, s.pos.z - d.z) < 1.2) { s.role = 'hold'; s.holdPos = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z); s.refreshMark(); return; }
      P.goal = d; P.speed = 4.4;
      return;
    }
    if (role === 'defend') {
      let f = s.defendFort;
      if (!f || f.owner !== 'ally') f = s.defendFort = g.forts.nearest(s.pos, 'ally');
      if (!f) { s.setRole('hold'); s.holdPos = s.pos.clone(); return; }
      if (!g.forts.inside(f, s.pos)) { P.goal = f.doorIn; P.speed = 4.4; if (tgt) P.face = tgt.pos; return; }
      // patrol the fort between its posts
      s.patrolT -= dt;
      if (!s.patrol || s.patrolT <= 0) { s.patrol = f.posts[Math.floor(Math.random() * f.posts.length)]; s.patrolT = 8 + Math.random() * 10; }
      if (tgt) { P.face = tgt.pos; if (s.patrol.y > f.base + 1 && s.pos.y > f.base + 1) { this.peek(s, dt); P.crouch = !s.peeking; } return; }
      const d = Math.hypot(s.pos.x - s.patrol.x, s.pos.z - s.patrol.z);
      if (d > 0.8) { P.goal = s.patrol; P.speed = 1.8; }
      return;
    }
    if (role === 'attack') {
      const f = s.attackFort;
      if (!f || f.owner === 'ally') { if (f) { s.setRole('defend'); s.defendFort = f; } else s.setRole('follow'); return; }
      const i = this.psq.members.filter((m) => m.role === 'attack').indexOf(s);
      if (tgt && Math.hypot(s.pos.x - f.doorOut.x, s.pos.z - f.doorOut.z) > 6) { this.fieldCombat(s, dt, f.doorOut, 14); return; }
      if (!f.blown && !f.doorOpen) {
        const ox = f.doorOut.x - f.doorIn.x, oz = f.doorOut.z - f.doorIn.z, L = Math.hypot(ox, oz), sgn = i % 2 ? 1 : -1, row = Math.floor(i / 2);
        P.goal = i === 0 ? f.doorOut : { x: f.doorOut.x + (-oz / L) * sgn * (3 + row * 1.6), z: f.doorOut.z + (ox / L) * sgn * (3 + row * 1.6) };
        P.speed = 4.4; P.crouch = i !== 0;
        const dd = Math.hypot(s.pos.x - f.doorOut.x, s.pos.z - f.doorOut.z);
        if (dd < 4 && this.psq.tnt > 0 && !g.explosives.litNear(new THREE.Vector3(f.doorCenter.x, f.base, f.doorCenter.z), 4)) { s.squad = this.psq; this.plantAtDoor(s, f, 'ally'); }
        if (tgt) P.face = tgt.pos;
      } else { P.goal = { x: f.cx + 0.5 + (i % 3 - 1) * 2, z: f.cz + 0.5 + (Math.floor(i / 3) - 1) * 2 }; P.speed = 4.6; }
    }
  }

  // Shooting from cover: pick a covered spot near `anchor` (within `leash`),
  // duck down, pop up to fire, keep apart from squadmates.
  fieldCombat(s, dt, anchor, leash) {
    const P = s.plan, tgt = s.target;
    s.coverT -= dt;
    // re-check now and then that the cover still stands between us and them
    if (s.cover && s.cover.covered && (s.coverCheckT = (s.coverCheckT || 0) - dt) <= 0) {
      s.coverCheckT = 1.5;
      if (!this.coveredFrom(s.cover, tgt.pos)) s.coverT = 0;
    }
    if (!s.cover || s.coverT <= 0) {
      s.cover = this.findCover(s, tgt.pos, anchor, leash) || { x: s.pos.x, y: s.pos.y, z: s.pos.z, covered: false };
      s.coverT = 5 + Math.random() * 4; s.coverCheckT = 1.5;
    }
    const d = Math.hypot(s.pos.x - s.cover.x, s.pos.z - s.cover.z);
    if (d > 0.7) { P.goal = s.cover; P.speed = d > 6 ? 5.2 : 3.4; }
    P.face = tgt.pos;
    if (d < 1.5) { this.peek(s, dt); P.crouch = s.cover.covered ? !s.peeking : s.type !== 'officer'; }
  }
  peek(s, dt) {
    s.peekT -= dt;
    if (s.peekT <= 0) { s.peeking = !s.peeking; s.peekT = s.peeking ? 1.6 + Math.random() * 1.6 : 1 + Math.random() * 1.5; }
  }
  coveredFrom(c, threat) {
    const from = new THREE.Vector3(c.x, c.y + 0.85, c.z);
    const to = new THREE.Vector3(threat.x, threat.y + 1.2, threat.z);
    const dir = to.sub(from); const len = dir.length(); dir.divideScalar(len);
    const hit = this.game.world.raycast(from.x, from.y, from.z, dir.x, dir.y, dir.z, Math.min(3, len - 1), false, 'bullet');
    return !!hit;
  }
  findCover(s, threat, anchor, leash) {
    const w = this.game.world;
    const inFort = this.fortXZ(s.pos.x, s.pos.z);
    const mates = this.list.filter((o) => o !== s && o.alive && o.faction === s.faction && Math.abs(o.pos.x - s.pos.x) < 14 && Math.abs(o.pos.z - s.pos.z) < 14);
    const pref = s.T.pref;
    let best = null, bs = -1e9;
    for (let k = 0; k < 12; k++) {
      let x, z;
      if (k === 0) { x = s.pos.x; z = s.pos.z; }
      else { const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 6; x = s.pos.x + Math.cos(a) * r; z = s.pos.z + Math.sin(a) * r; }
      if (anchor && Math.hypot(x - anchor.x, z - anchor.z) > leash) {
        const a = Math.atan2(z - anchor.z, x - anchor.x); x = anchor.x + Math.cos(a) * leash * 0.9; z = anchor.z + Math.sin(a) * leash * 0.9;
      }
      if (this.fortXZ(x, z) !== inFort || this.inDoorway(x, z)) continue;
      const y = this.ground(x, z, s.pos.y + 1);
      if (y == null || Math.abs(y - s.pos.y) > 2.2) continue;
      const c = { x: Math.floor(x) + 0.5, y, z: Math.floor(z) + 0.5 };
      const covered = this.coveredFrom(c, threat);
      const dt = Math.hypot(threat.x - c.x, threat.z - c.z);
      if (dt > s.T.range + 5) continue;
      let crowd = 0;
      for (const o of mates) {
        const oc = o.cover && o.cover !== c ? o.cover : o.pos;
        const dd = Math.hypot(oc.x - c.x, oc.z - c.z);
        if (dd < 2.5) crowd += (2.5 - dd);
      }
      const score = (covered ? 6 : 0) - Math.abs(dt - pref) * 0.06 - Math.hypot(c.x - s.pos.x, c.z - s.pos.z) * 0.25 - crowd * 3;
      if (score > bs) { bs = score; best = { ...c, covered }; }
    }
    return best;
  }

  // keep everyone at arm's length: no stacking
  separate(dt) {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || a.raft) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || b.raft) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        if (Math.abs(dx) > 1.1 || Math.abs(dz) > 1.1 || Math.abs(b.pos.y - a.pos.y) > 1.5) continue;
        const d = Math.hypot(dx, dz);
        if (d >= 1.1) continue;
        const push = (1.1 - d) * 0.5 * Math.min(1, dt * 6), ux = d > 0.01 ? dx / d : Math.random() - 0.5, uz = d > 0.01 ? dz / d : Math.random() - 0.5;
        this.nudge(a, -ux * push, -uz * push);
        this.nudge(b, ux * push, uz * push);
      }
    }
  }
  nudge(s, dx, dz) {
    const nx = s.pos.x + dx, nz = s.pos.z + dz;
    const gy = this.ground(nx, nz, s.pos.y);
    if (gy != null && Math.abs(gy - s.pos.y) < 0.6 && this.fortXZ(nx, nz) === this.fortXZ(s.pos.x, s.pos.z)) { s.pos.x = nx; s.pos.z = nz; }
  }

  combat(s, dt) {
    const tgt = s.target;
    if (!tgt || !s.armed) return;
    if (s.raft) s.yaw = this.turn(s.yaw, Math.atan2(-(tgt.pos.x - s.pos.x), -(tgt.pos.z - s.pos.z)), dt * 8);
    const d = Math.hypot(tgt.pos.x - s.pos.x, tgt.pos.z - s.pos.z);
    // ducked behind cover: no shooting until he pops up again
    if (!(s.crouch && !s.peeking && s.cover && s.cover.covered)) this.tryFire(s, dt, d);
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
    s.crouch = !!s.craft;
    this.animate(s, dt);
  }

  // ------------------------------------------------------------ surrender
  surrender(s, f) {
    if (s.surrender || !s.alive) return;
    s.surrender = true; s.surrenderFort = f; s.target = null; s.sees = false;
    s.arm(null); s.post = null; s.role = 'squad'; s.selected = false;
    if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
  }
  updateSurrender(s, dt) {
    const f = s.surrenderFort;
    let goal;
    if (f && this.fortXZ(s.pos.x, s.pos.z) === f) goal = f.doorIn;
    if (f && goal && Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 1.2) {
      if (f.doorOpen) goal = f.doorOut; else { this.vanish(s); return; }
    }
    if (!goal && f) { goal = { x: f.doorOut.x + (f.doorOut.x - f.doorIn.x) * 2, z: f.doorOut.z + (f.doorOut.z - f.doorIn.z) * 2 }; }
    if (!f || Math.hypot(s.pos.x - goal.x, s.pos.z - goal.z) < 1.2 || (s.surT = (s.surT || 0) + dt) > 25) { this.vanish(s); return; }
    this.moveToward(s, goal.x, goal.z, 2.4, dt);
    this.animate(s, dt);
  }
  vanish(s) {
    this.pending.push({ type: s.type === 'commander' ? 'officer' : s.type, faction: s.faction, t: 30 + Math.random() * 30 });
    this.remove(s);
  }
  // The defeated come back near one of their own forts and walk home; a side
  // with no forts comes back scattered and unarmed.
  respawnPending(dt) {
    for (const p of this.pending) p.t -= dt;
    for (const p of this.pending.filter((q) => q.t <= 0)) {
      const forts = this.ownForts(p.faction);
      if (forts.length) {
        const f = forts[Math.floor(Math.random() * forts.length)];
        const at = this.farSpot(45, p.faction, f.center, 34);
        if (!at) { p.t = 5; continue; }
        this.pending.splice(this.pending.indexOf(p), 1);
        const sq = this.newSquad(at, p.faction); sq.mode = 'return'; sq.home = f; sq.attack = false;
        const s = this.add(p.faction, p.type, at.x, at.y, at.z, sq, true);
        s.setRole('squad'); s.home = f;
      } else {
        if (this.spawnScattered(p.faction, 1, false)) this.pending.splice(this.pending.indexOf(p), 1);
        else p.t = 5;
      }
    }
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
      const gy = this.ground(pl.pos.x + (Math.random() - 0.5) * 2, pl.pos.z + (Math.random() - 0.5) * 2, pl.pos.y + 1);
      if (gy != null) { s.pos.set(pl.pos.x + (Math.random() - 0.5) * 2, gy, pl.pos.z + (Math.random() - 0.5) * 2); s.raft = null; return; }
    }
    const [ox, oz] = SEATS[s.seat];
    s.pos.set(raft.x + ox, SEA + 0.18, raft.z + oz);
    s.speed = 0; s.crouch = true;
  }

  turn(a, b, k) {
    const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return a + d * Math.min(1, k);
  }
  settle(s, dt) {
    if (s.swimming) return;
    const gy = this.ground(s.pos.x, s.pos.z, s.pos.y);
    if (gy != null) s.pos.y += (gy - s.pos.y) * Math.min(1, dt * 10);
  }
  // returns true when arrived
  moveToward(s, tx, tz, speed, dt) {
    const dx = tx - s.pos.x, dz = tz - s.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { s.speed = 0; this.settle(s, dt); return true; }
    const base = Math.atan2(-dx, -dz);
    if (s.swimming) speed = Math.min(speed, 2.2);
    const step = Math.min(d, speed * dt);
    const climb = s.trapT > 3 ? 2.1 : 1.05;    // scramble out of a hole
    // keep turning the same way around an obstacle (no left-right flip-flop)
    const so = s.steerO || 0;
    const order = so ? [0, so, so * 2, so * 3.2, -so, -so * 2, -so * 3.2] : [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    for (let pass = 0; pass < 2; pass++) for (const o of order) {
      // first pass: dry land only (ahead-ish); second: water too
      if (pass === 0 && Math.abs(o) > 1.3 && !s.swimming) continue;
      const a = base + o;
      const nx = s.pos.x - Math.sin(a) * step, nz = s.pos.z - Math.cos(a) * step;
      let gy = this.ground(nx, nz, s.pos.y), swim = false;
      if (gy == null && pass === 1) { const wv = this.water(nx, nz); if (wv) { gy = wv.y; swim = wv.swim; } }
      if (s.faction === 'enemy' && this.game.cabin && this.game.cabin.covers(nx, nz)) continue;   // nobody gets into the cabin
      if (gy != null && gy - s.pos.y <= climb && gy - s.pos.y > -3) {
        if (gy - s.pos.y > 0.5) s.climbT = gy - s.pos.y > 1.2 ? 0.8 : 0.35;
        s.pos.x = nx; s.pos.z = nz; s.pos.y += (gy - s.pos.y) * Math.min(1, dt * 12);
        s.swimming = swim;
        s.yaw = this.turn(s.yaw, a, dt * 6);
        s.speed = speed; s.stuckT = o === 0 ? 0 : s.stuckT + dt * 0.5;
        if (o) { s.steerO = Math.sign(o) * 0.6; s.steerT = 0; } else if ((s.steerT = (s.steerT || 0) + dt) > 0.6) { s.steerO = 0; s.steerT = 0; }
        return false;
      }
    }
    s.stuckT += dt; s.speed = 0;
    return false;
  }

  // ------------------------------------------------------------ animation
  // Only the nearest soldiers get every-frame full animation (quality
  // setting); detail drops with distance.
  updateLod(dt) {
    this.lodT -= dt;
    if (this.lodT > 0) return;
    this.lodT = 0.5;
    const g = this.game, cam = g.camera.position;
    const budget = g.quality.animated || 16;
    const alive = this.list.filter((s) => s.alive);
    for (const s of alive) s.camD = Math.hypot(s.pos.x - cam.x, s.pos.z - cam.z);
    alive.sort((a, b) => a.camD - b.camD);
    alive.forEach((s, i) => {
      s.full = i < budget;
      s.rig.setLod(s.camD < (g.quality.detail || 30) ? 0 : 1);
    });
  }
  animate(s, dt) {
    const g = this.game, rig = s.rig;
    const pd = Math.hypot(s.pos.x - g.player.pos.x, s.pos.z - g.player.pos.z);
    const vis = pd < (g.settings.renderDist + 1) * 16;
    rig.root.visible = vis;
    if (s.mark) {
      s.mark.visible = vis && pd < 90 && pd > 2 && s.alive;
      s.mark.scale.setScalar((s.inSquad ? 0.42 : 0.34) * (1 + s.markPop * 0.8));
    }
    rig.place(s.pos, s.yaw, s.swimming ? s.pos.y : this.groundY(s));
    if (!vis) return;
    // soldiers outside the animation budget update their pose 4x less often
    s.animAcc += dt;
    if (!s.full && s.animAcc < 0.12 && s.alive) return;
    const adt = s.animAcc; s.animAcc = 0;
    const tgt = s.target;
    let look = 0, pitch = 0;
    if (tgt && s.alive) {
      const want = Math.atan2(-(tgt.pos.x - s.pos.x), -(tgt.pos.z - s.pos.z));
      look = Math.max(-1, Math.min(1, ((want - s.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
      const ty = tgt.kind === 'player' ? g.player.pos.y + 1.2 : tgt.pos.y + 1.2;
      pitch = Math.atan2(ty - (s.pos.y + 1.45), Math.hypot(tgt.pos.x - s.pos.x, tgt.pos.z - s.pos.z));
    }
    rig.pose({
      speed: s.speed, run: s.speed > 4.3, crouch: s.crouch, aim: !!tgt && s.armed && s.weapon !== 'knife' && (s.peeking || !s.crouch || !(s.cover && s.cover.covered)),
      look, pitch, fired: s.fired,
      reload: s.reloadT > 0 ? 1 - s.reloadT / s.T.reload : null,
      throwT: s.throwT > 0 ? s.throwT / 0.6 : null,
      climb: s.climbT > 0, swim: s.swimming, surrender: s.surrender,
      dead: s.alive ? null : s.deadT, fallDir: s.fallDir || 1,
    }, adt);
  }
  groundY(s) {
    if (!s.alive || s.raft) return s.pos.y;
    const gy = this.ground(s.pos.x, s.pos.z, s.pos.y + 0.5);
    return gy ?? s.pos.y;
  }

  // -------------------------------------------------------------- combat
  tryFire(s, dt, dist) {
    if (!s.armed || s.weapon === 'knife' || dist > s.T.range || s.reloadT > 0) return;
    if (s.swimming && s.weapon !== 'pistol') return;     // long guns can't be used while swimming
    if (s.burstLeft > 0) {
      s.burstT -= dt;
      if (s.burstT <= 0) { s.burstT = s.T.burstGap || 0.1; s.burstLeft--; this.shoot(s, dist); }
      return;
    }
    if (s.cool > 0) return;
    if (s.ammo <= 0) {
      s.reloadT = s.T.reload;
      if (s.faction === 'ally' && Math.random() < 0.5) this.callout(s, 'reloading');
      return;
    }
    s.cool = s.T.rate * (0.8 + Math.random() * 0.5);
    s.burstLeft = (s.T.burst || 1) - 1; s.burstT = s.T.burstGap || 0.1;
    this.shoot(s, dist);
  }
  shoot(s, dist) {
    const g = this.game, pl = g.player, tgt = s.target;
    if (!tgt) return;
    s.ammo--; s.fired = true;
    const muzzle = s.rig.muzzle(new THREE.Vector3());
    if (!isFinite(muzzle.x) || muzzle.distanceTo(s.pos) > 3) muzzle.set(s.pos.x - Math.sin(s.yaw) * 0.6, s.pos.y + 1.45, s.pos.z - Math.cos(s.yaw) * 0.6);
    const target = tgt.kind === 'player' ? new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.crouch ? 0.9 : 1.2), pl.pos.z)
      : new THREE.Vector3(tgt.pos.x, tgt.pos.y + (tgt.ref && tgt.ref.crouch ? 0.8 : 1.2), tgt.pos.z);
    const acc = s.faction === 'ally' ? ALLY_ACC[this.diff] : ACC[this.diff];
    let p = acc * (s.T.acc || 1) * Math.max(0.2, Math.min(1, 1.15 - dist / s.T.range));
    const night = this.isNight() && !g.dayOnly;
    if (tgt.kind === 'player') {
      if (Math.hypot(pl.vel.x, pl.vel.z) > 3) p *= 0.7;
      if (pl.crouch) p *= 0.8;
      if (night && !g.lightOn) p *= 0.6;
    } else if (night) p *= 0.75;
    if (tgt.kind === 'soldier' && tgt.ref.crouch) p *= 0.6;      // harder to hit in cover
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
    // incoming fire near the player's squad puts them under fire too
    if (s.faction === 'enemy' && end.distanceTo(pl.pos) < 12) { this.contactT = 0; this.contactPos = s.pos.clone(); }
    this.tracer(muzzle, end, FACTIONS[s.faction].tracer);
    sfx.shot(s.T.sound, Math.max(0, 1 - g.camera.position.distanceTo(muzzle) / 110) * 0.8);
    g.animals.noise(s.pos, 35);
    if (s.faction === 'ally') this.hear(s.pos, 50, 'enemy');
    else this.hear(s.pos, 40, 'ally');
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
    s.grenades--; s.gcool = 9 + Math.random() * 4; s.throwT = 0.6;
    const from = new THREE.Vector3(s.pos.x, s.pos.y + 1.6, s.pos.z);
    const to = new THREE.Vector3(at.x + (Math.random() - 0.5) * 3, at.y + 0.3, at.z + (Math.random() - 0.5) * 3);
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    const T = Math.max(0.7, Math.min(1.8, d / 13));
    const vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y + 0.5 * 20 * T * T) / T, (to.z - from.z) / T);
    g.explosives.throw('grenade', from, vel, s.faction);
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
  plantAtDoor(s, f, owner = s.faction) {
    const g = this.game, w = g.world;
    const ox = Math.sign(Math.round(f.doorOut.x - f.doorIn.x)), oz = Math.sign(Math.round(f.doorOut.z - f.doorIn.z));
    const [cx, cy, cz] = f.doorCells[Math.floor(Math.random() * 2) * 3];
    const x = cx + ox, y = cy, z = cz + oz;
    if (w.get(x, y, z) !== B.AIR) return;
    w.set(x, y, z, B.TNT);
    g.explosives.igniteTNT(x, y, z, 8, owner === 'ally' ? 'player' : 'enemy');
    s.squad.tnt--;
    for (const m of s.squad.members) if (m.pos.distanceTo(s.pos) < 12) { m.fleeT = 6; m.fleeFrom = new THREE.Vector3(x, y, z); }
    if (owner === 'ally') this.callout(s, 'tnt');
  }

  // Player shots: nearest soldier of `faction` (or the tank).
  raycast(origin, dir, maxDist, faction = 'enemy') {
    this.ray.set(origin, dir);
    let best = null, bd = maxDist;
    for (const s of this.list) {
      if (!s.alive || s.faction !== faction) continue;
      const p = s.pos;
      if (Math.abs(p.x - origin.x) > maxDist + 2 || Math.abs(p.z - origin.z) > maxDist + 2) continue;
      const h = s.crouch ? 1.35 : 1.88;
      this.tmpBox.min.set(p.x - 0.32, p.y, p.z - 0.32);
      this.tmpBox.max.set(p.x + 0.32, p.y + h, p.z + 0.32);
      const hit = this.ray.intersectBox(this.tmpBox, this.v);
      if (hit) {
        const d = hit.distanceTo(origin);
        if (d < bd) { bd = d; best = { soldier: s, dist: d, point: hit.clone(), head: hit.y > p.y + h - 0.4 }; }
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
    s.hp -= dmg; s.hurtT = 0;
    const g = this.game;
    const col = g.settings.blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3];
    g.particles.burst(s.pos.x, s.pos.y + (head ? 1.65 : 1.2), s.pos.z, col, g.settings.blood ? 6 : 4, 1.2, 0.6, 14);
    if (s.hp <= 0) { this.kill(s, by, silent && unaware); return true; }
    this.alertSquad(s.squad, by === 'player' ? g.player.pos : s.pos);
    s.alerted = true; s.coverT = 0;   // move to better cover
    s.cool = Math.min(s.cool, 0.6);
    return false;
  }
  kill(s, by, silent = false) {
    s.alive = false; s.deadT = 0; s.speed = 0; s.raft = null; s.crouch = false;
    s.fallDir = Math.random() < 0.6 ? 1 : -1;
    if (s.mark) s.mark.visible = false;
    if (s.selected) s.selected = false;
    const g = this.game;
    if (by === 'player' && s.faction === 'enemy') { g.stats.enemies = (g.stats.enemies || 0) + 1; g.hud.killNote(); }
    if (s.faction === 'ally') this.callout(null, 'manDown', s.pos);
    if (!silent) this.alertSquad(s.squad, g.player.pos);
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
    for (const s of this.list.slice()) {
      if (!s.alive) continue;
      if (s.role === 'garrison' && s.home === f && s.faction !== owner) { s.post = null; s.home = null; s.setRole('squad'); const sq = this.newSquad(s.pos, s.faction); sq.mode = 'return'; sq.members.push(s); if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s); s.squad = sq; }
      if (s.faction !== owner || !F.inside(f, s.pos)) continue;
      if (s.inSquad) { if (s.role === 'attack') { s.setRole('defend'); s.defendFort = f; } continue; }
      this.joinGarrison(s, f);
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
    s.rig.dispose();
    if (s.mark) s.mark.material.dispose();
    this.list = this.list.filter((x) => x !== s);
    if (s.squad) s.squad.members = s.squad.members.filter((m) => m !== s);
  }

  spawnTank() {
    const at = this.farSpot(90);
    if (!at) return;
    this.tank = new Tank(this, at.x, at.y, at.z);
    this.game.hud.toast(t('hud.tankSpotted'), 'warn');
  }

  // Player died: enemies lose track of them.
  playerDied() {
    for (const sq of this.squads) {
      if (sq.mode === 'engage') { sq.mode = sq.resume || 'march'; sq.alert = null; for (const m of sq.members) m.alerted = false; }
    }
    for (const s of this.list) if (s.target && s.target.kind === 'player') s.target = null;
  }
  // Play with Allies and no forts left: the player comes back with 4-5 allies.
  rallyAround(pos, n) {
    const allies = this.list.filter((s) => s.alive && s.faction === 'ally' && s.role !== 'garrison' && !s.surrender)
      .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos));
    let k = 0;
    for (const s of allies) {
      if (k >= n) break;
      const x = pos.x + (Math.random() - 0.5) * 4, z = pos.z + (Math.random() - 0.5) * 4;
      const y = this.ground(x, z, pos.y + 1);
      if (y == null) continue;
      s.pos.set(x, y, z); s.raft = null; this.toPlayerSquad(s); s.setRole('follow'); k++;
    }
    while (k < n) { // not enough allies alive: some come back early
      const s = this.add('ally', k === 0 ? 'gunner' : 'rifleman', pos.x + (Math.random() - 0.5) * 3, pos.y, pos.z + (Math.random() - 0.5) * 3, this.psq, true);
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
    const sq = this.mgr.newSquad(this.pos, 'enemy'); sq.mode = 'return';
    const c = this.mgr.add('enemy', 'commander', this.pos.x + 2.2, this.pos.y, this.pos.z, sq, true);
    this.mgr.alertSquad(sq, g.player.pos);
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
