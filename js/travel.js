// War, Stage 2: the travel scenes between countries, rendered in the
// game's own engine (same soldiers, uniforms, sky, light and weather), not
// interactive except for Skip, about 20 to 25 seconds each, shot like a
// film: cuts, slow pushes and pans.
//  - By boat: a WWII landing craft (Higgins-style LCVP for the Allies, a
//    Daihatsu-style barge for Japan, an assault ferry for the European Axis)
//    with the fleet around it; the squad packed on deck; the shore with
//    obstacles, wire, smoke and shell bursts; the ramp drops and they surge
//    out into the shallows.
//  - By plane: a transport (C-47-style for the Allies, Ju 52-style for the
//    European Axis, Ki-57-style for Japan) in formation over the country;
//    inside, two rows of paratroopers on benches, static lines on the cable,
//    flak lighting the windows, the red light turns green, they jump one
//    after another, then you jump and the canopy opens.
// National markings only (stars, roundels, the plain black cross, the red
// disc, the Italian tricolor roundel); never any hate symbol. All models are
// original low-poly builds; soldiers are the game's own characters.
import * as THREE from 'three';
import { Character } from './characters.js';
import { Sky } from './sky.js';
import { QUALITY } from './config.js';
import { crossInsignia } from './nations.js';
import { audioCtx } from './audio.js';
import { t, getLang } from './i18n.js';

// ---------------------------------------------------------------- textures
const TEX = {};
function canvasTex(key, w, h, paint, rep = 1) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(rep, rep);
  return (TEX[key] = tx);
}
// weathered painted metal: chipped paint, dirt and salt stains, rivet rows
function metal(key, base, corrugated = false) {
  return canvasTex('metal:' + key + corrugated, 128, 128, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,240'},${Math.random() * 0.06})`; x.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    if (corrugated) for (let y = 0; y < h; y += 6) { x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, y, w, 2); x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(0, y + 2, w, 1); }
    for (let i = 0; i < 26; i++) { x.fillStyle = 'rgba(120,110,95,0.35)'; x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 3); }   // chips
    for (let i = 0; i < 8; i++) { const gx = Math.random() * w; const g = x.createLinearGradient(gx, h * 0.6, gx, h); g.addColorStop(0, 'rgba(60,50,40,0)'); g.addColorStop(1, 'rgba(60,50,40,0.25)'); x.fillStyle = g; x.fillRect(gx, h * 0.6, 6 + Math.random() * 14, h * 0.4); }   // dirt streaks
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(230,230,220,0.07)'; x.beginPath(); x.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 14, 4 + Math.random() * 6, 0, 0, 7); x.fill(); }   // salt
    x.fillStyle = 'rgba(30,30,28,0.55)';
    for (let y = 8; y < h; y += 32) for (let xx = 4; xx < w; xx += 8) x.fillRect(xx, y, 1.5, 1.5);       // rivets
    for (let xx = 0; xx < w; xx += 64) { x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(xx, 0, 1, h); }      // panel seams
  });
}
function plywood() {
  return canvasTex('ply', 128, 128, (x, w, h) => {
    x.fillStyle = '#5a6248'; x.fillRect(0, 0, w, h);                                                       // navy-green painted plywood
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`; x.beginPath(); const y = Math.random() * h; x.moveTo(0, y); x.bezierCurveTo(w * 0.3, y + 3, w * 0.6, y - 3, w, y); x.stroke(); }
    for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(140,120,90,0.4)'; x.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 5, 2); }
  });
}
// national markings
function marking(nat) {
  return canvasTex('mark:' + nat, 128, 128, (x) => {
    const C = (r, c) => { x.fillStyle = c; x.beginPath(); x.arc(64, 64, r, 0, Math.PI * 2); x.fill(); };
    const star = (r, c) => { x.fillStyle = c; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; x.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } x.fill(); };
    if (nat === 'us') { x.fillStyle = '#f0ece0'; x.fillRect(8, 54, 112, 20); C(40, '#f0ece0'); C(36, '#22305a'); x.fillStyle = '#22305a'; x.fillRect(12, 58, 104, 12); star(32, '#f0ece0'); }
    else if (nat === 'su') { star(52, '#f0ece0'); star(44, '#b8282a'); }
    else if (nat === 'cn') { C(54, '#26386a'); x.fillStyle = '#f0ece0'; x.beginPath(); for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 22 : 40; x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } x.fill(); C(20, '#26386a'); C(17, '#f0ece0'); }
    else if (nat === 'de') crossInsignia(x, 64, 64, 96);                                     // the plain black cross
    else if (nat === 'it') { C(54, '#2a7a3a'); C(36, '#f0ece0'); C(18, '#c0282a'); }         // the plain tricolor roundel
    else if (nat === 'jp') { C(54, '#f0ece0'); C(46, '#b8282a'); }                          // the red disc
    else { C(54, '#26386a'); C(36, '#f0ece0'); C(18, '#b8282a'); }                          // RAF-style roundel (UK, Canada, Australia, India, ...)
  });
}
function decal(nat, size) {
  const m = new THREE.MeshBasicMaterial({ map: marking(nat), transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
}
function puffTex() { return canvasTex('puff', 64, 64, (x) => { const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }); }

// which vehicles a side uses, and whose markings
export function travelStyle(side, nations) {
  const main = nations[0] || (side === 'axis' ? 'de' : 'us');
  if (main === 'jp') return { craft: 'daihatsu', plane: 'ki57', mark: 'jp' };
  if (side === 'axis') return { craft: 'ferry', plane: 'ju52', mark: main === 'it' ? 'it' : 'de' };
  return { craft: 'lcvp', plane: 'c47', mark: ['us', 'su', 'cn'].includes(main) ? main : 'uk' };
}

// ----------------------------------------------------------------- models
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; }
// a landing craft (bow toward -z). Returns { group, ramp, deckY, length, width }
function landingCraft(kind, nat) {
  const g = new THREE.Group();
  const ply = new THREE.MeshLambertMaterial({ map: plywood() });
  const steel = new THREE.MeshLambertMaterial({ map: metal(kind, kind === 'daihatsu' ? '#5a6a58' : kind === 'ferry' ? '#6a6e66' : '#56604a') });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c28 });
  const L = kind === 'daihatsu' ? 13 : kind === 'ferry' ? 12 : 11, Wd = kind === 'ferry' ? 4.2 : 3.3, H = kind === 'daihatsu' ? 1.9 : 1.6;
  const hullMat = kind === 'lcvp' ? ply : steel;
  mesh(box(Wd, 0.3, L), hullMat, 0, 0.15, 0, g);                                   // flat bottom
  for (const s of [-1, 1]) mesh(box(0.14, H, L), hullMat, s * Wd / 2, H / 2, 0, g); // low sides
  mesh(box(Wd, H, 0.14), hullMat, 0, H / 2, L / 2, g);                             // transom
  // the hinged bow ramp (steel), pivoting on its lower edge
  const ramp = new THREE.Group(); ramp.position.set(0, 0.2, -L / 2); g.add(ramp);
  mesh(box(Wd - 0.2, kind === 'daihatsu' ? H + 0.7 : H + 0.2, 0.16), steel, 0, (kind === 'daihatsu' ? H + 0.7 : H + 0.2) / 2, 0, ramp);
  if (kind === 'lcvp') {
    mesh(box(1.3, 1.3, 1.6), ply, 0.6, H + 0.6, L / 2 - 1.2, g);                     // stern wheelhouse
    for (const s of [-1, 1]) { const tub = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 10, 1, true), steel, s * 1.2, H + 0.4, L / 2 - 0.5, g); tub.material.side = THREE.DoubleSide; mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), dark, s * 1.2, H + 0.8, L / 2 - 1, g).rotation.x = Math.PI / 2.4; }
  } else if (kind === 'daihatsu') {
    mesh(box(Wd * 0.9, 1.2, 1.8), steel, 0, H + 0.6, L / 2 - 1.2, g);
  } else {
    mesh(box(1.2, 0.9, 1.2), steel, -Wd / 2 + 0.8, H + 0.45, L / 2 - 1, g);
    for (let z = -L / 2 + 1; z < L / 2 - 1; z += 1.2) for (const s of [-1, 1]) mesh(box(0.06, 0.6, 0.06), dark, s * (Wd / 2 - 0.05), H + 0.3, z, g);   // rail posts
  }
  // national marking on both sides of the hull
  for (const s of [-1, 1]) { const d = decal(nat, 1.1); d.position.set(s * (Wd / 2 + 0.09), H * 0.55, L * 0.15); d.rotation.y = s * Math.PI / 2; g.add(d); }
  return { group: g, ramp, deckY: 0.3, length: L, width: Wd, H };
}
// a transport plane (nose toward -x). Returns { group, props, door }
function transport(kind, nat) {
  const g = new THREE.Group(), props = [];
  const skin = new THREE.MeshLambertMaterial({ map: metal(kind, kind === 'ju52' ? '#5e6658' : kind === 'ki57' ? '#5a6448' : '#5a5a3e', kind === 'ju52') });
  const dark = new THREE.MeshLambertMaterial({ color: 0x24261f });
  const glass = new THREE.MeshLambertMaterial({ color: 0x6a8a9a, emissive: 0x101820 });
  const L = kind === 'ju52' ? 18.9 : kind === 'ki57' ? 16 : 19.4, R = kind === 'ju52' ? 1.25 : 1.3, span = kind === 'ju52' ? 29 : kind === 'ki57' ? 22.6 : 29;
  const fus = kind === 'ju52' ? mesh(box(L * 0.82, R * 2.1, R * 1.9), skin) : mesh(new THREE.CylinderGeometry(R, R * 0.92, L * 0.78, 14), skin);
  if (kind !== 'ju52') fus.rotation.z = Math.PI / 2;
  g.add(fus);
  const nose = mesh(new THREE.SphereGeometry(R, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), skin, -L * 0.39, 0, 0, g); nose.rotation.z = Math.PI / 2; nose.scale.set(1, 0.9, 1);
  mesh(box(1.2, 0.5, 1.6), glass, -L * 0.38, R * 0.55, 0, g);                       // cockpit windows
  const tail = mesh(new THREE.ConeGeometry(R * 0.92, L * 0.32, 12), skin, L * 0.52, 0.15, 0, g); tail.rotation.z = -Math.PI / 2;
  mesh(box(span * 0.16, 0.22, span), skin, -L * 0.08, -R * 0.45, 0, g).scale.set(1, 1, 1);   // wing
  mesh(box(2.2, 0.15, 7.5), skin, L * 0.6, 0.6, 0, g);                              // tailplane
  mesh(box(2.4, 3.2, 0.15), skin, L * 0.6, 2, 0, g);                                // fin
  const engine = (z, x = -L * 0.12) => {
    mesh(new THREE.CylinderGeometry(0.7, 0.62, 2.6, 12), skin, x, -R * 0.2, z, g).rotation.z = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.5, 14), dark, x - 1.3, -R * 0.2, z, g).rotation.z = Math.PI / 2;   // radial cowl
    const pr = new THREE.Group(); pr.position.set(x - 1.6, -R * 0.2, z); g.add(pr);
    for (let k = 0; k < 3; k++) { const b = mesh(box(0.06, 3.0, 0.22), dark, 0, 0, 0, pr); b.rotation.x = k * Math.PI * 2 / 3; }
    props.push(pr);
  };
  engine(-4.2); engine(4.2);
  if (kind === 'ju52') {
    engine(0, -L * 0.45);                                                              // the third engine in the nose
    for (const z of [-4.2, 4.2]) { mesh(box(0.15, 2.2, 0.15), dark, -L * 0.1, -R - 0.9, z, g); mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.35, 12), dark, -L * 0.1, -R - 2, z, g).rotation.x = Math.PI / 2; }   // fixed landing gear
  }
  // windows down the cabin and the jump door (rear left = +z side)
  for (let k = 0; k < 6; k++) for (const s of [-1, 1]) { const w = mesh(new THREE.PlaneGeometry(0.4, 0.35), glass, -L * 0.25 + k * 1.6, R * 0.3, s * (R + 0.02), g); w.rotation.y = s > 0 ? 0 : Math.PI; }
  const door = mesh(box(1.0, 1.6, 0.05), dark, L * 0.26, -0.1, R + 0.02, g);
  // national markings: fuselage sides and wing tips
  for (const s of [-1, 1]) { const d = decal(nat, 1.6); d.position.set(L * 0.36, 0, s * (R * 0.95)); if (s < 0) d.rotation.y = Math.PI; g.add(d); }
  for (const s of [-1, 1]) { const d = decal(nat, 2.2); d.rotation.x = -Math.PI / 2; d.position.set(-L * 0.08, -R * 0.45 + 0.12, s * span * 0.38); g.add(d); }
  return { group: g, props, door, L, R };
}
function invasionStripes(plane) {
  // black and white bands on the wings and rear fuselage (Normandy)
  const w = new THREE.MeshBasicMaterial({ color: 0xe8e4d8 }), b = new THREE.MeshBasicMaterial({ color: 0x1a1a18 });
  for (let k = 0; k < 5; k++) for (const s of [-1, 1]) mesh(box(0.5, 0.25, 4.2), k % 2 ? b : w, -2.6 + k * 0.5 - 1.5, -0.4, s * 8, plane.group);
}

// ------------------------------------------------------------------ audio
function sceneAudio(boat) {
  const ac = audioCtx();
  if (!ac) return { stop() {}, boom() {}, setEngine() {} };
  const out = ac.createGain(); out.gain.value = 0.0001; out.connect(ac.destination);
  out.gain.setTargetAtTime(0.5, ac.currentTime, 1.2);
  const nodes = [];
  // engine
  const eng = ac.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = boat ? 48 : 62;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = boat ? 220 : 340;
  const eg = ac.createGain(); eg.gain.value = boat ? 0.18 : 0.24; eng.connect(lp).connect(eg).connect(out); eng.start(); nodes.push(eng);
  const wob = ac.createOscillator(); wob.frequency.value = boat ? 3 : 7; const wg = ac.createGain(); wg.gain.value = 4; wob.connect(wg).connect(eng.frequency); wob.start(); nodes.push(wob);
  // wind / waves and spray: looping filtered noise
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const nz = ac.createBufferSource(); nz.buffer = buf; nz.loop = true;
  const nf = ac.createBiquadFilter(); nf.type = boat ? 'lowpass' : 'bandpass'; nf.frequency.value = boat ? 500 : 900;
  const ng = ac.createGain(); ng.gain.value = boat ? 0.22 : 0.16; nz.connect(nf).connect(ng).connect(out); nz.start(); nodes.push(nz);
  const swell = ac.createOscillator(); swell.frequency.value = boat ? 0.18 : 0.4; const sg = ac.createGain(); sg.gain.value = 0.1; swell.connect(sg).connect(ng.gain); swell.start(); nodes.push(swell);
  // a tense musical bed: a low drone and a slow pulse (no voices)
  for (const f of [55, 82.4, 110.6]) { const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = f; const og = ac.createGain(); og.gain.value = 0.035; o.connect(og).connect(out); o.start(); nodes.push(o); }
  const pulse = ac.createOscillator(); pulse.frequency.value = 0.9; const pg = ac.createGain(); pg.gain.value = 0.03; const pulseTone = ac.createOscillator(); pulseTone.frequency.value = 41; const ptg = ac.createGain(); ptg.gain.value = 0; pulse.connect(pg).connect(ptg.gain); pulseTone.connect(ptg).connect(out); pulse.start(); pulseTone.start(); nodes.push(pulse, pulseTone);
  // distant gunfire / flak
  const boom = (vol) => {
    const s = ac.createBufferSource(); s.buffer = buf; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 160 + Math.random() * 120;
    const g2 = ac.createGain(); g2.gain.setValueAtTime(vol, ac.currentTime); g2.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 1.4);
    s.connect(f).connect(g2).connect(out); s.start(); s.stop(ac.currentTime + 1.5);
  };
  return {
    boom, setEngine(k) { eg.gain.setTargetAtTime((boat ? 0.18 : 0.24) * k, ac.currentTime, 0.4); },
    stop() { out.gain.setTargetAtTime(0.0001, ac.currentTime, 0.25); setTimeout(() => { for (const n of nodes) try { n.stop(); } catch { /* */ } out.disconnect(); }, 900); },
  };
}

// ---------------------------------------------------------- shared set-up
let preloaded = false;
// build the textures ahead (called when the world map opens) so the scene starts at once
export function prepareTravel(side, nations) {
  if (preloaded) return; preloaded = true;
  const st = travelStyle(side, nations);
  metal(st.craft, '#56604a'); metal(st.plane, '#5a5a3e', st.plane === 'ju52'); plywood(); marking(st.mark); puffTex();
}
// the in-game date (a calendar from 1 September 1939)
export function warDate(day) {
  const d = new Date(1939, 8, 1 + Math.floor(day));
  try { return d.toLocaleDateString(getLang() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d.toDateString(); }
}

/**
 * Play the scene. o: { by: 'boat'|'plane', renderer, toName, dateText, tod (0..1),
 * weather (a WEATHER entry), nations (the squad's nations), n (soldiers taken),
 * side, touch, quality, normandy }
 */
export function playTravel(o) {
  return new Promise((resolve) => {
    const touch = !!o.touch, lite = touch || o.quality === 'low';
    const R = o.renderer, scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1500);
    const sky = new Sky(scene, QUALITY[lite ? 'low' : (o.quality || 'medium')] || QUALITY.medium);
    const W = o.weather || { precip: 'none', amount: 0, cloud: 0.2, fog: 0 };
    sky.cloud = W.cloud || 0; sky.snow = W.precip === 'snow'; sky.bright = W.sun === 'bright';
    const rain = W.precip === 'none' ? 0 : W.amount;
    if ((W.fog || 0) > 0.05) scene.fog = new THREE.Fog(0x808080, 40, 900 * (1 - W.fog * 0.7));
    const night = o.tod < 0.22 || o.tod > 0.8;
    if (night) scene.add(new THREE.AmbientLight(0x50608a, 0.55));            // moonlight, so the men can still be made out
    const st = travelStyle(o.side, o.nations || []);
    const nat = (o.nations && o.nations[0]) || (o.side === 'axis' ? 'de' : 'us');
    const LEN = o.by === 'boat' ? 23 : 24;
    const disposeList = [], rigs = [];
    const keep = (m) => { disposeList.push(m); return m; };
    // ---------- overlay: title card and Skip
    const el = document.createElement('div'); el.id = 'travel';
    el.innerHTML = `<div class="tcard"><p class="tdest">${t(o.by === 'boat' ? 'travel.byBoat' : 'travel.byPlane', { name: o.toName })}</p><p class="tdate">${o.dateText || ''}</p></div>
      <div class="tfade"></div><button class="btn" id="tskip">${t('travel.skip')}</button>`;
    document.body.appendChild(el);
    const fade = el.querySelector('.tfade'), card = el.querySelector('.tcard');
    let done = false;
    const audio = sceneAudio(o.by === 'boat');
    const finish = () => {
      if (done) return; done = true;
      audio.stop();
      for (const r of rigs) r.dispose();
      scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); });
      el.remove(); removeEventListener('resize', onResize);
      resolve();
    };
    const skip = el.querySelector('#tskip');
    const goSkip = (e) => { e.preventDefault(); e.stopPropagation(); finish(); };
    skip.addEventListener('pointerdown', goSkip); skip.addEventListener('touchstart', goSkip, { passive: false }); skip.addEventListener('click', goSkip);
    const onResize = () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); R.setSize(innerWidth, innerHeight, false); };
    addEventListener('resize', onResize);
    // the squad: the game's own soldier models in your side's uniforms
    const squad = Math.min(o.n || 12, lite ? 10 : 18, o.by === 'boat' ? 18 : 14);
    const soldier = (i) => {
      const r = new Character((o.nations && o.nations[i % o.nations.length]) || nat, i === 0 ? 'officer' : 'rifleman', i % 3);
      r.setWeapon(i % 5 === 3 ? 'smg' : 'rifle');
      rigs.push(r); return r;
    };
    const puffMat = new THREE.SpriteMaterial({ map: puffTex(), color: 0x6a6660, transparent: true, depthWrite: false });
    const flashMat = new THREE.SpriteMaterial({ map: puffTex(), color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const puffs = [];
    const puff = (x, y, z, size, flash, life = 3) => {
      if (puffs.length > (lite ? 40 : 90)) return;
      const s = new THREE.Sprite((flash ? flashMat : puffMat).clone()); s.position.set(x, y, z); s.scale.setScalar(size); scene.add(s);
      puffs.push({ s, t: 0, life, grow: flash ? 2.5 : 1.2, rise: flash ? 0 : 1.2 });
    };
    const P = o.by === 'boat' ? boatScene() : planeScene();
    let t0 = performance.now(), last = t0;
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = (now - t0) / 1000;
      if (s > LEN) { finish(); return; }
      card.style.opacity = s < 0.5 ? s * 2 : s < 3.5 ? 1 : Math.max(0, 1 - (s - 3.5));
      fade.style.opacity = s < 0.8 ? 1 - s / 0.8 : s > LEN - 1 ? (s - (LEN - 1)) : 0;
      try { P.update(s, dt); } catch (e) { console.error(e); finish(); return; }   // never leave the player stuck in a scene
      for (const p of puffs) { p.t += dt; p.s.position.y += p.rise * dt; p.s.scale.multiplyScalar(1 + dt * p.grow * 0.3); p.s.material.opacity = Math.max(0, 1 - p.t / p.life); }
      for (const p of puffs.filter((q) => q.t > q.life)) { scene.remove(p.s); p.s.material.dispose(); }
      for (let i = puffs.length - 1; i >= 0; i--) if (puffs[i].t > puffs[i].life) puffs.splice(i, 1);
      sky.update(dt, o.tod, rain, cam.position, false);
      if (scene.fog) scene.fog.color.copy(sky.color);
      R.render(scene, cam);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    // ------------------------------------------------------------- boat
    function boatScene() {
      // the sea: a low-poly swell (flat-shaded, so no normals to recompute)
      const seg = lite ? 40 : 64;
      const seaGeo = new THREE.PlaneGeometry(900, 900, seg, seg); seaGeo.rotateX(-Math.PI / 2);
      const sea = new THREE.Mesh(seaGeo, new THREE.MeshLambertMaterial({ color: night ? 0x1e2a32 : 0x3a5260, flatShading: true }));
      scene.add(sea);
      const base = seaGeo.attributes.position.array.slice();
      const wave = (x, z, s) => Math.sin(x * 0.05 + s * 0.9) * 0.45 + Math.sin(z * 0.07 + s * 1.3) * 0.35 + Math.sin((x + z) * 0.11 + s * 1.7) * 0.15;
      // the shore ahead: beach, bluffs, obstacles, wire, smoke
      const shoreZ = -260;
      const sand = new THREE.MeshLambertMaterial({ color: 0x8a7a5a }), bluff = new THREE.MeshLambertMaterial({ color: 0x5a5a44 });
      mesh(box(900, 4, 60), sand, 0, -1, shoreZ - 25, scene);
      mesh(box(900, 26, 80), bluff, 0, 10, shoreZ - 85, scene);
      const iron = new THREE.MeshLambertMaterial({ color: 0x2a2826 });
      for (let i = 0; i < 40; i++) { const h = new THREE.Group(); for (let k = 0; k < 3; k++) { const b = mesh(box(0.25, 2.4, 0.25), iron, 0, 0.8, 0, h); b.rotation.set(k === 0 ? 0.9 : 0, k * 1.05, k === 2 ? 0.9 : 0); } h.position.set(-120 + i * 6 + (i % 3) * 1.5, 0.2, shoreZ + 4 - (i % 4) * 3); scene.add(h); }
      const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a18 });
      for (let r = 0; r < 3; r++) { const pts = []; for (let x = -140; x < 140; x += 1.2) pts.push(new THREE.Vector3(x, 1.2 + Math.sin(x * 3) * 0.4, shoreZ - 10 - r * 5 + Math.cos(x * 2.2) * 0.4)); scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat)); }
      // the fleet: other landing craft and ships on the horizon
      const me = landingCraft(st.craft, st.mark); scene.add(me.group);
      const others = [];
      for (let i = 0; i < (lite ? 4 : 7); i++) { const c = landingCraft(st.craft, st.mark); c.group.position.set((i % 2 ? 1 : -1) * (19 + Math.floor(i / 2) * 12), 0, -18 + (i % 3) * 9 + Math.floor(i / 2) * 4); scene.add(c.group); others.push(c); }
      const gray = new THREE.MeshLambertMaterial({ map: metal('ship', '#5a5e62') });
      for (let i = 0; i < 6; i++) { const sh = new THREE.Group(); mesh(box(60, 7, 10), gray, 0, 3, 0, sh); mesh(box(14, 9, 7), gray, -6, 11, 0, sh); mesh(box(2.5, 8, 2.5), gray, 4, 15, 0, sh); sh.position.set(-260 + i * 100, -1, 260 + (i % 2) * 70); sh.rotation.y = 0.15 * (i % 3 - 1); scene.add(sh); }
      // aircraft overhead (Normandy: invasion stripes)
      const planes = [];
      if (!lite) for (let i = 0; i < 3; i++) { const p = transport(st.plane, st.mark); p.group.scale.setScalar(0.6); if (o.normandy) invasionStripes(p); p.group.position.set(200 + i * 30, 70 + i * 6, -40 - i * 20); scene.add(p.group); planes.push(p); }
      // your squad packed on deck
      const men = [];
      for (let i = 0; i < squad; i++) {
        const r = soldier(i); me.group.add(r.root);
        const row = Math.floor(i / 3), col = i % 3;
        const x = (col - 1) * 0.95, z = -me.length / 2 + 2.4 + row * 1.05;
        r.root.position.set(x, me.deckY, z); r.root.rotation.y = 0;
        men.push({ r, x, z, ph: Math.random() * 6, kind: i % 4 });
      }
      // the run in: steady, then easing off to a stop just off the beach at ~18 s
      const landZ = shoreZ + 22, startZ = landZ + 150;
      const runZ = (s) => s >= 18 ? landZ : startZ - 150 * (1 - Math.pow(1 - s / 18, 1.6));
      for (const c of others) c.group.position.z += startZ;
      return {
        update(s, dt) {
          // the swell
          const pa = seaGeo.attributes.position.array;
          for (let i = 0; i < pa.length; i += 3) pa[i + 1] = wave(base[i], base[i + 2], s) * (1 + (W.amount || 0) * 0.6);
          seaGeo.attributes.position.needsUpdate = true;
          // the craft runs in, slowing toward the end
          const z = runZ(s);
          const roll = Math.sin(s * 1.1) * 0.06, pitch = Math.sin(s * 0.8 + 1) * 0.04;
          me.group.position.set(0, wave(0, z, s) * 0.6, z); me.group.rotation.set(pitch, 0, roll);
          for (const c of others) { c.group.position.z = Math.max(landZ + 4, c.group.position.z - dt * (s < 12 ? 11 : 6)); c.group.position.y = wave(c.group.position.x, c.group.position.z, s) * 0.6; c.group.rotation.z = Math.sin(s + c.group.position.x) * 0.06; }
          for (const p of planes) { p.group.position.x -= dt * 45; for (const pr of p.props) pr.rotation.x += dt * 40; }
          // the shore under fire: smoke, shell bursts, splashes
          if (Math.random() < dt * (lite ? 1.6 : 3)) { const x = (Math.random() - 0.5) * 200; puff(x, 2, shoreZ - 5 - Math.random() * 40, 8 + Math.random() * 6, Math.random() < 0.4, 4); if (Math.random() < 0.3) audio.boom(0.25); }
          if (Math.random() < dt * 1.2) puff((Math.random() - 0.5) * 80, 1, me.group.position.z - 20 - Math.random() * 60, 3, false, 1.2);   // splashes
          // the men: swaying with the swell, gripping rails, checking weapons
          const ramp = s > 17.5 ? Math.min(1, (s - 17.5) / 1.2) : 0;
          me.ramp.rotation.x = -ramp * 1.35;
          for (const m of men) {
            const out = s > 18.5 ? Math.max(0, (s - 18.5 - (m.z + me.length / 2) * 0.12) * 3.0) : 0;
            const lz = m.z - out, wading = lz < -me.length / 2 - 0.8;
            m.r.root.position.set(m.x + (wading ? Math.sin(m.ph) * 1.5 : 0), wading ? -0.75 : me.deckY, lz);
            m.r.root.visible = out < 30 && !(s > 20.5 && m.z > -me.length / 2 + 4.2);   // the men behind you are out of the last shot
            m.r.pose({ speed: out > 0 ? 3.5 : 0, run: out > 0, aim: m.kind === 1 && (s + m.ph) % 4 < 1.4, crouch: m.kind === 2 && s < 17, look: Math.sin(s * 0.7 + m.ph) * 0.4, pitch: 0 }, dt);
          }
          // the camera: fleet, push in on the men, your place at the front, the ramp
          const c = me.group.position;
          // 1: the fleet from low over the water, a slow pan across the craft
          if (s < 5) { const k = s / 5; cam.position.set(c.x + 10 - k * 3, 6 - k * 2, c.z + 20 - k * 7); cam.lookAt(c.x - 2 - k * 3, 1.2, c.z - 8); }
          // 2: push in over the stern on the packed men
          else if (s < 10) { const k = (s - 5) / 5; cam.position.set(c.x + 2.2 - k * 1.6, c.y + 3.6 - k * 0.9, c.z + me.length / 2 + 1.5 - k * 3.5); cam.lookAt(c.x, c.y + 1.3, c.z - me.length / 4); }
          // 3: your place, the third row, looking over the helmets at the shore
          else if (s < 20.5) { const bob = Math.sin(s * 1.6) * 0.08; cam.position.set(c.x + 0.48, c.y + 2.3 + bob, c.z - me.length / 2 + 4.6); cam.lookAt(c.x + Math.sin(s * 0.3) * 5, 1.6 + bob, c.z - 90); }
          // 4: off the ramp and down into the shallows behind the others
          else { const k = Math.min(1, (s - 20.5) / 2); cam.position.set(c.x + 0.48, c.y + 2.3 - k * 1.4, c.z - me.length / 2 + 4.6 - k * 7.5); cam.lookAt(c.x, 1.0, c.z - 70); if (Math.random() < dt * 6) puff(c.x + (Math.random() - 0.5) * 2, 0.4, cam.position.z - 2, 1.2, false, 0.6); }
          audio.setEngine(s > 17 ? 0.4 : 1);
        },
      };
    }

    // ------------------------------------------------------------- plane
    function planeScene() {
      // the country below
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), new THREE.MeshLambertMaterial({ color: night ? 0x1a2018 : (o.groundColor || 0x55603e) }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -420; scene.add(ground);
      const patch = new THREE.MeshLambertMaterial({ color: night ? 0x141812 : 0x6a6a44 });
      for (let i = 0; i < (lite ? 30 : 80); i++) { const p = mesh(box(60 + Math.random() * 120, 1, 40 + Math.random() * 90), patch, (Math.random() - 0.5) * 3000, -419, (Math.random() - 0.5) * 3000, scene); p.rotation.y = Math.random(); }
      const fires = [];
      if (night) for (let i = 0; i < 12; i++) { const f = new THREE.Sprite(flashMat.clone()); f.position.set((Math.random() - 0.5) * 1500, -410, (Math.random() - 0.5) * 1500); f.scale.setScalar(30); scene.add(f); fires.push(f); }
      const beams = [];
      if (night) for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(18, 500, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xdde8ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); b.position.set(-400 + i * 260, -170, -200 + (i % 2) * 300); scene.add(b); beams.push(b); }
      // the formation
      const me = transport(st.plane, st.mark); scene.add(me.group);
      const wing = [];
      for (let i = 0; i < (lite ? 3 : 5); i++) { const p = transport(st.plane, st.mark); p.group.position.set(40 + i * 35, (i % 2) * 8 - 4, (i % 2 ? 1 : -1) * (30 + i * 12)); scene.add(p.group); wing.push(p); }
      // the cabin (only seen from inside): ribs, benches, the static-line cable
      const cabin = new THREE.Group(); me.group.add(cabin);
      const inner = new THREE.MeshLambertMaterial({ map: metal('cabin', '#4e5440'), side: THREE.BackSide });
      const tube = mesh(new THREE.CylinderGeometry(me.R * 0.97, me.R * 0.97, me.L * 0.62, 14, 1, true), inner, 0, 0, 0, cabin); tube.rotation.z = Math.PI / 2;
      mesh(box(me.L * 0.62, 0.05, me.R * 1.8), new THREE.MeshLambertMaterial({ color: 0x3a3a30 }), 0, -me.R * 0.6, 0, cabin);   // floor
      const ribMat = new THREE.MeshLambertMaterial({ color: 0x3e4434 });
      for (let k = 0; k < 10; k++) { const r = mesh(new THREE.TorusGeometry(me.R * 0.93, 0.05, 4, 14, Math.PI), ribMat, -me.L * 0.28 + k * 1.2, -me.R * 0.1, 0, cabin); r.rotation.y = Math.PI / 2; }
      const bench = new THREE.MeshLambertMaterial({ color: 0x5a4a34 });
      for (const s of [-1, 1]) mesh(box(me.L * 0.5, 0.08, 0.4), bench, 0, -me.R * 0.18, s * (me.R * 0.7), cabin);
      mesh(new THREE.CylinderGeometry(0.02, 0.02, me.L * 0.55, 5), new THREE.MeshLambertMaterial({ color: 0x8a8a80 }), 0, me.R * 0.72, 0, cabin).rotation.z = Math.PI / 2;
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); lamp.position.set(me.L * 0.22, 0.4, me.R * 0.8); cabin.add(lamp);
      const glow = new THREE.PointLight(0xff3a20, 1.2, 6); glow.position.copy(lamp.position); cabin.add(glow);
      const flak = new THREE.PointLight(0xffc080, 0, 30); flak.position.set(0, 3, 0); me.group.add(flak);
      // paratroopers on the benches, facing each other
      const men = [];
      const lines = new THREE.LineBasicMaterial({ color: 0xc8c0a8 });
      for (let i = 0; i < squad; i++) {
        const r = soldier(i); cabin.add(r.root); r.setWeapon(null);
        const side = i % 2 ? 1 : -1, x = -me.L * 0.12 + Math.floor(i / 2) * Math.min(0.85, me.L * 0.32 / Math.ceil(squad / 2));
        r.root.position.set(x, -me.R * 0.6 + 0.08, side * me.R * 0.62); r.root.rotation.y = side > 0 ? Math.PI : 0;
        const pack = mesh(box(0.34, 0.42, 0.18), new THREE.MeshLambertMaterial({ color: 0x6a6448 }), 0, 1.15, 0.16, r.root);   // the parachute pack
        void pack;
        const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, me.R * 0.72, 0), new THREE.Vector3(x, 0.4, side * me.R * 0.45)]), lines); cabin.add(ln);
        men.push({ r, x, side, ph: Math.random() * 6, jumpAt: 15 + i * (5 / squad) });
      }
      const jumpers = [];
      const canopyMat = new THREE.MeshLambertMaterial({ color: 0xd8d0b8, emissive: night ? 0x141412 : 0x5a564a, side: THREE.DoubleSide });
      const cordMat = new THREE.LineBasicMaterial({ color: 0x9a9480 });
      const chute = () => {
        const g = new THREE.Group(); const d = mesh(new THREE.SphereGeometry(2.6, lite ? 12 : 18, 6, 0, Math.PI * 2, 0, Math.PI / 2.1), canopyMat, 0, 5.2, 0, g); d.scale.y = 0.5;
        const pts = []; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; pts.push(new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(Math.cos(a) * 2.5, 5.3, Math.sin(a) * 2.5)); }
        g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), cordMat)); return g;
      };
      return {
        update(s, dt) {
          // the formation drones on; propellers spin
          for (const p of [me, ...wing]) for (const pr of p.props) pr.rotation.x += dt * 45;
          me.group.rotation.z = Math.sin(s * 0.6) * 0.02; me.group.position.y = Math.sin(s * 0.9) * 0.4;
          for (const p of wing) { p.group.position.y = Math.sin(s * 0.8 + p.group.position.z) * 0.6; }
          ground.position.x += dt * 60; for (const f of fires) f.position.x += dt * 60;
          for (const b of beams) { b.rotation.z = Math.sin(s * 0.4 + b.position.x) * 0.5; b.rotation.x = Math.cos(s * 0.3 + b.position.z) * 0.3; }
          // flak: dark puffs (and their flash lighting the windows)
          if (Math.random() < dt * (night ? 1.2 : 2)) { puff(-60 + Math.random() * 160, (Math.random() - 0.3) * 40, (Math.random() - 0.5) * 120, 9, false, 3); puff(0, 0, 0, 0.1, false, 0.1); flak.intensity = 6; audio.boom(0.2); }
          flak.intensity = Math.max(0, flak.intensity - dt * 18);
          // the red light turns green
          const green = s > 14;
          lamp.material.color.setHex(green ? 0x30ff40 : 0xff2a1a); glow.color.setHex(green ? 0x30ff40 : 0xff3a20);
          // the men: seated, swaying, then up, hooked up and out of the door
          for (const m of men) {
            const up = s > 12.5, out = s > m.jumpAt;
            if (out) {
              if (!m.gone) { m.gone = true; m.r.root.visible = false; const j = { g: chute(), r: null, t: 0, x: me.L * 0.26, y: 0, z: me.R + 1 }; j.g.visible = false; scene.add(j.g); j.body = soldier(jumpers.length + 20); scene.add(j.body.root); jumpers.push(j); }
              continue;
            }
            if (up) { const k = Math.min(1, (s - 12.5) / 1.5), tx = me.L * 0.22 - (m.jumpAt - s) * 1.4; m.r.root.position.x = m.x + (Math.max(m.x, tx) - m.x) * k; m.r.root.position.z = m.side * me.R * (0.62 - k * 0.35); m.r.root.position.y = -me.R * 0.6 + 0.08; m.r.root.rotation.y = -Math.PI / 2; }
            m.r.pose({ sit: !up, speed: up && s > m.jumpAt - 2 ? 2 : 0, look: Math.sin(s * 0.5 + m.ph) * 0.3, surrender: false }, dt);
            if (!up) m.r.root.position.y = -me.R * 0.6 + 0.08 + Math.sin(s * 9 + m.ph) * 0.01;   // engine vibration
          }
          // jumpers fall away behind, their canopies opening
          for (const j of jumpers) {
            j.t += dt;
            const wp = new THREE.Vector3(me.L * 0.26 + j.t * 55, -j.t * (j.t < 1.2 ? 8 : 4), me.R + 1 + j.t * 2).applyMatrix4(me.group.matrixWorld);
            j.body.root.position.copy(wp); j.body.pose({ ride: false, surrender: j.t < 1.2 }, dt);
            j.g.visible = j.t > 1.1; j.g.position.copy(wp); j.g.scale.setScalar(Math.min(1, Math.max(0.1, (j.t - 1.1) * 1.5)));
          }
          // the camera: formation, the cabin, the green light, the jump, your canopy
          const c = me.group.position;
          if (s < 5) { const k = s / 5; cam.position.set(c.x - 30 + k * 20, c.y + 8 - k * 2, c.z + 38 - k * 6); cam.lookAt(c.x + 4, c.y, c.z); }
          // 2: inside, down the aisle toward the door and the red lamp (a slow push)
          else if (s < 15) { const sh = Math.sin(s * 37) * 0.012, k = (s - 5) / 10; cam.position.set(c.x - me.L * 0.27 + k * 1.2, c.y + 0.55 + sh, c.z + sh); cam.lookAt(c.x + me.L * 0.3, c.y + 0.1, c.z + (s > 12 ? 0.5 : 0.2)); }
          // 3: outside by the jump door as the stick goes out into the slipstream
          else if (s < 20) { const k = (s - 15) / 5; cam.position.set(c.x + me.L * 0.2 - k * 3, c.y + 1.5 - k * 2, c.z + me.R + 16 + k * 6); cam.lookAt(c.x + me.L * 0.4 + k * 18, c.y - 2 - k * 8, c.z + me.R); }
          else {
            // your jump: out of the door, the ground below, then look up at the canopy
            const k = Math.min(1, (s - 20) / 3.5);
            if (!this.mine) { this.mine = chute(); scene.add(this.mine); }
            cam.position.set(c.x + me.L * 0.26 + k * 40, c.y - k * 26, c.z + me.R + 2 + k * 3);
            const open = Math.min(1, Math.max(0.05, (s - 21.3) * 1.4));
            this.mine.position.set(cam.position.x, cam.position.y - 1.4, cam.position.z); this.mine.scale.set(open, 0.4 + open * 0.6, open); this.mine.visible = s > 21.3;
            // falling: the ground rushing below; then the jerk of the canopy and a look up at it, the others around
            if (s < 21.4) cam.lookAt(cam.position.x + 20, cam.position.y - 40, cam.position.z);
            else { const u = Math.min(1, (s - 21.4) / 0.8); cam.lookAt(cam.position.x + 14 - u * 12, cam.position.y - 20 + u * 23, cam.position.z + 6 - u * 5); }
          }
          audio.setEngine(s > 20 ? 0.3 : 1);
        },
      };
    }
  });
}
