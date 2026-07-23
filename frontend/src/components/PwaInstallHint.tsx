/**
 * Phase D-15 — soft install prompt when beforeinstallprompt is available.
 * Dismissable; never blocks product chrome. Educational PWA shell only.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

const DISMISS_KEY = 'visionsetil_pwa_install_dismissed'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallHint() {
  const { t } = useTranslation()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBip)
    return () => window.removeEventListener('beforeinstallprompt', onBip)
  }, [])

  if (!visible || !deferred) return null

  const install = async () => {
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

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
    setDeferred(null)
  }

  return (
    <div className="pwa-install-hint" role="region" aria-label={t('pwa.region', { defaultValue: 'Instalar app' })}>
      <p className="pwa-install-hint__text">
        {t('pwa.hint', {
          defaultValue: 'Instala VisionSetil en tu dispositivo para acceso rápido y packs offline.',
        })}
      </p>
      <div className="pwa-install-hint__actions">
        <button type="button" className="btn-atelier btn-atelier--primary" onClick={() => void install()}>
          {t('pwa.install', { defaultValue: 'Instalar' })}
        </button>
        <button type="button" className="btn-atelier btn-atelier--ghost" onClick={dismiss}>
          {t('pwa.later', { defaultValue: 'Ahora no' })}
        </button>
      </div>
    </div>
  )
}
