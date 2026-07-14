import http from "node:http";
import { createApp } from "../http/app";
import { logger } from "../infra/logger";
import { createSocketGateway } from "../infra/socket/gateway";
import { disconnectPrisma } from "../infra/prisma/client";
import { disconnectRedis } from "../infra/redis/client";
import { closeQueueInfra } from "../infra/queue/queues";

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST ?? "0.0.0.0";

const app = createApp();
const server = http.createServer(app);

// Socket.IO integrado ao mesmo servidor HTTP
const io = createSocketGateway(server);

server.listen(PORT, HOST, () => {
  logger.info({ port: PORT, host: HOST }, "XUA API server started");
});

// ── Graceful shutdown ────────────────────────────────────────────────
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, "Shutdown signal received — closing server");

  // Armado ANTES de qualquer await: se o fechamento de fila/banco travar
  // (ex.: Redis de fila fora do ar), o processo ainda encerra em 10s.
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10_000).unref();

  io.close();

  // Fecha conexões de fila abertas pelos producers (pagamentos/assinaturas)
  await closeQueueInfra();
  await disconnectPrisma();
  await disconnectRedis();

  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
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
