// Renders the logo artwork (art/*.svg, kept as the editable sources) into
// the optimized images the game actually shows. The SVGs use grain and blur
// filters that are slow on phones, so they are never drawn live on screen.
// Lettering: the SVGs ask for Impact, which many devices lack; here "Impact"
// is mapped to Anton (art/fonts, SIL OFL), so the baked-in text is identical
// everywhere.
//
//   node tools/render-art.mjs      (needs Playwright + ImageMagick `convert`)
import fs from 'fs';
import { execFileSync } from 'child_process';
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }

const root = new URL('..', import.meta.url).pathname;
const font = fs.readFileSync(root + 'art/fonts/anton-latin-400.woff2').toString('base64');
const hero = fs.readFileSync(root + 'art/logo-hero-cinematic.svg', 'utf8');
const badge = fs.readFileSync(root + 'art/logo-mix-badge-poster.svg', 'utf8');
const FONTCSS = `@font-face{font-family:Impact;src:url(data:font/woff2;base64,${font}) format('woff2');}`;

// Small-size badge: just the round frame, sunburst, sun and soldier (no
// lettering, laurel, banner or grain) so it reads at 48 px.
const simpleBadge = badge
  .replace(/<!-- arc text -->[\s\S]*?<\/text>/, '')
  .replace(/<!-- laurel -->[\s\S]*?<\/g>/, '')
  .replace(/<!-- banner -->[\s\S]*?<\/text>/, '')
  .replace(/<rect width="600" height="600" filter="url\(#grunge\)"[^>]*\/>/, '');

const b = await chromium.launch();
const page = await b.newPage();
const tmp = root + 'tools/.render-tmp.png';
async function shot(html, w, h) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><style>${FONTCSS}html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#100e0a}svg{display:block}</style></head><body>${html}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(120);
  await page.screenshot({ path: tmp });
}
const sized = (svg, w, h) => svg.replace('<svg ', `<svg width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" `);
const out = (name, args = []) => execFileSync('convert', [tmp, ...args, root + name]);
const webp = (name, q = 82) => out(name, ['-strip', '-quality', String(q), '-define', 'webp:method=6']);
// palette PNGs: a fraction of the size, no visible difference on these images
const png = (name) => execFileSync('convert', [tmp, '-strip', '-dither', 'FloydSteinberg', '-colors', '256', '-define', 'png:compression-level=9', 'PNG8:' + root + name]);

// --- main-menu / splash art: several widths, WebP + one PNG fallback
for (const w of [640, 1280, 1920]) {
  const h = Math.round(w * 560 / 900);
  await shot(sized(hero, w, h), w, h);
  webp(`img/mightyman-hero-${w}.webp`, w > 1280 ? 72 : 78);
  if (w === 1280) out('img/mightyman-hero-1280.jpg', ['-strip', '-quality', '82', '-interlace', 'Plane']);
}
// tiny blurred placeholder, inlined in the stylesheet
await shot(sized(hero, 360, 224), 360, 224);
out('img/mightyman-hero-placeholder.webp', ['-resize', '32x20', '-blur', '0x1', '-quality', '50']);

// --- app icons
const square = (svg, s, scale = 1, bg = '#100e0a') =>
  `<div style="width:${s}px;height:${s}px;background:radial-gradient(circle at 50% 45%,#3a3226,${bg} 75%);display:flex;align-items:center;justify-content:center">${svg.replace('<svg ', `<svg width="${Math.round(s * scale)}" height="${Math.round(s * scale)}" `)}</div>`;
for (const s of [16, 32, 48, 64, 96, 128, 144, 180, 192, 256, 384]) {
  await shot(square(simpleBadge, s), s, s);
  png(`icons/mightyman-icon-${s}.png`);
}
for (const s of [512]) {                             // full badge with the name
  await shot(square(badge, s), s, s);
  png(`icons/mightyman-icon-${s}.png`);
}
// maskable: everything inside the central safe circle (40% radius)
await shot(square(simpleBadge, 192, 0.8), 192, 192); png('icons/mightyman-maskable-192.png');
await shot(square(badge, 512, 0.72), 512, 512); png('icons/mightyman-maskable-512.png');
// favicon.ico with 16/32/48 inside
execFileSync('convert', [root + 'icons/mightyman-icon-16.png', root + 'icons/mightyman-icon-32.png', root + 'icons/mightyman-icon-48.png', root + 'icons/mightyman-favicon.ico']);

// --- social share card (Open Graph / Twitter), 1200x630: art behind, badge with the name in front
const heroCrop = hero.replace('viewBox="0 0 900 560"', 'viewBox="0 95 900 465"');
await shot(`<div style="position:relative;width:1200px;height:630px;background:#0d0a07">
  <div style="position:absolute;left:300px;top:0">${heroCrop.replace('<svg ', '<svg width="1219" height="630" preserveAspectRatio="xMinYMin slice" ')}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#0d0a07 0,#0d0a07 26%,rgba(13,10,7,.6) 46%,rgba(13,10,7,0) 60%)"></div>
  <div style="position:absolute;left:40px;top:55px">${badge.replace('<svg ', '<svg width="520" height="520" ')}</div>
</div>`, 1200, 630);
out('icons/mightyman-social-1200x630.jpg', ['-strip', '-quality', '85']);

await b.close();
fs.unlinkSync(tmp);
console.log('rendered');
