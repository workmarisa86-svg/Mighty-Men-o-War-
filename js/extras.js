// Town Life (2.7): the ranch and home life.
//
// - Farmhands: hire grown men of the town (12 coins a day each). By day they
//   work round your home; every evening the ranch's takings (more with more
//   animals) come in and their wages go out.
// - A bodyguard (any trade but Outlaw; an Outlaw has his gang): hire one in the
//   sheriff's office (20 coins a day). He follows you and shoots robbers,
//   outlaws, bounty hunters and wild beasts. Can't pay him: he leaves.
// - Alarm bells (general store): ring when a robber, an outlaw or a wolf comes
//   within a few blocks. Gun slits: a wall block bullets go through.
// - A guard dog (stable): lives at your home and barks at robbers and wolves.
// - Gossip: townsfolk talk about what you've done when you pass.
// - Weather: in a storm the radar sees only close by; in the snow you leave
//   tracks (and robbers follow them: they find you sooner).
// - Renting out houses: a house you own but don't live in can be rented out
//   (the rent comes in every evening).
import * as THREE from 'three';
import { B } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { DESIGNS } from './houses.js';

const HAND_PAY = 12, GUARD_PAY = 20, MAX_HANDS = 3;

export class Extras {
  constructor(town, saved = {}) {
    this.T = town; this.game = town.game;
    this.hands = saved.hands || [];                // townsfolk (person index) working for you
    this.guard = saved.guard || null;              // { seed } your bodyguard
    this.bells = saved.bells || [];                // [x, y, z]
    this.dogs = saved.dogs || 0;
    this.payDay = saved.payDay ?? Math.floor(this.game.time);
    this.tick = 0; this.gossipT = 30; this.prints = []; this.lastPrint = null; this.dogT = 0;
    this.guardMan = null; this.dogAnimals = [];
    for (const i of this.hands) { const v = town.folk.list[i]; if (v) this.makeHand(v); }
  }
  home() { const c = this.game.cabin; return c && c.site ? c.site : null; }

  // ---- farmhands ---------------------------------------------------------------------------
  canHire(v) { return v && v.alive && !v.away && !v.female && !v.extra && v.role !== 'keeper' && v.role !== 'sheriff' && !v.posse && !v.fight && !(v.surrendered > 0) && !this.hands.includes(v.i) && this.hands.length < MAX_HANDS && !!this.home(); }
  hire(v) {
    const g = this.game;
    if (!this.canHire(v)) return;
    this.hands.push(v.i); this.makeHand(v);
    this.T.folk.say(v, 'ext.handYes');
    g.hud.toast(t('ext.hired', { name: v.name, n: HAND_PAY }), 'pick');
  }
  fire(v) { this.hands = this.hands.filter((i) => i !== v.i); v.ai = null; v.farmhand = false; this.T.folk.say(v, 'ext.handBye'); }
  makeHand(v) {
    v.farmhand = true;
    v.ai = (o, dt) => this.handAi(o, dt);
  }
  // by day at your place (round the house, the garden, the pen); at night home to bed
  handAi(v, dt) {
    const F = this.T.folk, s = this.home();
    if (!v.alive || !s || F.night() || v.posse || v.fight || v.reportTo || v.huntAnimal || v.huntMan || v.surrendered > 0) return false;
    if (!v.work2 || (v.workT = (v.workT || 0) - dt) <= 0) { const a = Math.random() * 6.28, r = s.r + 2 + Math.random() * 4; v.work2 = { x: s.x + 0.5 + Math.cos(a) * r, y: s.y, z: s.z + 0.5 + Math.sin(a) * r }; v.workT = 20 + Math.random() * 20; v.route = []; }
    const d = Math.hypot(v.work2.x - v.pos.x, v.work2.z - v.pos.z);
    if (d > 1.5) { F.goDirect(v, v.work2, d > 20 ? 4.6 : 2.2, dt, 1.2); v.crouch = false; }
    else { v.speed = 0; v.crouch = Math.sin(this.game.time * 600 + v.i) > 0.2; }       // bent over the work now and then
    return true;
  }

  // ---- the bodyguard -------------------------------------------------------------------------
  hireGuard() {
    const g = this.game, T = this.T;
    if (this.guard || T.trades.trade === 'outlaw') return;
    if (T.money < GUARD_PAY) { g.hud.toast(t('ext.noMoney', { n: GUARD_PAY })); sfx.error(); return; }
    T.money -= GUARD_PAY;
    this.guard = { seed: 9800 + Math.floor(Math.random() * 99) };
    this.spawnGuard(); g.hud.toast(t('ext.guardHired', { n: GUARD_PAY }), 'pick'); sfx.coins();
  }
  spawnGuard() {
    const g = this.game, F = this.T.folk, P = g.player.pos;
    const x = P.x + 2, z = P.z + 2, y = F.ground(x, z, P.y + 3) ?? P.y;
    const look = { shirt: 0x4a5a6a, trousers: 0x2a2a2e, vest: 0x2a2420, hat: 'felt', hatColor: 0x2a2018, hair: 0x3a2a1c, moustache: true, gunbelt: true, star: true };
    const v = this.T.trades.makeMan(t('ext.guardName'), this.guard.seed, look, { x, y, z });
    Object.assign(v, { bodyguard: true, guns: ['lever', 'revolver'], money: 0, goods: [], brave: 1, hp: 200 });
    v.ai = (o, dt, d) => this.guardAi(o, dt, d);
    v.onKill = () => { this.guard = null; this.guardMan = null; g.hud.alert(t('ext.guardDown')); };
    F.armed(v, 'lever');
    F.extra.push(v); this.guardMan = v;
  }
  dismissGuard() { const F = this.T.folk, v = this.guardMan; if (v) { F.dropRig(v); v.away = true; v.alive = false; } this.guard = null; this.guardMan = null; }
  guardAi(v, dt, d) {
    const g = this.game, F = this.T.folk, P = g.player.pos;
    if (!v.alive) return true;
    if (this.T.posse && this.T.posse.hostile) { this.game.hud.toast(t('ext.guardQuits')); this.dismissGuard(); return true; }
    // a threat close by: shoot it (the townsfolk's own fighting code does the shooting)
    v.scanT = (v.scanT || 0) - dt;
    if (v.scanT <= 0) {
      v.scanT = 0.5;
      const foe = F.extra.find((o) => o !== v && o.alive && !o.away && !o.gang && !o.posse && !(o.surrendered > 0) && o.fight && (o.robber || o.rival || o.outlaw || o.hunter) && o.pos.distanceTo(v.pos) < 40);
      v.huntMan = foe || null;
      const beast = !foe && g.animals.danger().find((a) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) < 30);
      v.huntAnimal = beast || null;
    }
    if (v.huntMan || v.huntAnimal) return false;
    // follow you, a few steps behind (brought along if left far behind)
    if (d > 45 && !F.visible(v)) { const gy = F.ground(P.x + 2, P.z + 2, P.y + 3); if (gy != null) { v.pos.set(P.x + 2, gy, P.z + 2); v.route = []; } }
    if (d > 3.5) F.goDirect(v, P, d > 10 ? 5.6 : 3.4, dt, 3); else { v.speed = 0; v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z)); }
    return true;
  }

  // ---- bells (placed blocks) -------------------------------------------------------------------
  onPlace(x, y, z, id) { if (id === B.BELL) this.bells.push([x, y, z]); }
  onBreak(x, y, z, id) { if (id === B.BELL) this.bells = this.bells.filter(([a, b, c]) => a !== x || b !== y || c !== z); }
  checkBells() {
    const g = this.game, F = this.T.folk, w = g.world;
    this.bells = this.bells.filter(([x, y, z]) => w.get(x, y, z) === B.BELL);
    if (!this.bells.length) return;
    const foes = F.extra.filter((o) => o.alive && !o.away && (o.robber || o.rival || (o.outlaw && !o.cuffed) || o.hunter || (o.posse && this.T.posse && this.T.posse.hostile))).map((o) => o.pos)
      .concat(g.animals.list.filter((a) => a.state !== 'dead' && (a.type === 'wolf' || a.type === 'bear')).map((a) => a.pos));
    for (const b of this.bells) {
      if ((b.rung || 0) > g.time) continue;
      if (foes.some((p) => Math.hypot(p.x - b[0] - 0.5, p.z - b[2] - 0.5) < 7 && Math.abs(p.y - b[1]) < 6)) {
        b.rung = g.time + 0.015;
        const d = Math.hypot(g.player.pos.x - b[0], g.player.pos.z - b[2]);
        sfx.bell(Math.max(0.35, 1 - d / 120)); if (d < 300) sfx.bell(Math.max(0.3, 0.9 - d / 120));
        g.hud.alert(t('ext.bell'));
      }
    }
  }

  // ---- guard dogs ------------------------------------------------------------------------------
  buyDog() {
    const g = this.game, T = this.T, s = this.home();
    if (!s) return;
    if (T.money < 30) { g.hud.toast(t('ext.noMoney', { n: 30 })); sfx.error(); return; }
    T.money -= 30; this.dogs++; this.spawnDogs(); sfx.coins();
    g.hud.toast(t('ext.dogBought'), 'pick');
  }
  spawnDogs() {
    const g = this.game, s = this.home();
    if (!s || !g.animals) return;
    this.dogAnimals = this.dogAnimals.filter((a) => a.state !== 'dead' && g.animals.list.includes(a));
    const pen = { x0: s.x - s.r - 5, x1: s.x + s.r + 5, z0: s.z - s.r - 5, z1: s.z + s.r + 5 };
    while (this.dogAnimals.length < this.dogs) {
      const a = g.animals.addLivestock('dog', pen, 'dog', { x: s.x + s.r + 2, z: s.z + 0.5 });
      a.guard = true; this.dogAnimals.push(a);
    }
  }
  checkDogs(dt) {
    const g = this.game, F = this.T.folk;
    const before = this.dogAnimals.length;
    this.dogAnimals = this.dogAnimals.filter((a) => a.state !== 'dead' && g.animals.list.includes(a));
    if (this.dogAnimals.length < before) { this.dogs = this.dogAnimals.length; g.hud.toast(t('ext.dogDead')); }
    this.dogT -= dt;
    if (this.dogT > 0 || !this.dogAnimals.length) return;
    for (const dog of this.dogAnimals) {
      const near = F.extra.some((o) => o.alive && !o.away && (o.robber || o.rival || o.outlaw || o.hunter) && o.pos.distanceTo(dog.pos) < 28)
        || g.animals.list.some((a) => a.state !== 'dead' && (a.type === 'wolf' || a.type === 'bear') && a.pos.distanceTo(dog.pos) < 28);
      if (near) {
        this.dogT = 6;
        const d = g.player.pos.distanceTo(dog.pos);
        sfx.yelp(Math.max(0.3, 1 - d / 90)); setTimeout(() => sfx.snarl(Math.max(0.25, 0.9 - d / 90)), 250);
        if (d > 12) g.hud.toast(t('ext.dogBarks'));
        return;
      }
    }
    this.dogT = 1;
  }

  // ---- gossip ----------------------------------------------------------------------------------
  gossip(dt) {
    const g = this.game, T = this.T, F = T.folk, P = g.player.pos;
    this.gossipT -= dt;
    if (this.gossipT > 0) return;
    this.gossipT = 35 + Math.random() * 30;
    const v = F.list.filter((o) => o.alive && !o.away && !o.posse && !o.fight && !o.reportTo && !o.sleeping && !o.farmhand && o.pos.distanceTo(P) < 12 && o.pos.distanceTo(P) > 2.5)[0];
    if (!v) return;
    const st = T.st, fr = T.frontier && T.frontier.st, said = [];
    if (T.bounty > 0) said.push(['ext.gos.bounty', { n: T.bounty }]);
    if (T.honor >= 70) said.push(['ext.gos.good', {}]);
    if (T.honor < 30) said.push(['ext.gos.bad', {}]);
    if (fr && fr.rivalsBeaten > 2) said.push(['ext.gos.rivals', { n: fr.rivalsBeaten }]);
    if (st.treasure) said.push(['ext.gos.treasure', {}]);
    if (T.money + (T.frontier && T.frontier.bank ? T.frontier.bank.balance : 0) > 2500) said.push(['ext.gos.rich', {}]);
    if (T.train && T.train.robbedDay != null && T.train.robbedDay > g.time - 3) said.push(['ext.gos.train', {}]);
    if (this.hands.length) said.push(['ext.gos.ranch', { n: this.hands.length }]);
    if (st.jailed) said.push(['ext.gos.jail', { n: st.jailed }]);
    if (!said.length) said.push(['ext.gos.new', {}]);
    const [key, vars] = said[Math.floor(Math.random() * said.length)];
    F.say(v, key, vars);
  }

  // ---- weather: storms and snow tracks ----------------------------------------------------------
  storm() { const g = this.game; return !this.T.snowing() && g.weather && g.weather.rain > 0.65; }
  tracks() {
    const g = this.game, P = g.player.pos, w = g.world;
    if (!this.printMesh) {
      const geo = new THREE.PlaneGeometry(0.22, 0.34); geo.rotateX(-Math.PI / 2);
      this.printMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.55, depthWrite: false }), 120);
      this.printMesh.count = 0; this.printMesh.frustumCulled = false; g.scene.add(this.printMesh);
    }
    // (old tracks fill in with new snow; none outside winter)
    this.prints = this.prints.filter((q) => g.time - q.t < 0.08 && this.T.snowing());
    const P0 = this.lastPrint, under = w.get(Math.floor(P.x), Math.floor(P.y - 0.05), Math.floor(P.z));
    if (this.T.snowing() && g.player.onGround !== false && under !== B.AIR && under !== B.WATER && (!P0 || Math.hypot(P.x - P0.x, P.z - P0.z) > 0.8)) {
      const side = (this.prints.length % 2 ? 1 : -1) * 0.14, yaw = g.player.yaw;
      this.prints.push({ x: P.x + Math.cos(yaw) * side, y: Math.floor(P.y) + 0.02, z: P.z - Math.sin(yaw) * side, yaw, t: g.time });
      if (this.prints.length > 120) this.prints.shift();
      this.lastPrint = { x: P.x, z: P.z };
    }
    const m = this.printMesh, M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    this.prints.forEach((q, k) => { Q.setFromAxisAngle(up, q.yaw); M.compose(new THREE.Vector3(q.x, q.y, q.z), Q, S); m.setMatrixAt(k, M); });
    m.count = this.prints.length; m.instanceMatrix.needsUpdate = true;
  }

  // ---- renting out houses ----------------------------------------------------------------------
  rentOf(h) { return Math.max(3, Math.round(DESIGNS[h.design].value * 0.006)); }
  rentOut(h) { if (h.id === this.T.houses.homeId || h.taken != null) return; h.rented = true; this.game.hud.toast(t('ext.rented', { n: this.rentOf(h) }), 'pick'); }
  stopRent(h) { h.rented = false; }

  // ---- every evening: wages out, takings and rent in --------------------------------------------
  payday() {
    const g = this.game, T = this.T, F = T.folk;
    const day = Math.floor(g.time - 18 / 24);            // (pay comes at six in the evening)
    if (day <= this.payDay) return;
    this.payDay = day;
    let wages = 0, takings = 0, rent = 0;
    const animals = g.animals.list.filter((a) => a.owner === 'player' && a.state !== 'dead').length;
    for (const i of this.hands.slice()) {
      const v = F.list[i];
      if (!v || !v.alive) { this.hands = this.hands.filter((x) => x !== i); continue; }
      wages += HAND_PAY; takings += 14 + Math.min(6, animals) * 3;
    }
    if (this.guard) wages += GUARD_PAY;
    for (const h of T.houses.homes) if (h.rented) rent += this.rentOf(h);
    if (!wages && !rent) return;
    T.money += takings + rent;
    if (T.money < wages) {
      // can't pay: they quit
      for (const i of this.hands) { const v = F.list[i]; if (v) this.fire(v); }
      this.hands = []; if (this.guard) this.dismissGuard();
      g.hud.bigMessage(t('ext.payTitle'), t('ext.cantPay')); return;
    }
    T.money -= wages; T.st.earned += takings + rent;
    g.hud.bigMessage(t('ext.payTitle'), t('ext.paySub', { takings, rent, wages, net: takings + rent - wages }));
  }

  // ---- what you can do here --------------------------------------------------------------------
  options(p) {
    const T = this.T, F = T.folk, out = [];
    const v = F.nearest(p, 3, (o) => !o.extra);
    if (v && this.canHire(v)) out.push({ a: 'hire', label: t('ext.hire', { n: HAND_PAY }), v, run: () => this.hire(v) });
    if (v && v.farmhand) out.push({ a: 'firehand', label: t('ext.fire'), v, run: () => this.fire(v) });
    const hall = T.village.buildings.find((b) => b.type === 'hall');
    if (hall && !T.jailed && T.trades.trade !== 'outlaw' && p.x > hall.x0 && p.x < hall.x1 + 1 && p.z > hall.z0 && p.z < hall.z1 + 1 && Math.abs(p.y - hall.door.y) < 3)
      out.push(this.guard ? { a: 'guardoff', label: t('ext.guardOff'), run: () => this.dismissGuard() } : { a: 'guard', label: t('ext.guardHire', { n: GUARD_PAY }), run: () => this.hireGuard() });
    const stable = T.village.buildings.find((b) => b.type === 'stable');
    if (stable && this.home() && Math.hypot(p.x - stable.door.x, p.z - stable.door.z) < 9) out.push({ a: 'dog', label: t('ext.dogBuy', { n: 30 }), run: () => this.buyDog() });
    return out;
  }

  update(dt) {
    const g = this.game;
    this.tick -= dt;
    this.tracks();
    if (this.tick > 0) return;
    this.tick = 0.5;
    if (this.guard && (!this.guardMan || !this.guardMan.alive) && !this.T.jailed) this.spawnGuard();
    if (this.dogs && this.dogAnimals.length < this.dogs && g.animals && !this.dogsTried) { this.dogsTried = true; this.spawnDogs(); }
    this.checkBells(); this.checkDogs(0.5); this.gossip(0.5); this.payday();
  }
  toSave() { return { hands: this.hands, guard: this.guard, bells: this.bells.map(([x, y, z]) => [x, y, z]), dogs: this.dogs, payDay: this.payDay }; }
}
