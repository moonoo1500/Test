import type { ChunkData, WorldType } from './types';
import { WORLD_TYPES } from './types';
import { ChunkBuilder } from './builder';
import { generateBackrooms } from './generators/backrooms';
import { generateForest } from './generators/forest';
import { generateGlade } from './generators/glade';
import { generateMall } from './generators/mall';
import { generateParking } from './generators/parking';
import { generatePool } from './generators/pool';
import { hash2, hashString } from '../core/rng';

/** Generates the content of a single chunk. Pure function of (type, seed, cx, cz). */
export function generateChunk(type: WorldType, seed: string, cx: number, cz: number): ChunkData {
  const b = new ChunkBuilder(cx, cz);
  switch (type) {
    case 'backrooms':
      generateBackrooms(b, seed);
      break;
    case 'glade':
      generateGlade(b, seed);
      break;
    case 'pool':
      generatePool(b, seed);
      break;
    case 'mall':
      generateMall(b, seed);
      break;
    case 'forest':
      generateForest(b, seed);
      break;
    case 'parking':
      generateParking(b, seed);
      break;
    default:
      generateBackrooms(b, seed);
      break;
  }
  return b.build();
}

/** Picks a world family deterministically from a seed. */
export function worldTypeForSeed(seed: string): WorldType {
  const h = hash2(hashString(seed), 0x5eed);
  return WORLD_TYPES[h % WORLD_TYPES.length];
}

/**
 * Stable hash of a chunk's content — used by the tests to prove that the
 * generator is deterministic.
 */
export function hashChunk(chunk: ChunkData): string {
  let h = hash2(chunk.cx, chunk.cz);
  for (const box of chunk.boxes) {
    h = hash2(h, Math.round((box.x + box.y * 7 + box.z * 13) * 100));
    h = hash2(h, Math.round((box.w + box.h * 3 + box.d * 5) * 100));
    h = hash2(h, box.mat.length + Math.round(box.yaw * 1000));
  }
  for (const p of chunk.props) {
    h = hash2(h, p.type.length);
    h = hash2(h, Math.round((p.x + p.z * 3) * 100));
  }
  for (const i of chunk.interactables) {
    h = hash2(h, i.kind.length);
    h = hash2(h, Math.round((i.x + i.z * 5) * 100));
  }
  return (h >>> 0).toString(16);
}
