/**
 * ML transparency panel — fully mode/gate-aware (B-22).
 *
 * - Display chrome from resolveDisplayMode / dual-signal gate (not stack-string heuristics)
 * - Surfaces quality_gate metrics (MAP@3, deadly recall, dual signals, reason_code)
 * - Confidence margin only when D-B9 passes (real + metrics_acceptable) — never inflated
 */
import { useTranslation } from 'react-i18next'
import type { ClassificationResult, QualityGateReasonCode } from '../api/types'
import {
  isOpenSetRejected,
  resolveDisplayMode,
  shouldShowConfidence,
  shouldShowEducationalShell,
} from '../lib/classifyMode'
import { stackBadgeEs } from '../lib/modelStackLabel'
import { IconMicroscope, IconInfo, IconAlert } from './icons'

const KNOWN_GATE_CODES: readonly QualityGateReasonCode[] = [
  'no_metrics',
  'map_below',
  'deadly_below',
  'gates_passed',
  'gate_disabled',
]

function gateReasonI18nKey(code: string | undefined): string | null {
  if (!code) return null
  if ((KNOWN_GATE_CODES as readonly string[]).includes(code)) {
    return `honesty.gate.${code}`
  }
  return null
}

function fmtMetric(value: number | null | undefined, digits = 3): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(digits)
}

type Props = {
  result: ClassificationResult
  viewTypes?: string[]
  className?: string
}

export function ModelInsightsPanel({ result, viewTypes = [], className = '' }: Props) {
  const { t } = useTranslation()
  // Product honesty mode (D-B4 display): dual-signal overrides stack/legacy
  const mode = resolveDisplayMode(result)
  const showConfidence = shouldShowConfidence(result)
  const gateOrShell =
    shouldShowEducationalShell(result) || mode === 'blocked'
  const openSet = isOpenSetRejected(result)
  const gate = result.quality_gate
  const reasonKey = gateReasonI18nKey(gate?.reason_code)

  // Stack badge is technical detail only — panel chrome must NOT derive mode from it
  const badge = stackBadgeEs(result.model_stack)
  // Stack truth (D-B1): explicit field only; never infer from stack-string badge
  const isMockStack = result.is_mock_stack === true

  const preds = result.predictions || []
  // Inflated margin: hide unless D-B9 (never synthesize from preds when gate fails)
  const margin =
    showConfidence
      ? result.confidence_margin ??
        (preds.length >= 2
          ? Math.max(0, preds[0].confidence - preds[1].confidence)
          : null)
      : null

  const coverage =
    result.view_coverage && result.view_coverage.length > 0
      ? result.view_coverage
      : viewTypes.filter(Boolean)

  // Chrome tone follows product mode only (not stack-string heuristics)
  const modeTone =
    mode === 'blocked' ? 'blocked' : mode === 'mock' ? 'mock' : 'live'

  const notes = result.ml_notes?.length
    ? result.ml_notes
    : [
        gateOrShell
          ? t('honesty.decision.rejected_gate')
          : mode === 'mock'
            ? t('honesty.mode.mock')
            : t('honesty.mode.real'),
        showConfidence && margin != null
          ? `Margen entre pistas: ${(margin * 100).toFixed(1)} puntos.`
          : t('honesty.confidence_hidden'),
      ]

  // Rejected + not open-set → gate/shell copy (mirrors ResultCard)
  const decisionLabel =
    result.decision === 'rejected'
      ? openSet
        ? t('honesty.decision.rejected_open_set')
        : t('honesty.decision.rejected_gate')
      : 'Pista tentativa'

  const showMetricsWarning =
    mode === 'real' && gate != null && gate.metrics_acceptable === false

  return (
    <section
      className={`model-insights model-insights--mode-${mode} model-insights--${modeTone} ${className}`.trim()}
      aria-label="Información del modelo"
      data-testid="model-insights-panel"
      data-mode={mode}
      data-show-confidence={showConfidence ? 'true' : 'false'}
      data-mock-stack={isMockStack ? 'true' : 'false'}
    >
      <header className="model-insights__head">
        <IconMicroscope size={18} />
        <h3>Cómo decide el modelo</h3>
        <span
          className={`result-mode-banner__chip result-mode-banner__chip--${mode}`}
          data-testid="model-insights-mode"
        >
          {mode}
        </span>
        {/* Stack badge: technical weights label only (not product mode) */}
        {result.model_stack && (
          <span
            className={`stack-badge stack-badge--${badge.mode}`}
            title={badge.hint}
            data-testid="model-insights-stack-badge"
          >
            {badge.label}
          </span>
        )}
      </header>

      <p className="model-insights__hint" data-testid="model-insights-mode-hint">
        {t(`honesty.mode.${mode}`)}
      </p>

      <div className="model-insights__grid">
        <div className="model-insights__card">
          <span className="model-insights__label">Tiempo</span>
          <strong>{result.processing_time_ms} ms</strong>
        </div>
        {/* Margin only when D-B9 allows confidence — hide inflated top-1/2 gap */}
        {showConfidence && (
          <div className="model-insights__card" data-testid="model-insights-margin">
            <span className="model-insights__label">Margen top-1/2</span>
            <strong>
              {margin != null ? `${(margin * 100).toFixed(1)} pts` : '—'}
            </strong>
          </div>
        )}
        <div className="model-insights__card">
          <span className="model-insights__label">Decisión</span>
          <strong data-testid="model-insights-decision">{decisionLabel}</strong>
        </div>
        <div className="model-insights__card">
          <span className="model-insights__label">Vistas</span>
          <strong>{coverage.length || viewTypes.length || 0}</strong>
        </div>
      </div>

      {/* Dual-signal gate metrics (B-22) — independent of stack strings */}
      {gate && (
        <div
          className="model-insights__gate"
          data-testid="model-insights-gate"
          data-metrics-acceptable={gate.metrics_acceptable ? 'true' : 'false'}
          data-species-id-allowed={gate.species_id_allowed ? 'true' : 'false'}
          data-reason-code={gate.reason_code || ''}
          data-verdict={gate.verdict}
        >
          <h4 className="model-insights__gate-title">Quality gate</h4>
          <div className="model-insights__grid model-insights__grid--gate">
            <div className="model-insights__card">
              <span className="model-insights__label">MAP@3</span>
              <strong data-testid="model-insights-map">
                {fmtMetric(gate.test_map_at_3)}
                {gate.min_map_at_3 != null ? (
                  <span className="model-insights__thresh">
                    {' '}
                    / {fmtMetric(gate.min_map_at_3)}
                  </span>
                ) : null}
              </strong>
            </div>
            <div className="model-insights__card">
              <span className="model-insights__label">Deadly recall</span>
              <strong data-testid="model-insights-deadly">
                {fmtMetric(gate.safety_recall_deadly)}
                {gate.min_deadly_recall != null ? (
                  <span className="model-insights__thresh">
                    {' '}
                    / {fmtMetric(gate.min_deadly_recall)}
                  </span>
                ) : null}
              </strong>
            </div>
            <div className="model-insights__card">
              <span className="model-insights__label">Métricas OK</span>
              <strong data-testid="model-insights-metrics-ok">
                {gate.metrics_acceptable ? 'sí' : 'no'}
              </strong>
            </div>
            <div className="model-insights__card">
              <span className="model-insights__label">ID especie</span>
              <strong data-testid="model-insights-species-allowed">
                {gate.species_id_allowed ? 'permitida' : 'bloqueada'}
              </strong>
            </div>
            <div className="model-insights__card">
              <span className="model-insights__label">Veredicto</span>
              <strong data-testid="model-insights-verdict">{gate.verdict}</strong>
            </div>
            {gate.block_enabled != null && (
              <div className="model-insights__card">
                <span className="model-insights__label">Block</span>
                <strong>{gate.block_enabled ? 'on' : 'off'}</strong>
              </div>
            )}
          </div>
          {(reasonKey || gate.reason) && (
            <p
              className="model-insights__gate-reason"
              data-testid="model-insights-gate-reason"
            >
              {reasonKey ? t(reasonKey) : gate.reason}
              {gate.reason_code ? (
                <span className="model-insights__code"> · {gate.reason_code}</span>
              ) : null}
            </p>
          )}
          {showMetricsWarning && (
            <p
              className="model-insights__metrics-warning"
              data-testid="model-insights-metrics-warning"
              role="status"
            >
              <IconAlert size={14} /> {t('honesty.preflight.metrics_warning')}
            </p>
          )}
        </div>
      )}

      {coverage.length > 0 && (
        <p className="model-insights__views">
          <IconInfo size={14} /> Cobertura: {coverage.join(' · ')}
        </p>
      )}

      <ul className="model-insights__notes" data-testid="model-insights-notes">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>

      {result.model_stack && (
        <details className="model-insights__stack">
          <summary>Stack técnico</summary>
          <ul>
            <li>Detector: {result.model_stack.detector}</li>
            <li>Visual: {result.model_stack.visual_embedder}</li>
            <li>Texto-imagen: {result.model_stack.image_text_embedder}</li>
            <li>Metadatos: {result.model_stack.metadata_encoder}</li>
            {typeof result.is_mock_stack === 'boolean' && (
              <li data-testid="model-insights-is-mock-stack">
                is_mock_stack: {result.is_mock_stack ? 'true' : 'false'}
              </li>
            )}
          </ul>
        </details>
      )}

      {result.recommend_human_review && (
        <p className="model-insights__review" role="status">
          <IconAlert size={14} /> Se recomienda revisión humana.
        </p>
      )}
    </section>
  )
}
