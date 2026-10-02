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
  const n1 = new Simplex2(seed), n3 = new Simplex2(seed + 2);
  const n4 = new Simplex2(seed + 3), n5 = new Simplex2(seed + 4);
  const rnd = mulberry32(seed + 99);
  const cxW = W / 2, czW = D / 2;
  const alone = mode === 'war' && sub === 'alone';

  // --- heightmap -----------------------------------------------------------
  // An open battlefield: mostly level ground with only gentle, wide swells.
  const hm = new Float32Array(W * D);
  const crater = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    let h = SEA + 3 + n1.fbm(x / 220, z / 220, 3) * 3;
    // winding rivers along a noise ridge, with wide sloping banks
    const rv = Math.abs(n3.fbm(x / 190, z / 190, 2));
    const rw = 0.05;
    if (rv < rw * 2.6) h = lerp(h, SEA - 5, smooth((1 - rv / (rw * 2.6)) * 1.6));
    // lakes
    const lk = n4.fbm(x / 95, z / 95, 2);
    if (lk > 0.36) h = lerp(h, SEA - 6, smooth((lk - 0.36) / 0.2));
    // keep the cabin clearing (Play Alone) dry and level
    if (alone) {
      const d = Math.hypot(x - cxW, z - czW);
      if (d < 22) h = lerp(h, SEA + 3, smooth(1 - d / 22));
    }
    hm[x + z * W] = h;
  }

  // soften everything (smooth river banks, no ragged edges)
  const tmp = new Float32Array(W * D);
  for (let pass = 0; pass < 2; pass++) {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      let sum = 0, n = 0;
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, zz = z + dz;
        if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue;
        sum += hm[xx + zz * W]; n++;
      }
      tmp[x + z * W] = sum / n;
    }
    hm.set(tmp);
  }

  // rare, shallow shell craters (at most ~1 block deep, easy to walk out of)
  const nCraters = Math.floor(W * D / 5000);
  for (let i = 0; i < nCraters; i++) {
    const cx = rnd() * W, cz = rnd() * D, r = 2 + rnd() * 1.8;
    if (alone && Math.hypot(cx - cxW, cz - czW) < 24) continue;
    if (hm[Math.floor(cx) + Math.floor(cz) * W] < SEA + 1.5) continue; // not on banks
    const R = Math.ceil(r);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.floor(cx + dx), z = Math.floor(cz + dz);
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / r;
      if (d < 1) { hm[x + z * W] -= 1.1 * (1 - d * d); crater[x + z * W] = 1; }
    }
  }

  // integer tops, then limit every step between neighbours to 1 block
  // (two sweeps of a chamfer pass: no cliffs, pits or walls anywhere)
  const tops = new Int16Array(W * D);
  for (let k = 0; k < W * D; k++) tops[k] = Math.max(4, Math.min(H - 12, Math.round(hm[k])));
  // remove isolated one-block bumps and dips
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const k = x + z * W;
    const n = [tops[k - 1], tops[k + 1], tops[k - W], tops[k + W]];
    const mx = Math.max(...n), mn = Math.min(...n);
    if (tops[k] > mx || tops[k] < mn) tops[k] = n.sort((p, q) => p - q)[1];
  }
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

  // --- columns -------------------------------------------------------------
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    const top = tops[k];
    let surf;
    const sn = n5.noise(x / 16, z / 16);
    if (top < SEA) surf = B.MUD;
    else if (top <= SEA) surf = (hash2(x, z, seed) < 0.6) ? B.MUD : B.DIRT;
    else if (crater[k] === 1) surf = hash2(x, z, seed + 5) < 0.45 ? B.RUBBLE : B.MUD;
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
      if (world.inside(x, y, z) && y < tops[x + z * W] && replace.includes(world.data[world.idx(x, y, z)])) world.data[world.idx(x, y, z)] = B.IRON;
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
  const h = 5 + Math.floor(r() * 4);   // ~13% taller in (smaller) blocks
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
  const rad = 2 + (r() < 0.55 ? 1 : 0);
  for (let dy = -2; dy <= 2; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
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
