import { describe, expect, it } from 'vitest';
import {
  createRng,
  deriveSeed,
  hashString,
  mulberry32,
  normalizeSeed,
  pick,
  pickWeighted,
  randInt,
  randRange,
  shuffle,
  spatialHash,
} from '../src/core/rng';

describe('step 1 · seeded RNG', () => {
  it('produces the same stream for the same seed', () => {
    const a = createRng('dreamcore', 'x');
    const b = createRng('dreamcore', 'x');
    const seqA = Array.from({ length: 32 }, () => a());
    const seqB = Array.from({ length: 32 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = createRng('dreamcore', 'x');
    const b = createRng('dreamcore', 'y');
    expect(a()).not.toBe(b());
  });

  it('stays inside [0,1) for a long run', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 100000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('has a roughly uniform distribution', () => {
    const rng = createRng('uniform');
    const buckets = new Array(10).fill(0);
    const n = 100000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng() * 10)]++;
    for (const count of buckets) {
      expect(count / n).toBeGreaterThan(0.08);
      expect(count / n).toBeLessThan(0.12);
    }
  });

  it('hashes strings stably', () => {
    expect(hashString('liminal')).toBe(hashString('liminal'));
    expect(hashString('liminal')).not.toBe(hashString('liminal '));
  });

  it('hashes spatial coordinates independently of iteration order', () => {
    expect(spatialHash(7, 3, 4)).toBe(spatialHash(7, 3, 4));
    expect(spatialHash(7, 3, 4)).not.toBe(spatialHash(7, 4, 3));
  });

  it('normalises user seeds', () => {
    expect(normalizeSeed('  Dream Core!! ')).toBe('dream-core');
    expect(normalizeSeed('')).not.toBe('');
    expect(normalizeSeed('a'.repeat(80)).length).toBeLessThanOrEqual(32);
  });

  it('derives stable child seeds', () => {
    expect(deriveSeed('abc', 1)).toBe(deriveSeed('abc', 1));
    expect(deriveSeed('abc', 1)).not.toBe(deriveSeed('abc', 2));
  });

  it('helpers stay inside their bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 1000; i++) {
      const r = randRange(rng, 3, 7);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThan(7);
      const n = randInt(rng, 2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
    const arr = [1, 2, 3, 4];
    expect(shuffle(rng, [...arr]).sort()).toEqual(arr);
    expect(pick(rng, arr)).toBeGreaterThanOrEqual(1);
    expect(pickWeighted(rng, arr, [0, 0, 0, 1])).toBe(4);
  });
});
