import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditEventType } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  prisma: {
    auditEvent: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../../../infra/prisma/client.js", () => ({
  getPrisma: () => mocks.prisma,
}));

const { kpiService } = await import("./kpi.service.js");

const distributorId = "7e1d7b55-3f52-4d10-aac3-74387c236301";
const orderA = "7e1d7b55-3f52-4d10-aac3-74387c236302";
const orderB = "7e1d7b55-3f52-4d10-aac3-74387c236303";
const orderC = "7e1d7b55-3f52-4d10-aac3-74387c236304";
const orderD = "7e1d7b55-3f52-4d10-aac3-74387c236305";
const startDate = new Date("2026-05-27T00:00:00.000Z");
const endDate = new Date("2026-05-28T00:00:00.000Z");

function event(event_type: AuditEventType, order_id: string, occurred_at: string) {
  return { event_type, order_id, occurred_at: new Date(occurred_at) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("kpiService", () => {
  it("calcula SLA de aceitacao usando eventos lidos via Prisma", async () => {
    mocks.prisma.auditEvent.findMany.mockResolvedValue([
      event(AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR, orderA, "2026-05-27T10:00:00.000Z"),
      event(AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR, orderA, "2026-05-27T10:02:00.000Z"),
      event(AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR, orderB, "2026-05-27T10:10:00.000Z"),
    ]);

    const result = await kpiService.slaAcceptance(distributorId, startDate, endDate, 180);

    expect(mocks.prisma.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ order: { distributor_id: distributorId } }),
      })
    );
    expect(result).toEqual({ rate: 50, total: 2, withinSla: 1 });
  });

  it("calcula taxas simples de aceitacao e reentrega", async () => {
    mocks.prisma.auditEvent.findMany
      .mockResolvedValueOnce([
        event(AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR, orderA, "2026-05-27T10:00:00.000Z"),
        event(AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR, orderB, "2026-05-27T10:05:00.000Z"),
        event(AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR, orderA, "2026-05-27T10:06:00.000Z"),
      ])
      .mockResolvedValueOnce([
        event(AuditEventType.ORDER_DELIVERED, orderA, "2026-05-27T12:00:00.000Z"),
        event(AuditEventType.ORDER_DELIVERED, orderB, "2026-05-27T12:05:00.000Z"),
        event(AuditEventType.REDELIVERY_REQUIRED, orderB, "2026-05-27T12:10:00.000Z"),
      ]);

    await expect(kpiService.acceptanceRate(distributorId, startDate, endDate)).resolves.toEqual({
      rate: 50,
      accepted: 1,
      total: 2,
    });
    await expect(kpiService.redeliveryRate(distributorId, startDate, endDate)).resolves.toEqual({
      rate: 50,
      redeliveries: 1,
      delivered: 2,
    });
  });

  it("monta serie diaria com pedidos recebidos, aceitos, entregues e reentregas", async () => {
    mocks.prisma.auditEvent.findMany.mockResolvedValue([
      event(AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR, orderA, "2026-05-27T10:00:00.000Z"),
      event(AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR, orderA, "2026-05-27T10:02:00.000Z"),
      event(AuditEventType.ORDER_DELIVERED, orderA, "2026-05-27T12:00:00.000Z"),
      event(AuditEventType.ORDER_RECEIVED_BY_DISTRIBUTOR, orderB, "2026-05-27T10:10:00.000Z"),
      event(AuditEventType.ORDER_ACCEPTED_BY_DISTRIBUTOR, orderC, "2026-05-27T10:20:00.000Z"),
      event(AuditEventType.REDELIVERY_REQUIRED, orderD, "2026-05-27T13:00:00.000Z"),
    ]);

    await expect(kpiService.getDailySeries(distributorId, startDate, endDate, 180)).resolves.toEqual([
      {
        date: "2026-05-27",
        sla_pct: 50,
        acceptance_pct: 100,
        redelivery_pct: 100,
      },
    ]);
  });
});
