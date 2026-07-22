/**
 * Load the code-split species catalog once and expose list + meta for pages.
 */
import { useEffect, useState } from 'react'
import {
  loadSpeciesCatalog,
  speciesCatalog as catalogRef,
  speciesCatalogMeta as metaRef,
  type CatalogSpecies,
  type SpeciesCatalogMeta,
} from '../data/speciesCatalog'

export function useSpeciesCatalog(): {
  catalog: CatalogSpecies[]
  meta: SpeciesCatalogMeta
  loading: boolean
  error: string | null
} {
  const [catalog, setCatalog] = useState<CatalogSpecies[]>(() =>
    catalogRef.length ? catalogRef : [],
  )
  const [meta, setMeta] = useState<SpeciesCatalogMeta>(() => metaRef)
  const [loading, setLoading] = useState(() => catalogRef.length === 0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (catalogRef.length > 0) {
      setCatalog(catalogRef)
      setMeta(metaRef)
      setLoading(false)
      return
    }
    setLoading(true)
    void loadSpeciesCatalog()
      .then((list) => {
        if (cancelled) return
        setCatalog(list)
        setMeta({ ...metaRef })
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Error cargando catálogo')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { catalog, meta, loading, error }
}
