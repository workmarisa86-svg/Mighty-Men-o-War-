// Town Life: a painted board with real lettering over the door of every shop
// and public building (Butcher, General Store, Hunting Store, Market,
// Sheriff's Office, Jail, Stable, Hospital), in the game's language. The
// letters use Alfa Slab One, an 1880s-style slab serif shipped with the game
// (fonts/, SIL Open Font License), drawn sharp on a large canvas and kept
// crisp at an angle (mipmaps and anisotropic filtering). Boards are always
// there; the lettering is only made for signs near you (and freed when you
// walk away), and it is redrawn when you change the language.
import * as THREE from 'three';
import { t, getLang } from './i18n.js';

const FONT = 'MMSlab';
let fontReady = null;
function loadFont() {
  if (fontReady) return fontReady;
  fontReady = (async () => {
    try {
      const f = new FontFace(FONT, `url(${new URL('../fonts/alfa-slab-one.woff2', import.meta.url).href})`);
      await f.load(); document.fonts.add(f); return true;
    } catch { return false; }          // the board still shows; the lettering falls back to a serif
  })();
  return fontReady;
}
const KEYS = { hall: 'sign.hall', jail: 'sign.jail', general: 'sign.general', butcher: 'sign.butcher', hunting: 'sign.hunting', market: 'sign.market', stable: 'sign.stable', hospital: 'sign.hospital', land: 'sign.land' };
const NEAR = 42, FAR = 70, H = 0.62, TEXH = 80;       // 160-pixel-high lettering: sharp at street distance, small in memory
const boardMat = new THREE.MeshLambertMaterial({ color: 0x3a2618 });

export class Signs {
  constructor(game, village) {
    this.game = game; this.list = []; this.t = 0; this.lang = getLang();
    this.group = new THREE.Group(); game.scene.add(this.group);
    this.aniso = Math.min(8, game.app.renderer.capabilities.getMaxAnisotropy ? game.app.renderer.capabilities.getMaxAnisotropy() : 1);
    for (const b of village.buildings) if (b.sign && KEYS[b.type]) this.list.push({ b, key: KEYS[b.type], mesh: null, text: null, tex: null, w: 2 });
    loadFont().then(() => { if (!this.disposed) this.build(); });
  }
  // the text's width decides the board's (letters keep their proportions)
  measure(text) {
    const c = Signs.ctx || (Signs.ctx = document.createElement('canvas').getContext('2d'));
    c.font = `${TEXH * 1.12}px ${FONT}, Georgia, serif`;
    return c.measureText(text).width / (TEXH * 2) * H * 0.98 + 0.42;
  }
  build() {
    for (const S of this.list) {
      if (S.mesh) { this.group.remove(S.mesh); S.mesh.children.forEach((m) => m.geometry.dispose()); }
      const text = t(S.key), w = Math.min(3.6, Math.max(1.4, this.measure(text))), sg = S.b.sign;
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, H + 0.06, 0.07), boardMat); g.add(board);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, H - 0.04), new THREE.MeshLambertMaterial({ transparent: true, emissive: 0x2a2014 }));
      plane.position.z = 0.037; plane.visible = false; g.add(plane);
      g.position.set(sg.x, sg.y, sg.z); g.rotation.y = Math.atan2(sg.face[0], sg.face[1]);
      this.group.add(g);
      Object.assign(S, { mesh: g, plane, text, w });
      if (S.tex) { S.tex.dispose(); S.tex = null; }
    }
    this.t = 0;
  }
  // draw the lettering: cream letters with a dark outline, a thin painted border
  draw(S) {
    const ratio = (S.w - 0.04) / (H - 0.04), hgt = TEXH * 2, wid = Math.min(2048, Math.ceil(hgt * ratio / 4) * 4);
    const c = document.createElement('canvas'); c.width = wid; c.height = hgt;
    const x = c.getContext('2d');
    x.fillStyle = '#3a2618'; x.fillRect(0, 0, wid, hgt);
    x.strokeStyle = '#d8c49a'; x.lineWidth = hgt * 0.035; x.strokeRect(hgt * 0.07, hgt * 0.07, wid - hgt * 0.14, hgt - hgt * 0.14);
    const size = hgt * 0.56;
    x.font = `${size}px ${FONT}, Georgia, serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
    let s = size;
    while (x.measureText(S.text).width > wid * 0.88 && s > 10) { s -= 2; x.font = `${s}px ${FONT}, Georgia, serif`; }
    x.lineJoin = 'round'; x.lineWidth = s * 0.08; x.strokeStyle = '#140c06'; x.strokeText(S.text, wid / 2, hgt * 0.53);
    x.fillStyle = '#f2e4c0'; x.fillText(S.text, wid / 2, hgt * 0.53);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.aniso;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
    return tex;
  }
  update(dt) {
    if (!this.list.length || !this.list[0].mesh) return;
    if (getLang() !== this.lang) { this.lang = getLang(); this.build(); }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.5;
    const p = this.game.player.pos;
    for (const S of this.list) {
      const d = Math.hypot(S.b.sign.x - p.x, S.b.sign.z - p.z);
      if (d < NEAR && !S.tex) { S.tex = this.draw(S); S.plane.material.map = S.tex; S.plane.material.needsUpdate = true; S.plane.visible = true; }
      else if (d > FAR && S.tex) { S.plane.visible = false; S.plane.material.map = null; S.tex.dispose(); S.tex = null; }
    }
  }
  dispose() {
    this.disposed = true;
    for (const S of this.list) { if (S.tex) S.tex.dispose(); if (S.mesh) S.mesh.children.forEach((m) => { m.geometry.dispose(); if (m === S.plane) m.material.dispose(); }); }
    this.game.scene.remove(this.group);
  }
}
