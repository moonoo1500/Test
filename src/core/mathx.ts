/** Small math helpers shared across gameplay, physics and rendering. */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function invLerp(a: number, b: number, v: number): number {
  if (a === b) return 0;
  return clamp01((v - a) / (b - a));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = invLerp(edge0, edge1, x);
  return t * t * (3 - 2 * t);
}

/** Framerate independent exponential smoothing. `smoothing` = fraction remaining after 1s. */
export function damp(current: number, target: number, smoothing: number, dt: number): number {
  return lerp(current, target, 1 - Math.pow(smoothing, dt));
}

/** Moves `current` towards `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

/** Shortest signed angular difference (radians) between two angles. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Rotates `from` towards `to` by at most `maxDelta` radians. */
export function angleTowards(from: number, to: number, maxDelta: number): number {
  const d = angleDelta(from, to);
  if (Math.abs(d) <= maxDelta) return to;
  return from + Math.sign(d) * maxDelta;
}

/** Wraps an angle into [-PI, PI]. */
export function wrapAngle(a: number): number {
  let x = (a + Math.PI) % TAU;
  if (x < 0) x += TAU;
  return x - Math.PI;
}

/** Rounds to a fixed precision, useful to keep hashes stable. */
export function roundTo(v: number, decimals = 3): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}

export function isFiniteVec(x: number, y: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z);
}

/** Cheap 2D value noise, deterministic for a given seed, used by texture painters. */
export function valueNoise2D(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number) => {
    let n = Math.imul(a ^ 0x27d4eb2d, 0x165667b1);
    n ^= Math.imul(b ^ 0x9e3779b9, 0x85ebca6b);
    n ^= n >>> 15;
    n = Math.imul(n, 0x2c1b3c6d);
    n ^= n >>> 12;
    return (n >>> 0) / 4294967296;
  };
  const n00 = h(xi + seed, yi);
  const n10 = h(xi + 1 + seed, yi);
  const n01 = h(xi + seed, yi + 1);
  const n11 = h(xi + 1 + seed, yi + 1);
  const nx0 = n00 + (n10 - n00) * u;
  const nx1 = n01 + (n11 - n01) * u;
  return nx0 + (nx1 - nx0) * v;
}

/** Fractal brownian motion over `valueNoise2D`. */
export function fbm2D(
  seed: number,
  x: number,
  y: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(seed + i * 1013, x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}
