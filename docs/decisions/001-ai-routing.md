# ADR-001: Why we use Claude API for reasoning, self-hosted for embeddings

**Status:** Accepted (May 2026)
**Authors:** Founding team

## Context

We need to power four kinds of AI workload at Nuru.com:

1. **High-volume, low-margin embeddings** — every listing and every search
   query gets embedded for vector search. Volume scales with users.
2. **High-volume voice transcription** — Kenyan users prefer voice notes.
3. **Reasoning-heavy listing generation, fraud detection, and tenant
   screening** — quality determines product quality.
4. **Reranking search results** — high-volume but specialized.

We have to pick build vs buy for each.

## Decision

- **Reasoning workloads → Claude API.** Specifically: Haiku 4.5 for high-
  volume cheap tasks (search parsing, response drafting, classification);
  Sonnet 4.6 for vision and structured output where quality matters
  (listing generation, fraud, screening); Opus 4.7 reserved for explicit
  escalation (disputes, complex agents).
- **Embeddings, reranking, voice → self-hosted.** A single L4 GPU instance
  running Hugging Face TEI with bge-m3 (embeddings) and bge-reranker-v2-m3
  (reranking), plus faster-whisper-large-v3 for voice.

## Why not all-Claude

Embeddings and voice are extremely high volume (every search, every voice
note) but the quality bar is achievable with open models. At our projected
Year 2 volume (~3M searches, ~500K voice notes, ~10M embedding ops), buying
these from API providers would cost $1500-2500/month. A single self-hosted
L4 GPU runs ~$200-400/month and handles this volume with headroom.

## Why not all-self-hosted

Listing generation needs vision + reasoning + reliable structured output.
Open models in this class (Qwen3-32B, DeepSeek V4-Flash) require a single
H100 minimum (~$1500-2000/month before utilization) and trail Sonnet on
instruction following on our internal evals. At MVP volumes, Claude API
costs us ~$300-800/month for these workloads. The crossover doesn't
favor self-hosting until we exceed ~$5K/month in Claude API spend.

Tenant screening and dispute resolution are also too high-stakes to
compromise quality on for cost. A wrong recommendation is a real human
harm; the quality gap matters.

## Tradeoffs we accept

- **API rate limits and outages.** Mitigated by: (a) stale-while-revalidate
  caches for listing metadata, (b) fallback to keyword search if AI search
  is degraded, (c) async retries via BullMQ for non-realtime work.
- **Vendor lock-in to Anthropic for reasoning.** Mitigated by: keeping all
  prompts in `src/prompts/*.ts` as plain strings, no Anthropic-specific
  features in prompt logic. Could migrate to another provider in <1 week
  if needed, with eval suite as the regression net.
- **Operating one GPU instance.** Real ops cost. Mitigated by: only one
  service to babysit, well-trodden TEI image, simple health checks.

## When to revisit

- Monthly Claude API spend exceeds $5,000 → evaluate self-hosting Sonnet-
  class reasoning.
- We hit consistent rate limits during traffic spikes.
- A specific open model passes our evals at lower TCO. Re-run the eval
  suite quarterly.
- Data sovereignty becomes contractually required (e.g., banking
  partnership requires data not leave Kenya/EAC).

## References

- Eval results: `tests/evals/baseline-2026-05.json`
- Cost telemetry dashboard: Grafana `Nuru → AI Costs`
