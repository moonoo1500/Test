import { describe, expect, it } from 'vitest';
import { generateChunk, hashChunk, worldTypeForSeed } from '../src/world/generate';
import { WORLD_TYPES, type ChunkData, type WorldType } from '../src/world/types';
import { PhysicsWorld } from '../src/physics/world';
import { makeBox } from '../src/physics/collision';
import { circleVsBoxXZ } from '../src/physics/character';
import { propDef } from '../src/world/props';

const SEEDS = ['liminal', 'dreamcore', 'backrooms7', 'zzz', '42'];

/** Mirrors what the chunk manager does when it registers a chunk. */
function buildPhysics(chunk: ChunkData): PhysicsWorld {
  const world = new PhysicsWorld();
  for (const spec of chunk.colliders) {
    world.addCollider(makeBox(spec.x, spec.y, spec.z, spec.w / 2, spec.h / 2, spec.d / 2, spec.yaw), spec.tag);
  }
  for (const prop of chunk.props) {
    const def = propDef(prop.type);
    if (!def.solid || def.dynamic) continue;
    const [w, h, d] = def.size;
    const s = prop.scale;
    world.addCollider(
      makeBox(prop.x, prop.y + (h * s) / 2, prop.z, (w * s) / 2, (h * s) / 2, (d * s) / 2, prop.yaw),
      'prop',
    );
  }
  return world;
}

function isBlocked(world: PhysicsWorld, x: number, y: number, z: number, radius = 0.3): boolean {
  for (const collider of world.colliders) {
    const box = collider.box;
    const top = box.c.y + box.h.y;
    const bottom = box.c.y - box.h.y;
    if (y + 0.1 <= bottom || y - 0.1 >= top) continue;
    if (circleVsBoxXZ(x, z, radius, box)) return true;
  }
  return false;
}

function allFinite(chunk: ChunkData): boolean {
  const nums: number[] = [];
  for (const b of chunk.boxes) nums.push(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw);
  for (const p of chunk.props) nums.push(p.x, p.y, p.z, p.yaw, p.scale);
  for (const l of chunk.lights) nums.push(l.x, l.y, l.z, l.intensity, l.distance);
  for (const i of chunk.interactables) nums.push(i.x, i.y, i.z, i.yaw);
  for (const c of chunk.colliders) nums.push(c.x, c.y, c.z, c.w, c.h, c.d, c.yaw);
  for (const s of chunk.spawns) nums.push(s.x, s.y, s.z);
  return nums.every((n) => Number.isFinite(n));
}

describe('step 5 · world generation', () => {
  it('is deterministic for the same seed', () => {
    for (const type of WORLD_TYPES) {
      const a = generateChunk(type, 'dreamcore', 0, 0);
      const b = generateChunk(type, 'dreamcore', 0, 0);
      expect(hashChunk(a)).toBe(hashChunk(b));
      expect(a.boxes.length).toBe(b.boxes.length);
      expect(a.props.length).toBe(b.props.length);
    }
  });

  it('changes with the seed', () => {
    for (const type of WORLD_TYPES) {
      const a = hashChunk(generateChunk(type, 'seed-a', 0, 0));
      const b = hashChunk(generateChunk(type, 'seed-b', 0, 0));
      expect(a).not.toBe(b);
    }
  });

  it('changes with the chunk coordinates', () => {
    const a = hashChunk(generateChunk('backrooms', 'dreamcore', 0, 0));
    const b = hashChunk(generateChunk('backrooms', 'dreamcore', 1, 0));
    expect(a).not.toBe(b);
  });

  it('never produces NaN or infinite values', () => {
    for (const type of WORLD_TYPES) {
      for (const seed of SEEDS) {
        for (const [cx, cz] of [[0, 0], [1, 0], [-1, 2], [5, -3]]) {
          expect(allFinite(generateChunk(type, seed, cx, cz))).toBe(true);
        }
      }
    }
  });

  it('always provides a floor and a spawn point', () => {
    for (const type of WORLD_TYPES) {
      for (const seed of SEEDS) {
        const chunk = generateChunk(type, seed, 0, 0);
        expect(chunk.spawns.length).toBeGreaterThan(0);
        const world = buildPhysics(chunk);
        const hasFloor = world.colliders.some((c) => c.tag === 'floor');
        expect(hasFloor).toBe(true);
      }
    }
  });

  it('never spawns the player inside geometry', () => {
    for (const type of WORLD_TYPES) {
      for (const seed of SEEDS) {
        const chunk = generateChunk(type, seed, 0, 0);
        const world = buildPhysics(chunk);
        for (const spawn of chunk.spawns) {
          expect(isBlocked(world, spawn.x, spawn.y + 0.4, spawn.z)).toBe(false);
        }
      }
    }
  });

  it('never places an artifact inside a wall', () => {
    for (const type of WORLD_TYPES) {
      for (const seed of SEEDS) {
        for (const [cx, cz] of [[0, 0], [2, -1]]) {
          const chunk = generateChunk(type, seed, cx, cz);
          const world = buildPhysics(chunk);
          for (const item of chunk.interactables) {
            if (item.kind !== 'artifact') continue;
            expect(isBlocked(world, item.x, item.y, item.z, 0.2)).toBe(false);
          }
        }
      }
    }
  });

  it('does not duplicate geometry across chunk borders', () => {
    for (const type of WORLD_TYPES) {
      const a = generateChunk(type, 'border', 0, 0);
      const b = generateChunk(type, 'border', 1, 0);
      const worldA = buildPhysics(a);
      const worldB = buildPhysics(b);
      for (const ca of worldA.colliders) {
        const aa = {
          minX: ca.box.c.x - ca.box.h.x,
          maxX: ca.box.c.x + ca.box.h.x,
          minY: ca.box.c.y - ca.box.h.y,
          maxY: ca.box.c.y + ca.box.h.y,
          minZ: ca.box.c.z - ca.box.h.z,
          maxZ: ca.box.c.z + ca.box.h.z,
        };
        for (const cb of worldB.colliders) {
          const ba = {
            minX: cb.box.c.x - cb.box.h.x,
            maxX: cb.box.c.x + cb.box.h.x,
            minY: cb.box.c.y - cb.box.h.y,
            maxY: cb.box.c.y + cb.box.h.y,
            minZ: cb.box.c.z - cb.box.h.z,
            maxZ: cb.box.c.z + cb.box.h.z,
          };
          const ox = Math.min(aa.maxX, ba.maxX) - Math.max(aa.minX, ba.minX);
          const oy = Math.min(aa.maxY, ba.maxY) - Math.max(aa.minY, ba.minY);
          const oz = Math.min(aa.maxZ, ba.maxZ) - Math.max(aa.minZ, ba.minZ);
          const volume = Math.max(0, ox) * Math.max(0, oy) * Math.max(0, oz);
          expect(volume).toBeLessThan(0.05);
        }
      }
    }
  });

  it('keeps every prop inside the chunk bounds', () => {
    for (const type of WORLD_TYPES) {
      const chunk = generateChunk(type, 'bounds', 0, 0);
      for (const prop of chunk.props) {
        expect(prop.x).toBeGreaterThan(-24);
        expect(prop.x).toBeLessThan(48);
        expect(prop.z).toBeGreaterThan(-24);
        expect(prop.z).toBeLessThan(48);
      }
    }
  });

  it('only uses known prop types', () => {
    for (const type of WORLD_TYPES) {
      const chunk = generateChunk(type, 'props', 0, 0);
      for (const prop of chunk.props) {
        expect(() => propDef(prop.type)).not.toThrow();
      }
    }
  });

  it('maps a seed to a stable world family', () => {
    const t = worldTypeForSeed('dreamcore');
    expect(WORLD_TYPES).toContain(t);
    expect(worldTypeForSeed('dreamcore')).toBe(t);
  });

  it('creates doors for every backrooms doorway', () => {
    const chunk = generateChunk('backrooms', 'doors', 0, 0);
    const doors = chunk.interactables.filter((i) => i.kind === 'door');
    // 4 cells per chunk, each with two walls and one doorway
    expect(doors.length).toBe(8);
    for (const door of doors) {
      expect(door.data?.width).toBeGreaterThan(1);
    }
  });

  it('keeps the object count per chunk reasonable', () => {
    for (const type of WORLD_TYPES) {
      const chunk = generateChunk(type, 'count', 0, 0);
      expect(chunk.boxes.length).toBeLessThan(400);
      expect(chunk.props.length).toBeLessThan(200);
      expect(chunk.colliders.length).toBeLessThan(400);
    }
  });

  it('generates the same world family for the same seed across runs', () => {
    const type: WorldType = worldTypeForSeed('repeatable');
    const first = hashChunk(generateChunk(type, 'repeatable', 3, -2));
    const second = hashChunk(generateChunk(type, 'repeatable', 3, -2));
    expect(first).toBe(second);
  });
});
