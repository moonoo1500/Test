import { createRng } from '../../core/rng';
import type { Rng } from '../../core/rng';

/** Deterministic RNG for a logical grid cell of the world. */
export function cellRng(seed: string, salt: string, i: number, j: number): Rng {
  return createRng(`${seed}::${salt}::${i}::${j}`);
}

/** Deterministic RNG for a chunk. */
export function chunkRng(seed: string, salt: string, cx: number, cz: number): Rng {
  return createRng(`${seed}::${salt}::chunk::${cx}::${cz}`);
}

/** Keeps a small radius around a point free of props. */
export function tooClose(x: number, z: number, px: number, pz: number, radius: number): boolean {
  const dx = x - px;
  const dz = z - pz;
  return dx * dx + dz * dz < radius * radius;
}
