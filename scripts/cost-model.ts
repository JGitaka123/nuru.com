/**
 * AI Cost Calculator
 *
 * Run: pnpm tsx scripts/cost-model.ts
 *
 * Projects AI infrastructure costs at three scales (MVP, Growth, Scale)
 * given current April 2026 Claude API pricing and our routing rules.
 *
 * Updates as model prices change — keep `RATES` in sync with router.ts.
 */

interface Scale {
  name: string;
  monthlyListings: number;
  monthlySearches: number;
  monthlyVoiceNotes: number;
  monthlyApplications: number;
  monthlyDisputes: number;
}

const SCALES: Scale[] = [
  {
    name: "MVP (Year 1, Kilimani only)",
    monthlyListings: 500,
    monthlySearches: 30_000,
    monthlyVoiceNotes: 3_000,
    monthlyApplications: 200,
    monthlyDisputes: 10,
  },
  {
    name: "Growth (Year 2, all premium Nairobi)",
    monthlyListings: 5_000,
    monthlySearches: 250_000,
    monthlyVoiceNotes: 30_000,
    monthlyApplications: 2_000,
    monthlyDisputes: 50,
  },
  {
    name: "Scale (Year 3, Nairobi + Mombasa + Kisumu + sales)",
    monthlyListings: 25_000,
    monthlySearches: 1_500_000,
    monthlyVoiceNotes: 200_000,
    monthlyApplications: 12_000,
    monthlyDisputes: 200,
  },
];

// Per-call token estimates (input + output, after caching)
// These are conservative; real numbers from production will be lower.
const COST_PER_CALL = {
  listingGeneration: 0.012,    // Sonnet vision + JSON, ~3K in / ~500 out
  searchParse: 0.0008,         // Haiku, cached prompt, ~1.5K in / ~200 out
  fraudScore: 0.003,           // Sonnet, ~2K in / ~300 out
  tenantScreen: 0.005,         // Sonnet, ~1.5K in / ~600 out
  disputeResolve: 0.04,        // Opus, multi-turn agent
  autoReplyDraft: 0.0006,      // Haiku, ~1K in / ~150 out
};

// Self-hosted GPU cost (single L4 instance)
const GPU_MONTHLY_USD = 250;

function modelMonthlyCost(s: Scale) {
  // Each listing costs: 1x generation + 1x fraud score (initial)
  // Plus auto-replies: ~3 per listing/month average for active inquiries.
  const listingGen = s.monthlyListings * COST_PER_CALL.listingGeneration;
  const fraud = s.monthlyListings * COST_PER_CALL.fraudScore +
                s.monthlyListings * 0.5 * COST_PER_CALL.fraudScore;  // nightly rescore at batch 50% off
  const search = s.monthlySearches * COST_PER_CALL.searchParse;
  const screen = s.monthlyApplications * COST_PER_CALL.tenantScreen;
  const dispute = s.monthlyDisputes * COST_PER_CALL.disputeResolve;
  const replies = s.monthlyListings * 3 * COST_PER_CALL.autoReplyDraft;

  const claudeTotal = listingGen + fraud + search + screen + dispute + replies;
  // Self-hosted handles all embeddings, reranking, voice — flat cost.
  const selfHosted = GPU_MONTHLY_USD;

  return {
    breakdown: {
      "Listing generation (Sonnet)": listingGen,
      "Fraud scoring (Sonnet)": fraud,
      "Search parsing (Haiku)": search,
      "Tenant screening (Sonnet)": screen,
      "Dispute resolution (Opus)": dispute,
      "Auto-reply drafts (Haiku)": replies,
    },
    claudeTotal,
    selfHosted,
    total: claudeTotal + selfHosted,
  };
}

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

console.log("\n=== Nuru.com AI Cost Projection (April 2026 prices) ===\n");

for (const scale of SCALES) {
  const c = modelMonthlyCost(scale);
  console.log(`\n${scale.name}`);
  console.log("─".repeat(60));
  console.log(`  Listings:     ${scale.monthlyListings.toLocaleString().padStart(10)}/mo`);
  console.log(`  Searches:     ${scale.monthlySearches.toLocaleString().padStart(10)}/mo`);
  console.log(`  Voice notes:  ${scale.monthlyVoiceNotes.toLocaleString().padStart(10)}/mo`);
  console.log(`  Applications: ${scale.monthlyApplications.toLocaleString().padStart(10)}/mo`);
  console.log();
  console.log("  Claude API breakdown:");
  for (const [k, v] of Object.entries(c.breakdown)) {
    console.log(`    ${k.padEnd(40)} ${fmt(v).padStart(10)}/mo`);
  }
  console.log(`    ${"Claude API total".padEnd(40)} ${fmt(c.claudeTotal).padStart(10)}/mo`);
  console.log(`    ${"Self-hosted GPU (flat)".padEnd(40)} ${fmt(c.selfHosted).padStart(10)}/mo`);
  console.log(`    ${"━".repeat(40)} ${"━".repeat(10)}`);
  console.log(`    ${"TOTAL".padEnd(40)} ${fmt(c.total).padStart(10)}/mo`);
  console.log(`    Annualized: ${fmt(c.total * 12)}`);
}

console.log("\nAssumptions:");
console.log("  - Sonnet 4.6: $3 in / $15 out per MTok");
console.log("  - Haiku 4.5:  $1 in / $5  out per MTok");
console.log("  - Opus 4.7:   $5 in / $25 out per MTok");
console.log("  - Prompt caching: 90% off on cached input (system prompts)");
console.log("  - Batch API: 50% off, used for nightly fraud rescoring");
console.log("  - Single L4 GPU: ~$250/mo flat (Hetzner GEX44)");
console.log();
