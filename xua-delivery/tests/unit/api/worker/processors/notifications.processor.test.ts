import { beforeEach, describe, expect, it, vi } from "vitest";

/** U7 — processor da fila `notifications`. */

const mocks = vi.hoisted(() => ({
  service: {
    isConfigured: vi.fn(),
    resolveDistributorRecipients: vi.fn(),
    sendToUsers: vi.fn(),
  },
}));

vi.mock("@api/modules/notifications/services/notification.service.js", () => ({
  notificationService: mocks.service,
}));
vi.mock("@api/infra/logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { processPushNotification } = await import("@api/worker/processors/notifications.processor.js");

function job(target: { kind: "user" | "distributor"; id: string }) {
  return {
    id: "job-1",
    data: {
      jobName: "send-push",
      correlationId: "c",
      requestedAt: new Date().toISOString(),
      source: "api",
      intent: {
        target,
        title: "Novo pedido",
        body: "João",
        url: "/distributor/orders/o-1",
        tag: "order-o-1",
        urgency: "high",
        ttlSeconds: 3600,
        dedupeKey: "new_order:o-1",
        kind: "new_order",
      },
    },
  } as never;
}

const ok = { sent: 1, failed: 0, removed: 0, retryable: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.service.isConfigured.mockReturnValue(true);
  mocks.service.sendToUsers.mockResolvedValue(ok);
});

describe("processPushNotification", () => {
  it("kind distributor envia para os admins ativos resolvidos", async () => {
    mocks.service.resolveDistributorRecipients.mockResolvedValue(["adm-1", "adm-2"]);
    const result = await processPushNotification(job({ kind: "distributor", id: "dist-1" }));
    expect(mocks.service.resolveDistributorRecipients).toHaveBeenCalledWith("dist-1");
    expect(mocks.service.sendToUsers).toHaveBeenCalledWith(
      ["adm-1", "adm-2"],
      expect.objectContaining({ url: "/distributor/orders/o-1", tag: "order-o-1", kind: "new_order", silent: false }),
      { ttlSeconds: 3600, urgency: "high" }
    );
    expect(result).toMatchObject({ action: "sent", recipients: 2 });
  });

  it("kind user envia direto para o usuário", async () => {
    await processPushNotification(job({ kind: "user", id: "consumer-1" }));
    expect(mocks.service.resolveDistributorRecipients).not.toHaveBeenCalled();
    expect(mocks.service.sendToUsers.mock.calls[0][0]).toEqual(["consumer-1"]);
  });

  it("sem VAPID conclui sem erro (sem retry infinito)", async () => {
    mocks.service.isConfigured.mockReturnValue(false);
    await expect(processPushNotification(job({ kind: "user", id: "u" }))).resolves.toEqual({
      action: "skipped",
      reason: "vapid_not_configured",
    });
    expect(mocks.service.sendToUsers).not.toHaveBeenCalled();
  });

  it("distribuidora sem admin ativo: nada a enviar", async () => {
    mocks.service.resolveDistributorRecipients.mockResolvedValue([]);
    await expect(processPushNotification(job({ kind: "distributor", id: "d" }))).resolves.toMatchObject({
      action: "skipped",
      reason: "no_recipients",
    });
  });

  it("erro temporário sem nenhuma entrega relança (retry do BullMQ)", async () => {
    mocks.service.sendToUsers.mockResolvedValue({ sent: 0, failed: 1, removed: 0, retryable: 1 });
    await expect(processPushNotification(job({ kind: "user", id: "u" }))).rejects.toThrow("PUSH_TEMPORARY_FAILURE");
  });

  it("entrega parcial não relança (retry duplicaria no aparelho que recebeu)", async () => {
    mocks.service.sendToUsers.mockResolvedValue({ sent: 1, failed: 1, removed: 0, retryable: 1 });
    await expect(processPushNotification(job({ kind: "user", id: "u" }))).resolves.toMatchObject({ action: "sent" });
  });
});
