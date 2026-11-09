const { defineConfig } = require('@playwright/test');
const port = process.env.IMAGECRAFT_TEST_PORT || '18374';
const url = `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: url,
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: ['light', 'dark'].flatMap(mode => [
    { name: `desktop-${mode}`, use: { viewport: { width: 1280, height: 900 }, colorScheme: mode } },
    { name: `mobile-${mode}`, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: mode } },
  ]),
  webServer: {
    command: 'node server.cjs',
    env: { PORT: port },
    url,
    reuseExistingServer: false,
    timeout: 15000,
  },
});
