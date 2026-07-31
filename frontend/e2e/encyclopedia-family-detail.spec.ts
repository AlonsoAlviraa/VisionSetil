/**
 * Graph engineering QA: encyclopedia families + species detail UX.
 * Screenshots land in test-results/ency-qa/
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const SHOT_DIR = path.join(process.cwd(), 'test-results', 'ency-qa')

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  await page.screenshot({
    path: path.join(SHOT_DIR, `${name}.png`),
    fullPage: true,
  })
}

async function waitCatalog(page: Page) {
  // Catalog async hydrate — wait until count or cards appear
  await page.waitForSelector(
    '[data-testid="encyclopedia-count"], .species-photo-card, [data-testid="family-guide-strip"]',
    { timeout: 30_000 },
  )
  // Skeleton should clear
  await page.waitForTimeout(800)
}

test.describe('Encyclopedia family + detail QA', () => {
  test('home → enciclopedia → family filter → ficha scroll/hero', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`)
    })

    // ── Home
    await page.goto('/')
    await shot(page, '01-home')
    await page.getByTestId('home-cta-encyclopedia').click()
    await page.waitForURL(/\/enciclopedia/)
    await waitCatalog(page)
    await shot(page, '02-ency-landing')

    // ── Family guide strip present
    const strip = page.getByTestId('family-guide-strip')
    await expect(strip).toBeVisible({ timeout: 15_000 })
    await shot(page, '03-family-strip')

    // Prefer Boletos / Boletaceae card
    const boletosBtn = strip.locator('button').filter({ hasText: /Bolet|boleto/i }).first()
    const anyFamilyBtn = strip.locator('button.family-guide-strip__card').first()
    const familyBtn = (await boletosBtn.count()) > 0 ? boletosBtn : anyFamilyBtn
    const familyLabel = (await familyBtn.innerText()).replace(/\s+/g, ' ').trim()
    await familyBtn.click()
    await page.waitForTimeout(600)
    await shot(page, '04-after-family-click')

    // Results should reflect filter (count + chips)
    const countEl = page.getByTestId('ency-results-count')
    await expect(countEl).toBeVisible()
    const countText = await countEl.innerText()
    // ES: "45 especies" · EN: "45 species"
    expect(countText).toMatch(/\d+\s+(especies?|species)/i)
    const n = Number((countText.match(/(\d+)/) || [])[1] || 0)
    expect(n, `family filter empty after click (${familyLabel}): ${countText}`).toBeGreaterThan(0)

    // Active chip if matching
    const activeChip = page.locator('.family-chip--active')
    if ((await activeChip.count()) > 0) {
      await expect(activeChip.first()).toBeVisible()
    }

    // Grid cards
    const cards = page.locator('.species-photo-card')
    await expect(cards.first()).toBeVisible({ timeout: 10_000 })
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)
    await shot(page, '05-filtered-grid')

    // ── Open first species fiche
    const beforeY = await page.evaluate(() => window.scrollY)
    // Scroll down first to simulate real user browsing
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.4))
    await page.waitForTimeout(200)
    const midY = await page.evaluate(() => window.scrollY)
    expect(midY).toBeGreaterThan(50)

    await cards.first().locator('a.species-photo-card__media-link, a.species-photo-card__body').first().click()
    await page.waitForURL(/\/enciclopedia\/[^/]+/)
    await page.waitForTimeout(500)
    await shot(page, '06-species-detail')

    // Must land near top (not bottom of previous page)
    const afterY = await page.evaluate(() => window.scrollY)
    expect(afterY, `detail scrollY=${afterY} (was mid ${midY})`).toBeLessThan(120)

    // Hero media visible and with non-zero size
    const hero = page.locator('.species-detail-hero__media, .species-gallery__hero').first()
    await expect(hero).toBeVisible({ timeout: 15_000 })
    const box = await hero.boundingBox()
    expect(box, 'hero bounding box').toBeTruthy()
    expect(box!.height, 'hero height').toBeGreaterThan(160)
    expect(box!.width, 'hero width').toBeGreaterThan(200)

    // Image not 0x0
    const img = page.locator('.species-detail-hero__media img, .species-gallery__hero img').first()
    if ((await img.count()) > 0) {
      const ib = await img.boundingBox()
      if (ib) {
        expect(ib.height).toBeGreaterThan(120)
        expect(ib.width).toBeGreaterThan(120)
      }
    }
    await shot(page, '07-detail-hero-closeup')

    // Tabs usable
    const lookTab = page.locator('#detail-tab-lookalikes, button:has-text("Confusiones")').first()
    if ((await lookTab.count()) > 0) {
      await lookTab.click()
      await page.waitForTimeout(300)
      await shot(page, '08-detail-tab-lookalikes')
    }

    // Back to encyclopedia
    await page.locator('.detail-back a[href="/enciclopedia"]').first().click()
    await page.waitForURL(/\/enciclopedia$/)
    await waitCatalog(page)
    await shot(page, '09-back-ency')

    // Lactarios / Russulaceae if present
    const lactBtn = page
      .getByTestId('family-guide-strip')
      .locator('button')
      .filter({ hasText: /Lactar|Rúsul|Rusul|Russula/i })
      .first()
    if ((await lactBtn.count()) > 0) {
      await lactBtn.click()
      await page.waitForTimeout(500)
      await shot(page, '10-lactarios-filter')
      const ct = await page.getByTestId('ency-results-count').innerText()
      const n2 = Number((ct.match(/(\d+)/) || [])[1] || 0)
      expect(n2, `lactarios filter empty: ${ct}`).toBeGreaterThan(0)
    }

    // Search boletos
    const search = page.locator('input[type="search"]').first()
    await search.fill('boletos')
    await page.waitForTimeout(400)
    await shot(page, '11-search-boletos')
    const cardsAfter = page.locator('.species-photo-card')
    await expect(cardsAfter.first()).toBeVisible({ timeout: 10_000 })

    // Soft assert console (allow network noise + known React 18 img attr noise)
    const hard = consoleErrors.filter(
      (e) =>
        !/favicon|Failed to load resource|net::ERR|ResizeObserver|fetchPriority|fetchpriority/i.test(
          e,
        ) && !/404/.test(e),
    )
    if (hard.length) {
      await shot(page, '12-console-errors')
    }
    expect(hard, hard.join('\n')).toEqual([])

    // Cards must not be empty black frames after family filter
    await page.goto('/enciclopedia')
    await waitCatalog(page)
    await page.locator('.family-chip').filter({ hasText: /Bolet/i }).first().click()
    await page.waitForTimeout(700)
    const firstImg = page.locator('.species-photo-card__img').first()
    await expect(firstImg).toBeVisible()
    const opacity = await firstImg.evaluate((el) => getComputedStyle(el).opacity)
    expect(Number(opacity), 'card image opacity').toBeGreaterThan(0.3)
    await shot(page, '13-cards-visible-after-boletos')
  })

  test('family chips Boletos filter works', async ({ page }) => {
    await page.goto('/enciclopedia')
    await waitCatalog(page)
    const chip = page.locator('.family-chip').filter({ hasText: /Bolet/i }).first()
    if ((await chip.count()) === 0) {
      test.skip(true, 'No Bolet* family chip in first visible set')
      return
    }
    await chip.click()
    await page.waitForTimeout(400)
    await shot(page, '20-chip-boletos')
    await expect(chip).toHaveClass(/family-chip--active/)
    const ct = await page.getByTestId('ency-results-count').innerText()
    const n = Number((ct.match(/(\d+)/) || [])[1] || 0)
    expect(n).toBeGreaterThan(0)
    await expect(page.locator('.species-photo-card').first()).toBeVisible()
  })
})
