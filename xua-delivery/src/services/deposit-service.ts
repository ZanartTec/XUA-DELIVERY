import type { Knex } from "knex";
import db from "@/src/lib/db";
import { auditRepository } from "@/src/repositories/audit-repository";
import { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";
import type { Deposit } from "@/src/types";

const TABLE = "15_trn_deposits";

/**
 * DepositService — Caução de vasilhame.
 * Regra A (seção 2.4): held → refund_initiated somente quando
 * status = DELIVERED AND collected_empty_qty ≥ 1.
 * Validação NUNCA no frontend.
 */
export const depositService = {
  /** Retém caução na 1ª compra do consumidor */
  async holdDeposit(
    orderId: string,
    consumerId: string,
    amountCents: number,
    trx: Knex.Transaction
  ): Promise<Deposit> {
    const [deposit] = await trx(TABLE)
      .insert({
        order_id: orderId,
        consumer_id: consumerId,
        amount_cents: amountCents,
        status: "held",
      })
      .returning("*");

    await auditRepository.emit(
      {
        eventType: AuditEventType.DEPOSIT_HELD,
        actor: { type: ActorType.SYSTEM, id: "system" },
        orderId,
        sourceApp: SourceApp.BACKEND,
        payload: { amount_cents: amountCents },
      },
      trx
    );

    return deposit;
  },

  /**
   * Regra A: libera caução quando DELIVERED + collected_empty_qty ≥ 1.
   * Chamado pelo OrderService após confirmação de entrega com troca.
   */
  async releaseDeposit(orderId: string): Promise<void> {
    await db.transaction(async (trx) => {
      // Verifica condições da Regra A
      const order = await trx("09_trn_orders")
        .where({ id: orderId, status: "DELIVERED" })
        .where("collected_empty_qty", ">=", 1)
        .first();

      if (!order) {
        return; // Condições não atendidas — não libera
      }

      const deposit = await trx(TABLE)
        .where({ order_id: orderId, status: "held" })
        .first();

      if (!deposit) {
        return; // Sem caução retida
      }

      await trx(TABLE)
        .where({ id: deposit.id })
        .update({ status: "refund_initiated", updated_at: new Date() });

      await auditRepository.emit(
        {
          eventType: AuditEventType.DEPOSIT_REFUND_INITIATED,
          actor: { type: ActorType.SYSTEM, id: "system" },
          orderId,
          sourceApp: SourceApp.BACKEND,
          payload: { deposit_id: deposit.id },
        },
        trx
      );
    });
  },
};
