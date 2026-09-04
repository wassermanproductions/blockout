// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Viewport — React shell around SceneManager: canvas lifecycle, the shot
 * HUD, look-through framing overlays (thirds grid), placement/mark hints,
 * empty states, and the reference-video underlay.
 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { emit, type FramingKind } from '../bus'
import { SceneManager } from './SceneManager'
import { registerSceneManager, getSceneManager as getSceneManagerSafe } from '../export/scene-access'
import { ReferenceUnderlay, ReferenceControls } from './ReferenceUnderlay'
import { LENS_SET, SHOT_SIZES } from '@engine/camera'
import type { AspectId, ShotSizeId } from '@engine/types'
import { tOr } from '../../i18n/core'
import { useT } from '../../i18n/react'

const ASPECT_ORDER: AspectId[] = ['16:9', '9:16', '2.39:1', '4:3', '1:1']

function Hud(): JSX.Element | null {
  const t = useT()
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const shotId = useStore((s) => s.shotId)
  const time = useStore((s) => s.time)
  const mutate = useStore((s) => s.mutate)
  const mode = useStore((s) => s.mode)
  const showMarks = useStore((s) => s.showMarks)
  const showPaths = useStore((s) => s.showPaths)
  const setShowMarks = useStore((s) => s.setShowMarks)
  const setShowPaths = useStore((s) => s.setShowPaths)

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
      <button onClick={cycleLens} title={t('viewport.lensTitle')}>
        <span className="hud-label">{t('viewport.lens')}</span>
        {Math.round(lens)}mm
      </button>
      <button onClick={cycleAspect} title={t('viewport.arTitle')}>
        <span className="hud-label">{t('viewport.ar')}</span>
        {shot.aspect}
      </button>
      <button title={t('viewport.durTitle')}>
        <span className="hud-label">{t('viewport.dur')}</span>
        {shot.duration.toFixed(1)}s
      </button>
      <button title={t('viewport.fpsTitle')}>
        <span className="hud-label">{t('viewport.fps')}</span>
        {shot.fps}
      </button>
      {mode === 'shoot' && (
        <button title={t('viewport.marksCountTitle')}>
          <span className="hud-label">{t('viewport.marks')}</span>
          {shot.camera.marks.length}
        </button>
      )}
      <button
        className={showMarks ? 'active' : ''}
        onClick={() => setShowMarks(!showMarks)}
        title={t('viewport.marksToggle')}
      >
        <span className="hud-label">{showMarks ? '👁' : '🚫'}</span>
        {t('viewport.marks')}
      </button>
      <button
        className={showPaths ? 'active' : ''}
        onClick={() => setShowPaths(!showPaths)}
        title={t('viewport.pathsToggle')}
      >
        <span className="hud-label">{showPaths ? '👁' : '🚫'}</span>
        {t('viewport.paths')}
      </button>
    </div>
  )
}

function ShotSizeRow(): JSX.Element {
  const t = useT()
  const sizes: ShotSizeId[] = ['WS', 'FS', 'MS', 'MCU', 'CU']
  return (
    <div className="tool-row">
      {sizes.map((size) => (
        <button
          key={size}
          className="btn small"
          title={t('viewport.autoFrame', { name: tOr(`shotSize.${size}`, SHOT_SIZES[size].name) })}
          onClick={() => emit('frameSubject', { size })}
        >
          {size}
        </button>
      ))}
    </div>
  )
}

/** Recording feel: how tightly recordings chase the mouse. */
function RecordControlToggle(): JSX.Element {
  const t = useT()
  const recordControl = useStore((s) => s.recordControl)
  const setRecordControl = useStore((s) => s.setRecordControl)
  const next = { precise: 'normal', normal: 'fast', fast: 'precise' } as const
  const label = { precise: t('viewport.precise'), normal: t('viewport.normal'), fast: t('viewport.fast') } as const
  return (
    <button
      className="btn small"
      onClick={() => setRecordControl(next[recordControl])}
      title={t('viewport.recordControlTitle')}
    >
      {label[recordControl]}
    </button>
  )
}

/** One-click cinematography framings — writes the active camera mark. */
function FramingRow(): JSX.Element {
  const t = useT()
  const framings: { kind: FramingKind; label: string; title: string }[] = [
    { kind: '2S', label: t('viewport.framing2SLabel'), title: t('viewport.framing2S') },
    { kind: 'OTS', label: t('viewport.framingOTSLabel'), title: t('viewport.framingOTS') },
    { kind: 'REV', label: t('viewport.framingREVLabel'), title: t('viewport.framingREV') },
    { kind: 'TOP', label: t('viewport.framingTOPLabel'), title: t('viewport.framingTOP') },
    { kind: 'LOW', label: t('viewport.framingLOWLabel'), title: t('viewport.framingLOW') },
    { kind: 'DUTCH', label: t('viewport.framingDUTCHLabel'), title: t('viewport.framingDUTCH') }
  ]
  return (
    <div className="tool-row">
      {framings.map((f) => (
        <button key={f.kind} className="btn small" title={f.title} onClick={() => emit('applyFraming', { kind: f.kind })}>
          {f.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Take bar — the Rehearse → Record → Review loop. Purely composes existing
 * store/SceneManager calls: it wraps beginRecording/finishRecording with a
 * 3-2-1 countdown and forces path ribbons on while rehearsing.
 */
function TakeBar(): JSX.Element {
  const t = useT()
  const recording = useStore((s) => s.recording)
  const selection = useStore((s) => s.selection)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [pending, setPending] = useState<'camera' | 'performer' | null>(null)

  const singleEntity = selection?.kind === 'entity'

  // Tick the 3-2-1 countdown; at zero, arm the selection and start recording.
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      const s = useStore.getState()
      if (pending === 'camera') s.setSelection({ kind: 'camera' })
      s.setLookThrough(false)
      s.setTime(0)
      s.setRecording(true)
      setCountdown(null)
      setPending(null)
      return
    }
    const id = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800)
    return () => window.clearTimeout(id)
  }, [countdown, pending])

  const rehearse = (): void => {
    const s = useStore.getState()
    s.setShowPaths(true)
    s.setRecording(false)
    s.setLookThrough(false)
    s.setTime(0)
    s.setPlaying(true)
  }
  const review = (): void => {
    const s = useStore.getState()
    s.setRecording(false)
    s.setLookThrough(true)
    s.setTime(0)
    s.setPlaying(true)
  }
  const startCountdown = (which: 'camera' | 'performer'): void => {
    const s = useStore.getState()
    s.setPlaying(false)
    setPending(which)
    setCountdown(3)
  }
  const cancel = (): void => {
    setCountdown(null)
    setPending(null)
  }

  return (
    <>
      <div className="tool-row" title={t('viewport.takeLoop')}>
        <button
          className="btn small"
          onClick={rehearse}
          disabled={recording || countdown !== null}
          title={t('viewport.rehearseTitle')}
        >
          {t('viewport.rehearse')}
        </button>
        {recording ? (
          <button
            className="btn small"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => useStore.getState().setRecording(false)}
            title={t('viewport.stopTakeTitle')}
          >
            {t('viewport.stopTake')}
          </button>
        ) : (
          <>
            <button
              className="btn small"
              onClick={() => startCountdown('camera')}
              disabled={countdown !== null}
              title={t('viewport.recordCameraTitle')}
            >
              {t('viewport.recordCamera')}
            </button>
            <button
              className="btn small"
              onClick={() => startCountdown('performer')}
              disabled={countdown !== null || !singleEntity}
              title={singleEntity ? t('viewport.recordPerformanceTitle') : t('viewport.selectToRecord')}
            >
              {t('viewport.recordPerformance')}
            </button>
          </>
        )}
        <button
          className="btn small"
          onClick={review}
          disabled={recording || countdown !== null}
          title={t('viewport.reviewTitle')}
        >
          {t('viewport.review')}
        </button>
      </div>
      {countdown !== null && countdown > 0 && (
        <div
          onClick={cancel}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            pointerEvents: 'auto',
            cursor: 'pointer',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35), rgba(0,0,0,0.55))'
          }}
          title={t('viewport.cancelCountdown')}
        >
          <div
            style={{
              fontSize: 120,
              fontWeight: 800,
              color: 'var(--danger)',
              textShadow: '0 2px 24px rgba(0,0,0,0.6)',
              lineHeight: 1
            }}
          >
            {countdown}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-faint)' }}>
            {pending === 'performer' ? t('viewport.recordingPerformance') : t('viewport.recordingCamera')}
          </div>
        </div>
      )}
    </>
  )
}

function GizmoModeRow(): JSX.Element {
  const t = useT()
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
        title={t('viewport.moveTitle')}
      >
        {t('viewport.move')}
      </button>
      <button
        className={`btn small ${mode === 'rotate' ? 'active' : ''}`}
        onClick={() => apply('rotate')}
        title={t('viewport.rotateTitle')}
      >
        {t('viewport.rotate')}
      </button>
    </div>
  )
}

export function Viewport(): JSX.Element {
  const t = useT()
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
  const placingSequence = useStore((s) => s.placingSequence)
  const placingChoreography = useStore((s) => s.placingChoreography)
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

  const choreoKindLabel =
    placingChoreography?.kind === 'dance'
      ? t('viewport.kindDance')
      : placingChoreography?.kind === 'fight'
        ? t('viewport.kindFight')
        : t('viewport.kindChase')

  let hint: string | null = null
  if (placingChoreography)
    hint = t('viewport.hintChoreo', { kind: choreoKindLabel })
  else if (placingSequence)
    hint = t('viewport.hintSequence', { count: placingSequence.count })
  else if (placingAssetId)
    hint = t('viewport.hintAsset', { alt: window.blockout.platform.alternateModifier })
  else if (droppingMarks && selection?.kind === 'entity')
    hint = t('viewport.hintMarksEntity')
  else if (droppingMarks && selection?.kind === 'camera')
    hint = t('viewport.hintMarksCamera')
  else if (selection?.kind === 'entities')
    hint = t('viewport.hintMulti', { count: selection.entityIds.length })

  return (
    <>
      <canvas ref={canvasRef} />
      {mode !== 'deliver' && <Hud />}
      {mode !== 'deliver' && (
        <div className="viewport-tools">
          {mode === 'shoot' && (
            <div className="tool-row">
              <button
                className="btn small primary"
                onClick={() => {
                  const s = useStore.getState()
                  s.setLookThrough(true)
                  s.setTime(0)
                  s.setPlaying(true)
                }}
                title={t('viewport.playShotTitle')}
              >
                {t('viewport.playShot')}
              </button>
              <button
                className={`btn small ${lookThrough ? 'active' : ''}`}
                onClick={() => setLookThrough(!lookThrough)}
                title={t('viewport.lookThroughTitle')}
              >
                {t('viewport.lookThrough')}
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setSelection({ kind: 'camera' })
                  emit('dropCameraMarkAtView', {})
                }}
                title={t('viewport.camMarkTitle')}
              >
                {t('viewport.camMark')}
              </button>
              <button
                className={`btn small ${droppingMarks ? 'active' : ''}`}
                onClick={() => setDroppingMarks(!droppingMarks)}
                disabled={!selection}
                title={t('viewport.marksBtnTitle')}
              >
                {t('viewport.marksBtn')}
              </button>
              <button
                className={`btn small ${recording ? 'active' : ''}`}
                style={recording ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
                onClick={() => setRecording(!recording)}
                title={singleEntitySelected ? t('viewport.recPerformerTitle') : t('viewport.recCameraTitle')}
              >
                {recording
                  ? t('viewport.stop')
                  : singleEntitySelected
                    ? t('viewport.recordPerformer')
                    : t('viewport.recordCameraDot')}
              </button>
              <RecordControlToggle />
              <ReferenceControls />
            </div>
          )}
          {mode === 'shoot' && <ShotSizeRow />}
          {mode === 'shoot' && <FramingRow />}
          {mode === 'shoot' && <TakeBar />}
          <GizmoModeRow />
          <div className="tool-row">
            <button
              className="btn small"
              disabled={!selection || (selection.kind !== 'entity' && selection.kind !== 'entities')}
              onClick={() => getSceneManagerSafe()?.snapSelectionToGround()}
              title={t('viewport.groundTitle')}
            >
              {t('viewport.ground')}
            </button>
          </div>
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
              {t('viewport.shotPreview')}
            </span>
            <span style={{ flex: 1 }} />
            <button
              className="btn small"
              style={{ padding: '2px 7px', fontSize: 10 }}
              title={t('viewport.cyclePreview')}
              onClick={() =>
                setPipSize(pipSize === 'small' ? 'medium' : pipSize === 'medium' ? 'large' : 'small')
              }
            >
              {pipSize === 'small'
                ? t('viewport.previewSmall')
                : pipSize === 'medium'
                  ? t('viewport.previewMedium')
                  : t('viewport.previewLarge')}
            </button>
            <button
              className="btn small"
              style={{ padding: '2px 7px', fontSize: 10 }}
              title={t('viewport.hidePreview')}
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
          title={t('viewport.showPreview')}
        >
          {t('viewport.preview')}
        </button>
      )}
      {recording && (
        <div className="viewport-hint" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {singleEntitySelected ? t('viewport.recEntity') : t('viewport.recCam')}
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
          <div>{t('viewport.emptyStage')}</div>
        </div>
      )}
      {hasEntities && !hasMarks && mode === 'shoot' && !droppingMarks && (
        <div className="empty-state">
          <div>{t('viewport.emptyShoot')}</div>
        </div>
      )}
    </>
  )
}
