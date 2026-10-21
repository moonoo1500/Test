/**
 * @vitest-environment jsdom
 *
 * Step 7 — touch controls and keyboard fallback.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { InputManager } from '../src/player/input';

function pointerEvent(type: string, x: number, y: number, id = 1, pointerType = 'touch'): Event {
  const ev = new window.MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(ev, 'pointerId', { value: id });
  Object.defineProperty(ev, 'pointerType', { value: pointerType });
  return ev;
}

describe('step 7 · input', () => {
  let canvas: HTMLCanvasElement;
  let root: HTMLElement;
  let input: InputManager;

  beforeEach(() => {
    document.body.innerHTML = '';
    canvas = document.createElement('canvas');
    root = document.createElement('div');
    document.body.appendChild(canvas);
    document.body.appendChild(root);
    input = new InputManager(canvas, root);
  });

  it('creates the on screen controls', () => {
    expect(root.querySelector('.touch-controls')).not.toBeNull();
    expect(root.querySelector('.joystick-base')).not.toBeNull();
    expect(root.querySelectorAll('.touch-button').length).toBe(4);
  });

  it('moves the player with the virtual joystick', () => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 400, 1));
    window.dispatchEvent(pointerEvent('pointermove', 100, 340, 1));
    const state = input.update();
    expect(state.moveZ).toBeGreaterThan(0.5);
    expect(Math.abs(state.moveX)).toBeLessThan(0.05);

    window.dispatchEvent(pointerEvent('pointermove', 40, 400, 1));
    const state2 = input.update();
    expect(state2.moveX).toBeLessThan(-0.5);
  });

  it('releases the joystick on pointer up', () => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 400, 1));
    window.dispatchEvent(pointerEvent('pointermove', 100, 300, 1));
    expect(input.update().moveZ).toBeGreaterThan(0.5);
    window.dispatchEvent(pointerEvent('pointerup', 100, 300, 1));
    expect(input.update().moveZ).toBe(0);
  });

  it('looks around when dragging on the right side', () => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 800, 400, 2));
    window.dispatchEvent(pointerEvent('pointermove', 860, 400, 2));
    const look = input.consumeLook();
    expect(look.yaw).toBeLessThan(0);
    // the delta is consumed exactly once
    expect(input.consumeLook().yaw).toBe(0);
  });

  it('does not mix joystick and look on the same pointer', () => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 400, 1));
    window.dispatchEvent(pointerEvent('pointermove', 100, 300, 1));
    const look = input.consumeLook();
    expect(look.yaw).toBe(0);
    expect(look.pitch).toBe(0);
  });

  it('supports the keyboard', () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyW' }));
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyD' }));
    const state = input.update();
    expect(state.moveZ).toBeCloseTo(Math.SQRT1_2, 2);
    expect(state.moveX).toBeCloseTo(Math.SQRT1_2, 2);
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyW' }));
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyD' }));
    expect(input.update().moveZ).toBe(0);
  });

  it('queues jump and interact from the on screen buttons', () => {
    const jump = root.querySelector('.btn-jump') as HTMLButtonElement;
    jump.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);

    const interact = root.querySelector('.btn-interact') as HTMLButtonElement;
    interact.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(input.consumeInteract()).toBe(true);
    expect(input.consumeInteract()).toBe(false);
  });

  it('toggles run and crouch', () => {
    const run = root.querySelector('.btn-run') as HTMLButtonElement;
    run.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(input.state.sprint).toBe(true);
    run.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(input.state.sprint).toBe(false);

    const crouch = root.querySelector('.btn-crouch') as HTMLButtonElement;
    crouch.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
    expect(input.state.crouch).toBe(true);
  });

  it('ignores input while suspended', () => {
    input.setSuspended(true);
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 400, 1));
    window.dispatchEvent(pointerEvent('pointermove', 100, 300, 1));
    expect(input.update().moveZ).toBe(0);
  });

  it('normalises diagonal input', () => {
    canvas.dispatchEvent(pointerEvent('pointerdown', 100, 400, 1));
    window.dispatchEvent(pointerEvent('pointermove', 160, 460, 1));
    const state = input.update();
    expect(Math.hypot(state.moveX, state.moveZ)).toBeLessThanOrEqual(1.0001);
  });
});
