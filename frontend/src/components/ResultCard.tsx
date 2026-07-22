/**
 * Result card — 3-layer hierarchy (Wave A) + Phase B honesty (B-08 / B-30):
 * 0) ResultModeBanner + educational blocked shell
 * 1) Safety + decision + top predictions (no FoodQualityChip — D-B16)
 * 2) Confidence (gated D-B9) + lookalikes
 * 3) Accordion: quality, evidence, questions, feedback, technical
 * B-30: focus mode banner when a new result arrives (a11y).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult, SpeciesPrediction } from '../api/types'
import {
  isOpenSetRejected,
  resolveDisplayMode,
  shouldShowConfidence,
  shouldShowEducationalShell,
} from '../lib/classifyMode'
import { getRiskMeta } from '../lib/riskLabels'
import { lookalikeSummary, rankLookalikes } from '../lib/lookalikeRisk'
import { SpeciesThumb } from './SpeciesThumb'
import { SpeciesNameBlock } from './SpeciesNameBlock'
import { RiskChip } from './RiskChip'
import {
  buildExpertHandoff,
  expertReviewPath,
  saveHandoffDraft,
} from '../lib/expertHandoff'
import {
  IconAlert,
  IconCheck,
  IconClose,
  IconExpert,
  IconInfo,
  IconMicroscope,
  IconThumbsDown,
  IconThumbsUp,
} from './icons'
import { stackBadgeEs } from '../lib/modelStackLabel'
import { ModelInsightsPanel } from './ModelInsightsPanel'
import {
  EducationalBlockedShell,
  RESULT_MODE_BANNER_TITLE_ID,
  ResultModeBanner,
} from './ResultModeBanner'

interface ResultCardProps {
  result: ClassificationResult
  onFeedback?: (isCorrect: boolean, species?: string) => void
  viewTypes?: string[]
  previews?: string[]
}

function getEdibilityMeta(edibility: string | null): { label: string; class: string } {
  const meta = getRiskMeta(edibility)
  return { label: meta.label, class: meta.className }
}

function getConfidenceInterpretation(confidence: number): {
  label: string
  level: 'low' | 'moderate' | 'high'
  description: string
} {
  if (confidence < 0.4) {
    return {
      label: 'Baja confianza',
      level: 'low',
      description: 'Pista floja. Mejor no te fíes solo de esto.',
    }
  }
  if (confidence < 0.7) {
    return {
      label: 'Confianza moderada',
      level: 'moderate',
      description: 'Hay una idea razonable, con margen de error.',
    }
  }
  return {
    label: 'Alta confianza',
    level: 'high',
    description: 'El modelo se atreve… y aun así conviene un humano.',
  }
}

const SAFETY_LEVEL_META: Record<string, { label: string; class: string }> = {
  safe: { label: 'Solo orientación', class: 'sl-caution' },
  unsafe_to_consume: { label: 'No apta para consumo', class: 'sl-danger' },
  caution: { label: 'Precaución', class: 'sl-caution' },
  warning: { label: 'Advertencia', class: 'sl-warning' },
  danger: { label: 'Peligro', class: 'sl-danger' },
  critical: { label: 'Crítico', class: 'sl-critical' },
}

export function ResultCard({ result, onFeedback, viewTypes = [], previews = [] }: ResultCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [layer2Open, setLayer2Open] = useState(true)
  const [layer3Open, setLayer3Open] = useState(false)
  const [handoffSaved, setHandoffSaved] = useState(false)
  const modeBannerRef = useRef<HTMLDivElement>(null)

  const mode = resolveDisplayMode(result)
  const showConfidence = shouldShowConfidence(result)
  const showBlockedShell = shouldShowEducationalShell(result)
  const openSetRejected = isOpenSetRejected(result)
  const isRejected = result.decision === 'rejected'
  const topPrediction = result.predictions[0]
  const topEdibility = getEdibilityMeta(topPrediction?.edibility ?? null)
  const isDangerous = [
    'risk-toxic',
    'risk-poisonous',
    'risk-deadly',
    'ed-toxic',
    'ed-deadly',
  ].includes(topEdibility.class)
  const isDeadly =
    topEdibility.class === 'risk-deadly' || topEdibility.class === 'ed-deadly'
  const stackBadge = stackBadgeEs(result.model_stack)

  const rankedLookalikes = useMemo(
    () => rankLookalikes(result.dangerous_lookalikes || []),
    [result.dangerous_lookalikes],
  )
  const lookalikeStats = useMemo(
    () => lookalikeSummary(result.dangerous_lookalikes || []),
    [result.dangerous_lookalikes],
  )

  const needsExpert = result.recommend_human_review || isRejected || isDangerous || showBlockedShell
  const hasLayer2 =
    (!showBlockedShell && !isRejected && !!topPrediction && showConfidence) ||
    rankedLookalikes.length > 0 ||
    (isDangerous && !showBlockedShell)
  const hasLayer3 = true /* always show ML insights accordion */

  // B-30: move keyboard/AT focus to the mode banner when a new result arrives
  useEffect(() => {
    const el = modeBannerRef.current
    if (!el) return
    // Defer one frame so layout/scroll from IdentifyPage can settle first
    const raf = requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(raf)
  }, [result.request_id])

  const handleFeedback = (correct: boolean) => {
    onFeedback?.(correct, topPrediction?.species)
    setFeedbackSent(true)
  }

  const handleExpertHandoff = () => {
    const draft = buildExpertHandoff({ result, viewTypes, previews })
    saveHandoffDraft(draft)
    setHandoffSaved(true)
    navigate(expertReviewPath(draft.id))
  }

  const sl = SAFETY_LEVEL_META[result.safety_level] ?? SAFETY_LEVEL_META.caution

  return (
    <div
      className={`result-card result-card--layered result-card--mode-${mode} ${isDeadly && !isRejected && !showBlockedShell ? 'result-card--deadly' : ''}`}
      role="region"
      aria-labelledby={RESULT_MODE_BANNER_TITLE_ID}
      data-testid="result-card"
      data-mode={mode}
      data-show-confidence={showConfidence ? 'true' : 'false'}
    >
      <ResultModeBanner ref={modeBannerRef} result={result} />

      {/* ── Layer 1: safety + decision + top predictions ── */}
      <section className="result-layer result-layer--1" aria-label="Resultado principal">
        <div className="result-meta-row">
          <span
            className={`stack-badge stack-badge--${stackBadge.mode}`}
            title={stackBadge.hint}
            data-testid="stack-badge"
          >
            {stackBadge.label}
          </span>
        </div>

        <div className="safety-disclaimer" role="alert">
          <strong>Solo orientación</strong>
          <p>
            Puede fallar. <strong>No comas por lo que diga la app</strong> — un micólogo manda.
          </p>
          <p className={`safety-disclaimer__level ${sl.class}`}>
            <IconAlert size={14} /> {sl.label}
          </p>
        </div>

        {showBlockedShell ? (
          <EducationalBlockedShell result={result} />
        ) : (
          <>
            <div
              className={`decision-banner ${isRejected ? 'rejected' : 'accepted'}`}
              data-testid="decision-banner"
              data-open-set={openSetRejected ? 'true' : 'false'}
            >
              {isRejected ? (
                <>
                  <strong className="decision-banner__title">
                    <IconAlert size={18} />
                    {openSetRejected
                      ? t('honesty.decision.rejected_open_set')
                      : t('honesty.decision.rejected_gate')}
                  </strong>
                  <p>
                    {result.rejection_reason ||
                      result.open_set_reason ||
                      (openSetRejected
                        ? t('honesty.decision.rejected_open_set')
                        : t('honesty.decision.rejected_gate'))}
                  </p>
                </>
              ) : (
                <>
                  <strong className="decision-banner__title">
                    <IconCheck size={18} />
                    Pista tentativa
                  </strong>
                  <p>
                    {showConfidence && topPrediction ? (
                      <>
                        {((topPrediction.confidence ?? 0) * 100).toFixed(1)}% de confianza del modelo
                        {result.predictions.length >= 2
                          ? ' · el modelo duda entre varias especies'
                          : ''}
                      </>
                    ) : (
                      t('honesty.confidence_hidden')
                    )}
                  </p>
                </>
              )}
            </div>

            {isDeadly && !isRejected && (
              <div className="danger-callout danger-callout--deadly" role="alert">
                <strong>
                  <IconAlert size={18} /> Posible confusión mortal
                </strong>
                <p>
                  {topEdibility.label}. Mantén distancia de niños y mascotas. No toques ni pruebes.
                  Confirma con un micólogo.
                </p>
              </div>
            )}

            {isDangerous && !isDeadly && !isRejected && (
              <div className="danger-callout danger-callout--compact" role="alert">
                <strong>
                  <IconAlert size={16} /> Posible riesgo alto
                </strong>
                <span> — {topEdibility.label}. Mantén distancia de niños y mascotas.</span>
              </div>
            )}

            {/* D-B16: FoodQualityChip banned on Identify — risk chips only */}

            {result.predictions.length > 0 && (
              <div className="predictions" data-testid="predictions-list">
                <h3>Mejores pistas</h3>
                <ul>
                  {result.predictions.slice(0, 3).map((pred: SpeciesPrediction, idx: number) => {
                    const meta = getEdibilityMeta(pred.edibility)
                    return (
                      <li
                        key={`${pred.species}-${idx}`}
                        className={`prediction-item ${meta.class} ${idx === 0 ? 'top-match' : ''}`}
                        data-testid={`prediction-item-${idx}`}
                      >
                        <SpeciesThumb
                          taxon={pred.species}
                          riskLabel={pred.edibility}
                          size={idx === 0 ? 56 : 44}
                          className="prediction-thumb"
                        />
                        <div className="prediction-info">
                          <span className="rank-badge">#{idx + 1}</span>
                          <SpeciesNameBlock
                            taxon={pred.species}
                            commonNames={pred.common_name}
                            size="sm"
                            showFamily
                          />
                          <RiskChip
                            risk={pred.edibility}
                            className={`edibility-badge ${meta.class}`}
                          />
                          {showConfidence ? (
                            <>
                              <div
                                className="confidence-bar"
                                data-testid="confidence-bar"
                              >
                                <div
                                  className="confidence-fill"
                                  style={{
                                    width: `${Math.min(pred.confidence * 100, 100)}%`,
                                  }}
                                />
                              </div>
                              <span
                                className="confidence-value"
                                data-testid="confidence-value"
                              >
                                {(pred.confidence * 100).toFixed(1)}%
                              </span>
                            </>
                          ) : (
                            <span
                              className="confidence-hidden muted"
                              data-testid="confidence-hidden"
                            >
                              {t('honesty.confidence_hidden')}
                            </span>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )}

        <div className="review-callout review-callout--compact">
          <div className="review-callout__actions">
            <button
              type="button"
              className="btn-atelier btn-atelier--primary"
              onClick={handleExpertHandoff}
              data-testid="cta-expert-handoff"
            >
              <IconExpert size={16} />
              {needsExpert ? 'Revisión experta' : 'Segunda opinión'}
            </button>
            <Link className="btn-atelier btn-atelier--ghost" to="/lookalikes">
              Lookalikes
            </Link>
            {showBlockedShell && (
              <Link
                className="btn-atelier btn-atelier--ghost"
                to="/enciclopedia"
                data-testid="cta-encyclopedia-inline"
              >
                Enciclopedia
              </Link>
            )}
          </div>
          {handoffSaved && (
            <p className="muted" role="status">
              Borrador guardado.
            </p>
          )}
        </div>
      </section>

      {/* ── Layer 2: confidence + lookalikes ── */}
      {hasLayer2 && (
        <section className="result-layer result-layer--2">
          <button
            type="button"
            className="result-layer__toggle"
            aria-expanded={layer2Open}
            onClick={() => setLayer2Open((v) => !v)}
          >
            <span>
              {showConfidence ? 'Confianza y confusiones' : 'Confusiones de riesgo'}
            </span>
            <span aria-hidden="true">{layer2Open ? '−' : '+'}</span>
          </button>
          {layer2Open && (
            <div className="result-layer__body">
              {showConfidence && !isRejected && topPrediction && (() => {
                const interp = getConfidenceInterpretation(topPrediction.confidence)
                return (
                  <div
                    className={`confidence-interpretation ci-${interp.level}`}
                    data-testid="confidence-interpretation"
                  >
                    <span className="ci-icon" aria-hidden="true">
                      {interp.level === 'high' ? (
                        <IconCheck size={16} />
                      ) : interp.level === 'moderate' ? (
                        <IconAlert size={16} />
                      ) : (
                        <IconClose size={16} />
                      )}
                    </span>
                    <div>
                      <strong>{interp.label}</strong>
                      <p>{interp.description}</p>
                    </div>
                  </div>
                )
              })()}

              {rankedLookalikes.length > 0 && (
                <div className="lookalikes-warning lookalikes-ranked" role="alert">
                  <strong className="lookalikes-warning__title">
                    <IconAlert size={16} />
                    Confusiones de riesgo ({lookalikeStats.total}
                    {lookalikeStats.deadly > 0 ? ` · ${lookalikeStats.deadly} mortales` : ''}
                    )
                  </strong>
                  <ul className="lookalike-list">
                    {rankedLookalikes.map((sp) => {
                      const meta = getRiskMeta(sp.risk_label)
                      return (
                        <li key={sp.name} className={`lookalike-item ${meta.className}`}>
                          <SpeciesThumb taxon={sp.name} riskLabel={sp.risk_label} size={40} />
                          <div className="lookalike-item__text">
                            <RiskChip risk={sp.risk_label} />
                            <SpeciesNameBlock
                              taxon={sp.name}
                              commonNames={sp.common_names}
                              size="sm"
                              showFamily={false}
                            />
                            {sp.slug && (
                              <Link to={`/enciclopedia/${sp.slug}`} className="lookalike-link">
                                Ver ficha
                              </Link>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Layer 3: details accordion ── */}
      {hasLayer3 && (
        <section className="result-layer result-layer--3">
          <button
            type="button"
            className="result-layer__toggle"
            aria-expanded={layer3Open}
            onClick={() => setLayer3Open((v) => !v)}
          >
            <span>Más detalle</span>
            <span aria-hidden="true">{layer3Open ? '−' : '+'}</span>
          </button>
          {layer3Open && (
            <div className="result-layer__body">
              {result.quality_warnings.length > 0 && (
                <div className="quality-warnings">
                  <strong className="inline-icon-label">
                    <IconInfo size={16} />
                    Calidad de imagen
                  </strong>
                  <ul>
                    {result.quality_warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.missing_evidence.length > 0 && (
                <div className="missing-evidence">
                  <strong className="inline-icon-label">
                    <IconMicroscope size={16} />
                    Para mejorar
                  </strong>
                  <ul>
                    {result.missing_evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {result.questions_for_user.length > 0 && (
                <div className="questions-section">
                  <strong className="inline-icon-label">
                    <IconInfo size={16} />
                    Preguntas
                  </strong>
                  <ul>
                    {result.questions_for_user.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {onFeedback && !feedbackSent && !isRejected && !showBlockedShell && (
                <div className="feedback-section">
                  <p className="feedback-question">¿La pista te encaja?</p>
                  <div className="feedback-buttons">
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost"
                      onClick={() => handleFeedback(true)}
                    >
                      <IconThumbsUp size={16} /> Sí
                    </button>
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost"
                      onClick={() => handleFeedback(false)}
                    >
                      <IconThumbsDown size={16} /> No
                    </button>
                  </div>
                </div>
              )}
              {feedbackSent && (
                <div className="feedback-sent">
                  <IconCheck size={16} /> Gracias — ayuda a mejorar el modelo.
                </div>
              )}

              <ModelInsightsPanel result={result} viewTypes={viewTypes} />

              {result.model_stack && (
                <div className="technical-details">
                  <p>
                    <strong>ID:</strong> {result.request_id} · {result.processing_time_ms} ms
                  </p>
                </div>
              )}

              {result.final_warning && (
                <p className="final-warning final-warning--quiet">{result.final_warning}</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
