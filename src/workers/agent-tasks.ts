/**
 * Autonomous client-management worker.
 *
 * `scan` mode (cron, every few hours): runs scanAndCreateTasks().
 * `execute` mode (continuous): drains PENDING tasks one at a time.
 *
 * Per-task behavior:
 *   - Build context (subscription, usage stats).
 *   - AI-draft the message via client-success prompt.
 *   - Auto-execute if confidence ≥ 0.7, else REVIEW_NEEDED.
 *   - Critical state transitions (suspend, downgrade) execute on schedule.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { redis, type AgentTasksJob, agentTasksQueue } from "./queues";
import { scanAndCreateTasks, executeTask } from "../services/agent-tasks";

export function startAgentTasksWorker() {
  const worker = new BullWorker<AgentTasksJob>(
    "agent-tasks",
    async (job) => {
      if (job.data.mode === "scan") {
        const r = await scanAndCreateTasks();
        // After scanning, kick the executor for any PENDING tasks now due.
        const dueIds = await prisma.agentTask.findMany({
          where: { status: "PENDING", dueAt: { lte: new Date() } },
          select: { id: true },
          take: 50,
          orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
        });
        for (const t of dueIds) {
          await agentTasksQueue.add(
            "execute",
            { mode: "execute", taskId: t.id },
            { jobId: `exec:${t.id}` },
          ).catch(() => undefined);
        }
        logger.info({ scanCreated: r.created, queued: dueIds.length }, "agent-tasks scan");
      } else if (job.data.mode === "execute" && job.data.taskId) {
        const r = await executeTask(job.data.taskId);
        logger.info({ taskId: job.data.taskId, result: r }, "agent-tasks execute");
      }
    },
    { connection: redis, concurrency: 2 },
  );
  worker.on("failed", (j, err) => logger.error({ jobId: j?.id, err }, "agent-tasks worker failed"));
  return worker;
}
