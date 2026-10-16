// The item held in the player's hands, drawn in its own pass on top of the world.
import * as THREE from 'three';
import { ITEMS, iconCanvas } from './items.js';
import { buildAtlas } from './textures.js';
import { gunModel } from './gunmodels.js';

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
  // the solid wood / blued steel / brass models shared with the soldiers
  realRifle(id) { const g = gunModel(id); g.scale.setScalar(0.52); g.position.set(0.02, 0.03, 0.08); return g; },
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
  grenade() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), M.olive); b.scale.y = 1.25; g.add(b);
    g.add(bx(0.03, 0.035, 0.03, M.steel, 0, 0.075, 0)); g.add(bx(0.012, 0.012, 0.07, M.steel, 0.02, 0.07, 0.03));
    return g;
  },
  smoke() { const g = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 10), M.kit); g.add(c); g.add(bx(0.081, 0.03, 0.081, M.cross, 0, 0.02, 0)); return g; },
  // a fishing rod: cork grip, a reel, a long thin pole raised ahead
  rod() {
    const g = new THREE.Group();
    g.add(bx(0.03, 0.03, 0.18, M.rope, 0, 0, 0.08));
    const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.steel); reel.rotation.z = Math.PI / 2; reel.position.set(0.03, -0.03, 0.04); g.add(reel);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 1.1, 6), M.darkwood); pole.rotation.x = Math.PI / 2; pole.position.set(0, 0, -0.55); g.add(pole);
    g.rotation.set(0.55, 0.1, 0.1);
    return g;
  },
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
    // moving parts and poses set each frame by the weapons (weapons.js)
    this.anim = { reload: 0, round: 0, cock: 0, lever: 0, cyl: 0 }; this.holsterT = 0; this.knife = { charge: 0, swing: 0 };
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.flash = fl; fl.visible = false;
    this.flashT = 0;
    this.blockMats = {};
  }
  // the player's own sleeve and hand, in the uniform of the chosen side
  setUniform(color) {
    if (this.sleeve) this.holder.remove(this.sleeve);
    if (color == null) { this.sleeve = null; return; }
    const g = new THREE.Group();
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.32, 10), new THREE.MeshLambertMaterial({ color }));
    cuff.rotation.x = Math.PI / 2 - 0.15; cuff.position.set(0.02, -0.06, 0.2); g.add(cuff);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.08), new THREE.MeshLambertMaterial({ color: 0xc89a78 }));
    hand.position.set(0.02, -0.04, 0.03); g.add(hand);
    this.sleeve = g; this.holder.add(g);
  }

  model(id) {
    if (this.cache[id]) return this.cache[id];
    let g;
    const def = ITEMS[id] || {};
    if (id === 'rifle' || id === 'sniper' || id === 'shotgun' || id === 'lever') g = BUILD.realRifle(id);
    else if (id === 'revolver') { g = gunModel('revolver'); g.scale.setScalar(1.15); g.position.set(0.0, 0.0, 0.0); }
    else if (id === 'smg') { g = gunModel('smg'); g.scale.setScalar(0.6); }
    else if (id === 'pistol') { g = gunModel('pistol'); g.position.z = 0.02; }
    else if (id === 'spistol') {
      // pistol with a suppressor screwed onto the muzzle
      g = new THREE.Group(); const p = gunModel('pistol'); g.add(p); g.position.z = 0.02;
      const sup = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), M.steel);
      sup.rotation.x = Math.PI / 2; sup.position.set(0, 0.035, -0.24); g.add(sup);
    }
    else if (id === 'knife') { g = new THREE.Group(); const k = gunModel('knife'); k.rotation.set(0.95, -0.25, 0.25); k.position.set(-0.07, 0.07, 0.0); k.scale.setScalar(1.1); g.add(k); }   // held up, blade forward, so you can see it
    else if (BUILD[id]) g = BUILD[id]();
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
    this.holster = Math.max(0, (this.holsterT || 0)); this.holsterT = Math.max(0, this.holsterT - dt);
    const H = this.holster / 0.45, A = this.anim, K = this.knife, id = this.id;
    let px = baseX + Math.cos(this.bobT) * amp, py = baseY + Math.abs(Math.sin(this.bobT)) * amp - this.swapT * 0.6, pz = -0.42 + this.recoil * 0.05;
    let rx = -sw * 0.9 + this.recoil * 0.12, ry = sw * 0.3, rz = 0;
    // drawn from the hip holster: up from low and to the right, muzzle swinging up
    if (H > 0) { py -= H * 0.32; px += H * 0.08; rx -= H * 1.3; rz -= H * 0.4; }
    // the reload pose: the revolver tipped up and over to the gate; the rifle
    // rolled to show its loading gate; the shotgun broken open
    if (A.reload > 0.01) {
      if (id === 'revolver') { rx += A.reload * 0.75; rz += A.reload * 0.7; px -= A.reload * 0.06; py += A.reload * 0.04 - A.round * 0.015; }
      else if (id === 'lever') { rz -= A.reload * 0.55; rx += A.reload * 0.2; py += A.reload * 0.03 - A.round * 0.02; }
      else if (id === 'shotgun') { rx += A.reload * 0.25; py += A.reload * 0.03 - A.round * 0.02; }
    }
    // the knife: wound back over the shoulder while charging, then the throw and the follow-through
    if (id === 'knife') {
      const c = K.charge, s2 = K.swing ? Math.sin(K.swing * Math.PI) : 0, f = K.swing;
      px += c * 0.06; py += c * 0.14; pz += c * 0.16 - s2 * 0.22; rx -= c * 1.25 - f * 1.6 * (1 - f) * 2; rz += c * 0.35;
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz);
    // the guns' moving parts
    const ud = this.current && this.current.userData;
    if (ud) {
      if (ud.hammer) ud.hammer.rotation.x = -0.85 * A.cock;
      if (ud.cylinder) ud.cylinder.rotation.z = A.cyl;
      if (ud.gate) ud.gate.rotation.y = 1.3 * A.reload;
      if (ud.lever) ud.lever.rotation.x = 0.85 * A.lever;
      if (ud.barrels) ud.barrels.rotation.x = 0.6 * (id === 'shotgun' ? A.reload : 0);
    }
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
