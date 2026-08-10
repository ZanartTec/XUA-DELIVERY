import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscriptionPlansRepository: {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  distributorGatewayService: {
    findMissingGatewayIds: vi.fn(),
  },
}));

vi.mock("../repository/subscription-plans.repository.js", () => ({
  subscriptionPlansRepository: mocks.subscriptionPlansRepository,
}));

vi.mock("../../distributor-gateway/index.js", () => ({
  distributorGatewayService: mocks.distributorGatewayService,
}));

const { subscriptionPlansService } = await import("./subscription-plans.service.js");

function rawPlan(overrides: Record<string, unknown> = {}) {
  return {
    id: "plan-1",
    name: "Plano Mensal",
    distributors: [
      {
        distributor: {
          id: "dist-1",
          name: "Distribuidora A",
          payment_settings: {
            mp_access_token_enc: "enc-token",
            mp_webhook_secret_enc: "enc-secret",
          },
        },
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.distributorGatewayService.findMissingGatewayIds.mockResolvedValue([]);
});

describe("subscriptionPlansService.listPlans", () => {
  it("nunca expõe os campos cifrados do gateway, só o booleano mp_connected", async () => {
    mocks.subscriptionPlansRepository.findAll.mockResolvedValue([rawPlan()]);

    const [plan] = await subscriptionPlansService.listPlans();

    const distributor = plan.distributors[0].distributor as Record<string, unknown>;
    expect(distributor.mp_connected).toBe(true);
    expect(distributor).not.toHaveProperty("payment_settings");
    expect(distributor).not.toHaveProperty("mp_access_token_enc");
  });

  it("mp_connected é false quando falta token ou webhook secret", async () => {
    mocks.subscriptionPlansRepository.findAll.mockResolvedValue([
      rawPlan({
        distributors: [
          {
            distributor: {
              id: "dist-1",
              name: "Distribuidora A",
              payment_settings: { mp_access_token_enc: "enc-token", mp_webhook_secret_enc: null },
            },
          },
        ],
      }),
    ]);

    const [plan] = await subscriptionPlansService.listPlans();

    expect((plan.distributors[0].distributor as Record<string, unknown>).mp_connected).toBe(false);
  });

  it("repassa activeOnly ao repository", async () => {
    mocks.subscriptionPlansRepository.findAll.mockResolvedValue([]);
    await subscriptionPlansService.listPlans(true);
    expect(mocks.subscriptionPlansRepository.findAll).toHaveBeenCalledWith(true);
  });
});

describe("subscriptionPlansService.getPlan", () => {
  it("lança PLAN_NOT_FOUND quando o plano não existe", async () => {
    mocks.subscriptionPlansRepository.findById.mockResolvedValue(null);
    await expect(subscriptionPlansService.getPlan("plan-x")).rejects.toThrow("PLAN_NOT_FOUND");
  });

  it("retorna o plano mascarado quando existe", async () => {
    mocks.subscriptionPlansRepository.findById.mockResolvedValue(rawPlan());
    const plan = await subscriptionPlansService.getPlan("plan-1");
    expect(plan.id).toBe("plan-1");
  });
});

describe("subscriptionPlansService.createPlan", () => {
  const payload = {
    name: "Plano Mensal",
    product_id: "product-1",
    quantity: 4,
    unit_price_with_discount_cents: 10000,
    valid_from: "2026-01-01",
    valid_until: "2026-12-31",
    distributor_ids: ["dist-1"],
  };

  it("bloqueia quando alguma distribuidora não tem gateway MP configurado (regra P2)", async () => {
    mocks.distributorGatewayService.findMissingGatewayIds.mockResolvedValue(["dist-1"]);

    await expect(subscriptionPlansService.createPlan(payload)).rejects.toThrow(
      "DISTRIBUTOR_GATEWAY_REQUIRED"
    );
    expect(mocks.subscriptionPlansRepository.create).not.toHaveBeenCalled();
  });

  it("cria o plano quando todas as distribuidoras têm gateway", async () => {
    mocks.subscriptionPlansRepository.create.mockResolvedValue({ id: "plan-1" });

    await subscriptionPlansService.createPlan(payload);

    expect(mocks.subscriptionPlansRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Plano Mensal",
        discount_percentage: 0,
        is_active: true,
        valid_from: new Date("2026-01-01"),
        valid_until: new Date("2026-12-31"),
      })
    );
  });

  it("não checa gateway quando distributor_ids está vazio", async () => {
    mocks.subscriptionPlansRepository.create.mockResolvedValue({ id: "plan-1" });

    await subscriptionPlansService.createPlan({ ...payload, distributor_ids: [] });

    expect(mocks.distributorGatewayService.findMissingGatewayIds).not.toHaveBeenCalled();
  });
});

describe("subscriptionPlansService.updatePlan", () => {
  it("lança PLAN_NOT_FOUND quando o plano não existe", async () => {
    mocks.subscriptionPlansRepository.findById.mockResolvedValue(null);
    await expect(
      subscriptionPlansService.updatePlan("plan-x", { name: "Novo nome" })
    ).rejects.toThrow("PLAN_NOT_FOUND");
  });

  it("bloqueia troca de distribuidoras sem gateway MP configurado", async () => {
    mocks.subscriptionPlansRepository.findById.mockResolvedValue(rawPlan());
    mocks.distributorGatewayService.findMissingGatewayIds.mockResolvedValue(["dist-2"]);

    await expect(
      subscriptionPlansService.updatePlan("plan-1", { distributor_ids: ["dist-2"] })
    ).rejects.toThrow("DISTRIBUTOR_GATEWAY_REQUIRED");
    expect(mocks.subscriptionPlansRepository.update).not.toHaveBeenCalled();
  });

  it("converte valid_from/valid_until para Date só quando informados", async () => {
    mocks.subscriptionPlansRepository.findById.mockResolvedValue(rawPlan());
    mocks.subscriptionPlansRepository.update.mockResolvedValue({ id: "plan-1" });

    await subscriptionPlansService.updatePlan("plan-1", { valid_from: "2026-02-01" });

    expect(mocks.subscriptionPlansRepository.update).toHaveBeenCalledWith(
      "plan-1",
      expect.objectContaining({
        valid_from: new Date("2026-02-01"),
        valid_until: undefined,
      })
    );
  });
});
