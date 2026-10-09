import { defineConfig, devices } from "@playwright/test";

/**
 * Opt-in LIVE config for the owner dashboard. NEVER the default playwright
 * config: that one targets port 5173, which belongs to another worktree.
 *
 * This config drives the dev server on 5174 (tenant host
 * soho-test-fixture.localhost, first hostname label = tenant slug) against the
 * real NestJS backend at 127.0.0.1:3300. The server is expected to ALREADY be
 * running; reuseExistingServer makes Playwright attach to it instead of
 * spawning a second one.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.live.spec.ts",
  reporter: [["list"]],
  use: {
    baseURL:
      process.env.NHILOS_LIVE_BASE ?? "http://soho-test-fixture.localhost:5174",
    screenshot: "only-on-failure",
    timeout: 90_000,
    expect: { timeout: 10_000 },
  },
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      ...process.env,
      VITE_API_URL: "http://127.0.0.1:3300",
    } as Record<string, string>,
  },
});
