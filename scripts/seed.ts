/**
 * Seed the database with reference data + a few synthetic listings for
 * local development.
 *
 * Run: pnpm db:seed
 *
 * Idempotent — re-running won't duplicate rows. Uses cuid() for IDs so each
 * run creates fresh seeded entities; pre-existing entities are matched by
 * unique fields (phone, KRA PIN).
 */

import { PrismaClient } from "@prisma/client";
import { seedPlans } from "../src/services/plans";
import { canonicalCounty, countyForArea } from "../src/lib/locations";

const prisma = new PrismaClient();

// Approximate city/estate centroids (lat, lng) for the seeded markets. Nairobi
// estates plus the main up-country and coastal towns we list in.
const CENTROIDS: Record<string, [number, number]> = {
  // Nairobi
  Kilimani: [-1.2912, 36.7834],
  Westlands: [-1.267, 36.8074],
  Kileleshwa: [-1.272, 36.7876],
  Lavington: [-1.2768, 36.7651],
  Parklands: [-1.263, 36.8186],
  Karen: [-1.3197, 36.7068],
  // Mombasa
  Nyali: [-4.043, 39.7],
  Bamburi: [-3.996, 39.72],
  // Kisumu
  Milimani: [-0.0917, 34.768],
  Mamboleo: [-0.05, 34.79],
  // Nakuru
  "Section 58": [-0.305, 36.08],
  Naivasha: [-0.7167, 36.431],
  // Uasin Gishu (Eldoret)
  "Elgon View": [0.51, 35.28],
  Kapsoya: [0.53, 35.31],
  // Kiambu
  Ruiru: [-1.145, 37.011],
  Thika: [-1.033, 37.069],
};

async function main() {
  console.log("Seeding…");
  await seedPlans();
  console.log("  plan registry: seeded");

  // 1. Admin user.
  const admin = await prisma.user.upsert({
    where: { phoneE164: "+254700000001" },
    create: {
      phoneE164: "+254700000001",
      role: "ADMIN",
      name: "Nuru Admin",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
    },
    update: {},
  });
  console.log(`  admin: ${admin.id}`);

  // 2. A demo agent.
  const agent = await prisma.user.upsert({
    where: { phoneE164: "+254712000001" },
    create: {
      phoneE164: "+254712000001",
      role: "AGENT",
      name: "Wanjiru Kimani",
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      kraPin: "A123456789Z",
      agentProfile: {
        create: {
          agencyName: "Acacia Realty",
          trustScore: 78,
          ratingAvg: 4.6,
          ratingCount: 23,
          subscriptionTier: "pro",
        },
      },
    },
    update: {},
  });
  console.log(`  agent: ${agent.id}`);

  // 3. A demo tenant.
  const tenant = await prisma.user.upsert({
    where: { phoneE164: "+254722000001" },
    create: {
      phoneE164: "+254722000001",
      role: "TENANT",
      name: "Brian Otieno",
      preferredLang: "en",
    },
    update: {},
  });
  console.log(`  tenant: ${tenant.id}`);

  // 4. Demo rental listings — national coverage. County towns run meaningfully
  // cheaper than prime Nairobi, so rents are per-market. `county` is set
  // explicitly (some area names like "Milimani" exist in several counties and
  // wouldn't auto-map correctly); we still canonicalise through the registry.
  const RENTALS: Array<{
    neighborhood: string;
    county: string;
    bedrooms: number;
    rentKes: number;
  }> = [
    // Nairobi
    { neighborhood: "Kilimani", county: "Nairobi", bedrooms: 2, rentKes: 78_000 },
    { neighborhood: "Westlands", county: "Nairobi", bedrooms: 1, rentKes: 55_000 },
    { neighborhood: "Kileleshwa", county: "Nairobi", bedrooms: 3, rentKes: 115_000 },
    // Mombasa
    { neighborhood: "Nyali", county: "Mombasa", bedrooms: 2, rentKes: 60_000 },
    { neighborhood: "Bamburi", county: "Mombasa", bedrooms: 3, rentKes: 48_000 },
    // Kisumu
    { neighborhood: "Milimani", county: "Kisumu", bedrooms: 2, rentKes: 38_000 },
    { neighborhood: "Mamboleo", county: "Kisumu", bedrooms: 1, rentKes: 22_000 },
    // Nakuru
    { neighborhood: "Section 58", county: "Nakuru", bedrooms: 2, rentKes: 35_000 },
    { neighborhood: "Naivasha", county: "Nakuru", bedrooms: 3, rentKes: 42_000 },
    // Uasin Gishu (Eldoret)
    { neighborhood: "Elgon View", county: "Uasin Gishu", bedrooms: 2, rentKes: 40_000 },
    { neighborhood: "Kapsoya", county: "Uasin Gishu", bedrooms: 1, rentKes: 20_000 },
    // Kiambu
    { neighborhood: "Ruiru", county: "Kiambu", bedrooms: 2, rentKes: 32_000 },
    { neighborhood: "Thika", county: "Kiambu", bedrooms: 3, rentKes: 45_000 },
  ];
  for (let i = 0; i < RENTALS.length; i++) {
    const r = RENTALS[i];
    const bedrooms = r.bedrooms;
    const county = canonicalCounty(r.county) ?? countyForArea(r.neighborhood);
    const listing = await prisma.listing.create({
      data: {
        agentId: agent.id,
        title: `${bedrooms}BR ${r.neighborhood} apartment`,
        description: `A ${bedrooms} bedroom apartment in ${r.neighborhood}, ${r.county}. Modern fittings, secure parking, backup water. Close to shops, schools and public transport. Suitable for professionals or small families.`,
        category: bedrooms === 1 ? "ONE_BR" : bedrooms === 2 ? "TWO_BR" : "THREE_BR",
        bedrooms,
        bathrooms: Math.max(1, bedrooms - 1),
        rentKesCents: r.rentKes * 100,
        depositMonths: 2,
        features: ["parking", "backup_generator", "borehole", "cctv"],
        neighborhood: r.neighborhood,
        county,
        photoKeys: [`listings/${agent.id}/seed-${i}.jpg`],
        primaryPhotoKey: `listings/${agent.id}/seed-${i}.jpg`,
        status: "ACTIVE",
        publishedAt: new Date(),
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        fraudScore: 5 + (i % 6),
        aiQualityScore: 0.7 + (i % 6) * 0.04,
      },
    });
    // Coordinates via raw SQL — location is Unsupported() in Prisma.
    const [lat, lng] = CENTROIDS[r.neighborhood] ?? [-1.286, 36.819];
    await prisma.$executeRaw`
      UPDATE "Listing"
      SET location = ST_SetSRID(ST_MakePoint(${lng + (i % 3) * 0.002}, ${lat + (i % 2) * 0.002}), 4326)::geography
      WHERE id = ${listing.id}`;
  }
  console.log(`  ${RENTALS.length} demo rental listings created`);

  // 5. A few for-sale listings — spread across cities, priced to market
  // (a Nairobi apartment/townhouse runs far above an up-country bungalow).
  const SALES = [
    { neighborhood: "Lavington", county: "Nairobi", bedrooms: 4, category: "FOUR_PLUS_BR" as const, priceKes: 42_000_000, title: "4BR Lavington townhouse for sale" },
    { neighborhood: "Nyali", county: "Mombasa", bedrooms: 4, category: "FOUR_PLUS_BR" as const, priceKes: 34_000_000, title: "4BR Nyali beachside villa for sale" },
    { neighborhood: "Section 58", county: "Nakuru", bedrooms: 3, category: "THREE_BR" as const, priceKes: 9_500_000, title: "3BR Nakuru Section 58 bungalow for sale" },
    { neighborhood: "Elgon View", county: "Uasin Gishu", bedrooms: 4, category: "FOUR_PLUS_BR" as const, priceKes: 11_500_000, title: "4BR Eldoret Elgon View maisonette for sale" },
    { neighborhood: "Thika", county: "Kiambu", bedrooms: 3, category: "THREE_BR" as const, priceKes: 8_500_000, title: "3BR Thika apartment for sale" },
  ];
  for (let i = 0; i < SALES.length; i++) {
    const s = SALES[i];
    const county = canonicalCounty(s.county) ?? countyForArea(s.neighborhood);
    const listing = await prisma.listing.create({
      data: {
        agentId: agent.id,
        title: s.title,
        description: `A ${s.bedrooms} bedroom home for sale in ${s.neighborhood}, ${s.county}. Freehold title, mature garden, ample parking, borehole and backup power. Close to schools and shopping. Serious buyers only — contact the agent to arrange a viewing.`,
        category: s.category,
        listingType: "SALE",
        bedrooms: s.bedrooms,
        bathrooms: Math.max(2, s.bedrooms - 1),
        rentKesCents: 0,
        salePriceKes: s.priceKes,
        depositMonths: 0,
        features: ["parking", "backup_generator", "borehole", "garden", "dsq"],
        neighborhood: s.neighborhood,
        county,
        photoKeys: [`listings/${agent.id}/sale-${i}.jpg`],
        primaryPhotoKey: `listings/${agent.id}/sale-${i}.jpg`,
        status: "ACTIVE",
        publishedAt: new Date(),
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        fraudScore: 4 + i,
        aiQualityScore: 0.8,
      },
    });
    const [lat, lng] = CENTROIDS[s.neighborhood] ?? [-1.3197, 36.7068];
    await prisma.$executeRaw`
      UPDATE "Listing"
      SET location = ST_SetSRID(ST_MakePoint(${lng + i * 0.003}, ${lat + i * 0.003}), 4326)::geography
      WHERE id = ${listing.id}`;
  }
  console.log(`  ${SALES.length} for-sale listings created`);

  console.log("Done.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
