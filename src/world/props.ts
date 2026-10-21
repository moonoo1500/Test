import type { MatKey } from './types';

export type PropShape = 'box' | 'sphere' | 'cylinder' | 'cone';

export interface PropDef {
  type: string;
  shape: PropShape;
  /** full size (width, height, depth) */
  size: [number, number, number];
  mat: MatKey;
  tint?: number;
  /** creates a static collider */
  solid: boolean;
  /** simulated as a rigid body (can be pushed / falls) */
  dynamic?: boolean;
  mass?: number;
  emissive?: number;
  /** the mesh origin sits on the ground (default) or at the centre */
  anchor?: 'ground' | 'center';
}

const D = (
  type: string,
  shape: PropShape,
  size: [number, number, number],
  mat: MatKey,
  extra: Partial<PropDef> = {},
): PropDef => ({ type, shape, size, mat, solid: false, ...extra });

/**
 * Catalogue of every placeable prop. Rendering code turns these into
 * instanced meshes; the physics layer only cares about `solid` / `dynamic`.
 */
export const PROPS: Record<string, PropDef> = {
  // --- generic clutter -----------------------------------------------------
  cardboardBox: D('cardboardBox', 'box', [0.6, 0.5, 0.45], 'wood', { solid: true, dynamic: true, mass: 2 }),
  crate: D('crate', 'box', [0.9, 0.9, 0.9], 'woodDark', { solid: true, dynamic: true, mass: 8 }),
  trashBin: D('trashBin', 'cylinder', [0.5, 0.85, 0.5], 'metalDark', { solid: true }),
  barrel: D('barrel', 'cylinder', [0.6, 0.9, 0.6], 'metal', { solid: true, dynamic: true, mass: 6 }),
  can: D('can', 'cylinder', [0.09, 0.14, 0.09], 'metal', { solid: false, dynamic: true, mass: 0.15 }),
  ball: D('ball', 'sphere', [0.28, 0.28, 0.28], 'emissiveRed', { solid: false, dynamic: true, mass: 0.4 }),
  tire: D('tire', 'cylinder', [0.7, 0.3, 0.7], 'metalDark', { solid: true, dynamic: true, mass: 5 }),
  suitcase: D('suitcase', 'box', [0.7, 0.25, 0.45], 'fabric', { solid: true, dynamic: true, mass: 4 }),
  trafficCone: D('trafficCone', 'cone', [0.36, 0.7, 0.36], 'emissiveRed', { solid: true }),
  pallet: D('pallet', 'box', [1.2, 0.14, 1.0], 'wood', { solid: true }),

  // --- seating / furniture -------------------------------------------------
  chair: D('chair', 'box', [0.5, 0.9, 0.5], 'wood', { solid: true }),
  plasticChair: D('plasticChair', 'box', [0.45, 0.85, 0.45], 'emissiveGreen', { solid: true }),
  bench: D('bench', 'box', [1.8, 0.5, 0.6], 'wood', { solid: true }),
  sofa: D('sofa', 'box', [2.0, 0.85, 0.9], 'fabric', { solid: true }),
  bed: D('bed', 'box', [1.4, 0.55, 2.0], 'fabric', { solid: true }),
  desk: D('desk', 'box', [1.4, 0.75, 0.7], 'wood', { solid: true }),
  locker: D('locker', 'box', [0.45, 1.85, 0.45], 'metal', { solid: true }),
  fridge: D('fridge', 'box', [0.75, 1.85, 0.7], 'metal', { solid: true }),
  tv: D('tv', 'box', [1.1, 0.65, 0.12], 'emissiveCold', { solid: true }),
  counter: D('counter', 'box', [2.4, 1.1, 0.7], 'woodDark', { solid: true }),

  // --- electronics ---------------------------------------------------------
  vending: D('vending', 'box', [1.0, 1.9, 0.7], 'emissiveRed', { solid: true, emissive: 0.55 }),
  arcade: D('arcade', 'box', [0.8, 1.8, 0.8], 'emissiveWarm', { solid: true, emissive: 0.4 }),
  radio: D('radio', 'box', [0.45, 0.3, 0.22], 'metalDark', { solid: true }),
  speaker: D('speaker', 'box', [0.4, 0.9, 0.4], 'woodDark', { solid: true }),
  ceilingLamp: D('ceilingLamp', 'box', [1.2, 0.12, 0.35], 'emissiveWarm', { solid: false, emissive: 1 }),
  lampPost: D('lampPost', 'cylinder', [0.16, 4.2, 0.16], 'metalDark', { solid: true }),

  // --- nature --------------------------------------------------------------
  treePine: D('treePine', 'cone', [2.2, 6.5, 2.2], 'grass', { solid: true }),
  treeRound: D('treeRound', 'sphere', [3.2, 3.6, 3.2], 'grass', { solid: true }),
  bush: D('bush', 'sphere', [1.1, 0.9, 1.1], 'grass', { solid: true }),
  rock: D('rock', 'sphere', [1.0, 0.7, 0.9], 'concrete', { solid: true }),
  mushroom: D('mushroom', 'cone', [0.4, 0.45, 0.4], 'emissiveGreen', { solid: false, emissive: 0.35 }),
  plant: D('plant', 'cylinder', [0.6, 1.2, 0.6], 'grass', { solid: true }),
  planter: D('planter', 'box', [1.0, 0.6, 1.0], 'concrete', { solid: true }),

  // --- place specific ------------------------------------------------------
  swing: D('swing', 'box', [2.2, 2.4, 0.3], 'metal', { solid: true }),
  pillar: D('pillar', 'cylinder', [0.7, 4.0, 0.7], 'concrete', { solid: true }),
  car: D('car', 'box', [1.9, 1.4, 4.3], 'metal', { solid: true }),
  escalator: D('escalator', 'box', [1.6, 1.0, 5.0], 'metal', { solid: true }),
  divingBoard: D('divingBoard', 'box', [1.0, 0.1, 2.6], 'emissiveCold', { solid: true }),
  ladder: D('ladder', 'box', [0.6, 2.6, 0.12], 'metal', { solid: true }),
  shopFront: D('shopFront', 'box', [4.0, 3.2, 0.4], 'glass', { solid: true, emissive: 0.25 }),
  sign: D('sign', 'box', [1.2, 0.5, 0.1], 'emissiveWarm', { solid: false, emissive: 0.9 }),
  statue: D('statue', 'box', [0.7, 2.2, 0.7], 'plaster', { solid: true }),
  fountain: D('fountain', 'cylinder', [3.2, 0.9, 3.2], 'tileWhite', { solid: true }),
  shoppingCart: D('shoppingCart', 'box', [0.6, 0.9, 0.9], 'metal', { solid: true, dynamic: true, mass: 3 }),
  cabin: D('cabin', 'box', [5.0, 3.2, 4.2], 'wood', { solid: true }),
  trafficLight: D('trafficLight', 'box', [0.3, 1.4, 0.3], 'metalDark', { solid: true }),
  bones: D('bones', 'sphere', [0.4, 0.25, 0.4], 'plaster', { solid: false }),
};

export function propDef(type: string): PropDef {
  const def = PROPS[type];
  if (!def) throw new Error(`Unknown prop type: ${type}`);
  return def;
}

export function isKnownProp(type: string): boolean {
  return type in PROPS;
}
