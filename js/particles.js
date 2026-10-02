// Small pooled particle system (debris, splashes; later smoke, sparks, blood).
import * as THREE from 'three';

export class Particles {
  constructor(scene, max = 1500) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    // soft round dots rather than squares
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d');
    const grad = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.9)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grad; x.fillRect(0, 0, 32, 32);
    this.points = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.09, vertexColors: true, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, alphaTest: 0.05,
    }));
    this.points.frustumCulled = false;
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1e4;
    scene.add(this.points);
    this.density = 1;
  }
  burst(x, y, z, color, n = 12, speed = 3, life = 0.8, gravity = 18) {
    n = Math.max(1, Math.round(n * this.density));
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.max;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.6;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.6;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.6;
      this.vel[i * 3] = (Math.random() - 0.5) * speed;
      this.vel[i * 3 + 1] = Math.random() * speed;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      const s = 0.75 + Math.random() * 0.4;
      this.col[i * 3] = color[0] * s; this.col[i * 3 + 1] = color[1] * s; this.col[i * 3 + 2] = color[2] * s;
      this.life[i] = life * (0.6 + Math.random() * 0.6);
      this.grav[i] = gravity;
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1e4; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    if (any) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
  }
  dispose(scene) { scene.remove(this.points); this.points.geometry.dispose(); }
}
