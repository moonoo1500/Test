import * as THREE from 'three';
import type { PhysicsWorld, Body } from '../physics/world';
import { makeBox } from '../physics/collision';
import type { MaterialLibrary } from '../render/materials';
import { type ChunkVisual, type PropGeometryCache, buildChunkVisual } from '../render/chunkMesh';
import { propDef } from '../world/props';
import { generateChunk } from '../world/generate';
import type { ChunkData, InteractableKind, WorldType } from '../world/types';

export interface RuntimeInteractable {
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  data: Record<string, unknown>;
  object: THREE.Object3D | null;
  colliderId: number | null;
  open: boolean;
  collected: boolean;
  chunkKey: string;
  /** animation helpers */
  pivot: THREE.Group | null;
  closedYaw: number;
  openYaw: number;
  baseY: number;
}

interface ChunkRuntime {
  key: string;
  cx: number;
  cz: number;
  data: ChunkData;
  visual: ChunkVisual;
  interactables: RuntimeInteractable[];
  bodies: Body[];
  colliderIds: number[];
}

export interface ChunkManagerOptions {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  materials: MaterialLibrary;
  propCache: PropGeometryCache;
}

const ARTIFACT_COLOR = 0xfff2b0;

/**
 * Streams chunks around the player.
 *
 * Chunks are generated lazily (at most two per frame to avoid frame spikes),
 * their geometry is merged per material and their colliders are registered
 * with the physics world. Chunks that are far away are disposed completely.
 */
export class ChunkManager {
  private readonly scene: THREE.Scene;
  private readonly physics: PhysicsWorld;
  private readonly materials: MaterialLibrary;
  private readonly propCache: PropGeometryCache;

  readonly chunks = new Map<string, ChunkRuntime>();
  readonly lightCandidates: Array<{ x: number; y: number; z: number; color: number; intensity: number; distance: number }> = [];

  worldType: WorldType = 'backrooms';
  seed = 'liminal';
  radius = 2;
  /** chunks generated per frame */
  budgetPerFrame = 2;

  /**
   * Upper bound of simultaneously loaded chunks. One extra ring is kept as
   * hysteresis so that chunks are not re-created while the player hovers on
   * the border of the loading radius.
   */
  get maxChunks(): number {
    return (2 * (this.radius + 1) + 1) ** 2;
  }

  private pending: Array<{ cx: number; cz: number }> = [];
  private time = 0;

  constructor(opts: ChunkManagerOptions) {
    this.scene = opts.scene;
    this.physics = opts.physics;
    this.materials = opts.materials;
    this.propCache = opts.propCache;
  }

  setWorld(type: WorldType, seed: string): void {
    this.unloadAll();
    this.worldType = type;
    this.seed = seed;
    this.radius = type === 'glade' || type === 'forest' ? 3 : 2;
  }

  unloadAll(): void {
    for (const chunk of this.chunks.values()) {
      this.disposeChunk(chunk);
    }
    this.chunks.clear();
    this.pending.length = 0;
    this.lightCandidates.length = 0;
  }

  private disposeChunk(chunk: ChunkRuntime): void {
    this.scene.remove(chunk.visual.group);
    chunk.visual.dispose();
    for (const id of chunk.colliderIds) this.physics.removeCollider(id);
    for (const body of chunk.bodies) this.physics.removeBody(body.id);
    // doors and artifacts live outside of the chunk group
    for (const it of chunk.interactables) {
      if (!it.object) continue;
      this.scene.remove(it.object);
      it.object.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      it.object = null;
      it.pivot = null;
    }
  }

  /**
   * Loads every chunk around a position immediately.
   * Used when a world starts so that the player never falls through the floor
   * while the streaming catches up.
   */
  loadAround(x: number, z: number): void {
    const cx = Math.floor(x / 24);
    const cz = Math.floor(z / 24);
    for (let dx = -this.radius; dx <= this.radius; dx++) {
      for (let dz = -this.radius; dz <= this.radius; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (this.chunks.has(key)) continue;
        this.loadChunk(cx + dx, cz + dz);
      }
    }
    this.pending.length = 0;
    this.updateLights();
  }

  /** Requests chunks around a position and unloads the ones that are too far. */
  update(px: number, pz: number, dt: number): void {
    this.time += dt;
    const cx = Math.floor(px / 24);
    const cz = Math.floor(pz / 24);
    const r = this.radius;

    // unload
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - cx) > r + 1 || Math.abs(chunk.cz - cz) > r + 1) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      }
    }

    // request missing chunks, nearest first
    const wanted: Array<{ cx: number; cz: number; d: number }> = [];
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const key = `${cx + dx},${cz + dz}`;
        if (this.chunks.has(key)) continue;
        wanted.push({ cx: cx + dx, cz: cz + dz, d: dx * dx + dz * dz });
      }
    }
    wanted.sort((a, b) => a.d - b.d);
    for (const w of wanted) this.pending.push(w);

    // generate within the frame budget
    let budget = this.budgetPerFrame;
    while (budget > 0 && this.pending.length > 0) {
      const next = this.pending.shift()!;
      if (this.chunks.has(`${next.cx},${next.cz}`)) continue;
      this.loadChunk(next.cx, next.cz);
      budget--;
    }

    this.updateLights();
    this.animate(dt);
  }

  private loadChunk(cx: number, cz: number): void {
    const data = generateChunk(this.worldType, this.seed, cx, cz);
    const visual = buildChunkVisual(data, this.materials, this.propCache);
    this.scene.add(visual.group);

    const colliderIds: number[] = [];
    const chunkKey = `${cx},${cz}`;

    // static level geometry
    for (const spec of data.colliders) {
      const collider = this.physics.addCollider(
        makeBox(spec.x, spec.y, spec.z, spec.w / 2, spec.h / 2, spec.d / 2, spec.yaw),
        spec.tag,
        chunkKey,
      );
      colliderIds.push(collider.id);
    }

    // solid props
    for (const prop of data.props) {
      const def = propDef(prop.type);
      if (!def.solid || def.dynamic) continue;
      const [w, h, d] = def.size;
      const s = prop.scale;
      const collider = this.physics.addCollider(
        makeBox(prop.x, prop.y + (h * s) / 2, prop.z, (w * s) / 2, (h * s) / 2, (d * s) / 2, prop.yaw),
        'prop',
        chunkKey,
      );
      colliderIds.push(collider.id);
    }

    // dynamic props
    const bodies: Body[] = [];
    for (const prop of data.dynamics) {
      const def = propDef(prop.type);
      const [w, h, d] = def.size;
      const s = prop.scale;
      const body =
        def.shape === 'sphere'
          ? this.physics.addBody({
              kind: 'sphere',
              x: prop.x,
              y: prop.y + (h * s) / 2,
              z: prop.z,
              radius: (w * s) / 2,
              restitution: 0.25,
              friction: 0.55,
              mass: def.mass ?? 1,
              userData: chunkKey,
            })
          : this.physics.addBody({
              kind: 'box',
              x: prop.x,
              y: prop.y + (h * s) / 2,
              z: prop.z,
              half: { x: (w * s) / 2, y: (h * s) / 2, z: (d * s) / 2 },
              yaw: prop.yaw,
              restitution: 0.18,
              friction: 0.6,
              mass: def.mass ?? 2,
              userData: chunkKey,
            });
      bodies.push(body);
    }

    // interactables
    const interactables: RuntimeInteractable[] = [];
    for (const item of data.interactables) {
      const runtime = this.createInteractable(item, chunkKey);
      if (runtime) {
        interactables.push(runtime);
        if (runtime.colliderId !== null) colliderIds.push(runtime.colliderId);
      }
    }

    this.chunks.set(chunkKey, { key: chunkKey, cx, cz, data, visual, interactables, bodies, colliderIds });
  }

  private createInteractable(
    item: ChunkData['interactables'][number],
    chunkKey: string,
  ): RuntimeInteractable | null {
    const runtime: RuntimeInteractable = {
      id: item.id,
      kind: item.kind,
      x: item.x,
      y: item.y,
      z: item.z,
      yaw: item.yaw,
      data: item.data ?? {},
      object: null,
      colliderId: null,
      open: false,
      collected: false,
      chunkKey,
      pivot: null,
      closedYaw: 0,
      openYaw: 0,
      baseY: item.y,
    };

    if (item.kind === 'door') {
      const axis = (runtime.data.axis as 'x' | 'z') ?? 'x';
      const width = (runtime.data.width as number) ?? 1.4;
      const height = (runtime.data.height as number) ?? 2.1;
      const closedYaw = axis === 'x' ? 0 : Math.PI / 2;
      runtime.closedYaw = closedYaw;
      runtime.openYaw = closedYaw + (runtime.data.swing === -1 ? -1.9 : 1.9);

      const pivot = new THREE.Group();
      pivot.position.set(item.x, 0, item.z);
      pivot.rotation.y = closedYaw;

      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(axis === 'x' ? 0.09 : width, height, axis === 'x' ? width : 0.09),
        this.materials.get('woodDark'),
      );
      const colors = new Float32Array(leaf.geometry.getAttribute('position').count * 3).fill(1);
      leaf.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      leaf.position.set(axis === 'x' ? 0 : width / 2, height / 2, axis === 'x' ? width / 2 : 0);
      pivot.add(leaf);
      this.scene.add(pivot);
      runtime.object = pivot;
      runtime.pivot = pivot;

      const collider = this.physics.addCollider(
        makeBox(
          item.x,
          height / 2,
          item.z,
          axis === 'x' ? 0.06 : width / 2,
          height / 2,
          axis === 'x' ? width / 2 : 0.06,
          closedYaw,
        ),
        'door',
        chunkKey,
      );
      runtime.colliderId = collider.id;
      return runtime;
    }

    if (item.kind === 'artifact') {
      const geo = new THREE.IcosahedronGeometry(0.22, 1);
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: new THREE.Color(ARTIFACT_COLOR),
        emissiveIntensity: 2.6,
        roughness: 0.25,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(item.x, item.y, item.z);
      this.scene.add(mesh);
      runtime.object = mesh;
      return runtime;
    }

    return runtime;
  }

  /** Toggles a door (open / closed). */
  toggleDoor(runtime: RuntimeInteractable): void {
    if (runtime.kind !== 'door') return;
    runtime.open = !runtime.open;
    if (runtime.colliderId !== null) {
      this.physics.setColliderEnabled(runtime.colliderId, !runtime.open);
    }
  }

  /** Marks an artifact as collected and removes its mesh. */
  collect(runtime: RuntimeInteractable): void {
    runtime.collected = true;
    if (runtime.object) {
      this.scene.remove(runtime.object);
      runtime.object.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      runtime.object = null;
    }
  }

  /** All interactables within `radius` of a point. */
  nearby(x: number, y: number, z: number, radius: number): RuntimeInteractable[] {
    const out: RuntimeInteractable[] = [];
    const r2 = radius * radius;
    for (const chunk of this.chunks.values()) {
      for (const it of chunk.interactables) {
        if (it.collected) continue;
        const dx = it.x - x;
        const dy = it.y - y;
        const dz = it.z - z;
        if (dx * dx + dy * dy + dz * dz <= r2) out.push(it);
      }
    }
    return out;
  }

  /** Number of artifacts that were collected in this world. */
  collectedCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      for (const it of chunk.interactables) {
        if (it.kind === 'artifact' && it.collected) count++;
      }
    }
    return count;
  }

  /** Position of the closest uncollected artifact (used by the compass). */
  nearestArtifact(x: number, z: number): { x: number; y: number; z: number } | null {
    let best: RuntimeInteractable | null = null;
    let bestDist = Infinity;
    for (const chunk of this.chunks.values()) {
      for (const it of chunk.interactables) {
        if (it.kind !== 'artifact' || it.collected) continue;
        const d = (it.x - x) ** 2 + (it.z - z) ** 2;
        if (d < bestDist) {
          bestDist = d;
          best = it;
        }
      }
    }
    return best ? { x: best.x, y: best.y, z: best.z } : null;
  }

  private updateLights(): void {
    this.lightCandidates.length = 0;
    for (const chunk of this.chunks.values()) {
      for (const light of chunk.data.lights) {
        this.lightCandidates.push({
          x: light.x,
          y: light.y,
          z: light.z,
          color: light.color,
          intensity: light.intensity,
          distance: light.distance,
        });
      }
    }
  }

  /** Animates doors, artifacts and syncs dynamic prop meshes. */
  private animate(dt: number): void {
    for (const chunk of this.chunks.values()) {
      for (const it of chunk.interactables) {
        if (it.kind === 'door' && it.pivot) {
          const target = it.open ? it.openYaw : it.closedYaw;
          const delta = target - it.pivot.rotation.y;
          it.pivot.rotation.y += delta * Math.min(1, dt * 6);
        } else if (it.kind === 'artifact' && it.object) {
          it.object.rotation.y += dt * 1.4;
          it.object.position.y = it.baseY + Math.sin(this.time * 1.6 + it.x) * 0.09;
        }
      }
      // sync dynamic props with their bodies
      for (let i = 0; i < chunk.visual.dynamics.length; i++) {
        const dyn = chunk.visual.dynamics[i];
        const body = chunk.bodies[i];
        if (!body) continue;
        dyn.mesh.position.set(body.pos.x, body.pos.y - dyn.instance.y, body.pos.z);
        dyn.mesh.rotation.y = body.yaw;
      }
    }
  }

  /** Spawn points known from the loaded chunks. */
  spawnPoints(): Array<{ x: number; y: number; z: number }> {
    const out: Array<{ x: number; y: number; z: number }> = [];
    for (const chunk of this.chunks.values()) {
      out.push(...chunk.data.spawns);
    }
    return out;
  }

  dispose(): void {
    this.unloadAll();
  }
}
