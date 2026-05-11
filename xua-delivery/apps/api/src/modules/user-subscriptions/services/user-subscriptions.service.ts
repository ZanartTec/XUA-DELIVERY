import { UserSubscriptionStatus, PaymentKind, PaymentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { getPrisma } from "../../../infra/prisma/client.js";
import { userSubscriptionsRepository } from "../repository/user-subscriptions.repository.js";
import { subscriptionPlansRepository } from "../../subscription-plans/repository/subscription-plans.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import { getPaymentGateway } from "../../payments/gateway/payments.gateway.js";

const log = createLogger("user-subscriptions");

type TxClient = Prisma.TransactionClient;

export class UserSubscriptionError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "UserSubscriptionError";
  }
}

export const userSubscriptionsService = {
  async listByConsumer(consumerId: string) {
    return userSubscriptionsRepository.findByConsumer(consumerId);
  },

  async getById(id: string, consumerId?: string) {
    const sub = await userSubscriptionsRepository.findById(id);
    if (!sub) throw new UserSubscriptionError("NOT_FOUND", "Assinatura não encontrada");
    if (consumerId && sub.consumer_id !== consumerId) {
      throw new UserSubscriptionError("FORBIDDEN", "Acesso negado");
    }
    return sub;
  },

  async create(data: {
    consumer_id: string;
    plan_id: string;
    distributor_id: string;
    address_id: string;
    delivery_dates: Array<{ date: string; time_slot_id: string; quantity: number }>;
  }) {
    const plan = await subscriptionPlansRepository.findById(data.plan_id);
    if (!plan || !plan.is_active) {
      throw new UserSubscriptionError("PLAN_INACTIVE", "Plano indisponível");
    }

    // Validate distributor is linked to this plan
    const planDistributor = plan.distributors.find(
      (d) => d.distributor_id === data.distributor_id
    );
    if (!planDistributor) {
      throw new UserSubscriptionError(
        "DISTRIBUTOR_NOT_IN_PLAN",
        "Distribuidora não disponível para este plano"
      );
    }

    // Validate total products assigned === plan.quantity
    const totalQuantity = data.delivery_dates.reduce((sum, d) => sum + (d.quantity ?? 1), 0);
    if (totalQuantity !== plan.quantity) {
      throw new UserSubscriptionError(
        "QUANTITY_MISMATCH",
        `A soma dos produtos por entrega deve ser exatamente ${plan.quantity}`
      );
    }

    // Validate all dates are within plan period
    const validFrom = plan.valid_from;
    const validUntil = plan.valid_until;
    for (const d of data.delivery_dates) {
      const date = new Date(d.date);
      if (date < validFrom || date > validUntil) {
        throw new UserSubscriptionError(
          "DATE_OUT_OF_RANGE",
          `Data ${d.date} está fora do período do plano`
        );
      }
    }

    const sortedDates = [...data.delivery_dates].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const startDate = new Date(sortedDates[0].date);
    const endDate = new Date(sortedDates[sortedDates.length - 1].date);
    const totalAmountCents = plan.unit_price_with_discount_cents * plan.quantity;

    const prisma = getPrisma();

    const result = await prisma.$transaction(async (tx: TxClient) => {
      // Create UserSubscription with PENDING_PAYMENT
      const subscription = await userSubscriptionsRepository.create(
        {
          consumer_id: data.consumer_id,
          plan_id: data.plan_id,
          distributor_id: data.distributor_id,
          address_id: data.address_id,
          total_quantity: totalQuantity,
          remaining_quantity: totalQuantity,
          start_date: startDate,
          end_date: endDate,
          status: UserSubscriptionStatus.PENDING_PAYMENT,
        },
        tx
      );

      // Create delivery date records
      await userSubscriptionsRepository.createDeliveryDates(
        sortedDates.map((d) => ({
          user_subscription_id: subscription.id,
          delivery_date: new Date(d.date),
          time_slot_id: d.time_slot_id,
          quantity_for_this_delivery: d.quantity ?? 1,
        })),
        tx
      );

      // Charge payment (auto-captured for subscription kind)
      const gateway = getPaymentGateway();
      const gatewayResult = await gateway.charge(totalAmountCents, {
        orderId: subscription.id,
        kind: PaymentKind.SUBSCRIPTION,
      });

      const paymentStatus =
        gatewayResult.status === "captured" ? PaymentStatus.CAPTURED : PaymentStatus.CREATED;

      await tx.payment.create({
        data: {
          user_subscription_id: subscription.id,
          kind: PaymentKind.SUBSCRIPTION,
          amount_cents: totalAmountCents,
          status: paymentStatus,
          external_id: gatewayResult.externalId,
        },
      });

      // If payment was immediately captured, activate subscription
      if (gatewayResult.status === "captured") {
        await userSubscriptionsRepository.updateStatus(
          subscription.id,
          UserSubscriptionStatus.ACTIVE,
          tx
        );
        return { ...subscription, status: UserSubscriptionStatus.ACTIVE };
      }

      return subscription;
    });

    log.info(
      { subscriptionId: result.id, consumerId: data.consumer_id },
      "UserSubscription created"
    );

    return userSubscriptionsRepository.findById(result.id);
  },

  async cancel(id: string, consumerId?: string) {
    const sub = await userSubscriptionsRepository.findById(id);
    if (!sub) throw new UserSubscriptionError("NOT_FOUND", "Assinatura não encontrada");
    if (consumerId && sub.consumer_id !== consumerId) {
      throw new UserSubscriptionError("FORBIDDEN", "Acesso negado");
    }
    if (
      sub.status === UserSubscriptionStatus.CANCELLED ||
      sub.status === UserSubscriptionStatus.COMPLETED
    ) {
      throw new UserSubscriptionError("INVALID_STATUS", "Assinatura já encerrada");
    }

    return userSubscriptionsRepository.updateStatus(id, UserSubscriptionStatus.CANCELLED);
  },

  async pause(id: string, consumerId?: string) {
    const sub = await userSubscriptionsRepository.findById(id);
    if (!sub) throw new UserSubscriptionError("NOT_FOUND", "Assinatura não encontrada");
    if (consumerId && sub.consumer_id !== consumerId) {
      throw new UserSubscriptionError("FORBIDDEN", "Acesso negado");
    }
    if (sub.status !== UserSubscriptionStatus.ACTIVE) {
      throw new UserSubscriptionError("INVALID_STATUS", "Somente assinaturas ativas podem ser pausadas");
    }

    return userSubscriptionsRepository.updateStatus(id, UserSubscriptionStatus.PAUSED);
  },

  async resume(id: string, consumerId?: string) {
    const sub = await userSubscriptionsRepository.findById(id);
    if (!sub) throw new UserSubscriptionError("NOT_FOUND", "Assinatura não encontrada");
    if (consumerId && sub.consumer_id !== consumerId) {
      throw new UserSubscriptionError("FORBIDDEN", "Acesso negado");
    }
    if (sub.status !== UserSubscriptionStatus.PAUSED) {
      throw new UserSubscriptionError("INVALID_STATUS", "Assinatura não está pausada");
    }

    return userSubscriptionsRepository.updateStatus(id, UserSubscriptionStatus.ACTIVE);
  },
};
