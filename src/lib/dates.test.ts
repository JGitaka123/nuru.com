import { describe, expect, it } from "vitest";
import { addMonths } from "./dates";

describe("addMonths", () => {
  it("adds a plain month", () => {
    expect(addMonths(new Date("2026-06-15T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-07-15");
  });

  it("clamps Jan 31 to Feb (no March overflow)", () => {
    // Plain setMonth would roll Jan 31 → Mar 3.
    const r = addMonths(new Date(2026, 0, 31), 1); // Jan 31 2026 (local)
    expect(r.getMonth()).toBe(1);                  // February
    expect(r.getDate()).toBe(28);                  // 2026 is not a leap year
  });

  it("clamps to Feb 29 in a leap year", () => {
    const r = addMonths(new Date(2028, 0, 31), 1); // Jan 31 2028 (leap)
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(29);
  });

  it("handles multi-month jumps (free months)", () => {
    const r = addMonths(new Date(2026, 0, 31), 3); // + 3 → April (30 days)
    expect(r.getMonth()).toBe(3);
    expect(r.getDate()).toBe(30);
  });

  it("does not mutate the input", () => {
    const d = new Date("2026-06-15T00:00:00Z");
    addMonths(d, 1);
    expect(d.toISOString().slice(0, 10)).toBe("2026-06-15");
  });
});
