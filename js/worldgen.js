// Terrain generation. Each War country is its own world with its own
// landscape (see LANDS in countries.js): grassland, snowfields, rice paddies,
// red desert, jungle, olive hills, volcanic ash, hedgerows or fjords, with
// shell craters, rivers and lakes, and a sea coast along the south edge
// where the country can be reached by boat. Its headquarters stand on
// flattened ground.
import { SEA } from './config.js';
import { B } from './blocks.js';
import { Simplex2, mulberry32, hash2 } from './noise.js';
import { chooseFortSites, flattenForSite, stampFort, assignOwners, fortCount, FORT_NAMES } from './forts.js';
import { COUNTRY, LANDS, BATTLE } from './countries.js';

// the landscape of a world: its country's, changed for some battles
// (summer battles have no snow, winter ones do)
export function landFor(cfg) {
  const c = COUNTRY[cfg.country];
  if (!c) return null;
  const L = Object.assign({}, LANDS[c.land]);
  const b = cfg.battle && BATTLE[cfg.battle];
  if (b && b.summer) Object.assign(L, { ground: 'dry', frozen: false, tree: 'birch' });
  if (b && b.cold) Object.assign(L, { ground: 'snow', frozen: true });
  return L;
}
// the sea along the south edge (coastal countries)
export const COAST = 30;
export function hasCoast(cfg) { const c = COUNTRY[cfg.country]; return !!(c && (c.coast || (cfg.battle && BATTLE[cfg.battle] && BATTLE[cfg.battle].by === 'boat'))); }


export function generate(world) {
  const { seed, mode, sub } = world.cfg;
  const W = world.W, D = world.D, H = world.H;
  const n1 = new Simplex2(seed), n3 = new Simplex2(seed + 2);
  const n4 = new Simplex2(seed + 3), n5 = new Simplex2(seed + 4);
  const rnd = mulberry32(seed + 99);
  const cxW = W / 2, czW = D / 2;
  const alone = mode === 'war' && sub === 'alone';
  const L = landFor(world.cfg) || LANDS.prairie, coast = hasCoast(world.cfg);
  const n6 = new Simplex2(seed + 6), n7 = new Simplex2(seed + 7);

  // --- heightmap -----------------------------------------------------------
  // An open battlefield: mostly level ground with only gentle, wide swells.
  // Water is decided first as a mask; land and riverbed heights are then
  // shaped by distance to the shoreline, so the ground slides gently into
  // shallow water and only deepens toward the middle (no banks or ledges).
  const land = new Float32Array(W * D);
  const water = new Uint8Array(W * D);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    land[k] = SEA + 3 + L.hills * 0.4 + n1.fbm(x / 220, z / 220, 3) * L.hills + Math.max(0, n6.fbm(x / 70, z / 70, 2)) * L.hills * 0.8;
    const rv = Math.abs(n3.fbm(x / 190, z / 190, 2));   // winding rivers
    const lk = n4.fbm(x / 95, z / 95, 2);                // lakes
    let wet = rv < L.river || lk > L.lake;
    // the sea along the south edge, with a gently wavy shoreline
    if (coast && z > D - COAST + n7.noise(x / 40, 0) * 5) wet = true;
    if (alone && Math.hypot(x - cxW, z - czW) < 24) wet = false; // dry cabin clearing
    if (x < 3 || z < 3 || x >= W - 3 || (!coast && z >= D - 3)) wet = false;
    water[k] = wet ? 1 : 0;
  }
  // smooth the water outline (no one-block inlets or specks)
  for (let pass = 0; pass < 2; pass++) {
    const copy = water.slice();
    for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
      const k = x + z * W;
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) n += copy[k + dx + dz * W];
      water[k] = n >= 5 ? 1 : 0;
    }
  }
  const distLand = distanceField(W, D, (k) => water[k] === 1); // land: distance to nearest water
  const distWater = distanceField(W, D, (k) => water[k] === 0); // water: distance to nearest land

  // rare, shallow shell craters on dry ground (about one block deep)
  const crater = new Uint8Array(W * D);
  const nCraters = Math.floor(W * D / 5000);
  for (let i = 0; i < nCraters; i++) {
    const cx = rnd() * W, cz = rnd() * D, r = 2 + rnd() * 1.8;
    if (alone && Math.hypot(cx - cxW, cz - czW) < 26) continue;
    const ck = Math.floor(cx) + Math.floor(cz) * W;
    if (distLand[ck] < 8) continue; // never on the shore
    const R = Math.ceil(r);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = Math.floor(cx + dx), z = Math.floor(cz + dz);
      if (x < 0 || z < 0 || x >= W || z >= D) continue;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz) / r;
      if (d < 1) { land[x + z * W] -= 1.1 * (1 - d * d); crater[x + z * W] = 1; }
    }
  }

  const tops = new Int16Array(W * D);
  for (let k = 0; k < W * D; k++) {
    if (water[k]) {
      // riverbed: 1 block deep at the edge, deepening ~1 block per 2.5 blocks out, max 5
      tops[k] = SEA - 1 - Math.min(5, Math.ceil(distWater[k] / 2.5));
    } else {
      // shore is flush with the water surface, then rises 1 block per ~4 blocks inland
      const shore = SEA - 1 + (distLand[k] - 1) / 4;
      tops[k] = Math.round(Math.min(land[k], shore));
      if (tops[k] < SEA - 1) tops[k] = SEA - 1; // no accidental ponds on land
    }
  }
  // remove isolated one-block bumps and dips on land
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    const k = x + z * W;
    if (water[k]) continue;
    const n = [tops[k - 1], tops[k + 1], tops[k - W], tops[k + W]];
    const mx = Math.max(...n), mn = Math.min(...n);
    if (tops[k] > mx || tops[k] < mn) tops[k] = Math.max(SEA - 1, n.sort((p, q) => p - q)[1]);
  }
  // limit every step between neighbours to 1 block (no cliffs anywhere)
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
  for (let k = 0; k < W * D; k++) tops[k] = Math.max(4, Math.min(H - 12, tops[k]));

  // --- headquarters sites: flatten the ground where they will stand ---------
  const frnd = mulberry32(seed + 404);
  const forts = fortCount(world.cfg) ? chooseFortSites(world, tops, water, distLand, frnd, fortCount(world.cfg), alone ? { x: cxW, z: czW } : null, coast ? COAST + 34 : 0) : [];
  for (const f of forts) flattenForSite(tops, water, W, D, f);

  // --- columns -------------------------------------------------------------
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    const top = tops[k];
    let surf;
    const sn = n5.noise(x / 16, z / 16), rk = n6.noise(x / 23, z / 23);
    const soil = L.ground === 'red' || L.ground === 'ash' ? B.SAND : B.GRASS;
    if (top < SEA) surf = coast && z > D - COAST - 6 ? B.SAND : B.MUD;
    else if (top <= SEA) surf = coast && z > D - COAST - 12 ? B.SAND : (hash2(x, z, seed) < 0.6) ? B.MUD : B.DIRT;
    else if (coast && z > D - COAST - 8 && top <= SEA + 2) surf = B.SAND;      // the beach
    else if (crater[k] === 1) surf = hash2(x, z, seed + 5) < 0.45 ? B.RUBBLE : B.DIRT;
    else if (rk > 1 - L.rock * 1.6) surf = B.STONE;
    else if (sn > 0.6) surf = B.RUBBLE;
    else if (sn < -0.62 + (L.mud || 0)) surf = L.ground === 'snow' ? B.DIRT : B.MUD;
    else surf = hash2(x, z, seed + 3) < 0.12 ? B.DIRT : soil;
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

  // --- forts ---------------------------------------------------------------
  const names = FORT_NAMES.slice();
  for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(frnd() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
  forts.forEach((f, i) => { f.name = names[i % names.length]; stampFort(world, f, frnd); });
  const startFort = sub === 'allies' && forts.length
    ? forts.slice().sort((a, b) => Math.hypot(a.cx - cxW, a.cz - czW) - Math.hypot(b.cx - cxW, b.cz - czW))[0] : null;
  assignOwners(forts, mode, sub, frnd, startFort);
  world.forts = forts;
  const nearFort = (x, z, r) => forts.some((f) => Math.abs(f.cx - x) <= r && Math.abs(f.cz - z) <= r);

  // --- bridges: a few wooden bridges, three blocks wide, across rivers and
  // lakes (cars need ground under both sides; deep water sinks them)
  if (world.cfg.country) {
    const brnd = mulberry32(seed + 515), want = 3 + Math.floor(brnd() * 3);
    world.bridges = [];
    for (let tries = 0, made = 0; tries < 6000 && made < want; tries++) {
      const x0 = 8 + Math.floor(brnd() * (W - 16)), z0 = 8 + Math.floor(brnd() * (D - 16));
      if (water[x0 + z0 * W] || tops[x0 + z0 * W] > SEA + 1 || nearFort(x0, z0, 16)) continue;
      const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]], d0 = Math.floor(brnd() * 4);
      for (let q = 0; q < 4; q++) {
        const [dx, dz] = dirs[(d0 + q) % 4], px = dz !== 0 ? 1 : 0, pz = dx !== 0 ? 1 : 0;
        let n = 1, ok = true;
        for (; n < 28; n++) {
          const x = x0 + dx * n, z = z0 + dz * n;
          if (x < 4 || z < 4 || x >= W - 4 || z >= D - 4 || (coast && z > D - COAST - 14)) { ok = false; break; }
          if (!water[x + z * W]) break;
        }
        const span = n - 1;
        if (!ok || n >= 28 || span < 3) continue;
        const x1 = x0 + dx * n, z1 = z0 + dz * n;
        if (tops[x1 + z1 * W] > SEA + 1 || nearFort(x1, z1, 16)) continue;
        // all three lanes must cross water the same way
        let lanes = true;
        for (let w = -1; w <= 1 && lanes; w += 2) for (let m = 1; m <= span; m++) if (!water[(x0 + dx * m + px * w) + (z0 + dz * m + pz * w) * W]) { lanes = false; break; }
        if (!lanes) continue;
        for (let m = 0; m <= n; m++) for (let w = -1; w <= 1; w++) {
          const x = x0 + dx * m + px * w, z = z0 + dz * m + pz * w, k = x + z * W;
          if (water[k]) {
            world.data[world.idx(x, SEA, z)] = B.WOOD;                         // the deck, just above the water
            if (w !== 0 && m % 4 === 2) for (let y = tops[k] + 1; y < SEA; y++) world.data[world.idx(x, y, z)] = B.LOG;   // piles
          }
          for (let y = SEA + 1; y <= SEA + 3; y++) world.data[world.idx(x, y, z)] = B.AIR;
        }
        world.bridges.push({ x: x0 + dx * (n / 2), z: z0 + dz * (n / 2) });
        made++; break;
      }
    }
  }

  // --- the land's own features: frozen water, fields, rice paddies, hedgerows
  if (L.frozen) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (coast && z > D - COAST - 12) continue;                  // the sea stays open
    const i = world.idx(x, SEA - 1, z);
    if (world.data[i] === B.WATER) world.data[i] = B.ICE;
  }
  const crops = [B.WHEAT_R, B.CARROT_R, B.CABBAGE_R];
  for (let z = 4; z < D - 4; z++) for (let x = 4; x < W - 4; x++) {
    const k = x + z * W, top = tops[k];
    if (top <= SEA || crater[k] || nearFort(x, z, 14) || (coast && z > D - COAST - 10)) continue;
    const f = n7.noise(x / 26, z / 26), here = world.data[world.idx(x, top, z)];
    if (here !== B.GRASS && here !== B.DIRT && here !== B.SAND) continue;
    if (L.rice && f > 1 - L.rice * 2.2 && x % 9 && z % 7) {
      world.data[world.idx(x, top, z)] = B.WATER; world.data[world.idx(x, top - 1, z)] = B.MUD;   // a flooded paddy
    } else if (L.fields && f < -1 + L.fields * 2.2) {
      world.data[world.idx(x, top, z)] = B.FARMLAND;
      if (z % 2 === 0 && world.get(x, top + 1, z) === B.AIR) world.data[world.idx(x, top + 1, z)] = L.ground === 'snow' ? B.WILTED : crops[Math.floor(Math.abs(f) * 7) % 3];
    } else if (L.hedges && Math.abs(n6.noise(x / 30, z / 30)) < 0.025) {
      for (let y = top + 1; y <= top + 2; y++) if (world.get(x, y, z) === B.AIR) world.data[world.idx(x, y, z)] = B.LEAVES;
    }
  }

  // --- trees ---------------------------------------------------------------
  const tp = world.cfg.country ? L.trees : 0.0065;
  for (let z = 3; z < D - 3; z++) for (let x = 3; x < W - 3; x++) {
    const orchard = L.orchard && x % 6 === 0 && z % 6 === 0 && n5.noise(x / 50, z / 50) > 0.45;
    if (!orchard && hash2(x, z, seed + 31) > tp * (L.tree === 'jungle' || L.tree === 'pine' ? (n5.noise(x / 60, z / 60) > 0 ? 1.8 : 0.3) : 1)) continue;
    if (coast && z > D - COAST - 10) continue;
    const top = tops[x + z * W];
    if (top <= SEA) continue;
    if (crater[x + z * W] === 1) continue;
    if (alone && Math.hypot(x - cxW, z - czW) < 8) continue;
    if (nearFort(x, z, 17)) continue;    // nothing to climb over the walls with
    let flat = true;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(tops[x + dx + (z + dz) * W] - top) > 1) flat = false;
    if (!flat) continue;
    const tr = mulberry32(Math.floor(hash2(x, z, seed + 77) * 1e9));
    if (!world.cfg.country) plantTree(world, x, top + 1, z, tr);
    else plantKind(world, orchard ? 'olive' : L.tree, x, top + 1, z, tr);
  }

  // --- spawn ---------------------------------------------------------------
  world.tops = tops;
  world.spawn = startFort ? { x: startFort.cx + 0.5, y: startFort.base, z: startFort.cz + 0.5 } : findLand(world, cxW, czW);
  if (alone) {
    const c = buildCabin(world, Math.floor(world.spawn.x), Math.floor(world.spawn.y), Math.floor(world.spawn.z));
    world.sites.push({ type: 'cabin', x: c.x, z: c.z, y: c.y, r: c.r, bed: c.bed, chest: c.chest, fire: c.fire });
    world.spawn = { x: c.x + 0.5, y: c.y, z: c.z + 0.5 };
  }
}

// Chamfer distance (1 per step, 1.41 diagonally) from every cell to the
// nearest cell where isSource(k) is true.
function distanceField(W, D, isSource) {
  const d = new Float32Array(W * D);
  for (let k = 0; k < W * D; k++) d[k] = isSource(k) ? 0 : 1e9;
  const S = Math.SQRT2;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const k = x + z * W;
    if (x > 0) d[k] = Math.min(d[k], d[k - 1] + 1);
    if (z > 0) {
      d[k] = Math.min(d[k], d[k - W] + 1);
      if (x > 0) d[k] = Math.min(d[k], d[k - W - 1] + S);
      if (x < W - 1) d[k] = Math.min(d[k], d[k - W + 1] + S);
    }
  }
  for (let z = D - 1; z >= 0; z--) for (let x = W - 1; x >= 0; x--) {
    const k = x + z * W;
    if (x < W - 1) d[k] = Math.min(d[k], d[k + 1] + 1);
    if (z < D - 1) {
      d[k] = Math.min(d[k], d[k + W] + 1);
      if (x < W - 1) d[k] = Math.min(d[k], d[k + W + 1] + S);
      if (x > 0) d[k] = Math.min(d[k], d[k + W - 1] + S);
    }
  }
  return d;
}

// trees of each landscape: pine, birch, oak, olive, scrub, jungle
function plantKind(world, kind, x, y, z, r) {
  const set = (X, Y, Z, id) => { if (world.inside(X, Y, Z) && world.get(X, Y, Z) === B.AIR) world.data[world.idx(X, Y, Z)] = id; };
  if (kind === 'oak') { if (r() < 0.2) { plantTree(world, x, y, z, r); return; } kind = 'round'; }
  if (kind === 'scrub') { set(x, y, z, B.LEAVES); if (r() < 0.5) set(x + (r() < 0.5 ? 1 : -1), y, z, B.LEAVES); if (r() < 0.3) set(x, y + 1, z, B.LEAVES); return; }
  const h = kind === 'pine' ? 6 + Math.floor(r() * 4) : kind === 'jungle' ? 7 + Math.floor(r() * 5) : kind === 'olive' ? 2 + Math.floor(r() * 2) : 5 + Math.floor(r() * 3);
  for (let i = 0; i < h; i++) set(x, y + i, z, B.LOG);
  const top = y + h - 1;
  if (kind === 'pine') {
    // a narrow cone of needles
    for (let dy = -h + 3; dy <= 1; dy++) {
      const rad = dy === 1 ? 0 : Math.max(1, Math.round((1 - dy) * 0.45));
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) if (Math.abs(dx) + Math.abs(dz) <= rad + (dy % 2 ? 0 : 1)) set(x + dx, top + dy, z + dz, B.LEAVES);
    }
  } else if (kind === 'olive') {
    // low, wide and flat
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dz * dz <= 5 && r() < 0.85) { set(x + dx, top + 1, z + dz, B.LEAVES); if (dx * dx + dz * dz <= 2) set(x + dx, top + 2, z + dz, B.LEAVES); }
  } else if (kind === 'jungle') {
    // a tall trunk, a broad crown and hanging leaves
    for (let dy = -1; dy <= 1; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dz * dz + dy * dy * 3 <= 11 && r() < 0.85) set(x + dx, top + dy + 1, z + dz, B.LEAVES);
    for (let i = 0; i < 5; i++) { const dx = Math.floor(r() * 7) - 3, dz = Math.floor(r() * 7) - 3; for (let k = 0; k < 2 + r() * 3; k++) set(x + dx, top - k, z + dz, B.LEAVES); }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (r() < 0.5) set(x + dx, y, z + dz, B.LEAVES);   // undergrowth
  } else {
    // round crown (oak, birch)
    const rad = kind === 'birch' ? 1 + (r() < 0.5 ? 1 : 0) : 2 + (r() < 0.55 ? 1 : 0);
    for (let dy = -2; dy <= 2; dy++) for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
      const d = dx * dx + dz * dz + dy * dy * 1.5;
      if (d > rad * rad + 0.5 || r() < 0.25) continue;
      set(x + dx, top + dy, z + dz, B.LEAVES);
    }
  }
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

// Play Alone: a small log cabin (indestructible) where the player starts.
// Door on the +Z side, a window in each other wall, plank floor and roof.
function buildCabin(world, cx, by, cz) {
  const R = 3;
  const put = (x, y, z, id, lock = true) => {
    if (!world.inside(x, y, z)) return;
    const i = world.idx(x, y, z);
    world.data[i] = id; world.locked[i] = lock && id !== B.AIR ? 1 : 0;
  };
  for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const x = cx + dx, z = cz + dz;
    // solid ground under the cabin and its porch, open air above
    for (let y = by - 1; y > by - 6; y--) { if (world.get(x, y, z) === B.AIR || world.get(x, y, z) === B.WATER) put(x, y, z, B.DIRT, false); }
    for (let y = by; y <= by + 6; y++) put(x, y, z, B.AIR);
    const inside = Math.abs(dx) <= R && Math.abs(dz) <= R;
    put(x, by - 1, z, inside ? B.WOOD : B.DIRT, inside);
    if (!inside) continue;
    const wall = Math.abs(dx) === R || Math.abs(dz) === R;
    if (wall) for (let y = by; y <= by + 2; y++) put(x, y, z, B.LOG);
    put(x, by + 3, z, B.WOOD);                                     // roof
    if (Math.abs(dx) <= R - 1 && Math.abs(dz) <= 1) put(x, by + 4, z, B.WOOD); // ridge
  }
  put(cx, by, cz + R, B.AIR); put(cx, by + 1, cz + R, B.AIR);       // door
  put(cx - R, by + 1, cz, B.AIR); put(cx + R, by + 1, cz, B.AIR); put(cx, by + 1, cz - R, B.AIR); // windows
  // an ever-burning campfire, a storage chest and a bed
  const fire = { x: cx - 2, y: by, z: cz - 2 }, chest = { x: cx - 2, y: by, z: cz + 1 }, bed = { x: cx + 1.5, y: by, z: cz - 1.5 };
  put(fire.x, fire.y, fire.z, B.CAMPFIRE);
  put(chest.x, chest.y, chest.z, B.SUPPLY);
  for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    const k = cx + dx + (cz + dz) * world.W;
    if (world.tops && k >= 0 && k < world.tops.length) world.tops[k] = Math.max(world.tops[k], by + (Math.abs(dx) <= R && Math.abs(dz) <= R ? 4 : -1));
  }
  return { x: cx, y: by, z: cz, r: R, fire, chest, bed };
}
