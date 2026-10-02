// The item held in the player's hands, drawn in its own pass on top of the world.
import * as THREE from 'three';
import { ITEMS, iconCanvas } from './items.js';
import { buildAtlas } from './textures.js';

const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
const M = {
  wood: lam(0x6a4a2e), darkwood: lam(0x4a3422), steel: lam(0x2e302c), olive: lam(0x5a6248),
  blade: lam(0xb4b8b0), grip: lam(0x3a2c20), rope: lam(0x9a8a68), meat: lam(0x7c2a24),
  cooked: lam(0x6a4424), bone: lam(0xe0d6c0), kit: lam(0x5a5e44), cross: lam(0xd8d0b4), rock: lam(0x4a4a50),
  glass: lam(0x6a8a9a),
};
function bx(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m;
}
function cyl(r, l, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m;
}

// Each model points along -Z; muzzle position is stored for the flash.
const BUILD = {
  shovel() {
    const g = new THREE.Group();
    g.add(bx(0.035, 0.035, 0.5, M.wood, 0, 0, 0.05));
    g.add(bx(0.12, 0.02, 0.16, M.olive, 0, 0, -0.27));
    g.rotation.set(0.5, 0.15, 0.3);
    return g;
  },
  knife() {
    const g = new THREE.Group();
    g.add(bx(0.035, 0.04, 0.12, M.grip, 0, 0, 0.06));
    g.add(bx(0.07, 0.015, 0.02, M.steel, 0, 0, -0.005));
    g.add(bx(0.012, 0.035, 0.2, M.blade, 0, 0.005, -0.115));
    g.rotation.set(0.25, 0, 0.15);
    return g;
  },
  pistol() {
    const g = new THREE.Group();
    g.add(bx(0.045, 0.055, 0.22, M.steel, 0, 0.03, -0.06));
    g.add(bx(0.04, 0.12, 0.06, M.darkwood, 0, -0.05, 0.03));
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.18);
    return g;
  },
  rifle(bayonet = true, scope = false) {
    const g = new THREE.Group();
    g.add(bx(0.05, 0.07, 0.42, M.wood, 0, -0.01, 0.05));
    g.add(bx(0.06, 0.1, 0.18, M.wood, 0, -0.04, 0.32));
    g.add(cyl(0.014, 0.5, M.steel, 0, 0.03, -0.32));
    g.add(bx(0.03, 0.04, 0.12, M.steel, 0, 0.05, 0.0));
    if (bayonet) g.add(bx(0.01, 0.025, 0.2, M.blade, 0, 0.015, -0.64));
    if (scope) { g.add(cyl(0.022, 0.2, M.steel, 0, 0.09, 0)); g.add(cyl(0.024, 0.01, M.glass, 0, 0.09, -0.1)); }
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.58);
    g.scale.setScalar(0.72); g.position.set(0.02, 0.04, 0.05);
    return g;
  },
  sniper() { return BUILD.rifle(false, true); },
  smg() {
    const g = new THREE.Group();
    g.add(bx(0.06, 0.07, 0.34, M.steel, 0, 0.02, -0.05));
    g.add(cyl(0.012, 0.14, M.steel, 0, 0.03, -0.28));
    g.add(bx(0.03, 0.14, 0.04, M.steel, 0, -0.08, -0.08));
    g.add(bx(0.04, 0.1, 0.05, M.darkwood, 0, -0.05, 0.07));
    g.add(bx(0.03, 0.03, 0.16, M.steel, 0, 0.0, 0.2));
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.36);
    g.scale.setScalar(0.8);
    return g;
  },
  flint() {
    const g = new THREE.Group();
    const r = bx(0.07, 0.05, 0.08, M.rock, -0.04, 0, 0); r.rotation.set(0.3, 0.5, 0.2); g.add(r);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI * 1.5), M.steel);
    ring.position.set(0.06, 0, -0.02); g.add(ring);
    g.scale.setScalar(0.6);
    return g;
  },
  meat_raw() { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.meat); s.scale.set(1.3, 0.7, 1); g.add(s); g.add(bx(0.02, 0.02, 0.1, M.bone, 0.08, 0, -0.04)); return g; },
  meat_cooked() { const g = BUILD.meat_raw(); g.children[0].material = M.cooked; return g; },
  medkit() { const g = new THREE.Group(); g.add(bx(0.16, 0.1, 0.12, M.kit)); g.add(bx(0.06, 0.101, 0.02, M.cross, 0, 0, -0.061)); g.add(bx(0.02, 0.101, 0.06, M.cross, 0, 0, -0.061)); return g; },
};

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 10);
    this.hemi = new THREE.HemisphereLight(0xd8dce0, 0x504030, 1);
    this.dir = new THREE.DirectionalLight(0xffffff, 0.6); this.dir.position.set(1, 2, 1);
    this.scene.add(this.hemi, this.dir);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.cache = {};
    this.current = null; this.id = undefined;
    this.swing = 0; this.recoil = 0; this.bobT = 0; this.swapT = 0;
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash = fl; fl.visible = false;
    this.flashT = 0;
    this.blockMats = {};
  }

  model(id) {
    if (this.cache[id]) return this.cache[id];
    let g;
    const def = ITEMS[id] || {};
    if (BUILD[id]) g = BUILD[id]();
    else if (def.tiles) {
      const a = buildAtlas();
      const mk = (n) => { const t = new THREE.CanvasTexture(a.tileCanvas(n)); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshLambertMaterial({ map: t }); };
      const top = mk(def.tiles[0]), side = mk(def.tiles[1]);
      g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), [side, side, top, top, side, side]);
      c.rotation.set(0.2, 0.6, 0); g.add(c);
    } else {
      const t = new THREE.CanvasTexture(iconCanvas(id)); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
      g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      p.rotation.y = -0.4; g.add(p);
    }
    this.cache[id] = g;
    return g;
  }

  set(id) {
    if (id === this.id) return;
    this.id = id;
    if (this.current) this.holder.remove(this.current);
    this.current = id ? this.model(id) : null;
    if (this.current) {
      this.holder.add(this.current);
      if (this.current.userData.muzzle) { this.current.add(this.flash); this.flash.position.copy(this.current.userData.muzzle); }
    }
    this.swapT = 0.25;
  }

  doSwing() { this.swing = 1; }
  doRecoil(k = 1) { this.recoil = Math.min(1.5, this.recoil + k); this.flashT = 0.05; }

  update(dt, { moving, sprint, light, aim }) {
    this.bobT += dt * (moving ? (sprint ? 13 : 9) : 1.5);
    const amp = moving ? (sprint ? 0.022 : 0.012) : 0.003;
    this.swing = Math.max(0, this.swing - dt * 4);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.swapT = Math.max(0, this.swapT - dt);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    if (this.flash.visible) this.flash.rotation.z = Math.random() * 3;
    const sw = Math.sin(this.swing * Math.PI);
    const baseX = aim ? 0.0 : 0.26, baseY = aim ? -0.12 : -0.24;
    this.holder.position.set(baseX + Math.cos(this.bobT) * amp, baseY + Math.abs(Math.sin(this.bobT)) * amp - this.swapT * 0.6, -0.42 + this.recoil * 0.05);
    this.holder.rotation.set(-sw * 0.9 + this.recoil * 0.12, sw * 0.3, 0);
    this.hemi.intensity = 0.25 + light * 0.9;
    this.dir.intensity = 0.15 + light * 0.5;
  }

  render(renderer) {
    if (!this.current) return;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }
}
