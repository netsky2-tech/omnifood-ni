import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for the LIVE owner-dashboard suites only: these files talk to a
 * real backend over HTTP, so they are excluded from `npm test` (and from CI) and
 * run on demand with `pnpm run test:integration` from apps/owner_dashboard.
 *
 * Canonical target is the local SHADOW STACK: NestJS on 127.0.0.1:3300
 * (`PORT=3300 npm run start:dev` in apps/admin_backend) — never :3000/:5173,
 * which belong to another worktree's stack. Base-URL resolution (explicit
 * NHILOS_LIVE_API override plus the blank/unset fallback) lives in
 * src/lib/live-api-base.ts and is covered by src/__tests__/live-api-base.test.ts,
 * which DOES run in the default unit suite.
 */

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/__tests__/w1.integration.test.ts",
      "src/__tests__/w4-e2e-fiscal.test.ts",
      "src/__tests__/modifiers-live.integration.test.ts",
    ],
    testTimeout: 15_000,
  },
});
