import type { Prisma, SalesReceipt } from "@prisma/client";
import { ActorType, AuditEventType, OrderStatus, SourceApp } from "@xua/shared/enums";
import { getPrisma } from "../../../infra/prisma/client.js";
import { createLogger } from "../../../infra/logger/index.js";
import { auditRepository } from "../../audit/audit.repository.js";
import { receiptRepository } from "../repository/receipt.repository.js";
import { OrderServiceError } from "../errors.js";
import {
  RECEIPT_SNAPSHOT_VERSION,
  type ReceiptSnapshot,
} from "../receipt-pdf/receipt-snapshot.js";
import type { RenderableReceipt } from "../receipt-pdf/render-receipt.js";

export type PrintableReceipt = RenderableReceipt & { order_id: string };

type TxClient = Prisma.TransactionClient;

const log = createLogger("receipt");

export type ReceiptActor = { type: ActorType; id: string; sourceApp: SourceApp };

/** Ator da auditoria de emissão/impressão a partir do papel do usuário autenticado. */
export function receiptActorFromRole(userId: string, role: string): ReceiptActor {
  switch (role) {
    case "distributor_admin":
      return { type: ActorType.DISTRIBUTOR_USER, id: userId, sourceApp: SourceApp.DISTRIBUTOR_WEB };
    case "driver":
      return { type: ActorType.DRIVER, id: userId, sourceApp: SourceApp.DRIVER_WEB };
    case "ops":
      return { type: ActorType.OPS, id: userId, sourceApp: SourceApp.OPS_CONSOLE };
    default:
      return { type: ActorType.SUPPORT, id: userId, sourceApp: SourceApp.OPS_CONSOLE };
  }
}

/**
 * Status a partir dos quais o comprovante pode ser emitido manualmente.
 * A emissão automática acontece no despacho (OUT_FOR_DELIVERY).
 */
export const RECEIPT_ISSUABLE_STATUSES = new Set<string>([
  OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
  OrderStatus.PICKING,
  OrderStatus.READY_FOR_DISPATCH,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
  OrderStatus.DELIVERY_FAILED,
  OrderStatus.REDELIVERY_SCHEDULED,
]);

type SnapshotSource = NonNullable<Awaited<ReturnType<typeof receiptRepository.findOrderForSnapshot>>>;

/** Monta o snapshot imutável a partir do estado atual do pedido. Função pura. */
export function buildReceiptSnapshot(order: SnapshotSource): ReceiptSnapshot {
  const { distributor, consumer, address } = order;
  const payment = order.payments[0] ?? null;

  return {
    version: RECEIPT_SNAPSHOT_VERSION,
    issuer: {
      legal_name: distributor.legal_name || distributor.name,
      trade_name: distributor.trade_name ?? null,
      cnpj: distributor.cnpj,
      state_registration: distributor.state_registration ?? null,
      phone: distributor.phone,
      email: distributor.email,
      address: {
        street: distributor.street ?? null,
        number: distributor.number ?? null,
        complement: distributor.complement ?? null,
        neighborhood: distributor.neighborhood ?? null,
        city: distributor.city ?? null,
        state: distributor.state ?? null,
        zip_code: distributor.zip_code ?? null,
      },
    },
    customer: {
      name: consumer.name,
      document: consumer.document ?? null,
      phone: consumer.phone ?? null,
      address: {
        street: address.street,
        number: address.number,
        complement: address.complement ?? null,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
        zip_code: address.zip_code,
      },
      delivery_instructions: order.delivery_instructions ?? null,
    },
    order: {
      id: order.id,
      short_id: order.id.slice(0, 8).toUpperCase(),
      created_at: order.created_at.toISOString(),
      delivery_date: order.delivery_date.toISOString(),
      delivery_window: order.delivery_window,
      scheduled_time_label: order.scheduled_time_label ?? null,
      driver_name: order.driver_name,
    },
    items: order.items.map((item) => ({
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      subtotal_cents: item.subtotal_cents,
    })),
    totals: {
      subtotal_cents: order.subtotal_cents,
      total_cents: order.total_cents,
    },
    payment: {
      method: payment?.payment_method ?? null,
      cash_change_for_cents: payment?.cash_change_for_cents ?? null,
    },
    bottles: {
      full_ordered: order.bottles_full_ordered,
      empty_provided: order.empty_bottles_provided,
      sold: order.bottles_sold,
      loaned: order.bottles_loaned,
    },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

/**
 * receiptService — emissão do comprovante de venda e entrega (SEM valor fiscal).
 * Um comprovante por pedido, numerado na sequência da distribuidora.
 */
export const receiptService = {
  /**
   * Emite dentro de uma transação existente (ex.: a do despacho). Idempotente:
   * se o pedido já tem comprovante, devolve o existente sem consumir número —
   * cobre a reentrega, que despacha o mesmo pedido de novo.
   */
  async issueInTx(
    orderId: string,
    actor: ReceiptActor,
    tx: TxClient
  ): Promise<{ receipt: SalesReceipt; created: boolean }> {
    const existing = await receiptRepository.findByOrderId(orderId, tx);
    if (existing) return { receipt: existing, created: false };

    const order = await receiptRepository.findOrderForSnapshot(orderId, tx);
    if (!order) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");

    const snapshot = buildReceiptSnapshot(order);
    const number = await receiptRepository.reserveNextNumber(order.distributor_id, tx);

    const receipt = await receiptRepository.create(
      {
        order_id: orderId,
        distributor_id: order.distributor_id,
        number,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        snapshot_version: RECEIPT_SNAPSHOT_VERSION,
        issued_by_actor_type: actor.type,
        issued_by_actor_id: actor.id,
      },
      tx
    );

    await auditRepository.emit(
      {
        eventType: AuditEventType.RECEIPT_ISSUED,
        actor: { type: actor.type, id: actor.id },
        orderId,
        sourceApp: actor.sourceApp,
        payload: { receipt_id: receipt.id, number },
      },
      tx
    );

    return { receipt, created: true };
  },

  /**
   * Emissão manual (botão "Gerar comprovante"). A posse do pedido já foi
   * validada pelo controller; aqui valida só o status.
   */
  async issue(orderId: string, actor: ReceiptActor): Promise<{ receipt: SalesReceipt; created: boolean }> {
    const prisma = getPrisma();
    try {
      return await prisma.$transaction(async (tx: TxClient) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
        if (!order) throw new OrderServiceError("ORDER_NOT_FOUND", "Pedido não encontrado");
        if (!RECEIPT_ISSUABLE_STATUSES.has(order.status)) {
          throw new OrderServiceError(
            "INVALID_STATUS",
            "O comprovante só pode ser emitido depois que o pedido for aceito"
          );
        }
        return receiptService.issueInTx(orderId, actor, tx);
      });
    } catch (error) {
      // Duas emissões simultâneas do mesmo pedido: a perdedora bate na unique
      // de order_id (e tem o número revertido junto). Devolve a vencedora.
      if (isUniqueViolation(error)) {
        const existing = await receiptRepository.findByOrderId(orderId);
        if (existing) return { receipt: existing, created: false };
      }
      throw error;
    }
  },

  /**
   * Carrega comprovantes para impressão e registra a impressão (contador +
   * auditoria). `print_count` lido ANTES do incremento decide a "2ª via".
   */
  async loadForPrint(orderIds: string[], actor: ReceiptActor, format: string): Promise<PrintableReceipt[]> {
    const prisma = getPrisma();
    return prisma.$transaction(async (tx: TxClient) => {
      const receipts = await receiptRepository.findForPrint(orderIds, tx);
      if (receipts.length === 0) return [];

      await receiptRepository.registerPrints(
        receipts.map((receipt) => receipt.id),
        tx
      );

      for (const receipt of receipts) {
        await auditRepository.emit(
          {
            eventType: AuditEventType.RECEIPT_PRINTED,
            actor: { type: actor.type, id: actor.id },
            orderId: receipt.order_id,
            sourceApp: actor.sourceApp,
            payload: {
              receipt_id: receipt.id,
              number: receipt.number,
              format,
              copy: receipt.print_count > 0 ? "2a" : "1a",
            },
          },
          tx
        );
      }

      log.info({ count: receipts.length, format, actorId: actor.id }, "Receipts printed");

      return receipts.map((receipt) => {
        const payment = receipt.order.payments[0] ?? null;
        return {
          order_id: receipt.order_id,
          number: receipt.number,
          snapshot: receipt.snapshot as unknown as ReceiptSnapshot,
          issued_at: receipt.issued_at,
          is_copy: receipt.print_count > 0,
          is_cancelled: receipt.order.status === OrderStatus.CANCELLED,
          payment_status: payment?.status ?? null,
        };
      });
    });
  },
};
