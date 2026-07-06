/**
 * Asset catalog — engine-side metadata for every built-in library item.
 * The renderer maps each id to a procedural grey-box builder; the engine
 * needs heights (auto-framing), speed scales (sanity checks), and category
 * info (library UI, prompts).
 */

import type { EntityCategory } from './types'

export type Motion = 'biped' | 'quadruped' | 'wheeled' | 'rail' | 'flying' | 'static'

export interface AssetSpec {
  id: string
  name: string
  category: EntityCategory
  /** Standing height in meters (drives auto-framing and label placement). */
  height: number
  /** Rough footprint radius in meters (placement, top-down diagram). */
  footprint: number
  /** Multiplies plausible gait speeds (vehicles travel faster than people). */
  speedScale: number
  motion: Motion
  /** Word used in generated prompts, e.g. 'a man', 'an SUV'. */
  promptNoun: string
}

const A = (
  id: string,
  name: string,
  category: EntityCategory,
  height: number,
  footprint: number,
  speedScale: number,
  motion: Motion,
  promptNoun: string
): AssetSpec => ({ id, name, category, height, footprint, speedScale, motion, promptNoun })

export const ASSET_CATALOG: AssetSpec[] = [
  // People — heights adjustable per-entity via params.height
  A('person.man', 'Man', 'people', 1.78, 0.3, 1, 'biped', 'a man'),
  A('person.woman', 'Woman', 'people', 1.65, 0.28, 1, 'biped', 'a woman'),
  A('person.child', 'Child', 'people', 1.2, 0.22, 0.8, 'biped', 'a child'),
  A('person.elderly', 'Elderly person', 'people', 1.68, 0.3, 0.6, 'biped', 'an elderly person'),

  // Animals
  A('animal.dog', 'Dog', 'animals', 0.6, 0.35, 1.8, 'quadruped', 'a dog'),
  A('animal.cat', 'Cat', 'animals', 0.28, 0.2, 1.2, 'quadruped', 'a cat'),
  A('animal.horse', 'Horse', 'animals', 1.65, 0.7, 4.5, 'quadruped', 'a horse'),
  A('animal.bird', 'Bird', 'animals', 0.25, 0.15, 3, 'flying', 'a bird'),

  // Vehicles
  A('vehicle.sedan', 'Sedan', 'vehicles', 1.45, 2.4, 15, 'wheeled', 'a sedan car'),
  A('vehicle.suv', 'SUV', 'vehicles', 1.8, 2.5, 15, 'wheeled', 'an SUV'),
  A('vehicle.pickup', 'Pickup truck', 'vehicles', 1.9, 2.7, 14, 'wheeled', 'a pickup truck'),
  A('vehicle.van', 'Van', 'vehicles', 2.2, 2.6, 13, 'wheeled', 'a van'),
  A('vehicle.bus', 'Bus', 'vehicles', 3.2, 6.0, 11, 'wheeled', 'a city bus'),
  A('vehicle.truck', 'Semi truck', 'vehicles', 3.8, 8.0, 12, 'wheeled', 'a semi truck'),
  A('vehicle.tank', 'Tank', 'vehicles', 2.4, 4.0, 8, 'wheeled', 'a military tank'),
  A('vehicle.train', 'Train car', 'vehicles', 3.6, 12.0, 20, 'rail', 'a train'),
  A('vehicle.motorcycle', 'Motorcycle', 'vehicles', 1.3, 1.1, 16, 'wheeled', 'a motorcycle'),
  A('vehicle.bicycle', 'Bicycle', 'vehicles', 1.1, 0.9, 5, 'wheeled', 'a bicycle'),
  A('vehicle.plane', 'Airplane', 'vehicles', 5.5, 15.0, 60, 'flying', 'an airplane'),
  A('vehicle.boat', 'Boat', 'vehicles', 2.0, 4.0, 10, 'wheeled', 'a boat'),

  // Furniture & props
  A('furniture.bed', 'Bed', 'furniture', 0.6, 1.1, 0, 'static', 'a bed'),
  A('furniture.couch', 'Couch', 'furniture', 0.85, 1.2, 0, 'static', 'a couch'),
  A('furniture.armchair', 'Armchair', 'furniture', 0.9, 0.55, 0, 'static', 'an armchair'),
  A('furniture.diningTable', 'Dining table', 'furniture', 0.76, 1.0, 0, 'static', 'a dining table'),
  A('furniture.kitchenTable', 'Kitchen table', 'furniture', 0.9, 0.8, 0, 'static', 'a kitchen table'),
  A('furniture.desk', 'Desk', 'furniture', 0.75, 0.8, 0, 'static', 'a desk'),
  A('furniture.sideTable', 'Side table', 'furniture', 0.55, 0.3, 0, 'static', 'a side table'),
  A('furniture.lamp', 'Floor lamp', 'furniture', 1.6, 0.2, 0, 'static', 'a floor lamp'),
  A('furniture.chair', 'Chair', 'furniture', 0.9, 0.3, 0, 'static', 'a chair'),
  A('furniture.stool', 'Stool', 'furniture', 0.65, 0.2, 0, 'static', 'a stool'),
  A('furniture.bar', 'Bar counter', 'furniture', 1.1, 1.5, 0, 'static', 'a bar counter'),
  A('furniture.counter', 'Kitchen counter', 'furniture', 0.95, 1.2, 0, 'static', 'a kitchen counter'),
  A('furniture.shelf', 'Shelf unit', 'furniture', 1.9, 0.5, 0, 'static', 'a shelf'),
  A('furniture.tv', 'TV', 'furniture', 0.75, 0.6, 0, 'static', 'a television'),
  A('furniture.tableSetting', 'Table setting', 'furniture', 0.12, 0.25, 0, 'static', 'plates and glasses'),
  A('furniture.door', 'Door', 'furniture', 2.1, 0.5, 0, 'static', 'a door'),
  A('furniture.window', 'Window', 'furniture', 1.4, 0.6, 0, 'static', 'a window'),

  // Environment kits (one-click shells; placed like entities, big footprint)
  A('env.houseInterior', 'House interior', 'environment', 2.7, 6, 0, 'static', 'a house interior'),
  A('env.houseExterior', 'House exterior', 'environment', 6, 8, 0, 'static', 'a suburban house exterior'),
  A('env.cityStreet', 'City street', 'environment', 12, 20, 0, 'static', 'a city street'),
  A('env.store', 'Store', 'environment', 3.5, 10, 0, 'static', 'a store interior'),
  A('env.nightclub', 'Nightclub', 'environment', 4, 10, 0, 'static', 'a nightclub interior'),
  A('env.office', 'Office', 'environment', 2.8, 8, 0, 'static', 'an office interior'),
  A('env.warehouse', 'Warehouse', 'environment', 6, 12, 0, 'static', 'a warehouse interior'),
  A('env.carInterior', 'Car interior', 'environment', 1.3, 1.5, 0, 'static', 'a car interior'),
  A('env.busInterior', 'Bus interior', 'environment', 2.2, 5, 0, 'static', 'a bus interior'),
  A('env.planeCabin', 'Plane cabin', 'environment', 2.2, 6, 0, 'static', 'an airplane cabin'),
  A('env.field', 'Open field', 'environment', 0.1, 30, 0, 'static', 'an open field'),
  A('env.desert', 'Desert', 'environment', 0.1, 30, 0, 'static', 'a desert'),
  A('env.parkingLot', 'Parking lot', 'environment', 0.1, 15, 0, 'static', 'a parking lot'),
  A('env.alley', 'Alley', 'environment', 8, 8, 0, 'static', 'an alley'),
  A('env.rooftop', 'Rooftop', 'environment', 1.2, 12, 0, 'static', 'a rooftop'),

  // Primitives
  A('prim.cube', 'Cube', 'primitives', 1, 0.5, 0, 'static', 'a box'),
  A('prim.cylinder', 'Cylinder', 'primitives', 1, 0.5, 0, 'static', 'a cylinder'),
  A('prim.ramp', 'Ramp', 'primitives', 1, 1, 0, 'static', 'a ramp'),
  A('prim.wall', 'Wall segment', 'primitives', 2.7, 1.5, 0, 'static', 'a wall'),
  A('prim.stairs', 'Stairs', 'primitives', 2, 1, 0, 'static', 'stairs')
]

const byId = new Map(ASSET_CATALOG.map((a) => [a.id, a]))

export function assetSpec(assetId: string): AssetSpec {
  const spec = byId.get(assetId)
  if (spec) return spec
  // Custom imports and unknown ids degrade gracefully to a person-scale box.
  return {
    id: assetId,
    name: assetId.split('.').pop() ?? assetId,
    category: 'custom',
    height: 1.7,
    footprint: 0.5,
    speedScale: 1,
    motion: 'static',
    promptNoun: 'an object'
  }
}

/** World-space height of an entity (asset height × entity scale × height param). */
export function entityHeight(assetId: string, scale: number, params?: Record<string, number | string>): number {
  const spec = assetSpec(assetId)
  const heightParam = typeof params?.height === 'number' ? params.height : 1
  return spec.height * scale * heightParam
}
