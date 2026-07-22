/**
 * ML transparency panel — honest mock/real stack, margin, views.
 * Confidence margin only when D-B9 gate passes (real + metrics_acceptable).
 */
import { useTranslation } from 'react-i18next'
import type { ClassificationResult } from '../api/types'
import {
  isOpenSetRejected,
  resolveDisplayMode,
  shouldShowConfidence,
  shouldShowEducationalShell,
} from '../lib/classifyMode'
import { stackBadgeEs } from '../lib/modelStackLabel'
import { IconMicroscope, IconInfo, IconAlert } from './icons'

type Props = {
  result: ClassificationResult
  viewTypes?: string[]
  className?: string
}

export function ModelInsightsPanel({ result, viewTypes = [], className = '' }: Props) {
  const { t } = useTranslation()
  const mode = resolveDisplayMode(result)
  const showConfidence = shouldShowConfidence(result)
  const gateOrShell =
    shouldShowEducationalShell(result) || mode === 'blocked'
  const openSet = isOpenSetRejected(result)
  const badge = stackBadgeEs(result.model_stack)
  const isMock =
    result.is_mock_stack !== false &&
    (result.is_mock_stack === true ||
      badge.mode === 'demo' ||
      badge.mode === 'mixed' ||
      badge.mode === 'unknown')

  const preds = result.predictions || []
  const margin =
    showConfidence
      ? result.confidence_margin ??
        (preds.length >= 2
          ? Math.max(0, preds[0].confidence - preds[1].confidence)
          : preds[0]?.confidence ?? null)
      : null

  const coverage =
    result.view_coverage && result.view_coverage.length > 0
      ? result.view_coverage
      : viewTypes.filter(Boolean)

  const notes = result.ml_notes?.length
    ? result.ml_notes
    : [
        gateOrShell
          ? t('honesty.decision.rejected_gate')
          : isMock || mode === 'mock'
            ? 'Modo demo: sin pesos reales de campo en este entorno.'
            : 'Backends reales reportados en el stack.',
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

  return (
    <section
      className={`model-insights model-insights--mode-${mode} ${
        mode === 'blocked'
          ? 'model-insights--blocked'
          : isMock || mode === 'mock'
            ? 'model-insights--mock'
            : 'model-insights--live'
      } ${className}`.trim()}
      aria-label="Información del modelo"
      data-testid="model-insights-panel"
      data-mode={mode}
      data-show-confidence={showConfidence ? 'true' : 'false'}
    >
      <header className="model-insights__head">
        <IconMicroscope size={18} />
        <h3>Cómo decide el modelo</h3>
        <span className={`stack-badge stack-badge--${badge.mode}`}>{badge.label}</span>
        <span
          className={`result-mode-banner__chip result-mode-banner__chip--${mode}`}
          data-testid="model-insights-mode"
        >
          {mode}
        </span>
      </header>

      <p className="model-insights__hint">{badge.hint}</p>

      <div className="model-insights__grid">
        <div className="model-insights__card">
          <span className="model-insights__label">Tiempo</span>
          <strong>{result.processing_time_ms} ms</strong>
        </div>
        <div className="model-insights__card" data-testid="model-insights-margin">
          <span className="model-insights__label">Margen top-1/2</span>
          <strong>
            {showConfidence && margin != null
              ? `${(margin * 100).toFixed(1)} pts`
              : '—'}
          </strong>
        </div>
        <div className="model-insights__card">
          <span className="model-insights__label">Decisión</span>
          <strong data-testid="model-insights-decision">
            {decisionLabel}
          </strong>
        </div>
        <div className="model-insights__card">
          <span className="model-insights__label">Vistas</span>
          <strong>{coverage.length || viewTypes.length || 0}</strong>
        </div>
      </div>

      {coverage.length > 0 && (
        <p className="model-insights__views">
          <IconInfo size={14} /> Cobertura: {coverage.join(' · ')}
        </p>
      )}

      <ul className="model-insights__notes">
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
