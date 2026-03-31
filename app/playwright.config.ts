import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
  },
  workers: 1,
});
