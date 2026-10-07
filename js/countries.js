// War, Stage 2: the fourteen countries (each its own world), their fixed
// climates and landscapes, and the 25 historical battles.
// Names on the world map use WWII-era names. Weather never changes in the
// Open World (each country has one climate); battles follow the weather of
// the real battle in scripted phases.

// side: who holds it at the start; hqs: how many headquarters; coast: can be
// reached by boat (beach landing) as well as by plane.
export const COUNTRIES = [
  { id: 'us', side: 'allies', hqs: 5, coast: true, climate: 'clear', land: 'prairie' },
  { id: 'su', side: 'allies', hqs: 5, coast: true, climate: 'lightSnow', land: 'steppeSnow' },
  { id: 'cn', side: 'allies', hqs: 4, coast: true, climate: 'lightRain', land: 'rice' },
  { id: 'uk', side: 'allies', hqs: 2, coast: true, climate: 'drizzle', land: 'meadow' },
  { id: 'ca', side: 'allies', hqs: 3, coast: true, climate: 'gentleSnow', land: 'taiga' },
  { id: 'au', side: 'allies', hqs: 3, coast: true, climate: 'hotClear', land: 'outback' },
  { id: 'in', side: 'allies', hqs: 4, coast: true, climate: 'monsoon', land: 'jungle' },
  { id: 'de', side: 'axis', hqs: 4, coast: true, climate: 'overcast', land: 'forest' },
  { id: 'it', side: 'axis', hqs: 3, coast: true, climate: 'sunny', land: 'olive' },
  { id: 'jp', side: 'axis', hqs: 4, coast: true, climate: 'partly', land: 'volcanic' },
  { id: 'fr', side: 'axis', hqs: 3, coast: true, climate: 'overcast', land: 'bocage', occupied: true },
  { id: 'pl', side: 'axis', hqs: 2, coast: false, climate: 'lightSnow', land: 'plainsSnow', occupied: true },
  { id: 'no', side: 'axis', hqs: 2, coast: true, climate: 'heavySnow', land: 'fjord', occupied: true },
  { id: 'gr', side: 'axis', hqs: 2, coast: true, climate: 'bright', land: 'rocky', occupied: true },
];
export const COUNTRY = Object.fromEntries(COUNTRIES.map((c, i) => [c.id, Object.assign(c, { index: i })]));

// Weather kinds. precip: none | rain | snow; amount 0..1; cloud dims the
// sun; fog shortens long views; sun: bright sun gives sharper shadows.
export const WEATHER = {
  clear: { precip: 'none', amount: 0, cloud: 0.05, fog: 0, icon: '☀' },
  hotClear: { precip: 'none', amount: 0, cloud: 0, fog: 0.08, sun: 'bright', dust: true, icon: '☀' },
  bright: { precip: 'none', amount: 0, cloud: 0, fog: 0, sun: 'bright', icon: '☀' },
  sunny: { precip: 'none', amount: 0, cloud: 0.05, fog: 0, sun: 'bright', icon: '☀' },
  partly: { precip: 'none', amount: 0, cloud: 0.35, fog: 0.05, icon: '⛅' },
  overcast: { precip: 'none', amount: 0, cloud: 0.6, fog: 0.12, icon: '☁' },
  drizzle: { precip: 'rain', amount: 0.3, cloud: 0.65, fog: 0.2, icon: '🌦' },
  lightRain: { precip: 'rain', amount: 0.4, cloud: 0.55, fog: 0.18, icon: '🌧' },
  rain: { precip: 'rain', amount: 0.65, cloud: 0.75, fog: 0.3, icon: '🌧' },
  monsoon: { precip: 'rain', amount: 0.8, cloud: 0.8, fog: 0.35, icon: '🌧' },
  storm: { precip: 'rain', amount: 1, cloud: 0.9, fog: 0.4, thunder: true, icon: '⛈' },
  lightSnow: { precip: 'snow', amount: 0.35, cloud: 0.55, fog: 0.2, icon: '🌨' },
  gentleSnow: { precip: 'snow', amount: 0.3, cloud: 0.5, fog: 0.15, icon: '🌨' },
  heavySnow: { precip: 'snow', amount: 0.8, cloud: 0.8, fog: 0.4, icon: '❄' },
  blizzard: { precip: 'snow', amount: 1, cloud: 0.9, fog: 0.6, icon: '❄' },
  sleet: { precip: 'rain', amount: 0.5, cloud: 0.75, fog: 0.3, icon: '🌨' },
  fog: { precip: 'none', amount: 0, cloud: 0.7, fog: 0.75, icon: '🌫' },
  haze: { precip: 'none', amount: 0, cloud: 0.3, fog: 0.4, icon: '🌫' },
  smoke: { precip: 'none', amount: 0, cloud: 0.45, fog: 0.5, smoke: true, icon: '🌫' },
  dust: { precip: 'none', amount: 0, cloud: 0.15, fog: 0.35, sun: 'bright', dust: true, icon: '☀' },
  ash: { precip: 'none', amount: 0, cloud: 0.35, fog: 0.4, ashfall: true, icon: '🌫' },
  windy: { precip: 'none', amount: 0, cloud: 0.4, fog: 0.1, icon: '⛅' },
};

// Landscapes. ground: the look of the land (repainted tiles, see textures.js);
// hills: how rolling; water: river and lake amounts; trees: per-block
// chance and kind; fields: farmland patches; rock: bare stone patches;
// frozen: rivers and lakes are ice; rice: flooded paddies.
export const LANDS = {
  prairie: { ground: 'grass', hills: 2.5, river: 0.03, lake: 0.45, trees: 0.004, tree: 'oak', fields: 0.25, rock: 0 },
  steppeSnow: { ground: 'snow', hills: 2, river: 0.03, lake: 0.46, trees: 0.003, tree: 'pine', fields: 0.05, rock: 0, frozen: true },
  rice: { ground: 'lush', hills: 4.5, river: 0.04, lake: 0.44, trees: 0.004, tree: 'oak', fields: 0.1, rice: 0.22, rock: 0 },
  meadow: { ground: 'grass', hills: 3, river: 0.03, lake: 0.46, trees: 0.006, tree: 'oak', fields: 0.15, rock: 0, mud: 0.25 },
  taiga: { ground: 'snow', hills: 3, river: 0.03, lake: 0.36, trees: 0.02, tree: 'pine', fields: 0, rock: 0.05, frozen: true },
  outback: { ground: 'red', hills: 1.5, river: 0.012, lake: 0.6, trees: 0.0025, tree: 'scrub', fields: 0, rock: 0.08 },
  jungle: { ground: 'jungle', hills: 3.5, river: 0.035, lake: 0.45, trees: 0.03, tree: 'jungle', fields: 0, rock: 0, mud: 0.3 },
  forest: { ground: 'grass', hills: 3, river: 0.03, lake: 0.46, trees: 0.014, tree: 'pine', fields: 0.2, rock: 0 },
  olive: { ground: 'dry', hills: 5, river: 0.018, lake: 0.55, trees: 0.006, tree: 'olive', fields: 0.05, rock: 0.2 },
  volcanic: { ground: 'ash', hills: 5.5, river: 0.02, lake: 0.5, trees: 0.003, tree: 'pine', fields: 0, rock: 0.35 },
  bocage: { ground: 'grass', hills: 2, river: 0.03, lake: 0.48, trees: 0.004, tree: 'oak', fields: 0.3, rock: 0, hedges: true, orchard: true },
  plainsSnow: { ground: 'snow', hills: 1.2, river: 0.03, lake: 0.48, trees: 0.004, tree: 'birch', fields: 0.3, rock: 0, frozen: true, mud: 0.2 },
  fjord: { ground: 'snow', hills: 8, river: 0.05, lake: 0.4, trees: 0.012, tree: 'pine', fields: 0, rock: 0.4, frozen: false },
  rocky: { ground: 'dry', hills: 5, river: 0.012, lake: 0.6, trees: 0.002, tree: 'scrub', fields: 0, rock: 0.45 },
};

// how many soldiers each side has in a country at the start (per HQ)
export const START_GARRISON = { beginner: 8, easy: 10, medium: 12, hard: 14, impossible: 16 };
export const PLAYER_START = { allies: 'uk', axis: 'de' };
// Winning: 'all' = conquer every enemy country (the one easy-to-change rule)
export const WIN_RULE = 'all';
// how often (real seconds) the enemy launches an attack on one of your countries
export const ATTACK_EVERY = { beginner: 1500, easy: 1200, medium: 900, hard: 700, impossible: 500 };

// The 25 battles, five per difficulty. Each has the real attacker and
// defender, where it happened, how the player arrives as the attacker, and
// the weather of the battle in phases (t: share of the battle's length).
export const BATTLE_MINUTES = 14;
export const BATTLES = [
  // Beginner
  { id: 'poland', d: 'beginner', c: 'pl', date: '1939', att: 'axis', by: 'land', w: [[0, 'dust'], [0.75, 'rain']] },
  { id: 'norway', d: 'beginner', c: 'no', date: '1940', att: 'axis', by: 'boat', w: [[0, 'heavySnow'], [0.35, 'sleet'], [0.7, 'overcast']] },
  { id: 'greece', d: 'beginner', c: 'gr', date: '1941', att: 'axis', by: 'land', w: [[0, 'bright']] },
  { id: 'dieppe', d: 'beginner', c: 'fr', date: '1942', att: 'allies', by: 'boat', w: [[0, 'haze'], [0.2, 'overcast']] },
  { id: 'pearl', d: 'beginner', c: 'us', date: '1941', att: 'axis', by: 'plane', w: [[0, 'partly']] },
  // Easy
  { id: 'france', d: 'easy', c: 'fr', date: '1940', att: 'axis', by: 'land', w: [[0, 'hotClear']] },
  { id: 'britain', d: 'easy', c: 'uk', date: '1940', att: 'axis', by: 'plane', w: [[0, 'clear'], [0.5, 'overcast'], [0.7, 'drizzle']] },
  { id: 'darwin', d: 'easy', c: 'au', date: '1942', att: 'axis', by: 'plane', w: [[0, 'clear'], [0.55, 'overcast'], [0.7, 'storm']] },
  { id: 'sicily', d: 'easy', c: 'it', date: '1943', att: 'allies', by: 'boat', w: [[0, 'storm'], [0.3, 'windy'], [0.55, 'sunny']] },
  { id: 'shanghai', d: 'easy', c: 'cn', date: '1937', att: 'axis', by: 'boat', w: [[0, 'haze'], [0.3, 'lightRain'], [0.6, 'haze'], [0.8, 'lightRain']] },
  // Medium
  { id: 'moscow', d: 'medium', c: 'su', date: '1941', att: 'axis', by: 'land', w: [[0, 'rain'], [0.4, 'sleet'], [0.6, 'heavySnow']] },
  { id: 'imphal', d: 'medium', c: 'in', date: '1944', att: 'axis', by: 'land', w: [[0, 'monsoon'], [0.5, 'fog'], [0.7, 'monsoon']] },
  { id: 'anzio', d: 'medium', c: 'it', date: '1944', att: 'allies', by: 'boat', w: [[0, 'rain'], [0.6, 'overcast'], [0.8, 'partly']] },
  { id: 'dday', d: 'medium', c: 'fr', date: '1944', att: 'allies', by: 'boat', w: [[0, 'windy'], [0.15, 'overcast']] },
  { id: 'wuhan', d: 'medium', c: 'cn', date: '1938', att: 'axis', by: 'land', w: [[0, 'haze'], [0.25, 'rain'], [0.6, 'storm']] },
  // Hard
  { id: 'cassino', d: 'hard', c: 'it', date: '1944', att: 'allies', by: 'land', w: [[0, 'rain'], [0.3, 'sleet'], [0.5, 'fog'], [0.75, 'partly']] },
  { id: 'leningrad', d: 'hard', c: 'su', date: '1941–44', att: 'axis', by: 'land', w: [[0, 'heavySnow'], [0.4, 'blizzard'], [0.7, 'heavySnow']] },
  { id: 'iwojima', d: 'hard', c: 'jp', date: '1945', att: 'allies', by: 'boat', w: [[0, 'ash'], [0.5, 'windy'], [0.65, 'lightRain'], [0.8, 'ash']] },
  { id: 'bulge', d: 'hard', c: 'fr', date: '1944–45', att: 'axis', by: 'land', w: [[0, 'fog'], [0.35, 'heavySnow'], [0.7, 'clear']], cold: true },
  { id: 'kursk', d: 'hard', c: 'su', date: '1943', att: 'axis', by: 'land', w: [[0, 'dust'], [0.6, 'storm'], [0.8, 'dust']], summer: true },
  // Impossible
  { id: 'stalingrad', d: 'impossible', c: 'su', date: '1942–43', att: 'axis', by: 'land', w: [[0, 'rain'], [0.3, 'heavySnow'], [0.6, 'blizzard']] },
  { id: 'okinawa', d: 'impossible', c: 'jp', date: '1945', att: 'allies', by: 'boat', w: [[0, 'rain'], [0.3, 'fog'], [0.5, 'storm'], [0.8, 'rain']] },
  { id: 'berlin', d: 'impossible', c: 'de', date: '1945', att: 'allies', by: 'land', w: [[0, 'smoke']] },
  { id: 'rhine', d: 'impossible', c: 'de', date: '1945', att: 'allies', by: 'boat', w: [[0, 'fog'], [0.25, 'smoke'], [0.5, 'clear']] },
  { id: 'barbarossa', d: 'impossible', c: 'su', date: '1941', att: 'axis', by: 'land', w: [[0, 'dust']], summer: true },
];
export const BATTLE = Object.fromEntries(BATTLES.map((b) => [b.id, b]));
