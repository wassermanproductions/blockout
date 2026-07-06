/**
 * Application state (zustand). One store owns the document, selection,
 * playback, and undo. All document mutations flow through mutate(), which
 * snapshots for undo and marks the project dirty — components never edit
 * the doc directly.
 */

import { create } from 'zustand'
import type { ProjectDoc, Scene, Shot, Entity, V3, GaitId, AspectId } from '@engine/types'
import {
  createProject,
  createScene,
  createShot,
  createEntity,
  createActorMark,
  createCameraMark,
  serializeProject,
  parseProject
} from '@engine/schema'
import { assetSpec } from '@engine/assets'
import { newId } from '@engine/ids'

export type Mode = 'stage' | 'shoot' | 'deliver'

export type Selection =
  | { kind: 'entity'; entityId: string }
  | { kind: 'camera' }
  | { kind: 'mark'; entityId: string | 'camera'; markId: string }
  | null

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'error' | 'success'
}

export interface ExportProgress {
  running: boolean
  label: string
  frame: number
  totalFrames: number
  cancelRequested: boolean
  lastPackagePath?: string
  error?: string
}

interface BlockoutState {
  mode: Mode
  projectFolder: string | null
  doc: ProjectDoc | null
  sceneId: string | null
  shotId: string | null
  selection: Selection
  /** Asset id armed for click-to-place from the library. */
  placingAssetId: string | null
  /** When true, clicking the floor drops a mark for the selection. */
  droppingMarks: boolean
  lookThrough: boolean
  playing: boolean
  time: number
  dirty: boolean
  undoStack: string[]
  redoStack: string[]
  toasts: Toast[]
  exportProgress: ExportProgress

  /* --- lifecycle --- */
  newProject(folder: string, name: string): void
  loadFromJson(folder: string, json: string): boolean
  markSaved(): void

  /* --- navigation --- */
  setMode(mode: Mode): void
  selectScene(sceneId: string): void
  selectShot(shotId: string): void
  setSelection(sel: Selection): void
  setPlacingAsset(assetId: string | null): void
  setDroppingMarks(on: boolean): void
  setLookThrough(on: boolean): void

  /* --- playback --- */
  setPlaying(playing: boolean): void
  setTime(time: number): void

  /* --- document mutations (all undoable) --- */
  mutate(label: string, fn: (doc: ProjectDoc) => void): void
  undo(): void
  redo(): void

  /* --- convenience accessors --- */
  scene(): Scene | null
  shot(): Shot | null

  /* --- high-level operations --- */
  addEntity(assetId: string, position: V3): string
  addSceneAfter(): void
  addShotToScene(sceneId: string): void
  dropActorMark(entityId: string, position: V3): void
  dropCameraMark(position: V3, pan: number, tilt: number, focalLength: number): void
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: string): void
  setExportProgress(p: Partial<ExportProgress>): void
}

const MAX_UNDO = 100

export const useStore = create<BlockoutState>((set, get) => ({
  mode: 'stage',
  projectFolder: null,
  doc: null,
  sceneId: null,
  shotId: null,
  selection: null,
  placingAssetId: null,
  droppingMarks: false,
  lookThrough: false,
  playing: false,
  time: 0,
  dirty: false,
  undoStack: [],
  redoStack: [],
  toasts: [],
  exportProgress: { running: false, label: '', frame: 0, totalFrames: 0, cancelRequested: false },

  newProject(folder, name) {
    const doc = createProject(name)
    const scene = doc.scenes[0]!
    set({
      doc,
      projectFolder: folder,
      sceneId: scene.id,
      shotId: scene.shots[0]!.id,
      mode: 'stage',
      selection: null,
      undoStack: [],
      redoStack: [],
      dirty: true,
      time: 0,
      playing: false
    })
  },

  loadFromJson(folder, json) {
    const { doc, issues } = parseProject(json)
    if (!doc) {
      get().toast(`Could not open project: ${issues[0]?.message ?? 'unknown error'}`, 'error')
      return false
    }
    const scene = doc.scenes[0] ?? null
    set({
      doc,
      projectFolder: folder,
      sceneId: scene?.id ?? null,
      shotId: scene?.shots[0]?.id ?? null,
      mode: 'stage',
      selection: null,
      undoStack: [],
      redoStack: [],
      dirty: false,
      time: 0,
      playing: false
    })
    return true
  },

  markSaved: () => set({ dirty: false }),

  setMode: (mode) => set({ mode, placingAssetId: null, droppingMarks: false }),
  selectScene(sceneId) {
    const doc = get().doc
    const scene = doc?.scenes.find((s) => s.id === sceneId)
    set({ sceneId, shotId: scene?.shots[0]?.id ?? null, selection: null, time: 0, playing: false })
  },
  selectShot: (shotId) => set({ shotId, time: 0, playing: false }),
  setSelection: (selection) => set({ selection, droppingMarks: false }),
  setPlacingAsset: (placingAssetId) => set({ placingAssetId }),
  setDroppingMarks: (droppingMarks) => set({ droppingMarks }),
  setLookThrough: (lookThrough) => set({ lookThrough }),

  setPlaying(playing) {
    const { shot, time } = get()
    const s = shot()
    // Restart from 0 when hitting play at the end.
    if (playing && s && time >= s.duration - 0.01) set({ time: 0 })
    set({ playing })
  },
  setTime: (time) => set({ time }),

  mutate(_label, fn) {
    const { doc, undoStack } = get()
    if (!doc) return
    const snapshot = serializeProject(doc)
    const next = structuredClone(doc)
    fn(next)
    set({
      doc: next,
      dirty: true,
      undoStack: [...undoStack.slice(-MAX_UNDO + 1), snapshot],
      redoStack: []
    })
  },

  undo() {
    const { doc, undoStack, redoStack } = get()
    if (!doc || undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]!
    const { doc: restored } = parseProject(prev)
    if (!restored) return
    set({
      doc: restored,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, serializeProject(doc)],
      dirty: true,
      // Keep selection only if it still resolves.
      selection: null
    })
  },

  redo() {
    const { doc, undoStack, redoStack } = get()
    if (!doc || redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]!
    const { doc: restored } = parseProject(next)
    if (!restored) return
    set({
      doc: restored,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, serializeProject(doc)],
      dirty: true,
      selection: null
    })
  },

  scene() {
    const { doc, sceneId } = get()
    return doc?.scenes.find((s) => s.id === sceneId) ?? null
  },

  shot() {
    const { shotId } = get()
    const scene = get().scene()
    return scene?.shots.find((s) => s.id === shotId) ?? null
  },

  addEntity(assetId, position) {
    const spec = assetSpec(assetId)
    const sceneId = get().sceneId
    const entity = createEntity(assetId, spec.name, position)
    get().mutate('add entity', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      if (!scene) return
      // Number duplicates: "Man 2", "Man 3"…
      const count = scene.entities.filter((e) => e.assetId === assetId).length
      if (count > 0) entity.name = `${spec.name} ${count + 1}`
      scene.entities.push(entity)
    })
    set({ selection: { kind: 'entity', entityId: entity.id } })
    return entity.id
  },

  addSceneAfter() {
    get().mutate('add scene', (doc) => {
      const number = doc.scenes.length + 1
      doc.scenes.push(createScene(number))
    })
    const doc = get().doc!
    const added = doc.scenes[doc.scenes.length - 1]!
    get().selectScene(added.id)
  },

  addShotToScene(sceneId) {
    let newShotId: string | null = null
    get().mutate('add shot', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      if (!scene) return
      const letter = String.fromCharCode(65 + (scene.shots.length % 26))
      const shot = createShot(scene, `${scene.number}${letter}`)
      scene.shots.push(shot)
      newShotId = shot.id
    })
    if (newShotId) set({ shotId: newShotId, time: 0 })
  },

  dropActorMark(entityId, position) {
    const { sceneId, shotId, time } = get()
    get().mutate('drop mark', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const shot = scene?.shots.find((s) => s.id === shotId)
      if (!scene || !shot) return
      const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
      if (!take) return
      let track = take.tracks.find((t) => t.entityId === entityId)
      if (!track) {
        track = { entityId, marks: [] }
        take.tracks.push(track)
      }
      const gait: GaitId = 'walk'
      // First mark lands at t=0 (starting position); later marks at playhead
      // or spaced 2s after the last mark, whichever is later.
      const lastTime = track.marks.reduce((m, k) => Math.max(m, k.time + k.hold), -1)
      const t = track.marks.length === 0 ? 0 : Math.max(time, lastTime + 2)
      track.marks.push(createActorMark(position, Math.min(t, shot.duration), gait))
    })
  },

  dropCameraMark(position, pan, tilt, focalLength) {
    const { sceneId, shotId, time } = get()
    get().mutate('drop camera mark', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const shot = scene?.shots.find((s) => s.id === shotId)
      if (!shot) return
      const marks = shot.camera.marks
      const lastTime = marks.reduce((m, k) => Math.max(m, k.time + k.hold), -1)
      const t = marks.length === 0 ? 0 : Math.max(time, lastTime + 2)
      marks.push(createCameraMark(position, Math.min(t, shot.duration), pan, tilt, focalLength))
    })
  },

  toast(text, kind = 'info') {
    const id = newId('toast')
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 5000)
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setExportProgress: (p) =>
    set((s) => ({ exportProgress: { ...s.exportProgress, ...p } }))
}))

/** Serialize current doc for saving. */
export function currentProjectJson(): string | null {
  const doc = useStore.getState().doc
  return doc ? serializeProject(doc) : null
}

export type { AspectId, Entity }
