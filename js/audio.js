// Every sound is synthesized live with the Web Audio API (no audio files).
let ctx = null, master = null, noiseBuf = null, muffle = null;
let volume = 0.7;
let rainNode = null, rainGain = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume;
    muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.7;
    master.connect(muffle); muffle.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
// under water every sound is muffled
export function setMuffled(on) { if (muffle) muffle.frequency.setTargetAtTime(on ? 650 : 20000, ctx.currentTime, 0.12); }
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

function noise(dur, { type = 'lowpass', freq = 800, q = 1, gain = 0.5, attack = 0.005, freqEnd = null, delay = 0 } = {}) {
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
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.3, freqEnd = null, delay = 0, attack = 0.005 } = {}) {
  if (!ctx || !(gain > 0.0005)) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
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
  // gunshots: sharp crack + body thump; vol falls off with distance (0..1)
  shot(kind, vol = 1) {
    if (kind === 'suppressed') { noise(0.07, { type: 'bandpass', freq: 1400, gain: 0.12 * vol, q: 1.2 }); tone(180, 0.05, { type: 'triangle', gain: 0.05 * vol, freqEnd: 90 }); return; }
    const g = { pistol: 0.45, rifle: 0.7, sniper: 0.85, smg: 0.38 }[kind] || 0.5;
    const f = { pistol: 1800, rifle: 1200, sniper: 900, smg: 2000 }[kind] || 1500;
    noise(0.05, { type: 'highpass', freq: f, gain: g * vol });
    noise(kind === 'sniper' ? 0.9 : kind === 'rifle' ? 0.6 : 0.3, { freq: f / 3, gain: g * 0.8 * vol, freqEnd: 80 });
    tone(kind === 'sniper' ? 70 : 110, 0.18, { type: 'triangle', gain: g * 0.6 * vol, freqEnd: 40 });
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
