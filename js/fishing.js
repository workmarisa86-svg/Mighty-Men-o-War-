// Town Life fishing. With a fishing rod in hand, aim at a river or a lake
// (up to 16 m away) and use it to cast: the bobber floats where it lands.
// Wait (fish bite sooner at dawn and dusk), and when the bobber dips and
// splashes ("A bite!") use the rod again within a second and a half to reel
// it in: usually a fish, sometimes a big pike. Too early and you pull up an
// empty hook; too late and it gets away (wait for the next one). Walking far
// off or putting the rod away pulls the line in. Frozen water can't be fished.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

const RANGE = 16, BITE = 1.5;

export class Fishing {
  constructor(game) {
    this.game = game; this.state = null;
    this.bob = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xd02a20 }));
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xf0ece0 }));
    this.bob.add(top, bot); this.bob.visible = false;
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe8e8e0, transparent: true, opacity: 0.7 }));
    this.line.visible = false; this.line.frustumCulled = false;
    game.scene.add(this.bob, this.line);
    this.tip = new THREE.Vector3();
  }
  // the rod is used (right click / USE / tap the prompt): cast, or reel in
  use(eye, dir) {
    const g = this.game, S = this.state;
    if (S && S.phase === 'bite') { this.catchFish(); return true; }
    if (S) { this.reelIn(t('fish.tooEarly')); return true; }
    const w = g.world;
    let at = null;
    for (let d = 1.5; d <= RANGE; d += 0.2) {
      const x = eye.x + dir.x * d, y = eye.y + dir.y * d, z = eye.z + dir.z * d, b = w.get(Math.floor(x), Math.floor(y), Math.floor(z));
      // on the water, or skimming just over it (a forgiving aim)
      if (b === B.WATER || (d > 3 && dir.y < 0 && !SOLID[b] && w.get(Math.floor(x), Math.floor(y) - 1, Math.floor(z)) === B.WATER)) { at = { x, y: b === B.WATER ? y : Math.floor(y) - 0.5, z }; break; }
      if (b === B.ICE) { g.hud.toast(t('fish.frozen')); sfx.error(); return true; }
      if (SOLID[b]) break;
    }
    if (!at) { g.hud.toast(t('fish.where')); sfx.error(); return true; }
    const fx = Math.floor(at.x), fz = Math.floor(at.z);
    let top = Math.floor(at.y);
    while (w.get(fx, top + 1, fz) === B.WATER) top++;
    // fish bite sooner at dawn and dusk, slower at midday and in winter
    const h = (g.time % 1) * 24, golden = (h > 5 && h < 8.5) || (h > 18 && h < 21);
    const wait = (3 + Math.random() * 9) * (golden ? 0.6 : 1) * (g.town && g.town.season === 'winter' ? 1.4 : 1);
    this.state = { phase: 'wait', pos: new THREE.Vector3(at.x, top + 0.97, at.z), t: 0, wait, biteT: 0, misses: 0 };
    this.bob.position.copy(this.state.pos); this.bob.visible = true; this.line.visible = true;
    sfx.swish(); setTimeout(() => sfx.swim(), 350);
    g.vm.doSwing();
    g.hud.toast(t('fish.cast'));
    return true;
  }
  reelIn(msg) {
    this.state = null; this.bob.visible = false; this.line.visible = false;
    if (msg) this.game.hud.toast(msg);
  }
  catchFish() {
    const g = this.game, big = Math.random() < 0.16;
    const id = big ? 'big_fish' : 'fish';
    g.give(id, 1, true); g.hud.dirtyHotbar = true;
    if (g.town) g.town.st.fish = (g.town.st.fish || 0) + 1;
    g.particles.burst(this.state.pos.x, this.state.pos.y, this.state.pos.z, [0.6, 0.72, 0.8], 12, 2.5, 0.6);
    sfx.splash(); sfx.done(); g.vm.doSwing();
    this.reelIn(); g.hud.toast(t(big ? 'fish.caughtBig' : 'fish.caught'), 'pick');
  }
  update(dt) {
    const S = this.state, g = this.game;
    if (!S) return;
    const p = g.player.pos;
    if (g.selected() !== 'rod' || Math.hypot(S.pos.x - p.x, S.pos.z - p.z) > RANGE + 4 || g.player.riding) { this.reelIn(); return; }
    S.t += dt;
    // the bobber rides the ripples; it dips hard on a bite
    const dip = S.phase === 'bite' ? -0.12 + Math.sin(S.t * 30) * 0.05 : Math.sin(S.t * 2.4) * 0.02;
    this.bob.position.set(S.pos.x, S.pos.y + dip, S.pos.z);
    if (S.phase === 'wait' && S.t >= S.wait) {
      S.phase = 'bite'; S.biteT = BITE; sfx.splash();
      g.particles.burst(S.pos.x, S.pos.y, S.pos.z, [0.6, 0.72, 0.8], 6, 1.5, 0.4);
      g.hud.toast(t(g.app.input.touch ? 'fish.biteTouch' : 'fish.bite'), 'warn');
    } else if (S.phase === 'bite' && (S.biteT -= dt) <= 0) {
      // it got away: wait for the next one
      S.phase = 'wait'; S.t = 0; S.wait = 3 + Math.random() * 7; S.misses++;
      g.hud.toast(t('fish.away'));
    }
    // the line from the rod's tip (ahead of you, a little to the right) to the bobber
    const eye = g.player.eye(this.tip), yaw = g.player.yaw;
    this.tip.set(eye.x - Math.sin(yaw) * 0.9 + Math.cos(yaw) * 0.25, eye.y + 0.25, eye.z - Math.cos(yaw) * 0.9 - Math.sin(yaw) * 0.25);
    const a = this.line.geometry.attributes.position;
    a.setXYZ(0, this.tip.x, this.tip.y, this.tip.z); a.setXYZ(1, this.bob.position.x, this.bob.position.y + 0.05, this.bob.position.z); a.needsUpdate = true;
  }
  dispose() { this.game.scene.remove(this.bob, this.line); }
}
