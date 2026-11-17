import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type Redis from "ioredis";
import type { JwtPayload } from "@xua/shared/types";
import { getAllowedAppOrigins } from "../../http/allowed-origins";
import { isSocketTicket, verifyToken } from "../auth/jwt";
import { consumeSocketTicket } from "../auth/socket-ticket";
import { isBlacklisted } from "../auth/blacklist";
import { isTokenStale } from "../auth/password-change";
import { logger } from "../logger";
import { attachRealtimeServer, closeRealtime } from "../realtime/publisher";
import {
  createRealtimeRedisConnection,
  getRealtimeChannelKey,
  isRealtimeRedisEnabled,
} from "../realtime/redis";
import { OPS_BROADCAST_ROOM, rooms } from "../realtime/rooms";

/** Mantido para compatibilidade de imports; a fonte é `realtime/rooms`. */
export { OPS_BROADCAST_ROOM };

const STATS_INTERVAL_MS = 5 * 60 * 1000;
/** setTimeout aceita no máximo ~24,8 dias; o JWT dura 24h, mas protege. */
const MAX_TIMER_MS = 2 ** 31 - 1;

let adapterClients: Redis[] = [];
let statsTimer: NodeJS.Timeout | null = null;

function extractToken(socket: Socket): string | undefined {
  const fromAuth = socket.handshake.auth?.token as string | undefined;
  if (fromAuth) return fromAuth;
  const cookies = socket.handshake.headers?.cookie;
  if (!cookies) return undefined;
  const match = cookies.match(/(?:^|;\s*)xua-token=([^;]*)/);
  return match?.[1];
}

/**
 * Mesmas regras do authMiddleware HTTP: assinatura, blacklist (logout) e
 * token anterior à última troca de senha. Roda em `io.use`, antes de o socket
 * ser aceito — assim ele já nasce dentro das salas, sem janela em que um
 * evento chega a um socket conectado mas ainda sem sala.
 *
 * Aceita duas credenciais: o passe curto do socket em `auth.token` (produção,
 * site e API em domínios diferentes) ou o cookie de sessão (mesmo domínio,
 * como no dev). Com o passe, as regras valem para a SESSÃO que o emitiu.
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = extractToken(socket);
    if (!token) return next(new Error("UNAUTHORIZED"));

    const payload: JwtPayload = await verifyToken(token);
    if (!payload?.sub || !payload?.role) return next(new Error("UNAUTHORIZED"));

    const ticket = isSocketTicket(payload) ? payload : null;
    const session = ticket
      ? { jti: ticket.sid, iat: ticket.siat, exp: ticket.sexp }
      : { jti: payload.jti, iat: payload.iat, exp: payload.exp };

    // Passe de uso único: um passe vazado não abre uma segunda conexão.
    if (ticket && !(await consumeSocketTicket(ticket.jti, ticket.exp))) {
      return next(new Error("UNAUTHORIZED"));
    }
    if (session.jti && (await isBlacklisted(session.jti))) {
      return next(new Error("UNAUTHORIZED"));
    }
    if (await isTokenStale(payload.sub, session.iat)) {
      return next(new Error("UNAUTHORIZED"));
    }

    // Dados derivados do JWT verificado, nunca do cliente. A conexão vive até
    // o fim da SESSÃO, não do passe (que expira em 60 s).
    socket.data.userId = payload.sub;
    socket.data.role = payload.role;
    socket.data.exp = session.exp;
    if (payload.role === "distributor_admin" && payload.distributor_id) {
      socket.data.distributorId = payload.distributor_id;
    }
    next();
  } catch (err) {
    logger.debug({ err }, "Socket authentication failed");
    next(new Error("UNAUTHORIZED"));
  }
}

/** Salas a que o socket autenticado pertence. */
export function roomsForSocket(data: {
  userId: string;
  role: string;
  distributorId?: string;
}): string[] {
  const list = [rooms.user(data.role, data.userId)];
  // distributor_admin recebe os pedidos da empresa coletivamente.
  if (data.role === "distributor_admin" && data.distributorId) {
    list.push(rooms.distributor(data.distributorId));
  }
  // Ops e suporte enxergam o sistema inteiro: sala compartilhada, reservada a
  // eventos que exigem ação — não é espelho de tudo que acontece.
  if (data.role === "ops" || data.role === "support") {
    list.push(rooms.ops());
  }
  return list;
}

function onConnection(socket: Socket): void {
  socket.join(roomsForSocket(socket.data));

  // Sessão expirada não continua recebendo eventos. O cliente reconecta com o
  // cookie novo (ou cai no login, como nas requisições HTTP).
  let expiryTimer: NodeJS.Timeout | null = null;
  if (typeof socket.data.exp === "number") {
    const ms = socket.data.exp * 1000 - Date.now();
    expiryTimer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(ms, 0), MAX_TIMER_MS));
    expiryTimer.unref();
  }

  logger.debug({ userId: socket.data.userId, role: socket.data.role }, "Socket connected");

  socket.on("disconnect", () => {
    if (expiryTimer) clearTimeout(expiryTimer);
  });
}

/**
 * Cria e configura a instância Socket.IO no servidor HTTP.
 * Com o adapter Redis, um evento emitido em qualquer processo (outra
 * instância da API ou o worker, via redis-emitter) chega a todas as salas.
 */
export function createSocketGateway(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: getAllowedAppOrigins(),
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  if (isRealtimeRedisEnabled()) {
    const pub = createRealtimeRedisConnection("pub");
    const sub = createRealtimeRedisConnection("sub");
    adapterClients = [pub, sub];
    io.adapter(createAdapter(pub, sub, { key: getRealtimeChannelKey() }));
    logger.info({ key: getRealtimeChannelKey() }, "Socket.IO Redis adapter enabled");
  } else {
    logger.warn("Socket.IO Redis adapter disabled (REALTIME_REDIS_ADAPTER=off) — worker events will not reach clients");
  }

  io.use((socket, next) => {
    void authenticateSocket(socket, next);
  });
  io.on("connection", onConnection);

  attachRealtimeServer(io);

  statsTimer = setInterval(() => {
    logger.info({ connectedSockets: io.engine.clientsCount }, "Socket.IO stats");
  }, STATS_INTERVAL_MS);
  statsTimer.unref();

  logger.info("Socket.IO gateway initialized");
  return io;
}

/** Encerramento: para o timer de métricas e fecha as conexões do adapter. */
export async function closeSocketGateway(io: Server): Promise<void> {
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = null;
  io.close();
  await closeRealtime();
  await Promise.all(
    adapterClients.map((client) =>
      client.quit().catch((err: unknown) => logger.warn({ err }, "Failed to close realtime Redis connection"))
    )
  );
  adapterClients = [];
}
