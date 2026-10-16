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

const DIST = 3.1, SIDE = 0.55, UP = 0.32;
civLook('player', { shirt: 0xb8a888, trousers: 0x3e3a34, vest: 0x5a4632, hat: 'felt', hatColor: 0x4a3a2a, gunbelt: true });

export class ThirdPerson {
  constructor(game) {
    this.game = game; this.rig = null; this.key = ''; this.dist = DIST; this.on = false;
    this.v = new THREE.Vector3(); this.back = new THREE.Vector3(); this.cam = new THREE.Vector3();
  }
  wanted() {
    const g = this.game;
    return g.settings.camera === 'third' && !g.dying && g.scopeView.ease() < 0.02 && !g.scopeView.kind;
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
    R.pose({ speed: riding || car ? 0 : speed, run: p.running, crouch: p.crouch, swim: p.swimming && !riding, ride: !!riding, sit: !!car,
      aim: !!wpn && !riding && !car && wpn !== 'knife', look: 0, pitch: p.pitch * 0.6, fired: g.shotT > 0.25 }, dt);
    if (riding) R.place(riding.saddle(), p.yaw, riding.pos.y);
    else if (car) R.place(this.v.set(p.pos.x, p.pos.y + p.eyeOffset - 1.28, p.pos.z), p.yaw, car.pos.y);
    else R.place(p.pos, p.yaw, p.pos.y);
    // the camera: behind and over the shoulder, pulled in before anything solid
    const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
    const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const eye = p.eye(this.v); eye.y += UP + (riding ? 0.3 : 0);
    const side = SIDE * (car ? 0.4 : 1);
    eye.x += rx * side; eye.z += rz * side;
    this.back.set(-fx, -fy, -fz);
    const want = car ? DIST + 1.6 : riding ? DIST + 0.8 : DIST;
    const hit = g.world.raycast(eye.x, eye.y, eye.z, this.back.x, this.back.y, this.back.z, want + 0.3, false);
    const free = hit ? Math.max(0.35, hit.dist - 0.3) : want;
    this.dist = free < this.dist ? free : this.dist + (free - this.dist) * Math.min(1, dt * 4);    // in at once, out gently
    this.cam.copy(eye).addScaledVector(this.back, this.dist);
    // never below the ground under the camera
    const bx = Math.floor(this.cam.x), bz = Math.floor(this.cam.z);
    for (let k = 0; k < 3 && g.world.get(bx, Math.floor(this.cam.y - 0.2), bz) && g.world.get(bx, Math.floor(this.cam.y - 0.2), bz) !== 10; k++) this.cam.y += 0.5;
    g.camera.position.copy(this.cam);
    // hide the character when the camera is pressed right up against it
    R.root.visible = this.dist > 0.7;
  }
  // where aiming starts: on the camera's line of sight, level with you
  aimOrigin(out) {
    if (!this.on) return null;
    return out.copy(this.game.camera.position).addScaledVector(this.back, -this.dist);
  }
  dispose() { this.drop(); }
}
