/**
 * Help overlay, redesigned for a filmmaker skimming (not reading):
 *   • Quick start — six visual cards, the whole app at a glance.
 *   • How do I…? — a live-searchable task list distilled from the reference.
 *   • Shortcuts — the keyboard reference as a tidy kbd grid.
 * Opened from the titlebar ?, the welcome screen, or the ? key. Esc closes
 * (wired outside via the helpOpen store flag).
 */

import { useMemo, useState } from 'react'
import { useStore } from '../store'

function Kbd({ children }: { children: string }): JSX.Element {
  return <kbd className="help-kbd">{children}</kbd>
}

/* ---------------------------- Quick start cards --------------------------- */

interface Card {
  emoji: string
  title: string
  body: string
  then: string
}

const CARDS: Card[] = [
  {
    emoji: '🏗',
    title: 'Stage your set',
    body: 'Drop an environment and people from the Library, then click the floor to place them.',
    then: 'then: label your leads and set the light.'
  },
  {
    emoji: '🎬',
    title: 'One-click sequences',
    body: 'Whole dance numbers, fights, and chases, already choreographed. Click the floor to place the cast.',
    then: 'then: every performer stays editable on their own.'
  },
  {
    emoji: '🚶',
    title: 'Make them move',
    body: 'Select someone, press M and click marks. Or hit ● Record to puppeteer them with your cursor.',
    then: 'then: retime the pills on the timeline.'
  },
  {
    emoji: '✨',
    title: 'Animate tab',
    body: 'Fights, dances, and sit / drink / jump moves for any character. One click lays them down.',
    then: 'then: tweak the pose marks like any other.'
  },
  {
    emoji: '🎥',
    title: 'Frame & move the camera',
    body: 'Pick a framing, choose from 27 camera moves, or Track a subject so the aim locks on.',
    then: 'then: ▶ Play shot to see the exact export frame.'
  },
  {
    emoji: '📦',
    title: 'Deliver',
    body: 'Pick your generator and export the package: video, depth pass, stills, and a written prompt.',
    then: 'then: paste the prompt straight into the generator.'
  }
]

/* ------------------------------- How do I…? ------------------------------- */

interface Task {
  q: string
  a: JSX.Element
}

const TASKS: { area: string; items: Task[] }[] = [
  {
    area: 'Stage',
    items: [
      {
        q: 'How do I put a set and people in the scene?',
        a: (
          <>
            In <b>STAGE</b> mode, click a Library item (a person, prop, or a whole environment kit),
            then click the floor. Hold <Kbd>⌥</Kbd> to place several; <Kbd>Esc</Kbd> cancels.
          </>
        )
      },
      {
        q: 'How do I move, rotate, or duplicate something?',
        a: (
          <>
            Click to select, then drag the arrows to move. Press <Kbd>R</Kbd> to rotate,{' '}
            <Kbd>G</Kbd> back to move, <Kbd>⌘D</Kbd> to duplicate, <Kbd>⌫</Kbd> to delete.
          </>
        )
      },
      {
        q: 'How do I name a character for the AI generator?',
        a: (
          <>
            Select the person and type a label like <b>HERO</b> in the inspector, then pick a color.
            It floats above them, tints the model, and tells the generator who is who.
          </>
        )
      },
      {
        q: 'How do I pose someone without animating?',
        a: (
          <>
            Use the inspector&apos;s <b>Pose</b> section — Stand, Sit, Crouch, Lie, Talk, Fallen.
            Open <b>Pose limbs</b> for 14 sliders to build fight or dance stances.
          </>
        )
      },
      {
        q: 'How do I put a rider on a bike so they move together?',
        a: (
          <>
            Place the person, then choose <b>Marry to…</b> the bike in their inspector. Drag the
            bike and the rider comes along; <b>Unmarry</b> separates them.
          </>
        )
      },
      {
        q: 'How do I move a whole crowd I placed?',
        a: (
          <>
            Marry every performer to one lead, then move that lead — the group follows. Or{' '}
            <Kbd>⇧</Kbd>-click them all and drag, since a multi-selection moves as one.
          </>
        )
      },
      {
        q: 'How do I set the lighting?',
        a: (
          <>
            With nothing selected, the inspector shows the scene: pick a preset (Day, Golden hour,
            Night, Club…), drag the sun, add fog. Generators read light direction from your reference.
          </>
        )
      },
      {
        q: 'How do I stage a scene from a photo?',
        a: (
          <>
            <b>Populate from reference…</b> at the bottom of the Library stages people, poses,
            lighting, and a matching camera from an image. Needs a Claude API key; one <Kbd>⌘Z</Kbd> undoes it all.
          </>
        )
      },
      {
        q: 'How do I bring in my own 3D model?',
        a: (
          <>
            <b>Import 3D Model…</b> in the Library loads a GLB/glTF and copies it into the project.
          </>
        )
      },
      {
        q: 'How do I keep something out of the render but visible while I work?',
        a: (
          <>
            Select it and tick <b>Hide in exports</b> in the inspector. It stays in the editor but
            drops out of every rendered pass.
          </>
        )
      }
    ]
  },
  {
    area: 'Shoot',
    items: [
      {
        q: 'How do I make someone walk a path?',
        a: (
          <>
            In <b>SHOOT</b>, select them, press <Kbd>M</Kbd>, and click the floor to drop marks.
            They walk between marks on the timeline; select a mark to set its gait or hold.
          </>
        )
      },
      {
        q: 'How do I puppeteer someone with my mouse instead?',
        a: (
          <>
            Select a character or vehicle and press <b>● Record performer</b> — steer with the
            cursor and the gait matches your speed. <b>■ Stop</b> saves; re-record to replace it.
          </>
        )
      },
      {
        q: 'How do I make two people fight?',
        a: (
          <>
            Select a person, open the <b>Animate</b> tab, and Apply a fight move — it lays down
            editable pose marks at the playhead. Do the same on their opponent to trade blows.
          </>
        )
      },
      {
        q: 'How do I make a character dance?',
        a: (
          <>
            Select them and Apply a dance from the <b>Animate</b> tab (hip-hop, salsa, moonwalk,
            breakdance…). Or in Stage, drop a whole <b>Dance number</b> sequence at once.
          </>
        )
      },
      {
        q: 'How do I fly a plate across the room?',
        a: (
          <>
            Select any entity and Apply a flight from <b>Action presets</b>, or <b>● Record</b> it
            and use the <b>scroll wheel for altitude</b>. Set a mark&apos;s <b>Altitude</b> by hand later.
          </>
        )
      },
      {
        q: 'How do I land a plane or topple a building?',
        a: (
          <>
            Aim the entity first, then Apply from <b>Action presets</b> — plane takeoff / landing /
            flyby, heli orbit, car chase moves, falling debris, building topple. The path starts
            from where it stands.
          </>
        )
      },
      {
        q: 'How do I have someone board a bus or get off a plane?',
        a: (
          <>
            Select an actor&apos;s last mark and set <b>Board on arrival → the Bus</b>. To alight,
            marry them to a parked plane, then give them marks that start after it lands.
          </>
        )
      },
      {
        q: 'How do I retime or delete a move on the timeline?',
        a: (
          <>
            Drag a pill to retime it, drag its right edge to add a hold, and double-click to delete.
            <Kbd>⇧</Kbd>-click to multi-select pills.
          </>
        )
      },
      {
        q: 'How do I make a whole choreographed group at once?',
        a: (
          <>
            In Stage, the <b>Sequences</b> box stages a full cast: Dance number, Fight, Foot chase,
            or Car chase. Set the count and style, and it drops them already choreographed.
          </>
        )
      }
    ]
  },
  {
    area: 'Camera',
    items: [
      {
        q: 'How do I frame a shot?',
        a: (
          <>
            Select the camera and press <Kbd>C</Kbd> to look through it, then pick a shot size
            (WS/MS/CU) to auto-frame, or a framing (<b>2-SHOT / OTS / REV / TOP / LOW / DUTCH</b>).
          </>
        )
      },
      {
        q: 'How do I move the camera during a shot?',
        a: (
          <>
            Frame it, drop <b>+ Cam mark</b>, move and reframe, drop another — it travels between
            marks. Pick a <b>rig</b> (dolly, steadicam, handheld, crane, drone) for the motion feel.
          </>
        )
      },
      {
        q: 'How do I use one of the ready-made camera moves?',
        a: (
          <>
            The camera inspector has <b>27 moves</b> — orbits, cranes, drone follows, whip pan,
            vertigo dolly-zoom. One click lays down editable marks around your subject.
          </>
        )
      },
      {
        q: 'How do I track a plane with the camera?',
        a: (
          <>
            Turn on <b>Track subject</b> in the camera inspector and pick the subject — the aim
            locks on no matter how it moves, and focus follows too.
          </>
        )
      },
      {
        q: 'How do I fly the camera like an operator?',
        a: (
          <>
            Select the camera and press <b>● Record camera</b> — your blocking replays while you
            orbit, pan, and zoom the view, and your flight becomes the move, synced to the action.
          </>
        )
      },
      {
        q: 'How do I add a second camera?',
        a: (
          <>
            <b>Cameras (A/B/C)</b> at the top of the camera inspector: <b>+</b> adds Camera B with
            its own marks and rig. The chips switch between them; the export uses the active one.
          </>
        )
      },
      {
        q: 'How do I watch exactly what will export?',
        a: (
          <>
            <b>▶ Play shot</b> plays through the shot camera — the exact export frame. The{' '}
            <b>SHOT PREVIEW</b> box shows it live; <Kbd>Space</Kbd> plays, <Kbd>1–9</Kbd> jump to camera marks.
          </>
        )
      },
      {
        q: 'How do I match an existing shot?',
        a: (
          <>
            <b>🎞 Ref</b> ghosts any video (even a depth-map video) over the viewport, synced to
            your timeline — recreate its blocking by eye and adjust opacity and offset.
          </>
        )
      },
      {
        q: 'How do I try a risky version without losing my shot?',
        a: (
          <>
            Hover the shot in the left rail and click <b>+ Draft</b> — it snapshots as &quot;1A v1&quot;.
            Drafts play and export like shots; <b>▲</b> promotes one back to the real shot.
          </>
        )
      }
    ]
  },
  {
    area: 'Deliver',
    items: [
      {
        q: 'How do I export the package for my generator?',
        a: (
          <>
            In <b>DELIVER</b>, pick your target (Seedance, Veo, Kling, LTX, Wan…) and hit{' '}
            <b>Export shot package</b> — clean MP4, depth pass, stills, top-down diagram, and a
            written prompt.
          </>
        )
      },
      {
        q: 'How do I get a 720p file for Seedance?',
        a: (
          <>
            Set <b>Resolution</b> to 720p in Deliver — that&apos;s what Seedance accepts for
            reference files. It applies to videos, stills, and animatics.
          </>
        )
      },
      {
        q: 'How do I export just one frame?',
        a: (
          <>
            Scrub to the exact moment and click <b>📸 Export this frame</b> — it saves that single
            frame as a full-quality PNG.
          </>
        )
      },
      {
        q: 'How do I control whether labels show in the export?',
        a: (
          <>
            Choose whether labels burn into the video, appear only in stills (the default), or stay
            out entirely — right in the Deliver panel.
          </>
        )
      },
      {
        q: 'How do I stitch all my shots into one video?',
        a: (
          <>
            <b>Animatic</b> stitches every shot in the scene into one video; <b>Contact sheet</b>{' '}
            makes a storyboard grid.
          </>
        )
      },
      {
        q: 'How do I take the blocking into Blender?',
        a: (
          <>
            <b>Export to Blender</b> writes a .glb with the animated camera and blocking, plus a
            one-click import script.
          </>
        )
      }
    ]
  },
  {
    area: 'Projects',
    items: [
      {
        q: 'How do I save a set to reuse in another project?',
        a: (
          <>
            <b>Stage Presets</b> save the current staging (set + characters + blocking) globally.
            Stage it as a fresh scene in any project; the original never changes.
          </>
        )
      },
      {
        q: 'How do I shoot the same action from another angle?',
        a: (
          <>
            The scene owns the blocking and each shot owns its own camera, so make a{' '}
            <b>new shot</b> and just reframe — no need to redo the moves.
          </>
        )
      },
      {
        q: 'How do I recover work after a crash?',
        a: (
          <>
            A backup autosaves every minute; after a crash, <b>Open Project</b> restores the
            unsaved work. A project is just a folder of readable JSON, safe to back up or git.
          </>
        )
      },
      {
        q: 'How do I let an AI agent drive the app?',
        a: (
          <>
            Register <b>mcp/blockout-mcp.mjs</b> with Claude Code, Codex, or Hermes — the agent can
            stage scenes, frame shots, and screenshot the viewport. See AGENTS.md.
          </>
        )
      }
    ]
  }
]

/* ------------------------------- Shortcuts -------------------------------- */

const SHORTCUTS: [string, string][] = [
  ['Space', 'Play / pause the shot'],
  ['M', 'Drop marks for the selection (click the floor)'],
  ['C', 'Look through the shot camera'],
  ['G / R', 'Gizmo: move / rotate'],
  ['⇧-click', 'Multi-select entities, or marks on the timeline'],
  ['⌘A / ⇧⌘A', 'Select all marks in the shot / in the current lane'],
  ['⌘D', 'Duplicate selection'],
  ['⌫', 'Delete selection (all of a multi-selection)'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo — every action is undoable'],
  ['⌘S', 'Save project'],
  ['1–9', 'Jump to camera mark N'],
  ['⌥-click', 'Place multiple copies while staging'],
  ['Esc', 'Cancel placement / mark-dropping / selection'],
  ['?', 'Open this help']
]

/* -------------------------------- overlay -------------------------------- */

type Tab = 'quickstart' | 'tasks' | 'shortcuts'

export function HelpOverlay(): JSX.Element | null {
  const helpOpen = useStore((s) => s.helpOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const [tab, setTab] = useState<Tab>('quickstart')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TASKS
    const matches = (t: Task): boolean => {
      if (t.q.toLowerCase().includes(q)) return true
      // Answer text lives in JSX children; join their string leaves to search.
      const text = JSON.stringify(t.a).toLowerCase()
      return text.includes(q)
    }
    return TASKS.map((g) => ({ area: g.area, items: g.items.filter(matches) })).filter(
      (g) => g.items.length > 0
    )
  }, [query])

  if (!helpOpen) return null

  return (
    <div className="help-backdrop" onClick={() => setHelpOpen(false)}>
      <div className="help-modal help-v4" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <div className="seg help-tabs">
            <button
              className={tab === 'quickstart' ? 'active' : ''}
              onClick={() => setTab('quickstart')}
            >
              Quick start
            </button>
            <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
              How do I…?
            </button>
            <button
              className={tab === 'shortcuts' ? 'active' : ''}
              onClick={() => setTab('shortcuts')}
            >
              Shortcuts
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => setHelpOpen(false)}>
            Done
          </button>
        </div>

        <div className="help-body help-v4-body">
          {tab === 'quickstart' && (
            <div className="help-v4-inner">
              <p className="help-intro">
                The whole app is three verbs: <b>STAGE</b> the scene, <b>SHOOT</b> the motion,{' '}
                <b>DELIVER</b> the reference package to your AI generator. Here&apos;s the whole
                thing at a glance.
              </p>
              <div className="help-cards">
                {CARDS.map((c) => (
                  <div key={c.title} className="help-card">
                    <div className="help-card-emoji">{c.emoji}</div>
                    <div className="help-card-title">{c.title}</div>
                    <div className="help-card-body">{c.body}</div>
                    <div className="help-card-then">{c.then}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="help-v4-inner">
              <input
                className="help-search"
                type="text"
                placeholder="Search tasks — e.g. “fight”, “track a plane”, “720p”…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {filtered.length === 0 ? (
                <p className="help-empty">No tasks match “{query}”.</p>
              ) : (
                filtered.map((group) => (
                  <div key={group.area} className="help-task-group">
                    <div className="help-task-area">{group.area}</div>
                    {group.items.map((t) => (
                      <div key={t.q} className="help-task">
                        <div className="help-task-q">{t.q}</div>
                        <div className="help-task-a">{t.a}</div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="help-v4-inner">
              <p className="help-intro">Keyboard shortcuts — every action is undoable.</p>
              <div className="help-kbd-grid">
                {SHORTCUTS.map(([key, desc]) => (
                  <div key={key} className="help-kbd-row">
                    <div className="help-kbd-keys">
                      {key.split(' / ').map((k, i, arr) => (
                        <span key={k}>
                          <Kbd>{k}</Kbd>
                          {i < arr.length - 1 ? <span className="help-kbd-sep"> / </span> : null}
                        </span>
                      ))}
                    </div>
                    <div className="help-kbd-desc">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
