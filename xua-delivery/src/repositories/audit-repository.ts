import type { Knex } from "knex";
import db from "@/src/lib/db";
import type { AuditEvent } from "@/src/types";
import type { AuditEventType, ActorType, SourceApp } from "@/src/types/enums";

const TABLE = "18_aud_audit_events";

interface EmitPayload {
  eventType: AuditEventType;
  actor: { type: ActorType; id: string };
  orderId?: string | null;
  sourceApp: SourceApp;
  payload?: Record<string, unknown>;
}

export const auditRepository = {
  /**
   * Append-only — NUNCA faz UPDATE ou DELETE (seção 2.4).
   * DEVE ser chamado dentro da mesma transação da mutação de estado.
   */
  async emit(data: EmitPayload, trx: Knex.Transaction): Promise<AuditEvent> {
    const [event] = await trx(TABLE)
      .insert({
        event_type: data.eventType,
        actor_type: data.actor.type,
        actor_id: data.actor.id,
        order_id: data.orderId || null,
        source_app: data.sourceApp,
        payload: data.payload ? JSON.stringify(data.payload) : "{}",
        occurred_at: new Date(),
      })
      .returning("*");
    return event;
  },

  /**
   * Busca eventos de auditoria por pedido — para timeline e suporte.
   */
  async findByOrder(
    orderId: string,
    trx?: Knex.Transaction
  ): Promise<AuditEvent[]> {
    return (trx || db)(TABLE)
      .where({ order_id: orderId })
      .orderBy("occurred_at", "asc");
  },

  /**
   * Busca eventos para cálculo de KPIs (seção 1 — KPIs Operacionais).
   * Filtro por distributor via JOIN com orders ou diretamente via payload.
   */
  async findByTypeAndPeriod(
    eventTypes: AuditEventType[],
    startDate: Date,
    endDate: Date,
    trx?: Knex.Transaction
  ): Promise<AuditEvent[]> {
    return (trx || db)(TABLE)
      .whereIn("event_type", eventTypes)
      .whereBetween("occurred_at", [startDate, endDate])
      .orderBy("occurred_at", "asc");
  },
};
