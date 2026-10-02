// Items lying in the world (meat from animals; loot in later stages).
// Walk over them to pick them up.
import * as THREE from 'three';
import { SOLID } from './blocks.js';
import { iconCanvas } from './items.js';
import { sfx } from './audio.js';

const texCache = {};
function iconTex(id) {
  if (!texCache[id]) {
    const t = new THREE.CanvasTexture(iconCanvas(id));
    t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    texCache[id] = t;
  }
  return texCache[id];
}

export class Pickups {
  constructor(game, saved = []) {
    this.game = game;
    this.list = [];
    for (const s of saved) this.spawn(s.id, s.n, s.x, s.y, s.z, s.age);
  }
  spawn(id, n, x, y, z, age = 0) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex(id), transparent: true }));
    sprite.scale.set(0.55, 0.55, 0.55);
    this.game.scene.add(sprite);
    this.list.push({ id, n, pos: new THREE.Vector3(x, y, z), vy: 2, sprite, age, t: Math.random() * 6 });
  }
  update(dt) {
    const g = this.game, w = g.world, p = g.player.pos;
    for (const it of this.list.slice()) {
      it.age += dt; it.t += dt;
      // fall onto the ground
      const below = w.get(Math.floor(it.pos.x), Math.floor(it.pos.y - 0.25), Math.floor(it.pos.z));
      if (!SOLID[below]) { it.vy -= 20 * dt; it.pos.y += it.vy * dt; }
      else { it.vy = 0; it.pos.y = Math.floor(it.pos.y - 0.25) + 1.25; }
      if (it.pos.y < 0) it.pos.y = 0;
      it.sprite.position.set(it.pos.x, it.pos.y + Math.sin(it.t * 2.5) * 0.06, it.pos.z);
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
      if (d < 1.6 && Math.abs(it.pos.y - (p.y + 0.5)) < 2 && it.age > 0.4) {
        g.give(it.id, it.n);
        sfx.click();
        this.removeItem(it);
      } else if (it.age > 600) this.removeItem(it); // ten minutes
    }
  }
  removeItem(it) {
    this.game.scene.remove(it.sprite);
    it.sprite.material.dispose();
    this.list = this.list.filter((x) => x !== it);
  }
  toSave() { return this.list.map((i) => ({ id: i.id, n: i.n, x: i.pos.x, y: i.pos.y, z: i.pos.z, age: i.age })); }
  dispose() { for (const it of this.list.slice()) this.removeItem(it); }
}
