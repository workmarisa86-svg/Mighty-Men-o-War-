// War, Stage 2 screens: the world map (opened from the war-map table in
// the officer's room), the armory, the battle list and the end screens.
import { t } from './i18n.js';
import { COUNTRIES, COUNTRY, WEATHER, BATTLES, BATTLE, LANDS } from './countries.js';
import { MAP_W, MAP_H, MAP_SHAPES } from './mapdata.js';
import { flagURL } from './nations.js';
import { OWNER_COLORS } from './minimap.js';
import { battlesDone } from './battle.js';
import { sfx } from './audio.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ring = (str) => { const n = str.split(',').map(Number); let d = ''; for (let i = 0; i < n.length; i += 2) d += (i ? 'L' : 'M') + n[i] + ',' + n[i + 1]; return d + 'Z'; };
// a label point: the middle of the biggest outline
function labelAt(rings) {
  let best = null, bestA = -1;
  for (const r of rings) {
    const n = r.split(',').map(Number);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let i = 0; i < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
    const a = (x1 - x0) * (y1 - y0);
    if (a > bestA) { bestA = a; best = [(x0 + x1) / 2, (y0 + y1) / 2]; }
  }
  return best;
}
export const wxName = (k) => t('wx.' + k);
// Europe is small on a world map: a closer view, and a row of country buttons
const EUROPE = ['uk', 'fr', 'de', 'it', 'pl', 'no', 'gr'];
const EU_BOX = '400 28 272 120';

export function installWarUI(UI) {
  const P = UI.prototype;

  // ---- the world map ---------------------------------------------------------
  P.r_worldmap = function ({ focus = null, defend = false, view = null } = {}) {
    const g = this.app.game, C = g.campaign;
    if (!C) { this.app.closePanel(); return; }
    const me = C.side, here = C.id;
    const sel = focus || this.mapSel || here;
    this.mapSel = sel;
    const eu = (view || this.mapView || (EUROPE.includes(sel) ? 'eu' : 'world')) === 'eu';
    this.mapView = eu ? 'eu' : 'world';
    const fill = (id) => (C.rec(id).owner === me ? OWNER_COLORS.ally : OWNER_COLORS.enemy);
    const shapes = COUNTRIES.map((c) => `<g class="ctry ${c.id === sel ? 'sel' : ''}" data-c="${c.id}">${MAP_SHAPES[c.id].map((r) => `<path d="${ring(r)}" fill="${fill(c.id)}"/>`).join('')}</g>`).join('');
    const labels = COUNTRIES.map((c) => { const [x, y] = labelAt(MAP_SHAPES[c.id]); return `<text x="${x}" y="${y}" class="${c.id === here ? 'here' : ''} ${EUROPE.includes(c.id) ? 'eu-l' : ''}">${esc(t('cname.' + c.id))}${c.id === here ? ' ★' : ''}</text>`; }).join('');
    const land = MAP_SHAPES.land.map((r) => `<path d="${ring(r)}"/>`).join('');
    const svg = `<svg class="wmap ${eu ? 'eu' : ''}" viewBox="${eu ? EU_BOX : `0 0 ${MAP_W} ${MAP_H}`}" preserveAspectRatio="xMidYMid meet"><rect width="${MAP_W}" height="${MAP_H}" class="sea"/><g class="neutral">${land}</g>${shapes}<g class="labels">${labels}</g></svg>`;
    // the chosen country's panel
    const c = COUNTRY[sel], r = C.rec(sel), wx = WEATHER[c.climate];
    const mine = r.owner === me;
    const hqMine = sel === here ? g.forts.list.filter((f) => f.owner === 'ally').length : r.hq ? r.hq.filter((s) => s === me).length : mine ? c.hqs : 0;
    const avail = C.available();
    const lo = Math.min(10, avail), hi = Math.min(30, avail);
    const n = Math.max(lo, Math.min(hi, this.mapN || Math.min(20, hi)));
    const go = sel !== here;
    const info = `<div class="cinfo">
      <div class="chead"><img src="${flagURL(c.id)}" alt=""><h3>${esc(t('cname.' + sel))}</h3>
        <span class="wx" title="${esc(wxName(c.climate))}">${wx.icon}</span><span class="muted small">${esc(wxName(c.climate))}</span></div>
      <p>${t('wm.owner')}: <b class="${mine ? 'ally' : 'enemy'}">${t('side.' + r.owner)}</b>${sel === here ? ` · <i>${t('wm.youAreHere')}</i>` : ''}</p>
      <p>${t('wm.garrison')}: ${t('side.allies')} <b>${r.gar.allies}</b> · ${t('side.axis')} <b>${r.gar.axis}</b></p>
      <p>${t('wm.hqs', { n: c.hqs, mine: hqMine })} · ${esc(t('land.' + c.land))}</p>
      ${go ? `<div class="bring"><label>${t('wm.bring')}: <b id="nval">${n}</b></label>
        <input type="range" id="nrange" min="${lo}" max="${hi}" value="${n}" ${hi <= lo ? 'disabled' : ''}>
        <p class="muted small">${t('wm.restStay', { n: Math.max(0, (C.here.gar[me] || 0) - n) })}</p></div>
      <div class="row"><button class="btn primary" data-go="plane">✈ ${t('wm.plane')}</button>
        <button class="btn" data-go="boat" ${c.coast ? '' : 'disabled'}>⚓ ${t('wm.boat')}</button></div>
      ${c.coast ? '' : `<p class="muted small">${t('wm.noCoast')}</p>`}` : ''}
      ${defend ? `<p class="warn small">${t('wm.defendHint')}</p>` : ''}
    </div>`;
    const chips = `<div class="seg tabs wview"><button data-v="world" class="${eu ? '' : 'on'}">${t('wm.world')}</button><button data-v="eu" class="${eu ? 'on' : ''}">${t('wm.europe')}</button></div>
      <div class="cchips">${COUNTRIES.map((k) => `<button class="cchip ${k.id === sel ? 'on' : ''} ${C.rec(k.id).owner === me ? 'ally' : 'enemy'}" data-pick="${k.id}"><img src="${flagURL(k.id)}" alt="">${esc(t('cname.' + k.id))}</button>`).join('')}</div>`;
    const panel = this.panel(t('wm.title'), `${chips}<div class="wmapwrap">${svg}</div>${info}`, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => this.show('worldmap', { focus: sel, defend, view: b.dataset.v }));
    panel.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => this.show('worldmap', { focus: b.dataset.pick, defend }));
    panel.classList.add('worldpanel');
    panel.querySelectorAll('.ctry').forEach((el) => el.addEventListener('click', () => { this.show('worldmap', { focus: el.dataset.c, defend }); }));
    const rg = panel.querySelector('#nrange');
    if (rg) rg.oninput = () => { this.mapN = +rg.value; panel.querySelector('#nval').textContent = rg.value; };
    panel.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => {
      const take = rg ? +rg.value : n;
      this.app.game.overlay = null;
      this.app.travel({ to: sel, by: b.dataset.go, n: take });
    });
  };

  // ---- the armory: weapons, grenades and explosives -------------------------
  P.r_armory = function () {
    const g = this.app.game;
    const stock = [['rifle', 1], ['smg', 1], ['pistol', 1], ['spistol', 1], ['sniper', 1], ['grenade', 4], ['smoke', 2], ['tnt', 3], ['helmet', 1], ['vest', 1]];
    const rows = stock.map(([id, k]) => `<div class="shop-row"><span>${t('item.' + id)} ×${k}</span><b>${g.count(id)}</b>
      <button class="btn small primary" data-take="${id}" data-k="${k}">${t('hq.take')}</button></div>`).join('');
    const panel = this.panel(t('hq.armory'), `<p class="muted small">${t('hq.armoryNote')}</p><div class="shop">${rows}</div>`, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-take]').forEach((b) => b.onclick = () => {
      const id = b.dataset.take, k = +b.dataset.k;
      const cap = { grenade: 8, smoke: 4, tnt: 6 }[id] || 1;
      if (g.count(id) >= cap) { g.hud.toast(t('hq.full')); sfx.error(); return; }
      g.give(id, Math.min(k, cap - g.count(id))); g.hud.dirtyHotbar = true; sfx.pickup ? sfx.pickup() : sfx.done();
      this.show('armory');
    });
  };

  // ---- the end of the war ----------------------------------------------------
  P.r_warEnd = function ({ win }) {
    const g = this.app.game, st = g.stats;
    const body = `<p class="big">${t(win ? 'camp.victory' : 'camp.defeat')}</p><p>${t(win ? 'camp.victorySub' : 'camp.defeatSub')}</p>
      <ul class="steps"><li>${t('stats.countries')}: ${st.countries || 0}</li><li>${t('stats.enemies')}: ${st.enemies || 0}</li></ul>
      <div class="menu"><button class="btn primary" id="wemenu">${t('over.menu')}</button>${win ? `<button class="btn" id="wego">${t('camp.keepPlaying')}</button>` : ''}</div>`;
    this.panel(t(win ? 'camp.victoryTitle' : 'camp.defeatTitle'), body, { back: false });
    this.root.querySelector('#wemenu').onclick = () => this.app.quitToMenu();
    const k = this.root.querySelector('#wego'); if (k) k.onclick = () => this.app.closePanel();
  };

  // ---- battles ---------------------------------------------------------------------
  P.r_battles = function ({ side = 'allies', difficulty = 'medium' } = {}) {
    const done = battlesDone();
    const list = BATTLES.filter((b) => b.d === difficulty);
    const cards = list.map((b) => {
      const role = side === b.att ? 'attack' : 'defend';
      const wx = b.w.map(([, k]) => `<span title="${esc(wxName(k))}">${WEATHER[k].icon}</span>`).join(' → ');
      return `<div class="choice battle" data-b="${b.id}">
        <div class="bhead"><img src="${flagURL(b.c)}" alt=""><h3>${esc(t('battle.' + b.id))}</h3>${done[b.id] ? `<span class="done">✓ ${t('battle.completed')}</span>` : ''}</div>
        <p class="muted small">${esc(b.date)} · ${esc(t('cname.' + b.c))} · ${t('diff.' + b.d)}</p>
        <p><b>${t('battle.role.' + role)}</b> — ${t('battle.goal.' + role, { n: Math.min(2, COUNTRY[b.c].hqs) })}</p>
        <p class="small">${t('battle.by.' + (role === 'attack' ? b.by : 'hold'))} · ${t('battle.weather')}: ${wx}</p>
      </div>`;
    }).join('');
    const panel = this.panel(t('battle.title'), `<p class="muted small">${t('side.' + side)} · ${t('diff.' + difficulty)}</p><p class="muted small">${t('battle.note')}</p><div class="choices battles">${cards}</div>`,
      { wide: true, onBack: () => this.show('newgame', { step: 'final', side, difficulty }) });
    panel.querySelectorAll('[data-b]').forEach((c) => c.onclick = () => this.app.newGame({ side, difficulty, gameType: 'battle', battle: c.dataset.b }));
  };
  P.r_battleEnd = function ({ win, id }) {
    const g = this.app.game, cfg = g.cfg;
    const body = `<p class="big">${t(win ? 'battle.won' : 'battle.lost')}</p><p>${esc(t('battle.' + id))}</p>
      <div class="menu"><button class="btn primary" id="breplay">${t('battle.replay')}</button><button class="btn" id="blist">${t('battle.list')}</button></div>`;
    this.panel(t(win ? 'battle.wonTitle' : 'battle.lostTitle'), body, { back: false });
    this.root.querySelector('#breplay').onclick = () => { this.app.quitToMenu(true); this.app.newGame({ side: cfg.side, difficulty: cfg.difficulty, gameType: 'battle', battle: id }); };
    this.root.querySelector('#blist').onclick = () => this.app.quitToMenu();
  };
}
export { LANDS, BATTLE };
