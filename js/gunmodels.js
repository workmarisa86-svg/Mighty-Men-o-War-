// Solid 3D weapon models shared by soldiers and the player's hands. Materials
// are procedural: oiled walnut wood with grain, blued steel with a sheen and
// worn edges, and brass fittings. Every model points along -Z with the grip
// at the origin; lengths are in blocks.
import * as THREE from 'three';

function canvasTex(w, h, paint, repeat = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(x, w, h, n, colors, size = 1) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = colors[i % colors.length];
    x.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

let MAT = null;
export function gunMats() {
  if (MAT) return MAT;
  const wood = canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = '#6a4428'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {           // long grain lines
      x.strokeStyle = `rgba(${40 + Math.random() * 30},${22 + Math.random() * 14},10,${0.25 + Math.random() * 0.3})`;
      x.lineWidth = 0.6 + Math.random() * 1.4;
      const x0 = Math.random() * w;
      x.beginPath(); x.moveTo(x0, 0);
      for (let y = 0; y <= h; y += 8) x.lineTo(x0 + Math.sin(y * 0.05 + i) * 3, y);
      x.stroke();
    }
    speckle(x, w, h, 200, ['rgba(255,220,170,0.08)', 'rgba(0,0,0,0.12)']);
  });
  const steel = canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#24282e'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 500, ['rgba(120,140,160,0.10)', 'rgba(0,0,0,0.25)', 'rgba(150,150,140,0.06)']);
    for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(160,165,170,0.12)'; x.fillRect(Math.random() * w, Math.random() * h, 6 + Math.random() * 10, 1); } // worn edges
  });
  const brass = canvasTex(32, 32, (x, w, h) => {
    x.fillStyle = '#a8843c'; x.fillRect(0, 0, w, h);
    speckle(x, w, h, 120, ['rgba(255,240,180,0.15)', 'rgba(60,40,10,0.2)']);
  });
  const ph = (map, specular, shininess, color = 0xffffff) => new THREE.MeshPhongMaterial({ map, color, specular, shininess });
  MAT = {
    wood: ph(wood, 0x2a2018, 18),
    darkwood: ph(wood, 0x201810, 14, 0x9a8a80),
    steel: ph(steel, 0x7a8a9a, 70),
    black: ph(steel, 0x3a4048, 40, 0x8a8a8a),
    brass: ph(brass, 0xffe0a0, 90),
    blade: ph(steel, 0xd0d8e0, 110, 0xe8eaea),
    glass: new THREE.MeshPhongMaterial({ color: 0x3a5a6a, specular: 0xffffff, shininess: 140 }),
    olive: ph(steel, 0x404830, 20, 0x8a9a68),
    leather: ph(wood, 0x181008, 8, 0x704a30),
  };
  return MAT;
}

const GEO = {};
const box = (w, h, d) => GEO['b' + w + h + d] || (GEO['b' + w + h + d] = new THREE.BoxGeometry(w, h, d));
const cyl = (r1, r2, l, s = 10) => GEO['c' + r1 + r2 + l + s] || (GEO['c' + r1 + r2 + l + s] = new THREE.CylinderGeometry(r1, r2, l, s));
function B(g, w, h, d, m, x, y, z, rx = 0) { const o = new THREE.Mesh(box(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; }
// cylinder lying along Z
function C(g, r, l, m, x, y, z, r2 = r, s = 10) { const o = new THREE.Mesh(cyl(r, r2, l, s), m); o.rotation.x = Math.PI / 2; o.position.set(x, y, z); g.add(o); return o; }

// Bolt-action rifle (optionally with a sniper scope and no bayonet).
function rifle(scope) {
  const M = gunMats(), g = new THREE.Group();
  // stock: butt, wrist and fore-end
  B(g, 0.05, 0.12, 0.26, M.wood, 0, -0.06, 0.2, -0.12);
  B(g, 0.042, 0.06, 0.14, M.wood, 0, -0.015, 0.02);
  B(g, 0.046, 0.055, 0.5, M.wood, 0, -0.005, -0.3);
  B(g, 0.052, 0.012, 0.03, M.brass, 0, -0.12, 0.33);                 // butt plate
  // receiver, barrel, bands, bolt
  C(g, 0.022, 0.2, M.steel, 0, 0.03, -0.06);
  C(g, 0.012, 0.62, M.steel, 0, 0.032, -0.48, 0.014);
  for (const z of [-0.26, -0.5]) C(g, 0.026, 0.02, M.brass, 0, 0.015, z);
  const bolt = C(g, 0.007, 0.07, M.steel, 0.04, 0.035, 0.0); bolt.rotation.set(0, 0, Math.PI / 2);
  const knob = new THREE.Mesh(GEO.sph || (GEO.sph = new THREE.SphereGeometry(0.012, 8, 6)), M.steel); knob.position.set(0.075, 0.03, 0.0); g.add(knob);
  B(g, 0.012, 0.03, 0.05, M.steel, 0, -0.045, -0.03);                  // trigger guard
  B(g, 0.006, 0.02, 0.006, M.steel, 0, 0.055, -0.77);                  // front sight
  if (scope) {
    C(g, 0.02, 0.26, M.black, 0, 0.09, -0.06);
    C(g, 0.028, 0.06, M.black, 0, 0.09, -0.2, 0.02);
    C(g, 0.024, 0.04, M.black, 0, 0.09, 0.08, 0.02);
    C(g, 0.025, 0.004, M.glass, 0, 0.09, -0.232);
    for (const z of [-0.1, 0.0]) B(g, 0.016, 0.04, 0.016, M.steel, 0, 0.06, z);
  } else {
    B(g, 0.006, 0.02, 0.22, M.blade, 0, 0.0, -0.87);                   // bayonet
  }
  g.userData.muzzle = new THREE.Vector3(0, 0.032, -0.8);
  g.userData.length = 1.15;
  return g;
}
function smg() {
  const M = gunMats(), g = new THREE.Group();
  C(g, 0.03, 0.32, M.steel, 0, 0.02, -0.12);                           // receiver tube
  C(g, 0.034, 0.18, M.black, 0, 0.02, -0.34);                          // perforated jacket
  C(g, 0.01, 0.06, M.steel, 0, 0.02, -0.45);
  B(g, 0.03, 0.17, 0.045, M.steel, 0, -0.1, -0.16);                    // magazine
  B(g, 0.04, 0.1, 0.05, M.darkwood, 0, -0.06, 0.03, 0.25);             // grip
  B(g, 0.035, 0.07, 0.24, M.wood, 0, -0.02, 0.16);                     // stock
  B(g, 0.012, 0.025, 0.04, M.brass, 0.03, 0.03, -0.06);                // cocking handle
  g.userData.muzzle = new THREE.Vector3(0, 0.02, -0.48);
  g.userData.length = 0.72;
  return g;
}
function pistol() {
  const M = gunMats(), g = new THREE.Group();
  B(g, 0.032, 0.045, 0.2, M.steel, 0, 0.03, -0.07);
  C(g, 0.009, 0.05, M.steel, 0, 0.03, -0.19);
  B(g, 0.03, 0.11, 0.05, M.darkwood, 0, -0.035, 0.02, 0.22);
  B(g, 0.01, 0.025, 0.04, M.steel, 0, -0.01, -0.03);
  B(g, 0.031, 0.012, 0.02, M.brass, 0, -0.09, 0.04);
  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.22);
  g.userData.length = 0.26;
  return g;
}
function knife() {
  const M = gunMats(), g = new THREE.Group();
  B(g, 0.03, 0.035, 0.11, M.leather, 0, 0, 0.055);
  B(g, 0.06, 0.012, 0.016, M.brass, 0, 0, -0.005);
  B(g, 0.008, 0.03, 0.19, M.blade, 0, 0.004, -0.105);
  g.userData.length = 0.3;
  return g;
}

// Double-barrel shotgun (Town Life): side-by-side barrels, walnut stock.
function shotgun() {
  const M = gunMats(), g = new THREE.Group();
  B(g, 0.05, 0.11, 0.24, M.wood, 0, -0.06, 0.2, -0.14);
  B(g, 0.04, 0.055, 0.12, M.wood, 0, -0.015, 0.03);
  B(g, 0.05, 0.04, 0.22, M.wood, 0, -0.012, -0.2);
  C(g, 0.026, 0.12, M.steel, 0, 0.025, -0.04);
  for (const x of [-0.013, 0.013]) C(g, 0.013, 0.6, M.steel, x, 0.035, -0.38, 0.013);
  B(g, 0.012, 0.03, 0.05, M.steel, 0, -0.045, -0.02);
  g.userData.muzzle = new THREE.Vector3(0, 0.035, -0.68);
  g.userData.length = 1.0;
  return g;
}

const BUILDERS = { rifle: () => rifle(false), sniper: () => rifle(true), smg, pistol, knife, shotgun };
export function hasGunModel(id) { return !!BUILDERS[id]; }
// a fresh group (geometry and materials are shared, so this is cheap)
export function gunModel(id) { return BUILDERS[id] ? BUILDERS[id]() : null; }
