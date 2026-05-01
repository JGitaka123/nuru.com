/**
 * Evals for the listing generator. Run these before changing the prompt
 * to make sure quality doesn't regress.
 *
 * Run: pnpm test src/prompts/listing-generator.test.ts
 *
 * Each case is a real-ish photo URL set + the qualities we expect the
 * output to satisfy. We don't assert exact text — only structural
 * properties (was the watermark detected, did it stay in the price band,
 * etc.). This keeps tests stable as we tune the prompt.
 */

import { describe, it, expect } from "vitest";
import { generateListing } from "./listing-generator";

describe("listing-generator", () => {
  // Each case provides photos + expectations. Photo URLs come from a
  // dedicated test bucket — never use real listings here.
  const cases = [
    {
      name: "clean 2BR Kilimani — happy path",
      input: {
        photoUrls: [
          "https://test-fixtures.nuru.com/clean-2br-kilimani/01.jpg",
          "https://test-fixtures.nuru.com/clean-2br-kilimani/02.jpg",
          "https://test-fixtures.nuru.com/clean-2br-kilimani/03.jpg",
          "https://test-fixtures.nuru.com/clean-2br-kilimani/04.jpg",
        ],
        neighborhood: "Kilimani",
      },
      expect: (r: any) => {
        expect(r.bedrooms).toBe(2);
        expect(r.category).toBe("TWO_BR");
        expect(r.estimatedRentKesLow).toBeGreaterThanOrEqual(50_000);
        expect(r.estimatedRentKesHigh).toBeLessThanOrEqual(95_000);
        expect(r.qualityIssues).not.toContain("watermark_detected");
        // Banned words check
        for (const banned of ["luxurious", "stunning", "amazing", "must-see"]) {
          expect(r.description.toLowerCase()).not.toContain(banned);
        }
      },
    },
    {
      name: "watermarked photos — must flag",
      input: {
        photoUrls: ["https://test-fixtures.nuru.com/watermarked-jiji/01.jpg"],
        neighborhood: "Westlands",
      },
      expect: (r: any) => {
        expect(r.qualityIssues).toContain("watermark_detected");
      },
    },
    {
      name: "missing kitchen photo — must flag",
      input: {
        photoUrls: [
          "https://test-fixtures.nuru.com/no-kitchen/bedroom.jpg",
          "https://test-fixtures.nuru.com/no-kitchen/bathroom.jpg",
          "https://test-fixtures.nuru.com/no-kitchen/living.jpg",
        ],
        neighborhood: "Lavington",
      },
      expect: (r: any) => {
        expect(r.missingPhotos).toEqual(expect.arrayContaining([expect.stringMatching(/kitchen/i)]));
      },
    },
    {
      name: "ambiguous photos — should mark low confidence",
      input: {
        photoUrls: ["https://test-fixtures.nuru.com/blurry/01.jpg"],
        neighborhood: "Karen",
      },
      expect: (r: any) => {
        expect(r.confidence).toBeLessThan(0.5);
      },
    },
  ];

  // Skip in CI unless real images are mocked. These run against staging.
  it.skipIf(!process.env.RUN_REAL_AI_EVALS).each(cases)(
    "$name",
    async ({ input, expect: assertion }) => {
      const r = await generateListing(input);
      assertion(r.content);
    }
  );
});
