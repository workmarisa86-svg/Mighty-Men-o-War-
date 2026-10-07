// Item definitions, field recipes and (procedurally drawn) item icons.
import { B } from './blocks.js';
import { buildAtlas, cubeIcon } from './textures.js';

export const ITEMS = {
  shovel: { tool: 'shovel' },
  flint: { tool: 'flint' },
  knife: { weapon: true }, pistol: { weapon: true }, rifle: { weapon: true },
  sniper: { weapon: true }, smg: { weapon: true },
  grenade: { throwable: true }, smoke: { throwable: true },
  dirt: { block: B.DIRT, tiles: ['dirt_top', 'dirt'] },
  wood: { block: B.WOOD, tiles: ['planks', 'planks'] },
  stone: { block: B.STONE, tiles: ['stone', 'stone'] },
  iron: { block: B.IRON, tiles: ['iron', 'iron'] },
  tnt: { block: B.TNT, tiles: ['tnt_top', 'tnt_side'] },
  sandbag: { block: B.SANDBAG, tiles: ['sandbag_top', 'sandbag'] },
  wire: { block: B.WIRE, flat: 'wire' },
  raft: { place: 'raft' },
  watchtower: { place: 'watchtower' },
  meat_raw: { food: 15 },
  meat_cooked: { food: 45 },
  medkit: { heal: 50 },
  helmet: { armor: 0.15 },
  vest: { armor: 0.25 },
  scuba: { armor: 0, worn: true },     // unlimited air under water; lost when you are defeated
  // standard gear (always carried, not on the hotbar)
  flashlight: { gear: true }, compass: { gear: true }, binoculars: { gear: true },
  // ---- Town Life
  sand: { block: B.SAND, tiles: ['sand', 'sand'] },
  clay: { block: B.CLAY, tiles: ['clay', 'clay'] },
  brick: { block: B.BRICK, tiles: ['brick', 'brick'] },
  glass: { block: B.GLASS, tiles: ['glass', 'glass'] },
  thatch: { block: B.THATCH, tiles: ['thatch', 'thatch'] },
  charcoal: { block: B.CHARCOAL, tiles: ['charcoal', 'charcoal'] },
  gold: { block: B.GOLD, tiles: ['gold', 'gold'] },
  fence: { block: B.FENCE, tiles: ['fence', 'fence'] },
  seed_wheat: { seed: 'wheat' }, seed_carrot: { seed: 'carrot' }, seed_cabbage: { seed: 'cabbage' },
  wheat: {}, carrot: { food: 10 }, cabbage: { food: 12 },
  bread: { food: 35 }, egg: { food: 8 }, milk: { food: 14 },
  hide: {}, bear_hide: {},
  bucket: { tool: 'bucket' }, bucket_water: { tool: 'bucket' },
  chicken: { livestock: 'chicken' }, piglet: { livestock: 'pig' }, calf: { livestock: 'cow' },
};
export const MATERIALS = ['dirt', 'wood', 'stone', 'iron', 'tnt', 'sandbag', 'wire'];
export const WEAPON_IDS = ['knife', 'pistol', 'rifle', 'sniper', 'smg', 'grenade', 'smoke'];
export const LOOT_IDS = [...WEAPON_IDS, 'tnt'];

// Crafting happens at a campfire. Weapon times rise 2 s per level of
// destructive power, and stronger weapons cost more iron. `war: false` /
// `town: true` keep a recipe to one of the two games.
export const RECIPE_CATS = ['weapons', 'defense', 'gear', 'transport', 'food', 'materials'];
export const RECIPES = [
  { id: 'knife', cat: 'weapons', needs: { iron: 1, wood: 1 }, time: 5 },
  { id: 'pistol', cat: 'weapons', needs: { iron: 2, wood: 1 }, time: 7 },
  { id: 'rifle', cat: 'weapons', needs: { iron: 3, wood: 2 }, time: 9 },
  { id: 'sniper', cat: 'weapons', needs: { iron: 4, wood: 2 }, time: 11 },
  { id: 'smg', cat: 'weapons', needs: { iron: 5, wood: 1 }, time: 13 },
  { id: 'grenade', cat: 'weapons', needs: { iron: 2 }, time: 15, out: 2 },
  { id: 'smoke', cat: 'weapons', needs: { iron: 1, wood: 1 }, time: 15, out: 2 },
  { id: 'tnt', cat: 'weapons', needs: { iron: 2, wood: 2, dirt: 2 }, time: 17 },
  { id: 'sandbag', cat: 'defense', needs: { dirt: 3 }, time: 3, out: 2 },
  { id: 'wire', cat: 'defense', needs: { iron: 1 }, time: 4, out: 3 },
  { id: 'watchtower', cat: 'defense', needs: { wood: 16 }, time: 12 },
  { id: 'helmet', cat: 'gear', needs: { iron: 3 }, time: 8 },
  { id: 'vest', cat: 'gear', needs: { iron: 5 }, time: 10 },
  { id: 'medkit', cat: 'gear', needs: { iron: 1, wood: 1 }, time: 6 },
  { id: 'scuba', cat: 'gear', needs: { iron: 4, wood: 1 }, time: 12 },
  { id: 'raft', cat: 'transport', needs: { wood: 6 }, time: 7 },
  { id: 'meat_cooked', cat: 'food', needs: { meat_raw: 1 }, time: 4, cook: true },
  // Town Life: weapons are crafted as in War; materials are smelted on the fire
  { id: 'bread', cat: 'food', needs: { wheat: 3 }, time: 5, cook: true, town: true },
  { id: 'charcoal', cat: 'materials', needs: { wood: 2 }, time: 6, town: true },
  { id: 'brick', cat: 'materials', needs: { clay: 1, charcoal: 1 }, time: 5, out: 2, town: true },
  { id: 'glass', cat: 'materials', needs: { sand: 2, charcoal: 1 }, time: 6, out: 2, town: true },
  { id: 'thatch', cat: 'materials', needs: { wheat: 2 }, time: 3, out: 2, town: true },
  { id: 'fence', cat: 'materials', needs: { wood: 2 }, time: 3, out: 3, town: true },
];
// which recipes each game offers
const WAR_ONLY = ['grenade', 'smoke', 'tnt', 'sandbag', 'wire', 'watchtower', 'helmet', 'vest', 'smg'];
export function recipesFor(town) { return RECIPES.filter((r) => town ? !WAR_ONLY.includes(r.id) : !r.town); }

const ICON_DRAW = {
  shovel(c) {
    c.strokeStyle = '#2b2118'; c.lineWidth = 2;
    c.fillStyle = '#7a5b3a';
    c.save(); c.translate(24, 24); c.rotate(-Math.PI / 4);
    c.fillRect(-2, -20, 4, 24); c.strokeRect(-2, -20, 4, 24);
    c.beginPath(); c.arc(0, -21, 4, Math.PI, 0); c.stroke();
    c.fillStyle = '#5f6650';
    c.beginPath(); c.moveTo(-7, 4); c.lineTo(7, 4); c.lineTo(6, 16); c.lineTo(0, 21); c.lineTo(-6, 16); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#8b917c'; c.fillRect(-5, 6, 2, 9);
    c.restore();
  },
  knife(c) {
    c.save(); c.translate(24, 24); c.rotate(-Math.PI / 4);
    c.fillStyle = '#3d2f22'; c.fillRect(-3, 4, 6, 14);
    c.fillStyle = '#5a5a52'; c.fillRect(-6, 2, 12, 3);
    c.fillStyle = '#b9bcb4'; c.beginPath(); c.moveTo(-3, 2); c.lineTo(3, 2); c.lineTo(2, -18); c.lineTo(-1, -21); c.lineTo(-3, -16); c.fill();
    c.fillStyle = '#e2e4dc'; c.fillRect(-1, -14, 1, 14);
    c.restore();
  },
  pistol(c) {
    c.fillStyle = '#2e302a'; c.fillRect(8, 16, 30, 8);
    c.fillStyle = '#3c3e36'; c.fillRect(8, 14, 30, 3);
    c.fillStyle = '#5a4430'; c.beginPath(); c.moveTo(12, 24); c.lineTo(20, 24); c.lineTo(18, 38); c.lineTo(10, 38); c.fill();
    c.strokeStyle = '#2e302a'; c.lineWidth = 2; c.beginPath(); c.arc(22, 26, 3, 0, Math.PI); c.stroke();
  },
  rifle(c) {
    c.fillStyle = '#6a4a2e'; c.beginPath(); c.moveTo(2, 28); c.lineTo(14, 24); c.lineTo(30, 24); c.lineTo(30, 28); c.lineTo(10, 34); c.fill();
    c.fillStyle = '#2c2e28'; c.fillRect(14, 21, 30, 3); c.fillRect(20, 24, 6, 3);
    c.fillStyle = '#b9bcb4'; c.fillRect(38, 19, 9, 2); // bayonet
  },
  sniper(c) {
    ICON_DRAW.rifle(c);
    c.fillStyle = '#20221e'; c.fillRect(18, 14, 14, 5); c.fillRect(16, 15, 3, 3); c.fillRect(31, 15, 3, 3);
    c.fillStyle = '#6a8a9a'; c.fillRect(32, 15, 1, 3);
    c.clearRect(38, 18, 10, 4);
  },
  smg(c) {
    c.fillStyle = '#2c2e28'; c.fillRect(8, 18, 32, 7); c.fillRect(38, 20, 8, 2);
    c.fillStyle = '#1e201c'; c.fillRect(22, 25, 4, 14);
    c.fillStyle = '#4a3a2a'; c.fillRect(12, 25, 6, 9);
    c.strokeStyle = '#2c2e28'; c.lineWidth = 2; c.strokeRect(2, 19, 7, 6);
  },
  grenade(c) {
    c.fillStyle = '#4c5338'; c.beginPath(); c.ellipse(24, 28, 10, 13, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#30351f'; c.lineWidth = 1;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(14, 28 + i * 5); c.lineTo(34, 28 + i * 5); c.stroke(); }
    c.fillStyle = '#6a6c64'; c.fillRect(20, 12, 8, 5); c.fillRect(27, 13, 8, 2);
    c.strokeStyle = '#8a8c84'; c.beginPath(); c.arc(16, 13, 4, 0, Math.PI * 2); c.stroke();
  },
  smoke(c) {
    c.fillStyle = '#6a6e66'; c.fillRect(16, 14, 16, 26);
    c.fillStyle = '#b9b29a'; c.fillRect(16, 22, 16, 6);
    c.fillStyle = '#4a4e46'; c.fillRect(18, 9, 12, 5);
    c.fillStyle = 'rgba(200,200,190,0.6)'; c.beginPath(); c.arc(30, 8, 5, 0, Math.PI * 2); c.arc(37, 5, 4, 0, Math.PI * 2); c.fill();
  },
  flint(c) {
    c.fillStyle = '#4a4a50'; c.beginPath(); c.moveTo(8, 30); c.lineTo(20, 14); c.lineTo(28, 22); c.lineTo(18, 36); c.closePath(); c.fill();
    c.strokeStyle = '#8a8f94'; c.lineWidth = 4; c.beginPath(); c.arc(32, 26, 9, 0.3, Math.PI * 1.7); c.stroke();
    c.fillStyle = '#f0b040'; c.fillRect(24, 12, 2, 2); c.fillRect(27, 9, 2, 2); c.fillRect(22, 8, 2, 2);
  },
  raft(c) {
    for (let i = 0; i < 5; i++) {
      const y = 12 + i * 6;
      c.fillStyle = i % 2 ? '#6b5236' : '#5c452e'; c.fillRect(6, y, 36, 5);
      c.fillStyle = '#3b2c1f'; c.fillRect(6, y + 4, 36, 1);
      c.fillStyle = '#8a6c48'; c.fillRect(5, y, 2, 5); c.fillRect(41, y, 2, 5);
    }
    c.fillStyle = '#b8a27a'; c.fillRect(12, 10, 3, 32); c.fillRect(33, 10, 3, 32);
  },
  watchtower(c) {
    c.fillStyle = '#5c452e';
    c.fillRect(10, 18, 4, 26); c.fillRect(34, 18, 4, 26);
    c.strokeStyle = '#6b5236'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(12, 44); c.lineTo(36, 22); c.moveTo(36, 44); c.lineTo(12, 22); c.stroke();
    c.fillStyle = '#7a5f40'; c.fillRect(6, 14, 36, 5);
    c.fillStyle = '#6b5236'; c.fillRect(6, 6, 3, 9); c.fillRect(39, 6, 3, 9); c.fillRect(6, 6, 36, 2);
  },
  meat_raw(c) {
    c.fillStyle = '#7c2a24'; c.beginPath(); c.ellipse(22, 26, 14, 10, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a14a3c'; c.beginPath(); c.ellipse(20, 24, 8, 5, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e6dcc4'; c.fillRect(32, 14, 10, 4); c.beginPath(); c.arc(42, 14, 3, 0, Math.PI * 2); c.arc(42, 18, 3, 0, Math.PI * 2); c.fill();
  },
  meat_cooked(c) {
    c.fillStyle = '#5a3a20'; c.beginPath(); c.ellipse(22, 26, 14, 10, -0.4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8a5a30'; c.beginPath(); c.ellipse(20, 24, 8, 5, -0.4, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#2e1c10'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(12 + i * 7, 32); c.lineTo(18 + i * 7, 18); c.stroke(); }
    c.fillStyle = '#e6dcc4'; c.fillRect(32, 14, 10, 4); c.beginPath(); c.arc(42, 14, 3, 0, Math.PI * 2); c.arc(42, 18, 3, 0, Math.PI * 2); c.fill();
  },
  medkit(c) {
    c.fillStyle = '#5a5e44'; c.fillRect(8, 14, 32, 24);
    c.fillStyle = '#3e4230'; c.fillRect(18, 10, 12, 5);
    c.fillStyle = '#d8d0b4'; c.fillRect(20, 20, 8, 12); c.fillRect(16, 24, 16, 4);
  },
  helmet(c) {
    c.fillStyle = '#4e5538'; c.beginPath(); c.arc(24, 30, 16, Math.PI, 0); c.fill();
    c.fillRect(4, 29, 40, 4);
    c.fillStyle = '#626a48'; c.beginPath(); c.arc(20, 24, 6, Math.PI, 0); c.fill();
    c.fillStyle = '#3a2e22'; c.fillRect(14, 33, 3, 7); c.fillRect(31, 33, 3, 7);
  },
  vest(c) {
    c.fillStyle = '#4e5538'; c.beginPath(); c.moveTo(10, 10); c.lineTo(18, 10); c.lineTo(24, 16); c.lineTo(30, 10); c.lineTo(38, 10);
    c.lineTo(40, 42); c.lineTo(8, 42); c.closePath(); c.fill();
    c.fillStyle = '#3c422a'; c.fillRect(12, 26, 8, 8); c.fillRect(28, 26, 8, 8);
    c.fillStyle = '#626a48'; c.fillRect(23, 18, 2, 24);
  },
  scuba(c) {
    c.fillStyle = '#5a6a72'; c.fillRect(30, 8, 9, 30); c.beginPath(); c.arc(34.5, 8, 4.5, Math.PI, 0); c.fill();
    c.fillStyle = '#2a3236'; c.fillRect(32, 4, 5, 4);
    c.strokeStyle = '#1e2224'; c.lineWidth = 2; c.beginPath(); c.moveTo(34, 6); c.quadraticCurveTo(24, 2, 20, 18); c.stroke();
    c.fillStyle = '#2c3438'; c.beginPath(); c.ellipse(16, 26, 11, 8, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#8ab8c8'; c.beginPath(); c.ellipse(16, 26, 8, 5, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d0eef6'; c.fillRect(11, 23, 4, 2);
  },
  seed_wheat(c) { ICON_DRAW.sack(c, '#c8a858'); },
  seed_carrot(c) { ICON_DRAW.sack(c, '#d07a34'); },
  seed_cabbage(c) { ICON_DRAW.sack(c, '#78a85a'); },
  sack(c, dot) {
    c.fillStyle = '#b8a27a'; c.beginPath(); c.moveTo(14, 14); c.lineTo(34, 14); c.lineTo(38, 40); c.lineTo(10, 40); c.closePath(); c.fill();
    c.fillStyle = '#8a7656'; c.fillRect(16, 10, 16, 6);
    c.fillStyle = dot; for (const [x, y] of [[20, 26], [27, 30], [22, 34], [29, 23]]) { c.beginPath(); c.arc(x, y, 2.5, 0, Math.PI * 2); c.fill(); }
  },
  wheat(c) { c.strokeStyle = '#c8a050'; c.lineWidth = 2; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(24, 42); c.lineTo(24 + i * 5, 12); c.stroke(); c.fillStyle = '#e0bc62'; c.beginPath(); c.ellipse(24 + i * 5, 12, 3, 6, 0, 0, Math.PI * 2); c.fill(); } },
  carrot(c) { c.fillStyle = '#d8742c'; c.beginPath(); c.moveTo(14, 16); c.lineTo(22, 12); c.lineTo(38, 40); c.closePath(); c.fill(); c.fillStyle = '#5a9a3a'; c.fillRect(10, 8, 4, 10); c.fillRect(15, 6, 4, 9); },
  cabbage(c) { c.fillStyle = '#6aa04e'; c.beginPath(); c.arc(24, 26, 15, 0, Math.PI * 2); c.fill(); c.fillStyle = '#a8d088'; c.beginPath(); c.arc(24, 26, 9, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#4a7a36'; c.beginPath(); c.moveTo(24, 12); c.lineTo(24, 40); c.stroke(); },
  bread(c) { c.fillStyle = '#b8803c'; c.beginPath(); c.ellipse(24, 28, 17, 10, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#e0b878'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(14 + i * 8, 32); c.lineTo(20 + i * 8, 22); c.stroke(); } },
  egg(c) { c.fillStyle = '#efe4cc'; c.beginPath(); c.ellipse(24, 26, 10, 13, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#fff8ec'; c.beginPath(); c.ellipse(20, 21, 3, 4, 0, 0, Math.PI * 2); c.fill(); },
  milk(c) { c.fillStyle = '#d8d8d0'; c.fillRect(15, 14, 18, 28); c.fillStyle = '#f4f4ee'; c.fillRect(17, 20, 14, 20); c.fillStyle = '#8a8a80'; c.fillRect(18, 8, 12, 6); },
  hide(c) { c.fillStyle = '#9a7650'; c.beginPath(); c.moveTo(8, 14); c.lineTo(20, 10); c.lineTo(28, 12); c.lineTo(40, 10); c.lineTo(38, 26); c.lineTo(42, 40); c.lineTo(26, 36); c.lineTo(8, 40); c.lineTo(12, 26); c.closePath(); c.fill(); c.fillStyle = '#7a5a3a'; c.beginPath(); c.arc(24, 24, 5, 0, Math.PI * 2); c.fill(); },
  bear_hide(c) { c.fillStyle = '#3e2c1e'; c.beginPath(); c.moveTo(6, 14); c.lineTo(20, 8); c.lineTo(28, 10); c.lineTo(42, 8); c.lineTo(40, 26); c.lineTo(44, 42); c.lineTo(26, 36); c.lineTo(6, 42); c.lineTo(10, 26); c.closePath(); c.fill(); c.fillStyle = '#5a422c'; c.beginPath(); c.arc(24, 22, 6, 0, Math.PI * 2); c.fill(); },
  bucket(c) { c.fillStyle = '#7e848a'; c.beginPath(); c.moveTo(12, 16); c.lineTo(36, 16); c.lineTo(32, 40); c.lineTo(16, 40); c.closePath(); c.fill(); c.strokeStyle = '#4e5458'; c.lineWidth = 2; c.beginPath(); c.arc(24, 16, 11, Math.PI, 0); c.stroke(); },
  bucket_water(c) { ICON_DRAW.bucket(c); c.fillStyle = '#5a8ab0'; c.fillRect(14, 17, 20, 5); },
  chicken(c) { c.fillStyle = '#f0e8d8'; c.beginPath(); c.ellipse(24, 28, 12, 10, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(32, 16, 6, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c83a2a'; c.fillRect(31, 8, 4, 4); c.fillStyle = '#e0a030'; c.fillRect(37, 15, 5, 3); },
  piglet(c) { c.fillStyle = '#e0a898'; c.beginPath(); c.ellipse(24, 28, 14, 10, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#c88878'; c.fillRect(36, 25, 5, 6); c.fillStyle = '#222'; c.fillRect(32, 23, 2, 2); },
  calf(c) { c.fillStyle = '#8a6a4a'; c.fillRect(10, 18, 26, 14); c.fillRect(32, 12, 10, 10); c.fillStyle = '#e8e0d0'; c.fillRect(16, 20, 8, 6); c.fillStyle = '#5a4430'; for (const x of [12, 18, 28, 33]) c.fillRect(x, 32, 3, 9); },
  flashlight(c) {
    c.fillStyle = '#4b5240'; c.fillRect(10, 18, 22, 12);
    c.fillStyle = '#6a705c'; c.fillRect(30, 15, 8, 18);
    c.fillStyle = '#e8dca0'; c.fillRect(37, 17, 3, 14);
    c.fillStyle = '#2a2e24'; c.fillRect(16, 20, 4, 3);
  },
  compass(c) {
    c.fillStyle = '#5a5a44'; c.beginPath(); c.arc(24, 24, 17, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#d8d0b0'; c.beginPath(); c.arc(24, 24, 13, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9a2e22'; c.beginPath(); c.moveTo(24, 12); c.lineTo(28, 24); c.lineTo(20, 24); c.fill();
    c.fillStyle = '#333'; c.beginPath(); c.moveTo(24, 36); c.lineTo(28, 24); c.lineTo(20, 24); c.fill();
  },
  binoculars(c) {
    c.fillStyle = '#3a3f32';
    c.fillRect(8, 14, 13, 22); c.fillRect(27, 14, 13, 22); c.fillRect(19, 18, 10, 8);
    c.fillStyle = '#1c1e18'; c.fillRect(10, 32, 9, 5); c.fillRect(29, 32, 9, 5);
    c.fillStyle = '#7e8a8a'; c.fillRect(11, 34, 7, 2); c.fillRect(30, 34, 7, 2);
  },
};

const iconCache = {};
export function iconCanvas(id) {
  const def = ITEMS[id];
  let canvas;
  if (def && def.tiles) {
    const a = buildAtlas();
    canvas = cubeIcon(a.tileCanvas(def.tiles[0]), a.tileCanvas(def.tiles[1]));
  } else if (def && def.flat) {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buildAtlas().tileCanvas(def.flat), 4, 4, 40, 40);
  } else {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d');
    (ICON_DRAW[id] || ((c) => { c.fillStyle = '#555'; c.fillRect(10, 10, 28, 28); }))(ctx);
  }
  return canvas;
}
export function itemIcon(id) {
  if (!iconCache[id]) iconCache[id] = iconCanvas(id).toDataURL();
  return iconCache[id];
}
