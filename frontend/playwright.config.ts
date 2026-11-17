import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5199',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../scripts/start-e2e.mjs',
      url: 'http://127.0.0.1:8011/up',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199',
      url: 'http://127.0.0.1:5199',
      reuseExistingServer: false,
      env: { NEXORA_API_URL: 'http://127.0.0.1:8011' },
      timeout: 60_000,
    },
  ],
})
