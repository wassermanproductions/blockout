/**
 * Blockout document model.
 *
 * A Project owns Scenes. A Scene owns the stage (entities), master blocking
 * takes, and Shots. A Shot owns a camera (marks + rig) and references a
 * blocking take — this is the coverage model: the action stays put, the
 * camera moves between shots.
 *
 * Everything here is plain serializable data. Time is in seconds, distance
 * in meters, angles in radians unless suffixed Deg.
 */

export interface V3 {
  x: number
  y: number
  z: number
}

export type EntityCategory =
  | 'people'
  | 'animals'
  | 'vehicles'
  | 'furniture'
  | 'environment'
  | 'primitives'
  | 'custom'

export type GaitId =
  | 'stand'
  | 'walk'
  | 'jog'
  | 'run'
  | 'sit'
  | 'lie'
  | 'crouch'
  | 'gesture'
  | 'fall'

export type LightingPresetId =
  | 'day'
  | 'goldenHour'
  | 'night'
  | 'interiorWarm'
  | 'interiorCool'
  | 'club'

export type RigId =
  | 'sticks'
  | 'dolly'
  | 'steadicam'
  | 'handheld'
  | 'crane'
  | 'drone'
  | 'carMount'

export type SensorId = 'super16' | 'super35' | 'fullFrame' | 'imax65'

export type ShotSizeId = 'EWS' | 'WS' | 'FS' | 'MS' | 'MCU' | 'CU' | 'ECU'

export type AspectId = '16:9' | '9:16' | '2.39:1' | '4:3' | '1:1'

export interface Label {
  text: string
  /** Hex color like '#e5484d'; tints the model and colors marks/labels. */
  color: string
}

export interface Transform {
  position: V3
  /** Yaw around +Y. Entities are upright; full rotation lives on marks/camera. */
  rotationY: number
  scale: number
}

export interface Entity {
  id: string
  /** Catalog asset id, e.g. 'person.man', 'vehicle.suv', or 'custom.<uuid>'. */
  assetId: string
  name: string
  label?: Label
  transform: Transform
  /** Per-asset parameters (height/build sliders, color variants). */
  params?: Record<string, number | string>
  /** For custom imports: path relative to project assets/ dir. */
  sourceFile?: string
}

/** Shared mark fields. A mark = a position an entity/camera hits at a time. */
export interface MarkBase {
  id: string
  /** Arrival time in seconds from shot start. */
  time: number
  /** Seconds to remain at the mark after arrival. */
  hold: number
  /** 0..1 fraction of travel eased at departure / arrival. */
  easeIn: number
  easeOut: number
  position: V3
  /**
   * Optional waypoints shaping the path from the PREVIOUS mark to this one
   * (catmull-rom through prev → via… → this).
   */
  via?: V3[]
}

export interface ActorMark extends MarkBase {
  /** Gait adopted when travelling TOWARD this mark. */
  gait: GaitId
  /** If set, face this heading (yaw) on arrival; otherwise keep travel heading. */
  arriveHeading?: number
}

export interface CameraMark extends MarkBase {
  /** Orientation at this mark. */
  pan: number
  tilt: number
  roll: number
  focalLength: number
  /** Focus distance in meters; undefined = deep focus. */
  focusDistance?: number
}

export interface EntityTrack {
  entityId: string
  marks: ActorMark[]
}

/**
 * A blocking take: the choreography of every moving entity. Scene owns takes;
 * shots reference one, so coverage shares blocking. A shot that needs a
 * variant forks the take.
 */
export interface BlockingTake {
  id: string
  name: string
  tracks: EntityTrack[]
}

export interface ShotCamera {
  sensorId: SensorId
  rig: RigId
  /** 0..1, scales rig noise (handheld shake amount, steadicam drift). */
  rigIntensity: number
  /** Seed for rig noise — stored so exports are reproducible. */
  seed: number
  /** Entity to parent the camera to (carMount rig). */
  mountEntityId?: string
  marks: CameraMark[]
}

export interface ReferenceVideo {
  /** Path relative to project folder. */
  path: string
  opacity: number
  mode: 'ghost' | 'pip'
  /** Seconds added to shot time when sampling the video. */
  timeOffset: number
}

export interface Shot {
  id: string
  /** Film-style name, e.g. '1A'. */
  name: string
  duration: number
  fps: number
  aspect: AspectId
  blockingTakeId: string
  camera: ShotCamera
  notes?: string
  referenceVideo?: ReferenceVideo
}

export interface SceneEnvironment {
  lighting: LightingPresetId
  /** Sun/key direction. */
  sunAzimuth: number
  sunElevation: number
  /** 0..1 atmosphere density. */
  fog: number
}

export interface Scene {
  id: string
  name: string
  number: number
  environment: SceneEnvironment
  entities: Entity[]
  blocking: BlockingTake[]
  shots: Shot[]
}

export interface ProjectDoc {
  /** Schema version for forward migration. */
  version: 1
  id: string
  name: string
  settings: {
    defaultProfileId: string
  }
  scenes: Scene[]
}

/** Result of evaluating one entity at time t. */
export interface EntityState {
  entityId: string
  position: V3
  /** Travel heading (yaw). */
  heading: number
  gait: GaitId
  /** Meters travelled since shot start — drives gait cycle phase. */
  distanceTravelled: number
  /** Current speed m/s (0 when holding). */
  speed: number
}

/** Result of evaluating the camera at time t (rig noise already applied). */
export interface CameraState {
  position: V3
  pan: number
  tilt: number
  roll: number
  focalLength: number
  focusDistance?: number
  /** Vertical FOV in radians for the shot's sensor + aspect. */
  vfov: number
}

export interface ShotState {
  time: number
  camera: CameraState
  entities: EntityState[]
}
