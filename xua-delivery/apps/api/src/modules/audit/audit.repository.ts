import type { Prisma, AuditEvent, AuditEventType, ActorType, SourceApp } from "@prisma/client";
import { getPrisma } from "../../infra/prisma/client.js";

type TxClient = Prisma.TransactionClient;

interface EmitPayload {
  eventType: AuditEventType;
  actor: { type: ActorType; id: string };
  orderId?: string | null;
  sourceApp: SourceApp;
  payload?: Record<string, unknown>;
}

/**
 * AuditRepository — Auditoria append-only (seção 2.4).
 * NUNCA faz UPDATE ou DELETE.
 * DEVE ser chamado dentro da mesma transação da mutação de estado.
 */
export const auditRepository = {
  /**
   * Emite evento de auditoria.
   * Append-only — chamado dentro da mesma transação da mutação de estado.
   */
  async emit(data: EmitPayload, tx: TxClient): Promise<AuditEvent> {
    return tx.auditEvent.create({
      data: {
        event_type: data.eventType,
        actor_type: data.actor.type,
        actor_id: data.actor.id,
        order_id: data.orderId ?? null,
        source_app: data.sourceApp,
        payload: (data.payload ?? {}) as object,
        occurred_at: new Date(),
      },
    });
  },

  /**
   * Busca eventos de auditoria por pedido — para timeline e suporte.
   */
  async findByOrder(orderId: string, tx?: TxClient): Promise<AuditEvent[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).auditEvent.findMany({
      where: { order_id: orderId },
      orderBy: { occurred_at: "asc" },
    });
  },

  /**
   * Busca eventos para cálculo de KPIs (seção 1 — KPIs Operacionais).
   */
  async findByTypeAndPeriod(
    eventTypes: AuditEventType[],
    startDate: Date,
    endDate: Date,
    tx?: TxClient
  ): Promise<AuditEvent[]> {
    const prisma = getPrisma();
    return (tx ?? prisma).auditEvent.findMany({
      where: {
        event_type: { in: eventTypes },
        occurred_at: { gte: startDate, lte: endDate },
      },
      orderBy: { occurred_at: "asc" },
    });
  },
};
