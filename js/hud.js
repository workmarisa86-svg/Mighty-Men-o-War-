// Military-style heads-up display: compass, health/hunger bars, hotbar, toasts.
import { itemIcon, ITEMS } from './items.js';
import { t } from './i18n.js';

const $ = (s) => document.querySelector(s);
const PX_PER_DEG = 3;

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.root.hidden = false;
    this.strip = $('#compass .strip');
    this.deg = $('#compass .deg');
    this.status = $('#status');
    this.hp = $('#hp .fill'); this.food = $('#food .fill');
    this.breath = $('#breath'); this.breathFill = $('#breath .fill');
    this.hotbar = $('#hotbar');
    this.ring = $('#digring circle');
    this.toasts = $('#toasts');
    this.craftbar = $('#craftbar'); this.craftLabel = $('#craftbar .label'); this.craftFill = $('#craftbar .fill');
    this.binoc = $('#binoc'); this.underwater = $('#underwater'); this.flashEl = $('#flash');
    this.keyhint = $('#keyhint');
    this.dirtyHotbar = true;
    this.digProgress = 0;
    this.statusTimer = 0;
    this.buildCompass();
    this.hotbar.onclick = (e) => {
      const s = e.target.closest('.slot');
      if (s) { game.inv.sel = +s.dataset.i; this.dirtyHotbar = true; }
    };
    this.keyhint.textContent = game.app.input.touch ? '' : t('help.keys');
    this.keyhint.classList.remove('fade');
    clearTimeout(HUD.hintTimer);
    HUD.hintTimer = setTimeout(() => this.keyhint.classList.add('fade'), 12000);
  }

  buildCompass() {
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    let html = '';
    for (let d = -360; d <= 720; d += 15) {
      const n = ((d % 360) + 360) % 360;
      const lab = labels[n];
      html += `<span class="mk${lab ? ' major' : ''}" style="left:${(d + 360) * PX_PER_DEG}px">${lab || n}</span>`;
    }
    this.strip.innerHTML = html;
  }

  update(dt) {
    const g = this.game, p = g.player;
    // compass: heading 0 = north (-Z), clockwise
    const heading = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    const w = this.strip.parentElement.clientWidth;
    this.strip.style.transform = `translateX(${w / 2 - (heading + 360) * PX_PER_DEG}px)`;
    this.deg.textContent = String(Math.round(heading) % 360).padStart(3, '0') + '°';

    this.hp.style.width = p.health + '%';
    this.food.style.width = p.hunger + '%';
    const showBreath = g.breath < 15;
    this.breath.hidden = !showBreath;
    if (showBreath) this.breathFill.style.width = (g.breath / 15 * 100) + '%';

    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      const day = Math.floor(g.time) + 1;
      const tod = g.peace ? 0.45 : g.time % 1;
      const hh = Math.floor(tod * 24), mm = Math.floor((tod * 24 - hh) * 60);
      const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const parts = [t('hud.day', { n: day }), g.peace ? t('hud.peace') : clock];
      if (!g.peace && g.weather.rain > 0.15) parts.push(t('hud.rain'));
      this.status.textContent = parts.join('  ·  ');
    }

    const prog = Math.min(1, this.digProgress);
    this.ring.style.strokeDashoffset = String(100 - prog * 100);
    this.ring.parentElement.style.opacity = prog > 0 ? 1 : 0;

    if (g.craft) {
      this.craftbar.hidden = false;
      const left = Math.max(0, g.craft.total - g.craft.t);
      this.craftLabel.textContent = t('hud.crafting', { item: t('item.' + g.craft.r.id), s: left.toFixed(1) });
      this.craftFill.style.width = (g.craft.t / g.craft.total * 100) + '%';
    } else this.craftbar.hidden = true;

    this.binoc.classList.toggle('on', g.zoom);
    this.underwater.classList.toggle('on', p.headInWater);

    if (this.dirtyHotbar) this.renderHotbar();
  }

  renderHotbar() {
    this.dirtyHotbar = false;
    const g = this.game;
    let html = '';
    g.inv.hotbar.forEach((id, i) => {
      let inner = '';
      if (id) {
        const c = g.count(id);
        const tool = ITEMS[id] && ITEMS[id].tool;
        const empty = !tool && c <= 0;
        inner = `<img src="${itemIcon(id)}" alt="" class="${empty ? 'empty' : ''}">` +
          (tool ? '' : `<b>${c === Infinity ? '∞' : c}</b>`);
      }
      html += `<div class="slot${i === g.inv.sel ? ' sel' : ''}" data-i="${i}" title="${id ? t('item.' + id) : ''}"><i>${i + 1}</i>${inner}</div>`;
    });
    this.hotbar.innerHTML = html;
    const sel = g.selected();
    this.toastItemName(sel);
  }
  toastItemName(id) {
    if (id === this.lastSel) return;
    this.lastSel = id;
    const el = $('#selname');
    el.textContent = id ? t('item.' + id) : '';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }
  pickup(id, n) { this.toast(t('hud.got', { n, item: t('item.' + id) }), 'pick'); }
  flash() { this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on'); }

  dispose() {
    this.root.hidden = true;
    this.toasts.innerHTML = '';
  }
}
