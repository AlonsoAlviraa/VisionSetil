/** Encyclopedia page: searchable, filterable grid of all mushroom species. */
import { useMemo, useState } from 'react'
import { MushroomCard } from '../components/MushroomCard'
import {
  ALL_CATEGORIES,
  mushroomDatabase,
  searchMushrooms,
  filterByCategory,
} from '../data/mushroomDatabase'
import type { EdibilityLevel } from '../data/mushroomDatabase'

export function EncyclopediaPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('todas')
  const [edibility, setEdibility] = useState<EdibilityLevel | 'todas'>('todas')

  const results = useMemo(() => {
    let list = searchMushrooms(query)
    list = filterByCategory(list, category)
    if (edibility !== 'todas') {
      list = list.filter((m) => m.edibility === edibility)
    }
    return list
  }, [query, category, edibility])

  return (
    <div className="page-encyclopedia">
      <div className="page-header">
        <h1 className="page-title">🍄 Enciclopedia micológica</h1>
        <p className="page-subtitle">
          Explora {mushroomDatabase.length} especies ibéricas con fotos, descripciones, hábitat y
          datos clave para su identificación
        </p>
      </div>

      {/* Search & filters */}
      <div className="encyclopedia-toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            placeholder="Buscar por nombre, familia o descripción…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery('')} aria-label="Limpiar">
              ✕
            </button>
          )}
        </div>

        <div className="filter-chips">
          {ALL_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              className={`filter-chip ${category === cat.id ? 'filter-chip--active' : ''}`}
              onClick={() => setCategory(cat.id)}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <label>Comestibilidad:</label>
          <select
            value={edibility}
            onChange={(e) => setEdibility(e.target.value as EdibilityLevel | 'todas')}
          >
            <option value="todas">Todas</option>
            <option value="excelente">Excelente comestible</option>
            <option value="buen_comestible">Buen comestible</option>
            <option value="comestible_con_cautela">Comestible con cautela</option>
            <option value="no_recomendado">No recomendado</option>
            <option value="toxico">Tóxico</option>
            <option value="mortifero">⚠️ Mortal</option>
          </select>
        </div>
      </div>

      <p className="results-count">
        {results.length} {results.length === 1 ? 'resultado' : 'resultados'}
      </p>

      {/* Results grid */}
      {results.length > 0 ? (
        <div className="mushroom-grid">
          {results.map((m) => (
            <MushroomCard key={m.scientificName} species={m} />
          ))}
        </div>
      ) : (
        <div className="empty-results">
          <span className="empty-results-icon">🔍</span>
          <h3>No se encontraron setas</h3>
          <p>Prueba con otros términos de búsqueda o cambia los filtros.</p>
        </div>
      )}
    </div>
  )
}