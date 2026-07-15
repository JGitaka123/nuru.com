-- National location awareness: group listings by county.
-- Nullable + backfilled from application code, so this is safe on existing rows.
ALTER TABLE "Listing" ADD COLUMN "county" TEXT;

-- Browse/filter by county within active listings.
CREATE INDEX "Listing_status_county_idx" ON "Listing" ("status", "county");
