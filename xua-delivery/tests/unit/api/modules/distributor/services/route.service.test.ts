import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  distributorRepository: { findRouteStopsByDistributor: vi.fn() },
}));

vi.mock("@api/modules/distributor/repository/distributor.repository.js", () => ({
  distributorRepository: mocks.distributorRepository,
}));

const { routeService } = await import("@api/modules/distributor/services/route.service.js");

const distributorId = "dist-001";

function stop(status: OrderStatus) {
  return {
    id: `order-${status}`,
    status,
    delivery_window: "morning",
    consumer: { name: "Maria", phone: "32999999999" },
    address: { street: "Rua A", number: "1", neighborhood: "Centro", city: "Juiz de Fora", state: "MG" },
    zone: { name: "Centro" },
    items: [],
    created_at: new Date("2026-06-01T10:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.distributorRepository.findRouteStopsByDistributor.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("routeService.getDailyRoute", () => {
  it('"today" é o dia de Brasília: às 21h30 (00h30 UTC do dia seguinte) ainda é a rota de hoje', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:30:00.000Z")); // 12/06 21:30 em Brasília

    const route = await routeService.getDailyRoute(distributorId, "today");

    expect(route.date).toBe("2026-06-12");
    const [, requestedDate] = mocks.distributorRepository.findRouteStopsByDistributor.mock.calls[0];
    expect(requestedDate).toEqual(new Date("2026-06-12T00:00:00.000Z"));
  });

  it("aceita uma data explícita sem converter fuso", async () => {
    const route = await routeService.getDailyRoute(distributorId, "2026-11-20");

    expect(route.date).toBe("2026-11-20");
  });

  it("rejeita um id de rota inválido", async () => {
    await expect(routeService.getDailyRoute(distributorId, "amanha")).rejects.toThrow(/Rota inválida/);
  });

  it("a reentrega agendada aparece na rota como 'Reentrega agendada', sem contar como entregue", async () => {
    mocks.distributorRepository.findRouteStopsByDistributor.mockResolvedValue([
      stop(OrderStatus.REDELIVERY_SCHEDULED),
      stop(OrderStatus.DELIVERED),
    ]);

    const route = await routeService.getDailyRoute(distributorId, "2026-11-20");

    const stops = route.groups.flatMap((group) => group.stops);
    expect(stops.find((s) => s.order_id === `order-${OrderStatus.REDELIVERY_SCHEDULED}`)?.status_label).toBe(
      "Reentrega agendada"
    );
    expect(route.delivered_stops).toBe(1);
    expect(route.pending_stops).toBe(1);
  });
});
