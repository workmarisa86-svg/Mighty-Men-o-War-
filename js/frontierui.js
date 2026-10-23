// Town Life 2.0 screens: a strongbox or treasure opened, the shady stranger,
// the bank (savings, business deeds), the saloon (drinks, rumors, ranch
// hands), Silas Crane, the fair, naming a horse, clothes, and the goals
// ladder with the trophy wall.
import { t } from './i18n.js';
import { itemIcon } from './items.js';
import { BIZ } from './frontier.js';
import { MAP_PRICE } from './hidden.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export function installFrontierUI(UI) {
  const P = UI.prototype;
  const town = (ui) => ui.app.game.town;

  // ---- a strongbox, or buried treasure ----------------------------------------------
  P.r_found = function ({ title, coins = 0, items = [], map = null, note = null, rich = false }) {
    const rows = [coins ? `<div class="shop-row"><img src="${itemIcon('coins')}" alt=""><span>${t('loot.coins', { n: coins })}</span><b></b></div>` : '']
      .concat(items.map(([id, n]) => `<div class="shop-row"><img src="${itemIcon(id)}" alt=""><span>${t('item.' + id)}${n > 1 ? ' ×' + n : ''}</span><b></b></div>`))
      .concat(map ? [`<div class="shop-row"><img src="${itemIcon('tmap')}" alt=""><span>${t('hid.aMap')}</span><b></b></div>`] : []).join('');
    const body = `${rich ? `<p class="say">${t('hid.rich')}</p>` : ''}<div class="shop">${rows}</div>
      ${note ? `<div class="note-paper"><img src="${itemIcon('note')}" alt=""><p>${esc(t(note))}</p></div>` : ''}
      ${map ? `<p class="muted small">${t('hid.mapHow')}</p>` : ''}`;
    this.panel(title, body, { onBack: () => this.app.closePanel() });
  };

  // ---- the shady stranger at the well -------------------------------------------------
  P.r_stranger = function ({ v }) {
    const T = town(this), H = T.hidden;
    const body = `<div class="who"><b>${esc(v.name)}</b></div><p class="say">“${esc(t('hid.strangerLine'))}”</p>
      <div class="menu"><button class="btn primary" id="smap" ${T.money >= MAP_PRICE ? '' : 'disabled'}>${t('hid.buyMap', { n: MAP_PRICE })}</button>
      <button class="btn" id="srumor">${t('hid.rumor')}</button></div><p class="muted small" id="sout"></p>`;
    this.panel(t('hid.strangerTitle'), body, { onBack: () => this.app.closePanel() });
    const $ = (s) => this.root.querySelector(s);
    $('#smap').onclick = () => { if (H.buyMap()) this.app.closePanel(); };
    $('#srumor').onclick = () => { $('#sout').textContent = t('rumor.' + (1 + Math.floor(Math.random() * 6))); };
  };

  // ---- the bank: savings, and the deeds of businesses ------------------------------------
  P.r_bank = function () {
    const g = this.app.game, T = g.town, F = T.frontier;
    const amt = [10, 50, 200];
    const deeds = Object.keys(BIZ).map((shop) => {
      const own = F.biz[shop];
      return `<div class="shop-row"><span><b>${t('tmap.b.' + shop)}</b> <small class="muted">${t('fr.perDay', { n: F.income(shop) })}${own ? ' · ' + t(own.how === 'stolen' ? 'fr.yoursStolen' : 'fr.yours') : ''}</small></span><b>${own ? '' : BIZ[shop]}</b>
        ${own ? `<button class="btn small" data-sellbiz="${shop}">${t('fr.sellBiz', { n: Math.round(BIZ[shop] * (own.how === 'bought' ? 0.7 : 0.25)) })}</button>` : `<button class="btn small ${T.money >= BIZ[shop] ? 'primary' : ''}" data-buybiz="${shop}" ${T.money >= BIZ[shop] ? '' : 'disabled'}>${t('fr.buyBiz')}</button>`}</div>`;
    }).join('');
    const body = `<p class="coins-line">${t('shop.youHave', { n: T.money })} · ${t('fr.balance', { n: F.bank.balance })}</p>
      <p class="muted small">${t('fr.bankNote')}</p>
      <div class="row">${amt.map((n) => `<button class="btn small" data-dep="${n}" ${T.money >= n ? '' : 'disabled'}>${t('fr.deposit', { n })}</button>`).join('')}<button class="btn small primary" data-dep="all" ${T.money ? '' : 'disabled'}>${t('fr.depositAll')}</button></div>
      <div class="row">${amt.map((n) => `<button class="btn small" data-wd="${n}" ${F.bank.balance >= n ? '' : 'disabled'}>${t('fr.withdraw', { n })}</button>`).join('')}<button class="btn small" data-wd="all" ${F.bank.balance ? '' : 'disabled'}>${t('fr.withdrawAll')}</button></div>
      <h3>${t('fr.businesses')}</h3><div class="shop">${deeds}</div><p class="muted small">${t('fr.bizNote')}</p>`;
    const panel = this.panel(t('tmap.b.bank'), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-dep]').forEach((b) => b.onclick = () => { F.deposit(b.dataset.dep === 'all' ? T.money : +b.dataset.dep); this.show('bank', {}); });
    panel.querySelectorAll('[data-wd]').forEach((b) => b.onclick = () => { F.withdraw(b.dataset.wd === 'all' ? F.bank.balance : +b.dataset.wd); this.show('bank', {}); });
    panel.querySelectorAll('[data-buybiz]').forEach((b) => b.onclick = () => { F.buyBiz(b.dataset.buybiz); this.show('bank', {}); });
    panel.querySelectorAll('[data-sellbiz]').forEach((b) => b.onclick = () => { F.sellBiz(b.dataset.sellbiz); this.show('bank', {}); });
  };

  // ---- the saloon: a drink, a meal, rumors, hired hands -------------------------------------
  P.r_saloon = function () {
    const g = this.app.game, T = g.town, F = T.frontier;
    const body = `<p class="coins-line">${t('shop.youHave', { n: T.money })}</p>
      <div class="menu">
        <button class="btn" id="sdrink" ${T.money >= 3 ? '' : 'disabled'}>${t('fr.drink', { n: 3 })}</button>
        <button class="btn" id="smeal" ${T.money >= 6 ? '' : 'disabled'}>${t('fr.meal', { n: 6 })}</button>
        <button class="btn" id="srumor">${t('fr.rumors')}</button>
        <button class="btn" id="shire">${t('fr.hireHand', { n: 8 })}</button>
        ${F.hands ? `<button class="btn ghost" id="sfire">${t('fr.fireHand', { n: F.hands })}</button>` : ''}
      </div><p class="say" id="sout"></p><p class="muted small">${t('fr.handsNote')}</p>`;
    this.panel(t('tmap.b.saloon'), body, { onBack: () => this.app.closePanel() });
    const $ = (s) => this.root.querySelector(s), out = $('#sout');
    $('#sdrink').onclick = () => { T.money -= 3; g.player.health = Math.min(100, g.player.health + 12); out.textContent = t('fr.drank'); this.app.saveSoon && this.app.saveSoon(); $('#sdrink').disabled = T.money < 3; };
    $('#smeal').onclick = () => { T.money -= 6; g.player.hunger = Math.min(100, g.player.hunger + 55); out.textContent = t('fr.ate'); $('#smeal').disabled = T.money < 6; };
    $('#srumor').onclick = () => { out.textContent = '“' + t('rumor.' + (1 + Math.floor(Math.random() * 6))) + '”'; };
    $('#shire').onclick = () => { F.hands = Math.min(3, F.hands + 1); this.show('saloon', {}); };
    if ($('#sfire')) $('#sfire').onclick = () => { F.hands = Math.max(0, F.hands - 1); this.show('saloon', {}); };
  };

  // ---- Silas Crane ---------------------------------------------------------------------
  P.r_silas = function () {
    const F = town(this).frontier;
    const body = `<div class="who"><b>Silas Crane</b><span class="muted small">${t('q.silasWho')}</span></div><p class="say">“${esc(t('q.silasLine'))}”</p>
      <div class="menu"><button class="btn primary" id="qlaw">${t('q.silasLaw')}</button><button class="btn" id="qmoney">${t('q.silasMoney')}</button></div>`;
    this.panel(t('q.wellTitle'), body, { onBack: () => this.app.closePanel() });
    this.root.querySelector('#qlaw').onclick = () => { F.confront('law'); this.app.closePanel(); };
    this.root.querySelector('#qmoney').onclick = () => { F.confront('money'); this.app.closePanel(); };
  };

  // ---- the town fair -------------------------------------------------------------------
  P.r_fair = function () {
    const F = town(this).frontier;
    const body = `<p>${t('fr.fairText')}</p><div class="menu">
      <button class="btn primary" id="fshoot">${t('fr.fairShoot')}</button>
      <button class="btn" id="frace">${t('fr.fairRace')}</button>
      <button class="btn" id="fstock">${t('fr.fairStock')}</button></div>`;
    this.panel(t('fr.ev.fair'), body, { onBack: () => this.app.closePanel() });
    this.root.querySelector('#fshoot').onclick = () => { this.app.closePanel(); F.startShooting(); };
    this.root.querySelector('#frace').onclick = () => { this.app.closePanel(); F.startRace(); };
    this.root.querySelector('#fstock').onclick = () => { this.app.closePanel(); F.livestockPrize(); };
  };

  // ---- naming your horse ---------------------------------------------------------------
  P.r_horsename = function ({ h }) {
    const body = `<p>${t('fr.nameHorse')}</p><input id="hname" class="text" maxlength="18" value="${esc(h.name || '')}" placeholder="${t('fr.horseHint')}">
      <div class="row end"><button class="btn primary" id="hok">${t('fr.ok')}</button></div>`;
    this.panel(t('ctx.nameHorse'), body, { onBack: () => this.app.closePanel() });
    const inp = this.root.querySelector('#hname'); setTimeout(() => inp.focus(), 50);
    const ok = () => { const n = inp.value.trim().slice(0, 18); if (n) { h.name = n; this.app.game.hud.toast(t('fr.horseNamed', { name: n }), 'pick'); } this.app.closePanel(); };
    this.root.querySelector('#hok').onclick = ok;
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') ok(); });
  };

  // ---- clothes (the general store) -------------------------------------------------------
  P.r_clothes = function () {
    const T = town(this), F = T.frontier, L = Object.assign({ shirt: 0xb8a888, vest: 0x5a4632, hat: 'felt', hatColor: 0x4a3a2a, trousers: 0x3e3a34 }, F.look || {});
    const C = { shirt: [0xb8a888, 0xe8e4d8, 0x6a2a22, 0x2a3a5a, 0x3a4a2a, 0x2a2a2e], vest: [0x5a4632, 0x161412, 0x6a5a3a, 0x7a2a22, null], hatColor: [0x4a3a2a, 0x121212, 0xc8b898, 0x5a4a3a], trousers: [0x3e3a34, 0x2a2a3a, 0x5a4a32, 0x1e1e20], hat: ['felt', 'cap', 'none'] };
    const row = (k) => `<div class="shop-row"><span>${t('fr.cloth.' + k)}</span><b></b><span class="swatches">${C[k].map((c) => k === 'hat'
      ? `<button class="btn small ${L[k] === c ? 'primary' : ''}" data-k="${k}" data-c="${c}">${t('fr.hat.' + c)}</button>`
      : `<button class="sw ${L[k] === c ? 'on' : ''}" data-k="${k}" data-c="${c}" style="background:${c == null ? 'transparent' : hex(c)}">${c == null ? '✕' : ''}</button>`).join('')}</span></div>`;
    const body = `<p class="coins-line">${t('shop.youHave', { n: T.money })} · ${t('fr.clothPrice', { n: 10 })}</p><div class="shop">${['hat', 'hatColor', 'shirt', 'vest', 'trousers'].map(row).join('')}</div><p class="muted small">${t('fr.clothNote')}</p>`;
    const panel = this.panel(t('fr.clothes'), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { const k = b.dataset.k, c = b.dataset.c; F.buyLook({ [k]: k === 'hat' ? c : c === 'null' ? null : +c }); this.show('clothes', {}); });
  };

  // ---- the goals ladder and the trophy wall ------------------------------------------------
  P.r_goals = function ({ from }) {
    const T = town(this), F = T.frontier;
    const goals = F.goalList().map((G) => `<div class="goal ${G.done ? 'done' : ''} ${G.top ? 'top' : ''}"><span>${G.done ? '✔' : G.top ? '★' : '○'} ${t('goal.' + G.id)}</span>
      <i><b style="width:${Math.round(G.v / G.n * 100)}%"></b></i><small>${G.n > 1 ? `${G.v} / ${G.n} · ` : ''}${F.rewardText(G.reward)}</small></div>`).join('');
    const troph = F.trophies().map(([k, n]) => `<div class="trophy ${n ? '' : 'none'}"><b>${n}</b><span>${t('troph.' + k)}</span></div>`).join('');
    const biz = Object.keys(F.biz).map((s) => t('tmap.b.' + s)).join(', ') || t('fr.none');
    const body = `<h3>${t('goal.ladder')}</h3><div class="goals">${goals}</div>
      <h3>${t('troph.title')}</h3><div class="trophies">${troph}</div>
      <p class="muted small">${t('fr.yourBiz', { list: biz })} · ${t('fr.balance', { n: F.bank.balance })}${F.hands ? ' · ' + t('fr.handsN', { n: F.hands }) : ''}</p>`;
    this.panel(t('goal.title'), body, { wide: true, onBack: () => (from === 'pause' ? this.show('pause') : this.app.closePanel()) });
  };
}
