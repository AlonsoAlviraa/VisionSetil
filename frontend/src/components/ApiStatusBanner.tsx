/** Shows a non-blocking banner when the FastAPI backend is unreachable. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Status = 'checking' | 'online' | 'offline'

export function ApiStatusBanner() {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let cancelled = false
    async function ping() {
      try {
        const ctrl = new AbortController()
        const timer = window.setTimeout(() => ctrl.abort(), 2000)
        const res = await fetch('/api/health', { signal: ctrl.signal })
        window.clearTimeout(timer)
        if (!cancelled) setStatus(res.ok ? 'online' : 'offline')
      } catch {
        if (!cancelled) setStatus('offline')
      }
    }
    void ping()
    const id = window.setInterval(ping, 30_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [])

  if (status !== 'offline') return null

  return (
    <div className="api-status-banner" role="status" data-testid="api-offline-banner">
      <strong>{t('api.offlineTitle', { defaultValue: 'API desconectada' })}</strong>
      <span>
        {t('api.offlineBody', {
          defaultValue:
            'Puedes explorar la enciclopedia y las fotos. La identificación necesita el backend en :8000.',
        })}
      </span>
    </div>
  )
}
