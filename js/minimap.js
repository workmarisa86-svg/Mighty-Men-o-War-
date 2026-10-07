// Circular radar in the corner: rotates with the player's facing, player at
// the centre. Red = enemies, blue = allies, fort squares by owner, cabin icon,
// flashing TNT warnings. Limited range, so distant units never show.
export const RADAR_RANGE = 60;
const SIZES = { s: 118, m: 156, l: 204 };
import { ORDER_COLORS } from './soldiers.js';
export const OWNER_COLORS = { ally: '#5aa8ff', enemy: '#e0503c', none: '#b8b49c' };

export class Minimap {
  constructor(game) {
    this.game = game;
    this.wrap = document.getElementById('minimap');
    this.canvas = this.wrap.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    // phones: tap the radar to open the full war map (there is no Map button)
    if (game.app.input.touch) {
      this.wrap.classList.add('tappable');
      this.wrap.addEventListener('touchend', (e) => {
        e.preventDefault(); e.stopPropagation();
        const g = this.game;
        if (!g.paused && !g.overlay && !g.dead) g.app.openPanel('map', { from: 'game' });
      }, { passive: false });
      this.wrap.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });
    }
    this.t = 0; this.timer = 0;
    this.applySettings();
  }

  applySettings() {
    const s = this.game.settings;
    const on = s.minimap !== false;
    this.wrap.hidden = !on;
    const touchScale = this.game.app.input.touch ? 0.8 : 1;
    const px = Math.round((SIZES[s.minimapSize] || SIZES.m) * touchScale);
    this.size = px;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = this.canvas.height = Math.round(px * dpr);
    this.canvas.style.width = this.canvas.style.height = px + 'px';
    this.dpr = dpr;
    document.documentElement.style.setProperty('--mm', on ? px + 'px' : '0px');
  }

  update(dt) {
    if (this.wrap.hidden) return;
    this.t += dt;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / 15;      // 15 redraws a second is plenty
    this.draw();
  }

  draw() {
    const g = this.game, c = this.ctx, S = this.size, dpr = this.dpr;
    const R = S / 2, scale = (R - 6) / RADAR_RANGE;
    const p = g.player.pos, yaw = g.player.yaw;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    // world offset -> radar pixels (facing direction is up)
    const toRadar = (x, z) => {
      const dx = x - p.x, dz = z - p.z;
      return [R + (dx * rx + dz * rz) * scale, R - (dx * fx + dz * fz) * scale, Math.hypot(dx, dz)];
    };
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, S, S);
    c.save();
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = 'rgba(22, 25, 17, 0.78)'; c.fillRect(0, 0, S, S);
    // range rings and a faint forward wedge
    c.strokeStyle = 'rgba(160, 160, 120, 0.22)'; c.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3]) { c.beginPath(); c.arc(R, R, (R - 6) * f, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.moveTo(R, 6); c.lineTo(R, S - 6); c.moveTo(6, R); c.lineTo(S - 6, R); c.stroke();
    c.fillStyle = 'rgba(214, 204, 166, 0.06)';
    c.beginPath(); c.moveTo(R, R); c.arc(R, R, R, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); c.fill();

    // forts and the cabin
    for (const f of (g.forts ? g.forts.list : [])) {
      const [x, y, d] = toRadar(f.cx + 0.5, f.cz + 0.5);
      if (d > RADAR_RANGE + 6) continue;
      const s = Math.max(7, 13 * scale * 2);
      c.fillStyle = OWNER_COLORS[f.owner] || OWNER_COLORS.none;
      c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5;
      c.save(); c.translate(x, y);
      c.fillRect(-s / 2, -s / 2, s, s); c.strokeRect(-s / 2, -s / 2, s, s);
      c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(-s / 4, -s / 4, s / 2, s / 2);
      c.restore();
      if (f.alarm > 0 && Math.floor(this.t * 4) % 2 === 0) { c.strokeStyle = '#ff6040'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.stroke(); }
    }
    const cabin = g.world.sites.find((st) => st.type === 'cabin');
    if (cabin) {
      const [x, y, d] = toRadar(cabin.x + 0.5, cabin.z + 0.5);
      if (d <= RADAR_RANGE + 6) {
        c.fillStyle = '#d8c890'; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y - 1); c.lineTo(x + 5, y - 1); c.lineTo(x + 5, y + 6);
        c.lineTo(x - 5, y + 6); c.lineTo(x - 5, y - 1); c.lineTo(x - 7, y - 1); c.closePath(); c.fill(); c.stroke();
      }
    }

    // Town Life: shops (gold), houses, townspeople (green), the posse (red),
    // witnesses on their way to the sheriff (flashing)
    if (g.town) {
      const vil = g.town.village;
      for (const b of vil.buildings) {
        const [x, y, d] = toRadar((b.x0 + b.x1) / 2 + 0.5, (b.z0 + b.z1) / 2 + 0.5);
        if (d > RADAR_RANGE + 6) continue;
        c.fillStyle = b.type === 'house' ? '#8a8270' : b.type === 'hall' ? '#7a8aa0' : '#d8b048'; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1;
        c.fillRect(x - 4, y - 4, 8, 8); c.strokeRect(x - 4, y - 4, 8, 8);
      }
      const marks = g.town.marks();
      for (const v of g.town.folk.list) {
        if (!v.alive || v.away) continue;
        const [x, y, d] = toRadar(v.pos.x, v.pos.z);
        if (d > RADAR_RANGE) continue;
        const wit = marks.includes(v);
        if (wit && Math.floor(this.t * 4) % 2) continue;
        c.fillStyle = v.posse ? OWNER_COLORS.enemy : wit ? '#ffd040' : '#7ac860'; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 1;
        c.beginPath(); c.arc(x, y, wit ? 4 : 2.6, 0, Math.PI * 2); c.fill(); c.stroke();
      }
    }
    // incoming enemy grenades: flashing warning marks
    if (g.explosives && Math.floor(this.t * 4) % 2 === 0) for (const pr of g.explosives.projectiles) {
      if (pr.owner !== 'enemy' || pr.kind !== 'grenade') continue;
      const [x, y, d] = toRadar(pr.pos.x, pr.pos.z);
      if (d > RADAR_RANGE) continue;
      c.fillStyle = '#ff5030'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.fillRect(x - 0.75, y - 3, 1.5, 3.5); c.fillRect(x - 0.75, y + 1.5, 1.5, 1.5);
    }
    // soldiers: small dots, smaller when the area is crowded
    // a night parachute drop: the radar shows no enemies until they are close
    const dropDark = g.player.chute && g.sky.daylight < 0.5;
    const units = g.enemies ? g.enemies.list.filter((s) => s.alive && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < (dropDark && s.faction === 'enemy' ? 18 : RADAR_RANGE)) : [];
    const dot = units.length > 18 ? 2 : units.length > 9 ? 2.5 : 3;
    for (const s of units) {
      const [x, y] = toRadar(s.pos.x, s.pos.z);
      c.fillStyle = s.faction === 'ally' ? (s.inSquad ? ORDER_COLORS[s.role] : OWNER_COLORS.ally) : OWNER_COLORS.enemy;
      c.strokeStyle = s.selected ? '#ffe040' : 'rgba(0,0,0,0.75)'; c.lineWidth = s.selected ? 2 : 1;
      c.beginPath(); c.arc(x, y, s.inSquad ? dot + 0.5 : dot, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    // order targets: advance points, holds, forts to attack or defend
    for (const m of (g.enemies && g.cfg.sub === 'allies' ? g.enemies.orderMarks() : [])) {
      let [x, y, d] = toRadar(m.x, m.z);
      if (d > RADAR_RANGE) { x = R + (x - R) * RADAR_RANGE / d; y = R + (y - R) * RADAR_RANGE / d; }   // pinned to the rim
      c.strokeStyle = ORDER_COLORS[m.kind]; c.fillStyle = ORDER_COLORS[m.kind]; c.lineWidth = 2;
      c.beginPath();
      if (m.kind === 'attack') { c.arc(x, y, 7, 0, Math.PI * 2); c.moveTo(x - 10, y); c.lineTo(x + 10, y); c.moveTo(x, y - 10); c.lineTo(x, y + 10); c.stroke(); }
      else if (m.kind === 'defend') { c.arc(x, y, 9, 0, Math.PI * 2); c.stroke(); }
      else if (m.kind === 'hold') { c.strokeRect(x - 4, y - 4, 8, 8); }
      else { c.moveTo(x, y + 6); c.lineTo(x, y - 8); c.stroke(); c.beginPath(); c.moveTo(x, y - 8); c.lineTo(x + 7, y - 5); c.lineTo(x, y - 2); c.closePath(); c.fill(); }
    }
    const tank = g.enemies && g.enemies.tank;
    if (tank && tank.alive) {
      const [x, y, d] = toRadar(tank.pos.x, tank.pos.z);
      if (d < RADAR_RANGE) { c.fillStyle = OWNER_COLORS.enemy; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.fillRect(x - 5, y - 4, 10, 8); c.strokeRect(x - 5, y - 4, 10, 8); }
    }

    // mission objective: a gold ring, pinned to the rim when far away
    const mk = g.mission && g.mission.marker();
    if (mk) {
      let [x, y, d] = toRadar(mk.x, mk.z);
      if (d > RADAR_RANGE) { x = R + (x - R) * RADAR_RANGE / d; y = R + (y - R) * RADAR_RANGE / d; }
      c.strokeStyle = '#ffd040'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#ffd040'; c.beginPath(); c.arc(x, y, 2, 0, Math.PI * 2); c.fill();
    }

    // flashing TNT warnings (enemy charges)
    if (Math.floor(this.t * 3) % 2 === 0) {
      for (const l of g.explosives.lit.values()) {
        if (l.owner !== 'enemy') continue;
        const [x, y, d] = toRadar(l.x + 0.5, l.z + 0.5);
        if (d > RADAR_RANGE) continue;
        c.fillStyle = '#ffb030'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y + 5); c.lineTo(x - 7, y + 5); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = '#000'; c.fillRect(x - 0.75, y - 3, 1.5, 4.5); c.fillRect(x - 0.75, y + 2.5, 1.5, 1.5);
      }
    }

    // the player: chevron pointing up (the direction you face)
    c.fillStyle = '#f0e6c4'; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R + 5, R + 5); c.lineTo(R, R + 2); c.lineTo(R - 5, R + 5); c.closePath(); c.fill(); c.stroke();
    c.restore();

    // bezel and a north marker on the rim
    c.strokeStyle = '#75724f'; c.lineWidth = 2;
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
    const nx = R - rz * (R - 9), ny = R + fz * (R - 9);   // world north (-Z) on the rim
    c.fillStyle = '#c9a24a'; c.font = `bold ${Math.round(S / 13)}px Oswald, Arial, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', nx, ny);
  }
}
