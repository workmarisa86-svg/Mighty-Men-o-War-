// Town Life screens: its own menu (one persistent world: Continue / Start
// over), shops, jobs, the posse's questions, the sheriff and jail.
import { t } from './i18n.js';
import { itemIcon } from './items.js';
import { hasTown } from './storage.js';
import { M } from './modes.js';      // (Town Life's code is loaded once a town game starts)

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
    const g = this.app.game, T = g.town;
    const body = `<div class="who"><b>${esc(v.name)}</b><span class="muted small">${t('law.sheriff')}</span></div>
      <p class="say">“${esc(T.bounty ? t('law.sheriffWanted', { n: T.bounty }) : t('law.sheriffClean'))}”</p>
      <div class="menu">
        ${T.bounty ? `<button class="btn primary" id="spay" ${T.money >= T.bounty ? '' : 'disabled'}>${t('law.pay', { n: T.bounty })}</button>
        <button class="btn" id="sturn">${t('law.turnIn')}</button>` : ''}
        <button class="btn" id="sjob">${t('ctx.job')}</button>
      </div><p class="muted small">${t('law.clearWays')}</p>`;
    this.panel(t('law.sheriffTitle'), body, { onBack: () => this.app.closePanel() });
    const $ = (s) => this.root.querySelector(s);
    if ($('#spay')) $('#spay').onclick = () => { T.money -= T.bounty; T.bounty = 0; T.addHonor(2); T.disband('law.cleared'); this.app.closePanel(); };
    if ($('#sturn')) $('#sturn').onclick = () => { this.app.closePanel(); T.jail(); };
    $('#sjob').onclick = () => { this.app.closePanel(); T.askJob(v); };
  };

  // ---- after jail ---------------------------------------------------------------
  P.r_jailed = function ({ lost = [] }) {
    const touch = this.app.input.touch;
    const body = `<p>${t('jail.text')}</p>
      <ul class="steps"><li>${t('jail.noFine')}</li>${lost.length ? `<li>${t('law.jailLost', { list: lost.join(', ') })}</li>` : ''}<li>${t(touch ? 'jail.howSleepTouch' : 'jail.howSleep')}</li><li>${t(touch ? 'jail.howPickTouch' : 'jail.howPick')}</li></ul>`;
    this.panel(t('law.jailTitle'), body, { onBack: () => this.app.closePanel() });
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
      <div class="legend">${sw(C.shop, 'tmap.shops')}${sw(C.law, 'tmap.law')}${sw(C.home, 'tmap.homes')}${sw(C.cottage, 'tmap.cottage')}${sw(C.people, 'tmap.people')}${T.posse ? sw(C.posse, 'tmap.posse') : ''}<span><i class="you"></i>${t('map.you')}</span></div>`;
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
    const ICON = { general: '🛒', butcher: '🥩', hunting: '🎯', market: '🧺', hall: '⭐', jail: '🔒', stable: '🐎', house: '🏠' };
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
