// Global constants shared by every module.
export const GAME_VERSION = '0.1.0';
export const SAVE_FORMAT = 1;
export const STORE_PREFIX = 'blocks-';

export const CHUNK = 16;          // chunk width/depth in blocks
export const WORLD_H = 64;        // world height in blocks
export const SEA = 26;            // water surface: water blocks occupy y < SEA

export const DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'impossible'];

// Difficulty controls enemy count, food scarcity and fort spacing (via world size).
export const DIFF = {
  beginner:   { size: 192, enemies: 6,  animals: 1.6, animalRespawn: 60,  forts: 7 },
  easy:       { size: 224, enemies: 10, animals: 1.3, animalRespawn: 90,  forts: 8 },
  medium:     { size: 256, enemies: 16, animals: 1.0, animalRespawn: 130, forts: 9 },
  hard:       { size: 320, enemies: 24, animals: 0.7, animalRespawn: 200, forts: 11 },
  impossible: { size: 384, enemies: 34, animals: 0.45, animalRespawn: 300, forts: 13 },
};
export const PEACE_SIZE = 256;

export const DAY_SECONDS = 20 * 60;   // real seconds per in-game day (War mode)

export const QUALITY = {
  low:    { pixelRatio: 0.7, rain: 500,  particles: 0.4, ao: false },
  medium: { pixelRatio: 1.0, rain: 1100, particles: 0.7, ao: true },
  high:   { pixelRatio: 2.0, rain: 1800, particles: 1.0, ao: true },
};
