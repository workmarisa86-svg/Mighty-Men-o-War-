// Menus and panels: main menu, new game setup, load, settings, pause,
// inventory and field crafting.
import { t, setLang, getLang } from './i18n.js';
import { DIFFICULTIES, SAVE_FORMAT, SEA } from './config.js';
import { listSaves, deleteSave, deleteAllSaves } from './storage.js';
import { itemIcon, ITEMS, MATERIALS, RECIPES, RECIPE_CATS } from './items.js';
import { sfx } from './audio.js';
import { MANUAL, MANUAL_CATS, MANUAL_DEVICE } from './manual.js';
import { getDevice } from './i18n.js';
import { missionsFor, missionInfo } from './missions.js';
import { loadStats, resetStats, bestMedal } from './stats.js';
import { OWNER_COLORS } from './minimap.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Pre-rendered title art (img/, made by tools/render-art.mjs from art/*.svg).
export function heroArt() {
  return `<picture class="art"><source type="image/webp" sizes="(min-aspect-ratio: 155/100) 161vh, 100vw"
    srcset="img/mightyman-hero-640.webp 640w, img/mightyman-hero-1280.webp 1280w, img/mightyman-hero-1920.webp 1920w">
    <img src="img/mightyman-hero-1280.jpg" width="1280" height="796" alt="Mighty Man o' War — No one left behind" decoding="async"></picture>`;
}

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
    // the static splash (index.html) gives way to the first real screen
    const sp = document.getElementById('splash');
    if (sp) requestAnimationFrame(() => sp.remove());
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
    this.root.classList.add('art-screen');
    this.root.innerHTML = `${heroArt()}
      <h1 class="sr-only">Mighty Man o' War</h1>
      <div class="menu-zone">
      <div class="menu">
        <button class="btn" data-go="newgame">${t('menu.new')}</button>
        <button class="btn" data-go="load" ${hasSaves ? '' : 'disabled'}>${t('menu.load')}</button>
        <button class="btn" data-go="settings">${t('menu.settings')}</button>
        <button class="btn" data-go="manual">${t('menu.manual')}</button>
        <button class="btn" data-go="stats">${t('menu.stats')}</button>
      </div>
      <div class="extras">${this.langSwitch()}
      <button class="installbtn" id="installbtn" hidden>${t('menu.install')}</button>
      <button class="speaker ${this.app.settings.musicMute ? 'off' : ''}" id="spk" title="${t('set.musicMute')}" aria-label="${t('set.musicMute')}"><svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path class="w" d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2"/><path class="x" d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2"/></svg></button></div>
      </div>
      <p class="ver">v${this.app.version}</p>`;
    this.app.bindInstall(this.root.querySelector('#installbtn'));
    this.root.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => this.show(b.dataset.go, { what: b.dataset.what, from: 'main' }));
    this.bindLang(this.root);
    const spk = this.root.querySelector('#spk');
    if (spk) spk.onclick = () => { const s = this.app.settings; s.musicMute = !s.musicMute; this.app.applySettings(); spk.classList.toggle('off', s.musicMute); };
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
      const dev = MANUAL_DEVICE[getDevice()] || {};
      let items = MANUAL.filter((m) => state.cat === 'all' || m.cat === state.cat).map((m) => {
        const base = m[L] || m.en, o = dev[m.id];
        return { m, x: o ? { title: base.title, text: o[L] || o.en } : base };
      })
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

  r_installHelp() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.panel(t('menu.install'), `<ol class="steps">${(ios ? ['install.ios1', 'install.ios2', 'install.ios3'] : ['install.mac1', 'install.mac2']).map((k) => `<li>${t(k)}</li>`).join('')}</ol>`, { onBack: () => this.show('main') });
  }

  r_soon({ what, from }) {
    this.panel(t(what), `<p class="muted">${t('menu.soon')}</p>`, { onBack: () => this.show(from || 'main') });
  }

  // -------------------------------------------------------------- new game
  r_newgame(p) {
    const st = Object.assign({ step: 'mode', mode: null, sub: null, difficulty: 'medium', timeMode: 'cycle', gameType: 'open', mission: null }, p);
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
        `<p class="label">${t('new.type')}</p><div class="choices">${['open', 'mission'].map((m) => `
        <div class="choice small ${st.gameType === m ? 'on' : ''}" data-gt="${m}"><h3>${t('new.type.' + m)}</h3><p>${t('new.type.' + m + 'Desc')}</p></div>`).join('')}</div>` +
        (st.gameType === 'mission' ? this.missionList(st) : '') +
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
      if (st.gameType === 'mission') { go({ difficulty: st.difficulty, timeMode: st.timeMode, mission: null }); return; }
      panel.querySelectorAll('.choice[data-d]').forEach((x) => x.classList.toggle('on', x === c));
    });
    panel.querySelectorAll('.choice[data-gt]').forEach((c) => c.onclick = () => go({ gameType: c.dataset.gt, difficulty: st.difficulty, timeMode: st.timeMode }));
    panel.querySelectorAll('.mission[data-m]').forEach((c) => c.onclick = () => {
      st.mission = c.dataset.m;
      panel.querySelectorAll('.mission[data-m]').forEach((x) => x.classList.toggle('on', x === c));
    });
    const sb = panel.querySelector('#startbtn');
    if (sb) sb.onclick = () => {
      const name = panel.querySelector('#wname').value.trim() || t('new.defaultName', { n: 1 });
      if (st.gameType === 'mission' && !st.mission) { const el = panel.querySelector('.missions'); if (el) el.classList.add('need'); sfx.error && sfx.error(); return; }
      this.app.newGame({ mode: st.mode, sub: st.mode === 'war' ? st.sub : null, difficulty: st.mode === 'war' ? st.difficulty : null, timeMode: st.mode === 'war' ? st.timeMode : 'day', name,
        gameType: st.gameType, mission: st.gameType === 'mission' ? st.mission : null });
    };
  }

  // ------------------------------------------------------------------ load
  r_load() {
    const saves = listSaves();
    const modeLabel = (m) => (m.mode === 'peace' ? t('mode.peace') : `${t('mode.war')} · ${t('sub.' + m.sub)} · ${t('diff.' + m.difficulty)} · ${t('new.time.' + (m.timeMode || 'cycle'))}`) +
      ' · ' + (m.gameType === 'mission' && m.mission ? `${t('new.type.mission')}: ${t('ms.' + m.mission + '.name')}${m.missionDone ? (m.missionDone.ok ? ' ✓' : ' ✗') : ''}` : t('new.type.open'));
    const body = saves.length ? `<div class="saves">${saves.map((m) => `
      <div class="save">
        <div><h3>${esc(m.name)}</h3><p>${modeLabel(m)} · ${t('load.day', { n: m.day })}</p>
        <p class="muted">${new Date(m.updated).toLocaleString(getLang())}${(m.v || 1) < SAVE_FORMAT ? ` · <b class="warn">${t('load.outdated')}</b>` : ''}</p></div>
        <div class="row"><button class="btn primary" data-play="${m.id}">${t('menu.play')}</button>
        <button class="btn ghost danger" data-del="${m.id}">${t('menu.delete')}</button></div>
      </div>`).join('')}</div>` : `<p class="muted">${t('load.empty')}</p>`;
    const panel = this.panel(t('load.title'), body + (saves.length ? `<div class="row"><button class="btn ghost danger" id="delall">${t('load.deleteAll')}</button></div>` : ''), { wide: true });
    const da = panel.querySelector('#delall');
    if (da) da.onclick = () => this.confirm(t('load.confirmDeleteAll', { n: saves.length }), () => { deleteAllSaves(); this.show('main'); }, () => this.show('load'));
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
      <div class="field"><span>${t('set.music')} <b id="musv">${Math.round(s.music * 100)}%</b></span><input type="range" min="0" max="1" step="0.05" value="${s.music}" data-range="music"></div>
      <div class="field"><span>${t('set.musicMute')}</span>${seg('musicMute', [[false, t('set.off')], [true, t('set.on')]])}</div>
      <div class="field"><span>${t('set.touchSize')}</span>${seg('touchSize', [['s', t('set.small')], ['m', t('set.mid')], ['l', t('set.large')]])}</div>
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
      panel.querySelector('#musv').textContent = Math.round(s.music * 100) + '%';
      this.app.applySettings();
    });
  }

  // ----------------------------------------------------------------- pause
  r_pause() {
    this.root.innerHTML = `<div class="panel narrow"><h2>${t('menu.paused')}</h2><div class="menu">
      <button class="btn primary" id="presume">${t('menu.resume')}</button>
      <button class="btn" id="psave">${t('menu.save')}</button>
      <button class="btn" id="pmap">${t('menu.map')}</button>
      <button class="btn" id="pset">${t('menu.settings')}</button>
      <button class="btn" id="pman">${t('menu.manual')}</button>
      <button class="btn ghost" id="pquit">${t('menu.quit')}</button></div>
      <p class="muted small keys">${t('help.keys')}</p></div>`;
    const $ = (s) => this.root.querySelector(s);
    $('#presume').onclick = () => this.app.resume();
    $('#psave').onclick = () => this.app.saveGame(false);
    $('#pmap').onclick = () => this.show('map', { from: 'pause' });
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

  // Cabin storage chest: choose what to carry and what to leave behind.
  r_chest() {
    const g = this.app.game, C = g.cabin;
    const ids = Object.keys(ITEMS).filter((id) => !ITEMS[id].tool && !ITEMS[id].gear && !ITEMS[id].armor);
    const carry = ids.filter((id) => (g.inv.counts[id] || 0) > 0), kept = ids.filter((id) => (C.chest.counts[id] || 0) > 0);
    const row = (id, n, act) => `<div class="chest-row"><img src="${itemIcon(id)}" alt=""><span>${t('item.' + id)}</span><b>${n}</b>
      <button class="btn small" data-a="${act}" data-id="${id}" data-n="1">${act === 'in' ? '→' : '←'}</button>${n > 1 ? `<button class="btn small" data-a="${act}" data-id="${id}" data-n="${n}">${act === 'in' ? '⇉' : '⇇'}</button>` : ''}</div>`;
    const body = `<p class="muted small">${t('chest.hint')}</p><div class="chest">
      <div><p class="label">${t('chest.carry')}</p>${carry.map((id) => row(id, g.inv.counts[id], 'in')).join('') || `<p class="muted">—</p>`}</div>
      <div><p class="label">${t('chest.stored')}</p>${kept.map((id) => row(id, C.chest.counts[id], 'out')).join('') || `<p class="muted">—</p>`}</div></div>`;
    const panel = this.panel(t('chest.title'), body, { wide: true, onBack: () => this.app.closePanel() });
    panel.querySelectorAll('[data-a]').forEach((b) => b.onclick = () => {
      if (b.dataset.a === 'in') C.store(b.dataset.id, +b.dataset.n); else C.takeOut(b.dataset.id, +b.dataset.n);
      this.rerender();
    });
  }

  missionList(st) {
    const list = missionsFor(st.mode, st.sub, st.difficulty);
    const mm = (s) => s >= 60 ? t('ms.minutes', { n: Math.round(s / 60) }) : t('ms.seconds', { n: s });
    return `<p class="label">${t('new.pickMission')}</p><div class="missions">${list.map((m) => {
      const I = missionInfo(m.id, st.sub, st.difficulty);
      const best = bestMedal(m.id, st.mode === 'war' ? st.difficulty : null);
      return `<div class="mission ${st.mission === m.id ? 'on' : ''}" data-m="${m.id}">
        <h3>${t('ms.' + m.id + '.name')}${best ? ` <i class="medal ${best}" title="${t('medal.' + best)}"></i>` : ''}</h3>
        <p>${t('ms.' + m.id + '.goal')}</p>
        <p class="small"><b>${t('ms.win')}:</b> ${t('ms.' + m.id + '.win')}</p>
        <p class="small"><b>${t('ms.lose')}:</b> ${t('ms.' + m.id + '.lose')}</p>
        <p class="small muted">${st.mode === 'war' ? t('diff.' + st.difficulty) + ' · ' : ''}${I.limit ? t('ms.limit', { t: mm(I.limit) }) : t('ms.noLimit')}</p></div>`;
    }).join('') || `<p class="muted">${t('ms.none')}</p>`}</div>`;
  }

  // end of a mission: medal, replay, another, or carry on in Open World
  r_missionEnd(r) {
    const g = this.app.game, id = g.mission ? g.mission.id : g.cfg.mission;
    const body = `<div class="center">
      ${r.ok ? `<div class="medal big ${r.medal}"></div><p class="big">${t('medal.' + r.medal)}</p>` : `<p class="big warn">${t('ms.failed')}</p><p>${t('ms.why.' + r.why)}</p>`}
      <p class="muted">${t('ms.' + id + '.name')}</p></div>
      <div class="menu">
        <button class="btn primary" id="mreplay">${t('ms.replay')}</button>
        <button class="btn" id="mother">${t('ms.another')}</button>
        <button class="btn" id="mopen">${t('ms.openWorld')}</button>
      </div>`;
    this.panel(r.ok ? t('ms.complete') : t('ms.failedTitle'), body, { back: false });
    const c = g.cfg;
    this.root.querySelector('#mreplay').onclick = () => this.app.replayMission();
    this.root.querySelector('#mother').onclick = () => { this.app.quitToMenu(true); this.show('newgame', { step: 'final', mode: c.mode, sub: c.sub, difficulty: c.difficulty || 'medium', timeMode: c.timeMode, gameType: 'mission' }); };
    this.root.querySelector('#mopen').onclick = () => this.app.continueOpenWorld();
  }

  // Statistics: totals, and War stats per difficulty
  r_stats() {
    const S = loadStats();
    const rows = [['days', (v) => v.toFixed(1)], ['fortsCaptured'], ['fortsLost'], ['enemies'], ['animals'], ['longestAlone', (v) => v.toFixed(1)], ['missions'], ['medals']];
    const val = (o, k, f) => k === 'medals' ? `<i class="medal gold"></i>${o.gold} <i class="medal silver"></i>${o.silver} <i class="medal bronze"></i>${o.bronze}` : f ? f(o[k] || 0) : (o[k] || 0);
    const diffs = DIFFICULTIES.filter((d) => S.byDiff[d]);
    const body = `<div class="stats-wrap"><table class="stats"><thead><tr><th></th><th>${t('stats.total')}</th>${diffs.map((d) => `<th>${t('diff.' + d)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(([k, f]) => `<tr><td>${t('stats.' + k)}</td><td>${val(S.total, k, f)}</td>${diffs.map((d) => `<td>${val(S.byDiff[d], k, f)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div><p class="muted small">${t('stats.note')}</p>
      <div class="row"><button class="btn ghost danger" id="sreset">${t('stats.reset')}</button></div>`;
    const panel = this.panel(t('menu.stats'), body, { wide: true });
    panel.querySelector('#sreset').onclick = () => this.confirm(t('stats.confirmReset'), () => { resetStats(); this.show('stats'); }, () => this.show('stats'));
  }

  // War map: the whole world, forts by owner, you, the cabin, the objective
  r_map({ from }) {
    const g = this.app.game;
    const body = `<div class="warmap"><canvas id="wmap"></canvas></div>
      <div class="legend"><span><i style="background:${OWNER_COLORS.ally}"></i>${t('map.ally')}</span><span><i style="background:${OWNER_COLORS.enemy}"></i>${t('map.enemy')}</span>
      <span><i style="background:${OWNER_COLORS.none}"></i>${t('map.none')}</span><span><i class="you"></i>${t('map.you')}</span>${g.mission ? `<span><i class="obj"></i>${t('map.objective')}</span>` : ''}</div>`;
    const close = () => from === 'pause' ? this.show('pause') : this.app.closePanel();
    const panel = this.panel(t('menu.map'), body, { wide: true, onBack: close });
    panel.classList.add('mappanel');
    // a clear Close button; on phones tapping the map itself closes it too
    const x = document.createElement('button'); x.className = 'btn icon-close'; x.setAttribute('aria-label', t('map.close')); x.textContent = '✕';
    x.onclick = close; panel.appendChild(x);
    const back = panel.querySelector('[data-act=back]'); if (back) back.textContent = t('map.close');
    const cv = panel.querySelector('#wmap'), w = g.world;
    if (this.app.input.touch) cv.addEventListener('click', close);
    const S = Math.min(560, Math.floor(Math.min(innerWidth - 60, innerHeight - 240)));
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = cv.height = S * dpr; cv.style.width = cv.style.height = S + 'px';
    const c = cv.getContext('2d');
    if (!g.mapImage) {
      // terrain shading, made once per world visit
      const img = document.createElement('canvas'); img.width = w.W; img.height = w.D;
      const x2 = img.getContext('2d'), id = x2.createImageData(w.W, w.D);
      for (let z = 0; z < w.D; z++) for (let x = 0; x < w.W; x++) {
        const y = w.surfaceY(x, z), b = w.get(x, y, z), k = (x + z * w.W) * 4;
        let r, gg, bb;
        if (b === 10 || y < SEA) { r = 52; gg = 70; bb = 78; }
        else { const h = Math.min(1, (y - SEA) / 18); r = 86 + h * 50; gg = 82 + h * 40; bb = 56 + h * 30; if (b === 6 || b === 4) { r -= 22; gg -= 8; bb -= 20; } }
        id.data[k] = r; id.data[k + 1] = gg; id.data[k + 2] = bb; id.data[k + 3] = 255;
      }
      x2.putImageData(id, 0, 0); g.mapImage = img;
    }
    const sc = S * dpr / Math.max(w.W, w.D);
    c.imageSmoothingEnabled = false;
    c.drawImage(g.mapImage, 0, 0, w.W * sc, w.D * sc);
    for (const f of g.forts.list) {
      const s = 13 * sc;
      c.fillStyle = OWNER_COLORS[f.owner] || OWNER_COLORS.none; c.strokeStyle = '#000'; c.lineWidth = 2 * dpr;
      c.fillRect(f.cx * sc - s / 2, f.cz * sc - s / 2, s, s); c.strokeRect(f.cx * sc - s / 2, f.cz * sc - s / 2, s, s);
      c.fillStyle = '#f0e8cc'; c.font = `${11 * dpr}px Oswald, Arial`; c.textAlign = 'center';
      c.fillText(f.name, f.cx * sc, f.cz * sc - s / 2 - 4 * dpr);
    }
    const cab = w.sites.find((s) => s.type === 'cabin');
    if (cab) { c.fillStyle = '#d8c890'; c.strokeStyle = '#000'; c.beginPath(); const X = cab.x * sc, Y = cab.z * sc, r = 7 * dpr; c.moveTo(X, Y - r); c.lineTo(X + r, Y); c.lineTo(X + r * 0.7, Y); c.lineTo(X + r * 0.7, Y + r); c.lineTo(X - r * 0.7, Y + r); c.lineTo(X - r * 0.7, Y); c.lineTo(X - r, Y); c.closePath(); c.fill(); c.stroke(); }
    const mk = g.mission && g.mission.marker();
    if (mk) { c.strokeStyle = '#ffd040'; c.lineWidth = 3 * dpr; c.beginPath(); c.arc(mk.x * sc, mk.z * sc, 10 * dpr, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(mk.x * sc, mk.z * sc, 3 * dpr, 0, Math.PI * 2); c.fillStyle = '#ffd040'; c.fill(); }
    const p = g.player;
    c.save(); c.translate(p.pos.x * sc, p.pos.z * sc); c.rotate(-p.yaw);
    c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.5 * dpr; const r = 8 * dpr;
    c.beginPath(); c.moveTo(0, -r); c.lineTo(r * 0.7, r * 0.7); c.lineTo(0, r * 0.3); c.lineTo(-r * 0.7, r * 0.7); c.closePath(); c.fill(); c.stroke(); c.restore();
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
    this.root.classList.add('art-screen');
    this.root.innerHTML = `${heroArt()}<div class="menu-zone"><p class="loading-text">${t('hud.loading')}</p><div class="loadbar"><div class="fill"></div></div></div>`;
  }
  setLoading(f) { const el = this.root.querySelector('.loadbar .fill'); if (el) el.style.width = Math.round(f * 100) + '%'; }

  r_clickToPlay() {
    this.root.innerHTML = `<div class="deploy"><button class="btn primary big" id="deploy">${t('menu.clickToPlay')}</button></div>`;
    this.root.querySelector('#deploy').onclick = () => this.app.resume();
  }
}

export { esc };
