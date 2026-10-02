/**
 * Camera orientation & lens between marks.
 *
 * Pan, tilt, roll and focal length are interpolated per leg with a cubic
 * Hermite in the leg's eased-progress space. The tangent at each mark is
 * chosen so the channel's rate of change (per second) is continuous through
 * marks the camera travels through, and zero where the travel itself eases
 * to a stop. With eased marks on both ends this reduces exactly to the
 * classic smoothstep blend; with ease 0 the camera turns straight through a
 * mark instead of stalling on it.
 */

import { easedProgress } from './easing'
import type { CameraMark } from './types'

export const CAMERA_CHANNELS = ['pan', 'tilt', 'roll', 'focalLength'] as const
export type CameraChannel = (typeof CAMERA_CHANNELS)[number]

const ANGULAR: Record<CameraChannel, boolean> = { pan: true, tilt: true, roll: true, focalLength: false }

/** The subset of a travel leg the orientation solve needs. */
export interface OrientLeg {
  from: CameraMark
  to: CameraMark
  departTime: number
  arriveTime: number
}

/** Per-leg Hermite data: unwrapped end values and tangents (units per unit eased progress). */
export interface LegCurve {
  p0: number
  p1: number
  m0: number
  m1: number
}

export type LegTangents = Record<CameraChannel, LegCurve>

/** Below this, an end's eased-progress slope counts as "stopped" there. */
const STOPPED_SLOPE = 1e-3
const SLOPE_STEP = 1e-5
/** A departure later than the mark time by more than this is a hold (the camera stops). */
const HOLD_EPS = 1e-6

function shortestDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Slope of eased progress (distance fraction per unit normalized time) at a leg's start / end. */
function endSlopes(leg: OrientLeg): [number, number] {
  const e = (u: number): number => easedProgress(u, leg.from.easeOut, leg.to.easeIn)
  return [(e(SLOPE_STEP) - e(0)) / SLOPE_STEP, (e(1) - e(1 - SLOPE_STEP)) / SLOPE_STEP]
}

/** Cubic Hermite on [0,1]. */
export function hermite(s: number, c: LegCurve): number {
  const s2 = s * s
  const s3 = s2 * s
  return (
    (2 * s3 - 3 * s2 + 1) * c.p0 +
    (s3 - 2 * s2 + s) * c.m0 +
    (-2 * s3 + 3 * s2) * c.p1 +
    (s3 - s2) * c.m1
  )
}

/**
 * Precompute Hermite curves for every camera leg (legs must be in time order
 * and share marks end-to-start, as buildLegs produces them).
 */
export function buildCameraTangents(legs: OrientLeg[]): LegTangents[] {
  // Pass 1: unwrapped end values. Each leg starts where the previous one
  // ended, so angles never jump by 2π between legs.
  const curves: LegTangents[] = []
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i]!
    const tangents = {} as LegTangents
    for (const ch of CAMERA_CHANNELS) {
      const p0 = i === 0 ? leg.from[ch] : curves[i - 1]![ch].p1
      const delta = ANGULAR[ch] ? shortestDelta(leg.from[ch], leg.to[ch]) : leg.to[ch] - leg.from[ch]
      tangents[ch] = { p0, p1: p0 + delta, m0: 0, m1: 0 }
    }
    curves.push(tangents)
  }

  const durations = legs.map((leg) => Math.max(leg.arriveTime - leg.departTime, 1e-6))
  const slopes = legs.map(endSlopes)
  // Travel continues through the mark between legs i-1 and i only when leg i
  // departs it immediately (no hold).
  const flows = legs.map((leg, i) => i > 0 && leg.departTime - leg.from.time <= HOLD_EPS)

  for (const ch of CAMERA_CHANNELS) {
    const delta = curves.map((c) => c[ch].p1 - c[ch].p0)

    // Pass 2: rates (per second) at each leg end. Through a flowing mark the
    // rate is the central difference across both legs, so it is identical
    // on either side — unless the value peaks or holds there, where a
    // monotone curve must be flat.
    const startRate = delta.map((d, i) => d / durations[i]!)
    const endRate = [...startRate]
    for (let i = 1; i < legs.length; i++) {
      if (!flows[i]) continue
      const rate =
        delta[i - 1]! * delta[i]! > 0
          ? (curves[i]![ch].p1 - curves[i - 1]![ch].p0) / (legs[i]!.arriveTime - legs[i - 1]!.departTime)
          : 0
      endRate[i - 1] = rate
      startRate[i] = rate
    }

    // Pass 3: Fritsch–Carlson limiting in each leg's eased-progress space so
    // no leg overshoots its end values. A flowing mark takes the stricter of
    // its two legs' limits, keeping the rate continuous.
    const toTangent = (rate: number, i: number, slope: number): number =>
      slope > STOPPED_SLOPE ? (rate * durations[i]!) / slope : 0
    const limit = delta.map((d, i) => {
      if (Math.abs(d) < 1e-12) return 0
      const a = toTangent(startRate[i]!, i, slopes[i]![0]) / d
      const b = toTangent(endRate[i]!, i, slopes[i]![1]) / d
      const r = Math.hypot(a, b)
      return r > 3 ? 3 / r : 1
    })

    for (let i = 0; i < legs.length; i++) {
      const c = curves[i]![ch]
      const scaleStart = flows[i] ? Math.min(limit[i]!, limit[i - 1]!) : limit[i]!
      const scaleEnd = flows[i + 1] ? Math.min(limit[i]!, limit[i + 1]!) : limit[i]!
      // d(value)/dt = m · slope / T  ⇒  m = rate · T / slope. An end that
      // eases to zero speed gets a flat tangent.
      c.m0 = toTangent(startRate[i]! * scaleStart, i, slopes[i]![0])
      c.m1 = toTangent(endRate[i]! * scaleEnd, i, slopes[i]![1])
    }
  }
  return curves
}
