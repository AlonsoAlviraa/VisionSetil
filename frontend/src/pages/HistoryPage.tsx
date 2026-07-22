/**
 * Field notebook + observation history (S6 enrichment: notes, tags, JSON export).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  clearHistoryStore,
  entriesNeedingReview,
  exportHistoryJson,
  loadHistory,
  parseTagsInput,
  saveNotebookFields,
  summarizeHistory,
  type HistoryEntry,
} from '../lib/observationHistory'
import { EmptyState } from '../components/EmptyState'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { PhotoFrame } from '../components/PhotoFrame'
import { rankLookalikes } from '../lib/lookalikeRisk'
import { getRiskMeta } from '../lib/riskLabels'
import {
  buildHandoffFromHistory,
  expertReviewPath,
  saveHandoffDraft,
} from '../lib/expertHandoff'
import { decisionLabelEs } from '../lib/decisionLabels'

export function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')

  useEffect(() => {
    setEntries(loadHistory())
  }, [])

  const summary = useMemo(() => summarizeHistory(entries), [entries])
  const needsReview = useMemo(() => entriesNeedingReview(entries), [entries])

  const clear = () => {
    clearHistoryStore()
    setEntries([])
  }

  const exportJson = () => {
    const json = exportHistoryJson(entries)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `visionsetil-notebook-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const startEdit = (e: HistoryEntry) => {
    setEditingId(e.id)
    setNoteDraft(e.notes || '')
    setTagsDraft((e.tags || []).join(', '))
  }

  const saveEdit = (id: string) => {
    const next = saveNotebookFields(id, {
      notes: noteDraft,
      tags: parseTagsInput(tagsDraft),
    })
    setEntries(next)
    setEditingId(null)
  }

  const handoff = (e: HistoryEntry) => {
    const draft = buildHandoffFromHistory(e, e.notes || '')
    saveHandoffDraft(draft)
    window.location.href = expertReviewPath(draft.id)
  }

  return (
    <div className="page-history page-atelier-shell">
      <div className="page-header">
        <h1 className="page-title">Cuaderno de campo</h1>
        <p className="page-subtitle">
          Historial local con notas y etiquetas. Solo orientación — no es un diario de consumo.
        </p>
      </div>

      <div className="atelier-stat-row">
        <div className="atelier-stat-card">
          <strong>{summary.total}</strong>
          <span>Total</span>
        </div>
        <div className="atelier-stat-card">
          <strong>{summary.accepted}</strong>
          <span>Pistas tentativas</span>
        </div>
        <div className="atelier-stat-card">
          <strong>{summary.rejected}</strong>
          <span>Sin ID fiable</span>
        </div>
        <div className="atelier-stat-card">
          <strong>{summary.need_review}</strong>
          <span>Para revisión</span>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div className="review-callout atelier-callout" style={{ marginTop: '1.25rem' }}>
          <strong>{needsReview.length} caso(s) merecen revisión experta</strong>
          <p>
            Rechazos, lookalikes de riesgo o bandera de human-review.{' '}
            <Link to="/revision-experta">Ir a revisión experta</Link>
          </p>
        </div>
      )}

      <div className="history-header atelier-section-bar">
        <h2>Entradas recientes</h2>
        <div className="history-actions">
          <Link to="/identificar" className="btn-atelier btn-atelier--primary">
            Nueva identificación
          </Link>
          {entries.length > 0 && (
            <button type="button" className="btn-atelier btn-atelier--ghost" onClick={exportJson}>
              Exportar JSON
            </button>
          )}
          {entries.length > 0 && (
            <button type="button" className="btn-atelier btn-atelier--ghost" onClick={clear}>
              Limpiar historial
            </button>
          )}
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Sin observaciones aún"
          description="Identifica una seta y quedará guardada aquí con espacio para notas de campo."
          actionLabel="Identificar seta"
          actionTo="/identificar"
        />
      ) : (
        <div className="history-card-grid">
          {entries.map((e) => {
            const top = e.result.predictions?.[0]
            const look = rankLookalikes(e.result.dangerous_lookalikes || [])
            const topRisk = look[0] ? getRiskMeta(look[0].risk_label) : null
            const isEditing = editingId === e.id
            return (
              <article key={e.id} className="history-card-atelier">
                {e.previews[0] && (
                  <PhotoFrame
                    src={e.previews[0]}
                    alt=""
                    ratio="4/3"
                    className="history-card-atelier__photo"
                  />
                )}
                <div className="history-card-atelier__body">
                  <p className="history-card-atelier__time">
                    {new Date(e.timestamp).toLocaleString()}
                  </p>
                  <p className="history-card-atelier__decision">
                    Resultado: <strong>{decisionLabelEs(e.result.decision)}</strong>
                  </p>
                  {top && (
                    <SpeciesNameBlock
                      taxon={top.species}
                      commonNames={top.common_name}
                      size="sm"
                    />
                  )}
                  {top && (
                    <p className="history-card-atelier__conf">
                      {(top.confidence * 100).toFixed(1)}% confianza
                    </p>
                  )}
                  {e.view_types && e.view_types.length > 0 && (
                    <p className="history-card-atelier__views">
                      Vistas: {e.view_types.join(', ')}
                    </p>
                  )}
                  {(e.tags?.length ?? 0) > 0 && (
                    <p className="history-card-atelier__tags">
                      {e.tags!.map((t) => (
                        <span key={t} className="notebook-tag">
                          {t}
                        </span>
                      ))}
                    </p>
                  )}
                  {e.notes && !isEditing && (
                    <p className="history-card-atelier__notes">{e.notes}</p>
                  )}
                  {isEditing ? (
                    <div className="notebook-edit">
                      <label>
                        Notas de campo
                        <textarea
                          value={noteDraft}
                          onChange={(ev) => setNoteDraft(ev.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder="Hábitat, olor, árbol cercano… (sin consejos de consumo)"
                        />
                      </label>
                      <label>
                        Etiquetas (coma)
                        <input
                          value={tagsDraft}
                          onChange={(ev) => setTagsDraft(ev.target.value)}
                          placeholder="pinar, otoño, dudosa"
                        />
                      </label>
                      <div className="identify-mode-toggle">
                        <button
                          type="button"
                          className="btn-atelier btn-atelier--primary"
                          onClick={() => saveEdit(e.id)}
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          className="btn-atelier btn-atelier--ghost"
                          onClick={() => setEditingId(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="identify-mode-toggle">
                      <button
                        type="button"
                        className="btn-atelier btn-atelier--ghost"
                        onClick={() => startEdit(e)}
                      >
                        Notas
                      </button>
                      <button
                        type="button"
                        className="btn-atelier btn-atelier--ghost"
                        onClick={() => handoff(e)}
                      >
                        Handoff experto
                      </button>
                    </div>
                  )}
                  {topRisk && (
                    <RiskChip risk={look[0]?.risk_label} label={`Lookalike: ${topRisk.label}`} />
                  )}
                  {e.result.recommend_human_review && (
                    <p>
                      <Link to="/revision-experta">Solicitar revisión experta</Link>
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
