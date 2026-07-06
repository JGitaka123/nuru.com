import { afterEach, describe, expect, it } from "vitest";
import { effectivePlan, isFreeLaunch, freeLaunchUntil, PLANS } from "./plans";

const FUTURE = "2999-01-01";
const PAST = "2001-01-01";

afterEach(() => {
  delete process.env.FREE_LAUNCH_UNTIL;
});

describe("free launch window", () => {
  it("is off when the env var is unset, past, or garbage", () => {
    expect(isFreeLaunch()).toBe(false);
    process.env.FREE_LAUNCH_UNTIL = PAST;
    expect(isFreeLaunch()).toBe(false);
    process.env.FREE_LAUNCH_UNTIL = "not-a-date";
    expect(isFreeLaunch()).toBe(false);
    expect(freeLaunchUntil()).toBeNull();
  });

  it("is on before the date", () => {
    process.env.FREE_LAUNCH_UNTIL = FUTURE;
    expect(isFreeLaunch()).toBe(true);
    expect(freeLaunchUntil()?.getFullYear()).toBe(2999);
  });

  it("upgrades sub-Silver tiers to Silver gating while active", () => {
    process.env.FREE_LAUNCH_UNTIL = FUTURE;
    expect(effectivePlan("TRIAL").id).toBe("SILVER");
    expect(effectivePlan("BRONZE").id).toBe("SILVER");
    // At-or-above Silver keeps its own plan.
    expect(effectivePlan("SILVER").id).toBe("SILVER");
    expect(effectivePlan("GOLD").id).toBe("GOLD");
    expect(effectivePlan("PLATINUM").id).toBe("PLATINUM");
  });

  it("enforces the subscribed plan outside the window", () => {
    expect(effectivePlan("TRIAL").id).toBe("TRIAL");
    expect(effectivePlan("TRIAL").maxActiveListings).toBe(PLANS.TRIAL.maxActiveListings);
    process.env.FREE_LAUNCH_UNTIL = PAST;
    expect(effectivePlan("BRONZE").id).toBe("BRONZE");
  });

  it("gives Silver-level caps during the window", () => {
    process.env.FREE_LAUNCH_UNTIL = FUTURE;
    expect(effectivePlan("TRIAL").maxActiveListings).toBe(PLANS.SILVER.maxActiveListings);
    expect(effectivePlan("TRIAL").features.whatsappAutoreply).toBe(true);
  });
});
