/**
 * @vitest-environment jsdom
 *
 * Step 10b — procedural textures and materials.
 *
 * A minimal fake 2D context is installed so that the texture painters run
 * exactly as they would in a browser. Any missing canvas API would throw
 * here instead of breaking the game on the device.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MaterialLibrary } from '../src/render/materials';
import { createBoxGeometry, createPropGeometry, ensureColorAttribute } from '../src/render/geometry';
import { PROPS } from '../src/world/props';
import { WORLD_TYPES, type MatKey } from '../src/world/types';
import { generateChunk } from '../src/world/generate';

class FakeGradient {
  addColorStop(): void {
    /* no-op */
  }
}

function createFakeContext(): CanvasRenderingContext2D {
  const ctx = {
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '10px sans-serif',
    fillRect: () => undefined,
    strokeRect: () => undefined,
    clearRect: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    bezierCurveTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    createRadialGradient: () => new FakeGradient(),
    createLinearGradient: () => new FakeGradient(),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
      colorSpace: 'srgb' as const,
    }),
    putImageData: () => undefined,
    fillText: () => undefined,
    measureText: () => ({ width: 0 }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

beforeAll(() => {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: function getContext(this: HTMLCanvasElement, kind: string) {
      if (kind === '2d') return createFakeContext();
      return null;
    },
  });
});

describe('step 10b · procedural textures', () => {
  it('creates every material without throwing', () => {
    const lib = new MaterialLibrary();
    const keys = [
      'carpet',
      'carpetStain',
      'wallpaper',
      'wallpaperRed',
      'wallpaperBlue',
      'ceilingTile',
      'plaster',
      'concrete',
      'asphalt',
      'tileWhite',
      'tileBlue',
      'tileGreen',
      'wood',
      'woodDark',
      'grass',
      'dirt',
      'metal',
      'metalDark',
      'glass',
      'fabric',
      'water',
      'emissiveWarm',
      'emissiveCold',
      'emissiveGreen',
      'emissiveRed',
    ] as const;
    for (const key of keys) {
      const mat = lib.get(key);
      expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(mat.vertexColors).toBe(true);
    }
    lib.dispose();
  });

  it('tiles the textures and keeps them colourful', () => {
    const lib = new MaterialLibrary();
    const tex = lib.texture('carpet');
    expect(tex).toBeDefined();
    expect(tex!.wrapS).toBe(THREE.RepeatWrapping);
    expect(tex!.wrapT).toBe(THREE.RepeatWrapping);
    expect(tex!.colorSpace).toBe(THREE.SRGBColorSpace);
    lib.dispose();
  });

  it('reuses materials instead of creating new ones', () => {
    const lib = new MaterialLibrary();
    expect(lib.get('wood')).toBe(lib.get('wood'));
    lib.dispose();
  });

  it('knows every material used by the generators', () => {
    const lib = new MaterialLibrary();
    const used = new Set<string>();
    for (const type of WORLD_TYPES) {
      for (const seed of ['a', 'b', 'c']) {
        const chunk = generateChunk(type, seed, 0, 0);
        for (const box of chunk.boxes) used.add(box.mat);
      }
    }
    expect(used.size).toBeGreaterThan(10);
    for (const key of used) {
      expect(() => lib.get(key as MatKey)).not.toThrow();
    }
    lib.dispose();
  });
});

describe('step 10c · geometry', () => {
  it('builds boxes with world space uvs', () => {
    const geo = createBoxGeometry(4, 2, 6, 2);
    expect(geo.getAttribute('position').count).toBe(36);
    const uv = geo.getAttribute('uv');
    const maxU = Math.max(...Array.from(uv.array as Float32Array));
    expect(maxU).toBeCloseTo(3, 3); // 6 m of depth / 2 m per tile
    expect(geo.getAttribute('normal').count).toBe(36);
    expect(geo.getAttribute('color').count).toBe(36);
  });

  it('builds a prop geometry for every catalogue entry', () => {
    for (const def of Object.values(PROPS)) {
      const geo = createPropGeometry(def);
      expect(geo.getAttribute('position').count).toBeGreaterThan(0);
      expect(geo.getAttribute('color')).toBeDefined();
      expect(geo.index).toBeNull(); // non indexed so that geometries can be merged
    }
  });

  it('adds a colour attribute to geometries that lack one', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    ensureColorAttribute(geo);
    expect(geo.getAttribute('color')).toBeDefined();
  });
});
