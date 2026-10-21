/**
 * Step 10 — packaging and entry point.
 *
 * Protects against the classic "works on my machine" failures: a missing DOM
 * id, a broken script tag or a missing npm script.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

describe('step 10 · packaging', () => {
  it('ships an index.html with the required elements', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf8');
    expect(html).toContain('id="game"');
    expect(html).toContain('id="ui"');
    expect(html).toContain('/src/main.ts');
    expect(html).toContain('viewport');
    expect(html).toContain('user-scalable=no');
  });

  it('ships the entry point and the styles', () => {
    expect(existsSync(resolve(root, 'src/main.ts'))).toBe(true);
    expect(existsSync(resolve(root, 'src/style.css'))).toBe(true);
    expect(existsSync(resolve(root, 'src/game.ts'))).toBe(true);
  });

  it('defines the npm scripts used by the project', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    for (const script of ['dev', 'build', 'preview', 'test', 'typecheck']) {
      expect(pkg.scripts[script]).toBeTruthy();
    }
    expect(pkg.dependencies.three).toBeTruthy();
  });

  it('keeps the source tree free of leftover debug code', () => {
    const game = readFileSync(resolve(root, 'src/game.ts'), 'utf8');
    expect(game).not.toContain('console.log');
    expect(game).not.toContain('debugger');
  });
});
