/**
 * Dead Mall — a grid of shop blocks separated by wide corridors.
 * Each 12x12 m cell holds one store; corridors run along the global grid lines.
 */

import { chance, randRange } from '../../core/rng';
import type { ChunkBuilder } from '../builder';
import { cellRng } from './shared';

const CELL = 12;
const CEIL = 5.4;
const SHOP = 6.4;

export function generateMall(b: ChunkBuilder, seed: string): void {
  const i0 = b.cx * 2;
  const j0 = b.cz * 2;

  for (let i = i0; i < i0 + 2; i++) {
    for (let j = j0; j < j0 + 2; j++) {
      const x0 = i * CELL;
      const z0 = j * CELL;
      const rng = cellRng(seed, 'mall', i, j);
      const cx = x0 + CELL / 2;
      const cz = z0 + CELL / 2;

      // floor + ceiling
      b.addBox('tileWhite', cx, -0.06, cz, CELL, 0.12, CELL, {
        solid: true,
        colliderTag: 'floor',
        uvScale: 3,
      });
      b.addBox('plaster', cx, CEIL + 0.2, cz, CELL, 0.4, CELL, { uvScale: 5 });

      // skylight above every second cell
      if ((i + j) % 2 === 0) {
        b.addBox('emissiveCold', cx, CEIL - 0.02, cz, 5.5, 0.08, 5.5, { emissive: 0.85, uvScale: 2 });
        b.addLight({ kind: 'point', x: cx, y: CEIL - 0.6, z: cz, color: 0xdfe8ff, intensity: 1.6, distance: 16 });
      } else {
        b.addLight({ kind: 'point', x: cx, y: CEIL - 0.7, z: cz, color: 0xffd9b0, intensity: 0.9, distance: 13 });
      }

      // shop block
      const open = chance(rng, 0.25);
      if (open) {
        // an empty shop floor: only a rug and a light
        b.addBox('carpet', cx, 0.005, cz, SHOP, 0.02, SHOP, { uvScale: 4 });
        b.addProp('counter', cx, 0, cz - SHOP / 2 + 0.6, { yaw: 0 });
      } else {
        b.addBox('plaster', cx, 1.7, cz, SHOP, 3.4, SHOP, { solid: true, colliderTag: 'wall', uvScale: 3 });
        // glass storefronts on the two corridor facing sides
        b.addBox('glass', cx, 1.7, cz - SHOP / 2 - 0.03, SHOP - 0.6, 2.4, 0.06, { emissive: 0.35, uvScale: 2 });
        b.addBox('glass', cx, 1.7, cz + SHOP / 2 + 0.03, SHOP - 0.6, 2.4, 0.06, { emissive: 0.35, uvScale: 2 });
        b.addBox('glass', cx - SHOP / 2 - 0.03, 1.7, cz, 0.06, 2.4, SHOP - 0.6, { emissive: 0.35, uvScale: 2 });
        b.addBox('glass', cx + SHOP / 2 + 0.03, 1.7, cz, 0.06, 2.4, SHOP - 0.6, { emissive: 0.35, uvScale: 2 });
        b.addProp('sign', cx, 3.6, cz - SHOP / 2 - 0.1, { yaw: 0 });
        if (chance(rng, 0.4)) b.addProp('sign', cx + SHOP / 2 + 0.1, 3.6, cz, { yaw: Math.PI / 2 });
      }

      // corridor furniture
      const decor = Math.floor(randRange(rng, 0, 3));
      for (let d = 0; d < decor; d++) {
        const alongX = chance(rng, 0.5);
        const px = alongX ? x0 + randRange(rng, 1, CELL - 1) : x0 + randRange(rng, 0.2, 1.2);
        const pz = alongX ? z0 + randRange(rng, 0.2, 1.2) : z0 + randRange(rng, 1, CELL - 1);
        const type = chance(rng, 0.4) ? 'planter' : chance(rng, 0.5) ? 'bench' : 'vending';
        b.addProp(type, px, 0, pz, { yaw: alongX ? 0 : Math.PI / 2 });
      }

      if ((i * 3 + j * 5) % 11 === 0) {
        b.addProp('fountain', cx, 0, cz, { yaw: 0 });
        b.addLight({ kind: 'point', x: cx, y: 1.2, z: cz, color: 0x9fe0ff, intensity: 0.8, distance: 10 });
      }
      if (chance(rng, 0.2)) {
        b.addProp('escalator', cx + 4.5, 0, cz + 4.5, { yaw: Math.PI / 2 });
      }
      if (chance(rng, 0.35)) {
        b.addProp('arcade', x0 + 10.2, 0, z0 + 2.4, { yaw: -Math.PI / 2 });
        b.addProp('arcade', x0 + 10.2, 0, z0 + 3.6, { yaw: -Math.PI / 2 });
      }

      if (chance(rng, 0.4)) {
        b.addArtifact(x0 + randRange(rng, 9.8, CELL), 0.9, z0 + randRange(rng, 1, CELL));
      }

      b.addSpawn(x0 + 2.2, 0.2, z0 + 2.2);
    }
  }
}
