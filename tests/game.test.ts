/**
 * @vitest-environment jsdom
 *
 * Step 11 — full game boot smoke test.
 *
 * The complete game (renderer, composer, streaming, physics, HUD) is started
 * inside jsdom with a stubbed WebGL context and driven for a few hundred
 * frames. Any runtime error in the boot path fails the test.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installWebGLStub } from './helpers/webgl';
import { Game } from '../src/game';

beforeAll(() => {
  installWebGLStub();
  // jsdom has no audio device
  (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
});

function createGame(): { game: Game; canvas: HTMLCanvasElement; ui: HTMLElement } {
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  const ui = document.createElement('div');
  ui.id = 'ui';
  document.body.appendChild(canvas);
  document.body.appendChild(ui);
  const game = new Game({ canvas, uiRoot: ui });
  return { game, canvas, ui };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) await nextFrame();
}

describe('step 11 · game boot', () => {
  let game: Game | null = null;

  afterEach(() => {
    game = null;
  });

  it('starts in the menu without throwing', async () => {
    const created = createGame();
    game = created.game;
    await waitFrames(5);
    expect(created.ui.querySelector('.menu')).not.toBeNull();
    expect(created.ui.querySelector('.menu')?.classList.contains('hidden')).toBe(false);
  });

  it('enters a world and runs the game loop', async () => {
    const created = createGame();
    game = created.game;

    const seedInput = created.ui.querySelector('#seed-input') as HTMLInputElement;
    seedInput.value = 'smoke';
    seedInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    (created.ui.querySelector('#start-btn') as HTMLButtonElement).click();

    // the transition uses timeouts, let them pass
    await new Promise((resolve) => setTimeout(resolve, 60));
    await waitFrames(20);

    expect(game.currentWorld.seed).toBe('smoke');
    expect(game.currentWorld.type).toBeTruthy();
    expect(game.loadedChunks).toBeGreaterThan(0);

    const pos = game.playerPosition;
    expect(Number.isFinite(pos.x)).toBe(true);
    expect(Number.isFinite(pos.y)).toBe(true);
    expect(Number.isFinite(pos.z)).toBe(true);

    // the HUD shows the world
    expect((created.ui.querySelector('#world-name') as HTMLElement).textContent).not.toBe('—');
    await waitFrames(30);
    expect(game.loadedChunks).toBeLessThanOrEqual(50);
  });

  it('survives a long run with chunks streaming in and out', async () => {
    const created = createGame();
    game = created.game;
    (created.ui.querySelector('#start-btn') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 60));
    await waitFrames(120);

    const before = game.loadedChunks;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThanOrEqual(49);
    // nothing should have exploded
    expect(Number.isFinite(game.playerPosition.y)).toBe(true);
  });
});
