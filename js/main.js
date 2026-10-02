// App bootstrap: renderer, menus, game lifecycle and the main loop.
import * as THREE from 'three';
import { GAME_VERSION, SAVE_FORMAT, DIFF, PEACE_SIZE, QUALITY } from './config.js';
import { loadSettings, saveSettings, readSave, writeSave, deleteSave } from './storage.js';
import { setLang, t, applyI18n, onLang } from './i18n.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { initAudio, setVolume, sfx } from './audio.js';
import { startMusic, stopMusic, setMusic } from './music.js';

class App {
  constructor() {
    this.version = GAME_VERSION;
    this.settings = loadSettings();
    onLang(() => applyI18n());
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
    this.ui.show('main');

    addEventListener('resize', () => this.resize());
    // audio may only start after the first tap or click; menu music then fades in
    addEventListener('pointerdown', () => { initAudio(); setMusic(this.settings.music, this.settings.musicMute); if (!this.game) startMusic(); }, { capture: true });
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
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    applyI18n();
    document.body.classList.remove('tb-s', 'tb-m', 'tb-l'); document.body.classList.add('tb-' + (this.settings.touchSize || 'm'));
    if (this.game) { this.game.settings = this.settings; this.game.quality = q; this.game.hud.dirtyHotbar = true; this.game.queueTimer = 0; this.game.hud.minimap.applySettings(); }
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.game) this.game.resize();
  }

  newGame({ mode, sub, difficulty, timeMode = 'cycle', name, gameType = 'open', mission = null }) {
    const size = mode === 'peace' ? PEACE_SIZE : DIFF[difficulty].size;
    const now = Date.now();
    this.startGame({
      v: SAVE_FORMAT, id: 'w' + now.toString(36), name, created: now, updated: now,
      cfg: { seed: (Math.random() * 2 ** 31) | 0, size, mode, sub, difficulty, timeMode: mode === 'peace' ? 'day' : timeMode, gameType, mission },
    });
  }
  loadGame(id) {
    const s = readSave(id);
    if (!s) return;
    // worlds from earlier stages: keep the name and settings, rebuild the world
    if ((s.v || 1) < SAVE_FORMAT) {
      const keep = { v: SAVE_FORMAT, id: s.id, name: s.name, created: s.created, updated: Date.now(), cfg: Object.assign({ gameType: 'open', timeMode: 'cycle' }, s.cfg), stats: s.stats };
      this.startGame(keep);
      return;
    }
    this.startGame(s);
  }
  // after a mission: same mission again (fresh world), or carry on in this world
  replayMission() {
    const c = this.game.cfg;
    const name = this.game.save.name;
    this.quitToMenu(true);
    this.newGame({ mode: c.mode, sub: c.sub, difficulty: c.difficulty, timeMode: c.timeMode, name, gameType: 'mission', mission: c.mission });
  }
  continueOpenWorld() {
    const g = this.game;
    g.cfg.gameType = 'open'; g.cfg.mission = null; g.mission = null;
    if (g.enemies) g.enemies.noDispatch = false;
    this.saveGame(true);
    this.closePanel();
  }

  async startGame(save) {
    stopMusic();
    this.ui.show('loading');
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
    const ok = writeSave(this.game.toSave());
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
    this.game.dispose();
    this.game = null;
    document.body.classList.remove('ingame');
    this.input.enabled = false;
    this.input.exitLock();
    if (!silent) { this.ui.show('main'); startMusic(); }
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

window.app = new App();

// Installable app / offline play. The worker's scope is this folder only.
// When a new version has been downloaded, offer a reload.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', async () => {
    try {
      let wantReload = false;
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
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
