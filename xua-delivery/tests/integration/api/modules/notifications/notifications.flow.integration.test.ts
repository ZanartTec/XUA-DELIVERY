import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsumerRole } from "@xua/shared/enums";
import { disconnectPrisma, getPrisma } from "@api/infra/prisma/client.js";
import { resetDatabase } from "@tests/support/prisma-test-client.js";
import { createConsumer, createDistributor } from "@tests/support/fixtures.js";

/**
 * I2 — fluxo do push contra o Postgres real (só o `web-push` é simulado):
 * a unicidade por endpoint reatribui o dono, o processor resolve os admins
 * ATIVOS da distribuidora e um 410 apaga o token no banco.
 *
 * Rodar só com DATABASE_URL apontando para o banco de TESTE (o reset faz
 * TRUNCATE em todas as tabelas). Ver docs/doc_desenvolvimento/testes-e-ci.md.
 */

const mocks = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return { sendNotification: vi.fn() };
});

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: mocks.sendNotification },
}));

const { notificationService } = await import("@api/modules/notifications/services/notification.service.js");
const { processPushNotification } = await import("@api/worker/processors/notifications.processor.js");

const keys = { p256dh: "p256dh-key", auth: "auth-key" };

function pushJob(target: { kind: "user" | "distributor"; id: string }) {
  return {
    id: "job-i2",
    data: {
      jobName: "send-push",
      correlationId: "i2",
      requestedAt: new Date().toISOString(),
      source: "api",
      intent: {
        target,
        title: "Novo pedido",
        body: "João · 2 itens",
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

beforeEach(async () => {
  await resetDatabase();
  mocks.sendNotification.mockReset();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe("I2 — push com Postgres real", () => {
  it("mesmo navegador, outro login: o token passa para o novo usuário (sem duplicar)", async () => {
    const userA = await createConsumer();
    const userB = await createConsumer();
    const endpoint = "https://push.example/shared-device";

    await notificationService.subscribe(userA.id, { endpoint, keys });
    await notificationService.subscribe(userB.id, { endpoint, keys }, "Chrome");

    const tokens = await getPrisma().consumerPushToken.findMany({ where: { endpoint } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ consumer_id: userB.id, user_agent: "Chrome" });

    // O usuário anterior não consegue apagar o token que agora é do outro.
    await notificationService.unsubscribe(userA.id, endpoint);
    expect(await getPrisma().consumerPushToken.count({ where: { endpoint } })).toBe(1);
  });

  it("distribuidora: envia só aos admins ativos; 410 apaga o token; sucesso grava last_success_at", async () => {
    const distributor = await createDistributor();
    const admin = await createConsumer({ role: ConsumerRole.DISTRIBUTOR_ADMIN, distributor_id: distributor.id });
    const inactive = await createConsumer({
      role: ConsumerRole.DISTRIBUTOR_ADMIN,
      distributor_id: distributor.id,
      is_active: false,
    });
    const driver = await createConsumer({ role: ConsumerRole.DRIVER, distributor_id: distributor.id });

    await notificationService.subscribe(admin.id, { endpoint: "https://push.example/admin-ok", keys });
    await notificationService.subscribe(admin.id, { endpoint: "https://push.example/admin-gone", keys });
    await notificationService.subscribe(inactive.id, { endpoint: "https://push.example/inactive", keys });
    await notificationService.subscribe(driver.id, { endpoint: "https://push.example/driver", keys });

    mocks.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("admin-gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return {};
    });

    const result = await processPushNotification(pushJob({ kind: "distributor", id: distributor.id }));

    expect(result).toMatchObject({ action: "sent", recipients: 1, sent: 1, removed: 1 });
    const called = mocks.sendNotification.mock.calls.map(([sub]) => sub.endpoint).sort();
    expect(called).toEqual(["https://push.example/admin-gone", "https://push.example/admin-ok"]);

    const prisma = getPrisma();
    expect(await prisma.consumerPushToken.findUnique({ where: { endpoint: "https://push.example/admin-gone" } })).toBeNull();
    const ok = await prisma.consumerPushToken.findUnique({ where: { endpoint: "https://push.example/admin-ok" } });
    expect(ok?.last_success_at).toBeInstanceOf(Date);
  });
});
