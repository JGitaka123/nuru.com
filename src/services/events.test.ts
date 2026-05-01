import { describe, it, expect, beforeAll } from "vitest";
import { hashIp } from "./events";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-must-be-at-least-32-chars-long";
});

describe("hashIp", () => {
  it("returns null for empty inputs", () => {
    expect(hashIp(null)).toBeNull();
    expect(hashIp(undefined)).toBeNull();
    expect(hashIp("")).toBeNull();
  });

  it("is deterministic for the same input", () => {
    const a = hashIp("203.0.113.7");
    const b = hashIp("203.0.113.7");
    expect(a).toBe(b);
  });

  it("differs for different inputs", () => {
    const a = hashIp("203.0.113.7");
    const b = hashIp("203.0.113.8");
    expect(a).not.toBe(b);
  });

  it("is short and not the raw IP", () => {
    const h = hashIp("203.0.113.7");
    expect(h).not.toBe("203.0.113.7");
    expect(h).toMatch(/^[a-f0-9]{24}$/);
  });
});
