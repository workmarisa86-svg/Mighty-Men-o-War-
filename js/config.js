// Global constants shared by every module.
export const GAME_VERSION = '1.4.1';
export const SAVE_FORMAT = 4;      // 4: the 14-country campaign; older War saves can't be converted
// every saved key: blocks-mmow-… (unique to this game on the shared github.io origin)
export const STORE_PREFIX = 'blocks-mmow-';
export const OLD_PREFIX = 'blocks-';

export const CHUNK = 16;          // chunk width/depth in blocks
export const WORLD_H = 64;        // world height in blocks
export const SEA = 26;            // water surface: water blocks occupy y < SEA

export const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'impossible'];

// Difficulty controls the number of enemy soldiers, how aggressive their
// attacks are (squad size and how often they leave) and how scarce food is;
// camp / guards / patrol: soldiers resting, on watch and walking each fort.


export const WAR_SIZE = 256;          // one world size for every difficulty
export const DIFF = {
  beginner:   { size: 256, enemies: 10, allies: 16, animals: 1.6, animalRespawn: 60,  forts: 9, camp: 2, guards: 1, patrol: 0 },
  easy:       { size: 256, enemies: 14, allies: 14, animals: 1.3, animalRespawn: 90,  forts: 9, camp: 2, guards: 1, patrol: 2 },
  medium:     { size: 256, enemies: 20, allies: 12, animals: 1.0, animalRespawn: 130, forts: 9, camp: 3, guards: 2, patrol: 2 },
  hard:       { size: 256, enemies: 28, allies: 10, animals: 0.7, animalRespawn: 200, forts: 9, camp: 3, guards: 2, patrol: 2 },
  impossible: { size: 256, enemies: 38, allies: 9,  animals: 0.45, animalRespawn: 300, forts: 9, camp: 4, guards: 2, patrol: 3 },
};

export const DAY_SECONDS = 20 * 60;   // real seconds per in-game day (War mode)

export const QUALITY = {
  low:    { pixelRatio: 0.7, rain: 500,  particles: 0.4, ao: false, animated: 8, detail: 18 },
  medium: { pixelRatio: 1.0, rain: 1100, particles: 0.7, ao: true, animated: 16, detail: 30 },
  high:   { pixelRatio: 2.0, rain: 1800, particles: 1.0, ao: true, animated: 32, detail: 45 },
};

// animated: how many of the nearest soldiers get full every-frame animation;
// detail: distance (blocks) within which soldiers show their kit and faces.
// Player body and movement, measured in blocks. Blocks are ~12% smaller than
// the original 1 block = 1 metre scale, so the body is ~13% larger in block
// units and speeds/jump/reach are scaled to match (still fits 2-block gaps).
export const BODY = {
  halfWidth: 0.33, height: 1.9, crouchHeight: 1.6, eye: 1.78, crouchEye: 1.42,
  walk: 4.9, run: 7.5, runRain: 5.9, crouch: 1.8, swim: 2.5, swimRain: 1.8,
  fly: 10.2, flyRun: 20, raft: 3.4,
  gravity: 31, jump: 9.3, climb: 3.8, terminal: 44, safeFall: 16,
  reach: 5.6, digSpeed: 1.13, stride: 2.6,
};

// Town Life's world size and layout version (a save from an older layout
// keeps the player's coins, honor, belongings and stats, but the world
// itself is made anew). Here so the menus need none of Town Life's code.
export const TOWN_SIZE = 256;
export const TOWN_LAYOUT = 4;
