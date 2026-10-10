// Town Life: one night in the town jail, a short film in the game's own 3D
// (about 14 seconds; Skip ends it). Inside the stone jail at night: you lie
// on the cot behind the bars, the sheriff dozes at his desk by an oil lamp,
// moonlight falls through the barred window and turns to dawn, and in the
// morning the sheriff unlocks the cell. No voices: crickets, an owl, a
// snore, the keys.
import * as THREE from 'three';
import { Character, civLook } from './characters.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

const LEN = 14;
const box = (w, h, d, c, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c })); m.position.set(x, y, z); parent.add(m); return m; };

export function playJailClip({ renderer, touch = false, dateText = '' }) {
  return new Promise((resolve) => {
    const R = renderer, scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080c); scene.fog = new THREE.Fog(0x07080c, 6, 16);
    const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 60);
    // the room: plank floor, stone walls, a barred window high in the back wall
    const room = new THREE.Group(); scene.add(room);
    box(8, 0.1, 7, 0x4a3a2a, 0, -0.05, 0, room);
    box(8, 3.2, 0.3, 0x6a6a64, 0, 1.6, -2.1, room);                     // back wall of the cell
    box(0.3, 3.2, 7, 0x5e5e58, -4, 1.6, 0, room); box(0.3, 3.2, 7, 0x5e5e58, 4, 1.6, 0, room);
    box(8, 0.2, 7, 0x2a2420, 0, 3.2, 0, room);
    const winGlow = box(0.9, 0.6, 0.05, 0x8090b0, -1.2, 2.3, -1.94, room); winGlow.material = new THREE.MeshBasicMaterial({ color: 0x8090b0 });
    for (let k = -1; k <= 1; k++) box(0.04, 0.6, 0.06, 0x202020, -1.2 + k * 0.25, 2.3, -1.9, room);
    // the bars across the room with a door of bars
    const barMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const door = new THREE.Group(); door.position.set(0.4, 0, -0.6); room.add(door);
    for (let x = -3.8; x <= 3.8; x += 0.22) {
      const inDoor = x > 0.38 && x < 1.62;
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 6), barMat);
      if (inDoor) { b.position.set(x - 0.4, 1.2, 0); door.add(b); } else { b.position.set(x, 1.2, -0.6); room.add(b); }
    }
    for (const y of [0.1, 2.35]) box(7.6, 0.05, 0.05, 0x2a2a2a, 0, y, -0.6, room);
    // the cot and you on it
    box(0.8, 0.08, 1.9, 0x5a5a58, -2.6, 0.42, -1.35, room).rotation.y = Math.PI / 2;
    box(1.8, 0.08, 0.74, 0x8a8a7a, -2.6, 0.5, -1.35, room);
    civLook('prisoner', { shirt: 0xc8bca0, trousers: 0x4a4038, hair: 0x3a2a1c, hat: 'none' });
    const me = new Character('civ', 'prisoner', 1); room.add(me.root);
    me.place(new THREE.Vector3(-1.7, 0.42, -1.35), -Math.PI / 2, 0); me.pose({ lie: true }, 0.1);
    // the sheriff at his desk by the lamp, dozing
    civLook('sheriffclip', { shirt: 0xd8d0c0, trousers: 0x2e3236, vest: 0x2a2a2e, hat: 'felt', hatColor: 0x2a2420, moustache: true, gunbelt: true });
    const sh = new Character('civ', 'sheriffclip', 2); room.add(sh.root);
    sh.place(new THREE.Vector3(2.2, 0, 1.6), Math.PI * 0.75, 0);
    box(1.4, 0.06, 0.7, 0x5a3a24, 1.7, 0.78, 1.0, room);
    for (const [x, z] of [[1.1, 0.75], [2.3, 0.75], [1.1, 1.25], [2.3, 1.25]]) box(0.06, 0.78, 0.06, 0x3a2414, x, 0.39, z, room);
    const lampGlass = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffc070 })); lampGlass.position.set(1.4, 0.95, 0.9); room.add(lampGlass);
    const keys = box(0.1, 0.12, 0.02, 0xc8a050, 3.82, 1.5, 1.0, room);
    // light: dim moonlight, the oil lamp, then dawn through the window
    const amb = new THREE.AmbientLight(0x4a5878, 0.5); scene.add(amb);
    const moon = new THREE.DirectionalLight(0x9ab0e0, 0.8); moon.position.set(-1.2, 3, -4); moon.target.position.set(-2, 0, 0); scene.add(moon, moon.target);
    const lamp = new THREE.PointLight(0xffb060, 2.2, 7, 1.6); lamp.position.set(1.4, 1.1, 0.9); scene.add(lamp);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xa0b4e0, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(-1.6, 1.4, -0.9); beam.rotation.set(0.9, 0, 0.35); scene.add(beam);
    // overlay: title, fade, Skip (the same look as the War travel scenes)
    const el = document.createElement('div'); el.id = 'travel';
    el.innerHTML = `<div class="tcard"><p class="tdest">${t('jail.clipTitle')}</p><p class="tdate">${dateText}</p></div><div class="tfade"></div><button class="btn" id="tskip">${t('travel.skip')}</button>`;
    document.body.appendChild(el); document.body.classList.add('inclip');
    const fade = el.querySelector('.tfade'), card = el.querySelector('.tcard');
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      el.remove(); document.body.classList.remove('inclip'); removeEventListener('resize', onResize);
      me.dispose(); sh.dispose();
      scene.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material.dispose) m.material.dispose(); });
      resolve();
    };
    const go = (e) => { e.preventDefault(); e.stopPropagation(); finish(); };
    const skip = el.querySelector('#tskip');
    skip.addEventListener('pointerdown', go); skip.addEventListener('touchstart', go, { passive: false }); skip.addEventListener('click', go);
    const onResize = () => { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); R.setSize(innerWidth, innerHeight, false); };
    addEventListener('resize', onResize);
    const t0 = performance.now(); let last = t0, cricket = 0, snore = 3, owl = 5.5, sat = false, keysT = false;
    const frame = (now) => {
      if (done) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const s = (now - t0) / 1000;
      if (s > LEN) { finish(); return; }
      card.style.opacity = s < 0.6 ? s / 0.6 : s < 3.5 ? 1 : Math.max(0, 1 - (s - 3.5));
      fade.style.opacity = s < 0.8 ? 1 - s / 0.8 : s > LEN - 1 ? s - (LEN - 1) : 0;
      // dawn: the window brightens and warms, the lamp is turned down
      const dawn = Math.max(0, Math.min(1, (s - 8) / 3.5));
      winGlow.material.color.setRGB(0.5 + dawn * 0.5, 0.56 + dawn * 0.32, 0.69 - dawn * 0.2);
      moon.color.setRGB(0.6 + dawn * 0.4, 0.69 + dawn * 0.2, 0.88 - dawn * 0.3); moon.intensity = 0.8 + dawn * 0.9;
      amb.intensity = 0.5 + dawn * 0.5; beam.material.opacity = 0.06 + dawn * 0.06;
      lamp.intensity = (2.2 - dawn * 1.6) * (0.9 + Math.sin(s * 23) * 0.05 + Math.sin(s * 7) * 0.05);
      // people: you sleep, then sit up at dawn; the sheriff dozes, then gets up with the keys
      if (s < 9.5) { me.place(new THREE.Vector3(-1.7, 0.42, -1.35), -Math.PI / 2, 0); me.pose({ lie: true }, dt); }
      else { if (!sat) { sat = true; me.place(new THREE.Vector3(-2.6, 0, -0.95), Math.PI, 0); } me.pose({ sit: true, look: Math.sin(s) * 0.2 }, dt); }
      if (s < 11) { sh.pose({ sit: true, look: 0 }, dt); sh.head.rotation.x = 0.45 + Math.sin(s * 1.3) * 0.05; }
      else { const k = Math.min(1, (s - 11) / 2); sh.place(new THREE.Vector3(2.2 - k * 1.2, 0, 1.6 - k * 1.5), Math.PI * 0.75, 0); sh.pose({ speed: k < 1 ? 1.4 : 0 }, dt); if (!keysT) { keysT = true; keys.visible = false; sfx.coins(); } }
      if (s > 12.4) door.rotation.y = -Math.min(1.4, (s - 12.4) * 1.6);
      // sounds of the night
      if ((cricket -= dt) <= 0 && dawn < 0.6) { cricket = 0.7 + Math.random() * 0.8; sfx.cricket(0.5); }
      if ((snore -= dt) <= 0 && s < 11) { snore = 2.6; sfx.growl(0.12); }
      if (owl > 0 && (owl -= dt) <= 0) sfx.owl(0.5);
      // the camera: through the bars toward the cot, the sheriff, the window, the door opening
      if (s < 4.5) { const k = s / 4.5; cam.position.set(-0.6 - k * 0.8, 1.5 - k * 0.2, 2.2 - k * 1.6); cam.lookAt(-2.2, 0.6, -1.4); }
      else if (s < 8.5) { const k = (s - 4.5) / 4; cam.position.set(0.3 + k * 0.4, 1.3, 2.6 - k * 0.3); cam.lookAt(1.7, 0.95, 1.2); }
      else if (s < 11.5) { const k = (s - 8.5) / 3; cam.position.set(-0.6, 1.2 + k * 0.2, 0.9); cam.lookAt(-2.2, 0.9 + k * 0.3, -1.3); }
      else { const k = Math.min(1, (s - 11.5) / 2.5); cam.position.set(-1.6 + k * 0.4, 1.4, -1.2 + k * 0.3); cam.lookAt(0.8, 1.1, 0.2); }
      R.render(scene, cam);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
