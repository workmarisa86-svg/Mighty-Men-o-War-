// Speech bubbles over people's heads (townspeople and soldiers). Nobody's
// voice is ever spoken: each line plays a short mumble or a radio tone.
// A small pool of DOM elements is reused; only bubbles on screen and close
// by are shown.
import * as THREE from 'three';
import { sfx } from './audio.js';

const V = new THREE.Vector3();

export class Bubbles {
  constructor(game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.id = 'bubbles';
    document.getElementById('hud').appendChild(this.root);
    this.pool = [];
    this.active = [];
  }
  // who: anything with .pos (feet) ; opts: { name, dur, kind: 'warn' | 'ally' | '', pitch, tone }
  say(who, text, opts = {}) {
    const g = this.game;
    const d = who.pos.distanceTo(g.camera.position);
    if (d > (opts.range || 32)) return;
    // one bubble per speaker: a new line replaces the old one (element and all)
    this.clearFor(who);
    let el = this.pool.pop();
    if (!el) { el = document.createElement('div'); el.className = 'bubble'; el.appendChild(document.createElement('b')); el.appendChild(document.createElement('span')); }
    el.className = 'bubble ' + (opts.kind || '');
    el.firstChild.textContent = opts.name || '';
    el.firstChild.hidden = !opts.name;
    el.lastChild.textContent = text;
    this.root.appendChild(el);
    this.active.push({ who, el, t: opts.dur || Math.min(6, 2.2 + text.length * 0.05), h: opts.height || 2.25 });
    const vol = Math.max(0.15, 1 - d / 30);
    if (opts.silent) { /* the caller already played a tone */ } else if (opts.tone) sfx.radio(); else sfx.mumble(opts.pitch || 1, Math.min(7, 2 + Math.round(text.length / 9)), vol);
    while (this.active.length > 6) this.drop(this.active[0]);
  }
  drop(b) { b.el.remove(); this.pool.push(b.el); this.active = this.active.filter((x) => x !== b); }
  clearFor(who) { for (const b of this.active.slice()) if (b.who === who) this.drop(b); }
  update(dt) {
    const g = this.game, cam = g.camera;
    for (const b of this.active.slice()) {
      b.t -= dt;
      // gone, faded, or left behind (you walked away / they left the area)
      if (b.t <= 0 || (b.who.alive === false && b.t > 0.5) || b.who.away || b.who.pos.distanceTo(cam.position) > 40) { this.drop(b); continue; }
      V.set(b.who.pos.x, b.who.pos.y + b.h, b.who.pos.z).project(cam);
      if (V.z > 1 || Math.abs(V.x) > 1.1 || Math.abs(V.y) > 1.1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = '';
      b.el.style.transform = `translate(${((V.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-V.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%, -100%)`;
      b.el.style.opacity = Math.min(1, b.t * 2).toFixed(2);
    }
  }
  dispose() { this.root.remove(); this.active = []; this.pool = []; }
}
