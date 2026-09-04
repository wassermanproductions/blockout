import { isLocaleForced, setLocale, type Locale } from './core'
import { useLocale, useT } from './react'

export function LocaleSwitcher({ compact = false }: { compact?: boolean }): JSX.Element | null {
  const t = useT()
  const locale = useLocale()
  if (isLocaleForced()) return null

  const set = (next: Locale): void => {
    setLocale(next)
    void window.blockout.setLocale?.(next)
  }

  return (
    <div className={`lang-switch${compact ? ' compact' : ''}`} title={t('lang.switch')}>
      <button className={locale === 'zh' ? 'active' : ''} onClick={() => set('zh')}>
        中
      </button>
      <button className={locale === 'en' ? 'active' : ''} onClick={() => set('en')}>
        EN
      </button>
    </div>
  )
}
