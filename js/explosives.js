// TNT, grenades, smoke grenades and tank shells.
// TNT destroys terrain and player-built blocks, never built-in structures.
import * as THREE from 'three';
import { SEA } from './config.js';
import { B, BLOCKS, SOLID } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

export const TNT_RADIUS = 4;
export const TNT_POWER = 220;
const GRENADE = { radius: 3.5, power: 95, fuse: 3 };
const SHELL = { radius: 2.2, power: 55 };

let smokeTex = null;
function makeSmokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Explosives {
  constructor(game) {
    this.game = game;
    this.lit = new Map();        // world index -> {x,y,z,t,owner,mesh,warned}
    this.hits = new Map();       // world index -> bullet hits on a TNT crate
    this.projectiles = [];       // grenades, smoke grenades, shells
    this.smokes = [];
    this.flashLight = new THREE.PointLight(0xffb060, 0, 40, 1.2);
    game.scene.add(this.flashLight);
    this.blinkMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    this.boxGeo = new THREE.BoxGeometry(1.03, 1.03, 1.03);
    this.gMat = new THREE.MeshLambertMaterial({ color: 0x4c5338 });
    this.sMat = new THREE.MeshLambertMaterial({ color: 0x6a6e66 });
    this.shellMat = new THREE.MeshBasicMaterial({ color: 0xffd080 });
    if (!smokeTex) smokeTex = makeSmokeTex();
  }

  key(x, y, z) { return this.game.world.idx(x, y, z); }

  // ------------------------------------------------------------------ TNT
  igniteTNT(x, y, z, fuse, owner = 'player') {
    const w = this.game.world;
    if (w.get(x, y, z) !== B.TNT) return;
    const k = this.key(x, y, z);
    const cur = this.lit.get(k);
    if (cur) { cur.t = Math.min(cur.t, fuse); return; }
    const mesh = new THREE.Mesh(this.boxGeo, this.blinkMat.clone());
    mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.game.scene.add(mesh);
    this.lit.set(k, { x, y, z, t: fuse, total: fuse, owner, mesh, defuse: 0, rolled: false });
    sfx.ignite();
    if (owner === 'enemy') this.game.onEnemyTNT(x, y, z);
  }
  // Shooting a crate: it takes a couple of hits to set it off.
  shootTNT(x, y, z) {
    const k = this.key(x, y, z);
    const n = (this.hits.get(k) || 0) + 1;
    this.hits.set(k, n);
    if (n >= 2) { this.hits.delete(k); this.igniteTNT(x, y, z, 0.25, 'shot'); }
  }
  unlight(k) {
    const l = this.lit.get(k);
    if (!l) return;
    this.game.scene.remove(l.mesh); l.mesh.material.dispose();
    this.lit.delete(k);
  }
  litNear(pos, range) {
    let best = null, bd = range;
    for (const l of this.lit.values()) {
      const d = Math.hypot(l.x + 0.5 - pos.x, l.y + 0.5 - pos.y - 0.9, l.z + 0.5 - pos.z);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  // ------------------------------------------------------------- blasts
  // Remove a block (unless indestructible). Still water stays still: a hole
  // under or beside the water line becomes water, nothing flows.
  clearBlock(x, y, z) {
    const w = this.game.world;
    const id = w.get(x, y, z);
    if (id === B.AIR || id === B.WATER || id === B.BEDROCK || w.isLocked(x, y, z) || !w.inside(x, y, z)) return;
    if (id === B.TNT) { this.igniteTNT(x, y, z, 0.15 + Math.random() * 0.35, 'chain'); return; }
    let wet = w.get(x, y + 1, z) === B.WATER;
    if (!wet && y === SEA - 1) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.get(x + dx, y, z + dz) === B.WATER) wet = true;
    w.set(x, y, z, wet ? B.WATER : B.AIR);
  }

  explode(cx, cy, cz, { radius, power, destroy = true, owner = 'player', destroyRadius = radius }) {
    const g = this.game, w = g.world;
    if (destroy) {
      const R = Math.ceil(destroyRadius);
      for (let y = -R; y <= R; y++) for (let z = -R; z <= R; z++) for (let x = -R; x <= R; x++) {
        const d = Math.hypot(x, y, z);
        if (d > destroyRadius + (Math.random() - 0.5) * 0.8) continue;
        const bx = Math.floor(cx + x), by = Math.floor(cy + y), bz = Math.floor(cz + z);
        const id = w.get(bx, by, bz);
        if (id !== B.AIR && id !== B.WATER && Math.random() < 0.08) {
          g.particles.burst(bx + 0.5, by + 0.5, bz + 0.5, BLOCKS[id].color, 3, 7, 1.2);
        }
        this.clearBlock(bx, by, bz);
      }
    }
    const center = new THREE.Vector3(cx, cy, cz);
    const reach = radius * 1.8;
    const falloff = (d) => d >= reach ? 0 : power * Math.pow(1 - d / reach, 1.3);
    // player
    const pp = g.player.pos.clone(); pp.y += 0.9;
    const dp = pp.distanceTo(center);
    if (dp < reach) {
      g.damage(falloff(dp) * (owner === 'enemy' ? g.enemies.dmgScale() : 1), 'combat', center);
      const push = new THREE.Vector3().subVectors(pp, center).normalize().multiplyScalar(10 * (1 - dp / reach));
      g.player.vel.add(push); g.player.vel.y += 4 * (1 - dp / reach);
    }
    g.enemies.blast(center, reach, falloff, owner);
    for (const a of g.animals.list) {
      const d = a.pos.distanceTo(center);
      if (d < reach) g.animals.hurt(a, falloff(d), false);
    }
    g.animals.noise(center, 70);
    g.enemies.hear(center, 60);
    // effects
    g.particles.burst(cx, cy, cz, [1, 0.62, 0.2], 40, 9, 0.6, 2);
    g.particles.burst(cx, cy, cz, [0.25, 0.23, 0.21], 50, 5, 2.5, -1);
    g.particles.burst(cx, cy, cz, [0.45, 0.36, 0.26], 30, 10, 1.5, 18);
    this.flashLight.position.copy(center); this.flashLight.intensity = 60;
    const dist = g.camera.position.distanceTo(center);
    sfx.explosion(Math.max(0, 1 - dist / 140), power > 150);
    g.shake = Math.max(g.shake, Math.max(0, 1 - dist / 40) * (power > 150 ? 1 : 0.6));
  }

  // --------------------------------------------------------- projectiles
  throw(kind, pos, vel, owner = 'player') {
    const geo = kind === 'smoke' ? new THREE.CylinderGeometry(0.07, 0.07, 0.22, 8) : new THREE.SphereGeometry(0.1, 8, 6);
    const mesh = new THREE.Mesh(geo, kind === 'smoke' ? this.sMat : this.gMat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    const p = { kind, pos: pos.clone(), vel: vel.clone(), t: kind === 'smoke' ? 1.6 : GRENADE.fuse, owner, mesh, warned: false };
    this.projectiles.push(p);
    return p;
  }
  fireShell(pos, vel) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), this.shellMat);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.projectiles.push({ kind: 'shell', pos: pos.clone(), vel: vel.clone(), t: 6, owner: 'enemy', mesh });
  }

  solidAt(p) { return SOLID[this.game.world.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))] === 1; }

  updateProjectile(p, dt) {
    const g = this.game;
    if (p.kind === 'shell') {
      p.vel.y -= 4 * dt;
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        p.pos.addScaledVector(p.vel, dt / steps);
        const pl = g.player.pos;
        const hitBody = (Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z) < 0.6 && p.pos.y > pl.y && p.pos.y < pl.y + 1.9) || g.enemies.bodyAt(p.pos, 'enemy');
        if (this.solidAt(p.pos) || hitBody || p.pos.y < 0) {
          this.explode(p.pos.x, p.pos.y, p.pos.z, { radius: SHELL.radius, power: SHELL.power, destroyRadius: 1.6, owner: 'enemy' });
          return false;
        }
      }
      p.mesh.position.copy(p.pos);
      return (p.t -= dt) > 0;
    }
    // grenades bounce and roll until the fuse runs out
    p.vel.y -= 20 * dt;
    for (const axis of ['x', 'y', 'z']) {
      const old = p.pos[axis];
      p.pos[axis] += p.vel[axis] * dt;
      if (this.solidAt(p.pos)) {
        p.pos[axis] = old;
        if (Math.abs(p.vel[axis]) > 2) sfx.bounce(Math.max(0, 1 - g.camera.position.distanceTo(p.pos) / 30));
        p.vel[axis] *= -0.35;
        if (axis === 'y') { p.vel.x *= 0.6; p.vel.z *= 0.6; }
      }
    }
    if (g.world.get(Math.floor(p.pos.x), Math.floor(p.pos.y), Math.floor(p.pos.z)) === B.WATER) p.vel.multiplyScalar(0.9);
    p.mesh.position.copy(p.pos);
    p.mesh.rotation.x += p.vel.length() * dt * 3;
    if (p.owner === 'enemy' && !p.warned && p.vel.length() < 6 && g.player.pos.distanceTo(p.pos) < 8) {
      p.warned = true; g.hud.toast(t('hud.grenadeWarn'), 'warn');
    }
    p.t -= dt;
    if (p.t > 0) return true;
    if (p.kind === 'smoke') this.makeSmoke(p.pos);
    else this.explode(p.pos.x, p.pos.y, p.pos.z, { radius: GRENADE.radius, power: GRENADE.power, destroy: false, owner: p.owner });
    g.enemies.grenadeAt(p.pos, p.owner);
    return false;
  }

  // ------------------------------------------------------------- smoke
  makeSmoke(pos) {
    const group = new THREE.Group();
    const puffs = [];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xb8b8b0, transparent: true, opacity: 0, depthWrite: false }));
      m.userData.off = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2);
      m.userData.drift = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.15 + Math.random() * 0.2, (Math.random() - 0.5) * 0.6);
      group.add(m); puffs.push(m);
    }
    group.position.copy(pos);
    this.game.scene.add(group);
    this.smokes.push({ pos: pos.clone(), group, puffs, t: 0, life: 22, r: 0.5 });
    sfx.smoke(Math.max(0, 1 - this.game.camera.position.distanceTo(pos) / 40));
  }
  // Does the segment a->b pass through a smoke cloud? (blocks sight)
  smokeBlocks(a, b) {
    for (const s of this.smokes) {
      if (s.r < 1.5) continue;
      const c = s.pos.clone(); c.y += 1.2;
      const ab = new THREE.Vector3().subVectors(b, a);
      const tt = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(c, a).dot(ab) / ab.lengthSq()));
      const closest = a.clone().addScaledVector(ab, tt);
      if (closest.distanceTo(c) < s.r * 0.85) return true;
    }
    return false;
  }

  update(dt) {
    const g = this.game;
    // lit TNT: blink faster as the fuse runs down
    for (const [k, l] of this.lit) {
      if (g.world.get(l.x, l.y, l.z) !== B.TNT) { this.unlight(k); continue; }
      l.t -= dt;
      const rate = l.t < 2 ? 14 : 5;
      l.mesh.material.opacity = (Math.sin(performance.now() / 1000 * rate * Math.PI) > 0) ? 0.55 : 0.05;
      if (Math.random() < dt * 6) g.particles.burst(l.x + 0.5, l.y + 1.02, l.z + 0.5, [1, 0.8, 0.4], 1, 1.2, 0.3, 4);
      if (Math.random() < dt * 3) sfx.hiss(Math.max(0, 1 - g.camera.position.distanceTo(l.mesh.position) / 20));
      if (l.t <= 0) {
        this.unlight(k);
        g.world.set(l.x, l.y, l.z, B.AIR);
        this.explode(l.x + 0.5, l.y + 0.5, l.z + 0.5, { radius: TNT_RADIUS, power: TNT_POWER, owner: l.owner });
      }
    }
    this.projectiles = this.projectiles.filter((p) => {
      const alive = this.updateProjectile(p, dt);
      if (!alive) { g.scene.remove(p.mesh); p.mesh.geometry.dispose(); }
      return alive;
    });
    for (const s of this.smokes) {
      s.t += dt;
      s.r = Math.min(5, 0.5 + s.t * 2.5);
      const fade = s.t < 1 ? s.t : s.t > s.life - 4 ? Math.max(0, (s.life - s.t) / 4) : 1;
      s.puffs.forEach((m) => {
        m.position.copy(m.userData.off).multiplyScalar(s.r / 2.2).addScaledVector(m.userData.drift, s.t);
        m.scale.setScalar(2 + s.r * 0.9);
        m.material.opacity = 0.75 * fade;
      });
    }
    this.smokes = this.smokes.filter((s) => {
      if (s.t < s.life) return true;
      g.scene.remove(s.group); s.puffs.forEach((m) => m.material.dispose());
      return false;
    });
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 200);
  }

  dispose() {
    for (const k of [...this.lit.keys()]) this.unlight(k);
    for (const p of this.projectiles) this.game.scene.remove(p.mesh);
    for (const s of this.smokes) this.game.scene.remove(s.group);
    this.game.scene.remove(this.flashLight);
  }
}
