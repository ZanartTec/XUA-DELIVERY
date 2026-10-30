import http from "node:http";
import { createApp } from "../http/app";
import { getEnv } from "../config/env";
import { logger } from "../infra/logger";
import { createSocketGateway } from "../infra/socket/gateway";
import { disconnectPrisma } from "../infra/prisma/client";
import { disconnectRedis } from "../infra/redis/client";

/**
 * Sobe o servidor HTTP + Socket.IO. Separado de index.ts para que a validação
 * de ambiente rode ANTES deste módulo ser importado — vários imports daqui
 * (jwt.ts, por exemplo) validam env no topo do arquivo, e sem essa separação a
 * primeira variável ausente derrubaria o processo antes de listarmos todas.
 */
export function startServer(): void {
  const env = getEnv();
  const PORT = env.PORT ?? 4000;
  const HOST = env.HOST ?? "0.0.0.0";

  const app = createApp();
  const server = http.createServer(app);

  // Socket.IO integrado ao mesmo servidor HTTP
  const io = createSocketGateway(server);

  server.listen(PORT, HOST, () => {
    logger.info({ port: PORT, host: HOST }, "XUA API server started");
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
}
