import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store'
import { applyDocumentLang, isLocaleForced, setLocale } from '../i18n/core'
import {
  exportShot,
  exportStillAtPlayhead,
  exportDims,
  renderStillPngForTest,
  renderRawForTest,
  type ExportResolution
} from './export/exporter'
import { registerControlHandler } from './control/handler'
import { getProfile } from '@engine/profiles'
import { MOTION_PRESETS } from '@engine/motions'
import { ACTION_PRESETS } from '@engine/action-presets'
import type { AspectId } from '@engine/types'

// Automation surface for the e2e smoke test and for AI-agent driving —
// not a public API; see AGENTS.md.
;(window as unknown as Record<string, unknown>).__blockout = {
  store: useStore,
  exportShot,
  exportStillAtPlayhead,
  exportDimsForTest: (profileId: string, aspect: AspectId, res: ExportResolution) =>
    exportDims(getProfile(profileId), aspect, res),
  renderStillPngForTest,
  renderRawForTest,
  MOTION_PRESETS,
  ACTION_PRESETS
}

// External agents (MCP clients) drive the app through this whitelist.
registerControlHandler()

async function bootstrap(): Promise<void> {
  if (!isLocaleForced()) {
    try {
      setLocale(await window.blockout.getLocale())
    } catch {
      /* Keep the renderer-detected locale if main-process sync is unavailable. */
    }
  }
  applyDocumentLang()

  const root = createRoot(document.getElementById('root')!)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
}

void bootstrap()
