/** Round-3 features: marriage (attached entities) resolution in the evaluator. */

import { describe, expect, it } from 'vitest'
import { ShotEvaluator } from '@engine/evaluate'
import { createProject, createEntity, createActorMark } from '@engine/schema'
import type { Scene, Shot } from '@engine/types'

function movingVehicleFixture(): { scene: Scene; shot: Shot; carId: string } {
  const doc = createProject('M')
  const scene = doc.scenes[0]!
  const shot = scene.shots[0]!
  shot.duration = 4
  const car = createEntity('vehicle.suv', 'SUV', { x: 0, y: 0, z: 0 })
  scene.entities.push(car)
  const m1 = createActorMark({ x: 0, y: 0, z: 0 }, 0, 'walk')
  const m2 = createActorMark({ x: 0, y: 0, z: -8 }, 4, 'walk')
  m1.easeIn = m1.easeOut = m2.easeIn = m2.easeOut = 0
  scene.blocking[0]!.tracks.push({ entityId: car.id, marks: [m1, m2] })
  return { scene, shot, carId: car.id }
}

describe('marriage: attached entities ride their parent', () => {
  it('a rider follows a moving vehicle at its local offset', () => {
    const { scene, shot, carId } = movingVehicleFixture()
    const rider = createEntity('person.man', 'Rider', { x: 0.5, y: 0.8, z: 0 })
    rider.attachedTo = carId
    rider.attachedLocal = { x: 0.5, y: 0.8, z: 0, rotY: 0 }
    scene.entities.push(rider)

    const ev = new ShotEvaluator(scene, shot)
    const mid = ev.evaluate(2)
    const car = mid.entities.find((e) => e.entityId === carId)!
    const r = mid.entities.find((e) => e.entityId === rider.id)!
    // Car travels -Z (heading 0): local +x offset stays +x in world.
    expect(r.position.z).toBeCloseTo(car.position.z, 3)
    expect(r.position.x).toBeCloseTo(car.position.x + 0.5, 3)
    expect(r.position.y).toBeCloseTo(0.8, 3)
    expect(r.heading).toBeCloseTo(car.heading, 5)
    // Riding: animation params follow the parent (no walking in place).
    expect(r.speed).toBeCloseTo(car.speed, 3)
  })

  it('local offsets rotate with the parent heading', () => {
    const doc = createProject('R')
    const scene = doc.scenes[0]!
    const shot = scene.shots[0]!
    const car = createEntity('vehicle.suv', 'SUV', { x: 0, y: 0, z: 0 })
    car.transform.rotationY = Math.PI / 2 // facing -X
    scene.entities.push(car)
    const rider = createEntity('person.man', 'Rider', { x: 0, y: 0, z: 0 })
    rider.attachedTo = car.id
    // 1m to the parent's local right (+x) — with heading π/2 that lands
    // at world (cos, -sin) = (0, -1) per the Y-rotation convention.
    rider.attachedLocal = { x: 1, y: 0, z: 0, rotY: 0 }
    scene.entities.push(rider)

    const ev = new ShotEvaluator(scene, shot)
    const st = ev.evaluate(0)
    const r = st.entities.find((e) => e.entityId === rider.id)!
    expect(r.position.x).toBeCloseTo(0, 4)
    expect(r.position.z).toBeCloseTo(-1, 4)
    expect(r.heading).toBeCloseTo(Math.PI / 2, 5)
  })

  it('chains settle: rider on cart married to a truck', () => {
    const { scene, shot, carId } = movingVehicleFixture()
    const cart = createEntity('prim.cube', 'Cart', { x: 0, y: 0, z: 1 })
    cart.attachedTo = carId
    cart.attachedLocal = { x: 0, y: 0, z: 1, rotY: 0 }
    scene.entities.push(cart)
    const rider = createEntity('person.man', 'Rider', { x: 0, y: 1, z: 1 })
    rider.attachedTo = cart.id
    rider.attachedLocal = { x: 0, y: 1, z: 0, rotY: 0 }
    scene.entities.push(rider)

    const ev = new ShotEvaluator(scene, shot)
    const mid = ev.evaluate(2)
    const car = mid.entities.find((e) => e.entityId === carId)!
    const r = mid.entities.find((e) => e.entityId === rider.id)!
    expect(r.position.z).toBeCloseTo(car.position.z + 1, 2)
    expect(r.position.y).toBeCloseTo(1, 3)
  })

  it('an attached entity with its own marks ignores the marriage', () => {
    const { scene, shot, carId } = movingVehicleFixture()
    const walker = createEntity('person.man', 'Walker', { x: 5, y: 0, z: 5 })
    walker.attachedTo = carId
    walker.attachedLocal = { x: 0, y: 0, z: 0, rotY: 0 }
    scene.entities.push(walker)
    const w1 = createActorMark({ x: 5, y: 0, z: 5 }, 0, 'walk')
    const w2 = createActorMark({ x: 5, y: 0, z: 1 }, 4, 'walk')
    scene.blocking[0]!.tracks.push({ entityId: walker.id, marks: [w1, w2] })

    const ev = new ShotEvaluator(scene, shot)
    const mid = ev.evaluate(2)
    const w = mid.entities.find((e) => e.entityId === walker.id)!
    // Follows its own track (x stays 5), not the car (which is at x 0).
    expect(w.position.x).toBeCloseTo(5, 2)
  })
})
