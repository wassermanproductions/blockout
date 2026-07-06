import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store'
import { exportShot, renderStillPngForTest, renderRawForTest } from './export/exporter'
import { registerControlHandler } from './control/handler'

// Automation surface for the e2e smoke test and for AI-agent driving —
// not a public API; see AGENTS.md.
;(window as unknown as Record<string, unknown>).__blockout = {
  store: useStore,
  exportShot,
  renderStillPngForTest,
  renderRawForTest
}

// External agents (MCP clients) drive the app through this whitelist.
registerControlHandler()

const root = createRoot(document.getElementById('root')!)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
