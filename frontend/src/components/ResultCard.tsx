/**
 * Result card — 3-layer hierarchy (Wave A):
 * 1) Safety + decision + top predictions
 * 2) Confidence + lookalikes (if any)
 * 3) Accordion: quality, evidence, questions, feedback, technical
 *
 * B-34: lookalikes panel hydrates catalog fichas + RiskChip only (no food chrome).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ClassificationResult, SpeciesPrediction } from '../api/types'
import { getRiskMeta } from '../lib/riskLabels'
import {
  rankLookalikes,
  rankLookalikesHydrated,
  summarizeLookalikes,
  type RankedLookalike,
} from '../lib/lookalikeRisk'
import { SpeciesThumb } from './SpeciesThumb'
import { SpeciesImage } from './SpeciesImage'
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
import { FoodQualityChip } from './FoodQualityChip'
import { getFoodQuality } from '../lib/foodQuality'
import { ModelInsightsPanel } from './ModelInsightsPanel'

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
  const navigate = useNavigate()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [layer2Open, setLayer2Open] = useState(true)
  const [layer3Open, setLayer3Open] = useState(false)
  const [handoffSaved, setHandoffSaved] = useState(false)

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
  const topFood = topPrediction ? getFoodQuality(topPrediction.species) : null

  const lookalikeNames = result.dangerous_lookalikes || []
  // Sync first-paint fallback (may be unhydrated until catalog loads).
  const [rankedLookalikes, setRankedLookalikes] = useState<RankedLookalike[]>(() =>
    rankLookalikes(lookalikeNames),
  )
  const [lookalikesHydrated, setLookalikesHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    const names = result.dangerous_lookalikes || []
    if (!names.length) {
      setRankedLookalikes([])
      setLookalikesHydrated(true)
      return
    }
    setLookalikesHydrated(false)
    // Optimistic sync rank, then hydrate from catalog SSOT (vernaculars/risk/slug).
    setRankedLookalikes(rankLookalikes(names))
    void rankLookalikesHydrated(names).then((ranked) => {
      if (cancelled) return
      setRankedLookalikes(ranked)
      setLookalikesHydrated(true)
    })
    return () => {
      cancelled = true
    }
  }, [result.dangerous_lookalikes])

  const lookalikeStats = useMemo(
    () => summarizeLookalikes(rankedLookalikes),
    [rankedLookalikes],
  )

  const needsExpert = result.recommend_human_review || isRejected || isDangerous
  const hasLayer2 =
    (!isRejected && !!topPrediction) ||
    rankedLookalikes.length > 0 ||
    lookalikeNames.length > 0 ||
    isDangerous
  const hasLayer3 =
    true /* always show ML insights accordion */

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
      className={`result-card result-card--layered ${isDeadly && !isRejected ? 'result-card--deadly' : ''}`}
    >
      {/* ── Layer 1: safety + decision + top predictions ── */}
      <section className="result-layer result-layer--1" aria-label="Resultado principal">
        <div className="result-meta-row">
          <span
            className={`stack-badge stack-badge--${stackBadge.mode}`}
            title={stackBadge.hint}
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

        <div className={`decision-banner ${isRejected ? 'rejected' : 'accepted'}`}>
          {isRejected ? (
            <>
              <strong className="decision-banner__title">
                <IconAlert size={18} />
                Sin ID fiable
              </strong>
              <p>
                {result.rejection_reason ||
                  result.open_set_reason ||
                  'No hay coincidencia clara. Trátala como riesgo hasta que un experto diga lo contrario.'}
              </p>
            </>
          ) : (
            <>
              <strong className="decision-banner__title">
                <IconCheck size={18} />
                Pista tentativa
              </strong>
              <p>
                {((topPrediction?.confidence ?? 0) * 100).toFixed(1)}% de confianza del modelo
                {result.predictions.length >= 2
                  ? ' · el modelo duda entre varias especies'
                  : ''}
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

        {topFood && !isRejected && (
          <div className="result-food-row">
            <FoodQualityChip foodClass={topFood.food_class} label={topFood.label} />
            <span className="result-food-row__note">
              Calidad documentada (base curada) — no es permiso de consumo
            </span>
          </div>
        )}

        {result.predictions.length > 0 && (
          <div className="predictions">
            <h3>Mejores pistas</h3>
            <ul>
              {result.predictions.slice(0, 3).map((pred: SpeciesPrediction, idx: number) => {
                const meta = getEdibilityMeta(pred.edibility)
                const fq = getFoodQuality(pred.species)
                return (
                  <li
                    key={`${pred.species}-${idx}`}
                    className={`prediction-item ${meta.class} ${idx === 0 ? 'top-match' : ''}`}
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
                      {fq ? (
                        <FoodQualityChip foodClass={fq.food_class} label={fq.label} compact />
                      ) : (
                        <RiskChip risk={pred.edibility} className={`edibility-badge ${meta.class}`} />
                      )}
                      <div className="confidence-bar">
                        <div
                          className="confidence-fill"
                          style={{ width: `${Math.min(pred.confidence * 100, 100)}%` }}
                        />
                      </div>
                      <span className="confidence-value">
                        {(pred.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <div className="review-callout review-callout--compact">
          <div className="review-callout__actions">
            <button
              type="button"
              className="btn-atelier btn-atelier--primary"
              onClick={handleExpertHandoff}
            >
              <IconExpert size={16} />
              {needsExpert ? 'Revisión experta' : 'Segunda opinión'}
            </button>
            <Link className="btn-atelier btn-atelier--ghost" to="/lookalikes">
              Lookalikes
            </Link>
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
            <span>Confianza y confusiones</span>
            <span aria-hidden="true">{layer2Open ? '−' : '+'}</span>
          </button>
          {layer2Open && (
            <div className="result-layer__body">
              {!isRejected && topPrediction && (() => {
                const interp = getConfidenceInterpretation(topPrediction.confidence)
                return (
                  <div className={`confidence-interpretation ci-${interp.level}`}>
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

              {(rankedLookalikes.length > 0 || lookalikeNames.length > 0) && (
                <div
                  className="lookalikes-warning lookalikes-ranked lookalikes-panel"
                  role="alert"
                  data-testid="lookalikes-panel"
                  data-hydrated={lookalikesHydrated ? 'true' : 'false'}
                >
                  <strong className="lookalikes-warning__title">
                    <IconAlert size={16} />
                    Confusiones de riesgo
                    {lookalikeStats.total > 0
                      ? ` (${lookalikeStats.total}${
                          lookalikeStats.deadly > 0
                            ? ` · ${lookalikeStats.deadly} mortales`
                            : ''
                        })`
                      : ''}
                  </strong>
                  <p className="lookalikes-panel__note muted">
                    Solo riesgo — sin comestibilidad. Confirma con un micólogo.
                  </p>
                  {/* B-34 / D-B16: RiskChip only — no FoodQualityChip / food chrome */}
                  <ul className="lookalike-list" data-testid="lookalike-list">
                    {rankedLookalikes.map((sp) => {
                      const meta = getRiskMeta(sp.risk_label)
                      const slug = sp.slug || undefined
                      return (
                        <li
                          key={sp.name}
                          className={`lookalike-item lookalike-item--hydrated ${meta.className}`}
                          data-testid="lookalike-item"
                          data-in-catalog={sp.in_catalog ? 'true' : 'false'}
                          data-risk={sp.risk_label}
                        >
                          <div className="lookalike-item__media">
                            <SpeciesImage
                              scientificName={sp.name}
                              slug={slug}
                              variant="thumb"
                              riskLevel={sp.risk_placeholder}
                              alt={sp.name}
                              className="lookalike-item__image"
                            />
                          </div>
                          <div className="lookalike-item__text">
                            <RiskChip risk={sp.risk_label} />
                            <SpeciesNameBlock
                              taxon={sp.name}
                              commonNames={sp.common_names}
                              family={sp.family}
                              size="sm"
                              showFamily={Boolean(sp.family)}
                            />
                            {!sp.in_catalog && (
                              <span
                                className="lookalike-item__badge muted"
                                data-testid="lookalike-out-of-catalog"
                              >
                                Fuera de catálogo
                              </span>
                            )}
                            {slug && (
                              <Link
                                to={`/enciclopedia/${slug}`}
                                className="lookalike-link"
                                data-testid="lookalike-ficha-link"
                              >
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

              {onFeedback && !feedbackSent && !isRejected && (
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
