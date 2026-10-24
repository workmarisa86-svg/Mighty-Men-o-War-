// Town Life: houses, the land office, blueprints and doors.
//
// The land office on Main Street sells five houses, from a small cabin to a
// mansion; the better ones need a good name in town (honor) or the
// merchants' good opinion. Buy one built, on one of the lots the office
// offers (four along Main Street, four out in the country): it stands there
// when you arrive, with your bed and your chest in it, and it is your home
// (you wake up there; your chest's contents move with you). Or buy only the
// supplies (cheaper): the office gives you every block it takes and a
// blueprint you set down wherever you like: see-through ghost blocks show
// where each block goes and tick off as you place them; when the last one is
// in, the house is yours and your home.
// Your old home: sell it at the land office once you have a new one, or
// leave it; left empty for a while, a gang moves into it (clear them out to
// get it back).
// Doors: a plank door (bought or crafted) is two blocks high; aim at it and
// use it to open or close it. Only you (and your gang) use your doors;
// dynamite blows one open.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { civLook } from './characters.js';

// the item that places each block (for "buy the supplies")
const ITEM_OF = { [B.WOOD]: 'wood', [B.STONE]: 'stone', [B.BRICK]: 'brick', [B.GLASS]: 'glass', [B.THATCH]: 'thatch', [B.FENCE]: 'fence', [B.DOOR]: 'door', [B.LADDER]: 'ladder' };
const GHOST_MAX = 900;

// A house, made of blocks in its own frame: x across (0..w-1), z from the
// back (0) to the front wall (d-1, the door), y up from the floor (0).
function makeHouse({ w, d, floors = 1, wall, upper = wall, roof, porch = false, front = false, chimney = false }) {
  const out = [], H = 4;
  const put = (x, y, z, id) => out.push([x, y, z, id]);
  const top = floors * H;
  const mid = Math.floor((w - 1) / 2);
  for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
    put(x, -1, z, B.WOOD);                                       // the plank floor
    const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
    for (let y = 0; y < top; y++) {
      if (!edge) { if (floors > 1 && y === H && !(x === 1 && z === 1)) put(x, y, z, B.WOOD); continue; }   // the upstairs floor (a hole for the ladder)
      const door = z === d - 1 && (x === mid) && y < 2;
      if (door) { put(x, y, z, B.DOOR); continue; }
      const win = (y % H === 1 || y % H === 2) && ((z === 0 || z === d - 1) ? (x % 3 === 1 && x !== mid) : (z % 3 === 1)) && x !== 0 && x !== w - 1 || ((x === 0 || x === w - 1) && (y % H === 1 || y % H === 2) && z % 3 === 1 && z !== 0 && z !== d - 1);
      put(x, y, z, win ? B.GLASS : y >= H ? upper : wall);
    }
  }
  if (floors > 1) for (let y = 0; y < H + 1; y++) put(1, y, 1, B.LADDER);   // up to the second floor
  // a pitched roof along the width
  const span = d + 1, rise = Math.ceil(span / 2);
  for (let k = 0; k <= rise; k++) for (let x = -1; x <= w; x++) for (let z = -1; z <= d; z++) {
    const tz = Math.min(z + 1, d - z);
    if (tz === k || (tz > k && k === rise)) put(x, top + k, z, roof);
    else if (tz > k && (x === 0 || x === w - 1) && x >= 0 && x < w && z >= 0 && z < d) put(x, top + k, z, upper);     // gable ends
  }
  if (front) for (let x = 0; x < w; x++) for (let y = top; y <= top + rise + 1; y++) put(x, y, d - 1, (x === 0 || x === w - 1) && y === top + rise + 1 ? B.AIR : B.WOOD);
  if (porch) {
    for (let x = -1; x <= w; x++) put(x, -1, d, B.WOOD);
    for (const x of [-1, w]) for (let y = 0; y < 3; y++) put(x, y, d + 1, B.FENCE);
    for (let x = -1; x <= w; x++) { put(x, -1, d + 1, B.WOOD); put(x, 3, d, B.WOOD); put(x, 3, d + 1, B.WOOD); }
  }
  if (chimney) for (let y = 0; y < top + rise + 2; y++) put(w - 1, y, 1, B.BRICK);
  // inside: the bed by the back wall, the chest beside it
  const bed = [w - 2 - (chimney ? 1 : 0), 0, 1.5], chest = [Math.max(1, mid - 1), 0, 1];
  // later blocks win (the door, the windows over the walls)
  const map = new Map();
  for (const [x, y, z, id] of out) map.set(`${x},${y},${z}`, [x, y, z, id]);
  return { w: w + 2, d: d + 2, blocks: [...map.values()], bed, chest, door: [mid, d - 1] };
}
export const DESIGNS = {
  cabin: { price: 70, honor: 0, merchants: -100, value: 50, plan: () => makeHouse({ w: 5, d: 5, wall: B.WOOD, roof: B.THATCH }) },
  farmhouse: { price: 160, honor: 30, merchants: -100, value: 110, plan: () => makeHouse({ w: 7, d: 7, wall: B.WOOD, roof: B.THATCH, porch: true }) },
  twostory: { price: 330, honor: 45, merchants: -20, value: 230, plan: () => makeHouse({ w: 8, d: 7, floors: 2, wall: B.BRICK, upper: B.WOOD, roof: B.THATCH, chimney: true }) },
  saloon: { price: 450, honor: 40, merchants: 20, value: 320, plan: () => makeHouse({ w: 9, d: 7, floors: 2, wall: B.WOOD, roof: B.WOOD, front: true, porch: true }) },
  mansion: { price: 900, honor: 65, merchants: 0, value: 640, plan: () => makeHouse({ w: 9, d: 8, floors: 2, wall: B.BRICK, upper: B.BRICK, roof: B.STONE, porch: true, chimney: true }) },
};
export const DESIGN_IDS = Object.keys(DESIGNS);
const SUPPLY_K = 0.6;                     // supplies cost this much of the built price

// turn a house's own frame (door toward +z) to face a direction (0: +z, 1: -x, 2: -z, 3: +x)
function turn(x, z, rot, w, d) {
  switch (rot & 3) {
    case 0: return [x, z];
    case 1: return [z, w - 1 - x];
    case 2: return [w - 1 - x, d - 1 - z];
    default: return [d - 1 - z, x];
  }
}

export class Houses {
  constructor(town, saved = {}) {
    this.town = town; this.game = town.game;
    const V = town.village;
    this.lots = (V.lots || []).map((q, i) => ({ id: 'town' + i, x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, y: q.y, side: q.side, town: true }));
    for (const q of saved.country || []) this.lots.push(q);
    for (const s of saved.lots || []) { const q = this.lots.find((l) => l.id === s.id); if (q) Object.assign(q, s); }
    this.homes = saved.homes || [];                 // houses you own: { id, design, x, y, z, rot, lot }
    this.homeId = saved.homeId || null;             // the one you live in (null: the old cottage)
    this.cottageSold = !!saved.cottageSold;
    this.cottageTaken = !!saved.cottageTaken;
    this.leftT = saved.leftT ?? null;               // when you moved out of the cottage (a gang may move in)
    this.bp = saved.bp || null;                     // a blueprint being built: { design, x, y, z, rot }
    this.ghost = null; this.ghostT = 0; this.placing = null;
    if (!saved.country) this.makeCountryLots();
    this.applyHome();
    if (this.bp) this.showGhost();
  }
  // four lots out in the country: flat, dry, away from the town and the homes
  makeCountryLots() {
    const g = this.game, w = g.world, V = this.town.village, C = this.town.cottage;
    const rnd = mulberry(g.cfg.seed + 4242);
    const homes = V.buildings.filter((b) => b.type === 'house');
    let n = 0;
    for (let k = 0; k < 400 && n < 4; k++) {
      const a = rnd() * Math.PI * 2, r = 110 + rnd() * 110;
      const x = Math.floor(V.cx + Math.cos(a) * r), z = Math.floor(V.cz + Math.sin(a) * r);
      if (x < 20 || z < 20 || x > w.W - 32 || z > w.D - 32) continue;
      if (Math.hypot(x - C.x, z - C.z) < 50 || homes.some((b) => Math.hypot(b.inside.x - x, b.inside.z - z) < 40) || this.lots.some((q) => Math.hypot(q.x0 - x, q.z0 - z) < 40)) continue;
      const y0 = w.surfaceY(x, z);
      let ok = true;
      for (let dx = 0; dx <= 12 && ok; dx += 3) for (let dz = 0; dz <= 12 && ok; dz += 3) {
        const y = w.surfaceY(x + dx, z + dz);
        if (Math.abs(y - y0) > 2 || w.get(x + dx, y + 1, z + dz) === B.WATER || w.get(x + dx, y, z + dz) === B.WATER || w.get(x + dx, y, z + dz) === B.LEAVES || w.get(x + dx, y, z + dz) === B.LOG) ok = false;
      }
      if (!ok) continue;
      this.lots.push({ id: 'country' + n, x0: x, z0: z, x1: x + 12, z1: z + 12, y: y0 + 1, side: 's', town: false });
      n++;
    }
  }
  // ---- your home: bed, chest, where you wake up ----
  home() { return this.homes.find((h) => h.id === this.homeId) || null; }
  applyHome() {
    const g = this.game, h = this.home(), cab = g.cabin;
    if (!cab || !cab.site) return;
    if (!this.cottageHome) this.cottageHome = { bed: { ...cab.site.bed }, chest: { ...cab.site.chest }, x: cab.site.x, y: cab.site.y, z: cab.site.z, r: cab.site.r };
    const C = h ? this.spots(h) : this.cottageHome;
    cab.site.bed = { ...C.bed }; cab.site.chest = { ...C.chest };
    cab.site.x = C.x; cab.site.y = C.y; cab.site.z = C.z; cab.site.r = C.r;
    if (cab.mesh) { cab.mesh.position.set(C.bed.x, C.bed.y, C.bed.z); cab.mesh.rotation.y = C.bedYaw || 0; cab.mesh.visible = !(h && h.taken != null); }   // (a taken house has its own bed)
  }
  // a village house taken at gunpoint (frontier.js): its own double bed is yours
  // now; your chest stays where it was
  addTaken(idx, move = true) {
    const g = this.game, b = this.town.village.buildings[idx];
    if (!b || !b.furn || this.homes.some((h) => h.taken === idx)) return null;
    const ch = g.cabin && g.cabin.site ? g.cabin.site.chest : this.town.cottage.chest;
    const h = { id: 'taken' + idx, taken: idx, design: 'taken', x: b.x0, y: this.town.village.y, z: b.z0, chest: { ...ch } };
    this.homes.push(h);
    if (move) this.moveInto(h);
    return h;
  }
  // a house's bed, chest, middle and size in the world
  spots(h) {
    if (h.taken != null) {
      const b = this.town.village.buildings[h.taken], bd = b.furn.beds[0], y = this.town.village.y;
      return { bed: { x: bd.pos.x, y, z: bd.pos.z }, wake: { x: bd.foot.x, y, z: bd.foot.z }, chest: { ...h.chest }, x: Math.floor(b.inside.x), y, z: Math.floor(b.inside.z), r: Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2, bedYaw: 0 };
    }
    const P = DESIGNS[h.design].plan(), at = (q) => { const [a, c] = turn(q[0], q[2], h.rot, P.w - 2, P.d - 2); return { x: h.x + a, y: h.y + q[1], z: h.z + c }; };
    const bed = at(P.bed), chest = at(P.chest), mid = at([(P.w - 2) / 2, 0, (P.d - 2) / 2]);
    bed.x += 0.5; bed.z += 0.5;
    return { bed, chest: { x: Math.floor(chest.x), y: chest.y, z: Math.floor(chest.z) }, x: Math.floor(mid.x), y: h.y, z: Math.floor(mid.z), r: Math.max(P.w, P.d) / 2, bedYaw: (h.rot & 3) * Math.PI / 2 };
  }
  wakeSpot() { const h = this.home(); if (!h) return null; const S = this.spots(h); return S.wake || { x: S.bed.x + 1, y: S.bed.y, z: S.bed.z }; }
  moveInto(h) {
    const g = this.game;
    const wasCottage = !this.homeId;
    this.homeId = h.id;
    this.applyHome();
    const S = this.spots(h);
    g.world.set(S.chest.x, S.chest.y, S.chest.z, B.SUPPLY);
    if (wasCottage && !this.cottageSold) this.leftT = g.time;
    g.hud.bigMessage(t('house.movedIn'), t('house.movedInSub'));
    sfx.done();
  }

  // ---- what you can buy ----
  allowed(id) {
    const D = DESIGNS[id], T = this.town;
    if (T.honor < D.honor) return t('house.needHonor', { n: D.honor });
    if (T.trades.reps.merchants < D.merchants) return t('house.needMerchants', { n: D.merchants });
    return null;
  }
  price(id, supplies = false) { return Math.round(DESIGNS[id].price * (supplies ? SUPPLY_K : 1) * this.town.trades.priceK('house', true)); }
  freeLots(id) {
    const P = DESIGNS[id].plan();
    return this.lots.filter((q) => !q.owner && (q.x1 - q.x0 + 1) >= P.w - 2 && (q.z1 - q.z0 + 1) >= P.d - 2);
  }
  buyBuilt(id, lotId) {
    const g = this.game, T = this.town, q = this.lots.find((l) => l.id === lotId);
    const why = this.allowed(id); if (why) { g.hud.toast(why); sfx.error(); return false; }
    const cost = this.price(id);
    if (!q || q.owner) return false;
    if (T.money < cost) { g.hud.toast(t('shop.noMoney')); sfx.error(); return false; }
    T.money -= cost;
    const P = DESIGNS[id].plan(), W = P.w - 2, Dd = P.d - 2;
    // set in the middle of the lot, the door toward the street (south-side lots face north)
    const rot = q.side === 'n' ? 2 : 0;
    const x = q.x0 + Math.floor(((q.x1 - q.x0 + 1) - W) / 2), z = q.z0 + Math.floor(((q.z1 - q.z0 + 1) - Dd) / 2);
    const h = { id: 'h' + Date.now().toString(36), design: id, x, y: q.y, z, rot, lot: q.id };
    this.build(h, true);
    q.owner = 'player'; q.home = h.id;
    this.homes.push(h);
    this.moveInto(h);
    T.st.houses = (T.st.houses || 0) + 1;
    sfx.coins();
    return true;
  }
  // every block of a house in the world (and the ground made level under it)
  build(h, full) {
    const w = this.game.world, P = DESIGNS[h.design].plan(), W = P.w - 2, Dd = P.d - 2;
    if (full) {
      for (let a = -2; a < W + 2; a++) for (let c = -2; c < Dd + 3; c++) {
        const [dx, dz] = turn(a, c, h.rot, W, Dd), X = h.x + dx, Z = h.z + dz;
        for (let y = h.y; y < h.y + 14; y++) if (w.get(X, y, Z) !== B.AIR) w.set(X, y, Z, B.AIR);
        for (let y = h.y - 4; y < h.y; y++) if (!SOLID[w.get(X, y, Z)]) w.set(X, y, Z, B.DIRT);
      }
    }
    for (const [a, y, c, id] of P.blocks) {
      if (id === B.AIR) continue;
      const [dx, dz] = turn(a, c, h.rot, W, Dd);
      w.set(h.x + dx, h.y + y, h.z + dz, id);
    }
  }

  // ---- buy the supplies and build it yourself (with a blueprint) ----
  needs(id) {
    const out = {};
    for (const [, , , bid] of DESIGNS[id].plan().blocks) { const it = ITEM_OF[bid]; if (it) out[it] = (out[it] || 0) + 1; }
    return out;
  }
  buySupplies(id) {
    const g = this.game, T = this.town;
    const why = this.allowed(id); if (why) { g.hud.toast(why); sfx.error(); return false; }
    if (this.bp) { g.hud.toast(t('house.oneBlueprint')); sfx.error(); return false; }
    const cost = this.price(id, true);
    if (T.money < cost) { g.hud.toast(t('shop.noMoney')); sfx.error(); return false; }
    T.money -= cost;
    for (const [it, n] of Object.entries(this.needs(id))) g.give(it, n, true);
    g.hud.dirtyHotbar = true;
    this.placing = { design: id, rot: 0 };
    g.hud.bigMessage(t('house.suppliesTitle'), t(g.app.input.touch ? 'house.suppliesSubTouch' : 'house.suppliesSub'));
    sfx.coins();
    return true;
  }
  // choosing where the blueprint goes: it follows the ground you aim at
  previewAt(hit) {
    if (!this.placing || !hit || hit.ny !== 1) return null;
    const P = DESIGNS[this.placing.design].plan(), W = P.w - 2, Dd = P.d - 2;
    const yaw = this.game.player.yaw;
    // the door faces you
    const rot = [0, 3, 2, 1][((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4];
    const [sx, sz] = rot & 1 ? [Dd, W] : [W, Dd];
    return { design: this.placing.design, x: hit.x - Math.floor(sx / 2), y: hit.y + 1, z: hit.z - Math.floor(sz / 2), rot };
  }
  setBlueprint(spot) {
    const g = this.game;
    this.bp = { ...spot };
    this.placing = null;
    this.showGhost();
    g.hud.toast(t('house.bpSet'));
    sfx.place();
  }
  cancelBlueprint() { this.bp = null; this.placing = null; this.dropGhost(); }
  // the ghost: every block still to place, see-through, tinted like its block
  showGhost() {
    const g = this.game, bp = this.bp;
    this.dropGhost();
    if (!bp) return;
    const P = DESIGNS[bp.design].plan(), W = P.w - 2, Dd = P.d - 2;
    this.bpList = P.blocks.filter((q) => q[3] !== B.AIR).map(([a, y, c, id]) => { const [dx, dz] = turn(a, c, bp.rot, W, Dd); return { x: bp.x + dx, y: bp.y + y, z: bp.z + dz, id }; });
    const geo = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, vertexColors: false });
    const m = new THREE.InstancedMesh(geo, mat, Math.min(GHOST_MAX, this.bpList.length));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3), 3);
    m.frustumCulled = false;
    g.scene.add(m);
    this.ghost = m; this.ghostT = 0;
    this.refreshGhost();
  }
  dropGhost() { if (this.ghost) { this.game.scene.remove(this.ghost); this.ghost.geometry.dispose(); this.ghost.material.dispose(); this.ghost = null; } }
  refreshGhost() {
    const w = this.game.world, m = this.ghost, mat4 = new THREE.Matrix4(), col = new THREE.Color();
    const COL = { [B.WOOD]: 0xc89a5a, [B.BRICK]: 0xd06a4a, [B.STONE]: 0xa8a8a8, [B.GLASS]: 0x9ad8ff, [B.THATCH]: 0xe8d070, [B.FENCE]: 0xa07040, [B.DOOR]: 0x8a5a2a, [B.LADDER]: 0xb08050 };
    let left = 0, n = 0;
    for (const q of this.bpList) {
      const have = w.get(q.x, q.y, q.z);
      const done = have === q.id || (q.id === B.DOOR && have === B.DOOR_OPEN);
      if (done) continue;
      left++;
      if (n < m.count) { mat4.makeTranslation(q.x + 0.5, q.y + 0.5, q.z + 0.5); m.setMatrixAt(n, mat4); col.setHex(COL[q.id] || 0xffffff); m.setColorAt(n, col); n++; }
    }
    for (let k = n; k < m.count; k++) { mat4.makeScale(0, 0, 0); m.setMatrixAt(k, mat4); }
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.left = left; this.total = this.bpList.length;
    if (left === 0) this.finishBlueprint();
  }
  finishBlueprint() {
    const g = this.game, bp = this.bp;
    const h = { id: 'h' + Date.now().toString(36), design: bp.design, x: bp.x, y: bp.y, z: bp.z, rot: bp.rot, lot: null };
    this.homes.push(h);
    this.cancelBlueprint();
    this.town.st.houses = (this.town.st.houses || 0) + 1;
    this.moveInto(h);
  }

  // ---- your old cottage: sell it, or a gang may take it over ----
  sellCottage() {
    const T = this.town, g = this.game;
    if (this.cottageSold || !this.homeId) return;
    const pay = Math.round(60 * this.town.trades.priceK('house', false));
    T.money += pay; T.st.earned += pay;
    this.cottageSold = true; this.cottageTaken = false; this.leftT = null;
    g.hud.toast(t('house.soldCottage', { n: pay }), 'pick');
    sfx.coins();
  }
  sellHome(h) {
    const T = this.town, g = this.game;
    if (!h || h.id === this.homeId || h.taken != null) return;      // (no deed to sell for a house taken at gunpoint)
    const pay = Math.round(DESIGNS[h.design].value * this.town.trades.priceK('house', false));
    T.money += pay; T.st.earned += pay;
    this.homes = this.homes.filter((x) => x !== h);
    const q = this.lots.find((l) => l.id === h.lot); if (q) { q.owner = 'sold'; }
    g.hud.toast(t('house.sold', { n: pay }), 'pick'); sfx.coins();
  }
  // left empty a day and a half: squatters (outlaws) move into the cottage
  updateCottage() {
    const g = this.game, T = this.town, C = T.cottage, P = g.player.pos;
    if (this.cottageSold || !this.homeId || this.leftT == null) return;
    if (!this.cottageTaken && g.time - this.leftT > 1.5 && Math.hypot(P.x - C.x, P.z - C.z) > 90) {
      this.cottageTaken = true;
      g.hud.alert(t('house.squatters'));
    }
    // squatters, only while you are near
    const near = Math.hypot(P.x - C.x, P.z - C.z) < 110;
    if (this.cottageTaken && near && !this.squat) this.spawnSquatters();
    if (this.squat && (!near || !this.cottageTaken)) this.dropSquatters();
    if (this.squat && this.squat.every((v) => !v.alive)) {
      this.cottageTaken = false; this.leftT = g.time; this.dropSquatters();
      g.hud.toast(t('house.cleared'), 'pick');
      T.trades.rep('farmers', 2);
    }
  }
  spawnSquatters() {
    const T = this.town, F = T.folk, C = T.cottage, Tr = T.trades;
    this.squat = [];
    for (let k = 0; k < 3; k++) {
      const seed = 9100 + k, at = { x: C.x + 0.5 + (k - 1) * 1.5, y: C.y, z: C.z + 2.5 };
      const look = { shirt: 0x3a3430, trousers: 0x2a2622, vest: 0x1e1c1a, hat: 'felt', hatColor: 0x1a1612, hair: 0x2a1c12, moustache: true, gunbelt: true };
      const v = Tr.makeMan(t('house.squatter') + ' ' + (k + 1), seed, look, at);
      Object.assign(v, { outlaw: true, squatter: true, bounty: null, guns: ['revolver'], brave: 0.75 });
      v.ai = (o, dt, d) => {
        if (!o.alive) return true;
        if (o.surrendered > 0 || o.fight) return false;
        if (d < 22 && F.sees(o, 28) && !o.warned) { o.warned = true; F.say(o, 'say.squatter', null, 'warn'); o.drawT = 1.5; }
        if (o.warned) { o.drawT -= dt; if (o.drawT <= 0) { o.fight = { armed: 'revolver' }; F.armed(o, 'revolver'); o.cool = 0.6; return false; } }
        o.speed = 0; return true;
      };
      v.onHurt = (o) => { if (o.alive && !o.fight) { o.fight = { armed: 'revolver' }; F.armed(o, 'revolver'); } };
      v.onKill = () => {};
      F.extra.push(v); this.squat.push(v);
    }
  }
  dropSquatters() {
    const F = this.town.folk;
    if (!this.squat) return;
    for (const v of this.squat) { F.dropRig(v); v.away = true; }
    F.extra = F.extra.filter((x) => !x.squatter); this.squat = null;
  }

  // ---- doors (yours, placed from the door item) ----
  aimTarget(hit) {
    const g = this.game, sel = g.selected();
    if (this.placing) {
      const spot = this.previewAt(hit);
      this.previewSpot = spot;
      if (spot) return { a: 'bpSet', label: t('use.bpSet'), run: () => this.setBlueprint(spot) };
    }
    if (hit && (hit.id === B.DOOR || hit.id === B.DOOR_OPEN)) {
      if (sel === 'dynamite') return { a: 'blowDoor', label: t('use.blowDoor'), run: () => this.town.lightPlainDoor(hit) };
      const open = hit.id === B.DOOR_OPEN;
      return { a: open ? 'doorClose' : 'doorOpen', label: t(open ? 'use.doorClose' : 'use.doorOpen'), run: () => this.toggleDoor(hit, open) };
    }
    return null;
  }
  toggleDoor(hit, open) {
    const w = this.game.world;
    for (let dy = -1; dy <= 1; dy++) { const b = w.get(hit.x, hit.y + dy, hit.z); if (b === (open ? B.DOOR_OPEN : B.DOOR)) w.set(hit.x, hit.y + dy, hit.z, open ? B.DOOR : B.DOOR_OPEN); }
    sfx.gate();
  }

  // ---- per frame (a few times a second) ----
  update(dt) {
    this.ghostT -= dt;
    if (this.ghost && this.ghostT <= 0) { this.ghostT = 0.4; this.refreshGhost(); }
    this.cotT = (this.cotT || 0) - dt;
    if (this.cotT <= 0) { this.cotT = 1; this.updateCottage(); }
    // the preview while choosing where the blueprint goes
    if (this.placing) this.drawPreview(); else if (this.prev) { this.game.scene.remove(this.prev); this.prev.geometry.dispose(); this.prev.material.dispose(); this.prev = null; }
  }
  drawPreview() {
    const g = this.game, s = this.previewSpot;
    if (!s) { if (this.prev) this.prev.visible = false; return; }
    const P = DESIGNS[s.design].plan(), W = P.w - 2, Dd = P.d - 2, [sx, sz] = s.rot & 1 ? [Dd, W] : [W, Dd];
    if (!this.prev) {
      this.prev = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.25, depthWrite: false }));
      g.scene.add(this.prev);
    }
    this.prev.visible = true;
    this.prev.scale.set(sx, 4, sz);
    this.prev.position.set(s.x + sx / 2, s.y + 2, s.z + sz / 2);
  }
  // what the map shows: lots for sale, your houses, the blueprint
  mapMarks() {
    const out = [];
    for (const q of this.lots) if (!q.owner) out.push({ x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, kind: 'lot' });
    for (const h of this.homes) out.push({ x: h.x + 3, z: h.z + 3, kind: h.id === this.homeId ? 'home' : 'house' });
    if (this.bp) out.push({ x: this.bp.x + 3, z: this.bp.z + 3, kind: 'blueprint' });
    return out;
  }
  hudText() { return this.bp && this.total ? t('house.bpLeft', { n: this.total - this.left, total: this.total }) : this.placing ? t('house.bpChoose') : ''; }
  toSave() {
    return {
      homes: this.homes, homeId: this.homeId, cottageSold: this.cottageSold, cottageTaken: this.cottageTaken, leftT: this.leftT, bp: this.bp,
      country: this.lots.filter((q) => !q.town).map((q) => ({ ...q })), lots: this.lots.map((q) => ({ id: q.id, owner: q.owner || null, home: q.home || null })),
    };
  }
  dispose() { this.dropGhost(); this.dropSquatters(); if (this.prev) { this.game.scene.remove(this.prev); this.prev = null; } }
}

function mulberry(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let q = Math.imul(a ^ a >>> 15, 1 | a); q = q + Math.imul(q ^ q >>> 7, 61 | q) ^ q; return ((q ^ q >>> 14) >>> 0) / 4294967296; };
}
void civLook;
