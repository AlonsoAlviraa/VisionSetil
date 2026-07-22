import { describe, expect, it } from 'vitest'
import {
  buildPreflightState,
  canSubmitPreflight,
  mapPreflightMode,
  offlineDetailI18nKey,
  type MapPreflightInput,
} from './preflight'

function input(overrides: Partial<MapPreflightInput> = {}): MapPreflightInput {
  return {
    offline: false,
    ready: true,
    classifier_mode: 'real',
    species_id_allowed: true,
    metrics_acceptable: true,
    ...overrides,
  }
}

describe('mapPreflightMode (Appendix D.1)', () => {
  it('1: offline → offline, submit disabled', () => {
    const r = mapPreflightMode(input({ offline: true }))
    expect(r.mode).toBe('offline')
    expect(r.submit_enabled).toBe(false)
    expect(r.metrics_warning).toBe(false)
  })

  it('2: species_id_allowed false → blocked, submit still enabled', () => {
    const r = mapPreflightMode(
      input({
        species_id_allowed: false,
        metrics_acceptable: false,
        classifier_mode: 'real',
      }),
    )
    expect(r.mode).toBe('blocked')
    expect(r.submit_enabled).toBe(true)
    expect(r.metrics_warning).toBe(false)
  })

  it('3: allowed + mock + metrics ok → mock', () => {
    const r = mapPreflightMode(
      input({
        classifier_mode: 'mock',
        species_id_allowed: true,
        metrics_acceptable: true,
      }),
    )
    expect(r.mode).toBe('mock')
    expect(r.submit_enabled).toBe(true)
    expect(r.metrics_warning).toBe(false)
  })

  it('4: allowed + mock + !metrics → mock + metrics_warning', () => {
    const r = mapPreflightMode(
      input({
        classifier_mode: 'mock',
        species_id_allowed: true,
        metrics_acceptable: false,
      }),
    )
    expect(r.mode).toBe('mock')
    expect(r.submit_enabled).toBe(true)
    expect(r.metrics_warning).toBe(true)
  })

  it('5: allowed + real + metrics ok → real', () => {
    const r = mapPreflightMode(
      input({
        classifier_mode: 'real',
        species_id_allowed: true,
        metrics_acceptable: true,
      }),
    )
    expect(r.mode).toBe('real')
    expect(r.submit_enabled).toBe(true)
    expect(r.metrics_warning).toBe(false)
  })

  it('6: allowed + real + !metrics (gate disabled) → real + metrics_warning', () => {
    const r = mapPreflightMode(
      input({
        classifier_mode: 'real',
        species_id_allowed: true,
        metrics_acceptable: false,
        block_enabled: false,
      }),
    )
    expect(r.mode).toBe('real')
    expect(r.submit_enabled).toBe(true)
    expect(r.metrics_warning).toBe(true)
  })

  it('7: else → unknown, submit enabled if online', () => {
    const r = mapPreflightMode(
      input({
        classifier_mode: 'unknown',
        species_id_allowed: true,
        metrics_acceptable: true,
      }),
    )
    expect(r.mode).toBe('unknown')
    expect(r.submit_enabled).toBe(true)
  })

  it('never disables submit for blocked (HARD)', () => {
    const r = mapPreflightMode(
      input({
        offline: false,
        species_id_allowed: false,
        metrics_acceptable: false,
      }),
    )
    expect(r.mode).toBe('blocked')
    expect(r.submit_enabled).toBe(true)
  })

  it('does not invent mock-or-real mode', () => {
    const modes = [
      mapPreflightMode(input({ offline: true })).mode,
      mapPreflightMode(input({ species_id_allowed: false })).mode,
      mapPreflightMode(input({ classifier_mode: 'mock' })).mode,
      mapPreflightMode(input({ classifier_mode: 'real' })).mode,
      mapPreflightMode(input({ classifier_mode: 'error' })).mode,
    ]
    expect(modes).not.toContain('mock-or-real')
    expect(new Set(modes)).toEqual(
      new Set(['offline', 'blocked', 'mock', 'real', 'unknown']),
    )
  })
})

describe('canSubmitPreflight', () => {
  it('false only for offline', () => {
    expect(
      canSubmitPreflight(
        buildPreflightState({ offline: true, loading: false }),
      ),
    ).toBe(false)
    expect(
      canSubmitPreflight(
        buildPreflightState({
          offline: false,
          species_id_allowed: false,
          loading: false,
        }),
      ),
    ).toBe(true)
    expect(
      canSubmitPreflight(
        buildPreflightState({
          offline: false,
          classifier_mode: 'mock',
          species_id_allowed: true,
          loading: false,
        }),
      ),
    ).toBe(true)
  })

  it('true during initial loading (no infinite disabled spinner)', () => {
    expect(
      canSubmitPreflight(
        buildPreflightState({
          offline: false,
          loading: true,
          fetched_at: 0,
        }),
      ),
    ).toBe(true)
  })
})

describe('offlineDetailI18nKey (B-15 polish)', () => {
  it('uses empty-response copy for api_empty (reachable but unusable, e.g. 503 body)', () => {
    expect(offlineDetailI18nKey('api_empty')).toBe(
      'honesty.preflight.submit_offline_empty',
    )
  })

  it('uses network copy for unreachable / throw / unknown errors', () => {
    expect(offlineDetailI18nKey('api_unreachable')).toBe(
      'honesty.preflight.submit_offline',
    )
    expect(offlineDetailI18nKey('preflight_throw')).toBe(
      'honesty.preflight.submit_offline',
    )
    expect(offlineDetailI18nKey(undefined)).toBe(
      'honesty.preflight.submit_offline',
    )
  })
})
