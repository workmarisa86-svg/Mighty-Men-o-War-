// Online play (Siege): Host and Join with a code.
//
// The browsers talk straight to each other (WebRTC). PeerJS, a free public
// service, only introduces them at the start (the code names the host); the
// game itself never goes through it. The host's game is the real one: its
// world, its outlaws and waves, and the bags the fallen leave behind. Each
// player sends where they are and what they hold a dozen times a second;
// every block anyone places, digs or blows up goes to everyone. Players can
// hurt each other only when the host chose Free for all.
//
// Messages (JSON strings; long ones go in pieces):
//   guest -> host: hello, st (your state), bl (blocks), hitMan, pvp, died, bag, take, boom
//   host -> guest: welcome, refuse, ps (everyone's state), bl, men (outlaws, wave, time),
//                  hurt, give, bags, boom, join, leave, msg, bye
import * as THREE from 'three';
import { Character } from './characters.js';
import { hasGunModel } from './gunmodels.js';
import { GAME_VERSION } from './config.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { ITEMS } from './items.js';
import { saveSiege } from './storage.js';

const PREFIX = 'mmow-siege-';
const WORDS = ['WOLF', 'BEAR', 'COLT', 'HAWK', 'MULE', 'DUST', 'GOLD', 'IRON', 'RUST', 'SAGE', 'MESA', 'FORT', 'DEER', 'LARK', 'CROW', 'PINE', 'BULL', 'FOX'];
const SEND_HZ = 12, MEN_HZ = 8, AN_HZ = 5, AN_RANGE = 140, PIECE = 60000, MAX_PLAYERS = 8;
const HIDES = ['hide', 'wolf_hide', 'bear_hide'];
// player against player: how much each weapon takes (of 100; a bar is 10). Head shots count the same.
const PVP = { revolver: 5, lever: 10, sniper: 15, knife: 10 };
// what a fallen player leaves in their bag: food, skins and medkits
export function dropsOf(counts) {
  const out = {};
  for (const [id, n] of Object.entries(counts)) {
    if (!n || n === Infinity) continue;
    if ((ITEMS[id] && ITEMS[id].food) || HIDES.includes(id) || id === 'medkit') out[id] = n;
  }
  return out;
}

// the connection library (only loaded when you go online)
let lib = null;
function loadLib() {
  if (lib) return lib;
  lib = new Promise((res, rej) => {
    const got = () => (window.peerjs && window.peerjs.Peer) || window.Peer;
    if (got()) { res(got()); return; }
    const s = document.createElement('script');
    s.src = 'js/vendor/peerjs.min.js';
    s.onload = () => (got() ? res(got()) : rej(new Error('peerjs')));
    s.onerror = () => { lib = null; rej(new Error('load')); };
    document.head.appendChild(s);
  });
  return lib;
}
// (?peer=host:port uses your own PeerJS server instead of the free public one)
function peerOpts() {
  const q = new URLSearchParams(location.search).get('peer');
  if (!q) return { debug: 0 };
  const [host, port] = q.split(':');
  return { host, port: +port || 9000, path: '/', secure: false, debug: 0, config: { iceServers: [] } };
}
const r2 = (x) => Math.round(x * 100) / 100;

export class Net {
  constructor(app) {
    this.app = app; this.role = null; this.peer = null;
    this.conns = new Map();          // (host) player id -> connection
    this.hostConn = null;            // (guest) the line to the host
    this.players = new Map();        // everyone else: id -> { id, name, st, pos, av }
    this.myId = null; this.name = 'Player'; this.pvp = false; this.code = '';
    this.game = null; this.out = []; this.sendT = 0; this.menT = 0;
    this.bags = []; this.bagMeshes = new Map(); this.bagSeq = 1;
    this.parts = {}; this.nextId = 1; this.closed = false; this.waiting = [];
    this.lastBy = null; this.friendsT = 0; this.anT = 0; this.shimList = []; this.chat = [];
  }
  get host() { return this.role === 'host'; }
  get guest() { return this.role === 'guest'; }

  // ---- starting ----------------------------------------------------------------------------
  openPeer(P, id) {
    return new Promise((res, rej) => {
      const peer = id ? new P(id, peerOpts()) : new P(peerOpts());
      const fail = (e) => { try { peer.destroy(); } catch { /* gone */ } rej(e); };
      peer.once('open', () => {
        peer.off('error', fail); this.peer = peer;
        peer.on('error', (e) => this.onError(e));
        peer.on('disconnected', () => { if (!this.closed) try { peer.reconnect(); } catch { /* gone */ } });
        res();
      });
      peer.once('error', fail);
    });
  }
  // you host: your Siege, a code for your friends
  async startHost({ name, pvp }) {
    let P;
    try { P = await loadLib(); } catch { throw new Error('load'); }
    this.role = 'host'; this.name = name; this.pvp = !!pvp; this.myId = 'H';
    for (let k = 0; k < 6; k++) {
      const code = WORDS[Math.floor(Math.random() * WORDS.length)] + '-' + (10 + Math.floor(Math.random() * 90));
      try { await this.openPeer(P, PREFIX + code.toLowerCase()); this.code = code; break; }
      catch (e) { if (e.type !== 'unavailable-id' || k === 5) throw new Error('server:' + ((e && e.type) || 'error')); }
    }
    this.peer.on('connection', (c) => this.accept(c));
    return this.code;
  }
  // you join a friend's game with their code: resolves with their world
  async startJoin({ name, code }) {
    let P;
    try { P = await loadLib(); } catch { throw new Error('load'); }
    this.role = 'guest'; this.name = name;
    this.code = code.trim().toUpperCase().replace(/\s+/g, '');
    try { await this.openPeer(P, null); } catch (e) { throw new Error('server:' + ((e && e.type) || 'error')); }      // (this device can't reach the connection service)
    return new Promise((res, rej) => {
      const timer = setTimeout(() => { this.joinFail = null; rej(new Error(this.hostConn && this.hostConn.open ? 'timeout' : 'link:timeout')); }, 25000);
      this.joinFail = (why) => { clearTimeout(timer); this.joinFail = null; rej(new Error(why)); };
      this.onWelcome = (m) => { clearTimeout(timer); this.joinFail = null; res(m); };
      const c = this.peer.connect(PREFIX + this.code.toLowerCase(), { reliable: true, serialization: 'raw' });
      this.hostConn = c;
      c.on('open', () => this.sendTo(c, { t: 'hello', name, v: GAME_VERSION }));
      c.on('data', (raw) => this.recv(c, raw));
      c.on('close', () => this.lost());
      c.on('error', () => this.lost());
    });
  }
  onError(e) {
    if (this.joinFail) { const ty = (e && e.type) || 'error'; this.joinFail(ty === 'peer-unavailable' ? 'nocode' : /network|server-error|socket/.test(ty) ? 'server:' + ty : 'link:' + ty); return; }
    console.warn('net', e && e.type);
  }
  // the game is up: hook into it
  attach(game) {
    this.game = game; game.net = this;
    const w = game.world, prev = w.onSet;
    w.onSet = (x, y, z, old, id) => { if (prev) prev(x, y, z, old, id); if (!this.applying) this.out.push([x, y, z, id]); };
    const E = game.explosives, ex = E.explode.bind(E);
    E.explode = (x, y, z, o) => { ex(x, y, z, o); if (!this.inBoom && o.owner !== 'remote') this.send({ t: 'boom', x: r2(x), y: r2(y), z: r2(z), r: o.radius, p: o.power }); };
    this.bar = document.createElement('div'); this.bar.id = 'netbar'; document.body.appendChild(this.bar);
    this.chatEl = document.createElement('div'); this.chatEl.id = 'netchat'; document.body.appendChild(this.chatEl);
    this.chatBtn = document.createElement('button'); this.chatBtn.id = 'netchatbtn'; this.chatBtn.textContent = t('net.chat');
    this.chatBtn.onclick = () => this.openChat(); document.body.appendChild(this.chatBtn);
    // Enter or T: write to the others
    this.onKey = (e) => {
      const gm = this.game;
      if (!gm || gm.overlay || gm.paused || e.code !== 'Enter' || /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || '')) return;
      e.preventDefault(); this.openChat();
    };
    addEventListener('keydown', this.onKey);
    for (const [c, m] of this.waiting) this.handle(c, m);
    this.waiting = [];
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.host) this.toAll({ t: 'bye' });
    setTimeout(() => { try { this.peer && this.peer.destroy(); } catch { /* gone */ } }, 200);
    for (const P of this.players.values()) this.dropAvatar(P);
    for (const m of this.bagMeshes.values()) m.removeFromParent();
    for (const d of this.decoyList()) this.dropDecoy(d);
    this.bagMeshes.clear();
    if (this.bar) this.bar.remove();
    if (this.chatEl) this.chatEl.remove();
    if (this.chatBtn) this.chatBtn.remove();
    if (this.onKey) removeEventListener('keydown', this.onKey);
    if (this.game) this.game.net = null;
    this.game = null;
  }
  // (guest) the host is gone
  lost() {
    if (this.closed) return;
    if (this.joinFail) { this.joinFail('link:closed'); return; }
    const app = this.app;
    this.close(); app.net = null;
    if (app.game) app.quitToMenu(true);
    app.ui.show('online', { msg: t('net.lost') });
  }

  // ---- the wire ----------------------------------------------------------------------------
  sendTo(c, obj) {
    if (!c || !c.open) return;
    const s = JSON.stringify(obj);
    try {
      if (s.length <= PIECE) { c.send(s); return; }
      const id = Math.random().toString(36).slice(2), n = Math.ceil(s.length / PIECE);
      for (let i = 0; i < n; i++) c.send(JSON.stringify({ t: '_p', id, i, n, d: s.slice(i * PIECE, (i + 1) * PIECE) }));
    } catch (e) { console.warn('net send', e); }
  }
  toAll(obj, except) { for (const [id, c] of this.conns) if (id !== except) this.sendTo(c, obj); }
  send(obj) { if (this.host) this.toAll(obj); else this.sendTo(this.hostConn, obj); }
  recv(c, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.t === '_p') {
      const P = this.parts[m.id] || (this.parts[m.id] = { n: m.n, got: 0, d: [] });
      if (P.d[m.i] == null) { P.d[m.i] = m.d; P.got++; }
      if (P.got < P.n) return;
      delete this.parts[m.id];
      try { m = JSON.parse(P.d.join('')); } catch { return; }
    }
    if (!this.game && m.t !== 'welcome' && m.t !== 'refuse') { this.waiting.push([c, m]); return; }
    try { this.handle(c, m); } catch (e) { console.error('net', m.t, e); }
  }
  accept(c) {
    c.on('data', (raw) => this.recv(c, raw));
    c.on('close', () => this.dropConn(c));
    c.on('error', () => this.dropConn(c));
  }
  dropConn(c) {
    const id = c.pid;
    if (!id || !this.conns.has(id)) return;
    this.conns.delete(id);
    const P = this.players.get(id);
    if (P) { this.dropAvatar(P); this.players.delete(id); this.toAll({ t: 'leave', id }); this.toast(t('net.left', { name: P.name })); }
  }

  handle(c, m) {
    const g = this.game;
    switch (m.t) {
      // -- the host hears
      case 'hello': {
        if (m.v !== GAME_VERSION) { this.sendTo(c, { t: 'refuse', why: 'version' }); return; }
        if (this.players.size + 1 >= MAX_PLAYERS) { this.sendTo(c, { t: 'refuse', why: 'full' }); return; }
        const id = 'g' + this.nextId++, name = String(m.name || 'Player').slice(0, 16);
        c.pid = id; this.conns.set(id, c);
        this.players.set(id, { id, name, st: null });
        this.sendTo(c, { t: 'welcome', id, pvp: this.pvp, code: this.code, save: this.welcomeSave(), edits: g.world.serializeEdits(), bags: this.bags,
          players: [{ id: 'H', name: this.name }, ...[...this.players.values()].filter((P) => P.id !== id).map((P) => ({ id: P.id, name: P.name }))] });
        this.toAll({ t: 'join', id, name }, id);
        this.toast(t('net.joined', { name })); sfx.bell && sfx.bell(0.5);
        return;
      }
      case 'st': { const P = this.players.get(c.pid); if (P) { P.st = m.s; P.seen = performance.now(); } return; }
      case 'hitMan': if (g.town && g.town.siege) g.town.siege.netHitMan(m.id, m.dmg, !!m.head, c.pid); return;
      case 'pvp':
        if (!this.pvp) return;
        if (m.to === 'H') this.gotHurt({ dmg: m.dmg, by: this.nameOf(c.pid), byId: c.pid, from: m.from });
        else this.sendTo(this.conns.get(m.to), { t: 'hurt', dmg: m.dmg, by: this.nameOf(c.pid), byId: c.pid, from: m.from });
        return;
      case 'died': this.feed(this.nameOf(c.pid), m.by); if (g.town && g.town.siege) g.town.siege.remoteDied(c.pid); if (m.byId) this.credit(m.byId, 'player'); return;
      case 'bag': this.addBag(this.nameOf(c.pid), m.items, m.at); return;
      case 'hitAn': { const a = g.animals.byNetId(m.id); if (a) { g.animals.fp = g.animals.pickFocus(a.pos.x, a.pos.z); g.animals.hurt(a, m.dmg, !!m.silent); g.animals.fp = null; } return; }
      case 'skin': {
        const A = g.animals, a = A.byNetId(m.id);
        if (!a || a.state !== 'dead' || a.skinned) return;
        const items = { meat_raw: a.T.meat }; if (a.T.hide) items[a.T.hide] = a.T.hides || 1;
        a.skinned = true; a.dead = Math.max(a.dead, 1e9); A.remove(a);
        this.sendTo(c, { t: 'give', items, kind: 'skin' });
        return;
      }
      case 'take': {
        const b = this.bags.find((x) => x.id === m.id);
        if (!b) return;
        this.bags = this.bags.filter((x) => x !== b);
        this.sendTo(c, { t: 'give', items: b.items, name: b.name });
        this.toAll({ t: 'bags', b: this.bags });
        return;
      }
      // -- both
      case 'bl':
        this.applyBlocks(m.c);
        if (this.host) this.toAll(m, c.pid);          // (on to everyone else)
        return;
      case 'boom':
        if (this.host) this.toAll(m, c.pid);
        this.inBoom = true;
        try { g.explosives.explode(m.x, m.y, m.z, { radius: m.r, power: m.p, destroy: false, owner: 'remote' }); } finally { this.inBoom = false; }
        return;
      // -- the guest hears
      case 'welcome':
        this.myId = m.id; this.pvp = !!m.pvp; this.bags = m.bags || [];
        for (const p of m.players || []) this.players.set(p.id, { id: p.id, name: p.name, st: null });
        if (this.onWelcome) this.onWelcome(m);
        return;
      case 'refuse': if (this.joinFail) this.joinFail(m.why); return;
      case 'join': this.players.set(m.id, { id: m.id, name: m.name, st: null }); this.toast(t('net.joined', { name: m.name })); return;
      case 'leave': { const P = this.players.get(m.id); if (P) { this.dropAvatar(P); this.players.delete(m.id); this.toast(t('net.left', { name: P.name })); } return; }
      case 'ps':
        for (const e of m.p) {
          const [id, name, ...s] = e;
          if (id === this.myId) continue;
          let P = this.players.get(id);
          if (!P) { P = { id, name, st: null }; this.players.set(id, P); }
          P.name = name; P.st = s; P.seen = performance.now();
        }
        return;
      case 'men': if (g.town && g.town.siege) g.town.siege.netMen(m); return;
      case 'an': if (g.animals.proxy) g.animals.netAnimals(m.a); return;
      case 'hurt': this.gotHurt(m); return;
      case 'give': this.giveItems(m.items, m.name, m.kind); return;
      case 'chat':
        if (this.host) { const n = this.nameOf(c.pid), s2 = String(m.s || '').slice(0, 120); if (!s2.trim()) return; this.toAll({ t: 'chat', n, s: s2 }, c.pid); this.addChat(n, s2); }
        else this.addChat(m.n, m.s);
        return;
      case 'bags': this.bags = m.b || []; return;
      case 'credit': if (g.powers) g.powers.addKill(m.k, !!m.boss); return;
      case 'decoy':
        if (this.host) this.toAll(m, c.pid);
        if (m.id !== this.myId) this.addDecoy(m);
        return;
      case 'msg': this.toast(t(m.k, m.p)); return;
      case 'bye': this.lost(); return;
    }
  }
  nameOf(id) { if (id === 'H') return this.name; const P = this.players.get(id); return P ? P.name : '?'; }
  toast(s) { if (this.game) this.game.hud.toast(s); }

  // the world a joining friend gets: the host's Siege as it is now (not the host's own things)
  welcomeSave() {
    const g = this.game, T = g.town, s = T.toSave(), p = g.player.pos;
    delete s.inv; s.stats = {}; s.pickups = []; s.rafts = [];
    s.player = Object.assign({}, s.player, { x: p.x + 1.5, y: p.y + 0.5, z: p.z + 1.5, health: 100, hunger: 100 });
    return s;
  }
  applyBlocks(list) {
    const w = this.game.world;
    this.applying = true;
    try { for (const [x, y, z, id] of list) w.set(x, y, z, id); } finally { this.applying = false; }
  }

  // ---- every frame ---------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    if (!g || this.closed) return;
    if (this.out.length) { const c = this.out; this.out = []; this.send({ t: 'bl', c }); }
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / SEND_HZ;
      const s = this.myState();
      if (this.host) {
        if (this.conns.size) {
          const p = [['H', this.name, ...s]];
          for (const P of this.players.values()) if (P.st) p.push([P.id, P.name, ...P.st]);
          this.toAll({ t: 'ps', p });
        }
      } else this.sendTo(this.hostConn, { t: 'st', s });
    }
    if (this.host && this.conns.size && g.town && g.town.siege) {
      this.menT -= dt;
      if (this.menT <= 0) { this.menT = 1 / MEN_HZ; this.toAll(g.town.siege.netSnapshot()); }
    }
    if (this.host && this.conns.size) {
      this.anT -= dt;
      if (this.anT <= 0) {
        this.anT = 1 / AN_HZ;
        for (const [id, c] of this.conns) { const P = this.players.get(id); if (P && P.pos) this.sendTo(c, { t: 'an', a: g.animals.netList(P.pos, AN_RANGE) }); }
      }
    }
    this.updateAvatars(dt);
    this.updateDecoys(dt);
    this.updateShims();
    this.updateBags();
    this.updateChat();
    this.barT = (this.barT || 0) - dt;
    if (this.barT <= 0) { this.barT = 0.5; this.updateBar(); }
  }
  myState() {
    const g = this.game, p = g.player;
    const W = g.powers;
    const fl = (p.crouch ? 1 : 0) | (p.running ? 2 : 0) | (g.dying || g.dead ? 4 : 0) | (W && W.on('shadow') ? 8 : 0) | (W && W.on('ghost') ? 16 : 0);
    return [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), g.selected() || '', fl, r2(Math.hypot(p.vel.x, p.vel.z)), Math.round(p.health)];
  }
  updateBar() {
    if (!this.bar) return;
    const names = [this.name + ' (' + t('net.you') + ')', ...[...this.players.values()].map((P) => P.name)];
    this.bar.textContent = `${t('net.online')} · ${this.code} · ${t(this.pvp ? 'net.pvpOn' : 'net.pvpOff')} · ${names.join(', ')}`;
    this.bar.hidden = !document.body.classList.contains('ingame');
  }

  // ---- the other players' bodies ---------------------------------------------------------------
  updateAvatars(dt) {
    const g = this.game, now = performance.now();
    for (const P of this.players.values()) {
      if (!P.st) continue;
      const [x, y, z, yaw, pitch, sel, fl, spd] = P.st;
      if (!P.av) {
        let h = 0; for (const ch of P.id) h = (h * 31 + ch.charCodeAt(0)) | 0;
        P.av = new Character('civ', 'player', Math.abs(h) % 5); g.scene.add(P.av.root);
        P.pos = new THREE.Vector3(x, y, z); P.yaw = yaw; P.wpn = undefined;
        P.tag = nameTag(P.name); g.scene.add(P.tag);
      }
      const stale = now - (P.seen || now) > 6000, ghost = !!(fl & 16);
      P.stale = stale;
      P.av.root.visible = !stale && (!ghost || Math.sin(now / 70) > 0.93);       // (Ghost: only a flicker now and then)
      P.tag.visible = !stale && !ghost;
      const k = Math.min(1, dt * 12);
      if (Math.hypot(x - P.pos.x, z - P.pos.z) > 8) P.pos.set(x, y, z);
      else { P.pos.x += (x - P.pos.x) * k; P.pos.y += (y - P.pos.y) * k; P.pos.z += (z - P.pos.z) * k; }
      let dy = yaw - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * k;
      const wpn = sel && hasGunModel(sel) ? sel : null;
      if (wpn !== P.wpn) { P.wpn = wpn; P.av.setWeapon(wpn); }
      if (fl & 4) { P.deadT = (P.deadT || 0) + dt; P.av.pose({ dead: Math.min(1, P.deadT * 1.5), fallDir: 1 }, dt); }
      else { P.deadT = 0; P.av.pose({ speed: spd, run: !!(fl & 2), crouch: !!(fl & 1), aim: !!wpn && wpn !== 'knife', look: 0, pitch: pitch * 0.6 }, dt); }
      P.av.place(P.pos, P.yaw, P.pos.y);
      P.tag.position.set(P.pos.x, P.pos.y + ((fl & 4) ? 0.7 : (fl & 1) ? 1.75 : 2.2), P.pos.z);
    }
  }
  dropAvatar(P) {
    if (P.av) { P.av.dispose(); P.av = null; }
    if (P.tag) { P.tag.removeFromParent(); P.tag.material.map.dispose(); P.tag.material.dispose(); P.tag = null; }
  }
  // the other players, for the outlaws (host): where each one is
  targets() {
    const out = [];
    for (const P of this.players.values()) if (P.st && P.pos && !(P.st[6] & 4) && performance.now() - (P.seen || 0) < 6000) out.push({ id: P.id, pos: P.pos, crouch: !!(P.st[6] & 1), alive: true });
    return out;
  }
  // your shot or knife along a ray: the nearest other player it meets
  raycast(eye, dir, maxD) {
    let best = null;
    for (const P of this.players.values()) {
      if (!P.av || !P.st || (P.st[6] & 4) || P.stale) continue;
      const ox = eye.x - P.pos.x, oz = eye.z - P.pos.z;
      const a = dir.x * dir.x + dir.z * dir.z, b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - 0.38 * 0.38;
      const disc = b * b - 4 * a * c;
      if (a < 1e-6 || disc < 0) continue;
      const t0 = (-b - Math.sqrt(disc)) / (2 * a), t1 = (-b + Math.sqrt(disc)) / (2 * a);
      const tt = t0 >= 0 ? t0 : t1;
      if (tt < 0 || tt > maxD) continue;
      const hy = eye.y + dir.y * tt - P.pos.y, h = (P.st[6] & 1) ? 1.35 : 1.8;
      if (hy < 0 || hy > h) continue;
      if (!best || tt < best.dist) best = { remote: P.id, dist: tt, head: hy > h - 0.3, point: new THREE.Vector3(eye.x + dir.x * tt, eye.y + dir.y * tt, eye.z + dir.z * tt) };
    }
    return best;
  }

  // ---- hurting -----------------------------------------------------------------------------
  // you hit another player (only in Free for all)
  hitPlayer(id, dmg, head, weapon) {
    dmg = PVP[weapon] ?? 10;
    if (!this.pvp) {
      if (performance.now() - this.friendsT > 4000) { this.friendsT = performance.now(); this.toast(t('net.friendsOnly')); }
      return false;
    }
    const p = this.game.player.pos, from = [r2(p.x), r2(p.z)];
    if (this.host) this.sendTo(this.conns.get(id), { t: 'hurt', dmg, by: this.name, byId: 'H', from });
    else this.sendTo(this.hostConn, { t: 'pvp', to: id, dmg, from });
    return true;
  }
  // (host) an outlaw hits another player
  hurtPlayer(id, dmg, cause, from, by) { this.sendTo(this.conns.get(id), { t: 'hurt', dmg, cause, by, from: [r2(from.x), r2(from.z)] }); }
  gotHurt(m) {
    const g = this.game, p = g.player;
    if (!g || g.dying || g.dead) return;
    const from = m.from ? { x: m.from[0], y: p.pos.y, z: m.from[1] } : null;
    this.lastBy = { name: m.by || null, id: m.byId || null, at: performance.now() };
    g.damage(m.dmg * (m.head ? 2 : 1), m.cause || 'shot', from);
  }
  // (guest) your hit on an outlaw: the host's outlaw takes it
  hitMan(id, dmg, head) { this.sendTo(this.hostConn, { t: 'hitMan', id, dmg, head }); }
  // you died: who did it goes round, and your things stay in a bag where you fell
  died(items, at) {
    const L = this.lastBy && performance.now() - this.lastBy.at < 12000 ? this.lastBy : null, by = L ? L.name : null, byId = L ? L.id : null;
    this.lastBy = null;
    const pos = [r2(at.x), r2(at.y), r2(at.z)];
    if (this.host) { this.feed(this.name, by); if (byId) this.credit(byId, 'player'); if (Object.keys(items).length) this.addBag(this.name, items, pos); }
    else { this.sendTo(this.hostConn, { t: 'died', by, byId }); if (Object.keys(items).length) this.sendTo(this.hostConn, { t: 'bag', items, at: pos }); }
  }
  feed(a, b) {
    const m = { t: 'msg', k: b ? 'net.killedBy' : 'net.died', p: { a, b } };
    this.toAll(m); this.toast(t(m.k, m.p));
  }
  // an outlaw's knife on the host: who did it, for the bag message
  hurtBy(name) { this.lastBy = { name, id: null, at: performance.now() }; }
  // (host) a kill goes to whoever made it: the host's own abilities, or that player's
  credit(id, k, boss = false) {
    if (id === 'H') { if (this.game.powers) this.game.powers.addKill(k, boss); }
    else this.sendTo(this.conns.get(id), { t: 'credit', k, boss });
  }
  // ---- decoys (an ability): a false you on everyone's screen, radar and map ----------------
  sendDecoy(d, dur) { this.send({ t: 'decoy', id: this.myId, name: this.name, x: r2(d.x), y: r2(d.y), z: r2(d.z), yaw: r2(d.yaw), dur }); }
  addDecoy(m) {
    const old = (this.decoys || (this.decoys = new Map())).get(m.id);
    if (old) this.dropDecoy(old);
    const g = this.game, R = new Character('civ', 'player', 2), tag = nameTag(m.name || this.nameOf(m.id));
    g.scene.add(R.root); g.scene.add(tag);
    this.decoys.set(m.id, { id: m.id, name: m.name, pos: new THREE.Vector3(m.x, m.y, m.z), yaw: m.yaw, until: performance.now() + m.dur * 1000, rig: R, tag });
  }
  dropDecoy(d) { d.rig.dispose(); d.tag.removeFromParent(); d.tag.material.map.dispose(); d.tag.material.dispose(); this.decoys.delete(d.id); }
  decoyList() { return this.decoys ? [...this.decoys.values()] : []; }
  updateDecoys(dt) {
    for (const d of this.decoyList()) {
      if (performance.now() > d.until) { this.dropDecoy(d); continue; }
      d.rig.pose({ speed: 0, look: 0, pitch: 0 }, dt); d.rig.place(d.pos, d.yaw, d.pos.y);
      d.tag.position.set(d.pos.x, d.pos.y + 2.2, d.pos.z);
    }
  }

  // (host) the other players as the animals see them (net.shims: stand-ins with a position)
  updateShims() {
    const out = [];
    for (const P of this.players.values()) {
      if (!P.st || !P.pos || (P.st[6] & 4) || performance.now() - (P.seen || 0) > 6000) continue;
      const S = P.shim || (P.shim = { remote: P.id, pos: P.pos, vel: new THREE.Vector3(), flying: false });
      S.pos = P.pos; S.crouch = !!(P.st[6] & 1); S.running = !!(P.st[6] & 2);
      const sp = P.st[7] || 0; S.vel.set(Math.sin(-P.yaw) * sp, 0, -Math.cos(P.yaw) * sp);
      out.push(S);
    }
    this.shimList = out;
  }
  shims() { return this.shimList; }
  // (guest) your shot or knife hit one of the host's animals
  hitAnimal(id, dmg, silent) { this.sendTo(this.hostConn, { t: 'hitAn', id, dmg, silent }); }
  // the other players on the maps (blue)
  mapMarks() {
    const out = [];
    for (const P of this.players.values()) if (P.pos && P.st && !(P.st[6] & 8) && performance.now() - (P.seen || 0) < 6000) out.push({ x: P.pos.x, z: P.pos.z, name: P.name, dead: !!(P.st[6] & 4) });     // (Shadow: off the maps)
    for (const d of this.decoyList()) out.push({ x: d.pos.x, z: d.pos.z, name: d.name, dead: false });
    return out;
  }

  // ---- chat -------------------------------------------------------------------------------
  openChat() { if (this.game && !this.game.overlay) this.app.openPanel('chat', {}); }
  say(text) {
    const s = String(text || '').trim().slice(0, 120);
    if (!s) return;
    this.addChat(this.name, s);
    if (this.host) this.toAll({ t: 'chat', n: this.name, s }); else this.sendTo(this.hostConn, { t: 'chat', s });
  }
  addChat(name, s) {
    this.chat.push({ name, s, at: performance.now() });
    if (this.chat.length > 40) this.chat.shift();
    this.chatDirty = true;
    sfx.tick && sfx.tick();
  }
  updateChat() {
    if (!this.chatEl) return;
    const now = performance.now(), recent = this.chat.filter((l) => now - l.at < 15000).slice(-6);
    const key = recent.map((l) => l.at).join(',');
    if ((this.placeT = (this.placeT || 0) - 1) <= 0) { this.placeT = 30; this.placeChat(); }     // (the radar's size can change with the window)
    if (key === this.chatKey && !this.chatDirty) return;
    this.chatKey = key; this.chatDirty = false;
    this.chatEl.replaceChildren(...recent.map((l) => { const d = document.createElement('div'); const b = document.createElement('b'); b.textContent = l.name + ': '; d.append(b, l.s); return d; }));
    const on = document.body.classList.contains('ingame');
    this.chatEl.hidden = !on || !recent.length; this.chatBtn.hidden = !on;
    this.placeChat();
  }
  // the Chat button and the lines: under the radar (not on it), so they are easy to tap
  placeChat() {
    const mm = document.getElementById('minimap'), r = mm && mm.offsetParent ? mm.getBoundingClientRect() : null;
    const top = r && r.height ? Math.round(r.bottom + 12) : 12, left = r && r.width ? Math.round(r.left) : 12;
    if (this.chatTop === top && this.chatLeft === left) return;
    this.chatTop = top; this.chatLeft = left;
    this.chatBtn.style.top = top + 'px'; this.chatBtn.style.left = left + 'px';
    this.chatEl.style.top = (top + 50) + 'px'; this.chatEl.style.left = left + 'px';
  }

  // ---- your own copy of the world ---------------------------------------------------------------
  // (guest) keep a copy of your friend's world on this device (as your Siege: Continue your Siege)
  copyWorld() {
    const g = this.game, T = g.town;
    if (!T || !T.siege) return false;
    const S = T.siege;
    for (const v of S.men || []) v.waveN = v.waveN || S.started;
    const ok = saveSiege(T.toSave(), g.world.serializeEdits());
    g.hud.toast(t(ok ? 'net.copied' : 'hud.saveFail')); if (ok) sfx.done();
    return ok;
  }

  // ---- bags -------------------------------------------------------------------------------
  addBag(name, items, at) {
    this.bags.push({ id: 'b' + this.bagSeq++, name, x: at[0], y: at[1], z: at[2], items });
    if (this.bags.length > 30) this.bags.shift();
    this.toAll({ t: 'bags', b: this.bags });
  }
  bagOptions(p) {
    const b = this.bags.find((x) => Math.hypot(x.x - p.x, x.z - p.z) < 2.5 && Math.abs(x.y - p.y) < 2.5);
    return b ? [{ a: 'netbag', label: t('net.takeBag', { name: b.name }), run: () => this.takeBag(b.id) }] : [];
  }
  takeBag(id) {
    const b = this.bags.find((x) => x.id === id);
    if (!b) return;
    if (this.host) { this.bags = this.bags.filter((x) => x !== b); this.giveItems(b.items, b.name); this.toAll({ t: 'bags', b: this.bags }); }
    else this.sendTo(this.hostConn, { t: 'take', id });
  }
  giveItems(items, name, kind) {
    const g = this.game;
    let n = 0;
    for (const [id, k] of Object.entries(items || {})) if (ITEMS[id] && k > 0) { g.give(id, k, kind !== 'skin'); n += k; }
    g.hud.dirtyHotbar = true;
    if (kind === 'skin') return;          // (skinning: the usual "you got..." notes)
    g.hud.toast(t('net.tookBag', { name, n })); sfx.done();
  }
  updateBags() {
    const g = this.game, ids = new Set(this.bags.map((b) => b.id));
    for (const [id, m] of this.bagMeshes) if (!ids.has(id)) { m.removeFromParent(); this.bagMeshes.delete(id); }
    for (const b of this.bags) {
      if (this.bagMeshes.has(b.id)) continue;
      const m = new THREE.Mesh(BAG_GEO, BAG_MAT);
      m.position.set(b.x, b.y + 0.2, b.z); m.rotation.y = Math.random() * 6;
      g.scene.add(m); this.bagMeshes.set(b.id, m);
    }
  }
}
const BAG_GEO = new THREE.BoxGeometry(0.55, 0.38, 0.4);
const BAG_MAT = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });

// a name over a player's head
function nameTag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px Oswald, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.5)'; const w = Math.min(250, x.measureText(name).width + 24); x.fillRect(128 - w / 2, 10, w, 44);
  x.fillStyle = '#f3e6c8'; x.fillText(name, 128, 33);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(1.3, 0.325, 1);
  return s;
}
