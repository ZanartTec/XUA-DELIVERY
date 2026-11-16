import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import { OrderStatus, PaymentStatus } from "@xua/shared/enums";
import type { PaymentExpirationJobPayload } from "@api/infra/queue/contracts";

/**
 * O processor roda no worker. Antes, ele emitia por um getIO() que no worker
 * descartava o evento em silêncio; agora passa pelo publicador de pedidos
 * (redis-emitter no worker). Aqui só importa: expirou → cliente é avisado;
 * nada mudou → ninguém é avisado.
 */
const mocks = vi.hoisted(() => ({
  findOrder: vi.fn(),
  findPayment: vi.fn(),
  updatePayment: vi.fn(),
  updateOrder: vi.fn(),
  auditEmit: vi.fn(),
  notifyConsumer: vi.fn(),
}));

vi.mock("@api/infra/prisma/client", () => ({
  getPrisma: () => ({
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        order: { findUnique: mocks.findOrder, update: mocks.updateOrder },
        payment: { findFirst: mocks.findPayment, update: mocks.updatePayment },
      }),
  }),
}));
vi.mock("@api/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@api/modules/audit/audit.repository.js", () => ({ auditRepository: { emit: mocks.auditEmit } }));
vi.mock("@api/modules/orders/services/order-events.publisher.js", () => ({
  orderEventsPublisher: { notifyConsumer: mocks.notifyConsumer },
}));

const { processPaymentExpiration } = await import("@api/worker/processors/expire-payment.processor");

function job(orderId = "order-1"): Job<PaymentExpirationJobPayload> {
  return { id: "job-1", data: { orderId, correlationId: "corr-1" } } as unknown as Job<PaymentExpirationJobPayload>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processPaymentExpiration — tempo real", () => {
  it("pedido expirado avisa o cliente com order_status_changed", async () => {
    mocks.findOrder.mockResolvedValue({ id: "order-1", status: OrderStatus.PAYMENT_PENDING, consumer_id: "c-1" });
    mocks.findPayment.mockResolvedValue({ id: "pay-1", status: PaymentStatus.CREATED });

    const result = await processPaymentExpiration(job());

    expect(result.action).toBe("expired");
    expect(mocks.notifyConsumer).toHaveBeenCalledWith("c-1", "order_status_changed", {
      orderId: "order-1",
      status: OrderStatus.CANCELLED,
      reason: "payment_expired",
    });
  });

  it("pedido que já avançou não gera evento", async () => {
    mocks.findOrder.mockResolvedValue({ id: "order-1", status: OrderStatus.CONFIRMED, consumer_id: "c-1" });

    const result = await processPaymentExpiration(job());

    expect(result.action).toBe("skipped");
    expect(mocks.notifyConsumer).not.toHaveBeenCalled();
  });
});
