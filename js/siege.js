// Siege (2.8): a survival mode on the Town Life map. You start in the morning
// with endless blocks and dynamite: build a shelter. Every evening at eight a
// wave of outlaws comes for you: one man more each night (2, 3, 4...). They
// shoot whatever they can see, and when walls are in the way they blow a hole
// in them with dynamite, so thick walls and gun slits buy you time. Survive as
// many waves as you can; your best is kept. A Siege is never saved (and never
// touches your Town Life game).
import * as THREE from 'three';
import { B, SOLID, BLOCKS } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { RIVALS } from './frontier.js';
import { ITEMS } from './items.js';
import { coords } from './hidden.js';

const WAVE_HOUR = 20;
// truly endless (the count is infinite: using one never takes one away): blocks, dynamite, knives, guns
const ENDLESS = ['dirt', 'wood', 'stone', 'brick', 'glass', 'thatch', 'sand', 'clay', 'fence', 'gate', 'door', 'ladder', 'loophole', 'bell', 'dynamite', 'chest', 'knife', 'revolver', 'lever', 'shotgun'];
const BEST_KEY = 'mmow-siege-best';

export function siegeBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } }

export class Siege {
  constructor(town, saved = null) {
    this.T = town; this.game = town.game;
    const g = this.game;
    this.wave = saved ? saved.wave || 0 : 0;     // waves survived
    this.deaths = saved ? saved.deaths || 0 : 0;
    this.men = null;             // the wave now attacking
    this.charges = [];
    this.nextAt = saved && saved.nextAt != null ? saved.nextAt : Math.floor(g.time) + WAVE_HOUR / 24;
    if (!saved && g.time > this.nextAt) this.nextAt += 1;
    this.refillT = 0; this.over = false;
    // a saved Siege: carry on (a wave that was under way comes again)
    if (saved) { this.refill(); if (saved.fighting) this.restartWave = true; g.hud.toast(t('siege.welcomeBack', { n: this.wave + 1 })); return; }
    // no food: hunt (skin what you shoot, cook it at a campfire you light with the flint)
    for (const [id, n] of [['revolver', 1], ['lever', 1], ['shotgun', 1], ['knife', 1], ['flint', 1], ['medkit', 3]]) if (g.count(id) < n) g.give(id, n - g.count(id), true);
    if (g.inv.counts.bread) g.inv.counts.bread = 0;
    this.refill();
    g.hud.bigMessage(t('siege.title'), t('siege.intro'));
  }
  size(n) { return n + 1; }                       // wave 1: 2 men, wave 2: 3...
  refill() {
    const g = this.game;
    let changed = false;
    for (const id of ENDLESS) if (g.inv.counts[id] !== Infinity) { if (!g.inv.hotbar.includes(id) && !g.inv.counts[id]) g.give(id, 1, true); g.inv.counts[id] = Infinity; changed = true; }
    if (changed) g.hud.dirtyHotbar = true;
  }
  // the wave comes now (the "Ready" button, or eight o'clock)
  startWave() {
    const g = this.game, T = this.T, F = T.folk, P = g.player.pos, n = this.wave + 1;
    if (this.men) return;
    this.nextAt = Math.floor(g.time) + 1 + WAVE_HOUR / 24;
    const a0 = Math.random() * Math.PI * 2, size = this.size(n);
    this.men = [];
    for (let k = 0; k < size; k++) {
      let a = a0 + (k / size - 0.5) * (size > 6 ? 2.4 : 1.2), r = 60 + Math.random() * 10;
      // somewhere dry (not out in a lake)
      for (let tries = 0; tries < 12; tries++) {
        const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r), sy = g.world.surfaceY(x, z);
        if (g.world.get(x, sy + 1, z) !== B.WATER && sy > 1) break;
        a += 0.5; r = 45 + Math.random() * 30;
      }
      const gang = RIVALS[(n + k) % RIVALS.length];
      const v = T.frontier.rivalMan(gang, 200 + k, { x: P.x + Math.cos(a) * r, y: P.y, z: P.z + Math.sin(a) * r }, { hunter: true, provoked: true, guns: n > 4 && k % 3 === 0 ? ['lever', 'revolver'] : n > 8 && k % 4 === 1 ? ['shotgun', 'revolver'] : ['revolver'] });
      v.rival = 'siege'; v.siege = true; v.money = 0; v.goods = [];      // (no coins, no bread: only his gun)
      v.seenT = 0; v.boomT = 4 + Math.random() * 4;
      v.ai = (o, dt, d) => this.manAi(o, dt, d);
      this.men.push(v);
    }
    g.hud.bigMessage(t('siege.waveTitle', { n }), t('siege.waveSub', { k: size }));
    sfx.alert(); sfx.bell(0.8);
  }
  // like any outlaw (rivalAi: come close, take cover, shoot), but with walls
  // between him and you he blasts his way through
  manAi(v, dt, d) {
    const g = this.game, F = this.T.folk, P = g.player.pos, w = g.world;
    if (!v.alive) return true;
    // stuck inside the ground (a hill, a hole filled over him): up onto the surface
    const bx = Math.floor(v.pos.x), bz = Math.floor(v.pos.z);
    if (SOLID[w.get(bx, Math.floor(v.pos.y + 0.2), bz)] && SOLID[w.get(bx, Math.floor(v.pos.y + 1.2), bz)]) { v.pos.y = w.surfaceY(bx, bz) + 1; v.route = []; }
    // far from you (you woke up somewhere else): they track you down, they never just give up
    if (d > 110) {
      if (d > 180 && !F.visible(v)) {
        const a = Math.atan2(v.pos.z - P.z, v.pos.x - P.x), x = P.x + Math.cos(a) * 120, z = P.z + Math.sin(a) * 120, sy = w.surfaceY(Math.floor(x), Math.floor(z));
        if (w.get(Math.floor(x), sy + 1, Math.floor(z)) !== B.WATER) { v.pos.set(x, sy + 1, z); v.route = []; }
      } else { F.goDirect(v, P, 6, dt, 4); v.crouch = false; }
      return true;
    }
    v.seeT = (v.seeT || 0) - dt;
    // (seeing you through a door or a window isn't a way in: only a clear line counts)
    if (v.seeT <= 0) { v.seeT = 0.5; if (F.sees(v, 45) && this.clearShot(v)) v.seenT = 0; }
    v.seenT += dt; v.boomT -= dt;
    if (v.seenT > 6 && v.boomT <= 0 && d < 40) {
      // the first solid block between him and you, if it is close: a charge there
      const dx = P.x - v.pos.x, dy = P.y + 1 - (v.pos.y + 1), dz = P.z - v.pos.z, L = Math.hypot(dx, dy, dz) || 1;
      const hit = w.raycast(v.pos.x, v.pos.y + 1.2, v.pos.z, dx / L, dy / L, dz / L, 4.5, false, 'bullet');
      const hid = hit ? w.get(hit.x, hit.y, hit.z) : 0;
      if (hit && BLOCKS[hid] && BLOCKS[hid].hard !== Infinity && !w.isLocked(hit.x, hit.y, hit.z)) {
        v.boomT = 9 + Math.random() * 4;
        this.charges.push({ x: hit.x, y: hit.y, z: hit.z, t: 3 });
        F.say(v, 'siege.blast', null, 'warn'); sfx.leather();
      } else if (d > 2.5) { F.goDirect(v, P, 4.6, dt, 2); v.crouch = false; v.yaw = Math.atan2(-dx, -dz); return true; }
    }
    return this.T.frontier.rivalAi(v, dt, d);
  }
  // nothing solid between him and you (a door, glass, a wall)
  clearShot(v) {
    const P = this.game.player.pos, w = this.game.world;
    const dx = P.x - v.pos.x, dy = P.y + 1.2 - (v.pos.y + 1.4), dz = P.z - v.pos.z, L = Math.hypot(dx, dy, dz) || 1;
    return !w.raycast(v.pos.x, v.pos.y + 1.4, v.pos.z, dx / L, dy / L, dz / L, L - 0.6, false, 'bullet');
  }
  blast(c) {
    const g = this.game, w = g.world, T = this.T, P = g.player.pos;
    T.boom(c.x + 0.5, c.y + 0.5, c.z + 0.5);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy * 1.6 + dz * dz > 3.6) continue;
      const x = c.x + dx, y = c.y + dy, z = c.z + dz, id = w.get(x, y, z);
      if (y < 2 || !id || id === B.WATER || w.isLocked(x, y, z) || !BLOCKS[id] || BLOCKS[id].hard === Infinity) continue;
      w.set(x, y, z, B.AIR);
    }
    const d = Math.hypot(P.x - c.x - 0.5, P.y + 1 - c.y, P.z - c.z - 0.5);
    if (d < 4) g.damage(Math.round(45 * (1 - d / 4)), 'blast', new THREE.Vector3(c.x, c.y, c.z));
    T.blastHurt(c.x + 0.5, c.y + 0.5, c.z + 0.5, 3.5, false);
  }
  update(dt) {
    const g = this.game;
    if (this.over) return;
    this.refillT -= dt;
    if (this.refillT <= 0) { this.refillT = 1; this.refill(); }
    for (const c of this.charges) { c.t -= dt; if (c.t <= 0) this.blast(c); }
    this.charges = this.charges.filter((c) => c.t > 0);
    if (this.restartWave && !this.men) { this.restartWave = false; this.startWave(); }
    if (!this.men && g.time >= this.nextAt) this.startWave();
    if (this.men) {
      const left = this.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
      if (!left.length) {
        this.wave++; this.men = null;
        // the next one: at the next eight o'clock (tonight, if it isn't eight yet)
        this.nextAt = Math.floor(g.time) + WAVE_HOUR / 24; if (this.nextAt <= g.time + 0.02) this.nextAt += 1;
        if (this.wave > siegeBest()) try { localStorage.setItem(BEST_KEY, String(this.wave)); } catch { /* private mode */ }
        g.give('medkit', 2, true); g.hud.dirtyHotbar = true;
        g.hud.bigMessage(t('siege.survived', { n: this.wave }), t('siege.survivedSub', { n: this.wave + 1, k: this.size(this.wave + 1) }));
        sfx.done();
      }
    }
  }
  // killed: the siege is over (no hospital)
  // killed: you lose all your food and wake somewhere else in the world (far
  // from the outlaws, on dry land), healed and not starving; the waves go on
  playerDied() {
    const g = this.game, p = g.player, w = g.world;
    this.deaths = (this.deaths || 0) + 1;
    let lost = 0;
    for (const id of Object.keys(g.inv.counts)) if (ITEMS[id] && ITEMS[id].food && g.inv.counts[id] !== Infinity) { lost += g.inv.counts[id] || 0; g.inv.counts[id] = 0; }
    const foes = (this.men || []).filter((m) => m.alive && !m.away);
    let spot = null;
    for (let k = 0; k < 200 && !spot; k++) {
      const x = 24 + Math.floor(Math.random() * (w.W - 48)), z = 24 + Math.floor(Math.random() * (w.D - 48)), sy = w.surfaceY(x, z);
      if (sy <= 1 || w.get(x, sy + 1, z) === B.WATER || w.get(x, sy, z) === B.LOG || SOLID[w.get(x, sy + 1, z)] || SOLID[w.get(x, sy + 2, z)]) continue;
      if (foes.some((m) => Math.hypot(m.pos.x - x, m.pos.z - z) < 60)) continue;
      spot = { x: x + 0.5, y: sy + 1, z: z + 0.5 };
    }
    if (!spot) spot = { ...w.spawn };
    p.pos.set(spot.x, spot.y, spot.z); p.vel.set(0, 0, 0);
    p.health = 100; g.breath = 20; p.hunger = Math.max(60, p.hunger || 0); g.hungerStage = 0;
    g.hud.dirtyHotbar = true;
    const C = coords(spot.x, spot.z, w);
    g.hud.bigMessage(t('siege.diedTitle'), t('siege.diedSub', { x: C.x, y: C.y, n: lost }));
    sfx.done();
  }
  // the attackers, for the map (every one of them, however far)
  marks() { return (this.men || []).filter((m) => m.alive && !m.away).map((m) => ({ x: m.pos.x, z: m.pos.z })); }
  toSave() { return { wave: this.wave, deaths: this.deaths || 0, nextAt: this.nextAt, fighting: !!this.men }; }
  hudText() {
    const g = this.game;
    if (this.men) return t('siege.hudFight', { n: this.wave + 1, k: this.men.filter((m) => m.alive && !m.away).length });
    const h = Math.max(0, (this.nextAt - g.time) * 24), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return t('siege.hudWait', { n: this.wave + 1, time: hh + ':' + String(mm).padStart(2, '0'), best: siegeBest() });
  }
  options() { return this.men || this.over ? [] : [{ a: 'siegego', label: t('siege.ready'), run: () => this.startWave() }]; }
}
