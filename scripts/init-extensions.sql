-- Run once when the database is created.
-- Prisma needs these extensions before migrations run.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- fuzzy text matching for typos
