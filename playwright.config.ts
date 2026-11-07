import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '*.browser.ts', use: { headless: true, launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined } }, workers: 1 });
