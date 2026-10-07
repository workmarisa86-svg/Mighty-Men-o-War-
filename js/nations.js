// Nations of the two sides, their national flags (drawn simply, with
// ordinary national flags only: no swastikas, SS runes or other hate
// symbols; Japan uses the plain red-disc flag, Germany the black-white-red
// tricolor) and their uniform colours (muted and weathered).
export const SIDE_NATIONS = {
  allies: ['us', 'uk', 'su', 'cn', 'ca', 'au', 'in'],
  axis: ['de', 'it', 'jp'],
};
// occupied countries (Stage 2) fly their own flags too
export const OCCUPIED = ['fr', 'pl', 'no', 'gr'];

// uniform colours per nation; only the main nations of each side get a
// uniform of their own (few variants keep the game light)
export const UNIFORMS = {
  us: { tunic: 0x6a6448, trousers: 0x5a5440, helmet: 0x55593a, band: 0xc8b890, insignia: 0xe8e4d8, pack: 0x5e5a40, tracer: 0xd8f0c8 },
  uk: { tunic: 0x7a6a4a, trousers: 0x6a5c40, helmet: 0x5e5e3c, band: 0xb0a070, insignia: 0x2c4c7c, pack: 0x6a6046, tracer: 0xd8f0c8 },
  su: { tunic: 0x6e6a4c, trousers: 0x5a5840, helmet: 0x4e5a3a, band: 0x9a3a2a, insignia: 0xc83a2a, pack: 0x5c5a40, tracer: 0xd8f0c8 },
  de: { tunic: 0x5a6058, trousers: 0x4a4e4a, helmet: 0x4a504a, band: 0x3a3a38, insignia: 0xd8d8d0, pack: 0x4c4c44, tracer: 0xff7a40 },
  it: { tunic: 0x6a6a52, trousers: 0x5a5a46, helmet: 0x56584a, band: 0x4a6a3a, insignia: 0xe0e0d8, pack: 0x585844, tracer: 0xff7a40 },
  jp: { tunic: 0x7a6e48, trousers: 0x6a5e3c, helmet: 0x5a5638, band: 0x8a7a50, insignia: 0xd8b040, pack: 0x625a3c, tracer: 0xff7a40 },
};
// which uniform a nation's soldiers wear
export const UNIFORM_OF = { us: 'us', uk: 'uk', su: 'su', cn: 'us', ca: 'uk', au: 'uk', in: 'uk', de: 'de', it: 'it', jp: 'jp', fr: 'uk', pl: 'uk', no: 'uk', gr: 'uk' };
// the nations soldiers of a side come from until each country has its own (Stage 2)
export const MAIN_NATIONS = { allies: ['us', 'uk', 'su'], axis: ['de', 'it', 'jp'] };

const W = 60, H = 40;
function stripesH(x, cols) { const h = H / cols.length; cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(0, Math.floor(i * h), W, Math.ceil(h)); }); }
function stripesV(x, cols) { const w = W / cols.length; cols.forEach((c, i) => { x.fillStyle = c; x.fillRect(Math.floor(i * w), 0, Math.ceil(w), H); }); }
function nordic(x, bg, outer, inner) {
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = outer; x.fillRect(16, 0, 10, H); x.fillRect(0, 15, W, 10);
  if (inner) { x.fillStyle = inner; x.fillRect(18.5, 0, 5, H); x.fillRect(0, 17.5, W, 5); }
}
function union(x, w, h) {
  // a simplified Union flag in the box (0,0,w,h)
  x.save(); x.beginPath(); x.rect(0, 0, w, h); x.clip();
  x.fillStyle = '#26386a'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#f0ece0'; x.lineWidth = h * 0.2; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
  x.strokeStyle = '#b8282a'; x.lineWidth = h * 0.07; x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
  x.fillStyle = '#f0ece0'; x.fillRect(w * 0.4, 0, w * 0.2, h); x.fillRect(0, h * 0.36, w, h * 0.28);
  x.fillStyle = '#b8282a'; x.fillRect(w * 0.45, 0, w * 0.1, h); x.fillRect(0, h * 0.42, w, h * 0.16);
  x.restore();
}
function star(x, cx, cy, r, color) {
  x.fillStyle = color; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  x.closePath(); x.fill();
}
const DRAW = {
  us(x) {
    for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? '#f0ece0' : '#b22a2e'; x.fillRect(0, i * H / 13, W, H / 13 + 0.5); }
    x.fillStyle = '#2c3a6a'; x.fillRect(0, 0, W * 0.42, H * 7 / 13);
    x.fillStyle = '#f0ece0'; for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) x.fillRect(1.6 + c * 3, 1.4 + r * 3.4, 1.2, 1.2);   // 48 stars
  },
  uk(x) { union(x, W, H); },
  su(x) {
    x.fillStyle = '#c0282a'; x.fillRect(0, 0, W, H);
    star(x, 9, 6, 2.6, '#e8c040');
    x.strokeStyle = '#e8c040'; x.lineWidth = 1.6;                          // hammer and sickle, simplified
    x.beginPath(); x.arc(10, 15, 5, Math.PI * 0.8, Math.PI * 2.1); x.stroke();
    x.beginPath(); x.moveTo(6, 20); x.lineTo(13, 12); x.stroke(); x.fillStyle = '#e8c040'; x.fillRect(11.5, 10.5, 4, 2.5);
  },
  cn(x) {
    x.fillStyle = '#c0282a'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#28366a'; x.fillRect(0, 0, W / 2, H / 2);
    x.fillStyle = '#f0ece0'; x.beginPath();
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12, r = i % 2 ? 4 : 7.5; x.lineTo(15 + Math.cos(a) * r, 10 + Math.sin(a) * r); }
    x.closePath(); x.fill();
    x.fillStyle = '#28366a'; x.beginPath(); x.arc(15, 10, 3.6, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#f0ece0'; x.beginPath(); x.arc(15, 10, 3, 0, Math.PI * 2); x.fill();
  },
  ca(x) { x.fillStyle = '#b8282a'; x.fillRect(0, 0, W, H); union(x, W / 2, H / 2); x.fillStyle = '#e0dcc8'; x.fillRect(40, 13, 9, 11); x.fillStyle = '#3a6a3a'; x.fillRect(42, 15, 5, 3); },
  au(x) { x.fillStyle = '#26386a'; x.fillRect(0, 0, W, H); union(x, W / 2, H / 2); star(x, 15, 31, 4.5, '#f0ece0'); for (const [a, b] of [[44, 8], [52, 18], [44, 32], [37, 20]]) star(x, a, b, 2.4, '#f0ece0'); },
  in(x) { x.fillStyle = '#b8282a'; x.fillRect(0, 0, W, H); union(x, W / 2, H / 2); star(x, 44, 24, 5, '#e8c040'); },
  de(x) { stripesH(x, ['#1c1c1c', '#f0ece0', '#c0282a']); },              // black-white-red tricolor
  it(x) { stripesV(x, ['#2a7a3a', '#f0ece0', '#c0282a']); },              // plain tricolor
  jp(x) { x.fillStyle = '#f0ece0'; x.fillRect(0, 0, W, H); x.fillStyle = '#c0282a'; x.beginPath(); x.arc(W / 2, H / 2, 11, 0, Math.PI * 2); x.fill(); },  // plain red disc
  fr(x) { stripesV(x, ['#26386a', '#f0ece0', '#c0282a']); },
  pl(x) { stripesH(x, ['#f0ece0', '#c0282a']); },
  no(x) { nordic(x, '#b8282a', '#f0ece0', '#26386a'); },
  gr(x) {
    for (let i = 0; i < 9; i++) { x.fillStyle = i % 2 ? '#f0ece0' : '#2a5aa0'; x.fillRect(0, i * H / 9, W, H / 9 + 0.5); }
    x.fillStyle = '#2a5aa0'; x.fillRect(0, 0, 22, H * 5 / 9); x.fillStyle = '#f0ece0'; x.fillRect(9, 0, 4, H * 5 / 9); x.fillRect(0, 9, 22, 4.4);
  },
};
const canvases = {}, urls = {};
export function flagCanvas(n) {
  if (canvases[n]) return canvases[n];
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  (DRAW[n] || DRAW.us)(x);
  x.fillStyle = 'rgba(40,30,20,0.12)'; x.fillRect(0, 0, W, H);               // weathered
  canvases[n] = c;
  return c;
}
export function flagURL(n) { return urls[n] || (urls[n] = flagCanvas(n).toDataURL()); }
// the plain cross insignia used on Axis vehicles (black cross outlined in white)
export function crossInsignia(x, cx, cy, s) {
  x.fillStyle = '#f0ece0'; x.fillRect(cx - s * 0.6, cy - s * 0.2, s * 1.2, s * 0.4); x.fillRect(cx - s * 0.2, cy - s * 0.6, s * 0.4, s * 1.2);
  x.fillStyle = '#1c1c1c'; x.fillRect(cx - s * 0.5, cy - s * 0.12, s, s * 0.24); x.fillRect(cx - s * 0.12, cy - s * 0.5, s * 0.24, s);
}
