import { defineConfig, devices } from "@playwright/test";
import { resolveLiveApiBase, resolveLiveWebBase } from "./src/lib/live-api-base";

/**
 * Opt-in LIVE config for the owner dashboard. NEVER the default playwright
 * config: that one targets port 5173, which belongs to another worktree.
 *
 * This config drives the dev server on 5174 (tenant host
 * soho-test-fixture.localhost, first hostname label = tenant slug) against the
 * real NestJS backend at 127.0.0.1:3300. The server is expected to ALREADY be
 * running; reuseExistingServer makes Playwright attach to it instead of
 * spawning a second one.
 *
 * Both local endpoints come from src/lib/live-api-base.ts, so an operator can
 * move the stack with NHILOS_LIVE_API / NHILOS_LIVE_BASE and the browser, the
 * dev-server env, and the HTTP suites keep pointing at the same backend. An
 * unset or blank variable falls back to the canonical :3300 / :5174 stack
 * instead of producing an empty base URL.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.live.spec.ts",
  reporter: [["list"]],
  use: {
    baseURL: resolveLiveWebBase(),
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
      // Origin of the same backend the HTTP live suites talk to (VITE_API_URL is
      // the API ORIGIN: the dashboard appends /api itself, see src/lib/api-base-url.ts).
      VITE_API_URL: new URL(resolveLiveApiBase()).origin,
    } as Record<string, string>,
  },
});
