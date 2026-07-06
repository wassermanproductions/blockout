# QA Checklist — run before every release

Automated gates first (all must be green):

```bash
npm run typecheck && npm run lint && npm test && npm run smoke
```

Then the manual script, in order. Check each box.

## Fresh install & first run
- [ ] Delete any dev build; `npm run package`; install the DMG on a clean account (or `npm start`).
- [ ] App opens to the welcome screen; New Project creates a `.blockout` folder with `project.json`.
- [ ] Reopen the project via Open Project — identical state.

## Stage
- [ ] Place at least one asset from EVERY library category (person, animal, vehicle, furniture, environment, primitive) — each appears at a sensible real-world size, ground-snapped.
- [ ] A lamp dropped over a table lands on the table (gravity snap).
- [ ] Move/rotate/scale with the gizmo (G/R switch modes); values persist after save/reopen.
- [ ] Label an entity; text + color appear above it and tint the model; label survives reopen.
- [ ] All six lighting presets read distinctly; sun sliders move shadows; fog slider works.
- [ ] Import a custom GLB; it appears and persists (copied into project assets/).
- [ ] 50 mixed undo operations (⌘Z) walk state back correctly; redo replays them.

## AI & choreography (added after user feedback round 2)
- [ ] Pose per mark: set different joint poses on two marks — limbs blend between them during travel; export shows the move.
- [ ] ✨ Populate from reference: pick a photo of a staged scene — entities land in matching positions with poses/labels, lighting is set, and (on an empty shot) Camera Mark 1 approximates the reference framing.
- [ ] Populate with a video file: a frame is extracted and analyzed the same way.
- [ ] Populate without credentials: clean error toast with the three auth options (no hang/crash).

## Interaction (added after user feedback round 1)
- [ ] Gizmo-drag an entity with the mouse (arrows AND planes); position persists after save/reopen.
- [ ] Select the camera and gizmo-drag its body; the active camera mark updates (R rotates → pan/tilt update).
- [ ] PiP shot preview: shows the chrome-free shot view; S/M/L cycle; ✕ hides; 🎥 Preview restores.
- [ ] Stage pose: set a person to Sit — they sit with no marks; pose-limb sliders move arms/legs/head; Reset limbs clears.
- [ ] ● Record move: fly the viewport, stop — camera marks replace the shot's move and play back the flight; export matches.

## Shoot
- [ ] Drop 3+ actor marks; actor walks the path, faces travel direction, gait cycle speed matches ground speed (no moon-walking).
- [ ] A too-fast walk leg shows an amber warning chip; switching the mark to run clears it.
- [ ] Drop 3+ camera marks with different lenses; play — camera hits marks, zoom interpolates.
- [ ] Every rig has distinct character: sticks (dead still), dolly, steadicam, handheld (intensity slider), crane, drone; car-mount follows a moving vehicle.
- [ ] Look through (C): letterbox matches shot aspect for all five aspects; thirds grid + safe area align.
- [ ] Auto-frame WS/FS/MS/MCU/CU on a selected person: framing is credible at 24mm and 85mm.
- [ ] Timeline: drag a pill (retimes), stretch (hold), double-click (deletes), scrub follows, space plays/loops.
- [ ] Rack focus: set focus near→far across two marks; the exported video shows the blur shift.
- [ ] Reference underlay: attach an MP4; ghost + PiP modes; opacity + offset sliders; scrub stays in sync.
- [ ] Kill the app mid-edit (force quit); relaunch + Open Project → autosave backup restores work.

## Deliver
- [ ] Export with all three passes; package contains reference/depth/normal MP4s, stills for every mark + first/last + top-down, prompt.txt, metadata.json, README.txt.
- [ ] ffprobe: duration = shot duration ±1 frame, fps and resolution match the profile, yuv420p.
- [ ] Labels "In video" burns labels into the MP4; "Stills only" keeps video clean; "Off" removes both.
- [ ] Depth pass: near objects brighter, no labels/marks/grid anywhere in any pass.
- [ ] Duration-over-cap warning shows when shot exceeds the profile max.
- [ ] Cancel mid-export: no zombie ffmpeg (check Activity Monitor), partial files cleaned or overwritable, UI recovers.
- [ ] Prompt mentions: lens, rig, every labeled subject, mark timings; Copy prompt works.
- [ ] Animatic: all shots stitched in order, plays end to end.
- [ ] Contact sheet PNG: one cell per shot with name/lens/duration captions.
- [ ] Blender: import the .glb in Blender 4.x (or run blender_import.py) — camera move matches Blockout playback at the same fps.
- [ ] Feed a real package to at least one generator (Seedance/Kling); confirm the output visibly follows the blocking. **This is the product gate.**

## Robustness & performance
- [ ] Corrupt project.json by hand → app shows a readable error, does not crash, offers backup if present.
- [ ] 50-entity scene orbits at 60fps on an M-series Mac (Activity Monitor GPU busy < 80%).
- [ ] 10s 1080p export completes in under 2 minutes.
- [ ] 30-minute free-use session: note every friction point, file as issues.
