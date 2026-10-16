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
// A Bowie-style hunting knife: a clip-point steel blade (shaped, with a bright
// ground edge along its belly and a fuller), a brass guard, a two-piece walnut
// handle with brass rivets and a brass pommel. Points along -z, edge down.
let KNIFE_GEO = null;
function knifeGeo() {
  if (KNIFE_GEO) return KNIFE_GEO;
  const L = 0.2;
  // the blade's side profile (x along the blade from the guard, y up): straight
  // spine, a clip sweeping down to the point, a curved belly back to the edge
  const sh = new THREE.Shape();
  sh.moveTo(0, 0.016); sh.lineTo(L * 0.62, 0.016);
  sh.quadraticCurveTo(L * 0.8, 0.015, L, -0.002);                   // the clip down to the point
  sh.quadraticCurveTo(L * 0.82, -0.02, L * 0.55, -0.019);           // the belly
  sh.lineTo(0.012, -0.017); sh.lineTo(0, -0.012); sh.lineTo(0, 0.016);
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.0035, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 1, curveSegments: 8 });
  blade.translate(0, 0, -0.00175);
  // the bright ground edge: a thin strip just above the belly
  const eg = new THREE.Shape();
  eg.moveTo(0.012, -0.017); eg.lineTo(L * 0.55, -0.019); eg.quadraticCurveTo(L * 0.82, -0.02, L, -0.002);
  eg.quadraticCurveTo(L * 0.8, -0.011, L * 0.55, -0.011); eg.lineTo(0.012, -0.01);
  const edge = new THREE.ExtrudeGeometry(eg, { depth: 0.0062, bevelEnabled: false, curveSegments: 8 });
  edge.translate(0, 0, -0.0031);
  KNIFE_GEO = { blade, edge };
  return KNIFE_GEO;
}
function knife() {
  const M = gunMats(), g = new THREE.Group(), G = knifeGeo();
  if (!M.edge) { M.edge = new THREE.MeshPhongMaterial({ color: 0xf4f6f8, specular: 0xffffff, shininess: 160 }); M.kblade = new THREE.MeshPhongMaterial({ color: 0xa8aeb4, specular: 0xe0e8f0, shininess: 120 }); }
  // blade: the shape lies in x/y; turn it so it runs along -z with the edge down
  for (const [geo, m] of [[G.blade, M.kblade], [G.edge, M.edge]]) {
    const o = new THREE.Mesh(geo, m); o.rotation.y = Math.PI / 2; o.position.set(0, 0.002, -0.012); g.add(o);
  }
  B(g, 0.0042, 0.006, 0.09, M.steel, 0, 0.007, -0.06);              // the fuller (a dark groove)
  // brass guard with rounded quillons, a ferrule, the walnut handle, rivets, pommel
  B(g, 0.016, 0.07, 0.012, M.brass, 0, -0.002, -0.006);
  for (const y of [-0.036, 0.032]) { const q = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), M.brass); q.position.set(0, y, -0.006); g.add(q); }
  C(g, 0.016, 0.012, M.brass, 0, -0.002, 0.004, 0.017, 12);
  B(g, 0.026, 0.034, 0.105, M.wood, 0, -0.004, 0.062);
  B(g, 0.022, 0.03, 0.11, M.darkwood, 0, -0.006, 0.064);
  for (const z of [0.03, 0.09]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.028, 8), M.brass); r.rotation.z = Math.PI / 2; r.position.set(0, -0.004, z); g.add(r); }
  const pm = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 8), M.brass); pm.scale.set(0.8, 1, 0.7); pm.position.set(0, -0.006, 0.118); g.add(pm);
  g.userData.length = 0.33;
  return g;
}

// Double-barrel shotgun (Town Life): side-by-side barrels, walnut stock.
// Double-barrel shotgun (Town Life): side-by-side barrels on a hinge (they
// drop open to load two shells), two outside hammers, a walnut stock.
function shotgun() {
  const M = gunMats(), g = new THREE.Group();
  B(g, 0.05, 0.11, 0.24, M.wood, 0, -0.06, 0.2, -0.14);
  B(g, 0.04, 0.055, 0.12, M.wood, 0, -0.015, 0.03);
  C(g, 0.026, 0.1, M.steel, 0, 0.025, -0.03);                          // the action
  for (const x of [-0.016, 0.016]) { const h = B(g, 0.008, 0.035, 0.012, M.steel, x, 0.06, 0.0, -0.4); g.userData['hammer' + (x < 0 ? 'L' : 'R')] = h; }
  B(g, 0.012, 0.03, 0.05, M.steel, 0, -0.045, -0.02);                  // trigger guard
  const br = new THREE.Group(); br.position.set(0, 0.02, -0.07); g.add(br);   // hinge pin
  for (const x of [-0.013, 0.013]) C(br, 0.013, 0.6, M.steel, x, 0.015, -0.3, 0.013);
  B(br, 0.05, 0.035, 0.22, M.wood, 0, -0.03, -0.13);                     // fore-end
  B(br, 0.004, 0.008, 0.56, M.steel, 0, 0.032, -0.3);                    // the rib between the barrels
  g.userData.barrels = br;
  g.userData.muzzle = new THREE.Vector3(0, 0.035, -0.68);
  g.userData.length = 1.0;
  return g;
}

// Single-action revolver of the 1870s: long round barrel with an ejector rod
// beside it, a fluted six-shot cylinder, the loading gate on the right, a
// hammer you cock with the thumb, a plow-handle walnut grip.
function revolver() {
  const M = gunMats(), g = new THREE.Group();
  C(g, 0.0095, 0.16, M.steel, 0, 0.034, -0.13);                          // barrel
  C(g, 0.004, 0.13, M.steel, 0.011, 0.021, -0.115);                      // ejector rod
  B(g, 0.008, 0.012, 0.03, M.steel, 0.011, 0.02, -0.06);                 // ejector housing
  B(g, 0.004, 0.008, 0.006, M.steel, 0, 0.046, -0.205);                  // front sight
  B(g, 0.03, 0.04, 0.07, M.steel, 0, 0.032, 0.0);                        // frame
  const cyl = new THREE.Group(); cyl.position.set(0, 0.034, -0.025); g.add(cyl);
  C(cyl, 0.021, 0.045, M.steel, 0, 0, 0, 0.021, 12);
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; const f = B(cyl, 0.005, 0.006, 0.04, M.black, Math.cos(a) * 0.019, Math.sin(a) * 0.019, 0); f.rotation.z = a; }
  g.userData.cylinder = cyl;
  const gate = new THREE.Group(); gate.position.set(0.016, 0.03, 0.006); g.add(gate);
  B(gate, 0.004, 0.016, 0.012, M.steel, 0.002, 0, 0); g.userData.gate = gate;
  const ham = new THREE.Group(); ham.position.set(0, 0.044, 0.03); g.add(ham);
  B(ham, 0.008, 0.03, 0.012, M.steel, 0, 0.012, 0.004); B(ham, 0.012, 0.008, 0.014, M.steel, 0, 0.026, 0.012);
  g.userData.hammer = ham;
  B(g, 0.007, 0.022, 0.008, M.steel, 0, 0.004, 0.004);                   // trigger
  const tg = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 4, 10, Math.PI), M.brass); tg.rotation.set(0, Math.PI / 2, Math.PI); tg.position.set(0, 0.012, 0.004); g.add(tg);   // brass trigger guard
  B(g, 0.03, 0.085, 0.034, M.wood, 0, -0.02, 0.045, 0.32);               // the grip, swept back
  B(g, 0.033, 0.014, 0.038, M.wood, 0, -0.062, 0.062, 0.32);             // its rounded butt
  B(g, 0.032, 0.012, 0.02, M.steel, 0, 0.022, 0.036);                    // backstrap
  g.userData.muzzle = new THREE.Vector3(0, 0.034, -0.215);
  g.userData.length = 0.3;
  return g;
}

// Lever-action rifle of the 1870s: octagonal barrel over a tube magazine,
// a brass receiver, a loop lever under the wrist (worked after every shot).
function lever() {
  const M = gunMats(), g = new THREE.Group();
  B(g, 0.046, 0.11, 0.24, M.wood, 0, -0.06, 0.22, -0.14);               // butt stock
  B(g, 0.04, 0.05, 0.1, M.wood, 0, -0.015, 0.07);                        // wrist
  B(g, 0.04, 0.06, 0.12, M.brass, 0, 0.012, -0.03);                      // receiver
  C(g, 0.012, 0.58, M.steel, 0, 0.032, -0.38, 0.012, 8);                 // octagonal barrel
  C(g, 0.009, 0.5, M.steel, 0, 0.008, -0.34, 0.009, 8);                  // tube magazine under it
  B(g, 0.042, 0.04, 0.2, M.wood, 0, 0.01, -0.18);                        // fore-end
  B(g, 0.006, 0.014, 0.006, M.steel, 0, 0.048, -0.66);                   // front sight
  B(g, 0.008, 0.016, 0.01, M.steel, 0, 0.05, -0.12);                     // rear sight
  B(g, 0.008, 0.02, 0.01, M.steel, 0, 0.05, 0.02);                       // hammer
  const lv = new THREE.Group(); lv.position.set(0, -0.02, 0.0); g.add(lv);
  B(lv, 0.008, 0.012, 0.09, M.steel, 0, -0.02, 0.03); B(lv, 0.008, 0.05, 0.01, M.steel, 0, -0.04, 0.075); B(lv, 0.008, 0.012, 0.05, M.steel, 0, -0.062, 0.05);
  g.userData.lever = lv;
  g.userData.muzzle = new THREE.Vector3(0, 0.032, -0.68);
  g.userData.length = 1.0;
  return g;
}

const BUILDERS = { rifle: () => rifle(false), sniper: () => rifle(true), smg, pistol, knife, shotgun, revolver, lever };
export function hasGunModel(id) { return !!BUILDERS[id]; }
// a fresh group (geometry and materials are shared, so this is cheap)
export function gunModel(id) { return BUILDERS[id] ? BUILDERS[id]() : null; }
