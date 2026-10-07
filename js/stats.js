// Lifetime statistics across all worlds (stored as "blocks-stats").
// War statistics are kept per difficulty level.
import { load, save, remove } from './storage.js';

const BLANK = () => ({ days: 0, fortsCaptured: 0, fortsLost: 0, enemies: 0, animals: 0, longestAlone: 0, missions: 0, gold: 0, silver: 0, bronze: 0, countries: 0, battles: 0, played: 0 });
// Peace mode is gone: its mission medals are dropped
const PEACE_MISSIONS = ['shack', 'hunter', 'explore', 'bridgeb'];
export function loadStats() {
  const s = load('stats', null) || {};
  const best = s.best || {};
  for (const k of Object.keys(best)) if (PEACE_MISSIONS.includes(k.split(':')[0])) delete best[k];
  return { total: Object.assign(BLANK(), s.total), byDiff: s.byDiff || {}, best };
}
export function resetStats() { remove('stats'); }
// add a game's progress since the last flush
export function addStats(diff, delta, maxes = {}) {
  const s = loadStats();
  const d = diff ? (s.byDiff[diff] = Object.assign(BLANK(), s.byDiff[diff])) : null;
  for (const [k, v] of Object.entries(delta)) { if (!v) continue; s.total[k] += v; if (d) d[k] += v; }
  for (const [k, v] of Object.entries(maxes)) { s.total[k] = Math.max(s.total[k], v); if (d) d[k] = Math.max(d[k], v); }
  save('stats', s);
  return s;
}
export function recordMission(diff, id, medal) {
  const s = addStats(diff, { missions: 1, [medal]: 1 });
  const key = id + (diff ? ':' + diff : '');
  const rank = { bronze: 1, silver: 2, gold: 3 };
  if ((rank[medal] || 0) > (rank[s.best[key]] || 0)) { s.best[key] = medal; save('stats', s); }
}
export function bestMedal(id, diff) { return loadStats().best[id + (diff ? ':' + diff : '')] || null; }
