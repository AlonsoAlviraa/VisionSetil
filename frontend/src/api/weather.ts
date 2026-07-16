/** Open-Meteo API client — FREE, no API key required.
 * Provides soil moisture, precipitation, humidity, and temperature.
 * Docs: https://open-meteo.com/en/docs */
import { cache } from './cache'

export interface WeatherData {
  soilMoisture07: number // 0-7cm depth (%)
  soilMoisture728: number // 7-28cm depth (%)
  soilTemperature: number // °C at surface
  precipitation: number // mm (last 24h)
  precipitationProbability: number // % (next 24h)
  relativeHumidity: number // % at 2m
  temperature: number // °C at 2m
  isDay: boolean
}

export interface MushroomConditions {
  score: number // 0-100
  label: 'perfecto' | 'bueno' | 'regular' | 'seco' | 'unknown'
  icon: string
  details: string[]
}

const SOIL_CACHE_TTL = 1000 * 60 * 30 // 30 minutes

/** Fetch weather + soil data from Open-Meteo (free, no key) */
export async function fetchWeatherData(lat: number, lng: number): Promise<WeatherData | null> {
  const cacheKey = `weather_${lat.toFixed(2)}_${lng.toFixed(2)}`
  const cached = cache.get<WeatherData>(cacheKey)
  if (cached) return cached

  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(3),
      longitude: lng.toFixed(3),
      current: [
        'soil_moisture_0_to_7cm',
        'soil_moisture_7_to_28cm',
        'soil_temperature_0cm',
        'precipitation',
        'relative_humidity_2m',
        'temperature_2m',
        'is_day',
      ].join(','),
      daily: ['precipitation_sum', 'precipitation_probability_max'].join(','),
      forecast_days: '1',
      timezone: 'auto',
    })

    const url = `https://api.open-meteo.com/v1/forecast?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Weather API error: ${res.status}`)
    const data = await res.json()

    const result: WeatherData = {
      soilMoisture07: data.current?.soil_moisture_0_to_7cm ?? -1,
      soilMoisture728: data.current?.soil_moisture_7_to_28cm ?? -1,
      soilTemperature: data.current?.soil_temperature_0cm ?? -99,
      precipitation: data.current?.precipitation ?? 0,
      precipitationProbability: data.daily?.precipitation_probability_max?.[0] ?? 0,
      relativeHumidity: data.current?.relative_humidity_2m ?? -1,
      temperature: data.current?.temperature_2m ?? -99,
      isDay: data.current?.is_day === 1,
    }

    cache.set(cacheKey, result, SOIL_CACHE_TTL)
    return result
  } catch (err) {
    console.error('[weather] Failed to fetch:', err)
    return null
  }
}

/** Evaluate mushroom foraging conditions based on weather data.
 * Ideal conditions:
 * - Soil moisture 0-7cm: 25-45% (sweet spot)
 * - Soil moisture 7-28cm: 30-50%
 * - Recent precipitation: 10-50mm in last days
 * - Soil temperature: 10-18°C
 * - Humidity: >70%
 */
export function evaluateMushroomConditions(w: WeatherData): MushroomConditions {
  const details: string[] = []
  let score = 0

  // If soil moisture data is missing, give partial baseline from other metrics
  const hasSoilData = w.soilMoisture07 >= 0 || w.soilMoisture728 >= 0
  if (!hasSoilData && w.relativeHumidity >= 0) {
    // Estimate soil moisture from humidity as fallback
    score += 10
    details.push(`📊 Estimación por humedad del aire (${w.relativeHumidity.toFixed(0)}%)`)
  }

  // Soil moisture 0-7cm (most important, weight: 30)
  if (w.soilMoisture07 >= 0) {
    if (w.soilMoisture07 >= 25 && w.soilMoisture07 <= 45) {
      score += 30
      details.push(`✅ Humedad del suelo (${w.soilMoisture07.toFixed(0)}%): ÓPTIMA`)
    } else if (w.soilMoisture07 >= 18 && w.soilMoisture07 <= 55) {
      score += 18
      details.push(`⚠️ Humedad del suelo (${w.soilMoisture07.toFixed(0)}%): Aceptable`)
    } else if (w.soilMoisture07 < 18) {
      score += 5
      details.push(`🔴 Humedad del suelo (${w.soilMoisture07.toFixed(0)}%): Muy seca`)
    } else {
      score += 8
      details.push(`🟡 Humedad del suelo (${w.soilMoisture07.toFixed(0)}%): Excesiva`)
    }
  }

  // Soil moisture 7-28cm (weight: 20)
  if (w.soilMoisture728 >= 0) {
    if (w.soilMoisture728 >= 30 && w.soilMoisture728 <= 50) {
      score += 20
      details.push(`✅ Humedad profunda (${w.soilMoisture728.toFixed(0)}%): ÓPTIMA`)
    } else if (w.soilMoisture728 >= 22 && w.soilMoisture728 <= 60) {
      score += 12
      details.push(`⚠️ Humedad profunda (${w.soilMoisture728.toFixed(0)}%): Aceptable`)
    } else {
      score += 5
      details.push(`🔴 Humedad profunda (${w.soilMoisture728.toFixed(0)}%): Pobre`)
    }
  }

  // Recent precipitation (weight: 20)
  if (w.precipitation >= 10 && w.precipitation <= 50) {
    score += 20
    details.push(`✅ Precipitación reciente (${w.precipitation.toFixed(1)}mm): Ideal`)
  } else if (w.precipitation > 0) {
    score += 10
    details.push(`⚠️ Precipitación reciente (${w.precipitation.toFixed(1)}mm): Escasa`)
  } else {
    score += 0
    details.push(`🔴 Sin precipitación reciente (0mm): Seco`)
  }

  // Soil temperature (weight: 15)
  if (w.soilTemperature > -50) {
    if (w.soilTemperature >= 10 && w.soilTemperature <= 18) {
      score += 15
      details.push(`✅ Temperatura del suelo (${w.soilTemperature.toFixed(1)}°C): Perfecta`)
    } else if (w.soilTemperature >= 6 && w.soilTemperature <= 22) {
      score += 8
      details.push(`⚠️ Temperatura del suelo (${w.soilTemperature.toFixed(1)}°C): Aceptable`)
    } else if (w.soilTemperature < 6) {
      score += 2
      details.push(`🔴 Temperatura del suelo (${w.soilTemperature.toFixed(1)}°C): Muy fría`)
    } else {
      score += 3
      details.push(`🟡 Temperatura del suelo (${w.soilTemperature.toFixed(1)}°C): Muy cálida`)
    }
  }

  // Relative humidity (weight: 15)
  if (w.relativeHumidity >= 0) {
    if (w.relativeHumidity >= 70) {
      score += 15
      details.push(`✅ Humedad del aire (${w.relativeHumidity.toFixed(0)}%): Alta`)
    } else if (w.relativeHumidity >= 55) {
      score += 8
      details.push(`⚠️ Humedad del aire (${w.relativeHumidity.toFixed(0)}%): Media`)
    } else {
      score += 2
      details.push(`🔴 Humedad del aire (${w.relativeHumidity.toFixed(0)}%): Baja`)
    }
  }

  let label: MushroomConditions['label'] = 'unknown'
  let icon = '❓'
  if (score >= 75) {
    label = 'perfecto'
    icon = '🍄'
  } else if (score >= 55) {
    label = 'bueno'
    icon = '👍'
  } else if (score >= 35) {
    label = 'regular'
    icon = '🤔'
  } else {
    label = 'seco'
    icon = '🏜️'
  }

  return { score, label, icon, details }
}