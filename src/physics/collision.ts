/**
 * Collision primitives.
 *
 * Only yaw-rotated boxes (OBB around the Y axis) and spheres are supported —
 * enough for architecture, props and rigid bodies while staying cheap enough
 * for mobile devices.
 */

import { type Vec3, v3 } from './vec';

export interface Box {
  /** centre of the box in world space */
  c: Vec3;
  /** half extents along local X (right), Y (up), Z (forward) */
  h: Vec3;
  /** yaw in radians */
  yaw: number;
}

export interface Aabb {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export function makeBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0): Box {
  return { c: v3(cx, cy, cz), h: v3(hx, hy, hz), yaw };
}

/** Local axes of a yaw-rotated box. right = (cos, 0, -sin), forward = (sin, 0, cos). */
export function boxAxes(box: Box): { rx: number; rz: number; fx: number; fz: number } {
  const s = Math.sin(box.yaw);
  const c = Math.cos(box.yaw);
  return { rx: c, rz: -s, fx: s, fz: c };
}

/** World-space AABB of a yaw-rotated box. */
export function boxAabb(box: Box, out?: Aabb): Aabb {
  const { rx, rz, fx, fz } = boxAxes(box);
  const ex = Math.abs(rx) * box.h.x + Math.abs(fx) * box.h.z;
  const ez = Math.abs(rz) * box.h.x + Math.abs(fz) * box.h.z;
  const a = out ?? { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  a.minX = box.c.x - ex;
  a.maxX = box.c.x + ex;
  a.minY = box.c.y - box.h.y;
  a.maxY = box.c.y + box.h.y;
  a.minZ = box.c.z - ez;
  a.maxZ = box.c.z + ez;
  return a;
}

/** Converts a world point into the box local space. */
export function toLocal(box: Box, px: number, py: number, pz: number, out: Vec3): Vec3 {
  const { rx, rz, fx, fz } = boxAxes(box);
  const dx = px - box.c.x;
  const dy = py - box.c.y;
  const dz = pz - box.c.z;
  out.x = dx * rx + dz * rz;
  out.y = dy;
  out.z = dx * fx + dz * fz;
  return out;
}

/** Converts a local point into world space. */
export function toWorld(box: Box, lx: number, ly: number, lz: number, out: Vec3): Vec3 {
  const { rx, rz, fx, fz } = boxAxes(box);
  out.x = box.c.x + rx * lx + fx * lz;
  out.y = box.c.y + ly;
  out.z = box.c.z + rz * lx + fz * lz;
  return out;
}

/** Closest point on (or inside) a box to a world point. */
export function closestPointOnBox(box: Box, px: number, py: number, pz: number, out: Vec3): Vec3 {
  const local = toLocal(box, px, py, pz, _tmpA);
  local.x = Math.max(-box.h.x, Math.min(box.h.x, local.x));
  local.y = Math.max(-box.h.y, Math.min(box.h.y, local.y));
  local.z = Math.max(-box.h.z, Math.min(box.h.z, local.z));
  return toWorld(box, local.x, local.y, local.z, out);
}

export interface Contact {
  /** penetration depth */
  depth: number;
  /** unit normal pointing from the box towards the other shape */
  nx: number;
  ny: number;
  nz: number;
  /** contact point (world space, on the box surface) */
  px: number;
  py: number;
  pz: number;
}

const _tmpA = v3();

/**
 * Sphere vs yaw-rotated box.
 * Returns true when they overlap and fills `contact` with the MTV.
 */
export function sphereVsBox(
  sx: number,
  sy: number,
  sz: number,
  radius: number,
  box: Box,
  contact: Contact,
): boolean {
  const local = toLocal(box, sx, sy, sz, _tmpA);
  const clampedX = Math.max(-box.h.x, Math.min(box.h.x, local.x));
  const clampedY = Math.max(-box.h.y, Math.min(box.h.y, local.y));
  const clampedZ = Math.max(-box.h.z, Math.min(box.h.z, local.z));
  const dx = local.x - clampedX;
  const dy = local.y - clampedY;
  const dz = local.z - clampedZ;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq > radius * radius) return false;

  let nx: number;
  let ny: number;
  let nz: number;
  let depth: number;

  if (distSq > 1e-12) {
    const dist = Math.sqrt(distSq);
    nx = dx / dist;
    ny = dy / dist;
    nz = dz / dist;
    depth = radius - dist;
  } else {
    // centre is inside the box — push out along the shallowest axis
    const px = box.h.x - Math.abs(local.x);
    const py = box.h.y - Math.abs(local.y);
    const pz = box.h.z - Math.abs(local.z);
    if (px <= py && px <= pz) {
      nx = Math.sign(local.x) || 1;
      ny = 0;
      nz = 0;
      depth = px + radius;
    } else if (py <= pz) {
      nx = 0;
      ny = Math.sign(local.y) || 1;
      nz = 0;
      depth = py + radius;
    } else {
      nx = 0;
      ny = 0;
      nz = Math.sign(local.z) || 1;
      depth = pz + radius;
    }
  }

  const { rx, rz, fx, fz } = boxAxes(box);
  contact.nx = nx * rx + nz * fx;
  contact.ny = ny;
  contact.nz = nx * rz + nz * fz;
  contact.depth = depth;
  contact.px = sx - contact.nx * (radius - depth);
  contact.py = sy - contact.ny * (radius - depth);
  contact.pz = sz - contact.nz * (radius - depth);
  return true;
}

/**
 * Box vs box (both yaw rotated) using the separating axis theorem.
 * `contact.n*` points from `a` towards `b`.
 */
export function boxVsBox(a: Box, b: Box, contact: Contact): boolean {
  const axesA = boxAxes(a);
  const axesB = boxAxes(b);
  const dx = b.c.x - a.c.x;
  const dy = b.c.y - a.c.y;
  const dz = b.c.z - a.c.z;

  const axes: Array<[number, number, number]> = [
    [axesA.rx, 0, axesA.rz],
    [axesA.fx, 0, axesA.fz],
    [axesB.rx, 0, axesB.rz],
    [axesB.fx, 0, axesB.fz],
    // the vertical axis is required, otherwise boxes at different heights
    // would always report an overlap
    [0, 1, 0],
  ];

  let bestDepth = Infinity;
  let bnx = 0;
  let bny = 0;
  let bnz = 0;

  for (const [ax, ay, az] of axes) {
    const proj = dx * ax + dy * ay + dz * az;
    const rA =
      a.h.x * Math.abs(ax * axesA.rx + az * axesA.rz) +
      a.h.y * Math.abs(ay) +
      a.h.z * Math.abs(ax * axesA.fx + az * axesA.fz);
    const rB =
      b.h.x * Math.abs(ax * axesB.rx + az * axesB.rz) +
      b.h.y * Math.abs(ay) +
      b.h.z * Math.abs(ax * axesB.fx + az * axesB.fz);
    const overlap = rA + rB - Math.abs(proj);
    if (overlap <= 0) return false;
    if (overlap < bestDepth) {
      bestDepth = overlap;
      const sign = proj < 0 ? -1 : 1;
      bnx = ax * sign;
      bny = ay * sign;
      bnz = az * sign;
    }
  }

  contact.depth = bestDepth;
  contact.nx = bnx;
  contact.ny = bny;
  contact.nz = bnz;
  contact.px = (a.c.x + b.c.x) * 0.5;
  contact.py = (a.c.y + b.c.y) * 0.5;
  contact.pz = (a.c.z + b.c.z) * 0.5;
  return true;
}

/** Sphere vs sphere. */
export function sphereVsSphere(
  ax: number,
  ay: number,
  az: number,
  ar: number,
  bx: number,
  by: number,
  bz: number,
  br: number,
  contact: Contact,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const distSq = dx * dx + dy * dy + dz * dz;
  const rsum = ar + br;
  if (distSq > rsum * rsum) return false;
  const dist = Math.sqrt(distSq);
  let nx: number;
  let ny: number;
  let nz: number;
  if (dist > 1e-9) {
    nx = dx / dist;
    ny = dy / dist;
    nz = dz / dist;
  } else {
    nx = 0;
    ny = 1;
    nz = 0;
  }
  contact.depth = rsum - dist;
  contact.nx = nx;
  contact.ny = ny;
  contact.nz = nz;
  contact.px = ax + nx * ar;
  contact.py = ay + ny * ar;
  contact.pz = az + nz * ar;
  return true;
}
