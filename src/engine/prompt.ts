/**
 * Prompt generation: turns actual shot data — lens, rig, camera path,
 * labeled subjects, mark timings, lighting — into a copy-paste prompt
 * tailored to a generator profile.
 */

import { assetSpec } from './assets'
import { SENSORS } from './camera'
import { GAITS } from './gaits'
import { RIGS } from './rigs'
import type { GeneratorProfile } from './profiles'
import type { CameraMark, LightingPresetId, Scene, Shot } from './types'

const LIGHTING_WORDS: Record<LightingPresetId, string> = {
  day: 'soft daylight',
  goldenHour: 'warm golden-hour light with long shadows',
  night: 'night, cool moonlit ambience',
  interiorWarm: 'warm practical interior lighting',
  interiorCool: 'cool fluorescent interior lighting',
  club: 'dark nightclub with colored moving lights'
}

function fmtTime(t: number): string {
  return `${Math.round(t * 10) / 10}s`
}

/** Wrap an angle delta to (-π, π] so seam-crossing moves read correctly. */
function wrapAngle(d: number): number {
  let a = d % (Math.PI * 2)
  if (a > Math.PI) a -= Math.PI * 2
  if (a < -Math.PI) a += Math.PI * 2
  return a
}

/** Human verb for a gait, present tense. */
const GAIT_VERBS: Record<string, string> = {
  stand: 'stands',
  walk: 'walks',
  jog: 'jogs',
  run: 'runs',
  sit: 'sits',
  lie: 'lies down',
  crouch: 'crouches',
  gesture: 'gestures',
  fall: 'falls'
}

/** Describe the camera's travel between two marks in operator language. */
function describeCameraLeg(from: CameraMark, to: CameraMark): string {
  const parts: string[] = []
  const dx = to.position.x - from.position.x
  const dy = to.position.y - from.position.y
  const dz = to.position.z - from.position.z

  // Project horizontal displacement onto the departure orientation
  // (heading convention: forward(pan) = (-sin pan, 0, -cos pan)).
  const fwdX = -Math.sin(from.pan)
  const fwdZ = -Math.cos(from.pan)
  const rightX = Math.cos(from.pan)
  const rightZ = -Math.sin(from.pan)
  const forward = dx * fwdX + dz * fwdZ
  const lateral = dx * rightX + dz * rightZ

  if (Math.abs(forward) > 0.3) parts.push(forward > 0 ? 'pushes in' : 'pulls back')
  if (Math.abs(lateral) > 0.3) parts.push(`tracks ${lateral > 0 ? 'right' : 'left'}`)
  if (Math.abs(dy) > 0.3) parts.push(`booms ${dy > 0 ? 'up' : 'down'}`)

  // Increasing pan rotates the camera LEFT under the heading convention
  // (rotation.y = pan), and deltas must be seam-wrapped.
  const panDelta = wrapAngle(to.pan - from.pan)
  if (Math.abs(panDelta) > 0.12) parts.push(`pans ${panDelta > 0 ? 'left' : 'right'}`)
  const tiltDelta = wrapAngle(to.tilt - from.tilt)
  if (Math.abs(tiltDelta) > 0.12) parts.push(`tilts ${tiltDelta > 0 ? 'up' : 'down'}`)

  if (Math.abs(to.focalLength - from.focalLength) > 2) {
    parts.push(
      `zooms ${to.focalLength > from.focalLength ? 'in' : 'out'} from ${Math.round(
        from.focalLength
      )}mm to ${Math.round(to.focalLength)}mm`
    )
  }
  if (parts.length === 0) parts.push('holds its frame')
  return parts.join(', ')
}

export function generatePrompt(scene: Scene, shot: Shot, profile: GeneratorProfile): string {
  const lines: string[] = []
  const marks = [...shot.camera.marks].sort((a, b) => a.time - b.time)
  const sensor = SENSORS[shot.camera.sensorId]
  const rig = RIGS[shot.camera.rig]
  const lens = marks[0]?.focalLength ?? 35

  // --- Look line
  lines.push(
    `Cinematic shot on a ${Math.round(lens)}mm lens (${sensor.name}), ${shot.aspect}, ${LIGHTING_WORDS[scene.environment.lighting]}.`
  )

  // --- Camera choreography
  if (marks.length <= 1) {
    lines.push(`Static ${rig.name.toLowerCase()} camera; the frame holds for ${fmtTime(shot.duration)}.`)
  } else {
    const legs: string[] = []
    for (let i = 0; i < marks.length - 1; i++) {
      const from = marks[i]!
      const to = marks[i + 1]!
      legs.push(
        `from ${fmtTime(from.time + from.hold)} to ${fmtTime(to.time)} the camera ${describeCameraLeg(from, to)}`
      )
    }
    lines.push(
      `Camera move (${rig.name}${shot.camera.rig === 'handheld' ? `, intensity ${Math.round(shot.camera.rigIntensity * 100)}%` : ''}), total ${fmtTime(shot.duration)}: ${legs.join('; ')}.`
    )
  }

  // --- Subjects & blocking
  const take = scene.blocking.find((b) => b.id === shot.blockingTakeId) ?? scene.blocking[0]
  const subjectLines: string[] = []
  if (take) {
    for (const track of take.tracks) {
      const entity = scene.entities.find((e) => e.id === track.entityId)
      if (!entity || track.marks.length === 0) continue
      const spec = assetSpec(entity.assetId)
      const name = entity.label
        ? `${spec.promptNoun} (labeled "${entity.label.text}")`
        : spec.promptNoun
      const sorted = [...track.marks].sort((a, b) => a.time - b.time)
      if (sorted.length === 1) {
        const gait = GAITS[sorted[0]!.gait]
        subjectLines.push(
          `${name} ${gait.travels ? 'stands' : (GAIT_VERBS[gait.id] ?? 'stands')} in place`
        )
      } else {
        const movePhrases: string[] = []
        for (let i = 1; i < sorted.length; i++) {
          const m = sorted[i]!
          // Travel legs with a non-travel gait render as walking (matching
          // the evaluator's coercion), so describe them that way.
          const gaitWord =
            m.gait === 'stand'
              ? 'moves'
              : GAITS[m.gait].travels
                ? (GAIT_VERBS[m.gait] ?? 'moves')
                : 'walks'
          movePhrases.push(`${gaitWord} to mark ${i + 1}, arriving at ${fmtTime(m.time)}`)
        }
        subjectLines.push(`${name} starts at mark 1, ${movePhrases.join(', then ')}`)
      }
    }
  }
  const staticNotable = scene.entities.filter(
    (e) =>
      !take?.tracks.some((tr) => tr.entityId === e.id) &&
      (assetSpec(e.assetId).category === 'people' ||
        assetSpec(e.assetId).category === 'vehicles' ||
        assetSpec(e.assetId).category === 'animals' ||
        e.label)
  )
  for (const e of staticNotable) {
    const spec = assetSpec(e.assetId)
    const name = e.label ? `${spec.promptNoun} (labeled "${e.label.text}")` : spec.promptNoun
    subjectLines.push(`${name} remains stationary`)
  }
  if (subjectLines.length > 0) {
    lines.push(`Subjects: ${subjectLines.join('. ')}.`)
  }

  // --- Environment
  const envEntities = scene.entities.filter((e) => assetSpec(e.assetId).category === 'environment')
  if (envEntities.length > 0) {
    const envWords = [...new Set(envEntities.map((e) => assetSpec(e.assetId).promptNoun))]
    lines.push(`Setting: ${envWords.join(', ')}.`)
  }

  // --- Adherence
  lines.push(profile.adherenceClause)
  lines.push(
    'The reference uses simplified grey placeholder figures — replace them with the real subjects described above while keeping every position, movement, and timing identical.'
  )

  return lines.join('\n\n')
}
