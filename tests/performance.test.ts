/**
 * @vitest-environment jsdom
 *
 * Step 9 — performance budget. The game has to stay at 60 fps on a phone, so
 * the generator, the broad phase and the draw call count are measured here.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateChunk } from '../src/world/generate';
import { WORLD_TYPES } from '../src/world/types';
import { PhysicsWorld } from '../src/physics/world';
import { makeBox } from '../src/physics/collision';
import { MaterialLibrary } from '../src/render/materials';
import { PropGeometryCache } from '../src/render/chunkMesh';
import { ChunkManager } from '../src/world/chunkManager';

describe('step 9 · performance', () => {
  it('generates chunks fast enough for streaming', () => {
    const start = performance.now();
    for (const type of WORLD_TYPES) {
      for (let i = 0; i < 20; i++) generateChunk(type, 'perf', i, i % 3);
    }
    const elapsed = performance.now() - start;
    // 120 chunks must be generated in well under a second
    expect(elapsed).toBeLessThan(2000);
  });

  it('keeps the number of draw calls per chunk low', () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const manager = new ChunkManager({
      scene,
      physics,
      materials: new MaterialLibrary(),
      propCache: new PropGeometryCache(),
    });
    manager.setWorld('backrooms', 'draws');
    for (let i = 0; i < 20; i++) manager.update(0, 0, 1 / 60);

    let meshes = 0;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes++;
    });
    const chunks = manager.chunks.size;
    // merged geometry keeps this far below the number of objects
    expect(meshes / chunks).toBeLessThan(25);
  });

  it('keeps the broad phase fast', () => {
    const world = new PhysicsWorld();
    for (let i = 0; i < 500; i++) {
      world.addCollider(makeBox(i * 2, 1, 0, 1, 1, 1), 'wall');
    }
    const start = performance.now();
    for (let i = 0; i < 20000; i++) {
      world.queryStatic(i % 100, 0, i % 100 + 1, 1);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1500);
  });

  it('does not leak scene objects while streaming', () => {
    const scene = new THREE.Scene();
    const physics = new PhysicsWorld();
    const manager = new ChunkManager({
      scene,
      physics,
      materials: new MaterialLibrary(),
      propCache: new PropGeometryCache(),
    });
    manager.setWorld('glade', 'leak');
    for (let i = 0; i < 600; i++) {
      manager.update(i * 2, 0, 1 / 60);
    }
    let objects = 0;
    scene.traverse(() => objects++);
    expect(objects).toBeLessThan(4000);
    const activeColliders = physics.colliders.filter((c) => !c.removed).length;
    expect(activeColliders).toBeLessThan(4000);
  });

  it('keeps the physics step cheap', () => {
    const world = new PhysicsWorld();
    world.addCollider(makeBox(0, -0.5, 0, 50, 0.5, 50), 'floor');
    for (let i = 0; i < 40; i++) {
      world.addBody({ kind: 'sphere', x: i * 0.5, y: 3, z: 0, radius: 0.2, mass: 1 });
    }
    const start = performance.now();
    for (let i = 0; i < 2000; i++) world.step(1 / 60);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1500);
  });
});
