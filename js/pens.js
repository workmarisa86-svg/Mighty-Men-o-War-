// Town Life: your pens. Every closed area fenced in next to your home fence is
// a pen for your animals: fences you build that join the home fence, or that
// close off an area around or beside the cottage, all count. Extend a fence,
// knock a piece out and rebuild it further on: as long as the loop is closed
// and joined to your fence, it is your pen, and the animals spread out into
// all of it. Open a gap and the pen is gone: animals can wander out.
// Gates (made from wood at a campfire) open and close: you walk through, the
// animals stay in. Lead an animal (aim at it and use it) into any of your
// pens; animals you buy go straight into the pen. A small flag at each pen
// shows how many animals it holds and how many fit.
//
// The search runs only when blocks change near your home (placing or
// breaking a fence or a gate), and a pen can't be bigger than 400 tiles.
import * as THREE from 'three';
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

const MAX_TILES = 400, NEAR_HOME = 48, PER_ANIMAL = 6;
const WALL = new Set([B.FENCE, B.GATE, B.GATE_OPEN]);
const key = (x, z) => x * 8192 + z;

export class Pens {
  constructor(town) {
    this.town = town; this.game = town.game; this.regions = []; this.version = -1; this.t = 0; this.flags = [];
    this.home = town.cottage;
    town.game.animals.onLetGo = (a) => { this.setRegion(a, this.regionAt(a.pos.x, a.pos.z)); this.t = 0; };
    this.recompute();
  }
  // the ground a pen tile stands on (the top solid block, below any fence)
  groundAt(x, z, nearY) {
    const w = this.game.world;
    for (let y = nearY + 2; y >= nearY - 3; y--) {
      const b = w.get(x, y, z);
      if (WALL.has(b)) continue;
      if (SOLID[b] || b === B.WATER) return b === B.WATER ? null : y + 1;
    }
    return null;
  }
  // a tile animals can stand on inside a pen: no fence, gate or wall at body height
  open(x, z, y) {
    const w = this.game.world;
    for (let k = 0; k < 2; k++) { const b = w.get(x, y + k, z); if (WALL.has(b) || SOLID[b]) return false; }
    return true;
  }
  isWall(x, y, z) { const w = this.game.world; return WALL.has(w.get(x, y, z)) || WALL.has(w.get(x, y + 1, z)); }
  // Flood each candidate area from the fence network joined to the home pen;
  // keep the areas that close off (under the size cap) as pens.
  recompute() {
    const g = this.game, w = g.world, H = this.home, P = H.pen, y0 = H.y;
    this.version = w.solidVersion;
    // 1. the fences joined to the home fence (walking along fence and gate blocks)
    const fence = new Set(), queue = [];
    const addF = (x, z) => { const k = key(x, z); if (!fence.has(k) && this.isWall(x, this.groundAt(x, z, y0) ?? y0, z)) { fence.add(k); queue.push([x, z]); } };
    for (let x = P.x0; x <= P.x1; x++) for (const z of [P.z0, P.z1]) addF(x, z);
    for (let z = P.z0; z <= P.z1; z++) for (const x of [P.x0, P.x1]) addF(x, z);
    while (queue.length && fence.size < 1500) {
      const [x, z] = queue.pop();
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((dx || dz) && Math.hypot(x + dx - H.x, z + dz - H.z) < NEAR_HOME) addF(x + dx, z + dz);
    }
    // also any fence ring right around or beside the cottage
    for (let dz = -14; dz <= 14; dz++) for (let dx = -14; dx <= 14; dx++) { const x = Math.floor(H.x) + dx, z = Math.floor(H.z) + dz; if (!fence.has(key(x, z)) && this.isWall(x, y0, z)) { fence.add(key(x, z)); } }
    // 2. flood the open ground next to those fences: closed areas become pens
    const seen = new Set(), regions = [];
    const cottage = (x, z) => Math.abs(x + 0.5 - H.x) <= (H.r || 3) + 0.5 && Math.abs(z + 0.5 - H.z) <= (H.r || 3) + 0.5;
    const seeds = [];
    for (let x = P.x0 + 1; x < P.x1; x++) for (let z = P.z0 + 1; z < P.z1; z++) seeds.push([x, z]);
    for (const k of fence) { const x = Math.floor(k / 8192), z = k - x * 8192; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) seeds.push([x + dx, z + dz]); }
    for (const [sx, sz] of seeds) {
      const sk = key(sx, sz);
      if (seen.has(sk) || fence.has(sk) || cottage(sx, sz)) continue;
      const gy = this.groundAt(sx, sz, y0);
      if (gy == null || !this.open(sx, sz, gy)) continue;
      const tiles = new Map(), q = [[sx, sz, gy]]; let leak = false;
      tiles.set(sk, gy); seen.add(sk);
      while (q.length) {
        const [x, z, y] = q.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, nz = z + dz, nk = key(nx, nz);
          if (tiles.has(nk)) continue;
          if (this.isWall(nx, y, nz) || cottage(nx, nz)) continue;                // a fence, a gate or the cottage closes it here
          const ny = this.groundAt(nx, nz, y);
          if (ny == null || Math.abs(ny - y) > 1) continue;                         // water or a steep step: a natural edge
          if (!this.open(nx, nz, ny)) continue;                                     // a wall of blocks
          tiles.set(nk, ny); seen.add(nk); q.push([nx, nz, ny]);
          if (tiles.size > MAX_TILES) { leak = true; break; }
        }
        if (leak) break;
      }
      if (!leak && tiles.size >= 4) regions.push(this.makeRegion(tiles));
    }
    this.regions = regions;
    this.assignAnimals();
    this.drawFlags();
  }
  makeRegion(tiles) {
    let sx = 0, sz = 0;
    const list = [];
    for (const [k, y] of tiles) { const x = Math.floor(k / 8192), z = k - x * 8192; list.push({ x, z, y }); sx += x; sz += z; }
    return { tiles, list, cx: sx / list.length + 0.5, cz: sz / list.length + 0.5, fits: Math.max(1, Math.floor(list.length / PER_ANIMAL)) };
  }
  regionAt(x, z) { const k = key(Math.floor(x), Math.floor(z)); return this.regions.find((r) => r.tiles.has(k)) || null; }
  biggest() { return this.regions.reduce((b, r) => (!b || r.list.length > b.list.length ? r : b), null); }
  // a spot inside a pen (for animals you buy, or that wander in)
  spotIn(r) { const c = r.list[Math.floor(Math.random() * r.list.length)]; return { x: c.x + 0.5, y: c.y, z: c.z + 0.5 }; }
  // every animal of yours belongs to the pen it stands in (or to none: free)
  assignAnimals() {
    for (const a of this.game.animals.list) {
      if (a.owner !== 'player' || a.state === 'dead') continue;
      a.pen = null;                                     // the pens here replace the old fixed box
      if (a.led) continue;
      this.setRegion(a, this.regionAt(a.pos.x, a.pos.z));
    }
  }
  // out of any pen, an animal is free: it grazes about where it stands (and may wander off)
  setRegion(a, r) { a.region = r; if (!r) { a.herd.cx = a.pos.x; a.herd.cz = a.pos.z; } a.target = null; }
  mine() { return this.game.animals.list.filter((a) => a.owner === 'player' && a.state !== 'dead'); }
  // the flag on each pen: animals in it / how many fit
  drawFlags() {
    const g = this.game;
    for (const f of this.flags) { g.scene.remove(f); f.material.map.dispose(); f.material.dispose(); }
    this.flags = [];
    for (const r of this.regions.slice(0, 4)) {
      const n = this.mine().filter((a) => a.region === r).length;
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(40,28,16,0.85)'; x.fillRect(0, 8, 128, 48); x.strokeStyle = '#d8c49a'; x.lineWidth = 3; x.strokeRect(3, 11, 122, 42);
      x.fillStyle = '#f2e4c0'; x.font = 'bold 30px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`${n} / ${r.fits}`, 64, 33);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
      s.scale.set(1.1, 0.55, 1);
      const top = r.list.reduce((b, q) => (q.z < b.z || (q.z === b.z && q.x < b.x) ? q : b), r.list[0]);   // the pen's corner
      s.position.set(r.cx, top.y + 2.4, r.cz); r.flag = s; r.count = n;
      g.scene.add(s); this.flags.push(s);
    }
  }
  update(dt) {
    const g = this.game;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.6;
    // blocks changed near home (a fence or gate placed or broken): look again
    if (g.world.solidVersion !== this.version) {
      const near = Math.hypot(g.player.pos.x - this.home.x, g.player.pos.z - this.home.z) < NEAR_HOME + 20;
      if (near) this.recompute(); else this.version = g.world.solidVersion;
    }
    // keep the counts on the flags right as animals move about
    let changed = false;
    for (const a of this.mine()) {
      if (a.led) continue;
      const r = a.region;
      if (r && r.tiles.has(key(Math.floor(a.pos.x), Math.floor(a.pos.z)))) continue;
      const n = this.regionAt(a.pos.x, a.pos.z);           // it walked out through a gap, or wandered into a pen
      if (n !== r) { this.setRegion(a, n); changed = true; }
    }
    for (const r of this.regions) { const n = this.mine().filter((a) => a.region === r).length; if (n !== r.count) changed = true; }
    if (changed) this.drawFlags();
  }
  // ---- leading animals, and gates (through aimuse.js) ----------------------------
  aimTarget(hit, eye, dir) {
    const g = this.game, A = g.animals;
    const ah = A.raycast(eye, dir, 4);
    const bd = hit ? hit.dist ?? 99 : 99;
    if (ah && ah.dist < bd && ah.animal.owner === 'player' && ah.animal.state !== 'dead') {
      const a = ah.animal;
      return { a: a.led ? 'letgo' : 'lead', label: t(a.led ? 'use.letGo' : 'use.lead'), run: () => this.toggleLead(a) };
    }
    if (hit && (hit.id === B.GATE || hit.id === B.GATE_OPEN)) {
      const open = hit.id === B.GATE_OPEN;
      return { a: open ? 'gateClose' : 'gateOpen', label: t(open ? 'use.gateClose' : 'use.gateOpen'), run: () => this.toggleGate(hit, open) };
    }
    return null;
  }
  toggleLead(a) {
    const g = this.game;
    if (a.led) { a.led = false; this.setRegion(a, this.regionAt(a.pos.x, a.pos.z)); g.hud.toast(t(a.region ? 'pen.inPen' : 'pen.letGo')); this.t = 0; }
    else {
      for (const o of this.mine()) if (o.led) { o.led = false; this.setRegion(o, this.regionAt(o.pos.x, o.pos.z)); }   // one at a time
      a.led = true; a.region = null; g.hud.toast(t('pen.leading'));
    }
    sfx.click();
  }
  toggleGate(hit, open) {
    const g = this.game, w = g.world;
    // a gate is a column: open or close both blocks
    for (const dy of [-1, 0, 1]) { const b = w.get(hit.x, hit.y + dy, hit.z); if (b === (open ? B.GATE_OPEN : B.GATE)) w.set(hit.x, hit.y + dy, hit.z, open ? B.GATE : B.GATE_OPEN); }
    sfx.gate(); this.version = w.solidVersion;              // (a gate never changes the pen itself)
  }
  dispose() { this.game.animals.onLetGo = null; for (const f of this.flags) { this.game.scene.remove(f); f.material.map.dispose(); f.material.dispose(); } this.flags = []; }
}
