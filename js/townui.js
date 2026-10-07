// Town Life screens: its own menu (one persistent world: Continue / Start
// over), shops, favors, the posse's questions, the sheriff and jail.
import { t } from './i18n.js';
import { itemIcon } from './items.js';
import { hasTown } from './storage.js';
import { SHOPS } from './town.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function installTownUI(UI) {
  const P = UI.prototype;

  // ---- Town Life menu --------------------------------------------------------
  P.r_town = function () {
    const has = hasTown();
    this.root.classList.add('town-menu');
    this.panel('Town Life', `<img class="soonart" src="img/town-card.webp" width="800" height="600" alt="">
      <p class="muted">${t('town.intro')}</p>
      <div class="menu">
        <button class="btn primary" id="tplay">${t(has ? 'town.continue' : 'town.start')}</button>
        ${has ? `<button class="btn ghost danger" id="tover">${t('town.over')}</button>` : ''}
        <button class="btn" id="tset">${t('menu.settings')}</button>
        <button class="btn" id="tman">${t('menu.manual')}</button>
        <button class="btn" id="tstats">${t('menu.stats')}</button>
        <button class="btn ghost" id="tgames">${t('menu.games')}</button>
      </div>`, { back: false });
    const $ = (s) => this.root.querySelector(s);
    $('#tplay').onclick = () => this.app.startTown(false);
    if ($('#tover')) $('#tover').onclick = () => this.confirm(t('town.overConfirm'), () => this.app.startTown(true), () => this.show('town'));
    $('#tset').onclick = () => this.show('settings', { from: 'town' });
    $('#tman').onclick = () => this.show('manual', { from: 'town' });
    $('#tstats').onclick = () => this.show('stats', { from: 'town' });
    $('#tgames').onclick = () => this.show('start');
    this.app.menuMusic && this.app.menuMusic();
  };

  // ---- shops: buy and sell -------------------------------------------------
  P.r_shop = function ({ shop, v, tab = 'buy' }) {
    const g = this.app.game, T = g.town, S = SHOPS[shop];
    const rows = tab === 'buy'
      ? Object.entries(S.sells).map(([id, base]) => {
        const p = T.price(id, true, base);
        return `<div class="shop-row"><img src="${itemIcon(id)}" alt=""><span>${t('item.' + id)}</span><b>${p}</b>
          <button class="btn small ${T.money >= p ? 'primary' : ''}" data-buy="${id}" ${T.money >= p ? '' : 'disabled'}>${t('shop.buy')}</button></div>`;
      }).join('')
      : Object.entries(S.buys).filter(([id]) => g.count(id) > 0).map(([id, base]) => {
        const p = T.price(id, false, base), n = g.count(id);
        return `<div class="shop-row"><img src="${itemIcon(id)}" alt=""><span>${t('item.' + id)} <small>×${n}</small></span><b>${p}</b>
          <button class="btn small primary" data-sell="${id}" data-n="1">${t('shop.sell')}</button>${n > 1 ? `<button class="btn small" data-sell="${id}" data-n="${n}">${t('shop.sellAll', { n: p * n })}</button>` : ''}</div>`;
      }).join('') || `<p class="muted">${t('shop.nothing')}</p>`;
    const body = `<div class="who"><b>${esc(v.name)}</b><span class="muted small">${t('shop.' + shop)}</span></div>
      <p class="coins-line">${t('shop.youHave', { n: T.money })}${T.honor >= 65 ? ' · ' + t('shop.goodPrices') : T.honor < 35 ? ' · ' + t('shop.badPrices') : ''}</p>
      <div class="seg tabs"><button data-tab="buy" class="${tab === 'buy' ? 'on' : ''}">${t('shop.buyTab')}</button><button data-tab="sell" class="${tab === 'sell' ? 'on' : ''}">${t('shop.sellTab')}</button></div>
      <div class="shop">${rows}</div>`;
    const panel = this.panel(t('shop.' + shop), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => this.show('shop', { shop, v, tab: b.dataset.tab }));
    panel.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => { if (T.buy(shop, b.dataset.buy)) this.show('shop', { shop, v, tab }); });
    panel.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => { if (T.sell(shop, b.dataset.sell, +b.dataset.n)) this.show('shop', { shop, v, tab }); });
  };

  // ---- a favor offered by a villager ---------------------------------------
  P.r_favor = function ({ v, offer }) {
    const g = this.app.game, T = g.town;
    const what = offer.courier ? t('favor.courier', { name: offer.toName, n: offer.pay }) : t('favor.bring', { n: offer.n, item: t('item.' + offer.item), pay: offer.pay });
    const body = `<div class="who"><b>${esc(v.name)}</b></div><p class="say">“${esc(what)}”</p>
      <p class="muted small">${t('favor.note')}</p>
      <div class="row end"><button class="btn ghost" id="fno">${t('favor.decline')}</button><button class="btn primary" id="fyes">${t('favor.accept')}</button></div>`;
    this.panel(t('favor.title'), body, { back: false });
    this.root.querySelector('#fyes').onclick = () => { T.acceptFavor(offer); this.app.closePanel(); };
    this.root.querySelector('#fno').onclick = () => this.app.closePanel();
  };

  // ---- the posse questions you ------------------------------------------------
  P.r_question = function () {
    const g = this.app.game, T = g.town, Pz = T.posse;
    const leader = Pz && Pz.members.find((m) => m.alive);
    const body = `<div class="who"><b>${esc(leader ? leader.name : '')}</b><span class="muted small">${t('law.posseOf', { n: Pz ? Pz.members.filter((m) => m.alive).length : 0 })}</span></div>
      <p class="say">“${esc(t('law.questionLine', { n: T.bounty }))}”</p>
      <div class="menu">
        <button class="btn primary" data-q="surrender">${t('law.surrender')}</button>
        <button class="btn" data-q="pay" ${T.money >= T.bounty ? '' : 'disabled'}>${t('law.pay', { n: T.bounty })}</button>
        <button class="btn" data-q="talk" ${Pz && Pz.talked ? 'disabled' : ''}>${t('law.talk')}</button>
        <button class="btn ghost" data-q="run">${t('law.run')}</button>
        <button class="btn ghost danger" data-q="fight">${t('law.fight')}</button>
      </div><p class="muted small">${t('law.questionNote')}</p>`;
    this.panel(t('law.questionTitle'), body, { back: false });
    this.root.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { if (T.answer(b.dataset.q) === 'stay') this.show('question'); });
  };

  // ---- the sheriff: pay a bounty or turn yourself in -----------------------
  P.r_sheriff = function ({ v }) {
    const g = this.app.game, T = g.town;
    const body = `<div class="who"><b>${esc(v.name)}</b><span class="muted small">${t('law.sheriff')}</span></div>
      <p class="say">“${esc(T.bounty ? t('law.sheriffWanted', { n: T.bounty }) : t('law.sheriffClean'))}”</p>
      <div class="menu">
        ${T.bounty ? `<button class="btn primary" id="spay" ${T.money >= T.bounty ? '' : 'disabled'}>${t('law.pay', { n: T.bounty })}</button>
        <button class="btn" id="sturn">${t('law.turnIn')}</button>` : ''}
        <button class="btn" id="sfavor">${t('ctx.favor')}</button>
      </div><p class="muted small">${t('law.clearWays')}</p>`;
    this.panel(t('law.sheriffTitle'), body, { onBack: () => this.app.closePanel() });
    const $ = (s) => this.root.querySelector(s);
    if ($('#spay')) $('#spay').onclick = () => { T.money -= T.bounty; T.bounty = 0; T.addHonor(2); T.disband('law.cleared'); this.app.closePanel(); };
    if ($('#sturn')) $('#sturn').onclick = () => { this.app.closePanel(); T.jail(); };
    $('#sfavor').onclick = () => { this.app.closePanel(); T.askFavor(v); };
  };

  // ---- after jail ---------------------------------------------------------------
  P.r_jailed = function ({ paid, fine, lost }) {
    const body = `<p>${t('law.jailText')}</p>
      <ul class="steps"><li>${t('law.jailFine', { n: paid, f: fine })}</li>${lost.length ? `<li>${t('law.jailLost', { list: lost.join(', ') })}</li>` : ''}<li>${t('law.jailCrops')}</li></ul>`;
    this.panel(t('law.jailTitle'), body, { onBack: () => this.app.closePanel() });
  };
}
