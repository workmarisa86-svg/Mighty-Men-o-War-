// Service worker for Mighty Men o' War. Registered as "./sw.js" with scope
// "./" (this repository's folder only). It only ever caches and answers
// requests for files inside that folder; every cache it owns is named
// "blocks-mmow-cache-<version>" and old ones with the "blocks-mmow-" prefix
// are removed. tools/stamp-version.mjs rewrites VERSION and FILES — bump
// GAME_VERSION in js/config.js and run it whenever files change.
const VERSION = '2.6.3';
const PREFIX = 'blocks-mmow-';
const CACHE = PREFIX + 'cache-' + VERSION;
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css?v=2.6.3",
  "./js/vendor/three.module.js?v=2.6.3",
  "./js/aimuse.js?v=2.6.3",
  "./js/animals.js?v=2.6.3",
  "./js/audio.js?v=2.6.3",
  "./js/battle.js?v=2.6.3",
  "./js/blocks.js?v=2.6.3",
  "./js/bubbles.js?v=2.6.3",
  "./js/cabin.js?v=2.6.3",
  "./js/campaign.js?v=2.6.3",
  "./js/campfire.js?v=2.6.3",
  "./js/characters.js?v=2.6.3",
  "./js/collide.js?v=2.6.3",
  "./js/config.js?v=2.6.3",
  "./js/context.js?v=2.6.3",
  "./js/countries.js?v=2.6.3",
  "./js/duel.js?v=2.6.3",
  "./js/explosives.js?v=2.6.3",
  "./js/farm.js?v=2.6.3",
  "./js/fishing.js?v=2.6.3",
  "./js/flashlight.js?v=2.6.3",
  "./js/folk.js?v=2.6.3",
  "./js/forts.js?v=2.6.3",
  "./js/frontier.js?v=2.6.3",
  "./js/frontierui.js?v=2.6.3",
  "./js/furniture.js?v=2.6.3",
  "./js/game.js?v=2.6.3",
  "./js/gunmodels.js?v=2.6.3",
  "./js/hidden.js?v=2.6.3",
  "./js/hiddengen.js?v=2.6.3",
  "./js/horses.js?v=2.6.3",
  "./js/houses.js?v=2.6.3",
  "./js/hud.js?v=2.6.3",
  "./js/i18n.js?v=2.6.3",
  "./js/injury.js?v=2.6.3",
  "./js/input.js?v=2.6.3",
  "./js/items.js?v=2.6.3",
  "./js/jailclip.js?v=2.6.3",
  "./js/main.js?v=2.6.3",
  "./js/manual.js?v=2.6.3",
  "./js/mapdata.js?v=2.6.3",
  "./js/merge.js?v=2.6.3",
  "./js/mesher.js?v=2.6.3",
  "./js/minimap.js?v=2.6.3",
  "./js/modes.js?v=2.6.3",
  "./js/music.js?v=2.6.3",
  "./js/nations.js?v=2.6.3",
  "./js/noise.js?v=2.6.3",
  "./js/orders.js?v=2.6.3",
  "./js/paratroops.js?v=2.6.3",
  "./js/particles.js?v=2.6.3",
  "./js/path.js?v=2.6.3",
  "./js/pens.js?v=2.6.3",
  "./js/pickups.js?v=2.6.3",
  "./js/player.js?v=2.6.3",
  "./js/raft.js?v=2.6.3",
  "./js/robbers.js?v=2.6.3",
  "./js/scope.js?v=2.6.3",
  "./js/signs.js?v=2.6.3",
  "./js/sky.js?v=2.6.3",
  "./js/soldiers.js?v=2.6.3",
  "./js/stats.js?v=2.6.3",
  "./js/storage.js?v=2.6.3",
  "./js/textures.js?v=2.6.3",
  "./js/thirdperson.js?v=2.6.3",
  "./js/town.js?v=2.6.3",
  "./js/towngen.js?v=2.6.3",
  "./js/townsfolk.js?v=2.6.3",
  "./js/townui.js?v=2.6.3",
  "./js/trades.js?v=2.6.3",
  "./js/travel.js?v=2.6.3",
  "./js/ui.js?v=2.6.3",
  "./js/vehicles.js?v=2.6.3",
  "./js/vehiclewar.js?v=2.6.3",
  "./js/viewmodel.js?v=2.6.3",
  "./js/warui.js?v=2.6.3",
  "./js/weapons.js?v=2.6.3",
  "./js/world.js?v=2.6.3",
  "./js/worldgen.js?v=2.6.3",
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
  "./img/town-card.webp",
  "./img/war-card.webp",
  "./audio/mightyman-menu-music.mp3",
  "./audio/mightyman-menu-music.ogg",
  "./fonts/alfa-slab-one.woff2"
];
const SCOPE = self.registration.scope;              // e.g. https://user.github.io/Mighty-Men-o-War-/
const mine = (url) => url.startsWith(SCOPE);

self.addEventListener('install', (e) => {
  // straight from the server (never the browser's own cache, which may still hold the old index.html)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(new URL(f, SCOPE).href, { cache: 'reload' })))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // only this game's own old caches; other apps' caches are never touched
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'version' && e.ports[0]) e.ports[0].postMessage(VERSION);    // the page offers a reload only for a newer version
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || !mine(req.url)) return;    // outside this folder: not ours, the network handles it
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const url = new URL(req.url);
    // the page itself: always the newest from the server when online (a stale saved
    // copy can never trap the app); the saved one only when offline
    if (req.mode === 'navigate') {
      try { const res = await fetch(req, { cache: 'no-store' }); if (res.ok) return res; } catch (err) { /* offline */ }
      const idx = await c.match(new URL('./index.html', SCOPE).href) || await c.match(SCOPE);
      if (idx) return idx;
      return fetch(req);
    }
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
