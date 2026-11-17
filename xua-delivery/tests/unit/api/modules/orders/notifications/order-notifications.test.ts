import { describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@xua/shared/enums";

vi.mock("@api/infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { pushIntentsForTransition, subscriptionSummaryIntent, orderNotifications } = await import(
  "@api/modules/orders/notifications/order-notifications.js"
);
const { pushDispatcher } = await import("@api/modules/notifications/services/push-dispatcher.js");

const order = {
  id: "abcdef12-0000-4000-a000-000000000001",
  consumer_id: "consumer-1",
  distributor_id: "dist-1",
  driver_id: "driver-1",
  delivery_date: new Date("2026-11-22T00:00:00.000Z"),
};

describe("pushIntentsForTransition", () => {
  it("novo pedido sem detalhes ainda gera texto útil", () => {
    const [intent] = pushIntentsForTransition(order, OrderStatus.CONFIRMED, OrderStatus.SENT_TO_DISTRIBUTOR);
    expect(intent).toMatchObject({
      title: "Novo pedido",
      body: "Toque para ver o pedido.",
      urgency: "high",
      tag: `order-${order.id}`,
      url: `/distributor/orders/${order.id}`,
    });
  });

  it("1 item no singular", () => {
    const [intent] = pushIntentsForTransition(order, OrderStatus.CONFIRMED, OrderStatus.SENT_TO_DISTRIBUTOR, {
      newOrder: { orderId: order.id, status: OrderStatus.SENT_TO_DISTRIBUTOR, itemsCount: 1, origin: "avulso" },
    });
    expect(intent.body).toBe("1 item");
  });

  it("reentrega mostra a nova data", () => {
    const [intent] = pushIntentsForTransition(order, OrderStatus.DELIVERY_FAILED, OrderStatus.REDELIVERY_SCHEDULED);
    expect(intent.body).toBe("Nova data de entrega: 22/11.");
    expect(intent.url).toBe(`/orders/${order.id}`);
  });

  it("cancelamento antes de chegar à distribuidora não avisa a distribuidora", () => {
    const intents = pushIntentsForTransition(order, OrderStatus.CONFIRMED, OrderStatus.CANCELLED, {
      actor: "ops",
    });
    expect(intents.map((i) => i.target.kind)).toEqual(["user"]);
    expect(intents[0].target.id).toBe("consumer-1");
  });

  it("transição sem regra de push não gera nada", () => {
    expect(pushIntentsForTransition(order, OrderStatus.ACCEPTED_BY_DISTRIBUTOR, OrderStatus.READY_FOR_DISPATCH)).toEqual([]);
  });
});

describe("subscriptionSummaryIntent (D6)", () => {
  it("é silencioso, vai para a fila da distribuidora e não se confunde entre execuções", () => {
    const a = subscriptionSummaryIntent("dist-1", 8, "run-a");
    const b = subscriptionSummaryIntent("dist-1", 8, "run-b");
    expect(a).toMatchObject({
      target: { kind: "distributor", id: "dist-1" },
      body: "8 pedidos de assinatura foram gerados e estão na fila.",
      silent: true,
      url: "/distributor/queue",
    });
    expect(a.dedupeKey).not.toBe(b.dedupeKey);
    expect(subscriptionSummaryIntent("dist-1", 1, "x").body).toBe("1 pedido de assinatura foi gerado e está na fila.");
  });

  it("onSubscriptionBatch ignora distribuidora com zero", async () => {
    const sink = vi.fn(async () => {});
    pushDispatcher.setSink(sink);
    await orderNotifications.onSubscriptionBatch(new Map([["dist-1", 3], ["dist-2", 0]]), "run");
    expect(sink).toHaveBeenCalledTimes(1);
    pushDispatcher.setSink(null);
  });
});

describe("pushDispatcher", () => {
  it("falha do destino vira warn e não lança", async () => {
    pushDispatcher.setSink(async () => {
      throw new Error("redis down");
    });
    await expect(
      pushDispatcher.enqueue(subscriptionSummaryIntent("dist-1", 1, "x"))
    ).resolves.toBeUndefined();
    pushDispatcher.setSink(null);
  });
});
