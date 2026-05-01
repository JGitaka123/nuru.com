# ADR-002: ML feedback loop & continuous improvement layer

**Status:** Accepted (May 2026)
**Authors:** Founding team

## Context

The product depends on AI output quality (listing drafts, fraud scoring,
search parsing, tenant screening, autoreply). Without instrumentation we
cannot answer:

- Are listings the AI drafts being heavily edited by agents? Which fields?
- Are fraud scores predictive of actual reports/disputes?
- Is the search parser missing intent in Sheng vs. English?
- Are tenants who get APPROVED actually paying deposits?
- Which neighborhoods convert search → inquiry best?

We also need a path for these signals to *improve* the system over time
without manual prompt-fiddling guesswork.

## Decision

Ship four interlocking subsystems:

### 1. Event capture (`Event` model)

Every meaningful user/system action emits an event row:
search, search_click, listing_view, inquiry_submit, viewing_book,
application_submit, application_decided, escrow_initiated, escrow_held,
escrow_released, dispute_opened, listing_published, listing_rented.

Events are written via fire-and-forget BullMQ (`eventQueue`) so request
latency isn't affected. The worker batches writes.

Events power: funnel dashboards, recommendation training data, AI
feedback context, A/B test analysis.

### 2. AI output capture (`AiOutput` + `PromptVersion`)

`src/ai/router.ts` records every call: task, tier, model, prompt version,
input hash, output, cost, latency, target id (e.g. listing id).

Inputs are stored as `sha256` hash + 500-char preview — avoids bloat.
The `(promptVersionId, inputHash)` pair makes outputs reproducible.

Prompts are versioned by content-hash. Updating a prompt creates a new
`PromptVersion` row; the router auto-registers on first use.

### 3. Human feedback loop (`AiFeedback`)

Admins grade outputs as `correct | wrong | edited | partial` via
`/v1/admin/ai-feedback/*`. Edited outputs become the highest-quality
training signal: they are the *correct* answer the model should have
produced.

Graded outputs feed two pipelines:
- **Eval set growth**: cases with `promoteToEval=true` become regression
  tests in `tests/evals/`.
- **Few-shot examples**: top-graded `edited` outputs get inlined into
  prompts as exemplars (manual review + curation step).

### 4. A/B prompt routing

`src/ai/prompt-versions.ts` resolves `task → active version`. New prompt
variants ship with `rollout < 1` (canary). The router uses
`hash(actorId + task) → fraction` to route deterministically per user
(stable assignment; no flapping).

After ~7 days of canary traffic, we compare downstream outcomes:
- For listings: how often does the agent edit the draft? listing
  publishes → days-to-rent?
- For fraud scoring: are flagged listings actually getting reported?
- For search parsing: does search → click conversion change?

A canary is promoted to 100% if it wins on the relevant metric, else
retired.

## Why now

The cost of building this *after* we have production traffic is much
higher: we lose data we can't recover, and prompt regressions slip in
silently. Better to instrument from day one.

## Why not buy

LangSmith / Helicone / etc. solve part of this but:
- Don't capture domain events (only AI calls).
- Add another vendor + cost (Helicone $80-300/mo at our volume).
- Ship our data to a third party — sensitive Kenyan rental info.

Our implementation is ~600 lines and runs on the existing Postgres + BullMQ.

## Tradeoffs

- Event volume at scale needs partitioning (TODO: PostgreSQL time-based
  partitioning on `Event.createdAt` once we exceed ~10M rows).
- AI output storage grows ~30K rows/month at MVP. At scale we may
  downsample (keep all outputs flagged for review, sample others 10%).
- A/B routing requires a stable user id — anonymous traffic uses
  `sessionId` (cookie) for grouping.

## Metrics to watch (admin dashboard)

- AI accept rate per task (1 - edit_rate for listing drafts)
- Fraud score → confirmed-fraud correlation
- Search → inquiry conversion by neighborhood, language
- Application AI recommendation → final agent decision agreement rate
- Days-to-rent by neighborhood, agent, price band
- Cost per task type (already in `recordAiCost`)

## Eval mining workflow

Weekly cron (TODO):
1. Pull `AiFeedback` rows where `promoteToEval=true` from the last week.
2. For each, write a test case to `tests/evals/<task>/<hash>.json` with
   the input + the corrected output as ground truth.
3. Open a PR with the new evals. Author = bot; reviewer = team.
4. CI runs `pnpm ai:eval` against the expanded set on the next prompt change.

## Recommendations from embeddings

`src/services/recommendations.ts` exposes:
- `similarListings(listingId, k)` — pgvector cosine over the `embedding`
  column we already store on `Listing`.
- `recommendedForUser(userId, k)` — average embeddings of listings the
  user has viewed/inquired/applied to → vector search.

No model training required: bge-m3 embeddings already encode the
semantic substance of a listing. We just query.

## Market intelligence

`src/workers/market-intel.ts` runs daily:
- Aggregates active listings per `(neighborhood, category, bedrooms)`
  → median, P25, P75 rent.
- Joins with rented listings to compute `daysToRentMedian`.
- Writes to `MarketStat` (one row per segment per day).

Powers:
- Agent listing creator: "Listings like this in Kilimani rent for
  KES 65-90K (median 78K)".
- Tenant search: "This is 12% below market".
- Fraud scorer signal: `rentVsMarketMedianRatio`.

## When to revisit

- Event volume exceeds 1M/day → partition Event table.
- Manual prompt iteration becomes the bottleneck → consider DSPy or
  similar prompt-optimization tooling driven off the eval set.
- AI accept rate plateaus → consider fine-tuning a small open-source model
  on the curated edit corpus.
