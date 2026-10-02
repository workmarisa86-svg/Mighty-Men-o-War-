// Menus and panels: main menu, new game setup, load, settings, pause,
// inventory and field crafting.
import { t, setLang, getLang } from './i18n.js';
import { DIFFICULTIES } from './config.js';
import { listSaves, deleteSave } from './storage.js';
import { itemIcon, ITEMS, MATERIALS, RECIPES, RECIPE_CATS } from './items.js';
import { sfx } from './audio.js';
import { MANUAL, MANUAL_CATS } from './manual.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class UI {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('screen');
    this.current = null;
    this.root.addEventListener('click', (e) => {
      const b = e.target.closest('button, .choice');
      if (b && !b.disabled) sfx.click();
    });
  }

  show(name, params = {}) {
    this.current = { name, params };
    this.root.hidden = false;
    this.root.className = 'screen ' + name;
    this.root.innerHTML = '';
    this['r_' + name](params);
  }
  hide() { this.root.hidden = true; this.root.innerHTML = ''; this.current = null; }
  rerender() { if (this.current) this.show(this.current.name, this.current.params); }

  panel(title, body, opts = {}) {
    this.root.innerHTML = `<div class="panel ${opts.wide ? 'wide' : ''}">
      <h2>${esc(title)}</h2><div class="body">${body}</div>
      ${opts.back !== false ? `<div class="row end"><button class="btn ghost" data-act="back">${t('menu.back')}</button></div>` : ''}
    </div>`;
    const back = this.root.querySelector('[data-act=back]');
    if (back) back.onclick = opts.onBack || (() => this.show('main'));
    return this.root.querySelector('.panel');
  }

  langSwitch() {
    return `<div class="lang"><button data-lang="en" class="${getLang() === 'en' ? 'on' : ''}">English</button><button data-lang="es" class="${getLang() === 'es' ? 'on' : ''}">Español</button></div>`;
  }
  bindLang(el) {
    el.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => {
      this.app.settings.lang = b.dataset.lang; setLang(b.dataset.lang); this.app.applySettings(); this.rerender();
    });
  }

  // ------------------------------------------------------------------ main
  r_main() {
    const hasSaves = listSaves().length > 0;
    this.root.innerHTML = `<div class="title-wrap">
      <img src="icons/logo.svg" class="logo" alt="">
      <h1 class="game-title">MIGHTY MEN <span>O'</span> WAR</h1>
      <p class="tagline">${t('app.tagline')}</p>
      <div class="menu">
        <button class="btn" data-go="newgame">${t('menu.new')}</button>
        <button class="btn" data-go="load" ${hasSaves ? '' : 'disabled'}>${t('menu.load')}</button>
        <button class="btn" data-go="settings">${t('menu.settings')}</button>
        <button class="btn" data-go="manual">${t('menu.manual')}</button>
        <button class="btn" data-go="soon" data-what="menu.stats">${t('menu.stats')}</button>
      </div>
      ${this.langSwitch()}
      <p class="ver">v${this.app.version}</p>
    </div>`;
    this.root.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => this.show(b.dataset.go, { what: b.dataset.what, from: 'main' }));
    this.bindLang(this.root);
  }

  // Manual: search, sort A-Z / Z-A, filter by category, open/close entries.
  r_manual({ from, q = '', sort = 'cat', cat = 'all', open = [] }) {
    const L = getLang();
    const cats = Object.keys(MANUAL_CATS);
    const body = `<div class="man-tools">
        <input id="mq" type="search" placeholder="${t('man.search')}" value="${esc(q)}">
        <div class="seg" id="msort">${[['cat', t('man.byCat')], ['az', 'A–Z'], ['za', 'Z–A']].map(([v, l]) => `<button data-v="${v}" class="${sort === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>
      <div class="man-cats">${[['all', t('man.all')], ...cats.map((c) => [c, MANUAL_CATS[c][L] || MANUAL_CATS[c].en])].map(([v, l]) => `<button data-c="${v}" class="${cat === v ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
      <div class="man-list" id="mlist"></div>
      <div class="row"><button class="btn ghost small" id="mexp">${t('man.expand')}</button><button class="btn ghost small" id="mcol">${t('man.collapse')}</button></div>`;
    const panel = this.panel(t('menu.manual'), body, { wide: true, onBack: () => this.show(from === 'pause' ? 'pause' : 'main') });
    panel.classList.add('manual');
    const state = { q, sort, cat, open: new Set(open) };
    const list = panel.querySelector('#mlist');
    const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const draw = () => {
      const words = norm(state.q).split(/\s+/).filter(Boolean);
      let items = MANUAL.filter((m) => state.cat === 'all' || m.cat === state.cat).map((m) => ({ m, x: m[L] || m.en }))
        .filter(({ x }) => words.every((w) => norm(x.title + ' ' + x.text).includes(w)));
      if (state.sort === 'cat') items.sort((a, b) => cats.indexOf(a.m.cat) - cats.indexOf(b.m.cat));
      else items.sort((a, b) => a.x.title.localeCompare(b.x.title, L) * (state.sort === 'za' ? -1 : 1));
      let html = '', lastCat = null;
      for (const { m, x } of items) {
        if (state.sort === 'cat' && m.cat !== lastCat) { lastCat = m.cat; html += `<h4>${esc(MANUAL_CATS[m.cat][L] || MANUAL_CATS[m.cat].en)}</h4>`; }
        const on = state.open.has(m.id) || words.length > 0;
        html += `<div class="man-item${on ? ' open' : ''}" data-id="${m.id}"><button class="man-h"><span>${esc(x.title)}</span><i>${on ? '−' : '+'}</i></button>` +
          `<p>${esc(x.text)}</p></div>`;
      }
      list.innerHTML = html || `<p class="muted">${t('man.none')}</p>`;
      list.querySelectorAll('.man-h').forEach((b) => b.onclick = () => {
        const id = b.parentElement.dataset.id;
        if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
        b.parentElement.classList.toggle('open'); b.querySelector('i').textContent = b.parentElement.classList.contains('open') ? '−' : '+';
      });
    };
    panel.querySelector('#mq').oninput = (e) => { state.q = e.target.value; draw(); };
    panel.querySelectorAll('#msort button').forEach((b) => b.onclick = () => { state.sort = b.dataset.v; panel.querySelectorAll('#msort button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    panel.querySelectorAll('.man-cats button').forEach((b) => b.onclick = () => { state.cat = b.dataset.c; panel.querySelectorAll('.man-cats button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
    panel.querySelector('#mexp').onclick = () => { MANUAL.forEach((m) => state.open.add(m.id)); draw(); };
    panel.querySelector('#mcol').onclick = () => { state.open.clear(); draw(); };
    // remember the view if the language changes
    this.current.params = { from, get q() { return state.q; }, get sort() { return state.sort; }, get cat() { return state.cat; }, get open() { return [...state.open]; } };
    draw();
  }

  r_soon({ what, from }) {
    this.panel(t(what), `<p class="muted">${t('menu.soon')}</p>`, { onBack: () => this.show(from || 'main') });
  }

  // -------------------------------------------------------------- new game
  r_newgame(p) {
    const st = Object.assign({ step: 'mode', mode: null, sub: null, difficulty: 'medium', timeMode: 'cycle' }, p);
    const go = (patch) => this.show('newgame', Object.assign({}, st, patch));
    let body = '';
    if (st.step === 'mode') {
      body = `<p class="label">${t('new.mode')}</p><div class="choices">
        <div class="choice" data-v="war"><h3>${t('new.war')}</h3><p>${t('new.warDesc')}</p></div>
        <div class="choice" data-v="peace"><h3>${t('new.peace')}</h3><p>${t('new.peaceDesc')}</p></div></div>`;
    } else if (st.step === 'sub') {
      body = `<p class="label">${t('new.how')}</p><div class="choices">
        <div class="choice" data-v="alone"><h3>${t('new.alone')}</h3><p>${t('new.aloneDesc')}</p></div>
        <div class="choice" data-v="allies"><h3>${t('new.allies')}</h3><p>${t('new.alliesDesc')}</p></div></div>`;
    } else {
      const n = listSaves().length + 1;
      body = (st.mode === 'war' ? `<p class="label">${t('new.diff')}</p><div class="diffs">${DIFFICULTIES.map((d, i) => `
        <div class="choice small ${st.difficulty === d ? 'on' : ''}" data-d="${d}">
          <h3>${'▮'.repeat(i + 1)}<span class="dim">${'▮'.repeat(4 - i)}</span> ${t('diff.' + d)}</h3><p>${t('diff.' + d + 'Desc')}</p></div>`).join('')}</div>
        <p class="label">${t('new.time')}</p><div class="choices">${['cycle', 'day'].map((m) => `
        <div class="choice small ${st.timeMode === m ? 'on' : ''}" data-tm="${m}"><h3>${t('new.time.' + m)}</h3><p>${t('new.time.' + m + 'Desc')}</p></div>`).join('')}</div>` : '') +
        `<p class="label">${t('new.name')}</p><input id="wname" maxlength="32" value="${esc(t('new.defaultName', { n }))}">
        <div class="row end"><button class="btn primary" id="startbtn">${t('menu.start')}</button></div>`;
    }
    const back = () => {
      if (st.step === 'mode') this.show('main');
      else if (st.step === 'sub') go({ step: 'mode' });
      else go({ step: st.mode === 'war' ? 'sub' : 'mode' });
    };
    const panel = this.panel(t('new.title'), body, { onBack: back, wide: true });
    panel.querySelectorAll('.choice[data-v]').forEach((c) => c.onclick = () => {
      const v = c.dataset.v;
      if (st.step === 'mode') go(v === 'war' ? { step: 'sub', mode: 'war' } : { step: 'final', mode: 'peace', sub: null });
      else go({ step: 'final', sub: v });
    });
    panel.querySelectorAll('.choice[data-tm]').forEach((c) => c.onclick = () => {
      st.timeMode = c.dataset.tm;
      panel.querySelectorAll('.choice[data-tm]').forEach((x) => x.classList.toggle('on', x === c));
    });
    panel.querySelectorAll('.choice[data-d]').forEach((c) => c.onclick = () => {
      st.difficulty = c.dataset.d;
      panel.querySelectorAll('.choice[data-d]').forEach((x) => x.classList.toggle('on', x === c));
    });
    const sb = panel.querySelector('#startbtn');
    if (sb) sb.onclick = () => {
      const name = panel.querySelector('#wname').value.trim() || t('new.defaultName', { n: 1 });
      this.app.newGame({ mode: st.mode, sub: st.mode === 'war' ? st.sub : null, difficulty: st.mode === 'war' ? st.difficulty : null, timeMode: st.mode === 'war' ? st.timeMode : 'day', name });
    };
  }

  // ------------------------------------------------------------------ load
  r_load() {
    const saves = listSaves();
    const modeLabel = (m) => m.mode === 'peace' ? t('mode.peace') : `${t('mode.war')} · ${t('sub.' + m.sub)} · ${t('diff.' + m.difficulty)} · ${t('new.time.' + (m.timeMode || 'cycle'))}`;
    const body = saves.length ? `<div class="saves">${saves.map((m) => `
      <div class="save">
        <div><h3>${esc(m.name)}</h3><p>${modeLabel(m)} · ${t('load.day', { n: m.day })}</p>
        <p class="muted">${new Date(m.updated).toLocaleString(getLang())}</p></div>
        <div class="row"><button class="btn primary" data-play="${m.id}">${t('menu.play')}</button>
        <button class="btn ghost danger" data-del="${m.id}">${t('menu.delete')}</button></div>
      </div>`).join('')}</div>` : `<p class="muted">${t('load.empty')}</p>`;
    const panel = this.panel(t('load.title'), body, { wide: true });
    panel.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => this.app.loadGame(b.dataset.play));
    panel.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => {
      const m = saves.find((s) => s.id === b.dataset.del);
      this.confirm(t('load.confirmDelete', { name: m.name }), () => { deleteSave(m.id); this.show(listSaves().length ? 'load' : 'main'); }, () => this.show('load'));
    });
  }

  confirm(msg, yes, no) {
    this.current = { name: 'confirm', params: {} };
    this.root.hidden = false;
    this.root.className = 'screen confirm';
    this.root.innerHTML = `<div class="panel"><p>${esc(msg)}</p><div class="row end">
      <button class="btn ghost" id="cno">${t('menu.cancel')}</button><button class="btn danger" id="cyes">${t('menu.confirm')}</button></div></div>`;
    this.root.querySelector('#cyes').onclick = yes;
    this.root.querySelector('#cno').onclick = no;
  }

  // -------------------------------------------------------------- settings
  r_settings({ from }) {
    const s = this.app.settings;
    const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, label]) =>
      `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
    const body = `
      <div class="field"><span>${t('set.lang')}</span>${seg('lang', [['en', 'English'], ['es', 'Español']])}</div>
      <div class="field"><span>${t('set.quality')}</span>${seg('quality', [['low', t('set.low')], ['medium', t('set.medium')], ['high', t('set.high')]])}</div>
      <p class="muted small">${t('set.qualityNote')}</p>
      <div class="field"><span>${t('set.render')} <b id="rdv">${s.renderDist}</b></span><input type="range" min="3" max="12" step="1" value="${s.renderDist}" data-range="renderDist"></div>
      <div class="field"><span>${t('set.volume')} <b id="volv">${Math.round(s.volume * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume"></div>
      <div class="field"><span>${t('set.sens')} <b id="sensv">${s.sensitivity.toFixed(2)}</b></span><input type="range" min="0.2" max="3" step="0.05" value="${s.sensitivity}" data-range="sensitivity"></div>
      <div class="field"><span>${t('set.invert')}</span>${seg('invertY', [[false, t('set.off')], [true, t('set.on')]])}</div>
      <div class="field"><span>${t('set.blood')}</span>${seg('blood', [[true, t('set.on')], [false, t('set.off')]])}</div>
      <div class="field"><span>${t('set.minimap')}</span>${seg('minimap', [[true, t('set.on')], [false, t('set.off')]])}</div>
      <div class="field"><span>${t('set.minimapSize')}</span>${seg('minimapSize', [['s', t('set.small')], ['m', t('set.mid')], ['l', t('set.large')]])}</div>
      <div class="field"><span>${t('set.formation')}</span>${seg('formation', [['loose', t('form.loose')], ['line', t('form.line')], ['column', t('form.column')]])}</div>`;
    const panel = this.panel(t('set.title'), body, { onBack: () => from === 'pause' ? this.show('pause') : this.show('main') });
    panel.querySelectorAll('.seg').forEach((sg) => sg.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const key = sg.dataset.key;
      let v = b.dataset.v;
      if (v === 'true') v = true; else if (v === 'false') v = false;
      s[key] = v;
      if (key === 'lang') setLang(v);
      this.app.applySettings();
      this.rerender();
    }));
    panel.querySelectorAll('[data-range]').forEach((r) => r.oninput = () => {
      const key = r.dataset.range;
      s[key] = key === 'renderDist' ? parseInt(r.value, 10) : parseFloat(r.value);
      panel.querySelector('#rdv').textContent = s.renderDist;
      panel.querySelector('#volv').textContent = Math.round(s.volume * 100) + '%';
      panel.querySelector('#sensv').textContent = s.sensitivity.toFixed(2);
      this.app.applySettings();
    });
  }

  // ----------------------------------------------------------------- pause
  r_pause() {
    this.root.innerHTML = `<div class="panel narrow"><h2>${t('menu.paused')}</h2><div class="menu">
      <button class="btn primary" id="presume">${t('menu.resume')}</button>
      <button class="btn" id="psave">${t('menu.save')}</button>
      <button class="btn" id="pset">${t('menu.settings')}</button>
      <button class="btn" id="pman">${t('menu.manual')}</button>
      <button class="btn ghost" id="pquit">${t('menu.quit')}</button></div>
      <p class="muted small keys">${this.app.input.touch ? '' : t('help.keys')}</p></div>`;
    const $ = (s) => this.root.querySelector(s);
    $('#presume').onclick = () => this.app.resume();
    $('#psave').onclick = () => this.app.saveGame(false);
    $('#pset').onclick = () => this.show('settings', { from: 'pause' });
    $('#pman').onclick = () => this.show('manual', { from: 'pause' });
    $('#pquit').onclick = () => this.app.quitToMenu();
  }

  // ------------------------------------------------------------- inventory
  r_inventory() {
    const g = this.app.game;
    const sel = this.invPick;
    const owned = Object.keys(ITEMS).filter((id) => {
      const d = ITEMS[id];
      if (d.gear || d.armor) return false;
      return d.tool || g.count(id) > 0 || MATERIALS.includes(id);
    });
    const gear = (g.peace ? [] : ['flashlight', 'compass', 'binoculars']).concat(['helmet', 'vest'].filter((id) => g.has(id)));
    const cell = (id, cls = '') => {
      const d = ITEMS[id];
      const c = g.count(id);
      const showCount = !d.tool && !d.gear && !(d.armor) && !(d.weapon && c <= 1);
      const worn = d.armor ? ` <em>${t('inv.worn')}</em>` : '';
      return `<div class="cell ${cls} ${sel === id ? 'picked' : ''}" data-item="${id}" title="${t('item.' + id)}">
        <img src="${itemIcon(id)}" alt=""><b>${showCount ? (c === Infinity ? '∞' : c) : ''}</b><span>${t('item.' + id)}${worn}</span></div>`;
    };
    const body = `<p class="muted small">${t('inv.hint')}</p>
      <p class="label">${t('inv.materials')}</p><div class="grid">${owned.map((id) => cell(id)).join('')}</div>
      ${gear.length ? `<p class="label">${t('inv.gear')}</p><div class="grid">${gear.map((id) => cell(id, 'gear')).join('')}</div>` : ''}
      <p class="label">1–9</p><div class="grid hb">${g.inv.hotbar.map((id, i) => `<div class="cell slot ${i === g.inv.sel ? 'sel' : ''}" data-slot="${i}"><i>${i + 1}</i>${id ? `<img src="${itemIcon(id)}" alt="">` : ''}</div>`).join('')}</div>`;
    const panel = this.panel(t('inv.title'), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-item]').forEach((c) => c.onclick = () => {
      if (c.classList.contains('gear')) return;
      this.invPick = this.invPick === c.dataset.item ? null : c.dataset.item; this.rerender();
    });
    panel.querySelectorAll('[data-slot]').forEach((c) => c.onclick = () => {
      const i = +c.dataset.slot;
      if (this.invPick) {
        const prev = g.inv.hotbar.indexOf(this.invPick);
        if (prev >= 0) g.inv.hotbar[prev] = g.inv.hotbar[i];
        g.inv.hotbar[i] = this.invPick; this.invPick = null;
      } else g.inv.sel = i;
      g.hud.dirtyHotbar = true; this.rerender();
    });
  }

  // ----------------------------------------------------------------- craft
  r_craft() {
    const g = this.app.game;
    const fire = g.craftFire();
    const need = (r) => Object.entries(r.needs).map(([id, n]) => {
      const ok = g.has(id, n);
      const have = g.count(id) === Infinity ? '∞' : g.count(id);
      return `<span class="need ${ok ? 'ok' : 'miss'}"><img src="${itemIcon(id)}" alt="">${n} ${t('item.' + id)} <small>(${have})</small></span>`;
    }).join('');
    const banner = fire ? '' : `<div class="banner">🔥 ${t('craft.needFire')}</div>`;
    const busy = g.craft ? `<div class="banner ok">${t('hud.crafting', { item: t('item.' + g.craft.r.id), s: Math.max(0, g.craft.total - g.craft.t).toFixed(1) })}</div>` : '';
    let body = banner + busy + `<p class="muted small">${t('craft.exposed')}</p>`;
    for (const cat of RECIPE_CATS) {
      body += `<p class="label">${t('craft.cat.' + cat)}</p><div class="recipes">`;
      for (const r of RECIPES.filter((x) => x.cat === cat)) {
        let state, label;
        if (r.later) { state = 'locked'; label = '🔒 ' + t('craft.later'); }
        else if (!g.hasMaterials(r)) { state = 'locked'; label = '🔒 ' + t('craft.locked'); }
        else if (!fire) { state = 'locked'; label = '🔒 ' + t('craft.noFire'); }
        else { state = ''; label = t(r.cook ? 'craft.cook' : 'craft.make'); }
        const out = r.out ? ` ×${r.out}` : '';
        body += `<div class="recipe ${state}"><img src="${itemIcon(r.id)}" alt="" class="ri">
          <div class="rinfo"><h3>${t('item.' + r.id)}${out}</h3><div>${need(r)}</div>
          <p class="muted small">⏱ ${t('craft.time', { s: r.time })}${t('craftDesc.' + r.id) !== 'craftDesc.' + r.id ? ' · ' + t('craftDesc.' + r.id) : ''}</p></div>
          <button class="btn ${state ? '' : 'primary'}" data-r="${r.id}" ${state || g.craft ? 'disabled' : ''}>${label}</button></div>`;
      }
      body += '</div>';
    }
    const panel = this.panel(t(fire && !g.peace ? 'craft.titleFire' : 'craft.title'), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => {
      const r = RECIPES.find((x) => x.id === b.dataset.r);
      if (g.startCraft(r)) this.app.closePanel();
    });
  }

  // Orders for one allied soldier (aimed at), or for the whole squad.
  r_orders({ soldier }) {
    const g = this.app.game, E = g.enemies;
    const n = E.followers().length;
    let body, acts;
    if (soldier && soldier.alive) {
      const role = t('role.' + soldier.role);
      body = `<div class="who"><b>${esc(soldier.name)}</b><span class="muted small">${t('type.' + soldier.type)} · ${role} · ${t('order.weapon')}: ${soldier.weapon ? t('item.' + soldier.weapon) : '—'}</span></div>`;
      acts = [['follow', 'order.follow'], ['hold', 'order.hold'], ['defend', 'order.defend'], ['iron', 'order.iron'],
        ['knife', 'order.knife'], ['rifle', 'order.rifle'], ['grenade', 'order.grenades']];
    } else {
      body = `<p class="muted">${t('order.squadInfo', { n })}</p>`;
      acts = [['all-follow', 'order.allFollow'], ['all-hold', 'order.allHold'], ['all-defend', 'order.allDefend']];
    }
    body += `<div class="menu">${acts.map(([a, k], i) => `<button class="btn" data-a="${a}"><kbd>${i + 1}</kbd>${t(k)}</button>`).join('')}</div>
      <p class="muted small">${t('order.hint')}</p>`;
    const panel = this.panel(t(soldier ? 'order.title' : 'order.squad'), body, { onBack: () => this.app.closePanel() });
    this.root.classList.add('orders');
    const run = (a) => {
      if (a === 'follow' || a === 'hold' || a === 'defend') E.order(soldier, a);
      else if (a === 'iron') E.askIron(soldier);
      else if (['knife', 'rifle', 'grenade'].includes(a)) E.askItem(soldier, a);
      else { const k = E.orderAll(a.slice(4)); if (!k) g.hud.toast(t('order.nobody')); }
      this.app.closePanel();
    };
    panel.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => run(b.dataset.a));
    this.orderKeys = (code) => { const m = /^Digit(\d)$/.exec(code); if (m && acts[+m[1] - 1]) run(acts[+m[1] - 1][0]); };
  }

  r_gameover({ days }) {
    this.root.innerHTML = `<div class="panel narrow center"><h2>${t('over.title')}</h2>
      <p>${t('over.starved')}</p><p class="big">${t('over.days', { n: days })}</p>
      <div class="menu"><button class="btn primary" id="gonew">${t('menu.new')}</button>
      <button class="btn ghost" id="gomenu">${t('over.menu')}</button></div></div>`;
    this.root.querySelector('#gonew').onclick = () => this.show('newgame');
    this.root.querySelector('#gomenu').onclick = () => this.show('main');
  }

  r_loading() {
    this.root.innerHTML = `<div class="title-wrap"><img src="icons/logo.svg" class="logo small" alt="">
      <p class="tagline">${t('hud.loading')}</p><div class="loadbar"><div class="fill"></div></div></div>`;
  }
  setLoading(f) { const el = this.root.querySelector('.loadbar .fill'); if (el) el.style.width = Math.round(f * 100) + '%'; }

  r_clickToPlay() {
    this.root.innerHTML = `<div class="deploy"><button class="btn primary big" id="deploy">${t('menu.clickToPlay')}</button></div>`;
    this.root.querySelector('#deploy').onclick = () => this.app.resume();
  }
}

export { esc };
