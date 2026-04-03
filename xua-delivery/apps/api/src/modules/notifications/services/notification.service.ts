import webPush from "web-push";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger/index.js";

const logger = createLogger("notifications");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL = process.env.VAPID_EMAIL ?? "mailto:contato@xua.com.br";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

export const notificationService = {
  /** Upsert — evita duplicatas pelo endpoint. */
  async subscribe(
    consumerId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    }
  ) {
    const prisma = getPrisma();
    const existing = await prisma.consumerPushToken.findFirst({
      where: {
        consumer_id: consumerId,
        endpoint: subscription.endpoint,
      },
    });
    if (existing) return existing;

    return prisma.consumerPushToken.create({
      data: {
        consumer_id: consumerId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
      },
    });
  },

  /** Envia push notification ao consumidor. Auto-remove tokens expirados. */
  async send(
    userId: string,
    title: string,
    body: string,
    _data?: Record<string, string>
  ): Promise<{ sent: number; failed: number }> {
    const prisma = getPrisma();
    const tokens = await prisma.consumerPushToken.findMany({
      where: { consumer_id: userId },
    });

    if (tokens.length === 0) {
      logger.debug({ userId }, "Nenhum push token registrado");
      return { sent: 0, failed: 0 };
    }

    const payload = JSON.stringify({ title, body });

    const results = await Promise.allSettled(
      tokens.map((token) =>
        webPush
          .sendNotification(
            {
              endpoint: token.endpoint,
              keys: { p256dh: token.p256dh, auth: token.auth_key },
            },
            payload
          )
          .catch(async (err: { statusCode?: number }) => {
            // Remove tokens inválidos (410 Gone ou 404)
            if (err.statusCode === 410 || err.statusCode === 404) {
              await prisma.consumerPushToken.delete({
                where: { id: token.id },
              });
              logger.info(
                { tokenId: token.id },
                "Push token expirado removido"
              );
            }
            throw err;
          })
      )
    );

    return {
      sent: results.filter((r) => r.status === "fulfilled").length,
      failed: results.filter((r) => r.status === "rejected").length,
    };
  },

  /** Envia notificação para múltiplos consumidores. */
  async sendBulk(
    userIds: string[],
    title: string,
    body: string,
    _data?: Record<string, string>
  ): Promise<{ total: number; succeeded: number }> {
    const results = await Promise.allSettled(
      userIds.map((id) => notificationService.send(id, title, body))
    );
    return {
      total: userIds.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
    };
  },
};
