// Town Life terrain: a peaceful 1940s countryside of grassy rolling hills,
// woods, a river and lakes, a village (shops, town hall, houses, fields and
// a livestock pen) and the player's cottage. Stone starts about 3 blocks
// down; iron is common in it and gold very rare. Sand lines the water and
// clay lies in the river beds. Village buildings and the cottage are locked
// (indestructible); fields, woods and everything else can be changed.
import { SEA } from './config.js';
import { B } from './blocks.js';
import { Simplex2, mulberry32, hash2 } from './noise.js';

export const TOWN_SIZE = 256;

export function generateTown(world) {
  const { seed } = world.cfg;
  const W = world.W, D = world.D, H = world.H;
  const n1 = new Simplex2(seed), n2 = new Simplex2(seed + 1), n3 = new Simplex2(seed + 2);
  const n4 = new Simplex2(seed + 3), n5 = new Simplex2(seed + 4), n6 = new Simplex2(seed + 5);
  const rnd = mulberry32(seed + 99);
  const cx = Math.floor(W / 2), cz = Math.floor(D / 2);
  const VR = 54, VB = 64;                       // village: flat radius, blend radius

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
  const distLand2 = distanceField(W, D, (k) => water[k] === 1);

  // --- heightmap: rolling hills
  const tops = new Int16Array(W * D);
  const raw = (x, z) => SEA + 5 + n1.fbm(x / 130, z / 130, 3) * 7 + n2.fbm(x / 38, z / 38, 2) * 1.6;
  const hv = Math.max(SEA + 3, Math.round(raw(cx, cz)));
  const hc = Math.max(SEA + 2, Math.round(raw(cot.x, cot.z)));
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
  const village = buildVillage(world, put, cx, cz, hv, rnd);
  const cottage = buildCottage(world, put, cot.x, hc, cot.z, cx, cz);

  // a dirt road from the village to the cottage
  const end = Math.abs(cot.x - cx) > Math.abs(cot.z - cz)
    ? { x: cx + Math.sign(cot.x - cx) * 46, z: cz } : { x: cx, z: cz + Math.sign(cot.z - cz) * 46 };
  const steps = Math.ceil(Math.hypot(cottage.door.x - end.x, cottage.door.z - end.z));
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(end.x + (cottage.door.x - end.x) * i / steps), z = Math.round(end.z + (cottage.door.z - end.z) * i / steps);
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) {
      const X = x + dx, Z = z + dz, t = tops[X + Z * W];
      if (world.get(X, t, Z) === B.GRASS && !world.isLocked(X, t, Z)) world.data[world.idx(X, t, Z)] = B.PATH;
    }
  }
  village.cottageRoad = { from: end, to: cottage.door };

  // --- woods: oaks in forest patches, a few lone trees in the fields
  const clear = (x, z) => Math.hypot(x - cx, z - cz) < VB + 2 || Math.hypot(x - cot.x, z - cot.z) < 24;
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
// Two crossing roads with a plaza, shops and houses facing the roads, two
// fields of crops and a livestock pen. Returns the village site: buildings
// (door, inside spot, keeper spot), the road graph and the farm areas.
function buildVillage(world, put, cx, cz, hv, rnd) {
  const W = world.W;
  const floorY = hv, base = hv + 1;
  // roads (3 wide) and the plaza
  for (let d = -44; d <= 44; d++) for (let w = -1; w <= 1; w++) {
    put(cx + d, floorY, cz + w, B.PATH, false); put(cx + w, floorY, cz + d, B.PATH, false);
  }
  for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) put(cx + dx, floorY, cz + dz, B.PATH, false);
  // a stone well in the plaza
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const X = cx - 5 + dx, Z = cz + 5 + dz;
    if (dx || dz) { put(X, base, Z, B.STONE); } else { put(X, floorY, Z, B.WATER, false); put(X, floorY - 1, Z, B.STONE); }
  }

  const buildings = [];
  // slot: footprint and which wall has the door (facing the road)
  const slot = (x0, z0, x1, z1, side) => ({ x0: cx + x0, z0: cz + z0, x1: cx + x1, z1: cz + z1, side });
  const plan = [
    ['hall', slot(-22, -13, -12, -4, 's'), B.BRICK],
    ['general', slot(12, -12, 20, -4, 's'), B.WOOD],
    ['butcher', slot(-21, 4, -14, 11, 'n'), B.BRICK],
    ['hunting', slot(12, 4, 19, 11, 'n'), B.LOG],
    ['house', slot(-34, -11, -27, -4, 's'), B.WOOD],
    ['house', slot(25, -11, 32, -4, 's'), B.BRICK],
    ['house', slot(-34, 4, -27, 11, 'n'), B.LOG],
    ['house', slot(25, 4, 32, 11, 'n'), B.WOOD],
    ['house', slot(-11, -33, -4, -26, 'e'), B.BRICK],
    ['house', slot(4, -33, 11, -26, 'w'), B.LOG],
    ['house', slot(-11, 26, -4, 33, 'e'), B.WOOD],
    ['house', slot(4, 26, 11, 33, 'w'), B.BRICK],
  ];
  for (const [type, s, wall] of plan) buildings.push(building(world, put, s, base, wall, type));
  // market stall in the plaza: posts, a thatch canopy and a counter
  {
    const x0 = cx + 2, x1 = cx + 6, z0 = cz - 6, z1 = cz - 4;
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) for (let y = base; y < base + 3; y++) put(x, y, z, B.LOG);
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) put(x, base + 3, z, B.THATCH);
    for (let x = x0 + 1; x < x1; x++) put(x, base, z1, B.WOOD);
    buildings.push({ type: 'market', door: { x: cx + 4.5, y: base, z: z1 + 1.6 }, inside: { x: cx + 4.5, y: base, z: z0 + 0.5 }, keeper: { x: cx + 4.5, y: base, z: z1 - 1 + 0.4 }, x0, z0, x1, z1 });
  }
  // fields of crops (owned by the village) and the livestock pen
  const fields = [];
  const field = (x0, z0, x1, z1, crop) => {
    const f = { x0: cx + x0, z0: cz + z0, x1: cx + x1, z1: cz + z1, crop, gate: null };
    for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
      put(x, floorY, z, B.FARMLAND, false);
      const id = { wheat: B.WHEAT_R, carrot: B.CARROT_R, cabbage: B.CABBAGE_R }[crop];
      put(x, base, z, (x + z) % 5 === 0 ? B.SPROUT : id, false);
    }
    f.gate = { x: (f.x0 + f.x1) / 2 + 0.5, y: base, z: z0 < 0 ? f.z1 + 1.5 : f.z0 - 1.5 };
    fields.push(f);
  };
  field(-44, 17, -28, 24, 'wheat');
  field(26, -25, 40, -18, 'carrot');
  field(-44, -25, -36, -18, 'cabbage');
  const pens = [];
  {
    const p = { x0: cx + 24, z0: cz + 17, x1: cx + 38, z1: cz + 28, owner: 'village' };
    for (let x = p.x0; x <= p.x1; x++) for (const z of [p.z0, p.z1]) put(x, base, z, B.FENCE);
    for (let z = p.z0; z <= p.z1; z++) for (const x of [p.x0, p.x1]) put(x, base, z, B.FENCE);
    pens.push(p);
  }
  // the road graph: plaza, points along each road, every door
  const nodes = [{ x: cx + 0.5, z: cz + 0.5 }];
  for (const d of [-44, -34, -22, -12, 12, 22, 34, 44]) { nodes.push({ x: cx + d + 0.5, z: cz + 0.5, axis: 'x' }); nodes.push({ x: cx + 0.5, z: cz + d + 0.5, axis: 'z' }); }
  return { type: 'village', cx, cz, y: base, floorY, buildings, fields, pens, nodes, radius: 54 };
}

// One building: walls, a door facing the road, glass windows, a plank floor,
// a pitched thatch roof (shops and houses) or a flat brick top (town hall).
function building(world, put, s, base, wall, type) {
  const { x0, z0, x1, z1, side } = s;
  const H = 4;
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
      if (t === k || (t > k && k === Math.ceil(span / 2))) put(x, y, z, type === 'hall' ? B.BRICK : B.THATCH);
      // gable ends filled with wall
      const end = alongX ? (x === x0 || x === x1) : (z === z0 || z === z1);
      if (t > k && end && x >= x0 && x <= x1 && z >= z0 && z <= z1) put(x, y, z, wall);
    }
  }
  // door (1 wide, 2 high) in the middle of the road-side wall
  const mx = Math.floor((x0 + x1) / 2), mz = Math.floor((z0 + z1) / 2);
  const door = side === 's' ? { x: mx, z: z1 } : side === 'n' ? { x: mx, z: z0 } : side === 'e' ? { x: x1, z: mz } : { x: x0, z: mz };
  put(door.x, base, door.z, B.AIR); put(door.x, base + 1, door.z, B.AIR);
  const out = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[side];
  // windows on the other walls
  for (let x = x0 + 2; x < x1 - 1; x += 3) for (const z of [z0, z1]) if (!(x === door.x && z === door.z)) put(x, base + 1, z, B.GLASS);
  for (let z = z0 + 2; z < z1 - 1; z += 3) for (const x of [x0, x1]) if (!(x === door.x && z === door.z)) put(x, base + 1, z, B.GLASS);
  const inner = { x: mx + 0.5, y: base, z: mz + 0.5 };
  const b = {
    type, x0, z0, x1, z1, side,
    door: { x: door.x + 0.5 + out[0] * 1.6, y: base, z: door.z + 0.5 + out[1] * 1.6 },
    doorIn: { x: door.x + 0.5 - out[0] * 1.2, y: base, z: door.z + 0.5 - out[1] * 1.2 },
    inside: inner,
  };
  if (type !== 'house') {
    // a counter across the room with the keeper behind it
    const cx = door.x - out[0] * 3, czz = door.z - out[1] * 3;
    for (let k = -2; k <= 2; k++) {
      const X = out[0] ? cx : cx + k, Z = out[0] ? czz + k : czz;
      if (X > x0 && X < x1 && Z > z0 && Z < z1 && Math.abs(k) < 2) put(X, base, Z, B.WOOD);
    }
    b.keeper = { x: cx + 0.5 - out[0] * 1.2, y: base, z: czz + 0.5 - out[1] * 1.2 };
    b.counter = { x: cx + 0.5 + out[0] * 1.1, y: base, z: czz + 0.5 + out[1] * 1.1 };
  }
  return b;
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
