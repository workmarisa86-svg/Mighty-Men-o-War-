// Weapons: knife (silent melee), pistol, rifle (with bayonet), sniper rifle
// and submachine gun. Ammo is unlimited while you own the weapon.
import * as THREE from 'three';
import { BLOCKS } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

export const WEAPONS = {
  knife:  { melee: true, damage: 35, range: 2.6, rate: 0.45, swim: true, reticle: 'dot' },
  pistol: { damage: 30, range: 45, rate: 0.22, spread: 0.012, loud: 30, swim: true, sound: 'pistol', kick: 0.6, reticle: 'cross' },
  rifle:  { damage: 70, range: 90, rate: 0.85, spread: 0.004, loud: 45, sound: 'rifle', kick: 1, bayonet: 45, reticle: 'cross' },
  sniper: { damage: 130, range: 170, rate: 1.4, spread: 0.0015, loud: 55, sound: 'sniper', kick: 1.3, reticle: 'cross' },
  smg:    { damage: 20, range: 50, rate: 0.09, spread: 0.03, loud: 40, sound: 'smg', kick: 0.35, auto: true, reticle: 'cross' },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.cool = 0;
    this.swimWarn = 0;
    // tracer pool
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
    this.cool -= dt; this.swimWarn -= dt;
    for (const tr of this.tracers) if (tr.t > 0) { tr.t -= dt; tr.l.material.opacity = Math.max(0, tr.t / 0.07) * 0.8; if (tr.t <= 0) tr.l.visible = false; }
    if (!playing) return;
    const id = this.game.selected();
    const W = WEAPONS[id];
    if (!W) return;
    const fire = W.auto ? (input.mouse.left || input.tdown('dig')) : (input.mouse.leftPressed || input.thit('dig') || ((input.mouse.left || input.tdown('dig')) && W.melee));
    if (fire && this.cool <= 0) {
      if (this.game.player.swimming && !W.swim) {
        if (this.swimWarn <= 0) { this.game.hud.toast(t('hud.swimWeapon')); this.swimWarn = 2; }
        return;
      }
      this.cool = W.rate;
      if (W.melee) this.melee(W.damage, W.range, true);
      else this.shoot(id, W);
    }
    // rifle: right click = bayonet thrust
    if (W.bayonet && (input.mouse.rightPressed || input.thit('place')) && this.cool <= 0 && !this.game.player.swimming) {
      this.cool = 0.6;
      this.melee(W.bayonet, 2.9, false);
    }
  }

  melee(damage, range, silent) {
    const g = this.game;
    g.vm.doSwing();
    sfx.swish();
    const { eye, dir } = g.aim();
    const block = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, range);
    const hit = g.animals.raycast(eye, dir, block ? block.dist : range);
    if (hit) {
      sfx.stab();
      g.animals.hurt(hit.animal, damage, silent);
      g.hud.hitMarker();
    }
  }

  shoot(id, W) {
    const g = this.game, p = g.player;
    const { eye, dir } = g.aim();
    // spread grows when moving or jumping, shrinks when crouched
    let spread = W.spread;
    const moving = Math.hypot(p.vel.x, p.vel.z) > 0.5;
    if (moving) spread *= 2;
    if (!p.onGround && !p.swimming) spread *= 3;
    if (p.crouch) spread *= 0.6;
    if (g.zoom) spread *= 0.5;
    dir.x += (Math.random() - 0.5) * spread * 2; dir.y += (Math.random() - 0.5) * spread * 2; dir.z += (Math.random() - 0.5) * spread * 2;
    dir.normalize();
    const block = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, W.range, true);
    const maxD = block ? block.dist : W.range;
    const hit = g.animals.raycast(eye, dir, maxD);
    let end;
    if (hit) {
      end = hit.point;
      g.animals.hurt(hit.animal, W.damage, false);
      g.hud.hitMarker();
      sfx.hitMark();
    } else {
      end = eye.clone().addScaledVector(dir, maxD);
      if (block) {
        const def = BLOCKS[block.id];
        g.particles.burst(end.x, end.y, end.z, def.color, 5, 2, 0.4);
        if (Math.random() < 0.25) sfx.ricochet();
      }
    }
    // tracer from the muzzle (approximate, right of the eye)
    const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const start = eye.clone().addScaledVector(right, 0.18).addScaledVector(dir, 0.6); start.y -= 0.12;
    const tr = this.tracers[this.tracerI++ % this.tracers.length];
    const pos = tr.l.geometry.attributes.position;
    pos.setXYZ(0, start.x, start.y, start.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true;
    tr.l.geometry.computeBoundingSphere();
    tr.l.visible = true; tr.t = 0.07;
    g.vm.doRecoil(W.kick);
    p.pitch = Math.min(1.55, p.pitch + W.kick * 0.012);
    sfx.shot(W.sound);
    g.animals.noise(p.pos, W.loud);
  }

  dispose() { for (const tr of this.tracers) { this.game.scene.remove(tr.l); tr.l.geometry.dispose(); } }
}
