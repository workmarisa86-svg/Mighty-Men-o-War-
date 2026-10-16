// Town Life: quick draws and duels at high noon.
//
// Quick draw. Point a gun at an armed man and he reacts: he turns to face you
// with a warning. Keep the gun on him and a man with nerve goes for his own;
// in a hold-up gone wrong it is a race: whoever is quicker shoots first (his
// speed depends on his skill and nerve). You fire with the usual fire button.
//
// Duels. With a revolver on your belt and no gun in your hand, walk up to a
// man and a short prompt offers "Challenge to a duel". The sheriff and hard
// men (and, later, outlaws and men with a price on their head) may accept; a
// farmer or a shopkeeper rarely will. Accepted: you both walk apart, then
// stand facing each other in a tense quiet; a clock ticks, the camera slowly
// pushes in, and at the church bell both of you draw. Fire before the bell and
// it is a crime. The first one hit loses: the winner takes a small purse. A
// man killed in a fair duel in front of witnesses is no crime (the sheriff
// lets it pass, with a small loss of honor).
import * as THREE from 'three';
import { sfx } from './audio.js';
import { t } from './i18n.js';

const PACES = 11;                 // how far apart you stand (m)

export class Duels {
  constructor(town) { this.town = town; this.game = town.game; this.duel = null; this.aimT = 0; this.v3 = new THREE.Vector3(); }
  // will he accept? (the sheriff and brave, armed men; farmers and shopkeepers rarely)
  accepts(v) {
    const F = this.town.folk;
    if (v.outlaw) return Math.random() < 0.9;
    let p = v.role === 'sheriff' ? 0.65 : v.role === 'farmer' ? 0.06 : v.role === 'keeper' ? 0.08 : (F.bestGun(v) ? v.brave * 0.55 : 0.03);
    if (this.town.honor < 25) p *= 0.6;
    return Math.random() < p;
  }
  canChallenge(v) {
    const g = this.game;
    return !this.duel && v.alive && !v.female && !v.posse && !v.fight && !v.surrendered && !v.away && g.has('revolver') && !this.town.posse;
  }
  challenge(v) {
    const g = this.game, F = this.town.folk;
    if (!this.canChallenge(v)) return;
    if (!this.accepts(v)) { F.say(v, 'say.duelNo'); v.faceT = 2; this.town.addHonor(-1); return; }
    F.say(v, 'say.duelYes', null, 'warn');
    // the line between you: he walks back to his mark, you take a few steps back
    const P = g.player.pos, dx = v.pos.x - P.x, dz = v.pos.z - P.z, d = Math.hypot(dx, dz) || 1;
    const ux = dx / d, uz = dz / d, mid = { x: (P.x + v.pos.x) / 2, z: (P.z + v.pos.z) / 2 };
    const me = { x: mid.x - ux * PACES / 2, z: mid.z - uz * PACES / 2 }, him = { x: mid.x + ux * PACES / 2, z: mid.z + uz * PACES / 2 };
    this.duel = { v, phase: 'walk', t: 0, me, him, from: { x: P.x, z: P.z }, wait: 3 + Math.random() * 3.5, tick: 0, reactAt: 0, shot: false, ended: false };
    v.duel = true; v.route = []; v.faceT = 0;
    F.armed(v, null);
    g.hud.bigMessage(t('duel.title'), t(g.app.input.touch ? 'duel.howTouch' : 'duel.how'));
    sfx.dust(0.9);
  }
  // a villager's draw time (s): quick hands for the sheriff and brave men
  reaction(v) { return 0.38 + (1 - Math.min(1, v.brave + (v.role === 'sheriff' ? 0.25 : 0) + (v.outlaw ? 0.3 : 0))) * 0.55 + Math.random() * 0.22; }
  update(dt) {
    const D = this.duel, g = this.game;
    this.quickDraw(dt);
    if (!D) { g.duelZoom = Math.max(0, (g.duelZoom || 0) - dt); return; }
    const v = D.v, P = g.player;
    D.t += dt;
    if (!v.alive) return this.end('won', true);
    if (g.dying || g.dead) return this.end('lost');
    if (D.phase === 'walk') {
      // you are walked back to your mark, facing him
      const k = Math.min(1, D.t / 3);
      P.pos.x = D.from.x + (D.me.x - D.from.x) * k; P.pos.z = D.from.z + (D.me.z - D.from.z) * k;
      P.yaw = Math.atan2(-(v.pos.x - P.pos.x), -(v.pos.z - P.pos.z)); P.vel.set(0, 0, 0);
      if (D.t > 3.4 && Math.hypot(v.pos.x - D.him.x, v.pos.z - D.him.z) < 0.8) { D.phase = 'wait'; D.t = 0; }
      if (D.t > 9) { D.phase = 'wait'; D.t = 0; }
    } else if (D.phase === 'wait') {
      // the standoff: a clock ticks, the view slowly closes in
      g.duelZoom = Math.min(1, D.t / D.wait);
      D.tick -= dt; if (D.tick <= 0) { D.tick = 1; sfx.tick(0.8 + D.t / D.wait); }
      if (D.t >= D.wait) {
        D.phase = 'draw'; D.t = 0; sfx.bell(1);
        D.reactAt = this.reaction(v);
        g.hud.alert(t('duel.draw'));
        // you go for your revolver (drawn from the holster)
        if (g.selected() !== 'revolver') g.selectItem('revolver');
      }
    } else if (D.phase === 'draw') {
      g.duelZoom = Math.max(0, 1 - D.t * 2);
      if (D.t >= D.reactAt - 0.25 && !v.drawn) { v.drawn = true; this.town.folk.armed(v, 'revolver'); v.duelAim = true; sfx.leather(); }
      if (!D.shot && D.t >= D.reactAt) {
        D.shot = true; v.fired = true;
        sfx.shot('revolver', 0.9);
        const skill = Math.min(0.85, 0.35 + v.brave * 0.4 + (v.role === 'sheriff' ? 0.15 : 0) + (v.outlaw ? 0.15 : 0));
        if (Math.random() < skill) { g.damage(14, 'shot', v.pos, { heavy: true }); return this.end('lost'); }
        D.missedT = 0.9 + Math.random() * 0.5;   // he missed: a moment to fire again
      }
      if (D.shot) { D.missedT -= dt; if (D.missedT <= 0) { D.shot = false; D.reactAt = D.t + 0.01; } }
      if (D.t > 12) this.end('draw');
    }
  }
  // the duel ends: a hit or a death decides it
  playerHit(v, killed) {
    const D = this.duel;
    if (!D || v !== D.v) return false;
    if (D.phase !== 'draw') { this.end('early'); return false; }       // before the bell: a crime (the caller records it)
    this.end('won', killed);
    return true;
  }
  end(result, killed = false) {
    const D = this.duel, T = this.town, g = this.game, F = T.folk;
    if (!D) return;
    this.duel = null;
    const v = D.v;
    v.duel = false; v.duelAim = false; v.drawn = false;
    if (result === 'won') {
      const prize = Math.min(15, 6 + (v.money || 0));
      T.money += prize; v.money = Math.max(0, (v.money || 0) - prize);
      T.st.duels = (T.st.duels || 0) + 1;
      if (v.alive) { v.surrendered = 20; F.armed(v, null); F.say(v, 'say.duelLost'); }
      else {
        const witnesses = F.list.filter((o) => o !== v && o.alive && !o.away && o.pos.distanceTo(v.pos) < 35).length;
        if (witnesses) { T.addHonor(-2); g.hud.toast(t('duel.fair')); } else T.crime('murder', { dead: v });
      }
      g.hud.bigMessage(t('duel.won'), t('duel.prize', { n: prize }));
      sfx.coins();
    } else if (result === 'lost') {
      const fee = Math.min(T.money, 10); T.money -= fee;
      if (v.alive) { F.say(v, 'say.duelWon'); F.armed(v, null); }
      g.hud.bigMessage(t('duel.lost'), fee ? t('duel.paid', { n: fee }) : '');
    } else if (result === 'early') {
      // you fired before the bell: he fights back, and it's a crime
      v.fight = { armed: 'revolver' }; F.armed(v, 'revolver');
      g.hud.alert(t('duel.early'));
    } else F.armed(v, null);
  }
  // pointing a gun at an armed man: he turns, warns you, and a man with nerve draws
  quickDraw(dt) {
    const g = this.game, T = this.town, F = T.folk;
    this.aimT -= dt;
    if (this.aimT > 0 || this.duel) return;
    this.aimT = 0.25;
    const W = g.combat && g.selected(), gun = W && ['revolver', 'lever', 'shotgun'].includes(W);
    if (!gun || g.overlay) { this.pointed = null; return; }
    const { eye, dir } = g.aim(), hit = F.raycast(eye, dir, 16);
    const v = hit && hit.villager;
    if (!v || v.female || !v.alive || v.posse || v.fight || v.surrendered || v.duel || !F.bestGun(v)) { this.pointed = null; return; }
    if (this.pointed !== v) { this.pointed = v; this.pointT = 0; v.faceT = 2.5; F.say(v, 'say.easy', null, 'warn'); return; }
    this.pointT += 0.25; v.faceT = 2;
    // a man with nerve won't stand there long with a gun on him: he goes for his own
    if (this.pointT > 2.2 && v.brave > 0.7) {
      v.fight = { armed: F.bestGun(v) }; F.armed(v, v.fight.armed); v.cool = this.reaction(v);
      F.say(v, 'say.draw', null, 'warn'); sfx.leather(); this.pointed = null;
      T.crime('holdup', { victim: v });
    }
  }
}
