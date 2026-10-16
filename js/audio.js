// Every sound is synthesized live with the Web Audio API (no audio files).
let ctx = null, master = null, noiseBuf = null, muffle = null, verb = null;
let volume = 0.7;
let rainNode = null, rainGain = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume;
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.7;
    // a gentle limiter so loud gunfire never clips
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.18;
    master.connect(muffle); muffle.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    setTimeout(loadSamples, 1500);         // any recordings dropped into sounds/
  } catch { ctx = null; }
}
// under water every sound is muffled
export function setMuffled(on) { if (muffle) muffle.frequency.setTargetAtTime(on ? 650 : 20000, ctx.currentTime, 0.12); }
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

// the outdoor echo: a short synthetic reverb (made once, on first use), so
// gunshots roll off the hills instead of stopping dead
function reverb() {
  if (verb || !ctx) return verb;
  const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) { const k = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 3) * (i < ctx.sampleRate * 0.03 ? 0.2 : 1); }
  }
  verb = ctx.createConvolver(); verb.buffer = ir;
  const g = ctx.createGain(); g.gain.value = 0.5; verb.connect(g); g.connect(master);
  return verb;
}
function wetSend(g, wet) { if (wet > 0 && reverb()) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(verb); } }
function noise(dur, { type = 'lowpass', freq = 800, q = 1, gain = 0.5, attack = 0.005, freqEnd = null, delay = 0, wet = 0 } = {}) {
  if (!ctx || !(gain > 0.0005)) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); wetSend(g, wet);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.3, freqEnd = null, delay = 0, attack = 0.005, wet = 0 } = {}) {
  if (!ctx || !(gain > 0.0005)) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); wetSend(g, wet); o.start(t); o.stop(t + dur + 0.05);
}

// A throat: a buzzing oscillator (its pitch following a curve, with a little
// wobble) through two vocal-tract resonances, under a noisy breath. Used for
// growls, roars, howls, yelps and grunts; every call varies slightly.
function voice(dur, { f = [120, 90], type = 'sawtooth', gain = 0.2, form = [500, 1100], q = 4, breath = 0.3, vib = 6, vibAmt = 0.03, attack = 0.04, delay = 0, wet = 0.15, rough = 0 } = {}) {
  if (!ctx || !(gain > 0.0005)) return;
  const t = ctx.currentTime + delay, v = 0.94 + Math.random() * 0.12;
  const o = ctx.createOscillator(); o.type = type;
  const curve = new Float32Array(f.map((x) => x * v));
  o.frequency.setValueCurveAtTime(curve, t, dur);
  const lfo = ctx.createOscillator(); lfo.frequency.value = vib * (0.85 + Math.random() * 0.3);
  const lg = ctx.createGain(); lg.gain.value = f[0] * v * vibAmt; lfo.connect(lg); lg.connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.setValueAtTime(gain, t + Math.max(attack, dur * 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let src = o;
  if (rough) {                         // a rattling, gravelly throat: amplitude flutter
    const am = ctx.createGain(), fl = ctx.createOscillator(), fg = ctx.createGain();
    fl.frequency.value = 22 + Math.random() * 14; fg.gain.value = rough; am.gain.value = 1 - rough * 0.5;
    fl.connect(fg); fg.connect(am.gain); o.connect(am); src = am; fl.start(t); fl.stop(t + dur + 0.05);
  }
  for (const [fq, k] of [[form[0], 1], [form[1], 0.6]]) {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq * (0.92 + Math.random() * 0.16); bp.Q.value = q;
    const kg = ctx.createGain(); kg.gain.value = k * 3; src.connect(bp); bp.connect(kg); kg.connect(g);
  }
  g.connect(master); wetSend(g, wet);
  o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  if (breath) noise(dur * 0.9, { type: 'bandpass', freq: form[0] * 1.3, q: 1.2, gain: gain * breath, attack: attack * 1.5, delay, wet });
}
const vary = (x, k = 0.12) => x * (1 - k + Math.random() * 2 * k);

export const sfx = {
  step(surface) {
    if (surface === 'mud') noise(0.16, { freq: 420, gain: 0.22, q: 3, freqEnd: 220 });
    else if (surface === 'wood') { tone(140 + Math.random() * 30, 0.08, { type: 'triangle', gain: 0.12 }); noise(0.05, { freq: 1500, gain: 0.05 }); }
    else if (surface === 'stone') noise(0.07, { type: 'bandpass', freq: 2200, gain: 0.12, q: 2 });
    else noise(0.1, { freq: 650, gain: 0.16, q: 1.5 });
  },
  dig(block) {
    if (block === 'wood' || block === 'log') tone(180 + Math.random() * 40, 0.09, { type: 'square', gain: 0.07, freqEnd: 120 });
    else if (block === 'stone' || block === 'iron') { noise(0.06, { type: 'highpass', freq: 2500, gain: 0.18 }); tone(900, 0.04, { type: 'square', gain: 0.03 }); }
    else noise(0.12, { freq: 500, gain: 0.25, freqEnd: 200 });
  },
  breakBlock(block) {
    if (block === 'wood' || block === 'log') { noise(0.3, { freq: 900, gain: 0.25, freqEnd: 200 }); tone(110, 0.25, { type: 'triangle', gain: 0.15, freqEnd: 60 }); }
    else if (block === 'stone' || block === 'iron') noise(0.25, { type: 'bandpass', freq: 1600, gain: 0.3, freqEnd: 400, q: 1 });
    else noise(0.22, { freq: 600, gain: 0.32, freqEnd: 150 });
  },
  fell() { noise(1.1, { freq: 700, gain: 0.35, freqEnd: 90, attack: 0.05 }); tone(70, 0.8, { type: 'triangle', gain: 0.2, freqEnd: 40, delay: 0.5 }); },
  place() { tone(160, 0.08, { type: 'triangle', gain: 0.2, freqEnd: 90 }); noise(0.06, { freq: 900, gain: 0.12 }); },
  swim() { noise(0.3, { type: 'bandpass', freq: 900, gain: 0.12, freqEnd: 500, q: 1 }); },
  click() { tone(520, 0.05, { type: 'square', gain: 0.06 }); },
  toggle() { tone(880, 0.04, { type: 'square', gain: 0.05 }); tone(660, 0.05, { type: 'square', gain: 0.05, delay: 0.05 }); },
  craftTick() { tone(300 + Math.random() * 80, 0.05, { type: 'square', gain: 0.04 }); },
  done() { tone(523, 0.1, { type: 'triangle', gain: 0.15 }); tone(784, 0.18, { type: 'triangle', gain: 0.15, delay: 0.1 }); },
  error() { tone(200, 0.15, { type: 'square', gain: 0.06, freqEnd: 150 }); },
  // Gunshots, built like the real thing: the sharp muzzle crack (and the
  // bullet's supersonic snap for rifles), the blast, a deep low boom you feel,
  // the echo rolling back off the land, and the gun's own action (the pistol's
  // slide, the rifle's bolt, the shotgun's double report). Far away the crack
  // and the highs fade first and more of what you hear is echo.
  shot(kind, vol = 1) {
    if (kind === 'suppressed') {
      noise(0.05, { type: 'bandpass', freq: 1100, gain: 0.16 * vol, q: 1.4 }); noise(0.09, { type: 'lowpass', freq: 600, gain: 0.08 * vol, freqEnd: 200 });
      tone(2400, 0.015, { type: 'square', gain: 0.02 * vol, delay: 0.06 });          // the slide
      return;
    }
    const P = {
      pistol:  { g: 0.55, crack: 3200, blast: 0.16, lo: 120, tail: 0.9, snap: 0 },
      smg:     { g: 0.42, crack: 3600, blast: 0.1, lo: 130, tail: 0.5, snap: 0 },
      rifle:   { g: 0.75, crack: 2600, blast: 0.26, lo: 90, tail: 1.4, snap: 0.5 },
      sniper:  { g: 0.85, crack: 2400, blast: 0.32, lo: 75, tail: 1.6, snap: 0.6 },
      shotgun: { g: 0.85, crack: 1800, blast: 0.3, lo: 70, tail: 1.3, snap: 0 },
    }[kind] || { g: 0.6, crack: 3000, blast: 0.2, lo: 100, tail: 1, snap: 0 };
    const v = Math.max(0, Math.min(1, vol)), far = 1 - v, top = 1500 + 8500 * v * v, G = P.g * (0.35 + 0.65 * v);
    if (P.snap) noise(0.012, { type: 'highpass', freq: 4500, gain: P.snap * (0.4 + 0.6 * v) });                     // supersonic snap
    noise(0.025, { type: 'highpass', freq: Math.min(P.crack, top), gain: G * 1.1 * v + 0.02 });                      // muzzle crack
    noise(P.blast, { type: 'lowpass', freq: Math.min(5000, top), gain: G, freqEnd: 220, attack: 0.001, q: 0.7, wet: 0.35 + far });   // blast
    tone(P.lo * 1.5, 0.32, { type: 'sine', gain: G * 0.9, freqEnd: P.lo * 0.42, attack: 0.002 });               // the low boom
    noise(0.12, { type: 'lowpass', freq: 260, gain: G * 0.6, freqEnd: 60, attack: 0.002 });
    noise(P.tail, { type: 'lowpass', freq: Math.min(1100, top), gain: G * (0.16 + far * 0.25), freqEnd: 120, attack: 0.05, delay: 0.06 + far * 0.15, wet: 0.9 });   // the echo
    if (kind === 'shotgun') { noise(0.2, { type: 'lowpass', freq: Math.min(3500, top), gain: G * 0.45, freqEnd: 200, delay: 0.035, attack: 0.002 }); }
    if (v > 0.6) {    // the action, only heard close by
      if (kind === 'pistol') { tone(2600, 0.012, { type: 'square', gain: 0.025, delay: 0.05 }); tone(1700, 0.015, { type: 'square', gain: 0.02, delay: 0.075 }); }
      if (kind === 'rifle' || kind === 'sniper') { noise(0.04, { type: 'bandpass', freq: 2200, gain: 0.07, q: 3, delay: 0.5 }); noise(0.05, { type: 'bandpass', freq: 1700, gain: 0.08, q: 3, delay: 0.68 }); tone(900, 0.02, { type: 'square', gain: 0.02, delay: 0.78 }); }
    }
  },
  swish() { noise(0.16, { type: 'bandpass', freq: 2400, gain: 0.12, freqEnd: 900, q: 2, attack: 0.04 }); },
  stab() { noise(0.08, { freq: 500, gain: 0.25 }); tone(140, 0.08, { type: 'triangle', gain: 0.1, freqEnd: 80 }); },
  hitMark() { tone(1400, 0.04, { type: 'square', gain: 0.04 }); },
  ricochet() { tone(2600 + Math.random() * 800, 0.18, { type: 'sine', gain: 0.03, freqEnd: 900 }); },
  pig(vol = 1) { tone(140 + Math.random() * 30, 0.25, { type: 'square', gain: 0.05 * vol, freqEnd: 90 }); tone(120, 0.15, { type: 'sawtooth', gain: 0.03 * vol, freqEnd: 80, delay: 0.18 }); },
  cow(vol = 1) { tone(110 + Math.random() * 20, 1.0, { type: 'sawtooth', gain: 0.05 * vol, freqEnd: 85, attack: 0.15 }); },
  bird(vol = 1) { for (let i = 0; i < 3; i++) tone(2200 + Math.random() * 900, 0.06, { type: 'sine', gain: 0.03 * vol, freqEnd: 1600, delay: i * 0.09 }); },
  flap(vol = 1) { for (let i = 0; i < 4; i++) noise(0.06, { type: 'bandpass', freq: 700, gain: 0.08 * vol, q: 1, delay: i * 0.07 }); },
  squeal(vol = 1) { tone(500, 0.3, { type: 'square', gain: 0.05 * vol, freqEnd: 260 }); },
  eat() { for (let i = 0; i < 3; i++) noise(0.07, { type: 'bandpass', freq: 1200, gain: 0.12, q: 1, delay: i * 0.18 }); },
  ignite() { noise(0.12, { type: 'highpass', freq: 3000, gain: 0.2 }); noise(0.6, { freq: 600, gain: 0.2, freqEnd: 200, delay: 0.1, attack: 0.1 }); },
  crackle(vol = 1) { noise(0.03, { type: 'highpass', freq: 2500, gain: 0.08 * vol }); },
  heal() { tone(440, 0.15, { type: 'triangle', gain: 0.08 }); tone(660, 0.25, { type: 'triangle', gain: 0.08, delay: 0.12 }); },
  warn() { tone(330, 0.25, { type: 'square', gain: 0.05 }); tone(262, 0.35, { type: 'square', gain: 0.05, delay: 0.25 }); },
  explosion(vol = 1, big = true) {
    if (vol <= 0.01) return;
    noise(big ? 2.2 : 1.2, { freq: 900, gain: 0.9 * vol, freqEnd: 50, attack: 0.005 });
    noise(0.12, { type: 'highpass', freq: 1500, gain: 0.5 * vol });
    tone(big ? 48 : 70, big ? 1.4 : 0.8, { type: 'sine', gain: 0.7 * vol, freqEnd: 28 });
  },
  bounce(vol = 1) { tone(320 + Math.random() * 120, 0.06, { type: 'triangle', gain: 0.12 * vol, freqEnd: 200 }); },
  hiss(vol = 1) { noise(0.25, { type: 'highpass', freq: 4000, gain: 0.07 * vol }); },
  smoke(vol = 1) { noise(2.0, { type: 'bandpass', freq: 1800, gain: 0.12 * vol, attack: 0.2, q: 0.6 }); },
  defuse() { tone(900, 0.05, { type: 'square', gain: 0.08 }); tone(600, 0.08, { type: 'square', gain: 0.06, delay: 0.08 }); },
  scope() { tone(1200, 0.03, { type: 'square', gain: 0.04 }); noise(0.05, { type: 'highpass', freq: 3000, gain: 0.05 }); },
  whistle(vol = 1) { tone(1400, 0.6, { type: 'sine', gain: 0.05 * vol, freqEnd: 500 }); },
  cannon(vol = 1) { noise(0.9, { freq: 600, gain: 0.8 * vol, freqEnd: 40 }); tone(45, 0.8, { type: 'sine', gain: 0.6 * vol, freqEnd: 25 }); },
  engine(vol = 1) { tone(38 + Math.random() * 6, 0.5, { type: 'sawtooth', gain: 0.05 * vol, attack: 0.1 }); },
  thump() { tone(90, 0.12, { type: 'sine', gain: 0.25, freqEnd: 50 }); },
  // ---- creatures and bodies (layered and varied: no two the same)
  growl(vol = 1) {
    const d = vary(1.1, 0.25);
    voice(d, { f: [vary(78), vary(92), vary(70), vary(62)], gain: 0.22 * vol, form: [vary(320), vary(700)], q: 3, breath: 0.6, rough: 0.7, vib: 4, attack: 0.12, wet: 0.2 });
    noise(d, { type: 'lowpass', freq: 240, gain: 0.18 * vol, freqEnd: 110, attack: 0.1 });
  },
  roar(vol = 1) {
    const d = vary(1.7, 0.15);
    voice(d, { f: [vary(95), vary(150), vary(170), vary(120), vary(80)], gain: 0.34 * vol, form: [vary(480), vary(1050)], q: 2.5, breath: 0.9, rough: 0.8, vib: 5, vibAmt: 0.05, attack: 0.15, wet: 0.45 });
    voice(d * 0.9, { f: [vary(48), vary(70), vary(60)], type: 'square', gain: 0.12 * vol, form: [220, 420], q: 2, breath: 0, rough: 0.6, attack: 0.2 });
    noise(d, { type: 'bandpass', freq: vary(900), q: 0.8, gain: 0.2 * vol, freqEnd: 300, attack: 0.18, wet: 0.4 });
  },
  howl(vol = 1) {
    const d = vary(2.6, 0.15), lo = vary(330, 0.08), hi = lo * vary(1.55, 0.06);
    voice(d, { f: [lo, hi, hi * 1.02, hi * 0.98, hi * 0.9, lo * 0.95], type: 'triangle', gain: 0.16 * vol, form: [vary(850), vary(1700)], q: 3, breath: 0.15, vib: 5.5, vibAmt: 0.012, attack: 0.35, wet: 0.8 });
  },
  snarl(vol = 1) {
    const n = 8 + (Math.random() * 6 | 0);
    for (let i = 0; i < n; i++) noise(0.05, { type: 'bandpass', freq: vary(780, 0.25), q: 2.2, gain: 0.13 * vol, delay: i * vary(0.045, 0.2), attack: 0.004 });
    voice(n * 0.045 + 0.1, { f: [vary(140), vary(180), vary(130)], gain: 0.1 * vol, form: [650, 1500], q: 3, breath: 0.5, rough: 0.9, attack: 0.03 });
  },
  yelp(vol = 1) { voice(vary(0.32), { f: [vary(700), vary(1300), vary(850)], type: 'triangle', gain: 0.14 * vol, form: [1100, 2200], q: 2.5, breath: 0.1, attack: 0.01, wet: 0.3 }); },
  bite(vol = 1) {
    noise(0.05, { type: 'highpass', freq: 1800, gain: 0.32 * vol, attack: 0.002 });                    // teeth
    noise(0.12, { type: 'lowpass', freq: 700, gain: 0.3 * vol, freqEnd: 200, attack: 0.003, delay: 0.02 });   // the crunch
    tone(vary(110), 0.14, { type: 'sine', gain: 0.25 * vol, freqEnd: 50, delay: 0.02 });
  },
  claw() {
    for (let i = 0; i < 3; i++) noise(0.09, { type: 'bandpass', freq: vary(2600), q: 1.5, gain: 0.22, freqEnd: 900, delay: i * vary(0.05), attack: 0.01 });   // the swipe
    noise(0.2, { type: 'bandpass', freq: vary(1300), q: 0.9, gain: 0.25, freqEnd: 500, delay: 0.06, attack: 0.005 });        // cloth and skin tearing
    sfx.impact(0.8);
  },
  // a heavy blow landing on you: a deep thud you feel
  impact(vol = 1) {
    tone(vary(68), 0.3, { type: 'sine', gain: 0.5 * vol, freqEnd: 32, attack: 0.002 });
    noise(0.16, { type: 'lowpass', freq: 320, gain: 0.45 * vol, freqEnd: 70, attack: 0.002 });
    noise(0.04, { type: 'bandpass', freq: 1200, gain: 0.15 * vol, q: 1 });
  },
  // your own pain: a short grunt (bigger hits, deeper and louder)
  hurt(vol = 1) {
    const big = vol > 0.9;
    voice(vary(big ? 0.38 : 0.26), { f: [vary(big ? 150 : 170), vary(big ? 120 : 145), vary(100)], gain: (big ? 0.2 : 0.14) * Math.min(1.3, vol), form: [vary(600), vary(1300)], q: 4, breath: 0.7, rough: big ? 0.4 : 0.2, attack: 0.012, wet: 0.05 });
  },
  heartbeat(vol = 1, rate = 1) {
    tone(54, 0.14, { type: 'sine', gain: 0.5 * vol, freqEnd: 38, attack: 0.008 }); noise(0.1, { type: 'lowpass', freq: 110, gain: 0.35 * vol, attack: 0.008 });
    const d2 = 0.28 / rate;
    tone(48, 0.16, { type: 'sine', gain: 0.32 * vol, freqEnd: 34, attack: 0.01, delay: d2 }); noise(0.1, { type: 'lowpass', freq: 100, gain: 0.22 * vol, attack: 0.01, delay: d2 });
  },
  splash(vol = 1) {
    noise(vary(0.5), { type: 'bandpass', freq: vary(1700), gain: 0.3 * vol, freqEnd: 380, q: 0.8, attack: 0.01 });
    for (let i = 0; i < 4; i++) tone(vary(900, 0.4), 0.05, { type: 'sine', gain: 0.03 * vol, freqEnd: vary(1800, 0.3), delay: 0.08 + i * vary(0.07, 0.4) });   // droplets
  },
  fishCast() { noise(0.35, { type: 'bandpass', freq: 3000, q: 1.5, gain: 0.1, freqEnd: 1200, attack: 0.05 }); for (let i = 0; i < 6; i++) tone(2400, 0.015, { type: 'square', gain: 0.015, delay: 0.05 + i * 0.035 }); },
  fishPlop(vol = 1) { tone(vary(520), 0.12, { type: 'sine', gain: 0.12 * vol, freqEnd: 180 }); noise(0.15, { type: 'bandpass', freq: 1400, gain: 0.08 * vol, q: 1 }); },
  fishBite() { sfx.splash(0.8); tone(vary(380), 0.1, { type: 'sine', gain: 0.1, freqEnd: 150, delay: 0.05 }); },
  fishReel() { for (let i = 0; i < 14; i++) tone(vary(2100, 0.05), 0.012, { type: 'square', gain: 0.02, delay: i * 0.045 }); sfx.splash(0.5); },
  // your death: a long low fall of sound
  death() { voice(2.6, { f: [140, 110, 70, 45], gain: 0.12, form: [400, 900], q: 3, breath: 0.8, attack: 0.05, wet: 0.6 }); noise(2.8, { type: 'lowpass', freq: 400, gain: 0.18, freqEnd: 60, attack: 0.3, wet: 0.7 }); },
  // air-raid style siren: rising and falling wail
  siren() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.09, t0 + 0.4);
    g.gain.setValueAtTime(0.09, t0 + 3.4); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 4.2);
    o.frequency.setValueAtTime(260, t0);
    for (let i = 0; i < 2; i++) { o.frequency.linearRampToValueAtTime(620, t0 + 1 + i * 2); o.frequency.linearRampToValueAtTime(300, t0 + 2 + i * 2); }
    o.connect(f); f.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 4.3);
  },
  radio() { noise(0.08, { type: 'bandpass', freq: 2200, gain: 0.08, q: 3 }); tone(1100, 0.05, { type: 'square', gain: 0.03, delay: 0.06 }); },
  thunder() { noise(2.5, { freq: 300, gain: 0.5, freqEnd: 60, attack: 0.2 }); },
  // danger warning (grenades, lit charges): a sharp two-tone alarm, no voice
  alert() { for (let i = 0; i < 3; i++) { tone(1320, 0.07, { type: 'square', gain: 0.07, delay: i * 0.16 }); tone(990, 0.07, { type: 'square', gain: 0.07, delay: i * 0.16 + 0.08 }); } },
  // speech is never spoken: a short mumble in the speaker's own pitch
  mumble(pitch = 1, n = 4, vol = 1) {
    let tt = 0;
    for (let i = 0; i < n; i++) {
      const f = (150 + Math.random() * 70) * pitch, d = 0.06 + Math.random() * 0.07;
      tone(f, d, { type: 'triangle', gain: 0.05 * vol, freqEnd: f * (0.8 + Math.random() * 0.4), delay: tt, attack: 0.015 });
      noise(d * 0.8, { type: 'bandpass', freq: 900 + Math.random() * 900, gain: 0.02 * vol, q: 4, delay: tt });
      tt += d + 0.03 + Math.random() * 0.05;
    }
  },
  cluck(vol = 1) { for (let i = 0; i < 2 + (Math.random() * 3 | 0); i++) tone(520 + Math.random() * 120, 0.05, { type: 'square', gain: 0.035 * vol, freqEnd: 380, delay: i * 0.11 }); },
  deer(vol = 1) { tone(900, 0.18, { type: 'triangle', gain: 0.05 * vol, freqEnd: 500 }); },
  owl(vol = 1) { tone(420, 0.35, { type: 'sine', gain: 0.05 * vol, freqEnd: 380, attack: 0.05 }); tone(400, 0.6, { type: 'sine', gain: 0.05 * vol, freqEnd: 360, delay: 0.5, attack: 0.08 }); },
  cricket(vol = 1) { for (let i = 0; i < 3; i++) tone(4300 + Math.random() * 300, 0.03, { type: 'sine', gain: 0.018 * vol, delay: i * 0.05 }); },
  songbird(vol = 1) {
    const base = 2000 + Math.random() * 1500; let tt = 0;
    for (let i = 0; i < 3 + (Math.random() * 4 | 0); i++) { const f = base * (0.8 + Math.random() * 0.5); tone(f, 0.07, { type: 'sine', gain: 0.025 * vol, freqEnd: f * (0.7 + Math.random() * 0.6), delay: tt }); tt += 0.08 + Math.random() * 0.06; }
  },
  coins() { for (let i = 0; i < 3; i++) tone(1800 + i * 300, 0.08, { type: 'triangle', gain: 0.05, delay: i * 0.06 }); },
};

// Continuous wind bed; intensity 0..1
let windNode = null, windGain = null, windF = null;
export function setWind(intensity) {
  if (!ctx) return;
  if (!windNode) {
    windNode = ctx.createBufferSource(); windNode.buffer = noiseBuf; windNode.loop = true; windNode.playbackRate.value = 0.5;
    windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 400; windF.Q.value = 0.6;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    windNode.connect(windF); windF.connect(windGain); windGain.connect(master); windNode.start();
  }
  windGain.gain.setTargetAtTime(intensity * 0.07, ctx.currentTime, 1.5);
  windF.frequency.setTargetAtTime(280 + intensity * 500 + Math.random() * 120, ctx.currentTime, 2);
}

// Continuous rain bed; intensity 0..1
export function setRain(intensity) {
  if (!ctx) return;
  if (!rainNode) {
    rainNode = ctx.createBufferSource(); rainNode.buffer = noiseBuf; rainNode.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 0.4;
    rainGain = ctx.createGain(); rainGain.gain.value = 0;
    rainNode.connect(f); f.connect(rainGain); rainGain.connect(master); rainNode.start();
  }
  rainGain.gain.setTargetAtTime(intensity * 0.16, ctx.currentTime, 0.5);
}
// ---- drop-in recordings --------------------------------------------------------
// Put a recording in the sounds/ folder with one of these names (.ogg or .mp3)
// and the game plays it instead of the sound it makes itself (see
// sounds/README.md). Each entry: the sfx it replaces and which argument
// carries the volume (-1: none). Missing files simply aren't used.
export const SOUND_FILES = {
  gunshot_pistol: ['shot', 1, 'pistol'], gunshot_rifle: ['shot', 1, 'rifle'], gunshot_sniper: ['shot', 1, 'sniper'],
  gunshot_smg: ['shot', 1, 'smg'], gunshot_shotgun: ['shot', 1, 'shotgun'], gunshot_suppressed: ['shot', 1, 'suppressed'],
  explosion: ['explosion', 0], bear_roar: ['roar', 0], bear_growl: ['growl', 0], wolf_howl: ['howl', 0], wolf_snarl: ['snarl', 0],
  wolf_yelp: ['yelp', 0], bite: ['bite', 0], claw: ['claw', -1], impact: ['impact', 0], pain: ['hurt', 0], heartbeat: ['heartbeat', 0],
  splash: ['splash', 0], fish_cast: ['fishCast', -1], fish_plop: ['fishPlop', 0], fish_bite: ['fishBite', -1], fish_reel: ['fishReel', -1],
  death: ['death', -1], thunder: ['thunder', -1], footstep: ['step', -1],
};
const samples = {};
let samplesTried = false;
async function loadSamples() {
  if (samplesTried || !ctx) return; samplesTried = true;
  const base = new URL('../sounds/', import.meta.url);
  for (const name of Object.keys(SOUND_FILES)) {
    for (const ext of ['ogg', 'mp3']) {
      try {
        const r = await fetch(new URL(name + '.' + ext, base));
        if (!r.ok) continue;
        samples[name] = await ctx.decodeAudioData(await r.arrayBuffer());
        break;
      } catch { /* not there, or this browser can't play the format */ }
    }
  }
}
function playSample(name, vol = 1) {
  const buf = samples[name];
  if (!buf || !ctx) return false;
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.96 + Math.random() * 0.08;   // never quite the same twice
  const g = ctx.createGain(); g.gain.value = Math.max(0, Math.min(1.5, vol));
  src.connect(g); g.connect(master); wetSend(g, 0.15); src.start();
  return true;
}
// wrap each replaceable sfx: a recording when there is one, else the made sound
for (const [name, [fn, volArg, kind]] of Object.entries(SOUND_FILES)) {
  const orig = sfx[fn];
  if (!orig || orig.wrapped) continue;
  const names = Object.entries(SOUND_FILES).filter(([, v]) => v[0] === fn);
  const w = function (...args) {
    for (const [nm, [, va, kd]] of names) {
      if (kd && args[0] !== kd) continue;
      if (samples[nm] && playSample(nm, va >= 0 && args[va] != null ? args[va] : 1)) return;
    }
    return orig.apply(sfx, args);
  };
  w.wrapped = true; sfx[fn] = w;
  void name; void volArg; void kind;
}
export function audioCtx() { return ctx; }
export function audioOut() { return master || (ctx && ctx.destination); }
// a running engine (army cars): a low sawtooth with a rumble, its pitch and
// loudness following the speed; set(0) idles, stop() switches it off
export function engineLoop() {
  if (!ctx) return { set() {}, stop() {} };
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 34;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 3; lfo.connect(lg).connect(o.frequency);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
  const g = ctx.createGain(); g.gain.value = 0.0001;
  o.connect(f).connect(g).connect(master); o.start(); lfo.start();
  g.gain.setTargetAtTime(0.05, ctx.currentTime, 0.3);
  return {
    set(k) { const t = ctx.currentTime; o.frequency.setTargetAtTime(34 + k * 46, t, 0.25); lfo.frequency.setTargetAtTime(9 + k * 14, t, 0.25); f.frequency.setTargetAtTime(260 + k * 420, t, 0.25); g.gain.setTargetAtTime(0.05 + k * 0.05, t, 0.25); },
    stop() { const t = ctx.currentTime; g.gain.setTargetAtTime(0.0001, t, 0.15); setTimeout(() => { try { o.stop(); lfo.stop(); } catch { /* */ } g.disconnect(); }, 600); },
  };
}
