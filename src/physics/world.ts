/**
 * The physics world: static level geometry (yaw-rotated boxes) and dynamic
 * rigid bodies (spheres and boxes) with gravity, friction and restitution.
 *
 * Everything is deterministic and allocation-light so the simulation behaves
 * identically in the browser and in Node based unit tests.
 */

import {
  type Box,
  type Contact,
  boxAabb,
  boxVsBox,
  sphereVsBox,
  sphereVsSphere,
} from './collision';
import { type Vec3, v3 } from './vec';

export interface StaticCollider {
  id: number;
  box: Box;
  tag: string;
  /** optional back reference to the gameplay object that owns the collider */
  ref?: unknown;
  removed: boolean;
}

export type BodyKind = 'sphere' | 'box';

export interface Body {
  id: number;
  kind: BodyKind;
  pos: Vec3;
  vel: Vec3;
  radius: number;
  half: Vec3;
  yaw: number;
  angVel: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  mass: number;
  invMass: number;
  sleeping: boolean;
  sleepTimer: number;
  grounded: boolean;
  /** user data (prop type, mesh id...) */
  userData?: unknown;
}

export interface BodySpec {
  kind: BodyKind;
  x: number;
  y: number;
  z: number;
  radius?: number;
  half?: Vec3;
  yaw?: number;
  restitution?: number;
  friction?: number;
  linearDamping?: number;
  mass?: number;
  userData?: unknown;
}

const GRAVITY = -24;
const CELL = 4;

const _contact: Contact = { depth: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };
const _contactB: Contact = { depth: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };

export class PhysicsWorld {
  readonly colliders: StaticCollider[] = [];
  readonly bodies: Body[] = [];

  private nextColliderId = 1;
  private nextBodyId = 1;
  /** uniform grid over the XZ plane for broad phase queries */
  private grid = new Map<number, number[]>();
  private gridDirty = true;
  /** scratch lists reused to avoid per frame allocations */
  private queryResult: StaticCollider[] = [];

  gravity = GRAVITY;

  addCollider(box: Box, tag = 'solid', ref?: unknown): StaticCollider {
    const collider: StaticCollider = {
      id: this.nextColliderId++,
      box,
      tag,
      ref,
      removed: false,
    };
    this.colliders.push(collider);
    this.gridDirty = true;
    return collider;
  }

  removeCollider(id: number): void {
    for (const c of this.colliders) {
      if (c.id === id && !c.removed) {
        c.removed = true;
        this.gridDirty = true;
        return;
      }
    }
  }

  /** Enables or disables a collider without removing it (used by doors). */
  setColliderEnabled(id: number, enabled: boolean): void {
    for (const c of this.colliders) {
      if (c.id === id) {
        if (c.removed === !enabled) return;
        c.removed = !enabled;
        this.gridDirty = true;
        return;
      }
    }
  }

  /** Removes every collider owned by `ref` (used when a chunk is unloaded). */
  removeCollidersByRef(ref: unknown): void {
    for (const c of this.colliders) {
      if (c.ref === ref && !c.removed) {
        c.removed = true;
        this.gridDirty = true;
      }
    }
  }

  addBody(spec: BodySpec): Body {
    const mass = spec.mass ?? (spec.kind === 'sphere' ? spec.radius! ** 3 : spec.half!.x * spec.half!.y * spec.half!.z * 8);
    const body: Body = {
      id: this.nextBodyId++,
      kind: spec.kind,
      pos: v3(spec.x, spec.y, spec.z),
      vel: v3(0, 0, 0),
      radius: spec.radius ?? 0.5,
      half: spec.half ? v3(spec.half.x, spec.half.y, spec.half.z) : v3(0.5, 0.5, 0.5),
      yaw: spec.yaw ?? 0,
      angVel: 0,
      restitution: spec.restitution ?? 0.2,
      friction: spec.friction ?? 0.6,
      linearDamping: spec.linearDamping ?? 0.02,
      mass,
      invMass: mass > 0 ? 1 / mass : 0,
      sleeping: false,
      sleepTimer: 0,
      grounded: false,
      userData: spec.userData,
    };
    this.bodies.push(body);
    return body;
  }

  removeBody(id: number): void {
    const idx = this.bodies.findIndex((b) => b.id === id);
    if (idx >= 0) this.bodies.splice(idx, 1);
  }

  removeBodiesByRef(ref: unknown): void {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      if (this.bodies[i].userData === ref) this.bodies.splice(i, 1);
    }
  }

  clear(): void {
    this.colliders.length = 0;
    this.bodies.length = 0;
    this.grid.clear();
    this.gridDirty = true;
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (c.removed) continue;
      const a = boxAabb(c.box);
      const x0 = Math.floor(a.minX / CELL);
      const x1 = Math.floor(a.maxX / CELL);
      const z0 = Math.floor(a.minZ / CELL);
      const z1 = Math.floor(a.maxZ / CELL);
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          const key = cellKey(x, z);
          let bucket = this.grid.get(key);
          if (!bucket) {
            bucket = [];
            this.grid.set(key, bucket);
          }
          bucket.push(i);
        }
      }
    }
    this.gridDirty = false;
  }

  /** Returns every collider whose cells overlap the given XZ rectangle. */
  queryStatic(minX: number, minZ: number, maxX: number, maxZ: number): StaticCollider[] {
    if (this.gridDirty) this.rebuildGrid();
    const out = this.queryResult;
    out.length = 0;
    const x0 = Math.floor(minX / CELL);
    const x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL);
    const z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const bucket = this.grid.get(cellKey(x, z));
        if (!bucket) continue;
        for (const idx of bucket) {
          const c = this.colliders[idx];
          if (!c.removed && !out.includes(c)) out.push(c);
        }
      }
    }
    return out;
  }

  /** Advances the simulation by `dt` seconds (already sub-stepped by the caller). */
  step(dt: number): void {
    if (dt <= 0) return;
    this.integrateBodies(dt);
    this.resolveBodyPairs();
  }

  private integrateBodies(dt: number): void {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      if (b.sleeping) continue;
      b.vel.y += this.gravity * dt;
      const damping = Math.pow(1 - b.linearDamping, dt * 60);
      b.vel.x *= damping;
      b.vel.z *= damping;
      b.vel.y *= Math.pow(1 - b.linearDamping * 0.2, dt * 60);

      // sub-step so that fast bodies cannot tunnel through thin walls
      const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
      const maxStep = Math.max(0.05, b.radius * 0.75);
      const steps = Math.min(8, Math.max(1, Math.ceil((speed * dt) / maxStep)));
      const sdt = dt / steps;
      for (let s = 0; s < steps; s++) {
        b.pos.x += b.vel.x * sdt;
        b.pos.y += b.vel.y * sdt;
        b.pos.z += b.vel.z * sdt;
        this.resolveBodyVsStatic(b);
      }
      b.yaw += b.angVel * dt;
      b.angVel *= Math.pow(0.9, dt * 60);
      b.grounded = false;
    }
  }

  private resolveBodyVsStatic(b: Body): void {
    const margin = 0.6;
    const list = this.queryStatic(
      b.pos.x - b.radius - margin,
      b.pos.z - b.radius - margin,
      b.pos.x + b.radius + margin,
      b.pos.z + b.radius + margin,
    );
    for (let iter = 0; iter < 2; iter++) {
      let hit = false;
      for (const c of list) {
        if (c.removed) continue;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        let depth = 0;
        if (b.kind === 'sphere') {
          if (!sphereVsBox(b.pos.x, b.pos.y, b.pos.z, b.radius, c.box, _contact)) continue;
          nx = _contact.nx;
          ny = _contact.ny;
          nz = _contact.nz;
          depth = _contact.depth;
        } else {
          const bodyBox: Box = { c: b.pos, h: b.half, yaw: b.yaw };
          if (!boxVsBox(c.box, bodyBox, _contact)) continue;
          nx = _contact.nx;
          ny = _contact.ny;
          nz = _contact.nz;
          depth = _contact.depth;
        }
        hit = true;
        b.pos.x += nx * depth;
        b.pos.y += ny * depth;
        b.pos.z += nz * depth;
        const vn = b.vel.x * nx + b.vel.y * ny + b.vel.z * nz;
        if (vn < 0) {
          // restitution along the normal
          b.vel.x -= nx * vn * (1 + b.restitution);
          b.vel.y -= ny * vn * (1 + b.restitution);
          b.vel.z -= nz * vn * (1 + b.restitution);
          // Coulomb-ish friction on the tangential component
          const tvx = b.vel.x - nx * (b.vel.x * nx + b.vel.y * ny + b.vel.z * nz);
          const tvy = b.vel.y - ny * (b.vel.x * nx + b.vel.y * ny + b.vel.z * nz);
          const tvz = b.vel.z - nz * (b.vel.x * nx + b.vel.y * ny + b.vel.z * nz);
          b.vel.x -= tvx * b.friction;
          b.vel.y -= tvy * b.friction;
          b.vel.z -= tvz * b.friction;
          if (ny > 0.5) b.grounded = true;
        }
        if (ny > 0.5 && b.vel.y > 0) b.vel.y = 0;
      }
      if (!hit) break;
    }
  }

  private resolveBodyPairs(): void {
    const bodies = this.bodies;
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const reach = a.radius + b.radius + Math.max(a.half.x, a.half.z) + Math.max(b.half.x, b.half.z) + 0.1;
        if (dx * dx + dz * dz > reach * reach) continue;
        if (Math.abs(a.pos.y - b.pos.y) > (a.radius + b.radius + 2)) continue;
        this.resolvePair(a, b);
      }
    }
  }

  private resolvePair(a: Body, b: Body): void {
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let depth = 0;

    if (a.kind === 'sphere' && b.kind === 'sphere') {
      if (!sphereVsSphere(a.pos.x, a.pos.y, a.pos.z, a.radius, b.pos.x, b.pos.y, b.pos.z, b.radius, _contact)) return;
      nx = _contact.nx;
      ny = _contact.ny;
      nz = _contact.nz;
      depth = _contact.depth;
    } else if (a.kind === 'sphere' && b.kind === 'box') {
      const boxB: Box = { c: b.pos, h: b.half, yaw: b.yaw };
      if (!sphereVsBox(a.pos.x, a.pos.y, a.pos.z, a.radius, boxB, _contact)) return;
      nx = -_contact.nx;
      ny = -_contact.ny;
      nz = -_contact.nz;
      depth = _contact.depth;
    } else if (a.kind === 'box' && b.kind === 'sphere') {
      const boxA: Box = { c: a.pos, h: a.half, yaw: a.yaw };
      if (!sphereVsBox(b.pos.x, b.pos.y, b.pos.z, b.radius, boxA, _contact)) return;
      nx = _contact.nx;
      ny = _contact.ny;
      nz = _contact.nz;
      depth = _contact.depth;
    } else {
      const boxA: Box = { c: a.pos, h: a.half, yaw: a.yaw };
      const boxB: Box = { c: b.pos, h: b.half, yaw: b.yaw };
      if (!boxVsBox(boxA, boxB, _contact)) return;
      nx = _contact.nx;
      ny = _contact.ny;
      nz = _contact.nz;
      depth = _contact.depth;
      _contactB.depth = depth;
    }

    const invSum = a.invMass + b.invMass;
    if (invSum <= 0) return;

    // positional correction
    const aShare = a.invMass / invSum;
    const bShare = b.invMass / invSum;
    a.pos.x -= nx * depth * aShare;
    a.pos.y -= ny * depth * aShare;
    a.pos.z -= nz * depth * aShare;
    b.pos.x += nx * depth * bShare;
    b.pos.y += ny * depth * bShare;
    b.pos.z += nz * depth * bShare;

    const rvx = b.vel.x - a.vel.x;
    const rvy = b.vel.y - a.vel.y;
    const rvz = b.vel.z - a.vel.z;
    const vn = rvx * nx + rvy * ny + rvz * nz;
    if (vn < 0) {
      const e = Math.min(a.restitution, b.restitution);
      const j = (-(1 + e) * vn) / invSum;
      a.vel.x -= nx * j * a.invMass;
      a.vel.y -= ny * j * a.invMass;
      a.vel.z -= nz * j * a.invMass;
      b.vel.x += nx * j * b.invMass;
      b.vel.y += ny * j * b.invMass;
      b.vel.z += nz * j * b.invMass;

      // friction along the tangent
      const tx = rvx - nx * vn;
      const ty = rvy - ny * vn;
      const tz = rvz - nz * vn;
      const tl = Math.hypot(tx, ty, tz);
      if (tl > 1e-6) {
        const mu = Math.min(a.friction, b.friction);
        const jt = Math.min(tl / invSum, (j * mu) / invSum);
        a.vel.x += (tx / tl) * jt * a.invMass;
        a.vel.y += (ty / tl) * jt * a.invMass;
        a.vel.z += (tz / tl) * jt * a.invMass;
        b.vel.x -= (tx / tl) * jt * b.invMass;
        b.vel.y -= (ty / tl) * jt * b.invMass;
        b.vel.z -= (tz / tl) * jt * b.invMass;
      }
    }
    a.sleeping = false;
    b.sleeping = false;
    a.sleepTimer = 0;
    b.sleepTimer = 0;
  }

  /** Applies an impulse to a body (used by the character pushing props). */
  applyImpulse(body: Body, ix: number, iy: number, iz: number): void {
    body.vel.x += ix * body.invMass;
    body.vel.y += iy * body.invMass;
    body.vel.z += iz * body.invMass;
    body.sleeping = false;
    body.sleepTimer = 0;
  }
}

function cellKey(x: number, z: number): number {
  // pack two 16 bit signed coordinates into one number
  return ((x & 0xffff) << 16) | (z & 0xffff);
}
