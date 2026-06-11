import { describe, expect, it } from "vitest";

import { createOrderSchema } from "./order";

const baseOrderInput = {
  address_id: "7e1d7b55-3f52-4d10-aac3-74387c236904",
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
});
