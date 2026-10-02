// Contextual squad commands (made for phones, shown on desktop with keys):
// buttons appear only when they make sense.
//  - Follow me: when you stand beside an allied soldier who is not following
//    you (also recalls soldiers holding or guarding). Recruits him and the
//    allies close to you.                                           [T]
//  - Orders: a short menu, only while you have a squad (desktop: Q wheel).
//  - Ask for iron / Ask for a weapon: beside a soldier.             [Y] [U]
//  - Chest: beside the cabin's storage chest.                       [E]
import { t } from './i18n.js';

export class ContextBar {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('ctxbar');
    this.btn = {};
    this.pressed = new Set();
    for (const b of this.el.querySelectorAll('[data-btn]')) {
      this.btn[b.dataset.btn] = b;
      const hit = (e) => { e.preventDefault(); e.stopPropagation(); this.pressed.add(b.dataset.btn); };
      b.addEventListener('touchstart', hit, { passive: false });
      b.addEventListener('mousedown', hit);
    }
    this.timer = 0; this.near = null; this.state = '';
  }
  update(dt, input, playing) {
    const g = this.game, E = g.enemies, touch = g.app.input.touch;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.2;
      const p = g.player.pos, allies = g.cfg.sub === 'allies' && !g.peace && E;
      let near = null, nd = 3.6;
      if (allies) for (const s of E.list) {
        if (!s.alive || s.surrender || s.faction !== 'ally') continue;
        const d = Math.hypot(s.pos.x - p.x, s.pos.z - p.z);
        if (d < nd && Math.abs(s.pos.y - p.y) < 2.5) { nd = d; near = s; }
      }
      this.near = near;
      const show = {
        follow: !!near && near.role !== 'follow',
        orders: touch && allies && E.squadMembers().length > 0 && !g.orders.isOpen,
        askiron: !!near, askweapon: !!near,
        chest: touch && g.cabin && g.cabin.nearChest(p),
      };
      const key = (k) => touch ? '' : `<kbd>${k}</kbd>`;
      const label = {
        follow: key('T') + t('ctx.follow'), orders: t('ctx.orders'), askiron: key('Y') + t('ctx.iron'), askweapon: key('U') + t('ctx.weapon'), chest: t('ctx.chest'),
      };
      const st = JSON.stringify(show) + (near ? near.idx : '') + g.settings.lang;
      if (st !== this.state) {
        this.state = st;
        for (const [k, b] of Object.entries(this.btn)) {
          b.hidden = !show[k];
          if (show[k]) b.innerHTML = label[k] + (k !== 'orders' && k !== 'chest' && near ? `<small>${near.name}</small>` : '');
        }
        this.el.classList.toggle('empty', !Object.values(show).some(Boolean));
      }
    }
    const tap = (k) => this.pressed.has(k);
    if (!playing) { this.pressed.clear(); return; }
    if (tap('orders')) { if (g.orders.isOpen) g.orders.close(); else g.orders.open(true); }
    const s = this.near;
    if (s && s.alive && (tap('follow') || input.hit('KeyT')) && s.role !== 'follow') {
      // him, and every ally close to you
      const p = g.player.pos;
      const group = E.list.filter((o) => o.alive && !o.surrender && o.faction === 'ally' && o.role !== 'follow' && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 9);
      E.issue('follow', group.includes(s) ? group : [s, ...group]);
      this.timer = 0;
    }
    if (s && s.alive && (tap('askiron') || input.hit('KeyY'))) E.askIron(s);
    if (s && s.alive && (tap('askweapon') || input.hit('KeyU'))) E.askItem(s, 'rifle');
    if (tap('chest') && g.cabin && g.cabin.nearChest(g.player.pos)) g.app.openPanel('chest');
      this.pressed.clear();
  }
}
