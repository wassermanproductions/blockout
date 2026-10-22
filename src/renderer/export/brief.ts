/**
 * The shot brief as prompt text — only on-screen subjects, where they are,
 * and each performer's facing/travel relative to this shot's camera.
 */

import { assetSpec } from '@engine/assets'
import type { ShotBrief } from '../viewport/SceneManager'

export function briefText(brief: ShotBrief): string {
  const lines = ['In this shot (nearest first) — describe and render ONLY these; add nothing else:']
  for (const v of brief.visible) lines.push(`- ${v.name} (${assetSpec(v.asset).name}): ${v.where}`)
  for (const a of brief.actors) {
    const facing = a.facingStart === a.facingEnd ? a.facingStart : `${a.facingStart} at first, ${a.facingEnd} at the end`
    lines.push(`${a.name}: ${facing}; ${a.travel}${a.endsNear ? `; ends next to ${a.endsNear}` : ''}.`)
  }
  return lines.join('\n')
}
