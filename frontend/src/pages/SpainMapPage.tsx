/**
 * Mycological zones map — visual hotspots + weather alerts (D-12).
 * Educational / zone alerts only — not forage permission.
 */
import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  memo,
  startTransition,
} from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import 'leaflet/dist/leaflet.css'

import {
  mushroomZones,
  SPAIN_CENTER,
  SPAIN_ZOOM,
  type MushroomZone,
} from '../data/mushroomZones'
import { getSpeciesByTaxon, loadSpeciesCatalog } from '../data/speciesCatalog'
import { getRiskMeta } from '../lib/riskLabels'
import { SpeciesNameBlock } from '../components/SpeciesNameBlock'
import { SpeciesThumb } from '../components/SpeciesThumb'
import { EmptyState } from '../components/EmptyState'
import { SeasonRadar } from '../components/SeasonRadar'
import {
  fetchWeatherData,
  evaluateMushroomConditions,
  type MushroomConditions,
} from '../api/weather'
import {
  alertFromConditions,
  alertFromScore,
  hotspotRadiusMeters,
  isHotspotActive,
  mapPoolChunked,
  type ZoneAlertMeta,
} from '../lib/zoneAlerts'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const iconCache = new Map<string, L.DivIcon>()

function makeAlertIcon(meta: ZoneAlertMeta): L.DivIcon {
  const key = `${meta.level}:${meta.score ?? 'n'}`
  const hit = iconCache.get(key)
  if (hit) return hit
  const color = meta.color
  const pulse = meta.level === 'extreme' || meta.level === 'severe'
  const scoreTxt = meta.score === null ? '·' : String(Math.round(meta.score))
  const icon = L.divIcon({
    className: 'zone-alert-marker',
    html: `<div class="zam ${pulse ? 'zam--pulse' : ''}" style="--zam:${color}">
      <span class="zam__score">${scoreTxt}</span>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -32],
  })
  iconCache.set(key, icon)
  return icon
}

function MapController({ zone }: { zone: MushroomZone | null }) {
  const map = useMap()
  useEffect(() => {
    if (!zone) return
    // Short fly — keep pan/zoom fluid on mid-range mobile
    map.flyTo([zone.lat, zone.lng], 8.5, { duration: 0.55, easeLinearity: 0.35 })
  }, [zone, map])
  return null
}

function speciesSlug(sciName: string): string {
  const cat = getSpeciesByTaxon(sciName)
  if (cat) return cat.slug
  return sciName.toLowerCase().replace(/\s+/g, '-')
}

/** Compact board labels: first segment, max ~22 chars */
export function shortZoneLabel(name: string, max = 22): string {
  const base = name.split(/[&·|,/]/)[0]?.trim() || name
  if (base.length <= max) return base
  return `${base.slice(0, max - 1).trim()}…`
}

function ZoneWeatherPanel({
  lat,
  lng,
  cached,
}: {
  lat: number
  lng: number
  cached: MushroomConditions | null | undefined
}) {
  const { t } = useTranslation()
  const [conditions, setConditions] = useState<MushroomConditions | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (cached !== undefined) {
      setConditions(cached)
      setLoading(false)
      setError(cached === null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchWeatherData(lat, lng)
      .then((w) => {
        if (cancelled) return
        if (w) {
          setConditions(evaluateMushroomConditions(w))
          setError(false)
        } else {
          setConditions(null)
          setError(true)
        }
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setConditions(null)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng, cached])

  if (loading) {
    return (
      <div className="alert-banner alert-banner--unknown" role="status">
        {t('map.weatherLoading', { defaultValue: 'Cargando aviso meteorológico…' })}
      </div>
    )
  }
  if (error || !conditions) {
    return (
      <div className="alert-banner alert-banner--unknown" role="status">
        <strong>{t('map.weatherErrorTitle', { defaultValue: 'Sin datos meteorológicos' })}</strong>
        <p className="alert-banner__advisory">
          {t('map.weatherErrorBody', {
            defaultValue:
              'No se pudieron cargar condiciones en vivo. Puedes seguir explorando la ficha de zona (especies y hábitat).',
          })}
        </p>
        <p className="alert-banner__source">
          {t('map.weatherSource', { defaultValue: 'Fuente' })}:{' '}
          <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
            Open-Meteo
          </a>
        </p>
      </div>
    )
  }

  const meta = alertFromConditions(conditions)
  const alertLabel = t(`map.alert.${meta.level}.label`, { defaultValue: meta.label })
  const alertAdvisory = t(`map.alert.${meta.level}.advisory`, { defaultValue: meta.advisory })
  return (
    <div
      className={`alert-banner alert-banner--${meta.level}`}
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      <div className="alert-banner__row">
        <span className="alert-banner__level" style={{ color: meta.color }}>
          {alertLabel}
        </span>
        <span className="alert-banner__score" style={{ color: meta.color }}>
          {t('map.index', { defaultValue: 'Índice' })} {conditions.score}/100
        </span>
      </div>
      <p className="alert-banner__advisory">{alertAdvisory}</p>
      <ul className="alert-banner__details">
        {conditions.details.slice(0, 5).map((d) => (
          <li key={d}>{d.replace(/[✅⚠️🔴🟡📊💧]/g, '').trim()}</li>
        ))}
      </ul>
      <p className="alert-banner__source">
        {t('map.liveData', { defaultValue: 'Datos en tiempo real' })} ·{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
          Open-Meteo
        </a>
        {' · '}
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('map.viewMaps', { defaultValue: 'Ver en mapa' })}
        </a>
        {' · '}
        <a
          href="https://www.aemet.es/es/eltiempo/prediccion/municipios"
          target="_blank"
          rel="noopener noreferrer"
        >
          AEMET
        </a>
      </p>
    </div>
  )
}

const ZoneHotspot = memo(function ZoneHotspot({
  zone,
  meta,
}: {
  zone: MushroomZone
  meta: ZoneAlertMeta
}) {
  const radius = hotspotRadiusMeters(zone.abundance, meta.score)
  const active = isHotspotActive(meta.level)
  return (
    <Circle
      center={[zone.lat, zone.lng]}
      radius={radius}
      pathOptions={{
        color: meta.color,
        fillColor: meta.color,
        fillOpacity: active ? 0.18 : 0.06,
        weight: active ? 1.5 : 0.75,
        opacity: active ? 0.65 : 0.35,
        interactive: false,
        className: active ? 'zone-hotspot zone-hotspot--active' : 'zone-hotspot',
      }}
    />
  )
})

/** Stable marker row — avoids new eventHandlers object every weather chunk (issue 10). */
const ZoneMapMarker = memo(function ZoneMapMarker({
  zone,
  meta,
  onSelect,
  openLabel,
}: {
  zone: MushroomZone
  meta: ZoneAlertMeta
  onSelect: (z: MushroomZone) => void
  openLabel: string
}) {
  const onClick = useCallback(() => onSelect(zone), [onSelect, zone])
  const handlers = useMemo(() => ({ click: onClick }), [onClick])
  return (
    <Marker position={[zone.lat, zone.lng]} icon={makeAlertIcon(meta)} eventHandlers={handlers}>
      <Popup>
        <div className="map-popup">
          <strong>{zone.name}</strong>
          <br />
          <span style={{ color: meta.color, fontWeight: 700 }}>{meta.label}</span>
          {meta.score !== null && (
            <span style={{ color: meta.color }}> · {meta.score}/100</span>
          )}
          <br />
          <span style={{ fontSize: '0.8rem' }}>{zone.region}</span>
          <br />
          <button type="button" className="map-popup__btn" onClick={onClick}>
            {openLabel}
          </button>
        </div>
      </Popup>
    </Marker>
  )
})

export default function SpainMapPage() {
  const { t } = useTranslation()
  const [selectedZone, setSelectedZone] = useState<MushroomZone | null>(null)
  const [filterRegion, setFilterRegion] = useState('todas')
  const [filterAlert, setFilterAlert] = useState<string>('todas')
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [conditionsMap, setConditionsMap] = useState<
    Record<string, MushroomConditions | null>
  >({})
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [weatherFailedAll, setWeatherFailedAll] = useState(false)
  /** Wave B: simple = map + panel; advanced = radar + strip + full filters */
  const [mapMode, setMapMode] = useState<'simple' | 'advanced'>('simple')
  /** Interactive layers */
  const [showHotspots, setShowHotspots] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [onlyHotspots, setOnlyHotspots] = useState(false)
  const cancelledRef = useRef(false)

  const regions = useMemo(() => {
    const set = new Set(mushroomZones.map((z) => z.region))
    return ['todas', ...Array.from(set).sort()]
  }, [])

  useEffect(() => {
    void loadSpeciesCatalog()
  }, [])

  // Progressive weather load — chunked, low concurrency (D-12 perf)
  useEffect(() => {
    cancelledRef.current = false
    setLoadingAlerts(true)
    setWeatherFailedAll(false)

    type WeatherRow = { score: number | null; cond: MushroomConditions | null }

    void mapPoolChunked<MushroomZone, WeatherRow>(
      mushroomZones,
      {
        concurrency: 3,
        chunkSize: 10,
        onChunk: (partial) => {
          if (cancelledRef.current) return
          // Defer paint so progressive weather doesn't thrash markers (issue 10)
          // Flags for all-failed banner are derived from final results in .then (not here).
          startTransition(() => {
            setScores((prev) => {
              const next = { ...prev }
              for (const p of partial) {
                const zone = mushroomZones[p.index]
                if (!zone) continue
                next[zone.id] = p.value.score
              }
              return next
            })
            setConditionsMap((prev) => {
              const next = { ...prev }
              for (const p of partial) {
                const zone = mushroomZones[p.index]
                if (!zone) continue
                next[zone.id] = p.value.cond
              }
              return next
            })
          })
        },
      },
      async (zone) => {
        const w = await fetchWeatherData(zone.lat, zone.lng)
        if (!w) {
          return { score: null, cond: null }
        }
        const cond = evaluateMushroomConditions(w)
        return { score: cond.score, cond }
      },
    ).then((results) => {
      if (cancelledRef.current) return
      setLoadingAlerts(false)
      // Derive from resolved array — not transition updaters (re-review open #2)
      const anyOk = results.some((r) => r.cond != null)
      const anyFail = results.some((r) => r.cond == null)
      setWeatherFailedAll(!anyOk && anyFail)
    })

    return () => {
      cancelledRef.current = true
    }
  }, [])

  const alertSummary = useMemo(() => {
    const counts = { extreme: 0, severe: 0, moderate: 0, good: 0, unknown: 0 }
    for (const z of mushroomZones) {
      const meta = alertFromScore(scores[z.id] ?? null)
      counts[meta.level]++
    }
    return counts
  }, [scores])

  const setMapModeSafe = useCallback((mode: 'simple' | 'advanced') => {
    setMapMode(mode)
    // Issue 1: Aviso filter control is advanced-only — reset when leaving advanced
    if (mode === 'simple') setFilterAlert('todas')
  }, [])

  const filteredZones = useMemo(() => {
    return mushroomZones.filter((z) => {
      if (filterRegion !== 'todas' && z.region !== filterRegion) return false
      if (onlyHotspots) {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (!isHotspotActive(level) && selectedZone?.id !== z.id) return false
      }
      // Ignore alert filter in simple mode even if state is stale
      if (mapMode === 'simple' && !onlyHotspots) return true
      if (mapMode === 'advanced' && filterAlert !== 'todas') {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (level !== filterAlert) return false
      }
      return true
    })
  }, [filterRegion, filterAlert, scores, mapMode, onlyHotspots, selectedZone])

  /** Limit hotspot circles on map for pan/zoom fluidness (mid-range mobile). */
  const hotspotZones = useMemo(() => {
    // simple mode: only favorable + selected; advanced: all filtered
    if (mapMode === 'simple') {
      return filteredZones.filter((z) => {
        if (selectedZone?.id === z.id) return true
        const level = alertFromScore(scores[z.id] ?? null).level
        return isHotspotActive(level)
      })
    }
    return filteredZones
  }, [filteredZones, mapMode, scores, selectedZone])

  const handleSelectZone = useCallback((zone: MushroomZone) => {
    setSelectedZone(zone)
    setTimeout(() => {
      const sidebar = document.getElementById('map-sidebar')
      if (sidebar && window.innerWidth < 900) {
        sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 80)
  }, [])

  return (
    <div className={`page-map page-map--${mapMode} page-atelier-shell`}>
      <div className="page-header map-page-header">
        <h1 className="page-title">
          {t('map.title', { defaultValue: 'Mapa micológico' })}
        </h1>
        <p className="page-subtitle map-page-header__lead">
          {t('map.subtitleShort', {
            defaultValue: 'Toca zonas · avisos en vivo · solo orientación educativa',
          })}
        </p>
        <div className="identify-mode-toggle map-mode-toggle">
          <button
            type="button"
            className={
              mapMode === 'simple'
                ? 'btn-atelier btn-atelier--primary'
                : 'btn-atelier btn-atelier--ghost'
            }
            onClick={() => setMapModeSafe('simple')}
          >
            {t('map.modeSimple', { defaultValue: 'Simple' })}
          </button>
          <button
            type="button"
            className={
              mapMode === 'advanced'
                ? 'btn-atelier btn-atelier--primary'
                : 'btn-atelier btn-atelier--ghost'
            }
            onClick={() => setMapModeSafe('advanced')}
          >
            {t('map.modeAdvanced', { defaultValue: 'Avanzado' })}
          </button>
        </div>
      </div>

      {/* Interactive region chips */}
      <div className="map-region-chips" role="toolbar" aria-label="Filtrar comunidad">
        <button
          type="button"
          className={`map-chip ${filterRegion === 'todas' ? 'is-active' : ''}`}
          onClick={() => setFilterRegion('todas')}
        >
          Todas
        </button>
        {regions
          .filter((r) => r !== 'todas')
          .slice(0, 12)
          .map((r) => (
            <button
              key={r}
              type="button"
              className={`map-chip ${filterRegion === r ? 'is-active' : ''}`}
              onClick={() => setFilterRegion(r === filterRegion ? 'todas' : r)}
            >
              {r}
            </button>
          ))}
      </div>

      {/* Layer toggles */}
      <div className="map-layer-toggles" role="group" aria-label="Capas del mapa">
        <button
          type="button"
          className={`map-chip map-chip--toggle ${showMarkers ? 'is-active' : ''}`}
          onClick={() => setShowMarkers((v) => !v)}
          aria-pressed={showMarkers}
        >
          Marcadores
        </button>
        <button
          type="button"
          className={`map-chip map-chip--toggle ${showHotspots ? 'is-active' : ''}`}
          onClick={() => setShowHotspots((v) => !v)}
          aria-pressed={showHotspots}
        >
          Halos
        </button>
        <button
          type="button"
          className={`map-chip map-chip--toggle ${onlyHotspots ? 'is-active' : ''}`}
          onClick={() => setOnlyHotspots((v) => !v)}
          aria-pressed={onlyHotspots}
        >
          Solo hotspots
        </button>
        {selectedZone && (
          <button
            type="button"
            className="map-chip map-chip--clear"
            onClick={() => setSelectedZone(null)}
          >
            Limpiar selección
          </button>
        )}
      </div>

      {mapMode === 'advanced' && (
        <div className="atelier-panel" style={{ marginBottom: '1rem' }}>
          <SeasonRadar compact />
        </div>
      )}

      {mapMode === 'advanced' && (
        <div className="map-alert-strip" role="status">
          <div className="map-alert-strip__item map-alert-strip__item--extreme">
            <strong>{alertSummary.extreme}</strong>
            <span>{t('map.levelExtreme', { defaultValue: 'Desfavorable' })}</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--severe">
            <strong>{alertSummary.severe}</strong>
            <span>{t('map.levelSevere', { defaultValue: 'Regular' })}</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--moderate">
            <strong>{alertSummary.moderate}</strong>
            <span>{t('map.levelModerate', { defaultValue: 'Aceptable' })}</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--good">
            <strong>{alertSummary.good}</strong>
            <span>{t('map.levelGood', { defaultValue: 'Favorable' })}</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--unknown">
            <strong>{loadingAlerts ? '…' : alertSummary.unknown}</strong>
            <span>
              {loadingAlerts
                ? t('map.loading', { defaultValue: 'Cargando' })
                : t('map.noData', { defaultValue: 'Sin datos' })}
            </span>
          </div>
        </div>
      )}

      {weatherFailedAll && !loadingAlerts && (
        <div className="map-weather-banner" role="status">
          {t('map.weatherAllFailed', {
            defaultValue:
              'No hay datos meteorológicos ahora. El mapa sigue usable con fichas de zona y especies orientativas.',
          })}
        </div>
      )}

      {mapMode === 'advanced' && (
        <div className="map-toolbar map-toolbar--sticky map-toolbar--slim">
          <div className="filter-row">
            <label>{t('map.alertFilter', { defaultValue: 'Aviso' })}</label>
            <select value={filterAlert} onChange={(e) => setFilterAlert(e.target.value)}>
              <option value="todas">{t('map.allLevels', { defaultValue: 'Todos' })}</option>
              <option value="extreme">{t('map.levelExtreme', { defaultValue: 'Desfavorable' })}</option>
              <option value="severe">{t('map.levelSevere', { defaultValue: 'Regular' })}</option>
              <option value="moderate">{t('map.levelModerate', { defaultValue: 'Aceptable' })}</option>
              <option value="good">{t('map.levelGood', { defaultValue: 'Favorable' })}</option>
              <option value="unknown">{t('map.noData', { defaultValue: 'Sin datos' })}</option>
            </select>
          </div>
          <div className="filter-row map-toolbar__meta">
            <span>
              {filteredZones.length} {t('map.zones', { defaultValue: 'zonas' })}
              {loadingAlerts ? ` · …` : ''}
            </span>
          </div>
        </div>
      )}

      <div className="map-layout">
        <div className="map-container-wrapper">
          <MapContainer
            center={SPAIN_CENTER}
            zoom={SPAIN_ZOOM}
            scrollWheelZoom
            preferCanvas
            zoomControl
            fadeAnimation={false}
            markerZoomAnimation={false}
            zoomAnimation
            className="map-leaflet-host"
            style={{
              height: mapMode === 'simple' ? 'min(50vh, 420px)' : 'min(70vh, 620px)',
              width: '100%',
              borderRadius: '20px',
              zIndex: 1,
            }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              updateWhenZooming={false}
              updateWhenIdle
              keepBuffer={1}
            />
            {showHotspots &&
              hotspotZones.map((zone) => {
                const meta = alertFromScore(scores[zone.id] ?? null)
                return <ZoneHotspot key={`hs-${zone.id}`} zone={zone} meta={meta} />
              })}
            {showMarkers &&
              filteredZones.map((zone) => {
                const meta = alertFromScore(scores[zone.id] ?? null)
                return (
                  <ZoneMapMarker
                    key={zone.id}
                    zone={zone}
                    meta={{
                      ...meta,
                      label: t(`map.alert.${meta.level}.label`, { defaultValue: meta.label }),
                    }}
                    onSelect={handleSelectZone}
                    openLabel={t('map.openCard', { defaultValue: 'Abrir' })}
                  />
                )
              })}
            <MapController zone={selectedZone} />
          </MapContainer>

          <div className="map-legend map-legend--alerts">
            <strong>{t('map.legendTitle', { defaultValue: 'Aviso de condiciones' })}</strong>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#b91c1c' }} />{' '}
              {t('map.levelExtreme', { defaultValue: 'Desfavorable' })}
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#c2410c' }} />{' '}
              {t('map.levelSevere', { defaultValue: 'Regular' })}
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#a16207' }} />{' '}
              {t('map.levelModerate', { defaultValue: 'Aceptable' })}
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#15803d' }} />{' '}
              {t('map.levelGood', { defaultValue: 'Favorable' })}
            </span>
            <span className="legend-item legend-item--hotspot">
              <span className="legend-hotspot-swatch" />{' '}
              {t('map.hotspotLegend', { defaultValue: 'Halo = hotspot educativo' })}
            </span>
          </div>
        </div>

        <div className="map-sidebar map-sidebar--sticky" id="map-sidebar">
          {!selectedZone ? (
            <div className="zone-placeholder">
              <EmptyState
                title={t('map.pickZoneTitle', { defaultValue: 'Selecciona una zona' })}
                description={t('map.pickZoneBody', {
                  defaultValue:
                    'Toca un marcador o una tarjeta del tablero. Los halos muestran hotspots de condiciones favorables (educativo).',
                })}
              />
              <ul className="zone-placeholder-list">
                <li>{t('map.feat1', { defaultValue: 'Aviso meteorológico por zona' })}</li>
                <li>{t('map.feat2', { defaultValue: 'Hotspots visuales + ficha lateral' })}</li>
                <li>{t('map.feat3', { defaultValue: 'Enlaces a fichas de la enciclopedia' })}</li>
                <li>{t('map.feat4', { defaultValue: 'Consejos y hábitat' })}</li>
              </ul>
              <div className="zone-stats">
                <div className="zone-stat">
                  <strong>{mushroomZones.length}</strong>
                  <span>{t('map.zones', { defaultValue: 'zonas' })}</span>
                </div>
                <div className="zone-stat">
                  <strong>{regions.length - 1}</strong>
                  <span>CC.AA.</span>
                </div>
                <div className="zone-stat">
                  <strong>{alertSummary.good}</strong>
                  <span>{t('map.hotspots', { defaultValue: 'hotspots' })}</span>
                </div>
              </div>
              <p className="zone-disclaimer">
                {t('map.disclaimer', {
                  defaultValue:
                    'No autoriza recolección ni consumo. Consulta normativa local y un micólogo. El mapa es educativo.',
                })}
              </p>
            </div>
          ) : (
            <div className="zone-detail zone-detail-card" data-testid="zone-detail-card">
              <button type="button" className="zone-close" onClick={() => setSelectedZone(null)}>
                {t('actions.back', { defaultValue: 'Cerrar' })}
              </button>

              {(() => {
                const meta = alertFromScore(scores[selectedZone.id] ?? null)
                const label = t(`map.alert.${meta.level}.label`, { defaultValue: meta.label })
                const advisory = t(`map.alert.${meta.level}.advisory`, {
                  defaultValue: meta.advisory,
                })
                return (
                  <div
                    className="zone-detail-alert"
                    style={{ borderColor: meta.border, background: meta.bg }}
                  >
                    <span style={{ color: meta.color, fontWeight: 800 }}>{label}</span>
                    {meta.score !== null && (
                      <span style={{ color: meta.color }}> · {meta.score}/100</span>
                    )}
                    <p>{advisory}</p>
                    {isHotspotActive(meta.level) && (
                      <p className="zone-hotspot-badge">
                        {t('map.hotspotActive', {
                          defaultValue: 'Hotspot activo (condiciones favorables/aceptables)',
                        })}
                      </p>
                    )}
                  </div>
                )
              })()}

              <h2 className="zone-detail-name">{shortZoneLabel(selectedZone.name, 40)}</h2>
              <p className="zone-detail-region">{selectedZone.region}</p>
              <p className="zone-detail-desc zone-detail-desc--clamp">{selectedZone.description}</p>

              <ZoneWeatherPanel
                lat={selectedZone.lat}
                lng={selectedZone.lng}
                cached={
                  selectedZone.id in conditionsMap
                    ? conditionsMap[selectedZone.id]
                    : undefined
                }
              />

              <div className="zone-links">
                <a
                  href={`https://www.openstreetmap.org/?mlat=${selectedZone.lat}&mlon=${selectedZone.lng}#map=11/${selectedZone.lat}/${selectedZone.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  OpenStreetMap
                </a>
                <a
                  href={`https://www.google.com/maps?q=${selectedZone.lat},${selectedZone.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google Maps
                </a>
                <a
                  href="https://www.aemet.es/es/eltiempo/prediccion/municipios"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  AEMET
                </a>
                <Link to="/enciclopedia">{t('nav.encyclopedia', { defaultValue: 'Enciclopedia' })}</Link>
                <Link to="/identificar">{t('nav.identify', { defaultValue: 'Identificar' })}</Link>
              </div>

              <div className="zone-detail-meta">
                <div className="zone-meta-item">
                  <span className="zone-meta-label">
                    {t('map.habitat', { defaultValue: 'Hábitat' })}
                  </span>
                  <span className="zone-meta-value">{selectedZone.habitat}</span>
                </div>
                <div className="zone-meta-item">
                  <span className="zone-meta-label">
                    {t('map.season', { defaultValue: 'Temporada' })}
                  </span>
                  <span className="zone-meta-value">{selectedZone.season}</span>
                </div>
                <div className="zone-meta-item">
                  <span className="zone-meta-label">
                    {t('map.abundance', { defaultValue: 'Producción habitual' })}
                  </span>
                  <span className="zone-meta-value">{selectedZone.abundance}</span>
                </div>
              </div>

              <div className="zone-tips">
                <strong>{t('map.tips', { defaultValue: 'Consejos de campo' })}</strong>
                <ul>
                  {selectedZone.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>

              <div className="zone-species">
                <h3>
                  {t('map.speciesTitle', {
                    count: selectedZone.species.length,
                    defaultValue: 'Especies orientativas ({{count}})',
                  })}
                </h3>
                <div className="zone-species-list">
                  {selectedZone.species.map((sciName) => {
                    const cat = getSpeciesByTaxon(sciName)
                    const risk = getRiskMeta(cat?.risk_label || 'dangerous_or_unknown')
                    const slug = speciesSlug(sciName)
                    return (
                      <Link
                        key={sciName}
                        to={`/enciclopedia/${slug}`}
                        className="zone-species-card"
                      >
                        <SpeciesThumb
                          taxon={sciName}
                          riskLabel={cat?.risk_label}
                          alt={sciName}
                          size={48}
                          className="zone-species-card__thumb"
                        />
                        <div className="species-info">
                          <SpeciesNameBlock
                            taxon={sciName}
                            commonNames={cat?.common_names}
                            family={cat?.family}
                            familyEs={cat?.family_es}
                            size="sm"
                          />
                        </div>
                        <span className={`risk-chip ${risk.className}`}>{risk.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
              <p className="zone-disclaimer">
                {t('map.disclaimer', {
                  defaultValue:
                    'No autoriza recolección ni consumo. Consulta normativa local y un micólogo. El mapa es educativo.',
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="zone-list-section zone-list-section--compact">
        <div className="zone-list-head">
          <h2 className="zone-list-title">
            {t('map.boardTitleShort', {
              count: filteredZones.length,
              defaultValue: 'Zonas ({{count}})',
            })}
          </h2>
          <span className="zone-list-hint">
            {t('map.boardHint', { defaultValue: 'Toca para volar al mapa' })}
          </span>
        </div>
        {filteredZones.length === 0 ? (
          <EmptyState
            title={t('map.emptyFilterTitle', { defaultValue: 'Sin zonas' })}
            description={t('map.emptyFilterBody', {
              defaultValue: 'Quita filtros o elige otra comunidad.',
            })}
            actionLabel={t('map.resetFilters', { defaultValue: 'Reset' })}
            onAction={() => {
              setFilterRegion('todas')
              setFilterAlert('todas')
              setOnlyHotspots(false)
            }}
          />
        ) : (
          <div className="zone-list-rail" role="list">
            {filteredZones.map((zone) => {
              const meta = alertFromScore(scores[zone.id] ?? null)
              const hot = isHotspotActive(meta.level)
              const scoreTxt =
                meta.score !== null ? String(meta.score) : loadingAlerts ? '…' : '—'
              return (
                <button
                  key={zone.id}
                  type="button"
                  role="listitem"
                  title={zone.name}
                  className={`zone-pill ${selectedZone?.id === zone.id ? 'is-active' : ''} ${hot ? 'is-hot' : ''}`}
                  style={{ ['--pill' as string]: meta.color }}
                  onClick={() => handleSelectZone(zone)}
                >
                  <span className="zone-pill__dot" aria-hidden />
                  <span className="zone-pill__name">{shortZoneLabel(zone.name)}</span>
                  <span className="zone-pill__score">{scoreTxt}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
