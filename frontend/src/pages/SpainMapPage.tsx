import { useState, useMemo, useEffect } from 'react'
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
import {
  getMushroomByScientificName,
  EDIBILITY_LABELS,
  EDIBILITY_COLORS,
} from '../data/mushroomDatabase'
import {
  fetchWeatherData,
  evaluateMushroomConditions,
  type WeatherData,
  type MushroomConditions,
} from '../api/weather'

// Fix Leaflet default icon issue with bundlers
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

/** Color based on fruiting conditions score */
function getScoreColor(score: number | null): string {
  if (score === null) return '#94a3b8' // gray = loading
  if (score >= 75) return '#16a34a' // green = perfecto
  if (score >= 55) return '#84cc16' // lime = bueno
  if (score >= 35) return '#f59e0b' // amber = regular
  return '#dc2626' // red = seco
}

/** Custom colored icon based on fruiting conditions score */
function makeIcon(score: number | null): L.DivIcon {
  const color = getScoreColor(score)
  const size = score !== null ? 28 : 22
  const ring = score === null ? '#cbd5e1' : color
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${color};
      width: ${size}px; height: ${size}px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.35), 0 0 0 2px ${ring}33;
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size],
  })
}

/** Component to fly to zone when selected (FIXED: uses useEffect) */
function MapController({ zone }: { zone: MushroomZone | null }) {
  const map = useMap()
  useEffect(() => {
    if (zone) {
      map.flyTo([zone.lat, zone.lng], 9, { duration: 1.2 })
    }
  }, [zone, map])
  return null
}

/** Weather widget for a zone */
function ZoneWeather({ lat, lng }: { lat: number; lng: number }) {
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [conditions, setConditions] = useState<MushroomConditions | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetchWeatherData(lat, lng)
      .then((w) => {
        if (cancelled) return
        setWeather(w)
        if (w) {
          setConditions(evaluateMushroomConditions(w))
        }
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
  }, [lat, lng])

  if (loading) {
    return (
      <div className="weather-widget weather-loading">
        <span className="weather-spinner">🌦️</span>
        <span>Cargando datos meteorológicos...</span>
      </div>
    )
  }

  if (error || !weather || !conditions) {
    return (
      <div className="weather-widget weather-error">
        <span>⚠️ No se pudieron cargar los datos meteorológicos</span>
      </div>
    )
  }

  const scoreColor =
    conditions.score >= 75
      ? '#16a34a'
      : conditions.score >= 55
        ? '#f59e0b'
        : conditions.score >= 35
          ? '#d97706'
          : '#dc2626'

  return (
    <div className="weather-widget">
      <div className="conditions-header">
        <span className="conditions-icon">{conditions.icon}</span>
        <div className="conditions-info">
          <span className="conditions-label">Condiciones para setas</span>
          <span className="conditions-score-text" style={{ color: scoreColor }}>
            {conditions.label.toUpperCase()} · {conditions.score}/100
          </span>
        </div>
      </div>

      <div className="conditions-score-bar">
        <div
          className="conditions-score-fill"
          style={{
            width: `${conditions.score}%`,
            background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}cc)`,
          }}
        ></div>
      </div>

      <div className="weather-grid">
        <div className="weather-item">
          <span className="weather-icon">💧</span>
          <span className="weather-label">Humedad suelo (0-7cm)</span>
          <span className="weather-value">{weather.soilMoisture07 >= 0 ? `${weather.soilMoisture07.toFixed(0)}%` : '—'}</span>
        </div>
        <div className="weather-item">
          <span className="weather-icon">💧</span>
          <span className="weather-label">Humedad profunda (7-28cm)</span>
          <span className="weather-value">{weather.soilMoisture728 >= 0 ? `${weather.soilMoisture728.toFixed(0)}%` : '—'}</span>
        </div>
        <div className="weather-item">
          <span className="weather-icon">🌧️</span>
          <span className="weather-label">Precipitación hoy</span>
          <span className="weather-value">{weather.precipitation.toFixed(1)} mm</span>
        </div>
        <div className="weather-item">
          <span className="weather-icon">📊</span>
          <span className="weather-label">Prob. lluvia mañana</span>
          <span className="weather-value">{weather.precipitationProbability}%</span>
        </div>
        <div className="weather-item">
          <span className="weather-icon">🌡️</span>
          <span className="weather-label">Temp. suelo</span>
          <span className="weather-value">{weather.soilTemperature > -50 ? `${weather.soilTemperature.toFixed(1)}°C` : '—'}</span>
        </div>
        <div className="weather-item">
          <span className="weather-icon">💨</span>
          <span className="weather-label">Humedad aire</span>
          <span className="weather-value">{weather.relativeHumidity >= 0 ? `${weather.relativeHumidity.toFixed(0)}%` : '—'}</span>
        </div>
      </div>

      <div className="conditions-details">
        {conditions.details.map((d, i) => (
          <div key={i} className="condition-detail-line">
            {d}
          </div>
        ))}
      </div>

      <p className="weather-source">
        Datos: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a> · Actualizado cada 30 min
      </p>
    </div>
  )
}

export default function SpainMapPage() {
  const [selectedZone, setSelectedZone] = useState<MushroomZone | null>(null)
  const [filterRegion, setFilterRegion] = useState<string>('todas')
  const [filterAbundance, setFilterAbundance] = useState<string>('todas')

  const regions = useMemo(() => {
    const set = new Set(mushroomZones.map((z) => z.region))
    return ['todas', ...Array.from(set).sort()]
  }, [])

  const filteredZones = useMemo(() => {
    return mushroomZones.filter((z) => {
      if (filterRegion !== 'todas' && z.region !== filterRegion) return false
      if (filterAbundance !== 'todas' && z.abundance !== filterAbundance) return false
      return true
    })
  }, [filterRegion, filterAbundance])

  const handleSelectZone = (zone: MushroomZone) => {
    setSelectedZone(zone)
    // Scroll to sidebar on mobile
    setTimeout(() => {
      const sidebar = document.getElementById('map-sidebar')
      if (sidebar && window.innerWidth < 900) {
        sidebar.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }, 100)
  }

  return (
    <div className="page-map">
      <div className="page-header">
        <h1 className="page-title">🗺️ Mapa Micológico de España</h1>
        <p className="page-subtitle">
          Explora las mejores zonas de España para la recolección de setas. Pincha en cada marcador
          para ver las especies, condiciones meteorológicas en tiempo real y el índice de fructificación.
        </p>
      </div>

      <div className="map-toolbar">
        <div className="filter-row">
          <label>🌍 Comunidad:</label>
          <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r === 'todas' ? 'Todas las comunidades' : r}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-row">
          <label>📊 Abundancia:</label>
          <select value={filterAbundance} onChange={(e) => setFilterAbundance(e.target.value)}>
            <option value="todas">Todas</option>
            <option value="alta">🟢 Alta producción</option>
            <option value="media">🟡 Media</option>
            <option value="baja">🔴 Baja</option>
          </select>
        </div>
      </div>

      <div className="map-layout">
        <div className="map-container-wrapper">
          <MapContainer
            center={SPAIN_CENTER}
            zoom={SPAIN_ZOOM}
            scrollWheelZoom={true}
            style={{ height: '600px', width: '100%', borderRadius: '16px', zIndex: 1 }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {filteredZones.map((zone) => (
              <Marker
                key={zone.id}
                position={[zone.lat, zone.lng]}
                icon={makeIcon(null)}
                eventHandlers={{
                  click: () => handleSelectZone(zone),
                }}
              >
                <Popup>
                  <div className="map-popup">
                    <strong>{zone.icon} {zone.name}</strong>
                    <br />
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>{zone.region}</span>
                    <br />
                    <span style={{ fontSize: '0.85rem' }}>{zone.habitat}</span>
                    <br />
                    <span style={{ fontSize: '0.8rem' }}>🍄 {zone.species.length} especies</span>
                  </div>
                </Popup>
              </Marker>
            ))}
            <MapController zone={selectedZone} />
          </MapContainer>

          <div className="map-legend">
            <strong style={{ fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem' }}>
              Abundancia
            </strong>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#16a34a' }}></span> Alta
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#f59e0b' }}></span> Media
            </span>
            <span className="legend-item">
              <span className="legend-dot" style={{ background: '#dc2626' }}></span> Baja
            </span>
          </div>
        </div>

        {/* Side panel */}
        <div className="map-sidebar" id="map-sidebar">
          {!selectedZone ? (
            <div className="zone-placeholder">
              <span className="zone-placeholder-icon">👆</span>
              <h3>Selecciona una zona</h3>
              <p>
                Pincha en cualquier marcador del mapa para ver:
              </p>
              <ul className="zone-placeholder-list">
                <li>🍄 Especies que puedes encontrar</li>
                <li>🌦️ Condiciones meteorológicas en tiempo real</li>
                <li>📊 Índice de fructificación (0-100)</li>
                <li>💧 Humedad del suelo y probabilidad de lluvia</li>
                <li>💡 Consejos de recolección</li>
              </ul>
              <div className="zone-stats">
                <div className="zone-stat">
                  <strong>{mushroomZones.length}</strong>
                  <span>zonas</span>
                </div>
                <div className="zone-stat">
                  <strong>{regions.length - 1}</strong>
                  <span>comunidades</span>
                </div>
                <div className="zone-stat">
                  <strong>GRATIS</strong>
                  <span>datos meteo</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="zone-detail">
              <button className="zone-close" onClick={() => setSelectedZone(null)}>
                ✕ Cerrar
              </button>

              <span className="zone-detail-icon">{selectedZone.icon}</span>
              <h2 className="zone-detail-name">{selectedZone.name}</h2>
              <p className="zone-detail-region">
                📍 {selectedZone.region} ({selectedZone.provinces.join(', ')})
              </p>

              <p className="zone-detail-desc">{selectedZone.description}</p>

              {/* Weather widget */}
              <ZoneWeather lat={selectedZone.lat} lng={selectedZone.lng} />

              <div className="zone-detail-meta">
                <div className="zone-meta-item">
                  <span className="zone-meta-label">🌳 Hábitat</span>
                  <span className="zone-meta-value">{selectedZone.habitat}</span>
                </div>
                <div className="zone-meta-item">
                  <span className="zone-meta-label">📅 Temporada</span>
                  <span className="zone-meta-value">{selectedZone.season}</span>
                </div>
                <div className="zone-meta-item">
                  <span className="zone-meta-label">📊 Producción</span>
                  <span
                    className="zone-meta-value abundance-badge"
                    style={{
                      background:
                        selectedZone.abundance === 'alta'
                          ? '#d4edda'
                          : selectedZone.abundance === 'media'
                            ? '#fff3cd'
                            : '#f8d7da',
                      color:
                        selectedZone.abundance === 'alta'
                          ? '#155724'
                          : selectedZone.abundance === 'media'
                            ? '#856404'
                            : '#721c24',
                    }}
                  >
                    {selectedZone.abundance.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="zone-tips">
                <strong>💡 Consejos:</strong>
                <ul>
                  {selectedZone.tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </div>

              <div className="zone-species">
                <h3>🍄 Especies que puedes encontrar ({selectedZone.species.length})</h3>
                <div className="zone-species-list">
                  {selectedZone.species.map((sciName) => {
                    const species = getMushroomByScientificName(sciName)
                    if (!species) {
                      return (
                        <div key={sciName} className="zone-species-card">
                          <span className="species-icon">🍄</span>
                          <div className="species-info">
                            <span className="species-common">{sciName}</span>
                            <span className="species-sci">No catalogada</span>
                          </div>
                          <span className="species-edibility" style={{ background: '#f1f5f9', color: '#64748b' }}>
                            —
                          </span>
                        </div>
                      )
                    }
                    return (
                      <Link
                        key={sciName}
                        to={`/enciclopedia/${encodeURIComponent(species.scientificName)}`}
                        className="zone-species-card"
                      >
                        <span className="species-icon">{species.icon}</span>
                        <div className="species-info">
                          <span className="species-common">{species.commonNames[0]}</span>
                          <span className="species-sci">
                            <em>{species.scientificName}</em>
                          </span>
                        </div>
                        <span
                          className="species-edibility"
                          style={{
                            background: EDIBILITY_COLORS[species.edibility] + '22',
                            color: EDIBILITY_COLORS[species.edibility],
                          }}
                        >
                          {EDIBILITY_LABELS[species.edibility]}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick zone list below map */}
      <div className="zone-list-section">
        <h2 className="zone-list-title">📋 Todas las zonas ({filteredZones.length})</h2>
        <div className="zone-list-grid">
          {filteredZones.map((zone) => (
            <button
              key={zone.id}
              className={`zone-card ${selectedZone?.id === zone.id ? 'active' : ''}`}
              onClick={() => handleSelectZone(zone)}
            >
              <span className="zone-card-icon">{zone.icon}</span>
              <div className="zone-card-info">
                <span className="zone-card-name">{zone.name}</span>
                <span className="zone-card-region">{zone.region}</span>
                <span className="zone-card-count">🍄 {zone.species.length} especies</span>
              </div>
              <span
                className="zone-card-dot"
                style={{
                  background:
                    zone.abundance === 'alta'
                      ? '#16a34a'
                      : zone.abundance === 'media'
                        ? '#f59e0b'
                        : '#dc2626',
                }}
              ></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}