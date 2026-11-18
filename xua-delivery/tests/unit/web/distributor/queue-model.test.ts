import { describe, expect, it } from "vitest";
import { OrderStatus } from "@/src/types/enums";
import { STAGES, isInPreparation, isIncoming, isRedelivery } from "@/src/components/distributor/queue/queue-model";

describe("etapas da fila do distribuidor", () => {
  it("reentrega agendada aparece em Preparo, onde a distribuidora despacha de novo", () => {
    const order = { status: OrderStatus.REDELIVERY_SCHEDULED };

    expect(isInPreparation(order)).toBe(true);
    expect(isRedelivery(order)).toBe(true);
    expect(isIncoming(order)).toBe(false);
  });

  it("os demais status de preparo não são reentrega", () => {
    for (const status of [OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH]) {
      expect(isInPreparation({ status })).toBe(true);
      expect(isRedelivery({ status })).toBe(false);
    }
  });

  it("nenhum status ativo fica sem etapa (cada um cai em exatamente uma)", () => {
    const active = [
      OrderStatus.SENT_TO_DISTRIBUTOR,
      OrderStatus.ACCEPTED_BY_DISTRIBUTOR,
      OrderStatus.READY_FOR_DISPATCH,
      OrderStatus.REDELIVERY_SCHEDULED,
      OrderStatus.OUT_FOR_DELIVERY,
    ];
    for (const status of active) {
      const stages = STAGES.filter((stage) => (stage.statuses as readonly string[]).includes(status));
      expect(stages, status).toHaveLength(1);
    }
  });
});
