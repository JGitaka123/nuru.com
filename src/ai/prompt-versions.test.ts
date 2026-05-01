import { describe, it, expect } from "vitest";
import { versionIdFor } from "./prompt-versions";

describe("versionIdFor", () => {
  it("is stable for the same text", () => {
    const a = versionIdFor("hello world");
    const b = versionIdFor("hello world");
    expect(a).toBe(b);
  });

  it("changes when the text changes", () => {
    const a = versionIdFor("hello world");
    const b = versionIdFor("hello world!");
    expect(a).not.toBe(b);
  });

  it("returns a 16-char hex prefix", () => {
    const id = versionIdFor("anything");
    expect(id).toMatch(/^[a-f0-9]{16}$/);
  });
});
