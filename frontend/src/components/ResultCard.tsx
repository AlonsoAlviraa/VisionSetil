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
import {
  E20_ECE_SNAPSHOT,
  eceConfidenceStickyLine,
  resolveIdentifyConfidenceChrome,
  type EceBand,
} from '../lib/eceHonesty'
import { openSetReasonFallback, openSetReasonI18nKey } from '../lib/openSetReason'
import { linkEvidenceItems } from '../lib/evidenceSlotMap'
import {
  capturePacketDensity,
  formatViewTypesShort,
  type CanonicalView,
} from '../lib/multiViewSlots'
import { getRiskMeta, isSevereRisk, resolveJoinRisk } from '../lib/riskLabels'
import {
  ensureLookalikeRiskCatalog,
  lookalikeSummaryForIdentify,
  rankLookalikesForIdentify,
} from '../lib/lookalikeRisk'
import {
  diagnosticForLookalikeMate,
  type LookalikePairDiagnostic,
} from '../lib/diagnosticViews'
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
import { stackBadge } from '../lib/modelStackLabel'
import { toRiskLabel } from '../lib/riskLabels'
import { commonsForLocale } from '../data/speciesCatalog'
import { ModelInsightsPanel } from './ModelInsightsPanel'
import {
  EducationalBlockedShell,
  ResultModeBanner,
} from './ResultModeBanner'
import {
  resolveVerificationStatus,
  verificationBody,
  verificationTitle,
} from '../lib/verificationStatus'

interface ResultCardProps {
  result: ClassificationResult
  onFeedback?: (isCorrect: boolean, species?: string) => void
  viewTypes?: string[]
  previews?: string[]
  /** B-36: deep-link a missing photo cue to the multi-view wizard slot. */
  onFocusWizardSlot?: (view: CanonicalView) => void
  /**
   * ECE residual band (M2.1). Defaults to published E20 high residual.
   * Soft MAP gates can PASS while ECE stays high — hide/de-emphasize %.
   */
  eceBand?: EceBand
}

const RISK_T_KEY: Record<string, string> = {
  deadly: 'risk.deadly',
  poisonous: 'risk.poisonous',
  toxic: 'risk.toxic',
  unknown_or_risky: 'risk.orientation',
  dangerous_or_unknown: 'risk.dangerous_or_unknown',
  not_for_consumption_guidance: 'risk.not_for_consumption',
}

function getEdibilityMeta(
  edibility: string | null,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): { label: string; class: string } {
  const meta = getRiskMeta(edibility)
  const key = toRiskLabel(edibility)
  return {
    label: t(RISK_T_KEY[key] || 'risk.dangerous_or_unknown', {
      defaultValue: meta.label,
    }),
    class: meta.className,
  }
}

function getConfidenceInterpretation(
  confidence: number,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): {
  label: string
  level: 'low' | 'moderate' | 'high'
  description: string
} {
  if (confidence < 0.4) {
    return {
      label: t('result.confLow', { defaultValue: 'Baja confianza' }),
      level: 'low',
      description: t('result.confLowBody', {
        defaultValue: 'Pista floja. Mejor no te fíes solo de esto.',
      }),
    }
  }
  if (confidence < 0.7) {
    return {
      label: t('result.confMid', { defaultValue: 'Confianza moderada' }),
      level: 'moderate',
      description: t('result.confMidBody', {
        defaultValue: 'Hay una idea razonable, con margen de error.',
      }),
    }
  }
  return {
    label: t('result.confHigh', { defaultValue: 'Alta confianza' }),
    level: 'high',
    description: t('result.confHighBody', {
      defaultValue: 'El modelo se atreve… y aun así conviene un humano.',
    }),
  }
}

function safetyLevelMeta(
  t: (key: string, opts?: { defaultValue?: string }) => string,
): Record<string, { label: string; class: string }> {
  return {
    safe: {
      label: t('result.safetyOrientation', { defaultValue: 'Solo orientación' }),
      class: 'sl-caution',
    },
    unsafe_to_consume: {
      label: t('result.safetyUnsafe', { defaultValue: 'No apta para consumo' }),
      class: 'sl-danger',
    },
    caution: {
      label: t('result.safetyCaution', { defaultValue: 'Precaución' }),
      class: 'sl-caution',
    },
    warning: {
      label: t('result.safetyWarning', { defaultValue: 'Advertencia' }),
      class: 'sl-warning',
    },
    danger: {
      label: t('result.safetyDanger', { defaultValue: 'Peligro' }),
      class: 'sl-danger',
    },
    critical: {
      label: t('result.safetyCritical', { defaultValue: 'Crítico' }),
      class: 'sl-critical',
    },
  }
}

export function ResultCard({
  result,
  onFeedback,
  viewTypes = [],
  previews = [],
  onFocusWizardSlot,
  eceBand = E20_ECE_SNAPSHOT.band,
}: ResultCardProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const navigate = useNavigate()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [layer2Open, setLayer2Open] = useState(false)
  const [layer3Open, setLayer3Open] = useState(false)
  const [showMorePredictions, setShowMorePredictions] = useState(false)
  const [handoffSaved, setHandoffSaved] = useState(false)

  const mode = resolveDisplayMode(result)
  /** Gate dual-signal × ECE residual (E20 high → hide numeric % even if MAP soft-PASS). */
  const confChrome = useMemo(
    () => resolveIdentifyConfidenceChrome(shouldShowConfidence(result), eceBand),
    [result, eceBand],
  )
  const showConfidence = confChrome.show && !confChrome.hideNumericPercent
  const showBlockedShell = shouldShowEducationalShell(result)
  const openSetRejected = isOpenSetRejected(result)
  const isRejected = result.decision === 'rejected'
  const topPrediction = result.predictions[0]
  const topEdibility = getEdibilityMeta(topPrediction?.edibility ?? null, t)
  const isDangerous = [
    'risk-toxic',
    'risk-poisonous',
    'risk-deadly',
    'ed-toxic',
    'ed-deadly',
  ].includes(topEdibility.class)
  const isDeadly =
    topEdibility.class === 'risk-deadly' || topEdibility.class === 'ed-deadly'
  const stackBadgeInfo = stackBadge(result.model_stack, locale)

  const [catalogTick, setCatalogTick] = useState(0)
  useEffect(() => {
    // Ensure SSOT catalog is loaded so FE B-43 lookalike merge can resolve mates
    void ensureLookalikeRiskCatalog().then(() => setCatalogTick((n) => n + 1))
  }, [])

  const predictionTaxa = useMemo(
    () => (result.predictions || []).slice(0, 2).map((p) => p.species).filter(Boolean),
    [result.predictions],
  )
  // B-43 FE: union API dangerous_lookalikes + SSOT catalog mates for top predictions
  const rankedLookalikes = useMemo(
    () => rankLookalikesForIdentify(result.dangerous_lookalikes, predictionTaxa),
    // catalogTick re-ranks after async catalog load
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogTick intentional
    [result.dangerous_lookalikes, predictionTaxa, catalogTick],
  )
  const lookalikeStats = useMemo(
    () => lookalikeSummaryForIdentify(result.dangerous_lookalikes, predictionTaxa),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogTick intentional
    [result.dangerous_lookalikes, predictionTaxa, catalogTick],
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
  const verification = useMemo(() => resolveVerificationStatus(result), [result])
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

  const safetyMeta = safetyLevelMeta(t)
  const sl = safetyMeta[result.safety_level] ?? safetyMeta.caution

  const packetDensity = useMemo(
    () => capturePacketDensity(viewTypes, viewTypes?.length ?? 0),
    [viewTypes],
  )
  const viewCount = packetDensity.photoCount || (viewTypes?.length ?? 0)
  const packetChipClass = packetDensity.density
  const viewLabelsShort = formatViewTypesShort(viewTypes, i18n.language)

  return (
    <div
      className={`result-card result-card--layered result-card--scan result-card--v182 result-card--v184 result-card--v185 result-card--v196 result-card--mode-${mode} ${isDeadly && !isRejected && !showBlockedShell ? 'result-card--deadly' : ''}${confChrome.deemphasize ? ' result-card--ece-deemph' : ''}`}
      data-testid="result-card"
      data-mode={mode}
      data-show-confidence={showConfidence ? 'true' : 'false'}
      data-ece-band={confChrome.band}
      data-ece-deemphasize={confChrome.deemphasize ? 'true' : 'false'}
      data-packet={packetChipClass}
      data-critical={`${packetDensity.criticalDone}/${packetDensity.criticalTotal}`}
    >
      <ResultModeBanner result={result} />

      {/* Orientation sticky — always visible above decision chrome */}
      <p className="result-orientation-sticky" data-testid="result-orientation-sticky" role="note">
        {t('result.orientationSticky', {
          defaultValue:
            'Solo orientación de campo · nunca permiso de consumo · multi-vista (láminas + perfil) reduce confusiones',
        })}
      </p>
      {confChrome.deemphasize ? (
        <p
          className="result-ece-sticky"
          data-testid="result-ece-sticky"
          data-band={confChrome.band}
          role="note"
        >
          {eceConfidenceStickyLine(confChrome.band, locale)}
        </p>
      ) : null}

      {/* ── Layer 1: safety + decision + top predictions ── */}
      <section
        className="result-layer result-layer--1"
        aria-label={t('result.primaryAria', { defaultValue: 'Resultado principal' })}
      >
        <div className="result-meta-row">
          <span
            className={`stack-badge stack-badge--${stackBadgeInfo.mode}`}
            title={stackBadgeInfo.hint}
            data-testid="stack-badge"
          >
            {stackBadgeInfo.label}
          </span>
          {viewCount > 0 ? (
            <span
              className={`result-packet-chip result-packet-chip--${packetChipClass === 'ok' ? 'full' : packetChipClass}`}
              data-testid="result-packet-chip"
              title={t('result.packetHint', {
                defaultValue:
                  'Fotos enviadas (heurística o slots). Más vistas críticas ≠ permiso de consumo.',
              })}
            >
              {t('result.packetChip', {
                defaultValue: '{{n}} vistas',
                n: viewCount,
              })}
              {viewCount < 2
                ? ` · ${t('result.packetWeak', { defaultValue: 'paquete débil' })}`
                : viewCount >= 4
                  ? ` · ${t('result.packetFull', { defaultValue: 'paquete 4' })}`
                  : ''}
            </span>
          ) : null}
        </div>

        {viewCount > 0 ? (
          <div
            className={`result-view-density result-view-density--${packetChipClass}`}
            data-testid="result-view-density"
            data-density={packetChipClass}
          >
            <span className="result-view-density__labels">
              {viewLabelsShort ||
                t('result.packetChip', { defaultValue: '{{n}} vistas', n: viewCount })}
            </span>
            <span className="result-view-density__critical">
              {t('result.criticalCoverage', {
                defaultValue: 'críticas {{done}}/{{total}}',
                done: packetDensity.criticalDone,
                total: packetDensity.criticalTotal,
              })}
            </span>
            <span className="result-view-density__policy">
              {t('result.viewDensityPolicy', {
                defaultValue: 'Paquete multi-vista · orientación only · nunca consumo',
              })}
            </span>
          </div>
        ) : null}

        <div className="safety-disclaimer" role="alert">
          <strong>
            {t('result.safetyOrientation', { defaultValue: 'Solo orientación' })}
          </strong>
          <p>
            {t('result.safetyDisclaimerBody', {
              defaultValue:
                'Puede fallar. No comas por lo que diga la app — un micólogo manda.',
            })}
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
                  <p data-testid="decision-reject-reason">
                    {(() => {
                      const raw =
                        result.rejection_reason || result.open_set_reason || null
                      if (!raw) {
                        return openSetRejected
                          ? t('honesty.decision.rejected_open_set')
                          : t('honesty.decision.rejected_gate')
                      }
                      const key = openSetReasonI18nKey(raw)
                      if (key) {
                        return t(key, {
                          defaultValue: openSetReasonFallback(raw, i18n.language),
                        })
                      }
                      return openSetReasonFallback(raw, i18n.language)
                    })()}
                  </p>
                </>
              ) : (
                <>
                  <strong className="decision-banner__title">
                    <IconCheck size={18} />
                    {t('result.tentativeCue', { defaultValue: 'Pista tentativa' })}
                  </strong>
                  <p>
                    {showConfidence && topPrediction ? (
                      <>
                        {t('result.modelConfidence', {
                          defaultValue: '{{pct}}% de confianza del modelo',
                          pct: ((topPrediction.confidence ?? 0) * 100).toFixed(1),
                        })}
                        {result.predictions.length >= 2
                          ? t('result.modelUnsureMulti', {
                              defaultValue: ' · el modelo duda entre varias especies',
                            })
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
                  <IconAlert size={18} />{' '}
                  {t('result.deadlyCalloutTitle', {
                    defaultValue: 'Posible confusión mortal',
                  })}
                </strong>
                <p>
                  {topEdibility.label}.{' '}
                  {t('result.deadlyCalloutBody', {
                    defaultValue:
                      'Mantén distancia de niños y mascotas. No toques ni pruebes. Confirma con un micólogo.',
                  })}
                </p>
              </div>
            )}

            {isDangerous && !isDeadly && !isRejected && (
              <div className="danger-callout danger-callout--compact" role="alert">
                <strong>
                  <IconAlert size={16} />{' '}
                  {t('result.highRiskCalloutTitle', {
                    defaultValue: 'Posible riesgo alto',
                  })}
                </strong>
                <span>
                  {' '}
                  — {topEdibility.label}.{' '}
                  {t('result.highRiskCalloutBody', {
                    defaultValue: 'Mantén distancia de niños y mascotas.',
                  })}
                </span>
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
                    const meta = getEdibilityMeta(joinRisk, t)
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
              {needsExpert
                ? t('result.expertReviewCta', { defaultValue: 'Revisión experta' })
                : t('result.secondOpinionCta', { defaultValue: 'Segunda opinión' })}
            </button>
            <Link className="btn-atelier btn-atelier--ghost" to="/lookalikes">
              {t('nav.lookalikes', { defaultValue: 'Lookalikes' })}
            </Link>
            {showBlockedShell && (
              <Link
                className="btn-atelier btn-atelier--ghost"
                to="/enciclopedia"
                data-testid="cta-encyclopedia-inline"
              >
                {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
              </Link>
            )}
          </div>
          {handoffSaved && (
            <p className="muted" role="status">
              {t('result.draftSaved', { defaultValue: 'Borrador guardado.' })}
            </p>
          )}
        </div>

        {/* iNat-inspired verification status — model never mints research-grade */}
        <section
          className="result-verification"
          data-testid="result-verification-status"
          data-status={verification.id}
          data-research-grade="false"
          aria-label={t('result.verificationAria', {
            defaultValue: 'Estado de verificación',
          })}
        >
          <header className="result-verification__head">
            <IconInfo size={16} />
            <strong data-testid="result-verification-title">
              {verificationTitle(verification, locale)}
            </strong>
          </header>
          <p className="result-verification__body" data-testid="result-verification-body">
            {verificationBody(verification, locale)}
          </p>
          {/* Always-visible second-opinion CTAs (Studio + community) — not only when lookalikes exist */}
          <div className="lookalike-next-actions" data-testid="lookalike-next-actions">
            <Link
              className="btn-atelier btn-atelier--primary"
              to="/lookalikes"
              data-testid="cta-lookalike-studio-from-result"
            >
              {t('result.compareInStudio', {
                defaultValue: 'Comparar en Lookalike Studio',
              })}
            </Link>
            <Link
              className="btn-atelier btn-atelier--ghost"
              to="/comunidad"
              data-testid="cta-community-from-result"
            >
              {t('result.askCommunity', {
                defaultValue: 'Preguntar a la comunidad',
              })}
            </Link>
          </div>
        </section>
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
              {showConfidence
                ? t('result.layer2Confidence', {
                    defaultValue: 'Confianza y confusiones',
                  })
                : t('result.layer2Lookalikes', {
                    defaultValue: 'Confusiones de riesgo',
                  })}
              {lookalikeStats.deadly > 0
                ? t('result.layer2DeadlyCount', {
                    defaultValue: ' · {{n}} mortales',
                    n: lookalikeStats.deadly,
                  })
                : lookalikeStats.high > 0
                  ? t('result.layer2HighCount', {
                      defaultValue: ' · {{n}} alto riesgo',
                      n: lookalikeStats.high,
                    })
                  : ''}
            </span>
            <span aria-hidden="true">{layer2Open ? '−' : '+'}</span>
          </button>
          {layer2Open && (
            <div className="result-layer__body">
              {showConfidence && !isRejected && topPrediction && (() => {
                const interp = getConfidenceInterpretation(topPrediction.confidence, t)
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
                    {t('result.lookalikesHeader', {
                      defaultValue: 'Confusiones de riesgo ({{total}})',
                      total: lookalikeStats.total,
                    })}
                    {lookalikeStats.deadly > 0
                      ? t('result.layer2DeadlyCount', {
                          defaultValue: ' · {{n}} mortales',
                          n: lookalikeStats.deadly,
                        })
                      : ''}
                  </strong>
                  <ul className="lookalike-list">
                    {rankedLookalikes.map((sp) => {
                      const meta = getRiskMeta(sp.risk_label)
                      const lookalikeCommons = commonsForLocale(
                        {
                          taxon: sp.name,
                          common_names: sp.common_names,
                          common_names_en: sp.common_names_en,
                        },
                        locale,
                      )
                      // Pair-specific critical_views from diagnostic map (educational)
                      const pairDiag: LookalikePairDiagnostic | null =
                        diagnosticForLookalikeMate(predictionTaxa, sp.name)
                      return (
                        <li
                          key={sp.name}
                          className={`lookalike-item ${meta.className}`}
                          data-testid={`lookalike-item-${sp.slug || sp.name}`}
                          data-pair-id={pairDiag?.pair_id || undefined}
                        >
                          <SpeciesThumb taxon={sp.name} riskLabel={sp.risk_label} size={40} />
                          <div className="lookalike-item__text">
                            <RiskChip risk={sp.risk_label} />
                            <SpeciesNameBlock
                              taxon={sp.name}
                              commonNames={lookalikeCommons}
                              size="sm"
                              showFamily={false}
                            />
                            {sp.slug && (
                              <Link to={`/enciclopedia/${sp.slug}`} className="lookalike-link">
                                {t('result.viewSheet', { defaultValue: 'Ver ficha' })}
                              </Link>
                            )}
                            {pairDiag && pairDiag.critical_views.length > 0 && (
                              <div
                                className="lookalike-item__diag"
                                data-testid={`lookalike-diag-${pairDiag.pair_id}`}
                                data-pair-source={pairDiag.source}
                              >
                                {pairDiag.why ? (
                                  <p className="lookalike-item__diag-why muted">
                                    {pairDiag.why}
                                  </p>
                                ) : null}
                                <div
                                  className="lookalike-item__diag-views"
                                  aria-label={t('result.pairCriticalViewsAria', {
                                    defaultValue: 'Vistas diagnósticas para esta confusión',
                                  })}
                                >
                                  <span className="lookalike-item__diag-label">
                                    {t('result.pairCriticalViews', {
                                      defaultValue: 'Vistas que discriminan:',
                                    })}
                                  </span>
                                  {pairDiag.critical_views.map((view) => {
                                    const viewLabel = t(`identify.views.${view}`, {
                                      defaultValue: view,
                                    })
                                    if (onFocusWizardSlot) {
                                      return (
                                        <button
                                          key={view}
                                          type="button"
                                          className="lookalike-item__diag-badge"
                                          data-testid={`lookalike-diag-view-${view}`}
                                          data-slot={view}
                                          title={t('result.addViewCtaHint', {
                                            defaultValue: 'Añadir esta vista al asistente multi-foto',
                                          })}
                                          onClick={() => onFocusWizardSlot(view)}
                                        >
                                          {viewLabel}
                                        </button>
                                      )
                                    }
                                    return (
                                      <span
                                        key={view}
                                        className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                                        data-testid={`lookalike-diag-view-${view}`}
                                        data-slot={view}
                                      >
                                        {viewLabel}
                                      </span>
                                    )
                                  })}
                                </div>
                                <p className="lookalike-item__diag-policy muted">
                                  {t('result.pairDiagPolicy', {
                                    defaultValue:
                                      'Educativo: multi-foto sin estas vistas no basta — solo orientación, nunca consumo.',
                                  })}
                                </p>
                              </div>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                  <p className="lookalikes-warning__hint muted">
                    {t('result.lookalikeCtaHint', {
                      defaultValue:
                        'Compara en Studio o pide segunda opinión (arriba) — nunca es permiso de consumo.',
                    })}
                  </p>
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
            <span>{t('result.layer3More', { defaultValue: 'Más detalle' })}</span>
            <span aria-hidden="true">{layer3Open ? '−' : '+'}</span>
          </button>
          {layer3Open && (
            <div className="result-layer__body">
              {result.quality_warnings.length > 0 && (
                <div className="quality-warnings">
                  <strong className="inline-icon-label">
                    <IconInfo size={16} />
                    {t('result.imageQuality', { defaultValue: 'Calidad de imagen' })}
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
                  <p className="feedback-question">
                    {t('result.feedbackQuestion', {
                      defaultValue: '¿La pista te encaja?',
                    })}
                  </p>
                  <div className="feedback-buttons">
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost"
                      onClick={() => handleFeedback(true)}
                    >
                      <IconThumbsUp size={16} />{' '}
                      {t('result.feedbackYes', { defaultValue: 'Sí' })}
                    </button>
                    <button
                      type="button"
                      className="btn-atelier btn-atelier--ghost"
                      onClick={() => handleFeedback(false)}
                    >
                      <IconThumbsDown size={16} />{' '}
                      {t('result.feedbackNo', { defaultValue: 'No' })}
                    </button>
                  </div>
                </div>
              )}
              {feedbackSent && (
                <div className="feedback-sent">
                  <IconCheck size={16} />{' '}
                  {t('result.feedbackThanks', {
                    defaultValue: 'Gracias — ayuda a mejorar el modelo.',
                  })}
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
