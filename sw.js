// Service worker for Mighty Men o' War. Registered as "./sw.js" with scope
// "./" (this repository's folder only). It only ever caches and answers
// requests for files inside that folder; every cache it owns is named
// "blocks-mmow-cache-<version>" and old ones with the "blocks-mmow-" prefix
// are removed. tools/stamp-version.mjs rewrites VERSION and FILES — bump
// GAME_VERSION in js/config.js and run it whenever files change.
const VERSION = '1.2.2';
const PREFIX = 'blocks-mmow-';
const CACHE = PREFIX + 'cache-' + VERSION;
const FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css?v=1.2.2",
  "./js/vendor/three.module.js?v=1.2.2",
  "./js/aimuse.js?v=1.2.2",
  "./js/animals.js?v=1.2.2",
  "./js/audio.js?v=1.2.2",
  "./js/battle.js?v=1.2.2",
  "./js/blocks.js?v=1.2.2",
  "./js/bubbles.js?v=1.2.2",
  "./js/cabin.js?v=1.2.2",
  "./js/campaign.js?v=1.2.2",
  "./js/campfire.js?v=1.2.2",
  "./js/characters.js?v=1.2.2",
  "./js/collide.js?v=1.2.2",
  "./js/config.js?v=1.2.2",
  "./js/context.js?v=1.2.2",
  "./js/countries.js?v=1.2.2",
  "./js/explosives.js?v=1.2.2",
  "./js/farm.js?v=1.2.2",
  "./js/flashlight.js?v=1.2.2",
  "./js/folk.js?v=1.2.2",
  "./js/forts.js?v=1.2.2",
  "./js/game.js?v=1.2.2",
  "./js/gunmodels.js?v=1.2.2",
  "./js/horses.js?v=1.2.2",
  "./js/hud.js?v=1.2.2",
  "./js/i18n.js?v=1.2.2",
  "./js/input.js?v=1.2.2",
  "./js/items.js?v=1.2.2",
  "./js/main.js?v=1.2.2",
  "./js/manual.js?v=1.2.2",
  "./js/mapdata.js?v=1.2.2",
  "./js/merge.js?v=1.2.2",
  "./js/mesher.js?v=1.2.2",
  "./js/minimap.js?v=1.2.2",
  "./js/music.js?v=1.2.2",
  "./js/nations.js?v=1.2.2",
  "./js/noise.js?v=1.2.2",
  "./js/orders.js?v=1.2.2",
  "./js/paratroops.js?v=1.2.2",
  "./js/particles.js?v=1.2.2",
  "./js/path.js?v=1.2.2",
  "./js/pickups.js?v=1.2.2",
  "./js/player.js?v=1.2.2",
  "./js/raft.js?v=1.2.2",
  "./js/scope.js?v=1.2.2",
  "./js/sky.js?v=1.2.2",
  "./js/soldiers.js?v=1.2.2",
  "./js/stats.js?v=1.2.2",
  "./js/storage.js?v=1.2.2",
  "./js/textures.js?v=1.2.2",
  "./js/town.js?v=1.2.2",
  "./js/towngen.js?v=1.2.2",
  "./js/townsfolk.js?v=1.2.2",
  "./js/townui.js?v=1.2.2",
  "./js/travel.js?v=1.2.2",
  "./js/ui.js?v=1.2.2",
  "./js/vehicles.js?v=1.2.2",
  "./js/viewmodel.js?v=1.2.2",
  "./js/warui.js?v=1.2.2",
  "./js/weapons.js?v=1.2.2",
  "./js/world.js?v=1.2.2",
  "./js/worldgen.js?v=1.2.2",
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
