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
  retries: process.env.CI ? 1 : 0,
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
      // Learning-first dual-shell matrix only (UX-08 acceptance)
      testMatch: /(?:learning-first-dual-shell|a11y-reduced-motion)\.spec\.ts/,
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
