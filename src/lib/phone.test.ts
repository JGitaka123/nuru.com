import { describe, it, expect } from "vitest";
import { toE164, toDarajaFormat, toDisplay, isValidE164 } from "./phone";
import { ValidationError } from "./errors";

describe("toE164", () => {
  it.each([
    ["0712345678", "+254712345678"],
    ["712345678", "+254712345678"],
    ["+254712345678", "+254712345678"],
    ["254712345678", "+254712345678"],
    ["0712 345 678", "+254712345678"],
    ["+254 712-345-678", "+254712345678"],
    ["0112345678", "+254112345678"], // Airtel/Telkom 1XX prefix
  ])("normalizes %s → %s", (input, expected) => {
    expect(toE164(input)).toBe(expected);
  });

  it.each([
    "0312345678",       // 3XX is not a mobile prefix
    "071234567",        // too short
    "07123456789",      // too long
    "+1234567890",      // wrong country
    "abcdefghij",       // non-numeric
    "",                 // empty
  ])("rejects %s", (bad) => {
    expect(() => toE164(bad)).toThrow(ValidationError);
  });
});

describe("toDarajaFormat", () => {
  it("strips the leading +", () => {
    expect(toDarajaFormat("+254712345678")).toBe("254712345678");
  });
  it("rejects invalid input", () => {
    expect(() => toDarajaFormat("254712345678")).toThrow(ValidationError);
  });
});

describe("toDisplay", () => {
  it("formats E.164 with spaces", () => {
    expect(toDisplay("+254712345678")).toBe("0712 345 678");
  });
});

describe("isValidE164", () => {
  it("accepts valid", () => {
    expect(isValidE164("+254712345678")).toBe(true);
  });
  it("rejects missing plus", () => {
    expect(isValidE164("254712345678")).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidE164("+25471234567")).toBe(false);
  });
});
