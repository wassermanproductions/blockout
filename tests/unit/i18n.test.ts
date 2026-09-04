import { describe, expect, it } from 'vitest'
import { ACTION_PRESETS } from '../../src/engine/action-presets'
import { ASSET_CATALOG } from '../../src/engine/assets'
import { CAMERA_MOVE_PRESETS } from '../../src/engine/camera-moves'
import { SENSORS } from '../../src/engine/camera'
import {
  choreoEndings,
  choreoFormations,
  choreoStyles,
  type ChoreoKind
} from '../../src/engine/choreography'
import { GAITS } from '../../src/engine/gaits'
import { MOTION_PRESETS } from '../../src/engine/motions'
import { RIGS } from '../../src/engine/rigs'
import { sequenceStyles, type SequenceType } from '../../src/engine/sequences'
import { actionDescription, cameraMoveDescription, catalogName } from '../../src/i18n/catalog'
import {
  ACTION_DESCRIPTION_ZH,
  CAMERA_MOVE_DESCRIPTION_ZH,
  CATALOG_ZH
} from '../../src/i18n/catalog-zh'
import { localeFromLanguage, setLocale, t, tOr } from '../../src/i18n/core'
import { en } from '../../src/i18n/en'
import { zh } from '../../src/i18n/zh'

function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return []
  const out: string[] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.push(key)
    else out.push(...keysOf(v, key))
  }
  return out
}

function stringsOf(obj: unknown, prefix = ''): [string, string][] {
  if (typeof obj !== 'object' || obj === null) return []
  const out: [string, string][] = []
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'string') out.push([key, v])
    else out.push(...stringsOf(v, key))
  }
  return out
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)]
    .map((match) => match[1]!)
    .filter((name) => name !== 'plural')
    .sort()
}

describe('i18n', () => {
  it('selects Chinese only for Chinese system language tags', () => {
    expect(localeFromLanguage('zh')).toBe('zh')
    expect(localeFromLanguage('zh-CN')).toBe('zh')
    expect(localeFromLanguage('zh-TW')).toBe('zh')
    expect(localeFromLanguage('en-US')).toBe('en')
    expect(localeFromLanguage('fr')).toBe('en')
    expect(localeFromLanguage(undefined)).toBe('en')
  })

  it('zh covers every English key', () => {
    expect(keysOf(zh).sort()).toEqual(keysOf(en).sort())
  })

  it('zh preserves every interpolation placeholder', () => {
    const zhByKey = new Map(stringsOf(zh))
    const mismatches = stringsOf(en)
      .filter(([key, value]) => placeholders(value).join('|') !== placeholders(zhByKey.get(key) ?? '').join('|'))
      .map(([key]) => key)
    expect(mismatches).toEqual([])
  })

  it('interpolates placeholders', () => {
    setLocale('en')
    expect(t('toast.exportFailed', { error: 'boom' })).toBe('Export failed: boom')
    setLocale('zh')
    expect(t('toast.exportFailed', { error: 'boom' })).toContain('boom')
    expect(t('toast.exportFailed', { error: 'boom' })).not.toBe(en.toast.exportFailed)
  })

  it('leaves unmatched {tokens} when vars are omitted', () => {
    setLocale('en')
    expect(t('inspector.animating')).toBe('Animating: {name}')
  })

  it('catalogName translates only in Chinese', () => {
    setLocale('en')
    expect(catalogName('gait:walk', 'walk')).toBe('walk')
    setLocale('zh')
    expect(catalogName('gait:walk', 'walk')).not.toBe('walk')
  })

  it('covers every built-in asset and preset display name', () => {
    const expectedKeys = [
      ...ASSET_CATALOG.map((item) => `asset:${item.id}`),
      ...MOTION_PRESETS.map((item) => `motion:${item.id}`),
      ...ACTION_PRESETS.map((item) => `action:${item.id}`),
      ...CAMERA_MOVE_PRESETS.map((item) => `move:${item.id}`)
    ]
    const missingOrBlank = expectedKeys.filter((key) => !CATALOG_ZH[key]?.trim())
    expect(missingOrBlank).toEqual([])
  })

  it('covers supporting engine catalogs used by the UI', () => {
    const required = [
      ...Object.keys(GAITS).map((id) => `gait:${id}`),
      ...Object.keys(SENSORS).map((id) => `sensor:${id}`),
      ...Object.keys(RIGS).flatMap((id) => [`rig:${id}`, `rig:${id}.desc`]),
      'seq:mixed',
      ...new Set(ACTION_PRESETS.map((preset) => `actionCat:${preset.category}`)),
      ...new Set(CAMERA_MOVE_PRESETS.map((preset) => `moveCat:${preset.category}`)),
      ...(['fight', 'footChase', 'carChase'] as SequenceType[]).flatMap((type) =>
        sequenceStyles(type).map((style) => `seq:${style.id}`)
      ),
      ...(['dance', 'fight', 'chase'] as ChoreoKind[]).flatMap((kind) =>
        choreoStyles(kind).map((style) => `choreo:${style.id}`)
      ),
      ...(['dance', 'fight', 'chase'] as ChoreoKind[]).flatMap((kind) =>
        choreoEndings(kind).map((ending) => `ending:${ending.id}`)
      ),
      ...choreoFormations().map((formation) => `formation:${formation.id}`)
    ]
    expect(required.filter((key) => !CATALOG_ZH[key]?.trim())).toEqual([])
  })

  it('covers every camera move description and switches it by locale', () => {
    const missingOrBlank = CAMERA_MOVE_PRESETS.filter(
      (move) => !CAMERA_MOVE_DESCRIPTION_ZH[move.id]?.trim()
    ).map((move) => move.id)
    expect(missingOrBlank).toEqual([])

    const move = CAMERA_MOVE_PRESETS[0]!
    setLocale('en')
    expect(cameraMoveDescription(move.id, move.description)).toBe(move.description)
    setLocale('zh')
    expect(cameraMoveDescription(move.id, move.description)).toBe(
      CAMERA_MOVE_DESCRIPTION_ZH[move.id]
    )
  })

  it('covers every action-path description and switches it by locale', () => {
    const missingOrBlank = ACTION_PRESETS.filter(
      (action) => !ACTION_DESCRIPTION_ZH[action.id]?.trim()
    ).map((action) => action.id)
    expect(missingOrBlank).toEqual([])

    const action = ACTION_PRESETS[0]!
    setLocale('en')
    expect(actionDescription(action.id, action.description)).toBe(action.description)
    setLocale('zh')
    expect(actionDescription(action.id, action.description)).toBe(ACTION_DESCRIPTION_ZH[action.id])
  })

  it('looks up leaf keys that contain dots', () => {
    setLocale('zh')
    expect(tOr('profileHint.veo-3.1', 'FALLBACK')).toBe(zh.profileHint['veo-3.1'])
    expect(tOr('profileHint.ltx-2.3', 'FALLBACK')).toBe(zh.profileHint['ltx-2.3'])
    expect(tOr('profileHint.wan-2.2', 'FALLBACK')).toBe(zh.profileHint['wan-2.2'])
    setLocale('en')
    expect(t('toast.exportFailed', { error: 'x' })).toBe('Export failed: x')
  })
})
