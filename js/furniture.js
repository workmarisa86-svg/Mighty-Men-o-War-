// Town Life furniture: beds (a double bed for the parents, singles for the
// sons), a dining table with chairs, a sofa, a cupboard, a rug and (mansions
// and houses) a fireplace with glowing embers, in every home; a cot in the
// jail cell. Everything in town is baked into one mesh (one draw call) plus
// one for the embers, so it costs almost nothing on phones. Beds, tables,
// sofas and cupboards are solid (you walk round them); chairs and rugs are not.
// Plates appear on a family's table while you share their supper.
import * as THREE from 'three';
import { PartList, mat4 } from './merge.js';

const WOOD = 0x6a4a2a, DARKWOOD = 0x4a3020, LINEN = 0xe8e0d0, WHITE = 0xf0ece4;
const BLANKET = { mansion: 0x7a2a2e, house: 0x3a5a7a, cottage: 0x8a7a54 };
const SOFA = { mansion: 0x5e2434, house: 0x5a6a4a, cottage: 0x7a6a50 };
const RUG = { mansion: 0x8a2a2a, house: 0x6a5a3a };
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

export class Furniture {
  constructor(game, village) {
    this.game = game; this.village = village;
    this.solids = [];                    // axis-aligned boxes the player can't walk through
    const P = new PartList(), E = new PartList();
    for (const b of village.buildings) {
      if (b.furn) this.home(P, E, b.furn);
      if (b.cell) this.cot(P, b.cell);
    }
    this.mesh = new THREE.Mesh(P.build(), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.embers = new THREE.Mesh(E.build(), new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.mesh.matrixAutoUpdate = false; this.embers.matrixAutoUpdate = false;
    game.scene.add(this.mesh, this.embers);
    this.plates = null; this.nearT = 0; this.near = [];
  }
  // a part at world (x, y, z) turned so its local +z faces f ({x, z}); lx, ly, lz in that frame
  put(L, geo, at, f, lx, ly, lz, color) {
    const yaw = Math.atan2(f.x, f.z), c = Math.cos(yaw), s = Math.sin(yaw);
    L.add(geo, mat4([at.x + lx * c + lz * s, at.y + ly, at.z - lx * s + lz * c], [0, yaw, 0]), color);
  }
  // remember a solid piece (its footprint, in the same frame)
  solid(at, f, w, d, h) {
    const ax = Math.abs(f.x) > 0.5;                 // facing along x: depth runs along x
    const hx = (ax ? d : w) / 2, hz = (ax ? w : d) / 2;
    const b = { minX: at.x - hx, maxX: at.x + hx, minZ: at.z - hz, maxZ: at.z + hz, minY: at.y, maxY: at.y + h };
    this.solids.push({ b, box: () => b });
  }
  home(P, E, F) {
    const st = F.status;
    // beds: head toward the back wall
    for (const bd of F.beds) {
      const f = bd.head, at = { x: bd.pos.x, y: F.base, z: bd.pos.z }, W = bd.w * 0.95;
      this.put(P, box(W, 0.3, 1.95), at, f, 0, 0.3, 0, DARKWOOD);
      this.put(P, box(W - 0.06, 0.12, 1.85), at, f, 0, 0.51, 0, LINEN);
      this.put(P, box(W - 0.03, 0.06, 1.2), at, f, 0, 0.6, -0.33, BLANKET[st]);
      for (const x of bd.w === 2 ? [-0.45, 0.45] : [0]) this.put(P, box(0.62, 0.1, 0.32), at, f, x, 0.62, 0.7, WHITE);
      this.put(P, box(W, st === 'mansion' ? 1.15 : 0.9, 0.08), at, f, 0, st === 'mansion' ? 0.72 : 0.6, 0.98, DARKWOOD);
      this.put(P, box(W, 0.55, 0.06), at, f, 0, 0.42, -0.98, DARKWOOD);
      this.solid(at, f, W, 1.95, 0.6);
    }
    // the dining table and its chairs
    const T = F.table, tf = T.dirOut, tat = { x: T.center.x, y: F.base, z: T.center.z };
    const tw = T.wide * 0.9, tl = T.len * 0.95;
    this.put(P, box(tw, 0.06, tl), tat, tf, 0, 0.76, 0, WOOD);
    if (st === 'mansion') this.put(P, box(tw + 0.04, 0.015, tl - 0.3), tat, tf, 0, 0.795, 0, WHITE);   // a tablecloth
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(P, box(0.07, 0.73, 0.07), tat, tf, sx * (tw / 2 - 0.08), 0.365, sz * (tl / 2 - 0.08), DARKWOOD);
    this.solid(tat, tf, tw, tl, 0.8);
    for (const ch of F.chairs) {
      const at = { x: ch.x, y: F.base, z: ch.z }, f = ch.face;
      this.put(P, box(0.42, 0.05, 0.42), at, f, 0, 0.45, 0, WOOD);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(P, box(0.05, 0.45, 0.05), at, f, sx * 0.18, 0.225, sz * 0.18, DARKWOOD);
      this.put(P, box(0.42, 0.5, 0.05), at, f, 0, 0.72, -0.19, WOOD);
    }
    // the sofa against the left wall, facing into the room
    const S = F.sofa, sat = { x: S.at.x, y: F.base, z: S.at.z }, sf = S.face, sl = S.len * 0.95, col = SOFA[st];
    this.put(P, box(sl, 0.4, 0.8), sat, sf, 0, 0.2, 0.05, col);
    this.put(P, box(sl, 0.55, 0.2), sat, sf, 0, 0.62, -0.3, col);
    for (const sx of [-1, 1]) this.put(P, box(0.16, 0.28, 0.8), sat, sf, sx * (sl / 2 - 0.08), 0.5, 0.05, col);
    this.put(P, box(sl - 0.34, 0.1, 0.58), sat, sf, 0, 0.45, 0.1, new THREE.Color(col).multiplyScalar(1.25).getHex());
    this.solid(sat, sf, sl, 0.85, 0.7);
    // a cupboard by the door, a rug in the middle
    const C = F.cupboard, cat = { x: C.at.x, y: F.base, z: C.at.z };
    this.put(P, box(0.9, 1.8, 0.5), cat, C.face, 0, 0.9, -0.2, DARKWOOD);
    this.put(P, box(0.02, 1.6, 0.02), cat, C.face, 0, 0.9, 0.06, 0x2a1a10);
    for (const sx of [-0.06, 0.06]) this.put(P, box(0.04, 0.04, 0.04), cat, C.face, sx, 0.95, 0.07, 0xc8a050);
    this.solid({ x: cat.x - C.face.x * 0.2, y: cat.y, z: cat.z - C.face.z * 0.2 }, C.face, 0.9, 0.5, 1.8);
    if (F.rug) {
      const R = F.rug, rat = { x: R.at.x, y: F.base, z: R.at.z };
      this.put(P, box(R.w, 0.02, R.d), rat, R.dirOut, 0, 0.012, 0, RUG[st]);
      this.put(P, box(R.w - 0.3, 0.022, R.d - 0.3), rat, R.dirOut, 0, 0.014, 0, new THREE.Color(RUG[st]).multiplyScalar(1.4).getHex());
    }
    // the fireplace: a stone hearth, a dark opening in the brick wall, glowing embers, a mantel
    if (F.fireplace) {
      const Fp = F.fireplace, at = { x: Fp.at.x, y: F.base, z: Fp.at.z }, f = Fp.face;
      this.put(P, box(1.5, 0.1, 0.55), at, f, 0, 0.05, -0.22, 0x8a8a84);
      this.put(P, box(0.9, 0.75, 0.04), at, f, 0, 0.48, -0.48, 0x141210);
      this.put(P, box(1.6, 0.1, 0.32), at, f, 0, 1.25, -0.36, WOOD);
      for (const sx of [-0.2, 0.05, 0.25]) this.put(P, box(0.42, 0.1, 0.1), at, f, sx, 0.16, -0.36, 0x3a2a1a);
      for (const sx of [-0.22, 0, 0.2]) this.put(E, box(0.2, 0.08 + Math.abs(sx) * 0.2, 0.1), at, f, sx, 0.22, -0.4, sx ? 0xd06020 : 0xffa040);
    }
  }
  cot(P, cell) {
    const c = cell.cot, at = { x: c.x + 1, y: c.y, z: c.z + 0.5 }, f = { x: c.dir[0], z: c.dir[1] };
    this.put(P, box(0.8, 0.08, 1.9), at, f, 0, 0.42, 0, 0x5a5a58);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.put(P, box(0.05, 0.4, 0.05), at, f, sx * 0.36, 0.2, sz * 0.9, 0x3a3a38);
    this.put(P, box(0.74, 0.08, 1.8), at, f, 0, 0.5, 0, 0x8a8a7a);
    this.put(P, box(0.76, 0.05, 1.0), at, f, 0, 0.56, -0.35, 0x4a4a40);
  }
  // plates and supper on a family's table (null clears them)
  setPlates(F) {
    if (this.plates) { this.game.scene.remove(this.plates); this.plates.geometry.dispose(); this.plates = null; }
    if (!F) return;
    const L = new PartList(), plate = new THREE.CylinderGeometry(0.13, 0.11, 0.02, 12);
    for (const ch of F.chairs) {
      const at = { x: ch.x, y: F.base, z: ch.z }, f = ch.face;
      this.put(L, plate, at, f, 0, 0.8, 0.42, WHITE);
      this.put(L, box(0.1, 0.05, 0.08), at, f, 0, 0.83, 0.42, 0x8a5a30);
      this.put(L, box(0.05, 0.1, 0.05), at, f, 0.16, 0.85, 0.36, 0xc8d8e0);
    }
    this.put(L, box(0.3, 0.12, 0.3), { x: F.table.center.x, y: F.base, z: F.table.center.z }, F.table.dirOut, 0, 0.85, 0, 0xb07a40);   // the bread or the roast
    this.plates = new THREE.Mesh(L.build(), this.mesh.material);
    this.game.scene.add(this.plates);
  }
  // the solid pieces near p (for the player's collisions), refreshed a few times a second
  obstacles(p) {
    this.nearT -= 1;
    if (this.nearT <= 0) { this.nearT = 10; this.near = this.solids.filter((o) => o.b.maxX > p.x - 6 && o.b.minX < p.x + 6 && o.b.maxZ > p.z - 6 && o.b.minZ < p.z + 6 && Math.abs(o.b.minY - p.y) < 3); }
    return this.near;
  }
  dispose() {
    this.setPlates(null);
    this.game.scene.remove(this.mesh, this.embers);
    this.mesh.geometry.dispose(); this.embers.geometry.dispose();
  }
}
