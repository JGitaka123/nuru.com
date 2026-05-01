# Incident Runbook

When something breaks. Page on Sentry "error" severity → on-call gets
notified → follow this.

## Severity guide

| Sev | Definition | Response |
|---|---|---|
| SEV1 | Auth, payments, or core search broken for >5 min | Page everyone, status page red |
| SEV2 | Single feature broken (listings, viewings, etc.) | Page on-call, status page yellow |
| SEV3 | Degraded performance, AI errors, slow responses | Slack alert, fix in business hours |

## SEV1: Payments down (Daraja)

Symptoms: STK push returns errors, callbacks not arriving, OTP works but
deposits fail.

1. Check <https://developer.safaricom.co.ke/> for outage notice.
2. If sandbox: just wait, do not page Safaricom.
3. If prod:
   - Check `EscrowEvent` rows for the last 30 minutes.
   - If 0 rows but users are trying → callbacks blocked. Check WAF logs.
   - If many rows with `resultCode != 0` → Daraja is failing on their side.
4. Set `MAINTENANCE_MODE=payments` env var (handler degrades gracefully —
   not yet implemented; future: TODO).
5. Update status page.
6. Post in #incidents Slack.

## SEV1: Auth broken

Symptoms: OTP request returns 500, JWT verify fails for everyone.

1. Check `JWT_SECRET` is set in API env.
2. Check Africa's Talking dashboard for SMS delivery rate.
3. If AT is healthy and OTPs not arriving, check rate-limit buckets aren't
   stuck (restart API process resets in-memory buckets).
4. If JWT verify fails system-wide: did someone rotate `JWT_SECRET` without
   setting `JWT_SECRET_PREVIOUS`? Roll back the deploy.

## SEV2: Listings unreachable

1. Check `/v1/listings/<id>` returns 200.
2. Check Postgres connection pool isn't exhausted (Supabase dashboard).
3. Check pgvector extension is loaded:
   `SELECT * FROM pg_extension WHERE extname='vector';`

## SEV2: AI calls failing

Symptoms: listing enrichment worker erroring, search parser returning errors.

1. Check Anthropic status: <https://status.anthropic.com>.
2. Check `recordAiCost` logs — sudden cost spike could mean a runaway loop.
3. Check the `escalate: true` flag isn't being incorrectly set somewhere
   (Opus is 5x Sonnet cost).
4. If a specific prompt is failing eval, roll back the prompt change.

## SEV3: GPU box down

Symptoms: search 500s on `embed` or `rerank` calls, voice transcription fails.

1. SSH to GPU host. `docker ps` — restart any stopped containers.
2. `docker logs embeddings -f` — look for OOM or model load errors.
3. If host itself is down, fall back to keyword search:
   - Set `INFERENCE_FALLBACK=keyword` env on the API.
   - Search degrades to plain Postgres + pg_trgm fuzzy match.
   - Reranker just preserves order. Voice features disabled.
4. Restore GPU host, unset the env, full vector search resumes.

## Daraja callback storm

Daraja sometimes retries callbacks aggressively (5-10x). Our handler is
idempotent so this is *fine*, but it can spike DB load.

1. `EscrowEvent` rows pile up — that's expected.
2. If DB CPU >80%, add a Redis-backed dedup layer in front of the handler
   (TODO: not yet implemented).

## Lost B2C release

Symptoms: tenant confirmed move-in, escrow status still HELD after 1 hour.

1. Check `b2cConversationId` in `Escrow` row — is it set?
2. If set but no `b2c_result` event in `EscrowEvent`:
   - Daraja's result webhook didn't reach us.
   - Manually query Daraja: `pnpm tsx scripts/query-b2c.ts <conversationId>`
     (TODO: write this script).
3. If query confirms success → manually flip the escrow status:
   ```sql
   UPDATE "Escrow" SET status = 'RELEASED', released_at = NOW() WHERE id = '...';
   ```
4. Insert a manual `EscrowEvent` row for audit:
   ```sql
   INSERT INTO "EscrowEvent" (id, escrow_id, type, payload, created_at)
   VALUES (gen_random_uuid(), '<escrow-id>', 'manual_release',
           '{"reason":"daraja webhook lost","by":"<your-name>"}', NOW());
   ```
5. SMS the landlord manually.

## Postmortem template

Within 48h of any SEV1/SEV2:

```markdown
# Incident: <one-line summary>

**Date**: YYYY-MM-DD
**Duration**: HH:MM - HH:MM EAT (NN minutes)
**Severity**: SEV1/2/3
**Author**: <your-name>

## What happened
<2-3 sentences>

## Impact
<X users affected, $Y in lost revenue, etc.>

## Timeline
- HH:MM First alert
- HH:MM Discovered root cause
- HH:MM Mitigation applied
- HH:MM Resolved

## Root cause
<technical explanation>

## What went well
- ...

## What didn't
- ...

## Action items
- [ ] @owner: <fix> by YYYY-MM-DD
- [ ] @owner: <prevent> by YYYY-MM-DD
```

Save to `docs/postmortems/YYYY-MM-DD-<slug>.md`.
