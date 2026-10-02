// App bootstrap: renderer, menus, game lifecycle and the main loop.
import * as THREE from 'three';
import { GAME_VERSION, SAVE_FORMAT, DIFF, PEACE_SIZE, QUALITY } from './config.js';
import { loadSettings, saveSettings, readSave, writeSave, deleteSave } from './storage.js';
import { setLang, t, applyI18n, onLang } from './i18n.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { initAudio, setVolume, sfx } from './audio.js';

class App {
  constructor() {
    this.version = GAME_VERSION;
    this.settings = loadSettings();
    onLang(() => applyI18n());
    setLang(this.settings.lang);
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
    addEventListener('pointerdown', () => initAudio(), { capture: true });
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
    const q = QUALITY[this.settings.quality] || QUALITY.medium;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    applyI18n();
    if (this.game) { this.game.settings = this.settings; this.game.quality = q; this.game.hud.dirtyHotbar = true; this.game.queueTimer = 0; this.game.hud.minimap.applySettings(); }
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight, false);
    if (this.game) this.game.resize();
  }

  newGame({ mode, sub, difficulty, timeMode = 'cycle', name }) {
    const size = mode === 'peace' ? PEACE_SIZE : DIFF[difficulty].size;
    const now = Date.now();
    this.startGame({
      v: SAVE_FORMAT, id: 'w' + now.toString(36), name, created: now, updated: now,
      cfg: { seed: (Math.random() * 2 ** 31) | 0, size, mode, sub, difficulty, timeMode: mode === 'peace' ? 'day' : timeMode },
    });
  }
  loadGame(id) {
    const s = readSave(id);
    if (s) this.startGame(s);
  }

  async startGame(save) {
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
  }
  quitToMenu() {
    if (!this.game) return;
    this.saveGame(true);
    this.game.dispose();
    this.game = null;
    document.body.classList.remove('ingame');
    this.input.enabled = false;
    this.input.exitLock();
    this.ui.show('main');
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
