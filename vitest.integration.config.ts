/**
 * Integration test config — runs against a real Postgres + Redis instance.
 * See docs/runbooks/deployment.md for setup, or use `docker compose up -d`.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 30_000,
    pool: "forks",            // each suite gets a fresh process for clean DB
    poolOptions: { forks: { singleFork: true } }, // serialize writes
  },
});
