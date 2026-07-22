/**
 * Offline pack UI — download top España taxa photos (Wave B: Top 20 first).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  buildOfflinePackEntries,
  cacheOfflinePackPhotos,
  clearOfflinePackCache,
  offlinePackPhotoUrls,
  readOfflinePackMeta,
  writeOfflinePackMeta,
} from '../lib/offlinePack'
import { loadSpeciesCatalog } from '../data/speciesCatalog'
import { EmptyState } from '../components/EmptyState'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { IconMushroom } from '../components/icons'
import { SpeciesThumb } from '../components/SpeciesThumb'

const TOP_N = 20

export function OfflinePackPage() {
  const [catalogReady, setCatalogReady] = useState(false)
  useEffect(() => {
    void loadSpeciesCatalog().then(() => setCatalogReady(true))
  }, [])
  const entries = useMemo(
    () => (catalogReady ? buildOfflinePackEntries(80) : []),
    [catalogReady],
  )
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [meta, setMeta] = useState(() => readOfflinePackMeta())
  const [showAll, setShowAll] = useState(false)

  const visible = showAll ? entries : entries.slice(0, TOP_N)
  const photoCount = offlinePackPhotoUrls(entries).length

  const download = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const urls = offlinePackPhotoUrls(entries)
      const cached = await cacheOfflinePackPhotos(urls)
      const next = {
        savedAt: Date.now(),
        count: entries.length,
        withPhotos: cached,
        taxons: entries.map((e) => e.taxon),
      }
      writeOfflinePackMeta(next)
      setMeta(next)
      setStatus(
        cached > 0
          ? `Guardadas ${cached} fotos de catálogo (${entries.length} fichas en el pack).`
          : 'Pack de metadatos listo. Las fotos remotas no se pudieron cachear (CORS/red).',
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Error al guardar el pack')
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    setBusy(true)
    try {
      await clearOfflinePackCache()
      setMeta(null)
      setStatus('Pack offline eliminado.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-offline page-atelier-shell">
      <div className="page-header">
        <p className="atelier-kicker home-kicker">Campo · PWA</p>
        <h1 className="page-title">Pack offline España</h1>
        <p className="page-subtitle">
          Top setas conocidas y de alto riesgo (T0/T1) para consultar sin red. No clasifica offline.
        </p>
      </div>

      <div className="atelier-panel" style={{ marginBottom: '1.25rem' }}>
        <p>
          <strong>{entries.length}</strong> taxones · <strong>{photoCount}</strong> URLs de foto
        </p>
        {meta && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            Última descarga: {new Date(meta.savedAt).toLocaleString()} · {meta.withPhotos} fotos en
            caché
          </p>
        )}
        <div className="identify-mode-toggle" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn-atelier btn-atelier--primary"
            disabled={busy}
            onClick={() => void download()}
          >
            {busy ? 'Guardando…' : 'Descargar pack'}
          </button>
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost"
            disabled={busy || !meta}
            onClick={() => void clear()}
          >
            Eliminar pack
          </button>
          <Link to="/enciclopedia" className="btn-atelier btn-atelier--ghost">
            Enciclopedia
          </Link>
        </div>
        {status && (
          <p className="muted" style={{ marginTop: '0.85rem' }} role="status">
            {status}
          </p>
        )}
      </div>

      <div className="atelier-section-bar">
        <h2>{showAll ? `Todas (${entries.length})` : `Top ${TOP_N}`}</h2>
        {entries.length > TOP_N && (
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? 'Ver solo top 20' : `Ver todas (${entries.length})`}
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Pack vacío"
          description="No hay taxones T0/T1 en el catálogo."
          icon={<IconMushroom size={28} />}
        />
      ) : (
        <ul className="offline-pack-list offline-pack-list--rich">
          {visible.map((e) => (
            <li key={e.taxon} className="offline-pack-item offline-pack-item--rich">
              <SpeciesThumb taxon={e.taxon} riskLabel={e.risk_label} size={52} />
              <div className="offline-pack-item__main">
                <RiskChip risk={e.risk_label} />
                <SpeciesNameBlock
                  taxon={e.taxon}
                  commonNames={[e.common_name]}
                  familyEs={e.family_es}
                  size="sm"
                  showFamily={Boolean(e.family_es)}
                />
              </div>
              <span className="offline-pack-tier">{e.photo_tier}</span>
              <Link to={`/enciclopedia/${e.slug}`} className="btn-atelier btn-atelier--ghost">
                Ficha
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
