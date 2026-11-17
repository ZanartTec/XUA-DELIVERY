import { describe, expect, it } from "vitest";
import { REALTIME_EVENT_NAMES } from "@xua/shared/realtime/events";
import { keysFor, LIVE_QUERY_KEYS } from "@/src/realtime/invalidation-map";

/** U9 — mapa evento → chaves do React Query. */
describe("keysFor", () => {
  const orderId = "order-1";

  it("new_order atualiza a fila e os KPIs da distribuidora", () => {
    expect(keysFor("new_order", { orderId, status: "SENT_TO_DISTRIBUTOR" } as never)).toEqual([
      ["distributor-queue"],
      ["kpis"],
    ]);
  });

  it("order_status_changed atinge todas as telas que mostram o pedido", () => {
    const keys = keysFor("order_status_changed", { orderId, status: "CANCELLED" } as never);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["distributor-queue"],
        ["distributor-order-detail", orderId],
        ["order", orderId],
        ["orders"],
        ["driver-deliveries"],
        ["support-order", orderId],
      ])
    );
  });

  it("eventos do motorista atualizam a lista e o pedido", () => {
    for (const event of ["new_delivery", "delivery_assigned"] as const) {
      expect(keysFor(event, { orderId, status: "OUT_FOR_DELIVERY" } as never)).toEqual([
        ["driver-deliveries"],
        ["order", orderId],
      ]);
    }
  });

  it("sem orderId cai no prefixo (invalida todos os pedidos daquela tela)", () => {
    expect(keysFor("otp_generated", {} as never)).toEqual([["order"]]);
  });

  it("todo evento do contrato tem ao menos uma chave", () => {
    for (const event of REALTIME_EVENT_NAMES) {
      expect(keysFor(event, { orderId } as never).length, event).toBeGreaterThan(0);
    }
  });

  it("evento desconhecido → []", () => {
    expect(keysFor("sla_warning" as never, { orderId } as never)).toEqual([]);
  });

  it("chaves ao vivo incluem fila, entregas e pedidos", () => {
    expect(LIVE_QUERY_KEYS).toEqual(
      expect.arrayContaining([["distributor-queue"], ["driver-deliveries"], ["orders"], ["order"]])
    );
  });
});
