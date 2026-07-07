/**
 * Mixamo-style motion-preset library for Blockout.
 *
 * Each preset is a sequence of full-pose keyframes describing per-joint offsets
 * (radians) applied ADDITIVELY on top of a gait pose by the renderer (see
 * `animatePerson` / `AnimInput.overrides` in
 * `src/renderer/viewport/builders.ts`). The app interpolates LINEARLY between
 * keyframes, and any joint key missing from a keyframe reads as 0 — which would
 * pop the limb toward neutral mid-motion. To avoid that, every joint a motion
 * touches ANYWHERE appears in EVERY keyframe of that motion, with an explicit
 * value (including 0 for a deliberately-neutral pose).
 *
 * Sign conventions (from the renderer's override application):
 *   shoulderLX / shoulderRX : arm swing around X; NEGATIVE raises forward/up
 *                             (−2.3 ≈ straight up-forward, −1.5 ≈ punch height).
 *   shoulderLZ / shoulderRZ : arm out to the side; POSITIVE = outward (both
 *                             sides — the renderer mirrors the right arm).
 *   elbowL / elbowR         : bend; POSITIVE bends the forearm toward the
 *                             upper arm (1.9 ≈ chambered/guard, ~0.15 ≈ extended).
 *   hipLX / hipRX           : leg swing; POSITIVE ≈ leg back, NEGATIVE raises
 *                             the leg forward (−1.6 ≈ high front kick).
 *   kneeL / kneeR           : POSITIVE bends the shin backward.
 *   torsoX                  : POSITIVE leans the torso forward.
 *   torsoY                  : twist (positive = counterclockwise from above).
 *   headX                   : nod (small ±0.4). headY : turn.
 *
 * Guard-pose reference (fight moves): elbows ~1.8, shoulders X ≈ −0.9, slight
 * torsoX 0.15.
 *
 * Pure data — no engine-purity concerns (no DOM/three/Electron imports).
 */

export interface MotionKeyframe {
  /** Seconds from the start of the motion. */
  t: number
  joints: Record<string, number>
  /**
   * Optional root motion: offsets from the motion's base position, applied
   * by the app when laying down marks. `forward` is meters along the
   * character's heading, `up` is altitude. Lets a motion JUMP (up), CRAWL
   * (forward), or climb stairs (both) instead of staying rooted.
   */
  move?: { forward?: number; up?: number }
}

export interface MotionPreset {
  id: string
  name: string
  category: 'fight' | 'dance' | 'gesture' | 'stunt'
  /** Total length in seconds (last keyframe t should equal this). */
  duration: number
  /** True if the motion reads best repeated (dance loops). */
  loop: boolean
  keyframes: MotionKeyframe[]
}

export const MOTION_PRESETS: MotionPreset[] = [
  // -------------------------------------------------------------------------
  // FIGHT
  // -------------------------------------------------------------------------
  {
    id: 'jab-cross',
    name: 'Jab / Cross',
    category: 'fight',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0,
        },
      },
      // Right straight punch out (rear-hand cross fires first here).
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.5, elbowL: 1.9, elbowR: 0.15,
          torsoX: 0.15, torsoY: 0.5,
        },
      },
      // Retract right, reset guard.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0,
        },
      },
      // Left cross out (twist the other way).
      {
        t: 0.9,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, elbowL: 0.15, elbowR: 1.9,
          torsoX: 0.15, torsoY: -0.5,
        },
      },
      // Back to guard.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0,
        },
      },
    ],
  },
  {
    id: 'uppercut',
    name: 'Uppercut',
    category: 'fight',
    duration: 1.0,
    loop: false,
    keyframes: [
      // Guard, slight dip to load.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0,
        },
      },
      // Drop and coil — right hand low, torso wound.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: 0.2, elbowL: 1.8, elbowR: 1.9,
          torsoX: 0.4, torsoY: 0.35,
        },
      },
      // Drive up — right arm rips upward, torso opens and rises.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -2.1, elbowL: 1.8, elbowR: 1.2,
          torsoX: -0.1, torsoY: -0.4,
        },
      },
      // Recover to guard.
      {
        t: 1.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0,
        },
      },
    ],
  },
  {
    id: 'high-kick',
    name: 'High Kick',
    category: 'fight',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Guard, feet set.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          hipRX: 0, kneeR: 0, torsoX: 0.15,
        },
      },
      // Chamber — knee up, shin folded.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.7, shoulderRX: -0.7, elbowL: 1.6, elbowR: 1.6,
          hipRX: -1.0, kneeR: 1.6, torsoX: 0.1,
        },
      },
      // Front kick R — leg snaps out high, torso leans back to counter.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, elbowL: 1.5, elbowR: 1.5,
          hipRX: -1.7, kneeR: 0.1, torsoX: -0.25,
        },
      },
      // Re-chamber.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.7, shoulderRX: -0.7, elbowL: 1.6, elbowR: 1.6,
          hipRX: -1.0, kneeR: 1.6, torsoX: 0.1,
        },
      },
      // Recover to guard.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          hipRX: 0, kneeR: 0, torsoX: 0.15,
        },
      },
    ],
  },
  {
    id: 'block-and-dodge',
    name: 'Block & Dodge',
    category: 'fight',
    duration: 1.4,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, headX: 0, hipLX: 0, hipRX: 0, kneeL: 0, kneeR: 0,
        },
      },
      // Arms up high guard, forearms crossed in front of face.
      {
        t: 0.35,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.15, headX: 0.2, hipLX: 0, hipRX: 0, kneeL: 0, kneeR: 0,
        },
      },
      // Lean back and duck — weight drops, torso pulls back, knees bend.
      {
        t: 0.7,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 1.9, elbowR: 1.9,
          torsoX: -0.4, headX: 0.35, hipLX: 0.5, hipRX: 0.5,
          kneeL: 0.9, kneeR: 0.9,
        },
      },
      // Rise back into high guard.
      {
        t: 1.05,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.15, headX: 0.2, hipLX: 0, hipRX: 0, kneeL: 0, kneeR: 0,
        },
      },
      // Settle to guard.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, headX: 0, hipLX: 0, hipRX: 0, kneeL: 0, kneeR: 0,
        },
      },
    ],
  },
  {
    id: 'haymaker',
    name: 'Haymaker',
    category: 'fight',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderRZ: 0,
          elbowL: 1.8, elbowR: 1.8, torsoX: 0.15, torsoY: 0,
        },
      },
      // Wind up — right arm cocks way back and out, torso twists hard right.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: 0.1, shoulderRZ: 1.1,
          elbowL: 1.8, elbowR: 1.3, torsoX: 0.1, torsoY: 0.8,
        },
      },
      // Big swing across — arm sweeps around, torso unwinds counterclockwise.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.4, shoulderRZ: 0.8,
          elbowL: 1.8, elbowR: 0.3, torsoX: 0.2, torsoY: -0.6,
        },
      },
      // Follow-through past center.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.0, shoulderRZ: 0.2,
          elbowL: 1.8, elbowR: 0.6, torsoX: 0.25, torsoY: -0.8,
        },
      },
      // Recover to guard.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderRZ: 0,
          elbowL: 1.8, elbowR: 1.8, torsoX: 0.15, torsoY: 0,
        },
      },
    ],
  },
  {
    id: 'knocked-down',
    name: 'Knocked Down',
    category: 'fight',
    duration: 1.5,
    loop: false,
    keyframes: [
      // Standing, arms neutral-ish.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0, shoulderRZ: 0,
          elbowL: 0.3, elbowR: 0.3, torsoX: 0, torsoY: 0, headX: 0, headY: 0,
        },
      },
      // Hit reaction — head snaps, torso recoils back, arms fly up.
      {
        t: 0.3,
        joints: {
          shoulderLX: -1.8, shoulderRX: -1.8, shoulderLZ: 0.6, shoulderRZ: 0.6,
          elbowL: 0.5, elbowR: 0.5, torsoX: -0.5, torsoY: 0.4,
          headX: -0.3, headY: 0.5,
        },
      },
      // Stagger — torso whips forward, arms flail wide the other way.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.5, shoulderRX: -2.0, shoulderLZ: 0.9, shoulderRZ: 0.4,
          elbowL: 0.2, elbowR: 0.7, torsoX: 0.6, torsoY: -0.5,
          headX: 0.35, headY: -0.4,
        },
      },
      // Flail — arms thrown out, losing balance.
      {
        t: 0.9,
        joints: {
          shoulderLX: -1.6, shoulderRX: -0.6, shoulderLZ: 1.0, shoulderRZ: 0.9,
          elbowL: 0.6, elbowR: 0.3, torsoX: 0.5, torsoY: 0.3,
          headX: 0.3, headY: 0.3,
        },
      },
      // Going down — torso pitching forward, arms starting to drop.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.9, torsoY: 0,
          headX: 0.4, headY: 0,
        },
      },
      // Crumpled — the app holds this final pose: torso forward, arms hang down.
      {
        t: 1.5,
        joints: {
          shoulderLX: 0.2, shoulderRX: 0.2, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.5, elbowR: 0.5, torsoX: 1.1, torsoY: 0,
          headX: 0.4, headY: 0,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // DANCE
  // -------------------------------------------------------------------------
  {
    id: 'groove-loop',
    name: 'Groove Loop',
    category: 'dance',
    duration: 1.6,
    loop: true,
    keyframes: [
      // Right arm pumped up, sway right, left knee bent (bounce).
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.4, shoulderRX: -2.0, elbowL: 0.9, elbowR: 1.4,
          torsoY: 0.3, torsoX: 0.05, kneeL: 0.4, kneeR: 0.0,
        },
      },
      // Cross — pass through center.
      {
        t: 0.4,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 1.2, elbowR: 1.2,
          torsoY: 0.0, torsoX: 0.05, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Left arm pumped up, sway left, right knee bent.
      {
        t: 0.8,
        joints: {
          shoulderLX: -2.0, shoulderRX: -0.4, elbowL: 1.4, elbowR: 0.9,
          torsoY: -0.3, torsoX: 0.05, kneeL: 0.0, kneeR: 0.4,
        },
      },
      // Cross back.
      {
        t: 1.2,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 1.2, elbowR: 1.2,
          torsoY: 0.0, torsoX: 0.05, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Return to start pose to seamlessly loop.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.4, shoulderRX: -2.0, elbowL: 0.9, elbowR: 1.4,
          torsoY: 0.3, torsoX: 0.05, kneeL: 0.4, kneeR: 0.0,
        },
      },
    ],
  },
  {
    id: 'arms-up-party',
    name: 'Arms Up Party',
    category: 'dance',
    duration: 1.2,
    loop: true,
    keyframes: [
      // Both arms straight up, sway right.
      {
        t: 0.0,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.1, elbowR: 0.1, torsoY: 0.25, kneeL: 0.3, kneeR: 0.0,
        },
      },
      // Sway left, hands waving over.
      {
        t: 0.4,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, shoulderLZ: 0.6, shoulderRZ: 0.6,
          elbowL: 0.3, elbowR: 0.3, torsoY: -0.25, kneeL: 0.0, kneeR: 0.3,
        },
      },
      // Sway right again.
      {
        t: 0.8,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.1, elbowR: 0.1, torsoY: 0.25, kneeL: 0.3, kneeR: 0.0,
        },
      },
      // Loop back to start.
      {
        t: 1.2,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.1, elbowR: 0.1, torsoY: 0.25, kneeL: 0.3, kneeR: 0.0,
        },
      },
    ],
  },
  {
    id: 'disco-point',
    name: 'Disco Point',
    category: 'dance',
    duration: 1.6,
    loop: true,
    keyframes: [
      // Right arm points high diagonal, left arm low, torso twists right.
      {
        t: 0.0,
        joints: {
          shoulderLX: 0.3, shoulderRX: -2.2, shoulderLZ: 0.2, shoulderRZ: 0.5,
          elbowL: 0.2, elbowR: 0.1, torsoY: -0.4, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Switch — pass through center.
      {
        t: 0.4,
        joints: {
          shoulderLX: -0.8, shoulderRX: -0.8, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.5, elbowR: 0.5, torsoY: 0.0, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Left arm points high diagonal, right arm low, torso twists left.
      {
        t: 0.8,
        joints: {
          shoulderLX: -2.2, shoulderRX: 0.3, shoulderLZ: 0.5, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 0.2, torsoY: 0.4, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Switch back through center.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.8, shoulderRX: -0.8, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.5, elbowR: 0.5, torsoY: 0.0, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Loop to start.
      {
        t: 1.6,
        joints: {
          shoulderLX: 0.3, shoulderRX: -2.2, shoulderLZ: 0.2, shoulderRZ: 0.5,
          elbowL: 0.2, elbowR: 0.1, torsoY: -0.4, kneeL: 0.2, kneeR: 0.2,
        },
      },
    ],
  },
  {
    id: 'robot',
    name: 'Robot',
    category: 'dance',
    duration: 2.0,
    loop: true,
    // Stepped motion: keyframe pairs 0.05s apart hold a pose then snap to the
    // next, faking stiff robotic transitions between rigid 90° positions.
    keyframes: [
      // Pose A — right forearm up (90° elbow), left arm forward level.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 1.6, torsoY: 0.0,
        },
      },
      // Hold A.
      {
        t: 0.45,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 1.6, torsoY: 0.0,
        },
      },
      // Snap to B.
      {
        t: 0.5,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.5, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.6, elbowR: 0.1, torsoY: -0.2,
        },
      },
      // Hold B.
      {
        t: 0.95,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.5, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.6, elbowR: 0.1, torsoY: -0.2,
        },
      },
      // Snap to C — both forearms up, torso twisted the other way.
      {
        t: 1.0,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.6, elbowR: 1.6, torsoY: 0.2,
        },
      },
      // Hold C.
      {
        t: 1.45,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.6, elbowR: 1.6, torsoY: 0.2,
        },
      },
      // Snap back toward A.
      {
        t: 1.5,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 1.6, torsoY: 0.0,
        },
      },
      // Hold, then loop.
      {
        t: 2.0,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 1.6, torsoY: 0.0,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // GESTURE
  // -------------------------------------------------------------------------
  {
    id: 'wave',
    name: 'Wave',
    category: 'gesture',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Arm at side, neutral.
      {
        t: 0.0,
        joints: { shoulderRX: 0, shoulderRZ: 0, elbowR: 0 },
      },
      // Arm raised up-forward (waving position).
      {
        t: 0.3,
        joints: { shoulderRX: -2.3, shoulderRZ: 0.4, elbowR: 0.6 },
      },
      // Forearm wags out.
      {
        t: 0.55,
        joints: { shoulderRX: -2.3, shoulderRZ: 0.7, elbowR: 0.4 },
      },
      // Forearm wags in.
      {
        t: 0.8,
        joints: { shoulderRX: -2.3, shoulderRZ: 0.4, elbowR: 0.8 },
      },
      // Wags out again.
      {
        t: 1.0,
        joints: { shoulderRX: -2.3, shoulderRZ: 0.7, elbowR: 0.4 },
      },
      // Arm back down to side.
      {
        t: 1.2,
        joints: { shoulderRX: 0, shoulderRZ: 0, elbowR: 0 },
      },
    ],
  },
  {
    id: 'clap',
    name: 'Clap',
    category: 'gesture',
    duration: 1.0,
    loop: true,
    keyframes: [
      // Arms forward, hands apart (shoulders swung out to the sides).
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 0.9, elbowR: 0.9,
        },
      },
      // Palms meet — arms swing inward.
      {
        t: 0.25,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.05, shoulderRZ: 0.05,
          elbowL: 1.1, elbowR: 1.1,
        },
      },
      // Apart again.
      {
        t: 0.5,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 0.9, elbowR: 0.9,
        },
      },
      // Palms meet (second clap).
      {
        t: 0.75,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.05, shoulderRZ: 0.05,
          elbowL: 1.1, elbowR: 1.1,
        },
      },
      // Apart — loops to start.
      {
        t: 1.0,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 0.9, elbowR: 0.9,
        },
      },
    ],
  },
  {
    id: 'point-ahead',
    name: 'Point Ahead',
    category: 'gesture',
    duration: 0.8,
    loop: false,
    keyframes: [
      // Arm at side.
      {
        t: 0.0,
        joints: { shoulderRX: 0, shoulderRZ: 0, elbowR: 0 },
      },
      // Rising, elbow still a little bent.
      {
        t: 0.4,
        joints: { shoulderRX: -1.2, shoulderRZ: 0.1, elbowR: 0.5 },
      },
      // Straight horizontal point ahead, hold.
      {
        t: 0.8,
        joints: { shoulderRX: -1.55, shoulderRZ: 0.0, elbowR: 0.0 },
      },
    ],
  },
  {
    id: 'bow',
    name: 'Bow',
    category: 'gesture',
    duration: 1.5,
    loop: false,
    keyframes: [
      // Upright, arms at side.
      {
        t: 0.0,
        joints: {
          torsoX: 0, headX: 0, shoulderLX: 0, shoulderRX: 0,
          elbowL: 0, elbowR: 0,
        },
      },
      // Fold forward into the bow — arms trail slightly back, head follows.
      {
        t: 0.5,
        joints: {
          torsoX: 0.9, headX: 0.4, shoulderLX: 0.4, shoulderRX: 0.4,
          elbowL: 0.1, elbowR: 0.1,
        },
      },
      // Hold the bow.
      {
        t: 0.9,
        joints: {
          torsoX: 0.9, headX: 0.4, shoulderLX: 0.4, shoulderRX: 0.4,
          elbowL: 0.1, elbowR: 0.1,
        },
      },
      // Return upright.
      {
        t: 1.5,
        joints: {
          torsoX: 0, headX: 0, shoulderLX: 0, shoulderRX: 0,
          elbowL: 0, elbowR: 0,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // STUNT
  // -------------------------------------------------------------------------
  {
    id: 'dive-dodge',
    name: 'Dive Dodge',
    category: 'stunt',
    duration: 1.0,
    loop: false,
    keyframes: [
      // Standing ready.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.3, elbowR: 0.3,
          torsoX: 0.1, hipLX: 0, hipRX: 0, kneeL: 0, kneeR: 0,
        },
      },
      // Crouch wind-up — drop low, coil, arms pull back.
      {
        t: 0.4,
        joints: {
          shoulderLX: 0.4, shoulderRX: 0.4, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.5, hipLX: 0.6, hipRX: 0.6, kneeL: 1.3, kneeR: 1.3,
        },
      },
      // Explode into the dive — arms thrown forward, torso lunges, legs extend back.
      {
        t: 0.7,
        joints: {
          shoulderLX: -2.4, shoulderRX: -2.4, elbowL: 0.1, elbowR: 0.1,
          torsoX: 0.8, hipLX: 0.5, hipRX: 0.5, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Full extension — stretched out through the dodge.
      {
        t: 1.0,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, elbowL: 0.0, elbowR: 0.0,
          torsoX: 1.0, hipLX: 0.7, hipRX: 0.7, kneeL: 0.1, kneeR: 0.1,
        },
      },
    ],
  },

  // =========================================================================
  // ROUND 5 ADDITIONS
  // =========================================================================

  // -------------------------------------------------------------------------
  // DANCE — distinct silhouettes for one-click crowd dance numbers
  // -------------------------------------------------------------------------
  {
    id: 'hip-hop-bounce',
    name: 'Hip-Hop Bounce',
    category: 'dance',
    duration: 1.2,
    loop: true,
    keyframes: [
      // Low bounce down, right arm swagger out, left tucked.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -1.1, shoulderLZ: 0.2, shoulderRZ: 0.5,
          elbowL: 1.5, elbowR: 1.0, torsoX: 0.15, torsoY: 0.2,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.5, kneeR: 0.5,
        },
      },
      // Rise through center, arms cross the swagger.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.35, shoulderRZ: 0.35,
          elbowL: 1.2, elbowR: 1.2, torsoX: 0.1, torsoY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Low bounce again, left arm swagger out, right tucked.
      {
        t: 0.6,
        joints: {
          shoulderLX: -1.1, shoulderRX: -0.6, shoulderLZ: 0.5, shoulderRZ: 0.2,
          elbowL: 1.0, elbowR: 1.5, torsoX: 0.15, torsoY: -0.2,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.5, kneeR: 0.5,
        },
      },
      // Rise through center again.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.35, shoulderRZ: 0.35,
          elbowL: 1.2, elbowR: 1.2, torsoX: 0.1, torsoY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Loop back to start.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.6, shoulderRX: -1.1, shoulderLZ: 0.2, shoulderRZ: 0.5,
          elbowL: 1.5, elbowR: 1.0, torsoX: 0.15, torsoY: 0.2,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.5, kneeR: 0.5,
        },
      },
    ],
  },
  {
    id: 'salsa-step',
    name: 'Salsa Step',
    category: 'dance',
    duration: 1.6,
    loop: true,
    keyframes: [
      // Weight right, hip sways right, left arm open out, right arm closed in.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.0, shoulderRX: -0.9, shoulderLZ: 0.7, shoulderRZ: 0.1,
          elbowL: 0.9, elbowR: 1.4, torsoY: -0.25, torsoX: 0.05,
          hipLX: -0.2, hipRX: 0.2, kneeL: 0.15, kneeR: 0.3,
        },
      },
      // Cross center — arms swap toward neutral.
      {
        t: 0.4,
        joints: {
          shoulderLX: -0.95, shoulderRX: -0.95, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.15, elbowR: 1.15, torsoY: 0.0, torsoX: 0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.25, kneeR: 0.25,
        },
      },
      // Weight left, hip sways left, right arm open out, left arm closed in.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.0, shoulderLZ: 0.1, shoulderRZ: 0.7,
          elbowL: 1.4, elbowR: 0.9, torsoY: 0.25, torsoX: 0.05,
          hipLX: 0.2, hipRX: -0.2, kneeL: 0.3, kneeR: 0.15,
        },
      },
      // Cross back through center.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.95, shoulderRX: -0.95, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.15, elbowR: 1.15, torsoY: 0.0, torsoX: 0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.25, kneeR: 0.25,
        },
      },
      // Loop to start.
      {
        t: 1.6,
        joints: {
          shoulderLX: -1.0, shoulderRX: -0.9, shoulderLZ: 0.7, shoulderRZ: 0.1,
          elbowL: 0.9, elbowR: 1.4, torsoY: -0.25, torsoX: 0.05,
          hipLX: -0.2, hipRX: 0.2, kneeL: 0.15, kneeR: 0.3,
        },
      },
    ],
  },
  {
    id: 'moonwalk-lean',
    name: 'Moonwalk Lean',
    category: 'dance',
    duration: 2.0,
    loop: true,
    keyframes: [
      // Backward lean, arms loose low, right leg slides back extended.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.4, elbowR: 0.4, torsoX: -0.3,
          hipLX: 0.0, hipRX: 0.5, kneeL: 0.1, kneeR: 0.05,
        },
      },
      // Right foot plants, left leg slides back, weight shifts.
      {
        t: 0.5,
        joints: {
          shoulderLX: -0.25, shoulderRX: -0.15, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.4, elbowR: 0.4, torsoX: -0.3,
          hipLX: 0.5, hipRX: 0.0, kneeL: 0.05, kneeR: 0.1,
        },
      },
      // Left foot plants, right leg slides back again.
      {
        t: 1.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.4, elbowR: 0.4, torsoX: -0.3,
          hipLX: 0.0, hipRX: 0.5, kneeL: 0.1, kneeR: 0.05,
        },
      },
      // Right plants, left slides back.
      {
        t: 1.5,
        joints: {
          shoulderLX: -0.25, shoulderRX: -0.15, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.4, elbowR: 0.4, torsoX: -0.3,
          hipLX: 0.5, hipRX: 0.0, kneeL: 0.05, kneeR: 0.1,
        },
      },
      // Loop back to start.
      {
        t: 2.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.4, elbowR: 0.4, torsoX: -0.3,
          hipLX: 0.0, hipRX: 0.5, kneeL: 0.1, kneeR: 0.05,
        },
      },
    ],
  },
  {
    id: 'breakdance-freeze',
    name: 'Breakdance Freeze',
    category: 'dance',
    duration: 2.2,
    loop: false,
    keyframes: [
      // Standing ready, arms loose.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.1, torsoY: 0.0,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
      // Squat and reach one hand down to the floor.
      {
        t: 0.5,
        joints: {
          shoulderLX: -0.2, shoulderRX: 0.6, shoulderLZ: 0.4, shoulderRZ: 0.3,
          elbowL: 0.6, elbowR: 0.2, torsoX: 0.7, torsoY: 0.3,
          hipLX: 0.7, hipRX: 0.7, kneeL: 1.4, kneeR: 1.4,
        },
      },
      // Drop to the hand, torso pitches hard over, legs kick up and out.
      {
        t: 1.1,
        joints: {
          shoulderLX: 0.2, shoulderRX: 1.0, shoulderLZ: 0.9, shoulderRZ: 0.2,
          elbowL: 0.3, elbowR: 0.05, torsoX: 1.2, torsoY: 0.6,
          hipLX: -1.4, hipRX: -0.9, kneeL: 0.3, kneeR: 1.3,
        },
      },
      // Hold the freeze — one-hand support, legs splayed in the air.
      {
        t: 1.7,
        joints: {
          shoulderLX: 0.2, shoulderRX: 1.0, shoulderLZ: 0.9, shoulderRZ: 0.2,
          elbowL: 0.3, elbowR: 0.05, torsoX: 1.2, torsoY: 0.6,
          hipLX: -1.4, hipRX: -0.9, kneeL: 0.3, kneeR: 1.3,
        },
      },
      // Recover to standing.
      {
        t: 2.2,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.1, torsoY: 0.0,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
    ],
  },
  {
    id: 'macarena',
    name: 'Macarena',
    category: 'dance',
    duration: 3.2,
    loop: true,
    keyframes: [
      // Both arms straight out forward, palms down.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.55, shoulderRX: -1.55, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.1, elbowR: 0.1, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Arms out, palms flip up (open the elbows slightly).
      {
        t: 0.5,
        joints: {
          shoulderLX: -1.55, shoulderRX: -1.55, shoulderLZ: 0.25, shoulderRZ: 0.25,
          elbowL: 0.3, elbowR: 0.3, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Hands cross up to opposite shoulders.
      {
        t: 1.0,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, shoulderLZ: 0.05, shoulderRZ: 0.05,
          elbowL: 2.4, elbowR: 2.4, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Hands up to the back of the head.
      {
        t: 1.6,
        joints: {
          shoulderLX: -2.2, shoulderRX: -2.2, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 2.2, elbowR: 2.2, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Hands drop to the hips, hip sway right.
      {
        t: 2.2,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.6, elbowR: 1.6, torsoY: -0.25, hipLX: -0.15, hipRX: 0.15,
        },
      },
      // Hip sway left (the little wiggle before the jump).
      {
        t: 2.7,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.6, elbowR: 1.6, torsoY: 0.25, hipLX: 0.15, hipRX: -0.15,
        },
      },
      // Reset arms straight out forward to loop.
      {
        t: 3.2,
        joints: {
          shoulderLX: -1.55, shoulderRX: -1.55, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.1, elbowR: 0.1, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
    ],
  },
  {
    id: 'mosh-jump',
    name: 'Mosh Jump',
    category: 'dance',
    duration: 1.0,
    loop: true,
    keyframes: [
      // Compressed crouch — knees and hips loaded, arms cocked down.
      {
        t: 0.0,
        joints: {
          shoulderLX: 0.3, shoulderRX: 0.3, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.8, elbowR: 0.8, torsoX: 0.3,
          hipLX: 0.6, hipRX: 0.6, kneeL: 1.2, kneeR: 1.2,
        },
      },
      // Explode up — legs extend, both arms thrown straight up.
      {
        t: 0.35,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 0.1, torsoX: -0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.0, kneeR: 0.0,
        },
      },
      // Peak — fully extended, arms up, airborne.
      {
        t: 0.6,
        joints: {
          shoulderLX: -2.7, shoulderRX: -2.7, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.05, elbowR: 0.05, torsoX: -0.1,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.0, kneeR: 0.0,
        },
      },
      // Land back into the compressed crouch to loop.
      {
        t: 1.0,
        joints: {
          shoulderLX: 0.3, shoulderRX: 0.3, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.8, elbowR: 0.8, torsoX: 0.3,
          hipLX: 0.6, hipRX: 0.6, kneeL: 1.2, kneeR: 1.2,
        },
      },
    ],
  },
  {
    id: 'slow-sway',
    name: 'Slow Sway',
    category: 'dance',
    duration: 3.0,
    loop: true,
    keyframes: [
      // Gentle sway right, arms held mid at partner height.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.2, elbowR: 1.2, torsoY: 0.15, torsoX: 0.05,
          hipLX: -0.1, hipRX: 0.1,
        },
      },
      // Ease through center.
      {
        t: 0.75,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.2, elbowR: 1.2, torsoY: 0.0, torsoX: 0.05,
          hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Sway left.
      {
        t: 1.5,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.2, elbowR: 1.2, torsoY: -0.15, torsoX: 0.05,
          hipLX: 0.1, hipRX: -0.1,
        },
      },
      // Ease back through center.
      {
        t: 2.25,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.2, elbowR: 1.2, torsoY: 0.0, torsoX: 0.05,
          hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Loop back to the right sway.
      {
        t: 3.0,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 1.2, elbowR: 1.2, torsoY: 0.15, torsoX: 0.05,
          hipLX: -0.1, hipRX: 0.1,
        },
      },
    ],
  },
  {
    id: 'twist',
    name: 'The Twist',
    category: 'dance',
    duration: 1.2,
    loop: true,
    keyframes: [
      // Torso twisted right, arms pump opposite (elbows bent, swinging).
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.3, elbowR: 1.3, torsoY: 0.4, torsoX: 0.1,
          kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Through center — knees dip.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.3, elbowR: 1.3, torsoY: 0.0, torsoX: 0.1,
          kneeL: 0.45, kneeR: 0.45,
        },
      },
      // Torso twisted left, arms pump the other way.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.3, elbowR: 1.3, torsoY: -0.4, torsoX: 0.1,
          kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Back through center.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.3, elbowR: 1.3, torsoY: 0.0, torsoX: 0.1,
          kneeL: 0.45, kneeR: 0.45,
        },
      },
      // Loop to start.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.3, elbowR: 1.3, torsoY: 0.4, torsoX: 0.1,
          kneeL: 0.3, kneeR: 0.3,
        },
      },
    ],
  },
  {
    id: 'vogue-pose-chain',
    name: 'Vogue Pose Chain',
    category: 'dance',
    duration: 3.6,
    loop: false,
    keyframes: [
      // Neutral start.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.4, elbowR: 0.4, torsoY: 0.0, headY: 0.0,
        },
      },
      // Pose 1 — right arm framed high over the head, head turned.
      {
        t: 0.4,
        joints: {
          shoulderLX: -2.4, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.6,
          elbowL: 1.8, elbowR: 0.2, torsoY: -0.2, headY: 0.4,
        },
      },
      // Hold pose 1.
      {
        t: 1.0,
        joints: {
          shoulderLX: -2.4, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.6,
          elbowL: 1.8, elbowR: 0.2, torsoY: -0.2, headY: 0.4,
        },
      },
      // Pose 2 — left arm frames the face, right arm out to the side.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.5, shoulderRX: -1.5, shoulderLZ: 0.6, shoulderRZ: 0.9,
          elbowL: 0.2, elbowR: 2.0, torsoY: 0.2, headY: -0.4,
        },
      },
      // Hold pose 2.
      {
        t: 2.0,
        joints: {
          shoulderLX: -0.5, shoulderRX: -1.5, shoulderLZ: 0.6, shoulderRZ: 0.9,
          elbowL: 0.2, elbowR: 2.0, torsoY: 0.2, headY: -0.4,
        },
      },
      // Pose 3 — both arms boxed up beside the head, sharp.
      {
        t: 2.4,
        joints: {
          shoulderLX: -2.0, shoulderRX: -2.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 2.0, elbowR: 2.0, torsoY: 0.0, headY: 0.0,
        },
      },
      // Hold pose 3.
      {
        t: 3.0,
        joints: {
          shoulderLX: -2.0, shoulderRX: -2.0, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 2.0, elbowR: 2.0, torsoY: 0.0, headY: 0.0,
        },
      },
      // Pose 4 — arms sweep down and out, final flourish held.
      {
        t: 3.6,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.9, shoulderRZ: 0.9,
          elbowL: 0.1, elbowR: 0.1, torsoY: 0.0, headY: 0.0,
        },
      },
    ],
  },
  {
    id: 'charleston',
    name: 'Charleston',
    category: 'dance',
    duration: 1.4,
    loop: true,
    keyframes: [
      // Right knee up, arms swing back (opposition), torso light.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.4, shoulderRX: 0.4, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 0.5, torsoY: 0.15, torsoX: 0.1,
          hipLX: 0.1, hipRX: -0.8, kneeL: 0.2, kneeR: 1.2,
        },
      },
      // Feet together, arms swing forward through center.
      {
        t: 0.35,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 0.5, torsoY: 0.0, torsoX: 0.1,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Left knee up, arms swing back the other way.
      {
        t: 0.7,
        joints: {
          shoulderLX: 0.4, shoulderRX: -1.4, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 0.5, torsoY: -0.15, torsoX: 0.1,
          hipLX: -0.8, hipRX: 0.1, kneeL: 1.2, kneeR: 0.2,
        },
      },
      // Feet together, arms forward again.
      {
        t: 1.05,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 0.5, torsoY: 0.0, torsoX: 0.1,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Loop back to the first kick.
      {
        t: 1.4,
        joints: {
          shoulderLX: -1.4, shoulderRX: 0.4, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 0.5, torsoY: 0.15, torsoX: 0.1,
          hipLX: 0.1, hipRX: -0.8, kneeL: 0.2, kneeR: 1.2,
        },
      },
    ],
  },
  {
    id: 'headbang',
    name: 'Headbang',
    category: 'dance',
    duration: 0.8,
    loop: true,
    keyframes: [
      // Head up, slight crouch, arms cocked in a rock stance.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.3, elbowR: 1.3, torsoX: 0.0, headX: -0.35,
          kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Snap the head and torso down hard.
      {
        t: 0.2,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.3, elbowR: 1.3, torsoX: 0.5, headX: 0.4,
          kneeL: 0.4, kneeR: 0.4,
        },
      },
      // Whip back up.
      {
        t: 0.4,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.3, elbowR: 1.3, torsoX: 0.0, headX: -0.35,
          kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Second bang down.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.3, elbowR: 1.3, torsoX: 0.5, headX: 0.4,
          kneeL: 0.4, kneeR: 0.4,
        },
      },
      // Back up to loop.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.3, elbowR: 1.3, torsoX: 0.0, headX: -0.35,
          kneeL: 0.3, kneeR: 0.3,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // FIGHT
  // -------------------------------------------------------------------------
  {
    id: 'roundhouse-kick',
    name: 'Roundhouse Kick',
    category: 'fight',
    duration: 1.3,
    loop: false,
    keyframes: [
      // Guard, feet set.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0, hipRX: 0, kneeR: 0,
        },
      },
      // Pivot and chamber — knee whips up and across, torso winds.
      {
        t: 0.35,
        joints: {
          shoulderLX: -0.7, shoulderRX: -1.2, elbowL: 1.6, elbowR: 1.9,
          torsoX: 0.1, torsoY: 0.6, hipRX: -1.1, kneeR: 1.5,
        },
      },
      // Whip the shin out — leg extends across, torso rotates fully through.
      {
        t: 0.65,
        joints: {
          shoulderLX: -0.6, shoulderRX: -1.4, elbowL: 1.5, elbowR: 1.8,
          torsoX: 0.1, torsoY: -0.8, hipRX: -1.5, kneeR: 0.2,
        },
      },
      // Re-chamber after impact.
      {
        t: 0.95,
        joints: {
          shoulderLX: -0.7, shoulderRX: -1.2, elbowL: 1.6, elbowR: 1.9,
          torsoX: 0.1, torsoY: 0.2, hipRX: -1.1, kneeR: 1.5,
        },
      },
      // Recover to guard.
      {
        t: 1.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0, hipRX: 0, kneeR: 0,
        },
      },
    ],
  },
  {
    id: 'front-kick-combo',
    name: 'Front Kick / Jab',
    category: 'fight',
    duration: 1.6,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0, hipRX: 0, kneeR: 0,
        },
      },
      // Chamber front kick — right knee up.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.1, torsoY: 0.0, hipRX: -1.0, kneeR: 1.6,
        },
      },
      // Front kick snaps straight out.
      {
        t: 0.55,
        joints: {
          shoulderLX: -0.8, shoulderRX: -0.8, elbowL: 1.7, elbowR: 1.7,
          torsoX: -0.2, torsoY: 0.0, hipRX: -1.5, kneeR: 0.15,
        },
      },
      // Foot lands back into guard, load the jab.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.9, elbowR: 1.8,
          torsoX: 0.15, torsoY: -0.1, hipRX: 0, kneeR: 0,
        },
      },
      // Left jab fires straight.
      {
        t: 1.2,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, elbowL: 0.15, elbowR: 1.9,
          torsoX: 0.15, torsoY: -0.4, hipRX: 0, kneeR: 0,
        },
      },
      // Retract to guard.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0, hipRX: 0, kneeR: 0,
        },
      },
    ],
  },
  {
    id: 'spinning-backfist',
    name: 'Spinning Backfist',
    category: 'fight',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderRZ: 0, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0,
        },
      },
      // Wind the torso hard clockwise to start the spin.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderRZ: 0.2, elbowL: 1.8, elbowR: 1.6,
          torsoX: 0.1, torsoY: 0.9,
        },
      },
      // Backfist whips out as the torso unwinds through the spin.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.5, shoulderRZ: 0.9, elbowL: 1.8, elbowR: 0.4,
          torsoX: 0.15, torsoY: -0.9,
        },
      },
      // Follow-through past center.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.1, shoulderRZ: 0.4, elbowL: 1.8, elbowR: 1.0,
          torsoX: 0.15, torsoY: -1.1,
        },
      },
      // Recover to guard.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderRZ: 0, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0,
        },
      },
    ],
  },
  {
    id: 'double-jab-body-shot',
    name: 'Double Jab / Body Shot',
    category: 'fight',
    duration: 1.6,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0,
        },
      },
      // First jab out (left).
      {
        t: 0.25,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, elbowL: 0.15, elbowR: 1.8,
          torsoX: 0.15, torsoY: -0.35,
        },
      },
      // Half-retract.
      {
        t: 0.5,
        joints: {
          shoulderLX: -1.1, shoulderRX: -0.9, elbowL: 1.0, elbowR: 1.8,
          torsoX: 0.15, torsoY: -0.1,
        },
      },
      // Second jab out (left again).
      {
        t: 0.75,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, elbowL: 0.15, elbowR: 1.8,
          torsoX: 0.15, torsoY: -0.35,
        },
      },
      // Drop level and rip the right hand to the body — torso leans in low.
      {
        t: 1.1,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.0, elbowL: 1.8, elbowR: 0.6,
          torsoX: 0.5, torsoY: 0.4,
        },
      },
      // Recover to guard.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.8, elbowR: 1.8,
          torsoX: 0.15, torsoY: 0.0,
        },
      },
    ],
  },
  {
    id: 'guard-up-advance',
    name: 'Guard-Up Advance',
    category: 'fight',
    duration: 1.6,
    loop: true,
    keyframes: [
      // Tight high guard, weight on the back foot.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.2, hipLX: -0.15, hipRX: 0.2, kneeL: 0.4, kneeR: 0.3,
        },
      },
      // Lead foot creeps forward, guard stays tight.
      {
        t: 0.4,
        joints: {
          shoulderLX: -1.25, shoulderRX: -1.25, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.2, hipLX: -0.3, hipRX: 0.15, kneeL: 0.3, kneeR: 0.35,
        },
      },
      // Rear foot catches up, settle back into stance.
      {
        t: 0.8,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.2, hipLX: -0.15, hipRX: 0.2, kneeL: 0.4, kneeR: 0.3,
        },
      },
      // Another creeping lead step.
      {
        t: 1.2,
        joints: {
          shoulderLX: -1.25, shoulderRX: -1.25, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.2, hipLX: -0.3, hipRX: 0.15, kneeL: 0.3, kneeR: 0.35,
        },
      },
      // Settle — loops to start.
      {
        t: 1.6,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.2, hipLX: -0.15, hipRX: 0.2, kneeL: 0.4, kneeR: 0.3,
        },
      },
    ],
  },
  {
    id: 'dodge-weave',
    name: 'Dodge & Weave',
    category: 'fight',
    duration: 1.8,
    loop: true,
    keyframes: [
      // Centered guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.2, torsoY: 0.0, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Bob down and weave to the left.
      {
        t: 0.45,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.5, torsoY: 0.4, hipLX: 0.5, hipRX: 0.3, kneeL: 0.9, kneeR: 0.6,
        },
      },
      // Rise back to center.
      {
        t: 0.9,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.2, torsoY: 0.0, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Bob down and weave to the right.
      {
        t: 1.35,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.5, torsoY: -0.4, hipLX: 0.3, hipRX: 0.5, kneeL: 0.6, kneeR: 0.9,
        },
      },
      // Rise to center — loops.
      {
        t: 1.8,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.2, torsoY: 0.0, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
    ],
  },
  {
    id: 'grapple-shove',
    name: 'Grapple Shove',
    category: 'fight',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Guard, weight balanced.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.6, elbowR: 1.6,
          torsoX: 0.2, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Reach in and grab — arms extend forward, drop into the hips.
      {
        t: 0.35,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.4, hipLX: 0.4, hipRX: 0.4, kneeL: 0.7, kneeR: 0.7,
        },
      },
      // Drive and shove — legs extend, arms thrust out, torso rises through.
      {
        t: 0.7,
        joints: {
          shoulderLX: -1.55, shoulderRX: -1.55, elbowL: 0.1, elbowR: 0.1,
          torsoX: 0.0, hipLX: 0.0, hipRX: 0.0, kneeL: 0.0, kneeR: 0.0,
        },
      },
      // Recover to guard.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.6, elbowR: 1.6,
          torsoX: 0.2, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
    ],
  },
  {
    id: 'takedown-lunge',
    name: 'Takedown Lunge',
    category: 'fight',
    duration: 1.4,
    loop: false,
    keyframes: [
      // Guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.6, elbowR: 1.6,
          torsoX: 0.2, hipLX: 0.0, hipRX: 0.0, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Level change — drop the hips low, hands reach for the legs.
      {
        t: 0.4,
        joints: {
          shoulderLX: -1.2, shoulderRX: -1.2, elbowL: 0.5, elbowR: 0.5,
          torsoX: 0.7, hipLX: 0.7, hipRX: 0.7, kneeL: 1.3, kneeR: 1.3,
        },
      },
      // Explosive lunge — lead knee drives forward, arms clamp, torso spears in.
      {
        t: 0.75,
        joints: {
          shoulderLX: -0.8, shoulderRX: -0.8, elbowL: 1.4, elbowR: 1.4,
          torsoX: 1.0, hipLX: -0.9, hipRX: 0.6, kneeL: 1.0, kneeR: 0.4,
        },
      },
      // Drive through the finish, held low.
      {
        t: 1.05,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, elbowL: 1.6, elbowR: 1.6,
          torsoX: 1.1, hipLX: -0.6, hipRX: 0.8, kneeL: 1.2, kneeR: 0.6,
        },
      },
      // Recover to guard.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.6, elbowR: 1.6,
          torsoX: 0.2, hipLX: 0.0, hipRX: 0.0, kneeL: 0.3, kneeR: 0.3,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // REACTIONS & STUNTS — fight "defender" moves and falls
  // -------------------------------------------------------------------------
  {
    id: 'hit-reaction-head',
    name: 'Hit Reaction — Head',
    category: 'stunt',
    duration: 1.0,
    loop: false,
    keyframes: [
      // Standing, loose guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, elbowL: 1.2, elbowR: 1.2,
          torsoX: 0.1, torsoY: 0.0, headX: 0.0, headY: 0.0,
          hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Impact — head snaps back and to the side, torso recoils.
      {
        t: 0.2,
        joints: {
          shoulderLX: -1.0, shoulderRX: -0.4, elbowL: 1.0, elbowR: 1.0,
          torsoX: -0.4, torsoY: 0.4, headX: -0.4, headY: 0.5,
          hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Stagger a step, off balance to the side.
      {
        t: 0.55,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.9, elbowL: 0.9, elbowR: 0.9,
          torsoX: 0.2, torsoY: -0.3, headX: 0.2, headY: -0.3,
          hipLX: -0.3, hipRX: 0.3,
        },
      },
      // Regain composure.
      {
        t: 1.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, elbowL: 1.2, elbowR: 1.2,
          torsoX: 0.1, torsoY: 0.0, headX: 0.0, headY: 0.0,
          hipLX: 0.0, hipRX: 0.0,
        },
      },
    ],
  },
  {
    id: 'hit-reaction-body',
    name: 'Hit Reaction — Body',
    category: 'stunt',
    duration: 1.1,
    loop: false,
    keyframes: [
      // Standing, loose guard.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, elbowL: 1.2, elbowR: 1.2,
          torsoX: 0.1, headX: 0.0, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
      // Gut shot lands — double over hard, arms clamp to the middle.
      {
        t: 0.25,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 1.9, elbowR: 1.9,
          torsoX: 1.0, headX: 0.4, hipLX: 0.3, hipRX: 0.3, kneeL: 0.7, kneeR: 0.7,
        },
      },
      // Hold, hunched, absorbing it.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.9, headX: 0.4, hipLX: 0.3, hipRX: 0.3, kneeL: 0.6, kneeR: 0.6,
        },
      },
      // Slowly straighten back up.
      {
        t: 1.1,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, elbowL: 1.2, elbowR: 1.2,
          torsoX: 0.1, headX: 0.0, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
    ],
  },
  {
    id: 'stumble-back-fall',
    name: 'Stumble Back & Fall',
    category: 'stunt',
    duration: 1.8,
    loop: false,
    keyframes: [
      // Standing.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.0, headX: 0.0,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
      // Knocked back — arms fly up, torso recoils, one leg lifts.
      {
        t: 0.3,
        joints: {
          shoulderLX: -1.8, shoulderRX: -1.8, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 0.4, elbowR: 0.4, torsoX: -0.5, headX: -0.3,
          hipLX: -0.6, hipRX: 0.3, kneeL: 0.5, kneeR: 0.1,
        },
      },
      // Losing it — arms windmill, torso pitching, knees buckling.
      {
        t: 0.7,
        joints: {
          shoulderLX: -1.2, shoulderRX: -0.4, shoulderLZ: 0.9, shoulderRZ: 0.5,
          elbowL: 0.3, elbowR: 0.5, torsoX: -0.2, headX: 0.2,
          hipLX: 0.4, hipRX: 0.6, kneeL: 1.2, kneeR: 1.3,
        },
      },
      // Hitting the ground — collapsing onto the back.
      {
        t: 1.2,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, shoulderLZ: 0.6, shoulderRZ: 0.6,
          elbowL: 0.6, elbowR: 0.6, torsoX: -0.9, headX: 0.3,
          hipLX: -1.2, hipRX: -1.2, kneeL: 0.8, kneeR: 0.8,
        },
      },
      // Prone on the ground — the app holds this final pose (legs up, torso back).
      {
        t: 1.8,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, shoulderLZ: 0.9, shoulderRZ: 0.9,
          elbowL: 0.3, elbowR: 0.3, torsoX: -1.3, headX: 0.4,
          hipLX: -1.5, hipRX: -1.5, kneeL: 1.0, kneeR: 1.0,
        },
      },
    ],
  },
  {
    id: 'shield-block',
    name: 'Shield Block',
    category: 'stunt',
    duration: 1.4,
    loop: true,
    keyframes: [
      // Braced behind a raised shield — forearms up, weight low and set.
      {
        t: 0.0,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.25, headX: 0.15, hipLX: 0.1, hipRX: 0.2, kneeL: 0.4, kneeR: 0.4,
        },
      },
      // Absorb an impact — driven back slightly, dig in harder.
      {
        t: 0.4,
        joints: {
          shoulderLX: -1.5, shoulderRX: -1.5, elbowL: 2.1, elbowR: 2.1,
          torsoX: 0.35, headX: 0.25, hipLX: 0.3, hipRX: 0.4, kneeL: 0.6, kneeR: 0.6,
        },
      },
      // Push back to the braced hold.
      {
        t: 0.9,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.25, headX: 0.15, hipLX: 0.1, hipRX: 0.2, kneeL: 0.4, kneeR: 0.4,
        },
      },
      // Loop back to the braced hold.
      {
        t: 1.4,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.25, headX: 0.15, hipLX: 0.1, hipRX: 0.2, kneeL: 0.4, kneeR: 0.4,
        },
      },
    ],
  },
  {
    id: 'roll-dodge',
    name: 'Roll Dodge',
    category: 'stunt',
    duration: 1.4,
    loop: false,
    keyframes: [
      // Standing ready.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, elbowL: 0.5, elbowR: 0.5,
          torsoX: 0.1, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
      // Duck low and dive — tuck the chin, hips fold, arms reach down-forward.
      {
        t: 0.3,
        joints: {
          shoulderLX: -1.6, shoulderRX: -1.6, elbowL: 1.2, elbowR: 1.2,
          torsoX: 1.0, hipLX: 0.9, hipRX: 0.9, kneeL: 1.5, kneeR: 1.5,
        },
      },
      // Over the shoulder — fully tucked ball through the roll.
      {
        t: 0.7,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, elbowL: 2.2, elbowR: 2.2,
          torsoX: 1.3, hipLX: 1.0, hipRX: 1.0, kneeL: 2.0, kneeR: 2.0,
        },
      },
      // Coming up out of the roll to one knee.
      {
        t: 1.05,
        joints: {
          shoulderLX: -0.7, shoulderRX: -0.7, elbowL: 0.9, elbowR: 0.9,
          torsoX: 0.6, hipLX: -0.4, hipRX: 0.8, kneeL: 0.9, kneeR: 1.3,
        },
      },
      // Back to standing ready.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, elbowL: 0.5, elbowR: 0.5,
          torsoX: 0.1, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
    ],
  },
  {
    id: 'dazed-wobble',
    name: 'Dazed Wobble',
    category: 'stunt',
    duration: 2.4,
    loop: true,
    keyframes: [
      // Woozy — head lolls right, torso tips, arms hang heavy.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.5, elbowR: 0.5,
          torsoX: 0.1, torsoY: 0.2, headX: 0.2, headY: 0.3,
          hipLX: -0.1, hipRX: 0.1, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Sway forward, nearly pitching over.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.4, torsoY: 0.0, headX: 0.35, headY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.35, kneeR: 0.35,
        },
      },
      // Lurch the other way — head lolls left, torso tips back.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.5, elbowR: 0.5,
          torsoX: -0.1, torsoY: -0.2, headX: -0.1, headY: -0.3,
          hipLX: 0.1, hipRX: -0.1, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Sway forward again.
      {
        t: 1.8,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.4, torsoY: 0.0, headX: 0.35, headY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.35, kneeR: 0.35,
        },
      },
      // Loop back to the woozy start.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.5, elbowR: 0.5,
          torsoX: 0.1, torsoY: 0.2, headX: 0.2, headY: 0.3,
          hipLX: -0.1, hipRX: 0.1, kneeL: 0.2, kneeR: 0.2,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // GESTURE
  // -------------------------------------------------------------------------
  {
    id: 'cheer-jump',
    name: 'Cheer Jump',
    category: 'gesture',
    duration: 1.2,
    loop: false,
    keyframes: [
      // Crouch to load the jump, arms cocked down.
      {
        t: 0.0,
        joints: {
          shoulderLX: 0.2, shoulderRX: 0.2, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.6, elbowR: 0.6, torsoX: 0.3,
          hipLX: 0.5, hipRX: 0.5, kneeL: 1.1, kneeR: 1.1,
        },
      },
      // Launch — legs extend, arms fly straight up in a V.
      {
        t: 0.35,
        joints: {
          shoulderLX: -2.6, shoulderRX: -2.6, shoulderLZ: 0.6, shoulderRZ: 0.6,
          elbowL: 0.1, elbowR: 0.1, torsoX: 0.0,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.0, kneeR: 0.0,
        },
      },
      // Peak — arms up, celebrating.
      {
        t: 0.6,
        joints: {
          shoulderLX: -2.7, shoulderRX: -2.7, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 0.05, elbowR: 0.05, torsoX: -0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.0, kneeR: 0.0,
        },
      },
      // Land, arms coming down, absorb.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.8, shoulderRX: -0.8, shoulderLZ: 0.5, shoulderRZ: 0.5,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.2,
          hipLX: 0.4, hipRX: 0.4, kneeL: 0.7, kneeR: 0.7,
        },
      },
      // Settle to standing.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.3, elbowR: 0.3, torsoX: 0.0,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
    ],
  },
  {
    id: 'argue-point',
    name: 'Argue & Point',
    category: 'gesture',
    duration: 1.6,
    loop: true,
    keyframes: [
      // Lean in, right hand jabbing a point forward, left hand on hip-ish.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.5, shoulderRX: -1.4, shoulderLZ: 0.5, shoulderRZ: 0.1,
          elbowL: 1.6, elbowR: 0.3, torsoX: 0.3, torsoY: -0.2, headX: 0.15,
        },
      },
      // Pull the point back, gesture builds.
      {
        t: 0.4,
        joints: {
          shoulderLX: -0.5, shoulderRX: -1.0, shoulderLZ: 0.5, shoulderRZ: 0.2,
          elbowL: 1.6, elbowR: 1.2, torsoX: 0.15, torsoY: 0.1, headX: 0.0,
        },
      },
      // Jab the point forward again, harder.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.5, shoulderRX: -1.5, shoulderLZ: 0.5, shoulderRZ: 0.1,
          elbowL: 1.6, elbowR: 0.2, torsoX: 0.35, torsoY: -0.25, headX: 0.2,
        },
      },
      // Ease back, hands open in exasperation.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.7, shoulderRX: -0.7, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 0.9, elbowR: 0.9, torsoX: 0.05, torsoY: 0.0, headX: -0.1,
        },
      },
      // Loop back to the leaning-in jab.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.5, shoulderRX: -1.4, shoulderLZ: 0.5, shoulderRZ: 0.1,
          elbowL: 1.6, elbowR: 0.3, torsoX: 0.3, torsoY: -0.2, headX: 0.15,
        },
      },
    ],
  },
  {
    id: 'salute',
    name: 'Salute',
    category: 'gesture',
    duration: 1.6,
    loop: false,
    keyframes: [
      // Attention — arms at sides, standing tall.
      {
        t: 0.0,
        joints: {
          shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0, headX: 0.0,
        },
      },
      // Snap the right hand up to the brow.
      {
        t: 0.35,
        joints: {
          shoulderRX: -1.3, shoulderRZ: 0.35, elbowR: 2.3, headX: 0.05,
        },
      },
      // Hold the salute crisply.
      {
        t: 1.0,
        joints: {
          shoulderRX: -1.3, shoulderRZ: 0.35, elbowR: 2.3, headX: 0.05,
        },
      },
      // Cut the hand back down to the side.
      {
        t: 1.6,
        joints: {
          shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0, headX: 0.0,
        },
      },
    ],
  },
  {
    id: 'look-around-paranoid',
    name: 'Look Around (Paranoid)',
    category: 'gesture',
    duration: 2.8,
    loop: true,
    keyframes: [
      // Neutral, slightly hunched, glancing right.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.15, torsoY: -0.2, headX: 0.0, headY: -0.5,
        },
      },
      // Whip the head and torso to look sharply left.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.15, torsoY: 0.3, headX: 0.0, headY: 0.6,
        },
      },
      // Hold, scanning left.
      {
        t: 1.1,
        joints: {
          shoulderLX: -0.35, shoulderRX: -0.35, elbowL: 0.65, elbowR: 0.65,
          torsoX: 0.15, torsoY: 0.3, headX: 0.0, headY: 0.65,
        },
      },
      // Glance back over the right shoulder.
      {
        t: 1.7,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.2, torsoY: -0.35, headX: 0.0, headY: -0.65,
        },
      },
      // Ease back toward center-right.
      {
        t: 2.2,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.15, torsoY: -0.1, headX: 0.0, headY: -0.3,
        },
      },
      // Loop back to the first glance.
      {
        t: 2.8,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.6, elbowR: 0.6,
          torsoX: 0.15, torsoY: -0.2, headX: 0.0, headY: -0.5,
        },
      },
    ],
  },

  // =========================================================================
  // ROUND 6 ADDITIONS — user-requested named motions
  // =========================================================================

  // -------------------------------------------------------------------------
  // GESTURE
  // -------------------------------------------------------------------------
  {
    id: 'playing-cards',
    name: 'Playing Cards',
    category: 'gesture',
    duration: 3.0,
    loop: true,
    keyframes: [
      // Seated-friendly: forearms up holding a fan of cards, both hands.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.7, elbowR: 1.7, torsoX: 0.1, headX: 0.15,
        },
      },
      // Right hand reaches forward to play a card.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.1, shoulderLZ: 0.2, shoulderRZ: 0.1,
          elbowL: 1.7, elbowR: 0.5, torsoX: 0.15, headX: 0.25,
        },
      },
      // Right hand back to the fan.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.7, elbowR: 1.7, torsoX: 0.1, headX: 0.15,
        },
      },
      // Left hand reaches forward to play a card.
      {
        t: 1.8,
        joints: {
          shoulderLX: -1.1, shoulderRX: -0.9, shoulderLZ: 0.1, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 1.7, torsoX: 0.15, headX: 0.25,
        },
      },
      // Both back to the fan, look down at hand.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.7, elbowR: 1.7, torsoX: 0.1, headX: 0.35,
        },
      },
      // Loop back to the neutral fan.
      {
        t: 3.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.7, elbowR: 1.7, torsoX: 0.1, headX: 0.15,
        },
      },
    ],
  },
  {
    id: 'shoot-squirt-gun',
    name: 'Shoot Squirt Gun',
    category: 'gesture',
    duration: 2.2,
    loop: false,
    keyframes: [
      // Arm at side, neutral.
      {
        t: 0.0,
        joints: { shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0 },
      },
      // Right arm extends level to aim.
      {
        t: 0.5,
        joints: { shoulderRX: -1.55, shoulderRZ: 0.0, elbowR: 0.1 },
      },
      // Trigger pulse 1 — tiny elbow/shoulder recoil.
      {
        t: 0.8,
        joints: { shoulderRX: -1.7, shoulderRZ: 0.0, elbowR: 0.35 },
      },
      // Return to aim.
      {
        t: 1.0,
        joints: { shoulderRX: -1.55, shoulderRZ: 0.0, elbowR: 0.1 },
      },
      // Trigger pulse 2.
      {
        t: 1.25,
        joints: { shoulderRX: -1.7, shoulderRZ: 0.0, elbowR: 0.35 },
      },
      // Return to aim.
      {
        t: 1.45,
        joints: { shoulderRX: -1.55, shoulderRZ: 0.0, elbowR: 0.1 },
      },
      // Trigger pulse 3.
      {
        t: 1.7,
        joints: { shoulderRX: -1.7, shoulderRZ: 0.0, elbowR: 0.35 },
      },
      // Lower the arm back to the side.
      {
        t: 2.2,
        joints: { shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0 },
      },
    ],
  },
  {
    id: 'open-door',
    name: 'Open Door',
    category: 'gesture',
    duration: 1.8,
    loop: false,
    keyframes: [
      // Standing, arms neutral.
      {
        t: 0.0,
        joints: {
          shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0,
          torsoX: 0.0, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Reach forward to handle height, small lean in.
      {
        t: 0.5,
        joints: {
          shoulderRX: -1.4, shoulderRZ: 0.05, elbowR: 0.3,
          torsoX: 0.2, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Grip the handle.
      {
        t: 0.8,
        joints: {
          shoulderRX: -1.35, shoulderRZ: 0.05, elbowR: 0.5,
          torsoX: 0.15, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Pull back and aside with a small step-back lean.
      {
        t: 1.3,
        joints: {
          shoulderRX: -0.9, shoulderRZ: 0.4, elbowR: 1.3,
          torsoX: -0.15, torsoY: -0.35, hipLX: 0.2, hipRX: -0.1,
        },
      },
      // Settle, arm back down.
      {
        t: 1.8,
        joints: {
          shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0,
          torsoX: 0.0, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
    ],
  },
  {
    id: 'close-door',
    name: 'Close Door',
    category: 'gesture',
    duration: 1.8,
    loop: false,
    keyframes: [
      // Standing, arms neutral, slightly turned to the door.
      {
        t: 0.0,
        joints: {
          shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0,
          torsoX: 0.0, torsoY: -0.2, hipLX: 0.0, hipRX: 0.0,
        },
      },
      // Reach out and grip the edge.
      {
        t: 0.5,
        joints: {
          shoulderRX: -1.0, shoulderRZ: 0.4, elbowR: 1.2,
          torsoX: -0.1, torsoY: -0.3, hipLX: 0.15, hipRX: -0.1,
        },
      },
      // Push away firmly — arm extends forward, lean into it.
      {
        t: 1.1,
        joints: {
          shoulderRX: -1.45, shoulderRZ: 0.05, elbowR: 0.15,
          torsoX: 0.25, torsoY: 0.05, hipLX: 0.0, hipRX: 0.1,
        },
      },
      // Settle back, arm down.
      {
        t: 1.8,
        joints: {
          shoulderRX: 0.0, shoulderRZ: 0.0, elbowR: 0.0,
          torsoX: 0.0, torsoY: 0.0, hipLX: 0.0, hipRX: 0.0,
        },
      },
    ],
  },
  {
    id: 'lie-down-sleep',
    name: 'Lie Down & Sleep',
    category: 'gesture',
    duration: 3.0,
    loop: false,
    keyframes: [
      // Standing, arms loose.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.3, elbowR: 0.3,
          torsoX: 0.0, headX: 0.0, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: 0 },
      },
      // Turn-ish settle and begin to sit — knees and hips bend.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.1, shoulderRX: -0.1, elbowL: 0.5, elbowR: 0.5,
          torsoX: 0.3, headX: 0.1, hipLX: 0.8, hipRX: 0.8, kneeL: 1.4, kneeR: 1.4,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Recline toward flat — torso leans back, legs extending.
      {
        t: 1.7,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.6, elbowR: 0.6,
          torsoX: -0.6, headX: 0.15, hipLX: -0.6, hipRX: -0.6, kneeL: 0.6, kneeR: 0.6,
        },
        move: { forward: 0, up: -0.7 },
      },
      // Flat on the back, legs extended, one arm folds in.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.9, elbowL: 0.3, elbowR: 1.4,
          torsoX: -1.35, headX: 0.2, hipLX: -1.4, hipRX: -1.4, kneeL: 0.2, kneeR: 0.2,
        },
        move: { forward: 0, up: -0.75 },
      },
      // Still — hold the final sleeping pose.
      {
        t: 3.0,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.9, elbowL: 0.3, elbowR: 1.4,
          torsoX: -1.35, headX: 0.2, hipLX: -1.4, hipRX: -1.4, kneeL: 0.2, kneeR: 0.2,
        },
        move: { forward: 0, up: -0.75 },
      },
    ],
  },
  {
    id: 'sit-down',
    name: 'Sit Down',
    category: 'gesture',
    duration: 1.6,
    loop: false,
    keyframes: [
      // Standing tall.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.3, elbowR: 0.3,
          torsoX: 0.0, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: 0 },
      },
      // Lean slightly forward as the hips lower.
      {
        t: 0.6,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.35, hipLX: 0.6, hipRX: 0.6, kneeL: 0.9, kneeR: 0.9,
        },
        move: { forward: 0, up: -0.25 },
      },
      // Settle back onto the seat.
      {
        t: 1.1,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.05, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Final seated pose, held.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.05, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
    ],
  },
  {
    id: 'stand-up',
    name: 'Stand Up',
    category: 'gesture',
    duration: 1.6,
    loop: false,
    keyframes: [
      // Seated pose.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.05, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Lean forward over the feet to load.
      {
        t: 0.5,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.4, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.4, hipLX: 0.7, hipRX: 0.7, kneeL: 1.0, kneeR: 1.0,
        },
        move: { forward: 0, up: -0.25 },
      },
      // Push up through the legs.
      {
        t: 1.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, elbowL: 0.35, elbowR: 0.35,
          torsoX: 0.2, hipLX: 0.3, hipRX: 0.3, kneeL: 0.5, kneeR: 0.5,
        },
        move: { forward: 0, up: -0.1 },
      },
      // Standing tall.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.3, elbowR: 0.3,
          torsoX: 0.0, hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: 0 },
      },
    ],
  },
  {
    id: 'drink-seated',
    name: 'Drink (Seated)',
    category: 'gesture',
    duration: 2.4,
    loop: true,
    keyframes: [
      // Seated, right hand resting, cup at side.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.05, headX: 0.0, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Raise the right hand to the mouth.
      {
        t: 0.7,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.6, elbowL: 0.4, elbowR: 2.0,
          torsoX: 0.05, headX: -0.05, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Tip the head back to drink.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.7, elbowL: 0.4, elbowR: 2.2,
          torsoX: 0.05, headX: -0.3, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Lower the cup, head levels.
      {
        t: 1.8,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.4, elbowL: 0.4, elbowR: 1.0,
          torsoX: 0.05, headX: 0.0, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
      // Back to rest — loops.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.4, elbowR: 0.4,
          torsoX: 0.05, headX: 0.0, hipLX: 1.4, hipRX: 1.4, kneeL: 1.5, kneeR: 1.5,
        },
        move: { forward: 0, up: -0.45 },
      },
    ],
  },
  {
    id: 'drink-standing',
    name: 'Drink (Standing)',
    category: 'gesture',
    duration: 2.4,
    loop: true,
    keyframes: [
      // Standing, right hand at side.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.3, elbowR: 0.3,
          torsoX: 0.0, headX: 0.0,
        },
      },
      // Raise the right hand to the mouth.
      {
        t: 0.7,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.6, elbowL: 0.3, elbowR: 2.0,
          torsoX: 0.0, headX: -0.05,
        },
      },
      // Tip the head back to drink.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.7, elbowL: 0.3, elbowR: 2.2,
          torsoX: 0.0, headX: -0.3,
        },
      },
      // Lower the cup, head levels.
      {
        t: 1.8,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.4, elbowL: 0.3, elbowR: 1.0,
          torsoX: 0.0, headX: 0.0,
        },
      },
      // Back to rest — loops.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, elbowL: 0.3, elbowR: 0.3,
          torsoX: 0.0, headX: 0.0,
        },
      },
    ],
  },
  {
    id: 'basketball-dribble',
    name: 'Basketball Dribble',
    category: 'gesture',
    duration: 2.4,
    loop: true,
    keyframes: [
      // Athletic crouch, right hand at waist height.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.2,
          elbowL: 0.9, elbowR: 1.0, torsoX: 0.3,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.6, kneeR: 0.6,
        },
        move: { forward: 0, up: 0 },
      },
      // Dribble pulse down (right hand pushes the ball).
      {
        t: 0.35,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.35, shoulderLZ: 0.3, shoulderRZ: 0.2,
          elbowL: 0.9, elbowR: 0.6, torsoX: 0.35,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.7, kneeR: 0.7,
        },
        move: { forward: 0, up: 0 },
      },
      // Crossover to the left hand.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.35, shoulderRX: -0.4, shoulderLZ: 0.2, shoulderRZ: 0.3,
          elbowL: 0.6, elbowR: 0.9, torsoX: 0.35,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.7, kneeR: 0.7,
        },
        move: { forward: 0, up: 0 },
      },
      // Gather and load for the jump shot.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 1.6, elbowR: 1.6, torsoX: 0.25,
          hipLX: 0.6, hipRX: 0.6, kneeL: 1.1, kneeR: 1.1,
        },
        move: { forward: 0, up: 0 },
      },
      // Jump-shot arc — arms up, airborne.
      {
        t: 1.6,
        joints: {
          shoulderLX: -2.4, shoulderRX: -2.4, shoulderLZ: 0.15, shoulderRZ: 0.15,
          elbowL: 0.4, elbowR: 0.2, torsoX: -0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.05, kneeR: 0.05,
        },
        move: { forward: 0, up: 0.35 },
      },
      // Land back into the athletic crouch — loops.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.2,
          elbowL: 0.9, elbowR: 1.0, torsoX: 0.3,
          hipLX: 0.3, hipRX: 0.3, kneeL: 0.6, kneeR: 0.6,
        },
        move: { forward: 0, up: 0 },
      },
    ],
  },
  {
    id: 'soccer-kicks',
    name: 'Soccer Kicks',
    category: 'gesture',
    duration: 2.4,
    loop: true,
    keyframes: [
      // Balanced ready, arms out slightly for balance.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.1,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
      // Plant left, swing the right leg back to load the instep kick.
      {
        t: 0.4,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.3, shoulderLZ: 0.6, shoulderRZ: 0.3,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.05,
          hipLX: 0.1, hipRX: 0.7, kneeL: 0.2, kneeR: 0.9,
        },
      },
      // Right instep kick snaps through.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.5, shoulderLZ: 0.4, shoulderRZ: 0.6,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.05,
          hipLX: 0.1, hipRX: -1.0, kneeL: 0.15, kneeR: 0.2,
        },
      },
      // Trap/settle — right foot comes down, weight centers.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.1,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.2,
        },
      },
      // Left instep kick snaps through.
      {
        t: 1.9,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.3, shoulderLZ: 0.6, shoulderRZ: 0.4,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.05,
          hipLX: -1.0, hipRX: 0.1, kneeL: 0.2, kneeR: 0.15,
        },
      },
      // Settle back to ready — loops.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.1,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
      },
    ],
  },
  {
    id: 'tennis-swings',
    name: 'Tennis Swings',
    category: 'gesture',
    duration: 2.8,
    loop: true,
    keyframes: [
      // Split-step ready, both hands on the racquet in front.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.2, elbowR: 1.2, torsoX: 0.15, torsoY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.4, kneeR: 0.4,
        },
      },
      // Forehand load — turn and take the racquet back to the right.
      {
        t: 0.5,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.4, shoulderLZ: 0.2, shoulderRZ: 0.9,
          elbowL: 1.0, elbowR: 1.3, torsoX: 0.1, torsoY: 0.7,
          hipLX: 0.1, hipRX: 0.2, kneeL: 0.4, kneeR: 0.5,
        },
      },
      // Forehand swing across the body.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.6, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.0, elbowR: 0.5, torsoX: 0.1, torsoY: -0.7,
          hipLX: 0.2, hipRX: 0.1, kneeL: 0.4, kneeR: 0.3,
        },
      },
      // Recover to split-step ready.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.2, elbowR: 1.2, torsoX: 0.15, torsoY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.4, kneeR: 0.4,
        },
      },
      // Backhand load — turn to the left, racquet crosses over.
      {
        t: 1.9,
        joints: {
          shoulderLX: -0.4, shoulderRX: -1.3, shoulderLZ: 0.6, shoulderRZ: 0.2,
          elbowL: 1.4, elbowR: 1.6, torsoX: 0.1, torsoY: -0.6,
          hipLX: 0.2, hipRX: 0.1, kneeL: 0.5, kneeR: 0.4,
        },
      },
      // Backhand swing out.
      {
        t: 2.3,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.0, shoulderLZ: 0.7, shoulderRZ: 0.3,
          elbowL: 0.6, elbowR: 1.0, torsoX: 0.1, torsoY: 0.6,
          hipLX: 0.1, hipRX: 0.2, kneeL: 0.3, kneeR: 0.4,
        },
      },
      // Recover to ready — loops.
      {
        t: 2.8,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.2, elbowR: 1.2, torsoX: 0.15, torsoY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.4, kneeR: 0.4,
        },
      },
    ],
  },
  {
    id: 'kiss-lean',
    name: 'Kiss Lean',
    category: 'gesture',
    duration: 2.4,
    loop: false,
    keyframes: [
      // Standing, arms loose.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.3, elbowR: 0.3, torsoX: 0.0, headX: 0.0, headY: 0.0,
        },
        move: { forward: 0, up: 0 },
      },
      // Lean in — slight head tilt, rise on the toes, arms come forward.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.7, shoulderRX: -0.7, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.1, elbowR: 1.1, torsoX: 0.25, headX: -0.1, headY: 0.2,
        },
        move: { forward: 0, up: 0.06 },
      },
      // Hold the embrace-lean a beat.
      {
        t: 1.5,
        joints: {
          shoulderLX: -0.7, shoulderRX: -0.7, shoulderLZ: 0.4, shoulderRZ: 0.4,
          elbowL: 1.1, elbowR: 1.1, torsoX: 0.28, headX: -0.1, headY: 0.2,
        },
        move: { forward: 0, up: 0.06 },
      },
      // Ease back to standing.
      {
        t: 2.4,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.3, elbowR: 0.3, torsoX: 0.0, headX: 0.0, headY: 0.0,
        },
        move: { forward: 0, up: 0 },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // DANCE
  // -------------------------------------------------------------------------
  {
    id: 'c-walk',
    name: 'C-Walk',
    category: 'dance',
    duration: 1.6,
    loop: true,
    keyframes: [
      // Right heel out, light bounce, arms loose swagger.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.25,
          elbowL: 0.9, elbowR: 1.0, torsoX: 0.1, torsoY: 0.15,
          hipLX: 0.1, hipRX: -0.4, kneeL: 0.4, kneeR: 0.6,
        },
      },
      // Toe pivot in, knees pop through center.
      {
        t: 0.4,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.0, elbowR: 1.0, torsoX: 0.1, torsoY: 0.0,
          hipLX: 0.2, hipRX: 0.2, kneeL: 0.7, kneeR: 0.7,
        },
      },
      // Left heel out, swagger the other way.
      {
        t: 0.8,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.4, shoulderLZ: 0.25, shoulderRZ: 0.3,
          elbowL: 1.0, elbowR: 0.9, torsoX: 0.1, torsoY: -0.15,
          hipLX: -0.4, hipRX: 0.1, kneeL: 0.6, kneeR: 0.4,
        },
      },
      // Toe pivot through center again.
      {
        t: 1.2,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 1.0, elbowR: 1.0, torsoX: 0.1, torsoY: 0.0,
          hipLX: 0.2, hipRX: 0.2, kneeL: 0.7, kneeR: 0.7,
        },
      },
      // Loop back to the first heel-toe.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.4, shoulderRX: -0.5, shoulderLZ: 0.3, shoulderRZ: 0.25,
          elbowL: 0.9, elbowR: 1.0, torsoX: 0.1, torsoY: 0.15,
          hipLX: 0.1, hipRX: -0.4, kneeL: 0.4, kneeR: 0.6,
        },
      },
    ],
  },
  {
    id: 'freestyle-dance',
    name: 'Freestyle Dance',
    category: 'dance',
    duration: 2.0,
    loop: true,
    keyframes: [
      // Bounce down, right arm thrown up and out, torso twist right.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.5, shoulderRX: -2.3, shoulderLZ: 0.4, shoulderRZ: 0.6,
          elbowL: 1.1, elbowR: 0.4, torsoX: 0.1, torsoY: 0.4,
          hipLX: 0.2, hipRX: 0.2, kneeL: 0.5, kneeR: 0.3,
        },
      },
      // Rise through center, both arms sweep across.
      {
        t: 0.5,
        joints: {
          shoulderLX: -1.4, shoulderRX: -1.4, shoulderLZ: 0.6, shoulderRZ: 0.6,
          elbowL: 0.8, elbowR: 0.8, torsoX: 0.0, torsoY: 0.0,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.2, kneeR: 0.2,
        },
      },
      // Bounce down, left arm thrown up and out, torso twist left.
      {
        t: 1.0,
        joints: {
          shoulderLX: -2.3, shoulderRX: -0.5, shoulderLZ: 0.6, shoulderRZ: 0.4,
          elbowL: 0.4, elbowR: 1.1, torsoX: 0.1, torsoY: -0.4,
          hipLX: 0.2, hipRX: 0.2, kneeL: 0.3, kneeR: 0.5,
        },
      },
      // Big cross-body throw the other way.
      {
        t: 1.5,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.8, shoulderLZ: 0.7, shoulderRZ: 0.3,
          elbowL: 1.2, elbowR: 0.6, torsoX: 0.15, torsoY: 0.3,
          hipLX: 0.1, hipRX: 0.1, kneeL: 0.4, kneeR: 0.2,
        },
      },
      // Loop back to the first throw.
      {
        t: 2.0,
        joints: {
          shoulderLX: -0.5, shoulderRX: -2.3, shoulderLZ: 0.4, shoulderRZ: 0.6,
          elbowL: 1.1, elbowR: 0.4, torsoX: 0.1, torsoY: 0.4,
          hipLX: 0.2, hipRX: 0.2, kneeL: 0.5, kneeR: 0.3,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // FIGHT
  // -------------------------------------------------------------------------
  {
    id: 'boxing-combo',
    name: 'Boxing Combo',
    category: 'fight',
    duration: 2.0,
    loop: true,
    keyframes: [
      // Guard bounce, weight up.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.15, torsoY: 0.0, hipLX: 0.1, hipRX: 0.1, kneeL: 0.25, kneeR: 0.25,
        },
      },
      // Jab (left) fires.
      {
        t: 0.3,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, elbowL: 0.15, elbowR: 1.9,
          torsoX: 0.15, torsoY: -0.35, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Second jab (left) fires again.
      {
        t: 0.6,
        joints: {
          shoulderLX: -1.5, shoulderRX: -0.9, elbowL: 0.15, elbowR: 1.9,
          torsoX: 0.15, torsoY: -0.35, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Cross (right) drives across.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.9, shoulderRX: -1.5, elbowL: 1.9, elbowR: 0.15,
          torsoX: 0.15, torsoY: 0.5, hipLX: 0.1, hipRX: 0.1, kneeL: 0.3, kneeR: 0.3,
        },
      },
      // Slip to the outside — bob and roll under.
      {
        t: 1.3,
        joints: {
          shoulderLX: -1.0, shoulderRX: -1.0, elbowL: 2.0, elbowR: 2.0,
          torsoX: 0.5, torsoY: -0.4, hipLX: 0.4, hipRX: 0.4, kneeL: 0.8, kneeR: 0.8,
        },
      },
      // Rise back to guard bounce.
      {
        t: 1.6,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.15, torsoY: 0.0, hipLX: 0.1, hipRX: 0.1, kneeL: 0.25, kneeR: 0.25,
        },
      },
      // Loop back to the guard bounce.
      {
        t: 2.0,
        joints: {
          shoulderLX: -0.9, shoulderRX: -0.9, elbowL: 1.9, elbowR: 1.9,
          torsoX: 0.15, torsoY: 0.0, hipLX: 0.1, hipRX: 0.1, kneeL: 0.25, kneeR: 0.25,
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  // STUNT
  // -------------------------------------------------------------------------
  {
    id: 'fall-backwards',
    name: 'Fall Backwards',
    category: 'stunt',
    duration: 1.8,
    loop: false,
    keyframes: [
      // Standing, arms loose.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.3, shoulderRX: -0.3, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.4, elbowR: 0.4, torsoX: 0.0, headX: 0.0,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: 0 },
      },
      // Arms windmill up as balance goes, torso starts arching back.
      {
        t: 0.4,
        joints: {
          shoulderLX: -2.2, shoulderRX: -2.0, shoulderLZ: 0.6, shoulderRZ: 0.6,
          elbowL: 0.3, elbowR: 0.4, torsoX: -0.5, headX: -0.3,
          hipLX: -0.4, hipRX: -0.2, kneeL: 0.3, kneeR: 0.2,
        },
        move: { forward: 0, up: 0 },
      },
      // Pitching over backwards, legs lifting.
      {
        t: 0.9,
        joints: {
          shoulderLX: -1.6, shoulderRX: -1.6, shoulderLZ: 0.9, shoulderRZ: 0.9,
          elbowL: 0.4, elbowR: 0.4, torsoX: -1.0, headX: 0.1,
          hipLX: -1.2, hipRX: -1.2, kneeL: 0.6, kneeR: 0.6,
        },
        move: { forward: 0, up: -0.4 },
      },
      // Hitting the ground on the back, legs extending out.
      {
        t: 1.3,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, shoulderLZ: 0.9, shoulderRZ: 0.9,
          elbowL: 0.2, elbowR: 0.2, torsoX: -1.4, headX: 0.2,
          hipLX: -0.9, hipRX: -0.9, kneeL: 0.2, kneeR: 0.2,
        },
        move: { forward: 0, up: -0.85 },
      },
      // Flat on the back, legs extended — the app holds this final pose.
      {
        t: 1.8,
        joints: {
          shoulderLX: -0.5, shoulderRX: -0.5, shoulderLZ: 0.8, shoulderRZ: 0.8,
          elbowL: 0.2, elbowR: 0.2, torsoX: -1.5, headX: 0.2,
          hipLX: -0.6, hipRX: -0.6, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: -0.9 },
      },
    ],
  },
  {
    id: 'freefall-flail',
    name: 'Freefall Flail',
    category: 'stunt',
    duration: 1.2,
    loop: true,
    keyframes: [
      // Arms and legs wide, one arm high, torso arched — mid-air spread.
      {
        t: 0.0,
        joints: {
          shoulderLX: -2.2, shoulderRX: -0.6, shoulderLZ: 0.9, shoulderRZ: 0.9,
          elbowL: 0.5, elbowR: 0.8, torsoX: -0.3, torsoY: 0.2,
          hipLX: -0.6, hipRX: -0.9, kneeL: 0.5, kneeR: 0.2,
        },
      },
      // Flail cycle — arms swap, legs cross-bicycle.
      {
        t: 0.3,
        joints: {
          shoulderLX: -0.8, shoulderRX: -1.8, shoulderLZ: 1.0, shoulderRZ: 0.8,
          elbowL: 0.9, elbowR: 0.4, torsoX: -0.2, torsoY: -0.2,
          hipLX: -0.9, hipRX: -0.5, kneeL: 0.2, kneeR: 0.6,
        },
      },
      // Spread the other way.
      {
        t: 0.6,
        joints: {
          shoulderLX: -1.9, shoulderRX: -0.9, shoulderLZ: 0.8, shoulderRZ: 1.0,
          elbowL: 0.4, elbowR: 0.9, torsoX: -0.35, torsoY: 0.25,
          hipLX: -0.5, hipRX: -0.8, kneeL: 0.6, kneeR: 0.3,
        },
      },
      // Flail cycle again.
      {
        t: 0.9,
        joints: {
          shoulderLX: -0.7, shoulderRX: -2.0, shoulderLZ: 1.0, shoulderRZ: 0.85,
          elbowL: 0.8, elbowR: 0.5, torsoX: -0.2, torsoY: -0.25,
          hipLX: -0.8, hipRX: -0.5, kneeL: 0.25, kneeR: 0.55,
        },
      },
      // Loop back to the first spread.
      {
        t: 1.2,
        joints: {
          shoulderLX: -2.2, shoulderRX: -0.6, shoulderLZ: 0.9, shoulderRZ: 0.9,
          elbowL: 0.5, elbowR: 0.8, torsoX: -0.3, torsoY: 0.2,
          hipLX: -0.6, hipRX: -0.9, kneeL: 0.5, kneeR: 0.2,
        },
      },
    ],
  },
  {
    id: 'crawl',
    name: 'Crawl',
    category: 'stunt',
    duration: 4.0,
    loop: false,
    keyframes: [
      // Prone, right arm reaching forward, left leg pushing.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -1.6, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 1.2, elbowR: 0.4, torsoX: 1.4, headX: -0.2,
          hipLX: -0.9, hipRX: 0.3, kneeL: 1.3, kneeR: 0.3,
        },
        move: { forward: 0, up: -0.85 },
      },
      // Pull through — right arm drives back, torso slides forward.
      {
        t: 1.0,
        joints: {
          shoulderLX: -1.6, shoulderRX: -0.6, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 0.4, elbowR: 1.2, torsoX: 1.4, headX: -0.15,
          hipLX: 0.3, hipRX: -0.9, kneeL: 0.3, kneeR: 1.3,
        },
        move: { forward: 0.6, up: -0.85 },
      },
      // Left arm reaches forward, right leg pushes.
      {
        t: 2.0,
        joints: {
          shoulderLX: -1.6, shoulderRX: -0.6, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 0.4, elbowR: 1.2, torsoX: 1.4, headX: -0.2,
          hipLX: 0.3, hipRX: -0.9, kneeL: 0.3, kneeR: 1.3,
        },
        move: { forward: 1.1, up: -0.85 },
      },
      // Pull through the other side.
      {
        t: 3.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -1.6, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 1.2, elbowR: 0.4, torsoX: 1.4, headX: -0.15,
          hipLX: -0.9, hipRX: 0.3, kneeL: 1.3, kneeR: 0.3,
        },
        move: { forward: 1.7, up: -0.85 },
      },
      // Final reach — arrived, still prone.
      {
        t: 4.0,
        joints: {
          shoulderLX: -0.6, shoulderRX: -1.6, shoulderLZ: 0.7, shoulderRZ: 0.7,
          elbowL: 1.2, elbowR: 0.4, torsoX: 1.4, headX: -0.2,
          hipLX: -0.9, hipRX: 0.3, kneeL: 1.3, kneeR: 0.3,
        },
        move: { forward: 2.2, up: -0.85 },
      },
    ],
  },
  {
    id: 'jump',
    name: 'Jump',
    category: 'stunt',
    duration: 1.4,
    loop: false,
    keyframes: [
      // Standing ready.
      {
        t: 0.0,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.3, elbowR: 0.3, torsoX: 0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: 0 },
      },
      // Crouch — knees bend, arms swing back to load.
      {
        t: 0.35,
        joints: {
          shoulderLX: 0.4, shoulderRX: 0.4, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.5, elbowR: 0.5, torsoX: 0.35,
          hipLX: 0.6, hipRX: 0.6, kneeL: 1.2, kneeR: 1.2,
        },
        move: { forward: 0, up: -0.1 },
      },
      // Explode up — legs extend, arms swing up, airborne peak.
      {
        t: 0.75,
        joints: {
          shoulderLX: -2.4, shoulderRX: -2.4, shoulderLZ: 0.2, shoulderRZ: 0.2,
          elbowL: 0.1, elbowR: 0.1, torsoX: -0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.0, kneeR: 0.0,
        },
        move: { forward: 0, up: 0.7 },
      },
      // Land into a crouch to absorb.
      {
        t: 1.05,
        joints: {
          shoulderLX: -0.6, shoulderRX: -0.6, shoulderLZ: 0.3, shoulderRZ: 0.3,
          elbowL: 0.5, elbowR: 0.5, torsoX: 0.3,
          hipLX: 0.5, hipRX: 0.5, kneeL: 1.0, kneeR: 1.0,
        },
        move: { forward: 0, up: -0.1 },
      },
      // Recover to standing.
      {
        t: 1.4,
        joints: {
          shoulderLX: -0.2, shoulderRX: -0.2, shoulderLZ: 0.1, shoulderRZ: 0.1,
          elbowL: 0.3, elbowR: 0.3, torsoX: 0.05,
          hipLX: 0.0, hipRX: 0.0, kneeL: 0.1, kneeR: 0.1,
        },
        move: { forward: 0, up: 0 },
      },
    ],
  },
]
