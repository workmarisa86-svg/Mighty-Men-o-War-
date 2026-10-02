// Item definitions and their (procedurally drawn) icons.
import { B } from './blocks.js';
import { buildAtlas, cubeIcon } from './textures.js';

export const ITEMS = {
  shovel: { tool: 'shovel' },
  dirt: { block: B.DIRT, tiles: ['dirt_top', 'dirt'] },
  wood: { block: B.WOOD, tiles: ['planks', 'planks'] },
  stone: { block: B.STONE, tiles: ['stone', 'stone'] },
  iron: { block: B.IRON, tiles: ['iron', 'iron'] },
  tnt: { block: B.TNT, tiles: ['tnt_top', 'tnt_side'] },
  raft: { place: 'raft' },
  // standard gear (always carried in War mode, not on the hotbar)
  flashlight: { gear: true }, flint: { gear: true }, compass: { gear: true }, binoculars: { gear: true },
};
export const MATERIALS = ['dirt', 'wood', 'stone', 'iron', 'tnt'];

// Field recipes. Stage 2 moves crafting to campfires and adds many more.
export const RECIPES = [
  { id: 'raft', needs: { wood: 6 }, time: 7 },
];

const ICON_DRAW = {
  shovel(c) {
    c.strokeStyle = '#2b2118'; c.lineWidth = 2;
    c.fillStyle = '#7a5b3a'; // handle
    c.save(); c.translate(24, 24); c.rotate(-Math.PI / 4);
    c.fillRect(-2, -20, 4, 24); c.strokeRect(-2, -20, 4, 24);
    c.beginPath(); c.arc(0, -21, 4, Math.PI, 0); c.stroke();
    c.fillStyle = '#5f6650'; // olive steel blade
    c.beginPath(); c.moveTo(-7, 4); c.lineTo(7, 4); c.lineTo(6, 16); c.lineTo(0, 21); c.lineTo(-6, 16); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#8b917c'; c.fillRect(-5, 6, 2, 9);
    c.restore();
  },
  raft(c) {
    for (let i = 0; i < 5; i++) {
      const y = 12 + i * 6;
      c.fillStyle = i % 2 ? '#6b5236' : '#5c452e';
      c.fillRect(6, y, 36, 5);
      c.fillStyle = '#3b2c1f'; c.fillRect(6, y + 4, 36, 1);
      c.fillStyle = '#8a6c48'; c.fillRect(5, y, 2, 5); c.fillRect(41, y, 2, 5);
    }
    c.fillStyle = '#b8a27a'; c.fillRect(12, 10, 3, 32); c.fillRect(33, 10, 3, 32); // rope lashing
  },
  flashlight(c) {
    c.fillStyle = '#4b5240'; c.fillRect(10, 18, 22, 12);
    c.fillStyle = '#6a705c'; c.fillRect(30, 15, 8, 18);
    c.fillStyle = '#e8dca0'; c.fillRect(37, 17, 3, 14);
    c.fillStyle = '#2a2e24'; c.fillRect(16, 20, 4, 3);
  },
  flint(c) {
    c.fillStyle = '#4a4a50'; c.beginPath(); c.moveTo(8, 30); c.lineTo(20, 14); c.lineTo(28, 22); c.lineTo(18, 36); c.closePath(); c.fill();
    c.strokeStyle = '#8a8f94'; c.lineWidth = 4; c.beginPath(); c.arc(32, 26, 9, 0.3, Math.PI * 1.7); c.stroke();
    c.fillStyle = '#f0b040'; c.fillRect(24, 12, 2, 2); c.fillRect(27, 9, 2, 2); c.fillRect(22, 8, 2, 2);
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
export function itemIcon(id) {
  if (iconCache[id]) return iconCache[id];
  const def = ITEMS[id];
  let canvas;
  if (def && def.tiles) {
    const a = buildAtlas();
    canvas = cubeIcon(a.tileCanvas(def.tiles[0]), a.tileCanvas(def.tiles[1]));
  } else {
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d');
    (ICON_DRAW[id] || ((c) => { c.fillStyle = '#555'; c.fillRect(10, 10, 28, 28); }))(ctx);
  }
  iconCache[id] = canvas.toDataURL();
  return iconCache[id];
}
