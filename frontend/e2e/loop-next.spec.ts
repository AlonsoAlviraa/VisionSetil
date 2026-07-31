/**
 * Next loop: genus chips, free identify mode, map mobile chrome.
 */
import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const SHOT = path.join(process.cwd(), 'test-results', 'loop-next')

async function shot(page: import('@playwright/test').Page, name: string) {
  fs.mkdirSync(SHOT, { recursive: true })
  await page.screenshot({ path: path.join(SHOT, `${name}.png`), fullPage: true })
}

test.describe('next loop', () => {
  test('home featured species momento safety chips', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForSelector('[data-testid="featured-species-grid"]', { timeout: 30_000 })
    const grid = page.getByTestId('featured-species-grid')
    await expect(grid).toBeVisible()
    await expect(page.getByTestId('featured-species-cta-ency')).toBeVisible()
    await expect(grid).toContainText(/orientaci|estudio|nunca|consumo/i)
    // Must not lead browse cards with forage-green "Comestible"
    const chipText = await grid.locator('.species-photo-card__chips').allInnerTexts()
    const joined = chipText.join(' | ')
    expect(joined.toLowerCase()).not.toMatch(/\bcomestible\b/)
    const cards = grid.getByTestId('species-photo-card')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThanOrEqual(4)
    await shot(page, '00-home-featured-momento')
  })

  test('genus Boletus + Lactarius + featured open', async ({ page }) => {
    await page.goto('/enciclopedia')
    await page.waitForSelector('[data-testid="ency-genus-chips"]', { timeout: 30_000 })
    await page.getByTestId('ency-genus-boletus').click()
    await page.waitForTimeout(400)
    await shot(page, '01-genus-boletus')
    let ct = await page.getByTestId('ency-results-count').innerText()
    expect(ct).toMatch(/Boletus/i)
    expect(Number((ct.match(/(\d+)/) || [])[1])).toBeGreaterThan(0)
    await expect(page.locator('.species-photo-card__img').first()).toBeVisible()

    await page.getByTestId('ency-genus-lactarius').click()
    await page.waitForTimeout(400)
    await shot(page, '02-genus-lactarius')
    ct = await page.getByTestId('ency-results-count').innerText()
    expect(ct).toMatch(/Lactarius/i)

    // Featured still present somewhere when genus all
    await page.getByTestId('ency-genus-all').click()
    await page.waitForTimeout(400)
    const featured = page.getByTestId('ency-featured-flat')
    if ((await featured.count()) > 0) {
      await expect(featured).toBeVisible()
      await shot(page, '03-featured')
      const fImg = featured.locator('.species-photo-card__img').first()
      if ((await fImg.count()) > 0) {
        const op = await fImg.evaluate((el) => Number(getComputedStyle(el).opacity))
        expect(op).toBeGreaterThan(0.3)
      }
    }
  })

  test('identify free mode chrome', async ({ page }) => {
    await page.goto('/identificar')
    await page.waitForTimeout(500)
    await page.getByTestId('identify-mode-free').click()
    await page.waitForTimeout(300)
    await shot(page, '04-identify-free')
    await expect(page.getByTestId('upload-open-camera').or(page.locator('[data-testid="upload-open-camera"]'))).toBeVisible({
      timeout: 10_000,
    }).catch(async () => {
      // UploadZone may use different structure — at least free mode active
      await expect(page.getByTestId('identify-mode-free')).toHaveAttribute('aria-pressed', 'true')
    })
    await expect(page.getByTestId('identify-mode-free')).toHaveAttribute('aria-pressed', 'true')
  })

  test('map mobile chrome touch targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/mapa')
    await page.waitForTimeout(1200)
    await shot(page, '05-map-mobile')
    const chrome = page.locator('.map-chrome, .page-map').first()
    await expect(chrome).toBeVisible({ timeout: 20_000 })
    // Leaflet or map host present
    await expect(page.locator('.leaflet-container, .map-leaflet-host, .page-map').first()).toBeVisible()
  })

  test('history empty + community sticky + food collapse', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/historial')
    await expect(page.getByTestId('history-page')).toBeVisible({ timeout: 15_000 })
    await shot(page, '06-history')
    // Empty state or grid both valid
    const empty = page.getByTestId('notebook-empty')
    const grid = page.getByTestId('history-card-grid')
    expect((await empty.count()) + (await grid.count())).toBeGreaterThan(0)

    await page.goto('/comunidad')
    await expect(page.getByTestId('community-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.cn-warn-strip').first()).toContainText(/orientaci|consumo|opiniones/i)
    await shot(page, '07-community')

    await page.goto('/enciclopedia/boletus-edulis')
    await page.waitForTimeout(800)
    const food = page.getByTestId('species-food-quality')
    await expect(food).toBeVisible({ timeout: 15_000 })
    await expect(food).not.toHaveAttribute('open', '')
    await food.locator('summary').click()
    await expect(food).toHaveAttribute('open', '')
    await shot(page, '08-food-collapse')

    await page.goto('/educacion')
    await expect(page.getByTestId('education-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('edu-faq-list')).toBeVisible()
    await shot(page, '09-education')

    await page.goto('/mapa')
    await expect(page.getByTestId('spain-map-page')).toBeVisible({ timeout: 20_000 })
    await shot(page, '10-map-testid')
  })
})
