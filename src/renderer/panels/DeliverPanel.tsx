// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Deliver mode: pick a generator profile, choose passes, export the
 * package, copy the generated prompt, and hand off to Blender/ComfyUI.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { BUILTIN_PROFILES, getProfile } from '@engine/profiles'
import { generatePrompt } from '@engine/prompt'
import {
  exportShot,
  exportAnimatic,
  exportContactSheet,
  exportDims,
  exportStillAtPlayhead,
  type ExportResolution
} from '../export/exporter'
import { exportGlb } from '../export/gltf'
import { tOr } from '../../i18n/core'
import { useT } from '../../i18n/react'

export function DeliverPanel(): JSX.Element {
  const t = useT()
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const shotId = useStore((s) => s.shotId)
  const progress = useStore((s) => s.exportProgress)
  const setExportProgress = useStore((s) => s.setExportProgress)
  const toast = useStore((s) => s.toast)
  const mutate = useStore((s) => s.mutate)

  const scene = doc?.scenes.find((s) => s.id === sceneId)
  const shot = scene?.shots.find((s) => s.id === shotId)

  const [profileId, setProfileId] = useState(doc?.settings.defaultProfileId ?? 'seedance-2')
  const [passes, setPasses] = useState({ clean: true, depth: true, normal: false })
  const [labels, setLabels] = useState<'on' | 'stillsOnly' | 'off'>('stillsOnly')
  const [resolution, setResolution] = useState<ExportResolution>('auto')

  const profile = getProfile(profileId)
  const prompt = useMemo(
    () => (scene && shot ? generatePrompt(scene, shot, profile) : ''),
    [scene, shot, profile]
  )

  if (!scene || !shot) {
    return (
      <div className="deliver-panel">
        <div className="panel-title">{t('deliver.title')}</div>
        <p style={{ color: 'var(--text-dim)' }}>{t('deliver.selectShot')}</p>
      </div>
    )
  }

  const dims = exportDims(profile, shot.aspect, resolution)
  const overCap = profile.maxDuration !== undefined && shot.duration > profile.maxDuration
  const pct =
    progress.totalFrames > 0 ? Math.round((progress.frame / progress.totalFrames) * 100) : 0

  const run = async (): Promise<void> => {
    const res = await exportShot({ profileId, passes, labels, resolution })
    if (res.ok && res.packagePath) {
      toast(t('toast.exportComplete'), 'success')
      void window.blockout.showFolder(res.packagePath)
    } else if (res.error && res.error !== 'cancelled') {
      toast(t('toast.exportFailed', { error: res.error }), 'error')
    }
  }

  return (
    <div className="deliver-panel">
      <div className="panel-title">{t('deliver.heading', { scene: scene.name, shot: shot.name })}</div>

      <div className="field">
        <label>{t('deliver.target')}</label>
        <select
          value={profileId}
          onChange={(e) => {
            setProfileId(e.target.value)
            mutate('default profile', (doc) => {
              doc.settings.defaultProfileId = e.target.value
            })
          }}
        >
          {BUILTIN_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.vendor})
            </option>
          ))}
        </select>
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
        {tOr(`profileHint.${profile.id}`, profile.attachHint)}
      </p>

      {overCap && (
        <div className="warning-chip" style={{ marginBottom: 10 }}>
          {t('deliver.overCap', {
            duration: shot.duration.toFixed(1),
            profile: profile.name,
            max: profile.maxDuration ?? 0
          })}
        </div>
      )}

      <div className="field">
        <label>
          {t('deliver.output', { w: dims.width, h: dims.height, fps: shot.fps, aspect: shot.aspect })}
        </label>
        <div className="seg">
          <button className={passes.clean ? 'active' : ''} onClick={() => setPasses((p) => ({ ...p, clean: !p.clean }))}>
            {t('deliver.clean')}
          </button>
          <button className={passes.depth ? 'active' : ''} onClick={() => setPasses((p) => ({ ...p, depth: !p.depth }))}>
            {t('deliver.depth')}
          </button>
          <button className={passes.normal ? 'active' : ''} onClick={() => setPasses((p) => ({ ...p, normal: !p.normal }))}>
            {t('deliver.normal')}
          </button>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          {t('deliver.passHint')}
        </p>
      </div>

      <div className="field">
        <label>{t('deliver.resolution')}</label>
        <div className="seg">
          <button
            className={resolution === 'auto' ? 'active' : ''}
            onClick={() => setResolution('auto')}
            title={t('deliver.autoTitle')}
          >
            {t('deliver.auto')}
          </button>
          <button
            className={resolution === '720p' ? 'active' : ''}
            onClick={() => setResolution('720p')}
            title={t('deliver.res720Title')}
          >
            720p
          </button>
          <button
            className={resolution === '1080p' ? 'active' : ''}
            onClick={() => setResolution('1080p')}
            title="1080p"
          >
            1080p
          </button>
        </div>
      </div>

      <div className="field">
        <label>{t('deliver.labels')}</label>
        <div className="seg">
          <button className={labels === 'on' ? 'active' : ''} onClick={() => setLabels('on')}>
            {t('deliver.inVideo')}
          </button>
          <button className={labels === 'stillsOnly' ? 'active' : ''} onClick={() => setLabels('stillsOnly')}>
            {t('deliver.stillsOnly')}
          </button>
          <button className={labels === 'off' ? 'active' : ''} onClick={() => setLabels('off')}>
            {t('deliver.off')}
          </button>
        </div>
      </div>

      {progress.running ? (
        <div className="field">
          <label>
            {progress.label} {progress.frame}/{progress.totalFrames}
          </label>
          <div className="progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <button
            className="btn small danger"
            style={{ marginTop: 8 }}
            onClick={() => setExportProgress({ cancelRequested: true })}
          >
            {t('deliver.cancel')}
          </button>
        </div>
      ) : (
        <button
          className="btn primary"
          style={{ width: '100%', marginBottom: 10 }}
          disabled={!passes.clean && !passes.depth && !passes.normal}
          onClick={() => void run()}
        >
          {t('deliver.exportPackage')}
        </button>
      )}

      <button
        className="btn"
        style={{ width: '100%', marginBottom: 10 }}
        disabled={progress.running}
        onClick={() =>
          void exportStillAtPlayhead(profileId, resolution, labels !== 'off').then((r) => {
            if (r.ok && r.packagePath) {
              toast(t('toast.frameExported'), 'success')
              void window.blockout.showFolder(r.packagePath)
            } else if (r.error) toast(t('toast.frameFailed', { error: r.error }), 'error')
          })
        }
        title={t('deliver.exportFrameTitle')}
      >
        {t('deliver.exportFrame')}
      </button>

      {progress.lastPackagePath && !progress.running && (
        <button
          className="btn small"
          style={{ width: '100%', marginBottom: 14 }}
          onClick={() => void window.blockout.showFolder(progress.lastPackagePath!)}
        >
          {window.blockout.platform.isMac ? t('deliver.revealMac') : t('deliver.revealWin')}
        </button>
      )}

      <div className="panel-title" style={{ marginTop: 10 }}>
        {t('deliver.promptFor', { name: profile.name })}
      </div>
      <div className="prompt-box">{prompt}</div>
      <button
        className="btn small"
        style={{ width: '100%', margin: '8px 0 18px' }}
        onClick={() => {
          void navigator.clipboard.writeText(prompt)
          toast(t('toast.promptCopied'), 'success')
        }}
      >
        {t('deliver.copyPrompt')}
      </button>

      <div className="panel-title">{t('deliver.sceneTools')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="btn"
          disabled={progress.running}
          onClick={() =>
            void exportAnimatic(profileId, resolution).then((r) => {
              if (r.ok && r.packagePath) {
                toast(t('toast.animaticExported'), 'success')
                void window.blockout.showFolder(r.packagePath)
              } else if (r.error && r.error !== 'cancelled')
                toast(t('toast.animaticFailed', { error: r.error }), 'error')
            })
          }
        >
          {t('deliver.animatic', { count: scene.shots.length })}
        </button>
        <button
          className="btn"
          disabled={progress.running}
          onClick={() =>
            void exportContactSheet().then((r) => {
              if (r.ok && r.packagePath) {
                toast(t('toast.contactExported'), 'success')
                void window.blockout.showFolder(r.packagePath)
              } else if (r.error) toast(t('toast.contactFailed', { error: r.error }), 'error')
            })
          }
        >
          {t('deliver.contactSheet')}
        </button>
        <button
          className="btn"
          disabled={progress.running}
          onClick={() =>
            void exportGlb(profileId).then((r) => {
              if (r.ok && r.packagePath) {
                toast(t('toast.blenderExported'), 'success')
                void window.blockout.showFolder(r.packagePath)
              } else if (r.error) toast(t('toast.gltfFailed', { error: r.error }), 'error')
            })
          }
        >
          {t('deliver.blender')}
        </button>
      </div>
    </div>
  )
}
