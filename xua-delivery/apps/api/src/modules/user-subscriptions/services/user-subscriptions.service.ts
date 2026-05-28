import type { Payment, Prisma } from "@prisma/client";
import { PaymentKind, PaymentStatus, UserSubscriptionStatus } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { userSubscriptionsRepository } from "../repository/user-subscriptions.repository.js";
import { subscriptionPlansRepository } from "../../subscription-plans/repository/subscription-plans.repository.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { timeslotRepository } from "../../distributor/repository/timeslot.repository.js";
import { distributorRepository } from "../../distributor/repository/distributor.repository.js";
import { createLogger } from "../../../infra/logger/index.js";
import {
  getConfiguredPaymentProvider,
  getPaymentGateway,
  type PaymentMethod,
} from "../../payments/gateway/payments.gateway.js";

const log = createLogger("user-subscriptions");

type TxClient = Prisma.TransactionClient;
type SubscriptionPaymentMethod = Extract<PaymentMethod, "pix" | "credit">;
type PaymentWithTransactions = Payment & {
  payment_method: string | null;
  transactions: Array<{ provider_response: Prisma.JsonValue }>;
};

export class UserSubscriptionError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "UserSubscriptionError";
  }
}

function daysAheadUntil(maxDate: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(maxDate);
  target.setHours(0, 0, 0, 0);
  return Math.max(1, Math.ceil((target.getTime() - today.getTime()) / 86400000) + 1);
}

function toPaymentStatus(status: string): PaymentStatus {
  switch (status) {
    case "captured":
      return PaymentStatus.CAPTURED;
    case "authorized":
      return PaymentStatus.AUTHORIZED;
    case "failed":
      return PaymentStatus.FAILED;
    default:
      return PaymentStatus.CREATED;
  }
}

function extractRedirectUrl(transactions: { provider_response: Prisma.JsonValue }[]): string | null {
  for (const transaction of transactions) {
    const response = transaction.provider_response;
    if (response && typeof response === "object" && !Array.isArray(response)) {
      const { redirectUrl } = response as Record<string, unknown>;
      if (typeof redirectUrl === "string" && redirectUrl.length > 0) return redirectUrl;
    }
  }

  return null;
}

function isSubscriptionPaymentMethod(
  value: string | null | undefined
): value is SubscriptionPaymentMethod {
  return value === "pix" || value === "credit";
}

async function persistSubscriptionPayment(
  tx: TxClient,
  params: {
    subscriptionId: string;
    consumerEmail?: string | null;
    product: { id: string; name: string };
    totalAmountCents: number;
    quantity: number;
    paymentMethod: SubscriptionPaymentMethod;
    existingPaymentId?: string;
  }
): Promise<{
  payment: Payment;
  redirectUrl: string | null;
  preferenceId: string;
  status: PaymentStatus;
}> {
  const provider = getConfiguredPaymentProvider();
  const idempotencyKey = `mp-subscription-checkout:${params.subscriptionId}:${params.paymentMethod}`;
  const gateway = getPaymentGateway();
  const gatewayResult = await gateway.charge(params.totalAmountCents, {
    orderId: params.subscriptionId,
    kind: PaymentKind.SUBSCRIPTION,
    idempotencyKey,
    paymentMethod: params.paymentMethod,
    payerEmail: params.consumerEmail,
    description: `Assinatura Xuá #${params.subscriptionId.slice(0, 8)}`,
    items: [
      {
        id: params.product.id,
        title: params.product.name,
        quantity: params.quantity,
        unitPriceCents: Math.round(params.totalAmountCents / params.quantity),
      },
    ],
  });

  if (!gatewayResult.redirectUrl && gatewayResult.status !== "captured") {
    throw new UserSubscriptionError(
      "PROVIDER_REDIRECT_MISSING",
      "Gateway não retornou URL de pagamento"
    );
  }

  const status = toPaymentStatus(gatewayResult.status);
  const paymentData = {
    user_subscription_id: params.subscriptionId,
    kind: PaymentKind.SUBSCRIPTION,
    amount_cents: params.totalAmountCents,
    status,
    provider,
    provider_payment_ref: gatewayResult.providerPaymentRef ?? gatewayResult.externalId,
    external_id: gatewayResult.externalId,
    idempotency_key: idempotencyKey,
    payment_method: params.paymentMethod,
  };

  const payment = params.existingPaymentId
    ? await tx.payment.update({
        where: { id: params.existingPaymentId },
        data: paymentData as Prisma.PaymentUncheckedUpdateInput,
      })
    : await tx.payment.create({ data: paymentData as Prisma.PaymentUncheckedCreateInput });

  await tx.paymentTransaction.create({
    data: {
      payment_id: payment.id,
      action: "checkout_preference_created",
      provider_status: gatewayResult.status,
      provider_response: {
        externalId: gatewayResult.externalId,
        providerPaymentRef: gatewayResult.providerPaymentRef,
        redirectUrl: gatewayResult.redirectUrl,
        raw: gatewayResult.raw,
      } as Prisma.InputJsonObject,
      idempotency_key: idempotencyKey,
    },
  });

  return {
    payment,
    redirectUrl: gatewayResult.redirectUrl ?? null,
    preferenceId: gatewayResult.externalId,
    status,
  };
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
    payment_method: SubscriptionPaymentMethod;
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

    const prisma = getPrisma();
    const consumer = await prisma.consumer.findUnique({
      where: { id: data.consumer_id },
      select: { email: true },
    });
    const address = await prisma.address.findUnique({
      where: { id: data.address_id },
      select: { consumer_id: true, zone_id: true },
    });
    if (!address || address.consumer_id !== data.consumer_id) {
      throw new UserSubscriptionError("ADDRESS_NOT_FOUND", "Endereço não encontrado");
    }
    if (!address.zone_id) {
      throw new UserSubscriptionError(
        "ADDRESS_WITHOUT_ZONE",
        "Endereço sem zona de entrega vinculada"
      );
    }

    const scheduleZoneId = await distributorRepository.resolveCoveredZone(
      data.distributor_id,
      address.zone_id
    );
    if (!scheduleZoneId) {
      throw new UserSubscriptionError(
        "DISTRIBUTOR_NOT_COVERING_ZONE",
        "Distribuidora selecionada não atende o endereço informado"
      );
    }

    const activeSlots = await timeslotRepository.findActiveByDistributor(data.distributor_id);
    const slotsById = new Map(activeSlots.map((slot) => [slot.id, slot]));
    const maxDeliveryDate = data.delivery_dates.reduce((max, item) => {
      const current = new Date(item.date);
      return current > max ? current : max;
    }, new Date(data.delivery_dates[0].date));
    const availability = await scheduleService.getAvailableDates(
      data.distributor_id,
      scheduleZoneId,
      daysAheadUntil(maxDeliveryDate)
    );
    const availabilityByDate = new Map(availability.map((item) => [item.date, item]));

    for (const deliveryDate of data.delivery_dates) {
      const slot = slotsById.get(deliveryDate.time_slot_id);
      if (!slot) {
        throw new UserSubscriptionError(
          "TIME_SLOT_UNAVAILABLE",
          "Horário selecionado não está disponível para a distribuidora"
        );
      }

      try {
        await scheduleService.validateDeliveryDate(
          data.distributor_id,
          deliveryDate.date,
          slot.window
        );
      } catch (err) {
        throw new UserSubscriptionError(
          "DATE_UNAVAILABLE",
          err instanceof Error ? err.message : "Data indisponível para entrega"
        );
      }

      const dateAvailability = availabilityByDate.get(deliveryDate.date);
      const slotWindow = slot.window.toLowerCase();
      const windowAvailable =
        slotWindow === "morning"
          ? dateAvailability?.morning_available === true
          : dateAvailability?.afternoon_available === true;

      if (!windowAvailable) {
        throw new UserSubscriptionError(
          "DATE_UNAVAILABLE",
          "Data ou horário indisponível para este distribuidor"
        );
      }
    }

    const sortedDates = [...data.delivery_dates].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const startDate = new Date(sortedDates[0].date);
    const endDate = new Date(sortedDates[sortedDates.length - 1].date);
    const totalAmountCents = plan.unit_price_with_discount_cents * plan.quantity;

    const result = await prisma.$transaction(async (tx: TxClient) => {
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

      await userSubscriptionsRepository.createDeliveryDates(
        sortedDates.map((d) => ({
          user_subscription_id: subscription.id,
          delivery_date: new Date(d.date),
          time_slot_id: d.time_slot_id,
          quantity_for_this_delivery: d.quantity ?? 1,
        })),
        tx
      );

      const paymentResult = await persistSubscriptionPayment(tx, {
        subscriptionId: subscription.id,
        consumerEmail: consumer?.email,
        product: plan.product,
        totalAmountCents,
        quantity: plan.quantity,
        paymentMethod: data.payment_method,
      });

      if (paymentResult.status === PaymentStatus.CAPTURED) {
        await userSubscriptionsRepository.updateStatus(
          subscription.id,
          UserSubscriptionStatus.ACTIVE,
          tx
        );
      }

      return { subscriptionId: subscription.id, ...paymentResult };
    });

    log.info(
      { subscriptionId: result.subscriptionId, consumerId: data.consumer_id },
      "UserSubscription created"
    );

    return {
      subscription: await userSubscriptionsRepository.findById(result.subscriptionId),
      payment: result.payment,
      redirectUrl: result.redirectUrl,
      preferenceId: result.preferenceId,
      status: result.status,
    };
  },

  async resumePayment(
    id: string,
    consumerId: string,
    requestedPaymentMethod?: SubscriptionPaymentMethod
  ) {
    const sub = await userSubscriptionsRepository.findByIdWithConsumer(id);
    if (!sub) throw new UserSubscriptionError("NOT_FOUND", "Assinatura não encontrada");
    if (sub.consumer_id !== consumerId) {
      throw new UserSubscriptionError("FORBIDDEN", "Acesso negado");
    }
    if (sub.status !== UserSubscriptionStatus.PENDING_PAYMENT) {
      throw new UserSubscriptionError(
        "INVALID_STATUS",
        "Assinatura não está aguardando pagamento"
      );
    }

    const prisma = getPrisma();
    const existing = await prisma.payment.findFirst({
      where: {
        user_subscription_id: id,
        kind: PaymentKind.SUBSCRIPTION,
        status: { in: [PaymentStatus.CREATED, PaymentStatus.AUTHORIZED] },
      },
      orderBy: { created_at: "desc" },
      include: { transactions: { orderBy: { created_at: "desc" }, take: 5 } },
    }) as PaymentWithTransactions | null;

    if (existing?.external_id) {
      const redirectUrl = extractRedirectUrl(existing.transactions);
      if (redirectUrl) {
        return {
          subscription: sub,
          payment: existing,
          redirectUrl,
          preferenceId: existing.external_id,
          status: existing.status,
        };
      }
    }

    const paymentMethod = requestedPaymentMethod
      ?? (isSubscriptionPaymentMethod(existing?.payment_method) ? existing.payment_method : undefined)
      ?? (isSubscriptionPaymentMethod(sub.payments[0]?.payment_method)
        ? sub.payments[0].payment_method
        : undefined);

    if (!paymentMethod) {
      throw new UserSubscriptionError(
        "PAYMENT_METHOD_REQUIRED",
        "Informe a forma de pagamento para continuar"
      );
    }

    const totalAmountCents = existing?.amount_cents && existing.amount_cents > 0
      ? existing.amount_cents
      : sub.plan.unit_price_with_discount_cents * sub.total_quantity;

    const result = await prisma.$transaction(async (tx: TxClient) => {
      const paymentResult = await persistSubscriptionPayment(tx, {
        subscriptionId: sub.id,
        consumerEmail: sub.consumer.email,
        product: sub.plan.product,
        totalAmountCents,
        quantity: sub.total_quantity,
        paymentMethod,
        existingPaymentId: existing?.id,
      });

      if (paymentResult.status === PaymentStatus.CAPTURED) {
        await userSubscriptionsRepository.updateStatus(
          sub.id,
          UserSubscriptionStatus.ACTIVE,
          tx
        );
      }

      return paymentResult;
    });

    return {
      subscription: await userSubscriptionsRepository.findById(sub.id),
      payment: result.payment,
      redirectUrl: result.redirectUrl,
      preferenceId: result.preferenceId,
      status: result.status,
    };
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
