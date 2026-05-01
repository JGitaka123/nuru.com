import Fastify from "fastify";
import { ZodError } from "zod";
import { searchRoutes } from "./routes/search";
import { webhookRoutes } from "./routes/webhooks";
import { authRoutes } from "./routes/auth";
import { listingRoutes } from "./routes/listings";
import { photoRoutes } from "./routes/photos";
import { viewingRoutes } from "./routes/viewings";
import { verificationRoutes } from "./routes/verification";
import { escrowRoutes } from "./routes/escrow";
import { logger } from "./lib/logger";
import { inferenceHealth } from "./services/inference";
import { AppError, toHttpError } from "./lib/errors";

const app = Fastify({ logger });

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

app.get("/health", async () => {
  const inference = await inferenceHealth().catch(() => null);
  return { status: "ok", inference, time: new Date().toISOString() };
});

app.register(authRoutes);
app.register(listingRoutes);
app.register(photoRoutes);
app.register(viewingRoutes);
app.register(verificationRoutes);
app.register(escrowRoutes);
app.register(searchRoutes);
app.register(webhookRoutes);

const port = Number(process.env.PORT ?? 4000);
app
  .listen({ port, host: "0.0.0.0" })
  .then(() => logger.info(`nuru api listening on :${port}`))
  .catch((err) => {
    logger.error(err, "failed to start");
    process.exit(1);
  });
