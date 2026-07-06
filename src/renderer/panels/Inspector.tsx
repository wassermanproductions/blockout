/**
 * Context-sensitive right panel. Content is driven by store.selection and the
 * current mode: nothing selected → scene/lighting/shot; an entity, the shot
 * camera, or a single mark → their editors. Every write goes through
 * store.mutate or a store action; angles are radians in the doc and shown as
 * degrees where a filmmaker expects degrees.
 */

import { useStore } from '../store'
import { emit } from '../bus'
import { useState } from 'react'
import { SENSORS, LENS_SET } from '@engine/camera'
import { GAITS } from '@engine/gaits'
import { RIGS } from '@engine/rigs'
import { MOTION_PRESETS, type MotionPreset } from '@engine/motions'
import { CAMERA_MOVE_PRESETS } from '@engine/camera-moves'
import { ShotEvaluator } from '@engine/evaluate'
import { newId } from '@engine/ids'
import { getSceneManager } from '../export/scene-access'
import type {
  ActorMark,
  CameraMark,
  Entity,
  GaitId,
  LightingPresetId,
  RigId,
  SensorId,
  ShotSizeId,
  AspectId,
  ProjectDoc,
  Scene,
  Shot
} from '@engine/types'

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
const toDeg = (rad: number): number => Math.round((rad * 180) / Math.PI)
const toRad = (deg: number): number => (deg * Math.PI) / 180

const SWATCHES = ['#e5484d', '#f5a524', '#46a758', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

const LIGHTING: { id: LightingPresetId; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'goldenHour', label: 'Golden' },
  { id: 'night', label: 'Night' },
  { id: 'interiorWarm', label: 'Warm Int' },
  { id: 'interiorCool', label: 'Cool Int' },
  { id: 'club', label: 'Club' }
]

const ASPECTS: AspectId[] = ['16:9', '9:16', '2.39:1', '4:3', '1:1']
const SHOT_SIZE_BTNS: ShotSizeId[] = ['WS', 'FS', 'MS', 'MCU', 'CU']

function num(v: string): number | null {
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/* ---------------------------------------------------------------------- */

export function Inspector(): JSX.Element {
  const selection = useStore((s) => s.selection)
  const scene = useStore((s) => s.scene())
  const shot = useStore((s) => s.shot())

  if (!scene || !shot) return <div />

  if (selection === null) return <SceneInspector scene={scene} shot={shot} />
  if (selection.kind === 'entity') {
    return <EntityInspector scene={scene} shot={shot} entityId={selection.entityId} />
  }
  if (selection.kind === 'entities') {
    return <MultiEntityInspector scene={scene} entityIds={selection.entityIds} />
  }
  if (selection.kind === 'camera') return <CameraInspector scene={scene} shot={shot} />
  if (selection.kind === 'marks') {
    return (
      <MultiMarkInspector
        scene={scene}
        shot={shot}
        entityId={selection.entityId}
        markIds={selection.markIds}
      />
    )
  }
  return (
    <MarkInspector
      scene={scene}
      shot={shot}
      entityId={selection.entityId}
      markId={selection.markId}
    />
  )
}

/* ------------------------------ helpers -------------------------------- */

function useMutate(): (label: string, fn: (doc: ProjectDoc) => void) => void {
  return useStore((s) => s.mutate)
}

function findScene(doc: ProjectDoc, sceneId: string): Scene | undefined {
  return doc.scenes.find((s) => s.id === sceneId)
}
function findShot(doc: ProjectDoc, sceneId: string, shotId: string): Shot | undefined {
  return findScene(doc, sceneId)?.shots.find((s) => s.id === shotId)
}
/** Find a shot that may live in scene.shots OR scene.drafts (a draft is the current shot). */
function findShotOrDraft(doc: ProjectDoc, sceneId: string, shotId: string): Shot | undefined {
  const sc = findScene(doc, sceneId)
  return sc?.shots.find((s) => s.id === shotId) ?? sc?.drafts?.find((s) => s.id === shotId)
}
function findEntity(doc: ProjectDoc, sceneId: string, entityId: string): Entity | undefined {
  return findScene(doc, sceneId)?.entities.find((e) => e.id === entityId)
}

/* =========================== A) Scene =============================== */

function SceneInspector({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mode = useStore((s) => s.mode)
  const mutate = useMutate()
  const env = scene.environment

  const setEnv = (label: string, fn: (e: Scene['environment']) => void): void => {
    mutate(label, (doc) => {
      const sc = findScene(doc, scene.id)
      if (sc) fn(sc.environment)
    })
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Scene</div>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={scene.name}
            onChange={(e) =>
              mutate('scene name', (doc) => {
                const sc = findScene(doc, scene.id)
                if (sc) sc.name = e.target.value
              })
            }
          />
        </div>
        {mode === 'stage' && (
          <p style={{ color: 'var(--text-faint)', fontSize: 12, lineHeight: 1.5 }}>
            Click a library item, then click the floor to place it.
          </p>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-title">Lighting</div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {LIGHTING.map((l) => (
            <button
              key={l.id}
              className={env.lighting === l.id ? 'active' : ''}
              onClick={() => setEnv('lighting', (e) => (e.lighting = l.id))}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label>Sun azimuth</label>
          <input
            type="range"
            min={0}
            max={Math.PI * 2}
            step={0.01}
            value={env.sunAzimuth}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) setEnv('sun azimuth', (env2) => (env2.sunAzimuth = v))
            }}
          />
        </div>
        <div className="field">
          <label>Sun elevation</label>
          <input
            type="range"
            min={0.1}
            max={1.5}
            step={0.01}
            value={env.sunElevation}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) setEnv('sun elevation', (env2) => (env2.sunElevation = v))
            }}
          />
        </div>
        <div className="field">
          <label>Fog</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={env.fog}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) setEnv('fog', (env2) => (env2.fog = v))
            }}
          />
        </div>
      </div>

      <ShotSection scene={scene} shot={shot} />
    </div>
  )
}

function ShotSection({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mutate = useMutate()
  const setTime = useStore((s) => s.setTime)
  const time = useStore((s) => s.time)

  return (
    <div className="panel-section">
      <div className="panel-title">Shot</div>
      <div className="field">
        <label>Duration (s)</label>
        <input
          type="number"
          min={0.5}
          max={60}
          step={0.5}
          value={shot.duration}
          onChange={(e) => {
            const v = num(e.target.value)
            if (v === null) return
            const next = clamp(v, 0.5, 60)
            mutate('shot duration', (doc) => {
              const sh = findShot(doc, scene.id, shot.id)
              if (!sh) return
              // Duration only — never clamp marks: the blocking take is
              // shared across shots (coverage model) and out-of-range marks
              // are harmless to the evaluator.
              sh.duration = next
            })
            if (time > next) setTime(next)
          }}
        />
      </div>
      <div className="field">
        <label>Aspect</label>
        <div className="seg">
          {ASPECTS.map((a) => (
            <button
              key={a}
              className={shot.aspect === a ? 'active' : ''}
              onClick={() =>
                mutate('shot aspect', (doc) => {
                  const sh = findShot(doc, scene.id, shot.id)
                  if (sh) sh.aspect = a
                })
              }
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Notes</label>
        <textarea
          rows={3}
          value={shot.notes ?? ''}
          onChange={(e) =>
            mutate('shot notes', (doc) => {
              const sh = findShot(doc, scene.id, shot.id)
              if (sh) sh.notes = e.target.value
            })
          }
        />
      </div>
    </div>
  )
}

/* =========================== B) Entity ============================= */

function EntityInspector({
  scene,
  shot,
  entityId
}: {
  scene: Scene
  shot: Shot
  entityId: string
}): JSX.Element {
  const mode = useStore((s) => s.mode)
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)
  const setDroppingMarks = useStore((s) => s.setDroppingMarks)

  const entity = scene.entities.find((e) => e.id === entityId)
  if (!entity) return <div className="panel-section">Entity not found.</div>

  const isPerson = entity.assetId.startsWith('person.')

  const editEntity = (label: string, fn: (e: Entity) => void): void => {
    mutate(label, (doc) => {
      const en = findEntity(doc, scene.id, entityId)
      if (en) fn(en)
    })
  }

  const heightParam = typeof entity.params?.height === 'number' ? entity.params.height : 1
  const buildParam = typeof entity.params?.build === 'number' ? entity.params.build : 1

  // Marks for this entity in the current take.
  const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
  const track = take?.tracks.find((t) => t.entityId === entityId)
  const marks = [...(track?.marks ?? [])].sort((a, b) => a.time - b.time)

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Entity</div>
        <div className="field">
          <label>Name</label>
          <input
            type="text"
            value={entity.name}
            onChange={(e) => editEntity('entity name', (en) => (en.name = e.target.value))}
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>X</label>
            <input
              type="number"
              step={0.1}
              value={entity.transform.position.x}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editEntity('move entity', (en) => (en.transform.position.x = v))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Y</label>
            <input
              type="number"
              step={0.1}
              value={entity.transform.position.y}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editEntity('move entity', (en) => (en.transform.position.y = v))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Z</label>
            <input
              type="number"
              step={0.1}
              value={entity.transform.position.z}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editEntity('move entity', (en) => (en.transform.position.z = v))
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>Rotation°</label>
          <input
            type="number"
            step={1}
            value={toDeg(entity.transform.rotationY)}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editEntity('rotate entity', (en) => (en.transform.rotationY = toRad(v)))
            }}
          />
        </div>
        <div className="field">
          <label>Scale ({entity.transform.scale.toFixed(2)})</label>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.01}
            value={entity.transform.scale}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editEntity('scale entity', (en) => (en.transform.scale = v))
            }}
          />
        </div>
        {isPerson && (
          <>
            <div className="field">
              <label>Height ({heightParam.toFixed(2)})</label>
              <input
                type="range"
                min={0.8}
                max={1.2}
                step={0.01}
                value={heightParam}
                onChange={(e) => {
                  const v = num(e.target.value)
                  if (v !== null)
                    editEntity('entity height', (en) => {
                      en.params = { ...en.params, height: v }
                    })
                }}
              />
            </div>
            <div className="field">
              <label>Build ({buildParam.toFixed(2)})</label>
              <input
                type="range"
                min={0.8}
                max={1.3}
                step={0.01}
                value={buildParam}
                onChange={(e) => {
                  const v = num(e.target.value)
                  if (v !== null)
                    editEntity('entity build', (en) => {
                      en.params = { ...en.params, build: v }
                    })
                }}
              />
            </div>
          </>
        )}
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={entity.excludeFromExport === true}
              onChange={(e) => {
                const hide = e.target.checked
                editEntity('hide in exports', (en) => {
                  if (hide) en.excludeFromExport = true
                  else delete en.excludeFromExport
                })
              }}
              style={{ width: 'auto', marginRight: 6 }}
            />
            Hide in exports
          </label>
        </div>
      </div>

      {isPerson && <PoseSection entity={entity} editEntity={editEntity} />}

      <MarriageSection scene={scene} entity={entity} />


      <div className="panel-section">
        <div className="panel-title">Label</div>
        <div className="field-row" style={{ marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Label text"
            value={entity.label?.text ?? ''}
            onChange={(e) => {
              const text = e.target.value
              editEntity('entity label', (en) => {
                if (text.trim() === '') {
                  delete en.label
                } else {
                  en.label = { text, color: en.label?.color ?? '#f5a524' }
                }
              })
            }}
          />
          <input
            type="color"
            value={entity.label?.color ?? '#f5a524'}
            onChange={(e) => {
              const color = e.target.value
              editEntity('label color', (en) => {
                en.label = { text: en.label?.text ?? '', color }
              })
            }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              onClick={() =>
                editEntity('label color', (en) => {
                  en.label = { text: en.label?.text ?? '', color: c }
                })
              }
            />
          ))}
        </div>
      </div>

      {mode === 'shoot' && (
        <div className="panel-section">
          <div className="panel-title">Blocking</div>
          <button
            className="btn"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => setDroppingMarks(true)}
          >
            Drop marks (M)
          </button>
          {marks.map((m, i) => (
            <div
              key={m.id}
              className="mark-row"
              onClick={() => setSelection({ kind: 'mark', entityId, markId: m.id })}
            >
              Mark {i + 1} — {m.time.toFixed(1)}s — {(m as ActorMark).gait}
            </div>
          ))}
        </div>
      )}

      {mode === 'shoot' && entity.assetId.startsWith('person.') && (
        <MotionPresetsSection scene={scene} shot={shot} entity={entity} />
      )}

      <div className="panel-section">
        <div className="panel-title">Danger zone</div>
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => {
            mutate('delete entity', (doc) => {
              const sc = findScene(doc, scene.id)
              if (!sc) return
              sc.entities = sc.entities.filter((e) => e.id !== entityId)
              for (const take2 of sc.blocking) {
                take2.tracks = take2.tracks.filter((t) => t.entityId !== entityId)
              }
              // Unmount any camera parented to the deleted entity — its
              // local-frame marks would otherwise re-base to world space.
              for (const sh of sc.shots) {
                if (sh.camera.mountEntityId === entityId) delete sh.camera.mountEntityId
              }
            })
            setSelection(null)
          }}
        >
          Delete entity
        </button>
      </div>
    </div>
  )
}

/* ------------------------- motion presets ------------------------------ */

const MOTION_CATEGORIES: { key: MotionPreset['category']; label: string }[] = [
  { key: 'fight', label: 'Fight' },
  { key: 'dance', label: 'Dance' },
  { key: 'gesture', label: 'Gesture' },
  { key: 'stunt', label: 'Stunt' }
]

/**
 * Mixamo-style motion library: applying a preset lays down pose keyframes
 * as marks starting at the playhead — punch, dance, dodge without hand-
 * animating every joint. Marks stay editable afterwards.
 */
function MotionPresetsSection({
  scene,
  shot,
  entity
}: {
  scene: Scene
  shot: Shot
  entity: Entity
}): JSX.Element {
  const mutate = useMutate()
  const time = useStore((s) => s.time)
  const toast = useStore((s) => s.toast)
  const [category, setCategory] = useState<MotionPreset['category']>('fight')

  const apply = (preset: MotionPreset): void => {
    // Where the character stands at the playhead — the motion plays in place.
    const state = new ShotEvaluator(scene, shot).evaluate(time)
    const es = state.entities.find((e) => e.entityId === entity.id)
    const pos = es
      ? { x: es.position.x, y: es.position.y, z: es.position.z }
      : { ...entity.transform.position }
    let added = 0
    mutate(`motion: ${preset.name}`, (doc) => {
      const sc = findScene(doc, scene.id)
      const sh = findShot(doc, scene.id, shot.id)
      const take = sc?.blocking.find((b) => b.id === sh?.blockingTakeId)
      if (!sc || !sh || !take) return
      let track = take.tracks.find((t) => t.entityId === entity.id)
      if (!track) {
        track = { entityId: entity.id, marks: [] }
        take.tracks.push(track)
      }
      for (const kf of preset.keyframes) {
        const t = time + kf.t
        if (t > sh.duration + 1e-6) break
        track.marks.push({
          id: newId('mark'),
          time: t,
          hold: 0,
          easeIn: 0,
          easeOut: 0,
          position: { ...pos },
          gait: 'stand',
          joints: { ...kf.joints }
        })
        added++
      }
    })
    if (added > 0) {
      toast(
        `${preset.name} from ${time.toFixed(1)}s (${added} poses${added < preset.keyframes.length ? ' — extend the shot for the rest' : ''}). Press ▶ to watch.`,
        'success'
      )
    } else {
      toast('No room before the end of the shot — move the playhead earlier.', 'info')
    }
  }

  const items = MOTION_PRESETS.filter((p) => p.category === category)
  return (
    <div className="panel-section">
      <div className="panel-title">Motion presets</div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {MOTION_CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={category === c.key ? 'active' : ''}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {items.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ flex: 1, fontSize: 12 }}>
            {p.name}
            <span style={{ opacity: 0.55 }}> · {p.duration.toFixed(1)}s</span>
          </span>
          <button
            className="btn small"
            onClick={() => apply(p)}
            title={`Insert the ${p.name} move at the playhead as editable pose marks`}
          >
            Apply
          </button>
        </div>
      ))}
    </div>
  )
}

/* ---------------------------- marriage --------------------------------- */

function MarriageSection({ scene, entity }: { scene: Scene; entity: Entity }): JSX.Element {
  const unmarryEntities = useStore((s) => s.unmarryEntities)
  const marryEntities = useStore((s) => s.marryEntities)

  const parent = entity.attachedTo
    ? scene.entities.find((e) => e.id === entity.attachedTo)
    : undefined
  const parentName = parent ? parent.label?.text || parent.name : entity.attachedTo

  return (
    <div className="panel-section">
      <div className="panel-title">Marriage</div>
      {entity.attachedTo ? (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 4 }}>
            Married to {parentName}
          </p>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
            Follows it everywhere. Drag this entity to adjust its riding offset.
          </p>
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={() => unmarryEntities([entity.id])}
          >
            Unmarry
          </button>
        </>
      ) : (
        <div className="field">
          <label>Marry to…</label>
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id) marryEntities([entity.id], id)
            }}
          >
            <option value="">— choose an anchor —</option>
            {scene.entities
              .filter((e) => e.id !== entity.id)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label?.text || e.name}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  )
}

/* ===================== B2) Multi-entity selection ==================== */

function MultiEntityInspector({
  scene,
  entityIds
}: {
  scene: Scene
  entityIds: string[]
}): JSX.Element {
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)
  const marryEntities = useStore((s) => s.marryEntities)
  const unmarryEntities = useStore((s) => s.unmarryEntities)

  const entities = entityIds
    .map((id) => scene.entities.find((e) => e.id === id))
    .filter((e): e is Entity => e != null)

  const anchor = entities[entities.length - 1]
  const anchorName = anchor ? anchor.label?.text || anchor.name : '—'
  const anyMarried = entities.some((e) => e.attachedTo)

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">{entities.length} selected</div>
        {entities.map((e) => (
          <div key={e.id} style={{ color: 'var(--text-dim)', fontSize: 11, padding: '2px 0' }}>
            {e.label?.text || e.name}
          </div>
        ))}
      </div>

      {entities.length >= 2 && (
        <div className="panel-section">
          <div className="panel-title">Marry</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
            The LAST selected is the anchor — the others will follow it.
          </p>
          <button
            className="btn primary"
            style={{ width: '100%', marginBottom: anyMarried ? 8 : 0 }}
            onClick={() => marryEntities(entityIds.slice(0, -1), entityIds[entityIds.length - 1]!)}
          >
            Marry to {anchorName}
          </button>
          {anyMarried && (
            <button
              className="btn"
              style={{ width: '100%' }}
              onClick={() => unmarryEntities(entityIds)}
            >
              Unmarry selected
            </button>
          )}
        </div>
      )}

      <div className="panel-section">
        <div className="panel-title">Danger zone</div>
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => {
            const idSet = new Set(entityIds)
            mutate('delete entities', (doc) => {
              const sc = findScene(doc, scene.id)
              if (!sc) return
              sc.entities = sc.entities.filter((e) => !idSet.has(e.id))
              // Clean blocking tracks for the removed entities.
              for (const take of sc.blocking) {
                take.tracks = take.tracks.filter((t) => !idSet.has(t.entityId))
              }
              // Widow any attachedTo pointers into the removed set.
              for (const e of sc.entities) {
                if (e.attachedTo && idSet.has(e.attachedTo)) {
                  delete e.attachedTo
                  delete e.attachedLocal
                }
              }
              // Clear camera mounts across both shots and drafts.
              const clearMounts = (shots: Shot[] | undefined): void => {
                for (const sh of shots ?? []) {
                  if (sh.camera.mountEntityId && idSet.has(sh.camera.mountEntityId)) {
                    delete sh.camera.mountEntityId
                  }
                  for (const b of sh.cameraBank ?? []) {
                    if (b.camera.mountEntityId && idSet.has(b.camera.mountEntityId)) {
                      delete b.camera.mountEntityId
                    }
                  }
                }
              }
              clearMounts(sc.shots)
              clearMounts(sc.drafts)
            })
            setSelection(null)
          }}
        >
          Delete {entities.length} entities
        </button>
      </div>
    </div>
  )
}

/* ===================== D2) Multi-mark selection ===================== */

function MultiMarkInspector({
  scene,
  shot,
  entityId,
  markIds
}: {
  scene: Scene
  shot: Shot
  entityId: string | 'camera'
  markIds: string[]
}): JSX.Element {
  const mutate = useMutate()
  const [offset, setOffset] = useState(0)

  const isCamera = entityId === 'camera'
  const allLanes = entityId === '*' // "select all marks" spans every lane
  const idSet = new Set(markIds)

  /** Every mark array this selection can touch (camera and/or tracks). */
  const eachTargetList = (
    doc: ProjectDoc,
    fn: (marks: { id: string; time: number }[]) => void
  ): void => {
    const sh = findShotOrDraft(doc, scene.id, shot.id)
    if (!sh) return
    if (allLanes || isCamera) fn(sh.camera.marks)
    if (allLanes || !isCamera) {
      const sc = findScene(doc, scene.id)
      const tk = sc?.blocking.find((b) => b.id === sh.blockingTakeId)
      for (const tr of tk?.tracks ?? []) {
        if (allLanes || tr.entityId === entityId) fn(tr.marks)
      }
    }
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">{markIds.length} marks selected</div>
      </div>

      <div className="panel-section">
        <div className="panel-title">Shift times</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Offset (s)</label>
            <input
              type="number"
              step={0.1}
              value={offset}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) setOffset(v)
              }}
            />
          </div>
          <button
            className="btn"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => {
              mutate('shift marks', (doc) => {
                eachTargetList(doc, (marks) => {
                  for (const m of marks) {
                    if (idSet.has(m.id)) m.time = Math.max(0, m.time + offset)
                  }
                })
              })
            }}
          >
            Apply
          </button>
        </div>
      </div>

      <div className="panel-section">
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => useStore.getState().deleteSelectedMarks()}
        >
          Delete {markIds.length} marks
        </button>
      </div>
    </div>
  )
}

/* ----------------------- camera move presets ------------------------ */

/**
 * Classic camera moves as one-click starting points: pick one, it lays down
 * a full set of marks built around your subject (riding along if the subject
 * moves), then every mark stays editable. Track-style moves also switch on
 * the aim lock.
 */
function CameraMovesSection({ scene }: { scene: Scene }): JSX.Element {
  const [presetId, setPresetId] = useState(CAMERA_MOVE_PRESETS[0]!.id)
  const selection = useStore((s) => s.selection)
  const preset = CAMERA_MOVE_PRESETS.find((p) => p.id === presetId)

  const categories = [...new Set(CAMERA_MOVE_PRESETS.map((p) => p.category))]
  const subjectHint =
    selection?.kind === 'entity'
      ? scene.entities.find((e) => e.id === selection.entityId)
      : scene.entities.find((e) => e.assetId.startsWith('person.'))

  return (
    <div className="panel-section">
      <div className="panel-title">Camera moves</div>
      <div className="field">
        <label>
          {CAMERA_MOVE_PRESETS.length} classic moves — built around{' '}
          {subjectHint ? subjectHint.label?.text || subjectHint.name : 'your subject'}
        </label>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {categories.map((cat) => (
            <optgroup key={cat} label={cat.toUpperCase()}>
              {CAMERA_MOVE_PRESETS.filter((p) => p.category === cat).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {preset && (
        <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
          {preset.description}
          {preset.track ? ' Aim-locks onto the subject.' : ''}
        </p>
      )}
      <button
        className="btn primary"
        style={{ width: '100%' }}
        onClick={() => getSceneManager()?.applyCameraMove(presetId)}
        title="Replaces this camera's marks with the move (one undo step). Select an entity first to build the move around it; otherwise the first character is used."
      >
        Apply move
      </button>
    </div>
  )
}

/* =========================== C) Camera ============================= */

function CameraInspector({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)
  const switchCamera = useStore((s) => s.switchCamera)
  const addCameraToShot = useStore((s) => s.addCameraToShot)
  const clearCameraMarks = useStore((s) => s.clearCameraMarks)

  const cam = shot.camera
  const orderedMarks = [...cam.marks].sort((a, b) => a.time - b.time)
  const lastMark = orderedMarks[orderedMarks.length - 1]
  const currentFocal = lastMark?.focalLength ?? 35
  const rigSpec = RIGS[cam.rig]
  const activeCamName = shot.cameraName ?? 'A'

  // A camera edit may target the current shot even when it is a draft.
  const editCam = (label: string, fn: (c: Shot['camera']) => void): void => {
    mutate(label, (doc) => {
      const sh = findShotOrDraft(doc, scene.id, shot.id)
      if (sh) fn(sh.camera)
    })
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Cameras (A/B/C)</div>
        <div className="seg">
          <button
            className="active"
            onClick={() => switchCamera(activeCamName)}
          >
            {activeCamName}
          </button>
          {(shot.cameraBank ?? []).map((b) => (
            <button key={b.name} onClick={() => switchCamera(b.name)}>
              {b.name}
            </button>
          ))}
          <button onClick={() => addCameraToShot()} title="Add a camera">
            +
          </button>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">Camera</div>
        <div className="field">
          <label>Sensor</label>
          <select
            value={cam.sensorId}
            onChange={(e) => {
              const id = e.target.value as SensorId
              editCam('sensor', (c) => (c.sensorId = id))
            }}
          >
            {Object.values(SENSORS).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Lens</label>
          <div className="seg">
            {LENS_SET.map((fl) => (
              <button
                key={fl}
                className={currentFocal === fl ? 'active' : ''}
                onClick={() => emit('setLens', { focalLength: fl })}
              >
                {fl}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Auto-frame subject</label>
          <div className="seg">
            {SHOT_SIZE_BTNS.map((sz) => (
              <button key={sz} onClick={() => emit('frameSubject', { size: sz })}>
                {sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">Track subject</div>
        <div className="field">
          <label>Keep the camera aimed at…</label>
          <select
            value={cam.trackEntityId ?? ''}
            onChange={(e) =>
              editCam('track subject', (c) => {
                if (e.target.value) c.trackEntityId = e.target.value
                else delete c.trackEntityId
              })
            }
            title="Aim lock: no matter how the camera position moves — marks, a recorded flight, a preset — it stays pointed at this subject. Drone tracking a plane, operator following an actor."
          >
            <option value="">— aim by marks (off) —</option>
            {scene.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label?.text || e.name}
              </option>
            ))}
          </select>
        </div>
        {cam.trackEntityId && (
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
            Tracking on: move the camera any way you like — drop marks, record a flight, apply a
            move preset — the lens stays glued to the subject. Focus follows it too when a mark
            sets a focus distance.
          </p>
        )}
      </div>

      <CameraMovesSection scene={scene} />

      <div className="panel-section">
        <div className="panel-title">Rig</div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {(Object.keys(RIGS) as RigId[]).map((id) => (
            <button
              key={id}
              className={cam.rig === id ? 'active' : ''}
              onClick={() => editCam('rig', (c) => (c.rig = id))}
            >
              {RIGS[id].name}
            </button>
          ))}
        </div>
        <p style={{ color: 'var(--text-faint)', fontSize: 11, marginBottom: 10 }}>
          {rigSpec.description}
        </p>
        {(cam.rig === 'handheld' || cam.rig === 'steadicam') && (
          <div className="field">
            <label>Intensity ({cam.rigIntensity.toFixed(2)})</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cam.rigIntensity}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editCam('rig intensity', (c) => (c.rigIntensity = v))
              }}
            />
          </div>
        )}
        {cam.rig === 'carMount' && (
          <div className="field">
            <label>Mount to</label>
            <select
              value={cam.mountEntityId ?? ''}
              onChange={(e) => {
                const id = e.target.value || undefined
                editCam('mount entity', (c) => (c.mountEntityId = id))
              }}
            >
              <option value="">— none —</option>
              {scene.entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.label?.text || en.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-title">Marks</div>
        <button
          className="btn primary"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => emit('dropCameraMarkAtView', {})}
        >
          Drop camera mark at view (or M)
        </button>
        {orderedMarks.map((m, i) => (
          <div
            key={m.id}
            className="mark-row"
            onClick={() => setSelection({ kind: 'mark', entityId: 'camera', markId: m.id })}
          >
            Mark {i + 1} — {m.time.toFixed(1)}s — {m.focalLength}mm
          </div>
        ))}
        {orderedMarks.length > 0 && (
          <button
            className="btn danger"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => clearCameraMarks()}
          >
            Clear camera move (delete all marks)
          </button>
        )}
      </div>
    </div>
  )
}

/* =========================== D) Mark =============================== */

function MarkInspector({
  scene,
  shot,
  entityId,
  markId
}: {
  scene: Scene
  shot: Shot
  entityId: string | 'camera'
  markId: string
}): JSX.Element {
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)

  const isCamera = entityId === 'camera'
  const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
  const track = isCamera ? null : take?.tracks.find((t) => t.entityId === entityId)
  const list: (CameraMark | ActorMark)[] = isCamera ? shot.camera.marks : (track?.marks ?? [])
  const ordered = [...list].sort((a, b) => a.time - b.time)
  const mark = list.find((m) => m.id === markId)

  if (!mark) return <div className="panel-section">Mark not found.</div>

  const index = ordered.findIndex((m) => m.id === markId) + 1
  const actorMark = isCamera ? null : (mark as ActorMark)
  const cameraMark = isCamera ? (mark as CameraMark) : null
  const duration = shot.duration

  const editMark = (label: string, fn: (m: CameraMark | ActorMark) => void): void => {
    mutate(label, (doc) => {
      const sh = findShot(doc, scene.id, shot.id)
      if (!sh) return
      let target: (CameraMark | ActorMark) | undefined
      if (isCamera) {
        target = sh.camera.marks.find((m) => m.id === markId)
      } else {
        const sc = findScene(doc, scene.id)
        const tk = sc?.blocking.find((b) => b.id === sh.blockingTakeId)
        target = tk?.tracks.find((t) => t.entityId === entityId)?.marks.find((m) => m.id === markId)
      }
      if (target) fn(target)
    })
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">Mark {index}</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>Arrive (s)</label>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={mark.time}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark time', (m) => (m.time = clamp(v, 0, duration)))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Hold (s)</label>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={mark.hold}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark hold', (m) => (m.hold = clamp(v, 0, duration)))
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>Ease out ({mark.easeOut.toFixed(2)})</label>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={mark.easeOut}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editMark('ease out', (m) => (m.easeOut = v))
            }}
          />
        </div>
        <div className="field">
          <label>Ease in ({mark.easeIn.toFixed(2)})</label>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={mark.easeIn}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editMark('ease in', (m) => (m.easeIn = v))
            }}
          />
        </div>
      </div>

      {actorMark && (
        <div className="panel-section">
          <div className="panel-title">Gait</div>
          <div className="seg gait-grid">
            {(Object.keys(GAITS) as GaitId[]).map((g) => (
              <button
                key={g}
                className={actorMark.gait === g ? 'active' : ''}
                onClick={() => editMark('gait', (m) => ((m as ActorMark).gait = g))}
              >
                {g}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>Altitude (m) — 0 is the ground; raise it to fly</label>
            <input
              type="number"
              min={0}
              max={200}
              step={0.1}
              value={actorMark.position.y}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark altitude', (m) => (m.position.y = clamp(v, 0, 200)))
              }}
            />
          </div>
        </div>
      )}

      {actorMark && (
        <div className="panel-section">
          <div className="panel-title">Board on arrival</div>
          <div className="field">
            <label>After reaching this mark, ride…</label>
            <select
              value={actorMark.attachTo ?? ''}
              onChange={(e) =>
                editMark('board target', (m) => {
                  (m as ActorMark).attachTo = e.target.value || undefined
                })
              }
              title="Boarding: walk to this mark, then attach to a vehicle/prop and move with it — step onto a bus and ride away"
            >
              <option value="">— stay on foot —</option>
              {scene.entities
                .filter((e) => e.id !== entityId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {actorMark && <MarkPoseSection mark={actorMark} editMark={editMark} />}

      {cameraMark && (
        <div className="panel-section">
          <div className="panel-title">Optics</div>
          <div className="field">
            <label>Focal length (mm)</label>
            <input
              type="number"
              min={8}
              max={300}
              step={1}
              value={cameraMark.focalLength}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null)
                  editMark('focal length', (m) => ((m as CameraMark).focalLength = clamp(v, 8, 300)))
              }}
            />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={cameraMark.focusDistance === undefined}
                onChange={(e) => {
                  const deep = e.target.checked
                  editMark('focus mode', (m) => {
                    (m as CameraMark).focusDistance = deep ? undefined : 3
                  })
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              ∞ deep focus
            </label>
          </div>
          {cameraMark.focusDistance !== undefined && (
            <div className="field">
              <label>Focus distance (m)</label>
              <input
                type="number"
                min={0.3}
                max={100}
                step={0.1}
                value={cameraMark.focusDistance}
                onChange={(e) => {
                  const v = num(e.target.value)
                  if (v !== null)
                    editMark('focus distance', (m) => ((m as CameraMark).focusDistance = clamp(v, 0.3, 100)))
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="panel-section">
        <div className="panel-title">Position</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>X</label>
            <input
              type="number"
              step={0.1}
              value={mark.position.x}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark X', (m) => (m.position.x = v))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Z</label>
            <input
              type="number"
              step={0.1}
              value={mark.position.z}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark Z', (m) => (m.position.z = v))
              }}
            />
          </div>
        </div>
      </div>

      <div className="panel-section">
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => {
            mutate('delete mark', (doc) => {
              const sh = findShot(doc, scene.id, shot.id)
              if (!sh) return
              if (isCamera) {
                sh.camera.marks = sh.camera.marks.filter((m) => m.id !== markId)
              } else {
                const sc = findScene(doc, scene.id)
                const tk = sc?.blocking.find((b) => b.id === sh.blockingTakeId)
                const tr = tk?.tracks.find((t) => t.entityId === entityId)
                if (tr) tr.marks = tr.marks.filter((m) => m.id !== markId)
              }
            })
            setSelection(null)
          }}
        >
          Delete mark
        </button>
      </div>
    </div>
  )
}

/* ------------------------------- pose ----------------------------------- */

const POSES: { id: GaitId; label: string }[] = [
  { id: 'stand', label: 'Stand' },
  { id: 'sit', label: 'Sit' },
  { id: 'crouch', label: 'Crouch' },
  { id: 'lie', label: 'Lie' },
  { id: 'gesture', label: 'Talk' },
  { id: 'fall', label: 'Fallen' }
]

const JOINTS: { key: string; label: string; range: number }[] = [
  { key: 'shoulderLX', label: 'L arm fwd', range: 180 },
  { key: 'shoulderRX', label: 'R arm fwd', range: 180 },
  { key: 'shoulderLZ', label: 'L arm out', range: 150 },
  { key: 'shoulderRZ', label: 'R arm out', range: 150 },
  { key: 'elbowL', label: 'L elbow', range: 150 },
  { key: 'elbowR', label: 'R elbow', range: 150 },
  { key: 'hipLX', label: 'L leg', range: 120 },
  { key: 'hipRX', label: 'R leg', range: 120 },
  { key: 'kneeL', label: 'L knee', range: 150 },
  { key: 'kneeR', label: 'R knee', range: 150 },
  { key: 'torsoX', label: 'Torso lean', range: 60 },
  { key: 'torsoY', label: 'Torso twist', range: 80 },
  { key: 'headY', label: 'Head turn', range: 80 },
  { key: 'headX', label: 'Head nod', range: 45 }
]

const DEG = 180 / Math.PI

function PoseSection({
  entity,
  editEntity
}: {
  entity: Entity
  editEntity: (label: string, fn: (e: Entity) => void) => void
}): JSX.Element {
  const pose = typeof entity.params?.pose === 'string' ? entity.params.pose : 'stand'
  const hasOverrides = Object.keys(entity.params ?? {}).some(
    (k) => k.startsWith('joint_') && entity.params![k] !== 0
  )

  return (
    <div className="panel-section">
      <div className="panel-title">Pose</div>
      <div className="seg gait-grid" style={{ marginBottom: 10 }}>
        {POSES.map((p) => (
          <button
            key={p.id}
            className={pose === p.id ? 'active' : ''}
            onClick={() =>
              editEntity('entity pose', (en) => {
                en.params = { ...en.params, pose: p.id }
              })
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
        The pose applies while the actor has no marks; marks override it with their own gait.
      </p>
      <details open={hasOverrides}>
        <summary
          style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}
        >
          Pose limbs (fight / dance blocking)
        </summary>
        {JOINTS.map((j) => {
          const raw = entity.params?.[`joint_${j.key}`]
          const rad = typeof raw === 'number' ? raw : 0
          const deg = Math.round(rad * DEG)
          return (
            <div className="field" key={j.key} style={{ marginBottom: 6 }}>
              <label>
                {j.label} ({deg}°)
              </label>
              <input
                type="range"
                min={-j.range}
                max={j.range}
                step={1}
                value={deg}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isNaN(v)) return
                  editEntity('pose joint', (en) => {
                    en.params = { ...en.params, [`joint_${j.key}`]: v / DEG }
                  })
                }}
              />
            </div>
          )
        })}
        <button
          className="btn small"
          style={{ width: '100%', marginTop: 4 }}
          onClick={() =>
            editEntity('reset pose', (en) => {
              if (!en.params) return
              for (const k of Object.keys(en.params)) {
                if (k.startsWith('joint_')) delete en.params[k]
              }
            })
          }
        >
          Reset limbs
        </button>
      </details>
    </div>
  )
}

/**
 * Pose at a mark: joint offsets held at this mark and interpolated between
 * marks by the evaluator — keyframed limb choreography (fights, dances).
 * Reuses the same JOINTS table as the entity-level PoseSection.
 */
function MarkPoseSection({
  mark,
  editMark
}: {
  mark: ActorMark
  editMark: (label: string, fn: (m: CameraMark | ActorMark) => void) => void
}): JSX.Element {
  const hasPose = Object.values(mark.joints ?? {}).some((v) => v !== 0)

  return (
    <div className="panel-section">
      <div className="panel-title">Pose at this mark</div>
      <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
        Limbs blend from the previous mark's pose to this one while travelling — set different
        poses on successive marks to choreograph a move.
      </p>
      <details open={hasPose}>
        <summary
          style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}
        >
          Joint keyframes
        </summary>
        {JOINTS.map((j) => {
          const rad = mark.joints?.[j.key] ?? 0
          const deg = Math.round(rad * DEG)
          return (
            <div className="field" key={j.key} style={{ marginBottom: 6 }}>
              <label>
                {j.label} ({deg}°)
              </label>
              <input
                type="range"
                min={-j.range}
                max={j.range}
                step={1}
                value={deg}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isNaN(v)) return
                  editMark('mark pose', (m) => {
                    const am = m as ActorMark
                    am.joints = { ...am.joints, [j.key]: v / DEG }
                  })
                }}
              />
            </div>
          )
        })}
        <button
          className="btn small"
          style={{ width: '100%', marginTop: 4 }}
          onClick={() =>
            editMark('reset mark pose', (m) => {
              delete (m as ActorMark).joints
            })
          }
        >
          Reset pose at this mark
        </button>
      </details>
    </div>
  )
}
