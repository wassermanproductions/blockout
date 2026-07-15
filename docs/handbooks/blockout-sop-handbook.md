# Blockout Operator Handbook

**Windows and macOS standard operating procedures**

**Project:** Blockout

**Original application:** Sam Wasserman / Wasserman Productions

**Document status:** Maintainer review draft
**Edition:** Revision 05 - 2026-07-14

![Blockout project logo](../images/logo.png)

## Purpose

Blockout is a deterministic grey-box previs application for staging scenes, choreographing actors and cameras, and exporting portable shot-reference packages. This handbook gives human operators and automation agents one maintainable procedure for the most common production work.

The guide covers the current cross-platform application. Platform-specific labels differ slightly, but the project format and operating concepts remain the same.

## What the Windows work accomplished

The cross-platform implementation made Blockout practical on Windows 11 while preserving macOS behavior:

- Native Windows window controls, taskbar identity, menus, File Explorer language, and installer behavior.
- Portable project paths that round-trip between macOS and Windows without changing the project schema.
- Windows-safe project and export names, including reserved-name, trailing-dot, and long-component handling.
- Packaged FFmpeg discovery with a documented environment override and platform-neutral errors.
- Cancellation that waits for FFmpeg to close before temporary or partial output is removed.
- Portable reference-media handling and a packaged MCP bridge for agent-assisted operation.
- Native Windows packaging and quality checks without requiring a system FFmpeg installation.
- Defensive action validation and a visible recovery boundary so malformed or legacy gait data cannot silently unmount the Shoot workspace.

### How it was achieved

The application remained one Electron and TypeScript codebase. Platform differences were isolated at window creation, application-data resolution, path normalization, process control, and packaging boundaries. Project-relative media uses canonical forward-slash separators; absolute, drive, network-share, and traversal inputs are rejected when a portable relative path is required. Export code resolves one audited FFmpeg executable and owns its full lifecycle.

## Capability map

| Workspace | Primary job | Typical result |
|---|---|---|
| Stage | Place performers, vehicles, props, environments, and labels | Readable grey-box geography |
| Shoot | Set shot duration, frame rate, aspect ratio, camera, and action timing | Playable previs shot |
| Deliver | Render clean, reference, depth, or normal media and build shot packages | Portable downstream assets |
| MCP bridge | Inspect state and perform supported staging, mark, camera, and playback actions | Agent-assisted iteration |

> **Operating boundary:** Blockout creates scene and camera animation. It is not a nonlinear editor, final sound mixer, or photoreal renderer.

## Before every session

1. Launch the intended installed build or development build.
2. Open an existing project or create a project in a writable folder.
3. Confirm the project name, active scene, active shot, frame rate, duration, and aspect ratio.
4. Confirm enough free space for frame renders, reference media, and exported packages.
5. If export is required, verify FFmpeg through a short still or test-shot export.
6. If agent assistance is required, start Blockout before connecting the packaged MCP bridge.
7. Save a checkpoint before changing scene structure, coverage, or animation timing.

## Human SOP

### 1. Create, save, and reopen a project

1. Choose **New Project**.
2. Select a writable parent folder and enter a short, filesystem-safe name.
3. Confirm the created folder ends in `.blockout` and contains the project document.
4. Add one simple asset, save, close the application, and reopen the project.
5. Confirm the asset, scene, shot, duration, and camera state survived the round-trip.

**Accept when:** the project reopens from its own folder with no missing-media warning and the saved stage state is unchanged.

### 2. Stage a readable scene

1. Open **Stage**.
2. Place the environment or geography before placing performers.
3. Add only the subjects and props needed for the current story beat.
4. Use labels and distinct colors for story-critical entities.
5. Position subjects on the ground plane and keep their screen directions intentional.
6. Scrub the default camera and correct collisions, hidden subjects, and unclear geography.
7. Save the stage as a reusable preset only when it is genuinely reusable.

**Accept when:** a reviewer can identify the setting, principal subject, objective, and spatial relationships from a still frame.

### 3. Set shot timing before choreography

1. Open **Shoot**.
2. Name the shot with a stable production identifier.
3. Set duration, frame rate, aspect ratio, and camera before adding timed marks.
4. Treat duration as locked once choreography begins; changing it can invalidate timing decisions.
5. Save a checkpoint.

**Accept when:** the shot contract matches the edit plan and is recorded before animation work starts.

### 4. Animate performers and props

1. Select one subject at a time.
2. Choose a procedural action or add explicit timed marks.
3. Add an opening pose or position, one or more meaningful changes, and a clear end state.
4. Scrub the first frame, midpoint, and final frame.
5. Play the complete shot and correct sliding, popping, collisions, impossible speed, or subjects leaving frame.
6. Repeat for secondary subjects and props without obscuring the principal action.

**Accept when:** the action changes visibly across the intended time range and remains readable with sound muted.

### 5. Animate and verify the camera

1. Start from a framing preset or a deliberate manual angle.
2. Set focal length and camera height for the story purpose.
3. Add camera marks or a supported move preset.
4. Inspect the move at the beginning, midpoint, and end.
5. Check horizon, headroom, lead room, collisions, and unintended subject loss.
6. Play the entire shot through the shot camera.

**Accept when:** the camera move supports the action and the subject remains intentionally framed throughout the shot.

### 6. Build coverage without repeating time

Multiple shots inside one scene share the same underlying blocking and begin at that scene's time zero. Use this model deliberately:

1. Use additional shots for alternate coverage of the same action.
2. Use separate scenes for sequential story beats that must advance time.
3. If coverage is assembled externally, record explicit nonoverlapping source ranges.
4. Name every scene and shot so the edit order remains unambiguous.

**Accept when:** coverage does not accidentally repeat the same action where the story should advance.

### 7. Attach a motion reference

1. Open the destination project and active shot.
2. Attach an approved local reference clip, or use the supported Motion Previs handoff.
3. Choose ghost or picture-in-picture display and set a useful opacity.
4. Match key action moments rather than tracing every frame mechanically.
5. Disable or reduce the reference when evaluating the authored Blockout animation.
6. Save and reopen the project to verify the copied reference remains available.

**Accept when:** the reference is synchronized and portable under the project `refs` folder.

### 8. Deliver a shot package

1. Open **Deliver** and confirm the active scene and shot again.
2. Confirm resolution, aspect ratio, frame rate, duration, and output base name.
3. Select only the passes required downstream.
4. Export a clean or reference MP4 as the master motion-bearing source.
5. Add depth or normal passes only when the downstream workflow needs them.
6. Open the exported package and inspect media, stills, prompt, metadata, and README content.
7. Play the output from first frame through final frame.
8. Verify the output name and probe the media contract before replacing an earlier version.
9. If the package will guide an external generative-video service, preserve the exact prompt, first frame, motion reference, control layers, and source hashes with the shot version.

**Accept when:** the package is complete, portable, correctly named, and plays through the declared final frame.

> **External-generation boundary:** Blockout can prepare motion-bearing references, stills, prompts, depth, and normal media for downstream tools. Higgsfield, Seedance, Kling, Wan, and other hosted generators run outside Blockout and outside this repository's Apache-2.0 application source.

## Agent-assisted SOP

### Agent preflight

1. Launch Blockout and open the intended project in the visible application.
2. Call `get_state` and record the active project, scene, shot, entity IDs, and timing.
3. Call `list_assets` before adding new entities.
4. Refresh state after every structural mutation.
5. Capture a viewport image only for local review; do not include private working images in public documentation.

### Supported agent sequence

1. Inspect state.
2. Add or move entities by stable IDs.
3. Add actor and camera marks.
4. Set shot timing or apply a framing preset.
5. Scrub or play the shot.
6. Re-read state and compare it with the intended result.
7. Return a concise list of actions, affected IDs, and unresolved human decisions.

### Mandatory human boundary

The public MCP surface does not replace every visible application action. A human operator or separately authorized UI-control workflow must complete any unsupported project creation, scene creation, named joint animation, final Save, final Deliver, and creative approval step.

## Cross-platform project portability

- Keep imported media inside the project whenever the application offers a copied-project reference.
- Store portable project media as relative paths.
- Treat unexpected absolute paths or parent-directory traversal as invalid project data.
- Avoid manually renaming files inside the project package.
- Move or copy the entire `.blockout` folder, then reopen it on the destination platform.
- After moving a project, test one reference, one clean export, and one save/reopen cycle before continuing production.

## Recovery guide

| Symptom | Recovery |
|---|---|
| Project opens with missing reference media | Reattach the approved source and allow Blockout to copy it into `refs`; save and reopen. |
| Subject jumps or action starts from an old position | Inspect time zero, remove stale marks, and rebuild the opening state deliberately. |
| Camera repeats action instead of advancing the story | Move sequential beats into separate scenes or apply explicit source ranges in the external edit. |
| Export has the wrong shot | Stop, refresh current state, select the intended scene and shot, and export with an exact expected base name. |
| Export cancellation leaves a partial file | Wait for cancellation to complete, confirm the encoder has closed, then remove the partial output. |
| Filename is rejected | Use a short descriptive name without reserved device words or trailing spaces and dots. |
| Agent action targets a stale entity | Refresh state, confirm the current ID, and retry once with the new ID. |
| Shoot reports invalid action or gait data | Preserve a copy, remove or rebuild the malformed mark, save, and reopen. Do not keep replaying an invalid action payload. Current builds reject it before the timeline can fail. |

## Production acceptance checklist

- [ ] Project saves, closes, and reopens without loss.
- [ ] Active scene and shot IDs match the edit plan.
- [ ] Duration, frame rate, aspect ratio, and resolution are correct.
- [ ] Every selected shot contains visible performer, prop, or camera motion where intended.
- [ ] First, midpoint, and final frames have been inspected.
- [ ] Clean MP4 is the master animation source; GLB is not used as sole character-animation proof.
- [ ] Reference paths remain portable after moving the project folder.
- [ ] Export base names match the expected scene and shot.
- [ ] Cancellation leaves no active encoder or locked partial output.
- [ ] Final packages play through and contain the documented passes.

## Validation summary

Cross-platform validation covered project creation, save/reopen, macOS-to-Windows-to-macOS portability, reference import, deterministic stills, clean/depth/normal exports, animatic assembly, cancellation, MCP operations, and packaged operation without a system FFmpeg dependency.

An earlier production-scale validation assembled nine distinct ten-second Blockout scenes into a 90-second, 2,160-frame animated picture lock at 24 fps. All declared motion ranges passed independent frame-change analysis.

The current two-film walkthrough added physical Windows proof that two separate Motion Previs references could be copied into distinct Blockout projects, stored under portable project-relative `refs/` paths, displayed in Shoot, saved, and recovered after reopen. The same walkthrough used Blockout control material as part of the externally generated 90-second films *Signal Run* and *The Twelfth Shadow*. External generation and final assembly are documented in the [Three-App Windows Workflow Handbook](three-app-workflow-handbook.md); they are not presented as Blockout-native rendering.

## Publication and maintenance

- Keep public examples fictional and portable.
- Do not publish project-local control descriptors or machine-local paths.
- Use only repository-owned product artwork approved by the maintainer.
- Keep this Markdown file as the reviewable source for the PDF edition.
- Update the handbook whenever a visible label, project format, export contract, or MCP capability changes.

### Attribution and license

Blockout was created by **Sam Wasserman / Wasserman Productions** and its application source is distributed under the repository's [Apache-2.0 license](../../LICENSE). Preserve its NOTICE, copyright, citation, and third-party obligations. Windows distributions that bundle FFmpeg also carry that component's separate GPL license, provenance, and corresponding-source obligations; the installer must not be described as Apache-only. The name and logo used here come from this upstream repository; final mark usage remains subject to maintainer approval.
