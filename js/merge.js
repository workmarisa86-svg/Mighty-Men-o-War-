// Tiny geometry merger: bakes many small shapes (each with its own transform,
// colour and texture region) into one BufferGeometry so a whole body part is
// a single draw call.
import * as THREE from 'three';

export class PartList {
  constructor() { this.items = []; }
  // geo: any BufferGeometry; m: Matrix4; color: hex or null; uvRect: [u0, v0, su, sv] or null
  add(geo, m, color = null, uvRect = null) { this.items.push({ geo, m, color, uvRect }); return this; }
  build() {
    const pos = [], nor = [], uv = [], col = [];
    const c = new THREE.Color(), nm = new THREE.Matrix3(), v = new THREE.Vector3();
    for (const { geo, m, color, uvRect } of this.items) {
      const g = geo.index ? geo.toNonIndexed() : geo;
      const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
      nm.getNormalMatrix(m);
      if (color != null) c.set(color); else c.setRGB(1, 1, 1);
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        let u = U ? U.getX(i) : 0, w = U ? U.getY(i) : 0;
        if (uvRect) { u = uvRect[0] + (u - Math.floor(u)) * uvRect[2]; w = uvRect[1] + (w - Math.floor(w)) * uvRect[3]; }
        uv.push(u, w);
        col.push(c.r, c.g, c.b);
      }
      if (g !== geo) g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.computeBoundingSphere();
    return out;
  }
}

const tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
// matrix from position, euler rotation and scale arrays
export function mat4(p = [0, 0, 0], r = 0, s = 1) {
  if (typeof r === 'number') r = [0, 0, 0];
  tmpQ.setFromEuler(tmpE.set(r[0], r[1], r[2]));
  return new THREE.Matrix4().compose(new THREE.Vector3(...p), tmpQ, new THREE.Vector3(...(typeof s === 'number' ? [s, s, s] : s)));
}

// Merge a Group of meshes into one mesh per material (shared, cached by key).
const mergedCache = {};
export function mergeGroup(key, group) {
  if (mergedCache[key]) return mergedCache[key];
  group.updateMatrixWorld(true);
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMat.has(o.material)) byMat.set(o.material, new PartList());
    byMat.get(o.material).add(o.geometry, o.matrixWorld.clone());
  });
  const parts = [...byMat].map(([material, list]) => ({ geometry: list.build(), material }));
  mergedCache[key] = { parts, userData: group.userData };
  return mergedCache[key];
}
