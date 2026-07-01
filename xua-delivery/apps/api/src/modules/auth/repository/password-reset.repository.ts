import { prisma } from "../../../infra/prisma/client.js";

export const passwordResetRepository = {
  /**
   * Cria um novo token de reset (guarda apenas o hash HMAC).
   */
  async create(data: { consumer_id: string; token_hash: string; expires_at: Date }) {
    return prisma.passwordResetToken.create({ data });
  },

  /**
   * Busca token pelo hash (unique). Retorna null se não existir.
   */
  async findByHash(token_hash: string) {
    return prisma.passwordResetToken.findUnique({ where: { token_hash } });
  },

  /**
   * Invalida (marca como usados) todos os tokens ativos de um consumer.
   * Chamado antes de emitir um novo token, garantindo 1 token válido por vez.
   */
  async invalidateActiveForConsumer(consumer_id: string) {
    return prisma.passwordResetToken.updateMany({
      where: { consumer_id, used_at: null },
      data: { used_at: new Date() },
    });
  },
};
