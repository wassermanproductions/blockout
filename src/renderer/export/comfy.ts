/**
 * ComfyUI workflow export: a minimal, valid workflow JSON wired for
 * depth-conditioned video generation (Wan 2.2 / LTX-style pipelines).
 * Node/model names are placeholders the user maps to their installed
 * checkpoints — the wiring (load video → depth control → sampler → save)
 * is what matters and is documented in the notes node.
 */

import type { GeneratorProfile } from '@engine/profiles'
import type { Shot } from '@engine/types'
import { t } from '../../i18n/core'

export function buildComfyWorkflow(
  profile: GeneratorProfile,
  shot: Shot,
  depthVideoFilename: string,
  prompt: string
): string {
  const frames = Math.max(1, Math.round(shot.duration * shot.fps))
  const workflow = {
    _meta: {
      app: 'Blockout',
      note: t('comfy.note', { profile: profile.name, file: depthVideoFilename })
    },
    nodes: [
      {
        id: 1,
        type: 'VHS_LoadVideo',
        title: t('comfy.loadDepth'),
        inputs: { video: depthVideoFilename, force_rate: shot.fps, frame_load_cap: frames }
      },
      {
        id: 2,
        type: 'CLIPTextEncode',
        title: t('comfy.prompt'),
        inputs: { text: prompt }
      },
      {
        id: 3,
        type: 'CLIPTextEncode',
        title: t('comfy.negativePrompt'),
        inputs: { text: 'blurry, low quality, warped geometry, extra limbs' }
      },
      {
        id: 4,
        type: 'CheckpointLoaderSimple',
        title: t('comfy.checkpoint', { profile: profile.name }),
        inputs: { ckpt_name: 'REPLACE_ME.safetensors' }
      },
      {
        id: 5,
        type: 'ControlNetLoader',
        title: t('comfy.depthModel'),
        inputs: { control_net_name: 'REPLACE_ME_depth.safetensors' }
      },
      {
        id: 6,
        type: 'ControlNetApplyAdvanced',
        title: t('comfy.applyDepth'),
        inputs: {
          strength: 0.85,
          start_percent: 0,
          end_percent: 1,
          positive: ['2', 0],
          negative: ['3', 0],
          control_net: ['5', 0],
          image: ['1', 0]
        }
      },
      {
        id: 7,
        type: 'KSampler',
        title: t('comfy.sampler'),
        inputs: {
          seed: shot.camera.seed,
          steps: 30,
          cfg: 6,
          sampler_name: 'euler',
          scheduler: 'normal',
          denoise: 1,
          model: ['4', 0],
          positive: ['6', 0],
          negative: ['6', 1]
        }
      },
      {
        id: 8,
        type: 'VHS_VideoCombine',
        title: t('comfy.saveVideo'),
        inputs: { frame_rate: shot.fps, format: 'video/h264-mp4', images: ['7', 0] }
      }
    ]
  }
  return JSON.stringify(workflow, null, 2) + '\n'
}
