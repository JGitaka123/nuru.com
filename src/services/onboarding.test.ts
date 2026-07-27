import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  listing: { findFirst: vi.fn() },
  inquiry: { findFirst: vi.fn() },
}));

vi.mock("../db/client", () => ({ prisma: prismaMock }));

import {
  buildSteps,
  getOnboardingProgress,
  ONBOARDING_STEP_KEYS,
  type OnboardingFlags,
} from "./onboarding";

const NOTHING: OnboardingFlags = {
  verified: false,
  hasListing: false,
  hasPhotos: false,
  published: false,
  hasInquiry: false,
};

const EVERYTHING: OnboardingFlags = {
  verified: true,
  hasListing: true,
  hasPhotos: true,
  published: true,
  hasInquiry: true,
};

describe("buildSteps", () => {
  it("returns every step in funnel order with nothing done", () => {
    const p = buildSteps(NOTHING);
    expect(p.steps.map((s) => s.key)).toEqual([...ONBOARDING_STEP_KEYS]);
    expect(p.steps.every((s) => !s.done)).toBe(true);
    expect(p.completedCount).toBe(0);
    expect(p.totalCount).toBe(5);
    expect(p.percentComplete).toBe(0);
    expect(p.complete).toBe(false);
    expect(p.nextStep?.key).toBe("verified");
    expect(p.nextStep?.href).toBe("/agent/verify");
  });

  it("marks itself complete with no next step once everything is done", () => {
    const p = buildSteps(EVERYTHING);
    expect(p.completedCount).toBe(5);
    expect(p.percentComplete).toBe(100);
    expect(p.complete).toBe(true);
    expect(p.nextStep).toBeNull();
  });

  it("picks the first incomplete step even when later steps are done", () => {
    const p = buildSteps({ ...EVERYTHING, hasPhotos: false });
    expect(p.nextStep?.key).toBe("hasPhotos");
    expect(p.nextStep?.href).toBe("/agent/new");
    expect(p.completedCount).toBe(4);
    expect(p.complete).toBe(false);
  });

  it("rounds the percentage to a whole number", () => {
    // 1/5 = 20%, 2/5 = 40% — and 3/5 stays exact rather than drifting.
    expect(buildSteps({ ...NOTHING, verified: true }).percentComplete).toBe(20);
    expect(buildSteps({ ...NOTHING, verified: true, hasListing: true }).percentComplete).toBe(40);
    expect(buildSteps({ ...EVERYTHING, published: false, hasInquiry: false }).percentComplete).toBe(60);
  });

  it("gives every step an actionable label, hint and href", () => {
    for (const step of buildSteps(NOTHING).steps) {
      expect(step.label.length).toBeGreaterThan(0);
      expect(step.hint.length).toBeGreaterThan(0);
      expect(step.href.startsWith("/agent")).toBe(true);
    }
  });
});

describe("getOnboardingProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("derives flags from the DB probes without per-listing queries", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", verificationStatus: "VERIFIED" });
    // any listing → yes, listing with photos → no, active listing → no
    prismaMock.listing.findFirst
      .mockResolvedValueOnce({ id: "l1" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prismaMock.inquiry.findFirst.mockResolvedValue(null);

    const p = await getOnboardingProgress("u1");

    expect(prismaMock.listing.findFirst).toHaveBeenCalledTimes(3);
    expect(prismaMock.inquiry.findFirst).toHaveBeenCalledTimes(1);
    expect(p.completedCount).toBe(2);
    expect(p.nextStep?.key).toBe("hasPhotos");
    const byKey = Object.fromEntries(p.steps.map((s) => [s.key, s.done]));
    expect(byKey).toEqual({
      verified: true,
      hasListing: true,
      hasPhotos: false,
      published: false,
      hasInquiry: false,
    });
  });

  it("treats a non-VERIFIED status as an incomplete verification step", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "u1", verificationStatus: "PENDING" });
    prismaMock.listing.findFirst.mockResolvedValue(null);
    prismaMock.inquiry.findFirst.mockResolvedValue(null);

    const p = await getOnboardingProgress("u1");
    expect(p.nextStep?.key).toBe("verified");
    expect(p.completedCount).toBe(0);
  });

  it("throws NotFoundError for an unknown user", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.listing.findFirst.mockResolvedValue(null);
    prismaMock.inquiry.findFirst.mockResolvedValue(null);

    await expect(getOnboardingProgress("nope")).rejects.toThrow(/user/i);
  });
});
