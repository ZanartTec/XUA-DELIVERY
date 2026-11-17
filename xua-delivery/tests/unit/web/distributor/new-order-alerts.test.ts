import { describe, expect, it } from "vitest";
import {
  cancellationToastMessage,
  createNewOrderAlerts,
  formatTabTitle,
} from "@/src/realtime/new-order-alerts";

/** U12 — regras do alerta de pedido novo e de cancelamento da distribuidora. */
describe("createNewOrderAlerts", () => {
  const visible = { hidden: false, soundEnabled: true };

  it("alerta com toast e som um pedido avulso", () => {
    const alerts = createNewOrderAlerts();
    expect(alerts.onNewOrder({ orderId: "o-1", origin: "avulso" }, visible)).toEqual({
      toast: true,
      sound: true,
      unseen: 0,
    });
  });

  it("deduplica por orderId (reenvio, resync, push)", () => {
    const alerts = createNewOrderAlerts();
    alerts.onNewOrder({ orderId: "o-1" }, visible);
    expect(alerts.onNewOrder({ orderId: "o-1" }, visible).toast).toBe(false);
  });

  it("respeita o teto: o id mais antigo sai e pode alertar de novo", () => {
    const alerts = createNewOrderAlerts(2);
    alerts.onNewOrder({ orderId: "a" }, visible);
    alerts.onNewOrder({ orderId: "b" }, visible);
    alerts.onNewOrder({ orderId: "c" }, visible);
    expect(alerts.onNewOrder({ orderId: "c" }, visible).toast).toBe(false);
    expect(alerts.onNewOrder({ orderId: "a" }, visible).toast).toBe(true);
  });

  it("pedido de assinatura não toca som nem mostra toast (D6)", () => {
    const alerts = createNewOrderAlerts();
    expect(alerts.onNewOrder({ orderId: "s-1", origin: "assinatura" }, { hidden: true, soundEnabled: true })).toEqual({
      toast: false,
      sound: false,
      unseen: 0,
    });
  });

  it("som desligado: toast sim, som não", () => {
    const alerts = createNewOrderAlerts();
    const decision = alerts.onNewOrder({ orderId: "o-1" }, { hidden: false, soundEnabled: false });
    expect(decision).toMatchObject({ toast: true, sound: false });
  });

  it("contador do título sobe com a aba oculta e zera no foco", () => {
    const alerts = createNewOrderAlerts();
    alerts.onNewOrder({ orderId: "o-1" }, { hidden: true, soundEnabled: true });
    expect(alerts.onNewOrder({ orderId: "o-2" }, { hidden: true, soundEnabled: true }).unseen).toBe(2);
    alerts.onNewOrder({ orderId: "o-3" }, visible);
    expect(alerts.unseen).toBe(2);
    alerts.markSeen();
    expect(alerts.unseen).toBe(0);
  });
});

describe("formatTabTitle", () => {
  it("prefixa e troca o contador sem acumular", () => {
    expect(formatTabTitle("Pedidos · Xuá", 2)).toBe("(2) Pedidos · Xuá");
    expect(formatTabTitle("(2) Pedidos · Xuá", 3)).toBe("(3) Pedidos · Xuá");
    expect(formatTabTitle("(3) Pedidos · Xuá", 0)).toBe("Pedidos · Xuá");
    expect(formatTabTitle("Xuá", 150)).toBe("(99+) Xuá");
  });
});

describe("cancellationToastMessage", () => {
  const base = { orderId: "abcdef12-0000-4000-a000-000000000001", status: "CANCELLED" } as const;

  it("cancelamento pelo cliente de pedido aceito vira toast", () => {
    expect(
      cancellationToastMessage({ ...base, previousStatus: "ACCEPTED_BY_DISTRIBUTOR", cancelledBy: "consumer" } as never)
    ).toBe("Pedido #ABCDEF12 foi cancelado pelo cliente");
  });

  it("cancelamento feito pela própria distribuidora não avisa ela mesma", () => {
    expect(
      cancellationToastMessage({ ...base, previousStatus: "READY_FOR_DISPATCH", cancelledBy: "distributor" } as never)
    ).toBeNull();
  });

  it("pedido que ainda nem foi aceito não gera toast (a fila já atualiza)", () => {
    expect(
      cancellationToastMessage({ ...base, previousStatus: "SENT_TO_DISTRIBUTOR", cancelledBy: "consumer" } as never)
    ).toBeNull();
  });

  it("outro status não gera toast", () => {
    expect(cancellationToastMessage({ ...base, status: "DELIVERED" } as never)).toBeNull();
  });
});
