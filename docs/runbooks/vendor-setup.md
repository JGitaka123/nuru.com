# Vendor Setup — Deployment Checklist

This runbook lists every external account, credential, and configuration step
the developer needs to complete before going live. Most items have lead times
(approvals, DNS propagation), so start them in parallel as early as possible.

> All `<UPPERCASE_LIKE_THIS>` placeholders in `.env.example` are populated
> from the steps below. Production secrets live in your hosting provider's
> secrets manager — never in git.

---

## 1. Anthropic (Claude API) — required, 5 min

- Sign up at <https://console.anthropic.com>
- Add a payment method (workspace billing).
- **Create an API key**: Settings → API keys → Create. Scope: production only.
- Set spend limit alerts: $50, $200, $1000 (matches MVP/Growth thresholds in
  `scripts/cost-model.ts`).
- Set env: `ANTHROPIC_API_KEY=sk-ant-...`
- Verify: `curl -X POST -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" https://api.anthropic.com/v1/messages -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"messages":[{"role":"user","content":"hi"}]}'`

---

## 2. Safaricom Daraja (M-Pesa) — required, ~3 weeks for production

### Sandbox (do this first — same day)
- Sign up at <https://developer.safaricom.co.ke/>
- Create an app → enable "Lipa Na M-Pesa Online" + "B2C"
- Copy **Consumer Key** and **Consumer Secret**.
- Set env:
  ```
  MPESA_ENV=sandbox
  MPESA_CONSUMER_KEY=...
  MPESA_CONSUMER_SECRET=...
  MPESA_SHORTCODE=174379          # default sandbox till
  MPESA_PASSKEY=<from sandbox app config>
  MPESA_CALLBACK_URL=https://<ngrok|prod-domain>/v1/webhooks/mpesa
  ```
- B2C sandbox initiator: `testapi`. Set `MPESA_B2C_INITIATOR=testapi` and
  generate the security credential per
  <https://developer.safaricom.co.ke/Documentation> (PEM key + 'Safaricom123!').
- **Sandbox is flaky after 6pm EAT**; schedule integration tests in the morning.

### Production (3+ weeks lead time)
1. Apply for **Paybill** or **Till Number** with Safaricom directly.
2. Apply for **B2C Production Access**:
   - Submit business KYC (CR12, KRA PIN, director IDs).
   - Sign Safaricom MOU.
   - Wait for approval (10-21 days).
3. Once approved, generate a **production security credential**:
   - Encrypt the initiator password with Safaricom's prod cert.
   - See `infra/scripts/generate-b2c-credential.sh` (TODO).
4. Whitelist callback URLs with Safaricom (not self-service):
   - `https://api.nuru.com/v1/webhooks/mpesa`
   - `https://api.nuru.com/v1/webhooks/mpesa/b2c-result`
   - `https://api.nuru.com/v1/webhooks/mpesa/b2c-timeout`
5. Switch `MPESA_ENV=production` and rotate keys.
6. **Do a 1 KES end-to-end test** with a real number before launching.

> Daraja callbacks may arrive 0, 1, or N times. Idempotency is enforced by
> our handlers via `MerchantRequestID` (STK) and `OriginatorConversationID`
> (B2C). Do not change this.

---

## 3. Africa's Talking (SMS) — required, ~3 days for sender ID

### Sandbox (same day)
- Sign up at <https://account.africastalking.com>
- Note your sandbox API key + username (`sandbox`).
- Set env:
  ```
  AT_USERNAME=sandbox
  AT_API_KEY=...
  AT_SENDER_ID=        # leave blank in sandbox
  ```
- Sandbox sends from a generic alphanumeric ID; messages reach real numbers.

### Production
1. Top up live account credit (~5,000 KES gets you started).
2. **Apply for sender ID "NURU"**:
   - Dashboard → SMS → Sender IDs → Apply.
   - Justification: "Rental marketplace SMS notifications + OTP."
   - Approval takes ~3 business days. Each subsequent country adds days.
3. Once approved, set `AT_USERNAME=<your-live-username>`,
   `AT_API_KEY=<live-key>`, `AT_SENDER_ID=NURU`.
4. **Pre-register OTP message templates** if you want to bypass spam filters
   on the bulk SMS gateway. Template:
   `Nuru: Your verification code is {code}. Expires in 10 minutes. Never share this code.`

---

## 4. Cloudflare R2 (storage) — required, 30 min

1. Sign up at <https://dash.cloudflare.com> (free tier is fine to start).
2. **Enable R2** (no egress fees — that's why we use it).
3. Create a bucket: `nuru-photos` (public for listing photos)
   and `nuru-private` (private for IDs, leases, voice notes).
4. Generate an **API token** (R2 → Manage R2 API Tokens):
   - Permissions: Object Read & Write
   - Specify bucket: `nuru-photos`, `nuru-private`
   - Copy `Access Key ID`, `Secret Access Key`, `Account ID`.
5. **Custom domain** for the public bucket:
   - R2 → Bucket → Settings → Connect custom domain
   - Use `photos.nuru.com` (matches `R2_PUBLIC_URL` default).
   - DNS auto-configures if your zone is on Cloudflare.
6. Enable **R2 Image Resizing** (separate sub-product, ~$0.50 / 1k requests).
7. Set env:
   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=nuru-photos
   R2_PUBLIC_URL=https://photos.nuru.com
   ```
8. Verify: `curl -X PUT -H "Authorization: Bearer $TOKEN" https://<account-id>.r2.cloudflarestorage.com/nuru-photos/test.txt --data-binary "hello"`

---

## 5. WhatsApp Business API (Meta) — recommended, ~1-2 weeks

> Required only when you turn on the WhatsApp inbound autoreply feature.
> The code at `src/services/whatsapp.ts` no-ops gracefully without these envs.

1. **Verify your Meta Business** account at <https://business.facebook.com>.
   - Upload CR12, KRA PIN cert, proof of address. Approval: 1-3 days.
2. Add WhatsApp Business product → register a **dedicated phone number**
   (cannot be reused with the WhatsApp consumer app).
3. Approve your **display name**: "Nuru" or "Nuru Real Estate". 1-3 days.
4. Generate a **permanent access token** (System User → Generate token,
   never expiring). Scope: `whatsapp_business_messaging`,
   `whatsapp_business_management`.
5. **Subscribe webhook**:
   - URL: `https://api.nuru.com/v1/webhooks/whatsapp`
   - Verify token: any random string; set `WHATSAPP_VERIFY_TOKEN=...` to match.
   - Subscribe to `messages` field.
6. Pre-approve **message templates** (utility templates only, no marketing):
   - `viewing_reminder`: "Hi {{1}}, reminder: viewing for {{2}} tomorrow at {{3}} EAT."
   - `escrow_held`: "Your KES {{1}} deposit is held safely. Confirm move-in to release."
   - `escrow_released`: "KES {{1}} has been sent to your M-Pesa. Receipt: {{2}}."
   - Approval: 24h typical.
7. Set env:
   ```
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_BUSINESS_ID=...
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_VERIFY_TOKEN=<random-string>
   WHATSAPP_APP_SECRET=...      # for inbound signature verification
   ```

---

## 6. Resend (email) — required for marketing engine, 30 min + DNS warm-up

1. Sign up at <https://resend.com>.
2. Add domain `nuru.com`. Add the SPF + DKIM DNS records they show you
   (Cloudflare can do this in 2 min).
3. Verify the domain.
4. Generate API key. Set `RESEND_API_KEY=re_...`.
5. Set `EMAIL_FROM="Nuru <noreply@nuru.com>"` and `EMAIL_REPLY_TO=hello@nuru.com`.
6. Configure DMARC to `quarantine` (TXT record `_dmarc.nuru.com` →
   `v=DMARC1; p=quarantine; rua=mailto:dmarc@nuru.com`).
7. **Webhook**: Resend dashboard → Webhooks → Add endpoint
   `https://api.nuru.com/v1/webhooks/resend`. Subscribe to: `email.delivered`,
   `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
8. **Warm-up the domain** before running campaigns at scale: send 30-50
   transactional emails/day for the first week (OTP, viewing reminders).
   Skip directly to bulk marketing → expect spam-folder placement.
9. Marketing compliance — add the **physical address** the footer mentions
   (currently "Westlands, Nairobi") to your Resend account profile.

---

## 7. Sentry (error monitoring) — recommended, 15 min

1. Sign up at <https://sentry.io>.
2. Create projects: `nuru-api` (Node), `nuru-web` (Next.js), `nuru-workers` (Node).
3. Copy the DSN for each. Set:
   ```
   SENTRY_DSN=                 # api
   NEXT_PUBLIC_SENTRY_DSN=     # web (in web/.env)
   ```
4. Install `@sentry/node` (api/workers) and `@sentry/nextjs` (web) — see
   `infra/scripts/init-sentry.sh` (TODO).

---

## 8. Database — Postgres 16 with extensions

### Recommended: Supabase
1. Create a project at <https://supabase.com> (Pro tier $25/mo for the connection
   pool and the larger storage).
2. Region: **eu-west-1** or **eu-central-1** (closest to Kenya with low latency).
3. **Enable extensions** in SQL editor:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS vector;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
4. Copy the connection string. Use the **pooler** URL for the API
   (`?pgbouncer=true&connection_limit=1`) and the direct URL for migrations.
5. Set env:
   ```
   DATABASE_URL=postgresql://...?pgbouncer=true&connection_limit=1
   DIRECT_URL=postgresql://...   # for prisma migrate
   ```
6. Run migrations: `pnpm db:deploy`

### Alternative: Self-hosted Postgres on Hetzner
- Same steps, but you manage backups, upgrades, replicas.

---

## 9. Upstash Redis — required for queues, 5 min

1. Sign up at <https://upstash.com>.
2. Create a Redis database. **Region**: same continent as DB.
3. Copy the TLS connection URL: `rediss://default:<password>@<host>:<port>`.
4. Set `REDIS_URL=rediss://...`.

---

## 10. Self-hosted GPU (inference) — required for embeddings, ~30 min

> Runs `bge-m3` (embeddings), `bge-reranker-v2-m3` (reranker), and
> `faster-whisper-large-v3` (voice). See `infra/inference/docker-compose.yml`.

### Hetzner GEX44 (recommended, ~$200-400/mo)
1. Order a GPU instance (RTX 4000 Ada or L4) at <https://www.hetzner.com>.
2. Install Docker + nvidia-container-toolkit (Ubuntu 22.04):
   ```bash
   curl -fsSL https://get.docker.com | sh
   distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
   curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list \
     | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
   apt update && apt install -y nvidia-container-toolkit
   systemctl restart docker
   ```
3. Clone the repo, `cd infra/inference`, `docker compose up -d`.
4. Health check: `curl http://localhost:8001/health`
5. Expose to the API service via private network or a Cloudflare Tunnel:
   - `EMBEDDING_URL=https://embed.internal.nuru.com`
   - `RERANKER_URL=https://rerank.internal.nuru.com`
   - `WHISPER_URL=https://whisper.internal.nuru.com`

### Alternative: Lambda Labs / RunPod
- Same docker-compose, different host. Slightly cheaper if you can tolerate
  occasional preemption (we have no SLA for these — workers retry).

---

## 11. Hosting — API, workers, web

### Recommended setup:
- **API + workers**: Railway (or Fly.io) — long-running Node containers.
- **Web**: Vercel — Next.js native deploy.
- **DNS + WAF**: Cloudflare.

### Vercel (web)
1. Connect the GitHub repo at <https://vercel.com>.
2. Set root: `web/`. Framework: Next.js.
3. Set env: `NEXT_PUBLIC_API_URL=https://api.nuru.com`,
   `NEXT_PUBLIC_PHOTO_URL=https://photos.nuru.com`,
   `NEXT_PUBLIC_SENTRY_DSN=...`.
4. Domain: `nuru.com` and `www.nuru.com` → Vercel project.

### Railway (api + workers)
1. New project from the repo at <https://railway.app>.
2. Service 1: API.
   - Root: `/`. Build: `pnpm install && pnpm build`. Start: `pnpm start`.
   - Domain: `api.nuru.com`.
   - Set all API env vars.
3. Service 2: Workers.
   - Same build. Start: `pnpm start:workers`.
   - **No public port** — workers are internal.
   - Same env vars (workers also need MPESA_B2C_*).
4. Database connection from Railway: use the pooler URL above.

### Cloudflare DNS
- `nuru.com` → Vercel
- `www.nuru.com` → Vercel
- `api.nuru.com` → Railway (proxied through Cloudflare for WAF + rate limits)
- `photos.nuru.com` → Cloudflare R2 custom domain
- `*.internal.nuru.com` → Cloudflare Tunnel to GPU box

---

## 12. Web Push (PWA notifications) — recommended, 10 min

1. Generate **VAPID keys** locally:
   ```bash
   pnpm tsx scripts/generate-vapid.ts
   ```
2. Set env:
   ```
   VAPID_PUBLIC_KEY=...
   VAPID_PRIVATE_KEY=...
   VAPID_SUBJECT=mailto:ops@nuru.com
   ```
3. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in `web/.env` (matches the public key).
4. Subscriptions are stored in `PushSubscription` (Prisma) — check the
   migration is applied: `pnpm db:deploy`.
5. Test from a real Android device (iOS Safari supports Web Push as of 16.4).

---

## 13. JWT secret — required, 10 sec

```bash
openssl rand -base64 48
```
Set `JWT_SECRET=` to the output. **Rotate quarterly**; keep the previous key
in `JWT_SECRET_PREVIOUS` for 30 days to allow in-flight sessions to verify.
(`src/lib/auth.ts` reads only the current key today — extend if needed when
you rotate.)

---

## 14. PII / Compliance

- Kenya's **Data Protection Act 2019** applies. Register as a data controller
  with the **ODPC** (Office of the Data Protection Commissioner):
  <https://www.odpc.go.ke>. Approval takes ~30 days.
- Display the **registration number** in the website footer once issued.
- Update the privacy policy at `web/src/app/privacy/page.tsx` (TODO) with
  your ODPC reference.

---

## 15. Pre-launch verification checklist

Once everything above is configured, run through:

- [ ] Health endpoint returns 200: `curl https://api.nuru.com/health`
- [ ] OTP flow works end-to-end with a real number
- [ ] Photo upload → R2 → public URL is reachable
- [ ] Listing creator triggers AI enrichment within 60s
- [ ] Search returns results in <2s
- [ ] STK push succeeds with 1 KES on a live number
- [ ] B2C release succeeds with 1 KES return
- [ ] SMS reaches a real Kenyan number with sender ID "NURU"
- [ ] WhatsApp template message sends
- [ ] PWA installs on Android
- [ ] Sentry captures a test error
- [ ] Cost dashboard shows AI spend matching `scripts/cost-model.ts` projections

If any check fails, do not launch. Fix first.
