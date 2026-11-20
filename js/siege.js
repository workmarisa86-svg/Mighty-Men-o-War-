// Siege (2.8, 3.0): a survival mode on the Town Life land with no town. You
// start in the morning with endless blocks and dynamite: build a shelter.
// Every evening at eight a wave of outlaws comes, one man more each night.
// They carry knives, not guns (a man who helps kill you takes your gun). They
// go by what they see: seen you, they come after you; lost you (a tunnel hides
// you), they search where you were, watch your shelter or patrol the woods.
// Walls: they build ladders and climb over (your button tears down the empty
// ones); doors: three dynamite charges blow one in, and nothing else. Every
// fifth night the gang leader comes too, with extra men.
// A wave not finished by the next evening is joined by the next one.
//
// Food is the clock: you have none but what you hunt, meat spoils (raw in
// two days, cooked in four) and gunfire drives the game away. Shot dead, you
// lose your food and wake far from the outlaws; starve, and the siege is over.
// Your best (waves survived) is kept. The Siege is saved in its own slot.
import { B, SOLID } from './blocks.js';
import { t } from './i18n.js';
import { sfx } from './audio.js';
import { RIVALS } from './frontier.js';
import { ITEMS } from './items.js';
import { coords } from './hidden.js';
import { deleteSiege } from './storage.js';
import { SiegeHouses } from './siegehouses.js';
import { dropsOf } from './net.js';

const WAVE_HOUR = 20;
// truly endless (the count is infinite: using one never takes one away): blocks, dynamite, knives, guns
const ENDLESS = ['dirt', 'wood', 'stone', 'brick', 'glass', 'thatch', 'sand', 'clay', 'fence', 'gate', 'door', 'ladder', 'loophole', 'bell', 'dynamite', 'chest', 'knife', 'revolver', 'lever', 'shotgun'];
const BEST_KEY = 'mmow-siege-best';
const SPOILS = { meat_raw: 2, meat_cooked: 4 };         // days before it goes bad
const BOSS_EVERY = 5;
const KILL_PRIZE = 40;                                    // kills for two medkits

export function siegeBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } }

export class Siege {
  constructor(town, saved = null) {
    this.T = town; this.game = town.game;
    const g = this.game;
    this.houses = new SiegeHouses(this);           // houses for meat (siegehouses.js)
    g.player.fast = true;                          // (you walk as fast as you run, and faster)
    this.wave = saved ? saved.wave || 0 : 0;       // waves survived
    this.started = saved ? saved.started ?? this.wave : 0;   // waves that have come
    this.deaths = saved ? saved.deaths || 0 : 0;
    this.kills = saved ? saved.kills || 0 : 0;     // outlaws you have killed (every 40: two medkits)
    this.food = saved && saved.food ? saved.food : { meat_raw: [], meat_cooked: [] };     // batches: { n, at }
    this.ladders = saved && saved.ladders ? saved.ladders : [];     // the ladders they built up your walls
    this.charges = []; this.doorHits = {}; this.hitters = new Map();     // their dynamite; who has hurt you lately
    this.men = null;             // the attackers out there now (every wave not yet finished)
    this.nextAt = saved && saved.nextAt != null ? saved.nextAt : Math.floor(g.time) + WAVE_HOUR / 24;
    if (!saved && g.time > this.nextAt) this.nextAt += 1;
    this.refillT = 0; this.foodT = 0; this.over = false; this.bestAtStart = siegeBest();
    // online, in a friend's Siege: their game runs the waves and the outlaws (you see theirs)
    if (g.net && g.net.guest) {
      this.guest = true; this.food = { meat_raw: [], meat_cooked: [] }; this.proxies = new Map();
      for (const [id, n] of [['revolver', 1], ['lever', 1], ['shotgun', 1], ['knife', 1], ['flint', 1], ['medkit', 3]]) if (g.count(id) < n) g.give(id, n - g.count(id), true);
      this.refill(); g.hud.bigMessage(t('net.inTitle'), t('net.inSub', { code: g.net.code }));
      return;
    }
    this.rHit = new Map();       // (online) who has hurt each of the other players lately
    // a saved Siege: carry on (the waves that were out come again)
    if (saved) {
      this.refill();
      if (this.nextAt <= g.time) { this.nextAt = Math.floor(g.time) + WAVE_HOUR / 24; if (this.nextAt <= g.time) this.nextAt += 1; }     // (never a wave just for opening the game)
      // the men who were still out when you left: exactly those come back (no new wave)
      if (Array.isArray(saved.out)) this.restore = saved.out;
      else if (saved.fighting) this.restore = [{ w: this.started, n: this.size(this.started), boss: false }];     // (an older save: just the last wave)
      g.hud.toast(t('siege.welcomeBack', { n: this.wave + 1 })); return;
    }
    // no food: hunt (skin what you shoot, cook it at a campfire you light with the flint)
    for (const [id, n] of [['revolver', 1], ['lever', 1], ['shotgun', 1], ['knife', 1], ['flint', 1], ['medkit', 3]]) if (g.count(id) < n) g.give(id, n - g.count(id), true);
    if (g.inv.counts.bread) g.inv.counts.bread = 0;
    this.refill();
    g.hud.bigMessage(t('siege.title'), t('siege.intro'));
  }
  size(n) { return n + 1; }                       // wave 1: 2 men, wave 2: 3...
  boss(n) { return n % BOSS_EVERY === 0; }
  refill() {
    const g = this.game;
    let changed = false;
    for (const id of ENDLESS) if (g.inv.counts[id] !== Infinity) { if (!g.inv.hotbar.includes(id) && !g.inv.counts[id]) g.give(id, 1, true); g.inv.counts[id] = Infinity; changed = true; }
    if (changed) g.hud.dirtyHotbar = true;
  }
  // a wave comes (eight o'clock, or the Ready button). Men still out from an
  // earlier wave stay: the new ones join them.
  startWave() {
    const g = this.game, n = this.started + 1, boss = this.boss(n);
    this.started = n;
    this.nextAt = Math.floor(g.time) + WAVE_HOUR / 24; if (this.nextAt <= g.time + 1e-4) this.nextAt += 1;     // (tonight at eight, even if a wave came early today)
    const size = this.size(n) + (boss ? 3 : 0);
    this.spawnMen(n, size, boss);
    g.hud.bigMessage(t(boss ? 'siege.bossTitle' : 'siege.waveTitle', { n }), t(boss ? 'siege.bossSub' : 'siege.waveSub', { k: size }));
    sfx.alert(); sfx.bell(0.8);
  }
  // put men for wave n out there
  spawnMen(n, count, boss) {
    const g = this.game, T = this.T, P = g.player.pos;
    this.men = this.men || [];
    const size = count;
    const a0 = Math.random() * Math.PI * 2;
    for (let k = 0; k < size; k++) {
      let a = a0 + (k / size - 0.5) * (size > 6 ? 2.4 : 1.2), r = 60 + Math.random() * 10;
      for (let tries = 0; tries < 12; tries++) {         // somewhere dry (not out in a lake)
        const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r), sy = g.world.surfaceY(x, z);
        if (g.world.get(x, sy + 1, z) !== B.WATER && sy > 1) break;
        a += 0.5; r = 45 + Math.random() * 30;
      }
      const lead = boss && k === 0, gang = RIVALS[(n + k) % RIVALS.length];
      const v = T.frontier.rivalMan(gang, 200 + (n * 13 + k) % 90, { x: P.x + Math.cos(a) * r, y: P.y, z: P.z + Math.sin(a) * r },
        { hunter: true, provoked: true, guns: [] });       // (knives only: a gun is what they take off you)
      v.rival = 'siege'; v.siege = true; v.money = 0; v.goods = []; v.waveN = n;      // (no coins, no food: only his gun)
      // camp round your shelter, prowl the woods, or (boss nights) hunt you down
      v.role = k % 3 === 2 ? 'roam' : 'siege';          // most make for your shelter; some patrol the woods
      v.slot = k; v.fight = { armed: 'knife' }; T.folk.armed(v, 'knife'); v.goal = { x: P.x, y: P.y, z: P.z };
      if (lead) { v.leader = true; v.hp = 450; v.name = t('siege.leader'); }
      v.ai = (o, dt, d) => this.manAi(o, dt, d);
      this.men.push(v);
    }
    this.camp = { x: P.x, z: P.z, t: g.time };
  }
  // Each outlaw goes by what he sees. Seen you: after you (to where you are,
  // or where you were last seen). Not seen you: he makes for your shelter
  // and searches round it, or patrols the woods. A tunnel hides you: he
  // can't follow what he can't see. Walls in his way: he builds a ladder up
  // and climbs over; a shut door: dynamite, three charges to blow it in (and
  // nothing else). Knives only, unless he has taken a gun off you.
  manAi(v, dt) {
    const g = this.game, F = this.T.folk, w = g.world;
    if (!v.alive) return true;
    if (v.surrendered > 0) return false;
    const bx = Math.floor(v.pos.x), bz = Math.floor(v.pos.z);
    if (SOLID[w.get(bx, Math.floor(v.pos.y + 0.2), bz)] && SOLID[w.get(bx, Math.floor(v.pos.y + 1.2), bz)] && w.get(bx, Math.floor(v.pos.y + 0.2), bz) !== B.LADDER) { v.pos.y = w.surfaceY(bx, bz) + 1; v.route = []; }
    // eyes: a clear line of sight to a player (you, or online any player: the nearest he can see)
    v.lookT = (v.lookT || 0) - dt;
    if (v.lookT <= 0 || !v.tgt) {
      v.lookT = 0.4;
      const all = this.targets().map((o) => ({ o, d: Math.hypot(o.pos.x - v.pos.x, o.pos.z - v.pos.z) })).sort((a, b) => a.d - b.d);
      v.sees = false; v.tgt = all.length ? all[0].o : { id: null, pos: g.player.pos };
      for (const { o, d } of all) { if (d >= 55) break; if (this.seesAt(v, o, 55)) { v.sees = true; v.tgt = o; break; } }
      if (v.sees) { const Q = v.tgt.pos; v.last = { x: Q.x, y: Q.y, z: Q.z }; v.lostT = 0; }
    }
    const tg = v.tgt, P = tg.pos, d = Math.hypot(P.x - v.pos.x, P.z - v.pos.z);
    const close = d < 1.8 && Math.abs(P.y - v.pos.y) < 1.6 && this.clearShot(v, P);
    // the knife: at arm's length; a gun (taken off you): from range
    v.stabT = (v.stabT || 0) - dt;
    if (close && v.stabT <= 0) {
      v.stabT = 1.1; v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z)); sfx.stab && sfx.stab();
      if (tg.id == null) { if (g.net) g.net.hurtBy(v.name); g.damage(16, 'knife', v.pos); this.hitters.set(v, g.time); }
      else { g.net.hurtPlayer(tg.id, 16, 'knife', v.pos, v.name); this.hitOn(tg.id, v); }
    }
    if (v.hasGun && v.sees && d < 40 && this.clearShot(v, P)) {
      v.yaw = Math.atan2(-(P.x - v.pos.x), -(P.z - v.pos.z));
      if (tg.id == null) { F.lastHitBy = null; F.shootAt(v, dt, 0.8); if (F.lastHitBy === v) { this.hitters.set(v, g.time); if (g.net) g.net.hurtBy(v.name); } }
      else if ((v.gunT = (v.gunT || 0) - dt) <= 0) { v.gunT = 1.3; sfx.shot && sfx.shot('revolver', Math.max(0, 1 - g.player.pos.distanceTo(v.pos) / 80)); if (Math.random() < 0.4) { g.net.hurtPlayer(tg.id, 14, 'shot', v.pos, v.name); this.hitOn(tg.id, v); } }
    }
    if (close) { v.speed = 0; return true; }
    // where to: you; where you were last seen; your shelter; the woods
    let goal = null, fast = false;
    if (v.sees) { goal = P; fast = true; }
    else if (v.last) {
      goal = v.last;
      if (Math.hypot(v.last.x - v.pos.x, v.last.z - v.pos.z) < 2.5) { v.lostT = (v.lostT || 0) + dt; if (v.lostT > 6) { v.searchAt = v.last; v.last = null; v.prowl = null; } }
    }
    if (!goal && v.role === 'siege' && v.goal && Math.hypot(v.goal.x - v.pos.x, v.goal.z - v.pos.z) > 2 && !v.searchAt) goal = v.goal;
    if (!v.sees && v.doorAt) {
      // a door he found in the wall: up to it with the dynamite
      if (w.get(v.doorAt.x, v.doorAt.y, v.doorAt.z) !== B.DOOR && w.get(v.doorAt.x, v.doorAt.y, v.doorAt.z) !== B.HDOOR) v.doorAt = null;
      else goal = { x: v.doorAt.x + 0.5, y: v.doorAt.y, z: v.doorAt.z + 0.5, door: true };
    }
    if (!goal) {
      // search round where you were (your shelter, the spot you vanished), or patrol the woods
      if (!v.prowl || Math.hypot(v.prowl.x - v.pos.x, v.prowl.z - v.pos.z) < 2.5 || (v.prowlT = (v.prowlT || 0) - dt) <= 0) {
        let cx, cz, R;
        const base = v.searchAt || (v.role === 'siege' ? v.goal : null);
        if (base) { cx = base.x; cz = base.z; R = 6 + Math.random() * 18; }
        else {
          const herds = g.animals.herds.filter((h) => !h.pen && h.members.some((a) => a.state !== 'dead') && Math.hypot(h.cx - v.pos.x, h.cz - v.pos.z) < 160);
          const h = herds[Math.floor(Math.random() * herds.length)];
          cx = h ? h.cx : v.pos.x; cz = h ? h.cz : v.pos.z; R = 8 + Math.random() * 25;
        }
        const a = Math.random() * 6.28, x = Math.max(8, Math.min(w.W - 8, cx + Math.cos(a) * R)), z = Math.max(8, Math.min(w.D - 8, cz + Math.sin(a) * R));
        v.prowl = { x, y: w.surfaceY(Math.floor(x), Math.floor(z)) + 1, z }; v.prowlT = 35; v.route = [];
        if (v.searchAt && Math.random() < 0.15) v.searchAt = null;          // (and in the end, back to the woods)
      }
      goal = v.prowl;
    }
    F.goDirect(v, goal, fast ? 5.6 : 2.8, dt, 1.2); v.crouch = false;
    // in his way: a wall (a ladder up it), a shut door (dynamite), or the top of a wall (down the other side)
    if (goal !== v.prowl) this.getIn(v, goal, dt);       // (going for you or your shelter: over the walls, through the doors)
    return true;
  }
  getIn(v, goal, dt) {
    const g = this.game, w = g.world, F = this.T.folk;
    const gx = goal.x - v.pos.x, gz = goal.z - v.pos.z, gd = Math.hypot(gx, gz);
    const by = Math.floor(v.pos.y + 0.05);
    const isDoor = (q) => q === B.DOOR || q === B.HDOOR;
    if (goal.door) {
      // at the door: the charge goes on it
      if (gd < 2.4 && !this.charges.some((c) => c.x === v.doorAt.x && c.z === v.doorAt.z)) { this.charges.push({ x: v.doorAt.x, y: v.doorAt.y, z: v.doorAt.z, t: 3 }); F.say(v, 'siege.doorCharge', null, 'warn'); sfx.leather(); }
      return;
    }
    if (gd < 1.5) return;
    // on top of a wall with the goal below on the other side: over and down
    if (goal.y < v.pos.y - 2 && gd < 10) {
      const fx = Math.floor(v.pos.x + gx / gd), fz = Math.floor(v.pos.z + gz / gd);
      if (!SOLID[w.get(fx, by, fz)] && !SOLID[w.get(fx, by + 1, fz)]) { v.pos.x = fx + 0.5; v.pos.z = fz + 0.5; v.route = []; return; }
    }
    // blocked: hardly moved these last seconds while the goal is still away
    v.progT = (v.progT || 0) + dt;
    if (!v.progAt) v.progAt = v.pos.clone();
    if (v.progT < 3) return;
    const moved = v.pos.distanceTo(v.progAt);
    v.progT = 0; v.progAt.copy(v.pos);
    if (moved > 1.2) return;
    // what is in the way, straight toward the goal
    const hit = w.raycast(v.pos.x, v.pos.y + 0.6, v.pos.z, gx / gd, 0, gz / gd, 3.5, false, 'bullet');
    if (!hit) return;
    const id = w.get(hit.x, hit.y, hit.z), above = w.get(hit.x, hit.y + 1, hit.z), below = w.get(hit.x, hit.y - 1, hit.z);
    if (isDoor(id) || isDoor(above) || isDoor(below)) {
      // a shut door: a charge on it (three to blow it in; only the door goes)
      if (!this.charges.some((c) => c.x === hit.x && c.z === hit.z)) { this.charges.push({ x: hit.x, y: isDoor(id) ? hit.y : isDoor(above) ? hit.y + 1 : hit.y - 1, z: hit.z, t: 3 }); F.say(v, 'siege.doorCharge', null, 'warn'); sfx.leather(); }
      return;
    }
    // a wall with a door in it near by: he goes for the door instead
    for (let r = 1; r <= 8 && !v.doorAt; r++) for (let dx = -r; dx <= r && !v.doorAt; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      for (let dy = -1; dy <= 2; dy++) if (isDoor(w.get(hit.x + dx, by + dy, hit.z + dz))) { v.doorAt = { x: hit.x + dx, y: by + dy, z: hit.z + dz }; break; }
      if (v.doorAt) break;
    }
    if (v.doorAt) { v.route = []; return; }
    // a wall: a ladder up it from his side, and up he goes onto the top
    let h = 0; while (h < 12 && SOLID[w.get(hit.x, by + h, hit.z)]) h++;
    if (h === 0 || h >= 12 || SOLID[w.get(hit.x, by + h + 1, hit.z)] || (v.ladderT || 0) > g.time) return;
    const lx = hit.x + hit.nx, lz = hit.z + hit.nz;
    v.ladderT = g.time + 0.004;
    for (let y = by; y < by + h; y++) if (!SOLID[w.get(lx, y, lz)]) w.set(lx, y, lz, B.LADDER);
    this.ladders.push({ x: lx, z: lz, y0: by, y1: by + h - 1 });
    v.pos.set(hit.x + 0.5, by + h, hit.z + 0.5); v.route = []; v.progAt = null;       // over the top: standing on the wall
    F.say(v, 'siege.ladder', null, 'warn');
  }
  // their dynamite on your doors: three charges and the door is gone (the walls never are)
  doorBlast(c) {
    const g = this.game, w = g.world, T = this.T, P = g.player.pos, key = c.x + ',' + c.z;
    T.boom(c.x + 0.5, c.y + 0.5, c.z + 0.5);
    const d = Math.hypot(P.x - c.x - 0.5, P.y + 1 - c.y, P.z - c.z - 0.5);
    if (d < 3.5) g.damage(Math.round(30 * (1 - d / 3.5)), 'blast');
    this.doorHits[key] = (this.doorHits[key] || 0) + 1;
    if (this.doorHits[key] >= 3) {
      for (let y = c.y - 1; y <= c.y + 1; y++) { const id = w.get(c.x, y, c.z); if (id === B.DOOR || id === B.DOOR_OPEN || id === B.HDOOR) w.set(c.x, y, c.z, B.AIR); }
      delete this.doorHits[key];
      g.hud.alert(t('siege.doorDown'));
    } else g.hud.toast(t('siege.doorHit', { n: 3 - this.doorHits[key] }));
  }
  // your button: their ladders come down (any with nobody on them)
  ladderOptions(p) {
    const near = this.ladders.filter((L) => Math.hypot(L.x + 0.5 - p.x, L.z + 0.5 - p.z) < 30);
    return near.length ? [{ a: 'siegeladders', label: t('siege.tearLadders', { n: near.length }), run: () => this.tearLadders(p) }] : [];
  }
  tearLadders(p) {
    const g = this.game, w = g.world, men = (this.men || []).filter((m) => m.alive);
    let n = 0;
    this.ladders = this.ladders.filter((L) => {
      if (Math.hypot(L.x + 0.5 - p.x, L.z + 0.5 - p.z) >= 30) return true;
      if (men.some((m) => Math.hypot(m.pos.x - L.x - 0.5, m.pos.z - L.z - 0.5) < 1.3 && m.pos.y >= L.y0 - 0.5 && m.pos.y <= L.y1 + 2)) return true;      // (someone on it)
      for (let y = L.y0; y <= L.y1; y++) if (w.get(L.x, y, L.z) === B.LADDER) w.set(L.x, y, L.z, B.AIR);
      n++; return false;
    });
    g.hud.toast(t('siege.laddersDown', { n })); sfx.breakBlock('wood');
  }
  // nothing solid between him and you (a door, glass, a wall)
  clearShot(v, P = this.game.player.pos) {
    const w = this.game.world;
    const dx = P.x - v.pos.x, dy = P.y + 1.2 - (v.pos.y + 1.4), dz = P.z - v.pos.z, L = Math.hypot(dx, dy, dz) || 1;
    return !w.raycast(v.pos.x, v.pos.y + 1.4, v.pos.z, dx / L, dy / L, dz / L, L - 0.6, false, 'bullet');
  }
  // gunfire: the game nearby takes fright and moves off (hunting near home gets harder)
  onShot() {
    const g = this.game, P = g.player.pos, w = g.world;
    for (const h of g.animals.herds) {
      if (h.pen || !h.members.length) continue;
      const dx = h.cx - P.x, dz = h.cz - P.z, d = Math.hypot(dx, dz);
      if (d > 70) continue;
      const k = 90 / (d || 1);
      h.cx = Math.max(20, Math.min(w.W - 20, h.cx + dx * k)); h.cz = Math.max(20, Math.min(w.D - 20, h.cz + dz * k));
      for (const a of h.members) if (a.state !== 'dead' && !a.T.fierce && !a.T.pack) { a.state = 'flee'; a.fleeing = true; a.alarmed = true; a.timer = 10; a.from = P.clone(); }
    }
  }
  // meat goes bad: each batch keeps its own age (what you eat or trade goes first from the oldest)
  spoil() {
    const g = this.game;
    for (const [id, days] of Object.entries(SPOILS)) {
      const B2 = this.food[id] || (this.food[id] = []);
      const have = g.inv.counts[id] || 0;
      let sum = B2.reduce((n, q) => n + q.n, 0);
      if (have > sum) B2.push({ n: have - sum, at: g.time });
      else if (have < sum) { let gone = sum - have; while (gone > 0 && B2.length) { const k = Math.min(gone, B2[0].n); B2[0].n -= k; gone -= k; if (!B2[0].n) B2.shift(); } }
      sum = 0;
      const bad = B2.filter((q) => g.time - q.at > days).reduce((n, q) => n + q.n, 0);
      if (bad) {
        this.food[id] = B2.filter((q) => g.time - q.at <= days);
        g.inv.counts[id] = Math.max(0, have - bad); g.hud.dirtyHotbar = true;
        g.hud.toast(t('siege.spoiled', { n: bad, item: t('item.' + id) }));
      }
    }
  }
  update(dt) {
    const g = this.game;
    if (this.over) return;
    this.houses.update();
    this.refillT -= dt;
    if (this.refillT <= 0) { this.refillT = 1; this.refill(); if (this.ladders.length) this.ladders = this.ladders.filter((L) => g.world.get(L.x, L.y0, L.z) === B.LADDER); }
    if (this.guest) { this.foodT -= dt; if (this.foodT <= 0) { this.foodT = 1; this.spoil(); } this.netProxies(dt); return; }
    for (const c of this.charges) { c.t -= dt; if (c.t <= 0) this.doorBlast(c); }
    this.charges = this.charges.filter((c) => c.t > 0);
    this.foodT -= dt;
    if (this.foodT <= 0) { this.foodT = 1; this.spoil(); }
    if (this.restore) { const r = this.restore; this.restore = null; for (const o of r) if (o.n > 0) this.spawnMen(o.w, o.n, !!o.boss); if (this.men && !this.men.length) this.men = null; }
    if (g.time >= this.nextAt) this.startWave();
    // the camp follows you if you move house
    if (this.camp && Math.hypot(this.camp.x - g.player.pos.x, this.camp.z - g.player.pos.z) > 60 && g.time - this.camp.t > 0.04) this.camp = { x: g.player.pos.x, z: g.player.pos.z, t: g.time };
    if (this.men) {
      // every 40 outlaws you kill: two medkits
      for (const m of this.men) if (!m.alive && !m.counted) {
        m.counted = true; this.kills++;
        if (this.kills % KILL_PRIZE === 0) { g.give('medkit', 2, true); g.hud.dirtyHotbar = true; g.hud.toast(t('siege.killPrize', { n: this.kills })); sfx.done(); }
      }
      const left = this.men.filter((m) => m.alive && !m.away && !(m.surrendered > 0));
      if (!left.length) {
        this.wave = this.started; this.men = null;
        // the next one: at the next eight o'clock (tonight, if it isn't eight yet)
        this.nextAt = Math.floor(g.time) + WAVE_HOUR / 24; if (this.nextAt <= g.time + 0.02) this.nextAt += 1;
        if (this.wave > siegeBest()) try { localStorage.setItem(BEST_KEY, String(this.wave)); } catch { /* private mode */ }
        g.give('medkit', 2, true); g.hud.dirtyHotbar = true;
        const n = this.wave + 1;
        g.hud.bigMessage(t('siege.survived', { n: this.wave }), t(this.boss(n) ? 'siege.survivedBoss' : 'siege.survivedSub', { n, k: this.size(n) + (this.boss(n) ? 3 : 0) }));
        sfx.done();
      }
    }
  }
  // killed: starving ends the siege (your score is kept); shot dead, you lose
  // your food and wake far from every outlaw, healed and not starving
  playerDied(cause) {
    const g = this.game, p = g.player, w = g.world;
    if (cause === 'starve' && !g.net) { this.gameOver(); return; }      // (online, starving is a death like any other)
    // every man who had a hand in killing you takes a gun off you
    let armed = 0;
    for (const [m, at] of this.hitters) if (m.alive && g.time - at < 0.012 && !m.hasGun) { m.hasGun = true; m.guns = ['revolver']; m.fight = { armed: 'revolver' }; this.T.folk.armed(m, 'revolver'); armed++; }
    this.hitters.clear();
    this.deaths = (this.deaths || 0) + 1;
    let lost = 0;
    if (g.net) {
      // online: your food, skins and medkits stay in a bag where you fell (anyone can take it)
      const items = dropsOf(g.inv.counts);
      for (const [id, n] of Object.entries(items)) { lost += n; g.inv.counts[id] = 0; }
      g.net.died(items, p.pos);
    } else for (const id of Object.keys(g.inv.counts)) if (ITEMS[id] && ITEMS[id].food && g.inv.counts[id] !== Infinity) { lost += g.inv.counts[id] || 0; g.inv.counts[id] = 0; }
    const foes = (this.men || []).filter((m) => m.alive && !m.away && !m.netDead);
    let spot = null;
    for (let k = 0; k < 400 && !spot; k++) {
      const x = 24 + Math.floor(Math.random() * (w.W - 48)), z = 24 + Math.floor(Math.random() * (w.D - 48)), sy = w.surfaceY(x, z);
      if (sy <= 1 || w.get(x, sy + 1, z) === B.WATER || w.get(x, sy, z) === B.LOG || SOLID[w.get(x, sy + 1, z)] || SOLID[w.get(x, sy + 2, z)]) continue;
      if (foes.some((m) => Math.hypot(m.pos.x - x, m.pos.z - z) < 80)) continue;
      spot = { x: x + 0.5, y: sy + 1, z: z + 0.5 };
    }
    if (!spot) spot = { ...w.spawn };
    p.pos.set(spot.x, spot.y, spot.z); p.vel.set(0, 0, 0);
    p.health = 100; g.breath = 20; p.hunger = Math.max(60, p.hunger || 0); g.hungerStage = 0;
    g.hud.dirtyHotbar = true;
    const C = coords(spot.x, spot.z, w);
    g.hud.bigMessage(t('siege.diedTitle'), t(g.net ? 'net.diedSub' : 'siege.diedSub', { x: C.x, y: C.y, n: lost }) + (armed ? ' ' + t('siege.tookGuns', { n: armed }) : ''));
    sfx.done();
  }
  // ---- online ---------------------------------------------------------------------------
  // the players the outlaws can go after: you, and online the others too
  targets() {
    const g = this.game, out = [];
    if (!g.dying && !g.dead) out.push({ id: null, pos: g.player.pos });
    if (g.net) out.push(...g.net.targets());
    return out;
  }
  seesAt(v, o, range) {
    if (o.id == null) return this.T.folk.sees(v, range);
    const g = this.game, P = o.pos, dx = P.x - v.pos.x, dz = P.z - v.pos.z, d = Math.hypot(dx, dz);
    const R = range * (0.45 + 0.55 * g.sky.daylight) * (o.crouch ? 0.6 : 1);
    if (d > R || Math.abs(P.y - v.pos.y) > 12) return false;
    const facing = (-Math.sin(v.yaw) * dx - Math.cos(v.yaw) * dz) / (d || 1);
    if (facing < -0.3 && d > 5) return false;
    const ex = v.pos.x, ey = v.pos.y + 1.65, ez = v.pos.z, ux = P.x - ex, uy = P.y + 1.2 - ey, uz = P.z - ez, L = Math.hypot(ux, uy, uz) || 1;
    return !g.world.raycast(ex, ey, ez, ux / L, uy / L, uz / L, L - 0.4, false, 'sight');
  }
  hitOn(id, v) { const m = this.rHit.get(id) || new Map(); m.set(v, this.game.time); this.rHit.set(id, m); }
  // another player died: the outlaws who had a hand in it take a gun off them
  remoteDied(id) {
    const m = this.rHit.get(id), F = this.T.folk;
    if (!m) return;
    for (const [v, at] of m) if (v.alive && this.game.time - at < 0.012 && !v.hasGun) { v.hasGun = true; v.guns = ['revolver']; v.fight = { armed: 'revolver' }; F.armed(v, 'revolver'); }
    this.rHit.delete(id);
  }
  // (host) the outlaws, the wave and the time, for everyone else
  netSnapshot() {
    const r = (x) => Math.round(x * 100) / 100;
    const men = (this.men || []).filter((m) => !m.away).map((m) => [m.netId || (m.netId = this.netSeq = (this.netSeq || 0) + 1), r(m.pos.x), r(m.pos.y), r(m.pos.z), r(m.yaw), m.alive ? 1 : 0, m.leader ? 1 : 0, m.hasGun ? 1 : 0, r(m.speed || 0)]);
    return { t: 'men', m: men, s: this.started, w: this.wave, n: this.nextAt, time: this.game.time, k: this.kills, l: this.ladders };
  }
  // (host) a friend's shot or knife hit one of the outlaws
  netHitMan(id, dmg, head) {
    const v = (this.men || []).find((m) => m.netId === id);
    if (v && v.alive) { this.T.folk.hurt(v, dmg, { head }); v.provoked = true; }
  }
  // (guest) the host's outlaws as they are now: shown here, moved smoothly
  netMen(m) {
    const g = this.game, F = this.T.folk, by = this.proxies, seen = new Set();
    this.started = m.s; this.wave = m.w; this.nextAt = m.n; this.ladders = m.l || []; this.kills = m.k || 0;
    if (Math.abs(g.time - m.time) > 0.0015) g.time = m.time;
    for (const [id, x, y, z, yaw, alive, lead, gun, spd] of m.m) {
      seen.add(id);
      let v = by.get(id);
      if (!v) {
        if (!alive) continue;
        v = this.T.frontier.rivalMan(RIVALS[id % RIVALS.length], 200 + id % 90, { x, y, z }, { hunter: true, provoked: true, guns: [] });
        Object.assign(v, { siege: true, netId: id, money: 0, goods: [], onHurt: null, onKill: () => {} });
        v.ai = () => true; v.fight = { armed: 'knife' }; F.armed(v, 'knife');
        if (lead) { v.leader = true; v.name = t('siege.leader'); }
        v.pos.set(x, y, z); v.yaw = yaw;
        by.set(id, v);
      }
      v.net = { x, y, z, yaw, spd };
      if (gun && !v.hasGun) { v.hasGun = true; F.armed(v, 'revolver'); }
      if (!alive && v.alive) { v.netDead = true; F.kill(v); }
    }
    for (const [id, v] of by) if (!seen.has(id)) { if (v.alive) { v.netDead = true; F.kill(v); } by.delete(id); }
    const list = [...by.values()];
    this.men = list.length ? list : null;
  }
  netProxies(dt) {
    const k = Math.min(1, dt * 10);
    for (const v of this.proxies.values()) {
      if (!v.alive || !v.net) continue;
      const N = v.net;
      if (Math.hypot(N.x - v.pos.x, N.z - v.pos.z) > 6) v.pos.set(N.x, N.y, N.z);
      else { v.pos.x += (N.x - v.pos.x) * k; v.pos.y += (N.y - v.pos.y) * k; v.pos.z += (N.z - v.pos.z) * k; }
      let dy = N.yaw - v.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); v.yaw += dy * k;
      v.speed = N.spd;
    }
  }
  gameOver() {
    const g = this.game, p = g.player;
    this.over = true;
    p.health = 100; p.hunger = 100; g.hungerStage = 0;          // (no dying again behind the screen)
    const best = Math.max(siegeBest(), this.wave), record = this.wave > this.bestAtStart;      // (a new record this siege)
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* private mode */ }
    deleteSiege();                                                 // (the siege is over: nothing to continue)
    g.app.openPanel('siegeover', { wave: this.wave, best, record });
  }
  // the attackers, for the map (every one of them, however far)
  marks() { return (this.men || []).filter((m) => m.alive && !m.away).map((m) => ({ x: m.pos.x, z: m.pos.z, boss: !!m.leader })); }
  toSave() { return { wave: this.wave, started: this.started, deaths: this.deaths || 0, kills: this.kills, nextAt: this.nextAt, food: this.food, ladders: this.ladders, out: this.outSave() }; }
  outSave() {
    const by = {};
    for (const m of this.men || []) if (m.alive && !m.away) { const o = by[m.waveN] || (by[m.waveN] = { w: m.waveN, n: 0, boss: false }); o.n++; if (m.leader) o.boss = true; }
    return Object.values(by);
  }
  hudText() {
    const g = this.game;
    const h = Math.max(0, (this.nextAt - g.time) * 24), hh = Math.floor(h), mm = Math.floor((h - hh) * 60), time = hh + ':' + String(mm).padStart(2, '0');
    if (this.men) return t('siege.hudFight', { n: this.started, k: this.men.filter((m) => m.alive && !m.away).length, time });
    return t('siege.hudWait', { n: this.started + 1, time, best: siegeBest() });
  }
  options() {
    const out = [];
    out.push(...this.ladderOptions(this.game.player.pos));
    if (this.houses.placing) out.push({ a: 'shcancel', label: t('sh.cancel'), run: () => this.houses.cancel() });
    else out.push({ a: 'shtrade', label: t('sh.trade'), run: () => this.game.app.openPanel('siegehouses', {}) });
    if (!this.men && !this.over && !this.guest) out.push({ a: 'siegego', label: t('siege.ready'), run: () => this.startWave() });
    if (this.game.net) out.unshift(...this.game.net.bagOptions(this.game.player.pos));
    return out;
  }
}
