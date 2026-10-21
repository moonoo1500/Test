/**
 * Underground parking — concrete, columns, abandoned cars and failing lamps.
 */

import { chance, randRange } from '../../core/rng';
import type { ChunkBuilder } from '../builder';
import { cellRng } from './shared';

const CEIL = 3.1;

export function generateParking(b: ChunkBuilder, seed: string): void {
  const ox = b.originX;
  const oz = b.originZ;

  b.addBox('asphalt', ox + b.size / 2, -0.06, oz + b.size / 2, b.size, 0.12, b.size, {
    solid: true,
    colliderTag: 'floor',
    uvScale: 6,
  });
  b.addBox('concrete', ox + b.size / 2, CEIL + 0.15, oz + b.size / 2, b.size, 0.3, b.size, { uvScale: 5 });

  // pipes along the ceiling
  b.addBox('metal', ox + b.size / 2, CEIL - 0.25, oz + b.size * 0.25, b.size, 0.22, 0.22, { uvScale: 2 });
  b.addBox('metalDark', ox + b.size * 0.7, CEIL - 0.25, oz + b.size / 2, 0.22, 0.22, b.size, { uvScale: 2 });

  // columns on an 8 m grid
  for (let cx0 = 0; cx0 < b.size; cx0 += 8) {
    for (let cz0 = 0; cz0 < b.size; cz0 += 8) {
      b.addProp('pillar', ox + cx0 + 1.5, 0, oz + cz0 + 1.5, {});
    }
  }

  // parking lanes with cars
  const rng = cellRng(seed, 'parking', b.cx, b.cz);
  for (let lane = 0; lane < 3; lane++) {
    const lz = oz + 4 + lane * 8;
    for (let slot = 0; slot < 4; slot++) {
      const lx = ox + 2.5 + slot * 6;
      // painted lines
      b.addBox('tileWhite', lx - 2.4, 0.012, lz, 0.12, 0.02, 5.0, { uvScale: 1 });
      b.addBox('tileWhite', lx + 2.4, 0.012, lz, 0.12, 0.02, 5.0, { uvScale: 1 });
      if (chance(rng, 0.55)) {
        const type = chance(rng, 0.15) ? 'trashBin' : 'car';
        b.addProp(type, lx, 0, lz, { yaw: Math.PI / 2 + randRange(rng, -0.06, 0.06) });
      }
    }
  }

  // ceiling lamps, some of them failing
  for (let lx = 0; lx < b.size; lx += 8) {
    for (let lz = 0; lz < b.size; lz += 8) {
      const r = cellRng(seed, 'parking-light', b.cx * 8 + lx, b.cz * 8 + lz);
      const px = ox + lx + 4;
      const pz = oz + lz + 4;
      b.addProp('ceilingLamp', px, CEIL - 0.12, pz, {});
      const broken = chance(r, 0.28);
      b.addLight({
        kind: broken ? 'flicker' : 'point',
        x: px,
        y: CEIL - 0.4,
        z: pz,
        color: 0xfff0d0,
        intensity: broken ? 0.8 : 1.35,
        distance: 10,
        flicker: 0.8,
      });
    }
  }

  // exit signs and scattered debris
  if (chance(rng, 0.6)) {
    b.addProp('sign', ox + randRange(rng, 3, b.size - 3), 2.4, oz + randRange(rng, 3, b.size - 3), {
      yaw: randRange(rng, 0, Math.PI * 2),
    });
  }
  for (let d = 0; d < Math.floor(randRange(rng, 0, 3)); d++) {
    b.addDynamic('can', ox + randRange(rng, 2, b.size - 2), 0.1, oz + randRange(rng, 2, b.size - 2), 0);
  }
  if (chance(rng, 0.5)) {
    b.addProp('trafficCone', ox + randRange(rng, 3, b.size - 3), 0, oz + randRange(rng, 3, b.size - 3), {
      yaw: 0,
      scale: 0.9,
    });
  }

  if (chance(rng, 0.5)) {
    b.addArtifact(ox + randRange(rng, 3, b.size - 3), 0.8, oz + randRange(rng, 3, b.size - 3));
  }

  b.addSpawn(ox + b.size / 2, 0.2, oz + b.size / 2);
}
