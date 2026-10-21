/**
 * The Glade — an endless field with trees, fences and forgotten play sets.
 * Purely outdoor: no ceiling, wide sky, heavy atmosphere.
 */

import { chance, pick, randRange } from '../../core/rng';
import type { ChunkBuilder } from '../builder';
import { cellRng } from './shared';

const SUB = 6;

export function generateGlade(b: ChunkBuilder, seed: string): void {
  const ox = b.originX;
  const oz = b.originZ;

  // ground
  b.addBox('grass', ox + b.size / 2, -0.08, oz + b.size / 2, b.size, 0.16, b.size, {
    solid: true,
    colliderTag: 'floor',
    uvScale: 7,
  });

  // dirt path along the +X and +Z edges of the chunk (global grid lines)
  b.addBox('dirt', ox + 1.4, 0.005, oz + b.size / 2, 2.8, 0.02, b.size, { uvScale: 4 });
  b.addBox('dirt', ox + b.size / 2, 0.006, oz + 1.4, b.size, 0.02, 2.8, { uvScale: 4 });

  // scattered vegetation
  for (let sx = 0; sx < b.size / SUB; sx++) {
    for (let sz = 0; sz < b.size / SUB; sz++) {
      const gi = b.cx * (b.size / SUB) + sx;
      const gj = b.cz * (b.size / SUB) + sz;
      const rng = cellRng(seed, 'glade', gi, gj);
      const px = ox + sx * SUB + randRange(rng, 1.5, SUB - 1.5);
      const pz = oz + sz * SUB + randRange(rng, 1.5, SUB - 1.5);
      // keep the spawn area and the paths clear
      const nearPath = px - ox < 3.4 || pz - oz < 3.4;
      const nearSpawn = Math.abs(px - (ox + b.size / 2)) < 3 && Math.abs(pz - (oz + b.size / 2)) < 3;
      if (nearSpawn) continue;

      const roll = rng();
      if (roll < 0.2 && !nearPath) {
        const type = chance(rng, 0.7) ? 'treePine' : 'treeRound';
        const s = randRange(rng, 0.8, 1.35);
        b.addProp(type, px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: s });
      } else if (roll < 0.42) {
        b.addProp('bush', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.7, 1.3) });
      } else if (roll < 0.5) {
        b.addProp('rock', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.6, 1.5) });
      } else if (roll < 0.55) {
        b.addProp('mushroom', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2), scale: randRange(rng, 0.7, 1.4) });
      }
    }
  }

  // fence posts along the path
  for (let k = 0; k < b.size / 3; k++) {
    const pz = oz + 3.6 + k * 3;
    const px = ox + 3.6 + k * 3;
    if (pz < oz + b.size - 0.5) b.addProp('lampPost', px, 0, oz + 3.0, { yaw: 0, scale: 0.32 });
    if (px < ox + b.size - 0.5) b.addProp('lampPost', ox + 3.0, 0, px, { yaw: 0, scale: 0.32 });
  }

  // lamp posts with real light sources
  const lampRng = cellRng(seed, 'glade-lamp', b.cx, b.cz);
  if (chance(lampRng, 0.8)) {
    const lx = ox + randRange(lampRng, 4, b.size - 4);
    const lz = oz + randRange(lampRng, 4, b.size - 4);
    b.addProp('lampPost', lx, 0, lz, { yaw: 0 });
    b.addLight({ kind: 'point', x: lx, y: 4.0, z: lz, color: 0xffd9a0, intensity: 1.1, distance: 14 });
  }

  // play set / bench clusters
  const rng = cellRng(seed, 'glade-play', b.cx, b.cz);
  if (chance(rng, 0.35)) {
    const px = ox + randRange(rng, 5, b.size - 5);
    const pz = oz + randRange(rng, 5, b.size - 5);
    b.addProp('swing', px, 0, pz, { yaw: randRange(rng, 0, Math.PI * 2) });
    b.addProp('bench', px + 2.4, 0, pz + 1.2, { yaw: randRange(rng, 0, Math.PI * 2) });
  } else if (chance(rng, 0.45)) {
    const px = ox + randRange(rng, 5, b.size - 5);
    const pz = oz + randRange(rng, 5, b.size - 5);
    b.addProp('bench', px, 0, pz, { yaw: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]) });
  }

  // rare hill mound
  if (chance(rng, 0.12)) {
    b.addProp('rock', ox + randRange(rng, 4, b.size - 4), -1.2, oz + randRange(rng, 4, b.size - 4), {
      yaw: randRange(rng, 0, Math.PI * 2),
      scale: 9,
    });
  }

  // floating motes (objective)
  if (chance(rng, 0.55)) {
    const ax = ox + randRange(rng, 3, b.size - 3);
    const az = oz + randRange(rng, 3, b.size - 3);
    b.addArtifact(ax, 1.35, az);
  }

  b.addSpawn(ox + b.size / 2, 0.2, oz + b.size / 2);
}
