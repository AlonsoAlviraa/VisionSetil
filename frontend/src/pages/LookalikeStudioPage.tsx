/**
 * Lookalike Studio — classic confusions + side-by-side compare.
 * Photography-first, risk-honest (RiskChip only), one-tap classic pairs.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, LinkButton, PageShell } from '../components/ui'
import { recordStudyActivity } from '../lib/studyBadges'
import {
  addToStudioSelection,
  availableClassicPairs,
  buildCompareRows,
  canCompare,
  loadClassicPair,
  LOOKALIKE_STUDIO_MAX,
  LOOKALIKE_STUDIO_MIN,
  removeFromStudioSelection,
  suggestStudioPeers,
  type ClassicLookalikePair,
  type StudioTaxonCard,
} from '../lib/lookalikeStudio'
import { searchCatalogRanked } from '../lib/catalogSearch'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { getRiskMeta } from '../lib/riskLabels'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { commonsForLocale, displayCommonName } from '../data/speciesCatalog'
import { RiskChip } from '../components/RiskChip'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { EmptyState } from '../components/EmptyState'
import { IconSearch, IconMushroom } from '../components/icons'
import {
  diagnosticForLookalikeMate,
  findDiagnosticPair,
} from '../lib/diagnosticViews'

export function LookalikeStudioPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const { catalog: speciesCatalog, loading: catalogLoading } = useSpeciesCatalog()
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<StudioTaxonCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const [activePairId, setActivePairId] = useState<string | null>(null)

  const rows = useMemo(() => buildCompareRows(selection), [selection])
  const classics = useMemo(() => {
    if (catalogLoading || speciesCatalog.length === 0) return []
    return availableClassicPairs()
  }, [catalogLoading, speciesCatalog.length])

  /** Pair-specific critical_views for current studio selection (educational). */
  const selectionDiag = useMemo(() => {
    if (selection.length < 2) return null
    const a = selection[0].taxon
    const b = selection[1].taxon
    const direct = findDiagnosticPair(a, b)
    if (direct) return direct
    // Try reverse + third taxon mates against first
    for (let i = 1; i < selection.length; i++) {
      const hit =
        findDiagnosticPair(a, selection[i].taxon) ||
        diagnosticForLookalikeMate([a], selection[i].taxon)
      if (hit) return hit
    }
    return null
  }, [selection])

  // Study badge: once per page visit when a valid compare is ready (local, privacy-first)
  const lookalikeCounted = useRef(false)
  useEffect(() => {
    if (lookalikeCounted.current) return
    if (!canCompare(selection)) return
    lookalikeCounted.current = true
    recordStudyActivity('lookalike')
  }, [selection])

  const suggestions = useMemo(() => {
    if (catalogLoading || speciesCatalog.length === 0) return []
    if (selection.length === 0) return suggestStudioPeers('Amanita phalloides', 8)
    return suggestStudioPeers(selection[0].taxon, 8)
  }, [selection, catalogLoading, speciesCatalog.length])

  const typeahead = useMemo(() => {
    const q = query.trim()
    if (q.length < 2 || speciesCatalog.length === 0) return []
    return searchCatalogRanked(speciesCatalog, {
      query: q,
      limit: 8,
      boostHighRisk: true,
    }).filter((s) => !selection.some((x) => x.taxon === s.taxon))
  }, [query, selection, speciesCatalog])

  const add = (q: string) => {
    const { selection: next, error: err } = addToStudioSelection(selection, q)
    setSelection(next)
    setError(err)
    setActivePairId(null)
    if (!err) {
      setQuery('')
      // Keep focus state ready for next search (same pattern as Setadle).
      setFocused(true)
    }
  }

  const loadPair = (pair: ClassicLookalikePair) => {
    const { selection: next, missing } = loadClassicPair(pair)
    setSelection(next)
    setActivePairId(pair.id)
    setError(
      missing.length
        ? t('lookalike.pairPartial', {
            defaultValue: 'Par cargado (faltan en catálogo: {{names}})',
            names: missing.join(', '),
          })
        : null,
    )
    setQuery('')
  }

  const slots = Array.from({ length: LOOKALIKE_STUDIO_MAX }, (_, i) => selection[i] ?? null)

  return (
    <PageShell
      className="page-lookalike page-atelier-shell lookalike-atelier"
      testId="lookalike-studio-page"
      orientationSticky
      orientationText={t('lookalike.orientation', {
        defaultValue: 'Solo orientación · nunca consumo',
      })}
    >
      <header className="mkt-page-head mkt-mesh lookalike-hero">
        <p className="mkt-kicker">
          {t('lookalike.kicker', { defaultValue: 'Educación · Confusiones peligrosas' })}
        </p>
        <h1>
          {t('lookalike.studioTitle', { defaultValue: 'Estudio de confusiones' })}
        </h1>
        <p className="lookalike-hero__lead">
          {t('lookalike.studioSubtitleShort', {
            defaultValue:
              'Compara confusiones clásicas lado a lado. Diferencias críticas en cada ficha. Solo orientación — nunca consumo.',
          })}
        </p>
        <div
          className="lookalike-progress"
          aria-label={t('lookalike.progressAria', {
            defaultValue: 'Progreso de comparación',
          })}
        >
          {slots.map((s, i) => (
            <span
              key={i}
              className={`lookalike-progress__dot ${s ? 'is-filled' : ''} ${selection.length === i ? 'is-next' : ''}`}
            >
              {s ? i + 1 : '·'}
            </span>
          ))}
          <span className="lookalike-progress__label">
            {canCompare(selection)
              ? t('lookalike.ready', { defaultValue: 'Lista' })
              : t('lookalike.needMore', {
                  defaultValue: '{{count}}/{{min}}',
                  count: selection.length,
                  min: LOOKALIKE_STUDIO_MIN,
                })}
          </span>
        </div>
      </header>

      {/* Classic one-tap confusions */}
      <section
        className="lookalike-classics"
        aria-label={t('a11y.classicLookalikes', { defaultValue: 'Confusiones clásicas' })}
      >
        <h2 className="lookalike-classics__title">
          {t('lookalike.classicsTitle', { defaultValue: 'Confusiones clásicas' })}
        </h2>
        <div className="lookalike-classics__rail">
          {classics.map((pair) => (
            <button
              key={pair.id}
              type="button"
              className={`lookalike-classic-card ${activePairId === pair.id ? 'is-active' : ''}`}
              onClick={() => loadPair(pair)}
            >
              <div className="lookalike-classic-card__thumbs" aria-hidden>
                {pair.taxa.slice(0, 2).map((tx) => (
                  <SpeciesThumb key={tx} taxon={tx} size={44} className="lookalike-classic-card__thumb" />
                ))}
              </div>
              <span className="lookalike-classic-card__label">{pair.label}</span>
              <span className="lookalike-classic-card__why">{pair.why}</span>
              {(() => {
                const diag =
                  pair.taxa.length >= 2
                    ? findDiagnosticPair(pair.taxa[0], pair.taxa[1])
                    : null
                if (!diag?.critical_views?.length) return null
                return (
                  <span
                    className="lookalike-classic-card__diag-views"
                    data-testid={`studio-classic-diag-${pair.id}`}
                  >
                    {diag.critical_views.slice(0, 3).map((v) => (
                      <span key={v} className="lookalike-item__diag-badge lookalike-item__diag-badge--static">
                        {t(`identify.views.${v}`, { defaultValue: v })}
                      </span>
                    ))}
                  </span>
                )
              })()}
            </button>
          ))}
        </div>
      </section>

      <div className="lookalike-search-panel atelier-panel">
        <label className="lookalike-search-label" htmlFor="lookalike-search">
          {t('lookalike.searchLabel', { defaultValue: 'Buscar o añadir' })}
        </label>
        <div className={`lookalike-search ${focused ? 'is-focused' : ''}`}>
          <IconSearch size={18} />
          <input
            id="lookalike-search"
            type="search"
            value={query}
            autoComplete="off"
            placeholder={t('lookalike.searchPlaceholder', {
              defaultValue: 'Oronja, níscalo, Galerina…',
            })}
            disabled={selection.length >= LOOKALIKE_STUDIO_MAX}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocused(true)
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 180)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (typeahead[0]) add(typeahead[0].taxon)
                else add(query)
              }
            }}
          />
          <Button
            type="button"
            variant="primary"
            disabled={!query.trim() || selection.length >= LOOKALIKE_STUDIO_MAX}
            onClick={() => add(typeahead[0]?.taxon || query)}
          >
            {t('lookalike.add', { defaultValue: 'Añadir' })}
          </Button>
        </div>
        {focused && typeahead.length > 0 && (
          <ul className="lookalike-typeahead" role="listbox">
            {typeahead.map((s) => (
              <li key={s.slug}>
                <button
                  type="button"
                  className="lookalike-typeahead__item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(s.taxon)}
                >
                  <SpeciesThumb taxon={s.taxon} riskLabel={s.risk_label} size={40} />
                  <span className="lookalike-typeahead__text">
                    <strong>{displayCommonName(s, locale)}</strong>
                    <em>{s.taxon}</em>
                  </span>
                  <RiskChip risk={s.risk_label} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p className="lookalike-error" role="status">
            {error}
          </p>
        )}
      </div>

      {selection.length === 0 ? (
        <EmptyState
          title={t('lookalike.emptyTitle', {
            defaultValue: 'Toca un par clásico o busca',
          })}
          description={t('lookalike.emptyBody', {
            defaultValue: 'Empieza por una confusión famosa de arriba, o añade dos taxones a mano.',
          })}
          icon={<IconMushroom size={30} />}
        />
      ) : (
        <div
          className="lookalike-studio-grid lookalike-studio-grid--scroll"
          style={{
            ['--lookalike-cols' as string]: String(Math.max(selection.length, 1)),
          }}
        >
          {selection.map((s, idx) => (
            <article key={s.taxon} className="lookalike-studio-card lookalike-studio-card--rich">
              <div className="lookalike-studio-card__media">
                <SpeciesThumb
                  taxon={s.taxon}
                  riskLabel={s.risk_label}
                  fill
                  className="lookalike-studio-card__thumb"
                  variant="card"
                />
                <span className="lookalike-studio-card__rank">#{idx + 1}</span>
                <div className="lookalike-studio-card__risk">
                  <RiskChip risk={s.risk_label} boost={s.risk_label === 'deadly'} />
                </div>
              </div>
              <div className="lookalike-studio-card__body">
                <SpeciesNameBlock
                  taxon={s.taxon}
                  commonNames={commonsForLocale(s, locale)}
                  family={s.family}
                  familyEs={s.family_es}
                  size="md"
                />
                <div className="lookalike-studio-card__actions">
                  <LinkButton to={`/enciclopedia/${s.slug}`} variant="ghost">
                    {t('lookalike.viewDetail', { defaultValue: 'Ficha' })}
                  </LinkButton>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setSelection(removeFromStudioSelection(selection, s.taxon))
                      setActivePairId(null)
                    }}
                  >
                    {t('lookalike.remove', { defaultValue: 'Quitar' })}
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="atelier-panel lookalike-table-panel">
          <div className="lookalike-table-head">
            <h2 className="lookalike-table-title">
              {t('lookalike.tableTitle', { defaultValue: 'Diferencias' })}
            </h2>
          </div>
          <div className="lookalike-table-scroll">
            <table className="lookalike-compare-table">
              <thead>
                <tr>
                  <th scope="col">{t('lookalike.characterCol', { defaultValue: 'Carácter' })}</th>
                  {selection.map((s) => (
                    <th key={s.taxon} scope="col">
                      <span className="lookalike-th-common">
                        {displayCommonName(s, locale)}
                      </span>
                      <em>{s.taxon}</em>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.field}
                    className={row.highlight ? 'lookalike-row--diff' : undefined}
                  >
                    <th scope="row">{row.field}</th>
                    {row.values.map((v, i) => (
                      <td key={`${row.field}-${i}`}>
                        {row.field === 'Riesgo' ? (
                          <RiskChip risk={v} label={getRiskMeta(v).label} boost={v === 'deadly'} />
                        ) : (
                          v
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(activePairId || selectionDiag) && (
            <div className="lookalike-pair-note-block">
              {activePairId && (
                <p className="lookalike-pair-note">
                  {classics.find((c) => c.id === activePairId)?.why}
                </p>
              )}
              {selectionDiag && selectionDiag.critical_views.length > 0 && (
                <div
                  className="lookalike-item__diag"
                  data-testid={`studio-selection-diag-${selectionDiag.pair_id}`}
                  data-pair-id={selectionDiag.pair_id}
                  data-pair-source={selectionDiag.source}
                >
                  {!activePairId && selectionDiag.why ? (
                    <p className="lookalike-item__diag-why muted">{selectionDiag.why}</p>
                  ) : null}
                  <div className="lookalike-item__diag-views">
                    <span className="lookalike-item__diag-label">
                      {t('result.pairCriticalViews', {
                        defaultValue: 'Vistas que discriminan:',
                      })}
                    </span>
                    {selectionDiag.critical_views.map((view) => (
                      <span
                        key={view}
                        className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                        data-slot={view}
                      >
                        {t(`identify.views.${view}`, { defaultValue: view })}
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
          )}
        </div>
      )}

      <section className="lookalike-suggest-section">
        <h2 className="lookalike-table-title">
          {t('lookalike.suggestTitle', { defaultValue: 'Añadir confusión' })}
        </h2>
        <div className="lookalike-suggest-row">
          {suggestions.map((s) => {
            const disabled = selection.some((x) => x.taxon === s.taxon)
            return (
              <button
                key={s.taxon}
                type="button"
                className="lookalike-suggest-chip lookalike-suggest-chip--rich"
                onClick={() => add(s.taxon)}
                disabled={disabled || selection.length >= LOOKALIKE_STUDIO_MAX}
              >
                <SpeciesThumb taxon={s.taxon} riskLabel={s.risk_label} size={36} />
                <span className="lookalike-suggest-chip__text">
                  <strong>{displayCommonName(s, locale)}</strong>
                  <small>{s.taxon}</small>
                </span>
                <RiskChip risk={s.risk_label} />
              </button>
            )
          })}
        </div>
      </section>
    </PageShell>
  )
}
