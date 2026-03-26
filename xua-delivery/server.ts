import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketServer } from "socket.io";
import cron from "node-cron";
import { verifyToken } from "./src/lib/auth";
import { subscriptionCron } from "./src/services/ops/subscription-cron";
import { otpCleanupCron } from "./src/services/ops/otp-cleanup";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  // Socket.io embutido no mesmo servidor HTTP
  const allowedOrigin = dev
    ? `http://${hostname}:${port}`
    : process.env.ALLOWED_ORIGIN;
  if (!dev && !allowedOrigin) {
    throw new Error("FATAL: ALLOWED_ORIGIN não definido em produção. Defina a variável de ambiente.");
  }

  const io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
    },
  });

  // Exporta io via global para os Services usarem
  (globalThis as Record<string, unknown>).__io = io;

  io.on("connection", async (socket) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        socket.disconnect(true);
        return;
      }

      const payload = await verifyToken(token);
      if (!payload?.sub || !payload?.role) {
        socket.disconnect(true);
        return;
      }

      // Dados derivados do JWT verificado, não do cliente
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.join(`${payload.role}:${payload.sub}`);
    } catch {
      socket.disconnect(true);
    }

    socket.on("disconnect", () => {
      // Limpeza automática pelo Socket.io
    });
  });

  // ─── Cron Jobs ───────────────────────────────────────────────
  // Gera pedidos automáticos de assinatura às 06h (São Paulo)
  cron.schedule("0 6 * * *", subscriptionCron, {
    timezone: "America/Sao_Paulo",
  });

  // Expira OTPs ativos a cada 15 minutos
  cron.schedule("*/15 * * * *", otpCleanupCron);

  // ─── Graceful Shutdown ───────────────────────────────────────
  const shutdown = () => {
    console.log("Shutting down gracefully...");
    io.close();
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  httpServer.listen(port, () => {
    console.log(`> Xuá Delivery rodando em http://${hostname}:${port}`);
    console.log(`> Socket.io embutido no mesmo servidor`);
    console.log(`> Cron jobs ativos: assinaturas 06h, OTP cleanup 15min`);
  });
});
