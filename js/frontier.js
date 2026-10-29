// Town Life 2.0: the frontier around you. Goals to climb (with rewards and a
// top goal for each trade), the bank (safe deposits, or a heist), the saloon,
// businesses you buy or take by force (daily takings; rival gangs raid them
// and your gang helps you defend them), rival gangs and bounty hunters, the
// stagecoach (rob it or ride shotgun), and the town's calendar: market days,
// a gold rush, prairie fires, blizzards and floods, the autumn fair (shooting
// contest, horse race, livestock prize), wanted posters, two story quests,
// ranch hands, cattle drives, night rustlers, clothes, a trophy wall and
// named and bred horses. Only adults in the story: nobody here is a child.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { civLook } from './characters.js';

// businesses on Main Street: their price, and what they bring in a day (4%)
export const BIZ = { general: 1600, butcher: 900, hunting: 1200, stable: 1000, saloon: 1500 };
// the rival gangs of the territory (each keeps a camp out in the hills)
export const RIVALS = ['crane', 'blackhats', 'redsash', 'coyote', 'sidewinder', 'hollister'];
const GANG_LOOK = {
  crane: { shirt: 0x2a2a30, vest: 0x5a4a2a, hatColor: 0x121212 }, blackhats: { shirt: 0x3a2a24, vest: 0x161412, hatColor: 0x0a0a0a },
  redsash: { shirt: 0x8a2a22, vest: 0x2a2018, hatColor: 0x3a2a1c }, coyote: { shirt: 0x9a8a62, vest: 0x6a5a3a, hatColor: 0x8a7a5a },
  sidewinder: { shirt: 0x3a4a2a, vest: 0x1e2618, hatColor: 0x2a3020 }, hollister: { shirt: 0x2a3a5a, vest: 0x1a2232, hatColor: 0x1a1a22 },
  hunter: { shirt: 0x5a4a32, vest: 0x3a3024, hatColor: 0x4a3a28 },
};
const HAND_PAY = 8;              // a ranch hand's day wage
const HUNTER_BOUNTY = 120;       // bounty hunters ride in above this
const POSTER_BOUNTY = 40;

// the goals ladder: milestones for everyone, and the top goal of each trade
export const GOALS = [
  { id: 'coins100', n: 100, val: (F) => F.T.money + F.bank.balance, reward: { coins: 15 } },
  { id: 'place1', n: 1, val: (F) => F.T.hidden.seen.length, reward: { coins: 20 } },
  { id: 'house', n: 1, val: (F) => F.T.houses.homes.length, reward: { coins: 60 } },
  { id: 'bank500', n: 500, val: (F) => F.bank.balance, reward: { coins: 25 } },
  { id: 'treasure', n: 1, val: (F) => F.T.st.treasure || 0, reward: { honor: 5 } },
  { id: 'business', n: 1, val: (F) => Object.keys(F.biz).length, reward: { coins: 100 } },
  { id: 'fair', n: 1, val: (F) => F.st.ribbons, reward: { coins: 50 } },
  { id: 'quests', n: 2, val: (F) => (F.q.clara === 'done' ? 1 : 0) + (F.q.well === 'done' ? 1 : 0), reward: { coins: 200, honor: 10 } },
  { id: 'coins3000', n: 3000, val: (F) => F.T.money + F.bank.balance, reward: { honor: 5 } },
];
export const TOP_GOALS = {
  farmer: { n: 12, val: (F) => F.game.animals.list.filter((a) => a.owner === 'player' && a.state !== 'dead').length, reward: { coins: 300, honor: 10 } },
  bounty: { n: 10, val: (F) => F.T.st.bounties || 0, reward: { coins: 300, honor: 10 } },
  merchant: { n: 1, val: (F) => Object.values(F.biz).filter((b) => b.how === 'bought').length, reward: { coins: 300, honor: 10 } },
  outlaw: { n: 3, val: (F) => F.st.rivalsBeaten, reward: { coins: 400 } },
  hunter: { n: 4, val: (F) => F.st.bearSeasons.length, reward: { coins: 300, honor: 5 } },
  drifter: { n: 1, val: (F) => (F.T.hidden.places.length && F.T.hidden.seen.length >= F.T.hidden.places.length ? 1 : 0), reward: { coins: 300, honor: 5 } },
};

export class Frontier {
  constructor(town, saved = {}) {
    this.T = town; this.game = town.game;
    const g = this.game, V = town.village;
    this.done = saved.done || [];
    this.bank = Object.assign({ balance: 0, vault: 700, vaultDay: 0, robbedDay: -9 }, saved.bank || {});
    this.biz = saved.biz || {};                       // shop -> { how: 'bought'|'stolen', day, hurt }
    this.st = Object.assign({ ribbons: 0, rivalsBeaten: 0, bearSeasons: [], bears: 0, wolves: 0, raidsWon: 0, coaches: 0, drives: 0, campsBroken: 0 }, saved.st || {});
    this.q = Object.assign({ clara: 'none', well: 'none' }, saved.q || {});
    this.look = saved.look || null;
    this.hands = saved.hands || 0;                    // ranch hands hired
    this.ev = saved.ev || { day: Math.floor(g.time), kind: null, until: 0, rush: false, rushDone: false, fairYear: -1, flooded: -1 };
    this.foals = saved.foals || [];                   // horses being bred: { at, coat }
    this.raid = null; this.hunters = []; this.rustlers = null; this.drive = saved.drive || null; this.contest = null;
    this.people = {};                                // teller, barkeep, silas, judge, clara (spawned near you)
    this.coach = null; this.coachJob = null;
    this.raidT = saved.raidT ?? (g.time + 2.5 + Math.random() * 2);
    this.roadOk = !!saved.roadOk; this.bridges = saved.bridges || null;
    this.hunterT = saved.hunterT ?? (g.time + 1);
    this.rustleNight = saved.rustleNight ?? -1;
    this.goalT = 2; this.slowT = 0; this.posters = null; this.fire = null; this.cold = 0;
    this.stolen = saved.stolen || [];                // village houses you took (building indexes)
    for (const i of this.stolen) { this.unlock(V.buildings[i]); this.rehome(V.buildings[i]); town.houses.addTaken(i, false); }
    this.deputies = [];
    this.camps = saved.camps || null;                // each rival gang's camp out in the hills
    this.warT = saved.warT ?? (g.time + 1.5); this.ambushT = saved.ambushT ?? (g.time + 1.2);
    this.war = null; this.ambush = null;
    this.bankB = V.buildings.find((b) => b.type === 'bank') || null;
    this.saloonB = V.buildings.find((b) => b.type === 'saloon') || null;
    if (this.look) this.applyLook();
    // a bear or a wolf you bring down: kept for the trophy wall and the hunter's goal
    const prev = g.animals.onKill;
    g.animals.onKill = (a) => {
      if (prev) prev(a);
      if (a.type === 'bear') { this.st.bears++; const s = Math.floor(g.time / 3); if (!this.st.bearSeasons.includes(s)) this.st.bearSeasons.push(s); }
      if (a.type === 'wolf') this.st.wolves++;
    };
  }
  day() { return Math.floor(this.game.time); }
  hour() { return (this.game.time % 1) * 24; }
  // ---- events from the other parts (hidden.js, trades.js) -------------------------------
  event(kind, x) {
    if (kind === 'outlawDown' && this.raid && this.raid.men.includes(x)) { /* counted when the raid ends */ }
  }
  priceK(item, buy) {
    let k = 1;
    if (!buy && this.ev.kind === 'market') k *= 1.25;               // market day: everyone buys
    if (item === 'gold' && !buy && this.ev.rush) k *= 1.6;            // the gold rush
    return k;
  }

  // ---- people of the new places (spawned only near you) ------------------------------------
  person(key, make, want) {
    const F = this.T.folk;
    let v = this.people[key];
    if (want && !v) { v = make(); if (v) { F.extra.push(v); this.people[key] = v; } }
    else if (!want && v && (v.alive || Math.hypot(v.pos.x - this.game.player.pos.x, v.pos.z - this.game.player.pos.z) > 60)) { F.dropRig(v); F.extra = F.extra.filter((x) => x !== v); delete this.people[key]; }
    return this.people[key] || null;
  }
  man(name, seed, look, at, extra = {}) {
    const v = this.T.trades.makeMan(name, seed, look, at);
    Object.assign(v, { guns: [], goods: [], brave: 0.5 }, extra);
    if (!v.ai) v.ai = (o) => { if (!o.alive) return true; if (o.surrendered > 0 || o.fight) return false; o.speed = 0; const P = this.game.player.pos; if (Math.hypot(P.x - o.pos.x, P.z - o.pos.z) < 8) o.yaw = Math.atan2(-(P.x - o.pos.x), -(P.z - o.pos.z)); return true; };
    v.onKill = v.onKill || (() => {});
    return v;
  }
  updatePeople() {
    const g = this.game, P = g.player.pos, V = this.T.village;
    const nearTown = Math.hypot(P.x - V.cx, P.z - V.cz) < 110;
    if (this.bankB && this.bankB.keeper) this.person('teller', () => this.man(t('fr.teller'), 8101, { shirt: 0xe8e4d8, trousers: 0x2a2a2e, vest: 0x2a3a2a, hat: 'none', hair: 0x6a5a4a, moustache: true }, this.bankB.keeper, { teller: true, money: 20, brave: 0.3 }), nearTown && !this.bankB.closed);
    if (this.saloonB && this.saloonB.keeper) this.person('barkeep', () => this.man(t('fr.barkeep'), 8102, { shirt: 0xd8d0c0, trousers: 0x3a3430, vest: 0x5a2a22, hat: 'none', hair: 0x2a1c12, moustache: true, apron: 0xe8e0d0 }, this.saloonB.keeper, { barkeep: true, money: 30, guns: ['shotgun'], brave: 0.7 }), nearTown);
    // Silas Crane, the land speculator: in the saloon of an evening (until the well is solved)
    const S = this.saloonB, h = this.hour();
    this.person('silas', () => S && this.man('Silas Crane', 8103, { shirt: 0x1e1e22, trousers: 0x1e1e22, vest: 0x5a4a2a, hat: 'felt', hatColor: 0x121212, hair: 0x8a8a84, moustache: true }, { x: S.inside.x + 1.5, y: S.inside.y, z: S.inside.z }, { silas: true, money: 120, guns: ['revolver'], goods: ['gold'], brave: 0.4 }), !!S && nearTown && h > 15 && h < 23.5 && this.q.well !== 'done');
    // the fair's judge in the plaza on fair day
    this.person('judge', () => this.man(t('fr.judge'), 8104, { shirt: 0xd8d0b8, trousers: 0x3a3a3e, vest: 0x8a2a22, hat: 'felt', hatColor: 0x2a2a2a, hair: 0xb8b0a0, moustache: true }, { x: V.cx + 6.5, y: V.y, z: V.cz + 3.5 }, { judge: true }), this.ev.kind === 'fair' && nearTown && h > 8 && h < 19);
  }

  // ---- a village house taken at gunpoint: yours to live in, take apart, rebuild ----
  // a house you took: every block of it yours to dig out or build on, and a
  // plank door of your own in its doorway (it opens for you like the doors you buy)
  unlock(b) {
    const w = this.game.world;
    if (!b) return;
    b.taken = true;
    const y0 = Math.floor(b.door.y) - 1;
    for (let z = b.z0 - 1; z <= b.z1 + 1; z++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (let y = y0; y < y0 + 18; y++) if (w.inside(x, y, z)) w.locked[w.idx(x, y, z)] = 0;
    // the family's house door becomes your plank door (two high; the top of the doorway walled up)
    const cols = new Map();
    for (const [x, y, z] of b.doorCells || []) { const k = x + ',' + z; if (!cols.has(k) || cols.get(k)[1] > y) cols.set(k, [x, y, z]); }
    for (const [x, y, z] of cols.values()) {
      const id = w.get(x, y, z);
      if (id === B.DOOR || id === B.DOOR_OPEN) continue;            // (already done, or changed by you)
      if (id === B.HDOOR || id === B.AIR) { w.set(x, y, z, B.DOOR); w.set(x, y + 1, z, B.DOOR); if (w.get(x, y + 2, z) === B.AIR || w.get(x, y + 2, z) === B.HDOOR) w.set(x, y + 2, z, B.WOOD); }
    }
  }
  // the family of a house you took moves in with neighbors (they keep their jobs:
  // the shopkeeper still keeps the shop, the market woman still keeps her stall)
  rehome(b) {
    const T = this.T, F = T.folk, V = T.village, g = this.game;
    const others = V.buildings.filter((o) => o.type === 'house' && o !== b && !o.taken);
    const to = others.sort((a, c) => Math.hypot(a.inside.x - b.inside.x, a.inside.z - b.inside.z) - Math.hypot(c.inside.x - b.inside.x, c.inside.z - b.inside.z))[0];
    if (!to) return;
    for (const o of F.list) {
      if (o.home !== b) continue;
      o.home = to;
      // (older saves: they had left town for good; they come back)
      if (F.dead[o.i] >= 1e8) { delete F.dead[o.i]; o.alive = true; o.away = false; o.hp = 100; o.deadT = 0; o.pos.set(to.inside.x, to.inside.y, to.inside.z); o.route = []; }
    }
    void g;
  }
  stealHouse(v) {
    const g = this.game, T = this.T, b = v.home, i = T.village.buildings.indexOf(b);
    if (!b || i < 0 || this.stolen.includes(i)) return;
    this.stolen.push(i); this.unlock(b); this.rehome(b);
    T.addBounty(100, 'robbery'); T.crime('robbery', { value: 300, pos: g.player.pos.clone() }); T.addHonor(-15); T.trades.rep('outlaws', 8); T.trades.rep('farmers', -15);
    const h = T.houses.addTaken(i, false);
    if (h) T.houses.moveInto(h);                                      // you live there now: its double bed is yours
    g.hud.bigMessage(t('fr.houseTitle'), t('fr.houseSub'));
  }

  // ---- the posse never runs out of men: deputies ride in from the county ----
  updatePosse() {
    const g = this.game, T = this.T, F = T.folk, P = T.posse, pl = g.player.pos;
    if (!P) {
      if (this.deputies.length) { for (const v of this.deputies) { F.dropRig(v); v.away = true; v.alive = false; if (v.horse) g.horses.stable(v.horse); } F.extra = F.extra.filter((x) => !this.deputies.includes(x)); this.deputies = []; }
      return;
    }
    if (P.members.filter((m) => m.alive).length < 3) this.reinforce();
  }
  // a hostile posse nearly (or all) beaten: the next wave of deputies (false: no more)
  reinforce() {
    const g = this.game, T = this.T, F = T.folk, P = T.posse, pl = g.player.pos;
    if (!P || !P.hostile) return false;
    P.waves = P.waves || 0;
    if (P.waves >= 3 || (P.waveT && P.waveT > g.time)) return false;
    P.waves++; P.waveT = g.time + 0.02;
    const V = T.village, a = Math.atan2(V.cz - pl.z, V.cx - pl.x), n = 3 + P.waves;
    for (let k = 0; k < n; k++) {
      const at = { x: pl.x + Math.cos(a + (k - n / 2) * 0.15) * 75, y: pl.y + 4, z: pl.z + Math.sin(a + (k - n / 2) * 0.15) * 75 };
      const gy = F.ground(at.x, at.z, at.y + 6); if (gy != null) at.y = gy;
      const look = { shirt: 0x5a5040, trousers: 0x2e2a26, vest: 0x2a2420, hat: 'felt', hatColor: 0x3a2e22, hair: 0x3a2a1c, moustache: k % 2 === 0, gunbelt: true, star: true };
      const v = T.trades.makeMan(t('fr.deputy') + ' ' + (this.deputies.length + 1), 9600 + this.deputies.length, look, at);
      Object.assign(v, { posse: true, deputy: true, hp: 240, guns: k % 2 ? ['lever', 'revolver'] : ['shotgun', 'revolver'], money: 10, goods: [], brave: 1 });
      v.onKill = () => {}; v.onHurt = () => {};
      F.armed(v, F.bestGun(v));
      if (g.horses) g.horses.mountFor(v);
      F.extra.push(v); P.members.push(v); this.deputies.push(v);
    }
    g.hud.bigMessage(t('fr.reinfTitle'), t('fr.reinfSub', { n }));
    sfx.alert();
    return true;
  }

  // ---- the bank ----------------------------------------------------------------------------
  deposit(n) { n = Math.min(n, this.T.money); if (n <= 0) return; this.T.money -= n; this.bank.balance += n; sfx.coins(); }
  withdraw(n) { n = Math.min(n, this.bank.balance); if (n <= 0) return; this.bank.balance -= n; this.T.money += n; sfx.coins(); }
  // holding up the teller: the vault (and the town's savings), a huge bounty and a posse
  heist(v) {
    const g = this.game, T = this.T;
    v.surrendered = 30; v.route = []; T.folk.say(v, 'say.tellerUp', null, 'warn'); sfx.alert();
    if (this.bank.robbedDay > this.day() - 3) { g.hud.toast(t('fr.vaultEmpty')); return; }
    const take = this.bank.vault + Math.floor(Math.random() * 400);
    this.bank.robbedDay = this.day(); this.bank.vault = 0;
    T.money += take; T.st.earned += take;
    T.addBounty(180, 'heist'); T.crime('robbery', { victim: v, value: take, pos: g.player.pos.clone() });
    T.addHonor(-15); T.trades.rep('outlaws', 12); T.trades.rep('law', -15);
    g.hud.bigMessage(t('fr.heistTitle'), t('fr.heistSub', { n: take }));
    if (!T.posse) T.formPosse(g.player.pos.clone());
  }

  // ---- businesses --------------------------------------------------------------------------
  owns(shop) { return !!this.biz[shop]; }
  income(shop) { return Math.round(BIZ[shop] * 0.08); }        // (a business pays for itself in about two weeks)
  buyBiz(shop) {
    const T = this.T;
    if (this.biz[shop] || T.money < BIZ[shop]) { sfx.error(); return false; }
    T.money -= BIZ[shop]; this.biz[shop] = { how: 'bought', day: this.day(), hurt: -1 };
    T.trades.rep('merchants', 10); T.addHonor(3);
    this.game.hud.bigMessage(t('fr.bizTitle'), t('fr.bizSub', { shop: t('tmap.b.' + shop), n: this.income(shop) }));
    sfx.coins(); return true;
  }
  sellBiz(shop) {
    const b = this.biz[shop]; if (!b) return;
    const pay = b.how === 'bought' ? Math.round(BIZ[shop] * 0.7) : Math.round(BIZ[shop] * 0.25);       // a stolen deed sells cheap
    delete this.biz[shop]; this.T.money += pay; sfx.coins();
    this.game.hud.toast(t('fr.bizSold', { shop: t('tmap.b.' + shop), n: pay }), 'pick');
  }
  // a shopkeeper with his hands up signs his shop over to you
  stealBiz(v) {
    const g = this.game, T = this.T, shop = v.shop === 'land' ? null : v.shop;
    if (!shop || !BIZ[shop] || this.biz[shop]) return;
    this.biz[shop] = { how: 'stolen', day: this.day(), hurt: -1 };
    T.addBounty(90, 'robbery'); T.crime('robbery', { victim: v, value: 200, pos: g.player.pos.clone() });
    T.addHonor(-12); T.trades.rep('outlaws', 8); T.trades.rep('merchants', -15);
    g.hud.bigMessage(t('fr.stoleTitle'), t('fr.stoleSub', { shop: t('tmap.b.' + shop) }));
  }
  bizBuilding(shop) { return this.T.village.buildings.find((b) => b.type === shop) || null; }
  payDay() {
    const T = this.T, day = this.day();
    let n = 0;
    for (const [shop, b] of Object.entries(this.biz)) { const k = b.hurt >= day ? 0.3 : 1; n += Math.round(this.income(shop) * k * (this.ev.kind === 'market' ? 1.5 : 1)); }
    if (n > 0) { this.bank.balance += n; this.game.hud.bigMessage(t('fr.takingsTitle'), t('fr.takings', { n, total: this.bank.balance })); }
    // the bank pays a little interest and its vault fills up again
    this.bank.balance += Math.floor(this.bank.balance * 0.01);
    this.bank.vault = Math.min(900, this.bank.vault + 250);
  }

  // ---- rival gangs: raids on your businesses, ambushes, bounty hunters -------------------------
  rivalMan(gang, k, at, opts = {}) {
    const g = this.game, F = this.T.folk;
    const L = GANG_LOOK[gang] || GANG_LOOK.hunter;
    const look = { shirt: L.shirt, trousers: 0x262420, vest: L.vest, hat: 'felt', hatColor: L.hatColor, hair: 0x2a1c12, moustache: k % 2 === 0, gunbelt: true };
    const gy = F.ground(at.x, at.z, at.y + 4); if (gy != null) at.y = gy;
    const v = this.T.trades.makeMan(t('fr.gang.' + gang) + ' ' + (k + 1), 9300 + k + RIVALS.indexOf(gang) * 37 + (gang === 'hunter' ? 500 : 0), look, at);
    Object.assign(v, { outlaw: true, rival: gang, guns: k % 3 === 2 ? ['lever', 'revolver'] : ['revolver'], money: 15 + Math.floor(Math.random() * 30), goods: Math.random() < 0.2 ? ['tmap'] : ['bread'], brave: 0.9 }, opts);
    v.fight = { armed: F.bestGun(v) }; F.armed(v, v.fight.armed);       // (a foe for your gang to shoot)
    v.ai = (o, dt, d) => this.rivalAi(o, dt, d);
    v.onHurt = (o) => { o.provoked = true; if (o.camp) for (const m of o.camp.men || []) m.provoked = true; };
    v.onKill = () => {};
    F.extra.push(v);
    return v;
  }
  rivalAi(v, dt, d) {
    const g = this.game, F = this.T.folk, P = g.player.pos;
    if (!v.alive) return true;
    if (v.surrendered > 0) return false;
    v.tgT = (v.tgT || 0) - dt;
    if (v.tgT <= 0) {
      v.tgT = 0.6;
      let best = d < 60 ? null : null, bd = 999;
      if (d < 45 || v.hunter) { best = 'player'; bd = d; }
      for (const m of this.T.trades.gang) if (m.alive && !m.jailed && !m.hidden) { const dd = m.pos.distanceTo(v.pos); if (dd < bd && dd < 45) { bd = dd; best = m; } }
      // men of another gang: gang war
      if (v.rival !== 'hunter') for (const o of this.T.folk.extra) if (o.alive && o.rival && o.rival !== 'hunter' && o.rival !== v.rival && !(o.surrendered > 0)) { const dd = o.pos.distanceTo(v.pos); if (dd < bd && dd < 50) { bd = dd; best = o; } }
      // a camp's men stay by their fire until someone comes close
      if (v.camp && best && !v.provoked && (best === 'player' ? d : bd) > 32) best = null;
      v.tg = best;
    }
    const goal = v.tg === 'player' ? P : v.tg ? v.tg.pos : v.goal;
    if (!goal) { v.speed = 0; return true; }
    const gd = Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z);
    if (gd > (v.tg ? 18 : 2)) { F.goDirect(v, goal, gd > 30 ? 6.6 : 4.4, dt, v.tg ? 16 : 1.5); v.crouch = false; }
    else { v.speed = 0; v.peekT = (v.peekT || 0) - dt; if (v.peekT <= 0) { v.peek = !v.peek; v.peekT = v.peek ? 2 : 1; } v.crouch = !v.peek && !!v.tg; }
    if (v.tg) {
      v.yaw = Math.atan2(-(goal.x - v.pos.x), -(goal.z - v.pos.z));
      if (!v.crouch || v.speed > 0) { if (v.tg === 'player') F.shootAt(v, dt, 0.85); else F.shootAtMan(v, dt, v.tg); }
    }
    if (d > 220) { v.away = true; v.alive = false; }       // gone off: dropped from the world
    return true;
  }
  // ---- the gangs' camps: a fire, two tents, and their men round it ----
  makeCamps() {
    const g = this.game, w = g.world, V = this.T.village, H = this.T.hidden, out = [];
    const homes = V.buildings.filter((b) => b.type === 'house');
    for (const gang of RIVALS) {
      for (let k = 0; k < 300; k++) {
        const a = Math.random() * Math.PI * 2, r = 110 + Math.random() * 120;
        const x = Math.floor(V.cx + Math.cos(a) * r), z = Math.floor(V.cz + Math.sin(a) * r);
        if (x < 24 || z < 24 || x >= w.W - 24 || z >= w.D - 24) continue;
        if (homes.some((b) => Math.hypot(b.inside.x - x, b.inside.z - z) < 45) || H.places.some((q) => Math.hypot(q.x - x, q.z - z) < 45) || out.some((c) => Math.hypot(c.x - x, c.z - z) < 60)) continue;
        const C = this.T.cottage; if (Math.hypot(C.x - x, C.z - z) < 60) continue;
        const y = w.surfaceY(x, z), top = w.get(x, y - 1, z);
        if (top !== B.GRASS && top !== B.DIRT) continue;
        let flat = true; for (const [dx, dz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) if (Math.abs(w.surfaceY(x + dx, z + dz) - y) > 1) flat = false;
        if (!flat) continue;
        out.push({ gang, x, y, z, beaten: -99 });
        // the fire ring and a woodpile, two canvas tents
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) w.set(x + dx, y, z + dz, B.STONE);
        w.set(x, y, z, B.CHARCOAL);
        for (const sx of [-4, 4]) for (let dz = -1; dz <= 1; dz++) { w.set(x + sx - 1, y, z + 3 + dz, B.THATCH); w.set(x + sx + 1, y, z + 3 + dz, B.THATCH); w.set(x + sx, y + 1, z + 3 + dz, B.THATCH); }
        w.set(x + 3, y, z - 3, B.LOG); w.set(x + 4, y, z - 3, B.LOG);
        break;
      }
    }
    return out;
  }
  updateCamps() {
    const g = this.game, T = this.T, P = g.player.pos, F = T.folk;
    if (!this.camps) this.camps = this.makeCamps();
    for (const c of this.camps) {
      const d = Math.hypot(c.x - P.x, c.z - P.z), up = c.beaten < g.time - 6;
      if (!c.men && up && d < 80) {
        // the gang at its fire (more of them in the bigger gangs)
        const n = 4 + (RIVALS.indexOf(c.gang) % 3);
        c.men = [];
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const v = this.rivalMan(c.gang, k + 20, { x: c.x + 0.5 + Math.cos(a) * 3.5, y: c.y, z: c.z + 0.5 + Math.sin(a) * 3.5 }); v.camp = c; v.goal = { x: c.x + 0.5 + Math.cos(a) * 3.5, y: c.y, z: c.z + 0.5 + Math.sin(a) * 3.5 }; c.men.push(v); }
        if (!c.seen) { c.seen = true; g.hud.toast(t('fr.campSeen', { gang: t('fr.gangs.' + c.gang) })); }
      }
      if (!c.men) continue;
      const left = c.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
      if (!left.length) {
        // the camp is broken: their loot is yours
        c.beaten = g.time; c.men = null;
        const pay = 90 + Math.floor(Math.random() * 90);
        T.money += pay; this.st.rivalsBeaten++; this.st.campsBroken = (this.st.campsBroken || 0) + 1;
        T.trades.rep(T.trades.trade === 'outlaw' ? 'outlaws' : 'law', 6);
        g.hud.bigMessage(t('fr.campWon', { gang: t('fr.gangs.' + c.gang) }), t('fr.campWonSub', { n: pay }));
      } else if (d > 160) {
        for (const m of c.men) { F.dropRig(m); m.away = true; m.alive = false; }
        c.men = null;
      }
    }
  }
  // two gangs shooting it out somewhere near you (join in, or keep clear)
  updateWar() {
    const g = this.game, P = g.player.pos, F = this.T.folk, W = this.war;
    if (W) {
      const sides = W.gangs.map((gg) => W.men.filter((m) => m.rival === gg && m.alive && !m.away && !(m.surrendered > 0)).length);
      if (sides.some((n) => n === 0) || g.time > W.until) {
        for (const m of W.men) if (m.alive) { F.dropRig(m); m.away = true; m.alive = false; }
        if (sides.some((n) => n === 0)) { const win = W.gangs[sides[0] ? 0 : 1]; g.hud.toast(t('fr.warOver', { gang: t('fr.gangs.' + win) })); }
        this.war = null;
      }
      return;
    }
    if (g.time < this.warT || this.T.jailed || this.hour() < 8 || this.hour() > 20) return;
    this.warT = g.time + 1.5 + Math.random() * 1.5;
    const V = this.T.village;
    if (Math.hypot(P.x - V.cx, P.z - V.cz) < 60) return;           // never in the middle of town
    const i = Math.floor(Math.random() * RIVALS.length), gangs = [RIVALS[i], RIVALS[(i + 1 + Math.floor(Math.random() * (RIVALS.length - 1))) % RIVALS.length]];
    const a = Math.random() * 6.28, cx = P.x + Math.cos(a) * 60, cz = P.z + Math.sin(a) * 60, men = [];
    gangs.forEach((gg, side) => { for (let k = 0; k < 3; k++) { const v = this.rivalMan(gg, k + 30 + side * 3, { x: cx + (side ? 12 : -12), y: P.y, z: cz + (k - 1) * 4 }); men.push(v); } });
    this.war = { gangs, men, until: g.time + 0.12 };
    g.hud.alert(t('fr.warStart', { a: t('fr.gangs.' + gangs[0]), b: t('fr.gangs.' + gangs[1]) })); sfx.alert();
  }
  // an Outlaw's gang out in the country: a rival gang rides at you
  updateAmbush() {
    const g = this.game, T = this.T, P = g.player.pos, F = T.folk, A = this.ambush;
    if (A) {
      const left = A.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
      if (!left.length) { this.ambush = null; this.st.rivalsBeaten++; T.trades.rep('outlaws', 6); T.money += 50; g.hud.bigMessage(t('fr.ambushWon'), t('fr.ambushWonSub', { gang: t('fr.gangs.' + A.gang) })); }
      else if (g.time > A.until) { for (const m of left) { F.dropRig(m); m.away = true; m.alive = false; } this.ambush = null; }
      return;
    }
    if (T.trades.trade !== 'outlaw' || !T.trades.gang.some((m) => m.alive && !m.jailed) || g.time < this.ambushT || T.jailed) return;
    const V = T.village;
    if (Math.hypot(P.x - V.cx, P.z - V.cz) < 110) return;
    this.ambushT = g.time + 1.2 + Math.random() * 1.3;
    const gang = RIVALS[Math.floor(Math.random() * RIVALS.length)], a = Math.random() * 6.28, men = [];
    for (let k = 0; k < 4; k++) { const v = this.rivalMan(gang, k + 40, { x: P.x + Math.cos(a) * 55 + k * 2, y: P.y, z: P.z + Math.sin(a) * 55 }); v.provoked = true; men.push(v); }
    this.ambush = { gang, men, until: g.time + 0.15 };
    g.hud.bigMessage(t('fr.ambushTitle', { gang: t('fr.gangs.' + gang) }), t('fr.ambushSub'));
    sfx.alert();
  }
  startRaid() {
    const g = this.game, T = this.T, shops = Object.keys(this.biz);
    if (!shops.length) return;
    const shop = shops[Math.floor(Math.random() * shops.length)], b = this.bizBuilding(shop) || this.saloonB;
    if (!b) return;
    const gang = RIVALS[Math.floor(Math.random() * RIVALS.length)], men = [];
    const out = b.side === 's' ? 1 : -1, n = 3 + Math.floor(Math.random() * 2);
    for (let k = 0; k < n; k++) {
      const at = { x: b.door.x + (k - n / 2) * 2.5, y: b.door.y, z: b.door.z + out * (6 + (k % 2) * 2) };
      const v = this.rivalMan(gang, k, at);
      v.goal = { x: b.door.x, y: b.door.y, z: b.door.z };
      men.push(v);
    }
    this.raid = { shop, b, gang, men, until: g.time + 1.5 / 24 };
    g.hud.bigMessage(t('fr.raidTitle', { gang: t('fr.gangs.' + gang) }), t('fr.raidSub', { shop: t('tmap.b.' + shop) }));
    sfx.alert();
    // your gang rides to defend it with you
    const Tr = T.trades, free = Tr.free();
    if (free.length) {
      for (const [k, m] of free.entries()) { const a = k / free.length * 6.28, x = b.door.x + Math.cos(a) * 14, z = b.door.z + out * 3 + Math.sin(a) * 6, y = T.folk.ground(x, z, b.door.y + 3); if (y != null && !T.folk.visible(m)) m.pos.set(x, y, z); }
      Tr.issue('hold', new THREE.Vector3(b.door.x, b.door.y, b.door.z + out * 3));
      g.hud.toast(t('fr.gangDefends'));
    }
  }
  updateRaid() {
    const g = this.game, R = this.raid, F = this.T.folk;
    if (!R) return;
    const left = R.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!left.length) {
      this.raid = null; this.st.raidsWon++; this.st.rivalsBeaten++;
      const pay = 60 + R.men.length * 15; this.T.money += pay;
      this.T.trades.rep('outlaws', 5); this.T.addHonor(2);
      g.hud.bigMessage(t('fr.raidWon'), t('fr.raidWonSub', { n: pay, gang: t('fr.gangs.' + R.gang) }));
      return;
    }
    if (g.time > R.until) {
      const B = this.biz[R.shop]; if (B) B.hurt = this.day() + 2;
      for (const m of left) { F.dropRig(m); m.away = true; m.alive = false; }
      F.extra = F.extra.filter((x) => !x.away);
      this.raid = null;
      g.hud.alert(t('fr.raidLost', { shop: t('tmap.b.' + R.shop) }));
    }
  }
  // a big price on your head brings bounty hunters (two hard men who come for you)
  updateHunters() {
    const g = this.game, T = this.T, P = g.player.pos, F = T.folk;
    this.hunters = this.hunters.filter((v) => v.alive && !v.away);
    if (T.bounty < HUNTER_BOUNTY || T.jailed || this.hunters.length || g.time < this.hunterT) return;
    this.hunterT = g.time + 1.2 + Math.random();
    const a = Math.random() * 6.28;
    for (let k = 0; k < 2; k++) this.hunters.push(this.rivalMan('hunter', k, { x: P.x + Math.cos(a) * 55 + k * 2, y: P.y, z: P.z + Math.sin(a) * 55 }, { hunter: true, guns: ['lever', 'revolver'], brave: 1 }));
    g.hud.alert(t('fr.hunters', { n: T.bounty })); sfx.alert();
  }

  // ---- the stagecoach ---------------------------------------------------------------------------
  // It leaves the east end of Main Street at nine for the far station and comes
  // back in the afternoon. Rob it (hold up the driver: the guard draws), or ride
  // shotgun for pay (bandits try for it on the way out).
  route() {
    const V = this.T.village, w = this.game.world;
    if (!this.route_) { const x0 = V.cx + V.rx + 6, x1 = Math.min(w.W - 20, x0 + 170); this.route_ = { x0, x1, z: V.cz + 0.5 }; }
    return this.route_;
  }
  coachX() {
    const R = this.route(), h = this.hour(), L = R.x1 - R.x0;
    if (h < 9) return { x: R.x0, moving: false, dir: 1 };
    if (h < 11) return { x: R.x0 + L * (h - 9) / 2, moving: true, dir: 1 };
    if (h < 15) return { x: R.x1, moving: false, dir: -1 };
    if (h < 17) return { x: R.x1 - L * (h - 15) / 2, moving: true, dir: -1 };
    return { x: R.x0, moving: false, dir: 1 };
  }
  // the stage road: a dirt road out to the station, cleared of trees, with
  // plank bridges over the water (bridges can be blown; crews mend them by morning)
  buildRoad() {
    const g = this.game, w = g.world, R = this.route(), SEA_Y = this.seaY();
    this.bridges = [];
    let span = null;
    for (let x = Math.floor(R.x0) - 2; x <= Math.ceil(R.x1) + 2; x++) {
      const z0 = Math.floor(R.z);
      let wet = false;
      for (let dz = -1; dz <= 1; dz++) { const top = this.groundTop(x, z0 + dz); if (top.water) wet = true; }
      if (wet) {
        if (!span) { span = { x0: x, x1: x, y: SEA_Y }; this.bridges.push(span); }
        span.x1 = x;
      } else span = null;
      for (let dz = -1; dz <= 1; dz++) {
        const z = z0 + dz, top = this.groundTop(x, z);
        if (wet) continue;
        if (!w.isLocked(x, top.y, z) && (w.get(x, top.y, z) === B.GRASS || w.get(x, top.y, z) === B.DIRT || w.get(x, top.y, z) === B.SAND)) w.set(x, top.y, z, B.PATH);
        for (let h = 1; h <= 9; h++) { const id = w.get(x, top.y + h, z); if (id !== B.AIR && !w.isLocked(x, top.y + h, z) && (h <= 4 || id === B.LOG || id === B.LEAVES)) w.set(x, top.y + h, z, B.AIR); }     // (trees on the road are felled)
      }
    }
    this.mendBridges();
    this.roadOk = true;
  }
  seaY() { const w = this.game.world, R = this.route(); for (let x = R.x0; x <= R.x1; x++) { const top = this.groundTop(x, Math.floor(R.z)); if (top.water) return top.y + 1; } return 26; }
  // the natural ground (trees and leaves left out); water: the top of the water
  groundTop(x, z) {
    const w = this.game.world;
    for (let y = w.H - 2; y > 1; y--) {
      const id = w.get(x, y, z);
      if (id === B.AIR || id === B.LEAVES || id === B.LOG) continue;
      return { y, water: id === B.WATER };
    }
    return { y: 1, water: false };
  }
  // (re)lay the bridges' planks and rails
  mendBridges() {
    const w = this.game.world, z0 = Math.floor(this.route().z);
    for (const b of this.bridges || []) {
      for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (let dz = -1; dz <= 1; dz++) {
        if (w.get(x, b.y, z0 + dz) === B.AIR || w.get(x, b.y, z0 + dz) === B.WATER) w.set(x, b.y, z0 + dz, B.WOOD);
        for (let h = 1; h <= 3; h++) if (w.get(x, b.y + h, z0 + dz) === B.WATER) w.set(x, b.y + h, z0 + dz, B.AIR);
      }
      for (let x = b.x0; x <= b.x1; x++) for (const dz of [-2, 2]) { if (w.get(x, b.y, z0 + dz) === B.AIR || w.get(x, b.y, z0 + dz) === B.WATER) w.set(x, b.y, z0 + dz, B.WOOD); if (w.get(x, b.y + 1, z0 + dz) === B.AIR) w.set(x, b.y + 1, z0 + dz, B.FENCE); }
      b.broken = false;
    }
  }
  // what the coach's wheels stand on at x (null: nothing, it falls)
  coachGround(x) {
    const w = this.game.world, z = Math.floor(this.route().z), X = Math.floor(x);
    for (let y = w.H - 2; y > 1; y--) {
      const id = w.get(X, y, z);
      if (id === B.AIR || id === B.LEAVES || id === B.FENCE) continue;
      if (id === B.WATER) return { y: y + 1, water: true };
      return { y: y + 1, water: false };
    }
    return null;
  }
  // a dynamite blast (hidden.js): a bridge broken? the coach on it goes into the river
  blasted(c) {
    const R = this.route(), st = this.coach;
    for (const b of this.bridges || []) if (c.hx >= b.x0 - 2 && c.hx <= b.x1 + 2 && Math.abs(c.hz - R.z) < 4) b.broken = true;
    if (st && !st.wrecked && Math.hypot(st.x - c.x, R.z - c.z) < 5) this.wreckCoach();
  }
  wreckCoach() {
    const g = this.game, st = this.coach;
    if (!st || st.wrecked) return;
    st.wrecked = true; st.held = true; st.robbing = true; st.fallV = 0;
    for (const h of st.horses || []) { h.rider = null; h.owner = 'stable'; h.home = { x: h.pos.x, y: h.pos.y, z: h.pos.z }; }       // the team breaks loose
    st.horses = [];
    g.hud.alert(t('fr.coachWrecked'));
    this.T.addBounty(30, 'robbery'); this.T.crime('robbery', { pos: g.player.pos.clone() });
  }
  // a Concord stagecoach: a rounded red body on leather braces, yellow wheels
  // and running gear, the driver's box up front, the luggage on the roof
  buildCoach() {
    const g = this.game, grp = new THREE.Group();
    const mats = {}, m = (c) => mats[c] || (mats[c] = new THREE.MeshLambertMaterial({ color: c }));
    const add = (w, h, d, c, x, y, z, p = grp) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(c)); o.position.set(x, y, z); p.add(o); return o; };
    const RED = 0x7a2016, YEL = 0xc8a038, DARK = 0x2a1e14, GLASS = 0x2a3038, LEATHER = 0x4a3020;
    // the body: wider in the middle, a curved bottom (stacked boxes), windows and doors
    add(1.6, 1.0, 2.4, RED, 0, 1.75, 0); add(1.5, 0.25, 2.0, RED, 0, 1.15, 0); add(1.3, 0.15, 1.5, RED, 0, 0.98, 0);
    add(1.7, 0.1, 2.6, DARK, 0, 2.3, 0);                              // the roof
    for (const sx of [-0.81, 0.81]) { add(0.03, 0.45, 0.6, GLASS, sx, 1.95, -0.55); add(0.03, 0.45, 0.6, GLASS, sx, 1.95, 0.55); add(0.04, 0.06, 2.4, YEL, sx, 1.42, 0); add(0.04, 0.06, 2.4, YEL, sx, 2.24, 0); }
    add(1.2, 0.5, 0.03, GLASS, 0, 1.95, -1.21);
    // the luggage rack, trunks and the strongbox
    for (const sx of [-0.8, 0.8]) add(0.05, 0.2, 2.4, DARK, sx, 2.45, 0);
    add(0.7, 0.4, 0.6, 0x5a4026, -0.2, 2.55, 0.5); add(0.6, 0.35, 0.5, 0x3a3020, 0.3, 2.53, -0.2); add(0.45, 0.3, 0.35, 0x2a2a2a, 0.15, 2.5, 0.75);
    // the rear boot (leather) and the driver's box with its footboard
    add(1.3, 0.8, 0.6, LEATHER, 0, 1.4, 1.5);
    add(1.4, 0.15, 0.7, DARK, 0, 2.35, -1.45); add(1.4, 0.5, 0.1, DARK, 0, 2.6, -1.1); add(1.2, 0.08, 0.5, DARK, 0, 1.75, -1.85); add(1.2, 0.55, 0.06, DARK, 0, 2.0, -2.1);
    // the running gear: yellow axles and perch, leather thoroughbraces
    add(0.15, 0.15, 3.6, YEL, 0, 0.75, -0.2); add(1.9, 0.12, 0.12, YEL, 0, 0.75, -1.25); add(1.9, 0.12, 0.12, YEL, 0, 0.85, 1.15);
    for (const sx of [-0.55, 0.55]) add(0.08, 0.08, 2.6, LEATHER, sx, 1.0, 0);
    // wheels: yellow spokes and hubs, dark iron tyres; big at the back
    const wheel = (r, x, z) => {
      const W = new THREE.Group(); W.position.set(x, r, z); grp.add(W);
      const tyre = new THREE.Mesh(new THREE.TorusGeometry(r - 0.05, 0.06, 6, 18), m(DARK)); tyre.rotation.y = Math.PI / 2; W.add(tyre);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.12, 0.04, 6, 18), m(YEL)); rim.rotation.y = Math.PI / 2; W.add(rim);
      for (let k = 0; k < 6; k++) { const sp = add(0.05, r * 2 - 0.2, 0.05, YEL, 0, 0, 0, W); sp.rotation.x = k * Math.PI / 6; }
      add(0.25, 0.18, 0.18, YEL, 0, 0, 0, W);
      return W;
    };
    const wheels = [wheel(0.82, -0.98, 1.15), wheel(0.82, 0.98, 1.15), wheel(0.62, -0.95, -1.25), wheel(0.62, 0.95, -1.25)];
    // the pole out to the team
    add(0.1, 0.1, 3.6, DARK, 0, 0.85, -3.1);
    // the driver (reins in hand) and the shotgun guard
    const man = (x, coat, hat) => { add(0.42, 0.55, 0.35, coat, x, 2.68, -1.42); add(0.3, 0.3, 0.3, 0xc8a080, x, 3.12, -1.42); add(0.5, 0.06, 0.5, hat, x, 3.3, -1.42); add(0.3, 0.14, 0.3, hat, x, 3.38, -1.42); add(0.36, 0.2, 0.55, 0x2a2622, x, 2.45, -1.7); };
    man(-0.32, 0x3a2c22, 0x2a2018); man(0.34, 0x5a4a32, 0x4a3a28);
    add(0.06, 0.06, 1.1, 0x2a2a2a, 0.55, 2.85, -1.6).rotation.x = -0.5;          // the guard's shotgun
    g.scene.add(grp);
    grp.userData.wheels = wheels;
    return grp;
  }
  // the team: four of the game's own horses in harness, in front of the coach
  coachHorses(st, on) {
    const g = this.game, H = g.horses;
    if (!on) { for (const h of st.horses || []) { h.drop(); H.list = H.list.filter((x) => x !== h); } st.horses = null; return; }
    if (st.horses || st.wrecked) return;
    st.horses = [];
    for (let k = 0; k < 4; k++) { const h = H.add(st.x, st.y, this.route().z, 'coach', null, [0, 2, 1, 3][k]); h.rider = { coach: true }; h.slot = k; st.horses.push(h); }
  }
  updateCoach(dt) {
    const g = this.game, P = g.player.pos, R = this.route(), F = this.T.folk;
    if (!this.roadOk) this.buildRoad();
    const C = this.coachX();
    let st = this.coach;
    if (!st) st = this.coach = { x: C.x, held: false, mesh: null, robbed: -1 };
    if (st.wrecked) {
      // in the river: it lies on its side where it fell
      if (st.mesh) { st.fallV = Math.min(8, (st.fallV || 0) + dt * 9); const gnd = this.coachGround(st.x); if (gnd && st.y > gnd.y - 1.2) st.y -= st.fallV * dt; st.mesh.position.set(st.x, st.y, R.z); st.mesh.rotation.z = Math.min(1.3, (st.mesh.rotation.z || 0) + dt * 1.5); }
      if (this.hour() < 8 && this.ev.day !== st.wreckDay) { st.wreckDay = this.ev.day; }
      return;
    }
    // the driver pulls up before a broken bridge
    const next = C.moving ? st.x + C.dir * 3 : st.x;
    const ahead = this.coachGround(next);
    if (C.moving && ahead && ahead.water && !st.onBridge) st.waitBridge = true; else if (!C.moving || (ahead && !ahead.water)) st.waitBridge = false;
    if (st.held || st.waitBridge) { /* stopped */ } else st.x = C.x;
    const gnd = this.coachGround(st.x);
    st.onBridge = (this.bridges || []).some((b) => st.x >= b.x0 - 1 && st.x <= b.x1 + 1);
    if (gnd && gnd.water) { this.wreckCoach(); return; }              // the bridge gave way under it
    const y = gnd ? gnd.y : st.y || 30;
    st.y = st.y == null ? y : st.y + (y - st.y) * Math.min(1, dt * 4);
    const near = Math.hypot(st.x - P.x, R.z - P.z) < 200;
    if (near && !st.mesh) st.mesh = this.buildCoach();
    else if (!near && st.mesh) { g.scene.remove(st.mesh); st.mesh = null; }
    this.coachHorses(st, near);
    const moving = C.moving && !st.held && !st.waitBridge, dir = C.dir;
    if (st.mesh) {
      st.mesh.position.set(st.x, st.y, R.z); st.mesh.rotation.set(0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      if (moving) for (const W of st.mesh.userData.wheels) W.rotation.x -= dt * 4.2 * (W.position.y > 0.7 ? 0.75 : 1);
    }
    // the team: two pairs ahead of the coach
    for (const h of st.horses || []) {
      if (!h.alive) continue;
      const row = h.slot >> 1, side = (h.slot & 1) ? 0.75 : -0.75;
      const hx = st.x + dir * (4.2 + row * 2.7), hz = R.z + side * dir;
      const hg = this.coachGround(hx);
      h.pos.set(hx, hg ? hg.y : st.y, hz); h.yaw = dir > 0 ? -Math.PI / 2 : Math.PI / 2; h.speed = moving ? 4.4 : 0;
    }
    // riding shotgun: the job pays when the coach reaches the station with you by it
    const J = this.coachJob;
    if (J) {
      if (!J.ambush && C.moving && C.dir > 0 && st.x > R.x0 + (R.x1 - R.x0) * 0.45) {
        J.ambush = [];
        for (let k = 0; k < 3; k++) J.ambush.push(this.rivalMan('blackhats', k + 5, { x: st.x + 30 + k * 2, y: st.y, z: R.z + (k - 1) * 8 }));
        g.hud.alert(t('fr.ambush')); sfx.alert();
      }
      if (J.ambush && J.ambush.some((m) => m.alive && !m.away) && Math.hypot(st.x - P.x, R.z - P.z) < 80) st.held = true;      // the driver pulls up while the shooting lasts
      else if (J.ambush && st.held && !st.robbing) st.held = false;
      if (!C.moving && C.dir < 0) {
        if (Math.hypot(st.x - P.x, R.z - P.z) < 40) { const pay = 70; this.T.money += pay; this.st.coaches++; this.T.trades.rep('law', 4); g.hud.bigMessage(t('fr.coachDone'), t('fr.coachDoneSub', { n: pay })); }
        else g.hud.toast(t('fr.coachMissed'));
        this.coachJob = null;
      }
    }
  }
  coachNear(p, r = 6) { const st = this.coach; return st && st.mesh && Math.hypot(st.x - p.x, this.route().z - p.z) < r ? st : null; }
  holdUpCoach() {
    const g = this.game, T = this.T, st = this.coach, F = T.folk, R = this.route();
    if (!st || st.held) return;
    st.held = true; st.robbing = true;
    sfx.alert();
    // the shotgun guard climbs down and draws
    const gv = this.T.trades.makeMan(t('fr.guard'), 8120, { shirt: 0x5a4a32, trousers: 0x2a2622, vest: 0x2a2018, hat: 'felt', hatColor: 0x3a2a1c, hair: 0x3a2a1c, moustache: true, gunbelt: true }, { x: st.x + 1.6, y: st.y, z: R.z + 1.5 });
    Object.assign(gv, { outlaw: true, guns: ['shotgun', 'revolver'], money: 20, goods: [], brave: 0.95 });
    gv.fight = { armed: 'shotgun' }; F.armed(gv, 'shotgun'); gv.cool = this.T.duels.reaction(gv);
    gv.ai = () => false; gv.onKill = () => {};
    F.extra.push(gv); st.guard = gv;
    T.crime('holdup', { pos: g.player.pos.clone() }); T.addBounty(40, 'holdup');
    g.hud.toast(t('fr.coachHeld'));
  }
  robCoach() {
    const g = this.game, T = this.T, st = this.coach;
    if (!st || st.robbed === this.day()) { g.hud.toast(t('fr.coachEmpty')); return; }
    if (st.guard && st.guard.alive && !(st.guard.surrendered > 0)) { g.hud.toast(t('fr.coachGuard')); return; }
    st.robbed = this.day();
    const n = 160 + Math.floor(Math.random() * 160);
    T.money += n; T.st.earned += n;
    T.addBounty(60, 'robbery'); T.crime('robbery', { value: n, pos: g.player.pos.clone() }); T.trades.rep('outlaws', 6);
    g.hud.bigMessage(t('fr.coachRobbed'), t('fr.coachRobbedSub', { n })); sfx.coins();
    st.robbing = false;
  }

  // ---- the town's calendar: market day, gold rush, weather, the fair -----------------------------
  dawn() {
    const g = this.game, T = this.T, day = this.day(), season = T.seasonName();
    const E = this.ev;
    E.day = day;
    if (E.kind && E.until <= g.time) this.endEvent();
    if (E.rush && E.rushUntil <= g.time) { E.rush = false; g.hud.toast(t('fr.rushOver')); }
    this.payDay();
    this.ranchHands();
    if (this.bridges && this.bridges.some((b) => b.broken)) { this.mendBridges(); }
    if (this.coach && this.coach.wrecked) { this.coachHorses(this.coach, false); if (this.coach.mesh) this.game.scene.remove(this.coach.mesh); if (this.coach.guard) { this.T.folk.dropRig(this.coach.guard); this.T.folk.extra = this.T.folk.extra.filter((x) => x !== this.coach.guard); } this.coach = null; }      // a new coach on the line
    this.foalCheck();
    if (E.kind) return;
    // the autumn fair: the second day of autumn, once a year
    const year = Math.floor(day / 12);
    if (season === 'autumn' && E.fairYear !== year && T.dayOfSeason() >= 2) { E.fairYear = year; return this.startEvent('fair', 0.55); }
    if (day % 7 === 6) return this.startEvent('market', 0.6);
    if (!E.rushDone && day >= 8 && Math.random() < 0.12) { E.rushDone = true; E.rush = true; E.rushUntil = g.time + 3; this.goldRush(); return; }
    const r = Math.random();
    if (season === 'summer' && r < 0.2) return this.startEvent('fire', 0.4);
    if (season === 'winter' && r < 0.25) return this.startEvent('blizzard', 0.5);
    if (season === 'spring' && r < 0.18) return this.startEvent('flood', 0.5);
  }
  startEvent(kind, len) {
    const g = this.game, E = this.ev;
    E.kind = kind; E.until = g.time + len;
    g.hud.bigMessage(t('fr.ev.' + kind), t('fr.ev.' + kind + 'Sub'));
    if (kind === 'fire') this.startFire();
    if (kind === 'blizzard') { g.weather.rain = 1; g.weather.target = 1; g.weather.timer = 600; }
    if (kind === 'flood') { g.weather.rain = 1; g.weather.target = 1; g.weather.timer = 400; this.flood(); }
  }
  endEvent() {
    const g = this.game, E = this.ev;
    if (E.kind === 'fire' && this.fire) this.burnOut();
    if (E.kind === 'blizzard') { g.weather.target = 0; }
    E.kind = null;
  }
  goldRush() {
    const g = this.game, w = g.world;
    for (const p of this.T.hidden.places) if (p.kind === 'mine') for (const q of p.path) for (const s of [-2, 2]) {
      const [dx, dz] = p.dir, x = q.x - dz * s, z = q.z + dx * s;
      if (Math.random() < 0.4 && w.get(x, q.y + 1, z) === B.STONE) w.set(x, q.y + 1, z, B.GOLD);
    }
    g.hud.bigMessage(t('fr.rushTitle'), t('fr.rushSub'));
  }
  // a prairie fire on one of the farms: douse it with buckets of water before the crops burn
  startFire() {
    const V = this.T.village, homes = V.buildings.filter((b) => b.type === 'house' && b.field);
    const b = homes[Math.floor(Math.random() * homes.length)];
    if (!b) return;
    const f = b.field, g = this.game, spots = [];
    for (let k = 0; k < 5; k++) spots.push({ x: f.x0 + Math.random() * (f.x1 - f.x0 + 1), y: (f.y ?? V.y) + 0.5, z: f.z0 + Math.random() * (f.z1 - f.z0 + 1), on: true });
    const grp = new THREE.Group(), mat = new THREE.SpriteMaterial({ color: 0xff7a20, transparent: true, opacity: 0.85, depthWrite: false });
    for (const s of spots) { const sp = new THREE.Sprite(mat); sp.scale.set(2.2, 2.6, 1); sp.position.set(s.x, s.y + 1, s.z); s.sp = sp; grp.add(sp); }
    g.scene.add(grp);
    this.fire = { b, spots, grp, t: 0 };
    g.hud.alert(t('fr.fireAt', { home: this.T.trades.houseName(b) }));
  }
  updateFire(dt) {
    const F = this.fire, g = this.game;
    if (!F) return;
    F.t += dt;
    for (const s of F.spots) if (s.on && s.sp) { const k = 1 + Math.sin(g.time * 2000 + s.x) * 0.15; s.sp.scale.set(2.2 * k, 2.6 * k, 1); }
    if (Math.random() < dt * 3) { const s = F.spots[Math.floor(Math.random() * F.spots.length)]; if (s.on) g.particles.burst(s.x, s.y + 1.5, s.z, [0.25, 0.22, 0.2], 3, 1.5, 1.5, 10); }
    if (!F.spots.some((s) => s.on)) {
      g.scene.remove(F.grp); this.fire = null; this.ev.kind = null;
      this.T.money += 40; this.T.addHonor(4); this.T.trades.rep('farmers', 8);
      g.hud.bigMessage(t('fr.fireOut'), t('fr.fireOutSub'));
    }
  }
  douse(s) {
    const g = this.game;
    s.on = false; if (s.sp) s.sp.visible = false;
    g.take('bucket_water', 1); g.give('bucket', 1); g.hud.dirtyHotbar = true;
    sfx.splash(); g.particles.burst(s.x, s.y + 1, s.z, [0.8, 0.8, 0.85], 10, 2, 1, 14);
  }
  burnOut() {
    const g = this.game, F = this.fire, w = g.world, f = F.b.field;
    // the fire won: the field's crops are burned (the family replants)
    for (const [i, cr] of this.T.farm.crops) {
      const x = i % w.W, z = Math.floor(i / w.W) % w.D;
      if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) { cr.h = 0.05; cr.g = 0; this.T.farm.show(i, cr); }
    }
    g.scene.remove(F.grp); this.fire = null;
    g.hud.alert(t('fr.fireLost'));
  }
  // spring flood: the river rises and drowns crops planted near the water
  flood() {
    const g = this.game, w = g.world;
    let n = 0;
    for (const [i, cr] of this.T.farm.crops) {
      if (cr.o !== 'p') continue;
      const x = i % w.W, z = Math.floor(i / w.W) % w.D, y = Math.floor(i / (w.W * w.D));
      let wet = false;
      for (let dz = -4; dz <= 4 && !wet; dz += 2) for (let dx = -4; dx <= 4 && !wet; dx += 2) if (w.get(x + dx, y - 1, z + dz) === B.WATER || w.get(x + dx, y - 2, z + dz) === B.WATER) wet = true;
      if (wet) { cr.h = 0.1; this.T.farm.show(i, cr); n++; }
    }
    if (n) g.hud.alert(t('fr.floodCrops', { n }));
  }
  // a blizzard: out in it, away from a fire and a roof, the cold bites
  updateCold(dt) {
    const g = this.game, P = g.player.pos, w = g.world;
    if (this.ev.kind !== 'blizzard' || this.T.jailed) return;
    const roof = [2, 3, 4, 5, 6].some((h) => SOLID[w.get(Math.floor(P.x), Math.floor(P.y) + h, Math.floor(P.z))]);
    const fire = g.campfires && g.campfires.near(P, 7);
    if (roof || fire) { this.cold = Math.max(0, this.cold - dt * 2); return; }
    this.cold += dt;
    if (this.cold > 40 && (this.coldT = (this.coldT || 0) - dt) <= 0) { this.coldT = 4; g.damage(7, 'cold'); if (this.cold < 46) g.hud.toast(t('fr.freezing')); }
  }

  // ---- the town fair -------------------------------------------------------------------------
  // shooting contest: bottles on the fence by the plaza, 30 seconds
  startShooting() {
    const g = this.game, V = this.T.village;
    if (this.contest) return;
    const grp = new THREE.Group(), geo = new THREE.BoxGeometry(0.22, 0.45, 0.22), bottles = [];
    for (let k = 0; k < 8; k++) {
      const b = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: k % 2 ? 0x3a6a3a : 0x6a4a2a }));
      const x = V.cx + 14 + k * 1.3, y = V.y + 1.25 + (k % 3) * 0.4, z = V.cz - 3.2;
      b.position.set(x, y, z); grp.add(b); bottles.push({ m: b, x, y, z, up: true });
    }
    g.scene.add(grp);
    this.contest = { kind: 'shoot', t: 30, bottles, grp, hits: 0 };
    g.hud.bigMessage(t('fr.shootGo'), t('fr.shootGoSub'));
  }
  // every shot you fire: did it break a bottle? (game.js calls this)
  onShot(eye, dir) {
    const C = this.contest;
    if (!C || C.kind !== 'shoot') return;
    for (const b of C.bottles) {
      if (!b.up) continue;
      const v = new THREE.Vector3(b.x - eye.x, b.y - eye.y, b.z - eye.z), along = v.dot(dir);
      if (along < 0) continue;
      const miss = v.clone().addScaledVector(dir, -along).length();
      if (miss < 0.28) { b.up = false; b.m.visible = false; C.hits++; this.game.particles.burst(b.x, b.y, b.z, [0.4, 0.6, 0.4], 8, 2, 0.6, 12); sfx.clang && sfx.clang(0.4); break; }
    }
  }
  // the horse race: out to the flag and back, against the fastest rider's time
  startRace() {
    const g = this.game, V = this.T.village, P = g.player.pos;
    if (this.contest) return;
    if (!g.player.riding) { g.hud.toast(t('fr.raceHorse')); return; }
    const fx = V.cx - V.rx - 50, fz = V.cz + 0.5, y = (g.world.tops ? g.world.tops[Math.floor(fx) + Math.floor(fz) * g.world.W] + 1 : V.y);
    const flag = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 4, 0.15), new THREE.MeshLambertMaterial({ color: 0x5a4a32 })); pole.position.y = 2; flag.add(pole);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 1.1), new THREE.MeshBasicMaterial({ color: 0xc02a20 })); cloth.position.set(0, 3.6, 0.55); flag.add(cloth);
    flag.position.set(fx, y, fz); g.scene.add(flag);
    this.contest = { kind: 'race', t: 0, flag, fx, fz, start: { x: P.x, z: P.z }, turned: false, best: 0 };
    const dist = Math.hypot(fx - P.x, fz - P.z) * 2;
    this.contest.best = dist / 11.5;                  // the best of the other riders, in seconds
    g.hud.bigMessage(t('fr.raceGo'), t('fr.raceGoSub', { s: Math.round(this.contest.best) }));
  }
  livestockPrize() {
    const g = this.game, own = g.animals.list.filter((a) => a.owner === 'player' && a.state !== 'dead');
    const score = own.reduce((s, a) => s + ({ cow: 3, pig: 2, sheep: 2, chicken: 1 }[a.type] || 1), 0);
    if (this.ev.livestock === this.day()) { g.hud.toast(t('fr.prizeDone')); return; }
    this.ev.livestock = this.day();
    if (score >= 8) this.win(60, 'livestock1'); else if (score >= 3) { this.T.money += 20; g.hud.toast(t('fr.prize2', { n: 20 }), 'pick'); } else g.hud.toast(t('fr.prizeNone'));
  }
  win(n, what) {
    const g = this.game;
    this.T.money += n; this.st.ribbons++; this.T.addHonor(3);
    g.hud.bigMessage(t('fr.ribbon'), t('fr.won.' + what, { n }));
    sfx.done && sfx.done();
  }
  updateContest(dt) {
    const C = this.contest, g = this.game, P = g.player.pos;
    if (!C) return;
    if (C.kind === 'shoot') {
      C.t -= dt;
      if (C.t <= 0 || C.hits >= C.bottles.length) {
        g.scene.remove(C.grp); this.contest = null;
        if (C.hits >= 6) this.win(50, 'shoot'); else { const n = C.hits * 3; this.T.money += n; g.hud.toast(t('fr.shootScore', { hits: C.hits, n }), 'pick'); }
      }
      return;
    }
    C.t += dt;
    if (!C.turned && Math.hypot(C.fx - P.x, C.fz - P.z) < 4) { C.turned = true; g.hud.toast(t('fr.raceTurn')); }
    if (C.turned && Math.hypot(C.start.x - P.x, C.start.z - P.z) < 5) {
      g.scene.remove(C.flag); this.contest = null;
      if (C.t < C.best) this.win(80, 'race'); else g.hud.toast(t('fr.raceLost', { s: Math.round(C.t), b: Math.round(C.best) }));
    } else if (C.t > 180) { g.scene.remove(C.flag); this.contest = null; g.hud.toast(t('fr.raceOff')); }
  }

  // ---- wanted posters ----------------------------------------------------------------------------
  updatePosters() {
    const g = this.game, T = this.T, want = T.bounty >= POSTER_BOUNTY;
    const key = want ? T.bounty : 0;
    if (key === (this.posterKey || 0)) return;
    this.posterKey = key;
    if (this.posters) { g.scene.remove(this.posters); this.posters.children.forEach((m) => { m.material.map.dispose(); m.material.dispose(); }); this.posters = null; }
    if (!want) return;
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 160;
    const c = cv.getContext('2d');
    c.fillStyle = '#e4d4a8'; c.fillRect(0, 0, 128, 160); c.strokeStyle = '#6a5030'; c.lineWidth = 4; c.strokeRect(2, 2, 124, 156);
    c.fillStyle = '#2a1c10'; c.textAlign = 'center'; c.font = 'bold 26px Georgia, serif'; c.fillText(t('fr.posterWanted'), 64, 32);
    c.fillStyle = '#5a4a3a'; c.fillRect(34, 42, 60, 62); c.fillStyle = '#c8a888'; c.fillRect(46, 52, 36, 40); c.fillStyle = '#2a1c10'; c.fillRect(40, 44, 48, 12);
    c.fillStyle = '#2a1c10'; c.font = 'bold 15px Georgia, serif'; c.fillText(t('fr.posterDead'), 64, 124); c.font = 'bold 20px Georgia, serif'; c.fillText('$' + T.bounty, 64, 148);
    const tex = new THREE.CanvasTexture(cv);
    this.posters = new THREE.Group();
    for (const type of ['hall', 'stable', 'general', 'saloon']) {
      const b = T.village.buildings.find((x) => x.type === type);
      if (!b || !b.sign) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1), new THREE.MeshBasicMaterial({ map: tex }));
      const f = b.sign.face;
      m.position.set(b.sign.x + f[0] * 0.01 + (f[1] ? 2 : 0), b.y ?? (b.sign.y - 1.9), b.sign.z + f[1] * 0.01 + (f[0] ? 2 : 0));
      m.position.y = b.sign.y - 1.9;
      m.rotation.y = Math.atan2(f[0], f[1]);
      this.posters.add(m);
    }
    g.scene.add(this.posters);
  }

  // ---- ranch hands, cattle drives, rustlers, horses --------------------------------------------------
  // a hired hand waters your crops every morning, brings the ripe ones in (to
  // your chest) and plants them again
  ranchHands() {
    const g = this.game, T = this.T, w = g.world;
    if (!this.hands) return;
    const wage = this.hands * HAND_PAY;
    if (T.money < wage && this.bank.balance < wage) { this.hands = 0; g.hud.alert(t('fr.handsLeft')); return; }
    if (T.money >= wage) T.money -= wage; else this.bank.balance -= wage;
    let n = 0, watered = 0;
    const chest = g.cabin && g.cabin.chest;
    for (const [i, cr] of [...T.farm.crops]) {
      if (cr.o !== 'p') continue;
      T.farm.evaluate(i, cr); cr.w = g.time; watered++;
      if (cr.g >= 1 && n < this.hands * 24) {
        const x = i % w.W, z = Math.floor(i / w.W) % w.D, y = Math.floor(i / (w.W * w.D));
        const got = T.farm.harvest(x, y, z);
        if (got && chest) for (const [id, k] of got.items) if (!id.startsWith('seed_')) chest.counts[id] = (chest.counts[id] || 0) + k;
        T.farm.crops.set(i, { c: cr.c, g: 0, w: g.time, e: g.time, h: 1, o: 'p' }); w.set(x, y, z, B.SPROUT);
        n++; T.st.harvested++;
      }
      T.farm.show(i, T.farm.crops.get(i));
    }
    g.hud.toast(t('fr.handsDid', { n, w: watered, pay: wage }));
  }
  // the cattle drive: walk four steers from the stable to the station east of town
  startDrive() {
    const g = this.game, A = g.animals, V = this.T.village, st = V.buildings.find((b) => b.type === 'stable');
    if (this.drive || !st) return;
    const herd = { type: 'cow', cx: st.door.x, cz: st.door.z, moveT: 99999, members: [], airborne: false };
    A.herds.push(herd);
    const out = st.side === 's' ? 1 : -1;
    for (let k = 0; k < 4; k++) { const a = A.add('cow', herd, st.door.x + (k - 1.5) * 1.6, st.door.y, st.door.z - out * 4); a.owner = 'drive'; }     // (add() puts it in the herd)
    this.drive = { herd, t: 0 };
    g.hud.bigMessage(t('fr.driveTitle'), t('fr.driveSub'));
  }
  updateDrive(dt) {
    const D = this.drive, g = this.game, P = g.player.pos, F = this.T.folk, R = this.route();
    if (!D || !D.herd) { if (D && !D.herd) this.drive = null; return; }
    const cows = D.herd.members.filter((a) => a.state !== 'dead');
    D.t += dt;
    for (const [k, a] of cows.entries()) {
      // they trail you (herded): close behind, never on top of you
      const tx = P.x + Math.cos(k * 1.6) * 3.2, tz = P.z + Math.sin(k * 1.6) * 3.2, d = Math.hypot(tx - a.pos.x, tz - a.pos.z);
      if (d > 1 && d < 40) {
        const sp = Math.min(d, 5) * dt, nx = a.pos.x + (tx - a.pos.x) / d * sp, nz = a.pos.z + (tz - a.pos.z) / d * sp, gy = F.ground(nx, nz, a.pos.y + 2);
        if (gy != null && Math.abs(gy - a.pos.y) < 1.2) { a.pos.set(nx, gy, nz); a.yaw = Math.atan2(-(tx - a.pos.x), -(tz - a.pos.z)); a.speed = 2; a.state = 'calm'; }
      }
    }
    const atStation = cows.filter((a) => Math.hypot(a.pos.x - R.x1, a.pos.z - R.z) < 14).length;
    if (atStation && atStation === cows.length) {
      const pay = 18 * cows.length;
      this.T.money += pay; this.st.drives++; this.T.trades.rep('farmers', 4);
      for (const a of cows) g.animals.remove(a);
      this.drive = null;
      g.hud.bigMessage(t('fr.driveDone'), t('fr.driveDoneSub', { n: pay }));
    } else if (!cows.length || D.t > 900) { this.drive = null; g.hud.toast(t('fr.driveFailed')); }
  }
  // rustlers at night: they come for your animals; stop them before they get away
  updateRustlers() {
    const g = this.game, T = this.T, P = g.player.pos, night = Math.floor(g.time - 0.25), h = this.hour();
    const mine = g.animals.list.filter((a) => a.owner === 'player' && a.state !== 'dead');
    const R = this.rustlers;
    if (!R && mine.length >= 2 && h > 22 && this.rustleNight !== night) {
      this.rustleNight = night;
      if (Math.random() < 0.3) {
        const a0 = mine[0], men = [];
        for (let k = 0; k < 2; k++) men.push(this.rivalMan('crane', k + 7, { x: a0.pos.x + 8 + k * 2, y: a0.pos.y, z: a0.pos.z + 6 }));
        for (const m of men) { m.goal = { x: a0.pos.x, y: a0.pos.y, z: a0.pos.z }; }
        this.rustlers = { men, until: g.time + 1.5 / 24, at: a0 };
        if (Math.hypot(a0.pos.x - P.x, a0.pos.z - P.z) < 150) g.hud.alert(t('fr.rustlers'));
      }
    }
    if (!R) return;
    const left = R.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!left.length) { this.rustlers = null; T.money += 30; T.trades.rep('law', 4); T.trades.rep('farmers', 4); g.hud.bigMessage(t('fr.rustlersDone'), t('fr.rustlersDoneSub')); return; }
    if (g.time > R.until) {
      const a = mine.find((x) => x === R.at) || mine[0];
      if (a) { g.animals.remove(a); g.hud.alert(t('fr.rustled', { a: t('animal.' + a.type) })); }
      for (const m of left) { this.T.folk.dropRig(m); m.away = true; m.alive = false; }
      this.rustlers = null;
    }
  }
  // breeding: two of your horses and the stable's help; a horse is born in two days
  breed() {
    const g = this.game, T = this.T, mine = g.horses.list.filter((h) => h.alive && h.owner === 'player');
    if (mine.length < 2 || T.money < 25) { sfx.error(); return false; }
    T.money -= 25;
    this.foals.push({ at: g.time + 2, coat: mine[Math.floor(Math.random() * 2)].coat });
    g.hud.toast(t('fr.bred'), 'pick');
    return true;
  }
  foalCheck() {
    const g = this.game, st = this.T.village.buildings.find((b) => b.type === 'stable');
    for (const f of this.foals.slice()) if (f.at <= g.time && st && st.hitch) {
      g.horses.add(st.hitch.x, st.hitch.y, st.hitch.z, 'player', null, f.coat);
      this.foals = this.foals.filter((x) => x !== f);
      g.hud.bigMessage(t('fr.foalTitle'), t('fr.foalSub'));
    }
  }

  // ---- the two story quests ---------------------------------------------------------------------
  // Clara Whitmore, the mansion family's grown daughter, went missing; the
  // smugglers at the ghost town hold her. The well: someone fouled it to drive
  // folk off their land cheap; the smugglers' ledger names Silas Crane.
  updateQuests() {
    const g = this.game, T = this.T, H = T.hidden, P = g.player.pos, day = this.day(), F = T.folk;
    const ghost = H.place('ghost');
    if (this.q.clara === 'none' && day >= 1 && ghost) { this.q.clara = 'missing'; g.hud.bigMessage(t('q.claraTitle'), t('q.claraStart')); }
    if (this.q.well === 'none' && day >= 3 && ghost) { this.q.well = 'foul'; g.hud.bigMessage(t('q.wellTitle'), t('q.wellStart')); }
    if (this.q.well === 'foul' && H.notes.includes('note.ghost')) { this.q.well = 'silas'; g.hud.toast(t('q.wellClue')); }
    // Clara at the ghost town: two kidnappers with her
    if (this.q.clara === 'missing' && ghost && Math.hypot(ghost.x - P.x, ghost.z - P.z) < 60 && !this.claraMen) {
      const bld = ghost.buildings[1], at = { x: (bld.x0 + bld.x1) / 2 + 0.5, y: ghost.y, z: (bld.z0 + bld.z1) / 2 + 0.5 };
      const clara = this.man('Clara Whitmore', 8130, { shirt: 0x8a6a8a, trousers: 0x5a3a5a, dress: 0x6a4a6a, long: true, hat: 'none', hair: 0x7a4a2a }, at, { female: true, clara: true, money: 0, brave: 0.2 });
      clara.ai = (o, dt) => this.claraAi(o, dt);
      F.extra.push(clara); this.people.clara = clara;
      this.claraMen = [0, 1].map((k) => { const m = this.rivalMan('crane', k + 10, { x: at.x + 4 + k * 2, y: at.y, z: at.z - 6 }); m.goal = { x: at.x + 3, y: at.y, z: at.z - 4 }; return m; });
    }
    const C = this.people.clara;
    if (C) {
      if (!C.alive) { this.q.clara = 'failed'; g.hud.alert(t('q.claraDied')); F.extra = F.extra.filter((x) => x !== C); F.dropRig(C); delete this.people.clara; }
      else if (this.q.clara === 'missing' && this.claraMen && !this.claraMen.some((m) => m.alive && !m.away && !(m.surrendered > 0))) { this.q.clara = 'free'; F.say(C, 'say.claraThanks', null, 'ok'); g.hud.toast(t('q.claraFree')); }
      else if (this.q.clara === 'free') {
        const home = T.village.buildings.find((b) => b.type === 'house' && b.status === 'mansion');
        if (home && Math.hypot(home.door.x - C.pos.x, home.door.z - C.pos.z) < 8) {
          this.q.clara = 'done'; T.money += 300; T.addHonor(15); T.trades.rep('farmers', 10); T.trades.rep('merchants', 10);
          g.hud.bigMessage(t('q.claraDone'), t('q.claraDoneSub', { n: 300 }));
          C.home = home; C.free = true;
          setTimeout(() => { F.dropRig(C); F.extra = F.extra.filter((x) => x !== C); delete this.people.clara; }, 8000);
        }
      }
    }
    // Silas, once handed to the sheriff
    const S = this.people.silas;
    if (S && this.q.well === 'silas' && S.away && S.bounty && S.bounty.status === 'claimed') this.wellDone('law');
  }
  claraAi(v, dt) {
    const g = this.game, F = this.T.folk, P = g.player.pos;
    if (!v.alive) return true;
    if (this.q.clara !== 'free' || v.free) { v.speed = 0; v.crouch = this.q.clara === 'missing'; return true; }
    v.crouch = false;
    const d = Math.hypot(P.x - v.pos.x, P.z - v.pos.z);
    if (d > 40 && !F.visible(v)) { const a = Math.random() * 6.28, gy = F.ground(P.x + Math.cos(a) * 3, P.z + Math.sin(a) * 3, P.y + 2); if (gy != null) v.pos.set(P.x + Math.cos(a) * 3, gy, P.z + Math.sin(a) * 3); }
    if (d > 2.5) F.goDirect(v, P, d > 8 ? 6.2 : 3.4, dt, 2); else { v.speed = 0; v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z)); }
    return true;
  }
  // confronting Silas: hand him to the sheriff, or take his money to keep quiet
  confront(how) {
    const g = this.game, T = this.T, S = this.people.silas;
    if (!S || this.q.well !== 'silas') return;
    if (how === 'law') {
      S.outlaw = true; S.cuffed = true; S.surrendered = 999; S.guns = [];
      S.bounty = { id: -1, name: S.name, reward: 140, status: 'open', v: S };
      S.ai = (o, dt, d) => T.trades.outlawAi(o, dt, d);
      T.folk.say(S, 'say.silasCaught', null, 'warn');
      g.hud.toast(t('q.silasWalk'));
    } else {
      T.money += 250; T.trades.rep('outlaws', 10); T.addHonor(-5);
      T.folk.say(S, 'say.silasPays', null, 'warn');
      this.wellDone('money');
    }
  }
  wellDone(how) {
    const g = this.game, T = this.T;
    this.q.well = 'done';
    if (how === 'law') { T.money += 100; T.addHonor(15); T.trades.rep('farmers', 10); g.hud.bigMessage(t('q.wellDone'), t('q.wellDoneLaw', { n: 100 })); }
    else g.hud.bigMessage(t('q.wellDone'), t('q.wellDoneMoney', { n: 250 }));
  }

  // ---- clothes ---------------------------------------------------------------------------------
  applyLook() {
    const L = Object.assign({ shirt: 0xb8a888, trousers: 0x3e3a34, vest: 0x5a4632, hat: 'felt', hatColor: 0x4a3a2a, gunbelt: true }, this.look || {});
    civLook('player', L);
    const tp = this.game.thirdPerson; if (tp && tp.rig) { tp.drop(); }
  }
  buyLook(look) {
    const T = this.T;
    if (T.money < 10) { sfx.error(); return false; }
    T.money -= 10; this.look = Object.assign({}, this.look || {}, look); this.applyLook(); sfx.coins();
    return true;
  }

  // ---- the goals ladder -------------------------------------------------------------------------
  goalList() {
    const tr = this.T.trades.trade, out = GOALS.map((G) => ({ id: G.id, n: G.n, v: Math.min(G.n, G.val(this)), reward: G.reward, done: this.done.includes(G.id) }));
    const top = TOP_GOALS[tr];
    if (top) out.push({ id: 'top.' + tr, n: top.n, v: Math.min(top.n, top.val(this)), reward: top.reward, done: this.done.includes('top.' + tr), top: true });
    return out;
  }
  checkGoals() {
    const g = this.game, T = this.T;
    for (const G of this.goalList()) {
      if (G.done || G.v < G.n) continue;
      this.done.push(G.id);
      if (G.reward.coins) T.money += G.reward.coins;
      if (G.reward.honor) T.addHonor(G.reward.honor);
      g.hud.bigMessage(t(G.top ? 'goal.topDone' : 'goal.done'), t('goal.' + G.id) + ' · ' + this.rewardText(G.reward));
      sfx.done && sfx.done();
    }
  }
  rewardText(r) { return [r.coins ? t('goal.coins', { n: r.coins }) : '', r.honor ? t('goal.honor', { n: r.honor }) : ''].filter(Boolean).join(', '); }
  trophies() {
    const T = this.T, H = T.hidden;
    return [
      ['bear', this.st.bears], ['wolf', this.st.wolves], ['outlaws', T.st.bounties || 0], ['treasure', T.st.treasure || 0],
      ['places', H.seen.length], ['ribbons', this.st.ribbons], ['raids', this.st.raidsWon], ['camps', this.st.campsBroken || 0], ['coaches', this.st.coaches], ['drives', this.st.drives],
    ];
  }

  // ---- what you can do near the new people and places (the context buttons) -------------------------
  options(p) {
    const g = this.game, out = [], P = this.people, T = this.T;
    const near = (v, r = 3) => v && v.alive && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < r;
    if (near(P.teller, 3.6) && !(P.teller.surrendered > 0)) out.push({ a: 'bank', label: t('ctx.bank'), v: P.teller, run: () => g.app.openPanel('bank', {}) });
    if (near(P.barkeep, 3.6) && !(P.barkeep.surrendered > 0)) out.push({ a: 'saloon', label: t('ctx.saloon'), v: P.barkeep, run: () => g.app.openPanel('saloon', {}) });
    if (near(P.silas, 3) && this.q.well === 'silas' && !P.silas.cuffed) out.push({ a: 'silas', label: t('ctx.silas'), v: P.silas, run: () => g.app.openPanel('silas', {}) });
    if (near(P.judge, 3.6)) out.push({ a: 'fair', label: t('ctx.fair'), v: P.judge, run: () => g.app.openPanel('fair', {}) });
    if (near(P.clara, 2.5) && this.q.clara === 'free' && !P.clara.free) out.push({ a: 'clara', label: t('ctx.clara'), v: P.clara, run: () => g.hud.toast(t('q.claraFollow')) });
    // a shopkeeper with his hands up: take his shop
    const k = T.folk.nearest(p, 3, (x) => x.role === 'keeper' && x.surrendered > 0 && BIZ[x.shop] && !this.biz[x.shop]);
    if (k) out.push({ a: 'deed', label: t('ctx.deed'), v: k, run: () => this.stealBiz(k) });
    // anyone of a household with his hands up: take the family's house
    const o = !k && T.folk.nearest(p, 3, (x) => x.surrendered > 0 && x.home && x.home.type === 'house' && !this.stolen.includes(T.village.buildings.indexOf(x.home)));
    if (o) out.push({ a: 'house', label: t('ctx.stealHouse'), v: o, run: () => this.stealHouse(o) });
    // the stagecoach: rob it, or ride shotgun from the depot
    const st = this.coachNear(p, 7);
    if (st) {
      const C = this.coachX();
      if ((st.held && st.robbing) || st.wrecked) out.push({ a: 'coachbox', label: t('ctx.coachBox'), run: () => this.robCoach() });
      else if (!C.moving && C.dir > 0 && this.hour() < 9 && !this.coachJob && this.hour() > 6) out.push({ a: 'shotgun', label: t('ctx.shotgun'), run: () => { this.coachJob = { day: this.day() }; g.hud.toast(t('fr.shotgunTaken')); } });
    }
    // a burning field: douse it
    if (this.fire && g.has('bucket_water')) { const s = this.fire.spots.find((q) => q.on && Math.hypot(q.x - p.x, q.z - p.z) < 3.5); if (s) out.push({ a: 'douse', label: t('ctx.douse'), run: () => this.douse(s) }); }
    // your own horse beside you: give it a name
    if (!g.player.riding) { const h = g.horses.near(p, 2.6); if (h && h.owner === 'player') out.push({ a: 'namehorse', label: t('ctx.nameHorse'), run: () => g.app.openPanel('horsename', { h }) }); }
    return out;
  }
  // aimed actions: holding up the coach driver
  aimTarget(hit, eye, dir, gun) {
    const st = this.coach;
    if (!gun || !st || !st.mesh || st.held) return null;
    const R = this.route(), to = new THREE.Vector3(st.x - eye.x, st.y + 1.5 - eye.y, R.z - eye.z), along = to.dot(dir);
    if (along < 0 || along > 18) return null;
    if (to.clone().addScaledVector(dir, -along).length() > 1.6) return null;
    return { a: 'holdcoach', label: t('use.holdCoach'), run: () => this.holdUpCoach() };
  }

  // ---- per frame -------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game, T = this.T;
    // a new day: takings, the calendar
    if (this.hour() >= 6 && this.ev.day !== this.day()) this.dawn();
    if (this.ev.kind && this.ev.until <= g.time) this.endEvent();
    this.slowT -= dt;
    if (this.slowT <= 0) {
      this.slowT = 0.5;
      this.updatePeople();
      if (!this.raid && g.time > this.raidT && Object.keys(this.biz).length && this.hour() > 9 && this.hour() < 18 && !T.jailed) { this.raidT = g.time + 2.5 + Math.random() * 2.5; this.startRaid(); }
      this.updateRaid();
      this.updatePosse();
      this.updateCamps();
      this.updateWar();
      this.updateAmbush();
      this.updateHunters();
      this.updateRustlers();
      this.updateQuests();
      this.updatePosters();
      if (T.folk.extra.some((v) => v.away)) { for (const v of T.folk.extra) if (v.away) T.folk.dropRig(v); T.folk.extra = T.folk.extra.filter((v) => !v.away); }
    }
    this.updateCoach(dt);
    this.updateFire(dt);
    this.updateCold(dt);
    this.updateContest(dt);
    this.updateDrive(dt);
    if ((this.goalT -= dt) <= 0) { this.goalT = 2; this.checkGoals(); }
  }
  mapMarks() {
    const out = [], R = this.route(), C = this.coach;
    if (C && C.x != null) out.push({ x: C.x, z: R.z, kind: 'coach', label: t('tmap.coach') });
    out.push({ x: R.x1, z: R.z, kind: 'station', label: t('tmap.station') });
    for (const c of this.camps || []) if (c.seen || this.T.trades.trade === 'outlaw') out.push({ x: c.x, z: c.z, kind: c.beaten > this.game.time - 6 ? 'place' : 'raid', label: t('fr.camp', { gang: t('fr.gangs.' + c.gang) }) });
    if (this.war) out.push({ x: this.war.men[0].pos.x, z: this.war.men[0].pos.z, kind: 'raid', label: t('tmap.war') });
    for (const i of this.stolen) { const b = this.T.village.buildings[i]; if (b) out.push({ x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2, kind: 'quest', label: t('tmap.stolen') }); }
    if (this.raid) out.push({ x: this.raid.b.door.x, z: this.raid.b.door.z, kind: 'raid', label: t('tmap.raid') });
    if (this.fire) out.push({ x: this.fire.spots[0].x, z: this.fire.spots[0].z, kind: 'fire', label: t('tmap.fire') });
    if (this.people.clara && this.q.clara !== 'done') out.push({ x: this.people.clara.pos.x, z: this.people.clara.pos.z, kind: 'quest', label: 'Clara' });
    return out;
  }
  hudText() {
    const C = this.contest;
    if (C && C.kind === 'shoot') return t('fr.shootHud', { s: Math.ceil(C.t), n: C.hits });
    if (C && C.kind === 'race') return t(C.turned ? 'fr.raceHudBack' : 'fr.raceHud', { s: Math.round(C.t) });
    if (this.coachJob) return t('fr.shotgunHud');
    if (this.drive) return t('fr.driveHud', { n: this.drive.herd.members.filter((a) => a.state !== 'dead').length });
    return '';
  }
  toSave() {
    return {
      done: this.done, bank: this.bank, biz: this.biz, st: this.st, q: this.q, look: this.look, hands: this.hands, ev: this.ev, foals: this.foals,
      roadOk: this.roadOk, bridges: this.bridges, raidT: this.raidT, hunterT: this.hunterT, camps: this.camps && this.camps.map(({ gang, x, y, z, beaten, seen }) => ({ gang, x, y, z, beaten, seen })), warT: this.warT, ambushT: this.ambushT, rustleNight: this.rustleNight, stolen: this.stolen,
    };
  }
  dispose() {
    const g = this.game;
    if (this.coach && this.coach.mesh) g.scene.remove(this.coach.mesh);
    if (this.coach) this.coachHorses(this.coach, false);
    if (this.posters) g.scene.remove(this.posters);
    if (this.fire) g.scene.remove(this.fire.grp);
    if (this.contest) g.scene.remove(this.contest.grp || this.contest.flag);
  }
}
