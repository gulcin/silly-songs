import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'node scripts/static.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'ipad-landscape', use: { ...devices['iPad (gen 7) landscape'] } },
    { name: 'ipad-portrait', use: { ...devices['iPad (gen 7)'] } },
    { name: 'ipad-mini-landscape', use: { ...devices['iPad Mini landscape'] } },
    { name: 'ipad-mini-portrait', use: { ...devices['iPad Mini'] } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
    { name: 'iphone-se', use: { ...devices['iPhone SE'] } },
  ],
});
