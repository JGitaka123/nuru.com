/**
 * AI cost telemetry. In production: ship to Grafana/Datadog/Honeycomb.
 * For now: log structured events that can be aggregated later.
 */

import { logger } from "./logger";

export interface AiCostEvent {
  task: string;
  tier: string;
  costUsd: number;
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function recordAiCost(event: AiCostEvent) {
  logger.info({ event: "ai_cost", ...event }, "ai_cost");
  // TODO: increment Prom counters / send to OTEL once observability is set up
}
