import type { Prisma } from "@prisma/client";
import { DeliveryDateStatus, type DeliveryWindow, UserSubscriptionStatus } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { orderService } from "../../orders/services/orders.service.js";
import { scheduleService } from "../../distributor/services/schedule.service.js";
import { userSubscriptionsRepository } from "../repository/user-subscriptions.repository.js";
import { createLogger } from "../../../infra/logger/index.js";

const log = createLogger("subscription-generation");

type TxClient = Prisma.TransactionClient;

export interface GenerationResult {
  processed: number;
  created: number;
  resent: number;
  rescheduled: number;
  skipped: number;
  failed: number;
}

/** Data de hoje (yyyy-mm-dd) e o respectivo Date em UTC-midnight, no fuso de São Paulo. */
function todayInSaoPaulo(): { iso: string; utc: Date } {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = iso.split("-").map(Number);
  return { iso, utc: new Date(Date.UTC(y, m - 1, d)) };
}

/**
 * Resolve a data de entrega do pedido. Se a entrega está com data no passado
 * (atraso de processamento), reagenda para a próxima data válida da agenda da
 * distribuidora — nunca gera pedido com data passada (ver D5 da arquitetura).
 */
async function resolveTargetDate(params: {
  deliveryDate: Date;
  distributorId: string;
  zoneId: string;
  window: string;
  todayIso: string;
}): Promise<{ dateIso: string; rescheduled: boolean }> {
  const originalIso = params.deliveryDate.toISOString().slice(0, 10);
  if (originalIso >= params.todayIso) {
    return { dateIso: originalIso, rescheduled: false };
  }

  // Entrega vencida: procura a próxima data válida para a janela do slot.
  const windowLower = params.window.toLowerCase();
  const availability = await scheduleService.getAvailableDates(
    params.distributorId,
    params.zoneId,
    30
  );
  const next = availability.find((a) =>
    windowLower === "morning" ? a.morning_available : a.afternoon_available
  );

  if (!next) {
    throw new Error("NO_VALID_RESCHEDULE_DATE");
  }

  return { dateIso: next.date, rescheduled: true };
}

/**
 * Gera, de forma atômica e idempotente, o pedido pré-pago de uma entrega de
 * assinatura. Toda a operação (criar pedido CONFIRMED + marcar entrega + debitar
 * saldo) ocorre numa única transação; o envio ao distribuidor é pós-commit e
 * idempotente. Reexecuções não duplicam (lock + guard order_id IS NULL).
 *
 * Retorna o `orderId` a enviar ao distribuidor no pós-commit, ou null se a
 * entrega já foi processada/travada por outro worker.
 */
async function generateOrderForDelivery(deliveryDateId: string): Promise<
  | { kind: "created"; orderId: string; rescheduled: boolean }
  | { kind: "skipped" }
> {
  const prisma = getPrisma();

  const { iso: todayIso } = todayInSaoPaulo();

  return prisma.$transaction(async (tx: TxClient) => {
    // Lock pessimista: garante exclusividade e idempotência sob concorrência.
    const locked = await userSubscriptionsRepository.lockDueDeliveryForUpdate(tx, deliveryDateId);
    if (!locked) return { kind: "skipped" as const };

    const delivery = await tx.subscriptionDeliveryDate.findUnique({
      where: { id: deliveryDateId },
      include: {
        time_slot: true,
        user_subscription: {
          include: { address: true, plan: { include: { product: true } } },
        },
      },
    });

    // Revalida elegibilidade sob lock (estado pode ter mudado).
    if (
      !delivery ||
      delivery.order_id ||
      delivery.status !== DeliveryDateStatus.PENDING ||
      delivery.user_subscription.status !== UserSubscriptionStatus.ACTIVE
    ) {
      return { kind: "skipped" as const };
    }

    const sub = delivery.user_subscription;
    const address = sub.address;
    const product = sub.plan.product;

    if (!address?.zone_id) {
      throw new Error("ADDRESS_WITHOUT_ZONE");
    }

    const { dateIso, rescheduled } = await resolveTargetDate({
      deliveryDate: delivery.delivery_date,
      distributorId: sub.distributor_id,
      zoneId: address.zone_id,
      window: delivery.time_slot.window,
      todayIso,
    });

    // Cria o pedido pré-pago já CONFIRMED dentro desta transação.
    const order = await orderService.createPrepaidOrderInTx(tx, {
      consumerId: sub.consumer_id,
      addressId: sub.address_id,
      distributorId: sub.distributor_id,
      zoneId: address.zone_id,
      deliveryDate: dateIso,
      deliveryWindow: delivery.time_slot.window as DeliveryWindow,
      distributorSelectionMode: "auto",
      timeSlotId: delivery.time_slot_id,
      bypassLeadTime: true,
      skipPaymentMethodValidation: true,
      items: [
        {
          product_id: product.id,
          product_name: product.name,
          unit_price_cents: 0, // já pago na assinatura
          quantity: delivery.quantity_for_this_delivery,
        },
      ],
    });

    // Marca a entrega (interino: DELIVERED na Fase 1 — vira ORDER_CREATED na Fase 2)
    // e vincula o pedido. Reagendamento atualiza a data efetiva.
    await tx.subscriptionDeliveryDate.update({
      where: { id: delivery.id },
      data: {
        status: DeliveryDateStatus.DELIVERED,
        order_id: order.id,
        ...(rescheduled ? { delivery_date: new Date(dateIso) } : {}),
      },
    });

    // Débito de saldo com guard e conclusão.
    if (sub.remaining_quantity > 0) {
      const updated = await tx.userSubscription.update({
        where: { id: sub.id },
        data: { remaining_quantity: { decrement: delivery.quantity_for_this_delivery } },
      });

      if (updated.remaining_quantity <= 0) {
        await tx.userSubscription.update({
          where: { id: sub.id },
          data: { status: UserSubscriptionStatus.COMPLETED },
        });
      }
    }

    if (rescheduled) {
      log.warn(
        { deliveryDateId: delivery.id, from: delivery.delivery_date, to: dateIso },
        "subscription-generation: entrega vencida reagendada para próxima data válida"
      );
    }

    return { kind: "created" as const, orderId: order.id, rescheduled };
  });
}

export const subscriptionGenerationService = {
  /**
   * Gera os pedidos das entregas elegíveis (data <= hoje, PENDING, assinatura
   * ACTIVE). `subscriptionId` opcional restringe a geração a uma assinatura
   * (geração direcionada por evento — Fase 2). Sempre roda a recuperação de
   * pedidos órfãos (CONFIRMED não enviados — D12).
   */
  async generateDueDeliveries(opts?: { subscriptionId?: string }): Promise<GenerationResult> {
    const result: GenerationResult = {
      processed: 0,
      created: 0,
      resent: 0,
      rescheduled: 0,
      skipped: 0,
      failed: 0,
    };

    const { utc: todayUtc } = todayInSaoPaulo();
    const due = await userSubscriptionsRepository.findDueDeliveries(todayUtc, opts?.subscriptionId);

    for (const delivery of due) {
      result.processed++;
      try {
        const outcome = await generateOrderForDelivery(delivery.id);
        if (outcome.kind === "skipped") {
          result.skipped++;
          continue;
        }

        result.created++;
        if (outcome.rescheduled) result.rescheduled++;

        // Pós-commit: envia ao distribuidor (idempotente). Falha aqui deixa o
        // pedido em CONFIRMED — recuperado pela varredura de órfãos abaixo.
        await orderService.sendToDistributor(outcome.orderId);
      } catch (err) {
        result.failed++;
        log.warn(
          { err, deliveryDateId: delivery.id, subscriptionId: delivery.user_subscription_id },
          "subscription-generation: falha ao gerar pedido da entrega"
        );
      }
    }

    // Recuperação de pedidos órfãos: criados mas presos em CONFIRMED por falha
    // no envio pós-commit. Reenvia sem criar novo pedido (ver D12).
    const orphans = await userSubscriptionsRepository.findOrphanConfirmedDeliveries(
      opts?.subscriptionId
    );
    for (const orphan of orphans) {
      if (!orphan.order_id) continue;
      try {
        await orderService.sendToDistributor(orphan.order_id);
        result.resent++;
      } catch (err) {
        result.failed++;
        log.warn(
          { err, deliveryDateId: orphan.id, orderId: orphan.order_id },
          "subscription-generation: falha ao reenviar pedido órfão"
        );
      }
    }

    return result;
  },
};
