import Fastify from "fastify";
import { searchRoutes } from "./routes/search";
import { webhookRoutes } from "./routes/webhooks";
import { logger } from "./lib/logger";
import { inferenceHealth } from "./services/inference";

const app = Fastify({ logger });

app.get("/health", async () => {
  const inference = await inferenceHealth().catch(() => null);
  return { status: "ok", inference, time: new Date().toISOString() };
});

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
