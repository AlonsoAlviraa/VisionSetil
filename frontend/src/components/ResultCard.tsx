/**
 * Result card showing classification predictions with mandatory safety warnings.
 *
 * SAFETY POLICY: This component MUST always display a prominent disclaimer.
 * Mushroom misidentification can be fatal. Never remove the safety banner.
 *
 * D16: risk-oriented labels only; never green edible OK.
 * PR-09: prefer BE-localized pred.edibility; fall back to i18n risk.* keys.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult, SpeciesPrediction } from '../api/types'
import { SpeciesImage } from './SpeciesImage'
import { riskToPlaceholder } from '../lib/edibility'
import { scientificNameToSlug } from '../lib/slug'

interface ResultCardProps {
  result: ClassificationResult
  onFeedback?: (isCorrect: boolean, species?: string) => void
}

/** CSS class mapping by risk_level key — labels come from i18n / BE. */
const RISK_CLASS: Record<string, { class: string; icon: string }> = {
  toxic: { class: 'ed-toxic', icon: '☠️' },
  poisonous: { class: 'ed-toxic', icon: '☠️' },
  deadly: { class: 'ed-deadly', icon: '💀' },
  high: { class: 'ed-toxic', icon: '☠️' },
  critical: { class: 'ed-deadly', icon: '💀' },
  medium: { class: 'ed-caution', icon: '⚠️' },
  low: { class: 'ed-unknown', icon: '?' },
  unknown: { class: 'ed-unknown', icon: '?' },
  risky_lookalikes: { class: 'ed-caution', icon: '⚠️' },
  dangerous_or_unknown: { class: 'ed-caution', icon: '⚠️' },
  edible: { class: 'ed-unknown', icon: '?' },
  'edible-conditionally': { class: 'ed-caution', icon: '⚠️' },
  inedible: { class: 'ed-caution', icon: '⚠️' },
}

const RISK_KEYS = new Set(Object.keys(RISK_CLASS))

function getRiskMeta(
  edibility: string | null | undefined,
  riskLevel: string | null | undefined,
  t: (key: string, opts?: { defaultValue?: string }) => string,
): { label: string; class: string; icon: string } {
  const riskKey = (riskLevel || '').toLowerCase().trim()
  const edibRaw = (edibility || '').trim()
  const edibKey = edibRaw.toLowerCase()

  // Prefer BE-localized edibility string when it is not a raw risk key
  const localizedFromBe =
    edibRaw && !RISK_KEYS.has(edibKey) ? edibRaw : null

  const keyForClass = RISK_KEYS.has(riskKey)
    ? riskKey
    : RISK_KEYS.has(edibKey)
      ? edibKey
      : 'unknown'

  const style = RISK_CLASS[keyForClass] || RISK_CLASS.unknown
  const label =
    localizedFromBe ||
    t(`risk.${keyForClass}`, {
      defaultValue: t('risk.unknown', { defaultValue: 'Unknown — do not consume' }),
    })

  return { label, class: style.class, icon: style.icon }
}

export function ResultCard({ result, onFeedback }: ResultCardProps) {
  const { t } = useTranslation()
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const isRejected = result.decision === 'rejected'
  const topPrediction = result.predictions[0]
  const topEdibility = getRiskMeta(
    topPrediction?.edibility ?? null,
    topPrediction?.risk_level ?? null,
    t,
  )
  const isDangerous = ['ed-toxic', 'ed-deadly'].includes(topEdibility.class)

  const handleFeedback = (correct: boolean) => {
    onFeedback?.(correct, topPrediction?.species)
    setFeedbackSent(true)
  }

  const confLevel =
    topPrediction && topPrediction.confidence < 0.4
      ? 'low'
      : topPrediction && topPrediction.confidence < 0.7
        ? 'moderate'
        : 'high'

  const safetyKey = result.safety_level || 'caution'
  const safetyLabel = t(`result.safetyLevel.${safetyKey}`, {
    defaultValue: t('result.safetyLevel.caution'),
  })
  const safetyIcon =
    safetyKey === 'critical'
      ? '💀'
      : safetyKey === 'danger' || safetyKey === 'unsafe_to_consume'
        ? '🔴'
        : safetyKey === 'warning'
          ? '🟠'
          : '🟡'

  return (
    <div className="result-card">
      <div className="safety-disclaimer" role="alert" data-testid="safety-banner">
        <strong>⚠️ {t('safety.bannerTitle')}</strong>
        <p>{t('safety.bannerBody')}</p>
        {result.final_warning ? (
          <p>
            <strong>{result.final_warning}</strong>
          </p>
        ) : null}
      </div>

      <div className={`safety-level-badge sl-${safetyKey === 'safe' ? 'caution' : safetyKey}`}>
        <span className="sl-icon">{safetyIcon}</span>
        <span>
          {t('result.safetyLevelLabel')}: <strong>{safetyLabel}</strong>
        </span>
      </div>

      <div className={`decision-banner ${isRejected ? 'rejected' : 'accepted'}`}>
        {isRejected ? (
          <>
            <strong>⚠️ {t('result.rejectedTitle')}</strong>
            <p>
              {result.rejection_reason ||
                result.open_set_reason ||
                t('result.rejectedDefault')}
            </p>
            <p className="hint">{t('result.rejectedHint')}</p>
          </>
        ) : (
          <>
            <strong>✅ {t('result.acceptedTitle')}</strong>
            <p>
              {t('result.maxConfidence')}:{' '}
              {((topPrediction?.confidence ?? 0) * 100).toFixed(1)}%
            </p>
          </>
        )}
      </div>

      {!isRejected && topPrediction && (
        <div className={`confidence-interpretation ci-${confLevel}`}>
          <span className="ci-icon">
            {confLevel === 'high' ? '✓' : confLevel === 'moderate' ? '⚠' : '✗'}
          </span>
          <div>
            <strong>{t(`result.confidence.${confLevel}.label`)}</strong>
            <p>{t(`result.confidence.${confLevel}.description`)}</p>
          </div>
        </div>
      )}

      {result.recommend_human_review && (
        <div className="review-callout">
          <strong>🔬 {t('result.humanReviewTitle')}</strong>
          <p>{t('result.humanReviewBody')}</p>
        </div>
      )}

      {result.predictions.length > 0 && (
        <div className="predictions">
          <h3>
            {t('result.predictions')} ({result.predictions.length})
          </h3>
          <ul>
            {result.predictions.map((pred: SpeciesPrediction, idx: number) => {
              const meta = getRiskMeta(pred.edibility, pred.risk_level, t)
              const slug = pred.slug || scientificNameToSlug(pred.species)
              return (
                <li
                  key={`${pred.species}-${idx}`}
                  className={`prediction-item ${meta.class} ${idx === 0 ? 'top-match' : ''}`}
                >
                  <div className="prediction-confidence-bar" aria-hidden>
                    <div
                      className="prediction-confidence-bar__fill"
                      style={{ width: `${Math.round(Math.min(1, pred.confidence) * 100)}%` }}
                    />
                  </div>
                  <div
                    className="prediction-info"
                    style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        flexShrink: 0,
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}
                    >
                      <SpeciesImage
                        key={slug}
                        scientificName={pred.species}
                        slug={slug}
                        variant="thumb"
                        riskLevel={riskToPlaceholder(pred.risk_level, pred.edibility)}
                        alt={pred.common_name || pred.species}
                      />
                    </div>
                    <span className="species-name">
                      <span className="rank-badge">#{idx + 1}</span>
                      <em>{pred.species}</em>
                      {pred.common_name && (
                        <span className="common-name"> — {pred.common_name}</span>
                      )}
                    </span>
                    <span className={`edibility-badge ${meta.class}`}>
                      {meta.icon} {meta.label}
                    </span>
                  </div>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${Math.min(pred.confidence * 100, 100)}%` }}
                    />
                  </div>
                  <span className="confidence-value">
                    {(pred.confidence * 100).toFixed(1)}%
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isDangerous && !isRejected && (
        <div className="danger-callout" role="alert">
          <strong>💀 {t('result.dangerTitle')}</strong>
          <p>
            {t('result.dangerBody', { category: topEdibility.label.toLowerCase() })}
          </p>
        </div>
      )}

      {result.dangerous_lookalikes.length > 0 && (
        <div className="lookalikes-warning">
          <strong>⚠️ {t('result.lookalikesTitle')}</strong>
          <ul>
            {result.dangerous_lookalikes.map((sp, i) => (
              <li key={i}>
                <em>{sp}</em>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.quality_warnings.length > 0 && (
        <div className="quality-warnings">
          <strong>ℹ️ {t('result.qualityTitle')}</strong>
          <ul>
            {result.quality_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {result.missing_evidence.length > 0 && (
        <div className="missing-evidence">
          <strong>📷 {t('result.missingEvidenceTitle')}</strong>
          <ul>
            {result.missing_evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.questions_for_user.length > 0 && (
        <div className="questions-section">
          <strong>❓ {t('result.questionsTitle')}</strong>
          <ul>
            {result.questions_for_user.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {onFeedback && !feedbackSent && !isRejected && (
        <div className="feedback-section">
          <p className="feedback-question">{t('result.feedbackQuestion')}</p>
          <div className="feedback-buttons">
            <button className="btn-feedback yes" onClick={() => handleFeedback(true)}>
              👍 {t('result.feedbackYes')}
            </button>
            <button className="btn-feedback no" onClick={() => handleFeedback(false)}>
              👎 {t('result.feedbackNo')}
            </button>
          </div>
        </div>
      )}
      {feedbackSent && <div className="feedback-sent">✓ {t('result.feedbackThanks')}</div>}

      <button className="details-toggle" onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? '▼' : '▸'} {t('result.technicalDetails')}
      </button>
      {showDetails && (
        <div className="technical-details">
          <p>
            <strong>ID:</strong> {result.request_id}
          </p>
          <p>
            <strong>{t('result.time')}:</strong> {result.processing_time_ms}ms
          </p>
          {result.model_stack && (
            <>
              <p>
                <strong>Detector:</strong> {result.model_stack.detector}
              </p>
              <p>
                <strong>Visual:</strong> {result.model_stack.visual_embedder}
              </p>
              <p>
                <strong>Texto-imagen:</strong> {result.model_stack.image_text_embedder}
              </p>
              <p>
                <strong>Metadata:</strong> {result.model_stack.metadata_encoder}
              </p>
            </>
          )}
          {result.observation_id && (
            <p>
              <strong>Obs ID:</strong> {result.observation_id}
            </p>
          )}
        </div>
      )}

      <div className="processing-time">
        {result.final_warning && <p className="final-warning">{result.final_warning}</p>}
      </div>
    </div>
  )
}
