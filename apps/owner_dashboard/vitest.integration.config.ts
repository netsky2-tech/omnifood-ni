import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/w1.integration.test.ts"],
    testTimeout: 15_000,
  },
});
