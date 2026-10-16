// How getting hurt feels, in both games. A hit shakes the view (less, or
// not at all, with Settings > Screen shake), points a red arc toward where it
// came from, flashes the screen edge red, thumps, and buzzes phones that can
// vibrate. Heavy blows leave blood on the screen and can start you bleeding
// for a few seconds. Badly hurt, the screen edge pulses red and darkens, you
// hear your heart, and you limp. All blood and bleeding follow the blood
// setting (with blood off you still get the flash and the sounds). Nothing
// here ever shows wounds or body parts: only splashes on the "lens".
//
// Death is always a slow-motion fall: the view drops and tips over, the
// picture drains of colour, the sound muffles and a heartbeat fades out; after
// about two and a half seconds "You died" comes up, then the game carries on
// (a War HQ's medical room, or the Town Life hospital).
import { sfx, setMuffled } from './audio.js';
import { t } from './i18n.js';

const MAX_SPLATS = 6;
export const DEATH_LEN = 4.4;          // the fall, then the "You died" card
const CARD_AT = 2.6;

export class Injury {
  constructor(game) {
    this.game = game;
    const hud = document.getElementById('hud');
    this.root = document.createElement('div'); this.root.id = 'injury';
    this.root.innerHTML = '<div class="lowhp"></div><div class="splats"></div><div class="died"><p></p></div>';
    hud.appendChild(this.root);
    this.low = this.root.querySelector('.lowhp'); this.splats = this.root.querySelector('.splats');
    this.died = this.root.querySelector('.died');
    this.bleedT = 0; this.beatT = 0; this.limp = 1; this.lowK = 0; this.dripT = 0;
    this.canvas = game.app.renderer.domElement;
  }
  get bloodOn() { return !!this.game.settings.blood; }
  shakeMul() { const s = this.game.settings.shake || 'full'; return s === 'off' ? 0 : s === 'reduced' ? 0.35 : 1; }
  // a hit: n damage, from a position (or null); heavy: a big blow (bear, fall); bleed: may start bleeding
  hit(n, from, { heavy = false, bleed = false } = {}) {
    const g = this.game, k = this.shakeMul();
    g.shake = Math.min(1.6, (g.shake || 0) + Math.min(1.2, n / (heavy ? 9 : 16)) * k);
    if (k > 0 && navigator.vibrate) { try { navigator.vibrate(Math.round(Math.min(220, (heavy ? 70 : 30) + n * 5) * (k < 1 ? 0.5 : 1))); } catch { /* not allowed */ } }
    if (heavy) sfx.impact(Math.min(1.2, 0.6 + n / 30));
    sfx.hurt(heavy || n >= 15 ? 1 : 0.7);
    if (this.bloodOn && (heavy || n >= 12)) this.splat(heavy ? 2 : 1);
    if (this.bloodOn && bleed && n >= 10) this.bleedT = Math.max(this.bleedT, 4 + n * 0.15);
  }
  // blood on the lens: a few dark red drops near the edges that run and fade
  splat(n = 1) {
    for (let i = 0; i < n; i++) {
      while (this.splats.children.length >= MAX_SPLATS) this.splats.firstChild.remove();
      const d = document.createElement('i');
      const edge = Math.random() < 0.5, x = edge ? (Math.random() < 0.5 ? 2 + Math.random() * 18 : 80 + Math.random() * 18) : 10 + Math.random() * 80;
      const y = edge ? 10 + Math.random() * 80 : (Math.random() < 0.5 ? 2 + Math.random() * 16 : 78 + Math.random() * 18);
      const s = 9 + Math.random() * 14;
      d.style.cssText = `left:${x}%;top:${y}%;width:${s}vmin;height:${s * (0.7 + Math.random() * 0.6)}vmin;transform:translate(-50%,-50%) rotate(${Math.random() * 360}deg)`;
      this.splats.appendChild(d);
      setTimeout(() => d.remove(), 3200);
    }
  }
  // healed (a medkit): bleeding stops
  stopBleeding() { this.bleedT = 0; }
  update(dt) {
    const g = this.game, p = g.player, hp = p.health;
    // bleeding: a slow drain and drops on the screen (only with blood on)
    if (this.bleedT > 0 && !g.dying) {
      if (!this.bloodOn) this.bleedT = 0;
      else {
        this.bleedT -= dt; p.health = Math.max(1, p.health - 0.9 * dt);       // bleeding alone never kills
        this.dripT -= dt; if (this.dripT <= 0) { this.dripT = 1.4; if (Math.random() < 0.5) this.splat(1); }
      }
    }
    // badly hurt: pulsing red edge, vignette, heartbeat, limp
    const low = g.dying ? 0 : Math.max(0, Math.min(1, (40 - hp) / 30));
    this.lowK += (low - this.lowK) * Math.min(1, dt * 3);
    if (this.lowK > 0.01) {
      const rate = 1 + this.lowK * 0.8;
      this.beatT -= dt;
      if (this.beatT <= 0) { this.beatT = 1.1 / rate; sfx.heartbeat(0.25 + this.lowK * 0.5, rate); this.pulse = 1; }
      this.pulse = Math.max(0, (this.pulse || 0) - dt * 2.5);
      this.low.style.opacity = (this.lowK * (0.55 + 0.45 * this.pulse)).toFixed(3);
      this.low.classList.toggle('noblood', !this.bloodOn);
    } else if (this.low.style.opacity !== '0') this.low.style.opacity = '0';
    this.limp = hp < 25 && !g.dying ? 0.7 : 1;
    if (g.dying) this.updateDeath(dt);
  }
  // the limp: a lopsided bob of the view while walking
  bob(moving) {
    if (this.limp >= 1 || !moving) return 0;
    const t = performance.now() / 1000;
    return -Math.max(0, Math.sin(t * 5.2)) * 0.09;
  }

  // ---- death ---------------------------------------------------------------
  startDeath() {
    const g = this.game;
    this.bleedT = 0; this.deathBeat = 0;
    setMuffled(true); sfx.death();
    this.died.querySelector('p').textContent = t('hud.youDied');
    this.died.classList.remove('on');
    this.canvas.style.transition = 'none';
    g.shake = 0;
  }
  updateDeath() {
    const g = this.game, D = g.dying, k = Math.min(1, D.t / 2.2);
    this.canvas.style.filter = `grayscale(${(k * 0.95).toFixed(2)}) brightness(${(1 - k * 0.35).toFixed(2)})`;
    // a heartbeat that slows and fades away
    D.beat = (D.beat ?? 0.2) - g.realDt;
    if (D.beat <= 0 && D.t < CARD_AT + 0.6) { D.beat = 0.9 + D.t * 0.6; sfx.heartbeat(Math.max(0.05, 0.7 - D.t * 0.25), 0.8); }
    if (D.t >= CARD_AT && !this.died.classList.contains('on')) this.died.classList.add('on');
  }
  endDeath() {
    this.died.classList.remove('on');
    this.canvas.style.filter = '';
    setMuffled(false);
  }
  dispose() { this.endDeath(); this.root.remove(); }
}
