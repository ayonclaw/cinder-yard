// Pointer lock, keys and mouse: the only place the game reads the keyboard.

export class Input {
  constructor(canvas, element = window) {
    this.canvas = canvas;
    this.element = element;
    this.keys = new Set();
    this.pressed = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.fireHeld = false;
    this.firePressed = false;
    this.locked = false;
    this.wheel = 0;
    this.onLockChange = () => {};

    element.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const code = event.code;
      if (['Space', 'ControlLeft', 'Tab', 'KeyB', 'KeyE', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(code)) {
        event.preventDefault();
      }
      this.keys.add(code);
      this.pressed.add(code);
    });
    element.addEventListener('keyup', (event) => this.keys.delete(event.code));
    element.addEventListener('blur', () => { this.keys.clear(); this.fireHeld = false; });

    canvas.addEventListener('mousedown', (event) => {
      if (event.button === 0) { this.fireHeld = true; this.firePressed = true; }
      if (event.button === 2) this.keys.add('MouseRight');
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) this.fireHeld = false;
      if (event.button === 2) this.keys.delete('MouseRight');
    });
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    window.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.lookX += event.movementX;
      this.lookY += event.movementY;
    });
    window.addEventListener('wheel', (event) => {
      this.wheel += Math.sign(event.deltaY);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.fireHeld = false; }
      this.onLockChange(this.locked);
    });
  }

  requestLock() {
    if (this.locked) return;
    const result = this.canvas.requestPointerLock?.();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  takeLook() {
    const out = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }
  takeWheel() {
    const value = this.wheel;
    this.wheel = 0;
    return value;
  }
  endFrame() {
    this.pressed.clear();
    this.firePressed = false;
  }
}
