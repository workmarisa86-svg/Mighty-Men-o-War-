// Siege (2.9): houses for meat. Trade the meat you hunt for a house, built
// at once where you choose. As in Town Life it needs level ground (no more
// than a block up or down under it, no water). Some have secrets: a cellar
// under a hatch in the floor, a hidden room behind the chimney wall, a stone
// fort with gun slits and a roof to fight from, an escape tunnel that comes
// up far out in the field.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { makeHouse, turn } from './houses.js';

// a block list in the house's own frame: [x, y, z, id] (y 0: the floor; under 0: the cellar)
const add = (out, x, y, z, id) => out.push([x, y, z, id]);
// a cellar under the house: stone walls, a floor, a ceiling, a ladder up to a hatch in the floor
function cellar(out, w, d, depth = 5, hatch = [1, 1], chestAt = [w - 2, d - 2]) {
  const y0 = -1 - depth;                       // its floor
  for (let x = -1; x <= w; x++) for (let z = -1; z <= d; z++) for (let y = y0 - 1; y <= -2; y++) {
    const edge = x === -1 || z === -1 || x === w || z === d || y === y0 - 1 || y === -2;
    add(out, x, y, z, edge ? B.STONE : B.AIR);
  }
  for (let y = y0; y <= -2; y++) add(out, hatch[0], y, hatch[1], B.LADDER);      // the ladder up
  add(out, hatch[0], -1, hatch[1], B.DOOR);                                          // the hatch in the floor
  add(out, chestAt[0], y0, chestAt[1], B.CHEST);
  for (const [x, z] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) add(out, x, y0 + 2, z, B.BELL);     // (rings if anyone gets down there)
  return y0;
}
const DESIGNS = {
  shack: { meat: 4, plan: () => makeHouse({ w: 5, d: 5, wall: B.WOOD, roof: B.THATCH }) },
  farmhouse: { meat: 8, plan: () => makeHouse({ w: 7, d: 7, wall: B.WOOD, roof: B.THATCH, porch: true }) },
  // a cabin with a cellar: a hatch in the floor, a ladder down to a stone room with a chest
  cellar: { meat: 10, plan: () => { const P = makeHouse({ w: 6, d: 6, wall: B.WOOD, roof: B.THATCH, chimney: true }); cellar(P.blocks, 6, 6, 5, [1, 1]); return P; } },
  // a brick house with a hidden room: a false wall by the chimney, a door at the back of the cupboard
  hideout: { meat: 14, plan: () => {
    const w = 9, d = 7, P = makeHouse({ w, d, wall: B.BRICK, upper: B.BRICK, roof: B.WOOD, chimney: true });
    for (let z = 1; z < d - 1; z++) for (let y = 0; y < 4; y++) add(P.blocks, w - 3, y, z, B.BRICK);        // the false wall
    add(P.blocks, w - 3, 0, 1, B.DOOR); add(P.blocks, w - 3, 1, 1, B.DOOR);                                    // its door, in the dark back corner
    add(P.blocks, w - 2, 0, d - 2, B.CHEST);                                                                   // the secret room's chest
    for (let z = 2; z <= 4; z++) add(P.blocks, w - 1, 1, z, B.LOOPHOLE);                                       // and gun slits out of it
    P.bed = [2, 0, 1.5]; P.chest = [1, 0, d - 2];
    return P;
  } },
  // a stone fort: thick walls with gun slits, a flat roof with a parapet to shoot from, a cellar
  fort: { meat: 18, plan: () => {
    const w = 9, d = 9, out = [], H = 4;
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) {
      add(out, x, -1, z, B.STONE);
      const edge = x === 0 || z === 0 || x === w - 1 || z === d - 1;
      for (let y = 0; y < H; y++) if (edge) add(out, x, y, z, y === 1 && (x + z) % 2 === 1 ? B.LOOPHOLE : B.STONE);
      add(out, x, H, z, x === 1 && z === 1 ? B.AIR : B.STONE);                                                // the roof (a hole for the ladder)
      if (edge) add(out, x, H + 1, z, (x + z) % 2 ? B.STONE : B.AIR);                                         // the parapet
    }
    const mid = Math.floor((w - 1) / 2);
    add(out, mid, 0, d - 1, B.DOOR); add(out, mid, 1, d - 1, B.DOOR);
    for (let y = 0; y <= H; y++) add(out, 1, y, 1, B.LADDER);                                                  // up to the roof
    cellar(out, w, d, 5, [w - 2, 1], [1, d - 2]);
    add(out, mid, 2, 0, B.BELL);
    return { w: w + 2, d: d + 2, blocks: dedupe(out), bed: [w - 3, 0, d - 2.5], chest: [w - 2, 0, d - 2], door: [mid, d - 1] };
  } },
  // a two-storey brick house with a cellar and an escape tunnel that comes up out in the field
  escape: { meat: 24, plan: () => {
    const w = 8, d = 7, P = makeHouse({ w, d, floors: 2, wall: B.BRICK, upper: B.WOOD, roof: B.THATCH, chimney: true });
    const y0 = cellar(P.blocks, w, d, 5, [w - 2, d - 2], [1, 1]);
    // the tunnel: out of the cellar's back wall, 16 blocks, up a ladder to a hatch in the grass
    const L = 16;
    for (let z = -1; z >= -L; z--) for (let x = 2; x <= 4; x++) for (let y = y0 - 1; y <= y0 + 2; y++) add(P.blocks, x, y, z, x === 3 && y >= y0 && y <= y0 + 1 ? B.AIR : B.STONE);
    for (let y = y0; y <= -2; y++) add(P.blocks, 3, y, -L - 1, B.LADDER);
    for (let y = y0; y <= -2; y++) for (const [x, z] of [[2, -L - 1], [4, -L - 1], [3, -L - 2]]) add(P.blocks, x, y, z, B.STONE);
    add(P.blocks, 3, -1, -L - 1, B.DOOR);                                                                      // the hatch out in the field
    return P;
  } },
  mansion: { meat: 30, plan: () => { const P = makeHouse({ w: 9, d: 8, floors: 2, wall: B.BRICK, upper: B.BRICK, roof: B.STONE, porch: true, chimney: true }); cellar(P.blocks, 9, 8, 6, [1, 6], [7, 1]); return P; } },
};
function dedupe(out) { const m = new Map(); for (const q of out) m.set(q[0] + ',' + q[1] + ',' + q[2], q); return [...m.values()]; }
export const SIEGE_HOUSES = Object.keys(DESIGNS);
export const houseMeat = (id) => DESIGNS[id].meat;
// what pays: meat (raw or cooked) and the skins of what you hunt (worth more for bigger game)
const WORTH = { hide: 1, wolf_hide: 2, bear_hide: 4, meat_raw: 1, meat_cooked: 1 };
const PAY_ORDER = ['bear_hide', 'wolf_hide', 'hide', 'meat_raw', 'meat_cooked'];      // (skins first: keep your food)
export const meatHeld = (g) => Object.entries(WORTH).reduce((n, [id, k]) => n + (g.inv.counts[id] > 0 && g.inv.counts[id] !== Infinity ? g.inv.counts[id] : 0) * k, 0);
function pay(g, n) {
  for (const id of PAY_ORDER) {
    const k = WORTH[id];
    while (n > 0 && (g.inv.counts[id] || 0) > 0) { g.take(id, 1); n -= k; }
  }
}

export class SiegeHouses {
  constructor(siege) { this.S = siege; this.game = siege.game; this.placing = null; this.spot = null; this.prev = null; }
  choose(id) {
    const g = this.game;
    if (meatHeld(g) < houseMeat(id)) { g.hud.toast(t('sh.needMeat', { n: houseMeat(id) })); sfx.error(); return; }
    this.placing = id; g.app.closePanel();
    g.hud.toast(t('sh.aim', { house: t('sh.' + id) }));
  }
  cancel() { this.placing = null; this.spot = null; this.dropPrev(); }
  // where it would go: centred on the ground you aim at, the door facing you
  spotAt(hit) {
    if (!this.placing || !hit || hit.ny !== 1) return null;
    const P = DESIGNS[this.placing].plan(), W = P.w - 2, Dd = P.d - 2, yaw = this.game.player.yaw;
    const rot = [0, 3, 2, 1][((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4];
    const [sx, sz] = rot & 1 ? [Dd, W] : [W, Dd];
    const spot = { id: this.placing, x: hit.x - Math.floor(sx / 2), y: hit.y + 1, z: hit.z - Math.floor(sz / 2), rot, sx, sz, P, W, Dd };
    spot.ok = this.level(spot);
    return spot;
  }
  // level ground: every column under it within a block of the floor, no water, nothing locked
  level(s) {
    const w = this.game.world;
    for (let x = s.x - 1; x <= s.x + s.sx; x++) for (let z = s.z - 1; z <= s.z + s.sz; z++) {
      const top = w.surfaceY(x, z);
      if (Math.abs(top + 1 - s.y) > 1 || w.get(x, top + 1, z) === B.WATER || w.isLocked(x, top, z)) return false;
    }
    return true;
  }
  aimTarget(hit) {
    if (!this.placing) return null;
    const s = this.spotAt(hit);
    this.spot = s;
    if (!s) return null;
    return s.ok ? { a: 'shbuild', label: t('sh.build', { house: t('sh.' + s.id), n: houseMeat(s.id) }), run: () => this.build(s) }
      : { a: 'shbad', label: t('sh.notLevel'), run: () => { this.game.hud.toast(t('sh.notLevel')); sfx.error(); } };
  }
  build(s) {
    const g = this.game, w = g.world, T = this.S.T, n = houseMeat(s.id);
    if (meatHeld(g) < n) { g.hud.toast(t('sh.needMeat', { n })); sfx.error(); this.cancel(); return; }
    pay(g, n);
    const at = (x, z) => { const [a, c] = turn(x, z, s.rot, s.W, s.Dd); return [s.x + a, s.z + c]; };
    // the ground made level (filled up, cut down), the space cleared
    let top = 4; for (const q of s.P.blocks) top = Math.max(top, q[1] + 1);
    for (let x = -1; x <= s.W; x++) for (let z = -1; z <= s.Dd; z++) {
      const [X, Z] = at(x, z);
      for (let y = s.y - 3; y < s.y - 1; y++) if (!SOLID[w.get(X, y, Z)]) w.set(X, y, Z, B.DIRT);
      w.set(X, s.y - 1, Z, B.GRASS);
      for (let y = s.y; y <= s.y + top + 1; y++) if (w.get(X, y, Z) !== B.AIR) w.set(X, y, Z, B.AIR);
    }
    for (const [x, y, z, id] of s.P.blocks) { const [X, Z] = at(x, z); w.set(X, s.y + y, Z, id); if (id === B.CHEST) T.chests[X + ',' + (s.y + y) + ',' + Z] = { counts: {} }; }
    // its bed, and a chest by it
    if (s.P.bed) { const [bx, bz] = at(Math.floor(s.P.bed[0]), Math.floor(s.P.bed[2])); T.beds.push(T.showBed({ x: bx + 0.5, y: s.y, z: bz + 0.5, yaw: (s.rot & 3) * Math.PI / 2 })); }
    if (s.P.chest) { const [cx, cz] = at(s.P.chest[0], s.P.chest[2]); if (w.get(cx, s.y, cz) === B.AIR) { w.set(cx, s.y, cz, B.CHEST); T.chests[cx + ',' + s.y + ',' + cz] = { counts: {} }; } }
    g.hud.dirtyHotbar = true; this.cancel();
    g.hud.bigMessage(t('sh.built', { house: t('sh.' + s.id) }), t('sh.builtSub.' + s.id));
    sfx.done();
    g.app.saveGame(true);
  }
  // the outline where it would go: gold on level ground, red where it can't
  update() {
    const g = this.game, s = this.placing && this.spot;
    if (!s) { this.dropPrev(); return; }
    if (!this.prev) { this.prev = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, depthWrite: false })); g.scene.add(this.prev); }
    this.prev.material.color.setHex(s.ok ? 0xffe08a : 0xff4a3a);
    this.prev.scale.set(s.sx, 4, s.sz); this.prev.position.set(s.x + s.sx / 2, s.y + 2, s.z + s.sz / 2);
  }
  dropPrev() { if (this.prev) { this.game.scene.remove(this.prev); this.prev.geometry.dispose(); this.prev.material.dispose(); this.prev = null; } }
}
