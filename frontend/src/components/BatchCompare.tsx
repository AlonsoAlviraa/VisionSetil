/**
 * BatchCompare — Side-by-side comparison of past identification results.
 *
 * Lets users compare up to 3 results from session history to help them
 * distinguish similar species (e.g. "is this the same mushroom I found yesterday?").
 */
import { useMemo, useState } from 'react'
import type { ClassificationResult } from '../api/types'

export interface HistoryEntry {
  id: string
  timestamp: number
  previews: string[]
  result: ClassificationResult
}

interface BatchCompareProps {
  history: HistoryEntry[]
  onClose: () => void
  onSelectEntry?: (entry: HistoryEntry) => void
}

const MAX_COMPARE = 3

export function BatchCompare({ history, onClose, onSelectEntry }: BatchCompareProps) {
  const [selected, setSelected] = useState<string[]>([])

  const selectedEntries = useMemo(
    () => history.filter((e) => selected.includes(e.id)).slice(0, MAX_COMPARE),
    [history, selected],
  )

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_COMPARE) return prev
      return [...prev, id]
    })
  }

  const edibilityIcon = (ed: string | null): string => {
    const map: Record<string, string> = {
      toxic: '☠️',
      poisonous: '☠️',
      deadly: '💀',
      edible: '✓',
      'edible-conditionally': '⚠️',
      inedible: '⚠️',
    }
    return ed ? (map[ed.toLowerCase()] ?? '?') : '?'
  }

  return (
    <div className="batch-compare-overlay">
      <div className="batch-compare-modal">
        <div className="batch-compare-header">
          <h2> Comparar identificaciones</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar comparación">
            ✕
          </button>
        </div>
        <p className="batch-compare-hint">
          Selecciona hasta {MAX_COMPARE} resultados para comparar lado a lado.
        </p>

        {history.length === 0 ? (
          <p className="empty-state">No hay historial para comparar.</p>
        ) : (
          <>
            {/* History picker */}
            <div className="compare-picker">
              {history.map((entry) => {
                const isSelected = selected.includes(entry.id)
                const isDisabled = !isSelected && selected.length >= MAX_COMPARE
                return (
                  <button
                    key={entry.id}
                    className={`compare-pick-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggle(entry.id)}
                    disabled={isDisabled}
                  >
                    <img src={entry.previews[0]} alt="" className="compare-pick-thumb" />
                    <div className="compare-pick-info">
                      <span className="compare-pick-time">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <span className="compare-pick-species">
                        {entry.result.predictions[0]?.species ?? 'Rechazado'}
                      </span>
                    </div>
                    <span className="compare-check">{isSelected ? '✓' : ''}</span>
                  </button>
                )
              })}
            </div>

            {/* Comparison grid */}
            {selectedEntries.length > 0 && (
              <div
                className="compare-grid"
                style={{ gridTemplateColumns: `repeat(${selectedEntries.length}, 1fr)` }}
              >
                {selectedEntries.map((entry) => {
                  const top = entry.result.predictions[0]
                  const confidence = top ? (top.confidence * 100).toFixed(1) : '—'
                  return (
                    <div key={entry.id} className="compare-card">
                      <img
                        src={entry.previews[0]}
                        alt={top?.species ?? 'Mushroom'}
                        className="compare-card-img"
                      />
                      <div className="compare-card-body">
                        <span
                          className={`compare-decision ${entry.result.decision}`}
                        >
                          {entry.result.decision === 'accepted' ? '✅ Aceptado' : '⚠️ Rechazado'}
                        </span>
                        <h3 className="compare-species">{top?.species ?? 'No identificado'}</h3>
                        {top?.common_name && (
                          <p className="compare-common">{top.common_name}</p>
                        )}
                        <div className="compare-confidence">
                          <div className="confidence-bar">
                            <div
                              className="confidence-fill"
                              style={{ width: `${Math.min(Number(confidence), 100)}%` }}
                            />
                          </div>
                          <span>{confidence}%</span>
                        </div>
                        {top?.edibility && (
                          <span className="compare-edibility">
                            {edibilityIcon(top.edibility)} {top.edibility}
                          </span>
                        )}
                        {onSelectEntry && (
                          <button
                            className="btn-open-entry"
                            onClick={() => onSelectEntry(entry)}
                          >
                            Ver detalle →
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}