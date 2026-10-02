// Built-in forts: indestructible concrete forts spread across the world.
// Each is allied, enemy or unclaimed. They can only be entered through the
// main door, which only opens for its owners or is blown open by 3 TNT or 12
// grenades. Every fort is lit inside at all times, and its warm light shows
// through windows, gaps and tower lamps at night so it can be seen from afar.
import * as THREE from 'three';
import { SEA, DIFF } from './config.js';
import { B } from './blocks.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';

export const FORT_HALF = 6;          // 13 x 13 footprint
const ZONE = FORT_HALF + 4;          // no building this close to the walls
export const FORT_NAMES = [
  'Fort Ashgrove', 'Kestrel Redoubt', 'Fort Marrow', 'Blackwater Keep', 'Fort Calder', 'Hollow Bastion',
  'Fort Dunmere', 'Ironbridge Post', 'Fort Varga', 'Saltmarsh Redoubt', 'Fort Tamsin', 'Greyfield Keep',
  'Fort Orrin', 'Cinder Hill Post', 'Fort Lowry', 'Wrenmoor Bastion',
];

// local (door faces +lz) -> world offset
function rot(side, lx, lz) {
  if (side === 's') return [lx, lz];
  if (side === 'n') return [-lx, -lz];
  if (side === 'e') return [lz, -lx];
  return [-lz, lx];
}

// ----------------------------------------------------------------- generation
export function chooseFortSites(world, tops, water, distLand, rnd, count, avoid) {
  const W = world.W, D = world.D;
  const spacing = Math.sqrt(W * D / count) * 0.72;
  const sites = [];
  for (let tries = 0; tries < 4000 && sites.length < count; tries++) {
    const cx = 16 + Math.floor(rnd() * (W - 32)), cz = 16 + Math.floor(rnd() * (D - 32));
    if (sites.some((s) => Math.hypot(s.cx - cx, s.cz - cz) < spacing)) continue;
    if (avoid && Math.hypot(avoid.x - cx, avoid.z - cz) < 40) continue;
    const k = cx + cz * W;
    if (water[k]) continue;
    // about 40% of forts sit right next to a river or lake (water as a defence)
    const waterside = sites.filter((s) => s.waterside).length < Math.ceil(count * 0.4);
    const dl = distLand[k];
    if (waterside ? (dl < 9 || dl > 13) : dl < 14) continue;
    let ok = true;
    for (let dz = -FORT_HALF - 1; dz <= FORT_HALF + 1 && ok; dz++) for (let dx = -FORT_HALF - 1; dx <= FORT_HALF + 1 && ok; dx++) {
      if (water[(cx + dx) + (cz + dz) * W]) ok = false;
    }
    if (!ok) continue;
    // door faces away from the nearest water
    let side = 's', best = -1;
    for (const sd of ['n', 's', 'e', 'w']) {
      const [ox, oz] = rot(sd, 0, 12);
      const d = distLand[(cx + ox) + (cz + oz) * W] || 0;
      if (d > best) { best = d; side = sd; }
    }
    let floor = Infinity;
    for (let dz = -FORT_HALF; dz <= FORT_HALF; dz++) for (let dx = -FORT_HALF; dx <= FORT_HALF; dx++) floor = Math.min(floor, tops[(cx + dx) + (cz + dz) * W]);
    floor = Math.max(SEA, floor);
    sites.push({ cx, cz, floor, base: floor + 1, side, waterside: dl < 14 });
  }
  return sites;
}

// flatten the ground under and around a fort (called on the height map)
export function flattenForSite(tops, water, W, D, f) {
  for (let dz = -ZONE; dz <= ZONE; dz++) for (let dx = -ZONE; dx <= ZONE; dx++) {
    const x = f.cx + dx, z = f.cz + dz;
    if (x < 0 || z < 0 || x >= W || z >= D) continue;
    const k = x + z * W;
    const d = Math.max(Math.abs(dx), Math.abs(dz));
    if (d <= FORT_HALF + 2) { tops[k] = f.floor; water[k] = 0; }
    else if (!water[k]) {
      // gentle ramp from the fort apron out to the surrounding ground
      const ring = d - (FORT_HALF + 2);
      tops[k] = Math.max(Math.min(tops[k], f.floor + ring), f.floor - ring);
    }
  }
}

export function stampFort(world, f, rnd) {
  const b = f.base;
  const put = (lx, y, lz, id) => {
    const [ox, oz] = rot(f.side, lx, lz);
    const x = f.cx + ox, z = f.cz + oz;
    if (!world.inside(x, y, z)) return;
    const i = world.idx(x, y, z);
    world.data[i] = id;
    world.locked[i] = id === B.AIR ? 0 : 1;
  };
  const H = FORT_HALF;
  for (let lz = -H; lz <= H; lz++) for (let lx = -H; lx <= H; lx++) {
    put(lx, b - 1, lz, B.FORT_WALL);                                  // floor
    for (let y = b; y <= b + 7; y++) put(lx, y, lz, B.AIR);           // clear
    const edge = Math.abs(lx) === H || Math.abs(lz) === H;
    const corner = Math.abs(lx) >= H - 1 && Math.abs(lz) >= H - 1;
    if (edge) {
      for (let y = b; y <= b + 4; y++) put(lx, y, lz, B.FORT_WALL);
      if ((lx + lz) % 2 === 0) put(lx, b + 5, lz, B.FORT_WALL);       // crenellations
    }
    if (corner) for (let y = b; y <= b + 6; y++) put(lx, y, lz, B.FORT_WALL);   // towers
    // inner rampart walkway to fire over the walls
    if (!edge && (Math.abs(lx) === H - 1 || Math.abs(lz) === H - 1)) put(lx, b + 3, lz, B.FORT_WALL);
  }
  // firing windows / light slits
  for (const a of [-3, 0, 3]) {
    put(a, b + 2, -H, B.AIR); put(-H, b + 2, a, B.AIR); put(H, b + 2, a, B.AIR);
    if (Math.abs(a) === 3) put(a, b + 2, H, B.AIR);
  }
  // lamps: in the walls (they glow inside and out) and on top of each tower
  for (const [lx, lz] of [[-H, -2], [-H, 2], [H, -2], [H, 2], [-2, -H], [2, -H]]) put(lx, b + 1, lz, B.FORT_LAMP);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(sx * H, b + 7, sz * H, B.FORT_LAMP);
  // main door (2 wide, 3 high) on the +lz side
  for (const lx of [-1, 0]) for (let y = b; y <= b + 2; y++) put(lx, y, H, B.FORT_DOOR);
  // ladder posts up to the rampart
  for (const lx of [-(H - 2), H - 2]) for (let y = b; y <= b + 3; y++) put(lx, y, -(H - 2), B.LOG);
  put(3, b, -2, B.SUPPLY);
  // warm light everywhere inside
  for (let lz = -(H - 1); lz <= H - 1; lz++) for (let lx = -(H - 1); lx <= H - 1; lx++) for (let y = b; y <= b + 6; y++) {
    const [ox, oz] = rot(f.side, lx, lz);
    const x = f.cx + ox, z = f.cz + oz;
    if (world.inside(x, y, z)) world.glow[world.idx(x, y, z)] = 150;
  }
  // useful world-space points
  const P = (lx, lz) => { const [ox, oz] = rot(f.side, lx, lz); return { x: f.cx + ox + 0.5, z: f.cz + oz + 0.5 }; };
  const mid = P(-0.5, H);
  f.doorCenter = { x: mid.x, y: b + 1.5, z: mid.z };
  f.doorOut = P(-0.5, H + 2.5); f.doorIn = P(-0.5, H - 2.5);
  f.doorCells = [];
  for (const lx of [-1, 0]) for (let y = b; y <= b + 2; y++) { const [ox, oz] = rot(f.side, lx, H); f.doorCells.push([f.cx + ox, y, f.cz + oz]); }
  // the two ladders up to the rampart: where to step on (bottom, in the
  // courtyard) and off (top, on the walkway)
  f.ladders = [-(H - 2), H - 2].map((lx) => {
    const t = P(lx, -(H - 2)), bt = P(lx - Math.sign(lx), -(H - 3));
    return { top: { x: t.x, y: b + 4, z: t.z }, bottom: { x: bt.x, y: b, z: bt.z } };
  });
  f.posts = [];      // garrison positions: rampart and courtyard
  for (const [lx, lz, up] of [[-3, -(H - 1), 1], [3, -(H - 1), 1], [-(H - 1), 1, 1], [H - 1, -1, 1], [-3, H - 1, 1], [3, H - 1, 1],
    [-2, 0, 0], [2, 2, 0], [0, -3, 0], [-3, 3, 0]]) {
    const q = P(lx, lz); f.posts.push({ x: q.x, y: up ? b + 4 : b, z: q.z });
  }
  f.lampsOut = [];
  for (const [lx, lz] of [[-H - 0.7, -2], [-H - 0.7, 2], [H + 0.7, -2], [H + 0.7, 2], [-2, -H - 0.7], [2, -H - 0.7]]) { const q = P(lx, lz); f.lampsOut.push({ x: q.x, y: b + 1.5, z: q.z, big: false }); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const q = P(sx * H, sz * H); f.lampsOut.push({ x: q.x, y: b + 7.5, z: q.z, big: true }); }
  const pole = P(-H, -H); f.pole = { x: pole.x, y: b + 8, z: pole.z };
}

// ---------------------------------------------------------------- flags
const flagTex = {};
function makeFlag(owner) {
  if (flagTex[owner]) return flagTex[owner];
  const c = document.createElement('canvas'); c.width = 64; c.height = 40;
  const x = c.getContext('2d');
  if (owner === 'ally') {
    x.fillStyle = '#2a4a6a'; x.fillRect(0, 0, 64, 40);
    x.fillStyle = '#c8b890'; x.fillRect(0, 0, 64, 4); x.fillRect(0, 36, 64, 4);
    x.beginPath(); x.arc(32, 20, 9, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#2a4a6a'; x.beginPath(); x.arc(32, 20, 4, 0, Math.PI * 2); x.fill();
  } else {
    x.fillStyle = '#8a3a2a'; x.fillRect(0, 0, 64, 40);
    x.fillStyle = '#2a2622'; x.fillRect(0, 17, 64, 6);
    x.fillStyle = '#d8c070'; x.beginPath(); x.moveTo(32, 9); x.lineTo(43, 20); x.lineTo(32, 31); x.lineTo(21, 20); x.closePath(); x.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  flagTex[owner] = tex;
  return tex;
}
let haloTex = null;
function makeHalo() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,220,150,1)'); g.addColorStop(0.25, 'rgba(255,170,80,0.55)'); g.addColorStop(1, 'rgba(255,140,50,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ---------------------------------------------------------------- runtime
export class Forts {
  constructor(game, saved) {
    this.game = game;
    this.list = game.world.forts;
    this.scene = game.scene;
    if (!haloTex) haloTex = makeHalo();
    this.poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3a36 });
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffb070, 0, 20, 1.3); this.scene.add(l); return l; });
    const byId = new Map((saved || []).map((s) => [s.id, s]));
    for (const f of this.list) {
      const s = byId.get(f.id);
      if (s) { f.owner = s.owner; f.charges = s.charges || 0; f.blown = !!s.blown; }
      f.charges = f.charges || 0; f.blown = !!f.blown;
      f.openT = 0; f.alarm = 0; f.alarmCd = 0; f.officerDead = false; f.flagAnim = null;
      f.center = new THREE.Vector3(f.cx + 0.5, f.base + 1, f.cz + 0.5);
      this.buildDecor(f);
      this.applyDoor(f, f.blown);
    }
    this.checkT = 0;
  }

  buildDecor(f) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 6, 6), this.poleMat);
    pole.position.set(f.pole.x, f.pole.y + 3, f.pole.z);
    g.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 8, 1),
      new THREE.MeshLambertMaterial({ map: makeFlag(f.owner === 'ally' ? 'ally' : 'enemy'), side: THREE.DoubleSide }));
    cloth.geometry.translate(1.2, 0, 0);
    cloth.position.set(f.pole.x + 0.07, f.pole.y + 5.2, f.pole.z);
    cloth.visible = f.owner !== 'none';
    g.add(cloth);
    f.cloth = cloth; f.flagTop = f.pole.y + 5.2; f.flagBottom = f.pole.y + 0.9;
    f.halos = f.lampsOut.map((l) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.set(l.x, l.y, l.z); s.scale.setScalar(l.big ? 5 : 2.6);
      g.add(s); return s;
    });
    const dome = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    dome.position.set(f.cx + 0.5, f.base + 4, f.cz + 0.5); dome.scale.setScalar(15);
    g.add(dome); f.halos.push(dome); dome.userData.dome = true;
    this.scene.add(g);
    f.decor = g;
  }

  // -------------------------------------------------------------- queries
  inside(f, pos, pad = 0) {
    return Math.abs(pos.x - (f.cx + 0.5)) <= FORT_HALF - 0.4 + pad && Math.abs(pos.z - (f.cz + 0.5)) <= FORT_HALF - 0.4 + pad &&
      pos.y >= f.base - 0.6 && pos.y <= f.base + 7;
  }
  fortAt(pos) { return this.list.find((f) => this.inside(f, pos)) || null; }
  nearest(pos, owner) {
    let best = null, bd = Infinity;
    for (const f of this.list) {
      if (owner && f.owner !== owner) continue;
      const d = Math.hypot(f.cx - pos.x, f.cz - pos.z);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  // Built-in forts are off limits for building: nothing can be placed in a
  // fort's footprint (walls, courtyard, ramparts, the air above them). Right
  // outside the walls and in front of the door is free ground.
  protectedCell(x, y, z) {
    for (const f of this.list) {
      if (Math.abs(x - f.cx) <= FORT_HALF && Math.abs(z - f.cz) <= FORT_HALF && y >= f.base - 1) return true;
    }
    return false;
  }
  // the open courtyard / rooms inside a fort (a campfire may go here)
  interiorCell(x, y, z) {
    for (const f of this.list) {
      if (Math.abs(x - f.cx) <= FORT_HALF - 1 && Math.abs(z - f.cz) <= FORT_HALF - 1 && y >= f.base && y <= f.base + 6) return f;
    }
    return null;
  }

  // -------------------------------------------------------------- door
  applyDoor(f, open) {
    const w = this.game.world;
    for (const [x, y, z] of f.doorCells) {
      const i = w.idx(x, y, z);
      if (open) { if (w.data[i] === B.FORT_DOOR) w.set(x, y, z, B.AIR); w.locked[i] = 0; }
      else { w.locked[i] = 1; if (w.data[i] !== B.FORT_DOOR) w.set(x, y, z, B.FORT_DOOR); }
    }
    f.doorOpen = open;
  }
  // explosions near the door: TNT = 1, grenade = 1/4 (3 TNT or 12 grenades)
  blast(center, amount) {
    if (!amount) return;
    for (const f of this.list) {
      if (f.blown || f.owner === 'none') continue;
      const d = Math.hypot(center.x - f.doorCenter.x, center.y - f.doorCenter.y, center.z - f.doorCenter.z);
      if (d > 3.6) continue;
      f.charges += amount;
      if (f.charges >= 2.999) this.blowDoor(f);
      else this.game.hud.toast(t('fort.doorDamaged', { name: f.name, n: Math.round(f.charges / 3 * 100) }));
    }
  }
  blowDoor(f) {
    f.blown = true; f.charges = 0;
    this.applyDoor(f, true);
    const g = this.game;
    g.particles.burst(f.doorCenter.x, f.doorCenter.y, f.doorCenter.z, [0.3, 0.32, 0.26], 30, 6, 1.4);
    g.hud.toast(t('fort.doorDown', { name: f.name }), 'warn');
    g.enemies.callout(null, 'doorDown', f.doorCenter);
  }
  personNearDoor(f, faction) {
    const g = this.game;
    const near = (p) => Math.hypot(p.x - f.doorCenter.x, p.z - f.doorCenter.z) < 3.4 && Math.abs(p.y - f.base) < 3;
    if (faction === 'ally' && !g.dead && near(g.player.pos)) return true;
    return g.enemies.list.some((s) => s.alive && s.faction === faction && !s.surrender && near(s.pos));
  }
  doorBlocked(f) {
    const g = this.game;
    const inCell = (p) => f.doorCells.some(([x, y, z]) => Math.abs(p.x - (x + 0.5)) < 0.85 && Math.abs(p.z - (z + 0.5)) < 0.85 && p.y < y + 1 && p.y + 1.9 > y);
    return inCell(g.player.pos) || g.enemies.list.some((s) => s.alive && inCell(s.pos));
  }

  // ------------------------------------------------------------ ownership
  // change hands silently (mission set-up)
  setOwnerQuiet(f, owner) {
    const prev = f.owner;
    f.owner = owner; f.charges = 0; f.officerDead = false;
    f.cloth.material.map = makeFlag(owner === 'ally' ? 'ally' : 'enemy'); f.cloth.visible = owner !== 'none';
    this.game.enemies.fortChanged(f, prev, owner);
  }
  setOwner(f, owner) {
    const prev = f.owner;
    if (prev === owner) return;
    f.owner = owner; f.charges = 0; f.officerDead = false;
    if (f.blown) { f.blown = false; }
    this.applyDoor(f, false);
    f.flagAnim = { t: 0, prev, next: owner };
    const g = this.game;
    if (owner === 'ally') {
      g.stats.fortsCaptured = (g.stats.fortsCaptured || 0) + 1;
      g.hud.bigMessage(t('fort.captured', { name: f.name }), t('fort.capturedSub'));
      sfx.done();
      g.enemies.callout(null, 'fortOurs', f.center);
    } else if (prev === 'ally') {
      g.stats.fortsLost = (g.stats.fortsLost || 0) + 1;
      g.hud.toast(t('fort.lost', { name: f.name }), 'warn');
      sfx.warn();
    }
    g.enemies.fortChanged(f, prev, owner);
  }

  // -------------------------------------------------------------- update
  update(dt) {
    const g = this.game;
    const dark = 1 - g.sky.daylight;
    const pp = g.player.pos;
    // doors open for their owners and close behind them
    for (const f of this.list) {
      if (f.blown) continue;
      if (f.owner === 'none') { if (!f.doorOpen) this.applyDoor(f, true); continue; }
      const friend = this.personNearDoor(f, f.owner);
      if (friend) { f.openT = 1.2; if (!f.doorOpen) { this.applyDoor(f, true); sfx.thump(); } }
      else if (f.doorOpen) {
        f.openT -= dt;
        if (f.openT <= 0 && !this.doorBlocked(f)) { this.applyDoor(f, false); sfx.thump(); }
      }
    }
    // capture / surrender checks
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 0.6; for (const f of this.list) this.checkCapture(f); }
    // attack alarms on the player's forts
    for (const f of this.list) {
      f.alarm = Math.max(0, f.alarm - dt); f.alarmCd -= dt;
      if (f.owner !== 'ally' || f.alarmCd > 0) continue;
      const attackers = g.enemies.list.some((s) => s.alive && s.faction === 'enemy' && !s.surrender && s.role !== 'garrison' && Math.hypot(s.pos.x - f.center.x, s.pos.z - f.center.z) < 30);
      if (attackers) {
        f.alarm = 25; f.alarmCd = 90;
        sfx.siren(); g.hud.alert(t('fort.underAttack', { name: f.name }));
      }
    }
    // the player's own forts feed them (unlimited food for the owning side)
    const here = this.fortAt(pp);
    if (here && here.owner === 'ally' && !g.peace) g.player.hunger = Math.min(100, g.player.hunger + 3 * dt);
    // flags, halos, lights
    for (const f of this.list) {
      const d = Math.hypot(f.cx - pp.x, f.cz - pp.z);
      if (f.flagAnim) {
        const a = f.flagAnim; a.t += dt;
        if (a.t < 3) f.cloth.position.y = f.flagTop - (f.flagTop - f.flagBottom) * (a.t / 3);
        else {
          if (!a.swapped) { a.swapped = true; f.cloth.material.map = makeFlag(a.next === 'ally' ? 'ally' : 'enemy'); f.cloth.visible = a.next !== 'none'; }
          f.cloth.position.y = f.flagBottom + (f.flagTop - f.flagBottom) * Math.min(1, (a.t - 3) / 3);
          if (a.t > 6) f.flagAnim = null;
        }
      }
      if (d < 220) {                    // flutter
        const pos = f.cloth.geometry.attributes.position;
        const tt = performance.now() / 1000;
        for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, Math.sin(x * 2.2 - tt * 4 + f.cx) * 0.12 * (x / 2.4)); }
        pos.needsUpdate = true;
      }
      // halos only matter in the dark; the big dome is for distant viewers only
      for (const h of f.halos) {
        h.visible = dark > 0.15 && (!h.userData.dome || d > 28);
        h.material.opacity = (h.userData.dome ? 0.32 : 0.85) * dark;
      }
    }
    const near = [...this.list].sort((a, b) => Math.hypot(a.cx - pp.x, a.cz - pp.z) - Math.hypot(b.cx - pp.x, b.cz - pp.z));
    this.lights.forEach((l, i) => {
      const f = near[i];
      if (!f || Math.hypot(f.cx - pp.x, f.cz - pp.z) > 90) { l.intensity = 0; return; }
      l.position.set(f.cx + 0.5, f.base + 3.5, f.cz + 0.5);
      l.intensity = 6 + 18 * dark;
    });
  }

  checkCapture(f) {
    const g = this.game;
    const inside = { ally: 0, enemy: 0 };
    const defenders = [];
    for (const s of g.enemies.list) {
      if (!s.alive || s.surrender || !this.inside(f, s.pos)) continue;
      inside[s.faction]++;
      if (s.faction === f.owner) defenders.push(s);
    }
    if (!g.dead && this.inside(f, g.player.pos)) inside.ally++;
    if (f.owner === 'none') {
      const who = inside.ally && !inside.enemy ? 'ally' : inside.enemy && !inside.ally ? 'enemy' : null;
      if (who) this.setOwner(f, who);
      return;
    }
    const other = f.owner === 'ally' ? 'enemy' : 'ally';
    if (defenders.length === 0) {
      if (inside[other] > 0) this.setOwner(f, other);
      return;
    }
    // surrender: officer down, or outnumbered with the door blown open
    const nearAttackers = (other === 'ally' && !g.dead && Math.hypot(g.player.pos.x - f.center.x, g.player.pos.z - f.center.z) < 14 ? 1 : 0) +
      g.enemies.list.filter((s) => s.alive && !s.surrender && s.faction === other && Math.hypot(s.pos.x - f.center.x, s.pos.z - f.center.z) < 14).length;
    if ((f.officerDead && nearAttackers > 0) || (f.blown && nearAttackers > defenders.length)) {
      for (const s of defenders) g.enemies.surrender(s, f);
      g.hud.toast(t('fort.surrender', { name: f.name }));
    }
  }

  toSave() { return this.list.map((f) => ({ id: f.id, owner: f.owner, charges: f.charges, blown: f.blown })); }
  dispose() { for (const f of this.list) this.scene.remove(f.decor); this.lights.forEach((l) => this.scene.remove(l)); }
}

// initial owners: the player's starting fort is allied (Play with Allies)
export function assignOwners(forts, mode, sub, rnd, startFort) {
  forts.forEach((f, i) => {
    if (sub === 'allies') {
      if (f === startFort) f.owner = 'ally';
      else { const r = rnd(); f.owner = r < 0.28 ? 'ally' : r < 0.78 ? 'enemy' : 'none'; }
    } else f.owner = rnd() < 0.8 ? 'enemy' : 'none';
    f.id = i;
  });
}
export function fortCount(cfg) { return cfg.mode === 'peace' ? 0 : (DIFF[cfg.difficulty] || DIFF.medium).forts; }
