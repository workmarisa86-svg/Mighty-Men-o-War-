import { t } from './i18n.js';
// Scope view (Z): sniper scope when holding the sniper rifle, binoculars
// otherwise. Circular lens with a blurred dark surround, a fine reticle, a
// lens glint, smooth zoom in/out and a breathing sway you can steady (Shift).
const FOV = { sniper: 20, binoc: 30 };
// binoculars: zoom steps (mouse wheel on computers, + / - on phones)
export const BINOC_ZOOM = [2, 4, 6];
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
    this.zi = 1; this.still = 0;
    // binoculars: a dark mask with two round lenses side by side and a thin
    // bridge, lens rims, a range scale, glints and a soft vignette (SVG,
    // scaled so the lenses always stay round)
    if (!this.el.querySelector('.binoc-svg')) {
      const L = 545, R = 1055, Y = 500, r = 235;
      const ticks = (cx) => { let d = ''; for (let i = -5; i <= 5; i++) { const h = i % 5 === 0 ? 16 : 8; d += `M${cx + i * 18} ${Y - h}V${Y + h}`; } for (let i = -3; i <= 3; i++) if (i) { const h = i % 3 === 0 ? 12 : 6; d += `M${cx - h} ${Y + i * 30}H${cx + h}`; } return d; };
      const wrap = document.createElement('div');
      wrap.className = 'binoc-svg';
      wrap.innerHTML = `<svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice"><defs>
        <mask id="bmask"><rect x="-3000" y="-3000" width="7600" height="7000" fill="#fff"/><circle cx="${L}" cy="${Y}" r="${r}" fill="#000"/><circle cx="${R}" cy="${Y}" r="${r}" fill="#000"/></mask>
        <radialGradient id="bvig" r="0.5"><stop offset="0.72" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></radialGradient>
        <linearGradient id="bglint" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f0ff" stop-opacity="0.22"/><stop offset="0.35" stop-color="#e8f0ff" stop-opacity="0"/></linearGradient></defs>
        <rect x="-3000" y="-3000" width="7600" height="7000" fill="#050505" mask="url(#bmask)"/>
        <rect x="${(L + R) / 2 - 14}" y="${Y - 70}" width="28" height="140" rx="10" fill="#14130f"/>
        ${[L, R].map((cx) => `<circle cx="${cx}" cy="${Y}" r="${r}" fill="url(#bvig)"/>
        <circle cx="${cx}" cy="${Y}" r="${r - 2}" fill="none" stroke="#1c1b16" stroke-width="7"/><circle cx="${cx}" cy="${Y}" r="${r - 9}" fill="none" stroke="#5a5a52" stroke-opacity="0.35" stroke-width="2"/>
        <path d="M${cx - r * 0.62} ${Y - r * 0.55} A ${r * 0.85} ${r * 0.85} 0 0 1 ${cx + r * 0.1} ${Y - r * 0.82}" fill="none" stroke="url(#bglint)" stroke-width="10" stroke-linecap="round"/>
        <path d="${ticks(cx)}" stroke="#0e0e0c" stroke-opacity="0.65" stroke-width="1.6"/>`).join('')}
        <text class="bzoom" x="800" y="${Y + r + 70}" text-anchor="middle" fill="#d8d0b0" font-size="34" font-family="Oswald, Arial">4×</text></svg>`;
      this.el.appendChild(wrap);
      this.zoomText = wrap.querySelector('.bzoom');
    }
  }
  // binoculars: next / previous zoom step
  zoomStep(d) {
    const n = Math.max(0, Math.min(BINOC_ZOOM.length - 1, this.zi + d));
    if (n !== this.zi) { this.zi = n; import('./audio.js').then((m) => m.sfx.scope()); }
    if (this.zoomText) this.zoomText.textContent = BINOC_ZOOM[this.zi] + '×';
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
    if (playing && (input.hit('KeyZ') || input.thit('zoom')) && !(p.car && sel !== 'sniper')) this.toggle(sel === 'sniper' ? 'sniper' : 'binoc');   // no binoculars in a car
    // phones: more ways out of the zoom: the dedicated Exit (the zoom
    // button itself, moved to its own corner), a swipe down from the top
    // edge, or the phone's back gesture
    if (this.kind && (input.thit('swipeDown') || this.backHit)) this.kind = null;
    this.backHit = false;
    if (g.app.input.touch) {
      if (this.kind && !this.histOn) { this.histOn = true; try { history.pushState({ zoom: 1 }, ''); } catch { /* ignore */ } }
      if (!this.kind && this.histOn) { this.histOn = false; this.popSelf = true; try { if (history.state && history.state.zoom) history.back(); else this.popSelf = false; } catch { this.popSelf = false; } }
      if (!this.popWired) { this.popWired = true; this.onPop = () => { if (this.popSelf) { this.popSelf = false; return; } if (this.kind) { this.histOn = false; this.backHit = true; } }; addEventListener('popstate', this.onPop); }
    }
    if (this.kind === 'sniper' && sel !== 'sniper') this.kind = null;
    if (p.swimming || g.dead) this.kind = null;
    // binocular zoom steps: the wheel (it doesn't change the hotbar while looking) or + / -
    if (this.kind === 'binoc' && this.t > 0.5) {
      if (input.mouse.wheel) { this.zoomStep(input.mouse.wheel > 0 ? -1 : 1); input.mouse.wheel = 0; }
      if (input.thit('zin')) this.zoomStep(1);
      if (input.thit('zout')) this.zoomStep(-1);
    }
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
    // binoculars: a mild sway that settles while you hold still
    if (this.shown === 'binoc') {
      const moving = Math.hypot(p.vel.x, p.vel.z) > 0.5 || Math.abs(input.mouse.dx) + Math.abs(input.mouse.dy) > 2;
      this.still = moving ? 0 : Math.min(3, this.still + dt);
      amp *= (1 - this.still / 4) * (0.6 + BINOC_ZOOM[this.zi] * 0.12);
    }
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
    document.body.classList.toggle('binoc', on && this.shown === 'binoc');
    if (on !== this.bodyOn) {
      this.bodyOn = on;
      document.body.classList.toggle('scoped', on);
      const zb = document.querySelector('[data-btn=zoom]');
      if (zb) zb.textContent = t(on ? 'touch.zoomOut' : 'touch.zoom');
    }
  }
  ease() { const t = this.t; return t * t * (3 - 2 * t); }
  fov(base) {
    const f = this.shown === 'binoc' ? 75 / BINOC_ZOOM[this.zi] : FOV[this.shown || 'binoc'];
    return base + (f - base) * this.ease();
  }
  sensitivity() { const k = this.shown === 'binoc' ? Math.min(0.85, 1 - 1.4 / BINOC_ZOOM[this.zi]) : 0.72; return 1 - k * this.ease(); }
}
