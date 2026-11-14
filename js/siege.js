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

const WAVE_HOUR = 20;
const ENDLESS = ['dirt', 'wood', 'stone', 'brick', 'glass', 'thatch', 'fence', 'gate', 'door', 'ladder', 'loophole', 'bell', 'dynamite', 'chest'];
const BEST_KEY = 'mmow-siege-best';

export function siegeBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } }

export class Siege {
  constructor(town) {
    this.T = town; this.game = town.game;
    const g = this.game;
    this.wave = 0;               // waves survived
    this.men = null;             // the wave now attacking
    this.charges = [];
    this.nextAt = Math.floor(g.time) + WAVE_HOUR / 24;
    if (g.time > this.nextAt) this.nextAt += 1;
    this.refillT = 0; this.over = false;
    for (const [id, n] of [['revolver', 1], ['lever', 1], ['shotgun', 1], ['medkit', 3], ['bread', 6]]) if (g.count(id) < n) g.give(id, n - g.count(id), true);
    this.refill();
    g.hud.bigMessage(t('siege.title'), t('siege.intro'));
  }
  size(n) { return n + 1; }                       // wave 1: 2 men, wave 2: 3...
  refill() {
    const g = this.game;
    for (const id of ENDLESS) if ((g.inv.counts[id] || 0) < 64) g.inv.counts[id] = 99;
    g.hud.dirtyHotbar = true;
  }
  // the wave comes now (the "Ready" button, or eight o'clock)
  startWave() {
    const g = this.game, T = this.T, F = T.folk, P = g.player.pos, n = this.wave + 1;
    if (this.men) return;
    this.nextAt = Math.floor(g.time) + 1 + WAVE_HOUR / 24;
    const a0 = Math.random() * Math.PI * 2, size = this.size(n);
    this.men = [];
    for (let k = 0; k < size; k++) {
      const a = a0 + (k / size - 0.5) * (size > 6 ? 2.4 : 1.2), r = 60 + Math.random() * 10;
      const gang = RIVALS[(n + k) % RIVALS.length];
      const v = T.frontier.rivalMan(gang, 200 + k, { x: P.x + Math.cos(a) * r, y: P.y, z: P.z + Math.sin(a) * r }, { hunter: true, provoked: true, guns: n > 4 && k % 3 === 0 ? ['lever', 'revolver'] : n > 8 && k % 4 === 1 ? ['shotgun', 'revolver'] : ['revolver'] });
      v.rival = 'siege'; v.siege = true; v.money = 5 + n * 2; v.seenT = 0; v.boomT = 4 + Math.random() * 4;
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
    v.seeT = (v.seeT || 0) - dt;
    if (v.seeT <= 0) { v.seeT = 0.5; if (F.sees(v, 45)) v.seenT = 0; }
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
  playerDied() {
    const g = this.game;
    this.over = true;
    const best = Math.max(siegeBest(), this.wave);
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* private mode */ }
    g.app.openPanel('siegeover', { wave: this.wave, best });
  }
  hudText() {
    const g = this.game;
    if (this.men) return t('siege.hudFight', { n: this.wave + 1, k: this.men.filter((m) => m.alive && !m.away).length });
    const h = Math.max(0, (this.nextAt - g.time) * 24), hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return t('siege.hudWait', { n: this.wave + 1, time: hh + ':' + String(mm).padStart(2, '0'), best: siegeBest() });
  }
  options() { return this.men || this.over ? [] : [{ a: 'siegego', label: t('siege.ready'), run: () => this.startWave() }]; }
}
