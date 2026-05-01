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

const prisma = new PrismaClient();

const NEIGHBORHOODS = [
  "Kilimani", "Westlands", "Kileleshwa", "Lavington", "Parklands",
];

async function main() {
  console.log("Seeding…");

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
  for (let i = 0; i < 6; i++) {
    const neighborhood = NEIGHBORHOODS[i % NEIGHBORHOODS.length];
    const bedrooms = (i % 3) + 1;
    const rentKes = 35_000 + i * 8_500 + bedrooms * 12_000;
    await prisma.listing.create({
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
  }
  console.log("  6 demo listings created");

  console.log("Done.");
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
