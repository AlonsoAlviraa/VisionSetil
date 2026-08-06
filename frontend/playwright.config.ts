import { defineConfig, devices } from '@playwright/test'

/**
 * Dual-shell E2E (UX-08 / PR-18):
 * - app shell  → Vite :5173 (`main-app.tsx`, PWA-capable)
 * - web shell  → Vite :5174 (`main-web.tsx`, browser chrome)
 *
 * Default project `app` runs the full suite.
 * Project `web` only runs learning-first + a11y PRM matrix (parity smoke).
 * Catalog comes from FE snapshot — no ML backend / product_unlock required.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // One local retry absorbs Vite cold-start flakes on Windows first navigation
  retries: process.env.CI ? 1 : 1,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'app',
      use: {
        baseURL: 'http://127.0.0.1:5173',
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'web',
      use: {
        baseURL: 'http://127.0.0.1:5174',
        ...devices['Desktop Chrome'],
      },
      // Dual-shell parity matrix: learning-first + a11y + identify photo upload
      testMatch:
        /(?:learning-first-dual-shell|a11y-reduced-motion|identify-photo-dual-shell)\.spec\.ts/,
    },
    // Mobile viewport profiles (store launch matrix) — app shell.
    // Chromium + viewport (not WebKit iPhone devices): WebKit is not installed
    // on all CI/dev Windows hosts; viewport matrix still covers small/mid/large.
    {
      name: 'mobile-small',
      use: {
        baseURL: 'http://127.0.0.1:5173',
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 667 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1 VisionSetilE2E/small',
      },
      testMatch: /identify-photo-dual-shell\.spec\.ts/,
    },
    {
      name: 'mobile-mid',
      use: {
        baseURL: 'http://127.0.0.1:5173',
        ...devices['Desktop Chrome'],
        viewport: { width: 393, height: 851 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 VisionSetilE2E/mid',
      },
      testMatch: /identify-photo-dual-shell\.spec\.ts/,
    },
    {
      name: 'mobile-large',
      use: {
        baseURL: 'http://127.0.0.1:5173',
        ...devices['Desktop Chrome'],
        viewport: { width: 428, height: 926 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1 VisionSetilE2E/large',
      },
      testMatch: /identify-photo-dual-shell\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'npm run dev:app -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web -- --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
