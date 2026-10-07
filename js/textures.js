// Procedurally painted block textures (all original, drawn pixel by pixel at startup).
import { mulberry32 } from './noise.js';

export const TILE = 32;
const COLS = 8;
const TILE_NAMES = [
  'dirt', 'dirt_top', 'mud', 'rubble', 'log_side', 'log_top', 'planks', 'leaves',
  'stone', 'iron', 'tnt_side', 'tnt_top', 'water', 'bedrock', 'sandbag', 'sandbag_top',
  'wire', 'fort_wall', 'fort_top', 'fort_door', 'fort_lamp', 'supply', 'supply_top',
  // Town Life
  'grass_top', 'grass_side', 'sand', 'clay', 'brick', 'glass', 'thatch', 'ice',
  'charcoal', 'gold', 'farmland', 'path', 'fence',
  'sprout', 'wheat_g', 'wheat_r', 'carrot_g', 'carrot_r', 'cabbage_g', 'cabbage_r', 'wilted',
  'ladder', 'ladder_top',
];
// season currently painted into the seasonal tiles (grass, leaves): null = War look
let SEASON = null;

const clamp = (v) => Math.max(0, Math.min(255, v | 0));
const rgb = (c, a = 1) => `rgba(${clamp(c[0])},${clamp(c[1])},${clamp(c[2])},${a})`;
const jit = (c, r, amt) => [c[0] + (r() - 0.5) * amt, c[1] + (r() - 0.5) * amt, c[2] + (r() - 0.5) * amt];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function painter(ctx, ox, oy, seed) {
  const r = mulberry32(seed);
  return {
    r,
    px(x, y, c, a = 1) {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
      ctx.fillStyle = rgb(c, a); ctx.fillRect(ox + x, oy + y, 1, 1);
    },
    rect(x, y, w, h, c, a = 1) { ctx.fillStyle = rgb(c, a); ctx.fillRect(ox + x, oy + y, w, h); },
    fill(base, amt) {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.px(x, y, jit(base, r, amt));
    },
    blobs(n, c, size, amt = 10) {
      for (let i = 0; i < n; i++) {
        const cx = r() * TILE, cy = r() * TILE, rad = size * (0.5 + r());
        for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) {
          if (x * x + y * y <= rad * rad * (0.6 + r() * 0.5)) this.px(Math.floor(cx + x) & 31, Math.floor(cy + y) & 31, jit(c, r, amt));
        }
      }
    },
    clear() { ctx.clearRect(ox, oy, TILE, TILE); },
  };
}

const PAINT = {
  dirt(p) {
    p.fill([92, 70, 50], 22);
    p.blobs(7, [70, 53, 38], 2);
    for (let i = 0; i < 6; i++) { const x = p.r() * 30 | 0, y = p.r() * 30 | 0; p.rect(x, y, 2, 1, [118, 108, 96]); p.px(x, y + 1, [74, 66, 58]); }
  },
  dirt_top(p) {
    PAINT.dirt(p);
    p.blobs(3, [66, 52, 40], 2, 8);         // scorch marks
    for (let i = 0; i < 28; i++) p.px(p.r() * 32 | 0, p.r() * 32 | 0, [96, 94, 90]); // ash flecks
    for (let i = 0; i < 10; i++) { // dry dead stubble
      const x = p.r() * 32 | 0, y = p.r() * 30 | 0;
      p.px(x, y, [104, 94, 66]); p.px(x, y + 1, [88, 78, 54]);
    }
  },
  mud(p) {
    p.fill([62, 48, 36], 10);
    p.blobs(5, [50, 38, 29], 3, 6);
    for (let i = 0; i < 9; i++) { // wet glints
      const x = p.r() * 28 | 0, y = p.r() * 32 | 0, w = 2 + (p.r() * 4 | 0);
      p.rect(x, y, w, 1, [98, 86, 70], 0.8);
    }
    p.blobs(2, [58, 62, 62], 2, 6); // puddle hints
  },
  rubble(p) {
    p.fill([78, 70, 62], 18);
    for (let i = 0; i < 11; i++) {
      const w = 3 + (p.r() * 6 | 0), h = 2 + (p.r() * 4 | 0);
      const x = p.r() * (32 - w) | 0, y = p.r() * (32 - h) | 0;
      const brick = p.r() < 0.3;
      const c = brick ? [112, 76, 60] : (p.r() < 0.5 ? [114, 109, 102] : [90, 86, 81]);
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        if ((xx === 0 || xx === w - 1) && (yy === 0 || yy === h - 1) && p.r() < 0.7) continue;
        p.px(x + xx, y + yy, jit(yy === 0 ? mix(c, [150, 145, 140], 0.25) : c, p.r, 14));
      }
      p.rect(x, y + h, w, 1, [44, 40, 36], 0.7);
    }
  },
  log_side(p) {
    for (let x = 0; x < 32; x++) {
      const col = jit([56, 44, 34], p.r, 16);
      for (let y = 0; y < 32; y++) p.px(x, y, jit(col, p.r, 8));
    }
    for (let i = 0; i < 7; i++) {
      let x = p.r() * 32 | 0;
      for (let y = 0; y < 32; y++) { p.px(x, y, [34, 27, 21]); if (p.r() < 0.15) x += p.r() < 0.5 ? -1 : 1; }
    }
    p.blobs(3, [28, 24, 22], 2.5, 6); // charring
  },
  log_top(p) {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5);
      let c = (Math.floor(d / 2.2) % 2) ? [104, 82, 56] : [86, 66, 46];
      if (d > 13.5) c = [50, 40, 30];
      p.px(x, y, jit(c, p.r, 10));
    }
    for (let i = 0; i < 10; i++) p.px(15 + i, 15 + (i * 0.4 | 0), [40, 32, 25]); // drying crack
    p.blobs(2, [34, 28, 24], 2, 6);
  },
  planks(p) {
    for (let b = 0; b < 4; b++) {
      const base = jit([110, 86, 60], p.r, 18);
      for (let y = b * 8; y < b * 8 + 8; y++) for (let x = 0; x < 32; x++) {
        const grain = Math.sin((x + b * 13) * 0.45 + y * 1.7) > 0.85 ? -14 : 0;
        p.px(x, y, jit([base[0] + grain, base[1] + grain, base[2] + grain], p.r, 10));
      }
      p.rect(0, b * 8 + 7, 32, 1, [58, 44, 31]);
      const off = (b * 11) % 32;
      p.rect(off, b * 8, 1, 7, [64, 50, 36]);
      p.px((off + 2) % 32, b * 8 + 3, [72, 72, 70]); p.px((off + 29) % 32, b * 8 + 3, [72, 72, 70]);
    }
  },
  leaves(p) {
    p.clear();
    const cols = [[58, 66, 44], [48, 56, 38], [70, 74, 50], [82, 72, 46]];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      if (p.r() < 0.56) p.px(x, y, jit(cols[p.r() * cols.length | 0], p.r, 12));
    }
  },
  stone(p) {
    p.fill([106, 103, 98], 16);
    p.blobs(6, [88, 86, 82], 2.5, 8);
    for (let i = 0; i < 4; i++) {
      let x = p.r() * 32, y = p.r() * 32; const dx = p.r() - 0.5, dy = p.r() - 0.5;
      for (let k = 0; k < 9; k++) { p.px(x | 0, y | 0, [66, 64, 61]); x += dx * 2 + (p.r() - 0.5); y += dy * 2 + (p.r() - 0.5); }
    }
  },
  iron(p) {
    PAINT.stone(p);
    for (let i = 0; i < 7; i++) {
      const cx = 3 + p.r() * 26 | 0, cy = 3 + p.r() * 26 | 0;
      for (let k = 0; k < 7; k++) {
        const x = cx + (p.r() * 4 - 2 | 0), y = cy + (p.r() * 4 - 2 | 0);
        p.rect(x, y, 2, 2, p.r() < 0.6 ? [150, 92, 58] : [92, 60, 42]);
        if (p.r() < 0.4) p.px(x, y, [196, 188, 176]);
      }
    }
  },
  tnt_side(p) {
    // Wooden demolition crate with a stenciled hazard band and burst pictogram.
    for (let x = 0; x < 32; x++) {
      const board = Math.floor(x / 8);
      const base = [100 + board * 3, 82, 54];
      for (let y = 0; y < 32; y++) p.px(x, y, jit(base, p.r, 12));
      if (x % 8 === 7) p.rect(x, 0, 1, 32, [62, 48, 33]);
    }
    p.rect(0, 0, 32, 3, [70, 56, 38]); p.rect(0, 29, 32, 3, [70, 56, 38]);
    p.rect(0, 0, 3, 32, [70, 56, 38]); p.rect(29, 0, 3, 32, [70, 56, 38]);
    p.rect(0, 11, 32, 10, [44, 46, 36]);
    for (let y = 11; y < 21; y++) for (let x = 0; x < 32; x++) {
      if ((x < 8 || x > 23) && ((x + y) % 6 < 3)) p.px(x, y, [186, 150, 58]);
    }
    const c = [196, 160, 60];
    for (let a = 0; a < 8; a++) { // burst pictogram
      const ang = a * Math.PI / 4;
      for (let d = 2; d < 5; d++) p.px(Math.round(15.5 + Math.cos(ang) * d), Math.round(15.5 + Math.sin(ang) * d), c);
    }
    p.rect(14, 14, 3, 3, c);
    for (const [x, y] of [[4, 4], [27, 4], [4, 27], [27, 27]]) p.px(x, y, [40, 40, 40]); // bolts
  },
  tnt_top(p) {
    PAINT.planks(p);
    p.rect(0, 0, 32, 3, [70, 56, 38]); p.rect(0, 29, 32, 3, [70, 56, 38]);
    p.rect(0, 0, 3, 32, [70, 56, 38]); p.rect(29, 0, 3, 32, [70, 56, 38]);
    p.rect(6, 6, 20, 20, [40, 34, 26]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { // charge stick ends
      const cx = 10 + i * 6, cy = 10 + j * 6;
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const d = x * x + y * y;
        if (d <= 5) p.px(cx + x, cy + y, d > 3 ? [120, 82, 52] : jit([176, 146, 106], p.r, 10));
      }
    }
    let x = 16, y = 16; // fuse cord
    for (let k = 0; k < 18; k++) { p.px(x, y, [26, 26, 24]); x += k % 3 === 0 ? 1 : 0; y -= k % 2; }
    p.px(x, y, [220, 170, 70]);
  },
  water(p) {
    p.fill([52, 72, 80], 8);
    for (let i = 0; i < 10; i++) {
      const x = p.r() * 28 | 0, y = p.r() * 32 | 0;
      p.rect(x, y, 3 + (p.r() * 4 | 0), 1, [86, 104, 110]);
    }
  },
  sandbag(p) {
    // two staggered rows of burlap sacks per block
    p.fill([60, 54, 40], 6);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let b = -1; b < 2; b++) {
        const x0 = b * 16 + off, y0 = row * 8;
        for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
          const ex = Math.min(x, 15 - x), ey = Math.min(y, 7 - y);
          if (ex + ey < 2) continue;
          const shade = ey === 0 || ex === 0 ? -26 : (y === 1 ? 14 : 0);
          const weave = ((x + y) % 2) ? 4 : -4;
          p.px(x0 + x, y0 + y, jit([128 + shade + weave, 114 + shade + weave, 82 + shade + weave], p.r, 10));
        }
        p.px(x0 + 3, y0 + 4, [90, 78, 56]); p.px(x0 + 12, y0 + 4, [90, 78, 56]);
      }
    }
  },
  sandbag_top(p) {
    p.fill([118, 104, 74], 14);
    for (let i = 0; i < 32; i += 16) { p.rect(0, i, 32, 1, [80, 70, 50]); p.rect(i + 8, 0, 1, 32, [86, 76, 54]); }
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if ((x + y) % 4 === 0) p.px(x, y, [104, 92, 66], 0.6);
  },
  wire(p) {
    // coils of rusty barbed wire on a transparent background
    p.clear();
    for (let k = 0; k < 3; k++) {
      const cy = 6 + k * 10;
      for (let t = 0; t < 64; t++) {
        const a = t / 64 * Math.PI * 6;
        const x = (t / 64 * 34 - 1) | 0, y = Math.round(cy + Math.sin(a) * 4);
        p.px(x, y, (t % 7 < 2) ? [120, 76, 50] : [62, 60, 56]);
        if (t % 9 === 0) { p.px(x, y - 1, [90, 88, 82]); p.px(x, y + 1, [90, 88, 82]); p.px(x - 1, y, [90, 88, 82]); }
      }
    }
    p.rect(15, 0, 2, 32, [64, 50, 36]); // stake
  },
  fort_wall(p) {
    // weathered cast concrete in courses, streaked and chipped
    p.fill([118, 116, 108], 12);
    for (let y = 0; y < 32; y += 8) p.rect(0, y, 32, 1, [84, 82, 76]);
    for (let y = 0; y < 32; y += 8) { const off = (y / 8) % 2 ? 0 : 16; p.rect(off, y, 1, 8, [88, 86, 80]); }
    for (let i = 0; i < 5; i++) { // rain streaks
      const x = p.r() * 32 | 0, len = 6 + (p.r() * 16 | 0), y0 = p.r() * 10 | 0;
      for (let y = y0; y < Math.min(32, y0 + len); y++) p.px(x, y, [92, 90, 84], 0.7);
    }
    p.blobs(4, [98, 96, 90], 1.5, 6);
    p.blobs(2, [70, 72, 62], 1.2, 6); // moss / soot
  },
  fort_top(p) { p.fill([108, 106, 100], 12); p.blobs(5, [92, 90, 84], 2, 6); },
  fort_door(p) {
    // riveted steel plate in dark olive with hinges
    p.fill([66, 72, 56], 8);
    p.rect(0, 0, 32, 2, [44, 48, 38]); p.rect(0, 30, 32, 2, [44, 48, 38]); p.rect(0, 0, 2, 32, [44, 48, 38]); p.rect(30, 0, 2, 32, [44, 48, 38]);
    p.rect(0, 15, 32, 2, [48, 52, 42]);
    for (const y of [4, 12, 19, 27]) for (let x = 5; x < 30; x += 6) { p.px(x, y, [110, 112, 100]); p.px(x + 1, y + 1, [34, 36, 30]); }
    for (const y of [6, 24]) p.rect(1, y, 6, 3, [38, 40, 34]);
    p.blobs(3, [96, 70, 44], 1.4, 10); // rust
  },
  fort_lamp(p) {
    // caged lamp: dark frame, warm glowing glass
    p.fill([60, 58, 52], 6);
    for (let y = 5; y < 27; y++) for (let x = 7; x < 25; x++) {
      const d = Math.hypot(x - 15.5, y - 15.5) / 12;
      p.px(x, y, [255 - d * 40, 200 - d * 70, 110 - d * 60]);
    }
    for (let x = 7; x < 25; x += 5) p.rect(x, 5, 1, 22, [50, 44, 36]);
    p.rect(7, 15, 18, 1, [50, 44, 36]);
    p.rect(5, 3, 22, 2, [40, 38, 34]); p.rect(5, 27, 22, 2, [40, 38, 34]);
  },
  supply(p) {
    PAINT.planks(p);
    p.rect(0, 0, 32, 3, [70, 56, 38]); p.rect(0, 29, 32, 3, [70, 56, 38]);
    p.rect(9, 11, 14, 10, [200, 186, 140]);           // stencilled ration label
    p.rect(12, 14, 8, 1, [60, 50, 34]); p.rect(12, 17, 8, 1, [60, 50, 34]);
  },
  supply_top(p) { PAINT.planks(p); p.rect(13, 0, 6, 32, [64, 52, 36]); },
  bedrock(p) {
    p.fill([36, 35, 34], 14);
    p.blobs(8, [18, 18, 18], 2, 6);
    p.blobs(4, [58, 56, 54], 1.5, 6);
  },
  // ------------------------------------------------------------ Town Life
  grass_top(p) {
    const S = SEASON || 'summer';
    if (S === 'winter') {           // snow layer
      p.fill([228, 232, 236], 10); p.blobs(5, [208, 214, 224], 2.5, 6);
      for (let i = 0; i < 18; i++) p.px(p.r() * 32 | 0, p.r() * 32 | 0, [250, 252, 255]);
      return;
    }
    const base = S === 'autumn' ? [118, 112, 52] : S === 'spring' ? [86, 128, 52] : [80, 116, 46];
    p.fill(base, 20);
    p.blobs(6, mix(base, [40, 60, 20], 0.35), 2, 10);
    for (let i = 0; i < 40; i++) { const x = p.r() * 32 | 0, y = p.r() * 31 | 0; p.px(x, y, mix(base, [180, 200, 110], 0.35)); p.px(x, y + 1, mix(base, [30, 50, 20], 0.3)); }
    if (S === 'spring') for (let i = 0; i < 7; i++) p.px(p.r() * 32 | 0, p.r() * 32 | 0, p.r() < 0.5 ? [236, 220, 120] : [236, 236, 230]);   // flowers
    if (S === 'autumn') for (let i = 0; i < 9; i++) p.rect(p.r() * 31 | 0, p.r() * 31 | 0, 2, 1, p.r() < 0.5 ? [176, 92, 36] : [198, 150, 50]); // fallen leaves
  },
  grass_side(p) {
    PAINT.dirt(p);
    const S = SEASON || 'summer';
    const top = S === 'winter' ? [228, 232, 236] : S === 'autumn' ? [118, 112, 52] : S === 'spring' ? [86, 128, 52] : [80, 116, 46];
    for (let x = 0; x < 32; x++) { const h = 3 + (p.r() * 4 | 0); for (let y = 0; y < h; y++) p.px(x, y, jit(top, p.r, 16)); }
  },
  sand(p) { p.fill([196, 178, 128], 16); for (let i = 0; i < 60; i++) p.px(p.r() * 32 | 0, p.r() * 32 | 0, p.r() < 0.5 ? [170, 150, 104] : [216, 200, 156]); },
  clay(p) { p.fill([150, 146, 140], 10); p.blobs(5, [132, 128, 124], 2.5, 6); for (let y = 4; y < 32; y += 7) p.rect(0, y, 32, 1, [138, 134, 128], 0.6); },
  brick(p) {
    p.fill([170, 160, 146], 6);   // mortar
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 8 : 0;
      for (let b = -1; b < 2; b++) {
        const x0 = b * 16 + off, y0 = row * 8, c = jit([140, 68, 50], p.r, 26);
        for (let y = 1; y < 7; y++) for (let x = 1; x < 15; x++) p.px(x0 + x, y0 + y, jit(c, p.r, 12));
      }
    }
  },
  glass(p) {
    p.clear();
    const f = [96, 76, 52];
    p.rect(0, 0, 32, 2, f); p.rect(0, 30, 32, 2, f); p.rect(0, 0, 2, 32, f); p.rect(30, 0, 2, 32, f);
    p.rect(15, 0, 2, 32, f); p.rect(0, 15, 32, 2, f);
    for (let i = 0; i < 4; i++) p.px(5 + i, 4 + i, [230, 240, 244], 0.9);   // glint (opaque enough to show)
  },
  thatch(p) {
    p.fill([170, 142, 76], 18);
    for (let i = 0; i < 70; i++) { const x = p.r() * 32 | 0, y = p.r() * 28 | 0, l = 3 + (p.r() * 5 | 0); for (let k = 0; k < l; k++) p.px(x, y + k, p.r() < 0.5 ? [196, 168, 96] : [128, 104, 54]); }
    for (let y = 7; y < 32; y += 8) p.rect(0, y, 32, 1, [110, 88, 44]);
  },
  ice(p) {
    p.fill([170, 206, 222], 10);
    for (let i = 0; i < 5; i++) { let x = p.r() * 32, y = p.r() * 32; const dx = p.r() - 0.5, dy = p.r() - 0.5; for (let k = 0; k < 10; k++) { p.px(x | 0, y | 0, [226, 240, 248]); x += dx * 2; y += dy * 2; } }
  },
  charcoal(p) { p.fill([34, 33, 32], 10); p.blobs(6, [22, 22, 22], 2, 4); for (let i = 0; i < 14; i++) p.px(p.r() * 32 | 0, p.r() * 32 | 0, [70, 68, 66]); },
  gold(p) {
    PAINT.stone(p);
    for (let i = 0; i < 4; i++) {
      const cx = 4 + p.r() * 24 | 0, cy = 4 + p.r() * 24 | 0;
      for (let k = 0; k < 5; k++) { const x = cx + (p.r() * 4 - 2 | 0), y = cy + (p.r() * 4 - 2 | 0); p.rect(x, y, 2, 2, p.r() < 0.6 ? [214, 176, 64] : [168, 132, 44]); }
      p.px(cx, cy, [255, 246, 196]);   // the glint
    }
  },
  farmland(p) {
    p.fill([66, 48, 32], 12);
    for (let y = 2; y < 32; y += 6) { p.rect(0, y, 32, 2, [48, 34, 22]); p.rect(0, y + 2, 32, 1, [86, 64, 44]); }
  },
  path(p) {
    p.fill([128, 108, 76], 18);
    for (let i = 0; i < 16; i++) { const x = p.r() * 30 | 0, y = p.r() * 30 | 0; p.rect(x, y, 2, 2, p.r() < 0.5 ? [150, 140, 122] : [100, 84, 60]); }
  },
  fence(p) {
    p.clear();
    const c = [104, 78, 50], d = [74, 54, 34];
    p.rect(2, 0, 5, 32, c); p.rect(25, 0, 5, 32, c); p.rect(2, 0, 1, 32, d); p.rect(25, 0, 1, 32, d);
    p.rect(0, 7, 32, 4, c); p.rect(0, 19, 32, 4, c); p.rect(0, 10, 32, 1, d); p.rect(0, 22, 32, 1, d);
  },
  sprout(p) { p.clear(); for (let i = 0; i < 6; i++) { const x = 4 + i * 5; p.rect(x, 24, 1, 8, [80, 130, 50]); p.rect(x - 1, 24, 3, 2, [100, 160, 60]); } },
  wheat_g(p) { p.clear(); for (let i = 0; i < 9; i++) { const x = 2 + i * 3.4 | 0, h = 14 + (p.r() * 6 | 0); p.rect(x, 32 - h, 1, h, [96, 150, 58]); p.rect(x - 1, 32 - h, 3, 3, [120, 170, 70]); } },
  wheat_r(p) { p.clear(); for (let i = 0; i < 9; i++) { const x = 2 + i * 3.4 | 0, h = 20 + (p.r() * 6 | 0); p.rect(x, 32 - h, 1, h, [190, 160, 70]); p.rect(x - 1, 32 - h, 3, 6, [222, 190, 92]); } },
  carrot_g(p) { p.clear(); for (let i = 0; i < 5; i++) { const x = 3 + i * 6; for (let k = 0; k < 4; k++) p.rect(x - 2 + k, 18 + k * 2, 1, 14 - k * 2, [70, 140, 50]); } },
  carrot_r(p) { PAINT.carrot_g(p); for (let i = 0; i < 5; i++) p.rect(2 + i * 6, 28, 4, 4, [214, 112, 40]); },
  cabbage_g(p) { p.clear(); for (let i = 0; i < 3; i++) { const cx = 6 + i * 10; for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y < 16) p.px(cx + x, 27 + y, jit([96, 150, 70], p.r, 20)); } },
  cabbage_r(p) { p.clear(); for (let i = 0; i < 2; i++) { const cx = 9 + i * 14; for (let y = -7; y <= 6; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y < 46) p.px(cx + x, 24 + y, jit(x * x + y * y < 16 ? [170, 206, 130] : [110, 170, 90], p.r, 18)); } },
  ladder(p) {
    p.clear();
    const rail = [92, 70, 46], dark = [58, 44, 30];
    p.rect(3, 0, 4, 32, rail); p.rect(25, 0, 4, 32, rail); p.rect(3, 0, 1, 32, dark); p.rect(28, 0, 1, 32, dark);
    for (let y = 3; y < 32; y += 8) { p.rect(7, y, 18, 3, [112, 86, 56]); p.rect(7, y + 2, 18, 1, dark); }
  },
  ladder_top(p) { p.clear(); p.rect(3, 12, 4, 8, [92, 70, 46]); p.rect(25, 12, 4, 8, [92, 70, 46]); },
  wilted(p) { p.clear(); for (let i = 0; i < 6; i++) { const x = 3 + i * 5; p.rect(x, 26, 1, 6, [110, 92, 54]); p.rect(x, 26, 3, 1, [96, 80, 46]); } },
};
// leaves: one look per season in Town Life (War keeps its own)
const WAR_LEAVES = PAINT.leaves;
PAINT.leaves = (p) => {
  if (!SEASON) return WAR_LEAVES(p);
  p.clear();
  const cols = {
    spring: [[96, 150, 62], [80, 132, 52], [118, 168, 74], [236, 230, 220]],
    summer: [[66, 112, 44], [54, 96, 38], [82, 128, 52], [60, 104, 40]],
    autumn: [[196, 104, 40], [214, 156, 54], [168, 66, 34], [140, 120, 48]],
    winter: [[226, 230, 236], [120, 98, 72], [200, 206, 214], [96, 80, 60]],
  }[SEASON];
  const dens = SEASON === 'winter' ? 0.3 : 0.62;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (p.r() < dens) p.px(x, y, jit(cols[p.r() * cols.length | 0], p.r, 14));
};

let atlas = null;

export function buildAtlas() {
  if (atlas) return atlas;
  const rows = Math.ceil(TILE_NAMES.length / COLS);
  const size = COLS * TILE;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = Math.max(size, rows * TILE);
  const ctx = canvas.getContext('2d');
  const uvs = {};
  TILE_NAMES.forEach((name, i) => {
    const tx = (i % COLS) * TILE, ty = Math.floor(i / COLS) * TILE;
    PAINT[name](painter(ctx, tx, ty, 1000 + i * 7919));
    const inset = 0.02 / COLS;
    uvs[name] = [
      tx / canvas.width + inset, 1 - (ty + TILE) / canvas.height + inset,
      (tx + TILE) / canvas.width - inset, 1 - ty / canvas.height - inset,
    ];
  });
  // water is drawn semi-transparent
  const wi = TILE_NAMES.indexOf('water');
  const wx = (wi % COLS) * TILE, wy = Math.floor(wi / COLS) * TILE;
  const img = ctx.getImageData(wx, wy, TILE, TILE);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 200;
  ctx.putImageData(img, wx, wy);

  const tileCanvas = (name) => {
    const i = TILE_NAMES.indexOf(name);
    const c = document.createElement('canvas'); c.width = c.height = TILE;
    c.getContext('2d').drawImage(canvas, (i % COLS) * TILE, Math.floor(i / COLS) * TILE, TILE, TILE, 0, 0, TILE, TILE);
    return c;
  };
  atlas = { canvas, uvs, tileCanvas, ctx, version: 0 };
  return atlas;
}

// Repaint the seasonal tiles (grass, leaves) for a Town Life season, or
// back to the War look (null). Returns true if anything changed; the caller
// then flags its texture for upload (no chunk has to be rebuilt).
export function paintSeason(season) {
  const a = buildAtlas();
  if (SEASON === season) return false;
  SEASON = season;
  for (const name of ['grass_top', 'grass_side', 'leaves']) {
    const i = TILE_NAMES.indexOf(name);
    const tx = (i % COLS) * TILE, ty = Math.floor(i / COLS) * TILE;
    a.ctx.clearRect(tx, ty, TILE, TILE);
    PAINT[name](painter(a.ctx, tx, ty, 1000 + i * 7919));
  }
  a.version++;
  return true;
}

// Crack overlays shown while digging (5 stages).
export function buildCracks() {
  const out = [];
  for (let s = 0; s < 5; s++) {
    const c = document.createElement('canvas'); c.width = c.height = TILE;
    const ctx = c.getContext('2d');
    const r = mulberry32(77);
    ctx.fillStyle = 'rgba(15,12,10,0.85)';
    const lines = 2 + s * 2;
    for (let i = 0; i < lines; i++) {
      let x = 16 + (r() - 0.5) * 6, y = 16 + (r() - 0.5) * 6;
      const a = r() * Math.PI * 2;
      const len = 5 + s * 3 + r() * 4;
      for (let k = 0; k < len; k++) {
        ctx.fillRect(x | 0, y | 0, 1, 1);
        x += Math.cos(a) + (r() - 0.5) * 0.8; y += Math.sin(a) + (r() - 0.5) * 0.8;
      }
    }
    out.push(c);
  }
  return out;
}

// Isometric cube icon for block items.
export function cubeIcon(top, side, size = 48) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const k = size / 48, S = TILE;
  const face = (img, a, b, cc, d, e, f, shade) => {
    ctx.setTransform(a * k, b * k, cc * k, d * k, e * k, f * k);
    ctx.drawImage(img, 0, 0);
    if (shade) { ctx.fillStyle = `rgba(0,0,0,${shade})`; ctx.fillRect(0, 0, S, S); }
  };
  face(top, 20 / S, -10 / S, 20 / S, 10 / S, 4, 12, 0);
  face(side, 20 / S, 10 / S, 0, 22 / S, 4, 12, 0.22);
  face(side, 20 / S, -10 / S, 0, 22 / S, 24, 22, 0.42);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
