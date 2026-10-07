// Keyboard, mouse (pointer lock) and touch controls, merged into one state.
export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();     // keys pressed this frame (edge)
    this.mouse = { left: false, right: false, leftPressed: false, rightPressed: false, dx: 0, dy: 0, wheel: 0 };
    this.locked = false;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.move = { x: 0, y: 0 };   // joystick (-1..1)
    this.touchBtn = new Set();
    this.touchPressed = new Set();
    this.enabled = false;
    this.onUnlock = null;
    this.lastSpace = 0;
    this.doubleSpace = false;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        if (e.code === 'Space') {
          const now = performance.now();
          if (now - this.lastSpace < 300) this.doubleSpace = true;
          this.lastSpace = now;
        }
      }
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) { this.keys.clear(); this.mouse.left = this.mouse.right = false; if (this.onUnlock) this.onUnlock(); }
    });

    if (this.touch) this.setupTouch(touchRoot);
  }

  requestLock() {
    if (this.touch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* ignore */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  setupTouch(root) {
    root.classList.add('active');
    document.body.classList.add('touchui');
    const stick = root.querySelector('.stick'), knob = root.querySelector('.knob');
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0, tapT = 0, tapMove = 0;
    const R = 50;
    root.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        const btn = t.target.closest('[data-btn]');
        if (btn) {
          const b = btn.dataset.btn;
          this.touchBtn.add(b); this.touchPressed.add(b); btn.classList.add('down');
          btn.dataset.tid = t.identifier;
          continue;
        }
        if (t.target.closest('.hotbar')) continue;
        // a swipe down from the top edge (used to leave the zoom)
        if (t.clientY < 36) { this.swipeId = t.identifier; this.swipeY = t.clientY; }
        if (t.clientX < innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; stick.classList.add('show');
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; tapT = performance.now(); tapMove = 0; }
      }
      e.preventDefault();
    }, { passive: false });
    root.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.move.x = dx / R; this.move.y = dy / R;
        }
        if (t.identifier === this.swipeId && t.clientY - this.swipeY > 70) { this.touchPressed.add('swipeDown'); this.swipeId = null; }
        if (t.identifier === lookId) {
          this.mouse.dx += (t.clientX - lx) * 2.2; this.mouse.dy += (t.clientY - ly) * 2.2; tapMove += Math.abs(t.clientX - lx) + Math.abs(t.clientY - ly);
          lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.move.x = this.move.y = 0; knob.style.transform = ''; stick.classList.remove('show'); }
        // a quick tap without dragging on the look side: use what you aim at
        if (t.identifier === lookId) { lookId = null; if (performance.now() - tapT < 280 && tapMove < 14) this.touchPressed.add('tap'); }
        root.querySelectorAll('[data-btn].down').forEach((b) => {
          if (b.dataset.tid == t.identifier) { b.classList.remove('down'); this.touchBtn.delete(b.dataset.btn); }
        });
      }
    };
    root.addEventListener('touchend', end); root.addEventListener('touchcancel', end);
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  tdown(b) { return this.touchBtn.has(b); }
  thit(b) { return this.touchPressed.has(b); }

  endFrame() {
    this.pressed.clear(); this.touchPressed.clear();
    this.mouse.dx = this.mouse.dy = 0; this.mouse.wheel = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.doubleSpace = false;
  }
}
