/**
 * Phase D-15 / U6 — soft install prompt when beforeinstallprompt is available.
 * Fallback tips for iOS / browsers without BIP. Link to offline pack.
 * Dismissable; never blocks product chrome. Educational PWA shell only.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

const DISMISS_KEY = 'visionsetil_pwa_install_dismissed'
const DISMISS_IOS_KEY = 'visionsetil_pwa_ios_tip_dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  const mq = window.matchMedia?.('(display-mode: standalone)')?.matches
  // iOS Safari
  const iosStandalone = Boolean(
    (navigator as Navigator & { standalone?: boolean }).standalone,
  )
  return Boolean(mq || iosStandalone)
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const webkit = /WebKit/.test(ua)
  const notChrome = !/CriOS|FxiOS|EdgiOS/.test(ua)
  return iOS && webkit && notChrome
}

export function PwaInstallHint() {
  const { t } = useTranslation()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [iosTip, setIosTip] = useState(false)

  useEffect(() => {
    if (isStandaloneDisplay()) return

    // DISMISS_KEY suppresses all install chrome (BIP + iOS tip).
    // DISMISS_IOS_KEY only suppresses the iOS-specific tip.
    let installChromeDismissed = false
    try {
      installChromeDismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      try {
        if (localStorage.getItem(DISMISS_KEY) === '1') return
      } catch {
        /* ignore */
      }
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
      setIosTip(false)
    }

    window.addEventListener('beforeinstallprompt', onBip)

    // iOS has no beforeinstallprompt — soft tip after short delay (only if install chrome not dismissed)
    let iosTimer: number | undefined
    try {
      if (
        !installChromeDismissed &&
        isIosSafari() &&
        localStorage.getItem(DISMISS_IOS_KEY) !== '1'
      ) {
        iosTimer = window.setTimeout(() => {
          if (!deferred) setIosTip(true)
        }, 1800)
      }
    } catch {
      /* ignore */
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      if (iosTimer) window.clearTimeout(iosTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = (ios = false) => {
    try {
      localStorage.setItem(ios ? DISMISS_IOS_KEY : DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
    setIosTip(false)
    setDeferred(null)
  }

  const install = async () => {
    if (!deferred) return
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      /* user cancelled or unsupported */
    } finally {
      setDeferred(null)
      setVisible(false)
    }
  }

  if (isStandaloneDisplay()) return null

  if (visible && deferred) {
    return (
      <div
        className="pwa-install-hint"
        role="region"
        aria-label={t('pwa.region', { defaultValue: 'Instalar app' })}
        data-testid="pwa-install-hint"
      >
        <p className="pwa-install-hint__text">
          {t('pwa.hint', {
            defaultValue:
              'Instala VisionSetil para acceso rápido y packs offline de estudio (no identifica sin red).',
          })}
        </p>
        <div className="pwa-install-hint__actions">
          <button
            type="button"
            className="btn-atelier btn-atelier--primary"
            onClick={() => void install()}
            data-testid="pwa-install-btn"
          >
            {t('pwa.install', { defaultValue: 'Instalar' })}
          </button>
          <Link to="/offline" className="btn-atelier btn-atelier--ghost">
            {t('pwa.offlinePack', { defaultValue: 'Pack offline' })}
          </Link>
          <button type="button" className="btn-atelier btn-atelier--ghost" onClick={() => dismiss(false)}>
            {t('pwa.later', { defaultValue: 'Ahora no' })}
          </button>
        </div>
      </div>
    )
  }

  if (iosTip) {
    return (
      <div
        className="pwa-install-hint pwa-install-hint--ios"
        role="region"
        aria-label={t('pwa.region', { defaultValue: 'Instalar app' })}
        data-testid="pwa-install-ios-tip"
      >
        <p className="pwa-install-hint__text">
          {t('pwa.iosHint', {
            defaultValue:
              'En iPhone/iPad: toca Compartir → «Añadir a pantalla de inicio». Luego descarga el pack offline para estudiar sin red.',
          })}
        </p>
        <div className="pwa-install-hint__actions">
          <Link to="/offline" className="btn-atelier btn-atelier--primary">
            {t('pwa.offlinePack', { defaultValue: 'Pack offline' })}
          </Link>
          <button type="button" className="btn-atelier btn-atelier--ghost" onClick={() => dismiss(true)}>
            {t('pwa.later', { defaultValue: 'Ahora no' })}
          </button>
        </div>
      </div>
    )
  }

  return null
}
