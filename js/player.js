// First-person body: walking, running, crouching (sneaking), jumping,
// swimming, climbing tree trunks, flying (Peace mode) and raft riding.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { sfx } from './audio.js';

const HW = 0.3; // half width

export class Player {
  constructor() {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.inWater = false; this.swimming = false; this.headInWater = false;
    this.crouch = false; this.running = false; this.flying = false; this.climbing = false;
    this.health = 100; this.hunger = 100;
    this.stepAcc = 0;
    this.raft = null;
    this.eyeOffset = 1.62;
  }
  get height() { return this.crouch ? 1.5 : 1.8; }
  get eyeTarget() { return this.crouch ? 1.27 : 1.62; }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + this.eyeOffset, this.pos.z); }
  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  collides(world, rafts, x, y, z, h = this.height) {
    if (x - HW < 0 || z - HW < 0 || x + HW > world.W || z + HW > world.D) return true;
    const x0 = Math.floor(x - HW), x1 = Math.floor(x + HW - 1e-6);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - 1e-6);
    const z0 = Math.floor(z - HW), z1 = Math.floor(z + HW - 1e-6);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      if (SOLID[world.get(bx, by, bz)]) return true;
    }
    for (const r of rafts) {
      const b = r.box();
      if (x + HW > b.minX && x - HW < b.maxX && z + HW > b.minZ && z - HW < b.maxZ && y + h > b.minY && y < b.maxY) return true;
    }
    return false;
  }

  // move along one axis; returns true if blocked (and snaps close to contact)
  moveAxis(world, rafts, axis, d) {
    if (d === 0) return false;
    const p = this.pos;
    p[axis] += d;
    if (!this.collides(world, rafts, p.x, p.y, p.z)) return false;
    p[axis] -= d;
    let lo = 0, hi = d;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      p[axis] += mid;
      if (this.collides(world, rafts, p.x, p.y, p.z)) hi = mid; else lo = mid;
      p[axis] -= mid;
    }
    p[axis] += lo;
    return true;
  }

  hasSupport(world, rafts, x, z) {
    return this.collides(world, rafts, x, this.pos.y - 0.08, z, 0.07);
  }

  standingRaft(rafts) {
    if (!this.onGround) return null;
    for (const r of rafts) {
      const b = r.box();
      if (this.pos.x + HW > b.minX && this.pos.x - HW < b.maxX && this.pos.z + HW > b.minZ && this.pos.z - HW < b.maxZ &&
        Math.abs(this.pos.y - b.maxY) < 0.1) return r;
    }
    return null;
  }

  nearLog(world) {
    const ys = [this.pos.y + 0.2, this.pos.y + 1.0];
    for (const y of ys) for (const [dx, dz] of [[HW + 0.15, 0], [-HW - 0.15, 0], [0, HW + 0.15], [0, -HW - 0.15]]) {
      if (world.get(Math.floor(this.pos.x + dx), Math.floor(y), Math.floor(this.pos.z + dz)) === B.LOG) return true;
    }
    return false;
  }

  update(dt, world, rafts, it, env) {
    const p = this.pos, v = this.vel;
    const wasGround = this.onGround;
    const wasWater = this.inWater;

    // crouch toggling – only stand up if there is room
    if (it.crouch && !this.flying) this.crouch = true;
    else if (this.crouch && !this.collides(world, rafts, p.x, p.y, p.z, 1.8)) this.crouch = false;

    const feet = world.get(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z));
    const waist = world.get(Math.floor(p.x), Math.floor(p.y + 0.8), Math.floor(p.z));
    this.inWater = feet === B.WATER || waist === B.WATER;
    this.swimming = waist === B.WATER && !this.flying;
    this.headInWater = world.get(Math.floor(p.x), Math.floor(p.y + this.eyeOffset), Math.floor(p.z)) === B.WATER;

    // wish direction
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * it.fwd + cy * it.strafe;
    let wz = -cy * it.fwd - sy * it.strafe;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    this.running = it.run && it.fwd > 0 && !this.crouch;

    let speed = 4.3;
    if (this.flying) speed = this.running ? 18 : 9;
    else if (this.swimming) speed = env.rain > 0.3 ? 1.6 : 2.2;
    else if (this.crouch) speed = 1.6;
    else if (this.running) speed = env.rain > 0.3 ? 5.2 : 6.6;
    if (!this.flying && !this.swimming && feet === B.WATER) speed *= 0.75;
    if (!this.flying && !this.swimming && world.get(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z)) === B.MUD) speed *= 0.9;
    speed *= env.speedMul || 1;

    // ---- raft: walking on a raft paddles it --------------------------------
    this.raft = this.standingRaft(rafts);
    if (this.raft && wl > 0.1 && !it.jump) {
      const rs = 3.0 * dt;
      if (this.raft.tryMove(world, wx * rs, wz * rs, this)) {
        p.x += wx * rs; p.z += wz * rs; v.x = v.z = 0;
        wx = wz = 0;
      }
    }

    // ---- vertical / special movement --------------------------------------
    const nearLog = !this.flying && this.nearLog(world);
    this.climbing = false;
    if (this.flying) {
      const up = (it.jumpHeld ? 1 : 0) - (it.crouchHeld ? 1 : 0);
      v.y = up * speed * 0.8;
      const k = 1 - Math.exp(-10 * dt);
      v.x += (wx * speed - v.x) * k; v.z += (wz * speed - v.z) * k;
    } else {
      const k = 1 - Math.exp(-(this.onGround ? 14 : this.swimming ? 6 : 2.5) * dt);
      v.x += (wx * speed - v.x) * k; v.z += (wz * speed - v.z) * k;
      if (nearLog && (it.fwd > 0 || it.jumpHeld) && !this.onGround) {
        this.climbing = true; v.y = this.crouch ? 0 : 3.4;
      } else if (nearLog && it.fwd > 0 && this.onGround && this.blockedH) {
        this.climbing = true; v.y = 3.4;
      } else if (nearLog && this.crouch && !this.onGround) {
        this.climbing = true; v.y = 0;
      } else if (this.swimming) {
        // float at the surface; Space swims up, crouch dives
        let target = this.headInWater ? 1.2 : 0;
        if (it.jumpHeld) target = 3.2;
        if (it.crouchHeld) target = -2.5;
        v.y += (target - v.y) * Math.min(1, dt * 3);
        if (it.jumpHeld && this.blockedH) v.y = 6.5; // climb out onto a bank
      } else {
        v.y -= 28 * dt;
        if (v.y < -40) v.y = -40;
        if (it.jumpHeld && this.onGround) v.y = 8.4;
        if (nearLog && !this.crouch && v.y < -2) v.y = -2; // slide down trunks
      }
    }

    // ---- integrate with collisions -----------------------------------------
    const prevVy = v.y;
    const steps = Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.4) || 1;
    const sdt = dt / steps;
    this.onGround = false; this.blockedH = false;
    for (let s = 0; s < steps; s++) {
      if (this.moveAxis(world, rafts, 'y', v.y * sdt)) {
        if (v.y < 0) this.onGround = true;
        v.y = 0;
      }
      const guard = this.crouch && wasGround && !this.flying;
      const ox = p.x;
      if (this.moveAxis(world, rafts, 'x', v.x * sdt)) { v.x = 0; this.blockedH = true; }
      if (guard && !this.hasSupport(world, rafts, p.x, p.z)) { p.x = ox; v.x = 0; }
      const oz = p.z;
      if (this.moveAxis(world, rafts, 'z', v.z * sdt)) { v.z = 0; this.blockedH = true; }
      if (guard && !this.hasSupport(world, rafts, p.x, p.z)) { p.z = oz; v.z = 0; }
    }
    if (!this.onGround && v.y <= 0 && this.hasSupport(world, rafts, p.x, p.z)) this.onGround = true;
    if (this.flying && this.onGround && it.crouchHeld) this.flying = false;

    // landing damage
    let fallDamage = 0;
    if (this.onGround && !wasGround && prevVy < -15 && !this.inWater) fallDamage = Math.round((-prevVy - 15) * 3.5);
    if (!wasWater && this.inWater && prevVy < -5) sfx.splash();

    // eye height smoothing
    this.eyeOffset += (this.eyeTarget - this.eyeOffset) * Math.min(1, dt * 12);

    // footsteps
    const hs = Math.hypot(v.x, v.z);
    if ((this.onGround || this.swimming) && hs > 0.5) {
      this.stepAcc += hs * dt;
      const stride = this.swimming ? 1.6 : this.crouch ? 1.8 : 2.3;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        if (this.swimming) sfx.swim();
        else if (!this.crouch || Math.random() < 0.3) {
          const under = world.get(Math.floor(p.x), Math.floor(p.y - 0.1), Math.floor(p.z));
          sfx.step(under === B.MUD ? 'mud' : (under === B.WOOD || under === B.LOG || this.raft) ? 'wood' : (under === B.STONE || under === B.IRON || under === B.RUBBLE) ? 'stone' : 'dirt');
        }
      }
    }
    return { fallDamage };
  }
}
