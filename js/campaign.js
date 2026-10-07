// War, Stage 2: the Open World campaign across fourteen countries.
// Only the country you are in is loaded; every other country is a small
// record (who holds it, how many soldiers each side has there, who holds
// each of its headquarters, how much you fortified it). The war never
// sleeps: the enemy attacks your countries even while you are elsewhere.
// You get an alert and choose to defend (fly there) or stay; if you stay,
// the attack is decided from the numbers (soldiers on each side, plus a
// small bonus for the trenches, sandbags and wire you built there).
// Soldiers defeated in a country come back in another country their side
// holds and join its garrison; a side with nowhere left loses them.
import { COUNTRIES, COUNTRY, START_GARRISON, PLAYER_START, WIN_RULE, ATTACK_EVERY, WEATHER } from './countries.js';
import { DIFF } from './config.js';
import { B } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

const other = (side) => (side === 'allies' ? 'axis' : 'allies');

export function newCampaign(cfg) {
  const per = START_GARRISON[cfg.difficulty] || 12;
  const countries = {};
  for (const c of COUNTRIES) {
    const enemy = c.side !== cfg.side;
    // the enemy's garrisons grow with the difficulty; yours stay steady
    const n = Math.round(c.hqs * (enemy ? per : 10));
    countries[c.id] = { owner: c.side, gar: { allies: c.side === 'allies' ? n : 0, axis: c.side === 'axis' ? n : 0 }, hq: null, built: 0 };
  }
  return { countries, attackT: (ATTACK_EVERY[cfg.difficulty] || 900) * 0.6, attack: null, over: null, conquered: 0, log: [] };
}
export function startCountry(side) { return PLAYER_START[side] || 'uk'; }

export class Campaign {
  constructor(game, state) {
    this.game = game;
    this.cfg = game.cfg;
    this.side = this.cfg.side || 'allies';
    this.foe = other(this.side);
    this.state = state || newCampaign(this.cfg);
    this.id = this.cfg.country;
    this.checkT = 2;
    this.alertEl = null;
  }
  get here() { return this.state.countries[this.id]; }
  rec(id) { return this.state.countries[id]; }
  factionOf(side) { return side === this.side ? 'ally' : 'enemy'; }
  sideOf(faction) { return faction === 'ally' ? this.side : this.foe; }
  climate() { return WEATHER[COUNTRY[this.id].climate]; }

  // ---- this country's headquarters --------------------------------------
  ownerOf(f) {
    const r = this.here;
    const side = r.hq && r.hq[f.id] ? r.hq[f.id] : r.owner;
    return this.factionOf(side);
  }
  hqChanged(f) {
    const r = this.here, n = this.game.forts.list.length;
    if (!r.hq) r.hq = Array(n).fill(r.owner);
    r.hq[f.id] = f.owner === 'ally' ? this.side : f.owner === 'enemy' ? this.foe : r.hq[f.id];
  }
  // how many soldiers of each side to put in the field now (the rest wait as numbers)
  activeCount(faction, cap) {
    const n = this.here.gar[this.sideOf(faction)] || 0;
    return Math.min(n, cap);
  }
  // who is in the field when you arrive: the enemy's garrison up to the
  // field size, your HQs' garrison, and the soldiers you brought along
  plan(followers = 0) {
    const d = this.cfg.difficulty, gar = this.here.gar[this.side] || 0;
    const fol = Math.min(followers || 0, 16, gar);
    const ownHQ = this.game.forts.list.some((f) => f.owner === 'ally');
    const ally = ownHQ ? Math.min(gar, fieldCap(d, 'ally') + fol) : fol;
    return { enemy: this.activeCount('enemy', fieldCap(d, 'enemy')), ally, followers: fol };
  }
  // reserves left in this country beyond the soldiers in the field
  reserve(faction) {
    const alive = this.game.enemies.list.filter((s) => s.alive && s.faction === faction).length;
    return (this.here.gar[this.sideOf(faction)] || 0) - alive;
  }
  // a soldier was defeated here: he comes back in another country his side
  // holds (joining its garrison) or is gone. Returns true if a fresh soldier
  // from this country's reserves takes his place here.
  defeated(faction) {
    const side = this.sideOf(faction), r = this.here;
    r.gar[side] = Math.max(0, (r.gar[side] || 0) - 1);
    const to = this.fallback(side, this.id);
    if (to) this.rec(to).gar[side]++;
    return this.reserve(faction) > 0 && this.game.forts.list.some((f) => f.owner === faction);
  }
  // another country held by `side` (the strongest garrison takes them in)
  fallback(side, not) {
    const list = COUNTRIES.filter((c) => c.id !== not && this.rec(c.id).owner === side);
    if (!list.length) return null;
    return list.sort((a, b) => this.rec(b.id).gar[side] - this.rec(a.id).gar[side])[0].id;
  }
  owned(side) { return COUNTRIES.filter((c) => this.rec(c.id).owner === side); }

  // you arrived: an attack on this country that was waiting for you starts now
  arrived() {
    const A = this.state.attack;
    if (A && A.to === this.id && !A.live) { this.hideAlert(); this.attackHere(A); }
  }

  // ---- per frame ----------------------------------------------------------
  update(dt) {
    const g = this.game;
    if (this.state.over) return;
    // the strength of the player's own squad counts toward this country's garrison
    this.checkT -= dt;
    if (this.checkT <= 0) { this.checkT = 2; this.checkCountry(); }
    // the enemy's offensive
    this.state.attackT -= dt;
    if (this.state.attackT <= 0 && !this.state.attack) {
      this.state.attackT = (ATTACK_EVERY[this.cfg.difficulty] || 900) * (0.75 + Math.random() * 0.5);
      this.launchAttack();
    }
    const A = this.state.attack;
    if (A && !A.live) {
      A.t -= dt;
      if (A.t <= 0) this.resolve(A, false);
    }
    // a live attack here ends when its squads are gone
    if (A && A.live && !g.enemies.squads.some((q) => q.campaignAttack && q.members.some((m) => m.alive))) { this.state.attack = null; g.hud.toast(t('camp.attackBeaten', { name: t('cname.' + this.id) })); }
  }

  // all HQs here captured and few enemies left: the country is yours (and
  // the other way round)
  checkCountry() {
    const g = this.game, r = this.here, forts = g.forts.list;
    if (!forts.length) return;
    const mine = forts.every((f) => f.owner === 'ally'), theirs = forts.every((f) => f.owner === 'enemy');
    const foesHere = g.enemies.list.filter((s) => s.alive && s.faction === 'enemy' && !s.surrender).length;
    if (r.owner !== this.side && mine && foesHere <= 4) this.conquer(this.id);
    else if (r.owner === this.side && theirs) this.lose(this.id);
  }
  conquer(id) {
    const g = this.game, r = this.rec(id);
    r.owner = this.side; r.hq = null;
    // the enemy's soldiers still there leave for another of their countries
    const to = this.fallback(this.foe, id);
    if (to) this.rec(to).gar[this.foe] += r.gar[this.foe];
    r.gar[this.foe] = 0;
    if (id === this.id) for (const s of g.enemies.list) if (s.alive && s.faction === 'enemy') g.enemies.surrender(s, g.forts.nearest(s.pos, 'ally'));
    this.state.conquered++;
    g.stats.countries = (g.stats.countries || 0) + 1;
    g.hud.bigMessage(t('camp.conquered', { name: t('cname.' + id) }), t('camp.conqueredSub'));
    sfx.done();
    this.checkEnd();
  }
  lose(id) {
    const g = this.game, r = this.rec(id);
    r.owner = this.foe; r.hq = null;
    const to = this.fallback(this.side, id);
    if (to) this.rec(to).gar[this.side] += r.gar[this.side];
    r.gar[this.side] = 0;
    g.hud.bigMessage(t('camp.lost', { name: t('cname.' + id) }), t('camp.lostSub'));
    sfx.warn();
    this.checkEnd();
  }
  // victory: every enemy country conquered; defeat: every one of yours lost
  checkEnd() {
    const mine = this.owned(this.side).length, theirs = this.owned(this.foe).length;
    let over = null;
    if (WIN_RULE === 'all' && theirs === 0) over = 'win';
    if (mine === 0) over = 'lose';
    if (!over) return;
    this.state.over = over;
    this.game.app.openPanel('warEnd', { win: over === 'win' });
  }

  // ---- the enemy attacks one of your countries ----------------------------
  launchAttack() {
    const g = this.game;
    const from = this.owned(this.foe).filter((c) => this.rec(c.id).gar[this.foe] >= 12).sort((a, b) => this.rec(b.id).gar[this.foe] - this.rec(a.id).gar[this.foe])[0];
    const targets = this.owned(this.side);
    if (!from || !targets.length) return;
    const to = targets[Math.floor(Math.random() * targets.length)];
    const src = this.rec(from.id);
    const n = Math.max(8, Math.round(src.gar[this.foe] * (0.3 + Math.random() * 0.2)));
    src.gar[this.foe] -= n;
    const A = { from: from.id, to: to.id, n, t: 75, live: false };
    this.state.attack = A;
    if (to.id === this.id) { this.attackHere(A); return; }
    // somewhere else: alert, defend or stay
    g.hud.alert(t('camp.attackAlert', { from: t('cname.' + from.id), to: t('cname.' + to.id), n }));
    sfx.siren();
    this.showAlert(A);
  }
  // the attack lands here: squads march on your HQs from the far side of
  // the country (and paratroopers drop near them)
  attackHere(A) {
    const g = this.game, E = g.enemies;
    A.live = true;
    this.rec(A.to).gar[this.foe] = (this.rec(A.to).gar[this.foe] || 0) + A.n;
    const targets = g.forts.list.filter((f) => f.owner === 'ally');
    const groups = Math.min(3, Math.ceil(Math.min(A.n, 18) / 6));
    for (let i = 0; i < groups; i++) {
      const f = targets[i % Math.max(1, targets.length)];
      const at = E.farSpot(70, 'enemy', f ? f.center : null, 80) || E.farSpot(60, 'enemy');
      if (!at) continue;
      const sq = E.missionSquad('enemy', 6, at, f ? { fort: f } : { player: true, x: g.player.pos.x, z: g.player.pos.z });
      sq.campaignAttack = true;
    }
    if (targets.length && g.paratroops) g.paratroops.enemyDrop(targets[0], Math.min(6, A.n - groups * 6));
    g.hud.alert(t('camp.attackHere', { from: t('cname.' + A.from) }));
    sfx.siren();
  }
  showAlert(A) {
    this.hideAlert();
    const el = document.createElement('div'); el.id = 'warAlert';
    el.innerHTML = `<p>${t('camp.attackAlert', { from: t('cname.' + A.from), to: t('cname.' + A.to), n: A.n })}</p>
      <div class="row"><button class="btn small primary" data-a="defend">${t('camp.defend')}</button><button class="btn small" data-a="stay">${t('camp.stay')}</button></div>`;
    const act = (a) => { this.hideAlert(); if (a === 'defend') this.game.app.openPanel('worldmap', { focus: A.to, defend: true }); else this.resolve(A, false); };
    el.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) act(b.dataset.a); });
    el.addEventListener('touchstart', (e) => { const b = e.target.closest('[data-a]'); if (b) { e.preventDefault(); e.stopPropagation(); act(b.dataset.a); } }, { passive: false });
    document.getElementById('hud').appendChild(el);
    this.alertEl = el;
  }
  hideAlert() { if (this.alertEl) { this.alertEl.remove(); this.alertEl = null; } }
  // an attack decided from the numbers: your soldiers there (and what you
  // built) against the attackers, with a little luck
  resolve(A, quiet) {
    const g = this.game, r = this.rec(A.to);
    this.hideAlert();
    this.state.attack = null;
    if (r.owner !== this.side) { const to = this.fallback(this.foe, null); if (to) this.rec(to).gar[this.foe] += A.n; return; }
    const def = r.gar[this.side] * (1 + Math.min(0.3, r.built * 0.01)) * (0.85 + Math.random() * 0.3);
    const att = A.n * (0.85 + Math.random() * 0.3);
    if (att > def) {
      const left = Math.max(1, Math.round(A.n - def * 0.6));
      const survivors = Math.round(r.gar[this.side] * 0.3);
      r.gar[this.side] = 0;
      const to = this.fallback(this.side, A.to);
      if (to) this.rec(to).gar[this.side] += survivors;
      r.owner = this.foe; r.hq = null; r.gar[this.foe] = left;
      if (!quiet) { g.hud.bigMessage(t('camp.lost', { name: t('cname.' + A.to) }), t('camp.lostAuto')); sfx.warn(); }
      this.checkEnd();
    } else {
      r.gar[this.side] = Math.max(2, Math.round(r.gar[this.side] - att * 0.5));
      const to = this.fallback(this.foe, null);
      if (to) this.rec(to).gar[this.foe] += Math.round(A.n * 0.3);
      if (!quiet) { g.hud.toast(t('camp.held', { name: t('cname.' + A.to) })); sfx.done(); }
    }
  }

  // things you built in this country (trenches, sandbags, wire) give a small
  // bonus when an attack here is decided from the numbers
  noteBuilt(id) { if (id === B.SANDBAG || id === B.WIRE) this.here.built = Math.min(60, this.here.built + 1); }
  noteDug() { this.here.built = Math.min(60, this.here.built + 0.2); }

  // soldiers you can take along from here (some always stay as garrison)
  available() {
    const f = this.game.enemies.followers().length;
    return Math.max(0, Math.min(30, (this.here.gar[this.side] || 0) - 2, Math.max(f, (this.here.gar[this.side] || 0) - 4)));
  }
  dispose() { this.hideAlert(); }
}

// size of the active fields (soldiers animated near the player)
export function fieldCap(diff, faction) { const d = DIFF[diff] || DIFF.medium; return faction === 'enemy' ? d.enemies : d.allies; }
