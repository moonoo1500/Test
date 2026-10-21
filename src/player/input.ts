/**
 * Input handling for touch devices (primary) and desktop (fallback).
 *
 * - left half of the screen: dynamic virtual joystick (movement)
 * - right half of the screen: drag to look around
 * - on screen buttons: jump, interact, run, crouch
 */

export interface InputState {
  moveX: number;
  moveZ: number;
  sprint: boolean;
  crouch: boolean;
}

export interface LookDelta {
  yaw: number;
  pitch: number;
}

const KEY_MAP: Record<string, keyof InputState | 'jump' | 'interact'> = {
  KeyW: 'moveZ',
  ArrowUp: 'moveZ',
  KeyS: 'moveZ',
  ArrowDown: 'moveZ',
  KeyA: 'moveX',
  ArrowLeft: 'moveX',
  KeyD: 'moveX',
  ArrowRight: 'moveX',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyC: 'crouch',
  ControlLeft: 'crouch',
  Space: 'jump',
  KeyE: 'interact',
  Enter: 'interact',
};

export class InputManager {
  readonly state: InputState = { moveX: 0, moveZ: 0, sprint: false, crouch: false };

  /** accumulated look delta, consumed every frame */
  lookYaw = 0;
  lookPitch = 0;

  jumpQueued = false;
  interactQueued = false;

  /** sensitivity in radians per pixel */
  sensitivity = 0.0032;
  invertY = false;

  private readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private joystickBase!: HTMLElement;
  private joystickKnob!: HTMLElement;
  private jumpButton!: HTMLButtonElement;
  private interactButton!: HTMLButtonElement;
  private runButton!: HTMLButtonElement;
  private crouchButton!: HTMLButtonElement;

  private joyPointerId: number | null = null;
  private lookPointerId: number | null = null;
  private joyOriginX = 0;
  private joyOriginY = 0;
  private lookLastX = 0;
  private lookLastY = 0;
  private keys = new Set<string>();
  private touchMoveX = 0;
  private touchMoveZ = 0;
  private enabled = true;
  /** true while a menu is open — blocks gameplay input */
  private suspended = false;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.canvas = canvas;
    this.root = root;
    this.buildUi();
    this.attachEvents();
  }

  private buildUi(): void {
    const container = document.createElement('div');
    container.className = 'touch-controls';

    this.joystickBase = document.createElement('div');
    this.joystickBase.className = 'joystick-base';
    this.joystickKnob = document.createElement('div');
    this.joystickKnob.className = 'joystick-knob';
    this.joystickBase.appendChild(this.joystickKnob);
    container.appendChild(this.joystickBase);

    const buttonCluster = document.createElement('div');
    buttonCluster.className = 'button-cluster';

    const makeButton = (cls: string, label: string): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.className = `touch-button ${cls}`;
      btn.textContent = label;
      btn.setAttribute('type', 'button');
      buttonCluster.appendChild(btn);
      return btn;
    };

    this.jumpButton = makeButton('btn-jump', '▲');
    this.interactButton = makeButton('btn-interact', '✋');
    this.runButton = makeButton('btn-run', '»');
    this.crouchButton = makeButton('btn-crouch', '▼');

    container.appendChild(buttonCluster);
    this.root.appendChild(container);
  }

  private attachEvents(): void {
    const canvas = this.canvas;

    canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e), { passive: false });
    window.addEventListener('pointermove', (e) => this.onPointerMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
    window.addEventListener('pointercancel', (e) => this.onPointerUp(e));
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.joyPointerId = null;
      this.lookPointerId = null;
      this.updateJoystickVisual(0, 0);
    });

    const stop = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };

    this.jumpButton.addEventListener('pointerdown', (e) => {
      stop(e);
      this.jumpQueued = true;
      this.jumpButton.classList.add('pressed');
    });
    this.jumpButton.addEventListener('pointerup', (e) => {
      stop(e);
      this.jumpButton.classList.remove('pressed');
    });

    this.interactButton.addEventListener('pointerdown', (e) => {
      stop(e);
      this.interactQueued = true;
      this.interactButton.classList.add('pressed');
    });
    this.interactButton.addEventListener('pointerup', (e) => {
      stop(e);
      this.interactButton.classList.remove('pressed');
    });

    this.runButton.addEventListener('pointerdown', (e) => {
      stop(e);
      this.state.sprint = !this.state.sprint;
      this.runButton.classList.toggle('pressed', this.state.sprint);
    });

    this.crouchButton.addEventListener('pointerdown', (e) => {
      stop(e);
      this.state.crouch = !this.state.crouch;
      this.crouchButton.classList.toggle('pressed', this.state.crouch);
    });
  }

  private isLeftSide(clientX: number): boolean {
    return clientX < window.innerWidth * 0.45;
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled || this.suspended) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    if (this.isLeftSide(e.clientX) && this.joyPointerId === null) {
      this.joyPointerId = e.pointerId;
      this.joyOriginX = e.clientX;
      this.joyOriginY = e.clientY;
      this.joystickBase.style.left = `${e.clientX}px`;
      this.joystickBase.style.top = `${e.clientY}px`;
      this.joystickBase.classList.add('active');
    } else if (this.lookPointerId === null) {
      this.lookPointerId = e.pointerId;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.enabled || this.suspended) return;
    if (e.pointerId === this.joyPointerId) {
      e.preventDefault();
      const dx = e.clientX - this.joyOriginX;
      const dy = e.clientY - this.joyOriginY;
      const max = 58;
      const len = Math.hypot(dx, dy);
      const clamped = Math.min(1, len / max);
      const angle = Math.atan2(dy, dx);
      const nx = Math.cos(angle) * clamped;
      const ny = Math.sin(angle) * clamped;
      this.touchMoveX = nx;
      this.touchMoveZ = -ny;
      this.updateJoystickVisual(nx * max, ny * max);
    } else if (e.pointerId === this.lookPointerId) {
      e.preventDefault();
      const dx = e.clientX - this.lookLastX;
      const dy = e.clientY - this.lookLastY;
      this.lookLastX = e.clientX;
      this.lookLastY = e.clientY;
      this.lookYaw -= dx * this.sensitivity;
      this.lookPitch -= dy * this.sensitivity * (this.invertY ? -1 : 1);
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.joyPointerId) {
      this.joyPointerId = null;
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.joystickBase.classList.remove('active');
      this.updateJoystickVisual(0, 0);
    } else if (e.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
  }

  private updateJoystickVisual(x: number, y: number): void {
    this.joystickKnob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled) return;
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    const mapped = KEY_MAP[e.code];
    if (mapped) {
      if (e.code === 'Space') e.preventDefault();
      if (mapped === 'jump') this.jumpQueued = true;
      if (mapped === 'interact') this.interactQueued = true;
      if (mapped === 'sprint') this.state.sprint = true;
      if (mapped === 'crouch') this.state.crouch = true;
      this.keys.add(e.code);
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const mapped = KEY_MAP[e.code];
    if (mapped) {
      if (mapped === 'sprint') this.state.sprint = false;
      if (mapped === 'crouch') this.state.crouch = false;
    }
    this.keys.delete(e.code);
  }

  /** Folds keyboard and touch state into a single movement vector. */
  update(): InputState {
    let kx = 0;
    let kz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) kz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) kz -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;

    let mx = kx + this.touchMoveX;
    let mz = kz + this.touchMoveZ;
    const len = Math.hypot(mx, mz);
    if (len > 1) {
      mx /= len;
      mz /= len;
    }
    this.state.moveX = mx;
    this.state.moveZ = mz;
    return this.state;
  }

  consumeLook(): LookDelta {
    const delta = { yaw: this.lookYaw, pitch: this.lookPitch };
    this.lookYaw = 0;
    this.lookPitch = 0;
    return delta;
  }

  consumeJump(): boolean {
    const v = this.jumpQueued;
    this.jumpQueued = false;
    return v;
  }

  consumeInteract(): boolean {
    const v = this.interactQueued;
    this.interactQueued = false;
    return v;
  }

  setSuspended(value: boolean): void {
    this.suspended = value;
    if (value) {
      this.touchMoveX = 0;
      this.touchMoveZ = 0;
      this.joyPointerId = null;
      this.lookPointerId = null;
      this.joystickBase.classList.remove('active');
      this.updateJoystickVisual(0, 0);
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  /** Shows or hides the on screen controls (e.g. in the menu). */
  setVisible(value: boolean): void {
    const container = this.root.querySelector('.touch-controls') as HTMLElement | null;
    if (container) container.style.display = value ? 'block' : 'none';
  }
}
