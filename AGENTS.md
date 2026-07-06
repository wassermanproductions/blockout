# AGENTS.md — running & modifying Blockout with an AI agent

This file is the single source of truth for AI coding agents (Claude Code, Codex, Hermes, OpenClaw, …) working on this repo. `CLAUDE.md` points here.

## What this app is

Electron + TypeScript + React + Three.js desktop previs tool. Filmmakers stage grey-box scenes, choreograph camera/actor **marks** on a timeline, and export deterministic motion-reference packages (MP4 + depth pass + stills + prompt) for AI video generators. Full product spec: `docs/DESIGN.md`.

## Commands

```bash
npm install            # once; Node 22+; ffmpeg needed for exports (brew install ffmpeg)
npm run dev            # run the app with hot reload
npm run build          # production build into out/
npm start              # run the production build
npm run typecheck      # strict TS, two projects (renderer+engine, main+e2e)
npm run lint           # ESLint (zero warnings allowed on main)
npm test               # Vitest engine unit tests (fast, no GPU)
npm run smoke          # build + Playwright end-to-end: real export, ffprobe-verified
npm run package        # macOS DMG into release/
```

**Definition of done for any change: `npm run typecheck && npm run lint && npm test` green, and `npm run smoke` green if you touched engine/, export/, main/, or SceneManager.**

## Repo map

```
src/engine/     PURE TypeScript. No DOM, no three.js, no Electron imports — ever.
                The deterministic core: state(t) evaluator, camera math, paths,
                easing, rig noise, gaits, schema, prompts, generator profiles.
                All logic changes here need unit tests in tests/unit/.
src/main/       Electron main process: window, IPC, ffmpeg spawning, file I/O.
src/preload/    Typed IPC bridge (window.blockout). Keep in sync with main.
src/renderer/   React UI. store.ts (zustand; ALL doc mutations go through
                store.mutate for undo), panels/, viewport/ (SceneManager owns
                three.js), export/ (frame loop → ffmpeg, glTF, ComfyUI).
tests/unit/     Vitest (engine only). tests/e2e/ Playwright (smoke + screenshots).
assets/         (profiles as code in engine/profiles.ts; 3D assets are procedural)
```

## Hard rules

1. **Engine purity**: `src/engine/` must never import DOM/three/Electron. It runs in Vitest under Node.
2. **Determinism**: nothing on the `state(t)` path may use `Math.random()` (unseeded), `Date.now()`, or accumulate state frame-to-frame. Rig shake uses the seed stored on the shot. The smoke suite has a byte-determinism test that will catch violations.
3. **All document mutations go through `store.mutate(label, fn)`** or an existing store action — never assign into `store.doc` directly (breaks undo and dirty tracking).
4. **Conventions**: meters, seconds, radians. Heading 0 faces −Z and `object.rotation.y = heading` (see `headingOf` in `src/engine/path.ts`). Models are built facing −Z with origin at ground.
5. Exports must contain zero editor chrome (grid, gizmos, selection boxes, marks). `SceneManager.renderFrameAt` handles this — preserve that behavior.

## Automation surface (driving the running app)

The renderer exposes `window.__blockout` (not a public API — for tests/agents):

- `__blockout.store` — the zustand store. `getState()` gives you every action: `addEntity(assetId, pos)`, `dropActorMark(entityId, pos)`, `dropCameraMark(pos, pan, tilt, focal)`, `setTime(t)`, `setMode(...)`, `mutate(label, fn)`, `scene()`, `shot()`.
- `__blockout.exportShot({profileId, passes, labels})` — run a real export; resolves `{ok, packagePath}`.
- `__blockout.renderStillPngForTest(t, w, h)` / `renderRawForTest(t, w, h)` — deterministic frame renders.

Headless/dialog-free driving: launch with env `BLOCKOUT_SMOKE_DIR=/some/dir` — the New/Open Project dialogs are bypassed and use `$BLOCKOUT_SMOKE_DIR/Smoke.blockout`. See `tests/e2e/smoke.spec.ts` for a complete scripted session (Playwright `_electron`).

## Common tasks

- **Add a generator profile**: edit `BUILTIN_PROFILES` in `src/engine/profiles.ts` (see `docs/generator-profiles.md`). Add a prompt test in `tests/unit/schema.test.ts`.
- **Add a library asset**: add a catalog entry in `src/engine/assets.ts` (id, height, speedScale, motion), a builder case in `src/renderer/viewport/builders.ts` (grey-box, deterministic, forward −Z), and an emoji thumb in `src/renderer/panels/Library.tsx`.
- **Add an export pass**: extend `RenderPass` in `SceneManager.renderFrameAt`, wire a toggle in `DeliverPanel.tsx` and the pass loop in `export/exporter.ts`.
- **Change the document schema**: bump nothing lightly — update types in `engine/types.ts`, factories/validation in `engine/schema.ts`, and the round-trip test. Never break `parseProject` on existing files; migrate instead.

## Gotchas

- `ffmpeg` resolution order: `BLOCKOUT_FFMPEG` env → bundled `ffmpeg-static` (unpacked from asar) → `ffmpeg` on PATH.
- Frames are piped to ffmpeg as **raw RGBA** (`-f rawvideo`, vflipped because WebGL reads bottom-up). Width/height must stay even (h264 yuv420p).
- `renderFrameAt` intentionally renders twice (GL warm-up determinism) — don't "optimize" that away; the smoke test will fail.
- The live viewport loop suspends during exports (`SceneManager.suspendLive`).
- Playwright e2e runs against the **built** app (`out/`) — run `npm run build` first (the `smoke` script does).
