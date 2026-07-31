/**
 * BatchCompare — side-by-side comparison of past identification results.
 * Photography-first; risk labels without emoji chrome.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClassificationResult } from '../api/types'
import { getRiskMeta } from '../lib/riskLabels'
import { IconCheck, IconClose } from './icons'
import { Button } from './ui'

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
  const { t } = useTranslation()
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

  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])

  return (
    <div
      className="batch-compare-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-compare-title"
      data-testid="batch-compare-dialog"
    >
      <div className="batch-compare-modal">
        <div className="batch-compare-header">
          <h2 id="batch-compare-title">Comparar identificaciones</h2>
          <Button
            ref={closeRef}
            type="button"
            variant="ghost"
            size="sm"
            className="btn-icon"
            onClick={onClose}
            aria-label={t('a11y.closeCompare', { defaultValue: 'Cerrar comparación' })}
            data-testid="batch-compare-close"
          >
            <IconClose size={18} />
          </Button>
        </div>
        <p className="batch-compare-hint">
          Selecciona hasta {MAX_COMPARE} resultados para comparar lado a lado.
        </p>

        {history.length === 0 ? (
          <p className="empty-state">No hay historial para comparar.</p>
        ) : (
          <>
            <div className="compare-picker">
              {history.map((entry) => {
                const isSelected = selected.includes(entry.id)
                const isDisabled = !isSelected && selected.length >= MAX_COMPARE
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`compare-pick-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggle(entry.id)}
                    disabled={isDisabled}
                  >
                    <img
                      src={entry.previews[0]}
                      alt=""
                      className="compare-pick-thumb"
                      loading="lazy"
                      decoding="async"
                      width={56}
                      height={56}
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                    <div className="compare-pick-info">
                      <span className="compare-pick-time">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                      <span className="compare-pick-species">
                        {entry.result.predictions[0]?.species ?? 'Rechazado'}
                      </span>
                    </div>
                    <span className="compare-check" aria-hidden="true">
                      {isSelected ? <IconCheck size={14} /> : null}
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedEntries.length > 0 && (
              <div
                className="compare-grid"
                style={{ gridTemplateColumns: `repeat(${selectedEntries.length}, 1fr)` }}
              >
                {selectedEntries.map((entry) => {
                  const top = entry.result.predictions[0]
                  const confidence = top ? (top.confidence * 100).toFixed(1) : '—'
                  const risk = getRiskMeta(top?.edibility)
                  return (
                    <div key={entry.id} className="compare-card">
                      <img
                        src={entry.previews[0]}
                        alt={top?.species ?? 'Seta'}
                        className="compare-card-img"
                        loading="lazy"
                        decoding="async"
                        width={280}
                        height={200}
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                      <div className="compare-card-body">
                        <span className={`compare-decision ${entry.result.decision}`}>
                          {entry.result.decision === 'accepted'
                            ? 'Pista tentativa'
                            : 'Sin ID fiable'}
                        </span>
                        <h3 className="compare-species">{top?.species ?? 'No identificado'}</h3>
                        {top?.common_name && (
                          <p className="compare-common">{top.common_name}</p>
                        )}
                        <div className="compare-confidence">
                          <div className="confidence-bar">
                            <div
                              className="confidence-fill"
                              style={{ width: `${Math.min(Number(confidence) || 0, 100)}%` }}
                            />
                          </div>
                          <span>{confidence}%</span>
                        </div>
                        {top?.edibility && (
                          <span className={`risk-chip ${risk.className}`}>{risk.label}</span>
                        )}
                        {onSelectEntry && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="btn-open-entry"
                            onClick={() => onSelectEntry(entry)}
                          >
                            {t('actions.viewDetail', { defaultValue: 'Ver detalle' })}
                          </Button>
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
