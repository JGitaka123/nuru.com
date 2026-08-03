-- County-level market bands + persisted AI enrichment feedback.

-- 1. Market segments gain a scope so county-level bands can act as a national
--    fallback when a neighborhood has too little supply for its own band.
CREATE TYPE "MarketScope" AS ENUM ('NEIGHBORHOOD', 'COUNTY');

ALTER TABLE "MarketStat" ADD COLUMN "scope" "MarketScope" NOT NULL DEFAULT 'NEIGHBORHOOD';
ALTER TABLE "MarketStat" ADD COLUMN "county" TEXT;

-- Re-key on scope so a county band and a same-named neighborhood band coexist.
ALTER TABLE "MarketStat" DROP CONSTRAINT IF EXISTS "MarketStat_observedDate_neighborhood_category_bedrooms_key";
DROP INDEX IF EXISTS "MarketStat_observedDate_neighborhood_category_bedrooms_key";
CREATE UNIQUE INDEX "MarketStat_observedDate_scope_neighborhood_category_bedroom_key"
  ON "MarketStat" ("observedDate", "scope", "neighborhood", "category", "bedrooms");

CREATE INDEX "MarketStat_scope_county_category_bedrooms_observedDate_idx"
  ON "MarketStat" ("scope", "county", "category", "bedrooms", "observedDate");

-- 2. Persist the vision pass's actionable feedback so agents can act on it.
ALTER TABLE "Listing" ADD COLUMN "aiQualityIssues" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Listing" ADD COLUMN "aiMissingPhotos" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Listing" ADD COLUMN "aiPricingNotes" TEXT;
ALTER TABLE "Listing" ADD COLUMN "aiEnrichedAt" TIMESTAMP(3);
