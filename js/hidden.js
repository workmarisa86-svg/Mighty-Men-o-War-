// Town Life's hidden places and buried treasure (2.0). The places are carved
// into the world by hiddengen.js: caves, old gold mines (one unsafe: dynamite
// in it brings the roof down), abandoned cabins with a cellar, and a ghost
// town where smugglers' lanterns show at night. Each has a strongbox with
// coins, goods, a note and sometimes a treasure map.
//
// A treasure map marks the exact spot on your town map (X and Y); the chest
// lies straight down under it, 5 to 10 blocks under the ground. Dig it up for a fortune. Maps come
// from strongboxes, from outlaws' pockets, and from a shady stranger who
// waits by the well at night.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

const KIND_R = { cave: 10, mine: 10, cabin: 7, ghost: 22 };
const MAP_PRICE = 60;

export class Hidden {
  constructor(town, saved = {}) {
    this.town = town; this.game = town.game;
    this.places = town.village.hidden || [];
    this.seen = saved.seen || [];              // places you have been to
    this.opened = saved.opened || [];          // strongboxes emptied
    this.maps = saved.maps || [];              // treasure maps: { id, x, y, z, cx, cz, found }
    this.notes = saved.notes || [];            // notes you have read (kept for the goals and quests)
    this.strangerNight = saved.strangerNight ?? -1;
    this.caved = saved.caved || [];            // mines whose roof came down
    this.nextMap = saved.nextMap || 1;
    this.checkT = 0; this.creakT = 20;
    this.stranger = null; this.smugglers = [];
    this.lamps = null;
    // a buried chest is part of the ground: no shovel breaks it open by accident
    const w = this.game.world;
    for (const m of this.maps) if (!m.found && w.inside(m.x, m.y, m.z)) { if (w.get(m.x, m.y, m.z) !== B.SUPPLY) w.set(m.x, m.y, m.z, B.SUPPLY); w.locked[w.idx(m.x, m.y, m.z)] = 1; }
  }
  place(id) { return this.places.find((p) => p.id === id) || null; }
  near(p, pos, extra = 0) { const r = (KIND_R[p.kind] || 8) + extra; return Math.hypot(p.x - pos.x, p.z - pos.z) < r || (p.inner && Math.hypot(p.inner.x - pos.x, p.inner.z - pos.z) < r && Math.abs(p.inner.y - pos.y) < 8); }
  inMine(pos) { return this.places.find((p) => p.kind === 'mine' && p.path.some((q) => Math.hypot(q.x + 0.5 - pos.x, q.z + 0.5 - pos.z) < 3 && Math.abs(q.y - pos.y) < 3)) || null; }

  // ---- strongboxes and buried chests ----------------------------------------------------
  aimTarget(hit) {
    const g = this.game, sel = g.selected();
    if (!hit) return null;
    if (hit.id === B.SUPPLY) {
      const p = this.places.find((q) => q.chest && q.chest.x === hit.x && q.chest.y === hit.y && q.chest.z === hit.z);
      if (p) return this.opened.includes(p.id) ? { a: 'empty', label: t('hid.empty'), run: () => g.hud.toast(t('hid.emptyMsg')) } : { a: 'strongbox', label: t('hid.open'), run: () => this.openBox(p) };
      const m = this.maps.find((q) => !q.found && q.x === hit.x && q.y === hit.y && q.z === hit.z);
      if (m) return { a: 'treasure', label: t('hid.openTreasure'), run: () => this.openTreasure(m) };
    }
    // dynamite against any block that can be broken (rock, earth, wood, a bridge,
    // what you built): blast it. In a bad mine the roof comes down.
    if (sel === 'dynamite' && blastable(hit.id) && !g.world.isLocked(hit.x, hit.y, hit.z)) {
      const pl = this.places.find((q) => (q.kind === 'mine' || q.kind === 'cave') && this.near(q, hit, 30)) || null;
      return { a: 'blast', label: t(pl ? 'hid.blast' : 'hid.blastAny'), run: () => this.lightRock(hit, pl) };
    }
    return null;
  }
  // what is in a strongbox (always the same for that box)
  contents(p) {
    const n = parseInt(p.id.replace(/\D/g, ''), 10) || 0;
    if (p.kind === 'cave') return { coins: 35 + n * 15, items: [['iron', 3], ['meat_cooked', 2]], map: n !== 1, note: 'note.cave' + n };
    if (p.kind === 'mine') return { coins: 40 + n * 20, items: [['gold', 3 + n], ['dynamite', 2]], map: false, note: 'note.mine' + n };
    if (p.kind === 'cabin') return { coins: 20 + n * 15, items: [['bread', 2], [n === 2 ? 'lever' : 'medkit', 1]], map: n !== 0, note: 'note.cabin' + n };
    return { coins: 260, items: [['gold', 4], ['dynamite', 3]], map: true, note: 'note.ghost' };
  }
  openBox(p) {
    const g = this.game, T = this.town, C = this.contents(p);
    if (this.opened.includes(p.id)) return;
    this.opened.push(p.id);
    T.money += C.coins; T.st.earned += C.coins;
    for (const [id, n] of C.items) g.give(id, n);
    let map = null;
    if (C.map) map = this.newMap(p.id);
    if (C.note && !this.notes.includes(C.note)) this.notes.push(C.note);
    g.hud.dirtyHotbar = true; sfx.coins();
    T.frontier && T.frontier.event('box', p);
    g.app.openPanel('found', { title: t('hid.box.' + p.kind), coins: C.coins, items: C.items, map, note: C.note });
  }
  openTreasure(m) {
    const g = this.game, T = this.town, w = g.world;
    if (m.found) return;
    m.found = true;
    w.locked[w.idx(m.x, m.y, m.z)] = 0; w.set(m.x, m.y, m.z, B.AIR);
    const coins = 800 + ((m.id * 7919) % 8) * 100, gold = 4 + (m.id % 3);
    T.money += coins; T.st.earned += coins; g.give('gold', gold);
    T.st.treasure = (T.st.treasure || 0) + 1;
    g.hud.dirtyHotbar = true; sfx.coins(); sfx.done && sfx.done();
    T.frontier && T.frontier.event('treasure', m);
    g.app.openPanel('found', { title: t('hid.treasureTitle'), coins, items: [['gold', gold]], map: null, note: null, rich: true });
  }
  // a new treasure map: a chest buried 5 to 10 blocks deep somewhere out in
  // the country, marked exactly on your map (only the depth is left to find)
  newMap(from) {
    const g = this.game, w = g.world, V = this.town.village, r = Math.random;
    for (let k = 0; k < 200; k++) {
      const a = r() * Math.PI * 2, d = 70 + r() * 160;
      const x = Math.floor(V.cx + Math.cos(a) * d), z = Math.floor(V.cz + Math.sin(a) * d);
      if (x < 20 || z < 20 || x >= w.W - 20 || z >= w.D - 20) continue;
      if (Math.hypot(x - V.cx, z - V.cz) < 95) continue;
      const top = w.surfaceY(x, z) - 1;
      const sb = w.get(x, top, z);
      if (sb !== B.GRASS && sb !== B.DIRT && sb !== B.SAND) continue;
      if (w.get(x, top + 1, z) === B.WATER || this.places.some((p) => Math.hypot(p.x - x, p.z - z) < 30)) continue;
      const depth = 5 + Math.floor(r() * 6), y = top - depth;
      if (y < 4 || w.isLocked(x, y, z)) continue;
      const m = { id: this.nextMap++, x, y, z, cx: x + 0.5, cz: z + 0.5, depth, from, found: false };
      w.set(x, y, z, B.SUPPLY); w.locked[w.idx(x, y, z)] = 1;
      this.maps.push(m);
      const C = coords(m.x, m.z, w);
      g.hud.bigMessage(t('hid.mapTitle'), t('hid.mapSpot', C));
      sfx.done && sfx.done();
      return m;
    }
    return null;
  }

  // ---- dynamite in the rock --------------------------------------------------------------
  lightRock(hit, place) {
    const g = this.game;
    if (!g.has('dynamite')) return;
    g.take('dynamite', 1); g.hud.dirtyHotbar = true;
    this.town.charges.push({ rock: true, place: place ? place.id : null, t: 3, hx: hit.x, hy: hit.y, hz: hit.z, x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 });
    g.hud.alert(t('hid.lit')); sfx.alert();
  }
  blast(c) {
    const g = this.game, w = g.world, T = this.town, P = g.player.pos;
    T.boom(c.x, c.y, c.z);
    const ore = {}, cells = [];
    // a ball about three blocks across: anything that can be broken goes (never what is locked)
    for (let dy = -1; dy <= 1; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if (dx * dx + dy * dy * 1.5 + dz * dz > 4.6) continue;
      const x = c.hx + dx, y = c.hy + dy, z = c.hz + dz, id = w.get(x, y, z);
      if (y < 2 || w.isLocked(x, y, z) || !blastable(id)) continue;
      // iron, gold and charcoal blown loose go straight into your pack (not back into a filled crater)
      if (ORE[id]) ore[ORE[id]] = (ore[ORE[id]] || 0) + 1;
      else cells.push({ x, y, z, id });
      w.set(x, y, z, B.AIR);
    }
    // remembered like a War crater, so it can be filled in again
    if (cells.length > 1 && g.explosives) { g.explosives.craters.push({ cells, x: c.x, y: c.y, z: c.z, r: 3 }); if (g.explosives.craters.length > 40) g.explosives.craters.shift(); }
    T.frontier && T.frontier.blasted && T.frontier.blasted(c);       // (a stagecoach bridge blown?)
    const got = Object.entries(ore);
    if (got.length) {
      for (const [it, n] of got) g.give(it, n);
      g.hud.dirtyHotbar = true;
      g.hud.toast(t('hid.oreOut', { list: got.map(([it, n]) => `${n} ${t('item.' + it)}`).join(', ') }), 'pick');
    }
    const pd = Math.hypot(P.x - c.x, P.y + 1 - c.y, P.z - c.z);
    if (pd < 3.5) g.damage(Math.round(40 * (1 - pd / 3.5)), 'blast', new THREE.Vector3(c.x, c.y, c.z));
    const p = this.place(c.place);
    // the unsafe mine: the old timbers give way and the roof comes down
    if (p && p.kind === 'mine' && (p.unsafe || Math.random() < 0.15)) this.caveIn(p, c);
  }
  caveIn(p, c) {
    const g = this.game, w = g.world, P = g.player.pos;
    const px = Math.floor(P.x), pz = Math.floor(P.z), py = Math.floor(P.y);
    let n = 0;
    for (const q of p.path) {
      if (Math.hypot(q.x - c.x, q.z - c.z) > 9) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let h = 0; h < 3; h++) {
        const x = q.x + dx, y = q.y + h, z = q.z + dz;
        if ((x === px && z === pz && (y === py || y === py + 1)) || w.get(x, y, z) !== B.AIR) continue;        // (never on top of you)
        if (Math.random() < 0.75) { w.set(x, y, z, B.RUBBLE); n++; }
      }
    }
    if (!this.caved.includes(p.id)) this.caved.push(p.id);
    g.shake = Math.max(g.shake, 1.2);
    sfx.explosion(0.8, false);
    g.particles.burst(c.x, c.y + 1, c.z, [0.4, 0.37, 0.34], 40, 5, 1.5);
    if (this.inMine(P)) { g.damage(30, 'cavein'); g.hud.bigMessage(t('hid.caveTitle'), t('hid.caveSub')); }
    else g.hud.alert(t('hid.caveFar'));
    return n;
  }

  // ---- the shady stranger at the well (at night) ---------------------------------------------
  updateStranger() {
    const g = this.game, T = this.town, F = T.folk, V = T.village, P = g.player.pos;
    const night = F.night(), here = { x: V.cx - 4.5, y: V.y, z: V.cz + 11.5 };
    const near = Math.hypot(P.x - here.x, P.z - here.z) < 70;
    if (night && near && !this.stranger) {
      const look = { shirt: 0x2a2a2e, trousers: 0x1e1e20, vest: null, coat: 0x1a1a1c, hat: 'felt', hatColor: 0x121212, hair: 0x1a1612, moustache: true, gunbelt: false };
      const v = T.trades.makeMan(t('hid.strangerName'), 7777, look, here);
      Object.assign(v, { stranger: true, guns: [], money: 30, goods: ['tmap'], brave: 0.2 });
      v.ai = (o) => { if (!o.alive) return true; if (o.surrendered > 0 || o.fight) return false; o.speed = 0; o.yaw = Math.atan2(-(P.x - o.pos.x), -(P.z - o.pos.z)); return true; };
      v.onKill = () => {};
      F.extra.push(v); this.stranger = v;
    } else if (this.stranger && (!night || !near)) {
      const v = this.stranger;
      F.dropRig(v); F.extra = F.extra.filter((x) => x !== v); this.stranger = null;
    }
  }
  buyMap() {
    const g = this.game, T = this.town, night = Math.floor(g.time - 0.25);
    if (this.strangerNight === night) { g.hud.toast(t('hid.strangerNoMore')); return false; }
    if (T.money < MAP_PRICE) { g.hud.toast(t('shop.noMoney')); sfx.error(); return false; }
    T.money -= MAP_PRICE; this.strangerNight = night;
    this.newMap('stranger');
    return true;
  }
  options(p) {
    const out = [], v = this.stranger;
    if (v && v.alive && !(v.surrendered > 0) && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < 3) out.push({ a: 'stranger', label: t('ctx.stranger'), v, run: () => this.game.app.openPanel('stranger', { v }) });
    // a crater close by (yours or anyone's): a button to fill it in, as in War
    const E = this.game.explosives, cr = E && E.craters.length ? E.craterAt(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) : null;
    if (cr) out.push({ a: 'fillcrater', label: t('use.fill'), run: () => { const n = E.fill(cr); if (n) { sfx.place(); this.game.hud.toast(t('use.filled', { n })); } } });
    return out;
  }
  // ---- the ghost town at night: lanterns and smugglers ---------------------------------------
  updateGhost(dt) {
    const g = this.game, T = this.town, F = T.folk, P = g.player.pos, gh = this.place('ghost');
    if (!gh) return;
    const d = Math.hypot(gh.x - P.x, gh.z - P.z), night = F.night();
    // the lanterns: seen from far off at night (the old legend)
    if (night && d < 260) {
      if (!this.lamps) {
        const geo = new THREE.BoxGeometry(0.3, 0.4, 0.3), mat = new THREE.MeshBasicMaterial({ color: 0xffc860 });
        this.lamps = new THREE.Group();
        for (const b of gh.buildings.slice(0, 4)) { const m = new THREE.Mesh(geo, mat); m.position.set((b.x0 + b.x1) / 2 + 0.5, gh.y + 1.4, (b.z0 + b.z1) / 2 + 0.5); this.lamps.add(m); }
        // a soft glow over each lit ruin: seen from far off across the hills
        const cv = document.createElement('canvas'); cv.width = cv.height = 64;
        const cx = cv.getContext('2d'), gr = cx.createRadialGradient(32, 32, 2, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,220,140,1)'); gr.addColorStop(0.35, 'rgba(255,170,60,0.55)'); gr.addColorStop(1, 'rgba(255,140,40,0)');
        cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
        const gm = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, fog: false });
        for (const b of gh.buildings.slice(0, 4)) { const sp = new THREE.Sprite(gm); sp.scale.set(3.2, 3.2, 1); sp.position.set((b.x0 + b.x1) / 2 + 0.5, gh.y + 5.5, (b.z0 + b.z1) / 2 + 0.5); this.lamps.add(sp); }
        g.scene.add(this.lamps);
      }
      this.lamps.visible = true;
      this.lamps.children.forEach((m, k) => { m.visible = (Math.sin(g.time * 900 + k * 2) > -0.6); });
    } else if (this.lamps) this.lamps.visible = false;
    // the smugglers: two men at the cache at night (they draw on anyone who comes close)
    if (night && d < 110 && !this.smugglers.length && !this.opened.includes('ghost') && (this.smuggledNight ?? -1) !== Math.floor(g.time - 0.25)) {
      this.smuggledNight = Math.floor(g.time - 0.25);
      for (let k = 0; k < 2; k++) {
        const look = { shirt: 0x2e2a26, trousers: 0x262420, vest: 0x1a1816, hat: 'felt', hatColor: 0x161412, hair: 0x2a1c12, moustache: k === 0, gunbelt: true };
        const at = { x: gh.x + 0.5 + (k ? 3 : -3), y: gh.y, z: gh.z + 0.5 };
        const v = T.trades.makeMan(t('hid.smuggler') + ' ' + (k + 1), 6100 + k, look, at);
        Object.assign(v, { outlaw: true, smuggler: true, guns: ['revolver', k ? 'lever' : 'shotgun'], money: 25 + k * 20, goods: k ? ['tmap'] : ['dynamite'], brave: 0.85 });
        v.ai = (o, dt2, dd) => {
          if (!o.alive) return true;
          if (o.surrendered > 0 || o.fight) return false;
          if (dd < 26 && F.sees(o, 30)) { if (!o.warned) { o.warned = true; F.say(o, 'say.smuggler', null, 'warn'); o.drawT = 1.6; } }
          if (o.warned && (o.drawT -= dt2) <= 0) { o.fight = { armed: F.bestGun(o) }; F.armed(o, o.fight.armed); o.cool = 0.5; return false; }
          o.idleT = (o.idleT || 0) - dt2;
          if (!o.goal || o.idleT <= 0) { o.idleT = 5 + Math.random() * 6; o.goal = { x: gh.x + (Math.random() - 0.5) * 12, y: gh.y, z: gh.z + (Math.random() - 0.5) * 3 }; }
          if (Math.hypot(o.goal.x - o.pos.x, o.goal.z - o.pos.z) > 0.8) F.goDirect(o, o.goal, 1.4, dt2, 0.7); else o.speed = 0;
          return true;
        };
        v.onHurt = (o) => { if (o.alive && !o.fight) { o.fight = { armed: F.bestGun(o) }; F.armed(o, o.fight.armed); } };
        v.onKill = () => { T.frontier && T.frontier.event('outlawDown', v); };
        F.extra.push(v); this.smugglers.push(v);
      }
    } else if (this.smugglers.length && (!night || d > 150)) {
      for (const v of this.smugglers) if (v.alive || v.looted || d > 150) { F.dropRig(v); F.extra = F.extra.filter((x) => x !== v); }
      this.smugglers = [];
    }
  }

  // ---- per frame -------------------------------------------------------------------------
  update(dt) {
    const g = this.game, T = this.town, P = g.player.pos;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.5;
      for (const p of this.places) if (!this.seen.includes(p.id) && this.near(p, P)) {
        this.seen.push(p.id);
        g.hud.bigMessage(t('hid.found.' + p.kind), t('hid.foundSub', { n: this.seen.length, total: this.places.length }));
        T.frontier && T.frontier.event('place', p);
      }
      this.updateStranger();
      // the bad mine's timbers creak while you are in it
      const m = this.inMine(P);
      if (m && m.unsafe && (this.creakT -= 0.5) <= 0) { this.creakT = 25 + Math.random() * 20; g.hud.toast(t('hid.creak')); sfx.thump && sfx.thump(); }
    }
    this.updateGhost(dt);
  }
  mapMarks() {
    const out = [];
    for (const p of this.places) if (this.seen.includes(p.id) || this.notes.some((n) => n.startsWith('note.') && p.kind === 'ghost' && n === 'note.cabin1')) out.push({ x: p.x, z: p.z, kind: 'place', place: p.kind, label: t('hid.name.' + p.kind) });
    for (const m of this.maps) if (!m.found) out.push({ x: m.x + 0.5, z: m.z + 0.5, kind: 'treasure' });
    return out;
  }
  toSave() { return { seen: this.seen, opened: this.opened, maps: this.maps, notes: this.notes, strangerNight: this.strangerNight, caved: this.caved, nextMap: this.nextMap }; }
  dispose() {
    if (this.lamps) { this.game.scene.remove(this.lamps); this.lamps = null; }
  }
}
// what dynamite can blow apart: anything solid that can be dug (never bedrock,
// water, chests, or the headquarters' and town's locked blocks)
const NO_BLAST = new Set([B.AIR, B.WATER, B.BEDROCK, B.SUPPLY, B.CAMPFIRE, B.FORT_WALL, B.FORT_DOOR, B.FORT_LAMP]);
const ORE = { [B.IRON]: 'iron', [B.GOLD]: 'gold', [B.CHARCOAL]: 'charcoal' };
function blastable(id) { return !!id && !NO_BLAST.has(id) && (SOLID[id] || id === B.LEAVES || id === B.LADDER || id === B.GLASS_BROKEN); }
// the coordinates shown to you: X east, Y north (the map's bottom-left corner is 0, 0)
// the block column you stand in (or the chest is in): the same numbers for both
export function coords(x, z, w) { return { x: Math.floor(x), y: w.D - 1 - Math.floor(z) }; }
export { MAP_PRICE };
