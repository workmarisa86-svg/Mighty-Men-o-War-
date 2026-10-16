// Wildlife. Town Life: deer, birds, bears and wolves in the wild, chickens,
// pigs and cows in pens. War: only birds, bears (in the woods, thickest by
// rivers and lakes) and wolf packs (forests, mountains and cold countries).
// Animals notice the player by sight and sound, flee when alarmed, and the
// whole group scatters at a gunshot. A silent knife kill on an unaware
// animal leaves the rest of the group undisturbed. Every animal stands on
// the ground (and falls if it disappears), floats and swims in water;
// bears and wolves swim across rivers and lakes after you.
//
// Bears fight like bears: a roar and a charge, then they rear up and claw or
// lunge and bite (wind-up, strike, recover), never just standing beside you.
// Hurt badly they may flee instead. Wolves hunt in packs of 4 to 6: they
// circle you, howl, then rush in from different sides, bite and fall back;
// a pack that loses half its wolves runs. Only two packs are ever near you,
// and only animals near you are simulated.
import * as THREE from 'three';
import { SEA, DIFF } from './config.js';
import { B, SOLID } from './blocks.js';
import { sfx } from './audio.js';
import { PartList, mat4 } from './merge.js';

export const TYPES = {
  pig:  { hp: 40, meat: 2, walk: 1.1, flee: 5.4, group: [3, 6], sense: 1.0, half: 0.5, height: 0.9 },
  cow:  { hp: 70, meat: 3, walk: 0.9, flee: 4.8, group: [3, 5], sense: 0.9, half: 0.75, height: 1.5 },
  bird: { hp: 10, meat: 1, walk: 0.9, flee: 8, group: [5, 9], sense: 1.4, half: 0.28, height: 0.4 },
  // Town Life
  deer: { hp: 55, meat: 2, hide: 'hide', hides: 1, walk: 1.2, flee: 7.2, group: [2, 4], sense: 1.4, half: 0.45, height: 1.45 },
  bear: { hp: 320, meat: 6, hide: 'bear_hide', hides: 1, walk: 0.9, flee: 6.2, group: [1, 1], sense: 1.1, half: 0.7, height: 1.4, fierce: true, swim: true, sink: 0.85 },
  wolf: { hp: 70, meat: 2, hide: 'wolf_hide', hides: 1, walk: 1.4, flee: 7.6, group: [4, 6], sense: 1.5, half: 0.32, height: 0.85, pack: true, swim: true, sink: 0.5 },
  chicken: { hp: 8, meat: 1, walk: 0.7, flee: 3.2, group: [3, 5], sense: 0.8, half: 0.22, height: 0.5 },
};
// Town Life seasons: how likely each new wild group is (bears rare in summer,
// plentiful in winter)
const TOWN_MIX = {
  spring: { deer: 0.45, bear: 0.2, bird: 0.35 },
  summer: { deer: 0.5, bear: 0.14, bird: 0.36 },
  autumn: { deer: 0.42, bear: 0.28, bird: 0.3 },
  winter: { deer: 0.4, bear: 0.42, bird: 0.18 },
};
// Town Life: at least this many bears roam the woods (far from the town and your cottage)
const MIN_BEARS = { spring: 4, summer: 3, autumn: 5, winter: 4 };
const WAR_BEARS = 3;                // War: bears in the woods at any time

const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
const MATS = {};
function m(c) { return MATS[c] || (MATS[c] = mat(c)); }
function box(w, h, d, color, x, y, z) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m(color));
  b.position.set(x, y, z);
  return b;
}
// legs pivot at the hip so they can swing
function leg(w, h, color, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const b = box(w, h, w, color, 0, -h / 2, 0); g.add(b);
  return g;
}

function makePig(r) {
  const g = new THREE.Group(), legs = [];
  g.add(box(0.6, 0.52, 0.95, 0xa07a68, 0, 0.6, 0));
  for (let i = 0; i < 3; i++) g.add(box(0.2 + r() * 0.15, 0.06, 0.2 + r() * 0.2, 0x5e4636, (r() - 0.5) * 0.4, 0.87, (r() - 0.5) * 0.6)); // dried mud
  g.add(box(0.44, 0.4, 0.36, 0xa88272, 0, 0.66, -0.6));
  g.add(box(0.22, 0.16, 0.08, 0x8a6052, 0, 0.6, -0.82));
  g.add(box(0.1, 0.12, 0.06, 0x8a6052, -0.15, 0.9, -0.55), box(0.1, 0.12, 0.06, 0x8a6052, 0.15, 0.9, -0.55));
  g.add(box(0.05, 0.05, 0.02, 0x1a1410, -0.12, 0.74, -0.79), box(0.05, 0.05, 0.02, 0x1a1410, 0.12, 0.74, -0.79));
  for (const [x, z] of [[-0.18, -0.3], [0.18, -0.3], [-0.18, 0.3], [0.18, 0.3]]) { const l = leg(0.15, 0.36, 0x7e5e50, x, 0.36, z); legs.push(l); g.add(l); }
  return { g, legs };
}
function makeCow(r) {
  const g = new THREE.Group(), legs = [];
  g.add(box(0.8, 0.72, 1.5, 0x5e4a3a, 0, 0.98, 0));
  for (let i = 0; i < 4; i++) g.add(box(0.3 + r() * 0.2, 0.05, 0.3 + r() * 0.3, 0xbab2a0, (r() > 0.5 ? 1 : -1) * 0.41, 0.98 + (r() - 0.5) * 0.3, (r() - 0.5) * 0.9));
  g.add(box(0.44, 0.48, 0.5, 0x5e4a3a, 0, 1.2, -0.95));
  g.add(box(0.36, 0.22, 0.12, 0xb8a898, 0, 1.08, -1.22));
  g.add(box(0.06, 0.14, 0.06, 0xd0c8b4, -0.2, 1.48, -0.95), box(0.06, 0.14, 0.06, 0xd0c8b4, 0.2, 1.48, -0.95));
  g.add(box(0.06, 0.06, 0.02, 0x14100c, -0.14, 1.28, -1.21), box(0.06, 0.06, 0.02, 0x14100c, 0.14, 1.28, -1.21));
  g.add(box(0.06, 0.5, 0.06, 0x4a3a2c, 0, 0.82, 0.77));
  for (const [x, z] of [[-0.26, -0.55], [0.26, -0.55], [-0.26, 0.55], [0.26, 0.55]]) { const l = leg(0.2, 0.62, 0x4e3e30, x, 0.62, z); legs.push(l); g.add(l); }
  return { g, legs };
}
// a bird: its body, head, beak and tail baked into one mesh (shared by all
// birds of a colour), two wings and two legs
function makeBird(r) {
  const g = new THREE.Group(), wings = [], legs = [];
  const k = r() < 0.5 ? 0 : 1, c = k ? 0x4a4640 : 0x2e2f32;
  g.add(part('bird' + k, [[0.18, 0.16, 0.34, 0, 0.2, 0, c], [0.13, 0.13, 0.13, 0, 0.3, -0.2, c], [0.05, 0.04, 0.1, 0, 0.29, -0.31, 0x8a7040], [0.1, 0.03, 0.14, 0, 0.24, 0.22, c]]));
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.09, 0.24, 0);
    w.add(part('wing' + (s > 0 ? 'R' : 'L'), [[0.32, 0.03, 0.2, s * 0.16, 0, 0, 0x55575a]]));
    wings.push(w); g.add(w);
  }
  for (const s of [-1, 1]) { const l = pivot(g, s * 0.05, 0.12, 0); l.add(part('birdLeg', [[0.03, 0.12, 0.03, 0, -0.06, 0, 0x6a5a3a]])); legs.push(l); }
  return { g, legs, wings };
}
function makeDeer(r) {
  const g = new THREE.Group(), legs = [];
  const c = 0x8a6440, belly = 0xc8b08a;
  g.add(box(0.5, 0.5, 1.15, c, 0, 0.98, 0));
  g.add(box(0.4, 0.2, 0.9, belly, 0, 0.78, 0));
  g.add(box(0.2, 0.55, 0.22, c, 0, 1.32, -0.55, ), box(0.24, 0.24, 0.38, c, 0, 1.55, -0.72));
  g.add(box(0.12, 0.1, 0.12, 0x2a1e14, 0, 1.52, -0.93));
  g.add(box(0.06, 0.16, 0.04, c, -0.12, 1.72, -0.66), box(0.06, 0.16, 0.04, c, 0.12, 1.72, -0.66));
  if (r() < 0.5) for (const s of [-1, 1]) { g.add(box(0.03, 0.28, 0.03, 0xd8ccb0, s * 0.08, 1.82, -0.7)); g.add(box(0.16, 0.03, 0.03, 0xd8ccb0, s * 0.14, 1.92, -0.7)); }  // antlers
  g.add(box(0.14, 0.14, 0.06, 0xf0e8d8, 0, 1.05, 0.6));
  for (const [x, z] of [[-0.16, -0.42], [0.16, -0.42], [-0.16, 0.42], [0.16, 0.42]]) { const l = leg(0.1, 0.74, 0x6a4a30, x, 0.74, z); legs.push(l); g.add(l); }
  return { g, legs };
}
// ---- bears and wolves: jointed models (hind legs, a body that rears and
// lunges, front legs, a head with an opening jaw), each part baked into one
// mesh with vertex colours (a few draw calls per animal), geometry shared
// by every animal of the same kind and coat.
const VC = new THREE.MeshLambertMaterial({ vertexColors: true });
const GEO_CACHE = {};
const BOXG = new THREE.BoxGeometry(1, 1, 1);
// a baked part: boxes [w, h, d, x, y, z, color, rx?]
function part(key, boxes) {
  if (!GEO_CACHE[key]) {
    const L = new PartList();
    for (const [w, h, d, x, y, z, c, rx = 0] of boxes) L.add(BOXG, mat4([x, y, z], [rx, 0, 0], [w, h, d]), c);
    GEO_CACHE[key] = L.build();
  }
  const m = new THREE.Mesh(GEO_CACHE[key], VC);
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function makeBear(r) {
  const coat = r() < 0.5 ? 0 : 1, c = coat ? 0x4a3424 : 0x3a281a, dk = coat ? 0x30200f : 0x24180c, mz = 0x6e5238, claw = 0xd8ccb0;
  const g = new THREE.Group(), legs = [];
  // hind legs at the hips; the body pivots there to rear up on them
  const hind = [];
  for (const x of [-0.34, 0.34]) { const l = pivot(g, x, 0.66, 0.55); l.add(part('bearHind' + coat, [[0.3, 0.42, 0.36, 0, -0.16, 0, c], [0.26, 0.3, 0.28, 0, -0.5, 0.02, c], [0.3, 0.08, 0.36, 0, -0.62, -0.05, dk], [0.26, 0.04, 0.06, 0, -0.64, -0.24, claw]])); hind.push(l); }
  const body = pivot(g, 0, 0.66, 0.55);
  body.add(part('bearBody' + coat, [
    [0.98, 0.84, 1.7, 0, 0.38, -0.62, c],          // torso
    [0.9, 0.36, 0.7, 0, 0.82, -0.98, c],           // the shoulder hump
    [0.84, 0.2, 1.3, 0, 0.0, -0.6, dk],            // belly fur
    [0.9, 0.7, 0.3, 0, 0.36, 0.15, c],             // rump
    [0.16, 0.14, 0.12, 0, 0.6, 0.3, dk],           // stub tail
  ]));
  const front = [];
  for (const x of [-0.34, 0.34]) { const l = pivot(body, x, 0.0, -1.18); l.add(part('bearFront' + coat, [[0.3, 0.48, 0.34, 0, -0.18, 0, c], [0.28, 0.28, 0.3, 0, -0.52, 0, c], [0.32, 0.08, 0.38, 0, -0.64, -0.05, dk], [0.3, 0.05, 0.08, 0, -0.66, -0.26, claw]])); front.push(l); }
  const head = pivot(body, 0, 0.62, -1.48);
  head.add(part('bearHead' + coat, [
    [0.6, 0.52, 0.5, 0, 0.0, -0.12, c], [0.36, 0.26, 0.34, 0, -0.08, -0.5, mz], [0.14, 0.1, 0.06, 0, -0.02, -0.68, 0x120c08],
    [0.16, 0.16, 0.08, -0.22, 0.3, -0.02, c], [0.16, 0.16, 0.08, 0.22, 0.3, -0.02, c], [0.07, 0.07, 0.03, -0.15, 0.08, -0.38, 0x0a0806], [0.07, 0.07, 0.03, 0.15, 0.08, -0.38, 0x0a0806],
  ]));
  const jaw = pivot(head, 0, -0.2, -0.32); jaw.add(part('bearJaw' + coat, [[0.3, 0.1, 0.32, 0, -0.02, -0.14, mz], [0.24, 0.04, 0.04, 0, 0.04, -0.28, 0xe8e0d0]]));
  legs.push(front[0], front[1], hind[0], hind[1]);
  return { g, legs, body, head, jaw };
}
function makeWolf(r) {
  const coat = Math.floor(r() * 3), c = [0x7a746a, 0x5e5a54, 0x8a7a64][coat], lt = [0xb8b2a6, 0x9a968e, 0xc8b89a][coat], dk = [0x4a4640, 0x34322e, 0x5a4a38][coat];
  const g = new THREE.Group(), legs = [];
  const hind = [];
  for (const x of [-0.13, 0.13]) { const l = pivot(g, x, 0.52, 0.42); l.add(part('wolfHind' + coat, [[0.13, 0.26, 0.2, 0, -0.1, 0.02, c], [0.08, 0.28, 0.1, 0, -0.36, 0.05, c], [0.1, 0.05, 0.14, 0, -0.5, 0.0, dk]])); hind.push(l); }
  const body = pivot(g, 0, 0.52, 0.42);
  body.add(part('wolfBody' + coat, [
    [0.32, 0.34, 1.0, 0, 0.12, -0.45, c], [0.36, 0.42, 0.42, 0, 0.12, -0.78, c],      // body and deep chest
    [0.24, 0.12, 0.8, 0, -0.08, -0.45, lt], [0.22, 0.12, 0.7, 0, 0.3, -0.45, dk],     // light belly, dark back
    [0.22, 0.26, 0.3, 0, 0.3, -1.02, c, -0.6],                                        // the neck ruff
  ]));
  const tail = pivot(body, 0, 0.22, 0.06); tail.add(part('wolfTail' + coat, [[0.1, 0.1, 0.46, 0, -0.1, 0.22, c, 0.7], [0.08, 0.08, 0.12, 0, -0.26, 0.42, dk, 0.7]]));
  const front = [];
  for (const x of [-0.12, 0.12]) { const l = pivot(body, x, -0.02, -0.82); l.add(part('wolfFront' + coat, [[0.1, 0.5, 0.1, 0, -0.24, 0, c], [0.1, 0.05, 0.14, 0, -0.5, -0.03, dk]])); front.push(l); }
  const head = pivot(body, 0, 0.38, -1.12);
  head.add(part('wolfHead' + coat, [
    [0.26, 0.22, 0.26, 0, 0, -0.06, c], [0.13, 0.1, 0.22, 0, -0.04, -0.28, lt], [0.06, 0.05, 0.04, 0, -0.01, -0.4, 0x141210],
    [0.07, 0.13, 0.05, -0.08, 0.15, 0.0, dk], [0.07, 0.13, 0.05, 0.08, 0.15, 0.0, dk], [0.04, 0.03, 0.02, -0.07, 0.04, -0.19, 0xd8b040], [0.04, 0.03, 0.02, 0.07, 0.04, -0.19, 0xd8b040],
  ]));
  const jaw = pivot(head, 0, -0.1, -0.16); jaw.add(part('wolfJaw' + coat, [[0.11, 0.04, 0.2, 0, -0.01, -0.1, lt], [0.09, 0.02, 0.02, 0, 0.02, -0.19, 0xf0ece0]]));
  legs.push(front[0], front[1], hind[0], hind[1]);
  return { g, legs, body, head, jaw, tail };
}
function makeChicken(r) {
  const g = new THREE.Group(), legs = [], wings = [];
  const c = r() < 0.6 ? 0xeee6d6 : 0x9a6a3a;
  g.add(box(0.26, 0.24, 0.36, c, 0, 0.32, 0));
  g.add(box(0.16, 0.18, 0.16, c, 0, 0.5, -0.18));
  g.add(box(0.06, 0.08, 0.1, 0xc8302a, 0, 0.63, -0.18));             // comb
  g.add(box(0.06, 0.04, 0.08, 0xe0a030, 0, 0.48, -0.3));
  g.add(box(0.12, 0.2, 0.08, c, 0, 0.42, 0.2));                       // tail
  for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.13, 0.36, 0); w.add(box(0.04, 0.16, 0.26, c, 0, 0, 0)); wings.push(w); g.add(w); }
  for (const s of [-1, 1]) { const l = leg(0.03, 0.2, 0xe0a030, s * 0.06, 0.2, 0); legs.push(l); g.add(l); }
  return { g, legs, wings };
}
const MAKERS = { pig: makePig, cow: makeCow, bird: makeBird, deer: makeDeer, bear: makeBear, chicken: makeChicken, wolf: makeWolf };

export class Animals {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.list = [];
    this.herds = [];
    const w = game.world;
    this.town = !!game.townMode;
    const mul = this.town ? 1.6 : DIFF[game.cfg.difficulty].animals;
    this.target = Math.max(4, Math.round(w.W * w.D / 9000 * mul));
    this.respawnEvery = this.town ? 45 : DIFF[game.cfg.difficulty].animalRespawn;
    this.respawnTimer = this.respawnEvery;
    this.r = Math.random;
    for (let i = 0; i < this.target; i++) this.spawnHerd(false);
    // War: a few bears always live in the woods (where the land has bears)
    if (!this.town && this.landOk('bear')) for (let k = this.herds.filter((h) => h.type === 'bear').length; k < WAR_BEARS; k++) this.spawnHerd(false, 'bear');
    this.box = new THREE.Box3(); this.ray = new THREE.Ray(); this.tmp = new THREE.Vector3();
  }

  pickType() {
    const v = this.r();
    if (this.town) {
      const mix = TOWN_MIX[this.game.season ? this.game.season() : 'summer'];
      let acc = 0;
      for (const [k, p] of Object.entries(mix)) { acc += p; if (v < acc) return k; }
      return 'deer';
    }
    // War: birds everywhere; bears in the woods (not in the outback)
    return this.landOk('bear') && v < 0.3 ? 'bear' : 'bird';
  }
  // which War lands have bears and wolves (no wolves in deserts, on islands or in the jungle)
  landOk(kind) {
    const land = this.game.landName;
    if (this.town || !land) return true;
    if (kind === 'bear') return land !== 'outback';
    return !['outback', 'volcanic', 'meadow', 'jungle'].includes(land);
  }
  // Town Life: wild groups stay out of the village and the cottage yard
  wildOk(x, z) {
    if (!this.town) return true;
    for (const s of this.game.world.sites) {
      const r = s.type === 'village' ? s.radius + 8 : s.type === 'cabin' ? 22 : 0;
      if (r && Math.hypot(x - (s.cx ?? s.x), z - (s.cz ?? s.z)) < r) return false;
      if (s.type === 'village') for (const b of s.buildings) if (b.type === 'house' && Math.hypot(x - b.inside.x, z - b.inside.z) < 18) return false;
    }
    return true;
  }
  // farm animals: they stay inside their pen. owner 'player' or 'village'
  addLivestock(type, pen, owner, at = null) {
    const x = at ? at.x : pen.x0 + 1.5 + this.r() * (pen.x1 - pen.x0 - 2), z = at ? at.z : pen.z0 + 1.5 + this.r() * (pen.z1 - pen.z0 - 2);
    const herd = { type, cx: x, cz: z, moveT: 9999, members: [], airborne: false, pen, owner };
    const y = this.ground(x, z, this.game.world.surfaceY(Math.floor(x), Math.floor(z)) + 1) ?? (this.game.world.surfaceY(Math.floor(x), Math.floor(z)) + 1);
    const a = this.add(type, herd, x, y, z);
    a.owner = owner; a.pen = pen; a.state = 'calm';
    this.herds.push(herd);
    return a;
  }
  // a new season: some far-away wild groups move on and others arrive
  reseason() {
    if (!this.town) return;
    const p = this.game.player.pos;
    for (const h of this.herds.slice()) {
      if (h.pen || !h.members.length) continue;
      if (Math.hypot(h.cx - p.x, h.cz - p.z) > 90 && this.r() < 0.5) for (const a of h.members.slice()) this.remove(a);
    }
  }
  wildCount() { return this.herds.filter((h) => !h.pen).length; }

  // standing height at column (x,z) near y, or null if unwalkable/water
  ground(x, z, y) {
    const w = this.game.world;
    const bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 1 || bz < 1 || bx >= w.W - 1 || bz >= w.D - 1) return null;
    for (let yy = Math.floor(y) + 1; yy >= Math.floor(y) - 2; yy--) {
      const b = w.get(bx, yy, bz);
      if (b === B.WATER) return null;
      if (SOLID[b] && !SOLID[w.get(bx, yy + 1, bz)] && !SOLID[w.get(bx, yy + 2, bz)]) {
        if (w.get(bx, yy + 1, bz) === B.WATER) return null;
        return yy + 1;
      }
    }
    return null;
  }

  spawnHerd(awayFromPlayer = true, kind = null) {
    const w = this.game.world, p = this.game.player.pos;
    const type0 = kind || this.pickType();
    for (let tries = 0; tries < 40; tries++) {
      let x = 8 + this.r() * (w.W - 16), z = 8 + this.r() * (w.D - 16);
      // War bears live in the woods: start beside a tree
      if (!this.town && type0 === 'bear' && w.trees && w.trees.length) { const k = Math.floor(this.r() * w.trees.length / 2) * 2; x = w.trees[k] + (this.r() - 0.5) * 8; z = w.trees[k + 1] + (this.r() - 0.5) * 8; }
      if (awayFromPlayer && Math.hypot(x - p.x, z - p.z) < 50) continue;
      if (!this.wildOk(x, z)) continue;
      const sy = w.surfaceY(Math.floor(x), Math.floor(z));
      if (sy < SEA || w.get(Math.floor(x), sy + 1, Math.floor(z)) === B.WATER) continue;
      const type = type0;
      const T = TYPES[type];
      const herd = { type, cx: x, cz: z, moveT: 20 + this.r() * 20, members: [], airborne: type === 'bird' && this.r() < 0.4 };
      herd.cy = sy + 14 + this.r() * 6;
      const G = !this.town && type === 'bird' ? [3, 5] : T.group;       // War: small flocks (birds are its only small game)
      const n = G[0] + Math.floor(this.r() * (G[1] - G[0] + 1));
      for (let i = 0; i < n; i++) {
        const ax = x + (this.r() - 0.5) * 6, az = z + (this.r() - 0.5) * 6;
        const gy = this.ground(ax, az, sy + 1);
        if (gy == null && !herd.airborne) continue;
        this.add(type, herd, ax, herd.airborne ? herd.cy + this.r() * 3 : gy, az);
      }
      if (herd.members.length) { this.herds.push(herd); return herd; }
    }
    return null;
  }

  add(type, herd, x, y, z) {
    const model = MAKERS[type](this.r);
    this.scene.add(model.g);
    const a = {
      type, T: TYPES[type], herd, pos: new THREE.Vector3(x, y, z), yaw: this.r() * Math.PI * 2,
      hp: TYPES[type].hp, state: herd.airborne ? 'circle' : 'calm', alarmed: false,
      target: null, timer: this.r() * 3, phase: this.r() * 10, speed: 0,
      mesh: model.g, legs: model.legs, wings: model.wings || [], callT: 5 + this.r() * 20,
      flyVel: new THREE.Vector3(), ang: this.r() * Math.PI * 2, dead: 0,
      body: model.body, head: model.head, jaw: model.jaw, tail: model.tail, vy: 0, swimming: false,
    };
    herd.members.push(a);
    this.list.push(a);
    return a;
  }

  remove(a) {
    this.scene.remove(a.mesh);
    a.mesh.traverse((o) => { if (o.geometry && o.material !== VC) o.geometry.dispose(); });    // shared baked parts stay
    this.list = this.list.filter((x) => x !== a);
    a.herd.members = a.herd.members.filter((x) => x !== a);
    if (!a.herd.members.length) this.herds = this.herds.filter((h) => h !== a.herd);
  }

  // How far away this animal notices the player (sneaking from behind is best)
  senseRange(a) {
    if (a.owner) return 0;            // farm animals are used to people
    const pl = this.game.player;
    const moving = Math.hypot(pl.vel.x, pl.vel.z) > 0.5;
    let r = pl.crouch ? (moving ? 2.0 : 1.2) : pl.running ? 18 : moving ? 9 : 4.5;
    r *= a.T.sense;
    const dx = pl.pos.x - a.pos.x, dz = pl.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const facing = (-Math.sin(a.yaw) * dx - Math.cos(a.yaw) * dz) / d; // 1 = looking at player
    if (facing < -0.2) r *= 0.5;
    if (this.game.player.flying) r *= 1.5;
    return r;
  }

  alarm(herd, from, fly = false) {
    for (const a of herd.members) this.scare(a, from, fly);
  }
  scare(a, from, fly = false) {
    if (a.state === 'dead') return;
    if ((a.T.fierce && a.rage > 0) || (a.T.pack && a.hunting)) return;      // an angry bear or a hunting pack is not scared off
    a.alarmed = true;
    if (a.type === 'bird') {
      if (a.state !== 'leave') {
        a.state = fly ? 'leave' : 'flyoff';
        a.timer = fly ? 30 : 5 + this.r() * 3;
        const dx = a.pos.x - from.x, dz = a.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
        a.flyVel.set(dx / d * a.T.flee, 4 + this.r() * 2, dz / d * a.T.flee);
      }
      return;
    }
    a.state = 'flee'; a.timer = 5 + this.r() * 3;
    a.from = from.clone();
  }

  // A loud noise (gunshot): every animal in range scatters, birds leave.
  noise(pos, radius) {
    let played = false;
    for (const a of this.list) {
      if (a.state === 'dead') continue;
      const d = a.pos.distanceTo(pos);
      if (d < radius) {
        this.scare(a, pos, a.type === 'bird');
        if (!played && d < 30) { played = true; if (a.type === 'bird') sfx.flap(1 - d / 30); }
      }
    }
  }

  // Ray test against animal bodies; returns nearest {animal, dist, point}
  raycast(origin, dir, maxDist) {
    this.ray.set(origin, dir);
    let best = null, bd = maxDist;
    for (const a of this.list) {
      if (a.state === 'dead') continue;
      const h = a.T.half, p = a.pos;
      if (Math.abs(p.x - origin.x) > maxDist + 2 || Math.abs(p.z - origin.z) > maxDist + 2) continue;
      this.box.min.set(p.x - h, p.y, p.z - h);
      this.box.max.set(p.x + h, p.y + a.T.height, p.z + h);
      const hit = this.ray.intersectBox(this.box, this.tmp);
      if (hit) { const d = hit.distanceTo(origin); if (d < bd) { bd = d; best = { animal: a, dist: d, point: hit.clone() }; } }
    }
    return best;
  }

  // returns true if the animal died
  hurt(a, dmg, silent) {
    if (a.state === 'dead') return false;
    const unaware = !a.alarmed && a.state !== 'flee';
    if (silent && unaware) dmg *= 4;        // silent sneak attack
    a.hp -= dmg;
    const g = this.game;
    const col = g.settings.blood ? [0.42, 0.06, 0.05] : [0.4, 0.36, 0.3];
    g.particles.burst(a.pos.x, a.pos.y + a.T.height * 0.6, a.pos.z, col, g.settings.blood ? 6 : 4, 1.2, 0.6, 14);
    if (a.hp <= 0) {
      a.state = 'dead'; a.dead = 0; this.endAttack(a);
      if (a.type === 'wolf') sfx.yelp(1); else if (a.type === 'bear') sfx.roar(0.5);
      if (this.onKill) this.onKill(a);
      if (a.type === 'pig') sfx.squeal(0.8);
      // a silent kill on an unaware animal doesn't alarm the rest of the herd
      if (!(silent && unaware)) this.alarm(a.herd, g.player.pos);
      return true;
    }
    if (a.type === 'pig') sfx.squeal(0.7);
    if (a.T.fierce) { if (!a.fleeing) { a.rage = 30; } sfx.roar(0.9); return false; }
    if (a.T.pack) { sfx.yelp(0.7); if (a.herd.pack) a.herd.pack.hurt = true; a.hunting = true; return false; }
    this.alarm(a.herd, g.player.pos);
    return false;
  }

  // ---- terrain ---------------------------------------------------------------
  // the first solid floor at or below y (any depth), or null
  floorUnder(x, z, y) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    if (bx < 1 || bz < 1 || bx >= w.W - 1 || bz >= w.D - 1) return null;
    for (let yy = Math.floor(y); yy > 0; yy--) if (SOLID[w.get(bx, yy, bz)]) return yy + 1;
    return null;
  }
  // the top of the water in this column near y (null: no water here)
  waterTop(x, y, z) {
    const w = this.game.world, bx = Math.floor(x), bz = Math.floor(z);
    let yy = Math.floor(y + 0.6);
    if (w.get(bx, yy, bz) !== B.WATER && w.get(bx, yy - 1, bz) !== B.WATER && w.get(bx, yy + 1, bz) !== B.WATER) return null;
    if (w.get(bx, yy, bz) !== B.WATER) yy = w.get(bx, yy - 1, bz) === B.WATER ? yy - 1 : yy + 1;
    while (w.get(bx, yy + 1, bz) === B.WATER) yy++;
    return yy + 1;
  }
  // Move toward (nx, nz): up a block, down any slope or ledge (then it falls),
  // into water if it can swim (and back out onto a bank). false: blocked.
  step(a, nx, nz, swimOk) {
    const w = this.game.world, bx = Math.floor(nx), bz = Math.floor(nz);
    if (bx < 2 || bz < 2 || bx >= w.W - 2 || bz >= w.D - 2) return false;
    const top = a.swimming ? 1.7 : 1.05;                     // out of the water onto a bank
    const fy = this.floorUnder(nx, nz, a.pos.y + top);
    const wt = this.waterTop(nx, a.pos.y, nz);
    if (wt != null && (fy == null || wt - fy >= 0.9)) {      // deep enough to swim
      if (!swimOk && !a.swimming) return false;
      for (let yy = Math.floor(wt); yy < Math.floor(wt) + 2; yy++) if (SOLID[w.get(bx, yy, bz)]) return false;
      a.pos.x = nx; a.pos.z = nz; return true;
    }
    if (fy == null) return false;
    if (fy > a.pos.y + top) return false;
    // headroom for the body
    for (let yy = Math.floor(fy); yy < Math.floor(fy + Math.max(1, a.T.height)); yy++) if (SOLID[w.get(bx, yy, bz)]) return false;
    // a drop of more than three blocks only when fleeing or charging
    if (fy < a.pos.y - 3.2 && a.state !== 'flee' && !a.rage && !a.hunting) return false;
    a.pos.x = nx; a.pos.z = nz;
    if (fy > a.pos.y) a.pos.y = Math.min(fy, a.pos.y + 0.25);   // stepping up (smoothed below)
    return true;
  }
  // gravity, floating and swimming, every frame for every walking animal
  settle(a, dt) {
    const T = a.T, wt = this.waterTop(a.pos.x, a.pos.y, a.pos.z);
    const fy = this.floorUnder(a.pos.x, a.pos.z, a.pos.y + 1.05);
    if (wt != null && (fy == null || wt - fy >= 0.9)) {
      // in deep water: float with the back just above the surface, paddling
      a.swimming = true; a.vy = 0;
      const want = wt - (T.sink ?? T.height * 0.6);
      a.pos.y += (want - a.pos.y) * Math.min(1, dt * 4);
      return;
    }
    a.swimming = false;
    if (fy == null) { a.vy = 0; return; }
    if (a.pos.y > fy + 0.04) {                               // in the air: fall
      a.vy = Math.max(-30, (a.vy || 0) - 22 * dt);
      a.pos.y = Math.max(fy, a.pos.y + a.vy * dt);
      if (a.pos.y <= fy) { if (a.vy < -12 && a.state !== 'dead') this.fallHurt(a, -a.vy); a.vy = 0; }
    } else { a.vy = 0; a.pos.y += (fy - a.pos.y) * Math.min(1, dt * 12); }
  }
  // Head along (vx, vz) for distance s; when blocked, slide along the
  // obstacle, and if still stuck take a detour to one side for a moment
  // (round a wall, a tree or a fort) before trying straight again.
  go(a, vx, vz, s, dt, swimOk = true) {
    if (a.detourT > 0) { a.detourT -= dt; const c = Math.cos(a.detourA), sn = Math.sin(a.detourA); [vx, vz] = [vx * c - vz * sn, vx * sn + vz * c]; }
    if (this.step(a, a.pos.x + vx * s, a.pos.z + vz * s, swimOk)) { a.stuckT = 0; return true; }
    if (this.step(a, a.pos.x + Math.sign(vx) * s, a.pos.z, swimOk) || this.step(a, a.pos.x, a.pos.z + Math.sign(vz) * s, swimOk)) { a.stuckT = 0; return true; }
    a.stuckT = (a.stuckT || 0) + dt;
    if (a.stuckT > 0.4) { a.stuckT = 0; a.detourA = (this.r() < 0.5 ? 1 : -1) * (Math.PI / 2 + this.r() * 0.6); a.detourT = 1 + this.r(); }
    return false;
  }
  fallHurt(a, v) { a.hp -= (v - 12) * 6; if (a.hp <= 0) { a.state = 'dead'; a.dead = 0; } }
  // the head turns smoothly toward a heading
  face(a, want, dt, k = 6) {
    const diff = ((want - a.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    a.yaw += diff * Math.min(1, dt * k);
  }
  // legs: a walk, a gallop, or paddling in water
  legsAnim(a, dt, speed) {
    a.phase += dt * Math.max(speed, a.swimming ? 2.4 : 0) * (a.type === 'bird' ? 14 : a.T.pack ? 3.6 : 4.4);
    const amp = a.swimming ? 0.9 : speed > 4 ? 0.85 : 0.55;
    const s = speed > 0.05 || a.swimming ? Math.sin(a.phase) * amp : 0;
    const gallop = speed > 4 && !a.swimming;
    a.legs.forEach((l, i) => { l.rotation.x = gallop ? (i < 2 ? s : Math.sin(a.phase - 0.9) * amp) : (i % 2 === (i < 2 ? 0 : 1)) ? s : -s; });
    if (a.tail) a.tail.rotation.x = a.swimming ? -0.4 : speed > 4 ? -0.5 : 0.1 + Math.sin(a.phase * 0.5) * 0.1;
  }

  update(dt) {
    const g = this.game, pl = g.player;
    const viewR = (g.settings.renderDist + 1) * 16;
    for (const herd of this.herds) {
      herd.moveT -= dt;
      if (herd.moveT <= 0 && !herd.airborne) {
        herd.moveT = 25 + this.r() * 25;
        const nx = herd.cx + (this.r() - 0.5) * 30, nz = herd.cz + (this.r() - 0.5) * 30;
        if (this.ground(nx, nz, g.world.surfaceY(Math.floor(nx), Math.floor(nz)) + 0.5) != null) { herd.cx = nx; herd.cz = nz; }
      }
      if (herd.pack) this.updatePack(herd, dt);
    }
    for (const a of this.list.slice()) {
      const d = Math.hypot(a.pos.x - pl.pos.x, a.pos.z - pl.pos.z);
      a.mesh.visible = d < viewR;
      if (d > 90 && a.state !== 'leave') {            // distant animals idle, but still stand on the ground
        if (a.type !== 'bird' || a.state === 'dead' || a.state === 'calm') { a.farT = (a.farT || 0) - dt; if (a.farT <= 0) { a.farT = 1; this.settle(a, 1); if (a.state !== 'dead' || a.type !== 'bird') a.mesh.position.copy(a.pos); } }
        continue;
      }
      if (a.state === 'dead') { this.updateDead(a, dt); continue; }
      // awareness
      if (!a.alarmed && a.state !== 'flee' && d < this.senseRange(a) && !g.paused && !a.T.pack) {
        this.alarm(a.herd, pl.pos);
        if (a.type === 'pig') sfx.pig(1 - d / 25); else if (a.type === 'cow') sfx.cow(1 - d / 30); else if (a.type !== 'bear') sfx.flap(1 - d / 25);
      }
      if (a.type === 'bird' && (a.state !== 'calm')) this.updateFlying(a, dt, d);
      else {
        if (!(a.T.fierce && this.updateBear(a, dt, d)) && !(a.T.pack && this.updateWolf(a, dt, d))) this.updateWalker(a, dt);
        if (!a.leap) this.settle(a, dt);
      }
      // calls
      a.callT -= dt;
      if (a.callT <= 0) {
        a.callT = 8 + this.r() * 20;
        if (d < 28) { const v = 1 - d / 28; if (a.type === 'pig') sfx.pig(v); else if (a.type === 'cow') sfx.cow(v); else if (a.type === 'chicken') sfx.cluck(v); else if (a.type === 'bear') sfx.growl(v * 0.6); else if (a.type === 'wolf') { if (this.r() < 0.4) sfx.snarl(v * 0.5); } else if (a.type === 'deer') { if (this.r() < 0.3) sfx.deer(v); } else sfx.bird(v); }
      }
      a.mesh.position.copy(a.pos);
      a.mesh.rotation.y = a.yaw;
    }
    // respawning (slower at higher difficulty)
    this.respawnTimer -= dt;
    if (this.respawnTimer <= 0) {
      this.respawnTimer = this.respawnEvery;
      if ((this.town ? this.wildCount() : this.herds.filter((h) => !h.pack).length) < this.target) this.spawnHerd(true);
      else if (!this.town && this.landOk('bear') && this.herds.filter((h) => h.type === 'bear' && h.members.some((a) => a.state !== 'dead')).length < WAR_BEARS) this.spawnHerd(true, 'bear');
      else if (this.town) {
        const bears = this.herds.filter((h) => !h.pen && h.type === 'bear' && h.members.some((a) => a.state !== 'dead')).length;
        if (bears < MIN_BEARS[(this.game.town && this.game.town.season) || 'summer']) this.spawnHerd(true, 'bear');
      }
    }
    this.wolfT = (this.wolfT || 0) - dt;
    if (this.wolfT <= 0) { this.wolfT = 6; this.manageWolves(); }
  }

  updateWalker(a, dt) {
    a.timer -= dt;
    let speed = 0, tx, tz;
    const R = a.owner === 'player' ? a.region : null;      // your pen (pens.js): they stay on its tiles
    if (a.led) {
      // led on a rope: it follows a couple of steps behind you
      const P = this.game.player.pos, dx = a.pos.x - P.x, dz = a.pos.z - P.z, dd = Math.hypot(dx, dz) || 1;
      if (dd > 2.2) { tx = P.x + dx / dd * 1.6; tz = P.z + dz / dd * 1.6; speed = Math.min(a.T.flee, a.T.walk * (dd > 4 ? 2.6 : 1.4)); }
      if (dd > 24) { a.led = false; if (this.onLetGo) this.onLetGo(a); }   // too far: the rope slips
      a.state = 'calm'; a.target = null;
    } else if (a.state === 'flee') {
      speed = a.T.flee;
      const dx = a.pos.x - a.from.x, dz = a.pos.z - a.from.z, dd = Math.hypot(dx, dz) || 1;
      tx = a.pos.x + dx / dd * 4 + (this.r() - 0.5); tz = a.pos.z + dz / dd * 4 + (this.r() - 0.5);
      if (a.pen) { tx = Math.max(a.pen.x0 + 1.2, Math.min(a.pen.x1 - 0.2, tx)); tz = Math.max(a.pen.z0 + 1.2, Math.min(a.pen.z1 - 0.2, tz)); }
      if (a.timer <= 0) { a.state = 'calm'; a.alarmed = false; a.herd.cx = a.pos.x; a.herd.cz = a.pos.z; a.target = null; a.fleeing = false; }
    } else {
      if (!a.target || a.timer <= 0) {
        a.timer = 3 + this.r() * 6;
        const pen = a.pen;
        a.target = this.r() < 0.45 ? null : R ? (({ x, z }) => ({ x: x + 0.2 + this.r() * 0.6, z: z + 0.2 + this.r() * 0.6 }))(R.list[Math.floor(this.r() * R.list.length)])
          : pen ? { x: pen.x0 + 1.5 + this.r() * (pen.x1 - pen.x0 - 2), z: pen.z0 + 1.5 + this.r() * (pen.z1 - pen.z0 - 2) }
          : { x: a.herd.cx + (this.r() - 0.5) * 10, z: a.herd.cz + (this.r() - 0.5) * 10 };
        if (!a.target) a.timer = 2 + this.r() * 4; // graze / peck
      }
      if (a.target) {
        tx = a.target.x; tz = a.target.z; speed = a.T.walk;
        if (Math.hypot(tx - a.pos.x, tz - a.pos.z) < 0.4) a.target = null;
      }
      if (a.swimming) { speed = Math.max(speed, 1.2); if (!a.target) { const gx = a.herd.cx, gz = a.herd.cz; tx = gx; tz = gz; } }   // swim back to land
    }
    if (speed > 0) {
      if (a.swimming) speed = Math.min(speed, a.T.fierce ? 2.4 : 2);
      const dx = tx - a.pos.x, dz = tz - a.pos.z, dd = Math.hypot(dx, dz) || 1;
      this.face(a, Math.atan2(-dx, -dz), dt);
      const nx = a.pos.x + dx / dd * speed * dt, nz = a.pos.z + dz / dd * speed * dt;
      // grazers keep out of water unless fleeing; bears and wolves swim when they must
      if ((R && !R.tiles.has(Math.floor(nx) * 8192 + Math.floor(nz))) || !this.step(a, nx, nz, a.state === 'flee' || (a.T.swim && a.state === 'flee'))) {
        a.target = null; if (a.state === 'flee') a.from.set(nx * 2 - a.from.x, 0, nz * 2 - a.from.z);
      }
    }
    a.speed = speed;
    if (a.body) { a.body.rotation.x *= 0.85; if (a.head) a.head.rotation.x = speed ? 0 : Math.sin(a.phase * 0.2) * 0.15 - 0.2; if (a.jaw) a.jaw.rotation.x = 0; }
    this.legsAnim(a, dt, speed);
    for (const w of a.wings) w.rotation.z = 0;
  }
  updateFlying(a, dt, dist) {
    const w = this.game.world;
    a.phase += dt * 22;
    a.wings.forEach((wg, i) => { wg.rotation.z = Math.sin(a.phase) * 0.9 * (i ? -1 : 1); });
    a.legs.forEach((l) => { l.rotation.x = 1.2; });
    if (a.state === 'circle') {
      // airborne flock circling over its area
      a.ang += dt * 0.5;
      const R = 10;
      const tx = a.herd.cx + Math.cos(a.ang + a.phase * 0.0) * R, tz = a.herd.cz + Math.sin(a.ang) * R;
      const ty = a.herd.cy + Math.sin(a.ang * 2) * 1.5;
      const dx = tx - a.pos.x, dy = ty - a.pos.y, dz = tz - a.pos.z;
      a.pos.x += dx * Math.min(1, dt * 1.5); a.pos.y += dy * Math.min(1, dt * 1.5); a.pos.z += dz * Math.min(1, dt * 1.5);
      a.yaw = Math.atan2(-dx, -dz);
      return;
    }
    a.timer -= dt;
    a.pos.addScaledVector(a.flyVel, dt);
    a.flyVel.y = Math.max(a.flyVel.y - dt * 1.5, 0.2);
    a.yaw = Math.atan2(-a.flyVel.x, -a.flyVel.z);
    if (a.state === 'leave') {
      if (a.timer <= 0 || dist > 120 || a.pos.x < 0 || a.pos.z < 0 || a.pos.x > w.W || a.pos.z > w.D) this.remove(a);
      return;
    }
    if (a.timer <= 0) {
      // land again somewhere nearby
      const gy = this.ground(a.pos.x, a.pos.z, w.surfaceY(Math.floor(a.pos.x), Math.floor(a.pos.z)) + 0.5);
      if (gy != null) {
        a.flyVel.y = -3;
        if (a.pos.y <= gy + 0.2) { a.pos.y = gy; a.state = 'calm'; a.alarmed = false; a.herd.cx = a.pos.x; a.herd.cz = a.pos.z; a.target = null; }
      } else a.timer = 2;
    }
  }

  // ---- bears -------------------------------------------------------------------
  // Close to you (or hurt), a bear roars and charges; at arm's length it
  // attacks: it rears up on its hind legs and claws, or drops its head and
  // lunges to bite. Each attack winds up, strikes (only a strike hurts you,
  // and only if you are still in reach and in front) and recovers; then it
  // attacks again or follows you. Badly hurt, it may turn and run.
  updateBear(a, dt, d) {
    const g = this.game, P = g.player, pl = P.pos;
    if (a.state === 'flee' && a.fleeing) { a.rage = 0; return false; }
    a.rage = Math.max(0, (a.rage || 0) - dt);
    const wild = !a.owner;
    if (wild && d < 11 && !g.dead && !g.dying && Math.abs(pl.y - a.pos.y) < 6) a.rage = Math.max(a.rage, 6);
    if (a.rage <= 0 || g.dead || g.dying || P.dead) { this.endAttack(a); return false; }
    // badly hurt: run for it (more likely the more hurt it is), or fight on in a fury
    if (!a.decided && a.hp < a.T.hp * 0.35) {
      a.decided = true;
      if (this.r() < 0.55) { this.endAttack(a); a.state = 'flee'; a.fleeing = true; a.alarmed = true; a.timer = 14; a.from = pl.clone(); a.rage = 0; sfx.roar(0.6); return false; }
      a.rage = 40; sfx.roar(1);
    }
    const dx = pl.x - a.pos.x, dz = pl.z - a.pos.z, dd = Math.hypot(dx, dz) || 1;
    if (a.atk) { this.attackStep(a, dt, dd, dx, dz); return true; }
    this.face(a, Math.atan2(-dx, -dz), dt, 8);
    a.cool = (a.cool || 0) - dt;
    if (dd < 2.4 && Math.abs(pl.y - a.pos.y) < 2.2 && !a.swimming) {
      a.speed = 0;
      if (a.cool <= 0) this.startAttack(a, this.r() < 0.55 ? 'claw' : 'bite');
      this.legsAnim(a, dt, 0);
      return true;
    }
    // the charge: a roar first, then a run straight at you (swimming if it must)
    if (!a.charging) { a.charging = true; sfx.roar(Math.max(0.3, 1 - d / 30)); }
    const sp = a.swimming ? 2.6 : a.T.flee;
    this.go(a, dx / dd, dz / dd, sp * dt, dt);
    a.speed = sp;
    a.body.rotation.x *= 0.8; a.head.rotation.x = -0.15; a.jaw.rotation.x = 0.1;
    if (this.r() < dt * 0.35) sfx.growl(0.7);
    this.legsAnim(a, dt, sp);
    return true;
  }
  startAttack(a, kind) {
    const W = a.type === 'wolf' ? { wind: 0.32, strike: 0.16, rec: 0.42 } : kind === 'claw' ? { wind: 0.62, strike: 0.2, rec: 0.6 } : { wind: 0.45, strike: 0.18, rec: 0.55 };
    a.atk = { kind, t: 0, W, hit: false, lunge: 0 };
    if (a.type === 'wolf') sfx.snarl(0.9); else sfx.growl(1);
  }
  endAttack(a) { a.atk = null; a.charging = false; if (a.body) { a.body.rotation.x = 0; a.body.position.z = a.type === 'wolf' ? 0.42 : 0.55; } }
  attackStep(a, dt, dd, dx, dz) {
    const g = this.game, A = a.atk, W = A.W, T = A.t += dt;
    const wolf = a.type === 'wolf', claw = A.kind === 'claw';
    if (T < W.wind) this.face(a, Math.atan2(-dx, -dz), dt, 10);   // it tracks you while winding up
    const k = T < W.wind ? T / W.wind : T < W.wind + W.strike ? 1 : Math.max(0, 1 - (T - W.wind - W.strike) / W.rec);
    // pose: rearing up for a claw, crouching and stretching the head for a bite
    if (claw) {
      a.body.rotation.x = 1.05 * (T < W.wind + W.strike * 0.4 ? k : k * 0.6);
      a.legs[0].rotation.x = a.legs[1].rotation.x = -1.2 * k + (T > W.wind ? Math.sin(T * 30) * 0.5 : 0);
      a.legs[2].rotation.x = a.legs[3].rotation.x = 0.25 * k;
      a.head.rotation.x = -0.35 * k; a.jaw.rotation.x = 0.5 * k;
    } else {
      const crouch = T < W.wind ? -0.18 * k : 0.12;
      a.body.rotation.x = crouch; a.head.rotation.x = T < W.wind ? -0.3 * k : 0.25;
      a.jaw.rotation.x = T < W.wind ? 0.2 : T < W.wind + W.strike ? 0.75 : 0.75 * k;
      a.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -0.5 * k : 0.4 * k; });
    }
    // the strike: a short lunge, and it hurts only if you are still close and in front
    if (T >= W.wind && T < W.wind + W.strike) {
      const step = (claw ? 2.4 : wolf ? 5 : 4) * dt, fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
      if (dd > 1.1) this.step(a, a.pos.x + fx * step, a.pos.z + fz * step, false);
      if (!A.hit) {
        A.hit = true;
        const facing = (fx * dx + fz * dz) / (dd || 1), reach = wolf ? 1.9 : 2.8, P = g.player;
        if (dd < reach && facing > 0.35 && Math.abs(P.pos.y - a.pos.y) < 2.2 && !g.dead && !g.dying) {
          const dmg = wolf ? 7 : claw ? 17 : 13;
          if (claw) sfx.claw(); else sfx.bite(wolf ? 0.7 : 1);
          g.damage(dmg * (g.animalDmgMul || 1), wolf ? 'wolf' : 'bear', a.pos, { heavy: !wolf, bleed: true });
          if (!wolf) { const kx = -fx * 0, push = 3.5; P.vel.x += fx * push; P.vel.z += fz * push; void kx; }
        } else sfx.swish();
      }
    }
    if (T >= W.wind + W.strike + W.rec) {
      this.endAttack(a);
      a.cool = wolf ? 0.2 : 0.25 + this.r() * 0.3;
      if (wolf) { a.retreat = 1.1 + this.r() * 0.8; a.charging = true; }
      else a.charging = true;                    // no fresh roar: it presses on
    }
    a.speed = 0;
  }

  // ---- wolves ----------------------------------------------------------------
  // Each wolf follows its pack's mode: roam, circle (round you at a distance,
  // each at its own place in the ring), attack (rush in from its side, bite,
  // fall back, rush again) or flee.
  updatePack(herd, dt) {
    const P = herd.pack, g = this.game, pl = g.player.pos;
    const alive = herd.members.filter((m) => m.state !== 'dead');
    if (!alive.length) return;
    if (P.mode === 'flee') return;
    if (alive.length <= Math.max(1, Math.floor(P.size0 / 2))) {
      P.mode = 'flee'; sfx.yelp(0.8);
      for (const m of alive) { this.endAttack(m); m.state = 'flee'; m.fleeing = true; m.alarmed = true; m.timer = 25; m.from = pl.clone(); m.hunting = false; }
      return;
    }
    const lead = alive[0], d = Math.hypot(lead.pos.x - pl.x, lead.pos.z - pl.z);
    P.t += dt;
    const hungry = this.wolvesHunt();
    if (g.dead || g.dying) { if (P.mode !== 'roam') { P.mode = 'roam'; for (const m of alive) { this.endAttack(m); m.hunting = false; } } return; }
    if (P.mode === 'roam') {
      if ((d < 34 && hungry) || P.hurt) { P.mode = 'circle'; P.t = 0; P.spin = this.r() * 6.28; P.circleFor = 4 + this.r() * 4; alive.forEach((m, i) => { m.slot = i; m.hunting = true; m.state = 'calm'; }); }
    } else if (P.mode === 'circle') {
      P.spin += dt * 0.32;
      if (d > 60 && !P.hurt) { P.mode = 'roam'; for (const m of alive) m.hunting = false; }
      else if (P.t > P.circleFor || P.hurt) {
        // the leader howls, the others join, then they come
        if (!P.howled) { P.howled = true; P.t = P.circleFor; sfx.howl(Math.max(0.35, 1 - d / 60)); setTimeout(() => sfx.howl(Math.max(0.25, 0.8 - d / 60)), 700); }
        if (P.t > P.circleFor + 1.6 || P.hurt) { P.mode = 'attack'; alive.forEach((m, i) => { m.wait = i * 0.55 + this.r() * 0.3; }); }
      }
    } else if (P.mode === 'attack') {
      if (d > 70) { P.mode = 'roam'; P.howled = false; for (const m of alive) { this.endAttack(m); m.hunting = false; } }
    }
  }
  wolvesHunt() {
    const T = this.game.town;
    if (!T) return true;                                     // War: always hungry
    const h = (this.game.time % 1) * 24;
    return T.season === 'winter' || h < 6 || h > 20;         // Town Life: at night and in winter
  }
  updateWolf(a, dt, d) {
    const g = this.game, pl = g.player.pos, H = a.herd, P = H.pack;
    if (!P || P.mode === 'roam' || P.mode === 'flee' || !a.hunting) { if (a.atk) this.endAttack(a); return false; }
    const n = H.members.length, dx = pl.x - a.pos.x, dz = pl.z - a.pos.z, dd = Math.hypot(dx, dz) || 1;
    if (a.leap) return this.leapStep(a, dt);
    if (a.atk) { this.attackStep(a, dt, dd, dx, dz); this.legsAnim(a, dt, 0); return true; }
    a.pounceCool = (a.pounceCool || 2 + this.r() * 2) - dt;
    let tx, tz, sp;
    const ang = P.spin + (a.slot / n) * Math.PI * 2;
    if (P.mode === 'circle') {
      // circling, and now and then a fast dart in at you from the edge of the ring, snarling, and back out
      a.dartT = (a.dartT ?? 2 + this.r() * 4) - dt;
      if (a.dartT < 0) { if (a.dartT < -0.9) a.dartT = 3 + this.r() * 4; else if (a.dartT > -dt * 1.5) sfx.snarl(0.6); }
      const R = a.dartT < 0 && a.dartT > -0.45 ? 4.5 : 9; tx = pl.x + Math.cos(ang) * R; tz = pl.z + Math.sin(ang) * R; sp = a.dartT < 0 ? 8 : 4.4;
    }
    else {
      a.wait = (a.wait || 0) - dt; a.retreat = Math.max(0, (a.retreat || 0) - dt); a.cool = (a.cool || 0) - dt;
      if (a.wait > 0 || a.retreat > 0) { const R = a.retreat > 0 ? 5.5 : 8; tx = pl.x + Math.cos(ang) * R; tz = pl.z + Math.sin(ang) * R; sp = a.retreat > 0 ? 6 : 4; }
      else {
        // rush in from its own side, curving round to come at you from there
        const side = Math.min(1, Math.max(0, (dd - 2) / 6));
        tx = pl.x + Math.cos(ang) * 2.2 * side; tz = pl.z + Math.sin(ang) * 2.2 * side; sp = a.swimming ? 2.4 : 7.6;
        if (dd < 1.75 && a.cool <= 0 && !a.swimming && Math.abs(pl.y - a.pos.y) < 2) { this.face(a, Math.atan2(-dx, -dz), 1); this.startAttack(a, 'bite'); return true; }
        // from a few metres out it may launch itself at you: a pounce
        if (dd > 3 && dd < 6.5 && a.pounceCool <= 0 && !a.swimming && Math.abs(pl.y - a.pos.y) < 1.5 && this.r() < dt * 2.5) return this.startLeap(a, dx, dz, dd);
      }
    }
    const ex = tx - a.pos.x, ez = tz - a.pos.z, ed = Math.hypot(ex, ez);
    if (ed > 0.3) {
      const vx = ex / ed, vz = ez / ed;
      this.face(a, Math.atan2(-vx, -vz), dt, 7);
      const s = Math.min(sp, ed / Math.max(dt, 1e-3)) * dt;
      this.go(a, vx, vz, s, dt);
      a.speed = sp;
    } else { a.speed = 0; this.face(a, Math.atan2(-dx, -dz), dt, 6); }
    if (P.mode === 'circle' && P.howled && a.head) a.head.rotation.x = -0.9;   // muzzle up: howling
    else if (a.head) a.head.rotation.x = 0.1;
    if (a.body) a.body.rotation.x *= 0.8;
    this.legsAnim(a, dt, a.speed);
    return true;
  }
  // a pounce: a short arc through the air at where you are; landing on you is
  // a heavy hit that knocks you down for about a second
  startLeap(a, dx, dz, dd) {
    const pl = this.game.player.pos;
    this.face(a, Math.atan2(-dx, -dz), 1);
    a.leap = { t: 0, dur: 0.32 + dd * 0.045, fx: a.pos.x, fz: a.pos.z, fy: a.pos.y, tx: pl.x - dx / dd * 0.6, tz: pl.z - dz / dd * 0.6, ty: pl.y };
    a.pounceCool = 3.5 + this.r() * 3; sfx.snarl(1);
    return true;
  }
  leapStep(a, dt) {
    const L = a.leap, g = this.game, P = g.player;
    L.t += dt;
    const k = Math.min(1, L.t / L.dur);
    a.pos.x = L.fx + (L.tx - L.fx) * k; a.pos.z = L.fz + (L.tz - L.fz) * k;
    a.pos.y = L.fy + (L.ty - L.fy) * k + Math.sin(k * Math.PI) * 1.1;
    a.body.rotation.x = 0.5 - k * 0.9; a.head.rotation.x = -0.2; a.jaw.rotation.x = 0.7;
    a.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.2 : 1.0; });
    if (k >= 1) {
      a.leap = null; a.body.rotation.x = 0; a.vy = 0;
      const d = Math.hypot(P.pos.x - a.pos.x, P.pos.z - a.pos.z);
      if (d < 1.8 && Math.abs(P.pos.y - a.pos.y) < 1.6 && !g.dying && !g.dead) {
        sfx.bite(1); g.damage(7, 'wolf', a.pos, { heavy: true, bleed: true });
        if (g.knockDown) g.knockDown(1, a.pos);
      } else sfx.swish();
      a.retreat = 1.2 + this.r(); a.cool = 0.4;
    }
    return true;
  }
  // Keep at most two packs near the player. Town Life: they come out at
  // night and in winter, in the wild and round the farms; by day the far ones
  // move on. War: in woods, mountains and cold lands (not deserts or islands).
  manageWolves() {
    const g = this.game, pl = g.player.pos;
    if (!this.landOk('wolf')) return;
    const packs = this.herds.filter((h) => h.pack);
    for (const h of packs) {
      const alive = h.members.filter((m) => m.state !== 'dead');
      const c = alive[0] ? alive[0].pos : null;
      const far = !c || Math.hypot(c.x - pl.x, c.z - pl.z) > 150;
      if (!alive.length || (far && (h.pack.mode === 'flee' || (this.town && !this.wolvesHunt())))) for (const m of h.members.slice()) if (m.state !== 'dead' || m.dead > 3) this.remove(m);
    }
    const near = this.herds.filter((h) => h.pack && h.members.some((m) => m.state !== 'dead' && Math.hypot(m.pos.x - pl.x, m.pos.z - pl.z) < 150)).length;
    if (near >= 2 || (this.town && !this.wolvesHunt())) return;
    if (this.r() > (this.town ? 0.35 : 0.25)) return;        // they turn up now and then, not all at once
    this.spawnPack();
  }
  spawnPack() {
    const g = this.game, w = g.world, pl = g.player.pos;
    for (let tries = 0; tries < 30; tries++) {
      const ang = this.r() * Math.PI * 2, R = 70 + this.r() * 45;
      let x = pl.x + Math.cos(ang) * R, z = pl.z + Math.sin(ang) * R;
      if (!this.town && w.trees && w.trees.length && this.r() < 0.6) {      // War: from the woods
        const k = Math.floor(this.r() * w.trees.length / 2) * 2, tx = w.trees[k], tz = w.trees[k + 1];
        if (Math.hypot(tx - pl.x, tz - pl.z) > 60 && Math.hypot(tx - pl.x, tz - pl.z) < 140) { x = tx + 3; z = tz + 3; }
      }
      if (x < 10 || z < 10 || x > w.W - 10 || z > w.D - 10 || !this.wildOk(x, z)) continue;
      const sy = w.surfaceY(Math.floor(x), Math.floor(z));
      if (sy < SEA || w.get(Math.floor(x), sy + 1, Math.floor(z)) === B.WATER) continue;
      const herd = { type: 'wolf', cx: x, cz: z, moveT: 20, members: [], airborne: false, pack: { mode: 'roam', t: 0, spin: 0, size0: 0 } };
      const n = 4 + Math.floor(this.r() * 3);
      for (let i = 0; i < n; i++) {
        const ax = x + (this.r() - 0.5) * 5, az = z + (this.r() - 0.5) * 5, gy = this.ground(ax, az, sy + 1);
        if (gy != null) this.add('wolf', herd, ax, gy, az);
      }
      if (herd.members.length >= 3) { herd.pack.size0 = herd.members.length; this.herds.push(herd); return herd; }
      for (const m of herd.members.slice()) this.remove(m);
    }
    return null;
  }
  // Town Life: dead animals stay as carcasses until skinned (meat and hides)
  nearestCarcass(pos, r = 2.6) {
    let best = null, bd = r;
    for (const a of this.list) if (a.state === 'dead' && a.dead > 1 && !a.skinned) { const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z); if (d < bd && Math.abs(a.pos.y - pos.y) < 2.5) { bd = d; best = a; } }
    return best;
  }
  skin(a) {
    const g = this.game;
    a.skinned = true;
    g.give('meat_raw', a.T.meat);
    if (a.T.hide) g.give(a.T.hide, a.T.hides || 1);
    if (a.ownerCrime) a.ownerCrime(a);
    a.dead = Math.max(a.dead, 1e9);
    this.remove(a);
    return true;
  }
  toSaveLivestock() { return this.list.filter((a) => a.owner === 'player' && a.state !== 'dead').map((a) => ({ type: a.type, x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1), milk: a.milkT || 0, egg: a.eggT || 0 })); }

  updateDead(a, dt) {
    a.dead += dt;
    if (a.type !== 'bird') this.settle(a, dt);                // a body falls to the ground (or floats)
    if (this.town) {
      // carcass: stays until skinned (or for a few minutes)
      a.mesh.rotation.z = Math.min(Math.PI / 2, a.dead * 5);
      if (a.type === 'bird' && a.pos.y > 0) { const gy = this.ground(a.pos.x, a.pos.z, a.pos.y); if (gy == null || a.pos.y > gy + 0.05) a.pos.y -= dt * 8; if (gy != null && a.pos.y < gy) a.pos.y = gy; }
      a.mesh.position.copy(a.pos);
      if (!a.counted && a.dead > 1) { a.counted = true; if (!a.owner) this.game.stats.animals = (this.game.stats.animals || 0) + 1; }
      if (a.dead > 240) this.remove(a);
      return;
    }
    a.mesh.rotation.z = Math.min(Math.PI / 2, a.dead * 5);
    if (a.type === 'bird' && a.pos.y > 0) {
      const gy = this.ground(a.pos.x, a.pos.z, a.pos.y);
      if (gy == null || a.pos.y > gy + 0.05) a.pos.y -= dt * 8;
      if (gy != null && a.pos.y < gy) a.pos.y = gy;
      if (a.pos.y < SEA - 1 && this.game.world.get(Math.floor(a.pos.x), Math.floor(a.pos.y), Math.floor(a.pos.z)) === B.WATER) a.pos.y = SEA - 0.3;
    }
    a.mesh.position.copy(a.pos);
    if (a.dead > 1.2 && !a.dropped) {
      a.dropped = true;
      this.game.pickups.spawn('meat_raw', a.T.meat, a.pos.x, a.pos.y + 0.5, a.pos.z);
      this.game.stats.animals = (this.game.stats.animals || 0) + 1;
    }
    if (a.dead > 2.5) this.remove(a);
  }

  dispose() { for (const a of this.list.slice()) this.remove(a); }
}
