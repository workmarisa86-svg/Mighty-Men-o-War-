// Parachutes (War): the player and soldiers dropped from a plane float down
// under a canopy. The player steers with the normal move controls. Landing
// in water is softest (swim out); trees and rock hurt. By day enemies can
// shoot at someone hanging under a canopy (a small target, hard to hit); at
// night they only spot a drop that lands near a lit headquarters or a
// campfire, or one caught in a light from close by. The plane itself is
// never in the world (it can't be shot).
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { WORLD_H } from './config.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

export const DROP_Y = WORLD_H - 6;          // where the jump starts
const SINK = 3.2;                           // metres a second under the canopy
const MAX_AIR = 12;                         // most soldiers in the air at once

function canopy(color) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.2),
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  dome.scale.y = 0.55; dome.position.y = 3.1; g.add(dome);
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(1.5, 3.1, 0), new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(-1.5, 3.1, 0),
    new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 3.1, 1.5), new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(0, 3.1, -1.5)]),
  new THREE.LineBasicMaterial({ color: 0x2a2a26 }));
  g.add(lines);
  return g;
}

export class Paratroops {
  constructor(game) {
    this.game = game;
    this.air = [];                 // soldiers under canopies
    this.mine = null;              // the player's canopy
  }
  // the player jumps: high above (x, z)
  playerJump(x, z) {
    const g = this.game, p = g.player;
    p.pos.set(x, DROP_Y, z); p.vel.set(0, -2, 0); p.chute = true;
    this.mine = canopy(0x8a8466); g.scene.add(this.mine);
    g.hud.bigMessage(t('para.jump'), t(g.app.input.touch ? 'para.steerTouch' : 'para.steer'));
  }
  // soldiers jump around (x, z), scattered; returns them
  drop(faction, n, x, z, sq, types) {
    const E = this.game.enemies, out = [];
    n = Math.min(n, MAX_AIR - this.air.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 16;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, py = DROP_Y - 2 - Math.random() * 6;
      const s = E.add(faction, (types || ['rifleman', 'gunner', 'grenadier', 'rifleman'])[i % (types ? types.length : 4)], px, py, pz, sq, true);
      s.chute = { vx: (Math.random() - 0.5) * 1.6, vz: (Math.random() - 0.5) * 1.6 };
      s.chuteMesh = canopy(faction === 'enemy' ? 0x6a6a5a : 0x8a8466);
      this.game.scene.add(s.chuteMesh);
      this.air.push(s); out.push(s);
    }
    return out;
  }
  // a canopy over a soldier already placed in the air
  attachCanopy(s) {
    s.chuteMesh = canopy(s.faction === 'enemy' ? 0x6a6a5a : 0x8a8466);
    this.game.scene.add(s.chuteMesh);
  }
  // enemy paratroopers come down near one of your headquarters
  enemyDrop(fort, n) {
    if (n <= 0) return;
    const E = this.game.enemies, a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 15;
    const x = fort.cx + Math.cos(a) * r, z = fort.cz + Math.sin(a) * r;
    const sq = E.newSquad({ x, z }, 'enemy');
    sq.attack = true; sq.mission = true; sq.obj = { fort }; sq.tnt = 3; sq.mode = 'march'; sq.wp = { x, z }; sq.rally = { x, z };
    sq.campaignAttack = true;
    for (const s of this.drop('enemy', n, x, z, sq)) s.setRole('squad');
  }
  // one soldier's descent (called instead of his usual update)
  stepSoldier(s, dt) {
    const E = this.game.enemies;
    s.pos.x += s.chute.vx * dt; s.pos.z += s.chute.vz * dt; s.pos.y -= SINK * dt;
    const gy = E.groundAny ? E.groundAny(s.pos.x, s.pos.z) : null;
    s.chuteMesh.position.set(s.pos.x, s.pos.y, s.pos.z);
    s.speed = 0;
    const wv = gy == null ? E.water(s.pos.x, s.pos.z) : null;
    if (gy != null && s.pos.y <= gy + 0.05) this.landSoldier(s, gy);
    else if (wv && s.pos.y <= wv.y + 0.2) this.landSoldier(s, wv.y);          // a soft landing in the water
    else if (s.pos.y < 2) this.landSoldier(s, s.pos.y);
    E.animate(s, dt);
  }
  landSoldier(s, gy) {
    const g = this.game, w = g.world;
    s.pos.y = gy; s.chute = null;
    this.air = this.air.filter((q) => q !== s);
    if (s.chuteMesh) { g.scene.remove(s.chuteMesh); s.chuteMesh = null; }
    const under = w.get(Math.floor(s.pos.x), Math.floor(gy - 0.5), Math.floor(s.pos.z));
    if (under === B.LEAVES || under === B.LOG) s.hp -= 25;
    else if (under === B.STONE || under === B.RUBBLE || under === B.FORT_WALL) s.hp -= 12;
    if (s.hp <= 0) g.enemies.kill(s, 'fall');
  }
  // the player's descent: steering, landing
  update(dt) {
    const g = this.game, p = g.player;
    for (const s of this.air.slice()) if (!s.alive) { this.air = this.air.filter((q) => q !== s); if (s.chuteMesh) { g.scene.remove(s.chuteMesh); s.chuteMesh = null; } }
    if (!p.chute) return;
    if (this.mine) this.mine.position.set(p.pos.x, p.pos.y + 0.4, p.pos.z);
    if (p.onGround || p.inWater) {
      p.chute = false;
      if (this.mine) { g.scene.remove(this.mine); this.mine = null; }
      const w = g.world, under = w.get(Math.floor(p.pos.x), Math.floor(p.pos.y - 0.4), Math.floor(p.pos.z));
      const tree = [B.LEAVES, B.LOG].includes(under) || [B.LEAVES, B.LOG].includes(w.get(Math.floor(p.pos.x), Math.floor(p.pos.y + 1), Math.floor(p.pos.z)));
      if (p.inWater) g.hud.toast(t('para.water'));
      else if (tree) { g.damage(18, 'fall'); g.hud.toast(t('para.tree'), 'warn'); }
      else if (under === B.STONE || under === B.RUBBLE || under === B.FORT_WALL) { g.damage(10, 'fall'); g.hud.toast(t('para.rock'), 'warn'); }
      else g.hud.toast(t('para.landed'));
      sfx.thump();
    }
  }
  airborne() { return this.air.length + (this.game.player.chute ? 1 : 0); }
  dispose() {
    for (const s of this.air) if (s.chuteMesh) this.game.scene.remove(s.chuteMesh);
    if (this.mine) this.game.scene.remove(this.mine);
  }
}
export { SOLID };
