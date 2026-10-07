// War, Stage 2: the short travel scenes between countries (nothing to do;
// Skip ends them). By boat: landing craft crossing a grey sea toward the
// shore. By plane: a transport plane flying over the clouds, then the jump.
// Drawn on a canvas in the game's muted colours; darker at night.
import { t } from './i18n.js';

export function playTravel(by, night, toName, touch) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.id = 'travel';
    el.innerHTML = `<canvas></canvas><p class="travel-to">${t(by === 'boat' ? 'travel.byBoat' : 'travel.byPlane', { name: toName })}</p>
      <button class="btn" id="tskip">${t('travel.skip')}</button>`;
    document.body.appendChild(el);
    const cv = el.querySelector('canvas'), c = cv.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    size(); addEventListener('resize', size);
    const LEN = 7, t0 = performance.now();
    let done = false;
    const finish = () => { if (done) return; done = true; removeEventListener('resize', size); el.remove(); resolve(); };
    el.querySelector('#tskip').addEventListener(touch ? 'touchstart' : 'click', (e) => { e.preventDefault(); finish(); }, { passive: false });
    const dark = night ? 0.45 : 1;
    const col = (r, g, b, a = 1) => `rgba(${r * dark | 0},${g * dark | 0},${b * dark | 0},${a})`;
    const frame = (now) => {
      if (done) return;
      const s = (now - t0) / 1000, W = cv.width, H = cv.height;
      if (s > LEN) { finish(); return; }
      if (by === 'boat') {
        const sky = c.createLinearGradient(0, 0, 0, H * 0.55);
        sky.addColorStop(0, col(120, 128, 132)); sky.addColorStop(1, col(168, 168, 160));
        c.fillStyle = sky; c.fillRect(0, 0, W, H * 0.55);
        c.fillStyle = col(70, 80, 84); c.fillRect(0, H * 0.55, W, H * 0.45);
        // the shore ahead grows closer
        const k = s / LEN;
        c.fillStyle = col(96, 92, 76);
        c.beginPath(); c.moveTo(0, H * 0.55); for (let x = 0; x <= W; x += W / 20) c.lineTo(x, H * (0.55 - 0.02 - 0.05 * k - Math.sin(x / W * 9) * 0.012 * (1 + k))); c.lineTo(W, H * 0.55); c.fill();
        // waves
        c.strokeStyle = col(130, 140, 140, 0.5); c.lineWidth = 2 * dpr;
        for (let i = 0; i < 14; i++) { const y = H * (0.58 + i * 0.03), off = (s * 60 * (1 + i * 0.2)) % 80; c.beginPath(); for (let x = -80 + off; x < W; x += 80 * dpr) { c.moveTo(x, y); c.quadraticCurveTo(x + 20 * dpr, y - 5 * dpr, x + 40 * dpr, y); } c.stroke(); }
        // landing craft
        for (let i = 0; i < 4; i++) {
          const x = W * (0.15 + i * 0.22) + Math.sin(s + i) * 6 * dpr, y = H * (0.68 + (i % 2) * 0.08) + Math.sin(s * 2 + i) * 4 * dpr, w = W * 0.12;
          c.fillStyle = col(64, 66, 58); c.fillRect(x, y, w, w * 0.22);
          c.fillStyle = col(52, 54, 48); c.fillRect(x + w * 0.8, y - w * 0.12, w * 0.2, w * 0.34);
          c.fillStyle = col(90, 92, 70); for (let k2 = 0; k2 < 5; k2++) c.fillRect(x + w * (0.1 + k2 * 0.13), y - w * 0.07, w * 0.06, w * 0.08);
          c.fillStyle = col(200, 200, 200, 0.35); c.fillRect(x - w * 0.3, y + w * 0.16, w * 0.3, 3 * dpr);
        }
      } else {
        const sky = c.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, col(110, 126, 140)); sky.addColorStop(1, col(186, 186, 176));
        c.fillStyle = sky; c.fillRect(0, 0, W, H);
        // clouds rushing past below
        for (let i = 0; i < 12; i++) {
          const x = ((i * 0.37 * W - s * W * 0.25 * (1 + (i % 3) * 0.3)) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15, y = H * (0.62 + (i % 4) * 0.08);
          c.fillStyle = col(222, 222, 214, 0.75);
          for (let k2 = 0; k2 < 4; k2++) { c.beginPath(); c.arc(x + k2 * W * 0.04, y - (k2 % 2) * H * 0.02, H * (0.05 + (k2 % 2) * 0.02), 0, Math.PI * 2); c.fill(); }
        }
        // the transport plane
        const px = W * 0.5 + Math.sin(s * 0.7) * W * 0.02, py = H * 0.36 + Math.sin(s * 1.3) * H * 0.01, L = W * 0.34;
        c.fillStyle = col(84, 88, 76);
        c.beginPath(); c.ellipse(px, py, L * 0.5, L * 0.07, 0, 0, Math.PI * 2); c.fill();
        c.fillRect(px - L * 0.12, py - L * 0.02, L * 0.3, L * 0.04);
        c.beginPath(); c.moveTo(px - L * 0.42, py); c.lineTo(px - L * 0.52, py - L * 0.16); c.lineTo(px - L * 0.44, py - L * 0.16); c.lineTo(px - L * 0.34, py); c.fill();
        c.fillStyle = col(70, 72, 64); c.fillRect(px - L * 0.05, py - L * 0.005, L * 0.4, L * 0.03);
        c.fillStyle = col(40, 44, 40); for (let k2 = 0; k2 < 6; k2++) c.fillRect(px - L * 0.25 + k2 * L * 0.07, py - L * 0.03, L * 0.03, L * 0.02);
        const prop = (s * 40) % 2 < 1;
        c.strokeStyle = col(40, 40, 40, 0.6); c.lineWidth = 2 * dpr; c.beginPath(); c.moveTo(px + L * 0.12, py - L * (prop ? 0.06 : 0.02)); c.lineTo(px + L * 0.12, py + L * (prop ? 0.06 : 0.02)); c.stroke();
        if (s > LEN - 2) { c.fillStyle = `rgba(255,236,190,${Math.min(1, (s - LEN + 2)) * 0.9})`; c.font = `${36 * dpr}px Oswald, Arial`; c.textAlign = 'center'; c.fillText(t('para.go'), W / 2, H * 0.2); }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}
