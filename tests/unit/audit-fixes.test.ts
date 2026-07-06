/** Regression tests for the adversarial-audit findings. */

import { describe, expect, it } from 'vitest'
import { verticalFov, SENSORS } from '@engine/camera'
import { sanitizeName, uniqueName } from '@engine/strings'
import { generatePrompt } from '@engine/prompt'
import { getProfile } from '@engine/profiles'
import { ShotEvaluator } from '@engine/evaluate'
import { createProject, createEntity, createActorMark, createCameraMark } from '@engine/schema'

describe('audit fix: 9:16 optics cannot exceed the physical gate (finding 4)', () => {
  it('vertical crop is bounded by gate height', () => {
    const vfov916 = verticalFov('super35', 35, '9:16')
    const maxPhysical = 2 * Math.atan(SENSORS.super35.height / (2 * 35))
    expect(vfov916).toBeLessThanOrEqual(maxPhysical + 1e-9)
  })

  it('16:9 on Super 35 is unchanged (crop < gate height)', () => {
    const expected = 2 * Math.atan(SENSORS.super35.width / (16 / 9) / (2 * 35))
    expect(verticalFov('super35', 35, '16:9')).toBeCloseTo(expected, 9)
  })
})

describe('audit fix: prompt pan direction and seam wrapping (findings 2, 14)', () => {
  function fixtureWithPan(fromPan: number, toPan: number) {
    const doc = createProject('P')
    const scene = doc.scenes[0]!
    const shot = scene.shots[0]!
    shot.camera.marks.push(
      createCameraMark({ x: 0, y: 1.6, z: 5 }, 0, fromPan, 0, 35),
      createCameraMark({ x: 0, y: 1.6, z: 5 }, 4, toPan, 0, 35)
    )
    return { scene, shot }
  }

  it('increasing pan is described as panning LEFT (rotation.y = pan)', () => {
    const { scene, shot } = fixtureWithPan(0, 0.6)
    const prompt = generatePrompt(scene, shot, getProfile('seedance-2'))
    expect(prompt).toContain('pans left')
    expect(prompt).not.toContain('pans right')
  })

  it('a small move across the ±π seam is not narrated as a 350° pan', () => {
    const { scene, shot } = fixtureWithPan(Math.PI - 0.05, -Math.PI + 0.05)
    const prompt = generatePrompt(scene, shot, getProfile('seedance-2'))
    // 0.1 rad wrapped delta is below the 0.12 mention threshold.
    expect(prompt).not.toContain('pans')
  })
})

describe('audit fix: unicode-safe names, never empty, unique (finding 8)', () => {
  it('keeps unicode letters', () => {
    expect(sanitizeName('追跡')).toBe('追跡')
    expect(sanitizeName('Scène 1')).toBe('Scène-1')
  })

  it('never returns empty and is deterministic', () => {
    const a = sanitizeName('!!!')
    expect(a.length).toBeGreaterThan(0)
    expect(sanitizeName('!!!')).toBe(a)
    expect(sanitizeName('???')).not.toBe(sanitizeName('!!!!'))
  })

  it('uniqueName suffixes collisions', () => {
    const used = new Set<string>()
    expect(uniqueName('Thug', used)).toBe('Thug')
    expect(uniqueName('Thug', used)).toBe('Thug-2')
    expect(uniqueName('Thug', used)).toBe('Thug-3')
  })
})

describe('audit fix: hold overlapping the next mark no longer teleports (finding 15)', () => {
  it('truncates the hold to leave a real travel window', () => {
    const doc = createProject('H')
    const scene = doc.scenes[0]!
    const shot = scene.shots[0]!
    const man = createEntity('person.man', 'Man', { x: 0, y: 0, z: 0 })
    scene.entities.push(man)
    const m1 = createActorMark({ x: 0, y: 0, z: 0 }, 0, 'walk')
    m1.hold = 10 // extends past the next mark's arrival at t=3
    const m2 = createActorMark({ x: 0, y: 0, z: -6 }, 3, 'walk')
    scene.blocking[0]!.tracks.push({ entityId: man.id, marks: [m1, m2] })
    shot.duration = 5
    const ev = new ShotEvaluator(scene, shot)
    // Just before arrival the actor must be travelling, not snapping.
    const nearArrival = ev.evaluate(2.99).entities.find((e) => e.entityId === man.id)!
    expect(nearArrival.position.z).toBeLessThan(-4)
    const atArrival = ev.evaluate(3.0).entities.find((e) => e.entityId === man.id)!
    expect(atArrival.position.z).toBeCloseTo(-6, 1)
  })
})
