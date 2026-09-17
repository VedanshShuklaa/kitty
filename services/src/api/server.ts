import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = buildServer();
  const port = Number(process.env.PORT ?? 8787);
  app.listen({ port, host: "0.0.0.0" }).catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
}
