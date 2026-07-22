/**
 * Lookalike Studio — exquisite side-by-side comparison of 2–3 taxa.
 * Photography-first, risk-honest, never consumption permission.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addToStudioSelection,
  buildCompareRows,
  canCompare,
  LOOKALIKE_STUDIO_MAX,
  removeFromStudioSelection,
  LOOKALIKE_STUDIO_MIN,
  suggestStudioPeers,
  type StudioTaxonCard,
} from '../lib/lookalikeStudio'
import { searchCatalogRanked } from '../lib/catalogSearch'
import { useSpeciesCatalog } from '../hooks/useSpeciesCatalog'
import { getRiskMeta } from '../lib/riskLabels'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { EmptyState } from '../components/EmptyState'
import { IconSearch, IconMushroom } from '../components/icons'

export function LookalikeStudioPage() {
  const { catalog: speciesCatalog, loading: catalogLoading } = useSpeciesCatalog()
  const [query, setQuery] = useState('')
  const [selection, setSelection] = useState<StudioTaxonCard[]>([])
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)

  const rows = useMemo(() => buildCompareRows(selection), [selection])
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
      limit: 6,
      boostHighRisk: true,
    }).filter((s) => !selection.some((x) => x.taxon === s.taxon))
  }, [query, selection, speciesCatalog])

  const add = (q: string) => {
    const { selection: next, error: err } = addToStudioSelection(selection, q)
    setSelection(next)
    setError(err)
    if (!err) {
      setQuery('')
      setFocused(false)
    }
  }

  const slots = Array.from({ length: LOOKALIKE_STUDIO_MAX }, (_, i) => selection[i] ?? null)

  return (
    <div className="page-lookalike page-atelier-shell lookalike-atelier">
      <header className="lookalike-hero">
        <p className="atelier-kicker">Educación · Confusiones peligrosas</p>
        <h1 className="page-title">Lookalike Studio</h1>
        <p className="page-subtitle">
          Coloca hasta tres setas frente a frente. Fotografía, riesgo y familia — para estudiar
          confusiones, no para decidir qué llevarse a la mesa.
        </p>
        <div className="lookalike-progress" aria-label="Progreso de comparación">
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
              ? 'Comparación lista'
              : `${selection.length} de ${LOOKALIKE_STUDIO_MIN} · añade al menos 2`}
          </span>
        </div>
      </header>

      <div className="lookalike-search-panel atelier-panel">
        <label className="lookalike-search-label" htmlFor="lookalike-search">
          Buscar taxón
        </label>
        <div className={`lookalike-search ${focused ? 'is-focused' : ''}`}>
          <IconSearch size={18} />
          <input
            id="lookalike-search"
            type="search"
            value={query}
            autoComplete="off"
            placeholder="Oronja, níscalo, Galerina marginata…"
            disabled={selection.length >= LOOKALIKE_STUDIO_MAX}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 160)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (typeahead[0]) add(typeahead[0].taxon)
                else add(query)
              }
            }}
          />
          <button
            type="button"
            className="btn-atelier btn-atelier--primary"
            disabled={!query.trim() || selection.length >= LOOKALIKE_STUDIO_MAX}
            onClick={() => add(typeahead[0]?.taxon || query)}
          >
            Añadir
          </button>
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
                    <strong>{s.common_names[0] || s.taxon}</strong>
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
          title="Elige setas para comparar"
          description="Busca por nombre común o científico, o toca una sugerencia de alto riesgo."
          icon={<IconMushroom size={30} />}
        />
      ) : (
        <div
          className="lookalike-studio-grid"
          style={{ gridTemplateColumns: `repeat(${selection.length}, minmax(0, 1fr))` }}
        >
          {selection.map((s, idx) => (
            <article key={s.taxon} className="lookalike-studio-card lookalike-studio-card--rich">
              <div className="lookalike-studio-card__media">
                <SpeciesThumb
                  taxon={s.taxon}
                  riskLabel={s.risk_label}
                  size={280}
                  className="lookalike-studio-card__thumb"
                />
                <span className="lookalike-studio-card__rank">#{idx + 1}</span>
                <div className="lookalike-studio-card__risk">
                  <RiskChip risk={s.risk_label} />
                </div>
              </div>
              <div className="lookalike-studio-card__body">
                <SpeciesNameBlock
                  taxon={s.taxon}
                  commonNames={s.common_names}
                  family={s.family}
                  familyEs={s.family_es}
                  size="md"
                />
                <div className="lookalike-studio-card__actions">
                  <Link to={`/enciclopedia/${s.slug}`} className="btn-atelier btn-atelier--ghost">
                    Ver ficha
                  </Link>
                  <button
                    type="button"
                    className="btn-atelier btn-atelier--ghost"
                    onClick={() => setSelection(removeFromStudioSelection(selection, s.taxon))}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <div className="atelier-panel lookalike-table-panel">
          <div className="lookalike-table-head">
            <h2 className="lookalike-table-title">Tabla de comparación</h2>
            <p className="lookalike-table-lead">
              Lee en horizontal. El riesgo es orientación de seguridad, no edibilidad.
            </p>
          </div>
          <div className="lookalike-table-scroll">
            <table className="lookalike-compare-table">
              <thead>
                <tr>
                  <th scope="col">Carácter</th>
                  {selection.map((s) => (
                    <th key={s.taxon} scope="col">
                      <span className="lookalike-th-common">
                        {s.common_names[0] || 'Sin nombre local'}
                      </span>
                      <em>{s.taxon}</em>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.field}>
                    <th scope="row">{row.field}</th>
                    {row.values.map((v, i) => (
                      <td key={`${row.field}-${i}`}>
                        {row.field === 'Riesgo (orientación)' ? (
                          <RiskChip risk={v} label={getRiskMeta(v).label} />
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
        </div>
      )}

      <section className="lookalike-suggest-section">
        <div className="lookalike-table-head">
          <h2 className="lookalike-table-title">Sugerencias de estudio</h2>
          <p className="lookalike-table-lead">
            Alto riesgo o misma familia — ideales para practicar lookalikes.
          </p>
        </div>
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
                  <strong>{s.common_names[0] || s.taxon}</strong>
                  <small>{s.taxon}</small>
                </span>
                <RiskChip risk={s.risk_label} />
              </button>
            )
          })}
        </div>
        {selection.length === 1 && (
          <p className="lookalike-hint">
            Tip: añade un lookalike de la misma familia o un taxón mortal para contrastar caracteres.
          </p>
        )}
      </section>
    </div>
  )
}
