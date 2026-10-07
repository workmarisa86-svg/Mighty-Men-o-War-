// Town Life farming. Crops grow from timestamps (in-game days), so nothing
// has to tick while you are away: each crop remembers when it was last
// looked at and catches up when it is next checked. Crops need water (a
// bucket of water, or rain); neglected crops wilt and nearly die. Nothing
// grows in winter. Village fields belong to the village: harvesting them is
// theft.
import { B, BLOCKS } from './blocks.js';

export const CROPS = {
  wheat: { days: 2, grow: B.WHEAT_G, ripe: B.WHEAT_R, item: 'wheat', yield: [2, 3] },
  carrot: { days: 2.5, grow: B.CARROT_G, ripe: B.CARROT_R, item: 'carrot', yield: [2, 4] },
  cabbage: { days: 3, grow: B.CABBAGE_G, ripe: B.CABBAGE_R, item: 'cabbage', yield: [1, 2] },
};
const DRY_DAYS = 1.2;          // without water this long, a crop starts to wilt
const WILT_PER_DAY = 0.45;     // health lost per dry day
export const SEASON_DAYS = 3;  // in-game days per season (spring, summer, autumn, winter)

export class Farm {
  constructor(game, saved = null) {
    this.game = game;
    this.crops = new Map();       // world index of the crop block -> { c, g, w, e, h, o }
    this.evalI = 0; this.evalT = 0;
    const w = game.world;
    if (saved && saved.crops) {
      for (const s of saved.crops) this.crops.set(s.i, { c: s.c, g: s.g, w: s.w, e: s.e, h: s.h, o: s.o });
    } else {
      // first visit: the village fields are planted and ripe
      const v = w.sites.find((s) => s.type === 'village');
      for (const f of v.fields) for (let z = f.z0; z <= f.z1; z++) for (let x = f.x0; x <= f.x1; x++) {
        const i = w.idx(x, f.y ?? v.y, z), b = w.data[i];
        if (BLOCKS[b] && BLOCKS[b].crop) this.crops.set(i, { c: f.crop, g: b === B.SPROUT ? 0.2 : 1, w: game.time, e: game.time, h: 1, o: 'v' });
      }
    }
  }

  // growth multiplier at a moment (no growth in winter)
  growing(time) { return Math.floor(time / SEASON_DAYS) % 4 !== 3; }

  // bring one crop up to date and show the right block
  evaluate(i, cr) {
    const g = this.game, now = g.time, w = g.world;
    let dt = Math.max(0, now - cr.e);
    if (dt <= 0) return;
    cr.e = now;
    if (cr.o === 'v') cr.w = now;                     // the village keeps its own fields watered
    if (g.weather.rain > 0.3 && !this.frozen()) cr.w = now;
    // winter: the part of dt that fell in winter does not count
    let grow = 0, t0 = now - dt;
    while (dt > 0) {
      const seasonEnd = (Math.floor(t0 / SEASON_DAYS) + 1) * SEASON_DAYS;
      const part = Math.min(dt, seasonEnd - t0);
      if (this.growing(t0 + 0.001)) grow += part;
      t0 += part; dt -= part;
    }
    const dry = now - cr.w;
    const C = CROPS[cr.c];
    if (dry < DRY_DAYS) { cr.g = Math.min(1, cr.g + grow / C.days); cr.h = Math.min(1, cr.h + grow * 0.8); }
    else { cr.g = Math.min(1, cr.g + grow / C.days * 0.25); cr.h = Math.max(0.08, cr.h - grow * WILT_PER_DAY); }
    this.show(i, cr);
  }
  blockFor(cr) {
    const C = CROPS[cr.c];
    if (cr.h < 0.3) return B.WILTED;
    return cr.g >= 1 ? C.ripe : cr.g >= 0.35 ? C.grow : B.SPROUT;
  }
  show(i, cr) {
    const w = this.game.world, id = this.blockFor(cr);
    if (w.data[i] === id) return;
    const x = i % w.W, z = Math.floor(i / w.W) % w.D, y = Math.floor(i / (w.W * w.D));
    if (!BLOCKS[w.data[i]].crop && w.data[i] !== B.AIR) { this.crops.delete(i); return; }
    w.set(x, y, z, id);
  }
  frozen() { return !this.growing(this.game.time); }

  // a few crops are brought up to date every frame (round robin)
  update(dt) {
    this.evalT -= dt;
    if (this.evalT > 0 || !this.crops.size) return;
    this.evalT = 0.25;
    const keys = [...this.crops.keys()];
    for (let k = 0; k < Math.min(60, keys.length); k++) {
      const i = keys[(this.evalI++) % keys.length];
      const cr = this.crops.get(i);
      if (cr) this.evaluate(i, cr);
    }
  }

  // ---- player actions ---------------------------------------------------
  // seeds on farmland, grass or dirt (tilled on the spot)
  plant(hit, crop) {
    const g = this.game, w = g.world;
    if (!hit || hit.ny !== 1) return 'where';
    const base = w.get(hit.x, hit.y, hit.z);
    if (![B.FARMLAND, B.GRASS, B.DIRT, B.MUD].includes(base) || w.isLocked(hit.x, hit.y, hit.z)) return 'where';
    if (w.get(hit.x, hit.y + 1, hit.z) !== B.AIR) return 'where';
    if (base !== B.FARMLAND) w.set(hit.x, hit.y, hit.z, B.FARMLAND);
    const i = w.idx(hit.x, hit.y + 1, hit.z);
    const cr = { c: crop, g: 0, w: g.time, e: g.time, h: 1, o: 'p' };
    this.crops.set(i, cr);
    w.set(hit.x, hit.y + 1, hit.z, B.SPROUT);
    return 'ok';
  }
  // a bucket of water waters the crops around the aimed spot
  water(x, y, z) {
    const g = this.game, w = g.world;
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const dy of [0, 1, -1]) {
      const i = w.idx(x + dx, y + dy, z + dz), cr = this.crops.get(i);
      if (cr) { this.evaluate(i, cr); cr.w = g.time; n++; this.show(i, cr); }
    }
    return n;
  }
  at(x, y, z) { const w = this.game.world; return this.crops.get(w.idx(x, y, z)) || null; }
  // dug up: returns what it gives, or null if it isn't a tracked crop
  harvest(x, y, z) {
    const w = this.game.world, i = w.idx(x, y, z), cr = this.crops.get(i);
    if (!cr) return null;
    this.evaluate(i, cr);
    const C = CROPS[cr.c], out = [];
    if (cr.h < 0.3) out.push(['seed_' + cr.c, Math.random() < 0.5 ? 1 : 0]);
    else if (cr.g >= 1) { out.push([C.item, C.yield[0] + Math.floor(Math.random() * (C.yield[1] - C.yield[0] + 1))]); out.push(['seed_' + cr.c, 1 + (Math.random() < 0.5 ? 1 : 0)]); }
    else out.push(['seed_' + cr.c, 1]);
    this.crops.delete(i);
    const owner = cr.o;
    // the village replants its own fields
    if (owner === 'v') this.replant.push({ i, c: cr.c, at: this.game.time + 1 });
    return { items: out.filter(([, n]) => n > 0), owner };
  }
  replant = [];
  updateReplant() {
    const g = this.game, w = g.world;
    for (const r of this.replant.slice()) {
      if (r.at > g.time) continue;
      this.replant = this.replant.filter((q) => q !== r);
      if (w.data[r.i] !== B.AIR) continue;
      const x = r.i % w.W, z = Math.floor(r.i / w.W) % w.D, y = Math.floor(r.i / (w.W * w.D));
      if (w.get(x, y - 1, z) !== B.FARMLAND) continue;
      this.crops.set(r.i, { c: r.c, g: 0, w: g.time, e: g.time, h: 1, o: 'v' });
      w.set(x, y, z, B.SPROUT);
    }
  }
  // jail time: the player's own crops are left almost dead
  neglectAll() {
    const g = this.game;
    for (const [i, cr] of this.crops) if (cr.o === 'p') { this.evaluate(i, cr); cr.h = Math.min(cr.h, 0.12); cr.w = g.time - 3; this.show(i, cr); }
  }
  toSave() { return { crops: [...this.crops].map(([i, c]) => ({ i, c: c.c, g: +c.g.toFixed(3), w: +c.w.toFixed(3), e: +c.e.toFixed(3), h: +c.h.toFixed(2), o: c.o })), replant: this.replant }; }
}
