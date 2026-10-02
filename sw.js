// Service worker: offline play. Scope is this folder only (registered as
// "./sw.js" with scope "./"); every cache name starts with "blocks-".
// tools/stamp-version.mjs rewrites VERSION and FILES — bump GAME_VERSION in
// js/config.js and run it whenever files change.
const VERSION = '0.6.1';
const CACHE = 'blocks-mmow-' + VERSION;
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css?v=0.6.1",
  "./js/animals.js?v=0.6.1",
  "./js/audio.js?v=0.6.1",
  "./js/blocks.js?v=0.6.1",
  "./js/cabin.js?v=0.6.1",
  "./js/campfire.js?v=0.6.1",
  "./js/characters.js?v=0.6.1",
  "./js/config.js?v=0.6.1",
  "./js/context.js?v=0.6.1",
  "./js/explosives.js?v=0.6.1",
  "./js/flashlight.js?v=0.6.1",
  "./js/forts.js?v=0.6.1",
  "./js/game.js?v=0.6.1",
  "./js/gunmodels.js?v=0.6.1",
  "./js/hud.js?v=0.6.1",
  "./js/i18n.js?v=0.6.1",
  "./js/input.js?v=0.6.1",
  "./js/items.js?v=0.6.1",
  "./js/logo.js?v=0.6.1",
  "./js/main.js?v=0.6.1",
  "./js/manual.js?v=0.6.1",
  "./js/merge.js?v=0.6.1",
  "./js/mesher.js?v=0.6.1",
  "./js/minimap.js?v=0.6.1",
  "./js/missions.js?v=0.6.1",
  "./js/music.js?v=0.6.1",
  "./js/noise.js?v=0.6.1",
  "./js/orders.js?v=0.6.1",
  "./js/particles.js?v=0.6.1",
  "./js/pickups.js?v=0.6.1",
  "./js/player.js?v=0.6.1",
  "./js/raft.js?v=0.6.1",
  "./js/scope.js?v=0.6.1",
  "./js/sky.js?v=0.6.1",
  "./js/soldiers.js?v=0.6.1",
  "./js/stats.js?v=0.6.1",
  "./js/storage.js?v=0.6.1",
  "./js/textures.js?v=0.6.1",
  "./js/ui.js?v=0.6.1",
  "./js/viewmodel.js?v=0.6.1",
  "./js/weapons.js?v=0.6.1",
  "./js/world.js?v=0.6.1",
  "./js/worldgen.js?v=0.6.1",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg",
  "./icons/logo.svg"
];
const CDN = ['https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(FILES);
    await Promise.all(CDN.map((u) => c.add(new Request(u, { mode: 'cors' })).catch(() => {})));
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('blocks-mmow-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const own = url.origin === location.origin && url.pathname.startsWith(new URL('./', location).pathname);
  const cdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com');
  if (!own && !cdn) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: own && !url.search.includes('v=') });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await c.match('./index.html') || await c.match('./'); if (idx) return idx; }
      throw err;
    }
  })());
});
