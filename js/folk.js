// In-game music, made live with the Web Audio API (no recordings): well-known
// public-domain tunes, one after another with a quiet pause between them.
//   Town Life (also its menu): old cowboy and frontier songs on harmonica and
//   whistle over a plucked "boom-chick" bass and a strummed guitar.
//   War (while playing): marches on fife and bugle over a tuba bass and a
//   snare drum; now and then Taps on a lone bugle.
// The tunes are written below as notes (name+octave/beats); the chords are
// worked out bar by bar from the melody (I, IV or V of the key).
// Volume follows the Music setting; it stays soft under the game's sounds.
import { audioCtx } from './audio.js';

const COWBOY = [
  { name: 'Oh! Susanna', key: 0, bar: 4, pickup: 1, bpm: 112, notes:
    'C4/.5 D4/.5 E4/1 G4/1 G4/1.5 A4/.5 G4/1 E4/1 C4/1.5 D4/.5 E4/1 E4/1 D4/1 C4/1 D4/3 C4/.5 D4/.5 ' +
    'E4/1 G4/1 G4/1.5 A4/.5 G4/1 E4/1 C4/1.5 D4/.5 E4/1 E4/1 D4/1 D4/1 C4/3 R/1 ' +
    'F4/2 F4/1 A4/1 A4/1 A4/1 G4/1 G4/1 E4/1 C4/1 D4/2 R/3 C4/.5 D4/.5 ' +
    'E4/1 G4/1 G4/1.5 A4/.5 G4/1 E4/1 C4/1.5 D4/.5 E4/1 E4/1 D4/1 D4/1 C4/4' },
  { name: 'Camptown Races', key: 0, bar: 4, pickup: 0, bpm: 120, notes:
    'G4/.5 G4/.5 E4/.5 G4/.5 A4/.5 G4/.5 E4/1 E4/.5 D4/1.5 E4/.5 D4/1.5 ' +
    'G4/.5 G4/.5 E4/.5 G4/.5 A4/.5 G4/.5 E4/1 D4/1 E4/.5 D4/.5 C4/2 ' +
    'C4/.75 C4/.25 E4/.5 G4/.5 C5/2 A4/.75 A4/.25 C5/.5 A4/.5 G4/2 ' +
    'G4/.5 G4/.5 E4/.5 E4/.5 G4/.5 G4/.5 E4/.5 E4/.5 D4/.5 E4/.5 D4/.5 E4/.5 C4/2' },
  { name: 'Oh My Darling, Clementine', key: 0, bar: 3, pickup: 0, bpm: 104, notes:
    'C4/.75 C4/.25 C4/1 G3/1 E4/.75 E4/.25 E4/1 C4/1 C4/.75 E4/.25 G4/1.5 G4/.5 F4/.75 E4/.25 D4/2 ' +
    'D4/.75 E4/.25 F4/1 F4/1 E4/.75 D4/.25 E4/1 C4/1 C4/.75 E4/.25 D4/1.5 G3/.5 B3/.75 D4/.25 C4/2 ' +
    'C4/.75 C4/.25 C4/1 G3/1 E4/.75 E4/.25 E4/1 C4/1 C4/.75 E4/.25 G4/1.5 G4/.5 F4/.75 E4/.25 D4/2 ' +
    'D4/.75 E4/.25 F4/1 F4/1 E4/.75 D4/.25 E4/1 C4/1 C4/.75 E4/.25 D4/1.5 G3/.5 B3/.75 D4/.25 C4/2' },
  { name: 'Red River Valley', key: 0, bar: 4, pickup: 1, bpm: 96, notes:
    'G3/.5 C4/.5 E4/1 E4/1 E4/1 D4/.5 E4/.5 D4/1 C4/2 G3/.5 C4/.5 E4/1 C4/.5 E4/.5 G4/1 F4/.5 E4/.5 D4/3 G4/.5 F4/.5 ' +
    'E4/1 D4/1 C4/1 D4/.5 E4/.5 G4/1 F4/2 A3/.5 A3/.5 G3/1 B3/1 C4/1 D4/.5 E4/.5 D4/1 C4/3' },
];
const WAR = [
  { name: 'Yankee Doodle', key: 7, bar: 2, pickup: 0, bpm: 118, notes:
    'G4/.5 G4/.5 A4/.5 B4/.5 G4/.5 B4/.5 A4/.5 D4/.5 G4/.5 G4/.5 A4/.5 B4/.5 G4/1 F#4/1 ' +
    'G4/.5 G4/.5 A4/.5 B4/.5 C5/.5 B4/.5 A4/.5 G4/.5 F#4/.5 D4/.5 E4/.5 F#4/.5 G4/1 G4/1 ' +
    'E4/.75 F#4/.25 E4/.5 D4/.5 E4/.5 F#4/.5 G4/1 D4/.75 E4/.25 D4/.5 C4/.5 B3/1 D4/1 ' +
    'E4/.75 F#4/.25 E4/.5 D4/.5 E4/.5 F#4/.5 G4/.5 E4/.5 D4/.5 G4/.5 F#4/.5 A4/.5 G4/1 G4/1' },
  { name: 'Battle Hymn of the Republic', key: 0, bar: 4, pickup: 0, bpm: 100, notes:
    'G4/.75 G4/.25 G4/.75 F4/.25 E4/.75 G4/.25 C5/.75 D5/.25 E5/.75 E5/.25 E5/.75 D5/.25 C5/2 ' +
    'A4/.75 A4/.25 A4/.75 B4/.25 C5/.75 B4/.25 C5/.75 A4/.25 G4/.75 A4/.25 G4/.75 E4/.25 G4/2 ' +
    'G4/.75 G4/.25 G4/.75 F4/.25 E4/.75 G4/.25 C5/.75 D5/.25 E5/.75 E5/.25 E5/.75 D5/.25 C5/2 ' +
    'D5/1 D5/1 C5/1 B4/1 C5/4 ' +
    'G4/1.5 F4/.5 E4/.75 G4/.25 C5/.75 D5/.25 E5/2 C5/2 A4/1.5 B4/.5 C5/.75 B4/.25 C5/.75 A4/.25 G4/2 E4/2 ' +
    'G4/1.5 F4/.5 E4/.75 G4/.25 C5/.75 D5/.25 E5/2 C5/2 D5/1 D5/1 C5/1 B4/1 C5/4' },
  { name: 'La Marseillaise', key: 7, bar: 4, pickup: 0.5, bpm: 104, notes:
    'D4/.375 D4/.125 G4/1 G4/1 A4/1 A4/1 D5/1.5 B4/.5 G4/.75 G4/.25 B4/.75 G4/.25 E4/1 C5/2 A4/.75 F#4/.25 G4/2 R/1.5 ' +
    'G4/.375 A4/.125 B4/1 B4/1 B4/1 C5/.75 B4/.25 B4/1 A4/1 R/1 A4/.75 B4/.25 C5/1 C5/1 C5/1 D5/.75 C5/.25 B4/3 R/1' },
];
// a lone bugle: Taps (War, now and then, and at nightfall)
const TAPS = { name: 'Taps', key: 0, bar: 4, pickup: 0, bpm: 60, solo: true, notes:
  'G3/.75 G3/.25 C4/3 G3/.75 C4/.25 E4/3 G3/.5 C4/.5 E4/1 G3/.5 C4/.5 E4/1 G3/.5 C4/.5 E4/3 C4/.75 E4/.25 G4/3 E4/1 C4/1 G3/2 G3/.75 G3/.25 C4/4' };

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parse(str) {
  return str.trim().split(/\s+/).map((tok) => {
    const [n, d] = tok.split('/');
    if (n === 'R') return { m: null, d: +d };
    const m = n.match(/^([A-G])([#b]?)(-?\d)$/);
    return { m: 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0), d: +d };
  });
}
const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
// the chord of each bar: I, IV or V, whichever holds most of the bar's melody
function harmonize(t) {
  const notes = parse(t.notes), CH = [[0, 4, 7], [5, 9, 0], [7, 11, 2]];
  const bars = []; let pos = -t.pickup, prev = 0;
  for (const n of notes) {
    const b = Math.floor((pos + 1e-6) / t.bar);
    if (n.m != null && b >= 0) { (bars[b] = bars[b] || [0, 0, 0]); CH.forEach((c, k) => { if (c.includes(((n.m - t.key) % 12 + 12) % 12)) bars[b][k] += n.d * (k === 0 ? 1.05 : 1); }); }
    pos += n.d;
  }
  const chords = [];
  for (let b = 0; b < Math.ceil(pos / t.bar); b++) { const w = bars[b] || [0, 0, 0]; const best = w.indexOf(Math.max(...w)); chords[b] = Math.max(...w) > 0 ? best : prev; prev = chords[b]; }
  return { notes, chords, len: pos + t.pickup };
}

let out = null, timer = null, vol = 0.45, muted = false, playing = false, kind = 'cowboy';
let queue = [], nextT = 0, restUntil = 0, noise = null, last = -1;

function tone(f, t, dur, { type = 'triangle', gain = 0.1, attack = 0.01, decay = null, filter = null, vibrato = 0 } = {}) {
  const ctx = audioCtx();
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  if (decay) g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  else { g.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  let node = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; o.connect(fl); node = fl; }
  if (vibrato) {
    const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.4; lg.gain.value = f * vibrato;
    l.connect(lg); lg.connect(o.frequency); l.start(t + 0.12); l.stop(t + dur + 0.1);
  }
  node.connect(g); g.connect(out);
  o.start(t); o.stop(t + (decay || dur) + 0.1);
}
// a snare tap: a short burst of filtered noise
function snare(t, gain) {
  const ctx = audioCtx();
  if (!noise) { noise = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = ctx.createBufferSource(); s.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + 0.12);
}

// lay out a whole tune (melody, bass, chords, drum) as timed events
function arrange(tune) {
  const H = harmonize(tune), beat = 60 / tune.bpm, war = kind === 'war', ev = [];
  let pos = 0;
  const lead = war ? (tune.solo ? 'bugle' : (Math.random() < 0.5 ? 'fife' : 'bugle')) : (Math.random() < 0.5 ? 'harmonica' : 'whistle');
  for (const n of H.notes) { if (n.m != null) ev.push({ at: pos * beat, kind: lead, m: n.m, d: n.d * beat }); pos += n.d; }
  if (!tune.solo) {
    const bars = Math.ceil((H.len - tune.pickup) / tune.bar);
    for (let b = 0; b < bars; b++) {
      const t0 = (tune.pickup + b * tune.bar) * beat, root = tune.key + [0, 5, 7][H.chords[b] || 0];
      const tri = [0, 4, 7].map((x) => 48 + ((root % 12) + x));
      for (let k = 0; k < tune.bar; k++) {
        const t = t0 + k * beat;
        if (k % 2 === 0) ev.push({ at: t, kind: war ? 'tuba' : 'bass', m: 36 + (root % 12) + (k % 4 === 2 ? 7 : 0), d: beat * 0.8 });   // boom (root, then fifth)
        else ev.push({ at: t, kind: war ? 'brass' : 'strum', ms: tri, d: beat * 0.6 });   // chick (the chord)
        if (war) { ev.push({ at: t, kind: 'snare', g: k === 0 ? 0.05 : 0.03 }); if (k % 2 === 1) ev.push({ at: t + beat * 0.5, kind: 'snare', g: 0.022 }); }
      }
    }
  }
  return { ev: ev.sort((a, b) => a.at - b.at), len: H.len * beat };
}
function play(e, t) {
  switch (e.kind) {
    case 'harmonica': tone(freq(e.m), t, e.d * 0.95, { type: 'square', gain: 0.022, attack: 0.03, filter: 1500, vibrato: 0.008 }); break;
    case 'whistle': tone(freq(e.m + 12), t, e.d * 0.92, { type: 'sine', gain: 0.045, attack: 0.04, vibrato: 0.007 }); break;
    case 'fife': tone(freq(e.m + 12), t, e.d * 0.9, { type: 'triangle', gain: 0.05, attack: 0.02, vibrato: 0.005 }); break;
    case 'bugle': tone(freq(e.m), t, e.d * 0.92, { type: 'sawtooth', gain: 0.03, attack: 0.04, filter: 1700, vibrato: 0.004 }); break;
    case 'bass': tone(freq(e.m), t, e.d, { type: 'triangle', gain: 0.07, decay: e.d * 1.1, filter: 600 }); break;
    case 'tuba': tone(freq(e.m), t, e.d, { type: 'sawtooth', gain: 0.035, decay: e.d * 1.1, filter: 380 }); break;
    case 'strum': e.ms.forEach((m, i) => tone(freq(m), t + i * 0.014, e.d, { type: 'triangle', gain: 0.02, decay: e.d * 1.2, filter: 1800 })); break;
    case 'brass': e.ms.forEach((m) => tone(freq(m), t, e.d, { type: 'sawtooth', gain: 0.008, attack: 0.02, filter: 900 })); break;
    case 'snare': snare(t, e.g); break;
    default:
  }
}
function pick() {
  const list = kind === 'war' ? WAR : COWBOY;
  if (kind === 'war' && Math.random() < 0.15) return TAPS;
  let i = Math.floor(Math.random() * list.length);
  if (i === last && list.length > 1) i = (i + 1) % list.length;
  last = i;
  return list[i];
}
function schedule() {
  const ctx = audioCtx();
  if (!ctx || !playing) return;
  const horizon = ctx.currentTime + 0.6;
  if (!queue.length) {
    if (ctx.currentTime < restUntil) return;
    const A = arrange(pick()), t0 = Math.max(nextT, ctx.currentTime + 0.2);
    queue = A.ev.map((e) => ({ ...e, at: e.at + t0 }));
    // then a quiet pause before the next tune
    restUntil = t0 + A.len + (kind === 'war' ? 25 + Math.random() * 30 : 10 + Math.random() * 15);
  }
  while (queue.length && queue[0].at < horizon) { const e = queue.shift(); if (e.at >= ctx.currentTime - 0.05) play(e, e.at); }
}

// kind: 'cowboy' (Town Life) or 'war'
export function startFolk(k = 'cowboy') {
  const ctx = audioCtx();
  if (playing && k === kind) return;
  if (playing) stopFolk(true);
  kind = k;
  if (!ctx) return;
  if (!out) { out = ctx.createGain(); out.connect(ctx.destination); }
  out.gain.cancelScheduledValues(ctx.currentTime);
  out.gain.setValueAtTime(0.0001, ctx.currentTime);
  out.gain.exponentialRampToValueAtTime(Math.max(0.0002, muted ? 0.0001 : level()), ctx.currentTime + 2.5);
  playing = true; queue = []; nextT = ctx.currentTime + 0.5; restUntil = ctx.currentTime + (k === 'war' ? 4 : 0.5);
  timer = setInterval(schedule, 100);
}
export function stopFolk(quick = false) {
  const ctx = audioCtx();
  if (!playing) return;
  playing = false; clearInterval(timer); timer = null; queue = [];
  if (ctx && out) { out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0.0001, ctx.currentTime, quick ? 0.05 : 0.4); }
}
// War music sits a little lower: there is a war going on over it
function level() { return kind === 'war' ? vol * 0.7 : vol; }
export function setFolk(v, mute) {
  vol = Math.max(0.0001, v * 0.9); muted = !!mute;
  const ctx = audioCtx();
  if (ctx && out && playing) out.gain.setTargetAtTime(muted ? 0.0001 : level(), ctx.currentTime, 0.3);
}
export function folkPlaying() { return playing; }
export function folkKind() { return kind; }
export const TUNES = { COWBOY, WAR, TAPS, harmonize };
