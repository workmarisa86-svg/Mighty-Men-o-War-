// Official logo: three battle-worn soldiers of the fictional army, the one
// in the middle firing a machine gun straight at the viewer. Hand-made SVG
// (no copied art); the slate-blue roundel is the army's own insignia.
// Exported as markup so the page's military web font is used for the name.

const defs = `
<defs>
  <radialGradient id="lgSky" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#5a5642"/><stop offset=".55" stop-color="#3a3a2c"/><stop offset="1" stop-color="#1e1f17"/></radialGradient>
  <radialGradient id="lgFlash" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe6"/><stop offset=".22" stop-color="#ffe9a0"/><stop offset=".5" stop-color="#ffb347" stop-opacity=".95"/><stop offset=".8" stop-color="#e0652a" stop-opacity=".55"/><stop offset="1" stop-color="#b03a10" stop-opacity="0"/></radialGradient>
  <radialGradient id="lgGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".55"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
  <linearGradient id="lgHelm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a7f72"/><stop offset=".55" stop-color="#565b50"/><stop offset="1" stop-color="#3b3f37"/></linearGradient>
  <linearGradient id="lgSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a982"/><stop offset="1" stop-color="#a87554"/></linearGradient>
  <linearGradient id="lgSkinLit" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f0c08a"/><stop offset="1" stop-color="#b07a56"/></linearGradient>
  <linearGradient id="lgOlive" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b6744"/><stop offset="1" stop-color="#47442c"/></linearGradient>
  <linearGradient id="lgSteel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a525c"/><stop offset=".5" stop-color="#262b31"/><stop offset="1" stop-color="#14171b"/></linearGradient>
  <linearGradient id="lgMud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a3a28"/><stop offset="1" stop-color="#241b12"/></linearGradient>
  <pattern id="lgStub" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#3a2a20" opacity=".7"/><circle cx="3" cy="3" r=".6" fill="#3a2a20" opacity=".5"/></pattern>
  <filter id="lgGrunge" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .08  0 0 0 0 .05  0 0 0 -1.6 1.15"/><feComposite in2="SourceGraphic" operator="in"/></filter>
</defs>`;

// one soldier's head: helmet (with roundel), face, stubble, scowl, chin strap
function head(x, y, s, lit = false) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-34 6 C-36 40 -26 70 -10 80 C-4 84 4 84 10 80 C26 70 36 40 34 6 Z" fill="url(#${lit ? 'lgSkinLit' : 'lgSkin'})"/>
    <path d="M-30 44 C-26 66 -14 80 0 82 C14 80 26 66 30 44 C20 54 -20 54 -30 44Z" fill="url(#lgStub)"/>
    <path d="M-36 8 C-30 2 30 2 36 8 L34 18 C20 12 -20 12 -34 18Z" fill="#000" opacity=".35"/>
    <path d="M-26 26 L-8 31 L-9 35 L-25 31Z M26 26 L8 31 L9 35 L25 31Z" fill="#2a1e16"/>
    <path d="M-22 33 C-18 30 -12 31 -9 35 C-13 37 -19 37 -22 33Z M22 33 C18 30 12 31 9 35 C13 37 19 37 22 33Z" fill="#f4ead8"/>
    <circle cx="-15" cy="34" r="2.3" fill="#1a120c"/><circle cx="15" cy="34" r="2.3" fill="#1a120c"/>
    <path d="M-4 34 L-7 52 C-3 55 3 55 7 52 L4 34Z" fill="#9a6a4a" opacity=".8"/>
    <path d="M-14 63 C-6 59 6 59 14 63 C8 66 -8 66 -14 63Z" fill="#5a2e22"/>
    <path d="M-12 63 L12 63" stroke="#e8dccb" stroke-width="1.6"/>
    <path d="M18 40 L26 52" stroke="#8a4a3a" stroke-width="1.4" opacity=".8"/>
    <path d="M-33 12 C-31 40 -24 62 -14 76 M33 12 C31 40 24 62 14 76" stroke="#3a2a1c" stroke-width="2.2" fill="none"/>
    <path d="M-46 8 C-44 -40 -20 -58 0 -58 C20 -58 44 -40 46 8 Z" fill="url(#lgHelm)"/>
    <path d="M-52 6 C-30 16 30 16 52 6 C52 12 30 22 0 22 C-30 22 -52 12 -52 6Z" fill="#3e4239"/>
    <path d="M-30 -30 C-20 -46 0 -52 14 -48" stroke="#9aa093" stroke-width="3" fill="none" opacity=".5"/>
    <circle cx="0" cy="-16" r="10" fill="#2c5c8c" stroke="#d8d0b0" stroke-width="2.5"/><circle cx="0" cy="-16" r="3.5" fill="#d8d0b0"/>
    <path d="M-40 -6 l6 -3 M30 -20 l7 2 M-18 -44 l5 4" stroke="#2a2c26" stroke-width="2"/>
  </g>`;
}

const scene = `
  <rect width="640" height="520" fill="url(#lgSky)"/>
  <circle cx="320" cy="300" r="250" fill="url(#lgGlow)"/>
  <path d="M0 330 C80 300 160 340 240 318 C330 296 420 336 520 312 C580 300 620 316 640 312 V520 H0Z" fill="#2a2418" opacity=".8"/>
  <!-- left soldier: pointing at the viewer -->
  <g>
    <path d="M60 340 C64 300 92 282 134 280 C176 282 206 300 210 340 L214 420 H56Z" fill="url(#lgOlive)"/>
    <path d="M86 290 L150 400 M182 292 L120 400" stroke="#4a3622" stroke-width="9"/>
    <rect x="96" y="352" width="22" height="20" rx="3" fill="#4e3a24"/><rect x="150" y="352" width="22" height="20" rx="3" fill="#4e3a24"/>
    ${head(135, 214, 0.86)}
    <path d="M190 300 C214 296 232 306 236 322 C238 338 226 346 214 344 C206 334 196 322 190 300Z" fill="#6b6744"/>
    <path d="M214 316 C232 312 250 318 256 330 C262 346 248 356 234 352 C226 348 218 336 214 316Z" fill="url(#lgSkinLit)"/>
    <path d="M206 300 l8 6 l-4 6 l10 2 l-6 6 l8 4" stroke="#47442c" stroke-width="3" fill="none"/>
    <path d="M244 336 C254 330 266 330 272 336 C276 342 270 350 260 350 C252 350 246 344 244 336Z" fill="url(#lgSkinLit)"/>
    <ellipse cx="270" cy="334" rx="7" ry="9" fill="#f2c69a" stroke="#8a5a3a" stroke-width="1.5"/>
  </g>
  <!-- right soldier: firing his rifle -->
  <g>
    <path d="M430 344 C436 304 466 286 506 284 C548 286 574 304 580 344 L586 420 H426Z" fill="url(#lgOlive)"/>
    <path d="M456 296 L530 404 M556 298 L492 404" stroke="#4a3622" stroke-width="9"/>
    ${head(505, 218, 0.86)}
    <path d="M546 300 C568 304 580 320 576 340 C572 356 556 360 544 352 C536 336 538 316 546 300Z" fill="url(#lgSkin)"/>
    <path d="M552 300 l-6 8 l8 4 l-8 6" stroke="#47442c" stroke-width="3" fill="none"/>
    <path d="M590 372 L452 306" stroke="#5a3e24" stroke-width="13" stroke-linecap="round"/>
    <path d="M470 314 L404 284" stroke="#22272c" stroke-width="7" stroke-linecap="round"/>
    <path d="M520 352 C506 346 494 340 486 332" stroke="url(#lgSkin)" stroke-width="20" stroke-linecap="round"/>
    <path d="M404 284 l-26 -22 l10 20 l-30 -6 l24 14 l-28 10 l30 0 l-12 18 l22 -16 Z" fill="url(#lgFlash)"/>
  </g>
  <!-- the gunner in the middle -->
  <g>
    <path d="M196 352 C200 286 250 256 320 254 C390 256 440 286 444 352 L450 470 H190Z" fill="url(#lgOlive)"/>
    <path d="M230 270 L330 470 M410 270 L310 470" stroke="#4a3622" stroke-width="12"/>
    <rect x="252" y="392" width="34" height="30" rx="4" fill="#4e3a24"/><rect x="354" y="392" width="34" height="30" rx="4" fill="#4e3a24"/>
    <path d="M262 392 h14 M364 392 h14" stroke="#2c2016" stroke-width="3"/>
    <path d="M300 236 h40 v26 h-40Z" fill="#a87554"/>
    ${head(320, 168, 1.12, true)}
    <!-- big bare arms through torn sleeves -->
    <path d="M206 290 C186 300 178 330 186 356 L214 348 C214 326 220 308 232 296Z" fill="#6b6744"/>
    <path d="M190 344 l10 -8 l4 10 l8 -10 l6 10 l10 -6" stroke="#47442c" stroke-width="3" fill="none"/>
    <path d="M186 352 C178 380 190 404 214 410 C238 414 262 392 274 366 L250 348 C236 360 226 370 218 360 C212 352 210 346 212 344Z" fill="url(#lgSkinLit)"/>
    <path d="M198 368 C206 380 220 384 232 378" stroke="#8a5a3a" stroke-width="2" fill="none" opacity=".7"/>
    <path d="M434 290 C454 300 462 330 454 356 L426 348 C426 326 420 308 408 296Z" fill="#6b6744"/>
    <path d="M450 344 l-10 -8 l-4 10 l-8 -10 l-6 10 l-10 -6" stroke="#47442c" stroke-width="3" fill="none"/>
    <path d="M454 352 C462 380 450 404 426 410 C402 414 378 392 366 366 L390 348 C404 360 414 370 422 360 C428 352 430 346 428 344Z" fill="url(#lgSkinLit)"/>
    <path d="M442 368 C434 380 420 384 408 378" stroke="#8a5a3a" stroke-width="2" fill="none" opacity=".7"/>
    <!-- machine gun, muzzle toward the viewer -->
    <path d="M262 330 h116 l10 44 h-136Z" fill="url(#lgSteel)"/>
    <path d="M250 352 C236 372 236 398 246 420" stroke="#b8923c" stroke-width="12" stroke-dasharray="5 3" fill="none"/>
    <ellipse cx="320" cy="352" rx="48" ry="44" fill="#1c2024" stroke="#4a525c" stroke-width="4"/>
    ${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = i / 8 * Math.PI * 2; return `<circle cx="${(320 + Math.cos(a) * 33).toFixed(1)}" cy="${(352 + Math.sin(a) * 30).toFixed(1)}" r="4.5" fill="#0a0c0e"/>`; }).join('')}
    <ellipse cx="320" cy="352" rx="18" ry="17" fill="#33393f"/>
  </g>
  <!-- muzzle flash and motion -->
  <path d="M320 352 l18 -92 l8 78 l56 -64 l-30 72 l92 -18 l-80 40 l84 34 l-92 -4 l38 70 l-62 -52 l-14 88 l-12 -86 l-58 58 l30 -70 l-96 6 l84 -36 l-80 -36 l90 14 l-40 -70 l60 58Z" fill="url(#lgFlash)"/>
  <circle cx="320" cy="352" r="16" fill="#fffef4"/>
  <path d="M232 250 l-40 -26 M410 248 l44 -24 M222 452 l-46 22 M420 456 l48 20" stroke="#ffd890" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <!-- sandbags in front -->
  <g fill="#6e6248" stroke="#3a3122" stroke-width="2">
    <rect x="-10" y="424" width="96" height="40" rx="18"/><rect x="80" y="430" width="96" height="40" rx="18"/><rect x="456" y="430" width="96" height="40" rx="18"/><rect x="548" y="424" width="100" height="40" rx="18"/>
  </g>
  <rect width="640" height="520" filter="url(#lgGrunge)" opacity=".55"/>`;

const title = (font) => `
  <g>
    <rect x="0" y="444" width="640" height="76" fill="url(#lgMud)"/>
    <path d="M0 444 H640" stroke="#8a7a50" stroke-width="2"/>
    <text x="320" y="500" text-anchor="middle" font-family="${font}" font-size="50" letter-spacing="2" fill="#1a160e" transform="translate(3 3)">Mighty Man o' War</text>
    <text x="320" y="500" text-anchor="middle" font-family="${font}" font-size="50" letter-spacing="2" fill="#e2cf92" stroke="#3a2c14" stroke-width="1.2">Mighty Man o' War</text>
  </g>`;

export const LOGO_FONT = "'Black Ops One', Impact, 'Arial Black', sans-serif";
export function logoSvg(cls = '') {
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 520" role="img" aria-label="Mighty Man o' War">${defs}${scene}${title(LOGO_FONT)}</svg>`;
}

// simplified app icon: the gunner and the muzzle flash only
export function iconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" rx="96" fill="url(#lgSky)"/>
  <circle cx="256" cy="300" r="230" fill="url(#lgGlow)"/>
  <path d="M96 512 C100 400 170 360 256 358 C342 360 412 400 416 512Z" fill="url(#lgOlive)"/>
  ${head(256, 200, 1.75, true)}
  <ellipse cx="256" cy="400" rx="62" ry="56" fill="#1c2024" stroke="#4a525c" stroke-width="5"/>
  <path d="M256 400 l22 -110 l10 92 l70 -76 l-36 86 l110 -22 l-96 48 l100 40 l-110 -4 l46 84 l-74 -62 l-18 104 l-14 -102 l-70 70 l36 -84 l-114 8 l100 -44 l-96 -42 l108 16 l-48 -84 l72 70Z" fill="url(#lgFlash)"/>
  <circle cx="256" cy="400" r="20" fill="#fffef4"/>
  <rect width="512" height="512" rx="96" filter="url(#lgGrunge)" opacity=".5"/>
</svg>`;
}
export function logoFileSvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 520">${defs}${scene}${title(LOGO_FONT)}</svg>`;
}
