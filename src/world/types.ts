/** Shared data model for procedurally generated worlds. */

export type WorldType = 'backrooms' | 'glade' | 'pool' | 'mall' | 'forest' | 'parking';

export const WORLD_TYPES: readonly WorldType[] = [
  'backrooms',
  'glade',
  'pool',
  'mall',
  'forest',
  'parking',
] as const;

/** Material / texture identifiers resolved by the material cache. */
export type MatKey =
  | 'carpet'
  | 'carpetStain'
  | 'wallpaper'
  | 'wallpaperRed'
  | 'wallpaperBlue'
  | 'ceilingTile'
  | 'plaster'
  | 'concrete'
  | 'asphalt'
  | 'tileWhite'
  | 'tileBlue'
  | 'tileGreen'
  | 'wood'
  | 'woodDark'
  | 'grass'
  | 'dirt'
  | 'metal'
  | 'metalDark'
  | 'glass'
  | 'fabric'
  | 'water'
  | 'emissiveWarm'
  | 'emissiveCold'
  | 'emissiveGreen'
  | 'emissiveRed';

export interface RenderBox {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  mat: MatKey;
  /** world units per texture tile */
  uvScale: number;
  /** optional tint applied to the vertex colour */
  tint?: number;
  /** emissive strength for glowing surfaces */
  emissive?: number;
}

export interface PropInstance {
  type: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

export type LightKind = 'point' | 'flicker' | 'sun' | 'glow';

export interface LightInstance {
  kind: LightKind;
  x: number;
  y: number;
  z: number;
  color: number;
  intensity: number;
  distance: number;
  /** 0..1 chance/speed of flicker, only used for 'flicker' */
  flicker?: number;
}

export type InteractableKind = 'door' | 'switch' | 'note' | 'artifact' | 'exit' | 'sign' | 'radio';

export interface InteractableInstance {
  id: string;
  kind: InteractableKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** free form payload (note text, door width, ...) */
  data?: Record<string, unknown>;
}

export interface ColliderSpec {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw: number;
  tag: string;
  /** id of the interactable that owns the collider (doors) */
  owner?: string;
}

export interface ChunkData {
  cx: number;
  cz: number;
  boxes: RenderBox[];
  props: PropInstance[];
  lights: LightInstance[];
  interactables: InteractableInstance[];
  colliders: ColliderSpec[];
  dynamics: PropInstance[];
  /** candidate safe spawn positions inside the chunk */
  spawns: Array<{ x: number; y: number; z: number }>;
}

export interface WorldProfile {
  type: WorldType;
  name: string;
  subtitle: string;
  /** objective shown in the HUD */
  objective: string;
  sky: number;
  fogColor: number;
  fogDensity: number;
  ambientSky: number;
  ambientGround: number;
  ambientIntensity: number;
  /** number of artifacts required to open the exit */
  requiredArtifacts: number;
  /** colour of the artifact glow */
  artifactColor: number;
  /** ambience preset for procedural audio */
  ambience: 'hum' | 'wind' | 'water' | 'reverb' | 'forest' | 'machines';
  /** base gravity */
  gravity: number;
}
