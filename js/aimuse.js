// Aim and use (War): no permanent buttons for things in the world. Aim at
// something usable and one prompt appears under the crosshair; tap the
// object (or the prompt) on a phone, or press E on a computer, to use it.
//   campfire -> crafting   ration crate (your fort) -> food   ladder -> climb
//   crater -> fill it in   raft -> board
import { B } from './blocks.js';
import { BODY } from './config.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

export class AimUse {
  constructor(game) {
    this.game = game;
    this.el = document.createElement('button');
    this.el.id = 'aimprompt'; this.el.hidden = true;
    document.getElementById('hud').appendChild(this.el);
    const go = (e) => { e.preventDefault(); e.stopPropagation(); this.use(); };
    this.el.addEventListener('touchstart', go, { passive: false });
    this.el.addEventListener('mousedown', go);
    this.timer = 0; this.target = null; this.html = '';
  }
  find() {
    const g = this.game, { eye, dir } = g.aim(), w = g.world;
    const hit = w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, BODY.reach);
    if (!hit) return null;
    if (hit.id === B.CAMPFIRE) return { a: 'craft', hit };
    if (hit.id === B.SUPPLY) return { a: 'rations', hit };
    if (hit.id === B.LADDER) return { a: 'climb', hit };
    const crater = g.explosives.craterAt(hit.x, hit.y, hit.z);
    if (crater) return { a: 'fill', hit, crater };
    return null;
  }
  update(dt, input, playing) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.12;
      this.target = playing && !g.scopeView.sniper ? this.find() : null;
      const touch = g.app.input.touch;
      const html = this.target ? (touch ? '' : '<kbd>E</kbd>') + t('use.' + this.target.a) : '';
      if (html !== this.html) { this.html = html; this.el.innerHTML = html; this.el.hidden = !html; }
    }
    if (!playing || !this.target) return false;
    if (input.hit('KeyE') || input.thit('tap')) { this.use(); return true; }
    return false;
  }
  use() {
    const g = this.game, T = this.target;
    if (!T || g.paused || g.overlay) return;
    if (T.a === 'craft') g.app.openPanel('craft');
    else if (T.a === 'rations') g.useSupply();
    else if (T.a === 'climb') this.climb(T.hit);
    else if (T.a === 'fill') { const n = g.explosives.fill(T.crater); if (n) { sfx.place(); g.hud.toast(t('use.filled', { n })); } }
    this.timer = 0;
  }
  // up the ladder to the first standing spot at its top
  climb(hit) {
    const g = this.game, w = g.world, p = g.player;
    let y = hit.y;
    while (w.get(hit.x, y + 1, hit.z) === B.LADDER) y++;
    const top = y + 1;
    // step off onto the platform beside the top of the ladder
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = hit.x + dx, z = hit.z + dz;
      const floor = dx || dz ? top : top;
      if (w.get(x, floor, z) === B.AIR && w.get(x, floor + 1, z) === B.AIR && (dx || dz ? w.solidAt(x, floor - 1, z) : true)) {
        p.pos.set(x + 0.5, floor, z + 0.5); p.vel.set(0, 0, 0); sfx.place(); return;
      }
    }
  }
  dispose() { this.el.remove(); }
}
