/**
 * @vitest-environment jsdom
 *
 * Step 8 — menu and HUD.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UI, type MenuCallbacks } from '../src/ui/ui';

describe('step 8 · user interface', () => {
  let root: HTMLElement;
  let callbacks: MenuCallbacks;
  let ui: UI;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    callbacks = {
      onStart: vi.fn(),
      onResume: vi.fn(),
      onRestart: vi.fn(),
    };
    ui = new UI(root, callbacks);
  });

  it('shows the menu on start and hides it afterwards', () => {
    expect(ui.isMenuOpen).toBe(true);
    ui.hideMenu();
    expect(ui.isMenuOpen).toBe(false);
    expect(root.querySelector('.hud')?.classList.contains('hidden')).toBe(false);
  });

  it('starts the game with the entered seed', () => {
    const input = root.querySelector('#seed-input') as HTMLInputElement;
    input.value = 'dreamcore';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    (root.querySelector('#start-btn') as HTMLButtonElement).click();
    expect(callbacks.onStart).toHaveBeenCalledTimes(1);
    const args = (callbacks.onStart as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe('dreamcore');
    expect(args[2]).toBe('medium');
  });

  it('offers a random seed', () => {
    const input = root.querySelector('#seed-input') as HTMLInputElement;
    (root.querySelector('#seed-random') as HTMLButtonElement).click();
    expect(input.value.length).toBeGreaterThan(3);
    expect(input.value).not.toBe('liminal');
  });

  it('lets the player pick a world family', () => {
    const chip = root.querySelector('#world-picker [data-value="pool"]') as HTMLButtonElement;
    chip.click();
    expect(chip.classList.contains('active')).toBe(true);
    (root.querySelector('#start-btn') as HTMLButtonElement).click();
    const args = (callbacks.onStart as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[1]).toBe('pool');
  });

  it('updates the hud', () => {
    ui.hideMenu();
    ui.setHud({
      worldName: 'Backrooms',
      subtitle: 'level 0',
      seed: 'abc',
      objective: 'Find the lost pages',
      artifacts: 2,
      required: 3,
      fps: 58,
      depth: 3,
    });
    expect((root.querySelector('#world-name') as HTMLElement).textContent).toContain('Backrooms');
    expect((root.querySelector('#counter') as HTMLElement).textContent).toBe('2 / 3');
    expect((root.querySelector('#fps') as HTMLElement).textContent).toBe('58 fps');
    expect((root.querySelector('#seed-label') as HTMLElement).textContent).toContain('abc');
  });

  it('shows and hides the interaction prompt', () => {
    const prompt = root.querySelector('#prompt') as HTMLElement;
    ui.setPrompt('open door');
    expect(prompt.classList.contains('hidden')).toBe(false);
    expect(prompt.textContent).toBe('open door');
    ui.setPrompt(null);
    expect(prompt.classList.contains('hidden')).toBe(true);
  });

  it('shows a toast message', () => {
    const toast = root.querySelector('#toast') as HTMLElement;
    ui.toast('found one');
    expect(toast.textContent).toBe('found one');
    expect(toast.classList.contains('visible')).toBe(true);
    ui.update(5);
    expect(toast.classList.contains('visible')).toBe(false);
  });

  it('rotates the compass', () => {
    const compass = root.querySelector('#compass') as HTMLElement;
    ui.setCompass(1.2);
    expect(compass.style.transform).toContain('1.2rad');
    ui.setCompass(null);
    expect(compass.classList.contains('hidden')).toBe(true);
  });

  it('handles pause and resume', () => {
    ui.hideMenu();
    ui.showPause();
    expect(ui.isPaused).toBe(true);
    (root.querySelector('#resume-btn') as HTMLButtonElement).click();
    expect(callbacks.onResume).toHaveBeenCalled();
  });

  it('fades the screen for transitions', async () => {
    const fade = root.querySelector('.fade') as HTMLElement;
    await ui.fadeOut(0.01);
    expect(fade.classList.contains('black')).toBe(true);
    await ui.fadeIn(0.01);
    expect(fade.classList.contains('black')).toBe(false);
  });
});
