import type { Prisma, PaymentWebhookEvent } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";

/**
 * Acesso a dados do módulo de pagamentos.
 *
 * Criado ao tirar as queries que estavam direto no payments.controller: o
 * controller do webhook conhecia o schema de três tabelas (userSubscription,
 * order, paymentWebhookEvent) e não havia como testá-lo sem banco.
 */
export const paymentsRepository = {
  /** Distribuidora dona da assinatura — usada para achar o webhook secret certo. */
  async findSubscriptionDistributorId(subscriptionId: string): Promise<string | null> {
    const subscription = await getPrisma().userSubscription.findUnique({
      where: { id: subscriptionId },
      select: { distributor_id: true },
    });
    return subscription?.distributor_id ?? null;
  },

  /** Distribuidora dona do pedido — idem, para pagamentos de pedido e caução. */
  async findOrderDistributorId(orderId: string): Promise<string | null> {
    const order = await getPrisma().order.findUnique({
      where: { id: orderId },
      select: { distributor_id: true },
    });
    return order?.distributor_id ?? null;
  },

  async findWebhookEvent(
    provider: string,
    providerEventRef: string
  ): Promise<PaymentWebhookEvent | null> {
    return getPrisma().paymentWebhookEvent.findUnique({
      where: {
        provider_provider_event_ref: { provider, provider_event_ref: providerEventRef },
      },
    });
  },

  async createWebhookEvent(
    data: Prisma.PaymentWebhookEventCreateInput
  ): Promise<PaymentWebhookEvent> {
    return getPrisma().paymentWebhookEvent.create({ data });
  },
};
