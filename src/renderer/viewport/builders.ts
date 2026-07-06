/**
 * Procedural grey-box builders for the Blockout viewport.
 *
 * Every ASSET_CATALOG id maps to a low-poly MeshLambertMaterial group here,
 * plus mark/label sprites. Conventions:
 *   - Origin at ground (y=0), +Y up, FORWARD IS -Z (models face -Z).
 *   - Real-world scale in meters (heights from the asset catalog).
 *   - Deterministic: no Math.random(); animate() is a pure function of AnimInput.
 */

import * as THREE from 'three'
import type { GaitId } from '@engine/types'
import { assetSpec } from '@engine/assets'

export interface AnimInput {
  gait: GaitId
  /** Gait cycle fraction [0..1) — drives limb swing. */
  phase: number
  /** Current speed m/s. */
  speed: number
  /** Meters travelled since shot start — drives wheel rotation. */
  distance: number
  /** Shot time in seconds — for idle motions (gesture sway, club lights). */
  time: number
  /**
   * Per-joint pose offsets in radians, applied AFTER the gait pose (people
   * only). Keys: shoulderLX/RX (arm forward/up, negative raises), shoulderLZ/RZ
   * (arm out to the side), elbowL/R (bend), hipLX/RX (leg forward/back),
   * kneeL/R (bend), torsoX (lean), torsoY (twist), headX (nod), headY (turn).
   */
  overrides?: Record<string, number>
}

export interface BuiltAsset {
  group: THREE.Group
  /** Standing height in meters (from the catalog spec). */
  height: number
  /** Present for things that move/animate; called every frame. MUST be deterministic — a pure function of AnimInput, no internal accumulating state, no Math.random at animation time. */
  animate?: (input: AnimInput) => void
  /** Tint all meshes toward a hex color (label color), or restore original when null. */
  setTint: (color: string | null) => void
}

// ---------------------------------------------------------------------------
// Materials & helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2
const BASE_GREY = 0x8a8a92

/** Meshes carry their original color so setTint can restore it. */
interface TintUserData {
  origColor?: number
}

function mat(color: number): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color })
}

/** Box mesh centered on its own origin, shadow-enabled, tint-aware. */
function box(w: number, h: number, d: number, color = BASE_GREY): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  m.castShadow = true
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = color
  return m
}

function cyl(rt: number, rb: number, h: number, color = BASE_GREY, seg = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color))
  m.castShadow = true
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = color
  return m
}

function sphere(r: number, color = BASE_GREY, seg = 12): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat(color))
  m.castShadow = true
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = color
  return m
}

function capsule(r: number, len: number, color = BASE_GREY): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 8), mat(color))
  m.castShadow = true
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = color
  return m
}

/** Ground plane: receives shadows only, never casts. */
function ground(w: number, d: number, color: number, y = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color))
  m.rotation.x = -Math.PI / 2
  m.position.y = y
  m.castShadow = false
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = color
  return m
}

/** Wheel: a cylinder rotated to spin around X (axle along X). */
function wheel(radius: number, width: number, color = 0x2c2c30): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 14), mat(color))
  m.rotation.z = Math.PI / 2
  m.castShadow = true
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = color
  m.name = 'wheel'
  return m
}

function grp(x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

/** Build a setTint closure that walks all mesh materials in `root`. */
function makeSetTint(root: THREE.Object3D): (color: string | null) => void {
  const tintColor = new THREE.Color()
  return (color: string | null) => {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!(mesh.isMesh ?? false)) return
      const material = mesh.material
      // Only tint standard lit/basic materials that carry a stored original.
      const ud = mesh.userData as TintUserData
      if (ud.origColor === undefined) return
      const applyTo = (mm: THREE.Material) => {
        const cm = mm as THREE.MeshLambertMaterial
        if (!cm.color) return
        if (color === null) {
          cm.color.setHex(ud.origColor as number)
        } else {
          tintColor.set(color)
          cm.color.setHex(ud.origColor as number).lerp(tintColor, 0.65)
        }
      }
      if (Array.isArray(material)) material.forEach(applyTo)
      else if (material) applyTo(material)
    })
  }
}

function numParam(params: Record<string, number | string> | undefined, key: string, def: number): number {
  const v = params?.[key]
  return typeof v === 'number' ? v : def
}

// ---------------------------------------------------------------------------
// PERSON — articulated capsule mannequin
// ---------------------------------------------------------------------------

interface PersonJoints {
  root: THREE.Group // child of group; we tip THIS for lie/fall, not the group
  torso: THREE.Group
  head: THREE.Group
  hipL: THREE.Group
  hipR: THREE.Group
  kneeL: THREE.Group
  kneeR: THREE.Group
  shoulderL: THREE.Group
  shoulderR: THREE.Group
  elbowL: THREE.Group
  elbowR: THREE.Group
  legLen: number
  scale: number
  baseLean: number // constant forward lean (elderly)
}

function buildPerson(assetId: string, params?: Record<string, number | string>): BuiltAsset {
  const spec = assetSpec(assetId)
  const hMul = Math.min(1.2, Math.max(0.8, numParam(params, 'height', 1)))
  const buildMul = Math.min(1.3, Math.max(0.8, numParam(params, 'build', 1)))
  const H = spec.height * hMul
  const s = H / 1.78 // normalize proportions to a 1.78m reference
  const w = buildMul

  const legLen = H * 0.47
  const headR = H * 0.13 * 0.5
  const torsoLen = H - legLen - headR * 2
  const bodyW = 0.34 * s * w

  const group = new THREE.Group()
  group.name = assetId

  const root = grp(0, 0, 0)
  group.add(root)

  // Pelvis sits at top of legs.
  const pelvisY = legLen
  const pelvis = grp(0, pelvisY, 0)
  root.add(pelvis)

  const pelvisMesh = box(bodyW, 0.18 * s, 0.2 * s, 0x83838b)
  pelvisMesh.position.y = 0.02 * s
  pelvis.add(pelvisMesh)

  // Torso pivots at pelvis, extends up.
  const torso = grp(0, 0.08 * s, 0)
  pelvis.add(torso)
  const torsoMesh = capsule(bodyW * 0.5, torsoLen * 0.7, 0x8f8f97)
  torsoMesh.position.y = torsoLen * 0.5
  torso.add(torsoMesh)

  // Neck + head.
  const head = grp(0, torsoLen, 0)
  torso.add(head)
  const neck = cyl(0.05 * s, 0.05 * s, 0.08 * s, 0x83838b)
  neck.position.y = 0.04 * s
  head.add(neck)
  const headMesh = sphere(headR, 0x94949c)
  headMesh.position.y = headR + 0.06 * s
  head.add(headMesh)

  // Arms — shoulders at top of torso.
  const shoulderY = torsoLen * 0.92
  const armR = 0.055 * s * w
  const upperArmLen = torsoLen * 0.5
  const lowerArmLen = torsoLen * 0.48

  const mkArm = (side: number) => {
    const shoulder = grp(side * bodyW * 0.55, shoulderY, 0)
    torso.add(shoulder)
    const upper = capsule(armR, upperArmLen * 0.7, 0x88888f)
    upper.position.y = -upperArmLen * 0.5
    shoulder.add(upper)
    const elbow = grp(0, -upperArmLen, 0)
    shoulder.add(elbow)
    const lower = capsule(armR * 0.9, lowerArmLen * 0.7, 0x8c8c94)
    lower.position.y = -lowerArmLen * 0.5
    elbow.add(lower)
    return { shoulder, elbow }
  }
  const armL = mkArm(-1)
  const armR2 = mkArm(1)

  // Legs — hips at pelvis.
  const legR = 0.075 * s * w
  const upperLegLen = legLen * 0.52
  const lowerLegLen = legLen * 0.48

  const mkLeg = (side: number) => {
    const hip = grp(side * bodyW * 0.28, 0, 0)
    pelvis.add(hip)
    const upper = capsule(legR, upperLegLen * 0.7, 0x86868e)
    upper.position.y = -upperLegLen * 0.5
    hip.add(upper)
    const knee = grp(0, -upperLegLen, 0)
    hip.add(knee)
    const lower = capsule(legR * 0.85, lowerLegLen * 0.7, 0x8a8a92)
    lower.position.y = -lowerLegLen * 0.5
    knee.add(lower)
    // Foot.
    const foot = box(legR * 2, 0.06 * s, 0.22 * s, 0x6f6f76)
    foot.position.set(0, -lowerLegLen + 0.03 * s, -0.05 * s)
    knee.add(foot)
    return { hip, knee }
  }
  const legL = mkLeg(-1)
  const legR3 = mkLeg(1)

  const baseLean = assetId === 'person.elderly' ? 0.18 : 0

  const j: PersonJoints = {
    root,
    torso,
    head,
    hipL: legL.hip,
    hipR: legR3.hip,
    kneeL: legL.knee,
    kneeR: legR3.knee,
    shoulderL: armL.shoulder,
    shoulderR: armR2.shoulder,
    elbowL: armL.elbow,
    elbowR: armR2.elbow,
    legLen,
    scale: s,
    baseLean
  }

  const setTint = makeSetTint(group)
  const animate = (input: AnimInput) => animatePerson(j, input)
  // Prime a neutral pose.
  animate({ gait: 'stand', phase: 0, speed: 0, distance: 0, time: 0 })

  return { group, height: H, animate, setTint }
}

function resetPersonPose(j: PersonJoints): void {
  j.root.rotation.set(0, 0, 0)
  j.root.position.set(0, 0, 0)
  j.torso.rotation.set(0, 0, 0)
  j.head.rotation.set(0, 0, 0)
  j.hipL.rotation.set(0, 0, 0)
  j.hipR.rotation.set(0, 0, 0)
  j.kneeL.rotation.set(0, 0, 0)
  j.kneeR.rotation.set(0, 0, 0)
  j.shoulderL.rotation.set(0, 0, 0)
  j.shoulderR.rotation.set(0, 0, 0)
  j.elbowL.rotation.set(0, 0, 0)
  j.elbowR.rotation.set(0, 0, 0)
}

function animatePerson(j: PersonJoints, input: AnimInput): void {
  resetPersonPose(j)
  const t = input.time
  const p = input.phase
  const swing = Math.sin(p * TAU)
  j.torso.rotation.x = j.baseLean

  switch (input.gait) {
    case 'stand':
    case 'gesture': {
      // Neutral with tiny breathing bob.
      j.root.position.y = Math.sin(t * 1.5) * 0.005
      if (input.gait === 'gesture') {
        // One forearm raised, gently waving.
        j.shoulderR.rotation.x = -2.3
        j.elbowR.rotation.z = Math.sin(t * 2) * 0.3
        j.elbowR.rotation.x = -0.4
      }
      break
    }
    case 'walk':
    case 'jog':
    case 'run': {
      const amp = input.gait === 'walk' ? 0.5 : input.gait === 'jog' ? 0.8 : 1.1
      const bobAmp = input.gait === 'walk' ? 0.02 : input.gait === 'jog' ? 0.04 : 0.06
      const legAngle = swing * amp
      j.hipL.rotation.x = legAngle
      j.hipR.rotation.x = -legAngle
      // Opposite arms counter-swing.
      j.shoulderL.rotation.x = -legAngle * 0.8
      j.shoulderR.rotation.x = legAngle * 0.8
      // Lower legs bend on the back-swing.
      j.kneeL.rotation.x = -Math.max(0, -Math.sin(p * TAU)) * 0.8
      j.kneeR.rotation.x = -Math.max(0, -Math.sin(p * TAU + Math.PI)) * 0.8
      j.elbowL.rotation.x = -0.3
      j.elbowR.rotation.x = -0.3
      j.root.position.y = Math.abs(swing) * bobAmp
      if (input.gait === 'run') j.torso.rotation.x = j.baseLean + 0.15
      break
    }
    case 'crouch': {
      const drop = j.legLen * 0.3
      j.root.position.y = -drop
      j.hipL.rotation.x = 0.9
      j.hipR.rotation.x = 0.9
      j.kneeL.rotation.x = -1.4
      j.kneeR.rotation.x = -1.4
      j.torso.rotation.x = j.baseLean + 0.3
      if (input.speed > 0) {
        const legAngle = swing * 0.25
        j.hipL.rotation.x += legAngle
        j.hipR.rotation.x -= legAngle
      }
      break
    }
    case 'sit': {
      const chairH = 0.45 * j.scale
      j.root.position.y = -(j.legLen - chairH)
      // Thighs horizontal, lower legs vertical.
      j.hipL.rotation.x = -Math.PI / 2
      j.hipR.rotation.x = -Math.PI / 2
      j.kneeL.rotation.x = Math.PI / 2
      j.kneeR.rotation.x = Math.PI / 2
      j.torso.rotation.x = j.baseLean
      break
    }
    case 'lie': {
      // Tip the whole body flat; pelvis raised so body rests on ground.
      j.root.rotation.x = -Math.PI / 2
      j.root.position.y = 0.18 * j.scale
      j.root.position.z = j.legLen * 0.5
      break
    }
    case 'fall': {
      // Fallen backward, arms up.
      j.root.rotation.x = 1.4
      j.root.position.y = 0.25 * j.scale
      j.root.position.z = -j.legLen * 0.3
      j.shoulderL.rotation.x = -2.2
      j.shoulderR.rotation.x = -2.2
      j.hipL.rotation.x = 0.3
      j.hipR.rotation.x = -0.2
      break
    }
  }

  // Manual pose offsets on top of the gait (fight/dance blocking).
  const ov = input.overrides
  if (ov) {
    j.shoulderL.rotation.x += ov.shoulderLX ?? 0
    j.shoulderR.rotation.x += ov.shoulderRX ?? 0
    j.shoulderL.rotation.z += ov.shoulderLZ ?? 0
    j.shoulderR.rotation.z -= ov.shoulderRZ ?? 0
    j.elbowL.rotation.x -= ov.elbowL ?? 0
    j.elbowR.rotation.x -= ov.elbowR ?? 0
    j.hipL.rotation.x += ov.hipLX ?? 0
    j.hipR.rotation.x += ov.hipRX ?? 0
    j.kneeL.rotation.x -= ov.kneeL ?? 0
    j.kneeR.rotation.x -= ov.kneeR ?? 0
    j.torso.rotation.x += ov.torsoX ?? 0
    j.torso.rotation.y += ov.torsoY ?? 0
    j.head.rotation.x += ov.headX ?? 0
    j.head.rotation.y += ov.headY ?? 0
  }
}

// ---------------------------------------------------------------------------
// ANIMALS
// ---------------------------------------------------------------------------

interface QuadJoints {
  legs: THREE.Group[] // FL, FR, BL, BR
  head: THREE.Group
  tail: THREE.Group
}

function buildQuadruped(assetId: string): BuiltAsset {
  const spec = assetSpec(assetId)
  const H = spec.height
  const s = H / 0.6
  // Body length proportional to height.
  const bodyLen = H * 1.7
  const bodyR = H * 0.28
  const legH = H * 0.55

  const group = new THREE.Group()
  group.name = assetId

  const bodyY = legH
  const body = capsule(bodyR, bodyLen - bodyR * 2, 0x87878f)
  body.rotation.x = Math.PI / 2
  body.position.set(0, bodyY, 0)
  group.add(body)

  // Legs — hip pivots at body underside, forward is -Z.
  const legR = H * 0.08
  const legZFront = -bodyLen * 0.32
  const legZBack = bodyLen * 0.32
  const legX = bodyR * 0.7
  const legs: THREE.Group[] = []
  const mkLeg = (x: number, z: number) => {
    const hip = grp(x, bodyY, z)
    group.add(hip)
    const seg = capsule(legR, legH * 0.6, 0x82828a)
    seg.position.y = -legH * 0.5
    hip.add(seg)
    legs.push(hip)
    return hip
  }
  mkLeg(-legX, legZFront) // FL
  mkLeg(legX, legZFront) // FR
  mkLeg(-legX, legZBack) // BL
  mkLeg(legX, legZBack) // BR

  // Neck + head at front (-Z).
  const neckPivot = grp(0, bodyY + bodyR * 0.3, legZFront - bodyR * 0.4)
  group.add(neckPivot)
  const neck = capsule(bodyR * 0.5, H * 0.4, 0x84848c)
  neck.rotation.x = 0.6
  neck.position.set(0, H * 0.2, -H * 0.12)
  neckPivot.add(neck)
  const head = grp(0, H * 0.42, -H * 0.28)
  neckPivot.add(head)
  const headMesh = box(bodyR * 0.9, bodyR * 0.85, bodyR * 1.2, 0x8f8f97)
  head.add(headMesh)
  const snout = box(bodyR * 0.5, bodyR * 0.4, bodyR * 0.5, 0x86868e)
  snout.position.set(0, -bodyR * 0.1, -bodyR * 0.85)
  head.add(snout)

  // Tail at back (+Z).
  const tail = grp(0, bodyY + bodyR * 0.4, legZBack + bodyR * 0.3)
  group.add(tail)
  const tailMesh = capsule(bodyR * 0.22, H * 0.5, 0x82828a)
  tailMesh.rotation.x = -0.8
  tailMesh.position.set(0, H * 0.1, H * 0.18)
  tail.add(tailMesh)

  void s
  const j: QuadJoints = { legs, head: neckPivot, tail }
  const setTint = makeSetTint(group)
  const animate = (input: AnimInput) => {
    const swing = Math.sin(input.phase * TAU)
    const amp = Math.min(1, 0.2 + input.speed * 0.15)
    // Diagonal pairs: FL+BR together, FR+BL opposite.
    const legList = j.legs
    if (legList[0]) legList[0].rotation.x = swing * amp
    if (legList[3]) legList[3].rotation.x = swing * amp
    if (legList[1]) legList[1].rotation.x = -swing * amp
    if (legList[2]) legList[2].rotation.x = -swing * amp
    if (input.speed <= 0.01) {
      // Idle head bob when standing.
      j.head.rotation.x = Math.sin(input.time * 1.2) * 0.08
    } else {
      j.head.rotation.x = 0
    }
    j.tail.rotation.x = Math.sin(input.time * 3 + input.phase * TAU) * 0.15
  }
  animate({ gait: 'stand', phase: 0, speed: 0, distance: 0, time: 0 })

  return { group, height: H, animate, setTint }
}

function buildBird(assetId: string): BuiltAsset {
  const spec = assetSpec(assetId)
  const H = spec.height
  const bodyR = H * 0.35

  const group = new THREE.Group()
  group.name = assetId

  const core = grp(0, H, 0)
  group.add(core)
  const body = capsule(bodyR, bodyR * 1.4, 0x8b8b93)
  body.rotation.z = Math.PI / 2
  core.add(body)
  const head = sphere(bodyR * 0.7, 0x94949c)
  head.position.set(0, bodyR * 0.4, -bodyR * 1.1)
  core.add(head)
  const beak = cyl(0.001, bodyR * 0.2, bodyR * 0.5, 0xc0a050, 6)
  beak.rotation.x = -Math.PI / 2
  beak.position.set(0, bodyR * 0.35, -bodyR * 1.6)
  core.add(beak)

  const wingL = grp(-bodyR * 0.6, bodyR * 0.2, 0)
  const wingR = grp(bodyR * 0.6, bodyR * 0.2, 0)
  core.add(wingL)
  core.add(wingR)
  const mkWing = (side: number, g: THREE.Group) => {
    const w = box(bodyR * 2, bodyR * 0.1, bodyR * 1.2, 0x86868e)
    w.position.x = side * bodyR
    g.add(w)
  }
  mkWing(-1, wingL)
  mkWing(1, wingR)

  const setTint = makeSetTint(group)
  const animate = (input: AnimInput) => {
    const moving = input.speed > 0.1
    // Fly at height when moving, otherwise perch on ground.
    core.position.y = moving ? H : bodyR
    if (input.speed > 0) {
      const flap = Math.sin(input.time * 10) * 0.9
      wingL.rotation.z = flap
      wingR.rotation.z = -flap
    } else {
      // Glide.
      wingL.rotation.z = 0.15
      wingR.rotation.z = -0.15
    }
  }
  animate({ gait: 'stand', phase: 0, speed: 0, distance: 0, time: 0 })

  return { group, height: H, animate, setTint }
}

// ---------------------------------------------------------------------------
// VEHICLES
// ---------------------------------------------------------------------------

/** Attach wheel-spin animate to a group with named 'wheel' meshes. */
function wheeledAnimate(group: THREE.Group, radius: number): (input: AnimInput) => void {
  const wheels: THREE.Mesh[] = []
  group.traverse((o) => {
    if (o.name === 'wheel') wheels.push(o as THREE.Mesh)
  })
  return (input: AnimInput) => {
    const rot = input.distance / radius
    for (const wm of wheels) {
      // Wheel is rotated Z=90°; spin lives on its local X-equivalent via rotation.x on a holder is cleaner,
      // but we spin the mesh around its axle (local Y before the Z rotation → world X). Set rotation order:
      wm.rotation.x = rot
    }
  }
}

function buildSedan(): BuiltAsset {
  const group = new THREE.Group()
  const L = 4.6
  const W = 1.85
  const bodyH = 0.7
  const wr = 0.34
  const lower = box(W, bodyH, L, 0x7f7f87)
  lower.position.y = wr + bodyH * 0.5
  group.add(lower)
  const cabin = box(W * 0.9, 0.55, L * 0.5, 0x8d8d95)
  cabin.position.set(0, wr + bodyH + 0.28, -L * 0.05)
  group.add(cabin)
  addWheels(group, W, L, wr, 0.25)
  return finalizeWheeled(group, 1.45, wr)
}

function buildSUV(): BuiltAsset {
  const group = new THREE.Group()
  const L = 4.8
  const W = 1.95
  const bodyH = 1.15
  const wr = 0.38
  const body = box(W, bodyH, L, 0x7f7f87)
  body.position.y = wr + bodyH * 0.5
  group.add(body)
  const cabin = box(W * 0.94, 0.5, L * 0.55, 0x8d8d95)
  cabin.position.set(0, wr + bodyH + 0.1, -L * 0.02)
  group.add(cabin)
  addWheels(group, W, L, wr, 0.26)
  return finalizeWheeled(group, 1.8, wr)
}

function buildPickup(): BuiltAsset {
  const group = new THREE.Group()
  const L = 5.3
  const W = 1.95
  const wr = 0.4
  const chassisH = 0.5
  const chassis = box(W, chassisH, L, 0x76767e)
  chassis.position.y = wr + chassisH * 0.5
  group.add(chassis)
  const cab = box(W, 0.85, L * 0.4, 0x8d8d95)
  cab.position.set(0, wr + chassisH + 0.42, -L * 0.22)
  group.add(cab)
  // Open bed walls (back = +Z).
  const bedH = 0.45
  const bedFloorY = wr + chassisH
  const sideL = box(0.08, bedH, L * 0.5, 0x808088)
  sideL.position.set(-W * 0.5 + 0.04, bedFloorY + bedH * 0.5, L * 0.2)
  group.add(sideL)
  const sideR = sideL.clone()
  sideR.position.x = W * 0.5 - 0.04
  group.add(sideR)
  const tail = box(W, bedH, 0.08, 0x808088)
  tail.position.set(0, bedFloorY + bedH * 0.5, L * 0.45)
  group.add(tail)
  addWheels(group, W, L, wr, 0.25)
  return finalizeWheeled(group, 1.9, wr)
}

function buildVan(): BuiltAsset {
  const group = new THREE.Group()
  const L = 5.4
  const W = 2.0
  const bodyH = 1.9
  const wr = 0.38
  const body = box(W, bodyH, L, 0x84848c)
  body.position.y = wr + bodyH * 0.5
  group.add(body)
  // Sloped nose hint.
  const nose = box(W, 0.7, L * 0.15, 0x7c7c84)
  nose.position.set(0, wr + 0.35, -L * 0.5 + L * 0.075)
  group.add(nose)
  addWheels(group, W, L, wr, 0.28)
  return finalizeWheeled(group, 2.2, wr)
}

function buildBus(): BuiltAsset {
  const group = new THREE.Group()
  const L = 12
  const W = 2.5
  const bodyH = 2.7
  const wr = 0.5
  const body = box(W, bodyH, L, 0x83838b)
  body.position.y = wr + bodyH * 0.5
  group.add(body)
  // Inset window band.
  const band = box(W + 0.02, 0.7, L * 0.9, 0x5a5a64)
  band.position.set(0, wr + bodyH * 0.62, 0)
  group.add(band)
  addWheels(group, W, L, wr, 0.35, [-L * 0.35, L * 0.32])
  return finalizeWheeled(group, 3.2, wr)
}

function buildTruck(): BuiltAsset {
  const group = new THREE.Group()
  const wr = 0.5
  // Tractor at front (-Z).
  const tractor = box(2.4, 2.6, 5, 0x81818a)
  tractor.position.set(0, wr + 1.3, -3.5)
  group.add(tractor)
  const stack = cyl(0.08, 0.08, 1.0, 0x50505a)
  stack.position.set(-1.0, wr + 2.6 + 0.5, -4.5)
  group.add(stack)
  // Trailer.
  const trailer = box(2.5, 2.8, 9, 0x8a8a92)
  trailer.position.set(0, wr + 1.6, 2.5)
  group.add(trailer)
  addWheels(group, 2.4, 5, wr, 0.4, [-4.2])
  addWheels(group, 2.5, 9, wr, 0.4, [4.5, 6.2])
  return finalizeWheeled(group, 3.8, wr)
}

function buildTank(): BuiltAsset {
  const group = new THREE.Group()
  const L = 7
  const W = 3.4
  // Treads as boxes.
  const treadH = 0.9
  const treadL = box(0.7, treadH, L, 0x4c4c54)
  treadL.position.set(-W * 0.5 + 0.35, treadH * 0.5, 0)
  group.add(treadL)
  const treadR = treadL.clone()
  treadR.position.x = W * 0.5 - 0.35
  group.add(treadR)
  // Hull.
  const hull = box(W - 0.4, 0.8, L * 0.9, 0x77777f)
  hull.position.y = treadH + 0.4
  group.add(hull)
  // Turret.
  const turret = cyl(1.1, 1.3, 0.7, 0x82828a, 10)
  turret.position.set(0, treadH + 0.8 + 0.35, 0.3)
  group.add(turret)
  // Barrel pointing forward (-Z).
  const barrel = cyl(0.12, 0.12, 3.2, 0x60606a)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, treadH + 1.15, -1.8)
  group.add(barrel)
  return finalizeStatic(group, 2.4)
}

function buildTrain(): BuiltAsset {
  const group = new THREE.Group()
  const L = 20
  const W = 3.0
  const bodyH = 3.0
  const undercarriage = box(W, 0.5, L, 0x55555f)
  undercarriage.position.y = 0.4
  group.add(undercarriage)
  const body = box(W, bodyH, L * 0.98, 0x85858d)
  body.position.y = 0.65 + bodyH * 0.5
  group.add(body)
  // Slight roof curve via a low, wide box on top.
  const roof = box(W * 0.9, 0.35, L * 0.96, 0x8f8f97)
  roof.position.y = 0.65 + bodyH + 0.1
  group.add(roof)
  const band = box(W + 0.02, 0.7, L * 0.9, 0x5a5a64)
  band.position.y = 0.65 + bodyH * 0.62
  group.add(band)
  // Rail wheels.
  const wr = 0.45
  addWheels(group, W, L, wr, 0.35, [-L * 0.35, L * 0.35], 0.4)
  return finalizeWheeled(group, 3.6, wr)
}

function buildMotorcycle(): BuiltAsset {
  const group = new THREE.Group()
  const wr = 0.33
  const L = 2.0
  const frame = box(0.25, 0.4, L * 0.7, 0x7c7c84)
  frame.position.set(0, wr + 0.35, 0)
  group.add(frame)
  const tank = box(0.3, 0.3, 0.6, 0x8a8a92)
  tank.position.set(0, wr + 0.6, -0.2)
  group.add(tank)
  const seat = box(0.28, 0.12, 0.6, 0x50505a)
  seat.position.set(0, wr + 0.62, 0.4)
  group.add(seat)
  // Handlebar.
  const bar = box(0.55, 0.05, 0.05, 0x60606a)
  bar.position.set(0, wr + 0.75, -L * 0.5 + 0.1)
  group.add(bar)
  const fw = wheel(wr, 0.12)
  fw.position.set(0, wr, -L * 0.5)
  group.add(fw)
  const bw = wheel(wr, 0.14)
  bw.position.set(0, wr, L * 0.5)
  group.add(bw)
  return finalizeWheeled(group, 1.3, wr)
}

function buildBicycle(): BuiltAsset {
  const group = new THREE.Group()
  const wr = 0.34
  const L = 1.7
  const bar = box(0.05, 0.05, L * 0.8, 0x77777f)
  bar.position.set(0, wr + 0.55, 0)
  group.add(bar)
  const seatPost = box(0.04, 0.4, 0.04, 0x77777f)
  seatPost.position.set(0, wr + 0.55, L * 0.35)
  group.add(seatPost)
  const seat = box(0.12, 0.06, 0.25, 0x50505a)
  seat.position.set(0, wr + 0.78, L * 0.35)
  group.add(seat)
  const handle = box(0.4, 0.05, 0.05, 0x60606a)
  handle.position.set(0, wr + 0.75, -L * 0.4)
  group.add(handle)
  const fw = wheel(wr, 0.05, 0x3a3a42)
  fw.position.set(0, wr, -L * 0.45)
  group.add(fw)
  const bw = wheel(wr, 0.05, 0x3a3a42)
  bw.position.set(0, wr, L * 0.45)
  group.add(bw)
  return finalizeWheeled(group, 1.1, wr)
}

function buildPlane(): BuiltAsset {
  const group = new THREE.Group()
  const fuseLen = 20
  const fuseR = 1.4
  const yLift = 2.5
  const fuse = capsule(fuseR, fuseLen - fuseR * 2, 0x8b8b93)
  fuse.rotation.x = Math.PI / 2
  fuse.position.y = yLift
  group.add(fuse)
  // Wings along X.
  const wing = box(18, 0.4, 3, 0x83838b)
  wing.position.set(0, yLift, 1)
  group.add(wing)
  // Tail fin (vertical).
  const fin = box(0.3, 2.5, 2, 0x85858d)
  fin.position.set(0, yLift + 1.4, fuseLen * 0.42)
  group.add(fin)
  const hstab = box(6, 0.3, 1.6, 0x83838b)
  hstab.position.set(0, yLift + 0.3, fuseLen * 0.44)
  group.add(hstab)
  return finalizeStatic(group, 5.5)
}

function buildBoat(): BuiltAsset {
  const group = new THREE.Group()
  const L = 6
  const W = 2.2
  const hullH = 1.0
  const hull = box(W, hullH, L, 0x7d7d85)
  hull.position.y = hullH * 0.5
  group.add(hull)
  // Tapered bow hint (-Z).
  const bow = box(W * 0.5, hullH, 1.2, 0x7d7d85)
  bow.position.set(0, hullH * 0.5, -L * 0.5 - 0.3)
  bow.rotation.y = 0
  group.add(bow)
  const cabin = box(W * 0.8, 0.9, L * 0.35, 0x8d8d95)
  cabin.position.set(0, hullH + 0.45, L * 0.05)
  group.add(cabin)
  return finalizeStatic(group, 2.0)
}

/**
 * Add 4 (or more) wheels. zPairs optionally overrides axle Z positions;
 * default two axles near front/back. Extra z entries add more axles.
 */
function addWheels(
  group: THREE.Group,
  W: number,
  L: number,
  radius: number,
  width: number,
  zAxles?: number[],
  inset = 0.0
): void {
  const axles = zAxles ?? [-L * 0.32, L * 0.32]
  const x = W * 0.5 - width * 0.5 - inset
  for (const z of axles) {
    const l = wheel(radius, width)
    l.position.set(-x, radius, z)
    group.add(l)
    const r = wheel(radius, width)
    r.position.set(x, radius, z)
    group.add(r)
  }
}

function finalizeWheeled(group: THREE.Group, height: number, wheelRadius: number): BuiltAsset {
  const setTint = makeSetTint(group)
  const animate = wheeledAnimate(group, wheelRadius)
  return { group, height, animate, setTint }
}

function finalizeStatic(group: THREE.Group, height: number): BuiltAsset {
  const setTint = makeSetTint(group)
  return { group, height, setTint }
}

// ---------------------------------------------------------------------------
// FURNITURE
// ---------------------------------------------------------------------------

function buildFurniture(assetId: string): BuiltAsset {
  const group = new THREE.Group()
  group.name = assetId
  let height = 0.8

  switch (assetId) {
    case 'furniture.bed': {
      height = 0.6
      const frame = box(1.6, 0.35, 2.0, 0x7a7a82)
      frame.position.y = 0.175
      group.add(frame)
      const mattress = box(1.5, 0.2, 1.9, 0x9a9aa2)
      mattress.position.y = 0.45
      group.add(mattress)
      const pillow = box(1.3, 0.12, 0.4, 0xa4a4ac)
      pillow.position.set(0, 0.6, -0.7)
      group.add(pillow)
      break
    }
    case 'furniture.couch': {
      height = 0.85
      const base = box(2.2, 0.4, 0.9, 0x82828a)
      base.position.y = 0.2
      group.add(base)
      const backrest = box(2.2, 0.5, 0.2, 0x86868e)
      backrest.position.set(0, 0.55, 0.35)
      group.add(backrest)
      const seatCush = box(2.0, 0.15, 0.7, 0x92929a)
      seatCush.position.set(0, 0.47, -0.05)
      group.add(seatCush)
      const armL = box(0.2, 0.5, 0.9, 0x7c7c84)
      armL.position.set(-1.0, 0.45, 0)
      group.add(armL)
      const armR = armL.clone()
      armR.position.x = 1.0
      group.add(armR)
      break
    }
    case 'furniture.armchair': {
      height = 0.9
      const base = box(0.8, 0.4, 0.8, 0x82828a)
      base.position.y = 0.2
      group.add(base)
      const seat = box(0.7, 0.15, 0.7, 0x92929a)
      seat.position.y = 0.47
      group.add(seat)
      const backrest = box(0.8, 0.55, 0.18, 0x86868e)
      backrest.position.set(0, 0.62, 0.31)
      group.add(backrest)
      const armL = box(0.15, 0.4, 0.8, 0x7c7c84)
      armL.position.set(-0.4, 0.5, 0)
      group.add(armL)
      const armR = armL.clone()
      armR.position.x = 0.4
      group.add(armR)
      break
    }
    case 'furniture.diningTable': {
      height = 0.76
      tableTop(group, 1.8, 0.9, 0.76, 0.05)
      tableLegs(group, 1.8, 0.9, 0.76)
      break
    }
    case 'furniture.kitchenTable': {
      height = 0.9
      tableTop(group, 1.2, 0.8, 0.9, 0.05)
      tableLegs(group, 1.2, 0.8, 0.9)
      break
    }
    case 'furniture.desk': {
      height = 0.75
      tableTop(group, 1.4, 0.7, 0.75, 0.05)
      // Modesty panel + side panels.
      const modesty = box(1.3, 0.5, 0.04, 0x7c7c84)
      modesty.position.set(0, 0.45, 0.32)
      group.add(modesty)
      const sideL = box(0.05, 0.72, 0.7, 0x7c7c84)
      sideL.position.set(-0.67, 0.36, 0)
      group.add(sideL)
      const sideR = sideL.clone()
      sideR.position.x = 0.67
      group.add(sideR)
      break
    }
    case 'furniture.sideTable': {
      height = 0.55
      tableTop(group, 0.5, 0.5, 0.55, 0.04)
      tableLegs(group, 0.5, 0.5, 0.55)
      break
    }
    case 'furniture.lamp': {
      height = 1.6
      const baseD = cyl(0.18, 0.2, 0.05, 0x60606a)
      baseD.position.y = 0.025
      group.add(baseD)
      const pole = cyl(0.02, 0.02, 1.4, 0x70707a)
      pole.position.y = 0.7
      group.add(pole)
      const shade = cyl(0.22, 0.12, 0.3, 0xb0b0b8, 14)
      shade.position.y = 1.5
      group.add(shade)
      break
    }
    case 'furniture.chair': {
      height = 0.9
      buildSimpleChair(group)
      break
    }
    case 'furniture.stool': {
      height = 0.65
      const seat = cyl(0.18, 0.18, 0.06, 0x8d8d95)
      seat.position.y = 0.62
      group.add(seat)
      for (const [sx, sz] of [
        [-0.13, -0.13],
        [0.13, -0.13],
        [-0.13, 0.13],
        [0.13, 0.13]
      ] as [number, number][]) {
        const leg = cyl(0.02, 0.02, 0.6, 0x70707a)
        leg.position.set(sx, 0.3, sz)
        group.add(leg)
      }
      break
    }
    case 'furniture.bar': {
      height = 1.1
      const body = box(2.4, 1.1, 0.6, 0x7a7a82)
      body.position.y = 0.55
      group.add(body)
      const top = box(2.5, 0.06, 0.7, 0x9a9aa2)
      top.position.y = 1.1
      group.add(top)
      break
    }
    case 'furniture.counter': {
      height = 0.95
      const body = box(2.0, 0.9, 0.65, 0x7a7a82)
      body.position.y = 0.45
      group.add(body)
      const top = box(2.05, 0.05, 0.7, 0x9a9aa2)
      top.position.y = 0.95
      group.add(top)
      break
    }
    case 'furniture.shelf': {
      height = 1.9
      const sideL = box(0.05, 1.9, 0.5, 0x74747c)
      sideL.position.set(-0.45, 0.95, 0)
      group.add(sideL)
      const sideR = sideL.clone()
      sideR.position.x = 0.45
      group.add(sideR)
      for (let i = 0; i < 5; i++) {
        const shelf = box(0.9, 0.04, 0.5, 0x8a8a92)
        shelf.position.set(0, 0.1 + i * 0.45, 0)
        group.add(shelf)
      }
      break
    }
    case 'furniture.tv': {
      height = 0.75
      const stand = box(0.6, 0.4, 0.35, 0x70707a)
      stand.position.y = 0.2
      group.add(stand)
      const screen = box(1.1, 0.62, 0.06, 0x2a2a30)
      screen.position.y = 0.72
      group.add(screen)
      break
    }
    case 'furniture.tableSetting': {
      height = 0.12
      const surface = grp(0, 0, 0)
      group.add(surface)
      for (const [px, pz] of [
        [-0.3, 0],
        [0.3, 0],
        [0, -0.15]
      ] as [number, number][]) {
        const plate = cyl(0.12, 0.12, 0.02, 0xb0b0b8, 12)
        plate.position.set(px, 0.01, pz)
        surface.add(plate)
        const glass = cyl(0.03, 0.035, 0.1, 0x9a9aa2, 8)
        glass.position.set(px + 0.15, 0.05, pz - 0.1)
        surface.add(glass)
      }
      break
    }
    case 'furniture.door': {
      height = 2.1
      const frameL = box(0.1, 2.1, 0.15, 0x74747c)
      frameL.position.set(-0.45, 1.05, 0)
      group.add(frameL)
      const frameR = frameL.clone()
      frameR.position.x = 0.45
      group.add(frameR)
      const frameTop = box(1.0, 0.12, 0.15, 0x74747c)
      frameTop.position.set(0, 2.04, 0)
      group.add(frameTop)
      const panel = box(0.8, 2.0, 0.06, 0x8a8a92)
      panel.position.set(0, 1.0, 0)
      group.add(panel)
      const knob = sphere(0.04, 0xc0c0c8, 8)
      knob.position.set(0.3, 1.0, 0.05)
      group.add(knob)
      break
    }
    case 'furniture.window': {
      height = 1.4
      const frame = box(1.2, 1.4, 0.12, 0x74747c)
      frame.position.y = 0.7
      group.add(frame)
      const pane = box(1.0, 1.2, 0.06, 0xbcc4cc)
      pane.position.set(0, 0.7, 0.04)
      group.add(pane)
      break
    }
    default: {
      // Unknown furniture id → simple box at spec height.
      const spec = assetSpec(assetId)
      height = spec.height
      const b = box(0.6, height, 0.6)
      b.position.y = height * 0.5
      group.add(b)
    }
  }

  return finalizeStatic(group, height)
}

function tableTop(group: THREE.Group, w: number, d: number, top: number, thick: number): void {
  const t = box(w, thick, d, 0x8d8d95)
  t.position.y = top - thick * 0.5
  group.add(t)
}

function tableLegs(group: THREE.Group, w: number, d: number, top: number): void {
  const lx = w * 0.5 - 0.08
  const lz = d * 0.5 - 0.08
  const legH = top - 0.05
  for (const [sx, sz] of [
    [-lx, -lz],
    [lx, -lz],
    [-lx, lz],
    [lx, lz]
  ] as [number, number][]) {
    const leg = box(0.06, legH, 0.06, 0x70707a)
    leg.position.set(sx, legH * 0.5, sz)
    group.add(leg)
  }
}

function buildSimpleChair(group: THREE.Group): void {
  const seat = box(0.42, 0.06, 0.42, 0x8d8d95)
  seat.position.y = 0.45
  group.add(seat)
  const backrest = box(0.42, 0.45, 0.05, 0x86868e)
  backrest.position.set(0, 0.68, 0.19)
  group.add(backrest)
  const lx = 0.16
  const lz = 0.16
  for (const [sx, sz] of [
    [-lx, -lz],
    [lx, -lz],
    [-lx, lz],
    [lx, lz]
  ] as [number, number][]) {
    const leg = box(0.05, 0.45, 0.05, 0x70707a)
    leg.position.set(sx, 0.225, sz)
    group.add(leg)
  }
}

// ---------------------------------------------------------------------------
// ENVIRONMENTS
// ---------------------------------------------------------------------------

function wallMesh(w: number, h: number, thickness: number, color = 0x9a9aa2): THREE.Mesh {
  return box(w, h, thickness, color)
}

interface EnvResult {
  group: THREE.Group
  height: number
  animate?: (input: AnimInput) => void
}

function buildEnv(assetId: string): BuiltAsset {
  const group = new THREE.Group()
  group.name = assetId
  const spec = assetSpec(assetId)
  let res: EnvResult = { group, height: spec.height }

  switch (assetId) {
    case 'env.houseInterior':
      res = envHouseInterior(group)
      break
    case 'env.houseExterior':
      res = envHouseExterior(group)
      break
    case 'env.cityStreet':
      res = envCityStreet(group)
      break
    case 'env.store':
      res = envStore(group)
      break
    case 'env.nightclub':
      res = envNightclub(group)
      break
    case 'env.office':
      res = envOffice(group)
      break
    case 'env.warehouse':
      res = envWarehouse(group)
      break
    case 'env.carInterior':
      res = envCarInterior(group)
      break
    case 'env.busInterior':
      res = envBusInterior(group)
      break
    case 'env.planeCabin':
      res = envPlaneCabin(group)
      break
    case 'env.field':
      res = envField(group)
      break
    case 'env.desert':
      res = envDesert(group)
      break
    case 'env.parkingLot':
      res = envParkingLot(group)
      break
    case 'env.alley':
      res = envAlley(group)
      break
    case 'env.rooftop':
      res = envRooftop(group)
      break
    default: {
      const b = box(2, spec.height, 2)
      b.position.y = spec.height * 0.5
      group.add(b)
    }
  }

  const setTint = makeSetTint(res.group)
  return { group: res.group, height: res.height, animate: res.animate, setTint }
}

function envHouseInterior(group: THREE.Group): EnvResult {
  const S = 20
  const wallH = 2.7
  const t = 0.15
  group.add(ground(S, S, 0x76767e))
  // Back wall (+Z) and two sides; front (-Z) open for camera.
  const back = wallMesh(S, wallH, t)
  back.position.set(0, wallH * 0.5, S * 0.5)
  group.add(back)
  const left = wallMesh(t, wallH, S)
  left.position.set(-S * 0.5, wallH * 0.5, 0)
  group.add(left)
  const right = left.clone()
  right.position.x = S * 0.5
  group.add(right)
  // 2 window openings on the back wall (frame + lighter inset).
  for (const x of [-4, 4]) {
    const frame = box(1.6, 1.4, 0.16, 0x84848c)
    frame.position.set(x, 1.5, S * 0.5 - 0.01)
    group.add(frame)
    const pane = box(1.3, 1.1, 0.05, 0xbcc4cc)
    pane.position.set(x, 1.5, S * 0.5 - 0.06)
    group.add(pane)
  }
  // Door opening on left wall.
  const door = box(0.1, 2.1, 1.0, 0x6a6a72)
  door.position.set(-S * 0.5 + 0.02, 1.05, -3)
  group.add(door)
  return { group, height: wallH }
}

function envHouseExterior(group: THREE.Group): EnvResult {
  const S = 20
  group.add(ground(S, S, 0x7a8a6e))
  // House block.
  const bodyH = 3.5
  const bw = 8
  const bd = 7
  const body = box(bw, bodyH, bd, 0x8a8a92)
  body.position.y = bodyH * 0.5
  group.add(body)
  // Pitched roof: 2 rotated boxes.
  const roofL = box(bw + 0.6, 0.25, 5, 0x6a5a52)
  roofL.position.set(0, bodyH + 1.2, -1.7)
  roofL.rotation.x = -0.6
  group.add(roofL)
  const roofR = box(bw + 0.6, 0.25, 5, 0x6a5a52)
  roofR.position.set(0, bodyH + 1.2, 1.7)
  roofR.rotation.x = 0.6
  group.add(roofR)
  // Door + windows on front (-Z).
  const door = box(1.0, 2.1, 0.1, 0x5a4a42)
  door.position.set(0, 1.05, -bd * 0.5 - 0.01)
  group.add(door)
  for (const x of [-2.5, 2.5]) {
    const win = box(1.2, 1.2, 0.1, 0xbcc4cc)
    win.position.set(x, 1.7, -bd * 0.5 - 0.01)
    group.add(win)
  }
  // Path.
  const path = box(1.5, 0.02, 6, 0x9a9a9a)
  path.position.set(0, 0.01, -bd * 0.5 - 3)
  path.receiveShadow = true
  path.castShadow = false
  group.add(path)
  return { group, height: 6 }
}

function envCityStreet(group: THREE.Group): EnvResult {
  const S = 30
  group.add(ground(S, S, 0x6e6e74))
  // Asphalt strip down Z.
  const asphalt = box(8, 0.02, S, 0x53545c)
  asphalt.position.y = 0.011
  asphalt.receiveShadow = true
  asphalt.castShadow = false
  group.add(asphalt)
  // Dashed center line.
  for (let z = -S * 0.5 + 1; z < S * 0.5; z += 3) {
    const dash = box(0.2, 0.02, 1.2, 0xd0d060)
    dash.position.set(0, 0.02, z)
    dash.receiveShadow = true
    dash.castShadow = false
    group.add(dash)
  }
  // Raised sidewalks both sides.
  for (const x of [-6, 6]) {
    const sw = box(4, 0.2, S, 0x9a9aa2)
    sw.position.set(x, 0.1, 0)
    group.add(sw)
  }
  // 4–6 building blocks set back, varying heights.
  const heights = [12, 18, 9, 20, 14, 16]
  const zs = [-10, -3, 4, 11, -7, 8]
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const bh = heights[i] ?? 12
    const b = box(6, bh, 5, i % 2 === 0 ? 0x83838b : 0x8c8c94)
    b.position.set(side * 11, bh * 0.5, zs[i] ?? 0)
    group.add(b)
  }
  // 2 streetlight poles with arm.
  for (const [x, z] of [
    [-8.2, -5],
    [8.2, 5]
  ] as [number, number][]) {
    const pole = cyl(0.1, 0.12, 6, 0x55555f)
    pole.position.set(x, 3, z)
    group.add(pole)
    const arm = box(1.6, 0.1, 0.1, 0x55555f)
    arm.position.set(x + (x < 0 ? 0.8 : -0.8), 5.9, z)
    group.add(arm)
  }
  return { group, height: 12 }
}

function envStore(group: THREE.Group): EnvResult {
  const S = 20
  const wallH = 3.5
  const t = 0.15
  group.add(ground(S, S, 0x9a9aa2))
  // 3 walls, front open.
  const back = wallMesh(S, wallH, t)
  back.position.set(0, wallH * 0.5, S * 0.5)
  group.add(back)
  const left = wallMesh(t, wallH, S)
  left.position.set(-S * 0.5, wallH * 0.5, 0)
  group.add(left)
  const right = left.clone()
  right.position.x = S * 0.5
  group.add(right)
  // 4 shelf-aisle rows.
  for (let i = 0; i < 4; i++) {
    const x = -6 + i * 4
    const shelf = box(1.0, 1.8, 12, 0x81818a)
    shelf.position.set(x, 0.9, -1)
    group.add(shelf)
  }
  // Checkout counter.
  const counter = box(3, 1.0, 0.8, 0x7a7a82)
  counter.position.set(0, 0.5, S * 0.5 - 3)
  group.add(counter)
  return { group, height: wallH }
}

function envNightclub(group: THREE.Group): EnvResult {
  const S = 20
  const wallH = 4
  const t = 0.15
  group.add(ground(S, S, 0x25252b))
  const back = wallMesh(S, wallH, t, 0x2c2c32)
  back.position.set(0, wallH * 0.5, S * 0.5)
  group.add(back)
  const left = wallMesh(t, wallH, S, 0x2c2c32)
  left.position.set(-S * 0.5, wallH * 0.5, 0)
  group.add(left)
  const right = left.clone()
  right.position.x = S * 0.5
  group.add(right)
  // Bar along one side.
  const bar = box(0.7, 1.1, 14, 0x3a3a42)
  bar.position.set(-S * 0.5 + 1.5, 0.55, 0)
  group.add(bar)
  // DJ booth.
  const booth = box(3, 1.3, 1.5, 0x40404a)
  booth.position.set(0, 0.65, S * 0.5 - 3)
  group.add(booth)
  // 4 colored emissive cones from ceiling (MeshBasicMaterial, transparent).
  const coneGroup = grp(0, 0, 0)
  group.add(coneGroup)
  const colors = [0xff3040, 0x3060ff, 0x30ff60, 0xff30ff]
  const spots: [number, number][] = [
    [-5, -5],
    [5, -5],
    [-5, 5],
    [5, 5]
  ]
  const cones: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const c = spots[i] ?? [0, 0]
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(1.6, 4, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: colors[i] ?? 0xffffff,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      })
    )
    // Apex up at ceiling, opening down.
    cone.position.set(c[0], 2, c[1])
    cone.castShadow = false
    cone.receiveShadow = false
    coneGroup.add(cone)
    cones.push(cone)
  }
  const animate = (input: AnimInput) => {
    coneGroup.rotation.y = input.time * 0.4
  }
  return { group, height: wallH, animate }
}

function envOffice(group: THREE.Group): EnvResult {
  const S = 20
  const wallH = 2.8
  const t = 0.15
  group.add(ground(S, S, 0x84848c))
  const back = wallMesh(S, wallH, t)
  back.position.set(0, wallH * 0.5, S * 0.5)
  group.add(back)
  const left = wallMesh(t, wallH, S)
  left.position.set(-S * 0.5, wallH * 0.5, 0)
  group.add(left)
  const right = left.clone()
  right.position.x = S * 0.5
  group.add(right)
  // 4 desk+chair clusters.
  for (const [x, z] of [
    [-5, -4],
    [5, -4],
    [-5, 4],
    [5, 4]
  ] as [number, number][]) {
    const cluster = grp(x, 0, z)
    group.add(cluster)
    const top = box(1.4, 0.05, 0.7, 0x8d8d95)
    top.position.y = 0.72
    cluster.add(top)
    const legs = box(1.3, 0.68, 0.6, 0x70707a)
    legs.position.y = 0.35
    cluster.add(legs)
    const chair = grp(0, 0, -0.6)
    cluster.add(chair)
    buildSimpleChair(chair)
  }
  return { group, height: wallH }
}

function envWarehouse(group: THREE.Group): EnvResult {
  const S = 24
  const wallH = 6
  const t = 0.2
  group.add(ground(S, S, 0x7a7a80))
  const back = wallMesh(S, wallH, t)
  back.position.set(0, wallH * 0.5, S * 0.5)
  group.add(back)
  const left = wallMesh(t, wallH, S)
  left.position.set(-S * 0.5, wallH * 0.5, 0)
  group.add(left)
  const right = left.clone()
  right.position.x = S * 0.5
  group.add(right)
  // Stacked crate piles.
  const cratePos: [number, number][] = [
    [-6, -6],
    [-6, 6],
    [6, -6]
  ]
  for (const [cx, cz] of cratePos) {
    for (let i = 0; i < 3; i++) {
      const crate = box(1.2, 1.2, 1.2, i % 2 === 0 ? 0x8a7a5a : 0x92826a)
      crate.position.set(cx + (i === 2 ? 0.5 : 0), 0.6 + i * 1.2, cz)
      group.add(crate)
    }
  }
  // 2 shelving racks.
  for (const x of [-2, 4]) {
    const rack = grp(x, 0, 4)
    group.add(rack)
    const postH = 5
    for (const px of [-1.5, 1.5]) {
      const post = box(0.15, postH, 0.15, 0x55555f)
      post.position.set(px, postH * 0.5, 0)
      rack.add(post)
    }
    for (let s = 0; s < 3; s++) {
      const shelf = box(3.2, 0.1, 1.2, 0x6a6a72)
      shelf.position.set(0, 1 + s * 1.8, 0)
      rack.add(shelf)
    }
  }
  return { group, height: wallH }
}

function envCarInterior(group: THREE.Group): EnvResult {
  // No roof/walls. Floor + 2 seat rows + dashboard + steering wheel.
  const floor = box(1.8, 0.05, 3.2, 0x50505a)
  floor.position.y = 0.02
  floor.receiveShadow = true
  floor.castShadow = false
  group.add(floor)
  // Seats: front row (-Z), back row (+Z).
  const mkSeat = (x: number, z: number) => {
    const base = box(0.55, 0.15, 0.55, 0x3a3a42)
    base.position.set(x, 0.4, z)
    group.add(base)
    const backrest = box(0.55, 0.6, 0.12, 0x3a3a42)
    backrest.position.set(x, 0.75, z + 0.28)
    group.add(backrest)
  }
  mkSeat(-0.45, -0.6)
  mkSeat(0.45, -0.6)
  mkSeat(-0.45, 0.7)
  mkSeat(0.45, 0.7)
  // Dashboard block at front.
  const dash = box(1.7, 0.4, 0.35, 0x2c2c32)
  dash.position.set(0, 0.7, -1.4)
  group.add(dash)
  // Steering wheel torus (driver on left, forward -Z).
  const wheelT = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.03, 8, 16),
    mat(0x20202a)
  )
  ;(wheelT.userData as TintUserData).origColor = 0x20202a
  wheelT.castShadow = true
  wheelT.position.set(-0.45, 0.85, -1.15)
  wheelT.rotation.x = 1.2
  group.add(wheelT)
  return { group, height: 1.3 }
}

function envBusInterior(group: THREE.Group): EnvResult {
  // Floor + 6 seat rows (2 columns) + side window band. No roof.
  const floor = box(2.5, 0.05, 11, 0x50505a)
  floor.position.y = 0.02
  floor.receiveShadow = true
  floor.castShadow = false
  group.add(floor)
  for (let r = 0; r < 6; r++) {
    const z = -4.5 + r * 1.8
    for (const x of [-0.7, 0.7]) {
      const base = box(0.55, 0.12, 0.5, 0x3a3a42)
      base.position.set(x, 0.45, z)
      group.add(base)
      const backrest = box(0.55, 0.55, 0.1, 0x40404a)
      backrest.position.set(x, 0.72, z + 0.25)
      group.add(backrest)
    }
  }
  // Side window bands (thin light boxes).
  for (const x of [-1.24, 1.24]) {
    const band = box(0.04, 0.6, 10, 0xbcc4cc)
    band.position.set(x, 1.3, 0)
    group.add(band)
  }
  return { group, height: 2.2 }
}

function envPlaneCabin(group: THREE.Group): EnvResult {
  // Floor + 6 rows × (2+2) seats with aisle + curved side hints + overhead bins. No roof.
  const floor = box(3.2, 0.05, 12, 0x60606a)
  floor.position.y = 0.02
  floor.receiveShadow = true
  floor.castShadow = false
  group.add(floor)
  const seatX = [-1.1, -0.6, 0.6, 1.1] // aisle gap in middle
  for (let r = 0; r < 6; r++) {
    const z = -5 + r * 1.8
    for (const x of seatX) {
      const base = box(0.42, 0.12, 0.5, 0x3a3a42)
      base.position.set(x, 0.45, z)
      group.add(base)
      const backrest = box(0.42, 0.5, 0.1, 0x40404a)
      backrest.position.set(x, 0.7, z + 0.25)
      group.add(backrest)
    }
  }
  // Curved-ish side hints (angled boxes).
  for (const side of [-1, 1]) {
    const sideWall = box(0.1, 1.6, 12, 0x9a9aa2)
    sideWall.position.set(side * 1.55, 1.2, 0)
    sideWall.rotation.z = side * 0.25
    group.add(sideWall)
    // Overhead bins.
    const bin = box(0.6, 0.4, 11, 0x8a8a92)
    bin.position.set(side * 1.3, 2.0, 0)
    group.add(bin)
  }
  return { group, height: 2.2 }
}

function envField(group: THREE.Group): EnvResult {
  const S = 30
  group.add(ground(S, S, 0x6f8060))
  // A few low bush mounds (squashed spheres).
  const bushes: [number, number][] = [
    [-8, -6],
    [5, -9],
    [10, 4],
    [-6, 8],
    [2, 2]
  ]
  for (const [x, z] of bushes) {
    const bush = sphere(1.0, 0x5c7050, 10)
    bush.scale.y = 0.4
    bush.position.set(x, 0.35, z)
    group.add(bush)
  }
  return { group, height: 0.1 }
}

function envDesert(group: THREE.Group): EnvResult {
  const S = 30
  group.add(ground(S, S, 0xc4b088))
  // 2 dune mounds.
  for (const [x, z, r] of [
    [-8, -4, 4],
    [7, 6, 5]
  ] as [number, number, number][]) {
    const dune = sphere(r, 0xbca878, 12)
    dune.scale.y = 0.25
    dune.position.set(x, 0.2, z)
    group.add(dune)
  }
  // 1 cactus (cylinder + 2 arms).
  const trunk = cyl(0.25, 0.3, 3, 0x5c7050)
  trunk.position.set(0, 1.5, 0)
  group.add(trunk)
  const armL = cyl(0.15, 0.15, 1.2, 0x5c7050)
  armL.position.set(-0.5, 1.8, 0)
  armL.rotation.z = 0.6
  group.add(armL)
  const armLup = cyl(0.15, 0.15, 0.8, 0x5c7050)
  armLup.position.set(-0.85, 2.3, 0)
  group.add(armLup)
  const armR = cyl(0.15, 0.15, 1.0, 0x5c7050)
  armR.position.set(0.5, 2.1, 0)
  armR.rotation.z = -0.6
  group.add(armR)
  return { group, height: 0.1 }
}

function envParkingLot(group: THREE.Group): EnvResult {
  const S = 20
  group.add(ground(S, S, 0x3a3a40))
  // Painted line boxes forming ~8 stalls (2 rows of 4).
  const stallW = 2.6
  const stallD = 5
  for (let row = 0; row < 2; row++) {
    const z0 = row === 0 ? -stallD : 0
    for (let i = 0; i <= 4; i++) {
      const x = -2 * stallW + i * stallW
      const line = box(0.1, 0.02, stallD, 0xd0d0d0)
      line.position.set(x, 0.02, z0 + stallD * 0.5)
      line.receiveShadow = true
      line.castShadow = false
      group.add(line)
    }
    // Head line.
    const head = box(4 * stallW, 0.02, 0.1, 0xd0d0d0)
    head.position.set(0, 0.02, z0 + (row === 0 ? 0 : stallD))
    head.receiveShadow = true
    head.castShadow = false
    group.add(head)
  }
  return { group, height: 0.1 }
}

function envAlley(group: THREE.Group): EnvResult {
  // Narrow ground strip + 2 tall walls close together.
  const stripW = 5
  const L = 20
  group.add(ground(stripW, L, 0x4a4a50))
  const wallH = 8
  for (const side of [-1, 1]) {
    const wall = box(0.3, wallH, L, 0x707078)
    wall.position.set(side * stripW * 0.5, wallH * 0.5, 0)
    group.add(wall)
    // Fire-escape hint (thin boxes) on one wall.
    if (side === -1) {
      for (let f = 0; f < 3; f++) {
        const platform = box(0.1, 0.1, 1.5, 0x40404a)
        platform.position.set(-stripW * 0.5 + 0.8, 2.5 + f * 1.8, -3)
        group.add(platform)
        const rail = box(0.05, 0.6, 1.5, 0x40404a)
        rail.position.set(-stripW * 0.5 + 1.5, 2.8 + f * 1.8, -3)
        group.add(rail)
      }
    }
  }
  // Dumpster.
  const dumpster = box(1.6, 1.2, 1.0, 0x4a5a4a)
  dumpster.position.set(-1, 0.6, 5)
  group.add(dumpster)
  return { group, height: 8 }
}

function envRooftop(group: THREE.Group): EnvResult {
  const S = 12
  // 12×12 slab raised 0.02.
  const slab = box(S, 0.04, S, 0x6a6a72)
  slab.position.y = 0.02
  slab.receiveShadow = true
  slab.castShadow = false
  group.add(slab)
  // Parapet walls 1m.
  const pH = 1
  const t = 0.2
  for (const [x, z, w, d] of [
    [0, S * 0.5, S, t],
    [0, -S * 0.5, S, t],
    [S * 0.5, 0, t, S],
    [-S * 0.5, 0, t, S]
  ] as [number, number, number, number][]) {
    const wall = box(w, pH, d, 0x7a7a82)
    wall.position.set(x, pH * 0.5, z)
    group.add(wall)
  }
  // AC unit boxes.
  for (const [x, z] of [
    [-3, -2],
    [2, 3]
  ] as [number, number][]) {
    const ac = box(1.5, 0.9, 1.2, 0x8a8a92)
    ac.position.set(x, 0.45, z)
    group.add(ac)
  }
  // Door bulkhead.
  const bulkhead = box(2, 2.4, 1.8, 0x82828a)
  bulkhead.position.set(3.5, 1.2, -3.5)
  group.add(bulkhead)
  const door = box(0.9, 2, 0.1, 0x5a4a42)
  door.position.set(3.5, 1.0, -3.5 - 0.9 - 0.01)
  group.add(door)
  return { group, height: 1.2 }
}

// ---------------------------------------------------------------------------
// PRIMITIVES
// ---------------------------------------------------------------------------

function buildPrimitive(assetId: string): BuiltAsset {
  const group = new THREE.Group()
  group.name = assetId
  let height = 1

  switch (assetId) {
    case 'prim.cube': {
      const b = box(1, 1, 1)
      b.position.y = 0.5
      group.add(b)
      break
    }
    case 'prim.cylinder': {
      const c = cyl(0.5, 0.5, 1)
      c.position.y = 0.5
      group.add(c)
      break
    }
    case 'prim.ramp': {
      height = 1
      group.add(buildWedge(1, 1, 1))
      break
    }
    case 'prim.wall': {
      height = 2.7
      const w = box(3, 2.7, 0.15)
      w.position.y = 1.35
      group.add(w)
      break
    }
    case 'prim.stairs': {
      height = 2
      const steps = 5
      const rise = height / steps
      const run = 0.4
      const width = 1.2
      for (let i = 0; i < steps; i++) {
        const stepH = rise * (i + 1)
        const step = box(width, stepH, run, 0x86868e)
        step.position.set(0, stepH * 0.5, run * 0.5 - i * run)
        group.add(step)
      }
      break
    }
    default: {
      const b = box(1, 1, 1)
      b.position.y = 0.5
      group.add(b)
    }
  }

  return finalizeStatic(group, height)
}

/**
 * A right-triangular wedge (ramp): rises along +Y from the -Z (low) edge to
 * the +Z (high) edge... but forward is -Z, so incline faces -Z: high at -Z.
 * Built from BufferGeometry with correct outward normals.
 */
function buildWedge(w: number, h: number, d: number): THREE.Mesh {
  const hw = w * 0.5
  // 6 vertices: bottom rectangle + a slanted top edge.
  // Low edge at +Z (z = d/2, y=0), high edge at -Z (z=-d/2, y=h).
  // Cross-section is a right triangle in the Y-Z plane.
  const zLow = d * 0.5
  const zHigh = -d * 0.5
  // Vertices (index):
  // 0: (-hw, 0, zLow)   1: (hw, 0, zLow)
  // 2: (-hw, 0, zHigh)  3: (hw, 0, zHigh)
  // 4: (-hw, h, zHigh)  5: (hw, h, zHigh)
  const positions: number[] = []
  const normals: number[] = []

  const push = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number
  ) => {
    // Compute face normal from the triangle (CCW → outward).
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const vx = cx - ax, vy = cy - ay, vz = cz - az
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz)
    for (let i = 0; i < 3; i++) normals.push(nx, ny, nz)
  }

  // Named corners.
  const A0: [number, number, number] = [-hw, 0, zLow]
  const B0: [number, number, number] = [hw, 0, zLow]
  const C0: [number, number, number] = [-hw, 0, zHigh]
  const D0: [number, number, number] = [hw, 0, zHigh]
  const C1: [number, number, number] = [-hw, h, zHigh]
  const D1: [number, number, number] = [hw, h, zHigh]

  // Bottom (facing -Y): A0,C0,D0 / A0,D0,B0 (CCW when viewed from below)
  push(...A0, ...D0, ...C0)
  push(...A0, ...B0, ...D0)
  // Vertical back face (facing -Z): C0,D0,D1 / C0,D1,C1
  push(...C0, ...D0, ...D1)
  push(...C0, ...D1, ...C1)
  // Slanted top (facing up/+Z-ish): A0,C1,D1 / A0,D1,B0
  push(...A0, ...C1, ...D1)
  push(...A0, ...D1, ...B0)
  // Left triangle side (facing -X): A0,C1,C0
  push(...A0, ...C1, ...C0)
  // Right triangle side (facing +X): B0,D0,D1
  push(...B0, ...D0, ...D1)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  const m = new THREE.Mesh(geo, mat(BASE_GREY))
  m.castShadow = true
  m.receiveShadow = true
  ;(m.userData as TintUserData).origColor = BASE_GREY
  return m
}

// ---------------------------------------------------------------------------
// FALLBACK
// ---------------------------------------------------------------------------

function buildFallback(assetId: string): BuiltAsset {
  const group = new THREE.Group()
  group.name = assetId
  const spec = assetSpec(assetId)
  const h = spec.height
  const b = box(0.5, h, 0.5, 0x9a9aa2)
  b.position.y = h * 0.5
  group.add(b)
  return finalizeStatic(group, h)
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function buildAsset(assetId: string, params?: Record<string, number | string>): BuiltAsset {
  if (assetId.startsWith('person.')) return buildPerson(assetId, params)
  if (assetId === 'animal.bird') return buildBird(assetId)
  if (assetId.startsWith('animal.')) return buildQuadruped(assetId)
  if (assetId.startsWith('vehicle.')) {
    switch (assetId) {
      case 'vehicle.sedan':
        return buildSedan()
      case 'vehicle.suv':
        return buildSUV()
      case 'vehicle.pickup':
        return buildPickup()
      case 'vehicle.van':
        return buildVan()
      case 'vehicle.bus':
        return buildBus()
      case 'vehicle.truck':
        return buildTruck()
      case 'vehicle.tank':
        return buildTank()
      case 'vehicle.train':
        return buildTrain()
      case 'vehicle.motorcycle':
        return buildMotorcycle()
      case 'vehicle.bicycle':
        return buildBicycle()
      case 'vehicle.plane':
        return buildPlane()
      case 'vehicle.boat':
        return buildBoat()
      default:
        return buildFallback(assetId)
    }
  }
  if (assetId.startsWith('furniture.')) return buildFurniture(assetId)
  if (assetId.startsWith('env.')) return buildEnv(assetId)
  if (assetId.startsWith('prim.')) return buildPrimitive(assetId)
  return buildFallback(assetId)
}

// ---------------------------------------------------------------------------
// Marks & labels
// ---------------------------------------------------------------------------

/**
 * Classic floor spike-tape "T" mark: two crossing flat boxes in the given
 * color + a small floating number label sprite. Deterministic.
 */
export function markMesh(color: string, index: number): THREE.Group {
  const group = new THREE.Group()
  group.name = 'mark'
  const tapeMat = new THREE.MeshBasicMaterial({ color })
  // Crossing bars forming a "T".
  const barGeo = new THREE.BoxGeometry(0.4, 0.02, 0.08)
  const across = new THREE.Mesh(barGeo, tapeMat)
  across.position.set(0, 0.011, -0.14)
  across.rotation.y = 0
  group.add(across)
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.4), tapeMat)
  stem.position.set(0, 0.011, 0.06)
  group.add(stem)

  // Number label sprite floating 0.3m above.
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 48px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${index}`, 64, 64)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }))
  sprite.scale.set(0.35, 0.35, 0.35)
  sprite.position.set(0, 0.3, 0)
  group.add(sprite)

  return group
}

/**
 * Billboard label: rounded dark pill background with a colored left bar and
 * white bold text. Sized to read at ~2–8m. Deterministic.
 */
export function labelSprite(text: string, color: string): THREE.Sprite {
  const pad = 24
  const fontSize = 44
  const barW = 3
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // Measure text to size the canvas.
  const measureFont = `bold ${fontSize}px sans-serif`
  let textW = 120
  if (ctx) {
    ctx.font = measureFont
    textW = ctx.measureText(text).width
  }
  const cw = Math.ceil(textW + pad * 2 + barW + 12)
  const ch = Math.ceil(fontSize + pad * 2)
  canvas.width = cw
  canvas.height = ch

  if (ctx) {
    ctx.clearRect(0, 0, cw, ch)
    // Rounded pill background.
    const r = ch * 0.28
    ctx.fillStyle = 'rgba(17,17,19,0.85)'
    roundRect(ctx, 0, 0, cw, ch, r)
    ctx.fill()
    // Colored left bar.
    ctx.fillStyle = color
    roundRect(ctx, 6, ch * 0.2, barW, ch * 0.6, barW * 0.5)
    ctx.fill()
    // White text.
    ctx.fillStyle = '#ffffff'
    ctx.font = measureFont
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, barW + 18, ch * 0.52)
  }

  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  // Height ≈ 0.28m; width proportional to aspect.
  const h = 0.28
  const w = h * (cw / ch)
  sprite.scale.set(w, h, 1)
  return sprite
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, w * 0.5, h * 0.5)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
