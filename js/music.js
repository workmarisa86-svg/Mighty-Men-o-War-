// Main-menu music: a quiet, solemn instrumental march arranged from the
// public-domain 1860s tune "When Johnny Comes Marching Home" (no lyrics).
// Fife lead, soft snare, low brass-like bed; all synthesized, looped.
import { audioCtx } from './audio.js';

const N = { G3: 196.0, A3: 220.0, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25 };
// [note, length in eighths]; 6/8 time, A minor
const TUNE = [
  ['E4', 1],
  ['A4', 2], ['A4', 1], ['A4', 2], ['B4', 1], ['C5', 2], ['B4', 1], ['C5', 2], ['A4', 1], ['E5', 3], ['E5', 2], ['C5', 1], ['E5', 3], ['-', 2], ['E4', 1],
  ['A4', 2], ['A4', 1], ['A4', 2], ['B4', 1], ['C5', 2], ['B4', 1], ['C5', 2], ['A4', 1], ['G4', 3], ['D5', 3], ['D5', 3], ['-', 2], ['D5', 1],
  ['E5', 2], ['E5', 1], ['D5', 2], ['C5', 1], ['B4', 2], ['A4', 1], ['B4', 2], ['G4', 1], ['C5', 2], ['C5', 1], ['B4', 2], ['A4', 1], ['G4', 3], ['-', 2], ['G4', 1],
  ['C5', 2], ['B4', 1], ['A4', 2], ['G4', 1], ['E4', 2], ['A4', 1], ['A4', 2], ['B4', 1], ['C5', 2], ['B4', 1], ['A4', 2], ['G4', 1], ['A4', 3], ['-', 3],
];
// one chord root per bar (6 eighths) for the low bed
const BED = ['A3', 'A3', 'C4', 'A3', 'A3', 'A3', 'G3', 'G3', 'C4', 'G3', 'C4', 'G3', 'C4', 'A3', 'E4', 'A3'];
const EIGHTH = 0.3;             // slow and steady

let bus = null, running = false, timer = null, pos = 0, nextT = 0, barT = 0, bar = 0, level = 0.5, noise = null;

function ensure(ctx) {
  if (bus) return;
  bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
  const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function fife(ctx, f, t, dur) {
  const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
  o.type = 'triangle'; o.frequency.value = f * 2; o2.type = 'sine'; o2.frequency.value = f * 4; 
  const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.2; vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
  lp.type = 'lowpass'; lp.frequency.value = 3200;
  const g2 = ctx.createGain(); g2.gain.value = 0.18;
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bus);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.11, t + 0.04);
  g.gain.setValueAtTime(0.09, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.98);
  for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur); }
}
function bed(ctx, f, t, dur) {
  for (const m of [1, 1.5, 2]) {        // root, fifth, octave: a soft low brass / string pad
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = f / 2 * m;
    lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
    o.connect(lp); lp.connect(g); g.connect(bus);
    const a = m === 1 ? 0.05 : 0.025;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(a, t + 0.5);
    g.gain.setValueAtTime(a, t + dur - 0.4); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
function snare(ctx, t, amt) {
  const s = ctx.createBufferSource(); s.buffer = noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1900; hp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * amt, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  s.connect(hp); hp.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.15);
}
function schedule() {
  const ctx = audioCtx();
  if (!ctx || !running) return;
  while (nextT < ctx.currentTime + 0.6) {
    const [n, len] = TUNE[pos];
    if (n !== '-') fife(ctx, N[n], nextT, len * EIGHTH);
    nextT += len * EIGHTH;
    pos = (pos + 1) % TUNE.length;
    if (pos === 0) nextT += EIGHTH * 2;   // a breath before the tune comes round again
  }
  while (barT < ctx.currentTime + 0.6) {
    bed(ctx, N[BED[bar % BED.length]], barT, EIGHTH * 6);
    // soft march pattern: beats 1 and 4, a light ruff before beat 1 every other bar
    snare(ctx, barT, 1); snare(ctx, barT + EIGHTH * 3, 0.7);
    if (bar % 2) { snare(ctx, barT + EIGHTH * 5, 0.35); snare(ctx, barT + EIGHTH * 5.5, 0.45); }
    barT += EIGHTH * 6; bar++;
  }
}
// volume 0..1, muted
export function setMusic(v, muted) {
  level = muted ? 0 : v * 0.6;
  const ctx = audioCtx();
  if (bus && ctx && running) bus.gain.setTargetAtTime(Math.max(0.0001, level), ctx.currentTime, 0.3);
}
export function startMusic() {
  const ctx = audioCtx();
  if (!ctx || running) return;
  ensure(ctx);
  running = true;
  pos = 0; bar = 0; nextT = barT = ctx.currentTime + 0.2;
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setValueAtTime(0.0001, ctx.currentTime);
  bus.gain.setTargetAtTime(Math.max(0.0001, level), ctx.currentTime, 0.9);   // fade in
  timer = setInterval(schedule, 120);
  schedule();
}
export function stopMusic() {
  const ctx = audioCtx();
  if (!running || !ctx) return;
  running = false;
  clearInterval(timer);
  bus.gain.cancelScheduledValues(ctx.currentTime);
  bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.5);                   // fade out
}
export function musicPlaying() { return running; }
