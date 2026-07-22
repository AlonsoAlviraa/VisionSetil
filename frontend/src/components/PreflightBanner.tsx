/**
 * Identify preflight advisory banner (B-11 / Appendix D.1).
 * Never hard-blocks submit for gate — only offline disables (see canSubmitPreflight).
 */
import { useTranslation } from 'react-i18next'
import type { PreflightState } from '../lib/preflight'
import { IconAlert, IconInfo } from './icons'

const KNOWN_GATE_CODES = [
  'no_metrics',
  'map_below',
  'deadly_below',
  'gates_passed',
  'gate_disabled',
] as const

function gateReasonI18nKey(code: string | undefined): string | null {
  if (!code) return null
  if ((KNOWN_GATE_CODES as readonly string[]).includes(code)) {
    return `honesty.gate.${code}`
  }
  return null
}

type Props = {
  state: PreflightState
  className?: string
}

/**
 * Advisory banner for blocked / mock / real / offline / metrics_warning / unknown.
 * Returns null while first load is in progress with no prior data.
 */
export function PreflightBanner({ state, className = '' }: Props) {
  const { t } = useTranslation()

  // Avoid flash of "unknown" on first paint before fetch settles.
  if (state.loading && state.fetched_at === 0) {
    return null
  }

  const mode = state.mode
  const reasonKey = gateReasonI18nKey(state.reason_code)
  const showMetricsWarning =
    state.metrics_warning && (mode === 'real' || mode === 'mock')

  const bodyKey =
    mode === 'offline'
      ? 'honesty.preflight.offline'
      : mode === 'blocked'
        ? 'honesty.preflight.blocked'
        : mode === 'mock'
          ? 'honesty.preflight.mock'
          : mode === 'real'
            ? 'honesty.preflight.real'
            : 'honesty.preflight.unknown'

  return (
    <div
      className={`preflight-banner preflight-banner--${mode} ${className}`.trim()}
      role="status"
      aria-live="polite"
      data-testid="preflight-banner"
      data-mode={mode}
      data-submit-enabled={state.submit_enabled ? 'true' : 'false'}
      data-metrics-warning={showMetricsWarning ? 'true' : 'false'}
    >
      <div className="preflight-banner__row">
        {mode === 'offline' || mode === 'blocked' ? (
          <IconAlert size={18} />
        ) : (
          <IconInfo size={18} />
        )}
        <strong
          className="preflight-banner__title"
          data-testid="preflight-banner-title"
        >
          {t(bodyKey)}
        </strong>
        <span
          className={`preflight-banner__chip preflight-banner__chip--${mode}`}
          data-testid="preflight-mode-chip"
        >
          {mode}
        </span>
      </div>

      {mode === 'offline' && (
        <p
          className="preflight-banner__detail"
          data-testid="preflight-submit-offline"
        >
          {t('honesty.preflight.submit_offline')}
        </p>
      )}

      {reasonKey &&
        (mode === 'blocked' || mode === 'mock' || showMetricsWarning) && (
          <p
            className="preflight-banner__gate"
            data-testid="preflight-banner-gate"
          >
            {t(reasonKey)}
            {state.map_at_3 != null
              ? ` · MAP@3=${Number(state.map_at_3).toFixed(3)}`
              : ''}
          </p>
        )}

      {showMetricsWarning && (
        <p
          className="preflight-banner__warning"
          data-testid="preflight-metrics-warning"
        >
          {t('honesty.preflight.metrics_warning')}
        </p>
      )}
    </div>
  )
}
