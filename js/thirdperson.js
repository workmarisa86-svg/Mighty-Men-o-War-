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
    this.deathThird = false;
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
  // your death in third person, as in the films: shot from in front you are
  // thrown back, from behind you pitch forward (a jolt, then the body topples,
  // faster and faster, and hits the ground with a small bounce); killed by an
  // animal you sink to your knees first, then go down on your back or chest.
  // Knees and elbows only bend the way they can. The camera stays and rises.
  deathView(dt) {
    const g = this.game, p = g.player, R = this.rig, D = g.dying, t = D.t;
    R.pose({ dead: 0 }, dt);                       // (hides the gun and the shadow, resets the body)
    const cl = (x) => Math.max(0, Math.min(1, x)), ease = (k) => k * k * (3 - 2 * k);
    const dir = D.back ? 1 : -1;                   // +: over backward (face up), -: forward (onto the chest)
    const KNEE = D.knees ? 0.75 : 0, START = D.knees ? 0.85 : 0.14, FALL = 0.8;
    const kneel = D.knees ? ease(cl(t / KNEE)) : 0;
    const jolt = D.knees ? 0 : Math.sin(cl(t / START) * Math.PI);           // the hit
    const f = cl((t - START) / FALL), fall = f * f;                          // gravity: slow, then fast
    const after = Math.max(0, t - START - FALL);
    const bounce = after > 0 ? Math.sin(cl(after / 0.3) * Math.PI) * 0.09 * (1 - cl(after / 0.3)) : 0;
    // the turn about the feet (standing) or the knees (kneeling)
    const a = dir * (Math.PI / 2 - 0.06) * fall - dir * 0.18 * jolt;
    const h = 0.47 * kneel;                        // kneeling: the body is a shin's length lower
    const py = 0.05 * kneel, H = py + h;
    const b = R.body;
    b.rotation.set(a, 0, 0.05 * dir * fall);
    b.position.set(0, py - H * Math.cos(a) + bounce * (1 - kneel * 0.5), -H * Math.sin(a));
    // legs: kneeling folds them under; standing, they give way as he goes
    const kneeL = Math.min(-0.05, -(1.65 * kneel + (1 - kneel) * (0.25 + 0.35 * fall + 0.2 * jolt)));
    const kneeR = Math.min(-0.05, -(1.55 * kneel + (1 - kneel) * (0.15 + 0.2 * fall)));
    R.legL.rotation.set(dir > 0 ? -0.35 * fall * (1 - kneel) : 0.15 * fall, 0, -0.08 - 0.08 * fall);
    R.legR.rotation.set(dir > 0 ? -0.1 * fall * (1 - kneel) : 0.25 * fall, 0, 0.08 + 0.1 * fall);
    R.kneeL.rotation.x = kneeL; R.kneeR.rotation.x = kneeR;
    // arms: flung out by the hit and the fall (forward: they come up to break it)
    const fling = Math.max(jolt, Math.sin(cl(f) * Math.PI) * 0.8, kneel * (1 - f) * 0.4);
    if (dir > 0) {
      R.armL.rotation.set(-0.6 - 1.4 * fling - 0.9 * fall, 0, -0.35 - 0.5 * fall);
      R.armR.rotation.set(-0.4 - 1.6 * fling - 0.7 * fall, 0, 0.4 + 0.6 * fall);
    } else {
      R.armL.rotation.set(-0.4 - 1.1 * fall, 0, -0.25 - 0.25 * fling);
      R.armR.rotation.set(-0.5 - 0.9 * fall, 0, 0.3 + 0.2 * fling);
    }
    R.elbowL.rotation.x = Math.max(0.1, 0.3 + 0.5 * fling * (dir > 0 ? 0.5 : 1));
    R.elbowR.rotation.x = Math.max(0.1, 0.4 + 0.4 * fling);
    R.spine.rotation.set(-0.25 * dir * jolt + 0.1 * kneel * (1 - f), 0, 0);
    R.head.rotation.set((dir > 0 ? -0.5 : 0.35) * fall + 0.3 * kneel * (1 - f) - 0.3 * dir * jolt, 0.35 * fall, 0);
    R.place(p.pos, p.yaw, p.pos.y);
    R.root.visible = true;
    // the camera: behind and to the side, rising to look down on the body
    const k2 = Math.min(1, t / 3.2), e = k2 * k2 * (3 - 2 * k2);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const d = 3.4 + e * 1.0, hh = 1.7 + e * 2.2, sd = 1.6 + e * 0.8;
    this.cam.set(p.pos.x - fx * d * 0.6 + rx * sd, p.pos.y + hh, p.pos.z - fz * d * 0.6 + rz * sd);
    const hit = g.world.raycast(p.pos.x, p.pos.y + 1.2, p.pos.z, this.cam.x - p.pos.x, this.cam.y - p.pos.y - 1.2, this.cam.z - p.pos.z, 1, false);
    if (hit && hit.dist < 0.95) this.cam.lerp(this.back.set(p.pos.x, p.pos.y + 1.2, p.pos.z), 1 - hit.dist * 0.9);
    g.camera.position.copy(this.cam);
    // look at the body where it lands (forward or back of the feet)
    g.camera.lookAt(p.pos.x + fx * -dir * 0.8 * fall, p.pos.y + 0.6 - 0.3 * fall, p.pos.z + fz * -dir * 0.8 * fall);
  }
  // where aiming starts: on the camera's line of sight, level with you
  aimOrigin(out) {
    if (!this.on) return null;
    return out.copy(this.game.camera.position).addScaledVector(this.back, -this.dist);
  }
  dispose() { this.drop(); }
}
