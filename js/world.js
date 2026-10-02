// Voxel world storage, edits (for saving) and ray casting.
import { CHUNK, WORLD_H } from './config.js';
import { B, SOLID } from './blocks.js';

export class World {
  constructor(cfg) {
    this.cfg = cfg;
    this.W = cfg.size; this.D = cfg.size; this.H = WORLD_H;
    this.data = new Uint8Array(this.W * this.D * this.H);
    // 1 = built-in structure block that can never be destroyed (forts, cabin)
    this.locked = new Uint8Array(this.W * this.D * this.H);
    this.edits = new Map();
    this.cx = Math.ceil(this.W / CHUNK);
    this.cz = Math.ceil(this.D / CHUNK);
    this.dirty = new Set();
    this.sites = [];   // generated points of interest (cabin, forts) filled by worldgen
    this.spawn = { x: this.W / 2, y: 40, z: this.D / 2 };
  }

  idx(x, y, z) { return x + this.W * (z + this.D * y); }
  inside(x, y, z) { return x >= 0 && z >= 0 && y >= 0 && x < this.W && z < this.D && y < this.H; }

  get(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= this.H || x < 0 || z < 0 || x >= this.W || z >= this.D) return B.AIR;
    return this.data[x + this.W * (z + this.D * y)];
  }
  isLocked(x, y, z) { return this.inside(x, y, z) && this.locked[this.idx(x, y, z)] === 1; }
  solidAt(x, y, z) { return SOLID[this.get(x, y, z)] === 1; }

  set(x, y, z, id) {
    if (!this.inside(x, y, z)) return false;
    const i = this.idx(x, y, z);
    if (this.data[i] === id) return false;
    const old = this.data[i];
    this.data[i] = id;
    this.edits.set(i, id);
    this.markDirty(x, z);
    if (this.onSet) this.onSet(x, y, z, old, id);
    return true;
  }

  markDirty(x, z) {
    const cx = x >> 4, cz = z >> 4;
    const add = (a, b) => { if (a >= 0 && b >= 0 && a < this.cx && b < this.cz) this.dirty.add(a + b * this.cx); };
    add(cx, cz);
    const lx = x & 15, lz = z & 15;
    if (lx === 0) add(cx - 1, cz);
    if (lx === 15) add(cx + 1, cz);
    if (lz === 0) add(cx, cz - 1);
    if (lz === 15) add(cx, cz + 1);
  }

  // highest non-air, non-water block
  surfaceY(x, z) {
    for (let y = this.H - 1; y > 0; y--) {
      const b = this.get(x, y, z);
      if (b !== B.AIR && b !== B.WATER && b !== B.LEAVES) return y;
    }
    return 0;
  }
  topY(x, z) { // highest non-air (water counts)
    for (let y = this.H - 1; y > 0; y--) { const b = this.get(x, y, z); if (b !== B.AIR && b !== B.LEAVES) return y; }
    return 0;
  }

  // Voxel traversal (Amanatides & Woo). Returns hit block and the face normal.
  // mode 'dig': any block; 'bullet': solid blocks only (leaves, wire, fires are
  // shot through); 'sight': solid blocks and leaves (foliage hides you).
  raycast(ox, oy, oz, dx, dy, dz, maxDist, hitWater = false, mode = 'dig') {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    const startWater = this.get(x, y, z) === B.WATER;
    while (t <= maxDist) {
      const id = this.get(x, y, z);
      const isWater = id === B.WATER;
      const blocks = isWater ? (hitWater && !startWater)
        : mode === 'dig' ? id !== B.AIR
          : mode === 'bullet' ? SOLID[id] === 1
            : (SOLID[id] === 1 || id === B.LEAVES);
      if (blocks) {
        return { x, y, z, id, nx, ny, nz, dist: t };
      }
      if (tmx < tmy && tmx < tmz) { x += sx; t = tmx; tmx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (tmy < tmz) { y += sy; t = tmy; tmy += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tmz; tmz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  serializeEdits() {
    const parts = [];
    for (const [i, id] of this.edits) parts.push(i.toString(36) + ':' + id.toString(36));
    return parts.join(',');
  }
  applyEdits(str) {
    if (!str) return;
    for (const p of str.split(',')) {
      const k = p.indexOf(':');
      const i = parseInt(p.slice(0, k), 36), id = parseInt(p.slice(k + 1), 36);
      if (i >= 0 && i < this.data.length) { this.data[i] = id; this.edits.set(i, id); }
    }
  }
}
