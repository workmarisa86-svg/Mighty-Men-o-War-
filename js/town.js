// Town Life: the peacetime countryside game. Owns the seasons (snow, ice,
// autumn colours), money, honor, the law (witnesses, bounty, the posse,
// jail), shops, jobs, the farm and livestock, and saving the one
// persistent world. Built on the same engine as War (blocks, controls,
// saving, settings, language).
import { B } from './blocks.js';
import { SEA } from './config.js';
import { paintSeason } from './textures.js';
import { Townsfolk } from './townsfolk.js';
import { Farm, SEASON_DAYS } from './farm.js';
import { sfx, setWind } from './audio.js';
import { startFolk, stopFolk } from './folk.js';
import { t } from './i18n.js';
import { saveTown } from './storage.js';
import { TOWN_LAYOUT } from './towngen.js';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// what each shop sells and buys (base prices in coins)
export const SHOPS = {
  general: { sells: { seed_wheat: 2, seed_carrot: 3, seed_cabbage: 3, bucket: 8, bread: 4, flint: 5, medkit: 15, glass: 3, fence: 2 },
    buys: { wheat: 3, carrot: 3, cabbage: 4, egg: 2, milk: 4, wood: 1, stone: 1, clay: 1, sand: 1, brick: 2, glass: 2, charcoal: 1, thatch: 1, iron: 4, gold: 45 } },
  butcher: { sells: { meat_cooked: 6, meat_raw: 4 }, buys: { meat_raw: 3, meat_cooked: 4 } },
  hunting: { sells: { knife: 10, pistol: 45, rifle: 80, sniper: 140 }, buys: { hide: 7, bear_hide: 65, meat_raw: 2 } },
  market: { sells: { chicken: 12, piglet: 22, calf: 40, egg: 3, milk: 5, bread: 4, seed_wheat: 2 }, buys: { egg: 2, milk: 4, wheat: 3, carrot: 3, cabbage: 4, bread: 2 } },
};
const BOUNTY = { assault: 20, murder: 100, theft: 10, livestock: 30, resist: 30 };
const JOBS = [
  { item: 'wood', n: 6, pay: 8 }, { item: 'stone', n: 6, pay: 8 }, { item: 'meat_raw', n: 2, pay: 10 }, { item: 'egg', n: 3, pay: 8 },
  { item: 'milk', n: 1, pay: 6 }, { item: 'wheat', n: 4, pay: 9 }, { item: 'clay', n: 4, pay: 8 }, { item: 'hide', n: 1, pay: 12 },
  { item: 'carrot', n: 3, pay: 8 }, { courier: true, pay: 6 },
];

export class TownLife {
  constructor(game, saved = {}) {
    this.game = game;
    const g = game;
    this.money = saved.money ?? 0;
    this.honor = saved.honor ?? 50;
    this.bounty = saved.bounty ?? 0;
    this.lastCrime = saved.lastCrime ?? -9;
    this.decayDay = saved.decayDay ?? Math.floor(g.time);
    this.job = saved.job || saved.favor || null;      // (older saves called jobs "favors")
    this.jobCd = saved.jobCd || saved.favorCd || {};
    this.stolen = saved.stolen || {};
    this.st = Object.assign({ days: 0, earned: 0, jobs: 0, jailed: 0, harvested: 0 }, saved.st || {});
    if (this.st.favors != null) { this.st.jobs += this.st.favors; delete this.st.favors; }
    this.village = g.world.sites.find((s) => s.type === 'village');
    this.cottage = g.world.sites.find((s) => s.type === 'cabin');
    this.folk = new Townsfolk(g, saved.folk || {});
    this.farm = new Farm(g, saved.farm || null);
    this.posse = null;
    this.witnesses = [];
    this.rebuild = [];
    this.season = null; this.iced = false;
    this.applySeason(true);
    this.ctxT = 0; this.ctx = []; this.ambT = 0;
    this.editsSaved = saved.editsVersion ?? -1;
    this.spawnLivestock(saved.livestock);
    g.animals.onKill = (a) => { if (a.owner === 'village') this.crime('livestock', { pos: a.pos }); };
    // HUD: coins, honor and bounty; context buttons for phones
    const hud = document.getElementById('hud');
    this.bar = document.createElement('div'); this.bar.id = 'townbar'; hud.appendChild(this.bar);
    this.ctxEl = document.createElement('div'); this.ctxEl.id = 'townctx'; this.ctxEl.className = 'ctx'; hud.appendChild(this.ctxEl);
    this.ctxEl.addEventListener('touchstart', (e) => { const b = e.target.closest('[data-a]'); if (!b) return; e.preventDefault(); e.stopPropagation(); this.doAction(b.dataset.a); }, { passive: false });
    this.ctxEl.addEventListener('mousedown', (e) => { const b = e.target.closest('[data-a]'); if (b) { e.stopPropagation(); this.doAction(b.dataset.a); } });
    this.barHtml = '';
    startFolk();
  }

  // ---- seasons ------------------------------------------------------------
  seasonName(time = this.game.time) { return SEASONS[Math.floor(time / SEASON_DAYS) % 4]; }
  dayOfSeason() { return Math.floor(this.game.time % SEASON_DAYS) + 1; }
  applySeason(first = false) {
    const g = this.game, s = this.seasonName();
    if (s !== this.season) {
      const was = this.season;
      this.season = s;
      if (paintSeason(s) && g.tex) g.tex.needsUpdate = true;
      if (!first) { g.hud.bigMessage(t('season.' + s), t('season.' + s + 'Sub')); g.animals.reseason(); }
      if (was && !first) sfx.done();
    }
    // lakes and rivers freeze after the first day of winter and thaw in spring
    const ice = s === 'winter' && this.game.time % SEASON_DAYS >= 0.5;
    if (ice !== this.iced) this.setIce(ice, first);
  }
  setIce(on, first) {
    const g = this.game, w = g.world, keys = new Set();
    this.iced = on;
    const from = on ? B.WATER : B.ICE, to = on ? B.ICE : B.WATER, y = SEA - 1;
    for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
      const i = w.idx(x, y, z);
      if (w.data[i] === from && w.data[i + w.W * w.D] === B.AIR) { w.data[i] = to; keys.add((x >> 4) + (z >> 4) * w.cx); }
    }
    if (!first) for (const k of keys) if (g.chunks.has(k)) this.rebuild.push(k);
    if (!first) g.hud.toast(t(on ? 'season.frozen' : 'season.thaw'));
  }
  // weather: rain spring to autumn, snow in winter
  weatherChance() { return { spring: 0.5, summer: 0.32, autumn: 0.55, winter: 0.45 }[this.season]; }
  snowing() { return this.season === 'winter'; }

  // ---- money, honor, bounty ---------------------------------------------
  price(item, buy, base) {
    const k = buy ? 1.25 - this.honor / 200 : 0.75 + this.honor / 400;
    return buy ? Math.max(1, Math.ceil(base * k)) : Math.max(1, Math.floor(base * k));
  }
  addHonor(n) { this.honor = Math.max(0, Math.min(100, this.honor + n)); }
  greetingKey(v) {
    if (this.bounty > 0) return v.role === 'sheriff' ? 'say.sheriffWanted' : 'say.wanted';
    if (v.role === 'keeper') return this.honor >= 65 ? 'say.keeperWarm' : this.honor < 35 ? 'say.keeperCold' : 'say.keeper';
    const k = this.honor >= 65 ? 'warm' : this.honor < 35 ? 'cold' : 'hi';
    return 'say.' + k + (1 + Math.floor(Math.random() * 3));
  }

  // ---- shops -----------------------------------------------------------------
  buy(shop, item) {
    const g = this.game, base = SHOPS[shop].sells[item];
    const p = this.price(item, true, base);
    if (this.money < p) { g.hud.toast(t('shop.noMoney')); sfx.error(); return false; }
    this.money -= p;
    if (item === 'chicken' || item === 'piglet' || item === 'calf') {
      const type = { chicken: 'chicken', piglet: 'pig', calf: 'cow' }[item];
      g.animals.addLivestock(type, this.cottage.pen, 'player');
      g.hud.toast(t('shop.livestock', { item: t('item.' + item) }));
    } else if (item === 'bucket' && g.has('bucket_water')) { g.give('bucket', 1); }
    else g.give(item, 1);
    sfx.coins();
    return true;
  }
  sell(shop, item, n = 1) {
    const g = this.game, base = SHOPS[shop].buys[item];
    n = Math.min(n, g.count(item));
    if (n <= 0) return false;
    const p = this.price(item, false, base) * n;
    g.take(item, n);
    if (this.stolen[item]) this.stolen[item] = Math.max(0, this.stolen[item] - n);
    this.money += p; this.st.earned += p;
    g.hud.dirtyHotbar = true;
    sfx.coins();
    return true;
  }

  // ---- jobs (paid work) ------------------------------------------------------------------
  askJob(v) {
    const g = this.game, f = this.job;
    if (f) {
      if (f.giver === v.i && !f.courier) {
        if (g.has(f.item, f.n)) { g.take(f.item, f.n); this.payJob(v, f); return; }
        this.folk.say(v, 'job.waiting', { n: f.n, item: t('item.' + f.item) }); return;
      }
      if (f.courier && f.to === v.i) { this.payJob(v, f); return; }
      this.folk.say(v, 'job.busy'); return;
    }
    if (this.bounty > 0 || this.honor < 25) { this.folk.say(v, 'job.refuse'); return; }
    if ((this.jobCd[v.i] || 0) > g.time) { this.folk.say(v, 'job.later'); return; }
    const pick = JOBS[Math.floor(Math.random() * JOBS.length)];
    const offer = { giver: v.i, pay: pick.pay + Math.floor(this.honor / 25), until: g.time + 2 };
    if (pick.courier) {
      const others = this.folk.list.filter((o) => o.alive && o !== v && o.role !== 'sheriff');
      const to = others[Math.floor(Math.random() * others.length)];
      Object.assign(offer, { courier: true, to: to.i, toName: to.name });
    } else Object.assign(offer, { item: pick.item, n: pick.n });
    g.app.openPanel('job', { v, offer });
  }
  acceptJob(offer) { this.job = offer; this.game.hud.toast(t('job.accepted')); }
  payJob(v, f) {
    const g = this.game;
    this.money += f.pay; this.st.earned += f.pay; this.st.jobs++;
    this.addHonor(5); this.bounty = Math.max(0, this.bounty - 15);
    this.jobCd[f.giver] = g.time + 0.5;
    this.job = null;
    this.folk.say(v, 'job.thanks', { n: f.pay });
    g.hud.toast(t('job.paid', { n: f.pay }), 'pick');
    sfx.coins();
  }

  // ---- the law ---------------------------------------------------------------
  // A crime only counts if someone saw it. Witnesses run to the sheriff.
  // dead: the person just killed (a body left in a house is then already known)
  crime(kind, { victim = null, value = 0, pos = null, dead = null } = {}) {
    const g = this.game, P = g.player.pos;
    const amount = BOUNTY[kind] + value;
    // a flurry of blows counts as one assault
    if (victim && kind === 'assault') { if ((victim.assaultAt ?? -1) > g.time - 0.003) return; victim.assaultAt = g.time; }
    this.lastCrime = g.time;
    // the posse is the law: if they see it, it counts at once
    if (this.posse && this.posse.members.some((m) => m.alive && (m === victim || this.folk.sees(m, 45)))) {
      if (dead && dead.body) dead.body.known = true;
      this.addBounty(amount, kind);
      this.posse.lastSeen = P.clone(); this.posse.seenT = 0;
      if (kind !== 'theft') this.goHostile();
      return;
    }
    const seen = this.folk.list.filter((v) => v.alive && !v.posse && (v === victim || this.folk.sees(v, 32)));
    if (!seen.length) { g.hud.toast(t('law.unseen')); return; }
    if (dead && dead.body) dead.body.known = true;
    seen.sort((a, b) => a.pos.distanceTo(P) - b.pos.distanceTo(P));
    const sheriff = seen.find((v) => v.role === 'sheriff');
    if (sheriff) { this.folk.say(sheriff, 'say.sheriffSaw', null, 'warn'); this.reported(sheriff, { kind, amount, pos: P.clone() }); return; }
    const w = seen[0];
    w.reportTo = { kind, amount, pos: P.clone() };
    w.route = []; w.scaredT = 0;
    this.witnesses = this.witnesses.filter((x) => x !== w).concat(w);
    this.folk.say(w, 'say.witness', null, 'warn');
    g.hud.alert(t('law.witness', { name: w.name }));
    sfx.alert();
  }
  reported(v, c) {
    const g = this.game;
    this.witnesses = this.witnesses.filter((x) => x !== v);
    this.addBounty(c.amount, c.kind);
    g.hud.alert(t('law.reported', { name: v.name, n: this.bounty }));
    sfx.warn();
    this.formPosse(c.pos);
  }
  // someone visiting a house found a body: they run to the sheriff (if a
  // witness already reported that killing, it is not counted twice)
  bodyFound(v, victim, bd, asleep = false) {
    const g = this.game, home = this.village.buildings[bd.h];
    if (bd.known) { if (!asleep) this.folk.say(v, 'say.foundBody', { name: victim.name }, 'warn'); return; }
    bd.known = true;
    const c = { kind: 'murder', amount: BOUNTY.murder, pos: g.player.pos.clone().set(home.door.x, home.door.y, home.door.z) };
    if (asleep) { this.found = (this.found || 0) + 1; this.reported(v, c); return; }
    this.folk.say(v, 'say.foundBody', { name: victim.name }, 'warn');
    v.reportTo = c; v.route = []; v.scaredT = 0;
    this.witnesses = this.witnesses.filter((x) => x !== v).concat(v);
    g.hud.alert(t('law.bodyFound', { name: v.name, victim: victim.name }));
    sfx.alert();
  }
  addBounty(n, kind) {
    this.bounty += n;
    this.addHonor(-Math.ceil(n / 5));
    this.lastCrime = this.game.time;
  }
  // the posse: townspeople (the sheriff first), more of them for a bigger bounty
  formPosse(lastSeen) {
    const g = this.game, F = this.folk;
    const size = Math.min(6, 1 + Math.floor(this.bounty / 35));
    if (!this.posse) this.posse = { members: [], lastSeen: lastSeen.clone(), seenT: 3, hostile: false, talked: false, arrived: false, checked: false };
    else { this.posse.lastSeen = lastSeen.clone(); this.posse.checked = false; }
    const P = this.posse;
    const hall = this.village.buildings.find((b) => b.type === 'hall');
    const pool = F.list.filter((v) => v.alive && !v.posse && !v.reportTo && v.role !== 'keeper')
      .sort((a, b) => (b.role === 'sheriff') - (a.role === 'sheriff') || a.pos.distanceTo(hall.door) - b.pos.distanceTo(hall.door));
    while (P.members.filter((m) => m.alive).length < size && pool.length) {
      const v = pool.shift();
      v.posse = true; v.route = []; v.planT = 0; v.idleT = 0;
      F.armed(v, v.role === 'sheriff' ? 'pistol' : 'rifle');
      P.members.push(v);
      F.say(v, 'say.posseJoin');
    }
    if (!P.members.length) { this.posse = null; return; }
    g.hud.toast(t('law.posse', { n: P.members.filter((m) => m.alive).length }), 'warn');
  }
  posseBehaviour(v, dt, d) {
    const g = this.game, F = this.folk, P = this.posse;
    if (!P) { v.posse = false; F.armed(v, null); return; }
    const pl = g.player.pos;
    v.seeT = (v.seeT || 0) - dt;
    if (v.seeT <= 0) {
      v.seeT = 0.4;
      if (F.sees(v, 40)) {
        if (P.seenT > 4) F.say(v, P.hostile ? 'say.posseFire' : 'say.posseThere', null, 'warn');
        P.lastSeen.copy(pl); P.seenT = 0; P.checked = false;
      }
    }
    const idx = P.members.indexOf(v);
    const spread = { x: Math.cos(idx * 2.1) * 3, z: Math.sin(idx * 2.1) * 3 };
    if (P.hostile) {
      // take cover and shoot
      v.coverT = (v.coverT || 0) - dt;
      if (P.seenT < 3 && d < 45) {
        if (!v.cover || v.coverT <= 0) { v.cover = F.coverSpot(v); v.coverT = 7; v.route = []; }
        if (v.cover && Math.hypot(v.cover.x - v.pos.x, v.cover.z - v.pos.z) > 0.7) { F.goDirect(v, v.cover, 4.6, dt, 0.5); v.crouch = false; }
        else { v.speed = 0; v.peekT = (v.peekT || 0) - dt; if (v.peekT <= 0) { v.peeking = !v.peeking; v.peekT = v.peeking ? 1.8 : 1.2; } v.crouch = !!v.cover && !v.peeking; }
        v.yaw = Math.atan2(-(pl.x - v.pos.x), -(pl.z - v.pos.z));
        if (!v.crouch) F.shootAt(v, dt);
      } else { F.goDirect(v, { x: P.lastSeen.x + spread.x, y: P.lastSeen.y, z: P.lastSeen.z + spread.z }, 4.8, dt, 1.5); v.crouch = false; }
      return;
    }
    v.crouch = false;
    if (P.questioning) { v.speed = 0; v.yaw = Math.atan2(-(pl.x - v.pos.x), -(pl.z - v.pos.z)); return; }
    if (P.seenT < 2) {
      // approach and question first
      const leader = P.members.find((m) => m.alive);
      if (v === leader && d < 4.5 && !g.overlay && !g.dead) { this.question(); return; }
      F.goDirect(v, v === leader ? pl : { x: pl.x + spread.x, y: pl.y, z: pl.z + spread.z }, 4.4, dt, v === leader ? 3.2 : 2);
      return;
    }
    // search the area where you were last seen: the leader checks the very
    // spot first (into the house, if that's where you went)
    if (!P.arrived && Math.hypot(P.lastSeen.x - v.pos.x, P.lastSeen.z - v.pos.z) < 8) P.arrived = true;
    if (idx === 0 && !P.checked) {
      if (F.goDirect(v, P.lastSeen, d > 60 ? 5 : 4, dt, 1.2)) P.checked = true;
      if (v.far && v.route.length) { v.actT = (v.actT || 0) - dt; if (v.actT <= 0) { v.actT = 2; const q = v.route.shift(); v.pos.set(q.x, q.y, q.z); } }
      return;
    }
    v.searchT = (v.searchT || 0) - dt;
    if (!v.search || v.searchT <= 0 || Math.hypot(v.search.x - v.pos.x, v.search.z - v.pos.z) < 1.5) {
      v.searchT = 6 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 14;
      v.search = { x: P.lastSeen.x + Math.cos(a) * r, y: P.lastSeen.y, z: P.lastSeen.z + Math.sin(a) * r };
      v.route = [];
    }
    F.goDirect(v, v.search, d > 60 ? 5 : 3.4, dt, 1.2);
    if (v.far && v.route.length) { v.actT = (v.actT || 0) - dt; if (v.actT <= 0) { v.actT = 2; const q = v.route.shift(); v.pos.set(q.x, q.y, q.z); } }
  }
  goHostile() {
    const P = this.posse;
    if (!P || P.hostile) return;
    P.hostile = true; P.questioning = false;
    for (const m of P.members) if (m.alive) this.folk.say(m, 'say.posseFire', null, 'warn');
    this.game.hud.alert(t('law.hostile')); sfx.alert();
  }
  posseLost(v) {
    const P = this.posse;
    if (!P) return;
    if (!P.members.some((m) => m.alive)) this.disband('law.posseGone');
  }
  disband(msgKey = 'law.gaveUp') {
    const P = this.posse;
    if (!P) return;
    for (const m of P.members) { m.posse = false; m.route = []; m.idleT = 0; m.cover = null; this.folk.armed(m, null); if (m.alive && msgKey === 'law.gaveUp') this.folk.say(m, 'say.posseLost'); }
    this.posse = null;
    this.game.hud.toast(t(msgKey));
  }
  question() {
    const P = this.posse;
    P.questioning = true;
    this.game.app.openPanel('question', {});
  }
  // the choices when the posse questions you
  answer(choice) {
    const g = this.game, P = this.posse;
    if (!P) { g.app.closePanel(); return; }
    const leader = P.members.find((m) => m.alive);
    if (choice === 'surrender') { g.app.closePanel(); this.jail(); return; }
    if (choice === 'pay') {
      if (this.money < this.bounty) { g.hud.toast(t('law.cantPay', { n: this.bounty })); sfx.error(); return 'stay'; }
      this.money -= this.bounty; this.bounty = 0; this.addHonor(-2);
      if (leader) this.folk.say(leader, 'say.paid');
      P.questioning = false; g.app.closePanel(); this.disband('law.cleared'); sfx.coins(); return;
    }
    if (choice === 'talk') {
      if (P.talked) return 'stay';
      P.talked = true;
      const chance = this.honor / 100 * (this.bounty <= 40 ? 1 : 0.4);
      if (Math.random() < chance) {
        this.bounty = this.bounty > 40 ? Math.floor(this.bounty / 2) : 0;
        if (leader) this.folk.say(leader, 'say.talkOk');
        P.questioning = false; g.app.closePanel(); this.disband(this.bounty ? 'law.talkHalf' : 'law.cleared'); return;
      }
      if (leader) this.folk.say(leader, 'say.talkNo');
      g.hud.toast(t('law.talkFail'));
      return 'stay';
    }
    // run or fight: resisting the law
    P.questioning = false; g.app.closePanel();
    this.addBounty(BOUNTY.resist, 'resist');
    this.goHostile();
  }
  // jail: pay the fine, lose stolen goods and scuba gear, wake in the cottage
  // a day later with the crops nearly dead
  jail() {
    const g = this.game, fine = this.bounty;
    const paid = Math.min(this.money, fine);
    this.money -= paid;
    const lost = [];
    for (const [id, n] of Object.entries(this.stolen)) { const k = Math.min(n, g.count(id)); if (k > 0) { g.take(id, k); lost.push(t('item.' + id)); } }
    this.stolen = {};
    if (g.has('scuba')) { g.inv.counts.scuba = 0; lost.push(t('item.scuba')); }
    this.bounty = 0; this.addHonor(-10); this.st.jailed++;
    this.disband('law.released');
    g.time = Math.floor(g.time) + 1 + 7 / 24;
    this.farm.neglectAll();
    this.wakeAtHome();
    g.hud.dirtyHotbar = true;
    g.app.openPanel('jailed', { paid, fine, lost });
  }
  wakeAtHome() {
    const g = this.game, c = this.cottage, p = g.player;
    p.pos.set(c.x + 0.5, c.y, c.z + 0.5); p.vel.set(0, 0, 0);
    p.health = 100; g.breath = 20;
  }
  // death or starvation: you wake up in the cottage (no game over)
  onDeath(cause) {
    const g = this.game;
    g.inv.counts.scuba = 0;
    if (cause === 'starve') { g.player.hunger = 60; g.hungerStage = 0; }
    if (this.posse) this.disband('law.gaveUp');
    this.wakeAtHome();
    g.hud.dirtyHotbar = true;
    g.hud.bigMessage(t('town.woke'), t(cause === 'starve' ? 'town.wokeStarve' : 'town.wokeHurt'));
  }
  // sleep in your bed, at any time of day: until night or until morning.
  // Time passes for everyone: crops grow, witnesses reach the sheriff, a
  // posse that lost you gives up (or tracks you to the cottage), bodies may
  // be found, newcomers grow up, and a bounty slowly fades.
  sleep() {
    const g = this.game, P = this.posse;
    if (P && P.members.some((m) => m.alive && m.pos.distanceTo(g.player.pos) < 25 && this.folk.sees(m, 30))) { g.hud.toast(t('town.noSleepPosse')); sfx.error(); return; }
    g.app.openPanel('sleep', {});
  }
  sleepUntil(which) {
    const g = this.game, F = this.folk, c = this.cottage;
    let to = Math.floor(g.time) + (which === 'night' ? 21 : 6) / 24;
    if (to <= g.time + 0.01) to += 1;
    const hours = (to - g.time) * 24;
    g.time = to;
    // a posse already out: if they lost you near home they find you at the
    // cottage door, otherwise they gave up while you slept
    const P = this.posse;
    let atDoor = false;
    if (P) {
      if (Math.hypot(P.lastSeen.x - c.x, P.lastSeen.z - c.z) < 40) {
        atDoor = true;
        P.members.filter((m) => m.alive).forEach((m, k) => { m.pos.set(c.door.x + Math.cos(k * 1.3) * 3, c.door.y, c.door.z + Math.sin(k * 1.3) * 3); m.route = []; });
        P.lastSeen.copy(g.player.pos); P.seenT = 0; P.arrived = true; P.checked = false;
      } else this.disband('law.gaveUp');
    }
    // witnesses on their way got to the sheriff
    for (const w of this.witnesses.slice()) if (w.alive && w.reportTo) { const cr = w.reportTo; w.reportTo = null; w.route = []; this.reported(w, cr); }
    this.found = 0;
    F.fastForward(hours);
    // lying low: the bounty slowly fades while you sleep
    if (this.bounty > 0 && !this.posse) {
      const quiet = Math.max(0, Math.min(hours, (g.time - this.lastCrime) * 24 - 2));
      this.bounty = Math.floor(this.bounty * Math.pow(0.98, quiet));
      if (this.bounty < 5) { this.bounty = 0; g.hud.toast(t('law.layLow')); }
    }
    g.player.health = Math.min(100, g.player.health + Math.min(40, hours * 4));
    g.player.hunger = Math.max(5, g.player.hunger - hours);
    g.hud.bigMessage(t(which === 'night' ? 'town.evening' : 'town.morning'), t('season.' + this.seasonName()) + ' · ' + t('hud.day', { n: Math.floor(g.time) + 1 }));
    if (this.found) g.hud.alert(t('law.bodyFoundAsleep'));
    if (atDoor) g.hud.alert(t('town.posseAtDoor'));
    g.app.saveGame(true);
  }

  // ---- interactions ------------------------------------------------------------
  // what can be done right here (buttons on phones, keys on computers)
  options() {
    const g = this.game, p = g.player.pos, out = [];
    const v = this.folk.nearest(p, 3.4, (x) => !x.posse && !x.reportTo);
    if (v) {
      if (v.role === 'keeper') out.push({ a: 'shop', label: t('ctx.shop'), v });
      if (v.role === 'sheriff') out.push({ a: 'sheriff', label: t('ctx.sheriff'), v });
      const f = this.job;
      if (f && ((f.giver === v.i && !f.courier) || (f.courier && f.to === v.i))) out.push({ a: 'job', label: t(f.courier ? 'ctx.deliver' : 'ctx.handOver'), v });
      else out.push({ a: 'job', label: t('ctx.job'), v });
    }
    const carcass = g.animals.nearestCarcass(p);
    if (carcass) out.push({ a: 'skin', label: t('ctx.skin'), carcass });
    const cow = g.animals.list.find((a) => a.owner === 'player' && a.type === 'cow' && a.state !== 'dead' && a.pos.distanceTo(p) < 2.6);
    if (cow && (g.has('bucket') || g.has('bucket_water'))) out.push({ a: 'milk', label: t('ctx.milk'), cow });
    if (g.campfires.near(p)) out.push({ a: 'craft', label: t('ctx.craft') });
    const bed = this.cottage.bed;
    if (Math.hypot(bed.x - p.x, bed.z - p.z) < 2.4 && Math.abs(bed.y - p.y) < 2) out.push({ a: 'sleep', label: t('ctx.sleep') });
    return out;
  }
  doAction(a) {
    const g = this.game, o = this.ctx.find((x) => x.a === a);
    if (!o || g.paused || g.overlay || g.dead) return;
    if (a === 'shop') g.app.openPanel('shop', { shop: o.v.shop, v: o.v });
    else if (a === 'sheriff') g.app.openPanel('sheriff', { v: o.v });
    else if (a === 'job') this.askJob(o.v);
    else if (a === 'skin') { g.animals.skin(o.carcass); g.vm.doSwing(); sfx.stab(); }
    else if (a === 'milk') {
      if ((o.cow.milkT || 0) > g.time) { g.hud.toast(t('town.milkLater')); return; }
      o.cow.milkT = g.time + 1; g.give('milk', 1); sfx.splash();
    } else if (a === 'sleep') this.sleep();
    this.ctxT = 0;
  }
  updateContext(dt, input) {
    const g = this.game;
    this.ctxT -= dt;
    if (this.ctxT <= 0) {
      this.ctxT = 0.2;
      this.ctx = g.paused || g.overlay ? [] : this.options();
      const touch = g.app.input.touch;
      const keys = ['E', 'R', 'G'];
      const html = this.ctx.map((o, i) => `<button class="cb" data-a="${o.a}">${touch ? '' : `<kbd>${keys[i] || ''}</kbd>`}${o.label}${o.v ? `<small>${o.v.name}</small>` : ''}</button>`).join('');
      if (html !== this.ctxHtml) { this.ctxHtml = html; this.ctxEl.innerHTML = html; }
    }
    if (g.paused || g.overlay) return false;
    const codes = ['KeyE', 'KeyR', 'KeyG'];
    for (let i = 0; i < this.ctx.length && i < 3; i++) if (input.hit(codes[i])) { this.doAction(this.ctx[i].a); return true; }
    return false;
  }

  // ---- per frame -------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    this.applySeason();
    for (let k = 0; k < 2 && this.rebuild.length; k++) g.world.dirty.add(this.rebuild.pop());
    if (g.paused) return;
    this.folk.update(dt);
    this.farm.update(dt);
    this.farm.updateReplant();
    if (this.posse) {
      if (this.posse.arrived || this.posse.hostile) this.posse.seenT += dt;   // the search clock starts once they get there
      if (this.posse.seenT > (this.posse.hostile ? 60 : 75) && !this.posse.questioning) this.disband('law.gaveUp');
    }
    // lay low: the bounty shrinks a little every quiet day
    const day = Math.floor(g.time);
    if (day !== this.decayDay) {
      this.decayDay = day; this.st.days++;
      if (this.bounty > 0 && g.time - this.lastCrime > 1 && !this.posse) {
        this.bounty = Math.floor(this.bounty * 0.8);
        if (this.bounty < 5) { this.bounty = 0; g.hud.toast(t('law.layLow')); }
      }
      if (this.job && this.job.until < g.time) { this.job = null; this.addHonor(-3); g.hud.toast(t('job.expired')); }
    }
    // the sheriff spots a wanted player
    if (this.bounty > 0 && !this.posse) {
      const s = this.folk.list.find((v) => v.role === 'sheriff' && v.alive && !v.reportTo);
      if (s && (this.sheriffT = (this.sheriffT || 0) - dt) <= 0) { this.sheriffT = 1; if (this.folk.sees(s, 30)) { this.folk.say(s, 'say.sheriffWanted', null, 'warn'); this.formPosse(g.player.pos); } }
    }
    this.livestock(dt);
    this.ambience(dt);
    this.updateBar();
  }
  // hens lay eggs in the pen
  livestock(dt) {
    const g = this.game;
    this.eggT = (this.eggT || 0) - dt;
    if (this.eggT > 0) return;
    this.eggT = 10;
    for (const a of g.animals.list) {
      if (a.owner !== 'player' || a.type !== 'chicken' || a.state === 'dead') continue;
      if (!a.eggT) a.eggT = g.time + 0.4 + Math.random() * 0.3;
      if (a.eggT < g.time) { a.eggT = g.time + 0.5 + Math.random() * 0.3; g.pickups.spawn('egg', 1, a.pos.x, a.pos.y + 0.3, a.pos.z); }
    }
  }
  spawnLivestock(saved) {
    const g = this.game, A = g.animals;
    for (const s of saved || []) { const a = A.addLivestock(s.type, this.cottage.pen, 'player', s.x != null ? { x: s.x, z: s.z } : null); a.milkT = s.milk; a.eggT = s.egg; }
    const pen = this.village.pens[0];
    for (const [type, n] of [['cow', 2], ['pig', 3], ['chicken', 4]]) for (let i = 0; i < n; i++) A.addLivestock(type, pen, 'village');
  }
  // birdsong by day, crickets and owls at night, wind (stronger in winter)
  ambience(dt) {
    const g = this.game;
    this.ambT -= dt;
    if (this.ambT > 0) return;
    this.ambT = 0.8 + Math.random() * 2;
    const day = g.sky.daylight, s = this.season, under = g.eyeSky != null && g.eyeSky < 0.4;
    setWind(under ? 0.1 : (s === 'winter' ? 0.75 : s === 'autumn' ? 0.55 : 0.3) + g.weather.rain * 0.4);
    if (under) return;
    if (day > 0.6 && s !== 'winter' && g.weather.rain < 0.3 && Math.random() < 0.55) sfx.songbird(0.5 + Math.random() * 0.5);
    if (day < 0.25 && (s === 'summer' || s === 'spring')) { for (let i = 0; i < 2; i++) setTimeout(() => sfx.cricket(0.6), i * 400); }
    if (day < 0.2 && Math.random() < 0.06) sfx.owl(0.6);
  }
  updateBar() {
    const html = `<span class="coins">${this.money}</span>` +
      `<span class="honor" title="${t('town.honor')}"><i style="width:${this.honor}%"></i></span>` +
      (this.bounty > 0 ? `<span class="bounty">${t('town.bounty', { n: this.bounty })}</span>` : '') +
      (this.posse ? `<span class="posse">${t(this.posse.hostile ? 'town.posseHostile' : 'town.posseOut')}</span>` : '') +
      (this.job ? `<span class="job">${this.job.courier ? t('town.jobCourier', { name: this.job.toName }) : t('town.jobBring', { n: this.job.n, item: t('item.' + this.job.item) })}</span>` : '');
    if (html !== this.barHtml) { this.barHtml = html; this.bar.innerHTML = html; }
  }
  // gunfire scares townspeople
  hearShot(pos) { for (const v of this.folk.list) if (v.alive && !v.posse && v.pos.distanceTo(pos) < 40) v.scaredT = 10; }
  // things to mark on the radar and the screen: witnesses on their way to report
  marks() { return this.witnesses.filter((w) => w.alive && w.reportTo); }

  // ---- saving ------------------------------------------------------------------------
  toSave() {
    const g = this.game, p = g.player;
    return {
      v: 1, layout: TOWN_LAYOUT, seed: g.cfg.seed, time: g.time, weather: g.weather,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, hunger: p.hunger },
      inv: g.inv, stats: g.stats, pickups: g.pickups.toSave(), rafts: g.rafts.map((r) => ({ x: r.x, z: r.z })), cabin: g.cabin.toSave(),
      town: {
        money: this.money, honor: this.honor, bounty: this.bounty, lastCrime: this.lastCrime, decayDay: this.decayDay,
        job: this.job, jobCd: this.jobCd, stolen: this.stolen, st: this.st,
        folk: this.folk.toSave(), farm: this.farm.toSave(), livestock: g.animals.toSaveLivestock(), editsVersion: g.world.editsVersion,
      },
    };
  }
  // only what changed: the world's block edits are written only when they changed
  save() {
    const g = this.game, w = g.world;
    const edits = w.editsVersion !== this.editsSaved ? w.serializeEdits() : null;
    const ok = saveTown(this.toSave(), edits);
    if (ok && edits != null) this.editsSaved = w.editsVersion;
    return ok;
  }
  dispose() {
    stopFolk(); setWind(0);
    this.folk.dispose();
    this.bar.remove(); this.ctxEl.remove();
    if (paintSeason(null) && this.game.tex) this.game.tex.needsUpdate = true;
  }
}
