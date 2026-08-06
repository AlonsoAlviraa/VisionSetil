/**
 * 3h graph-engineering loop smoke:
 * bottom-nav, encyclopedia genus, identify guided UI, detail scroll.
 * Screenshots → test-results/loop-3h/
 */
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const SHOT = path.join(process.cwd(), 'test-results', 'loop-3h')

async function shot(page: Page, name: string) {
  fs.mkdirSync(SHOT, { recursive: true })
  await page.screenshot({ path: path.join(SHOT, `${name}.png`), fullPage: true })
}

test.describe('3h loop product smoke', () => {
  test('bottom nav + genus Boletus/Lactarius + ficha top + identify guided', async ({
    page,
  }) => {
    // Mobile-ish viewport (bottom nav + sticky CTAs)
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/')
    await shot(page, '01-home-mobile')

    // Bottom nav encyclopedia
    await page.getByTestId('bottom-nav-ency').click()
    await page.waitForURL(/\/enciclopedia/)
    await page.waitForSelector('.species-photo-card, [data-testid="family-guide-strip"]', {
      timeout: 30_000,
    })
    await page.waitForTimeout(600)
    await shot(page, '02-ency-mobile')

    // Genus Boletus
    const boletus = page.getByTestId('ency-genus-boletus')
    await expect(boletus).toBeVisible({ timeout: 10_000 })
    await boletus.click()
    await page.waitForTimeout(500)
    await shot(page, '03-genus-boletus')
    const count1 = await page.getByTestId('ency-results-count').innerText()
    expect(count1).toMatch(/Boletus/i)
    const n1 = Number((count1.match(/(\d+)/) || [])[1] || 0)
    expect(n1).toBeGreaterThan(0)

    // Cards not black
    const img = page.locator('.species-photo-card__img').first()
    await expect(img).toBeVisible()
    const op = await img.evaluate((el) => Number(getComputedStyle(el).opacity))
    expect(op).toBeGreaterThan(0.3)

    // Lactarius genus
    await page.getByTestId('ency-genus-lactarius').click()
    await page.waitForTimeout(500)
    await shot(page, '04-genus-lactarius')
    const count2 = await page.getByTestId('ency-results-count').innerText()
    expect(count2).toMatch(/Lactarius/i)
    const n2 = Number((count2.match(/(\d+)/) || [])[1] || 0)
    expect(n2).toBeGreaterThan(0)

    // Open ficha from mid-scroll
    await page.evaluate(() => window.scrollTo(0, 400))
    await page.locator('.species-photo-card a.species-photo-card__media-link').first().click()
    await page.waitForURL(/\/enciclopedia\/[^/]+/)
    // Product scrolls top over ~200–400ms after route change
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeLessThan(80)
    await shot(page, '05-detail-mobile')

    const hero = page.locator('.species-detail-hero__media').first()
    await expect(hero).toBeVisible()
    const box = await hero.boundingBox()
    expect(box!.height).toBeGreaterThan(140)

    // Identify guided
    await page.getByTestId('bottom-nav-identify').click()
    await page.waitForURL(/\/identificar/)
    await page.waitForTimeout(500)
    await shot(page, '06-identify-landing')

    const guided = page.getByTestId('identify-mode-guided')
    if ((await guided.count()) > 0) {
      await guided.click()
      await page.waitForTimeout(300)
    }
    await expect(page.getByTestId('multi-view-wizard')).toBeVisible({ timeout: 10_000 })
    await shot(page, '07-identify-guided')

    // Wizard has 4 slots + camera/gallery CTAs
    const slots = page.locator('.mv-slot')
    await expect(slots).toHaveCount(4)
    await expect(page.locator('.mv-camera-btn, .mv-add').first()).toBeVisible()

    // More hub
    await page.getByTestId('bottom-nav-more').click()
    await page.waitForURL(/\/mas/)
    await page.waitForTimeout(400)
    await shot(page, '08-more-hub')
  })

  test('desktop: family Boletos + open edulis detail', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/enciclopedia')
    await page.waitForSelector('[data-testid="ency-genus-chips"]', { timeout: 30_000 })
    await page.getByTestId('ency-genus-all').click()
    await page.locator('.family-chip').filter({ hasText: /Bolet/i }).first().click()
    await page.waitForTimeout(400)
    await shot(page, '10-desktop-boletos')
    await page.locator('.species-photo-card a').first().click()
    await page.waitForURL(/\/enciclopedia\//)
    await expect
      .poll(async () => page.evaluate(() => window.scrollY), { timeout: 3000 })
      .toBeLessThan(80)
    await shot(page, '11-desktop-detail')

    // Collapsed open-study (summary visible, body closed by default)
    const study = page.getByTestId('detail-open-study-collapse')
    await expect(study).toBeVisible()
    await expect(study).not.toHaveAttribute('open', '')
    await study.locator('summary').click()
    await expect(study).toHaveAttribute('open', '')
    await shot(page, '12-detail-open-study')
  })

  test('games primary reto + offline sticky + free identify tip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })

    await page.goto('/juegos')
    await expect(page.getByTestId('games-hub-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('games-hub-primary-continue')).toBeVisible()
    await shot(page, '20-games-hub')
    // Continue path → first incomplete daily mode (classic/photo/habitat/wordle/reto)
    await page.getByTestId('games-hub-primary-continue').click()
    await page.waitForURL(/\/(reto|wordle|setadle)/)
    await shot(page, '21-continue-from-primary')

    await page.goto('/offline')
    await expect(page.getByTestId('offline-pack-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.cn-warn-strip').first()).toBeVisible()
    await expect(page.locator('.cn-warn-strip').first()).toContainText(/orientaci|consumo|estudio/i)
    await shot(page, '22-offline-pack')

    await page.goto('/identificar')
    await page.getByTestId('identify-mode-free').click()
    await expect(page.getByTestId('identify-free-empty')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByTestId('identify-free-empty')).toContainText(/orientaci|consumo|Libre/i)
    await shot(page, '23-identify-free-empty')

    await page.goto('/reto')
    await expect(page.getByTestId('quiz-page')).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('quiz-start-daily')).toBeVisible()
    await expect(page.getByTestId('quiz-back-games')).toBeVisible()
    await shot(page, '24-quiz-lobby')

    await page.goto('/lookalikes')
    await expect(page.getByTestId('lookalike-studio-page')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.lookalike-classic-card').first()).toBeVisible({ timeout: 10_000 })
    await shot(page, '25-lookalike-studio')

    await page.goto('/educacion')
    await expect(page.getByTestId('edu-faq-list')).toBeVisible({ timeout: 15_000 })
    const faqBtn = page.locator('#edu-faq-btn-0')
    await expect(faqBtn).toBeVisible()
    await expect(faqBtn).toHaveAttribute('aria-expanded', 'true')
    await shot(page, '26-education-faq')

    // Encyclopedia page testId + seasonal strip optional on home
    await page.goto('/enciclopedia')
    await expect(page.getByTestId('encyclopedia-page')).toBeVisible({ timeout: 20_000 })
    await shot(page, '27-encyclopedia-page')

    await page.goto('/')
    await expect(page.getByTestId('bottom-nav')).toBeVisible()
    const season = page.getByTestId('seasonal-top-strip')
    if ((await season.count()) > 0) {
      await expect(season).toBeVisible()
      await shot(page, '28-seasonal-strip')
    }
  })
})
