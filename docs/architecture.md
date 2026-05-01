# Nuru.com Architecture

## System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tenants & Agents                         │
│           (Mobile PWA, browser, eventually native apps)          │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
                               ▼
                    ┌──────────────────────┐
                    │  Cloudflare (CDN +   │
                    │  edge cache + WAF)   │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
       │  apps/web    │ │  apps/api    │ │ R2 (photos,  │
       │  (Next.js)   │ │  (Fastify)   │ │ docs, audio) │
       └──────┬───────┘ └──────┬───────┘ └──────────────┘
              │                │
              └────────────────┼─────────────────┐
                               │                 │
                               ▼                 ▼
                    ┌──────────────────┐ ┌─────────────────┐
                    │  Postgres 16     │ │  Redis (cache + │
                    │  + PostGIS       │ │  BullMQ queues) │
                    │  + pgvector      │ └────────┬────────┘
                    └──────────────────┘          │
                                                  ▼
                                         ┌─────────────────┐
                                         │  apps/workers   │
                                         │  (BullMQ)       │
                                         └────────┬────────┘
                                                  │
                ┌─────────────────────────────────┼─────────────────────┐
                │                                 │                     │
                ▼                                 ▼                     ▼
       ┌────────────────┐              ┌──────────────────┐   ┌────────────────┐
       │  Claude API    │              │  Self-hosted GPU │   │  Daraja API    │
       │  (Anthropic)   │              │  (L4 / A10)      │   │  (Safaricom)   │
       │  Haiku/Sonnet/ │              │  bge-m3 +        │   │  STK Push,     │
       │  Opus          │              │  bge-reranker +  │   │  B2C, status   │
       └────────────────┘              │  faster-whisper  │   └────────────────┘
                                       └──────────────────┘
```

## Service responsibilities

### apps/web (Next.js 14, App Router)
- Tenant search, listing browse, viewing booking, application flow
- Agent dashboard, listing creator, CRM
- Server Components for SEO; Client Components for interactivity
- PWA shell for mobile install + push notifications

### apps/api (Fastify)
- All business logic, auth, payments, AI orchestration
- M-Pesa webhook receivers (idempotent)
- Talks to Postgres, Redis, R2, Claude API, self-hosted inference
- Stateless — horizontally scalable

### apps/workers (BullMQ)
- Photo enrichment (vision → listing draft, embedding generation)
- Nightly fraud rescoring (Batch API)
- SMS/WhatsApp delivery
- B2C escrow release (queued so the security credential lives only here)
- Embedding backfills, scraper jobs for market comps

## Data flow: agent creates listing

1. Agent opens listing creator, takes 6 photos with phone camera
2. Web requests signed R2 upload URLs from API
3. Phone uploads photos directly to R2 (no API hop — saves bandwidth)
4. API creates Listing in DRAFT, enqueues `enrich_listing` job
5. Worker calls `generateListing` (Sonnet vision) with R2 URLs
6. Worker writes title/description/category/features back to Listing
7. Worker calls `embed` (self-hosted bge-m3), stores `embedding` in pgvector
8. Worker calls `scoreFraud` (Sonnet) on initial signals
9. Push notification: "Listing draft ready for review"
10. Agent reviews/edits, hits publish → Listing becomes ACTIVE

## Data flow: tenant searches

1. Tenant types or speaks "2BR Kile under 60k na parking"
2. Voice path: API uploads to whisper service, gets text back
3. API calls `parseSearchQuery` (Haiku) → structured filters + semantic intent
4. API embeds semantic intent (self-hosted bge-m3)
5. Single Postgres query: filters + pgvector cosine similarity → top 50
6. API calls `rerank` (self-hosted bge-reranker) → top 20
7. Returns to UI with parsed filters as chips for refinement

## Data flow: deposit and escrow

1. Tenant approved → API creates Lease (PENDING_DEPOSIT) and Escrow (PENDING)
2. Tenant taps "Pay deposit" → API calls `initiateDeposit` → STK push
3. Tenant approves on phone with M-Pesa PIN
4. Daraja calls `/v1/webhooks/mpesa` with result
5. Webhook handler is idempotent (dedups on MerchantRequestID)
6. On success: Escrow → HELD, Lease → ACTIVE, Listing → RENTED
7. Tenant moves in, confirms via app (or 7 days pass)
8. Worker enqueues B2C release → Daraja → landlord receives funds
9. Escrow → RELEASED

## Hosting plan (current)

- **Web + API:** Vercel (web) + Railway/Render (api)
- **Postgres + Redis:** Supabase (managed Postgres with PostGIS+pgvector) + Upstash Redis
- **Workers:** Railway long-running container
- **GPU inference:** Hetzner GPU instance (~$200-400/mo) or Lambda Labs
- **R2:** Cloudflare R2
- **DNS + CDN:** Cloudflare

## Security notes

- All secrets via env vars; never committed
- M-Pesa security credential (B2C) only loaded into worker process,
  never the API service
- National ID stored as salted hash, not raw
- Photo R2 URLs are short-lived signed URLs for private listings;
  public CDN URL only after publish
- Rate limiting at Cloudflare and Fastify levels
- All Claude prompts reviewed for PII in `src/prompts/`; no raw national
  IDs or full names sent to model unless functionally required
