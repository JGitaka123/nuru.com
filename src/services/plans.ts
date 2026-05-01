/**
 * Plan registry. Source of truth for tier features + pricing.
 *
 * Run `seedPlans()` on boot or via the seed script to upsert into the
 * Plan table. Pricing in KES cents.
 *
 * Tier guidance:
 *   TRIAL    — free for 30 days; 3 listings; eval-the-product fit
 *   BRONZE   — solo agent; up to 10 listings
 *   SILVER   — small agency; 30 listings + priority + autoreply
 *   GOLD     — established agency; 100 listings + featured placement
 *   PLATINUM — bank / dev / multi-branch; unlimited + API + manager
 */

import type { PlanTier } from "@prisma/client";
import { prisma } from "../db/client";

export interface PlanFeatures {
  aiListingGeneration: boolean;
  basicAnalytics: boolean;
  fullAnalytics: boolean;
  prioritySearchRank: boolean;
  whatsappAutoreply: boolean;
  featuredPlacement: boolean;
  dedicatedAiAssistant: boolean;
  brandedLandingPage: boolean;
  apiAccess: boolean;
  accountManager: boolean;
  customPromptTraining: boolean;
  bulkListingTools: boolean;
  whiteLabel: boolean;
  /** Floor on monthly outreach lead-finder volume (B2B accounts). */
  outreachLeadsPerMonth: number;
}

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  monthlyKesCents: number;
  yearlyKesCents: number | null;     // 10× monthly = 2 months free
  maxActiveListings: number | null;
  features: PlanFeatures;
  rank: number;
  blurb: string;
}

const F = (overrides: Partial<PlanFeatures>): PlanFeatures => ({
  aiListingGeneration: false,
  basicAnalytics: false,
  fullAnalytics: false,
  prioritySearchRank: false,
  whatsappAutoreply: false,
  featuredPlacement: false,
  dedicatedAiAssistant: false,
  brandedLandingPage: false,
  apiAccess: false,
  accountManager: false,
  customPromptTraining: false,
  bulkListingTools: false,
  whiteLabel: false,
  outreachLeadsPerMonth: 0,
  ...overrides,
});

/** Pricing in KES *cents* (DB integer convention). */
export const PLANS: Record<PlanTier, PlanDefinition> = {
  TRIAL: {
    id: "TRIAL",
    name: "Trial",
    monthlyKesCents: 0,
    yearlyKesCents: null,
    maxActiveListings: 3,
    rank: 0,
    blurb: "Free for 30 days. Try every core feature, no card required.",
    features: F({
      aiListingGeneration: true,
      basicAnalytics: true,
    }),
  },
  BRONZE: {
    id: "BRONZE",
    name: "Bronze",
    monthlyKesCents: 250_000,           // KES 2,500
    yearlyKesCents: 2_500_000,          // KES 25,000 (2 months free)
    maxActiveListings: 10,
    rank: 1,
    blurb: "Solo agents. Everything you need to run up to 10 active listings.",
    features: F({
      aiListingGeneration: true,
      basicAnalytics: true,
    }),
  },
  SILVER: {
    id: "SILVER",
    name: "Silver",
    monthlyKesCents: 750_000,           // KES 7,500
    yearlyKesCents: 7_500_000,          // KES 75,000
    maxActiveListings: 30,
    rank: 2,
    blurb: "Growing agencies. Priority placement and AI-assisted comms.",
    features: F({
      aiListingGeneration: true,
      basicAnalytics: true,
      fullAnalytics: true,
      prioritySearchRank: true,
      whatsappAutoreply: true,
    }),
  },
  GOLD: {
    id: "GOLD",
    name: "Gold",
    monthlyKesCents: 2_000_000,         // KES 20,000
    yearlyKesCents: 20_000_000,         // KES 200,000
    maxActiveListings: 100,
    rank: 3,
    blurb: "Established agencies. Featured placement and a dedicated AI assistant.",
    features: F({
      aiListingGeneration: true,
      basicAnalytics: true,
      fullAnalytics: true,
      prioritySearchRank: true,
      whatsappAutoreply: true,
      featuredPlacement: true,
      dedicatedAiAssistant: true,
      brandedLandingPage: true,
    }),
  },
  PLATINUM: {
    id: "PLATINUM",
    name: "Platinum",
    monthlyKesCents: 6_000_000,         // KES 60,000
    yearlyKesCents: 60_000_000,         // KES 600,000
    maxActiveListings: null,
    rank: 4,
    blurb: "Banks, developers, multi-branch firms. Unlimited + enterprise tools.",
    features: F({
      aiListingGeneration: true,
      basicAnalytics: true,
      fullAnalytics: true,
      prioritySearchRank: true,
      whatsappAutoreply: true,
      featuredPlacement: true,
      dedicatedAiAssistant: true,
      brandedLandingPage: true,
      apiAccess: true,
      accountManager: true,
      customPromptTraining: true,
      bulkListingTools: true,
      whiteLabel: true,
      outreachLeadsPerMonth: 1_000,
    }),
  },
};

/** Idempotently write the registry to the Plan table. */
export async function seedPlans(): Promise<void> {
  for (const def of Object.values(PLANS)) {
    await prisma.plan.upsert({
      where: { id: def.id },
      create: {
        id: def.id,
        name: def.name,
        monthlyKesCents: def.monthlyKesCents,
        yearlyKesCents: def.yearlyKesCents,
        maxActiveListings: def.maxActiveListings,
        features: def.features as object,
        rank: def.rank,
        isActive: true,
      },
      update: {
        name: def.name,
        monthlyKesCents: def.monthlyKesCents,
        yearlyKesCents: def.yearlyKesCents,
        maxActiveListings: def.maxActiveListings,
        features: def.features as object,
        rank: def.rank,
      },
    });
  }
}

export function planFor(tier: PlanTier): PlanDefinition {
  return PLANS[tier];
}
