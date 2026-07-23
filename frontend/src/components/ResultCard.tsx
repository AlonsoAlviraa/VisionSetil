/**
 * Result card — 3-layer hierarchy (Wave A) + Phase B honesty (B-08):
 * 0) ResultModeBanner + educational blocked shell
 * 1) Safety + decision + top predictions (no FoodQualityChip — D-B16)
 * Policy: docs/SAFETY_POLICY.md Safety-by-surface (D16 / D-B16).
 * 2) Confidence (gated D-B9) + lookalikes (collapsed default — D-08)
 * 2.5) B-36: missing evidence + questions_for_user panel (deep-link wizard slots)
 * 3) Accordion: quality, feedback, technical
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult, SpeciesPrediction } from '../api/types'
import {
  isOpenSetRejected,
  resolveDisplayMode,
  shouldShowConfidence,
  shouldShowEducationalShell,
} from '../lib/classifyMode'
import { linkEvidenceItems } from '../lib/evidenceSlotMap'
import type { CanonicalView } from '../lib/multiViewSlots'
import { getRiskMeta, isSevereRisk, resolveJoinRisk } from '../lib/riskLabels'
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
  ResultModeBanner,
} from './ResultModeBanner'

interface ResultCardProps {
  result: ClassificationResult
  onFeedback?: (isCorrect: boolean, species?: string) => void
  viewTypes?: string[]
  previews?: string[]
  /** B-36: deep-link a missing photo cue to the multi-view wizard slot. */
  onFocusWizardSlot?: (view: CanonicalView) => void
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

export function ResultCard({
  result,
  onFeedback,
  viewTypes = [],
  previews = [],
  onFocusWizardSlot,
}: ResultCardProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [layer2Open, setLayer2Open] = useState(false)
  const [layer3Open, setLayer3Open] = useState(false)
  const [showMorePredictions, setShowMorePredictions] = useState(false)
  const [handoffSaved, setHandoffSaved] = useState(false)

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

  const evidenceItems = useMemo(
    () => linkEvidenceItems(result.missing_evidence || []),
    [result.missing_evidence],
  )
  const questionItems = useMemo(
    () => linkEvidenceItems(result.questions_for_user || []),
    [result.questions_for_user],
  )
  const hasEvidencePanel = evidenceItems.length > 0 || questionItems.length > 0

  const needsExpert = result.recommend_human_review || isRejected || isDangerous || showBlockedShell
  const hasLayer2 =
    (!showBlockedShell && !isRejected && !!topPrediction && showConfidence) ||
    rankedLookalikes.length > 0 ||
    (isDangerous && !showBlockedShell)
  const hasLayer3 = true /* always show ML insights accordion */

  // D-08 density + safety: auto-open lookalikes when deadly/high-risk confusions exist
  useEffect(() => {
    if (lookalikeStats.deadly > 0 || lookalikeStats.high > 0) {
      setLayer2Open(true)
    } else {
      setLayer2Open(false)
    }
    setShowMorePredictions(false)
    setLayer3Open(false)
  }, [result.request_id, lookalikeStats.deadly, lookalikeStats.high])

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
      className={`result-card result-card--layered result-card--scan result-card--mode-${mode} ${isDeadly && !isRejected && !showBlockedShell ? 'result-card--deadly' : ''}`}
      data-testid="result-card"
      data-mode={mode}
      data-show-confidence={showConfidence ? 'true' : 'false'}
    >
      <ResultModeBanner result={result} />

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
                <h3 className="result-predictions-title">{t('result.topHints', { defaultValue: 'Mejores pistas' })}</h3>
                <ul>
                  {result.predictions.slice(0, showMorePredictions ? 3 : 1).map((pred: SpeciesPrediction, idx: number) => {
                    // B-42: join model edibility with catalog risk_level; boost severe on real mode
                    const joinRisk = resolveJoinRisk(pred.edibility, pred.risk_level)
                    const boostJoinRisk = mode === 'real' && isSevereRisk(joinRisk)
                    const meta = getEdibilityMeta(joinRisk)
                    return (
                      <li
                        key={`${pred.species}-${idx}`}
                        className={`prediction-item ${meta.class} ${idx === 0 ? 'top-match' : ''} ${boostJoinRisk ? 'prediction-item--join-severe' : ''}`}
                        data-testid={`prediction-item-${idx}`}
                      >
                        <SpeciesThumb
                          taxon={pred.species}
                          riskLabel={joinRisk}
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
                            risk={joinRisk}
                            boost={boostJoinRisk}
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
                {result.predictions.length > 1 && (
                  <button
                    type="button"
                    className="result-more-toggle btn-atelier btn-atelier--ghost"
                    data-testid="predictions-more-toggle"
                    aria-expanded={showMorePredictions}
                    onClick={() => setShowMorePredictions((v) => !v)}
                  >
                    {showMorePredictions
                      ? t('result.showLessPredictions', { defaultValue: 'Menos pistas' })
                      : t('result.showMorePredictions', {
                          defaultValue: 'Más pistas ({{count}})',
                          count: Math.min(result.predictions.length, 3) - 1,
                        })}
                  </button>
                )}
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
              {lookalikeStats.deadly > 0
                ? ` · ${lookalikeStats.deadly} mortal${lookalikeStats.deadly === 1 ? '' : 'es'}`
                : lookalikeStats.high > 0
                  ? ` · ${lookalikeStats.high} alto riesgo`
                  : ''}
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

      {/* ── B-36: Missing evidence + questions panel (promoted, always open) ── */}
      {hasEvidencePanel && (
        <section
          className="result-layer result-layer--evidence result-evidence-panel"
          aria-label={t('result.evidencePanelTitle')}
          data-testid="evidence-questions-panel"
        >
          <header className="result-evidence-panel__header">
            <IconMicroscope size={18} />
            <strong>{t('result.evidencePanelTitle')}</strong>
          </header>
          <div className="result-evidence-panel__body">
            {evidenceItems.length > 0 && (
              <div className="missing-evidence" data-testid="missing-evidence-list">
                <strong className="inline-icon-label">
                  <IconMicroscope size={16} />
                  {t('result.missingEvidenceTitle')}
                </strong>
                <ul>
                  {evidenceItems.map((item, i) => (
                    <li key={`ev-${i}`} className="evidence-item">
                      <span className="evidence-item__text">{item.text}</span>
                      {item.slot && onFocusWizardSlot && (
                        <button
                          type="button"
                          className="btn-atelier btn-atelier--ghost evidence-item__cta"
                          data-testid={`evidence-slot-cta-${item.slot}`}
                          data-slot={item.slot}
                          title={t('result.addViewCtaHint')}
                          onClick={() => onFocusWizardSlot(item.slot!)}
                        >
                          {t('result.addViewCta')}
                          <span className="evidence-item__slot-tag">{item.slot}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {questionItems.length > 0 && (
              <div className="questions-section" data-testid="questions-for-user-list">
                <strong className="inline-icon-label">
                  <IconInfo size={16} />
                  {t('result.questionsTitle')}
                </strong>
                <ul>
                  {questionItems.map((item, i) => (
                    <li key={`q-${i}`} className="evidence-item">
                      <span className="evidence-item__text">{item.text}</span>
                      {item.slot && onFocusWizardSlot && (
                        <button
                          type="button"
                          className="btn-atelier btn-atelier--ghost evidence-item__cta"
                          data-testid={`question-slot-cta-${item.slot}`}
                          data-slot={item.slot}
                          title={t('result.addViewCtaHint')}
                          onClick={() => onFocusWizardSlot(item.slot!)}
                        >
                          {t('result.addViewCta')}
                          <span className="evidence-item__slot-tag">{item.slot}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
