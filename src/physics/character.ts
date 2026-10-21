/**
 * Kinematic character controller.
 *
 * The player is modelled as a vertical cylinder (radius + height) that is
 * resolved against the static level geometry with an iterative
 * depenetration + slide scheme. The controller is intentionally independent
 * from the renderer so that its behaviour can be unit tested headlessly.
 */

import { type Box } from './collision';
import { type PhysicsWorld, type StaticCollider } from './world';
import { type Vec3, v3 } from './vec';

export interface CharacterOptions {
  radius: number;
  height: number;
  crouchHeight: number;
  walkSpeed: number;
  runSpeed: number;
  crouchSpeed: number;
  jumpSpeed: number;
  groundAccel: number;
  airAccel: number;
  groundFriction: number;
  stepHeight: number;
  gravity: number;
  /** how far below the feet the ground probe looks for stairs */
  snapDistance: number;
}

export const DEFAULT_CHARACTER: CharacterOptions = {
  radius: 0.32,
  height: 1.78,
  crouchHeight: 1.1,
  walkSpeed: 3.1,
  runSpeed: 5.4,
  crouchSpeed: 1.7,
  jumpSpeed: 6.4,
  groundAccel: 48,
  airAccel: 12,
  groundFriction: 14,
  stepHeight: 0.55,
  gravity: -24,
  snapDistance: 0.6,
};

export interface CharacterInput {
  /** -1..1 strafe (right positive) */
  moveX: number;
  /** -1..1 forward (forward positive) */
  moveZ: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
}

export interface CharacterState {
  grounded: boolean;
  wasGrounded: boolean;
  crouching: boolean;
  speed: number;
  coyote: number;
  jumpBuffer: number;
  landedThisFrame: boolean;
  jumpedThisFrame: boolean;
  steppedUpThisFrame: boolean;
}

interface Overlap {
  collider: StaticCollider;
  nx: number;
  ny: number;
  nz: number;
  depth: number;
  top: number;
}

const _overlaps: Overlap[] = [];
const _probeOverlaps: Overlap[] = [];

export class CharacterController {
  readonly pos: Vec3;
  readonly vel: Vec3;
  readonly opts: CharacterOptions;

  /** camera yaw in radians */
  yaw = 0;
  /** camera pitch in radians, clamped to +/- 85 degrees */
  pitch = 0;

  grounded = false;
  wasGrounded = false;
  crouching = false;
  coyote = 0;
  jumpBuffer = 0;
  landedThisFrame = false;
  jumpedThisFrame = false;
  steppedUpThisFrame = false;
  /** distance walked, used for footstep audio */
  distanceTravelled = 0;

  constructor(opts: Partial<CharacterOptions> = {}, spawn?: Vec3) {
    this.opts = { ...DEFAULT_CHARACTER, ...opts };
    this.pos = spawn ? v3(spawn.x, spawn.y, spawn.z) : v3(0, 0, 0);
    this.vel = v3(0, 0, 0);
  }

  get height(): number {
    return this.crouching ? this.opts.crouchHeight : this.opts.height;
  }

  get eyeHeight(): number {
    return this.height - 0.18;
  }

  teleport(x: number, y: number, z: number): void {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = 0;
    this.vel.y = 0;
    this.vel.z = 0;
    this.grounded = false;
  }

  /** Advances the character by `dt` seconds. */
  update(dt: number, input: CharacterInput, world: PhysicsWorld): void {
    this.landedThisFrame = false;
    this.jumpedThisFrame = false;
    this.steppedUpThisFrame = false;
    this.wasGrounded = this.grounded;

    const o = this.opts;

    // --- crouch handling -------------------------------------------------
    const wantsCrouch = input.crouch;
    if (wantsCrouch !== this.crouching) {
      if (wantsCrouch) {
        this.crouching = true;
      } else if (!this.overlapsAt(world, this.pos.x, this.pos.y, this.pos.z, o.height)) {
        this.crouching = false;
      }
    }

    // --- desired velocity -------------------------------------------------
    const forwardX = Math.sin(this.yaw);
    const forwardZ = Math.cos(this.yaw);
    const rightX = Math.cos(this.yaw);
    const rightZ = -Math.sin(this.yaw);

    let wishX = rightX * input.moveX + forwardX * input.moveZ;
    let wishZ = rightZ * input.moveX + forwardZ * input.moveZ;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1e-4) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const maxSpeed = this.crouching
      ? o.crouchSpeed
      : input.sprint && input.moveZ > 0.1
        ? o.runSpeed
        : o.walkSpeed;
    const targetX = wishX * maxSpeed;
    const targetZ = wishZ * maxSpeed;

    const accel = this.grounded ? o.groundAccel : o.airAccel;
    if (wishLen > 1e-4) {
      this.vel.x = approach(this.vel.x, targetX, accel * dt);
      this.vel.z = approach(this.vel.z, targetZ, accel * dt);
    } else if (this.grounded) {
      const drop = o.groundFriction * dt;
      this.vel.x = approach(this.vel.x, 0, drop);
      this.vel.z = approach(this.vel.z, 0, drop);
    }

    // --- jump -------------------------------------------------------------
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jump ? 0.15 : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = o.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpedThisFrame = true;
    }

    this.vel.y += o.gravity * dt;
    if (this.vel.y < -55) this.vel.y = -55;

    // --- integrate & resolve ----------------------------------------------
    const dispX = this.vel.x * dt;
    const dispY = this.vel.y * dt;
    const dispZ = this.vel.z * dt;
    const maxStep = Math.max(0.08, o.radius * 0.6);
    const steps = Math.min(8, Math.max(1, Math.ceil(Math.hypot(dispX, dispY, dispZ) / maxStep)));
    const sdx = dispX / steps;
    const sdy = dispY / steps;
    const sdz = dispZ / steps;

    let grounded = false;
    for (let s = 0; s < steps; s++) {
      this.pos.x += sdx;
      this.pos.y += sdy;
      this.pos.z += sdz;
      const hitGround = this.resolve(world);
      if (hitGround) grounded = true;
    }

    // --- ground snap (stairs) ---------------------------------------------
    if (!grounded && this.wasGrounded && this.vel.y <= 0.01) {
      const snap = this.findGround(world, this.pos.x, this.pos.z, this.pos.y, o.snapDistance);
      if (snap !== null) {
        this.pos.y = snap + 0.001;
        this.vel.y = 0;
        grounded = true;
      }
    }

    this.grounded = grounded;
    if (this.grounded && !this.wasGrounded) this.landedThisFrame = true;

    // push dynamic props around
    this.pushBodies(world);

    this.distanceTravelled += Math.hypot(this.vel.x, this.vel.z) * dt;
  }

  /**
   * Resolves the character against the level. Returns true when grounded.
   *
   * For every overlapping box the smaller of the two possible corrections is
   * applied: climbing on top of the box (vertical) or sliding along its side
   * (horizontal). Small ledges are climbed instead of blocking the player.
   */
  private resolve(world: PhysicsWorld): boolean {
    let grounded = false;
    for (let iter = 0; iter < 4; iter++) {
      const count = this.collectOverlaps(world, this.pos.x, this.pos.y, this.pos.z, this.height, _overlaps);
      if (count === 0) break;

      let resolvedAny = false;
      for (let i = 0; i < count; i++) {
        const ov = _overlaps[i];
        const rise = ov.top - this.pos.y; // height needed to stand on top of the box

        // step up small ledges instead of blocking
        if (rise > 0.002 && rise <= this.opts.stepHeight && (this.grounded || this.wasGrounded)) {
          const testY = ov.top + 0.002;
          if (!this.overlapsAt(world, this.pos.x, testY, this.pos.z, this.height)) {
            this.pos.y = testY;
            this.steppedUpThisFrame = true;
            resolvedAny = true;
            continue;
          }
        }

        if (rise < ov.depth) {
          // we are below the top of the box: climb onto it
          this.pos.y += rise;
          grounded = true;
          if (this.vel.y < 0) this.vel.y = 0;
          resolvedAny = true;
          continue;
        }

        // push out sideways
        this.pos.x += ov.nx * ov.depth;
        this.pos.z += ov.nz * ov.depth;
        const vn = this.vel.x * ov.nx + this.vel.z * ov.nz;
        if (vn < 0) {
          this.vel.x -= ov.nx * vn;
          this.vel.z -= ov.nz * vn;
        }
        resolvedAny = true;
      }
      if (!resolvedAny) break;
    }
    return grounded;
  }

  /** Collects the colliders overlapping the character cylinder. */
  private collectOverlaps(
    world: PhysicsWorld,
    x: number,
    y: number,
    z: number,
    height: number,
    out: Overlap[],
  ): number {
    const r = this.opts.radius;
    const list = world.queryStatic(x - r - 0.2, z - r - 0.2, x + r + 0.2, z + r + 0.2);
    const bottom = y;
    const top = y + height;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.removed) continue;
      const box = c.box;
      const boxTop = box.c.y + box.h.y;
      const boxBottom = box.c.y - box.h.y;
      if (top <= boxBottom + 0.001 || bottom >= boxTop - 0.001) continue;
      const hit = circleVsBoxXZ(x, z, r, box);
      if (!hit) continue;
      out[n++] = {
        collider: c,
        nx: hit.nx,
        ny: 0,
        nz: hit.nz,
        depth: hit.depth,
        top: boxTop,
      };
    }
    return n;
  }

  /** True when the character volume overlaps any geometry at the given position. */
  overlapsAt(world: PhysicsWorld, x: number, y: number, z: number, height: number): boolean {
    return this.collectOverlaps(world, x, y, z, height, _probeOverlaps) > 0;
  }

  /** Finds the highest floor surface below `y` within `maxDrop`. */
  findGround(world: PhysicsWorld, x: number, z: number, y: number, maxDrop: number): number | null {
    const r = this.opts.radius;
    const list = world.queryStatic(x - r - 0.2, z - r - 0.2, x + r + 0.2, z + r + 0.2);
    let best: number | null = null;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.removed) continue;
      const box = c.box;
      const boxTop = box.c.y + box.h.y;
      if (boxTop > y + 0.05 || boxTop < y - maxDrop) continue;
      if (!circleVsBoxXZ(x, z, r, box)) continue;
      if (best === null || boxTop > best) best = boxTop;
    }
    return best;
  }

  /** Pushes dynamic bodies that intersect the character. */
  private pushBodies(world: PhysicsWorld): void {
    const r = this.opts.radius;
    const bottom = this.pos.y;
    const top = this.pos.y + this.height;
    for (const b of world.bodies) {
      if (b.pos.y + b.radius < bottom || b.pos.y - b.radius > top) continue;
      const dx = b.pos.x - this.pos.x;
      const dz = b.pos.z - this.pos.z;
      const rr = r + b.radius;
      if (dx * dx + dz * dz > rr * rr) continue;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-5) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (rr - dist) * 0.5;
      b.pos.x += nx * push;
      b.pos.z += nz * push;
      const vx = this.vel.x * 0.35;
      const vz = this.vel.z * 0.35;
      world.applyImpulse(b, nx * vx * b.mass * 0.02, 0, nz * vz * b.mass * 0.02);
      b.sleeping = false;
    }
  }
}

function approach(current: number, target: number, maxDelta: number): number {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

interface XzHit {
  nx: number;
  nz: number;
  depth: number;
}

/**
 * Circle vs yaw-rotated rectangle in the XZ plane.
 * The returned normal points from the rectangle towards the circle centre.
 */
export function circleVsBoxXZ(cx: number, cz: number, radius: number, box: Box): XzHit | null {
  const s = Math.sin(box.yaw);
  const co = Math.cos(box.yaw);
  const rx = co;
  const rz = -s;
  const fx = s;
  const fz = co;

  const dx = cx - box.c.x;
  const dz = cz - box.c.z;
  const lx = dx * rx + dz * rz;
  const lz = dx * fx + dz * fz;

  const clx = Math.max(-box.h.x, Math.min(box.h.x, lx));
  const clz = Math.max(-box.h.z, Math.min(box.h.z, lz));
  const ex = lx - clx;
  const ez = lz - clz;
  const distSq = ex * ex + ez * ez;

  let nlx: number;
  let nlz: number;
  let depth: number;
  if (distSq > 1e-12) {
    const dist = Math.sqrt(distSq);
    if (dist >= radius) return null;
    nlx = ex / dist;
    nlz = ez / dist;
    depth = radius - dist;
  } else {
    const penX = box.h.x - Math.abs(lx);
    const penZ = box.h.z - Math.abs(lz);
    if (penX <= penZ) {
      nlx = Math.sign(lx) || 1;
      nlz = 0;
      depth = penX + radius;
    } else {
      nlx = 0;
      nlz = Math.sign(lz) || 1;
      depth = penZ + radius;
    }
  }

  return {
    nx: nlx * rx + nlz * fx,
    nz: nlx * rz + nlz * fz,
    depth,
  };
}
