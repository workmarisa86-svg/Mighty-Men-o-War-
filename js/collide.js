// Body collision between characters (both games): the player, townspeople,
// horses and soldiers bump into each other and can't overlap. Each frame
// every nearby body goes into a coarse grid; pairs that overlap are pushed
// apart gently (heavier bodies move less), never into a wall. Lightweight:
// only bodies within RANGE of the player are considered.
const CELL = 2, RANGE = 60;

export class Collide {
  constructor(game) { this.game = game; this.grid = new Map(); this.bodies = []; }
  gather() {
    const g = this.game, P = g.player.pos, out = this.bodies; out.length = 0;
    const near = (p) => Math.abs(p.x - P.x) < RANGE && Math.abs(p.z - P.z) < RANGE;
    if (!g.dead && !g.player.riding) out.push({ kind: 'player', p: P, r: 0.34, w: 1, ref: g.player });
    if (g.town) for (const v of g.town.folk.list) if (v.alive && !v.away && !v.far && near(v.pos)) out.push({ kind: 'folk', p: v.pos, r: v.horse ? 0.75 : 0.3, w: v.horse ? 4 : 1, ref: v });
    if (g.horses) for (const h of g.horses.list) if (h.alive && !h.rider && near(h.pos)) out.push({ kind: 'horse', p: h.pos, r: 0.75, w: 4, ref: h });
    if (g.horses && g.player.riding) out.push({ kind: 'mount', p: g.player.riding.pos, r: 0.75, w: 4, ref: g.player.riding });
    if (g.enemies && g.enemies.enabled) for (const s of g.enemies.list) if (s.alive && !s.chute && !s.raft && near(s.pos)) out.push({ kind: 'soldier', p: s.pos, r: 0.3, w: 1, ref: s });
    return out;
  }
  update() {
    const B = this.gather(), grid = this.grid;
    grid.clear();
    for (const b of B) { const k = Math.floor(b.p.x / CELL) + ',' + Math.floor(b.p.z / CELL); let c = grid.get(k); if (!c) grid.set(k, c = []); c.push(b); }
    for (const a of B) {
      const cx = Math.floor(a.p.x / CELL), cz = Math.floor(a.p.z / CELL);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = grid.get((cx + dx) + ',' + (cz + dz)); if (!c) continue;
        for (const b of c) {
          if (b === a || b.ref === a.ref) continue;
          if (a.kind === 'soldier' && b.kind === 'soldier') continue;   // soldiers already keep apart (soldiers.js)
          const ex = b.p.x - a.p.x, ez = b.p.z - a.p.z, d = Math.hypot(ex, ez), min = a.r + b.r;
          if (d >= min || Math.abs(b.p.y - a.p.y) > 1.7 || d < 1e-4) continue;
          // push both apart along the line between them, the lighter more
          const over = (min - d) * 0.5, nx = ex / d, nz = ez / d, tw = a.w + b.w;
          this.nudge(a, -nx * over * 2 * b.w / tw, -nz * over * 2 * b.w / tw);
          this.nudge(b, nx * over * 2 * a.w / tw, nz * over * 2 * a.w / tw);
        }
      }
    }
  }
  // move a body a little, unless that would put it inside a block
  nudge(b, dx, dz) {
    const g = this.game, x = b.p.x + dx, z = b.p.z + dz;
    if (b.kind === 'player') { const p = b.ref; if (!p.collides(g.world, g.obstacles(), x, p.pos.y, z, p.crouch ? 1.6 : 1.9)) { p.pos.x = x; p.pos.z = z; } return; }
    if (b.kind === 'folk') { if (b.ref.horse || g.town.folk.free(x, b.p.y, z)) { b.p.x = x; b.p.z = z; } return; }
    if (b.kind === 'horse' || b.kind === 'mount') { if (g.horses.clear(x, b.p.y, z)) { b.p.x = x; b.p.z = z; } return; }
    if (b.kind === 'soldier') { if (g.enemies.bodyFree(x, b.p.y, z)) { b.p.x = x; b.p.z = z; } }
  }
}
