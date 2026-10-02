// One running world: owns the scene, world, player, rafts and per-frame logic.
import * as THREE from 'three';
import { CHUNK, SEA, DAY_SECONDS, QUALITY, SAVE_FORMAT, WORLD_H, BODY } from './config.js';
import { B, BLOCKS } from './blocks.js';
import { World } from './world.js';
import { generate } from './worldgen.js';
import { buildChunk } from './mesher.js';
import { buildAtlas, buildCracks } from './textures.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Raft } from './raft.js';
import { Particles } from './particles.js';
import { ITEMS, MATERIALS, RECIPES } from './items.js';
import { sfx, setRain } from './audio.js';
import { HUD } from './hud.js';
import { t } from './i18n.js';

const REACH = BODY.reach;

export class Game {
  constructor(app, save) {
    this.app = app;
    this.save = save;
    this.cfg = save.cfg;
    this.peace = this.cfg.mode === 'peace';
    document.body.classList.toggle('peace', this.peace);
    this.settings = app.settings;
    this.quality = QUALITY[this.settings.quality] || QUALITY.medium;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // world
    this.world = new World(this.cfg);
    generate(this.world);
    this.world.applyEdits(save.edits);

    // materials
    this.atlas = buildAtlas();
    const tex = new THREE.CanvasTexture(this.atlas.canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;
    this.matSolid = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5 });
    this.matWater = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.chunks = new Map();
    this.buildQueue = [];
    this.queueTimer = 0;

    this.sky = new Sky(this.scene, this.quality);
    this.particles = new Particles(this.scene);
    this.particles.density = this.quality.particles;

    // flashlight (standard gear)
    this.flashlight = new THREE.SpotLight(0xfff0cf, 0, 34, 0.42, 0.55, 1);
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.camera.add(this.flashlight, this.flashlight.target);
    this.lightOn = false;

    // target highlight + cracks
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
      new THREE.LineBasicMaterial({ color: 0x14120e, transparent: true, opacity: 0.7 }));
    this.highlight.visible = false;
    this.scene.add(this.highlight);
    this.crackTex = buildCracks().map((c) => { const tx = new THREE.CanvasTexture(c); tx.magFilter = THREE.NearestFilter; tx.minFilter = THREE.NearestFilter; return tx; });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.006, 1.006, 1.006),
      new THREE.MeshBasicMaterial({ map: this.crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.crack.visible = false;
    this.scene.add(this.crack);

    // player
    this.player = new Player();
    const ps = save.player;
    if (ps) {
      this.player.pos.set(ps.x, ps.y, ps.z); this.player.yaw = ps.yaw; this.player.pitch = ps.pitch;
      this.player.health = ps.health; this.player.hunger = ps.hunger; this.player.flying = !!ps.flying && this.peace;
    } else {
      const s = this.world.spawn;
      this.player.pos.set(s.x, s.y, s.z);
    }
    this.breath = 15;

    // inventory
    this.inv = save.inv ? JSON.parse(JSON.stringify(save.inv)) : this.defaultInventory();

    // rafts
    this.rafts = (save.rafts || []).map((r) => new Raft(this.scene, r.x, r.z, this.atlas));

    this.time = save.time ?? 0.3;
    this.weather = save.weather || { rain: 0, target: 0, timer: 90 };
    this.dig = { key: null, progress: 0, tick: 0 };
    this.placeCooldown = 0;
    this.craft = null;
    this.overlay = null;   // 'inventory' | 'craft' while a game panel is open
    this.paused = true;
    this.autosave = 60;
    this.zoom = false;

    this.hud = new HUD(this);
    this.tmpV = new THREE.Vector3(); this.tmpD = new THREE.Vector3();
  }

  defaultInventory() {
    const inv = { counts: {}, hotbar: Array(9).fill(null), sel: 0 };
    inv.hotbar[0] = 'shovel';
    if (this.peace) {
      ['dirt', 'wood', 'stone', 'iron', 'tnt', 'raft'].forEach((id, i) => { inv.hotbar[i + 1] = id; });
    }
    return inv;
  }

  // ---------------------------------------------------------------- inventory
  count(id) { return this.peace && (MATERIALS.includes(id) || id === 'raft') ? Infinity : (this.inv.counts[id] || 0); }
  has(id, n = 1) { return this.count(id) >= n; }
  take(id, n = 1) { if (this.peace && (MATERIALS.includes(id) || id === 'raft')) return; this.inv.counts[id] = Math.max(0, (this.inv.counts[id] || 0) - n); }
  give(id, n = 1, quiet = false) {
    if (!id || n <= 0) return;
    this.inv.counts[id] = (this.inv.counts[id] || 0) + n;
    if (!this.inv.hotbar.includes(id)) {
      const free = this.inv.hotbar.indexOf(null);
      if (free >= 0) this.inv.hotbar[free] = id;
    }
    if (!quiet) this.hud.pickup(id, n);
    this.hud.dirtyHotbar = true;
  }
  selected() { return this.inv.hotbar[this.inv.sel]; }

  // -------------------------------------------------------------------- chunks
  chunkKey(cx, cz) { return cx + cz * this.world.cx; }
  rebuildChunk(key) {
    const cx = key % this.world.cx, cz = Math.floor(key / this.world.cx);
    const res = buildChunk(this.world, cx, cz, this.atlas.uvs, this.quality.ao);
    let ch = this.chunks.get(key);
    if (!ch) { ch = { solid: null, water: null }; this.chunks.set(key, ch); }
    for (const k of ['solid', 'water']) {
      if (ch[k]) { this.scene.remove(ch[k]); ch[k].geometry.dispose(); ch[k] = null; }
      if (res[k]) {
        const m = new THREE.Mesh(res[k], k === 'solid' ? this.matSolid : this.matWater);
        if (k === 'water') m.renderOrder = 1;
        m.matrixAutoUpdate = false;
        this.scene.add(m); ch[k] = m;
      }
    }
    ch.cx = cx; ch.cz = cz;
  }
  updateChunks(dt, budgetMs = 6) {
    const p = this.player.pos;
    const pcx = Math.floor(p.x / CHUNK), pcz = Math.floor(p.z / CHUNK);
    const R = this.settings.renderDist;
    // edited chunks near the player rebuild right away
    for (const key of this.world.dirty) {
      if (this.chunks.has(key)) this.rebuildChunk(key);
      this.world.dirty.delete(key);
    }
    this.queueTimer -= dt;
    if (this.queueTimer <= 0) {
      this.queueTimer = 0.4;
      this.buildQueue = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
        const cx = pcx + dx, cz = pcz + dz;
        if (cx < 0 || cz < 0 || cx >= this.world.cx || cz >= this.world.cz) continue;
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        const key = this.chunkKey(cx, cz);
        if (!this.chunks.has(key)) this.buildQueue.push({ key, d: dx * dx + dz * dz });
      }
      this.buildQueue.sort((a, b) => b.d - a.d);
      const lim = (R + 1.5) * (R + 1.5);
      for (const ch of this.chunks.values()) {
        const ddx = ch.cx - pcx, ddz = ch.cz - pcz;
        const vis = ddx * ddx + ddz * ddz <= lim;
        if (ch.solid) ch.solid.visible = vis;
        if (ch.water) ch.water.visible = vis;
      }
    }
    const start = performance.now();
    while (this.buildQueue.length && performance.now() - start < budgetMs) {
      this.rebuildChunk(this.buildQueue.pop().key);
    }
    return this.buildQueue.length;
  }
  // Called from the loading screen: build everything close to the player.
  prebuild() {
    this.queueTimer = 0;
    this.updateChunks(0, 1e9);
  }

  // ------------------------------------------------------------------- frame
  update(dt) {
    const input = this.app.input;
    const p = this.player;
    const playing = !this.paused && !this.overlay;

    this.time += dt / DAY_SECONDS;
    this.updateWeather(dt);

    if (playing) this.handleLook(input);
    const it = playing ? this.intent(input) : { fwd: 0, strafe: 0, run: false, crouch: false, jump: false, jumpHeld: false, crouchHeld: false };
    if (playing) this.handleKeys(input);

    const env = { rain: this.peace ? 0 : this.weather.rain };
    const res = p.update(dt, this.world, this.rafts, it, env);
    if (res.fallDamage > 0) this.damage(res.fallDamage);

    // breath underwater
    if (p.headInWater) {
      this.breath -= dt;
      if (this.breath <= 0) { this.breath = 1; this.damage(8); }
    } else this.breath = Math.min(15, this.breath + dt * 4);

    if (playing) { this.handleDig(dt, input); this.handlePlace(dt, input); }
    else { this.dig.key = null; this.crack.visible = false; }
    this.updateCraft(dt);

    for (const r of this.rafts) r.update(dt);
    this.particles.update(dt);

    // camera
    const eye = p.eye(this.tmpV);
    this.camera.position.copy(eye);
    if (p.raft) this.camera.position.y += Math.sin(p.raft.t * 1.3) * 0.03;
    this.camera.rotation.set(p.pitch, p.yaw, 0);
    const targetFov = this.zoom ? 16 : (p.running && Math.hypot(p.vel.x, p.vel.z) > 5 ? 80 : 75);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
    this.camera.far = (this.settings.renderDist + 1.5) * CHUNK + 40;

    this.sky.update(dt, this.time % 1, this.peace ? 0 : this.weather.rain, this.camera.position, this.peace);
    this.flashlight.intensity = this.lightOn ? 14 : 0;

    this.updateChunks(dt);
    this.hud.update(dt);

    if (!this.paused) {
      this.autosave -= dt;
      if (this.autosave <= 0) { this.autosave = 60; this.app.saveGame(true); }
    }
  }

  updateWeather(dt) {
    if (this.peace) { this.weather.rain = 0; setRain(0); return; }
    const w = this.weather;
    w.timer -= dt;
    if (w.timer <= 0) {
      w.timer = 120 + Math.random() * 260;
      w.target = Math.random() < 0.42 ? 0.45 + Math.random() * 0.55 : 0;
    }
    w.rain += Math.sign(w.target - w.rain) * Math.min(Math.abs(w.target - w.rain), dt * 0.04);
    setRain(this.paused ? 0 : w.rain);
    if (!this.paused && w.rain > 0.75 && Math.random() < dt / 40) sfx.thunder();
  }

  handleLook(input) {
    const s = this.settings.sensitivity * (this.zoom ? 0.25 : 1) * 0.0022;
    const p = this.player;
    p.yaw -= input.mouse.dx * s;
    p.pitch -= input.mouse.dy * s * (this.settings.invertY ? -1 : 1);
    p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch));
  }

  intent(input) {
    const k = (c) => input.down(c);
    let fwd = (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0) - input.move.y;
    let strafe = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0) + input.move.x;
    fwd = Math.max(-1, Math.min(1, fwd)); strafe = Math.max(-1, Math.min(1, strafe));
    if (input.thit('run')) this.touchRun = !this.touchRun;
    if (input.thit('crouch')) this.touchCrouch = !this.touchCrouch;
    if (input.touch) {
      document.querySelector('[data-btn=run]').classList.toggle('on', !!this.touchRun);
      document.querySelector('[data-btn=crouch]').classList.toggle('on', !!this.touchCrouch);
    }
    const crouch = k('KeyC') || k('ControlLeft') || !!this.touchCrouch;
    const jumpHeld = k('Space') || input.tdown('jump');
    return {
      fwd, strafe, run: k('ShiftLeft') || k('ShiftRight') || !!this.touchRun,
      crouch: crouch && !this.player.flying, crouchHeld: crouch, jump: jumpHeld, jumpHeld,
    };
  }

  handleKeys(input) {
    const inv = this.inv;
    for (let i = 0; i < 9; i++) if (input.hit('Digit' + (i + 1))) { inv.sel = i; this.hud.dirtyHotbar = true; }
    if (input.mouse.wheel) { inv.sel = (inv.sel + (input.mouse.wheel > 0 ? 1 : 8)) % 9; this.hud.dirtyHotbar = true; }
    if (input.hit('KeyF') || input.thit('light')) {
      this.lightOn = !this.lightOn; sfx.toggle();
      this.hud.toast(t(this.lightOn ? 'hud.lightOn' : 'hud.lightOff'));
    }
    this.zoom = input.down('KeyZ') || input.tdown('zoom');
    if (this.peace && (input.doubleSpace || input.thit('fly'))) {
      this.player.flying = !this.player.flying; this.player.vel.y = 0;
      this.hud.toast(t(this.player.flying ? 'hud.flyOn' : 'hud.flyOff'));
    }
    if (input.hit('KeyI') || input.hit('Tab') || input.thit('inv')) this.app.openPanel('inventory');
    if (input.hit('KeyK') || input.thit('craft')) this.app.openPanel('craft');
  }

  // ------------------------------------------------------------ dig & place
  aim() {
    const eye = this.player.eye(this.tmpV.clone());
    const dir = this.player.lookDir(this.tmpD);
    return { eye, dir };
  }
  targetRaft(eye, dir, max) {
    let best = null, bd = max;
    for (const r of this.rafts) { const d = r.hitTest(eye, dir, bd); if (d != null && d < bd) { bd = d; best = r; } }
    return best ? { raft: best, dist: bd } : null;
  }

  handleDig(dt, input) {
    const { eye, dir } = this.aim();
    const hit = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    const rh = this.targetRaft(eye, dir, hit ? hit.dist : REACH);
    if (hit && !rh) {
      this.highlight.visible = true;
      this.highlight.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    } else this.highlight.visible = false;

    const digging = input.mouse.left || input.tdown('dig');
    if (!digging) { this.dig.key = null; this.dig.progress = 0; this.crack.visible = false; this.hud.digProgress = 0; return; }

    if (rh) { // pack up a raft
      const key = 'raft';
      if (this.dig.key !== key) { this.dig.key = key; this.dig.progress = 0; }
      this.dig.progress += dt / 1.2;
      this.hud.digProgress = this.dig.progress;
      if (this.dig.progress >= 1) {
        if (this.player.standingRaft([rh.raft])) return;
        rh.raft.dispose(); this.rafts = this.rafts.filter((r) => r !== rh.raft);
        this.give('raft', 1); sfx.breakBlock('wood'); this.hud.toast(t('hud.raftTaken'));
        this.dig.key = null; this.hud.digProgress = 0;
      }
      return;
    }
    if (!hit) { this.dig.key = null; this.crack.visible = false; this.hud.digProgress = 0; return; }
    const def = BLOCKS[hit.id];
    if (!isFinite(def.hard) || this.world.isLocked(hit.x, hit.y, hit.z)) { this.hud.digProgress = 0; return; }
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    if (this.dig.key !== key) { this.dig.key = key; this.dig.progress = 0; this.dig.tick = 0; }
    let speed = BODY.digSpeed / def.hard;
    if (this.peace) speed *= 3;
    if (this.player.swimming) speed *= 0.5;
    this.dig.progress += dt * speed;
    this.dig.tick -= dt;
    if (this.dig.tick <= 0) { this.dig.tick = 0.25; sfx.dig(def.name); }
    this.hud.digProgress = this.dig.progress;
    this.crack.visible = true;
    this.crack.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    this.crack.material.map = this.crackTex[Math.min(4, Math.floor(this.dig.progress * 5))];
    if (this.dig.progress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z);
      this.dig.key = null; this.dig.progress = 0; this.crack.visible = false; this.hud.digProgress = 0;
    }
  }

  breakBlock(x, y, z) {
    const w = this.world;
    const id = w.get(x, y, z);
    const def = BLOCKS[id];
    if (id === B.LOG) { this.fellTree(x, y, z); return; }
    // still water: a block dug out from under water fills in place, nothing flows
    const above = w.get(x, y + 1, z);
    let sideWater = false;
    if (y < SEA) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (w.get(x + dx, y, z + dz) === B.WATER) sideWater = true;
    w.set(x, y, z, above === B.WATER || (sideWater && y === SEA - 1) ? B.WATER : B.AIR);
    if (def.drop) this.give(def.drop, 1);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, def.color, 14, 4, 0.7);
    sfx.breakBlock(def.name);
  }

  fellTree(x, y, z) {
    const w = this.world;
    const logs = [];
    const seen = new Set();
    const stack = [[x, y, z]];
    while (stack.length && logs.length < 80) {
      const [cx, cy, cz] = stack.pop();
      const k = cx + ',' + cy + ',' + cz;
      if (seen.has(k)) continue;
      seen.add(k);
      if (w.get(cx, cy, cz) !== B.LOG) continue;
      logs.push([cx, cy, cz]);
      for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy || dz) stack.push([cx + dx, cy + dy, cz + dz]);
      }
    }
    for (const [lx, ly, lz] of logs) {
      w.set(lx, ly, lz, B.AIR);
      this.particles.burst(lx + 0.5, ly + 0.5, lz + 0.5, BLOCKS[B.LOG].color, 5, 3, 0.8);
    }
    // the crown comes down with the trunk
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = 0;
    for (const [lx, ly, lz] of logs) { minX = Math.min(minX, lx); maxX = Math.max(maxX, lx); minZ = Math.min(minZ, lz); maxZ = Math.max(maxZ, lz); minY = Math.min(minY, ly); maxY = Math.max(maxY, ly); }
    for (let yy = minY; yy <= maxY + 3; yy++) for (let zz = minZ - 3; zz <= maxZ + 3; zz++) for (let xx = minX - 3; xx <= maxX + 3; xx++) {
      if (w.get(xx, yy, zz) === B.LEAVES) {
        w.set(xx, yy, zz, B.AIR);
        if (Math.random() < 0.15) this.particles.burst(xx + 0.5, yy + 0.5, zz + 0.5, BLOCKS[B.LEAVES].color, 3, 2, 1.2, 6);
      }
    }
    this.give('wood', logs.length);
    sfx.fell();
  }

  blockOverlapsBodies(x, y, z) {
    const p = this.player.pos, h = this.player.height;
    const hw = BODY.halfWidth;
    if (x + 1 > p.x - hw && x < p.x + hw && z + 1 > p.z - hw && z < p.z + hw && y + 1 > p.y && y < p.y + h) return true;
    for (const r of this.rafts) {
      const b = r.box();
      if (x + 1 > b.minX && x < b.maxX && z + 1 > b.minZ && z < b.maxZ && y + 1 > b.minY && y < b.maxY) return true;
    }
    return false;
  }

  // First open water-surface cell along the aim (for bridges and rafts),
  // skipping cells the player or a raft occupies. Null if solid ground is closer.
  surfaceAim(eye, dir) {
    const w = this.world;
    const solid = w.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    const max = solid ? solid.dist : REACH;
    for (let d = 0.05; d < max; d += 0.05) {
      const x = Math.floor(eye.x + dir.x * d), y = Math.floor(eye.y + dir.y * d), z = Math.floor(eye.z + dir.z * d);
      if (w.get(x, y, z) === B.WATER && w.get(x, y + 1, z) === B.AIR && !this.blockOverlapsBodies(x, y, z)) {
        return { x, y, z, id: B.WATER, nx: 0, ny: 1, nz: 0, dist: d };
      }
    }
    return null;
  }

  handlePlace(dt, input) {
    this.placeCooldown -= dt;
    const want = input.mouse.rightPressed || input.thit('place') || ((input.mouse.right || input.tdown('place')) && this.placeCooldown <= 0);
    if (!want) return;
    this.placeCooldown = 0.25;
    const item = this.selected();
    if (!item) return;
    const def = ITEMS[item];
    const { eye, dir } = this.aim();
    const hit = this.surfaceAim(eye, dir) || this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);

    if (def.place === 'raft') {
      if (!this.has('raft')) { this.hud.toast(t('hud.cantPlace', { item: t('item.raft') })); sfx.error(); return; }
      if (!hit || hit.id !== B.WATER) { this.hud.toast(t('hud.raftNeedWater')); sfx.error(); return; }
      const cx = hit.x + 0.5, cz = hit.z + 0.5;
      if (!Raft.fits(this.world, cx, cz) || this.rafts.some((r) => Math.abs(r.x - cx) < 3 && Math.abs(r.z - cz) < 3)) {
        this.hud.toast(t('hud.raftNeedWater')); sfx.error(); return;
      }
      this.take('raft');
      this.rafts.push(new Raft(this.scene, cx, cz, this.atlas));
      sfx.splash(); this.hud.toast(t('hud.raftPlaced')); this.hud.dirtyHotbar = true;
      return;
    }
    if (def.block == null || !hit) return;
    if (!this.has(item)) { this.hud.toast(t('hud.cantPlace', { item: t('item.' + item) })); sfx.error(); return; }
    let x, y, z;
    if (hit.id === B.WATER) { x = hit.x; y = hit.y; z = hit.z; }   // bridges: build right on the water
    else { x = hit.x + hit.nx; y = hit.y + hit.ny; z = hit.z + hit.nz; }
    const cur = this.world.get(x, y, z);
    if (!this.world.inside(x, y, z) || y >= WORLD_H - 1) return;
    if (cur !== B.AIR && cur !== B.WATER && cur !== B.LEAVES) return;
    if (this.blockOverlapsBodies(x, y, z)) return;
    this.world.set(x, y, z, def.block);
    this.take(item);
    sfx.place();
    this.hud.dirtyHotbar = true;
  }

  // ------------------------------------------------------------------ crafting
  canCraft(r) {
    if (this.peace) return true;
    return Object.entries(r.needs).every(([id, n]) => this.has(id, n));
  }
  startCraft(r) {
    if (this.craft) { this.hud.toast(t('craft.busy')); sfx.error(); return false; }
    if (!this.canCraft(r)) { sfx.error(); return false; }
    for (const [id, n] of Object.entries(r.needs)) this.take(id, n);
    this.craft = { r, t: 0, total: this.peace ? 0.3 : r.time, at: this.player.pos.clone(), tick: 0 };
    this.hud.dirtyHotbar = true;
    return true;
  }
  updateCraft(dt) {
    const c = this.craft;
    if (!c) return;
    if (this.player.pos.distanceTo(c.at) > 3.5) {
      for (const [id, n] of Object.entries(c.r.needs)) this.give(id, n, true); // materials returned
      this.craft = null; this.hud.toast(t('hud.craftCancel')); sfx.error(); return;
    }
    c.t += dt;
    c.tick -= dt;
    if (c.tick <= 0) { c.tick = 0.6; sfx.craftTick(); }
    if (c.t >= c.total) {
      this.give(c.r.id, 1, true);
      this.hud.toast(t('hud.crafted', { item: t('item.' + c.r.id) }));
      sfx.done();
      this.craft = null;
    }
  }

  damage(n) {
    if (this.peace) return;
    this.player.health = Math.max(0, this.player.health - n);
    this.hud.flash();
    sfx.hurt();
    if (this.player.health <= 0) this.die();
  }
  die() {
    // Stage 1: simple respawn. Later stages add the full death rules.
    const s = this.world.spawn;
    this.player.pos.set(s.x, s.y, s.z); this.player.vel.set(0, 0, 0);
    this.player.health = 100;
  }

  // ----------------------------------------------------------------- saving
  toSave() {
    const p = this.player;
    return {
      v: SAVE_FORMAT, id: this.save.id, name: this.save.name, created: this.save.created, updated: Date.now(),
      cfg: this.cfg, time: this.time, weather: this.weather,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, hunger: p.hunger, flying: p.flying },
      inv: this.inv,
      rafts: this.rafts.map((r) => ({ x: r.x, z: r.z })),
      edits: this.world.serializeEdits(),
    };
  }

  render(renderer) { renderer.render(this.scene, this.camera); }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); }

  dispose() {
    setRain(0);
    for (const ch of this.chunks.values()) for (const k of ['solid', 'water']) if (ch[k]) ch[k].geometry.dispose();
    this.rafts.forEach((r) => r.dispose());
    this.tex.dispose(); this.matSolid.dispose(); this.matWater.dispose();
    this.crackTex.forEach((x) => x.dispose());
    this.hud.dispose();
  }
}

export { RECIPES };
