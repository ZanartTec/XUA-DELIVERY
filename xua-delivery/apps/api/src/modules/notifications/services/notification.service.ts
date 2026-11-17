import webPush from "web-push";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger/index.js";

const logger = createLogger("notifications");

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL = process.env.VAPID_EMAIL ?? "mailto:contato@xua.com.br";

const vapidConfigured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
if (vapidConfigured) {
  webPush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

/** Conteúdo entregue ao service worker (`public/sw.js`). */
export interface PushMessage {
  title: string;
  body: string;
  /** Tela aberta ao tocar. */
  url?: string;
  /** Agrupa notificações do mesmo assunto (ex.: `order-<id>`). */
  tag?: string;
  /** Tipo (ex.: `new_order`): o SW usa para pedir interação. */
  kind?: string;
  /** Sem som/vibração. */
  silent?: boolean;
}

export interface PushSendOptions {
  ttlSeconds?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

export interface PushSendResult {
  sent: number;
  failed: number;
  /** Tokens apagados por 404/410 (navegador desinscrito). */
  removed: number;
  /** Falhas que valem nova tentativa (5xx, 429, rede). */
  retryable: number;
}

const EMPTY_RESULT: PushSendResult = { sent: 0, failed: 0, removed: 0, retryable: 0 };

function isGone(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410;
}

function isRetryable(statusCode: number | undefined): boolean {
  // Sem statusCode = erro de rede/timeout.
  return statusCode === undefined || statusCode === 429 || statusCode >= 500;
}

export const notificationService = {
  isConfigured(): boolean {
    return vapidConfigured;
  },

  /**
   * Upsert POR ENDPOINT: o mesmo navegador nunca fica com dois donos. Se outra
   * pessoa logar nele e ativar notificações, o token passa a ser dela e o
   * usuário anterior para de receber ali.
   */
  async subscribe(
    consumerId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
    userAgent?: string | null
  ) {
    const prisma = getPrisma();
    const data = {
      consumer_id: consumerId,
      p256dh: subscription.keys.p256dh,
      auth_key: subscription.keys.auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
    };
    return prisma.consumerPushToken.upsert({
      where: { endpoint: subscription.endpoint },
      create: { endpoint: subscription.endpoint, ...data },
      update: data,
    });
  },

  /** Remove o token deste navegador, só se for do próprio usuário. */
  async unsubscribe(consumerId: string, endpoint: string): Promise<number> {
    const prisma = getPrisma();
    const { count } = await prisma.consumerPushToken.deleteMany({
      where: { endpoint, consumer_id: consumerId },
    });
    return count;
  },

  /** Admins ativos de uma distribuidora (destino `kind: "distributor"`). */
  async resolveDistributorRecipients(distributorId: string): Promise<string[]> {
    const prisma = getPrisma();
    const admins = await prisma.consumer.findMany({
      where: { distributor_id: distributorId, role: "DISTRIBUTOR_ADMIN", is_active: true },
      select: { id: true },
    });
    return admins.map((admin) => admin.id);
  },

  /**
   * Envia a todos os navegadores dos usuários. Usado pelo processor da fila
   * `notifications`; as regras de negócio enfileiram via `pushDispatcher`.
   */
  async sendToUsers(
    userIds: readonly string[],
    message: PushMessage,
    options: PushSendOptions = {}
  ): Promise<PushSendResult> {
    if (userIds.length === 0) return { ...EMPTY_RESULT };
    if (!vapidConfigured) {
      logger.warn({ users: userIds.length }, "VAPID não configurado: push ignorado");
      return { ...EMPTY_RESULT };
    }

    const prisma = getPrisma();
    const tokens = await prisma.consumerPushToken.findMany({
      where: { consumer_id: { in: [...userIds] } },
    });
    if (tokens.length === 0) {
      logger.debug({ users: userIds.length }, "Nenhum push token registrado");
      return { ...EMPTY_RESULT };
    }

    const payload = JSON.stringify(message);
    const result: PushSendResult = { ...EMPTY_RESULT };
    const succeededIds: string[] = [];

    await Promise.all(
      tokens.map(async (token) => {
        try {
          await webPush.sendNotification(
            { endpoint: token.endpoint, keys: { p256dh: token.p256dh, auth: token.auth_key } },
            payload,
            { TTL: options.ttlSeconds ?? 6 * 60 * 60, urgency: options.urgency ?? "normal" }
          );
          result.sent++;
          succeededIds.push(token.id);
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          result.failed++;
          if (isGone(statusCode)) {
            await prisma.consumerPushToken.deleteMany({ where: { id: token.id } });
            result.removed++;
            logger.info({ tokenId: token.id, statusCode }, "Push token expirado removido");
          } else if (isRetryable(statusCode)) {
            result.retryable++;
            logger.warn({ tokenId: token.id, statusCode, err }, "Falha temporária no push");
          } else {
            logger.warn({ tokenId: token.id, statusCode, err }, "Push recusado");
          }
        }
      })
    );

    if (succeededIds.length > 0) {
      await prisma.consumerPushToken
        .updateMany({ where: { id: { in: succeededIds } }, data: { last_success_at: new Date() } })
        .catch((err) => logger.warn({ err }, "Falha ao registrar last_success_at"));
    }

    return result;
  },
};
