// Soldier characters: rounded 3D bodies on a small skeleton of bones (hips,
// spine, head, two-part arms and legs) posed procedurally every frame. Each
// bone carries one merged mesh, so a soldier costs about 15 draw calls. The
// uniforms, helmets and insignia are original (no real-world emblems).
//
// Textures come from one procedural atlas (weathered fabric, skin with
// stubble, worn leather, chipped paint) plus a matching specular map; the
// colours are baked into vertex colours per faction and soldier type.
import * as THREE from 'three';
import { PartList, mat4, mergeGroup } from './merge.js';
import { gunModel } from './gunmodels.js';
import { UNIFORMS, UNIFORM_OF, SIDE_NATIONS, flagCanvas } from './nations.js';

export const FACTIONS = {
  // the enemy army: slate-grey tunics, rust armband, pale diamond insignia
  enemy: { tunic: 0x4f5965, trousers: 0x3b434b, helmet: 0x3e4540, band: 0xa8402c, insignia: 0xe0c870, pack: 0x484c46, tracer: 0xff7a40 },
  // allies: khaki-olive tunics, sand armband, slate-blue roundel
  ally: { tunic: 0x766a48, trousers: 0x5e5638, helmet: 0x5a5e3a, band: 0xd8c898, insignia: 0x2c5c8c, pack: 0x625c42, tracer: 0xd8f0c8 },
};
const SKINS = [0xd8b090, 0xc09070, 0x9a6c4c, 0x7a5238, 0xe4c0a0];
const LEATHER = 0x3c2c1e, BOOT = 0x2a2018, CANTEEN = 0x5a5c44, BEDROLL = 0x7a6c56;

// --------------------------------------------------------------- atlas
// four regions: 0 fabric, 1 skin, 2 leather, 3 painted metal
const R = [[0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5]];
const UV = R.map(([u, v, su, sv]) => [u + 0.01, v + 0.01, su - 0.02, sv - 0.02]);
let ATLAS = null;
function atlas() {
  if (ATLAS) return ATLAS;
  const S = 256, H = 128;
  const mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  const [cc, x] = mk(), [sc, y] = mk();
  const rnd = (a, b) => a + Math.random() * (b - a);
  const dots = (ctx, ox, oy, n, style, s = 1) => { ctx.fillStyle = style; for (let i = 0; i < n; i++) ctx.fillRect(ox + Math.random() * H, oy + Math.random() * H, s, s); };
  // fabric: weave, seams, dirt and wear
  x.fillStyle = '#d4d4d4'; x.fillRect(0, 0, H, H);
  for (let i = 0; i < H; i += 2) { x.fillStyle = `rgba(0,0,0,${rnd(0.03, 0.08)})`; x.fillRect(0, i, H, 1); x.fillRect(i, 0, 1, H); }
  for (let i = 0; i < 14; i++) { const g = x.createRadialGradient(rnd(0, H), rnd(0, H), 1, rnd(0, H), rnd(0, H), rnd(8, 26)); g.addColorStop(0, 'rgba(70,52,30,0.22)'); g.addColorStop(1, 'rgba(70,52,30,0)'); x.fillStyle = g; x.fillRect(0, 0, H, H); }
  dots(x, 0, 0, 900, 'rgba(255,255,255,0.08)'); dots(x, 0, 0, 900, 'rgba(0,0,0,0.1)');
  // skin with stubble around the jaw (sphere v 0.22-0.45)
  x.fillStyle = '#f2f2f2'; x.fillRect(H, 0, H, H);
  dots(x, H, 0, 400, 'rgba(120,70,60,0.08)', 2);
  x.fillStyle = 'rgba(40,30,25,0.35)';
  for (let i = 0; i < 900; i++) x.fillRect(H + Math.random() * H, H * (1 - 0.45) + Math.random() * H * 0.23, 1, 1);
  // leather: scuffs and cracks
  x.fillStyle = '#cfc4b8'; x.fillRect(0, H, H, H);
  for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(0,0,0,${rnd(0.1, 0.25)})`; x.beginPath(); const a = rnd(0, H), b = rnd(H, S); x.moveTo(a, b); x.lineTo(a + rnd(-10, 10), b + rnd(-6, 6)); x.stroke(); }
  dots(x, 0, H, 600, 'rgba(255,240,220,0.12)');
  // painted metal: matte paint with chips showing bare steel
  x.fillStyle = '#d8d8d8'; x.fillRect(H, H, H, H);
  dots(x, H, H, 700, 'rgba(0,0,0,0.12)', 2);
  for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(70,70,70,0.6)'; x.fillRect(H + rnd(0, H), H + rnd(0, H), rnd(1, 4), rnd(1, 3)); }
  // specular: fabric dull, skin a little sheen, leather and metal shinier
  const spec = ['#0a0a0a', '#3a3a3a', '#5a5a5a', '#6a6a6a'];
  R.forEach(([u, v], i) => { y.fillStyle = spec[i]; y.fillRect(u * S, (1 - v - 0.5) * S, H, H); });
  dots(y, H, H, 200, '#dddddd', 2);   // bare steel chips glint
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = c === cc ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4; return t; };
  ATLAS = new THREE.MeshPhongMaterial({ map: tex(cc), specularMap: tex(sc), vertexColors: true, specular: 0x8a8a8a, shininess: 28 });
  return ATLAS;
}

// ------------------------------------------------------------ geometry
const D = { low: [6, 2], medium: [8, 3], high: [12, 4] };
let SEG = D.medium;
export function setCharacterQuality(q) { SEG = D[q] || D.medium; }
const G = {};
const caps = (r, l) => { const k = `c${r}${l}${SEG}`; return G[k] || (G[k] = new THREE.CapsuleGeometry(r, l, SEG[1], SEG[0])); };
const sph = (r, ts = 0, tl = Math.PI) => { const k = `s${r}${ts}${tl}${SEG}`; return G[k] || (G[k] = new THREE.SphereGeometry(r, SEG[0] + 2, SEG[0], 0, Math.PI * 2, ts, tl)); };
const cyl = (r1, r2, h) => { const k = `y${r1}${r2}${h}${SEG}`; return G[k] || (G[k] = new THREE.CylinderGeometry(r1, r2, h, SEG[0] + 2)); };
const box = (w, h, d) => { const k = `b${w}${h}${d}`; return G[k] || (G[k] = new THREE.BoxGeometry(w, h, d)); };
const FAB = UV[0], SKIN = UV[1], LEA = UV[2], MET = UV[3];

// skeleton measurements (blocks; a soldier stands about 1.85 tall)
export const RIG = { hip: 0.93, thigh: 0.45, shin: 0.42, spine: 0.05, neck: 0.55, shoulderY: 0.47, shoulderX: 0.21, upper: 0.29, fore: 0.27 };

const VARIANTS = {};
// Town Life clothing: register a look, then use faction 'civ' with its key
// as the type. look = { shirt, trousers, vest, apron, dress, hat: 'cap' |
// 'felt' | 'scarf' | 'none', hair }
const LOOKS = {};
export function civLook(key, look) { LOOKS[key] = look; }
// faction 'ally' / 'enemy' for the old look; or a nation code (us, de, ...)
// whose side and uniform decide the colours and helmet
function variant(faction, type, skin) {
  const key = `${faction}|${type}|${skin}|${SEG}`;
  if (VARIANTS[key]) return VARIANTS[key];
  if (faction === 'civ') return (VARIANTS[key] = civVariant(LOOKS[type] || {}, skin));
  const nat = UNIFORM_OF[faction];
  const F = nat ? UNIFORMS[nat] : FACTIONS[faction];
  if (nat) faction = SIDE_NATIONS.axis.includes(nat) ? 'enemy' : 'ally';     // helmet shape: Axis deep, Allies bowl
  const officer = type === 'officer', commander = type === 'commander';
  const tunic = commander ? 0x2a2a2a : officer ? (faction === 'enemy' ? 0x353d46 : 0x63583c) : F.tunic;
  const sk = SKINS[skin % SKINS.length];
  const v = {};
  // hips: belt with buckle, pouches, canteen, entrenching tool, trouser seat
  let p = new PartList();
  p.add(caps(0.15, 0.08), mat4([0, 0.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.75]), F.trousers, FAB);
  p.add(cyl(0.175, 0.17, 0.07), mat4([0, 0.1, 0], 0, [1, 1, 0.72]), LEATHER, LEA);
  p.add(box(0.05, 0.04, 0.02), mat4([0, 0.1, -0.13]), 0xb89048, MET);              // brass buckle
  for (const s of [-1, 1]) {
    p.add(box(0.09, 0.08, 0.05), mat4([s * 0.09, 0.08, -0.13]), LEATHER, LEA);     // ammo pouches
    p.add(box(0.095, 0.02, 0.055), mat4([s * 0.09, 0.125, -0.13]), 0x30241a, LEA);
  }
  p.add(cyl(0.05, 0.05, 0.13), mat4([0.17, 0.03, 0.04], [0, 0, 0.05]), CANTEEN, FAB); // canteen
  p.add(cyl(0.02, 0.02, 0.02), mat4([0.172, 0.1, 0.04]), 0x2a2a28, MET);
  p.add(box(0.05, 0.2, 0.03), mat4([-0.17, -0.01, 0.06], [0.2, 0, 0]), F.pack, FAB);   // bayonet frog / tool
  v.hips = p.build();
  // torso: rounded chest, collar, breast pockets with flaps, buttons, braces
  p = new PartList();
  p.add(caps(0.17, 0.26), mat4([0, 0.3, 0], 0, [1.05, 1, 0.68]), tunic, FAB);
  p.add(cyl(0.075, 0.09, 0.07), mat4([0, 0.56, 0.0], 0, [1, 1, 0.9]), tunic, FAB);    // collar
  for (const s of [-1, 1]) {
    p.add(box(0.09, 0.09, 0.03), mat4([s * 0.085, 0.38, -0.105]), tunic, FAB);       // pockets
    p.add(box(0.095, 0.03, 0.035), mat4([s * 0.085, 0.43, -0.108]), tunic, FAB);     // flaps
    p.add(box(0.035, 0.5, 0.02), mat4([s * 0.08, 0.32, -0.112], [0, 0, s * 0.12]), LEATHER, LEA); // braces
    p.add(box(0.035, 0.45, 0.02), mat4([s * 0.08, 0.3, 0.112], [0, 0, -s * 0.1]), LEATHER, LEA);
  }
  for (let i = 0; i < 4; i++) p.add(box(0.016, 0.016, 0.01), mat4([0, 0.2 + i * 0.09, -0.118]), 0x8a7a50, MET);
  if (officer || commander) for (const s of [-1, 1]) p.add(box(0.08, 0.02, 0.1), mat4([s * 0.17, 0.53, 0]), faction === 'enemy' ? 0xa83a2a : 0xc8b070, MET); // shoulder boards
  if (type === 'gunner') { p.add(box(0.05, 0.62, 0.03), mat4([0, 0.32, -0.12], [0, 0, 0.7]), 0xb08c48, MET); }        // ammo belt
  if (type === 'grenadier') for (const s of [-1, 1]) p.add(cyl(0.035, 0.035, 0.1), mat4([s * 0.13, 0.2, -0.12]), 0x4a5038, MET);
  v.spine = p.build();
  // kit (hidden at distance): backpack, bedroll, shovel
  p = new PartList();
  p.add(box(0.28, 0.3, 0.12), mat4([0, 0.33, 0.17]), F.pack, FAB);
  p.add(box(0.29, 0.06, 0.13), mat4([0, 0.48, 0.17]), F.pack, FAB);
  p.add(cyl(0.065, 0.065, 0.36), mat4([0, 0.56, 0.19], [0, 0, Math.PI / 2]), BEDROLL, FAB);
  for (const s of [-1, 1]) p.add(cyl(0.068, 0.068, 0.02), mat4([s * 0.1, 0.56, 0.19], [0, 0, Math.PI / 2]), LEATHER, LEA);
  if (type === 'sniper') p.add(box(0.36, 0.42, 0.06), mat4([0, 0.3, 0.07]), 0x5a5a40, FAB);   // ghillie cape
  if (type === 'officer') p.add(box(0.1, 0.08, 0.05), mat4([0.15, 0.08, -0.06]), LEATHER, LEA); // map case
  v.kit = p.build();
  // head: skull, ears, neck; helmet or cap with chin strap
  p = new PartList();
  p.add(cyl(0.055, 0.06, 0.12), mat4([0, 0.02, 0]), sk, SKIN);
  p.add(sph(0.115), mat4([0, 0.15, 0], 0, [0.92, 1.08, 1]), sk, SKIN);
  p.add(sph(0.06), mat4([0, 0.08, -0.04], 0, [1.3, 0.75, 1.1]), sk, SKIN);          // jaw
  for (const s of [-1, 1]) p.add(sph(0.028), mat4([s * 0.105, 0.15, 0.01], 0, [0.5, 1, 0.8]), sk, SKIN);
  if (officer) {
    p.add(cyl(0.12, 0.125, 0.07), mat4([0, 0.26, 0]), tunic, FAB);
    p.add(cyl(0.15, 0.13, 0.04), mat4([0, 0.3, -0.01], 0, [1, 1, 1.1]), tunic, FAB);
    p.add(box(0.2, 0.012, 0.08), mat4([0, 0.23, -0.12], [-0.25, 0, 0]), 0x1a1a1a, LEA);
    p.add(box(0.04, 0.04, 0.01), mat4([0, 0.28, -0.135], [0, 0, Math.PI / 4]), F.insignia, MET);
  } else if (commander) {
    p.add(sph(0.13, 0, Math.PI / 2), mat4([0, 0.19, 0], 0, [1, 0.9, 1]), 0x1e1e1e, LEA);   // padded tanker cap
    p.add(box(0.14, 0.04, 0.03), mat4([0, 0.26, -0.11]), 0x6a6a60, MET);                // goggles
  } else {
    const H = F.helmet;
    if (faction === 'enemy') {
      // deep rounded helmet with flared neck guard and a low crest
      p.add(sph(0.15, 0, Math.PI / 2), mat4([0, 0.19, 0], 0, [1, 0.95, 1.05]), H, MET);
      p.add(cyl(0.15, 0.175, 0.06), mat4([0, 0.17, 0.01], 0, [1, 1, 1.05]), H, MET);
      p.add(box(0.025, 0.035, 0.24), mat4([0, 0.33, 0]), H, MET);
      p.add(box(0.045, 0.045, 0.01), mat4([0, 0.25, -0.155], [0, 0, Math.PI / 4]), F.insignia, MET);
    } else {
      // shallow bowl helmet with a wide brim and a roundel
      p.add(sph(0.14, 0, Math.PI / 2), mat4([0, 0.2, 0], 0, [1, 0.8, 1]), H, MET);
      p.add(cyl(0.23, 0.23, 0.014), mat4([0, 0.2, 0]), H, MET);
      p.add(cyl(0.03, 0.03, 0.01), mat4([0, 0.27, -0.125], [Math.PI / 2 - 0.4, 0, 0]), F.insignia, MET);
    }
    for (const s of [-1, 1]) p.add(box(0.012, 0.15, 0.02), mat4([s * 0.1, 0.13, -0.02], [0, 0, -s * 0.15]), LEATHER, LEA); // chin strap
    p.add(box(0.1, 0.015, 0.02), mat4([0, 0.055, -0.06]), LEATHER, LEA);
  }
  v.head = p.build();
  // face details (hidden at distance): eyes, brows, nose, mouth
  p = new PartList();
  for (const s of [-1, 1]) {
    p.add(sph(0.017), mat4([s * 0.042, 0.165, -0.098], 0, [1, 0.8, 0.6]), 0xf0ece0, MET);
    p.add(sph(0.009), mat4([s * 0.042, 0.165, -0.11]), 0x2a2018, MET);
    p.add(box(0.04, 0.01, 0.012), mat4([s * 0.045, 0.19, -0.104], [0, 0, s * 0.12]), 0x3a2a20, SKIN);
  }
  p.add(box(0.026, 0.05, 0.03), mat4([0, 0.14, -0.112], [0.25, 0, 0]), sk, SKIN);
  p.add(box(0.045, 0.008, 0.01), mat4([0, 0.095, -0.1]), 0x6a3a30, SKIN);
  v.face = p.build();
  // arms: sleeve with armband (left), forearm with cuff, hand
  for (const side of ['L', 'R']) {
    p = new PartList();
    p.add(caps(0.058, RIG.upper - 0.08), mat4([0, -RIG.upper / 2, 0]), tunic, FAB);
    if (side === 'L') p.add(cyl(0.064, 0.064, 0.06), mat4([0, -0.08, 0]), F.band, FAB);
    else p.add(cyl(0.063, 0.063, 0.05), mat4([0, -0.07, 0]), F.band, FAB);
    v['upper' + side] = p.build();
    p = new PartList();
    p.add(caps(0.05, RIG.fore - 0.08), mat4([0, -RIG.fore / 2 + 0.01, 0]), tunic, FAB);
    p.add(cyl(0.052, 0.055, 0.04), mat4([0, -RIG.fore + 0.04, 0]), tunic, FAB);
    p.add(sph(0.045), mat4([0, -RIG.fore - 0.03, -0.01], 0, [0.8, 1.15, 1]), sk, SKIN);
    v['fore' + side] = p.build();
  }
  // legs: trousers, puttees/gaiters, boots
  p = new PartList();
  p.add(caps(0.075, RIG.thigh - 0.12), mat4([0, -RIG.thigh / 2, 0]), F.trousers, FAB);
  p.add(box(0.08, 0.09, 0.03), mat4([0.06, -0.2, -0.04], [0, 0.6, 0]), F.trousers, FAB);    // thigh pocket
  v.thigh = p.build();
  p = new PartList();
  p.add(caps(0.062, RIG.shin - 0.14), mat4([0, -RIG.shin / 2 + 0.02, 0]), F.trousers, FAB);
  p.add(cyl(0.064, 0.058, 0.16), mat4([0, -RIG.shin + 0.1, 0]), faction === 'enemy' ? 0x2e2a26 : 0x7a6a50, FAB);  // gaiters
  p.add(box(0.11, 0.08, 0.24), mat4([0, -RIG.shin - 0.03, -0.045]), BOOT, LEA);
  p.add(sph(0.055, 0, Math.PI / 2), mat4([0, -RIG.shin - 0.03, -0.15], 0, [1, 0.7, 0.8]), BOOT, LEA);
  v.shin = p.build();
  VARIANTS[key] = v;
  return v;
}

// Peacetime clothes for townspeople: shirt and trousers or a dress, an
// optional waistcoat or apron, a cap, felt hat or headscarf.
function civVariant(L, skin) {
  const sk = SKINS[skin % SKINS.length];
  const shirt = L.shirt ?? 0xc8bca0, trousers = L.trousers ?? 0x4a4038, hair = L.hair ?? 0x3a2a1c;
  const v = {};
  let p = new PartList();
  if (L.dress) {
    p.add(cyl(0.16, 0.29, 0.62), mat4([0, -0.2, 0]), L.dress, FAB);                  // skirt to mid-calf
  } else p.add(caps(0.15, 0.08), mat4([0, 0.02, 0], [0, 0, Math.PI / 2], [1, 1, 0.75]), trousers, FAB);
  p.add(cyl(0.172, 0.17, 0.05), mat4([0, 0.1, 0], 0, [1, 1, 0.72]), L.dress ? L.dress : LEATHER, L.dress ? FAB : LEA);
  v.hips = p.build();
  p = new PartList();
  p.add(caps(0.165, 0.25), mat4([0, 0.3, 0], 0, [1.03, 1, 0.66]), L.dress || shirt, FAB);
  p.add(cyl(0.07, 0.085, 0.06), mat4([0, 0.56, 0], 0, [1, 1, 0.9]), shirt, FAB);
  if (L.vest) { p.add(caps(0.17, 0.2), mat4([0, 0.31, 0], 0, [1.06, 0.92, 0.7]), L.vest, FAB); for (let i = 0; i < 3; i++) p.add(box(0.014, 0.014, 0.01), mat4([0, 0.22 + i * 0.07, -0.12]), 0xc8b060, MET); }
  if (L.apron) p.add(box(0.26, 0.5, 0.02), mat4([0, 0.12, -0.125]), L.apron, FAB);
  if (L.braces) for (const s of [-1, 1]) p.add(box(0.03, 0.48, 0.02), mat4([s * 0.08, 0.32, -0.112], [0, 0, s * 0.1]), L.braces, LEA);
  v.spine = p.build();
  p = new PartList();
  if (L.bag) p.add(box(0.2, 0.18, 0.08), mat4([0.14, 0.12, 0.08], [0, 0, 0.2]), 0x6a5034, LEA);
  v.kit = p.build();
  p = new PartList();
  p.add(cyl(0.055, 0.06, 0.12), mat4([0, 0.02, 0]), sk, SKIN);
  p.add(sph(0.115), mat4([0, 0.15, 0], 0, [0.92, 1.08, 1]), sk, SKIN);
  p.add(sph(0.06), mat4([0, 0.08, -0.04], 0, [1.3, 0.75, 1.1]), sk, SKIN);
  for (const s of [-1, 1]) p.add(sph(0.028), mat4([s * 0.105, 0.15, 0.01], 0, [0.5, 1, 0.8]), sk, SKIN);
  p.add(sph(0.12, 0, Math.PI / 2), mat4([0, 0.17, 0.015], 0, [1, 0.8, 1.02]), hair, FAB);   // hair
  if (L.long) p.add(sph(0.075), mat4([0, 0.16, 0.11], 0, [1, 1.2, 0.8]), hair, FAB);        // bun
  if (L.hat === 'cap') {
    p.add(cyl(0.125, 0.13, 0.05), mat4([0, 0.25, 0.01]), L.hatColor ?? 0x5a5448, FAB);
    p.add(box(0.2, 0.015, 0.09), mat4([0, 0.235, -0.12], [-0.15, 0, 0]), L.hatColor ?? 0x5a5448, FAB);
  } else if (L.hat === 'felt') {
    p.add(cyl(0.2, 0.2, 0.015), mat4([0, 0.235, 0]), L.hatColor ?? 0x3a3430, FAB);
    p.add(cyl(0.1, 0.12, 0.1), mat4([0, 0.29, 0]), L.hatColor ?? 0x3a3430, FAB);
    p.add(cyl(0.122, 0.122, 0.022), mat4([0, 0.255, 0]), 0x1a1614, FAB);
  } else if (L.hat === 'scarf') {
    p.add(sph(0.13, 0, Math.PI * 0.62), mat4([0, 0.15, 0.01], 0, [1, 1.05, 1.05]), L.hatColor ?? 0x8a3a3a, FAB);
  }
  v.head = p.build();
  p = new PartList();
  for (const s of [-1, 1]) {
    p.add(sph(0.017), mat4([s * 0.042, 0.165, -0.098], 0, [1, 0.8, 0.6]), 0xf0ece0, MET);
    p.add(sph(0.009), mat4([s * 0.042, 0.165, -0.11]), 0x2a2018, MET);
    p.add(box(0.04, 0.01, 0.012), mat4([s * 0.045, 0.19, -0.104], [0, 0, s * 0.12]), hair, SKIN);
  }
  p.add(box(0.026, 0.05, 0.03), mat4([0, 0.14, -0.112], [0.25, 0, 0]), sk, SKIN);
  p.add(box(0.045, 0.008, 0.01), mat4([0, 0.095, -0.1]), 0x6a3a30, SKIN);
  if (L.moustache) p.add(box(0.06, 0.014, 0.012), mat4([0, 0.108, -0.106]), hair, FAB);
  v.face = p.build();
  for (const side of ['L', 'R']) {
    p = new PartList();
    p.add(caps(0.056, RIG.upper - 0.08), mat4([0, -RIG.upper / 2, 0]), L.dress || shirt, FAB);
    v['upper' + side] = p.build();
    p = new PartList();
    p.add(caps(0.048, RIG.fore - 0.08), mat4([0, -RIG.fore / 2 + 0.01, 0]), L.rolled ? sk : (L.dress || shirt), L.rolled ? SKIN : FAB);
    p.add(sph(0.045), mat4([0, -RIG.fore - 0.03, -0.01], 0, [0.8, 1.15, 1]), sk, SKIN);
    v['fore' + side] = p.build();
  }
  p = new PartList();
  p.add(caps(0.072, RIG.thigh - 0.12), mat4([0, -RIG.thigh / 2, 0]), L.dress ? sk : trousers, L.dress ? SKIN : FAB);
  v.thigh = p.build();
  p = new PartList();
  p.add(caps(0.06, RIG.shin - 0.14), mat4([0, -RIG.shin / 2 + 0.02, 0]), L.dress ? (L.stockings ?? 0x5a4a40) : trousers, FAB);
  p.add(box(0.1, 0.07, 0.22), mat4([0, -RIG.shin - 0.03, -0.045]), L.shoes ?? 0x2a1e16, LEA);
  v.shin = p.build();
  return v;
}

// --------------------------------------------------------------- shadow
let shadowTex = null;
function blobShadow() {
  if (!shadowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    shadowTex.userData.geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  }
  const m = new THREE.Mesh(shadowTex.userData.geo, shadowTex); m.renderOrder = 1;
  return m;
}

// sleeve patches: one small material per nation
let PATCH_GEO = null;
const PATCH_MATS = {};
function patchMat(n) {
  if (PATCH_MATS[n]) return PATCH_MATS[n];
  const t = new THREE.CanvasTexture(flagCanvas(n)); t.colorSpace = THREE.SRGBColorSpace;
  return (PATCH_MATS[n] = new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide }));
}

// ------------------------------------------------------------------ rig
const V = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), N = new THREE.Vector3();
const BX = new THREE.Vector3(), BY = new THREE.Vector3(), BZ = new THREE.Vector3(), MB = new THREE.Matrix4();
const lerp = (a, b, k) => a + (b - a) * k;

export class Character {
  constructor(faction, type, skin = Math.floor(Math.random() * SKINS.length)) {
    const v = variant(faction, type, skin);
    const mat = atlas();
    const bone = (parent, x, y, z, geo) => { const b = new THREE.Group(); b.position.set(x, y, z); parent.add(b); if (geo) { const m = new THREE.Mesh(geo, mat); b.add(m); b.userData.mesh = m; } return b; };
    this.root = new THREE.Group();
    this.body = bone(this.root, 0, 0, 0);
    this.hips = bone(this.body, 0, RIG.hip, 0, v.hips);
    this.spine = bone(this.hips, 0, RIG.spine, 0, v.spine);
    this.kit = new THREE.Mesh(v.kit, mat); this.spine.add(this.kit);
    this.head = bone(this.spine, 0, RIG.neck, 0, v.head);
    this.face = new THREE.Mesh(v.face, mat); this.head.add(this.face);
    this.armL = bone(this.spine, -RIG.shoulderX, RIG.shoulderY, 0, v.upperL);
    this.armR = bone(this.spine, RIG.shoulderX, RIG.shoulderY, 0, v.upperR);
    this.elbowL = bone(this.armL, 0, -RIG.upper, 0, v.foreL);
    this.elbowR = bone(this.armR, 0, -RIG.upper, 0, v.foreR);
    this.legL = bone(this.hips, -0.1, 0, 0, v.thigh);
    this.legR = bone(this.hips, 0.1, 0, 0, v.thigh);
    this.kneeL = bone(this.legL, 0, -RIG.thigh, 0, v.shin);
    this.kneeR = bone(this.legR, 0, -RIG.thigh, 0, v.shin);
    this.gun = bone(this.spine, 0, 0, 0);
    // a small patch with the home country's flag on the left sleeve
    if (UNIFORM_OF[faction]) {
      const pm = patchMat(faction);
      this.patch = new THREE.Mesh(PATCH_GEO || (PATCH_GEO = new THREE.PlaneGeometry(0.075, 0.05)), pm);
      this.patch.position.set(-0.062, -0.085, 0); this.patch.rotation.y = -Math.PI / 2;
      this.armL.add(this.patch);
    }
    this.shadow = blobShadow(); this.root.add(this.shadow);
    this.shadow.scale.set(0.9, 1, 0.9);
    this.weapon = undefined;
    this.phase = Math.random() * 6; this.t = 0;
    this.lod = 0;
    // smoothed pose values
    this.s = { crouch: 0, aim: 0, run: 0, lean: 0, look: 0, pitch: 0, kick: 0, swim: 0 };
  }

  setWeapon(id) {
    if (id === this.weapon) return;
    this.weapon = id;
    this.gun.clear();
    if (!id) return;
    const src = gunModel(id);
    if (!src) return;
    const merged = mergeGroup('gun:' + id, src);
    for (const part of merged.parts) this.gun.add(new THREE.Mesh(part.geometry, part.material));
    this.gunLen = src.userData.length || 0.6;
    this.oneHand = id === 'pistol' || id === 'knife';
  }

  // 0 = full detail, 1 = no kit or face, 2 = far (no kit, face or gun details)
  setLod(l) {
    if (l === this.lod) return;
    this.lod = l;
    this.kit.visible = l === 0; this.face.visible = l === 0;
    if (this.patch) this.patch.visible = l === 0;
  }

  // Two-bone IK: point the arm (shoulder bone + elbow bone) so the hand
  // reaches target (in spine space). The elbow bends toward `pole`.
  reach(arm, elbow, target, pole) {
    const S = arm.position, a = RIG.upper, b = RIG.fore + 0.03;
    V.subVectors(target, S);
    let d = V.length();
    d = Math.min(Math.max(d, 0.08), a + b - 0.001);
    V.normalize();
    const cosA = (a * a + d * d - b * b) / (2 * a * d);
    const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    // elbow position
    V2.copy(pole).addScaledVector(V, -pole.dot(V)).normalize();
    const E = V3.copy(S).addScaledVector(V, a * Math.cos(alpha)).addScaledVector(V2, a * Math.sin(alpha));
    const u = BY.subVectors(S, E).normalize();             // bone +Y points from elbow back to the shoulder
    const f = N.subVectors(target, E).normalize();          // forearm direction
    BX.crossVectors(f, u); if (BX.lengthSq() < 1e-6) BX.set(1, 0, 0); BX.normalize();
    BZ.crossVectors(BX, BY).normalize();
    BX.crossVectors(BY, BZ).normalize();
    MB.makeBasis(BX, BY, BZ);
    arm.quaternion.setFromRotationMatrix(MB);
    // forearm in the upper arm's frame: (0, -cos b, -sin b) == f
    const fy = f.dot(BY), fz = f.dot(BZ);
    elbow.rotation.set(Math.atan2(-fz, -fy), 0, 0);
  }

  // st: { speed, run, crouch, aim, pitch, look, kick, reload, throwT, climb, swim, dead, surrender, craft }
  pose(st, dt) {
    const s = this.s, k = Math.min(1, dt * 8);
    this.t += dt;
    s.crouch = lerp(s.crouch, st.crouch ? 1 : 0, k);
    s.aim = lerp(s.aim, st.aim ? 1 : 0, Math.min(1, dt * 6));
    s.run = lerp(s.run, st.run ? 1 : 0, k);
    s.swim = lerp(s.swim, st.swim ? 1 : 0, Math.min(1, dt * 4));
    s.look = lerp(s.look, st.look || 0, Math.min(1, dt * 7));
    s.pitch = lerp(s.pitch, st.pitch || 0, Math.min(1, dt * 7));
    s.kick = Math.max(0, s.kick - dt * 7);
    if (st.fired) s.kick = 1;
    const sp = st.speed || 0;
    this.phase += dt * sp * (st.run ? 1.55 : 1.9);
    const ph = this.phase;
    const moving = sp > 0.2 ? Math.min(1, sp / 2) : 0;
    const amp = (0.45 + 0.35 * s.run) * moving * (1 - s.crouch * 0.45);
    const sw = Math.sin(ph);

    const body = this.body;
    body.rotation.set(0, 0, 0); body.position.set(0, 0, 0);
    // ----- defeat: crumple and fall
    if (st.dead != null) {
      const f = Math.min(1, st.dead / 0.9), e = f * f * (3 - 2 * f);
      body.rotation.x = e * (Math.PI / 2 - 0.08) * (st.fallDir || 1);
      body.position.y = 0.1 * e;
      this.hips.position.y = RIG.hip - 0.25 * e * (1 - e);
      this.legL.rotation.set(-0.3 * e, 0, -0.1 * e); this.legR.rotation.set(0.2 * e, 0, 0.12 * e);
      this.kneeL.rotation.x = -0.5 * e; this.kneeR.rotation.x = -0.2 * e;
      this.spine.rotation.set(0.2 * e, 0, 0); this.head.rotation.set(-0.3 * e, 0.4 * e, 0);
      this.armL.rotation.set(-1.2 * e, 0, -0.6 * e); this.armR.rotation.set(-0.8 * e, 0, 0.9 * e);
      this.elbowL.rotation.x = 0.3; this.elbowR.rotation.x = 0.5;
      this.gun.visible = false;
      this.shadow.visible = false;
      return;
    }
    this.gun.visible = !!this.weapon; this.shadow.visible = true;

    // ----- legs and hips
    const crouch = s.crouch;
    let hipY = RIG.hip - crouch * 0.32 + Math.abs(Math.cos(ph)) * 0.03 * moving;
    let thighL = sw * amp, thighR = -sw * amp;
    let kneeL = Math.max(0, -Math.sin(ph - 0.9)) * amp * 1.6, kneeR = Math.max(0, Math.sin(ph - 0.9)) * amp * 1.6;
    if (crouch > 0.01) {
      thighL = lerp(thighL, -1.05 + sw * amp * 0.6, crouch); thighR = lerp(thighR, -0.55 - sw * amp * 0.6, crouch);
      kneeL = lerp(kneeL, 1.75, crouch); kneeR = lerp(kneeR, 1.6, crouch);
    }
    let lean = 0.08 * moving + 0.22 * s.run + 0.28 * crouch;
    // climbing: alternating reach, legs stepping
    if (st.climb) {
      const c = Math.sin(this.t * 6);
      thighL = -0.9 + c * 0.5; thighR = -0.9 - c * 0.5; kneeL = 1.2 - c * 0.4; kneeR = 1.2 + c * 0.4; lean = -0.1;
    }
    this.hips.position.y = hipY;
    this.legL.rotation.set(-thighL, 0, -0.02); this.legR.rotation.set(-thighR, 0, 0.02);
    this.kneeL.rotation.x = -kneeL; this.kneeR.rotation.x = -kneeR;   // knees flex backwards

    // ----- swimming: body near horizontal, flutter kick and breast stroke
    if (s.swim > 0.01) {
      body.rotation.x = -1.25 * s.swim;
      body.position.y = -0.6 * s.swim;
      const kk = Math.sin(this.t * 7) * 0.35;
      this.legL.rotation.x = lerp(this.legL.rotation.x, kk, s.swim); this.legR.rotation.x = lerp(this.legR.rotation.x, -kk, s.swim);
      this.kneeL.rotation.x = -lerp(kneeL, 0.3, s.swim); this.kneeR.rotation.x = -lerp(kneeR, 0.3, s.swim);
    }

    // ----- upper body: lean, twist toward the target, aim pitch
    const look = s.look, pitch = s.pitch * s.aim;
    this.hips.rotation.set(0, look * 0.35, 0);
    this.spine.rotation.set(-lean + s.kick * 0.06 * s.aim, look * 0.45, 0);
    this.head.rotation.set(-pitch * 0.5 + lean * 0.5 - (s.swim > 0.5 ? 0.9 : 0), look * 0.2, 0);

    // ----- weapon placement (spine space)
    const g = this.gun;
    const shY = RIG.shoulderY;
    if (st.surrender) {
      g.visible = false;
      this.reach(this.armL, this.elbowL, V.set(-0.22, shY + 0.5, -0.05).clone(), new THREE.Vector3(-1, 0, 0.3));
      this.reach(this.armR, this.elbowR, V.set(0.22, shY + 0.5, -0.05).clone(), new THREE.Vector3(1, 0, 0.3));
      return;
    }
    let reloadK = 0, throwK = 0;
    if (st.reload != null && st.reload >= 0) reloadK = Math.sin(Math.min(1, st.reload) * Math.PI);
    if (st.throwT != null && st.throwT >= 0) throwK = st.throwT;
    // ready (low, across the body) <-> aimed (stock on the right shoulder)
    const aim = s.aim * (1 - reloadK * 0.7);
    const carryX = 0.07, carryY = shY - 0.27, carryZ = -0.22;
    const aimX = this.oneHand ? 0.14 : 0.09, aimY = shY + 0.02, aimZ = this.oneHand ? -0.42 : -0.12;
    g.position.set(lerp(carryX, aimX, aim), lerp(carryY, aimY, aim) - reloadK * 0.08, lerp(carryZ, aimZ, aim) + s.kick * 0.05 * aim);
    g.rotation.set(lerp(-0.55, 0, aim) + lean * aim + pitch + s.kick * 0.18 * aim + reloadK * 0.5, lerp(0.4, -0.02, aim), reloadK * 0.4);
    if (st.swim) g.visible = false;
    g.updateMatrix();
    // hand targets on the weapon
    const grip = V.set(0, -0.06, 0.02).applyMatrix4(g.matrix).clone();
    const fore = V.set(0, -0.03, this.oneHand ? 0 : -Math.min(0.42, (this.gunLen || 0.6) * 0.35)).applyMatrix4(g.matrix).clone();
    const poleR = new THREE.Vector3(1, -1, 0.6), poleL = new THREE.Vector3(-1, -1.2, 0.2);
    if (moving && aim < 0.3 && !this.weapon) {
      // unarmed walk: free arm swing
      this.armL.rotation.set(sw * amp * 0.9, 0, -0.08); this.armR.rotation.set(-sw * amp * 0.9, 0, 0.08);
      this.elbowL.rotation.x = -0.3 - s.run * 0.9; this.elbowR.rotation.x = -0.3 - s.run * 0.9;
    } else {
      this.reach(this.armR, this.elbowR, grip, poleR);
      if (this.oneHand && aim < 0.5) {
        this.armL.rotation.set(sw * amp * 0.8, 0, -0.1); this.elbowL.rotation.x = -0.3 - s.run * 0.8;
      } else if (reloadK > 0) {
        // the support hand goes to the magazine / bolt and back
        this.reach(this.armL, this.elbowL, V2.copy(fore).lerp(grip, reloadK).add(V3.set(0.02, -0.06 * reloadK, 0)).clone(), poleL);
      } else this.reach(this.armL, this.elbowL, fore, poleL);
    }
    // throwing: right arm winds back over the shoulder and snaps forward
    if (throwK > 0) {
      const tk = throwK;   // 1 -> 0 over the throw
      const back = tk > 0.5 ? (1 - tk) * 2 : tk * 2;
      this.armR.rotation.set(lerp(-0.5, -2.9, back), 0, 0.3); this.elbowR.rotation.x = -1.2 * back;
      g.visible = false;
    }
    // climbing: hands reach up alternately
    if (st.climb) {
      const c = Math.sin(this.t * 6);
      this.armL.rotation.set(-2.6 + c * 0.4, 0, -0.1); this.armR.rotation.set(-2.6 - c * 0.4, 0, 0.1);
      this.elbowL.rotation.x = -0.4; this.elbowR.rotation.x = -0.4;
      g.visible = false;
    }
    if (s.swim > 0.5) {
      const c = this.t * 3;
      this.armL.rotation.set(-2.4 + Math.sin(c) * 0.9, 0, -0.5 - Math.cos(c) * 0.4);
      this.armR.rotation.set(-2.4 + Math.sin(c) * 0.9, 0, 0.5 + Math.cos(c) * 0.4);
      this.elbowL.rotation.x = -0.3; this.elbowR.rotation.x = -0.3;
    }
  }

  place(pos, yaw, groundY) {
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    this.shadow.position.y = (groundY != null ? groundY - pos.y : 0) + 0.03;
  }

  // world-space muzzle position (for tracers and flashes)
  muzzle(out) {
    this.root.updateMatrixWorld(true);
    return out.set(0, 0.03, -(this.gunLen || 0.6) * 0.72).applyMatrix4(this.gun.matrixWorld);
  }

  dispose() { this.root.removeFromParent(); }
}
