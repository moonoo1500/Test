import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBoxGeometry, createPropGeometry, ensureColorAttribute } from './geometry';
import type { MaterialLibrary } from './materials';
import { propDef } from '../world/props';
import type { ChunkData, PropInstance } from '../world/types';

export interface DynamicPropVisual {
  type: string;
  mesh: THREE.Mesh;
  instance: PropInstance;
}

export interface ChunkVisual {
  group: THREE.Group;
  dynamics: DynamicPropVisual[];
  dispose(): void;
}

/** Caches the geometry of every prop type (shared between all chunks). */
export class PropGeometryCache {
  private cache = new Map<string, THREE.BufferGeometry>();

  get(type: string): THREE.BufferGeometry {
    let geo = this.cache.get(type);
    if (!geo) {
      geo = createPropGeometry(propDef(type));
      this.cache.set(type, geo);
    }
    return geo;
  }

  dispose(): void {
    for (const geo of this.cache.values()) geo.dispose();
    this.cache.clear();
  }
}

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

/**
 * Converts a chunk into renderable meshes.
 *
 * Static geometry is merged per material, which keeps the number of draw calls
 * at roughly one per material per chunk instead of one per object.
 */
export function buildChunkVisual(
  chunk: ChunkData,
  lib: MaterialLibrary,
  propCache: PropGeometryCache,
): ChunkVisual {
  const group = new THREE.Group();
  group.name = `chunk-${chunk.cx}-${chunk.cz}`;
  const perMaterial = new Map<string, THREE.BufferGeometry[]>();
  const owned: THREE.BufferGeometry[] = [];

  const push = (mat: string, geo: THREE.BufferGeometry): void => {
    let list = perMaterial.get(mat);
    if (!list) {
      list = [];
      perMaterial.set(mat, list);
    }
    list.push(geo);
  };

  for (const box of chunk.boxes) {
    const geo = createBoxGeometry(box.w, box.h, box.d, box.uvScale, box.tint);
    _pos.set(box.x, box.y, box.z);
    _quat.setFromEuler(_euler.set(0, box.yaw, 0));
    _scale.set(1, 1, 1);
    _matrix.compose(_pos, _quat, _scale);
    geo.applyMatrix4(_matrix);
    push(box.mat, geo);
    owned.push(geo);
  }

  const dynamics: DynamicPropVisual[] = [];

  for (const prop of chunk.props) {
    const def = propDef(prop.type);
    if (def.dynamic) {
      const geo = propCache.get(prop.type).clone();
      const mat = lib.get(def.mat);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.position.set(prop.x, prop.y, prop.z);
      mesh.rotation.y = prop.yaw;
      mesh.scale.setScalar(prop.scale);
      group.add(mesh);
      dynamics.push({ type: prop.type, mesh, instance: prop });
      continue;
    }
    const geo = propCache.get(prop.type).clone();
    _pos.set(prop.x, prop.y, prop.z);
    _quat.setFromEuler(_euler.set(0, prop.yaw, 0));
    _scale.setScalar(prop.scale);
    _matrix.compose(_pos, _quat, _scale);
    geo.applyMatrix4(_matrix);
    push(def.mat, geo);
    owned.push(geo);
  }

  const merged: THREE.BufferGeometry[] = [];
  for (const [matKey, geos] of perMaterial) {
    if (geos.length === 0) continue;
    const geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, lib.get(matKey as never));
    mesh.name = `merged-${matKey}`;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    group.add(mesh);
    if (geos.length > 1) merged.push(geo);
  }

  return {
    group,
    dynamics,
    dispose(): void {
      for (const geo of merged) geo.dispose();
      for (const geo of owned) geo.dispose();
      for (const d of dynamics) d.mesh.geometry.dispose();
      group.clear();
    },
  };
}

/** Simple standalone mesh helper for interactive objects (doors, artifacts). */
export function createPropMesh(type: string, lib: MaterialLibrary, propCache: PropGeometryCache): THREE.Mesh {
  const def = propDef(type);
  const geo = ensureColorAttribute(propCache.get(type).clone());
  const mesh = new THREE.Mesh(geo, lib.get(def.mat));
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
