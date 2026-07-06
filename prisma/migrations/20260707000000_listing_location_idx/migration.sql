-- Spatial index for per-listing coordinates (map view, future geo search).
CREATE INDEX IF NOT EXISTS "Listing_location_idx" ON "Listing" USING GIST (location);
