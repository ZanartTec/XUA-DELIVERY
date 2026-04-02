import http from "node:http";
import { createApp } from "../http/app";
import { logger } from "../infra/logger";

const PORT = Number(process.env.PORT) || 4000;
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const app = createApp();
const server = http.createServer(app);

server.listen(PORT, HOSTNAME, () => {
  logger.info({ port: PORT, hostname: HOSTNAME }, "XUA API server started");
});

// ── Graceful shutdown ────────────────────────────────────────────────
// PR 04 adiciona: prisma.$disconnect() e redis.quit() aqui.
function shutdown(signal: string): void {
  logger.info({ signal }, "Shutdown signal received — closing server");

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });

  // Força encerramento se demorar mais de 10s
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
