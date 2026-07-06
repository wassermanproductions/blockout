/**
 * App shell: welcome screen, titlebar with the three-mode switch, the
 * Stage/Shoot/Deliver layouts, global keyboard map, and autosave.
 */

import { useCallback, useEffect } from 'react'
import { useStore, currentProjectJson } from './store'
import { Viewport } from './viewport/Viewport'
import { Library } from './panels/Library'
import { Inspector } from './panels/Inspector'
import { ProjectRail } from './panels/ProjectRail'
import { Timeline } from './panels/Timeline'
import { DeliverPanel } from './panels/DeliverPanel'
import { Toasts } from './panels/Toasts'

function Welcome(): JSX.Element {
  const newProject = useStore((s) => s.newProject)
  const loadFromJson = useStore((s) => s.loadFromJson)
  const toast = useStore((s) => s.toast)

  const onNew = useCallback(async () => {
    const folder = await window.blockout.newProjectDialog()
    if (!folder) return
    const name = folder.split('/').pop()?.replace(/\.blockout$/, '') ?? 'Untitled'
    newProject(folder, name)
    const json = currentProjectJson()
    if (json) await window.blockout.saveProject(folder, json)
  }, [newProject])

  const onOpen = useCallback(async () => {
    const folder = await window.blockout.openProjectDialog()
    if (!folder) return
    const { json, backupJson, backupNewer } = await window.blockout.loadProject(folder)
    if (!json && !backupJson) {
      toast('No project.json found in that folder.', 'error')
      return
    }
    // A meaningfully-newer autosave means the app died with unsaved work —
    // restore it (undo history is fresh either way; ⌘S makes it permanent).
    if (backupNewer && backupJson && loadFromJson(folder, backupJson)) {
      toast('Restored unsaved work from the autosave backup — Save to keep it.', 'success')
      return
    }
    if (json && loadFromJson(folder, json)) return
    if (backupJson && loadFromJson(folder, backupJson)) {
      toast('Recovered from autosave backup.', 'success')
    }
  }, [loadFromJson, toast])

  return (
    <div className="welcome">
      <h1>Blockout</h1>
      <p>
        Stage a scene, choreograph camera and character blocking with marks, and export
        motion-reference packages for AI video generators.
      </p>
      <div className="actions">
        <button className="btn primary" onClick={onNew}>
          New Project
        </button>
        <button className="btn" onClick={onOpen}>
          Open Project…
        </button>
      </div>
    </div>
  )
}

function useAutosave(): void {
  const doc = useStore((s) => s.doc)
  const folder = useStore((s) => s.projectFolder)

  useEffect(() => {
    if (!doc || !folder) return
    const interval = setInterval(() => {
      const json = currentProjectJson()
      if (json) void window.blockout.saveBackup(folder, json)
    }, 60_000)
    return () => clearInterval(interval)
  }, [doc, folder])
}

function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (!s.doc) return
      const inField =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      if (inField) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo()
      } else if (meta && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        s.redo()
      } else if (meta && e.key === 's') {
        e.preventDefault()
        const json = currentProjectJson()
        if (json && s.projectFolder) {
          void window.blockout.saveProject(s.projectFolder, json).then(() => s.markSaved())
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 'm' || e.key === 'M') {
        if (s.mode === 'shoot' && s.selection) s.setDroppingMarks(!s.droppingMarks)
      } else if (e.key === 'c' || e.key === 'C') {
        if (s.mode === 'shoot') s.setLookThrough(!s.lookThrough)
      } else if (e.key === 'Escape') {
        s.setPlacingAsset(null)
        s.setDroppingMarks(false)
        s.setSelection(null)
      } else if (e.key >= '1' && e.key <= '9') {
        // Jump to camera mark N.
        const shot = s.shot()
        const idx = Number(e.key) - 1
        const mark = shot ? [...shot.camera.marks].sort((a, b) => a.time - b.time)[idx] : undefined
        if (mark) s.setTime(mark.time)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App(): JSX.Element {
  const doc = useStore((s) => s.doc)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const dirty = useStore((s) => s.dirty)
  const markSaved = useStore((s) => s.markSaved)
  const folder = useStore((s) => s.projectFolder)

  useAutosave()
  useKeyboard()

  const onSave = useCallback(async () => {
    const json = currentProjectJson()
    if (json && folder) {
      await window.blockout.saveProject(folder, json)
      markSaved()
    }
  }, [folder, markSaved])

  if (!doc) {
    return (
      <div className="app">
        <div className="titlebar">
          <span className="app-name">BLOCKOUT</span>
        </div>
        <Welcome />
        <Toasts />
      </div>
    )
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span className="app-name">BLOCKOUT</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          {doc.name}
          {dirty ? ' •' : ''}
        </span>
        <div className="mode-switch">
          <button className={mode === 'stage' ? 'active' : ''} onClick={() => setMode('stage')}>
            STAGE
          </button>
          <button className={mode === 'shoot' ? 'active' : ''} onClick={() => setMode('shoot')}>
            SHOOT
          </button>
          <button className={mode === 'deliver' ? 'active' : ''} onClick={() => setMode('deliver')}>
            DELIVER
          </button>
        </div>
        <button className="btn small" onClick={onSave}>
          Save
        </button>
      </div>

      {mode === 'deliver' ? (
        <div className="deliver-layout">
          <div className="deliver-preview">
            <Viewport />
          </div>
          <DeliverPanel />
        </div>
      ) : (
        <div className="main">
          <div className="panel">
            <ProjectRail />
            {mode === 'stage' && <Library />}
          </div>
          <div className="center-column">
            <div className="viewport-wrap">
              <Viewport />
            </div>
            {mode === 'shoot' && <Timeline />}
          </div>
          <div className="panel right">
            <Inspector />
          </div>
        </div>
      )}
      <Toasts />
    </div>
  )
}
