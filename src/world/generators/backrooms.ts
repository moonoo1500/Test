/**
 * Backrooms — endless grid of damp carpeted rooms.
 *
 * The world is organised in a global grid of 12x12 m cells. Every cell owns
 * the wall on its +X and +Z edge, so neighbouring chunks never duplicate
 * geometry and the layout stays consistent across chunk borders.
 */

import { randRange, chance, pick } from '../../core/rng';
import type { ChunkBuilder } from '../builder';
import { cellRng } from './shared';

const CELL = 12;
const WALL_H = 2.9;
const WALL_T = 0.18;
const DOOR_W = 1.45;

export function generateBackrooms(b: ChunkBuilder, seed: string): void {
  const i0 = b.cx * 2;
  const j0 = b.cz * 2;

  for (let i = i0; i < i0 + 2; i++) {
    for (let j = j0; j < j0 + 2; j++) {
      const x0 = i * CELL;
      const z0 = j * CELL;
      const rng = cellRng(seed, 'backrooms', i, j);

      const isRed = chance(rng, 0.1);
      const isDark = chance(rng, 0.07);
      const wallMat = isRed ? 'wallpaperRed' : 'wallpaper';

      // floor + ceiling
      b.addBox('carpet', x0 + CELL / 2, -0.06, z0 + CELL / 2, CELL, 0.12, CELL, {
        solid: true,
        colliderTag: 'floor',
        uvScale: 3,
      });
      b.addBox('ceilingTile', x0 + CELL / 2, WALL_H + 0.06, z0 + CELL / 2, CELL, 0.12, CELL, {
        uvScale: 2,
        tint: isDark ? 0x8a8a8a : 0xffffff,
      });

      // doorways (one per +X wall, one per +Z wall)
      const doorZ = z0 + CELL / 2 + randRange(rng, -1.6, 1.6);
      const doorX = x0 + CELL / 2 + randRange(rng, -1.6, 1.6);

      // wall on the +X edge (runs along Z)
      addWallWithGap(b, 'x', x0 + CELL, z0, doorZ, CELL, wallMat, isDark);
      // wall on the +Z edge (runs along X)
      addWallWithGap(b, 'z', z0 + CELL, x0, doorX, CELL, wallMat, isDark);

      // light fixtures
      const lampCount = isDark ? 0 : rng() < 0.75 ? 2 : 1;
      for (let l = 0; l < lampCount; l++) {
        const lx = x0 + (l === 0 ? 3.2 : 8.8);
        const lz = z0 + (l === 0 ? 3.2 : 8.8);
        b.addProp('ceilingLamp', lx, WALL_H - 0.05, lz, { yaw: rng() < 0.5 ? 0 : Math.PI / 2 });
        b.addLight({
          kind: chance(rng, 0.22) ? 'flicker' : 'point',
          x: lx,
          y: WALL_H - 0.25,
          z: lz,
          color: 0xffe9b0,
          intensity: 1.5,
          distance: 11,
          flicker: 0.6,
        });
      }
      if (isDark) {
        b.addLight({ kind: 'point', x: x0 + CELL / 2, y: 1.4, z: z0 + CELL / 2, color: 0x3040a0, intensity: 0.35, distance: 7 });
      }

      // carpet stains
      if (chance(rng, 0.55)) {
        const sx = x0 + randRange(rng, 1.5, CELL - 1.5);
        const sz = z0 + randRange(rng, 1.5, CELL - 1.5);
        b.addBox('carpetStain', sx, 0.004, sz, randRange(rng, 1.4, 3.6), 0.01, randRange(rng, 1.4, 3.6), {
          uvScale: 2.4,
        });
      }

      // clutter
      const clutter = Math.floor(randRange(rng, 0, 4.2));
      for (let c = 0; c < clutter; c++) {
        const type = pick(rng, ['cardboardBox', 'chair', 'trashBin', 'barrel', 'crate', 'can', 'suitcase'] as const);
        const px = x0 + randRange(rng, 1.2, CELL - 1.2);
        const pz = z0 + randRange(rng, 1.2, CELL - 1.2);
        if (Math.abs(px - (x0 + CELL / 2)) < 1.4 && Math.abs(pz - (z0 + CELL / 2)) < 1.4) continue;
        const yaw = randRange(rng, 0, Math.PI * 2);
        if (type === 'can') {
          b.addDynamic('can', px, 0.08, pz, yaw);
        } else if (type === 'barrel' || type === 'crate' || type === 'cardboardBox' || type === 'suitcase') {
          b.addDynamic(type, px, 0.3, pz, yaw);
        } else {
          b.addProp(type, px, 0, pz, { yaw, solid: true });
        }
      }

      // the classic lone chair in an empty room
      if (chance(rng, 0.06)) {
        b.addProp('chair', x0 + CELL / 2, 0, z0 + CELL / 2, { yaw: Math.floor(rng() * 4) * (Math.PI / 2) });
      }

      // artifacts (objective items)
      if (chance(rng, 0.18)) {
        const ax = x0 + randRange(rng, 2, CELL - 2);
        const az = z0 + randRange(rng, 2, CELL - 2);
        b.addArtifact(ax, 0.85, az);
      }

      // room marker sign above the doorway
      if (chance(rng, 0.5)) {
        b.addProp('sign', x0 + CELL + 0.16, 2.35, doorZ, { yaw: Math.PI / 2 });
      }

      b.addSpawn(x0 + CELL / 2, 0.1, z0 + CELL / 2);
    }
  }
}

/**
 * Adds a wall running along one axis with a gap for a doorway.
 * `axis` is the wall normal axis ('x' = wall runs along Z).
 */
function addWallWithGap(
  b: ChunkBuilder,
  axis: 'x' | 'z',
  fixed: number,
  start: number,
  gapCenter: number,
  span: number,
  mat: 'wallpaper' | 'wallpaperRed',
  isDark: boolean,
): void {
  const gapMin = gapCenter - DOOR_W / 2;
  const gapMax = gapCenter + DOOR_W / 2;
  const tint = isDark ? 0x707070 : undefined;
  const segs: Array<[number, number]> = [];
  if (gapMin > start + 0.05) segs.push([start, gapMin]);
  if (gapMax < start + span - 0.05) segs.push([gapMax, start + span]);

  for (const [s0, s1] of segs) {
    const len = s1 - s0;
    if (len < 0.1) continue;
    const mid = (s0 + s1) / 2;
    if (axis === 'x') {
      b.addBox(mat, fixed, WALL_H / 2, mid, WALL_T, WALL_H, len, {
        solid: true,
        colliderTag: 'wall',
        uvScale: 2,
        tint,
      });
    } else {
      b.addBox(mat, mid, WALL_H / 2, fixed, len, WALL_H, WALL_T, {
        solid: true,
        colliderTag: 'wall',
        uvScale: 2,
        tint,
      });
    }
  }

  // door frame + interactive door leaf
  if (axis === 'x') {
    b.addInteractable('door', fixed, 0, gapCenter, Math.PI / 2, {
      width: DOOR_W,
      height: 2.1,
      axis: 'x',
      swing: 1,
    });
  } else {
    b.addInteractable('door', gapCenter, 0, fixed, 0, {
      width: DOOR_W,
      height: 2.1,
      axis: 'z',
      swing: 1,
    });
  }
}
