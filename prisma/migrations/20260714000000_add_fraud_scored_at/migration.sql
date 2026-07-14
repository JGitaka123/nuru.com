-- Track last fraud rescore so the nightly cron rotates coverage.
ALTER TABLE "Listing" ADD COLUMN "fraudScoredAt" TIMESTAMP(3);
