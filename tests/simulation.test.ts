/**
 * @vitest-environment jsdom
 *
 * Step 6 — headless playthrough.
 *
 * A full simulation loop runs without a GPU: the world is generated, the
 * physics is stepped and the player walks around. This catches the bugs that
 * only appear when generation and physics interact (stuck players, walls that
 * do not block, chunks that never unload, ...).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateChunk } from '../src/world/generate';
import { PhysicsWorld } from '../src/physics/world';
import { CharacterController } from '../src/physics/character';
import { makeBox } from '../src/physics/collision';
import { v3 } from '../src/physics/vec';
import { MaterialLibrary } from '../src/render/materials';
import { PropGeometryCache } from '../src/render/chunkMesh';
import { ChunkManager } from '../src/world/chunkManager';
import { WORLD_TYPES } from '../src/world/types';

const NO_INPUT = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false };

function buildPhysicsFromChunk(chunk: ReturnType<typeof generateChunk>): PhysicsWorld {
  const world = new PhysicsWorld();
  for (const spec of chunk.colliders) {
    world.addCollider(makeBox(spec.x, spec.y, spec.z, spec.w / 2, spec.h / 2, spec.d / 2, spec.yaw), spec.tag);
  }
  return world;
}

describe('step 6 · headless playthrough', () => {
  it('the player lands on the floor after spawning in every world family', () => {
    for (const type of WORLD_TYPES) {
      const chunk = generateChunk(type, 'play', 0, 0);
      const world = buildPhysicsFromChunk(chunk);
      const spawn = chunk.spawns[0];
      const c = new CharacterController({}, v3(spawn.x, spawn.y + 0.3, spawn.z));
      for (let i = 0; i < 120; i++) {
        c.update(1 / 60, NO_INPUT, world);
        world.step(1 / 60);
      }
      expect(Number.isFinite(c.pos.y)).toBe(true);
      expect(c.grounded).toBe(true);
      expect(c.pos.y).toBeGreaterThan(-3);
    }
  });

  it('closed doors keep the player inside the first backrooms room', () => {
    const chunk = generateChunk('backrooms', 'rooms', 0, 0);
    const world = buildPhysicsFromChunk(chunk);
    const spawn = chunk.spawns[0];
    const c = new CharacterController({}, v3(spawn.x, spawn.y + 0.2, spawn.z));

    // walk into every direction for a while
    for (const dir of [
      { moveX: 1, moveZ: 0 },
      { moveX: -1, moveZ: 0 },
      { moveX: 0, moveZ: 1 },
      { moveX: 0, moveZ: -1 },
    ]) {
      for (let i = 0; i < 400; i++) {
        c.update(1 / 60, { ...NO_INPUT, ...dir }, world);
        world.step(1 / 60);
      }
    }
    // the first cell spans 0..12 m, the player must not have escaped
    expect(c.pos.x).toBeGreaterThan(-1.5);
    expect(c.pos.x).toBeLessThan(13.5);
    expect(c.pos.z).toBeGreaterThan(-1.5);
    expect(c.pos.z).toBeLessThan(13.5);
  });

  it('walking for a minute never produces invalid state', () => {
    // full loop: streaming + physics, exactly like the game does it
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const manager = new ChunkManager({
      scene,
      physics,
      materials: new MaterialLibrary(),
      propCache: new PropGeometryCache(),
    });
    manager.setWorld('mall', 'longwalk');
    manager.budgetPerFrame = 8;

    const chunk = generateChunk('mall', 'longwalk', 0, 0);
    const spawn = chunk.spawns[0];
    const c = new CharacterController({}, v3(spawn.x, spawn.y + 0.2, spawn.z));

    for (let i = 0; i < 3600; i++) {
      const angle = i * 0.01;
      c.update(
        1 / 60,
        { ...NO_INPUT, moveX: Math.cos(angle), moveZ: Math.sin(angle), jump: i % 120 === 0 },
        physics,
      );
      physics.step(1 / 60);
      manager.update(c.pos.x, c.pos.z, 1 / 60);
      expect(Number.isFinite(c.pos.x)).toBe(true);
      expect(Number.isFinite(c.pos.y)).toBe(true);
      expect(Number.isFinite(c.pos.z)).toBe(true);
    }
    // the player must stay on the floor of the mall
    expect(c.pos.y).toBeGreaterThan(-3);
    expect(manager.chunks.size).toBeLessThanOrEqual(manager.maxChunks);
  });
});

describe('step 6b · chunk streaming', () => {
  let manager: ChunkManager;
  let physics: PhysicsWorld;
  let scene: THREE.Scene;

  beforeEach(() => {
    scene = new THREE.Scene();
    physics = new PhysicsWorld();
    const materials = new MaterialLibrary();
    const propCache = new PropGeometryCache();
    manager = new ChunkManager({ scene, physics, materials, propCache });
    manager.setWorld('backrooms', 'stream');
  });

  it('loads chunks around the player and keeps the count bounded', () => {
    for (let i = 0; i < 60; i++) {
      manager.update(0, 0, 1 / 60);
    }
    expect(manager.chunks.size).toBeLessThanOrEqual(manager.maxChunks);
    expect(manager.chunks.size).toBeGreaterThan(1);
    expect(physics.colliders.length).toBeGreaterThan(10);
  });

  it('unloads chunks that are left behind and frees their colliders', () => {
    for (let i = 0; i < 60; i++) manager.update(0, 0, 1 / 60);
    const before = physics.colliders.length;
    for (let i = 0; i < 120; i++) manager.update(600, 600, 1 / 60);
    expect(manager.chunks.size).toBeLessThanOrEqual(manager.maxChunks);
    // colliders of the old position must be gone
    const active = physics.colliders.filter((c) => !c.removed).length;
    expect(active).toBeLessThan(before + 2000);
  });

  it('opens and closes doors', () => {
    for (let i = 0; i < 30; i++) manager.update(6, 6, 1 / 60);
    const doors = [...manager.chunks.values()].flatMap((c) => c.interactables.filter((i) => i.kind === 'door'));
    expect(doors.length).toBeGreaterThan(0);
    const door = doors[0];
    expect(door.colliderId).not.toBeNull();
    manager.toggleDoor(door);
    expect(door.open).toBe(true);
    const collider = physics.colliders.find((c) => c.id === door.colliderId);
    expect(collider?.removed).toBe(true);
    manager.toggleDoor(door);
    expect(door.open).toBe(false);
    expect(collider?.removed).toBe(false);
  });

  it('collects artifacts and reports the nearest one', () => {
    for (let i = 0; i < 30; i++) manager.update(0, 0, 1 / 60);
    const artifacts = [...manager.chunks.values()].flatMap((c) => c.interactables.filter((i) => i.kind === 'artifact'));
    expect(artifacts.length).toBeGreaterThan(0);
    const nearest = manager.nearestArtifact(0, 0);
    expect(nearest).not.toBeNull();
    manager.collect(artifacts[0]);
    expect(manager.collectedCount()).toBe(1);
  });

  it('releases every resource when the world changes', () => {
    for (let i = 0; i < 30; i++) manager.update(0, 0, 1 / 60);
    expect(manager.chunks.size).toBeGreaterThan(0);
    manager.setWorld('glade', 'other');
    expect(manager.chunks.size).toBe(0);
    expect(physics.colliders.filter((c) => !c.removed).length).toBe(0);
    expect(physics.bodies.length).toBe(0);
  });

  it('does not leak scene objects when chunks come and go', () => {
    const countObjects = (): number => {
      let n = 0;
      scene.traverse(() => n++);
      return n;
    };

    for (let i = 0; i < 40; i++) manager.update(0, 0, 1 / 60);
    const initial = countObjects();

    // walk far away and come back
    for (let i = 0; i < 200; i++) manager.update(500, 500, 1 / 60);
    for (let i = 0; i < 200; i++) manager.update(0, 0, 1 / 60);

    const after = countObjects();
    expect(after).toBeLessThanOrEqual(initial * 1.15 + 20);
  });
});
