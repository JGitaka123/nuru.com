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

const prisma = new PrismaClient();

const NEIGHBORHOODS = [
  "Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands",
];

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

  // 4. A few demo listings.
  const CENTROIDS: Record<string, [number, number]> = {
    Kilimani: [-1.2912, 36.7834],
    Westlands: [-1.267, 36.8074],
    Kileleshwa: [-1.272, 36.7876],
    Lavington: [-1.2768, 36.7651],
    Parklands: [-1.263, 36.8186],
  };
  for (let i = 0; i < 6; i++) {
    const neighborhood = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
    const bedrooms = (i % 3) + 1;
    const rentKes = 35_000 + i * 8_500 + bedrooms * 12_000;
    const listing = await prisma.listing.create({
      data: {
        agentId: agent.id,
        title: `${bedrooms}BR ${neighborhood} apartment`,
        description: `A ${bedrooms} bedroom apartment in ${neighborhood}. Modern fittings, secure parking, backup water. Close to Yaya Centre and Junction Mall. Walking distance to public transport. Suitable for professionals or small families.`,
        category: bedrooms === 1 ? "ONE_BR" : bedrooms === 2 ? "TWO_BR" : "THREE_BR",
        bedrooms,
        bathrooms: Math.max(1, bedrooms - 1),
        rentKesCents: rentKes * 100,
        depositMonths: 2,
        features: ["parking", "backup_generator", "borehole", "cctv"],
        neighborhood,
        photoKeys: [`listings/${agent.id}/seed-${i}.jpg`],
        primaryPhotoKey: `listings/${agent.id}/seed-${i}.jpg`,
        status: "ACTIVE",
        publishedAt: new Date(),
        verificationStatus: "VERIFIED",
        verifiedAt: new Date(),
        fraudScore: 5 + i,
        aiQualityScore: 0.7 + i * 0.04,
      },
    });
    // Coordinates via raw SQL — location is Unsupported() in Prisma.
    const [lat, lng] = CENTROIDS[neighborhood] ?? [-1.286, 36.819];
    await prisma.$executeRaw`
      UPDATE "Listing"
      SET location = ST_SetSRID(ST_MakePoint(${lng + (i % 3) * 0.002}, ${lat + (i % 2) * 0.002}), 4326)::geography
      WHERE id = ${listing.id}`;
  }
  console.log("  6 demo listings created");

  // 5. A few for-sale listings.
  const SALES = [
    { neighborhood: "Lavington", bedrooms: 4, category: "FOUR_PLUS_BR" as const, priceKes: 42_000_000, title: "4BR Lavington townhouse for sale" },
    { neighborhood: "Kilimani", bedrooms: 3, category: "THREE_BR" as const, priceKes: 18_500_000, title: "3BR Kilimani apartment for sale" },
    { neighborhood: "Karen", bedrooms: 5, category: "FOUR_PLUS_BR" as const, priceKes: 85_000_000, title: "5BR Karen villa on half acre" },
  ];
  for (let i = 0; i < SALES.length; i++) {
    const s = SALES[i];
    const listing = await prisma.listing.create({
      data: {
        agentId: agent.id,
        title: s.title,
        description: `A ${s.bedrooms} bedroom home for sale in ${s.neighborhood}. Freehold title, mature garden, ample parking, borehole and backup power. Close to schools and shopping. Serious buyers only — contact the agent to arrange a viewing.`,
        category: s.category,
        listingType: "SALE",
        bedrooms: s.bedrooms,
        bathrooms: Math.max(2, s.bedrooms - 1),
        rentKesCents: 0,
        salePriceKes: s.priceKes,
        depositMonths: 0,
        features: ["parking", "backup_generator", "borehole", "garden", "dsq"],
        neighborhood: s.neighborhood,
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
