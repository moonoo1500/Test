/**
 * @vitest-environment node
 *
 * Step 12 — single file distribution.
 *
 * The bundled one-file build is loaded into jsdom exactly like a browser
 * would load it, and the game has to boot from it without any external
 * resource.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { installWebGLStub } from './helpers/webgl';

const root = resolve(__dirname, '..');
const singleFile = resolve(root, 'liminal-drift.html');

function buildSingleFile(): void {
  execFileSync('npm', ['run', 'build:single'], { cwd: root, stdio: 'ignore' });
}

beforeAll(() => {
  if (!existsSync(singleFile)) buildSingleFile();
}, 180000);

describe('step 12 · single file build', () => {
  it('produces one self contained html document', () => {
    expect(existsSync(singleFile)).toBe(true);
    const html = readFileSync(singleFile, 'utf8');
    // no external resources at all
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    expect(html).not.toMatch(/https?:\/\/[^"']+\.(js|css)/i);
    // the code and the styles are inlined
    expect(html.match(/<script/gi)?.length).toBe(1);
    expect(html.match(/<style/gi)?.length).toBe(1);
    expect(statSync(singleFile).size).toBeGreaterThan(100_000);
  });

  it('keeps the canvas and the ui root in the document', () => {
    const html = readFileSync(singleFile, 'utf8');
    expect(html).toContain('id="game"');
    expect(html).toContain('id="ui"');
  });

  it('boots the game from the file', async () => {
    const html = readFileSync(singleFile, 'utf8');
    const errors: string[] = [];

    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        // the stub has to be installed before the game script runs
        installWebGLStub(window as unknown as { HTMLCanvasElement: { prototype: object } });
        (window as unknown as { AudioContext?: unknown }).AudioContext = undefined;
        window.addEventListener('error', (e: ErrorEvent) => errors.push(e.message));
        void window;
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    const doc = dom.window.document;
    expect(errors).toEqual([]);
    // the menu was created by the game
    expect(doc.querySelector('.menu')).not.toBeNull();
    expect(doc.querySelector('#seed-input')).not.toBeNull();
    expect(doc.querySelector('.touch-controls')).not.toBeNull();
    expect(doc.querySelectorAll('.touch-button').length).toBe(4);

    // start a world and let the loop run for a moment
    const seedInput = doc.querySelector('#seed-input') as HTMLInputElement;
    seedInput.value = 'single';
    seedInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    (doc.querySelector('#start-btn') as HTMLButtonElement).click();

    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(errors).toEqual([]);
    expect(doc.querySelector('.menu')?.classList.contains('hidden')).toBe(true);
    expect((doc.querySelector('#world-name') as HTMLElement).textContent).not.toBe('—');

    dom.window.close();
  }, 60000);
});
