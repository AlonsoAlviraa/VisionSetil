/**
 * Honesty UI for Identify results (B-08 / Phase B + B-30 a11y).
 * - ResultModeBanner: mode banner (real | mock | blocked) via honesty.* i18n
 *   + aria-live + focusable for screen-reader / keyboard handoff
 * - EducationalBlockedShell: CTAs when gate blocks species ID
 */
import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult, QualityGateReasonCode } from '../api/types'
import {
  resolveDisplayMode,
  shouldShowEducationalShell,
  type ClassifyMode,
} from '../lib/classifyMode'
import { IconAlert, IconExpert, IconInfo, IconSearch } from './icons'

/** Stable id for aria-labelledby from ResultCard / Identify region. */
export const RESULT_MODE_BANNER_TITLE_ID = 'result-mode-banner-title'

const KNOWN_GATE_CODES: readonly QualityGateReasonCode[] = [
  'no_metrics',
  'map_below',
  'deadly_below',
  'gates_passed',
  'gate_disabled',
]

function gateReasonI18nKey(
  code: string | undefined,
): string | null {
  if (!code) return null
  if ((KNOWN_GATE_CODES as readonly string[]).includes(code)) {
    return `honesty.gate.${code}`
  }
  return null
}

type BannerProps = {
  result: ClassificationResult
  className?: string
}

/**
 * Mode honesty banner. Focusable (tabIndex=-1) so Identify can move focus here
 * when a result arrives; live region announces mode to assistive tech.
 */
export const ResultModeBanner = forwardRef<HTMLDivElement, BannerProps>(
  function ResultModeBanner({ result, className = '' }, ref) {
    const { t } = useTranslation()
    // Display mode fail-closes on species_id_allowed === false (banner ≡ shell)
    const mode: ClassifyMode = resolveDisplayMode(result)
    const gate = result.quality_gate
    const reasonKey = gateReasonI18nKey(gate?.reason_code)
    const showMetricsWarning =
      mode === 'real' && gate != null && gate.metrics_acceptable === false

    // Blocked is safety-critical honesty → assertive; real/mock stay polite.
    const live: 'polite' | 'assertive' =
      mode === 'blocked' ? 'assertive' : 'polite'

    return (
      <div
        ref={ref}
        className={`result-mode-banner result-mode-banner--${mode} ${className}`.trim()}
        role="status"
        aria-live={live}
        aria-atomic="true"
        tabIndex={-1}
        data-testid="result-mode-banner"
        data-mode={mode}
      >
        <div className="result-mode-banner__row">
          {mode === 'blocked' ? (
            <IconAlert size={18} aria-hidden />
          ) : mode === 'mock' ? (
            <IconInfo size={18} aria-hidden />
          ) : (
            <IconInfo size={18} aria-hidden />
          )}
          <strong
            id={RESULT_MODE_BANNER_TITLE_ID}
            className="result-mode-banner__title"
            data-testid="result-mode-banner-title"
          >
            {t(`honesty.mode.${mode}`)}
          </strong>
          <span
            className={`result-mode-banner__chip result-mode-banner__chip--${mode}`}
            data-testid="result-mode-chip"
          >
            {mode}
          </span>
        </div>
        {reasonKey && (mode === 'blocked' || mode === 'mock' || showMetricsWarning) && (
          <p
            className="result-mode-banner__gate"
            data-testid="result-mode-banner-gate"
          >
            {t(reasonKey)}
            {gate?.test_map_at_3 != null
              ? ` · MAP@3=${gate.test_map_at_3.toFixed(3)}`
              : ''}
          </p>
        )}
        {showMetricsWarning && (
          <p
            className="result-mode-banner__warning"
            data-testid="result-mode-metrics-warning"
          >
            {t('honesty.preflight.metrics_warning')}
          </p>
        )}
      </div>
    )
  },
)

type ShellProps = {
  result: ClassificationResult
  className?: string
}

/** Educational shell when species ID is blocked by quality gate. */
export function EducationalBlockedShell({
  result,
  className = '',
}: ShellProps) {
  const { t } = useTranslation()
  if (!shouldShowEducationalShell(result)) return null

  const reasonKey = gateReasonI18nKey(result.quality_gate?.reason_code)

  return (
    <section
      className={`educational-blocked-shell ${className}`.trim()}
      aria-label={t('honesty.educational_blocked_title')}
      data-testid="educational-blocked-shell"
    >
      <header className="educational-blocked-shell__head">
        <IconAlert size={22} aria-hidden />
        <h3 data-testid="educational-blocked-title">
          {t('honesty.educational_blocked_title')}
        </h3>
      </header>
      <p
        className="educational-blocked-shell__body"
        data-testid="educational-blocked-body"
      >
        {t('honesty.educational_blocked_body')}
      </p>
      {reasonKey && (
        <p
          className="educational-blocked-shell__reason"
          data-testid="educational-blocked-reason"
        >
          {t('honesty.decision.rejected_gate')}
          {' — '}
          {t(reasonKey)}
        </p>
      )}
      <div
        className="educational-blocked-shell__ctas"
        data-testid="educational-blocked-ctas"
      >
        <Link
          to="/enciclopedia"
          className="btn-atelier btn-atelier--primary"
          data-testid="cta-encyclopedia"
        >
          <IconSearch size={16} aria-hidden />
          {t('honesty.cta.encyclopedia')}
        </Link>
        <Link
          to="/educacion"
          className="btn-atelier btn-atelier--ghost"
          data-testid="cta-education"
        >
          {t('honesty.cta.education')}
        </Link>
        <Link
          to="/revision-experta"
          className="btn-atelier btn-atelier--ghost"
          data-testid="cta-expert"
        >
          <IconExpert size={16} aria-hidden />
          {t('honesty.cta.expert')}
        </Link>
      </div>
    </section>
  )
}
