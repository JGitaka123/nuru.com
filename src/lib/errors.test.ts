import { describe, it, expect } from "vitest";
import {
  AppError, AuthError, ConflictError, ForbiddenError, NotFoundError,
  RateLimitError, ValidationError, toHttpError,
} from "./errors";

describe("error types", () => {
  it.each([
    [new ValidationError("bad"), 400, "VALIDATION_ERROR"],
    [new AuthError(), 401, "AUTH_ERROR"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError("Listing"), 404, "NOT_FOUND"],
    [new ConflictError("dup"), 409, "CONFLICT"],
    [new RateLimitError(), 429, "RATE_LIMIT"],
  ])("maps %s → status %s, code %s", (err, status, code) => {
    expect(err).toBeInstanceOf(AppError);
    const http = toHttpError(err);
    expect(http.status).toBe(status);
    expect(http.body.code).toBe(code);
  });

  it("falls back to 500 for unknown errors", () => {
    const http = toHttpError(new Error("boom"));
    expect(http.status).toBe(500);
    expect(http.body.code).toBe("INTERNAL_ERROR");
  });
});
