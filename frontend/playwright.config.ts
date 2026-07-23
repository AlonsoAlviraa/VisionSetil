import { defineConfig, devices } from '@playwright/test'

/**
 * Smoke E2E for VisionSetil frontend (catalog count + identify coach).
 * Uses Vite dev server; catalog comes from FE snapshot (no ML backend required).
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
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    // Prefer fresh Vite so media middleware from vite.config is loaded; reuse when busy locally
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
