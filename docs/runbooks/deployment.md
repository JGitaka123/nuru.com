# Deployment Runbook

End-to-end deploy procedure for Nuru Homes. Run alongside
[`vendor-setup.md`](./vendor-setup.md) — that doc covers the one-time
account/credential setup; this doc covers the recurring deploy steps.

## Prerequisites

- All vendor accounts configured (see `vendor-setup.md`).
- Production secrets in `/etc/nuru/api.env` and `/etc/nuru/web.env` on the
  Contabo VPS.
- Local clone of the repo with the target commit.

## First-time deploy

1. **Provision DB** (if not already)
   ```bash
   # Connect to the prod DB with psql.
   psql "$DATABASE_URL"
   \i scripts/init-extensions.sql
   \q
   ```

2. **Confirm migrations are present**
   The initial migration is checked in under `prisma/migrations/`. Do not
   generate migrations during production deploys.

3. **Run migrations against prod**
   Use the manual **Deploy Database** GitHub Actions workflow. It supplies
   `DATABASE_URL` with the Neon pooled URL and `DIRECT_URL` with the Neon
   direct URL, then runs `pnpm db:deploy`.

3. **Seed reference data** (one-time)
   ```bash
   pnpm db:seed
   ```
   Creates the canonical neighborhood list and a synthetic admin account.

4. **Deploy API, workers, and web on Contabo**
   SSH to the VPS and run:
   ```bash
   cd /opt/nuru/app
   sudo scripts/deploy-contabo.sh
   ```
   The script fetches `origin/main`, builds as the `nuru` service user,
   restores `/opt/nuru/app` ownership, restarts `nuru-api`, `nuru-workers`,
   and `nuru-web`, then checks:
   - `https://api.nuruhomes.com/health`
   - `https://nuruhomes.com/login`

5. **Smoke-test** (see `vendor-setup.md` §15).

## Recurring deploys

Standard flow:

```bash
git pull origin main
git checkout -b deploy/2026-05-02
# ... make changes ...
pnpm test                  # all green
pnpm typecheck             # api
cd web && pnpm typecheck   # web
git commit -m "feat: ..."
git push -u origin deploy/2026-05-02
gh pr create
# ... review, merge ...
```

After merging to `main`, deploy on Contabo:

```bash
ssh root@161.97.172.192
cd /opt/nuru/app
sudo scripts/deploy-contabo.sh
```

## Rolling back

### API / workers / web (Contabo)
Check out the last known-good merge commit and rerun the Contabo deploy
script:

```bash
cd /opt/nuru/app
git checkout main
git reset --hard <known-good-sha>
sudo scripts/deploy-contabo.sh
```

Do not roll back the database; migrations are forward-only.

### Database
- Migrations are **forward-only**. Roll back with a new "down" migration:
  ```bash
  pnpm prisma migrate dev --name rollback_<thing>
  ```
- Never run `prisma migrate reset` against production — it drops data.

## Secrets rotation

| Secret | Rotation cadence | How |
|---|---|---|
| `JWT_SECRET` | Quarterly | Generate new, set as `JWT_SECRET`, keep old in `JWT_SECRET_PREVIOUS` for 30 days |
| `ANTHROPIC_API_KEY` | If leaked | Anthropic console → Revoke, generate new |
| `MPESA_*` | If leaked | Daraja portal → Reset; rotate B2C credential |
| `R2_*` | Quarterly | Cloudflare → R2 → Tokens → Rotate |
| `AT_API_KEY` | If leaked | AT dashboard → API Keys → Regenerate |
| `WHATSAPP_ACCESS_TOKEN` | If permanent token leaks, regenerate via Meta Business |

## Monitoring

- **Sentry**: errors. PagerDuty integration for severity ≥ "error".
- **systemd journals**: `journalctl -u nuru-api -u nuru-workers -u nuru-web`.
- **AI cost**: `recordAiCost` events in logs; aggregate in Grafana
  (`Nuru → AI Costs`).
- **Daraja webhook delivery**: any non-200 from our endpoint causes Daraja
  to retry. If retries pile up, check `EscrowEvent` table for the unparsed
  payloads.
- **Worker queue depth**: watch BullMQ via `bullmq-board` (admin UI, set up
  later).

## Common deploy issues

| Symptom | Cause | Fix |
|---|---|---|
| 502 on `/health` | API process died on boot | Check `journalctl -u nuru-api`; usually missing env var |
| Migrations hang | Pooled URL used | Switch to `DIRECT_URL` |
| OTP requests succeed but no SMS | `AT_SENDER_ID=NURU` but not approved | Either wait for approval or unset to use sandbox |
| STK push 401 | Daraja access token expired | We refresh 5 min early — if persistent, rotate consumer key |
| B2C "Initiator information is invalid" | Security credential generated against wrong env's cert | Regenerate against the matching env's cert |
| Workers not picking up jobs | Wrong `REDIS_URL` or queue name mismatch | Check `src/workers/queues.ts` matches API |
| Photos 403 from R2 | Bucket not public OR custom domain not connected | R2 → Bucket → Public access; verify `photos.nuruhomes.com` resolves |

## Daraja sandbox quirks

- **Flaky after 6pm EAT.** Run integration tests in the morning.
- The default sandbox shortcode `174379` only accepts amounts ≥ 1 KES.
- Sandbox callbacks come from a different IP range than prod — make sure
  your WAF doesn't block them.

## Africa's Talking quirks

- Sandbox messages reach real numbers in Kenya — be careful with test data.
- Sender ID approval is country-specific. "NURU" approved in KE doesn't
  cover TZ/UG.

## Downtime windows

- **Daraja maintenance**: usually Saturdays 22:00-02:00 EAT. Watch
  <https://developer.safaricom.co.ke/> for advisories.
- **Africa's Talking maintenance**: announced via dashboard.
- **Schedule our own deploys** outside Friday 17:00–Monday 06:00 EAT to
  avoid weekend incidents with no team on-call.
