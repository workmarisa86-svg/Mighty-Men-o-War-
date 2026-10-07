// Lightweight grid pathfinding (A*) over standable cells for walking
// characters (townspeople, posse). Steps up one block, drops up to three,
// needs two blocks of head room. Capped in size; returns a partial route
// when the goal can't be reached but a closer spot can.
import { B, SOLID } from './blocks.js';

export function findPath(world, from, to, maxNodes = 2500, keepAll = false) {
  const W = world.W, D = world.D;
  const stand = (x, y, z) => x > 0 && z > 0 && x < W - 1 && z < D - 1 && SOLID[world.get(x, y - 1, z)] && !SOLID[world.get(x, y, z)] && !SOLID[world.get(x, y + 1, z)] && world.get(x, y, z) !== B.WATER;
  const sx = Math.floor(from.x), sy = Math.floor(from.y + 0.2), sz = Math.floor(from.z);
  const tx = Math.floor(to.x), tz = Math.floor(to.z), ty = to.y != null ? Math.floor(to.y + 0.2) : null;
  const key = (x, y, z) => (y * D + z) * W + x;
  const open = [], came = new Map(), cost = new Map();
  const push = (n) => { open.push(n); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p].f <= n.f) break; open[i] = open[p]; open[p] = n; i = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < open.length && open[l].f < open[m].f) m = l; if (r < open.length && open[r].f < open[m].f) m = r; if (m === i) break; [open[i], open[m]] = [open[m], open[i]]; i = m; } } return top; };
  const h = (x, y, z) => Math.abs(x - tx) + Math.abs(z - tz) + (ty != null ? Math.abs(y - ty) : 0);
  const k0 = key(sx, sy, sz);
  cost.set(k0, 0); push({ x: sx, y: sy, z: sz, k: k0, f: h(sx, sy, sz) });
  let found = null, n = 0, best = null, bh = 1e9;
  while (open.length && n < maxNodes) {
    const c = pop(); n++;
    const hc = h(c.x, c.y, c.z);
    if (hc < bh) { bh = hc; best = c; }
    if (c.x === tx && c.z === tz && (ty == null || Math.abs(c.y - ty) <= 1)) { found = c; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, z = c.z + dz;
      for (const dy of [0, 1, -1, -2, -3]) {
        const y = c.y + dy;
        if (dy === 1 && SOLID[world.get(c.x, c.y + 2, c.z)]) continue;
        if (!stand(x, y, z)) continue;
        const k = key(x, y, z), nc = cost.get(c.k) + 1 + (dy < 0 ? 0.3 : dy > 0 ? 3 : 0);   // climbing is a last resort
        if (nc < (cost.get(k) ?? 1e9)) { cost.set(k, nc); came.set(k, c); push({ x, y, z, k, f: nc + h(x, y, z) }); }
        break;
      }
    }
  }
  const end = found || (best && bh < h(sx, sy, sz) - 3 ? best : null);
  if (!end) return null;
  const path = [];
  for (let c = end; c && c.k !== k0; c = came.get(c.k)) path.push({ x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
  path.reverse();
  if (keepAll) return path;
  return path.filter((q, i) => i === path.length - 1 || i % 2 === 1 || (path[i + 1] && path[i + 1].y !== q.y));
}
