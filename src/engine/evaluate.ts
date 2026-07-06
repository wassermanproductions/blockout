/**
 * The heart of Blockout: state(t).
 *
 * ShotEvaluator compiles a (scene, shot) pair into precomputed travel legs
 * and answers "where is everything at time t?" as a PURE function — no wall
 * clock, no incremental state. Playback, video export, stills, and glTF
 * baking all call the same evaluator, which is what makes exports
 * deterministic across machines.
 */

import { assetSpec, entityHeight } from './assets'
import { verticalFov } from './camera'
import { easedProgress, lerp, lerpAngle, smoothstep } from './easing'
import { GAITS, checkSpeed, type SpeedVerdict } from './gaits'
import { Path, headingOf } from './path'
import { RigNoise } from './rigs'
import type {
  ActorMark,
  CameraMark,
  CameraState,
  Entity,
  EntityState,
  GaitId,
  MarkBase,
  Scene,
  Shot,
  ShotState,
  V3
} from './types'

/**
 * Interpolate two joint-offset maps (missing keys read as 0). Returns
 * undefined when both sides are empty so unposed actors stay allocation-free.
 */
function lerpJoints(
  from: Record<string, number> | undefined,
  to: Record<string, number> | undefined,
  u: number
): Record<string, number> | undefined {
  if (!from && !to) return undefined
  const out: Record<string, number> = {}
  const keys = new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})])
  for (const key of keys) {
    out[key] = (from?.[key] ?? 0) + ((to?.[key] ?? 0) - (from?.[key] ?? 0)) * u
  }
  return out
}

interface Leg<M extends MarkBase> {
  from: M
  to: M
  departTime: number
  arriveTime: number
  path: Path
  /** Cumulative travel distance at the start of this leg. */
  distanceBefore: number
}

function buildLegs<M extends MarkBase>(marks: M[]): Leg<M>[] {
  const sorted = [...marks].sort((a, b) => a.time - b.time)
  const legs: Leg<M>[] = []
  let distanceBefore = 0
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]!
    const to = sorted[i + 1]!
    // A hold reaching past the next mark's arrival would leave a 1ms
    // teleport; truncate the hold so there is always a real travel window.
    const departTime = Math.min(from.time + from.hold, Math.max(from.time, to.time - 0.1))
    const arriveTime = Math.max(to.time, departTime + 0.001)
    const points: V3[] = [from.position, ...(to.via ?? []), to.position]
    const path = new Path(points)
    legs.push({ from, to, departTime, arriveTime, path, distanceBefore })
    distanceBefore += path.length
  }
  return legs
}

/** Evaluate a mark track at time t: position, heading, progress info. */
function evaluateTrack<M extends MarkBase>(
  marks: M[],
  legs: Leg<M>[],
  t: number
): {
  position: V3
  travelHeading: number | null
  distanceTravelled: number
  speed: number
  leg: Leg<M> | null
  /** Mark we are at / most recently arrived at (null while travelling). */
  atMark: M | null
  legProgress: number
} {
  const sorted = [...marks].sort((a, b) => a.time - b.time)
  const first = sorted[0]!
  // Only handle "before the first mark" here — holding AT a mark is the
  // legs loop's job, which respects the truncated departure time (a hold
  // reaching past the next mark's arrival is shortened, not honored).
  if (legs.length === 0 || t <= first.time) {
    return {
      position: first.position,
      travelHeading: null,
      distanceTravelled: 0,
      speed: 0,
      leg: null,
      atMark: first,
      legProgress: 0
    }
  }
  for (const leg of legs) {
    if (t < leg.departTime) {
      // Holding at leg.from
      return {
        position: leg.from.position,
        travelHeading: null,
        distanceTravelled: leg.distanceBefore,
        speed: 0,
        leg: null,
        atMark: leg.from,
        legProgress: 0
      }
    }
    if (t <= leg.arriveTime) {
      const u = (t - leg.departTime) / (leg.arriveTime - leg.departTime)
      const progress = easedProgress(u, leg.from.easeOut, leg.to.easeIn)
      const d = progress * leg.path.length
      // Finite-difference instantaneous speed (pure in t).
      const du = 0.001
      const p2 = easedProgress(Math.min(1, u + du), leg.from.easeOut, leg.to.easeIn)
      const speed =
        ((p2 - progress) * leg.path.length) / (du * (leg.arriveTime - leg.departTime))
      return {
        position: leg.path.pointAt(d),
        travelHeading: leg.path.length > 0.001 ? leg.path.headingAt(d) : null,
        distanceTravelled: leg.distanceBefore + d,
        speed,
        leg,
        atMark: null,
        legProgress: u
      }
    }
  }
  const last = legs[legs.length - 1]!
  return {
    position: last.to.position,
    travelHeading: null,
    distanceTravelled: last.distanceBefore + last.path.length,
    speed: 0,
    leg: null,
    atMark: last.to,
    legProgress: 1
  }
}

export interface SpeedWarning {
  entityId: string | 'camera'
  entityName: string
  fromMarkId: string
  toMarkId: string
  legIndex: number
  verdict: Exclude<SpeedVerdict, { ok: true }>
  gait: GaitId
}

export class ShotEvaluator {
  readonly scene: Scene
  readonly shot: Shot
  private cameraLegs: Leg<CameraMark>[]
  private entityLegs = new Map<string, { entity: Entity; marks: ActorMark[]; legs: Leg<ActorMark>[] }>()
  private rigNoise: RigNoise
  private staticEntities: Entity[] = []

  constructor(scene: Scene, shot: Shot) {
    this.scene = scene
    this.shot = shot
    this.cameraLegs = shot.camera.marks.length >= 2 ? buildLegs(shot.camera.marks) : []
    this.rigNoise = new RigNoise(shot.camera.rig, shot.camera.seed)

    const take = scene.blocking.find((b) => b.id === shot.blockingTakeId) ?? scene.blocking[0]
    const tracked = new Set<string>()
    if (take) {
      for (const track of take.tracks) {
        const entity = scene.entities.find((e) => e.id === track.entityId)
        if (!entity || track.marks.length === 0) continue
        tracked.add(entity.id)
        this.entityLegs.set(entity.id, {
          entity,
          marks: track.marks,
          legs: track.marks.length >= 2 ? buildLegs(track.marks) : []
        })
      }
    }
    this.staticEntities = scene.entities.filter((e) => !tracked.has(e.id))
  }

  evaluate(t: number): ShotState {
    const time = Math.min(Math.max(0, t), this.shot.duration)
    const entities: EntityState[] = []

    for (const { entity, marks, legs } of this.entityLegs.values()) {
      const r = evaluateTrack(marks, legs, time)
      const arriveHeading = r.atMark?.arriveHeading
      const heading =
        r.travelHeading ?? arriveHeading ?? this.lastTravelHeading(legs, time) ?? entity.transform.rotationY
      // Gait: while travelling, the gait of the mark we travel toward;
      // while holding, the gait of the mark we're at.
      const gait: GaitId = r.leg ? r.leg.to.gait : (r.atMark?.gait ?? 'stand')
      const spec = GAITS[gait]
      // Joints: hold the mark's pose at a mark; interpolate between the
      // departure and arrival marks' poses while travelling (eased with the
      // same curve as the travel itself so limbs land with the body).
      const joints = r.leg
        ? lerpJoints(
            r.leg.from.joints,
            r.leg.to.joints,
            easedProgress(r.legProgress, r.leg.from.easeOut, r.leg.to.easeIn)
          )
        : r.atMark?.joints
          ? { ...r.atMark.joints }
          : undefined
      entities.push({
        entityId: entity.id,
        position: r.position,
        heading,
        gait: r.leg && spec.travels ? gait : r.leg ? 'walk' : gait,
        distanceTravelled: r.distanceTravelled,
        speed: r.speed,
        joints
      })
    }

    for (const entity of this.staticEntities) {
      entities.push({
        entityId: entity.id,
        position: entity.transform.position,
        heading: entity.transform.rotationY,
        gait: 'stand',
        distanceTravelled: 0,
        speed: 0
      })
    }

    this.resolveMarriages(entities)

    return { time, camera: this.evaluateCamera(time, entities), entities }
  }

  /**
   * Married entities ride their parent: world pose = parent pose ∘ the local
   * offset captured at marry time. Own blocking marks override the marriage.
   * Multiple passes resolve chains (rider on cart on truck); marry-time
   * cycle guards keep this finite.
   */
  private resolveMarriages(entities: EntityState[]): void {
    const byId = new Map(entities.map((e) => [e.entityId, e]))
    for (let pass = 0; pass < 4; pass++) {
      let changed = false
      for (const entity of this.scene.entities) {
        if (!entity.attachedTo || !entity.attachedLocal) continue
        if (this.entityLegs.has(entity.id)) continue // own marks win
        const child = byId.get(entity.id)
        const parent = byId.get(entity.attachedTo)
        if (!child || !parent) continue
        const local = entity.attachedLocal
        const cosH = Math.cos(parent.heading)
        const sinH = Math.sin(parent.heading)
        const nx = parent.position.x + local.x * cosH + local.z * sinH
        const ny = parent.position.y + local.y
        const nz = parent.position.z - local.x * sinH + local.z * cosH
        const nh = parent.heading + local.rotY
        if (
          Math.abs(child.position.x - nx) > 1e-9 ||
          Math.abs(child.position.y - ny) > 1e-9 ||
          Math.abs(child.position.z - nz) > 1e-9 ||
          Math.abs(child.heading - nh) > 1e-9
        ) {
          changed = true
        }
        child.position = { x: nx, y: ny, z: nz }
        child.heading = nh
        // Ride the parent's motion for animation purposes (a married cart's
        // wheels spin with the truck); the pose itself comes from params.pose.
        child.speed = parent.speed
        child.distanceTravelled = parent.distanceTravelled
      }
      if (!changed) break
    }
  }

  private lastTravelHeading<M extends MarkBase>(legs: Leg<M>[], t: number): number | null {
    // Heading held after finishing a leg = tangent at that leg's end.
    let latest: Leg<M> | null = null
    for (const leg of legs) {
      if (t >= leg.arriveTime && leg.path.length > 0.001) latest = leg
    }
    if (!latest) return null
    return latest.path.headingAt(latest.path.length)
  }

  private evaluateCamera(time: number, entities: EntityState[]): CameraState {
    const cam = this.shot.camera
    const marks = cam.marks

    let position: V3
    let pan: number
    let tilt: number
    let roll: number
    let focalLength: number
    let focusDistance: number | undefined

    if (marks.length === 0) {
      // Sane default: eye-height, pulled back, aimed at origin.
      position = { x: 5, y: 1.6, z: 5 }
      pan = headingOf({ x: -5, y: 0, z: -5 })
      tilt = 0
      roll = 0
      focalLength = 35
      focusDistance = undefined
    } else if (marks.length === 1) {
      const m = marks[0]!
      position = m.position
      pan = m.pan
      tilt = m.tilt
      roll = m.roll
      focalLength = m.focalLength
      focusDistance = m.focusDistance
    } else {
      const r = evaluateTrack(marks, this.cameraLegs, time)
      position = r.position
      if (r.leg) {
        const u = smoothstep(easedProgress(r.legProgress, r.leg.from.easeOut, r.leg.to.easeIn))
        pan = lerpAngle(r.leg.from.pan, r.leg.to.pan, u)
        tilt = lerpAngle(r.leg.from.tilt, r.leg.to.tilt, u)
        roll = lerpAngle(r.leg.from.roll, r.leg.to.roll, u)
        focalLength = lerp(r.leg.from.focalLength, r.leg.to.focalLength, u)
        const f0 = r.leg.from.focusDistance
        const f1 = r.leg.to.focusDistance
        focusDistance = f0 !== undefined && f1 !== undefined ? lerp(f0, f1, u) : (f1 ?? f0)
      } else {
        const m = r.atMark!
        pan = m.pan
        tilt = m.tilt
        roll = m.roll
        focalLength = m.focalLength
        focusDistance = m.focusDistance
      }
    }

    // Car mount: marks are in the mount entity's local frame.
    if (cam.rig === 'carMount' && cam.mountEntityId) {
      const mount = entities.find((e) => e.entityId === cam.mountEntityId)
      if (mount) {
        // Rotate the camera's local offset by the mount's heading
        // (Y-rotation: x' = x cosθ + z sinθ, z' = -x sinθ + z cosθ).
        const cosH = Math.cos(mount.heading)
        const sinH = Math.sin(mount.heading)
        const lx = position.x
        const lz = position.z
        position = {
          x: mount.position.x + lx * cosH + lz * sinH,
          y: mount.position.y + position.y,
          z: mount.position.z - lx * sinH + lz * cosH
        }
        pan = pan + mount.heading
      }
    }

    const noise = this.rigNoise.offsetAt(time, cam.rigIntensity)
    return {
      position: {
        x: position.x + noise.dx,
        y: position.y + noise.dy,
        z: position.z + noise.dz
      },
      pan: pan + noise.dpan,
      tilt: tilt + noise.dtilt,
      roll: roll + noise.droll,
      focalLength,
      focusDistance,
      vfov: verticalFov(cam.sensorId, focalLength, this.shot.aspect)
    }
  }

  /** Speed sanity warnings for every travel leg in the shot's blocking. */
  warnings(): SpeedWarning[] {
    const out: SpeedWarning[] = []
    for (const { entity, legs } of this.entityLegs.values()) {
      const spec = assetSpec(entity.assetId)
      legs.forEach((leg, i) => {
        const duration = leg.arriveTime - leg.departTime
        if (duration <= 0 || leg.path.length < 0.05) return
        const impliedSpeed = leg.path.length / duration
        const verdict = checkSpeed(leg.to.gait, impliedSpeed, spec.speedScale)
        if (!verdict.ok) {
          out.push({
            entityId: entity.id,
            entityName: entity.label?.text || entity.name,
            fromMarkId: leg.from.id,
            toMarkId: leg.to.id,
            legIndex: i,
            verdict,
            gait: leg.to.gait
          })
        }
      })
    }
    return out
  }

  /** Path polylines for viewport/diagram rendering. */
  paths(): { entityId: string | 'camera'; color?: string; points: V3[] }[] {
    const out: { entityId: string | 'camera'; color?: string; points: V3[] }[] = []
    for (const { entity, legs } of this.entityLegs.values()) {
      for (const leg of legs) {
        out.push({ entityId: entity.id, color: entity.label?.color, points: leg.path.polyline() })
      }
    }
    for (const leg of this.cameraLegs) {
      out.push({ entityId: 'camera', points: leg.path.polyline() })
    }
    return out
  }

  /** Subject height helper for auto-framing UIs. */
  subjectHeight(entityId: string): number {
    const e = this.scene.entities.find((x) => x.id === entityId)
    if (!e) return 1.7
    return entityHeight(e.assetId, e.transform.scale, e.params)
  }
}
