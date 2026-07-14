-- Property sales: rental vs for-sale listings.
CREATE TYPE "ListingType" AS ENUM ('RENT', 'SALE');
ALTER TABLE "Listing" ADD COLUMN "listingType" "ListingType" NOT NULL DEFAULT 'RENT';
ALTER TABLE "Listing" ADD COLUMN "salePriceKes" INTEGER;
