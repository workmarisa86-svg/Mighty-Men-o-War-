// Town Life: your trade, the town's opinion of you, and what each trade does.
//
// Trades. A new story starts with a choice of six: Farmer-Rancher, Hunter-
// Trapper, Bounty Hunter, Merchant, Drifter and Outlaw. Each one starts you
// with its own kit and coins, changes some prices or pay, and sets how the
// town's groups think of you. The sheriff changes your trade for a fee.
//
// Reputation. Four groups keep their own opinion of you, from -100 to 100:
// farmers (jobs and their pay), merchants (prices), the law (how big a
// bounty your crimes bring, the sheriff's fee) and outlaws (whether outlaws
// draw on you or let you be). Crimes, jobs, bounties and duels move them.
//
// Traps (anyone, a Hunter-Trapper's trade). Set a steel trap on the ground
// (hold it, aim at the ground, use it). A deer or a wolf that walks onto it
// is caught; while you are away a trap also catches now and then. Traps show
// on the map (gold when something is in them). Use a trap to take the catch
// (meat and a hide) or to pick it up. At most 6 traps.
//
// Bounties (anyone but an outlaw; a Bounty Hunter is paid half as much again).
// The sheriff keeps a bounty board: up to 3 wanted men, each holed up in a
// cabin out in the wild (marked on the map). Kill one and collect the reward
// from the sheriff; or make him give up (a hold-up, or beat him in a duel),
// put the handcuffs on him and he walks with you: bring him in alive for half
// as much again. An outlaw sees you coming and may draw first.
//
// The gang (Outlaw). Four men ride with you (five once the outlaws think
// highly of you). Give them orders with the same order wheel as in War
// (Q; on a phone, the Gang button): Follow me, Hold position, Defend, Spread
// out, Take cover, Distract. They shoot at whoever is fighting you. A man
// who falls is replaced the next day while the outlaws still think well of you.
//
// Only what is near you is simulated: outlaws only near their cabins, trap
// meshes only near the traps; the rest is a few numbers in the save.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { civLook } from './characters.js';
import { findPath } from './path.js';

export const TRADES = ['farmer', 'hunter', 'bounty', 'merchant', 'drifter', 'outlaw'];
export const GROUPS = ['farmers', 'merchants', 'law', 'outlaws'];
const START_REP = {
  farmer: { farmers: 20, merchants: 5 }, hunter: { farmers: 5, merchants: 10 }, bounty: { law: 25, outlaws: -25 },
  merchant: { merchants: 25, farmers: 5 }, drifter: {}, outlaw: { law: -30, outlaws: 30, farmers: -5 },
};
export const KIT = {
  farmer: [['seed_wheat', 6], ['seed_carrot', 4], ['bucket', 1]], hunter: [['knife', 1], ['trap', 3]],
  bounty: [['revolver', 1], ['handcuffs', 2]], merchant: [], drifter: [['revolver', 1]], outlaw: [['revolver', 1], ['dynamite', 1]],
};
export const COINS = { farmer: 5, hunter: 5, bounty: 10, merchant: 40, drifter: 20, outlaw: 10 };
export const CHANGE_FEE = 40;
const FARM_GOODS = new Set(['wheat', 'carrot', 'cabbage', 'egg', 'milk', 'bread']);
const HUNT_GOODS = new Set(['hide', 'bear_hide', 'wolf_hide', 'meat_raw', 'fish', 'big_fish']);
const MAX_TRAPS = 6, MAX_BOUNTIES = 3, OUTLAW_IN = 110, OUTLAW_OUT = 140, TRAP_SHOW = 90;
const OUT_FIRST = ['Jesse', 'Clay', 'Dutch', 'Cole', 'Jack', 'Ike', 'Hank', 'Wade', 'Curly', 'Deacon', 'Silas', 'Rufus'];
const OUT_LAST = ['Malone', 'Crane', 'Slade', 'Cutter', 'Rourke', 'Vance', 'Kincaid', 'Dalton', 'Reno', 'Blackwood', 'Tate', 'Garrity'];

export class Trades {
  constructor(town, saved = {}) {
    this.town = town; this.game = town.game;
    this.trade = saved.trade || null;
    this.reps = Object.assign({ farmers: 0, merchants: 0, law: 0, outlaws: 0 }, saved.reps || {});
    this.traps = (saved.traps || []).map((q) => ({ ...q, mesh: null }));
    this.bounties = saved.bounties || [];
    this.cabins = saved.cabins || [];
    this.gangSave = saved.gang || [];
    this.order = { cmd: 'follow', point: null };
    this.gang = [];
    this.nextId = saved.nextId || 1;
    this.lastHour = this.game.time;
    this.postT = 5; this.tick = 0;
    const T = town;
    T.st.bounties = T.st.bounties || 0; T.st.alive = T.st.alive || 0; T.st.duels = T.st.duels || 0;
    this.trapGeo = null;
    if (this.trade === 'outlaw') for (const m of this.gangSave) this.spawnMember(m);
  }

  // ---- choosing a trade --------------------------------------------------------------
  name(id = this.trade) { return id ? t('trade.' + id) : '—'; }
  choose(id, change = false) {
    const T = this.town, g = this.game, was = this.trade;
    if (change) {
      const fee = this.changeFee();
      if (T.money < fee) { g.hud.toast(t('trade.noFee', { n: fee })); sfx.error(); return false; }
      T.money -= fee;
      // the old trade's standing fades toward the new one's
      for (const k of GROUPS) this.reps[k] = Math.round(this.reps[k] * 0.5 + ((START_REP[id][k] || 0) - (START_REP[was] && START_REP[was][k] || 0)) * 0.5);
    } else {
      for (const k of GROUPS) this.reps[k] = START_REP[id][k] || 0;
      for (const [item, n] of KIT[id]) g.give(item, n);
      T.money += COINS[id];
      if (id === 'farmer') for (const type of ['cow', 'chicken', 'chicken']) {           // a calf and two hens in your pen
        const P = T.pens, r = P && P.biggest(), a = g.animals.addLivestock(type, T.cottage.pen, 'player', r ? P.spotIn(r) : null);
        if (P) { a.pen = null; P.setRegion(a, r); }
      }
    }
    this.trade = id;
    if (id === 'outlaw') { while (this.gang.length < this.gangSize()) this.recruit(); this.order = { cmd: 'follow', point: null }; }
    else this.dismissGang();
    g.hud.dirtyHotbar = true;
    g.hud.bigMessage(t('trade.chosen', { trade: this.name() }), t('trade.' + id + 'Sub'));
    sfx.done();
    return true;
  }
  changeFee() { return this.reps.law < -40 ? CHANGE_FEE * 2 : CHANGE_FEE; }

  // ---- reputation ------------------------------------------------------------------
  rep(group, n) {
    if (this.trade === 'drifter') n *= 0.5;                 // a drifter's name doesn't stick
    this.reps[group] = Math.max(-100, Math.min(100, this.reps[group] + n));
  }
  // prices: the merchants' opinion and your trade (applied on top of honor)
  priceK(item, buy) {
    let k = buy ? 1 - this.reps.merchants / 500 : 1 + this.reps.merchants / 500;
    if (this.trade === 'merchant') k *= buy ? 0.85 : 1.15;
    if (!buy && this.trade === 'farmer' && FARM_GOODS.has(item)) k *= 1.25;
    if (!buy && this.trade === 'hunter' && HUNT_GOODS.has(item)) k *= 1.3;
    return k;
  }
  jobPayK(v) {
    let k = this.trade === 'drifter' ? 1.3 : 1;
    if (v && v.role === 'farmer') k *= 1 + this.reps.farmers / 400;
    return k;
  }
  refusesJob(v) { return v && v.role === 'farmer' && this.reps.farmers < -40; }
  bountyK() { return this.reps.law > 40 ? 0.75 : this.reps.law < -40 ? 1.25 : 1; }
  onCrime(kind, n) {
    this.rep('law', -Math.max(1, n / 8));
    if (kind === 'holdup' || kind === 'robbery' || kind === 'breakin' || kind === 'horsetheft') this.rep('outlaws', 2);
    if (kind === 'theft' || kind === 'livestock') this.rep('farmers', -3);
  }
  onJob(v) {
    if (v.role === 'farmer') this.rep('farmers', 3); else if (v.role === 'keeper') this.rep('merchants', 3);
    else { this.rep('farmers', 1); this.rep('merchants', 1); }
  }
  onSell() { if (this.trade === 'merchant') this.rep('merchants', 0.2); }
  outlawsHostile() { return this.trade !== 'outlaw' && this.reps.outlaws < 0; }

  // ---- what you aim at and use ----------------------------------------------------
  aimTarget(hit, eye, dir) {
    const g = this.game, T = this.town, F = T.folk, sel = g.selected(), p = g.player.pos;
    // handcuffs on an outlaw who gave up
    if (sel === 'handcuffs') {
      const r = F.raycast(eye, dir, 3.4), v = r && r.villager;
      if (v && v.outlaw && v.alive && v.surrendered > 0 && !v.cuffed) return { a: 'cuff', label: t('use.cuff'), run: () => this.cuff(v) };
    }
    // a trap: take what is in it, or pick it up
    const tr = this.trapAt(eye, dir, hit);
    if (tr) return { a: 'trap', label: t(tr.state === 'caught' ? 'use.trapTake' : 'use.trapPick'), run: () => this.useTrap(tr) };
    // set a trap on open ground
    if (sel === 'trap' && hit && hit.ny === 1 && hit.dist < 4.2 && !SOLID[g.world.get(hit.x, hit.y + 1, hit.z)] && g.world.get(hit.x, hit.y + 1, hit.z) !== B.WATER) {
      return { a: 'trapSet', label: t(this.traps.length >= MAX_TRAPS ? 'use.trapMax' : 'use.trapSet'), run: () => this.setTrap(hit) };
    }
    // one of your men in the cell: dynamite at the bars blows the door
    if (sel === 'dynamite' && hit && this.jailedMen().length && T.jailB && T.jailB.cell && T.jailB.cell.door.some(([x, y, z]) => x === hit.x && y === hit.y && z === hit.z)) {
      return { a: 'blowCell', label: t('use.blowCell'), run: () => T.lightCell(hit) };
    }
    // a prisoner in cuffs at the sheriff's: hand him over
    const pr = this.prisoner();
    if (pr) {
      const sh = F.list.find((v) => v.role === 'sheriff' && v.alive && !v.away);
      if (sh && Math.hypot(sh.pos.x - p.x, sh.pos.z - p.z) < 6) return { a: 'handOver', label: t('use.handOver', { name: pr.name }), run: () => this.handOver(pr) };
    }
    return null;
  }

  // ---- traps -------------------------------------------------------------------------
  setTrap(hit) {
    const g = this.game;
    if (this.traps.length >= MAX_TRAPS) { g.hud.toast(t('trap.max', { n: MAX_TRAPS })); sfx.error(); return; }
    if (!g.has('trap')) return;
    g.take('trap'); g.hud.dirtyHotbar = true;
    this.traps.push({ x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5, state: 'set', t: g.time, mesh: null });
    g.hud.toast(t('trap.set', { n: this.traps.length, max: MAX_TRAPS }));
    sfx.cock();
  }
  trapAt(eye, dir) {
    let best = null, bd = 3.6;
    for (const q of this.traps) {
      const dx = q.x - eye.x, dy = q.y + 0.1 - eye.y, dz = q.z - eye.z, along = dx * dir.x + dy * dir.y + dz * dir.z;
      if (along < 0 || along > bd) continue;
      const off = Math.hypot(dx - dir.x * along, dy - dir.y * along, dz - dir.z * along);
      if (off < 0.55) { best = q; bd = along; }
    }
    return best;
  }
  useTrap(q) {
    const g = this.game, A = g.animals;
    if (q.state === 'caught') {
      const a = q.animal && A.list.includes(q.animal) ? q.animal : null;
      const type = q.catch || 'deer';
      if (q.animal && !a) g.hud.toast(t('trap.eaten'));          // wolves got there first
      else {
        if (a) { a.trapped = false; A.skin(a); }
        else { g.give('meat_raw', type === 'wolf' ? 2 : 2); g.give(type === 'wolf' ? 'wolf_hide' : 'hide', 1); g.stats.animals = (g.stats.animals || 0) + 1; }
        g.hud.toast(t('trap.took', { what: t('animal.' + type) }), 'pick');
      }
      q.state = 'set'; q.catch = null; q.animal = null; q.shown = false; q.t = g.time;
      this.trapMesh(q, true);
      sfx.cock();
    } else {
      this.dropTrap(q); this.traps = this.traps.filter((x) => x !== q);
      g.give('trap', 1); g.hud.dirtyHotbar = true; sfx.click();
    }
  }
  trapGeometry() {
    if (this.trapGeo) return this.trapGeo;
    const ring = new THREE.TorusGeometry(0.28, 0.025, 4, 14); ring.rotateX(Math.PI / 2);
    const jaw = new THREE.BoxGeometry(0.5, 0.12, 0.03);
    const plate = new THREE.CylinderGeometry(0.08, 0.08, 0.02, 8);
    const mat = new THREE.MeshLambertMaterial({ color: 0x55575c });
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x6a5a3a });
    this.trapGeo = { ring, jaw, plate, mat, plateMat };
    return this.trapGeo;
  }
  trapMesh(q, rebuild = false) {
    if (q.mesh && !rebuild) return q.mesh;
    this.dropTrap(q);
    const G = this.trapGeometry(), grp = new THREE.Group();
    grp.add(new THREE.Mesh(G.ring, G.mat));
    const shut = q.state === 'caught';
    for (const s of [-1, 1]) {
      const j = new THREE.Mesh(G.jaw, G.mat);
      j.position.set(0, shut ? 0.13 : 0.02, s * (shut ? 0.02 : 0.27)); j.rotation.x = shut ? 0 : s * 1.3;
      grp.add(j);
    }
    const pl = new THREE.Mesh(G.plate, G.plateMat); pl.position.y = 0.01; grp.add(pl);
    grp.position.set(q.x, q.y + 0.02, q.z);
    this.game.scene.add(grp);
    q.mesh = grp;
    return grp;
  }
  dropTrap(q) { if (q.mesh) { this.game.scene.remove(q.mesh); q.mesh = null; } }
  updateTraps(dt) {
    const g = this.game, A = g.animals, P = g.player.pos;
    // hours passed (sleeping, or just time going by): far traps catch now and then
    const hours = (g.time - this.lastHour) * 24;
    if (hours >= 1) {
      this.lastHour = g.time;
      for (const q of this.traps) {
        if (q.state !== 'set' || Math.hypot(q.x - P.x, q.z - P.z) < 60) continue;
        if (Math.random() < 1 - Math.pow(0.9, Math.min(48, hours))) { q.state = 'caught'; q.catch = Math.random() < 0.72 ? 'deer' : 'wolf'; q.animal = null; this.dropTrap(q); }
      }
    }
    for (const q of this.traps) {
      const d = Math.hypot(q.x - P.x, q.z - P.z);
      if (d > TRAP_SHOW) { this.dropTrap(q); continue; }
      this.trapMesh(q);
      // a catch made while you were away: the animal lies in the trap
      if (q.state === 'caught' && !q.animal && q.catch && !q.shown) {
        q.shown = true;
        const herd = { type: q.catch, cx: q.x, cz: q.z, moveT: 9999, members: [], airborne: false };
        const a = A.add(q.catch, herd, q.x, q.y, q.z); A.herds.push(herd);
        a.trapped = true; A.hurt(a, 9999, true); q.animal = a;
      }
      // something walks onto it
      if (q.state === 'set') for (const a of A.list) {
        if (a.state === 'dead' || a.owner || (a.type !== 'deer' && a.type !== 'wolf') || Math.abs(a.pos.x - q.x) > 0.8 || Math.abs(a.pos.z - q.z) > 0.8) continue;
        q.state = 'caught'; q.catch = a.type; q.animal = a; q.shown = true;
        a.trapped = true; A.hurt(a, 9999, true);
        a.pos.set(q.x, a.pos.y, q.z);
        sfx.clang(Math.max(0.2, 1 - d / 40));
        this.trapMesh(q, true);
        if (d < 60) g.hud.toast(t('trap.sprung', { what: t('animal.' + a.type) }));
        break;
      }
    }
  }

  // ---- bounties and outlaws ------------------------------------------------------------
  open() { return this.bounties.filter((b) => b.status === 'open'); }
  claimable() { return this.bounties.filter((b) => b.status === 'dead'); }
  rewardK() { return this.trade === 'bounty' ? 1.5 : 1; }
  // somewhere wild for a hideout: flat, dry, well away from the town and your home
  findCabin() {
    const g = this.game, w = g.world, V = this.town.village, H = this.town.cottage;
    for (let k = 0; k < 30; k++) {             // (a few tries per call: no hitch; it tries again later)
      const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 90;
      const x = Math.floor(V.cx + Math.cos(a) * r), z = Math.floor(V.cz + Math.sin(a) * r);
      if (x < 12 || z < 12 || x > w.W - 18 || z > w.D - 18) continue;
      if (Math.hypot(x - H.x, z - H.z) < 70 || this.cabins.some((c) => Math.hypot(c.x - x, c.z - z) < 50)) continue;
      if (Math.hypot(x - g.player.pos.x, z - g.player.pos.z) < 100) continue;              // built out of your sight
      if (V.buildings.some((b) => Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z) < 35)) continue;
      const y0 = this.groundY(x, z);
      let ok = w.get(x, y0 + 1, z) !== B.WATER;
      for (const [cx, cz] of [[6, 0], [0, 6], [6, 6]]) if (ok && (Math.abs(this.groundY(x + cx, z + cz) - y0) > 2)) ok = false;   // the corners first (cheap)
      // gentle ground and no water (the cabin's floor is levelled when it is built)
      for (let dx = -1; dx <= 6 && ok; dx += 1) for (let dz = -1; dz <= 6 && ok; dz += 1) {
        const y = this.groundY(x + dx, z + dz);
        if (Math.abs(y - y0) > 2 || w.get(x + dx, y, z + dz) === B.WATER || w.get(x + dx, y + 1, z + dz) === B.WATER) ok = false;
      }
      if (ok) return { x, z, y: y0 };
    }
    return null;
  }
  // the ground under any trees (trunks and leaves don't count)
  groundY(x, z) {
    const w = this.game.world;
    for (let y = w.H - 1; y > 0; y--) { const b = w.get(x, y, z); if (b !== B.AIR && b !== B.WATER && b !== B.LEAVES && b !== B.LOG) return y; }
    return 0;
  }
  // a small log cabin with a plank roof and a door facing the town
  buildCabin(c) {
    const w = this.game.world, y = c.y;
    for (let dx = 0; dx < 6; dx++) for (let dz = 0; dz < 6; dz++) {
      const x = c.x + dx, z = c.z + dz;
      for (let yy = y - 3; yy <= y; yy++) if (!SOLID[w.get(x, yy, z)]) w.set(x, yy, z, B.DIRT);
      for (let yy = y + 1; yy <= y + 12; yy++) { const b = w.get(x, yy, z); if (b !== B.AIR) w.set(x, yy, z, B.AIR); }    // (trees in the way are cleared)
      w.set(x, y, z, B.WOOD);
      const edge = dx === 0 || dz === 0 || dx === 5 || dz === 5;
      if (edge) for (let yy = y + 1; yy <= y + 3; yy++) w.set(x, yy, z, B.LOG);
      w.set(x, y + 4, z, B.WOOD);
    }
    // the door: toward the town
    const V = this.town.village, fx = V.cx - (c.x + 3), fz = V.cz - (c.z + 3);
    const [dx, dz, nx, nz] = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? [5, 2, 1, 0] : [0, 2, -1, 0]) : (fz > 0 ? [2, 5, 0, 1] : [2, 0, 0, -1]);
    for (let yy = y + 1; yy <= y + 2; yy++) w.set(c.x + dx, yy, c.z + dz, B.AIR);
    c.door = { x: c.x + dx + 0.5 + nx * 1.5, y: y + 1, z: c.z + dz + 0.5 + nz * 1.5 };
    c.inside = { x: c.x + 2.5, y: y + 1, z: c.z + 2.5 };
  }
  post() {
    const g = this.game;
    if (this.open().length >= MAX_BOUNTIES) return;
    let c = this.cabins.find((q) => !this.bounties.some((b) => b.cabin === q.id && b.status === 'open'));
    if (!c && this.cabins.length < MAX_BOUNTIES) {
      const site = this.findCabin();
      if (!site) return;
      c = { id: this.nextId++, ...site };
      this.buildCabin(c); this.cabins.push(c);
    }
    if (!c) return;
    const r = Math.random;
    const name = OUT_FIRST[Math.floor(r() * OUT_FIRST.length)] + ' ' + OUT_LAST[Math.floor(r() * OUT_LAST.length)];
    const crimes = ['robbery', 'rustling', 'holdup', 'murder'];
    this.bounties.push({ id: this.nextId++, name, cabin: c.id, reward: 40 + Math.floor(r() * 5) * 10, crime: crimes[Math.floor(r() * crimes.length)], status: 'open', seed: Math.floor(r() * 1e6), brave: 0.55 + r() * 0.4, posted: g.time });
  }
  cabinOf(b) { return this.cabins.find((c) => c.id === b.cabin) || null; }
  makeMan(name, seed, look, at) {
    const r = mulberry(seed);
    const lookKey = 'x' + seed;
    civLook(lookKey, look);
    return {
      i: 1000 + seed % 100000, extra: true, role: 'outsider', name, female: false, look, lookKey, skin: Math.floor(r() * 5), pitch: 0.8 + r() * 0.2,
      rig: null, pos: new THREE.Vector3(at.x, at.y, at.z), yaw: r() * 6, speed: 0, crouch: false, hp: 100, alive: true, deadT: 0,
      route: [], greetT: 999, faceT: 0, scaredT: 0, stuckT: 0, cool: 0, armed: null, guns: ['revolver'], money: 8 + Math.floor(r() * 20), goods: ['bread'], brave: 0.6 + r() * 0.35,
    };
  }
  spawnOutlaw(b) {
    const F = this.town.folk, c = this.cabinOf(b);
    const at = c.inside || { x: c.x + 2.5, y: c.y + 1, z: c.z + 2.5 };
    const r = mulberry(b.seed);
    const look = { shirt: [0x3a3430, 0x4a3e34, 0x2e2c2a][Math.floor(r() * 3)], trousers: 0x2a2622, vest: 0x1e1c1a, hat: 'felt', hatColor: 0x1a1612, hair: 0x2a1c12, moustache: r() < 0.7, gunbelt: true, braces: null };
    const v = this.makeMan(b.name, b.seed, look, at);
    Object.assign(v, { outlaw: true, bounty: b, brave: b.brave, guns: r() < 0.5 ? ['revolver', 'lever'] : ['revolver'] });
    if (r() < 0.3) v.goods = ['bread', 'tmap'];          // now and then a treasure map in his pocket
    v.ai = (o, dt, d) => this.outlawAi(o, dt, d);
    v.onHurt = (o) => { if (o.alive && !o.fight && !o.cuffed && !(o.surrendered > 0)) this.draw(o); };
    v.onKill = (o) => this.outlawDown(o);
    F.extra.push(v); b.v = v;
    return v;
  }
  draw(v) {
    const F = this.town.folk;
    v.fight = { armed: F.bestGun(v) || 'revolver' }; F.armed(v, v.fight.armed);
    v.cool = this.town.duels.reaction(v); F.say(v, 'say.outlawDraw', null, 'warn'); sfx.leather();
  }
  outlawAi(v, dt, d) {
    const g = this.game, F = this.town.folk, P = g.player.pos;
    if (!v.alive) return true;
    if (v.cuffed) {
      // in handcuffs: he walks a couple of steps behind you, hands bound
      v.surrendered = 999; v.fight = null;
      const dd = Math.hypot(P.x - v.pos.x, P.z - v.pos.z);
      if (dd > 30) { const b = Math.atan2(v.pos.x - P.x, v.pos.z - P.z); v.pos.set(P.x + Math.sin(b) * 2, P.y, P.z + Math.cos(b) * 2); v.route = []; }   // (left far behind: he is brought along)
      const sp = dd > 8 ? 6.4 : dd > 4 ? 4.6 : 2.2;
      v.detourT = Math.max(0, (v.detourT || 0) - dt);
      if (dd > 2.4) { if (dd < 9 && v.detourT <= 0) { v.route = []; F.step(v, P.x, P.z, sp, dt, P.y); if (v.stuckT > 1.2) { v.stuckT = 0; v.detourT = 3; } } else F.goDirect(v, { x: P.x, y: P.y, z: P.z }, sp, dt, 1.8); }
      else v.speed = 0;
      if (dd > 18 && !F.visible(v)) { const b2 = Math.atan2(v.pos.x - P.x, v.pos.z - P.z), gx = P.x + Math.sin(b2) * 2.5, gz = P.z + Math.cos(b2) * 2.5, gy = F.ground(gx, gz, P.y + 2); if (gy != null) { v.pos.set(gx, gy, gz); v.route = []; } }
      if (v.speed === 0) v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z));
      return true;
    }
    if (v.surrendered > 0 || v.fight || v.duel) {
      // a held-up outlaw makes a run for it (or draws) once your back is turned
      if (v.surrendered > 0 && v.surrendered < 1.5 && !v.cuffed) { v.surrendered = 0; if (v.brave > 0.7) this.draw(v); else v.scaredT = 30; return true; }
      return false;
    }
    const c = this.cabinOf(v.bounty);
    if (d < 24 && F.sees(v, 30)) {
      if (this.outlawsHostile()) { if (!v.warned) { v.warned = true; F.say(v, 'say.outlawWarn', null, 'warn'); v.faceT = 1.5; v.drawT = 1.2 + Math.random(); } }
      else if (!v.greeted) { v.greeted = true; F.say(v, 'say.outlawHi'); v.faceT = 3; }
    }
    if (v.warned) {
      v.drawT -= dt;
      if (d > 34) v.warned = false;                          // you rode off: he lets it go
      else if (v.drawT <= 0) { v.warned = false; this.draw(v); return false; }
    }
    if (v.faceT > 0) { v.speed = 0; v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z)); v.faceT -= dt; return true; }
    // idling round his cabin
    v.idleT = (v.idleT || 0) - dt;
    if (!v.goal || v.idleT <= 0) { v.idleT = 6 + Math.random() * 10; const a = Math.random() * 6.28, R = 2 + Math.random() * 6; v.goal = { x: c.x + 3 + Math.cos(a) * R, y: c.y + 1, z: c.z + 3 + Math.sin(a) * R }; v.route = []; }
    if (Math.hypot(v.goal.x - v.pos.x, v.goal.z - v.pos.z) > 0.8) F.goDirect(v, v.goal, 1.6, dt, 0.7); else v.speed = 0;
    return true;
  }
  heldUp(v) { v.warned = false; v.drawT = 0; if (v.outlaw && v.fight) return; }
  cuff(v) {
    const g = this.game;
    if (!g.has('handcuffs')) return;
    g.take('handcuffs'); g.hud.dirtyHotbar = true;
    v.cuffed = true; v.surrendered = 999; v.fight = null; this.town.folk.armed(v, null);
    v.guns = []; v.route = [];
    this.town.folk.say(v, 'say.outlawCuffed');
    g.hud.toast(t('bounty.cuffed', { name: v.name }), 'pick');
    sfx.clang(0.6);
  }
  prisoner() { return this.town.folk.extra.find((v) => v.cuffed && v.alive) || null; }
  handOver(v) {
    const g = this.game, T = this.town, b = v.bounty;
    const pay = Math.round(b.reward * 1.5 * this.rewardK());
    T.money += pay; T.st.earned += pay; T.st.bounties++; T.st.alive++;
    b.status = 'claimed'; b.v = null;
    this.rep('law', 9); this.rep('outlaws', -6); T.addHonor(4);
    v.away = true; v.alive = false; this.town.folk.dropRig(v);
    this.town.folk.extra = this.town.folk.extra.filter((x) => x !== v);
    g.hud.bigMessage(t('bounty.inTitle'), t('bounty.inSub', { name: v.name, n: pay }));
    sfx.coins();
  }
  outlawDown(v) {
    const b = v.bounty;
    if (b && b.status === 'open') { b.status = 'dead'; this.game.hud.toast(t('bounty.down', { name: v.name }), 'pick'); }
  }
  collect(b) {
    const g = this.game, T = this.town;
    if (b.status !== 'dead') return;
    const pay = Math.round(b.reward * this.rewardK());
    T.money += pay; T.st.earned += pay; T.st.bounties++;
    b.status = 'claimed';
    this.rep('law', 6); this.rep('outlaws', -6);
    g.hud.toast(t('bounty.paid', { n: pay, name: b.name }), 'pick');
    sfx.coins();
  }
  updateOutlaws(dt) {
    const g = this.game, P = g.player.pos, F = this.town.folk;
    this.postT -= dt;
    if (this.postT <= 0) { this.postT = 30; if (g.time - (this.lastPost || 0) > 0.5 || this.open().length === 0) { const n = this.open().length; this.post(); if (this.open().length > n) this.lastPost = g.time; } }
    for (const b of this.bounties) {
      if (b.status !== 'open' && !(b.v && b.v.cuffed)) { if (b.v && !b.v.alive && b.v.away) b.v = null; continue; }
      const c = this.cabinOf(b);
      if (!c) continue;
      const d = Math.hypot(c.x + 3 - P.x, c.z + 3 - P.z);
      if (!b.v && d < OUTLAW_IN) this.spawnOutlaw(b);
      else if (b.v && !b.v.cuffed && b.v.alive && d > OUTLAW_OUT && Math.hypot(b.v.pos.x - P.x, b.v.pos.z - P.z) > OUTLAW_OUT) {
        F.dropRig(b.v); F.extra = F.extra.filter((x) => x !== b.v); b.v = null;          // far away again: just a name on the board
      }
    }
    // the dead are taken away after a while
    if (F.extra.some((v) => v.away)) F.extra = F.extra.filter((v) => !v.away);
  }

  // ---- your gang (Outlaw) -------------------------------------------------------------
  gangSize() { return this.reps.outlaws >= 60 ? 5 : 4; }
  recruit() {
    const P = this.game.player.pos, r = Math.random;
    const m = { name: OUT_FIRST[Math.floor(r() * OUT_FIRST.length)] + ' ' + OUT_LAST[Math.floor(r() * OUT_LAST.length)], seed: Math.floor(r() * 1e6) };
    this.gangSave.push(m);
    const a = r() * 6.28;
    return this.spawnMember(m, { x: P.x + Math.cos(a) * 3, y: P.y, z: P.z + Math.sin(a) * 3 });
  }
  spawnMember(m, at = null) {
    const F = this.town.folk, P = this.game.player.pos, r = mulberry(m.seed);
    at = at || { x: P.x + (r() - 0.5) * 6, y: P.y, z: P.z + (r() - 0.5) * 6 };
    const gy = F.ground(at.x, at.z, at.y + 2); if (gy != null) at.y = gy;
    const look = { shirt: [0x6a4a3a, 0x4a4a52, 0x5a5040][Math.floor(r() * 3)], trousers: 0x32302c, vest: r() < 0.6 ? 0x2a2420 : null, hat: 'felt', hatColor: [0x3a2a1c, 0x1a1612, 0x5a4a3a][Math.floor(r() * 3)], hair: 0x3a2a1c, moustache: r() < 0.5, gunbelt: true };
    const v = this.makeMan(m.name, m.seed, look, at);
    Object.assign(v, { gang: true, seed: m.seed, slot: this.gang.length, guns: r() < 0.5 ? ['revolver', 'lever'] : ['revolver', 'shotgun'] });
    if (m.jailed && this.town.jailB && this.town.jailB.cell) { const C = this.town.jailB.cell; v.jailed = true; v.jailUntil = m.until || 0; v.pos.set(C.inside.x, C.inside.y, C.inside.z); if (!this.town.jailed) this.town.cellDoor(true, true); }
    v.ai = (o, dt, d) => this.memberAi(o, dt, d);
    v.onKill = (o) => { this.gang = this.gang.filter((x) => x !== o); this.gangSave = this.gangSave.filter((x) => x.seed !== m.seed); this.game.hud.toast(t('gang.lost', { name: o.name })); this.lostDay = Math.floor(this.game.time); };
    F.extra.push(v); this.gang.push(v);
    return v;
  }
  dismissGang() {
    const F = this.town.folk;
    for (const v of this.gang) { F.dropRig(v); v.away = true; }
    F.extra = F.extra.filter((x) => !x.gang); this.gang = []; this.gangSave = [];
  }
  // an order from the wheel (orders.js)
  issue(cmd, point, at = {}) {
    const g = this.game;
    point = point ? point.clone() : g.player.pos.clone();
    if (cmd === 'loot') return this.orderLoot(at.house || this.houseNear(point), point);
    if (cmd === 'chaos') return this.orderBrawl(point);
    if (cmd === 'gun') return this.orderGun();
    if (cmd !== 'follow' && cmd !== 'disperse') cmd = 'hold';            // (Hold here: spread out round the spot, guard it, defend themselves)
    this.order = { cmd, point };
    for (const v of this.free()) { v.holdAt = v.pos.clone(); v.route = []; v.coverAt = null; v.distractT = 0; v.spot = null; v.spotT = 0; v.spotBest = null; v.hideAt = null; v.hidden = false; }
    if (cmd === 'hold') this.ringSpots(point, 5);
    if (cmd === 'disperse') { this.alarm = 0; this.quiet = false; this.hideSpots(); }
    this.quiet = cmd === 'follow' && this.alarm > 0;     // called back in a fight: they come with you (shooting as they go)
    if (cmd === 'distract') {
      const p = this.order.point;
      const v = this.gang.filter((m) => m.alive).sort((a, b) => a.pos.distanceTo(p) - b.pos.distanceTo(p))[0];
      if (v) { v.distractT = 25; v.distracted = false; v.distractAt = null; }
    }
    g.hud.toast(t('gang.order', { o: t('gord.' + cmd) }));
    sfx.toggle();
  }
  // Disperse: every man scatters his own way, 30 to 45 m out, away from the
  // posse if there is one, and lies low there (down, quiet, not shooting
  // unless someone is right on him). Hidden men are not found by the posse.
  // Follow me brings them back together.
  hideSpots() {
    const F = this.town.folk, P = this.game.player.pos, men = this.free(), n = Math.max(1, men.length);
    const posse = this.town.posse && this.town.posse.members.find((m) => m.alive);
    const away = posse ? Math.atan2(P.z - posse.pos.z, P.x - posse.pos.x) : Math.random() * 6.28;
    men.forEach((v, i) => {
      let spot = null;
      for (let k = 0; k < 12 && !spot; k++) {
        const a = away + (i - (n - 1) / 2) * (posse ? 0.9 : 6.28 / n) + (Math.random() - 0.5) * 0.6, r = 30 + Math.random() * 15;
        const x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r, y = F.ground(x, z, v.pos.y + 6);
        if (y != null && F.free(x, y, z)) spot = new THREE.Vector3(x, y, z);
      }
      v.hideAt = spot || v.pos.clone(); v.hidden = false; v.route = [];
    });
  }
  // Give me a gun: the nearest of your men hands you one of his (each man once a
  // day): a revolver if you have no gun, else his rifle or shotgun
  canGiveGun() { const day = Math.floor(this.game.time); return this.gang.some((m) => m.alive && !m.jailed && m.gaveDay !== day); }
  orderGun() {
    const g = this.game, P = g.player.pos, day = Math.floor(g.time);
    const v = this.gang.filter((m) => m.alive && !m.jailed && m.gaveDay !== day).sort((a, b) => a.pos.distanceTo(P) - b.pos.distanceTo(P))[0];
    if (!v) { g.hud.toast(t('gang.noGun')); sfx.error(); return; }
    v.gaveDay = day; v.task = null;
    v.giveGun = { t: 0 };               // he walks over to you and hands it over (memberAi)
    g.hud.toast(t('gang.gunComing', { name: v.name }));
    sfx.toggle();
  }
  handGun(v) {
    const g = this.game, guns = ['revolver', 'lever', 'shotgun'];
    const id = !guns.some((x) => g.has(x)) ? 'revolver' : guns.find((x) => !g.has(x)) || 'revolver';
    g.give(id, 1); if (!g.has('knife')) g.give('knife', 1);
    g.hud.dirtyHotbar = true;
    this.town.folk.say(v, 'say.gunHere', null, 'ok');
    g.hud.toast(t('gang.gotGun', { name: v.name, gun: t('item.' + id) }), 'pick'); sfx.pickup ? sfx.pickup() : sfx.coins();
    v.giveGun = null;
  }
  // men free for an order (not in jail, not off looting or brawling)
  free() { return this.gang.filter((m) => m.alive && !m.jailed && !m.task); }
  houseNear(p) {
    const V = this.town.village;
    let best = null, bd = 12;
    for (const b of V.buildings) {
      if (b.type !== 'house') continue;
      const inside = p.x >= b.x0 - 0.5 && p.x <= b.x1 + 1.5 && p.z >= b.z0 - 0.5 && p.z <= b.z1 + 1.5;
      const d = inside ? 0 : Math.hypot(b.door.x - p.x, b.door.z - p.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  houseName(b) {
    const o = this.town.folk.list.find((v) => v.home === b);
    return o ? t('gang.houseOf', { name: o.name.split(' ').slice(-1)[0] }) : t('tmap.h.' + (b.status || 'house'));
  }

  // ---- Loot this house: two men pick the lock, go in, come back with the takings ----
  orderLoot(b, point) {
    const g = this.game;
    if (!b) { g.hud.toast(t('gang.noHouse')); sfx.error(); return; }
    const men = this.free().sort((a, c) => a.pos.distanceTo(point) - c.pos.distanceTo(point)).slice(0, 2);
    if (!men.length) { g.hud.toast(t('gang.nobody')); return; }
    for (const v of men) { v.task = { kind: 'loot', b, phase: 'go', t: 0, coins: 0, goods: [] }; v.route = []; }
    g.hud.toast(t('gang.lootGo', { names: men.map((m) => m.name.split(' ')[0]).join(' & '), house: this.houseName(b) }));
    sfx.toggle();
  }
  lootAi(v, dt) {
    const g = this.game, F = this.town.folk, T = this.town, k = v.task, b = k.b, P = g.player.pos;
    k.t += dt; v.crouch = false;
    if (k.phase === 'go') {
      const door = { x: b.door.x, y: b.door.y, z: b.door.z }, d = Math.hypot(door.x - v.pos.x, door.z - v.pos.z);
      if (d > 1.4 && k.t < 60) { F.goDirect(v, door, 4.6, dt, 1.2); return true; }
      k.phase = 'pick'; k.t = 0; v.speed = 0;
    }
    if (k.phase === 'pick' || k.phase === 'in') {
      v.speed = 0; v.crouch = k.phase === 'pick';
      if (k.phase === 'pick') v.yaw = Math.atan2(-(b.inside.x - v.pos.x), -(b.inside.z - v.pos.z));
      // is anyone looking? (people watching a brawl see nothing else)
      k.seeT = (k.seeT || 0) - dt;
      if (k.seeT <= 0) { k.seeT = 0.8; if (this.spotted(v)) return true; }
      if (k.phase === 'pick' && k.t > 4) { k.phase = 'in'; k.t = 0; v.outside = v.pos.clone(); v.pos.set(b.inside.x, b.inside.y, b.inside.z); v.route = []; sfx.click(); }
      else if (k.phase === 'in' && k.t > 6) {
        // the takings: some of the household's money, food and (in a mansion) gold
        const fam = F.list.filter((o) => o.home === b && o.alive);
        const rich = b.status === 'mansion' ? 3 : b.status === 'house' ? 1.6 : 0.8;
        k.coins = Math.round((6 + Math.random() * 12) * rich);
        for (const o of fam) { const cut = Math.floor(o.money * 0.3); o.money -= cut; k.coins += Math.floor(cut / 2); }
        k.goods = ['bread', Math.random() < 0.5 ? 'egg' : 'bread'].concat(b.status === 'mansion' && Math.random() < 0.5 ? ['gold'] : []);
        k.phase = 'back'; k.t = 0;
        v.pos.copy(v.outside || new THREE.Vector3(b.door.x, b.door.y, b.door.z)); v.route = [];
        b.robbedT = g.time;
      }
      return true;
    }
    // back to you with the takings (or empty-handed, running, if he was seen)
    const d = Math.hypot(P.x - v.pos.x, P.z - v.pos.z);
    if (d > 3.5 && k.t < 90) { F.goDirect(v, P, k.seen ? 5.4 : 4.4, dt, 3); return true; }
    if (k.coins || k.goods.length) {
      T.money += k.coins; T.st.earned += k.coins;
      for (const it of k.goods) g.give(it, 1);
      g.hud.dirtyHotbar = true;
      g.hud.toast(t('gang.lootIn', { name: v.name.split(' ')[0], n: k.coins, goods: k.goods.map((x) => t('item.' + x)).join(', ') }), 'pick');
      sfx.coins();
    }
    v.task = null;
    return true;
  }
  // a looter seen: the sheriff takes him on the spot; anyone else runs to tell the sheriff
  spotted(v) {
    const F = this.town.folk, T = this.town, g = this.game;
    const eye = new THREE.Vector3(), pos = new THREE.Vector3(v.pos.x, v.pos.y + 1.2, v.pos.z);
    for (const o of F.list) {
      if (!o.alive || o.away || o.watching || o.sleeping || o.posse || o.reportTo) continue;
      const dx = v.pos.x - o.pos.x, dz = v.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      if (d > 24 || Math.abs(v.pos.y - o.pos.y) > 6) continue;
      const facing = (-Math.sin(o.yaw) * dx - Math.cos(o.yaw) * dz) / (d || 1);
      if (facing < -0.2 && d > 5) continue;
      eye.set(o.pos.x, o.pos.y + 1.65, o.pos.z);
      const dir = pos.clone().sub(eye), L = dir.length(); dir.divideScalar(L);
      if (g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, L - 0.4, false, 'sight')) continue;
      v.task.seen = true; v.task.phase = 'back'; v.task.coins = 0; v.task.goods = []; v.task.t = 0;
      if (v.outside) v.pos.copy(v.outside);
      if (o.role === 'sheriff') { F.say(o, 'say.sheriffCaught', null, 'warn'); this.arrest(v); return true; }
      F.say(o, 'say.thief', null, 'warn');
      o.reportTo = { kind: 'breakin', amount: 35, pos: g.player.pos.clone(), gang: v };
      o.route = []; o.scaredT = 0;
      T.witnesses = T.witnesses.filter((x) => x !== o).concat(o);
      g.hud.alert(t('gang.seen', { who: o.name, name: v.name })); sfx.alert();
      return true;
    }
    return false;
  }

  // ---- Start a brawl: two of your men fight with their fists; the town comes to watch ----
  orderBrawl(point) {
    const g = this.game, F = this.town.folk;
    const men = this.free().sort((a, c) => a.pos.distanceTo(point) - c.pos.distanceTo(point)).slice(0, 2);
    if (men.length < 2) { g.hud.toast(t('gang.needTwo')); sfx.error(); return; }
    const gy = F.ground(point.x, point.z, point.y + 2);
    const B = { at: { x: point.x, y: gy ?? point.y, z: point.z }, t: 0, dur: 50, men, started: false };
    men.forEach((v, i) => { v.task = { kind: 'brawl', B, side: i }; v.route = []; });
    this.brawl = B;
    g.hud.toast(t('gang.brawlGo', { a: men[0].name.split(' ')[0], b: men[1].name.split(' ')[0] }));
    sfx.toggle();
  }
  brawlAi(v, dt) {
    const F = this.town.folk, B = v.task.B, other = B.men[1 - v.task.side];
    if (B.over || !other.alive) { v.task = null; v.brawl = false; v.down = 0; return true; }
    if (!B.started) {
      const spot = { x: B.at.x + (v.task.side ? 0.6 : -0.6), y: B.at.y, z: B.at.z };
      if (Math.hypot(spot.x - v.pos.x, spot.z - v.pos.z) > 0.5) { F.goDirect(v, spot, 4.8, dt, 0.4); return true; }
      v.speed = 0;
      if (B.men.every((m) => Math.hypot(m.pos.x - B.at.x, m.pos.z - B.at.z) < 1.4)) { B.started = true; F.say(v, 'say.brawlStart', null, 'warn'); }
      return true;
    }
    v.brawl = true; v.armed && F.armed(v, null); v.route = [];
    const dx = other.pos.x - v.pos.x, dz = other.pos.z - v.pos.z, dd = Math.hypot(dx, dz) || 1, ux = dx / dd, uz = dz / dd;
    // (they stay in a ring round the spot: the crowd keeps them in)
    const move = (mx, mz) => {
      let nx = v.pos.x + mx, nz = v.pos.z + mz;
      const cx = nx - B.at.x, cz = nz - B.at.z, r = Math.hypot(cx, cz);
      if (r > 2) { nx = B.at.x + cx / r * 2; nz = B.at.z + cz / r * 2; }
      const gy = F.ground(nx, nz, v.pos.y + 1);
      if (gy != null && Math.abs(gy - v.pos.y) < 1.1 && F.free(nx, gy, nz)) { v.pos.x = nx; v.pos.z = nz; v.pos.y += (gy - v.pos.y) * 0.5; }
    };
    v.speed = 0;
    // knocked down: flat on his back for a moment, then up again
    if (v.down > 0) { v.down -= dt; if (v.down <= 0) F.say(v, 'say.brawlUp'); return true; }
    // knocked back by a blow: stagger away
    if (v.knock > 0) { const k = v.knock / 0.45; move(-ux * 2.6 * k * dt, -uz * 2.6 * k * dt); v.knock -= dt; v.speed = 1.2; }
    v.yaw = Math.atan2(-ux, -uz);
    // circling: they shuffle round each other, closing in or backing off
    const side = v.task.side ? 1 : -1;
    if (other.down > 0) { if (dd > 1.6) { move(ux * 1.5 * dt, uz * 1.5 * dt); v.speed = 1.5; } }
    else {
      if (dd > 1.25) { move(ux * 1.8 * dt, uz * 1.8 * dt); v.speed = 1.8; } else if (dd < 0.85) { move(-ux * 1.2 * dt, -uz * 1.2 * dt); v.speed = 1.2; }
      move(-uz * side * 0.7 * dt, ux * side * 0.7 * dt); if (!v.speed) v.speed = 0.7;
    }
    // swinging: he steps in with a jab or a haymaker; a blow that lands sends the other man reeling
    v.punchT = (v.punchT ?? Math.random() * 0.8) - dt;
    if (v.punchT <= 0 && !(v.knock > 0) && !(other.down > 0) && dd < 1.7) {
      v.punchT = 0.55 + Math.random() * 0.9; v.punch = 0.4; v.hook = Math.random() < 0.35; v.landed = false; v.right = !v.right;
    }
    if (v.punch > 0) {
      v.punch -= dt;
      move(ux * 1.6 * dt, uz * 1.6 * dt);                     // the lunge
      if (!v.landed && v.punch < 0.22) {
        v.landed = true;
        if (Math.random() < 0.62 && !(other.down > 0)) {
          other.knock = 0.45; other.flinchT = 0.35; sfx.thump();
          if (Math.random() < (v.hook ? 0.35 : 0.12)) { other.down = 1.9; other.knock = 0; F.say(other, 'say.brawlOof'); sfx.thump(); }
          else if (Math.random() < 0.15) F.say(other, 'say.brawlOof');
        }
      }
    }
    return true;
  }
  // the crowd: everyone near comes to watch (and sees nothing else); the sheriff breaks it up
  updateBrawl(dt) {
    const B = this.brawl, F = this.town.folk, g = this.game;
    if (!B) return;
    if (B.started) B.t += dt;
    let sheriffThere = false;
    for (const o of F.list) {
      if (!o.alive || o.away || o.posse || o.fight || o.reportTo || o.surrendered || o.sleeping) { if (o.watching === B) o.watching = null; continue; }
      const d = Math.hypot(o.pos.x - B.at.x, o.pos.z - B.at.z);
      // (the sheriff hears of it from farther off)
      if (B.started && (d < 45 || (o.role === 'sheriff' && d < 120))) { if (o.watching !== B) { o.watching = B; o.watchA = Math.atan2(o.pos.z - B.at.z, o.pos.x - B.at.x); o.route = []; } }
      if (o.role === 'sheriff' && o.watching === B && d < 4.5) sheriffThere = true;
    }
    if (sheriffThere) B.sheriffT = (B.sheriffT || 0) + dt;
    // the sheriff lets it run a while, then breaks it up (and may lock one of them up)
    if (B.t > B.dur || B.sheriffT > 22 || B.men.some((m) => !m.alive)) {
      B.over = true; this.brawl = null;
      for (const o of F.list) if (o.watching === B) o.watching = null;
      for (const m of B.men) { m.brawl = false; m.task = null; m.down = 0; m.knock = 0; m.punch = 0; }
      if (B.sheriffT > 22) {
        const sh = F.list.find((o) => o.role === 'sheriff' && o.alive);
        if (sh) F.say(sh, 'say.sheriffBreakUp', null, 'warn');
        if (Math.random() < 0.5) this.arrest(B.men[Math.floor(Math.random() * 2)]);
      }
      g.hud.toast(t('gang.brawlOver'));
    }
  }

  // ---- the town jail: a man of yours caught by the sheriff ----
  arrest(v) {
    const g = this.game, T = this.town, C = T.jailB && T.jailB.cell;
    if (!v || !v.alive || v.jailed || !C) return;
    v.jailed = true; v.task = null; v.brawl = false; v.target = null; v.route = []; v.crouch = false;
    this.town.folk.armed(v, null);
    v.pos.set(C.inside.x - 0.4 + Math.random() * 0.8, C.inside.y, C.inside.z);
    v.jailUntil = g.time + 2;
    const m = this.gangSave.find((x) => x.seed === v.seed); if (m) { m.jailed = true; m.until = v.jailUntil; }
    if (!T.jailed) T.cellDoor(true);
    g.hud.alert(t('gang.caught', { name: v.name }));
    g.hud.bigMessage(t('gang.caughtTitle'), t('gang.caughtSub', { name: v.name }));
    sfx.warn ? sfx.warn() : sfx.alert();
  }
  jailedMen() { return this.gang.filter((m) => m.alive && m.jailed); }
  // the cell door blown open (town.js): your men walk out and rejoin you
  breakOut() {
    const T = this.town, C = T.jailB.cell, g = this.game;
    for (const v of this.jailedMen()) {
      v.jailed = false; v.task = null; v.pos.set(C.out.x, C.out.y, C.out.z); v.route = [];
      const m = this.gangSave.find((x) => x.seed === v.seed); if (m) { m.jailed = false; m.until = 0; }
      T.folk.say(v, 'say.gangFreed');
    }
    g.hud.toast(t('gang.freed'), 'pick');
  }
  updateJail() {
    const g = this.game, T = this.town;
    for (const v of this.jailedMen()) if (g.time > v.jailUntil) {
      // served his time: the sheriff lets him go
      v.jailed = false; const C = T.jailB.cell; v.pos.set(C.out.x, C.out.y, C.out.z); v.route = [];
      const m = this.gangSave.find((x) => x.seed === v.seed); if (m) { m.jailed = false; m.until = 0; }
      g.hud.toast(t('gang.released', { name: v.name }));
      if (!this.jailedMen().length && !T.jailed) T.cellDoor(false);
    }
  }
  // a place to stand for each man round a point: on dry, open ground about level
  // with it (a spot in a lake, a wall or up a cliff would leave him stuck)
  ringSpots(c, R) {
    const F = this.town.folk, alive = this.free(), n = alive.length;
    const cy = F.ground(c.x, c.z, c.y + 2) ?? c.y, taken = [];
    alive.forEach((v, i) => {
      let best = null;
      for (const dr of [0, -1, 1, -2, 2, -3]) for (const da of [0, 0.35, -0.35, 0.7, -0.7]) {
        if (best) break;
        const a = i / n * Math.PI * 2 + da, r = Math.max(1.2, R + dr), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const gy = F.ground(x, z, cy + 2);
        if (gy == null || Math.abs(gy - cy) > 2 || !F.free(x, gy, z) || taken.some((q) => Math.hypot(q.x - x, q.z - z) < 1.2)) continue;
        best = { x: Math.floor(x) + 0.5, y: gy, z: Math.floor(z) + 0.5 };
      }
      v.spot = best || { x: c.x, y: cy, z: c.z };
      taken.push(v.spot);
    });
  }
  // who the gang shoots at: anyone fighting you (the posse when it turns hostile, an outlaw who drew)
  // who the gang shoots at: anyone fighting you or them (a hostile posse, a man
  // who drew, whoever fired on one of them) and wild animals coming at you or them
  gangTarget(v) {
    const g = this.game, F = this.town.folk, T = this.town, P = g.player.pos;
    let best = null, bd = 40;
    for (const o of F.list.concat(F.extra)) {
      if (!o.alive || o.gang || o.away || o.cuffed || o.jailed) continue;
      const foe = (o.posse && T.posse && T.posse.hostile) || o.fight || (o.firedOnGang || 0) > performance.now() / 1000;
      if (!foe) continue;
      const d = Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z);
      if (d < bd) { bd = d; best = { ref: o, animal: false }; }
    }
    if (!best) for (const a of g.animals.danger()) {
      const d = Math.min(Math.hypot(a.pos.x - v.pos.x, a.pos.z - v.pos.z), Math.hypot(a.pos.x - P.x, a.pos.z - P.z) + 6);
      if (d < 34 && d < bd) { bd = d; best = { ref: a, animal: true }; }
    }
    return best;
  }
  tgAlive(tg) { return !!tg && (tg.animal ? tg.ref.state !== 'dead' && this.game.animals.list.includes(tg.ref) : tg.ref.alive && !tg.ref.away); }
  // the gang is attacked (or a posse is out for blood): they scatter to cover and fight back
  raiseAlarm(sec = 15) {
    const g = this.game;
    if (!this.gang.some((m) => m.alive && !m.jailed)) return;
    if (!(this.alarm > 0) && !this.quiet) { g.hud.alert(t('gang.underFire')); sfx.warn ? sfx.warn() : sfx.alert(); }
    this.alarm = Math.max(this.alarm || 0, sec);
  }
  memberAi(v, dt, d) {
    const g = this.game, F = this.town.folk, P = g.player.pos, O = this.order;
    if (!v.alive) return true;
    if (v.jailed) {            // behind bars: he paces the cell
      const C = this.town.jailB.cell; v.speed = 0; v.crouch = false;
      if (Math.hypot(v.pos.x - C.inside.x, v.pos.z - C.inside.z) > 1.6) v.pos.set(C.inside.x, C.inside.y, C.inside.z);
      v.yaw += Math.sin(g.time * 600) * dt * 0.5; v.duelAim = false;
      return true;
    }
    if (v.task && v.task.kind === 'loot') return this.lootAi(v, dt);
    if (v.task && v.task.kind === 'brawl') return this.brawlAi(v, dt);
    if (v.giveGun) {                    // bringing you a gun
      const gd = Math.hypot(P.x - v.pos.x, P.z - v.pos.z);
      v.giveGun.t += dt;
      if (gd < 1.8 || v.giveGun.t > 25) { v.speed = 0; v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z)); this.handGun(v); return true; }
      if (gd > 60 && !F.visible(v)) { const a = Math.random() * 6.28, gy = F.ground(P.x + Math.cos(a) * 3, P.z + Math.sin(a) * 3, P.y + 2); if (gy != null) v.pos.set(P.x + Math.cos(a) * 3, gy, P.z + Math.sin(a) * 3); }
      F.goDirect(v, P, gd > 8 ? 6.6 : 3.6, dt, 1.2); v.crouch = false;
      return true;
    }
    if (O.cmd === 'disperse' && v.hideAt) {          // scattered: lying low
      const hd = Math.hypot(v.hideAt.x - v.pos.x, v.hideAt.z - v.pos.z);
      v.target = null; v.duelAim = false;
      if (hd > 1) { F.goDirect(v, v.hideAt, 6.6, dt, 0.8); v.crouch = false; v.hidden = false; if (v.stuckT > 2) { v.hideAt = v.pos.clone(); v.stuckT = 0; } }
      else {
        v.speed = 0; v.crouch = true;
        // hidden once down and no one is close by
        const near = this.town.posse && this.town.posse.members.some((m) => m.alive && m.pos.distanceTo(v.pos) < 12);
        v.hidden = !near;
        if (near) { const m = this.town.posse.members.find((x) => x.alive && x.pos.distanceTo(v.pos) < 12); v.cool -= dt; v.yaw = Math.atan2(-(m.pos.x - v.pos.x), -(m.pos.z - v.pos.z)); if (v.armed !== F.bestGun(v)) F.armed(v, F.bestGun(v)); if (v.cool <= 0) this.gangShoot(v, { ref: m }, m.pos.distanceTo(v.pos)); v.crouch = v.cool > 0.4; }
      }
      return true;
    }
    v.hidden = false;
    v.cool -= dt;
    v.tgtT = (v.tgtT || 0) - dt;
    if (v.tgtT <= 0) { v.tgtT = 0.4; v.target = this.gangTarget(v); if (v.target && !v.target.animal) this.raiseAlarm(12); }
    const tg = this.tgAlive(v.target) ? v.target : null, tp = tg && tg.ref.pos;
    const alive = this.gang.filter((m) => m.alive && !m.jailed && !m.task), i = Math.max(0, alive.indexOf(v)), n = Math.max(1, alive.length);
    let goal = null, run = false;
    // under fire (and you haven't called them back to you): to cover, and fight from there
    const fighting = this.alarm > 0 && !this.quiet;
    if (d > 70 && O.cmd === 'follow' && !fighting) { const a = i / n * 6.28; v.pos.set(P.x + Math.cos(a) * 4, P.y, P.z + Math.sin(a) * 4); v.route = []; }     // they catch up (a long ride, a night's sleep)
    if (fighting) {
      const home = O.cmd === 'hold' && v.spot ? v.spot : v.pos;
      if (!v.coverAt || (v.coverT = (v.coverT || 0) - dt) <= 0 || (tp && Math.hypot(v.coverAt.x - home.x, v.coverAt.z - home.z) > 9)) {
        v.coverAt = this.coverFor(v, tg ? tg.ref : null) || new THREE.Vector3(home.x, home.y, home.z); v.coverT = 8;
      }
      goal = v.coverAt; run = true;
    } else if (O.cmd === 'follow') {
      v.coverAt = null;
      const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw), rx = Math.cos(g.player.yaw), rz = -Math.sin(g.player.yaw);
      const side = (i - (n - 1) / 2) * 1.7;
      goal = { x: P.x - fx * 3 + rx * side, y: P.y, z: P.z - fz * 3 + rz * side };
      run = d > 8;
    } else {
      // Hold here: spread round the spot, guard it, defend themselves
      if (!v.spot) this.ringSpots(O.point, 5);
      const gs = Math.hypot(v.spot.x - v.pos.x, v.spot.z - v.pos.z);
      v.chkT = (v.chkT || 0) - dt;
      if (v.chkT <= 0) {                                    // once a second: closer by half a metre or more?
        v.chkT = 1;
        if (gs > 1.5 && v.spotBest != null && v.spotBest - gs < 0.5) v.spotT = (v.spotT || 0) + 1; else v.spotT = 0;
        v.spotBest = gs;
      }
      if (v.spotT >= 3) {
        // no headway (something in the way): the nearest place on his side of the ring he can really get to
        v.spotT = 0; v.spotBest = null; v.route = [];
        const a = Math.atan2(v.pos.z - O.point.z, v.pos.x - O.point.x), far = Math.hypot(v.pos.x - O.point.x, v.pos.z - O.point.z);
        let got = null;
        for (let r = 5; r < far - 1 && !got; r += 2) {
          const x = O.point.x + Math.cos(a) * r, z = O.point.z + Math.sin(a) * r, gy = F.ground(x, z, v.pos.y + 2);
          if (gy == null || !F.free(x, gy, z)) continue;
          const path = findPath(this.game.world, v.pos, { x, y: gy, z }, 700, true);
          if (path && path.length) { got = { x, y: gy, z }; v.route = path; v.detourT = 6; }
        }
        v.spot = got || { x: v.pos.x, y: v.pos.y, z: v.pos.z };
      }
      goal = v.spot;
      run = gs > 3;
    }
    // keeping up: close by, they head straight for their (moving) place every frame; farther,
    // they find a way round; the farther behind, the faster (a run, then a sprint)
    const gd = goal ? Math.hypot(goal.x - v.pos.x, goal.z - v.pos.z) : 0;
    const sp = gd > 12 ? 7.6 : gd > 6 ? 6.6 : gd > 2.5 || run ? 4.8 : 2.4;
    // left far behind and out of sight (a long gallop, a steep climb): he catches up off-screen
    if (!fighting && (goal && gd > (O.cmd === 'follow' ? 26 : 14) && v.stuckT > 0.8 && !F.visible(v) || (O.cmd === 'follow' && goal && gd > 26 && !F.visible(v)))) { const gy = F.ground(goal.x, goal.z, P.y + 2); if (gy != null && F.free(goal.x, gy, goal.z)) { v.pos.set(goal.x, gy, goal.z); v.route = []; } }
    v.detourT = Math.max(0, (v.detourT || 0) - dt);
    if (goal && gd > 0.9) {
      if (gd < 9 && v.detourT <= 0) {
        v.route = []; F.step(v, goal.x, goal.z, sp, dt, goal.y);
        // blocked (a fence, a wall): plan a real way round and follow it for a while
        if (v.stuckT > 1) { v.stuckT = 0; v.route = findPath(this.game.world, v.pos, goal, 1500, true) || []; v.detourT = v.route.length ? 4 : 0; }
      } else if (v.detourT > 0 && v.route.length) { if (F.walk(v, dt, sp)) v.detourT = 0; }
      else F.goDirect(v, goal, sp, dt, 0.8);
    } else v.speed = 0;
    // in cover: down behind it, up to fire
    v.crouch = fighting && v.speed === 0 && !(tg && v.cool < 0.35);
    // shoot (at men or animals coming at you or them)
    if (tg) {
      const dd = Math.hypot(tp.x - v.pos.x, tp.z - v.pos.z);
      if (v.speed === 0 || dd < 18) v.yaw = Math.atan2(-(tp.x - v.pos.x), -(tp.z - v.pos.z));
      if (v.armed !== F.bestGun(v)) F.armed(v, F.bestGun(v));
      if (v.cool <= 0 && dd < 40) this.gangShoot(v, tg, dd);
    } else if (v.armed && v.cool < -6) F.armed(v, null);
    if (!tg && v.speed === 0 && O.cmd === 'follow' && !fighting) v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z));
    v.duelAim = !!tg;               // (the aim pose of a drawn gun)
    return true;
  }
  coverFor(v, threat) {
    const g = this.game, w = g.world, F = this.town.folk, from = threat ? threat.pos : g.player.pos;
    for (let k = 0; k < 18; k++) {
      const a = Math.random() * 6.28, r = 1.5 + Math.random() * 6;
      const x = v.pos.x + Math.cos(a) * r, z = v.pos.z + Math.sin(a) * r, y = F.ground(x, z, v.pos.y + 1);
      if (y == null || Math.abs(y - v.pos.y) > 2 || !F.free(x, y, z)) continue;
      const dx = from.x - x, dz = from.z - z, L = Math.hypot(dx, dz) || 1;
      if (SOLID[w.get(Math.floor(x + dx / L), Math.floor(y + 0.5), Math.floor(z + dz / L))]) return new THREE.Vector3(Math.floor(x) + 0.5, y, Math.floor(z) + 0.5);
    }
    return null;
  }
  gangShoot(v, tg, dd) {
    const g = this.game, F = this.town.folk, o = tg.ref, tp = o.pos;
    v.cool = 1.0 + Math.random() * 0.8; v.fired = true;
    const gun = v.armed || 'revolver';
    if (gun === 'shotgun' && dd > 26) { v.cool = 0.3; return; }
    sfx.shot(gun === 'lever' ? 'rifle' : gun, Math.max(0.15, 1 - g.player.pos.distanceTo(v.pos) / 60));
    const a = new THREE.Vector3(v.pos.x, v.pos.y + (v.crouch ? 1.0 : 1.45), v.pos.z);
    const b = new THREE.Vector3(tp.x, tp.y + (tg.animal ? o.T.height * 0.6 : 1.2), tp.z);
    const dir = b.clone().sub(a), L = dir.length(); dir.divideScalar(L);
    const blocked = g.world.raycast(a.x, a.y, a.z, dir.x, dir.y, dir.z, L - 0.4, false, 'bullet');
    const tr = F.tracers[F.trI++ % F.tracers.length], pos = tr.l.geometry.attributes.position;
    const end = blocked ? a.clone().addScaledVector(dir, blocked.dist) : b;
    pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true; tr.l.geometry.computeBoundingSphere();
    tr.l.visible = true; tr.t = 0.07;
    if (blocked || Math.random() > Math.max(0.25, (tg.animal ? 0.8 : 0.7) - dd / 70)) return;
    const dmg = gun === 'lever' ? 30 : gun === 'shotgun' ? Math.max(10, 40 - dd) : 22;
    if (tg.animal) { g.animals.hurt(o, dmg * 1.4); return; }
    const killed = F.hurt(o, dmg);
    if (!o.fight && o.alive && !o.posse) { o.fight = { armed: F.bestGun(o) }; }
    // what your gang does is on your head (an outlaw's death is no crime)
    if (!o.extra && !o.posse) this.town.crime(killed ? 'murder' : 'assault', { victim: killed ? null : o, dead: killed ? o : null });
    else if (o.posse && killed) this.town.crime('murder', { dead: o });
  }
  // the alarm fades when no one is shooting; a posse riding out after you is impossible to miss
  updateAlarm(dt) {
    const g = this.game, T = this.town;
    if (this.alarm > 0) { this.alarm -= dt; if (this.alarm <= 0) { this.alarm = 0; this.quiet = false; } }
    const men = this.gang.some((m) => m.alive && !m.jailed);
    if (T.posse && men) {
      if (!this.posseWarned) { this.posseWarned = true; g.hud.bigMessage(t('gang.posseTitle'), t('gang.posseSub', { n: T.posse.members.filter((m) => m.alive).length })); sfx.warn ? sfx.warn() : sfx.alert(); }
      if (T.posse.hostile) this.raiseAlarm(10);
    } else this.posseWarned = false;
  }
  updateGang(dt) {
    const g = this.game, day = Math.floor(g.time);
    if (this.trade !== 'outlaw') return;
    // a new man joins each day while the outlaws think well of you
    if (this.gang.length < this.gangSize() && this.reps.outlaws >= 0 && day !== this.lostDay && day !== this.joinDay) {
      this.joinDay = day;
      const v = this.recruit();
      g.hud.toast(t('gang.joined', { name: v.name }));
    }
  }

  // ---- per frame and saving ---------------------------------------------------------
  update(dt) {
    this.tick -= dt;
    this.updateTraps(dt);
    if (this.tick <= 0) { this.tick = 0.5; this.updateOutlaws(0.5); this.updateGang(0.5); this.updateBrawl(0.5); this.updateJail(); this.updateAlarm(0.5); }
  }
  // the map: traps (gold with a catch), the wanted men's cabins
  mapMarks() {
    const out = [];
    for (const q of this.traps) out.push({ x: q.x, z: q.z, kind: q.state === 'caught' ? 'catch' : 'trap' });
    for (const b of this.open()) { const c = this.cabinOf(b); if (c) out.push({ x: c.x + 3, z: c.z + 3, kind: 'wanted', name: b.name }); }
    return out;
  }
  toSave() {
    return {
      trade: this.trade, reps: this.reps, nextId: this.nextId, cabins: this.cabins, gang: this.gangSave,
      traps: this.traps.map((q) => ({ x: q.x, y: q.y, z: q.z, state: q.state, catch: q.catch || null, t: q.t })),
      bounties: this.bounties.map((b) => ({ ...b, v: undefined, status: b.v && b.v.cuffed ? 'open' : b.status })),
    };
  }
  dispose() {
    for (const q of this.traps) this.dropTrap(q);
    if (this.trapGeo) { for (const k of ['ring', 'jaw', 'plate', 'mat', 'plateMat']) this.trapGeo[k].dispose(); this.trapGeo = null; }
  }
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let q = Math.imul(a ^ a >>> 15, 1 | a); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
}
