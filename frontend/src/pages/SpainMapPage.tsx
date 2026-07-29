/**
 * Mycological zones map — visual hotspots + weather alerts (D-12) + M2 interactivity.
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
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet'
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
import { getZoneResourcePack, kindLabelEs } from '../data/zonePermitLinks'
import {
  B2B_PARTNER_BLURB_ES,
  kindLabelEs as regulatedKindLabelEs,
  listRegulatedZones,
  regulatedZoneStats,
  REGULATED_DIRECTORY_CAP,
} from '../lib/regulatedZones'
import { getSpeciesByTaxon, loadSpeciesCatalog } from '../data/speciesCatalog'
import { SpeciesThumb } from '../components/SpeciesThumb'
import {
  fetchWeatherData,
  evaluateMushroomConditions,
  type WeatherData,
  type MushroomConditions,
} from '../api/weather'
import {
  alertFromScore,
  hotspotRadiusMeters,
  isHotspotActive,
  mapPoolChunked,
  type ZoneAlertMeta,
} from '../lib/zoneAlerts'
import {
  CLUSTER_BELOW_ZOOM,
  clusterZones,
  filterZonesByQuery,
  findZoneById,
  nearestZone,
  replaceMapUrl,
  resolveMapDeepLink,
  stickyRegionAfterSearchChange,
  suggestZonesByQuery,
  topHotspotsByScore,
  type MapCluster,
} from '../lib/mapInteraction'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const iconCache = new Map<string, L.DivIcon>()
const clusterIconCache = new Map<string, L.DivIcon>()

/** Clear marker icon cache (call on i18n language change). */
export function clearZoneAlertIconCache(): void {
  iconCache.clear()
  clusterIconCache.clear()
}

/**
 * Premium alert pin: moss ring + readable score; pulse only when favorable (M1).
 * Cache key includes locale so translated aria-label stays correct after language switch.
 */
function makeAlertIcon(meta: ZoneAlertMeta, locale: string): L.DivIcon {
  const key = `${locale}:${meta.level}:${meta.score ?? 'n'}`
  const hit = iconCache.get(key)
  if (hit) return hit
  const color = meta.color
  const pulse = meta.level === 'good'
  const levelClass = `zam--${meta.level}`
  const scoreTxt = meta.score === null ? '·' : String(Math.round(meta.score))
  const aria = `${meta.label} ${scoreTxt}`.replace(/"/g, '&quot;')
  const icon = L.divIcon({
    className: 'zone-alert-marker',
    html: `<div class="zam ${levelClass}${pulse ? ' zam--pulse' : ''}" style="--zam:${color}" role="img" aria-label="${aria}">
      <span class="zam__ring" aria-hidden="true"></span>
      <span class="zam__core">
        <span class="zam__score">${scoreTxt}</span>
      </span>
    </div>`,
    iconSize: [40, 44],
    iconAnchor: [20, 40],
    popupAnchor: [0, -36],
  })
  iconCache.set(key, icon)
  return icon
}

/** Cache key includes locale + word so aria-label stays i18n-correct. */
function makeClusterIcon(count: number, locale: string, zonesWord: string): L.DivIcon {
  const n = count > 99 ? 99 : count
  const key = `${locale}:${n}:${zonesWord}`
  const hit = clusterIconCache.get(key)
  if (hit) return hit
  const size = count >= 20 ? 48 : count >= 8 ? 42 : 36
  const label = count > 99 ? '99+' : String(count)
  const aria = `${label} ${zonesWord}`.replace(/"/g, '&quot;')
  const icon = L.divIcon({
    className: 'zone-cluster-marker',
    html: `<div class="zcm" style="--zcm-size:${size}px" role="img" aria-label="${aria}">
      <span class="zcm__count">${label}</span>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
  clusterIconCache.set(key, icon)
  return icon
}

/** Zoom when opening a single zone card (close enough to see the place). */
const ZONE_FOCUS_ZOOM = 10

function MapController({
  zone,
  regionFocus,
}: {
  zone: MushroomZone | null
  /** Fit map to these points when region filter changes (e.g. all Soria zones). */
  regionFocus: { key: string; points: Array<{ lat: number; lng: number }> } | null
}) {
  const map = useMap()
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 100)
    return () => window.clearTimeout(t)
  }, [map])

  // Click / select zone → always fly to THAT place (not stay zoomed on previous area)
  useEffect(() => {
    if (!zone) return
    map.flyTo([zone.lat, zone.lng], ZONE_FOCUS_ZOOM, {
      duration: 0.65,
      easeLinearity: 0.3,
    })
  }, [zone?.id, map]) // eslint-disable-line react-hooks/exhaustive-deps -- only re-fly when zone identity changes

  // Comunidad / filtro → encuadra las zonas de esa área
  useEffect(() => {
    if (!regionFocus || regionFocus.points.length === 0) return
    if (regionFocus.key === 'todas') {
      map.flyTo(SPAIN_CENTER, SPAIN_ZOOM, { duration: 0.55 })
      return
    }
    if (regionFocus.points.length === 1) {
      const p = regionFocus.points[0]
      map.flyTo([p.lat, p.lng], ZONE_FOCUS_ZOOM, { duration: 0.55 })
      return
    }
    const bounds = L.latLngBounds(regionFocus.points.map((p) => [p.lat, p.lng] as [number, number]))
    map.fitBounds(bounds.pad(0.18), { maxZoom: 10, animate: true, duration: 0.55 })
  }, [regionFocus?.key, map]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

/** Only recluster on zoomend (not mid-animation) — avoids flicker/work. */
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap()
  useEffect(() => {
    const emit = () => onZoom(map.getZoom())
    emit()
    map.on('zoomend', emit)
    return () => {
      map.off('zoomend', emit)
    }
  }, [map, onZoom])
  return null
}

function FlyToCluster({
  target,
}: {
  target: { lat: number; lng: number; zoom: number } | null
}) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], target.zoom, {
      duration: 0.45,
      easeLinearity: 0.35,
    })
  }, [target, map])
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

/** One click / keyboard → open compact float card (no Leaflet popup friction). */
const ZoneMapMarker = memo(function ZoneMapMarker({
  zone,
  meta,
  onSelect,
  locale,
  selected,
}: {
  zone: MushroomZone
  meta: ZoneAlertMeta
  onSelect: (z: MushroomZone) => void
  locale: string
  selected?: boolean
}) {
  const onClick = useCallback(() => onSelect(zone), [onSelect, zone])
  const handlers = useMemo(
    () => ({
      click: onClick,
      keydown: (e: L.LeafletKeyboardEvent) => {
        const key = e.originalEvent?.key
        if (key === 'Enter' || key === ' ') {
          e.originalEvent?.preventDefault?.()
          onClick()
        }
      },
      add: (e: L.LeafletEvent) => {
        const el = (e.target as L.Marker)?.getElement?.()
        if (!el) return
        el.setAttribute('tabindex', '0')
        el.setAttribute('role', 'button')
        const scorePart = meta.score !== null ? `, índice ${meta.score}` : ''
        el.setAttribute(
          'aria-label',
          `${zone.name}. ${meta.label}${scorePart}. Abrir ficha de zona.`,
        )
        if (selected) el.setAttribute('aria-current', 'true')
        else el.removeAttribute('aria-current')
      },
    }),
    [onClick, zone.name, meta.label, meta.score, selected],
  )
  const scorePart = meta.score !== null ? ` · ${meta.score}/100` : ''
  return (
    <Marker
      position={[zone.lat, zone.lng]}
      icon={makeAlertIcon(meta, locale)}
      eventHandlers={handlers}
      title={`${zone.name} · ${meta.label}${scorePart}`}
      opacity={selected ? 1 : 0.92}
      zIndexOffset={selected ? 800 : 0}
      keyboard
    />
  )
})

const ClusterMapMarker = memo(function ClusterMapMarker({
  cluster,
  onOpen,
  expandLabel,
  locale,
  zonesWord,
}: {
  cluster: Extract<MapCluster, { type: 'cluster' }>
  onOpen: (c: Extract<MapCluster, { type: 'cluster' }>) => void
  expandLabel: string
  locale: string
  zonesWord: string
}) {
  const onClick = useCallback(() => onOpen(cluster), [onOpen, cluster])
  const handlers = useMemo(() => ({ click: onClick }), [onClick])
  return (
    <Marker
      position={[cluster.lat, cluster.lng]}
      icon={makeClusterIcon(cluster.count, locale, zonesWord)}
      eventHandlers={handlers}
      title={expandLabel}
    />
  )
})

type ZoneWeatherSnap = {
  weather: WeatherData
  conditions: MushroomConditions
}

/** Unified zone card: climate metrics + what the score means + permits. */
function ZoneDetailBody({
  zone,
  scores,
  weatherSnap,
  weatherLoading,
  onClose,
}: {
  zone: MushroomZone
  scores: Record<string, number | null>
  weatherSnap: ZoneWeatherSnap | null | undefined
  weatherLoading: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const meta = alertFromScore(scores[zone.id] ?? null)
  const label = t(`map.alert.${meta.level}.label`, { defaultValue: meta.label })
  const advisory = t(`map.alert.${meta.level}.advisory`, {
    defaultValue: meta.advisory,
  })
  const preview = zone.species.slice(0, 4)
  const resources = getZoneResourcePack(zone)
  const province =
    zone.provinces?.length ? zone.provinces.join(' · ') : null
  const w = weatherSnap?.weather
  const details = weatherSnap?.conditions.details ?? []

  return (
    <div
      className="zone-detail zone-detail-card zone-detail-card--hero"
      data-testid="zone-detail-card"
    >
      <div className="zone-detail__sheet-handle" aria-hidden />
      <button
        type="button"
        className="zone-close zone-close--hero"
        id="map-zone-close"
        onClick={onClose}
      >
        {t('actions.back', { defaultValue: 'Cerrar' })}
      </button>

      <header className="zone-hero-head">
        <p className="zone-detail-region zone-detail-region--peek">
          {zone.region}
          {province ? ` · ${province}` : ''}
        </p>
        <h2 className="zone-detail-name zone-detail-name--hero">{zone.name}</h2>
        <div
          className="zone-detail-alert zone-detail-alert--peek"
          style={{ borderColor: meta.border, background: meta.bg }}
        >
          <span style={{ color: meta.color, fontWeight: 800 }}>{label}</span>
          {meta.score !== null && (
            <span style={{ color: meta.color }}> · {meta.score}/100</span>
          )}
        </div>
        <p className="zone-detail-advisory">{advisory}</p>
        <div className="zone-detail-meta zone-detail-meta--peek">
          {zone.habitat ? (
            <span className="zone-meta-chip">{zone.habitat}</span>
          ) : null}
          {zone.season ? (
            <span className="zone-meta-chip">{zone.season}</span>
          ) : null}
        </div>
      </header>

      {/* Climate block — explains Favorable / Desfavorable with real metrics */}
      <section className="zone-climate" aria-label="Condiciones meteorológicas">
        <h3 className="zone-climate__title">
          {t('map.climateTitle', {
            defaultValue: 'Condiciones ahora (orientativas)',
          })}
        </h3>
        {weatherLoading && !w ? (
          <p className="zone-climate__loading">
            {t('map.weatherLoading', {
              defaultValue: 'Cargando temperatura y humedad…',
            })}
          </p>
        ) : w ? (
          <>
            <div className="zone-climate__grid">
              <div className="zone-climate__metric">
                <span className="zone-climate__k">
                  {t('map.metricTemp', { defaultValue: 'Temperatura' })}
                </span>
                <span className="zone-climate__v">
                  {w.temperature > -50 ? `${w.temperature.toFixed(1)} °C` : '—'}
                </span>
              </div>
              <div className="zone-climate__metric">
                <span className="zone-climate__k">
                  {t('map.metricHumidity', { defaultValue: 'Humedad aire' })}
                </span>
                <span className="zone-climate__v">
                  {w.relativeHumidity >= 0
                    ? `${w.relativeHumidity.toFixed(0)} %`
                    : '—'}
                </span>
              </div>
              <div className="zone-climate__metric">
                <span className="zone-climate__k">
                  {t('map.metricSoil', { defaultValue: 'Humedad suelo' })}
                </span>
                <span className="zone-climate__v">
                  {w.soilMoisture07 >= 0
                    ? `${w.soilMoisture07.toFixed(0)} %`
                    : '—'}
                </span>
              </div>
              <div className="zone-climate__metric">
                <span className="zone-climate__k">
                  {t('map.metricSoilTemp', { defaultValue: 'Temp. suelo' })}
                </span>
                <span className="zone-climate__v">
                  {w.soilTemperature > -50
                    ? `${w.soilTemperature.toFixed(1)} °C`
                    : '—'}
                </span>
              </div>
              <div className="zone-climate__metric">
                <span className="zone-climate__k">
                  {t('map.metricRain', { defaultValue: 'Lluvia (ahora)' })}
                </span>
                <span className="zone-climate__v">
                  {`${w.precipitation.toFixed(1)} mm`}
                </span>
              </div>
              <div className="zone-climate__metric">
                <span className="zone-climate__k">
                  {t('map.metricRainProb', { defaultValue: 'Prob. lluvia' })}
                </span>
                <span className="zone-climate__v">
                  {`${w.precipitationProbability.toFixed(0)} %`}
                </span>
              </div>
            </div>
            {details.length > 0 && (
              <ul className="zone-climate__details">
                {details.slice(0, 6).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            <p className="zone-climate__legend">
              {t('map.climateLegend', {
                defaultValue:
                  'Índice 0–100: Favorable ≥75 · Aceptable ≥55 · Regular ≥35 · Desfavorable <35. No es permiso de recolección.',
              })}
            </p>
          </>
        ) : (
          <p className="zone-climate__loading">
            {t('map.weatherErrorBody', {
              defaultValue:
                'Sin datos meteorológicos en vivo. Puedes seguir explorando la zona.',
            })}
          </p>
        )}
      </section>

      {zone.description ? (
        <p className="zone-detail-desc zone-detail-desc--hero">
          {zone.description.length > 180
            ? `${zone.description.slice(0, 177).trim()}…`
            : zone.description}
        </p>
      ) : null}

      {preview.length > 0 && (
        <div className="zone-species-peek">
          <p className="zone-species-peek__label">
            {t('map.speciesPeek', {
              defaultValue: 'Especies orientativas',
            })}
          </p>
          <div className="zone-species-peek__row zone-species-peek__row--hero">
            {preview.map((sciName) => {
              const cat = getSpeciesByTaxon(sciName)
              const slug = speciesSlug(sciName)
              const common =
                cat?.common_names?.find((n) => n && !/^hondo\b/i.test(n)) ||
                cat?.common_names?.[0] ||
                cat?.display_name ||
                null
              return (
                <Link
                  key={sciName}
                  to={`/enciclopedia/${slug}`}
                  className="zone-species-peek__item zone-species-peek__item--clean"
                  title={sciName}
                >
                  <SpeciesThumb
                    taxon={sciName}
                    riskLabel={cat?.risk_label}
                    alt={common || sciName}
                    size={56}
                  />
                  <span className="zone-species-peek__name">
                    {common || sciName}
                  </span>
                  {common ? (
                    <span className="zone-species-peek__sci">{sciName}</span>
                  ) : null}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      <section className="zone-resources" aria-label="Permisos e información">
        <h3 className="zone-resources__title">
          {t('map.permitsTitle', {
            defaultValue: 'Permisos e información oficial',
          })}
        </h3>
        {resources.note ? (
          <p className="zone-resources__note">{resources.note}</p>
        ) : null}
        {(() => {
          const permit = resources.links.find((l) => l.kind === 'permit')
          if (!permit) return null
          return (
            <a
              href={permit.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-atelier btn-atelier--primary zone-resources__cta"
              data-testid="zone-permit-cta"
            >
              {t('map.permitCta', {
                defaultValue: 'Tramitar permiso en web oficial',
              })}{' '}
              <span aria-hidden>↗</span>
            </a>
          )
        })()}
        <ul className="zone-resources__list">
          {resources.links.map((link) => (
            <li key={`${link.kind}:${link.url}`}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`zone-resource-link zone-resource-link--${link.kind}`}
              >
                <span className="zone-resource-link__kind">
                  {kindLabelEs(link.kind)}
                </span>
                <span className="zone-resource-link__label">{link.label}</span>
                <span className="zone-resource-link__arrow" aria-hidden>
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
        <p className="zone-resources__policy muted">
          {t('map.permitPolicy', {
            defaultValue:
              'VisionSetil no vende permisos. Solo enlaces a gestores oficiales.',
          })}
        </p>
      </section>

      <div className="zone-detail-actions zone-detail-actions--hero">
        <Link
          to="/enciclopedia"
          className="btn-atelier btn-atelier--primary zone-detail-actions__main"
        >
          {t('map.openEncyclopedia', { defaultValue: 'Enciclopedia' })}
        </Link>
        <a
          href={`https://www.openstreetmap.org/?mlat=${zone.lat}&mlon=${zone.lng}#map=12/${zone.lat}/${zone.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-atelier btn-atelier--ghost"
        >
          {t('map.openOsm', { defaultValue: 'Ver en mapa' })}
        </a>
        <button
          type="button"
          className="btn-atelier btn-atelier--ghost"
          onClick={onClose}
        >
          {t('map.keepExploring', { defaultValue: 'Seguir' })}
        </button>
      </div>

      <p className="zone-disclaimer zone-disclaimer--peek">
        {t('map.disclaimerShort', {
          defaultValue:
            'Educativo · no autoriza recolección ni consumo. Enlaces a webs oficiales o de gestión del coto.',
        })}
      </p>
    </div>
  )
}

/** One-shot deep-link bootstrap so first paint matches URL (no replaceState race). */
function readMapDeepLinkBootstrap() {
  const regionList = [
    'todas',
    ...Array.from(new Set(mushroomZones.map((z) => z.region))).sort(),
  ]
  if (typeof window === 'undefined') {
    return {
      zone: null as MushroomZone | null,
      filterRegion: 'todas',
      searchQuery: '',
      stickyRegion: null as string | null,
      zoneMissing: null as string | null,
    }
  }
  const r = resolveMapDeepLink(window.location.search, mushroomZones, regionList)
  return {
    zone: r.zoneId ? findZoneById(mushroomZones, r.zoneId) : null,
    filterRegion: r.filterRegion,
    searchQuery: r.searchQuery,
    stickyRegion: r.stickyRegion,
    zoneMissing: r.zoneMissing,
  }
}

export default function SpainMapPage() {
  const { t, i18n } = useTranslation()
  const mapLocale = i18n.resolvedLanguage || i18n.language || 'es'

  // Lazy once: initial selection/region/search from `?zone=` / `?region=` (M2.4)
  const [deepLinkBoot] = useState(readMapDeepLinkBootstrap)
  const [selectedZone, setSelectedZone] = useState<MushroomZone | null>(
    () => deepLinkBoot.zone,
  )
  const [filterRegion, setFilterRegion] = useState(() => deepLinkBoot.filterRegion)
  const [filterAlert, setFilterAlert] = useState<string>('todas')
  const [searchQuery, setSearchQuery] = useState(() => deepLinkBoot.searchQuery)
  const [zoneNotFound, setZoneNotFound] = useState<string | null>(
    () => deepLinkBoot.zoneMissing,
  )
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [weatherByZone, setWeatherByZone] = useState<
    Record<string, ZoneWeatherSnap | null>
  >({})
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [weatherFailedAll, setWeatherFailedAll] = useState(false)
  const [showHotspots, setShowHotspots] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [onlyHotspots, setOnlyHotspots] = useState(false)
  const [mapZoom, setMapZoom] = useState(SPAIN_ZOOM)
  const [clusterFly, setClusterFly] = useState<{
    lat: number
    lng: number
    zoom: number
  } | null>(null)
  const [geoStatus, setGeoStatus] = useState<
    'idle' | 'loading' | 'denied' | 'unsupported' | 'error'
  >('idle')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const cancelledRef = useRef(false)
  const loadedZonesRef = useRef(0)
  /** Preserve non-CCAA deep-link region (e.g. Soria province) in URL. */
  const stickyRegionParamRef = useRef<string | null>(deepLinkBoot.stickyRegion)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const focusBeforeSheetRef = useRef<HTMLElement | null>(null)

  const regions = useMemo(() => {
    const set = new Set(mushroomZones.map((z) => z.region))
    return ['todas', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))]
  }, [])

  /** Priority chips for quick CCAA filter (canonical inventory labels). */
  const regionChips = useMemo(() => {
    const preferred = [
      'Castilla y León',
      'Aragón',
      'Navarra',
      'País Vasco',
      'Galicia',
      'Cataluña',
      'Andalucía',
      'Asturias',
      'Cantabria',
    ]
    const available = new Set(regions.filter((r) => r !== 'todas'))
    return preferred.filter((r) => available.has(r))
  }, [regions])

  const zoneById = useMemo(() => {
    const m = new Map<string, MushroomZone>()
    for (const z of mushroomZones) m.set(z.id, z)
    return m
  }, [])

  const searchSuggestions = useMemo(
    () => suggestZonesByQuery(mushroomZones, searchQuery, 6),
    [searchQuery],
  )

  useEffect(() => {
    void loadSpeciesCatalog()
  }, [])

  useEffect(() => {
    clearZoneAlertIconCache()
  }, [mapLocale])

  // Keep URL in sync (replaceState — no history spam). State already bootstrapped from URL.
  useEffect(() => {
    replaceMapUrl({
      zoneId: selectedZone?.id ?? null,
      region:
        filterRegion !== 'todas'
          ? filterRegion
          : stickyRegionParamRef.current,
      query: searchQuery.trim() || null,
    })
  }, [selectedZone, filterRegion, searchQuery])

  // Progressive weather load — chunked, low concurrency (D-12 perf + M1 % progress)
  useEffect(() => {
    cancelledRef.current = false
    loadedZonesRef.current = 0
    setLoadingAlerts(true)
    setLoadProgress(0)
    setWeatherFailedAll(false)
    const totalZones = mushroomZones.length

    type WeatherRow = {
      score: number | null
      snap: ZoneWeatherSnap | null
      ok: boolean
    }

    void mapPoolChunked<MushroomZone, WeatherRow>(
      mushroomZones,
      {
        concurrency: 3,
        chunkSize: 10,
        onChunk: (partial) => {
          if (cancelledRef.current) return
          loadedZonesRef.current += partial.length
          const pct = Math.min(
            99,
            Math.round((loadedZonesRef.current / Math.max(1, totalZones)) * 100),
          )
          startTransition(() => {
            setLoadProgress(pct)
            setScores((prev) => {
              const next = { ...prev }
              for (const p of partial) {
                const zone = mushroomZones[p.index]
                if (!zone) continue
                next[zone.id] = p.value.score
              }
              return next
            })
            setWeatherByZone((prev) => {
              const next = { ...prev }
              for (const p of partial) {
                const zone = mushroomZones[p.index]
                if (!zone) continue
                next[zone.id] = p.value.snap
              }
              return next
            })
          })
        },
      },
      async (zone) => {
        const w = await fetchWeatherData(zone.lat, zone.lng)
        if (!w) {
          return { score: null, snap: null, ok: false }
        }
        const cond = evaluateMushroomConditions(w)
        return {
          score: cond.score,
          snap: { weather: w, conditions: cond },
          ok: true,
        }
      },
    ).then((results) => {
      if (cancelledRef.current) return
      setLoadingAlerts(false)
      setLoadProgress(100)
      const anyOk = results.some((r) => r.ok)
      const anyFail = results.some((r) => !r.ok)
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

  const filteredZones = useMemo(() => {
    const base = mushroomZones.filter((z) => {
      if (filterRegion !== 'todas' && z.region !== filterRegion) return false
      if (onlyHotspots) {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (!isHotspotActive(level) && selectedZone?.id !== z.id) return false
      }
      if (filterAlert !== 'todas') {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (level !== filterAlert) return false
      }
      return true
    })
    return filterZonesByQuery(base, searchQuery)
  }, [filterRegion, filterAlert, scores, onlyHotspots, selectedZone, searchQuery])

  /** Hotspot glows for favorable/acceptable (and selected). */
  const hotspotZones = useMemo(() => {
    return filteredZones.filter((z) => {
      if (selectedZone?.id === z.id) return true
      const level = alertFromScore(scores[z.id] ?? null).level
      return isHotspotActive(level)
    })
  }, [filteredZones, scores, selectedZone])

  // M2.1 Top 5 of the day (global scores — not re-filtered by search)
  const topHotspots = useMemo(() => {
    const ids = mushroomZones.map((z) => z.id)
    return topHotspotsByScore(ids, scores, 5)
      .map((row) => {
        const zone = zoneById.get(row.id)
        if (!zone) return null
        return { zone, score: row.score }
      })
      .filter((x): x is { zone: MushroomZone; score: number } => x != null)
  }, [scores, zoneById])

  // M2.2 clustering when zoomed out
  const mapClusters = useMemo(() => {
    if (!showMarkers) return [] as MapCluster[]
    return clusterZones(filteredZones, mapZoom, {
      clusterBelowZoom: CLUSTER_BELOW_ZOOM,
    })
  }, [filteredZones, mapZoom, showMarkers])

  /**
   * When user picks Comunidad / busca, pan the map to that area
   * (e.g. filter → Pinares de Soria lands on their lat/lng, not Spain overview).
   */
  const regionFocus = useMemo(() => {
    const key =
      filterRegion !== 'todas'
        ? `region:${filterRegion}`
        : searchQuery.trim()
          ? `q:${searchQuery.trim().toLowerCase()}`
          : onlyHotspots
            ? 'hotspots'
            : 'todas'
    if (key === 'todas') {
      return { key: 'todas', points: [] as Array<{ lat: number; lng: number }> }
    }
    const pts = filteredZones.map((z) => ({ lat: z.lat, lng: z.lng }))
    return { key, points: pts }
  }, [filterRegion, searchQuery, onlyHotspots, filteredZones])

  const handleSelectZone = useCallback((zone: MushroomZone) => {
    setZoneNotFound(null)
    setSelectedZone(zone)
  }, [])

  const handleClearZone = useCallback(() => {
    setSelectedZone(null)
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    stickyRegionParamRef.current = stickyRegionAfterSearchChange(
      stickyRegionParamRef.current,
      value,
    )
  }, [])

  const handleClusterOpen = useCallback(
    (c: Extract<MapCluster, { type: 'cluster' }>) => {
      const nextZoom = Math.min(12, Math.max(mapZoom + 2, CLUSTER_BELOW_ZOOM))
      setClusterFly({ lat: c.lat, lng: c.lng, zoom: nextZoom })
    },
    [mapZoom],
  )

  const handleZoom = useCallback((z: number) => {
    setMapZoom((prev) => (prev === z ? prev : z))
  }, [])

  // Esc cierra la tarjeta de zona (sin listado inferior de nombres)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selectedZone) return
      e.preventDefault()
      setSelectedZone(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedZone])

  const sheetOpen = Boolean(selectedZone)

  // Focus close on open, restore on close; light Tab trap (float sheet all sizes)
  useEffect(() => {
    if (!sheetOpen) return
    focusBeforeSheetRef.current =
      (document.activeElement as HTMLElement | null) ?? null
    const t = window.setTimeout(() => {
      document.getElementById('map-zone-close')?.focus()
    }, 0)

    const onTrap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !sidebarRef.current) return
      const root = sidebarRef.current
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const list = Array.from(focusables).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      )
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last || !root.contains(active)) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onTrap, true)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onTrap, true)
      const prev = focusBeforeSheetRef.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          /* ignore */
        }
      }
      focusBeforeSheetRef.current = null
    }
  }, [sheetOpen, selectedZone?.id])

  // M2.8 geolocation opt-in — session only, no storage
  const handleNearMe = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unsupported')
      return
    }
    setGeoStatus('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const near = nearestZone(
          mushroomZones,
          pos.coords.latitude,
          pos.coords.longitude,
        )
        if (near) {
          setFilterRegion('todas')
          setSearchQuery('')
          stickyRegionParamRef.current = null
          handleSelectZone(near)
          setGeoStatus('idle')
        } else {
          setGeoStatus('error')
        }
      },
      (err) => {
        setGeoStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 0 },
    )
  }, [handleSelectZone])

  // Map-first: no bottom zone-name rail — maximize map area.
  const mapHeight = 'calc(100vh - var(--header-h, 64px) - 6.25rem)'

  const regulatedRows = useMemo(() => listRegulatedZones(), [])
  const regulatedStats = useMemo(() => regulatedZoneStats(), [])
  const [showRegulatedDir, setShowRegulatedDir] = useState(false)
  const [regulatedFilter, setRegulatedFilter] = useState<
    'all' | 'coto_cyl' | 'parque' | 'coto'
  >('all')
  const regulatedVisible = useMemo(() => {
    const rows =
      regulatedFilter === 'all'
        ? regulatedRows
        : regulatedRows.filter((r) => r.kind === regulatedFilter)
    return rows.slice(0, REGULATED_DIRECTORY_CAP)
  }, [regulatedRows, regulatedFilter])

  return (
    <div
      className={`page-map page-map--immersive page-map--map-first page-atelier-shell${
        sheetOpen ? ' page-map--sheet-open' : ''
      }`}
    >
      {/* Unified chrome: one mode, filters + climate on zone click */}
      <header className="map-chrome">
        <div className="map-chrome__title-row">
          <h1 className="map-chrome__title">
            {t('map.title', { defaultValue: 'Mapa micológico' })}
          </h1>
          <span className="map-safety-chip" role="note">
            {t('map.safetyChip', { defaultValue: 'Educativo · no recolección' })}
          </span>
          <span
            className="map-safety-chip map-safety-chip--mv"
            role="note"
            data-testid="map-multiview-chip"
            title={t('map.multiviewTip', {
              defaultValue:
                'En el campo: foto láminas + perfil + base. El mapa no identifica ni autoriza consumo.',
            })}
          >
            {t('map.multiviewChip', {
              defaultValue: 'Campo · multi-vista',
            })}
          </span>
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost map-chrome__b2b"
            data-testid="map-regulated-toggle"
            aria-expanded={showRegulatedDir}
            onClick={() => setShowRegulatedDir((v) => !v)}
          >
            Cotos / parques ({regulatedStats.total})
          </button>
        </div>

        <div className="map-chrome__filters" role="search">
          <div className="map-search-wrap">
            <input
              ref={searchInputRef}
              id="map-zone-search"
              type="search"
              className="map-search-input map-chrome__search"
              data-testid="map-zone-search"
              placeholder={t('map.searchPlaceholder', {
                defaultValue: 'Buscar Picos, Soria, hayedo…',
              })}
              value={searchQuery}
              onChange={(e) => {
                handleSearchChange(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                // Delay so suggestion click registers
                window.setTimeout(() => setShowSuggestions(false), 140)
              }}
              autoComplete="off"
              enterKeyHint="search"
              aria-label={t('map.searchLabel', { defaultValue: 'Buscar zona' })}
              aria-autocomplete="list"
              aria-controls="map-search-suggestions"
              aria-expanded={showSuggestions && searchSuggestions.length > 0}
            />
            {showSuggestions && searchSuggestions.length > 0 && (
              <ul
                id="map-search-suggestions"
                className="map-search-suggestions"
                role="listbox"
                data-testid="map-search-suggestions"
              >
                {searchSuggestions.map((z) => (
                  <li key={z.id} role="option">
                    <button
                      type="button"
                      className="map-search-suggestions__item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        handleSearchChange(z.name)
                        handleSelectZone(z)
                        setShowSuggestions(false)
                      }}
                    >
                      <strong>{shortZoneLabel(z.name, 36)}</strong>
                      <span className="muted">
                        {z.region}
                        {z.provinces?.length ? ` · ${z.provinces[0]}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            id="map-region-select"
            className="map-chrome__select"
            value={filterRegion}
            onChange={(e) => {
              const v = e.target.value
              setFilterRegion(v)
              stickyRegionParamRef.current = v === 'todas' ? null : v
            }}
            data-testid="map-region-select"
            aria-label={t('map.region', { defaultValue: 'Comunidad' })}
          >
            <option value="todas">{t('map.allRegions', { defaultValue: 'Todas' })}</option>
            {regions
              .filter((r) => r !== 'todas')
              .map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
          </select>
          <select
            id="map-alert-select"
            className="map-chrome__select"
            value={filterAlert}
            onChange={(e) => setFilterAlert(e.target.value)}
            aria-label={t('map.alertFilter', { defaultValue: 'Condiciones' })}
          >
            <option value="todas">
              {t('map.allLevels', { defaultValue: 'Todas las condiciones' })}
            </option>
            <option value="good">
              {t('map.levelGood', { defaultValue: 'Favorable' })}
            </option>
            <option value="moderate">
              {t('map.levelModerate', { defaultValue: 'Aceptable' })}
            </option>
            <option value="severe">
              {t('map.levelSevere', { defaultValue: 'Regular' })}
            </option>
            <option value="extreme">
              {t('map.levelExtreme', { defaultValue: 'Desfavorable' })}
            </option>
            <option value="unknown">
              {t('map.noData', { defaultValue: 'Sin datos' })}
            </option>
          </select>
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost map-near-me map-chrome__near"
            onClick={handleNearMe}
            disabled={geoStatus === 'loading'}
            data-testid="map-near-me"
            title={t('map.nearMePrivacy', {
              defaultValue:
                'Solo en esta sesión. No guardamos ni rastreamos tu ubicación.',
            })}
          >
            {geoStatus === 'loading'
              ? t('map.nearMeLoading', { defaultValue: 'Localizando…' })
              : t('map.nearMe', { defaultValue: 'Cerca de mí' })}
          </button>
          <span className="map-chrome__meta" aria-live="polite">
            {filteredZones.length} {t('map.zones', { defaultValue: 'zonas' })}
            {loadingAlerts ? ` · ${loadProgress}%` : ''}
          </span>
        </div>

        {regionChips.length > 0 && (
          <div
            className="map-region-chips"
            role="toolbar"
            aria-label={t('map.regionChips', { defaultValue: 'Filtro rápido por comunidad' })}
            data-testid="map-region-chips"
          >
            <button
              type="button"
              className={`map-region-chip ${filterRegion === 'todas' ? 'is-active' : ''}`}
              onClick={() => {
                setFilterRegion('todas')
                stickyRegionParamRef.current = null
              }}
            >
              {t('map.allRegions', { defaultValue: 'Todas' })}
            </button>
            {regionChips.map((r) => (
              <button
                key={r}
                type="button"
                className={`map-region-chip ${filterRegion === r ? 'is-active' : ''}`}
                onClick={() => {
                  setFilterRegion(r)
                  stickyRegionParamRef.current = r
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {/* Top 5 — one-tap selection (no wall of text) */}
        {topHotspots.length > 0 && (
          <div
            className="map-chrome__hotspots"
            role="toolbar"
            aria-label={t('map.topHotspotsTitle', {
              defaultValue: 'Top hotspots',
            })}
          >
            {topHotspots.map(({ zone, score }, i) => {
              const meta = alertFromScore(score)
              return (
                <button
                  key={zone.id}
                  type="button"
                  className={`map-hotspot-chip ${
                    selectedZone?.id === zone.id ? 'is-active' : ''
                  }`}
                  style={{ ['--hot' as string]: meta.color }}
                  onClick={() => handleSelectZone(zone)}
                >
                  <span className="map-hotspot-chip__rank">{i + 1}</span>
                  <span className="map-hotspot-chip__name">
                    {shortZoneLabel(zone.name, 22)}
                  </span>
                  <span className="map-hotspot-chip__score">{score}</span>
                </button>
              )
            })}
          </div>
        )}
      </header>

      <div className="map-alert-strip map-alert-strip--compact" role="status">
        <div className="map-alert-strip__item map-alert-strip__item--good">
          <strong>{alertSummary.good}</strong>
          <span>{t('map.levelGood', { defaultValue: 'Favorable' })}</span>
        </div>
        <div className="map-alert-strip__item map-alert-strip__item--moderate">
          <strong>{alertSummary.moderate}</strong>
          <span>{t('map.levelModerate', { defaultValue: 'Aceptable' })}</span>
        </div>
        <div className="map-alert-strip__item map-alert-strip__item--severe">
          <strong>{alertSummary.severe}</strong>
          <span>{t('map.levelSevere', { defaultValue: 'Regular' })}</span>
        </div>
        <div className="map-alert-strip__item map-alert-strip__item--extreme">
          <strong>{alertSummary.extreme}</strong>
          <span>{t('map.levelExtreme', { defaultValue: 'Desfavorable' })}</span>
        </div>
      </div>

      {weatherFailedAll && !loadingAlerts && (
        <div className="map-weather-banner" role="status">
          {t('map.weatherAllFailed', {
            defaultValue:
              'Sin datos meteorológicos ahora. El mapa sigue usable (educativo).',
          })}
        </div>
      )}

      {zoneNotFound && (
        <div className="map-weather-banner map-zone-missing" role="status">
          {t('map.zoneNotFound', {
            id: zoneNotFound,
            defaultValue: 'Zona no encontrada: «{{id}}». Elige otra en el mapa.',
          })}{' '}
          <button
            type="button"
            className="map-zone-missing__dismiss"
            onClick={() => setZoneNotFound(null)}
          >
            {t('actions.clear', { defaultValue: 'Cerrar' })}
          </button>
        </div>
      )}

      {showRegulatedDir && (
        <section
          className="map-regulated-dir atelier-panel"
          data-testid="map-regulated-directory"
          aria-label="Directorio de cotos y parques micológicos"
        >
          <div className="map-regulated-dir__head">
            <h2 className="map-regulated-dir__title">
              Cotos y parques micológicos
            </h2>
            <p className="map-regulated-dir__stats muted">
              {regulatedStats.cotos} acotados CyL · {regulatedStats.parks} parques ·{' '}
              {regulatedStats.cotosOther} cotos · {regulatedStats.withPermit} con enlace
              de permiso
            </p>
            <p className="map-regulated-dir__partner" role="note">
              {B2B_PARTNER_BLURB_ES}
            </p>
            <div className="identify-mode-toggle" role="group" aria-label="Filtro regulado">
              {(
                [
                  ['all', 'Todos'],
                  ['coto_cyl', 'Acotados CyL'],
                  ['parque', 'Parques'],
                  ['coto', 'Otros cotos'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`btn-atelier ${
                    regulatedFilter === id ? 'btn-atelier--primary' : 'btn-atelier--ghost'
                  }`}
                  onClick={() => setRegulatedFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="map-regulated-dir__list">
            {regulatedVisible.map((row) => {
              const permit = row.resources.links.find((l) => l.kind === 'permit')
              return (
                <li key={row.zone.id} className="map-regulated-dir__item">
                  <button
                    type="button"
                    className="map-regulated-dir__open"
                    onClick={() => {
                      handleSelectZone(row.zone)
                      setShowRegulatedDir(false)
                    }}
                  >
                    <span className="map-regulated-dir__kind">
                      {regulatedKindLabelEs(row.kind)}
                    </span>
                    <strong>{row.zone.name}</strong>
                    <span className="muted">
                      {row.zone.region}
                      {row.zone.provinces?.length
                        ? ` · ${row.zone.provinces.join(', ')}`
                        : ''}
                    </span>
                  </button>
                  {permit ? (
                    <a
                      href={permit.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="map-regulated-dir__permit"
                    >
                      Permiso oficial ↗
                    </a>
                  ) : (
                    <span className="muted map-regulated-dir__permit">Info en ficha</span>
                  )}
                </li>
              )
            })}
          </ul>
          {regulatedRows.length > REGULATED_DIRECTORY_CAP && (
            <p className="map-regulated-dir__cap muted" role="note">
              Mostrando {regulatedVisible.length} de {regulatedRows.length}. Usa el mapa o
              la búsqueda para el resto.
            </p>
          )}
        </section>
      )}

      {(geoStatus === 'denied' ||
        geoStatus === 'unsupported' ||
        geoStatus === 'error') && (
        <p className="map-geo-msg" role="status">
          {geoStatus === 'denied'
            ? t('map.nearMeDenied', {
                defaultValue: 'Ubicación denegada. Explora el mapa sin GPS.',
              })
            : geoStatus === 'unsupported'
              ? t('map.nearMeUnsupported', {
                  defaultValue: 'Este dispositivo no ofrece geolocalización.',
                })
              : t('map.nearMeError', {
                  defaultValue: 'No se pudo obtener la ubicación.',
                })}
        </p>
      )}

      {/* Full-bleed map — detail only when a zone is selected (sheet / float) */}
      <div className="map-layout map-layout--solo">
        <div className="map-container-wrapper map-container-wrapper--hero">
          {filteredZones.length === 0 && (
            <div
              className="map-empty-filter"
              role="status"
              data-testid="map-empty-filter"
            >
              <p className="map-empty-filter__title">
                {t('map.emptyFilterTitle', {
                  defaultValue: 'Sin zonas con estos filtros',
                })}
              </p>
              <p className="map-empty-filter__body muted">
                {t('map.emptyFilterBody', {
                  defaultValue: 'Prueba otra comunidad, nivel de aviso o búsqueda.',
                })}
              </p>
              <div className="map-empty-filter__actions">
                <button
                  type="button"
                  className="btn-atelier btn-atelier--primary"
                  onClick={() => {
                    setFilterRegion('todas')
                    setFilterAlert('todas')
                    handleSearchChange('')
                    setOnlyHotspots(false)
                    stickyRegionParamRef.current = null
                  }}
                >
                  {t('map.clearFilters', { defaultValue: 'Limpiar filtros' })}
                </button>
              </div>
            </div>
          )}
          <div
            className="map-overlay map-overlay--layers"
            role="group"
            aria-label={t('map.controlsLabel', { defaultValue: 'Capas del mapa' })}
          >
            <div className="map-glass map-glass--layers">
              <button
                type="button"
                className={`map-chip map-chip--toggle ${showMarkers ? 'is-active' : ''}`}
                onClick={() => setShowMarkers((v) => !v)}
                aria-pressed={showMarkers}
              >
                {t('map.layerMarkers', { defaultValue: 'Marcadores' })}
              </button>
              <button
                type="button"
                className={`map-chip map-chip--toggle ${showHotspots ? 'is-active' : ''}`}
                onClick={() => setShowHotspots((v) => !v)}
                aria-pressed={showHotspots}
              >
                {t('map.layerHalos', { defaultValue: 'Halos' })}
              </button>
              <button
                type="button"
                className={`map-chip map-chip--toggle ${onlyHotspots ? 'is-active' : ''}`}
                onClick={() => setOnlyHotspots((v) => !v)}
                aria-pressed={onlyHotspots}
              >
                {t('map.layerHotspotsOnly', { defaultValue: 'Solo hotspots' })}
              </button>
              {selectedZone && (
                <button
                  type="button"
                  className="map-chip map-chip--clear"
                  onClick={handleClearZone}
                >
                  {t('map.clearSelection', { defaultValue: 'Limpiar' })}
                </button>
              )}
            </div>
          </div>

          {loadingAlerts && (
            <div className="map-load-progress" role="status" aria-live="polite">
              <div className="map-load-progress__bar" style={{ width: `${loadProgress}%` }} />
              <span className="map-load-progress__label">
                {t('map.loadingProgress', {
                  defaultValue: 'Avisos · {{pct}}%',
                  pct: loadProgress,
                })}
              </span>
            </div>
          )}

          <MapContainer
            center={SPAIN_CENTER}
            zoom={SPAIN_ZOOM}
            scrollWheelZoom
            preferCanvas
            zoomControl
            fadeAnimation={false}
            markerZoomAnimation={false}
            zoomAnimation
            className="map-leaflet-host map-leaflet-host--hero"
            style={{
              height: mapHeight,
              width: '100%',
              borderRadius: '16px',
              zIndex: 1,
            }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              updateWhenZooming={false}
              updateWhenIdle
              keepBuffer={1}
              maxZoom={19}
            />
            {showHotspots &&
              hotspotZones.map((zone) => {
                const meta = alertFromScore(scores[zone.id] ?? null)
                return <ZoneHotspot key={`hs-${zone.id}`} zone={zone} meta={meta} />
              })}
            {showMarkers &&
              mapClusters.map((item) => {
                if (item.type === 'cluster') {
                  return (
                    <ClusterMapMarker
                      key={item.id}
                      cluster={item}
                      onOpen={handleClusterOpen}
                      expandLabel={t('map.clusterExpand', {
                        count: item.count,
                        defaultValue: '{{count}} zonas · ampliar',
                      })}
                      locale={mapLocale}
                      zonesWord={t('map.zones', { defaultValue: 'zonas' })}
                    />
                  )
                }
                const zone = zoneById.get(item.zoneId)
                if (!zone) return null
                const meta = alertFromScore(scores[zone.id] ?? null)
                return (
                  <ZoneMapMarker
                    key={zone.id}
                    zone={zone}
                    meta={{
                      ...meta,
                      label: t(`map.alert.${meta.level}.label`, {
                        defaultValue: meta.label,
                      }),
                    }}
                    onSelect={handleSelectZone}
                    locale={mapLocale}
                    selected={selectedZone?.id === zone.id}
                  />
                )
              })}
            <MapController
              zone={selectedZone}
              regionFocus={selectedZone ? null : regionFocus}
            />
            <ZoomTracker onZoom={handleZoom} />
            <FlyToCluster target={clusterFly} />
          </MapContainer>

          <div className="map-legend map-legend--alerts map-legend--glass map-legend--mini">
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#15803d' }} />{' '}
              {t('map.levelGood', { defaultValue: 'Favorable' })}
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#a16207' }} />{' '}
              {t('map.levelModerate', { defaultValue: 'Aceptable' })}
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#c2410c' }} />{' '}
              {t('map.levelSevere', { defaultValue: 'Regular' })}
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#b91c1c' }} />{' '}
              {t('map.levelExtreme', { defaultValue: 'Desfavorable' })}
            </span>
          </div>
        </div>

        {/* One compact card for the selected zone only */}
      </div>

      {sheetOpen && selectedZone && (
        <div className="map-zone-modal-root">
          <button
            type="button"
            className="map-sheet-backdrop map-sheet-backdrop--center"
            aria-label={t('actions.back', { defaultValue: 'Cerrar' })}
            onClick={handleClearZone}
            tabIndex={-1}
          />
          <div
            ref={sidebarRef}
            className="map-sidebar map-sidebar--modal map-sidebar--sheet"
            id="map-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label={shortZoneLabel(selectedZone.name, 48)}
          >
            <ZoneDetailBody
              zone={selectedZone}
              scores={scores}
              weatherSnap={weatherByZone[selectedZone.id]}
              weatherLoading={loadingAlerts && weatherByZone[selectedZone.id] === undefined}
              onClose={handleClearZone}
            />
          </div>
        </div>
      )}
    </div>
  )
}
