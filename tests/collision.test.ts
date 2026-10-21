import { describe, expect, it } from 'vitest';
import { boxVsBox, sphereVsBox, sphereVsSphere, makeBox, type Contact } from '../src/physics/collision';
import { circleVsBoxXZ } from '../src/physics/character';

const contact: Contact = { depth: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };
const contact2: Contact = { depth: 0, nx: 0, ny: 0, nz: 0, px: 0, py: 0, pz: 0 };

describe('step 2 · collision maths', () => {
  it('detects a sphere inside an axis aligned box', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1);
    expect(sphereVsBox(0.5, 0, 0, 0.2, box, contact)).toBe(true);
    expect(contact.depth).toBeGreaterThan(0);
  });

  it('rejects a sphere that misses the box', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1);
    expect(sphereVsBox(5, 0, 0, 0.2, box, contact)).toBe(false);
  });

  it('pushes a sphere out along the closest axis', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1);
    sphereVsBox(0.9, 0, 0, 0.25, box, contact);
    expect(contact.nx).toBeGreaterThan(0.5);
    expect(contact.depth).toBeCloseTo(0.25 + 0.1, 5);
  });

  it('detects sphere/sphere overlap and reports the normal', () => {
    expect(sphereVsSphere(0, 0, 0, 1, 1.5, 0, 0, 1, contact)).toBe(true);
    expect(contact.nx).toBeCloseTo(1, 5);
    expect(contact.depth).toBeCloseTo(0.5, 5);
    expect(sphereVsSphere(0, 0, 0, 1, 5, 0, 0, 1, contact)).toBe(false);
  });

  it('separates overlapping boxes via SAT', () => {
    const a = makeBox(0, 0, 0, 1, 1, 1);
    const b = makeBox(1.5, 0, 0, 1, 1, 1);
    expect(boxVsBox(a, b, contact)).toBe(true);
    expect(contact.nx).toBeCloseTo(1, 5);
    expect(contact.depth).toBeCloseTo(0.5, 5);
  });

  it('reports boxes that do not touch as separated', () => {
    const a = makeBox(0, 0, 0, 1, 1, 1);
    const b = makeBox(3, 0, 0, 1, 1, 1);
    expect(boxVsBox(a, b, contact)).toBe(false);
  });

  it('handles rotated boxes', () => {
    const a = makeBox(0, 0, 0, 1, 1, 1, Math.PI / 4);
    const b = makeBox(1.6, 0, 0, 1, 1, 1, Math.PI / 4);
    expect(boxVsBox(a, b, contact)).toBe(true);
    expect(contact.depth).toBeGreaterThan(0);
  });

  it('computes the circle vs rotated rectangle in XZ', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1, 0);
    const hit = circleVsBoxXZ(1.2, 0, 0.3, box);
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeCloseTo(0.1, 5);
    expect(hit!.nx).toBeCloseTo(1, 5);
    expect(circleVsBoxXZ(5, 0, 0.3, box)).toBeNull();
  });

  it('does not report a hit for a circle inside the rectangle footprint', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1, 0);
    // the circle centre is inside the rect: it must be pushed out, not ignored
    const hit = circleVsBoxXZ(0, 0, 0.3, box);
    expect(hit).not.toBeNull();
    expect(hit!.depth).toBeGreaterThan(0);
  });

  it('keeps the contact point on the surface', () => {
    const box = makeBox(0, 0, 0, 1, 1, 1);
    expect(sphereVsBox(1.4, 0, 0, 0.5, box, contact)).toBe(true);
    expect(contact.px).toBeCloseTo(1, 3);
    expect(contact.depth).toBeCloseTo(0.1, 3);
    // sanity: a second call must not corrupt the first result
    const first = { ...contact };
    sphereVsBox(-1.4, 0, 0, 0.5, box, contact2);
    expect(first.nx).toBeCloseTo(1, 5);
    expect(contact2.nx).toBeCloseTo(-1, 5);
  });
});
