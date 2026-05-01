/**
 * Worker entry point. Run with: pnpm tsx src/workers/index.ts
 *
 * One process can run all workers (lower ops surface), or you can split
 * them across processes with WORKER_FILTER=<comma-separated>.
 */

import { logger } from "../lib/logger";
import { startListingEnrichmentWorker } from "./listing-enrichment";
import { startEscrowReleaseWorker } from "./escrow-release";
import { startViewingReminderWorker } from "./viewing-reminders";

const FILTER = (process.env.WORKER_FILTER ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const enabled = (name: string) => FILTER.length === 0 || FILTER.includes(name);

const workers: Array<{ name: string; close: () => Promise<void> }> = [];

async function main() {
  if (enabled("listing-enrichment")) {
    const w = startListingEnrichmentWorker();
    workers.push({ name: "listing-enrichment", close: () => w.close() });
  }
  if (enabled("escrow-release")) {
    const w = startEscrowReleaseWorker();
    workers.push({ name: "escrow-release", close: () => w.close() });
  }
  if (enabled("viewing-reminders")) {
    const w = startViewingReminderWorker();
    workers.push({ name: "viewing-reminders", close: () => w.close() });
  }
  logger.info({ workers: workers.map((w) => w.name) }, "workers started");
}

async function shutdown(reason: string) {
  logger.info({ reason }, "workers shutting down");
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  logger.error({ err }, "worker startup failed");
  process.exit(1);
});
