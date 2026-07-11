// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Document creation, validation, and git-friendly serialization.
 * Projects are folders; this module owns the JSON shape. Serialization is
 * pretty-printed with stable key order so diffs stay reviewable.
 */

import { newId } from './ids'
import type {
  ActorMark,
  BlockingTake,
  CameraMark,
  Entity,
  GaitId,
  ProjectDoc,
  Scene,
  Shot,
  V3
} from './types'
import { normalizeProjectRelativePath } from '../shared/portable-paths'

export const SCHEMA_VERSION = 1 as const

export function createProject(name: string): ProjectDoc {
  const doc: ProjectDoc = {
    version: SCHEMA_VERSION,
    id: newId('proj'),
    name,
    settings: { defaultProfileId: 'seedance-2' },
    scenes: []
  }
  doc.scenes.push(createScene(1))
  return doc
}

export function createScene(number: number): Scene {
  const take: BlockingTake = { id: newId('take'), name: 'Master', tracks: [] }
  const scene: Scene = {
    id: newId('scene'),
    name: `Scene ${number}`,
    number,
    environment: { lighting: 'day', sunAzimuth: 0.8, sunElevation: 0.9, fog: 0 },
    entities: [],
    blocking: [take],
    shots: []
  }
  scene.shots.push(createShot(scene, `${number}A`))
  return scene
}

export function createShot(scene: Scene, name: string): Shot {
  return {
    id: newId('shot'),
    name,
    duration: 5,
    fps: 24,
    aspect: '16:9',
    blockingTakeId: scene.blocking[0]!.id,
    camera: {
      sensorId: 'super35',
      rig: 'sticks',
      rigIntensity: 0.5,
      seed: Math.floor(Math.random() * 1e9),
      marks: []
    }
  }
}

export function createEntity(assetId: string, name: string, position: V3): Entity {
  return {
    id: newId('ent'),
    assetId,
    name,
    transform: { position, rotationY: 0, scale: 1 }
  }
}

export function createActorMark(position: V3, time: number, gait: GaitId = 'walk'): ActorMark {
  return { id: newId('mark'), time, hold: 0, easeIn: 0.25, easeOut: 0.25, position, gait }
}

export function createCameraMark(
  position: V3,
  time: number,
  pan: number,
  tilt: number,
  focalLength: number
): CameraMark {
  return {
    id: newId('cmark'),
    time,
    hold: 0,
    easeIn: 0.3,
    easeOut: 0.3,
    position,
    pan,
    tilt,
    roll: 0,
    focalLength
  }
}

/* ------------------------------ validation ------------------------------ */

export interface ValidationIssue {
  path: string
  message: string
}

export function validateProject(doc: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const err = (path: string, message: string) => issues.push({ path, message })
  if (typeof doc !== 'object' || doc === null) {
    err('$', 'project is not an object')
    return issues
  }
  const p = doc as Record<string, unknown>
  if (p.version !== 1) err('version', `unsupported schema version ${String(p.version)}`)
  if (typeof p.name !== 'string') err('name', 'missing project name')
  if (!Array.isArray(p.scenes)) {
    err('scenes', 'missing scenes array')
    return issues
  }
  p.scenes.forEach((s: unknown, i: number) => {
    if (typeof s !== 'object' || s === null) return err(`scenes[${i}]`, 'scene is not an object')
    const scene = s as Record<string, unknown>
    if (typeof scene.id !== 'string') err(`scenes[${i}].id`, 'missing id')
    if (!Array.isArray(scene.entities)) err(`scenes[${i}].entities`, 'missing entities')
    else {
      ;(scene.entities as unknown[]).forEach((entity: unknown, j: number) => {
        if (typeof entity !== 'object' || entity === null) return
        const sourceFile = (entity as Record<string, unknown>).sourceFile
        if (sourceFile !== undefined &&
          (typeof sourceFile !== 'string' || normalizeProjectRelativePath(sourceFile) === null)) {
          err(`scenes[${i}].entities[${j}].sourceFile`, 'must be a relative path inside the project')
        }
      })
    }
    if (!Array.isArray(scene.blocking) || (scene.blocking as unknown[]).length === 0)
      err(`scenes[${i}].blocking`, 'scene needs at least one blocking take')
    if (!Array.isArray(scene.shots)) err(`scenes[${i}].shots`, 'missing shots')
    else {
      const takeIds = new Set(
        (Array.isArray(scene.blocking) ? (scene.blocking as { id?: unknown }[]) : [])
          .map((b) => b.id)
          .filter((x): x is string => typeof x === 'string')
      )
      ;(scene.shots as unknown[]).forEach((sh: unknown, j: number) => {
        if (typeof sh !== 'object' || sh === null) return err(`scenes[${i}].shots[${j}]`, 'not an object')
        const shot = sh as Record<string, unknown>
        if (typeof shot.duration !== 'number' || shot.duration <= 0)
          err(`scenes[${i}].shots[${j}].duration`, 'duration must be > 0')
        if (typeof shot.blockingTakeId !== 'string' || !takeIds.has(shot.blockingTakeId))
          err(`scenes[${i}].shots[${j}].blockingTakeId`, 'references a missing blocking take')
        const camera = shot.camera as Record<string, unknown> | undefined
        if (!camera || !Array.isArray(camera.marks)) err(`scenes[${i}].shots[${j}].camera`, 'missing camera')
        const reference = shot.referenceVideo as Record<string, unknown> | undefined
        if (reference &&
          (typeof reference.path !== 'string' || normalizeProjectRelativePath(reference.path) === null)) {
          err(`scenes[${i}].shots[${j}].referenceVideo.path`, 'must be a relative path inside the project')
        }
      })
    }
    if (Array.isArray(scene.drafts)) {
      ;(scene.drafts as unknown[]).forEach((draft: unknown, j: number) => {
        if (typeof draft !== 'object' || draft === null) return
        const reference = (draft as Record<string, unknown>).referenceVideo as
          | Record<string, unknown>
          | undefined
        if (reference &&
          (typeof reference.path !== 'string' || normalizeProjectRelativePath(reference.path) === null)) {
          err(`scenes[${i}].drafts[${j}].referenceVideo.path`, 'must be a relative path inside the project')
        }
      })
    }
  })
  return issues
}

function requirePortableProjectPath(value: string, location: string): string {
  const normalized = normalizeProjectRelativePath(value)
  if (!normalized) throw new Error(`${location}: must be a relative path inside the project`)
  return normalized
}

function normalizeProjectPaths(doc: ProjectDoc): ProjectDoc {
  for (const [sceneIndex, scene] of doc.scenes.entries()) {
    for (const [entityIndex, entity] of scene.entities.entries()) {
      if (entity.sourceFile !== undefined) {
        entity.sourceFile = requirePortableProjectPath(
          entity.sourceFile,
          `scenes[${sceneIndex}].entities[${entityIndex}].sourceFile`
        )
      }
    }
    for (const [shotIndex, shot] of [...scene.shots, ...(scene.drafts ?? [])].entries()) {
      if (shot.referenceVideo) {
        shot.referenceVideo.path = requirePortableProjectPath(
          shot.referenceVideo.path,
          `scenes[${sceneIndex}].shotsOrDrafts[${shotIndex}].referenceVideo.path`
        )
      }
    }
  }
  return doc
}

/* ---------------------------- serialization ----------------------------- */

/** Recursively sort object keys so serialization is byte-stable. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key]
      if (v !== undefined) out[key] = stable(v)
    }
    return out
  }
  return value
}

export function serializeProject(doc: ProjectDoc): string {
  const copy = JSON.parse(JSON.stringify(doc)) as ProjectDoc
  return JSON.stringify(stable(normalizeProjectPaths(copy)), null, 2) + '\n'
}

export function parseProject(json: string): { doc: ProjectDoc | null; issues: ValidationIssue[] } {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    return { doc: null, issues: [{ path: '$', message: `invalid JSON: ${(e as Error).message}` }] }
  }
  const issues = validateProject(raw)
  if (issues.length > 0) return { doc: null, issues }
  return { doc: normalizeProjectPaths(raw as ProjectDoc), issues: [] }
}
