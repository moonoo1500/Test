import * as THREE from 'three';
import type { PropDef } from '../world/props';

/**
 * Builds an axis aligned box with world-space UVs so that textures keep a
 * constant physical size across every surface of the level.
 */
export function createBoxGeometry(w: number, h: number, d: number, uvScale = 2, tint?: number): THREE.BufferGeometry {
  const hw = w / 2;
  const hh = h / 2;
  const hd = d / 2;
  const s = uvScale > 0 ? 1 / uvScale : 1;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];

  const c = new THREE.Color(tint ?? 0xffffff);

  const quad = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    nx: number, ny: number, nz: number,
    uSpan: number, vSpan: number,
  ): void => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    positions.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
    for (let i = 0; i < 6; i++) normals.push(nx, ny, nz);
    uvs.push(0, 0, uSpan, 0, uSpan, vSpan);
    uvs.push(0, 0, uSpan, vSpan, 0, vSpan);
    for (let i = 0; i < 6; i++) colors.push(c.r, c.g, c.b);
  };

  // +X
  quad(hw, -hh, hd, hw, -hh, -hd, hw, hh, -hd, hw, hh, hd, 1, 0, 0, d * s, h * s);
  // -X
  quad(-hw, -hh, -hd, -hw, -hh, hd, -hw, hh, hd, -hw, hh, -hd, -1, 0, 0, d * s, h * s);
  // +Y
  quad(-hw, hh, hd, hw, hh, hd, hw, hh, -hd, -hw, hh, -hd, 0, 1, 0, w * s, d * s);
  // -Y
  quad(-hw, -hh, -hd, hw, -hh, -hd, hw, -hh, hd, -hw, -hh, hd, 0, -1, 0, w * s, d * s);
  // +Z
  quad(-hw, -hh, hd, hw, -hh, hd, hw, hh, hd, -hw, hh, hd, 0, 0, 1, w * s, h * s);
  // -Z
  quad(hw, -hh, -hd, -hw, -hh, -hd, -hw, hh, -hd, hw, hh, -hd, 0, 0, -1, w * s, h * s);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeBoundingSphere();
  return geo;
}

/** Makes sure a geometry carries a colour attribute (needed for merging). */
export function ensureColorAttribute(geo: THREE.BufferGeometry, tint = 0xffffff): THREE.BufferGeometry {
  if (!geo.getAttribute('color')) {
    const count = geo.getAttribute('position').count;
    const color = new THREE.Color(tint);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = color.r;
      arr[i * 3 + 1] = color.g;
      arr[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  return geo;
}

/** Geometry for a placeable prop, anchored so that y=0 is the base. */
export function createPropGeometry(def: PropDef): THREE.BufferGeometry {
  const [w, h, d] = def.size;
  let geo: THREE.BufferGeometry;
  switch (def.shape) {
    case 'sphere': {
      geo = new THREE.SphereGeometry(w / 2, 12, 9);
      geo.translate(0, h / 2, 0);
      break;
    }
    case 'cylinder': {
      geo = new THREE.CylinderGeometry(w / 2, w / 2, h, 12, 1);
      geo.translate(0, h / 2, 0);
      break;
    }
    case 'cone': {
      geo = new THREE.ConeGeometry(w / 2, h, 12, 1);
      geo.translate(0, h / 2, 0);
      break;
    }
    default: {
      geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(0, h / 2, 0);
      break;
    }
  }
  geo = ensureColorAttribute(geo.toNonIndexed(), def.tint ?? 0xffffff);
  geo.computeBoundingSphere();
  return geo;
}
