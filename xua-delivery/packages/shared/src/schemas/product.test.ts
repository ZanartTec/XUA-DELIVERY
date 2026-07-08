import { describe, expect, it } from "vitest";
import { productCreateSchema, productUpdateSchema } from "./product";

describe("productCreateSchema — caução financeira v1 removida", () => {
  it("ignora deposit_cents enviado por clientes antigos (strip, sem erro)", () => {
    const parsed = productCreateSchema.parse({
      name: "Água 20L",
      price_cents: 1500,
      deposit_cents: 3000,
    });

    expect(parsed).not.toHaveProperty("deposit_cents");
    expect(parsed.price_cents).toBe(1500);
  });
});

describe("productUpdateSchema — caução financeira v1 removida", () => {
  it("ignora deposit_cents enviado por clientes antigos (strip, sem erro)", () => {
    const parsed = productUpdateSchema.parse({
      price_cents: 2000,
      deposit_cents: 500,
    });

    expect(parsed).not.toHaveProperty("deposit_cents");
    expect(parsed.price_cents).toBe(2000);
  });
});
