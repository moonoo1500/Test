/**
 * Deterministic pseudo random number generation.
 *
 * Every world in the game is fully reproducible from a single string seed, so
 * the generator must never depend on `Math.random`, iteration order of a Map or
 * floating point accumulation order. We therefore use a small, well tested
 * 32 bit PRNG (mulberry32) combined with a string hash (xmur3) and a stateless
 * spatial hash for chunk generation.
 */

export type Rng = () => number;

/** xmur3 string hash -> 32 bit seed. */
export function hashString(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Combine two 32 bit integers into one (order sensitive). */
export function hash2(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return h >>> 0;
}

/** Combine three 32 bit integers into one. */
export function hash3(a: number, b: number, c: number): number {
  return hash2(hash2(a, b), c);
}

/** mulberry32 — fast, deterministic, good enough distribution for level gen. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Creates a named RNG. Same name + same salt always yields the same stream. */
export function createRng(seed: string, salt = ''): Rng {
  return mulberry32(hashString(`${seed}|${salt}`));
}

/** Stateless spatial hash for chunk coordinates. */
export function spatialHash(seed: number, x: number, y: number): number {
  return hash3(seed, Math.floor(x) | 0, Math.floor(y) | 0);
}

/** Random float in [min, max). */
export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Random integer in [min, max] inclusive. */
export function randInt(rng: Rng, min: number, max: number): number {
  if (max < min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

/** Random element of an array (undefined for empty arrays). */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))];
}

/** Weighted pick. `weights` must have the same length as `arr`. */
export function pickWeighted<T>(rng: Rng, arr: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return arr[0];
  let roll = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/** Random chance test. */
export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

/** Fisher-Yates shuffle (in place, deterministic). */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Human friendly seed generator: short, typeable, URL-safe.
 * Uses a slightly pronounceable alphabet so players can share seeds.
 */
const SEED_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function randomSeed(length = 6): string {
  const bytes = new Uint32Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 0xffffffff);
  }
  let out = '';
  for (let i = 0; i < length; i++) out += SEED_ALPHABET[bytes[i] % SEED_ALPHABET.length];
  return out;
}

/** Normalises user input into a canonical seed string. */
export function normalizeSeed(input: string): string {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 32) : randomSeed();
}

/** Deterministic child seed of a parent seed (used for world -> world transitions). */
export function deriveSeed(parent: string, index: number): string {
  const h = hash2(hashString(parent), index | 0);
  return h.toString(36).slice(0, 8);
}
