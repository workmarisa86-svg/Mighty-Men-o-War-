// Siege (2.8, 3.0): a survival mode on the Town Life land with no town. You
// start in the morning with endless blocks and dynamite: build a shelter.
// Every evening at eight a wave of outlaws comes, one man more each night.
// They can't break anything: it's a siege. Some camp round your shelter and
// shoot whenever they get a clear line at you; some prowl the woods where
// the game is. Every fifth night the gang leader comes with extra men and
// they hunt you down wherever you are, along any open way (your tunnels too).
// A wave not finished by the next evening is joined by the next one.
//
// Food is the clock: you have none but what you hunt, meat spoils (raw in
// two days, cooked in four) and gunfire drives the game away. Shot dead, you
// lose your food and wake far from the outlaws; starve, and the siege is over.
// Your best (waves survived) is kept. The Siege is saved in its own slot.
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { RIVALS } from './frontier.js';
import { ITEMS } from './items.js';
import { coords } from './hidden.js';
import { deleteSiege } from './storage.js';
import { SiegeHouses } from './siegehouses.js';

const WAVE_HOUR = 20;
// truly endless (the count is infinite: using one never takes one away): blocks, dynamite, knives, guns
const ENDLESS = ['dirt', 'wood', 'stone', 'brick', 'glass', 'thatch', 'sand', 'clay', 'fence', 'gate', 'door', 'ladder', 'loophole', 'bell', 'dynamite', 'chest', 'knife', 'revolver', 'lever', 'shotgun'];
const BEST_KEY = 'mmow-siege-best';
const SPOILS = { meat_raw: 2, meat_cooked: 4 };         // days before it goes bad
const BOSS_EVERY = 5;

export function siegeBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } }

export class Siege {
  constructor(town, saved = null) {
    this.T = town; this.game = town.game;
    const g = this.game;
    this.houses = new SiegeHouses(this);           // houses for meat (siegehouses.js)
    this.wave = saved ? saved.wave || 0 : 0;       // waves survived
    this.started = saved ? saved.started ?? this.wave : 0;   // waves that have come
    this.deaths = saved ? saved.deaths || 0 : 0;
    this.food = saved && saved.food ? saved.food : { meat_raw: [], meat_cooked: [] };     // batches: { n, at }
    this.men = null;             // the attackers out there now (every wave not yet finished)
    this.nextAt = saved && saved.nextAt != null ? saved.nextAt : Math.floor(g.time) + WAVE_HOUR / 24;
    if (!saved && g.time > this.nextAt) this.nextAt += 1;
    this.refillT = 0; this.foodT = 0; this.over = false; this.bestAtStart = siegeBest();
    // a saved Siege: carry on (the waves that were out come again)
    if (saved) { this.refill(); if (saved.fighting) this.restart = Math.max(1, saved.fighting); g.hud.toast(t('siege.welcomeBack', { n: this.wave + 1 })); return; }
    // no food: hunt (skin what you shoot, cook it at a campfire you light with the flint)
    for (const [id, n] of [['revolver', 1], ['lever', 1], ['shotgun', 1], ['knife', 1], ['flint', 1], ['medkit', 3]]) if (g.count(id) < n) g.give(id, n - g.count(id), true);
    if (g.inv.counts.bread) g.inv.counts.bread = 0;
    this.refill();
    g.hud.bigMessage(t('siege.title'), t('siege.intro'));
  }
  size(n) { return n + 1; }                       // wave 1: 2 men, wave 2: 3...
  boss(n) { return n % BOSS_EVERY === 0; }
  refill() {
    const g = this.game;
    let changed = false;
    for (const id of ENDLESS) if (g.inv.counts[id] !== Infinity) { if (!g.inv.hotbar.includes(id) && !g.inv.counts[id]) g.give(id, 1, true); g.inv.counts[id] = Infinity; changed = true; }
    if (changed) g.hud.dirtyHotbar = true;
  }
  // a wave comes (eight o'clock, or the Ready button). Men still out from an
  // earlier wave stay: the new ones join them.
  startWave() {
    const g = this.game, T = this.T, P = g.player.pos, n = this.started + 1, boss = this.boss(n);
    this.started = n;
    this.nextAt = Math.floor(g.time) + 1 + WAVE_HOUR / 24;
    const a0 = Math.random() * Math.PI * 2, size = this.size(n) + (boss ? 3 : 0);
    this.men = this.men || [];
    for (let k = 0; k < size; k++) {
      let a = a0 + (k / size - 0.5) * (size > 6 ? 2.4 : 1.2), r = 60 + Math.random() * 10;
      for (let tries = 0; tries < 12; tries++) {         // somewhere dry (not out in a lake)
        const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r), sy = g.world.surfaceY(x, z);
        if (g.world.get(x, sy + 1, z) !== B.WATER && sy > 1) break;
        a += 0.5; r = 45 + Math.random() * 30;
      }
      const lead = boss && k === 0, gang = RIVALS[(n + k) % RIVALS.length];
      const v = T.frontier.rivalMan(gang, 200 + (n * 13 + k) % 90, { x: P.x + Math.cos(a) * r, y: P.y, z: P.z + Math.sin(a) * r },
        { hunter: true, provoked: true, guns: lead || (n > 4 && k % 3 === 0) ? ['lever', 'revolver'] : n > 8 && k % 4 === 1 ? ['shotgun', 'revolver'] : ['revolver'] });
      v.rival = 'siege'; v.siege = true; v.money = 0; v.goods = []; v.waveN = n;      // (no coins, no food: only his gun)
      // camp round your shelter, prowl the woods, or (boss nights) hunt you down
      v.role = boss ? 'hunt' : k % 3 === 2 ? 'roam' : 'camp';
      v.slot = k; v.fight = { armed: v.guns[0] }; T.folk.armed(v, v.guns[0]);
      if (lead) { v.leader = true; v.hp = 450; v.name = t('siege.leader'); }
      v.ai = (o, dt, d) => this.manAi(o, dt, d);
      this.men.push(v);
    }
    this.camp = { x: P.x, z: P.z, t: g.time };
    g.hud.bigMessage(t(boss ? 'siege.bossTitle' : 'siege.waveTitle', { n }), t(boss ? 'siege.bossSub' : 'siege.waveSub', { k: size }));
    sfx.alert(); sfx.bell(0.8);
  }
  // shoot when there's a clear line (doors, glass and walls stop their bullets)
  shoot(v, dt, d) {
    const F = this.T.folk;
    v.yaw = Math.atan2(-(this.game.player.pos.x - v.pos.x), -(this.game.player.pos.z - v.pos.z));
    if (d < 45 && this.clearShot(v)) F.shootAt(v, dt, 0.8);
  }
  manAi(v, dt, d) {
    const g = this.game, F = this.T.folk, P = g.player.pos, w = g.world;
    if (!v.alive) return true;
    if (v.surrendered > 0) return false;
    // stuck inside the ground (a hill, a hole filled over him): up onto the surface
    const bx = Math.floor(v.pos.x), bz = Math.floor(v.pos.z);
    if (SOLID[w.get(bx, Math.floor(v.pos.y + 0.2), bz)] && SOLID[w.get(bx, Math.floor(v.pos.y + 1.2), bz)]) { v.pos.y = w.surfaceY(bx, bz) + 1; v.route = []; }
    // far off (you woke up somewhere else): they make their way back toward you
    if (d > 110) {
      if (d > 180 && !F.visible(v)) {
        const a = Math.atan2(v.pos.z - P.z, v.pos.x - P.x), x = P.x + Math.cos(a) * 120, z = P.z + Math.sin(a) * 120, sy = w.surfaceY(Math.floor(x), Math.floor(z));
        if (w.get(Math.floor(x), sy + 1, Math.floor(z)) !== B.WATER) { v.pos.set(x, sy + 1, z); v.route = []; }
      } else { F.goDirect(v, P, 6, dt, 4); v.crouch = false; }
      return true;
    }
    const sees = d < 45 && this.clearShot(v);
    if (v.role === 'hunt') {
      // the leader's men: after you wherever you go, along any open way (tunnels too)
      if (d > 3) { F.goDirect(v, P, sees && d < 14 ? 3.4 : 5.4, dt, 2.5); v.crouch = false; } else v.speed = 0;
      if (sees) this.shoot(v, dt, d);
      return true;
    }
    if (v.role === 'roam') {
      // prowling the woods where the game is; seen you: after you a while
      if (sees) v.chaseT = 20;
      v.chaseT = (v.chaseT || 0) - dt;
      if (v.chaseT > 0) {
        if (d > 16) F.goDirect(v, P, 5, dt, 14); else v.speed = 0;
        v.crouch = false; if (sees) this.shoot(v, dt, d);
        return true;
      }
      if (!v.prowl || Math.hypot(v.prowl.x - v.pos.x, v.prowl.z - v.pos.z) < 3 || (v.prowlT = (v.prowlT || 0) - dt) <= 0) {
        const herds = g.animals.herds.filter((h) => !h.pen && h.members.some((a) => a.state !== 'dead') && Math.hypot(h.cx - P.x, h.cz - P.z) < 140);
        const h = herds[Math.floor(Math.random() * herds.length)];
        const cx = h ? h.cx : P.x, cz = h ? h.cz : P.z, a = Math.random() * 6.28, r = 8 + Math.random() * 25;
        const x = Math.max(8, Math.min(w.W - 8, cx + Math.cos(a) * r)), z = Math.max(8, Math.min(w.D - 8, cz + Math.sin(a) * r));
        v.prowl = { x, y: w.surfaceY(Math.floor(x), Math.floor(z)) + 1, z }; v.prowlT = 40; v.route = [];
      }
      F.goDirect(v, v.prowl, 2.6, dt, 2); v.crouch = false;
      return true;
    }
    // camping round your shelter: each at his own place in the ring, in cover, shooting when you show yourself
    const C = this.camp;
    const ang = (v.slot / Math.max(1, this.men.length)) * Math.PI * 2, R = 24 + (v.slot % 3) * 6;
    const spot = { x: C.x + Math.cos(ang) * R, z: C.z + Math.sin(ang) * R };
    spot.y = w.surfaceY(Math.floor(spot.x), Math.floor(spot.z)) + 1;
    if (Math.hypot(spot.x - v.pos.x, spot.z - v.pos.z) > 2) { F.goDirect(v, spot, 4.4, dt, 1.5); v.crouch = false; if (sees) this.shoot(v, dt, d); return true; }
    v.speed = 0;
    v.peekT = (v.peekT || 0) - dt;
    if (v.peekT <= 0) { v.peek = !v.peek; v.peekT = v.peek ? 2.2 : 1.6; }
    v.crouch = !v.peek;
    if (v.peek && sees) this.shoot(v, dt, d);
    return true;
  }
  // nothing solid between him and you (a door, glass, a wall)
  clearShot(v) {
    const P = this.game.player.pos, w = this.game.world;
    const dx = P.x - v.pos.x, dy = P.y + 1.2 - (v.pos.y + 1.4), dz = P.z - v.pos.z, L = Math.hypot(dx, dy, dz) || 1;
    return !w.raycast(v.pos.x, v.pos.y + 1.4, v.pos.z, dx / L, dy / L, dz / L, L - 0.6, false, 'bullet');
  }
  // gunfire: the game nearby takes fright and moves off (hunting near home gets harder)
  onShot() {
    const g = this.game, P = g.player.pos, w = g.world;
    for (const h of g.animals.herds) {
      if (h.pen || !h.members.length) continue;
      const dx = h.cx - P.x, dz = h.cz - P.z, d = Math.hypot(dx, dz);
      if (d > 70) continue;
      const k = 90 / (d || 1);
      h.cx = Math.max(20, Math.min(w.W - 20, h.cx + dx * k)); h.cz = Math.max(20, Math.min(w.D - 20, h.cz + dz * k));
      for (const a of h.members) if (a.state !== 'dead' && !a.T.fierce && !a.T.pack) { a.state = 'flee'; a.fleeing = true; a.alarmed = true; a.timer = 10; a.from = P.clone(); }
    }
  }
  // meat goes bad: each batch keeps its own age (what you eat or trade goes first from the oldest)
  spoil() {
    const g = this.game;
    for (const [id, days] of Object.entries(SPOILS)) {
      const B2 = this.food[id] || (this.food[id] = []);
      const have = g.inv.counts[id] || 0;
      let sum = B2.reduce((n, q) => n + q.n, 0);
      if (have > sum) B2.push({ n: have - sum, at: g.time });
      else if (have < sum) { let gone = sum - have; while (gone > 0 && B2.length) { const k = Math.min(gone, B2[0].n); B2[0].n -= k; gone -= k; if (!B2[0].n) B2.shift(); } }
      sum = 0;
      const bad = B2.filter((q) => g.time - q.at > days).reduce((n, q) => n + q.n, 0);
      if (bad) {
        this.food[id] = B2.filter((q) => g.time - q.at <= days);
        g.inv.counts[id] = Math.max(0, have - bad); g.hud.dirtyHotbar = true;
        g.hud.toast(t('siege.spoiled', { n: bad, item: t('item.' + id) }));
      }
    }
  }
  update(dt) {
    const g = this.game;
    if (this.over) return;
    this.houses.update();
    this.refillT -= dt;
    if (this.refillT <= 0) { this.refillT = 1; this.refill(); }
    this.foodT -= dt;
    if (this.foodT <= 0) { this.foodT = 1; this.spoil(); }
    if (this.restart && !this.men) { this.started = Math.max(0, this.started - this.restart); for (let k = 0; k < this.restart; k++) this.startWave(); this.restart = 0; }
    if (g.time >= this.nextAt) this.startWave();
    // the camp follows you if you move house
    if (this.camp && Math.hypot(this.camp.x - g.player.pos.x, this.camp.z - g.player.pos.z) > 60 && g.time - this.camp.t > 0.04) this.camp = { x: g.player.pos.x, z: g.player.pos.z, t: g.time };
    if (this.men) {
      const left = this.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
      if (!left.length) {
        this.wave = this.started; this.men = null;
        // the next one: at the next eight o'clock (tonight, if it isn't eight yet)
        this.nextAt = Math.floor(g.time) + WAVE_HOUR / 24; if (this.nextAt <= g.time + 0.02) this.nextAt += 1;
        if (this.wave > siegeBest()) try { localStorage.setItem(BEST_KEY, String(this.wave)); } catch { /* private mode */ }
        g.give('medkit', 2, true); g.hud.dirtyHotbar = true;
        const n = this.wave + 1;
        g.hud.bigMessage(t('siege.survived', { n: this.wave }), t(this.boss(n) ? 'siege.survivedBoss' : 'siege.survivedSub', { n, k: this.size(n) + (this.boss(n) ? 3 : 0) }));
        sfx.done();
      }
    }
  }
  // killed: starving ends the siege (your score is kept); shot dead, you lose
  // your food and wake far from every outlaw, healed and not starving
  playerDied(cause) {
    const g = this.game, p = g.player, w = g.world;
    if (cause === 'starve') { this.gameOver(); return; }
    this.deaths = (this.deaths || 0) + 1;
    let lost = 0;
    for (const id of Object.keys(g.inv.counts)) if (ITEMS[id] && ITEMS[id].food && g.inv.counts[id] !== Infinity) { lost += g.inv.counts[id] || 0; g.inv.counts[id] = 0; }
    const foes = (this.men || []).filter((m) => m.alive && !m.away);
    let spot = null;
    for (let k = 0; k < 400 && !spot; k++) {
      const x = 24 + Math.floor(Math.random() * (w.W - 48)), z = 24 + Math.floor(Math.random() * (w.D - 48)), sy = w.surfaceY(x, z);
      if (sy <= 1 || w.get(x, sy + 1, z) === B.WATER || w.get(x, sy, z) === B.LOG || SOLID[w.get(x, sy + 1, z)] || SOLID[w.get(x, sy + 2, z)]) continue;
      if (foes.some((m) => Math.hypot(m.pos.x - x, m.pos.z - z) < 80)) continue;
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
  gameOver() {
    const g = this.game, p = g.player;
    this.over = true;
    p.health = 100; p.hunger = 100; g.hungerStage = 0;          // (no dying again behind the screen)
    const best = Math.max(siegeBest(), this.wave), record = this.wave > this.bestAtStart;      // (a new record this siege)
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* private mode */ }
    deleteSiege();                                                 // (the siege is over: nothing to continue)
    g.app.openPanel('siegeover', { wave: this.wave, best, record });
  }
  // the attackers, for the map (every one of them, however far)
  marks() { return (this.men || []).filter((m) => m.alive && !m.away).map((m) => ({ x: m.pos.x, z: m.pos.z, boss: !!m.leader })); }
  toSave() { return { wave: this.wave, started: this.started, deaths: this.deaths || 0, nextAt: this.nextAt, food: this.food, fighting: this.men ? new Set(this.men.filter((m) => m.alive && !m.away).map((m) => m.waveN)).size : 0 }; }
  hudText() {
    const g = this.game;
    const h = Math.max(0, (this.nextAt - g.time) * 24), hh = Math.floor(h), mm = Math.floor((h - hh) * 60), time = hh + ':' + String(mm).padStart(2, '0');
    if (this.men) return t('siege.hudFight', { n: this.started, k: this.men.filter((m) => m.alive && !m.away).length, time });
    return t('siege.hudWait', { n: this.started + 1, time, best: siegeBest() });
  }
  options() {
    const out = [];
    if (this.houses.placing) out.push({ a: 'shcancel', label: t('sh.cancel'), run: () => this.houses.cancel() });
    else out.push({ a: 'shtrade', label: t('sh.trade'), run: () => this.game.app.openPanel('siegehouses', {}) });
    if (!this.men && !this.over) out.push({ a: 'siegego', label: t('siege.ready'), run: () => this.startWave() });
    return out;
  }
}
