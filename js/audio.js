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
  splash() { noise(0.5, { type: 'bandpass', freq: 1800, gain: 0.3, freqEnd: 400, q: 0.8 }); },
  swim() { noise(0.3, { type: 'bandpass', freq: 900, gain: 0.12, freqEnd: 500, q: 1 }); },
  click() { tone(520, 0.05, { type: 'square', gain: 0.06 }); },
  toggle() { tone(880, 0.04, { type: 'square', gain: 0.05 }); tone(660, 0.05, { type: 'square', gain: 0.05, delay: 0.05 }); },
  hurt() { tone(160, 0.2, { type: 'sawtooth', gain: 0.12, freqEnd: 90 }); noise(0.15, { freq: 400, gain: 0.15 }); },
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
  growl(vol = 1) { noise(0.9, { type: 'lowpass', freq: 260, gain: 0.25 * vol, freqEnd: 120, attack: 0.08 }); tone(70, 0.8, { type: 'sawtooth', gain: 0.06 * vol, freqEnd: 55, attack: 0.1 }); },
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
