// App bootstrap: renderer, menus, game lifecycle and the main loop.
import * as THREE from 'three';
import { GAME_VERSION, SAVE_FORMAT, QUALITY, WAR_SIZE } from './config.js';
import { loadSettings, saveSettings, readSave, writeSave, deleteSave, loadTown, deleteTown } from './storage.js';
import { TOWN_SIZE, TOWN_LAYOUT } from './towngen.js';
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio, this.settings.perf === 'smooth' ? 0.8 : 9));
    applyI18n();
    document.body.classList.remove('tb-s', 'tb-m', 'tb-l'); document.body.classList.add('tb-' + (this.settings.touchSize || 'm'));
    if (this.game) { this.game.settings = this.settings; this.game.quality = q; this.game.hud.dirtyHotbar = true; this.game.queueTimer = 0; this.game.hud.minimap.applySettings(); }
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
  newGame({ side = 'allies', difficulty = 'medium', name, gameType = 'open' }) {
    const size = WAR_SIZE, mode = 'war', sub = 'allies', timeMode = 'cycle', mission = null;
    const now = Date.now();
    this.startGame({
      v: SAVE_FORMAT, id: 'w' + now.toString(36), name, created: now, updated: now,
      cfg: { seed: (Math.random() * 2 ** 31) | 0, size, mode, sub, side, difficulty, timeMode, gameType, mission },
    });
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
    this.game = new Game(this, save);
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
    const town = !!this.game.town;
    this.game.dispose();
    this.game = null;
    document.body.classList.remove('ingame');
    this.input.enabled = false;
    this.input.exitLock();
    if (!silent) { this.ui.show(town ? 'town' : 'main'); this.menuMusic(); }
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    requestAnimationFrame((t) => this.loop(t));
    try {
      if (this.game) {
        if (this.input.thit('pause') && !this.game.paused) this.pause();
        this.game.update(dt);
        if (this.game) this.game.render(this.renderer); // the run may have just ended
      } else {
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
