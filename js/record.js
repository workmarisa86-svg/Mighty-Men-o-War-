// Your record (Siege, alone and online; Town Life never counts): points for
// every kill (harder kills give more), points taken off when you are killed
// (by how), a level and a title from the points, and medals for each skill.
// Kept on this device for good. A level brings its title's colour on your name
// tag; from level 30 (Gunslinger) a third ability fits on screen.
import { t } from './i18n.js';
import { sfx } from './audio.js';

const KEY = 'blocks-mmow-record';
export const PTS = { outlaw: 10, head: 15, knife: 20, tknife: 30, dyn: 25, dynExtra: 20, long: 25, boss: 100, player: 50, wave: 30 };
// points off when you die, by how
const LOSS = { pShot: 25, pHead: 35, pKnife: 30, pDyn: 20, knife: 10, shot: 15, blast: 20, animal: 10, starve: 20, other: 10 };
export const TITLES = [[1, 'greenhorn', '#c8c0a8'], [5, 'drifter', '#b8d890'], [10, 'gunhand', '#80d8a0'], [15, 'deputy', '#80c8f0'], [20, 'marksman', '#8aa8ff'],
  [25, 'sharpshooter', '#b890ff'], [30, 'gunslinger', '#f090e0'], [35, 'desperado', '#ff9a6a'], [40, 'legend', '#ffd040'], [50, 'goat', '#ffffff']];
export const MEDALS = { sharp: { stat: 'heads', at: [10, 50, 150, 400, 1000] }, blade: { stat: 'knife', at: [5, 25, 75, 200, 500] }, demo: { stat: 'dyn', at: [5, 25, 75, 200, 500] },
  long: { stat: 'longs', at: [5, 25, 75, 200, 500] }, survivor: { stat: 'waves', at: [5, 15, 30, 60, 100] }, hunter: { stat: 'animals', at: [10, 50, 150, 400, 1000] } };
export const TIER = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
// points needed to reach level L (level 50, the GOAT, takes about 30 000)
export const needFor = (L) => Math.round(40 * Math.pow(Math.max(0, L - 1), 1.7));
export function levelOf(pts) { let L = 1; while (L < 50 && pts >= needFor(L + 1)) L++; return L; }
export function titleOf(L) { let T = TITLES[0]; for (const x of TITLES) if (L >= x[0]) T = x; return { id: T[1], color: T[2] }; }

function load() {
  const z = { pts: 0, outlaws: 0, heads: 0, knife: 0, dyn: 0, longs: 0, longest: 0, bosses: 0, players: 0, waves: 0, animals: 0, deaths: 0 };
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return Object.assign(z, s); } catch { /* private mode */ }
  return z;
}

export class Record {
  constructor(game) { this.game = game; this.s = load(); this.blast = null; }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.s)); } catch { /* private mode */ } }
  get level() { return levelOf(this.s.pts); }
  title() { return titleOf(this.level); }
  medal(id) { const M = MEDALS[id], n = this.s[M.stat] || 0; let k = -1; M.at.forEach((a, i) => { if (n >= a) k = i; }); return k; }
  add(n, why) {
    const L0 = this.level;
    this.s.pts = Math.max(0, this.s.pts + n);
    this.save();
    const L1 = this.level, g = this.game;
    if (L1 > L0) {
      const T = this.title();
      g.hud.bigMessage(t('rec.levelUp', { n: L1 }), t('rec.title.' + T.id) + (L1 >= 30 && L0 < 30 ? ' · ' + t('rec.thirdSlot') : ''));
      sfx.done();
    } else if (L1 < L0) g.hud.toast(t('rec.levelDown', { n: L1 }), 'warn');
    if (why && n) g.hud.toast((n > 0 ? '+' : '') + n + ' ' + t('rec.pts') + ' · ' + why, n > 0 ? 'kill' : 'warn');
  }
  // a kill of yours: how = { w: weapon ('revolver' | 'lever' | 'sniper' | 'knife' | 'tknife' | 'dynamite'), head, dist, blast }
  kill(kind, how = {}, boss = false) {
    const S = this.s, w = how.w || '';
    let n = kind === 'player' ? PTS.player : boss ? PTS.boss : PTS.outlaw;
    const why = [];
    if (kind === 'player') S.players++; else { S.outlaws++; if (boss) S.bosses++; }
    if (how.head && w !== 'knife' && w !== 'tknife' && w !== 'dynamite') { n += PTS.head; S.heads++; why.push(t('rec.why.head')); }
    if (w === 'knife') { n += PTS.knife; S.knife++; why.push(t('rec.why.knife')); }
    else if (w === 'tknife') { n += PTS.tknife; S.knife++; why.push(t('rec.why.tknife')); }
    else if (w === 'dynamite') {
      n += PTS.dyn; S.dyn++; why.push(t('rec.why.dyn'));
      // more than one in the same blast: a bonus for each extra one
      if (how.blast && this.blast === how.blast) { n += PTS.dynExtra; why.push(t('rec.why.multi')); }
      this.blast = how.blast || null;
    }
    if (w === 'sniper' && (how.dist || 0) > 80) { n += PTS.long; S.longs++; why.push(t('rec.why.long')); }
    if (how.dist) S.longest = Math.max(S.longest, Math.round(how.dist));
    this.add(n, why.join(', ') || t(kind === 'player' ? 'rec.why.player' : boss ? 'rec.why.boss' : 'rec.why.outlaw'));
  }
  wave() { this.s.waves++; this.add(PTS.wave, t('rec.why.wave')); }
  animal() { this.s.animals++; this.save(); }
  // you were killed: points off by how (by = { player: true/false, w, head })
  died(cause, by = null) {
    this.s.deaths++;
    let k = 'other';
    if (by && by.player) k = by.w === 'dynamite' ? 'pDyn' : by.w === 'knife' || by.w === 'tknife' ? 'pKnife' : by.head ? 'pHead' : 'pShot';
    else if (cause === 'knife') k = 'knife';
    else if (cause === 'shot' || cause === 'combat') k = 'shot';
    else if (cause === 'blast') k = 'blast';
    else if (cause === 'wolf' || cause === 'bear') k = 'animal';
    else if (cause === 'starve' || cause === 'hunger') k = 'starve';
    this.add(-LOSS[k], t('rec.why.died'));
  }
}
