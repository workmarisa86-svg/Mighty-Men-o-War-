// Town Life terrain: a peaceful 1940s countryside of grassy rolling hills,
// woods, a river and lakes, a compact town center (the sheriff's office, the
// jail, the shops and the market stalls), homes spread far apart over the
// countryside (each with its own farm, joined to the center by dirt paths)
// and the player's cottage. Stone starts about 3 blocks
// down; iron is common in it and gold very rare. Sand lines the water and
// clay lies in the river beds. Village buildings and the cottage are locked
// (indestructible); fields, woods and everything else can be changed.
import { SEA, TOWN_SIZE, TOWN_LAYOUT } from './config.js';
import { B } from './blocks.js';
import { Simplex2, mulberry32, hash2 } from './noise.js';

export { TOWN_SIZE, TOWN_LAYOUT };      // (kept in config.js so the menus don't load Town Life's code)
// half-size of each kind of home
export const HOME_HALF = { mansion: 7, house: 5, cottage: 4 };

export function generateTown(world) {
  const { seed } = world.cfg;
  const W = world.W, D = world.D, H = world.H;
  const n1 = new Simplex2(seed), n2 = new Simplex2(seed + 1), n3 = new Simplex2(seed + 2);
  const n4 = new Simplex2(seed + 3), n5 = new Simplex2(seed + 4), n6 = new Simplex2(seed + 5);
  const rnd = mulberry32(seed + 99);
  const cx = Math.floor(W / 2), cz = Math.floor(D / 2);
  const VR = 34, VB = 44, ARM = 30;             // town center: flat radius, blend radius, road length

  // --- water mask: a winding river and a couple of lakes, never in the village
  const water = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W, dv = Math.hypot(x - cx, z - cz);
    const rv = Math.abs(n3.fbm(x / 170, z / 170, 2));
    const lk = n4.fbm(x / 80, z / 80, 2);
    let wet = rv < 0.028 || lk > 0.45;
    if (dv < VB + 4 || x < 4 || z < 4 || x >= W - 4 || z >= D - 4) wet = false;
    water[k] = wet ? 1 : 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    const copy = water.slice();
    for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
      const k = x + z * W; let n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) n += copy[k + dx + dz * W];
      water[k] = n >= 5 ? 1 : 0;
    }
  }
  const distLand = distanceField(W, D, (k) => water[k] === 1);
  const distWater = distanceField(W, D, (k) => water[k] === 0);

  // --- the cottage: out in the fields, on the driest of four diagonals
  let cot = null;
  for (const a of [0.8, 2.35, 3.9, 5.5].sort(() => rnd() - 0.5)) {
    const x = Math.floor(cx + Math.cos(a) * 82), z = Math.floor(cz + Math.sin(a) * 82);
    let wet = 0;
    for (let dz = -14; dz <= 14; dz += 2) for (let dx = -14; dx <= 14; dx += 2) wet += water[(x + dx) + (z + dz) * W] || 0;
    if (!cot || wet < cot.wet) cot = { x, z, wet };
  }
  for (let dz = -16; dz <= 16; dz++) for (let dx = -16; dx <= 16; dx++) {
    const k = (cot.x + dx) + (cot.z + dz) * W;
    if (Math.hypot(dx, dz) < 15) water[k] = 0;
  }
  for (let dz = -22; dz <= 22; dz++) for (let dx = -22; dx <= 22; dx++) if (Math.hypot(dx, dz) < 22) water[(cot.x + dx) + (cot.z + dz) * W] = 0;
  // --- homes: spread far apart over the countryside, each on dry ground
  // social status decides the home: mansions for the wealthy, houses for
  // the middle class, cottages for the poor (each home: a household of four adults)
  // fewer homes than before, but each one bigger and furnished (lighter to run)
  const STATUS = ['mansion', 'mansion', ...Array(6).fill('house'), ...Array(5).fill('cottage')];
  const HOMES = STATUS.length, homes = [];
  const wetness = (x, z, r) => { let n = 0; for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) n += water[(x + dx) + (z + dz) * W] || 0; return n; };
  const a0 = rnd() * Math.PI * 2;
  for (let k = 0; k < HOMES; k++) {
    const status = STATUS[k], half = HOME_HALF[status], flat = half + 11;
    let best = null;
    for (let tries = 0; tries < 60; tries++) {
      const a = a0 + (k * 2.399) + (rnd() - 0.5) * (tries < 20 ? 0.6 : 2.4), r = 50 + rnd() * 64;
      const x = Math.floor(cx + Math.cos(a) * r), z = Math.floor(cz + Math.sin(a) * r);
      if (x < flat + 4 || z < flat + 4 || x >= W - flat - 4 || z >= D - flat - 4) continue;
      if (Math.hypot(x - cot.x, z - cot.z) < 36 + half || homes.some((h) => Math.hypot(h.x - x, h.z - z) < h.flat + flat + 2)) continue;
      const wet = wetness(x, z, flat);
      if (!best || wet < best.wet) best = { x, z, wet, status, half, flat };
    }
    if (best) homes.push(best);
  }
  // each path leaves the center at the end of one of its four roads
  const armFor = (x, z) => Math.abs(x - cx) > Math.abs(z - cz)
    ? { x: cx + Math.sign(x - cx) * ARM + 0.5, z: cz + 0.5, axis: 'x' } : { x: cx + 0.5, z: cz + Math.sign(z - cz) * ARM + 0.5, axis: 'z' };
  const dryLine = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(a.x + (b.x - a.x) * i / n), z = Math.round(a.z + (b.z - a.z) * i / n);
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (x + dx > 0 && z + dz > 0 && x + dx < W && z + dz < D) water[(x + dx) + (z + dz) * W] = 0;
    }
  };
  for (const h of homes) {
    h.arm = armFor(h.x, h.z);
    const rr = h.flat + 5;
    for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) if (Math.hypot(dx, dz) < rr && h.x + dx > 0 && h.z + dz > 0 && h.x + dx < W && h.z + dz < D) water[(h.x + dx) + (h.z + dz) * W] = 0;
    dryLine(h.arm, h);
  }
  dryLine(armFor(cot.x, cot.z), cot);
  const distLand2 = distanceField(W, D, (k) => water[k] === 1);

  // --- heightmap: rolling hills
  const tops = new Int16Array(W * D);
  const raw = (x, z) => SEA + 5 + n1.fbm(x / 130, z / 130, 3) * 7 + n2.fbm(x / 38, z / 38, 2) * 1.6;
  const hv = Math.max(SEA + 3, Math.round(raw(cx, cz)));
  const hc = Math.max(SEA + 2, Math.round(raw(cot.x, cot.z)));
  for (const h of homes) h.y = Math.max(SEA + 2, Math.round(raw(h.x, h.z)));
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    if (water[k]) { tops[k] = SEA - 1 - Math.min(6, Math.ceil(distWater[k] / 2.2)); continue; }
    let h = raw(x, z);
    const shore = SEA - 1 + (distLand2[k] - 1) / 3;
    h = Math.min(h, shore);
    const dv = Math.hypot(x - cx, z - cz);
    if (dv < VB) { const t = dv < VR ? 0 : smooth((dv - VR) / (VB - VR)); h = hv + (h - hv) * t; }
    const dc = Math.hypot(x - cot.x, z - cot.z);
    if (dc < 22) { const t = dc < 16 ? 0 : smooth((dc - 16) / 6); h = hc + (h - hc) * t; }
    for (const o of homes) { const dh = Math.hypot(x - o.x, z - o.z); if (dh < o.flat + 5) { const t = dh < o.flat ? 0 : smooth((dh - o.flat) / 5); h = o.y + (h - o.y) * t; } }
    tops[k] = Math.max(SEA - 1, Math.round(h));
  }
  // no cliffs: neighbours differ by one block at most
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const k = x + z * W;
      if (x > 0) tops[k] = Math.min(tops[k], tops[k - 1] + 1);
      if (z > 0) tops[k] = Math.min(tops[k], tops[k - W] + 1);
    }
    for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
      const k = x + z * W;
      if (x < W - 1) tops[k] = Math.min(tops[k], tops[k + 1] + 1);
      if (z < D - 1) tops[k] = Math.min(tops[k], tops[k + W] + 1);
    }
  }
  for (let k = 0; k < W * D; k++) tops[k] = Math.max(4, Math.min(H - 14, tops[k]));
  // the village and cottage stay perfectly flat (the smoothing above can only lower)
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (Math.hypot(x - cx, z - cz) < VR) tops[x + z * W] = hv;
    if (Math.hypot(x - cot.x, z - cot.z) < 16) tops[x + z * W] = hc;
    for (const o of homes) if (Math.hypot(x - o.x, z - o.z) < o.flat) tops[x + z * W] = o.y;
  }
  // ...and the ground ramps up to them (no ledge at the edge of a flat yard)
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const k = x + z * W;
      if (water[k]) continue;
      if (x > 0) tops[k] = Math.max(tops[k], tops[k - 1] - 1);
      if (z > 0) tops[k] = Math.max(tops[k], tops[k - W] - 1);
    }
    for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
      const k = x + z * W;
      if (water[k]) continue;
      if (x < W - 1) tops[k] = Math.max(tops[k], tops[k + 1] - 1);
      if (z < D - 1) tops[k] = Math.max(tops[k], tops[k + W] - 1);
    }
  }

  // --- columns: grass over dirt, stone ~3 down, sand at the water, clay below it
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W, top = tops[k];
    const nearWater = distLand2[k] <= 2.5 && top <= SEA + 1;
    const clayHere = n5.noise(x / 9, z / 9) > 0.25;
    let surf;
    if (water[k]) surf = clayHere ? B.CLAY : B.SAND;
    else if (nearWater) surf = B.SAND;
    else surf = B.GRASS;
    for (let y = 0; y <= top; y++) {
      let b;
      if (y === 0 || (y === 1 && hash2(x, z, seed + 9) < 0.5)) b = B.BEDROCK;
      else if (y === top) b = surf;
      else if (y >= top - 2) b = (surf === B.SAND || water[k]) ? (clayHere && water[k] ? B.CLAY : B.SAND) : B.DIRT;
      else b = B.STONE;
      world.data[world.idx(x, y, z)] = b;
    }
    for (let y = top + 1; y < SEA; y++) world.data[world.idx(x, y, z)] = B.WATER;
  }
  // clay pockets in the banks too (easy to find)
  for (let i = 0; i < W * D / 900; i++) {
    const x = 4 + Math.floor(rnd() * (W - 8)), z = 4 + Math.floor(rnd() * (D - 8)), k = x + z * W;
    if (distLand2[k] > 4 || water[k]) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx, Z = z + dz, t = tops[X + Z * W];
      for (let y = t - 1; y >= t - 2; y--) if (world.data[world.idx(X, y, Z)] !== B.BEDROCK) world.data[world.idx(X, y, Z)] = B.CLAY;
    }
  }

  // --- ore: iron veins in the stone, gold very rare and deep
  const vein = (x, y, z, len, id) => {
    for (let i = 0; i < len; i++) {
      if (world.inside(x, y, z) && y > 1 && y < tops[x + z * W] - 2 && world.data[world.idx(x, y, z)] === B.STONE) world.data[world.idx(x, y, z)] = id;
      const r = rnd();
      if (r < 0.33) x += rnd() < 0.5 ? 1 : -1; else if (r < 0.66) z += rnd() < 0.5 ? 1 : -1; else y += rnd() < 0.5 ? 1 : -1;
    }
  };
  for (let i = 0; i < W * D / 70; i++) { const x = rnd() * W | 0, z = rnd() * D | 0; vein(x, tops[x + z * W] - 3 - Math.floor(rnd() * 8), z, 3 + (rnd() * 5 | 0), B.IRON); }
  for (let i = 0; i < W * D / 4500; i++) { const x = rnd() * W | 0, z = rnd() * D | 0; vein(x, tops[x + z * W] - 8 - Math.floor(rnd() * 10), z, 1 + (rnd() * 2 | 0), B.GOLD); }

  world.tops = tops;
  const put = (x, y, z, id, lock = true) => {
    if (!world.inside(x, y, z)) return;
    const i = world.idx(x, y, z);
    world.data[i] = id; world.locked[i] = lock && id !== B.AIR ? 1 : 0;
  };
  const village = buildVillage(world, put, cx, cz, hv, rnd, homes, ARM);
  const cottage = buildCottage(world, put, cot.x, hc, cot.z, cx, cz);
  // dirt paths from the ends of the center's roads out to every home and the cottage
  for (const b of village.buildings) if (b.type === 'house') b.trail = pave(world, b.arm, b.door);
  const cotArm = armFor(cot.x, cot.z);
  village.cottageRoad = { from: cotArm, to: cottage.door, trail: pave(world, cotArm, cottage.door) };

  // --- woods: oaks in forest patches, a few lone trees in the fields
  const clear = (x, z) => Math.hypot(x - cx, z - cz) < VB + 2 || Math.hypot(x - cot.x, z - cot.z) < 24 || homes.some((o) => Math.hypot(x - o.x, z - o.z) < o.flat + 4);
  for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
    const forest = n6.fbm(x / 60, z / 60, 2);
    const p = forest > 0.25 ? 0.05 : 0.004;
    if (hash2(x, z, seed + 31) > p) continue;
    const top = tops[x + z * W];
    if (top <= SEA || clear(x, z) || world.get(x, top, z) !== B.GRASS) continue;
    let flat = true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(tops[x + dx + (z + dz) * W] - top) > 1) flat = false;
    if (!flat || world.get(x, top + 1, z) !== B.AIR) continue;
    plantOak(world, x, top + 1, z, mulberry32(Math.floor(hash2(x, z, seed + 77) * 1e9)));
  }

  world.sites.push({ type: 'cabin', x: cottage.x, y: cottage.y, z: cottage.z, r: cottage.r, bed: cottage.bed, chest: cottage.chest, fire: cottage.fire, door: cottage.door, pen: cottage.pen, garden: cottage.garden });
  world.sites.push(village);
  world.spawn = { x: cottage.x + 0.5, y: cottage.y, z: cottage.z + 0.5 };
}

const smooth = (t) => t * t * (3 - 2 * t);

// A dirt path (2 wide) from a to b over the grass. Returns the walking points
// along it (every 3 blocks, at the highest ground of the next stretch), from a
// to b, without the two ends.
function pave(world, a, b) {
  const W = world.W, tops = world.tops, pts = [];
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
  const cell = (i) => ({ x: Math.floor(a.x + (b.x - a.x) * i / n), z: Math.floor(a.z + (b.z - a.z) * i / n) });
  for (let i = 0; i <= n; i++) {
    const { x, z } = cell(i);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) {
      const X = x + dx, Z = z + dz, t = tops[X + Z * W];
      if (world.get(X, t, Z) === B.GRASS && !world.isLocked(X, t, Z)) world.data[world.idx(X, t, Z)] = B.PATH;
    }
  }
  for (let i = 3; i < n - 1; i += 3) {
    let y = 0;
    for (let j = i - 2; j <= Math.min(n, i + 1); j++) { const c = cell(j); y = Math.max(y, tops[c.x + c.z * W] + 1); }
    const c = cell(i);
    pts.push({ x: c.x + 0.5, y, z: c.z + 0.5 });
  }
  return pts;
}

// A round-crowned oak with a sturdy trunk.
export function plantOak(world, x, y, z, r) {
  const h = 5 + Math.floor(r() * 3);
  const set = (X, Y, Z, id) => { if (world.inside(X, Y, Z) && world.get(X, Y, Z) === B.AIR) world.data[world.idx(X, Y, Z)] = id; };
  for (let i = 0; i < h; i++) set(x, y + i, z, B.LOG);
  const ty = y + h - 1, rad = 2 + (r() < 0.6 ? 1 : 0);
  for (let dy = -2; dy <= 2; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
    const d = dx * dx + dz * dz + dy * dy * 1.6;
    if (d > rad * rad + 0.8 || (d > rad * rad - 1 && r() < 0.4)) continue;
    set(x + dx, ty + dy + 1, z + dz, B.LEAVES);
  }
}

// ------------------------------------------------------------------ village
// The town center: two short crossing roads with a plaza, the sheriff's
// office, the jail, the general store, the butcher, the hunting store and the
// market stalls, all close together. Then the homes, far apart over the
// countryside, each with a field of crops beside it (one also has the
// village's livestock pen). Returns the village site: buildings (door,
// inside spot, keeper spot; homes also have the road end their path leaves
// from), the fields and the pen.
function buildVillage(world, put, cx, cz, hv, rnd, homes, ARM) {
  const floorY = hv, base = hv + 1;
  // roads (3 wide) and the plaza
  for (let d = -ARM; d <= ARM; d++) for (let w = -1; w <= 1; w++) {
    put(cx + d, floorY, cz + w, B.PATH, false); put(cx + w, floorY, cz + d, B.PATH, false);
  }
  for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) put(cx + dx, floorY, cz + dz, B.PATH, false);
  // a stone well in the plaza: its water stands level with the rim (no
  // shaft to fall into: one block deep, so anyone in it can step back out),
  // under a little thatched roof on two posts
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const X = cx - 5 + dx, Z = cz + 5 + dz;
    if (dx || dz) { put(X, base, Z, B.STONE); } else { put(X, floorY, Z, B.STONE); put(X, base, Z, B.WATER, false); }
  }
  for (const dx of [-1, 1]) for (let y = base + 1; y <= base + 2; y++) put(cx - 5 + dx, y, cz + 5, B.LOG);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) put(cx - 5 + dx, base + 3, cz + 5 + dz, B.THATCH);

  const buildings = [];
  // slot: footprint and which wall has the door (facing the road)
  const slot = (x0, z0, x1, z1, side) => ({ x0: cx + x0, z0: cz + z0, x1: cx + x1, z1: cz + z1, side });
  const plan = [
    ['hall', slot(-20, -13, -11, -4, 's'), B.BRICK],          // the sheriff's office
    ['jail', slot(-9, -14, -3, -8, 's'), B.STONE],
    ['general', slot(11, -12, 19, -4, 's'), B.WOOD],
    ['butcher', slot(-19, 4, -12, 11, 'n'), B.BRICK],
    ['hunting', slot(11, 4, 18, 11, 'n'), B.LOG],
    ['stable', slot(14, 14, 23, 22, 'w'), B.WOOD],
  ];
  for (const [type, s, wall] of plan) buildings.push(building(world, put, s, base, wall, type));
  // the hitching rail in front of the stable, where its horses wait
  { const st = buildings.find((b) => b.type === 'stable'), dz = Math.floor(st.door.z);
    for (let z = st.z0 - 2; z <= st.z1 + 2; z++) if (Math.abs(z - dz) > 2) put(st.x0 - 7, base, z, B.FENCE);   // an opening in front of the door
    st.hitch = { x: st.x0 - 4.5, y: base, z: st.z0 + 1.5 }; }
  // market stalls in the plaza: posts, a thatch canopy and a counter with goods
  const stall = (x0, z0, goods) => {
    const x1 = x0 + 4, z1 = z0 + 2;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (let y = base; y < base + 3; y++) put(x, y, z, B.LOG);
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) put(x, base + 3, z, B.THATCH);
    for (let x = x0 + 1; x < x1; x++) { put(x, base, z1, B.WOOD); if (goods) put(x, base + 1, z1, goods[(x - x0 - 1) % goods.length]); }
    return { x0, z0, x1, z1 };
  };
  {
    const s = stall(cx + 2, cz - 6, null);
    buildings.push({ type: 'market', door: { x: cx + 4.5, y: base, z: s.z1 + 1.6 }, inside: { x: cx + 4.5, y: base, z: s.z0 + 0.5 }, keeper: { x: cx + 4.5, y: base, z: s.z1 - 1 + 0.4 }, x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 });
    stall(cx + 2, cz + 4, [B.CABBAGE_R, B.SUPPLY, B.CARROT_R]);
  }
  // the homes, each facing the road its path comes from, with a field beside it
  const fields = [], pens = [];
  const WALL = { mansion: [B.BRICK, B.BRICK, B.BRICK], house: [B.WOOD, B.BRICK, B.WOOD], cottage: [B.LOG, B.LOG, B.LOG] };
  const HIGH = { mansion: 7, house: 4, cottage: 3 };
  const crops = ['wheat', 'carrot', 'cabbage'];
  let penDone = false;
  homes.forEach((h, k) => {
    const hb = h.y + 1, H = h.half;
    const dx = h.arm.x - h.x, dz = h.arm.z - h.z;
    const side = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'e' : 'w') : (dz > 0 ? 's' : 'n');
    const b = building(world, put, { x0: h.x - H, z0: h.z - H, x1: h.x + H - 1, z1: h.z + H - 1, side }, hb, WALL[h.status][k % 3], 'house', HIGH[h.status], h.status);
    b.arm = h.arm; b.status = h.status;
    homeDetails(world, put, b, hb, h.status);
    // the front door: closed, opened by the household (and for welcome guests)
    for (const [x, y, z] of b.doorCells) put(x, y, z, B.HDOOR);
    buildings.push(b);
    // local frame: u toward the door, w to the side
    const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[side], sv = [-out[1], out[0]];
    const L = (u, w) => ({ x: Math.floor(h.x + out[0] * u + sv[0] * w), z: Math.floor(h.z + out[1] * u + sv[1] * w) });
    const P = (u, w) => { const c = L(u, w); return { x: c.x + 0.5, y: hb, z: c.z + 0.5 }; };
    const crop = crops[k % crops.length], id = { wheat: B.WHEAT_R, carrot: B.CARROT_R, cabbage: B.CABBAGE_R }[crop];
    const fu = h.status === 'mansion' ? 5 : h.status === 'house' ? 3 : 2, fw0 = H + 2, fw1 = H + (h.status === 'mansion' ? 7 : h.status === 'house' ? 5 : 4);
    const f = { x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9, y: hb, crop, home: b, gate: P(H + 1.5, H + 1.5), spots: [] };
    for (let u = -fu; u <= fu; u++) for (let w = fw0; w <= fw1; w++) {
      const c = L(u, w);
      put(c.x, h.y, c.z, B.FARMLAND, false);
      put(c.x, hb, c.z, (c.x + c.z) % 5 === 0 ? B.SPROUT : id, false);
      f.x0 = Math.min(f.x0, c.x); f.x1 = Math.max(f.x1, c.x); f.z0 = Math.min(f.z0, c.z); f.z1 = Math.max(f.z1, c.z);
    }
    for (let w = fw0; w <= fw1; w++) f.spots.push(P(fu + 1.5, w));
    fields.push(f); b.field = f;
    if (!penDone && h.status !== 'cottage') {
      // the village's livestock pen on the other side of a big farm
      penDone = true;
      const p = { x0: 1e9, z0: 1e9, x1: -1e9, z1: -1e9, owner: 'village' };
      for (const [u, w] of [[-3, -H - 3], [4, -H - 10]]) { const c = L(u, w); p.x0 = Math.min(p.x0, c.x); p.x1 = Math.max(p.x1, c.x); p.z0 = Math.min(p.z0, c.z); p.z1 = Math.max(p.z1, c.z); }
      for (let x = p.x0; x <= p.x1; x++) for (const z of [p.z0, p.z1]) put(x, hb, z, B.FENCE);
      for (let z = p.z0; z <= p.z1; z++) for (const x of [p.x0, p.x1]) put(x, hb, z, B.FENCE);
      pens.push(p); b.pen = p;
    }
  });
  return { type: 'village', cx, cz, y: base, floorY, buildings, fields, pens, radius: 36 };
}

// One building: walls, a door facing the road, glass windows, a plank floor,
// a pitched thatch roof (shops and houses) or a flat brick top (town hall).
function building(world, put, s, base, wall, type, H = 4, status = null) {
  const roof = type === 'hall' ? B.BRICK : status === 'mansion' ? B.STONE : B.THATCH;   // mansions: a grey slate roof
  const bars = type === 'jail' ? B.FENCE : B.GLASS;
  const { x0, z0, x1, z1, side } = s;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    for (let y = base; y < base + H + 6; y++) put(x, y, z, B.AIR);
    put(x, base - 1, z, B.WOOD);
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (edge) for (let y = base; y < base + H; y++) put(x, y, z, wall);
  }
  // pitched roof along the longer side
  const alongX = x1 - x0 >= z1 - z0;
  const span = alongX ? z1 - z0 : x1 - x0;
  for (let k = 0; k <= Math.ceil(span / 2); k++) {
    const y = base + H + k;
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      const t = alongX ? Math.min(z - (z0 - 1), (z1 + 1) - z) : Math.min(x - (x0 - 1), (x1 + 1) - x);
      if (t === k || (t > k && k === Math.ceil(span / 2))) put(x, y, z, roof);
      // gable ends filled with wall
      const end = alongX ? (x === x0 || x === x1) : (z === z0 || z === z1);
      if (t > k && end && x >= x0 && x <= x1 && z >= z0 && z <= z1) put(x, y, z, wall);
    }
  }
  // door (2 wide, 3 high: room for people and horses) in the middle of the road-side wall
  const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
  const door = side === 's' ? { x: mx, z: z1 } : side === 'n' ? { x: mx, z: z0 } : side === 'e' ? { x: x1, z: mz } : { x: x0, z: mz };
  const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[side];
  const along = out[0] ? [0, 1] : [1, 0];                      // along the door's wall
  const doorCells = [];
  for (let k = 0; k <= 1; k++) for (let y = base; y <= base + 2; y++) {
    const X = door.x + along[0] * k, Z = door.z + along[1] * k;
    put(X, y, Z, B.AIR); doorCells.push([X, y, Z]);
  }
  const isDoor = (x, z) => doorCells.some(([X, , Z]) => X === x && Z === z);
  // windows on the other walls (mansions: two rows, upstairs too, and a
  // wooden band between the floors)
  const rows = status === 'mansion' ? [base + 1, base + 4] : [base + 1];
  if (status === 'mansion') for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if ((x === x0 || x === x1 || z === z0 || z === z1)) put(x, base + 3, z, B.WOOD);
  for (const wy of rows) {
    for (let x = x0 + 2; x < x1 - 1; x += 3) for (const z of [z0, z1]) if (!isDoor(x, z)) { put(x, wy, z, bars); if (status === 'mansion') put(x, wy + 1, z, bars); }
    for (let z = z0 + 2; z < z1 - 1; z += 3) for (const x of [x0, x1]) if (!isDoor(x, z)) { put(x, wy, z, bars); if (status === 'mansion') put(x, wy + 1, z, bars); }
  }
  const inner = { x: mx + 0.5, y: base, z: mz + 0.5 };
  const dc = { x: door.x + 0.5 + along[0] * 0.5, z: door.z + 0.5 + along[1] * 0.5 };   // the middle of the doorway
  const b = {
    type, x0, z0, x1, z1, side, doorCells,
    door: { x: dc.x + out[0] * 1.6, y: base, z: dc.z + out[1] * 1.6 },
    doorIn: { x: dc.x - out[0] * 1.4, y: base, z: dc.z - out[1] * 1.4 },
    inside: inner,
  };
  if (type === 'jail') {
    // a barred cell along the back wall; its 2-wide door of bars is shut
    // only while you are locked up (town.js); a cot along the back wall
    const z = side === 's' ? z0 + 2 : z1 - 2, zc = side === 's' ? z0 + 1 : z1 - 1;
    for (let x = x0 + 1; x < x1; x++) if (x !== mx && x !== mx + 1) for (let y = base; y < base + 3; y++) put(x, y, z, B.FENCE);
    b.cell = {
      door: [mx, mx + 1].flatMap((x) => [base, base + 1, base + 2].map((y) => [x, y, z])),
      inside: { x: mx + 0.5 + 1, y: base, z: zc + 0.5 },
      cot: { x: x0 + 1, z: zc, y: base, len: 2, dir: [1, 0] },          // from (x0+1) along +x, 2 long
      out: { x: mx + 1, y: base, z: side === 's' ? z + 1.6 : z - 0.6 },
    };
  } else if (type !== 'house') {
    // a counter across the room with the keeper behind it, and an open gap
    // at one end (the pass-through the keeper uses: he never climbs over)
    const cx = door.x - out[0] * 3, czz = door.z - out[1] * 3;
    const inRoom = (k) => { const X = cx + along[0] * k, Z = czz + along[1] * k; return X > x0 && X < x1 && Z > z0 && Z < z1; };
    // the counter (3 long) and a 2-wide gap at its end that the keeper walks
    // straight through
    const gapK = inRoom(-2) && inRoom(-1) ? -1.5 : 3.5;
    for (let k = 0; k <= 2; k++) if (inRoom(k)) put(cx + along[0] * k, base, czz + along[1] * k, B.WOOD);
    for (const k of gapK < 0 ? [-2, -1] : [3, 4]) if (inRoom(k)) { put(cx + along[0] * k, base, czz + along[1] * k, B.AIR); put(cx + along[0] * k, base + 1, czz + along[1] * k, B.AIR); }
    const G = { x: cx + 0.5 + along[0] * gapK, z: czz + 0.5 + along[1] * gapK };
    const mid = { x: cx + along[0] * 1 + 0.5, z: czz + along[1] * 1 + 0.5 };
    b.keeper = { x: mid.x - out[0] * 1.3, y: base, z: mid.z - out[1] * 1.3 };
    b.counter = { x: mid.x + out[0] * 1.2, y: base, z: mid.z + out[1] * 1.2 };
    b.flap = [{ x: G.x - out[0] * 1.3, y: base, z: G.z - out[1] * 1.3 }, { x: G.x, y: base, z: G.z }, { x: G.x + out[0] * 1.3, y: base, z: G.z + out[1] * 1.3 }];
  }
  return b;
}

// A home's own look and its furniture. Mansions: a pillared porch with lamps,
// two brick chimneys and clipped hedges; houses: a covered porch on log
// posts and a stone chimney; cottages: a stone chimney. Inside every home
// (positions only; furniture.js draws them): a bed for each of the four who
// live there (a double bed and two singles, along the back wall), a table with
// chairs, a sofa, a cupboard and a rug; mansions and houses also a fireplace.
function homeDetails(world, put, b, base, status) {
  const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[b.side], al = out[0] ? [0, 1] : [1, 0];
  const ix0 = b.x0 + 1, ix1 = b.x1 - 1, iz0 = b.z0 + 1, iz1 = b.z1 - 1;
  const D = out[0] ? ix1 - ix0 + 1 : iz1 - iz0 + 1, Wd = out[0] ? iz1 - iz0 + 1 : ix1 - ix0 + 1;
  // the back-left inside corner; a = cells from the back wall toward the door, c = cells along the back wall
  const cx0 = out[0] < 0 ? ix1 : ix0, cz0 = out[1] < 0 ? iz1 : iz0;
  const cell = (a, c) => ({ x: cx0 + out[0] * a + al[0] * c, z: cz0 + out[1] * a + al[1] * c });
  const pt = (a, c) => ({ x: cx0 + 0.5 + out[0] * a + al[0] * c, y: base, z: cz0 + 0.5 + out[1] * a + al[1] * c });
  const sideWall = (c, a) => { const q = cell(a, c); return q; };
  const dirOut = { x: out[0], z: out[1] }, dirAl = { x: al[0], z: al[1] };
  // beds: the parents' double bed and two singles, heads to the back wall
  const bedC = Wd >= 12 ? [0, 8, 11] : Wd >= 8 ? [0, 5, 7] : [0, 3, 5];
  const beds = [
    { c: bedC[0], w: 2 }, { c: bedC[1], w: 1 }, { c: bedC[2], w: 1 },
  ].map((q) => ({ ...q, foot: pt(1.5, q.c + (q.w - 1) / 2), head: { x: -out[0], z: -out[1] }, pos: pt(0.5, q.c + (q.w - 1) / 2) }));
  // sleeping places: father and mother share the double bed, the sons the singles
  const slots = [pt(0, 0), pt(0, 1), pt(0, bedC[1]), pt(0, bedC[2])].map((q) => ({ foot: { x: q.x + out[0] * 1.5, y: base, z: q.z + out[1] * 1.5 }, dir: { x: -out[0], z: -out[1] }, side: { x: q.x + out[0] * 2.4, y: base, z: q.z + out[1] * 2.4 } }));
  // the dining table on the right side, clear of the way in from the door:
  // mansions a long table (2 wide, 4 long) with chairs both sides; houses and
  // cottages a narrow one (1 x 3) against the wall, chairs along it and one at the end
  const chairs = [];
  let table;
  if (status === 'mansion') {
    const ta = 5, tl = 4, tc = Wd - 3;
    table = { center: pt(ta + 1.5, tc + 0.5), len: tl, wide: 2, dirOut, dirAl };
    for (let i = 0; i < tl; i++) { chairs.push({ ...pt(ta + i, tc - 1), face: { x: al[0], z: al[1] } }); chairs.push({ ...pt(ta + i, tc + 2), face: { x: -al[0], z: -al[1] } }); }
  } else {
    const ta = status === 'house' ? 3 : 2, tl = 3, tc = Wd - 1;
    table = { center: pt(ta + 1, tc), len: tl, wide: 1, dirOut, dirAl };
    for (let i = 0; i < tl; i++) chairs.push({ ...pt(ta + i, tc - 1), face: { x: al[0], z: al[1] } });
    chairs.push({ ...pt(ta + tl, tc), face: { x: -out[0], z: -out[1] } });
  }
  // the sofa along the left wall, facing into the room; a cupboard by the door; a rug
  const sl = Wd >= 12 ? 3 : 2, sa = status === 'mansion' ? 6 : status === 'house' ? 4 : 3;
  const sofa = { at: pt(sa + (sl - 1) / 2, 0), len: sl, face: { x: al[0], z: al[1] }, dirOut };
  const cupboard = { at: pt(D - 1, 0), face: { x: -out[0], z: -out[1] } };
  const rug = Wd >= 8 ? { at: pt(Math.floor(D / 2) + 0.5, Math.floor(Wd / 2) - 0.5), w: Wd >= 12 ? 4 : 3, d: Wd >= 12 ? 5 : 3, dirOut } : null;
  // a fireplace in the left wall (mansions and houses): bricks in the wall, a chimney above the roof
  let fireplace = null;
  if (status !== 'cottage') {
    const fa = status === 'mansion' ? 3 : 2, w = cell(fa, -1);   // the left wall cell, between the beds and the sofa
    const roofTop = base + (status === 'mansion' ? 7 : 4) + Math.ceil(Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2) + 2;
    for (let y = base; y <= roofTop; y++) put(w.x, y, w.z, B.BRICK);
    for (let y = base + (status === 'mansion' ? 7 : 4); y <= roofTop; y++) put(w.x - al[0], y, w.z - al[1], B.BRICK);   // the stack outside
    fireplace = { at: pt(fa, 0), face: { x: al[0], z: al[1] } };
  } else {
    // a cottage's stone chimney at the back corner
    const c = cell(-1, -1), top = base + 3 + Math.ceil((b.x1 - b.x0) / 2) + 1;
    for (let y = base; y <= top; y++) put(c.x, y, c.z, B.STONE);
  }
  const front = (a, c) => ({ x: Math.floor(b.door.x - out[0] * 1.6 + 0.5 * 0) + 0, z: 0 });
  void front; void sideWall;
  // outside the front door
  const dx0 = Math.floor(b.door.x - out[0] * 1.6 - al[0] * 0.5), dz0 = Math.floor(b.door.z - out[1] * 1.6 - al[1] * 0.5);   // the first doorway cell
  const O = (u, c) => ({ x: dx0 + out[0] * u + al[0] * c, z: dz0 + out[1] * u + al[1] * c });
  if (status === 'mansion') {
    // a pillared porch: four stone pillars, a slate roof, lamps either side, hedges
    for (const c of [-3, -2, 3, 4]) { const q = O(3, c); for (let y = base; y <= base + 3; y++) put(q.x, y, q.z, B.STONE); }
    for (let u = 1; u <= 3; u++) for (let c = -3; c <= 4; c++) { const q = O(u, c); put(q.x, base + 4, q.z, u === 3 ? B.STONE : B.WOOD); }
    for (const c of [-5, 6]) { const q = O(2, c); put(q.x, base, q.z, B.FENCE); put(q.x, base + 1, q.z, B.FENCE); put(q.x, base + 2, q.z, B.FORT_LAMP); }
    for (const c of [-6, -5, -4, 5, 6, 7]) { const q = O(5, c); put(q.x, base, q.z, B.LEAVES); }
    // a second brick chimney on the far side wall
    const c2 = cell(Math.floor(D / 2), Wd), top2 = base + 7 + Math.ceil(Math.max(b.x1 - b.x0, b.z1 - b.z0) / 2) + 2;
    for (let y = base + 7; y <= top2; y++) put(c2.x, y, c2.z, B.BRICK);
  } else if (status === 'house') {
    // a covered porch on two log posts
    for (const c of [-2, 3]) { const q = O(2, c); for (let y = base; y <= base + 2; y++) put(q.x, y, q.z, B.LOG); }
    for (let u = 1; u <= 2; u++) for (let c = -2; c <= 3; c++) { const q = O(u, c); put(q.x, base + 3, q.z, B.THATCH); }
  }
  b.furn = { status, beds, slots, table, chairs, sofa, cupboard, rug, fireplace, base, dirOut, dirAl };
}

// The player's cottage: stone and plank walls, thatch roof, glass windows,
// an ever-burning fire, a bed and a chest. Next to it a fenced pen for
// livestock and a small tilled garden.
function buildCottage(world, put, cx, by, cz, vx, vz) {
  const R = 3, base = by + 1;
  // face the door toward the village
  const dxv = vx - cx, dzv = vz - cz;
  const side = Math.abs(dxv) > Math.abs(dzv) ? (dxv > 0 ? 'e' : 'w') : (dzv > 0 ? 's' : 'n');
  for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const x = cx + dx, z = cz + dz;
    for (let y = base; y <= base + 7; y++) put(x, y, z, B.AIR);
    const inside = Math.abs(dx) <= R && Math.abs(dz) <= R;
    put(x, by, z, inside ? B.WOOD : B.PATH, inside);
    if (!inside) continue;
    const wall = Math.abs(dx) === R || Math.abs(dz) === R;
    const corner = Math.abs(dx) === R && Math.abs(dz) === R;
    if (wall) for (let y = base; y <= base + 2; y++) put(x, y, z, corner ? B.LOG : y === base ? B.STONE : B.WOOD);
  }
  for (let k = 0; k <= R + 1; k++) for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const t = Math.min(dz + R + 1, R + 1 - dz);
    if (t === k) put(cx + dx, base + 3 + k, cz + dz, B.THATCH);
    else if (t > k && Math.abs(dx) === R && Math.abs(dz) <= R) put(cx + dx, base + 3 + k, cz + dz, B.WOOD);
  }
  const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[side];
  const dX = cx + out[0] * R, dZ = cz + out[1] * R;
  put(dX, base, dZ, B.AIR); put(dX, base + 1, dZ, B.AIR);
  for (const [x, z] of [[cx + out[1] * R, cz + out[0] * R], [cx - out[1] * R, cz - out[0] * R], [cx - out[0] * R, cz - out[1] * R]]) put(x, base + 1, z, B.GLASS);
  // fire, chest, bed away from the door
  const fire = { x: cx - out[0] * 2 + out[1] * 2, y: base, z: cz - out[1] * 2 + out[0] * 2 };
  const chest = { x: cx - out[0] * 2 - out[1] * 2, y: base, z: cz - out[1] * 2 - out[0] * 2 };
  const bed = { x: cx + 0.5 + out[1] * 1.4, y: base, z: cz + 0.5 + out[0] * 1.4 };
  put(fire.x, fire.y, fire.z, B.CAMPFIRE);
  put(chest.x, chest.y, chest.z, B.SUPPLY);
  // pen beside the cottage (gap = gate) and a tilled garden in front
  const px = cx + out[1] * 9 - 4, pz = cz + out[0] * 9 - 4;
  const pen = { x0: px, z0: pz, x1: px + 8, z1: pz + 8, owner: 'player' };
  for (let x = pen.x0; x <= pen.x1; x++) for (const z of [pen.z0, pen.z1]) put(x, base, z, B.FENCE);
  for (let z = pen.z0; z <= pen.z1; z++) for (const x of [pen.x0, pen.x1]) put(x, base, z, B.FENCE);
  const gx = Math.floor((pen.x0 + pen.x1) / 2), gz = pen.z0;
  put(gx, base, gz, B.AIR); put(gx + 1, base, gz, B.AIR);
  pen.gate = { x: gx + 1, z: gz - 1.5 };
  const garden = [];
  for (let a = -2; a <= 2; a++) for (let b = 5; b <= 7; b++) {
    const x = cx + out[0] * b + out[1] * a, z = cz + out[1] * b + out[0] * a;
    put(x, by, z, B.FARMLAND, false); garden.push({ x, z });
  }
  return { x: cx, y: base, z: cz, r: R, fire, chest, bed, pen, garden, door: { x: dX + 0.5 + out[0] * 1.6, y: base, z: dZ + 0.5 + out[1] * 1.6 } };
}

function distanceField(W, D, isSource) {
  const d = new Float32Array(W * D);
  for (let k = 0; k < W * D; k++) d[k] = isSource(k) ? 0 : 1e9;
  const S = Math.SQRT2;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    if (x > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
    if (z > 0) { d[k] = Math.min(d[k], d[k - W] + 1); if (x > 0) d[k] = Math.min(d[k], d[k - W - 1] + S); if (x < W - 1) d[k] = Math.min(d[k], d[k - W + 1] + S); }
  }
  for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const k = x + z * W;
    if (x < W - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
    if (z < D - 1) { d[k] = Math.min(d[k], d[k + W] + 1); if (x < W - 1) d[k] = Math.min(d[k], d[k + W + 1] + S); if (x > 0) d[k] = Math.min(d[k], d[k + W - 1] + S); }
  }
  return d;
}
