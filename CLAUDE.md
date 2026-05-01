# Nuru.com — Project Guide for Claude Code

This file is read at the start of every Claude Code session. Keep it current.

## What we're building

An AI-native rental marketplace for Kenya. Tenants search conversationally
("2BR Kilimani under 60K with parking"), agents list properties in 60 seconds
via AI from photos, and deposits flow through M-Pesa escrow. MVP scope is
long-term rentals in Nairobi (Kilimani, Westlands, Kileleshwa, Lavington,
Parklands).

## Stack — non-negotiable

- **Runtime:** Node.js 20 LTS, TypeScript strict mode
- **Framework:** Next.js 14 (App Router) for web, Fastify for the API service
- **Database:** PostgreSQL 16 + PostGIS (geo) + pgvector (semantic search)
- **ORM:** Prisma. Migrations checked in. Never edit `migrations/` by hand.
- **Cache/Queue:** Redis (Upstash in prod), BullMQ for jobs
- **Storage:** Cloudflare R2 with R2 Image Resizing for thumbs
- **Payments:** Safaricom Daraja API 3.0 (M-Pesa) — direct, not via aggregator
- **Comms:** Africa's Talking SMS, WhatsApp Business API, Resend email
- **Auth:** Phone-OTP first (most Kenyans don't email-verify)
- **AI:** Claude API for reasoning, self-hosted bge-m3 for embeddings,
  faster-whisper for voice. See `src/ai/router.ts` for routing rules.

## Architecture rules

1. **Three services**, one repo (Turborepo): `apps/web` (Next.js),
   `apps/api` (Fastify), `apps/workers` (BullMQ consumers).
2. **All M-Pesa callbacks must be idempotent.** Use the Daraja
   `MerchantRequestID` as the dedup key. Never trust callback order.
3. **All AI prompts live in `src/prompts/*.ts` as versioned exports.** Never
   inline prompts in route handlers. Add eval cases when you change a prompt.
4. **All API schemas use Zod.** Request validation, response shapes, AI
   structured outputs — all Zod. Generate TS types from Zod, not the other way.
5. **Money is always integer KES cents in the DB.** Never floats. Display
   formatting happens at the edge.
6. **Geo queries use PostGIS.** Don't compute distances in JS.
7. **Photos go to R2 directly via signed URLs.** Never proxy uploads through
   our API — Kenya bandwidth is precious.

## AI cost discipline

Default to Haiku 4.5. Escalate only when quality demands it. The router in
`src/ai/router.ts` enforces this. Rules:

- **Haiku 4.5** ($1/$5 per MTok): listing categorization, response drafting,
  notification copy, simple extraction, search query parsing
- **Sonnet 4.6** ($3/$15 per MTok): listing generation from photos (vision),
  fraud reasoning, tenant screening summaries, agent CRM auto-replies
- **Opus 4.7** ($5/$25 per MTok): only for dispute resolution, complex
  multi-turn agent flows. Requires explicit `escalate: true` flag.
- **Always cache** the system prompt with `cache_control: ephemeral`. Our
  prompts are 1-3K tokens — caching cuts input cost ~90%.
- **Use Batch API** (50% off) for: nightly fraud rescoring, embedding
  backfills, bulk listing quality audits. Anything not user-facing.
- **Self-hosted** (single L4 GPU, ~$200/mo): bge-m3 embeddings,
  bge-reranker-v2-m3, faster-whisper-large-v3. See `infra/inference/`.

When you add a new AI call, you MUST: (a) pick the cheapest model that
passes the eval, (b) cache the system prompt, (c) add a cost estimate
comment above the call.

## Conventions

- **File names:** kebab-case for files, PascalCase for components, camelCase
  for functions and variables.
- **API routes:** RESTful, plural resources. `/v1/listings`, `/v1/viewings`.
- **Errors:** Throw typed errors from `src/lib/errors.ts`. Never throw
  strings. Map to HTTP at the route boundary only.
- **Logging:** Pino with structured JSON. Never log PII (phone numbers,
  IDs). Use the `redact` config in `src/lib/logger.ts`.
- **Tests:** Vitest. Co-located as `*.test.ts`. Mock the Claude API and
  Daraja in unit tests; use the sandbox for integration.
- **Commits:** Conventional Commits. `feat(listings): ...`, `fix(mpesa): ...`.

## Kenya-specific gotchas — read before coding

- Phone numbers: store as E.164 (`+254712345678`). Daraja wants `2547...`
  (no +). Use `src/lib/phone.ts` to convert.
- Currency: always KES, integer cents. 1,000 KES = 100000 in DB.
- Languages: support English, Swahili, Sheng input. Don't translate to
  English before processing — Claude handles all three natively.
- M-Pesa transaction limits: 1 KES min, 250,000 KES max per transaction
  (as of 2026). Daily limit 500K. Validate before STK push.
- Daraja sandbox is flaky after 6pm EAT. Schedule tests in the morning.
- SMS sender ID: must be pre-registered with Africa's Talking. "NURU"
  takes ~3 days to approve. Use sandbox alphanumeric until then.

## What's done

(Update this section as you ship.)

- [x] Repo scaffold, CLAUDE.md, env config
- [x] Prisma schema with PostGIS and pgvector
- [x] AI router with cost-aware model selection
- [x] Listing generation prompt + eval harness
- [x] Search parser prompt
- [x] Fraud detection scorer
- [x] M-Pesa Daraja STK push + callback handler
- [x] Foundation utils: typed errors, phone normalization, JWT auth, rate limit, R2 client
- [x] Phone OTP auth (request/verify) + JWT sessions + role-based middleware
- [x] Listing CRUD API with state machine (DRAFT→PENDING_REVIEW→ACTIVE→…)
- [x] Photo upload pipeline (signed R2 URLs + listing enrichment worker)
- [x] Viewing booking + 24h SMS reminder worker
- [x] Verification flow (tenant ID hash, agent KRA PIN)
- [x] B2C escrow release worker + B2C result/timeout webhook handlers
- [x] Conversational search endpoint
- [x] Web PWA shell (Next.js 14 + Tailwind, manifest + service worker)
- [x] Agent dashboard (my listings, listing creator with photo upload, verify)
- [x] Tenant pages (search, listing detail, viewing booking, my viewings)
- [x] Phone-OTP login flow on web
- [x] WhatsApp Business client + inbound webhook + autoreply prompt (creds-gated)
- [x] Web Push subscription endpoints + VAPID generator + browser helper
- [x] Whisper server stub (FastAPI + faster-whisper) for the GPU box
- [x] CI: GitHub Actions for typecheck/test on api + web; conditional AI evals
- [x] Integration test scaffold (`pnpm test:integration`)
- [x] Seed, eval-runner, STK simulator, VAPID generator scripts
- [x] Vendor setup + deployment + incident runbooks (`docs/runbooks/`)
- [ ] Apply Prisma migrations against a real DB (deployment time)
- [ ] Approve "NURU" sender ID with Africa's Talking (3 days lead time)
- [ ] Approve Daraja B2C production access (~3 weeks lead time)
- [ ] Verify Meta Business + WhatsApp display name (~1-2 weeks lead time)
- [ ] Register with ODPC (Kenya Data Protection) (~30 days lead time)

## How to ask Claude Code for help

Good prompts for this repo:

- "Add a Prisma model for `LeaseDispute` with status enum and link to escrow"
- "Implement the photo upload route: signed URL → R2 → trigger enrichment job"
- "Write the cron worker that rescores fraud nightly using batch API"
- "Add an eval case to listing-generator.test.ts for a watermarked photo"

Bad prompts:

- "Build the whole listing flow" — too broad, break it down
- "Make it production ready" — undefined, specify the gap
- "Optimize the AI calls" — point at the file, name the metric

## When in doubt

- Check `docs/architecture.md` for the big picture
- Check `docs/decisions/` for ADRs explaining why we did things
- Daraja docs: https://developer.safaricom.co.ke/
- Claude API docs: https://docs.claude.com
- Ask for the smallest possible change first; iterate.
