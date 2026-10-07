// Town Life music: calm country tunes made live with the Web Audio API (no
// recordings). Each tune is a gentle waltz in G or D: a plucked bass and
// guitar, and a soft whistle melody built from the chords. Tunes play AABB,
// then a pause, then a new tune. Volume follows the Music setting.
import { audioCtx } from './audio.js';

const SCALES = { G: [55, 57, 59, 60, 62, 64, 66], D: [50, 52, 54, 55, 57, 59, 61] };   // MIDI, major scale
// chord progressions (scale degrees of the chord roots, 0-based)
const PROGS = [[0, 0, 3, 0, 4, 4, 0, 0], [0, 3, 0, 4, 5, 3, 4, 0], [0, 5, 3, 4, 0, 5, 4, 0]];
const RHYTHMS = [[1, 1, 1], [2, 1], [1, 2], [3], [1, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

let out = null, timer = null, vol = 0.45, muted = false, playing = false;
let song = null, nextT = 0, bar = 0, part = 0, restUntil = 0, seed = 1;

function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

function note(freq, t, dur, { type = 'triangle', gain = 0.1, attack = 0.01, decay = null, filter = null, vibrato = 0 } = {}) {
  const ctx = audioCtx();
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  else { g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.08)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  let node = o;
  if (filter) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); node = f; }
  if (vibrato) {
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2; lg.gain.value = freq * vibrato;
    l.connect(lg); lg.connect(o.frequency); l.start(t + 0.15); l.stop(t + dur + 0.1);
  }
  node.connect(g); g.connect(out);
  o.start(t); o.stop(t + (decay || dur) + 0.1);
}

function newSong() {
  seed = Math.floor(Math.random() * 1e9) + 1;
  const key = rnd() < 0.5 ? 'G' : 'D';
  const prog = PROGS[Math.floor(rnd() * PROGS.length)];
  const beat = 60 / (78 + rnd() * 16);
  const makePart = (lift) => prog.map((root, i) => {
    const r = RHYTHMS[Math.floor(rnd() * RHYTHMS.length)];
    let pos = 0;
    return r.map((len) => {
      const chordTone = [0, 2, 4][Math.floor(rnd() * 3)];
      let deg = root + chordTone + (rnd() < 0.25 ? (rnd() < 0.5 ? 1 : -1) : 0) + lift;
      if (i === prog.length - 1 && pos + len >= 3) deg = 7;       // end on the home note
      const n = { deg, start: pos, len };
      pos += len; return n;
    });
  });
  return { key, prog, beat, parts: [makePart(0), makePart(2)] };
}

function scaleNote(key, deg, octave = 0) {
  const sc = SCALES[key], o = Math.floor(deg / 7);
  return sc[((deg % 7) + 7) % 7] + 12 * (o + octave);
}

function schedule() {
  const ctx = audioCtx();
  if (!ctx || !playing) return;
  while (nextT < ctx.currentTime + 0.6) {
    if (ctx.currentTime < restUntil) { nextT = restUntil; return; }
    if (!song) { song = newSong(); bar = 0; part = 0; }
    const b = song.beat, t = nextT, root = song.prog[bar];
    // bass on 1, guitar on 2 and 3
    note(midi(scaleNote(song.key, root, -1)), t, b * 0.9, { type: 'triangle', gain: 0.07, decay: b * 1.2, filter: 700 });
    for (const k of [1, 2]) for (const [i, ct] of [0, 2, 4].entries()) {
      note(midi(scaleNote(song.key, root + ct, 0)), t + b * k + i * 0.012, b * 0.6, { type: 'triangle', gain: 0.022, decay: b * 0.7, filter: 1600 });
    }
    // melody (A part twice, then B part twice)
    const ph = song.parts[part >> 1][bar];
    for (const n of ph) note(midi(scaleNote(song.key, n.deg, 1)), t + n.start * b, n.len * b * 0.95, { type: 'sine', gain: 0.05, attack: 0.04, vibrato: 0.006 });
    nextT += b * 3;
    bar++;
    if (bar >= song.prog.length) {
      bar = 0; part++;
      if (part >= 4) { song = null; restUntil = nextT + 6 + Math.random() * 8; }
    }
  }
}

export function startFolk() {
  const ctx = audioCtx();
  if (playing || !ctx) { playing = !!ctx; return; }
  if (!out) { out = ctx.createGain(); out.connect(ctx.destination); }
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, muted ? 0.0001 : vol), ctx.currentTime + 3);
  playing = true; nextT = ctx.currentTime + 0.5; song = null; restUntil = 0;
  timer = setInterval(schedule, 120);
}
export function stopFolk() {
  const ctx = audioCtx();
  if (!playing) return;
  playing = false; clearInterval(timer); timer = null;
  if (ctx && out) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); }
}
export function setFolk(v, mute) {
  vol = Math.max(0.0001, v * 0.9); muted = !!mute;
  const ctx = audioCtx();
  if (ctx && out && playing) out.gain.setTargetAtTime(muted ? 0.0001 : vol, ctx.currentTime, 0.3);
}
export function folkPlaying() { return playing; }
