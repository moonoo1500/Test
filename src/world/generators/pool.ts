/**
 * Drained swimming pool complex.
 *
 * A global 12x12 m cell grid decides where the basins are, so the layout is
 * consistent no matter which chunk is loaded first.
 */

import { chance, randRange } from '../../core/rng';
import type { ChunkBuilder } from '../builder';
import { cellRng } from './shared';

const CELL = 12;
const CEIL = 4.6;

export function generatePool(b: ChunkBuilder, seed: string): void {
  const i0 = b.cx * 2;
  const j0 = b.cz * 2;

  for (let i = i0; i < i0 + 2; i++) {
    for (let j = j0; j < j0 + 2; j++) {
      const x0 = i * CELL;
      const z0 = j * CELL;
      const rng = cellRng(seed, 'pool', i, j);
      const hasPool = (i + j * 2) % 4 === 0;

      // ceiling
      b.addBox('plaster', x0 + CELL / 2, CEIL + 0.15, z0 + CELL / 2, CELL, 0.3, CELL, { uvScale: 4 });

      // columns in the corners of every cell
      b.addProp('pillar', x0 + 0.6, 0, z0 + 0.6, {});
      b.addProp('pillar', x0 + CELL - 0.6, 0, z0 + CELL - 0.6, {});

      // high windows (emissive) on the +X wall
      b.addBox('emissiveCold', x0 + CELL - 0.08, 3.1, z0 + CELL / 2, 0.06, 1.4, 3.2, {
        emissive: 0.7,
        uvScale: 1,
      });
      b.addLight({
        kind: 'point',
        x: x0 + CELL - 1.2,
        y: 3.0,
        z: z0 + CELL / 2,
        color: 0xbfe8ff,
        intensity: 1.25,
        distance: 12,
      });

      if (hasPool) {
        addBasin(b, x0, z0, rng);
      } else {
        b.addBox('tileWhite', x0 + CELL / 2, -0.06, z0 + CELL / 2, CELL, 0.12, CELL, {
          solid: true,
          colliderTag: 'floor',
          uvScale: 2.4,
        });
      }

      // poolside furniture
      const clutter = Math.floor(randRange(rng, 0, 3));
      for (let c = 0; c < clutter; c++) {
        const px = x0 + randRange(rng, 1.2, CELL - 1.2);
        const pz = z0 + randRange(rng, 1.2, CELL - 1.2);
        if (hasPool && Math.abs(px - (x0 + CELL / 2)) < 5 && Math.abs(pz - (z0 + CELL / 2)) < 3.2) continue;
        b.addProp('bench', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2) });
      }
      if (chance(rng, 0.3)) {
        b.addProp('divingBoard', x0 + CELL / 2, 1.1, z0 + CELL - 2.4, { yaw: 0 });
        b.addProp('ladder', x0 + CELL / 2, 0, z0 + CELL - 3.2, { yaw: 0 });
      }

      if (chance(rng, 0.4)) {
        b.addArtifact(x0 + randRange(rng, 2, CELL - 2), 0.9, z0 + randRange(rng, 2, CELL - 2));
      }

      b.addSpawn(x0 + CELL / 2, 0.2, z0 + CELL / 2);
    }
  }
}

/** Builds a 8x5 m basin with tiled walls, a deep end and access stairs. */
function addBasin(b: ChunkBuilder, x0: number, z0: number, rng: () => number): void {
  const bw = 8;
  const bd = 5;
  const depth = 1.8;
  const cx = x0 + CELL / 2;
  const cz = z0 + CELL / 2;

  // floor strips around the basin
  const sideW = (CELL - bw) / 2;
  b.addBox('tileWhite', x0 + sideW / 2, -0.06, cz, sideW, 0.12, CELL, { solid: true, colliderTag: 'floor', uvScale: 2.4 });
  b.addBox('tileWhite', x0 + CELL - sideW / 2, -0.06, cz, sideW, 0.12, CELL, { solid: true, colliderTag: 'floor', uvScale: 2.4 });
  b.addBox('tileWhite', cx, -0.06, z0 + (CELL - bd) / 4, bw, 0.12, (CELL - bd) / 2, {
    solid: true,
    colliderTag: 'floor',
    uvScale: 2.4,
  });
  b.addBox('tileWhite', cx, -0.06, z0 + CELL - (CELL - bd) / 4, bw, 0.12, (CELL - bd) / 2, {
    solid: true,
    colliderTag: 'floor',
    uvScale: 2.4,
  });

  // basin bottom
  b.addBox('tileBlue', cx, -depth - 0.08, cz, bw, 0.16, bd, { solid: true, colliderTag: 'floor', uvScale: 2 });

  // basin walls (thin, so the player can jump in)
  const wallT = 0.12;
  b.addBox('tileBlue', cx, -depth / 2, cz - bd / 2, bw, depth, wallT, { solid: true, colliderTag: 'wall', uvScale: 1.6 });
  b.addBox('tileBlue', cx, -depth / 2, cz + bd / 2, bw, depth, wallT, { solid: true, colliderTag: 'wall', uvScale: 1.6 });
  b.addBox('tileBlue', cx - bw / 2, -depth / 2, cz, wallT, depth, bd, { solid: true, colliderTag: 'wall', uvScale: 1.6 });
  b.addBox('tileBlue', cx + bw / 2, -depth / 2, cz, wallT, depth, bd, { solid: true, colliderTag: 'wall', uvScale: 1.6 });

  // residual water
  b.addBox('water', cx, -depth + 0.55, cz, bw - wallT * 2.4, 0.04, bd - wallT * 2.4, {
    uvScale: 3,
    tint: 0x9fd8ff,
  });

  // access stairs on the north side
  for (let s = 0; s < 4; s++) {
    const h = (s + 1) * (depth / 4);
    b.addBox('tileWhite', cx - 2.2 + s * 0.8, -depth + h / 2, cz - bd / 2 + 0.4, 0.8, h, 0.8, {
      solid: true,
      colliderTag: 'floor',
      uvScale: 1.2,
    });
  }

  b.addProp('ladder', cx - 2.6, 0, cz - bd / 2 + 0.5, { yaw: 0 });
  if (chance(rng, 0.4)) {
    b.addProp('plant', cx + 3.4, 0, cz + bd / 2 + 0.9, {});
  }
}
