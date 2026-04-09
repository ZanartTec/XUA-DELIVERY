import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { verifyToken } from "../auth/jwt";
import { getPrisma } from "../prisma/client";
import { logger } from "../logger";

let io: Server | null = null;

/**
 * Cria e configura a instância Socket.IO no servidor HTTP.
 * Inclui middleware de autenticação JWT no handshake.
 */
export function createSocketGateway(httpServer: HttpServer): Server {
  const allowedOrigin = process.env.APP_ORIGIN ?? "http://localhost:3000";

  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigin,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", async (socket) => {
    try {
      // Tenta extrair o token do handshake auth ou do cookie httpOnly
      let token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        const cookies = socket.handshake.headers?.cookie;
        if (cookies) {
          const match = cookies.match(/(?:^|;\s*)xua-token=([^;]*)/);
          if (match) token = match[1];
        }
      }
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

      // Para distributor_admin, entra também na sala da empresa distribuidora
      // para receber eventos de novos pedidos coletivamente.
      if (payload.role === "distributor_admin") {
        try {
          const prisma = getPrisma();
          const consumer = await prisma.consumer.findUnique({
            where: { id: payload.sub },
            select: { distributor_id: true },
          });
          if (consumer?.distributor_id) {
            socket.join(`distributor:${consumer.distributor_id}`);
            socket.data.distributorId = consumer.distributor_id;
          }
        } catch (err) {
          logger.warn({ err, userId: payload.sub }, "Falha ao resolver distributor_id no socket");
        }
      }

      logger.debug(
        { userId: payload.sub, role: payload.role },
        "Socket connected"
      );
    } catch {
      socket.disconnect(true);
    }

    socket.on("disconnect", () => {
      // Limpeza automática pelo Socket.io
    });
  });

  logger.info("Socket.IO gateway initialized");

  return io;
}

/**
 * Retorna a instância do Socket.io.
 * Usado pelos Services para emitir eventos após commit da transação.
 */
export function getIO(): Server {
  if (!io) {
    throw new Error(
      "Socket.io não inicializado. Chame createSocketGateway() primeiro."
    );
  }
  return io;
}
