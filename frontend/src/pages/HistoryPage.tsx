/**
 * Field notebook v2 (D-10): filters by mode/date, notes/tags polish,
 * export/share local, atelier empty states, reopen observation in 2 taps.
 * LocalStorage only — no cloud sync.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, LinkButton, PageShell } from '../components/ui'
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
import {
  ensureLookalikeRiskCatalog,
  rankLookalikesForIdentify,
} from '../lib/lookalikeRisk'
import { getRiskMeta } from '../lib/riskLabels'
import {
  buildHandoffFromHistory,
  expertReviewPath,
  saveHandoffDraft,
} from '../lib/expertHandoff'
import { decisionLabelEs } from '../lib/decisionLabels'
import { scientificNameToSlug } from '../lib/slug'
import { diagnosticForLookalikeMate } from '../lib/diagnosticViews'
import {
  historyLimit,
  planLabelEs,
  sliceHistoryForPlan,
  usePlanActions,
} from '../lib/entitlements'
import {
  formatNotebookPin,
  isNotebookPin,
  listNotebookPinsFromEntries,
  notebookGeoPolicy,
  notebookPinMapHref,
  notebookPinsShareText,
  parseManualPinInput,
  requestBrowserNotebookPin,
  summarizeNotebookPins,
  type NotebookPin,
} from '../lib/notebookGeo'

const MODE_FILTERS: HistoryModeFilter[] = ['all', 'real', 'mock', 'blocked']
const DATE_FILTERS: HistoryDateFilter[] = ['all', 'today', '7d', '30d']

function speciesSlugFromTop(species: string | undefined): string | null {
  if (!species) return null
  return scientificNameToSlug(species)
}

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [tagsDraft, setTagsDraft] = useState('')
  const [modeFilter, setModeFilter] = useState<HistoryModeFilter>('all')
  const [dateFilter, setDateFilter] = useState<HistoryDateFilter>('all')
  /** Expanded observation (1st tap); detail panel is the reopen surface. */
  const [openId, setOpenId] = useState<string | null>(null)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [pinDraft, setPinDraft] = useState('')
  const [pinBusy, setPinBusy] = useState(false)
  const [pinFeedback, setPinFeedback] = useState<string | null>(null)
  const detailCloseRef = useRef<HTMLButtonElement>(null)
  const detailPanelRef = useRef<HTMLDivElement>(null)
  const lastFocusRef = useRef<HTMLElement | null>(null)

  const { plan, isPro: planPro, unlock } = usePlanActions()

  const reloadVisible = useCallback(() => {
    setEntries(sliceHistoryForPlan(loadHistory(), plan))
  }, [plan])

  useEffect(() => {
    reloadVisible()
  }, [reloadVisible])

  useEffect(() => {
    // SSOT catalog for lookalike enrichment on reopened observations
    void ensureLookalikeRiskCatalog()
  }, [])

  const summary = useMemo(() => summarizeHistory(entries), [entries])
  const needsReview = useMemo(() => entriesNeedingReview(entries), [entries])
  /** Private pin table from local notebook (not marketplace). */
  const pinList = useMemo(() => listNotebookPinsFromEntries(entries), [entries])
  const pinSummary = useMemo(() => summarizeNotebookPins(pinList), [pinList])
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

  const copyPinList = useCallback(async () => {
    const text = notebookPinsShareText(pinList, locale)
    try {
      await navigator.clipboard.writeText(text)
      setShareFeedback(
        t('notebook.pinListCopied', {
          defaultValue: 'Lista de pins copiada (coords only · sin EXIF)',
        }),
      )
    } catch {
      setShareFeedback(t('notebook.shareFailed', { defaultValue: 'No se pudo compartir' }))
    }
  }, [pinList, locale, t])

  const startEdit = (e: HistoryEntry) => {
    setEditingId(e.id)
    setNoteDraft(e.notes || '')
    setTagsDraft((e.tags || []).join(', '))
    setPinDraft(
      isNotebookPin(e.pin) ? `${e.pin.lat}, ${e.pin.lng}` : '',
    )
    setPinFeedback(null)
  }

  const saveEdit = (id: string) => {
    let pin: NotebookPin | null | undefined = undefined
    const raw = pinDraft.trim()
    if (raw === '') {
      pin = null
    } else {
      const parsed = parseManualPinInput(raw)
      if (!parsed) {
        setPinFeedback(
          t('notebook.pinInvalid', {
            defaultValue: 'Coordenadas no válidas (ej. 41.12, -2.55). Sin EXIF.',
          }),
        )
        return
      }
      pin = parsed
    }
    const next = saveNotebookFields(id, {
      notes: noteDraft,
      tags: parseTagsInput(tagsDraft),
      pin,
    })
    // Re-apply Free/Pro UI depth — store may hold up to MAX_HISTORY
    setEntries(sliceHistoryForPlan(next, plan))
    setEditingId(null)
    setPinFeedback(null)
  }

  const attachGpsPin = async (id: string) => {
    setPinBusy(true)
    setPinFeedback(null)
    try {
      const pin = await requestBrowserNotebookPin()
      if (!pin) {
        setPinFeedback(
          t('notebook.pinGpsFail', {
            defaultValue:
              'No se pudo obtener GPS (permiso denegado o no disponible). Solo local, sin EXIF.',
          }),
        )
        return
      }
      const next = saveNotebookFields(id, { pin })
      setEntries(sliceHistoryForPlan(next, plan))
      setPinDraft(`${pin.lat}, ${pin.lng}`)
      setPinFeedback(
        t('notebook.pinGpsOk', {
          defaultValue: 'Pin GPS guardado en local (coords only · sin EXIF).',
        }),
      )
    } finally {
      setPinBusy(false)
    }
  }

  const clearPin = (id: string) => {
    const next = saveNotebookFields(id, { pin: null })
    setEntries(sliceHistoryForPlan(next, plan))
    setPinDraft('')
    setPinFeedback(
      t('notebook.pinCleared', { defaultValue: 'Pin eliminado del cuaderno local.' }),
    )
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
    <PageShell
      className="page-history page-atelier-shell"
      testId="history-page"
      orientationSticky
      orientationText={t('notebook.orientation', {
        defaultValue: 'Solo orientación · nunca consumo',
      })}
    >
      <div className="page-header">
        <p className="atelier-kicker" data-testid="history-plan-chip">
          Plan {planLabelEs(plan)} · hasta {historyLimit(plan)} entradas
          {!planPro && (
            <>
              {' · '}
              <Button
                type="button"
                variant="ghost"
                onClick={() => unlock()}
                data-testid="history-unlock-pro"
              >
                Ampliar con Pro
              </Button>
            </>
          )}
        </p>
        <h1 className="page-title">
          {t('notebook.title', { defaultValue: 'Cuaderno de Campo' })}
        </h1>
        <p className="page-subtitle">
          {t('notebook.subtitle', {
            defaultValue:
              'Tus registros de campo. Historial local con notas y etiquetas. Solo orientación — no es un diario de consumo.',
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

      {pinList.length > 0 && (
        <section
          className="notebook-pin-list atelier-panel"
          data-testid="notebook-pin-list"
          aria-label={t('notebook.pinListAria', {
            defaultValue: 'Tabla local de pins privados',
          })}
        >
          <header className="notebook-pin-list__header">
            <div>
              <h2 className="notebook-pin-list__title">
                {t('notebook.pinListTitle', {
                  defaultValue: 'Pins de mapa (local)',
                })}
              </h2>
              <p className="notebook-pin-list__policy" role="note">
                {t('notebook.pinListPolicy', {
                  defaultValue: notebookGeoPolicy(locale),
                })}
              </p>
              <p className="notebook-pin-list__stats" data-testid="notebook-pin-list-stats">
                {t('notebook.pinListStats', {
                  total: pinSummary.total,
                  gps: pinSummary.gps,
                  manual: pinSummary.manual,
                  defaultValue:
                    '{{total}} pin(s) · {{gps}} GPS · {{manual}} manual · no marketplace',
                })}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              data-testid="notebook-pin-list-copy"
              onClick={() => void copyPinList()}
            >
              {t('notebook.pinListCopy', {
                defaultValue: 'Copiar lista',
              })}
            </Button>
          </header>
          <ul className="notebook-pin-list__rows">
            {pinList.map((row) => (
              <li
                key={row.entryId}
                className="notebook-pin-list__row"
                data-testid="notebook-pin-list-row"
                data-entry-id={row.entryId}
              >
                <div className="notebook-pin-list__main">
                  <span className="notebook-pin-list__species">
                    {row.speciesHint ||
                      t('notebook.pinListUnknownSpecies', {
                        defaultValue: 'Sin especie (orientación)',
                      })}
                  </span>
                  <span className="notebook-pin-list__coords">
                    {formatNotebookPin(row.pin, locale)}
                  </span>
                  <span
                    className={`notebook-pin-list__source notebook-pin-list__source--${row.source}`}
                  >
                    {row.source === 'gps'
                      ? t('notebook.pinSourceGps', { defaultValue: 'GPS' })
                      : t('notebook.pinSourceManual', { defaultValue: 'Manual' })}
                  </span>
                </div>
                <div className="notebook-pin-list__actions">
                  <Button
                    type="button"
                    variant="ghost"
                    data-testid="notebook-pin-list-open"
                    onClick={() => openObservation(row.entryId)}
                  >
                    {t('notebook.pinListOpen', { defaultValue: 'Abrir' })}
                  </Button>
                  <a
                    className="notebook-pin-list__map-link"
                    href={notebookPinMapHref(row.pin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="notebook-pin-list-map"
                  >
                    {t('notebook.pinListMap', { defaultValue: 'OSM' })}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="history-header atelier-section-bar history-header--toolbar">
        <h2>{t('notebook.recentTitle', { defaultValue: 'Entradas recientes' })}</h2>
        <div className="history-actions history-actions--stacked">
          <LinkButton to="/identificar" variant="primary">
            {t('notebook.newId', { defaultValue: 'Nueva identificación' })}
          </LinkButton>
          {entries.length > 0 && (
            <details className="history-more-menu">
              <summary className="history-more-menu__summary">
                {t('actions.more', { defaultValue: 'Más' })}
              </summary>
              <div className="history-more-menu__panel" role="menu">
                <button
                  type="button"
                  className="history-more-menu__item"
                  role="menuitem"
                  onClick={shareLocal}
                >
                  {t('actions.share', { defaultValue: 'Compartir' })}
                </button>
                <button
                  type="button"
                  className="history-more-menu__item"
                  role="menuitem"
                  onClick={exportJson}
                >
                  {t('notebook.exportJson', { defaultValue: 'Exportar JSON' })}
                </button>
                <button
                  type="button"
                  className="history-more-menu__item history-more-menu__item--danger"
                  role="menuitem"
                  onClick={clear}
                >
                  {t('notebook.clear', { defaultValue: 'Limpiar historial' })}
                </button>
              </div>
            </details>
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
        <div className="notebook-empty" data-testid="notebook-empty">
          <EmptyState
            title={t('notebook.emptyTitle', { defaultValue: 'Sin observaciones aún' })}
            description={t('notebook.emptyBody', {
              defaultValue:
                'Identifica una seta y quedará guardada aquí con espacio para notas de campo. Solo orientación — nunca consumo.',
            })}
            actionLabel={t('notebook.emptyAction', { defaultValue: 'Identificar seta' })}
            actionTo="/identificar"
          />
          <p className="notebook-empty__hint muted">
            {t('notebook.emptyHint', {
              defaultValue: 'Tip: multi-vista (láminas + perfil) baja confusiones en el campo.',
            })}
          </p>
        </div>
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
        <div className="history-card-grid history-card-grid--dense" data-testid="history-card-grid">
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
              <Button
                ref={detailCloseRef}
                type="button"
                variant="ghost"
                onClick={closeObservation}
              >
                {t('actions.back', { defaultValue: 'Cerrar' })}
              </Button>
            </div>

            {(() => {
              const e = openEntry
              const top = e.result.predictions?.[0]
              const predTaxa = (e.result.predictions || [])
                .slice(0, 2)
                .map((p) => p.species)
                .filter(Boolean)
              const look = rankLookalikesForIdentify(e.result.dangerous_lookalikes, predTaxa)
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

                  {/* Private geo pin — local only, EXIF stripped */}
                  <section
                    className="notebook-pin-block"
                    data-testid="notebook-pin-block"
                    aria-label={t('notebook.pinAria', {
                      defaultValue: 'Pin de mapa privado',
                    })}
                  >
                    <p className="notebook-pin-block__policy" role="note">
                      {t('notebook.pinPolicy', {
                        defaultValue: notebookGeoPolicy(locale),
                      })}
                    </p>
                    {isNotebookPin(e.pin) && !isEditing ? (
                      <p className="notebook-pin-block__coords" data-testid="notebook-pin-coords">
                        <strong>
                          {t('notebook.pinLabel', { defaultValue: 'Pin local' })}
                        </strong>
                        {': '}
                        {formatNotebookPin(e.pin, locale)}
                        {' · '}
                        <a
                          href={notebookPinMapHref(e.pin)}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid="notebook-pin-map-link"
                        >
                          {t('notebook.pinOpenMap', { defaultValue: 'Abrir mapa' })}
                        </a>
                        {' · '}
                        <Button
                          type="button"
                          variant="ghost"
                          data-testid="notebook-pin-clear"
                          onClick={() => clearPin(e.id)}
                        >
                          {t('notebook.pinClear', { defaultValue: 'Quitar pin' })}
                        </Button>
                      </p>
                    ) : null}
                    {isEditing ? (
                      <div className="notebook-pin-block__edit">
                        <label className="notebook-pin-block__label" htmlFor="notebook-pin-input">
                          {t('notebook.pinManual', {
                            defaultValue: 'Coords (lat, lng) — sin EXIF',
                          })}
                        </label>
                        <input
                          id="notebook-pin-input"
                          type="text"
                          className="notebook-pin-block__input"
                          data-testid="notebook-pin-input"
                          value={pinDraft}
                          onChange={(ev) => setPinDraft(ev.target.value)}
                          placeholder="41.12, -2.55"
                          autoComplete="off"
                        />
                      </div>
                    ) : (
                      <div className="notebook-pin-block__actions">
                        <Button
                          type="button"
                          variant="ghost"
                          data-testid="notebook-pin-gps"
                          disabled={pinBusy}
                          onClick={() => void attachGpsPin(e.id)}
                        >
                          {pinBusy
                            ? t('notebook.pinGpsBusy', { defaultValue: 'GPS…' })
                            : t('notebook.pinGps', {
                                defaultValue: 'Añadir pin GPS (local)',
                              })}
                        </Button>
                      </div>
                    )}
                    {pinFeedback ? (
                      <p className="notebook-pin-block__feedback" role="status">
                        {pinFeedback}
                      </p>
                    ) : null}
                  </section>

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
                        <Button type="button" variant="primary" onClick={() => saveEdit(e.id)}>
                          {t('notebook.save', { defaultValue: 'Guardar' })}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                          {t('notebook.cancel', { defaultValue: 'Cancelar' })}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="notebook-detail-actions">
                      <Button type="button" variant="primary" onClick={() => startEdit(e)}>
                        {t('notebook.editNotes', { defaultValue: 'Notas y etiquetas' })}
                      </Button>
                      {slug && (
                        <LinkButton to={`/enciclopedia/${slug}`} variant="ghost">
                          {t('notebook.viewSpecies', { defaultValue: 'Ver ficha' })}
                        </LinkButton>
                      )}
                      <Button type="button" variant="ghost" onClick={() => handoff(e)}>
                        {t('notebook.handoff', { defaultValue: 'Handoff experto' })}
                      </Button>
                      <LinkButton to="/identificar" variant="ghost">
                        {t('notebook.newId', { defaultValue: 'Nueva identificación' })}
                      </LinkButton>
                    </div>
                  )}

                  {look.length > 0 && (
                    <div
                      className="notebook-detail-lookalikes"
                      data-testid="notebook-lookalikes"
                    >
                      <p className="notebook-detail-lookalikes__title">
                        {t('notebook.lookalikesTitle', {
                          defaultValue: 'Confusiones de riesgo',
                        })}
                      </p>
                      <ul className="lookalike-list lookalike-list--notebook">
                        {look.slice(0, 4).map((sp) => {
                          const meta = getRiskMeta(sp.risk_label)
                          const pairDiag = diagnosticForLookalikeMate(
                            predTaxa,
                            sp.name,
                          )
                          return (
                            <li
                              key={sp.name}
                              className={`lookalike-item ${meta.className}`}
                              data-testid={`notebook-lookalike-${sp.slug || sp.name}`}
                              data-pair-id={pairDiag?.pair_id || undefined}
                            >
                              <div className="lookalike-item__text">
                                <RiskChip
                                  risk={sp.risk_label}
                                  label={
                                    sp === look[0]
                                      ? `Confusión: ${meta.label}`
                                      : meta.label
                                  }
                                />
                                <SpeciesNameBlock
                                  taxon={sp.name}
                                  commonNames={sp.common_names}
                                  size="sm"
                                  showFamily={false}
                                />
                                {sp.slug ? (
                                  <Link
                                    to={`/enciclopedia/${sp.slug}`}
                                    className="lookalike-link"
                                  >
                                    {t('notebook.viewSpecies', {
                                      defaultValue: 'Ver ficha',
                                    })}
                                  </Link>
                                ) : null}
                                {pairDiag && pairDiag.critical_views.length > 0 && (
                                  <div
                                    className="lookalike-item__diag"
                                    data-testid={`notebook-lookalike-diag-${pairDiag.pair_id}`}
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
                                        defaultValue:
                                          'Vistas diagnósticas para esta confusión',
                                      })}
                                    >
                                      <span className="lookalike-item__diag-label">
                                        {t('result.pairCriticalViews', {
                                          defaultValue: 'Vistas que discriminan:',
                                        })}
                                      </span>
                                      {pairDiag.critical_views.map((view) => (
                                        <span
                                          key={view}
                                          className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                                          data-testid={`notebook-diag-view-${view}`}
                                          data-slot={view}
                                        >
                                          {t(`identify.views.${view}`, {
                                            defaultValue: view,
                                          })}
                                        </span>
                                      ))}
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
                    </div>
                  )}
                  {e.result.recommend_human_review && (
                    <p>
                      <Button type="button" variant="primary" onClick={() => handoff(e)}>
                        {t('notebook.requestReview', {
                          defaultValue: 'Empaquetar para revisión experta',
                        })}
                      </Button>
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
    </PageShell>
  )
}
