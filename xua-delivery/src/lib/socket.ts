import type { Server } from "socket.io";

/**
 * Retorna a instância do Socket.io exportada pelo custom server (server.ts).
 * Usado pelos Services para emitir eventos após commit da transação.
 */
export function getIO(): Server {
  const io = (globalThis as Record<string, unknown>).__io as Server | undefined;
  if (!io) {
    throw new Error(
      "Socket.io não inicializado. Certifique-se de rodar via server.ts."
    );
  }
  return io;
}
