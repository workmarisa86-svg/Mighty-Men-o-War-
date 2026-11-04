// Town Life (2.5): rival outlaws come after an Outlaw.
//
// A stick-up: three men of a rival gang walk up with their guns out and want
// your money. Nothing on screen asks you what to do. Stand your ground and
// don't shoot, and after a few seconds they take the coins you carry and
// go. Shoot (or let your gang shoot), or run, and it is a fight. If they
// kill you, they take everything you carry. Townsfolk who think well of you
// come running, and they join in once shots are fired.
//
// Your house: now and then a gang comes for it. They cannot break walls or
// windows. If the door is shut they blow it (only the door) with dynamite,
// walk in, empty half of each of your chests and leave. If you are there,
// they fight you. Far away, you only hear about it afterwards. Kill them on
// the way out and their pockets hold what they took.
import { B } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { ITEMS } from './items.js';
import { RIVALS } from './frontier.js';

const DOORS = new Set([B.DOOR, B.DOOR_OPEN, B.HDOOR]);
const GIVE_UP_S = 8;            // standing still this long hands over your money
const RUN_M = 16;               // backing off further than this from them is running

export class Robbers {
  constructor(town, saved = {}) {
    this.T = town; this.game = town.game;
    const g = this.game, r = Math.random;
    this.holdT = saved.holdT ?? g.time + 0.8 + r() * 0.8;
    this.raidT = saved.raidT ?? g.time + 1.5 + r() * 1.5;
    this.hold = null; this.raid = null; this.tick = 0;
  }
  outlaw() { return this.T.trades.trade === 'outlaw'; }

  update(dt) {
    const g = this.game, T = this.T;
    if (this.lostAll && !g.overlay) this.report();
    if (this.hold) this.updateHold(dt);
    if (this.raid) this.updateRaid(dt);
    this.tick -= dt;
    if (this.tick > 0) return;
    this.tick = 2;
    if (!this.outlaw() || T.jailed || g.dead || g.dying || T.posse || g.overlay || this.hold || this.raid) return;
    const F = T.frontier;
    if (F && (F.ambush || F.raid || F.war)) return;
    const site = this.home(), P = g.player.pos;
    const atHome = site && Math.hypot(P.x - (site.x + 0.5), P.z - (site.z + 0.5)) < site.r + 2;
    if (g.time > this.raidT) { this.raidT = g.time + 2 + Math.random() * 1.5; this.startRaid(); return; }
    if (g.time > this.holdT && !atHome) {
      const V = T.village;
      if (Math.hypot(P.x - V.cx, P.z - V.cz) < 45) return;     // (not in the middle of town)
      this.holdT = g.time + 1 + Math.random(); this.startHold();
    }
  }

  // ---- the stick-up ----------------------------------------------------------------------
  men(gang, n, from, baseK) {
    const Fr = this.T.frontier, F = this.T.folk, out = [];
    for (let k = 0; k < n; k++) {
      const v = Fr.rivalMan(gang, baseK + k, { x: from.x + (k - 1) * 2, y: from.y, z: from.z + (k % 2) * 2 });
      v.fight = null; v.robber = true; v.cool = 0;
      F.armed(v, F.bestGun(v));                                  // guns out, but not firing yet
      out.push(v);
    }
    return out;
  }
  startHold() {
    const g = this.game, P = g.player.pos, a = Math.random() * Math.PI * 2;
    const gang = RIVALS[Math.floor(Math.random() * RIVALS.length)];
    const men = this.men(gang, 3, { x: P.x + Math.cos(a) * 40, y: P.y, z: P.z + Math.sin(a) * 40 }, 60);
    this.hold = { gang, men, phase: 'come', t: 0, a };
    for (const [k, v] of men.entries()) { v.slot = k; v.ai = (o, dt, d) => this.holdAi(o, dt, d); v.onHurt = () => this.toFight(); }
    g.hud.toast(t('rob.coming', { gang: t('fr.gangs.' + gang) }));
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
    const ang = H.a + (v.slot - 1) * 0.7, spot = { x: P.x + Math.cos(ang) * 4.5, y: P.y, z: P.z + Math.sin(ang) * 4.5 };
    if (Math.hypot(spot.x - v.pos.x, spot.z - v.pos.z) > 1.2) F.goDirect(v, spot, d > 14 ? 5.5 : 3.2, dt, 1); else v.speed = 0;
    v.crouch = false;
    if (d < 14) v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z));
    return true;
  }
  updateHold(dt) {
    const g = this.game, T = this.T, F = T.folk, H = this.hold, P = g.player.pos;
    const up = H.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!up.length) {
      if (H.phase === 'fight') { T.trades.rep('outlaws', 4); T.frontier.st.rivalsBeaten++; g.hud.bigMessage(t('rob.beaten'), t('rob.beatenSub', { gang: t('fr.gangs.' + H.gang) })); }
      this.hold = null; return;
    }
    H.t += dt;
    const lead = up[0], d = Math.hypot(lead.pos.x - P.x, lead.pos.z - P.z);
    if (H.phase === 'come') {
      if (d < 7) { H.phase = 'demand'; H.t = 0; F.say(lead, 'rob.handsUp', null, 'warn'); sfx.alert(); this.callHelp(); }
      else if (H.t > 50) this.leave();                             // lost you
    } else if (H.phase === 'demand') {
      if (d > RUN_M) { this.toFight(); return; }                  // running off: they open up on you
      if (H.t > GIVE_UP_S / 2 && !H.warned) { H.warned = true; F.say(lead, 'rob.last', null, 'warn'); }
      if (H.t > GIVE_UP_S) {
        // you stood still and let them: your money goes into his pocket
        const n = T.money; T.money = 0; lead.money += n;
        F.say(lead, 'rob.thanks');
        g.hud.alert(t('rob.took', { n, gang: t('fr.gangs.' + H.gang) })); sfx.coins();
        this.leave();
      }
    } else if (H.phase === 'fight') {
      this.callHelp();
      if (g.time > H.until) this.leave();
    } else if (H.phase === 'leave') {
      if (up.every((m) => Math.hypot(m.pos.x - P.x, m.pos.z - P.z) > 100)) { for (const m of up) { F.dropRig(m); m.away = true; m.alive = false; } this.hold = null; }
    }
  }
  leave() {
    const H = this.hold, P = this.game.player.pos;
    H.phase = 'leave';
    for (const m of H.men) { m.exit = { x: P.x + Math.cos(H.a) * 120, y: m.pos.y, z: P.z + Math.sin(H.a) * 120 }; m.route = []; m.fight = null; m.ai = (o, dt, d) => this.holdAi(o, dt, d); }
  }
  // a shot, a wound, running off: it's a fight now
  toFight() {
    const g = this.game, F = this.T.folk, H = this.hold;
    if (!H || H.phase === 'fight') return;
    H.phase = 'fight'; H.until = g.time + 0.1;
    for (const m of H.men) {
      if (!m.alive) continue;
      m.provoked = true; m.fight = { armed: F.bestGun(m) }; F.armed(m, m.fight.armed); m.cool = 0.3 + Math.random() * 0.6;
      m.ai = (o, dt, d) => this.T.frontier.rivalAi(o, dt, d);
    }
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
  // killed by them (in a stick-up or at your house): they take everything you carry
  playerDied() {
    const g = this.game, T = this.T;
    const H = this.hold || (this.raid && this.raid.phase === 'fight' ? this.raid : null);
    if (!H || !H.men) return;
    const lead = H.men.find((m) => m.alive) || H.men[0];
    const n = T.money; T.money = 0; lead.money += n;
    for (const id of Object.keys(g.inv.counts)) {
      if (!g.inv.counts[id] || (ITEMS[id] && ITEMS[id].gear)) continue;
      if (lead.goods.length < 60) for (let k = 0; k < Math.min(5, g.inv.counts[id]); k++) lead.goods.push(id);
      g.inv.counts[id] = 0;
    }
    g.hud.dirtyHotbar = true;
    this.lostAll = { n, gang: H.gang };
    if (this.hold) this.leave(); else this.raidLeave();
  }
  // after the hospital: what they took
  report() {
    if (!this.lostAll) return;
    this.game.hud.bigMessage(t('rob.lostAll'), t('rob.lostAllSub', { gang: t('fr.gangs.' + this.lostAll.gang), n: this.lostAll.n }));
    this.lostAll = null;
  }
  // townsfolk who like you and see the stick-up come to help (they shoot once it's a fight)
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

  // ---- your house -------------------------------------------------------------------------
  home() { const c = this.game.cabin; return c && c.site ? c.site : null; }
  doorCells(site) {
    const w = this.game.world, R = Math.ceil(site.r) + 2, out = [];
    for (let y = site.y - 1; y <= site.y + 3; y++) for (let z = site.z - R; z <= site.z + R; z++) for (let x = site.x - R; x <= site.x + R; x++) if (DOORS.has(w.get(x, y, z))) out.push({ x, y, z });
    return out;
  }
  // what is in your chests at home: the house chest and any you placed in it
  homeStores(site) {
    const T = this.T, out = [this.game.cabin.chest];
    for (const [k, c] of Object.entries(T.chests || {})) {
      const [x, , z] = k.split(',').map(Number);
      if (Math.abs(x + 0.5 - (site.x + 0.5)) <= site.r + 2 && Math.abs(z + 0.5 - (site.z + 0.5)) <= site.r + 2) out.push(c);
    }
    return out;
  }
  // half of each stack (at least one) goes into their saddlebags
  lootHome(site, lead) {
    const got = {};
    for (const s of this.homeStores(site)) for (const [id, n] of Object.entries(s.counts)) {
      if (!n) continue;
      const k = Math.max(1, Math.floor(n / 2));
      s.counts[id] = n - k; if (!s.counts[id]) delete s.counts[id];
      got[id] = (got[id] || 0) + k;
      if (lead) for (let q = 0; q < Math.min(k, 6) && lead.goods.length < 60; q++) lead.goods.push(id);
    }
    return got;
  }
  blowDoors(cells) {
    const g = this.game, w = g.world;
    let any = false;
    for (const c of cells) if (DOORS.has(w.get(c.x, c.y, c.z))) { w.set(c.x, c.y, c.z, B.AIR); w.locked[w.idx(c.x, c.y, c.z)] = 0; any = true; }
    if (!any || !cells.length) return;
    const c = cells[0], P = g.player.pos;
    this.T.boom(c.x + 0.5, c.y + 0.5, c.z + 0.5);
    const d = Math.hypot(P.x - c.x - 0.5, P.y + 1 - c.y, P.z - c.z - 0.5);
    if (d < 3.5) g.damage(Math.round(35 * (1 - d / 3.5)), 'blast');
  }
  startRaid() {
    const g = this.game, site = this.home(), P = g.player.pos;
    if (!site) return;
    const gang = RIVALS[Math.floor(Math.random() * RIVALS.length)];
    const cells = this.doorCells(site), far = Math.hypot(P.x - site.x, P.z - site.z) > 120;
    if (far) {
      // you are far off: you only hear about it later
      this.raid = { gang, far: true, at: g.time + 0.05, cells };
      return;
    }
    const a = Math.random() * Math.PI * 2;
    const men = this.men(gang, 3, { x: site.x + Math.cos(a) * 50, y: site.y, z: site.z + Math.sin(a) * 50 }, 70);
    const door = cells.length ? cells.reduce((m, c) => (c.y < m.y ? c : m)) : null;
    // just outside the door (away from the middle of the house)
    let out = null;
    const dw = door ? { x: door.x + 0.5, y: door.y, z: door.z + 0.5 } : site.door ? { ...site.door } : null;      // (the cottage has an open doorway)
    if (dw) {
      const dx = dw.x - (site.x + 0.5), dz = dw.z - (site.z + 0.5);
      out = Math.abs(dx) > Math.abs(dz) ? { x: dw.x + Math.sign(dx) * 1.6, y: dw.y, z: dw.z } : { x: dw.x, y: dw.y, z: dw.z + Math.sign(dz) * 1.6 };
    }
    this.raid = { gang, men, phase: 'go', t: 0, a, cells, door, out, site };
    for (const [k, v] of men.entries()) { v.slot = k; v.ai = (o, dt, d) => this.raidAi(o, dt, d); v.onHurt = () => this.raidFight(); }
    g.hud.alert(t('rob.raidComing', { gang: t('fr.gangs.' + gang) })); sfx.alert();
  }
  raidAi(v, dt, d) {
    const g = this.game, F = this.T.folk, R = this.raid;
    if (!v.alive) return true;
    if (v.surrendered > 0) return false;
    if (!R) { v.away = true; v.alive = false; F.dropRig(v); return true; }
    if (R.phase === 'fight') return this.T.frontier.rivalAi(v, dt, d);
    let goal;
    if (R.phase === 'leave') goal = v.exit;
    else if (R.phase === 'go' || R.phase === 'blast') goal = R.out ? { x: R.out.x + (v.slot - 1) * 1.6, y: R.out.y, z: R.out.z } : { x: R.site.x + 0.5, y: R.site.y, z: R.site.z + 0.5 };
    else goal = { x: R.site.chest.x + 0.5 + (v.slot - 1) * 0.8, y: R.site.chest.y, z: R.site.chest.z + 0.5 };
    const gd = Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z);
    if (gd > 1.2) {
      const before = v.pos.clone();
      F.goDirect(v, goal, R.phase === 'leave' ? 5.5 : 4.4, dt, 1);
      // stuck in the house (doors, furniture): out of sight they squeeze through
      v.stuckR = v.pos.distanceTo(before) < dt * 0.4 ? (v.stuckR || 0) + dt : 0;
      if (v.stuckR > 6 && !F.visible(v) && R.phase !== 'go') { v.pos.set(goal.x, goal.y, goal.z); v.stuckR = 0; }
    } else v.speed = 0;
    if (R.phase === 'leave' && d > 110) { F.dropRig(v); v.away = true; v.alive = false; }
    return true;
  }
  updateRaid(dt) {
    const g = this.game, T = this.T, F = T.folk, R = this.raid, P = g.player.pos, w = g.world;
    if (R.far) {
      if (g.time < R.at) return;
      // off-screen: the door blown, half of every chest gone
      const site = this.home();
      this.raid = null;
      if (!site) return;
      for (const c of R.cells) if (DOORS.has(w.get(c.x, c.y, c.z))) w.set(c.x, c.y, c.z, B.AIR);
      const got = this.lootHome(site, null);
      g.hud.bigMessage(t('rob.raidedTitle'), t('rob.raidedSub', { gang: t('fr.gangs.' + R.gang), list: this.list(got) }));
      return;
    }
    const up = R.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
    if (!up.length) {
      if (R.phase === 'fight') { T.trades.rep('outlaws', 4); T.frontier.st.rivalsBeaten++; g.hud.bigMessage(t('rob.beaten'), t('rob.raidBeatenSub', { gang: t('fr.gangs.' + R.gang) })); }
      this.raid = null; return;
    }
    R.t += dt;
    const lead = up[0];
    // you are there: they come for you
    if (R.phase !== 'fight' && R.phase !== 'leave' && up.some((m) => Math.hypot(m.pos.x - P.x, m.pos.z - P.z) < 18 && Math.abs(m.pos.y - P.y) < 4)) { this.raidFight(); return; }
    if (R.phase === 'go') {
      if (!R.out || Math.hypot(lead.pos.x - R.out.x, lead.pos.z - R.out.z) < 2.2 || R.t > 90) {
        const shut = R.cells.some((c) => B.DOOR === w.get(c.x, c.y, c.z) || B.HDOOR === w.get(c.x, c.y, c.z));
        if (shut) { R.phase = 'blast'; R.t = 0; F.say(lead, 'rob.dynamite', null, 'warn'); sfx.leather(); }
        else { R.phase = 'enter'; R.t = 0; }
      }
    } else if (R.phase === 'blast') {
      if (R.t > 4) { this.blowDoors(R.cells); R.phase = 'enter'; R.t = 0; }
    } else if (R.phase === 'enter') {
      const ch = R.site.chest;
      if (Math.hypot(lead.pos.x - ch.x - 0.5, lead.pos.z - ch.z - 0.5) < 2.5 || R.t > 40) {
        const got = this.lootHome(R.site, lead);
        g.hud.alert(t('rob.looted', { gang: t('fr.gangs.' + R.gang), list: this.list(got) }));
        this.raidLeave();
      }
    } else if (R.phase === 'fight') {
      this.callHelp();
      if (g.time > R.until) this.raidLeave();
    } else if (R.phase === 'leave') {
      if (up.every((m) => Math.hypot(m.pos.x - P.x, m.pos.z - P.z) > 100)) { for (const m of up) { F.dropRig(m); m.away = true; m.alive = false; } this.raid = null; }
    }
  }
  raidLeave() {
    const R = this.raid;
    R.phase = 'leave';
    for (const m of R.men) { m.fight = null; m.route = []; m.ai = (o, dt, d) => this.raidAi(o, dt, d); m.exit = { x: R.site.x + Math.cos(R.a) * 120, y: m.pos.y, z: R.site.z + Math.sin(R.a) * 120 }; }
  }
  raidFight() {
    const g = this.game, F = this.T.folk, R = this.raid;
    if (!R || !R.men || R.phase === 'fight') return;
    R.phase = 'fight'; R.until = g.time + 0.1;
    for (const m of R.men) {
      if (!m.alive) continue;
      m.provoked = true; m.fight = { armed: F.bestGun(m) }; F.armed(m, m.fight.armed); m.cool = 0.4 + Math.random() * 0.6;
      m.ai = (o, dt, d) => this.T.frontier.rivalAi(o, dt, d);
    }
    g.hud.alert(t('rob.raidFight', { gang: t('fr.gangs.' + R.gang) })); sfx.alert();
    this.callHelp();
  }
  list(got) {
    const e = Object.entries(got);
    return e.length ? e.map(([id, n]) => `${n} ${t('item.' + id)}`).join(', ') : t('rob.nothing');
  }
  toSave() { return { holdT: this.holdT, raidT: this.raidT }; }
}
