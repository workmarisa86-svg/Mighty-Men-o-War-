// Abilities (Siege): six powers earned by killing, and kept on this device
// for good (every Siege, alone or online). They are hard to earn on purpose:
// a player with all six has played a lot. Two are on screen at a time (the
// Abilities tab of the inventory picks which), each with its own button (and
// Z / X on a keyboard). A power lasts some seconds, then rests a while.
//   Shadow   - off the other players' radar and map        (online, Free for all)
//   Ghost    - see-through, no name over your head          (online, Free for all)
//   Eagle eye- every outlaw and player marked through walls
//   Second wind - full health, and faster for a while
//   Iron skin- half damage for a while
//   Decoy    - a false you: outlaws go for it; online it is on everyone's radar and map
import * as THREE from 'three';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { Character } from './characters.js';

const KEY = 'blocks-mmow-powers';
export const POWERS = {
  shadow: { dur: 20, cool: 90, need: { outlaws: 300, players: 25 }, pvp: true },
  ghost: { dur: 12, cool: 120, need: { outlaws: 600, players: 50 }, pvp: true },
  eagle: { dur: 15, cool: 90, need: { outlaws: 400 } },
  wind: { dur: 10, cool: 180, need: { outlaws: 800 } },
  iron: { dur: 15, cool: 180, need: { bosses: 10 } },
  decoy: { dur: 20, cool: 120, need: { outlaws: 1000, players: 75 } },
};
export const POWER_IDS = Object.keys(POWERS);

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return Object.assign({ outlaws: 0, players: 0, bosses: 0, slots: [] }, s); } catch { /* private mode */ }
  return { outlaws: 0, players: 0, bosses: 0, slots: [] };
}

export class Powers {
  constructor(game) {
    this.game = game; this.s = load();
    this.until = {}; this.ready = {};            // (seconds of game play: when each ends, when each can be used again)
    this.clock = 0;
    this.s.slots = this.s.slots.filter((id) => POWERS[id] && this.unlocked(id)).slice(0, 2);
    this.el = document.createElement('div'); this.el.id = 'powers';
    document.body.appendChild(this.el);
    this.btns = [0, 1].map((i) => { const b = document.createElement('button'); b.className = 'pw'; b.onclick = () => this.useSlot(i); this.el.appendChild(b); return b; });
    this.uiT = 0;
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode */ } }
  unlocked(id) { const N = POWERS[id].need; return Object.entries(N).some(([k, n]) => (this.s[k] || 0) >= n); }
  progress(id) { return Object.entries(POWERS[id].need).map(([k, n]) => t('pw.need.' + k, { have: Math.min(this.s[k] || 0, n), n })).join(' · '); }
  count() { return POWER_IDS.filter((id) => this.unlocked(id)).length; }
  // a kill by you: an outlaw (a gang leader counts as a boss too) or another player
  addKill(kind, boss = false) {
    const before = POWER_IDS.filter((id) => this.unlocked(id));
    if (kind === 'player') this.s.players++; else { this.s.outlaws++; if (boss) this.s.bosses++; }
    const now = POWER_IDS.filter((id) => this.unlocked(id) && !before.includes(id));
    for (const id of now) {
      if (this.s.slots.length < 2) this.s.slots.push(id);
      this.game.hud.bigMessage(t('pw.unlockedTitle'), t('pw.unlocked', { name: t('pw.' + id) }));
      sfx.done();
    }
    this.save();
  }
  setSlot(id, on) {
    const S = this.s.slots;
    if (on) { if (!this.unlocked(id) || S.includes(id)) return false; if (S.length >= 2) return false; S.push(id); }
    else this.s.slots = S.filter((x) => x !== id);
    this.save();
    return true;
  }
  on(id) { return (this.until[id] || 0) > this.clock; }
  left(id) { return Math.max(0, (this.until[id] || 0) - this.clock); }
  rest(id) { return Math.max(0, (this.ready[id] || 0) - this.clock); }
  useSlot(i) { const id = this.s.slots[i]; if (id) this.use(id); }
  use(id) {
    const g = this.game, P = POWERS[id];
    if (!P || !this.unlocked(id) || this.on(id) || this.rest(id) > 0 || g.dying || g.dead) return;
    if (P.pvp && !(g.net && g.net.pvp)) { g.hud.toast(t('pw.pvpOnly')); return; }
    this.until[id] = this.clock + P.dur; this.ready[id] = this.clock + P.dur + P.cool;
    if (id === 'wind') { g.player.health = 100; g.hud.flash && g.hud.flash(); }
    if (id === 'decoy') { const p = g.player; this.decoy = { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw }; this.showDecoy(true); if (g.net) g.net.sendDecoy(this.decoy, P.dur); }
    g.hud.toast(t('pw.used', { name: t('pw.' + id), n: P.dur })); sfx.bell && sfx.bell(0.4);
  }
  damageMul() { return this.on('iron') ? 0.5 : 1; }
  speedMul() { return this.on('wind') ? 1.35 : 1; }
  // your own false figure, where you stood
  showDecoy(on) {
    if (this.decoyRig) { this.decoyRig.dispose(); this.decoyRig = null; }
    if (!on || !this.decoy) return;
    const d = this.decoy, R = new Character('civ', 'player', 1);
    this.game.scene.add(R.root); this.decoyRig = R; this.decoyPos = new THREE.Vector3(d.x, d.y, d.z);
  }
  // (eagle eye) marks over every outlaw and other player in range
  eagleMarks() {
    if (!this.on('eagle')) return [];
    const g = this.game, p = g.player.pos, out = [];
    const S = g.town && g.town.siege;
    for (const v of (S && S.men) || []) if (v.alive && !v.away && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < 120) out.push({ pos: new THREE.Vector3(v.pos.x, v.pos.y + 2.3, v.pos.z), label: '▼' });
    if (g.net) for (const P of g.net.players.values()) if (P.pos && P.st && !(P.st[6] & 4) && Math.hypot(P.pos.x - p.x, P.pos.z - p.z) < 160) out.push({ pos: new THREE.Vector3(P.pos.x, P.pos.y + 2.5, P.pos.z), label: P.name });
    return out;
  }
  update(dt, input, playing) {
    const g = this.game;
    this.clock += dt;
    if (playing) { if (input.hit('KeyZ')) this.useSlot(0); if (input.hit('KeyX')) this.useSlot(1); }
    if (this.decoy && !this.on('decoy')) { this.decoy = null; this.showDecoy(false); }
    if (this.decoyRig) { this.decoyRig.pose({ speed: 0, look: 0, pitch: 0 }, dt); this.decoyRig.place(this.decoyPos, this.decoy.yaw, this.decoyPos.y); }
    this.uiT -= dt;
    if (this.uiT <= 0) { this.uiT = 0.2; this.draw(); }
  }
  draw() {
    const on = document.body.classList.contains('ingame') && !this.game.paused && !this.game.overlay;
    this.el.hidden = !on || !this.s.slots.length;
    if (this.el.hidden) return;
    // under the radar (and the Chat button, online)
    const cb = document.getElementById('netchatbtn'), mm = document.getElementById('minimap');
    const ref = cb && !cb.hidden && cb.offsetParent ? cb : mm;
    const r = ref ? ref.getBoundingClientRect() : null;
    if (r && r.height) { this.el.style.top = Math.round(r.bottom + 10) + 'px'; this.el.style.left = Math.round(r.left) + 'px'; }
    const keys = ['Z', 'X'], touch = this.game.app.input.touch;
    this.btns.forEach((b, i) => {
      const id = this.s.slots[i];
      b.hidden = !id;
      if (!id) return;
      const st = this.on(id) ? Math.ceil(this.left(id)) + 's' : this.rest(id) > 0 ? '⏳ ' + Math.ceil(this.rest(id)) + 's' : (touch ? '' : keys[i]);
      b.className = 'pw' + (this.on(id) ? ' on' : this.rest(id) > 0 ? ' rest' : '');
      const txt = t('pw.' + id) + (st ? ' · ' + st : '');
      if (b.textContent !== txt) b.textContent = txt;
    });
  }
  dispose() { this.showDecoy(false); this.el.remove(); }
}
