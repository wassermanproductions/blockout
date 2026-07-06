/**
 * Viewport — React shell around SceneManager: canvas lifecycle, the shot
 * HUD, look-through framing overlays (thirds grid), placement/mark hints,
 * empty states, and the reference-video underlay.
 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { emit } from '../bus'
import { SceneManager } from './SceneManager'
import { registerSceneManager, getSceneManager as getSceneManagerSafe } from '../export/scene-access'
import { ReferenceUnderlay, ReferenceControls } from './ReferenceUnderlay'
import { LENS_SET, SHOT_SIZES } from '@engine/camera'
import type { AspectId, ShotSizeId } from '@engine/types'

const ASPECT_ORDER: AspectId[] = ['16:9', '9:16', '2.39:1', '4:3', '1:1']

function Hud(): JSX.Element | null {
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const shotId = useStore((s) => s.shotId)
  const time = useStore((s) => s.time)
  const mutate = useStore((s) => s.mutate)
  const mode = useStore((s) => s.mode)

  const scene = doc?.scenes.find((s) => s.id === sceneId)
  const shot = scene?.shots.find((s) => s.id === shotId)
  if (!shot) return null

  // Lens at playhead (from marks; default 35).
  const sorted = [...shot.camera.marks].sort((a, b) => a.time - b.time)
  let lens = sorted[0]?.focalLength ?? 35
  for (const m of sorted) if (m.time <= time + 1e-6) lens = m.focalLength

  const cycleLens = (): void => {
    const idx = LENS_SET.findIndex((l) => l >= Math.round(lens))
    const next = LENS_SET[(Math.max(0, idx) + 1) % LENS_SET.length]!
    emit('setLens', { focalLength: next })
  }

  const cycleAspect = (): void => {
    const idx = ASPECT_ORDER.indexOf(shot.aspect)
    const next = ASPECT_ORDER[(idx + 1) % ASPECT_ORDER.length]!
    mutate('aspect', (doc) => {
      for (const sc of doc.scenes) {
        const sh = sc.shots.find((x) => x.id === shot.id)
        if (sh) sh.aspect = next
      }
    })
  }

  return (
    <div className="hud">
      <button onClick={cycleLens} title="Focal length (click to cycle)">
        <span className="hud-label">LENS</span>
        {Math.round(lens)}mm
      </button>
      <button onClick={cycleAspect} title="Aspect ratio (click to cycle)">
        <span className="hud-label">AR</span>
        {shot.aspect}
      </button>
      <button title="Shot duration — edit in the timeline">
        <span className="hud-label">DUR</span>
        {shot.duration.toFixed(1)}s
      </button>
      <button title="Frame rate">
        <span className="hud-label">FPS</span>
        {shot.fps}
      </button>
      {mode === 'shoot' && (
        <button title="Camera marks in this shot">
          <span className="hud-label">MARKS</span>
          {shot.camera.marks.length}
        </button>
      )}
    </div>
  )
}

function ShotSizeRow(): JSX.Element {
  const sizes: ShotSizeId[] = ['WS', 'FS', 'MS', 'MCU', 'CU']
  return (
    <div className="tool-row">
      {sizes.map((size) => (
        <button
          key={size}
          className="btn small"
          title={`Auto-frame: ${SHOT_SIZES[size].name}`}
          onClick={() => emit('frameSubject', { size })}
        >
          {size}
        </button>
      ))}
    </div>
  )
}

function GizmoModeRow(): JSX.Element {
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate')
  const apply = (m: 'translate' | 'rotate'): void => {
    setMode(m)
    getSceneManagerSafe()?.setGizmoMode(m)
  }
  return (
    <div className="tool-row">
      <button
        className={`btn small ${mode === 'translate' ? 'active' : ''}`}
        onClick={() => apply('translate')}
        title="Move the selection with the gizmo arrows (G)"
      >
        ⇄ Move
      </button>
      <button
        className={`btn small ${mode === 'rotate' ? 'active' : ''}`}
        onClick={() => apply('rotate')}
        title="Rotate the selection — spin people, cars, props, the camera (R)"
      >
        ⟳ Rotate
      </button>
    </div>
  )
}

export function Viewport(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewRect, setViewRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [pipRect, setPipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const mode = useStore((s) => s.mode)
  const lookThrough = useStore((s) => s.lookThrough)
  const setLookThrough = useStore((s) => s.setLookThrough)
  const pipSize = useStore((s) => s.pipSize)
  const setPipSize = useStore((s) => s.setPipSize)
  const recording = useStore((s) => s.recording)
  const setRecording = useStore((s) => s.setRecording)
  const placingAssetId = useStore((s) => s.placingAssetId)
  const droppingMarks = useStore((s) => s.droppingMarks)
  const selection = useStore((s) => s.selection)
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const setSelection = useStore((s) => s.setSelection)
  const setDroppingMarks = useStore((s) => s.setDroppingMarks)

  const scene = doc?.scenes.find((s) => s.id === sceneId)
  const hasEntities = (scene?.entities.length ?? 0) > 0
  const hasMarks =
    (scene?.shots.some((sh) => sh.camera.marks.length > 0) ?? false) ||
    (scene?.blocking.some((b) => b.tracks.some((t) => t.marks.length > 0)) ?? false)

  useEffect(() => {
    if (!canvasRef.current) return
    const manager = new SceneManager(canvasRef.current)
    manager.onViewRect = (rect) => setViewRect(rect)
    manager.onPipRect = (rect) =>
      setPipRect((prev) =>
        prev?.x === rect?.x && prev?.y === rect?.y && prev?.w === rect?.w && prev?.h === rect?.h
          ? prev
          : rect
      )
    registerSceneManager(manager)
    return () => {
      registerSceneManager(null)
      manager.dispose()
    }
  }, [])

  const showLetterbox = (lookThrough || mode === 'deliver') && viewRect

  const singleEntitySelected = selection?.kind === 'entity'

  let hint: string | null = null
  if (placingAssetId) hint = 'Click the floor to place · ⌥-click to place multiple · Esc to cancel'
  else if (droppingMarks && selection?.kind === 'entity')
    hint = 'Click the floor to drop marks in order · Esc when done'
  else if (droppingMarks && selection?.kind === 'camera')
    hint = 'Click the floor to drop a camera mark · or use “Drop camera mark at view”'
  else if (selection?.kind === 'entities')
    hint = `${selection.entityIds.length} selected — drag moves the group · Marry in the inspector · ⌫ deletes all`

  return (
    <>
      <canvas ref={canvasRef} />
      {mode !== 'deliver' && <Hud />}
      {mode !== 'deliver' && (
        <div className="viewport-tools">
          {mode === 'shoot' && (
            <div className="tool-row">
              <button
                className={`btn small ${lookThrough ? 'active' : ''}`}
                onClick={() => setLookThrough(!lookThrough)}
                title="Look through the shot camera (C)"
              >
                🎥 Look through
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setSelection({ kind: 'camera' })
                  emit('dropCameraMarkAtView', {})
                }}
                title="Drop a camera mark at the current view"
              >
                + Cam mark
              </button>
              <button
                className={`btn small ${droppingMarks ? 'active' : ''}`}
                onClick={() => setDroppingMarks(!droppingMarks)}
                disabled={!selection}
                title="Drop marks for the selection by clicking the floor (M)"
              >
                + Marks
              </button>
              <button
                className={`btn small ${recording ? 'active' : ''}`}
                style={recording ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
                onClick={() => setRecording(!recording)}
                title={
                  singleEntitySelected
                    ? 'Record THIS character/vehicle: puppeteer it with the cursor; other motion replays underneath'
                    : 'Record the camera: fly the viewport; existing blocking replays while you record'
                }
              >
                {recording ? '■ Stop' : singleEntitySelected ? '● Record performer' : '● Record camera'}
              </button>
              <ReferenceControls />
            </div>
          )}
          {mode === 'shoot' && <ShotSizeRow />}
          <GizmoModeRow />
        </div>
      )}
      {mode === 'shoot' && <ReferenceUnderlay />}

      {/* PiP live shot preview chrome */}
      {pipRect && !lookThrough && mode !== 'deliver' && (
        <div
          style={{
            position: 'absolute',
            left: pipRect.x - 1,
            top: pipRect.y - 1,
            width: pipRect.w + 2,
            height: pipRect.h + 2,
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            zIndex: 5,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -26,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'auto'
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
              SHOT PREVIEW
            </span>
            <span style={{ flex: 1 }} />
            <button
              className="btn small"
              style={{ padding: '2px 7px', fontSize: 10 }}
              title="Cycle preview size"
              onClick={() =>
                setPipSize(pipSize === 'small' ? 'medium' : pipSize === 'medium' ? 'large' : 'small')
              }
            >
              {pipSize === 'small' ? 'S' : pipSize === 'medium' ? 'M' : 'L'}
            </button>
            <button
              className="btn small"
              style={{ padding: '2px 7px', fontSize: 10 }}
              title="Hide preview"
              onClick={() => setPipSize('off')}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {pipSize === 'off' && !lookThrough && mode !== 'deliver' && (
        <button
          className="btn small"
          style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 5 }}
          onClick={() => setPipSize('medium')}
          title="Show the live shot preview"
        >
          🎥 Preview
        </button>
      )}
      {recording && (
        <div className="viewport-hint" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {singleEntitySelected
            ? '● REC — move the cursor over the floor; the performer chases it. ■ Stop saves the performance.'
            : '● REC — fly the view (orbit/pan/zoom); this is the shot. ■ Stop saves the move.'}
        </div>
      )}

      {showLetterbox && viewRect && (
        <div
          style={{
            position: 'absolute',
            left: viewRect.x,
            top: viewRect.y,
            width: viewRect.w,
            height: viewRect.h,
            pointerEvents: 'none',
            zIndex: 4
          }}
        >
          {/* Rule-of-thirds grid */}
          {[1, 2].map((i) => (
            <div
              key={`v${i}`}
              style={{
                position: 'absolute',
                left: `${(i / 3) * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(255,255,255,0.14)'
              }}
            />
          ))}
          {[1, 2].map((i) => (
            <div
              key={`h${i}`}
              style={{
                position: 'absolute',
                top: `${(i / 3) * 100}%`,
                left: 0,
                right: 0,
                height: 1,
                background: 'rgba(255,255,255,0.14)'
              }}
            />
          ))}
          {/* Action-safe area */}
          <div
            style={{
              position: 'absolute',
              inset: '5%',
              border: '1px solid rgba(255,255,255,0.10)'
            }}
          />
        </div>
      )}

      {hint && <div className="viewport-hint">{hint}</div>}

      {!hasEntities && mode === 'stage' && (
        <div className="empty-state">
          <div style={{ fontSize: 36 }}>🎬</div>
          <div>Click a library item, then click the floor to place it.</div>
        </div>
      )}
      {hasEntities && !hasMarks && mode === 'shoot' && !droppingMarks && (
        <div className="empty-state">
          <div>Select an actor or the camera, press M, then click the floor to drop marks.</div>
        </div>
      )}
    </>
  )
}
