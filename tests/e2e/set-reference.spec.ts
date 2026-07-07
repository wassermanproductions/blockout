/**
 * Control-server e2e for the `set_reference` action (Motion Previs Studio
 * handoff): launch the built app, create a project, generate a tiny clip,
 * read the localhost control server's discovery file, POST a set_reference
 * RPC, and assert the active shot gained a referenceVideo AND the clip was
 * copied into the project's refs/ folder.
 */

import { _electron as electron, test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, existsSync, readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir, homedir } from 'os'
import { join, sep } from 'path'
import ffmpegStatic from 'ffmpeg-static'

let app: ElectronApplication
let page: Page
let smokeDir: string
let clipPath: string

test.beforeAll(async () => {
  smokeDir = mkdtempSync(join(tmpdir(), 'blockout-setref-'))

  // Generate a tiny 1s test clip with ffmpeg-static (the app's own dependency).
  const ffmpeg = process.env.BLOCKOUT_FFMPEG || (ffmpegStatic as unknown as string)
  clipPath = join(smokeDir, 'reference-clip.mp4')
  execFileSync(ffmpeg, [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=size=320x240:rate=12:duration=1',
    '-pix_fmt', 'yuv420p',
    clipPath
  ])

  app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, BLOCKOUT_SMOKE_DIR: smokeDir }
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
})

test('set_reference control action attaches a reference and copies the clip into refs/', async () => {
  // Create a project so there is a projectFolder + an active shot.
  await page.getByRole('button', { name: 'New Project' }).click()
  await expect(page.locator('.mode-switch')).toBeVisible()

  // Read the control server's discovery file (written on app launch).
  const discoveryFile = join(homedir(), '.config', 'blockout', 'control.json')
  expect(existsSync(discoveryFile)).toBe(true)
  const { port, token } = JSON.parse(readFileSync(discoveryFile, 'utf-8')) as { port: number; token: string }

  // POST the set_reference RPC exactly as Motion Previs Studio would.
  const res = await fetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action: 'set_reference',
      params: { videoPath: clipPath, mode: 'ghost', opacity: 0.5 }
    })
  })
  const body = (await res.json()) as { ok: boolean; data?: { path: string; mode: string; opacity: number }; error?: string }
  expect(res.status).toBe(200)
  expect(body.ok).toBe(true)
  expect(body.data?.mode).toBe('ghost')
  expect(body.data?.opacity).toBe(0.5)
  expect(body.data?.path.startsWith(`refs${sep}`) || body.data?.path.startsWith('refs/')).toBe(true)

  // The active shot now carries a referenceVideo pointing at the copied file.
  const ref = await page.evaluate(() => {
    const w = window as unknown as { __blockout: { store: { getState: () => { shot: () => { referenceVideo?: unknown } | undefined } } } }
    return w.__blockout.store.getState().shot()?.referenceVideo ?? null
  })
  expect(ref).not.toBeNull()
  const refVideo = ref as { path: string; mode: string; opacity: number; timeOffset: number }
  expect(refVideo.mode).toBe('ghost')
  expect(refVideo.opacity).toBe(0.5)
  expect(refVideo.timeOffset).toBe(0)

  // The clip was physically copied into the project's refs/ folder.
  const copied = join(smokeDir, 'Smoke.blockout', refVideo.path)
  expect(existsSync(copied)).toBe(true)
})
