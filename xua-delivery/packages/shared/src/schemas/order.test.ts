import { describe, expect, it } from "vitest";

import { OrderStatus } from "../enums";
import { createOrderSchema, distributorQueueQuerySchema } from "./order";

const baseOrderInput = {
  address_id: "7e1d7b55-3f52-4d10-aac3-74387c236904",
  distributor_id: "7e1d7b55-3f52-4d10-aac3-74387c236905",
  items: [{ product_id: "7e1d7b55-3f52-4d10-aac3-74387c236906", quantity: 1 }],
  delivery_date: "2026-06-12",
  delivery_window: "morning",
};

describe("createOrderSchema", () => {
  it("aceita pagamento em dinheiro com e sem troco", () => {
    expect(
      createOrderSchema.safeParse({
        ...baseOrderInput,
        payment_method: "cash",
        cash_change_for_cents: 10000,
      }).success
    ).toBe(true);

    expect(
      createOrderSchema.safeParse({
        ...baseOrderInput,
        payment_method: "cash",
        cash_change_for_cents: null,
      }).success
    ).toBe(true);
  });

  it("rejeita troco para pagamentos online", () => {
    const result = createOrderSchema.safeParse({
      ...baseOrderInput,
      payment_method: "pix",
      cash_change_for_cents: 10000,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["cash_change_for_cents"] }),
        ])
      );
    }
  });

  it("aceita delivery_instructions e remove espaços nas bordas", () => {
    const result = createOrderSchema.safeParse({
      ...baseOrderInput,
      delivery_instructions: "  Deixar na portaria, código 1234  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.delivery_instructions).toBe("Deixar na portaria, código 1234");
    }
  });

  it("trata delivery_instructions vazio ou ausente como undefined", () => {
    const withoutField = createOrderSchema.safeParse(baseOrderInput);
    expect(withoutField.success).toBe(true);
    if (withoutField.success) {
      expect(withoutField.data.delivery_instructions).toBeUndefined();
    }

    const withEmptyString = createOrderSchema.safeParse({
      ...baseOrderInput,
      delivery_instructions: "   ",
    });
    expect(withEmptyString.success).toBe(true);
    if (withEmptyString.success) {
      expect(withEmptyString.data.delivery_instructions).toBeUndefined();
    }
  });

  it("rejeita delivery_instructions acima de 280 caracteres", () => {
    const result = createOrderSchema.safeParse({
      ...baseOrderInput,
      delivery_instructions: "a".repeat(281),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["delivery_instructions"] }),
        ])
      );
    }
  });
});

describe("distributorQueueQuerySchema", () => {
  it("aplica defaults de paginação e filtros", () => {
    const result = distributorQueueQuerySchema.safeParse({ scope: "distributor" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        scope: "distributor",
        stage: "all",
        origin: "all",
        sort: "created_desc",
        page: 1,
        limit: 20,
      });
    }
  });

  it("aceita filtros válidos da fila operacional", () => {
    const result = distributorQueueQuerySchema.safeParse({
      scope: "distributor",
      stage: "incoming",
      status: OrderStatus.SENT_TO_DISTRIBUTOR,
      q: "  Maria  ",
      origin: "subscription",
      deliveryDate: "2026-06-12",
      driverId: "7e1d7b55-3f52-4d10-aac3-74387c236904",
      sort: "delivery_asc",
      page: "2",
      limit: "50",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        stage: "incoming",
        status: OrderStatus.SENT_TO_DISTRIBUTOR,
        q: "Maria",
        origin: "subscription",
        deliveryDate: "2026-06-12",
        driverId: "7e1d7b55-3f52-4d10-aac3-74387c236904",
        sort: "delivery_asc",
        page: 2,
        limit: 50,
      });
    }
  });

  it("rejeita stage inexistente e status fora da fila ativa/histórico", () => {
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", stage: "done" }).success).toBe(false);
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", status: OrderStatus.PICKING }).success).toBe(false);
  });

  it("aceita stage history e status terminal (pedidos finalizados)", () => {
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", stage: "history" }).success).toBe(true);
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", status: OrderStatus.DELIVERED }).success).toBe(true);
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", status: OrderStatus.CANCELLED }).success).toBe(true);
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", status: OrderStatus.REJECTED_BY_DISTRIBUTOR }).success).toBe(true);
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", status: OrderStatus.DELIVERY_FAILED }).success).toBe(true);
  });

  it("rejeita limite acima do máximo e busca curta", () => {
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", limit: "51" }).success).toBe(false);
    expect(distributorQueueQuerySchema.safeParse({ scope: "distributor", q: "a" }).success).toBe(false);
  });

  it("rejeita deliveryDate combinado com start/end", () => {
    const result = distributorQueueQuerySchema.safeParse({
      scope: "distributor",
      deliveryDate: "2026-06-12",
      start: "2026-06-01",
      end: "2026-06-30",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["deliveryDate"] }),
        ])
      );
    }
  });

  it("rejeita intervalo invertido", () => {
    const result = distributorQueueQuerySchema.safeParse({
      scope: "distributor",
      start: "2026-06-30",
      end: "2026-06-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ["end"] }),
        ])
      );
    }
  });
});
