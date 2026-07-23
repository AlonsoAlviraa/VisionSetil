/**
 * Offline pack UI — Phase D-14: season pack + priority T0/T1, progress, clear.
 * Educational / PWA shell only — does not classify offline.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  buildOfflinePackEntries,
  buildSeasonOfflinePackEntries,
  cacheOfflinePackPhotos,
  clearOfflinePackCache,
  offlinePackPhotoUrls,
  readOfflinePackMeta,
  writeOfflinePackMeta,
  type OfflinePackKind,
} from '../lib/offlinePack'
import { loadSpeciesCatalog } from '../data/speciesCatalog'
import { currentSeason, type SeasonId } from '../lib/seasonRadar'
import { EmptyState } from '../components/EmptyState'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { RiskChip } from '../components/RiskChip'
import { IconMushroom } from '../components/icons'
import { SpeciesThumb } from '../components/SpeciesThumb'

const TOP_N = 20

export function OfflinePackPage() {
  const { t } = useTranslation()
  const season = currentSeason()
  const seasonId = season.id as SeasonId

  const [kind, setKind] = useState<OfflinePackKind>('season')
  const [catalogReady, setCatalogReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [meta, setMeta] = useState(() => readOfflinePackMeta())
  const [showAll, setShowAll] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; ok: number } | null>(
    null,
  )

  useEffect(() => {
    if (kind === 'priority') {
      void loadSpeciesCatalog().then(() => setCatalogReady(true))
    }
  }, [kind])

  const seasonEntries = useMemo(() => buildSeasonOfflinePackEntries(seasonId, 16), [seasonId])

  const priorityEntries = useMemo(
    () => (catalogReady ? buildOfflinePackEntries(80) : []),
    [catalogReady],
  )

  const entries = kind === 'season' ? seasonEntries : priorityEntries
  const visible = showAll ? entries : entries.slice(0, TOP_N)
  const photoCount = offlinePackPhotoUrls(entries).length
  const progressPct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  const download = async () => {
    setBusy(true)
    setStatus(null)
    setProgress({ done: 0, total: Math.max(photoCount, 1), ok: 0 })
    try {
      if (kind === 'priority' && !catalogReady) {
        await loadSpeciesCatalog()
        setCatalogReady(true)
      }
      const list = kind === 'season' ? seasonEntries : buildOfflinePackEntries(80)
      const urls = offlinePackPhotoUrls(list)
      // Always try placeholders so offline shell never has zero assets
      const withPlaceholders = [
        ...urls,
        '/media/placeholders/default.webp',
        '/media/placeholders/toxic.webp',
        '/media/placeholders/deadly.webp',
        '/media/placeholders/unknown.webp',
      ]
      const unique = Array.from(new Set(withPlaceholders.map((u) => u)))
      const cached = await cacheOfflinePackPhotos(unique, undefined, (p) => setProgress(p))
      const next = {
        savedAt: Date.now(),
        count: list.length,
        withPhotos: cached,
        taxons: list.map((e) => e.taxon),
        kind,
        seasonId: kind === 'season' ? seasonId : null,
      }
      writeOfflinePackMeta(next)
      setMeta(next)
      setStatus(
        cached > 0
          ? t('offline.statusOk', {
              defaultValue: 'Guardadas {{cached}} imágenes ({{count}} fichas en el pack).',
              cached,
              count: list.length,
            })
          : t('offline.statusMetaOnly', {
              defaultValue:
                'Pack de metadatos listo. Las imágenes no se pudieron cachear (CORS/red).',
            }),
      )
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t('offline.statusError', { defaultValue: 'Error al guardar el pack' }))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  const clear = async () => {
    if (
      !window.confirm(
        t('offline.confirmClear', {
          defaultValue: '¿Eliminar el pack offline guardado en este dispositivo?',
        }),
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await clearOfflinePackCache()
      setMeta(null)
      setStatus(t('offline.statusCleared', { defaultValue: 'Pack offline eliminado.' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-offline page-atelier-shell">
      <div className="page-header">
        <p className="atelier-kicker home-kicker">{t('offline.kicker', { defaultValue: 'Campo · PWA' })}</p>
        <h1 className="page-title">{t('offline.title', { defaultValue: 'Pack offline' })}</h1>
        <p className="page-subtitle">
          {t('offline.subtitle', {
            defaultValue:
              'Descarga la temporada o el pack prioritario para consultar fichas sin red. No clasifica offline.',
          })}
        </p>
      </div>

      <div className="offline-pack-modes identify-mode-toggle" role="group" aria-label={t('offline.modeLabel', { defaultValue: 'Tipo de pack' })}>
        <button
          type="button"
          className={`btn-atelier ${kind === 'season' ? 'btn-atelier--primary' : 'btn-atelier--ghost'}`}
          aria-pressed={kind === 'season'}
          onClick={() => {
            setKind('season')
            setShowAll(false)
          }}
        >
          {t('offline.modeSeason', {
            defaultValue: 'Temporada ({{season}})',
            season: season.labelEs,
          })}
        </button>
        <button
          type="button"
          className={`btn-atelier ${kind === 'priority' ? 'btn-atelier--primary' : 'btn-atelier--ghost'}`}
          aria-pressed={kind === 'priority'}
          onClick={() => {
            setKind('priority')
            setShowAll(false)
          }}
        >
          {t('offline.modePriority', { defaultValue: 'Prioritario T0/T1' })}
        </button>
      </div>

      <div className="atelier-panel offline-pack-panel" style={{ marginBottom: '1.25rem' }}>
        <p>
          <strong>{entries.length}</strong> {t('offline.taxa', { defaultValue: 'taxones' })} ·{' '}
          <strong>{photoCount}</strong> {t('offline.photoUrls', { defaultValue: 'URLs de media' })}
        </p>
        {kind === 'season' && (
          <p className="muted" style={{ marginTop: '0.35rem' }}>
            {season.note}
          </p>
        )}
        {meta && (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            {t('offline.lastDownload', {
              defaultValue: 'Última descarga: {{when}} · {{photos}} en caché · {{kind}}',
              when: new Date(meta.savedAt).toLocaleString(),
              photos: meta.withPhotos,
              kind:
                meta.kind === 'season'
                  ? t('offline.kindSeason', { defaultValue: 'temporada' })
                  : t('offline.kindPriority', { defaultValue: 'prioritario' }),
            })}
          </p>
        )}

        {busy && progress && (
          <div
            className="offline-pack-progress"
            role="progressbar"
            aria-valuenow={progressPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('offline.progressLabel', { defaultValue: 'Progreso de descarga' })}
          >
            <div className="offline-pack-progress__bar" style={{ width: `${progressPct}%` }} />
            <span className="offline-pack-progress__text">
              {progress.done}/{progress.total} · {progress.ok} ok
            </span>
          </div>
        )}

        <div className="identify-mode-toggle" style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className="btn-atelier btn-atelier--primary"
            disabled={busy || (kind === 'priority' && !catalogReady && entries.length === 0)}
            onClick={() => void download()}
          >
            {busy
              ? t('offline.saving', { defaultValue: 'Guardando…' })
              : t('offline.download', { defaultValue: 'Descargar pack' })}
          </button>
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost"
            disabled={busy || !meta}
            onClick={() => void clear()}
          >
            {t('offline.clear', { defaultValue: 'Eliminar pack' })}
          </button>
          <Link to="/enciclopedia" className="btn-atelier btn-atelier--ghost">
            {t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}
          </Link>
        </div>
        {status && (
          <p className="muted" style={{ marginTop: '0.85rem' }} role="status">
            {status}
          </p>
        )}
        <p className="muted offline-pack-disclaimer" style={{ marginTop: '0.85rem' }}>
          {t('offline.disclaimer', {
            defaultValue:
              'Solo consulta de fichas y fotos. No identifica setas sin red ni autoriza consumo.',
          })}
        </p>
      </div>

      <div className="atelier-section-bar">
        <h2>
          {showAll
            ? t('offline.all', { defaultValue: 'Todas ({{count}})', count: entries.length })
            : t('offline.top', { defaultValue: 'Vista ({{count}})', count: Math.min(TOP_N, entries.length) })}
        </h2>
        {entries.length > TOP_N && (
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? t('offline.showTop', { defaultValue: 'Ver menos' })
              : t('offline.showAll', { defaultValue: 'Ver todas ({{count}})', count: entries.length })}
          </button>
        )}
      </div>

      {kind === 'priority' && !catalogReady ? (
        <div className="skeleton-atelier" style={{ minHeight: 120 }} aria-busy="true">
          <div className="skeleton-atelier__shimmer" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title={t('offline.emptyTitle', { defaultValue: 'Pack vacío' })}
          description={t('offline.emptyBody', {
            defaultValue: 'No hay taxones disponibles para este pack.',
          })}
          icon={<IconMushroom size={28} />}
        />
      ) : (
        <ul className="offline-pack-list offline-pack-list--rich">
          {visible.map((e) => (
            <li key={e.taxon} className="offline-pack-item offline-pack-item--rich">
              <SpeciesThumb taxon={e.taxon} slug={e.slug} riskLabel={e.risk_label} size={52} />
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
                {t('offline.openCard', { defaultValue: 'Ficha' })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
