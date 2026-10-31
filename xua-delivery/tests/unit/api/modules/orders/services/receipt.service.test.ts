import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActorType, AuditEventType, OrderStatus, PaymentStatus, SourceApp } from "@xua/shared/enums";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  receiptRepository: {
    findByOrderId: vi.fn(),
    findOrderForSnapshot: vi.fn(),
    reserveNextNumber: vi.fn(),
    create: vi.fn(),
    findForPrint: vi.fn(),
    registerPrints: vi.fn(),
  },
  auditRepository: { emit: vi.fn() },
}));

vi.mock("@api/infra/prisma/client.js", () => ({
  getPrisma: () => ({ $transaction: mocks.transaction }),
}));

vi.mock("@api/infra/logger/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@api/modules/orders/repository/receipt.repository.js", () => ({
  receiptRepository: mocks.receiptRepository,
}));

vi.mock("@api/modules/audit/audit.repository.js", () => ({
  auditRepository: mocks.auditRepository,
}));

const { receiptService, buildReceiptSnapshot, receiptActorFromRole } = await import(
  "@api/modules/orders/services/receipt.service.js"
);

const orderId = "5b0f6c1a-1111-4a00-9000-000000000001";
const distributorId = "5b0f6c1a-1111-4a00-9000-000000000002";
const userId = "5b0f6c1a-1111-4a00-9000-000000000003";

const actor = { type: ActorType.DISTRIBUTOR_USER, id: userId, sourceApp: SourceApp.DISTRIBUTOR_WEB };

const tx = {
  order: { findUnique: vi.fn() },
};

function snapshotSource(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    distributor_id: distributorId,
    created_at: new Date("2026-10-30T10:00:00.000Z"),
    delivery_date: new Date("2026-10-30T00:00:00.000Z"),
    delivery_window: "MORNING",
    scheduled_time_label: "08:00 - 12:00",
    delivery_instructions: "Portaria",
    subtotal_cents: 2400,
    total_cents: 2400,
    bottles_full_ordered: 2,
    empty_bottles_provided: 1,
    bottles_sold: 1,
    bottles_loaned: 0,
    driver_name: "Carlos",
    consumer: { name: "Maria", phone: "11999990000", document: "12345678909" },
    address: {
      street: "Rua A",
      number: "10",
      complement: null,
      neighborhood: "Centro",
      city: "São Paulo",
      state: "SP",
      zip_code: "01001000",
    },
    distributor: {
      name: "Distribuidora X",
      legal_name: null,
      trade_name: null,
      cnpj: "11222333000181",
      state_registration: null,
      phone: "1133334444",
      email: "x@x.test",
      zip_code: null,
      street: null,
      number: null,
      complement: null,
      neighborhood: null,
      city: null,
      state: null,
    },
    items: [{ product_name: "Água 20L", quantity: 2, unit_price_cents: 1200, subtotal_cents: 2400 }],
    payments: [{ status: PaymentStatus.CREATED, payment_method: "cash", cash_change_for_cents: 5000 }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  mocks.auditRepository.emit.mockResolvedValue({ id: "audit-1" });
  mocks.receiptRepository.create.mockImplementation(async (data: Record<string, unknown>) => ({
    id: "receipt-1",
    print_count: 0,
    issued_at: new Date(),
    ...data,
  }));
});

describe("buildReceiptSnapshot", () => {
  it("usa o nome da distribuidora quando a razao social nao foi cadastrada", () => {
    const snapshot = buildReceiptSnapshot(snapshotSource() as never);
    expect(snapshot.issuer.legal_name).toBe("Distribuidora X");
  });

  it("congela cliente, itens, totais, metodo de pagamento e vasilhames", () => {
    const snapshot = buildReceiptSnapshot(
      snapshotSource({
        distributor: { ...snapshotSource().distributor, legal_name: "X Comércio Ltda", trade_name: "Água X" },
      }) as never
    );

    expect(snapshot).toMatchObject({
      version: 1,
      issuer: { legal_name: "X Comércio Ltda", trade_name: "Água X", cnpj: "11222333000181" },
      customer: { name: "Maria", document: "12345678909", delivery_instructions: "Portaria" },
      order: { id: orderId, short_id: "5B0F6C1A", delivery_date: "2026-10-30T00:00:00.000Z", driver_name: "Carlos" },
      items: [{ product_name: "Água 20L", quantity: 2, unit_price_cents: 1200, subtotal_cents: 2400 }],
      totals: { subtotal_cents: 2400, total_cents: 2400 },
      payment: { method: "cash", cash_change_for_cents: 5000 },
      bottles: { full_ordered: 2, empty_provided: 1, sold: 1, loaned: 0 },
    });
    // Status do pagamento NÃO é congelado (é lido na hora de imprimir).
    expect(snapshot.payment).not.toHaveProperty("status");
  });
});

describe("receiptService.issueInTx", () => {
  it("e idempotente: devolve o comprovante existente sem consumir numero (reentrega)", async () => {
    const existing = { id: "receipt-0", number: 5 };
    mocks.receiptRepository.findByOrderId.mockResolvedValue(existing);

    const result = await receiptService.issueInTx(orderId, actor, tx as never);

    expect(result).toEqual({ receipt: existing, created: false });
    expect(mocks.receiptRepository.reserveNextNumber).not.toHaveBeenCalled();
    expect(mocks.receiptRepository.create).not.toHaveBeenCalled();
    expect(mocks.auditRepository.emit).not.toHaveBeenCalled();
  });

  it("numera na sequencia da distribuidora, grava snapshot e audita na mesma transacao", async () => {
    mocks.receiptRepository.findByOrderId.mockResolvedValue(null);
    mocks.receiptRepository.findOrderForSnapshot.mockResolvedValue(snapshotSource());
    mocks.receiptRepository.reserveNextNumber.mockResolvedValue(12);

    const result = await receiptService.issueInTx(orderId, actor, tx as never);

    expect(result.created).toBe(true);
    expect(mocks.receiptRepository.reserveNextNumber).toHaveBeenCalledWith(distributorId, tx);
    expect(mocks.receiptRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order_id: orderId,
        distributor_id: distributorId,
        number: 12,
        snapshot_version: 1,
        issued_by_actor_type: ActorType.DISTRIBUTOR_USER,
        issued_by_actor_id: userId,
        snapshot: expect.objectContaining({ version: 1 }),
      }),
      tx
    );
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.RECEIPT_ISSUED,
        orderId,
        sourceApp: SourceApp.DISTRIBUTOR_WEB,
        payload: { receipt_id: "receipt-1", number: 12 },
      }),
      tx
    );
  });

  it("propaga erro para o despacho fazer rollback quando a emissao falha", async () => {
    mocks.receiptRepository.findByOrderId.mockResolvedValue(null);
    mocks.receiptRepository.findOrderForSnapshot.mockResolvedValue(snapshotSource());
    mocks.receiptRepository.reserveNextNumber.mockRejectedValue(new Error("db down"));

    await expect(receiptService.issueInTx(orderId, actor, tx as never)).rejects.toThrow("db down");
    expect(mocks.receiptRepository.create).not.toHaveBeenCalled();
  });
});

describe("receiptService.issue (emissao manual)", () => {
  it("recusa pedido que ainda nao foi aceito", async () => {
    tx.order.findUnique.mockResolvedValue({ status: OrderStatus.SENT_TO_DISTRIBUTOR });

    await expect(receiptService.issue(orderId, actor)).rejects.toMatchObject({ code: "INVALID_STATUS" });
    expect(mocks.receiptRepository.create).not.toHaveBeenCalled();
  });

  it("emite para pedido aceito", async () => {
    tx.order.findUnique.mockResolvedValue({ status: OrderStatus.ACCEPTED_BY_DISTRIBUTOR });
    mocks.receiptRepository.findByOrderId.mockResolvedValue(null);
    mocks.receiptRepository.findOrderForSnapshot.mockResolvedValue(snapshotSource());
    mocks.receiptRepository.reserveNextNumber.mockResolvedValue(1);

    const result = await receiptService.issue(orderId, actor);

    expect(result.created).toBe(true);
    expect(result.receipt.number).toBe(1);
  });

  it("emissoes simultaneas: a perdedora (unique de order_id) devolve a vencedora", async () => {
    const winner = { id: "receipt-9", number: 9 };
    mocks.transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    mocks.receiptRepository.findByOrderId.mockResolvedValue(winner);

    await expect(receiptService.issue(orderId, actor)).resolves.toEqual({ receipt: winner, created: false });
  });
});

describe("receiptService.loadForPrint", () => {
  it("marca 2a via pelo print_count anterior, registra impressao e audita cada comprovante", async () => {
    mocks.receiptRepository.findForPrint.mockResolvedValue([
      {
        id: "r1",
        order_id: orderId,
        number: 3,
        snapshot: { version: 1 },
        issued_at: new Date("2026-10-30T12:00:00.000Z"),
        print_count: 0,
        order: { status: OrderStatus.OUT_FOR_DELIVERY, payments: [{ status: PaymentStatus.CAPTURED }] },
      },
      {
        id: "r2",
        order_id: "other-order",
        number: 4,
        snapshot: { version: 1 },
        issued_at: new Date("2026-10-30T12:00:00.000Z"),
        print_count: 2,
        order: { status: OrderStatus.CANCELLED, payments: [] },
      },
    ]);

    const printable = await receiptService.loadForPrint([orderId, "other-order"], actor, "thermal");

    expect(mocks.receiptRepository.registerPrints).toHaveBeenCalledWith(["r1", "r2"], tx);
    expect(printable).toEqual([
      expect.objectContaining({ number: 3, is_copy: false, is_cancelled: false, payment_status: PaymentStatus.CAPTURED }),
      expect.objectContaining({ number: 4, is_copy: true, is_cancelled: true, payment_status: null }),
    ]);
    expect(mocks.auditRepository.emit).toHaveBeenCalledTimes(2);
    expect(mocks.auditRepository.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: AuditEventType.RECEIPT_PRINTED,
        payload: { receipt_id: "r2", number: 4, format: "thermal", copy: "2a" },
      }),
      tx
    );
  });

  it("sem comprovante nao registra impressao", async () => {
    mocks.receiptRepository.findForPrint.mockResolvedValue([]);

    await expect(receiptService.loadForPrint([orderId], actor, "a4")).resolves.toEqual([]);
    expect(mocks.receiptRepository.registerPrints).not.toHaveBeenCalled();
  });
});

describe("receiptActorFromRole", () => {
  it("mapeia papel para ator e app de origem", () => {
    expect(receiptActorFromRole(userId, "driver")).toEqual({
      type: ActorType.DRIVER,
      id: userId,
      sourceApp: SourceApp.DRIVER_WEB,
    });
    expect(receiptActorFromRole(userId, "ops").type).toBe(ActorType.OPS);
    expect(receiptActorFromRole(userId, "support").type).toBe(ActorType.SUPPORT);
  });
});
