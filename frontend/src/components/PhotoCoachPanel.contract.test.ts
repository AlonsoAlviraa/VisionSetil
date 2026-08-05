/**
 * Contract tests for PhotoCoachPanel zero-webp + edu CTA (no RTL dep).
 * Locks first-paint wireframe (not exclusive broken img).
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { examplesForView } from '../lib/photoCoach'
import examplesJson from '../data/photoCoachExamples.json'

const here = dirname(fileURLToPath(import.meta.url))
const panelSrc = readFileSync(resolve(here, 'PhotoCoachPanel.tsx'), 'utf8')
const wizardSrc = readFileSync(resolve(here, 'MultiViewWizard.tsx'), 'utf8')

describe('PhotoCoachPanel zero-webp contract', () => {
  it('always renders CSS wire (not exclusive thumb-or-wire branch)', () => {
    expect(panelSrc).toMatch(/photo-coach-frame__wire/)
    expect(panelSrc).toMatch(/data-testid=\{`photo-coach-wire-\$\{ex\.id\}`\}/)
    // Must not hide wire behind exclusive showThumb ? img : wire
    expect(panelSrc).not.toMatch(/showThumb\s*\?\s*\(/)
    expect(panelSrc).toMatch(/Wire always present/)
  })

  it('thumbs only overlay after load; onError never removes wire', () => {
    expect(panelSrc).toMatch(/is-ready/)
    expect(panelSrc).toMatch(/is-pending/)
    expect(panelSrc).toMatch(/onLoad=/)
    expect(panelSrc).toMatch(/onError=/)
    expect(panelSrc).toMatch(/setThumbFailed/)
  })

  it('examples ship without thumb paths (no coach webp 404 on first paint)', () => {
    // Only assert per-example thumbs — doc notes may mention future media paths
    for (const view of ['gills', 'front', 'habitat', 'detail'] as const) {
      for (const ex of examplesForView(view)) {
        expect(ex.thumb, ex.id).toBeUndefined()
        expect(ex.cssFrame).toBeTruthy()
      }
    }
    const views = (examplesJson as { views: Record<string, { examples: Array<{ thumb?: string }> }> }).views
    for (const block of Object.values(views)) {
      for (const ex of block.examples) {
        expect(ex.thumb).toBeUndefined()
      }
    }
  })

  it('exposes panel, toggle, edu link testids and multi-view anchor', () => {
    expect(panelSrc).toMatch(/data-testid="photo-coach-panel"/)
    expect(panelSrc).toMatch(/data-testid="photo-coach-toggle"/)
    expect(panelSrc).toMatch(/data-testid="photo-coach-edu-link"/)
    expect(panelSrc).toMatch(/\/educacion#multi-view/)
    expect(panelSrc).toMatch(/aria-expanded=\{open\}/)
  })

  it('policy copy is orientation-only (never forage permission)', () => {
    expect(panelSrc).toMatch(/nunca autorizan consumo|never authorize consumption/i)
    expect(panelSrc.toLowerCase()).not.toMatch(/safe to eat|puedes comer|comestible ok/)
  })

  it('probes dims/luma progressively; does not gate classify', () => {
    expect(panelSrc).toMatch(/probePhotoClientMeta/)
    expect(panelSrc).toMatch(/assessPhotoClientHints/)
    expect(panelSrc).not.toMatch(/canSubmit|disabled=\{|onSubmit/)
  })
})

describe('MultiViewWizard PhotoCoach wire-up contract', () => {
  it('passes fileMeta from last filled (previewUrl + size), not empty next slot only', () => {
    expect(wizardSrc).toMatch(/PhotoCoachPanel/)
    expect(wizardSrc).toMatch(/coachFileMeta/)
    expect(wizardSrc).toMatch(/hintView|hintSlot/)
    expect(wizardSrc).toMatch(/previewUrl/)
    expect(wizardSrc).toMatch(/byteLength/)
  })
})
