// One running world: owns the scene, world, player, rafts and per-frame logic.
import * as THREE from 'three';
import { CHUNK, SEA, DAY_SECONDS, QUALITY, SAVE_FORMAT, WORLD_H, BODY } from './config.js';
import { B, BLOCKS } from './blocks.js';
import { World } from './world.js';
import { generate } from './worldgen.js';
import { buildChunk, skyAt } from './mesher.js';
import { buildAtlas, buildCracks } from './textures.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { Raft } from './raft.js';
import { Particles } from './particles.js';
import { ITEMS, UNLIMITED, RECIPES, WEAPON_IDS } from './items.js';
import { Animals } from './animals.js';
import { Pickups } from './pickups.js';
import { Campfires } from './campfire.js';
import { ViewModel } from './viewmodel.js';
import { Combat, WEAPONS } from './weapons.js';
import { Explosives } from './explosives.js';
import { Enemies } from './soldiers.js';
import { Flashlight } from './flashlight.js';
import { Forts } from './forts.js';
import { ScopeView } from './scope.js';
import { OrderWheel } from './orders.js';
import { Cabin } from './cabin.js';
import { ContextBar } from './context.js';
import { Mission } from './missions.js';
import { addStats, recordMission } from './stats.js';
import { setCharacterQuality } from './characters.js';
import { sfx, setRain } from './audio.js';
import { HUD } from './hud.js';
import { t } from './i18n.js';

const REACH = BODY.reach;
const HUNGER_DAYS = 4;              // a full stomach empties in about 4 in-game days
const CRAFT_RANGE = 4.5;            // walk further than this from the fire and crafting stops

export class Game {
  constructor(app, save) {
    this.app = app;
    this.save = save;
    this.cfg = save.cfg;
    this.peace = this.cfg.mode === 'peace';
    // Time of day: full day/night cycle, or always daytime (Peace is always day)
    this.dayOnly = this.peace || this.cfg.timeMode === 'day';
    document.body.classList.toggle('peace', this.peace);
    document.body.classList.toggle('allies', this.cfg.sub === 'allies' && !this.peace);
    this.settings = app.settings;
    this.quality = QUALITY[this.settings.quality] || QUALITY.medium;
    setCharacterQuality(this.settings.quality);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // world
    this.world = new World(this.cfg);
    generate(this.world);
    this.world.applyEdits(save.edits);
    this.world.onSet = (x, y, z, old, id) => {
      if (old === B.CAMPFIRE) this.campfires.remove(x, y, z);
      if (id === B.CAMPFIRE) this.campfires.add(x, y, z);
    };

    // materials
    this.atlas = buildAtlas();
    const tex = new THREE.CanvasTexture(this.atlas.canvas);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
    this.tex = tex;
    this.matSolid = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.5 });
    this.matWater = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    // warm self-light for fort lamps and fort interiors (always on, strongest at night)
    this.glowUniform = { value: 1 };
    for (const m of [this.matSolid, this.matWater]) {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uGlow = this.glowUniform;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;\nattribute float sky;\nvarying float vSky;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;\nvSky = sky;');
        // sky light only dims sun, moon and sky (directional + ambient/hemisphere),
        // never the flashlight, campfires or fort lamps
        const begin = THREE.ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          'getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= vSky;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vGlow;\nuniform float uGlow;\nvarying float vSky;')
          .replace('#include <lights_fragment_begin>', begin)
          .replace('#include <lights_fragment_end>', '#if defined( RE_IndirectDiffuse )\n\tirradiance *= vSky;\n#endif\n#include <lights_fragment_end>')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * uGlow * diffuseColor.rgb * vec3(1.0, 0.78, 0.52);');
      };
    }
    this.chunks = new Map();
    this.buildQueue = [];
    this.queueTimer = 0;

    this.sky = new Sky(this.scene, this.quality);
    this.particles = new Particles(this.scene);
    this.particles.density = this.quality.particles;

    // flashlight (standard gear, always available)
    this.flashlight = new Flashlight(this.camera);
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
    this.scopeView = new ScopeView(this);
    this.orders = new OrderWheel(this);
    this.ctx = new ContextBar(this);

    this.stats = save.stats ? { ...save.stats } : { animals: 0, deaths: 0 };
    this.campfires = new Campfires(this);
    this.pickups = new Pickups(this, save.pickups || []);
    this.animals = new Animals(this);
    this.vm = new ViewModel();
    this.combat = new Combat(this);
    this.explosives = new Explosives(this);
    this.forts = new Forts(this, save.forts);
    this.cabin = new Cabin(this, save.cabin);
    this.enemies = new Enemies(this, { followers: save.followers });
    this.supplyT = 0;
    this.shake = 0;
    this.tntWarnT = 0;
    this.use = { item: null, t: 0 };
    this.hungerStage = this.player.hunger <= 0 ? 2 : this.player.hunger < 20 ? 1 : 0;

    if (this.stats.aloneSince == null) this.stats.aloneSince = this.time;
    this.statsFlushed = { ...this.stats, time: this.time };
    this.hud = new HUD(this);
    this.mission = this.cfg.gameType === 'mission' && this.cfg.mission ? new Mission(this, this.cfg.mission, save.mission) : null;
    this.tmpV = new THREE.Vector3(); this.tmpD = new THREE.Vector3();
  }

  defaultInventory() {
    const inv = { counts: {}, hotbar: Array(9).fill(null), sel: 0 };
    if (this.peace) {
      // relaxed mode: plenty of hunting weapons from the start
      inv.hotbar = ['shovel', 'knife', 'rifle', 'flint', 'dirt', 'wood', 'stone', 'sandbag', 'raft'];
      for (const w of ['knife', 'pistol', 'rifle', 'sniper', 'smg']) inv.counts[w] = 1;
    } else {
      inv.hotbar[0] = 'shovel'; inv.hotbar[1] = 'flint';
    }
    return inv;
  }

  // ---------------------------------------------------------------- inventory
  count(id) { return this.peace && UNLIMITED.includes(id) ? Infinity : (this.inv.counts[id] || 0); }
  has(id, n = 1) { return this.count(id) >= n; }
  take(id, n = 1) { if (this.peace && UNLIMITED.includes(id)) return; this.inv.counts[id] = Math.max(0, (this.inv.counts[id] || 0) - n); }
  armor() { return (this.has('helmet') ? ITEMS.helmet.armor : 0) + (this.has('vest') ? ITEMS.vest.armor : 0); }
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

    if (playing) this.orders.update(dt, input); else if (this.orders.isOpen) this.orders.close();
    this.ctx.update(dt, input, playing);
    if (playing) this.handleLook(input);
    const it = playing ? this.intent(input) : { fwd: 0, strafe: 0, run: false, crouch: false, jump: false, jumpHeld: false, crouchHeld: false };
    if (playing) this.handleKeys(input);

    const inWire = [0.2, 1.0].some((dy) => this.world.get(Math.floor(p.pos.x), Math.floor(p.pos.y + dy), Math.floor(p.pos.z)) === B.WIRE);
    const env = { rain: this.peace ? 0 : this.weather.rain, speedMul: inWire ? 0.4 : 1 };
    const res = p.update(dt, this.world, this.obstacles(), it, env);
    if (res.fallDamage > 0) this.damage(res.fallDamage);

    // breath underwater
    if (p.headInWater) {
      this.breath -= dt;
      if (this.breath <= 0) { this.breath = 1; this.damage(8); }
    } else this.breath = Math.min(15, this.breath + dt * 4);

    if (playing) { this.handleDig(dt, input); this.handleUse(dt, input); this.handlePlace(dt, input); }
    else { this.dig.key = null; this.crack.visible = false; this.use.t = 0; }
    this.combat.update(dt, input, playing);
    this.updateCraft(dt);
    if (!this.paused) this.updateHunger(dt);

    for (const r of this.rafts) r.update(dt);
    this.particles.update(dt);
    if (!this.paused) {
      this.animals.update(dt); this.pickups.update(dt);
      this.enemies.update(dt); this.explosives.update(dt); this.forts.update(dt);
      if (this.mission) this.mission.update(dt);
      this.supplyT -= dt;
      this.updateDefuse(dt);
    }
    this.campfires.update(dt);

    // camera
    const eye = p.eye(this.tmpV);
    this.camera.position.copy(eye);
    if (p.raft instanceof Raft) this.camera.position.y += Math.sin(p.raft.t * 1.3) * 0.03;
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      this.shake = Math.max(0, this.shake - dt * 2);
    }
    this.scopeView.update(dt, input, playing);
    this.camera.rotation.set(p.pitch + this.scopeView.pitch, p.yaw + this.scopeView.yaw, 0);
    const scoped = this.scopeView.ease() > 0.5;
    const targetFov = this.scopeView.fov(p.running && Math.hypot(p.vel.x, p.vel.z) > 5 ? 80 : 75);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10);
      this.camera.updateProjectionMatrix();
    }
    this.camera.far = (this.settings.renderDist + 1.5) * CHUNK + 40;

    this.sky.update(dt, this.time % 1, this.peace ? 0 : this.weather.rain, this.camera.position, this.dayOnly);
    // how much daylight reaches the player's eyes (dark in tunnels)
    this.eyeSkyT = (this.eyeSkyT || 0) - dt;
    if (this.eyeSkyT <= 0) { this.eyeSkyT = 0.3; this.eyeSky = skyAt(this.world, eye.x, eye.y, eye.z); }
    this.glowUniform.value = 0.2 + 0.65 * (1 - this.sky.daylight);
    this.flashlight.on = this.lightOn;
    this.flashlight.update(1 - this.sky.daylight, this.peace ? 0 : this.weather.rain);

    this.updateChunks(dt);
    this.vm.set(scoped ? null : this.selected());
    this.vm.update(dt, {
      moving: p.onGround && Math.hypot(p.vel.x, p.vel.z) > 0.5, sprint: p.running,
      light: Math.min(1, this.sky.daylight * (this.eyeSky ?? 1) + (this.lightOn ? 0.45 : 0) + (this.campfires.near(p.pos, 8) ? 0.3 : 0)), aim: false,
    });
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
    const s = this.settings.sensitivity * this.scopeView.sensitivity() * 0.0022;
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
    if (!this.orders.eatKeys) for (let i = 0; i < 9; i++) if (input.hit('Digit' + (i + 1))) { inv.sel = i; this.hud.dirtyHotbar = true; }
    if (input.mouse.wheel) { inv.sel = (inv.sel + (input.mouse.wheel > 0 ? 1 : 8)) % 9; this.hud.dirtyHotbar = true; }
    if (input.hit('KeyF') || input.thit('light')) {
      this.lightOn = !this.lightOn; sfx.toggle();
      this.hud.toast(t(this.lightOn ? 'hud.lightOn' : 'hud.lightOff'));
    }
    if (this.peace && (input.doubleSpace || input.thit('fly'))) {
      this.player.flying = !this.player.flying; this.player.vel.y = 0;
      this.hud.toast(t(this.player.flying ? 'hud.flyOn' : 'hud.flyOff'));
    }
    if (input.hit('KeyI') || input.hit('Tab') || input.thit('inv')) this.app.openPanel('inventory');
    if (input.hit('KeyM')) this.app.openPanel('map', { from: 'game' });
    if (input.hit('KeyE') && this.useSupply()) { /* fort rations */ }
    else if (input.hit('KeyK') || input.thit('craft') || (input.hit('KeyE') && this.campfires.near(this.player.pos))) this.app.openPanel('craft');
  }

  // ------------------------------------------------------------ dig & place
  aim() {
    const eye = this.player.eye(this.tmpV.clone());
    const p = this.player, sv = this.scopeView;
    // the scope's breathing sway moves the point of aim too
    const yaw = p.yaw + sv.yaw, pitch = p.pitch + sv.pitch, cp = Math.cos(pitch);
    const dir = this.tmpD.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
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

    const digging = (input.mouse.left || input.tdown('dig')) && !WEAPONS[this.selected()];
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
    // a ration crate or the cabin chest: right-click / USE works like E
    if ((input.mouse.rightPressed || input.thit('place')) && this.useSupply()) return;
    const item = this.selected();
    if (!item) return;
    const def = ITEMS[item];
    if (def.weapon || def.throwable || def.food || def.heal) return;  // handled by combat / handleUse
    const { eye, dir } = this.aim();
    if (item === 'flint') { this.useFlint(eye, dir); return; }
    const hit = this.surfaceAim(eye, dir) || this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    if (def.place === 'watchtower') { this.placeWatchtower(hit); return; }

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
    if (this.forts.protectedCell(x, y, z)) { this.hud.toast(t('fort.noBuild')); sfx.error(); return; }
    this.world.set(x, y, z, def.block);
    this.take(item);
    sfx.place();
    this.hud.dirtyHotbar = true;
  }

  // Flint and steel: light a campfire from 3 wood (firewood) on solid ground.
  useFlint(eye, dir) {
    const hit = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    // light a TNT crate: instant, but you have to be right next to it
    if (hit && hit.id === B.TNT) {
      this.explosives.igniteTNT(hit.x, hit.y, hit.z, 4, 'player');
      this.vm.doSwing(); this.hud.toast(t('hud.tntLit'), 'warn');
      return;
    }
    if (!hit || hit.ny !== 1) { this.hud.toast(t('hud.fireWhere')); sfx.error(); return; }
    const x = hit.x, y = hit.y + 1, z = hit.z;
    if (this.world.get(x, y, z) !== B.AIR || hit.id === B.WATER || hit.id === B.WIRE) { this.hud.toast(t('hud.fireWhere')); sfx.error(); return; }
    // inside a fort the only thing you may place is a campfire (for crafting)
    if (this.forts.protectedCell(x, y, z) && !this.forts.interiorCell(x, y, z)) { this.hud.toast(t('fort.noBuild')); sfx.error(); return; }
    if (!this.has('wood', 3)) { this.hud.toast(t('hud.fireWood')); sfx.error(); return; }
    this.take('wood', 3);
    this.world.set(x, y, z, B.CAMPFIRE);
    this.vm.doSwing();
    sfx.ignite();
    this.particles.burst(x + 0.5, y + 0.3, z + 0.5, [1, 0.7, 0.3], 10, 2, 0.5, 4);
    this.hud.toast(t('hud.fireLit'));
    this.hud.dirtyHotbar = true;
  }

  // A small wooden lookout: corner ladder trunk, platform, half railing.
  placeWatchtower(hit) {
    if (!hit || hit.ny !== 1 || hit.id === B.WATER) { this.hud.toast(t('hud.towerWhere')); sfx.error(); return; }
    if (!this.has('watchtower')) { this.hud.toast(t('hud.cantPlace', { item: t('item.watchtower') })); sfx.error(); return; }
    const w = this.world, cx = hit.x, by = hit.y + 1, cz = hit.z;
    if (this.forts.protectedCell(cx, by, cz) || this.forts.protectedCell(cx + 1, by, cz + 1) || this.forts.protectedCell(cx - 1, by, cz - 1)) { this.hud.toast(t('fort.noBuild')); sfx.error(); return; }
    for (let y = by; y <= by + 6; y++) for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
      const b = w.get(x, y, z);
      if (!w.inside(x, y, z) || (b !== B.AIR && b !== B.LEAVES) || this.blockOverlapsBodies(x, y, z)) { this.hud.toast(t('hud.towerSpace')); sfx.error(); return; }
    }
    for (let y = by; y <= by + 4; y++) w.set(cx - 1, y, cz - 1, B.LOG);          // climbable corner post
    for (const [x, z] of [[cx + 1, cz - 1], [cx - 1, cz + 1], [cx + 1, cz + 1]]) for (let y = by; y < by + 4; y++) w.set(x, y, z, B.WOOD);
    for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) if (!(x === cx - 1 && z === cz - 1)) w.set(x, by + 4, z, B.WOOD);
    for (const [x, z] of [[cx + 1, cz - 1], [cx + 1, cz], [cx + 1, cz + 1], [cx, cz + 1], [cx - 1, cz + 1]]) w.set(x, by + 5, z, B.WOOD);
    this.take('watchtower');
    sfx.place(); this.hud.dirtyHotbar = true;
  }

  // Eating (food) and medkits: hold the use button.
  handleUse(dt, input) {
    const id = this.selected();
    const def = ITEMS[id];
    const holding = input.mouse.right || input.tdown('place');
    if (!def || !(def.food || def.heal) || !holding || !this.has(id)) {
      if (this.use.t > 0) this.hud.digProgress = 0;
      this.use.t = 0; return;
    }
    const total = def.heal ? 1.6 : 1.2;
    if (this.use.t === 0) { if (def.food) sfx.eat(); this.vm.doSwing(); }
    this.use.t += dt;
    this.hud.digProgress = this.use.t / total;
    if (this.use.t >= total) {
      this.use.t = 0; this.hud.digProgress = 0;
      this.take(id);
      const p = this.player;
      if (def.food) {
        p.hunger = Math.min(100, p.hunger + def.food);
        if (p.hunger > 20) this.hungerStage = 0;
        this.hud.toast(t(id === 'meat_raw' ? 'hud.ateRaw' : 'hud.ate'));
      } else {
        p.health = Math.min(100, p.health + def.heal);
        sfx.heal(); this.hud.toast(t('hud.healed'));
      }
      this.hud.dirtyHotbar = true;
    }
  }

  updateHunger(dt) {
    if (this.peace) { this.player.hunger = 100; return; }
    const p = this.player;
    const rate = 100 / (HUNGER_DAYS * DAY_SECONDS) * (p.running ? 1.5 : 1);
    p.hunger = Math.max(0, p.hunger - rate * dt);
    if (p.hunger < 20 && this.hungerStage < 1) { this.hungerStage = 1; this.hud.toast(t('hud.veryHungry'), 'warn'); sfx.warn(); }
    if (p.hunger <= 0) {
      if (this.hungerStage < 2) { this.hungerStage = 2; this.hud.toast(t('hud.sick'), 'warn'); sfx.warn(); }
      // sick from hunger: about one more in-game day before it kills
      p.health -= 100 / DAY_SECONDS * dt;
      if (p.health <= 0) this.die('starve');
    } else if (p.hunger > 50 && p.health < 100) {
      p.health = Math.min(100, p.health + 0.35 * dt); // slow recovery when fed
    }
  }

  // Where the player comes back: an allied fort; with allies but no forts,
  // a random spot with 4-5 allies; alone, the cabin (spawn point).
  respawn() {
    const p = this.player;
    p.vel.set(0, 0, 0);
    if (this.cfg.sub === 'allies') {
      const own = this.forts.list.filter((f) => f.owner === 'ally');
      if (own.length) {
        const f = own[Math.floor(Math.random() * own.length)];
        p.pos.set(f.cx + 0.5, f.base, f.cz + 0.5);
        return;
      }
      const at = this.enemies.farSpot(50, 'ally') || this.world.spawn;
      p.pos.set(at.x, at.y, at.z);
      this.enemies.rallyAround(p.pos, 4 + Math.floor(Math.random() * 2));
      this.hud.toast(t('hud.regroup'), 'warn');
      return;
    }
    // alone: wake up beside the cabin bed
    const s = this.cabin.on ? this.cabin.bedSpot() : this.world.spawn;
    p.pos.set(s.x, s.y, s.z);
  }

  // Ration crates in the player's own forts: unlimited food.
  useSupply() {
    const { eye, dir } = this.aim();
    const hit = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, REACH);
    if (!hit || hit.id !== B.SUPPLY) return false;
    if (this.cabin.isChest(hit.x, hit.y, hit.z)) { this.app.openPanel('chest'); return true; }
    const f = this.forts.fortAt(new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5));
    if (!f || f.owner !== 'ally') { this.hud.toast(t('fort.notYours')); sfx.error(); return true; }
    if (this.supplyT > 0) { this.hud.toast(t('fort.rationsWait')); return true; }
    this.supplyT = 30;
    this.give('meat_cooked', 2);
    this.player.hunger = 100;
    sfx.done();
    return true;
  }

  // Solid things the player collides with besides blocks.
  obstacles() {
    const tank = this.enemies && this.enemies.tank;
    return tank ? [...this.rafts, tank] : this.rafts;
  }

  // Lit TNT: approaching it is risky; touching it (staying next to it)
  // pulls the wires and defuses it.
  updateDefuse(dt) {
    const p = this.player.pos;
    this.defusing = null;
    for (const l of this.explosives.lit.values()) {
      if (l.owner === 'chain' || l.owner === 'shot') continue;
      const d = Math.hypot(l.x + 0.5 - p.x, l.z + 0.5 - p.z);
      if (Math.abs(l.y - p.y) > 2.5) continue;
      if (d < 5 && !l.rolled) { l.rolled = true; if (l.owner === 'enemy' && Math.random() < 0.15) l.t = Math.min(l.t, 0.35); }
      if (d < 1.6) {
        l.defuse += dt;
        this.defusing = l;
        if (l.defuse >= 1.3) {
          this.explosives.unlight(this.world.idx(l.x, l.y, l.z));
          sfx.defuse(); this.hud.toast(t('hud.defused'));
        }
        break;
      } else l.defuse = 0;
    }
    this.hud.defuseProgress = this.defusing ? this.defusing.defuse / 1.3 : 0;
  }
  onEnemyTNT(x, y, z) {
    if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 40) {
      this.hud.toast(t('hud.tntWarn'), 'warn'); sfx.warn();
    }
  }

  // ------------------------------------------------------------------ crafting
  // Crafting needs a lit campfire nearby (Peace mode: anywhere).
  craftFire() { return this.peace ? true : this.campfires.near(this.player.pos); }
  hasMaterials(r) { return Object.entries(r.needs).every(([id, n]) => this.has(id, n)); }
  canCraft(r) { return !r.later && !!this.craftFire() && this.hasMaterials(r); }
  startCraft(r) {
    if (this.craft) { this.hud.toast(t('craft.busy')); sfx.error(); return false; }
    if (!this.canCraft(r)) { sfx.error(); return false; }
    for (const [id, n] of Object.entries(r.needs)) this.take(id, n);
    const fire = this.craftFire();
    const at = fire === true ? this.player.pos.clone() : new THREE.Vector3(fire.x + 0.5, fire.y, fire.z + 0.5);
    this.craft = { r, t: 0, total: this.peace ? 0.3 : r.time, at, tick: 0 };
    this.hud.dirtyHotbar = true;
    return true;
  }
  updateCraft(dt) {
    const c = this.craft;
    if (!c) return;
    const fireGone = !this.peace && !this.campfires.near(c.at, 0.8);
    if (Math.hypot(this.player.pos.x - c.at.x, this.player.pos.z - c.at.z) > CRAFT_RANGE || fireGone) {
      for (const [id, n] of Object.entries(c.r.needs)) this.give(id, n, true); // materials returned
      this.craft = null; this.hud.toast(t('hud.craftCancel')); sfx.error(); return;
    }
    c.t += dt;
    c.tick -= dt;
    if (c.tick <= 0) { c.tick = 0.6; sfx.craftTick(); }
    if (c.t >= c.total) {
      this.give(c.r.id, c.r.out || 1, true);
      this.hud.toast(t('hud.crafted', { item: t('item.' + c.r.id) }));
      sfx.done();
      this.craft = null;
    }
  }

  damage(n, cause = 'hurt', from = null) {
    if (this.peace || this.dead || n <= 0) return;
    this.player.health = Math.max(0, this.player.health - n * (1 - this.armor()));
    this.hud.flash();
    if (from) {
      const ang = Math.atan2(-(from.x - this.player.pos.x), -(from.z - this.player.pos.z)) - this.player.yaw;
      this.hud.damageFrom(ang);
    }
    sfx.hurt();
    if (this.player.health <= 0) this.die(cause);
  }

  // Death rules. Starving alone ends the game; starving with allies costs one
  // weapon; any other death loses every carried weapon.
  die(cause) {
    if (this.dead) return;
    this.stats.deaths = (this.stats.deaths || 0) + 1;
    const alone = this.cfg.sub === 'alone';
    if (cause === 'starve' && alone) { this.flushStats(); this.dead = true; this.app.gameOver(); return; }
    if (this.mission) this.mission.playerDied();
    this.stats.aloneSince = this.time;
    const carried = WEAPON_IDS.filter((w) => this.inv.counts[w] > 0);
    let lost = [];
    if (cause === 'starve') {
      if (carried.length) { const w = carried[Math.floor(Math.random() * carried.length)]; this.inv.counts[w]--; lost = [w]; }
      this.player.hunger = 60; this.hungerStage = 0;
    } else {
      for (const w of carried) this.inv.counts[w] = 0;
      lost = carried;
    }
    this.respawn();
    this.player.health = 100; this.breath = 15;
    this.scopeView.close();
    this.enemies.playerDied();
    this.craft = null;
    this.hud.dirtyHotbar = true;
    this.hud.bigMessage(t(cause === 'starve' ? 'hud.diedStarve' : 'hud.died'),
      lost.length ? t('hud.lostWeapons', { list: lost.map((w) => t('item.' + w)).join(', ') }) : '');
  }

  // ----------------------------------------------------------------- saving
  // push this world's progress into the lifetime statistics
  flushStats() {
    if (this.peace && !this.mission) { this.statsFlushed = { ...this.stats, time: this.time }; return; }
    const f = this.statsFlushed, s = this.stats, d = {};
    for (const k of ['fortsCaptured', 'fortsLost', 'enemies', 'animals']) d[k] = (s[k] || 0) - (f[k] || 0);
    d.days = Math.max(0, this.time - (f.time || 0));
    const maxes = this.cfg.sub === 'alone' ? { longestAlone: this.time - (s.aloneSince || 0) } : {};
    addStats(this.peace ? null : this.cfg.difficulty, d, maxes);
    this.statsFlushed = { ...this.stats, time: this.time };
  }
  missionEnded(result) {
    this.flushStats();
    if (result.ok) recordMission(this.peace ? null : this.cfg.difficulty, this.mission.id, result.medal);
    sfx[result.ok ? 'done' : 'warn']();
    this.app.saveGame(true);
    this.app.openPanel('missionEnd', result);
  }

  toSave() {
    const p = this.player;
    return {
      v: SAVE_FORMAT, id: this.save.id, name: this.save.name, created: this.save.created, updated: Date.now(),
      cfg: this.cfg, time: this.time, weather: this.weather,
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, pitch: p.pitch, health: p.health, hunger: p.hunger, flying: p.flying },
      inv: this.inv, stats: this.stats, pickups: this.pickups.toSave(),
      forts: this.forts.toSave(), followers: this.enemies.followers().length,
      rafts: this.rafts.map((r) => ({ x: r.x, z: r.z })),
      edits: this.world.serializeEdits(), cabin: this.cabin.toSave(), mission: this.mission ? this.mission.toSave() : null,
    };
  }

  render(renderer) { renderer.render(this.scene, this.camera); this.vm.render(renderer); }

  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.vm.resize(); }

  dispose() {
    setRain(0);
    for (const ch of this.chunks.values()) for (const k of ['solid', 'water']) if (ch[k]) ch[k].geometry.dispose();
    this.rafts.forEach((r) => r.dispose());
    this.animals.dispose(); this.pickups.dispose(); this.campfires.dispose(); this.combat.dispose();
    this.explosives.dispose(); this.enemies.dispose(); this.forts.dispose(); this.cabin.dispose(); document.body.classList.remove('scoped');
    this.world.onSet = null;
    this.tex.dispose(); this.matSolid.dispose(); this.matWater.dispose();
    this.crackTex.forEach((x) => x.dispose());
    this.hud.dispose();
  }
}

export { RECIPES };
