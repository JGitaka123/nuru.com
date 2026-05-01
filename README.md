# Nuru.com

AI-native rental marketplace for Kenya. MVP: long-term rentals in Nairobi.

## Quick start

```bash
# Prereqs: Node 20+, pnpm, Docker, a Daraja sandbox account, an Anthropic API key

cp .env.example .env  # fill in keys
pnpm install
docker compose up -d  # postgres + redis + self-hosted inference
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open `http://localhost:3000` for the web app, `http://localhost:4000/health`
for the API.

## Repo layout

```
apps/
  web/              Next.js 14 PWA (tenants + agents)
  api/              Fastify API service
  workers/          BullMQ background jobs
packages/
  db/               Prisma schema + client
  ai/               Claude router, prompts, evals
  mpesa/            Daraja client (STK push, B2C, callbacks)
  shared/           Zod schemas, types, errors, utils
infra/
  inference/        docker-compose for bge-m3, whisper, reranker
  terraform/        infra-as-code (later)
docs/
  architecture.md
  decisions/        ADRs
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
3. `packages/ai/src/router.ts` — how we route AI calls
4. `packages/db/prisma/schema.prisma` — data model
5. `packages/mpesa/src/stk-push.ts` — payment flow

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
