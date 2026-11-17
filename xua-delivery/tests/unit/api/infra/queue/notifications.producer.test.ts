import { beforeEach, describe, expect, it, vi } from "vitest";

/** U8 — producer da fila `notifications` (módulo real, fila simulada). */

const mocks = vi.hoisted(() => ({
  jobs: new Map<string, unknown>(),
  add: vi.fn(),
}));

vi.mock("@api/infra/queue/queues", () => ({
  getQueue: () => ({ add: mocks.add }),
}));

// O setup global substitui este módulo; aqui o alvo é o módulo real.
const { enqueuePushNotification, pushJobId } = await vi.importActual<
  typeof import("@api/infra/queue/notifications.producer.js")
>("@api/infra/queue/notifications.producer.js");

const intent = {
  target: { kind: "distributor" as const, id: "dist-1" },
  title: "Novo pedido",
  body: "João",
  url: "/distributor/orders/o-1",
  tag: "order-o-1",
  urgency: "high" as const,
  ttlSeconds: 3600,
  dedupeKey: "new_order:o-1",
  kind: "new_order",
};

beforeEach(() => {
  mocks.jobs.clear();
  mocks.add.mockReset();
  // Comportamento do BullMQ: jobId repetido não cria job novo.
  mocks.add.mockImplementation(async (name: string, data: unknown, opts: { jobId: string }) => {
    if (!mocks.jobs.has(opts.jobId)) mocks.jobs.set(opts.jobId, data);
    return { id: opts.jobId, name };
  });
});

describe("enqueuePushNotification", () => {
  it("jobId vem do dedupeKey, sem ':' (o BullMQ recusa ':' em id)", () => {
    expect(pushJobId("new_order:o-1")).toBe("push-new_order_o-1");
  });

  it("dois enfileiramentos do mesmo pedido geram 1 job", async () => {
    await enqueuePushNotification(intent);
    await enqueuePushNotification(intent);
    expect(mocks.add).toHaveBeenCalledTimes(2);
    expect(mocks.jobs.size).toBe(1);
  });

  it("job com retry e a intenção completa", async () => {
    await enqueuePushNotification(intent, "worker");
    const [name, payload, opts] = mocks.add.mock.calls[0];
    expect(name).toBe("send-push");
    expect(payload).toMatchObject({ jobName: "send-push", intent, source: "worker" });
    expect(opts).toMatchObject({ jobId: "push-new_order_o-1", attempts: 3 });
  });
});
