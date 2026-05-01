import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: [
      "node_modules",
      "dist",
      // Integration tests require a real DB — run separately via test:integration.
      "src/**/*.int.test.ts",
    ],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    pool: "threads",
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.int.test.ts", "src/server.ts"],
    },
  },
});
