# Nuru web

Next.js 14 PWA for Nuru.com tenants and agents.

## Stack

- Next.js 14 (App Router) with React Server Components
- Tailwind CSS for styling
- Service worker for offline caching of recently-viewed pages
- Talks to the Fastify API at `apps/api` (or `src/` in this repo)

## Run locally

```bash
cd web
cp .env.example .env.local        # set NEXT_PUBLIC_API_URL=http://localhost:4000
pnpm install
pnpm dev                          # http://localhost:3000
```

The API must be running on the host pointed to by `NEXT_PUBLIC_API_URL`
(default `http://localhost:4000`).

## Pages

- `/` — landing + search bar
- `/search?q=…` — conversational search results
- `/listing/[id]` — listing detail
- `/listing/[id]/book` — viewing booking
- `/login` — phone OTP flow
- `/me/viewings` — tenant: my viewings; agent: viewings on my listings
- `/agent` — agent dashboard
- `/agent/new` — listing creator (photos → AI draft)
- `/agent/[id]` — listing detail + state transitions
- `/agent/verify` — agent KYC (KRA PIN + ID hash)

## PWA notes

`public/manifest.webmanifest` declares the install metadata. Icons go in
`public/icons/` (192/512/maskable). The service worker (`public/sw.js`) is
network-first for navigation, cache-first for static assets, and never
caches `/api/` or `/v1/` paths.

## Auth

JWT stored in `localStorage` under `nuru.session`. The API client at
`src/lib/api.ts` adds the `Authorization: Bearer …` header automatically
for protected requests.
