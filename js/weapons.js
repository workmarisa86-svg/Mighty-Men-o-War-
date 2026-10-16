// Weapons: knife (silent melee), pistol, rifle (with bayonet), sniper rifle
// (scope view with right-click or Z), submachine gun, grenades and smoke
// grenades. Ammo is unlimited while you own the weapon.
import * as THREE from 'three';
import { B, BLOCKS } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';
import { gunModel } from './gunmodels.js';

const ARC_N = 14;                // dots in the knife's trajectory hint
const KNIFE_HOLD = 1.1;          // seconds of holding for a full-strength throw
// what thrown knives stick in (wood, earth, flesh); anything else (stone, brick, iron) they bounce off
const SOFT = new Set([B.LOG, B.WOOD, B.FENCE, B.HDOOR, B.LADDER, B.THATCH, B.DIRT, B.GRASS, B.MUD, B.SANDBAG, B.FARMLAND, B.PATH, B.CLAY, B.SAND, B.LEAVES]);

export const WEAPONS = {
  knife:  { melee: true, damage: 35, range: 2.6, rate: 0.45, swim: true, reticle: 'dot' },
  pistol: { damage: 45, range: 45, rate: 0.22, spread: 0.012, loud: 30, swim: true, sound: 'pistol', kick: 0.6, reticle: 'cross' },
  // suppressed pistol: heard only very close, no muzzle flash, a little weaker
  spistol: { damage: 40, range: 40, rate: 0.26, spread: 0.013, loud: 5, swim: true, sound: 'suppressed', kick: 0.4, reticle: 'cross', silent: true },
  rifle:  { damage: 95, range: 90, rate: 0.85, spread: 0.004, loud: 45, sound: 'rifle', kick: 1, bayonet: 45, reticle: 'cross' },
  sniper: { damage: 130, range: 170, rate: 1.4, spread: 0.0015, loud: 55, sound: 'sniper', kick: 1.3, scope: true, reticle: 'cross' },
  // Town Life: a double-barrel shotgun: very strong close up, weak far away
  shotgun: { damage: 110, range: 26, rate: 0.5, spread: 0.035, loud: 50, sound: 'shotgun', kick: 1.4, reticle: 'cross', falloff: true, mag: 2, reloadEach: 0.7, period: true },
  // Town Life, the 1870s: a single-action revolver (cocked for every shot,
  // six in the cylinder, reloaded a round at a time through the gate) and a
  // lever-action rifle (levered after every shot, eight in the tube)
  revolver: { damage: 50, range: 45, rate: 0.42, spread: 0.012, loud: 32, swim: true, sound: 'revolver', kick: 0.85, reticle: 'cross', mag: 6, reloadEach: 0.55, period: true },
  lever:    { damage: 90, range: 85, rate: 0.8, spread: 0.005, loud: 45, sound: 'rifle', kick: 1, reticle: 'cross', mag: 8, reloadEach: 0.5, period: true },
  smg:    { damage: 28, range: 50, rate: 0.09, spread: 0.03, loud: 40, sound: 'smg', kick: 0.35, auto: true, reticle: 'cross' },
  grenade: { throw: true, rate: 0.9, reticle: 'arc' },
  smoke:   { throw: true, rate: 0.9, reticle: 'arc' },
};

export class Combat {
  constructor(game) {
    this.game = game;
    this.cool = 0;
    this.swimWarn = 0;
    this.tracers = [];
    this.mag = {};                 // rounds left in each period gun (Town Life)
    this.reload = null;            // a reload in progress: one round at a time
    this.idleT = 0; this.lastId = null; this.cockT = 0; this.leverT = 0;
    this.charge = null; this.throwT = 9;   // the knife: charging a throw, and the throw's swing
    // the knife's charge bar (under the crosshair) and its dotted arc
    this.chargeEl = document.createElement('div'); this.chargeEl.id = 'chargebar'; this.chargeEl.hidden = true;
    this.chargeEl.innerHTML = '<i></i>'; document.getElementById('hud').appendChild(this.chargeEl);
    this.arcPos = new Float32Array(ARC_N * 3);
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3));
    this.arc = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xf4ecd8, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false }));
    this.arc.visible = false; this.arc.frustumCulled = false; game.scene.add(this.arc);
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
    this.updateKnives(dt);
    const id = g.selected();
    this.updatePeriod(dt, id);
    this.updateCharge(dt, input, playing, id);
    if (!playing) return;
    const W = WEAPONS[id];
    if (!W) return;
    if (g.player.car && (W.melee || W.throw)) return;          // in a car only the gun in your hands
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
      if (W.mag && this.ammo(id) <= 0) {
        // out of rounds: the hammer falls on an empty chamber; reload
        sfx.dryFire(); this.cool = 0.35; this.cockT = 0.25;
        if (!this.reload) this.startReload(id, 0.3);
        return;
      }
      if (W.mag) { this.mag[id] = this.ammo(id) - 1; if (this.reload) this.endReload(true); }
      if (W.melee) this.melee(W.damage, W.range, true);
      else if (W.throw) this.throwIt(id);
      else this.shoot(id, W);
    }
    if (firing) this.idleT = 0;
    if (W.bayonet && (input.mouse.rightPressed || input.thit('place')) && this.cool <= 0 && !g.player.swimming) {
      this.cool = 0.6;
      this.melee(W.bayonet, 2.9, false);
    }
  }

  // ---- Town Life's period guns: rounds, cocking, levering, reloading -------------
  ammo(id) { const W = WEAPONS[id]; return W && W.mag ? (this.mag[id] ?? W.mag) : Infinity; }
  // one round at a time: the revolver's gate opens and the ejector knocks out
  // each empty case before a fresh round goes in; the rifle takes rounds
  // through the side gate; the shotgun breaks open for two shells
  startReload(id, delay = 0) {
    const W = WEAPONS[id];
    if (!W || !W.mag || this.ammo(id) >= W.mag) return;
    this.reload = { id, t: -delay, each: W.reloadEach, n: 0 };
    if (id === 'shotgun') sfx.breakOpen(); else if (id === 'revolver') sfx.gate();
  }
  endReload(interrupted = false) {
    const R = this.reload; if (!R) return;
    this.reload = null;
    if (R.id === 'shotgun') sfx.breakClose(); else if (R.id === 'revolver' && !interrupted) { sfx.gate(); this.cockT = 0.3; sfx.cock(); }
  }
  updatePeriod(dt, id) {
    const g = this.game, W = WEAPONS[id];
    if (id !== this.lastId) {
      // drawing a revolver from the belt holster: a creak of leather
      if (id === 'revolver' && g.town) { sfx.leather(); g.vm.holsterT = 0.45; }
      if (this.reload && this.reload.id !== id) this.reload = null;
      this.lastId = id;
    }
    this.cockT = Math.max(0, this.cockT - dt); this.leverT = Math.max(0, this.leverT - dt);
    this.idleT += dt;
    const R = this.reload;
    if (R) {
      R.t += dt;
      if (R.t >= R.each) {
        R.t -= R.each; R.n++;
        this.mag[R.id] = this.ammo(R.id) + 1;
        if (R.id === 'revolver') sfx.eject();
        sfx.shellIn();
        if (this.ammo(R.id) >= WEAPONS[R.id].mag) this.endReload();
      }
    } else if (W && W.mag && this.ammo(id) < W.mag && this.idleT > 1.8) this.startReload(id);   // topping up when you stop shooting
    // the hand animation: cocking, levering, the reload pose, the round going in
    const v = g.vm.anim;
    v.reload += ((R ? 1 : 0) - v.reload) * Math.min(1, dt * 8);
    v.round = R && R.t > 0 ? Math.sin(Math.min(1, R.t / R.each) * Math.PI) : 0;
    v.cock = this.cockT > 0 ? Math.sin((1 - this.cockT / 0.3) * Math.PI) : 0;
    v.lever = this.leverT > 0 ? Math.sin((1 - this.leverT / 0.4) * Math.PI) : 0;
    v.cyl = (v.cyl || 0) + ((this.cylTarget || 0) - (v.cyl || 0)) * Math.min(1, dt * 18);
  }

  // ---- the knife: tap to throw, hold to throw harder ---------------------------
  updateCharge(dt, input, playing, id) {
    const g = this.game, held = input.mouse.right || input.tdown('place');
    this.throwT += dt;
    if (id !== 'knife' || !playing || g.player.swimming || g.player.car || !g.has('knife')) { if (this.charge) this.cancelCharge(); return; }
    if (!this.charge) {
      if ((input.mouse.rightPressed || input.thit('place')) && !g.townKey && this.cool <= 0) this.charge = { t: 0 };
      return;
    }
    const C = this.charge; C.t += dt;
    const k = this.chargeK();
    if (C.t > 0.14) { this.chargeEl.hidden = false; this.chargeEl.firstChild.style.width = Math.round(k * 100) + '%'; this.chargeEl.classList.toggle('full', k >= 1); }
    if (k > 0.04) this.drawArc(k); else this.arc.visible = false;
    if (!held) { this.throwKnife(k); this.cancelCharge(); this.cool = 0.75; }
  }
  chargeK() { return this.charge ? Math.min(1, Math.max(0, (this.charge.t - 0.14) / KNIFE_HOLD)) : 0; }
  cancelCharge() { this.charge = null; this.chargeEl.hidden = true; this.arc.visible = false; }
  // where a throw at this strength would go (the same physics as the knife)
  knifeLaunch(k) {
    const g = this.game, p = g.player, { eye, dir } = g.aim();
    const pos = eye.clone().addScaledVector(dir, 0.6);
    const vel = dir.clone().multiplyScalar(16 + 13 * k).add(new THREE.Vector3(p.vel.x * 0.5, 1.0 + 1.4 * k, p.vel.z * 0.5));
    return { pos, vel, dir };
  }
  drawArc(k) {
    const w = this.game.world, { pos, vel } = this.knifeLaunch(k), a = this.arcPos;
    let n = 0;
    for (let i = 0; i < ARC_N; i++) {
      const dt = 0.055;
      vel.y -= 14 * dt; pos.addScaledVector(vel, dt);
      if (w.get(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z))) break;
      if (i >= 2) { a[n * 3] = pos.x; a[n * 3 + 1] = pos.y; a[n * 3 + 2] = pos.z; n++; }
    }
    this.arc.geometry.setDrawRange(0, n); this.arc.geometry.attributes.position.needsUpdate = true;
    this.arc.visible = n > 0;
  }
  // the throw's pose for the hands and the third-person body: wind-up (charge 0..1), then the swing (0..1)
  knifePose() { return { charge: this.charge ? Math.min(1, 0.3 + this.chargeK() * 0.7) : 0, swing: this.throwT < 0.45 ? this.throwT / 0.45 : 0 }; }

  // nearest animal or soldier/tank along the ray, closer than maxD
  target(eye, dir, maxD) {
    const g = this.game;
    const a = g.animals.raycast(eye, dir, maxD);
    const e = g.enemies.raycast(eye, dir, a ? a.dist : maxD);
    const v = g.town ? g.town.folk.raycast(eye, dir, (e || a) ? (e || a).dist : maxD) : null;
    const h = g.horses ? g.horses.raycast(eye, dir, (v || e || a) ? (v || e || a).dist : maxD) : null;
    const c = g.vehicles ? g.vehicles.raycast(eye, dir, (h || v || e || a) ? (h || v || e || a).dist : maxD) : null;
    return c || h || v || e || a;
  }
  applyHit(hit, damage, { silent = false } = {}) {
    const g = this.game;
    if (hit.car) g.vehicles.hurt(hit.car, damage * 0.5);
    else if (hit.horse) g.horses.hurt(hit.horse, damage, 'player');
    else if (hit.animal) g.animals.hurt(hit.animal, damage, silent);
    else if (hit.soldier) g.enemies.hurt(hit.soldier, damage, { silent, head: hit.head });
    else if (hit.tank) hit.tank.hurt(damage, false);
    else if (hit.villager) {
      const v = hit.villager, killed = g.town.folk.hurt(v, damage, { silent, head: hit.head });
      if (!(g.town.duels && g.town.duels.playerHit(v, killed))) g.town.crime(killed ? 'murder' : 'assault', { victim: killed ? null : v, dead: killed ? v : null });
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

  // A thrown knife spins end over end along a falling arc (a tap: a normal
  // throw; held: faster, farther and harder, up to a full charge). It hits the
  // first person, animal or horse in its path and sticks in the body, sticks
  // in wood or earth, or glances off stone, brick and iron; then it lies
  // there until you walk over it and pick it up. Quiet: in War it is a silent kill.
  throwKnife(k = 0) {
    const g = this.game;
    if (!g.has('knife')) return;
    g.take('knife'); g.hud.dirtyHotbar = true;
    const { pos, vel, dir } = this.knifeLaunch(k);
    const mesh = gunModel('knife'); mesh.scale.setScalar(1.3); g.scene.add(mesh);
    const kn = { mesh, pos, vel, spin: 0, yaw: Math.atan2(dir.x, dir.z) + Math.PI, flying: true, t: 0, dmg: 55 + 30 * k, bounces: 0 };
    mesh.position.copy(kn.pos);
    (this.knives || (this.knives = [])).push(kn);
    this.throwT = 0; g.vm.doSwing(); sfx.swish(); if (k > 0.5) sfx.swish();
  }
  updateKnives(dt) {
    const L = this.knives, g = this.game;
    if (!L || !L.length) return;
    const d = new THREE.Vector3(), p = g.player.pos;
    for (const k of L.slice()) {
      k.t += dt;
      if (k.flying) {
        k.vel.y -= 14 * dt;
        const step = k.vel.length() * dt; d.copy(k.vel).normalize();
        const block = g.world.raycast(k.pos.x, k.pos.y, k.pos.z, d.x, d.y, d.z, step, false, 'bullet');
        const hit = k.bounces ? null : this.target(k.pos, d, block ? block.dist : step);
        if (hit) {
          this.applyHit(hit, k.dmg, { silent: true }); sfx.stab();
          k.flying = false; k.pos.copy(hit.point || k.pos.clone().addScaledVector(d, hit.dist || 0));
          // stuck in the body: it rides along with an animal, and stays in a fallen person
          const body = hit.animal ? hit.animal.mesh : hit.horse ? hit.horse.mesh : null;
          if (body && body.parent) { body.updateMatrixWorld(true); k.stuckIn = body; k.local = body.worldToLocal(k.pos.clone()); k.localYaw = k.yaw - body.rotation.y; }
          else if (hit.villager || hit.soldier) { k.stuckPerson = hit.villager || hit.soldier; k.local = k.pos.clone().sub(k.stuckPerson.pos); }
          else k.drop = true;
          k.mesh.rotation.set(0, k.yaw, 0); k.mesh.rotateX(-0.3);
        } else if (block) {
          const soft = SOFT.has(block.id);
          if (soft || k.bounces >= 2 || k.vel.length() < 5) {
            k.pos.addScaledVector(d, Math.max(0, block.dist - (soft ? 0.06 : 0.12))); k.flying = false;
            if (soft) { sfx.thunk(); k.mesh.rotation.set(0, 0, 0); k.mesh.rotation.y = k.yaw; k.mesh.rotateX(-Math.atan2(-d.y, Math.hypot(d.x, d.z))); }   // stuck in, point first
            else k.drop = true;
          } else {
            // glances off stone: reflect off the face it hit, losing most of its speed
            k.pos.addScaledVector(d, Math.max(0, block.dist - 0.05));
            const n = new THREE.Vector3(block.nx || 0, block.ny || 0, block.nz || 0), vd = k.vel.dot(n);
            k.vel.addScaledVector(n, -2 * vd).multiplyScalar(0.35); k.bounces++; sfx.clang();
            g.particles.burst(k.pos.x, k.pos.y, k.pos.z, [0.9, 0.85, 0.6], 4, 2, 0.25);
          }
        } else { k.pos.addScaledVector(d, step); k.spin += dt * (18 + k.vel.length() * 0.6); }
        if (k.flying) { k.yaw = Math.atan2(k.vel.x, k.vel.z) + Math.PI; k.mesh.rotation.set(0, k.yaw, 0); k.mesh.rotateX(-k.spin); }
        if (k.t > 6) { k.flying = false; k.drop = true; }
      } else if (k.stuckIn) {
        if (!k.stuckIn.parent) { k.stuckIn = null; k.drop = true; }
        else { k.pos.copy(k.local); k.stuckIn.localToWorld(k.pos); k.mesh.rotation.set(0, k.stuckIn.rotation.y + k.localYaw, 0); k.mesh.rotateX(-0.3); }
      } else if (k.stuckPerson) {
        const v = k.stuckPerson;
        if (v.alive === false || v.dead) { k.stuckPerson = null; k.pos.set(v.pos.x + k.local.x * 0.5, v.pos.y + 0.25, v.pos.z + k.local.z * 0.5); k.mesh.rotation.set(-1.2, k.yaw, 0); }   // in the fallen body
        else { k.stuckPerson = null; k.drop = true; }      // a wounded person pulls it out: it falls
      } else if (k.drop) {
        // fallen beside its target: drop to the ground and lie flat
        const y = g.world.surfaceY(Math.floor(k.pos.x), Math.floor(k.pos.z)) + 1.02;
        k.pos.y = Math.max(y, k.pos.y - dt * 6); if (k.pos.y <= y + 0.001) k.drop = false;
        k.mesh.rotation.set(0, k.yaw, Math.PI / 2);
      }
      k.mesh.position.copy(k.pos);
      // pick it back up (walk over it, or up to a body it is in), or it is lost after a few minutes
      if (!k.flying && Math.hypot(k.pos.x - p.x, k.pos.z - p.z) < 1.6 && Math.abs(k.pos.y - p.y - 0.5) < 2) {
        g.give('knife', 1); g.hud.dirtyHotbar = true; sfx.pick && sfx.pick(); this.dropKnife(k);
      } else if (k.t > 300) this.dropKnife(k);
    }
  }
  dropKnife(k) { this.game.scene.remove(k.mesh); this.knives = this.knives.filter((x) => x !== k); }

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
      const dmg = W.falloff ? W.damage * Math.max(0.15, 1 - (hit.dist || 0) / W.range) : W.damage;   // shotgun: strong close up
      this.applyHit(hit, dmg, { silent: !!W.silent });
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
    if (W.period) {
      // black powder: a puff of white smoke at the muzzle; then cock the hammer or work the lever
      const mz = eye.clone().addScaledVector(dir, 0.9).addScaledVector(right, 0.14); mz.y -= 0.1;
      g.particles.burst(mz.x, mz.y, mz.z, [0.86, 0.86, 0.84], 7, 0.8, 1.1, -0.6);
      if (id === 'revolver') { this.cockT = 0.3; this.cylTarget = (this.cylTarget || 0) + Math.PI / 3; setTimeout(() => sfx.cock(), 140); }
      if (id === 'lever') { this.leverT = 0.4; setTimeout(() => sfx.lever(), 160); }
    }
    p.pitch = Math.min(1.55, p.pitch + W.kick * (g.scopeView.sniper ? 0.025 : 0.012));
    sfx.shot(W.sound);
    g.animals.noise(p.pos, W.loud);
    g.enemies.hear(p.pos, W.loud * 1.5);
    if (g.town) g.town.hearShot(p.pos);
  }

  dispose() { this.game.scene.remove(this.arc); this.arc.geometry.dispose(); this.chargeEl.remove(); for (const tr of this.tracers) { this.game.scene.remove(tr.l); tr.l.geometry.dispose(); } for (const k of this.knives || []) this.game.scene.remove(k.mesh); this.knives = []; }
}
