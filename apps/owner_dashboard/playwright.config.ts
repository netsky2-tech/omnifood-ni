import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Live specs (`*.live.spec.ts`) belong to playwright.live.config.ts: they need the
  // real backend on 127.0.0.1:3300 and the live dev server on :5174. This config
  // targets :5173, which is another worktree's server on this host, so collecting
  // them here was never a boundary — only their env-gated `test.skip` was
  // (issue #830, guarded by src/__tests__/suite-layout.test.ts).
  testIgnore: "**/*.live.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: {
        ...devices["iPhone 12"],
        defaultBrowserType: "chromium",
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
