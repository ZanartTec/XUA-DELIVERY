import { describe, it, expect } from "vitest";

/**
 * Testa a máquina de estados de pedidos.
 * As transições são validadas pela função assertTransition() do OrderService.
 * Aqui testamos a lógica de forma isolada replicando o map.
 */

// Réplica do VALID_TRANSITIONS para teste unitário puro (sem dependências externas)
const VALID_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SENT_TO_DISTRIBUTOR", "CANCELLED"],
  SENT_TO_DISTRIBUTOR: ["ACCEPTED_BY_DISTRIBUTOR", "REJECTED_BY_DISTRIBUTOR", "CANCELLED"],
  ACCEPTED_BY_DISTRIBUTOR: ["READY_FOR_DISPATCH", "CANCELLED"],
  REJECTED_BY_DISTRIBUTOR: [],
  READY_FOR_DISPATCH: ["OUT_FOR_DELIVERY", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED", "CANCELLED"],
  DELIVERED: [],
  DELIVERY_FAILED: ["REDELIVERY_SCHEDULED", "CANCELLED"],
  REDELIVERY_SCHEDULED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  CANCELLED: [],
};

function assertTransition(current: string, next: string): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    throw new Error(`INVALID_TRANSITION: ${current} → ${next}`);
  }
}

describe("Order State Machine", () => {
  describe("transições válidas", () => {
    const validCases: [string, string][] = [
      ["CREATED", "PAYMENT_PENDING"],
      ["CREATED", "CANCELLED"],
      ["PAYMENT_PENDING", "CONFIRMED"],
      ["CONFIRMED", "SENT_TO_DISTRIBUTOR"],
      ["SENT_TO_DISTRIBUTOR", "ACCEPTED_BY_DISTRIBUTOR"],
      ["SENT_TO_DISTRIBUTOR", "REJECTED_BY_DISTRIBUTOR"],
      ["ACCEPTED_BY_DISTRIBUTOR", "READY_FOR_DISPATCH"],
      ["READY_FOR_DISPATCH", "OUT_FOR_DELIVERY"],
      ["OUT_FOR_DELIVERY", "DELIVERED"],
      ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
      ["DELIVERY_FAILED", "REDELIVERY_SCHEDULED"],
      ["REDELIVERY_SCHEDULED", "OUT_FOR_DELIVERY"],
    ];

    it.each(validCases)("%s → %s deve ser permitido", (from, to) => {
      expect(() => assertTransition(from, to)).not.toThrow();
    });
  });

  describe("transições inválidas", () => {
    const invalidCases: [string, string][] = [
      ["CREATED", "DELIVERED"],
      ["CREATED", "OUT_FOR_DELIVERY"],
      ["DELIVERED", "CANCELLED"],
      ["DELIVERED", "CREATED"],
      ["CANCELLED", "CREATED"],
      ["CANCELLED", "DELIVERED"],
      ["PAYMENT_PENDING", "OUT_FOR_DELIVERY"],
      ["REJECTED_BY_DISTRIBUTOR", "ACCEPTED_BY_DISTRIBUTOR"],
      ["OUT_FOR_DELIVERY", "CREATED"],
    ];

    it.each(invalidCases)("%s → %s deve ser bloqueado", (from, to) => {
      expect(() => assertTransition(from, to)).toThrow("INVALID_TRANSITION");
    });
  });

  describe("estados terminais", () => {
    it("DELIVERED não permite nenhuma transição", () => {
      expect(VALID_TRANSITIONS["DELIVERED"]).toHaveLength(0);
    });

    it("CANCELLED não permite nenhuma transição", () => {
      expect(VALID_TRANSITIONS["CANCELLED"]).toHaveLength(0);
    });

    it("REJECTED_BY_DISTRIBUTOR não permite nenhuma transição", () => {
      expect(VALID_TRANSITIONS["REJECTED_BY_DISTRIBUTOR"]).toHaveLength(0);
    });
  });

  describe("todos os estados podem cancelar (exceto terminais)", () => {
    const cancellableStates = [
      "CREATED",
      "PAYMENT_PENDING",
      "CONFIRMED",
      "SENT_TO_DISTRIBUTOR",
      "ACCEPTED_BY_DISTRIBUTOR",
      "READY_FOR_DISPATCH",
      "OUT_FOR_DELIVERY",
      "DELIVERY_FAILED",
      "REDELIVERY_SCHEDULED",
    ];

    it.each(cancellableStates)("%s pode ir para CANCELLED", (from) => {
      expect(VALID_TRANSITIONS[from]).toContain("CANCELLED");
    });
  });

  describe("fluxo completo (happy path)", () => {
    it("percorre todos os estados do fluxo normal", () => {
      const happyPath = [
        "CREATED",
        "PAYMENT_PENDING",
        "CONFIRMED",
        "SENT_TO_DISTRIBUTOR",
        "ACCEPTED_BY_DISTRIBUTOR",
        "READY_FOR_DISPATCH",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ];

      for (let i = 0; i < happyPath.length - 1; i++) {
        expect(() =>
          assertTransition(happyPath[i], happyPath[i + 1])
        ).not.toThrow();
      }
    });
  });
});
