/**
 * Eval mining — pull recent AiFeedback rows flagged as `promoteToEval=true`
 * and write them to tests/evals/<task>/<id>.json so future prompt changes
 * can regression-test against them.
 *
 * Run: pnpm tsx scripts/mine-evals.ts [--days=14]
 *
 * Idempotent: skips files that already exist. Run weekly via cron or
 * manually before a prompt-change PR.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const argDays = process.argv.find((a) => a.startsWith("--days="));
const days = argDays ? Number(argDays.split("=")[1]) : 14;
const outDir = resolve(process.cwd(), "tests/evals");

async function main() {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.aiFeedback.findMany({
    where: { promoteToEval: true, createdAt: { gte: since } },
    include: { aiOutput: true },
    take: 500,
  });
  console.log(`Found ${rows.length} eval candidates from the last ${days} days.`);

  let written = 0;
  for (const fb of rows) {
    const out = fb.aiOutput;
    const file = resolve(outDir, out.task, `${out.id}.json`);
    if (existsSync(file)) continue;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        meta: {
          source: "feedback",
          aiOutputId: out.id,
          feedbackId: fb.id,
          grade: fb.grade,
          reason: fb.reason,
          createdAt: fb.createdAt.toISOString(),
        },
        task: out.task,
        promptVersionId: out.promptVersionId,
        inputPreview: out.inputPreview,
        // The expected output is the corrected version when graders edited
        // it; otherwise the original (correct/wrong/partial cases).
        expected: fb.editedOutput ?? out.output,
      }, null, 2),
    );
    written++;
  }
  console.log(`Wrote ${written} new eval cases under ${outDir}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
