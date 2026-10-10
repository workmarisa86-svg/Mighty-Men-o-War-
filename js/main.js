// App bootstrap: renderer, menus, game lifecycle and the main loop.
import * as THREE from 'three';
import { GAME_VERSION, SAVE_FORMAT, QUALITY, WAR_SIZE, TOWN_SIZE, TOWN_LAYOUT } from './config.js';
import { loadSettings, saveSettings, readSave, writeSave, deleteSave, loadTown, deleteTown } from './storage.js';
import { M, loadMode, loadWar } from './modes.js';
import { BATTLE, COUNTRY, WEATHER, LANDS } from './countries.js';
import { startFolk, stopFolk, setFolk } from './folk.js';
import { setLang, setDevice, t, applyI18n, onLang } from './i18n.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { initAudio, setVolume, sfx } from './audio.js';
import { startMusic, stopMusic, setMusic, preloadMusic } from './music.js';

class App {
  constructor() {
    this.version = GAME_VERSION;
    this.settings = loadSettings();
    onLang(() => applyI18n());
    // phones/tablets and computers get their own control descriptions
    setDevice(matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window ? 'touch' : 'pc');
    setLang(this.settings.lang);
    document.body.classList.add('tb-' + (this.settings.touchSize || 'm'));
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x14160f);
    this.input = new Input(this.canvas, document.getElementById('touch'));
    this.input.onUnlock = () => { if (this.game && !this.game.paused && !this.game.overlay) this.pause(); };
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.canvas && this.game) { this.game.paused = false; this.ui.hide(); }
    });
    this.ui = new UI(this);
    this.game = null;
    this.applySettings();
    this.ui.show('start');

    addEventListener('resize', () => this.resize());
    // the menu music downloads after the page (and the splash art) have loaded
    addEventListener('load', () => setTimeout(() => preloadMusic(), 300));
    // audio may only start after the first tap or click; menu music then fades in
    addEventListener('pointerdown', () => { initAudio(); setMusic(this.settings.music, this.settings.musicMute); setFolk(this.settings.music, this.settings.musicMute); if (!this.game) this.menuMusic(); }, { capture: true });
    addEventListener('keydown', (e) => {
      initAudio();
      if (!this.game) return;
      if (this.game.overlay && (e.code === 'Escape' || (e.code === 'KeyI' && this.game.overlay === 'inventory') || (e.code === 'KeyK' && this.game.overlay === 'craft') || (e.code === 'KeyQ' && this.game.overlay === 'orders'))) {
        e.preventDefault(); this.closePanel();
      } else if (this.game.overlay === 'orders' && this.ui.orderKeys) this.ui.orderKeys(e.code);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game) { this.saveGame(true); if (!this.game.paused) this.pause(); }
    });
    addEventListener('pagehide', () => { if (this.game) this.saveGame(true); });
    this.resize();
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  applySettings() {
    saveSettings(this.settings);
    setVolume(this.settings.volume);
    setMusic(this.settings.music, this.settings.musicMute);
    setFolk(this.settings.music, this.settings.musicMute);
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.resAuto = { win: 0, frames: 0, good: 0 };
    this.res = this.resTarget();
    this.renderer.setPixelRatio(this.res);
    applyI18n();
    document.body.classList.remove('tb-s', 'tb-m', 'tb-l'); document.body.classList.add('tb-' + (this.settings.touchSize || 'm'));
    if (this.game) { this.game.settings = this.settings; this.game.quality = q; this.game.hud.dirtyHotbar = true; this.game.queueTimer = 0; this.game.hud.minimap.applySettings(); }
  }

  // Sharpness: how many pixels the 3D view is drawn with, as a share of the
  // screen's own (phones have 2 to 3 per point). Sharp is the screen's full
  // detail (up to 2x), Balanced about 1.3x, Fast 0.85x (blurrier, lightest).
  // Auto starts sharp and lowers it only while the frame rate drops below
  // about 40 fps, raising it again when there is room.
  resMax() { return Math.min(2, window.devicePixelRatio || 1); }
  resTarget() {
    const m = this.resMax(), r = this.settings.res || 'auto';
    if (r === 'sharp') return m;
    if (r === 'balanced') return Math.min(m, 1.3);
    if (r === 'fast') return Math.min(m, 0.85);
    return Math.min(m, this.input.touch ? 1.6 : m);            // auto: a sharp start, then adapt
  }
  adaptRes(dt) {
    if ((this.settings.res || 'auto') !== 'auto' || !this.game || this.game.paused || this.inTravel) return;
    const A = this.resAuto; A.win += dt; A.frames++;
    if (A.win < 1.5) return;
    const fps = A.frames / A.win; A.win = 0; A.frames = 0;
    let r = this.res;
    if (fps < 40) { r = Math.max(0.7, r - (fps < 28 ? 0.25 : 0.15)); A.good = 0; }      // too slow: fewer pixels
    else if (fps > 55 && ++A.good >= 3 && r < this.resMax()) { r = Math.min(this.resMax(), r + 0.1); A.good = 0; }   // room to spare: sharper
    if (Math.abs(r - this.res) > 0.01) { this.res = r; this.renderer.setPixelRatio(r); }
  }

  // menus: the War music, except on the Town Life menu (folk tunes)
  menuMusic() {
    const town = this.ui.current && this.ui.current.name === 'town';
    if (town) { stopMusic(); startFolk(); } else { stopFolk(); startMusic(); }
  }

  // Town Life: one persistent world (no save slots)
  startTown(fresh = false) {
    if (fresh) deleteTown();
    const L = fresh ? null : loadTown();
    this.townRebuilt = false;
    if (L && (L.state.layout || 1) < TOWN_LAYOUT) {
      // an older town layout: keep coins, honor, belongings and stats; the
      // world, the farm, the people and where you stand are made anew
      const s = L.state, tw = s.town || {};
      L.state = { v: s.v, layout: TOWN_LAYOUT, seed: s.seed, time: s.time, weather: s.weather, inv: s.inv, stats: s.stats,
        town: { money: tw.money, honor: tw.honor, bounty: 0, st: tw.st, livestock: (tw.livestock || []).map((a) => ({ type: a.type })) } };
      L.edits = null; this.townRebuilt = true;
    }
    const cfg = { mode: 'town', sub: 'town', difficulty: 'medium', timeMode: 'cycle', gameType: 'open', size: TOWN_SIZE, seed: L ? L.state.seed : (Math.random() * 2 ** 31) | 0 };
    const save = L ? Object.assign({ id: 'town', name: 'Town Life' }, L.state, { cfg, edits: L.edits }) : { id: 'town', name: 'Town Life', cfg };
    this.townRestored = !!(L && L.restored);
    stopFolk();
    this.startGame(save);
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.game) this.game.resize();
  }

  // War: side ('allies' | 'axis'), difficulty; day and night always cycle
  // Open World: a campaign across 14 countries, starting in your side's
  // home country. Battles: one real battle, started fresh and never saved.
  async newGame({ side = 'allies', difficulty = 'medium', name, gameType = 'open', battle = null }) {
    await loadWar();                     // War's own code (campaign, travel scenes...) loads now, not with the menus
    const size = WAR_SIZE, mode = 'war', sub = 'allies', timeMode = 'cycle', mission = null;
    const now = Date.now(), seed = (Math.random() * 2 ** 31) | 0;
    if (gameType === 'battle' && BATTLE[battle]) {
      const b = BATTLE[battle];
      if (side === b.att && (b.by === 'boat' || b.by === 'plane')) {
        // the attacker arrives by boat or plane: the scene plays first, in the battle's own opening weather
        this.ui.hide();
        this.travelScene({ by: b.by, to: b.c, side, n: 14, tod: 0.3, dateText: t('battle.' + battle) + ' · ' + b.date, weather: WEATHER[b.w[0][1]], normandy: battle === 'dday' })
          .then(() => this.startGame({ v: SAVE_FORMAT, id: 'battle', name: t('battle.' + battle), created: now, updated: now,
            cfg: { seed, size, mode, sub, side, difficulty, timeMode, gameType: 'battle', battle, country: b.c, mission } }));
        return;
      }
      this.startGame({ v: SAVE_FORMAT, id: 'battle', name: t('battle.' + battle), created: now, updated: now,
        cfg: { seed, size, mode, sub, side, difficulty, timeMode, gameType: 'battle', battle, country: BATTLE[battle].c, mission } });
      return;
    }
    this.startGame({
      v: SAVE_FORMAT, id: 'w' + now.toString(36), name, created: now, updated: now, followers: 4,
      cfg: { seed, size, mode, sub, side, difficulty, timeMode, gameType: 'open', mission, country: M.startCountry(side) },
    });
  }
  // Travel to another country (from the officer's room): this country is
  // stored as a small record, the chosen soldiers come along, a short boat
  // or plane scene plays (Skip ends it) and the new country loads.
  async travel({ to, by, n }) {
    const g = this.game;
    if (!g || !g.campaign || to === g.cfg.country) return;
    g.flushStats();
    const s = g.toSave(), C = g.campaign, side = g.cfg.side;
    const worlds = Object.assign({}, s.worlds);
    worlds[g.cfg.country] = { edits: s.edits, forts: s.forts, pickups: s.pickups, rafts: s.rafts, cars: s.cars };
    const take = Math.max(0, Math.min(n, C.here.gar[side] || 0));
    const followerNations = g.enemies.followers().map((f) => f.nation).filter(Boolean);
    C.here.gar[side] -= take;
    C.rec(to).gar[side] = (C.rec(to).gar[side] || 0) + take;
    const W = worlds[to] || {};
    delete worlds[to];
    const next = Object.assign({}, s, {
      cfg: Object.assign({}, s.cfg, { country: to }), edits: W.edits || null, forts: W.forts || null, pickups: W.pickups || [], rafts: W.rafts || [], cars: W.cars || null,
      player: null, followers: Math.min(take, 16), arrival: { by }, worlds, campaign: C.state, weather: null,
    });
    writeSave(Object.assign({}, next, { arrival: { by: 'hq' } }));
    g.dispose(); this.game = null;
    document.body.classList.remove('ingame');
    this.input.enabled = false; this.input.exitLock();
    this.ui.hide();
    await this.travelScene({ by, to, side, n: take + 1, tod: g.time % 1, dateText: M.warDate(g.time), weather: WEATHER[COUNTRY[to].climate], nations: followerNations });
    this.startGame(next);
  }
  // the boat or plane scene (travel.js), with the squad's nations, the
  // destination's weather and time of day, and its WWII name and date
  async travelScene({ by, to, side, n, tod, dateText, weather, nations = [], normandy = false }) {
    stopMusic();
    await loadWar();
    const C = COUNTRY[to], pac = ['cn', 'au', 'in', 'us'].includes(to);
    // who rides along: the soldiers following you, else the side's nations that fought there
    const fill = side === 'axis' ? (pac ? ['jp'] : to === 'gr' || to === 'it' ? ['de', 'it'] : ['de'])
      : to === 'jp' ? ['us'] : to === 'su' ? ['su'] : to === 'cn' ? ['cn', 'us'] : ['us', 'uk', 'ca', 'uk'];
    if (side === 'axis' && pac) nations = nations.filter((x) => x === 'jp');
    if (!nations.length) nations = fill;
    const GROUND = { grass: 0x55663e, snow: 0xc8ccc8, lush: 0x4a6a34, red: 0x8a5a3a, jungle: 0x3a5a2a, dry: 0x8a8050, ash: 0x4a4640 };
    const land = LANDS[C.land] || {};
    this.inTravel = true;
    return M.playTravel({ by, renderer: this.renderer, toName: t('cname.' + to), dateText, tod, weather, nations, n, side,
      touch: this.input.touch, quality: this.settings.quality, normandy, groundColor: GROUND[land.ground] })
      .catch((e) => console.error(e)).finally(() => { this.inTravel = false; });
  }
  loadGame(id) {
    const s = readSave(id);
    if (!s) return;
    // worlds from earlier stages: keep the name and settings, rebuild the world
    if ((s.v || 1) < SAVE_FORMAT) return;    // old War saves can't be converted (cleared from the War menu)
    this.startGame(s);
  }
  async startGame(save) {
    stopMusic();
    this.ui.show('loading', { town: save.cfg && save.cfg.mode === 'town' });
    await new Promise((r) => setTimeout(r, 30));
    // only this game's own code is loaded (War or Town Life), the first time it is played
    try { await loadMode(save.cfg.mode); } catch (e) { console.error(e); this.ui.show('main'); return; }
    this.game = new Game(this, save);
    if (save.cfg.gameType === 'battle') this.lastBattleSide = { side: save.cfg.side, difficulty: save.cfg.difficulty };
    document.body.classList.add('ingame');
    this.game.resize();
    this.game.update(0);
    const total = Math.max(1, this.game.buildQueue.length);
    while (this.game.updateChunks(0, 25) > 0) {
      this.ui.setLoading(1 - this.game.buildQueue.length / total);
      await new Promise((r) => requestAnimationFrame(r));
    }
    this.input.enabled = true;
    this.saveGame(true);
    if (this.game.town && this.townRestored) this.game.hud.toast(t('town.restored'), 'warn');
    if (this.game.town && this.townRebuilt) this.game.hud.bigMessage(t('town.rebuiltTitle'), t('town.rebuilt'));
    if (this.input.touch) this.resume(); else this.ui.show('clickToPlay');
  }

  resume() {
    if (!this.game) return;
    initAudio();
    if (this.input.touch) { this.game.paused = false; this.ui.hide(); return; }
    this.input.requestLock();
  }
  pause() {
    if (!this.game) return;
    this.game.paused = true;
    this.ui.show('pause');
  }
  openPanel(name, params = {}) {
    this.game.overlay = name;
    this.ui.invPick = null;
    this.input.exitLock();
    this.ui.show(name, params);
  }
  closePanel() {
    if (!this.game) return;
    this.game.overlay = null;
    this.ui.hide();
    if (!this.input.touch) {
      this.input.requestLock();
      if (!document.pointerLockElement) { this.game.paused = true; this.ui.show('clickToPlay'); }
    }
  }

  saveGame(quiet) {
    if (!this.game) return;
    if (this.game.battle) return;                 // battles are never saved
    this.game.flushStats();
    const ok = this.game.town ? this.game.town.save() : writeSave(this.game.toSave());
    if (!quiet || !ok) this.game.hud.toast(t(ok ? 'hud.saved' : 'hud.saveFail'));
    if (!quiet && ok) sfx.done();
  }
  // Play Alone starvation: the run is over and the save is removed.
  gameOver() {
    if (!this.game) return;
    const days = Math.floor(this.game.time) + 1;
    const id = this.game.save.id;
    this.game.dispose();
    this.game = null;
    deleteSave(id);
    document.body.classList.remove('ingame');
    this.input.enabled = false;
    this.input.exitLock();
    this.ui.show('gameover', { days });
    startMusic();
  }
  quitToMenu(silent) {
    if (!this.game) return;
    this.game.flushStats();
    this.saveGame(true);
    const town = !!this.game.town, battle = !!this.game.battle;
    this.game.dispose();
    this.game = null;
    document.body.classList.remove('ingame');
    this.input.enabled = false;
    this.input.exitLock();
    if (!silent) { this.ui.show(town ? 'town' : battle ? 'battles' : 'main', battle ? this.lastBattleSide : {}); this.menuMusic(); }
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    requestAnimationFrame((t) => this.loop(t));
    this.adaptRes(dt);
    try {
      if (this.game) {
        if (this.input.thit('pause') && !this.game.paused) this.pause();
        this.game.update(dt);
        if (this.game) this.game.render(this.renderer); // the run may have just ended
      } else if (!this.inTravel) {
        this.renderer.clear();
      }
    } catch (e) {
      console.error(e); // keep the game running; log the problem
    }
    this.input.endFrame();
  }
}

// "Install app" on the main menu: the browser's own prompt where there is
// one (Chrome, Edge, Android), otherwise a short how-to (Safari, Firefox).
App.prototype.bindInstall = function (btn) {
  if (!btn) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/Macintosh/.test(navigator.userAgent) && /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent));
  btn.hidden = standalone || !(this.installPrompt || apple) || location.protocol === 'file:';
  btn.onclick = async () => {
    if (this.installPrompt) {
      const p = this.installPrompt; this.installPrompt = null;
      p.prompt();
      try { await p.userChoice; } catch { /* ignore */ }
      btn.hidden = true;
    } else this.ui.show('installHelp');
  };
};
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  App.prototype.installPrompt = e;          // also works before the app object exists
  if (window.app) window.app.bindInstall(document.getElementById('installbtn'));
});
addEventListener('appinstalled', () => { const b = document.getElementById('installbtn'); if (b) b.hidden = true; });

window.app = new App();

// Installable app / offline play. The worker's scope is this folder only.
// When a new version has been downloaded, offer a reload.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', async () => {
    try {
      let wantReload = false;
      const scope = new URL('./', location.href).href;
      // remove any worker of this game registered with a different scope
      // (other apps on this domain have their own scripts and are left alone)
      for (const r of await navigator.serviceWorker.getRegistrations()) {
        const script = (r.active || r.waiting || r.installing || {}).scriptURL || '';
        if (r.scope !== scope && script.startsWith(scope)) await r.unregister();
      }
      // caches from older versions of this game with other names
      if (window.caches) for (const k of await caches.keys()) if (k.startsWith('blocks-mmow-') && !k.startsWith('blocks-mmow-cache-')) await caches.delete(k);
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      const notify = (w) => {
        if (!w || document.getElementById('update')) return;
        const el = document.createElement('div'); el.id = 'update';
        el.innerHTML = `<span>${t('app.update')}</span><button class="btn small primary">${t('app.reload')}</button>`;
        el.querySelector('button').onclick = () => { wantReload = true; w.postMessage('skipWaiting'); };
        document.body.appendChild(el);
      };
      if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) notify(w); });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!wantReload) return; wantReload = false;   // only when the player asked for it
        if (window.app && window.app.game) window.app.saveGame(true);
        location.reload();
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    } catch (e) { console.warn('service worker', e); }
  });
}
