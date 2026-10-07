// Aim and use (War and Town Life): no permanent buttons for things in the
// world. Aim at something usable and one prompt appears under the
// crosshair; tap the object or the prompt on a phone, or press E, right
// click or click the prompt on a computer, to use it. Town Life adds its
// own targets (people, horses, doors, bodies) through town.aimTarget().
//   campfire -> crafting   ration crate (your fort) -> food   ladder -> climb
//   crater -> fill it in   raft -> board
// Headquarters rooms (only in one your side holds): medical cabinet -> heal,
// weapon rack -> armory, war-map table -> world map; the basement hatch ->
// climb down.
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
    // one handler for touch, mouse and pen; the first event of a press wins
    // (no double use from the touch and the mouse event of the same tap)
    let last = 0;
    const go = (e) => {
      e.preventDefault(); e.stopPropagation();
      const now = performance.now();
      if (now - last < 350) return;
      last = now; this.use();
    };
    this.el.addEventListener('pointerdown', go);
    this.el.addEventListener('touchstart', go, { passive: false });
    this.el.addEventListener('mousedown', go);
    this.el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    this.timer = 0; this.target = null; this.html = '';
  }
  find() {
    const g = this.game, { eye, dir } = g.aim(), w = g.world;
    if (g.player.car) return null;                          // in a car: only Exit and Lights (the car's own bar)
    const hit = w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, BODY.reach);
    // army cars (War): drive one of your side's
    if (g.vehicles) { const vt = g.vehicles.aimTarget(eye, dir, hit ? hit.dist ?? 99 : 99); if (vt) return vt; }
    // Town Life's own targets (people, horses, bodies, doors) come first
    if (g.town) { const tt = g.town.aimTarget(hit, eye, dir); if (tt) return tt; }
    if (!hit) return null;
    if (hit.id === B.CAMPFIRE) return { a: 'craft', hit };
    if (hit.id === B.SUPPLY) return { a: g.cabin.isChest(hit.x, hit.y, hit.z) ? 'chest' : 'rations', hit };
    if (hit.id === B.LADDER) return { a: hit.y < g.player.pos.y - 0.6 ? 'climbDown' : 'climb', hit };
    if (hit.id === B.MEDICAL) return { a: 'heal', hit };
    if (hit.id === B.ARMORY) return { a: 'armory', hit };
    if (hit.id === B.MAPTABLE) return { a: 'worldmap', hit };
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
      const html = this.target ? (touch ? '' : '<kbd>E</kbd>') + (this.target.label || t('use.' + this.target.a)) : '';
      if (html !== this.html) { this.html = html; this.el.innerHTML = html; this.el.hidden = !html; }
    }
    if (!playing || !this.target) return false;
    if (input.hit('KeyE') || input.thit('tap') || input.mouse.rightPressed) { this.use(); return true; }
    return false;
  }
  use() {
    const g = this.game, T = this.target;
    if (!T || g.paused || g.overlay) return;
    if (T.run) T.run();                                      // Town Life targets
    else if (T.a === 'craft') g.app.openPanel('craft');
    else if (T.a === 'rations' || T.a === 'chest') g.useSupply(T.hit);
    else if (T.a === 'climb') this.climb(T.hit);
    else if (T.a === 'climbDown') this.climbDown(T.hit);
    else if (T.a === 'heal' || T.a === 'armory' || T.a === 'worldmap') this.room(T);
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
  // down the ladder to the floor at its foot (the basement hatch)
  climbDown(hit) {
    const g = this.game, w = g.world, p = g.player;
    let y = hit.y;
    while (w.get(hit.x, y - 1, hit.z) === B.LADDER) y--;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = hit.x + dx, z = hit.z + dz;
      if (w.get(x, y, z) === B.AIR && w.get(x, y + 1, z) === B.AIR && w.solidAt(x, y - 1, z)) { p.pos.set(x + 0.5, y, z + 0.5); p.vel.set(0, 0, 0); sfx.place(); return; }
    }
  }
  // the headquarters rooms serve only the side that holds the HQ
  room(T) {
    const g = this.game, h = T.hit;
    const f = g.forts.fortAt({ x: h.x + 0.5, y: h.y + 0.5, z: h.z + 0.5 });
    if (!f || f.owner !== 'ally') { g.hud.toast(t('hq.notYours')); sfx.error(); return; }
    if (T.a === 'heal') {
      if (g.player.health >= 100) { g.hud.toast(t('hq.healthy')); return; }
      g.player.health = 100; sfx.done(); g.hud.toast(t('hq.healed'), 'pick');
    } else if (T.a === 'armory') g.app.openPanel('armory');
    else if (g.campaign) g.app.openPanel('worldmap', {});
    else g.hud.toast(t('hq.noMap'));
  }
  dispose() { this.el.remove(); }
}
