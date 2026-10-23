// Town Life's hidden places, carved into the finished terrain: caves in the
// hills, old gold mines (one of them unsafe), abandoned cabins with a cellar,
// and a ghost town far out in the hills. Each has a strongbox (a chest) with
// coins, goods, a note and sometimes a treasure map; hidden.js runs them.
// They use their own random numbers, so an older world gets them without its
// fields, homes or paths moving; they keep well away from the town, the
// cottage, the homes and the water.
import { SEA } from './config.js';
import { B } from './blocks.js';
import { mulberry32 } from './noise.js';

export function buildHidden(world, put, { seed, tops, dTown, cot, homes }) {
  const W = world.W, D = world.D, rnd = mulberry32(seed + 4242);
  const places = [];
  const top = (x, z) => tops[x + z * W];
  const set = (x, y, z, id, lock = false) => { if (world.inside(x, y, z) && y > 1) put(x, y, z, id, lock); };
  const air = (x, y, z) => { if (world.inside(x, y, z) && y > 1 && !world.isLocked(x, y, z)) put(x, y, z, B.AIR, false); };
  // a spot of dry, open ground, far from everyone (and from the other places)
  // the best of many spots for a big place (the least water, the flattest)
  const pickBest = (minR, maxR, room) => {
    let best = null;
    for (let k = 0; k < 500; k++) {
      const a = rnd() * Math.PI * 2, r = minR + rnd() * (maxR - minR);
      const x = Math.floor(W / 2 + Math.cos(a) * r), z = Math.floor(D / 2 + Math.sin(a) * r);
      if (x < room + 12 || z < room + 12 || x >= W - room - 12 || z >= D - room - 12) continue;
      if (dTown(x, z) < 60 || Math.hypot(x - cot.x, z - cot.z) < 70) continue;
      if (homes.some((o) => Math.hypot(x - o.x, z - o.z) < o.flat + room + 14)) continue;
      let lo = 99, hi = 0, wet = 0;
      for (let dz = -room; dz <= room; dz += 2) for (let dx = -room; dx <= room; dx += 2) {
        const t = top(x + dx, z + dz); lo = Math.min(lo, t); hi = Math.max(hi, t);
        if (t <= SEA + 1 || world.get(x + dx, t, z + dz) === B.SAND) wet++;
      }
      const score = wet * 10 + (hi - lo);
      if (!best || score < best.score) best = { x, z, y: top(x, z) + 1, score };
    }
    if (best && best.y <= SEA + 2) best.y = SEA + 3;
    return best && best.score < 60 ? best : null;
  };
  const pick = (minR, maxR, room, rough = 2) => {
    for (let k = 0; k < 400; k++) {
      const a = rnd() * Math.PI * 2, r = minR + rnd() * (maxR - minR);
      const x = Math.floor(W / 2 + Math.cos(a) * r), z = Math.floor(D / 2 + Math.sin(a) * r);
      if (x < room + 12 || z < room + 12 || x >= W - room - 12 || z >= D - room - 12) continue;
      if (dTown(x, z) < 50 || Math.hypot(x - cot.x, z - cot.z) < 60) continue;
      if (homes.some((o) => Math.hypot(x - o.x, z - o.z) < o.flat + 26)) continue;
      if (places.some((p) => Math.hypot(p.x - x, p.z - z) < 50 + room)) continue;
      let lo = 99, hi = 0, wet = false;
      for (let dz = -room; dz <= room; dz += 2) for (let dx = -room; dx <= room; dx += 2) {
        const t = top(x + dx, z + dz); lo = Math.min(lo, t); hi = Math.max(hi, t);
        if (t <= SEA + 1 || world.get(x + dx, t, z + dz) === B.SAND) wet = true;
      }
      if (wet || hi - lo > rough) continue;
      return { x, z, y: top(x, z) + 1 };
    }
    return null;
  };
  // clear the trees off a patch (a whole tree, trunk and crown)
  const clearAbove = (x0, z0, x1, z1, y0) => {
    for (let z = z0 - 3; z <= z1 + 3; z++) for (let x = x0 - 3; x <= x1 + 3; x++) for (let y = y0; y < Math.min(world.H, y0 + 12); y++) {
      const id = world.get(x, y, z); if (id === B.LOG || id === B.LEAVES) put(x, y, z, B.AIR, false);
    }
  };
  const chest = (x, y, z) => { set(x, y, z, B.SUPPLY, true); return { x, y, z }; };

  // ---- the ghost town: a dead street of fallen-in shops, far out in the hills -----
  {
    const s = pickBest(140, 225, 16);
    if (s) {
      const y = s.y, bs = [];
      clearAbove(s.x - 18, s.z - 12, s.x + 18, s.z + 12, y - 1);
      for (let z = s.z - 11; z <= s.z + 11; z++) for (let x = s.x - 18; x <= s.x + 18; x++) {
        const t = top(x, z);
        for (let yy = y; yy < y + 10; yy++) air(x, yy, z);
        for (let yy = t; yy < y; yy++) set(x, yy, z, B.DIRT);
        tops[x + z * W] = y - 1;
        set(x, y - 1, z, Math.abs(z - s.z) <= 2 ? B.PATH : B.GRASS);
      }
      for (const side of [-1, 1]) for (let k = 0; k < 3; k++) {
        const bx0 = s.x - 16 + k * 12, bz0 = side < 0 ? s.z - 10 : s.z + 4, bx1 = bx0 + 8, bz1 = bz0 + 6;
        const hgt = 3 + (k % 2);
        for (let z = bz0; z <= bz1; z++) for (let x = bx0; x <= bx1; x++) {
          set(x, y - 1, z, B.WOOD);
          const wall = x === bx0 || x === bx1 || z === bz0 || z === bz1;
          if (wall) for (let h = 0; h < hgt; h++) if (rnd() > 0.22 + h * 0.12) set(x, y + h, z, B.WOOD);
          if (rnd() > 0.6) set(x, y + hgt, z, B.WOOD);
        }
        // a false front, half fallen
        const fz = side < 0 ? bz1 : bz0;
        for (let x = bx0; x <= bx1; x++) for (let h = hgt; h < hgt + 2; h++) if (rnd() > 0.4) set(x, y + h, fz, B.WOOD);
        const dxx = bx0 + 4; air(dxx, y, fz); air(dxx, y + 1, fz);
        bs.push({ x0: bx0, z0: bz0, x1: bx1, z1: bz1 });
      }
      // the smugglers' cache, in the back of the old bank
      const b = bs[4];
      const c = chest(b.x1 - 1, y, b.z1 - 1);
      places.push({ id: 'ghost', kind: 'ghost', x: s.x, y, z: s.z, buildings: bs, chest: c });
    }
  }
  // ---- caves: a sloping passage down into a wide chamber ------------------------
  for (let n = 0; n < 3; n++) {
    const s = pick(90, 230, 6, 3);
    if (!s) continue;
    const a = rnd() * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
    // the mouth: a ring of boulders round the opening
    for (let k = 0; k < 10; k++) { const bx = Math.round(s.x + Math.cos(k * 0.63) * 2.6), bz = Math.round(s.z + Math.sin(k * 0.63) * 2.6); if (k % 3) set(bx, top(bx, bz) + 1, bz, B.STONE); }
    clearAbove(s.x - 3, s.z - 3, s.x + 3, s.z + 3, s.y);
    // the passage: 2 wide, 3 high, one block down for every two along
    let x = s.x, z = s.z, y = s.y, len = 18;
    for (let i = 0; i < len; i++) {
      const X = Math.round(s.x + dx * i), Z = Math.round(s.z + dz * i);
      y = s.y - Math.floor(i / 2) - 1;
      for (let w = -1; w <= 1; w++) for (let h = 0; h < 3; h++) air(X + Math.round(-dz * w), y + h, Z + Math.round(dx * w));
      x = X; z = Z;
    }
    // the chamber
    const cxp = Math.round(x + dx * 5), czp = Math.round(z + dz * 5), cy = y, R = 6;
    for (let oz = -R; oz <= R; oz++) for (let ox = -R; ox <= R; ox++) for (let oy = 0; oy <= 4; oy++) {
      const d = Math.hypot(ox / R, oz / R, (oy - 1) / 3.6);
      if (d < 1) air(cxp + ox, cy + oy, czp + oz);
    }
    for (let oz = -R; oz <= R; oz++) for (let ox = -R; ox <= R; ox++) if (Math.hypot(ox, oz) < R - 0.5) set(cxp + ox, cy - 1, czp + oz, B.STONE);
    // ore in the walls (iron, a little gold)
    for (let k = 0; k < 10; k++) { const t = rnd() * 6.28; set(Math.round(cxp + Math.cos(t) * R), cy + 1 + Math.floor(rnd() * 2), Math.round(czp + Math.sin(t) * R), k < 3 ? B.GOLD : B.IRON); }
    const c = chest(cxp + Math.round(-dx * 0) + Math.round(dz * 3), cy, czp + Math.round(-dx * 3));
    places.push({ id: 'cave' + n, kind: 'cave', x: s.x, y: s.y, z: s.z, inner: { x: cxp, y: cy, z: czp }, chest: c });
  }

  // ---- old gold mines: a timbered tunnel into the ground, gold in its walls ------
  for (let n = 0; n < 2; n++) {
    const s = pick(110, 235, 5, 3);
    if (!s) continue;
    // the tunnel runs in toward the middle of the valley (never off the edge of the world)
    const a = Math.round(Math.atan2(D / 2 - s.z, W / 2 - s.x) / (Math.PI / 2)) * Math.PI / 2, dx = Math.round(Math.cos(a)), dz = Math.round(Math.sin(a));
    const sx = -dz, sz = dx;              // sideways
    clearAbove(s.x - 4, s.z - 4, s.x + 4, s.z + 4, s.y);
    // the timber frame over the mouth, and a mound of spoil beside it
    for (const w of [-2, 2]) for (let h = 0; h < 4; h++) set(s.x + sx * w, s.y + h, s.z + sz * w, B.LOG);
    for (let w = -2; w <= 2; w++) set(s.x + sx * w, s.y + 3, s.z + sz * w, B.WOOD);
    for (let k = 0; k < 7; k++) { const px = s.x + sx * (4 + (k % 2)) - dx * (k >> 1), pz = s.z + sz * (4 + (k % 2)) - dz * (k >> 1); set(px, top(px, pz) + 1, pz, B.RUBBLE); }
    // the shaft: down a ramp, then level along the vein, with a side drift
    const pts = [];
    let y = s.y;
    const L = 30;
    for (let i = 0; i < L; i++) {
      const X = s.x + dx * i, Z = s.z + dz * i;
      if (i > 1 && i < 14 && i % 2 === 0) y--;
      for (let w = -1; w <= 1; w++) for (let h = 0; h < 3; h++) air(X + sx * w, y + h, Z + sz * w);
      // timber sets every four blocks
      if (i > 1 && i % 4 === 0) { for (const w of [-1, 1]) for (let h = 0; h < 3; h++) set(X + sx * w, y + h, Z + sz * w, B.LOG); for (let w = -1; w <= 1; w++) set(X + sx * w, y + 3, Z + sz * w, B.WOOD); }
      set(X, y - 1, Z, i < 3 ? B.PATH : B.RUBBLE);
      // gold showing in the walls along the level part
      if (i > 14 && i % 3 === 0) for (const w of [-2, 2]) if (rnd() < 0.7) set(X + sx * w, y + 1, Z + sz * w, B.GOLD);
      pts.push({ x: X, y, z: Z });
    }
    // the side drift at the end, with the strongbox
    const e = pts[pts.length - 1];
    for (let j = 1; j < 9; j++) for (let w = -1; w <= 0; w++) for (let h = 0; h < 3; h++) air(e.x + sx * j + dx * w, e.y + h, e.z + sz * j + dz * w);
    for (let j = 3; j < 9; j += 2) set(e.x + sx * j + dx, e.y + 1, e.z + sz * j + dz, B.GOLD);
    const c = chest(e.x + sx * 8, e.y, e.z + sz * 8);
    places.push({ id: 'mine' + n, kind: 'mine', unsafe: n === 0, x: s.x, y: s.y, z: s.z, dir: [dx, dz], path: pts.filter((p, i) => i % 3 === 0), inner: e, chest: c });
  }

  // ---- abandoned cabins: logs gone grey, a broken roof, a cellar under the floor -
  for (let n = 0; n < 3; n++) {
    const s = pick(80, 225, 5, 2);
    if (!s) continue;
    const x0 = s.x - 3, z0 = s.z - 3, x1 = s.x + 3, z1 = s.z + 2, y = s.y;
    clearAbove(x0, z0, x1, z1, y);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      set(x, y - 1, z, B.WOOD);                                       // the floor
      for (let h = 0; h < 6; h++) air(x, y + h, z);
      const wall = x === x0 || x === x1 || z === z0 || z === z1;
      if (wall) for (let h = 0; h < 3; h++) if (rnd() > 0.12 || h === 0) set(x, y + h, z, B.LOG);   // gaps where logs fell
      if (rnd() > 0.35) set(x, y + 3, z, B.THATCH);                   // half the roof is gone
    }
    // the doorway (south), a window or two
    const dxd = s.x;
    air(dxd, y, z1); air(dxd, y + 1, z1);
    air(x0, y + 1, s.z); air(x1, y + 1, s.z - 1);
    // the cellar: a hatch in the floor with a ladder down to a little room
    const hx = x0 + 1, hz = z0 + 1, cy = y - 5;
    for (let h = 1; h <= 5; h++) { air(hx, y - h, hz); set(hx, y - h, hz - 1, B.LADDER); }   // the shaft, the ladder on its wall
    air(hx, y - 1, hz);
    for (let z = hz; z <= hz + 3; z++) for (let x = hx; x <= hx + 4; x++) { for (let h = 0; h < 3; h++) air(x, cy + h, z); set(x, cy - 1, z, B.WOOD); }
    const c = chest(hx + 4, cy, hz + 3);
    places.push({ id: 'cabin' + n, kind: 'cabin', x: s.x, y, z: s.z, inner: { x: hx + 2, y: cy, z: hz + 1 }, chest: c });
  }

  return places;
}
