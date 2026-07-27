/**
 * Agent onboarding progress.
 *
 * New agents sign up but many stall before a published listing. This service
 * derives an activation checklist from existing data (no new tables, no
 * writes) so the agent dashboard can show exactly what is left to do.
 *
 * Steps are ordered by the real activation funnel:
 *   verify → create a listing → add photos → publish → first inquiry
 *
 * Read-only. One parallel batch of existence probes — never per-listing
 * queries.
 */

import { prisma } from "../db/client";
import { NotFoundError } from "../lib/errors";

export const ONBOARDING_STEP_KEYS = [
  "verified",
  "hasListing",
  "hasPhotos",
  "published",
  "hasInquiry",
] as const;

export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number];

/** The raw booleans the checklist is derived from. */
export type OnboardingFlags = Record<OnboardingStepKey, boolean>;

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  hint: string;
  /** Web route that lets the agent complete this step. */
  href: string;
  done: boolean;
}

export interface OnboardingProgress {
  steps: OnboardingStep[];
  completedCount: number;
  totalCount: number;
  /** 0-100, rounded to a whole percent. */
  percentComplete: number;
  /** First incomplete step in funnel order, or null once everything is done. */
  nextStep: OnboardingStep | null;
  complete: boolean;
}

interface StepCopy {
  key: OnboardingStepKey;
  label: string;
  hint: string;
  href: string;
}

const STEP_COPY: readonly StepCopy[] = [
  {
    key: "verified",
    label: "Verify your account",
    hint: "Add your KRA PIN and national ID — takes about 2 minutes.",
    href: "/agent/verify",
  },
  {
    key: "hasListing",
    label: "Create your first listing",
    hint: "Snap photos and let AI draft the title, description and price.",
    href: "/agent/new",
  },
  {
    key: "hasPhotos",
    label: "Add photos to a listing",
    hint: "Listings with six or more photos get far more inquiries.",
    href: "/agent/new",
  },
  {
    key: "published",
    label: "Publish a listing",
    hint: "Submit for review — once approved it goes live to tenants.",
    href: "/agent",
  },
  {
    key: "hasInquiry",
    label: "Get your first inquiry",
    hint: "Share your listing link — agents who reply within an hour convert best.",
    href: "/agent/inbox",
  },
];

/**
 * Pure mapping from flags → the ordered checklist, next step and percentage.
 * Kept separate from the DB read so the funnel logic is unit-testable.
 */
export function buildSteps(flags: OnboardingFlags): OnboardingProgress {
  const steps: OnboardingStep[] = STEP_COPY.map((copy) => ({
    ...copy,
    done: flags[copy.key] === true,
  }));

  const totalCount = steps.length;
  const completedCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) ?? null;

  return {
    steps,
    completedCount,
    totalCount,
    percentComplete: totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100),
    nextStep,
    complete: nextStep === null,
  };
}

/** Read the agent's activation state and return the checklist. */
export async function getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
  const id = { id: true } as const;

  const [user, anyListing, listingWithPhotos, activeListing, inquiry] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, verificationStatus: true } }),
    prisma.listing.findFirst({ where: { agentId: userId }, select: id }),
    prisma.listing.findFirst({ where: { agentId: userId, photoKeys: { isEmpty: false } }, select: id }),
    prisma.listing.findFirst({ where: { agentId: userId, status: "ACTIVE" }, select: id }),
    prisma.inquiry.findFirst({ where: { listing: { agentId: userId } }, select: id }),
  ]);

  if (!user) throw new NotFoundError("User");

  return buildSteps({
    verified: user.verificationStatus === "VERIFIED",
    hasListing: anyListing !== null,
    hasPhotos: listingWithPhotos !== null,
    published: activeListing !== null,
    hasInquiry: inquiry !== null,
  });
}
