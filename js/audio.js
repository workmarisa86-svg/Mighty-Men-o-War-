// Every sound is synthesized live with the Web Audio API (no audio files).
let ctx = null, master = null, noiseBuf = null;
let volume = 0.7;
let rainNode = null, rainGain = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

function noise(dur, { type = 'lowpass', freq = 800, q = 1, gain = 0.5, attack = 0.005, freqEnd = null, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.3, freqEnd = null, delay = 0, attack = 0.005 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
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
  thunder() { noise(2.5, { freq: 300, gain: 0.5, freqEnd: 60, attack: 0.2 }); },
};

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
