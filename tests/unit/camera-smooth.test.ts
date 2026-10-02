import { describe, expect, it } from 'vitest'
import { ShotEvaluator } from '@engine/evaluate'
import { easedProgress, lerpAngle, smoothstep } from '@engine/easing'
import { createCameraMark, createProject } from '@engine/schema'
import type { CameraMark, Scene, Shot } from '@engine/types'

const DEG = Math.PI / 180

function shotWith(marks: CameraMark[], duration: number): { scene: Scene; shot: Shot } {
  const doc = createProject('Smooth')
  const scene = doc.scenes[0]!
  const shot = scene.shots[0]!
  shot.camera.marks.push(...marks)
  shot.camera.rig = 'sticks'
  shot.camera.rigIntensity = 0
  shot.duration = duration
  return { scene, shot }
}

/**
 * The orbit presets' shape: `count` marks evenly spaced around a circle,
 * eased only on the first and last mark, each aimed at the centre.
 */
function orbitMarks(radius: number, sweepDeg: number, count: number, duration: number): CameraMark[] {
  return Array.from({ length: count }, (_, i) => {
    const u = i / (count - 1)
    const az = sweepDeg * u * DEG
    const m = createCameraMark(
      { x: radius * Math.sin(az), y: 1.2, z: radius * Math.cos(az) },
      duration * u,
      az,
      0,
      50
    )
    const edge = i === 0 || i === count - 1
    m.easeIn = edge ? 0.25 : 0
    m.easeOut = edge ? 0.25 : 0
    return m
  })
}

function horizontalAngle(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.atan2(b.x - a.x, b.z - a.z)
}

describe('smooth camera paths', () => {
  it('a 7-mark orbit stays on its circle (no straight chords between marks)', () => {
    const radius = 2.2
    const { scene, shot } = shotWith(orbitMarks(radius, 180, 7, 10), 10)
    const ev = new ShotEvaluator(scene, shot)
    let worst = 0
    for (let t = 0; t <= 10; t += 0.05) {
      const p = ev.evaluate(t).camera.position
      worst = Math.max(worst, Math.abs(Math.hypot(p.x, p.z) - radius))
    }
    // Straight chords between 30°-spaced marks sag by r·(1 − cos 15°) ≈ 3.4% of r.
    expect(worst / radius).toBeLessThan(0.005)
  })

  it('travel direction is continuous through an interior mark', () => {
    const { scene, shot } = shotWith(orbitMarks(2.2, 180, 7, 10), 10)
    const ev = new ShotEvaluator(scene, shot)
    const markTime = 10 / 6 // second mark
    // Short enough that the orbit's own curvature (~18°/s) contributes < 0.1°.
    const eps = 0.002
    const at = (t: number): { x: number; z: number } => ev.evaluate(t).camera.position
    const before = horizontalAngle(at(markTime - 2 * eps), at(markTime - eps))
    const after = horizontalAngle(at(markTime + eps), at(markTime + 2 * eps))
    // A chord-to-chord corner here turns the travel direction by 30°. What
    // remains is the arc-length table's own polyline step (30° / 32 samples).
    expect(Math.abs(lerpAngle(before, after, 1) - before)).toBeLessThan(2 * DEG)
  })

  it('pan turns straight through an un-eased interior mark instead of stalling', () => {
    const { scene, shot } = shotWith(orbitMarks(2.2, 180, 7, 10), 10)
    const ev = new ShotEvaluator(scene, shot)
    const markTime = 10 / 6
    const eps = 0.01
    const rate = (t0: number, t1: number): number =>
      (ev.evaluate(t1).camera.pan - ev.evaluate(t0).camera.pan) / (t1 - t0)
    const left = rate(markTime - 2 * eps, markTime - eps)
    const atMark = rate(markTime - eps / 2, markTime + eps / 2)
    const right = rate(markTime + eps, markTime + 2 * eps)
    const cruise = (180 * DEG) / 10
    // Old behaviour: smoothstep per leg drove the rate to 0 at every mark.
    expect(atMark).toBeGreaterThan(cruise * 0.8)
    expect(Math.abs(left - right)).toBeLessThan(cruise * 0.05)
  })

  it('eased marks keep the classic smoothstep blend (backward compatible)', () => {
    const a = createCameraMark({ x: 0, y: 1.6, z: 4 }, 0, 0, 0, 35)
    const b = createCameraMark({ x: 4, y: 1.6, z: 0 }, 4, Math.PI / 2, -0.2, 85)
    const { scene, shot } = shotWith([a, b], 4)
    const ev = new ShotEvaluator(scene, shot)
    for (const t of [0.5, 1.3, 2, 3.1]) {
      const u = smoothstep(easedProgress(t / 4, a.easeOut, b.easeIn))
      const cam = ev.evaluate(t).camera
      expect(cam.pan).toBeCloseTo(lerpAngle(a.pan, b.pan, u), 9)
      expect(cam.tilt).toBeCloseTo(lerpAngle(a.tilt, b.tilt, u), 9)
      expect(cam.focalLength).toBeCloseTo(35 + 50 * u, 9)
    }
  })

  it('pan never jumps by 2π when consecutive legs cross ±180°', () => {
    const { scene, shot } = shotWith(orbitMarks(2.2, 360, 13, 12), 12)
    const ev = new ShotEvaluator(scene, shot)
    let prev = ev.evaluate(0).camera.pan
    for (let t = 0.05; t <= 12; t += 0.05) {
      const pan = ev.evaluate(t).camera.pan
      expect(Math.abs(pan - prev)).toBeLessThan(10 * DEG)
      prev = pan
    }
  })

  it('does not overshoot when the next leg holds a value (pan 0→90→90°, zoom 24→50→50)', () => {
    const marks = [0, 1, 2].map((i) => {
      const pan = i === 0 ? 0 : 90 * DEG
      const focal = i === 0 ? 24 : 50
      const m = createCameraMark({ x: i * 2, y: 1.6, z: 0 }, i * 2, pan, 0, focal)
      m.easeIn = 0
      m.easeOut = 0
      return m
    })
    const { scene, shot } = shotWith(marks, 4)
    const ev = new ShotEvaluator(scene, shot)
    for (let t = 0; t <= 4; t += 0.02) {
      const cam = ev.evaluate(t).camera
      expect(cam.pan).toBeLessThanOrEqual(90 * DEG + 1e-9)
      expect(cam.focalLength).toBeLessThanOrEqual(50 + 1e-9)
    }
    // And the held leg really holds.
    expect(ev.evaluate(3).camera.pan).toBeCloseTo(90 * DEG, 9)
  })

  it('an unevenly spaced first leg heads toward its next mark, not away from it', () => {
    // A(0,0) → B(1,0) → C(10,10): equal-step extrapolation put the phantom
    // point past A and started the camera moving toward −Z.
    const pts: [number, number][] = [[0, 0], [1, 0], [10, 10]]
    const marks = pts.map(([x, z], i) => {
      const m = createCameraMark({ x, y: 1.6, z }, i, 0, 0, 35)
      m.easeIn = 0
      m.easeOut = 0
      return m
    })
    const { scene, shot } = shotWith(marks, 2)
    const ev = new ShotEvaluator(scene, shot)
    const p0 = ev.evaluate(0).camera.position
    const p1 = ev.evaluate(0.02).camera.position
    // Starts heading along A→B (+X). The buggy extrapolation started ~63°
    // off toward −Z; a few degrees of bend toward C's side is expected.
    const offDeg = Math.abs(Math.atan2(p1.z - p0.z, p1.x - p0.x)) / DEG
    expect(p1.x - p0.x).toBeGreaterThan(0)
    expect(offDeg).toBeLessThan(5)
  })

  it('hits every mark exactly', () => {
    const marks = orbitMarks(2.2, 180, 7, 10)
    const { scene, shot } = shotWith(marks, 10)
    const ev = new ShotEvaluator(scene, shot)
    for (const m of marks) {
      const cam = ev.evaluate(m.time).camera
      expect(cam.position.x).toBeCloseTo(m.position.x, 3)
      expect(cam.position.z).toBeCloseTo(m.position.z, 3)
      expect(lerpAngle(cam.pan, m.pan, 1) - cam.pan).toBeCloseTo(0, 6)
    }
  })
})
