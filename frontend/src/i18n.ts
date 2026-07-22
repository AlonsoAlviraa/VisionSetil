/** react-i18next setup — ES / CA / EU / EN (PR-06). */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import es from './locales/es/common.json'
import ca from './locales/ca/common.json'
import eu from './locales/eu/common.json'
import en from './locales/en/common.json'

export const SUPPORTED_LOCALES = ['es', 'ca', 'eu', 'en'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_STORAGE_KEY = 'visionsetil_locale'

export function detectInitialLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && (SUPPORTED_LOCALES as readonly string[]).includes(stored)) {
      return stored as AppLocale
    }
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined') {
    const nav = (navigator.language || 'es').slice(0, 2).toLowerCase()
    if ((SUPPORTED_LOCALES as readonly string[]).includes(nav)) {
      return nav as AppLocale
    }
  }
  return 'es'
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { common: es },
    ca: { common: ca },
    eu: { common: eu },
    en: { common: en },
  },
  lng: typeof window !== 'undefined' ? detectInitialLocale() : 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  ns: ['common'],
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function setAppLocale(locale: AppLocale): void {
  void i18n.changeLanguage(locale)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

export default i18n
