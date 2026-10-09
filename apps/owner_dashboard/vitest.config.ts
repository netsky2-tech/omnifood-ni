import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      "src/__tests__/w1.integration.test.ts",
      "src/__tests__/w4-e2e-fiscal.test.ts",
      // Live-API suites: they talk to a real backend on NHILOS_LIVE_API and
      // run via `npm run test:integration`; without a backend (CI) every case
      // dies with ECONNREFUSED. Keep them out of the default unit run.
      "src/__tests__/modifiers-live.integration.test.ts",
    ],
    testTimeout: 10000,
    css: true,
  },
});
