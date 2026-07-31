/** Shows a non-blocking banner when the FastAPI backend is unreachable. */
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui'

type Status = 'checking' | 'online' | 'offline'

export function ApiStatusBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('checking')
  const [pinging, setPinging] = useState(false)

  const ping = useCallback(async () => {
    setPinging(true)
    try {
      const ctrl = new AbortController()
      const timer = window.setTimeout(() => ctrl.abort(), 2500)
      const res = await fetch('/api/health', { signal: ctrl.signal })
      window.clearTimeout(timer)
      setStatus(res.ok ? 'online' : 'offline')
    } catch {
      setStatus('offline')
    } finally {
      setPinging(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function tick() {
      try {
        const ctrl = new AbortController()
        const timer = window.setTimeout(() => ctrl.abort(), 2500)
        const res = await fetch('/api/health', { signal: ctrl.signal })
        window.clearTimeout(timer)
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }
    void tick()
    // Poll every 12s so the banner clears quickly once the backend recovers.
    const id = window.setInterval(tick, 12_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (status !== 'offline') return null

  return (
    <div
      className="api-status-banner"
      role="alert"
      data-testid="api-offline-banner"
      aria-live="assertive"
    >
      <div className="api-status-banner__copy">
        <strong>{t('api.offlineTitle', { defaultValue: 'API desconectada' })}</strong>
        <span>
          {t('api.offlineBody', {
            defaultValue:
              'La enciclopedia funciona. Para identificar hace falta el backend en :8000.',
          })}
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => void ping()}
        disabled={pinging}
        data-testid="api-offline-retry"
      >
        {pinging
          ? t('api.retrying', { defaultValue: 'Comprobando…' })
          : t('api.retry', { defaultValue: 'Reintentar' })}
      </Button>
    </div>
  )
}
