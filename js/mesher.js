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
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; this.n = 0; }
  toGeometry() {
    if (this.n === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export function buildChunk(world, cx, cz, uvs, useAO) {
  const W = world.W, D = world.D, H = world.H, data = world.data;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK), z1 = Math.min(D, z0 + CHUNK);
  const get = (x, y, z) => {
    if (y < 0) return B.BEDROCK;
    if (y >= H || x < 0 || z < 0 || x >= W || z >= D) return B.AIR;
    return data[x + W * (z + D * y)];
  };
  // local sky height map (with 1 block border) – highest opaque block per column
  const SW = CHUNK + 2;
  const sky = new Int16Array(SW * SW);
  let maxY = 0;
  for (let lz = 0; lz < SW; lz++) for (let lx = 0; lx < SW; lx++) {
    const x = x0 + lx - 1, z = z0 + lz - 1;
    let y = H - 1;
    if (x >= 0 && z >= 0 && x < W && z < D) {
      while (y > 0 && !OPAQUE[data[x + W * (z + D * y)]]) y--;
    } else y = 0;
    sky[lx + lz * SW] = y;
    if (y > maxY) maxY = y;
  }
  const skyLight = (x, y, z) => {
    const lx = x - x0 + 1, lz = z - z0 + 1;
    if (lx < 0 || lz < 0 || lx >= SW || lz >= SW) return 1;
    const top = sky[lx + lz * SW];
    if (y > top) return 1;
    return Math.max(0.28, 1 - (top - y + 1) * 0.16);
  };

  const solid = new Buf(), water = new Buf();
  const yMax = Math.min(H - 1, maxY + 2);
  for (let y = 0; y <= yMax; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const id = data[x + W * (z + D * y)];
    if (id === B.AIR) continue;
    const def = BLOCKS[id];
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
        const l = AO_CURVE[ao] * shade * sl;
        buf.col.push(l, l, l);
      }
      if (aos[0] + aos[2] < aos[1] + aos[3]) buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
      else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      buf.n += 4;
    }
  }
  return { solid: solid.toGeometry(), water: water.toGeometry() };
}
