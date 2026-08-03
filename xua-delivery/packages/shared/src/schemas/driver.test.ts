import { describe, expect, it } from "vitest";
import { driverCreateSchema, driverUpdateSchema } from "./driver";

describe("driverCreateSchema", () => {
  it("aceita payload minimo sem distributor_id (preenchido pelo service quando distributor_admin)", () => {
    const parsed = driverCreateSchema.safeParse({
      name: "Motorista 1",
      email: "motorista1@xua.test",
      password: "senha1234",
    });
    expect(parsed.success).toBe(true);
  });

  it("aceita distributor_id quando informado (obrigatorio apenas para ops, validado no service)", () => {
    const parsed = driverCreateSchema.safeParse({
      name: "Motorista 1",
      email: "motorista1@xua.test",
      password: "senha1234",
      distributor_id: "7e1d7b55-3f52-4d10-aac3-74387c236401",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita senha menor que 8 caracteres", () => {
    const parsed = driverCreateSchema.safeParse({
      name: "Motorista 1",
      email: "motorista1@xua.test",
      password: "1234567",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita e-mail invalido", () => {
    const parsed = driverCreateSchema.safeParse({
      name: "Motorista 1",
      email: "nao-e-email",
      password: "senha1234",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("driverUpdateSchema", () => {
  it("aceita atualizacao parcial contendo apenas is_active", () => {
    const parsed = driverUpdateSchema.parse({ is_active: false });
    expect(parsed).toEqual({ is_active: false });
  });

  it("aceita objeto vazio", () => {
    const parsed = driverUpdateSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });
});
