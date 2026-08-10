import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  driverRepository: {
    findTodayDeliveries: vi.fn(),
    findPendingDeliveries: vi.fn(),
    findDeliveryHistory: vi.fn(),
  },
}));

vi.mock("../repository/driver.repository.js", () => ({
  driverRepository: mocks.driverRepository,
}));

const { driverService } = await import("./driver.service.js");

const ADDRESS = {
  street: "Rua das Flores",
  number: "123",
  complement: "Apto 4",
  neighborhood: "Centro",
  city: "Juiz de Fora",
  state: "MG",
  zip_code: "36010-000",
};

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    consumer: { name: "Fulano", phone: "32999999999" },
    address: ADDRESS,
    items: [{ quantity: 2 }, { quantity: 3 }],
    payments: [{ status: "paid", payment_method: "PIX", cash_change_for_cents: null }],
    payment_status: "pending",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("driverService.listDeliveries", () => {
  it("numera a sequência a partir de 1 e soma a quantidade de itens", async () => {
    mocks.driverRepository.findTodayDeliveries.mockResolvedValue([order(), order({ id: "order-2" })]);

    const result = await driverService.listDeliveries("driver-1");

    expect(result[0].sequence).toBe(1);
    expect(result[1].sequence).toBe(2);
    expect(result[0].total_items_qty).toBe(5);
  });

  it("usa status/método do pagamento mais recente quando existe", async () => {
    mocks.driverRepository.findTodayDeliveries.mockResolvedValue([order()]);

    const [delivery] = await driverService.listDeliveries("driver-1");

    expect(delivery.payment_method).toBe("PIX");
    expect(delivery.payment_status).toBe("paid");
  });

  it("cai para payment_status do pedido quando não há pagamentos ainda", async () => {
    mocks.driverRepository.findTodayDeliveries.mockResolvedValue([
      order({ payments: [], payment_status: "pending" }),
    ]);

    const [delivery] = await driverService.listDeliveries("driver-1");

    expect(delivery.payment_method).toBeNull();
    expect(delivery.payment_status).toBe("pending");
  });

  it("formata o endereço completo com complemento", async () => {
    mocks.driverRepository.findTodayDeliveries.mockResolvedValue([order()]);

    const [delivery] = await driverService.listDeliveries("driver-1");

    expect(delivery.address_line).toBe(
      "Rua das Flores, 123 - Apto 4 - Centro - Juiz de Fora/MG"
    );
  });

  it("indica endereço não informado quando address é null", async () => {
    mocks.driverRepository.findTodayDeliveries.mockResolvedValue([order({ address: null })]);

    const [delivery] = await driverService.listDeliveries("driver-1");

    expect(delivery.address_line).toBe("Endereço não informado");
  });

  it("remove os campos aninhados originais do retorno achatado", async () => {
    mocks.driverRepository.findTodayDeliveries.mockResolvedValue([order()]);

    const [delivery] = await driverService.listDeliveries("driver-1");

    expect(delivery.consumer).toBeUndefined();
    expect(delivery.address).toBeUndefined();
    expect(delivery.items).toBeUndefined();
    expect(delivery.payments).toBeUndefined();
    expect(delivery.consumer_name).toBe("Fulano");
    expect(delivery.order_id).toBe("order-1");
  });
});

describe("driverService.listPendingDeliveries", () => {
  it("expõe delivery_address estruturado em vez do address_line", async () => {
    mocks.driverRepository.findPendingDeliveries.mockResolvedValue([order()]);

    const [delivery] = await driverService.listPendingDeliveries("driver-1");

    expect(delivery.delivery_address).toEqual(ADDRESS);
    expect(delivery.address).toBeUndefined();
  });

  it("delivery_address é null quando não há endereço", async () => {
    mocks.driverRepository.findPendingDeliveries.mockResolvedValue([order({ address: null })]);

    const [delivery] = await driverService.listPendingDeliveries("driver-1");

    expect(delivery.delivery_address).toBeNull();
  });
});

describe("driverService.listDeliveryHistory", () => {
  it("usa delivered_at como occurred_at quando presente", async () => {
    const deliveredAt = new Date("2026-08-01T10:00:00Z");
    mocks.driverRepository.findDeliveryHistory.mockResolvedValue([
      order({ delivered_at: deliveredAt, updated_at: new Date("2026-08-02T00:00:00Z"), status: "DELIVERED" }),
    ]);

    const result = await driverService.listDeliveryHistory("driver-1", 20, 0);

    expect(result.deliveries[0].occurred_at).toBe(deliveredAt);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it("cai para updated_at quando não houve entrega (delivered_at null)", async () => {
    const updatedAt = new Date("2026-08-02T00:00:00Z");
    mocks.driverRepository.findDeliveryHistory.mockResolvedValue([
      order({ delivered_at: null, updated_at: updatedAt, status: "DELIVERY_FAILED", cancellation_reason: "Cliente ausente" }),
    ]);

    const result = await driverService.listDeliveryHistory("driver-1", 20, 0);

    expect(result.deliveries[0].occurred_at).toBe(updatedAt);
  });

  it("só expõe failure_reason quando o status é DELIVERY_FAILED", async () => {
    mocks.driverRepository.findDeliveryHistory.mockResolvedValue([
      order({ status: "DELIVERY_FAILED", cancellation_reason: "Cliente ausente", delivered_at: null, updated_at: new Date() }),
      order({ id: "order-2", status: "DELIVERED", cancellation_reason: null, delivered_at: new Date(), updated_at: new Date() }),
    ]);

    const result = await driverService.listDeliveryHistory("driver-1", 20, 0);

    expect(result.deliveries[0].failure_reason).toBe("Cliente ausente");
    expect(result.deliveries[1].failure_reason).toBeNull();
  });
});
