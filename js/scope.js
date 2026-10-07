import { t } from './i18n.js';
// Scope view (Z): sniper scope when holding the sniper rifle, binoculars
// otherwise. Circular lens with a blurred dark surround, a fine reticle, a
// lens glint, smooth zoom in/out and a breathing sway you can steady (Shift).
const FOV = { sniper: 20, binoc: 30 };
const SWAY = { sniper: 0.0055, binoc: 0.0035 };
const STEADY_MAX = 4;           // seconds you can hold your breath

export class ScopeView {
  constructor(game) {
    this.game = game;
    this.kind = null;            // 'sniper' | 'binoc' | null
    this.shown = null;           // what is drawn while zooming out
    this.t = 0;                  // 0 = off, 1 = fully zoomed
    this.phase = Math.random() * 10;
    this.breath = STEADY_MAX; this.winded = 0;
    this.yaw = 0; this.pitch = 0;
    this.el = document.getElementById('scopeview');
  }
  get active() { return this.t > 0.5 && !!this.kind; }
  get sniper() { return this.kind === 'sniper' && this.t > 0.5; }
  toggle(kind) {
    this.kind = this.kind === kind ? null : kind;
    if (this.kind) this.shown = this.kind;
    import('./audio.js').then((m) => m.sfx.scope());
  }
  close() { this.kind = null; }

  update(dt, input, playing) {
    const g = this.game, p = g.player;
    const sel = g.selected();
    if (playing && (input.hit('KeyZ') || input.thit('zoom'))) this.toggle(sel === 'sniper' ? 'sniper' : 'binoc');
    if (this.kind === 'sniper' && sel !== 'sniper') this.kind = null;
    if (p.swimming || g.dead) this.kind = null;
    const target = this.kind ? 1 : 0;
    this.t += Math.sign(target - this.t) * Math.min(Math.abs(target - this.t), dt * 4.5);
    // breathing sway; holding Shift steadies it for a few seconds
    this.phase += dt;
    const steady = this.kind && input.down('ShiftLeft');
    if (steady && this.breath > 0 && this.winded <= 0) this.breath -= dt;
    else this.breath = Math.min(STEADY_MAX, this.breath + dt * 0.8);
    if (this.breath <= 0 && this.winded <= 0) this.winded = 2.5;
    this.winded = Math.max(0, this.winded - dt);
    let amp = SWAY[this.shown || 'binoc'] * this.ease();
    if (steady && this.breath > 0 && this.winded <= 0) amp *= 0.15;
    if (this.winded > 0) amp *= 1.8;
    if (Math.hypot(p.vel.x, p.vel.z) > 1) amp *= 2.2;
    const ph = this.phase;
    this.yaw = (Math.sin(ph * 0.9) + 0.5 * Math.sin(ph * 2.1 + 1)) * amp;
    this.pitch = (Math.sin(ph * 1.3 + 2) * 0.8 + 0.3 * Math.sin(ph * 3.1)) * amp;
    // overlay
    const e = this.ease();
    this.el.style.opacity = e.toFixed(3);
    this.el.style.setProperty('--zoom', (1.12 - 0.12 * e).toFixed(3));
    this.el.className = this.shown === 'sniper' ? 'sniper' : 'binoc';
    this.el.style.display = e > 0.01 ? 'block' : 'none';
    // phones: lift the touch buttons above the scope edge and relabel Zoom
    const on = e > 0.3;
    if (on !== this.bodyOn) {
      this.bodyOn = on;
      document.body.classList.toggle('scoped', on);
      const zb = document.querySelector('[data-btn=zoom]');
      if (zb) zb.textContent = t(on ? 'touch.zoomOut' : 'touch.zoom');
    }
  }
  ease() { const t = this.t; return t * t * (3 - 2 * t); }
  fov(base) { return base + (FOV[this.shown || 'binoc'] - base) * this.ease(); }
  sensitivity() { return 1 - 0.72 * this.ease(); }
}
