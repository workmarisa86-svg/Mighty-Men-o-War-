// Town Life screens: its own menu (one persistent world: Continue / Start
// over), shops, jobs, the posse's questions, the sheriff and jail.
import { t } from './i18n.js';
import { itemIcon } from './items.js';
import { hasTown } from './storage.js';
import { M } from './modes.js';      // (Town Life's code is loaded once a town game starts)
import { TRADES, GROUPS, KIT, COINS } from './trades.js';
import { DESIGNS, DESIGN_IDS } from './houses.js';

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
    const g = this.app.game, T = g.town, S = M.SHOPS[shop];
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

  // ---- a job offered by a villager ---------------------------------------
  P.r_job = function ({ v, offer }) {
    const g = this.app.game, T = g.town;
    const what = offer.courier ? t('job.courier', { name: offer.toName, n: offer.pay }) : t('job.bring', { n: offer.n, item: t('item.' + offer.item), pay: offer.pay });
    const body = `<div class="who"><b>${esc(v.name)}</b></div><p class="say">“${esc(what)}”</p>
      <p class="muted small">${t('job.note')}</p>
      <div class="row end"><button class="btn ghost" id="fno">${t('job.decline')}</button><button class="btn primary" id="fyes">${t('job.accept')}</button></div>`;
    this.panel(t('job.title'), body, { back: false });
    this.root.querySelector('#fyes').onclick = () => { T.acceptJob(offer); this.app.closePanel(); };
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
    const g = this.app.game, T = g.town, Tr = T.trades;
    const body = `<div class="who"><b>${esc(v.name)}</b><span class="muted small">${t('law.sheriff')}</span></div>
      <p class="say">“${esc(T.bounty ? t('law.sheriffWanted', { n: T.bounty }) : t('law.sheriffClean'))}”</p>
      <div class="menu">
        ${T.bounty ? `<button class="btn primary" id="spay" ${T.money >= T.bounty ? '' : 'disabled'}>${t('law.pay', { n: T.bounty })}</button>
        <button class="btn" id="sturn">${t('law.turnIn')}</button>` : ''}
        <button class="btn" id="sjob">${t('ctx.job')}</button>
        <button class="btn" id="sboard">${t('bounty.board')}${Tr.claimable().length ? ` <b class="badge">${Tr.claimable().length}</b>` : ''}</button>
        <button class="btn ghost" id="strade">${t('trade.change', { n: Tr.changeFee() })}</button>
      </div><p class="muted small">${t('law.clearWays')}</p>`;
    this.panel(t('law.sheriffTitle'), body, { onBack: () => this.app.closePanel() });
    const $ = (s) => this.root.querySelector(s);
    $('#sboard').onclick = () => this.show('bounties', { v });
    $('#strade').onclick = () => this.show('trades', { mode: 'change', v });
    if ($('#spay')) $('#spay').onclick = () => { T.money -= T.bounty; T.bounty = 0; T.addHonor(2); T.disband('law.cleared'); this.app.closePanel(); };
    if ($('#sturn')) $('#sturn').onclick = () => { this.app.closePanel(); T.jail(); };
    $('#sjob').onclick = () => { this.app.closePanel(); T.askJob(v); };
  };



  // ---- the land office: houses and lots ------------------------------------------
  P.r_land = function ({ v, design = null }) {
    const g = this.app.game, T = g.town, Hs = T.houses, p = g.player.pos;
    const where = (q) => {
      if (q.town) return t(q.side === 's' ? 'land.lotNorth' : 'land.lotSouth');
      const dx = (q.x0 + q.x1) / 2 - p.x, dz = (q.z0 + q.z1) / 2 - p.z, a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
      return t('land.lotCountry', { m: Math.round(Math.hypot(dx, dz) / 10) * 10, dir: t('dir.' + ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(a / 45) % 8]) });
    };
    if (design) {
      // choose a lot for a house bought built
      const lots = Hs.freeLots(design);
      const rows = lots.map((q) => `<div class="shop-row"><span><b>${where(q)}</b></span><b></b><button class="btn small primary" data-lot="${q.id}">${t('land.buyHere', { n: Hs.price(design) })}</button></div>`).join('') || `<p class="muted">${t('land.noLots')}</p>`;
      const panel = this.panel(t('house.' + design), `<p class="muted">${t('land.pickLot')}</p><div class="shop">${rows}</div>`, { wide: true, onBack: () => this.show('land', { v }) });
      panel.querySelectorAll('[data-lot]').forEach((b) => b.onclick = () => { if (Hs.buyBuilt(design, b.dataset.lot)) this.app.closePanel(); else this.show('land', { v, design }); });
      return;
    }
    const mine = [];
    const cur = Hs.home();
    mine.push(`<div class="shop-row"><span><b>${t('land.yourHome')}</b> ${cur ? t('house.' + cur.design) : t('land.cottage')}</span><b></b><span></span></div>`);
    if (cur && !Hs.cottageSold) mine.push(`<div class="shop-row"><span>${t('land.cottage')}${Hs.cottageTaken ? ' · <span class="muted">' + t('land.taken') + '</span>' : ''}</span><b>${Math.round(60 * T.trades.priceK('house', false))}</b><button class="btn small" data-sellc="1" ${Hs.cottageTaken ? 'disabled' : ''}>${t('shop.sell')}</button></div>`);
    for (const h of Hs.homes) if (h.id !== Hs.homeId) mine.push(`<div class="shop-row"><span>${t('house.' + h.design)}</span><b>${Math.round(DESIGNS[h.design].value * T.trades.priceK('house', false))}</b><button class="btn small" data-sell="${h.id}">${t('shop.sell')}</button></div>`);
    for (const h of Hs.homes) if (h.id !== Hs.homeId) mine.push(`<div class="shop-row"><span>${t('house.' + h.design)}</span><b></b><button class="btn small" data-move="${h.id}">${t('land.moveIn')}</button></div>`);
    if (Hs.bp) mine.push(`<div class="shop-row"><span>${t('land.bpOn', { house: t('house.' + Hs.bp.design), n: (Hs.total || 0) - (Hs.left || 0), total: Hs.total || 0 })}</span><b></b><button class="btn small ghost" data-cancel="1">${t('land.cancelBp')}</button></div>`);
    const cards = DESIGN_IDS.map((id) => {
      const D = DESIGNS[id], why = Hs.allowed(id), pb = Hs.price(id), ps = Hs.price(id, true), P = D.plan();
      const lots = Hs.freeLots(id).length;
      return `<div class="trade-card house-card"><b>${t('house.' + id)}</b><span class="tagline">${t('house.' + id + 'Tag')}</span>
        <small class="muted">${t('land.size', { w: P.w - 2, d: P.d - 2, n: P.blocks.length })}${D.honor ? ' · ' + t('land.honor', { n: D.honor }) : ''}</small>
        ${why ? `<small class="warn">${why}</small>` : ''}
        <div class="row"><button class="btn small primary" data-built="${id}" ${why || T.money < pb || !lots ? 'disabled' : ''}>${t('land.buyBuilt', { n: pb })}</button>
        <button class="btn small" data-supplies="${id}" ${why || T.money < ps || Hs.bp ? 'disabled' : ''}>${t('land.buySupplies', { n: ps })}</button></div></div>`;
    }).join('');
    const body = `<div class="who"><b>${esc(v.name)}</b><span class="muted small">${t('shop.land')}</span></div>
      <p class="coins-line">${t('shop.youHave', { n: T.money })}</p>
      <div class="shop">${mine.join('')}</div>
      <p class="muted small">${t('land.note')}</p>
      <div class="trade-cards">${cards}</div>`;
    const panel = this.panel(t('shop.land'), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-built]').forEach((b) => b.onclick = () => this.show('land', { v, design: b.dataset.built }));
    panel.querySelectorAll('[data-supplies]').forEach((b) => b.onclick = () => { if (Hs.buySupplies(b.dataset.supplies)) this.app.closePanel(); });
    panel.querySelectorAll('[data-sell]').forEach((b) => b.onclick = () => { Hs.sellHome(Hs.homes.find((h) => h.id === b.dataset.sell)); this.show('land', { v }); });
    panel.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { Hs.moveInto(Hs.homes.find((h) => h.id === b.dataset.move)); this.show('land', { v }); });
    const sc = panel.querySelector('[data-sellc]'); if (sc) sc.onclick = () => { Hs.sellCottage(); this.show('land', { v }); };
    const cb = panel.querySelector('[data-cancel]'); if (cb) cb.onclick = () => { Hs.cancelBlueprint(); this.show('land', { v }); };
  };

  // ---- the bounty board at the sheriff's office --------------------------------------
  P.r_bounties = function ({ v }) {
    const g = this.app.game, T = g.town, Tr = T.trades, p = g.player.pos;
    const dirTo = (c) => { const dx = c.x + 3 - p.x, dz = c.z + 3 - p.z, a = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; return t('bounty.where', { m: Math.round(Math.hypot(dx, dz) / 10) * 10, dir: t('dir.' + ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round(a / 45) % 8]) }); };
    const k = Tr.rewardK();
    const rows = Tr.trade === 'outlaw'
      ? `<p class="say">“${esc(t('bounty.notForYou'))}”</p>`
      : Tr.bounties.filter((b) => b.status === 'open' || b.status === 'dead').map((b) => {
        const c = Tr.cabinOf(b);
        return `<div class="shop-row bounty-row"><span class="wanted">${t('bounty.wanted')}</span><span><b>${esc(b.name)}</b><small>${t('bounty.crime.' + b.crime)} · ${c ? dirTo(c) : ''}</small></span>
          <b>${Math.round(b.reward * k)}</b>${b.status === 'dead' ? `<button class="btn small primary" data-c="${b.id}">${t('bounty.collect')}</button>` : `<small class="muted">${t('bounty.alive', { n: Math.round(b.reward * k * 1.5) })}</small>`}</div>`;
      }).join('') || `<p class="muted">${t('bounty.none')}</p>`;
    const body = `<div class="who"><b>${esc(v.name)}</b><span class="muted small">${t('law.sheriff')}</span></div>${rows}
      <p class="muted small">${t(Tr.trade === 'bounty' ? 'bounty.noteHunter' : 'bounty.note')}</p>`;
    const panel = this.panel(t('bounty.board'), body, { wide: true, onBack: () => this.show('sheriff', { v }) });
    panel.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { Tr.collect(Tr.bounties.find((x) => x.id === +b.dataset.c)); this.show('bounties', { v }); });
  };

  // ---- trades: the choice at the start of a story, a change at the sheriff's, your standing ----
  P.r_trades = function ({ mode = 'info', v = null } = {}) {
    const g = this.app.game, T = g.town, Tr = T.trades;
    const card = (id) => `<button class="trade-card ${Tr.trade === id ? 'on' : ''}" data-t="${id}" ${mode === 'change' && Tr.trade === id ? 'disabled' : ''}>
        <b>${t('trade.' + id)}</b><span class="tagline">${t('trade.' + id + 'Tag')}</span>
        <ul>${t('trade.' + id + 'Perks').split('|').map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        ${mode === 'choose' ? `<small class="muted">${t('trade.kit')}: ${[COINS[id] + ' ' + t('trade.coins'), ...KIT[id].map(([it, n]) => (n > 1 ? n + ' × ' : '') + t('item.' + it)), ...(id === 'farmer' ? [t('trade.farmAnimals')] : []), ...(id === 'outlaw' ? [t('trade.gang')] : [])].join(', ')}</small>` : ''}
      </button>`;
    if (mode === 'info') {
      const bar = (k) => { const r = Math.round(Tr.reps[k]); return `<div class="rep-row"><span>${t('rep.' + k)}</span><div class="rep-bar"><i style="left:${50 + Math.min(0, r) / 2}%;width:${Math.abs(r) / 2}%" class="${r < 0 ? 'neg' : 'pos'}"></i></div><b>${r > 0 ? '+' : ''}${r}</b></div>`; };
      const st = T.st;
      const body = `<p class="label">${t('trade.yours')}</p><div class="trade-cards one">${Tr.trade ? card(Tr.trade) : ''}</div>
        <p class="label">${t('rep.title')}</p>${GROUPS.map(bar).join('')}<p class="muted small">${t('rep.note')}</p>
        <div class="stats-wrap"><table class="stats"><tbody>
          <tr><td>${t('stats.tbounties')}</td><td>${st.bounties || 0}</td></tr><tr><td>${t('stats.talive')}</td><td>${st.alive || 0}</td></tr>
          <tr><td>${t('stats.tduels')}</td><td>${st.duels || 0}</td></tr><tr><td>${t('stats.ttraps')}</td><td>${Tr.traps.length}</td></tr>
          ${Tr.gang.length ? `<tr><td>${t('stats.tgang')}</td><td>${Tr.gang.map((m) => esc(m.name)).join(', ')}</td></tr>` : ''}
        </tbody></table></div>`;
      this.panel(t('trade.title'), body, { wide: true, onBack: () => this.show('pause') });
      return;
    }
    const body = `<p class="muted">${t(mode === 'choose' ? 'trade.chooseNote' : 'trade.changeNote', { n: Tr.changeFee() })}</p>
      <div class="trade-cards">${TRADES.map(card).join('')}</div>`;
    const panel = this.panel(t(mode === 'choose' ? 'trade.chooseTitle' : 'trade.changeTitle'), body, mode === 'choose' ? { wide: true, back: false } : { wide: true, onBack: () => this.show('sheriff', { v }) });
    panel.classList.add('trade-panel');
    panel.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => {
      const id = b.dataset.t;
      if (mode === 'choose') { Tr.choose(id); this.app.closePanel(); }
      else this.confirm(t('trade.changeConfirm', { trade: t('trade.' + id), n: Tr.changeFee() }), () => { if (Tr.choose(id, true)) this.app.closePanel(); else this.show('trades', { mode, v }); }, () => this.show('trades', { mode, v }));
    });
  };

  // ---- after jail ---------------------------------------------------------------
  P.r_jailed = function ({ lost = [] }) {
    const touch = this.app.input.touch;
    const body = `<p>${t('jail.text')}</p>
      <ul class="steps"><li>${t('jail.noFine')}</li>${lost.length ? `<li>${t('law.jailLost', { list: lost.join(', ') })}</li>` : ''}<li>${t(touch ? 'jail.howSleepTouch' : 'jail.howSleep')}</li><li>${t(touch ? 'jail.howPickTouch' : 'jail.howPick')}</li></ul>`;
    this.panel(t('law.jailTitle'), body, { onBack: () => this.app.closePanel() });
  };

  // ---- the hospital: waking after a death ------------------------------------
  P.r_hospital = function ({ mode, fee = 0, paid = 0, help = 0, owe = 0, debt = 0, starve = false }) {
    const T = this.app.game.town;
    if (mode === 'arrest') {
      const body = `<p>${t('hosp.arrest')}</p><ul class="steps"><li>${t('hosp.arrestHow')}</li></ul>
        <div class="menu"><button class="btn primary" id="hgo">${t('hosp.goJail')}</button></div>`;
      this.panel(t('hosp.title'), body, { back: false });
      this.root.querySelector('#hgo').onclick = () => { this.app.closePanel(); T.hospitalToJail(); };
      return;
    }
    const lines = [t(starve ? 'hosp.starved' : 'hosp.treated'), t('hosp.fee', { n: fee })];
    if (paid) lines.push(t('hosp.youPaid', { n: paid }));
    if (help) lines.push(t('hosp.townPaid', { n: help }));
    if (owe) lines.push(t('hosp.owe', { n: owe, debt }));
    this.panel(t('hosp.title'), `<ul class="steps">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`, { onBack: () => this.app.closePanel() });
  };

  // ---- sleep: until night or until morning ----------------------------------
  P.r_sleep = function () {
    const g = this.app.game, T = g.town, h = (g.time % 1) * 24;
    const night = h >= 21 || h < 6;
    const body = `<p class="muted">${t('sleep.note')}</p><div class="menu">
      ${night ? '' : `<button class="btn" data-s="night">${t('sleep.night')}</button>`}
      <button class="btn primary" data-s="morning">${t('sleep.morning')}</button>
      <button class="btn ghost" data-s="no">${t('sleep.cancel')}</button></div>`;
    this.panel(t('sleep.title'), body, { onBack: () => this.app.closePanel() });
    this.root.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { const w = b.dataset.s; this.app.closePanel(); if (w !== 'no') T.sleepUntil(w); });
  };

  // ---- the town map: the center, the homes and paths, your cottage, people ----
  P.r_townmap = function ({ from }) {
    const g = this.app.game, T = g.town, V = T.village;
    const C = { shop: '#d8b048', law: '#7a8aa0', home: '#a89a80', cottage: '#e8dcb0', people: '#7ac860', posse: '#c04a3a' };
    const sw = (c, k) => `<span><i style="background:${c}"></i>${t(k)}</span>`;
    const body = `<div class="warmap"><canvas id="wmap"></canvas></div>
      <div class="legend">${sw('#a0dc78', 'tmap.lots')}${sw('#f0e090', 'tmap.home')}${sw('#9a9aa2', 'tmap.traps')}${sw('#b8402e', 'tmap.wanted')}${sw(C.shop, 'tmap.shops')}${sw(C.law, 'tmap.law')}${sw(C.home, 'tmap.homes')}${sw(C.cottage, 'tmap.cottage')}${sw(C.people, 'tmap.people')}${T.posse ? sw(C.posse, 'tmap.posse') : ''}<span><i class="you"></i>${t('map.you')}</span></div>`;
    const close = () => from === 'pause' ? this.show('pause') : this.app.closePanel();
    const panel = this.panel(t('menu.townMap'), `<div class="seg tabs"><button data-z="0" class="${this.townZoom ? '' : 'on'}">${t('tmap.whole')}</button><button data-z="1" class="${this.townZoom ? 'on' : ''}">${t('tmap.zoomCenter')}</button></div>` + body, { wide: true, onBack: close });
    panel.querySelectorAll('[data-z]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); this.townZoom = b.dataset.z === '1'; this.show('townmap', { from }); });
    panel.classList.add('mappanel');
    const x = document.createElement('button'); x.className = 'btn icon-close'; x.setAttribute('aria-label', t('map.close')); x.textContent = '✕';
    x.onclick = close; panel.appendChild(x);
    const back = panel.querySelector('[data-act=back]'); if (back) back.textContent = t('map.close');
    const cv = panel.querySelector('#wmap'), w = g.world;
    if (this.app.input.touch) cv.addEventListener('click', close);
    const S = this.mapSize(panel);
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(this.terrainImage(g), 0, 0, S * dpr, S * dpr);
    const sc = S * dpr / Math.max(w.W, w.D);
    const box = (b, col) => {
      c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1.5 * dpr;
      c.fillRect(b.x0 * sc, b.z0 * sc, (b.x1 - b.x0 + 1) * sc, (b.z1 - b.z0 + 1) * sc);
      c.strokeRect(b.x0 * sc, b.z0 * sc, (b.x1 - b.x0 + 1) * sc, (b.z1 - b.z0 + 1) * sc);
    };
    const zoom = this.townZoom ? 3.4 : 1;
    if (zoom > 1) { c.setTransform(zoom, 0, 0, zoom, -(V.cx * sc) * (zoom - 1), -(V.cz * sc) * (zoom - 1)); c.drawImage(this.terrainImage(g), 0, 0, S * dpr, S * dpr); }
    for (const b of V.buildings) box(b, b.type === 'house' ? C.home : b.type === 'hall' || b.type === 'jail' ? C.law : C.shop);
    const cot = T.cottage;
    box({ x0: cot.x - 3, z0: cot.z - 3, x1: cot.x + 3, z1: cot.z + 3 }, C.cottage);
    // labels: in the whole view the town center is one label and homes show
    // their kind; the closer view names every building with its icon
    const ICON = { land: '📜', general: '🛒', butcher: '🥩', hunting: '🎯', market: '🧺', hall: '⭐', jail: '🔒', stable: '🐎', house: '🏠' };
    const label = (txt, x, y, size = 11) => { c.font = `${size * dpr / zoom}px Oswald, Arial`; c.textAlign = 'center'; c.lineWidth = 3 * dpr / zoom; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(txt, x, y); c.fillStyle = '#f0e8cc'; c.fillText(txt, x, y); };
    if (zoom > 1) {
      for (const b of V.buildings) if (b.type !== 'house') label((ICON[b.type] || '') + ' ' + t('tmap.b.' + b.type), (b.x0 + b.x1 + 1) / 2 * sc, (b.z0 - 0.8) * sc, 10);
    } else {
      label(t('tmap.center'), V.cx * sc, (V.cz - 20) * sc);
      for (const b of V.buildings) if (b.type === 'house') label(t('tmap.h.' + (b.status || 'house')), (b.x0 + b.x1 + 1) / 2 * sc, (b.z0 - 1) * sc, 9);
    }
    label(t('tmap.cottage'), cot.x * sc, (cot.z - 5) * sc);
    for (const v of T.folk.list) {
      if (!v.alive || v.away || (!v.posse && Math.hypot(v.pos.x - g.player.pos.x, v.pos.z - g.player.pos.z) > 120)) continue;
      c.fillStyle = v.posse ? C.posse : C.people; c.strokeStyle = '#000'; c.lineWidth = 1 * dpr;
      c.beginPath(); c.arc(v.pos.x * sc, v.pos.z * sc, 3 * dpr, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // lots for sale, your houses, a blueprint
    for (const m of T.houses.mapMarks()) {
      const X = m.x * sc, Z = m.z * sc, r = 4.5 * dpr / zoom;
      c.lineWidth = 1.5 * dpr / zoom; c.strokeStyle = '#000';
      c.fillStyle = m.kind === 'home' ? '#f0e090' : m.kind === 'lot' ? '#a0dc78' : m.kind === 'blueprint' ? '#8ad0ff' : '#c8b080';
      c.fillRect(X - r, Z - r, r * 2, r * 2); c.strokeRect(X - r, Z - r, r * 2, r * 2);
      if (m.kind !== 'lot') label(t('tmap.' + m.kind), X, Z - r - 4 * dpr / zoom, 10);
    }
    // your traps (gold: something is caught) and the wanted men's cabins
    for (const m of T.trades.mapMarks()) {
      const X = m.x * sc, Z = m.z * sc, r = (m.kind === 'wanted' ? 6 : 4) * dpr / zoom;
      c.lineWidth = 1.5 * dpr / zoom; c.strokeStyle = '#000';
      if (m.kind === 'wanted') { c.fillStyle = '#b8402e'; c.fillRect(X - r, Z - r, r * 2, r * 2); c.strokeRect(X - r, Z - r, r * 2, r * 2); label('✕ ' + m.name, X, Z - r - 4 * dpr / zoom, 10); }
      else { c.fillStyle = m.kind === 'catch' ? '#ffd040' : '#9a9aa2'; c.beginPath(); c.arc(X, Z, r, 0, Math.PI * 2); c.fill(); c.stroke(); }
    }
    // whoever pays for your job: a gold ring
    const jt = T.jobTarget();
    if (jt) { c.strokeStyle = '#ffd060'; c.lineWidth = 3 * dpr / zoom; c.beginPath(); c.arc(jt.pos.x * sc, jt.pos.z * sc, 9 * dpr / zoom, 0, Math.PI * 2); c.stroke(); label(jt.name, jt.pos.x * sc, jt.pos.z * sc - 12 * dpr / zoom, 10); }
    const p = g.player;
    c.save(); c.translate(p.pos.x * sc, p.pos.z * sc); c.rotate(-p.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5 * dpr; const r = 8 * dpr;
    c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.7, r * 0.7); c.lineTo(0, r * 0.3); c.lineTo(-r * 0.7, r * 0.7); c.closePath(); c.fill(); c.stroke(); c.restore();
  };

  // ---- looting a body or someone who gave up -----------------------------------
  P.r_loot = function ({ v }) {
    const g = this.app.game, T = g.town;
    const list = T.lootList(v);
    const name = (it) => it.id === 'coins' ? t('loot.coins', { n: it.n }) : it.id === 'horse' ? t('loot.horse') : t('item.' + it.id);
    const rows = list.map((it, k) => `<div class="shop-row"><img src="${itemIcon(it.id)}" alt=""><span>${esc(name(it))}${it.n > 1 && it.id !== 'coins' ? ' ×' + it.n : ''}</span><b></b>
      <button class="btn small primary" data-k="${k}">${t('loot.take')}</button></div>`).join('') || `<p class="muted">${t('loot.empty')}</p>`;
    const panel = this.panel(t('loot.title', { name: v.name }), `<div class="shop">${rows}</div>${list.length > 1 ? `<div class="row end"><button class="btn primary" id="lall">${t('loot.all')}</button></div>` : ''}`, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { T.takeLoot(v, list[+b.dataset.k]); this.show('loot', { v }); });
    const all = panel.querySelector('#lall');
    if (all) all.onclick = () => { for (const it of T.lootList(v)) T.takeLoot(v, it); this.app.closePanel(); };
  };

  // ---- an invitation home -----------------------------------------------------------
  P.r_invite = function ({ v }) {
    const T = this.app.game.town;
    const body = `<div class="who"><b>${esc(v.name)}</b></div><p class="say">“${esc(t('guest.inviteLine'))}”</p>
      <p class="muted small">${t('guest.inviteNote')}</p>
      <div class="row end"><button class="btn ghost" id="ino">${t('guest.decline')}</button><button class="btn primary" id="iyes">${t('guest.accept')}</button></div>`;
    this.panel(t('guest.inviteTitle'), body, { back: false });
    this.root.querySelector('#iyes').onclick = () => { T.acceptInvite(v); this.app.closePanel(); };
    this.root.querySelector('#ino').onclick = () => { T.declineInvite(); this.app.closePanel(); };
  };
  // ---- a guest at someone's home: Eat, Chat, Leave, or rob them ----------------------
  P.r_guest = function ({ rob = false } = {}) {
    const T = this.app.game.town, G = T.guest;
    if (!G) { this.app.closePanel(); return; }
    const host = T.folk.list[G.host];
    const body = rob
      ? `<p>${t('guest.robWhat')}</p><div class="menu"><button class="btn" data-r="food">${t('guest.robFood')}</button><button class="btn" data-r="guns">${t('guest.robGuns')}</button>
         <button class="btn danger" data-r="all">${t('guest.robAll')}</button><button class="btn ghost" data-r="no">${t('menu.cancel')}</button></div><p class="muted small">${t('guest.robNote')}</p>`
      : `<div class="who"><b>${esc(host ? host.name : '')}</b></div><p class="say">“${esc(t('guest.offer'))}”</p>
         <div class="menu"><button class="btn primary" data-a="eat">${t('guest.eat')}</button><button class="btn" data-a="chat">${t('guest.chat')}</button>
         <button class="btn" data-a="leave">${t('guest.leave')}</button><button class="btn ghost danger" data-a="rob">${t('guest.rob')}</button></div>`;
    this.panel(t('guest.title'), body, { back: false });
    this.root.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'rob') { this.show('guest', { rob: true }); return; }
      T.guestAction(a); this.app.closePanel();
    });
    this.root.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { if (b.dataset.r !== 'no') T.guestAction('rob', b.dataset.r); this.app.closePanel(); });
  };
}
