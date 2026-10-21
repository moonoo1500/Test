/**
 * Pine forest — dense trees, mist, a path and the occasional cabin.
 * The tree layout uses a jittered grid so that neighbouring chunks never
 * overlap while still looking organic.
 */

import { chance, randRange } from '../../core/rng';
import type { ChunkBuilder } from '../builder';
import { cellRng } from './shared';

const SUB = 4;

export function generateForest(b: ChunkBuilder, seed: string): void {
  const ox = b.originX;
  const oz = b.originZ;

  b.addBox('grass', ox + b.size / 2, -0.08, oz + b.size / 2, b.size, 0.16, b.size, {
    solid: true,
    colliderTag: 'floor',
    uvScale: 6,
  });

  // dirt path along the +X edge of the chunk
  b.addBox('dirt', ox + 1.2, 0.006, oz + b.size / 2, 2.4, 0.02, b.size, { uvScale: 3.5 });

  const treeGrid = b.size / SUB;
  for (let sx = 0; sx < treeGrid; sx++) {
    for (let sz = 0; sz < treeGrid; sz++) {
      const gi = b.cx * treeGrid + sx;
      const gj = b.cz * treeGrid + sz;
      const rng = cellRng(seed, 'forest', gi, gj);
      const px = ox + sx * SUB + randRange(rng, 0.8, SUB - 0.8);
      const pz = oz + sz * SUB + randRange(rng, 0.8, SUB - 0.8);
      const nearPath = px - ox < 3.2;
      const nearSpawn = Math.abs(px - (ox + b.size / 2)) < 2.5 && Math.abs(pz - (oz + b.size / 2)) < 2.5;
      if (nearSpawn) continue;

      const roll = rng();
      if (roll < 0.52 && !nearPath) {
        const s = randRange(rng, 0.85, 1.5);
        b.addProp('treePine', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: s });
        if (chance(rng, 0.22)) {
          b.addProp('treePine', px + randRange(rng, -1.6, 1.6), 0, pz + randRange(rng, -1.6, 1.6), {
            yaw: randRange(rng, 0, Math.PI * 2),
            scale: randRange(rng, 0.6, 1.0),
          });
        }
      } else if (roll < 0.72) {
        b.addProp('bush', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.7, 1.4) });
      } else if (roll < 0.84) {
        b.addProp('rock', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.5, 1.3) });
      } else if (roll < 0.9) {
        b.addProp('mushroom', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.6, 1.5) });
      } else if (roll < 0.93) {
        b.addProp('bones', px, 0.05, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.8, 1.6) });
      }
    }
  }

  // cabin clearing
  const rng = cellRng(seed, 'forest-cabin', b.cx, b.cz);
  if (chance(rng, 0.16)) {
    const px = ox + randRange(rng, 8, b.size - 8);
    const pz = oz + randRange(rng, 8, b.size - 8);
    b.addProp('cabin', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2) });
    b.addLight({ kind: 'point', x: px, y: 2.2, z: pz, color: 0xffc27a, intensity: 1.2, distance: 12 });
    for (let f = 0; f < 8; f++) {
      const a = (f / 8) * Math.PI * 2;
      b.addProp('lampPost', px + Math.cos(a) * 5, 0, pz + Math.sin(a) * 5, { yaw: 0, scale: 0.22 });
    }
  }

  // fallen log
  if (chance(rng, 0.4)) {
    b.addProp('pallet', ox + randRange(rng, 4, b.size - 4), 0.1, oz + randRange(rng, 4, b.size - 4), {
      yaw: randRange(rng, 0, Math.PI * 2),
      scale: 1.6,
    });
  }

  if (chance(rng, 0.6)) {
    b.addArtifact(ox + randRange(rng, 3, b.size - 3), 0.7, oz + randRange(rng, 3, b.size - 3));
  }

  b.addSpawn(ox + b.size / 2, 0.2, oz + b.size / 2);
}
