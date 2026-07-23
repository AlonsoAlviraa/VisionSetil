/**
 * Field notebook v2 (D-10): filters by mode/date, notes/tags polish,
 * export/share local, atelier empty states, reopen observation in 2 taps.
 * LocalStorage only — no cloud sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  clearHistoryStore,
  entriesNeedingReview,
  entryMode,
  exportHistoryJson,
  filterHistoryByDate,
  filterHistoryEntries,
  historyDateLabelEs,
  historyModeLabelEs,
  loadHistory,
  parseTagsInput,
  saveNotebookFields,
  shareHistoryText,
  summarizeHistory,
  type HistoryDateFilter,
  type HistoryEntry,
  type HistoryModeFilter,
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
import { scientificNameToSlug } from '../lib/slug'

const MODE_FILTERS: HistoryModeFilter[] = ['all', 'real', 'mock', 'blocked']
const DATE_FILTERS: HistoryDateFilter[] = ['all', 'today', '7d', '30d']

function speciesSlugFromTop(species: string | undefined): string | null {
  if (!species) return null
  return scientificNameToSlug(species)
}

export function HistoryPage() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [modeFilter, setModeFilter] = useState<HistoryModeFilter>('all')
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>('all')
  /** Expanded observation (1st tap); detail panel is the reopen surface. */
  const [openId, setOpenId] = useState<string | null>(null)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const detailCloseRef = useRef<HTMLButtonElement>(null)
  const detailPanelRef = useRef<HTMLDivElement>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setEntries(loadHistory())
  }, [])

  const summary = useMemo(() => summarizeHistory(entries), [entries])
  const needsReview = useMemo(() => entriesNeedingReview(entries), [entries])
  /** Mode chip counts respect active date window (issue 7). */
  const datedForCounts = useMemo(
    () => filterHistoryByDate(entries, dateFilter),
    [entries, dateFilter],
  )
  const visible = useMemo(
    () => filterHistoryEntries(entries, { mode: modeFilter, date: dateFilter }),
    [entries, modeFilter, dateFilter],
  )
  /**
   * Export/share both use the active filter set (issue 6).
   * When filters are default (all/all), this is the full store via `visible`.
   */
  const exportable = visible
  const openEntry = useMemo(
    () => (openId ? visible.find((e) => e.id === openId) ?? entries.find((e) => e.id === openId) : null),
    [openId, visible, entries],
  )

  const modeLabel = useCallback(
    (m: HistoryModeFilter) =>
      t(`notebook.mode.${m}`, { defaultValue: historyModeLabelEs(m) }),
    [t],
  )
  const dateLabel = useCallback(
    (d: HistoryDateFilter) => t(`notebook.date.${d}`, { defaultValue: historyDateLabelEs(d) }),
    [t],
  )

  const clear = () => {
    const ok = window.confirm(
      t('notebook.clearConfirm', {
        defaultValue:
          '¿Borrar todo el cuaderno local? Esta acción no se puede deshacer.',
      }),
    )
    if (!ok) return
    clearHistoryStore()
    setEntries([])
    setOpenId(null)
    setEditingId(null)
  }

  const exportJson = () => {
    const json = exportHistoryJson(exportable)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `visionsetil-notebook-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const shareLocal = useCallback(async () => {
    const text = shareHistoryText(exportable)
    setShareFeedback(null)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: t('notebook.shareTitle', { defaultValue: 'Cuaderno VisionSetil' }),
          text,
        })
        setShareFeedback(t('notebook.shareDone', { defaultValue: 'Compartido' }))
        return
      }
    } catch {
      /* user cancelled or share failed — fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(text)
      setShareFeedback(t('notebook.shareCopied', { defaultValue: 'Resumen copiado' }))
    } catch {
      setShareFeedback(t('notebook.shareFailed', { defaultValue: 'No se pudo compartir' }))
    }
  }, [exportable, t])

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

  const modeCount = (m: HistoryModeFilter): number => {
    if (m === 'all') return datedForCounts.length
    return datedForCounts.filter((e) => entryMode(e) === m).length
  }

  /** Tap 1: open observation detail. */
  const openObservation = (id: string) => {
    lastFocusRef.current = document.activeElement as HTMLElement | null
    setOpenId(id)
    setEditingId(null)
  }

  const closeObservation = useCallback(() => {
    setOpenId(null)
    setEditingId(null)
    const el = lastFocusRef.current
    lastFocusRef.current = null
    if (el && typeof el.focus === 'function') {
      requestAnimationFrame(() => el.focus())
    }
  }, [])

  // Detail dialog: Escape, initial focus, light focus trap (issue 3).
  // Depend only on openId — not openEntry — so saving notes does not re-focus Close.
  useEffect(() => {
    if (!openId) return
    const focusClose = () => detailCloseRef.current?.focus()
    // defer so dialog is mounted
    const tFocus = window.setTimeout(focusClose, 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeObservation()
        return
      }
      if (e.key !== 'Tab') return
      const panel = detailPanelRef.current
      if (!panel) return
      const nodes = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      )
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(tFocus)
      window.removeEventListener('keydown', onKey)
    }
  }, [openId, closeObservation])

  return (
    <div className="page-history page-atelier-shell">
      <div className="page-header">
        <h1 className="page-title">
          {t('notebook.title', { defaultValue: 'Cuaderno de campo' })}
        </h1>
        <p className="page-subtitle">
          {t('notebook.subtitle', {
            defaultValue:
              'Historial local con notas y etiquetas. Solo orientación — no es un diario de consumo.',
          })}
        </p>
      </div>

      <div className="atelier-stat-row">
        <div className="atelier-stat-card">
          <strong>{summary.total}</strong>
          <span>{t('notebook.statTotal', { defaultValue: 'Total' })}</span>
        </div>
        <div className="atelier-stat-card">
          <strong>{summary.accepted}</strong>
          <span>{t('notebook.statHints', { defaultValue: 'Pistas tentativas' })}</span>
        </div>
        <div className="atelier-stat-card">
          <strong>{summary.rejected}</strong>
          <span>{t('notebook.statRejected', { defaultValue: 'Sin ID fiable' })}</span>
        </div>
        <div className="atelier-stat-card">
          <strong>{summary.need_review}</strong>
          <span>{t('notebook.statReview', { defaultValue: 'Para revisión' })}</span>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div className="review-callout atelier-callout" style={{ marginTop: '1.25rem' }}>
          <strong>
            {t('notebook.reviewCallout', {
              count: needsReview.length,
              defaultValue: '{{count}} caso(s) merecen revisión experta',
            })}
          </strong>
          <p>
            {t('notebook.reviewBody', {
              defaultValue: 'Rechazos, lookalikes de riesgo o bandera de human-review.',
            })}{' '}
            <Link to="/revision-experta">
              {t('notebook.reviewLink', { defaultValue: 'Ir a revisión experta' })}
            </Link>
          </p>
        </div>
      )}

      <div className="history-header atelier-section-bar">
        <h2>{t('notebook.recentTitle', { defaultValue: 'Entradas recientes' })}</h2>
        <div className="history-actions">
          <Link to="/identificar" className="btn-atelier btn-atelier--primary">
            {t('notebook.newId', { defaultValue: 'Nueva identificación' })}
          </Link>
          {entries.length > 0 && (
            <button type="button" className="btn-atelier btn-atelier--ghost" onClick={shareLocal}>
              {t('actions.share', { defaultValue: 'Compartir' })}
            </button>
          )}
          {entries.length > 0 && (
            <button type="button" className="btn-atelier btn-atelier--ghost" onClick={exportJson}>
              {t('notebook.exportJson', { defaultValue: 'Exportar JSON' })}
            </button>
          )}
          {entries.length > 0 && (
            <button type="button" className="btn-atelier btn-atelier--ghost" onClick={clear}>
              {t('notebook.clear', { defaultValue: 'Limpiar historial' })}
            </button>
          )}
        </div>
      </div>
      {shareFeedback && (
        <p className="notebook-share-feedback" role="status">
          {shareFeedback}
        </p>
      )}

      {entries.length > 0 && (
        <div className="history-filters">
          <div
            className="history-mode-filter"
            role="group"
            aria-label={t('notebook.filterModeAria', {
              defaultValue: 'Filtrar por modo de identificación',
            })}
          >
            {MODE_FILTERS.map((m) => (
              <button
                key={m}
                type="button"
                className={`history-mode-filter__btn${modeFilter === m ? ' is-active' : ''}`}
                aria-pressed={modeFilter === m}
                onClick={() => setModeFilter(m)}
              >
                {modeLabel(m)}
                <span className="history-mode-filter__count">{modeCount(m)}</span>
              </button>
            ))}
          </div>
          <div
            className="history-mode-filter history-date-filter"
            role="group"
            aria-label={t('notebook.filterDateAria', { defaultValue: 'Filtrar por fecha' })}
          >
            {DATE_FILTERS.map((d) => (
              <button
                key={d}
                type="button"
                className={`history-mode-filter__btn${dateFilter === d ? ' is-active' : ''}`}
                aria-pressed={dateFilter === d}
                onClick={() => setDateFilter(d)}
              >
                {dateLabel(d)}
              </button>
            ))}
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          title={t('notebook.emptyTitle', { defaultValue: 'Sin observaciones aún' })}
          description={t('notebook.emptyBody', {
            defaultValue:
              'Identifica una seta y quedará guardada aquí con espacio para notas de campo.',
          })}
          actionLabel={t('notebook.emptyAction', { defaultValue: 'Identificar seta' })}
          actionTo="/identificar"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title={t('notebook.emptyFilterTitle', { defaultValue: 'Sin entradas con estos filtros' })}
          description={t('notebook.emptyFilterBody', {
            mode: modeLabel(modeFilter),
            date: dateLabel(dateFilter),
            defaultValue:
              'No hay observaciones con modo «{{mode}}» y fecha «{{date}}». Prueba otros filtros.',
          })}
          actionLabel={t('notebook.emptyFilterAction', { defaultValue: 'Ver todas' })}
          onAction={() => {
            setModeFilter('all')
            setDateFilter('all')
          }}
        />
      ) : (
        <div className="history-card-grid">
          {visible.map((e) => {
            const top = e.result.predictions?.[0]
            const mode = entryMode(e)
            const isOpen = openId === e.id
            return (
              <article
                key={e.id}
                className={`history-card-atelier${isOpen ? ' is-open' : ''}`}
                data-testid="history-card"
                data-open={isOpen ? '1' : '0'}
              >
                <button
                  type="button"
                  className="history-card-atelier__hit"
                  onClick={() => openObservation(e.id)}
                  aria-expanded={isOpen}
                  aria-controls={`history-detail-${e.id}`}
                >
                  {e.previews[0] && (
                    <PhotoFrame
                      src={e.previews[0]}
                      alt=""
                      ratio="4/3"
                      className="history-card-atelier__photo"
                    />
                  )}
                  <div className="history-card-atelier__body history-card-atelier__body--compact">
                    <p className="history-card-atelier__time">
                      {new Date(e.timestamp).toLocaleString()}
                    </p>
                    <p className="history-card-atelier__meta">
                      <span className={`history-mode-chip history-mode-chip--${mode}`}>
                        {modeLabel(mode)}
                      </span>
                      {e.locale ? (
                        <span className="history-card-atelier__locale">
                          {e.locale.toUpperCase()}
                        </span>
                      ) : null}
                    </p>
                    <p className="history-card-atelier__decision">
                      {t('notebook.resultLabel', { defaultValue: 'Resultado' })}:{' '}
                      <strong>{decisionLabelEs(e.result.decision)}</strong>
                    </p>
                    {top && (
                      <SpeciesNameBlock
                        taxon={top.species}
                        commonNames={top.common_name}
                        size="sm"
                      />
                    )}
                    {(e.tags?.length ?? 0) > 0 && (
                      <p className="history-card-atelier__tags">
                        {e.tags!.slice(0, 4).map((tag) => (
                          <span key={tag} className="notebook-tag">
                            {tag}
                          </span>
                        ))}
                        {e.tags!.length > 4 ? (
                          <span className="notebook-tag notebook-tag--more">
                            +{e.tags!.length - 4}
                          </span>
                        ) : null}
                      </p>
                    )}
                    <span className="history-card-atelier__open-cue">
                      {t('notebook.openCue', { defaultValue: 'Abrir observación' })}
                    </span>
                  </div>
                </button>
              </article>
            )
          })}
        </div>
      )}

      {/* Detail panel — 2nd surface after tap; primary reopen UX */}
      {openEntry && (
        <div
          className="notebook-detail-backdrop"
          role="presentation"
          onClick={closeObservation}
        >
          <div
            ref={detailPanelRef}
            className="notebook-detail-panel"
            id={`history-detail-${openEntry.id}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notebook-detail-title"
            onClick={(ev) => ev.stopPropagation()}
            data-testid="notebook-detail"
          >
            <div className="notebook-detail-panel__head">
              <h2 id="notebook-detail-title">
                {t('notebook.detailTitle', { defaultValue: 'Observación' })}
              </h2>
              <button
                ref={detailCloseRef}
                type="button"
                className="btn-atelier btn-atelier--ghost"
                onClick={closeObservation}
              >
                {t('actions.back', { defaultValue: 'Cerrar' })}
              </button>
            </div>

            {(() => {
              const e = openEntry
              const top = e.result.predictions?.[0]
              const look = rankLookalikes(e.result.dangerous_lookalikes || [])
              const topRisk = look[0] ? getRiskMeta(look[0].risk_label) : null
              const isEditing = editingId === e.id
              const mode = entryMode(e)
              const gate = e.gate_summary
              const slug = speciesSlugFromTop(top?.species)
              return (
                <div className="notebook-detail-panel__body">
                  {e.previews[0] && (
                    <PhotoFrame
                      src={e.previews[0]}
                      alt=""
                      ratio="4/3"
                      className="notebook-detail-panel__photo"
                    />
                  )}
                  <p className="history-card-atelier__time">
                    {new Date(e.timestamp).toLocaleString()}
                  </p>
                  <p className="history-card-atelier__meta">
                    <span className={`history-mode-chip history-mode-chip--${mode}`}>
                      {modeLabel(mode)}
                    </span>
                    {e.locale ? (
                      <span className="history-card-atelier__locale">
                        {e.locale.toUpperCase()}
                      </span>
                    ) : null}
                  </p>
                  <p className="history-card-atelier__decision">
                    {t('notebook.resultLabel', { defaultValue: 'Resultado' })}:{' '}
                    <strong>{decisionLabelEs(e.result.decision)}</strong>
                  </p>
                  {gate && (
                    <p className="history-card-atelier__gate">
                      {t('notebook.gate.label', { defaultValue: 'Gate' })}:{' '}
                      {gate.metrics_acceptable
                        ? t('notebook.gate.metricsOk', { defaultValue: 'métricas OK' })
                        : t('notebook.gate.metricsLow', { defaultValue: 'métricas bajas' })}
                      {' · '}
                      {t('notebook.gate.id', { defaultValue: 'ID' })}{' '}
                      {gate.species_id_allowed
                        ? t('notebook.gate.idAllowed', { defaultValue: 'permitido' })
                        : t('notebook.gate.idBlocked', { defaultValue: 'bloqueado' })}
                      {gate.reason_code ? ` (${gate.reason_code})` : ''}
                    </p>
                  )}
                  {top && (
                    <SpeciesNameBlock
                      taxon={top.species}
                      commonNames={top.common_name}
                      size="sm"
                    />
                  )}
                  {top && (
                    <p className="history-card-atelier__conf">
                      {(top.confidence * 100).toFixed(1)}%{' '}
                      {t('notebook.confidence', { defaultValue: 'confianza' })}
                    </p>
                  )}
                  {e.view_types && e.view_types.length > 0 && (
                    <p className="history-card-atelier__views">
                      {t('notebook.views', { defaultValue: 'Vistas' })}:{' '}
                      {e.view_types.join(', ')}
                    </p>
                  )}

                  {(e.tags?.length ?? 0) > 0 && !isEditing && (
                    <p className="history-card-atelier__tags">
                      {e.tags!.map((tag) => (
                        <span key={tag} className="notebook-tag">
                          {tag}
                        </span>
                      ))}
                    </p>
                  )}
                  {e.notes && !isEditing && (
                    <p className="history-card-atelier__notes notebook-detail-notes">
                      {e.notes}
                    </p>
                  )}

                  {isEditing ? (
                    <div className="notebook-edit">
                      <label>
                        {t('notebook.notesLabel', { defaultValue: 'Notas de campo' })}
                        <textarea
                          value={noteDraft}
                          onChange={(ev) => setNoteDraft(ev.target.value)}
                          rows={3}
                          maxLength={2000}
                          placeholder={t('notebook.notesPlaceholder', {
                            defaultValue:
                              'Hábitat, olor, árbol cercano… (sin consejos de consumo)',
                          })}
                        />
                      </label>
                      <label>
                        {t('notebook.tagsLabel', { defaultValue: 'Etiquetas (coma)' })}
                        <input
                          value={tagsDraft}
                          onChange={(ev) => setTagsDraft(ev.target.value)}
                          placeholder={t('notebook.tagsPlaceholder', {
                            defaultValue: 'pinar, otoño, dudosa',
                          })}
                        />
                      </label>
                      <div className="identify-mode-toggle">
                        <button
                          type="button"
                          className="btn-atelier btn-atelier--primary"
                          onClick={() => saveEdit(e.id)}
                        >
                          {t('notebook.save', { defaultValue: 'Guardar' })}
                        </button>
                        <button
                          type="button"
                          className="btn-atelier btn-atelier--ghost"
                          onClick={() => setEditingId(null)}
                        >
                          {t('notebook.cancel', { defaultValue: 'Cancelar' })}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="notebook-detail-actions">
                      <button
                        type="button"
                        className="btn-atelier btn-atelier--primary"
                        onClick={() => startEdit(e)}
                      >
                        {t('notebook.editNotes', { defaultValue: 'Notas y etiquetas' })}
                      </button>
                      {slug && (
                        <Link
                          to={`/enciclopedia/${slug}`}
                          className="btn-atelier btn-atelier--ghost"
                        >
                          {t('notebook.viewSpecies', { defaultValue: 'Ver ficha' })}
                        </Link>
                      )}
                      <button
                        type="button"
                        className="btn-atelier btn-atelier--ghost"
                        onClick={() => handoff(e)}
                      >
                        {t('notebook.handoff', { defaultValue: 'Handoff experto' })}
                      </button>
                      <Link to="/identificar" className="btn-atelier btn-atelier--ghost">
                        {t('notebook.newId', { defaultValue: 'Nueva identificación' })}
                      </Link>
                    </div>
                  )}

                  {topRisk && (
                    <RiskChip
                      risk={look[0]?.risk_label}
                      label={`Lookalike: ${topRisk.label}`}
                    />
                  )}
                  {e.result.recommend_human_review && (
                    <p>
                      <Link to="/revision-experta">
                        {t('notebook.requestReview', {
                          defaultValue: 'Solicitar revisión experta',
                        })}
                      </Link>
                    </p>
                  )}
                  <p className="notebook-detail-disclaimer">
                    {t('notebook.detailDisclaimer', {
                      defaultValue:
                        'Solo orientación local. No autoriza consumo ni certifica la identificación.',
                    })}
                  </p>
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
