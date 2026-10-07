// Weapons: knife (silent melee), pistol, rifle (with bayonet), sniper rifle
// (scope view with right-click or Z), submachine gun, grenades and smoke
// grenades. Ammo is unlimited while you own the weapon.
import * as THREE from 'three';
import { B, BLOCKS } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

export const WEAPONS = {
  knife:  { melee: true, damage: 35, range: 2.6, rate: 0.45, swim: true, reticle: 'dot' },
  pistol: { damage: 30, range: 45, rate: 0.22, spread: 0.012, loud: 30, swim: true, sound: 'pistol', kick: 0.6, reticle: 'cross' },
  // suppressed pistol: heard only very close, no muzzle flash, a little weaker
  spistol: { damage: 26, range: 40, rate: 0.26, spread: 0.013, loud: 5, swim: true, sound: 'suppressed', kick: 0.4, reticle: 'cross', silent: true },
  rifle:  { damage: 70, range: 90, rate: 0.85, spread: 0.004, loud: 45, sound: 'rifle', kick: 1, bayonet: 45, reticle: 'cross' },
  sniper: { damage: 130, range: 170, rate: 1.4, spread: 0.0015, loud: 55, sound: 'sniper', kick: 1.3, scope: true, reticle: 'cross' },
  smg:    { damage: 20, range: 50, rate: 0.09, spread: 0.03, loud: 40, sound: 'smg', kick: 0.35, auto: true, reticle: 'cross' },
  grenade: { throw: true, rate: 0.9, reticle: 'arc' },
  smoke:   { throw: true, rate: 0.9, reticle: 'arc' },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.cool = 0;
    this.swimWarn = 0;
    this.tracers = [];
    const mat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8 });
    for (let i = 0; i < 12; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, mat.clone()); l.visible = false; l.frustumCulled = false;
      game.scene.add(l); this.tracers.push({ l, t: 0 });
    }
    this.tracerI = 0;
  }

  weapon() { return WEAPONS[this.game.selected()] || null; }

  update(dt, input, playing) {
    const g = this.game;
    this.cool -= dt; this.swimWarn -= dt;
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07) * 0.8; if (tr.t <= 0) tr.l.visible = false; }
    const id = g.selected();
    if (!playing) return;
    const W = WEAPONS[id];
    if (!W) return;
    // sniper scope on/off with right-click (or the ZOOM button on phones)
    if (W.scope && (input.mouse.rightPressed || input.thit('place'))) g.scopeView.toggle('sniper');
    const firing = W.auto ? (input.mouse.left || input.tdown('dig'))
      : (input.mouse.leftPressed || input.thit('dig') || ((input.mouse.left || input.tdown('dig')) && W.melee));
    if (firing && this.cool <= 0) {
      if (g.player.swimming && !W.swim) {
        if (this.swimWarn <= 0) { g.hud.toast(t('hud.swimWeapon')); this.swimWarn = 2; }
        return;
      }
      this.cool = W.rate;
      if (W.melee) this.melee(W.damage, W.range, true);
      else if (W.throw) this.throwIt(id);
      else this.shoot(id, W);
    }
    if (W.bayonet && (input.mouse.rightPressed || input.thit('place')) && this.cool <= 0 && !g.player.swimming) {
      this.cool = 0.6;
      this.melee(W.bayonet, 2.9, false);
    }
  }

  // nearest animal or soldier/tank along the ray, closer than maxD
  target(eye, dir, maxD) {
    const g = this.game;
    const a = g.animals.raycast(eye, dir, maxD);
    const e = g.enemies.raycast(eye, dir, a ? a.dist : maxD);
    const v = g.town ? g.town.folk.raycast(eye, dir, (e || a) ? (e || a).dist : maxD) : null;
    return v || e || a;
  }
  applyHit(hit, damage, { silent = false } = {}) {
    const g = this.game;
    if (hit.animal) g.animals.hurt(hit.animal, damage, silent);
    else if (hit.soldier) g.enemies.hurt(hit.soldier, damage, { silent, head: hit.head });
    else if (hit.tank) hit.tank.hurt(damage, false);
    else if (hit.villager) {
      const v = hit.villager, killed = g.town.folk.hurt(v, damage, { silent, head: hit.head });
      g.town.crime(killed ? 'murder' : 'assault', { victim: killed ? null : v, dead: killed ? v : null });
    }
    g.hud.hitMarker(hit.head);
    sfx.hitMark();
  }

  melee(damage, range, silent) {
    const g = this.game;
    g.vm.doSwing();
    sfx.swish();
    const { eye, dir } = g.aim();
    const block = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range, false, 'bullet');
    const hit = this.target(eye, dir, block ? block.dist : range);
    if (hit) { sfx.stab(); this.applyHit(hit, damage, { silent }); }
  }

  throwIt(id) {
    const g = this.game, p = g.player;
    if (!g.has(id)) return;
    if (p.swimming) { g.hud.toast(t('hud.swimWeapon')); return; }
    g.take(id);
    const { eye, dir } = g.aim();
    const vel = dir.clone().multiplyScalar(16).add(new THREE.Vector3(p.vel.x * 0.5, 3, p.vel.z * 0.5));
    g.explosives.throw(id, eye.clone().addScaledVector(dir, 0.5), vel, 'player');
    g.vm.doSwing(); sfx.swish();
    g.hud.dirtyHotbar = true;
  }

  shoot(id, W) {
    const g = this.game, p = g.player;
    const { eye, dir } = g.aim();
    let spread = W.spread;
    if (Math.hypot(p.vel.x, p.vel.z) > 0.5) spread *= 2;
    if (!p.onGround && !p.swimming) spread *= 3;
    if (p.crouch) spread *= 0.6;
    if (g.scopeView.sniper) spread *= 0.3;
    dir.x += (Math.random() - 0.5) * spread * 2; dir.y += (Math.random() - 0.5) * spread * 2; dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    const block = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, W.range, true, 'bullet');
    const maxD = block ? block.dist : W.range;
    const hit = this.target(eye, dir, maxD);
    let end;
    if (hit) {
      end = hit.point;
      this.applyHit(hit, W.damage, { silent: !!W.silent });
    } else {
      end = eye.clone().addScaledVector(dir, maxD);
      if (block) {
        g.particles.burst(end.x, end.y, end.z, BLOCKS[block.id].color, 5, 2, 0.4);
        if (block.id === B.TNT) g.explosives.shootTNT(block.x, block.y, block.z);
        else if (Math.random() < 0.25) sfx.ricochet();
      }
    }
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const start = eye.clone().addScaledVector(right, g.scopeView.sniper ? 0 : 0.18).addScaledVector(dir, 0.6); start.y -= g.scopeView.sniper ? 0.05 : 0.12;
    if (!W.silent) g.shotT = 1.2;          // muzzle flash: you can be seen for a moment
    const tr = this.tracers[this.tracerI++ % this.tracers.length];
    const pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true;
    tr.l.geometry.computeBoundingSphere();
    tr.l.visible = !W.silent; tr.t = 0.07;
    g.vm.doRecoil(W.kick); if (W.silent) g.vm.flashT = 0;   // no muzzle flash
    p.pitch = Math.min(1.55, p.pitch + W.kick * (g.scopeView.sniper ? 0.025 : 0.012));
    sfx.shot(W.sound);
    g.animals.noise(p.pos, W.loud);
    g.enemies.hear(p.pos, W.loud * 1.5);
    if (g.town) g.town.hearShot(p.pos);
  }

  dispose() { for (const tr of this.tracers) { this.game.scene.remove(tr.l); tr.l.geometry.dispose(); } }
}
