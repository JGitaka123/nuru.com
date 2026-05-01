# Nuru.com

AI-native rental marketplace for Kenya. MVP: long-term rentals in Nairobi.

## Quick start

```bash
# Prereqs: Node 20+, pnpm, Docker, a Daraja sandbox account, an Anthropic API key

# 1. API (Fastify)
cp .env.example .env  # fill in keys
pnpm install
docker compose up -d  # postgres + redis + self-hosted inference
pnpm db:migrate
pnpm db:seed
pnpm dev               # → http://localhost:4000

# 2. Workers (BullMQ) — separate process
pnpm dev:workers

# 3. Web (Next.js)
cd web
cp .env.example .env.local
pnpm install
pnpm dev               # → http://localhost:3000
```

## Repo layout

```
src/                  Fastify API (routes, services, lib, prompts)
  routes/             /v1/* HTTP endpoints
  services/           business logic (listings, viewings, escrow, otp, …)
  prompts/            versioned Claude prompts + evals
  ai/router.ts        cost-aware model selection
  workers/            BullMQ consumers (listing-enrichment, escrow-release, …)
  lib/                errors, phone, auth (JWT), r2, rate-limit, logger
  db/                 Prisma client wrapper
prisma/               schema.prisma + migrations
web/                  Next.js 14 PWA (tenants + agents)
infra/inference/      bge-m3 + reranker + whisper (single GPU)
docs/
  architecture.md
  decisions/          ADRs
scripts/              seed, eval, mpesa simulators, cost projections
```

## Key commands

| Command | What it does |
|---|---|
| `pnpm dev` | Run web + api + workers in parallel |
| `pnpm db:migrate` | Apply Prisma migrations |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm test` | Run all unit tests |
| `pnpm test:e2e` | Run e2e tests against local stack |
| `pnpm ai:eval` | Run AI prompt evals (CI gate) |
| `pnpm mpesa:simulate <amount>` | Simulate STK push in sandbox |

## Where to start reading

1. `CLAUDE.md` — the rules of the road
2. `docs/architecture.md` — system design
3. `src/ai/router.ts` — how we route AI calls
4. `prisma/schema.prisma` — data model
5. `src/services/mpesa.ts` + `src/services/escrow.ts` — payment flow
6. `web/src/app/` — Next.js routes (search, listing, agent, login)

## Environment variables

See `.env.example` for the full list. The critical ones:

- `ANTHROPIC_API_KEY` — Claude API
- `DATABASE_URL` — Postgres (must have postgis + pgvector)
- `REDIS_URL` — Redis
- `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` — Daraja sandbox
- `MPESA_PASSKEY` / `MPESA_SHORTCODE` — Daraja STK push
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — Cloudflare R2
- `AT_API_KEY` / `AT_USERNAME` — Africa's Talking SMS

## License

Proprietary. Do not redistribute.
