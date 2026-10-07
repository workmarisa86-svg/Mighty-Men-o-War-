// Squad orders. Q opens a radial wheel (move the mouse toward an order, then
// click, or press its number). On touch screens the SQUAD button opens the
// same orders as a quick list. Orders are aimed: whatever spot or fort you
// look at when you open the wheel becomes the order's target. They go to the
// selected soldiers (G picks soldiers), or to the one you aim at, or else to
// the whole squad.
import * as THREE from 'three';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { FORMATIONS } from './soldiers.js';

const SHORT = ['follow', 'hold', 'defend', 'spread', 'cover', 'attack'];
export const ORDERS = ['follow', 'hold', 'defend', 'cover', 'spread', 'advance', 'attack'];
const ICONS = { follow: '&#10148;', hold: '&#9632;', defend: '&#9960;', cover: '&#9686;', spread: '&#8943;', advance: '&#8679;', attack: '&#8853;', formation: '&#8942;' };

export class OrderWheel {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('orderwheel');
    this.isOpen = false; this.sel = -1; this.vx = 0; this.vy = 0;
    this.eatKeys = false;
    this.el.innerHTML = '';
    this.items = ORDERS.map((cmd, i) => {
      const b = document.createElement('button');
      b.className = 'ow-item'; b.dataset.i = i;
      const a = (i / ORDERS.length) * Math.PI * 2 - Math.PI / 2;
      b.style.setProperty('--x', Math.cos(a).toFixed(3)); b.style.setProperty('--y', Math.sin(a).toFixed(3));
      b.addEventListener('click', (e) => { e.stopPropagation(); this.issue(i); });
      b.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.issue(i); });
      this.el.appendChild(b);
      return b;
    });
    this.center = document.createElement('div'); this.center.className = 'ow-center';
    this.el.appendChild(this.center);
    this.closeBtn = document.createElement('button'); this.closeBtn.className = 'ow-close'; this.closeBtn.textContent = '×';
    this.closeBtn.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('touchend', (e) => { e.preventDefault(); this.close(); });
    this.el.appendChild(this.closeBtn);
  }
  get enabled() { const g = this.game; return g.cfg.sub === 'allies'; }

  // What the player is aiming at: a soldier, a spot on the ground, a fort.
  aimInfo() {
    const g = this.game;
    const { eye, dir } = g.aim();
    const block = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 250, false, 'bullet');
    const hit = g.enemies.raycast(eye, dir, block ? Math.min(block.dist, 60) : 60, 'ally');
    let point;
    if (block) point = new THREE.Vector3(block.x + 0.5 + block.nx, block.y + block.ny, block.z + 0.5 + block.nz);
    else point = eye.clone().addScaledVector(dir, 40);
    let fort = g.forts.fortAt(point);
    if (!fort) fort = g.forts.list.find((f) => Math.hypot(f.cx + 0.5 - point.x, f.cz + 0.5 - point.z) < 16) || null;
    return { soldier: hit ? hit.soldier : null, point, fort };
  }

  // short = the phone quick list: Follow me, Hold, Defend, Spread out, Take cover, Attack
  open(short = false) {
    if (!this.enabled) return;
    this.isOpen = true; this.sel = -1; this.vx = this.vy = 0; this.short = short;
    this.at = this.aimInfo();
    this.el.classList.toggle('list', this.game.app.input.touch);
    this.el.hidden = false;
    sfx.toggle();
    this.render();
  }
  close() { this.isOpen = false; this.el.hidden = true; }

  update(dt, input) {
    this.eatKeys = false;
    if (!this.enabled) return;
    const g = this.game, E = g.enemies;
    if (input.hit('KeyQ')) { if (this.isOpen) this.close(); else this.open(); this.eatKeys = true; }
    if (!this.isOpen) {
      // G: add / remove the aimed soldier to the selected group (G at nothing clears it)
      if (input.hit('KeyG')) {
        const { soldier } = this.aimInfo();
        if (soldier) {
          E.select(soldier, !soldier.selected);
          g.hud.toast(t(soldier.selected ? 'order.selected' : 'order.unselected', { name: soldier.name, n: E.selection().length }));
        } else if (E.selection().length) { E.clearSelection(); g.hud.toast(t('order.selCleared')); }
      }
      return;
    }
    this.eatKeys = true;
    // the mouse picks a slice of the wheel instead of turning the view
    this.vx += input.mouse.dx; this.vy += input.mouse.dy;
    const r = Math.hypot(this.vx, this.vy);
    if (r > 110) { this.vx *= 110 / r; this.vy *= 110 / r; }
    if (r > 30) {
      const a = Math.atan2(this.vy, this.vx) + Math.PI / 2;
      const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * ORDERS.length) % ORDERS.length;
      if (i !== this.sel) { this.sel = i; this.render(); }
    }
    input.mouse.dx = input.mouse.dy = 0;
    for (let i = 0; i < ORDERS.length; i++) if (input.hit('Digit' + (i + 1))) { this.issue(i); break; }
    if (input.hit('Digit9') && this.at && this.at.soldier) { this.close(); g.app.openPanel('orders', { soldier: this.at.soldier }); }
    if (input.mouse.leftPressed) { if (this.sel >= 0) this.issue(this.sel); else this.close(); }
    if (input.mouse.rightPressed || input.hit('Escape')) this.close();
    input.mouse.leftPressed = input.mouse.rightPressed = false; input.mouse.left = false;
    if (g.dead) this.close();
  }

  recipients(cmd) { return this.game.enemies.recipients(this.at && this.at.soldier, cmd); }

  issue(i) {
    const g = this.game, E = g.enemies, cmd = ORDERS[i];
    if (!this.isOpen) return;
    if (cmd === 'formation') {
      const cur = FORMATIONS.indexOf(g.settings.formation || 'loose');
      g.settings.formation = FORMATIONS[(cur + 1) % FORMATIONS.length];
      g.app.applySettings && g.app.applySettings();
      g.hud.toast(t('order.formationSet', { f: t('form.' + g.settings.formation) }));
      sfx.toggle();
      this.render();
      return;   // stays open so you can keep cycling
    }
    E.issue(cmd, this.recipients(cmd), { point: this.at.point, fort: this.at.fort });
    this.close();
  }

  render() {
    const g = this.game, E = g.enemies;
    const sel = E.selection();
    const one = this.at && this.at.soldier;
    const who = sel.length ? t('order.toSelected', { n: sel.length }) : one ? one.name : t('order.toSquad', { n: E.squadMembers().length });
    const tgt = this.at && this.at.fort ? this.at.fort.name : '';
    this.center.innerHTML = `<b>${t('order.title2')}</b><span>${who}</span>${tgt ? `<span class="muted">${tgt}</span>` : ''}` +
      (one && !sel.length && !this.game.app.input.touch ? `<span class="muted small"><kbd>9</kbd> ${t('order.talk')}</span>` : '');
    this.items.forEach((b, i) => {
      const cmd = ORDERS[i];
      const label = cmd === 'formation' ? t('ord.formation', { f: t('form.' + (g.settings.formation || 'loose')) }) : t('ord.' + cmd);
      b.innerHTML = `<i>${ICONS[cmd]}</i><span>${label}</span><kbd>${i + 1}</kbd>`;
      b.classList.toggle('on', i === this.sel);
      b.hidden = !!this.short && !SHORT.includes(cmd);
    });
  }
}
