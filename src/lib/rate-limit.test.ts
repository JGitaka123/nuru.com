import { describe, it, expect, beforeEach } from "vitest";
import { consume, reset } from "./rate-limit";
import { RateLimitError } from "./errors";

describe("rate-limit", () => {
  const key = "test-key";
  beforeEach(() => reset(key));

  it("allows up to max requests", () => {
    for (let i = 0; i < 3; i++) consume(key, 3, 1000);
    expect(() => consume(key, 3, 1000)).toThrow(RateLimitError);
  });

  it("resets after window expires", async () => {
    consume(key, 1, 50);
    expect(() => consume(key, 1, 50)).toThrow(RateLimitError);
    await new Promise((r) => setTimeout(r, 60));
    expect(() => consume(key, 1, 50)).not.toThrow();
  });

  it("isolates separate keys", () => {
    consume("k1", 1, 1000);
    expect(() => consume("k2", 1, 1000)).not.toThrow();
  });
});
