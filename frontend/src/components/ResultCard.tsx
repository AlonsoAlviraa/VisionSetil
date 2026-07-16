/**
 * Result card showing classification predictions with mandatory safety warnings.
 *
 * SAFETY POLICY: This component MUST always display a prominent disclaimer.
 * Mushroom misidentification can be fatal. Never remove the safety banner.
 *
 * Enhanced with: quality warnings, missing evidence, dangerous lookalikes,
 * model stack info, open-set rejection reasons, human review recommendations,
 * confidence interpretation, safety level badges, and per-prediction explanations.
 *
 * Sprint N+2 (FE-2): Added confidence interpretation, safety level badge,
 * per-prediction expandable rationale, and model uncertainty visualization.
 */
import { useState } from 'react'
import type { ClassificationResult, SpeciesPrediction } from '../api/types'

interface ResultCardProps {
  result: ClassificationResult
  onFeedback?: (isCorrect: boolean, species?: string) => void
}

/** Map edibility strings to semantic CSS classes and human labels. */
const EDIBILITY_META: Record<string, { label: string; class: string; icon: string }> = {
  toxic: { label: 'Tóxica', class: 'ed-toxic', icon: '☠️' },
  poisonous: { label: 'Venenosa', class: 'ed-toxic', icon: '☠️' },
  deadly: { label: 'Mortal', class: 'ed-deadly', icon: '💀' },
  edible: { label: 'Comestible', class: 'ed-edible', icon: '✓' },
  'edible-conditionally': { label: 'Comestible condicional', class: 'ed-caution', icon: '⚠️' },
  inedible: { label: 'No comestible', class: 'ed-caution', icon: '⚠️' },
  unknown: { label: 'Desconocida', class: 'ed-unknown', icon: '?' },
}

function getEdibilityMeta(edibility: string | null): { label: string; class: string; icon: string } {
  if (!edibility) return { label: 'Desconocida', class: 'ed-unknown', icon: '?' }
  const key = edibility.toLowerCase().trim()
  return EDIBILITY_META[key] ?? { label: edibility, class: 'ed-unknown', icon: '?' }
}

/** Interpret confidence into a semantic label and risk level. */
function getConfidenceInterpretation(confidence: number): {
  label: string
  level: 'low' | 'moderate' | 'high'
  description: string
} {
  if (confidence < 0.4) {
    return {
      label: 'Baja confianza',
      level: 'low',
      description: 'El modelo no está seguro. La identificación podría ser incorrecta.',
    }
  } else if (confidence < 0.7) {
    return {
      label: 'Confianza moderada',
      level: 'moderate',
      description: 'El modelo tiene una idea razonable, pero hay incertidumbre significativa.',
    }
  } else {
    return {
      label: 'Alta confianza',
      level: 'high',
      description: 'El modelo está bastante seguro, pero la verificación humana sigue siendo esencial.',
    }
  }
}

/** Safety level metadata for display. */
const SAFETY_LEVEL_META: Record<string, { label: string; icon: string; class: string }> = {
  safe: { label: 'Segura', icon: '🟢', class: 'sl-safe' },
  caution: { label: 'Precaución', icon: '🟡', class: 'sl-caution' },
  warning: { label: 'Advertencia', icon: '🟠', class: 'sl-warning' },
  danger: { label: 'Peligro', icon: '🔴', class: 'sl-danger' },
  critical: { label: 'Crítico', icon: '💀', class: 'sl-critical' },
}

export function ResultCard({ result, onFeedback }: ResultCardProps) {
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const isRejected = result.decision === 'rejected'
  const topPrediction = result.predictions[0]
  const topEdibility = getEdibilityMeta(topPrediction?.edibility ?? null)
  const isDangerous = ['ed-toxic', 'ed-deadly'].includes(topEdibility.class)

  const handleFeedback = (correct: boolean) => {
    onFeedback?.(correct, topPrediction?.species)
    setFeedbackSent(true)
  }

  return (
    <div className="result-card">
      {/* MANDATORY SAFETY DISCLAIMER — never remove */}
      <div className="safety-disclaimer" role="alert">
        <strong>⚠️ ADVERTENCIA DE SEGURIDAD</strong>
        <p>
          Esta identificación es <strong>orientativa</strong> y puede ser incorrecta.
          <strong> NUNCA consumas una seta basándote solo en este resultado.</strong>
          Consulta siempre con un micólogo experto antes de consumir.
        </p>
      </div>

      {/* Safety level badge */}
      {(() => {
        const sl = SAFETY_LEVEL_META[result.safety_level] ?? SAFETY_LEVEL_META['caution']
        return (
          <div className={`safety-level-badge ${sl.class}`}>
            <span className="sl-icon">{sl.icon}</span>
            <span>Nivel de seguridad: <strong>{sl.label}</strong></span>
          </div>
        )
      })()}

      {/* Decision banner */}
      <div className={`decision-banner ${isRejected ? 'rejected' : 'accepted'}`}>
        {isRejected ? (
          <>
            <strong>⚠️ No identificado con confianza</strong>
            <p>{result.rejection_reason || result.open_set_reason || 'No se encontró una coincidencia fiable.'}</p>
            <p className="hint">
              Esto puede significar que la seta no está en nuestra base de datos, o que la
              foto no tiene suficiente calidad. Por seguridad, trata toda seta no identificada
              como potencialmente peligrosa.
            </p>
          </>
        ) : (
          <>
            <strong>✅ Identificación tentativa</strong>
            <p>Confianza máxima: {(topPrediction?.confidence * 100).toFixed(1)}%</p>
          </>
        )}
      </div>

      {/* Confidence interpretation (Sprint N+2 FE-2) */}
      {!isRejected && topPrediction && (() => {
        const interp = getConfidenceInterpretation(topPrediction.confidence)
        return (
          <div className={`confidence-interpretation ci-${interp.level}`}>
            <span className="ci-icon">
              {interp.level === 'high' ? '✓' : interp.level === 'moderate' ? '⚠' : '✗'}
            </span>
            <div>
              <strong>{interp.label}</strong>
              <p>{interp.description}</p>
            </div>
          </div>
        )
      })()}

      {/* Human review recommendation */}
      {result.recommend_human_review && (
        <div className="review-callout">
          <strong>🔬 Recomendada revisión humana</strong>
          <p>Este caso presenta baja confianza. Un experto debería revisarlo.</p>
        </div>
      )}

      {/* Predictions list */}
      {result.predictions.length > 0 && (
        <div className="predictions">
          <h3>Predicciones ({result.predictions.length})</h3>
          <ul>
            {result.predictions.map((pred: SpeciesPrediction, idx: number) => {
              const meta = getEdibilityMeta(pred.edibility)
              return (
                <li
                  key={`${pred.species}-${idx}`}
                  className={`prediction-item ${meta.class} ${idx === 0 ? 'top-match' : ''}`}
                >
                  <div className="prediction-info">
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

      {/* Danger callout if top match is toxic/deadly */}
      {isDangerous && !isRejected && (
        <div className="danger-callout" role="alert">
          <strong>💀 ESPECIE POTENCIALMENTE PELIGROSA DETECTADA</strong>
          <p>
            La coincidencia más probable pertenece a una categoría <strong>{topEdibility.label.toLowerCase()}</strong>.
            Mantenla lejos de niños y mascotas. No la toques con manos heridas y lávate las manos después.
          </p>
        </div>
      )}

      {/* Dangerous lookalikes warning */}
      {result.dangerous_lookalikes.length > 0 && (
        <div className="lookalikes-warning">
          <strong>⚠️ Especies peligrosas similares:</strong>
          <ul>
            {result.dangerous_lookalikes.map((sp, i) => (
              <li key={i}>
                <em>{sp}</em>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quality warnings */}
      {result.quality_warnings.length > 0 && (
        <div className="quality-warnings">
          <strong>ℹ️ Avisos de calidad de imagen:</strong>
          <ul>
            {result.quality_warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing evidence / questions for user */}
      {result.missing_evidence.length > 0 && (
        <div className="missing-evidence">
          <strong>📷 Para mejorar la identificación:</strong>
          <ul>
            {result.missing_evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {result.questions_for_user.length > 0 && (
        <div className="questions-section">
          <strong>❓ Preguntas para mejorar el resultado:</strong>
          <ul>
            {result.questions_for_user.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Feedback mechanism */}
      {onFeedback && !feedbackSent && !isRejected && (
        <div className="feedback-section">
          <p className="feedback-question">¿Es correcta esta identificación?</p>
          <div className="feedback-buttons">
            <button className="btn-feedback yes" onClick={() => handleFeedback(true)}>
              👍 Sí
            </button>
            <button className="btn-feedback no" onClick={() => handleFeedback(false)}>
              👎 No
            </button>
          </div>
        </div>
      )}
      {feedbackSent && (
        <div className="feedback-sent">
          ✓ Gracias por tu feedback. Ayuda a mejorar el modelo.
        </div>
      )}

      {/* Technical details (collapsible) */}
      <button className="details-toggle" onClick={() => setShowDetails(!showDetails)}>
        {showDetails ? '▼' : '▸'} Detalles técnicos
      </button>
      {showDetails && (
        <div className="technical-details">
          <p>
            <strong>ID:</strong> {result.request_id}
          </p>
          <p>
            <strong>Tiempo:</strong> {result.processing_time_ms}ms
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

      {/* Metadata footer */}
      <div className="processing-time">
        {result.final_warning && (
          <p className="final-warning">{result.final_warning}</p>
        )}
      </div>
    </div>
  )
}