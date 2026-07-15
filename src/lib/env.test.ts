import { describe, it, expect } from "vitest";
import { collectEnvProblems, JWT_SECRET_MIN_LENGTH } from "./env";

const GOOD_SECRET = "x".repeat(JWT_SECRET_MIN_LENGTH);
const GOOD_DB = "postgresql://u:p@localhost:5432/db";

describe("collectEnvProblems", () => {
  it("passes a valid environment", () => {
    expect(collectEnvProblems({ JWT_SECRET: GOOD_SECRET, DATABASE_URL: GOOD_DB })).toEqual([]);
  });

  it("flags a missing JWT_SECRET", () => {
    const problems = collectEnvProblems({ DATABASE_URL: GOOD_DB });
    expect(problems.map((p) => p.key)).toContain("JWT_SECRET");
  });

  it("flags a too-short JWT_SECRET — the sign-in 500 cause", () => {
    const problems = collectEnvProblems({ JWT_SECRET: "short", DATABASE_URL: GOOD_DB });
    expect(problems.map((p) => p.key)).toContain("JWT_SECRET");
  });

  it("accepts a secret exactly at the minimum length", () => {
    const problems = collectEnvProblems({ JWT_SECRET: GOOD_SECRET, DATABASE_URL: GOOD_DB });
    expect(problems).toHaveLength(0);
  });

  it("flags an empty/whitespace JWT_SECRET", () => {
    const problems = collectEnvProblems({ JWT_SECRET: "   ", DATABASE_URL: GOOD_DB });
    expect(problems.map((p) => p.key)).toContain("JWT_SECRET");
  });

  it("flags a missing DATABASE_URL", () => {
    const problems = collectEnvProblems({ JWT_SECRET: GOOD_SECRET });
    expect(problems.map((p) => p.key)).toContain("DATABASE_URL");
  });
});
