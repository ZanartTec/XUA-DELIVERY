import { beforeEach, describe, expect, it, vi } from "vitest";

/** U6 — inscrição por endpoint, remoção só do próprio token, envio e limpeza de token morto. */

const mocks = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return {
    webPush: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
    prisma: {
      consumerPushToken: {
        upsert: vi.fn(),
        deleteMany: vi.fn(),
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      consumer: { findMany: vi.fn() },
    },
  };
});

vi.mock("web-push", () => ({ default: mocks.webPush }));
vi.mock("@api/infra/prisma/client.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("@api/infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

const { notificationService } = await import("@api/modules/notifications/services/notification.service.js");

const sub = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.consumerPushToken.deleteMany.mockResolvedValue({ count: 1 });
  mocks.prisma.consumerPushToken.updateMany.mockResolvedValue({ count: 1 });
});

describe("subscribe", () => {
  it("faz upsert por endpoint e reatribui o dono (aparelho compartilhado)", async () => {
    await notificationService.subscribe("user-b", sub, "Chrome");

    expect(mocks.prisma.consumerPushToken.upsert).toHaveBeenCalledWith({
      where: { endpoint: sub.endpoint },
      create: expect.objectContaining({ endpoint: sub.endpoint, consumer_id: "user-b", user_agent: "Chrome" }),
      update: expect.objectContaining({ consumer_id: "user-b", p256dh: "p", auth_key: "a" }),
    });
  });
});

describe("unsubscribe", () => {
  it("só apaga token do próprio usuário", async () => {
    await notificationService.unsubscribe("user-a", sub.endpoint);
    expect(mocks.prisma.consumerPushToken.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: sub.endpoint, consumer_id: "user-a" },
    });
  });
});

describe("resolveDistributorRecipients", () => {
  it("busca só admins ativos daquela distribuidora", async () => {
    mocks.prisma.consumer.findMany.mockResolvedValue([{ id: "adm-1" }]);
    await expect(notificationService.resolveDistributorRecipients("dist-1")).resolves.toEqual(["adm-1"]);
    expect(mocks.prisma.consumer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { distributor_id: "dist-1", role: "DISTRIBUTOR_ADMIN", is_active: true },
      })
    );
  });
});

describe("sendToUsers", () => {
  const tokens = [
    { id: "t-ok", endpoint: "https://push/ok", p256dh: "p", auth_key: "a" },
    { id: "t-gone", endpoint: "https://push/gone", p256dh: "p", auth_key: "a" },
    { id: "t-5xx", endpoint: "https://push/5xx", p256dh: "p", auth_key: "a" },
  ];

  it("payload leva url, tag e kind; 410 apaga o token; 5xx conta como temporário", async () => {
    mocks.prisma.consumerPushToken.findMany.mockResolvedValue(tokens);
    mocks.webPush.sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("5xx")) throw Object.assign(new Error("boom"), { statusCode: 503 });
      return {};
    });

    const result = await notificationService.sendToUsers(
      ["user-a"],
      { title: "Novo pedido", body: "João", url: "/distributor/orders/1", tag: "order-1", kind: "new_order" },
      { ttlSeconds: 3600, urgency: "high" }
    );

    expect(result).toEqual({ sent: 1, failed: 2, removed: 1, retryable: 1 });
    const [, payload, options] = mocks.webPush.sendNotification.mock.calls[0];
    expect(JSON.parse(payload)).toMatchObject({ url: "/distributor/orders/1", tag: "order-1", kind: "new_order" });
    expect(options).toEqual({ TTL: 3600, urgency: "high" });
    expect(mocks.prisma.consumerPushToken.deleteMany).toHaveBeenCalledWith({ where: { id: "t-gone" } });
    expect(mocks.prisma.consumerPushToken.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t-ok"] } },
      data: { last_success_at: expect.any(Date) },
    });
  });

  it("sem destinatários ou sem tokens não chama o web-push", async () => {
    mocks.prisma.consumerPushToken.findMany.mockResolvedValue([]);
    expect(await notificationService.sendToUsers([], { title: "x", body: "y" })).toMatchObject({ sent: 0 });
    expect(await notificationService.sendToUsers(["u"], { title: "x", body: "y" })).toMatchObject({ sent: 0 });
    expect(mocks.webPush.sendNotification).not.toHaveBeenCalled();
  });
});
