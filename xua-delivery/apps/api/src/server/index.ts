import http from "node:http";
import { createApp } from "../http/app";
import { logger } from "../infra/logger";
import { createSocketGateway } from "../infra/socket/gateway";
import { disconnectPrisma } from "../infra/prisma/client";
import { disconnectRedis } from "../infra/redis/client";

const PORT = Number(process.env.PORT) || 4000;
const HOSTNAME = process.env.HOSTNAME ?? "0.0.0.0";

const app = createApp();
const server = http.createServer(app);

// Socket.IO integrado ao mesmo servidor HTTP
const io = createSocketGateway(server);

server.listen(PORT, HOSTNAME, () => {
  logger.info({ port: PORT, hostname: HOSTNAME }, "XUA API server started");
});

// ── Graceful shutdown ────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received — closing server");

  io.close();

  await disconnectPrisma();
  await disconnectRedis();

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

// ── Exceções não tratadas ────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection");
});
