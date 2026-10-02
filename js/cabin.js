// Play Alone cabin: indestructible log cabin with an ever-burning campfire,
// a bed (where you wake up after being defeated) and a storage chest. Enemy
// soldiers never set foot inside.
import * as THREE from 'three';

export class Cabin {
  constructor(game, saved) {
    this.game = game;
    this.site = game.world.sites.find((s) => s.type === 'cabin') || null;
    this.chest = saved && saved.chest ? saved.chest : { counts: {} };
    if (!this.site || !this.site.bed) { this.site = null; return; }
    // the bed: a low wooden frame, a straw mattress and a grey blanket
    const b = this.site.bed;
    const g = new THREE.Group();
    const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lam(c)); m.position.set(x, y, z); g.add(m); };
    box(0.95, 0.28, 1.9, 0x5a3e26, 0, 0.14, 0);
    box(0.85, 0.12, 1.8, 0xb8a878, 0, 0.34, 0);
    box(0.88, 0.06, 1.25, 0x5e6258, 0, 0.42, 0.28);
    box(0.5, 0.1, 0.3, 0xe0d8c0, 0, 0.44, -0.65);
    box(0.95, 0.55, 0.08, 0x4a3420, 0, 0.3, -0.95);
    g.position.set(b.x, b.y, b.z);
    game.scene.add(g);
    this.mesh = g;
  }
  get on() { return !!this.site; }
  // inside the cabin's footprint (walls included)?
  covers(x, z, pad = 0.6) {
    const s = this.site;
    return !!s && Math.abs(x - (s.x + 0.5)) <= s.r + pad && Math.abs(z - (s.z + 0.5)) <= s.r + pad;
  }
  nearChest(pos) { const c = this.site && this.site.chest; return !!c && Math.hypot(pos.x - (c.x + 0.5), pos.z - (c.z + 0.5)) < 2 && Math.abs(pos.y - c.y) < 2; }
  isChest(x, y, z) { const c = this.site && this.site.chest; return !!c && c.x === x && c.y === y && c.z === z; }
  bedSpot() { const b = this.site.bed; return { x: b.x + 1.1, y: b.y, z: b.z }; }
  // move items between the inventory and the chest
  store(id, n) {
    const g = this.game, have = g.inv.counts[id] || 0;
    n = Math.min(n, have); if (n <= 0) return;
    g.inv.counts[id] = have - n;
    this.chest.counts[id] = (this.chest.counts[id] || 0) + n;
    g.hud.dirtyHotbar = true;
  }
  takeOut(id, n) {
    const have = this.chest.counts[id] || 0;
    n = Math.min(n, have); if (n <= 0) return;
    this.chest.counts[id] = have - n;
    if (!this.chest.counts[id]) delete this.chest.counts[id];
    this.game.give(id, n, true);
  }
  toSave() { return this.chest; }
  dispose() { if (this.mesh) this.game.scene.remove(this.mesh); }
}
