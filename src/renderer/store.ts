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
  | { kind: 'entities'; entityIds: string[] } // shift-click multi-select
  | { kind: 'camera' }
  | { kind: 'mark'; entityId: string | 'camera'; markId: string }
  | { kind: 'marks'; entityId: string | 'camera'; markIds: string[] } // shift-click on pills
  | null

/** All entity ids covered by the current selection (single or multi). */
export function selectedEntityIds(sel: Selection): string[] {
  if (sel?.kind === 'entity') return [sel.entityId]
  if (sel?.kind === 'entities') return sel.entityIds
  return []
}

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
  /** Picture-in-picture live shot preview size. */
  pipSize: 'off' | 'small' | 'medium' | 'large'
  /** True while performing a live camera-move recording. */
  recording: boolean
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
  setPipSize(size: 'off' | 'small' | 'medium' | 'large'): void
  setRecording(on: boolean): void

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
  /** Shift-click: add/remove an entity from a multi-selection. */
  toggleEntitySelected(entityId: string): void
  /** Shift-click on a timeline pill: add/remove a mark from a multi-selection. */
  toggleMarkSelected(entityId: string | 'camera', markId: string): void
  /** Marry entities to a parent: they follow its motion at a fixed offset. */
  marryEntities(childIds: string[], parentId: string): void
  /** Detach entities, baking their current world pose into the transform. */
  unmarryEntities(entityIds: string[]): void
  /** Switch the shot's active camera to a bank entry by name ('A','B',…). */
  switchCamera(name: string): void
  /** Bank the active camera and start a fresh one (B, C, …). */
  addCameraToShot(): void
  /** Delete the active camera's move (all its marks) — e.g. to re-record. */
  clearCameraMarks(): void
  /** Snapshot the current shot as a draft version ("1A v2"). */
  saveDraftOfShot(): void
  /** Copy a draft's content back into its main shot. */
  promoteDraft(draftId: string): void
  deleteDraft(draftId: string): void
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: string): void
  setExportProgress(p: Partial<ExportProgress>): void
}

const MAX_UNDO = 100

/** Coalesce rapid same-label mutations (slider swipes) into one undo step. */
let lastMutateLabel = ''
let lastMutateAt = 0
const COALESCE_MS = 800

/** After restoring a snapshot, make scene/shot ids point at real objects. */
function reconcileSelection(doc: ProjectDoc, sceneId: string | null, shotId: string | null): {
  sceneId: string | null
  shotId: string | null
} {
  const scene = doc.scenes.find((s) => s.id === sceneId) ?? doc.scenes[0] ?? null
  const shot = scene?.shots.find((s) => s.id === shotId) ?? scene?.shots[0] ?? null
  return { sceneId: scene?.id ?? null, shotId: shot?.id ?? null }
}

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
  pipSize: 'medium',
  recording: false,
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

  setMode(mode) {
    // Mode switches remount the viewport and scene/shot switches rebuild the
    // evaluator — both would corrupt an in-flight export.
    if (get().exportProgress.running) return
    set({ mode, placingAssetId: null, droppingMarks: false })
  },
  selectScene(sceneId) {
    if (get().exportProgress.running) return
    const doc = get().doc
    const scene = doc?.scenes.find((s) => s.id === sceneId)
    set({ sceneId, shotId: scene?.shots[0]?.id ?? null, selection: null, time: 0, playing: false })
  },
  selectShot(shotId) {
    // exportAnimatic/contact-sheet iterate shots internally; they bypass this
    // guard by toggling exportProgress around each hop. User clicks land here.
    if (get().exportProgress.running) return
    set({ shotId, time: 0, playing: false })
  },
  setSelection: (selection) => set({ selection, droppingMarks: false }),
  setPlacingAsset: (placingAssetId) => set({ placingAssetId }),
  setDroppingMarks: (droppingMarks) => set({ droppingMarks }),
  setLookThrough: (lookThrough) => set({ lookThrough }),
  setPipSize: (pipSize) => set({ pipSize }),
  setRecording: (recording) => set({ recording }),

  setPlaying(playing) {
    const { shot, time } = get()
    const s = shot()
    // Restart from 0 when hitting play at the end.
    if (playing && s && time >= s.duration - 0.01) set({ time: 0 })
    set({ playing })
  },
  setTime: (time) => set({ time }),

  mutate(label, fn) {
    const { doc, undoStack, exportProgress } = get()
    if (!doc) return
    if (exportProgress.running) {
      // The export loop is reading this document frame by frame; editing it
      // mid-export would change the video partway through.
      get().toast('Editing is locked while an export is running.', 'info')
      return
    }
    const next = structuredClone(doc)
    fn(next)
    const now = Date.now()
    const coalesce = label === lastMutateLabel && now - lastMutateAt < COALESCE_MS
    lastMutateLabel = label
    lastMutateAt = now
    if (coalesce) {
      // Keep the snapshot taken at the start of the swipe; just move the doc.
      set({ doc: next, dirty: true })
    } else {
      const snapshot = serializeProject(doc)
      set({
        doc: next,
        dirty: true,
        undoStack: [...undoStack.slice(-MAX_UNDO + 1), snapshot],
        redoStack: []
      })
    }
  },

  undo() {
    const { doc, undoStack, redoStack, sceneId, shotId, exportProgress } = get()
    if (!doc || undoStack.length === 0 || exportProgress.running) return
    lastMutateLabel = '' // an undo ends any coalescing run
    const prev = undoStack[undoStack.length - 1]!
    const { doc: restored } = parseProject(prev)
    if (!restored) return
    set({
      doc: restored,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, serializeProject(doc)],
      dirty: true,
      selection: null,
      // The restored doc may not contain the current scene/shot (e.g. undo
      // of "add shot") — point at real objects so the UI never goes blank.
      ...reconcileSelection(restored, sceneId, shotId)
    })
  },

  redo() {
    const { doc, undoStack, redoStack, sceneId, shotId, exportProgress } = get()
    if (!doc || redoStack.length === 0 || exportProgress.running) return
    lastMutateLabel = ''
    const next = redoStack[redoStack.length - 1]!
    const { doc: restored } = parseProject(next)
    if (!restored) return
    set({
      doc: restored,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, serializeProject(doc)],
      dirty: true,
      selection: null,
      ...reconcileSelection(restored, sceneId, shotId)
    })
  },

  scene() {
    const { doc, sceneId } = get()
    return doc?.scenes.find((s) => s.id === sceneId) ?? null
  },

  shot() {
    const { shotId } = get()
    const scene = get().scene()
    if (!scene) return null
    return (
      scene.shots.find((s) => s.id === shotId) ??
      scene.drafts?.find((s) => s.id === shotId) ??
      null
    )
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

  toggleEntitySelected(entityId) {
    const sel = get().selection
    let ids = selectedEntityIds(sel)
    if (sel && sel.kind !== 'entity' && sel.kind !== 'entities') ids = []
    ids = ids.includes(entityId) ? ids.filter((i) => i !== entityId) : [...ids, entityId]
    set({
      selection:
        ids.length === 0
          ? null
          : ids.length === 1
            ? { kind: 'entity', entityId: ids[0]! }
            : { kind: 'entities', entityIds: ids },
      droppingMarks: false
    })
  },

  toggleMarkSelected(entityId, markId) {
    const sel = get().selection
    let ids: string[] = []
    if (sel?.kind === 'mark' && sel.entityId === entityId) ids = [sel.markId]
    else if (sel?.kind === 'marks' && sel.entityId === entityId) ids = [...sel.markIds]
    ids = ids.includes(markId) ? ids.filter((i) => i !== markId) : [...ids, markId]
    set({
      selection:
        ids.length === 0
          ? null
          : ids.length === 1
            ? { kind: 'mark', entityId, markId: ids[0]! }
            : { kind: 'marks', entityId, markIds: ids }
    })
  },

  marryEntities(childIds, parentId) {
    const sceneId = get().sceneId
    let married = 0
    let cycles = 0
    get().mutate('marry entities', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      if (!scene) return
      // World pose through the marriage chain (parents may be married too).
      const worldOf = (id: string, depth = 0): { x: number; y: number; z: number; rotY: number } => {
        const e = scene.entities.find((x) => x.id === id)
        if (!e) return { x: 0, y: 0, z: 0, rotY: 0 }
        if (e.attachedTo && e.attachedLocal && depth < 4) {
          const p = worldOf(e.attachedTo, depth + 1)
          const cos = Math.cos(p.rotY)
          const sin = Math.sin(p.rotY)
          const l = e.attachedLocal
          return {
            x: p.x + l.x * cos + l.z * sin,
            y: p.y + l.y,
            z: p.z - l.x * sin + l.z * cos,
            rotY: p.rotY + l.rotY
          }
        }
        return { ...e.transform.position, rotY: e.transform.rotationY }
      }
      const wouldCycle = (childId: string): boolean => {
        let cursor: string | undefined = parentId
        for (let i = 0; i < 8 && cursor; i++) {
          if (cursor === childId) return true
          cursor = scene.entities.find((x) => x.id === cursor)?.attachedTo
        }
        return false
      }
      const pw = worldOf(parentId)
      for (const childId of childIds) {
        if (childId === parentId) continue
        if (wouldCycle(childId)) {
          cycles++
          continue
        }
        const child = scene.entities.find((x) => x.id === childId)
        if (!child) continue
        const cw = worldOf(childId)
        const dx = cw.x - pw.x
        const dz = cw.z - pw.z
        const cos = Math.cos(pw.rotY)
        const sin = Math.sin(pw.rotY)
        child.attachedTo = parentId
        child.attachedLocal = {
          x: dx * cos - dz * sin,
          y: cw.y - pw.y,
          z: dx * sin + dz * cos,
          rotY: cw.rotY - pw.rotY
        }
        married++
      }
    })
    if (married > 0) get().toast(`Married ${married} to the anchor — they now move together.`, 'success')
    if (cycles > 0) get().toast('Skipped a marriage that would loop back on itself.', 'error')
  },

  unmarryEntities(entityIds) {
    const sceneId = get().sceneId
    get().mutate('unmarry entities', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      if (!scene) return
      const worldOf = (id: string, depth = 0): { x: number; y: number; z: number; rotY: number } => {
        const e = scene.entities.find((x) => x.id === id)
        if (!e) return { x: 0, y: 0, z: 0, rotY: 0 }
        if (e.attachedTo && e.attachedLocal && depth < 4) {
          const p = worldOf(e.attachedTo, depth + 1)
          const cos = Math.cos(p.rotY)
          const sin = Math.sin(p.rotY)
          const l = e.attachedLocal
          return {
            x: p.x + l.x * cos + l.z * sin,
            y: p.y + l.y,
            z: p.z - l.x * sin + l.z * cos,
            rotY: p.rotY + l.rotY
          }
        }
        return { ...e.transform.position, rotY: e.transform.rotationY }
      }
      for (const id of entityIds) {
        const entity = scene.entities.find((x) => x.id === id)
        if (!entity?.attachedTo) continue
        const w = worldOf(id)
        entity.transform.position = { x: w.x, y: w.y, z: w.z }
        entity.transform.rotationY = w.rotY
        delete entity.attachedTo
        delete entity.attachedLocal
      }
    })
    get().toast('Unmarried — they move independently again.', 'info')
  },

  switchCamera(name) {
    const { sceneId, shotId } = get()
    get().mutate('switch camera', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const shot =
        scene?.shots.find((s) => s.id === shotId) ?? scene?.drafts?.find((s) => s.id === shotId)
      if (!shot?.cameraBank) return
      const idx = shot.cameraBank.findIndex((b) => b.name === name)
      if (idx < 0) return
      const incoming = shot.cameraBank[idx]!
      shot.cameraBank[idx] = { name: shot.cameraName ?? 'A', camera: shot.camera }
      shot.camera = incoming.camera
      shot.cameraName = incoming.name
    })
    set({ selection: { kind: 'camera' } })
  },

  addCameraToShot() {
    const { sceneId, shotId } = get()
    let added = ''
    get().mutate('add camera', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const shot =
        scene?.shots.find((s) => s.id === shotId) ?? scene?.drafts?.find((s) => s.id === shotId)
      if (!shot) return
      const used = new Set([shot.cameraName ?? 'A', ...(shot.cameraBank ?? []).map((b) => b.name)])
      let letter = 'B'
      for (let i = 1; i < 26; i++) {
        const candidate = String.fromCharCode(65 + i)
        if (!used.has(candidate)) {
          letter = candidate
          break
        }
      }
      shot.cameraBank = shot.cameraBank ?? []
      shot.cameraBank.push({ name: shot.cameraName ?? 'A', camera: shot.camera })
      shot.camera = {
        sensorId: shot.camera.sensorId,
        rig: 'sticks',
        rigIntensity: 0.5,
        seed: Math.floor(Math.random() * 1e9),
        marks: []
      }
      shot.cameraName = letter
      added = letter
    })
    if (added) {
      set({ selection: { kind: 'camera' } })
      get().toast(`Camera ${added} added — frame it and drop marks. Switch cameras with the A/B chips.`, 'success')
    }
  },

  clearCameraMarks() {
    const { sceneId, shotId } = get()
    get().mutate('clear camera move', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const shot =
        scene?.shots.find((s) => s.id === shotId) ?? scene?.drafts?.find((s) => s.id === shotId)
      if (shot) shot.camera.marks = []
    })
    get().toast('Camera move cleared — record or drop new marks.', 'info')
  },

  saveDraftOfShot() {
    const { sceneId, shotId } = get()
    let draftName = ''
    get().mutate('save draft', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      if (!scene) return
      const current =
        scene.shots.find((s) => s.id === shotId) ?? scene.drafts?.find((s) => s.id === shotId)
      if (!current) return
      const mainId = current.draftOf ?? current.id
      const main = scene.shots.find((s) => s.id === mainId) ?? current
      const clone = structuredClone(current)
      clone.id = newId('shot')
      clone.draftOf = mainId
      clone.camera.marks = clone.camera.marks.map((m) => ({ ...m, id: newId('cmark') }))
      clone.cameraBank = clone.cameraBank?.map((b) => ({
        ...b,
        camera: { ...b.camera, marks: b.camera.marks.map((m) => ({ ...m, id: newId('cmark') })) }
      }))
      scene.drafts = scene.drafts ?? []
      const version = scene.drafts.filter((d) => d.draftOf === mainId).length + 1
      clone.name = `${main.name} v${version}`
      draftName = clone.name
      scene.drafts.push(clone)
    })
    if (draftName) get().toast(`Saved as draft "${draftName}" — keep experimenting safely.`, 'success')
  },

  promoteDraft(draftId) {
    const { sceneId } = get()
    let promotedInto: string | null = null
    get().mutate('promote draft', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      const draft = scene?.drafts?.find((d) => d.id === draftId)
      if (!scene || !draft?.draftOf) return
      const main = scene.shots.find((s) => s.id === draft.draftOf)
      if (!main) return
      main.duration = draft.duration
      main.fps = draft.fps
      main.aspect = draft.aspect
      main.blockingTakeId = draft.blockingTakeId
      main.camera = structuredClone(draft.camera)
      main.cameraName = draft.cameraName
      main.cameraBank = draft.cameraBank ? structuredClone(draft.cameraBank) : undefined
      main.notes = draft.notes
      main.referenceVideo = draft.referenceVideo ? { ...draft.referenceVideo } : undefined
      promotedInto = main.id
    })
    if (promotedInto) {
      set({ shotId: promotedInto, time: 0, playing: false })
      get().toast('Draft promoted — it is now the shot.', 'success')
    }
  },

  deleteDraft(draftId) {
    const { sceneId, shotId } = get()
    let fallback: string | null = null
    get().mutate('delete draft', (doc) => {
      const scene = doc.scenes.find((s) => s.id === sceneId)
      if (!scene?.drafts) return
      const draft = scene.drafts.find((d) => d.id === draftId)
      scene.drafts = scene.drafts.filter((d) => d.id !== draftId)
      if (shotId === draftId) fallback = draft?.draftOf ?? scene.shots[0]?.id ?? null
    })
    if (fallback) set({ shotId: fallback, time: 0, playing: false })
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
