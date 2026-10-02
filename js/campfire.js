// Campfires: a ring of stones, crossed logs and an animated flame with a
// flickering warm light. Crafting and cooking happen next to one.
import * as THREE from 'three';
import { B } from './blocks.js';
import { sfx } from './audio.js';

const LIGHTS = 3;          // fixed light pool (constant count avoids shader recompiles)
let flameTex = null;

function makeFlameTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 46, 2, 32, 40, 28);
  g.addColorStop(0, 'rgba(255,240,180,1)');
  g.addColorStop(0.35, 'rgba(255,170,60,0.95)');
  g.addColorStop(0.7, 'rgba(200,70,20,0.6)');
  g.addColorStop(1, 'rgba(120,30,10,0)');
  x.fillStyle = g;
  x.beginPath(); x.moveTo(32, 2); x.quadraticCurveTo(54, 34, 46, 54); x.quadraticCurveTo(32, 64, 18, 54); x.quadraticCurveTo(10, 34, 32, 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Campfires {
  constructor(game) {
    this.game = game;
    this.map = new Map();     // world index -> fire
    if (!flameTex) flameTex = makeFlameTexture();
    this.flameMat = new THREE.MeshBasicMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.stoneMat = new THREE.MeshLambertMaterial({ color: 0x5c5a56 });
    this.ashMat = new THREE.MeshLambertMaterial({ color: 0x2a2624 });
    this.logMat = new THREE.MeshLambertMaterial({ color: 0x4a3626 });
    this.lights = [];
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xff9a48, 0, 16, 1.4);
      game.scene.add(l); this.lights.push(l);
    }
    this.assignT = 0; this.t = 0; this.crackleT = 0;
    // fires that already exist in the saved world
    const w = game.world;
    for (const [i, id] of w.edits) if (id === B.CAMPFIRE) {
      const x = i % w.W, z = Math.floor(i / w.W) % w.D, y = Math.floor(i / (w.W * w.D));
      this.add(x, y, z);
    }
    for (const s of w.sites) if (s.campfire) this.add(s.campfire.x, s.campfire.y, s.campfire.z);
  }

  add(x, y, z) {
    const key = this.game.world.idx(x, y, z);
    if (this.map.has(key)) return;
    const g = new THREE.Group();
    g.position.set(x + 0.5, y, z + 0.5);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.14), this.stoneMat);
      s.position.set(Math.cos(a) * 0.36, 0.06, Math.sin(a) * 0.36); s.rotation.y = -a;
      g.add(s);
    }
    const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 10), this.ashMat);
    ash.position.y = 0.02; g.add(ash);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 6), this.logMat);
      log.rotation.z = Math.PI / 2 - 0.35; log.rotation.y = i * Math.PI / 4 + 0.3; log.position.y = 0.14;
      g.add(log);
    }
    const flames = [];
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.75), this.flameMat);
      f.position.y = 0.42; f.rotation.y = i * Math.PI / 2;
      g.add(f); flames.push(f);
    }
    this.game.scene.add(g);
    this.map.set(key, { x, y, z, g, flames, ember: Math.random() });
  }
  remove(x, y, z) {
    const key = this.game.world.idx(x, y, z);
    const f = this.map.get(key);
    if (!f) return;
    this.game.scene.remove(f.g);
    f.g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.map.delete(key);
  }

  // nearest lit fire within range (for crafting / cooking)
  near(pos, range = 3.2) {
    let best = null, bd = range;
    for (const f of this.map.values()) {
      const d = Math.hypot(f.x + 0.5 - pos.x, f.z + 0.5 - pos.z);
      if (d < bd && Math.abs(f.y - pos.y) < 2.5) { bd = d; best = f; }
    }
    return best;
  }

  update(dt) {
    this.t += dt;
    const cam = this.game.camera.position;
    this.assignT -= dt;
    if (this.assignT <= 0) {
      this.assignT = 0.4;
      const fires = [...this.map.values()].map((f) => ({ f, d: Math.hypot(f.x - cam.x, f.z - cam.z) }))
        .filter((o) => o.d < 70).sort((a, b) => a.d - b.d);
      this.lights.forEach((l, i) => { l.userData.fire = fires[i] ? fires[i].f : null; });
    }
    for (const l of this.lights) {
      const f = l.userData.fire;
      if (!f || !this.map.has(this.game.world.idx(f.x, f.y, f.z))) { l.intensity = 0; continue; }
      l.position.set(f.x + 0.5, f.y + 0.8, f.z + 0.5);
      l.intensity = 9 + Math.sin(this.t * 13 + f.ember * 9) * 1.5 + Math.sin(this.t * 7.3) * 1.2;
    }
    let nearest = Infinity;
    for (const f of this.map.values()) {
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      nearest = Math.min(nearest, d);
      if (d > 80) continue;
      f.flames.forEach((m, i) => {
        m.scale.y = 1 + Math.sin(this.t * 9 + i * 2 + f.ember * 5) * 0.12;
        m.scale.x = 1 + Math.sin(this.t * 7 + i) * 0.08;
        m.lookAt(cam.x, m.getWorldPosition(new THREE.Vector3()).y, cam.z);
        if (i === 1) m.rotateY(Math.PI / 2);
      });
      if (d < 40 && Math.random() < dt * 4) this.game.particles.burst(f.x + 0.5, f.y + 0.6, f.z + 0.5, [1, 0.55, 0.15], 1, 0.6, 1.0, -2);
      if (d < 40 && Math.random() < dt * 2) this.game.particles.burst(f.x + 0.5, f.y + 1.0, f.z + 0.5, [0.32, 0.31, 0.3], 1, 0.3, 2.2, -1.2);
    }
    this.crackleT -= dt;
    if (nearest < 10 && this.crackleT <= 0) { this.crackleT = 0.15 + Math.random() * 0.5; sfx.crackle(1 - nearest / 10); }
  }

  dispose() {
    for (const f of [...this.map.values()]) this.remove(f.x, f.y, f.z);
    this.lights.forEach((l) => this.game.scene.remove(l));
  }
}
