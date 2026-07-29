/** Side-by-side lookalike comparison — risk chips only, mobile 1-gesture (D-07). */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SpeciesImage } from './SpeciesImage'
import { RiskChip } from './RiskChip'
import { scientificNameToSlug } from '../lib/slug'
import { riskToPlaceholder } from '../lib/edibility'
import { displayCommonName } from '../data/speciesCatalog'
import { findDiagnosticPair } from '../lib/diagnosticViews'

export interface LookalikeSpecies {
  scientific_name?: string
  taxon?: string
  slug: string
  family?: string | null
  risk_level?: string
  risk_label?: string
  edibility_code?: string
  habitat?: string | null
  season?: string | null
  common_name?: string | null
  vernacular_names?: string[]
  common_names?: string[]
  common_names_en?: string[]
  display_name?: string
}

interface LookalikeRef {
  scientific_name: string
  note_key?: string | null
}

interface LookalikeCompareProps {
  current: LookalikeSpecies
  lookalikes: LookalikeRef[]
  resolve: (scientificName: string) => LookalikeSpecies | null
}

function displayName(s: LookalikeSpecies, locale?: string): string {
  const taxon = s.scientific_name || s.taxon || s.slug || ''
  // Prefer locale-aware commons (EN never forced to Spanish)
  const fromLocale = displayCommonName(
    {
      taxon,
      common_names: s.common_names || (s.common_name ? [s.common_name] : []),
      common_names_en: s.common_names_en,
      display_name: s.display_name,
    },
    locale,
  )
  if (fromLocale && fromLocale !== 'undefined') return fromLocale
  return (
    s.display_name ||
    s.common_name ||
    s.common_names?.[0] ||
    s.vernacular_names?.[0] ||
    taxon ||
    s.slug
  )
}

function sciName(s: LookalikeSpecies): string {
  return s.scientific_name || s.taxon || s.slug
}

export function LookalikeCompare({ current, lookalikes, resolve }: LookalikeCompareProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage || i18n.language || 'es'
  const [selectedIdx, setSelectedIdx] = useState(0)
  const pickerRef = useRef<HTMLDivElement>(null)

  const pairs = useMemo(() => {
    return lookalikes.map((la) => {
      const rec = resolve(la.scientific_name)
      const slug = rec?.slug || scientificNameToSlug(la.scientific_name)
      return { la, rec, slug }
    })
  }, [lookalikes, resolve])

  // Reset selection when the lookalike set identity changes
  const lookalikeKey = lookalikes.map((l) => l.scientific_name).join('|')
  useEffect(() => {
    setSelectedIdx(0)
  }, [lookalikeKey])

  const focusChip = useCallback((idx: number) => {
    const btn = pickerRef.current?.querySelector<HTMLButtonElement>(
      `[data-lookalike-idx="${idx}"]`,
    )
    btn?.focus()
  }, [])

  const onPickerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (!pairs.length) return
      let next = selectedIdx
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        next = (selectedIdx + 1) % pairs.length
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        next = (selectedIdx - 1 + pairs.length) % pairs.length
      } else if (e.key === 'Home') {
        next = 0
      } else if (e.key === 'End') {
        next = pairs.length - 1
      } else {
        return
      }
      e.preventDefault()
      setSelectedIdx(next)
      // Roving tabindex: move focus with selection (match SpeciesDetail tabs)
      focusChip(next)
    },
    [pairs.length, selectedIdx, focusChip],
  )

  const safeIdx = pairs.length ? Math.min(selectedIdx, pairs.length - 1) : 0
  const selected = pairs[safeIdx]
  const pairDiag = useMemo(() => {
    if (!selected) return null
    return findDiagnosticPair(
      sciName(current),
      selected.la.scientific_name || selected.rec?.taxon || '',
    )
  }, [current, selected])

  if (!pairs.length || !selected) return null

  const other = selected.rec
  const curRisk = current.risk_level || current.risk_label || 'unknown'

  return (
    <div className="lookalike-compare lookalike-compare--atelier" data-testid="lookalike-section">
      <header className="lookalike-compare__head">
        <h2>{t('lookalike.title', { defaultValue: 'Confusiones posibles' })}</h2>
        <p className="lookalike-compare__hint">
          {t('lookalike.hint', {
            defaultValue: 'Riesgo solo como orientación — no edibilidad comestible.',
          })}
        </p>
      </header>

      {/* Mobile 1-gesture: horizontal chip picker + keyboard roving */}
      <div
        ref={pickerRef}
        className="lookalike-compare__picker"
        role="tablist"
        aria-label={t('lookalike.pickerLabel', { defaultValue: 'Elegir confusión' })}
        onKeyDown={onPickerKeyDown}
      >
        {pairs.map((p, idx) => (
          <button
            key={p.la.scientific_name}
            type="button"
            role="tab"
            data-lookalike-idx={idx}
            aria-selected={idx === selectedIdx}
            tabIndex={idx === selectedIdx ? 0 : -1}
            className={`lookalike-compare__chip ${idx === selectedIdx ? 'lookalike-compare__chip--active' : ''}`}
            onClick={() => setSelectedIdx(idx)}
          >
            {p.rec ? displayName(p.rec, locale) : p.la.scientific_name}
          </button>
        ))}
      </div>

      <div className="lookalike-compare__grid">
        <article className="lookalike-compare__card">
          <div className="lookalike-compare__img">
            <SpeciesImage
              scientificName={sciName(current)}
              slug={current.slug}
              variant="card"
              riskLevel={riskToPlaceholder(curRisk)}
              alt={sciName(current)}
              showMediaBadge="auto"
            />
          </div>
          <div className="lookalike-compare__card-body">
            <RiskChip risk={curRisk} />
            <h3>{displayName(current, locale)}</h3>
            <p>
              <em>{sciName(current)}</em>
            </p>
            <p className="lookalike-compare__family muted">
              {current.family || '—'}
            </p>
          </div>
        </article>

        <div className="lookalike-compare__vs" aria-hidden>
          {t('lookalike.vs', { defaultValue: 'VS' })}
        </div>

        <article className="lookalike-compare__card">
          <div className="lookalike-compare__img">
            <SpeciesImage
              scientificName={selected.la.scientific_name}
              slug={selected.slug}
              variant="card"
              riskLevel={riskToPlaceholder(
                other?.risk_level || other?.risk_label,
                other?.edibility_code,
              )}
              alt={selected.la.scientific_name}
              showMediaBadge="auto"
            />
          </div>
          <div className="lookalike-compare__card-body">
            <RiskChip risk={other?.risk_level || other?.risk_label || 'unknown'} />
            <h3>{other ? displayName(other, locale) : selected.la.scientific_name}</h3>
            <p>
              <em>{selected.la.scientific_name}</em>
            </p>
            {other ? (
              <>
                <p className="lookalike-compare__family muted">{other.family || '—'}</p>
                <Link
                  to={`/enciclopedia/${other.slug}`}
                  className="btn-atelier btn-atelier--ghost btn-atelier--sm"
                >
                  {t('lookalike.viewDetail', { defaultValue: 'Ver ficha' })}
                </Link>
              </>
            ) : (
              <p className="lookalike-compare__missing">
                {t('lookalike.notInCatalog', {
                  defaultValue: 'No está en el catálogo local.',
                })}
              </p>
            )}
          </div>
        </article>
      </div>

      {pairDiag && pairDiag.critical_views.length > 0 && (
        <div
          className="lookalike-item__diag lookalike-compare__diag"
          data-testid={`lookalike-compare-diag-${pairDiag.pair_id}`}
          data-pair-id={pairDiag.pair_id}
          data-pair-source={pairDiag.source}
        >
          {pairDiag.why ? (
            <p className="lookalike-item__diag-why muted">{pairDiag.why}</p>
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
            {pairDiag.critical_views.map((view) => (
              <span
                key={view}
                className="lookalike-item__diag-badge lookalike-item__diag-badge--static"
                data-testid={`lookalike-compare-diag-view-${view}`}
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
  )
}
