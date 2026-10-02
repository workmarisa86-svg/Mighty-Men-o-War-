// Rafts: 3x3 log platforms that float on still water. Walking on one paddles it.
import * as THREE from 'three';
import { SEA } from './config.js';
import { B } from './blocks.js';

const HALF = 1.5;
let sharedMat = null;

export class Raft {
  constructor(scene, x, z, atlas) {
    this.x = x; this.z = z;
    this.scene = scene;
    this.t = Math.random() * 10;
    if (!sharedMat) {
      const tex = new THREE.CanvasTexture(atlas.tileCanvas('log_side'));
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      sharedMat = new THREE.MeshLambertMaterial({ map: tex });
    }
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3, 7), sharedMat);
      log.rotation.x = Math.PI / 2;
      log.position.set(-1.25 + i * 0.5, 0, 0);
      g.add(log);
    }
    const ropeMat = new THREE.MeshLambertMaterial({ color: 0x8a7a58 });
    for (const zz of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.12, 0.2), ropeMat);
      beam.position.set(0, 0.22, zz);
      g.add(beam);
    }
    this.mesh = g;
    scene.add(g);
    this.sync();
  }
  box() {
    return { minX: this.x - HALF, maxX: this.x + HALF, minZ: this.z - HALF, maxZ: this.z + HALF, minY: SEA - 0.35, maxY: SEA + 0.18 };
  }
  sync() { this.mesh.position.set(this.x, SEA - 0.1, this.z); }
  update(dt) {
    this.t += dt;
    this.mesh.position.y = SEA - 0.08 + Math.sin(this.t * 1.3) * 0.03;
    this.mesh.rotation.z = Math.sin(this.t * 0.9) * 0.015;
  }

  static fits(world, x, z) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      for (const [ox, oz] of [[-0.45, -0.45], [0.45, 0.45], [-0.45, 0.45], [0.45, -0.45]]) {
        const bx = Math.floor(x + dx + ox), bz = Math.floor(z + dz + oz);
        if (world.get(bx, SEA - 1, bz) !== B.WATER) return false;
        if (world.get(bx, SEA, bz) !== B.AIR) return false;
      }
    }
    return true;
  }
  tryMove(world, dx, dz) {
    const nx = this.x + dx, nz = this.z + dz;
    if (!Raft.fits(world, nx, nz)) return false;
    this.x = nx; this.z = nz; this.sync();
    return true;
  }
  hitTest(origin, dir, maxDist) {
    const b = this.box();
    const box = new THREE.Box3(new THREE.Vector3(b.minX, b.minY, b.minZ), new THREE.Vector3(b.maxX, b.maxY, b.maxZ));
    const hit = new THREE.Ray(origin, dir).intersectBox(box, new THREE.Vector3());
    if (!hit) return null;
    const d = hit.distanceTo(origin);
    return d <= maxDist ? d : null;
  }
  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
