/**
 * Nomes das salas do Socket.IO. Única fonte: o gateway usa para entrar nas
 * salas e o publicador para emitir. Um nome divergente entre os dois faria o
 * evento sumir sem erro — por isso não se monta sala com template solto.
 */
export const rooms = {
  /** Sala individual por usuário (`consumer:<id>`, `driver:<id>`, ...). */
  user(role: string, userId: string): string {
    return `${role}:${userId}`;
  },
  consumer(consumerId: string): string {
    return `consumer:${consumerId}`;
  },
  driver(driverId: string): string {
    return `driver:${driverId}`;
  },
  /** Todos os administradores de uma distribuidora. */
  distributor(distributorId: string): string {
    return `distributor:${distributorId}`;
  },
  /** Ops e suporte: só eventos que exigem ação humana. */
  ops(): string {
    return OPS_BROADCAST_ROOM;
  },
} as const;

export const OPS_BROADCAST_ROOM = "ops:broadcast";
