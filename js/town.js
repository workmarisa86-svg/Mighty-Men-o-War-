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
import { WEAPONS } from './weapons.js';
import { Furniture } from './furniture.js';
import { Fishing } from './fishing.js';
import { playJailClip } from './jailclip.js';
import * as THREE from 'three';

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// what each shop sells and buys (base prices in coins)
export const SHOPS = {
  general: { sells: { seed_wheat: 2, seed_carrot: 3, seed_cabbage: 3, bucket: 8, bread: 4, flint: 5, medkit: 15, glass: 3, fence: 2 },
    buys: { wheat: 3, carrot: 3, cabbage: 4, egg: 2, milk: 4, wood: 1, stone: 1, clay: 1, sand: 1, brick: 2, glass: 2, charcoal: 1, thatch: 1, iron: 4, gold: 45 } },
  butcher: { sells: { meat_cooked: 6, meat_raw: 4, fish_cooked: 6 }, buys: { meat_raw: 3, meat_cooked: 4, fish: 3, big_fish: 12, fish_cooked: 5 } },
  hunting: { sells: { rod: 6, knife: 10, pistol: 45, shotgun: 55, rifle: 80, sniper: 140, dynamite: 12 }, buys: { hide: 7, bear_hide: 65, meat_raw: 2 } },
  stable: { sells: { horse: 60 }, buys: { wheat: 3 } },
  market: { sells: { chicken: 12, piglet: 22, calf: 40, egg: 3, milk: 5, bread: 4, seed_wheat: 2 }, buys: { egg: 2, milk: 4, wheat: 3, carrot: 3, cabbage: 4, bread: 2, fish: 3, big_fish: 10 } },
};
const BOUNTY = { assault: 20, murder: 100, theft: 10, livestock: 30, resist: 30, holdup: 40, robbery: 60, breakin: 35, horsetheft: 40, escape: 50 };
const PICK_TIME = 6;                  // seconds to pick the cell's lock
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
    this.restock = saved.restock || [];
    this.rapport = saved.rapport || {};            // how much each household likes you
    this.inviteT = 60 + Math.random() * 60;
    this.charges = [];                             // lit dynamite at a door
    this.doorT = 0;
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
    // bears roam the woods from the start (more keep arriving, see animals.js)
    for (let k = g.animals.herds.filter((h) => h.type === 'bear').length; k < 4; k++) g.animals.spawnHerd(true, 'bear');
    // furniture in every home and the jail cot; fishing; a night in jail in progress
    this.furniture = new Furniture(g, this.village);
    this.fishing = new Fishing(g);
    this.jailB = this.village.buildings.find((b) => b.type === 'jail');
    this.jailed = saved.jailed || null;
    if (this.jailed) this.cellDoor(true, true);
    g.animals.onKill = (a) => { if (a.owner === 'village') this.crime('livestock', { pos: a.pos }); };
    // HUD: coins, honor and bounty; context buttons for phones
    const hud = document.getElementById('hud');
    this.bar = document.createElement('div'); this.bar.id = 'townbar'; hud.appendChild(this.bar);
    // a job: an arrow at the top of the screen points to whoever pays you
    this.arrowEl = document.createElement('div'); this.arrowEl.id = 'jobarrow'; this.arrowEl.hidden = true;
    this.arrowEl.innerHTML = '<i>&#10148;</i><span></span>'; hud.appendChild(this.arrowEl);
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
    // a household that likes you gives a better price (up to 15%)
    const fam = this.shopKeeper ? Math.min(3, this.rapport[this.shopKeeper.homeIdx] || 0) * 0.05 : 0;
    const k = buy ? 1.25 - this.honor / 200 - fam : 0.75 + this.honor / 400 + fam;
    return buy ? Math.max(1, Math.ceil(base * k)) : Math.max(1, Math.floor(base * k));
  }
  addHonor(n) { this.honor = Math.max(0, Math.min(100, this.honor + n)); }
  greetingKey(v) {
    if (this.bounty > 0) return v.role === 'sheriff' ? 'say.sheriffWanted' : 'say.wanted';
    if (v.role === 'keeper') return this.honor >= 65 ? 'say.keeperWarm' : this.honor < 35 ? 'say.keeperCold' : 'say.keeper';
    const k = this.honor >= 65 || (this.rapport[v.homeIdx] || 0) >= 3 ? 'warm' : this.honor < 35 ? 'cold' : 'hi';
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
    } else if (item === 'horse') {
      const st = this.village.buildings.find((b) => b.type === 'stable');
      g.horses.add(st.hitch.x, st.hitch.y, st.hitch.z, 'player'); g.hud.toast(t('horse.bought'), 'pick');
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
  // who pays for the job: the person you deliver to, or whoever asked you
  jobTarget() {
    const f = this.job;
    if (!f) return null;
    const id = f.courier ? f.to : f.giver;
    return this.folk.list.find((v) => v.i === id && v.alive) || null;
  }
  // the arrow turns with you toward that person (name and distance under it)
  jobArrow() {
    const el = this.arrowEl, g = this.game, v = this.jobTarget(), p = g.player;
    if (!v || g.paused) { if (!el.hidden) el.hidden = true; return; }
    const dx = v.pos.x - p.pos.x, dz = v.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 3) { if (!el.hidden) el.hidden = true; return; }
    const rel = Math.atan2(-dx, -dz) - p.yaw;
    el.hidden = false;
    el.firstChild.style.transform = `rotate(${(-rel - Math.PI / 2).toFixed(3)}rad)`;
    const txt = t('job.arrow', { name: v.name, m: Math.round(d) });
    if (txt !== this.arrowTxt) { this.arrowTxt = txt; el.lastChild.textContent = txt; }
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
    // men only (the sheriff first), 6 to 20 of them depending on the bounty
    const size = Math.min(20, 6 + Math.floor(this.bounty / 25));
    if (!this.posse) this.posse = { members: [], lastSeen: lastSeen.clone(), seenT: 3, hostile: false, talked: false, arrived: false, checked: false };
    else { this.posse.lastSeen = lastSeen.clone(); this.posse.checked = false; }
    const P = this.posse;
    const hall = this.village.buildings.find((b) => b.type === 'hall');
    const pool = F.list.filter((v) => v.alive && !v.posse && !v.reportTo && !v.fight && !v.surrendered && v.role !== 'keeper' && !v.female)
      .sort((a, b) => (b.role === 'sheriff') - (a.role === 'sheriff') || a.pos.distanceTo(hall.door) - b.pos.distanceTo(hall.door));
    while (P.members.filter((m) => m.alive).length < size && pool.length) {
      const v = pool.shift();
      v.posse = true; v.route = []; v.planT = 0; v.idleT = 0;
      v.hp = Math.max(v.hp, 170);                                    // tougher than ordinary townsfolk
      F.armed(v, F.bestGun(v) || (Math.random() < 0.5 ? 'rifle' : 'shotgun'));
      if (g.horses && P.members.filter((m) => m.horse).length < 12) g.horses.mountFor(v);   // they ride
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
    const fl = P.hostile ? 9 : 3, spread = { x: Math.cos(idx * 2.1) * fl, z: Math.sin(idx * 2.1) * fl };   // hostile: spread out to the flanks
    if (P.hostile) {
      // close in: riders get down (the horse stays there), take cover, flank and shoot
      if (v.horse && d < 35) { const h = v.horse; h.rider = null; v.lastHorse = h; v.horse = null; }
      v.coverT = (v.coverT || 0) - dt;
      if (P.seenT < 3 && d < 45) {
        if (!v.cover || v.coverT <= 0) { v.cover = F.coverSpot(v); v.coverT = 7; v.route = []; }
        if (v.cover && Math.hypot(v.cover.x - v.pos.x, v.cover.z - v.pos.z) > 0.7) { F.goDirect(v, v.cover, (v.horse ? 1.9 : 1) * (4.6), dt, 0.5); v.crouch = false; }
        else { v.speed = 0; v.peekT = (v.peekT || 0) - dt; if (v.peekT <= 0) { v.peeking = !v.peeking; v.peekT = v.peeking ? 1.8 : 1.2; } v.crouch = !!v.cover && !v.peeking; }
        v.yaw = Math.atan2(-(pl.x - v.pos.x), -(pl.z - v.pos.z));
        if (!v.crouch) F.shootAt(v, dt);
      } else { F.goDirect(v, { x: P.lastSeen.x + spread.x, y: P.lastSeen.y, z: P.lastSeen.z + spread.z }, (v.horse ? 1.9 : 1) * (4.8), dt, 1.5); v.crouch = false; }
      return;
    }
    v.crouch = false;
    if (P.questioning) { v.speed = 0; v.yaw = Math.atan2(-(pl.x - v.pos.x), -(pl.z - v.pos.z)); return; }
    if (P.seenT < 2) {
      // approach and question first
      const leader = P.members.find((m) => m.alive);
      if (v === leader && d < 4.5 && !g.overlay && !g.dead) { this.question(); return; }
      F.goDirect(v, v === leader ? pl : { x: pl.x + spread.x, y: pl.y, z: pl.z + spread.z }, (v.horse ? 1.9 : 1) * (4.4), dt, v === leader ? 3.2 : 2);
      return;
    }
    // search the area where you were last seen: the leader checks the very
    // spot first (into the house, if that's where you went)
    if (!P.arrived && Math.hypot(P.lastSeen.x - v.pos.x, P.lastSeen.z - v.pos.z) < 8) P.arrived = true;
    if (idx === 0 && !P.checked) {
      if (F.goDirect(v, P.lastSeen, (v.horse ? 1.9 : 1) * (d > 60 ? 5 : 4), dt, 1.2)) P.checked = true;
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
    F.goDirect(v, v.search, (v.horse ? 1.9 : 1) * (d > 60 ? 5 : 3.4), dt, 1.2);
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
    for (const m of P.members) {
      m.posse = false; m.route = []; m.idleT = 0; m.cover = null; this.folk.armed(m, null);
      if (m.alive && msgKey === 'law.gaveUp') this.folk.say(m, 'say.posseLost');
      if (m.horse) { const h = m.horse; m.horse = null; h.rider = null; h.alive = false; h.deadT = 999; }   // they ride home (the horse goes back)
    }
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
  // Jail: no fine. You are locked in the town jail's cell for one night
  // (stolen goods and scuba gear are taken; your bounty is set aside). Sleep
  // on the cot to serve the night: a short film of the night passes and you
  // are let out in the morning with a clean record. Or pick the cell's lock
  // and escape: you are free, but your bounty comes back bigger.
  jail() {
    const g = this.game, p = g.player, C = this.jailB && this.jailB.cell;
    const lost = [];
    for (const [id, n] of Object.entries(this.stolen)) { const k = Math.min(n, g.count(id)); if (k > 0) { g.take(id, k); lost.push(t('item.' + id)); } }
    this.stolen = {};
    if (g.has('scuba')) { g.inv.counts.scuba = 0; lost.push(t('item.scuba')); }
    if (p.riding && g.horses) g.horses.dismount(true);
    if (this.fishing) this.fishing.reelIn();
    const h = (g.time % 1) * 24, day = Math.floor(g.time);
    this.jailed = { bounty: this.bounty, release: (h < 5 ? day : day + 1) + 7 / 24 };   // out at 7 in the morning
    this.bounty = 0; this.addHonor(-10); this.st.jailed++;
    this.disband('law.lockedUp');
    if (C) { this.cellDoor(true); p.pos.set(C.inside.x, C.inside.y, C.inside.z); p.vel.set(0, 0, 0); p.yaw = Math.atan2(-(C.door[0][0] + 1 - C.inside.x), -(C.door[0][2] + 0.5 - C.inside.z)); p.pitch = 0; }
    g.hud.dirtyHotbar = true;
    g.app.openPanel('jailed', { lost });
  }
  // the cell's door of bars: shut (and unbreakable) while you are locked up
  cellDoor(shut, first = false) {
    const C = this.jailB && this.jailB.cell, w = this.game.world;
    if (!C) return;
    for (const [x, y, z] of C.door) {
      if (first) { const i = w.idx(x, y, z); w.data[i] = shut ? B.FENCE : B.AIR; w.locked[i] = shut ? 1 : 0; w.markDirty(x, z); continue; }
      w.set(x, y, z, shut ? B.FENCE : B.AIR); w.locked[w.idx(x, y, z)] = shut ? 1 : 0;
    }
    if (!shut) sfx.coins();               // the keys
  }
  // sleep on the cot: the night passes (a short film) and the sheriff lets you out
  async serveNight() {
    const g = this.game, J = this.jailed;
    if (!J || this.inClip) return;
    this.inClip = true; g.paused = true; g.app.inClip = true;
    const day = Math.floor(g.time);
    try { await playJailClip({ renderer: g.app.renderer, touch: g.app.input.touch, dateText: t('jail.clipDay', { n: day + 1 }) }); } catch (e) { console.error(e); }
    g.app.inClip = false; g.paused = false; this.inClip = false;
    const hours = Math.max(0, (J.release - g.time) * 24);
    if (J.release > g.time) g.time = J.release;
    this.folk.fastForward(hours);
    this.release();
  }
  release(early = false) {
    const g = this.game, C = this.jailB && this.jailB.cell;
    this.jailed = null;
    this.cellDoor(false);
    if (C && !early) { g.player.pos.set(C.out.x + 0.5, C.out.y, C.out.z); g.player.vel.set(0, 0, 0); }
    g.player.health = 100;
    g.hud.bigMessage(t('jail.releasedTitle'), t('jail.releasedSub'));
    g.app.saveGame(true);
  }
  // picking the lock: stand at the cell door; it takes a few seconds
  startPick() {
    if (!this.jailed || this.pick) return;
    this.pick = { t: 0 };
    this.game.hud.toast(t('jail.picking'));
  }
  updateJail(dt) {
    const g = this.game, J = this.jailed, C = this.jailB && this.jailB.cell;
    if (!J || !C) { this.pick = null; return; }
    // served the night awake: the sheriff lets you out at seven
    if (g.time >= J.release) { this.release(); return; }
    if (this.pick) {
      const d = Math.hypot(g.player.pos.x - (C.door[0][0] + 1), g.player.pos.z - (C.door[0][2] + 0.5));
      if (d > 2.4) { this.pick = null; g.hud.digProgress = 0; g.hud.toast(t('jail.pickStopped')); return; }
      this.pick.t += dt; g.hud.digProgress = this.pick.t / PICK_TIME;
      if ((this.pick.tick = (this.pick.tick || 0) - dt) <= 0) { this.pick.tick = 0.5; sfx.craftTick(); }
      if (this.pick.t >= PICK_TIME) {
        // out! but the bounty is back, and bigger
        this.pick = null; g.hud.digProgress = 0;
        this.bounty = J.bounty + BOUNTY.escape; this.lastCrime = g.time;
        this.jailed = null; this.cellDoor(false);
        g.hud.alert(t('jail.escaped', { n: this.bounty })); sfx.alert();
      }
    }
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

  // ---- aim and use: Town Life's own targets (see aimuse.js) ---------------------
  // riding: Dismount; a gun pointed at a person: Hold up; a body or a
  // surrendered person: Loot; a horse: Ride; a house door: Knock (or, with
  // dynamite in hand, Blow it open)
  aimTarget(hit, eye, dir) {
    const g = this.game, F = this.folk, p = g.player, sel = g.selected();
    const W = WEAPONS[sel], gun = W && !W.melee && !W.throw;
    const v = F.raycast(eye, dir, gun ? 14 : 3.4);
    const blockD = hit ? Math.hypot(hit.x + 0.5 - eye.x, hit.y + 0.5 - eye.y, hit.z + 0.5 - eye.z) : 99;
    if (v && v.dist < blockD) {
      const u = v.villager;
      if (gun && u.alive && !u.surrendered && !u.posse && !u.fight) return { a: 'holdup', label: t('use.holdup'), run: () => this.holdUp(u) };
      if (v.dist < 3.4 && (u.surrendered > 0 || !u.alive) && !u.looted) return { a: 'loot', label: t('use.loot'), run: () => g.app.openPanel('loot', { v: u }) };
    }
    // a dead body nearby (lying low, the ray passes over it)
    const body = F.list.find((u) => !u.alive && !u.away && !u.looted && Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z) < 2.4);
    if (body && p.pitch < -0.35) return { a: 'loot', label: t('use.loot'), run: () => g.app.openPanel('loot', { v: body }) };
    if (p.riding) return { a: 'dismount', label: t('use.dismount'), run: () => g.horses.dismount() };
    const hr = g.horses.raycast(eye, dir, 3.6);
    if (hr && hr.dist < blockD && !hr.horse.rider) {
      const h = hr.horse;
      return { a: 'mount', label: t(h.owner === 'player' ? 'use.ride' : h.owner === 'posse' ? 'use.rideLoose' : 'use.steal'), run: () => g.horses.mount(h) };
    }
    if (hit && hit.id === B.HDOOR) {
      const b = this.doorAt(hit.x, hit.y, hit.z);
      if (!b) return null;
      if (sel === 'dynamite') return { a: 'blow', label: t('use.blow'), run: () => this.lightDynamite(b, hit) };
      return { a: 'knock', label: t('use.knock'), run: () => this.knock(b) };
    }
    return null;
  }

  // ---- hold-ups -------------------------------------------------------------------
  // They hand over what they own, or fight back: it depends on whether they
  // are armed, their nerve and station, and who is around to help.
  holdUp(v) {
    const g = this.game, F = this.folk;
    const gun = F.bestGun(v);
    const friends = F.list.filter((o) => o !== v && o.alive && !o.female && F.bestGun(o) && o.pos.distanceTo(v.pos) < 12).length;
    const nerve = v.brave + (v.status === 'mansion' ? 0.12 : 0) + Math.min(3, friends) * 0.06 - (g.player.riding ? 0.08 : 0);
    if (gun && !v.female && nerve > 0.78) {
      v.fight = { armed: gun }; F.armed(v, gun); F.say(v, 'say.draw', null, 'warn');
      for (const o of F.list) if (o !== v && o.alive && !o.female && F.bestGun(o) && o.pos.distanceTo(v.pos) < 12 && o.brave > 0.4) { o.fight = { armed: F.bestGun(o) }; F.armed(o, o.fight.armed); }
    } else if (!gun && v.brave > 0.85) { v.scaredT = 20; F.say(v, 'say.flee', null, 'warn'); }
    else { v.surrendered = 25; v.route = []; F.say(v, 'say.handsUp', null, 'warn'); }
    sfx.alert();
    this.crime('holdup', { victim: v });
  }
  // a body or someone who gave up: their money, guns, food, valuables, horse
  lootList(v) {
    const out = [];
    if (v.money > 0) out.push({ id: 'coins', n: v.money });
    for (const gname of v.guns || []) out.push({ id: gname, n: 1 });
    for (const f of v.goods || []) out.push({ id: f, n: 1 });
    if (v.status === 'mansion' && !v.goldTaken) out.push({ id: 'gold', n: 1 });
    const h = v.horse || v.lastHorse;
    if (h && h.alive && h.owner !== 'player') out.push({ id: 'horse', n: 1, horse: h });
    return out;
  }
  takeLoot(v, item) {
    const g = this.game;
    if (item.id === 'coins') { this.money += v.money; v.money = 0; }
    else if (item.id === 'horse') { item.horse.owner = 'player'; item.horse.rider = null; v.lastHorse = null; g.hud.toast(t('horse.claimed'), 'pick'); }
    else {
      g.give(item.id, item.n);
      if (v.guns && v.guns.includes(item.id)) v.guns = v.guns.filter((x) => x !== item.id);
      else if (item.id === 'gold') v.goldTaken = true;
      else v.goods = (v.goods || []).filter((x, k, a) => a.indexOf(item.id) !== k || x !== item.id);
    }
    g.hud.dirtyHotbar = true;
    if (!this.lootList(v).length) v.looted = true;
    sfx.coins();
  }

  // ---- invitations and guests ---------------------------------------------------------
  invite(dt) {
    const g = this.game, F = this.folk;
    this.inviteT -= dt;
    if (this.inviteT > 0 || this.bounty > 0 || this.honor < 60 || this.posse || this.guest || g.overlay) return;
    this.inviteT = 90 + Math.random() * 90 * (this.declined || 1);
    const h = F.hour();
    if (h < 9 || h > 19) return;
    const v = F.list.find((o) => o.alive && !o.posse && !o.fight && !o.reportTo && o.role !== 'keeper' && o.role !== 'sheriff' && o.pos.distanceTo(g.player.pos) < 7);
    if (!v) return;
    F.say(v, 'say.invite');
    g.app.openPanel('invite', { v });
  }
  acceptInvite(v) {
    this.guest = { hi: v.homeIdx, home: v.home, host: v.i, until: this.game.time + 0.3, offered: false };
    this.rapport[v.homeIdx] = (this.rapport[v.homeIdx] || 0) + 1;
    this.declined = 1;
    this.folk.routeTo(v, { b: v.home, pos: v.home.inside });
    this.game.hud.toast(t('guest.go', { name: v.name }));
  }
  // supper with your hosts: the family sits down at their table, plates
  // come out, and you take the free chair facing them
  startSupper(G, fam) {
    const g = this.game, F = G.home.furn;
    if (!F) { g.hud.toast(t('guest.ate')); return; }
    const chairs = F.chairs;
    fam.slice(0, chairs.length - 1).forEach((m, k) => { const c = chairs[k + 1]; m.seat = c; m.sleeping = false; this.folk.routeTo(m, { b: G.home, pos: { x: c.x, y: c.y, z: c.z } }); });
    const mine = chairs[0], p = g.player;
    p.pos.set(mine.x - mine.face.x * 0.55, mine.y, mine.z - mine.face.z * 0.55); p.vel.set(0, 0, 0);
    p.yaw = Math.atan2(-mine.face.x, -mine.face.z); p.pitch = -0.25;
    this.furniture.setPlates(F);
    this.supper = { home: G.home, fam, t: 35 };
    g.hud.bigMessage(t('guest.supper'), t('guest.supperSub'));
  }
  updateSupper(dt) {
    const S = this.supper;
    if (!S) return;
    S.t -= dt;
    const away = this.folk.houseAt(this.game.player.pos) < 0 || this.village.buildings[this.folk.houseAt(this.game.player.pos)] !== S.home;
    if (S.t > 0 && !away) return;
    for (const m of S.fam) { m.seat = null; m.sitting = false; m.route = []; m.idleT = 2; }
    this.furniture.setPlates(null);
    this.supper = null;
    if (!away) this.game.hud.toast(t('guest.ate'));
  }
  declineInvite() { this.declined = Math.min(3, (this.declined || 1) + 0.5); }
  guestCheck() {
    const g = this.game, G = this.guest;
    if (!G) return;
    if (G.until < g.time) { this.guest = null; return; }
    const here = this.folk.houseAt(g.player.pos);
    if (here >= 0 && this.village.buildings[here] === G.home && !G.offered && !g.overlay) { G.offered = true; g.app.openPanel('guest', {}); }
  }
  // the family at home (alive, in or near the house)
  household(G) { return this.folk.list.filter((o) => o.alive && o.homeIdx === G.hi && o.pos.distanceTo(G.home.inside) < 14); }
  guestAction(a, what) {
    const g = this.game, F = this.folk, G = this.guest;
    if (!G) return;
    const fam = this.household(G);
    if (a === 'eat') { g.player.hunger = Math.min(100, g.player.hunger + 45); this.rapport[G.hi] = (this.rapport[G.hi] || 0) + 1; this.startSupper(G, fam); sfx.done(); return; }
    if (a === 'chat') { this.rapport[G.hi] = (this.rapport[G.hi] || 0) + 1; this.addHonor(1); if (fam[0]) F.say(fam[0], 'say.chat' + (1 + Math.floor(Math.random() * 3))); return; }
    if (a === 'leave') { this.guest = null; return; }
    // robbing your hosts: they comply or fight back with their own guns
    this.guest = null;
    this.rapport[G.hi] = -5;
    const fighters = fam.filter((o) => !o.female && F.bestGun(o) && o.brave > 0.4);
    if (fighters.length) {
      for (const o of fighters) { o.fight = { armed: F.bestGun(o) }; F.armed(o, o.fight.armed); F.say(o, 'say.draw', null, 'warn'); }
      g.hud.alert(t('guest.fight'));
    } else {
      const take = (o) => {
        if (what !== 'guns') for (const f of o.goods || []) g.give(f, 1), o.goods = [];
        if (what !== 'food') { for (const gn of o.guns || []) g.give(gn, 1); o.guns = []; }
        if (what === 'all') { this.money += o.money; o.money = 0; }
      };
      if (what !== 'guns') g.give('bread', 2), g.give('meat_cooked', 1);
      fam.forEach(take);
      for (const o of fam) { o.surrendered = 20; F.say(o, 'say.handsUp', null, 'warn'); }
      g.hud.dirtyHotbar = true; sfx.coins();
      g.hud.toast(t('guest.robbed'));
    }
    this.crime('robbery', { victim: fam[0] || null });
  }

  // ---- doors: households open their own doors; you knock -----------------------------
  doorAt(x, y, z) { return this.village.buildings.find((b) => b.type === 'house' && b.doorCells && b.doorCells.some(([X, Y, Z]) => X === x && Y === y && Z === z)) || null; }
  knock(b) {
    const g = this.game, F = this.folk;
    sfx.thump(); setTimeout(() => sfx.thump(), 180);
    const hi = this.village.buildings.indexOf(b);
    const home = F.list.filter((o) => o.alive && o.home === b && F.houseAt(o.pos) === hi);
    if (!home.length) { g.hud.toast(t('door.nobody')); return; }
    const host = home[0], trusted = (this.bounty === 0 && this.honor >= 45) || (this.guest && this.guest.home === b) || (this.rapport[host.homeIdx] || 0) >= 2;
    if (trusted) { b.allowT = performance.now() / 1000 + 12; F.say(host, 'say.comeIn'); }
    else F.say(host, this.bounty > 0 ? 'say.goAwayWanted' : 'say.goAway', null, 'warn');
  }
  lightDynamite(b, hit) {
    const g = this.game;
    if (!g.has('dynamite')) return;
    g.take('dynamite', 1); g.hud.dirtyHotbar = true;
    this.charges.push({ b, t: 3, x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 });
    g.hud.alert(t('door.lit')); sfx.alert();
  }
  // the blast takes only the door (and its frame): never the walls or the ground
  blowDoor(c) {
    const g = this.game, F = this.folk, b = c.b, w = g.world;
    for (const [x, y, z] of b.doorCells) if (w.get(x, y, z) === B.HDOOR) w.set(x, y, z, B.AIR);
    b.broken = g.time + 1;                                      // mended in a day
    g.particles.burst(c.x, c.y, c.z, [0.35, 0.3, 0.24], 24, 4, 1.2);
    sfx.explosion(Math.max(0.3, 1 - g.player.pos.distanceTo(new THREE.Vector3(c.x, c.y, c.z)) / 60), false);
    g.shake = Math.max(g.shake, 0.5);
    const pd = Math.hypot(g.player.pos.x - c.x, g.player.pos.z - c.z);
    if (pd < 3) g.damage(Math.round(30 * (1 - pd / 3)), 'blast');
    for (const o of F.list) if (o.alive && Math.hypot(o.pos.x - c.x, o.pos.z - c.z) < 3) F.hurt(o, 45);
    this.hearShot(new THREE.Vector3(c.x, c.y, c.z));
    // breaking in is a crime; the men of the house may fight back
    const hi = this.village.buildings.indexOf(b);
    for (const o of F.list) if (o.alive && o.home === b && !o.female && F.bestGun(o) && o.brave > 0.35 && o.pos.distanceTo(b.inside) < 16) { o.fight = { armed: F.bestGun(o) }; F.armed(o, o.fight.armed); }
    this.crime('breakin', { pos: g.player.pos.clone() });
    void hi;
  }
  updateDoors(dt) {
    const g = this.game, F = this.folk, w = g.world, P = g.player.pos;
    for (const c of this.charges) { c.t -= dt; if (c.t <= 0) this.blowDoor(c); }
    this.charges = this.charges.filter((c) => c.t > 0);
    this.doorT -= dt;
    if (this.doorT > 0) return;
    this.doorT = 0.25;
    const now = performance.now() / 1000;
    for (const b of this.village.buildings) {
      if (b.type !== 'house' || !b.doorCells) continue;
      if (Math.hypot(b.inside.x - P.x, b.inside.z - P.z) > 90) continue;
      const near = (p, r = 2.4) => Math.hypot(p.x - b.door.x, p.z - b.door.z) < r || Math.hypot(p.x - b.doorIn.x, p.z - b.doorIn.z) < r;
      const broken = b.broken && b.broken > g.time;
      // open for: anyone of the house (or a visitor) right at the door, a welcome
      // guest, you from the inside, the posse; and a door blown open
      const open = broken || (b.allowT || 0) > now || (near(P) && F.houseAt(P) === this.village.buildings.indexOf(b)) ||
        // (only someone at the doorway on their way through: not the family sitting inside)
        F.list.some((o) => o.alive && !o.away && (Math.hypot(o.pos.x - b.door.x, o.pos.z - b.door.z) < 1.8 || (o.route.length && Math.hypot(o.pos.x - b.doorIn.x, o.pos.z - b.doorIn.z) < 1.8))) ||
        (this.posse && this.posse.members.some((m) => m.alive && near(m.pos, 3)));
      if (open === b.isOpen && !(b.broken && !broken)) continue;
      if (b.broken && !broken) b.broken = 0;
      // never close on someone standing in the doorway
      const inWay = (p) => b.doorCells.some(([x, , z]) => Math.abs(p.x - (x + 0.5)) < 0.8 && Math.abs(p.z - (z + 0.5)) < 0.8);
      if (!open && (inWay(P) || F.list.some((o) => o.alive && inWay(o.pos)))) continue;
      b.isOpen = open;
      for (const [x, y, z] of b.doorCells) { const id = w.get(x, y, z); if (open && id === B.HDOOR) w.set(x, y, z, B.AIR); else if (!open && id === B.AIR) w.set(x, y, z, B.HDOOR); }
    }
  }

  // ---- interactions ------------------------------------------------------------
  // what can be done right here (buttons on phones, keys on computers)
  options() {
    const g = this.game, p = g.player.pos, out = [];
    const v = this.folk.nearest(p, 3.4, (x) => !x.posse && !x.reportTo && !x.sleeping);     // (nobody does business in their sleep)
    // the shopkeeper counts even when a customer stands closer (that hid the Shop button)
    const keeper = this.folk.nearest(p, 3.6, (x) => x.role === 'keeper' && !x.surrendered);
    if (keeper && keeper !== v) out.push({ a: 'shop', label: t('ctx.shop'), v: keeper });
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
    if (g.campfires.near(p) && !(g.aimUse && g.aimUse.target)) out.push({ a: 'craft', label: t('ctx.craft') });
    if (this.jailed && this.jailB && this.jailB.cell) {
      const C = this.jailB.cell;
      if (Math.hypot(C.cot.x + 1 - p.x, C.cot.z + 0.5 - p.z) < 2.2) out.push({ a: 'jailsleep', label: t('ctx.jailSleep') });
      if (Math.hypot(C.door[0][0] + 1 - p.x, C.door[0][2] + 0.5 - p.z) < 2.2 && !this.pick) out.push({ a: 'picklock', label: t('ctx.pickLock') });
      return out;
    }
    const bed = this.cottage.bed;
    if (Math.hypot(bed.x - p.x, bed.z - p.z) < 2.4 && Math.abs(bed.y - p.y) < 2) out.push({ a: 'sleep', label: t('ctx.sleep') });
    return out;
  }
  doAction(a) {
    const g = this.game, o = this.ctx.find((x) => x.a === a);
    if (!o || g.paused || g.overlay || g.dead) return;
    if (a === 'shop') { this.shopKeeper = o.v; g.app.openPanel('shop', { shop: o.v.shop, v: o.v }); }
    else if (a === 'sheriff') g.app.openPanel('sheriff', { v: o.v });
    else if (a === 'job') this.askJob(o.v);
    else if (a === 'skin') { g.animals.skin(o.carcass); g.vm.doSwing(); sfx.stab(); }
    else if (a === 'milk') {
      if ((o.cow.milkT || 0) > g.time) { g.hud.toast(t('town.milkLater')); return; }
      o.cow.milkT = g.time + 1; g.give('milk', 1); sfx.splash();
    } else if (a === 'sleep') this.sleep();
    else if (a === 'jailsleep') this.serveNight();
    else if (a === 'picklock') this.startPick();
    else if (a === 'craft') g.app.openPanel('craft');      // (this case was missing: the Craft button did nothing)
    this.ctxT = 0;
  }
  updateContext(dt, input) {
    const g = this.game;
    this.ctxT -= dt;
    if (this.ctxT <= 0) {
      this.ctxT = 0.2;
      this.ctx = g.paused || g.overlay ? [] : this.options();
      const touch = g.app.input.touch;
      // E belongs to what you aim at (aim and use); nearby actions then use R, G, T
      const keys = g.aimUse && g.aimUse.target ? ['R', 'G', 'T'] : ['E', 'R', 'G'];
      const html = this.ctx.map((o, i) => `<button class="cb" data-a="${o.a}">${touch ? '' : `<kbd>${keys[i] || ''}</kbd>`}${o.label}${o.v ? `<small>${o.v.name}</small>` : ''}</button>`).join('');
      if (html !== this.ctxHtml) { this.ctxHtml = html; this.ctxEl.innerHTML = html; }
    }
    if (g.paused || g.overlay) return false;
    const codes = g.aimUse && g.aimUse.target ? ['KeyR', 'KeyG', 'KeyT'] : ['KeyE', 'KeyR', 'KeyG'];
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
    this.updateJail(dt);
    this.fishing.update(dt);
    this.updateSupper(dt);
    this.updateDoors(dt);
    this.invite(dt);
    this.guestCheck();
    this.ambience(dt);
    this.updateBar();
    this.jobArrow();
  }
  // hens lay eggs in the pen
  livestock(dt) {
    const g = this.game;
    // the village replaces livestock that was taken or killed (about 2 days)
    this.stockT = (this.stockT || 0) - dt;
    if (this.stockT <= 0) {
      this.stockT = 5;
      this.restock = this.restock || [];
      const want = { cow: 2, pig: 3, chicken: 4 };
      for (const [type, n] of Object.entries(want)) {
        const have = g.animals.list.filter((a) => a.owner === 'village' && a.type === type && a.state !== 'dead').length;
        const coming = this.restock.filter((r) => r.type === type).length;
        for (let k = have + coming; k < n; k++) this.restock.push({ type, at: g.time + 2 });
      }
      for (const r of this.restock.filter((q) => q.at <= g.time)) g.animals.addLivestock(r.type, this.village.pens[0], 'village');
      this.restock = this.restock.filter((q) => q.at > g.time);
    }
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
        job: this.job, jobCd: this.jobCd, stolen: this.stolen, st: this.st, restock: this.restock || [],
        folk: this.folk.toSave(), farm: this.farm.toSave(), livestock: g.animals.toSaveLivestock(), editsVersion: g.world.editsVersion,
        horses: g.horses ? g.horses.toSave() : null, rapport: this.rapport, jailed: this.jailed,
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
    this.bar.remove(); this.ctxEl.remove(); this.arrowEl.remove();
    this.furniture.dispose(); this.fishing.dispose();
    if (paintSeason(null) && this.game.tex) this.game.tex.needsUpdate = true;
  }
}
