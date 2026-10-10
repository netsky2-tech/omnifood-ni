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
      // Suite-layout rule (issue #830): `.live.test.ts` is the only
      // runner-significant suffix in src/__tests__. A `*.live.test.ts` file
      // needs the real backend on 127.0.0.1:3300 and runs only via
      // `npm run test:integration`; everything else under src/** runs here in
      // `npm test` (no network suite runs in the default unit run).
      "src/__tests__/w1.live.test.ts",
      "src/__tests__/w4-fiscal.live.test.ts",
      "src/__tests__/modifiers.live.test.ts",
      "src/__tests__/devices.live.test.ts",
    ],
    testTimeout: 10000,
    css: true,
  },
});
