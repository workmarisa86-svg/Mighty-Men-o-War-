// Settings > Camera view: Third person. The camera sits behind you, a little
// over your right shoulder, and shows your whole character (on foot, on a
// horse, in a car, swimming). It never goes through walls or the ground: it
// slides in closer when something is behind you. The crosshair still aims:
// shots and actions follow the camera's line of sight (starting level with
// you, so nothing between the camera and you gets in the way). The scope,
// the binoculars and the death fall always switch to first person.
// Only your own character is drawn in this view (in lower detail if you
// pick "Lower detail" for weaker phones); it is freed when you go back to
// first person.
import * as THREE from 'three';
import { Character, civLook, setCharacterQuality } from './characters.js';
import { hasGunModel } from './gunmodels.js';
import { SOLID } from './blocks.js';

const DIST = 3.1, SIDE = 0.55, UP = 0.32;
const PROBE = [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.16], [0, -0.16]];
civLook('player', { shirt: 0xb8a888, trousers: 0x3e3a34, vest: 0x5a4632, hat: 'felt', hatColor: 0x4a3a2a, gunbelt: true });

export class ThirdPerson {
  constructor(game) {
    this.game = game; this.rig = null; this.key = ''; this.dist = DIST; this.on = false;
    this.v = new THREE.Vector3(); this.back = new THREE.Vector3(); this.cam = new THREE.Vector3();
  }
  wanted() {
    const g = this.game;
    if (g.dying) return !!this.deathThird;          // a death seen in third person stays in third person
    this.deathThird = false; this.flyRoom = null;
    return g.settings.camera === 'third' && g.scopeView.ease() < 0.02 && !g.scopeView.kind;
  }
  build() {
    const g = this.game, low = g.settings.camDetail === 'low';
    const key = (g.townMode ? 'civ' : g.playerNation()) + (low ? ':low' : '');
    if (this.rig && this.key === key) return;
    this.drop();
    if (low) setCharacterQuality('low');
    this.rig = g.townMode ? new Character('civ', 'player', 1) : new Character(g.playerNation(), 'rifleman', 1);
    if (low) setCharacterQuality(g.settings.quality);
    this.key = key; this.weapon = undefined;
    g.scene.add(this.rig.root);
  }
  drop() { if (this.rig) { this.rig.dispose(); this.rig = null; this.key = ''; } }
  update(dt) {
    const g = this.game, p = g.player;
    this.on = this.wanted();
    g.vm.hidden = this.on;
    if (!this.on) { if (this.rig) { if (g.settings.camera !== 'third') this.drop(); else this.rig.root.visible = false; } return; }
    this.build();
    const R = this.rig; R.root.visible = true;
    // the character: weapon in hand, pose from what you are doing
    const sel = g.selected(), wpn = sel && hasGunModel(sel) ? sel : null;
    if (wpn !== this.weapon) { this.weapon = wpn; R.setWeapon(wpn); }
    const speed = Math.hypot(p.vel.x, p.vel.z), riding = p.riding, car = p.car;
    // swimming: deep water under you (not just wading), held a moment so bobbing at the surface doesn't flip it
    if (p.swimming || (p.inWater && !p.onGround)) this.swimT = 0.5; else this.swimT = Math.max(0, (this.swimT || 0) - dt);
    const swim = this.swimT > 0 && !riding && !car;
    if (g.dying) return this.deathView(dt);
    if (g.knockT > 0) { R.pose({ dead: Math.min(0.6, (g.knockLen - g.knockT) * 2), fallDir: g.knockRoll > 0 ? 1 : -1 }, dt); R.place(p.pos, p.yaw, p.pos.y); }
    else R.pose({ speed: riding || car ? 0 : speed, run: p.running, crouch: p.crouch, swim, ride: !!riding, sit: !!car,
      aim: !!wpn && !riding && !car && !swim && wpn !== 'knife', look: 0, pitch: p.pitch * 0.6, fired: g.shotT > 0.25 }, dt);
    // the knife throw: the arm winds back over the shoulder with the body turned, then whips through
    const kp = g.combat.knifePose();
    if (sel === 'knife' && (kp.charge || kp.swing)) {
      const c = kp.charge, sw = kp.swing;
      R.armR.rotation.x = sw ? -2.8 + 3.3 * sw : -2.8 * c; R.elbowR.rotation.x = -1.2 * (sw ? 1 - sw : c);
      R.body.rotation.y += 0.5 * c - 0.8 * Math.sin(sw * Math.PI);
    }
    if (riding) R.place(riding.saddle(), p.yaw, riding.pos.y);
    else if (car) R.place(this.v.set(p.pos.x, p.pos.y + p.eyeOffset - 1.28, p.pos.z), p.yaw, car.pos.y);
    else R.place(p.pos, p.yaw, p.pos.y);
    // the camera: behind and over the shoulder, pulled in before anything solid
    const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const W = g.world, eye = p.eye(this.v);
    // head room and shoulder room first: in a cell or a tunnel the camera must
    // never start inside a wall or the ceiling (you'd see through the blocks)
    const upWant = UP + (riding ? 0.3 : 0), upHit = W.raycast(eye.x, eye.y, eye.z, 0, 1, 0, upWant + 0.3, false);
    eye.y += upHit ? Math.max(0, upHit.dist - 0.3) : upWant;
    const sideWant = SIDE * (car ? 0.4 : 1), sideHit = W.raycast(eye.x, eye.y, eye.z, rx, 0, rz, sideWant + 0.3, false);
    const side = sideHit ? Math.max(0, sideHit.dist - 0.3) : sideWant;
    eye.x += rx * side; eye.z += rz * side;
    this.back.set(-fx, -fy, -fz);
    const want = car ? DIST + 1.6 : riding ? DIST + 0.8 : DIST;
    // a thick probe (the middle and four rays round it): the view never grazes a wall
    let free = want;
    for (const [ox, oy] of PROBE) {
      const sx = eye.x + rx * ox, sy = eye.y + oy, sz = eye.z + rz * ox;
      const h = W.raycast(sx, sy, sz, this.back.x, this.back.y, this.back.z, want + 0.3, false);
      if (h) free = Math.min(free, h.dist - 0.3);
    }
    free = Math.max(0.2, free);
    this.dist = free < this.dist ? free : this.dist + (free - this.dist) * Math.min(1, dt * 4);    // in at once, out gently
    this.cam.copy(eye).addScaledVector(this.back, this.dist);
    // still inside a block (a corner the rays slipped past): pull in until clear
    for (let k = 0; k < 8 && this.dist > 0.2 && SOLID[W.get(Math.floor(this.cam.x), Math.floor(this.cam.y), Math.floor(this.cam.z))]; k++) {
      this.dist = Math.max(0.2, this.dist - 0.3); this.cam.copy(eye).addScaledVector(this.back, this.dist);
    }
    g.camera.position.copy(this.cam);
    // hide the character when the camera is pressed right up against it
    R.root.visible = this.dist > 0.7;
  }
  // your death in third person: thrown backward in a dramatic back somersault
  // (in the slow motion of the death): a jolt, the body flung up and over
  // backward with arms and legs flailing (joints only bend the way they
  // can), a heavy landing flat on the back with a bounce, then a sprawl.
  // The camera stays and rises to look down on the body.
  deathView(dt) {
    const g = this.game, p = g.player, R = this.rig, D = g.dying, t = D.t;
    R.pose({ dead: 0 }, dt);                       // (hides the gun and the shadow, resets the body)
    const ease = (k) => k * k * (3 - 2 * k), cl = (x) => Math.max(0, Math.min(1, x));
    const JOLT = 0.3, AIR = 1.7, LAND = JOLT + AIR;
    const jolt = cl(t / JOLT), air = cl((t - JOLT) / AIR), after = Math.max(0, t - LAND);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    // how far back there is room to go (a wall stops the flight short)
    if (this.flyRoom == null) {
      const h = g.world.raycast(p.pos.x, p.pos.y + 0.9, p.pos.z, -fx, 0, -fz, 3.2, false, 'bullet');
      this.flyRoom = h ? Math.max(0, h.dist - 0.6) : 2.6;
    }
    const back = Math.min(this.flyRoom, 2.6) * ease(air) + (after > 0 ? Math.min(0.25, after * 0.6) : 0);
    const bounce = after > 0 ? Math.abs(Math.sin(Math.min(after, 0.6) / 0.6 * Math.PI)) * 0.18 * Math.max(0, 1 - after / 0.6) : 0;
    const lift = Math.sin(Math.PI * air) * 1.25 + bounce;
    // the turn: a full circle backward and a quarter more, landing face up
    const spin = ease(air) * (Math.PI * 2 + Math.PI / 2);
    const b = R.body, C = 0.95;                       // spinning about the waist, not the feet
    b.rotation.set(spin - 0.25 * jolt * (1 - air), 0, Math.sin(air * Math.PI) * 0.25);
    // turning about the waist (C up), and coming down to lie on the ground at the end of the flight
    const down = (C - 0.13) * ease(cl((air - 0.72) / 0.28));
    b.position.set(0, C - C * Math.cos(b.rotation.x) + lift - down, -C * Math.sin(b.rotation.x));
    if (air >= 1) { b.rotation.x = Math.PI / 2; b.position.set(0, C - 0.82 + bounce, -C); }
    // limbs: flailing in the air, flung out on landing, slowly settling
    const fl = air > 0 && air < 1 ? 1 : 0, w = t * 13, k = after > 0 ? Math.max(0, 1 - after / 1.2) : 1;
    const settle = (a, rest) => rest + (a - rest) * k;
    const elbow = (x) => Math.max(0.1, Math.min(1.7, x));   // elbows bend forward only
    const knee = (x) => Math.min(-0.05, Math.max(-1.9, x)); // knees bend back only
    if (t < JOLT) {
      // the hit: arms thrown up and out, knees buckle
      R.armL.rotation.set(-2.2 * jolt, 0, -0.5 * jolt); R.armR.rotation.set(-2.4 * jolt, 0, 0.6 * jolt);
      R.elbowL.rotation.x = 0.3; R.elbowR.rotation.x = 0.4;
      R.legL.rotation.set(-0.5 * jolt, 0, -0.05); R.legR.rotation.set(-0.3 * jolt, 0, 0.05);
      R.kneeL.rotation.x = knee(-0.9 * jolt); R.kneeR.rotation.x = knee(-0.7 * jolt);
      R.head.rotation.set(-0.5 * jolt, 0, 0);
    } else {
      R.armL.rotation.set(settle(-2.0 + Math.sin(w) * 1.1 * fl, -2.6), 0, settle(-0.6 - Math.cos(w * 0.8) * 0.6 * fl, -1.1));
      R.armR.rotation.set(settle(-2.2 + Math.sin(w + 2.1) * 1.1 * fl, -2.4), 0, settle(0.6 + Math.cos(w * 0.9 + 1) * 0.6 * fl, 1.2));
      R.elbowL.rotation.x = elbow(settle(0.6 + Math.sin(w * 1.3) * 0.6 * fl, 0.35)); R.elbowR.rotation.x = elbow(settle(0.6 + Math.sin(w * 1.1 + 1) * 0.6 * fl, 0.5));
      R.legL.rotation.set(settle(-0.9 + Math.sin(w * 0.9 + 0.5) * 0.7 * fl, -0.25), 0, settle(-0.15 - Math.abs(Math.sin(w * 0.7)) * 0.25 * fl, -0.25));
      R.legR.rotation.set(settle(-0.7 + Math.sin(w * 1.1 + 2.5) * 0.7 * fl, 0.05), 0, settle(0.15 + Math.abs(Math.cos(w * 0.6)) * 0.25 * fl, 0.3));
      R.kneeL.rotation.x = knee(settle(-1.1 + Math.sin(w * 1.2) * 0.6 * fl, -0.6)); R.kneeR.rotation.x = knee(settle(-0.9 + Math.sin(w * 1.4 + 1) * 0.6 * fl, -0.2));
      R.head.rotation.set(settle(-0.4 + Math.sin(w * 0.7) * 0.3 * fl, -0.2), settle(0, 0.5), 0);
      R.spine.rotation.set(settle(0.25 * fl, 0.05), 0, 0);
    }
    const P = this.v.set(p.pos.x - fx * back, p.pos.y, p.pos.z - fz * back);
    R.place(P, p.yaw, p.pos.y);
    R.root.visible = true;
    // the camera: behind and to the side, rising to look down on the body
    const k2 = Math.min(1, t / 3.2), e = k2 * k2 * (3 - 2 * k2);
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const d = 4.2 + e * 1.0, h = 1.9 + e * 2.4, sd = 2.4 + e * 0.6;
    // off to the side of the flight, so the flip is seen in profile
    this.cam.set(P.x + rx * sd + fx * (d * 0.35), P.y + h, P.z + rz * sd + fz * (d * 0.35));
    const hit = g.world.raycast(P.x, P.y + 1.2, P.z, this.cam.x - P.x, this.cam.y - P.y - 1.2, this.cam.z - P.z, 1, false);
    if (hit && hit.dist < 0.95) this.cam.lerp(this.back.set(P.x, P.y + 1.2, P.z), 1 - hit.dist * 0.9);
    g.camera.position.copy(this.cam);
    g.camera.lookAt(P.x, P.y + 0.6 + lift * 0.6, P.z);
  }
  // where aiming starts: on the camera's line of sight, level with you
  aimOrigin(out) {
    if (!this.on) return null;
    return out.copy(this.game.camera.position).addScaledVector(this.back, -this.dist);
  }
  dispose() { this.drop(); }
}
