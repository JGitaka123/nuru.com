import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { ZodError } from "zod";
import { searchRoutes } from "./routes/search";
import { webhookRoutes } from "./routes/webhooks";
import { authRoutes } from "./routes/auth";
import { listingRoutes } from "./routes/listings";
import { photoRoutes } from "./routes/photos";
import { viewingRoutes } from "./routes/viewings";
import { verificationRoutes } from "./routes/verification";
import { escrowRoutes } from "./routes/escrow";
import { pushRoutes } from "./routes/push";
import { inquiryRoutes } from "./routes/inquiries";
import { applicationRoutes } from "./routes/applications";
import { leaseRoutes } from "./routes/leases";
import { fraudReportRoutes } from "./routes/fraud-reports";
import { voiceSearchRoutes } from "./routes/voice-search";
import { adminRoutes } from "./routes/admin";
import { aiFeedbackRoutes } from "./routes/ai-feedback";
import { recommendationRoutes } from "./routes/recommendations";
import { savedRoutes } from "./routes/saved";
import { adminLeadRoutes } from "./routes/admin-leads";
import { unsubscribeRoutes } from "./routes/unsubscribe";
import { savedSearchRoutes } from "./routes/saved-searches";
import { agentAnalyticsRoutes } from "./routes/agent-analytics";
import { logger } from "./lib/logger";
import { inferenceHealth } from "./services/inference";
import { prisma } from "./db/client";
import { redis } from "./workers/queues";
import { AppError, toHttpError } from "./lib/errors";

const app = Fastify({
  logger,
  bodyLimit: 5 * 1024 * 1024,            // 5 MB — photos go to R2 directly
  trustProxy: true,                       // we sit behind Cloudflare
});

// Security headers. Default policy is fine for an API service.
app.register(helmet, {
  // Allow inline data URLs for the small set of image responses we send.
  contentSecurityPolicy: false,
});

// CORS — allow the web app's origin, and credentials for future cookie use.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
  .split(",").map((s) => s.trim()).filter(Boolean);
app.register(cors, {
  origin: (origin, cb) => {
    // No origin = same-origin or non-browser; allow.
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    return cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof ZodError) {
    return reply.code(400).send({
      code: "VALIDATION_ERROR",
      message: "Invalid request",
      details: err.errors,
    });
  }
  if (err instanceof AppError) {
    const { status, body } = toHttpError(err);
    return reply.code(status).send(body);
  }
  logger.error({ err }, "unhandled error");
  return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Internal server error" });
});

app.get("/health", async (_req, reply) => {
  const [db, cache, inference] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
    redis.ping().then((r) => r === "PONG").catch(() => false),
    inferenceHealth().catch(() => null),
  ]);
  const ok = db && cache;
  return reply.code(ok ? 200 : 503).send({
    status: ok ? "ok" : "degraded",
    db, cache, inference,
    time: new Date().toISOString(),
  });
});

app.register(authRoutes);
app.register(listingRoutes);
app.register(photoRoutes);
app.register(viewingRoutes);
app.register(verificationRoutes);
app.register(escrowRoutes);
app.register(pushRoutes);
app.register(inquiryRoutes);
app.register(applicationRoutes);
app.register(leaseRoutes);
app.register(fraudReportRoutes);
app.register(voiceSearchRoutes);
app.register(adminRoutes);
app.register(aiFeedbackRoutes);
app.register(recommendationRoutes);
app.register(savedRoutes);
app.register(savedSearchRoutes);
app.register(agentAnalyticsRoutes);
app.register(adminLeadRoutes);
app.register(unsubscribeRoutes);
app.register(searchRoutes);
app.register(webhookRoutes);

// Graceful shutdown — drain in-flight requests, close DB/Redis, exit clean.
const shutdown = async (signal: string) => {
  logger.info({ signal }, "api shutting down");
  try {
    await app.close();
    await prisma.$disconnect();
    await redis.quit();
  } catch (err) {
    logger.error({ err }, "shutdown error");
  } finally {
    process.exit(0);
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

const port = Number(process.env.PORT ?? 4000);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => logger.info(`nuru api listening on :${port}`))
  .catch((err) => {
    logger.error(err, "failed to start");
    process.exit(1);
  });
