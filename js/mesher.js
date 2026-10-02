// Builds chunk geometry: culled faces, per-vertex ambient occlusion and a
// simple "sky exposure" darkening so trenches and tunnels feel dark.
import * as THREE from 'three';
import { CHUNK } from './config.js';
import { B, BLOCKS, OPAQUE } from './blocks.js';

// corners listed counter-clockwise when seen from outside the face
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t: 'side' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t: 'side' },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t: 'top' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t: 'bottom' },
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t: 'side' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t: 'side' },
];
const UVC = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.45, 0.64, 0.82, 1.0];

class Buf {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.glow = []; this.sky = []; this.idx = []; this.n = 0; }
  toGeometry() {
    if (this.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.setAttribute('sky', new THREE.Float32BufferAttribute(this.sky, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// two diagonal, double-sided quads (barbed wire and similar)
function crossQuads(buf, x, y, z, tile, light) {
  const quads = [[[0.1, 0.1], [0.9, 0.9]], [[0.9, 0.1], [0.1, 0.9]]];
  for (const [[ax, az], [bx, bz]] of quads) {
    for (const flip of [false, true]) {
      const base = buf.n;
      const pts = [[ax, 0, az], [bx, 0, bz], [bx, 1, bz], [ax, 1, az]];
      const nx = (bz - az), nz = -(bx - ax), nl = Math.hypot(nx, nz) * (flip ? -1 : 1);
      for (let k = 0; k < 4; k++) {
        buf.pos.push(x + pts[k][0], y + pts[k][1], z + pts[k][2]);
        buf.nor.push(nx / nl, 0, nz / nl);
        buf.uv.push(UVC[k][0] ? tile[2] : tile[0], UVC[k][1] ? tile[3] : tile[1]);
        buf.col.push(0.92, 0.92, 0.92);
        buf.glow.push(0);
        buf.sky.push(light);
      }
      if (flip) buf.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      buf.n += 4;
    }
  }
}

// ------------------------------------------------------------------ light
// Sky light: 12 in cells open to the sky (less the deeper they are below the
// original ground), then -1 per block as it spreads sideways and down into
// tunnels. Turned into a gentle brightness curve that never goes pitch black.
export const LIGHT_R = 10;
const MAXL = 12;
export const MIN_SKY = 0.13;
function curve(l) { return MIN_SKY + (1 - MIN_SKY) * Math.pow(Math.max(0, l) / MAXL, 1.35); }

export function skyField(world, bx, bz, size, yLimit = null) {
  const W = world.W, D = world.D, H = world.H, data = world.data, tops = world.tops;
  let maxY = 0;
  const top = new Int16Array(size * size);
  for (let lz = 0; lz < size; lz++) for (let lx = 0; lx < size; lx++) {
    const x = bx + lx, z = bz + lz;
    let y = 0;
    if (x >= 0 && z >= 0 && x < W && z < D) { y = H - 1; while (y > 0 && !OPAQUE[data[x + W * (z + D * y)]]) y--; }
    top[lx + lz * size] = y;
    if (y > maxY) maxY = y;
  }
  const HY = Math.min(H, (yLimit ?? maxY) + 3);
  const light = new Uint8Array(size * size * HY);
  const q = new Int32Array(size * size * HY);
  let qh = 0, qt = 0;
  const id = (lx, y, lz) => lx + size * (lz + size * y);
  for (let lz = 0; lz < size; lz++) for (let lx = 0; lx < size; lx++) {
    const x = bx + lx, z = bz + lz;
    const t = top[lx + lz * size];
    const ground = tops && x >= 0 && z >= 0 && x < W && z < D ? tops[x + z * W] : t;
    for (let y = HY - 1; y > t; y--) {
      const depth = Math.max(0, ground - y);          // below the original ground: deeper shafts are dimmer
      const l = Math.max(1, MAXL - Math.floor(depth * 0.75));
      light[id(lx, y, lz)] = l; q[qt++] = id(lx, y, lz);
    }
  }
  const S2 = size * size;
  while (qh < qt) {
    const c = q[qh++];
    const l = light[c] - 1;
    if (l <= 0) continue;
    const lx = c % size, lz = Math.floor(c / size) % size, y = Math.floor(c / S2);
    const tryN = (nx, ny, nz) => {
      if (nx < 0 || nz < 0 || nx >= size || nz >= size || ny < 0 || ny >= HY) return;
      const n = id(nx, ny, nz);
      if (light[n] >= l) return;
      const X = bx + nx, Z = bz + nz;
      const b = (X < 0 || Z < 0 || X >= W || Z >= D) ? 0 : data[X + W * (Z + D * ny)];
      if (OPAQUE[b]) return;
      light[n] = l; q[qt++] = n;
    };
    tryN(lx + 1, y, lz); tryN(lx - 1, y, lz); tryN(lx, y, lz + 1); tryN(lx, y, lz - 1); tryN(lx, y - 1, lz); tryN(lx, y + 1, lz);
  }
  return {
    maxY,
    level(x, y, z) {
      const lx = x - bx, lz = z - bz;
      if (lx < 0 || lz < 0 || lx >= size || lz >= size || y >= HY) return MAXL;
      if (y < 0) return 0;
      return light[id(lx, y, lz)];
    },
    bright(x, y, z) { return curve(this.level(x, y, z)); },
  };
}

// brightness of daylight at a single point (for the player's held item)
export function skyAt(world, x, y, z) {
  const f = skyField(world, Math.floor(x) - 8, Math.floor(z) - 8, 17, Math.floor(y) + 4);
  return f.bright(Math.floor(x), Math.floor(y), Math.floor(z));
}

export function buildChunk(world, cx, cz, uvs, useAO) {
  const W = world.W, D = world.D, H = world.H, data = world.data, glowMap = world.glow;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK), z1 = Math.min(D, z0 + CHUNK);
  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= H || x < 0 || z < 0 || x >= W || z >= D) return B.AIR;
    return data[x + W * (z + D * y)];
  };
  // sky light that spreads from the open sky into trenches and tunnels
  const L = skyField(world, x0 - LIGHT_R, z0 - LIGHT_R, CHUNK + LIGHT_R * 2);
  const maxY = L.maxY;
  const skyLight = (x, y, z) => L.bright(x, y, z);

  const solid = new Buf(), water = new Buf();
  const yMax = Math.min(H - 1, maxY + 2);
  for (let y = 0; y <= yMax; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const id = data[x + W * (z + D * y)];
    if (id === B.AIR) continue;
    const def = BLOCKS[id];
    if (def.render === 'none') continue;
    if (def.render === 'cross') { crossQuads(solid, x, y, z, uvs[def.tiles.side], skyLight(x, y, z)); continue; }
    const isWater = id === B.WATER;
    const buf = isWater ? water : solid;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f];
      const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
      const nb = get(nx, ny, nz);
      if (isWater) { if (nb !== B.AIR && OPAQUE[nb]) continue; if (nb === B.WATER) continue; }
      else if (def.render === 'leaves') { if (OPAQUE[nb] || nb === B.LEAVES) continue; }
      else if (OPAQUE[nb]) continue;
      const tile = uvs[def.tiles[F.t]];
      // self-lit blocks (fort lamps) and faces looking into a lit fort interior
      let glow = def.glow;
      if (!isWater && nx >= 0 && nz >= 0 && nx < W && nz < D && ny >= 0 && ny < H) glow = Math.max(glow, glowMap[nx + W * (nz + D * ny)] / 255);
      const sl = skyLight(nx, ny, nz);
      const shade = F.n[1] === 1 ? 1 : F.n[1] === -1 ? 0.6 : (F.n[0] !== 0 ? 0.85 : 0.75);
      const base = buf.n;
      const aos = [0, 0, 0, 0];
      for (let k = 0; k < 4; k++) {
        const c = F.c[k];
        let px = x + c[0], py = y + c[1], pz = z + c[2];
        if (isWater && F.n[1] !== -1 && c[1] === 1 && get(x, y + 1, z) !== B.WATER) py -= 0.12;
        buf.pos.push(px, py, pz);
        buf.nor.push(F.n[0], F.n[1], F.n[2]);
        buf.uv.push(UVC[k][0] ? tile[2] : tile[0], UVC[k][1] ? tile[3] : tile[1]);
        let ao = 3;
        if (useAO && !isWater) {
          // two tangent axes of the face
          const a = F.n[0] !== 0 ? 0 : F.n[1] !== 0 ? 1 : 2;
          const u = a === 0 ? 1 : 0, v = a === 2 ? 1 : 2;
          const su = c[u] * 2 - 1, sv = c[v] * 2 - 1;
          const p = [nx, ny, nz];
          const q1 = p.slice(); q1[u] += su;
          const q2 = p.slice(); q2[v] += sv;
          const q3 = p.slice(); q3[u] += su; q3[v] += sv;
          const s1 = OPAQUE[get(q1[0], q1[1], q1[2])], s2 = OPAQUE[get(q2[0], q2[1], q2[2])];
          const s3 = OPAQUE[get(q3[0], q3[1], q3[2])];
          ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + s3);
        }
        aos[k] = ao;
        const l = AO_CURVE[ao] * shade;
        buf.col.push(l, l, l);
        buf.glow.push(glow);
        buf.sky.push(sl);
      }
      if (aos[0] + aos[2] < aos[1] + aos[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      buf.n += 4;
    }
  }
  return { solid: solid.toGeometry(), water: water.toGeometry() };
}
