import { Prisma, DepositStatus, OrderStatus } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";
import type { Deposit } from "@/src/types";

type TxClient = Prisma.TransactionClient;
const DEPOSIT_AMOUNT_CENTS = 3000;

/**
 * DepositService — Caução de vasilhame.
 * Regra A (seção 2.4): held → refund_initiated somente quando
 * status = DELIVERED AND collected_empty_qty ≥ 1.
 * Validação NUNCA no frontend.
 */
export const depositService = {
  getDepositAmountCents(): number {
    return DEPOSIT_AMOUNT_CENTS;
  },

  async getPreview(
    consumerId: string,
    tx?: TxClient
  ): Promise<{ isFirstPurchase: boolean; depositAmountCents: number }> {
    const previousOrdersCount = await (tx ?? prisma).order.count({
      where: {
        consumer_id: consumerId,
        status: { not: OrderStatus.CANCELLED },
      },
    });

    return {
      isFirstPurchase: previousOrdersCount === 0,
      depositAmountCents: DEPOSIT_AMOUNT_CENTS,
    };
  },

  /** Retém caução na 1ª compra do consumidor */
  async holdDeposit(
    consumerId: string,
    orderId: string,
    amountCents: number,
    tx: TxClient,
    options?: { isFirstPurchase?: boolean }
  ): Promise<Deposit> {
    const deposit = await tx.deposit.create({
      data: {
        order_id: orderId,
        consumer_id: consumerId,
        amount_cents: amountCents,
        status: DepositStatus.HELD,
      },
    });

    await auditRepository.emit(
      {
        eventType: AuditEventType.DEPOSIT_HELD,
        actor: { type: ActorType.SYSTEM, id: "system" },
        orderId,
        sourceApp: SourceApp.BACKEND,
        payload: {
          amount_cents: amountCents,
          is_first_purchase: options?.isFirstPurchase ?? false,
        },
      },
      tx
    );

    return deposit;
  },

  /**
   * Regra A: libera caução quando DELIVERED + collected_empty_qty ≥ 1.
   * Chamado pelo OrderService após confirmação de entrega com troca.
   */
  async releaseDeposit(orderId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Verifica condições da Regra A
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          status: OrderStatus.DELIVERED,
          collected_empty_qty: { gte: 1 },
        },
      });

      if (!order) {
        return; // Condições não atendidas — não libera
      }

      const deposit = await tx.deposit.findFirst({
        where: { order_id: orderId, status: DepositStatus.HELD },
      });

      if (!deposit) {
        return; // Sem caução retida
      }

      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: DepositStatus.REFUND_INITIATED },
      });

      await auditRepository.emit(
        {
          eventType: AuditEventType.DEPOSIT_REFUND_INITIATED,
          actor: { type: ActorType.SYSTEM, id: "system" },
          orderId,
          sourceApp: SourceApp.BACKEND,
          payload: { deposit_id: deposit.id },
        },
        tx
      );
    });
  },
};
