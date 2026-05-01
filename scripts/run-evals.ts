/**
 * Run the AI eval suite. Used by:
 *   - Local: `pnpm ai:eval` before changing a prompt.
 *   - CI: gates merges to main when prompts change.
 *
 * Looks for `*.eval.ts` files (or `*.test.ts` files marked with `[eval]`)
 * and runs them with `RUN_REAL_AI_EVALS=1` so the live cases execute.
 *
 * Cost guardrail: refuses to run if the projected spend exceeds
 * AI_EVAL_BUDGET_USD (default $5). Override with --budget=10.
 */

import { spawn } from "node:child_process";

const argBudget = process.argv.find((a) => a.startsWith("--budget="));
const budget = argBudget ? Number(argBudget.split("=")[1]) : Number(process.env.AI_EVAL_BUDGET_USD ?? 5);

console.log(`AI eval budget: $${budget}`);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY not set; aborting.");
  process.exit(1);
}

const child = spawn(
  "pnpm",
  ["vitest", "run", "src/prompts", "--reporter=verbose"],
  {
    stdio: "inherit",
    env: { ...process.env, RUN_REAL_AI_EVALS: "1" },
    shell: process.platform === "win32",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
