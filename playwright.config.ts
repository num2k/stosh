import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test-e2e",
  use: {
    headless: true,
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run test:serve",
    url: "http://localhost:3000",
    timeout: 120 * 1000,

    reuseExistingServer: !process.env.CI,
  },
});
