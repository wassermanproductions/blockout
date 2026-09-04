import { useEffect, useMemo, useState } from 'react'
import { getLocale, subscribeLocale, t, type Locale } from './core'

/** Re-renders when the locale changes so `t()` reads stay current. */
export function useT(): typeof t {
  const locale = useLocale()
  // New function identity on locale change so `useMemo(..., [t])` callers recompute.
  return useMemo(() => {
    const bound: typeof t = (key, vars) => t(key, vars)
    return bound
  }, [locale])
}

export function useLocale(): Locale {
  const [locale, setLocaleState] = useState<Locale>(getLocale)
  useEffect(() => subscribeLocale(setLocaleState), [])
  return locale
}
