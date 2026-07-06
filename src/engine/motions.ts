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
]
