// Military-style heads-up display: compass, health/hunger bars, hotbar, toasts.
import * as THREE from 'three';
import { itemIcon, ITEMS } from './items.js';
import { WEAPONS } from './weapons.js';
import { Minimap } from './minimap.js';
import { sfx } from './audio.js';
import { t } from './i18n.js';
import { ORDER_COLORS } from './soldiers.js';
import { esc } from './ui.js';
import { WEATHER } from './countries.js';

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
    this.underwater = $('#underwater'); this.flashEl = $('#flash');
    this.keyhint = $('#keyhint');
    this.cross = $('#crosshair'); this.hitEl = $('#hitmark'); this.hint = $('#hint');
    this.big = $('#bigmsg'); this.hungerEl = $('#hungerstate');
    this.dmgEl = $('#dmgdir'); this.markersEl = $('#markers');
    this.defuseProgress = 0; this.markerEls = [];
    this.minimap = new Minimap(game);
    this.squadEl = $('#squadlist'); this.squadT = 0;
    this.missionEl = $('#mission'); this.missionT = 0;
    this.radioEl = $('#radio'); this.alertEl = $('#alertbar');
    this.dirtyHotbar = true;
    this.digProgress = 0;
    this.statusTimer = 0;
    this.buildCompass();
    this.hotbar.onclick = (e) => {
      const s = e.target.closest('.slot');
      if (s) { game.inv.sel = +s.dataset.i; this.dirtyHotbar = true; }
    };
    this.keyhint.textContent = game.app.input.touch ? '' : t(game.townMode ? 'help.townKeys' : 'help.keys');   // phones: the pause menu lists the buttons
    // three quick taps on the clock: show or hide the frame-rate counter
    let taps = [];
    this.status.onclick = this.status.ontouchend = () => { const now = performance.now(); taps = taps.filter((x) => now - x < 900).concat(now); if (taps.length >= 3) { taps = []; this.toggleFps(); } };
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
    const showBreath = g.breath < 19.9 && !g.has('scuba');
    this.breath.hidden = !showBreath;
    if (showBreath) this.breathFill.style.width = (g.breath / 20 * 100) + '%';

    this.statusTimer -= dt;
    if (this.statusTimer <= 0) {
      this.statusTimer = 0.5;
      const day = Math.floor(g.time) + 1;
      const tod = g.dayOnly ? 0.45 : g.time % 1;
      const hh = Math.floor(tod * 24), mm = Math.floor((tod * 24 - hh) * 60);
      const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      const parts = g.town ? [t('season.' + g.town.season) + ' ' + g.town.dayOfSeason(), t('hud.day', { n: day }), clock] : [t('hud.day', { n: day }), g.dayOnly ? t('hud.daylight') : clock];
      if (g.climateNow && !g.town) {
        // War: the country's (or the battle's) weather, and the battle clock
        parts.unshift(t('cname.' + g.cfg.country));
        const k = Object.keys(WEATHER).find((x) => WEATHER[x] === g.climateNow);
        if (k) parts.push(g.climateNow.icon + ' ' + t('wx.' + k));
        if (g.battle && g.battle.role === 'defend' && !g.battle.done) { const s = Math.ceil(g.battle.timeLeft()); parts.push(t('battle.timeLeft', { t: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` })); }
      } else if (g.weather.rain > 0.15) parts.push(t(g.town && g.town.snowing() ? 'hud.snow' : 'hud.rain'));
      this.status.textContent = parts.join('  ·  ');
    }

    const prog = Math.min(1, Math.max(this.digProgress, this.defuseProgress));
    this.ring.style.strokeDashoffset = String(100 - prog * 100);
    this.ring.parentElement.style.opacity = prog > 0 ? 1 : 0;

    if (g.craft) {
      this.craftbar.hidden = false;
      const left = Math.max(0, g.craft.total - g.craft.t);
      this.craftLabel.textContent = t('hud.crafting', { item: t('item.' + g.craft.r.id), s: left.toFixed(1) });
      this.craftFill.style.width = (g.craft.t / g.craft.total * 100) + '%';
    } else this.craftbar.hidden = true;

    // reticle: crosshair for guns, a dot for the knife, small dot otherwise
    const W = WEAPONS[g.selected()];
    const scoped = g.scopeView.ease() > 0.5;
    const ret = scoped ? 'none' : W ? (W.reticle === 'arc' ? 'tool' : W.reticle) : 'tool';
    if (ret !== this.ret) { this.ret = ret; this.cross.className = ret; }
    // context hint
    let hint = '';
    if (!g.overlay && !g.paused && !scoped) {
      if (g.defusing) hint = t('hint.defusing');
      else if (p.swimming) hint = t('hint.dive');
      else if (g.cabin && g.cabin.nearChest(p.pos)) hint = t('hint.chest');
      else if (g.aimUse && g.aimUse.target) hint = '';
      else if (W && W.scope) hint = t('hint.scope');
      else if (W && W.throw) hint = t('hint.throw');
      else if (g.selected() === 'flint') hint = t('hint.flint');
      else if (g.town && ITEMS[g.selected()] && ITEMS[g.selected()].seed) hint = t('hint.seed');
      else if (g.town && g.selected() === 'bucket') hint = t('hint.bucket');
      else if (g.town && g.selected() === 'bucket_water') hint = t('hint.bucketWater');
      else if (ITEMS[g.selected()] && (ITEMS[g.selected()].food || ITEMS[g.selected()].heal)) hint = t('hint.eat');
    }
    if (hint !== this.hintText) { this.hintText = hint; this.hint.textContent = hint; }
    const hs = p.hunger <= 0 ? t('hud.sickShort') : p.hunger < 20 ? t('hud.hungryShort') : '';
    if (hs !== this.hsText) { this.hsText = hs; this.hungerEl.textContent = hs; }
    this.updateFps(dt);
    this.updateMarkers();
    this.updateAware();
    this.updateSquadList(dt);
    this.updateMission(dt);
    this.minimap.update(dt);
    this.underwater.classList.toggle('on', p.headInWater);

    if (this.dirtyHotbar) this.renderHotbar();
  }

  // stealth: a small eye over nearby enemies that fills as they notice you
  // and turns into "!" once they are on to you
  updateAware() {
    const g = this.game, E = g.enemies;
    if (!this.awareEls) this.awareEls = [];
    const on = g.settings.awareness !== false && E && E.enabled;
    const P = g.player.pos, cam = g.camera, list = [];
    if (on) for (const s of E.list) {
      if (!s.alive || s.faction !== 'enemy' || s.surrender) continue;
      const d = Math.hypot(s.pos.x - P.x, s.pos.z - P.z);
      if (d > 40) continue;
      const alert = s.target && s.target.kind === 'player';
      if (!alert && !(s.aware > 0.05)) continue;
      list.push({ s, alert, k: Math.min(1, s.aware || 0), d });
      if (list.length >= 8) break;
    }
    while (this.awareEls.length < list.length) { const el = document.createElement('div'); el.className = 'aware'; el.innerHTML = '<i></i>'; this.markersEl.appendChild(el); this.awareEls.push(el); }
    const V = this.tmpV || (this.tmpV = new THREE.Vector3());
    this.awareEls.forEach((el, i) => {
      const m = list[i];
      if (!m) { el.style.display = 'none'; return; }
      V.set(m.s.pos.x, m.s.pos.y + 2.25, m.s.pos.z).project(cam);
      if (V.z > 1) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      el.style.transform = `translate(${((V.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-V.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px)`;
      el.classList.toggle('alert', m.alert);
      el.firstChild.style.height = (m.alert ? 100 : m.k * 100).toFixed(0) + '%';
    });
  }
  // hidden frame-rate counter: F3 on a computer, tap the clock three times on a phone
  updateFps(dt) {
    const input = this.game.app.input;
    if (input.hit('F3')) this.toggleFps();
    this.fpsN = (this.fpsN || 0) + 1; this.fpsAcc = (this.fpsAcc || 0) + dt;
    if (this.fpsAcc >= 0.5) {
      if (this.fpsEl) this.fpsEl.textContent = `${(this.fpsN / this.fpsAcc).toFixed(0)} fps · ${(this.fpsAcc / this.fpsN * 1000).toFixed(1)} ms`;
      this.fpsN = 0; this.fpsAcc = 0;
    }
  }
  toggleFps() {
    if (this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; return; }
    this.fpsEl = document.createElement('div'); this.fpsEl.id = 'fps'; this.root.appendChild(this.fpsEl);
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
        const single = ITEMS[id] && (ITEMS[id].weapon || ITEMS[id].armor);
        const empty = !tool && c <= 0;
        inner = `<img src="${itemIcon(id)}" alt="" class="${empty ? 'empty' : ''}">` +
          (tool || (single && c <= 1) ? '' : `<b>${c === Infinity ? '∞' : c}</b>`);
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
  hitMarker(head) {
    this.hitEl.classList.toggle('head', !!head);
    this.hitEl.classList.remove('on'); void this.hitEl.offsetWidth; this.hitEl.classList.add('on');
  }
  // allied radio callouts (blue) and warnings (red), newest at the bottom
  radio(name, text, kind = 'ally') {
    const el = document.createElement('div');
    el.className = 'rline ' + kind;
    const b = document.createElement('b'); b.textContent = name + ': ';
    el.appendChild(b); el.appendChild(document.createTextNode(text));
    this.radioEl.appendChild(el);
    while (this.radioEl.children.length > 4) this.radioEl.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 4500);
    setTimeout(() => el.remove(), 5200);
    sfx.radio();
  }
  alert(text) {
    this.alertEl.textContent = text;
    this.alertEl.classList.remove('on'); void this.alertEl.offsetWidth; this.alertEl.classList.add('on');
  }
  killNote() { this.toast(t('hud.enemyDown'), 'kill'); }
  // red arc at the screen edge pointing to where damage came from
  damageFrom(angle) {
    this.dmgEl.style.transform = `rotate(${-angle}rad)`;
    this.dmgEl.classList.remove('on'); void this.dmgEl.offsetWidth; this.dmgEl.classList.add('on');
  }
  // danger markers: enemy grenades and lit enemy TNT near the player
  updateMarkers() {
    const g = this.game, cam = g.camera, p = g.player.pos;
    const list = [];
    for (const pr of g.explosives.projectiles) if (pr.owner === 'enemy' && pr.kind === 'grenade' && pr.pos.distanceTo(p) < 14) list.push({ pos: pr.pos, label: '!' });
    for (const l of g.explosives.lit.values()) if (l.owner === 'enemy' && Math.hypot(l.x - p.x, l.z - p.z) < 45) list.push({ pos: new THREE.Vector3(l.x + 0.5, l.y + 1.3, l.z + 0.5), label: 'TNT ' + Math.max(0, l.t).toFixed(0) });
    if (g.town) for (const w of g.town.marks()) list.push({ pos: new THREE.Vector3(w.pos.x, w.pos.y + 2.4, w.pos.z), label: '!' });
    while (this.markerEls.length < list.length) { const d = document.createElement('div'); d.className = 'marker danger'; this.markersEl.appendChild(d); this.markerEls.push(d); }
    this.markerEls.forEach((el, i) => {
      const m = list[i];
      if (!m) { el.style.display = 'none'; return; }
      const v = m.pos.clone().project(cam);
      let x = (v.x * 0.5 + 0.5) * innerWidth, y = (-v.y * 0.5 + 0.5) * innerHeight;
      if (v.z > 1) { x = innerWidth - x; y = innerHeight - 40; }
      x = Math.max(30, Math.min(innerWidth - 30, x)); y = Math.max(40, Math.min(innerHeight - 40, y));
      el.style.display = 'block'; el.style.transform = `translate(${x}px, ${y}px)`; el.textContent = m.label;
    });
  }
  bigMessage(title, sub = '') {
    this.big.innerHTML = '';
    const h = document.createElement('h2'); h.textContent = title; this.big.appendChild(h);
    if (sub) { const p = document.createElement('p'); p.textContent = sub; this.big.appendChild(p); }
    this.big.classList.remove('on'); void this.big.offsetWidth; this.big.classList.add('on');
  }
  flash() { this.flashEl.classList.remove('on'); void this.flashEl.offsetWidth; this.flashEl.classList.add('on'); }

  dispose() {
    this.root.hidden = true;
    if (this.fpsEl) { this.fpsEl.remove(); this.fpsEl = null; }
    this.toasts.innerHTML = '';
    this.radioEl.innerHTML = '';
  }

  // looking at one of your forts' ration crates (checked a few times a second)
  rationsAimed() {
    const g = this.game, now = performance.now();
    if (now - (this.rationT || 0) < 250) return this.rationHit;
    this.rationT = now;
    const { eye, dir } = g.aim();
    const hit = g.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 5.6);
    this.rationHit = !!hit && hit.id === 18 && !(g.cabin && g.cabin.isChest(hit.x, hit.y, hit.z));
    return this.rationHit;
  }

  // current mission: name, objective, time left
  updateMission(dt) {
    const m = this.game.mission;
    this.missionT -= dt;
    if (this.missionT > 0) return;
    this.missionT = 0.25;
    if (!m || m.done) { this.missionEl.hidden = true; return; }
    this.missionEl.hidden = false;
    const left = m.timeLeft();
    const txt = [t('ms.' + m.id + '.name'), m.status(), left == null ? '' : `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`];
    const els = this.missionEl.children;
    for (let i = 0; i < 3; i++) if (els[i].textContent !== txt[i]) els[i].textContent = txt[i];
    this.missionEl.classList.toggle('urgent', left != null && left < 30);
  }

  // small list of the player's squad: who, what order, how healthy
  updateSquadList(dt) {
    const g = this.game, E = g.enemies;
    this.squadT -= dt;
    if (this.squadT > 0) return;
    this.squadT = 0.3;
    const members = g.cfg.sub === 'allies' && E ? E.squadMembers() : [];
    if (!members.length) { this.squadEl.hidden = true; return; }
    this.squadEl.hidden = false;
    const MAX = 8;
    members.sort((a, b) => (b.selected - a.selected) || a.idx - b.idx);
    const form = t('form.' + (E.formMode || g.settings.formation || 'loose'));
    let html = `<div class="sq-head">${t('squad.title', { n: members.length })} <span>${form}${E.contactT < 10 ? ' · ' + t('squad.underFire') : ''}</span></div>`;
    for (const s of members.slice(0, MAX)) {
      const hp = Math.max(0, s.hp / s.T.hp);
      html += `<div class="sq-row${s.selected ? ' sel' : ''}"><i style="background:${ORDER_COLORS[s.role]}"></i><b>${esc(s.name)}</b>` +
        `<span>${t('role.' + s.role)}</span><em><u style="width:${(hp * 100).toFixed(0)}%"></u></em></div>`;
    }
    if (members.length > MAX) html += `<div class="sq-more">${t('squad.more', { n: members.length - MAX })}</div>`;
    if (html !== this.squadHtml) { this.squadHtml = html; this.squadEl.innerHTML = html; }
  }
}
