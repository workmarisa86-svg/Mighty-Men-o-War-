// All persistent data lives under the "blocks-" prefix so it never collides
// with other apps on the same github.io origin.
import { STORE_PREFIX } from './config.js';

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
  music: 0.5,
  musicMute: false,
  touchSize: 'm',
};
export function loadSettings() { return Object.assign({}, DEFAULT_SETTINGS, load('settings', {})); }
export function saveSettings(s) { save('settings', s); }

// ---- world save slots -------------------------------------------------------
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
