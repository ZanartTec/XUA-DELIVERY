import webPush from "web-push";
import { prisma } from "@/src/lib/prisma";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL = process.env.VAPID_EMAIL ?? "mailto:contato@xua.com.br";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

export const notificationService = {
  async subscribe(consumerId: string, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    // Upsert — evita duplicatas pelo endpoint
    const existing = await prisma.consumerPushToken.findFirst({
      where: { consumer_id: consumerId, endpoint: subscription.endpoint },
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

  async send(consumerId: string, title: string, body: string) {
    const tokens = await prisma.consumerPushToken.findMany({
      where: { consumer_id: consumerId },
    });

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
          .catch(async (err) => {
            // Remove tokens inválidos (410 Gone ou 404)
            if (err.statusCode === 410 || err.statusCode === 404) {
              await prisma.consumerPushToken.delete({ where: { id: token.id } });
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

  async sendBatch(consumerIds: string[], title: string, body: string) {
    const results = await Promise.allSettled(
      consumerIds.map((id) => notificationService.send(id, title, body))
    );
    return {
      total: consumerIds.length,
      succeeded: results.filter((r) => r.status === "fulfilled").length,
    };
  },
};
