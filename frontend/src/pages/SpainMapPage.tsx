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
import {
  CLUSTER_BELOW_ZOOM,
  clusterZones,
  filterZonesByQuery,
  findZoneById,
  nearestZone,
  nextBoardIndex,
  replaceMapUrl,
  resolveMapDeepLink,
  stickyRegionAfterSearchChange,
  type MapCluster,
} from '../lib/mapInteraction'
import {
  currentMonth1to12,
  filterZonesByHabitat,
  habitatChipCounts,
  HABITAT_CHIPS,
  isInSeason,
  monthLabel,
  phenologyOpacity,
  phenologyScore,
  rankZonesByPhenology,
  resolveStoryRoute,
  SIMPLE_PHENO_HALO_CAP,
  toggleHabitatChip,
  topPhenologyHotspots,
  zoneHeroSpecies,
  type HabitatChipId,
  type Month1to12,
  type ResolvedStoryStop,
} from '../lib/mapPhenology'

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

function MapController({ zone }: { zone: MushroomZone | null }) {
  const map = useMap()
  useEffect(() => {
    if (!zone) return
    map.flyTo([zone.lat, zone.lng], Math.max(map.getZoom(), 8.5), {
      duration: 0.55,
      easeLinearity: 0.35,
    })
  }, [zone, map])
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
      <p className="alert-banner__weather-note">
        {t('map.weatherIndexNote', {
          defaultValue: 'Índice de condiciones meteorológicas orientativo',
        })}
      </p>
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
  phenoOpacity = 1,
  inSeason = true,
}: {
  zone: MushroomZone
  meta: ZoneAlertMeta
  /** M3.2 phenology layer opacity blend (season × weather). */
  phenoOpacity?: number
  inSeason?: boolean
}) {
  const radius = hotspotRadiusMeters(zone.abundance, meta.score)
  const active = isHotspotActive(meta.level)
  const op = Math.min(1, Math.max(0.12, phenoOpacity))
  return (
    <Circle
      center={[zone.lat, zone.lng]}
      radius={radius}
      pathOptions={{
        color: meta.color,
        fillColor: meta.color,
        fillOpacity: (active ? 0.18 : 0.06) * op,
        weight: active ? 1.5 : 0.75,
        opacity: (active ? 0.65 : 0.35) * op,
        interactive: false,
        className: [
          'zone-hotspot',
          active ? 'zone-hotspot--active' : '',
          inSeason ? 'zone-hotspot--in-season' : 'zone-hotspot--off-season',
        ]
          .filter(Boolean)
          .join(' '),
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
  locale,
  phenoOpacity = 1,
  inSeason = false,
  inSeasonLabel,
}: {
  zone: MushroomZone
  meta: ZoneAlertMeta
  onSelect: (z: MushroomZone) => void
  openLabel: string
  locale: string
  phenoOpacity?: number
  inSeason?: boolean
  inSeasonLabel?: string
}) {
  const onClick = useCallback(() => onSelect(zone), [onSelect, zone])
  const handlers = useMemo(() => ({ click: onClick }), [onClick])
  const scorePart = meta.score !== null ? ` · ${meta.score}/100` : ''
  const op = Math.min(1, Math.max(0.22, phenoOpacity))
  return (
    <Marker
      position={[zone.lat, zone.lng]}
      icon={makeAlertIcon(meta, locale)}
      eventHandlers={handlers}
      opacity={op}
      title={`${zone.name} · ${meta.label}${scorePart}${
        inSeason && inSeasonLabel ? ` · ${inSeasonLabel}` : ''
      }`}
    >
      <Popup className="map-popup-leaflet" maxWidth={260} minWidth={200}>
        <div className="map-popup map-popup--atelier">
          <p className="map-popup__kicker">{zone.region}</p>
          <strong className="map-popup__title">{shortZoneLabel(zone.name, 36)}</strong>
          <span
            className={`map-popup__chip map-popup__chip--${meta.level}`}
            style={{ color: meta.color, borderColor: meta.border, background: meta.bg }}
          >
            {meta.label}
            {scorePart}
          </span>
          {inSeason && inSeasonLabel ? (
            <span className="map-popup__chip map-popup__chip--season">{inSeasonLabel}</span>
          ) : null}
          {zone.habitat ? (
            <p className="map-popup__habitat">{zone.habitat}</p>
          ) : null}
          <button type="button" className="map-popup__cta" onClick={onClick}>
            {openLabel}
          </button>
        </div>
      </Popup>
    </Marker>
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

function ZoneDetailBody({
  zone,
  scores,
  conditionsMap,
  onClose,
  selectedMonth,
}: {
  zone: MushroomZone
  scores: Record<string, number | null>
  conditionsMap: Record<string, MushroomConditions | null>
  onClose: () => void
  selectedMonth: Month1to12
}) {
  const { t, i18n } = useTranslation()
  const meta = alertFromScore(scores[zone.id] ?? null)
  const label = t(`map.alert.${meta.level}.label`, { defaultValue: meta.label })
  const advisory = t(`map.alert.${meta.level}.advisory`, {
    defaultValue: meta.advisory,
  })
  const inSeason = isInSeason(zone.season, selectedMonth)
  const pheno = phenologyScore(zone.season, selectedMonth, scores[zone.id])
  const heroTaxa = useMemo(() => zoneHeroSpecies(zone.species, 6), [zone.species])
  const monthName = monthLabel(
    selectedMonth,
    i18n.resolvedLanguage || i18n.language || 'es',
    'long',
  )

  return (
    <div className="zone-detail zone-detail-card" data-testid="zone-detail-card">
      <div className="zone-detail__sheet-handle" aria-hidden />
      <button
        type="button"
        className="zone-close"
        id="map-zone-close"
        onClick={onClose}
      >
        {t('actions.back', { defaultValue: 'Cerrar' })}
      </button>

      {/* M3.3 Visual zone card — hero strip of species thumbs */}
      {heroTaxa.length > 0 && (
        <div
          className="zone-hero-strip"
          data-testid="zone-hero-strip"
          aria-label={t('map.heroStripLabel', {
            defaultValue: 'Especies orientativas de la zona',
          })}
        >
          {heroTaxa.map((sciName) => {
            const cat = getSpeciesByTaxon(sciName)
            const slug = speciesSlug(sciName)
            return (
              <Link
                key={sciName}
                to={`/enciclopedia/${slug}`}
                className="zone-hero-strip__item"
                title={sciName}
              >
                <SpeciesThumb
                  taxon={sciName}
                  riskLabel={cat?.risk_label}
                  alt={sciName}
                  size={56}
                  className="zone-hero-strip__thumb"
                />
              </Link>
            )
          })}
          <Link to="/enciclopedia" className="zone-hero-strip__more">
            {t('map.heroStripMore', { defaultValue: 'Enciclopedia' })}
          </Link>
        </div>
      )}

      <div
        className="zone-detail-alert"
        style={{ borderColor: meta.border, background: meta.bg }}
      >
        <span style={{ color: meta.color, fontWeight: 800 }}>{label}</span>
        {meta.score !== null && (
          <span style={{ color: meta.color }}> · {meta.score}/100</span>
        )}
        <p>{advisory}</p>
        <p className="zone-detail-alert__weather-note">
          {t('map.weatherIndexNote', {
            defaultValue: 'Índice de condiciones meteorológicas orientativo',
          })}
        </p>
        {isHotspotActive(meta.level) && (
          <p className="zone-hotspot-badge">
            {t('map.hotspotActive', {
              defaultValue: 'Hotspot activo (condiciones favorables/aceptables)',
            })}
          </p>
        )}
        {inSeason && (
          <p className="zone-season-badge" data-testid="zone-in-season">
            {t('map.inSeasonBadge', {
              defaultValue: 'En temporada ({{month}})',
              month: monthName,
            })}
            {' · '}
            {t('map.phenologyShort', {
              defaultValue: 'Fenología {{score}}',
              score: pheno,
            })}
          </p>
        )}
      </div>

      <h2 className="zone-detail-name">{shortZoneLabel(zone.name, 40)}</h2>
      <p className="zone-detail-region">{zone.region}</p>
      <p className="zone-detail-desc zone-detail-desc--clamp">{zone.description}</p>

      <ZoneWeatherPanel
        lat={zone.lat}
        lng={zone.lng}
        cached={zone.id in conditionsMap ? conditionsMap[zone.id] : undefined}
      />

      <div className="zone-links">
        <a
          href={`https://www.openstreetmap.org/?mlat=${zone.lat}&mlon=${zone.lng}#map=11/${zone.lat}/${zone.lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          OpenStreetMap
        </a>
        <a
          href={`https://www.google.com/maps?q=${zone.lat},${zone.lng}`}
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
          <span className="zone-meta-value">{zone.habitat}</span>
        </div>
        <div className="zone-meta-item">
          <span className="zone-meta-label">
            {t('map.season', { defaultValue: 'Temporada' })}
          </span>
          <span className="zone-meta-value">{zone.season}</span>
        </div>
        <div className="zone-meta-item">
          <span className="zone-meta-label">
            {t('map.abundance', { defaultValue: 'Producción habitual' })}
          </span>
          <span className="zone-meta-value">{zone.abundance}</span>
        </div>
      </div>

      <div className="zone-tips">
        <strong>{t('map.tips', { defaultValue: 'Consejos de campo' })}</strong>
        <ul>
          {zone.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </div>

      <div className="zone-species">
        <h3>
          {t('map.speciesTitle', {
            count: zone.species.length,
            defaultValue: 'Especies orientativas ({{count}})',
          })}
        </h3>
        <div className="zone-species-list">
          {zone.species.map((sciName) => {
            const cat = getSpeciesByTaxon(sciName)
            const risk = getRiskMeta(cat?.risk_label || 'dangerous_or_unknown')
            const slug = speciesSlug(sciName)
            return (
              <Link key={sciName} to={`/enciclopedia/${slug}`} className="zone-species-card">
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
  /** M3.1 month slider (1–12) — phenology re-rank; no weather re-fetch. */
  const [selectedMonth, setSelectedMonth] = useState<Month1to12>(() =>
    currentMonth1to12(),
  )
  /** M3.4 habitat chip filter (OR). Empty = all. */
  const [habitatFilter, setHabitatFilter] = useState<HabitatChipId[]>([])
  /** M3.5 educational story route (not forage). */
  const [storyOpen, setStoryOpen] = useState(false)
  const [storyStep, setStoryStep] = useState(0)
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [conditionsMap, setConditionsMap] = useState<
    Record<string, MushroomConditions | null>
  >({})
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [loadProgress, setLoadProgress] = useState(0)
  const [weatherFailedAll, setWeatherFailedAll] = useState(false)
  const [mapMode, setMapMode] = useState<'simple' | 'advanced'>('simple')
  const [showHotspots, setShowHotspots] = useState(true)
  const [showMarkers, setShowMarkers] = useState(true)
  const [onlyHotspots, setOnlyHotspots] = useState(false)
  const [mapZoom, setMapZoom] = useState(SPAIN_ZOOM)
  const [clusterFly, setClusterFly] = useState<{
    lat: number
    lng: number
    zoom: number
  } | null>(null)
  const [boardFocusIdx, setBoardFocusIdx] = useState(-1)
  const [geoStatus, setGeoStatus] = useState<
    'idle' | 'loading' | 'denied' | 'unsupported' | 'error'
  >('idle')
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 899px)').matches
      : false,
  )
  const cancelledRef = useRef(false)
  const loadedZonesRef = useRef(0)
  /** Preserve non-CCAA deep-link region (e.g. Soria province) in URL. */
  const stickyRegionParamRef = useRef<string | null>(deepLinkBoot.stickyRegion)
  const boardRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const focusBeforeSheetRef = useRef<HTMLElement | null>(null)

  const regions = useMemo(() => {
    const set = new Set(mushroomZones.map((z) => z.region))
    return ['todas', ...Array.from(set).sort()]
  }, [])

  const zoneById = useMemo(() => {
    const m = new Map<string, MushroomZone>()
    for (const z of mushroomZones) m.set(z.id, z)
    return m
  }, [])

  useEffect(() => {
    void loadSpeciesCatalog()
  }, [])

  useEffect(() => {
    clearZoneAlertIconCache()
  }, [mapLocale])

  // Track mobile sheet breakpoint (M2.5 a11y roles)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(max-width: 899px)')
    const onChange = () => setIsMobileViewport(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Keep URL in sync (replaceState — no history spam). State already bootstrapped from URL.
  useEffect(() => {
    replaceMapUrl({
      zoneId: selectedZone?.id ?? null,
      region:
        filterRegion !== 'todas'
          ? filterRegion
          : stickyRegionParamRef.current,
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

    type WeatherRow = { score: number | null; cond: MushroomConditions | null }

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
      setLoadProgress(100)
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
    if (mode === 'simple') setFilterAlert('todas')
  }, [])

  const habitatCounts = useMemo(
    () => habitatChipCounts(mushroomZones),
    [],
  )

  const storyStops = useMemo((): ResolvedStoryStop[] => {
    return resolveStoryRoute(mushroomZones.map((z) => z.id))
  }, [])

  const filteredZones = useMemo(() => {
    const base = mushroomZones.filter((z) => {
      if (filterRegion !== 'todas' && z.region !== filterRegion) return false
      if (onlyHotspots) {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (!isHotspotActive(level) && selectedZone?.id !== z.id) return false
      }
      if (mapMode === 'simple' && !onlyHotspots) {
        /* keep */
      } else if (mapMode === 'advanced' && filterAlert !== 'todas') {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (level !== filterAlert) return false
      }
      return true
    })
    const byQuery = filterZonesByQuery(base, searchQuery)
    const byHabitat = filterZonesByHabitat(byQuery, habitatFilter)
    // M3.1 re-rank via shared pure helper (same order as top-5)
    const byId = new Map(byHabitat.map((z) => [z.id, z]))
    return rankZonesByPhenology(byHabitat, selectedMonth, scores)
      .map((row) => byId.get(row.id))
      .filter((z): z is MushroomZone => z != null)
  }, [
    filterRegion,
    filterAlert,
    scores,
    mapMode,
    onlyHotspots,
    selectedZone,
    searchQuery,
    habitatFilter,
    selectedMonth,
  ])

  /**
   * Simple-mode halos: weather-active + selected always; at most
   * SIMPLE_PHENO_HALO_CAP extra in-season circles (top phenology) for M3.2
   * visibility without flooding Leaflet with ~100 autumn circles.
   */
  const hotspotZones = useMemo(() => {
    if (mapMode !== 'simple') return filteredZones

    const selectedId = selectedZone?.id
    const weatherActive: MushroomZone[] = []
    const rest: MushroomZone[] = []
    for (const z of filteredZones) {
      if (z.id === selectedId) {
        weatherActive.push(z)
        continue
      }
      const level = alertFromScore(scores[z.id] ?? null).level
      if (isHotspotActive(level)) weatherActive.push(z)
      else rest.push(z)
    }

    const activeIds = new Set(weatherActive.map((z) => z.id))
    // Extra in-season by phenology rank (board order already phenology-sorted)
    const extras: MushroomZone[] = []
    for (const z of rest) {
      if (extras.length >= SIMPLE_PHENO_HALO_CAP) break
      if (!isInSeason(z.season, selectedMonth)) continue
      if (activeIds.has(z.id)) continue
      extras.push(z)
    }
    return [...weatherActive, ...extras]
  }, [filteredZones, mapMode, scores, selectedZone, selectedMonth])

  // M3.1 Top 5 by phenology (season × weather) for selected month — no re-fetch
  const topHotspots = useMemo(() => {
    const ids = mushroomZones.map((z) => z.id)
    const seasons: Record<string, string | undefined> = {}
    for (const z of mushroomZones) seasons[z.id] = z.season
    return topPhenologyHotspots(ids, seasons, scores, selectedMonth, 5)
      .map((row) => {
        const zone = zoneById.get(row.id)
        if (!zone) return null
        return {
          zone,
          score: row.score,
          inSeason: row.inSeason,
          weatherScore: scores[row.id] ?? null,
        }
      })
      .filter(
        (
          x,
        ): x is {
          zone: MushroomZone
          score: number
          inSeason: boolean
          weatherScore: number | null
        } => x != null,
      )
  }, [scores, zoneById, selectedMonth])

  // M2.2 clustering when zoomed out
  const mapClusters = useMemo(() => {
    if (!showMarkers) return [] as MapCluster[]
    return clusterZones(filteredZones, mapZoom, {
      clusterBelowZoom: CLUSTER_BELOW_ZOOM,
    })
  }, [filteredZones, mapZoom, showMarkers])

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

  // Sync board focus when filtered list changes
  useEffect(() => {
    if (boardFocusIdx >= filteredZones.length) {
      setBoardFocusIdx(filteredZones.length > 0 ? filteredZones.length - 1 : -1)
    }
  }, [filteredZones, boardFocusIdx])

  // Highlight board item when selected zone is in filtered list
  useEffect(() => {
    if (!selectedZone) return
    const i = filteredZones.findIndex((z) => z.id === selectedZone.id)
    if (i >= 0) setBoardFocusIdx(i)
  }, [selectedZone, filteredZones])

  // M2.6 keyboard — single owner (window). No local board onKeyDown (avoids double-step).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      const inField =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable

      if (e.key === 'Escape') {
        if (selectedZone) {
          e.preventDefault()
          e.stopPropagation()
          setSelectedZone(null)
        }
        return
      }

      if (inField) return

      const boardActive =
        !!boardRef.current &&
        (boardRef.current === document.activeElement ||
          boardRef.current.contains(document.activeElement) ||
          (target != null && boardRef.current.contains(target)))

      const onPill = target?.classList?.contains('zone-pill')
      const bodyFocus =
        document.activeElement === document.body ||
        document.activeElement === document.documentElement

      // Arrows/Enter only when board-ish or idle body (map page exploration)
      if (!boardActive && !onPill && !bodyFocus) return
      if (filteredZones.length === 0) return

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setBoardFocusIdx((i) => nextBoardIndex(i, 1, filteredZones.length))
        boardRef.current?.focus()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setBoardFocusIdx((i) => nextBoardIndex(i, -1, filteredZones.length))
        boardRef.current?.focus()
      } else if (e.key === 'Enter') {
        const idx = boardFocusIdx >= 0 ? boardFocusIdx : 0
        const z = filteredZones[idx]
        if (z) {
          e.preventDefault()
          e.stopPropagation()
          handleSelectZone(z)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filteredZones, boardFocusIdx, selectedZone, handleSelectZone])

  // Focus the active pill for a11y
  useEffect(() => {
    if (boardFocusIdx < 0) return
    const el = boardRef.current?.querySelector<HTMLElement>(
      `[data-board-idx="${boardFocusIdx}"]`,
    )
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [boardFocusIdx])

  const sheetOpen = Boolean(selectedZone)
  const mobileSheetOpen = sheetOpen && isMobileViewport

  // M2.5 mobile sheet: focus close on open, restore on close; light Tab trap
  useEffect(() => {
    if (!mobileSheetOpen) return
    focusBeforeSheetRef.current =
      (document.activeElement as HTMLElement | null) ?? null
    // Defer so dialog is in DOM
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
  }, [mobileSheetOpen, selectedZone?.id])

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

  const handleMonthChange = useCallback((value: number) => {
    // Client-only phenology re-rank — does not re-fetch weather
    setSelectedMonth(
      (Math.min(12, Math.max(1, Math.round(value))) as Month1to12),
    )
  }, [])

  const handleHabitatToggle = useCallback((chip: HabitatChipId) => {
    setHabitatFilter((prev) => toggleHabitatChip(prev, chip))
  }, [])

  const handleStoryToggle = useCallback(() => {
    setStoryOpen((open) => {
      if (!open) setStoryStep(0)
      return !open
    })
  }, [])

  const handleStoryGo = useCallback(
    (step: number) => {
      const stop = storyStops[step]
      if (!stop) return
      setStoryStep(step)
      setStoryOpen(true)
      const zone = zoneById.get(stop.resolvedZoneId)
      if (zone) handleSelectZone(zone)
    },
    [storyStops, zoneById, handleSelectZone],
  )

  const handleStoryNext = useCallback(() => {
    if (!storyStops.length) return
    const next = (storyStep + 1) % storyStops.length
    handleStoryGo(next)
  }, [storyStops, storyStep, handleStoryGo])

  const handleStoryPrev = useCallback(() => {
    if (!storyStops.length) return
    const prev = (storyStep - 1 + storyStops.length) % storyStops.length
    handleStoryGo(prev)
  }, [storyStops, storyStep, handleStoryGo])

  const inSeasonLabel = t('map.inSeasonShort', { defaultValue: 'En temporada' })
  const monthLocale = mapLocale
  const selectedMonthLong = monthLabel(selectedMonth, monthLocale, 'long')

  const mapHeight =
    mapMode === 'simple' ? 'clamp(420px, 70vh, 720px)' : 'clamp(480px, 75vh, 780px)'

  return (
    <div
      className={`page-map page-map--${mapMode} page-map--immersive page-atelier-shell${
        mobileSheetOpen ? ' page-map--sheet-open' : ''
      }`}
    >
      <div className="mkt-page-head mkt-mesh map-page-header map-page-header--compact">
        <p className="mkt-kicker">
          {t('map.kicker', { defaultValue: 'Iberia · temporada' })}
        </p>
        <h1>{t('map.title', { defaultValue: 'Mapa micológico' })}</h1>
        <p className="map-page-header__lead">
          {t('map.subtitleShort', {
            defaultValue:
              'Zonas y avisos de fructificación. Toca el mapa. Solo orientación educativa.',
          })}
        </p>
        <div className="map-header-row">
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
          <span className="map-safety-chip" role="note">
            {t('map.safetyChip', { defaultValue: 'Educativo · no recolección' })}
          </span>
        </div>
      </div>

      {mapMode === 'advanced' && (
        <div className="atelier-panel map-advanced-panel">
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
            <strong>
              {loadingAlerts ? `${loadProgress}%` : alertSummary.unknown}
            </strong>
            <span>
              {loadingAlerts
                ? t('map.loadingZones', {
                    defaultValue: 'Cargando zonas…',
                    pct: loadProgress,
                  })
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

      {zoneNotFound && (
        <div className="map-weather-banner map-zone-missing" role="status">
          {t('map.zoneNotFound', {
            id: zoneNotFound,
            defaultValue: 'Zona no encontrada: «{{id}}». Elige otra en el mapa o el tablero.',
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

      {/* M3.1 Month slider — phenology re-rank (no weather re-fetch) */}
      <section
        className="map-month-slider"
        data-testid="map-month-slider"
        aria-label={t('map.monthSliderLabel', {
          defaultValue: 'Mes de temporada (fenología educativa)',
        })}
      >
        <div className="map-month-slider__head">
          <label htmlFor="map-month-range" className="map-month-slider__label">
            {t('map.monthSliderLabel', {
              defaultValue: 'Mes de temporada (fenología educativa)',
            })}
          </label>
          <strong className="map-month-slider__value" data-testid="map-month-value">
            {selectedMonthLong}
          </strong>
        </div>
        <input
          id="map-month-range"
          type="range"
          min={1}
          max={12}
          step={1}
          value={selectedMonth}
          onChange={(e) => handleMonthChange(Number(e.target.value))}
          className="map-month-slider__range"
          aria-valuemin={1}
          aria-valuemax={12}
          aria-valuenow={selectedMonth}
          aria-valuetext={selectedMonthLong}
        />
        {/* Visual ticks only — range is the accessible control (no focusables under aria-hidden). */}
        <div className="map-month-slider__ticks" aria-hidden="true">
          {(
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const satisfies readonly Month1to12[]
          ).map((m) => (
            <span
              key={m}
              className={`map-month-slider__tick ${
                selectedMonth === m ? 'is-active' : ''
              }`}
              onClick={() => handleMonthChange(m)}
            >
              {monthLabel(m, monthLocale, 'short')}
            </span>
          ))}
        </div>
        <p className="map-month-slider__hint">
          {t('map.monthSliderHint', {
            defaultValue:
              'Resalta zonas «en temporada» según su ficha. Índice meteorológico orientativo — no autoriza recolección ni consumo.',
          })}
        </p>
      </section>

      {/* M3.4 Habitat chip row */}
      <div
        className="map-habitat-chips"
        data-testid="map-habitat-chips"
        role="toolbar"
        aria-label={t('map.habitatFilterLabel', {
          defaultValue: 'Filtrar por hábitat',
        })}
      >
        <span className="map-habitat-chips__label">
          {t('map.habitatFilterLabel', { defaultValue: 'Hábitat' })}
        </span>
        {HABITAT_CHIPS.filter((c) => (habitatCounts[c.id] ?? 0) > 0).map((chip) => {
          const active = habitatFilter.includes(chip.id)
          const count = habitatCounts[chip.id] ?? 0
          const label = t(`map.habitatChip.${chip.id}`, {
            defaultValue: chip.labelEs,
          })
          return (
            <button
              key={chip.id}
              type="button"
              className={`map-chip map-chip--habitat ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              data-habitat={chip.id}
              onClick={() => handleHabitatToggle(chip.id)}
            >
              {label}
              <span className="map-chip__count">{count}</span>
            </button>
          )
        })}
        {habitatFilter.length > 0 && (
          <button
            type="button"
            className="map-chip map-chip--clear"
            onClick={() => setHabitatFilter([])}
          >
            {t('map.clearHabitatFilter', { defaultValue: 'Quitar hábitat' })}
          </button>
        )}
      </div>

      {/* M3.5 Story mode — educational route (not forage) */}
      <section
        className={`map-story ${storyOpen ? 'is-open' : ''}`}
        data-testid="map-story"
        aria-label={t('map.storyTitle', { defaultValue: 'Ruta educativa' })}
      >
        <div className="map-story__head">
          <h2 className="map-story__title">
            {t('map.storyTitle', { defaultValue: 'Ruta educativa' })}
          </h2>
          <button
            type="button"
            className={`btn-atelier ${
              storyOpen ? 'btn-atelier--primary' : 'btn-atelier--ghost'
            } map-story__toggle`}
            data-testid="map-story-toggle"
            aria-expanded={storyOpen}
            onClick={handleStoryToggle}
          >
            {storyOpen
              ? t('map.storyClose', { defaultValue: 'Cerrar ruta' })
              : t('map.storyOpen', { defaultValue: 'Iniciar ruta' })}
          </button>
        </div>
        <p className="map-story__lead">
          {t('map.storyLead', {
            defaultValue:
              'Tres paisajes clásicos de estudio (Soria, Picos, Pirineo). Solo narración educativa — no es ruta de recolección.',
          })}
        </p>
        {storyOpen && storyStops.length > 0 && (
          <div className="map-story__panel" data-testid="map-story-panel">
            <ol className="map-story__stops">
              {storyStops.map((stop, i) => {
                const z = zoneById.get(stop.resolvedZoneId)
                return (
                  <li key={stop.id}>
                    <button
                      type="button"
                      className={`map-story__stop ${
                        storyStep === i ? 'is-active' : ''
                      }`}
                      onClick={() => handleStoryGo(i)}
                      data-testid={`map-story-stop-${stop.id}`}
                    >
                      <span className="map-story__stop-num">{i + 1}</span>
                      <span className="map-story__stop-name">
                        {z ? shortZoneLabel(z.name, 32) : stop.id}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
            <blockquote className="map-story__narration">
              <p>
                {i18n.language?.startsWith('en')
                  ? storyStops[storyStep]?.narrationEn ||
                    storyStops[storyStep]?.narrationEs
                  : storyStops[storyStep]?.narrationEs}
              </p>
            </blockquote>
            <div className="map-story__nav">
              <button
                type="button"
                className="btn-atelier btn-atelier--ghost"
                onClick={handleStoryPrev}
              >
                {t('map.storyPrev', { defaultValue: 'Anterior' })}
              </button>
              <button
                type="button"
                className="btn-atelier btn-atelier--primary"
                onClick={handleStoryNext}
              >
                {t('map.storyNext', { defaultValue: 'Siguiente' })}
              </button>
            </div>
            <p className="map-story__safety">
              {t('map.storySafety', {
                defaultValue:
                  'Ruta educativa de paisaje. No autoriza recolección ni consumo.',
              })}
            </p>
          </div>
        )}
      </section>

      {/* M2.1 / M3.1 Top 5 by phenology for selected month */}
      <section
        className="map-top-hotspots"
        aria-label={t('map.topHotspotsTitle', {
          defaultValue: 'Top 5 por temporada ({{month}})',
          month: selectedMonthLong,
        })}
      >
        <div className="map-top-hotspots__head">
          <h2 className="map-top-hotspots__title">
            {t('map.topHotspotsTitle', {
              defaultValue: 'Top 5 por temporada ({{month}})',
              month: selectedMonthLong,
            })}
          </h2>
          <span className="map-top-hotspots__hint">
            {loadingAlerts
              ? t('map.topHotspotsLoading', {
                  defaultValue: 'Actualizando con el tiempo…',
                })
              : t('map.topHotspotsPhenoHint', {
                  defaultValue:
                    'Temporada ({{month}}) × índice meteorológico orientativo · educativo',
                  month: selectedMonthLong,
                })}
          </span>
        </div>
        {topHotspots.length === 0 ? (
          <p className="map-top-hotspots__empty">
            {t('map.topHotspotsEmpty', {
              defaultValue: 'Aún no hay puntuaciones. Explora el mapa mientras carga.',
            })}
          </p>
        ) : (
          <ol className="map-top-hotspots__list">
            {topHotspots.map(({ zone, score, inSeason, weatherScore }, i) => {
              const meta = alertFromScore(weatherScore)
              return (
                <li key={zone.id}>
                  <button
                    type="button"
                    className={`map-hotspot-chip ${
                      selectedZone?.id === zone.id ? 'is-active' : ''
                    } ${inSeason ? 'map-hotspot-chip--in-season' : ''}`}
                    style={{ ['--hot' as string]: meta.color }}
                    onClick={() => handleSelectZone(zone)}
                  >
                    <span className="map-hotspot-chip__rank">{i + 1}</span>
                    <span className="map-hotspot-chip__name">
                      {shortZoneLabel(zone.name, 28)}
                    </span>
                    {inSeason ? (
                      <span className="map-hotspot-chip__season" aria-hidden>
                        ●
                      </span>
                    ) : null}
                    <span className="map-hotspot-chip__score" title={t('map.phenologyShort', {
                      defaultValue: 'Fenología {{score}}',
                      score,
                    })}>
                      {score}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Search + region + near me */}
      <div className="map-toolbar map-toolbar--sticky map-toolbar--slim map-toolbar--region">
        <div className="filter-row map-search-row">
          <label htmlFor="map-zone-search">
            {t('map.searchLabel', { defaultValue: 'Buscar zona' })}
          </label>
          <input
            ref={searchInputRef}
            id="map-zone-search"
            type="search"
            className="map-search-input"
            data-testid="map-zone-search"
            placeholder={t('map.searchPlaceholder', {
              defaultValue: 'Buscar Picos, Soria, hayedo…',
            })}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <div className="filter-row">
          <label htmlFor="map-region-select">
            {t('map.region', { defaultValue: 'Comunidad' })}
          </label>
          <select
            id="map-region-select"
            value={filterRegion}
            onChange={(e) => {
              const v = e.target.value
              setFilterRegion(v)
              stickyRegionParamRef.current = v === 'todas' ? null : v
            }}
            data-testid="map-region-select"
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
        </div>
        {mapMode === 'advanced' && (
          <div className="filter-row">
            <label htmlFor="map-alert-select">
              {t('map.alertFilter', { defaultValue: 'Aviso' })}
            </label>
            <select
              id="map-alert-select"
              value={filterAlert}
              onChange={(e) => setFilterAlert(e.target.value)}
            >
              <option value="todas">{t('map.allLevels', { defaultValue: 'Todos' })}</option>
              <option value="extreme">
                {t('map.levelExtreme', { defaultValue: 'Desfavorable' })}
              </option>
              <option value="severe">
                {t('map.levelSevere', { defaultValue: 'Regular' })}
              </option>
              <option value="moderate">
                {t('map.levelModerate', { defaultValue: 'Aceptable' })}
              </option>
              <option value="good">
                {t('map.levelGood', { defaultValue: 'Favorable' })}
              </option>
              <option value="unknown">
                {t('map.noData', { defaultValue: 'Sin datos' })}
              </option>
            </select>
          </div>
        )}
        <div className="filter-row">
          <button
            type="button"
            className="btn-atelier btn-atelier--ghost map-near-me"
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
        </div>
        <div className="filter-row map-toolbar__meta">
          <span>
            {filteredZones.length} {t('map.zones', { defaultValue: 'zonas' })}
            {loadingAlerts ? ` · ${loadProgress}%` : ''}
          </span>
        </div>
      </div>

      {(geoStatus === 'denied' ||
        geoStatus === 'unsupported' ||
        geoStatus === 'error') && (
        <p className="map-geo-msg" role="status">
          {geoStatus === 'denied'
            ? t('map.nearMeDenied', {
                defaultValue:
                  'Ubicación denegada. Puedes seguir explorando el mapa sin GPS.',
              })
            : geoStatus === 'unsupported'
              ? t('map.nearMeUnsupported', {
                  defaultValue: 'Este dispositivo no ofrece geolocalización.',
                })
              : t('map.nearMeError', {
                  defaultValue: 'No se pudo obtener la ubicación. Inténtalo de nuevo.',
                })}{' '}
          <span className="map-geo-msg__privacy">
            {t('map.nearMePrivacy', {
              defaultValue:
                'Solo en esta sesión. No guardamos ni rastreamos tu ubicación.',
            })}
          </span>
        </p>
      )}

      <div className="map-layout">
        <div className="map-container-wrapper map-container-wrapper--hero">
          <div
            className="map-overlay map-overlay--top"
            role="region"
            aria-label={t('map.controlsLabel', { defaultValue: 'Controles del mapa' })}
          >
            <div
              className="map-glass map-glass--chips map-glass--chips-scroll"
              role="toolbar"
              aria-label={t('map.region', { defaultValue: 'Comunidad' })}
            >
              <button
                type="button"
                className={`map-chip ${filterRegion === 'todas' ? 'is-active' : ''}`}
                onClick={() => {
                  setFilterRegion('todas')
                  stickyRegionParamRef.current = null
                }}
              >
                {t('map.allRegions', { defaultValue: 'Todas' })}
              </button>
              {regions
                .filter((r) => r !== 'todas')
                .map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`map-chip ${filterRegion === r ? 'is-active' : ''}`}
                    onClick={() => {
                      const next = r === filterRegion ? 'todas' : r
                      setFilterRegion(next)
                      stickyRegionParamRef.current = next === 'todas' ? null : next
                    }}
                  >
                    {r}
                  </button>
                ))}
            </div>
            <div className="map-glass map-glass--layers" role="group" aria-label="Capas del mapa">
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
                  defaultValue: 'Avisos meteorológicos · {{pct}}%',
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
              borderRadius: '20px',
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
                const op = phenologyOpacity(
                  zone.season,
                  selectedMonth,
                  scores[zone.id],
                )
                const seasonOn = isInSeason(zone.season, selectedMonth)
                return (
                  <ZoneHotspot
                    key={`hs-${zone.id}`}
                    zone={zone}
                    meta={meta}
                    phenoOpacity={op}
                    inSeason={seasonOn}
                  />
                )
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
                const op = phenologyOpacity(
                  zone.season,
                  selectedMonth,
                  scores[zone.id],
                )
                const seasonOn = isInSeason(zone.season, selectedMonth)
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
                    openLabel={t('map.openCard', { defaultValue: 'Abrir ficha' })}
                    locale={mapLocale}
                    phenoOpacity={op}
                    inSeason={seasonOn}
                    inSeasonLabel={inSeasonLabel}
                  />
                )
              })}
            <MapController zone={selectedZone} />
            <ZoomTracker onZoom={handleZoom} />
            <FlyToCluster target={clusterFly} />
          </MapContainer>

          <div className="map-legend map-legend--alerts map-legend--glass">
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
            {mapZoom < CLUSTER_BELOW_ZOOM && (
              <span className="legend-item legend-item--cluster">
                {t('map.clusterLegend', {
                  defaultValue: 'Números = grupos (amplía el zoom)',
                })}
              </span>
            )}
          </div>

          <span className="map-safety-chip map-safety-chip--floating" role="note">
            {t('map.safetyChip', { defaultValue: 'Educativo · no recolección' })}
          </span>
        </div>

        <div
          ref={sidebarRef}
          className={`map-sidebar map-sidebar--sticky${
            mobileSheetOpen ? ' map-sidebar--sheet' : ''
          }`}
          id="map-sidebar"
          role={mobileSheetOpen ? 'dialog' : 'complementary'}
          aria-modal={mobileSheetOpen ? true : undefined}
          aria-label={
            selectedZone
              ? shortZoneLabel(selectedZone.name, 40)
              : t('map.pickZoneTitle', { defaultValue: 'Selecciona una zona' })
          }
        >
          {!selectedZone ? (
            <div className="zone-placeholder map-sidebar__desktop-only">
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
            <ZoneDetailBody
              zone={selectedZone}
              scores={scores}
              conditionsMap={conditionsMap}
              onClose={handleClearZone}
              selectedMonth={selectedMonth}
            />
          )}
        </div>
      </div>

      {/* Mobile sheet backdrop — only under sheet breakpoint */}
      {mobileSheetOpen && (
        <button
          type="button"
          className="map-sheet-backdrop"
          aria-label={t('actions.back', { defaultValue: 'Cerrar' })}
          onClick={handleClearZone}
          tabIndex={-1}
        />
      )}

      <div
        className="zone-list-section zone-list-section--compact"
        ref={boardRef}
        tabIndex={0}
        role="listbox"
        aria-label={t('map.boardTitleShort', {
          count: filteredZones.length,
          defaultValue: 'Zonas ({{count}})',
        })}
        aria-activedescendant={
          boardFocusIdx >= 0 && filteredZones[boardFocusIdx]
            ? `zone-pill-${filteredZones[boardFocusIdx].id}`
            : undefined
        }
      >
        <div className="zone-list-head">
          <h2 className="zone-list-title">
            {t('map.boardTitleShort', {
              count: filteredZones.length,
              defaultValue: 'Zonas ({{count}})',
            })}
          </h2>
          <span className="zone-list-hint">
            {t('map.boardHintKeys', {
              defaultValue: 'Toca o usa ← → · Enter · Esc',
            })}
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
              setSearchQuery('')
              setHabitatFilter([])
              stickyRegionParamRef.current = null
            }}
          />
        ) : (
          <div className="zone-list-rail" role="presentation">
            {filteredZones.map((zone, idx) => {
              const meta = alertFromScore(scores[zone.id] ?? null)
              const hot = isHotspotActive(meta.level)
              const seasonOn = isInSeason(zone.season, selectedMonth)
              const pheno = phenologyScore(
                zone.season,
                selectedMonth,
                scores[zone.id],
              )
              const scoreTxt = String(pheno)
              const phenoLabel = t('map.phenologyShort', {
                defaultValue: 'Fenología {{score}}',
                score: pheno,
              })
              const weatherPart =
                meta.score !== null
                  ? t('map.weatherScoreShort', {
                      defaultValue: 'Índice meteo {{score}}',
                      score: meta.score,
                    })
                  : t('map.noData', { defaultValue: 'Sin datos' })
              const focused = boardFocusIdx === idx
              const pillTitle = [
                zone.name,
                phenoLabel,
                weatherPart,
                seasonOn ? inSeasonLabel : null,
              ]
                .filter(Boolean)
                .join(' · ')
              return (
                <button
                  key={zone.id}
                  id={`zone-pill-${zone.id}`}
                  type="button"
                  role="option"
                  aria-selected={selectedZone?.id === zone.id || focused}
                  aria-label={pillTitle}
                  data-board-idx={idx}
                  title={pillTitle}
                  className={`zone-pill ${selectedZone?.id === zone.id ? 'is-active' : ''} ${
                    hot ? 'is-hot' : ''
                  } ${focused ? 'is-focus' : ''} ${
                    seasonOn ? 'zone-pill--in-season' : 'zone-pill--off-season'
                  }`}
                  style={{ ['--pill' as string]: meta.color }}
                  onClick={() => {
                    setBoardFocusIdx(idx)
                    handleSelectZone(zone)
                  }}
                >
                  <span className="zone-pill__dot" aria-hidden />
                  <span className="zone-pill__name">{shortZoneLabel(zone.name)}</span>
                  {seasonOn ? (
                    <span className="zone-pill__season" title={inSeasonLabel} aria-hidden>
                      ●
                    </span>
                  ) : null}
                  <span
                    className="zone-pill__score"
                    title={phenoLabel}
                    aria-hidden
                  >
                    {scoreTxt}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
