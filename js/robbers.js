// Town Life (2.5, 2.6): outlaws come after you, whatever your trade (an
// Outlaw most often). The richer you are and the bigger your gang's name,
// the sooner they come, and in the end two gangs team up against you.
// There is no warning: watch the radar for red dots.
//
// A stick-up: they walk up with their guns out and want your money.
// Nothing on screen asks you what to do. Stand your ground and don't shoot,
// and after a few seconds they take the coins you carry and go. Shoot (or
// let your gang shoot), or run, and it is a fight. If they kill you, they
// take everything you carry. Townsfolk who think well of you come running,
// and they join in once shots are fired.
//
// Your house: they come for your chests. They cannot break walls, windows or
// the ground, only doors: each shut door between them and a chest is blown
// with dynamite (the only warning you get: a door going up), so a bunker
// under the house behind several doors takes them a long time. They take
// half of each chest they reach. If you are there, they fight you.
//
// Whatever they take goes in the leader's saddlebag: kill him and search
// the body. If they get away, it goes to their gang's camp: break the camp
// to take it back (frontier.js).
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { ITEMS } from './items.js';
import { RIVALS } from './frontier.js';

const DOORS = new Set([B.DOOR, B.DOOR_OPEN, B.HDOOR]);
const SHUT = new Set([B.DOOR, B.HDOOR]);
const GIVE_UP_S = 8;            // standing still this long hands over your money
const RUN_M = 16;               // backing off further than this from them is running
const FUSE = 4;                 // seconds from the fuse to a door going up

export class Robbers {
  constructor(town, saved = {}) {
    this.T = town; this.game = town.game;
    const g = this.game, r = Math.random;
    this.holdT = saved.holdT ?? g.time + 0.8 + r() * 0.8;
    this.raidT = saved.raidT ?? g.time + 1.5 + r() * 1.5;
    this.hold = null; this.raid = null; this.tick = 0;
  }
  outlaw() { return this.T.trades.trade === 'outlaw'; }
  // how much you tempt them: your trade, your money (pocket and bank), your gang's name
  heat() {
    const T = this.T, bank = T.frontier && T.frontier.bank ? T.frontier.bank.balance : 0;
    const rich = Math.min(2, (T.money + bank) / 1500), name = Math.min(1.5, Math.max(0, T.trades.reps.outlaws || 0) / 40);
    return (this.outlaw() ? 1 : 0.6) * (1 + rich + name);
  }
  // one gang, or two teaming up when you are a big enough prize
  pickGangs() {
    const i = Math.floor(Math.random() * RIVALS.length), a = RIVALS[i];
    const two = this.heat() > 1.9 && Math.random() < Math.min(0.85, (this.heat() - 1.6) / 1.5);
    return two ? [a, RIVALS[(i + 1 + Math.floor(Math.random() * (RIVALS.length - 1))) % RIVALS.length]] : [a];
  }
  gangName(H) { return H.gangs.map((gg) => t('fr.gangs.' + gg)).join(' + '); }

  update(dt) {
    const g = this.game, T = this.T;
    if (this.lostAll && !g.overlay) this.report();
    if (this.hold) this.updateHold(dt);
    if (this.raid) this.updateRaid(dt);
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 2;
    if (T.jailed || g.dead || g.dying || T.posse || g.overlay || this.hold || this.raid) return;
    const F = T.frontier;
    if (F && (F.ambush || F.raid || F.war)) return;
    const site = this.home(), P = g.player.pos, k = 1 / this.heat();
    const atHome = site && Math.hypot(P.x - (site.x + 0.5), P.z - (site.z + 0.5)) < site.r + 2;
    if (g.time > this.raidT) { this.raidT = g.time + (2 + Math.random() * 1.5) * k; this.startRaid(); return; }
    if (g.time > this.holdT && !atHome) {
      const V = T.village;
      if (Math.hypot(P.x - V.cx, P.z - V.cz) < 45) return;     // (not in the middle of town)
      this.holdT = g.time + (1 + Math.random()) * k; this.startHold();
    }
  }

  // ---- their men ----------------------------------------------------------------------------
  men(gangs, n, from, baseK) {
    const Fr = this.T.frontier, F = this.T.folk, out = [];
    for (let k = 0; k < n; k++) {
      const gg = gangs[k % gangs.length];
      const v = Fr.rivalMan(gg, baseK + k, { x: from.x + (k % 3 - 1) * 2, y: from.y, z: from.z + Math.floor(k / 3) * 2 });
      v.rival = gangs[0];                                         // (partners for the day: they don't shoot each other)
      v.fight = null; v.robber = true; v.cool = 0; v.bag = {};
      F.armed(v, F.bestGun(v));                                   // guns out, but not firing yet
      out.push(v);
    }
    return out;
  }
  size(gangs) { return gangs.length > 1 ? 5 : 3 + (this.heat() > 1.6 ? 1 : 0); }
  // what they have taken so far (the leader carries it)
  took(H, coins, items = {}) {
    const k = H.took || (H.took = { coins: 0, items: {} });
    k.coins += coins;
    for (const [id, n] of Object.entries(items)) k.items[id] = (k.items[id] || 0) + n;
    const lead = H.men && H.men[0];
    if (lead) { lead.money += coins; for (const [id, n] of Object.entries(items)) lead.bag[id] = (lead.bag[id] || 0) + n; }
  }
  // they got away: the leader's saddlebag goes to their camp (kill him first and it's on his body)
  stash(H) {
    const lead = H.men && H.men[0];
    if (!H.took || (lead && !lead.alive)) return;
    const Fr = this.T.frontier, c = Fr && (Fr.camps || []).find((q) => q.gang === H.gangs[0]);
    if (!c) return;
    const S = c.stash || (c.stash = { coins: 0, items: {} });
    S.coins += H.took.coins;
    for (const [id, n] of Object.entries(H.took.items)) S.items[id] = (S.items[id] || 0) + n;
    if (H.took.coins || Object.keys(H.took.items).length) this.game.hud.toast(t('rob.toCamp', { gang: t('fr.gangs.' + H.gangs[0]) }));
  }
  gone(H) { const F = this.T.folk; for (const m of H.men) if (m.alive) { F.dropRig(m); m.away = true; m.alive = false; } }

  // ---- the stick-up -------------------------------------------------------------------------
  startHold() {
    const g = this.game, P = g.player.pos, a = Math.random() * Math.PI * 2, gangs = this.pickGangs();
    const men = this.men(gangs, this.size(gangs), { x: P.x + Math.cos(a) * 45, y: P.y, z: P.z + Math.sin(a) * 45 }, 60);
    this.hold = { gangs, men, phase: 'come', t: 0, a };
    for (const [k, v] of men.entries()) { v.slot = k; v.ai = (o, dt, d) => this.holdAi(o, dt, d); v.onHurt = () => this.toFight(); }
  }
  holdAi(v, dt, d) {
    const g = this.game, F = this.T.folk, H = this.hold, P = g.player.pos;
    if (!v.alive) return true;
    if (v.surrendered > 0) return false;
    if (!H) { v.away = true; v.alive = false; F.dropRig(v); return true; }
    if (H.phase === 'fight') return this.T.frontier.rivalAi(v, dt, d);
    if (H.phase === 'leave') {
      F.goDirect(v, v.exit, 5, dt, 2);
      if (d > 110) { F.dropRig(v); v.away = true; v.alive = false; }
      return true;
    }
    // walk up and stand round you, guns on you
    const n = H.men.length, ang = H.a + (v.slot - (n - 1) / 2) * 0.6, spot = { x: P.x + Math.cos(ang) * 4.5, y: P.y, z: P.z + Math.sin(ang) * 4.5 };
    if (Math.hypot(spot.x - v.pos.x, spot.z - v.pos.z) > 1.2) F.goDirect(v, spot, d > 14 ? 5.5 : 3.2, dt, 1); else v.speed = 0;
    v.crouch = false;
    if (d < 14) v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z));
    return true;
  }
  updateHold(dt) {
    const g = this.game, T = this.T, F = T.folk, H = this.hold, P = g.player.pos;
    const up = H.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!up.length) {
      if (H.phase === 'fight') { T.trades.rep('outlaws', 4); T.frontier.st.rivalsBeaten++; g.hud.bigMessage(t('rob.beaten'), t('rob.beatenSub', { gang: this.gangName(H) })); }
      this.hold = null; return;
    }
    H.t += dt;
    const lead = up[0], d = Math.hypot(lead.pos.x - P.x, lead.pos.z - P.z);
    if (H.phase === 'come') {
      if (d < 7) { H.phase = 'demand'; H.t = 0; F.say(lead, 'rob.handsUp', null, 'warn'); sfx.alert(); this.callHelp(); }
      else if (H.t > 60) this.leave();                             // lost you
    } else if (H.phase === 'demand') {
      if (d > RUN_M) { this.toFight(); return; }                  // running off: they open up on you
      if (H.t > GIVE_UP_S / 2 && !H.warned) { H.warned = true; F.say(lead, 'rob.last', null, 'warn'); }
      if (H.t > GIVE_UP_S) {
        // you stood still and let them: your money goes into the leader's pocket
        const n = T.money; T.money = 0; this.took(H, n);
        F.say(lead, 'rob.thanks');
        g.hud.alert(t('rob.took', { n, gang: this.gangName(H) })); sfx.coins();
        this.leave();
      }
    } else if (H.phase === 'fight') {
      this.callHelp();
      if (g.time > H.until) this.leave();
    } else if (H.phase === 'leave') {
      if (up.every((m) => Math.hypot(m.pos.x - P.x, m.pos.z - P.z) > 100)) { this.stash(H); this.gone(H); this.hold = null; }
    }
  }
  leave() {
    const H = this.hold, P = this.game.player.pos;
    H.phase = 'leave';
    for (const m of H.men) { m.exit = { x: P.x + Math.cos(H.a) * 120, y: m.pos.y, z: P.z + Math.sin(H.a) * 120 }; m.route = []; m.fight = null; m.ai = (o, dt, d) => this.holdAi(o, dt, d); }
  }
  // a shot, a wound, running off: it's a fight now
  arm(men) {
    const F = this.T.folk;
    for (const m of men) {
      if (!m.alive) continue;
      m.provoked = true; m.fight = { armed: F.bestGun(m) }; F.armed(m, m.fight.armed); m.cool = 0.3 + Math.random() * 0.6; m.path = null;
      m.ai = (o, dt, d) => this.T.frontier.rivalAi(o, dt, d);
    }
  }
  toFight() {
    const g = this.game, F = this.T.folk, H = this.hold;
    if (!H || H.phase === 'fight') return;
    H.phase = 'fight'; H.until = g.time + 0.1;
    this.arm(H.men);
    const lead = H.men.find((m) => m.alive);
    if (lead) F.say(lead, 'rob.draw', null, 'warn');
    sfx.alert();
    this.callHelp();
  }
  onShot() {
    const P = this.game.player.pos;
    if (this.hold && this.hold.phase !== 'leave') this.toFight();
    if (this.raid && this.raid.men && this.raid.men.some((m) => m.alive && Math.hypot(m.pos.x - P.x, m.pos.z - P.z) < 50)) this.raidFight();
  }
  // killed by them (a stick-up, or at your house): they take everything you carry
  playerDied() {
    const g = this.game, T = this.T;
    const H = this.hold || (this.raid && this.raid.men && this.raid.phase === 'fight' ? this.raid : null);
    if (!H || !H.men) return;
    const n = T.money; T.money = 0;
    const got = {};
    for (const id of Object.keys(g.inv.counts)) {
      if (!g.inv.counts[id] || (ITEMS[id] && ITEMS[id].gear)) continue;
      got[id] = g.inv.counts[id]; g.inv.counts[id] = 0;
    }
    g.hud.dirtyHotbar = true;
    this.took(H, n, got);
    this.lostAll = { n, gang: this.gangName(H) };
    if (this.hold) this.leave(); else this.raidLeave();
  }
  // after the hospital: what they took
  report() {
    if (!this.lostAll) return;
    this.game.hud.bigMessage(t('rob.lostAll'), t('rob.lostAllSub', { gang: this.lostAll.gang, n: this.lostAll.n }));
    this.lostAll = null;
  }
  // townsfolk who like you and see it come to help (they shoot once it's a fight)
  callHelp() {
    const g = this.game, T = this.T, F = T.folk, P = g.player.pos, H = this.hold || this.raid;
    if (!H || !H.men || T.posse) return;
    const foes = H.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!foes.length) return;
    const helping = F.list.filter((v) => v.huntMan && v.huntMan.alive).length;
    if (helping >= 3) return;
    const likes = (v) => T.honor >= 60 || (T.rapport[v.homeIdx] || 0) >= 2 || (v.role === 'sheriff' && T.bounty === 0);
    const cands = F.list.filter((v) => v.alive && !v.away && !v.female && !v.posse && !v.fight && !v.reportTo && !v.sleeping && !v.huntMan && !v.huntAnimal && !v.duel && !v.watching && !(v.surrendered > 0)
      && F.bestGun(v) && likes(v) && Math.hypot(v.pos.x - P.x, v.pos.z - P.z) < 45 && F.sees(v, 45))
      .sort((a, b) => a.pos.distanceTo(P) - b.pos.distanceTo(P)).slice(0, 3 - helping);
    for (const [k, v] of cands.entries()) { v.huntMan = foes[k % foes.length]; v.route = []; F.say(v, 'say.helpRob', null, 'warn'); }
  }

  // ---- your house ---------------------------------------------------------------------------
  home() { const c = this.game.cabin; return c && c.site ? c.site : null; }
  area(site) { const R = Math.ceil(site.r) + 8; return { x0: site.x - R, x1: site.x + R, z0: site.z - R, z1: site.z + R, y0: Math.max(2, site.y - 24), y1: site.y + 10 }; }
  // your chests at home: the house chest, and any you placed in or under the house
  chests(site) {
    const T = this.T, A = this.area(site), out = [{ at: { ...site.chest }, store: this.game.cabin.chest }];
    for (const [k, c] of Object.entries(T.chests || {})) {
      const [x, y, z] = k.split(',').map(Number);
      if (x >= A.x0 && x <= A.x1 && z >= A.z0 && z <= A.z1 && y >= A.y0 && y <= A.y1) out.push({ at: { x, y, z }, store: c });
    }
    return out;
  }
  // A way for a man from `from` to beside a chest: walking, climbing ladders,
  // through doors (each shut one has to be blown). Never through walls or ground.
  // Returns the cells to walk ({x, y, z} feet) or null.
  findWay(site, from, to) {
    const w = this.game.world, A = this.area(site);
    const W = A.x1 - A.x0 + 1, D = A.z1 - A.z0 + 1, H = A.y1 - A.y0 + 1;
    const inA = (x, y, z) => x >= A.x0 && x <= A.x1 && z >= A.z0 && z <= A.z1 && y >= A.y0 && y < A.y1;
    const idx = (x, y, z) => ((y - A.y0) * D + (z - A.z0)) * W + (x - A.x0);
    const free = (id) => !SOLID[id] || SHUT.has(id) || id === B.LADDER;          // (a shut door: free once blown)
    const body = (x, y, z) => { const a = w.get(x, y, z), b = w.get(x, y + 1, z); return free(a) && free(b) && a !== B.WATER; };
    const floor = (x, y, z) => { const u = w.get(x, y - 1, z); return (SOLID[u] && !SHUT.has(u)) || u === B.LADDER || w.get(x, y, z) === B.LADDER; };
    const stand = (x, y, z) => inA(x, y, z) && body(x, y, z) && floor(x, y, z);
    const sx = Math.floor(from.x), sz = Math.floor(from.z);
    let sy = Math.floor(from.y); for (let k = 0; k < 4 && !stand(sx, sy, sz); k++) sy++;
    if (!stand(sx, sy, sz)) return null;
    const goal = (x, y, z) => Math.abs(x - to.x) + Math.abs(z - to.z) <= 1 && Math.abs(y - to.y) <= 1;
    const prev = new Int32Array(W * D * H).fill(-2), q = [];
    prev[idx(sx, sy, sz)] = -1; q.push([sx, sy, sz]);
    let end = null;
    for (let qi = 0; qi < q.length && qi < 60000; qi++) {
      const [x, y, z] = q[qi];
      if (goal(x, y, z)) { end = [x, y, z]; break; }
      const nb = [];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (stand(nx, y, nz)) nb.push([nx, y, nz]);
        else if (stand(nx, y + 1, nz) && body(x, y + 1, z)) nb.push([nx, y + 1, nz]);                 // a step up
        else for (let dy = 1; dy <= 3; dy++) { if (!body(nx, y - dy + 1, nz)) break; if (stand(nx, y - dy, nz)) { nb.push([nx, y - dy, nz]); break; } }   // a drop
      }
      // ladders (and a hatch in the floor): straight up or down
      if (w.get(x, y, z) === B.LADDER || w.get(x, y - 1, z) === B.LADDER || SHUT.has(w.get(x, y - 1, z))) for (let dy = 1; dy <= 24; dy++) { const yy = y - dy; if (!inA(x, yy, z) || !free(w.get(x, yy, z))) break; if (stand(x, yy, z)) { nb.push([x, yy, z]); break; } }
      if (w.get(x, y, z) === B.LADDER || w.get(x, y + 1, z) === B.LADDER) for (let dy = 1; dy <= 24; dy++) { const yy = y + dy; if (!inA(x, yy, z) || !free(w.get(x, yy + 1, z))) break; if (stand(x, yy, z)) { nb.push([x, yy, z]); break; } }
      for (const [nx, ny, nz] of nb) { const i = idx(nx, ny, nz); if (prev[i] !== -2) continue; prev[i] = idx(x, y, z); q.push([nx, ny, nz]); }
    }
    if (!end) return null;
    const out = [];
    for (let i = idx(...end); i !== -1; i = prev[i]) { const x = i % W, r = (i - x) / W, z = r % D, y = (r - z) / D; out.push({ x: x + A.x0, y: y + A.y0, z: z + A.z0 }); }
    return out.reverse();
  }
  // the shut doors a man would meet going from cell a to cell b (a door is one or two blocks)
  doorsBetween(a, b) {
    const w = this.game.world, out = [];
    const cols = [[b.x, b.z]], ys = new Set([a.y, a.y + 1, b.y, b.y + 1, Math.min(a.y, b.y) - 1]);
    if (a.x === b.x && a.z === b.z) for (let y = Math.min(a.y, b.y) - 1; y <= Math.max(a.y, b.y) + 1; y++) ys.add(y);
    for (const [x, z] of cols) for (const y of ys) if (SHUT.has(w.get(x, y, z))) out.push({ x, y, z });
    return out;
  }
  blow(cells) {
    const g = this.game, w = g.world, T = this.T;
    let any = false;
    for (const c of cells) for (let dy = -1; dy <= 1; dy++) {        // (the whole door: both halves)
      const id = w.get(c.x, c.y + dy, c.z);
      if (DOORS.has(id)) { w.set(c.x, c.y + dy, c.z, B.AIR); w.locked[w.idx(c.x, c.y + dy, c.z)] = 0; any = true; }
    }
    if (!any) return false;
    const c = cells[0], P = g.player.pos;
    T.boom(c.x + 0.5, c.y + 0.5, c.z + 0.5);
    T.blastHurt(c.x + 0.5, c.y + 0.5, c.z + 0.5, 4.5, false);
    const d = Math.hypot(P.x - c.x - 0.5, P.y + 1 - c.y, P.z - c.z - 0.5);
    if (d < 3.5) g.damage(Math.round(35 * (1 - d / 3.5)), 'blast');
    g.hud.alert(t('rob.doorBlown')); sfx.alert();                  // the one warning you get
    return true;
  }
  // half of each stack (at least one)
  lootStore(store) {
    const got = {};
    for (const [id, n] of Object.entries(store.counts)) {
      if (!n) continue;
      const k = Math.max(1, Math.floor(n / 2));
      store.counts[id] = n - k; if (!store.counts[id]) delete store.counts[id];
      got[id] = k;
    }
    return got;
  }
  // where they start from: outside the house (a door cell's outside, or the yard)
  outside(site) {
    const cells = [];
    const w = this.game.world, R = Math.ceil(site.r) + 2;
    // (a front door: in the outer walls, not a hatch in the floor or a door inside)
    for (let y = site.y; y <= site.y + 3; y++) for (let z = site.z - R; z <= site.z + R; z++) for (let x = site.x - R; x <= site.x + R; x++) if (DOORS.has(w.get(x, y, z)) && Math.max(Math.abs(x - site.x), Math.abs(z - site.z)) >= Math.floor(site.r) - 1) cells.push({ x, y, z });
    const d = cells.length ? cells.reduce((m, c) => (c.y < m.y ? c : m)) : site.door ? { x: Math.floor(site.door.x), y: Math.floor(site.door.y), z: Math.floor(site.door.z) } : null;
    if (!d) return { x: site.x + 0.5, y: site.y, z: site.z + Math.ceil(site.r) + 3.5 };
    const dx = d.x + 0.5 - (site.x + 0.5), dz = d.z + 0.5 - (site.z + 0.5);
    return Math.abs(dx) > Math.abs(dz) ? { x: d.x + 0.5 + Math.sign(dx) * 2, y: d.y, z: d.z + 0.5 } : { x: d.x + 0.5, y: d.y, z: d.z + 0.5 + Math.sign(dz) * 2 };
  }
  startRaid() {
    const g = this.game, site = this.home(), P = g.player.pos;
    if (!site) return;
    const gangs = this.pickGangs();
    const far = Math.hypot(P.x - site.x, P.z - site.z) > 120;
    if (far) { this.raid = { gangs, far: true, at: g.time + 0.05 }; return; }      // you hear about it later
    const a = Math.random() * Math.PI * 2;
    const men = this.men(gangs, this.size(gangs), { x: site.x + Math.cos(a) * 60, y: site.y, z: site.z + Math.sin(a) * 60 }, 70);
    this.raid = { gangs, men, phase: 'go', t: 0, a, site, out: this.outside(site), todo: this.chests(site), path: null, pi: 0 };
    for (const [k, v] of men.entries()) { v.slot = k; v.ai = (o, dt, d) => this.raidAi(o, dt, d); v.onHurt = () => this.raidFight(); }
    // (no warning: they come quietly; the radar shows them)
  }
  // off-screen: what they would have done, door by door
  farRaid(R) {
    const site = this.home();
    if (!site) return;
    const out = this.outside(site), got = {};
    let blown = 0, from = out;
    for (const ch of this.chests(site)) {
      const way = this.findWay(site, from, ch.at);
      if (!way) continue;
      for (let i = 1; i < way.length; i++) { const ds = this.doorsBetween(way[i - 1], way[i]); if (ds.length) { for (const c of ds) for (let dy = -1; dy <= 1; dy++) if (DOORS.has(this.game.world.get(c.x, c.y + dy, c.z))) this.game.world.set(c.x, c.y + dy, c.z, B.AIR); blown++; } }
      for (const [id, n] of Object.entries(this.lootStore(ch.store))) got[id] = (got[id] || 0) + n;
      from = way[way.length - 1];
    }
    const H = { gangs: R.gangs, men: null };
    this.took(H, 0, got); this.stash(H);
    if (blown) this.game.hud.bigMessage(t('rob.raidedTitle'), t('rob.raidedSub', { gang: this.gangName(H), n: blown, list: this.list(got) }));
  }
  // walking a found way, cell by cell (the leader first, the others behind him)
  follow(v, dt, speed) {
    const R = this.raid, F = this.T.folk, way = R.path, k = Math.max(0, R.pi - v.slot * 2);
    const c = way[Math.min(k, way.length - 1)], tx = c.x + 0.5, tz = c.z + 0.5;
    const dx = tx - v.pos.x, dz = tz - v.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { const s = Math.min(d, speed * dt); v.pos.x += dx / d * s; v.pos.z += dz / d * s; v.yaw = Math.atan2(-dx, -dz); v.speed = speed; }
    else v.speed = 0;
    v.pos.y += (c.y - v.pos.y) * Math.min(1, dt * 8);
    v.route = []; void F;
    return d < 0.15;
  }
  raidAi(v, dt, d) {
    const F = this.T.folk, R = this.raid;
    if (!v.alive) return true;
    if (v.surrendered > 0) return false;
    if (!R) { v.away = true; v.alive = false; F.dropRig(v); return true; }
    if (R.phase === 'fight') return this.T.frontier.rivalAi(v, dt, d);
    if (R.phase === 'leave' && !R.path) {
      F.goDirect(v, v.exit, 5.5, dt, 2);
      if (d > 110) { F.dropRig(v); v.away = true; v.alive = false; }
      return true;
    }
    if (R.phase === 'go') {
      const goal = { x: R.out.x + (v.slot % 3 - 1) * 1.4, y: R.out.y, z: R.out.z + Math.floor(v.slot / 3) * 1.4 };
      if (Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z) > 1.2) F.goDirect(v, goal, 4.4, dt, 1); else v.speed = 0;
      return true;
    }
    if (R.path) { if (R.phase !== 'blast' && v === R.men[0]) { if (this.follow(v, dt, 3.2)) R.arrived = true; } else if (v !== R.men[0]) this.follow(v, dt, 3.2); else v.speed = 0; }
    return true;
  }
  updateRaid(dt) {
    const g = this.game, T = this.T, R = this.raid, P = g.player.pos;
    if (R.far) { if (g.time >= R.at) { this.raid = null; this.farRaid(R); } return; }
    const up = R.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!up.length) {
      if (R.phase === 'fight') { T.trades.rep('outlaws', 4); T.frontier.st.rivalsBeaten++; g.hud.bigMessage(t('rob.beaten'), t('rob.raidBeatenSub', { gang: this.gangName(R) })); }
      this.raid = null; return;
    }
    R.t += dt;
    const lead = R.men[0];
    if (!lead.alive || lead.away) { this.raidFight(); return; }
    // you are there: they come for you
    if (R.phase !== 'fight' && R.phase !== 'leave' && up.some((m) => Math.hypot(m.pos.x - P.x, m.pos.z - P.z) < 16 && Math.abs(m.pos.y - P.y) < 4)) { this.raidFight(); return; }
    if (R.phase === 'go') {
      if (Math.hypot(lead.pos.x - R.out.x, lead.pos.z - R.out.z) < 2.5 || R.t > 120) { lead.pos.set(R.out.x, R.out.y, R.out.z); this.nextChest(); }
    } else if (R.phase === 'walk') {
      // the next cell: a shut door in the way? light the fuse
      if (R.arrived) {
        R.arrived = false;
        if (R.pi >= R.path.length - 1) { this.lootHere(); return; }
        const ds = this.doorsBetween(R.path[R.pi], R.path[R.pi + 1]);
        if (ds.length) { R.phase = 'blast'; R.t = 0; R.doors = ds; this.T.folk.say(lead, 'rob.dynamite', null, 'warn'); sfx.leather(); }
        else R.pi++;
      }
    } else if (R.phase === 'blast') {
      if (R.t > FUSE) { this.blow(R.doors); R.phase = 'walk'; R.pi++; R.t = 0; }
    } else if (R.phase === 'fight') {
      this.callHelp();
      if (g.time > R.until) this.raidLeave();
    } else if (R.phase === 'leave') {
      if (R.path && R.arrived) { R.arrived = false; if (R.pi > 0) R.pi--; else R.path = null; }
      if (up.every((m) => Math.hypot(m.pos.x - P.x, m.pos.z - P.z) > 100)) { this.stash(R); this.gone(R); this.raid = null; }
    }
  }
  // on to the next chest they can reach (a way with nothing but doors in it)
  nextChest() {
    const R = this.raid, lead = R.men[0];
    while (R.todo.length) {
      const ch = R.todo.shift(), from = R.path ? R.path[R.path.length - 1] : { x: lead.pos.x, y: lead.pos.y, z: lead.pos.z };
      const way = this.findWay(R.site, from, ch.at);
      if (!way) continue;                                          // walled in: out of their reach
      R.path = way; R.pi = 0; R.target = ch; R.phase = 'walk'; R.arrived = false; R.t = 0;
      return;
    }
    this.raidLeave();
  }
  lootHere() {
    const R = this.raid, got = this.lootStore(R.target.store);
    this.took(R, 0, got);
    this.nextChest();
  }
  raidLeave() {
    const R = this.raid;
    R.phase = 'leave';
    // back out the way they came (if inside), then off
    if (R.path && R.pi > 0) { R.arrived = false; } else R.path = null;
    for (const m of R.men) { m.fight = null; m.route = []; m.ai = (o, dt, d) => this.raidAi(o, dt, d); m.exit = { x: R.site.x + Math.cos(R.a) * 120, y: m.pos.y, z: R.site.z + Math.sin(R.a) * 120 }; }
  }
  raidFight() {
    const g = this.game, R = this.raid;
    if (!R || !R.men || R.phase === 'fight') return;
    R.phase = 'fight'; R.until = g.time + 0.1; R.path = null;
    this.arm(R.men);
    this.callHelp();
  }
  list(got) {
    const e = Object.entries(got);
    return e.length ? e.map(([id, n]) => `${n} ${t('item.' + id)}`).join(', ') : t('rob.nothing');
  }
  toSave() { return { holdT: this.holdT, raidT: this.raidT }; }
}
