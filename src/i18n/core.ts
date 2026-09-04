/**
 * Lightweight i18n (no extra deps). Nested message dictionaries, dotted keys,
 * `{name}` interpolation. Engine stays English (prompts, stored names).
 */

import { en } from './en'
import { zh } from './zh'

export type Locale = 'en' | 'zh'

/** Map a BCP 47 language tag to a supported UI locale. */
export function localeFromLanguage(language?: string): Locale {
  return language?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

type Nested = { readonly [k: string]: string | Nested }

type MessageKey<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? K : `${K}.${MessageKey<T[K]>}`
    }[keyof T & string]

export type TxKey = MessageKey<typeof en>

const DICTS: Record<Locale, Nested> = { en, zh }

const STORAGE_KEY = 'blockout.locale'

const listeners = new Set<(locale: Locale) => void>()

function detectForcedLocale(): Locale | null {
  if (typeof process !== 'undefined') {
    const env = process.env.BLOCKOUT_LOCALE
    if (env === 'en' || env === 'zh') return env
    if (process.env.BLOCKOUT_SMOKE_DIR) return 'en'
  }
  if (typeof window !== 'undefined') {
    const api = (window as unknown as { blockout?: { platform?: { forcedLocale?: string } } }).blockout
    const forced = api?.platform?.forcedLocale
    if (forced === 'en' || forced === 'zh') return forced
  }
  return null
}

function detectLocale(): Locale {
  const forced = detectForcedLocale()
  if (forced) return forced
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    /* private mode / main process */
  }
  if (typeof navigator !== 'undefined') return localeFromLanguage(navigator.language)
  return 'en'
}

let locale: Locale = detectLocale()

function lookup(messages: Nested, key: string): string | undefined {
  const parts = key.split('.')
  let cur: string | Nested | undefined = messages
  for (let i = 0; i < parts.length; i++) {
    if (cur === undefined || typeof cur === 'string') return undefined
    // Leaf keys may themselves contain dots (profileHint['veo-3.1']).
    const rest = parts.slice(i).join('.')
    const exact = cur[rest]
    if (typeof exact === 'string') return exact
    cur = cur[parts[i]!]
  }
  return typeof cur === 'string' ? cur : undefined
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  )
}

export function getLocale(): Locale {
  return locale
}

export function isLocaleForced(): boolean {
  return detectForcedLocale() !== null
}

export function t(key: TxKey, vars?: Record<string, string | number>): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(en, key) ?? key
  return interpolate(raw, vars)
}

/** Dynamic / optional keys (profile ids, catalog overlays). Missing → fallback. */
export function tOr(key: string, fallback: string, vars?: Record<string, string | number>): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(en, key)
  return interpolate(raw ?? fallback, vars)
}

export function setLocale(next: Locale): void {
  if (next === locale) return
  locale = next
  try {
    if (!isLocaleForced()) localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  }
  for (const fn of listeners) fn(next)
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function applyDocumentLang(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
  }
}
