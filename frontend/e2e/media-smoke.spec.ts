import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MEDIA_SPECIES = path.resolve(__dirname, '../../media/species')

test.describe('Media reliability smoke', () => {
  test('encyclopedia cards render species images', async ({ page }) => {
    await page.goto('/enciclopedia')
    await expect(page.getByTestId('encyclopedia-count')).toBeVisible({ timeout: 30_000 })
    await expect
      .poll(async () => {
        const text = (await page.getByTestId('encyclopedia-count').textContent()) || '0'
        return parseInt(text.replace(/[^\d]/g, ''), 10) || 0
      })
      .toBeGreaterThanOrEqual(319)

    const images = page.getByTestId('species-image')
    await expect(images.first()).toBeVisible({ timeout: 15_000 })
    const count = await images.count()
    expect(count).toBeGreaterThan(0)
  })

  test('static media endpoint serves webp from the browser', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const r = await fetch('/media/species/amanita-phalloides/card.webp')
      const buf = new Uint8Array(await r.arrayBuffer())
      const magic = String.fromCharCode(buf[0], buf[1], buf[2], buf[3])
      return {
        status: r.status,
        magic,
        len: buf.length,
        quality: r.headers.get('X-Media-Quality'),
      }
    })
    expect(result.status).toBe(200)
    expect(result.magic).toBe('RIFF')
    expect(result.len).toBeGreaterThan(1000)
    if (result.quality) {
      expect(result.quality).not.toBe('stub_fallback')
    }
  })

  test('missing species path rewrites to placeholder (serve gate)', async ({ page }) => {
    await page.goto('/')
    const result = await page.evaluate(async () => {
      const r = await fetch('/media/species/zzzz-not-a-species/card.webp')
      return {
        status: r.status,
        quality: r.headers.get('X-Media-Quality'),
        cache: r.headers.get('Cache-Control'),
        len: (await r.arrayBuffer()).byteLength,
      }
    })
    expect(result.status).toBe(200)
    expect(result.len).toBeGreaterThan(100)
    if (result.quality) {
      expect(result.quality).toBe('stub_fallback')
    }
    if (result.cache) {
      expect(result.cache).toMatch(/max-age=300/)
    }
  })

  test('tiny on-disk card is rewritten to placeholder (size floor)', async ({ page }) => {
    // Write a real tiny WebP under a QA slug (local media root served by Vite)
    const slug = 'qa-tiny-stub-card'
    const dir = path.join(MEDIA_SPECIES, slug)
    fs.mkdirSync(dir, { recursive: true })
    const tiny = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.alloc(80),
    ])
    const cardPath = path.join(dir, 'card.webp')
    fs.writeFileSync(cardPath, tiny)
    expect(fs.statSync(cardPath).size).toBeLessThan(8192)

    try {
      await page.goto('/')
      const result = await page.evaluate(async (s) => {
        const r = await fetch(`/media/species/${s}/card.webp`)
        return {
          status: r.status,
          quality: r.headers.get('X-Media-Quality'),
          cache: r.headers.get('Cache-Control'),
          len: (await r.arrayBuffer()).byteLength,
        }
      }, slug)
      expect(result.status).toBe(200)
      expect(result.quality).toBe('stub_fallback')
      expect(result.cache || '').toMatch(/max-age=300/)
      // Placeholder body is larger than our 80B stub payload typically
      expect(result.len).toBeGreaterThan(100)
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  test('tiny thumb with good card uses sibling card body', async ({ page }) => {
    const slug = 'qa-tiny-thumb-good-card'
    const dir = path.join(MEDIA_SPECIES, slug)
    fs.mkdirSync(dir, { recursive: true })
    const tinyThumb = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.alloc(40),
    ])
    fs.writeFileSync(path.join(dir, 'thumb.webp'), tinyThumb)
    // Good card: copy fixture if present, else write a larger RIFF-ish payload
    const fixtureCard = path.join(MEDIA_SPECIES, 'amanita-phalloides', 'card.webp')
    if (fs.existsSync(fixtureCard) && fs.statSync(fixtureCard).size >= 8192) {
      fs.copyFileSync(fixtureCard, path.join(dir, 'card.webp'))
    } else {
      // Minimal large buffer so size floor passes (decode not required for size gate)
      const big = Buffer.alloc(9000, 1)
      big.write('RIFF', 0)
      big.write('WEBP', 8)
      fs.writeFileSync(path.join(dir, 'card.webp'), big)
    }
    const cardLen = fs.statSync(path.join(dir, 'card.webp')).size
    expect(cardLen).toBeGreaterThanOrEqual(8192)
    expect(fs.statSync(path.join(dir, 'thumb.webp')).size).toBeLessThan(1500)

    try {
      await page.goto('/')
      const result = await page.evaluate(async (s) => {
        const r = await fetch(`/media/species/${s}/thumb.webp`)
        return {
          status: r.status,
          quality: r.headers.get('X-Media-Quality'),
          len: (await r.arrayBuffer()).byteLength,
        }
      }, slug)
      expect(result.status).toBe(200)
      // Sibling card preferred over brand placeholder
      expect(result.quality).toBe('sibling_fallback')
      expect(result.len).toBe(cardLen)
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
  })

  test('species-image stage is never unrecovered broken (placeholder counts as success)', async ({
    page,
  }) => {
    await page.goto('/enciclopedia')
    await expect(page.getByTestId('species-image').first()).toBeVisible({ timeout: 20_000 })
    const stages = await page.locator('[data-testid="species-image"]').evaluateAll((els) =>
      els.slice(0, 12).map((el) => el.getAttribute('data-stage')),
    )
    expect(stages.length).toBeGreaterThan(0)
    for (const st of stages) {
      expect(['primary', 'card', 'thumb', 'placeholder', 'inline', null]).toContain(st)
    }
  })
})
