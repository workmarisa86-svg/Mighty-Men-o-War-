// Service worker for Mighty Man o' War. Registered as "./sw.js" with scope
// "./" (this repository's folder only). It only ever caches and answers
// requests for files inside that folder; every cache it owns is named
// "blocks-mmow-cache-<version>" and old ones with the "blocks-mmow-" prefix
// are removed. tools/stamp-version.mjs rewrites VERSION and FILES — bump
// GAME_VERSION in js/config.js and run it whenever files change.
const VERSION = '0.6.4';
const PREFIX = 'blocks-mmow-';
const CACHE = PREFIX + 'cache-' + VERSION;
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css?v=0.6.4",
  "./js/vendor/three.module.js?v=0.6.4",
  "./js/animals.js?v=0.6.4",
  "./js/audio.js?v=0.6.4",
  "./js/blocks.js?v=0.6.4",
  "./js/cabin.js?v=0.6.4",
  "./js/campfire.js?v=0.6.4",
  "./js/characters.js?v=0.6.4",
  "./js/config.js?v=0.6.4",
  "./js/context.js?v=0.6.4",
  "./js/explosives.js?v=0.6.4",
  "./js/flashlight.js?v=0.6.4",
  "./js/forts.js?v=0.6.4",
  "./js/game.js?v=0.6.4",
  "./js/gunmodels.js?v=0.6.4",
  "./js/hud.js?v=0.6.4",
  "./js/i18n.js?v=0.6.4",
  "./js/input.js?v=0.6.4",
  "./js/items.js?v=0.6.4",
  "./js/main.js?v=0.6.4",
  "./js/manual.js?v=0.6.4",
  "./js/merge.js?v=0.6.4",
  "./js/mesher.js?v=0.6.4",
  "./js/minimap.js?v=0.6.4",
  "./js/missions.js?v=0.6.4",
  "./js/music.js?v=0.6.4",
  "./js/noise.js?v=0.6.4",
  "./js/orders.js?v=0.6.4",
  "./js/particles.js?v=0.6.4",
  "./js/pickups.js?v=0.6.4",
  "./js/player.js?v=0.6.4",
  "./js/raft.js?v=0.6.4",
  "./js/scope.js?v=0.6.4",
  "./js/sky.js?v=0.6.4",
  "./js/soldiers.js?v=0.6.4",
  "./js/stats.js?v=0.6.4",
  "./js/storage.js?v=0.6.4",
  "./js/textures.js?v=0.6.4",
  "./js/ui.js?v=0.6.4",
  "./js/viewmodel.js?v=0.6.4",
  "./js/weapons.js?v=0.6.4",
  "./js/world.js?v=0.6.4",
  "./js/worldgen.js?v=0.6.4",
  "./icons/mightyman-favicon.ico",
  "./icons/mightyman-icon-128.png",
  "./icons/mightyman-icon-144.png",
  "./icons/mightyman-icon-16.png",
  "./icons/mightyman-icon-180.png",
  "./icons/mightyman-icon-192.png",
  "./icons/mightyman-icon-256.png",
  "./icons/mightyman-icon-32.png",
  "./icons/mightyman-icon-384.png",
  "./icons/mightyman-icon-48.png",
  "./icons/mightyman-icon-512.png",
  "./icons/mightyman-icon-64.png",
  "./icons/mightyman-icon-96.png",
  "./icons/mightyman-maskable-192.png",
  "./icons/mightyman-maskable-512.png",
  "./img/mightyman-hero-1280.jpg",
  "./img/mightyman-hero-1280.webp",
  "./img/mightyman-hero-1920.webp",
  "./img/mightyman-hero-640.webp",
  "./img/mightyman-hero-placeholder.webp",
  "./audio/mightyman-menu-music.mp3",
  "./audio/mightyman-menu-music.ogg"
];
const SCOPE = self.registration.scope;              // e.g. https://user.github.io/Mighty-Men-o-War-/
const mine = (url) => url.startsWith(SCOPE);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new URL(f, SCOPE).href))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // only this game's own old caches; other apps' caches are never touched
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !mine(req.url)) return;    // outside this folder: not ours, the network handles it
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const url = new URL(req.url);
    const hit = await c.match(req, { ignoreSearch: !url.search.includes('v=') });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') c.put(req, res.clone());
      return res;
    } catch (err) {
      if (req.mode === 'navigate') { const idx = await c.match(new URL('./index.html', SCOPE).href) || await c.match(SCOPE); if (idx) return idx; }
      throw err;
    }
  })());
});
