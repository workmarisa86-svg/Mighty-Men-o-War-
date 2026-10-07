// War, Stage 2: Battles. Twenty-five real World War II battles, simplified
// and original: the historical attacker and defender, the country where it
// happened and the weather of the battle in phases. Your side decides your
// role: as the attacker you land (by boat, plane or overland) and must take
// the headquarters; as the defender you hold your headquarters until the
// battle's time runs out while attack waves come in. A battle always starts
// fresh and nothing is saved; a won battle is marked Completed.
import { BATTLE, BATTLE_MINUTES, WEATHER, COUNTRY } from './countries.js';
import { DIFF } from './config.js';
import { load, save } from './storage.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';

export function battlesDone() { return load('battles', {}); }
function markDone(id) { const d = battlesDone(); d[id] = true; save('battles', d); }

export class Battle {
  constructor(game) {
    this.game = game;
    this.b = BATTLE[game.cfg.battle];
    this.role = game.cfg.side === this.b.att ? 'attack' : 'defend';
    this.len = BATTLE_MINUTES * 60;
    this.t = 0; this.done = false; this.waveT = 25; this.waves = 0;
    const d = game.cfg.difficulty;
    this.maxWaves = { beginner: 4, easy: 5, medium: 6, hard: 7, impossible: 8 }[d] || 6;
    this.need = Math.min(2, COUNTRY[this.b.c].hqs);
  }
  // the defender holds every headquarters at the start
  ownerOf() { return this.role === 'attack' ? 'enemy' : 'ally'; }
  plan() {
    const D = DIFF[this.game.cfg.difficulty] || DIFF.medium;
    if (this.role === 'attack') return { enemy: D.enemies + 6, ally: 14, followers: 14, noDispatch: false };
    return { enemy: 0, ally: D.allies + 6, followers: 6, noDispatch: true };
  }
  // the weather of the battle now: from one phase to the next with a smooth change
  weather() {
    const w = this.b.w, k = Math.min(1, this.t / this.len);
    let i = 0;
    while (i + 1 < w.length && w[i + 1][0] <= k) i++;
    const cur = WEATHER[w[i][1]], next = w[i + 1] ? WEATHER[w[i + 1][1]] : null;
    if (!next) return { a: cur, b: cur, mix: 0 };
    const span = 0.06, toNext = w[i + 1][0] - k;
    return { a: cur, b: next, mix: toNext < span ? 1 - toNext / span : 0 };
  }
  // where the defenders' home headquarters is (defend role)
  home() {
    if (!this.homeF) { const g = this.game, c = { x: g.world.W / 2, z: g.world.D / 2 }; this.homeF = g.forts.list.slice().sort((a, b) => Math.hypot(a.cx - c.x, a.cz - c.z) - Math.hypot(b.cx - c.x, b.cz - c.z))[0]; }
    return this.homeF;
  }
  update(dt) {
    if (this.done) return;
    const g = this.game, E = g.enemies;
    this.t += dt;
    if (this.role === 'attack') {
      const taken = g.forts.list.filter((f) => f.owner === 'ally').length;
      if (taken >= this.need) this.end(true);
      return;
    }
    // defending: waves march on your headquarters (by land, sea or air)
    const home = this.home();
    if (!home || home.owner !== 'ally') { this.end(false); return; }
    this.waveT -= dt;
    if (this.waveT <= 0 && this.waves < this.maxWaves) {
      this.waveT = this.len / (this.maxWaves + 1);
      this.waves++;
      const n = 5 + Math.min(4, this.waves);
      if (this.b.by === 'plane' && g.paratroops) g.paratroops.enemyDrop(home, Math.min(8, n));
      else {
        const at = this.b.by === 'boat' ? E.beachSpot() : E.farSpot(80, 'enemy', home.center, 95);
        if (at) E.missionSquad('enemy', n, at, { fort: home });
      }
      g.hud.alert(t('battle.wave', { n: this.waves, of: this.maxWaves }));
      sfx.siren();
    }
    if (this.t >= this.len) this.end(true);
  }
  timeLeft() { return Math.max(0, this.len - this.t); }
  playerDied() { if (!this.done) this.end(false); }
  end(win) {
    if (this.done) return;
    this.done = true;
    const g = this.game;
    if (win) { markDone(this.b.id); g.stats.battles = (g.stats.battles || 0) + 1; }
    g.flushStats();
    sfx[win ? 'done' : 'warn']();
    g.app.openPanel('battleEnd', { win, id: this.b.id });
  }
}
