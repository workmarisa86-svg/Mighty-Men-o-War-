// All persistent data lives under the "blocks-" prefix so it never collides
// with other apps on the same github.io origin.
import { STORE_PREFIX, OLD_PREFIX } from './config.js';

// One-time move of this game's data from the old shared "blocks-" keys.
// Only data that is clearly this game's is moved (other apps on the same
// origin may use the same old prefix); the old keys are left alone.
(function migrate() {
  try {
    if (localStorage.getItem(STORE_PREFIX + 'migrated')) return;
    const get = (k) => { try { return JSON.parse(localStorage.getItem(OLD_PREFIX + k)); } catch { return null; } };
    const put = (k, v) => { if (localStorage.getItem(STORE_PREFIX + k) == null) localStorage.setItem(STORE_PREFIX + k, JSON.stringify(v)); };
    const st = get('settings');
    if (st && typeof st === 'object' && 'minimapSize' in st && 'renderDist' in st) put('settings', st);
    const idx = get('saves');
    if (Array.isArray(idx)) {
      const ours = idx.filter((m) => m && m.id && m.mode === 'war');
      const keep = [];
      for (const m of ours) { const d = get('save-' + m.id); if (d && d.cfg && d.cfg.seed != null && d.cfg.mode === 'war') { put('save-' + m.id, d); keep.push(m); } }
      if (keep.length) put('saves', keep);
    }
    const stats = get('stats');
    if (stats && stats.total && stats.byDiff) put('stats', stats);
    localStorage.setItem(STORE_PREFIX + 'migrated', '1');
  } catch { /* storage unavailable */ }
})();

export function load(key, def) {
  try {
    const v = localStorage.getItem(STORE_PREFIX + key);
    return v == null ? def : JSON.parse(v);
  } catch { return def; }
}
export function save(key, val) {
  try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(val)); return true; }
  catch (e) { console.warn('save failed', e); return false; }
}
export function remove(key) {
  try { localStorage.removeItem(STORE_PREFIX + key); } catch { /* ignore */ }
}

// ---- settings ---------------------------------------------------------------
export const DEFAULT_SETTINGS = {
  lang: (navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en',
  blood: true,
  renderDist: 6,
  quality: 'medium',
  volume: 0.7,
  sensitivity: 1.0,
  invertY: false,
  minimap: true,
  minimapSize: 'm',
  formation: 'loose',
  music: 0.45,
  musicMute: false,
  touchSize: 'm',
  perf: 'normal',      // 'smooth': shorter view and lighter effects for a steadier frame rate
};
export function loadSettings() { return Object.assign({}, DEFAULT_SETTINGS, load('settings', {})); }
export function saveSettings(s) { save('settings', s); }

// ---- world save slots -------------------------------------------------------
// Peace mode is gone: its saved worlds are deleted (nothing carries over).
(function dropPeaceWorlds() {
  try {
    const idx = load('saves', []);
    if (!Array.isArray(idx)) return;
    const peace = idx.filter((m) => m && m.mode === 'peace');
    if (!peace.length) return;
    for (const m of peace) remove('save-' + m.id);
    save('saves', idx.filter((m) => m && m.mode !== 'peace'));
  } catch { /* storage unavailable */ }
})();
export function listSaves() {
  const idx = load('saves', []);
  return idx.sort((a, b) => b.updated - a.updated);
}
export function readSave(id) { return load('save-' + id, null); }
export function writeSave(data) {
  const idx = load('saves', []).filter((m) => m.id !== data.id);
  const meta = {
    id: data.id, name: data.name, mode: data.cfg.mode, sub: data.cfg.sub,
    difficulty: data.cfg.difficulty, timeMode: data.cfg.timeMode || 'cycle', day: Math.floor(data.time || 0) + 1,
    gameType: data.cfg.gameType || 'open', mission: data.cfg.mission || null, v: data.v || 1,
    missionDone: data.mission ? data.mission.done && data.mission.result : null,
    created: data.created, updated: data.updated,
  };
  const ok = save('save-' + data.id, data);
  if (ok) { idx.push(meta); save('saves', idx); }
  return ok;
}
export function deleteAllSaves() {
  for (const m of load('saves', [])) remove('save-' + m.id);
  save('saves', []);
}
export function deleteSave(id) {
  remove('save-' + id);
  save('saves', load('saves', []).filter((m) => m.id !== id));
}

// ---- Town Life: one persistent world ----------------------------------------
// Two parts: the small state (player, money, farm, people...) written every
// autosave, and the world's block edits, written only when they changed.
// Before each write the previous save is kept as a backup; if the save can't
// be read, the backup is used instead.
const TS = 'town-state', TE = 'town-edits';
function raw(k) { try { return localStorage.getItem(STORE_PREFIX + k); } catch { return null; } }
function rawSet(k, v) { try { localStorage.setItem(STORE_PREFIX + k, v); return true; } catch (e) { console.warn('save failed', e); return false; } }
export function hasTown() { return raw(TS) != null || raw(TS + '-bak') != null; }
export function saveTown(state, edits) {
  const s = JSON.stringify(state);
  const prev = raw(TS);
  if (prev) rawSet(TS + '-bak', prev);
  if (edits != null) { const pe = raw(TE); if (pe != null) rawSet(TE + '-bak', pe); if (!rawSet(TE, edits)) return false; }
  else if (raw(TE + '-bak') == null && raw(TE) != null) rawSet(TE + '-bak', raw(TE));
  return rawSet(TS, s);
}
export function loadTown() {
  const read = (sk, ek) => { try { const st = JSON.parse(raw(sk)); if (!st || st.seed == null || !st.player) return null; return { state: st, edits: raw(ek) || '' }; } catch { return null; } };
  const cur = read(TS, TE);
  if (cur) return cur;
  const bak = read(TS + '-bak', TE + '-bak');
  if (bak) { bak.restored = true; return bak; }
  return null;
}
export function deleteTown() { for (const k of [TS, TE, TS + '-bak', TE + '-bak']) remove(k); }
