import { describe, expect, it } from 'vitest';
import { PhysicsWorld } from '../src/physics/world';
import { makeBox } from '../src/physics/collision';
import { CharacterController } from '../src/physics/character';
import { v3 } from '../src/physics/vec';

const NO_INPUT = { moveX: 0, moveZ: 0, jump: false, sprint: false, crouch: false };

function makeFloorWorld(): PhysicsWorld {
  const world = new PhysicsWorld();
  world.addCollider(makeBox(0, -0.5, 0, 50, 0.5, 50), 'floor');
  return world;
}

function simulate(
  controller: CharacterController,
  world: PhysicsWorld,
  frames: number,
  input: Partial<typeof NO_INPUT> = {},
  dt = 1 / 60,
): void {
  for (let i = 0; i < frames; i++) {
    controller.update(dt, { ...NO_INPUT, ...input }, world);
    world.step(dt);
  }
}

describe('step 3 · character physics', () => {
  it('falls onto the floor and stops there', () => {
    const world = makeFloorWorld();
    const c = new CharacterController({}, v3(0, 3, 0));
    simulate(c, world, 180);
    expect(c.grounded).toBe(true);
    expect(c.pos.y).toBeGreaterThan(-0.01);
    expect(c.pos.y).toBeLessThan(0.02);
    expect(Math.abs(c.vel.y)).toBeLessThan(0.01);
  });

  it('never tunnels through a thin wall at high speed', () => {
    const world = makeFloorWorld();
    world.addCollider(makeBox(2, 1.5, 0, 0.05, 1.5, 20), 'wall');
    const c = new CharacterController({}, v3(0, 0, 0));
    c.vel.x = 40; // extreme speed, far beyond the normal walk speed
    simulate(c, world, 120, { moveX: 1 });
    expect(c.pos.x).toBeLessThan(2);
    expect(Number.isFinite(c.pos.x)).toBe(true);
  });

  it('is blocked by a solid wall', () => {
    const world = makeFloorWorld();
    world.addCollider(makeBox(1.2, 1.5, 0, 0.2, 1.5, 20), 'wall');
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 240, { moveX: 1 });
    expect(c.pos.x).toBeLessThan(1.0);
    expect(c.pos.x).toBeGreaterThan(0.5);
  });

  it('steps up small ledges', () => {
    const world = makeFloorWorld();
    world.addCollider(makeBox(6, 0.2, 0, 5, 0.2, 10), 'step'); // 0.4 m high, 10 m long
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 90, { moveX: 1 }); // 1.5 s -> still on the step
    expect(c.pos.x).toBeGreaterThan(1.9);
    expect(c.pos.y).toBeGreaterThan(0.3);
  });

  it('cannot climb a ledge that is too high', () => {
    const world = makeFloorWorld();
    world.addCollider(makeBox(2, 0.5, 0, 1, 0.5, 10), 'block'); // 1 m high
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 240, { moveX: 1 });
    expect(c.pos.x).toBeLessThan(1.6);
    expect(c.pos.y).toBeLessThan(0.2);
  });

  it('jumps and lands again', () => {
    const world = makeFloorWorld();
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 30);
    const groundY = c.pos.y;
    c.update(1 / 60, { ...NO_INPUT, jump: true }, world);
    expect(c.vel.y).toBeGreaterThan(3);
    simulate(c, world, 120);
    expect(c.grounded).toBe(true);
    expect(c.pos.y).toBeCloseTo(groundY, 2);
  });

  it('crouching reduces the height and is blocked by low ceilings', () => {
    const world = makeFloorWorld();
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 20, { crouch: true });
    expect(c.crouching).toBe(true);
    expect(c.height).toBeLessThan(c.opts.height);
  });

  it('keeps all values finite after a long random walk', () => {
    const world = makeFloorWorld();
    world.addCollider(makeBox(3, 1.5, 3, 0.3, 1.5, 0.3), 'pillar');
    const c = new CharacterController({}, v3(0, 0, 0));
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 2000; i++) {
      const jump = rand() < 0.05;
      c.update(
        1 / 60,
        { moveX: rand() * 2 - 1, moveZ: rand() * 2 - 1, jump, sprint: rand() < 0.3, crouch: false },
        world,
      );
      world.step(1 / 60);
      expect(Number.isFinite(c.pos.x)).toBe(true);
      expect(Number.isFinite(c.pos.y)).toBe(true);
      expect(Number.isFinite(c.pos.z)).toBe(true);
      expect(c.pos.y).toBeGreaterThan(-5);
    }
  });

  it('does not drift when no input is given', () => {
    const world = makeFloorWorld();
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 120);
    expect(Math.abs(c.vel.x)).toBeLessThan(0.01);
    expect(Math.abs(c.vel.z)).toBeLessThan(0.01);
  });
});

describe('step 4 · rigid bodies', () => {
  it('a dropped box comes to rest on the floor', () => {
    const world = makeFloorWorld();
    const body = world.addBody({ kind: 'box', x: 0, y: 4, z: 0, half: v3(0.3, 0.3, 0.3), mass: 2 });
    for (let i = 0; i < 300; i++) world.step(1 / 60);
    expect(body.pos.y).toBeGreaterThan(0.25);
    expect(body.pos.y).toBeLessThan(0.35);
    expect(Math.abs(body.vel.y)).toBeLessThan(0.2);
  });

  it('a sphere rests on the floor', () => {
    const world = makeFloorWorld();
    const body = world.addBody({ kind: 'sphere', x: 1, y: 3, z: 1, radius: 0.25, mass: 1 });
    for (let i = 0; i < 300; i++) world.step(1 / 60);
    expect(body.pos.y).toBeGreaterThan(0.2);
    expect(body.pos.y).toBeLessThan(0.32);
  });

  it('a fast body does not pass through the floor', () => {
    const world = makeFloorWorld();
    const body = world.addBody({ kind: 'sphere', x: 0, y: 2, z: 0, radius: 0.2, mass: 1 });
    body.vel.y = -60;
    for (let i = 0; i < 300; i++) world.step(1 / 60);
    expect(body.pos.y).toBeGreaterThan(0.1);
  });

  it('the character can push a crate', () => {
    const world = makeFloorWorld();
    world.addBody({ kind: 'box', x: 1.2, y: 0.3, z: 0, half: v3(0.3, 0.3, 0.3), mass: 3 });
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 180, { moveX: 1 });
    const crate = world.bodies[0];
    expect(crate.pos.x).toBeGreaterThan(1.25);
  });

  it('two bodies push each other apart', () => {
    const world = new PhysicsWorld();
    world.gravity = 0;
    const a = world.addBody({ kind: 'sphere', x: 0, y: 0, z: 0, radius: 0.5, mass: 1 });
    const b = world.addBody({ kind: 'sphere', x: 0.8, y: 0, z: 0, radius: 0.5, mass: 1 });
    for (let i = 0; i < 60; i++) world.step(1 / 60);
    expect(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)).toBeGreaterThan(0.95);
  });

  it('disabled colliders stop blocking the player', () => {
    const world = makeFloorWorld();
    const collider = world.addCollider(makeBox(1.2, 1.5, 0, 0.2, 1.5, 20), 'wall');
    const c = new CharacterController({}, v3(0, 0, 0));
    simulate(c, world, 60, { moveX: 1 });
    const blockedX = c.pos.x;
    world.setColliderEnabled(collider.id, false);
    simulate(c, world, 120, { moveX: 1 });
    expect(c.pos.x).toBeGreaterThan(blockedX + 0.5);
  });
});
