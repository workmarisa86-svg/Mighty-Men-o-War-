// Terrain generation: a war-scarred landscape of dirt, mud and rubble,
// shell craters, still rivers and lakes, and sparse battered trees.
import { SEA } from './config.js';
import { B } from './blocks.js';
import { Simplex2, mulberry32, hash2 } from './noise.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export function generate(world) {
  const { seed, mode, sub } = world.cfg;
  const W = world.W, D = world.D, H = world.H;
  const n1 = new Simplex2(seed), n2 = new Simplex2(seed + 1), n3 = new Simplex2(seed + 2);
  const n4 = new Simplex2(seed + 3), n5 = new Simplex2(seed + 4);
  const rnd = mulberry32(seed + 99);
  const cxW = W / 2, czW = D / 2;
  const alone = mode === 'war' && sub === 'alone';

  // --- heightmap -----------------------------------------------------------
  const hm = new Float32Array(W * D);
  const crater = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let h = 30 + n1.fbm(x / 110, z / 110, 4) * 7 + n2.fbm(x / 26, z / 26, 3) * 1.6;
    // winding rivers along a noise ridge
    const rv = Math.abs(n3.fbm(x / 170, z / 170, 3));
    const rw = 0.045;
    if (rv < rw * 1.8) h = lerp(h, SEA - 3.5, smooth((1 - rv / (rw * 1.8)) * 1.7));
    // lakes
    const lk = n4.fbm(x / 85, z / 85, 2);
    if (lk > 0.38) h = lerp(h, SEA - 4.5, smooth((lk - 0.38) / 0.14));
    // keep the cabin clearing (Play Alone) dry and fairly flat
    if (alone) {
      const d = Math.hypot(x - cxW, z - czW);
      if (d < 18) h = lerp(h, SEA + 4, smooth(1 - d / 18));
    }
    hm[x + z * W] = h;
  }

  // shell craters
  const nCraters = Math.floor(W * D / 700);
  for (let i = 0; i < nCraters; i++) {
    const cx = rnd() * W, cz = rnd() * D, r = 2 + rnd() * 4.5, depth = r * 0.5;
    if (alone && Math.hypot(cx - cxW, cz - czW) < 20) continue;
    const R = Math.ceil(r * 1.5);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.floor(cx + dx), z = Math.floor(cz + dz);
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / r;
      const k = x + z * W;
      if (d < 1) { hm[k] -= depth * (1 - d * d); crater[k] = 1; }
      else if (d < 1.5) { hm[k] += 0.9 * (1.5 - d) * 2 * (r / 6); crater[k] = 2; }
    }
  }

  // --- columns -------------------------------------------------------------
  const tops = new Int16Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    const top = Math.max(4, Math.min(H - 12, Math.floor(hm[k])));
    tops[k] = top;
    let surf;
    const sn = n5.noise(x / 16, z / 16);
    if (top < SEA) surf = B.MUD;
    else if (top <= SEA) surf = (hash2(x, z, seed) < 0.6) ? B.MUD : B.DIRT;
    else if (crater[k] === 1) surf = hash2(x, z, seed + 5) < 0.45 ? B.RUBBLE : B.MUD;
    else if (crater[k] === 2) surf = hash2(x, z, seed + 6) < 0.35 ? B.RUBBLE : B.DIRT;
    else if (sn > 0.55) surf = B.RUBBLE;
    else if (sn < -0.5) surf = B.MUD;
    else surf = B.DIRT;
    for (let y = 0; y <= top; y++) {
      let b;
      if (y === 0 || (y === 1 && hash2(x, z, seed + 9) < 0.5)) b = B.BEDROCK;
      else if (y === top) b = surf;
      else if (y >= top - 2) b = B.DIRT;   // stone starts ~3 blocks down
      else b = B.STONE;
      world.data[world.idx(x, y, z)] = b;
    }
    for (let y = top + 1; y < SEA; y++) world.data[world.idx(x, y, z)] = B.WATER;
  }

  // --- iron ----------------------------------------------------------------
  const vein = (x, y, z, len, replace) => {
    for (let i = 0; i < len; i++) {
      if (world.inside(x, y, z) && replace.includes(world.data[world.idx(x, y, z)])) world.data[world.idx(x, y, z)] = B.IRON;
      const r = rnd();
      if (r < 0.33) x += rnd() < 0.5 ? 1 : -1; else if (r < 0.66) z += rnd() < 0.5 ? 1 : -1; else y += rnd() < 0.5 ? 1 : -1;
    }
  };
  const baseVeins = Math.floor(W * D / (alone ? 110 : 45));
  for (let i = 0; i < baseVeins; i++) {
    const x = rnd() * W | 0, z = rnd() * D | 0;
    const y = tops[x + z * W] - 3 - Math.floor(rnd() * 6);
    vein(x, y, z, 3 + (rnd() * 5 | 0), [B.STONE]);
  }
  if (alone) {
    // very abundant, shallow iron around the cabin
    for (let i = 0; i < 90; i++) {
      const a = rnd() * Math.PI * 2, d = 6 + rnd() * 22;
      const x = Math.floor(cxW + Math.cos(a) * d), z = Math.floor(czW + Math.sin(a) * d);
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      const y = tops[x + z * W] - 1 - Math.floor(rnd() * 2);
      vein(x, y, z, 3 + (rnd() * 4 | 0), [B.DIRT, B.STONE]);
    }
  }

  // --- trees ---------------------------------------------------------------
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    if (hash2(x, z, seed + 31) > 0.0065) continue;
    const top = tops[x + z * W];
    if (top <= SEA) continue;
    if (crater[x + z * W] === 1) continue;
    if (alone && Math.hypot(x - cxW, z - czW) < 8) continue;
    let flat = true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(tops[x + dx + (z + dz) * W] - top) > 1) flat = false;
    if (!flat) continue;
    plantTree(world, x, top + 1, z, mulberry32(Math.floor(hash2(x, z, seed + 77) * 1e9)));
  }

  // --- spawn ---------------------------------------------------------------
  world.tops = tops;
  world.spawn = findLand(world, cxW, czW);
  if (alone) world.sites.push({ type: 'cabin', x: Math.floor(cxW), z: Math.floor(czW), y: tops[Math.floor(cxW) + Math.floor(czW) * W] + 1 });
}

export function plantTree(world, x, y, z, r) {
  const h = 4 + Math.floor(r() * 4);
  const dead = r() < 0.4;
  for (let i = 0; i < h; i++) if (world.get(x, y + i, z) === B.AIR) world.data[world.idx(x, y + i, z)] = B.LOG;
  const ty = y + h - 1;
  if (dead) {
    // bare, shattered branches
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      const [dx, dz] = dirs[Math.floor(r() * 4)];
      const by = y + 2 + Math.floor(r() * (h - 2));
      for (let k = 1; k <= 1 + Math.floor(r() * 2); k++) {
        if (world.get(x + dx * k, by + (k > 1 ? 1 : 0), z + dz * k) === B.AIR) world.data[world.idx(x + dx * k, by + (k > 1 ? 1 : 0), z + dz * k)] = B.LOG;
      }
    }
    return;
  }
  const rad = 2 + (r() < 0.4 ? 1 : 0);
  for (let dy = -1; dy <= 2; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
    const d = dx * dx + dz * dz + dy * dy * 1.5;
    if (d > rad * rad + 0.5 || r() < 0.3) continue;
    const X = x + dx, Y = ty + dy, Z = z + dz;
    if (world.inside(X, Y, Z) && world.get(X, Y, Z) === B.AIR) world.data[world.idx(X, Y, Z)] = B.LEAVES;
  }
}

export function findLand(world, cx, cz) {
  for (let r = 0; r < Math.max(world.W, world.D); r += 2) {
    for (let a = 0; a < 16; a++) {
      const x = Math.floor(cx + Math.cos(a / 16 * Math.PI * 2) * r);
      const z = Math.floor(cz + Math.sin(a / 16 * Math.PI * 2) * r);
      if (x < 2 || z < 2 || x >= world.W - 2 || z >= world.D - 2) continue;
      const y = world.surfaceY(x, z);
      const b = world.get(x, y, z);
      let open = y >= SEA && b !== B.LOG;
      for (let dz = -2; dz <= 2 && open; dz++) for (let dx = -2; dx <= 2 && open; dx++) {
        if (world.get(x + dx, y + 1, z + dz) !== B.AIR || world.get(x + dx, y + 2, z + dz) !== B.AIR) open = false;
      }
      if (open) {
        return { x: x + 0.5, y: y + 1, z: z + 0.5 };
      }
    }
  }
  return { x: cx, y: 40, z: cz };
}
