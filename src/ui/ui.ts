/**
 * All DOM based user interface: start menu, HUD, prompts, toasts and the
 * transition fade. Kept separate from the game logic so the renderer never
 * touches the DOM directly.
 */

import { WORLD_TYPES, type WorldType } from '../world/types';

export interface MenuCallbacks {
  onStart: (seed: string, type: WorldType | 'random', quality: 'low' | 'medium' | 'high', pixelation: number) => void;
  onResume: () => void;
  onRestart: (seed: string, type: WorldType | 'random') => void;
}

export interface HudInfo {
  worldName: string;
  subtitle: string;
  seed: string;
  objective: string;
  artifacts: number;
  required: number;
  fps: number;
  /** how many worlds the player has walked through */
  depth: number;
}

/** Reads a shared seed from the URL fragment (#seed=abc). */
export function readSeedFromUrl(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const seed = params.get('seed');
  return seed && seed.length > 0 ? seed : null;
}

export class UI {
  private readonly root: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly pause: HTMLElement;
  private readonly fade: HTMLElement;
  private toastEl!: HTMLElement;
  private promptEl!: HTMLElement;
  private compassEl!: HTMLElement;
  private worldNameEl!: HTMLElement;
  private subtitleEl!: HTMLElement;
  private seedEl!: HTMLElement;
  private objectiveEl!: HTMLElement;
  private counterEl!: HTMLElement;
  private fpsEl!: HTMLElement;

  private toastTimer = 0;
  private currentSeed = 'liminal';
  private currentType: WorldType | 'random' = 'random';

  constructor(root: HTMLElement, private readonly callbacks: MenuCallbacks) {
    this.root = root;
    this.menu = this.buildMenu();
    this.pause = this.buildPause();
    this.hud = this.buildHud();
    this.fade = document.createElement('div');
    this.fade.className = 'fade';
    this.root.appendChild(this.menu);
    this.root.appendChild(this.pause);
    this.root.appendChild(this.hud);
    this.root.appendChild(this.fade);
  }

  // ------------------------------------------------------------------ menu
  private buildMenu(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'menu';
    el.innerHTML = `
      <div class="menu-card">
        <h1>LIMINAL<span>DRIFT</span></h1>
        <p class="tagline">seeded worlds · dreamcore · nowhere to arrive</p>
        <label class="field">
          <span>Seed</span>
          <div class="seed-row">
            <input id="seed-input" type="text" maxlength="32" spellcheck="false" autocomplete="off" />
            <button id="seed-random" type="button" title="random seed">⟳</button>
          </div>
        </label>
        <div class="field">
          <span>World</span>
          <div id="world-picker" class="chips"></div>
        </div>
        <div class="field">
          <span>Quality</span>
          <div id="quality-picker" class="chips"></div>
        </div>
        <label class="field">
          <span>Pixelation <i id="pixel-value">off</i></span>
          <input id="pixel-slider" type="range" min="1" max="8" step="1" value="1" />
        </label>
        <button id="start-btn" class="primary" type="button">Enter the world</button>
        <div class="help">
          <p><b>Touch</b> — left side: walk · right side: look · buttons: jump / interact / run / crouch</p>
          <p><b>Desktop</b> — WASD · mouse drag: look · Space: jump · E: interact · Shift: run · C: crouch</p>
          <p>Find the lost objects. The exit only appears when you have them all.</p>
        </div>
      </div>
    `;

    const picker = el.querySelector('#world-picker') as HTMLElement;
    const options: Array<{ id: WorldType | 'random'; label: string }> = [
      { id: 'random', label: 'random' },
      ...WORLD_TYPES.map((t) => ({ id: t, label: t })),
    ];
    for (const opt of options) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = opt.id;
      chip.textContent = opt.label;
      chip.addEventListener('click', () => {
        this.currentType = opt.id;
        picker.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      });
      picker.appendChild(chip);
    }
    picker.querySelector('.chip')?.classList.add('active');

    const qualityPicker = el.querySelector('#quality-picker') as HTMLElement;
    for (const q of ['low', 'medium', 'high'] as const) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = q;
      chip.textContent = q;
      chip.addEventListener('click', () => {
        qualityPicker.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
      });
      qualityPicker.appendChild(chip);
    }
    qualityPicker.querySelector('[data-value="medium"]')?.classList.add('active');

    const seedInput = el.querySelector('#seed-input') as HTMLInputElement;
    const fromUrl = readSeedFromUrl();
    this.currentSeed = fromUrl ?? this.currentSeed;
    seedInput.value = this.currentSeed;
    seedInput.addEventListener('input', () => {
      this.currentSeed = seedInput.value;
    });

    (el.querySelector('#seed-random') as HTMLButtonElement).addEventListener('click', () => {
      const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
      let out = '';
      for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
      seedInput.value = out;
      this.currentSeed = out;
    });

    const pixelSlider = el.querySelector('#pixel-slider') as HTMLInputElement;
    const pixelValue = el.querySelector('#pixel-value') as HTMLElement;
    pixelSlider.addEventListener('input', () => {
      const v = Number(pixelSlider.value);
      pixelValue.textContent = v <= 1 ? 'off' : `${v}x`;
    });

    (el.querySelector('#start-btn') as HTMLButtonElement).addEventListener('click', () => {
      const seed = (seedInput.value || 'liminal').trim();
      const quality =
        (qualityPicker.querySelector('.chip.active') as HTMLElement | null)?.dataset.value ?? 'medium';
      const pixelation = Number(pixelSlider.value);
      this.callbacks.onStart(seed || 'liminal', this.currentType, quality as 'low' | 'medium' | 'high', pixelation);
    });

    return el;
  }

  // ----------------------------------------------------------------- pause
  private buildPause(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'pause hidden';
    el.innerHTML = `
      <div class="menu-card small">
        <h2>Paused</h2>
        <button id="resume-btn" class="primary" type="button">Continue</button>
        <button id="restart-btn" class="ghost" type="button">New world</button>
        <button id="menu-btn" class="ghost" type="button">Main menu</button>
      </div>
    `;
    (el.querySelector('#resume-btn') as HTMLButtonElement).addEventListener('click', () => this.callbacks.onResume());
    (el.querySelector('#restart-btn') as HTMLButtonElement).addEventListener('click', () =>
      this.callbacks.onRestart(this.currentSeed, this.currentType),
    );
    (el.querySelector('#menu-btn') as HTMLButtonElement).addEventListener('click', () => {
      this.showMenu();
    });
    return el;
  }

  // ------------------------------------------------------------------- hud
  private buildHud(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'hud hidden';
    el.innerHTML = `
      <div class="hud-top-left">
        <div id="world-name" class="world-name">—</div>
        <div id="world-sub" class="world-sub">—</div>
        <div id="seed-label" class="seed-label">seed —</div>
      </div>
      <div class="hud-top-right">
        <div id="objective" class="objective">—</div>
        <div id="counter" class="counter">0 / 0</div>
        <div id="fps" class="fps">60 fps</div>
        <button id="pause-btn" class="icon-button" type="button">☰</button>
      </div>
      <div id="compass" class="compass"><span>▲</span></div>
      <div id="prompt" class="prompt hidden"></div>
      <div id="toast" class="toast"></div>
      <div id="crosshair" class="crosshair"></div>
    `;
    this.worldNameEl = el.querySelector('#world-name') as HTMLElement;
    this.subtitleEl = el.querySelector('#world-sub') as HTMLElement;
    this.seedEl = el.querySelector('#seed-label') as HTMLElement;
    this.objectiveEl = el.querySelector('#objective') as HTMLElement;
    this.counterEl = el.querySelector('#counter') as HTMLElement;
    this.fpsEl = el.querySelector('#fps') as HTMLElement;
    this.promptEl = el.querySelector('#prompt') as HTMLElement;
    this.toastEl = el.querySelector('#toast') as HTMLElement;
    this.compassEl = el.querySelector('#compass') as HTMLElement;
    (el.querySelector('#pause-btn') as HTMLButtonElement).addEventListener('click', () => {
      this.showPause();
    });
    this.seedEl.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.currentSeed);
      this.toast('seed copied');
    });
    return el;
  }

  // ---------------------------------------------------------------- public
  showMenu(): void {
    this.menu.classList.remove('hidden');
    this.pause.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  hideMenu(): void {
    this.menu.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  showPause(): void {
    this.pause.classList.remove('hidden');
  }

  hidePause(): void {
    this.pause.classList.add('hidden');
  }

  get isPaused(): boolean {
    return !this.pause.classList.contains('hidden');
  }

  get isMenuOpen(): boolean {
    return !this.menu.classList.contains('hidden');
  }

  setHud(info: HudInfo): void {
    this.worldNameEl.textContent = `${info.worldName} · ${info.depth}`;
    this.subtitleEl.textContent = info.subtitle;
    this.seedEl.textContent = `seed ${info.seed}`;
    this.objectiveEl.textContent = info.objective;
    this.counterEl.textContent = `${info.artifacts} / ${info.required}`;
    this.fpsEl.textContent = `${info.fps} fps`;
  }

  setSeed(seed: string): void {
    this.currentSeed = seed;
  }

  setType(type: WorldType | 'random'): void {
    this.currentType = type;
  }

  setPrompt(text: string | null): void {
    if (!text) {
      this.promptEl.classList.add('hidden');
      return;
    }
    this.promptEl.textContent = text;
    this.promptEl.classList.remove('hidden');
  }

  /** Rotates the compass arrow towards the objective (angle in radians, 0 = up). */
  setCompass(angle: number | null): void {
    if (angle === null) {
      this.compassEl.classList.add('hidden');
      return;
    }
    this.compassEl.classList.remove('hidden');
    this.compassEl.style.transform = `rotate(${angle}rad)`;
  }

  toast(message: string, duration = 2.2): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    this.toastTimer = duration;
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.remove('visible');
    }
  }

  fadeOut(duration = 0.45): Promise<void> {
    this.fade.style.transitionDuration = `${duration}s`;
    this.fade.classList.add('black');
    return new Promise((resolve) => setTimeout(resolve, duration * 1000));
  }

  fadeIn(duration = 0.55): Promise<void> {
    this.fade.style.transitionDuration = `${duration}s`;
    this.fade.classList.remove('black');
    return new Promise((resolve) => setTimeout(resolve, duration * 1000));
  }
}
