import { type ChunkData, type ColliderSpec, type InteractableInstance, type LightInstance, type MatKey, type PropInstance, type RenderBox } from './types';
import { propDef } from './props';
import { randRange } from '../core/rng';
import { circleVsBoxXZ } from '../physics/character';
import { makeBox } from '../physics/collision';

/** A rectangle (in the XZ plane) that must stay free. */
interface OccupiedRect {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
}


export const CHUNK_SIZE = 24;

export interface BoxOptions {
  yaw?: number;
  /** adds a static collider */
  solid?: boolean;
  colliderTag?: string;
  uvScale?: number;
  tint?: number;
  emissive?: number;
  /** height of the collider relative to the box (default 1) */
  colliderHeight?: number;
  owner?: string;
}

export interface PropOptions {
  yaw?: number;
  scale?: number;
  solid?: boolean;
  dynamic?: boolean;
  mass?: number;
}

/**
 * Collects everything that belongs to one chunk of the world.
 * Generators only ever talk to this builder, which keeps the data model
 * consistent between world families.
 */
export class ChunkBuilder {
  readonly cx: number;
  readonly cz: number;
  readonly size = CHUNK_SIZE;

  readonly boxes: RenderBox[] = [];
  readonly props: PropInstance[] = [];
  readonly lights: LightInstance[] = [];
  readonly interactables: InteractableInstance[] = [];
  readonly colliders: ColliderSpec[] = [];
  readonly dynamics: PropInstance[] = [];
  readonly spawns: Array<{ x: number; y: number; z: number }> = [];

  private idCounter = 0;
  private occupiedRects: OccupiedRect[] = [];

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }

  /** World-space origin of this chunk. */
  get originX(): number {
    return this.cx * this.size;
  }

  get originZ(): number {
    return this.cz * this.size;
  }

  addBox(mat: MatKey, x: number, y: number, z: number, w: number, h: number, d: number, opts: BoxOptions = {}): void {
    this.boxes.push({
      x,
      y,
      z,
      w,
      h,
      d,
      yaw: opts.yaw ?? 0,
      mat,
      uvScale: opts.uvScale ?? 2,
      tint: opts.tint,
      emissive: opts.emissive,
    });
    if (opts.solid) {
      // the collider keeps the bottom of the visual box and can be shortened
      const ch = Math.max(0.05, Math.min(1, opts.colliderHeight ?? 1));
      const colliderH = h * ch;
      const colliderCenterY = y - h / 2 + colliderH / 2;
      this.colliders.push({
        x,
        y: colliderCenterY,
        z,
        w,
        h: colliderH,
        d,
        yaw: opts.yaw ?? 0,
        tag: opts.colliderTag ?? 'solid',
        owner: opts.owner,
      });
      // walls and blocks reserve their footprint
      if (h > 0.6) {
        this.occupiedRects.push({ x, z, hx: w / 2, hz: d / 2, yaw: opts.yaw ?? 0 });
      }
    }
  }

  addProp(type: string, x: number, y: number, z: number, opts: PropOptions = {}): void {
    const instance: PropInstance = {
      type,
      x,
      y,
      z,
      yaw: opts.yaw ?? 0,
      scale: opts.scale ?? 1,
    };
    this.props.push(instance);
    // NOTE: colliders for props are created by the chunk manager, which knows
    // the real size of the prop definition (props can be scaled).
    // Only props that are inherently dynamic become rigid bodies, so the
    // order of `props` and `dynamics` always matches.
    if (propDef(type).dynamic) {
      this.dynamics.push(instance);
    }
    // props reserve their (rotated) footprint
    const def = propDef(type);
    if (def.size[0] > 0.05 || def.size[2] > 0.05) {
      this.occupiedRects.push({
        x,
        z,
        hx: (def.size[0] * instance.scale) / 2,
        hz: (def.size[2] * instance.scale) / 2,
        yaw: instance.yaw,
      });
    }
  }

  addDynamic(type: string, x: number, y: number, z: number, yaw = 0): void {
    this.addProp(type, x, y, z, { yaw });
  }

  addLight(light: LightInstance): void {
    this.lights.push(light);
  }

  addInteractable(kind: InteractableInstance['kind'], x: number, y: number, z: number, yaw = 0, data?: Record<string, unknown>): string {
    const id = `${kind}-${this.cx}-${this.cz}-${this.idCounter++}`;
    this.interactables.push({ id, kind, x, y, z, yaw, data });
    return id;
  }

  addSpawn(x: number, y: number, z: number): void {
    // never spawn the player inside a prop or a wall
    const spot = this.findFreeSpot(x, z, 0.5);
    this.spawns.push(spot ? { x: spot.x, y, z: spot.z } : { x, y, z });
  }

  /** Adds an objective item at a position that is not blocked by geometry. */
  addArtifact(x: number, y: number, z: number): void {
    const spot = this.findFreeSpot(x, z, 0.4);
    if (!spot) return;
    this.addInteractable('artifact', spot.x, y, spot.z, 0, {});
  }

  /** True when the position overlaps already placed geometry. */
  isOccupied(x: number, z: number, radius: number): boolean {
    for (const rect of this.occupiedRects) {
      const box = makeBox(rect.x, 0, rect.z, rect.hx, 1, rect.hz, rect.yaw);
      if (circleVsBoxXZ(x, z, radius, box)) return true;
    }
    return false;
  }

  /** Searches a free position around (x, z). Returns null when everything is blocked. */
  findFreeSpot(x: number, z: number, radius: number, attempts = 24): { x: number; z: number } | null {
    if (!this.isOccupied(x, z, radius)) return { x, z };
    for (let i = 0; i < attempts; i++) {
      const angle = i * 2.39996; // golden angle, spreads the candidates
      const dist = 0.7 + (i / attempts) * 5;
      const px = x + Math.cos(angle) * dist;
      const pz = z + Math.sin(angle) * dist;
      if (!this.isOccupied(px, pz, radius)) return { x: px, z: pz };
    }
    return null;
  }

  /** Random free position inside a rectangle (used for scattered items). */
  randomFreeSpot(
    rng: () => number,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    radius: number,
    attempts = 10,
  ): { x: number; z: number } | null {
    for (let i = 0; i < attempts; i++) {
      const x = randRange(rng, minX, maxX);
      const z = randRange(rng, minZ, maxZ);
      if (!this.isOccupied(x, z, radius)) return { x, z };
    }
    return null;
  }

  build(): ChunkData {
    return {
      cx: this.cx,
      cz: this.cz,
      boxes: this.boxes,
      props: this.props,
      lights: this.lights,
      interactables: this.interactables,
      colliders: this.colliders,
      dynamics: this.dynamics,
      spawns: this.spawns,
    };
  }
}
