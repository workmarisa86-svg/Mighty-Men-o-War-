// Day/night cycle, lighting, sun/moon/stars and rain (no fog, by design).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const C = (h) => new THREE.Color(h);
const SKY_DAY = C('#8c949a'), SKY_RAIN = C('#5d6367'), SKY_DUSK = C('#8a6f5e'), SKY_NIGHT = C('#0a0d13');

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.color = new THREE.Color();
    this.hemi = new THREE.HemisphereLight(0xb8bcc0, 0x3a2e24, 0.6);
    this.sun = new THREE.DirectionalLight(0xfff0dc, 1.0);
    this.ambient = new THREE.AmbientLight(0x8890a0, 0.1);
    scene.add(this.hemi, this.sun, this.sun.target, this.ambient);

    const disc = (color, size) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(size, 24), new THREE.MeshBasicMaterial({ color, fog: false, depthWrite: false, transparent: true }));
      m.renderOrder = -1; scene.add(m); return m;
    };
    this.sunMesh = disc(0xe8dcc0, 18);
    this.moonMesh = disc(0xc8ccd4, 12);

    const r = mulberry32(5);
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
      sp.push(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp.map((v) => v * 400), 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xd0d4dc, size: 1.4, sizeAttenuation: false, transparent: true, depthWrite: false }));
    scene.add(this.stars);

    this.rainCount = quality.rain;
    const rp = new Float32Array(this.rainCount * 6);
    this.rainSeeds = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainSeeds[i * 3] = (Math.random() - 0.5) * 50;
      this.rainSeeds[i * 3 + 1] = Math.random() * 30;
      this.rainSeeds[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xa4aeb6, transparent: true, opacity: 0.4, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.rainY = 0;
    this.daylight = 1;
  }

  // tod: 0..1 (0.5 = noon). rain: 0..1. alwaysDay: the always-daytime setting.
  update(dt, tod, rain, camPos, alwaysDay) {
    if (alwaysDay) tod = 0.45;
    const ang = (tod - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const day = THREE.MathUtils.smoothstep(elev, -0.12, 0.25);
    this.daylight = day;
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.3) * (1 - rain * 0.7);

    this.color.copy(SKY_NIGHT).lerp(SKY_DAY, day);
    this.color.lerp(SKY_DUSK, dusk * 0.45);
    this.color.lerp(SKY_RAIN.clone().multiplyScalar(0.25 + day * 0.75), rain * 0.7);
    this.scene.background = this.color;

    const sunDir = new THREE.Vector3(Math.cos(ang) * 0.8, elev, 0.35).normalize();
    this.sun.position.copy(camPos).addScaledVector(sunDir, 100);
    this.sun.target.position.copy(camPos);
    const moonLight = 0.12 * (1 - day);
    this.sun.intensity = day * (1.1 - rain * 0.55) + moonLight;
    this.sun.color.setHex(day > 0.2 ? 0xfff0dc : 0x8c9cc0);
    if (elev < 0) this.sun.position.copy(camPos).addScaledVector(sunDir.clone().negate(), 100);
    this.hemi.intensity = 0.12 + day * (0.95 - rain * 0.3);
    this.ambient.intensity = 0.06 + day * 0.15;

    this.sunMesh.position.copy(camPos).addScaledVector(sunDir, 380);
    this.sunMesh.lookAt(camPos);
    this.sunMesh.material.opacity = Math.max(0, Math.min(1, elev * 5 + 0.5)) * (1 - rain * 0.85);
    this.sunMesh.visible = this.sunMesh.material.opacity > 0.01;
    this.moonMesh.position.copy(camPos).addScaledVector(sunDir, -380);
    this.moonMesh.lookAt(camPos);
    this.moonMesh.material.opacity = Math.max(0, Math.min(1, -elev * 5 + 0.3)) * (1 - rain * 0.8);
    this.moonMesh.visible = this.moonMesh.material.opacity > 0.01;
    this.stars.position.copy(camPos);
    this.stars.material.opacity = (1 - day) * (1 - rain);
    this.stars.visible = this.stars.material.opacity > 0.02;

    // rain streaks follow the camera
    this.rain.visible = rain > 0.02;
    if (this.rain.visible) {
      // snow (Town Life winter): short white flakes drifting down slowly
      const snow = !!this.snow;
      this.rainY += dt * (snow ? 2.6 : 22);
      const pos = this.rain.geometry.attributes.position.array;
      const n = Math.floor(this.rainCount * rain);
      for (let i = 0; i < this.rainCount; i++) {
        const o = i * 6;
        if (i >= n) { pos[o + 1] = pos[o + 4] = -1e4; continue; }
        const sx = this.rainSeeds[i * 3], sz = this.rainSeeds[i * 3 + 2];
        const y = 15 - ((this.rainSeeds[i * 3 + 1] + this.rainY) % 30);
        const x = camPos.x + sx, z = camPos.z + sz, yy = camPos.y + y;
        if (snow) {
          const drift = Math.sin(this.rainY * 0.7 + i) * 0.6;
          pos[o] = x + drift; pos[o + 1] = yy; pos[o + 2] = z + drift * 0.5;
          pos[o + 3] = x + drift + 0.05; pos[o + 4] = yy - 0.09; pos[o + 5] = z + drift * 0.5 + 0.04;
        } else {
          pos[o] = x; pos[o + 1] = yy; pos[o + 2] = z;
          pos[o + 3] = x + 0.08; pos[o + 4] = yy - 0.7; pos[o + 5] = z + 0.05;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
      this.rain.material.color.setScalar(snow ? 0.75 + day * 0.25 : 0.35 + day * 0.35);
      this.rain.material.opacity = snow ? 0.85 : 0.4;
    }
  }
}
