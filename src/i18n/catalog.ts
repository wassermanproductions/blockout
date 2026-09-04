import { getLocale } from './core'
import { ACTION_DESCRIPTION_ZH, CAMERA_MOVE_DESCRIPTION_ZH, CATALOG_ZH } from './catalog-zh'

/** Display name for engine catalog items. English uses the engine fallback. */
export function catalogName(id: string, fallback: string): string {
  if (getLocale() !== 'zh') return fallback
  return CATALOG_ZH[id] ?? fallback
}

/** Longer explanatory copy for an action path. English uses the engine fallback. */
export function actionDescription(id: string, fallback: string): string {
  if (getLocale() !== 'zh') return fallback
  return ACTION_DESCRIPTION_ZH[id] ?? fallback
}

/** Longer explanatory copy for a camera move. English uses the engine fallback. */
export function cameraMoveDescription(id: string, fallback: string): string {
  if (getLocale() !== 'zh') return fallback
  return CAMERA_MOVE_DESCRIPTION_ZH[id] ?? fallback
}
