import { logger } from "../../infra/logger/index.js";

/**
 * NotificationService — Stub para PR 09 (Notificações Push).
 * Por agora: loga mas não envia push real.
 */
export const notificationService = {
  /**
   * Envia push notification ao consumidor.
   * @param userId ID do usuário
   * @param title Título da notificação
   * @param body Corpo da notificação
   * @param data Dados adicionais (opcional)
   */
  async send(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    logger.info(
      { userId, title, body, data },
      "[STUB] notificationService.send() — push real implementado no PR 09"
    );
    // Em produção, deve:
    // 1. Buscar push tokens do usuário em consumer_push_tokens
    // 2. Enviar via web-push (VAPID)
    // 3. Registrar em audit
  },

  /**
   * Envia notificação para múltiplos usuários.
   */
  async sendBulk(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<void> {
    logger.info(
      { userIds, title, body, data },
      "[STUB] notificationService.sendBulk() — push real implementado no PR 09"
    );
  },
};
