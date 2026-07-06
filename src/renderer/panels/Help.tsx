/**
 * Help & Tutorial overlay: a step-by-step walkthrough of the full workflow
 * (Tutorial tab) and a complete feature/shortcut reference (Reference tab).
 * Opened from the titlebar ?, the welcome screen, or the ? key.
 */

import { useState } from 'react'
import { useStore } from '../store'

function Kbd({ children }: { children: string }): JSX.Element {
  return <kbd className="help-kbd">{children}</kbd>
}

interface Step {
  title: string
  body: JSX.Element
}

const TUTORIAL: { section: string; steps: Step[] }[] = [
  {
    section: '1 · Stage your scene',
    steps: [
      {
        title: 'Place things',
        body: (
          <>
            In <b>STAGE</b> mode, click a library item on the left (a person, car, table, or a whole
            environment kit like City Street), then click the floor to place it. Hold <Kbd>⌥</Kbd>{' '}
            while clicking to place several. <Kbd>Esc</Kbd> cancels.
          </>
        )
      },
      {
        title: 'Move, rotate, duplicate',
        body: (
          <>
            Click anything to select it — drag the colored arrows to move. Switch to{' '}
            <b>⟳ Rotate</b> (top-right, or press <Kbd>R</Kbd>) to spin it any amount, a full 360° if
            you like. <Kbd>G</Kbd> returns to move. <Kbd>⌘D</Kbd> duplicates, <Kbd>⌫</Kbd> deletes,{' '}
            <Kbd>⌘Z</Kbd> undoes anything.
          </>
        )
      },
      {
        title: 'Label your subjects',
        body: (
          <>
            With a person selected, type a label like <b>HERO</b> in the inspector and pick a color.
            The label floats above them, tints the model, and tells the AI generator who is who.
          </>
        )
      },
      {
        title: 'Pose people',
        body: (
          <>
            The inspector&apos;s <b>Pose</b> section makes a person Sit, Crouch, Lie, Talk, or lie
            Fallen — no animation needed. Open <b>Pose limbs</b> for 14 sliders (arms, elbows, legs,
            knees, torso, head) to build stances for fights or dances.
          </>
        )
      },
      {
        title: 'Marry things together',
        body: (
          <>
            Sit a person, place them on a bike, then in their inspector choose <b>Marry to… →
            the bike</b>. Now they move as one — drag the bike and the rider comes along; drive the
            bike&apos;s marks and the rider rides. Or <Kbd>⇧</Kbd>-click several things and marry
            them all to the last one you clicked. <b>Unmarry</b> separates them cleanly.
          </>
        )
      },
      {
        title: 'Set the light',
        body: (
          <>
            With nothing selected, the inspector shows the scene: pick a lighting preset (Day,
            Golden hour, Night, Club…), drag the sun sliders, add fog. Generators read light
            direction from your reference, so set it the way the final shot should feel.
          </>
        )
      },
      {
        title: '✨ Or let AI stage it from a photo',
        body: (
          <>
            <b>Populate from reference…</b> (bottom of the library) takes a photo or video frame and
            stages the scene to match — people, furniture, poses, labels, lighting, and a camera to
            match the framing. Needs your Claude API key set up (it will tell you how). One{' '}
            <Kbd>⌘Z</Kbd> undoes the whole thing.
          </>
        )
      }
    ]
  },
  {
    section: '2 · Choreograph the motion',
    steps: [
      {
        title: 'Marks: how everything moves',
        body: (
          <>
            Switch to <b>SHOOT</b>. Blocking works like a real set: things hit <b>marks</b>. Select
            an actor, press <Kbd>M</Kbd>, and click the floor to drop Mark 1, Mark 2, Mark 3… They
            walk the path between marks, timed on the timeline below. Drag a timeline pill to
            retime; drag its right edge to make them hold at the mark; double-click a pill to delete
            it. Select a mark to set its gait (walk/jog/run/sit…) and even a limb pose that blends
            from the previous mark — that&apos;s how you keyframe a punch or a dance move.
          </>
        )
      },
      {
        title: 'Record a performance instead',
        body: (
          <>
            Faster than placing marks: select a character or car and press <b>● Record performer</b>.
            Move your cursor over the floor — they chase it, and your steering becomes marks with
            walking/jogging/running matched to your speed. <b>■ Stop</b> saves it. Re-record any
            time; the new take replaces the old.
          </>
        )
      },
      {
        title: 'Frame the camera',
        body: (
          <>
            Select the camera (the white body in the viewport) and drag it, or press{' '}
            <Kbd>C</Kbd> to <b>look through</b> it and orbit the view to compose. Pick a lens
            (12–135mm), or click a shot size (<b>WS/MS/CU</b>) to auto-frame your subject. Then{' '}
            <b>+ Cam mark</b> drops camera Mark 1. Move, reframe, drop Mark 2 — the camera travels
            between them. Choose a <b>rig</b> for the motion feel: dolly, steadicam, handheld,
            crane, drone, or car-mount (parents the camera to a moving vehicle).
          </>
        )
      },
      {
        title: 'Record the camera like an operator',
        body: (
          <>
            With the camera selected, <b>● Record camera</b> replays your blocking while you fly the
            viewport — orbit, pan, zoom — and your flight becomes the camera move, perfectly synced
            to the performance. It auto-stops at the end of the shot. Don&apos;t like it? <b>Clear
            camera move</b> in the inspector and record again.
          </>
        )
      },
      {
        title: 'More cameras, more versions',
        body: (
          <>
            <b>Cameras (A/B/C)</b> at the top of the camera inspector: <b>+</b> adds Camera B with
            its own marks and rig — switch with the chips, exactly like multiple cameras on set.
            And before trying something risky, hover the shot in the left rail and click{' '}
            <b>+ Draft</b>: it snapshots the shot as &quot;1A v1&quot;. Drafts play and export like
            shots; <b>▲</b> promotes one back to being the real shot.
          </>
        )
      },
      {
        title: 'Watch the shot',
        body: (
          <>
            <b>▶ Play shot</b> (top-right) plays the shot from the top <i>through the shot
            camera</i> — the exact frame that will export. After a camera recording this happens
            automatically. The <b>SHOT PREVIEW</b> box (bottom-right) shows the same view live
            while you work in the free view. <Kbd>Space</Kbd> plays/pauses, <Kbd>C</Kbd> toggles
            the camera view, <Kbd>1–9</Kbd> jump to camera marks. Amber warnings appear if you
            asked a human to walk at car speed.
          </>
        )
      },
      {
        title: 'Match an existing shot',
        body: (
          <>
            <b>🎞 Ref</b> overlays any video (even a depth-map video) ghosted on the viewport,
            synced to your timeline — recreate its blocking by eye, adjust opacity and time offset.
          </>
        )
      }
    ]
  },
  {
    section: '3 · Deliver to your generator',
    steps: [
      {
        title: 'Export the package',
        body: (
          <>
            Switch to <b>DELIVER</b>, pick your target (Seedance 2.0, Veo 3.1, Kling, LTX 2.3, Wan
            2.2…), and hit <b>Export shot package</b>. You get the reference MP4 (always clean — no
            marks or lines), a depth pass for ComfyUI control, stills at every camera mark, a
            top-down blocking diagram, and a <b>prompt written from your actual blocking</b> —
            copy it straight into the generator. Anything you don&apos;t want in the render: tick{' '}
            <b>Hide in exports</b> on that entity.
          </>
        )
      },
      {
        title: 'Labels in or out',
        body: (
          <>
            Choose whether labels burn into the video, appear only in stills (default — generators
            often read them best there), or stay out entirely.
          </>
        )
      },
      {
        title: 'Scene tools',
        body: (
          <>
            <b>Animatic</b> stitches every shot in the scene into one video. <b>Contact sheet</b>{' '}
            makes a storyboard grid. <b>Export to Blender</b> writes a .glb with the animated
            camera and blocking plus a one-click import script for further refinement.
          </>
        )
      }
    ]
  }
]

const REFERENCE: { section: string; items: [string, string][] }[] = [
  {
    section: 'Keyboard shortcuts',
    items: [
      ['Space', 'Play / pause the shot'],
      ['M', 'Drop marks for the selection (click the floor)'],
      ['C', 'Look through the shot camera'],
      ['G / R', 'Gizmo: move / rotate'],
      ['⇧-click', 'Multi-select entities in the viewport, or marks on the timeline'],
      ['⌘D', 'Duplicate selection'],
      ['⌫', 'Delete selection (all of a multi-selection)'],
      ['⌘Z / ⇧⌘Z', 'Undo / redo — every action is undoable'],
      ['⌘S', 'Save project'],
      ['1–9', 'Jump to camera mark N'],
      ['Esc', 'Cancel placement / mark-dropping / selection'],
      ['?', 'Open this help']
    ]
  },
  {
    section: 'Stage mode',
    items: [
      ['Library', 'Click an item, click the floor to place. ⌥-click places multiples. Search at the top.'],
      ['Environments', 'One-click set shells: city street, house, nightclub, car interior, plane cabin…'],
      ['Import 3D Model…', 'Bring in your own GLB/glTF; it is copied into the project.'],
      ['✨ Populate from reference…', 'AI stages the scene from a photo/video frame (needs Claude API key).'],
      ['Labels', 'Name + color a subject; tints the model and guides the AI generator.'],
      ['Pose', 'Stand/Sit/Crouch/Lie/Talk/Fallen without animation; 14 limb sliders for stances.'],
      ['Marriage', 'Marry to… makes an entity ride another (rider on bike, prop on cart). Unmarry separates.'],
      ['Hide in exports', 'Keep something visible in the editor but out of every rendered pass.'],
      ['Lighting', 'Six presets + sun direction + fog, all visible in exports.']
    ]
  },
  {
    section: 'Shoot mode',
    items: [
      ['Marks', 'Arrival time, hold, easing per mark; gait and a limb pose per actor mark; lens + focus per camera mark.'],
      ['Timeline', 'Drag pills to retime, right edge to hold, double-click deletes, ⇧-click multi-selects.'],
      ['Record performer', 'Select a character/vehicle, ● Record — steer with the cursor; gaits match your speed.'],
      ['Record camera', '● Record with the camera selected — blocking replays while you fly; auto-stops at shot end.'],
      ['Clear camera move', 'Deletes all camera marks so you can re-record.'],
      ['Cameras A/B/C', '+ adds a camera with its own marks/rig/lens; chips switch; export uses the active one.'],
      ['Rigs', 'Sticks, dolly, steadicam, handheld (intensity), crane, drone, car-mount (parent to a vehicle).'],
      ['Auto-frame', 'WS/FS/MS/MCU/CU position the camera for that shot size on your subject at the current lens.'],
      ['Shot preview', 'Always-live picture-in-picture of the shot camera; S/M/L sizes.'],
      ['Drafts', '+ Draft on the shot row snapshots a version (1A v1); ▲ promotes it back; ✕ deletes.'],
      ['🎞 Ref', 'Ghost a reference video over the viewport, timeline-synced, to match its blocking.'],
      ['Speed warnings', 'Amber chips when timing implies impossible speeds; click to jump to the mark.']
    ]
  },
  {
    section: 'Deliver mode',
    items: [
      ['Profiles', 'Per-generator export settings and prompt phrasing — Seedance, Veo, Kling, LTX, Wan, and image models.'],
      ['Passes', 'Clean reference MP4 (always chrome-free), depth pass, normal pass.'],
      ['Stills', 'Frame at every camera mark + first/last + top-down blocking diagram.'],
      ['Prompt', 'Generated from your actual lenses, moves, labels, and timings — copy-paste ready.'],
      ['Animatic / Contact sheet', 'Whole-scene stitched video / storyboard grid.'],
      ['Blender', '.glb with animated camera + blocking, plus an import script.'],
      ['ComfyUI', 'Depth-workflow JSON included for Wan/LTX profiles.']
    ]
  },
  {
    section: 'Projects & saving',
    items: [
      ['Projects', 'A project is a folder of readable JSON — safe to back up, sync, or put in git.'],
      ['Autosave', 'A backup writes every minute; after a crash, Open Project restores unsaved work.'],
      ['Coverage', 'The scene owns the blocking; each shot owns a camera — shoot the same action from any angle without redoing moves.'],
      ['AI setup', 'Populate-from-reference needs a Claude API key: `ant auth login`, or save it to ~/.config/blockout/anthropic-api-key.']
    ]
  }
]

export function HelpOverlay(): JSX.Element | null {
  const helpOpen = useStore((s) => s.helpOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const [tab, setTab] = useState<'tutorial' | 'reference'>('tutorial')

  if (!helpOpen) return null

  return (
    <div className="help-backdrop" onClick={() => setHelpOpen(false)}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <div className="seg" style={{ width: 280 }}>
            <button className={tab === 'tutorial' ? 'active' : ''} onClick={() => setTab('tutorial')}>
              Tutorial
            </button>
            <button className={tab === 'reference' ? 'active' : ''} onClick={() => setTab('reference')}>
              Reference
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => setHelpOpen(false)}>
            Done
          </button>
        </div>

        <div className="help-body">
          {tab === 'tutorial' ? (
            <>
              <p className="help-intro">
                The whole app is three verbs: <b>STAGE</b> the scene, <b>SHOOT</b> the motion,{' '}
                <b>DELIVER</b> the reference package to your AI generator. Work through these steps
                once and you&apos;ll know everything.
              </p>
              {TUTORIAL.map((group) => (
                <div key={group.section} className="help-group">
                  <div className="help-section-title">{group.section}</div>
                  {group.steps.map((step, i) => (
                    <div key={step.title} className="help-step">
                      <div className="help-step-num">{i + 1}</div>
                      <div>
                        <div className="help-step-title">{step.title}</div>
                        <div className="help-step-body">{step.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : (
            REFERENCE.map((group) => (
              <div key={group.section} className="help-group">
                <div className="help-section-title">{group.section}</div>
                <table className="help-table">
                  <tbody>
                    {group.items.map(([term, desc]) => (
                      <tr key={term}>
                        <td className="help-term">{term}</td>
                        <td>{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
