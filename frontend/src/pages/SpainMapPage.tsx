/**
 * Mycological zones map — live weather-alert levels (red = poor conditions).
 */
import { useState, useMemo, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Link } from 'react-router-dom'
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
import { SeasonRadar } from '../components/SeasonRadar'
import {
  fetchWeatherData,
  evaluateMushroomConditions,
  type MushroomConditions,
} from '../api/weather'
import {
  alertFromConditions,
  alertFromScore,
  mapPool,
  type ZoneAlertMeta,
} from '../lib/zoneAlerts'

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function makeAlertIcon(meta: ZoneAlertMeta): L.DivIcon {
  const color = meta.color
  const pulse = meta.level === 'extreme' || meta.level === 'severe'
  const scoreTxt = meta.score === null ? '·' : String(Math.round(meta.score))
  return L.divIcon({
    className: 'zone-alert-marker',
    html: `<div class="zam ${pulse ? 'zam--pulse' : ''}" style="--zam:${color}">
      <span class="zam__score">${scoreTxt}</span>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -32],
  })
}

function MapController({ zone }: { zone: MushroomZone | null }) {
  const map = useMap()
  useEffect(() => {
    if (zone) map.flyTo([zone.lat, zone.lng], 9, { duration: 1.1 })
  }, [zone, map])
  return null
}

function speciesSlug(sciName: string): string {
  const cat = getSpeciesByTaxon(sciName)
  if (cat) return cat.slug
  return sciName.toLowerCase().replace(/\s+/g, '-')
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
  const [conditions, setConditions] = useState<MushroomConditions | null>(cached ?? null)
  const [loading, setLoading] = useState(cached === undefined)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (cached !== undefined) {
      setConditions(cached)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    fetchWeatherData(lat, lng)
      .then((w) => {
        if (cancelled) return
        if (w) setConditions(evaluateMushroomConditions(w))
        else setError(true)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [lat, lng, cached])

  if (loading) {
    return <div className="alert-banner alert-banner--unknown">Cargando aviso meteorológico…</div>
  }
  if (error || !conditions) {
    return (
      <div className="alert-banner alert-banner--unknown">
        No se pudieron cargar datos. Fuente:{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
          Open-Meteo
        </a>
      </div>
    )
  }

  const meta = alertFromConditions(conditions)
  return (
    <div
      className={`alert-banner alert-banner--${meta.level}`}
      style={{ borderColor: meta.border, background: meta.bg }}
    >
      <div className="alert-banner__row">
        <span className="alert-banner__level" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="alert-banner__score" style={{ color: meta.color }}>
          Índice {conditions.score}/100
        </span>
      </div>
      <p className="alert-banner__advisory">{meta.advisory}</p>
      <ul className="alert-banner__details">
        {conditions.details.slice(0, 5).map((d) => (
          <li key={d}>{d.replace(/[✅⚠️🔴🟡📊💧]/g, '').trim()}</li>
        ))}
      </ul>
      <p className="alert-banner__source">
        Datos en tiempo real ·{' '}
        <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
          Open-Meteo
        </a>
        {' · '}
        <a
          href={`https://www.google.com/maps?q=${lat},${lng}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Ver en mapa
        </a>
        {' · '}
        <a
          href="https://www.aemet.es/es/eltiempo/prediccion/municipios"
          target="_blank"
          rel="noopener noreferrer"
        >
          AEMET municipios
        </a>
      </p>
    </div>
  )
}

export default function SpainMapPage() {
  const [selectedZone, setSelectedZone] = useState<MushroomZone | null>(null)
  const [filterRegion, setFilterRegion] = useState('todas')
  const [filterAlert, setFilterAlert] = useState<string>('todas')
  const [scores, setScores] = useState<Record<string, number | null>>({})
  const [conditionsMap, setConditionsMap] = useState<
    Record<string, MushroomConditions | null>
  >({})
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  /** Wave B: simple = map + panel; advanced = radar + strip + full filters */
  const [mapMode, setMapMode] = useState<'simple' | 'advanced'>('simple')

  const regions = useMemo(() => {
    const set = new Set(mushroomZones.map((z) => z.region))
    return ['todas', ...Array.from(set).sort()]
  }, [])

  useEffect(() => {
    void loadSpeciesCatalog()
  }, [])

  // Load weather for all zones → color markers like a weather board
  useEffect(() => {
    let cancelled = false
    setLoadingAlerts(true)
    void mapPool(mushroomZones, 6, async (zone) => {
      const w = await fetchWeatherData(zone.lat, zone.lng)
      if (!w) return { id: zone.id, score: null as number | null, cond: null as MushroomConditions | null }
      const cond = evaluateMushroomConditions(w)
      return { id: zone.id, score: cond.score, cond }
    }).then((rows) => {
      if (cancelled) return
      const sc: Record<string, number | null> = {}
      const cm: Record<string, MushroomConditions | null> = {}
      for (const r of rows) {
        sc[r.id] = r.score
        cm[r.id] = r.cond
      }
      setScores(sc)
      setConditionsMap(cm)
      setLoadingAlerts(false)
    })
    return () => {
      cancelled = true
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
    return mushroomZones.filter((z) => {
      if (filterRegion !== 'todas' && z.region !== filterRegion) return false
      if (filterAlert !== 'todas') {
        const level = alertFromScore(scores[z.id] ?? null).level
        if (level !== filterAlert) return false
      }
      return true
    })
  }, [filterRegion, filterAlert, scores])

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
    <div className={`page-map page-map--${mapMode}`}>
      <div className="page-header">
        <h1 className="page-title">Mapa de zonas micológicas</h1>
        <p className="page-subtitle">
          Condiciones en vivo. Rojo = desfavorable. Solo orientación educativa.
        </p>
        <div className="identify-mode-toggle map-mode-toggle">
          <button
            type="button"
            className={
              mapMode === 'simple'
                ? 'btn-atelier btn-atelier--primary'
                : 'btn-atelier btn-atelier--ghost'
            }
            onClick={() => setMapMode('simple')}
          >
            Simple
          </button>
          <button
            type="button"
            className={
              mapMode === 'advanced'
                ? 'btn-atelier btn-atelier--primary'
                : 'btn-atelier btn-atelier--ghost'
            }
            onClick={() => setMapMode('advanced')}
          >
            Avanzado
          </button>
        </div>
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
            <span>Desfavorable</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--severe">
            <strong>{alertSummary.severe}</strong>
            <span>Regular</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--moderate">
            <strong>{alertSummary.moderate}</strong>
            <span>Aceptable</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--good">
            <strong>{alertSummary.good}</strong>
            <span>Favorable</span>
          </div>
          <div className="map-alert-strip__item map-alert-strip__item--unknown">
            <strong>{loadingAlerts ? '…' : alertSummary.unknown}</strong>
            <span>{loadingAlerts ? 'Cargando' : 'Sin datos'}</span>
          </div>
        </div>
      )}

      <div className="map-toolbar">
        <div className="filter-row">
          <label>Comunidad</label>
          <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r === 'todas' ? 'Todas' : r}
              </option>
            ))}
          </select>
        </div>
        {mapMode === 'advanced' && (
          <div className="filter-row">
            <label>Aviso</label>
            <select value={filterAlert} onChange={(e) => setFilterAlert(e.target.value)}>
              <option value="todas">Todos los niveles</option>
              <option value="extreme">Desfavorable (rojo)</option>
              <option value="severe">Regular (naranja)</option>
              <option value="moderate">Aceptable (ámbar)</option>
              <option value="good">Favorable (verde)</option>
              <option value="unknown">Sin datos</option>
            </select>
          </div>
        )}
        <div className="filter-row map-toolbar__meta">
          <span>
            {filteredZones.length} zonas ·{' '}
            <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
              Open-Meteo
            </a>
          </span>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-container-wrapper">
          <MapContainer
            center={SPAIN_CENTER}
            zoom={SPAIN_ZOOM}
            scrollWheelZoom
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
            />
            {filteredZones.map((zone) => {
              const meta = alertFromScore(scores[zone.id] ?? null)
              return (
                <Marker
                  key={zone.id}
                  position={[zone.lat, zone.lng]}
                  icon={makeAlertIcon(meta)}
                  eventHandlers={{ click: () => handleSelectZone(zone) }}
                >
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
                      <button
                        type="button"
                        className="map-popup__btn"
                        onClick={() => handleSelectZone(zone)}
                      >
                        Ver ficha y especies
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
            <MapController zone={selectedZone} />
          </MapContainer>

          <div className="map-legend map-legend--alerts">
            <strong>Aviso de condiciones</strong>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#b91c1c' }} /> Desfavorable
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#c2410c' }} /> Regular
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#a16207' }} /> Aceptable
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#15803d' }} /> Favorable
            </span>
          </div>
        </div>

        <div className="map-sidebar" id="map-sidebar">
          {!selectedZone ? (
            <div className="zone-placeholder">
              <h3>Selecciona una zona</h3>
              <p>
                Los marcadores se colorean con el índice de fructificación en vivo (rojo = malas
                condiciones).
              </p>
              <ul className="zone-placeholder-list">
                <li>Aviso meteorológico por zona</li>
                <li>Enlaces a fichas de la enciclopedia</li>
                <li>Enlaces a mapas y AEMET</li>
                <li>Consejos y hábitat</li>
              </ul>
              <div className="zone-stats">
                <div className="zone-stat">
                  <strong>{mushroomZones.length}</strong>
                  <span>zonas</span>
                </div>
                <div className="zone-stat">
                  <strong>{regions.length - 1}</strong>
                  <span>CC.AA.</span>
                </div>
                <div className="zone-stat">
                  <strong>{alertSummary.extreme}</strong>
                  <span>en rojo</span>
                </div>
              </div>
              <p className="zone-disclaimer">
                No autoriza recolección ni consumo. Consulta normativa local y un micólogo.
              </p>
            </div>
          ) : (
            <div className="zone-detail">
              <button type="button" className="zone-close" onClick={() => setSelectedZone(null)}>
                Cerrar
              </button>

              {(() => {
                const meta = alertFromScore(scores[selectedZone.id] ?? null)
                return (
                  <div
                    className="zone-detail-alert"
                    style={{ borderColor: meta.border, background: meta.bg }}
                  >
                    <span style={{ color: meta.color, fontWeight: 800 }}>{meta.label}</span>
                    {meta.score !== null && (
                      <span style={{ color: meta.color }}> · {meta.score}/100</span>
                    )}
                    <p>{meta.advisory}</p>
                  </div>
                )
              })()}

              <h2 className="zone-detail-name">{selectedZone.name}</h2>
              <p className="zone-detail-region">
                {selectedZone.region} · {selectedZone.provinces.join(', ')}
              </p>
              <p className="zone-detail-desc">{selectedZone.description}</p>

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
                <Link to="/enciclopedia">Enciclopedia</Link>
                <Link to="/identificar">Identificar</Link>
              </div>

              <div className="zone-detail-meta">
                <div className="zone-meta-item">
                  <span className="zone-meta-label">Hábitat</span>
                  <span className="zone-meta-value">{selectedZone.habitat}</span>
                </div>
                <div className="zone-meta-item">
                  <span className="zone-meta-label">Temporada</span>
                  <span className="zone-meta-value">{selectedZone.season}</span>
                </div>
                <div className="zone-meta-item">
                  <span className="zone-meta-label">Producción habitual</span>
                  <span className="zone-meta-value">{selectedZone.abundance}</span>
                </div>
              </div>

              <div className="zone-tips">
                <strong>Consejos de campo</strong>
                <ul>
                  {selectedZone.tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </div>

              <div className="zone-species">
                <h3>Especies orientativas ({selectedZone.species.length})</h3>
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
            </div>
          )}
        </div>
      </div>

      <div className="zone-list-section">
        <h2 className="zone-list-title">Tablero de avisos ({filteredZones.length})</h2>
        <div className="zone-list-grid">
          {filteredZones.map((zone) => {
            const meta = alertFromScore(scores[zone.id] ?? null)
            return (
              <button
                key={zone.id}
                type="button"
                className={`zone-card zone-card--alert ${selectedZone?.id === zone.id ? 'active' : ''}`}
                style={{ borderLeftColor: meta.color }}
                onClick={() => handleSelectZone(zone)}
              >
                <div className="zone-card-info">
                  <span className="zone-card-name">{zone.name}</span>
                  <span className="zone-card-region">{zone.region}</span>
                  <span className="zone-card-alert" style={{ color: meta.color }}>
                    {meta.label}
                    {meta.score !== null ? ` · ${meta.score}` : ''}
                  </span>
                </div>
                <span className="zone-card-dot" style={{ background: meta.color }} />
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
