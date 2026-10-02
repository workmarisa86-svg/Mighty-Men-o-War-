// Procedurally painted block textures (all original, drawn pixel by pixel at startup).
import { mulberry32 } from './noise.js';

export const TILE = 32;
const COLS = 8;
const TILE_NAMES = [
  'dirt', 'dirt_top', 'mud', 'rubble', 'log_side', 'log_top', 'planks', 'leaves',
  'stone', 'iron', 'tnt_side', 'tnt_top', 'water', 'bedrock', 'sandbag', 'sandbag_top',
  'wire',
];

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
  bedrock(p) {
    p.fill([36, 35, 34], 14);
    p.blobs(8, [18, 18, 18], 2, 6);
    p.blobs(4, [58, 56, 54], 1.5, 6);
  },
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
  atlas = { canvas, uvs, tileCanvas };
  return atlas;
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
