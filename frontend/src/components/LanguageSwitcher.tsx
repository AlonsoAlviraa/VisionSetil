/** Language switcher ES/CA/EU/EN (PR-06). */
import { useTranslation } from 'react-i18next'
import { setAppLocale, SUPPORTED_LOCALES, type AppLocale } from '../i18n'
import { featureFlags } from '../lib/featureFlags'

const LABELS: Record<AppLocale, string> = {
  es: 'ES',
  ca: 'CA',
  eu: 'EU',
  en: 'EN',
}

export function LanguageSwitcher() {
  const { i18n } = useTranslation()
  if (!featureFlags.I18N) return null

  const current = (i18n.language || 'es').slice(0, 2) as AppLocale

  return (
    <div className="lang-switcher" role="group" aria-label="Language" data-testid="language-switcher">
      {SUPPORTED_LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          className={`lang-switcher__btn ${current === loc ? 'lang-switcher__btn--active' : ''}`}
          aria-pressed={current === loc}
          onClick={() => setAppLocale(loc)}
        >
          {LABELS[loc]}
        </button>
      ))}
    </div>
  )
}
