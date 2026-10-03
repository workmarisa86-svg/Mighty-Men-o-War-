// Main-menu music: "Marines' Hymn" as recorded by the United States Marine
// Band (public domain; see the Credits). The recording plays as it is: it is
// decoded once, then looped with a gentle crossfade where the final chord
// meets the start again, and faded in and out with the menu. Silent during
// play. Audio may only start after the first tap or click.
import { audioCtx } from './audio.js';

const XF = 2.2;                 // crossfade at the loop point (seconds)
const FADE_IN = 1.6, FADE_OUT = 1.2;
let bus = null, buffer = null, bytes = null, loading = null, running = false, timer = null;
let level = 0.45, nextT = 0, span = null, sources = [];

function file() {
  const a = document.createElement('audio');
  return a.canPlayType && a.canPlayType('audio/ogg; codecs="vorbis"') ? 'audio/mightyman-menu-music.ogg' : 'audio/mightyman-menu-music.mp3';
}
// Download quietly once the page has loaded (does not hold up the splash).
export function preloadMusic() {
  if (loading) return loading;
  loading = fetch(file(), { priority: 'low' }).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { bytes = b; return b; }).catch(() => null);
  return loading;
}
async function decode(ctx) {
  if (buffer) return buffer;
  const b = bytes || await preloadMusic();
  if (!b) return null;
  buffer = await ctx.decodeAudioData(b.slice(0));
  // where the music really starts and ends (skip silence at either end)
  const d = buffer.getChannelData(0), sr = buffer.sampleRate, th = 0.004;
  let a = 0, z = d.length - 1;
  while (a < d.length && Math.abs(d[a]) < th) a++;
  while (z > a && Math.abs(d[z]) < th) z--;
  span = { start: Math.max(0, a / sr - 0.02), end: Math.min(buffer.duration, z / sr + 0.05) };
  return buffer;
}
// one pass of the recording, faded in/out at the loop seams
function playOnce(ctx, t, first) {
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buffer; src.connect(g); g.connect(bus);
  const len = span.end - span.start;
  g.gain.setValueAtTime(first ? 1 : 0.0001, t);
  if (!first) g.gain.linearRampToValueAtTime(1, t + XF);
  g.gain.setValueAtTime(1, t + len - XF);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  src.start(t, span.start, len);
  src.stop(t + len + 0.05);
  sources.push(src);
  src.onended = () => { sources = sources.filter((s) => s !== src); };
  return t + len - XF;              // the next pass starts as this one fades
}
function schedule() {
  const ctx = audioCtx();
  if (!ctx || !running || !buffer) return;
  while (nextT < ctx.currentTime + 1.5) nextT = playOnce(ctx, nextT, false);
}
// volume 0..1 from the settings, muted
export function setMusic(v, muted) {
  level = muted ? 0 : v * 0.6;
  const ctx = audioCtx();
  if (bus && ctx && running) bus.gain.setTargetAtTime(Math.max(0.0001, level), ctx.currentTime, 0.25);
}
export async function startMusic() {
  const ctx = audioCtx();
  if (!ctx || running) return;
  running = true;
  if (!bus) { bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(ctx.destination); }
  if (!await decode(ctx) || !running) { running = false; return; }
  const t = ctx.currentTime + 0.05;
  bus.gain.cancelScheduledValues(t);
  bus.gain.setValueAtTime(0.0001, t);
  bus.gain.linearRampToValueAtTime(Math.max(0.0001, level), t + FADE_IN);   // fade in
  nextT = playOnce(ctx, t, true);
  clearInterval(timer);
  timer = setInterval(schedule, 250);
}
export function stopMusic() {
  const ctx = audioCtx();
  if (!running || !ctx) { running = false; return; }
  running = false;
  clearInterval(timer);
  const t = ctx.currentTime;
  if (bus) { bus.gain.cancelScheduledValues(t); bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT); }  // fade out
  for (const s of sources) { try { s.stop(t + FADE_OUT + 0.05); } catch { /* already stopped */ } }
}
export function musicPlaying() { return running; }
